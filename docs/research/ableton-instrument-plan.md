# BECA instrument for Ableton: research and implementation plan

Reviewed 11 September 2026. This is a source review and proposal, not a newly implemented or auditioned instrument. Source references describe the baseline inspected during this run; other work in the same run may extend the firmware engine.

## Recommendation

Build **BECA Instrument.amxd**, a Max for Live instrument that receives the track's MIDI, generates stereo audio locally, and exposes the BECA sound controls as Live parameters. Keep the existing **BECA Control.amxd** available for controlling the physical unit and playing other instruments. A self-contained instrument fits the requested Live experience: add it to a MIDI track, choose the BECA MIDI port, and perform. Max for Live instruments behave as devices in a Live Set; the required edition is Live Suite, or Standard with the Max for Live add-on. [Ableton's Max for Live manual](https://www.ableton.com/en/manual/max-for-live/)

There are three different promises to keep separate:

| Promise | Feasibility |
| --- | --- |
| Play BECA notes through a native Live instrument | Feasible with Max for Live and any working BECA MIDI input port. |
| Reproduce the app's controls and sound palette inside Live | Feasible, but requires an actual DSP implementation and parameter/preset mapping. The existing Max device does not generate audio. |
| Plug the existing BECA USB cable in and have it enumerate directly as a class-compliant MIDI instrument | Not a firmware-only change on the documented ESP32-PICO-V3 hardware. Its present USB path carries serial data. |

## What is already implemented

| Local evidence | Observed capability and gap |
| --- | --- |
| [BECA Control.maxpat](../../ableton/m4l/BECA%20Control.maxpat) | Thirteen boxes, including `node.script`, a `jsui` surface and `midiout`. No `midiin`, oscillator, audio voice allocator or `plugout~`. Incoming track MIDI therefore has no explicit processing/pass-through path, and this patch has no audio engine. |
| [Ableton integration README](../../ableton/README_ABLETON.md) | Documents HTTP/Serial/Mock connections, firmware controls, a plant monitor and note re-emission. Its installation puts an instrument after BECA Control. This is a controller workflow, not the requested integrated instrument. |
| [Node transport](../../ableton/m4l/code/beca_control_node.js), `flushPendingSetQueue` around line 942 | Parameter writes coalesce by key, with a global minimum gap of 66 ms. Eight different pending keys require at least 462 ms between first and last transmission, before network/dispatch delay. This is not simultaneous multi-parameter application. Actual code tries legacy setters first, then `/api/set`; the README describes the reverse. |
| Same file, `pollHttpFast` around line 1505 and `applyNotesSnapshot` around line 1087 | Modern HTTP mode polls plant/note snapshots every 140 ms and skips them during queued writes. Snapshot comparison can miss short notes, repeated onsets of an already-active pitch and channel identity; reconstructed notes use channel 1. Use this for monitoring, not timing-critical musical input. |
| Same file, `parseSerialMidiHex` around line 1114 and `disconnectAll` around line 1711 | Serial parser accepts note-on/off only, so other messages such as CC123 are dropped by this path. Disconnect clears the internal note map without emitting release/panic. Both need explicit handling before dependable re-emission in a performance instrument. |
| [Firmware](../../BECAfinalsv02.ino), lines 3, 25–29, 203–235, 2292–2295 and `buildApiPlantJson`/plant endpoints | ESP32-PICO-V3; advertising name `BECA BLE-MIDI`; note and CC output helpers; raw ADC values constrained to 0–4095 and separate normalized plant values. There is no continuous raw-sensor MIDI mapping in the inspected note/CC output path. |
| [Synth engine](../../synth_engine.cpp), [header](../../synth_engine.h), [DSP blocks](../../dsp_blocks.h) | Baseline synthesis is C++ on the ESP32: dual oscillators, voice/envelope handling, filter, drive, delay/reverb and drums. The app controls that engine; no browser `AudioContext`/`createOscillator` engine was found in the inspected app/UI. `src/synth_engine.cpp` includes the root implementation. |
| [Native bridge](../../tools/bridge/src/main.rs), lines 173–179 and `open_midi_output` around line 272 | Serial-to-MIDI bridge already exists and sends the serial host heartbeat. It opens an existing OS MIDI destination; it does not create a virtual MIDI port itself. On Windows, its missing-port error requests loopMIDI. |
| [Device builder](../../ableton/m4l/build_amxd.py), lines 17–42 | Wraps patch JSON in an AMPF container and targets the MIDI Effects library folder. This is not proof of host loading, DSP correctness, dependency freezing or correct instrument metadata. |

The documented stable firmware target is **ESP32 Arduino core 2.0.14**, with BLE-MIDI 2.2, MIDI Library 5.0.2 and NimBLE-Arduino 1.4.3 in [README.md](../../README.md). This plan does not alter that stack. A host instrument should be additive and need no BLE library migration.

## The sensor-to-sine requirement

For literal numeric sonification, define `frequency_hz = raw_sensor_1`: a received value of 732 produces a 732 Hz sinusoid. Do not convert 732 to a MIDI note, normalize it into a musical scale, or apply pitch quantization. The raw ADC count is a sensor reading, not a measured acoustic frequency; assigning it to hertz is the chosen sonification rule.

The Max implementation can use a continuously running `cycle~`, whose frequency input is in hertz. Preserve oscillator phase across updates; only gate amplitude smoothly on enable, disable and disconnect. Keep a strict 1:1 frequency mode with no deliberate frequency glide, and make any smoothed musical mode separate. Zero should produce silence rather than an audible minimum-frequency substitution; values below 20 Hz remain below the usual audible range. Frequency changes still arrive at the sensor/transport cadence and are rendered on audio processing boundaries. They are not physically zero-latency. [Cycling '74 cycle~ reference](https://docs.cycling74.com/reference/cycle~/)

**Ordinary BECA MIDI note messages do not contain enough information to recover the exact raw reading.** The current firmware maps sensor behavior into musical notes, and the result is lossy. The first instrument can play notes from MIDI while optionally receiving raw telemetry over the existing serial/HTTP plant protocol. Baseline serial plant JSON carries raw readings at up to 20 Hz, and `/api/live` includes them; the SSE scope payload does not. The existing serial-to-MIDI bridge does not translate plant JSON into MIDI. When raw telemetry is missing, show “raw sensor unavailable” and silence the direct-sine layer rather than inventing a frequency from a note.

A later MIDI-only protocol can add a negotiated, opt-in 14-bit raw-sensor value using paired CC messages or a versioned SysEx message. A 14-bit container represents each current 12-bit raw count exactly. Specify byte order, pair assembly, source identity and stale-value behavior; do not emit partial pairs as frequencies. Keep it off for ordinary external synth destinations to avoid unexpected controller changes. SysEx transfer is supported through Max for Live in Live 10 and later, but transport behavior must be verified end-to-end. [Ableton SysEx support](https://help.ableton.com/hc/en-us/articles/360003148640-SysEx-support)

## Plug-and-play transport choices

| Route | User experience | Engineering consequence |
| --- | --- | --- |
| Existing serial bridge → OS MIDI port → Live | Reuses today's BECA desktop setup. Select the saved port once; instrument loads like any other Live instrument. | Best first supported Windows path. The bridge owns the COM port; a Max device must not try to open it simultaneously. Use Wi-Fi for optional device controls until a shared bridge protocol exists. |
| Serial directly inside the Max instrument | Select the BECA COM port in the device, then receive notes, sensor data and control replies through one connection. | Can remove the external virtual-port requirement for that instrument, but it is not an OS MIDI device. Bundle/test the serial native dependency for each platform, handle ownership, heartbeat, reconnect and panic. |
| BLE-MIDI → OS MIDI port → Live | Wireless note input, with initial host connection/port setup. | Good optional route once verified on the target OS. Do not promise automatic Windows BLE support across installations. |
| New USB-MIDI-capable hardware/companion bridge | BECA enumerates as MIDI when connected by USB. | Genuine class-compliant USB path, but requires hardware/firmware work and a separate compatibility programme. |

Live needs its MIDI input port enabled for **Track**, with the instrument track monitored **In**, or **Auto** and armed. Device selection cannot eliminate OS enumeration or the host's routing requirements. A saved Live template can make subsequent sessions much simpler. [Live MIDI settings](https://help.ableton.com/hc/en-us/articles/209774205-Live-s-MIDI-Settings)

macOS offers BLE-MIDI connection through Audio MIDI Setup. [Apple's BLE-MIDI setup guide](https://support.apple.com/guide/audio-midi-setup/set-up-bluetooth-midi-devices-ams33f013765/mac) Windows deserves a tested compatibility matrix: Microsoft's official Windows MIDI Services known-issues page, updated 30 April 2026, still describes a future first-class BLE transport and current third-party-driver limitations. This is evidence against assuming universal BLE plug-and-play, not evidence that BECA BLE is broken. [Microsoft MIDI Services known issues](https://devblogs.microsoft.com/windows-music-dev/windows-midi-services-rollout-known-issues-and-workarounds/)

Espressif documents USB limitations of the original ESP32 family and USB device support on S2/S3. An ESP32-S3 route can support MIDI via TinyUSB, but those current SDK documents do not establish compatibility with BECA's pinned Arduino 2.0.14 build. Keep such hardware exploration separate from the stable product firmware. An external USB-capable companion also avoids replacing the existing sensor/BLE processor. [Espressif USB FAQ](https://docs.espressif.com/projects/esp-faq/en/latest/software-framework/peripherals/usb.html), [ESP32-S3 USB device stack](https://docs.espressif.com/projects/esp-idf/en/v5.5/esp32s3/api-reference/peripherals/usb_device.html)

## Instrument architecture

```text
Live track MIDI ──> midiin / MIDI parser ──> voice allocator ──> BECA DSP ──> stereo output
                                                       ↑                    plugout~
Live parameters / presets ──────────────────────────────┤
                                                       │
Optional raw telemetry ──> timestamp + validity ──> direct sine frequency
Optional hardware controls ──> coalesced command queue ──> BECA acknowledgements
```

Use native MSP/Gen audio processing, with network/serial work in the control layer. Set a hard voice limit and mute idle voices. Give local sound controls immediate DSP updates independent of hardware acknowledgements, while displaying pending/confirmed hardware values separately. Do not make playing the virtual instrument depend on a BECA HTTP connection. A normal MIDI keyboard and recorded clips should also play it.

Expose stable parameter IDs, units, defaults and ranges using `live.dial`, `live.menu` and related Live parameter objects; the existing all-in-one `jsui` patch contains no such parameter objects. Map the visible custom surface to the same parameter model so automation, MIDI mappings, Push and saved Sets control identical values. Follow state-diff updates and “set without output” semantics to prevent feedback loops. [Cycling '74 live.dial parameter reference](https://docs.cycling74.com/reference/live.dial)

For hardware writes, implement a bounded latest-value-per-key queue. A group of changes should use a versioned batch endpoint/command that validates every value before committing once, with one acknowledgement and state revision; this is a proposal, not an existing M4L capability. Preserve a bounded single-key fallback for older firmware. Use rate-limited state diffs for displays, but an event stream with sequence/timing information for notes. Never derive the musical clock from the current 140 ms polling loop. Disconnect, transport change, device disable and voice exhaustion need deterministic release/panic behavior.

For sound parity, first export a shared preset specification from the existing C++ defaults. Port oscillator mix, tuning, envelope curves, filter behavior, gain staging and effects intentionally. Compare rendered notes and parameter sweeps against reference recordings from BECA aux output. Similar labels do not prove identical sound, and hardware DAC/filtering and host sample-rate differences may prevent sample-for-sample parity.

Keep the first version free of new paid dependencies. RNBO is a credible later route if one DSP design must target Max, browser and VST3/AU, but it entails an engine port and export/tooling requirements. Its generic export does not automatically reproduce the BECA interface. [RNBO web export](https://rnbo.cycling74.com/learn/exporting-to-the-web-export-target), [RNBO plugin targets](https://rnbo.cycling74.com/learn/using-the-vst-audiounit-target), [RNBO authorization/export requirements](https://support.cycling74.com/hc/en-us/articles/10500185155603-RNBO-Authorization)

## Concrete delivery stages

1. **Reliable MIDI instrument shell.** Create a separate Max Instrument from Live's template, add incoming MIDI parsing, velocity/envelope handling, a sine voice, stereo output and panic. Make MIDI input the default; prevent simultaneous direct-MIDI and telemetry re-emission from doubling notes. Validate short/repeated notes, channel handling, sustain, CC123 and disconnects.
2. **BECA sound and performance controls.** Add the existing sound palette and approved new soundscapes, exposed Live parameters, preset persistence, useful macro banks and a compact performance view. Check that local parameter changes remain audible during network failure and while multiple controls move. Add the raw-frequency layer using telemetry with a visible received value and actual Hz display.
3. **Hardware control and telemetry.** Reuse the current transport protocol behind one connection owner. Correct the queue, polling and panic issues above; negotiate capabilities and batching before using them. Record sensor sample time, transport receipt time and audio-render timing to measure latency rather than describing it as “instant”. Add a clear degraded-mode status and useful troubleshooting notes.
4. **Distribution.** Save and freeze a proper instrument in Max; include explicit dependencies and test it on a clean Max search path. The current Python wrapper alone is insufficient validation. Verify serial native-module packaging separately. Deliver source `.maxpat`, tested `.amxd`, preset specification, a MIDI/audio demonstration Set and a short first-run guide. [Cycling '74 device dependency documentation](https://docs.cycling74.com/userguide/m4l/live_unfreezing/)
5. **MIDI-only and USB product work.** Design opt-in raw sensor/control MIDI messages, then evaluate a USB-MIDI hardware revision or companion. Keep legacy BLE notes unchanged. Only describe this as cable-in plug-and-play once fresh-install Windows/macOS tests confirm enumeration, reconnect and routing.

Acceptance should include 44.1/48 kHz host audio; small and large buffers; clean project reopen; parameter automation and multiple instance isolation; 30 minutes of note/control stress; unplug/replug; loss of telemetry during held notes; and raw values 0, 20, 440, 732 and 4095 producing the documented direct-sine behavior. Measure dropouts, missing notes, CPU load and median/95th-percentile latency. Any latency thresholds set before measurement are targets, not achieved results.

## Local tooling and limits of this review

Read-only executable version inspection found **Ableton Live 12 Suite 12.4.5** at `C:/ProgramData/Ableton/Live 12 Suite/Program/Ableton Live 12 Suite.exe`, and bundled **Max 9.1.5.3db35fa476d** at `C:/ProgramData/Ableton/Live 12 Suite/Resources/Max/Max.exe`. This establishes that relevant host binaries are installed; licensing, device loading, audio output and BECA routing were not tested in this research subtask.

Without Live installed, it is possible to author patch JSON, validate object references structurally, test transport JavaScript and render/test a separately implemented DSP core. It is not possible to claim a usable, verified Max for Live instrument solely from those checks. Real Live/Max loading, audio and automation validation remain release gates. Here, the installed host makes that next stage feasible; this document intentionally makes no claim that a new instrument has already been built.
