# BECA Installers (All OS)

If you are browsing the GitHub repository website, open:

`installers/`

Use the folder for your OS:
- `windows/` -> `BECA_0.1.7_x64-setup.exe`
- `macos/` -> `BECA_0.1.7_aarch64.dmg` for Apple Silicon or `BECA_0.1.7_x64.dmg` for Intel
- `linux/` -> `BECA_0.1.7_amd64.AppImage` or `BECA_0.1.7_amd64.deb`

Click the installer file on GitHub, then use the download button. Read `docs/user/READ_BEFORE_FIRST_LAUNCH.md` before opening the app.

Current app baseline in repo config:
- `0.1.7` (`apps/beca-setup/src-tauri/tauri.conf.json`)

Current beta note:
- installers may be unsigned until Windows and Apple signing certificates are configured
- unsigned installers are for beta testing only
- do not disable OS security protections to run a blocked download

If an OS folder is empty, pull latest published setup release assets into this mirror:

```powershell
powershell -ExecutionPolicy Bypass -File tools/sync_setup_installers.ps1 -Tag setup-v0.1.7 -Clean -RequireAllPlatforms
```

Repository automation:
- Running GitHub workflow `Build Setup Installer` also mirrors Windows/macOS/Linux installers into this folder on `master`.
