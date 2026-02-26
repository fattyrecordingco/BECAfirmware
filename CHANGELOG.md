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
- Optional serial JSON telemetry lines (default off) for plant/midi events.

### Docs

- Added `README` section: `11A) Ableton Integration (Max for Live)`.
- Added full Ableton setup and routing guide in `ableton/README_ABLETON.md`.
