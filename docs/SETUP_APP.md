# BECA Setup App

`BECA Setup` is a desktop installer/wizard for flashing BECA firmware and running the Serial -> MIDI bridge without manual terminal steps.

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
- Linux bundle (`.AppImage`, optional `.deb`)
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

3. **Start Bridge**
- Lists MIDI output destinations.
- Starts bundled native `beca-bridge` process.
- Auto-reconnects on serial disconnect.
- Supports `Test Note` to verify MIDI routing.

## UI cohesion with BECA control page

The setup app UI intentionally mirrors BECA web control styling:
- same primary accent (`#008351`)
- same soft green glass surfaces and gradient background treatment
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

1. Build firmware for BECA and generate merged `.bin`.
2. Compute SHA256 checksum.
3. Update `firmware-manifest.json` for the new version.
4. Create GitHub Release tag (for example `v1.0.3`) and attach:
- merged `.bin`
- `firmware-manifest.json`
5. Publish release.
6. CI workflow `.github/workflows/setup-installer-release.yml` builds setup installers and uploads artifacts.

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
- `esptool` (optional, needed for backup/restore)

## Diagnostics

Logs are written to the app data folder:
- Windows: `%APPDATA%/com.fattyrecording.beca.setup/logs/`
- macOS: `~/Library/Application Support/com.fattyrecording.beca.setup/logs/`
- Linux: `~/.local/share/com.fattyrecording.beca.setup/logs/`

`Export Diagnostics Zip` includes logs and a system snapshot for support.

## Windows WebView2 notes

- Prefer installer package (`BECA Setup_*_x64-setup.exe`) for end users.
- Portable mode must ship `beca-setup.exe` and `WebView2Loader.dll` together.
- If WebView2 runtime is missing, install:
  - https://go.microsoft.com/fwlink/p/?LinkId=2124703

## Firmware manifest troubleshooting

If BECA Setup logs indicate manifest fetch failure:
- It usually means GitHub latest release is missing or inaccessible.
- Create/publish a release in `fattyrecordingco/BECAfirmware`.
- Ensure release includes `firmware-manifest.json` asset.
