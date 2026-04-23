# BECA Desktop App

This folder contains the BECA desktop application.

It is the primary user-facing product for:
- firmware flashing
- Wi-Fi setup
- live control
- Serial MIDI bridge management
- diagnostics export

## Run In Development

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
1. copies `.pio/build/esp32dev/firmware.bin` into `src-tauri/binaries/beca-current.bin`
2. builds the Tauri app
3. refreshes `dist-installer/windows/` with the current installer and portable executable

## Output Locations

- portable app: `target/release/beca-setup.exe`
- synced Windows artifacts: `dist-installer/windows/`
- NSIS installer: `target/release/bundle/nsis/`
- MSI: `target/release/bundle/msi/`

## Release Notes For Maintainers

- setup and control views must stay visually aligned with the firmware LED language
- bridge connect state is a toggle, not separate connect and stop buttons
- BECA clock is internal-only; the app exposes `DAW Sync` but not a separate clock selector
- live control prefers verified Wi-Fi and falls back to direct serial control when needed
- if release behavior changes, update the root [README.md](../../README.md) in the same commit

