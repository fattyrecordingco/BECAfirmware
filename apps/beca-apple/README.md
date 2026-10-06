# BECA Apple app — native implementation, awaiting Apple validation

This project adds a direct connection for **iPhone/iPad on iOS/iPadOS 15+** and **Mac on macOS 12+**. It is source code, not a signed downloadable app. Unsigned iPhone/iPad simulator and Apple Silicon/Intel Mac builds, plus the Swift MIDI parser checks, passed on GitHub's Mac runner for commit `da6bbff` on 6 October 2026. Physical Apple device tests and distribution signing remain outstanding. Do not advertise this as a released or universally verified Apple app.

The app bundles the existing BECA Phone Control synth and controls, serves them on a loopback-only localhost endpoint, and adds two native connections:

- Local Wi-Fi HTTP for settings, presets, plant readings and status. Works with BECA's setup access point or a shared router; no computer, cloud service or internet connection is required during use.
- CoreMIDI for live MIDI notes and note-offs. On iPhone/iPad, the app presents Apple's Bluetooth MIDI connection panel. On Mac, connect the peripheral in Audio MIDI Setup. The source selector also accepts MIDI sources already connected through macOS network MIDI or other native drivers.

The synth receives live MIDI bytes; plant display snapshots never create audio notes. Listening selects firmware output **0 (BLE MIDI)** rather than output **1 (Serial MIDI)**. Native MIDI selection and Wi-Fi control address must refer to the same physical BECA. BLE is a single MIDI connection; close other MIDI central connections when moving between devices. This app does not add simultaneous BLE + AUX output or a USB serial driver.

## Shared app experience and wired serial

The product requirement is the same controls, presets, plant display, synth, drums and command/reply behavior across operating systems. The Apple app bundles the same phone-app assets rather than maintaining a separate instrument UI. Its current native connection translates the shared `@C` commands into local HTTP requests and passes actual CoreMIDI events to the shared synth. That adapter is **not** a physical serial connection and does not forward arbitrary serial-console commands. Equivalent controls do not imply identical connection setup, telemetry cadence or latency.

| Device | Current connection path | Direct CH340 USB serial |
| --- | --- | --- |
| Android with supported Chrome USB access | USB serial, shared phone app | Implemented in the browser app |
| Mac with supported serial browser | USB serial, shared phone app | Existing browser path; native Apple project currently uses Wi-Fi + CoreMIDI |
| iPad Air M3, user-reported iPadOS 26.6.1 | Native Wi-Fi + CoreMIDI source project, awaiting build/install | DriverKit is supported by the hardware; a custom driver is not implemented or installed |
| Other M-series iPads on iPadOS 16+ | Same native Wi-Fi + CoreMIDI source project | Same custom-driver development and signing requirement |
| iPhone and iPads without M-series chips | Same native Wi-Fi + CoreMIDI source project | No equivalent general USBDriverKit path |

The connected BECA exposes a WCH CH340 USB bridge, **VID `0x1A86`, PID `0x7523`**, and the shared serial protocol uses **115200 baud, 8N1**. A custom USBDriverKit extension could provide this byte stream to the native app on an eligible M-series iPad without replacing the ESP32. Apple's **USBSerialDriverKit** framework is macOS-only; an iPad implementation must use USBDriverKit with its own driver-to-app user client. The app would then feed serial replies, telemetry and `@M` MIDI events through the existing parser, and Listen would select firmware serial output **1**. It must not also feed CoreMIDI notes into that same serial session.

Delivering that path requires a Mac with Xcode, an Apple Developer signing identity, the applicable Apple-approved DriverKit/USB entitlements and provisioning profiles, an embedded driver extension, and physical CH340 tests on the iPad. Apple requires the user to enable the installed driver in Settings before it can run. These are development, distribution and first-install requirements; a computer would not be required during normal BECA use. The current development setup has neither Mac/Xcode access nor an Apple Developer account, so no runnable iPad serial build can be delivered from it. A cloud Mac build alone does not supply Apple's entitlements or device validation.

Required serial acceptance checks are full shared control/plant/synth behavior, raw command replies, complete MIDI note-on/off and drum delivery, bounded read/write queues, one owning connection, cable removal and reconnect, background/foreground cleanup, and startup without inadvertently resetting BECA. The driver must match the supported USB identity and confirm the BECA `PING`/`PARAMS` handshake before enabling controls. Existing BLE behavior and ESP32 Arduino **2.0.14** remain requirements. No USB driver target or release claim has been added to this project.

Sources: [Creating drivers for iPadOS](https://developer.apple.com/documentation/driverkit/creating-drivers-for-ipados), [USBDriverKit](https://developer.apple.com/documentation/usbdriverkit), [USBSerialDriverKit platform availability](https://developer.apple.com/documentation/usbserialdriverkit), [DriverKit entitlements and provisioning](https://developer.apple.com/documentation/driverkit/requesting-entitlements-for-driverkit-development).

### Connection recovery

The shared app now retains both the resolve and reject callbacks for pending replies. A failed send or disconnect can therefore settle verification immediately, clear the session and allow reconnect instead of throwing while trying to reject a missing callback. Browser regression tests cover failed verification and reconnect for both USB and the mocked Apple native bridge, plus Apple control, expression-pad, drum-kit and changing plant-data behavior. These tests validate the shared UI/bridge contract, not physical iPad USB or native Swift compilation.

## Build and install

### Apple tester quick start

Use the current development branch, not the default branch:

```sh
git clone --depth 1 --single-branch --branch codex/final-beca-release https://github.com/fattyrecordingco/BECAfirmware.git
cd BECAfirmware
node apps/beca-apple/prepare.mjs
open apps/beca-apple/BECAApple.xcodeproj
```

This needs a Mac with Xcode 16+ and Node.js 22+. Choose the **BECAApple** scheme. First run on **My Mac**; then select a physically connected iPhone or iPad, set your own development team and unique bundle identifier, and build/run. The project contains no signing credentials. Pair BLE MIDI and set the BECA Wi-Fi address using the instructions below. No computer is needed during normal instrument use after installing the native app.

This handoff is for **Wi-Fi controls + BLE/native MIDI**, not iPad USB serial. A custom CH340 DriverKit extension is not included. The public browser app is a separate build and does not acquire native Apple connections through publication.

Publication status (6 October 2026): this branch is public and the Apple checks passed. The browser workflow also passed **188 checks** with **19 skips**, but GitHub's `github-pages` environment rejected deployment because `codex/final-beca-release` is not an allowed deployment branch. The public website therefore has not received this update. The instructions above build the current app from source and do not depend on that website.

When reporting a test, include the tested commit (`git rev-parse --short HEAD`), device model, OS/Xcode versions, BECA firmware version, connection mode, expected/actual behavior, and any Xcode error. Do not include Wi-Fi passwords or signing secrets. Work through **Required physical validation before release** below; include both first connection and reconnect after screen lock. Report whether the synth's notes stop on disconnect and whether plant readings and settings match the hardware. The [verification record](../../docs/research/apple-compatibility.md) distinguishes completed Windows/browser checks from outstanding Apple checks.

On a Mac with Xcode 16 or later and Node.js 22 or later, from the repository root:

```sh
node apps/beca-apple/prepare.mjs
open apps/beca-apple/BECAApple.xcodeproj
```

The preparation command verifies the checked-in WASM fingerprint, builds the phone assets, and copies them into the app's `Web` resource folder. Run it after every phone-app edit. No XcodeGen, CocoaPods or third-party native package is required. In Xcode, choose the **BECAApple** scheme and your iPhone, iPad or Mac. For a physical iPhone/iPad, set your development team and a unique bundle identifier in Signing & Capabilities, then build/run. App Store/TestFlight distribution requires your Apple signing configuration and release review; none is embedded in this repository. Mac signing/notarization remains required for public distribution.

Unsigned compilation checks:

```sh
xcodebuild -project apps/beca-apple/BECAApple.xcodeproj -scheme BECAApple -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
xcodebuild -project apps/beca-apple/BECAApple.xcodeproj -scheme BECAApple -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO build
swiftc apps/beca-apple/BECAApple/MIDIStream.swift apps/beca-apple/tests/main.swift -o /tmp/beca-midi-check
/tmp/beca-midi-check
```

The [Apple app checks run](https://github.com/fattyrecordingco/BECAfirmware/actions/runs/37480642124) passed for `da6bbff`: both native builds, MIDI parser checks, and **60 Safari-engine browser tests** with **nine skips** for unsupported offline-navigation checks and transport tests assigned to other profiles. A simulator build does not verify Bluetooth radio behavior, and the unsigned build is not an installable iPad release.

## Use without a computer

1. Power BECA from a charger or power bank. Join its setup Wi-Fi, or join the same router as BECA. If the setup network has no internet, remain connected. The app's synth assets are bundled locally.
2. Enter `192.168.4.1`, BECA's current router IP, or its `.local` hostname in **BECA address**. If unsure, open `http://192.168.4.1` in Safari on the setup network. The native app permits private IPv4 addresses and `.local` names, on HTTP port 80.
3. Tap **Bluetooth MIDI**, connect **BECA BLE-MIDI**, and select its source. On Mac, use Audio MIDI Setup → Window → Show MIDI Studio → Bluetooth, then refresh the app's source list.
4. Tap **Connect BECA**. Wait for the board's presets/settings to load, then tap **Listen on this device**. BECA switches to BLE MIDI. Start with a low master level and test a sound, then attach the plant.
5. Choose headphones or speakers in system audio settings. Keep the app visible while playing. Bluetooth speakers add audio latency independently of Bluetooth MIDI.

Allow **Local Network** and **Bluetooth** when prompted. If denied, restore permission in Settings → Privacy & Security. The native iOS audio session uses playback mode; the system media volume still applies. On backgrounding or locking, the app silences local notes and closes its device session; reconnect and tap Listen after returning. Audio interruptions clear voices/effect tails and require a fresh user tap.

## Bounds and recovery

HTTP writes reuse the existing serialized queue (one write at a time, at least 60 ms between writes); continuous controls coalesce at 80 ms and the expression pad keeps its four-pair-per-second cap. State polls run every 500 ms, synth polls every two seconds, and heartbeat every 1.5 seconds; a busy poll group skips its next tick. Native HTTP requests time out after two seconds, and three consecutive failures close the session. The command queue caps at 128 entries and incoming native lines at 256. MIDI source removal sends panic and resets running status. Web parameters are deduplicated and graph history remains bounded. The firmware SSE stream and BLE libraries are unchanged by the native app.

The native bridge accepts messages only from the app's main loopback frame, and the web view blocks navigation away from that origin. HTTP exceptions exist because BECA serves local HTTP; native requests validate the local device address. The loopback server binds to `127.0.0.1`, limits request headers to 8 KiB and concurrent connections to 32, and closes idle connections. This does not add authentication to BECA's existing local HTTP API.

## Required physical validation before release

- Build/run on an iPhone and iPad, and Apple Silicon/Intel Macs where supported; test both portrait and landscape and larger text.
- First-run Local Network and Bluetooth allow/deny/re-enable; setup access point with no internet; router IP and `.local` address; sleep/wake and Wi-Fi changes.
- Check `isSecureContext`, WebAssembly and AudioWorklet in the bundled WKWebView, first-tap audio, all 13 presets, all eight channel-10 drums, note-offs, panic and long sessions.
- Verify BLE advertisement/service discovery, connection, disconnect/reconnect and movement between Apple devices. Compare note-on/off counts and verify no stuck notes.
- Check wired/Bluetooth speakers, silent switch, phone-call interruption and background/foreground recovery. No background playback guarantee is made.
- Repeat native HTTP/serial setting comparisons on real hardware. Verify restoring BLE output after an AUX-only session and choosing the correct source when several BECAs are present.

Apple documents the native connection path in [Adding Bluetooth LE MIDI Support](https://developer.apple.com/library/archive/qa/qa1831/_index.html) and [Bluetooth MIDI setup on Mac](https://support.apple.com/guide/audio-midi-setup/set-up-bluetooth-midi-devices-ams33f013765/mac). These sources establish the platform APIs, not successful tests of this implementation.
