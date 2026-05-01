# BECA Desktop App

This folder contains the BECA desktop application.

It is the primary user-facing product for:
- firmware flashing
- Wi-Fi setup
- live control
- Serial MIDI bridge management
- diagnostics export

Firmware flashing is intentionally locked to the latest stable release listed in the published firmware manifest. Older releases and ad hoc workspace builds are for developer-only PlatformIO flows, not the shipped setup app.

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
2. refreshes `dist-installer/windows/` with the current installer and portable executable

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

