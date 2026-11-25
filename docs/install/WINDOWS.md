# Install BECA on Windows

For Windows x64. App 0.3.1 includes firmware 1.2.1.

- [Download the complete Windows folder ZIP](https://github.com/fattyrecordingco/BECAfirmware/releases/download/apps-v0.3.1/BECA-Windows-0.3.1.zip)
- [Download the EXE installer](https://github.com/fattyrecordingco/BECAfirmware/releases/download/apps-v0.3.1/BECA_0.3.1_x64-setup.exe)
- [Download the MSI installer](https://github.com/fattyrecordingco/BECAfirmware/releases/download/apps-v0.3.1/BECA_0.3.1_x64_en-US.msi)
- [Release notes and checksums](https://github.com/fattyrecordingco/BECAfirmware/releases/tag/apps-v0.3.1)

## Install and connect

1. Download the EXE, or download the ZIP and choose **Extract All**. Keep the extracted folder together. Use the EXE for a normal installation; the MSI is an alternative for managed installations. Install only one.
2. Run the installer and follow its prompts. If WebView2 is missing, its installation can require internet. This release is unsigned: check the release source and checksum. If Windows blocks installation, leave its protections enabled and use the [web app](https://fattyrecordingco.github.io/BECAfirmware/) while publisher signing remains outstanding.
3. Connect BECA using a USB-C **data** cable. Open **BECA → Setup** and select the device's port if several are listed. Close Arduino Serial Monitor and other apps using that port.
4. For a blank device or an older firmware version, choose **Included 1.2.1** and **install firmware**. Keep USB connected until completion and allow BECA to restart. Firmware installation does not require Arduino IDE or a source build.
5. Open **Performance** or **Control**, choose Notes, Arp, Chords or Drums, and select the output you intend to hear. Use Aux with an audio interface or powered speaker input; USB serial carries controls and MIDI, not USB audio. See the [sound and DAW quick start](../user/READ_BEFORE_FIRST_LAUNCH.md#quick-start-aux-audio).
6. Choose **Light** or **Dark** in the app's appearance selector. Plant and MIDI feedback stay available while changing modes; drum controls appear only in Drums.

For MIDI in a Windows DAW, follow the [virtual MIDI cable and routing steps](../user/READ_BEFORE_FIRST_LAUNCH.md#quick-start-windows--ableton-or-another-daw). The installer does not create a third-party virtual MIDI cable.

## If it does not connect

- **No port:** try a known data cable and another USB port. Check Device Manager for the board's adapter. Use the matching [WCH CH340/CH341 driver](https://www.wch-ic.com/downloads/CH341SER_EXE.html) or [Silicon Labs CP210x driver](https://www.silabs.com/software-and-tools/usb-to-uart-bridge-vcp-drivers) if Windows has no driver.
- **Port busy:** close Serial Monitor, serial terminals and other BECA instances, then reconnect.
- **Bridge says Live, but Ableton's MIDI input meter is still:** match the split destination to the MIDI input in Live and enable its **Track** switch. If you use **LoopBe Internal MIDI**, check **Mute** in the LoopBe1 notification-area menu. Remove any routing back into the same virtual cable before unmuting it. Test with BECA in **Notes**, **Clock → Internal**, **Follow DAW clock** off and outputs unmuted. [LoopBe1 feedback detection](https://www.nerds.de/en/loopbe1.html)
- **Firmware installed but no Wi-Fi:** wait for reboot, then power-cycle BECA. Use the device's setup access point and numeric `192.168.4.1`; `.local` names may not resolve there. Reflashing is not needed for a wrong Wi-Fi password.
- **No sound:** verify the selected output, master level and mute state. A DAW also needs an instrument and monitoring enabled. Use Panic to release held browser/app notes.
- **Internal clock plays, but Plant clock stays silent:** check the plant scope. If the raw reading stays at zero, reseat the plant lead and check both electrode contacts. On firmware with jack detection disabled, a connected indicator cannot confirm contact.

Live with Max for Live can also play BECA over USB without a virtual cable. Close the desktop app to free the serial port. On a track with **BECA Instrument**, open **Connect**, enter the COM port and press **Enter**, then choose **Connect USB** and set **Note source → BECA device**. This route plays the instrument inside Live. Use the desktop bridge and a Live MIDI input to record editable MIDI clips. [BECA Instrument setup](../../ableton/instrument/README.md#hardware-controls)

[Full manual](../user/BECA_MANUAL.md) · [Firmware build and recovery tools](../../tools/release/README.md) · [Windows build script](../../tools/build_setup_windows.ps1)
