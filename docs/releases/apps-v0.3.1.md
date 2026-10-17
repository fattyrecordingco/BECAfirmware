# BECA 0.3.1 — MIDI Learn

Desktop 0.3.1 · phone/Apple 1.7.1 · firmware 1.2.1 · ESP32 Arduino core 2.0.14.

- Map hardware knobs, faders and pads to BECA's Performance controls with MIDI Learn. Assignments remember the controller and MIDI channel. CC, note pads, pitch bend, pickup, reverse and three relative-encoder formats are supported.
- Controller gestures use the existing bounded parameter queue. Switching modes preserves hidden values; disconnect, overflow and backgrounding reset controller ownership safely.
- Two design passes add accessible instrument icons, touch-sized actions and responsive controller editing in both appearances. Plant scope and actual MIDI feedback stay mounted.
- Late Performance connection responses cannot re-enable a view that has closed.
- Desktop gains a dismissible update notice for future stable releases. Phone updates wait for the performer instead of reloading during playback, including updates activated in another window.

## Install

Download the installer for your operating system from this release. Windows EXE/MSI, Mac ARM/Intel DMGs and Linux AppImage/DEB include the same firmware and offline manual. Separate Windows, web and Apple folders and SHA256SUMS are provided. The [phone web app](https://fattyrecordingco.github.io/BECAfirmware/) updates through its existing service worker; choose Update when finished playing.

Open Performance → MIDI controller, select an input and a control, press Learn, then move the hardware control. Move again to play; Pickup avoids sudden value jumps. Controllers must expose a supported MIDI input through the OS. Proprietary SysEx, NRPN/RPN and MIDI 2.0-only modes need configuring to standard CC/note/bend first. Desktop mapping is available on Windows, Mac and Linux; the phone/Apple surfaces retain their existing input capabilities.

Windows packages remain unsigned and Mac packages unnotarized unless signing is reported by the build. The Apple IPA is an unsigned development candidate requiring the user's own signing; it is not an App Store/TestFlight release. Physical acceptance of every controller, BLE host and mobile device is separate from automated verification. See [review and verification](../research/software-review-0.3.1.md).

Older desktop installations have no app-update receiver. This release can notify GitHub release subscribers and existing PWA sessions when they next check online; it cannot send direct push notifications to every previous installer. Desktop 0.3.1 adds the receiver for subsequent releases.
