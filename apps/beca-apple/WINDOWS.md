# BECA iPhone/iPad development from Windows

The correct project is [xtool-org/xtool](https://github.com/xtool-org/xtool). The similarly named [x-tools-author/x-tools](https://github.com/x-tools-author/x-tools) is a communications debugger, not an Apple app compiler.

This development path uses **xtool 1.21.0**, **Swift 6.4.0** and **Ubuntu 24.04 under WSL 2**. Upstream's matching SDK input is **Xcode 27.x**, downloaded from Apple. You do not run Xcode on Windows: xtool extracts its SDK. A Mac is not needed for this iPhone/iPad development workflow. This does not confer Apple approval, provide signing identities or implement BECA's proposed iPad USB driver. The existing Mac/Xcode build remains the Mac app path.

`Package.swift` references the four existing Swift source files in Swift 5 language mode, matching the Xcode project. `xtool.yml` copies `Web` into the app bundle root so the existing loopback server can find it. `prepare.mjs` generates the xtool plist from the shared Xcode plist, retaining permissions, version and orientation settings while allowing xtool to supply bundle identity and executable metadata. There are no new app dependencies or firmware changes; ESP32 Arduino **2.0.14** remains pinned.

## Local setup status — 11 October 2026

- Correct upstream source downloaded to `.beca-cache/apple-tools/xtool`, checked out at release `1.21.0` (`d76498a`).
- Linux x86-64 release downloaded to `.beca-cache/apple-tools/xtool-x86_64.AppImage` (55,753,208 bytes). SHA-256 matched GitHub's release digest: `e2277e59bb2fda9b487cbc77ad080ea2b0370bb740ac0f02cc42fa28a272d3a5`.
- Shared phone assets rebuilt, Apple resources prepared and the generated plist checked locally. Shell and PowerShell syntax checks and argument forwarding with paths containing spaces passed. All 29 shared app regression checks and the PWA asset verification passed.
- The initial non-elevated WSL installation failed with `0x80073d28`. On retry with user-approved Windows elevation, **WSL 2.7.13.0 and USBIPD 5.3.0 installed successfully**. The user restarted the laptop, and **Ubuntu 24.04 installed successfully**. Linux first-run setup, Swift and executable xtool remain unverified at this checkpoint.
- The retry corrected prerequisite probing for Windows PowerShell 5.1 and avoided the missing-WSL launcher, which can wait for keyboard input. Windows PowerShell 5.1 syntax and argument forwarding checks passed.
- No Apple SDK archive was found in the Windows Downloads folder. No Apple login, native xtool compilation, signing, device installation or publication was performed.

These are preparation checks. The previous Xcode build results in [README.md](README.md) do not validate this new Swift package path.

## 1. Install Windows prerequisites

From an **Administrator PowerShell**, in the BECA repository:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\apps\beca-apple\xtool-windows.ps1 -Step Prerequisites
```

The script installs WSL/Ubuntu and USBIPD. Finish the USBIPD installer. If Windows requests a restart, save your work and restart yourself. Then launch Ubuntu and create its Linux user/password:

```powershell
wsl --distribution Ubuntu-24.04
```

The scripts do not reboot Windows or authenticate with Apple automatically. See Microsoft's [WSL installation guide](https://learn.microsoft.com/en-us/windows/wsl/install) and [USB connection guide](https://learn.microsoft.com/en-us/windows/wsl/connect-usb).

## 2. Install the Linux tools

From a normal PowerShell in the repository:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\apps\beca-apple\xtool-windows.ps1 -Step Setup
```

Enter the Linux password for `sudo` when requested. This installs development utilities, Swift via the official Swiftly installer, and the pinned xtool AppImage. It reuses the verified cached AppImage when available and checks its digest before installing. xtool lives in `~/.local/share/beca-apple/`; the wrapper uses AppImage extraction mode so WSL does not require FUSE. The scripts load Swiftly and xtool paths on each invocation. See [Swift's Linux installation guide](https://www.swift.org/install/linux/) and [xtool's release-specific installation instructions](https://github.com/xtool-org/xtool/blob/1.21.0/Documentation/xtool.docc/Installation-Linux.md).

## 3. Add Apple's SDK and signing access

For the workflow-built IPA in [INSTALL-IPAD.md](INSTALL-IPAD.md), skip SDK extraction: xtool's `Install` step signs/installs a prebuilt binary. The SDK below is required for the local `Build`/`Run` steps. Apple authentication and device trust are still required for installation.

Sign in yourself at [Apple Developer downloads](https://developer.apple.com/download/all/?q=Xcode), accept the relevant agreements, and download the Xcode 27.x `.xip` required by the pinned xtool release. Use an SDK/toolchain pairing supported by upstream. Keep the archive outside the Git repository. Supply its real WSL path; this example is a placeholder:

```powershell
.\apps\beca-apple\xtool-windows.ps1 -Step SDK -ToolArguments @('install', '/mnt/c/Users/AJ/Downloads/Xcode_27.x.xip', '--slim')
.\apps\beca-apple\xtool-windows.ps1 -Step Doctor
```

`Doctor` reports the tool versions and SDK status and parses the Swift package. An absent SDK can still produce a successful status command; readiness requires it to actually report an installed Darwin SDK.

For a device install, authenticate in your own interactive terminal:

```powershell
.\apps\beca-apple\xtool-windows.ps1 -Step Auth
```

For a paid team, upstream recommends an App Store Connect **Team API key** with **App Manager** role. Free accounts use xtool's password/2FA mode, which relies on private Apple APIs. Do not put credentials in chat or project files. Apple's [account overview](https://developer.apple.com/help/account/basics/about-your-developer-account) describes free Personal Team limits, including seven-day provisioning. Before signing, change `bundleID` in `xtool.yml` if the default identifier is unavailable to your account.

## 4. Build, connect the iPhone/iPad and install

An unsigned native build can be attempted once the SDK is ready; it does not require Apple login:

```powershell
.\apps\beca-apple\xtool-windows.ps1 -Step Build
```

This first rebuilds the bundled interface on Windows, then runs `xtool dev build` in Ubuntu. Inspect `apps/beca-apple/xtool/BECAApple.app` after success. This output is not yet an installable signed release.

Connect and unlock the Apple device, enable Developer Mode when needed, and accept its trust prompts. In Administrator PowerShell, use `usbipd list` to identify that device and `usbipd bind --busid <actual-bus-id>` to share it. With Ubuntu running, attach it using `usbipd attach --wsl --busid <actual-bus-id>`. Select the Apple device, not BECA's CH340 interface. Do not copy example bus IDs blindly.

```powershell
.\apps\beca-apple\xtool-windows.ps1 -Step Devices
.\apps\beca-apple\xtool-windows.ps1 -Step Run
```

`Run` uses upstream's development provisioning/install workflow. Open BECA on the device after installation if it does not launch automatically. Follow [README.md](README.md)'s Wi-Fi + Bluetooth MIDI connection steps and physical acceptance checks. Close other BLE MIDI central connections before pairing. Detach the Apple USB device with `usbipd detach --busid <actual-bus-id>` when finished.

## Troubleshooting and release boundary

- **Administrator privileges / WSL unavailable:** complete step 1 in an elevated terminal, including any requested restart and Ubuntu's first launch. The current Codex terminal cannot install the required Windows package without elevation.
- **`swift`, `xtool` or library missing:** rerun `-Step Setup` in the same distribution. Keep Ubuntu at 24.04 for this installer. The wrapper verifies the download but still needs a functioning Linux runtime.
- **SDK extraction or version errors:** check the XIP path and free space, the official download's completeness, and upstream's supported Xcode/Swift pair. Never substitute an unofficial SDK archive.
- **Device absent / AFC mux errors:** check USB attachment, unlock/trust and `usbmuxd`. Upstream also documents a Windows Apple-device-service relay for mux failures in its installation guide. Do not change BECA's BLE stack to resolve a Windows installation transport issue.
- **App starts but interface is blank:** rerun preparation/build and confirm `BECAApple.app/Web/index.html` and `beca-synth.wasm` exist. `Web` must remain a directory at the bundle root.
- **Signing or entitlement failure:** use a bundle identifier owned by your team and the appropriate account. xtool does not grant DriverKit entitlements. The app continues to use native MIDI + Wi-Fi, with the existing bounded polling/write queues and state deduplication described in the README.

**TestFlight/App Store:** this checked-in xtool path is for development builds/installs. `build --sign --ipa` is not evidence of App Store distribution signing, upload support or approval. A release still requires Developer Program membership, an App Store Connect app, distribution signing, compliant packaging and metadata, upload/validation and review. Apple's [upload documentation](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/) describes its supported submission tools. The repository's existing GitHub macOS build workflow can be a basis for a separate signed release pipeline without owning a Mac. Mac signing/notarization is likewise separate. None of these release steps is claimed complete here.
