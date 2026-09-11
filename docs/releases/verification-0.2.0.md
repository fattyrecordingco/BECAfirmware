# Verification for BECA 0.2.0

Local Windows checks, 11 September 2026. Firmware remains on ESP32 Arduino core **2.0.14** with BLE-MIDI 2.2.0, MIDI Library 5.0.2, NimBLE-Arduino 1.4.3 and FastLED 3.10.3.

## Results

- Firmware compiles: program 1,342,121 / 3,145,728 bytes; RAM 104,804 / 327,680 bytes. The complete release image includes bootloader, partitions, boot_app0 and application.
- 17 bridge tests, 11 flasher tests and 4 native app tests pass. Added flasher checks reject truncated/unknown-layout images and damaged checksums, and prove that the settings address range is excluded from writes.
- Real C++ audio regression checks pass with extended features both enabled and disabled. Four local diagnostic-rule tests pass.
- 56 Playwright desktop/narrow checks pass, including routing in Setup only, saved automatic startup, persistent opt-out, Stop remaining stopped, slow-discovery independence and the offline manual. After the final Setup spacing adjustment, all 10 layout/accessibility checks passed again.
- Actual COM4 device check returned 13 presets and 40 bounded plant samples: ADC1 0–573, normalized energy 0.1923–0.6568, maximum observed direct serial response 16.6 ms. Every live preset preserved master at 0, 0.17 and 1 while muted; original sound/output/mute settings were restored.
- Both Windows EXE and MSI built. The NSIS installer completed with exit code 0 and installed app version 0.2.0 plus the firmware resources. Its installed EXE differs from the standalone build only by Tauri's three-byte NSIS bundle marker.
- The installed app restored Performance, connected its saved LoopBe route, and showed live plant/MIDI readings. Setup showed the included firmware and sole MIDI split editor.
- Installing the included firmware from the installed app succeeded on the ESP32-PICO-V3. The app stopped its bridge, wrote the two firmware regions without the NVS gap, rebooted, retained the device name, and automatically reconnected the saved MIDI route.
- Ableton Live 12 Suite's MIDI settings list **LoopBe Internal MIDI** as an enabled input. That is the port's real name on this computer. A Windows port named BECA requires the documented virtual-cable setup or licensed branded driver.

The installed-app test exposed a long subnet scan blocking USB startup. USB candidates now bypass that sweep; firmware and MIDI output loading run before control discovery. Network-only discovery prioritizes supplied addresses/names and has an eight-second budget; unfinished tasks are cancelled.

## Local artifact hashes

- Installed NSIS app: `ccbe2cd0374a92447133b01fed3fd85864c401e040e297bfab2dedce8a3dcdfb`
- Windows setup EXE: `204a65d52d4bac7729d4124fe9bace9f53734e5a0c8d10133f4585ee2a1ee976`
- Windows MSI: `2f715b1a603cc47e2bbc794dd3bdd599d7ad23ba547802e55fc713ab783700f8`

GitHub rebuilds have their own hashes, published in the release's SHA256SUMS. Do not compare a downloaded CI installer against these local build hashes.

## Limits

The physical unit tested already contained firmware; a fully erased second unit was not available. Blank-unit coverage comprises the complete boot image, flash-layout tests and installing that full image on the connected device without erasing its user settings. No destructive factory erase was used.

Audio/DAC quality and physical LED brightness were not measured. Earlier actual USB/LoopBe verification exercised combined Aux, all ten logical LED effects, live controls and note cleanup; see [that report](../research/live-routing-verification.md). BLE libraries are unchanged; a fresh radio pairing/reconnect test has not been completed. Mac/Linux native MIDI ports are compiled in CI but require platform runtime validation. This is not a guarantee for every DAW, driver, cable or network.

No production code-signing certificate is installed on the local machine. Local installers are unsigned; release metadata and the manual disclose this. Enterprise Wi-Fi and a Max for Live instrument are not implemented in this update.
