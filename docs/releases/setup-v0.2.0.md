BECA 0.2.0 brings a dedicated Performance view, editable MIDI splits in Setup, and included firmware 1.1.0 for first installation on a blank device.

- Play new soundscapes and Raw Sensor Sine, use the XY sound pad, explore mutations and recall sound variations.
- Keep MIDI routing in Setup: up to eight splits, channel/range/transpose editing, release notes, and saved automatic reconnection. MIDI and live controls share one USB connection.
- Use Serial MIDI + Aux together. MIDI percussion has its own channel 10 section. Device LED effects now animate while idle.
- Install the included firmware without a separate compiler or firmware download. Complete boot code is included; checksums are verified and existing settings are preserved.
- Read the complete manual inside Setup, or download the HTML/Markdown manual below. It includes blank-unit installation, BOOT/RESET recovery, Aux recording and Ableton/DAW quick starts.

## Downloads

- Windows x64: [setup EXE](https://github.com/fattyrecordingco/BECAfirmware/releases/download/setup-v0.2.0/BECA_0.2.0_x64-setup.exe) · [MSI for managed installs](https://github.com/fattyrecordingco/BECAfirmware/releases/download/setup-v0.2.0/BECA_0.2.0_x64_en-US.msi)
- macOS: [Apple Silicon DMG](https://github.com/fattyrecordingco/BECAfirmware/releases/download/setup-v0.2.0/BECA_0.2.0_aarch64.dmg) · [Intel DMG](https://github.com/fattyrecordingco/BECAfirmware/releases/download/setup-v0.2.0/BECA_0.2.0_x64.dmg)
- Linux x64: [AppImage](https://github.com/fattyrecordingco/BECAfirmware/releases/download/setup-v0.2.0/BECA_0.2.0_amd64.AppImage) · [DEB](https://github.com/fattyrecordingco/BECAfirmware/releases/download/setup-v0.2.0/BECA_0.2.0_amd64.deb)
- Firmware 1.1.0: [merged image](https://github.com/fattyrecordingco/BECAfirmware/releases/download/setup-v0.2.0/beca-1.1.0-merged.bin) · [manifest](https://github.com/fattyrecordingco/BECAfirmware/releases/download/setup-v0.2.0/firmware-manifest.json)
- [SHA256SUMS](https://github.com/fattyrecordingco/BECAfirmware/releases/download/setup-v0.2.0/SHA256SUMS) · [manual HTML](https://github.com/fattyrecordingco/BECAfirmware/releases/download/setup-v0.2.0/BECA_MANUAL.html) · [manual Markdown](https://github.com/fattyrecordingco/BECAfirmware/releases/download/setup-v0.2.0/BECA_MANUAL.md)

Every installer includes firmware 1.1.0. In Setup, select **Included 1.1.0 · works offline** for first installation.

**Release status:** published as the current public release on 14 September 2026, using the verified 11 September builds. All 11 public downloads were rechecked against their SHA256 digests. The Windows installer is unsigned; Mac builds use an ad-hoc signature and are not Apple-notarized. Publishing a GitHub release does not add platform signing trust. Do not disable OS security protections. SHA256SUMS verifies the downloaded files' integrity.

**DAW connection:** Mac/Linux can create a native BECA virtual MIDI source. Windows needs a virtual MIDI cable configured once (for example a loopMIDI port named BECA). The current CH340/CP210x board is USB serial, not class-compliant USB MIDI. Third-party MIDI/USB drivers are not bundled. WebView2's bootstrapper can require internet on a fresh Windows installation.

Validation includes firmware compilation on ESP32 core 2.0.14, audio/MIDI/flasher regressions, responsive UI checks and local Windows hardware verification. Mac/Linux runtime behavior and individual DAWs still need platform testing. This release does not include a Max for Live instrument or enterprise Wi-Fi setup.
