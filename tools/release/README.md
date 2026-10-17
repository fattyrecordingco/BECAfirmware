# Firmware Release Tools

These scripts generate BECA firmware release assets that `BECA` expects.

## Complete app update 0.3.1

Build with `tools/build_firmware.ps1` on Windows (Arduino core 2.0.14). With esptool 5.2.0 and Markdown 3.8.2 installed in your build Python, run:

```text
python tools/release/prepare_release.py --version 1.2.1 --tag apps-v0.3.1 --packages <PlatformIO packages directory>
python tools/release/render_manual.py
cargo build -p beca-bridge -p beca-flasher --release
```

The preparation script stages the complete merged image and checksum manifest in `apps/beca-setup/src-tauri/resources/firmware`. Copy fresh bridge/flasher executables into `src-tauri/binaries` alongside espflash 4.2.0/esptool 5.2.0 before running `npm run release:windows` from the app directory. Do not distribute the standalone EXE without its resources; use the installer.

The setup tag workflow builds firmware once, runs audio/Rust/browser regressions, embeds that image in all four OS/architecture builds, and publishes only after all installers succeed. Release assets carry checksums and the offline manual. Installer binaries live in Releases; the old 0.1.7 in-repository copies are historical and should not be downloaded for this update. The public release is marked as latest; this does not imply platform signing. Disclose unsigned Windows and unnotarized Mac builds in release notes. Signing credentials are described in `docs/RELEASE_SECURITY.md`.

## Local Windows flow

From repo root:

```powershell
powershell -ExecutionPolicy Bypass -File tools/release/build_firmware_release.ps1 -Version 1.2.1 -Tag apps-v0.3.1 -Channel stable
```

Outputs:

- `dist/firmware-release/beca-<version>-merged.bin`
- `dist/firmware-release/firmware-manifest.json`

Upload both files to the GitHub release for the same tag.

## Manifest-only generation

```bash
python tools/release/generate_firmware_manifest.py \
  --repo fattyrecordingco/BECAfirmware \
  --version 1.2.1 \
  --tag apps-v0.3.1 \
  --channel stable \
  --hardware ESP32-PICO-V3 \
  --asset-name beca-1.2.1-merged.bin \
  --sha256 <64-char sha256> \
  --output dist/firmware-release/firmware-manifest.json
```

## Stage the complete public release

After all desktop installers, the phone build, manuals, firmware and unsigned Apple candidate are ready:

```sh
python tools/release/stage_assets.py --desktop-version 0.3.1 --phone-version 1.7.1 --firmware-version 1.2.1 --tag apps-v0.3.1 --phone-url https://fattyrecordingco.github.io/BECAfirmware/
```

Defaults read `dist/installers`, `dist/firmware-release`, `apps/beca-phone/dist`, `apps/beca-apple`, and `dist/apple/BECA-unsigned.ipa`, and write a fresh `dist/publish`. Use the corresponding path arguments shown by `--help` when artifacts were downloaded elsewhere. The destination must be absent or empty.

Staging requires **all six desktop assets**: Windows EXE/MSI, Apple Silicon/Intel DMGs and Linux AppImage/DEB. It validates versions, phone assets, the firmware manifest URL/checksum, required manuals and the unsigned IPA before packaging separate Windows, Android/web and Apple ZIPs and generating release checksums. `--mac-zip` also groups both Mac DMGs. Android remains a Chrome PWA; its ZIP is not an APK.

The public Apple IPA must contain no embedded binary signature or provisioning profile. Do not publish certificates, private keys, Apple authentication files, user-specific signed IPAs or device credentials. Users sign the development candidate themselves; public App Store/TestFlight distribution is separate. Keep local-device installation artifacts outside the public staging directory. Use the new release’s generated `SHA256SUMS`, not historical platform checksums.

See [platform install guides](../../docs/install/WINDOWS.md) and [release notes](../../docs/releases/apps-v0.3.1.md).
