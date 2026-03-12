# BECA Setup (Tauri)

## Development

```bash
cd apps/beca-setup
npm install
npm run tauri dev
```

## Packaging

Copy sidecars to `src-tauri/binaries/` before build:
- `beca-bridge`
- `beca-flasher`
- `espflash`
- `esptool` (recommended; required for fallback flash path and backup/restore)

Then run:

```bash
npm run tauri build
```

Windows runtime note:
- Use installer output first (`bundle/nsis/*.exe`).
- If using portable build, keep `beca-setup.exe`, `WebView2Loader.dll`, and the `binaries/` folder together.
- Build script copies `WebView2Loader.dll` into `src-tauri/` so installer places it beside `beca-setup.exe`.
- If `espflash` is missing in the install, the app auto-repairs by downloading a signed `espflash` sidecar at flash time.
- If `espflash` cannot connect on some CH340 boards, app automatically retries using bundled/downloaded `esptool`.

Firmware manifest source:
- Manifest is fetched from the most recent published release in `fattyrecordingco/BECAfirmware` that includes `firmware-manifest.json`.
