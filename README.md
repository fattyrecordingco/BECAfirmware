# BECA Firmware

Firmware for an **ESP32-based plant-played instrument** that combines:

- Plant signal sensing (analog input)
- BLE MIDI output (NimBLE transport)
- Real-time LED visualization (FastLED)
- On-device web UI + SSE telemetry
- Wi-Fi provisioning (STA mode + AP fallback portal)

The main firmware entrypoint is `BECAfinalsv02.ino`.

## Repository layout

- `BECAfinalsv02.ino` — Complete firmware: sensing, music logic, BLE MIDI, web UI, provisioning, LED FX.
- `logo.svg` — Source logo asset.
- `make_logo_header.py` — Utility script to minify+gzip `logo.svg` into a C header.
- `logo_svg.h` — Auto-generated gzipped logo byte array served by firmware.

## Hardware / platform assumptions

Target comments and pin mappings indicate:

- Board family: ESP32 (noted as ESP32-PICO-V3 / Arduino ESP32 Dev Module)
- LED strip: WS2812B, 8 pixels on pin `19`
- Plant analog input: pin `34` (both degree and octave are currently mapped to the same pin)
- Rotary encoder: `A=4`, `B=5`, switch `15`

Core configuration constants live near the top of the sketch.

## High-level architecture

The firmware runs a cooperative main loop with periodic tasks:

1. Service web server and DNS portal
2. Sample plant signal (~125 Hz)
3. Run transport clock and generate notes/drums
4. Render LEDs (~29 FPS)
5. Maintain SSE stream and BLE advertising keepalive
6. Service queued MIDI note-offs

This is all orchestrated from `setup()` and `loop()` in the `.ino`.

## Signal processing and performance model

Plant input processing combines:

- EMA smoothing (`EMA_ALPHA`)
- Slow baseline tracking (`BASELINE_ALPHA`)
- Noise floor tracking (`NOISE_TRACK_ALPHA`)
- Envelope follower (`ENV_ATTACK` / `ENV_RELEASE`)

From the processed signal, the firmware derives:

- Degree control (`fDeg`)
- Octave control (`fOct`)
- Energy (0..1)
- Velocity (mapped MIDI velocity)

These features drive both note generation and visual telemetry (`gFeat*`, `gScopePlant`).

## Musical engine

### Modes

`Mode` enum supports four generation behaviors:

- `MODE_NOTE`
- `MODE_ARP`
- `MODE_CHORD`
- `MODE_DRUM`

Clocking can be either:

- Internal transport clock (`CLOCK_INTERNAL`)
- Plant-triggered (`CLOCK_PLANT`)

### Theory and pitch mapping

- Root note stored as `rootMidi` (UI exposes semitone/root-class)
- Configurable octave range (`lowOct`, `highOct`)
- Multiple scales/modes (major, minor, dorian, lydian, mixolydian, pentatonic, harmonic minor, phrygian, whole-tone, plus chord-oriented variants)
- Degree/octave bins are converted into MIDI notes by `buildMidiFromBins()`

### Drum machine

Drum mode maps 8 parts to GM-like drum notes on MIDI channel 10:

1. Kick (36)
2. Snare (38)
3. Closed HH (42)
4. Open HH (46)
5. Tom 1 (45)
6. Tom 2 (47)
7. Ride (51)
8. Crash (49)

`drumSelMask` bitmask enables/disables parts. Hit state is tracked for UI indication and sent over SSE.

## BLE MIDI behavior

BLE MIDI is initialized with device name `"BECA BLE-MIDI"`.

Connection lifecycle:

- On connect: mark connected
- On disconnect: send all notes off, clear note-off queue, immediately restart advertising

A periodic advertising “kick” is also used when disconnected to improve rediscovery reliability with some hosts.

## LED engine

The sketch contains an effects/palette system with runtime-selectable:

- Effect mode (`fxMode`)
- Palette index (`currentPaletteIndex`)
- Visual speed/intensity (`visSpeed`, `visIntensity`)
- Brightness (`gBrightness`)

`renderLEDs()` is called on a timed cadence from the main loop.

## Web UI and APIs

The firmware serves a built-in single-page control UI from `INDEX_HTML`.

### Core endpoints

- `GET /` — main UI
- `GET /logo` — gzipped SVG logo
- `GET /events` — SSE stream
- `GET /effects` — JSON list of effects
- `GET /palettes` — JSON list of palettes

### Control endpoints (selected)

- `/bpm?v=...`
- `/swing?v=...`
- `/b?v=...` (brightness)
- `/s?v=...` (sensitivity)
- `/lo?v=...`, `/hi?v=...`
- `/mode?i=...`
- `/clock?v=...`
- `/scale?i=...`
- `/root?semi=...`
- `/fxset?i=...`
- `/pal?i=...`
- `/visspd?v=...`, `/visint?v=...`
- `/rest?v=...`, `/norep?v=...`
- `/ts?v=beats-den` (example `4-4`)
- `/rand`
- `/drumsel?mask=...`

All control handlers respond with `OK` and update in-memory runtime state.

### SSE events

The UI consumes several server-sent events:

- `state` — diff-based consolidated state JSON (mode, clock, scale, bpm, fx/palette labels, etc.)
- `scope` — plant energy scalar for scope visualization
- `note` — note-grid payload (`held|vel|count|notes...`)
- `drum` — drum payload (`hitMask|selMask`)
- periodic comment ping keepalive

SSE is intentionally single-client for stability and has a max lifetime before recycle.

## Wi-Fi provisioning flow

Stored credentials are read from `Preferences` namespace `"beca"`.

Boot behavior:

1. If saved SSID exists, attempt STA connection (`tryConnectSTA`)
2. If STA fails, start AP portal (`startAPPortal`) at `192.168.4.1`
3. DNS wildcard captive portal behavior redirects setup-like probes

Provisioning endpoints:

- `GET /setup` — setup page
- `GET /wifi/scan` — scanned SSID list
- `POST /wifi/save` — save name/SSID/pass and reboot
- `GET /wifi/forget` — clear credentials and reboot
- `GET /api/info` — current mode/IP/name/SSID
- `GET /reboot` — reboot device

mDNS is started when possible (`<device-name>.local`).

## Build/tooling notes

- This repo is a single Arduino sketch-style firmware file with embedded HTML/JS/CSS.
- `logo_svg.h` is generated artifact; regenerate using:

```bash
python3 make_logo_header.py
```

The script minifies `logo.svg`, gzips it, and writes a C `PROGMEM` byte array.

## Operational notes and caveats

- Plant degree and octave are currently tied to the same analog pin by default; using two sensors requires changing `PLANT2_PIN`.
- `server.begin()` appears twice in `setup()` (harmless but redundant).
- SSE stream is single-client by design; opening multiple browser tabs will replace the prior stream client.

## Quick start (developer)

1. Open `BECAfinalsv02.ino` in Arduino IDE / PlatformIO configured for ESP32.
2. Install required libraries (ESP32 Arduino core, FastLED, NimBLE/BLE MIDI stack used by the sketch).
3. Build and flash.
4. On first boot (or after forgetting Wi-Fi), connect to AP `BECA-xxxx` and open `http://192.168.4.1/setup`.
5. After Wi-Fi setup, use the main UI at device IP or `http://<device-name>.local/`.
