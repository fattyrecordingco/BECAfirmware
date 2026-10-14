# BECA UI copy

Use the language of an instrument: Mode, Notes, Arp, Chords, Drums, Preset, Filter, Envelope, Effects, Master, Play, Mute, Panic, MIDI, Wi-Fi. Use the firmware's real control names and units.

Every visible sentence must serve one purpose: identify a control, report its current state, explain a consequence needed to make a choice, or give the next action after a failure. Delete sentences that serve none of these purposes.

## Required practice

- Prefer a label and value over a paragraph: `Cutoff · 2.4 kHz`, `Wi-Fi disconnected`, `No MIDI input`.
- Keep button labels as actions. Say what actually happens: `Connect`, `Play`, `Copy MAC`, `Save Wi-Fi`.
- Use one status for one condition. Do not repeat the same connection instructions in banners, headers, cards and footers.
- Put drivers, permissions, network limitations and troubleshooting steps in Settings or Help. Keep musical controls visible while playing.
- Keep feature claims tied to implemented behavior. Mark unavailable hardware or browser features accurately.
- Use errors with a concrete next step. Never display credentials, stack traces or raw protocol failures in normal performance controls.
- Retain established musical terminology. Add a short tooltip only when a control is genuinely unfamiliar.

## Reject before merging

- Marketing filler: “Your device. Your sound.”, “Unleash creativity”, “A seamless experience”.
- Assistant narration: “Local assistant”, “AI is watching your signal”, “Your changes are sent in real time”.
- Decorative metaphors in functional labels: “MIDI note garden”, “Living signal”, “Sound journey”. BECA's leaf visual can remain; its label is MIDI.
- Dashboard language: “Metrics”, “Session summary”, “Insights”, “Overview” where a musical control or monitor is meant.
- Invented capabilities, embellished adjectives, faux tutorials embedded between every control, and statements about implementation internals that do not affect a user's decision.

These are writing rules, not a blind keyword filter. A real technical error or a document quoting an example may contain these words. Judge the actual visible context.

Run `python3 tools/check_ui_copy.py` after changing UI copy. It rejects known filler phrases; the contextual review above remains required.
