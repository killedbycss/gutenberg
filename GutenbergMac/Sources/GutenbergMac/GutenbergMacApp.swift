import SwiftUI

@main
struct GutenbergMacApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .frame(minWidth: 720, minHeight: 480)
        }
        .defaultSize(width: 960, height: 640)
        .windowResizability(.contentMinSize)

        Settings {
            SettingsView()
        }
        .commands {
            CommandMenu("Инструменты") {
                ForEach(Array(Workspace.allCases.enumerated()), id: \.element) { index, workspace in
                    Button(workspace.rawValue) {
                        NotificationCenter.default.post(name: .selectWorkspace, object: workspace)
                    }
                    .keyboardShortcut(KeyEquivalent(Character("\(index + 1)")), modifiers: .option)
                }
            }
        }
    }
}
