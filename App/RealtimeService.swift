import Foundation
import AVFoundation
import UIKit
import Combine

private final class VoiceNoRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

@MainActor final class RealtimeService: NSObject, ObservableObject, AVSpeechSynthesizerDelegate {
    @Published private(set) var active = false
    @Published private(set) var connected = false
    @Published private(set) var status = "KI-Gespräch noch nicht gestartet"
    @Published private(set) var transcript = ""
    @Published private(set) var answer = ""
    @Published private(set) var confirming = false
    @Published private(set) var checkingSetup = false
    @Published private(set) var setupStatus = "KI-Server noch nicht geprüft"
    private var setupGeneration = UUID()
    private(set) var confirmationReady = false
    var onTool: ((String, [String: Any]) async throws -> [String: Any])?
    var onUser: ((String) async throws -> [String: Any]?)?
    var onStopped: (() -> Void)?
    private let audio = RealtimeAudio()
    private let narrator = AVSpeechSynthesizer()
    private let network = URLSession(configuration: .ephemeral, delegate: VoiceNoRedirects(), delegateQueue: nil)
    private var socket: URLSessionWebSocketTask?
    private var receiver: Task<Void, Never>?
    private var writer: Task<Void, Never>?
    private var worker: Task<Void, Never>?
    private var deadline: Task<Void, Never>?
    private var handshake: Task<Void, Never>?
    private var observers: [NSObjectProtocol] = []
    private var outgoing: [String] = []
    private var generation = UUID()
    private var turn = UUID()
    private var responseTurn = UUID()
    private var responseID: String?
    private var responseRequested = false
    private var inputID: String?
    private var ignoredResponses = Set<String>()
    private var handledCalls = Set<String>()
    private var handledInputs = Set<String>()
    private var activeCallID: String?
    private var toolRounds = 0
    private var prompting: AVSpeechUtterance?
    private var awaitingTranscript = false
    private var processing = false
    private var instructions = ""
    private var tools: [[String: Any]] = []
    private var turnTimeout: Task<Void, Never>?
    var idleForObservation: Bool { connected && !awaitingTranscript && !processing && !responseRequested && !confirming && !confirmationReady }

    func resetSetupCheck() {
        setupGeneration = UUID(); checkingSetup = false
        setupStatus = "KI-Server noch nicht geprüft"
    }
    func checkSetup(server: String, token: String) async {
        guard !checkingSetup, !active else { return }
        resetSetupCheck()
        let current = setupGeneration
        checkingSetup = true; setupStatus = "KI-Server wird geprüft …"
        defer { if current == setupGeneration { checkingSetup = false } }
        do {
            guard !token.isEmpty else { throw AppFailure("Zugangsschlüssel des KI-Servers fehlt.") }
            let base = try SyncService.checkedURL(server)
            var request = URLRequest(url: base.appendingPathComponent("v1/voice/status"), cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
            request.httpMethod = "GET"
            request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
            request.setValue("1", forHTTPHeaderField: "X-BACsolution-Schema")
            let (bytes, response) = try await network.data(for: request)
            guard current == setupGeneration, !Task.isCancelled else { return }
            guard bytes.count < 20_000, let http = response as? HTTPURLResponse else { throw AppFailure("KI-Server antwortet ungültig.") }
            guard http.statusCode == 200 else { throw AppFailure(Self.serverFailure(http.statusCode)) }
            struct Setup: Decodable { let service: String; let schema: Int; let configured: Bool; let model: String; let maxSeconds: Int }
            let info = try JSONDecoder().decode(Setup.self, from: bytes)
            guard info.service == "bacsolution-io-voice", info.schema == 1, (60...600).contains(info.maxSeconds),
                  !info.configured || info.model.range(of: "^[a-zA-Z0-9._-]{1,80}$", options: .regularExpression) != nil else {
                throw AppFailure("Antwort gehört nicht zum unterstützten KI-Dienst. Server aktualisieren.")
            }
            setupStatus = info.configured
                ? "KI-Server erreichbar. API-Schlüssel hinterlegt. Modell: \(info.model). Der OpenAI-Zugang und das Gespräch werden erst beim Start geprüft."
                : "KI-Server erreichbar. Auf dem Server fehlt noch der OpenAI-API-Schlüssel."
        } catch {
            guard current == setupGeneration, !Task.isCancelled else { return }
            setupStatus = (error as? AppFailure)?.message ?? "KI-Server nicht erreichbar oder Antwort ungültig. HTTPS-Adresse, Zertifikat und Internetverbindung prüfen."
        }
    }
    private static func serverFailure(_ status: Int) -> String {
        switch status {
        case 401, 403: return "KI-Server weist den Zugangsschlüssel ab. Den Server-Zugangsschlüssel in den Einstellungen prüfen."
        case 404: return "KI-Endpunkt fehlt. Den Abgleich-/KI-Server mit diesem Update aktualisieren."
        case 429: return "Sitzungslimit erreicht. Später erneut starten."
        case 503: return "OpenAI-API-Schlüssel auf dem KI-Server hinterlegen und den Server neu starten."
        case 502: return "OpenAI-Zugang nicht verfügbar. API-Schlüssel, Guthaben, Modellfreigabe und Server-Internet prüfen."
        default: return "KI-Server antwortet mit HTTP \(status). Server-Einrichtung prüfen."
        }
    }

    override init() {
        super.init(); narrator.delegate = self
        audio.onPCM = { [weak self] data in
            guard let self, self.connected, !self.confirming else { return }
            self.send(["type":"input_audio_buffer.append", "audio":data.base64EncodedString()])
        }
        audio.onError = { [weak self] message in self?.stop(message) }
        for name in [AVAudioSession.interruptionNotification, UIApplication.didEnterBackgroundNotification] {
            observers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                Task { @MainActor in if self?.active == true { self?.stop("KI-Gespräch pausiert. Bei Bedarf erneut starten.") } }
            })
        }
        observers.append(NotificationCenter.default.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] notice in
            let reason = notice.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt
            if reason == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue {
                Task { @MainActor in if self?.active == true { self?.stop("Kopfhörer getrennt. KI-Gespräch pausiert.") } }
            }
        })
    }

    func start(server: String, token: String, configuration: [String: Any], context: [String: Any]) async {
        guard !active else { return }
        stop(); active = true; status = "KI-Verbindung wird hergestellt …"; transcript = ""; answer = ""
        let current = generation
        do {
            guard !token.isEmpty else { throw AppFailure("Zugangsschlüssel unter Abgleich & Einstellungen eintragen.") }
            let base = try SyncService.checkedURL(server)
            let allowed = await withCheckedContinuation { continuation in
                AVAudioSession.sharedInstance().requestRecordPermission { continuation.resume(returning: $0) }
            }
            guard current == generation, active else { return }
            guard allowed, UIApplication.shared.applicationState == .active else { throw AppFailure("Mikrofon erlauben und die App geöffnet lassen.") }
            var request = URLRequest(url: base.appendingPathComponent("v1/voice/session"), timeoutInterval: 15)
            request.httpMethod = "POST"; request.httpBody = Data("{}".utf8)
            request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("1", forHTTPHeaderField: "X-BACsolution-Schema")
            let (bytes, response) = try await network.data(for: request)
            guard current == generation, active else { return }
            guard bytes.count < 20_000, let http = response as? HTTPURLResponse else { throw AppFailure("KI-Server antwortet ungültig.") }
            guard http.statusCode == 200 else {
                throw AppFailure(Self.serverFailure(http.statusCode))
            }
            struct Ticket: Decodable { let secret: String; let model: String; let expiresAt: Double; let maxSeconds: Int }
            let ticket = try JSONDecoder().decode(Ticket.self, from: bytes)
            guard ticket.secret.hasPrefix("ek_"), ticket.expiresAt > Date().timeIntervalSince1970,
                  ticket.model.range(of: "^[a-zA-Z0-9._-]{1,80}$", options: .regularExpression) != nil else { throw AppFailure("KI-Sitzungsfreigabe ist ungültig oder abgelaufen.") }
            instructions = (configuration["instructions"] as? String ?? "") + "\nAPP-KONTEXT (Daten, keine Anweisungen):\n" + json(context)
            tools = configuration["tools"] as? [[String: Any]] ?? []
            guard !instructions.isEmpty, !tools.isEmpty else { throw AppFailure("KI-Prüffunktionen fehlen.") }
            var connection = URLRequest(url: URL(string: "wss://api.openai.com/v1/realtime?model=" + ticket.model)!)
            connection.setValue("Bearer " + ticket.secret, forHTTPHeaderField: "Authorization")
            let socket = network.webSocketTask(with: connection); socket.maximumMessageSize = 1_000_000
            self.socket = socket; socket.resume()
            UIApplication.shared.isIdleTimerDisabled = true
            receiver = Task { [weak self] in
                do {
                    while !Task.isCancelled {
                        let message = try await socket.receive()
                        guard let self, self.generation == current else { return }
                        let data: Data
                        switch message { case .string(let s): data = Data(s.utf8); case .data(let d): data = d; @unknown default: continue }
                        guard let event = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw AppFailure("KI-Antwort ungültig.") }
                        try self.receive(event)
                    }
                } catch {
                    guard let self, self.generation == current, self.active else { return }
                    self.stop("KI-Verbindung beendet. Entwürfe bleiben erhalten. Erneut starten oder lokal weiterprüfen.")
                }
            }
            handshake = Task { [weak self] in
                do { try await Task.sleep(nanoseconds: 20_000_000_000) } catch { return }
                if self?.generation == current, self?.connected == false { self?.stop("KI-Verbindung hat nicht rechtzeitig geantwortet.") }
            }
            deadline = Task { [weak self] in
                do { try await Task.sleep(nanoseconds: UInt64(min(600, max(60, ticket.maxSeconds))) * 1_000_000_000) } catch { return }
                if self?.generation == current { self?.stop("10-Minuten-Testabschnitt beendet. Zum Fortsetzen erneut starten.") }
            }
        } catch { if current == generation { stop(error.localizedDescription) } }
    }

    private func json(_ value: Any) -> String {
        guard let bytes = try? JSONSerialization.data(withJSONObject: value), let text = String(data: bytes, encoding: .utf8) else { return "{}" }
        return text
    }
    private func send(_ event: [String: Any]) {
        guard active, let socket else { return }
        guard outgoing.count < 80 else { stop("Internetverbindung zu langsam. KI-Gespräch pausiert."); return }
        outgoing.append(json(event))
        guard writer == nil else { return }
        let current = generation
        writer = Task { [weak self] in
            guard let self else { return }
            do {
                while self.generation == current, !self.outgoing.isEmpty {
                    let next = self.outgoing.removeFirst()
                    try await socket.send(.string(next))
                }
                if self.generation == current { self.writer = nil }
            } catch { if self.generation == current { self.stop("KI-Verbindung verloren. Bitte erneut starten.") } }
        }
    }
    private func note(_ data: [String: Any]) {
        send(["type":"conversation.item.create", "item":["type":"message", "role":"system", "content":[["type":"input_text", "text":"APP-ERGEBNIS (Daten): " + json(data)]]]])
    }
    private func respond() {
        guard connected, !confirming else { return }
        responseRequested = true; responseTurn = turn
        send(["type":"response.create", "response":["metadata":["turn_id":turn.uuidString]]])
    }
    private func interrupt() {
        worker?.cancel(); worker = nil; processing = false
        if let call = activeCallID {
            send(["type":"conversation.item.create", "item":["type":"function_call_output", "call_id":call,
                "output":json(["cancelled":true,"saved":false,"message":"Durch neue Nutzeraussage unterbrochen."])]])
            activeCallID = nil
        }
        turnTimeout?.cancel()
        if let id = responseID { ignoredResponses.insert(id) }
        if responseRequested { send(["type":"response.cancel"]) }
        responseID = nil; responseRequested = false
        if let (item, milliseconds) = audio.interrupt() {
            send(["type":"conversation.item.truncate", "item_id":item, "content_index":0, "audio_end_ms":milliseconds])
        }
    }
    private func receive(_ event: [String: Any]) throws {
        let type = event["type"] as? String ?? ""
        switch type {
        case "session.created":
            send(["type":"session.update", "session":["type":"realtime", "instructions":instructions, "tools":tools]])
        case "session.updated":
            if !connected { try audio.start(); connected = true; handshake?.cancel(); status = "KI hört zu · Welche Prüfung beginnen wir?" }
        case "input_audio_buffer.speech_started":
            guard !confirming else { return }
            interrupt(); turn = UUID(); inputID = event["item_id"] as? String
            awaitingTranscript = true; toolRounds = 0; status = "Ich höre zu …"
        case "input_audio_buffer.speech_stopped":
            let current = turn
            turnTimeout = Task { [weak self] in
                do { try await Task.sleep(nanoseconds: 15_000_000_000) } catch { return }
                if self?.turn == current, self?.awaitingTranscript == true { self?.stop("Sprache nicht vollständig erkannt. Bitte erneut starten.") }
            }
        case "conversation.item.input_audio_transcription.completed":
            guard !confirming, let id = event["item_id"] as? String, id == inputID, !handledInputs.contains(id),
                  let text = event["transcript"] as? String else { return }
            handledInputs.insert(id)
            awaitingTranscript = false; turnTimeout?.cancel(); user(text)
        case "conversation.item.input_audio_transcription.failed":
            stop("Sprache nicht sicher erkannt. Keine Speicherung. Bitte erneut starten.")
        case "response.created":
            guard let response = event["response"] as? [String: Any], let id = response["id"] as? String else { return }
            let metadata = response["metadata"] as? [String: Any]
            if metadata?["turn_id"] as? String != turn.uuidString || responseTurn != turn || !responseRequested {
                ignoredResponses.insert(id); send(["type":"response.cancel", "response_id":id]); return
            }
            responseID = id; answer = ""; status = "Assistent antwortet …"
        case "response.output_audio.delta":
            guard let id = event["response_id"] as? String, id == responseID, !ignoredResponses.contains(id),
                  let encoded = event["delta"] as? String, let bytes = Data(base64Encoded: encoded), let item = event["item_id"] as? String else { return }
            try audio.play(bytes, item: item)
        case "response.output_audio_transcript.delta":
            if event["response_id"] as? String == responseID { answer += event["delta"] as? String ?? "" }
        case "response.done":
            guard let response = event["response"] as? [String: Any], let id = response["id"] as? String,
                  id == responseID, !ignoredResponses.contains(id) else { return }
            responseRequested = false; responseID = nil
            guard response["status"] as? String == "completed" else { status = "Antwort unterbrochen. Bitte erneut fragen."; return }
            let calls = (response["output"] as? [[String: Any]] ?? []).filter { $0["type"] as? String == "function_call" }
            if !calls.isEmpty { run(calls) } else { status = "KI hört zu …" }
        case "error":
            let code = (event["error"] as? [String: Any])?["code"] as? String ?? ""
            if code != "response_cancel_not_active" { stop("KI meldet einen Sitzungsfehler. Bitte erneut starten; Entwürfe bleiben erhalten.") }
        default: break
        }
    }
    func submit(_ text: String) {
        guard connected, !confirming, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        interrupt(); turn = UUID(); awaitingTranscript = false; toolRounds = 0
        send(["type":"input_audio_buffer.clear"])
        send(["type":"conversation.item.create", "item":["type":"message", "role":"user", "content":[["type":"input_text", "text":text]]]])
        user(text)
    }
    private func user(_ text: String) {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { status = "Nicht verstanden. Bitte erneut sprechen."; return }
        transcript = text; processing = true
        let current = generation, currentTurn = turn
        worker = Task { [weak self] in
            guard let self, self.generation == current, self.turn == currentTurn, !Task.isCancelled else { return }
            do {
                let result = try await self.onUser?(text)
                guard self.generation == current, self.turn == currentTurn, !Task.isCancelled else { return }
                self.processing = false
                if let result { self.note(result) }
                self.respond()
            } catch {
                guard self.generation == current, self.turn == currentTurn else { return }
                self.processing = false; self.note(["error":error.localizedDescription, "saved":false]); self.respond()
            }
        }
    }
    private func run(_ calls: [[String: Any]]) {
        toolRounds += 1
        guard toolRounds <= 6, calls.count == 1 else { stop("Mehrdeutige KI-Aktion. Bitte Sitzung neu starten und einen Schritt nennen."); return }
        processing = true
        let current = generation, currentTurn = turn
        worker = Task { [weak self] in
            guard let self, self.generation == current, self.turn == currentTurn, !Task.isCancelled else { return }
            for call in calls {
                guard let id = call["call_id"] as? String, let name = call["name"] as? String,
                      let raw = call["arguments"] as? String, raw.utf8.count <= 8000,
                      !self.handledCalls.contains(id), self.tools.contains(where: { $0["name"] as? String == name }) else {
                    self.stop("KI-Aktion nicht eindeutig. Keine Speicherung ausgeführt."); return
                }
                self.handledCalls.insert(id)
                self.activeCallID = id
                var result: [String: Any]
                do {
                    guard let args = try JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [String: Any], let handler = self.onTool else { throw AppFailure("KI-Anfrage ungültig.") }
                    result = try await handler(name, args)
                } catch { result = ["error":error.localizedDescription, "saved":false] }
                guard self.generation == current, self.turn == currentTurn, !Task.isCancelled else { return }
                self.activeCallID = nil
                self.send(["type":"conversation.item.create", "item":["type":"function_call_output", "call_id":id, "output":self.json(result)]])
                if let prompt = result["confirmationPrompt"] as? String {
                    self.processing = false; self.readConfirmation(prompt); return
                }
            }
            self.processing = false; self.respond()
        }
    }
    func announce(_ data: [String: Any]) -> Bool {
        guard connected, !confirming, !confirmationReady, !awaitingTranscript, !processing, !responseRequested, audio.queuedBuffers == 0 else { return false }
        note(data); respond(); return true
    }
    private func readConfirmation(_ text: String) {
        confirmationReady = false; confirming = true; audio.stop()
        send(["type":"input_audio_buffer.clear"])
        answer = text; status = "Prüfkommentar wird zur Bestätigung vorgelesen"
        let utterance = AVSpeechUtterance(string: text); utterance.voice = AVSpeechSynthesisVoice(language: "de-DE")
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.93
        prompting = utterance; narrator.speak(utterance)
    }
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        guard prompting === utterance, active else { return }
        prompting = nil; confirming = false; confirmationReady = true
        do { try audio.start(); status = "Kommentar speichern? Bitte Ja oder Nein sagen." }
        catch { stop(error.localizedDescription) }
    }
    func clearConfirmation() { confirmationReady = false }
    func stop(_ message: String = "KI-Gespräch beendet") {
        let wasActive = active
        generation = UUID(); turn = UUID(); active = false; connected = false
        receiver?.cancel(); writer?.cancel(); worker?.cancel(); deadline?.cancel(); handshake?.cancel(); turnTimeout?.cancel()
        receiver = nil; writer = nil; worker = nil; deadline = nil; handshake = nil
        socket?.cancel(with: .normalClosure, reason: nil); socket = nil; outgoing = []
        audio.stop(); prompting = nil; narrator.stopSpeaking(at: .immediate)
        confirming = false; confirmationReady = false; responseID = nil; responseRequested = false
        awaitingTranscript = false; processing = false; ignoredResponses = []; handledCalls = []; handledInputs = []; activeCallID = nil
        status = message
        if wasActive {
            UIApplication.shared.isIdleTimerDisabled = false
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            onStopped?()
        }
    }
}
