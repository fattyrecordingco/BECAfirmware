# BECA instrument interface

BECA is played and listened to. Its interface should let a musician select a sound, choose how the plant plays, perform, and understand the response without working through a dashboard.

## Reference principles

Study the original product documentation and interfaces rather than copying skins or assets:

- [FabFilter Twin 3 interface overview](https://prod.fabfilter.com/help/twin/using/overview): identifiable oscillator, filter, envelope, modulation and effects sections; sound controls next to the feedback they explain.
- [Arturia Pigments](https://www.arturia.com/products/software-instruments/pigments/overview): consistent colour for sources and modulation, animated feedback tied to sound, and a focused playing surface.

BECA retains its own brand, leaf feedback and sensor identity. References guide grouping and interaction; they do not justify fake controls or unsupported synthesis features.

## Layout contract

1. **Play:** mode selector, preset, master, play/test, mute/panic, and input connection. One clear primary action for the current connection state.
2. **Feedback:** plant trace, current MIDI notes/velocity, and audio/output status. Compact, stable, readable while playing.
3. **Mode:** Notes, Arp, Chords or Drums. Only show controls actually used by the selected mode. Hide rather than grey out irrelevant modules. Apply the same visibility immediately after a gesture and after an incoming device state change.
4. **Sound:** oscillators, envelope, filter, effects and voice settings in signal order. Group related controls; avoid a card for every parameter.
5. **Settings:** network/MAC/hotspot, connection help, routing where supported, and diagnostics/console. Keep secondary tasks out of the playing surface.

A shared parameter stays accessible in every mode that uses it. Hiding a module must preserve its saved values and must not change the device. Output routing and instrument mode are separate decisions.

## Visual contract

- Use a restrained instrument surface with compact borders and radii, a consistent spacing scale, monochrome surfaces and green accents only. Do not introduce cyan, amber, orange or other accent colours. Setup can use the light BECA utility surface.
- Size controls for fingers and keyboard focus. Labels and live values must fit at 360 px; tablet landscape must use the space without giant empty cards.
- Keep scopes and MIDI display mounted across mode and tab changes. Data updates must not move surrounding controls.
- Preserve the plant trace, note feedback and existing useful signal data. Additional diagnostic numbers belong in expandable detail.
- Never simulate feedback with decorative random animations. Use real sensor/MIDI/audio data.
- No external font downloads, new UI frameworks, stock imagery, or dependency changes merely to achieve a visual style.

## Interaction contract

- Every visible control has a working, labelled behavior. Use native buttons/ranges/selects or accessible equivalents with keyboard and touch support.
- Provide clear active mode/preset states, real units, safe ranges, and recoverable changes. Panic is always easy to reach.
- Preserve parameter coalescing, state-diff rendering, watchdog-safe firmware behavior, and bounded transport polling.
- Browser playback must receive actual ordered MIDI events. Panic on lost events, backgrounding, interruption and disconnect; never synthesize musical events from a scope snapshot.
- Distinguish hardware testing from simulated browser verification. An attractive screenshot does not prove audio, BLE or network behavior.

## Acceptance review

Check each mode on a small phone, iPad/tablet portrait and landscape, and desktop. Check long labels, modal/help navigation, mode changes during playback, no clipping or horizontal page overflow, accessible contrast/focus, held notes and release, drums, panic, reconnect, and retained settings. Capture screenshots of the finished views and run relevant interaction and audio tests.

For the device player, rebuild in this order: phone assets, `python3 tools/build_device_player.py`, `python3 make_index_header.py`, then firmware with ESP32 core 2.0.14. Prepare the Apple resource bundle after phone changes. Rebuild the desktop executable and installers after desktop changes.
