import Foundation
import Combine
import CoreMIDI
import WebKit

struct MIDISource: Identifiable {
    let id: MIDIUniqueID
    let endpoint: MIDIEndpointRef
    let name: String
}

@MainActor
final class AppleSession: NSObject, ObservableObject, WKScriptMessageHandler, WKNavigationDelegate {
    @Published var address = UserDefaults.standard.string(forKey: "BECA.address") ?? "192.168.4.1"
    @Published var sources = [MIDISource]()
    @Published var selectedSource: MIDIUniqueID = 0
    @Published var status = "Power BECA, join its Wi-Fi, then connect its Bluetooth MIDI source."
    @Published var webURL: URL?
    weak var webView: WKWebView?
    private let server = LocalWebServer()
    private var client: MIDIClientRef = 0
    private var port: MIDIPortRef = 0
    private var connectedSource: MIDIEndpointRef = 0
    private var parser = MIDIStream()
    private var active = false
    private var failures = 0
    private var requestBusy = false
    private var baseURL: URL?
    private var sessionGeneration = 0
    private let http: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 2
        config.timeoutIntervalForResource = 2
        config.httpMaximumConnectionsPerHost = 1
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(configuration: config)
    }()

    override init() {
        super.init()
        let clientResult = MIDIClientCreateWithBlock("BECA Apple" as CFString, &client) { [weak self] _ in
            DispatchQueue.main.async { self?.refreshSources() }
        }
        let portResult = MIDIInputPortCreateWithBlock(client, "BECA input" as CFString, &port) { [weak self] list, _ in
            var chunks = [[UInt8]]()
            let offset = MemoryLayout<MIDIPacketList>.offset(of: \MIDIPacketList.packet)!
            var packet = UnsafeRawPointer(list).advanced(by: offset).assumingMemoryBound(to: MIDIPacket.self)
            for _ in 0..<list.pointee.numPackets {
                let length = Int(packet.pointee.length)
                if length <= 4096 {
                    let dataOffset = MemoryLayout<MIDIPacket>.offset(of: \MIDIPacket.data)!
                    let data = UnsafeRawPointer(packet).advanced(by: dataOffset).assumingMemoryBound(to: UInt8.self)
                    chunks.append(Array(UnsafeBufferPointer(start: data, count: length)))
                }
                packet = UnsafePointer(MIDIPacketNext(packet))
            }
            DispatchQueue.main.async {
                guard let self, self.active else { return }
                for chunk in chunks {
                    for message in self.parser.feed(chunk) {
                        self.emit("@M " + message.map { String(format: "%02X", $0) }.joined(separator: " "))
                    }
                }
            }
        }
        if clientResult != noErr || portResult != noErr { status = "Native MIDI could not start. Restart the app." }
        refreshSources()
        server.start { [weak self] result in
            switch result {
            case .success(let url): self?.webURL = url
            case .failure(let error): self?.status = "Could not load the bundled app: \(error.localizedDescription)"
            }
        }
    }

    func refreshSources() {
        sources = (0..<MIDIGetNumberOfSources()).compactMap { index in
            let endpoint = MIDIGetSource(index)
            var id: MIDIUniqueID = 0
            var name: Unmanaged<CFString>?
            guard MIDIObjectGetIntegerProperty(endpoint, kMIDIPropertyUniqueID, &id) == noErr,
                  MIDIObjectGetStringProperty(endpoint, kMIDIPropertyDisplayName, &name) == noErr,
                  let name else { return nil }
            return MIDISource(id: id, endpoint: endpoint, name: name.takeRetainedValue() as String)
        }
        if selectedSource == 0 {
            let becas = sources.filter { $0.name.localizedCaseInsensitiveContains("BECA") }
            if becas.count == 1 { selectedSource = becas[0].id }
        }
        if connectedSource != 0 && !sources.contains(where: { $0.endpoint == connectedSource }) {
            panic()
            connectedSource = 0
            selectedSource = 0
            status = "BECA MIDI disconnected. Reconnect it in Bluetooth MIDI, then select its source."
        }
        selectMIDI()
    }

    func selectMIDI() {
        let endpoint = sources.first { $0.id == selectedSource }?.endpoint ?? 0
        guard active, endpoint != connectedSource else { return }
        panic()
        if connectedSource != 0 { MIDIPortDisconnectSource(port, connectedSource) }
        connectedSource = 0
        if endpoint != 0 && MIDIPortConnectSource(port, endpoint, nil) == noErr { connectedSource = endpoint }
        status = connectedSource != 0 ? "Direct Wi-Fi control and native MIDI connected." : "Wi-Fi control connected. Select BECA’s MIDI source for live phone sound."
    }

    private func panic() {
        parser.reset()
        for channel in 0..<16 { emit(String(format: "@M %02X 78 00", 0xB0 | channel)) }
    }

    private func close() {
        panic()
        active = false
        sessionGeneration += 1
        if connectedSource != 0 { MIDIPortDisconnectSource(port, connectedSource) }
        connectedSource = 0
        baseURL = nil
        call("__BECA_NATIVE_CLOSED__", value: NSNull())
        status = "Disconnected. Tap Connect BECA to reconnect."
    }

    private func validatedAddress() throws -> URL {
        let input = address.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let components = URLComponents(string: input.contains("://") ? input : "http://" + input),
              components.scheme == "http", let host = components.host?.lowercased(),
              components.user == nil, components.password == nil, components.query == nil, components.fragment == nil,
              components.port == nil || components.port == 80,
              components.path.isEmpty || components.path == "/" else { throw failure("Enter BECA’s local IP or .local name, without a path or password.") }
        let componentsOfHost = host.split(separator: ".", omittingEmptySubsequences: false)
        let octets = componentsOfHost.compactMap { Int($0) }
        let privateIP = componentsOfHost.count == 4 && octets.count == 4 && octets.allSatisfy { (0...255).contains($0) } &&
            (octets[0] == 10 || (octets[0] == 192 && octets[1] == 168) || (octets[0] == 172 && (16...31).contains(octets[1])))
        guard privateIP || host.hasSuffix(".local") else { throw failure("Use BECA’s private Wi-Fi IP address or .local name.") }
        guard let url = URL(string: "http://\(host)/") else { throw failure("Invalid device address.") }
        return url
    }

    private func failure(_ text: String) -> NSError { NSError(domain: "BECA", code: 1, userInfo: [NSLocalizedDescriptionKey: text]) }

    private func get(_ path: String, form: [String: String]? = nil) async throws -> [String: Any] {
        guard let baseURL else { throw failure("Connect BECA first.") }
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        if let form {
            request.httpMethod = "POST"
            var components = URLComponents()
            components.queryItems = form.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) }
            request.httpBody = components.percentEncodedQuery?.replacingOccurrences(of: "+", with: "%2B").data(using: .utf8)
            request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await http.data(for: request)
        if path == "rand", let response = response as? HTTPURLResponse,
           response.url?.host == baseURL.host, response.statusCode == 200,
           String(decoding: data, as: UTF8.self) == "OK" { return ["ok": 1] }
        guard response.url?.host == baseURL.host,
              let response = response as? HTTPURLResponse,
              let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw failure("BECA returned an invalid response. Check its address and firmware.") }
        guard (200..<300).contains(response.statusCode), (json["ok"] as? Int) != 0 else {
            throw failure(json["err"] as? String ?? "BECA rejected the command (\(response.statusCode)).")
        }
        return json
    }

    private func command(_ command: String) async throws -> String {
        let parts = command.split(separator: " ").map(String.init)
        guard parts.count >= 2, parts[0] == "@C", command.count <= 256 else { throw failure("Invalid BECA command.") }
        let tag = parts[1]
        let paths = ["PARAMS": "api/params", "STATE": "api/state", "SYNTH": "api/synth", "PLANT": "api/plant", "NOTES": "api/notes", "WIFI_INFO": "api/info", "LIVE": "api/live"]
        let json: [String: Any]
        if tag == "PING" { _ = try await get("api/state"); json = ["ok": 1] }
        else if tag == "TELEMETRY" { json = ["ok": 1, "enabled": 0] }
        else if let path = paths[tag], parts.count == 2 { json = try await get(path) }
        else if tag == "SET", parts.count == 4 { json = try await get("api/set", form: ["key": parts[2], "value": parts[3]]) }
        else if tag == "SYNTH_TEST", parts.count == 2 { json = try await get("api/synth/test") }
        else if tag == "RANDOMIZE", parts.count == 2 { _ = try await get("rand"); json = ["ok": 1] }
        else { json = ["ok": 0, "err": "This command is unavailable over Wi-Fi. Use the app controls."] }
        let data = try JSONSerialization.data(withJSONObject: json, options: [.sortedKeys])
        return "@R \(tag) \(String(decoding: data, as: UTF8.self))"
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, let url = message.frameInfo.request.url,
              url.host == "127.0.0.1", url.port == webURL?.port,
              let body = message.body as? [String: Any], let id = body["id"] as? Int,
              let action = body["action"] as? String else { return }
        if action == "close" {
            close()
            call("__BECA_NATIVE_REPLY__", value: ["id": id, "result": NSNull()])
            return
        }
        guard !requestBusy else { call("__BECA_NATIVE_REPLY__", value: ["id": id, "error": "Wait for the previous BECA request."]); return }
        requestBusy = true
        Task {
            defer { requestBusy = false }
            do {
                var result: Any = NSNull()
                if action == "open" {
                    let generation = sessionGeneration
                    baseURL = try validatedAddress()
                    let params = try await get("api/params")
                    guard generation == sessionGeneration else { throw failure("Connection closed during the request.") }
                    guard (params["synth_presets"] as? [String])?.count == 13 else { throw failure("This device does not have the required BECA firmware.") }
                    UserDefaults.standard.set(address, forKey: "BECA.address")
                    active = true; failures = 0
                    selectMIDI()
                } else if action == "close" { close() }
                else if action == "command", active, let text = body["command"] as? String {
                    let generation = sessionGeneration
                    result = try await command(text)
                    guard generation == sessionGeneration else { throw failure("Connection closed during the request.") }
                    failures = 0
                } else { throw failure("Connect BECA first.") }
                call("__BECA_NATIVE_REPLY__", value: ["id": id, "result": result])
            } catch {
                failures += 1
                status = "\(error.localizedDescription) Check Wi-Fi and Local Network permission in Settings."
                call("__BECA_NATIVE_REPLY__", value: ["id": id, "error": error.localizedDescription])
                if active && failures >= 3 {
                    let reason = status
                    close()
                    status = reason
                }
            }
        }
    }

    private func emit(_ line: String) { if active { call("__BECA_NATIVE_LINE__", value: line) } }
    private func call(_ function: String, value: Any) {
        guard let data = try? JSONSerialization.data(withJSONObject: [value]),
              let encoded = String(data: data, encoding: .utf8) else { return }
        webView?.evaluateJavaScript("globalThis.\(function)?.(\(encoded)[0])", completionHandler: nil)
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let url = action.request.url
        decisionHandler(url?.host == "127.0.0.1" && url?.port == webURL?.port ? .allow : .cancel)
    }

    func suspend() { close() }
}
