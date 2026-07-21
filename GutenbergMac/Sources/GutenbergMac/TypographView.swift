import AppKit
import SwiftUI

struct TypographView: View {
    @State private var source = "Он сказал \"привет\" в 1990-2000."
    @State private var result = ""
    @State private var quotes = true
    @State private var dashes = true
    @State private var spaces = true
    @State private var britishDashes = false
    @State private var isWorking = false
    @State private var error: String?

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Toggle("Кавычки", isOn: $quotes)
                Toggle("Тире", isOn: $dashes)
                Toggle("Неразрывные пробелы", isOn: $spaces)
                Divider().frame(height: 18)
                Toggle("Британские тире", isOn: $britishDashes)
                Spacer()
                Button("Типографировать", action: process)
                    .buttonStyle(.borderedProminent)
                    .disabled(source.isEmpty || isWorking)
            }
            .padding()

            HSplitView {
                editor(title: "Исходный текст", text: $source)
                editor(title: "Результат", text: $result)
            }

            if let error { Text(error).foregroundStyle(.red).font(.caption).padding(8) }
        }
    }

    private func editor(title: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.headline)
            TextEditor(text: text).font(.system(.body, design: .serif)).scrollContentBackground(.hidden)
                .padding(8).background(.background, in: RoundedRectangle(cornerRadius: 8))
            HStack {
                Text("\(text.wrappedValue.count) знаков").foregroundStyle(.secondary)
                Spacer()
                Button("Копировать") { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(text.wrappedValue, forType: .string) }
                    .disabled(text.wrappedValue.isEmpty)
            }.font(.caption)
        }.padding().frame(minWidth: 320)
    }

    private func process() {
        isWorking = true; error = nil
        let enabled = [(quotes, "quotes"), (dashes, "dashes"), (spaces, "nbsp")].filter(\.0).map(\.1)
        Task {
            do {
                let object = try await APIClient.shared.json(path: "typograph/api/correct", method: "POST", body: [
                    "text": source, "enabled_types": enabled,
                    "en_dash_style": britishDashes ? "uk" : "us", "default_lang": "auto", "exceptions": []
                ])
                result = object["result"] as? String ?? ""
            } catch { self.error = error.localizedDescription }
            isWorking = false
        }
    }
}
