import Foundation
import Combine

@MainActor final class ProjectStore: ObservableObject {
    @Published private(set) var data = LocalDatabase()
    @Published private(set) var loadFailure: String?
    private let file: URL
    init() {
        file = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("BACsolution/workspace.json")
        do {
            try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            if FileManager.default.fileExists(atPath: file.path) {
                data = try JSONDecoder().decode(LocalDatabase.self, from: Data(contentsOf: file))
                guard data.schema == 1 else { throw AppFailure("Unbekannter Speicherstand.") }
                // Validate shared documents before presenting or overwriting anything.
                for document in data.documents { try Self.validate(document) }
            }
        } catch { loadFailure = "Gespeicherte Daten können nicht geöffnet werden. Sie bleiben erhalten: \(error.localizedDescription)" }
    }
    static func validate(_ document: SharedDocument) throws {
        guard document.revision >= 0 else { throw AppFailure("Ungültiger Änderungsstand.") }
        if document.kind == "project" {
            let p = try JSON.decode(Project.self, document.payload)
            guard p.documentID == document.id, !p.name.isEmpty,
                  Set(p.stations.map(\.id)).count == p.stations.count else { throw AppFailure("Projektzuordnung ungültig.") }
            for s in p.stations { _ = try Station.checkedOrigin(s.origin) }
        } else if document.kind == "vocabulary", document.id == "vocabulary:global" {
            let v = try JSON.decode(Vocabulary.self, document.payload)
            guard v.format == "bacsolution-io-vocabulary", v.version == 1 else { throw AppFailure("Begriffsliste inkompatibel.") }
        } else { throw AppFailure("Unbekanntes gemeinsames Dokument.") }
    }
    func update(_ body: (inout LocalDatabase) throws -> Void) throws {
        guard loadFailure == nil else { throw AppFailure(loadFailure!) }
        var next = data
        try body(&next)
        let bytes = try JSONEncoder().encode(next)
        try bytes.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        data = next
    }
    var projects: [Project] {
        data.documents.filter { $0.kind == "project" }.compactMap { try? JSON.decode(Project.self, $0.payload) }.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }
    var vocabulary: Vocabulary {
        guard let document = data.documents.first(where: { $0.id == "vocabulary:global" }),
              let value = try? JSON.decode(Vocabulary.self, document.payload) else { return Vocabulary() }
        return value
    }
    func saveProject(_ project: Project) throws {
        try saveDocument(id: project.documentID, kind: "project", payload: JSON.string(project))
    }
    func saveVocabulary(_ vocabulary: Vocabulary) throws {
        try saveDocument(id: "vocabulary:global", kind: "vocabulary", payload: JSON.string(vocabulary))
    }
    private func saveDocument(id: String, kind: String, payload: String) throws {
        try update { db in
            guard !db.conflicts.contains(where: { $0.id == id }) else { throw AppFailure("Zuerst den Abgleichkonflikt dieses Eintrags lösen.") }
            let revision = db.documents.first(where: { $0.id == id })?.revision ?? 0
            let document = SharedDocument(id: id, kind: kind, revision: revision + 1, payload: payload)
            try Self.validate(document)
            db.documents.removeAll { $0.id == id }; db.documents.append(document)
            db.outbox.append(Mutation(documentID: id, kind: kind, baseRevision: revision, payload: payload))
        }
    }
    func putDraft(_ draft: Draft) throws {
        try update { db in db.drafts.removeAll { $0.id == draft.id }; db.drafts.append(draft) }
    }
    func removeDraft(_ id: String) throws { try update { $0.drafts.removeAll { $0.id == id } } }
    func cache(_ points: [IOPoint], stationID: String) throws {
        try update { db in
            db.cache.removeAll { $0.stationID == stationID }
            db.cache.append(StationCache(stationID: stationID, points: points, receivedAt: JSON.now))
        }
    }
    func resolve(_ conflict: SyncConflict, keepLocal: Bool) throws {
        try update { db in
            let local = db.documents.first { $0.id == conflict.id }
            db.outbox.removeAll { $0.documentID == conflict.id }
            db.documents.removeAll { $0.id == conflict.id }
            db.conflicts.removeAll { $0.id == conflict.id }
            if keepLocal, let local {
                let revision = conflict.remote.revision
                db.outbox.append(Mutation(documentID: local.id, kind: local.kind, baseRevision: revision, payload: local.payload))
                db.documents.append(SharedDocument(id: local.id, kind: local.kind, revision: revision + 1, payload: local.payload))
            } else { db.documents.append(conflict.remote) }
        }
    }
}
