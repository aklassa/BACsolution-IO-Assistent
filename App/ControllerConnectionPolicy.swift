import Foundation

// Pure policy, also compiled by the native regression tests on macOS.
enum ControllerConnectionPolicy {
    enum TrustDecision: Equatable { case system, pinned, review, reject }

    static func matches(origin: String, host: String, port: Int) -> Bool {
        guard let url = URLComponents(string: origin), url.scheme == "https",
              url.user == nil, url.password == nil, url.query == nil, url.fragment == nil,
              url.path.isEmpty || url.path == "/" else { return false }
        return url.host?.lowercased() == host.lowercased() && (url.port ?? 443) == port
    }

    static func validFingerprint(_ value: String) -> Bool {
        value.count == 64 && value.allSatisfy { "0123456789ABCDEF".contains($0) }
    }

    static func trust(origin: String, host: String, port: Int, fingerprint: String?,
                      savedFingerprint: String?, systemTrusted: Bool) -> TrustDecision {
        guard matches(origin: origin, host: host, port: port), let fingerprint,
              validFingerprint(fingerprint) else { return .reject }
        // Once a certificate is explicitly pinned, even a different publicly
        // trusted certificate requires a fresh decision for this station.
        if let savedFingerprint {
            guard validFingerprint(savedFingerprint) else { return .reject }
            return savedFingerprint == fingerprint ? .pinned : .review
        }
        return systemTrusted ? .system : .review
    }
}
