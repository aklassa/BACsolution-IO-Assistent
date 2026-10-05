import Foundation
import WebKit
import SwiftUI

@MainActor final class LoytecSession: NSObject, ObservableObject, WKNavigationDelegate {
    @Published private(set) var pageStatus = "Nicht verbunden"
    @Published private(set) var ready = false
    @Published private(set) var loading = false
    @Published private(set) var identityConfirmed = false
    private(set) var station: Station?
    let webView: WKWebView
    private let script: String
    override init() {
        let configuration = WKWebViewConfiguration()
        // Session is intentionally transient. Passwords and CSRF tokens stay in WebKit.
        configuration.websiteDataStore = .nonPersistent()
        webView = WKWebView(frame: .zero, configuration: configuration)
        script = Bundle.main.url(forResource: "ControllerBridge", withExtension: "js")
            .flatMap { try? String(contentsOf: $0, encoding: .utf8) } ?? ""
        super.init()
        webView.navigationDelegate = self
        webView.allowsBackForwardNavigationGestures = false
    }
    func connect(_ station: Station) {
        self.station = station; ready = false; loading = true; identityConfirmed = false
        pageStatus = "Controller-Anmeldung öffnen"
        guard let url = URL(string: station.origin + "/webui/liob/iotest") else { loading = false; return }
        webView.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15))
    }
    func openIOPage() { if let station { connect(station) } }
    func confirmIdentity() { if ready { identityConfirmed = true } }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let origin = station?.origin, let url = action.request.url,
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.user == nil, components.password == nil,
              sameOrigin(url, origin), action.targetFrame?.isMainFrame == true else {
            pageStatus = "Navigation außerhalb des gewählten Controllers blockiert"
            decisionHandler(.cancel); return
        }
        decisionHandler(.allow)
    }
    private func sameOrigin(_ url: URL, _ origin: String) -> Bool {
        guard let expected = URL(string: origin) else { return false }
        func port(_ u: URL) -> Int { u.port ?? (u.scheme == "https" ? 443 : 80) }
        return url.scheme == expected.scheme && url.host?.lowercased() == expected.host?.lowercased() && port(url) == port(expected)
    }
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        ready = false; loading = true
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loading = false
        Task { do { let _: ControllerRead = try await run(["operation": "info"]); ready = true; pageStatus = "I/O-Testseite bereit" }
            catch { ready = false; pageStatus = "Anmelden, danach „I/O-Testseite öffnen“ wählen." } }
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { failed(error) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { failed(error) }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { failed(AppFailure("Controller-Seite neu öffnen.")) }
    private func failed(_ error: Error) { loading = false; ready = false; pageStatus = error.localizedDescription }
    func run<T: Decodable>(_ request: [String: Any]) async throws -> T {
        guard let station, !script.isEmpty else { throw AppFailure("Zuerst Controller verbinden.") }
        var args = request; args["origin"] = station.origin
        let value = try await webView.callAsyncJavaScript(script, arguments: ["request": args], in: nil, contentWorld: .page)
        guard let text = value as? String else { throw AppFailure("Keine verwertbare Controller-Antwort.") }
        return try JSON.decode(T.self, text)
    }
    func readAll() async throws -> [IOPoint] {
        guard identityConfirmed else { throw AppFailure("Zuerst die Stationsidentität auf der Anmeldeseite bestätigen.") }
        let info: ControllerRead = try await run(["operation": "info"])
        var points: [IOPoint] = []
        for bus in info.buses {
            let result: ControllerRead = try await run(["operation": "read", "inst": bus.id])
            guard let busPoints = result.points else { throw AppFailure("Unvollständige Stationsdaten.") }
            points += busPoints
        }
        ready = true
        return points
    }
    func write(_ point: IOPoint, prop: String, value: Any) async throws -> IOPoint {
        guard identityConfirmed else { throw AppFailure("Stationsidentität ist nicht bestätigt.") }
        let result: ControllerWrite = try await run([
            "operation": "write", "inst": point.inst,
            "target": ["dev": point.dev, "objType": point.objType, "objIdx": point.objIdx, "terminal": point.terminal],
            "expected": ["name": point.name, "testState": point.testState, "testDate": point.testDate, "testComment": point.testComment],
            "change": ["prop": prop, "value": value]
        ])
        guard result.verified, result.prop == prop else { throw AppFailure("Speichern nicht bestätigt. Zuerst neu lesen.") }
        return result.point
    }
}

struct ControllerWebView: UIViewRepresentable {
    let session: LoytecSession
    func makeUIView(context: Context) -> WKWebView { session.webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
