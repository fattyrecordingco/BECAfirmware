# BECA

BECA is a plant-driven music instrument built around an ESP32 device and a desktop control app.

The current product workflow is desktop-first:
- use the BECA app to flash firmware
- save Wi-Fi credentials
- run the Serial MIDI bridge when needed
- monitor plant activity and MIDI notes
- control the device from the live Control view

The old browser page on the device is now a fallback and recovery path, not the primary user interface.

## Current Release Baseline

- app: `setup-v0.1.5`
- firmware release tag: `firmware-v1.0.9`
- primary branch for release-ready source: `master`
- firmware build target: ESP32 Arduino core `2.0.14`

## What BECA Includes

- BECA device firmware in [BECAfinalsv02.ino](./BECAfinalsv02.ino)
- BECA desktop app in [apps/beca-setup](./apps/beca-setup)
- native Serial MIDI bridge in [tools/bridge](./tools/bridge)
- flashing and backup helpers in [tools/flasher](./tools/flasher)

Repo layout note:
- keep [BECAfinalsv02.ino](./BECAfinalsv02.ino) as the Arduino sketch entrypoint
- keep the thin `src/*` PlatformIO wrappers because they are the compatibility layer between Arduino IDE and PlatformIO

## Current Product Model

BECA now works as one consistent system:

- `Setup` is for connection, flashing, Wi-Fi, and bridge management.
- `Control` is the live performance surface.
- the on-screen 8-leaf LED column mirrors the device LEDs
- the flower is the virtual encoder
- the device encoder and the app should always be describing the same selected control and the same value

Timing is now simplified:
- BECA runs on its internal clock by default
- users do not choose a separate clock mode anymore
- `DAW Sync` is the only exposed timing toggle

## Supported User Paths

### Recommended

Use the desktop app for everything:
1. install BECA
2. connect the device by USB
3. flash firmware
4. save Wi-Fi
5. choose output mode
6. open the Control view

### Fallback

If Wi-Fi setup through USB is not available on an older firmware build:
1. connect to the device AP, usually `BECA-XXXX`
2. open `http://192.168.4.1/setup`
3. enter Wi-Fi details there
4. reconnect through the desktop app afterward

## Requirements

### Hardware

- BECA device
- USB data cable
- computer running Windows, macOS, or Linux
- optional DAC/speakers if using `aux out`

### BECA v1.0.2 board inputs

BECA v1.0.2 keeps the same core architecture and adds hardware detect lines:

- encoder switch: `IO15`
- plant input ADC streams: `IO34` and `IO35`
- plant input jack detect footprint: `IO32` (disabled in firmware by default for the current circuit)
- aux out jack detect: `IO33`

The firmware debounces the active switch lines. BECA v1.0.2 defaults use `INPUT_PULLDOWN` and treat `HIGH` as pressed or connected for the encoder switch and aux jack detect input. Plant performance now treats the plant input as connected unless `BECA_PLANT_JACK_DETECT_ENABLED` is explicitly set to `1` before compiling. If a board revision wires the active switch contacts with the opposite polarity, adjust the relevant `*_PIN_MODE` and `*_CONNECTED_LEVEL` or `*_PRESSED_LEVEL` constants in the sketch before compiling.

### Firmware and library baseline

The project is pinned to these known-good versions:

- ESP32 Arduino core `2.0.14`
- `lathoub/BLE-MIDI@2.2`
- `fortyseveneffects/MIDI Library@5.0.2`
- `h2zero/NimBLE-Arduino@1.4.3`
- `fastled/FastLED@3.10.3`

## Install The BECA App

Download the app from the GitHub Releases page for this repository:

- https://github.com/fattyrecordingco/BECAfirmware/releases
- choose the newest `setup-v*` release
- Windows users should download `BECA_*_x64-setup.exe`
- macOS users should download `BECA_*.dmg` when published
- Linux users should download `BECA_*.AppImage` or `.deb` when published

The app can flash the newest stable firmware from the release manifest. A source checkout is only needed for development or manual PlatformIO flashing.

### Windows

Use the installer:
- GitHub Release asset: `BECA_*_x64-setup.exe`
- repo mirror when present: [apps/beca-setup/dist-installer/windows](./apps/beca-setup/dist-installer/windows)

Install flow:
1. run the installer
2. open `BECA` from Windows Search or Start Menu
3. if Windows asks for WebView2, install it and reopen the app
4. if the device is not detected, install the correct USB serial driver

Common drivers:
- CP210x: https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers
- CH340/CH341: https://www.wch-ic.com/downloads/CH341SER_EXE.html

### macOS

If a DMG is published for the release:
1. open the DMG
2. drag `BECA` into `Applications`
3. open it from `Applications`
4. if Gatekeeper blocks first launch, right-click and choose `Open`

### Linux

Linux can be built from source. Packaged Linux installers may be added in future releases, but the main maintained packaged path today is Windows.

## First-Time Setup In The App

### 1. Connect BECA

On the `Setup` screen:
1. connect the device by USB
2. click `rescan device`
3. confirm the status box changes from not connected to a detected device

### 2. Flash Firmware

1. confirm `Latest Stable` is selected in `upload firmware`
2. click `flash firmware`
3. wait for flash completion before doing anything else

Normal firmware flashes keep the saved Wi-Fi credentials and the last runtime session because the app image is updated without erasing the NVS settings partition.

If flashing fails:
- try another USB cable
- close any serial monitors
- retry with the device on its real COM port
- some boards may need a manual `BOOT` hold during upload

### 3. Save Wi-Fi

1. enter the device name you want
2. select your 2.4 GHz network
3. enter the password
4. click `save & reboot`

If scanning is unreliable:
- type the SSID manually in fallback setup mode
- or use `flash + save wifi` after entering the credentials

### 4. Configure The MIDI Bridge

On the `MIDI bridge` section:
1. choose the primary MIDI output
2. optionally choose a second mirrored output
3. click `connect bridge`
4. when connected, the button changes to `disconnect bridge`
5. use `send test note` to verify routing

Bridge rules:
- the bridge owns the serial port while running
- stop the bridge before Wi-Fi setup or any direct serial maintenance
- while the bridge is running, live Control uses Wi-Fi when BECA is online; if BECA is offline and USB is occupied by the bridge, the app shows the target as not ready instead of leaving a stale control surface on screen
- the app now reflects bridge state on launch, so it should not come up lying about whether bridge is running
- the app now stops the bridge automatically when the desktop window exits
- the last bridge routing and MicroFreak toggle choices are restored on the next launch

Live stability rules:
- the desktop app now reuses its live control HTTP client instead of rebuilding it on every request
- live snapshots are cached briefly and reused across UI polls so the plant monitor stays smoother
- if Wi-Fi or serial control stalls for a moment, the app keeps the last good live frame while it reconnects instead of dropping immediately into a dead-looking monitor
- the control page now defaults back to `Setup` until a live target is actually ready
- the firmware SSE stream sends lightweight keepalives and drops blocked clients, so stale browser sockets reconnect instead of wedging the main loop

## The Control View

The `Control` page is the main live interface. It mirrors the instrument and lets the user work the same way they would on hardware.

### What you see

- plant input monitor
- note or chord readout
- 12-note MIDI monitor strip
- 13 parameter tiles
- volume row
- output mode row
- random button
- `daw sync` toggle
- 8-leaf LED mirror
- flower encoder

### Selection model

The selected thing must always read as selected:
- selected parameter tile: green fill with white text
- unselected parameter tile: white fill, grey border, green text
- selected volume row: green fill with white text
- active output option: green fill with white text
- inactive output option: outline only
- active setup icon: green circle
- inactive top icon: greyed out

### How the flower works

The flower is the only value input in the app, just like the physical encoder is the only value input on the device.

- rotate or scroll up: increase value
- rotate or scroll down: decrease value
- click a parameter tile first to decide what the flower is changing
- click the volume row to enter volume mode
- click an output option to switch output mode directly

### Parameter list

The current control surface exposes:

- sensitivity
- preset or mode
- scale
- root note
- tempo
- swing
- rest
- low octave
- high octave
- time signature
- note length
- filter
- resonance
- volume
- output mode
- DAW sync
- randomize

Behavior notes:
- `note length` is available in MIDI modes as well as `aux out`
- `filter` and `resonance` are `aux out` controls
- `preset` changes the musical mode in BLE and Serial, and changes synth presets in `aux out`
- BECA clock itself is internal-only; users only see `DAW Sync`

### Output modes

#### BLE

Wireless MIDI from BECA to a BLE MIDI host.

#### Serial

USB serial data is translated to standard MIDI by the BECA bridge app.

#### Aux out

Uses the onboard synth/audio engine.

In `aux out`:
- synth presets replace the normal mode preset list
- filter and resonance become active
- note length still works

On BECA v1.0.2, inserting an aux cable on the aux out jack automatically routes output to `aux out` after the startup aux safety lock has expired. If that auto-route owns the output, unplugging the aux cable restores the previous BLE or Serial output. A manual output change while the aux cable remains connected is respected until the cable is unplugged and reinserted.

## LED Language

The 8 device LEDs and the 8 leaves on the right side of the app are now information-only. They are not audio-reactive.

### General rules

- grey means off
- the app mirrors the physical LED state
- the first logical LED is the bottom leaf, not the top

### Startup self-check

On boot, the 8 device LEDs now run a short self-check before BECA announces Serial MIDI readiness. Green means the check passed, yellow means BECA is in a safe fallback state, and red means that check needs attention.

Checklist order:

1. `prefs`: settings storage opened. Red means the ESP32 preferences/NVS store did not open.
2. `session`: last runtime state restored. Yellow is normal after a clean first flash or if no saved session exists.
3. `plant`: plant input is available. Yellow means plant detect is enabled and the plant cable is not detected.
4. `ble`: BLE-MIDI handlers initialized.
5. `output`: output mode is valid and safe. This should be green after the latest firmware; older builds could show this as yellow when a saved `aux out` session was safely booted into BLE/Serial during the aux startup lock.
6. `wifi_saved`: saved Wi-Fi credentials exist. Yellow is normal before first Wi-Fi setup.
7. `network`: network mode is ready. Green means station Wi-Fi connected; yellow means setup AP mode is active with no saved Wi-Fi; red means saved Wi-Fi exists but connection failed.
8. `services`: web and mDNS services are ready. Yellow is normal in AP setup mode because `.local` service discovery is station-network-only.

If the 5th checklist LED is red or red-looking on boot, update to the current firmware first. In current code LED 5 only fails if the output mode is outside the valid BLE/Serial/Aux range; if it appears after the checklist, it may instead be the normal output-mode LED pattern, not the startup checklist.

Plant trigger stability:
- firmware now uses a small hysteresis window and re-arm delay on plant triggers
- this reduces rapid stop-start retriggers when the sensor energy hovers near the threshold
- the live plant scope, note, and drum streams target `24 fps` by default for smoother app feedback without pushing the ESP32 into a heavy 30 fps web workload
- the app interpolates plant-scope frames at roughly `30 fps`, so the UI remains smooth even when the ESP32 or Wi-Fi link drops visual frames under load

### How each control reads

- most controls use a color-coded fill count to show approximate value
- `tempo` uses a one-hot moving leaf like a metronome
- `low octave` and `high octave` light the octave span directly
- `volume` uses the colored meter dots and matching LED count
- `output mode` uses a distinct LED pattern per mode
- `randomize` uses its own transient pattern
- LED colors use the stronger hardware semantic palette, not pastel UI-only colors, so the app mirror stays readable and matches the physical ring

This gives the hardware enough information to feel playable without the app, while the app gives exact value readouts when the user wants precision.

## Hardware Encoder Behavior

The app and the device follow the same interaction language as closely as possible.

### Physical encoder

- turn clockwise: increase current value
- turn anticlockwise: decrease current value
- single tap: move to next setting in the hardware LED order
- double tap: enter volume mode
- tap and hold: cycle output mode as BLE, aux out, then Serial
- triple tap: randomize core settings

The current single-tap order is sensitivity, preset, scale, root note, tempo, swing, rest, low octave, high octave, time signature, note length, filter, and resonance. Filter and resonance are skipped unless `aux out` is active.

Plant jack detect on `IO32` is disabled by default, so the plant input is treated as connected and IO34/IO35 plant movement can continue to drive notes normally. For hardware bring-up, serial control command `@C PINS` reports the raw and debounced encoder switch, aux detect, plant ADC pin states, and whether plant detect was compiled in.

### On-screen control flow

- click any parameter tile to select it
- the previously selected parameter becomes unselected immediately
- turn the flower to adjust the selected item
- the LED column should update at the same time
- the device LEDs should show the same pattern as the app

## DAW Sync

`DAW Sync` is the timing link to an external DAW transport.

- `OFF`: BECA uses its internal timing
- `ON`: BECA follows incoming DAW clock when clock is present

There is no separate user-facing clock selector anymore.

If `DAW Sync` is on and no DAW clock is being received, BECA remains safe and stable. The user does not need to manage an extra clock parameter.

## Troubleshooting

### Device not detected

- confirm the cable is a data cable
- install the correct USB driver
- close Arduino Serial Monitor, PlatformIO monitor, and other serial tools
- click `rescan device`

### Flashing fails

- confirm the correct COM port
- retry after unplugging and reconnecting the device
- some ESP32 boards need a manual `BOOT` hold while upload starts
- if the app can build firmware but cannot flash, the issue is usually USB or bootloader state, not the app bundle

### Bridge will not start

- make sure the device is connected by USB
- choose different primary and mirror outputs
- close other apps that may be holding the MIDI or serial device

### Wi-Fi will not save

- stop the bridge first
- wait for any flash or reboot cooldown to finish
- use a 2.4 GHz network
- try fallback AP setup if the device is on older firmware

### Control view feels stale

- close BECA and reopen it from the installed app entry
- confirm the installed app is the current build, not an old portable copy
- reconnect the device and let the app rediscover the best control transport

### 5th startup LED is red or yellow

- LED 5 is the `output` check
- update/flash the latest firmware from the BECA app first
- in current firmware, a saved `aux out` session is safely booted into BLE/Serial during the aux startup lock and LED 5 should still pass
- if LED 5 is truly red during the checklist, open the serial monitor at `115200` and look for `@I STARTUP CHECK 5 output fail`
- if the red LED appears after the checklist animation, it is probably a normal LED display pattern, especially Serial output mode or the red tempo control color

### Jack detection looks inverted

- the v1.0.2 defaults expect active jack detect lines to read `HIGH` when a plug is inserted
- plant jack detect is disabled by default; `@C PINS` should report `plant_detect_enabled:0` and the app should treat plant input as connected
- if you explicitly re-enable plant detect and the app says the plant cable is unplugged while it is inserted, check `@C PINS`; if the raw level is `0` while connected, review `BECA_PLANT_JACK_PIN_MODE` and `BECA_PLANT_JACK_CONNECTED_LEVEL`
- if aux auto-routing happens when no aux cable is inserted, check `@C PINS`; if the raw level is `1` while unplugged, review `BECA_AUX_JACK_PIN_MODE` and `BECA_AUX_JACK_CONNECTED_LEVEL`
- after changing either polarity, rebuild and flash the firmware again
- use serial command `@C PINS` while inserting or removing cables to confirm raw pin polarity before changing the firmware constants

## Build From Source

### Desktop app

```bash
cd apps/beca-setup
npm install
npm run tauri dev
```

### Firmware

```bash
platformio run
```

### Flash firmware from PlatformIO

Replace the port with the real device port:

```bash
platformio run -t upload --upload-port COM4
```

## Release Workflow

### Desktop release

The Windows packaging path is:

```bash
platformio run
cd apps/beca-setup
npm run release:windows
```

That workflow:
- syncs the current firmware binary into the app bundle
- builds the BECA desktop app
- refreshes [apps/beca-setup/dist-installer/windows](./apps/beca-setup/dist-installer/windows)

### Versioning

- desktop app version lives in:
  - [apps/beca-setup/package.json](./apps/beca-setup/package.json)
  - [apps/beca-setup/src-tauri/Cargo.toml](./apps/beca-setup/src-tauri/Cargo.toml)
  - [apps/beca-setup/src-tauri/tauri.conf.json](./apps/beca-setup/src-tauri/tauri.conf.json)
- firmware release tags use `firmware-v*`
- desktop release tags use `setup-v*`

## Repo Map

- [BECAfinalsv02.ino](./BECAfinalsv02.ino): main firmware sketch
- [platformio.ini](./platformio.ini): firmware build environment pinned to ESP32 core `2.0.14`
- [apps/beca-setup](./apps/beca-setup): desktop app
- [apps/beca-setup/ui/control.html](./apps/beca-setup/ui/control.html): live control surface
- [apps/beca-setup/ui/index.html](./apps/beca-setup/ui/index.html): setup workspace shell
- [tools/bridge](./tools/bridge): native MIDI bridge
- [tools/flasher](./tools/flasher): flash and backup helpers
- [ableton](./ableton): optional Ableton Live and Max for Live support files
- [docs](./docs): architecture notes that support this README

## Notes For Maintainers

- keep BLE MIDI stable
- keep control transport diff-based and lightweight
- do not reintroduce the old mock control surface behavior
- keep repo cleanup conservative around Arduino/PlatformIO compatibility shims
- if setup or control behavior changes, update this README in the same change
- if you touch the device web fallback `index.html`, regenerate `index_html.h`

