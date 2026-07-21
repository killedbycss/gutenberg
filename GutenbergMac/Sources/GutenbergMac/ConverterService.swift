import Foundation

enum APIError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let value) = self { value } else { nil } }
}

struct ConverterService: Sendable {
    static let shared = ConverterService()

    func convert(files: [URL], targets: [String]) async throws -> Data {
        let runtime = try runtimePaths()
        let output = FileManager.default.temporaryDirectory.appendingPathComponent("Gutenberg-\(UUID().uuidString).zip")
        let data = try await run(python: runtime.python, helper: runtime.helper, packages: runtime.packages,
                                 arguments: ["convert", output.path, targets.joined(separator: ",")] + files.map(\.path), output: output)
        try? FileManager.default.removeItem(at: output)
        return data
    }

    func fontForPreview(from source: URL) async throws -> Data {
        let ext = source.pathExtension.lowercased()
        if ext == "ttf" || ext == "otf" { return try Data(contentsOf: source) }
        let runtime = try runtimePaths()
        let output = FileManager.default.temporaryDirectory.appendingPathComponent("Gutenberg-Font-\(UUID().uuidString).ttf")
        let data = try await run(python: runtime.python, helper: runtime.helper, packages: runtime.packages,
                                 arguments: ["preview-font", output.path, source.path], output: output)
        try? FileManager.default.removeItem(at: output)
        return data
    }

    private func runtimePaths() throws -> (python: URL, helper: URL, packages: URL) {
        let resources = Bundle.main.resourceURL
        guard let python = resources?.appendingPathComponent("Python3.framework/Versions/3.9/bin/python3"),
              let helper = resources?.appendingPathComponent("ConverterRuntime/converter_helper.py"),
              let packages = resources?.appendingPathComponent("PythonPackages"),
              FileManager.default.isExecutableFile(atPath: python.path) else {
            throw APIError.message("Автономный runtime не найден")
        }
        return (python, helper, packages)
    }

    private func run(python: URL, helper: URL, packages: URL, arguments: [String], output: URL) async throws -> Data {
        try await withCheckedThrowingContinuation { continuation in
            let process = Process()
            let errors = Pipe()
            process.executableURL = python
            process.arguments = [helper.path] + arguments
            var environment = ProcessInfo.processInfo.environment
            environment["PYTHONPATH"] = packages.path + ":" + helper.deletingLastPathComponent().path
            environment["PYTHONHOME"] = python.deletingLastPathComponent().deletingLastPathComponent().path
            process.environment = environment
            process.standardError = errors
            process.terminationHandler = { process in
                if process.terminationStatus == 0, let data = try? Data(contentsOf: output) { continuation.resume(returning: data) }
                else {
                    let data = errors.fileHandleForReading.readDataToEndOfFile()
                    let message = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
                    continuation.resume(throwing: APIError.message(message?.isEmpty == false ? message! : "Ошибка автономного конвертера"))
                }
            }
            do { try process.run() } catch { continuation.resume(throwing: error) }
        }
    }
}
