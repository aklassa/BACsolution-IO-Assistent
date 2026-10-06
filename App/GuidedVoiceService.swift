import Foundation
import Combine

enum VoiceProvider: String, CaseIterable, Identifiable {
    case apple, google, openAI
    var id: String { rawValue }
    var title: String {
        switch self {
        case .apple: return "Apple · auf dem iPhone"
        case .google: return "Google · Gemini Live"
        case .openAI: return "OpenAI · Realtime"
        }
    }
    var consentKey: String? {
        switch self {
        case .apple: return nil
        case .google: return "voiceGoogleAllowed"
        case .openAI: return "voiceCloudAllowed"
        }
    }
}

@MainActor protocol GuidedVoiceClient: AnyObject {
    var objectWillChange: ObservableObjectPublisher { get }
    var active: Bool { get }
    var connected: Bool { get }
    var status: String { get }
    var transcript: String { get }
    var answer: String { get }
    var confirming: Bool { get }
    var confirmationReady: Bool { get }
    var checkingSetup: Bool { get }
    var setupStatus: String { get }
    var idleForObservation: Bool { get }
    var onTool: ((String, [String: Any]) async throws -> [String: Any])? { get set }
    var onUser: ((String) async throws -> [String: Any]?)? { get set }
    var onStopped: (() -> Void)? { get set }
    func start(server: String, token: String, configuration: [String: Any], context: [String: Any]) async
    func stop(_ message: String)
    func submit(_ text: String)
    func announce(_ data: [String: Any]) -> Bool
    func clearConfirmation()
    func checkSetup(server: String, token: String) async
    func resetSetupCheck()
}
extension RealtimeService: GuidedVoiceClient {}

// One active client only. Switching invalidates its tasks before changing the
// routing target, so a delayed old response cannot act through another provider.
@MainActor final class GuidedVoiceService: ObservableObject {
    @Published private(set) var provider: VoiceProvider
    private let apple = AppleVoiceService()
    private let google = GeminiVoiceService()
    private let openAI = RealtimeService()
    private var forwarding = Set<AnyCancellable>()
    var onTool: ((String, [String: Any]) async throws -> [String: Any])?
    var onUser: ((String) async throws -> [String: Any]?)?
    var onStopped: (() -> Void)?

    init() {
        provider = VoiceProvider(rawValue: UserDefaults.standard.string(forKey: "voiceProvider") ?? "") ?? .apple
        for kind in VoiceProvider.allCases {
            let service = client(kind)
            service.objectWillChange.sink { [weak self] _ in
                guard let self, self.provider == kind else { return }; self.objectWillChange.send()
            }.store(in: &forwarding)
            service.onTool = { [weak self] name, args in
                guard let self, self.provider == kind, self.active, !Task.isCancelled, let callback = self.onTool else {
                    throw AppFailure("KI-Sitzung wurde beendet oder gewechselt.")
                }
                return try await callback(name, args)
            }
            service.onUser = { [weak self] text in
                guard let self, self.provider == kind, self.active, !Task.isCancelled else { throw CancellationError() }
                return try await self.onUser?(text)
            }
            service.onStopped = { [weak self] in
                guard let self, self.provider == kind else { return }; self.onStopped?()
            }
        }
    }
    private func client(_ kind: VoiceProvider) -> any GuidedVoiceClient {
        switch kind { case .apple: return apple; case .google: return google; case .openAI: return openAI }
    }
    private var current: any GuidedVoiceClient { client(provider) }
    var active: Bool { current.active }
    var connected: Bool { current.connected }
    var status: String { current.status }
    var transcript: String { current.transcript }
    var answer: String { current.answer }
    var confirming: Bool { current.confirming }
    var confirmationReady: Bool { current.confirmationReady }
    var checkingSetup: Bool { current.checkingSetup }
    var setupStatus: String { current.setupStatus }
    var idleForObservation: Bool { current.idleForObservation }
    func select(_ kind: VoiceProvider) {
        guard kind != provider else { return }
        current.resetSetupCheck(); stop("Anbieter gewechselt. Gespräch bei Bedarf neu starten.")
        provider = kind
        UserDefaults.standard.set(kind.rawValue, forKey: "voiceProvider")
    }
    func start(server: String, token: String, configuration: [String: Any], context: [String: Any]) async {
        await current.start(server: server, token: token, configuration: configuration, context: context)
    }
    func stop(_ message: String = "KI-Gespräch beendet") { current.stop(message) }
    func submit(_ text: String) { current.submit(text) }
    func announce(_ data: [String: Any]) -> Bool { current.announce(data) }
    func clearConfirmation() { current.clearConfirmation() }
    func checkSetup(server: String, token: String) async { await current.checkSetup(server: server, token: token) }
    func resetSetupCheck() { current.resetSetupCheck() }
}

enum VoiceJSON {
    static func encode(_ value: Any) -> String {
        guard let bytes = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]),
              let text = String(data: bytes, encoding: .utf8) else { return "{}" }
        return text
    }
}
