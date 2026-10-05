import Foundation
import Security
import CryptoKit

struct ControllerCertificate: Codable, Identifiable {
    let stationID: String
    let origin: String
    let fingerprint: String
    let subject: String
    var id: String { fingerprint }
    var formattedFingerprint: String {
        stride(from: 0, to: fingerprint.count, by: 2).map { offset in
            let start = fingerprint.index(fingerprint.startIndex, offsetBy: offset)
            let end = fingerprint.index(start, offsetBy: 2)
            return String(fingerprint[start..<end])
        }.joined(separator: ":")
    }

    static func read(_ trust: SecTrust, station: Station) -> ControllerCertificate? {
        guard let chain = SecTrustCopyCertificateChain(trust) as? [SecCertificate],
              let leaf = chain.first else { return nil }
        let data = SecCertificateCopyData(leaf) as Data
        let fingerprint = SHA256.hash(data: data).map { String(format: "%02X", $0) }.joined()
        let subject = (SecCertificateCopySubjectSummary(leaf) as String?) ?? "Ohne Zertifikatsnamen"
        return ControllerCertificate(stationID: station.id, origin: station.origin,
                                     fingerprint: fingerprint, subject: subject)
    }
}

enum ControllerTrustStore {
    private static func query(for station: Station) throws -> [String: Any] {
        let account = try JSONEncoder().encode([station.id, Station.checkedOrigin(station.origin)]).base64EncodedString()
        return [kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: "de.bacsolution.io.assistent.controller-certificate",
                kSecAttrAccount as String: account, kSecAttrSynchronizable as String: false]
    }

    static func read(for station: Station) throws -> ControllerCertificate? {
        var request = try query(for: station)
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data,
              let certificate = try? JSONDecoder().decode(ControllerCertificate.self, from: data),
              certificate.stationID == station.id, certificate.origin == station.origin,
              ControllerConnectionPolicy.validFingerprint(certificate.fingerprint) else {
            throw AppFailure("Gespeicherte Zertifikatsfreigabe konnte nicht gelesen werden (\(status)).")
        }
        return certificate
    }

    static func save(_ certificate: ControllerCertificate, for station: Station) throws {
        guard certificate.stationID == station.id, certificate.origin == station.origin,
              URL(string: station.origin)?.scheme == "https",
              ControllerConnectionPolicy.validFingerprint(certificate.fingerprint) else {
            throw AppFailure("Zertifikat gehört nicht zu dieser Station.")
        }
        let query = try query(for: station)
        let attributes: [String: Any] = [
            kSecValueData as String: try JSONEncoder().encode(certificate),
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        var status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var item = query
            attributes.forEach { item[$0.key] = $0.value }
            status = SecItemAdd(item as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw AppFailure("Zertifikatsfreigabe konnte nicht gespeichert werden (\(status)).") }
    }

    static func remove(for station: Station) throws {
        let status = SecItemDelete(try query(for: station) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw AppFailure("Zertifikatsfreigabe konnte nicht entfernt werden (\(status)).")
        }
    }
}
