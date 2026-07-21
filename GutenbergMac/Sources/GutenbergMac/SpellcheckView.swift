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
    @State private var showDictionary = false
    @AppStorage("spellcheck.dictionary") private var dictionary = ""

    var body: some View {
        HSplitView {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Picker("Язык", selection: $language) {
                        Text("Авто").tag("auto"); Text("Русский").tag("ru-RU"); Text("English").tag("en-US")
                    }.frame(width: 180)
                    Toggle("Проверять стиль", isOn: $checkStyle)
                    Button { showDictionary = true } label: { Label("Словарь", systemImage: "text.book.closed") }
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
                                Button("В словарь") { addToDictionary(fragment(for: match)); check() }
                            }
                        }.padding(.vertical, 4)
                    }
                }
                if let error { Text(error).foregroundStyle(.red).font(.caption).padding() }
            }.frame(minWidth: 300)
        }
        .sheet(isPresented: $showDictionary) {
            VStack(alignment: .leading, spacing: 12) {
                Text("Пользовательский словарь").font(.title2.bold())
                Text("По одному слову на строку").foregroundStyle(.secondary)
                TextEditor(text: $dictionary).frame(minHeight: 260).padding(6).background(.background, in: RoundedRectangle(cornerRadius: 8))
                HStack { Spacer(); Button("Готово") { showDictionary = false }.keyboardShortcut(.defaultAction) }
            }.padding(20).frame(width: 460, height: 380)
        }
    }

    private func check() {
        isWorking = true; error = nil
        Task {
            do {
                let object = try await LanguageToolService.shared.check(text: text, language: language, style: checkStyle)
                let words = Set(dictionary.split(whereSeparator: \.isNewline).map { $0.lowercased() })
                matches = (object["matches"] as? [[String: Any]] ?? []).compactMap {
                    let rule = $0["rule"] as? [String: Any] ?? [:]
                    let category = rule["category"] as? [String: Any] ?? [:]
                    let issue = rule["issueType"] as? String ?? ""
                    let type = issue.contains("misspelling") ? "spelling" : (category["id"] as? String == "PUNCTUATION" ? "punctuation" : "grammar")
                    let candidate = SpellMatch(offset: $0["offset"] as? Int ?? 0, length: $0["length"] as? Int ?? 0,
                                               message: $0["message"] as? String ?? "", type: type,
                                               replacements: ($0["replacements"] as? [[String: Any]] ?? []).compactMap { $0["value"] as? String })
                    if type == "spelling" && words.contains(fragment(for: candidate).lowercased()) { return nil }
                    return candidate
                }
            } catch { self.error = error.localizedDescription }
            isWorking = false
        }
    }

    private func addToDictionary(_ word: String) {
        var words = dictionary.split(whereSeparator: \.isNewline).map(String.init)
        if !words.contains(where: { $0.caseInsensitiveCompare(word) == .orderedSame }) { words.append(word) }
        dictionary = words.sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }.joined(separator: "\n")
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

struct LanguageToolService: Sendable {
    static let shared = LanguageToolService()
    func check(text: String, language: String, style: Bool) async throws -> [String: Any] {
        var components = URLComponents()
        components.queryItems = [
            URLQueryItem(name: "text", value: text), URLQueryItem(name: "language", value: language),
            URLQueryItem(name: "level", value: style ? "picky" : "default"),
            URLQueryItem(name: "disabledCategories", value: style ? "" : "STYLE"),
        ]
        var request = URLRequest(url: URL(string: "https://api.languagetool.org/v2/check")!)
        request.httpMethod = "POST"; request.httpBody = components.percentEncodedQuery?.data(using: .utf8)
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 30
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else { throw APIError.message("LanguageTool недоступен") }
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw APIError.message("Некорректный ответ LanguageTool") }
        return object
    }
}
