# BECA Desktop App

`BECA` is the unified desktop app for flashing BECA firmware, provisioning Wi-Fi over USB, running the Serial -> MIDI bridge, and hosting the live control UI locally instead of on the ESP32.

## End-user manual

For complete user instructions (Windows/macOS/Linux install, DAW setup, and BECA control page usage), use:
- `README.md` sections `10` through `16`

Current setup app version baseline in this branch:
- `0.1.4`

## Final architecture choice

- Desktop shell: `Tauri + Rust + HTML/JS`
- Flasher: `tools/flasher` (Rust) + bundled `espflash` sidecar (and optional `esptool` sidecar for NVS backup/restore)
- Bridge: `tools/bridge` native Rust binary (`serialport` + `midir`)

### Pros

- Small installer footprint compared with Electron.
- Single native codebase for serial/MIDI/flash logic.
- No Python runtime required for end users.
- Fully CI-packaged installers for Windows/macOS/Linux.

### Tradeoffs

- Tauri packaging setup is stricter in CI (platform dependencies).
- MIDI backend behavior still depends on host MIDI stack availability.
- NVS backup/restore requires bundled `esptool` sidecar if enabled.

## What users get

- Windows installer (`.exe` / NSIS bundle)
- macOS disk image (`.dmg`)
- Linux installer bundle is temporarily paused while CI packaging is stabilized.
- Embedded firmware flasher flow (no Arduino IDE required)
- Embedded native bridge binary (no Python/pip install path)
- Hidden logs with expandable diagnostics panel and export zip

## Firmware compatibility baseline

BECA firmware remains pinned to ESP32 Arduino core `2.0.14` (project baseline).  
The setup app only flashes release artifacts built for that baseline.

## Branch layout

- `official-system-updates`: firmware/system release branch
- `official-app-updates`: installer/app release branch

Named baseline for this cycle:
- `verBECAbetav1.0.1` at commit `27559f9`

## User flow

1. **Connect BECA**
- Detects likely BECA serial ports using VID/PID and descriptor scoring (CH340/CP210x/FTDI/USB-SERIAL hints).
- If no device is found, app shows guided fixes (cable/driver/permissions).

2. **Update Firmware**
- Firmware list is loaded from `firmware-manifest.json` attached to the latest GitHub Release.
- `Latest Stable` is selected by default.
- Firmware binary is downloaded and SHA256 verified before flash.
- Flash uses bundled `espflash` (or `esptool` if provided).
- If bundled flash tooling is missing, app auto-repair downloads `espflash` (`v4.2.0`) and retries.
- If `espflash` cannot connect to some CH340/CP210x boards, app auto-fallback retries with `esptool` (`v5.2.0` on Windows).
- Flash now retries with safer baud rates when high-speed flashing fails (improves CH340/CP210x reliability on Windows/macOS/Linux).
- Standard firmware flashes keep BECA's saved Wi-Fi and runtime session data in NVS.

3. **Set Wi-Fi**
- Scans nearby Wi-Fi SSIDs through a USB serial command channel.
- Saves device name + SSID + password using firmware provisioning logic.
- Supports `Forget Wi-Fi` and controlled reboot from the app.
- Step 3 controls enter a short cooldown after flash/save/forget so serial commands are not sent while BECA is rebooting.
- AP setup page (`BECA-XXXX` + `http://192.168.4.1/setup`) remains as fallback.

4. **Start Bridge**
- Lists MIDI output destinations.
- Starts bundled native `beca-bridge` process.
- Auto-reconnects on serial disconnect.
- Supports `Test Note` to verify MIDI routing.
- Includes an optional `MicroFreak mode` toggle for direct Arturia MicroFreak note routing over the serial bridge.
- Restores the last selected bridge routing + MicroFreak toggles on next launch.
- Stops the bridge automatically when the BECA desktop app exits.
- Rechecks live-control transport when bridge state changes so Wi-Fi takes over when available and occupied-offline serial does not leave a stale control page mounted.

5. **Live Control**
- Reuses one native HTTP client for desktop live control instead of rebuilding the transport for each poll.
- Keeps a short-lived cached live snapshot and polls conservatively so UI refreshes stay smooth without hammering USB or Wi-Fi.
- Wi-Fi discovery keeps a target eligible after a valid BECA `/api/info` response, even when Bridge owns USB and deeper state probes are slow.
- Wi-Fi discovery probes the current device-name `.local` address and automatically selects a ready Wi-Fi target when Bridge is using USB serial.
- Wi-Fi Live Control prefers the firmware `/events` SSE stream for plant, MIDI, drum, and state updates; HTTP snapshots are kept as a slower fallback/status check.
- Wi-Fi fallback snapshots use smaller state/plant/note/drum requests instead of the combined `/api/live` response to reduce ESP32 heap and socket pressure.
- Holds the last good live frame briefly during reconnects so the plant monitor does not appear to freeze and reset on every transient delay.
- Defaults back to `Setup` until a control-ready target exists, with one always-visible device/status strip above both views.
- Matches the setup/control 575x842 frame sizing and keeps the 8-leaf LED mirror orientation stable in active color states.
- When the device is set to `Clock: Plant`, firmware output is edge-triggered by plant input instead of the internal sequencer; random rest/no-repeat substitutions are bypassed in that mode.
- The MIDI monitor reads firmware SSE note/drum events over Wi-Fi when available, with a UI-only note hold as fallback so short internal-clock notes remain visible without lengthening the actual MIDI gate.

## UI cohesion with BECA control page

The setup app UI intentionally mirrors BECA web control styling:
- same primary accent (`#008351`)
- same quiet white/green surface language without decorative gradients
- matching typography stack and mono diagnostics style

Keep this visual language aligned when changing either UI.

## Why the python-rtmidi failure cannot happen here

This app uses **Option 1** (native bridge) by default:
- No runtime `pip install`
- No `python-rtmidi` build path
- No Meson/MSVC/compiler dependency for end users

A dependency decision test exists in `tools/bridge/src/dependency.rs` and explicitly blocks unsafe source-build paths.

## Firmware release contract

Each firmware release must include a `firmware-manifest.json` asset:

```json
{
  "schema_version": "1.0.0",
  "repository": "fattyrecordingco/BECAfirmware",
  "generated_at": "2026-02-15T00:00:00Z",
  "firmware": [
    {
      "version": "1.0.2",
      "channel": "stable",
      "supported_hardware": ["ESP32-PICO-V3"],
      "merged_bin_url": "https://github.com/<owner>/<repo>/releases/download/v1.0.2/beca-1.0.2-merged.bin",
      "merged_bin_sha256": "<64-char sha256>",
      "release_notes_url": "https://github.com/<owner>/<repo>/releases/tag/v1.0.2"
    }
  ]
}
```

Notes:
- Use semantic versions (`x.y.z`) for firmware and app.
- Upload merged firmware `.bin` and matching manifest in the same release.
- `Latest Stable` means highest semantic version with `channel: stable` for `ESP32-PICO-V3`.
- A ready template lives at `tools/flasher/firmware-manifest.template.json`.

## Maintainer release workflow

1. Firmware release branch: `official-system-updates`.
2. Run firmware workflow `.github/workflows/firmware-release.yml` using tag `firmware-vx.y.z` (or `verBECAbetavx.y.z`).
3. Workflow builds firmware, merges image, and publishes:
- `beca-x.y.z-merged.bin`
- `firmware-manifest.json`
4. App release branch: `official-app-updates`.
5. Publish BECA release tag as `setup-vx.y.z` to trigger `.github/workflows/setup-installer-release.yml`.
6. Keep firmware and app releases separate so manifest lookup remains stable.

## Local development

```bash
# from repo root
cargo test -p beca-flasher
cargo test -p beca-bridge

cd apps/beca-setup
npm install
npm run tauri dev
```

Windows local packaging helper:

```powershell
powershell -ExecutionPolicy Bypass -File tools/build_setup_windows.ps1
```

This script creates a temporary short drive mapping to avoid MinGW `windres` issues with paths containing spaces.

Before packaging, copy sidecars into `apps/beca-setup/src-tauri/binaries/`:
- `beca-bridge`
- `beca-flasher`
- `espflash`
- `esptool` (recommended for flash fallback and backup/restore)

## Diagnostics

Logs are written to the app data folder:
- Windows: `%APPDATA%/com.fattyrecording.beca.setup/logs/`
- macOS: `~/Library/Application Support/com.fattyrecording.beca.setup/logs/`
- Linux: `~/.local/share/com.fattyrecording.beca.setup/logs/`

`Export Diagnostics Zip` includes logs and a system snapshot for support.

## Windows WebView2 notes

- Prefer installer package (`BECA_*_x64-setup.exe`) for end users.
- Portable mode must ship `BECA.exe`, `WebView2Loader.dll`, and `binaries/` together.
- If WebView2 runtime is missing, install:
  - https://go.microsoft.com/fwlink/p/?LinkId=2124703

## Firmware manifest troubleshooting

If BECA logs indicate manifest fetch failure:
- It usually means no recent published release includes `firmware-manifest.json`.
- Create/publish a release in `fattyrecordingco/BECAfirmware`.
- Ensure release includes `firmware-manifest.json` asset.
