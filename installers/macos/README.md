# macOS Installer

Download BECA 0.2.0 for your Mac:

- [Apple Silicon (M-series) DMG](https://github.com/fattyrecordingco/BECAfirmware/releases/download/setup-v0.2.0/BECA_0.2.0_aarch64.dmg)
- [Intel DMG](https://github.com/fattyrecordingco/BECAfirmware/releases/download/setup-v0.2.0/BECA_0.2.0_x64.dmg)

Both include firmware 1.1.0. [Release notes](https://github.com/fattyrecordingco/BECAfirmware/releases/tag/setup-v0.2.0) · [SHA256SUMS](https://github.com/fattyrecordingco/BECAfirmware/releases/download/setup-v0.2.0/SHA256SUMS). Current installers are release assets; binaries in this folder are historical.

For normal public distribution, the DMG should be signed and notarized with an Apple Developer ID. Current open-source beta builds may be unsigned if the repository does not have Apple signing secrets configured.

Read first:
- [Read Before First Launch](../../docs/user/READ_BEFORE_FIRST_LAUNCH.md)

If a driver package is required for your board, use only the signed vendor package or the official vendor download link in the manual.


## Local-network access and direct Apple MIDI

New source builds include a Local Network usage description and Bonjour service declarations in the Mac app bundle. Allow BECA under System Settings → Privacy & Security → Local Network when prompted. An existing downloaded 0.2.0 DMG is not updated by this source change.

For Bluetooth MIDI, open Audio MIDI Setup → Window → Show MIDI Studio → Bluetooth and connect **BECA BLE-MIDI**, then select its input in your music app. For Wi-Fi MIDI, enable a Network MIDI session on the same router and connect BECA (control UDP 5004, data UDP 5005); the setup access point alone does not start RTP-MIDI. Safari can control BECA directly at its local HTTP IP but cannot use its USB serial adapter. The separate [Apple instrument app](../../apps/beca-apple/README.md) is native source awaiting compilation, signing and physical Apple validation; it does not replace this desktop flashing/setup installer.
