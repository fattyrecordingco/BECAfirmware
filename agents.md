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
- If changing the BLE stack, document the exact library versions used.
- If touching SSE or web UI, include rate limiting and state-diff strategy.
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