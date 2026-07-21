import SwiftUI

struct SettingsView: View {
    var body: some View {
        Form {
            Text("Настройки приложения")
                .foregroundStyle(.secondary)
        }
        .formStyle(.grouped)
        .frame(width: 420, height: 220)
    }
}
