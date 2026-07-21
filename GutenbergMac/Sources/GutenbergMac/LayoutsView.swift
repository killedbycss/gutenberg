import AppKit
import SwiftUI
import UniformTypeIdentifiers

struct LayoutsView: View {
    @State private var purposeID = LayoutPurpose.all[0].id
    @State private var variant = LayoutVariant.topLeft
    @State private var metrics = FontMetricsInfo()
    @State private var palette = LayoutPurpose.all[0].palette
    @State private var lockedColors = Set<Int>()
    @State private var frames: [LayoutFrame] = []
    @State private var selectedID: String?
    @State private var headline = "Заголовок\nмакета"
    @State private var subhead = "Подзаголовок или слоган"
    @State private var bodyText = "Текст набирается выбранным шрифтом."
    @State private var caption = "студия · 2026"
    @State private var images: [LayoutImage] = []
    @State private var mode = "editor"
    @State private var showingImageImporter = false
    @State private var fontError: String?
    @State private var dragOrigins: [String: CGPoint] = [:]
    @State private var loadingFont = false
    @State private var bentoSeed = Int.random(in: 0...999_999)

    private var purpose: LayoutPurpose { LayoutPurpose.all.first { $0.id == purposeID } ?? LayoutPurpose.all[0] }
    private var selectedIndex: Int? { frames.firstIndex { $0.id == selectedID } }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Picker("Режим", selection: $mode) { Text("Редактор").tag("editor"); Text("Бенто").tag("bento") }.pickerStyle(.segmented).frame(width: 190)
                if mode == "bento" { Button { bentoSeed = Int.random(in: 0...999_999) } label: { Label("Перемешать", systemImage: "shuffle") } }
                Spacer()
                Text("\(Int(purpose.width))×\(Int(purpose.height)) px · \(purpose.dpi) dpi").foregroundStyle(.secondary)
                Button("SVG…", action: exportSVG)
                Button("PNG…", action: exportPNG).buttonStyle(.borderedProminent)
            }.padding(10)
            Divider()

            HStack(spacing: 0) {
                leftSidebar.frame(width: 285)
                Divider()
                Group { if mode == "bento" { bentoView } else { canvasArea } }.frame(maxWidth: .infinity, maxHeight: .infinity)
                Divider()
                properties.frame(width: 285)
            }
        }
        .onAppear { regenerate() }
        .onChange(of: purposeID) { _ in palette = purpose.palette; regenerate() }
        .onChange(of: variant) { _ in regenerate() }
        .onChange(of: images) { _ in regenerate(preserveOverrides: true) }
        .fileImporter(isPresented: $showingImageImporter, allowedContentTypes: [.image], allowsMultipleSelection: true) { importImages($0) }
    }

    private var leftSidebar: some View {
        Form {
            Section("Шрифт") {
                Button(action: chooseFont) {
                    HStack {
                        if loadingFont { ProgressView().controlSize(.small) }
                        Image(systemName: "textformat")
                        Text(loadingFont ? "Загрузка…" : metrics.postScriptName == nil ? "Загрузить шрифт…" : metrics.family).lineLimit(1)
                        Spacer()
                    }
                }.disabled(loadingFont)
                Text("OTF · TTF · WOFF · WOFF2").font(.caption).foregroundStyle(.secondary)
                if metrics.postScriptName != nil {
                    LabeledContent("UPM", value: "\(Int(metrics.unitsPerEm))")
                    LabeledContent("cap-height", value: "\(Int(metrics.capHeight))")
                    LabeledContent("x-height", value: "\(Int(metrics.xHeight))")
                    Text(metrics.source).font(.caption).foregroundStyle(.secondary)
                    if !metrics.hasCyrillic { Label("Кириллица не найдена", systemImage: "exclamationmark.triangle").foregroundStyle(.orange) }
                }
                if let fontError { Text(fontError).font(.caption).foregroundStyle(.red) }
            }
            Section("Назначение") {
                Picker("", selection: $purposeID) { ForEach(LayoutPurpose.all) { Text($0.title).tag($0.id) } }.labelsHidden()
            }
            Section("Композиция") {
                Picker("", selection: $variant) { ForEach(LayoutVariant.allCases) { Text($0.title).tag($0) } }.pickerStyle(.segmented).labelsHidden()
            }
            Section("Контент") {
                TextField("Заголовок", text: $headline, axis: .vertical).lineLimit(2...4)
                TextField("Подзаголовок", text: $subhead, axis: .vertical).lineLimit(1...3)
                TextField("Основной текст", text: $bodyText, axis: .vertical).lineLimit(3...7)
                TextField("Подпись", text: $caption)
            }
            Section("Фон") {
                ColorPicker("Цвет фона", selection: Binding(get: { palette.colors[0] }, set: { palette.colors[0] = $0 }))
                Button("Сбросить раскладку") { regenerate() }
            }
        }.formStyle(.grouped)
    }

    private var canvasArea: some View {
        GeometryReader { proxy in
            let available = CGSize(width: max(100, proxy.size.width - 70), height: max(100, proxy.size.height - 70))
            let scale = min(available.width / purpose.width, available.height / purpose.height)
            layoutCanvas(size: CGSize(width: purpose.width * scale, height: purpose.height * scale), scale: scale, interactive: true)
                .position(x: proxy.size.width / 2, y: proxy.size.height / 2)
                .shadow(color: .black.opacity(0.22), radius: 16, y: 8)
        }.background(Color(nsColor: .windowBackgroundColor))
    }

    private var properties: some View {
        Form {
            Section("Палитра") {
                HStack { Button("Новая") { randomizePalette() }; Spacer(); Button("−") { if palette.colors.count > 2 { palette.colors.removeLast() } }; Text("\(palette.colors.count)").monospacedDigit(); Button("+") { palette.colors.append(.gray) } }
                ForEach(palette.colors.indices, id: \.self) { index in
                    HStack {
                        ColorPicker("Цвет \(index + 1)", selection: Binding(get: { palette.colors[index] }, set: { palette.colors[index] = $0 }))
                        Text(palette.colors[index].hexString).font(.caption.monospaced()).textSelection(.enabled)
                        Button { if lockedColors.contains(index) { lockedColors.remove(index) } else { lockedColors.insert(index) } } label: { Image(systemName: lockedColors.contains(index) ? "lock.fill" : "lock.open") }.buttonStyle(.plain)
                    }
                }
            }
            Section("Изображения") {
                Button("Добавить…") { showingImageImporter = true }
                ForEach(images) { image in
                    HStack { Text(image.name).lineLimit(1); Spacer(); Button(role: .destructive) { images.removeAll { $0.id == image.id } } label: { Image(systemName: "xmark") }.buttonStyle(.plain) }
                }
            }
            Section("Блоки") {
                ForEach(frames.indices, id: \.self) { index in
                    HStack {
                        Button(frames[index].role?.title ?? "Изображение") { selectedID = frames[index].id }.buttonStyle(.plain)
                        Spacer(); Button { frames[index].hidden.toggle() } label: { Image(systemName: frames[index].hidden ? "eye.slash" : "eye") }.buttonStyle(.plain)
                    }.foregroundStyle(selectedID == frames[index].id ? Color.accentColor : .primary)
                }
            }
            if let index = selectedIndex {
                Section("Выбранный блок") {
                    if frames[index].role != nil {
                        Slider(value: $frames[index].fontSize, in: 8...max(40, min(purpose.width, purpose.height) * 0.5)) { Text("Кегль") }
                        LabeledContent("Кегль", value: "\(Int(frames[index].fontSize)) px")
                        ColorPicker("Цвет", selection: $frames[index].color)
                        Picker("Выравнивание", selection: $frames[index].alignment) { Text("Влево").tag(TextAlignment.leading); Text("Центр").tag(TextAlignment.center); Text("Вправо").tag(TextAlignment.trailing) }
                    } else {
                        Picker("Заполнение", selection: $frames[index].imageFit) { Text("Вписать").tag("contain"); Text("Заполнить").tag("cover") }
                        Picker("Слой", selection: $frames[index].zIndex) { Text("Позади текста").tag(1.0); Text("Поверх текста").tag(3.0) }
                    }
                    coordinate("X", index: index, keyPath: \.origin.x)
                    coordinate("Y", index: index, keyPath: \.origin.y)
                    coordinate("Ширина", index: index, keyPath: \.size.width)
                    coordinate("Высота", index: index, keyPath: \.size.height)
                }
            }
        }.formStyle(.grouped)
    }

    private func coordinate(_ label: String, index: Int, keyPath: WritableKeyPath<CGRect, CGFloat>) -> some View {
        let value = Binding<Double>(
            get: { Double(frames[index].box[keyPath: keyPath]) },
            set: { frames[index].box[keyPath: keyPath] = CGFloat(max(0, min(1, $0))) }
        )
        return HStack { Text(label); Spacer(); TextField("%", value: value, format: .number.precision(.fractionLength(3))).frame(width: 70) }
    }

    private var bentoView: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 250, maximum: 360), spacing: 3)], spacing: 3) {
                ForEach(0..<6, id: \.self) { index in
                    let itemVariant = LayoutVariant.allCases[index % LayoutVariant.allCases.count]
                    let itemPurpose = LayoutPurpose.all[index % LayoutPurpose.all.count]
                    let itemPalette = generatedPalette(seed: bentoSeed + index * 97)
                    GeometryReader { proxy in
                        let inset: CGFloat = 18
                        let labelHeight: CGFloat = 38
                        let available = CGSize(width: proxy.size.width - inset * 2, height: proxy.size.height - inset * 2 - labelHeight)
                        let scale = min(available.width / itemPurpose.width, available.height / itemPurpose.height)
                        let itemSize = CGSize(width: itemPurpose.width * scale, height: itemPurpose.height * scale)
                        VStack(spacing: 8) {
                            ZStack {
                                Color(nsColor: .controlBackgroundColor)
                                layoutCanvas(size: itemSize, scale: scale, interactive: false,
                                             framesOverride: NativeLayoutEngine().generate(purpose: itemPurpose, variant: itemVariant, metrics: metrics, palette: itemPalette, images: images),
                                             purposeOverride: itemPurpose, paletteOverride: itemPalette)
                                    .shadow(color: .black.opacity(0.16), radius: 7, y: 3)
                            }
                            HStack(spacing: 6) {
                                Text("\(itemPurpose.title) · \(itemVariant.title)").font(.caption).lineLimit(1)
                                Spacer(minLength: 4)
                                contrastBadge(for: itemPalette)
                            }
                        }.padding(inset)
                    }
                    .aspectRatio(1, contentMode: .fit)
                    .background(Color(nsColor: .controlBackgroundColor).opacity(0.7))
                    .contentShape(Rectangle())
                    .onTapGesture { purposeID = itemPurpose.id; variant = itemVariant; palette = itemPalette; mode = "editor"; regenerate() }
                }
            }.padding(3)
        }
        .background(Color(nsColor: .separatorColor).opacity(0.18))
    }

    private func layoutCanvas(size: CGSize, scale: CGFloat, interactive: Bool, framesOverride: [LayoutFrame]? = nil, purposeOverride: LayoutPurpose? = nil, paletteOverride: LayoutPalette? = nil) -> some View {
        let currentPurpose = purposeOverride ?? purpose
        let currentPalette = paletteOverride ?? palette
        let currentFrames = framesOverride ?? frames
        return ZStack(alignment: .topLeading) {
            currentPalette.background
            if let safe = currentPurpose.safeZone {
                Rectangle().strokeBorder(.white.opacity(0.25), style: StrokeStyle(lineWidth: 1, dash: [5])).frame(width: safe.width * size.width, height: safe.height * size.height).offset(x: safe.minX * size.width, y: safe.minY * size.height)
            }
            ForEach(currentFrames.sorted(by: { $0.zIndex < $1.zIndex })) { frame in
                if !frame.hidden {
                    placedFrame(frame, size: size, scale: scale, interactive: interactive)
                }
            }
        }.frame(width: size.width, height: size.height).clipped()
    }

    @ViewBuilder private func placedFrame(_ frame: LayoutFrame, size: CGSize, scale: CGFloat, interactive: Bool) -> some View {
        let width = frame.box.width * size.width
        let height = frame.box.height * size.height
        let center = CGPoint(x: frame.box.midX * size.width, y: frame.box.midY * size.height)
        if interactive {
            frameView(frame, scale: scale)
                .frame(width: width, height: height)
                .overlay(Rectangle().stroke(selectedID == frame.id ? Color.accentColor : .clear, lineWidth: 2))
                .contentShape(Rectangle())
                .position(center)
                .highPriorityGesture(
                    DragGesture(minimumDistance: 1, coordinateSpace: .global)
                        .onChanged { value in
                            selectedID = frame.id
                            move(frame.id, translation: value.translation, canvas: size)
                        }
                        .onEnded { _ in dragOrigins[frame.id] = nil }
                )
                .onTapGesture { selectedID = frame.id }
        } else {
            frameView(frame, scale: scale).frame(width: width, height: height).position(center)
        }
    }

    @ViewBuilder private func frameView(_ frame: LayoutFrame, scale: CGFloat) -> some View {
        if let role = frame.role {
            Text(text(for: role)).font(metrics.postScriptName.map { .custom($0, size: frame.fontSize * scale) } ?? .system(size: frame.fontSize * scale, weight: role == .headline ? .bold : .regular, design: .serif))
                .foregroundStyle(frame.color)
                .multilineTextAlignment(frame.alignment)
                .lineSpacing(frame.fontSize * scale * max(0, frame.lineHeight - 1))
                .lineLimit(maxLines(for: role))
                .minimumScaleFactor(0.28)
                .allowsTightening(true)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: alignment(for: frame.alignment))
        } else if let id = frame.imageID, let image = images.first(where: { $0.id == id }), let nsImage = NSImage(data: image.data) {
            Image(nsImage: nsImage).resizable().aspectRatio(contentMode: frame.imageFit == "cover" ? .fill : .fit).clipped()
        }
    }

    private func text(for role: LayoutRole) -> String { switch role { case .headline: headline; case .subhead: subhead; case .body: bodyText; case .caption: caption } }
    private func maxLines(for role: LayoutRole) -> Int { switch role { case .headline: 3; case .subhead: 2; case .body: 6; case .caption: 2 } }
    private func alignment(for value: TextAlignment) -> Alignment { switch value { case .center: .center; case .trailing: .trailing; default: .leading } }
    private func previewSize(for purpose: LayoutPurpose, width: CGFloat) -> CGSize {
        let maxHeight: CGFloat = 320
        let scale = min(width / purpose.width, maxHeight / purpose.height)
        return CGSize(width: purpose.width * scale, height: purpose.height * scale)
    }

    private func regenerate(preserveOverrides: Bool = false) {
        let generated = NativeLayoutEngine().generate(purpose: purpose, variant: variant, metrics: metrics, palette: palette, images: images)
        if preserveOverrides {
            frames = generated.map { fresh in frames.first(where: { $0.id == fresh.id }) ?? fresh }
        } else { frames = generated }
        selectedID = nil
    }

    private func move(_ id: String, translation: CGSize, canvas: CGSize) {
        guard let index = frames.firstIndex(where: { $0.id == id }) else { return }
        let origin = dragOrigins[id] ?? frames[index].box.origin
        dragOrigins[id] = origin
        frames[index].box.origin.x = min(1 - frames[index].box.width, max(0, origin.x + translation.width / canvas.width))
        frames[index].box.origin.y = min(1 - frames[index].box.height, max(0, origin.y + translation.height / canvas.height))
    }

    private func chooseFont() {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = false; panel.canChooseDirectories = false
        panel.allowedContentTypes = ["otf", "ttf", "woff", "woff2", "ttc"].compactMap { UTType(filenameExtension: $0) }
        panel.message = "Выберите шрифт OTF, TTF, WOFF или WOFF2"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        importFont(url)
    }

    private func importFont(_ url: URL) {
        fontError = nil
        loadingFont = true
        Task {
            let access = url.startAccessingSecurityScopedResource(); defer { if access { url.stopAccessingSecurityScopedResource() } }
            do {
                let data = try await ConverterService.shared.fontForPreview(from: url)
                metrics = try FontLoader.load(data: data, name: url.deletingPathExtension().lastPathComponent)
                regenerate()
            } catch { fontError = error.localizedDescription }
            loadingFont = false
        }
    }

    private func importImages(_ result: Result<[URL], Error>) {
        guard case .success(let urls) = result else { return }
        for url in urls {
            let access = url.startAccessingSecurityScopedResource(); defer { if access { url.stopAccessingSecurityScopedResource() } }
            if let data = try? Data(contentsOf: url) { images.append(LayoutImage(data: data, name: url.lastPathComponent)) }
        }
    }

    private func randomizePalette() { palette = generatedPalette(seed: Int.random(in: 0...999_999), preserving: palette, locked: lockedColors) }
    private func generatedPalette(seed: Int, preserving: LayoutPalette? = nil, locked: Set<Int> = []) -> LayoutPalette {
        var colors = preserving?.colors ?? Array(repeating: .black, count: 5)
        if colors.count < 5 { colors += Array(repeating: .gray, count: 5 - colors.count) }
        for index in colors.indices where !locked.contains(index) {
            let hue = Double((seed * 47 + index * 71) % 360) / 360
            colors[index] = Color(hue: hue, saturation: index == 0 ? 0.68 : 0.52, brightness: index == 0 ? 0.22 : (index == 1 ? 0.96 : 0.74))
        }
        return LayoutPalette(colors: colors)
    }

    private func contrastBadge(for palette: LayoutPalette) -> some View {
        let ratio = contrastRatio(palette.foreground, palette.background)
        let level = ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : "Низкий"
        let color: Color = ratio >= 7 ? .green : ratio >= 4.5 ? .orange : .red
        return HStack(spacing: 3) {
            Image(systemName: ratio >= 4.5 ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
            Text("\(level) \(ratio, specifier: "%.1f"):1")
        }
        .font(.system(size: 9, weight: .semibold))
        .foregroundStyle(color)
        .padding(.horizontal, 5).padding(.vertical, 3)
        .background(color.opacity(0.12), in: Capsule())
        .help("Контраст основного текста и фона по WCAG")
    }

    private func contrastRatio(_ foreground: Color, _ background: Color) -> Double {
        let first = relativeLuminance(foreground), second = relativeLuminance(background)
        return (max(first, second) + 0.05) / (min(first, second) + 0.05)
    }

    private func relativeLuminance(_ input: Color) -> Double {
        guard let color = NSColor(input).usingColorSpace(.sRGB) else { return 0 }
        func linear(_ component: CGFloat) -> Double {
            let value = Double(component)
            return value <= 0.04045 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * linear(color.redComponent) + 0.7152 * linear(color.greenComponent) + 0.0722 * linear(color.blueComponent)
    }

    @MainActor private func exportPNG() {
        let renderer = ImageRenderer(content: layoutCanvas(size: CGSize(width: purpose.width, height: purpose.height), scale: 1, interactive: false))
        guard let image = renderer.nsImage, let tiff = image.tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiff), let data = bitmap.representation(using: .png, properties: [:]) else { return }
        save(data, name: "\(purpose.id).png", type: .png)
    }

    private func exportSVG() {
        var svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"\(Int(purpose.width))\" height=\"\(Int(purpose.height))\" viewBox=\"0 0 \(Int(purpose.width)) \(Int(purpose.height))\"><rect width=\"100%\" height=\"100%\" fill=\"\(palette.background.hexString)\"/>"
        if let data = metrics.data, let name = metrics.postScriptName { svg += "<style>@font-face{font-family:'GutenbergFont';src:url(data:font/otf;base64,\(data.base64EncodedString()))}text{font-family:'GutenbergFont','serif'}</style><!-- \(name) -->" }
        for frame in frames where !frame.hidden {
            let x = frame.box.minX * purpose.width, y = frame.box.minY * purpose.height, w = frame.box.width * purpose.width
            if let role = frame.role {
                let anchor = frame.alignment == .center ? "middle" : frame.alignment == .trailing ? "end" : "start"
                let tx = frame.alignment == .center ? x + w / 2 : frame.alignment == .trailing ? x + w : x
                let lines = text(for: role).split(separator: "\n", omittingEmptySubsequences: false)
                svg += "<text x=\"\(tx)\" y=\"\(y + frame.fontSize)\" fill=\"\(frame.color.hexString)\" font-size=\"\(frame.fontSize)\" text-anchor=\"\(anchor)\">"
                for (index, line) in lines.enumerated() { svg += "<tspan x=\"\(tx)\" dy=\"\(index == 0 ? 0 : frame.fontSize * frame.lineHeight)\">\(escapeXML(String(line)))</tspan>" }
                svg += "</text>"
            } else if let id = frame.imageID, let image = images.first(where: { $0.id == id }) {
                svg += "<image x=\"\(x)\" y=\"\(y)\" width=\"\(w)\" height=\"\(frame.box.height * purpose.height)\" href=\"data:image/png;base64,\(image.data.base64EncodedString())\" preserveAspectRatio=\"xMidYMid \(frame.imageFit == "cover" ? "slice" : "meet")\"/>"
            }
        }
        svg += "</svg>"; save(Data(svg.utf8), name: "\(purpose.id).svg", type: .svg)
    }

    private func save(_ data: Data, name: String, type: UTType) {
        let panel = NSSavePanel(); panel.nameFieldStringValue = name; panel.allowedContentTypes = [type]
        if panel.runModal() == .OK, let url = panel.url { try? data.write(to: url, options: .atomic) }
    }
    private func escapeXML(_ value: String) -> String { value.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;") }
}
