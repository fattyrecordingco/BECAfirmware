# BECA Control Node Layer

Run this once inside this folder if serial mode is needed:

```bash
npm install
```

HTTP mode works without extra packages. Serial mode uses `serialport`.

Files:

- `beca_control_node.js`: transport/protocol layer (HTTP + serial + mock).
- `beca_control_ui.js`: `jsui` frontend used by the M4L device.
