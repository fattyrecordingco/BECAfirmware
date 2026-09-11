# Installed build and verification — 11 September 2026

This records the earlier audio/recovery pass. The later [Performance interaction pass](performance-interaction.md) supersedes the installed app/firmware hashes below and adds the instrument deck, variations, XY control and level-preserving live presets.

The local desktop executable was rebuilt, copied to the existing installation at `%LOCALAPPDATA%/BECA/beca-setup.exe`, and relaunched. The portable `installers/windows/BECA.exe` was refreshed. Existing published versioned installers were not regenerated or published. Firmware was compiled for ESP32 Arduino **2.0.14** and flashed successfully to the identified ESP32-PICO-V3 on **COM4**, with flash hashes verified and the settings partition retained.

## What changed

- Dedicated Performance page, six open control groups, live input updates, serialized/coalesced writes, state reconciliation and stale-response protection.
- Six new AUX textures plus raw ADC1 → Hz sine. Existing presets and BLE libraries remain compatible.
- Live envelope/mono/polyphony fixes, stable master gain at high drive, paired swing preserving tempo, completed drum decay, finite DSP values and reduced per-sample math.
- Local rule-based signal diagnostics, bounded read retries and saved-network recovery after startup failures. This is not a trained model or autonomous code rewriting.
- A pinned, isolated Windows build helper. The run exposed shared SCons replacement by different PlatformIO Core versions and Xtensa include failures from excessively long paths. The helper uses Core 6.2.0 and a private short-path package cache; firmware stays on Arduino 2.0.14.

## Results and scope

| Check | Result |
| --- | --- |
| Firmware build and COM4 upload | Passed with `tools/build_firmware.ps1 -UploadPort COM4`. |
| Desktop frontend/native release build | Passed; installed and built executable SHA-256 values match. |
| Playwright | **26 passed**, covering desktop/narrow layout, accessibility, simultaneous editing, serial request ordering, preset edits, rejected writes, stale data, initial reconnect and existing Setup/Control behavior. Fixtures emulate native responses; this is not an end-to-end radio latency test. |
| Local health rules | **4 passed**: retry budget/reset, invalid data, distinct quiet/rail/disconnect explanations, stopped timestamps and bounded history. |
| Actual C++ audio host checks | Passed: raw-sine PCM/phase at 440/1234/4095 Hz and silence, held sustain, voice retirement/stealing/mono, repeated gain sanitization, presets, finite values, all drum parts/kits decaying, and swing pair duration. Six-preset fallback also compiled/tested before the final mono-only assertion was added. |
| Final device smoke check | 13 presets returned; 40 plant samples bounded; raw ADC1 range **0–475**, energy **0.1640–0.2398**; maximum measured direct serial response **13.9 ms** in this short run. This is not app or audible end-to-end latency. |
| Final AUX protocol test | All seven added presets selected and AUX start/test/mute responded; original synth, playing mode, output and mute restored; no firmware error lines captured. No acoustic loopback or DAC recording was available, so sound quality/physical sine frequency is not certified by this test. |
| Bluetooth | Test scanner reported the Windows radio powered off. Source still advertises `BECA BLE-MIDI`; live advertisement/connection/reconnect could not be verified. |
| Wi-Fi | BECA sees `ASK4 Wireless (802.1x)` in its 2.4 GHz scan. The computer is connected to that SSID with PEAP enterprise authentication on 5 GHz. BECA is **not connected** to ASK4 yet. |
| Working tree | `git diff --check` passed. Root `index.html` was not edited, so its generated header is unchanged. |

Firmware image SHA-256: `17306B3EF7534CB093726909834A0F29F581FDC3742BF5CD2DACA262C8BBF3A6`.

Installed app SHA-256: `A23CEC873B133297AD4302C0DF9B1C96227FC96BD76CEB75CCCA2758C9B14CC1`.

## ASK4 still needs enterprise provisioning

The password was not written to source, logs or settings. The current BECA provisioning form only configures ordinary SSID/password networks. ASK4's enterprise network requires the ASK4 account username/password; the Windows profile uses PEAP with server validation enabled. Its configured trust certificate was not found in the inspected Windows certificate stores. Complete a proper enterprise provisioner using the login identity and provider-trusted CA/server configuration, then test association, DHCP, reboot/reconnect and local client reachability. Do not send the enterprise password as a personal-network PSK or disable certificate validation to force a connection. [ASK4 connection types](https://support.ask4.com/hc/en-gb/articles/28865739257757-How-do-I-choose-the-right-WiFi-or-wired-package), [Espressif 4.4 enterprise Wi-Fi support](https://docs.espressif.com/projects/esp-idf/en/v4.4.4/esp32/api-guides/wifi.html)

“Any Wi-Fi” cannot include 5 GHz-only networks on this board. Captive portals, enterprise certificates, managed-network registration and client isolation also need explicit support or network configuration. The supplied password alone does not resolve these requirements.

Compatibility check: the installed Arduino 2.0.14 SDK exposes PEAP-MSCHAPv2, identity/password and CA-certificate configuration in `esp_wpa2.h`. It does not expose the newer `esp_eap_client_set_domain_name` API. The enterprise implementation therefore needs an explicit review of ASK4's certificate trust requirements against this pinned SDK, as well as provisioning UI/protocol changes. Supplying the password to the current personal-Wi-Fi command would not implement enterprise authentication.

## Next engineering priorities

1. Finish secure ASK4 enterprise provisioning once the missing identity/certificate configuration is available.
2. Give MIDI note-off/panic priority under queue or serial congestion, and acknowledge SSE state only after successful transmission. These baseline review findings remain open.
3. Replace per-command serial open/settle with a tested persistent session/shared bridge protocol. Current native serial control includes a 160 ms Windows settle delay (320 ms on macOS), so immediate UI input is not a promise of zero transport latency. Multi-parameter scene recall also needs an atomic batch protocol.
4. Capture long real sensor sessions with known electrode states and timing. Improve signal-quality classification from measured baselines; keep raw counts separate from musical normalization. A learned classifier needs labeled recordings and independent validation, not assumptions about plant emotions or health.
5. Implement the [native Ableton instrument plan](ableton-instrument-plan.md): MIDI input, local DSP, automatable parameters, preset mapping, panic/reconnect, and optional raw telemetry. The existing `.amxd` is still a controller, not this new instrument.

For primary-source plant-device comparisons and full baseline findings, see [firmware review](firmware-review.md). The implemented tests and bounded recovery reduce known failures; they cannot guarantee that every future error will repair itself.
