import Foundation
import WebKit
import Combine
import Network
import Security
import UIKit

private struct ControllerPageDiagnostics: Decodable, Equatable {
    let readyState: String
    let flags: [String: Bool]
    let scriptErrors: Int
    let resourceErrors: Int
    let firstScriptError: String
    let firstScriptSource: String
    let firstResourceSource: String

    var summary: String {
        let fields = ["form", "username", "password", "inputsLinked", "passwordInput", "postForm",
                      "loginContainer", "loginClass", "controllerBrand", "authenticated", "csrf", "passwordAction", "baseFromHTML", "csrfFromHTML", "transportHook"]
        return fields.map { "\($0)=\(flags[$0] == true ? "ja" : "nein")" }.joined(separator: ", ")
    }
}
private struct ControllerLoginReply: Decodable {
    let state: String
    let code: String
    let message: String?
    let diagnostics: ControllerPageDiagnostics?
}
private struct ControllerConnectionError: LocalizedError {
    let code: String
    let message: String
    var errorDescription: String? { message }

    static func describe(_ error: Error) -> ControllerConnectionError {
        if let known = error as? ControllerConnectionError { return known }
        if let known = error as? AppFailure { return Self(code: "connection-check", message: known.message) }
        if error is DecodingError {
            return Self(code: "bridge-response-format", message: "Die Controller-Antwort passt nicht zum erwarteten Datenformat. Verbindungsdiagnose kopieren.")
        }
        let failure = error as NSError
        // Never copy WebKit exception text or userInfo: these may contain page
        // content, URL parameters, account names or response bodies.
        if failure.domain == WKError.errorDomain {
            return Self(code: "webkit-\(failure.code)", message: "Die Controller-Seite konnte in WebKit nicht ausgewertet werden (Code \(failure.code)). Verbindungsdiagnose kopieren.")
        }
        if failure.domain == NSURLErrorDomain {
            return Self(code: "network-\(failure.code)", message: "Die Controller-Seite konnte nicht geladen werden (Netzwerkcode \(failure.code)). Adresse und WLAN/VPN prüfen.")
        }
        return Self(code: "native-\(failure.code)", message: "Die Controller-Verbindung konnte nicht abgeschlossen werden. Verbindungsdiagnose kopieren.")
    }
}

@MainActor final class LoytecSession: NSObject, ObservableObject, WKNavigationDelegate {
    @Published private(set) var pageStatus = "Nicht verbunden"
    @Published private(set) var ready = false
    @Published private(set) var loading = false
    @Published private(set) var identityConfirmed = false
    @Published private(set) var controllerProduct = ""
    @Published private(set) var pendingCertificate: ControllerCertificate?
    @Published private(set) var trustedCertificate: ControllerCertificate?
    @Published private(set) var diagnostics: [String] = []
    @Published private(set) var failureCode: String?
    @Published private(set) var transportView: ControllerTransportWebView
    private(set) var station: Station?
    private var webView: ControllerTransportWebView { transportView }
    private let script: String
    private let loginScript: String
    private var credentials: ControllerCredentials?
    private var connectionID = UUID()
    private var pageID = UUID()
    private var loginAttempted = false
    private var ioRedirectAttempted = false
    private var pageTask: Task<Void, Never>?
    private var deadline: Task<Void, Never>?
    private var probeDeadline: Task<Void, Never>?
    private var probe: NWConnection?
    private var initialLoadPending = false
    private var startedAt = Date()
    private var phase = "Controller-Seite laden"
    private var lastPageDiagnostics: ControllerPageDiagnostics?

    private static func makeWebView() -> ControllerTransportWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.upgradeKnownHostsToHTTPS = false
        if #available(iOS 18.2, *) {
            configuration.defaultWebpagePreferences.preferredHTTPSNavigationPolicy = .keepAsRequested
        }
        configuration.preferences.inactiveSchedulingPolicy = .none
        if let url = Bundle.main.url(forResource: "ControllerTransport", withExtension: "js"),
           let source = try? String(contentsOf: url, encoding: .utf8) {
            configuration.userContentController.addUserScript(WKUserScript(
                source: source, injectionTime: .atDocumentStart, forMainFrameOnly: false, in: .page))
        }
        let view = ControllerTransportWebView(frame: .zero, configuration: configuration)
        view.isUserInteractionEnabled = false
        view.accessibilityElementsHidden = true
        view.allowsBackForwardNavigationGestures = false
        return view
    }

    override init() {
        transportView = Self.makeWebView()
        script = Bundle.main.url(forResource: "ControllerBridge", withExtension: "js")
            .flatMap { try? String(contentsOf: $0, encoding: .utf8) } ?? ""
        loginScript = Bundle.main.url(forResource: "ControllerLogin", withExtension: "js")
            .flatMap { try? String(contentsOf: $0, encoding: .utf8) } ?? ""
        super.init()
        webView.navigationDelegate = self
    }

    func connect(_ station: Station) {
        pageTask?.cancel(); deadline?.cancel(); stopProbe()
        connectionID = UUID(); pageID = UUID()
        initialLoadPending = false
        webView.onWindowAttached = nil
        webView.navigationDelegate = nil
        webView.stopLoading()
        // Isolate cookies even when two stations/projects use the same IP address.
        transportView = Self.makeWebView()
        webView.navigationDelegate = self
        self.station = station
        startedAt = Date(); diagnostics = []; pendingCertificate = nil; trustedCertificate = nil
        failureCode = nil; lastPageDiagnostics = nil; phase = "Controller-Verbindung vorbereiten"
        ready = false; identityConfirmed = false; controllerProduct = ""
        credentials = nil; loginAttempted = false; ioRedirectAttempted = false
        do {
            guard try Station.checkedOrigin(station.origin) == station.origin else { throw AppFailure("Controller-Adresse erneut eingeben.") }
            guard !script.isEmpty, !loginScript.isEmpty,
                  let transportScript = Bundle.main.url(forResource: "ControllerTransport", withExtension: "js"),
                  let transportSource = try? String(contentsOf: transportScript, encoding: .utf8),
                  !transportSource.isEmpty else { throw AppFailure("Controller-Ressourcen fehlen. Bitte die App neu bauen.") }
            credentials = try ControllerCredentialStore.read(for: station)
            trustedCertificate = try ControllerTrustStore.read(for: station)
        }
        catch { stopWithError(error); return }
        loading = true
        phase = "Controller-Verbindung vorbereiten"
        pageStatus = "1/4 · Controller-Verbindung vorbereiten …"
        record("Verbindungsversuch gestartet")
        record(credentials == nil ? "Gespeicherte Zugangsdaten für diese Station/Adresse: fehlen" : "Gespeicherte Zugangsdaten für diese Station/Adresse: vorhanden")
        let connection = connectionID
        initialLoadPending = true
        webView.onWindowAttached = { [weak self] in
            // The UIKit callback can occur during a SwiftUI update. Mutate the
            // observable session on the next main-actor turn.
            Task { @MainActor [weak self] in self?.startWhenAttached(connection: connection) }
        }
        deadline = Task { [weak self] in
            do { try await Task.sleep(nanoseconds: 30_000_000_000) } catch { return }
            guard let self, self.connectionID == connection, self.loading else { return }
            self.record("Gesamtzeitlimit erreicht")
            self.stopWithMessage("Zeitüberschreitung: \(self.phase). Bitte Verbindungsdiagnose öffnen und Controller-Adresse, WLAN/VPN sowie den Zugriff in Safari prüfen.", code: "connection-timeout")
        }
        startWhenAttached(connection: connection)
    }

    private func startWhenAttached(connection: UUID) {
        guard connectionID == connection, loading, initialLoadPending, webView.window != nil else { return }
        initialLoadPending = false
        record("WebKit am App-Fenster angebunden")
        guard let station, let url = URL(string: station.origin), let host = url.host,
              let port = NWEndpoint.Port(rawValue: UInt16(url.port ?? (url.scheme == "https" ? 443 : 80))) else {
            stopWithMessage("Controller-Adresse ungültig."); return
        }
        phase = "Netzwerkzugriff auf Port \(port.rawValue) prüfen"
        pageStatus = "1/4 · \(phase) …"
        record("TCP-Port \(port.rawValue) prüfen")
        let connectionProbe = NWConnection(host: NWEndpoint.Host(host), port: port, using: .tcp)
        probe = connectionProbe
        connectionProbe.stateUpdateHandler = { [weak self, weak connectionProbe] state in
            Task { @MainActor [weak self] in
                guard let self, let connectionProbe, self.connectionID == connection,
                      self.probe === connectionProbe, self.loading else { return }
                switch state {
                case .ready:
                    self.record("TCP-Port \(port.rawValue) erreichbar")
                    self.stopProbe(); self.loadIOPage()
                case .failed(let error):
                    self.record("TCP fehlgeschlagen: \(error)")
                    self.stopWithMessage("Controller-Port \(port.rawValue) nicht erreichbar. Adresse, HTTP-/HTTPS-Port und WLAN/VPN prüfen. Details stehen in der Verbindungsdiagnose.")
                case .waiting(let error):
                    self.record("TCP wartet: \(error)")
                    self.pageStatus = "1/4 · Warte auf Netzwerkzugriff. Falls iOS fragt, lokales Netzwerk erlauben."
                default: break
                }
            }
        }
        probeDeadline = Task { [weak self] in
            do { try await Task.sleep(nanoseconds: 10_000_000_000) } catch { return }
            guard let self, self.connectionID == connection, self.probe != nil else { return }
            self.record("TCP-Porttest: Zeitüberschreitung")
            self.stopWithMessage("Controller-Port \(port.rawValue) antwortet nicht. WLAN/VPN und HTTP-/HTTPS-Port prüfen. Unter iPhone-Einstellungen → Datenschutz & Sicherheit → Lokales Netzwerk den Zugriff für BACsolution I/O erlauben. Danach erneut verbinden.")
        }
        connectionProbe.start(queue: .main)
    }

    private func stopProbe() {
        probeDeadline?.cancel(); probeDeadline = nil
        probe?.stateUpdateHandler = nil; probe?.cancel(); probe = nil
    }

    private func record(_ event: String) {
        diagnostics.append(String(format: "+%.1fs · ", Date().timeIntervalSince(startedAt)) + event)
        if diagnostics.count > 60 { diagnostics.removeFirst(diagnostics.count - 60) }
    }

    var diagnosticReport: String {
        (["BACsolution I/O \(AppVersion.version) (\(AppVersion.build))", "iOS \(UIDevice.current.systemVersion)",
          "Controller: \(station?.origin ?? "–")", "Phase: \(phase)", "Status: \(pageStatus)",
          "Diagnosecode: \(failureCode ?? "–")"] + diagnostics).joined(separator: "\n")
    }

    private func loadIOPage() {
        guard let station else { return }
        guard let url = URL(string: station.origin + "/webui/liob/iotest") else { loading = false; return }
        phase = "Controller-Seite laden"
        pageStatus = loginAttempted ? "4/4 · I/O-Testseite wird geladen …" : "1/4 · Controller erreichbar. Seite wird geladen …"
        record("GET /webui/liob/iotest")
        webView.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15))
    }
    func openIOPage() { if let station { connect(station) } }
    func confirmIdentity() { if ready { identityConfirmed = true } }

    func cancelLogin(message: String = "Verbindung pausiert. Bei Bedarf erneut verbinden.") {
        guard loading else { return }
        connectionID = UUID(); pageID = UUID()
        pageTask?.cancel(); webView.stopLoading()
        stopWithMessage(message, code: nil)
    }

    func trustPendingCertificate() throws {
        guard !loading, let station, let certificate = pendingCertificate,
              certificate.stationID == station.id, certificate.origin == station.origin else {
            throw AppFailure("Zertifikatsprüfung ist nicht mehr aktuell. Bitte erneut verbinden.")
        }
        try ControllerTrustStore.save(certificate, for: station)
        connect(station)
    }

    func rejectPendingCertificate() {
        pendingCertificate = nil
        stopWithMessage("Zertifikat nicht freigegeben. Verbindung abgebrochen.")
    }

    func forgetCertificate() throws {
        guard let station else { return }
        try ControllerTrustStore.remove(for: station)
        trustedCertificate = nil; pendingCertificate = nil
        stopWithMessage("Zertifikatsfreigabe entfernt. Vor erneutem Anmelden wieder prüfen.")
    }

    func webView(_ webView: WKWebView, didReceive challenge: URLAuthenticationChallenge,
                 completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        guard webView === self.webView, let station else { completionHandler(.cancelAuthenticationChallenge, nil); return }
        let space = challenge.protectionSpace
        guard space.authenticationMethod == NSURLAuthenticationMethodServerTrust else {
            // LOYTEC uses its form/session endpoint, never HTTP Basic credentials.
            completionHandler(.performDefaultHandling, nil); return
        }
        guard ControllerConnectionPolicy.matches(origin: station.origin, host: space.host, port: space.port),
              let trust = space.serverTrust, let certificate = ControllerCertificate.read(trust, station: station) else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            stopWithMessage("HTTPS-Zertifikat gehört nicht zum gewählten Controller."); return
        }
        // No external issuer/OCSP network request on the UI thread. A private
        // controller certificate may instead be verified and pinned explicitly.
        SecTrustSetNetworkFetchAllowed(trust, false)
        let systemTrusted = trustedCertificate == nil && SecTrustEvaluateWithError(trust, nil)
        switch ControllerConnectionPolicy.trust(origin: station.origin, host: space.host, port: space.port,
                                                fingerprint: certificate.fingerprint,
                                                savedFingerprint: trustedCertificate?.fingerprint,
                                                systemTrusted: systemTrusted) {
        case .system:
            record("HTTPS: Systemvertrauen bestätigt")
            completionHandler(.performDefaultHandling, nil)
        case .pinned:
            record("HTTPS: freigegebenes Zertifikat stimmt überein")
            completionHandler(.useCredential, URLCredential(trust: trust))
        case .review:
            pendingCertificate = certificate
            record(trustedCertificate == nil ? "HTTPS: Zertifikatsfreigabe erforderlich" : "HTTPS: Zertifikat geändert")
            // Never hold a WebKit challenge while the user reviews the certificate.
            // Their explicit confirmation starts a fresh, independently checked connection.
            self.webView.navigationDelegate = nil
            completionHandler(.cancelAuthenticationChallenge, nil)
            stopWithMessage(trustedCertificate == nil
                ? "Der Controller antwortet. Sein HTTPS-Zertifikat wird von iOS nicht bestätigt. Bitte unten prüfen."
                : "Das HTTPS-Zertifikat dieses Controllers hat sich geändert. Bitte erneut prüfen.")
        case .reject:
            completionHandler(.cancelAuthenticationChallenge, nil)
            stopWithMessage("HTTPS-Zertifikatsprüfung fehlgeschlagen.")
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard webView === self.webView else { decisionHandler(.cancel); return }
        guard let origin = station?.origin, let url = action.request.url,
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.user == nil, components.password == nil,
              sameOrigin(url, origin), action.targetFrame?.isMainFrame == true else {
            record("Navigation zu anderer Adresse oder anderem Protokoll blockiert")
            stopWithMessage("Der Controller leitet auf eine andere Adresse oder ein anderes Protokoll um. Bitte die endgültige Controller-Adresse in einer passenden Station verwenden.")
            decisionHandler(.cancel); return
        }
        decisionHandler(.allow)
    }
    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        guard webView === self.webView else { decisionHandler(.cancel); return }
        if response.isForMainFrame, let http = response.response as? HTTPURLResponse {
            record("Controller-Seite: HTTP \(http.statusCode)")
            // Some controllers return their recognized login form with 401/403.
            // Let the existing strict form/CSRF check decide before any login.
            if http.statusCode >= 400 && ![401, 403].contains(http.statusCode) {
                decisionHandler(.cancel)
                stopWithMessage("Controller antwortet mit HTTP \(http.statusCode). I/O-Testseite und Benutzerberechtigung prüfen.")
                return
            }
        }
        decisionHandler(.allow)
    }
    private func sameOrigin(_ url: URL, _ origin: String) -> Bool {
        guard let expected = URL(string: origin) else { return false }
        func port(_ u: URL) -> Int { u.port ?? (u.scheme == "https" ? 443 : 80) }
        return url.scheme == expected.scheme && url.host?.lowercased() == expected.host?.lowercased() && port(url) == port(expected)
    }
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        guard webView === self.webView, loading || ready else { return }
        pageID = UUID(); pageTask?.cancel()
        ready = false; identityConfirmed = false; loading = true
        record("WebKit: Navigation gestartet")
    }
    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        guard webView === self.webView, loading else { return }
        phase = "Controller-Seite vollständig laden"
        pageStatus = loginAttempted ? "4/4 · I/O-Testseite wird geladen …" : "1/4 · Controller antwortet. Seite wird geladen …"
        record("WebKit: Seiteninhalt empfangen")
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard webView === self.webView, loading else { return }
        phase = "Anmeldeseite prüfen"
        pageStatus = "2/4 · Anmeldestatus prüfen …"
        record("WebKit: Seite geladen; Anmeldestatus prüfen")
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
                self.record("I/O-Testseite und Anmeldung bestätigt")
                self.deadline?.cancel()
            } catch is CancellationError { return }
            catch {
                guard self.isCurrent(connection, page) else { return }
                self.record("I/O-Seite noch nicht bestätigt [\(ControllerConnectionError.describe(error).code)]")
                await self.authenticateIfNeeded(connection: connection, page: page, readError: error)
            }
        }
    }

    private func isCurrent(_ connection: UUID, _ page: UUID) -> Bool {
        connectionID == connection && pageID == page && !Task.isCancelled
    }

    private func authenticateIfNeeded(connection: UUID, page: UUID, readError: Error) async {
        do {
            let state = try await inspectLoginPage(connection: connection, page: page)
            guard isCurrent(connection, page) else { return }
            if state.state == "error" { throw ControllerConnectionError(code: state.code, message: state.message ?? "Controller-Anmeldung konnte nicht geprüft werden.") }
            if state.state == "actionRequired" { stopWithMessage(Self.controllerActionRequired, code: state.code); return }
            if state.state == "authenticated" {
                guard !ioRedirectAttempted else { stopWithError(readError); return }
                ioRedirectAttempted = true; loadIOPage(); return
            }
            guard state.state == "login" else {
                stopWithMessage("Die Anmeldeprüfung hat keinen bekannten Zustand zurückgegeben. Verbindungsdiagnose kopieren.", code: "unexpected-login-state"); return
            }
            guard !loginAttempted else {
                stopWithMessage("Anmeldung nicht bestätigt. Zugangsdaten und Controller-Berechtigungen prüfen.", code: "login-not-retained"); return
            }
            guard let credentials else {
                stopWithMessage("Bitte die Zugangsdaten für diese Station speichern und verbinden.", code: "credentials-missing"); return
            }
            // One request per explicit connection. Failure/timeouts never trigger retries.
            loginAttempted = true
            phase = "Gespeicherte Zugangsdaten anmelden"
            pageStatus = "3/4 · Mit gespeicherten Zugangsdaten anmelden …"
            record("Einmalige Anmeldung über /webui/login")
            let result: ControllerLoginReply = try await evaluate(loginScript, request: [
                "operation": "authenticate", "username": credentials.username, "password": credentials.password
            ])
            guard isCurrent(connection, page) else { return }
            self.credentials = nil
            record("Anmeldeantwort: \(result.code)")
            if result.state == "error" { throw ControllerConnectionError(code: result.code, message: result.message ?? "Controller-Anmeldung fehlgeschlagen.") }
            if result.state == "actionRequired" {
                stopWithMessage(Self.controllerActionRequired, code: result.code); return
            }
            guard result.state == "authenticated" else {
                stopWithMessage("Controller hat die Anmeldung nicht bestätigt. Verbindungsdiagnose kopieren.", code: "unexpected-login-result"); return
            }
            ioRedirectAttempted = true
            phase = "I/O-Testseite nach der Anmeldung laden"
            pageStatus = "4/4 · Anmeldung bestätigt. I/O-Testseite laden …"
            loadIOPage()
        } catch is CancellationError { return }
        catch {
            guard isCurrent(connection, page) else { return }
            stopWithError(error)
        }
    }

    private func inspectLoginPage(connection: UUID, page: UUID) async throws -> ControllerLoginReply {
        // Repeat only page inspection. No password request is retried, and the
        // overall connection deadline and navigation cancellation still apply.
        for attempt in 0...6 {
            let state: ControllerLoginReply = try await evaluate(loginScript, request: ["operation": "inspect"])
            guard isCurrent(connection, page) else { throw CancellationError() }
            if let snapshot = state.diagnostics, snapshot != lastPageDiagnostics {
                lastPageDiagnostics = snapshot
                record("Seitenprüfung: \(snapshot.readyState), Skriptfehler=\(snapshot.scriptErrors), Ressourcenfehler=\(snapshot.resourceErrors)")
                if snapshot.scriptErrors > 0 || snapshot.resourceErrors > 0 {
                    record("Erster Seitenfehler: \(snapshot.firstScriptError) / \(snapshot.firstScriptSource); erste fehlende Ressource: \(snapshot.firstResourceSource)")
                }
                record("Seitenmerkmale: \(snapshot.summary)")
            }
            if state.state != "pending" {
                record("Anmeldeprüfung: \(state.code)")
                return state
            }
            if attempt == 0 {
                pageStatus = "2/4 · Warte auf den Aufbau der Controller-Anmeldeseite …"
                record("Anmeldeformular noch nicht vorhanden; Seitenaufbau bis zu 3 Sekunden abwarten")
            }
            if attempt < 6 { try await Task.sleep(nanoseconds: 500_000_000) }
        }
        throw ControllerConnectionError(code: "login-page-incomplete", message: "Der Controller antwortet, aber seine Anmeldeseite wurde nicht vollständig aufgebaut. Verbindungsdiagnose kopieren.")
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
        guard loading || ready else { return }
        if (error as NSError).code == NSURLErrorCancelled { return }
        let failure = error as NSError
        record("WebKit-Fehler: \(failure.domain) / \(failure.code)")
        stopWithError(error)
    }
    private func stopWithError(_ error: Error) {
        let failure = ControllerConnectionError.describe(error)
        stopWithMessage(failure.message, code: failure.code)
    }
    private func stopWithMessage(_ message: String, code: String? = "connection-stopped") {
        pageID = UUID()
        initialLoadPending = false; webView.onWindowAttached = nil; stopProbe()
        webView.navigationDelegate = nil
        webView.stopLoading()
        loading = false; ready = false; identityConfirmed = false; credentials = nil
        pageTask?.cancel(); deadline?.cancel(); pageStatus = message; failureCode = code
        record("Verbindung beendet · \(phase)")
        record("\(code.map { "Abbruch [\($0)]" } ?? "Hinweis"): \(message)")
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
