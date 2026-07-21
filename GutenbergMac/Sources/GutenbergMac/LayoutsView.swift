import AppKit
import SwiftUI
import UniformTypeIdentifiers

private struct LayoutPreset: Identifiable, Hashable {
    let id: String
    let title: String
    let width: CGFloat
    let height: CGFloat
}

struct LayoutsView: View {
    private let presets = [
        LayoutPreset(id: "post", title: "Пост", width: 1080, height: 1080),
        LayoutPreset(id: "story", title: "История", width: 1080, height: 1920),
        LayoutPreset(id: "cover", title: "Обложка", width: 1600, height: 900),
        LayoutPreset(id: "poster", title: "Постер", width: 1240, height: 1754),
        LayoutPreset(id: "card", title: "Визитка", width: 1050, height: 600)
    ]
    @State private var presetID = "post"
    @State private var title = "Искусство формы"
    @State private var subtitle = "Типографический макет"
    @State private var bodyText = "Добавьте собственный текст и экспортируйте готовую композицию."
    @State private var selectedFont: URL?
    @State private var showingFontImporter = false
    @State private var metricsStatus = "Системный шрифт"

    private var preset: LayoutPreset { presets.first { $0.id == presetID } ?? presets[0] }

    var body: some View {
        HSplitView {
            Form {
                Picker("Назначение", selection: $presetID) { ForEach(presets) { Text($0.title).tag($0.id) } }
                TextField("Заголовок", text: $title)
                TextField("Подзаголовок", text: $subtitle)
                TextField("Текст", text: $bodyText, axis: .vertical).lineLimit(3...8)
                LabeledContent("Шрифт") {
                    HStack { Text(metricsStatus).foregroundStyle(.secondary); Button("Выбрать…") { showingFontImporter = true } }
                }
                Section {
                    Button("Экспортировать PNG…", action: exportPNG).buttonStyle(.borderedProminent)
                }
            }.formStyle(.grouped).frame(minWidth: 340, idealWidth: 380)

            GeometryReader { proxy in
                let available = CGSize(width: max(100, proxy.size.width - 80), height: max(100, proxy.size.height - 80))
                let scale = min(available.width / preset.width, available.height / preset.height)
                layoutCanvas(size: CGSize(width: preset.width * scale, height: preset.height * scale), scale: scale)
                    .position(x: proxy.size.width / 2, y: proxy.size.height / 2)
                    .shadow(color: .black.opacity(0.2), radius: 18, y: 8)
            }.background(Color(nsColor: .windowBackgroundColor))
        }
        .fileImporter(isPresented: $showingFontImporter, allowedContentTypes: [.font]) { result in
            if case .success(let url) = result { selectedFont = url; metricsStatus = url.lastPathComponent; analyzeFont(url) }
        }
    }

    private func layoutCanvas(size: CGSize, scale: CGFloat) -> some View {
        ZStack(alignment: .bottomLeading) {
            LinearGradient(colors: [Color(red: 0.12, green: 0.13, blue: 0.18), Color(red: 0.33, green: 0.18, blue: 0.38)], startPoint: .topLeading, endPoint: .bottomTrailing)
            VStack(alignment: .leading, spacing: 18 * scale) {
                Spacer()
                Text(title).font(.system(size: 82 * scale, weight: .bold, design: .serif)).lineLimit(3)
                Text(subtitle.uppercased()).font(.system(size: 25 * scale, weight: .medium)).tracking(2 * scale)
                Rectangle().frame(height: max(1, 2 * scale)).opacity(0.5)
                Text(bodyText).font(.system(size: 22 * scale)).lineLimit(5).frame(maxWidth: size.width * 0.72, alignment: .leading)
            }.foregroundStyle(.white).padding(size.width * 0.075)
        }.frame(width: size.width, height: size.height).clipped()
    }

    private func analyzeFont(_ url: URL) {
        Task {
            let access = url.startAccessingSecurityScopedResource(); defer { if access { url.stopAccessingSecurityScopedResource() } }
            do {
                _ = try await APIClient.shared.multipart(path: "layouts/api/metrics", files: [url], field: "font")
                metricsStatus = "\(url.lastPathComponent) · метрики загружены"
            } catch { metricsStatus = error.localizedDescription }
        }
    }

    @MainActor private func exportPNG() {
        let renderSize = CGSize(width: preset.width, height: preset.height)
        let renderer = ImageRenderer(content: layoutCanvas(size: renderSize, scale: 1))
        renderer.scale = 1
        guard let image = renderer.nsImage,
              let tiff = image.tiffRepresentation,
              let bitmap = NSBitmapImageRep(data: tiff),
              let data = bitmap.representation(using: .png, properties: [:]) else { return }
        let panel = NSSavePanel(); panel.nameFieldStringValue = "\(preset.id).png"; panel.allowedContentTypes = [.png]
        if panel.runModal() == .OK, let url = panel.url { try? data.write(to: url, options: .atomic) }
    }
}
