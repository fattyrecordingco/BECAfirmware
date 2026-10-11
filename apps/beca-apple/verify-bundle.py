"""Validate an Xcode-built iPhone/iPad bundle before packaging a test candidate."""
import argparse
import hashlib
import json
from pathlib import Path
import plistlib
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("app", type=Path)
args = parser.parse_args()
app = args.app
with (app / "Info.plist").open("rb") as stream:
    info = plistlib.load(stream)
assert info["CFBundleSupportedPlatforms"] == ["iPhoneOS"], "Not a physical iOS build"
assert set(info["UIDeviceFamily"]) == {1, 2}, "Both iPhone and iPad must be supported"
assert info["CFBundleShortVersionString"] == "1.6.0", "Unexpected version"
assert info["NSLocalNetworkUsageDescription"] and info["NSBluetoothAlwaysUsageDescription"]
assert info.get("CFBundleIcons", {}).get("CFBundlePrimaryIcon"), "Missing compiled iPhone icon"
assert info.get("CFBundleIcons~ipad", {}).get("CFBundlePrimaryIcon"), "Missing compiled iPad icon"
assert (app / "Assets.car").is_file(), "Missing asset catalogue"
binary = app / info["CFBundleExecutable"]
description = subprocess.check_output(["file", str(binary)], text=True)
assert "Mach-O" in description and "arm64" in description, description
with (app / "PrivacyInfo.xcprivacy").open("rb") as stream:
    privacy = plistlib.load(stream)
assert privacy["NSPrivacyTracking"] is False
defaults = next(item for item in privacy["NSPrivacyAccessedAPITypes"]
                if item["NSPrivacyAccessedAPIType"] == "NSPrivacyAccessedAPICategoryUserDefaults")
assert "CA92.1" in defaults["NSPrivacyAccessedAPITypeReasons"]
phone = Path(__file__).resolve().parent.parent / "beca-phone" / "dist"
for source in phone.rglob("*"):
    if source.is_file():
        destination = app / "Web" / source.relative_to(phone)
        assert destination.is_file(), f"Missing bundled asset: {destination}"
        assert hashlib.sha256(source.read_bytes()).digest() == hashlib.sha256(destination.read_bytes()).digest(), source
print(json.dumps({"bundle": info["CFBundleIdentifier"], "version": info["CFBundleShortVersionString"],
                  "device_families": info["UIDeviceFamily"], "architecture": "arm64",
                  "privacy": "pass", "icons": "pass", "bundled_assets": "pass",
                  "distribution": "unsigned; Apple signing and physical acceptance still required"}))
