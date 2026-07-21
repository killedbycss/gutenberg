import Foundation

@MainActor
final class BackendManager: ObservableObject {
    enum State { case idle, starting, ready, failed }

    static let shared = BackendManager()
    nonisolated static let baseURL = URL(string: "http://127.0.0.1:8770")!

    @Published private(set) var state: State = .idle
    @Published private(set) var message = "Подготовка инструментов…"
    private var process: Process?

    func startIfNeeded(force: Bool = false) {
        guard force || state == .idle || state == .failed else { return }
        state = .starting
        message = "Запуск локальных модулей…"

        Task {
            if await isHealthy() {
                state = .ready
                message = "Модули готовы"
                return
            }
            do {
                try launchBackend()
                message = "Первый запуск может занять несколько минут: подготавливается локальное ядро…"
                for _ in 0..<600 {
                    try await Task.sleep(for: .milliseconds(500))
                    if await isHealthy() {
                        state = .ready
                        message = "Модули готовы"
                        return
                    }
                }
                throw BackendError.message("Сервер не ответил вовремя")
            } catch {
                state = .failed
                message = error.localizedDescription
            }
        }
    }

    private func isHealthy() async -> Bool {
        var request = URLRequest(url: Self.baseURL.appendingPathComponent("healthz"))
        request.timeoutInterval = 1
        return (try? await URLSession.shared.data(for: request).1 as? HTTPURLResponse)?.statusCode == 200
    }

    private func launchBackend() throws {
        let fileManager = FileManager.default
        let resourceRoot = Bundle.main.resourceURL?.appendingPathComponent("BackendRoot")
        let developmentRoot = URL(fileURLWithPath: FileManager.default.currentDirectoryPath).deletingLastPathComponent()
        let root = resourceRoot.flatMap { fileManager.fileExists(atPath: $0.path) ? $0 : nil } ?? developmentRoot
        let server = root.appendingPathComponent("studio/backend/app.py")
        guard fileManager.fileExists(atPath: server.path) else {
            throw BackendError.message("Не найдены ресурсы локальных модулей")
        }

        let support = try fileManager.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        ).appendingPathComponent("Gutenberg", isDirectory: true)
        try fileManager.createDirectory(at: support, withIntermediateDirectories: true)

        let systemPython = URL(fileURLWithPath: "/usr/bin/python3")
        guard fileManager.isExecutableFile(atPath: systemPython.path) else {
            throw BackendError.message("Для модулей требуется Python 3")
        }

        let bundledBootstrap = root.appendingPathComponent("BackendBootstrap.py")
        let developmentBootstrap = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
            .appendingPathComponent("Packaging/backend_bootstrap.py")
        let bootstrap = fileManager.fileExists(atPath: bundledBootstrap.path) ? bundledBootstrap : developmentBootstrap
        guard fileManager.fileExists(atPath: bootstrap.path) else {
            throw BackendError.message("Не найден скрипт подготовки локального ядра")
        }

        let task = Process()
        task.executableURL = systemPython
        task.arguments = [bootstrap.path, support.path, root.path]
        task.currentDirectoryURL = root.appendingPathComponent("studio")
        var environment = ProcessInfo.processInfo.environment
        environment["PORT"] = "8770"
        environment["DICT_PATH"] = support.appendingPathComponent("user_dictionary.json").path
        task.environment = environment
        task.standardOutput = FileHandle.nullDevice
        let logURL = support.appendingPathComponent("backend.log")
        fileManager.createFile(atPath: logURL.path, contents: nil)
        let log = try FileHandle(forWritingTo: logURL)
        task.standardError = log
        task.standardOutput = log
        try task.run()
        process = task
    }
}

private enum BackendError: LocalizedError {
    case message(String)
    var errorDescription: String? {
        switch self { case .message(let value): value }
    }
}
