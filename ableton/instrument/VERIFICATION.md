# BECA Instrument 0.1.0 verification

Verified on 14 September 2026 in Ableton Live 12.4.5 Suite with bundled Max 9 on Windows x64. Firmware remains 1.1.0, built against ESP32 Arduino core 2.0.14; this change does not alter firmware or BLE libraries.

- Native instrument loads in a MIDI track and compiles its embedded Gen engine. The complete control panel fits a 1428-pixel Live window.
- A four-note MIDI file imported into a Live Session clip plays through the instrument's normal MIDI input and produces stereo audio. Live transport Stop releases all voices and returns the meters to silence.
- Saved a timbre in variation A, mutated the current controls, saved an `.adv` preset, unloaded the device, and reloaded that preset. The mutated controls restored correctly; Recall A restored the original blend/detune without changing volume. The preset's stored blob independently decoded to the complete variation and connection address. Loading did not connect to hardware.
- Actual stereo Gen audio recorded at 44.1 kHz for all twelve pitched presets: nonzero RMS, peaks below clipping. Recorded at master 0.18; peak levels ranged from 0.00613 to 0.03516.
- Raw Sensor Sine with ADC test input 440 measured 440.00 Hz. The following recording without sensor input was digital silence. These are synthetic QA inputs, separate from the real hardware checks below.
- Physical BECA on CH340 COM4: 40 live plant samples within energy 0–1 and ADC 0–4095; maximum measured serial response 14 ms in the read-only check.
- Native USB connection in Live: live plant graph, hardware parameter readback, and incoming channel-10 notes generating local percussion/audio.
- Live brightness edit independently read back as 114 from the hardware. Original value 71 restored and verified.
- MIDI lifecycle, eight-voice bounds, sustain, source selection, stored variations, timeout cleanup, USB polling on reconnect, serialized HTTP requests, SSE note parsing and repeat sound reads covered by `node --test ableton/instrument/tests/*.test.cjs`.

Audio recordings and machine-readable results live under `.beca-cache/instrument-audio/` and are intentionally excluded from the distributable. Reproduce them with `tests/build_audio_check.py`, load the generated QA instrument in Live, then run `tests/check_audio.py`.

Limits: macOS and Live 11 runtime checks are outstanding. Wi-Fi HTTP/SSE is exercised against a local protocol server; an actual BECA Wi-Fi session has not been tested in Live. Host-rate synthesis and local percussion are not sample-identical to hardware AUX. Direct device input plays audio; editable MIDI recording uses a Live MIDI input from BLE or the desktop bridge.
