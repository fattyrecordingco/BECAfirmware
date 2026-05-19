# BECA Installers

Use this folder first when distributing a local release package or downloading directly from the GitHub repository website.

- `windows/` contains the Windows setup executable and MSI when synced.
- `macos/` contains the DMG when synced.
- `linux/` contains the AppImage and `.deb` when synced.

Before first launch, read:
- [docs/user/READ_BEFORE_FIRST_LAUNCH.md](../docs/user/READ_BEFORE_FIRST_LAUNCH.md)

Current beta builds may be unsigned until code-signing certificates are configured. Use them for testing only, verify the checksum, and do not disable OS security protections to run a blocked download.

To refresh this mirror from the latest published `setup-v*` release:

```powershell
powershell -ExecutionPolicy Bypass -File tools/sync_setup_installers.ps1 -Clean -RequireAllPlatforms
```
