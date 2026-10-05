import SwiftUI
import UIKit

@MainActor struct ProjectsView: View {
    @EnvironmentObject var store: ProjectStore
    @EnvironmentObject var model: AssistantModel
    @Binding var tab: Int
    @State private var adding = false
    @State private var existing: Project?
    var body: some View {
        List {
            Section {
                Text("I/O-Assistent").font(.largeTitle.bold())
                Text("LOYTEC · Testversion \(AppVersion.version)").foregroundStyle(.secondary)
                Text("Ein- und Ausgänge lesen, Prüfergebnisse dokumentieren und über Kopfhörer arbeiten.")
            }
            if store.projects.isEmpty {
                Section { Text("Lege dein erstes Projekt mit der Controller-Adresse und einer eindeutigen Stationskennung an.") }
            }
            ForEach(store.projects) { project in
                Section(project.name) {
                    ForEach(project.stations) { station in
                        Button {
                            model.connect(project: project, station: station); tab = 1
                        } label: {
                            HStack {
                                Image(systemName: "server.rack")
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(station.name).font(.headline)
                                    Text(station.identity).font(.caption)
                                    Text(station.origin).font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer(); Image(systemName: "chevron.right")
                            }.padding(.vertical, 6)
                        }.disabled(model.locked)
                    }
                    Button("Station ergänzen", systemImage: "plus") { existing = project; adding = true }.disabled(model.locked)
                }
            }
        }
        .navigationTitle("Projekte").navigationBarTitleDisplayMode(.inline)
        .toolbar { Button("Neues Projekt", systemImage: "plus") { existing = nil; adding = true }.disabled(model.locked) }
        .sheet(isPresented: $adding) { ProjectEditor(existing: existing) }
    }
}

@MainActor struct ProjectEditor: View {
    @EnvironmentObject var store: ProjectStore
    @EnvironmentObject var model: AssistantModel
    @Environment(\.dismiss) var dismiss
    let existing: Project?
    @State private var projectName = ""
    @State private var stationName = ""
    @State private var origin = "http://"
    @State private var identity = ""
    @State private var username = ""
    @State private var password = ""
    @State private var error = ""
    var body: some View {
        NavigationStack {
            Form {
                if existing == nil { Section("Projekt") { TextField("Projektname", text: $projectName) } }
                Section("Station") {
                    TextField("Stationsname", text: $stationName)
                    TextField("Controller-Adresse", text: $origin).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    TextField("Seriennummer / eindeutige Stationskennung", text: $identity).textInputAutocapitalization(.never).autocorrectionDisabled()
                    Text("Die Stationskennung verbindet Prüfergebnisse über mehrere Geräte hinweg. Die Adresse darf keine Zugangsdaten enthalten.").font(.caption)
                }
                ControllerCredentialsFields(username: $username, password: $password)
                if !error.isEmpty { Text(error).foregroundStyle(.red) }
            }
            .navigationTitle(existing == nil ? "Neues Projekt" : "Neue Station")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Anlegen") {
                        do {
                            let name = stationName.trimmingCharacters(in: .whitespacesAndNewlines)
                            let label = identity.trimmingCharacters(in: .whitespacesAndNewlines)
                            let title = projectName.trimmingCharacters(in: .whitespacesAndNewlines)
                            guard !name.isEmpty, !label.isEmpty, existing != nil || !title.isEmpty else { throw AppFailure("Bitte alle Felder ausfüllen.") }
                            var project = existing ?? Project(name: title)
                            guard !project.stations.contains(where: { $0.identity.caseInsensitiveCompare(label) == .orderedSame }) else { throw AppFailure("Diese Stationskennung ist im Projekt bereits vorhanden.") }
                            let station = Station(name: name, origin: try Station.checkedOrigin(origin), identity: label)
                            let credentials = try ControllerCredentials(username: username, password: password).validated()
                            try ControllerCredentialStore.save(credentials, for: station)
                            project.stations.append(station)
                            do { try store.saveProject(project) }
                            catch { try? ControllerCredentialStore.remove(for: station); throw error }
                            password = ""; dismiss()
                        } catch { self.error = error.localizedDescription }
                    }.disabled(model.locked)
                }
            }
            .onAppear { model.speech.stop(message: "Sprachbedienung während der Zugangseingabe pausiert.") }
            .onDisappear { password = "" }
        }
    }
}

struct ControllerCredentialsFields: View {
    @Binding var username: String
    @Binding var password: String
    var body: some View {
        Section {
            TextField("Account / Benutzername", text: $username)
                .textContentType(.username).textInputAutocapitalization(.never).autocorrectionDisabled()
                .accessibilityIdentifier("controllerUsername")
            SecureField("Controller-Passwort", text: $password)
                .textContentType(.password).textInputAutocapitalization(.never).autocorrectionDisabled()
                .accessibilityIdentifier("controllerPassword")
        } header: {
            Text("Controller-Zugangsdaten")
        } footer: {
            Text("Für diese Station sicher im Schlüsselbund dieses iPhones gespeichert. Beim nächsten Verbinden automatisch verwendet.")
        }
        .privacySensitive()
    }
}

@MainActor struct LoginView: View {
    @EnvironmentObject var model: AssistantModel
    @EnvironmentObject var session: LoytecSession
    @Environment(\.dismiss) var dismiss
    @State private var username = ""
    @State private var password = ""
    @State private var editingCredentials = false
    @State private var error = ""
    var body: some View {
        NavigationStack {
            Form {
                Section("Station") {
                    Text(session.station?.name ?? "Controller").font(.headline)
                    Text(session.station?.origin ?? "").font(.caption).textSelection(.enabled)
                    Text("Zu prüfen: \(session.station?.identity ?? "")").font(.subheadline)
                    if !session.controllerProduct.isEmpty { Text("Controller: \(session.controllerProduct)") }
                }
                Section("Verbindung") {
                    if session.loading { ProgressView("Controller verbinden …") }
                    Text(session.pageStatus).font(.callout)
                    if !error.isEmpty { Text(error).foregroundStyle(.red) }
                }
                if editingCredentials || (!session.loading && !session.ready) {
                    ControllerCredentialsFields(username: $username, password: $password)
                    Section {
                        Button("Speichern und verbinden", systemImage: "network") { saveAndConnect() }
                            .disabled(session.loading || model.locked)
                            .accessibilityIdentifier("saveControllerLogin")
                    }
                } else {
                    Section {
                        Button("Zugangsdaten ändern", systemImage: "key.fill") { editingCredentials = true }
                            .disabled(session.loading || model.locked)
                    }
                }
                if session.ready {
                    Section {
                        Text("Stationskennung am tatsächlichen Controller vergleichen, dann die Datenpunkte lesen.")
                        Button("Identität bestätigt · Lesen") {
                            session.confirmIdentity(); dismiss()
                            Task { await model.reload() }
                        }.buttonStyle(.borderedProminent).disabled(model.locked)
                    }
                }
            }
            .navigationTitle("Controller verbinden").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Schließen") { dismiss() } } }
            .interactiveDismissDisabled(model.busy)
            .onAppear {
                model.speech.stop(message: "Sprachbedienung während der Anmeldung pausiert.")
                guard let station = session.station else { return }
                do {
                    if let saved = try ControllerCredentialStore.read(for: station) {
                        username = saved.username; password = saved.password
                    } else { editingCredentials = true }
                } catch { self.error = error.localizedDescription; editingCredentials = true }
            }
            .onChange(of: session.ready) { ready in if ready { editingCredentials = false; error = "" } }
            .onDisappear { password = ""; session.cancelLogin() }
        }
    }

    private func saveAndConnect() {
        guard let station = session.station, !session.loading, !model.locked else { return }
        do {
            let credentials = try ControllerCredentials(username: username, password: password).validated()
            try ControllerCredentialStore.save(credentials, for: station)
            UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
            error = ""; editingCredentials = false
            session.connect(station)
        } catch { self.error = error.localizedDescription }
    }
}
