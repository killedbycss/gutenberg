import SwiftUI

enum Workspace: String, CaseIterable, Identifiable {
    case spellcheck = "Орфография"
    case typograph = "Типограф"
    case converter = "Конвертер"
    case layouts = "Макеты"

    var id: Self { self }
    var icon: String {
        switch self {
        case .spellcheck: "text.badge.checkmark"
        case .typograph: "textformat"
        case .converter: "arrow.triangle.2.circlepath"
        case .layouts: "rectangle.3.group"
        }
    }
}

struct ContentView: View {
    @State private var selection = Workspace.spellcheck

    var body: some View {
        VStack(spacing: 0) {
            Picker("Инструмент", selection: $selection) {
                ForEach(Workspace.allCases) { workspace in
                    Label(workspace.rawValue, systemImage: workspace.icon).tag(workspace)
                }
            }
            .pickerStyle(.segmented)
            .padding(12)

            Divider()

            Group {
                switch selection {
                case .spellcheck: SpellcheckView()
                case .typograph: TypographView()
                case .converter: ConverterView()
                case .layouts: LayoutsView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .onReceive(NotificationCenter.default.publisher(for: .selectWorkspace)) { note in
            if let workspace = note.object as? Workspace { selection = workspace }
        }
    }
}

extension Notification.Name {
    static let selectWorkspace = Notification.Name("Gutenberg.selectWorkspace")
}

#Preview {
    ContentView().frame(width: 1100, height: 720)
}
