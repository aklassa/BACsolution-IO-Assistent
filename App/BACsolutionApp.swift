import SwiftUI

@main @MainActor struct BACsolutionApp: App {
    @StateObject private var store: ProjectStore
    @StateObject private var session: LoytecSession
    @StateObject private var speech: SpeechService
    @StateObject private var sync: SyncService
    @StateObject private var model: AssistantModel
    init() {
        let store = ProjectStore(), session = LoytecSession(), speech = SpeechService(), sync = SyncService()
        _store = StateObject(wrappedValue: store); _session = StateObject(wrappedValue: session)
        _speech = StateObject(wrappedValue: speech); _sync = StateObject(wrappedValue: sync)
        _model = StateObject(wrappedValue: AssistantModel(store: store, session: session, speech: speech, sync: sync))
    }
    var body: some Scene {
        WindowGroup {
            RootView().environmentObject(store).environmentObject(session)
                .environmentObject(speech).environmentObject(sync).environmentObject(model)
                .tint(Color(red: 0.04, green: 0.42, blue: 0.45))
        }
    }
}

@MainActor struct RootView: View {
    @EnvironmentObject var model: AssistantModel
    @EnvironmentObject var store: ProjectStore
    @EnvironmentObject var speech: SpeechService
    @EnvironmentObject var session: LoytecSession
    @Environment(\.scenePhase) var scenePhase
    @State private var tab = 0
    var body: some View {
        Group {
            if let error = store.loadFailure {
                VStack(spacing: 20) { Image(systemName: "externaldrive.badge.exclamationmark").font(.largeTitle); Text(error); Text("Vorhandene Daten wurden nicht überschrieben.").foregroundStyle(.secondary) }.padding()
            } else {
                TabView(selection: $tab) {
                    NavigationStack { ProjectsView(tab: $tab) }.tabItem { Label("Projekte", systemImage: "building.2") }.tag(0)
                    NavigationStack { InspectionView() }.tabItem { Label("Prüfen", systemImage: "checklist") }.tag(1)
                    NavigationStack { VocabularyView() }.tabItem { Label("Begriffe", systemImage: "text.book.closed") }.tag(2)
                    NavigationStack { SyncView() }.tabItem { Label("Abgleich", systemImage: "arrow.triangle.2.circlepath") }.tag(3)
                }
            }
        }
        .sheet(isPresented: $model.showLogin) { LoginView() }
        .sheet(item: $model.reviewPoint) { point in ReviewView(point: point) }
        .onChange(of: scenePhase) { phase in
            if phase == .background {
                model.stopGuided(); speech.stop(message: "Sprachsitzung pausiert. In geöffneter App erneut starten.")
                session.setForeground(false)
            } else if phase == .active { session.setForeground(true) }
        }
        .onChange(of: tab) { value in if value != 1 { model.stopGuided() } }
    }
}
