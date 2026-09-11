# Live routing and device light verification

Local development build, 11 September 2026. No release was published.

## What changed

- Serial MIDI + Aux (mode 3) drives the melodic synth and serial notes together, with existing startup cooldown and mute behavior.
- All ten light effects now reach the real LED renderer after encoder feedback expires; editing lights makes the effect visible immediately. The combined output has matching physical/web feedback colors.
- MIDI percussion is its own channel-10 section. Aux-only mode hides it, and the ineffective drum-kit selector is removed.
- Performance adds eight editable, locally saved MIDI routes: destination, source/output channel, inclusive source note range, transpose, enable and optional MicroFreak mapping.
- One persistent USB worker handles both MIDI and live control. Route edits reuse open outputs, open newly required ports before replacing routes, release held notes, and preserve drafts on failed Apply.
- Partial serial lines survive read timeouts; malformed MIDI packets are rejected. Requests have bounded queues and deadlines and are cancelled on disconnect. Bridge activity is capped at 2 Hz.
- Firmware reserves a release entry before sending a Note On. A pending serial Note Off remains queued if the UART buffer is busy. The release queue has 32 entries; overflow declines new MIDI notes instead of losing their release.
- Native testing caught a startup publication race: a connected event could trigger discovery before the app had registered the shared USB session. Connected events are now published only after the session is registered.
- Setup USB operations use the detected setup port; Performance uses its selected target's port. MIDI output discovery no longer waits for a firmware-release request. Native string errors are displayed instead of `undefined`.

## Automated checks

- ESP32 Arduino core **2.0.14** firmware compile and upload to the connected ESP32-PICO-V3 on COM4. Flash verification passed. RAM 104,804 / 327,680 bytes; program 1,342,121 / 3,145,728 bytes.
- BLE library versions remain BLE-MIDI 2.2.0, MIDI Library 5.0.2 and NimBLE-Arduino 1.4.3; no BLE stack changes.
- Full browser suite: **48 passed** at 1000 x 1000 and 520 x 900, including axe accessibility checks, no horizontal overflow, no gradients, live coalescing, reconnect state, combined output, drum separation, failed route edits and route persistence. Includes two startup regressions separating Setup and selected Performance USB ports.
- Native bridge: **17 unit tests passed** in release, covering framing, malformed packets, source/channel/range routing, transpose, overlapping destinations, velocity-zero releases, MicroFreak and cleanup. Four app control tests passed.
- Host C++ audio checks passed with extended sounds/combined output enabled and with both disabled; actual synth/DSP sources and compile-time output capability assertions are exercised.
- Vite and Tauri Windows release builds completed. Old debug test executables briefly failed to relink with Windows LNK1104; a release-profile test build succeeded. No security settings were changed.

## Connected hardware and MIDI loopback

`cargo run -p beca-bridge --release --example verify_live -- COM4 "LoopBe Internal MIDI"`

The final firmware run received **216 MIDI packets**, including **64 melodic Note Ons**, while sending live LED and cutoff edits over the same USB connection. Both layers reached the installed LoopBe input; the second layer was transposed by 12 semitones. A missing destination was rejected without replacing the two live routes. Editing down to one route on a new channel took effect. MIDI drum mode reached channel 10, and disabling its part mask stopped drum Note Ons. No owned notes remained held after cleanup.

All ten LED effects produced nonzero, changing eight-pixel frames. Nine produced eight distinct sampled frames; Neon Bars produced two. The maximum measured LED command response was **26 ms** during this run. The Aux test command succeeded in combined mode before and after the live-edit run. Musical settings were restored; MIDI percussion was left with all eight parts enabled for use.

The hardware verifier restores the original musical and light settings on success or failure. It uses a MIDI loopback and never forwards received MIDI back to its input, avoiding a MIDI feedback loop.

## Scope of verification

These measurements verify the USB protocol, on-device animation frames, successful Aux engine/test operation and actual routed MIDI receipt. They do not measure analog Aux fidelity, optical LED brightness/wiring, worst-case latency, Bluetooth pairing/advertising after this change, or unplug/replug behavior on every operating system. USB reconnect handling has bounded retries and framing tests; physical USB disconnect recovery still merits a dedicated test. Multiple destinations are covered by routing tests; the local receive test used multiple channels on one installed LoopBe port. Wi-Fi credentials were neither changed nor logged for this task.

Use **Performance > MIDI routing**, choose destinations, then **Start MIDI bridge**. Use **Apply splits** for later routing changes. The normal musical sliders continue to apply while the bridge is live. Select **Serial MIDI + Aux** to hear the device simultaneously. Closing the app stops its bridge and releases its routed notes. Separate CLI bridge processes and serial monitors must be closed before the app owns USB.


## Installed native app verification

The final installed window was tested with a live LoopBe bridge on COM4. Starting the bridge kept Performance connected across subsequent discovery and polling. Tempo changed from 120 to 121 BPM with “Live changes applied”, then returned to 120. Selecting Serial MIDI + Aux was acknowledged while MIDI remained live. The app was left open on Performance with a single full-range LoopBe route, combined output selected and the existing master volume preserved.

Installed executable and portable `installers/windows/BECA.exe` SHA-256:
`35090EEE71A542FF0BCF7A8C464D49EF5658836BA97CB41C9279D571C4D58B9B`

Flashed firmware SHA-256:
`7AD0966FF65A1AB42A04C1C895F35C4C30BC416D4467F3B899E85C9948BBBB6C`

Bridge executable SHA-256:
`955E402E6D85CA87AFF4F2F2E873E7A463B68651889F27E5201968AF9650CBC5`

The installed app and portable executable were updated locally. Existing MSI/NSIS installers and online firmware releases were not republished; use the installed app or the updated portable executable for this development build.
