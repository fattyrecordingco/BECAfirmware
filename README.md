# BECA Firmware: Complete User Manual

This guide is written for first-time and non-technical users.
Follow it top-to-bottom to install, flash, and use BECA successfully.

## 1) What BECA Does

BECA is an ESP32 firmware that turns plant input into musical output with a web interface.

It supports:
- `BLE` MIDI output (`BECA BLE-MIDI`)
- `SERIAL` MIDI output (to DAWs using the included bridge tool)
- `AUX OUT` onboard synth + drums over I2S (PCM5102A DAC)
- Wi-Fi setup portal + browser UI + live status

## 2) Required Versions (Important)

Use these exact versions for reliable flashing and runtime behavior:

- ESP32 Arduino core: `2.0.14`
- `lathoub/BLE-MIDI@2.2`
- `h2zero/NimBLE-Arduino@1.4.3`
- `fortyseveneffects/MIDI Library@5.0.2`
- `fastled/FastLED@3.10.3`

PlatformIO in this project is pinned to Arduino core `2.0.14` via:
- `platformio/framework-arduinoespressif32@3.20014.231204`

## 3) What You Need Before Flashing

Hardware:
- BECA (ESP32-based board)
- USB data cable (not charge-only)
- Computer (Windows/macOS/Linux)
- Optional for `AUX OUT`: PCM5102A DAC + speakers/headphones

Software:
- Arduino IDE 2.x: https://www.arduino.cc/en/software
- PlatformIO (optional): https://platformio.org/platformio-ide
- Python 3 (for Serial MIDI bridge): https://www.python.org/downloads/
- Git (optional): https://git-scm.com/downloads

USB serial driver (install the one matching your board):
- CP210x: https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers
- CH340/CH341: https://www.wch-ic.com/downloads/CH341SER_EXE.html
- FTDI: https://ftdichip.com/drivers/vcp-drivers/

Windows tip:
- Open Device Manager -> `Ports (COM & LPT)` to see your USB chip and COM port.

## 4) Download the Firmware Project

Choose one:

1. Download ZIP from your repository host, then extract it.
2. Clone with Git:

```bash
git clone <your-repo-url>
cd BECAfinalsv02
```

You should see `BECAfinalsv02.ino` in the project root.

## 5) Flash Method A (Recommended): Arduino IDE

This is the easiest method for most users.

### Step 1: Open the firmware

1. Open Arduino IDE.
2. Click `File` -> `Open...`.
3. Select `BECAfinalsv02.ino`.

### Step 2: Install ESP32 board package version `2.0.14`

1. In Arduino IDE, go to `Tools` -> `Board` -> `Boards Manager...`.
2. Search for `esp32 by Espressif Systems`.
3. Select version `2.0.14`.
4. Click `Install`.

If Arduino asks for an Additional Boards URL, use:
- `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`

### Step 3: Install required libraries

In Arduino IDE: `Tools` -> `Manage Libraries...` and install these exact versions:

- `BLE-MIDI` by lathoub, version `2.2`
- `MIDI Library` by Forty Seven Effects, version `5.0.2`
- `NimBLE-Arduino` by h2zero, version `1.4.3`
- `FastLED` by fastled, version `3.10.3`

### Step 4: Select board and COM port

1. `Tools` -> `Board` -> `ESP32 Arduino` -> `ESP32 Dev Module`.
2. `Tools` -> `Port` -> select your BECA COM port.

If no port appears:
- Install the correct USB driver.
- Try another USB cable (must support data).
- Try another USB port.

### Step 5: Upload firmware

1. Click the `Upload` arrow in Arduino IDE.
2. Wait until upload finishes.
3. Power-cycle BECA (unplug and plug back in).

If upload fails with connection errors:
- Hold the board `BOOT` button while upload starts.
- Release after the progress bar begins moving.

### Step 6: Basic post-flash check

After reboot:
- BLE name should appear as `BECA BLE-MIDI`.
- BECA should start a setup Wi-Fi AP if Wi-Fi is not configured.

## 6) Flash Method B (Optional): PlatformIO

Use this if you are comfortable with VS Code/CLI.

1. Open project folder in VS Code with PlatformIO extension.
2. Edit `platformio.ini` and set correct `upload_port` and `monitor_port` for your system.
3. Build:

```bash
pio run -t clean
pio run
```

4. Upload:

```bash
pio run -t upload
```

5. Power-cycle BECA.

## 7) First-Time Wi-Fi Setup and UI Access

On first boot (or after forgetting Wi-Fi), BECA enters setup mode.

1. On your phone/laptop, connect to Wi-Fi network: `BECA-XXXX`.
2. Setup page should open automatically.
3. If it does not open, visit `http://192.168.4.1/setup`.
4. Enter:
- Device name (for `.local`, example `beca-1234`)
- Home Wi-Fi SSID
- Wi-Fi password
5. Click `Save and Connect`.
6. Wait for reboot.
7. Open BECA UI using either:
- `http://<device-ip>/`
- `http://<device-name>.local/`

Important:
- Use `2.4 GHz` Wi-Fi (ESP32 requirement).
- If connection fails, BECA stays in setup mode so you can retry.

## 8) Everyday Use: Output Modes

Open the BECA web UI and choose output mode from the bottom bar.

- `BLE`: Sends MIDI over Bluetooth Low Energy.
- `SERIAL`: Sends MIDI over USB serial (requires bridge script for DAWs).
- `AUX OUT`: Plays onboard synth/drums through PCM5102A DAC.

Notes:
- In `AUX OUT`, BECA does not output note MIDI events over BLE/Serial.
- `Mute I/O` is a global mute: it silences AUX and blocks outgoing MIDI.
- For stability, after reboot BECA may come up in `BLE` or `SERIAL`; reselect `AUX OUT` in the UI if needed.

## 9) BLE MIDI Setup (Simple)

1. In BECA UI, set `Output Mode` to `BLE`.
2. In your DAW/app Bluetooth MIDI panel, connect to `BECA BLE-MIDI`.
3. Enable that MIDI input in your DAW.
4. Arm a MIDI track and test plant input.

## 10) Serial MIDI Setup (Windows)

Use this if you want wired MIDI into a DAW.

### One-time setup

1. Install Python 3.
2. Install loopback MIDI tool:
- loopMIDI (recommended): https://www.tobias-erichsen.de/software/loopmidi.html
- LoopBe1 (alternative): https://www.nerds.de/en/loopbe1.html
3. In loopMIDI, create a port named `BECA Serial MIDI` (or use LoopBe port).

### Start the bridge

From project root:

```bat
tools\beca_link\start_windows.bat
```

This script creates a virtual environment, installs dependencies, lists serial/MIDI ports, and starts the bridge.

If needed, force LoopBe output:

```bat
tools\beca_link\start_windows_loopbe.bat
```

### Correct startup order (important)

1. Keep BECA in `BLE` mode first.
2. Start bridge and confirm it is running.
3. Then switch BECA to `SERIAL` mode in the web UI.
4. In DAW, enable loopback input and arm track.

## 11) Serial MIDI Setup (macOS/Linux)

1. Keep BECA in `BLE` mode first.
2. Start bridge:

```bash
cd tools/beca_link
chmod +x start_mac_linux.sh
./start_mac_linux.sh
```

3. Switch BECA output mode to `SERIAL`.
4. Select BECA bridge MIDI output in your DAW.

## 12) AUX OUT Setup (Onboard Audio)

Default PCM5102A wiring:

- `BCK` -> `GPIO26`
- `LRCK/WS` -> `GPIO27`
- `DIN` -> `GPIO25`

Test:

1. Set `Output Mode` to `AUX OUT` in UI.
2. Open `http://<beca-ip>/api/synth/test`.
3. Confirm you hear a short test tone/chord.

## 13) Operating Rules (Avoid Common Problems)

- Do not run Serial Monitor and Serial MIDI bridge at the same time.
- Keep bridge terminal open while using `SERIAL` mode.
- If bridge shows `Access is denied`, another app owns the COM port.
- Use 2.4 GHz Wi-Fi for setup and normal operation.
- If using BLE only, bridge tool is not required.

## 14) Troubleshooting

### Problem: No COM port appears

Fix:
1. Install correct USB driver (CP210x/CH340/FTDI).
2. Replace USB cable with a data cable.
3. Try another USB port.
4. Reopen Arduino IDE.

### Problem: Upload fails (`Connecting...` / timeout)

Fix:
1. Hold `BOOT` button while upload starts.
2. Release after upload begins.
3. Power-cycle board and retry.

### Problem: Setup page does not open

Fix:
1. Connect to `BECA-XXXX` Wi-Fi AP.
2. Open `http://192.168.4.1/setup` manually.

### Problem: Wi-Fi setup fails

Fix:
1. Confirm password is correct.
2. Use `2.4 GHz` SSID.
3. If "connected but no IP", reboot router/hotspot and retry.

### Problem: `beca-xxxx.local` does not open

Fix:
1. Use direct IP: `http://<device-ip>/`.
2. Keep BECA and your computer on the same LAN.

### Problem: BLE device not found

Fix:
1. Set mode to `BLE`.
2. Power-cycle BECA.
3. Re-scan for `BECA BLE-MIDI`.

### Problem: Serial bridge says `Access is denied`

Fix:
1. Close Arduino Serial Monitor and PlatformIO monitor.
2. Close old bridge windows.
3. Unplug/replug BECA USB.
4. Start bridge again.

### Problem: DAW receives no notes in `SERIAL` mode

Fix:
1. Start bridge first, then switch BECA to `SERIAL`.
2. Confirm DAW MIDI input is enabled.
3. Confirm track is armed and correct input selected.

### Problem: No sound in `AUX OUT`

Fix:
1. Check PCM5102A wiring and power.
2. Confirm mode is `AUX OUT`.
3. Run `/api/synth/test`.
4. Confirm `Mute I/O` is OFF.

## 15) Project File Map

- Main firmware: `BECAfinalsv02.ino`
- Web UI source: `index.html`
- Generated web UI header: `index_html.h`
- Serial MIDI bridge: `tools/beca_link/beca_link.py`
- Bridge launcher (Windows auto): `tools/beca_link/start_windows.bat`
- Bridge launcher (Windows LoopBe): `tools/beca_link/start_windows_loopbe.bat`
- Bridge launcher (macOS/Linux): `tools/beca_link/start_mac_linux.sh`

## 16) Developer Note (Only if you edit UI)

If you edit `index.html`, regenerate `index_html.h`:

```bash
python make_index_header.py
```

Without this step, firmware may compile with old UI content.

