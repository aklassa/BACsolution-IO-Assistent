import Foundation
import Security

// Kept separate from Station / Project: credentials never enter workspace JSON or sync.
struct ControllerCredentials: Codable {
    var username: String
    var password: String

    func validated() throws -> ControllerCredentials {
        let account = username.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !account.isEmpty, !password.isEmpty else {
            throw AppFailure("Bitte Benutzername und Controller-Passwort eingeben.")
        }
        // Preserve the password exactly, including spaces and non-ASCII characters.
        return ControllerCredentials(username: account, password: password)
    }
}

enum ControllerCredentialStore {
    private static let service = "de.bacsolution.io.assistent.controller-login"

    private static func query(for station: Station) throws -> [String: Any] {
        let origin = try Station.checkedOrigin(station.origin)
        // Bind to both the stable station and its exact origin. A changed address,
        // scheme or port must not silently receive an old controller password.
        let account = try JSONEncoder().encode([station.id, origin]).base64EncodedString()
        return [kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: service,
                kSecAttrAccount as String: account,
                kSecAttrSynchronizable as String: false]
    }

    static func read(for station: Station) throws -> ControllerCredentials? {
        var query = try query(for: station)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let bytes = result as? Data else {
            throw AppFailure("Controller-Zugangsdaten können nicht aus dem Schlüsselbund gelesen werden (\(status)).")
        }
        do { return try JSONDecoder().decode(ControllerCredentials.self, from: bytes).validated() }
        catch { throw AppFailure("Gespeicherte Controller-Zugangsdaten bitte erneut eingeben.") }
    }

    static func save(_ credentials: ControllerCredentials, for station: Station) throws {
        let query = try query(for: station)
        let bytes = try JSONEncoder().encode(credentials.validated())
        let attributes: [String: Any] = [
            kSecValueData as String: bytes,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        var status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var item = query
            attributes.forEach { item[$0.key] = $0.value }
            status = SecItemAdd(item as CFDictionary, nil)
        }
        guard status == errSecSuccess else {
            throw AppFailure("Controller-Zugangsdaten konnten nicht sicher gespeichert werden (\(status)).")
        }
    }

    static func remove(for station: Station) throws {
        let status = SecItemDelete(try query(for: station) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw AppFailure("Controller-Zugangsdaten konnten nicht entfernt werden (\(status)).")
        }
    }
}
