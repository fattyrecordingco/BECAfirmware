export function capabilities(env = globalThis) {
  const nav = env.navigator || {};
  const ua = nav.userAgent || "";
  const ios = /iPad|iPhone|iPod/.test(ua) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  const secure = Boolean(env.isSecureContext);
  return {
    ios,
    android: /Android/i.test(ua),
    secure,
    usb: secure && Boolean(nav.usb?.requestDevice || nav.serial?.requestPort),
    audio: secure && Boolean(env.WebAssembly && env.AudioContext && env.AudioWorkletNode),
    relay: secure && typeof env.RTCPeerConnection === "function",
    offline: secure && Boolean(nav.serviceWorker)
  };
}

export function connectionHelp(issue, caps) {
  if (issue === "power") return "No lights means a power connection must be established first; the app cannot turn USB power on. On OnePlus/OxygenOS, search Settings for OTG and enable OTG storage/connection, then reconnect immediately. Recheck it after inactivity. Try a known data cable. If USB-C to USB-C stays dark, try phone → USB-C OTG-to-USB-A adapter → USB-A-to-USB-C data cable → BECA. If that works, the C-to-C cable or USB-C role detection needs checking; it does not prove the board is faulty. A powered USB data hub can help if phone power is insufficient.";
  if (!caps.secure) return "Open the published HTTPS app. USB, audio worklets and the computer link need a secure page; a plain HTTP address on your local network is not sufficient.";
  if (issue === "lost") return "Keep the app visible and the device awake while playing. Reconnect after returning from another app or locking the screen. For USB, check the cable, power and OTG setting and close other serial apps. For the computer link, keep both pages visible and both devices on the same non-isolated network. For direct Wi-Fi control, reopen BECA’s current IP address in Safari.";
  if (!caps.usb) return caps.ios
    ? "iPhone/iPad browsers cannot access BECA’s CH340 USB serial adapter. For direct settings and AUX control, power BECA independently and open http://192.168.4.1 on its setup Wi-Fi, or its current Wi-Fi IP address in Safari. For live sound in a native music app, connect BECA BLE-MIDI in that app’s Bluetooth MIDI panel. The BECA Apple app combines Wi-Fi controls with native MIDI; this browser synth uses the computer link below."
    : "This browser does not expose USB serial access. On Android, update and open Chrome directly, outside social apps. Otherwise use the computer link below in a browser that supports it. USB support is checked from browser capabilities, not the phone model.";
  return "First confirm BECA has power. On Android, enable OTG if required and use a data-capable cable. Tap Connect USB, select USB-SERIAL CH340 (or your board’s listed adapter), then approve Android’s USB permission. Close other serial apps. If the picker is empty, test the OTG adapter/cable path in ‘BECA has no lights’. The app cannot detect an adapter the operating system has not enumerated.";
}
