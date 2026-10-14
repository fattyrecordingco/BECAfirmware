# Agents Guide for BECA

## Mission

Keep BECA stable, universally user-friendly, and easy to compile and flash in Arduino IDE.

## Non-Negotiables

- Do not break stable BLE-MIDI behavior.
- Avoid heavy refactors unless required for a clear bug fix or safety issue.
- Keep watchdog-safe patterns like `delay(0)` or `yield()` where the loop could stall.
- Avoid adding dependencies that increase fragility or version conflicts.

## Development Workflow for Agents

- Always identify the ESP32 core version and confirm compatibility (target `2.0.14`).
- Unless the user explicitly asks otherwise, apply completed changes all the way through the local test path: rebuild the app or firmware artifacts that changed, update the locally runnable app or connected device when feasible, and run the relevant verification so the user can test the actual product experience instead of only source edits.
- If changing the BLE stack, document the exact library versions used.
- If touching SSE or web UI, include rate limiting and state-diff strategy.
- If editing `index.html`, always run `python3 make_index_header.py` and include the updated `index_html.h` in the final changes.
- Provide full sketches or complete patches, not partial snippets.
- Update troubleshooting notes when connectivity behavior changes.

## Testing Checklist

- Compile test with ESP32 core `2.0.14`.
- Verify BLE advertisement name and connection behavior.
- Web UI loads, SSE updates are steady, and no event flooding.
- Plant input normalization produces stable, bounded energy values.
- Optional LED feedback does not block the main loop.

## Change Types Allowed

- Safe refactors (naming, factoring constants, clarifying structure).
- Feature additions behind compile-time flags.
- Bug fixes with minimal delta.

## Style and Documentation Rules

- Keep code comments short and practical.
- Prefer explicit state machines for mode handling.
- Maintain consistent naming for sensor to energy to event flow.
- Every new feature must add a README section or update an existing one.

## Instrument UI and copy rules

Every user-facing app change must follow [Instrument UI](docs/design/INSTRUMENT_UI.md) and [UI Copy](docs/design/UI_COPY.md). These apply to the device pages, phone/Apple interface, desktop Control/Performance, and setup/help surfaces.

- The product is a musical instrument. Put mode, sound, play, master and panic within reach; setup and diagnostics belong in secondary views.
- Show mode-specific controls only in the mode that uses them. Shared controls remain shared. Never change a saved value merely because its control is hidden.
- Preserve the plant scope and MIDI feedback as performance feedback, with bounded updates and no geometry changes on incoming data.
- Run `python3 tools/check_ui_copy.py` after visible UI copy changes, and review context against the copy rules.
- Use actual instrument labels and short actionable connection states. Do not add slogans, assistant narration, invented terminology, repeated captions, or decorative status cards.
- Keep touch targets, visible focus, keyboard control, contrast, and small-screen layout usable. Verify phone/tablet portrait and landscape and desktop.
- Preserve exact source note-on/off/channel events for external MIDI playback. A scope snapshot is not a note stream.
- Rebuild generated firmware pages and embedded browser assets when their source changes.

### Review roles

Use these roles as review checklists. Delegate separate implementation areas when the user asks for parallel agents; otherwise perform the reviews within the active task.

1. **Instrument designer:** map the signal and sound workflow; group controls by synthesis stage; decide which controls belong in each mode; preserve every supported feature.
2. **Interaction reviewer:** verify playing with one hand, touch/keyboard precision, immediate mode changes, stable layout, and clear recovery after disconnect or interruption.
3. **Audio/transport reviewer:** check note-off delivery, panic, queue overflow, reconnect, muted outputs, real-time budgets, and unchanged BLE behavior.
4. **Copy editor:** remove text that does not name a control, describe its current state, or help the user take a necessary action. Keep long guidance in help/documentation.

These reviews must produce concrete edits and test evidence, not design pitches or UI prose about the review process.
