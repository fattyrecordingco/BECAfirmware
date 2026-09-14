# Linux Installer

Download BECA 0.2.0 for Linux x64:

- [AppImage](https://github.com/fattyrecordingco/BECAfirmware/releases/download/setup-v0.2.0/BECA_0.2.0_amd64.AppImage)
- [Debian/Ubuntu DEB](https://github.com/fattyrecordingco/BECAfirmware/releases/download/setup-v0.2.0/BECA_0.2.0_amd64.deb)

Both include firmware 1.1.0. [Release notes](https://github.com/fattyrecordingco/BECAfirmware/releases/tag/setup-v0.2.0) · [SHA256SUMS](https://github.com/fattyrecordingco/BECAfirmware/releases/download/setup-v0.2.0/SHA256SUMS). Current installers are release assets; binaries in this folder are historical.

Read first:
- [Read Before First Launch](../../docs/user/READ_BEFORE_FIRST_LAUNCH.md)

Linux usually has CH340/CH341 and CP210x kernel drivers already. If the serial port is not accessible, add your user to the serial group used by your distribution, usually `dialout` or `uucp`, then log out and back in.
