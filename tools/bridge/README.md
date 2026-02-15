# beca-bridge

Native BECA Serial -> MIDI bridge binary.

## Commands

```bash
beca-bridge list-serial
beca-bridge list-midi
beca-bridge run --serial-port COM5 --midi-port "BECA Serial MIDI"
beca-bridge test-note --midi-port "BECA Serial MIDI"
```

## Notes

- Parses BECA packets formatted as `@M <status_hex> <data1_hex> <data2_hex>`.
- Auto-reconnect is implemented in `run` mode.
- Dependency fallback logic is in `src/dependency.rs` and blocks unsafe source-build paths.
