# Read Before First Launch

Read this before opening BECA for the first time.

## 1. Install, Then Restart

If the installer offers USB serial drivers, allow them to install and restart the computer before connecting BECA again. Driver changes often do not fully take effect until restart.

BECA boards commonly appear through one of these USB serial chip families:

- WCH CH340/CH341: https://www.wch-ic.com/downloads/CH341SER_EXE.html
- Silicon Labs CP210x: https://www.silabs.com/software-and-tools/usb-to-uart-bridge-vcp-drivers

If the bundled driver installer is not present in your BECA installer package, use the official vendor link above.

## 2. First Connection

1. Use a USB data cable, not a charge-only cable.
2. Connect BECA directly to the computer first, not through an unpowered hub.
3. Open the BECA app.
4. Click `scan device`.
5. If BECA is not detected, install the matching USB serial driver, restart, and scan again.

## 3. First Firmware Update

1. Keep `Latest Stable` selected.
2. Click `flash firmware`.
3. Do not unplug BECA while flashing.
4. Wait for the app to show completion, then let BECA reboot.

The desktop app flashes only release firmware built for the ESP32 Arduino core `2.0.14` baseline.

## 4. Wi-Fi And MIDI

1. Save a 2.4 GHz Wi-Fi network in the app.
2. Use the MIDI bridge only after flashing and Wi-Fi setup finish.
3. Stop the bridge before direct USB maintenance such as Wi-Fi setup or backup/restore.
4. Use one live control surface at a time while performing: the desktop Control view, browser control page, or Max for Live surface.

## 5. Security Notes

BECA is open source under the MIT License. That license allows the code to be shared and built publicly, but it does not replace Windows code-signing or Apple Developer ID notarization.

Official BECA production installers should be signed or notarized where the OS supports it. Current beta installers may be unsigned until those certificates are configured. If Windows SmartScreen or macOS Gatekeeper reports a problem, verify you downloaded the newest `setup-v0.1.7` build from the official BECA repository and compare the published SHA256 checksum. Do not disable OS security features.
