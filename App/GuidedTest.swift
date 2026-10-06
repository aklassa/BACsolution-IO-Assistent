import Foundation

struct VoiceProposal: Identifiable {
    let id = UUID()
    let stationID: String
    let point: IOPoint
    let comment: String
    let expiresAt = Date().addingTimeInterval(300)
}

@MainActor extension AssistantModel {
    func startGuided() async {
        guard !locked, !voice.active else { return }
        if let consent = voice.provider.consentKey {
            guard UserDefaults.standard.bool(forKey: consent) else {
                message = "Unter KI-Verbindung einrichten die Übertragung an \(voice.provider.title) freigeben."; return
            }
            guard !store.data.serverURL.isEmpty, !TokenStore.read().isEmpty else {
                message = "Zuerst KI-Verbindung einrichten öffnen und die Server-Adresse mit Zugangsschlüssel speichern."; return
            }
        }
        speech.stop()
        do {
            guard session.ready, session.identityConfirmed, let station, let project else { throw AppFailure("Zuerst den Controller verbinden und die Station bestätigen.") }
            let configuration = try rules().call("guidedConfiguration") as? [String: Any] ?? [:]
            // No URL, controller credentials, cookies, serial or full project database.
            let context: [String: Any] = ["project":project.name, "station":station.name,
                "selected": selected.map(pointContext) ?? [:], "vocabulary":try JSON.object(effectiveTerms()),
                "pointFilter":["reserveHidden":hideReservePoints, "visible":inspectionPoints.count, "total":points.count]]
            await voice.start(server: store.data.serverURL, token: TokenStore.read(), configuration: configuration, context: context)
        } catch { report(error) }
    }
    func selectVoiceProvider(_ provider: VoiceProvider) {
        guard !locked, voice.provider != provider else { return }
        speech.stop(); voice.select(provider); stopObservation(); voiceProposal = nil
        message = "\(provider.title) gewählt. Zum Prüfen das KI-Gespräch starten."
    }
    func stopGuided() { voice.stop(); stopObservation(); voiceProposal = nil }
    func stopObservation() {
        observationID = UUID(); observationTask?.cancel(); observationTask = nil; observedAddress = nil
    }
    func pointContext(_ point: IOPoint) -> [String: Any] {
        ["name":point.name, "description":point.description, "terminal":point.terminal,
         "device":point.deviceName, "bus":point.busName, "address":point.address,
         "value":point.value.text, "unit":point.value.unit, "online":point.online,
         "receivedAt":point.receivedAt, "testStatus":point.statusLabel, "testComment":point.testComment]
    }
    private func currentGuidedPoint() async throws -> IOPoint {
        guard candidates.isEmpty, let before = selected else { throw AppFailure("Zuerst einen Datenpunkt eindeutig wählen.") }
        try await refresh()
        guard let point = points.first(where: { $0.address == before.address }), point.sameAssignment(as: before), point.online else {
            stopObservation(); selectedAddress = nil
            throw AppFailure("Datenpunkt nicht mehr verfügbar oder Zuordnung geändert. Erneut suchen.")
        }
        return point
    }
    func guidedTool(_ name: String, _ args: [String: Any]) async throws -> [String: Any] {
        guard voice.connected, !locked else { throw AppFailure("Ein anderer Vorgang läuft. Bitte kurz warten.") }
        guard voiceProposal == nil else { throw AppFailure("Der Kommentar wartet auf Ja oder Nein. Zuerst diese Frage beantworten.") }
        busy = true; defer { busy = false }
        try Task.checkCancellation()
        switch name {
        case "find_points":
            guard let query = args["query"] as? String, !query.isEmpty, query.count <= 300 else { throw AppFailure("Bitte den gesuchten Datenpunkt nennen.") }
            stopObservation(); try await lookup(query)
            if let selected { return ["selected":pointContext(selected)] }
            return ["candidates":candidates.prefix(8).enumerated().map { index, point -> [String: Any] in ["number":index + 1, "point":pointContext(point)] },
                    "message":message, "requiresChoice":true]
        case "choose_point":
            guard let number = args["number"] as? Int else { throw AppFailure("Treffernummer fehlt.") }
            stopObservation(); try await chooseCandidateInternal(number - 1)
            guard let selected else { throw AppFailure("Kein Datenpunkt gewählt.") }
            return ["selected":pointContext(selected)]
        case "read_point": return ["selected":pointContext(try await currentGuidedPoint())]
        case "observe_point":
            guard let enabled = args["enabled"] as? Bool else { throw AppFailure("Beobachtungsauftrag unvollständig.") }
            if !enabled { stopObservation(); return ["observing":false] }
            let point = try await currentGuidedPoint()
            let threshold = (args["threshold"] as? Double) ?? 0.5
            guard threshold.isFinite, threshold >= 0.01, threshold <= 1_000_000 else { throw AppFailure("Änderungsschwelle ungültig.") }
            observe(point, threshold: threshold)
            return ["observing":true, "intervalSeconds":3, "threshold":threshold, "selected":pointContext(point)]
        case "stop_observation": stopObservation(); return ["observing":false]
        case "prepare_comment":
            guard draft?.changed != true else { throw AppFailure("Ein Prüfentwurf ist bereits vorhanden. Diesen zuerst speichern oder verwerfen.") }
            guard let comment = args["comment"] as? String, let unit = args["unit"] as? String, args["reference"] != nil else { throw AppFailure("Kommentarauftrag unvollständig.") }
            let point = try await currentGuidedPoint()
            guard let stationID else { throw AppFailure("Station fehlt.") }
            let text = try rules().call("guidedComment", ["point":JSON.object(point), "comment":comment,
                "reference":args["reference"] ?? NSNull(), "unit":unit]) as? String ?? ""
            stopObservation(); try stageInternal(comment: text)
            voiceProposal = VoiceProposal(stationID: stationID, point: point, comment: text)
            return ["saved":false, "confirmationPrompt":"\(point.name), Klemme \(point.terminal). Vollständiger Kommentar: \(text) Soll ich diesen Kommentar speichern? Bitte Ja oder Nein sagen."]
        case "next_point":
            guard draft?.changed != true, draft?.needsReview != true else { throw AppFailure("Ein Prüfentwurf ist noch offen. Erst speichern oder am Bildschirm prüfen.") }
            guard let query = args["query"] as? String, query.count <= 300 else { throw AppFailure("Filter ungültig.") }
            stopObservation()
            let before = selected; try await refresh()
            let filtered: [IOPoint]
            if query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { filtered = inspectionPoints }
            else {
                let result = try rules().decode(SearchResult.self, operation: "search", arguments: ["points":JSON.object(inspectionPoints), "text":query, "terms":termObject()])
                guard !result.approximate else { throw AppFailure("Filter passt nicht eindeutig. Bitte genauer benennen.") }
                filtered = result.matches
            }
            let next = try nextInspectionPoint(after: before, matchingKeys: filtered.map(\.key))
            selectedAddress = next.address; candidates = []; suggestions = []; pendingTerm = nil
            return ["selected":pointContext(next)]
        default: throw AppFailure("Diese KI-Aktion ist nicht freigegeben.")
        }
    }

    func guidedUser(_ text: String) async throws -> [String: Any]? {
        let cleaned = text.trimmingCharacters(in: .whitespacesAndNewlines).lowercased().trimmingCharacters(in: .punctuationCharacters)
        if ["stopp", "stop", "gespräch beenden", "sitzung beenden"].contains(cleaned) { stopGuided(); return nil }
        guard let proposal = voiceProposal else { return nil }
        if !voice.confirmationReady && !voice.confirming {
            voiceProposal = nil
            return ["saved":false, "message":"Vorlesen wurde unterbrochen. Der Entwurf bleibt lokal erhalten; bitte am Bildschirm prüfen."]
        }
        let decision = try rules().call("guidedConfirmation", ["text":text]) as? [String: Any] ?? [:]
        switch decision["action"] as? String {
        case "confirm":
            guard !locked, voice.confirmationReady, proposal.expiresAt > Date(), stationID == proposal.stationID,
                  selectedAddress == proposal.point.address, let draft, !draft.needsReview,
                  draft.result == nil, draft.comment == proposal.comment, draft.base.sameAssignment(as: proposal.point) else {
                voiceProposal = nil; voice.clearConfirmation()
                throw AppFailure("Bestätigung ist nicht mehr gültig. Entwurf am Bildschirm prüfen und ausdrücklich speichern.")
            }
            voiceProposal = nil; voice.clearConfirmation()
            busy = true; defer { busy = false }
            try await saveInternal()
            return ["saved":true, "controllerVerified":true, "point":proposal.point.name,
                    "followup":decision["followup"] as? String ?? "", "message":message]
        case "cancel":
            voiceProposal = nil; voice.clearConfirmation()
            // Delete only this proposal; never silently remove another draft.
            if let draft, draft.comment == proposal.comment, draft.result == nil, !draft.needsReview { try store.removeDraft(draft.id) }
            return ["saved":false, "cancelled":true, "message":"Kommentar nicht gespeichert. Eine Korrektur kann jetzt neu vorgeschlagen werden."]
        default:
            return ["saved":false, "awaitingConfirmation":true, "message":"Der vorgelesene Kommentar wartet auf ein ausdrückliches Ja oder Nein. Bei Korrektur erst Nein sagen."]
        }
    }

    private func observe(_ initial: IOPoint, threshold: Double) {
        stopObservation(); observedAddress = initial.address
        let observation = observationID, station = stationID
        observationTask = Task { [weak self] in
            var announced = initial
            while !Task.isCancelled {
                do { try await Task.sleep(nanoseconds: 3_000_000_000) } catch { return }
                guard let self, self.voice.connected, self.observationID == observation, self.stationID == station,
                      self.selectedAddress == initial.address else { return }
                if self.locked || !self.voice.idleForObservation { continue }
                self.busy = true
                do {
                    let point = try await self.currentGuidedPoint()
                    guard !Task.isCancelled, self.observationID == observation else { self.busy = false; return }
                    let change = try self.rules().call("guidedChange", ["before":JSON.object(announced), "after":JSON.object(point), "threshold":threshold]) as? [String: Any] ?? [:]
                    self.busy = false
                    if change["changed"] as? Bool == true,
                       self.voice.announce(["observation":change["direction"] ?? "Wert geändert", "point":self.pointContext(point)]) { announced = point }
                } catch {
                    self.busy = false
                    guard self.observationID == observation else { return }
                    self.stopObservation(); self.message = error.localizedDescription
                    self.voice.stop("Wertbeobachtung pausiert: " + error.localizedDescription); return
                }
            }
        }
    }
}
