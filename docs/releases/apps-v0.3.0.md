# BECA apps-v0.3.0

Desktop 0.3.0 · Android/web and Apple 1.7.0 · firmware 1.2.0 · ESP32 Arduino core 2.0.14.

## Downloads and installation

| Platform | Package | Steps |
| --- | --- | --- |
| Windows x64 | [Windows folder ZIP](https://github.com/fattyrecordingco/BECAfirmware/releases/download/apps-v0.3.0/BECA-Windows-0.3.0.zip) · [EXE](https://github.com/fattyrecordingco/BECAfirmware/releases/download/apps-v0.3.0/BECA_0.3.0_x64-setup.exe) · [MSI](https://github.com/fattyrecordingco/BECAfirmware/releases/download/apps-v0.3.0/BECA_0.3.0_x64_en-US.msi) | [Windows](../install/WINDOWS.md) |
| Android / web | [Open the Chrome PWA](https://fattyrecordingco.github.io/BECAfirmware/) · [Web folder ZIP](https://github.com/fattyrecordingco/BECAfirmware/releases/download/apps-v0.3.0/BECA-Android-Web-1.7.0.zip) | [Android / web](../install/ANDROID.md) |
| iPhone / iPad | [Apple development folder ZIP](https://github.com/fattyrecordingco/BECAfirmware/releases/download/apps-v0.3.0/BECA-Apple-1.7.0.zip) | [Apple native or Safari](../install/APPLE.md) |
| Mac M-series desktop | [Apple Silicon DMG](https://github.com/fattyrecordingco/BECAfirmware/releases/download/apps-v0.3.0/BECA_0.3.0_aarch64.dmg) | [Mac desktop](../install/APPLE.md#macos-desktop) |
| Mac Intel desktop | [Intel DMG](https://github.com/fattyrecordingco/BECAfirmware/releases/download/apps-v0.3.0/BECA_0.3.0_x64.dmg) | [Mac desktop](../install/APPLE.md#macos-desktop) |

Use [SHA256SUMS](https://github.com/fattyrecordingco/BECAfirmware/releases/download/apps-v0.3.0/SHA256SUMS) to verify assets. The Windows/desktop installers include firmware 1.2.0; the [merged firmware image](https://github.com/fattyrecordingco/BECAfirmware/releases/download/apps-v0.3.0/beca-1.2.0-merged.bin) is also available separately.

## Changes

- Notes, Arp, Chords and Drums show their relevant controls. Saved settings remain intact when a module is hidden.
- Grouped sound controls, plant scope and MIDI feedback form the instrument surface. Wi-Fi/MAC/hotspot setup, routing and diagnostics stay in Settings.
- Monochrome surfaces and green accents support Light and Dark appearance. The native Apple Connection disclosure follows the selected theme.
- BECA hosts the complete browser instrument at `/play/`; the root redirects there. `/control` retains the legacy controller and `/setup` handles network provisioning.
- iPhone/iPad Safari can play the original BECA WASM sound engine from ordered Wi-Fi MIDI without an Apple Account. The local HTTP audio fallback, bounded timestamp buffer and gap/disconnect panic preserve device note events.
- Android USB, native Apple Wi-Fi plus BLE MIDI, the desktop USB bridge, AUX and network MIDI remain separate connection/output paths. Wi-Fi MAC is visible for manual network registration.
- Repo design/copy rules require functional instrument labels and meaningful feedback, with bounded writes, polling and state-diff rendering.

## Verification and limits

Completed browser checks cover mode visibility after gestures and device updates, layouts on phone/tablet orientations, accessibility, controls, audio release/panic and reconnect. A genuine insecure HTTP `/play/` test rendered nonzero WASM audio in Chromium, preserved the device's arp pitch, followed live plant updates, released notes and panicked on stream gaps. Desktop interaction and appearance checks passed. These automated checks do not establish physical Safari latency or every device's connectivity.

The earlier physical native build 5 on `iPad15,5` has user-confirmed setup-access-point connection, knobs, Light/Dark, Test sound and Panic. That record is separate from the new unsigned release candidate and does not certify all iPhone/iPad models. Direct CH340 USB serial is unavailable in iPhone/iPad browsers and is not implemented in the native Apple app.

Windows installers are unsigned; Mac packages are not notarized. The Apple ZIP is an **unsigned development IPA**: each user signs/provisions it with their own Apple Account and xtool. Free Personal Team profiles expire after seven days. It cannot be installed by tapping it in Files/Safari, and no user-specific signed IPA is published. Safari `/play/` needs no signing. Android is a Chrome PWA, not an APK. Keep OS security protections enabled.

Use numeric `192.168.4.1` on BECA's setup access point; `.local` names may not resolve there. On home Wi-Fi/hotspots use its actual station IP. Networks that isolate clients can prevent browser playback. Keep the page visible while playing and reconnect after backgrounding. Wi-Fi/HTTP fallback has latency and jitter; no sample-accurate claim is made.
