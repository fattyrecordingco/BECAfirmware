# BECA Firmware

BECA is a plant-played music instrument for ESP32-PICO-V3 that turns subtle bio-capacitive changes into expressive MIDI notes, drum hits, and visual feedback, giving musicians a tactile way to perform with living plants while keeping the firmware stable, low-latency, and Arduino-IDE friendly.

## Features

- BLE-MIDI device advertising as `BECA BLE-MIDI` for wireless performance.
- Plant sensor mapping with normalization, smoothing, and energy extraction.
- Web UI with oscilloscope-like scope, note grid, and drum UI.
- SSE streaming with state diffs and throttled scope updates for smoothness.
- Optional FastLED feedback with selectable effects and palettes.

## System Architecture

```text
Plant Sensor (GPIO 34/35)
        |
        v
Normalization + Smoothing
(EMA, baseline, noise floor)
        |
        v
Event Engine
(modes, clock, scale, drums)
    |           |            |
    v           v            v
BLE-MIDI Out   UI SSE      LED State
(notes/vel)  (state/scope) (FastLED)
```

## Repo Layout

Observed in this backup:

- `BECAfinalsv02.ino` - Main firmware sketch: sensing, music logic, BLE-MIDI, web UI, provisioning, LED FX.
- `logo.svg` - Source logo asset.
- `make_logo_header.py` - Utility to gzip the logo into a C header.
- `logo_svg.h` - Generated gzipped logo byte array served by firmware.
- `README.md` - Project documentation.

Assumption: This project follows the typical Arduino web-enabled layout even if not present here:

- `data/` or `web/` - Optional static assets for SPIFFS/LittleFS (if externalized).
- `docs/` - Additional build or usage notes.
- `lib/` - Local Arduino libraries or third-party copies.

## Getting Started

### Hardware

- ESP32-PICO-V3 (or equivalent ESP32 board).
- Plant sensor electrodes connected to analog-capable pins (GPIO 34 and GPIO 35).
- Optional WS2812B LED strip (example: 8 LEDs on GPIO 19).
- Power source suitable for ESP32 + LEDs.

### Arduino IDE Setup

- Install ESP32 Arduino core, tested with version `2.0.14`.
- Install libraries:
- Arduino MIDI Library.
- BLE-MIDI transport with NimBLE (use NimBLE `1.4.3` if compatibility issues occur).
- WiFi/WebServer (from ESP32 core).
- FastLED (optional, if LEDs are used).

### Build and Flash

1. Open `BECAfinalsv02.ino` in Arduino IDE.
2. Select the ESP32 board profile matching your hardware.
3. Verify core and library versions.
4. Build and upload.

### Web UI and SSE

- On first boot or after Wi-Fi reset, the device starts a setup AP. Connect and open the setup page to provision Wi-Fi.
- Once on the network, open the main UI from the device IP or mDNS name.
- The UI displays plant energy (0..1), a MIDI note grid, and a drum selector with hit indicators.
- SSE streams incremental state changes and throttled scope updates to avoid flooding the browser.

### BLE-MIDI Connection Notes

- iPad typically discovers `BECA BLE-MIDI` directly in the MIDI Bluetooth picker.
- Windows often does not list BLE-MIDI devices in standard Bluetooth settings.
- If Windows does not show the device, use a BLE-MIDI bridge or driver workflow (example: a BLE-MIDI to virtual MIDI tool), then route to your DAW.
- If BLE pairing is flaky, power-cycle the ESP32 and ensure Wi-Fi modem sleep is enabled when BLE is active.

## Configuration

- Device name: set near the top of the sketch (Assumption: a `DEVICE_NAME` or similar constant). BLE advertises `BECA BLE-MIDI`.
- Sensitivity, noise floor, and smoothing: typically configured with constants such as EMA alpha, baseline tracking, or noise tracking. Adjust carefully and validate stability.
- Persistent settings: Wi-Fi credentials are stored via `Preferences` in NVS. Assumption: most musical parameters are runtime-only unless explicitly saved.

## Troubleshooting

- Symptom: `NimBLEDevice.h` missing. Likely cause: NimBLE library removed or incompatible version. Fix: install NimBLE and use a known-good version (example: `1.4.3`) with ESP32 core `2.0.14`.
- Symptom: device shows on iPad but not Windows. Likely cause: Windows Bluetooth UI does not expose BLE-MIDI. Fix: use a BLE-MIDI bridge/driver workflow or a MIDI routing tool to create a virtual MIDI port.
- Symptom: Web UI lag or SSE flooding. Likely cause: scope updates too frequent or diff throttling disabled. Fix: verify SSE throttling and only send state diffs.
- Symptom: random BLE disconnects when Wi-Fi is enabled. Likely cause: BLE/Wi-Fi coexistence contention. Fix: enable Wi-Fi modem sleep when BLE is active and reduce heavy Wi-Fi traffic.
- Symptom: no plant response or stuck energy value. Likely cause: sensor wiring, wrong analog pin, or baseline/noise settings too aggressive. Fix: verify GPIO 34/35, check grounding, and adjust smoothing/noise constants.

## Roadmap

- Additional sound engines and musical presets.
- More robust Windows BLE-MIDI bridging guidance.
- Packaging and documentation improvements for workshops and performances.

## Contributing

TBD. Please keep changes minimal, stable, and compatible with Arduino IDE workflows.

## License

TBD.