import Foundation
import Combine

@MainActor final class AssistantModel: ObservableObject {
    let store: ProjectStore
    let session: LoytecSession
    let speech: SpeechService
    let sync: SyncService
    let language: LanguageEngine?
    let voice = GuidedVoiceService()
    @Published var observedAddress: String?
    @Published var voiceProposal: VoiceProposal?
    var observationTask: Task<Void, Never>?
    var observationID = UUID()
    private var voiceForwarding: AnyCancellable?
    @Published var projectID: String?
    @Published var stationID: String?
    @Published var selectedAddress: String?
    @Published var points: [IOPoint] = [] { didSet { classifyReservePoints() } }
    @Published private(set) var reserveKeys = Set<String>()
    @Published private(set) var hideReservePoints = UserDefaults.standard.object(forKey: "hideReservePoints") as? Bool ?? true
    @Published var candidates: [IOPoint] = []
    @Published var suggestions: [String] = []
    @Published var pendingTerm: Term?
    private var pendingTermRevision: Int?
    @Published var reviewPoint: IOPoint?
    @Published var showLogin = false
    @Published var busy = false
    @Published var message = "Projekt und Station auswählen."
    private var forwarding: AnyCancellable?
    private var audioGeneration = 0
    init(store: ProjectStore, session: LoytecSession, speech: SpeechService, sync: SyncService) {
        self.store = store; self.session = session; self.speech = speech; self.sync = sync
        do { language = try LanguageEngine() } catch { language = nil; message = error.localizedDescription }
        forwarding = store.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() }
        voiceForwarding = voice.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() }
        voice.onTool = { [weak self] name, args in
            guard let self else { throw AppFailure("Prüfsitzung beendet.") }
            return try await self.guidedTool(name, args)
        }
        voice.onUser = { [weak self] text in try await self?.guidedUser(text) }
        voice.onStopped = { [weak self] in self?.stopObservation(); self?.voiceProposal = nil }
        speech.onFinal = { [weak self] text in Task { await self?.command(text) } }
    }
    var project: Project? { store.projects.first { $0.id == projectID } }
    var station: Station? { project?.stations.first { $0.id == stationID } }
    var selected: IOPoint? { points.first { $0.address == selectedAddress } }
    var inspectionPoints: [IOPoint] { hideReservePoints ? points.filter { !isReserve($0) } : points }
    func isReserve(_ point: IOPoint) -> Bool { reserveKeys.contains(point.key) }
    private func classifyReservePoints() {
        // If local classification fails, show every point instead of hiding data.
        reserveKeys = Set((try? rules().decode([String].self, operation: "reservePointKeys", arguments: ["points": JSON.object(points)])) ?? [])
    }
    func setReserveFilter(_ hidden: Bool) {
        guard !locked, hidden != hideReservePoints else { return }
        stopGuided()
        hideReservePoints = hidden
        UserDefaults.standard.set(hidden, forKey: "hideReservePoints")
        candidates = []; suggestions = []
        // Keep selectedAddress and all drafts, including a selected reserve point.
    }
    func nextInspectionPoint(after before: IOPoint?, direction: Int = 1, matchingKeys: [String]? = nil) throws -> IOPoint {
        if let before, !points.contains(where: { $0.key == before.key && $0.sameAssignment(as: before) }) {
            throw AppFailure("Der bisherige Datenpunkt wurde geändert. Bitte neu auswählen.")
        }
        var arguments: [String: Any] = ["points":try JSON.object(points), "currentKey":before?.key ?? "",
                                        "direction":direction, "hideReserve":hideReservePoints]
        if let matchingKeys { arguments["matchingKeys"] = matchingKeys }
        let key = try rules().call("nextInspectionPointKey", arguments) as? String ?? ""
        guard let point = points.first(where: { $0.key == key }) else { throw AppFailure("Ende der gefilterten Datenpunktliste erreicht.") }
        return point
    }
    var draft: Draft? {
        guard let stationID, let selected else { return nil }
        return store.data.drafts.first { $0.id == "\(stationID):\(selected.address)" }
    }
    var locked: Bool { busy || sync.busy || store.loadFailure != nil }
    func rules() throws -> LanguageEngine {
        guard let language else { throw AppFailure("Sprachauswertung konnte nicht gestartet werden.") }; return language
    }
    func termObject() throws -> Any { try JSON.object(store.vocabulary.terms) }
    func connect(project: Project, station: Station) {
        guard !locked else { return }
        stopGuided(); speech.stop(); projectID = project.id; stationID = station.id
        selectedAddress = nil; candidates = []; suggestions = []; pendingTerm = nil; reviewPoint = nil
        points = store.data.cache.first { $0.stationID == station.id }?.points ?? []
        message = points.isEmpty ? "Bitte am Controller anmelden." : "Gespeicherter Stand. Für aktuelle Werte verbinden."
        session.connect(station); showLogin = true
    }
    func choose(_ point: IOPoint) { guard !locked else { return }; stopGuided(); selectedAddress = point.address; candidates = []; suggestions = []; pendingTerm = nil }
    private func tell(_ text: String) {
        message = text
        if !voice.active && audioGeneration == speech.generation { speech.say(text) }
    }
    func report(_ error: Error) { message = error.localizedDescription }
    private func perform(_ work: () async throws -> Void) async {
        guard !locked else { message = "Bitte den laufenden Vorgang abwarten."; return }
        busy = true; audioGeneration = speech.generation
        defer { busy = false; speech.resumeIfNeeded() }
        do { try await work() } catch { tell(error.localizedDescription) }
    }
    func refresh() async throws {
        guard let station, session.station?.id == station.id, session.station?.origin == station.origin,
              session.station?.identity == station.identity, session.station?.configuration == station.configuration else {
            throw AppFailure("Die gewählte Station muss zuerst neu verbunden werden.")
        }
        let fresh = try await session.readAll()
        try Task.checkCancellation()
        try store.cache(fresh, stationID: station.id)
        points = fresh
    }
    func reload() async { await perform { try await self.refresh(); self.message = "\(self.points.count) Datenpunkte vom Controller gelesen." } }
    func stage(result: Int? = nil, comment: String? = nil) {
        guard !locked else { return }
        stopGuided()
        do { try stageInternal(result: result, comment: comment) } catch { report(error) }
    }
    func stageInternal(result: Int? = nil, comment: String? = nil) throws {
        guard candidates.isEmpty, pendingTerm == nil else { throw AppFailure("Zuerst die offene Auswahl beantworten oder abbrechen.") }
        guard let selected, let stationID else { throw AppFailure("Zuerst einen Datenpunkt auswählen.") }
        var value = draft ?? Draft(stationID: stationID, base: selected, comment: selected.testComment)
        if let result {
            guard [1,2,3].contains(result) else { throw AppFailure("Prüfstatus ungültig.") }; value.result = result
        }
        if let comment {
            guard comment.utf16.count <= 2000 else { throw AppFailure("Kommentar darf höchstens 2000 Zeichen enthalten.") }; value.comment = comment
        }
        try store.putDraft(value)
        message = "Entwurf lokal gespeichert. Controller noch unverändert."
    }
    private func speakPoint(_ point: IOPoint) throws {
        guard point.online else { throw AppFailure("\(point.name): Gerät offline. Kein aktueller Messwert verfügbar.") }
        let name = try rules().call("spoken", ["text": point.name, "terms": termObject()]) as? String ?? point.name
        let translated = ["OPEN": "offen", "CLOSED": "geschlossen"]
        let value = translated[point.value.text.uppercased()] ?? point.value.text
        tell("\(name), Klemme \(point.terminal): \(value) \(point.value.unit).")
    }
    private func readCurrent() async throws {
        guard candidates.isEmpty else { throw AppFailure("Zuerst einen der möglichen Treffer wählen.") }
        guard let before = selected else { throw AppFailure("Welchen Datenpunkt soll ich vorlesen? Zum Beispiel: Wert von Zulufttemperatur Anlage 2.1.") }
        try await refresh()
        guard let now = points.first(where: { $0.address == before.address }), now.sameAssignment(as: before) else {
            selectedAddress = nil; throw AppFailure("Zuordnung wurde geändert. Datenpunkt erneut auswählen.")
        }
        try speakPoint(now)
    }
    func lookup(_ query: String) async throws {
        candidates = []; suggestions = []; pendingTerm = nil; selectedAddress = nil
        try await refresh()
        let result = try rules().decode(SearchResult.self, operation: "search", arguments: ["points": JSON.object(inspectionPoints), "text": query, "terms": termObject()])
        if result.matches.count == 1 && !result.approximate {
            selectedAddress = result.matches[0].address
            try speakPoint(result.matches[0])
        } else if !result.matches.isEmpty {
            candidates = result.matches
            let names = candidates.prefix(5).enumerated().map { "Treffer \($0.offset + 1): \($0.element.name), \($0.element.terminal)" }.joined(separator: ". ")
            tell("\(result.reason ?? "") \(candidates.count) mögliche Treffer. \(names). Bitte Treffer mit Nummer wählen oder die Suche genauer nennen.")
        } else {
            let filterHint = hideReservePoints && !reserveKeys.isEmpty ? " Reservepunkte sind ausgeblendet. Bei Bedarf Reserve ausblenden ausschalten." : ""
            tell("Kein passender Datenpunkt in der Prüfliste gefunden. Bitte Anlagenbezeichnung oder Klemme ergänzen." + filterHint)
        }
    }
    func chooseCandidate(_ index: Int) async {
        if voice.active { voice.submit("Treffer \(index + 1)"); return }
        await perform { try await self.chooseCandidateInternal(index) }
    }
    func chooseCandidateInternal(_ index: Int) async throws {
        guard candidates.indices.contains(index) else { throw AppFailure("Diese Treffernummer gibt es nicht.") }
        let before = candidates[index]
        try await refresh()
        guard let point = points.first(where: { $0.address == before.address }), point.sameAssignment(as: before) else {
            candidates = []; throw AppFailure("Treffer wurde inzwischen geändert. Bitte erneut suchen.")
        }
        candidates = []; selectedAddress = point.address; try speakPoint(point)
    }
    func save() async { stopGuided(); await perform { try await self.saveInternal() } }
    func saveInternal() async throws {
        guard candidates.isEmpty, pendingTerm == nil else { throw AppFailure("Zuerst die offene Auswahl beantworten oder abbrechen.") }
        guard let station, let project, var pending = draft, pending.changed else { throw AppFailure("Kein geänderter Prüfentwurf vorhanden.") }
        guard !pending.needsReview else { throw AppFailure("Letzter Speicherauftrag ist unbestätigt. Zuerst neu lesen und Entwurf prüfen.") }
        guard session.station?.id == station.id, session.station?.identity == station.identity,
              session.station?.origin == station.origin, session.station?.configuration == station.configuration else { throw AppFailure("Station neu verbinden.") }
        guard !store.data.technician.trimmingCharacters(in: .whitespaces).isEmpty else { throw AppFailure("Zuerst in den Einstellungen den Prüfernamen eintragen.") }
        try await refresh()
        try Task.checkCancellation()
        guard let current = points.first(where: { $0.address == pending.base.address }), current.sameAssignment(as: pending.base) else {
            throw AppFailure("Zuordnung wurde geändert. Prüfentwurf vor dem Speichern prüfen.")
        }
        // Persist uncertainty BEFORE any network mutation. A crash cannot trigger a silent retry.
        var changes: [(String, Any)] = []
        if pending.comment != pending.base.testComment { changes.append(("testComment", pending.comment)) }
        if let result = pending.result { changes.append(("testState", result)) }
        for (prop, value) in changes {
            pending.needsReview = true; try store.putDraft(pending)
            let point = try await session.write(pending.base, prop: prop, value: value)
            pending.base = point; pending.needsReview = false
            if prop == "testState" { pending.result = nil }
            let updated = pending
            let event = Inspection(projectID: project.id, stationID: station.id, stationIdentity: station.identity,
                configuration: station.configuration, point: point, prop: prop, technician: store.data.technician, deviceID: store.data.deviceID)
            try store.update { db in
                db.drafts.removeAll { $0.id == updated.id }; db.drafts.append(updated)
                db.results.append(event)
                if let i = db.cache.firstIndex(where: { $0.stationID == station.id }),
                   let j = db.cache[i].points.firstIndex(where: { $0.address == point.address }) { db.cache[i].points[j] = point }
            }
            if let i = points.firstIndex(where: { $0.address == point.address }) { points[i] = point }
        }
        try store.removeDraft(pending.id)
        tell("Prüfdaten vom Controller bestätigt und lokal gespeichert. Gemeinsamer Abgleich steht noch aus.")
    }
    func prepareReview() async {
        stopGuided()
        await perform {
            guard let pending = self.draft else { throw AppFailure("Kein Entwurf vorhanden.") }
            try await self.refresh()
            guard let point = self.points.first(where: { $0.address == pending.base.address }), point.sameAssignment(as: pending.base) else {
                throw AppFailure("Punktzuordnung geändert. Entwurf bleibt erhalten; zuerst die Anlagenzuordnung prüfen.")
            }
            self.reviewPoint = point
        }
    }
    func acceptReview() {
        do {
            guard var pending = draft, let point = reviewPoint, point.sameAssignment(as: pending.base) else { return }
            pending.base = point; pending.needsReview = false
            // An uncertain write already present on the device must not be reissued automatically.
            if pending.result == point.testState { pending.result = nil }
            try store.putDraft(pending); reviewPoint = nil
            message = "Aktueller Stand übernommen. Verbleibende Änderungen bei Bedarf ausdrücklich speichern."
        } catch { report(error) }
    }
    func discardDraft() {
        stopGuided()
        do { if let draft { try store.removeDraft(draft.id) }; message = "Entwurf verworfen." } catch { report(error) }
    }
    func effectiveTerms() throws -> [Term] {
        try rules().decode([Term].self, operation: "terms", arguments: ["terms": termObject()])
    }
    func saveTerm(_ term: Term) throws {
        var terms = store.vocabulary.terms
        let key = try rules().call("termKey", ["text": term.short]) as? String
        terms = try terms.filter { try rules().call("termKey", ["text": $0.short]) as? String != key }
        terms.append(term)
        let checked = try rules().decode([Term].self, operation: "validateTerms", arguments: ["terms": JSON.object(terms)])
        try store.saveVocabulary(Vocabulary(terms: checked))
    }
    func command(_ text: String) async {
        if voice.active { voice.submit(text); return }
        await perform { try await self.execute(text) }
    }
    private func execute(_ text: String) async throws {
        guard let command = try rules().call("command", ["text": text, "terms": termObject()]) as? [String: Any], let action = command["action"] as? String else { return }
        switch action {
        case "lookup", "select": try await lookup(command["value"] as? String ?? "")
        case "read": try await readCurrent()
        case "next", "previous":
            candidates = []; suggestions = []; pendingTerm = nil
            let before = selected
            try await refresh()
            let next = try nextInspectionPoint(after: before, direction: action == "next" ? 1 : -1)
            selectedAddress = next.address; try speakPoint(next)
        case "choose": try await chooseCandidateInternal((command["value"] as? Int ?? 0) - 1)
        case "result":
            try stageInternal(result: command["value"] as? Int)
            tell("Prüfergebnis vorgemerkt. Zum Übertragen Speichern sagen.")
        case "comment":
            try stageInternal(comment: command["value"] as? String)
            tell("Kommentar vorgemerkt: \(draft?.comment ?? ""). Zum Übertragen Speichern sagen.")
        case "save": try await saveInternal()
        case "discard": discardDraft(); tell("Entwurf verworfen.")
        case "stop": speech.stop(); message = "Sprachbedienung gestoppt."
        case "status":
            guard let selected else { throw AppFailure("Zuerst einen Datenpunkt auswählen.") }
            tell("Letzter gelesener Prüfstatus: \(selected.statusLabel). \(draft?.changed == true ? "Ein lokaler Entwurf ist vorhanden." : "Kein offener Entwurf.")")
        case "cancelSearch", "reject": candidates = []; suggestions = []; pendingTerm = nil; tell("Auswahl abgebrochen.")
        case "suggest":
            suggestions = command["commands"] as? [String] ?? []
            tell("Meinst du \(suggestions.joined(separator: " oder "))? Bitte den gewünschten Befehl vollständig sagen oder antippen.")
        case "define":
            let term = Term(short: command["short"] as? String ?? "", meaning: command["meaning"] as? String ?? "", source: "learned")
            _ = try rules().call("validateTerms", ["terms": JSON.object([term])])
            pendingTermRevision = store.data.documents.first { $0.id == "vocabulary:global" }?.revision ?? 0
            pendingTerm = term; tell("Soll \(term.short) global als \(term.meaning) hinterlegt werden? Bitte Ja oder Nein sagen.")
        case "confirm":
            guard let term = pendingTerm else {
                if suggestions.count == 1, ["Wert vorlesen", "Weiter", "Zurück", "Status"].contains(suggestions[0]) {
                    let suggestion = suggestions[0]; suggestions = []; try await execute(suggestion); return
                }
                throw AppFailure("Bitte den gewünschten Befehl vollständig sagen, zum Beispiel Speichern.")
            }
            guard pendingTermRevision == (store.data.documents.first { $0.id == "vocabulary:global" }?.revision ?? 0) else {
                pendingTerm = nil; throw AppFailure("Begriffsliste wurde inzwischen geändert. Definition bitte erneut prüfen.")
            }
            try saveTerm(term); pendingTerm = nil; tell("Begriff für alle Projekte dieser App gespeichert. Gemeinsamer Abgleich steht noch aus.")
        case "meaning":
            let query = try rules().call("termKey", ["text": command["value"] as? String ?? ""]) as? String
            let term = try effectiveTerms().first { term in
                try ([term.short] + term.aliases).contains { try rules().call("termKey", ["text": $0]) as? String == query }
            }
            tell(term.map { "\($0.short) bedeutet \($0.meaning)." } ?? "Diesen Begriff kenne ich noch nicht. Du kannst ihn in der Begriffsliste ergänzen.")
        case "unsupported": tell("Ausgänge schalten ist in dieser App-Vorbereitung nicht vorgesehen.")
        case "negated": tell("Verneinten Befehl nicht ausgeführt. Bitte den gewünschten Schritt genauer sagen.")
        case "unknown": try await lookup(text)
        default: tell("Befehl nicht sicher verstanden. Zum Beispiel: Wert von Zulufttemperatur Anlage 2.1.")
        }
    }
}
