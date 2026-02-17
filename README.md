# BECA Firmware: Complete User Manual

This guide is written for first-time and non-technical users.
Follow it top-to-bottom to install, flash, and use BECA successfully.

## Start Here (Master Branch Users)

This section is the easiest path for first-time users on Windows, macOS, or Linux.
No coding is required.

### What to prepare before you start

1. Your BECA device.
2. A USB data cable (not charge-only).
3. A computer with internet.
4. Your DAW installed (Ableton/FL/Logic/REAPER/etc).

### Important: ZIP vs installer

If you click `Code` -> `Download ZIP` from `master`, installers are mirrored inside:
`apps/beca-setup/dist-installer/`.
If your OS installer is missing there, use `Releases` as fallback.

### Step A: Locate and download the correct installer

1. First check inside the extracted ZIP:
- `apps/beca-setup/dist-installer/windows/`
- `apps/beca-setup/dist-installer/macos/`
2. Download exactly one file for your OS:
- Windows: `BECA Setup_*_x64-setup.exe`
- macOS: `BECA Setup_*.dmg`
3. If your OS file is not present in ZIP, open GitHub `Releases` and download the same OS file there.
4. Linux installers are temporarily paused while CI packaging is stabilized.

### Step B: Install by operating system

Windows:
1. Double-click `BECA Setup_*_x64-setup.exe`.
2. Finish setup with default options.
3. Open `BECA Setup` from Start Menu.
4. If Windows shows missing WebView2 runtime, install:
   https://go.microsoft.com/fwlink/p/?LinkId=2124703
5. If BECA is not detected, install the matching USB serial driver:
- CH340/CH341: https://www.wch-ic.com/downloads/CH341SER_EXE.html
- CP210x: https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers

macOS:
1. Open `BECA Setup_*.dmg`.
2. Drag `BECA Setup` into `Applications`.
3. Open app from `Applications`.
4. If blocked on first run, right-click app and choose `Open`.
5. If BECA is not detected, reconnect cable and close other serial apps.

Linux:
1. Installer packaging is temporarily paused.
2. Use source build instructions in this README until Linux installer builds return.

### Step C: In-app setup (same on all OS)

1. Connect BECA by USB.
2. In BECA Setup Step 1, confirm your device/port appears.
3. In Step 2, keep `Latest Stable` selected and click `Flash Selected Firmware`.
4. Wait for success message (`Flash complete`).
5. In Step 3, choose your Wi-Fi network, enter password, and click `Save and Reboot`.
6. In Step 4, choose MIDI output and click `Start Bridge`.
7. Click `Test Note` and check your DAW receives MIDI.

### Step D: Open BECA control page in browser

1. After Step 3 Wi-Fi setup in BECA Setup, wait for reboot.
2. Open:
- `http://<device-ip>/` or
- `http://<device-name>.local/`
3. If USB Wi-Fi setup is unavailable on older firmware, use fallback AP setup:
- Connect to Wi-Fi `BECA-XXXX`
- Open `http://192.168.4.1/setup`
- Enter home Wi-Fi details and save

### If anything fails

1. Use the app `Show details` logs and `Copy Logs`.
2. Use `Export Diagnostics Zip`.
3. Go to `Troubleshooting` in this README.

### Read only what you need

If you are a normal end user, focus on:
1. `Start Here (Master Branch Users)`
2. `Section 10` (one-click app flow)
3. `Section 11` (connect to DAW)
4. `Section 12` (open BECA web UI)
5. `Section 16` (troubleshooting)

You can ignore advanced sections unless you are developing firmware.

### Quick glossary (plain words)

- `DAW`: your music software (Ableton, FL Studio, Logic, REAPER, etc).
- `MIDI`: note/control messages used to play instruments in a DAW.
- `Serial`: USB cable data path from BECA to computer.
- `BLE`: Bluetooth MIDI (wireless).
- `COM port`: the USB device name on Windows (example `COM5`).
- `Flash firmware`: install/update BECA’s internal software.

## 0) Official Branching And Version Policy

To keep firmware and installer updates separate and predictable, use these branches:

- `official-system-updates`: firmware/system source of truth (ESP32 sketch + web UI + firmware docs)
- `official-app-updates`: BECA Setup desktop app source of truth (installer, flasher wrapper, bridge, CI packaging)

Current firmware baseline label:
- `verBECAbetav1.0.1` (based on commit `27559f9`, "README Update")

Publish flow:
1. Land firmware changes in `official-system-updates`.
2. Publish firmware release with tag `firmware-vx.y.z` (or `verBECAbetavx.y.z`) and assets:
`beca-x.y.z-merged.bin` + `firmware-manifest.json` (via `.github/workflows/firmware-release.yml`).
3. Land installer/app changes in `official-app-updates`.
4. Publish installer release with tag `setup-vx.y.z` (triggers `.github/workflows/setup-installer-release.yml`).
5. BECA Setup resolves firmware from the most recent published release that includes `firmware-manifest.json`.

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
- BECA Setup installer from GitHub Releases (recommended for all users)
- Arduino IDE 2.x: https://www.arduino.cc/en/software
- PlatformIO (optional): https://platformio.org/platformio-ide
- Git (optional): https://git-scm.com/downloads

Optional legacy-only dependency:
- Python 3 (only if using `tools/beca_link` legacy bridge scripts): https://www.python.org/downloads/

USB serial driver (install the one matching your board):
- CP210x: https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers
- CH340/CH341: https://www.wch-ic.com/downloads/CH341SER_EXE.html
- FTDI: https://ftdichip.com/drivers/vcp-drivers/

Windows tip:
- Open Device Manager -> `Ports (COM & LPT)` to see your USB chip and COM port.

## 4) Download the Project Source (Optional)

Most end users can skip this section and use BECA Setup from Releases.

If you still want a local copy of source/docs:

1. Download ZIP from `master` (`Code` -> `Download ZIP`), then extract it.
2. Or clone with Git:

```bash
git clone <your-repo-url>
cd BECAfinalsv02
```

Then use this folder for:
- reading docs locally
- manual Arduino/PlatformIO flashing (advanced)
- development workflows

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

Preferred path (latest firmware + setup app):

1. Connect BECA by USB and open `BECA Setup`.
2. In app Step 3 (`Set Wi-Fi`), select SSID, enter password, and click `Save and Reboot`.
3. Wait for reboot.
4. Open BECA UI using either:
- `http://<device-ip>/`
- `http://<device-name>.local/`

Fallback path (AP portal):

1. Connect to Wi-Fi network: `BECA-XXXX`.
2. Open `http://192.168.4.1/setup`.
3. Enter device name, SSID, and password.
4. Click `Save and Connect` and wait for reboot.

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

## 10) One-Click Setup App (Recommended)

Use BECA Setup for the easiest end-user flow:
- Detect BECA over USB
- Flash latest stable firmware
- Set Wi-Fi credentials directly over USB
- Start Serial -> MIDI bridge

### Windows install and first run

1. Open GitHub Releases and download `BECA Setup_*_x64-setup.exe`.
2. Run installer and complete setup.
3. Launch `BECA Setup` from Start Menu.
4. Plug in BECA using a USB data cable.
5. In Step 1, confirm detected port (example: `COM5`).
6. In Step 2, leave firmware set to `Latest Stable` and click `Flash Selected Firmware`.
7. Wait for `Flash complete` status.
8. In Step 3, choose Wi-Fi SSID/password and click `Save and Reboot`.
9. In Step 4, select your MIDI output and click `Start Bridge`.
10. Click `Test Note` and confirm activity in your DAW.

Windows notes:
- Prefer installer `.exe` over a loose copied `beca-setup.exe`.
- Portable mode requires both `beca-setup.exe` and `WebView2Loader.dll` in the same folder.
- If WebView2 runtime is missing, install it:
  https://go.microsoft.com/fwlink/p/?LinkId=2124703
- If no MIDI destinations exist, install/start loopMIDI and create one port.

### macOS install and first run

1. Download `BECA Setup_*.dmg` from Releases.
2. Open `.dmg` and drag `BECA Setup` into `Applications`.
3. Open `BECA Setup` from Applications.
4. If macOS blocks first launch, right-click app -> `Open`.
5. Connect BECA via USB and complete Step 1 through Step 4 in the app.
6. In your DAW, choose the same MIDI destination you selected in Step 4.

macOS notes:
- If serial access is denied, close any app already using the serial port.
- Keep BECA Setup and DAW open while bridging in `SERIAL` mode.

### Linux install and first run

1. Download `BECA Setup_*.AppImage` from Releases.
2. Make it executable:

```bash
chmod +x BECA\ Setup_*.AppImage
```

3. Run it:

```bash
./BECA\ Setup_*.AppImage
```

4. Connect BECA and complete Step 1 through Step 4 in order.

Linux notes:
- If serial permission is denied, add your user to `dialout` and relogin:

```bash
sudo usermod -aG dialout $USER
```

- If AppImage fails to launch, ensure `fuse` support is installed.

## 11) Connect BECA To A DAW (Windows/macOS/Linux)

If this feels confusing, do not worry.
Follow this section one line at a time, in order.

### One simple path that works for most people (recommended)

1. Open `BECA Setup`.
2. In Step 4, click `Start Bridge`.
3. Open BECA control page in browser.
4. Set output mode to `SERIAL`.
5. Open your DAW.
6. In DAW MIDI settings, enable the same MIDI port name shown in BECA Setup.
7. Create or select one instrument/MIDI track.
8. Arm/record-enable that track.
9. Move/touch your plant sensor and watch for MIDI activity.

### If you do not hear sound yet

1. Confirm your DAW track has an instrument loaded (piano/synth/etc).
2. Confirm track monitoring is on.
3. Confirm the selected MIDI input matches BECA Setup Step 4 exactly.
4. Click `Test Note` in BECA Setup.
5. If Test Note works but plant data does not, re-check BECA mode is `SERIAL`.

### DAW menu cheat sheet (where to look)

- Ableton Live: `Preferences -> Link, Tempo & MIDI`
- FL Studio: `Options -> MIDI settings`
- Logic Pro: `Logic Pro -> Settings -> MIDI`
- REAPER: `Options -> Preferences -> Audio -> MIDI Devices`
- Ardour: MIDI/ALSA/JACK input routing panel

### Optional Bluetooth path (BLE)

Use this only if you want wireless MIDI and your DAW/OS supports BLE MIDI well.

1. In BECA control page, set mode to `BLE`.
2. Pair/connect to `BECA BLE-MIDI`.
3. Enable BLE MIDI input inside your DAW.
4. Arm a track and test.

## 12) Open The BECA Web UI (Control Page)

After flashing and reboot, open the BECA control page in a browser:

1. Preferred: configure Wi-Fi in BECA Setup Step 3 (`Set Wi-Fi`) over USB.
2. If needed, fallback to AP portal: connect to `BECA-XXXX`, then open `http://192.168.4.1/setup`.
3. After BECA joins your Wi-Fi, open either:
- `http://<device-ip>/`
- `http://<device-name>.local/`
4. Use the control page to change output mode (`BLE` / `SERIAL` / `AUX OUT`) and tune behavior.

## 13) Legacy Serial MIDI Setup (Advanced / Manual)

Use this only if you are not using BECA Setup app.

### Windows (legacy python bridge)

1. Install Python 3.
2. Install loopMIDI or LoopBe1.
3. In loopMIDI, create port `BECA Serial MIDI`.
4. Run:

```bat
tools\beca_link\start_windows.bat
```

5. Keep BECA in `BLE` first, then switch to `SERIAL` after bridge starts.

### macOS/Linux (legacy python bridge)

```bash
cd tools/beca_link
chmod +x start_mac_linux.sh
./start_mac_linux.sh
```

Then switch BECA output to `SERIAL`.

## 14) AUX OUT Setup (Onboard Audio)

Default PCM5102A wiring:

- `BCK` -> `GPIO26`
- `LRCK/WS` -> `GPIO27`
- `DIN` -> `GPIO25`

Test:

1. Set `Output Mode` to `AUX OUT` in UI.
2. Open `http://<beca-ip>/api/synth/test`.
3. Confirm you hear a short test tone/chord.

## 15) Operating Rules (Avoid Common Problems)

- Do not run Serial Monitor and Serial MIDI bridge at the same time.
- Keep bridge terminal open while using `SERIAL` mode.
- If bridge shows `Access is denied`, another app owns the COM port.
- Use 2.4 GHz Wi-Fi for setup and normal operation.
- If using BLE only, bridge tool is not required.

## 16) Troubleshooting

If something fails, start here first.

### 60-second reset routine (do this before deeper debugging)

1. Close DAW, Arduino IDE, and any serial monitor windows.
2. Unplug BECA USB.
3. Wait 5 seconds.
4. Plug BECA USB back in.
5. Open only `BECA Setup`.
6. Run Step 1 -> Step 2 -> Step 3 -> Step 4 again.

### Problem: BECA not detected (no COM/serial port)

1. Try a different USB cable (data cable required).
2. Try a different USB port.
3. Install USB driver for your chip:
- CH340/CH341: https://www.wch-ic.com/downloads/CH341SER_EXE.html
- CP210x: https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers
4. On Windows, check Device Manager -> `Ports (COM & LPT)`.

### Problem: Flashing fails

1. Confirm no other app is using BECA serial port.
2. Click `Rescan Device` in Step 1.
3. Try flash again in Step 2 (setup app now auto-retries with safer baud rates).
4. If your board has a `BOOT` button, hold it as flash starts.
5. If error mentions `unexpected argument '--port'`, install BECA Setup `0.1.3` or newer.

### Problem: BECA Setup opens, but firmware list does not load

1. Confirm internet access is available.
2. Close and reopen BECA Setup.
3. Click `Rescan Device`.
4. If still failing, use `Copy Logs` and `Export Diagnostics Zip`.

### Problem: Bridge shows reconnecting / access denied

1. Close Arduino Serial Monitor, PlatformIO monitor, and old BECA bridge sessions.
2. Stop bridge, wait 3 seconds, start bridge again.
3. Unplug/replug BECA if needed.
4. Keep only one app connected to BECA serial at a time.

### Problem: Step 3 Wi-Fi scan/info times out or says serial port busy

1. After flashing in Step 2, wait at least 10 seconds before running Step 3.
2. Stop bridge in Step 4 before scanning/saving Wi-Fi.
3. Close Arduino Serial Monitor and any other serial tools.
4. After clicking `Rescan Networks`, allow up to 8 seconds for scan response before retrying.
5. Click `Rescan Device`, then `Rescan Networks`.
6. If controls are temporarily disabled after flash/save/forget, wait for reboot cooldown to finish.
7. If still failing, flash latest firmware again and retry.

### Problem: DAW gets no notes in SERIAL mode

1. Start bridge first in BECA Setup Step 4.
2. Set BECA output mode to `SERIAL` in web UI.
3. Enable the same MIDI port in DAW settings.
4. Arm/record-enable a track.
5. Press `Test Note` in BECA Setup to confirm routing.

### Problem: BECA web page does not open

1. In BECA Setup Step 3, run `Set Wi-Fi` again and wait for reboot.
2. Open `http://<device-ip>/` from the same LAN.
3. If `.local` does not resolve, use direct IP.
4. Fallback: connect to `BECA-XXXX` and use `http://192.168.4.1/setup`.

### Problem: No audio in AUX OUT mode

1. Set BECA mode to `AUX OUT`.
2. Confirm `Mute I/O` is OFF.
3. Check PCM5102A wiring and power.
4. Run `http://<beca-ip>/api/synth/test`.

### Problem: Windows says `WebView2Loader.dll was not found`

1. Use installer build `BECA Setup_*_x64-setup.exe`.
2. If using portable build, keep `beca-setup.exe` and `WebView2Loader.dll` together.
3. Install/repair Microsoft Edge WebView2 Runtime:
   https://go.microsoft.com/fwlink/p/?LinkId=2124703

## 17) Setup App Build Artifacts

Windows local build artifacts:
- `apps/beca-setup/dist-installer/windows/*_x64-setup.exe`
- `apps/beca-setup/dist-installer/windows/*_x64_en-US.msi`
- `apps/beca-setup/dist-installer/windows/*_portable.zip`

Windows local build command:

```powershell
powershell -ExecutionPolicy Bypass -File tools/build_setup_windows.ps1
```

Linux CI packaging note:
- `.github/workflows/setup-installer-release.yml` installs `libasound2-dev` and `libudev-dev` so `beca-bridge` sidecar builds on Ubuntu runners.
- CI upload/release attachment paths use workspace bundle output under `target/release/bundle/**`.

Cross-platform installer mirror (from published setup release):

```powershell
powershell -ExecutionPolicy Bypass -File tools/sync_setup_installers.ps1 -Clean
```

Outputs after sync:
- `apps/beca-setup/dist-installer/windows/*`
- `apps/beca-setup/dist-installer/macos/*.dmg`
- `apps/beca-setup/dist-installer/linux/*.AppImage`
- `apps/beca-setup/dist-installer/linux/*.deb`

Important:
- This requires a published release tag matching `setup-v*`.
- If no setup release exists yet, the script exits with a clear error.
- CI also mirrors installers into this folder automatically after successful `Build Setup Installer` workflow runs (release or manual dispatch).
- If one OS build fails, CI still mirrors available installer files from the successful OS jobs.

## 18) Project File Map

- Main firmware: `BECAfinalsv02.ino`
- Web UI source: `index.html`
- Generated web UI header: `index_html.h`
- Setup app: `apps/beca-setup`
- Native bridge: `tools/bridge`
- Flasher wrapper: `tools/flasher`
- Firmware release tooling: `tools/release`
- Legacy python bridge: `tools/beca_link`

## 19) Maintainer Rule For README Updates

For every setup-app release, update this README with:
1. New installer filenames/versions.
2. Any changed prerequisites (drivers, WebView2, permissions).
3. Any changed troubleshooting steps.

## 20) Developer Note (Only if you edit UI)

If you edit `index.html`, regenerate `index_html.h`:

```bash
python make_index_header.py
```

Without this step, firmware may compile with old UI content.

