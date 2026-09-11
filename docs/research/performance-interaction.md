# BECA Performance interaction pass — 11 September 2026

## Intent and design rules

Make the desktop app useful as part of the instrument: a performer can discover a texture, shape two parameters together, preserve a useful sound, and recover from an experiment. The visual system retains `#008351`, white/quiet green surfaces, the existing BECA logo and leaf path, mono values and display headings. No decorative gradients or new UI dependencies were added. Setup and the hardware-mirroring Control view retain their geometry.

Ableton's Rack documentation informed the emphasis on fast sound exploration, grouped control and recallable variations. This implementation uses BECA's own UI and firmware; it is not a Live device or a claim of DAW automation parity. [Ableton Racks and variations](https://www.ableton.com/en/live-manual/12/instrument-drum-and-effect-racks/), [Ableton Macros and Variations FAQ](https://help.ableton.com/hc/en-us/articles/360019103480-Macros-and-Variations-FAQ).

## Implemented interaction

| Surface | Behavior |
| --- | --- |
| Pinned live strip | Volume, tempo, output and priority mute remain available while scrolling. Focus controls switches between the playground and the six open parameter groups. |
| Living signal | Eight stationary leaves show energy, the scope plots up to 24 seconds of measured history, and chips name observed MIDI notes. Stale data dims the display. There is no synthetic audio metering or plant-emotion inference. |
| XY expression | Logarithmic cutoff/resonance, delay time/mix, or detune/drive. Pointer capture, touch cancellation, keyboard arrows and fine Shift moves. Immediate local feedback; bounded and coalesced device commands. |
| Mutation | Depth-controlled changes to 11 timbre parameters with conservative delay feedback/drive destinations. Routing, master level, tempo, scale, root, clock and sensitivity are excluded. A bounded setting does not imply identical perceived loudness across timbres. |
| Undo gesture | One previous timbre snapshot for pad gestures, mutation and recall. Does not undo output/transport. New preset selection invalidates the undo point. |
| Soundscape browser | Names and count come from device metadata. Next/previous wraps; buttons and the detailed selector stay synchronized. The new `preset_live` command preserves master in one parameter publication; the old preset command remains unchanged. |
| Variations | Four validated local timbre slots, explicitly saved/replaced, with recall buttons and 1–4 shortcuts. Saving waits for completed writes/reconciliation. Persistence failure falls back to the current session with a clear message. |
| Precision | Editable bounded number fields, Enter/blur commit, Escape cancel, fine Shift + arrows, slider double-click reset. Native labels and inputs remain available to assistive technology. |

Raw Sensor Sine bypasses the engine parameters used by the XY pad, mutation and variations, so those actions are disabled there. Select another soundscape to explore timbre. Synth soundscapes are audible on BECA's Aux output; MIDI routing is identified in the browser instead of implying that these controls change a downstream MIDI synthesizer's tone.

## Transport and compatibility

Arduino core is still **2.0.14**. BLE-MIDI 2.2.0, MIDI Library 5.0.2, NimBLE-Arduino 1.4.3 and FastLED 3.10.3 are unchanged. The only new firmware behavior is opt-in `preset_live`, advertised behind `BECA_LIVE_PRESETS` (default 1). Existing preset callers retain factory volume behavior. The frontend remains behind `VITE_BECA_PERFORMANCE_PAGE`.

UI edits use the existing native serial/Wi-Fi route, at most 20 writes/s and one request at a time. Unchanged writes are skipped. A mute request is moved ahead of pending timbre edits; it cannot interrupt a request already in flight. Polling uses the existing 500 ms state and 2 s synth cadence, with no extra SSE subscriptions. DOM feedback is coalesced through requestAnimationFrame; signal history is capped at 60 entries. No continual visual animation or new background timers were introduced by the deck.

XY changes, mutations and variations are sequential parameter writes, not atomic scenes. They may take longer over the current per-request serial connection. The UI shows pending/error status and protects edits from stale snapshots; it does not promise sample-accurate automation or zero transport latency. A persistent native serial connection and versioned atomic multi-parameter API remain follow-up transport work.

## Verification

| Check | Result |
| --- | --- |
| Playwright | **40 passed** across desktop and narrow layouts. Includes XY drag/coalescing/undo, precise entry and reset after reconciliation, variation persistence, mutation preserving transport, priority mute, raw-sine bypass, stale recovery, keyboard/focus interaction, accessibility and legacy firmware fallback. |
| Visual review | Inspected playground, Focus controls and narrow screenshots. The hover-contrast defect found in the first focus test was fixed; accessibility checks pass in both views. Previews are saved under `.beca-cache/ui-verification/performance-*.png`. |
| Audio host regression | Passed using the actual synth implementation: live presets preserve zero/0.17/full master levels across all presets, legacy default gain remains, plus prior PCM sine/envelope/polyphony/drum/swing checks. |
| Firmware build and flash | ESP32 Arduino 2.0.14 build passed; uploaded to the identified ESP32-PICO-V3 on COM4 and flash hashes verified. RAM 104,588 bytes; reported flash usage 1,337,153 bytes. The pinned Arduino core still emits its existing `uartSetPins` return-value warning; no application compilation failures. |
| Actual device | 40 bounded plant samples: raw 0–895, energy 0.1129–0.5325, maximum measured direct serial response 14.2 ms in this short run. `preset_live` preserved master at three levels across all 13 presets with outputs muted. Original synth, playing mode, output and mute restored; no captured firmware error lines. |
| Desktop installation | Native release build passed; installed executable matches the built SHA-256, portable `installers/windows/BECA.exe` refreshed, installed app relaunched and responding. Previous installed executable retained at `.beca-cache/beca-setup-before-instrument-deck.exe`. |
| Source checks | `git diff --check` passed. Neither root nor desktop `index.html` was edited; generated firmware header unchanged. No new dependency or BLE stack change. |

Firmware SHA-256: `64444A8DCB586702C8636D571210549987A172241FD12BE0F5B8018805D69070`.

Installed `%LOCALAPPDATA%/BECA/beca-setup.exe` SHA-256: `164190A7C9C7B9BB2D75123319A1419E65E57BED83D9D749481ED887157C1456`.

Browser tests emulate native responses; the device protocol check complements them but does not measure audible latency or recording quality. Bluetooth advertisement/reconnection and enterprise Wi-Fi were not exercised in this UI pass. Versioned NSIS/MSI installers were not published, and no commit or push was made.
