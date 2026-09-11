# BECA manual & quick start

App 0.2.0 · firmware 1.1.0 · ESP32-PICO-V3 · September 2026

BECA turns changes at its plant electrodes into notes, rhythms and synthesized sound. Use it as a MIDI source for your instruments, play its sound engine through Aux, or record both together. Keep the BECA app open when using the USB MIDI bridge.

## First BECA: installing a unit shipped without code

A blank BECA needs firmware once before it makes music. Its USB serial chip can appear on your computer while the ESP32 is empty. No lights, MIDI, Wi-Fi network or working controls are expected before installation.

1. Download the matching BECA 0.2.0 installer from the [official release](https://github.com/fattyrecordingco/BECAfirmware/releases/tag/setup-v0.2.0). Read its signing status and compare its checksum with SHA256SUMS.
2. Install the app. Connect BECA directly to the computer using a USB-C **data cable**. Avoid unpowered hubs while installing firmware.
3. Open BECA → **Setup**. USB scans automatically. If several compatible USB devices appear, choose BECA's port. Unplugging and reconnecting BECA identifies which port belongs to it. A CH340/CP210x description identifies a USB bridge; it does not prove BECA firmware is installed.
4. Under **upload firmware**, choose **Included 1.1.0 · works offline** and press **install firmware**. The installer includes the bootloader, partition table, first-boot data and application. You do not need Arduino IDE, Python, PlatformIO or a GitHub account.
5. Leave USB connected until completion. Allow approximately 15 seconds for reboot and discovery. Transfers may take longer if the app retries at a lower baud rate.
6. Connect BECA's plant sensor lead. Attach its leaf and soil electrodes according to the supplied sensor hardware; keep exposed contacts separated. Open **Performance** when the device is ready.
7. Follow the Aux or DAW quick start below. Wi-Fi is optional for both USB workflows.

If the board cannot enter its bootloader, hold its labelled **BOOT** button, briefly press **EN/RESET**, start installation, and release BOOT once writing begins. Use only buttons exposed and labelled for your board. If the enclosure hides them, the seller must supply a supported recovery method. Do not short unknown pins. Automatic reset depends on the board's USB reset wiring.

The app checks firmware SHA256 before writing and skips the settings partition at 0x9000–0xdfff. Installation preserves settings on the supported layout and refuses unknown layouts. Reinstalling firmware is not a routine fix for a wrong Wi-Fi password.

## Installing the app

**Windows 64-bit:** use `BECA_0.2.0_x64-setup.exe`. The MSI is available for managed installation. WebView2 is required; its included bootstrapper may need internet if WebView2 is absent. The included firmware works offline after app installation.

If no USB port appears, install the matching board driver from [WCH CH340/CH341](https://www.wch-ic.com/downloads/CH341SER_EXE.html) or [Silicon Labs CP210x](https://www.silabs.com/software-and-tools/usb-to-uart-bridge-vcp-drivers). Restart if the driver installer requests it. Driver packages are not redistributed inside BECA. A charge-only cable cannot carry firmware or MIDI.

**macOS:** choose the `aarch64.dmg` for Apple Silicon or `x64.dmg` for Intel. Open it, drag BECA into Applications, eject the DMG and open the installed app. In Setup choose **BECA (virtual MIDI)** to create a native MIDI source named BECA while the bridge runs. No IAC bus is required for that destination. An existing IAC bus also works.

**Linux:** install the amd64 `.deb`, or mark the `.AppImage` executable and run it. ALSA MIDI and USB serial permissions are required. On Debian/Ubuntu, add your user to `dialout` if access is denied, then sign out and back in. Choose **BECA (virtual MIDI)** and connect its source to your DAW using its MIDI preferences or your ALSA/PipeWire routing tool. Distribution routing differs.

Release notes identify signing status. Unsigned Windows builds and unnotarized Mac builds do not provide production signing trust. Do not disable SmartScreen or Gatekeeper. Signed public distribution needs the publisher's certificates and notarization credentials.

## Quick start: Aux audio

1. Connect Aux to a mixer, suitable powered speaker input, or an audio interface line input. Begin with monitoring low.
2. In Performance choose **Output → Aux audio** and allow the audio startup guard to finish.
3. Try **Moss Bells**, master **0.25**, tempo **100–120 BPM**, a major/minor scale and sensitivity around **0.25**. Raise monitoring gradually.
4. Explore the sound pad, presets and Mutate sound. Longer notes/releases suit pads; shorter notes suit plucks.
5. To record, create a DAW audio track receiving the interface input connected to Aux. USB carries control and MIDI, not USB audio.

Choose **Serial MIDI + Aux** to play both. Starting the bridge from Aux requests combined mode automatically. After a hardware reboot, select combined output again: firmware boots Aux-capable modes in MIDI for predictable audio startup.

## Quick start: Windows → Ableton or another DAW

Current BECA hardware uses a USB serial bridge. It cannot become class-compliant USB MIDI through an ESP32 firmware update. Windows needs a virtual MIDI cable between the app and DAW. After that cable and the DAW track are configured, BECA remembers routing and reconnects automatically.

1. Install [loopMIDI from its developer](https://www.tobias-erichsen.de/software/loopmidi.html), following its terms. Create a port named **BECA** and enable loopMIDI's **autostart**. Its port exists while loopMIDI runs; closing its configuration normally leaves it in the tray.
2. In BECA → Setup → **MIDI routing**, refresh outputs. Choose **BECA** as split 1's Destination, input/output **All / Keep**, note range **0–127**, transpose **0**, MicroFreak off. Press **Start MIDI bridge**. A successful start saves the route.
3. Leave **Automatically connect my saved splits** checked. Later, start the virtual cable and open BECA; plugging in the device starts saved routing. A missing destination stays unavailable; BECA never silently substitutes another output.
4. In Ableton's Settings/Preferences → **Link, Tempo & MIDI** (wording varies), enable input **Track** for BECA. **Remote** is optional for mappings; **Sync** can stay off initially. An ordinary note source does not need a Control Surface script.
5. Create a MIDI track, load an instrument, set **MIDI From → BECA**, select its channel and arm the track. Monitor **Auto** while armed or **In** to hear continuously. Record to capture the notes.

In other DAWs, enable the same input in MIDI preferences, select it on an instrument track, and enable monitoring/record arm. Some DAWs enumerate ports only at startup: start the virtual port and bridge before opening them, or rescan/reopen the DAW.

**LoopBe already installed?** Choose **LoopBe Internal MIDI** in BECA and the DAW; that is the displayed port name. Never send the DAW's output back to the same virtual cable: feedback can make LoopBe mute itself. Its developer requires a commercial-use license beyond evaluation and a separate redistribution license. BECA does not bundle LoopBe.

**Microsoft GS Wavetable Synth** plays the computer's built-in synth. It does not send notes into Ableton. For DAWs choose BECA/LoopBe/IAC; for hardware instruments choose their MIDI output directly.

## MIDI splits and multiple instruments

Routing lives on **Setup only**. Add up to eight splits, each with destination, enable switch, input channel, output channel, note range and transpose. **All** accepts every channel; **Keep** preserves the source channel. Ranges apply before transposition; transposed notes outside 0–127 are dropped.

Example: route all notes to BECA on channel 1 for bass. Add another full-range split to BECA on channel 2, transposed +12, for a pad. Create two DAW tracks receiving those channels. Alternatively use separate virtual cables/hardware outputs, or narrower ranges.

Press **Apply splits** to commit edits or removal. Held routed notes release before changes. Invalid ranges or a missing new destination leave the running routes intact and keep your draft visible. **Release MIDI notes** clears tracked held notes while Aux continues. **Stop MIDI bridge** suspends automatic restart for this app session. Uncheck automatic connection to keep it off across launches.

MicroFreak mode maps supported melodic messages to channel 1 and excludes channel 10 percussion. Use it only for a destination needing that behavior.

## Playing and exploring

**Performance** brings musical, synth, timing, effects and light controls together. Controls send while moving and share USB with MIDI. Rapid edits coalesce to the newest value per control, up to 20 writes/second. Multiple changes are responsive sequential updates, not sample-accurate automation or an atomic scene.

The sound pad controls two parameters: Tone / bite, Space / echo, or Drift / grit. Arrow keys adjust the focused pad; Shift gives fine movement. **Mutate sound** explores timbre while preserving groove, master and output choice. **Undo gesture** restores the previous gesture/mutation/variation sound; changing presets resets undo.

Save sound variations in A–D. These live in this computer's app storage and exclude MIDI routing and master volume. **Focus controls** brings parameter editing forward. **Control** is the compact hardware-style surface with an on-screen encoder.

New Aux sounds are **Dewdrop Glass, Moon Garden, Moss Bells, Firefly Pluck, Bubble Reed** and **Pollen Drift**, alongside the original six. The engine runs on BECA. An Aux preset does not change the software instrument you loaded in your DAW.

### Raw Sensor Sine

**Raw Sensor Sine** maps ADC1 directly to frequency: reading 440 means 440 Hz. Phase stays continuous with no pitch glide. It bypasses scale, sensitivity, tempo, envelopes, filters, detune, drums and effects. Master still applies; begin quietly.

Sampling normally occurs every 8 ms; audio uses 128-sample blocks at 44.1 kHz plus DMA/scheduling latency. Direct means the next processed reading, not zero physical latency. ADC numbers describe measurement electronics, not an acoustic waveform produced by the plant. This is a sonification mapping.

### Drums and lights

**MIDI drums · CH 10** is separate and controls percussion notes for an external drum instrument/DAW drum rack. This release has no active Aux drum section. Pure Aux hides MIDI percussion; combined output can play melodic Aux plus MIDI percussion. Route channel 10 to drums and other channels to melodic instruments.

The LED effect, palette, speed, intensity and brightness controls drive the physical LEDs. Ten effects are available. Encoder/status feedback can temporarily take priority before idle animation returns. Zero brightness or intensity can hide effects. The app's leaf display represents state; it does not measure physical light output.

## Wi-Fi, BLE and plant data

Wi-Fi is optional for USB MIDI/Aux. Setup supports **2.4 GHz personal networks**. It does not implement WPA2-Enterprise identity/certificates, captive-portal sign-in or 5 GHz-only networks. ASK4 enterprise sign-in is not supported through this form. Do not submit enterprise credentials as a personal-network password.

Stop the bridge before saving/rebooting Wi-Fi settings. Scan networks, choose one, enter credentials and **save & reboot**. Use the displayed `.local` address or IP from the same network for browser control. Client isolation can prevent discovery even when connected. USB remains available. Recovery retries are bounded; it does not repeatedly erase credentials or reboot on authentication failure.

**BLE MIDI** remains a separate output mode. Use your platform's Bluetooth MIDI workflow; Bluetooth audio pairing is different. Mac provides this in Audio MIDI Setup. Windows DAW support varies and may need a BLE-MIDI utility. USB is the documented first connection. BLE and Serial + Aux are separate choices, not an all-transports mode.

The local diagnostic assistant checks stale/invalid readings, saturation and variation, and retries recoverable reads with bounded delays. It does not rewrite code, guess credentials, diagnose plant health or use a trained AI. Quiet can be normal. Normalized energy is bounded to 0–1. Plant-jack detection is disabled by default, so unplugged electrodes may still produce varying readings; a graph alone does not prove a plant connection.

## Troubleshooting

- **No USB:** try a known data cable/direct port and matching driver. The app checks every three seconds. Choose BECA explicitly when several candidates appear.
- **USB present, controls unavailable:** a blank unit needs included firmware. Otherwise close other serial monitors, reconnect and allow boot. Only one app can own the serial port.
- **Bridge unavailable:** start the saved virtual cable and refresh outputs. Check the exact destination name. Connection attempts use bounded intervals.
- **MIDI meter moves but no sound:** load an instrument, enable its input, match channels and arm/monitor. MIDI alone is not audio.
- **Aux silent:** choose Aux/Serial MIDI + Aux, unmute, raise master, allow startup and check cable/interface monitoring. Record Aux on an audio track.
- **Held notes:** use Setup → Release MIDI notes. Route edits, stop and disconnect release tracked notes too. Avoid virtual-cable feedback.
- **Controls interrupted:** wait for reconnection. Failed writes are not replayed later; reapply the desired setting once ready. Do not open a second serial monitor.
- **Interrupted installation:** reconnect and reinstall included firmware; use BOOT/RESET if required. Flashing cannot fix a charge-only cable.
- **Checksum mismatch:** obtain the official matching package again. Do not edit checksums or force a damaged image.
- **Static lights:** raise brightness/intensity, select an effect and wait for status feedback to end. Software tests cannot rule out wiring/power faults.

## Before shipping the first unit

Confirm the exact ESP32 board, 4 MB flash, supported pin assignments, partition layout, data cable and automatic reset wiring. Blank devices cannot advertise BECA over BLE or make sound before installation. Include the matching installer link, this guide and accessible recovery instructions.

A single-install branded Windows MIDI experience on this hardware requires a licensed virtual driver with a BECA endpoint. [LoopBe offers branded bundling](https://www.nerds.de/en/loopbe1.html). A future USB-native hardware design can expose class-compliant USB MIDI. Neither is an invisible firmware capability of today's serial chip. Production distribution also needs Windows signing and Apple notarization credentials.

An Ableton Max for Live instrument is a separate development item. This update works with ordinary MIDI tracks and does not include an `.amxd` instrument. See the [Ableton instrument plan](https://github.com/fattyrecordingco/BECAfirmware/blob/master/docs/research/ableton-instrument-plan.md).

## Reference sources

[Ableton virtual MIDI setup](https://help.ableton.com/hc/en-us/articles/209774225-Setting-up-a-virtual-MIDI-bus) · [loopMIDI/autostart](https://www.tobias-erichsen.de/software/loopmidi.html) · [LoopBe licensing](https://www.nerds.de/en/loopbe1.html) · [Espressif flash sectors](https://docs.espressif.com/projects/esptool/en/release-v4/esp32/esptool/basic-commands.html) · [BECA updates](https://github.com/fattyrecordingco/BECAfirmware)
