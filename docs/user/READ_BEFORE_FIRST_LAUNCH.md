# BECA First Launch Guide

Use this guide before opening BECA for the first time. It explains what to download, how to install it, what to connect, and what to try if something does not work.

## 1. What To Download

Open the GitHub repository:

https://github.com/fattyrecordingco/BECAfirmware

Then open the `installers` folder and choose the folder for your computer:

- Windows: `installers/windows/BECA_0.1.7_x64-setup.exe`
- macOS Apple Silicon: `installers/macos/BECA_0.1.7_aarch64.dmg`
- macOS Intel: `installers/macos/BECA_0.1.7_x64.dmg`
- Linux: `installers/linux/BECA_0.1.7_amd64.AppImage` or `installers/linux/BECA_0.1.7_amd64.deb`

On GitHub, click the file name, then use the download button.

## 2. Before You Start

You need:

- a BECA device
- a USB data cable, not a charge-only cable
- a Windows, macOS, or Linux computer
- a 2.4 GHz Wi-Fi network if you want wireless control
- a MIDI destination if you want Serial MIDI or BLE MIDI

Start with BECA connected directly to the computer. Avoid unpowered USB hubs during first setup.

## 3. Security And Beta Installer Notes

BECA is open source under the MIT License. The license allows the code to be shared and built publicly. It does not replace Windows code signing or Apple Developer ID notarization.

Current beta installers may be unsigned. Unsigned installers are useful for testing, but they are not the same as trusted production installers.

Before running a downloaded installer:

1. Confirm it came from `fattyrecordingco/BECAfirmware`.
2. Check that it is version `0.1.7`.
3. Compare it with the matching `SHA256SUMS` file in the same installer folder if you want to verify integrity.

If Windows SmartScreen or macOS Gatekeeper blocks the app, do not disable OS security features. For normal public use, wait for a signed Windows build or a signed and notarized macOS build.

## 4. Install On Windows

Download:

`installers/windows/BECA_0.1.7_x64-setup.exe`

Install:

1. Double-click `BECA_0.1.7_x64-setup.exe`.
2. Follow the installer prompts.
3. If a USB serial driver installer appears, allow it to run.
4. Restart Windows after installation, especially if any driver was installed or updated.
5. Open `BECA` from the Start Menu or Windows Search.

Common USB serial driver families:

- WCH CH340/CH341: https://www.wch-ic.com/downloads/CH341SER_EXE.html
- Silicon Labs CP210x: https://www.silabs.com/software-and-tools/usb-to-uart-bridge-vcp-drivers

If BECA is not detected after restart, install the driver that matches your board, restart again, then open BECA and click `rescan device`.

## 5. Install On macOS

Choose the correct DMG:

- Apple Silicon MacBook or Mac: `BECA_0.1.7_aarch64.dmg`
- Intel MacBook or Mac: `BECA_0.1.7_x64.dmg`

Install:

1. Open the DMG.
2. Drag `BECA` into `Applications`.
3. Eject the DMG.
4. Open BECA from `Applications`.

If macOS asks for permission to access a USB or serial device, allow it. If the app is blocked because the beta build is unsigned, use a signed and notarized build for normal testing instead of disabling Gatekeeper.

Most modern macOS versions already include common USB serial support. If your board is not detected, use only official signed vendor driver packages.

## 6. Install On Linux

Choose one:

- AppImage: simple portable app file
- `.deb`: better for Debian/Ubuntu-style systems

AppImage install:

1. Download `BECA_0.1.7_amd64.AppImage`.
2. Make it executable.
3. Run it.

Example:

```bash
chmod +x BECA_0.1.7_amd64.AppImage
./BECA_0.1.7_amd64.AppImage
```

Debian/Ubuntu install:

```bash
sudo apt install ./BECA_0.1.7_amd64.deb
```

Linux usually already has CH340/CH341 and CP210x kernel drivers. If the serial port appears but BECA cannot open it, add your user to the serial group and log out and back in:

```bash
sudo usermod -aG dialout "$USER"
```

Some distributions use `uucp` instead of `dialout`.

## 7. First Connection In The App

1. Connect BECA by USB.
2. Open the BECA app.
3. Stay on the `Setup` screen.
4. Click `rescan device`.
5. Wait for the status area to show a detected device.

If no device appears:

- try another USB cable
- connect directly to the computer
- close Arduino Serial Monitor, PlatformIO Monitor, and other serial tools
- install the correct USB serial driver
- restart the computer after driver installation
- click `rescan device` again

## 8. First Firmware Update

Firmware update should be the first real setup action.

1. Keep `Latest Stable` selected.
2. Click `flash firmware`.
3. Do not unplug BECA while flashing.
4. Wait for the app to report completion.
5. Let BECA reboot.

The current stable firmware baseline is `firmware-v1.0.9`, built for ESP32 Arduino core `2.0.14`.

Normal firmware flashing keeps saved Wi-Fi credentials and runtime settings because it does not erase the NVS settings partition.

If flashing fails:

- unplug and reconnect BECA
- close all other serial tools
- click `rescan device`
- retry flashing
- if the board does not enter bootloader mode, hold `BOOT` while the flash starts, then release it when writing begins
- try a different USB cable or port

## 9. Save Wi-Fi

Use a 2.4 GHz Wi-Fi network. ESP32 boards do not connect to 5 GHz-only networks.

1. Enter the device name you want.
2. Select your 2.4 GHz network.
3. Enter the Wi-Fi password.
4. Click `save & reboot`.
5. Wait for BECA to reboot and reconnect.

If Wi-Fi scanning is unreliable:

- type the SSID manually if the app allows it
- move BECA closer to the router
- stop the MIDI bridge before saving Wi-Fi
- use the fallback browser setup on older firmware

Fallback browser setup:

1. Connect to the BECA Wi-Fi access point, usually named `BECA-XXXX`.
2. Open `http://192.168.4.1/setup`.
3. Enter Wi-Fi details.
4. Reconnect to your normal network.
5. Return to the desktop app.

## 10. MIDI Bridge Setup

Use the MIDI bridge when you want USB Serial MIDI from BECA to a normal MIDI destination.

1. Connect BECA by USB.
2. Open the `MIDI bridge` section.
3. Choose a primary MIDI output.
4. Optionally choose a second mirrored MIDI output.
5. Click `connect bridge`.
6. Click `send test note` to confirm routing.

Bridge rules:

- the bridge owns the serial port while it is connected
- stop the bridge before flashing firmware, saving Wi-Fi, backup, or restore
- choose different outputs for primary and mirror
- close other MIDI apps if the output cannot be opened

## 11. Live Control

After firmware and Wi-Fi setup:

1. Open the `Control` view.
2. Wait for BECA to show a ready live target.
3. Click a parameter tile to select it.
4. Use the flower control to adjust the selected value.
5. Watch the 8-leaf LED mirror to confirm the app and device agree.

Use one live control surface at a time. Avoid controlling the same BECA from the desktop Control view, browser page, and Max for Live surface all at once.

## 12. Common Troubleshooting

### BECA Is Not Detected

Try this order:

1. Confirm the USB cable supports data.
2. Use a direct USB port.
3. Restart after driver installation.
4. Close Arduino, PlatformIO, serial monitors, and MIDI utilities.
5. Click `rescan device`.
6. Install CH340/CH341 or CP210x drivers if needed.

### The App Opens But Cannot Flash

This usually means the serial port is busy, the cable is unreliable, or the board did not enter bootloader mode.

Try:

- disconnect the MIDI bridge
- close serial monitors
- unplug and reconnect BECA
- retry flash
- hold `BOOT` as flashing starts
- try a different USB cable

### Wi-Fi Will Not Save

Check:

- the network is 2.4 GHz
- the password is correct
- the bridge is disconnected
- BECA has finished rebooting after flash
- the device is close enough to the router

### MIDI Bridge Will Not Start

Check:

- BECA is connected by USB
- no other app is using the serial port
- the selected MIDI output exists
- primary and mirror outputs are not the same
- the app has been restarted after a failed bridge session

### Control View Looks Frozen

Try:

1. Wait a few seconds for reconnect.
2. Return to `Setup`.
3. Click `rescan device`.
4. Stop and restart the bridge if it is running.
5. Close browser or Max for Live control surfaces for the same BECA.
6. Restart the BECA app.

### Device LEDs Look Wrong

On startup, BECA runs an 8-step LED self-check. Yellow can be normal for first setup, especially before Wi-Fi is saved. Red means that check needs attention.

Useful first fix:

1. Open the BECA app.
2. Flash `Latest Stable`.
3. Let BECA reboot.
4. Check the startup LEDs again.

If LED 5 is red during the startup checklist, it is the output-mode check. Flash the latest firmware first. If it appears after the checklist, it may be a normal output-mode LED pattern rather than an error.

### Linux Serial Permission Denied

Add your user to the serial group, then log out and back in:

```bash
sudo usermod -aG dialout "$USER"
```

If your distribution uses `uucp`:

```bash
sudo usermod -aG uucp "$USER"
```

### macOS App Is Blocked

Current beta builds may be unsigned. For normal public testing, use a signed and notarized BECA build. Do not disable macOS security protections for a blocked installer.

### Windows SmartScreen Warning

Current beta builds may be unsigned. Verify the file came from the official repository and compare SHA256 checksums. Do not disable SmartScreen for normal users; production releases should be signed with a Windows code-signing certificate.

## 13. What To Do After Setup Works

1. Save Wi-Fi.
2. Confirm BECA appears in the app.
3. Choose the output mode you want: BLE, Serial, or aux out.
4. Start the bridge only if using Serial MIDI.
5. Send a test note.
6. Open `Control`.
7. Play and confirm the plant input, notes, LEDs, and MIDI output respond.
