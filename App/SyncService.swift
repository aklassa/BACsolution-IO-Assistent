import Foundation
import Security
import Combine

enum TokenStore {
    private static let key = "de.bacsolution.io.prototype.sync"
    static func read() -> String {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: key, kSecAttrAccount as String: "workspace",
            kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let bytes = result as? Data else { return "" }
        return String(data: bytes, encoding: .utf8) ?? ""
    }
    static func save(_ text: String) throws {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: key, kSecAttrAccount as String: "workspace"]
        if text.isEmpty { SecItemDelete(query as CFDictionary); return }
        let value: [String: Any] = [kSecValueData as String: Data(text.utf8),
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        let status = SecItemUpdate(query as CFDictionary, value as CFDictionary)
        if status == errSecItemNotFound {
            var insert = query; value.forEach { insert[$0.key] = $0.value }
            guard SecItemAdd(insert as CFDictionary, nil) == errSecSuccess else { throw AppFailure("Zugangsschlüssel konnte nicht gespeichert werden.") }
        } else if status != errSecSuccess { throw AppFailure("Zugangsschlüssel konnte nicht aktualisiert werden.") }
    }
}
private final class NoRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
@MainActor final class SyncService: ObservableObject {
    @Published private(set) var busy = false
    @Published private(set) var status = "Gemeinsamer Speicher noch nicht eingerichtet"
    private let session = URLSession(configuration: .ephemeral, delegate: NoRedirects(), delegateQueue: nil)
    static func checkedURL(_ raw: String) throws -> URL {
        guard let c = URLComponents(string: raw.trimmingCharacters(in: .whitespacesAndNewlines)),
              c.scheme == "https", c.host != nil, c.user == nil, c.password == nil,
              c.query == nil, c.fragment == nil, c.path.isEmpty || c.path == "/",
              let url = c.url else { throw AppFailure("Für den gemeinsamen Speicher eine HTTPS-Adresse ohne Pfad eingeben.") }
        return url
    }
    private func request(_ base: URL, _ path: String, token: String, body: Data? = nil) async throws -> (Data, Int) {
        let url = base.appendingPathComponent(path)
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
        request.httpMethod = body == nil ? "GET" : "POST"
        request.httpBody = body
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("1", forHTTPHeaderField: "X-BACsolution-Schema")
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw AppFailure("Speicher antwortet nicht.") }
        guard [200, 409].contains(http.statusCode), data.count <= 20_000_000 else {
            throw AppFailure("Abgleich fehlgeschlagen (HTTP \(http.statusCode)). Lokale Daten bleiben erhalten.")
        }
        return (data, http.statusCode)
    }
    private func state(_ base: URL, token: String, engine: LanguageEngine) async throws -> ServerState {
        let (bytes, code) = try await request(base, "v1/state", token: token)
        guard code == 200 else { throw AppFailure("Gemeinsamer Speicher meldet einen Konflikt.") }
        let state = try JSONDecoder().decode(ServerState.self, from: bytes)
        guard !state.workspaceID.isEmpty, Set(state.documents.map(\.id)).count == state.documents.count,
              Set(state.results.map(\.id)).count == state.results.count else { throw AppFailure("Abgleichdaten ungültig.") }
        for document in state.documents {
            try ProjectStore.validate(document)
            if document.kind == "vocabulary" {
                let v = try JSON.decode(Vocabulary.self, document.payload)
                _ = try engine.call("validateTerms", ["terms": JSON.object(v.terms)])
            }
        }
        guard state.results.allSatisfy({ $0.serverStoredAt != nil && $0.controllerState == "verified" && ["testState", "testComment"].contains($0.prop) }) else {
            throw AppFailure("Prüfhistorie ist unvollständig.")
        }
        return state
    }
    func sync(store: ProjectStore, engine: LanguageEngine) async {
        guard !busy else { return }
        busy = true; defer { busy = false }
        status = "Abgleich läuft …"
        do {
            let base = try Self.checkedURL(store.data.serverURL)
            let token = TokenStore.read()
            guard !token.isEmpty else { throw AppFailure("Zugangsschlüssel für den gemeinsamen Speicher fehlt.") }
            let initial = try await state(base, token: token, engine: engine)
            if let id = store.data.serverID, id != initial.workspaceID {
                throw AppFailure("Diese Adresse gehört zu einem anderen gemeinsamen Speicher. Kein Upload durchgeführt.")
            }
            try store.update { $0.serverID = initial.workspaceID }
            var blocked = Set(store.data.conflicts.map(\.id))
            // Immutable mutation IDs survive timeouts and app restarts. Retrying is idempotent.
            for mutation in store.data.outbox {
                if blocked.contains(mutation.documentID) { continue }
                let (bytes, code) = try await request(base, "v1/documents", token: token, body: JSONEncoder().encode(mutation))
                if code == 409 {
                    struct ConflictReply: Decodable { let current: SharedDocument }
                    let remote = try JSONDecoder().decode(ConflictReply.self, from: bytes).current
                    try ProjectStore.validate(remote)
                    if remote.kind == "vocabulary" {
                        let vocabulary = try JSON.decode(Vocabulary.self, remote.payload)
                        _ = try engine.call("validateTerms", ["terms": JSON.object(vocabulary.terms)])
                    }
                    guard remote.id == mutation.documentID else { throw AppFailure("Konfliktzuordnung ungültig.") }
                    try store.update { db in db.conflicts.removeAll { $0.id == remote.id }; db.conflicts.append(SyncConflict(remote: remote)) }
                    blocked.insert(remote.id)
                    continue
                }
                let ack = try JSONDecoder().decode(SharedDocument.self, from: bytes)
                guard ack.id == mutation.documentID, ack.revision == mutation.baseRevision + 1,
                      ack.payload == mutation.payload else { throw AppFailure("Änderung nicht eindeutig bestätigt.") }
                try store.update { $0.outbox.removeAll { $0.id == mutation.id } }
            }
            for event in store.data.results where event.serverStoredAt == nil {
                let (bytes, code) = try await request(base, "v1/results", token: token, body: JSONEncoder().encode(event))
                guard code == 200 else { throw AppFailure("Prüfeintrag widerspricht einem bereits gespeicherten Eintrag.") }
                let ack = try JSONDecoder().decode(Inspection.self, from: bytes)
                var expected = event; expected.serverStoredAt = ack.serverStoredAt
                guard ack.serverStoredAt != nil, ack == expected else { throw AppFailure("Prüfeintrag nicht vollständig bestätigt.") }
                try store.update { db in
                    if let index = db.results.firstIndex(where: { $0.id == event.id }) { db.results[index] = ack }
                }
            }
            let remote = try await state(base, token: token, engine: engine)
            guard remote.workspaceID == initial.workspaceID else { throw AppFailure("Speicheridentität wurde während des Abgleichs geändert.") }
            try store.update { db in
                for document in remote.documents {
                    if db.outbox.contains(where: { $0.documentID == document.id }) { continue }
                    if let local = db.documents.first(where: { $0.id == document.id }), document.revision < local.revision {
                        throw AppFailure("Gemeinsamer Speicher liefert einen älteren Stand. Lokale Daten bleiben erhalten.")
                    }
                    db.documents.removeAll { $0.id == document.id }; db.documents.append(document)
                }
                for event in remote.results {
                    if let local = db.results.first(where: { $0.id == event.id }) {
                        var expected = local; expected.serverStoredAt = event.serverStoredAt
                        guard expected == event else { throw AppFailure("Prüfhistorie enthält einen ID-Konflikt.") }
                    }
                    db.results.removeAll { $0.id == event.id }; db.results.append(event)
                }
                db.lastSyncAt = JSON.now
            }
            status = store.data.conflicts.isEmpty ? "Gemeinsamer Speicher abgeglichen" : "Abgleich abgeschlossen – Konflikte prüfen"
        } catch { status = error.localizedDescription }
    }
}
