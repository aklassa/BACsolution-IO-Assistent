import SwiftUI

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
                            project.stations.append(Station(name: name, origin: try Station.checkedOrigin(origin), identity: label))
                            try store.saveProject(project); dismiss()
                        } catch { self.error = error.localizedDescription }
                    }.disabled(model.locked)
                }
            }
        }
    }
}

@MainActor struct LoginView: View {
    @EnvironmentObject var model: AssistantModel
    @EnvironmentObject var session: LoytecSession
    @Environment(\.dismiss) var dismiss
    var body: some View {
        NavigationStack {
            VStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(session.station?.name ?? "Controller").font(.headline)
                    Text(session.station?.origin ?? "").font(.caption).textSelection(.enabled)
                    Text("Zu prüfen: \(session.station?.identity ?? "")").font(.subheadline)
                    Text(session.pageStatus).font(.caption).foregroundStyle(.secondary)
                }.frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal)
                ControllerWebView(session: session)
                HStack {
                    Button("I/O-Testseite öffnen") { session.openIOPage() }.buttonStyle(.bordered)
                    Button("Identität bestätigt · Lesen") {
                        session.confirmIdentity(); dismiss()
                        Task { await model.reload() }
                    }.buttonStyle(.borderedProminent).disabled(!session.ready || model.locked)
                }.font(.caption).padding()
            }
            .navigationTitle("Controller anmelden").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Schließen") { dismiss() } } }
            .interactiveDismissDisabled(model.busy)
        }
    }
}
