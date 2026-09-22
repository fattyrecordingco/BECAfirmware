# BECA Phone Control

BECA Phone Control is an installable extension of the desktop BECA Control experience for operating the onboard AUX synthesizer directly over a USB-C serial connection. It uses the firmware's existing `@C` protocol at 115200 baud and does not change BLE-MIDI behavior.

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

iPhone and iPad browsers do not expose BECA's USB serial bridge to web apps. The interface can load there, but direct USB connection is unavailable. Use an Android device for this version. Desktop Chromium browsers continue to use native Web Serial; Android uses the app's WebUSB drivers for every adapter recognized by the desktop app: CH340/CH341, CP210x, FTDI, and Espressif USB Serial/JTAG.

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

**No sound:** select Aux or Serial + Aux, make sure mute is off, connect the AUX cable, start at a low master level, and press **Test sound**. The test requires AUX mode and an active audio engine.

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
