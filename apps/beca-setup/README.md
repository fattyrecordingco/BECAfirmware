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
- optional `esptool` for backup/restore

Then run:

```bash
npm run tauri build
```

Windows runtime note:
- Use installer output first (`bundle/nsis/*.exe`).
- If using portable build, keep `beca-setup.exe` and `WebView2Loader.dll` together.
- Build script copies `WebView2Loader.dll` into `src-tauri/` so installer places it beside `beca-setup.exe`.

Firmware manifest source:
- Latest release manifest is fetched from `fattyrecordingco/BECAfirmware`.
