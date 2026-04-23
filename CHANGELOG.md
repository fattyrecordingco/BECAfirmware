# CHANGELOG

## 2026-02-28 - BECA Control M4L Milestone (feature/ableton-m4l-control)

### Added

- Ableton-node readiness bootstrap in `beca_control_ui.js` so init commands wait until `node.script` is ready.
- Pending-value protection in `jsui` merge path to reduce stale poll overwrite during rapid edits.
- Additional M4L transport debug lines (`[BECA] ...`) for set/write diagnostics in Max Console.

### Changed

- M4L write path now matches BECA web UI behavior first:
  - legacy endpoint-style parameter writes are attempted first (`/mode`, `/scale`, `/root`, `/lo`, `/hi`, `/ts`, etc.),
  - modern `POST /api/set` is kept as fallback.
- HTTP transport set pipeline hardened:
  - single-flight set dispatch,
  - retry/backoff on transient failures,
  - state resync after set completion,
  - polling guards while set queue is in-flight.
- `BECA Control.maxpat` updated for fixed-height (`169 px`) compact lane behavior and improved accessibility.
- Build flow (`ableton/m4l/build_amxd.py`) now treats `BECA Control.amxd` as the single canonical AMXD and removes legacy aliases during sync/copy.

### Removed

- Legacy AMXD aliases:
  - `BECA Control v2.amxd`
  - `BECA Control Native.amxd`
  - `BECA Control Fresh.amxd`
  - `BECA Control Pro.amxd`
- Deprecated native-page controller stack:
  - `ableton/m4l/beca_native_controller.js`
  - `ableton/m4l/code/beca_native_controller.js`
  - `ableton/m4l/pages/*.maxpat`

### Fixed

- Resolved `node.script not ready can't handle message ...` startup race by deferring init message burst until Node readiness is observed.
- Resolved UI interactions freezing/snap-back behavior where controls changed visually but reverted before backend state commit.
- Preserved full control-key mapping parity for BECA processing while maintaining existing `/api/set` and serial `SET` semantics.

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
