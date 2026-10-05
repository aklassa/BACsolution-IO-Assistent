import SwiftUI

@MainActor struct InspectionView: View {
    @EnvironmentObject var model: AssistantModel
    @EnvironmentObject var store: ProjectStore
    @EnvironmentObject var speech: SpeechService
    @EnvironmentObject var session: LoytecSession
    @State private var command = ""
    var body: some View {
        List {
            Section {
                Text(model.station?.name ?? "Keine Station gewählt").font(.title2.bold())
                Text(model.project?.name ?? "Unter Projekte eine Station öffnen.").foregroundStyle(.secondary)
                if let station = model.station {
                    Button("Controller-Anmeldung öffnen", systemImage: "network") {
                        model.stopGuided()
                        if session.station?.id != station.id { session.connect(station) }
                        model.showLogin = true
                    }.disabled(model.locked)
                }
                Text(model.message).font(.callout).accessibilityLabel("Assistent: " + model.message)
                if model.busy { ProgressView("Vorgang läuft …") }
            }
            Section("Gemeinsam mit KI prüfen") {
                Text(model.voice.status).font(.callout)
                if model.voice.active {
                    Button("KI-Gespräch beenden", systemImage: "stop.circle.fill") { model.stopGuided() }
                    if !model.voice.transcript.isEmpty { Text("Du: \(model.voice.transcript)").font(.callout) }
                    if !model.voice.answer.isEmpty { Text("Assistent: \(model.voice.answer)").font(.callout) }
                } else {
                    Button("KI-Gespräch starten", systemImage: "waveform") { Task { await model.startGuided() } }
                        .buttonStyle(.borderedProminent).disabled(model.locked || !session.identityConfirmed)
                    Text("Zum Beispiel: Wir prüfen die Zulufttemperatur von Anlage zwei eins. Beobachte den Wert, ich erwärme den Fühler.").font(.caption).foregroundStyle(.secondary)
                }
                if model.observedAddress != nil {
                    Label("Wertbeobachtung aktiv · alle 3 Sekunden", systemImage: "eye")
                    Button("Beobachtung beenden") { model.stopObservation() }
                }
                if let proposal = model.voiceProposal {
                    Text("Noch nicht gespeichert").font(.headline)
                    Text(proposal.comment)
                    Text("Nach dem Vorlesen Ja oder Nein sagen. Zum Korrigieren zuerst Nein sagen.").font(.caption)
                }
            }
            Section(model.voice.active ? "Text zum KI-Gespräch" : "Sprechen oder eingeben") {
                HStack {
                    TextField("Wert von Zulufttemperatur Anlage 2.1", text: $command, axis: .vertical)
                    Button("Senden", systemImage: "arrow.up.circle.fill") { let text = command; command = ""; Task { await model.command(text) } }
                        .labelStyle(.iconOnly).disabled(command.isEmpty || model.locked || model.voice.confirming)
                }
                if !model.voice.active { HStack {
                    Button(speech.listening ? "Fertig" : "Sprechen", systemImage: speech.listening ? "stop.circle" : "mic.fill") {
                        if speech.listening { speech.finishCapture() } else { Task { await speech.listen() } }
                    }.buttonStyle(.bordered).disabled(model.locked)
                    Button(speech.handsFree ? "Sitzung beenden" : "Headset-Sitzung", systemImage: "headphones") {
                        Task { await speech.setHandsFree(!speech.handsFree) }
                    }.buttonStyle(.borderedProminent).disabled(model.locked && !speech.handsFree)
                }
                Text(speech.status).font(.caption).foregroundStyle(.secondary)
                if !speech.transcript.isEmpty { Text("Erkannt: \(speech.transcript)").font(.caption) }
                if speech.speaking || speech.listening || speech.handsFree { Button("Sprachbedienung stoppen") { speech.stop() } }
                }
            }
            if !model.candidates.isEmpty {
                Section("Bitte Datenpunkt bestätigen") {
                    ForEach(Array(model.candidates.enumerated()), id: \.element.id) { index, point in
                        Button { Task { await model.chooseCandidate(index) } } label: {
                            VStack(alignment: .leading) { Text("Treffer \(index + 1): \(point.name)"); Text("\(point.busName) · \(point.deviceName) · \(point.terminal)").font(.caption) }
                        }.disabled(model.locked)
                    }
                    Button("Auswahl abbrechen") { Task { await model.command("Abbrechen") } }
                }
            }
            if !model.suggestions.isEmpty {
                Section("Meintest du …?") {
                    ForEach(model.suggestions, id: \.self) { suggestion in
                        Button(suggestion) { model.suggestions = []; Task { await model.command(suggestion) } }.disabled(model.locked)
                    }
                }
            }
            if let term = model.pendingTerm {
                Section("Begriff global übernehmen?") {
                    Text("\(term.short) → \(term.meaning)")
                    HStack {
                        Button("Ja") { Task { await model.command("Ja") } }
                        Spacer(); Button("Nein") { Task { await model.command("Nein") } }
                    }.disabled(model.locked)
                }
            }
            if let point = model.selected {
                Section("Gewählter Datenpunkt") {
                    Text(point.name).font(.headline)
                    Text("\(point.busName) · \(point.deviceName) · \(point.terminal)").font(.caption)
                    if !point.description.isEmpty { Text(point.description).font(.callout) }
                    Text(point.displayValue).font(.largeTitle.monospacedDigit()).foregroundStyle(point.online ? .primary : .secondary)
                    Text("Zuletzt gelesen: \(point.receivedAt)").font(.caption).foregroundStyle(.secondary)
                    Button("Aktuellen Wert vorlesen", systemImage: "speaker.wave.2") { Task { await model.command("Wert vorlesen") } }.disabled(model.locked)
                    LabeledContent("Controller-Prüfstatus", value: point.statusLabel)
                    LabeledContent("Controller-Testdatum", value: point.testDate.isEmpty ? "Noch keines" : point.testDate)
                }
                Section("Prüfentwurf") {
                    HStack {
                        ForEach([1,2,3], id: \.self) { result in
                            Button(["", "Nicht getestet", "OK", "Nicht OK"][result]) { model.stage(result: result) }
                                .buttonStyle(.bordered).tint(model.draft?.result == result ? .orange : .accentColor)
                        }
                    }.disabled(model.locked)
                    Text("Testkommentar").font(.caption).foregroundStyle(.secondary)
                    TextEditor(text: Binding(get: { model.draft?.comment ?? point.testComment }, set: { model.stage(comment: $0) }))
                        .frame(minHeight: 90).disabled(model.locked)
                    if let draft = model.draft {
                        Label("Entwurf auf diesem iPhone gespeichert", systemImage: "internaldrive")
                        if draft.needsReview { Text("Speicherergebnis unbestätigt. Vor einer Wiederholung aktuellen Stand prüfen.").foregroundStyle(.orange) }
                        Button("Aktuellen Stand mit Entwurf vergleichen") { Task { await model.prepareReview() } }.disabled(model.locked)
                        Button("Am Controller speichern", systemImage: "checkmark.circle") { Task { await model.save() } }
                            .buttonStyle(.borderedProminent).disabled(model.locked || draft.needsReview || !draft.changed)
                        Button("Entwurf verwerfen", role: .destructive) { model.discardDraft() }.disabled(model.locked)
                    }
                }
            }
            Section {
                Button("Stationsdaten aktualisieren", systemImage: "arrow.clockwise") { Task { await model.reload() } }.disabled(model.locked || model.station == nil)
                ForEach(model.points) { point in
                    Button { model.choose(point) } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 3) { Text(point.name); Text("\(point.terminal) · \(point.busName)").font(.caption).foregroundStyle(.secondary) }
                            Spacer()
                            VStack(alignment: .trailing) { Text(point.displayValue).font(.callout); Text(point.statusLabel).font(.caption).foregroundStyle(point.testState == 3 ? .red : .secondary) }
                            if model.selectedAddress == point.address { Image(systemName: "checkmark.circle.fill") }
                        }
                    }.disabled(model.locked)
                }
            } header: { Text("Alle Datenpunkte der Station · \(model.points.count)") }
        }
        .navigationTitle("Prüfen").navigationBarTitleDisplayMode(.inline)
    }
}

@MainActor struct ReviewView: View {
    @EnvironmentObject var model: AssistantModel
    @Environment(\.dismiss) var dismiss
    let point: IOPoint
    var body: some View {
        NavigationStack {
            Form {
                Section(point.name) {
                    Text("Aktueller Controller: \(point.statusLabel)")
                    Text("Testdatum: \(point.testDate)")
                    Text("Kommentar: \(point.testComment)")
                }
                if let draft = model.draft {
                    Section("Lokaler Entwurf") {
                        Text("Status: \(draft.result.map { ["", "Nicht getestet", "OK", "Nicht OK"][$0] } ?? "Unverändert")")
                        Text("Kommentar: \(draft.comment)")
                    }
                }
                Section {
                    Text("Der aktuelle Stand wird als neue Grundlage übernommen. Bereits vorhandene Statusänderungen werden nicht erneut übertragen.")
                    Button("Entwurf mit diesem Stand fortsetzen") { model.acceptReview(); dismiss() }
                }
            }.navigationTitle("Entwurf prüfen")
                .toolbar { Button("Schließen") { dismiss() } }
        }
    }
}
