import AppKit
import SwiftUI

struct TypographView: View {
    @State private var source = NSAttributedString(string: "Он сказал: \"Это - лучший шрифт 1990-2000 годов\".\n- А что думает А. С. Иванов?\nThe label \"New Type\" by O'Brien is a must-have - don't miss it.")
    @State private var output = NSAttributedString(string: "")
    @State private var result: TypographResult?
    @State private var keptEditIDs = Set<Int>()
    @State private var showExceptions = false
    @State private var formatCommand: RichTextCommand?
    @State private var textColor = Color.primary
    @State private var highlightColor = Color.yellow.opacity(0.35)
    @State private var resultMode = "html"
    @AppStorage("typograph.rules.quotes") private var quotes = true
    @AppStorage("typograph.rules.dashes") private var dashes = true
    @AppStorage("typograph.rules.nbsp") private var spaces = true
    @AppStorage("typograph.englishDash") private var englishDash = "us"
    @AppStorage("typograph.language") private var language = "auto"
    @AppStorage("typograph.exceptions") private var exceptions = ""

    private var enabled: Set<TypographRuleType> {
        Set([(quotes, .quotes), (dashes, .dashes), (spaces, .nbsp)].compactMap { $0 ? $1 : nil })
    }

    var body: some View {
        HStack(spacing: 0) {
            settings
            Divider()
            VStack(spacing: 0) {
                HStack(spacing: 0) {
                    editorPane(title: "Исходный текст", attributed: $source, editable: true)
                    Divider()
                    resultPane
                }
                Divider()
                HStack {
                    let plain = source.string
                    Text("\(plain.split(whereSeparator: \.isWhitespace).count) сл. · \(plain.count) симв.")
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button("Отменить всё") { keptEditIDs.removeAll(); rebuildOutput() }.disabled(keptEditIDs.isEmpty)
                    Button("Скопировать") {
                        NSPasteboard.general.clearContents()
                        if resultMode == "html" { NSPasteboard.general.setString(outputHTML, forType: .string) }
                        else { NSPasteboard.general.writeObjects([output]) }
                    }.disabled(result == nil)
                    Button("Исправить", action: process).buttonStyle(.borderedProminent).disabled(source.string.isEmpty)
                }.padding(12)
            }
        }
        .sheet(isPresented: $showExceptions) { exceptionsSheet }
    }

    private var settings: some View {
        VStack(alignment: .leading, spacing: 18) {
            GroupBox("Правила") {
                VStack(alignment: .leading, spacing: 10) {
                    Toggle("Кавычки и апострофы", isOn: $quotes)
                    Toggle("Тире", isOn: $dashes)
                    Toggle("Неразрывные пробелы", isOn: $spaces)
                }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 4)
            }
            GroupBox("Язык и стиль") {
                VStack(spacing: 10) {
                    Picker("Язык", selection: $language) { Text("Авто").tag("auto"); Text("Русский").tag("ru"); Text("English").tag("en") }
                    Picker("Английское тире", selection: $englishDash) { Text("US — em dash").tag("us"); Text("UK – en dash").tag("uk") }
                }.padding(.vertical, 4)
            }
            Button { showExceptions = true } label: {
                HStack { Label("Словарь исключений", systemImage: "text.book.closed"); Spacer(); Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary) }
            }.buttonStyle(.plain).padding(.horizontal, 4)
            GroupBox("Исправления") {
                VStack(spacing: 9) {
                    ForEach(TypographRuleType.allCases) { type in
                        HStack { Circle().fill(color(for: type)).frame(width: 8, height: 8); Text(type.title); Spacer(); Text("\(result?.edits.filter { $0.type == type && keptEditIDs.contains($0.id) }.count ?? 0)").monospacedDigit().foregroundStyle(.secondary) }
                    }
                }.padding(.vertical, 4)
            }
            if result != nil { Text("Клик по подсвеченной правке в результате отменяет или возвращает её.").font(.caption).foregroundStyle(.secondary) }
            Spacer()
        }.padding(14).frame(minWidth: 255, idealWidth: 275, maxWidth: 300).background(Color(nsColor: .controlBackgroundColor).opacity(0.45))
    }

    private func editorPane(title: String, attributed: Binding<NSAttributedString>, editable: Bool) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.headline)
            if editable {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 6) {
                        Button { formatCommand = .init(kind: .bold) } label: { Text("B").bold().frame(width: 18) }.help("Полужирный")
                        Button { formatCommand = .init(kind: .italic) } label: { Text("I").italic().frame(width: 18) }.help("Курсив")
                        Button { formatCommand = .init(kind: .underline) } label: { Text("U").underline().frame(width: 18) }.help("Подчёркивание")
                        Button { formatCommand = .init(kind: .strike) } label: { Text("S").strikethrough().frame(width: 18) }.help("Зачёркивание")
                        Spacer()
                    }
                    HStack(spacing: 8) {
                        ColorPicker("Текст", selection: $textColor).fixedSize()
                        Button { formatCommand = .init(kind: .foreground(NSColor(textColor))) } label: { Image(systemName: "checkmark") }.help("Применить цвет текста")
                        Divider().frame(height: 18)
                        ColorPicker("Фон", selection: $highlightColor).fixedSize()
                        Button { formatCommand = .init(kind: .background(NSColor(highlightColor))) } label: { Image(systemName: "checkmark") }.help("Применить цвет фона")
                        Spacer()
                    }
                }.controlSize(.small).padding(.horizontal, 8).padding(.vertical, 7)
                    .background(.quaternary.opacity(0.55), in: RoundedRectangle(cornerRadius: 8))
            }
            RichTextView(
                text: attributed,
                editable: editable,
                command: editable ? formatCommand : nil,
                onEditLink: editable ? nil : { toggleEdit($0) }
            ).background(Color(nsColor: .textBackgroundColor), in: RoundedRectangle(cornerRadius: 8))
        }.padding(12).frame(minWidth: 350, maxWidth: .infinity)
    }

    private var resultPane: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Результат").font(.headline)
                Spacer()
                Picker("Вид результата", selection: $resultMode) {
                    Text("HTML").tag("html")
                    Text("Текст").tag("text")
                }.pickerStyle(.segmented).labelsHidden().frame(width: 130)
            }
            if resultMode == "html" {
                ScrollView([.horizontal, .vertical]) {
                    Text(outputHTML.isEmpty ? "После обработки здесь появится итоговый HTML-код." : outputHTML)
                        .font(.system(.body, design: .monospaced))
                        .foregroundStyle(outputHTML.isEmpty ? .secondary : .primary)
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .topLeading)
                        .padding(12)
                }.background(Color(nsColor: .textBackgroundColor), in: RoundedRectangle(cornerRadius: 8))
            } else {
                RichTextView(text: $output, editable: false, onEditLink: { toggleEdit($0) })
                    .background(Color(nsColor: .textBackgroundColor), in: RoundedRectangle(cornerRadius: 8))
            }
        }.padding(12).frame(minWidth: 350, maxWidth: .infinity)
    }

    private var outputHTML: String {
        guard output.length > 0 else { return "" }
        let clean = NSMutableAttributedString(attributedString: output)
        let fullRange = NSRange(location: 0, length: clean.length)
        clean.enumerateAttribute(.gutenbergCorrection, in: fullRange) { value, range, _ in
            if value != nil { clean.removeAttribute(.backgroundColor, range: range) }
        }
        clean.removeAttribute(.gutenbergCorrection, range: fullRange)
        clean.removeAttribute(.link, range: fullRange)
        var html = ""
        clean.enumerateAttributes(in: fullRange) { attributes, range, _ in
            var fragment = escapeHTML((clean.string as NSString).substring(with: range))
                .replacingOccurrences(of: " ", with: "&nbsp;")
                .replacingOccurrences(of: "\n", with: "<br>\n")

            if let font = attributes[.font] as? NSFont {
                let traits = font.fontDescriptor.symbolicTraits
                if traits.contains(.bold) { fragment = "<strong>\(fragment)</strong>" }
                if traits.contains(.italic) { fragment = "<em>\(fragment)</em>" }
            }
            if (attributes[.underlineStyle] as? Int ?? 0) != 0 { fragment = "<u>\(fragment)</u>" }
            if (attributes[.strikethroughStyle] as? Int ?? 0) != 0 { fragment = "<s>\(fragment)</s>" }

            var styles: [String] = []
            if let color = attributes[.foregroundColor] as? NSColor { styles.append("color: \(htmlColor(color))") }
            if let color = attributes[.backgroundColor] as? NSColor { styles.append("background-color: \(htmlColor(color))") }
            if !styles.isEmpty { fragment = "<span style=\"\(styles.joined(separator: "; "))\">\(fragment)</span>" }
            html += fragment
        }
        return html
    }

    private func escapeHTML(_ value: String) -> String {
        value.replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
    }

    private func htmlColor(_ input: NSColor) -> String {
        guard let color = input.usingColorSpace(.sRGB) else { return "#000000" }
        let red = Int(round(color.redComponent * 255)), green = Int(round(color.greenComponent * 255)), blue = Int(round(color.blueComponent * 255))
        if color.alphaComponent < 0.999 {
            return String(format: "rgba(%d, %d, %d, %.3g)", red, green, blue, color.alphaComponent)
        }
        return String(format: "#%02X%02X%02X", red, green, blue)
    }

    private var exceptionsSheet: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Словарь исключений").font(.title2.bold())
            Text("Один фрагмент на строку. Типограф не будет изменять совпадения.").foregroundStyle(.secondary)
            TextEditor(text: $exceptions).font(.body).frame(minHeight: 240).padding(6).background(.background, in: RoundedRectangle(cornerRadius: 8))
            HStack { Spacer(); Button("Готово") { showExceptions = false }.keyboardShortcut(.defaultAction) }
        }.padding(20).frame(width: 480, height: 360)
    }

    private func process() {
        let options = NativeTypographer.Options(enabled: enabled, englishDash: englishDash, defaultLanguage: language,
                                                 exceptions: exceptions.split(separator: "\n").map(String.init))
        let value = NativeTypographer().process(source.string, options: options)
        result = value; keptEditIDs = Set(value.edits.map(\.id)); rebuildOutput()
    }

    private func rebuildOutput() {
        guard let result else { output = NSAttributedString(string: ""); return }
        let mutable = NSMutableAttributedString(attributedString: source)
        for edit in result.edits.filter({ keptEditIDs.contains($0.id) }).sorted(by: { $0.sourceRange.location > $1.sourceRange.location }) {
            let attributes = edit.sourceRange.location < mutable.length ? mutable.attributes(at: edit.sourceRange.location, effectiveRange: nil) : [:]
            mutable.replaceCharacters(in: edit.sourceRange, with: NSAttributedString(string: edit.replacement, attributes: attributes))
        }
        // Подсветка пересчитывается по фактическому результату, чтобы отменённые правки не оставляли цвет.
        let plain = mutable.string as NSString
        var cursor = 0
        for edit in result.edits where keptEditIDs.contains(edit.id) {
            let search = NSRange(location: cursor, length: max(0, plain.length - cursor))
            let found = plain.range(of: edit.replacement, options: [], range: search)
            if found.location != NSNotFound {
                mutable.addAttribute(.backgroundColor, value: NSColor(color(for: edit.type)).withAlphaComponent(0.22), range: found)
                mutable.addAttribute(.gutenbergCorrection, value: true, range: found)
                mutable.addAttribute(.link, value: "gutenberg-edit:\(edit.id)", range: found)
                cursor = NSMaxRange(found)
            }
        }
        output = mutable
    }

    private func toggleEdit(_ id: Int) {
        if keptEditIDs.contains(id) { keptEditIDs.remove(id) } else { keptEditIDs.insert(id) }
        rebuildOutput()
    }

    private func color(for type: TypographRuleType) -> Color {
        switch type { case .quotes: .purple; case .dashes: .orange; case .nbsp: .blue }
    }
}

struct RichTextCommand {
    enum Kind { case bold, italic, underline, strike, foreground(NSColor), background(NSColor) }
    let id = UUID()
    let kind: Kind
}

struct RichTextView: NSViewRepresentable {
    @Binding var text: NSAttributedString
    let editable: Bool
    var command: RichTextCommand? = nil
    var onEditLink: ((Int) -> Void)? = nil

    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }
    func makeNSView(context: Context) -> NSScrollView {
        let scroll = NSScrollView(); scroll.hasVerticalScroller = true; scroll.borderType = .noBorder
        let view = NSTextView(); view.isRichText = true; view.isEditable = editable; view.allowsUndo = true
        view.isSelectable = true; view.font = .systemFont(ofSize: 15); view.textContainerInset = NSSize(width: 12, height: 12); view.delegate = context.coordinator
        view.linkTextAttributes = [.cursor: NSCursor.pointingHand]
        scroll.documentView = view; view.textStorage?.setAttributedString(text)
        return scroll
    }
    func updateNSView(_ scroll: NSScrollView, context: Context) {
        guard let view = scroll.documentView as? NSTextView else { return }
        context.coordinator.parent = self
        if let command, context.coordinator.lastCommandID != command.id {
            context.coordinator.lastCommandID = command.id
            context.coordinator.apply(command, to: view)
            return
        }
        guard view.attributedString() != text else { return }
        context.coordinator.updating = true; view.textStorage?.setAttributedString(text); context.coordinator.updating = false
    }
    @MainActor final class Coordinator: NSObject, NSTextViewDelegate {
        var parent: RichTextView; var updating = false; var selectedRange = NSRange(location: 0, length: 0); var lastCommandID: UUID?
        init(parent: RichTextView) { self.parent = parent }
        func textDidChange(_ notification: Notification) {
            guard !updating, let view = notification.object as? NSTextView else { return }
            parent.text = view.attributedString()
        }
        func textViewDidChangeSelection(_ notification: Notification) {
            if let view = notification.object as? NSTextView { selectedRange = view.selectedRange() }
        }
        func textView(_ textView: NSTextView, clickedOnLink link: Any, at charIndex: Int) -> Bool {
            guard let value = link as? String, value.hasPrefix("gutenberg-edit:"), let id = Int(value.dropFirst("gutenberg-edit:".count)) else { return false }
            parent.onEditLink?(id); return true
        }
        func apply(_ command: RichTextCommand, to view: NSTextView) {
            let range = selectedRange.length > 0 ? selectedRange : view.selectedRange()
            guard range.length > 0, let storage = view.textStorage else { return }
            switch command.kind {
            case .bold, .italic:
                let manager = NSFontManager.shared
                storage.enumerateAttribute(.font, in: range) { value, subrange, _ in
                    let font = value as? NSFont ?? .systemFont(ofSize: 15)
                    let trait: NSFontTraitMask = command.kind.isBold ? .boldFontMask : .italicFontMask
                    let converted = manager.traits(of: font).contains(trait) ? manager.convert(font, toNotHaveTrait: trait) : manager.convert(font, toHaveTrait: trait)
                    storage.addAttribute(.font, value: converted, range: subrange)
                }
            case .underline:
                toggleAttribute(.underlineStyle, in: range, storage: storage)
            case .strike:
                toggleAttribute(.strikethroughStyle, in: range, storage: storage)
            case .foreground(let color): storage.addAttribute(.foregroundColor, value: color, range: range)
            case .background(let color): storage.addAttribute(.backgroundColor, value: color, range: range)
            }
            parent.text = view.attributedString(); view.setSelectedRange(range)
        }
        private func toggleAttribute(_ key: NSAttributedString.Key, in range: NSRange, storage: NSTextStorage) {
            let current = storage.attribute(key, at: range.location, effectiveRange: nil) as? Int ?? 0
            if current == 0 { storage.addAttribute(key, value: NSUnderlineStyle.single.rawValue, range: range) }
            else { storage.removeAttribute(key, range: range) }
        }
    }
}

private extension RichTextCommand.Kind {
    var isBold: Bool { if case .bold = self { true } else { false } }
}

private extension NSAttributedString.Key {
    static let gutenbergCorrection = NSAttributedString.Key("GutenbergCorrection")
}
