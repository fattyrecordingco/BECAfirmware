# BECA Apple app — iPad launch confirmed; wired serial outstanding

This project provides Wi-Fi control and native MIDI for **iPhone/iPad on iOS/iPadOS 15+** and **Mac on macOS 12+**. BECA 1.6.0 was development-signed, installed and opened on the user's iPad Air M3 on 11 October 2026. The user requires **direct USB-C serial on both iPad and iPhone**, which this build does not provide. Instrument acceptance, physical iPhone testing and public distribution remain outstanding. Do not advertise this as a finished wired Apple app.

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
| iPad Air M3, device-reported iPadOS 26.6.1 | Native Wi-Fi + CoreMIDI app installed; user confirmed first launch | DriverKit is supported by the hardware; a custom driver is not implemented or installed |
| Other M-series iPads on iPadOS 16+ | Same native Wi-Fi + CoreMIDI source project | Same custom-driver development and signing requirement |
| iPhone and iPads without M-series chips | Same native Wi-Fi + CoreMIDI source project | No equivalent general USBDriverKit path |

The connected BECA exposes a WCH CH340 USB bridge, **VID `0x1A86`, PID `0x7523`**, and the shared serial protocol uses **115200 baud, 8N1**. A custom USBDriverKit extension could provide this byte stream to the native app on an eligible M-series iPad without replacing the ESP32. Apple's **USBSerialDriverKit** framework is macOS-only; an iPad implementation must use USBDriverKit with its own driver-to-app user client. The app would then feed serial replies, telemetry and `@M` MIDI events through the existing parser, and Listen would select firmware serial output **1**. It must not also feed CoreMIDI notes into that same serial session.

Delivering that path requires an embedded CH340 USBDriverKit extension, an app user client, a Mac/Xcode build environment (a cloud runner can supply it), eligible Apple signing/provisioning and physical iPad tests. Apple DTS explicitly states that DriverKit capabilities do not work for a free Personal Team. Members of an Individual or Organization team can enable development capabilities; distribution requires Apple's additional authorization. The user currently has a free Apple Account, which was sufficient to install the ordinary app but cannot provision this driver. Apple also requires the user to enable an installed iPad driver in Settings. No personally owned Mac is required if cloud compilation is used; cloud compilation does not replace eligible signing or device validation.

The iPad driver route does **not** solve iPhone wired serial: USBDriverKit supports macOS and M-series iPadOS, not iPhone iOS. The existing ESP32-PICO-V3 has no native USB peripheral; its external CH340 cannot become an Apple-supported USB class through an ESP32 firmware update. Supporting both devices with one wired product therefore needs a different supported accessory transport or additional/revised USB hardware. A proposed bridge must carry all commands, replies and plant telemetry, not only musical notes; its performance and physical compatibility must be validated before choosing hardware. No bridge or controller change has been implemented or tested.

The user confirmed on 11 October 2026 that **the existing BECA hardware must stay unchanged**, declining the proposed added bridge or revised controller. The USB MIDI/SysEx bridge proposal is therefore outside the accepted scope. No hardware purchase or modification has been made. With the existing CH340 hardware, direct wired serial to both iPad and iPhone cannot be delivered through the supported APIs identified above. An iPad-only driver remains a possible software project once eligible developer signing is available; paying for developer membership does not add iPhone USBDriverKit support. The installed wireless candidate is not acceptance of the wired requirement.

### Wired retry on the current setup

On 11 October 2026 the user requested another wired attempt with unchanged hardware. Windows detected the same `1A86:7523` CH340 at **COM5**. `py tools/verify_device.py COM5` passed: all 13 preset definitions, 40 advancing bounded plant samples and no captured firmware errors; maximum measured command response was **14.2 ms**. This confirms the cable/bridge/firmware serial path on Windows, not direct iPad communication. The test closed its port and did not change output mode, presets or Wi-Fi settings. ESP32 Arduino **2.0.14** was reconfirmed from the installed core header.

The authenticated Apple Developer Services team query returned **Xcode Free Provisioning Program (iOS)**. The installed BECA provisioning profile contains **no DriverKit entitlements**. Those checks establish that the current account/profile cannot provision the proposed iPad driver; no driver signing/activation attempt was submitted and no USB-enabled replacement app was installed. xtool 1.21.0's recognized capability mapping also contains no DriverKit entitlement types, so its ordinary free-account app installation cannot supply driver permissions merely by adding an entitlement plist. An eligible account, correctly provisioned app/driver, implemented CH340 USB/user-client code and physical acceptance remain necessary.

Apple DTS addresses this exact ESP32/USB-C case in [USB-C serial on iPhone and iPad](https://developer.apple.com/forums/thread/772812): DriverKit can provide an iPad path, while iPhone lacks that route and neither platform exposes generic USB serial through a built-in class API. The thread's USB Ethernet suggestion relies on a controller with native USB, such as ESP32-S3; it is not a firmware-only solution for the attached ESP32-PICO-V3/CH340. Searches for a reusable driver did not identify a verified iPad CH340 driver exposing a compatible user-client interface for this app. macOS CH340 drivers and terminal products must not be treated as iPad drivers.

### Direct-cable workaround investigation

The user subsequently required **a direct BECA-to-iPad/iPhone cable during use**, explicitly declining a wired relay through the existing laptop. A read-only Windows Apple USB multiplexer probe had discovered one USB device, zero network devices, and successfully opened its existing TCP service at port 62078. That establishes a USB-only laptop-to-iPad tunnel, not a BECA app endpoint or complete serial relay. No relay was implemented after the user rejected that topology. USB installation from the laptop remains a separate authorized operation.

Primary-source review on 11 October 2026 found no verified direct-cable signing/access workaround for this M3 iPad on iPadOS 26.6.1:

- [TrollStore](https://github.com/opa334/TrollStore) lists older OS versions through selected iOS 17.0 builds, excluding this OS.
- [Dopamine](https://github.com/opa334/Dopamine) lists iOS 26.0–26.0.1 only for A12/A13; it does not cover this M3/26.6.1 combination. [palera1n](https://github.com/palera1n/palera1n) targets A8–A11/T2 hardware, not M3.
- [Erosion](https://github.com/jailbreakdotparty/Erosion) lists this OS range, but its underlying [bad_query](https://github.com/forcequitOS/bad_query) documents access to selected container filesystem paths. The reviewed public API consumes filesystem sandbox extensions. No USB device access, driver-signing authorization or code-signature bypass was identified in that mechanism. Filesystem access alone is not evidence that a CH340 driver can load.
- Apple's [free-account local DriverKit workaround](https://developer.apple.com/forums/thread/847647) describes local Mac signing and Mac SIP/AMFI changes. It does not describe an iPad procedure or grant iPad provisioning.

These tools were researched as source/documentation only. No exploit was executed or installed, no OS/security setting was changed, and no app or firmware runtime source was modified. The remaining supported direct path is a custom iPad driver signed by an eligible developer team (which need not be personally owned by the user). That still requires implementation, provisioning and physical tests and does not provide iPhone support. This investigation does not establish that every possible vulnerability has been excluded.

### Open-source development and no-cost access

The repository's own code is already covered by the root MIT license. A BECA CH340 driver and app user-client implementation can also be published under that license, with public build instructions, unsigned compile checks and protocol tests; third-party components retain their licenses. Apple's privileged-driver provisioning requirement still applies when installing the driver on a stock iPad. An unsigned public build is not an installable wired solution.

A community maintainer with an eligible developer team could build/sign a free app containing the open-source driver and seek Apple's USB/DriverKit distribution authorization. Users of that distributed app would not each need developer membership. Another no-fee route is an approved [Apple Developer Program fee waiver](https://developer.apple.com/help/account/membership/fee-waivers/) through a qualifying nonprofit, accredited educational institution or government entity. Apple excludes individuals, sole proprietors and single-person businesses; simply publishing open-source code does not qualify. A waived membership still needs the relevant driver capabilities/profiles and any distribution approval. Neither route is presently available in this setup, and no signed CH340 driver has been delivered.

Required serial acceptance checks are full shared control/plant/synth behavior, raw command replies, complete MIDI note-on/off and drum delivery, bounded read/write queues, one owning connection, cable removal and reconnect, background/foreground cleanup, and startup without inadvertently resetting BECA. The driver must match the supported USB identity and confirm the BECA `PING`/`PARAMS` handshake before enabling controls. Existing BLE behavior and ESP32 Arduino **2.0.14** remain requirements. No USB driver target or release claim has been added to this project.

Sources: [Creating drivers for iPadOS](https://developer.apple.com/documentation/driverkit/creating-drivers-for-ipados), [USBDriverKit](https://developer.apple.com/documentation/usbdriverkit), [USBSerialDriverKit platform availability](https://developer.apple.com/documentation/usbserialdriverkit), [Apple DTS: development capabilities and Personal Team restriction](https://developer.apple.com/forums/thread/747029), [DriverKit development provisioning](https://developer.apple.com/help/account/provisioning-profiles/create-a-driverkit-development-provisioning-profile), [DriverKit distribution entitlements](https://developer.apple.com/documentation/driverkit/requesting-entitlements-for-driverkit-development), [Espressif USB peripheral support](https://docs.espressif.com/projects/esp-iot-solution/en/latest/usb/usb_overview/usb_overview.html).

### Connection recovery

The shared app now retains both the resolve and reject callbacks for pending replies. A failed send or disconnect can therefore settle verification immediately, clear the session and allow reconnect instead of throwing while trying to reject a missing callback. Browser regression tests cover failed verification and reconnect for both USB and the mocked Apple native bridge, plus Apple control, expression-pad, drum-kit and changing plant-data behavior. These tests validate the shared UI/bridge contract, not physical iPad USB or native Swift compilation.

## Build and install

### Windows development with xtool

An additional Swift package build path now references the same native source files for [xtool-org/xtool](https://github.com/xtool-org/xtool). Follow [Windows setup and installation](WINDOWS.md) for the pinned tools, WSL prerequisites, Apple SDK/authentication and development-device installation commands. The unrelated `x-tools-author/x-tools` debugger cannot build this app.

As of 11 October 2026, WSL 2.7.13.0, USBIPD 5.3.0 and Ubuntu 24.04 are installed after the laptop restart. Swift 6.4.0 and checksum-verified xtool 1.21.0 execute successfully, and the shared Swift package manifest parses locally. After direct USB forwarding failed, Apple's Windows device bridge enabled xtool to **sign, install and verify BECA 1.6.0 on the connected iPad**, using the user's free account. After completing the Developer Mode restart and confirmation, the user reported **BECA opens**. Its development profile expires on 18 October 2026. The user then reiterated the wired serial requirement; neither USB serial nor physical instrument acceptance is complete. No local Apple SDK is installed; this binary was compiled on GitHub's Mac runner. The Mac build below and App Store/TestFlight release requirements still apply; xtool does not provide Apple's distribution approval or DriverKit entitlements.

### Device build and test handoff

The Apple checks workflow now builds an unsigned **Release-iphoneos arm64** candidate for both iPhone and iPad, checks its compiled icons, privacy manifest and bundled asset hashes, and packages it as an IPA. The workflow also launches the actual native shell on iPhone/iPad simulators and captures screenshots. A device artifact is uploaded only after the complete job passes. Follow [iPad/iPhone installation and acceptance](INSTALL-IPAD.md); signing is still required before an unsigned artifact can be installed. Cloud compilation does not require a locally extracted Apple SDK; xtool can sign/install that prebuilt artifact on Windows.

The [11 October Apple check run](https://github.com/fattyrecordingco/BECAfirmware/actions/runs/38164016990) passed for `3f0a59c`: iOS simulator, physical-device arm64 Release and universal Mac compilation, MIDI regression checks, native launches on iPhone 17 Pro and iPad Pro 13-inch (M5) simulators, and **60 Safari layout/audio checks with nine skips**. Both native screenshots were visually reviewed. The downloaded IPA's SHA-256 matched `2f0f38e6f7aaa771206be8857b4600c2551cf37e9511d0bf6af4a762e0fbb21d`. These artifacts are unsigned development candidates; physical-device acceptance remains separate.

The app now includes opaque icons rendered from the existing BECA vector logo and a privacy manifest declaring its use of UserDefaults to save its own BECA address. Run `node apps/beca-apple/make-icons.mjs` after a logo change, with the phone-app development dependencies installed. No new native runtime dependency is added. The [privacy manifest declaration](https://developer.apple.com/documentation/technotes/tn3183-adding-required-reason-api-entries-to-your-privacy-manifest) is packaging metadata; App Store Connect privacy answers and review remain separate.

Current local checks passed: all 29 protocol/audio/adapter unit checks; 36 iPhone/iPad WebKit checks with 10 expected profile/runtime skips; real COM6 protocol checks with 40 bounded plant samples; and two real BLE advertisement/GATT/notification/disconnect/reconnect cycles using bleak 3.0.2. These Windows BLE checks do not certify Apple's CoreMIDI or physical iPad/iPhone audio. The Safari tests on the Mac runner include its Web Audio support. The phone build's transitive development dependency `source-map-js` was patched from 1.2.1 to 1.2.2; npm's audit then reported zero vulnerabilities.

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
