# Setup Installer Bundles

This folder is the single local mirror for BECA installers.

Platform folders:
- `windows/`
- `macos/`
- `linux/`

To sync from the latest published setup release (`setup-v*`), run:

```powershell
powershell -ExecutionPolicy Bypass -File tools/sync_setup_installers.ps1 -Clean
```

If no `setup-v*` release is published yet, the sync script exits with an error.

CI note:
- `.github/workflows/setup-installer-release.yml` auto-syncs this folder after successful installer builds (release or manual workflow dispatch).
