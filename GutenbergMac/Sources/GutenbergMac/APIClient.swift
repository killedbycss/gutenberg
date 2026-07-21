import Foundation

enum APIError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let value) = self { value } else { nil } }
}

struct APIClient {
    static let shared = APIClient()

    func json(path: String, method: String = "GET", body: [String: Any]? = nil) async throws -> [String: Any] {
        var request = URLRequest(url: BackendManager.baseURL.appendingPathComponent(path))
        request.httpMethod = method
        if let body {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.message("Нет ответа сервера") }
        let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        guard 200..<300 ~= http.statusCode else {
            throw APIError.message(object["error"] as? String ?? object["detail"] as? String ?? "Ошибка сервера \(http.statusCode)")
        }
        return object
    }

    func multipart(path: String, files: [URL], field: String, values: [(String, String)] = []) async throws -> (Data, HTTPURLResponse) {
        let boundary = "Gutenberg-\(UUID().uuidString)"
        var body = Data()
        for (name, value) in values {
            body.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n")
        }
        for file in files {
            body.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(field)\"; filename=\"\(file.lastPathComponent)\"\r\nContent-Type: application/octet-stream\r\n\r\n")
            body.append(try Data(contentsOf: file))
            body.append("\r\n")
        }
        body.append("--\(boundary)--\r\n")

        var request = URLRequest(url: BackendManager.baseURL.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.httpBody = body
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.message("Нет ответа сервера") }
        guard 200..<300 ~= http.statusCode else {
            let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            throw APIError.message(object?["error"] as? String ?? "Ошибка сервера \(http.statusCode)")
        }
        return (data, http)
    }
}

private extension Data {
    mutating func append(_ string: String) { append(Data(string.utf8)) }
}
