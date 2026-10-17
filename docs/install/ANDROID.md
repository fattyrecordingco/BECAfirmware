# Install BECA on Android or use the web app

BECA 1.7.1 is an installable Chrome web app. It is not an APK.

- [Open the web app](https://fattyrecordingco.github.io/BECAfirmware/)
- [Download the separate Android/web folder ZIP](https://github.com/fattyrecordingco/BECAfirmware/releases/download/apps-v0.3.1/BECA-Android-Web-1.7.1.zip)
- [Release notes and checksums](https://github.com/fattyrecordingco/BECAfirmware/releases/tag/apps-v0.3.1)

## Install and connect over USB

1. Open the web link directly in current **Chrome on Android**, outside an email or social app's embedded browser.
2. In Chrome's menu choose **Install app** or **Add to Home screen**, if offered. You can also keep using the browser tab. Let the first load finish online so the app's offline shell can be cached.
3. Connect BECA with a USB-C OTG/data cable. Enable your phone's OTG option if it has one. Tap **Connect USB**, select BECA's serial adapter and approve the permission request.
4. Tap **Listen on this device** to hear the browser synth. It follows your phone's system audio output. Start with a low volume; Bluetooth audio can add delay.
5. Choose a preset and Notes, Arp, Chords or Drums. The controls follow the chosen mode. Use **Panic** to release held notes and **Settings → Appearance** for Light or Dark.

## Connect over Wi-Fi or a phone hotspot

1. Power BECA from a charger or power bank. Firmware 1.2.1 includes the Wi-Fi browser instrument. An older device needs a firmware update from the Windows app or a supported computer setup.
2. For first setup, join BECA's setup Wi-Fi. Open **http://192.168.4.1/setup** to save a home network or a **2.4 GHz** hotspot. On Android USB, the app's **Settings → Wi-Fi & phone hotspot** form can also save it. The displayed **Wi-Fi MAC** is the address to give someone registering BECA manually on a router.
3. Keep the hotspot enabled. After BECA joins your network, use its new IP address from the router/hotspot client list. The phone and BECA must be able to reach each other. Some hotspots isolate clients; if so, use Android USB or another network.
4. Open **http://192.168.4.1/play/** while on BECA's setup Wi-Fi, or **http://BECA-IP/play/** on the shared network. You can enter the address through **Settings → Wi-Fi instrument** in the published app.
5. On the device page, tap **Connect Wi-Fi**, then **Listen on this device**. Keep the page visible while playing. Reconnect after locking the phone or leaving the app.

The HTTPS web app opens the separate local device page for Wi-Fi playback. It cannot fetch a plain-HTTP BECA device directly from its HTTPS origin.

## What the ZIP is for

The ZIP is a web bundle/backup, not an Android installer. Extract it to inspect or host the included files. Opening `index.html` from a file manager does not provide the secure browser origin required for Android USB and PWA installation. Use the published web link for normal installation. For hosting/build commands, see the [phone app README](../../apps/beca-phone/README.md).

## If it does not connect

- **No lights:** check power and OTG first. Try phone → USB-C OTG-to-USB-A adapter → USB-A-to-USB-C data cable → BECA, or use a powered data hub.
- **Device absent from the picker:** try another data cable, unlock the phone, close other USB apps, and reopen the published HTTPS page directly in Chrome.
- **Wi-Fi page absent:** confirm the phone is still on the intended network. Use numeric `192.168.4.1` on the setup access point; `.local` names may fail there. On a router, use BECA's current station IP.
- **Hotspot rejected:** check its name, password and 2.4 GHz setting. Use BECA's setup page to change credentials.
- **App looks old:** accept the app's Update action when offered, then reopen it online. Save any needed settings before clearing browser site data as a last resort.
- **Notes remain held:** tap Panic. If the connection dropped, reconnect and tap Listen again.

[iPhone/iPad instructions](APPLE.md) · [Windows firmware installation](WINDOWS.md)
