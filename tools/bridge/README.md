# beca-bridge

Native BECA Serial -> MIDI bridge binary.

On macOS/Linux, `BECA (virtual MIDI)` creates a native source named BECA through midir's existing CoreMIDI/ALSA backend. The source exists while the bridge is running. Windows requires an installed virtual MIDI cable; choose its exact output name. The app's Setup editor remembers routes and offers automatic connection.

## Commands

```bash
beca-bridge list-serial
beca-bridge list-midi
beca-bridge run --serial-port COM5 --midi-port "BECA Serial MIDI"
beca-bridge run --serial-port COM5 --midi-port "MicroFreak" --microfreak-mode
beca-bridge run --serial-port COM5 --midi-port "Ableton Loop" --secondary-midi-port "MicroFreak" --secondary-microfreak-mode
beca-bridge test-note --midi-port "BECA Serial MIDI" --secondary-midi-port "MicroFreak"
```

## Notes

- Parses BECA packets formatted as `@M <status_hex> <data1_hex> <data2_hex>`.
- Auto-reconnect is implemented in `run` mode.
- `--microfreak-mode` rewrites melodic note traffic to MIDI channel `1`, drops drum notes from channel `10`, and only forwards `CC123` for note cleanup.
- `--secondary-midi-port` mirrors the same BECA performance to a second MIDI destination.
- Dependency fallback logic is in `src/dependency.rs` and blocks unsafe source-build paths.


## Shared app session and editable routes

The app and CLI use `session::BridgeSession`: one USB owner, bounded requests, partial-line framing, heartbeat, verified reconnect, and owned-note cleanup. The CLI remains at 115200 baud; its historical `--reconnect-ms` argument is accepted for compatibility, while the shared worker uses a 500 ms initial retry delay, then 1 second between handshake attempts. The app's control API uses the same worker; a separately launched CLI process cannot share its open port with another app process.

`routing::MidiRoute` provides eight editable destination/channel/note-range/transpose splits. Routing tracks actual note destinations, deduplicates identical layers and releases the original destinations on Note Off or velocity-zero Note On. Channel 10 is MIDI percussion. The desktop editor persists applied configurations locally and releases held notes when routes change. Missing/ambiguous ports are errors, not automatic substitutions.

Run unit regressions with `cargo test -p beca-bridge --lib`. On a machine with BECA and an installed MIDI loopback, `cargo run -p beca-bridge --example verify_live -- COM4 "LoopBe Internal MIDI"` checks real USB controls, combined Aux, ten LED effects, routed MIDI input and note cleanup. It temporarily changes musical/light settings and restores them, including on a test failure. Close the app and other serial users before this hardware test. A physical audio/LED observation is still needed to verify analog sound and LED wiring/brightness.
