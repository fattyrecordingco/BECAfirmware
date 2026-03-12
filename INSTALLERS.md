# BECA Setup Installers (All OS)

If you downloaded the `master` ZIP, open:

`apps/beca-setup/dist-installer/`

Use the folder for your OS:
- `windows/` -> `BECA Setup_*_x64-setup.exe`
- `macos/` -> `BECA Setup_*.dmg`
- `linux/` -> `BECA Setup_*.AppImage` (or `.deb`)

Current app baseline in repo config:
- `0.1.3` (`apps/beca-setup/src-tauri/tauri.conf.json`)

If an OS folder is empty, pull latest published setup release assets into this mirror:

```powershell
powershell -ExecutionPolicy Bypass -File tools/sync_setup_installers.ps1 -Tag setup-v0.1.3 -Clean -RequireAllPlatforms
```

Repository automation:
- Running GitHub workflow `Build Setup Installer` also mirrors Windows/macOS/Linux installers into this folder on `master`.
