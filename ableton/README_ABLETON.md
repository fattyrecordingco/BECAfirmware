# BECA Ableton Integration (Max for Live)

This folder adds an optional Ableton workflow. It does not replace the BECA web UI or existing firmware behavior.

## Included Files

- `ableton/m4l/BECA Control.maxproj`
- `ableton/m4l/BECA Control.maxpat` (editable source)
- `ableton/m4l/BECA Control.amxd` (device file)
- `ableton/m4l/code/beca_control_node.js` (transport + protocol layer)
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

2. Copy `BECA Control.amxd` to your Max for Live MIDI Effects folder (copy, do not move).
2. In Ableton, drop `BECA Control` on a MIDI track.
3. Place your instrument after it in the same track chain.

Note:
- `BECA Control.amxd` must be in Ableton's AMPF container format.
- `build_amxd.py` wraps the editable `.maxpat` into the loadable `.amxd`.

## Connection Modes

### HTTP via IP

1. Select `HTTP` mode in the device.
2. Enter BECA IP + port (default `80`).
3. Click `connect`.
4. The status line should show `connected`.

### Serial

1. Select `Serial` mode.
2. Click `list_serial_ports` and choose a port from the dropdown.
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

- `bpm`, `scale`, `root`, `preset`, `sens`
- Plus mode/connection controls and telemetry toggles.
- Advanced keys are available through the Node layer using `set_param <key> <value>` messages.

## HTTP Endpoints Used

- `GET /api/state`
- `GET /api/plant`
- `GET /api/notes`
- `GET /api/params`
- `POST /api/set` (`key`, `value`)
- `GET/POST /api/synth` (optional synth panel work)

## Serial Protocol Used

Outbound from M4L to BECA:

- `@C STATE`
- `@C PLANT`
- `@C NOTES`
- `@C SET <key> <value>`
- `@C TELEMETRY 1|0`

Inbound to M4L from BECA:

- `@R STATE {...}`
- `@R PLANT {...}`
- `@R NOTES {...}`
- `@M ss d1 d2` (existing serial MIDI hex)
- Optional telemetry JSON lines:
  - `{"type":"plant",...}`
  - `{"type":"midi",...}`

## Rate Limiting and Stability

- Parameter updates are debounced/queued to about 15 updates/sec max.
- State polling is slow (`~4 Hz`) and plant/notes polling is fast (`~25 Hz`).
- On disconnect, HTTP mode retries when auto reconnect is enabled.

## Troubleshooting

- No HTTP connection: verify BECA IP, same network, and firewall.
- No serial connection: close Arduino Serial Monitor/other apps using the same port.
- No MIDI output: ensure `Emit Mode = Reemit` and device is before instrument.
- External hardware silent: check Ableton track `MIDI To` target + channel.
- Missing serial ports in dropdown: install Node dependency (`npm install`) and refresh.

## Optional Mock Server

Run:

```bash
python tools/mock_beca/mock_beca_server.py
```

Then connect M4L in HTTP mode to:

- Host: `127.0.0.1`
- Port: `18080`
