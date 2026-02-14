# BECA Firmware User Manual

BECA is a plant-played instrument on ESP32 that outputs MIDI and drives LEDs from plant bio-capacitive input.

This firmware version supports:

- BLE MIDI output (`BECA BLE-MIDI`)
- Serial MIDI output (bridged to DAWs)
- AUX OUT onboard synth + drum engine over I2S (PCM5102A)
- Web UI control with Wi-Fi setup portal and live status

## 1) What Is New In This Patch

- New bottom-bar 3-state `Output Mode`: `BLE` | `SERIAL` | `AUX OUT`
- New `SYNTH` panel in Web UI (shown only in `AUX OUT` mode)
- Expanded AUX synth preset bank to 18 presets (includes mellow pads/keys/plucks)
- New presets 10-17 retuned for cleaner headroom (less detune, less clipping risk)
- `Mute I/O` is now firmware-enforced global mute (`/api/mute`), not just UI-local
- Better Wi-Fi setup flow (captive redirect + plain-language connection errors)
- Serial MIDI bridge tools in `tools/beca_link/`

## 2) Compatibility Baseline

- ESP32 Arduino core target: `2.0.14`
- Libraries in this project:
- `lathoub/BLE-MIDI@2.2`
- `h2zero/NimBLE-Arduino@1.4.3`
- `fortyseveneffects/MIDI Library@5.0.2`
- `fastled/FastLED@3.10.3`

## 3) Required Software + Official Links

Core tools:

- Arduino IDE 2.x: https://www.arduino.cc/en/software
- PlatformIO (VS Code extension): https://platformio.org/platformio-ide
- PlatformIO Core CLI: https://docs.platformio.org/en/latest/core/installation/index.html
- ESP32 Arduino core install docs: https://docs.espressif.com/projects/arduino-esp32/en/latest/installing.html
- Python (for helper scripts/bridge): https://www.python.org/downloads/
- Git: https://git-scm.com/downloads

MIDI/DAW helpers:

- loopMIDI (Windows): https://www.tobias-erichsen.de/software/loopmidi.html
- LoopBe1 (Windows alternative): https://www.nerds.de/en/loopbe1.html
- Ableton MIDI port setup: https://help.ableton.com/hc/en-us/articles/209774205-Live-s-MIDI-ports

USB serial drivers (install only the one matching your USB-UART chip):

- Silicon Labs CP210x: https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers
- WCH CH340/CH341: https://www.wch-ic.com/downloads/CH341SER_EXE.html
- FTDI VCP: https://ftdichip.com/drivers/vcp-drivers/

Notes:

- Most BECA boards appear as `CP210x` or `CH340/CH341`.
- On Windows, check Device Manager -> Ports (COM & LPT) to identify the chipset before installing a driver.
- Use official vendor pages only.

## 4) How To Install This Patch Update

This repo now contains the Onboard-Synth patch merged into `master`.

### 4.1 Update your local project to patched `master`

If you already cloned this repo:

```bash
git checkout master
git pull origin master
```

Or download the latest `master` ZIP from your repo host and extract it to a clean folder.

### 4.2 Flash with PlatformIO (recommended)

1. Open this project folder in VS Code or terminal.
2. Confirm `platformio.ini` includes:
- `platform_packages = platformio/framework-arduinoespressif32@3.20014.231204` (Arduino core `2.0.14`)
- Correct `upload_port` / `monitor_port` for your board (example: `COM5`)
3. Run a clean build:
```bash
pio run -t clean
pio run
```
4. Upload firmware:
```bash
pio run -t upload
```
5. Power-cycle BECA after upload.

### 4.3 Flash with Arduino IDE

1. Open `BECAfinalsv02.ino`.
2. Install ESP32 boards package `2.0.14` (Boards Manager: `esp32 by Espressif Systems`).
3. Install required libraries (section 2 versions).
4. Select a compatible board target (for example, `ESP32 Dev Module`).
5. Select the correct COM port.
6. Upload and power-cycle BECA.

### 4.4 Post-flash sanity check

1. Confirm BLE advertisement name `BECA BLE-MIDI`.
2. Open BECA Web UI and verify `Output Mode` options: `BLE`, `SERIAL`, `AUX OUT`.
3. Toggle `Mute I/O` once to confirm global mute behavior.

## 5) First-Time BECA Setup (Wi-Fi + UI)

1. Power ON BECA.
2. Join AP: `BECA-xxxx`.
3. Setup page should auto-open. If not, open: `http://192.168.4.1/setup`
4. Enter:
- Device name
- Wi-Fi SSID
- Wi-Fi password
5. Press `Save and Connect`.
6. If success, BECA reboots to normal mode.
7. Open BECA UI via:
- `http://<device-ip>/`
- or `http://<device-name>.local/` (if your system resolves mDNS)

## 6) BLE MIDI Setup (Simple Path)

1. Keep `Output Mode` set to `BLE` in BECA UI.
2. Open your host app/DAW BLE MIDI connection panel.
3. Connect to `BECA BLE-MIDI`.
4. In DAW, enable that MIDI input and arm a MIDI track.

## 7) Serial MIDI Setup (Windows, Recommended Workflow)

Important confirmed behavior:

- Start with `Output Mode = BLE`.
- Start the bridge first.
- Then switch `Output Mode` to `SERIAL`.

This order avoids startup port/state conflicts on some systems.

### 7.1 Install once

1. Install Python.
2. Install one loopback MIDI tool:
- `loopMIDI` preferred, or
- `LoopBe1` alternative.
3. In loopMIDI, create a port named `BECA Serial MIDI` (or use existing LoopBe port).

### 7.2 Start bridge

From project root:

```bat
tools\beca_link\start_windows.bat
```

What this script does:

- Lists serial ports
- Lists MIDI ports visible to Python
- Starts bridge in foreground with logs

If you want forced LoopBe port test:

```bat
tools\beca_link\start_windows_loopbe.bat
```

### 7.3 Then switch BECA to Serial

After bridge is running:

1. Open BECA UI.
2. Set `Output Mode` to `SERIAL`.
3. In Ableton:
- Preferences -> Link, Tempo, MIDI
- Enable `Track` for the selected loopback input
- Select that input on MIDI track (`MIDI From`)

## 8) Serial MIDI Setup (macOS/Linux)

1. Start with `Output Mode = BLE`.
2. Start bridge:
```bash
cd tools/beca_link
chmod +x start_mac_linux.sh
./start_mac_linux.sh
```
3. Switch BECA UI to `SERIAL`.
4. In DAW, select bridge output MIDI port.

## 9) Critical Operating Rules

- Do not run a serial monitor and the bridge on the same COM port at the same time.
- On Windows, if bridge shows `Access is denied` for COM port, another app owns that port.
- Keep bridge terminal open while using Serial MIDI.
- If using BLE mode only, bridge is not required.
- In `AUX OUT` mode, BECA does not emit MIDI note events (BLE or Serial).
- When `Mute I/O` is ON, BECA force-silences AUX and blocks outgoing MIDI until unmuted.

## 10) AUX OUT Wiring + Test

PCM5102A default I2S wiring:

- `BCK` -> `GPIO26`
- `LRCK/WS` -> `GPIO27`
- `DIN` -> `GPIO25`

Audio path:

- PCM5102A analog outputs -> powered speakers/headphones.

Quick test flow:

1. In BECA UI, set `Output Mode` to `AUX OUT`.
2. Open `/api/synth/test` in browser (or use Synth panel test button).
3. Confirm a short 2-second tone/chord plays.
4. Switch to `BLE` or `SERIAL` and confirm onboard audio is silent.
5. Confirm plant activity triggers synth/drums only in `AUX OUT`.

## 11) Troubleshooting (Self-Service)

### A) Bridge terminal closes immediately

Cause:

- Old launcher behavior or startup error.

Fix:

- Use current `tools\beca_link\start_windows.bat` (foreground mode with pause and logs).

### B) `Access is denied` on COM port

Cause:

- Port is locked by another process (PlatformIO monitor, Arduino Serial Monitor, another bridge window).

Fix:

1. Close Arduino Serial Monitor / PlatformIO monitor.
2. Close any old bridge windows.
3. Unplug/replug USB cable.
4. Start bridge again.

### C) loopMIDI port not visible in bridge output list

Cause:

- Port is not available to Python MIDI backend in current Windows session.

Fix:

1. Keep loopMIDI running.
2. Recreate the port.
3. Re-run:
```bat
python tools/beca_link/beca_link.py --midi-list
```
4. If still not visible, use LoopBe1 or use visible port name shown by `--midi-list`.

### D) Ableton does not show the bridge port

Fix:

1. In Ableton Preferences -> Link, Tempo, MIDI, enable `Track` for that input port.
2. Re-open Ableton after starting loopback tool and bridge.
3. Confirm bridge is receiving BECA data (watch bridge log counters).

### E) No notes in DAW after switching to Serial

Fix checklist:

1. Bridge running first.
2. Then set BECA `Output Mode` to `SERIAL`.
3. DAW track armed and MIDI input selected.
4. No COM lock errors in bridge terminal.

### F) BLE not connecting

Fix:

1. Set `Output Mode` to `BLE`.
2. Power-cycle BECA.
3. Reconnect from host BLE MIDI panel.

### G) Wi-Fi setup fails

Use setup page messages:

- Wrong password -> re-enter password
- Network not found -> use 2.4 GHz Wi-Fi
- Connected but no IP -> router DHCP issue, reboot router/hotspot and retry

## 12) Developer Notes

- Main firmware: `BECAfinalsv02.ino`
- UI source: `index.html`
- Generated UI header: `index_html.h`
- Regenerate after UI edit:
```bash
python make_index_header.py
```
- Serial bridge tools: `tools/beca_link/`
- Faust setup helpers:
  - `tools/faust_setup_windows.ps1`
  - `tools/faust_setup_macos.sh`
  - `tools/faust_setup_linux.sh`

