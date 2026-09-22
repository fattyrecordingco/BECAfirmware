# BECA

BECA is a plant-driven music instrument built around an ESP32 device and a desktop control app.

## Download BECA 0.2.0

**App 0.2.0 and firmware 1.1.0 are available now** in the [official release](https://github.com/fattyrecordingco/BECAfirmware/releases/tag/setup-v0.2.0). Choose your computer below; these links download the installer directly.

| Computer | Download |
| --- | --- |
| Windows x64 | [BECA setup EXE](https://github.com/fattyrecordingco/BECAfirmware/releases/download/setup-v0.2.0/BECA_0.2.0_x64-setup.exe) · [MSI for managed installs](https://github.com/fattyrecordingco/BECAfirmware/releases/download/setup-v0.2.0/BECA_0.2.0_x64_en-US.msi) |
| macOS Apple Silicon (M-series) | [BECA Apple Silicon DMG](https://github.com/fattyrecordingco/BECAfirmware/releases/download/setup-v0.2.0/BECA_0.2.0_aarch64.dmg) |
| macOS Intel | [BECA Intel DMG](https://github.com/fattyrecordingco/BECAfirmware/releases/download/setup-v0.2.0/BECA_0.2.0_x64.dmg) |
| Linux x64 | [BECA AppImage](https://github.com/fattyrecordingco/BECAfirmware/releases/download/setup-v0.2.0/BECA_0.2.0_amd64.AppImage) · [Debian/Ubuntu DEB](https://github.com/fattyrecordingco/BECAfirmware/releases/download/setup-v0.2.0/BECA_0.2.0_amd64.deb) |

Every installer includes firmware 1.1.0. Connect BECA by USB, open **Setup**, select **Included 1.1.0 · works offline**, and press **install firmware**. Start with the [first-launch guide](docs/user/READ_BEFORE_FIRST_LAUNCH.md).

Separate downloads: [firmware 1.1.0 merged image](https://github.com/fattyrecordingco/BECAfirmware/releases/download/setup-v0.2.0/beca-1.1.0-merged.bin) · [firmware manifest](https://github.com/fattyrecordingco/BECAfirmware/releases/download/setup-v0.2.0/firmware-manifest.json) · [SHA256 checksums](https://github.com/fattyrecordingco/BECAfirmware/releases/download/setup-v0.2.0/SHA256SUMS).

This is the current public release. The Windows installer is unsigned and the Mac builds are not notarized; see the release notes for platform limitations. The 0.1.7 files under `installers/` are historical, and 0.2.0 downloads are hosted in Releases.

## Phone AUX controller

**[Open the BECA AUX Controller](https://fattyrecordingco.github.io/BECAfirmware/)** on an Android phone in Chrome or Edge, then connect BECA with a USB-C OTG/data cable. The installable web app uses the existing 115200-baud serial protocol to select AUX or Serial + AUX, shape the onboard synth, adjust plant/performance settings, monitor live activity, and send advanced console commands. After the first load, its application shell is available offline.

Direct browser USB serial is not available on iPhone or iPad. On Android, the app uses WebUSB to communicate with BECA's CH340/CH341 or CP210x bridge; desktop Chromium uses native Web Serial. Android requires a data-capable OTG cable, an explicit device permission, and the HTTPS published app opened directly in Chrome or Edge. Close USB terminal apps or the desktop BECA app before connecting because only one host can own the adapter. See the [complete phone setup, permission, compatibility, and troubleshooting guide](apps/beca-phone/README.md).

The phone controller is transport-limited and state-diff based: writes are coalesced and serialized below 20 per second, state/plant/note snapshots run at 2 Hz, synth reconciliation runs at 0.5 Hz, hidden pages pause polling, and console history is bounded. It introduces no firmware or BLE stack change. The firmware remains pinned to ESP32 Arduino core 2.0.14 and its existing library versions.

## Native Ableton instrument

**[Download BECA Instrument 0.1.0 for Ableton Live](https://github.com/fattyrecordingco/BECAfirmware/releases/download/instrument-v0.1.0/BECA-Instrument-0.1.0.zip)** · [Release notes and installation](https://github.com/fattyrecordingco/BECAfirmware/releases/tag/instrument-v0.1.0) · [SHA256 checksum](https://github.com/fattyrecordingco/BECAfirmware/releases/download/instrument-v0.1.0/SHA256SUMS). The ZIP contains the complete device folder; no source build is needed. Requires Max for Live and Max 8.6 or newer. Tested on Windows with Live 12.4.5; macOS and Live 11 runtime checks remain outstanding.

[BECA Instrument](ableton/instrument/README.md) adds stereo sound generation inside Live, the thirteen BECA soundscapes (Raw Sensor Sine needs hardware), native Live automation, saved timbre variations, plant monitoring and direct USB/Wi-Fi hardware controls. Play it with recorded MIDI clips, a keyboard or a connected BECA. It is a Max for Live instrument for Live 11/12 with Max for Live; firmware flashing and Wi-Fi provisioning stay in the desktop Setup app.

Build and install the complete device folder with `py -3 ableton/instrument/build_instrument.py --install`. The portable package is generated at `dist/ableton/BECA-Instrument-0.1.0.zip`. Native audio uses BECA's preset data and synthesis equations; hardware DACs and local percussion differ. The existing BECA Control MIDI effect remains available for controlling the unit while playing other instruments. See the instrument README for connection instructions, verification and limits.

## Wi-Fi MIDI preview (local development build)

Select **Wi-Fi MIDI** in Performance, Control, or the device's fallback page after saving a **2.4 GHz** personal/open Wi-Fi network in Setup. BECA and the computer must be on a network that allows local clients to communicate. The new output sends the same generated MIDI notes, velocities, channels, percussion and control changes as Serial MIDI using **AppleMIDI / RTP-MIDI** over UDP. It sends MIDI events, not audio or the serial `@M` text framing. BLE, Serial, Aux and Serial + Aux keep their existing numeric IDs (0–3); Wi-Fi MIDI is 4. The USB MIDI bridge is not needed for this output.

**Find/register the device:** Setup displays its **Wi-Fi MAC**. The station address is also `sta_mac` in `/info` and serial `@C WIFI_INFO`; `ap_mac` identifies the separate setup access point. Use the station address for router/device registration. The network MIDI session name is stable and unique for normal deployments: `BECA-` followed by the final six MAC digits (for example `BECA-288290`). It is independent of the editable web hostname. Status in `/info` / `WIFI_INFO` includes `wifi_connected`, `wifi_midi_name`, `wifi_midi_port`, `wifi_midi_listening`, and `wifi_midi_connected`.

Connect the instrument on the computer:

1. **Windows:** install/configure [rtpMIDI](https://www.tobias-erichsen.de/software/rtpmidi/rtpmidi-tutorial.html), create and enable a local session, then connect the advertised BECA in its directory. Name the local session after that instrument so it is easy to select in your DAW. rtpMIDI is a separate installation, not bundled in BECA.
2. **macOS:** open [Audio MIDI Setup → MIDI Studio → Configure Network Driver](https://support.apple.com/guide/audio-midi-setup/share-midi-information-over-a-network-ams1012/mac), enable a session, select BECA in the directory and connect.
3. Enable that session's MIDI input in the DAW and route it to an instrument. For several BECAs, connect each to a separate computer session/MIDI port and DAW track to keep their notes separate. Each BECA accepts one peer session in this preview.

Enable **DAW Sync** and send MIDI Clock plus Start/Stop/Continue through the computer's session output to make BECA follow that clock. While Wi-Fi MIDI is selected, BLE clock is ignored to avoid two clock sources. MIDI Thru on the network transport is disabled. All units can follow the same DAW; direct peer discovery/initiator connections, autonomous leader election and clock generation between BECAs are future work. This preview operates on the local network; remote internet routing, encryption and authentication are not implemented. It does not promise sample-accurate synchronisation: Wi-Fi adds jitter, and received clock messages are processed on arrival.

**Recovery and troubleshooting:** the session starts only with a station IP and Wi-Fi MIDI selected; the setup access point alone does not start it. Discovery uses `_apple-midi._udp`; if multicast discovery is blocked, add BECA's current IP and control port **5004** manually. UDP **5005** carries MIDI/synchronisation. Guest/managed networks can block client-to-client traffic even after MAC registration. ASK4 802.1x login still needs enterprise identity/certificate support; use the provider's compatible registered-device network or a personal 2.4 GHz network. No enterprise support is added by this preview.

On Wi-Fi loss, IP change or leaving Wi-Fi MIDI, BECA closes and resets the session, drops stale buffered notes and clock state, and offers a fresh session once connected. The host may need to reconnect in its network MIDI panel. All Notes Off is sent before orderly shutdown and after a new connection. UDP cannot guarantee delivery of note-offs during loss; use the DAW's panic/All Notes Off if a remote instrument sustains a note. The serial protocol and setup recovery remain available.

**Build and verification:** ESP32 Arduino **2.0.14**, BLE-MIDI **2.2**, MIDI Library **5.0.2**, NimBLE-Arduino **1.4.3**, FastLED **3.10.3**, and the additional pinned [AppleMIDI **3.5.0**](https://github.com/lathoub/Arduino-AppleMIDI-Library/tree/v3.5.0). In Arduino IDE install these versions and open the full sketch; the thin PlatformIO wrappers remain unchanged. `BECA_WIFI_MIDI=0` compiles out the new transport; `BECA_DUAL_OUTPUT=0` also remains supported. No new SSE stream or polling timer is introduced. UI output choices use capability/state differences; existing 85 ms fallback write coalescing, 20 writes/s desktop control limit and existing telemetry throttles remain. Rebuild `index_html.h` with `python3 make_index_header.py` after embedded-page edits.

Use `./tools/build_firmware.ps1 -UploadPort COM4` to build/flash, `python tools/verify_device.py COM4` for existing protocol/plant checks, and `python tools/verify_wifi_midi.py COM4 --host DEVICE_IP` for the network handshake/clock checks. The latter temporarily changes output/clock/mute settings and restores them. It requires a reachable station IP; without `--host`, it checks capabilities/MAC and safe switching only. Actual DAW interoperability, musical latency and multiple physical units require a network and those devices. This development build does not replace the published stable download or bundled firmware 1.1.0.

## Overview

The current product workflow is desktop-first:
- use the BECA app to flash firmware
- save Wi-Fi credentials
- run the Serial MIDI bridge when needed
- monitor plant activity and MIDI notes
- control the device from the live Control view

The old browser page on the device is now a fallback and recovery path, not the primary user interface.

## Release 0.2.0 — first installation and music workflow

Start with the [full manual and first-unit quick start](docs/user/BECA_MANUAL.md), also bundled inside Setup and available as [standalone HTML](docs/user/BECA_MANUAL.html). A blank unit can be flashed offline using the included firmware 1.1.0. Bootloader, partition table and boot data are included; the app verifies SHA256 and skips the settings partition. WebView2/USB driver installation may still need internet on a new Windows computer.

**MIDI routing is in Setup only.** Splits persist and can start automatically on app launch/USB connection. Stop suspends reconnection for the current session; the automatic-connection checkbox persists across launches. Missing destinations are never silently replaced. MIDI status polls every 2 seconds, idle output discovery every 5 seconds and USB enumeration every 3 seconds; requests do not overlap and unchanged state does not rerender the editor. Draft fields remain protected during polling.

Mac/Linux can create a native **BECA (virtual MIDI)** source using the existing MIDI library. Windows needs a configured virtual MIDI cable such as a loopMIDI port named BECA. The CH340/CP210x USB hardware does not enumerate as class-compliant MIDI. Commercial driver redistribution and production signing need publisher licensing/credentials. See the manual before shipping units or claiming a fully driverless setup.

## Performance and recovery

The desktop **Performance** view exposes the musical, synth, timing, LED controls in six open groups, with a separate MIDI percussion section. Sliders send while moving, with latest-value coalescing, serialized requests, state differences and a 20-write/second ceiling. Changes to multiple controls are sequential, not an atomic scene. State snapshots run at 500 ms and synth reconciliation at 2 seconds while visible; active edits are protected from stale responses. Switching from Control disposes its stream.

AUX adds **Dewdrop Glass, Moon Garden, Moss Bells, Firefly Pluck, Bubble Reed, Pollen Drift**, and **Raw Sensor Sine**, preserving existing preset indices. These are synthesized textures; pads suit longer note lengths. Raw Sensor Sine maps ADC1 directly to Hz (440 → 440 Hz), bypassing scale, sensitivity, tempo, envelopes, filters, detune, drums and effects. Master volume and short amplitude fades apply. Phase is preserved with no pitch glide; zero/reported disconnect becomes silent. Sampling normally runs every 8 ms and audio blocks are 128 samples at 44.1 kHz, plus DMA/scheduling latency. ADC counts are a sonification mapping, not an acoustic recording. Plant jack detection remains disabled by default, so unplugged electrodes may not be identified.

The **local diagnostic assistant** checks freshness, frozen timestamps when supplied, invalid values, ADC rails and recent variation. Failed reads retry after 2/5/15/30 seconds, then pause for Reconnect. Failed parameter writes are not replayed. This uses deterministic local rules, not a trained AI or plant-health diagnosis. It does not alter sensitivity, credentials or firmware automatically. Quiet does not mean unhealthy.

Firmware now retries saved Wi-Fi after a failed startup without blocking the loop, retaining the setup AP until recovery. It permits five attempts per boot with increasing intervals and pauses early on authentication failure. Successful recovery closes the AP. Existing station reconnect and USB fallback remain. Recovery never erases credentials or repeatedly reboots. No software can guarantee every error will never recur; regression checks cover the implemented fixes.

Feature flags: `BECA_EXTENDED_SOUNDS=0` restores six presets; `BECA_AUTO_RECOVERY=0` disables added startup Wi-Fi retries (both default to 1). Frontend `VITE_BECA_PERFORMANCE_PAGE=false` omits Performance. Core 2.0.14 and BLE libraries are unchanged. Live audio fixes cover repeated master loss at high drive, held envelope edits, bounded voice allocation/retirement and audio-task ownership of drum-kit updates. A gain lookup removes per-sample square roots.

Research and remaining priorities: [firmware review](docs/research/firmware-review.md), [original Ableton instrument plan](docs/research/ableton-instrument-plan.md). The native instrument is now implemented in [ableton/instrument](ableton/instrument/README.md).

### Playable Performance interface

Performance now has an instrument deck using BECA's green/white palette, existing logo, fixed eight-leaf motif and typography, without decorative gradients. The leaf meter and recent 24-second scope show measured plant energy; note chips show observed MIDI, not an audio waveform or a simulated performance. The pinned live strip keeps volume, tempo, output mode and mute available while scrolling. **Focus controls** brings the six open parameter groups forward; **Sound playground** returns to exploration.

- **XY expression:** Tone / bite controls logarithmic cutoff and resonance; Space / echo controls delay time and mix; Drift / grit controls detune and drive. Pointer capture supports drags outside the pad, arrow keys adjust it, and Shift makes smaller moves. The pad is inactive for Raw Sensor Sine because that mode bypasses these parameters.
- **Mutate sound:** a depth slider controls bounded timbre exploration. Tempo, key, sensitivity, routing, mute and master volume remain under the performer's control. **Undo gesture** restores the timbre before the last pad gesture, mutation or variation recall. Switching presets clears that undo point.
- **Pocket variations A–D:** Save captures all sound parameters after pending edits have been acknowledged. Recall restores timbre without altering master volume or musical transport. Slots persist on this computer, validate stored values, and exclude credentials and connection settings. Replace explicitly overwrites a slot. Raw sine stays separate from timbre variations.
- **Precise controls:** enter a number and press Enter, Escape cancels an unfinished entry, Shift + arrows adjusts a slider by one step, and double-click resets a slider to its loaded value. Unfocused **M** toggles mute; **1–4** recall saved variations. Shortcuts do not intercept typing in controls.
- **Live presets:** `BECA_LIVE_PRESETS=1` (default) advertises `live_preset: true` in `/api/params` and accepts `preset_live` through `/api/set` or serial `SET`. This publishes the new preset with the existing master volume in one synth parameter update. Legacy `preset` behavior stays compatible; apps on older firmware use that supported command and explain that its factory volume applies. `BECA_LIVE_PRESETS=0` omits the new command/capability.

The deck adds no network stream or rendering loop. Parameter feedback is coalesced into animation frames, signal history is bounded, and unchanged text/values are retained. Existing serialized writes remain capped at 20/s, snapshots at 500 ms and synth reconciliation at 2 s. Muting takes priority over queued timbre changes after the current request completes. Multi-parameter gestures and variation recall still travel as sequential commands; this is not sample-accurate DAW automation. Reduced-motion preferences suppress transitions. Disconnects disable the pad, numeric controls and actions until fresh state returns.

See [interaction design and verification](docs/research/performance-interaction.md). Run `python tools/verify_device.py COM4 --exercise-live-presets` to verify all live presets preserve master level while muted and restore the original settings afterward.

### Connection troubleshooting and checks

On Windows, `./tools/build_firmware.ps1` uses PlatformIO Core 6.2.0 in a project-local Python environment and a private package cache under `%LOCALAPPDATA%/BECA-build`. Its short path avoids Xtensa include-path limits in deep OneDrive folders. Use `./tools/build_firmware.ps1 -UploadPort COM4` to build and flash the selected device. This also avoids different IDE/Core versions replacing shared SCons files during a build; ESP32 core remains pinned to 2.0.14. `python tools/verify_device.py COM4` checks the live protocol/data; add `--exercise-audio` to temporarily test AUX presets and restore settings afterward.

Additional regression fixes preserve tempo across swung step pairs, let each embedded drum envelope finish its decay, and reject nonfinite DSP values. The existing AUX drum guard remains enabled. MIDI note-offs now retain their queue entry until serial transmission succeeds, and a Note On reserves its release entry first. SSE's last-sent snapshot still needs a dedicated transport pass.

- ASK4 Wireless (802.1x) uses PEAP enterprise authentication. The current SSID/password form supports personal networks; enterprise setup needs a login identity and trusted certificate settings. Do not repeatedly submit enterprise credentials through this form. BECA sees the local ASK4 enterprise broadcast on 2.4 GHz, but cannot use 5 GHz-only networks.
- Managed Wi-Fi may require device registration or isolate local clients. USB remains available for diagnosis. After recovery pauses, correct the network settings and use Reconnect.
- In `apps/beca-setup`, run `node --test scripts/health-check.mjs` and `npm run test:ui`. See [audio regression checks](tests/audio/README.md). Compile firmware using `platformio run`.

## Published Release Baseline

- app: `setup-v0.2.0`
- firmware release tag: `setup-v0.2.0 (firmware 1.1.0)`
- primary branch for release-ready source: `master`
- firmware build target: ESP32 Arduino core `2.0.14`

## What BECA Includes

- BECA device firmware in [BECAfinalsv02.ino](./BECAfinalsv02.ino)
- BECA desktop app in [apps/beca-setup](./apps/beca-setup)
- Android USB-C web controller in [apps/beca-phone](./apps/beca-phone)
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

BECA is open source under the [MIT License](./LICENSE). The open-source license lets the code be shared and built publicly; it is separate from Windows code-signing and Apple Developer ID certificates.

Start here:

1. Read the full [BECA First Launch Guide](./docs/user/READ_BEFORE_FIRST_LAUNCH.md).
2. Choose your computer in [Download BECA 0.2.0](#download-beca-020).
3. Download the installer for your computer.
4. Install BECA.
5. Restart if a USB serial driver was installed or updated.
6. Open BECA, connect the device by USB, then install `Included 1.1.0 · works offline` from Setup.

Signing status: the current Windows installer is unsigned and Mac builds are not notarized. Publishing a GitHub release does not add platform signing trust. Do not disable OS security protections to run BECA; signing and notarization remain publisher work.

The app can flash the newest stable firmware from the release manifest. A source checkout is only needed for development or manual PlatformIO flashing.

## License

BECA is released under the [MIT License](./LICENSE).

## First-Time Setup In The App

### 1. Connect BECA

On the `Setup` screen:
1. connect the device by USB
2. click `rescan device`
3. confirm the status box changes from not connected to a detected device

### 2. Flash Firmware

1. select `Included 1.1.0 · works offline` in `upload firmware`
2. click `install firmware`
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
5. use `send test note` before starting the bridge; use the plant while it is live

Bridge rules:
- the bridge owns the serial port while running
- stop the bridge before Wi-Fi setup or any direct serial maintenance
- MIDI and live USB controls share one persistent native serial connection. Wi-Fi control remains available when connected. Stop separate CLI bridges or Serial Monitor before starting the app bridge.
- the app now reflects bridge state on launch, so it should not come up lying about whether bridge is running
- the app now stops the bridge automatically when the desktop window exits
- the last bridge routing and MicroFreak toggle choices are restored on the next launch

Live stability rules:
- the desktop app now reuses its live control HTTP client instead of rebuilding it on every request
- live snapshots are cached briefly and refreshed at a tighter rate; the fallback path uses one `/api/live` snapshot instead of a four-request snapshot cycle
- desktop Wi-Fi discovery now treats a valid BECA `/api/info` response as enough to keep Wi-Fi Live Control eligible while Bridge owns USB
- desktop Wi-Fi discovery also probes the current device-name `.local` address and prefers a ready Wi-Fi target over a USB target that Bridge is occupying
- desktop Wi-Fi Live Control now prefers the firmware `/events` SSE stream for plant, MIDI, drum, and state updates; HTTP snapshots stay as a fallback/status check instead of the primary monitor path
- desktop and browser controls coalesce rapid encoder/range changes and apply returned state immediately, so the device mirrors live adjustments without flooding the ESP32 web server
- the device-hosted browser UI closes an unhealthy SSE stream and falls back to `/api/live` polling, so the page stays live without browser reconnect churn
- Serial MIDI output now requires the BECA bridge heartbeat or recent serial control input before streaming `@M` packets; this keeps an idle/unread COM port from starving Wi-Fi control, while the official bridge keeps Serial MIDI active during performance use
- if Wi-Fi or serial control stalls for a moment, the app keeps the last good live frame while it reconnects instead of dropping immediately into a dead-looking monitor
- the control page now defaults back to `Setup` until a live target is actually ready
- the firmware SSE stream sends lightweight keepalives, allows the desktop app to subscribe over Wi-Fi, pushes a full state frame on connect, and drops blocked clients so stale browser sockets reconnect instead of wedging the main loop

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
- `Clock: Plant` now disables the internal sequencer tick and only emits from real plant trigger edges
- in plant-clock mode, random rest chance and no-repeat substitution are ignored so monitor/output notes stay tied to measured plant input
- MIDI monitor notes now use a short UI-only hold window, so fast internal-clock notes and drum hits appear even when the musical gate is shorter than the app poll interval
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
- on Windows, reopening BECA now clears a leftover `beca-bridge.exe` from a previous session before rediscovery
- reconnect the device and let the app rediscover the best control transport
- if the bridge shows connected but Windows moved the board to a new COM port, disconnect bridge, click `rescan device`, then reconnect bridge
- avoid opening the browser UI, desktop Control view, and Max for Live control surface at the same time on the same BECA; use one live control surface plus the serial MIDI bridge

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

The PlatformIO target uses [tools/platformio_post_upload_reset.py](./tools/platformio_post_upload_reset.py) to briefly reopen the serial port after flashing. This mirrors opening Serial Monitor on CH340 ESP32 boards that run the sketch after upload but do not bring Wi-Fi/HTTP back cleanly until the USB serial lines are released.

## Release Workflow

### Desktop release

The local Windows packaging path is:

```bash
platformio run
cd apps/beca-setup
npm run release:windows
```

That workflow:
- syncs the current firmware binary into the app bundle
- builds the BECA desktop app
- refreshes [installers/windows](./installers/windows)

The cross-platform release path is the GitHub `Build Setup Installer` workflow triggered by `setup-v*`; it builds firmware and Windows, macOS, and Linux bundles, then publishes installers, firmware, manuals and checksums as GitHub Release assets after all builds pass. It does not update the historical binaries under [installers](./installers). Keep the download links above pointed at the published release assets.

Release signing, notarization, checksum, and malware-scan commands are in [docs/RELEASE_SECURITY.md](./docs/RELEASE_SECURITY.md).

### Versioning

- desktop app version lives in:
  - [apps/beca-setup/package.json](./apps/beca-setup/package.json)
  - [apps/beca-setup/src-tauri/Cargo.toml](./apps/beca-setup/src-tauri/Cargo.toml)
  - [apps/beca-setup/src-tauri/tauri.conf.json](./apps/beca-setup/src-tauri/tauri.conf.json)
- standalone firmware release tags use `firmware-v*`
- combined desktop/firmware release tags use `setup-v*` (0.2.0 includes firmware 1.1.0)

## Repo Map

- [BECAfinalsv02.ino](./BECAfinalsv02.ino): main firmware sketch
- [platformio.ini](./platformio.ini): firmware build environment pinned to ESP32 core `2.0.14`
- [apps/beca-setup](./apps/beca-setup): desktop app
- [apps/beca-phone](./apps/beca-phone): installable Android USB-C AUX controller
- [apps/beca-setup/ui/control.html](./apps/beca-setup/ui/control.html): live control surface
- [apps/beca-setup/ui/index.html](./apps/beca-setup/ui/index.html): setup workspace shell
- [tools/bridge](./tools/bridge): native MIDI bridge
- [tools/flasher](./tools/flasher): flash and backup helpers
- [installers](./installers): current download links and historical installer copies
- [ableton](./ableton): optional Ableton Live and Max for Live support files
- [docs](./docs): architecture notes that support this README

## Notes For Maintainers

- keep BLE MIDI stable
- keep control transport diff-based and lightweight
- do not reintroduce the old mock control surface behavior
- keep repo cleanup conservative around Arduino/PlatformIO compatibility shims
- if setup or control behavior changes, update this README in the same change
- if you touch the device web fallback `index.html`, regenerate `index_html.h`


## Live splits, combined output and device lights

Choose **Serial MIDI + Aux** in Performance or Control to hear BECA's synth through the device while sending melodic MIDI to the computer. Starting the app bridge preserves an active Aux path by choosing this combined mode. Existing modes keep their values: BLE=0, Serial=1, Aux=2, combined=3. Aux keeps its startup cooldown; on reboot the firmware begins in MIDI until Aux is selected again.

Open **Setup > MIDI routing**. Add up to eight splits, choose each destination, input channel (All or 1-16), output channel (Keep or 1-16), inclusive source note range (0-127), and transpose (-48 to +48). Ranges apply before transposition; out-of-range transposed notes are dropped. Splits may layer the same notes or divide the keyboard. Channel controls and pitch bend follow the input-channel filter, independently of note ranges; use separate output channels for independent instruments. MicroFreak mode removes channel-10 percussion and maps melodic notes to channel 1 unless an explicit output channel overrides it.

**Apply splits** validates and updates the running bridge without reopening USB. Newly needed MIDI ports must open successfully before the previous routing is replaced. Held notes are released during changes, stopping, or detected USB loss. **Release MIDI notes** clears routed notes; Aux continues separately. Draft edits survive status refreshes. Applied splits are saved locally and the bridge starts only when requested. If a MIDI destination disappears, refresh outputs and select an available destination; the bridge reports the failure instead of silently selecting another instrument.

**MIDI drums** has its own channel-10 part switches. Use Drums playing mode or a rhythm mode that generates percussion, and route channel 10 to a drum instrument. Aux has no enabled drum engine, so the ineffective drum-kit selector is removed and this section is hidden in Aux-only mode. Combined mode can send percussion over MIDI; its Aux engine continues to synthesize melodic parts.

**Device lights** uses the firmware's actual effect and palette names. The selected animation now runs when encoder information is idle. Turning the physical encoder still shows its setting/volume feedback; changing light settings in Performance immediately returns to the effect. All ten effects retain a small ambient brightness at low plant energy. Logical LED frames are available on demand through `@C LEDS` for diagnostics; no extra LED stream is broadcast.

Feature flags: `BECA_DUAL_OUTPUT=0` removes combined output; `BECA_IDLE_LIGHT_EFFECTS=0` restores persistent encoder-status LEDs. Both default to 1. The core remains 2.0.14 with BLE-MIDI 2.2.0, MIDI Library 5.0.2 and NimBLE-Arduino 1.4.3. No BLE library change is required.

Control writes remain coalesced and serialized at at most 20 per second; snapshots run at 2 Hz and synth reconciliation at 0.5 Hz. Bridge status polls at 0.5 Hz while the app is running, so saved routing can connect even while the DAW is foreground; activity events are capped at 2 Hz. The USB worker frames partial reads, keeps MIDI flowing during command replies, bounds queues, cancels disconnected/expired requests, and retries a verified USB handshake. This is soft real-time control, not a sample-accurate DAW automation clock. Details and test evidence: [live routing verification](docs/research/live-routing-verification.md).
