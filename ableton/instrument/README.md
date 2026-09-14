# BECA Instrument 0.1.0

A native Max for Live instrument with stereo audio, BECA soundscapes, Live automation, and USB/Wi-Fi control of physical BECA hardware. Requires Live 11/12 with Max for Live and Max 8.6 or newer. Tested in Live 12.4.5 on Windows; macOS and Live 11 runtime checks remain outstanding. No npm installation or third-party Max externals are needed.

## Install and play

Download **[BECA-Instrument-0.1.0.zip](https://github.com/fattyrecordingco/BECAfirmware/releases/download/instrument-v0.1.0/BECA-Instrument-0.1.0.zip)** from the [public GitHub release](https://github.com/fattyrecordingco/BECAfirmware/releases/tag/instrument-v0.1.0) and extract it first. No GitHub account, source build or npm installation is needed. The release also includes a SHA256 checksum for the ZIP.

Keep this entire folder together. Copy it to Ableton User Library → Presets → Instruments → Max Instrument. Drag **BECA Instrument.amxd** onto a MIDI track, then play a MIDI clip or keyboard. Choose a soundscape and start with Volume low. The device generates audio inside Live; no Aux cable or running desktop app is needed for ordinary MIDI playback.

The twelve pitched soundscapes use preset values extracted from firmware 1.1.0. Native Gen processing ports BECA's dual oscillators, linear ADSR, three filter types, drive, quantized delay, reverb coloration and output stages. Host sample rates and hardware DACs differ, so this is not a claim of sample-identical Aux audio. Channel 10 has a compact local percussion engine; its percussion timbres differ from the hardware kits.

**Raw Sensor Sine** uses fresh ADC1 values as Hz and bypasses the pitched synth/effects. It needs a connected BECA; stale readings become silent after 1.5 seconds. MIDI notes do not drive that preset.

## Hardware controls

Open **Connect**. For USB, enter the BECA serial port (Refresh ports lists available ports in the status panel) and select Connect USB. Close the desktop app bridge and other serial monitors first. Native Max serial uses 115200 baud and sends BECA's host heartbeat. For Wi-Fi, enter the BECA hostname/IP (optional `:port`) and select Connect Wi-Fi.

Choose **BECA device** as Note source to play directly from that connection. Set the hardware's Device output to **USB MIDI** or **USB + Aux** for direct USB notes. Use **Live MIDI** when a MIDI clip, keyboard, BLE port or the desktop app's bridge feeds the Live track. Only the chosen source can produce notes, preventing double triggering. USB carries individual MIDI events; Wi-Fi uses firmware's note snapshots over SSE and may merge repeated/very short notes. Record the instrument's audio on another Live track; to record editable MIDI clips, use a Live MIDI input from BLE or the desktop bridge. Close this instrument's USB connection before opening the bridge on the same port.

Plant/harmony, Timing, Output, and Lights/link pages control the physical BECA. These controls do not alter notes already recorded in a Live MIDI clip. **Follow Live BPM** sends Live's tempo changes to BECA; it does not provide sample-accurate clock or start/stop synchronization. **External clock** enables the firmware's existing MIDI-clock receiver and requires a separate supported clock input to the hardware, such as BLE MIDI; the current firmware's USB control protocol does not accept MIDI clock bytes. Leave External clock off for direct USB operation.

Ordinary instrument controls update Live's audio immediately. **Send sound edits → Local + hardware** also sends new sound edits to the unit; it does not push saved Set values automatically when connecting. **Read sound** explicitly copies the device's current synth settings into the instrument. Firmware flashing and Wi-Fi credential provisioning remain in the desktop Setup app; Live handles track routing and MIDI splits with its tracks/racks.

## Play and automate

- All sound and hardware parameters have stable Live names and automation storage. Use Live's automation lanes and MIDI/Push mapping.
- Drag the sound pad for cutoff/resonance; Mutate explores timbre without changing volume, pitch routing or tempo. Undo restores the preceding gesture.
- Save A–D stores timbre variations with the Live Set. Recall preserves volume. Raw sine is separate from timbre variations.
- Panic releases voices, sustain and effects. MIDI sustain, pitch bend (±2 semitones), velocity-zero note-offs and channel all-notes-off are supported. Voice count is bounded to eight.

Hardware writes coalesce by parameter, with one acknowledged write in flight and a 20/s ceiling. LIVE snapshots run at 500 ms; synth snapshots at 2 s. Display updates use state differences and bounded history. Timeouts disconnect and clear unsent edits; reconnect explicitly, with no stale-write replay. Multiple device instances must not open the same USB port.

## Build and verification

From the repository root: `py -3 ableton/instrument/build_instrument.py --install`. The builder generates the editable patch, an instrument-type AMPF device, SHA256SUMS and `dist/ableton/BECA-Instrument-0.1.0.zip`, and installs the complete folder into the local User Library.

Run `node --test ableton/instrument/tests/*.test.cjs` for MIDI lifecycle, state storage, write coalescing, USB timeout and HTTP/SSE regressions. `py -3 ableton/instrument/tests/build_audio_check.py` creates a local QA device that records all twelve pitched presets, raw sine and silence from the real Gen engine when loaded in Live. QA files are separate from the distributable package.

After the QA recording finishes, run `py -3 ableton/instrument/tests/check_audio.py`. The recorded Windows/Live 12.4.5 run passed all fourteen audio segments at 44.1 kHz: twelve audible pitched presets without clipping, a 440 Hz raw sine, and silent raw output without sensor input. COM4 testing confirmed live plant readings, direct hardware MIDI producing local audio, and an independently read-back brightness change; the original hardware brightness was restored. See [verification notes](VERIFICATION.md).

If USB connects but readings stop, reconnect with the latest device build; port polling must restart after Max closes/reopens the port. Refresh ports after plugging in a unit. The device applies this automatically on connection, following the [Max serial reference](https://docs.cycling74.com/reference/serial/).

Firmware remains pinned to ESP32 Arduino core 2.0.14 with the existing BLE libraries. This instrument does not modify the firmware or the existing BECA Control device.
