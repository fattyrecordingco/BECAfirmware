# Linux Installer

Download `BECA_0.2.0_amd64.AppImage` or `BECA_0.2.0_amd64.deb` from the [0.2.0 release](https://github.com/fattyrecordingco/BECAfirmware/releases/tag/setup-v0.2.0). New installers and SHA256SUMS are release assets; binaries in this folder are historical.

Read first:
- [Read Before First Launch](../../docs/user/READ_BEFORE_FIRST_LAUNCH.md)

Linux usually has CH340/CH341 and CP210x kernel drivers already. If the serial port is not accessible, add your user to the serial group used by your distribution, usually `dialout` or `uucp`, then log out and back in.
