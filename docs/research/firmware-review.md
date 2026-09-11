# BECA firmware and plant-instrument research

Reviewed 11 September 2026. Baseline: commit `ab55b79e0f521646b99c1f3d7801b520c668835e`. File and line references below describe that baseline, before the accompanying implementation work. Findings marked for follow-up are recommendations, not claims that they have been fixed. This review inspected source and installed toolchain metadata; it did not flash hardware or measure physical latency, radio reliability, sensor accuracy, or sound quality.

BECA already has a useful foundation: separate sensor features and musical events, bounded energy, hysteretic plant triggering, fixed-size audio structures, an audio task, nonblocking serial writes, SSE backpressure handling, and delayed settings persistence. Keep the BLE transport and Arduino core pinned. The most valuable changes are predictable live controls, a direct ADC-to-frequency path, a few targeted audio fixes, and instrument presets with distinct playing behavior.

## Build baseline and implementation boundaries

Implementation note: the accompanying changes fix findings 1–3 (gain, voice retirement/allocation, held envelopes) and move drum-kit updates to the audio task. They add six textures, raw ADC sine, Performance controls and local diagnostics. Subsequent regression fixes also preserve paired swing tempo, finish drum-envelope decay and reject nonfinite DSP values. Queue saturation and SSE snapshot ownership remain follow-up work. Regression checks reduce recurrence rather than guarantee zero failures.

`platformio.ini:5` pins `espressif32@6.5.0`; line 20 pins `framework-arduinoespressif32@3.20014.231204`. The installed framework's `package.json` matches that package, and `cores/esp32/esp_arduino_version.h` reports **2.0.14**. PlatformIO's own release notes confirm support for Arduino 2.0.14. This confirms the intended toolchain is installed; the accompanying firmware build is still the actual compatibility check. [PlatformIO 6.5.0 release](https://github.com/platformio/platform-espressif32/releases/tag/v6.5.0)

The declared libraries are BLE-MIDI 2.2, MIDI Library 5.0.2, NimBLE-Arduino 1.4.3, and FastLED 3.10.3 (`platformio.ini:21`). Cached library folders include older/additional entries, so retain the resolved dependency list from the build log as release evidence. The advertised BLE identity is `BECA BLE-MIDI` (`BECAfinalsv02.ino:29`). No BLE stack replacement is needed for the proposed features.

`src/BECAfinalsv02_pio.cpp` includes the root sketch, and the other `src/*.cpp` files similarly include the root DSP files. These are build wrappers, not separate engine implementations. Keep Arduino IDE and PlatformIO using the same source.

Baseline source sizes, excluding dependencies and build products:

| File | Lines | Bytes |
| --- | ---: | ---: |
| `BECAfinalsv02.ino` | 5,606 | 183,948 |
| `synth_engine.cpp` | 762 | 21,774 |
| `synth_engine.h` | 176 | 3,959 |
| `dsp_blocks.cpp` | 196 | 4,777 |
| `drum_engine.cpp` | 203 | 5,893 |
| `index.html` | 2,273 | 90,286 |
| `index_html.h` | 2,279 | 101,594 |

## Prioritized findings

### 1. Repeated live edits progressively lower the volume — fix now

`synth_engine.cpp:243` multiplies stored master volume by 0.92 whenever drive exceeds 0.8. Each later `getParams` / modify / `setParams` cycle applies the attenuation again, including unrelated filter changes. Starting at 0.6, twenty such writes leave about 0.113. A performer can therefore turn the filter and hear the instrument fade unintentionally.

Make sanitization idempotent. Keep user volume unchanged and apply any drive compensation only in rendering. Regression: repeat 100 unrelated parameter changes with drive at 0.9; returned master and steady-state output gain must remain stable.

### 2. Lowering polyphony freezes excluded voices — fix now

`synth_engine.cpp:629` calls `noteOff()` on voices beyond the new limit and skips them. Their envelopes only advance inside the rendered active list (`synth_engine.cpp:649`), so they never finish release. Raising the limit can resurrect old notes and voice allocation sees occupied slots.

Either explicitly retire excluded voices, with a short de-click transition if needed, or continue processing their release silently until inactive. The allocator should respect the configured voice limit, rather than filling all eight slots while the renderer suppresses some. Regression: play eight sustained notes, reduce to one, wait beyond release, then raise to eight; no old notes may return.

### 3. ADSR controls do not update held notes — fix now

Envelope parameters are copied into a voice only on note-on (`synth_engine.cpp:559`). Filter and oscillator controls read the latest block snapshot, but changing sustain/release on a sounding pad does not update its stored ADSR.

Apply changed envelope parameters on the audio task without restarting the envelope or oscillator phase. Define live release behavior explicitly; the present linear release uses a full-scale decrement (`dsp_blocks.cpp:47`), so a release starting at level 0.5 lasts approximately half the displayed duration. Regression: hold a note, change sustain, then change release before note-off; verify the ongoing voice responds and does not retrigger.

### 4. Swing changes average tempo — follow-up timing fix

`BECAfinalsv02.ino:5438` adds a positive swing offset to alternating steps but never subtracts it from their partners. Ignoring millisecond rounding, average tempo becomes `configured BPM / (1 + swingPct / 200)`. At 120 BPM and 60% swing, this is approximately 92.3 BPM.

Use paired long/short durations whose sum is exactly two base steps. Preserve the existing control's intended feel after deciding what its percentage denotes. Verify timestamp sums over many pairs and verify DAW sync separately; this observation concerns the internal scheduler.

### 5. Note-off can be discarded under load — follow-up reliability fix

The 16-entry MIDI note-off queue silently declines new schedules when full (`BECAfinalsv02.ino:549`). The note-on has already been sent at `BECAfinalsv02.ino:963`. `serialTryWrite()` can also discard any full frame when TX space is low (`BECAfinalsv02.ino:178`), including note-off. The audio event ring returns failure when full, but callers ignore it (`synth_engine.cpp:423`, `synth_engine.cpp:470`). Its nominal 64 slots hold 63 events.

Reserve a note-off slot before emitting a note-on, or retire an older scheduled note explicitly. Give note-off and panic priority over telemetry, count discarded messages, and coalesce replaceable sensor telemetry. Avoid solving overload by blocking the main loop. Regression: saturate each queue and serial backpressure; every emitted note must eventually receive a corresponding off or explicit panic. Include same-pitch retriggers and reconnects.

### 6. SSE's saved state can suppress unsent changes — follow-up state fix

`renderStateJson()` calls `captureState()` even for ordinary GET responses (`BECAfinalsv02.ino:2864`). That updates the same `LS` snapshot used by `stateChanged()`. An `/api/live` or `/api/state` read can therefore consume a change before SSE sends it. The snapshot also advances before knowing whether `sseSend()` succeeded; a skipped frame under backpressure need not be retried.

Separate current-state serialization from the last successfully transmitted SSE snapshot. Have the send helper return success and only advance that snapshot after the complete frame is accepted. Include a version or revision in response reconciliation. Regression: change a control, issue a GET before the next SSE interval, and verify the SSE subscriber still receives the change; repeat with a deliberately blocked SSE socket.

### 7. Continuous edits bypass the nominal SSE rate limit — constrain live traffic

The normal loop limits state checks to 125 ms and scope/note/drum checks to about 24 Hz (`BECAfinalsv02.ino:5093`). However `/api/set` forces an immediate complete state push for each individual parameter (`BECAfinalsv02.ino:3680`, `BECAfinalsv02.ino:3876`), and many legacy setters force their own pushes. Several simultaneous sliders can flood a synchronous HTTP server.

For the performance page, coalesce the latest value per key, keep at most one request in flight per transport, skip unchanged values, and flush the final value on pointer release. `/api/synth` already accepts several synth values in one form (`BECAfinalsv02.ino:3263`); generic `/api/set` currently accepts one key/value only. A future validated multi-parameter endpoint can commit a whole scene in one revision. Local audible controls can respond on every input event while device/network delivery remains bounded. Do not promise atomic device changes from a sequence of single-key requests.

Two SSE keepalive branches share the same timer: a 15-second branch and a later 2-second branch (`BECAfinalsv02.ino:5501`, `BECAfinalsv02.ino:5573`). Consolidate these to one declared interval. Retain backpressure detection, the existing single-client policy, reconnect handling, and `delay(0)` servicing.

### 8. The firmware drum envelope does not finish — fix before enabling AUX drums

`drum_engine.cpp:166` attacks whenever the envelope is below its target; otherwise it decays. One decay step makes it below target again, so it attacks again indefinitely. The voice does not reach its silence threshold.

Use explicit attack/decay/off state, or mark the target as reached once and then decay monotonically. A single hit must become inactive without another event. AUX drums are currently guarded off (`BECAfinalsv02.ino:517`), so keep that guard while correcting and validating the drum renderer. This issue is in the embedded engine; the desktop app controls that engine rather than rendering its own audio.

### 9. Parameter edge cases need bounded behavior — follow-up hardening

`dsp::clampf()` passes NaN through unchanged (`dsp_blocks.cpp:6`). Check finite values before committing HTTP/serial parameters and define a safe default on invalid values. Filter cutoff is always clamped to 18 kHz (`dsp_blocks.cpp:112`), although the synth allows sample rates as low as 22,050 Hz (`synth_engine.cpp:249`). Constrain cutoff below the actual Nyquist frequency. The current 44.1 kHz production path avoids that particular mismatch.

`SynthEngine::setParams()` modifies `drum_.kit_` and `filterDirty_` outside the protected parameter snapshot (`synth_engine.cpp:362`). Keep audio-owned state updates on the audio task. Existing locked parameter snapshots are a good pattern to preserve. Treat these as small ownership fixes, not a reason to replace the scheduler or BLE stack.

## What “sensor number becomes sine frequency” should mean

BECA reads two ADC voltages with `analogRead`, not pulse durations or edge counts (`BECAfinalsv02.ino:2291`). It stores their unprocessed 12-bit values as `gPlantRaw1` and `gPlantRaw2`. The exact mode requested is therefore:

`frequencyHz = raw ADC1 count`, for example `440 -> 440 Hz` and `2048 -> 2048 Hz`.

Label this **Raw sensor sine / ADC -> Hz**. It is an intentional sonification mapping. A scalar ADC code is not a measured physical pulse frequency, nor a recording of acoustic sound emitted by the plant. Reproducing the electrical waveform itself would be a different feature requiring the analogue circuit specification, suitable sampling and analogue filtering. A fast pulse-source circuit, if present upstream, needs edge counting or timing rather than an assumed voltage-to-frequency interpretation.

Implementation acceptance criteria:

- Use the actual `raw` field or `gPlantRaw1`; never derive it from normalized energy, note number, sensitivity, root, scale, or octave range.
- Maintain one continuous sine oscillator and preserve phase when updating frequency. Apply the newest valid sample at the next available audio block, without note gating, pitch quantization, portamento, or a frequency ramp in exact mode.
- Bypass waveshaping, detune, filter coloration, delay and reverb. The baseline engine applies `fastTanh` even at drive zero and again on final output (`synth_engine.cpp:673`, `synth_engine.cpp:714`), so selecting the sine waveform alone is insufficient.
- Retain a linear level control with headroom. At raw zero, produce silence with a short gain transition; a paused phase accumulator must not leave a DC output. Make mute, mode switching and stale/disconnected input stop the tone predictably.
- Display the chosen source and actual commanded Hz together. Permit ADC2 as a separate source later; do not silently average the two inputs.
- Verify constant values 0, 1, 20, 440, 1,000 and 4,095, plus rapid jumps. Frequency changes create a time-varying signal, so sidebands during a jump are expected even when the oscillator is sinusoidal at each instantaneous frequency.

Raw data currently reaches `/api/plant`, `/api/live`, and opt-in serial JSON (`BECAfinalsv02.ino:3691`, `BECAfinalsv02.ino:3765`, `BECAfinalsv02.ino:5384`). The baseline SSE `scope` event contains **only normalized energy** (`BECAfinalsv02.ino:5519`). A browser listening only to that event cannot implement exact raw-frequency tracking.

| Stage | Baseline cadence or capacity | Meaning for a performer |
| --- | --- | --- |
| ADC capture | Intended 8 ms / 125 Hz | Changes can be seen on the next sample, subject to main-loop delays. |
| Energy smoothing | EMA alpha 0.03 at nominal 125 Hz | Approximately 263 ms EMA time constant, before the rest of the feature pipeline. Raw mode should bypass it. |
| Baseline / noise adaptation | Alpha 0.0012 / 0.0007 | Approximately 6.66 s / 11.42 s time constants at nominal cadence. |
| Serial raw JSON | 50 ms / 20 Hz | Adds up to one publication interval before host transport/audio latency. |
| SSE scope | `1000/24 = 41` ms nominal | Visual energy stream; baseline payload does not contain raw. |
| Embedded audio block | 128 frames at 44.1 kHz | Approximately 2.90 ms of audio per render. |
| I2S DMA allocation | Six blocks | Approximately 17.41 ms total allocated audio capacity, not a measured end-to-end latency. |

Audio block size comes from `BECAfinalsv02.ino:418`, overriding the class's 64-frame default. DMA count is configured at `synth_engine.cpp:259`. Sensor samples happen after HTTP handling in the main loop (`BECAfinalsv02.ino:5365`), and warmup temporarily samples additionally on each loop (`BECAfinalsv02.ino:2382`). Measure actual sample intervals and missed deadlines before claiming a fixed 125 Hz capture rate. Time-dependent coefficients would keep musical response consistent if the cadence varies.

## Primary-source plant-device research

### MIDI Sprout and the Biodata Sonification breadboard kit

MIDI Sprout's original repository publishes its code/designs with an MIT license. The related breadboard sketch measures intervals between edges from a 555-based conductance circuit, analyzes nine intervals from a ten-entry window, compares range with standard deviation times a threshold, then maps changes to scaled notes and a controller. This is a useful comparison because it separates event detection from musical mapping; its pulse-width input differs from BECA's ADC input. Do not copy its AVR interrupt handling or blocking menu structure into ESP32 firmware. [MIDI Sprout repository](https://github.com/electricityforprogress/MIDIsprout), [original breadboard sketch](https://raw.githubusercontent.com/electricityforprogress/BiodataSonificationBreadboardKit/master/BiodataSonification_026_kit.ino)

For BECA, add optional windowed variance and signed slope alongside the existing energy feature, then let performers assign them to density, timbre and pitch motion. Keep the stable default EMA/AGC mapping available and compare both using recorded sensor sessions.

### Playtronica Biotron

Biotron publishes RP2040 firmware and a documented MIDI control surface. Its raw sensor code counts rising edges with a PWM peripheral and converts counts on a repeating timer; it also adds configurable random variation to the value named `realFreq`. Its controls describe smoothing, scale, note range, note repetition, velocity, timing and SysEx/CC configuration. The useful BECA lesson is a documented bidirectional parameter protocol and an explicit distinction between raw measurements and creative randomness. The repository identifies GPL-3.0 licensing; inspect licensing before any code reuse. [Biotron repository](https://github.com/Playtronica/biotron-firmware), [raw acquisition code](https://raw.githubusercontent.com/Playtronica/biotron-firmware/master/src/raw_plant.c), [control protocol](https://raw.githubusercontent.com/Playtronica/biotron-firmware/master/SettingsDescription.md)

### Independent Pocket SCION Synth firmware

This community project describes a four-voice RP2040 synth, 128 patches and three sensor-controlled Euclidean lanes. Its architecture keeps raw pulse playback separate from musical synthesis, uses sensor statistics to shape expression, and uses ties for repeated pitches to avoid restarting attacks continually. This provides useful design ideas, but its reported performance is not a benchmark for BECA's ESP32. [Project README](https://raw.githubusercontent.com/toonhuysmans/pocket-scion-synth/main/README.md), [architecture](https://raw.githubusercontent.com/toonhuysmans/pocket-scion-synth/main/docs/architecture.md)

Its banks change both sound design and musical behavior, including density, gate length and modulation depth. BECA can follow that design principle with its own presets: sparse bell gardens, slow choral washes, short wooden plucks, soft organ tones, resonant droplets and playful bubble leads. A later scene layer should combine a timbre preset with bounded sensor mappings and rhythm settings, while allowing the performer to lock tempo or key. [Bank and scene design](https://raw.githubusercontent.com/toonhuysmans/pocket-scion-synth/main/docs/banks-and-parameters.md)

The project declares its own code MIT and its pinned PRA32-U DSP dependency CC0. That is a possible research branch if BECA eventually needs a substantially larger embedded synthesis engine; replacing the existing stable DSP is not necessary for the present additions. [Dependency provenance](https://raw.githubusercontent.com/toonhuysmans/pocket-scion-synth/main/THIRD_PARTY_NOTICES.md)

### Sensor quality and calibration

ESP-IDF's matching-generation documentation identifies GPIO32–39 as ADC1 pins and notes that ADC2 is shared with Wi-Fi. BECA's GPIO34/35 assignment therefore avoids that ADC2 conflict. Espressif also documents ADC noise sensitivity and per-chip reference variation, with multisampling and calibration as possible mitigations. [ESP-IDF 4.4.6 ADC documentation](https://docs.espressif.com/projects/esp-idf/en/v4.4.6/esp32/api-reference/peripherals/adc.html)

For BECA, record raw readings under quiet, touch, unplugged, USB-powered, battery-powered, Wi-Fi-active and BLE-active conditions. Measure rail saturation, idle variation, sample interval jitter, false triggers and recovery after reconnect. Use the results to choose optional filtering. Keep literal raw counts available even if a calibrated-millivolt display or cleaner musical feature is added. Hardware filtering and shielding should be chosen against the actual front-end circuit; software cannot distinguish every wiring artefact from plant-related change.

## Sound quality and CPU opportunities

1. **Append presets without changing existing IDs.** The baseline six presets (`synth_engine.cpp:10`) use the same two-oscillator engine. New sine/triangle plucks, softer organs, airy pads and resonant short leads are low-dependency additions. Keep preset-specific level matching and voice limits. Expose more demanding effects first in the app engine where memory and CPU budgets are larger.
2. **Improve anti-aliasing before adding brighter oscillator shapes.** The embedded saw and square have abrupt discontinuities (`synth_engine.cpp:537`). A small polyBLEP implementation or a band-limited table is a suitable isolated experiment. Compare spectra and execution time at high notes and maximum polyphony; retain the original path until the new one fits the audio budget.
3. **Replace expensive repeated work after profiling.** At eight voices and two sine oscillators, the current worst-case path can call `sinf` about 705,600 times per second. Note and detune conversions run again every block (`synth_engine.cpp:634`), and polyphony normalization calls `sqrtf` in the sample loop (`synth_engine.cpp:670`). Cache pitch increments when note/detune changes, use a nine-entry gain table, and benchmark an interpolated sine table. These are opportunities, not measured bottlenecks.
4. **Treat ambience honestly.** The delay is 35,280 signed 8-bit samples, about 35 KB and 800 ms at 44.1 kHz (`synth_engine.h:157`). Its quantization can become audible in quiet tails. Doubling it to 16-bit costs another approximately 35 KB. The named reverb is a pair of one-pole memories (`synth_engine.cpp:700`), not a diffuse room tail. A small comb/all-pass network could improve space, but needs a memory and CPU comparison under Wi-Fi/BLE load.
5. **Smooth timbre controls without changing exact pitch behavior.** Slew master/cutoff/drive over short audio-rate transitions, and crossfade delay taps or presets where needed. A direct sine frequency should remain immediate by definition; optional musical glide belongs in a separate control or mode.
6. **Instrument deadlines.** Add maximum/percentile render time, loop gap, serial drop count, event queue high-water mark and free-heap low-water mark. `consumeUnderruns()` currently counts failed/short `i2s_write` calls (`synth_engine.cpp:750`), which is not a complete measurement of audible DMA starvation. Diagnose before changing task priority or watchdog behavior.

## Performance control and Ableton protocol implications

The performance page should expose transport, input sensitivity, musical mapping, output level, tone, envelopes, effects and preset selection together. Preserve active drag ownership so arriving device state does not pull a control away from the performer's hand. Show pending/error state and reconcile with the newest acknowledged revision. A scene recall should be explicitly immediate or beat-quantized, with parameter locks for tempo, root and master volume.

MIDI notes alone cannot reconstruct the original ADC number after BECA's nonlinear normalization, scale quantization and octave mapping. A native Ableton instrument can receive existing BECA notes immediately, but exact ADC-to-Hz operation needs an additional raw-data protocol. An opt-in, documented 14-bit CC pair can carry all 12 bits; specify source channel, ordering, stale-data timeout and how the receiver reconstructs a complete value. A versioned SysEx format is another option, but requires corresponding bridge support.

The current Rust bridge parses only `@M` lines into fixed three-byte packets (`tools/bridge/src/parser.rs:10`) and forwards those bytes (`tools/bridge/src/main.rs:195`). It ignores raw JSON. Its MicroFreak compatibility mode intentionally discards most channel controllers (`tools/bridge/src/transform.rs:13`), so a future expressive BECA instrument must use generic mode or a separately designed profile. Extending MIDI output should be opt-in and tested with existing BLE hosts before becoming a default. See the companion Ableton research for device packaging, Live/Max requirements and USB hardware constraints.

## Verification plan for the implementation and next pass

The following are acceptance tests to run, not results claimed by this review:

- Compile the complete sketch with ESP32 Arduino 2.0.14 and the resolved pinned dependencies. Run `python3 make_index_header.py` after any `index.html` edit, then rebuild so the flashed UI matches the source.
- Add focused host regression tests for sanitization idempotence, polyphony reduction, held-envelope updates, paired swing timing, queue saturation and finite parameter handling. A small Arduino/FreeRTOS/I2S shim can capture rendered PCM from the actual C++ engine; a Python model alone would not validate production DSP. No `g++` or `clang++` was found on PATH during this inspection, so use an available host compiler or install/configure the harness deliberately.
- Test every new preset with low and high notes, velocity extremes, eight-voice chords where allowed, repeated notes, long release, rapid preset changes, mute and output switching. Inspect output peak level and tails; listen on the actual DAC and app paths.
- Verify raw sine commands using known ADC fixtures or a controlled test source, then inspect captured audio for pitch, DC offset, clipping and zero-input silence. Measure ADC timestamp to audible output separately from UI refresh time.
- Move several controls continuously while sensor events, BLE MIDI, SSE/polling and LEDs are active. Check final values, acknowledgement ordering, packet rate, note-off integrity and missed audio deadlines. Confirm settings persistence remains debounced rather than writing flash per slider event.
- Confirm BLE advertisement name, connection, disconnect/reconnect and note-off behavior on the user's actual hosts. Test UI reconnect after SSE lifetime expiry and with a second client opening; single-client behavior should remain predictable.
- Run a sustained hardware session with AUX output plus Wi-Fi/BLE activity and monitor heap, audio deadlines and resets. Keep the existing AUX drum guard until the embedded drum envelope and sustained-load tests pass.

The proposed host checks can establish deterministic DSP and state behavior. Radio coexistence, electrode response, DAC fidelity and performer-perceived latency require the real device and cannot be certified from a successful compile alone.
