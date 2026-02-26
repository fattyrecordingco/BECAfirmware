# CHANGELOG

## 2026-02-26 - Ableton Integration (feature/ableton-m4l-control)

### Added

- Optional Ableton integration folder under `ableton/` with:
  - `m4l/BECA Control.maxproj`
  - `m4l/BECA Control.maxpat`
  - `m4l/BECA Control.amxd`
  - `m4l/code/beca_control_node.js` transport layer
  - `README_ABLETON.md`
- Optional mock HTTP server for M4L testing: `tools/mock_beca/mock_beca_server.py`.
- Full M4L control-surface UI (`jsui`) with:
  - connection manager (HTTP/Serial/Mock),
  - plant oscilloscope,
  - MIDI activity monitor (last-event + 12x8 grid),
  - performance and engine parameter pages mapped to firmware keys.

### Firmware (additive only)

- New HTTP endpoints:
  - `GET /api/state`
  - `GET /api/plant`
  - `GET /api/notes`
  - `GET /api/params`
  - `POST /api/set` (`key`, `value`)
- New serial control commands (additive):
  - `@C STATE`, `@C PLANT`, `@C NOTES`
  - `@C SET <key> <value>`
  - `@C TELEMETRY 1|0`
  - `@C PARAMS`, `@C SYNTH`
- Optional serial JSON telemetry lines (default off) for plant/midi events.

### Docs

- Added `README` section: `11A) Ableton Integration (Max for Live)`.
- Added full Ableton setup and routing guide in `ableton/README_ABLETON.md`.

### Fixed

- `ableton/m4l/BECA Control.amxd` is now shipped in Ableton-loadable AMPF format (instead of raw JSON).
- Added `ableton/m4l/build_amxd.py` to regenerate and optionally copy the AMXD into Ableton User Library.
- Hardened M4L `jsui` pointer handling for Live panel coordinate variants (`onclick`/`ondrag`/`onmousedown` fallback path).
- Added compact section-page UI model (`All`, `Input`, `Output`, `Theory`, `LED FX`, `Engine`) for small Ableton device heights.
- Build/copy flow now keeps both `BECA Control.amxd` and `BECA Control v2.amxd` synchronized to avoid stale Live loads.
- Added native Max page architecture (`ableton/m4l/pages/*.maxpat`) and `beca_native_controller.js` to replace `jsui` interaction as primary control path.
- Main M4L patch now uses standard Max controls for connection + monitoring + section switching, reducing click-hitbox issues in Ableton panel.
- Switched main patch controller load to root `js beca_native_controller.js` and synced root helper on deploy to avoid subfolder script resolution failures in Live.
