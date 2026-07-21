import AppKit
import SwiftUI

struct TypographView: View {
    @State private var source = NSAttributedString(string: "Он сказал: \"Это - лучший шрифт 1990-2000 годов\".\n- А что думает А. С. Иванов?\nThe label \"New Type\" by O'Brien is a must-have - don't miss it.")
    @State private var output = NSAttributedString(string: "")
    @State private var result: TypographResult?
    @State private var keptEditIDs = Set<Int>()
    @State private var showExceptions = false
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
        HSplitView {
            settings
            VStack(spacing: 0) {
                HSplitView {
                    editorPane(title: "Исходный текст", attributed: $source, editable: true)
                    editorPane(title: "Результат", attributed: $output, editable: false)
                }
                Divider()
                HStack {
                    let plain = source.string
                    Text("\(plain.split(whereSeparator: \.isWhitespace).count) сл. · \(plain.count) симв.")
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button("Отменить всё") { keptEditIDs.removeAll(); rebuildOutput() }.disabled(keptEditIDs.isEmpty)
                    Button("Скопировать") { NSPasteboard.general.clearContents(); NSPasteboard.general.writeObjects([output]) }.disabled(result == nil)
                    Button("Исправить", action: process).buttonStyle(.borderedProminent).disabled(source.string.isEmpty)
                }.padding(12)
            }
        }
        .sheet(isPresented: $showExceptions) { exceptionsSheet }
    }

    private var settings: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Правила").font(.headline)
            Toggle("Кавычки и апострофы", isOn: $quotes)
            Toggle("Тире", isOn: $dashes)
            Toggle("Неразрывные пробелы", isOn: $spaces)
            Divider()
            Picker("Язык", selection: $language) { Text("Авто").tag("auto"); Text("Русский").tag("ru"); Text("English").tag("en") }
            Picker("Тире в английском", selection: $englishDash) { Text("US — em dash").tag("us"); Text("UK – en dash").tag("uk") }
            Button { showExceptions = true } label: { Label("Словарь исключений", systemImage: "text.book.closed") }
            Divider()
            Text("Исправления").font(.headline)
            ForEach(TypographRuleType.allCases) { type in
                HStack { Circle().fill(color(for: type)).frame(width: 8, height: 8); Text(type.title); Spacer(); Text("\(result?.edits.filter { $0.type == type && keptEditIDs.contains($0.id) }.count ?? 0)").monospacedDigit() }
            }
            if let result, !result.edits.isEmpty {
                Divider()
                ScrollView {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(result.edits) { edit in
                            Button {
                                if keptEditIDs.contains(edit.id) { keptEditIDs.remove(edit.id) } else { keptEditIDs.insert(edit.id) }
                                rebuildOutput()
                            } label: {
                                HStack(alignment: .top) {
                                    Image(systemName: keptEditIDs.contains(edit.id) ? "checkmark.circle.fill" : "arrow.uturn.backward.circle")
                                        .foregroundStyle(color(for: edit.type))
                                    VStack(alignment: .leading) { Text(edit.replacement.replacingOccurrences(of: " ", with: "·")); Text(edit.message).font(.caption).foregroundStyle(.secondary) }
                                }
                            }.buttonStyle(.plain)
                        }
                    }
                }
            }
            Spacer()
        }.padding().frame(minWidth: 245, idealWidth: 270, maxWidth: 300)
    }

    private func editorPane(title: String, attributed: Binding<NSAttributedString>, editable: Bool) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(title).font(.headline)
                Spacer()
                if editable {
                    Button { NSApp.sendAction(Selector(("toggleBoldface:")), to: nil, from: nil) } label: { Text("B").bold() }
                    Button { NSApp.sendAction(Selector(("toggleItalics:")), to: nil, from: nil) } label: { Text("I").italic() }
                    Button { NSApp.sendAction(Selector(("underline:")), to: nil, from: nil) } label: { Text("U").underline() }
                }
            }
            RichTextView(text: attributed, editable: editable).background(Color(nsColor: .textBackgroundColor), in: RoundedRectangle(cornerRadius: 8))
        }.padding().frame(minWidth: 330)
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
                cursor = NSMaxRange(found)
            }
        }
        output = mutable
    }

    private func color(for type: TypographRuleType) -> Color {
        switch type { case .quotes: .purple; case .dashes: .orange; case .nbsp: .blue }
    }
}

struct RichTextView: NSViewRepresentable {
    @Binding var text: NSAttributedString
    let editable: Bool

    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }
    func makeNSView(context: Context) -> NSScrollView {
        let scroll = NSScrollView(); scroll.hasVerticalScroller = true; scroll.borderType = .noBorder
        let view = NSTextView(); view.isRichText = true; view.isEditable = editable; view.allowsUndo = true
        view.font = .systemFont(ofSize: 15); view.textContainerInset = NSSize(width: 12, height: 12); view.delegate = context.coordinator
        scroll.documentView = view; view.textStorage?.setAttributedString(text)
        return scroll
    }
    func updateNSView(_ scroll: NSScrollView, context: Context) {
        guard let view = scroll.documentView as? NSTextView, view.attributedString() != text else { return }
        context.coordinator.updating = true; view.textStorage?.setAttributedString(text); context.coordinator.updating = false
    }
    final class Coordinator: NSObject, NSTextViewDelegate {
        var parent: RichTextView; var updating = false
        init(parent: RichTextView) { self.parent = parent }
        func textDidChange(_ notification: Notification) {
            guard !updating, let view = notification.object as? NSTextView else { return }
            parent.text = view.attributedString()
        }
    }
}
