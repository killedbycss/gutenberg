import SwiftUI

struct ContentView: View {
    var body: some View {
        NavigationSplitView {
            List {
                Label("Главная", systemImage: "house")
            }
            .navigationTitle("Gutenberg")
        } detail: {
            VStack(spacing: 16) {
                Image(systemName: "text.book.closed")
                    .font(.system(size: 56, weight: .light))
                    .foregroundStyle(.secondary)

                Text("Gutenberg")
                    .font(.largeTitle.bold())

                Text("Нативное приложение для macOS")
                    .font(.title3)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(32)
        }
    }
}

#Preview {
    ContentView()
        .frame(width: 960, height: 640)
}
