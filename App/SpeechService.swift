import AVFoundation
import Speech
import UIKit
import Combine

@MainActor final class SpeechService: NSObject, ObservableObject, AVSpeechSynthesizerDelegate {
    @Published private(set) var listening = false
    @Published private(set) var speaking = false
    @Published private(set) var transcript = ""
    @Published private(set) var status = "Sprachbedienung bereit"
    @Published private(set) var handsFree = false
    @Published var allowOnlineRecognition = false
    private(set) var generation = 0
    var onFinal: ((String) -> Void)?
    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "de-DE"))
    private let engine = AVAudioEngine()
    private let synthesizer = AVSpeechSynthesizer()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var captureID: UUID?
    private var startID: UUID?
    private var tapInstalled = false
    private var silenceTimer: Timer?
    private var deadline: Timer?
    private var utterance: AVSpeechUtterance?
    private var observers: [NSObjectProtocol] = []
    override init() {
        super.init(); synthesizer.delegate = self
        observers.append(NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.stop(message: "Sprachsitzung unterbrochen. Bei Bedarf erneut starten.") }
        })
        observers.append(NotificationCenter.default.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] notification in
            let reason = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt
            if reason == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue {
                Task { @MainActor in self?.stop(message: "Kopfhörer getrennt. Sprachsitzung pausiert.") }
            }
        })
    }
    var routeName: String { AVAudioSession.sharedInstance().currentRoute.outputs.map(\.portName).joined(separator: ", ") }
    func setHandsFree(_ enabled: Bool) async {
        if !enabled { stop(); return }
        handsFree = true
        UIApplication.shared.isIdleTimerDisabled = true
        await listen()
    }
    func listen() async {
        guard !listening, startID == nil else { return }
        cancelSpeech(); cancelCapture(); transcript = ""
        let permissionID = UUID(); startID = permissionID
        defer { if startID == permissionID { startID = nil } }
        let speech = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0) }
        }
        let microphone = await withCheckedContinuation { continuation in
            AVAudioSession.sharedInstance().requestRecordPermission { continuation.resume(returning: $0) }
        }
        guard startID == permissionID, UIApplication.shared.applicationState != .background else { return }
        guard speech == .authorized, microphone else { stop(message: "Mikrofon und Spracherkennung in den iPhone-Einstellungen erlauben."); return }
        guard let recognizer, recognizer.isAvailable else { stop(message: "Deutsche Spracherkennung ist derzeit nicht verfügbar."); return }
        guard allowOnlineRecognition || recognizer.supportsOnDeviceRecognition else {
            stop(message: "Dieses Gerät bietet derzeit keine lokale deutsche Spracherkennung. Texteingabe verwenden oder Online-Erkennung erlauben."); return
        }
        do {
            let session = AVAudioSession.sharedInstance()
            // .allowBluetooth supports HFP microphone/headsets on the iOS 17 deployment target.
            try session.setCategory(.playAndRecord, mode: .default, options: [.allowBluetooth, .defaultToSpeaker])
            try session.setActive(true)
            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            request.requiresOnDeviceRecognition = !allowOnlineRecognition
            request.taskHint = .dictation
            self.request = request
            let id = UUID(); captureID = id
            let input = engine.inputNode, format = input.outputFormat(forBus: 0)
            guard format.sampleRate > 0, format.channelCount > 0 else { throw AppFailure("Kein Mikrofoneingang verfügbar.") }
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in request.append(buffer) }
            tapInstalled = true
            recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
                let text = result?.bestTranscription.formattedString
                let final = result?.isFinal == true
                Task { @MainActor in
                    guard let self, self.captureID == id else { return }
                    if let text {
                        self.transcript = text
                        if final {
                            self.cancelCapture(); self.status = "Befehl auswerten"
                            if !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { self.onFinal?(text) }
                            else { self.resumeIfNeeded() }
                            return
                        }
                        self.silenceTimer?.invalidate()
                        self.silenceTimer = Timer.scheduledTimer(withTimeInterval: 1.4, repeats: false) { [weak self] _ in
                            Task { @MainActor in self?.finishCapture() }
                        }
                    }
                    if let error { self.stop(message: "Spracherkennung beendet: \(error.localizedDescription)") }
                }
            }
            engine.prepare(); try engine.start()
            listening = true; status = "Ich höre zu …"
            deadline = Timer.scheduledTimer(withTimeInterval: 45, repeats: false) { [weak self] _ in
                Task { @MainActor in self?.finishCapture() }
            }
        } catch { stop(message: error.localizedDescription) }
    }
    func finishCapture() {
        guard captureID != nil else { return }
        silenceTimer?.invalidate(); deadline?.invalidate()
        stopEngine(); request?.endAudio(); listening = false; status = "Sprache wird abgeschlossen …"
        // Partial hypotheses are display-only. Never execute a save from a partial result.
        deadline = Timer.scheduledTimer(withTimeInterval: 5, repeats: false) { [weak self] _ in
            Task { @MainActor in self?.stop(message: "Kein abschließendes Sprachergebnis. Bitte erneut sprechen.") }
        }
    }
    private func stopEngine() {
        if engine.isRunning { engine.stop() }
        if tapInstalled { engine.inputNode.removeTap(onBus: 0); tapInstalled = false }
    }
    private func cancelCapture() {
        captureID = nil; silenceTimer?.invalidate(); deadline?.invalidate()
        stopEngine(); request?.endAudio(); recognitionTask?.cancel()
        request = nil; recognitionTask = nil; listening = false
    }
    private func cancelSpeech() { utterance = nil; speaking = false; synthesizer.stopSpeaking(at: .immediate) }
    func say(_ text: String) {
        guard UIApplication.shared.applicationState != .background else { return }
        startID = nil
        cancelCapture(); cancelSpeech()
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .default, options: [.allowBluetooth, .defaultToSpeaker])
            try session.setActive(true)
            let message = AVSpeechUtterance(string: text)
            message.voice = AVSpeechSynthesisVoice(language: "de-DE")
            message.rate = AVSpeechUtteranceDefaultSpeechRate * 0.92
            utterance = message; speaking = true; status = "Wiedergabe über \(routeName)"
            synthesizer.speak(message)
        } catch { stop(message: "Sprachausgabe nicht verfügbar: \(error.localizedDescription)") }
    }
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        guard self.utterance === utterance else { return }
        self.utterance = nil; speaking = false; status = "Sprachbedienung bereit"; resumeIfNeeded()
    }
    func resumeIfNeeded() {
        if handsFree && !speaking && !listening && captureID == nil { Task { await listen() } }
    }
    func stop(message: String = "Sprachbedienung gestoppt") {
        let ownedAudio = handsFree || listening || speaking || captureID != nil || startID != nil
        generation += 1
        handsFree = false; startID = nil; cancelCapture(); cancelSpeech(); status = message
        if ownedAudio {
            UIApplication.shared.isIdleTimerDisabled = false
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
    }
}
