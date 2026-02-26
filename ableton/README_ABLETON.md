# BECA Ableton Integration (Max for Live)

This folder adds an optional Ableton workflow. It does not replace the BECA web UI or existing firmware behavior.

## Included Files

- `ableton/m4l/BECA Control.maxproj`
- `ableton/m4l/BECA Control.maxpat` (editable source)
- `ableton/m4l/BECA Control.amxd` (device file)
- `ableton/m4l/beca_control_ui.js` (root `jsui` script target for M4L load reliability)
- `ableton/m4l/code/beca_control_node.js` (transport + protocol layer)
- `ableton/m4l/code/beca_control_ui.js` (`jsui` control surface)
- `ableton/m4l/code/package.json`
- `tools/mock_beca/mock_beca_server.py` (optional test server)

## Requirements

- Ableton Live 11 or 12 with Max for Live.
- BECA firmware with the additive endpoints in this branch.
- For Serial mode in the M4L device: run `npm install` in `ableton/m4l/code` (installs `serialport`).

## Install

1. If you edited `BECA Control.maxpat`, rebuild `BECA Control.amxd` first:

```bash
python ableton/m4l/build_amxd.py --copy-user-library
```

This also syncs `ableton/m4l/code/`, `ableton/m4l/assets/`, and a root-level `beca_control_ui.js` helper into the same Ableton User Library folder.

2. Copy `BECA Control.amxd` to your Max for Live MIDI Effects folder.
3. In Ableton, drop `BECA Control` on a MIDI track.
4. Place your instrument after it in the same track chain.

Note:
- `BECA Control.amxd` must be in Ableton's AMPF container format.
- `build_amxd.py` wraps the editable `.maxpat` into the loadable `.amxd`.

## Device UI Coverage

The Ableton UI now includes:

- Connection panel: mode (`HTTP`/`Serial`/`Mock`), IP/port fields, serial port + baud, connect/disconnect, refresh, auto reconnect, serial telemetry, re-emit/monitor mode.
- Plant monitor: scrolling normalized energy graph plus raw value display.
- MIDI monitor: last MIDI event and 12x8 note grid indicator.
- Performance controls mapped to firmware:
  - `mode`, `scale`, `root`, `clock`
  - `bpm`, `swing`, `sens`, `lo`, `hi`
  - `preset`, `outputmode`, `mute`, `sync`
  - `fx`, `vs`, `vi`, `rest`, `nr`, `drumsel`
- Engine controls mapped to firmware synth params:
  - `wave_a`, `wave_b`, `osc_mix`, `mono`, `voices`
  - `attack`, `decay`, `sustain`, `release`
  - `filter`, `cutoff`, `resonance`
  - `reverb`, `delay_ms`, `delay_feedback`, `delay_mix`
  - `drive`, `master`, `detune`, `gain_trim`, `drumkit`

## Connection Modes

### HTTP via IP

1. Select `HTTP` mode in the device.
2. Enter BECA IP + port (default `80`).
3. Click `connect`.
4. The status line should show `connected`.

### Serial

1. Select `Serial` mode.
2. Click `Refresh` and choose a port.
3. Set baud (`115200` default).
4. Click `connect`.
5. Optional: enable serial telemetry toggle.

### Mock

Use `connect_mock` for UI testing without hardware.

## MIDI Routing

- To play an Ableton instrument: keep `BECA Control` first, instrument second on the same MIDI track.
- To route to external hardware (for example MicroFreak): set the track `MIDI To` to your external port/channel.
- `Emit Mode`:
  - `Reemit`: note events are emitted from the device into Ableton.
  - `Monitor`: no note output, UI monitor only.

## BECA Parameters Exposed in Device

- Full parameter mapping through `POST /api/set` / serial `SET` keys.
- UI labels are intentionally kept close to web-UI naming.

## HTTP Endpoints Used

- `GET /api/state`
- `GET /api/plant`
- `GET /api/notes`
- `GET /api/params`
- `POST /api/set` (`key`, `value`)
- `GET /api/synth`

## Serial Protocol Used

Outbound from M4L to BECA:

- `@C STATE`
- `@C PARAMS`
- `@C SYNTH`
- `@C PLANT`
- `@C NOTES`
- `@C SET <key> <value>`
- `@C TELEMETRY 1|0`

Inbound to M4L from BECA:

- `@R STATE {...}`
- `@R PARAMS {...}`
- `@R SYNTH {...}`
- `@R PLANT {...}`
- `@R NOTES {...}`
- `@M ss d1 d2` (existing serial MIDI hex)
- Optional telemetry JSON lines:
  - `{"type":"plant",...}`
  - `{"type":"midi",...}`

## Rate Limiting and Stability

- Parameter updates are queued/debounced to about `15 updates/sec` max.
- State polling is low-rate (`~4 Hz`), plant/notes high-rate (`~25 Hz`), synth medium-rate.
- On disconnect, HTTP mode retries when auto reconnect is enabled.
- Serial parser ignores malformed lines and keeps the UI responsive.

## Troubleshooting

- No HTTP connection: verify BECA IP, same network, and firewall.
- No serial connection: close Arduino Serial Monitor/other apps using the same port.
- No MIDI output: ensure `Emit Mode = Reemit` and device is before instrument.
- External hardware silent: check Ableton track `MIDI To` target + channel.
- Missing serial ports in dropdown: install Node dependency (`npm install`) and refresh.
- If controls appear stale in serial mode: click `Refresh` to force `STATE/PARAMS/SYNTH` requests.

## Optional Mock Server

Run:

```bash
python tools/mock_beca/mock_beca_server.py
```

Then connect M4L in HTTP mode to:

- Host: `127.0.0.1`
- Port: `18080`
