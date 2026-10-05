import Foundation

@main struct ControllerConnectionPolicyTests {
    static func main() {
        let first = String(repeating: "A1", count: 32), second = String(repeating: "B2", count: 32)
        func decide(_ saved: String? = nil, trusted: Bool = false, host: String = "controller.test",
                    port: Int = 443, address: String = "https://controller.test",
                    fingerprint: String? = String(repeating: "A1", count: 32)) -> ControllerConnectionPolicy.TrustDecision {
            ControllerConnectionPolicy.trust(origin: address, host: host, port: port,
                fingerprint: fingerprint, savedFingerprint: saved, systemTrusted: trusted)
        }
        func check(_ condition: Bool, _ message: String) {
            guard condition else { fatalError(message) }
        }
        check(decide() == .review, "Unknown private certificate needs a user decision")
        check(decide(trusted: true) == .system, "Valid public certificate uses system validation")
        check(decide(first) == .pinned, "The exact approved certificate can reconnect")
        check(decide(second) == .review, "Changed private certificate needs a new decision")
        check(decide(second, trusted: true) == .review, "Public certificate cannot silently replace a pin")
        check(decide(first, host: "CONTROLLER.test") == .pinned, "Host casing is immaterial")
        check(decide(first, host: "another.test") == .reject, "No cross-host certificate exception")
        check(decide(first, port: 8443) == .reject, "No cross-port certificate exception")
        check(decide(first, port: 8443, address: "https://controller.test:8443") == .pinned, "Explicit custom HTTPS port")
        check(decide(first, address: "http://controller.test") == .reject, "HTTP cannot consume a TLS exception")
        check(decide(first, address: "https://operator:secret@controller.test") == .reject, "Credentials must never occur in origins")
        check(decide(first, address: "https://controller.test?token=abc") == .reject, "Queries cannot occur in origins")
        check(decide(first, address: "https://controller.test/another") == .reject, "Origins cannot contain paths")
        check(decide(first, fingerprint: nil) == .reject, "Missing certificate is rejected")
        check(decide(first, fingerprint: "ABC") == .reject, "Malformed presented fingerprint is rejected")
        check(decide("ABC") == .reject, "Corrupt stored pin does not become implicit system trust")
        print("16 native certificate-policy checks passed")
    }
}
