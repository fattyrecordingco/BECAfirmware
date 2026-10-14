#!/usr/bin/env python3
"""Stage complete, version-checked public downloads without local signing material."""
from __future__ import annotations

import argparse
import hashlib
import json
import plistlib
import re
import shutil
import struct
import tempfile
import zipfile
from pathlib import Path, PurePosixPath
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
APPLE_HELPERS = (
    "xtool-windows.ps1", "xtool-wsl.sh", "apple-device-bridge.ps1",
    "WINDOWS.md", "INSTALL-IPAD.md",
)
UNSAFE_PARTS = {".git", ".beca-cache", ".cache", "node_modules", "__pycache__", "_codesignature"}
UNSAFE_SUFFIXES = {".p12", ".pfx", ".pem", ".key", ".mobileprovision", ".provisionprofile"}
PHONE_REQUIRED = {
    "index.html", "app.css", "app.js", "protocol.js", "webusb-serial.js", "tablet-link.js",
    "phone-audio.js", "wifi-provider.js", "audio-engine.js", "audio-worklet.js", "beca-synth.wasm",
    "manifest.webmanifest", "service-worker.js", "plant-arp.js", "compatibility.js", "apple-native.js",
}


def fail(message: str) -> None:
    raise ValueError(message)


def safe_name(name: str) -> None:
    path = PurePosixPath(name.replace("\\", "/"))
    if path.is_absolute() or ".." in path.parts or any(":" in part for part in path.parts):
        fail(f"Unsafe archive path: {name}")
    lower = [part.lower() for part in path.parts]
    if any(part in UNSAFE_PARTS or part.startswith(".env") for part in lower):
        fail(f"Cache, environment or signature material cannot be distributed: {name}")
    if path.suffix.lower() in UNSAFE_SUFFIXES or any(re.search(r"(?:credential|secret|private[-_]?key|auth[-_]?token)", part) for part in lower):
        fail(f"Possible credentials cannot be distributed: {name}")


def required_file(path: Path) -> Path:
    if path.is_symlink() or not path.is_file() or path.stat().st_size == 0:
        fail(f"Missing, empty or symlinked required file: {path}")
    safe_name(path.name)
    return path


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def macho_has_signature(data: bytes) -> bool:
    """Inspect load commands, including universal binaries, rather than guessing from filenames."""
    if len(data) < 4:
        return False
    magic = data[:4]
    if magic in (b"\xca\xfe\xba\xbe", b"\xbe\xba\xfe\xca", b"\xca\xfe\xba\xbf", b"\xbf\xba\xfe\xca"):
        endian = ">" if magic[0] == 0xca else "<"
        fat64 = magic in (b"\xca\xfe\xba\xbf", b"\xbf\xba\xfe\xca")
        if len(data) < 8:
            fail("Truncated Mach-O universal header")
        count = struct.unpack_from(endian + "I", data, 4)[0]
        width = 32 if fat64 else 20
        if count > 32 or 8 + count * width > len(data):
            fail("Invalid Mach-O universal header")
        for index in range(count):
            offset, size = struct.unpack_from(endian + ("QQ" if fat64 else "II"), data, 8 + index * width + 8)
            if offset + size > len(data):
                fail("Invalid Mach-O universal slice")
            if macho_has_signature(data[offset:offset + size]):
                return True
        return False
    formats = {b"\xce\xfa\xed\xfe": ("<", 28), b"\xcf\xfa\xed\xfe": ("<", 32),
               b"\xfe\xed\xfa\xce": (">", 28), b"\xfe\xed\xfa\xcf": (">", 32)}
    if magic not in formats:
        return False
    endian, offset = formats[magic]
    if len(data) < offset:
        fail("Truncated Mach-O header")
    count, command_bytes = struct.unpack_from(endian + "II", data, 16)
    end = offset + command_bytes
    if count > 10000 or end > len(data):
        fail("Invalid Mach-O load commands")
    for _ in range(count):
        if offset + 8 > end:
            fail("Truncated Mach-O command")
        command, size = struct.unpack_from(endian + "II", data, offset)
        if size < 8 or offset + size > end:
            fail("Invalid Mach-O command size")
        if command == 0x1d:
            if size < 16:
                fail("Invalid Mach-O signature command")
            if struct.unpack_from(endian + "I", data, offset + 12)[0]:
                return True
        offset += size
    return False


def verify_ipa(path: Path, version: str) -> None:
    with zipfile.ZipFile(required_file(path)) as archive:
        infos = archive.infolist()
        if sum(info.file_size for info in infos) > 512 * 1024 * 1024:
            fail("IPA is unexpectedly large")
        if len({info.filename for info in infos}) != len(infos):
            fail("IPA contains duplicate paths")
        app_info = []
        for info in infos:
            safe_name(info.filename)
            if (info.external_attr >> 16) & 0o170000 == 0o120000:
                fail(f"IPA contains a symlink: {info.filename}")
            parts = PurePosixPath(info.filename).parts
            if len(parts) == 3 and parts[0] == "Payload" and parts[1].endswith(".app") and parts[2] == "Info.plist":
                app_info.append(plistlib.loads(archive.read(info)))
            if not info.is_dir() and macho_has_signature(archive.read(info)):
                fail(f"IPA contains an embedded binary signature: {info.filename}")
        if len(app_info) != 1 or app_info[0].get("CFBundleShortVersionString") != version:
            fail(f"IPA must contain one app with version {version}")
        executable = app_info[0].get("CFBundleExecutable")
        if not executable or not any(info.filename.endswith(f".app/{executable}") for info in infos):
            fail("IPA app executable is missing")


def phone_files(directory: Path, version: str) -> list[Path]:
    files = []
    for path in sorted(directory.rglob("*")):
        if path.is_symlink():
            fail(f"Phone distribution contains a symlink: {path}")
        relative = path.relative_to(directory).as_posix()
        safe_name(relative)
        if path.is_file():
            if path.suffix.lower() not in {".html", ".css", ".js", ".wasm", ".webmanifest", ".svg", ".png", ".json"} and path.name != ".nojekyll":
                fail(f"Unexpected phone distribution file: {relative}")
            files.append(path)
    names = {path.relative_to(directory).as_posix() for path in files}
    if missing := PHONE_REQUIRED - names:
        fail(f"Missing phone assets: {', '.join(sorted(missing))}")
    if f'const APP_VERSION = "{version}"' not in (directory / "app.js").read_text(encoding="utf-8"):
        fail(f"Phone app.js version must be {version}")
    return files


def make_zip(path: Path, entries: dict[str, Path | str]) -> None:
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, source in sorted(entries.items()):
            safe_name(name)
            info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (0o100755 if name.endswith(".sh") else 0o100644) << 16
            with archive.open(info, "w") as destination:
                if isinstance(source, Path):
                    with source.open("rb") as handle:
                        shutil.copyfileobj(handle, destination)
                else:
                    destination.write(source.encode("utf-8"))


def stage(args: argparse.Namespace) -> Path:
    root = args.root.resolve()
    installers = args.installers or root / "dist/installers"
    firmware = args.firmware or root / "dist/firmware-release"
    phone = args.phone_dist or root / "apps/beca-phone/dist"
    apple = args.apple_source or root / "apps/beca-apple"
    ipa = args.ipa or root / "dist/apple/BECA-unsigned.ipa"
    docs = args.docs or root / "docs/user"
    output = (args.output or root / "dist/publish").resolve()
    for version in (args.desktop_version, args.phone_version, args.firmware_version):
        if not re.fullmatch(r"\d+\.\d+\.\d+", version):
            fail(f"Use an explicit semantic version: {version}")
    expected = {f"BECA_{args.desktop_version}_{suffix}" for suffix in (
        "x64-setup.exe", "x64_en-US.msi", "aarch64.dmg", "x64.dmg", "amd64.AppImage", "amd64.deb")}
    found = {}
    for path in installers.rglob("*"):
        if path.name in expected:
            required_file(path)
            if path.name in found:
                fail(f"Duplicate installer: {path.name}")
            found[path.name] = path
    if missing := expected - found.keys():
        fail(f"Missing installers: {', '.join(sorted(missing))}")
    image = required_file(firmware / f"beca-{args.firmware_version}-merged.bin")
    manifest = required_file(firmware / "firmware-manifest.json")
    metadata = json.loads(manifest.read_text(encoding="utf-8-sig"))
    candidates = metadata.get("firmware", [])
    if len(candidates) != 1 or candidates[0].get("version") != args.firmware_version:
        fail("Firmware manifest must describe exactly the requested firmware version")
    entry = candidates[0]
    parsed = urlparse(entry.get("merged_bin_url", ""))
    if parsed.scheme != "https" or parsed.path.rsplit("/", 2)[-2:] != [args.tag, image.name]:
        fail("Firmware manifest image URL must match the release tag and binary")
    if entry.get("merged_bin_sha256", "").lower() != digest(image):
        fail("Firmware manifest checksum does not match the binary")
    manuals = {name: required_file(docs / name) for name in ("BECA_MANUAL.md", "BECA_MANUAL.html", "READ_BEFORE_FIRST_LAUNCH.md")}
    web_assets = phone_files(phone, args.phone_version)
    verify_ipa(ipa, args.phone_version)
    helpers = {name: required_file(apple / name) for name in APPLE_HELPERS}
    if args.phone_url and urlparse(args.phone_url).scheme != "https":
        fail("Published phone URL must use HTTPS")
    if output.exists() and (not output.is_dir() or any(output.iterdir())):
        fail(f"Output must be absent or empty to avoid stale release files: {output}")
    windows_readme = f"""# BECA Windows {args.desktop_version}

Run BECA_{args.desktop_version}_x64-setup.exe, or install the MSI. These are Windows x64 installers.
Read READ_BEFORE_FIRST_LAUNCH.md and BECA_MANUAL.html. This package includes firmware {args.firmware_version} in the desktop installer.
Check the release SHA256SUMS before installation. Windows signing status is stated in the release notes.
"""
    android_readme = f"""# BECA Android Web {args.phone_version}

This is an installable web app (PWA), not an Android APK. The app/ folder contains the complete static website.
{"Open " + args.phone_url + " in Chrome on Android." if args.phone_url else "Host app/ on an HTTPS static website, then open that published address in Chrome on Android."}
Use Chrome's Install app or Add to Home screen action. USB access needs HTTPS, a data cable and OTG support.
For direct Wi-Fi sound, join BECA's network and open http://<BECA-IP>/play/ in Chrome. On setup Wi-Fi the address is http://192.168.4.1/play/.
Power BECA separately when needed. Tap Connect Wi-Fi and Listen on this device. Hotspots must support 2.4 GHz.
Opening index.html as a local file does not provide USB access or a PWA installation. Read BECA_MANUAL.html for connections and sound controls.
"""
    apple_readme = f"""# BECA Apple {args.phone_version}

BECA-unsigned.ipa is an unsigned iPhone/iPad device app. It is not an App Store, TestFlight or directly installable signed release.
Sign and install using your own Apple account. No credentials, provisioning profiles or signatures are included.
For Windows/WSL, read apple-install/WINDOWS.md and apple-install/INSTALL-IPAD.md. The bundled helpers install a prebuilt IPA without compiling this source project.
From this extracted folder in PowerShell:

```powershell
.\\apple-install\\xtool-windows.ps1 -Step Setup
.\\apple-install\\xtool-windows.ps1 -Step Auth
.\\apple-install\\xtool-windows.ps1 -Step Install -ToolArguments @('/mnt/c/path/to/BECA-unsigned.ipa')
```

Replace the IPA argument with its actual absolute WSL path. Authenticate in your own terminal. Trust the computer and enable Developer Mode on the device when requested.
Use a current xtool installation on macOS/Linux with `xtool install /absolute/path/BECA-unsigned.ipa` if you already have the prerequisites and your account configured.
Free-account development installations expire and need reinstallation. Read the release notes for actual device validation and signing status.
The native app uses Wi-Fi controls and Bluetooth MIDI; CH340 wired USB serial on iPhone/iPad is unsupported. Allow Local Network and Bluetooth permissions.
"""
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix=".beca-stage-", dir=output.parent))
    try:
        for name, path in {**found, image.name: image, manifest.name: manifest, **manuals}.items():
            shutil.copyfile(path, temporary / name)
        for name, text in (("WINDOWS-INSTALL.md", windows_readme), ("ANDROID-INSTALL.md", android_readme), ("APPLE-INSTALL.md", apple_readme)):
            (temporary / name).write_text(text, encoding="utf-8")
        windows = {name: path for name, path in found.items() if path.suffix in {".exe", ".msi"}}
        make_zip(temporary / f"BECA-Windows-{args.desktop_version}.zip", {**windows, **manuals, "README.md": windows_readme})
        android = {f"app/{path.relative_to(phone).as_posix()}": path for path in web_assets}
        make_zip(temporary / f"BECA-Android-Web-{args.phone_version}.zip", {**android, "README.md": android_readme, "BECA_MANUAL.html": manuals["BECA_MANUAL.html"]})
        apple_files = {f"apple-install/{name}": path for name, path in helpers.items()}
        make_zip(temporary / f"BECA-Apple-{args.phone_version}.zip", {**apple_files, "BECA-unsigned.ipa": ipa, "README.md": apple_readme, "BECA_MANUAL.html": manuals["BECA_MANUAL.html"]})
        if args.mac_zip:
            mac = {name: path for name, path in found.items() if path.suffix == ".dmg"}
            make_zip(temporary / f"BECA-Mac-{args.desktop_version}.zip", {**mac, **manuals})
        (temporary / "release-versions.json").write_text(json.dumps({"tag": args.tag, "desktop": args.desktop_version, "phone": args.phone_version, "apple": args.phone_version, "firmware": args.firmware_version}, indent=2) + "\n", encoding="utf-8")
        sums = [f"{digest(path)}  {path.name}" for path in sorted(temporary.iterdir())]
        (temporary / "SHA256SUMS").write_text("\n".join(sums) + "\n", encoding="utf-8")
        if output.exists():
            output.rmdir()
        temporary.rename(output)
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--desktop-version", default="0.3.0")
    parser.add_argument("--phone-version", default="1.7.0")
    parser.add_argument("--firmware-version", default="1.2.0")
    parser.add_argument("--tag", default="apps-v0.3.0")
    for name in ("installers", "firmware", "phone-dist", "apple-source", "ipa", "docs", "output"):
        parser.add_argument("--" + name, type=Path)
    parser.add_argument("--phone-url", help="Optional published HTTPS PWA address")
    parser.add_argument("--mac-zip", action="store_true", help="Also package both direct DMG assets together")
    args = parser.parse_args()
    try:
        output = stage(args)
    except (ValueError, OSError, zipfile.BadZipFile, plistlib.InvalidFileException) as error:
        parser.exit(1, f"Release staging failed: {error}\n")
    print(f"Staged {len(list(output.iterdir()))} release files in {output}")


if __name__ == "__main__":
    main()
