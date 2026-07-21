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
    }
}
