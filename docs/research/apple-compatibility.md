# Apple compatibility pass — 6 October 2026

## Result and release boundary

The current firmware has been rebuilt with ESP32 Arduino **2.0.14** and flashed to the connected ESP32-PICO-V3/CH340 BECA on **COM6**. Its original musical, synth, output and mute settings were checked after the update and match the pre-update record. Wi-Fi credentials were not edited.

Direct Safari Wi-Fi control and BLE-MIDI in native music apps are existing no-computer routes. The new [Apple instrument app](../../apps/beca-apple/README.md) combines Wi-Fi control and CoreMIDI with the shared phone synth. It targets iOS/iPadOS 15+ and macOS 12+, bundles its resources, and uses an isolated localhost web view. Source commit `da6bbff` was published on `codex/final-beca-release` on 6 October 2026. Its unsigned iPhone/iPad simulator and Apple Silicon/Intel Mac builds and Swift MIDI parser checks passed in [GitHub Actions](https://github.com/fattyrecordingco/BECAfirmware/actions/runs/37480642124). It is **not yet distribution-signed or installed/tested on physical Apple hardware**. Browser and compilation tests cannot establish that the native app works on every Apple device. Existing macOS Setup/Control installers are separate products and have not been replaced or published by this pass.

## Verified locally

| Check | Result | Limit |
| --- | --- | --- |
| ESP32 build and upload | Passed, core 2.0.14; 105,932 bytes RAM, 1,357,741 bytes program flash | PlatformIO build using Arduino core; Arduino IDE UI was not exercised |
| Serial state and plant sampling after final upload | 13 presets, 40 bounded readings; max response 14.6 ms; no captured firmware errors | Laptop USB connection |
| Live preset changes | All 13 presets at zero/0.17/full master, with outputs muted; original parameters restored | Parameter behavior, not analog audio measurement |
| BLE name and standard GATT | `BECA BLE-MIDI`, service `03b80e5a-ede8-4b33-a751-6ce34ec4c700`, characteristic `7772e5db-3868-4112-a1a9-f2669d106bf3`; read/notify/write-without-response available | Windows central using isolated Bleak 3.0.2 test tooling |
| BLE connection and rediscovery | Two complete advertising/connect/subscribe/disconnect cycles passed; 16 and 12 notifications observed; output restored | Native Apple CoreMIDI not tested |
| Phone protocol, synth and native adapter | 29 tests passed, including 13 presets at 44.1/48 kHz, eight drums, release/panic, startup cancellation, interruption and processor recovery | Test audio output, not speaker/headphone measurement |
| Apple WebKit + Chromium tablet browser suite | 68 passed, 16 skipped; includes iPhone/iPad/Mac profiles, controller recovery and a real two-browser tablet link | Emulated profiles; Windows WebKit lacks Web Audio and has an offline navigation limitation; transport-specific tests skip outside their assigned profile |
| Android/desktop phone regression suite | 39 passed, 3 transport-specific skips | Chromium tests; physical Android USB not rerun |
| BECA Setup/Control UI and routing | 32 tests passed; frontend rebuilt | Windows Chromium; native Mac bundle not built |
| Rust MIDI bridge | 17 tests passed, including splits, shared note destinations, note-offs and stream framing | Windows host build; CoreMIDI backend not run |
| Apple project resources/metadata | Phone app built and bundled; plist/scheme XML and project references checked; unsigned simulator and universal Mac builds and Swift MIDI parser passed on GitHub's Mac runner | Compile checks, not physical device/signing/runtime validation |
| Published Apple workflow, commit `da6bbff` | Both native builds and MIDI parser passed; 60 Safari-engine browser tests passed, nine skipped | GitHub Mac runner; offline navigation and transport tests assigned to other profiles skipped; physical BLE, local-network permission and WKWebView behavior still require device tests |
| Published browser workflow, commit `da6bbff` | 29 unit checks and 188 browser checks passed, 19 browser skips; static app build/artifact succeeded | Pages deployment rejected by the environment's branch restrictions; published website unchanged |
| Wi-Fi MIDI capabilities | Correct station/AP MACs, name `BECA-288260`, port 5004, output mode 4, station not connected | Actual RTP-MIDI invitation/clock/session test skipped: no station network available |

## BLE rediscovery defect and fix

Before the fix, a real BLE connection and notification subscription succeeded, but rediscovery subsequently failed. `bleKickAdvertising()` called `setMinPreferred()` and `setMaxPreferred()` repeatedly after `start()`. In the pinned NimBLE 1.4.3 source, both setters invalidate the advertising payload. Its subsequent reconstruction appends to the existing service UUID array. Rebuilding can therefore duplicate UUIDs and exceed the advertising payload capacity.

The minimal firmware change removes those repeated optional advertising setters. The library's original standard MIDI advertisement is reused, while the existing keepalive, disconnect advertising, note cleanup and watchdog yields stay in place. The two connection cycles then passed on the board. No BLE dependency or MIDI codec was replaced. Exact versions: BLE-MIDI **2.2.0**, MIDI Library **5.0.2**, NimBLE-Arduino **1.4.3**, AppleMIDI **3.5.0**, FastLED **3.10.3**, ESP32 Arduino **2.0.14**.

## Browser and native communication changes

The firmware web controller gives reads a four-second timeout, switches a stalled SSE stream to non-overlapping 700 ms fallback polling, and closes hidden-page streams/polls. Returning to the page reloads settings and creates a fresh stream. Late responses from old poll generations are ignored. The fallback renders state/notes/drums only when their payload changes; scope history remains bounded. Existing firmware SSE scope/note/drum rate limits (16 Hz), state differences, backpressure and yields remain. `index_html.h` was regenerated from `index.html` using `python3 make_index_header.py` (a PowerShell `python3` wrapper invoked the installed Python because the Windows Store alias was unusable).

The phone app clears notes/tails on interrupted audio, cancels late startup after Stop/backgrounding, and can recreate a failed worklet. Poll groups skip overlapping ticks, continuous controls retain 80 ms coalescing, and the expression pad retains its four-pair-per-second cap. Commands cap at 128 queued entries. Native input caps at 256 lines. The service-worker update removes only BECA phone caches.

The native bridge uses local HTTP APIs for controls and CoreMIDI for actual live notes. Listen selects BLE output 0 on this transport; USB and browser relay retain serial output 1. The app declares Local Network/Bluetooth permission purposes, validates private device addresses and accepts bridge messages only from its main loopback frame. The existing Mac Setup app now also includes Local Network and Bonjour declarations for new source builds.

## Remaining verification

The user subsequently identified their device as an **iPad Air M3**, running user-reported **iPadOS 26.6.1**, and requested the same app experience with direct serial. Unlike iPhones and non-M-series iPads, that iPad meets Apple's USBDriverKit hardware requirement. A custom CH340 driver could expose the existing 115200-baud serial protocol to the app without changing BECA's controller. The attached bridge identity was checked locally as `0x1A86:0x7523`. USBSerialDriverKit itself is macOS-only; the iPad route requires USBDriverKit and an app user client. There is no such driver in this project yet, and the user has no Mac/Xcode or Apple Developer account available. See the [shared-experience and wired-serial requirements](../../apps/beca-apple/README.md#shared-app-experience-and-wired-serial) for signing, installation and physical acceptance checks. DriverKit eligibility is not evidence that a working driver has been delivered.

The shared phone app's pending reply records were also corrected to retain their reject callback. Failed verification can now cleanly clear pending requests and reconnect through USB or the native adapter; browser tests cover both paths. The Apple adapter integration test now exercises shared root/wave controls, the expression pad, drum kit and live plant-display changes. All **12 targeted browser checks** passed across Android Chromium and iPhone/iPad/Mac WebKit profiles, and all **29 protocol/audio/adapter unit checks** passed. The rebuilt phone assets were copied into the native app's local resources. These are browser tests with a mocked native adapter, not installed native app or DriverKit tests. No firmware or BLE library change was needed for this follow-up; the installed Arduino core remains **2.0.14**.

- Build/run the Xcode project locally on an Apple tester's Mac. GitHub's Mac runner has compiled the iOS simulator and Apple Silicon/Intel Mac targets; actual application behavior on those Macs still requires runtime testing.
- Install/run the native app on iPhone/iPad; verify its localhost WKWebView secure context, AudioWorklet, offline launch, Local Network and Bluetooth allow/deny flows, and CoreMIDI source selection.
- Repeat BLE pairing, reconnection and movement between Apple devices; confirm MIDI note-off counts, all 13 presets and all eight drums, panic, simultaneous Wi-Fi control and long sessions.
- Test physical Safari direct HTTP/SSE against BECA's setup access point and a router, including idle/screen lock/foreground recovery, captive portal behavior and IP changes. The development computer's current network could not reach BECA's setup IP; no system Wi-Fi profile was changed to force this test.
- Test actual RTP-MIDI network invitations, timing and reconnect on a shared router, using macOS Audio MIDI Setup and supported native iOS apps. AP-only operation intentionally does not start RTP-MIDI.
- Check speakers, wired headphones, Bluetooth audio, phone-call interruptions, silent switch, large text, small iPhones and iPad orientation. Older OS versions outside the native deployment targets are not certified.
- Sign/notarize native Mac builds and configure iOS signing/TestFlight before distributing installable native releases. Existing DMGs and App Store listings were not modified. Publishing the development branch triggered the separate browser workflow, but GitHub's `github-pages` environment rejected deployment because `codex/final-beca-release` is not an allowed branch. The current website remains unchanged. Source publication and Apple build validation succeeded independently of that deployment.

With saved Wi-Fi that is unavailable, firmware boot can take two 16-second connection attempts before falling back to its access point. Early post-flash serial requests timed out until boot completed; subsequent checks passed. Allow startup to finish before connecting. If this delay needs removal, handle it as a separate boot/network state-machine change with hardware regression tests.

Apple's documented paths: [Bluetooth MIDI connection setup](https://support.apple.com/guide/audio-midi-setup/set-up-bluetooth-midi-devices-ams33f013765/mac), [native BLE-MIDI integration](https://developer.apple.com/library/archive/qa/qa1831/_index.html), and [local-network privacy](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy). Mac bundle metadata follows [Tauri's macOS bundle guidance](https://v2.tauri.app/distribute/macos-application-bundle/).
