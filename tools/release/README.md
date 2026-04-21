# Firmware Release Tools

These scripts generate BECA firmware release assets that `BECA` expects.

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
