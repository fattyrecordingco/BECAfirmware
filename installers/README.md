# BECA Installers

Use this folder first when distributing a local release package.

- `windows/` contains the Windows setup executable and MSI when synced.
- `macos/` contains the notarized DMG when synced.
- `linux/` contains the AppImage and `.deb` when synced.

Before first launch, read:
- [docs/user/READ_BEFORE_FIRST_LAUNCH.md](../docs/user/READ_BEFORE_FIRST_LAUNCH.md)

To refresh this mirror from the latest published `setup-v*` release:

```powershell
powershell -ExecutionPolicy Bypass -File tools/sync_setup_installers.ps1 -Clean -RequireAllPlatforms
```

