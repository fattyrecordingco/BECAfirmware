# BECA Ableton Integration (Max for Live)

This folder adds an optional Ableton workflow. It does not replace the BECA web UI or existing firmware behavior.

## Included Files

- `ableton/m4l/BECA Control.maxproj`
- `ableton/m4l/BECA Control.maxpat` (editable source)
- `ableton/m4l/BECA Control.amxd` (device file)
- `ableton/m4l/pages/*.maxpat` (legacy native section pages)
- `ableton/m4l/beca_control_ui.js` (full `jsui` control surface; root copy for M4L load reliability)
- `ableton/m4l/beca_control_node.js` (root Node bootstrap for reliable `node.script` resolution)
- `ableton/m4l/beca_native_controller.js` (legacy native routing helper copy)
- `ableton/m4l/code/beca_control_node.js` (transport + protocol layer)
- `ableton/m4l/code/beca_native_controller.js` (legacy native routing helper source)
- `ableton/m4l/code/beca_control_ui.js` (full control surface source)
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

This also syncs:
- `ableton/m4l/code/`
- `ableton/m4l/assets/`
- `ableton/m4l/pages/`
- root `beca_control_ui.js` helper
- root `beca_control_node.js` bootstrap helper
- root `beca_native_controller.js` helper (legacy compatibility)
- both device names: `BECA Control.amxd` and `BECA Control v2.amxd`
- `BECA Control Native.amxd` (cache-busting alias for forced fresh load)
- `BECA Control Fresh.amxd` (additional fresh-load alias)

into the same Ableton User Library folder.

If `ableton/m4l/code/node_modules/` is present (after `npm install`), it is copied too so Serial mode works in User Library without a second install.

2. Copy `BECA Control.amxd` to your Max for Live MIDI Effects folder.
3. In Ableton, drop `BECA Control` on a MIDI track.
4. Place your instrument after it in the same track chain.

Note:
- `BECA Control.amxd` must be in Ableton's AMPF container format.
- `build_amxd.py` wraps the editable `.maxpat` into the loadable `.amxd`.

## Device UI Coverage

The Ableton UI now includes:

- Connection panel: mode (`HTTP`/`Serial`/`Mock`), IP/port fields, serial port + baud, connect/disconnect, refresh, auto reconnect, serial telemetry, re-emit/monitor mode.
- Hostname panel additions:
  - `Device` name field (for example `beca`)
  - `.local` toggle
  - `Connect .local` action (`<device>.local`)
- Plant monitor: scrolling normalized energy graph plus raw value display.
- MIDI monitor: last MIDI event and 12x8 note grid indicator.
- Performance controls mapped to firmware:
  - `mode`, `scale`, `root`, `clock`
  - `bpm`, `swing`, `sens`, `lo`, `hi`
  - `preset`, `outputmode`, `mute`, `sync`
  - `fx`, `pal`, `vs`, `vi`, `rest`, `nr`, `drumsel`
- Engine controls mapped to firmware synth params:
  - `wave_a`, `wave_b`, `osc_mix`, `mono`, `voices`
  - `attack`, `decay`, `sustain`, `release`
  - `filter`, `cutoff`, `resonance`
  - `reverb`, `delay_ms`, `delay_feedback`, `delay_mix`
  - `drive`, `master`, `detune`, `gain_trim`, `drumkit`, `preset_reset`
- Full single-surface `jsui` model:
  - one integrated BECA panel in presentation
  - all control groups (`Input`, `Output`, `Theory`, `LED FX`, `Engine`) from the BECA web model
  - auto-connect controls (`IP/Host`, `Port`, `Device`, `.local`, `Connect .local`)

## Connection and Auto-Connect

### Zero-Config Auto Connect

- On device load, backend auto-discovery starts immediately in HTTP mode.
- Discovery probes, in order:
  - last known BECA host
  - current host field value
  - `<device>.local` and `<device>`
  - common defaults (`beca.local`, `beca`, `beca-blk.local`, `beca-blk`, `192.168.4.1`)
  - local private subnet candidates (best-effort)
- If BECA is found, the backend updates host and connects automatically.
- Manual `Connect`/`Refresh` controls remain available as fallback.

### HTTP via IP

1. Select `HTTP` mode in the device.
2. Enter BECA IP/host + port (default `80`).
3. Click `connect`.
4. The status line should show `connected`.

### HTTP via Device Name (.local)

1. Enter BECA name in `Device` (for example `beca`).
2. Either:
   - enable `.local` and use `Connect`, or
   - click `Connect .local` directly.
3. Device connects to `http://<device>.local:<port>`.

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

## Exact Test Checklist

1. Build and sync:
   - Run: `python ableton/m4l/build_amxd.py --copy-user-library`
   - Confirm all variants are updated in repo and User Library:
     - `BECA Control.amxd`
     - `BECA Control v2.amxd`
     - `BECA Control Native.amxd`
     - `BECA Control Fresh.amxd`
     - `BECA Control Pro.amxd` (cache-busting alias)
2. Force fresh load in Live:
   - Remove all old BECA devices from the track.
   - Drag `BECA Control Pro` from User Library (cache-busting alias).
   - Confirm header shows `BECA Control` with a target signifier (`<device> @ <host>`).
3. Auto-discovery and signifier:
   - On load, confirm status goes through `ready/discovering/identified/connecting` to `connected`.
   - Confirm header shows `CONNECTED <host>:80` and device signifier `<device> @ <host>`.
   - In Max Console, confirm no `node.script` file-load error for `beca_control_node.js`.
   - Disconnect BECA network briefly; confirm status drops and auto-recovers back to `connected`.
4. Single-page layout and monitors:
   - In taller lanes (about `250+ px`), confirm `Input`, `Output`, `Theory`, `LED FX`, `Engine` render together in one dashboard page.
   - In shorter lanes, confirm adaptive fallback (tabs + paged controls) has no overlap/clipping.
   - Confirm plant graph updates continuously.
   - Confirm MIDI monitor (last note/velocity + activity bars) updates in real time.
   - If layout is cramped, use a taller device lane (target about `280-320 px`).
5. Control interaction semantics:
   - Encoders drag vertically and send live values.
   - Toggle controls act as on/off buttons.
   - Dropdown-style controls (`Mode`, `Output`, `Scale`, `Root`, `Clock`, `Time Sig`, `Preset`) change discrete options.
6. Output routing control:
   - Use top-row `BLE / SERIAL / AUX` buttons.
   - Confirm BECA output mode switches immediately and persists in returned state.
7. Full key mapping verification (`/api/set` and serial `SET`):
   - `mode`, `sens`, `lo`, `hi`
   - `outputmode`, `mute`, `sync`
   - `scale`, `root`, `clock`, `ts`, `bpm`, `swing`
   - `fx`, `pal`, `vs`, `vi`, `bright`, `rest`, `nr`, `drumsel`
   - `preset`, `preset_reset`, `wave_a`, `wave_b`, `osc_mix`, `mono`, `voices`
   - `attack`, `decay`, `sustain`, `release`
   - `filter`, `cutoff`, `resonance`
   - `reverb`, `delay_ms`, `delay_feedback`, `delay_mix`
   - `drive`, `master`, `detune`, `gain_trim`, `drumkit`
8. Stress test:
   - Sweep multiple controls for 10+ seconds.
   - Confirm no UI lockup, no status thrash, and continuous plant/MIDI updates.

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
- If the old compact native UI still appears, Live has loaded a stale device cache:
  - remove existing BECA devices from the track
  - remove stale `BECA Control.v2.amxd` if present
  - drag `BECA Control Pro.amxd` again from User Library
- Auto-connect misses BECA host:
  - verify BECA and Ableton machine are on the same network
  - set `Device` to your BECA mDNS name (without `.local`) and wait one discovery cycle
  - use `Connect .local` once; this also seeds future auto-connect host memory
- If status shows legacy mode warning:
  - backend detected firmware profile where `/api/state` redirects
  - device still auto-connects using `/api/info` + `/events` stream and adopts BECA-reported IP automatically
  - update firmware if you want full `/api/state`/`/api/params` polling path
- No MIDI output: ensure `Emit Mode = Reemit` and device is before instrument.
- External hardware silent: check Ableton track `MIDI To` target + channel.
- Missing serial ports in dropdown: install Node dependency (`npm install`) and refresh.
- If controls appear stale in serial mode: click `Refresh` to force `STATE/PARAMS/SYNTH` requests.
- If Ableton shows an older/non-interactive UI:
  1. Remove existing BECA devices from the track.
  2. Run `python ableton/m4l/build_amxd.py --copy-user-library`.
  3. Delete stale `BECA Control.v2.amxd` if it exists in User Library.
  4. Drag `BECA Control Pro` again from User Library.
  5. Confirm the header reads `BECA Control` and controls respond.

## Optional Mock Server

Run:

```bash
python tools/mock_beca/mock_beca_server.py
```

Then connect M4L in HTTP mode to:

- Host: `127.0.0.1`
- Port: `18080`
