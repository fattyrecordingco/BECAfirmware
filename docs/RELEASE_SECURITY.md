# Release Security Checklist

Use this for `setup-v0.1.7` and later BECA desktop releases.

## Windows

Sign and verify the Windows setup executable and MSI with a real code-signing certificate:

```powershell
$installer = "installers\windows\BECA_0.1.7_x64-setup.exe"
$msi = "installers\windows\BECA_0.1.7_x64_en-US.msi"

signtool sign /fd SHA256 /td SHA256 /tr http://timestamp.digicert.com /a $installer
signtool sign /fd SHA256 /td SHA256 /tr http://timestamp.digicert.com /a $msi

signtool verify /pa /v $installer
signtool verify /pa /v $msi
Get-AuthenticodeSignature $installer
Get-FileHash -Algorithm SHA256 $installer
& "$env:ProgramFiles\Windows Defender\MpCmdRun.exe" -Scan -ScanType 3 -File $installer
```

If SmartScreen still warns after signing, submit the signed installer to Microsoft for review. Do not tell users to disable SmartScreen.

## macOS

Build with a Developer ID Application certificate and notarization credentials configured in CI. Verify the DMG:

```bash
security find-identity -v -p codesigning
codesign --verify --deep --strict --verbose=2 "BECA.app"
xcrun notarytool submit "installers/macos/BECA_0.1.7.dmg" --keychain-profile "BECA-notary" --wait
xcrun stapler staple "installers/macos/BECA_0.1.7.dmg"
spctl -a -vv --type open "installers/macos/BECA_0.1.7.dmg"
shasum -a 256 "installers/macos/BECA_0.1.7.dmg"
```

## Linux

Publish checksums and a detached signature:

```bash
cd installers/linux
sha256sum BECA_0.1.7_amd64.AppImage BECA_0.1.7_amd64.deb > SHA256SUMS
gpg --armor --detach-sign SHA256SUMS
dpkg-deb --info BECA_0.1.7_amd64.deb
lintian BECA_0.1.7_amd64.deb || true
```

## Required CI Secrets

- `WINDOWS_CERTIFICATE`: base64-encoded Windows code-signing `.pfx`
- `WINDOWS_CERTIFICATE_PASSWORD`: password for the `.pfx`
- `APPLE_CERTIFICATE`: base64-encoded Developer ID Application `.p12`
- `APPLE_CERTIFICATE_PASSWORD`: password for the `.p12`
- `KEYCHAIN_PASSWORD`: temporary CI keychain password
- `APPLE_ID`: Apple ID email for notarization
- `APPLE_PASSWORD`: app-specific password for notarization
- `APPLE_TEAM_ID`: Apple Developer Team ID

