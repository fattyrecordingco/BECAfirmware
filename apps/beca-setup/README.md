# BECA Desktop App

This folder contains the BECA desktop application.

It is the primary user-facing product for:
- firmware flashing
- Wi-Fi setup
- live control
- Serial MIDI bridge management
- diagnostics export

The app offers included, checksum-verified firmware for offline first installation and the latest stable release from GitHub. A release build must stage firmware with `tools/release/prepare_release.py` before bundling. Blank ESP32 boards need the complete merged image; the flasher preserves the NVS settings gap.

## Run In Development

The new **Performance** view exposes all musical controls together. Input events send coalesced updates through serialized reads/writes, capped at 20 writes/second. State snapshots run at 500 ms and full synth reconciliation at 2 seconds while visible. Active edits are protected from older responses. Install matching firmware for the expanded preset menu.

Its local diagnostic assistant explains stale/invalid/clipped/quiet readings and retries snapshots with bounded backoff; it does not infer plant health or alter music/firmware. Use Reconnect after retries pause. Build with `VITE_BECA_PERFORMANCE_PAGE=false` to omit this page. Run `node --test scripts/health-check.mjs` for diagnostics tests; Performance behavior/accessibility is included in `npm run test:ui`.

Performance includes a measured plant display, pinned essentials, three XY mappings, bounded mutation with Undo, a firmware-backed soundscape browser and four locally saved timbre variations. **Focus controls** exposes all parameter groups; numeric entries, fine keyboard adjustments and slider resets support precise edits. M toggles mute and 1–4 recall variations when not typing. The new firmware `preset_live` capability preserves master volume atomically when browsing sounds; legacy firmware keeps its original preset behavior. Raw sine disables bypassed timbre gestures. See the [complete interaction notes](../../docs/research/performance-interaction.md) and [root usage guide](../../README.md#playable-performance-interface).

```bash
cd apps/beca-setup
npm install
npm run tauri dev
```

## Build The Frontend

```bash
cd apps/beca-setup
npm run build
```

## UI Verification

Use these during design refinement before shipping desktop UI changes:

```bash
cd apps/beca-setup
npm run verify:browser
npm run test:ui
```

`verify:browser` uses `agent-browser` for a fast smoke check and saves screenshots under `.beca-cache/ui-verification/`.
`test:ui` runs Playwright checks for the setup/control panel geometry, visible overflow, accessibility contrast, and encoder arrow-key behavior.

## Build The Native App

```bash
cd apps/beca-setup
npm run tauri build
```

## Windows Release Flow

Use this when preparing an official Windows release:

```bash
platformio run
cd apps/beca-setup
npm run release:windows
```

That script:
1. builds the Tauri app
2. refreshes `../../installers/windows/` with the current installer and portable executable

## Output Locations

- portable app: `target/release/beca-setup.exe`
- synced Windows artifacts: `../../installers/windows/`
- NSIS installer: `target/release/bundle/nsis/`
- MSI: `target/release/bundle/msi/`

## Release Notes For Maintainers

- setup and control views must stay visually aligned with the firmware LED language
- bridge connect state is a toggle, not separate connect and stop buttons
- BECA supports internal clock and plant-triggered clock; plant clock must remain edge-triggered by real plant input
- live control prefers verified Wi-Fi and falls back to direct serial control when needed
- Wi-Fi live control uses the firmware `/events` stream for monitor/state updates when available; fallback HTTP snapshots use `/api/live`, short cache windows, and coalesced app adjustments to keep ESP32 core 2.0.14 responsive while serial MIDI is active
- The bundled bridge sends a lightweight serial-host heartbeat so firmware streams Serial MIDI only when the bridge/control channel is actually draining USB, preventing idle COM-port backpressure from making Wi-Fi control feel frozen
- if release behavior changes, update the root [README.md](../../README.md) in the same commit



### Editable MIDI splits and Aux together

Setup contains the only **MIDI routing** editor: up to eight saved splits, Apply, Start/Stop, Release MIDI notes and automatic reconnection. The native `BridgeSession` owns USB and serves MIDI and control requests together. Select **Serial MIDI + Aux** for both outputs. Drum controls are separate and labelled MIDI channel 10; Aux's inactive drum-kit selector is removed. Performance stays dedicated to playing.

Troubleshooting: close separate serial monitors/CLI bridges before opening the app bridge. Wi-Fi provisioning, reboot and flashing still require stopping it. A missing MIDI destination preserves existing routes during Apply; an active send failure stops the bridge with an error. See the root README and `docs/research/live-routing-verification.md` for verification and latency limits.

## Wi-Fi MAC and phone hotspot settings

The device controller, recovery setup, desktop Setup/Control, and phone/Apple controller display BECA’s **Wi-Fi MAC** (`sta_mac`). Copy this station address when registering BECA manually with a home router or managed network. The setup access point (`ap_mac`) and Bluetooth addresses are different. Firmware that does not report the station MAC displays an unavailable message.

Open **Settings · Wi-Fi & phone hotspot** in the phone controller. On Android, connect BECA by USB, enable a **2.4 GHz** hotspot in the phone’s system settings, enter its exact name and password, then choose **Save Wi-Fi & restart BECA**. The same form accepts home Wi-Fi credentials. BECA tests credentials before saving; allow up to 25 seconds. The protected-network form accepts SSIDs up to 32 UTF-8 bytes and passwords of 8–63 characters, without tabs/newlines or outer spaces. Use the recovery page for open networks. Credentials are not saved in browser storage or shown in the serial console.

On iPhone/iPad, or without Android USB, join BECA’s setup Wi-Fi and open `http://192.168.4.1/setup` (or `/setup` at its current local IP). Configure the hotspot using this page. Enable **Maximise Compatibility** where available on iPhone; Apple documents that this uses 2.4 GHz: https://support.apple.com/en-ca/guide/security/secfd166f620/web . If the same phone cannot host its hotspot while connected to BECA’s setup network, use a second phone/tablet for provisioning while the first hosts the hotspot. The app cannot turn on the system hotspot itself.

After saving, reconnect USB or update the native Apple app’s address using BECA’s new IP from the router/hotspot client list. Keep the hotspot and BECA powered. If Wi-Fi control fails, check the band, password, Local Network permission and hotspot client isolation; Android USB control remains available. Enterprise authentication and captive portals still require a compatible personal network.

Network identity is fetched on connection/settings opening or manual refresh, with a 3-second minimum interval and no continuous network polling. Identity labels only change when their value changes. Provisioning pauses phone live polling and control writes, allows one save at a time, and has a 3-second retry cooldown. Existing SSE rate limits and state-diff updates remain in place.

## Instrument controls and browser Wi-Fi playback

The shared playing surfaces now group mode/preset/master/play, sound controls and plant/MIDI feedback. Mode-specific modules appear only when used; hidden controls retain values. Connection/setup and diagnostics remain secondary. See [design rules](../../docs/design/INSTRUMENT_UI.md) and [copy rules](../../docs/design/UI_COPY.md).

The rebuilt development firmware also serves a standalone browser instrument at `http://DEVICE_IP/play/`. This path generates sound locally from the shared WebAssembly synth and consumes ordered Wi-Fi MIDI events without a native app or computer; the native Apple app keeps its existing CoreMIDI path. See [browser playback and recovery](../../README.md#browser-instrument-over-wi-fi-local-development-firmware) for setup, HTTP audio fallback, and physical validation limits.


## Appearance

Choose **Dark** or **Light** from **Appearance** beside the app’s view buttons. Setup, Performance, MIDI routing and Control share the same monochrome surfaces and green instrument accents as the phone app. The choice is saved on this computer and applies to an already open Control view without resetting its connection or changing device parameters. If browser storage is unavailable, the choice lasts for the current session.


Control startup is cancelled if you switch views before it finishes loading. Returning to Control opens the current view normally; an earlier load cannot create a hidden second live stream behind Performance.

## MIDI controller mapping (0.3.1)

Connect a controller to the computer and open **Performance → MIDI controller**. Select **MIDI input**, choose a BECA **Control**, press **Learn**, then move its knob or press a pad. Learning does not change the sound. Move the control again to play. Up to 64 assignments are saved on this computer, separately by input name, MIDI channel and source. Learning an already assigned source replaces its assignment.

Standard MIDI 1.0 CC 0–119, note pads and pitch bend work through the operating system's MIDI drivers on Windows, Mac and Linux. No browser MIDI permission, new MIDI library or firmware change is needed for desktop mapping. MIDI 2.0-only, SysEx, NRPN/RPN and proprietary controller modes require configuring the controller to send supported messages. Duplicate input names must be renamed in the OS/controller utility. Mappings apply while Performance is visible; mode-hidden and unavailable controls keep their saved values.

Continuous controls default to **Pickup**: match or cross the current app value before the knob takes over. Pickup rearms after mouse edits, preset recall, reconnect or a device change. Choose **Direct** for immediate changes, or the matching **Relative** format for endless encoders (two’s complement, offset or sign magnitude). Relative increments use the control's smallest step. **Reverse** inverts its direction. Note pads toggle switch controls on each new press; CC switches follow their threshold. Delete an assignment with its trash icon.

Incoming gestures use the same serialized, coalesced 20-writes/second path as the on-screen controls. Native input is drained at most 25 times/second with a 256-message queue; overflow drops the partial batch and rearms pickup. Port discovery runs at most every three seconds, reconnects the selected input, and stops when Performance closes or the app goes into the background. Controller input never forwards notes to BECA's MIDI outputs or changes the existing bridge routes.

If no inputs appear, reconnect the controller, install its OS driver if required, press **Refresh MIDI inputs**, and close apps that have exclusive access. Keep BECA connected separately through Setup. A controller's USB connector does not replace BECA's data connection. BLE controllers work if paired as MIDI inputs by the OS; BECA's BLE firmware remains unchanged.

## Update notices

Desktop 0.3.1 checks for a newer stable app release on launch and when returning after six hours. The notice opens the official release downloads; dismissing it does not interrupt music. Offline use is unaffected. Earlier desktop builds do not contain this checker and cannot receive an in-app notice retroactively. GitHub release subscribers receive notifications according to their GitHub settings.

Phone/PWA 1.7.1 shows **Update** when a cached update is ready. It waits until the performer chooses Update, silences local audio and disconnects before reloading. A different app window activating an update also leaves the current performance running until Update is chosen. Foreground checks are limited to once per hour. There is no push-subscription service or installed-user contact database.
