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
    @StateObject private var backend = BackendManager.shared

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
        .overlay(alignment: .bottomTrailing) {
            BackendStatusView(backend: backend)
                .padding(12)
        }
        .task { backend.startIfNeeded() }
        .onReceive(NotificationCenter.default.publisher(for: .selectWorkspace)) { note in
            if let workspace = note.object as? Workspace { selection = workspace }
        }
    }
}

private struct BackendStatusView: View {
    @ObservedObject var backend: BackendManager

    var body: some View {
        if backend.state != .ready {
            HStack(spacing: 8) {
                if backend.state == .starting { ProgressView().controlSize(.small) }
                Image(systemName: backend.state == .failed ? "exclamationmark.triangle.fill" : "gearshape.2")
                Text(backend.message)
                if backend.state == .failed {
                    Button("Повторить") { backend.startIfNeeded(force: true) }
                }
            }
            .font(.caption)
            .padding(10)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 10))
        }
    }
}

extension Notification.Name {
    static let selectWorkspace = Notification.Name("Gutenberg.selectWorkspace")
}

#Preview {
    ContentView().frame(width: 1100, height: 720)
}
