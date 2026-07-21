import Foundation

enum TypographRuleType: String, CaseIterable, Identifiable, Codable {
    case quotes, dashes, nbsp
    var id: String { rawValue }
    var title: String {
        switch self { case .quotes: "Кавычки"; case .dashes: "Тире"; case .nbsp: "Пробелы" }
    }
    var colorName: String {
        switch self { case .quotes: "purple"; case .dashes: "orange"; case .nbsp: "blue" }
    }
}

struct TypographEdit: Identifiable, Hashable {
    let id: Int
    var range: NSRange
    var sourceRange: NSRange
    var original: String
    var replacement: String
    var type: TypographRuleType
    var rule: String
    var message: String
}

struct TypographResult {
    let text: String
    let edits: [TypographEdit]
}

struct NativeTypographer {
    struct Options {
        var enabled = Set(TypographRuleType.allCases)
        var englishDash = "us"
        var defaultLanguage = "auto"
        var exceptions: [String] = []
    }

    private struct Replacement {
        let range: NSRange
        let text: String
        let type: TypographRuleType
        let rule: String
        let message: String
    }

    func process(_ source: String, options: Options) -> TypographResult {
        var text = source
        var map = Array(0...source.utf16.count)
        var edits: [TypographEdit] = []

        let passes: [(String) -> [Replacement]] = [
            { quoteReplacements($0, options: options) },
            { apostropheReplacements($0) },
            { dialogueDashReplacements($0, options: options) },
            { thoughtDashReplacements($0, options: options) },
            { rangeDashReplacements($0) },
            { shortWordReplacements($0, options: options) },
            { initialsReplacements($0) },
            { dashSpaceReplacements($0) },
        ]

        for pass in passes {
            let replacements = pass(text).filter { options.enabled.contains($0.type) }
            apply(replacements, source: source, text: &text, map: &map, edits: &edits, exceptions: options.exceptions)
        }

        edits.sort { $0.range.location < $1.range.location }
        for index in edits.indices { edits[index] = editWithID(edits[index], id: index) }
        return TypographResult(text: text, edits: edits)
    }

    func resultByKeeping(_ keptIDs: Set<Int>, from original: String, result: TypographResult) -> String {
        let mutable = NSMutableString(string: original)
        for edit in result.edits.filter({ keptIDs.contains($0.id) }).sorted(by: { $0.sourceRange.location > $1.sourceRange.location }) {
            mutable.replaceCharacters(in: edit.sourceRange, with: edit.replacement)
        }
        return mutable as String
    }

    private func apply(_ raw: [Replacement], source: String, text: inout String, map: inout [Int], edits: inout [TypographEdit], exceptions: [String]) {
        let protected = protectedRanges(in: text, exceptions: exceptions)
        let sorted = raw.sorted { $0.range.location < $1.range.location }
        var clean: [Replacement] = []
        var lastEnd = -1
        for item in sorted where item.range.location >= lastEnd && !protected.contains(where: { NSIntersectionRange($0, item.range).length > 0 }) {
            clean.append(item); lastEnd = NSMaxRange(item.range)
        }
        guard !clean.isEmpty else { return }

        let mutable = NSMutableString(string: text)
        var delta = 0
        for replacement in clean {
            let current = NSRange(location: replacement.range.location + delta, length: replacement.range.length)
            let sourceStart = map[min(replacement.range.location, map.count - 1)]
            let sourceEnd = map[min(NSMaxRange(replacement.range), map.count - 1)]
            let sourceRange = NSRange(location: sourceStart, length: max(0, sourceEnd - sourceStart))
            let original = (source as NSString).substring(with: sourceRange)
            mutable.replaceCharacters(in: current, with: replacement.text)
            let newLength = replacement.text.utf16.count
            map.replaceSubrange(replacement.range.location..<NSMaxRange(replacement.range), with: Array(repeating: sourceStart, count: newLength))
            edits.append(TypographEdit(id: 0, range: NSRange(location: current.location, length: newLength), sourceRange: sourceRange,
                                        original: original, replacement: replacement.text, type: replacement.type,
                                        rule: replacement.rule, message: replacement.message))
            let change = newLength - replacement.range.length
            for index in edits.indices.dropLast() where edits[index].range.location >= current.location {
                edits[index].range.location += change
            }
            delta += change
        }
        text = mutable as String
        if map.count != text.utf16.count + 1 { map.append(source.utf16.count) }
    }

    private func quoteReplacements(_ text: String, options: Options) -> [Replacement] {
        let ns = text as NSString; var stack: [Int] = []; var output: [Replacement] = []
        let opening = CharacterSet(charactersIn: " \t\n\r([{«„“‘—–- ")
        for index in 0..<ns.length where ns.character(at: index) == 34 {
            let isOpen = index == 0 || UnicodeScalar(ns.character(at: index - 1)).map(opening.contains) == true
            if isOpen || stack.isEmpty { stack.append(index) }
            else {
                let start = stack.removeLast(); let inner = ns.substring(with: NSRange(location: start + 1, length: index - start - 1))
                let language = detectLanguage(inner, fallback: language(at: start, in: text, fallback: options.defaultLanguage))
                let nested = !stack.isEmpty
                let pair = nested ? ("“", "”") : ("«", "»")
                output.append(Replacement(range: NSRange(location: start, length: 1), text: pair.0, type: .quotes, rule: "double_quotes", message: "Открывающая кавычка"))
                output.append(Replacement(range: NSRange(location: index, length: 1), text: pair.1, type: .quotes, rule: "double_quotes", message: "Закрывающая кавычка · \(language.uppercased())"))
            }
        }
        return output
    }

    private func apostropheReplacements(_ text: String) -> [Replacement] {
        let ns = text as NSString; var output: [Replacement] = []
        for index in 0..<ns.length where ns.character(at: index) == 39 {
            let before = index > 0 ? UnicodeScalar(ns.character(at: index - 1)) : nil
            let after = index + 1 < ns.length ? UnicodeScalar(ns.character(at: index + 1)) : nil
            let letterBefore = before.map(CharacterSet.letters.contains) == true
            let wordAfter = after.map(CharacterSet.alphanumerics.contains) == true
            let year = before.map(CharacterSet.whitespacesAndNewlines.union(CharacterSet(charactersIn: "([" )).contains) == true && after.map(CharacterSet.decimalDigits.contains) == true
            if (letterBefore && wordAfter) || (letterBefore && !wordAfter) || year {
                output.append(Replacement(range: NSRange(location: index, length: 1), text: "’", type: .quotes, rule: "apostrophe", message: "Апостроф"))
            }
        }
        return output
    }

    private func dialogueDashReplacements(_ text: String, options: Options) -> [Replacement] {
        matches(#"(?m)^([ \t]*)(-{1,2})([ \t]+)(?=\S)"#, in: text).compactMap { match in
            let range = match.range(at: 2)
            guard language(at: range.location, in: text, fallback: options.defaultLanguage) == "ru" else { return nil }
            return Replacement(range: range, text: "—", type: .dashes, rule: "dialogue_dash", message: "Тире в диалоге")
        }
    }

    private func thoughtDashReplacements(_ text: String, options: Options) -> [Replacement] {
        var output: [Replacement] = []
        for match in matches(#"(?<=\S)([ \t]+)(-{1,2})([ \t]+)(?=\S)"#, in: text) {
            let dash = match.range(at: 2); let lang = language(at: dash.location, in: text, fallback: options.defaultLanguage)
            if lang == "en" && options.englishDash == "us" {
                output.append(Replacement(range: match.range, text: "—", type: .dashes, rule: "thought_dash", message: "Тире · US"))
            } else {
                output.append(Replacement(range: dash, text: lang == "en" ? "–" : "—", type: .dashes, rule: "thought_dash", message: lang == "en" ? "Тире · UK" : "Тире"))
            }
        }
        for match in matches(#"(?<=\w)(--)(?=\w)"#, in: text) {
            let lang = language(at: match.range.location, in: text, fallback: options.defaultLanguage)
            let value = lang == "en" ? (options.englishDash == "uk" ? " – " : "—") : " — "
            output.append(Replacement(range: match.range, text: value, type: .dashes, rule: "thought_dash", message: "Тире"))
        }
        return output
    }

    private func rangeDashReplacements(_ text: String) -> [Replacement] {
        matches(#"(?<![-\d])(\d{1,4})[ \t]?-[ \t]?(\d{1,4})(?![-\d])"#, in: text).map {
            let ns = text as NSString
            return Replacement(range: $0.range, text: "\(ns.substring(with: $0.range(at: 1)))–\(ns.substring(with: $0.range(at: 2)))", type: .dashes, rule: "range_dash", message: "Тире диапазона")
        }
    }

    private func shortWordReplacements(_ text: String, options: Options) -> [Replacement] {
        matches(#"(?<![A-Za-zА-Яа-яЁё0-9'’\-])([A-Za-zА-Яа-яЁё]{1,2}) (?=[A-Za-zА-Яа-яЁё0-9«\"“„‘(])"#, in: text).compactMap {
            let word = (text as NSString).substring(with: $0.range(at: 1)); let lang = language(at: $0.range.location, in: text, fallback: options.defaultLanguage)
            guard lang != "en" || word.utf16.count == 1 else { return nil }
            return Replacement(range: NSRange(location: NSMaxRange($0.range(at: 1)), length: 1), text: " ", type: .nbsp, rule: "short_word_nbsp", message: "Неразрывный пробел после короткого слова")
        }
    }

    private func initialsReplacements(_ text: String) -> [Replacement] {
        var output: [Replacement] = []
        for match in matches(#"([A-Za-zА-Яа-яЁё])\.[ ]+([A-Za-zА-Яа-яЁё])\.[ ]+([A-Za-zА-Яа-яЁё]{2,})"#, in: text) {
            let ns = text as NSString
            output.append(Replacement(range: match.range, text: "\(ns.substring(with: match.range(at: 1))). \(ns.substring(with: match.range(at: 2))). \(ns.substring(with: match.range(at: 3)))", type: .nbsp, rule: "initials_nbsp", message: "Пробелы между инициалами"))
        }
        return output
    }

    private func dashSpaceReplacements(_ text: String) -> [Replacement] {
        matches(#"(\S) ([—–])(?= )"#, in: text).map {
            Replacement(range: NSRange(location: NSMaxRange($0.range(at: 1)), length: 1), text: " ", type: .nbsp, rule: "dash_nbsp", message: "Неразрывный пробел перед тире")
        }
    }

    private func matches(_ pattern: String, in text: String) -> [NSTextCheckingResult] {
        (try? NSRegularExpression(pattern: pattern).matches(in: text, range: NSRange(location: 0, length: text.utf16.count))) ?? []
    }

    private func protectedRanges(in text: String, exceptions: [String]) -> [NSRange] {
        exceptions.flatMap { word -> [NSRange] in
            guard !word.isEmpty else { return [] }
            return matches(NSRegularExpression.escapedPattern(for: word), in: text)
                .map(\.range)
        }
    }

    private func language(at position: Int, in text: String, fallback: String) -> String {
        let ns = text as NSString
        let separators = CharacterSet(charactersIn: ".!?…\n")
        var start = position, end = position
        while start > 0, let scalar = UnicodeScalar(ns.character(at: start - 1)), !separators.contains(scalar) { start -= 1 }
        while end < ns.length, let scalar = UnicodeScalar(ns.character(at: end)), !separators.contains(scalar) { end += 1 }
        return detectLanguage(ns.substring(with: NSRange(location: start, length: end - start)), fallback: fallback)
    }

    private func detectLanguage(_ text: String, fallback: String) -> String {
        let ru = text.unicodeScalars.filter { CharacterSet(charactersIn: "А-Яа-яЁё").contains($0) }.count
        let en = text.unicodeScalars.filter { CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz").contains($0) }.count
        if ru == en { return fallback == "en" ? "en" : "ru" }
        return ru > en ? "ru" : "en"
    }

    private func editWithID(_ edit: TypographEdit, id: Int) -> TypographEdit {
        TypographEdit(id: id, range: edit.range, sourceRange: edit.sourceRange, original: edit.original,
                      replacement: edit.replacement, type: edit.type, rule: edit.rule, message: edit.message)
    }
}
