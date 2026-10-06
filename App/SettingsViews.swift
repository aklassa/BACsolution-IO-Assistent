import SwiftUI

@MainActor struct VocabularyView: View {
    @EnvironmentObject var model: AssistantModel
    @EnvironmentObject var store: ProjectStore
    @State private var editing: Term?
    @State private var newTerm = false
    @State private var filter = ""
    @State private var showDisabled = false
    private var terms: [Term] {
        let active = (try? model.effectiveTerms()) ?? []
        let all = active + (showDisabled ? store.vocabulary.terms.filter { $0.disabled == true } : [])
        return all.filter { filter.isEmpty || ([$0.short, $0.meaning] + $0.aliases).joined(separator: " ").localizedCaseInsensitiveContains(filter) }.sorted { $0.short.localizedStandardCompare($1.short) == .orderedAscending }
    }
    var body: some View {
        List {
            Section {
                Text("Diese Begriffe gelten für alle Projekte und Controller. Nach Einrichtung des gemeinsamen Speichers werden Änderungen auch dort abgeglichen.").font(.callout)
                Toggle("Deaktivierte Begriffe anzeigen", isOn: $showDisabled)
            }
            ForEach(terms) { term in
                Button { newTerm = false; editing = term } label: {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack { Text(term.short).font(.headline); Spacer(); Text(term.meaning).multilineTextAlignment(.trailing) }
                        if term.disabled == true { Text("Deaktiviert").foregroundStyle(.orange).font(.caption) }
                        if !term.aliases.isEmpty {
                            Text("Weitere Bezeichnungen").font(.caption).foregroundStyle(.secondary)
                            ForEach(term.aliases, id: \.self) { alias in
                                HStack { Text(alias).font(.callout); Spacer() }.padding(.vertical, 2)
                                Divider()
                            }
                        }
                    }
                }.disabled(model.locked)
            }
        }
        .navigationTitle("Globale Begriffe").searchable(text: $filter, prompt: "Kürzel oder Bedeutung")
        .toolbar { Button("Begriff ergänzen", systemImage: "plus") { newTerm = true; editing = Term(short: "", meaning: "") }.disabled(model.locked) }
        .sheet(item: $editing) { term in TermEditor(term: term, isNew: newTerm) }
    }
}

@MainActor struct TermEditor: View {
    @EnvironmentObject var model: AssistantModel
    @Environment(\.dismiss) var dismiss
    @State var term: Term
    let isNew: Bool
    @State private var error = ""
    var body: some View {
        NavigationStack {
            Form {
                Section("Begriff") {
                    TextField("Kürzel", text: $term.short).disabled(!isNew).autocorrectionDisabled()
                    TextField("Bedeutung", text: $term.meaning)
                }
                Section("Weitere Bezeichnungen") {
                    ForEach(term.aliases.indices, id: \.self) { index in
                        HStack {
                            TextField("Weitere Bezeichnung", text: $term.aliases[index])
                            Button { term.aliases.remove(at: index) } label: { Image(systemName: "minus.circle.fill") }.foregroundStyle(.red).accessibilityLabel("Bezeichnung entfernen")
                        }
                    }
                    Button("Zeile hinzufügen", systemImage: "plus") { term.aliases.append("") }.disabled(term.aliases.count >= 30)
                }
                if !isNew {
                    Section { Button("Begriff deaktivieren", role: .destructive) { save(disabled: true) }.disabled(model.locked) }
                }
                if !error.isEmpty { Text(error).foregroundStyle(.red) }
            }
            .navigationTitle(isNew ? "Neuer Begriff" : "Begriff bearbeiten")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Speichern") { save(disabled: false) }.disabled(model.locked) }
            }
        }
    }
    private func save(disabled: Bool) {
        do {
            term.disabled = disabled; term.source = "manual"
            term.aliases = term.aliases.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
            try model.saveTerm(term); dismiss()
        } catch { self.error = error.localizedDescription }
    }
}

@MainActor struct SyncView: View {
    @AppStorage("voiceCloudAllowed") private var voiceCloudAllowed = false
    @AppStorage("voiceGoogleAllowed") private var voiceGoogleAllowed = false
    @EnvironmentObject var store: ProjectStore
    @EnvironmentObject var model: AssistantModel
    @EnvironmentObject var sync: SyncService
    @EnvironmentObject var speech: SpeechService
    @State private var technician = ""
    @State private var serverURL = ""
    @State private var token = ""
    @State private var error = ""
    var body: some View {
        Form {
            Section("App") {
                LabeledContent("Version", value: AppVersion.version)
                LabeledContent("Build", value: AppVersion.build)
            }
            Section("Prüfer") { TextField("Name / Kürzel", text: $technician) }
            Section("KI-Gespräch") {
                Picker("KI-Anbieter", selection: Binding(get: { model.voice.provider }, set: { model.selectVoiceProvider($0) })) {
                    ForEach(VoiceProvider.allCases) { provider in Text(provider.title).tag(provider) }
                }.disabled(model.locked)
                Text("Die Auswahl gilt auch unter Prüfen und bleibt beim nächsten App-Start erhalten. Ein Wechsel beendet das Gespräch; ausgewählter Punkt und Prüfentwürfe bleiben erhalten.").font(.caption)
                if model.voice.provider == .apple {
                    Text("Apple Intelligence verarbeitet den Prüfauftrag auf diesem iPhone. Keine KI-API-Gebühren, kein KI-Server erforderlich. Benötigt ein unterstütztes iPhone, iOS 26 oder neuer und aktivierte Apple Intelligence mit geladenem Modell.").font(.callout)
                    Text("Sprache wird lokal auf Deutsch erkannt und mit der iPhone-Stimme ausgegeben. In dieser Version abwechselnd sprechen und zuhören. Bei fehlender Verfügbarkeit erfolgt kein automatischer Wechsel in die Cloud.").font(.caption)
                    Button("Apple-Verfügbarkeit prüfen", systemImage: "iphone") {
                        Task { await model.voice.checkSetup(server: "", token: "") }
                    }.disabled(model.locked || model.voice.active)
                } else {
                    if model.voice.provider == .google {
                        Toggle("KI-Gespräch mit Google erlauben", isOn: $voiceGoogleAllowed)
                            .onChange(of: voiceGoogleAllowed) { _ in model.stopGuided() }
                        Text("Gemini Live für natürliche Gespräche über Kopfhörer. Benötigt Internet und einen Gemini-API-Schlüssel auf dem eigenen Server.").font(.callout)
                        Text("Ein kostenloses API-Kontingent kann je nach Google-Projekt und Modell verfügbar sein. Kein unbegrenzt kostenloser Betrieb garantiert; Kontingent und Abrechnung in Google AI Studio prüfen.").font(.caption)
                        Text("Beim ausdrücklichen Start werden Audio, Texte, benötigte Punktinformationen und die globale Begriffsliste an Google gesendet. Googles Datenverwendung hängt vom API-Tarif ab. Die kostenlose Stufe kann Inhalte zur Produktverbesserung verwenden.").font(.caption)
                    } else {
                        Toggle("KI-Gespräch mit OpenAI erlauben", isOn: $voiceCloudAllowed)
                            .onChange(of: voiceCloudAllowed) { _ in model.stopGuided() }
                        Text("Vorhandene OpenAI-Realtime-Anbindung. API-Nutzung wird separat abgerechnet; ein ChatGPT-Abonnement enthält diesen Zugang nicht.").font(.caption)
                        Text("Beim ausdrücklichen Start werden Audio, Texte, benötigte Punktinformationen und die globale Begriffsliste an OpenAI gesendet.").font(.caption)
                    }
                    Button("Einstellungen speichern und KI-Server prüfen", systemImage: "network") {
                        if saveSettings() { Task { await model.voice.checkSetup(server: store.data.serverURL, token: TokenStore.read()) } }
                    }.disabled(model.locked || model.voice.checkingSetup || serverURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || token.isEmpty)
                }
                if model.voice.checkingSetup { ProgressView("Serverprüfung …") }
                Text(model.voice.setupStatus).font(.callout)
                Text("Die Prüfung startet kein Mikrofon und kein KI-Gespräch. Controller-Zugangsdaten werden keinem KI-Anbieter übergeben. Ein Gesprächsabschnitt endet nach spätestens 10 Minuten.").font(.caption).foregroundStyle(.secondary)
                Text("Prüfkommentare werden lokal vollständig vorgelesen. Erst danach ausdrücklich Ja oder Nein sagen oder antippen. Ausgänge werden weiterhin nur gelesen.").font(.caption)
            }
            Section("Sprache und Kopfhörer") {
                Toggle("Online-Spracherkennung erlauben", isOn: $speech.allowOnlineRecognition)
                    .onChange(of: speech.allowOnlineRecognition) { _ in speech.stop() }
                Text("Gilt für Sprachbefehle ohne KI-Gespräch. Bei erlaubter Online-Erkennung können Sprachaufnahmen an Apple übertragen werden. Apple-KI und lokale Kommentarbestätigungen verwenden ausschließlich die lokale Erkennung.").font(.caption)
                Text("Headset-Sitzungen laufen in dieser Testversion bei geöffneter App. Beim Sperren, App-Wechsel oder Trennen des Headsets pausiert die Sitzung.").font(.caption)
            }
            Section("Server für KI und gemeinsamen Speicher") {
                TextField("https://eigener-abgleichdienst", text: $serverURL).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    .disabled(model.voice.checkingSetup)
                SecureField("Zugangsschlüssel", text: $token).textInputAutocapitalization(.never).autocorrectionDisabled()
                    .disabled(model.voice.checkingSetup)
                Text("Für Google, OpenAI oder den gemeinsamen Abgleich den eigenen HTTPS-Dienst einrichten. Zugangsschlüssel ist der Schlüssel dieses Dienstes. Gemini- und OpenAI-API-Schlüssel gehören ausschließlich auf den Server. Apple-KI kann ohne diesen Dienst genutzt werden.").font(.caption)
                Button("Einstellungen speichern") { _ = saveSettings() }.disabled(model.locked || model.voice.checkingSetup)
                if !error.isEmpty { Text(error).font(.callout) }
                Button("Jetzt abgleichen", systemImage: "arrow.triangle.2.circlepath") {
                    model.stopGuided()
                    speech.stop()
                    if let engine = model.language { Task { await sync.sync(store: store, engine: engine) } }
                }.disabled(model.locked || store.data.serverURL.isEmpty)
                if sync.busy { ProgressView() }
                Text(sync.status).font(.callout)
                LabeledContent("Projekt-/Begriffsänderungen offen", value: "\(store.data.outbox.count)")
                LabeledContent("Prüfeinträge nur lokal", value: "\(store.data.results.filter { $0.serverStoredAt == nil }.count)")
                if let date = store.data.lastSyncAt { Text("Letzter Abgleich: \(date)").font(.caption) }
            }
            ForEach(store.data.conflicts) { conflict in
                Section("Konflikt: \(conflict.remote.kind == "project" ? "Projekt" : "Begriffsliste")") {
                    Text("Zwei Geräte haben diesen Eintrag geändert. Beide Stände bleiben bis zur Auswahl erhalten.")
                    DisclosureGroup("Eigener Stand") {
                        Text(pretty(store.data.documents.first { $0.id == conflict.id }?.payload ?? "")).font(.caption.monospaced()).textSelection(.enabled)
                    }
                    DisclosureGroup("Gemeinsamer Stand · Revision \(conflict.remote.revision)") {
                        Text(pretty(conflict.remote.payload)).font(.caption.monospaced()).textSelection(.enabled)
                    }
                    Button("Gemeinsamen Stand übernehmen") { resolve(conflict, local: false) }.disabled(model.locked)
                    Button("Eigenen Stand zum Abgleich vormerken") { resolve(conflict, local: true) }.disabled(model.locked)
                }
            }
            Section("Bestätigte Prüfhistorie") {
                if store.data.results.isEmpty { Text("Noch keine Prüfeinträge vorhanden.") }
                ForEach(store.data.results.sorted { $0.recordedAt > $1.recordedAt }) { event in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(event.point.name).font(.headline)
                        Text("\(event.stationIdentity) · \(event.point.terminal) · \(event.point.statusLabel)")
                        if !event.point.testComment.isEmpty { Text(event.point.testComment).font(.callout) }
                        Text("\(event.technician) · \(event.recordedAt)").font(.caption)
                        Label(event.serverStoredAt == nil ? "Controller bestätigt · lokal gespeichert" : "Controller bestätigt · gemeinsam gespeichert", systemImage: event.serverStoredAt == nil ? "internaldrive" : "checkmark.icloud").font(.caption)
                    }
                }
            }
        }
        .navigationTitle("Abgleich & Einstellungen")
        .onAppear { technician = store.data.technician; serverURL = store.data.serverURL; token = TokenStore.read() }
        .onChange(of: serverURL) { _ in model.voice.resetSetupCheck() }
        .onChange(of: token) { _ in model.voice.resetSetupCheck() }
        .onDisappear { if model.voice.checkingSetup { model.voice.resetSetupCheck() } }
    }
    private func saveSettings() -> Bool {
        guard !model.locked, !model.voice.checkingSetup else { return false }
        model.stopGuided(); model.voice.resetSetupCheck()
        do {
            let address = serverURL.trimmingCharacters(in: .whitespacesAndNewlines)
            if !address.isEmpty { _ = try SyncService.checkedURL(address) }
            try TokenStore.save(token)
            try store.update { $0.technician = technician.trimmingCharacters(in: .whitespacesAndNewlines); $0.serverURL = address }
            error = "Einstellungen gespeichert."
            return true
        } catch { self.error = error.localizedDescription; return false }
    }
    private func pretty(_ text: String) -> String {
        guard let data = text.data(using: .utf8), let value = try? JSONSerialization.jsonObject(with: data),
              let formatted = try? JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys]),
              let result = String(data: formatted, encoding: .utf8) else { return text }
        return result
    }
    private func resolve(_ conflict: SyncConflict, local: Bool) {
        do { try store.resolve(conflict, keepLocal: local) } catch { self.error = error.localizedDescription }
    }
}
