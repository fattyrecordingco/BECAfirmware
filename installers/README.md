# BECA Installers

Download app **0.3.0**, including firmware **1.2.0**, from the [official release](https://github.com/fattyrecordingco/BECAfirmware/releases/tag/apps-v0.3.0). These links download the current installers directly:

- Windows x64: [setup EXE](https://github.com/fattyrecordingco/BECAfirmware/releases/download/apps-v0.3.0/BECA_0.3.0_x64-setup.exe) · [MSI](https://github.com/fattyrecordingco/BECAfirmware/releases/download/apps-v0.3.0/BECA_0.3.0_x64_en-US.msi)
- macOS: [Apple Silicon DMG](https://github.com/fattyrecordingco/BECAfirmware/releases/download/apps-v0.3.0/BECA_0.3.0_aarch64.dmg) · [Intel DMG](https://github.com/fattyrecordingco/BECAfirmware/releases/download/apps-v0.3.0/BECA_0.3.0_x64.dmg)
- Linux x64: [AppImage](https://github.com/fattyrecordingco/BECAfirmware/releases/download/apps-v0.3.0/BECA_0.3.0_amd64.AppImage) · [DEB](https://github.com/fattyrecordingco/BECAfirmware/releases/download/apps-v0.3.0/BECA_0.3.0_amd64.deb)

Separate assets: [firmware 1.2.0](https://github.com/fattyrecordingco/BECAfirmware/releases/download/apps-v0.3.0/beca-1.2.0-merged.bin) · [firmware manifest](https://github.com/fattyrecordingco/BECAfirmware/releases/download/apps-v0.3.0/firmware-manifest.json) · [SHA256SUMS](https://github.com/fattyrecordingco/BECAfirmware/releases/download/apps-v0.3.0/SHA256SUMS).

Older binaries in the platform folders are historical. Current installers are hosted in Releases; the release workflow does not commit binaries to this folder.

Before first launch, read:
- [docs/user/READ_BEFORE_FIRST_LAUNCH.md](../docs/user/READ_BEFORE_FIRST_LAUNCH.md)

The Windows installer is unsigned and Mac builds are not notarized; read the release notes and verify the checksum before installation.

For first installation, open Setup and choose **Included 1.2.0 · works offline**. No separate firmware download is required.

Separate phone/Apple downloads: [Android/web folder ZIP](https://github.com/fattyrecordingco/BECAfirmware/releases/download/apps-v0.3.0/BECA-Android-Web-1.7.0.zip) · [Apple development folder ZIP](https://github.com/fattyrecordingco/BECAfirmware/releases/download/apps-v0.3.0/BECA-Apple-1.7.0.zip). See [Android/web installation](../docs/install/ANDROID.md) and [Apple installation](../docs/install/APPLE.md). Android is a Chrome PWA; the Apple IPA needs each user’s own development signature.
