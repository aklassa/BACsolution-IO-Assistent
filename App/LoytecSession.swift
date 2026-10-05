import Foundation
import WebKit
import Combine

private struct ControllerLoginReply: Decodable { let state: String; let message: String? }

@MainActor final class LoytecSession: NSObject, ObservableObject, WKNavigationDelegate {
    @Published private(set) var pageStatus = "Nicht verbunden"
    @Published private(set) var ready = false
    @Published private(set) var loading = false
    @Published private(set) var identityConfirmed = false
    @Published private(set) var controllerProduct = ""
    private(set) var station: Station?
    // WebKit is a transport only. It is never attached to a view/window, so the
    // controller's legacy focus()/select() calls cannot open an iOS web keyboard.
    private var webView: WKWebView
    private let script: String
    private let loginScript: String
    private var credentials: ControllerCredentials?
    private var connectionID = UUID()
    private var pageID = UUID()
    private var loginAttempted = false
    private var ioRedirectAttempted = false
    private var pageTask: Task<Void, Never>?
    private var deadline: Task<Void, Never>?
    private var phase = "Controller-Seite laden"

    private static func makeWebView() -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        // Since newer iOS SDKs, an unattached web view is suspended immediately.
        // This view deliberately has no touch surface, but its login/fetch promises
        // must keep running while the app is in the foreground (iOS 17+ API).
        configuration.preferences.inactiveSchedulingPolicy = .none
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.isUserInteractionEnabled = false
        view.allowsBackForwardNavigationGestures = false
        return view
    }

    override init() {
        webView = Self.makeWebView()
        script = Bundle.main.url(forResource: "ControllerBridge", withExtension: "js")
            .flatMap { try? String(contentsOf: $0, encoding: .utf8) } ?? ""
        loginScript = Bundle.main.url(forResource: "ControllerLogin", withExtension: "js")
            .flatMap { try? String(contentsOf: $0, encoding: .utf8) } ?? ""
        super.init()
        webView.navigationDelegate = self
    }

    func connect(_ station: Station) {
        pageTask?.cancel(); deadline?.cancel()
        connectionID = UUID(); pageID = UUID()
        webView.navigationDelegate = nil
        webView.stopLoading()
        // Isolate cookies even when two stations/projects use the same IP address.
        webView = Self.makeWebView()
        webView.navigationDelegate = self
        self.station = station
        ready = false; identityConfirmed = false; controllerProduct = ""
        credentials = nil; loginAttempted = false; ioRedirectAttempted = false
        do { credentials = try ControllerCredentialStore.read(for: station) }
        catch { stopWithMessage(error.localizedDescription); return }
        loading = true
        phase = "Controller-Seite laden"
        pageStatus = "1/4 · Controller-Seite laden …"
        let connection = connectionID
        deadline = Task { [weak self] in
            do { try await Task.sleep(nanoseconds: 30_000_000_000) } catch { return }
            guard let self, self.connectionID == connection, self.loading else { return }
            self.cancelLogin(message: "Zeitüberschreitung: \(self.phase). Controller-Adresse, WLAN/VPN und Zugriff im iPhone-Browser prüfen. Danach erneut verbinden.")
        }
        loadIOPage()
    }

    private func loadIOPage() {
        guard let station else { return }
        guard let url = URL(string: station.origin + "/webui/liob/iotest") else { loading = false; return }
        webView.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15))
    }
    func openIOPage() { if let station { connect(station) } }
    func confirmIdentity() { if ready { identityConfirmed = true } }

    func cancelLogin(message: String = "Verbindung pausiert. Bei Bedarf erneut verbinden.") {
        guard loading else { return }
        connectionID = UUID(); pageID = UUID()
        pageTask?.cancel(); webView.stopLoading()
        stopWithMessage(message)
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard webView === self.webView else { decisionHandler(.cancel); return }
        guard let origin = station?.origin, let url = action.request.url,
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.user == nil, components.password == nil,
              sameOrigin(url, origin), action.targetFrame?.isMainFrame == true else {
            stopWithMessage("Navigation außerhalb des gewählten Controllers blockiert")
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
        guard webView === self.webView else { return }
        pageID = UUID(); pageTask?.cancel()
        ready = false; identityConfirmed = false; loading = true
    }
    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        guard webView === self.webView else { return }
        phase = "Controller-Seite vollständig laden"
        pageStatus = loginAttempted ? "4/4 · I/O-Testseite wird geladen …" : "1/4 · Controller antwortet. Seite wird geladen …"
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard webView === self.webView else { return }
        phase = "Anmeldeseite prüfen"
        pageStatus = "2/4 · Anmeldestatus prüfen …"
        let connection = connectionID, page = pageID
        pageTask?.cancel()
        pageTask = Task { [weak self] in
            guard let self else { return }
            do {
                let info: ControllerRead = try await self.run(["operation": "info"])
                guard self.isCurrent(connection, page) else { return }
                self.ready = true; self.loading = false; self.credentials = nil
                self.controllerProduct = info.product
                self.pageStatus = "Angemeldet. I/O-Testseite bereit."
                self.deadline?.cancel()
            } catch is CancellationError { return }
            catch {
                guard self.isCurrent(connection, page) else { return }
                await self.authenticateIfNeeded(connection: connection, page: page, readError: error)
            }
        }
    }

    private func isCurrent(_ connection: UUID, _ page: UUID) -> Bool {
        connectionID == connection && pageID == page && !Task.isCancelled
    }

    private func authenticateIfNeeded(connection: UUID, page: UUID, readError: Error) async {
        do {
            let state: ControllerLoginReply = try await evaluate(loginScript, request: ["operation": "inspect"])
            guard isCurrent(connection, page) else { return }
            if state.state == "error" { throw AppFailure(state.message ?? "Controller-Anmeldung konnte nicht geprüft werden.") }
            if state.state == "actionRequired" { stopWithMessage(Self.controllerActionRequired); return }
            if state.state == "authenticated" {
                guard !ioRedirectAttempted else { stopWithMessage(readError.localizedDescription); return }
                ioRedirectAttempted = true; loadIOPage(); return
            }
            guard state.state == "login" else { stopWithMessage(readError.localizedDescription); return }
            guard !loginAttempted else {
                stopWithMessage("Anmeldung nicht bestätigt. Zugangsdaten und Controller-Berechtigungen prüfen."); return
            }
            guard let credentials else {
                stopWithMessage("Bitte die Zugangsdaten für diese Station speichern und verbinden."); return
            }
            // One request per explicit connection. Failure/timeouts never trigger retries.
            loginAttempted = true
            phase = "Gespeicherte Zugangsdaten anmelden"
            pageStatus = "3/4 · Mit gespeicherten Zugangsdaten anmelden …"
            let result: ControllerLoginReply = try await evaluate(loginScript, request: [
                "operation": "authenticate", "username": credentials.username, "password": credentials.password
            ])
            guard isCurrent(connection, page) else { return }
            self.credentials = nil
            if result.state == "error" { throw AppFailure(result.message ?? "Controller-Anmeldung fehlgeschlagen.") }
            guard result.state == "authenticated" else {
                stopWithMessage(Self.controllerActionRequired); return
            }
            ioRedirectAttempted = true
            phase = "I/O-Testseite nach der Anmeldung laden"
            pageStatus = "4/4 · Anmeldung bestätigt. I/O-Testseite laden …"
            loadIOPage()
        } catch is CancellationError { return }
        catch {
            guard isCurrent(connection, page) else { return }
            stopWithMessage(error.localizedDescription)
        }
    }

    private static let controllerActionRequired = "Der Controller verlangt eine Passwortänderung oder Bestätigung. Bitte diese zuerst in seiner Weboberfläche abschließen."

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if webView === self.webView { failed(error) }
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        if webView === self.webView { failed(error) }
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        if webView === self.webView { stopWithMessage("Die Controller-Verbindung wurde beendet. Bitte erneut verbinden.") }
    }
    private func failed(_ error: Error) {
        if (error as NSError).code == NSURLErrorCancelled { return }
        stopWithMessage(error.localizedDescription)
    }
    private func stopWithMessage(_ message: String) {
        pageID = UUID()
        webView.navigationDelegate = nil
        webView.stopLoading()
        loading = false; ready = false; identityConfirmed = false; credentials = nil
        pageTask?.cancel(); deadline?.cancel(); pageStatus = message
        webView.configuration.preferences.inactiveSchedulingPolicy = .suspend
    }

    func setForeground(_ foreground: Bool) {
        webView.configuration.preferences.inactiveSchedulingPolicy = foreground ? .none : .suspend
        if !foreground { cancelLogin(message: "Anmeldung pausiert. In geöffneter App erneut verbinden.") }
    }

    func run<T: Decodable>(_ request: [String: Any]) async throws -> T {
        try await evaluate(script, request: request)
    }
    private func evaluate<T: Decodable>(_ source: String, request: [String: Any]) async throws -> T {
        guard let station, !source.isEmpty else { throw AppFailure("Controller-Verbindung oder Anmelderessource fehlt.") }
        let connection = connectionID, page = pageID
        var args = request; args["origin"] = station.origin
        let value = try await webView.callAsyncJavaScript(source, arguments: ["request": args], in: nil, contentWorld: .page)
        guard isCurrent(connection, page) else { throw CancellationError() }
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
