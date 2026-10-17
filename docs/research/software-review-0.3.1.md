# Software review and design passes: 0.3.1

Review date: 17 October 2026. Scope: firmware sketch, synth/DSP/drums, HTTP/SSE/Wi-Fi MIDI, desktop JS/Rust and serial bridge/flasher, shared phone audio/transport/PWA, native Apple MIDI adapter and release pipeline. This is source review plus the recorded automated/local checks; it does not certify every OS, hardware controller or radio condition.

## Findings and concrete changes

| Priority | Finding | Resolution |
| --- | --- | --- |
| High | Performance activation could finish after leaving the view and re-enable hidden controls. | Invalidate the activation generation on deactivation. Late reads are ignored; already authorized writes retain their existing completion behavior. |
| High | PWA install called skipWaiting automatically, then controllerchange reloaded the performer during playback. | Wait for Update. Panic/disconnect before user-requested reload. An update activated in a different window offers Update without reloading this performance. |
| Medium | No controller-to-setting path existed; MIDI routing handled output splits only. | Independent native input session, validated persistent MIDI Learn and the existing serialized parameter writer. No note-output or BLE rewrite. |
| Medium | Previous desktop apps have no installed-user notification receiver. | Add bounded stable-release checks for future desktop updates; publish the present release through GitHub/PWA channels. Document the historical reach limit. |
| Medium | Release workflow built installers but had no gated complete-publication job. | Gate staging/publication on all installers, phone regressions and native Apple builds. Validate six desktop assets, firmware, IPA, manuals and checksums; refuse replacement of an existing release. |
| Medium | Input flooding or stale controller gestures could affect a new device or view. | 256-message native queue, overflow reset, selected-device generation reset, 40 ms drain cadence, 3-second discovery and release ownership while hidden. |
| Low | New icons initially overflowed 360 px navigation; controller status initially collided with routing's selector. | Keep accessible names, show icon navigation at small widths, and use a distinct controller status identifier. Regression checks cover both. |

## Design round one: playing workflow

Retain BECA's established monochrome surfaces, green accent and bundled display/body fonts. Palette tokens: ink #101719, panel #182124, text #eef4f3, green #67e3bc, muted #a5b8b8 and line #3b4c50; light appearance uses the existing paired tokens. Palette values remain those in appearance.css; no network fonts or visual dependencies. Keep mode/master/tempo/output/mute pinned, with measured plant/MIDI feedback directly below. Put controller setup in a compact disclosure between playing controls and expression so mapping does not become a second dashboard. The assignment list reads source → BECA control; input, target and Learn are keyboard-operable native controls.

The design review rejected replacing musical parameter names with unexplained symbols. Familiar navigation, reconnect, focus, previous/next, undo, refresh and delete actions use a small shared SVG system with accessible names/tooltips. Instrument parameters and MIDI response formats retain explicit text.

## Design round two: interaction and restraint

Increase icon actions and selectors to 44 px, enlarge slider hit areas, hide only navigation's visual text on narrow screens, retain focus rings, and fit the mapping list into one column on phones. Keep live data mounted and avoid rebuilding the assignment list for each controller message. Persist only validated source/target settings; never credentials. Mapping learns silently, absolute ranges use pickup, held notes toggle once, and hidden mode controls reject gestures without changing saved values.

## Audio/transport and performance review

The ESP32 core remains pinned to 2.0.14 with BLE-MIDI 2.2, MIDI Library 5.0.2, NimBLE-Arduino 1.4.3, FastLED 3.10.3 and AppleMIDI 3.5.0. No radio stack changes or new dependencies. Existing watchdog yields, SSE cadence/state diffs, ordered source MIDI and bridge note-off routing stay intact. Firmware changes are the regenerated shared browser player assets only.

Review confirmed the existing idempotent synth parameter sanitization, bounded event/command queues, voice retirement, live envelopes, paired swing helper, finite/bounded plant handling and panic paths have focused regressions. New controller messages never enter the musical note stream. Timing improvements are architectural bounds, not measured physical-latency claims: coalesce by parameter, serialize requests, cap writes at 20/s, drain input at 25/s, bound the queue and diff status/option updates. Controller connection/discovery execute off the native UI thread.

Remaining performance work requires hardware profiling: audio deadline distribution during BLE/Wi-Fi load, electrode/ADC noise and end-to-end gesture/audio latency. A wholesale DSP or transport rewrite would increase risk without those measurements and was not made.

## Verification evidence

The final results and release artifact references are recorded below after verification. Screenshots are saved in the local Playwright test-results folders; public release notes distinguish compiled/simulated checks from physical device acceptance.

- ESP32 firmware compiled successfully with Arduino 2.0.14: RAM 107,492/327,680 bytes; flash 1,448,301/3,145,728 bytes. Rebuilt merged 1.2.1 image and checksum manifest; regenerated the phone, Apple bundle and embedded player.
- Actual C++ synth/DSP regression executable passed for both extended sounds and the six-preset fallback (PCM raw-Hz/phase/silence, live envelopes, polyphony, idempotent gain and all presets).
- Rust workspace: 35/35 passed, including native controller filtering/overflow, routing note-off ownership, flasher checksums and stable-update selection.
- Phone logic/audio/transport: 45/45 passed. Existing browser suite: 254 applicable checks passed (two transient startup/network failures passed on rerun), 25 capability skips. New cross-window update regression: 9/9 passed across Chromium/WebKit phone/tablet/desktop projects.
- Local USB discovery exposed a separate serial device and Bluetooth COM ports; no identifiable BECA CH340/CP210x device was attached. Firmware flashing, live plant normalization/BLE advertisement and physical controller knob acceptance could not be performed in this session.

- Final desktop browser suite: 94/94 passed, including mapping, accessibility, both appearances, 360 px navigation, phone/tablet orientations, update notices and cancelled initial Performance loads. Desktop logic checks: 14/14 passed.

- Local Windows EXE/MSI installers built and the per-user app was upgraded to 0.3.1. The installed WebView/native IPC reports 0.3.1 and enumerates LoopBe Internal MIDI and TouchOSC Bridge. The installed firmware SHA256 matches the rebuilt bundled image. The app was reopened normally after the diagnostic session.
- Native port connection/disconnection succeeded. A LoopBe delivery test received no bytes in BECA or in a separate direct-midir probe; end-to-end loopback/physical controller delivery is therefore not certified by this machine's result. No claim that every physical controller has passed is made.
- The unchanged Ableton instrument's HTTP/runtime regression suite passed 15/15. Apple local address validation and deterministic embedded-player generation checks passed.

- Final native interaction review found stale controller status after choosing No controller. The status now clears immediately, saved missing inputs show Disconnected, and the disconnect regression covers deselection. The unpublished release build was cancelled and restarted with this fix; no public release assets were replaced.

## Published result

Release source: `9e3034ab812f2f3e3c608a82dd9c77717b1aaf85` (`apps-v0.3.1`). [All release jobs passed](https://github.com/fattyrecordingco/BECAfirmware/actions/runs/39042805018): core 2.0.14 firmware/audio, phone regression suite, native iPhone/iPad/Mac checks, Rust/browser checks, Windows, Apple Silicon, Intel Mac and Linux installers, complete staging and publication.

[BECA 0.3.1](https://github.com/fattyrecordingco/BECAfirmware/releases/tag/apps-v0.3.1) became public on 17 October 2026 at 16:10 BST. Public verification confirmed 20 assets, every published SHA256SUMS entry against GitHub's stored digest, firmware manifest version/URL/checksum and the latest-release marker. No previously public assets were replaced. The phone app at https://fattyrecordingco.github.io/BECAfirmware/ serves 1.7.1; its published service worker waits for Update.

The final Windows 0.3.1 installer was applied locally and its installed native MIDI connection/deselection status check passed. The app was reopened normally without the diagnostic browser port. This does not change the physical-controller/BLE validation limits recorded above.

Notification reach: the GitHub release announcement and existing PWA update discovery are available. Earlier desktop/native installations without an update receiver cannot be reached retroactively; no direct notification to every installed user is claimed. Desktop 0.3.1 includes a bounded receiver for future stable releases.
