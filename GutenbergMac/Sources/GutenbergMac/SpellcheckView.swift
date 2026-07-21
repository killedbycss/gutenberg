import SwiftUI

struct SpellMatch: Identifiable {
    let id = UUID()
    let offset: Int
    let length: Int
    let message: String
    let type: String
    let replacements: [String]
}

struct SpellcheckView: View {
    @State private var text = "На руском языке можно допустить ашибку."
    @State private var language = "auto"
    @State private var checkStyle = false
    @State private var matches: [SpellMatch] = []
    @State private var isWorking = false
    @State private var error: String?

    var body: some View {
        HSplitView {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Picker("Язык", selection: $language) {
                        Text("Авто").tag("auto"); Text("Русский").tag("ru-RU"); Text("English").tag("en-US")
                    }.frame(width: 180)
                    Toggle("Проверять стиль", isOn: $checkStyle)
                    Spacer()
                    Button("Проверить", action: check).buttonStyle(.borderedProminent).disabled(text.isEmpty || isWorking)
                }
                TextEditor(text: $text).font(.body).padding(8).background(.background, in: RoundedRectangle(cornerRadius: 8))
                Text("\(text.count) знаков").font(.caption).foregroundStyle(.secondary)
            }.padding().frame(minWidth: 460)

            VStack(alignment: .leading) {
                Text("Замечания · \(matches.count)").font(.headline).padding([.top, .horizontal])
                if matches.isEmpty {
                    VStack(spacing: 10) {
                        Image(systemName: "checkmark.circle").font(.system(size: 34)).foregroundStyle(.secondary)
                        Text("Нет замечаний").font(.headline)
                        Text("Запустите проверку текста").font(.caption).foregroundStyle(.secondary)
                    }.frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List(matches) { match in
                        VStack(alignment: .leading, spacing: 7) {
                            Text(fragment(for: match)).font(.headline)
                            Text(match.message).font(.caption).foregroundStyle(.secondary)
                            HStack {
                                ForEach(match.replacements.prefix(3), id: \.self) { replacement in
                                    Button(replacement) { apply(match, replacement: replacement) }
                                }
                            }
                        }.padding(.vertical, 4)
                    }
                }
                if let error { Text(error).foregroundStyle(.red).font(.caption).padding() }
            }.frame(minWidth: 300)
        }
    }

    private func check() {
        isWorking = true; error = nil
        Task {
            do {
                let object = try await APIClient.shared.json(path: "spellcheck/api/check", method: "POST", body: ["text": text, "language": language, "enableStyle": checkStyle])
                matches = (object["matches"] as? [[String: Any]] ?? []).map {
                    SpellMatch(offset: $0["offset"] as? Int ?? 0, length: $0["length"] as? Int ?? 0,
                               message: $0["message"] as? String ?? "", type: $0["type"] as? String ?? "",
                               replacements: $0["replacements"] as? [String] ?? [])
                }
            } catch { self.error = error.localizedDescription }
            isWorking = false
        }
    }

    private func fragment(for match: SpellMatch) -> String {
        guard let range = Range(NSRange(location: match.offset, length: match.length), in: text) else { return "Фрагмент" }
        return String(text[range])
    }

    private func apply(_ match: SpellMatch, replacement: String) {
        guard let range = Range(NSRange(location: match.offset, length: match.length), in: text) else { return }
        text.replaceSubrange(range, with: replacement)
        check()
    }
}
