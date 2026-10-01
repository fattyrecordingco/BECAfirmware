# BECA Phone Control

BECA Phone Control is an installable web instrument and controller for phones, tablets and desktops. Version 1.4 runs the original BECA C++ synthesizer locally through WebAssembly and AudioWorklet, including all 13 presets and eight drum voices. USB control uses the existing `@C` protocol at 115200 baud. The firmware's BLE-MIDI behavior is unchanged.

## Listen on a phone or tablet

Open the app over HTTPS (or localhost on a computer), tap **Listen on this device**, select a preset, and use **Test sound**. All synth controls work without hardware for previews; the plant graph stays empty until real data arrives. Performance, plant sensitivity and device controls require BECA. The layout supports phone and tablet portrait/landscape, and the manifest allows either orientation.

For live input on Android, connect USB and tap Listen. Listening selects **Serial MIDI** on BECA; **Serial MIDI + Aux** can also be selected when AUX is ready. The synth consumes live `@M` messages, including note-offs and channel-10 drums; it never synthesizes from the slower display snapshots or duplicates telemetry notes. Presets and parameters synchronize from BECA, and edits also update the connected board. Select the output route you want on BECA after stopping phone playback.

Audio follows the device's system output: built-in speaker, wired headphones or a Bluetooth audio device. Bluetooth adds device-dependent delay. Audio must be enabled with a user tap. Background playback is not guaranteed by mobile browsers; hiding the page stops local audio; tap Listen when returning. If the OS suspends audio, tap Stop and then Listen after returning. **Silence all notes** clears voices and effect tails; unplugging USB or losing the tablet link stops local playback.

## iPad and browser-to-browser tablet link

iPad/iPhone Safari and Chrome cannot directly access this board's USB serial bridge. Local synth previews work, but live plant input requires a connected computer in this web version. No direct iPad BLE-MIDI support is claimed.

1. Open the HTTPS app on the computer and tablet on the same local network. Connect BECA by USB in desktop Chrome/Edge.
2. Expand **Link an iPad or tablet through a computer** on both devices.
3. Create a computer code, copy it to the tablet's input, and choose **Join from tablet**.
4. Copy the tablet's reply back into the computer's input and choose **Finish on computer**.
5. Tap **Listen on this device** on the tablet. The graph, note monitor, presets and settings now receive live data through the computer.

The encrypted WebRTC data channel carries control messages and events, not audio. Audio is synthesized on the tablet. Pairing is manual, supports one tablet, and uses local ICE candidates without a signaling server, STUN or TURN service. Keep the host page open and computer awake. Guest Wi-Fi, client isolation, browser privacy policies and firewall rules may prevent connection; same-network physical iPad validation is still required. Link codes grant control of BECA; share them only with the intended device. Close Link revokes the active session.

While a tablet is linked, the host pauses its duplicate polling and the tablet supplies the normal heartbeat/state requests. Remote commands are allowlisted and limited to 24 requests per second, then passed through the existing serialized USB writer. Congestion closes the link instead of building an unbounded data-channel backlog. Loss of relay data for seven seconds disconnects the tablet. Do not operate both devices' controls continuously at once.

## Shared sound engine and builds

The audio build compiles the repository's `synth_engine.cpp`, `drum_engine.cpp` and `dsp_blocks.cpp`. `BECA_WEB_AUDIO` isolates the web adapter and single-threaded render entry point; ordinary Arduino builds still use I²S, FreeRTOS and watchdog-safe yielding. The firmware target and installed baseline remain Arduino ESP32 **2.0.14**. No BLE library changes are required.

`beca-synth.wasm` is a checked-in deployment asset. `audio-build.json` fingerprints the sources and WASM binary; ordinary builds reject a stale artifact. Ordinary `npm run build` needs no Emscripten installation. When the shared sound source changes, install/activate **Emscripten 4.0.23**, set `EMSDK` (and `EMSDK_PYTHON` if needed), and run:

```text
npm run build:audio
npm test
npm run build
npm run test:ui
```

The build script also detects a workspace `.beca-cache/emsdk` installation. The engine requests 44.1 kHz audio, retains the original 16-bit rendering and eight-voice limit, and uses fixed WASM memory and 128-frame render blocks. The 48 kHz fallback is tested, but the fixed delay buffer has less maximum delay at that rate. There is no new enhanced engine or audio recording/export feature in this version. Reuse of the original DSP is not a claim of bit-identical analog speaker output.

Raw Sensor Sine uses the firmware's `raw` and `connected` plant fields, retaining the ADC-value-to-frequency mapping. Its phone update cadence is limited by serial plant telemetry; it is not sample-accurate to the onboard sensor loop. Test sound supplies 440 Hz temporarily for that preset.

The plant graph retains at most 60 state-diff samples over 24 seconds. Parameters sent to the worklet are deduplicated. Sliders coalesce serial changes for 80 ms; the two-parameter expression pad sends at most four pairs per second plus the final release. No SSE endpoint or BLE stack is changed. New audio/link assets are included in the offline cache.

Automated checks cover all presets, drum mapping, release, reset silence, raw sensor frequency/disconnection, actual browser AudioWorklet output, USB note playback, controls, offline reload, responsive layouts and a real two-browser WebRTC link. Chrome tests exercise audio and the tablet link. WebKit tests exercise layout and controls; Windows Playwright WebKit has no Web Audio implementation and fails offline navigation internally, so those two checks are explicitly skipped there. USB devices and real iPad/Bluetooth speaker behavior still require physical verification.

## Open the app

The published app is hosted at:

<https://fattyrecordingco.github.io/BECAfirmware/>

The GitHub Pages workflow publishes this folder as the site root. For local development, run `npm install`, then `npm run dev` and open the printed localhost URL.

## Requirements

- An Android phone or tablet.
- Current Chrome or Edge on Android with WebUSB enabled.
- A USB-C OTG/data cable. Charge-only cables cannot work.
- BECA firmware with the serial control protocol used by this repository.
- The published HTTPS app or a localhost development server.

iPhone and iPad browsers do not expose BECA's USB serial bridge to web apps. Use local previews or the tablet link described above. Desktop Chromium browsers use native Web Serial; Android uses the app's WebUSB drivers for CH340/CH341, CP210x, FTDI, and Espressif USB Serial/JTAG.

## Connect and use AUX

1. Disconnect Arduino Serial Monitor, the desktop BECA app, or any other program using the device's serial port.
2. Connect BECA to the Android device with a USB-C data/OTG cable. Use an adapter if the BECA end is USB-A or Micro-USB.
3. Open the app in Chrome and press **Connect USB**.
4. In Chrome's USB prompt, select **USB-Serial**, **CH340/CH341**, **CP210x**, **FTDI**, or **Espressif USB Serial/JTAG**, then approve access. The app cannot grant this permission silently: Android requires a tap and explicit approval for security.
5. Wait for **BECA connected**. The app verifies `@C PING`, then loads parameters, state, synth state, plant state, and notes.
6. Choose **Aux audio** to hear the onboard synth, or **Serial MIDI + Aux** to keep serial MIDI output active as well.
7. Connect headphones, speakers, or an audio input to BECA's AUX output and adjust **Master volume** gradually.

BECA deliberately blocks AUX switching during its startup cooldown. The app displays the remaining wait and enables AUX when the firmware reports it ready.

## Install on the home screen

In Android Chrome, open the app and use **Install app** from the browser menu or the install button shown in the app. After the first successful load, the application shell works offline. Browser security can still require a fresh tap and device approval before every USB session.

## Features

- Verified 115200-baud Android WebUSB connection for CH340/CH341, CP210x, FTDI, and Espressif USB Serial/JTAG bridges, desktop Web Serial fallback, visible permission diagnostics, and cable-removal handling.
- The same light cream, white, and BECA green design system, desktop wordmark, typography, borders, controls, and flower app icon as BECA Setup/Control.
- AUX, Serial + AUX, Serial, BLE, and firmware-advertised Wi-Fi MIDI routing.
- Master level, mute, test chord, presets, oscillators, ADSR, filter, reverb, delay, drive, detune, and voice controls.
- Plant sensitivity, musical mode, scale, root, tempo, swing, octave range, rests, clock, time signature, and note length.
- Live plant energy, connection state, AUX readiness, and note display.
- Advanced serial console with bounded history and safe single-line commands.
- Installable offline PWA with responsive phone and landscape layouts.
- A live 24-second plant-energy graph with current, rolling average, low, high, and trend readouts.
- A desktop-style 12-leaf MIDI display that highlights played pitch classes and doubles as an accessible root-note selector.
- A touch and keyboard accessible 2D sound pad: horizontal movement shapes filter cutoff and vertical movement shapes resonance.
- State-diff sampling keeps the graph to 60 bounded points; pad changes are paired and limited to four updates per second plus the final release before serialized USB writes.
- The fixed-size live deck replaces the introductory banner and remains visible across Controller, Synth, Performance, and Console. Dynamic MIDI labels are clipped within reserved space so note activity cannot move the controls or cause page jitter.

## Transport behavior

The app keeps a `PING` heartbeat below the firmware's three-second serial-host window. Visible pages request state and plant/notes at 2 Hz and synth state at 0.5 Hz. Hidden pages pause polling. Slider changes are coalesced for 80 ms, then all writes pass through one queue capped to about 16 writes per second. Incoming updates only replace controls that are not actively being touched.

The initial handshake sends:

```text
@C PING
@C TELEMETRY 1
@C PARAMS
@C STATE
@C SYNTH
@C PLANT
@C NOTES
```

The app uses `@C SET <key> <value>` for controls. It requests `TELEMETRY 0` during an orderly disconnect. The console accepts either `STATE` or the complete `@C STATE` form and removes embedded newlines.

## Troubleshooting

**No USB permission or device picker appears:** first read the four diagnostics at the top of the app. **Browser** must say `WebUSB ready` or `Web Serial fallback`, and **Secure app** must say `HTTPS ready`. Open the page directly in current Chrome or Edge, not an email/social app. Unlock the phone, enable OTG/USB host mode if the phone has that setting, connect BECA directly without a hub, press **Connect USB**, and choose USB-Serial/CH340/CP210x/FTDI/Espressif. Some phones disable OTG automatically after a few minutes, so disconnect and re-enable it before retrying.

**The chooser opens but is empty:** verify BECA is powered from the phone and that Android shows a USB attachment notification. The v1.2 chooser includes the same four adapter families as the desktop detector. If Android itself shows no USB attachment at all, the failure is below the web app: check the phone's OTG/host support, connector orientation/adapter, and whether BECA needs separate power.

**The Connect button is unavailable:** use current Chrome or Edge on Android and open the HTTPS GitHub Pages address directly, not inside an email/social-media in-app browser. WebUSB is unavailable in iPhone/iPad browsers and many embedded browsers.

**The adapter appears but will not open:** close USB terminal apps and the desktop BECA app, disconnect/reconnect BECA, and approve Chrome as the app allowed to use the USB device. Select BECA's CH340/CH341, CP210x, FTDI, or Espressif adapter, not an unrelated USB device. The app closes adapters that do not answer the BECA handshake.

**AUX is disabled:** wait for the startup countdown. If the firmware returns `aux not ready`, refresh state and retry after the displayed time.

**No sound on the phone/tablet:** tap **Listen on this device**, check the device's media volume/output and BECA's mute state, then press **Test sound**. For live notes, select Serial MIDI or Serial MIDI + Aux. Test sound now plays locally, including without BECA. For an onboard AUX test, select AUX and send `SYNTH_TEST` from the connected console.

**Plant activity is absent:** open Console and run `PINS` and `PLANT`. Check electrode and jack connections. Plant jack detection may be disabled in some firmware builds, so raw readings are the useful diagnostic.

**An old app version remains:** close all installed app windows, revisit the HTTPS page while online, then reopen it. The service worker replaces old application-shell caches during activation.

## Development and verification

```bash
cd apps/beca-phone
npm install
npm test
npm run build
npm run test:ui
```

`npm test` checks framing, parsing, command sanitization, serialized writes, CH340/CP210x/FTDI/Espressif initialization and permissions, manifest metadata, and the offline asset list. Playwright serves the built deployment artifact and runs Android, small-phone, and desktop layouts against a mock BECA serial device, covering the real WebUSB permission path, diagnostics, handshake, live state, AUX commands, navigation, overflow, offline reload, and serious WCAG A/AA findings.

Physical verification should also confirm the actual AUX signal and USB behavior on the target phone. Automated tests cannot hear the DAC output or grant a phone's USB permission dialog.

## Firmware compatibility

This app introduces no firmware dependency and does not edit the embedded `index.html`. The repository remains pinned to ESP32 Arduino core 2.0.14, BLE-MIDI 2.2, MIDI Library 5.0.2, NimBLE-Arduino 1.4.3, FastLED 3.10.3, and AppleMIDI 3.5.0.
