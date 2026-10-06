import Foundation
import AVFoundation
import Combine
import UIKit

private final class GeminiNoRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

@MainActor final class GeminiVoiceService: ObservableObject, GuidedVoiceClient {
    @Published private(set) var active = false
    @Published private(set) var connected = false
    @Published private(set) var status = "Google-Gespräch noch nicht gestartet"
    @Published private(set) var transcript = ""
    @Published private(set) var answer = ""
    @Published private(set) var confirming = false
    @Published private(set) var confirmationReady = false
    @Published private(set) var checkingSetup = false
    @Published private(set) var setupStatus = "Google-Zugang noch nicht geprüft"
    var onTool: ((String, [String: Any]) async throws -> [String: Any])?
    var onUser: ((String) async throws -> [String: Any]?)?
    var onStopped: (() -> Void)?
    private let audio = RealtimeAudio()
    private let local = SpeechService()
    private let network = URLSession(configuration: .ephemeral, delegate: GeminiNoRedirects(), delegateQueue: nil)
    private var socket: URLSessionWebSocketTask?
    private var receiver: Task<Void, Never>?
    private var writer: Task<Void, Never>?
    private var worker: Task<Void, Never>?
    private var deadline: Task<Void, Never>?
    private var handshake: Task<Void, Never>?
    private var actionDeadline: Task<Void, Never>?
    private var confirmationDeadline: Task<Void, Never>?
    private var observers: [NSObjectProtocol] = []
    private var outgoing: [[String: Any]] = []
    private var generation = UUID()
    private var setupGeneration = UUID()
    private var rules: LanguageEngine?
    private var activeCall: String?
    private var handledCalls = Set<String>()
    private var processing = false
    private var responding = false
    private var newAnswer = true
    private var rounds = 0
    private struct Pending { let id: String; let name: String }
    private var pending: Pending?
    var idleForObservation: Bool { connected && !processing && !responding && pending == nil && !confirming && !confirmationReady && audio.queuedBuffers == 0 }

    init() {
        audio.onPCM = { [weak self] bytes in
            guard let self, self.connected, self.pending == nil, !self.confirming else { return }
            self.send(["realtimeInput":["audio":["data":bytes.base64EncodedString(),"mimeType":"audio/pcm;rate=16000"]]])
        }
        audio.onError = { [weak self] message in self?.stop(message) }
        local.allowOnlineRecognition = false
        local.onFinal = { [weak self] text in self?.submit(text) }
        local.onEmpty = { [weak self] in self?.listenForConfirmation() }
        local.onSpeechFinished = { [weak self] in
            guard let self, self.active, self.pending != nil, self.confirming else { return }
            self.confirming = false; self.confirmationReady = true
            self.status = "Kommentar speichern? Bitte Ja oder Nein sagen oder antippen."
            self.listenForConfirmation()
        }
        local.onStopped = { [weak self] _ in
            guard let self, self.active, self.pending != nil else { return }
            if self.confirming { self.stop("Kommentar konnte nicht vollständig vorgelesen werden. Entwurf am Bildschirm prüfen.") }
            else {
                UIApplication.shared.isIdleTimerDisabled = true
                self.status = "Lokale Bestätigung per Sprache nicht verfügbar. Bitte Ja/Nein antippen oder eingeben."
            }
        }
        for name in [AVAudioSession.interruptionNotification, UIApplication.didEnterBackgroundNotification] {
            observers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                Task { @MainActor in if self?.active == true { self?.stop("Google-Gespräch pausiert. Bei Bedarf erneut starten.") } }
            })
        }
        observers.append(NotificationCenter.default.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] notice in
            if notice.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue {
                Task { @MainActor in if self?.active == true { self?.stop("Kopfhörer getrennt. Google-Gespräch pausiert.") } }
            }
        })
    }
    private func listenForConfirmation() {
        let current = generation
        Task { [weak self] in
            guard let self, self.generation == current, self.active, self.pending != nil, self.confirmationReady, !self.processing else { return }
            await self.local.listen()
        }
    }
    func resetSetupCheck() { setupGeneration = UUID(); checkingSetup = false; setupStatus = "Google-Zugang noch nicht geprüft" }
    func checkSetup(server: String, token: String) async {
        guard !checkingSetup, !active else { return }
        resetSetupCheck(); let current = setupGeneration; checkingSetup = true
        setupStatus = "Google-Zugang am eigenen Server prüfen …"
        defer { if current == setupGeneration { checkingSetup = false } }
        do {
            let bytes = try await request(server:server, token:token, path:"status", method:"GET")
            guard current == setupGeneration, !Task.isCancelled else { return }
            struct Info: Decodable { let service: String; let schema: Int; let configured: Bool; let model: String; let maxSeconds: Int }
            let value = try JSONDecoder().decode(Info.self, from:bytes)
            guard value.service == "bacsolution-google-voice", value.schema == 1, (60...600).contains(value.maxSeconds),
                  !value.configured || Self.validModel(value.model) else { throw AppFailure("Server unterstützt diesen Google-Zugang noch nicht. Server aktualisieren.") }
            setupStatus = value.configured ? "Google-Schlüssel am Server hinterlegt. Modell: \(value.model). Gültigkeit und Kontingent werden beim Gesprächsstart geprüft." : "Am Server fehlt GEMINI_API_KEY. Google-Schlüssel dort hinterlegen und Dienst neu starten."
        } catch {
            guard current == setupGeneration, !Task.isCancelled else { return }
            setupStatus = (error as? AppFailure)?.message ?? "Server nicht erreichbar oder Antwort ungültig. HTTPS-Adresse und Verbindung prüfen."
        }
    }
    private static func validModel(_ value: String) -> Bool { value.range(of:"^gemini-[a-zA-Z0-9._-]{1,72}$", options:.regularExpression) != nil }
    private func request(server: String, token: String, path: String, method: String) async throws -> Data {
        guard !token.isEmpty else { throw AppFailure("Zugangsschlüssel des eigenen KI-Servers fehlt.") }
        let base = try SyncService.checkedURL(server)
        var request = URLRequest(url:base.appendingPathComponent("v1/voice/google/" + path), cachePolicy:.reloadIgnoringLocalCacheData, timeoutInterval:15)
        request.httpMethod = method
        request.setValue("Bearer " + token, forHTTPHeaderField:"Authorization")
        request.setValue("1", forHTTPHeaderField:"X-BACsolution-Schema")
        if method == "POST" { request.httpBody = Data("{}".utf8); request.setValue("application/json", forHTTPHeaderField:"Content-Type") }
        let (bytes, response) = try await network.data(for:request)
        guard bytes.count < 20_000, let http = response as? HTTPURLResponse else { throw AppFailure("Google-Zugangsserver antwortet ungültig.") }
        switch http.statusCode {
        case 200: return bytes
        case 401,403: throw AppFailure("Der eigene Server weist den Zugangsschlüssel ab.")
        case 404: throw AppFailure("Google-Endpunkt fehlt. Eigenen KI-/Abgleichserver mit diesem Update aktualisieren.")
        case 429: throw AppFailure("Google-Kontingent oder Sitzungslimit erreicht. Später erneut starten.")
        case 503: throw AppFailure("GEMINI_API_KEY am eigenen Server hinterlegen und Dienst neu starten.")
        case 502: throw AppFailure("Google-Zugang nicht verfügbar. API-Schlüssel, Kontingent und Modellfreigabe am Server prüfen.")
        default: throw AppFailure("KI-Server antwortet mit HTTP \(http.statusCode).")
        }
    }
    func start(server: String, token: String, configuration: [String: Any], context: [String: Any]) async {
        guard !active else { return }
        stop(); active = true; transcript = ""; answer = ""; status = "Google-Verbindung wird hergestellt …"
        let current = generation
        do {
            rules = try LanguageEngine()
            let allowed = await withCheckedContinuation { continuation in AVAudioSession.sharedInstance().requestRecordPermission { continuation.resume(returning:$0) } }
            guard current == generation, active else { return }
            guard allowed, UIApplication.shared.applicationState == .active else { throw AppFailure("Mikrofon erlauben und App geöffnet lassen.") }
            let bytes = try await request(server:server,token:token,path:"session",method:"POST")
            guard current == generation, active else { return }
            struct Ticket: Decodable { let secret: String; let model: String; let expiresAt: Double; let maxSeconds: Int; let provider: String; let apiVersion: String }
            let ticket = try JSONDecoder().decode(Ticket.self,from:bytes)
            guard ticket.provider == "google", ticket.apiVersion == "v1beta", Self.validModel(ticket.model),
                  ticket.secret.range(of:"^auth_tokens/[^\\s]{1,10000}$",options:.regularExpression) != nil,
                  ticket.expiresAt > Date().timeIntervalSince1970, (60...600).contains(ticket.maxSeconds) else { throw AppFailure("Google-Sitzungsfreigabe ungültig oder abgelaufen.") }
            guard let setup = try rules?.call("googleVoiceSetup",["model":ticket.model,"context":context]) as? [String: Any] else { throw AppFailure("Google-Prüffunktionen fehlen.") }
            var connection = URLRequest(url:URL(string:"wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained")!)
            connection.setValue("Token " + ticket.secret,forHTTPHeaderField:"Authorization")
            let socket = network.webSocketTask(with:connection); socket.maximumMessageSize = 1_000_000
            self.socket = socket; socket.resume(); send(setup)
            UIApplication.shared.isIdleTimerDisabled = true
            receiver = Task { [weak self] in
                do {
                    while !Task.isCancelled {
                        let message = try await socket.receive()
                        guard let self, self.generation == current else { return }
                        let data: Data
                        switch message { case .string(let value): data = Data(value.utf8); case .data(let value): data = value; @unknown default: continue }
                        guard let event = try JSONSerialization.jsonObject(with:data) as? [String: Any] else { throw AppFailure("Google-Antwort ungültig.") }
                        try self.receive(event)
                    }
                } catch {
                    guard let self, self.generation == current, self.active else { return }
                    self.stop("Google-Verbindung beendet. Entwürfe bleiben erhalten. Zugang und Kontingent prüfen; bei Bedarf erneut starten.")
                }
            }
            handshake = Task { [weak self] in
                do { try await Task.sleep(nanoseconds:20_000_000_000) } catch { return }
                if self?.generation == current, self?.connected == false { self?.stop("Google hat nicht rechtzeitig geantwortet. Modellfreigabe prüfen.") }
            }
            deadline = Task { [weak self] in
                do { try await Task.sleep(nanoseconds:UInt64(ticket.maxSeconds) * 1_000_000_000) } catch { return }
                if self?.generation == current { self?.stop("Google-Testabschnitt beendet. Bei Bedarf erneut starten.") }
            }
        } catch {
            if current == generation { stop((error as? AppFailure)?.message ?? "Google-Verbindung konnte nicht gestartet werden. Serverzugang prüfen.") }
        }
    }
    private func send(_ event: [String: Any]) {
        guard active, let socket else { return }
        guard outgoing.count < 80 else { stop("Verbindung zu langsam. Google-Gespräch pausiert."); return }
        outgoing.append(event)
        guard writer == nil else { return }
        let current = generation
        writer = Task { [weak self] in
            guard let self else { return }
            do {
                while self.generation == current, !self.outgoing.isEmpty {
                    let next = self.outgoing.removeFirst()
                    try await socket.send(.string(VoiceJSON.encode(next)))
                }
                if self.generation == current { self.writer = nil }
            } catch { if self.generation == current { self.stop("Google-Verbindung verloren. Bitte erneut starten.") } }
        }
    }
    private func receive(_ event: [String: Any]) throws {
        if let error = event["error"] as? [String: Any] {
            let code = error["code"] as? Int ?? 0
            stop(code == 429 ? "Google-Kontingent erreicht. Später erneut starten." : "Google weist die Sitzung ab. Server-Schlüssel, Modellfreigabe und API-Version prüfen.")
            return
        }
        if event["goAway"] != nil { stop("Google beendet diesen Gesprächsabschnitt. Entwürfe bleiben erhalten; erneut starten."); return }
        if event["setupComplete"] != nil {
            if !connected { try audio.start(inputSampleRate:16_000); connected = true; handshake?.cancel(); status = "Gemini Live hört zu …" }
            return
        }
        guard connected else { return }
        if let cancelled = event["toolCallCancellation"] as? [String: Any], let ids = cancelled["ids"] as? [String], let activeCall, ids.contains(activeCall) {
            stop("KI-Auftrag wurde unterbrochen. Offenen Entwurf am Bildschirm prüfen."); return
        }
        if let call = event["toolCall"] as? [String: Any], let calls = call["functionCalls"] as? [[String: Any]] { run(calls); return }
        guard let content = event["serverContent"] as? [String: Any], pending == nil else { return }
        if content["interrupted"] as? Bool == true {
            if processing { stop("Prüfauftrag unterbrochen. Entwurf am Bildschirm prüfen."); return }
            _ = audio.interrupt(); responding = false; newAnswer = true; rounds = 0
        }
        // Google transcription events have no reliable final-confirmation flag.
        // They are display-only and NEVER call onUser or approve a write.
        if let input = (content["inputTranscription"] ?? content["interimInputTranscription"]) as? [String: Any], let text = input["text"] as? String {
            transcript = String((transcript + text).suffix(4000)); responding = true
        }
        let parts = (content["modelTurn"] as? [String: Any])?["parts"] as? [[String: Any]] ?? []
        if !parts.isEmpty || content["outputTranscription"] != nil {
            if newAnswer { answer = ""; newAnswer = false }
            responding = true; status = "Gemini antwortet …"
        }
        for part in parts {
            if let inline = part["inlineData"] as? [String: Any], let mime = inline["mimeType"] as? String,
               mime.lowercased().hasPrefix("audio/pcm"), let encoded = inline["data"] as? String, let bytes = Data(base64Encoded:encoded) {
                guard !mime.contains("rate=") || mime.contains("rate=24000") else { throw AppFailure("Google-Audioformat nicht unterstützt.") }
                try audio.play(bytes,item:"gemini")
            }
        }
        if let output = content["outputTranscription"] as? [String: Any], let text = output["text"] as? String { answer = String((answer + text).suffix(8000)) }
        if content["turnComplete"] as? Bool == true { responding = false; newAnswer = true; rounds = 0; status = "Gemini Live hört zu …" }
    }
    private func run(_ calls: [[String: Any]]) {
        rounds += 1
        guard !processing, pending == nil, calls.count == 1, rounds <= 6,
              let call = calls.first, let id = call["id"] as? String, !id.isEmpty, id.count < 200,
              !handledCalls.contains(id), let name = call["name"] as? String,
              call["args"] == nil || call["args"] is [String: Any] else {
            stop("Mehrdeutiger Google-Prüfauftrag. Entwürfe bleiben erhalten."); return
        }
        let args = call["args"] as? [String: Any] ?? [:]
        guard VoiceJSON.encode(args).utf8.count <= 8000 else { stop("Google-Prüfauftrag ist zu groß."); return }
        handledCalls.insert(id)
        if name == "end_conversation", args.isEmpty { stop("Google-Gespräch beendet."); return }
        activeCall = id; processing = true; let current = generation
        armActionDeadline(current)
        worker = Task { [weak self] in
            guard let self else { return }
            do {
                guard let rules = self.rules else { throw AppFailure("Prüfregeln fehlen.") }
                _ = try rules.call("validatedVoiceCall",["name":name,"args":args])
                guard let tool = self.onTool else { throw AppFailure("Prüffunktionen fehlen.") }
                let result = try await tool(name,args)
                guard self.generation == current, self.active, !Task.isCancelled else { return }
                self.processing = false; self.actionDeadline?.cancel()
                if let prompt = result["confirmationPrompt"] as? String {
                    self.pending = Pending(id:id,name:name)
                    self.audio.stop(); self.outgoing.removeAll { $0["realtimeInput"] != nil }
                    self.send(["realtimeInput":["audioStreamEnd":true]])
                    // Keep the function call unanswered while the native app
                    // reads the full proposal and handles a final user decision.
                    self.narrateConfirmation(prompt)
                    self.confirmationDeadline = Task { [weak self] in
                        do { try await Task.sleep(nanoseconds:300_000_000_000) } catch { return }
                        if self?.generation == current, self?.pending != nil { self?.stop("Kommentarbestätigung abgelaufen. Entwurf am Bildschirm prüfen.") }
                    }
                } else {
                    self.activeCall = nil; self.respond(id:id,name:name,result:result)
                }
            } catch {
                guard self.generation == current, self.active, !Task.isCancelled else { return }
                self.processing = false; self.activeCall = nil; self.actionDeadline?.cancel()
                self.respond(id:id,name:name,result:["saved":false,"error":(error as? AppFailure)?.message ?? "Prüfauftrag fehlgeschlagen."])
            }
        }
    }
    private func respond(id: String, name: String, result: [String: Any]) {
        responding = true
        send(["toolResponse":["functionResponses":[["id":id,"name":name,"response":result]]]])
    }
    private func narrateConfirmation(_ text: String) {
        confirming = true; confirmationReady = false; answer = text; status = "Kommentar wird lokal vorgelesen …"
        local.say(text)
    }
    private func armActionDeadline(_ current: UUID) {
        actionDeadline?.cancel()
        actionDeadline = Task { [weak self] in
            do { try await Task.sleep(nanoseconds:45_000_000_000) } catch { return }
            if self?.generation == current, self?.processing == true { self?.stop("Prüfauftrag dauert zu lange. Entwurf am Bildschirm prüfen.") }
        }
    }
    func submit(_ raw: String) {
        let text = raw.trimmingCharacters(in:.whitespacesAndNewlines)
        guard connected, !processing, !confirming, !text.isEmpty else { return }
        guard text.count <= 1200 else { status = "Bitte einen kürzeren Prüfauftrag nennen (höchstens 1200 Zeichen)."; return }
        if pending != nil && !confirmationReady { return }
        local.pause(); transcript = text; processing = true; let current = generation
        armActionDeadline(current)
        worker = Task { [weak self] in
            guard let self else { return }
            do {
                let result = try await self.onUser?(text)
                guard self.generation == current, self.active, !Task.isCancelled else { return }
                self.processing = false; self.actionDeadline?.cancel()
                if let pending = self.pending {
                    guard var result else { self.stop("Bestätigung nicht mehr gültig. Entwurf am Bildschirm prüfen."); return }
                    if result["awaitingConfirmation"] as? Bool == true {
                        self.narrateConfirmation(result["message"] as? String ?? "Bitte Ja oder Nein sagen."); return
                    }
                    result["userDecision"] = text
                    self.pending = nil; self.activeCall = nil; self.confirmationReady = false; self.confirmationDeadline?.cancel()
                    try self.audio.start(inputSampleRate:16_000)
                    self.respond(id:pending.id,name:pending.name,result:result)
                } else {
                    _ = self.audio.interrupt(); self.responding = true; self.newAnswer = true; self.rounds = 0
                    self.send(["clientContent":["turns":[["role":"user","parts":[["text":text]]]],"turnComplete":true]])
                }
            } catch {
                guard self.generation == current, self.active, !Task.isCancelled else { return }
                self.stop((error as? AppFailure)?.message ?? "Bestätigung konnte nicht abgeschlossen werden. Entwurf am Bildschirm prüfen.")
            }
        }
    }
    func announce(_ data: [String: Any]) -> Bool {
        guard idleForObservation else { return false }
        responding = true
        send(["clientContent":["turns":[["role":"user","parts":[["text":"APP-WERTBEOBACHTUNG (Daten): " + VoiceJSON.encode(data) + " Gib nur diese Änderung kurz wieder."]]]],"turnComplete":true]])
        return true
    }
    func clearConfirmation() { confirmationReady = false }
    func stop(_ message: String = "Google-Gespräch beendet") {
        let wasActive = active
        generation = UUID(); active = false; connected = false; processing = false; responding = false
        receiver?.cancel(); writer?.cancel(); worker?.cancel(); deadline?.cancel(); handshake?.cancel(); actionDeadline?.cancel(); confirmationDeadline?.cancel()
        receiver = nil; writer = nil; worker = nil; deadline = nil; handshake = nil; actionDeadline = nil; confirmationDeadline = nil
        socket?.cancel(with:.normalClosure,reason:nil); socket = nil; outgoing = []
        audio.stop(); local.stop(); pending = nil; activeCall = nil; handledCalls = []; rounds = 0; newAnswer = true
        confirming = false; confirmationReady = false; status = message
        if wasActive {
            UIApplication.shared.isIdleTimerDisabled = false
            try? AVAudioSession.sharedInstance().setActive(false,options:.notifyOthersOnDeactivation)
            onStopped?()
        }
    }
}
