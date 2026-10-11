# BECA iPhone/iPad test candidate

This artifact is an **unsigned native device build**, not an App Store or TestFlight release. It supports iPhone and iPad on iOS/iPadOS 15+. Its commit is recorded in `commit.txt`; compare the IPA with `SHA256SUMS.txt` before installation. Download only a successful **Apple app checks** run from the BECA repository.

The GitHub macOS runner compiles the app with Xcode. On Windows, xtool can sign/install that prebuilt IPA without compiling it locally or extracting an Apple SDK. Local Swift development builds still require the SDK described in [WINDOWS.md](WINDOWS.md).

Status on 11 October 2026: the candidate from commit `3f0a59c` was signed and installed on the user's iPad Air M3, and the user confirmed it opens after completing Developer Mode. This is a Wi-Fi/BLE candidate. The user's required **USB-C serial connection to both iPad and iPhone remains unimplemented and untested**. See [wired serial constraints](README.md#shared-app-experience-and-wired-serial) before treating installation as product acceptance.

## Install on the connected device

1. Install the Windows/Linux tools in `WINDOWS.md`. Connect the iPad/iPhone with a USB data cable, unlock it, accept the Trust prompt, and enable Developer Mode when requested.
2. Authenticate with Apple in your own terminal using `xtool-windows.ps1 -Step Auth`. Keep passwords, 2FA codes and API keys out of chat and Git. Free-account development installs expire and require reinstallation; paid membership is required for TestFlight/App Store distribution.
3. Use the Windows Apple-device bridge in `WINDOWS.md` if Ubuntu's Apple USB service crashes or installation reports mux errors. Keep the Apple device attached to Windows for that route. Otherwise, use `usbipd list` to find it, then administrator `usbipd bind --busid <actual-id>` and `usbipd attach --wsl --busid <actual-id>`. Do not attach BECA's CH340 bridge to WSL for this step. Verify the Apple device with `xtool-windows.ps1 -Step Devices --usb --no-wait`.
4. Install the IPA using its real WSL path, for example from the repository root:

```powershell
.\apps\beca-apple\xtool-windows.ps1 -Step Install -ToolArguments @('/mnt/c/Users/AJ/Downloads/BECAApple-unsigned.ipa')
```

5. Open **BECA** on the device. Keep BECA powered from the laptop, a charger or a power bank; installation USB is separate from the instrument connection.

## Connect BECA and check the instrument

These checks apply to the existing wireless candidate. They cannot validate the required wired serial product. An M-series iPad CH340 driver needs eligible DriverKit provisioning unavailable to a free Personal Team; that driver route does not cover iPhone. Plugging the current CH340 cable into either device does not add serial support to this app.

Join BECA's setup Wi-Fi or the same router as BECA. On setup Wi-Fi use `192.168.4.1` in **BECA address**. Allow Local Network and Bluetooth access. Tap **Bluetooth MIDI**, connect **BECA BLE-MIDI**, select its source, tap **Connect BECA**, then **Listen on this device**. Close other BLE MIDI central connections, including laptop test tools. Begin with a low audio level.

This version uses **Wi-Fi controls + Bluetooth/native MIDI**. It does not implement direct CH340 USB serial on iPad or iPhone. A browser publication alone does not add the native connection.

Before a release, test both portrait and landscape, all 13 presets, all eight drums, changing plant readings, controls and note-offs, panic/disconnect, first-run permission denial/recovery, setup Wi-Fi without internet, screen lock/foreground/reconnect, headphones and audio interruption. Test an actual iPhone as well as this iPad before claiming both devices validated. Report the commit, device model/OS, firmware version and any failure; never include signing secrets or Wi-Fi passwords.

Compilation, browser emulation and bundle checks do not establish physical CoreMIDI, WKWebView audio or Apple distribution approval. Device installation and acceptance results must be recorded separately.
