# Firmware Release Tools

These scripts generate BECA firmware release assets that `BECA` expects.

## Complete desktop update 0.2.0

Build with `tools/build_firmware.ps1` on Windows (Arduino core 2.0.14). With esptool 5.2.0 and Markdown 3.8.2 installed in your build Python, run:

```text
python tools/release/prepare_release.py --version 1.1.0 --tag setup-v0.2.0 --packages <PlatformIO packages directory>
python tools/release/render_manual.py
cargo build -p beca-bridge -p beca-flasher --release
```

The preparation script stages the complete merged image and checksum manifest in `apps/beca-setup/src-tauri/resources/firmware`. Copy fresh bridge/flasher executables into `src-tauri/binaries` alongside espflash 4.2.0/esptool 5.2.0 before running `npm run release:windows` from the app directory. Do not distribute the standalone EXE without its resources; use the installer.

The setup tag workflow builds firmware once, runs audio/Rust/browser regressions, embeds that image in all four OS/architecture builds, and publishes only after all installers succeed. Release assets carry checksums and the offline manual. Installer binaries live in Releases; the old 0.1.7 in-repository copies are historical and should not be downloaded for this update. Unsigned builds are prereleases. Signing credentials are described in `docs/RELEASE_SECURITY.md`.

## Local Windows flow

From repo root:

```powershell
powershell -ExecutionPolicy Bypass -File tools/release/build_firmware_release.ps1 -Version 1.0.1 -Tag verBECAbetav1.0.1 -Channel stable
```

Outputs:

- `dist/firmware-release/beca-<version>-merged.bin`
- `dist/firmware-release/firmware-manifest.json`

Upload both files to the GitHub release for the same tag.

## Manifest-only generation

```bash
python tools/release/generate_firmware_manifest.py \
  --repo fattyrecordingco/BECAfirmware \
  --version 1.0.1 \
  --tag verBECAbetav1.0.1 \
  --channel stable \
  --hardware ESP32-PICO-V3 \
  --asset-name beca-1.0.1-merged.bin \
  --sha256 <64-char sha256> \
  --output dist/firmware-release/firmware-manifest.json
```
