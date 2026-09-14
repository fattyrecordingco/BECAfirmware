# BECA Instrument 0.1.0

BECA now generates sound directly inside Ableton Live and controls connected BECA hardware from the same Max for Live instrument. MIDI clips and keyboards play the native stereo synth; USB can also carry live BECA notes directly into it.

## Download and install

1. Download [BECA-Instrument-0.1.0.zip](https://github.com/fattyrecordingco/BECAfirmware/releases/download/instrument-v0.1.0/BECA-Instrument-0.1.0.zip) and extract it.
2. Copy the entire **BECA Instrument** folder to Ableton User Library → Presets → Instruments → Max Instrument. Keep the support files beside the AMXD.
3. Drag **BECA Instrument.amxd** onto a MIDI track and play a MIDI clip. Open **Connect** for physical BECA controls.

The download is public and requires no GitHub account. No source build, npm packages or third-party Max externals are needed. `SHA256SUMS` on this release checks the ZIP; the ZIP contains checksums for its individual files.

Requires Ableton Live 11/12 with Max for Live and Max 8.6 or newer. Verified in Live 12.4.5 with bundled Max 9 on Windows x64. macOS and Live 11 runtime checks remain outstanding; the portable package contains no platform-specific compiled externals. Ableton Live and Max for Live are not included.

## Included

- Twelve pitched BECA soundscapes plus Raw Sensor Sine, which requires fresh hardware sensor data.
- Native oscillators, envelopes, filters, drive, delay, reverb coloration, stereo output and local percussion.
- Live automation, eight-voice allocation, sustain, pitch bend, panic, XY sound control, mutation and saved A–D timbre variations.
- Plant monitoring and USB/Wi-Fi hardware controls for musical settings, timing, output and LEDs.
- Complete editable Max patch, JavaScript support files, preset data, installation guide and verification notes.

## Verification and limits

All 15 automated tests pass. Actual Live checks cover MIDI clip playback, transport stop, saved-preset restoration, a COM4 USB connection, incoming hardware MIDI, and a hardware brightness change independently read back and restored. Fourteen recorded audio segments pass: all twelve pitched presets, a measured 440 Hz raw sine, and silence without raw sensor input.

Wi-Fi HTTP/SSE is tested against a local protocol server; a physical BECA Wi-Fi session in Live is not yet verified. Wi-Fi note snapshots can merge short/repeated notes. Use a Live MIDI input from BLE or the desktop bridge to record editable MIDI clips; direct device input can be recorded as audio. Do not open the same USB port in the instrument and desktop bridge together.

Host-rate synthesis and local percussion are not sample-identical to hardware AUX. Firmware installation and Wi-Fi provisioning remain in the desktop Setup app. [BECA app 0.2.0 and firmware 1.1.0](https://github.com/fattyrecordingco/BECAfirmware/releases/tag/setup-v0.2.0) remain available separately. Firmware and the stable BLE stack are unchanged by this instrument release and remain pinned to ESP32 Arduino core 2.0.14.
