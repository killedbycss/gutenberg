import AppKit
import SwiftUI
import UniformTypeIdentifiers

struct ConverterView: View {
    @State private var files: [URL] = []
    @State private var targets: Set<String> = ["woff2"]
    @State private var showingImporter = false
    @State private var isWorking = false
    @State private var status = "Добавьте OTF, TTF, WOFF, WOFF2 или изображение"
    private let formats = ["otf", "ttf", "woff", "woff2", "png", "jpg", "webp"]

    var body: some View {
        VStack(spacing: 16) {
            GroupBox("Исходные файлы") {
                VStack(spacing: 10) {
                    if files.isEmpty {
                        VStack(spacing: 10) {
                            Image(systemName: "doc.badge.plus").font(.system(size: 34)).foregroundStyle(.secondary)
                            Text("Файлы не выбраны").font(.headline)
                            Text(status).font(.caption).foregroundStyle(.secondary)
                        }.frame(maxWidth: .infinity).frame(height: 180)
                    } else {
                        List(files, id: \.self) { file in
                            HStack { Image(systemName: "doc"); Text(file.lastPathComponent); Spacer(); Text(byteSize(file)).foregroundStyle(.secondary) }
                        }.frame(minHeight: 180)
                    }
                    HStack {
                        Button("Добавить файлы…") { showingImporter = true }
                        Button("Очистить") { files.removeAll() }.disabled(files.isEmpty)
                        Spacer()
                    }
                }.padding(8)
            }

            GroupBox("Форматы результата") {
                HStack {
                    ForEach(formats, id: \.self) { format in
                        Toggle(format.uppercased(), isOn: Binding(
                            get: { targets.contains(format) },
                            set: { enabled in
                                if enabled { targets.insert(format) } else { targets.remove(format) }
                            }
                        )).toggleStyle(.button)
                    }
                    Spacer()
                    Button("Конвертировать…", action: convert).buttonStyle(.borderedProminent)
                        .disabled(files.isEmpty || targets.isEmpty || isWorking)
                }.padding(8)
            }

            HStack { if isWorking { ProgressView().controlSize(.small) }; Text(status).foregroundStyle(.secondary); Spacer() }
            Spacer()
        }
        .padding()
        .fileImporter(isPresented: $showingImporter, allowedContentTypes: [.font, .image], allowsMultipleSelection: true) { result in
            if case .success(let urls) = result { files = urls; status = "Выбрано файлов: \(urls.count)" }
        }
    }

    private func convert() {
        isWorking = true; status = "Конвертация…"
        Task {
            let accessed = files.filter { $0.startAccessingSecurityScopedResource() }
            defer { accessed.forEach { $0.stopAccessingSecurityScopedResource() } }
            do {
                let values = targets.sorted().map { ("targets", $0) }
                let (data, _) = try await APIClient.shared.multipart(path: "converter/api/convert", files: files, field: "fonts", values: values)
                let panel = NSSavePanel()
                panel.nameFieldStringValue = "converted-files.zip"
                panel.allowedContentTypes = [.zip]
                if panel.runModal() == .OK, let url = panel.url {
                    try data.write(to: url, options: .atomic)
                    status = "Готово: \(url.lastPathComponent)"
                } else { status = "Сохранение отменено" }
            } catch { status = error.localizedDescription }
            isWorking = false
        }
    }

    private func byteSize(_ url: URL) -> String {
        let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        return ByteCountFormatter.string(fromByteCount: Int64(size), countStyle: .file)
    }
}
