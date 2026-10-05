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
                Toggle("KI-Gespräch mit OpenAI erlauben", isOn: $voiceCloudAllowed)
                    .onChange(of: voiceCloudAllowed) { _ in model.stopGuided() }
                Text("Beim Start werden Sprache, benötigte Datenpunktinformationen und die globale Begriffsliste an OpenAI übertragen. Die Antworten werden von einer KI gesprochen. Controller-Passwörter werden nicht übertragen.").font(.caption)
                Text("Verwendet die unten eingetragene Server-Adresse und den Zugangsschlüssel. Der Server benötigt zusätzlich einen OpenAI-API-Schlüssel. Eine Test-Sitzung endet nach spätestens 10 Minuten; sie kann anschließend neu gestartet werden.").font(.caption)
                Text("Prüfkommentare werden zur Bestätigung mit der lokalen iPhone-Stimme vorgelesen. Während dieses Vorlesens pausiert das Mikrofon. Erst danach Ja oder Nein sagen.").font(.caption)
            }
            Section("Sprache und Kopfhörer") {
                Toggle("Online-Spracherkennung erlauben", isOn: $speech.allowOnlineRecognition)
                    .onChange(of: speech.allowOnlineRecognition) { _ in speech.stop() }
                Text("Standard ist lokale Erkennung, soweit das iPhone Deutsch offline unterstützt. Bei erlaubter Online-Erkennung können Sprachaufnahmen an Apple übertragen werden.").font(.caption)
                Text("Headset-Sitzungen laufen in dieser Testversion bei geöffneter App. Beim Sperren, App-Wechsel oder Trennen des Headsets pausiert die Sitzung.").font(.caption)
            }
            Section("Gemeinsamer Speicher") {
                TextField("https://eigener-abgleichdienst", text: $serverURL).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                SecureField("Zugangsschlüssel", text: $token).textInputAutocapitalization(.never).autocorrectionDisabled()
                Text("Der vorbereitete Abgleichdienst muss zuerst eingerichtet werden. Hier ist noch kein Cloud-Dienst hinterlegt.").font(.caption)
                Button("Einstellungen speichern") {
                    model.stopGuided()
                    do {
                        let address = serverURL.trimmingCharacters(in: .whitespacesAndNewlines)
                        if !address.isEmpty { _ = try SyncService.checkedURL(address) }
                        try TokenStore.save(token)
                        try store.update { $0.technician = technician.trimmingCharacters(in: .whitespacesAndNewlines); $0.serverURL = address }
                        error = "Einstellungen gespeichert."
                    } catch { self.error = error.localizedDescription }
                }.disabled(model.locked)
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
