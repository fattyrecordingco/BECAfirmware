import Foundation
import Network

// Loopback serves the bundled app in a secure localhost context for AudioWorklet.
final class LocalWebServer {
    private var listener: NWListener?
    private let queue = DispatchQueue(label: "BECA.web")
    private var connections = [ObjectIdentifier: NWConnection]()

    func start(ready: @escaping (Result<URL, Error>) -> Void) {
        do {
            let parameters = NWParameters.tcp
            parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
            let listener = try NWListener(using: parameters)
            self.listener = listener
            listener.stateUpdateHandler = { state in
                switch state {
                case .ready:
                    guard let port = listener.port,
                          let url = URL(string: "http://127.0.0.1:\(port.rawValue)/") else { return }
                    DispatchQueue.main.async { ready(.success(url)) }
                case .failed(let error): DispatchQueue.main.async { ready(.failure(error)) }
                default: break
                }
            }
            listener.newConnectionHandler = { [weak self] connection in
                guard let self else { connection.cancel(); return }
                let id = ObjectIdentifier(connection)
                guard self.connections.count < 32 else { connection.cancel(); return }
                self.connections[id] = connection
                connection.stateUpdateHandler = { [weak self] state in
                    if case .cancelled = state { self?.connections.removeValue(forKey: id) }
                }
                connection.start(queue: self.queue)
                self.receive(connection, data: Data())
                self.queue.asyncAfter(deadline: .now() + 5) { connection.cancel() }
            }
            listener.start(queue: queue)
        } catch { ready(.failure(error)) }
    }

    private func receive(_ connection: NWConnection, data: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 8192) { [weak self] chunk, _, complete, error in
            guard let self else { connection.cancel(); return }
            var request = data
            if let chunk { request.append(chunk) }
            guard request.count <= 8192, error == nil else { connection.cancel(); return }
            if request.range(of: Data("\r\n\r\n".utf8)) != nil { self.respond(connection, request: request) }
            else if complete { connection.cancel() }
            else { self.receive(connection, data: request) }
        }
    }

    private func respond(_ connection: NWConnection, request: Data) {
        let parts = String(decoding: request, as: UTF8.self).components(separatedBy: "\r\n").first?.split(separator: " ") ?? []
        guard parts.count >= 2, parts[0] == "GET",
              let path = String(parts[1]).split(separator: "?").first?.removingPercentEncoding,
              !path.contains(".."), !path.contains("\\"), path.hasPrefix("/"),
              let root = Bundle.main.url(forResource: "Web", withExtension: nil) else {
            send(connection, status: "400 Bad Request", type: "text/plain", body: Data()); return
        }
        let name = path == "/" ? "index.html" : String(path.dropFirst())
        let url = root.appendingPathComponent(name)
        guard let body = try? Data(contentsOf: url) else {
            send(connection, status: "404 Not Found", type: "text/plain", body: Data()); return
        }
        let types = ["html": "text/html; charset=utf-8", "js": "text/javascript; charset=utf-8",
                     "css": "text/css", "wasm": "application/wasm", "svg": "image/svg+xml",
                     "png": "image/png", "webmanifest": "application/manifest+json"]
        send(connection, status: "200 OK", type: types[url.pathExtension] ?? "application/octet-stream", body: body)
    }

    private func send(_ connection: NWConnection, status: String, type: String, body: Data) {
        var response = Data("HTTP/1.1 \(status)\r\nContent-Type: \(type)\r\nContent-Length: \(body.count)\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n".utf8)
        response.append(body)
        connection.send(content: response, completion: .contentProcessed { _ in connection.cancel() })
    }
}
