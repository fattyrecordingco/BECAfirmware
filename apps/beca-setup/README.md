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
