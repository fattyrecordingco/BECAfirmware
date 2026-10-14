# BECA on iPhone, iPad and Mac

Use Safari for Wi-Fi sound without app signing, or install the native iPhone/iPad development app with your own Apple Account.

- [Download the separate Apple 1.7.0 folder ZIP](https://github.com/fattyrecordingco/BECAfirmware/releases/download/apps-v0.3.0/BECA-Apple-1.7.0.zip)
- [Release notes, available Mac packages and checksums](https://github.com/fattyrecordingco/BECAfirmware/releases/tag/apps-v0.3.0)

The Apple ZIP contains an **unsigned development IPA** and installation information. It does not contain another user's signing identity or an App Store/TestFlight installation. Tapping an IPA in Safari or Files cannot install it directly.

## Safari: play without an Apple Account

1. Power BECA from a charger or power bank. The Wi-Fi browser instrument needs firmware 1.2.0; update an older device through the [Windows app](WINDOWS.md) or another supported computer setup.
2. In iPhone/iPad **Settings → Wi-Fi**, join BECA's setup access point. If iOS warns that it has no internet, stay connected.
3. In Safari enter **http://192.168.4.1/play/**, including `http://`. Use the numeric address on this access point; `.local` names may not resolve.
4. Tap **Connect Wi-Fi**, then **Listen on this device**. Choose a preset and mode. Safari plays BECA's browser synth from actual Wi-Fi MIDI events; headphones/speakers follow your device's audio settings.
5. Select **Light** or **Dark** in **Settings → Appearance**. Keep Safari visible while playing. Reconnect after a screen lock or interruption; Panic clears held notes.

For home Wi-Fi, open **http://192.168.4.1/setup**, save the network, then open **http://BECA-IP/play/** using the IP from the router's client list. The setup page shows BECA's Wi-Fi MAC for manual network registration.

For an iPhone hotspot, enable [Maximise Compatibility](https://support.apple.com/en-gb/119837) when available. If the phone cannot host its hotspot while joined to BECA's setup Wi-Fi, configure BECA from a second device while the first phone hosts the hotspot. Hotspot client isolation can prevent a connection.

Current BECA hardware uses a CH340 USB serial adapter. iPhone/iPad browsers cannot access that adapter directly through a USB-C cable. The Safari connection above uses Wi-Fi.

## Native iPhone/iPad app: sign and install on your device

The native app requires iOS/iPadOS 15 or later. Installation needs a computer, a trusted USB connection to the iPhone/iPad, and your own signing/provisioning. Normal instrument use afterwards uses **Wi-Fi controls plus BLE MIDI**.

1. Download and extract the Apple ZIP. Check the IPA against the release checksum. Keep the included folder together.
2. Install [xtool](https://github.com/xtool-org/xtool). On Windows, follow the repository's [Windows xtool setup](../../apps/beca-apple/WINDOWS.md) for Ubuntu/WSL and the Apple Devices connection bridge. Obtain the repository scripts from the same release's source archive if your ZIP does not include them. Installing a prebuilt IPA does not require extracting an Apple SDK.
3. Sign into Apple **in your own terminal**. With the repository helpers on Windows, run `.\apps\beca-apple\xtool-windows.ps1 -Step Auth`. Complete any two-factor prompt there. Keep signing credentials and profiles local.
4. Connect the unlocked iPhone/iPad to the computer, accept **Trust This Computer**, and verify it appears in xtool's device list. The helper command is `.\apps\beca-apple\xtool-windows.ps1 -Step Devices --usb --no-wait`. If WSL cannot see it, follow the Apple Devices bridge steps in the linked Windows guide.
5. Run `xtool install /path/to/BECA-unsigned.ipa`, substituting the actual extracted filename. On Windows, use the helper's `-Step Install` with the IPA's WSL path, for example `.\apps\beca-apple\xtool-windows.ps1 -Step Install /mnt/c/Users/YOUR_NAME/Downloads/BECA-Apple-1.7.0/BECA-unsigned.ipa`. xtool signs the candidate for your account/device and installs it. See the [repository device installation guide](../../apps/beca-apple/INSTALL-IPAD.md) for the complete handoff.
6. If the device requests it, enable **Settings → Privacy & Security → Developer Mode**, restart, and confirm. If a developer-trust prompt appears, follow it in **Settings → General → VPN & Device Management** for your own account.
7. Open BECA and allow **Local Network** and **Bluetooth**. Expand **Connection** at the top of the native app to reveal **BECA address**, **MIDI source**, **Refresh MIDI** and **Bluetooth MIDI**. Enter its address: `192.168.4.1` on the setup access point, or its current station IP on a shared network. Choose **Bluetooth MIDI**, connect **BECA BLE-MIDI**, then close the panel. Use **Refresh MIDI** if needed and choose BECA in **MIDI source**. Collapse Connection to return to the playing surface, tap **Connect BECA**, then **Listen on this device**. Close other apps connected to BECA's BLE MIDI source if pairing fails.

A free Apple Personal Team's development profile expires after **seven days**. Re-sign and reinstall before or after expiry; this is Apple's provisioning limit, not a BECA firmware failure. [Apple's account documentation](https://developer.apple.com/help/account/basics/about-your-developer-account) explains these limits. Installing a development IPA is separate from public App Store/TestFlight distribution.

The existing development **build 5** on `iPad15,5` has user-confirmed setup-AP connection, knobs, Light/Dark, Test sound and Panic. That record does not certify the newly published package or every iPhone/iPad model. Direct CH340 USB serial is not included in the native app either.

## macOS desktop

If this release lists a macOS desktop DMG, choose **Apple Silicon / M-series** for an M-series Mac or **Intel** for an Intel Mac. Those desktop packages are separate from the iPhone/iPad development IPA.

1. Download the matching DMG from the release asset list and check its checksum.
2. Open the DMG, drag BECA to Applications, eject the disk image, and open the installed app.
3. For the desktop USB app, connect BECA with a data cable and use Setup. For the native Apple app, follow its Wi-Fi and native MIDI connection controls. The release identifies which app each package contains.
4. Read the package's signing/notarization status. If macOS blocks an unsigned or unnotarized package, keep its protections enabled and use the Safari Wi-Fi instrument instead. A successful build is not notarization.

## Troubleshooting

- **Safari cannot load BECA:** join the correct Wi-Fi, stay on a network without internet if prompted, and type `http://192.168.4.1/play/` on the setup AP. On a shared network, use its actual current IP rather than an old saved address.
- **Native knobs work but no notes:** confirm BLE MIDI is paired inside the MIDI panel, the correct source is selected, and Listen is enabled. The Wi-Fi address and MIDI source must refer to the same BECA.
- **Local Network denied:** allow BECA under iOS/iPadOS Settings → Privacy & Security → Local Network, then reopen the app.
- **Native app stops opening after a week:** renew the free development signature with your own account and reinstall.
- **Installation fails:** check device trust, Developer Mode and the xtool/Apple Devices connection. Do not try to install another user's signed development IPA.
- **Held notes or interrupted audio:** use Panic, reconnect if needed, then tap Listen again. Keep the app visible during performance.

[Native project and build instructions](../../apps/beca-apple/README.md) · [Apple device installation](../../apps/beca-apple/INSTALL-IPAD.md) · [Android/web instructions](ANDROID.md)
