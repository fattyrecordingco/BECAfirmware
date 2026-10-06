import SwiftUI
import WebKit
#if os(iOS)
import CoreAudioKit
import AVFAudio
#else
import AppKit
#endif

@main
@MainActor
struct BECAAppleApp: App {
    @StateObject private var session = AppleSession()
    @Environment(\.scenePhase) private var scenePhase
    var body: some Scene {
        WindowGroup {
            ContentView(session: session)
                .onChange(of: scenePhase) { phase in
                    if phase == .background { session.suspend() }
                }
        }
    }
}

@MainActor struct ContentView: View {
    @ObservedObject var session: AppleSession
    @State private var bluetooth = false
    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Text("BECA address")
                TextField("192.168.4.1", text: $session.address).textFieldStyle(.roundedBorder)
                    .disabled(session.webURL == nil)
                Button("Refresh MIDI") { session.refreshSources() }
            }
            HStack {
                Picker("MIDI source", selection: $session.selectedSource) {
                    Text("Choose BECA").tag(Int32(0))
                    ForEach(session.sources) { source in Text(source.name).tag(source.id) }
                }.onChange(of: session.selectedSource) { _ in session.selectMIDI() }
                #if os(iOS)
                Button("Bluetooth MIDI") { bluetooth = true }
                #else
                Button("Bluetooth MIDI") {
                    NSWorkspace.shared.open(URL(fileURLWithPath: "/System/Applications/Utilities/Audio MIDI Setup.app"))
                }
                #endif
            }
            Text(session.status).font(.caption).frame(maxWidth: .infinity, alignment: .leading)
            if let url = session.webURL { InstrumentView(session: session, url: url) }
            else { ProgressView("Loading BECA…").frame(maxWidth: .infinity, maxHeight: .infinity) }
        }
        .padding(8)
        #if os(iOS)
        .sheet(isPresented: $bluetooth, onDismiss: { session.refreshSources() }) { BluetoothPicker() }
        .onAppear {
            do {
                try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
                try AVAudioSession.sharedInstance().setActive(true)
            } catch { session.status = "Could not enable audio: \(error.localizedDescription)" }
        }
        #endif
    }
}

@MainActor private func makeWebView(_ session: AppleSession, url: URL) -> WKWebView {
    let config = WKWebViewConfiguration()
    config.userContentController.add(session, name: "beca")
    config.websiteDataStore = .nonPersistent()
    #if os(iOS)
    config.allowsInlineMediaPlayback = true
    config.mediaTypesRequiringUserActionForPlayback = []
    #endif
    let view = WKWebView(frame: .zero, configuration: config)
    view.navigationDelegate = session
    session.webView = view
    view.load(URLRequest(url: url))
    return view
}

#if os(iOS)
@MainActor struct InstrumentView: UIViewRepresentable {
    let session: AppleSession
    let url: URL
    func makeUIView(context: Context) -> WKWebView { makeWebView(session, url: url) }
    func updateUIView(_ view: WKWebView, context: Context) {}
}
@MainActor struct BluetoothPicker: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> UINavigationController {
        UINavigationController(rootViewController: CABTMIDICentralViewController())
    }
    func updateUIViewController(_ view: UINavigationController, context: Context) {}
}
#else
@MainActor struct InstrumentView: NSViewRepresentable {
    let session: AppleSession
    let url: URL
    func makeNSView(context: Context) -> WKWebView { makeWebView(session, url: url) }
    func updateNSView(_ view: WKWebView, context: Context) {}
}
#endif
