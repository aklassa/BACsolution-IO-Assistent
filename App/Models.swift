import Foundation

enum AppVersion {
    static var version: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "Unbekannt" }
    static var build: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "Unbekannt" }
}

struct AppFailure: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

enum JSON {
    static func string<T: Encodable>(_ value: T) throws -> String {
        let data = try JSONEncoder().encode(value)
        guard let text = String(data: data, encoding: .utf8) else { throw AppFailure("Textkodierung fehlgeschlagen.") }
        return text
    }
    static func decode<T: Decodable>(_ type: T.Type, _ text: String) throws -> T {
        try JSONDecoder().decode(type, from: Data(text.utf8))
    }
    static func object<T: Encodable>(_ value: T) throws -> Any {
        try JSONSerialization.jsonObject(with: JSONEncoder().encode(value))
    }
    static var now: String { ISO8601DateFormatter().string(from: Date()) }
}

struct Station: Codable, Identifiable, Equatable {
    var id = UUID().uuidString
    var name: String
    var origin: String
    // User-supplied device serial / cabinet label. An IP address is not identity.
    var identity: String
    var configuration = "1"
    static func checkedOrigin(_ input: String) throws -> String {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let c = URLComponents(string: text), let scheme = c.scheme?.lowercased(),
              ["http", "https"].contains(scheme), let host = c.host, !host.isEmpty,
              c.user == nil, c.password == nil, c.query == nil, c.fragment == nil,
              c.path.isEmpty || c.path == "/", c.port == nil || (1...65535).contains(c.port!) else {
            throw AppFailure("Controller-Adresse als http://Adresse oder https://Adresse eingeben, ohne Pfad oder Zugangsdaten.")
        }
        var origin = URLComponents()
        origin.scheme = scheme; origin.host = host.lowercased()
        if let port = c.port, port != (scheme == "https" ? 443 : 80) { origin.port = port }
        guard let url = origin.url else { throw AppFailure("Controller-Adresse ungültig.") }
        return url.absoluteString
    }
}
struct Project: Codable, Identifiable, Equatable {
    var id = UUID().uuidString
    var name: String
    var stations: [Station] = []
    var documentID: String { "project:\(id)" }
}
struct Term: Codable, Identifiable, Equatable {
    var short: String
    var meaning: String
    var aliases: [String] = []
    var disabled: Bool? = false
    var source: String? = "manual"
    var id: String { short }
}
struct Vocabulary: Codable {
    var format = "bacsolution-io-vocabulary"
    var version = 1
    var terms: [Term] = []
}
struct IOValue: Codable, Equatable { var text: String; var unit: String }
struct IOPoint: Codable, Identifiable, Equatable {
    var key: String
    var inst: Int
    var busName: String
    var dev: Int
    var deviceName: String
    var objType: Int
    var objIdx: Int
    var terminal: String
    var name: String
    var description: String
    var hwType: String
    var path: String
    var value: IOValue
    var mode: String
    var testState: Int
    var testDate: String
    var testComment: String
    var online: Bool
    var receivedAt: String
    var source: String
    var id: String { address }
    var address: String { "\(inst):\(dev):\(objType):\(objIdx)" }
    var statusLabel: String { ["Keine Auswahl", "Nicht getestet", "OK", "Nicht OK"].indices.contains(testState) ? ["Keine Auswahl", "Nicht getestet", "OK", "Nicht OK"][testState] : "Unbekannt" }
    var displayValue: String { online ? "\(value.text) \(value.unit)".trimmingCharacters(in: .whitespaces) : "Gerät offline / unbekannt" }
    func sameAssignment(as other: IOPoint) -> Bool {
        address == other.address && terminal == other.terminal && name == other.name &&
        deviceName == other.deviceName && description == other.description && path == other.path
    }
}
struct Bus: Codable, Identifiable { let id: Int; let name: String }
struct ControllerRead: Decodable {
    let origin: String
    let product: String
    let buses: [Bus]
    let canEdit: Bool
    let points: [IOPoint]?
}
struct ControllerWrite: Decodable { let point: IOPoint; let verified: Bool; let prop: String }
struct SearchResult: Decodable { let matches: [IOPoint]; let approximate: Bool; let reason: String? }

struct Draft: Codable, Identifiable {
    let stationID: String
    var base: IOPoint
    var result: Int?
    var comment: String
    var needsReview = false
    var id: String { "\(stationID):\(base.address)" }
    var changed: Bool { result != nil || comment != base.testComment }
}
struct StationCache: Codable {
    var stationID: String
    var points: [IOPoint]
    var receivedAt: String
}
struct Inspection: Codable, Identifiable, Equatable {
    var id = UUID().uuidString
    var projectID: String
    var stationID: String
    var stationIdentity: String
    var configuration: String
    var point: IOPoint
    var prop: String
    var technician: String
    var deviceID: String
    var recordedAt = JSON.now
    var controllerState = "verified"
    var serverStoredAt: String?
}
struct SharedDocument: Codable, Identifiable, Equatable {
    var id: String
    var kind: String
    var revision: Int
    // JSON string keeps the wire format identical for native and browser clients.
    var payload: String
}
struct Mutation: Codable, Identifiable {
    var id = UUID().uuidString
    var documentID: String
    var kind: String
    var baseRevision: Int
    var payload: String
}
struct SyncConflict: Codable, Identifiable {
    var id: String { remote.id }
    var remote: SharedDocument
}
struct ServerState: Decodable { let workspaceID: String; let documents: [SharedDocument]; let results: [Inspection] }
struct LocalDatabase: Codable {
    var schema = 1
    var deviceID = UUID().uuidString
    var documents: [SharedDocument] = []
    var outbox: [Mutation] = []
    var conflicts: [SyncConflict] = []
    var cache: [StationCache] = []
    var drafts: [Draft] = []
    var results: [Inspection] = []
    var serverURL = ""
    var technician = ""
    var lastSyncAt: String?
    var serverID: String?
}
