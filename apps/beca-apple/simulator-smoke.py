"""Launch the actual native shell on iPhone/iPad simulators and save UI evidence."""
import argparse
import json
from pathlib import Path
import subprocess
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("app", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)


def simctl(*arguments):
    return subprocess.check_output(["xcrun", "simctl", *arguments], text=True)


devices = json.loads(simctl("list", "devices", "available", "--json"))["devices"]
choices = [device for runtime, entries in devices.items() if ".iOS-" in runtime
           for device in entries if device.get("isAvailable")]
results = []
for family in ("iPhone", "iPad"):
    device = next((item for item in choices if item["name"].startswith(family)), None)
    if device is None:
        raise RuntimeError(f"No {family} simulator available on this runner")
    udid = device["udid"]
    was_running = device["state"] == "Booted"
    try:
        if not was_running:
            simctl("boot", udid)
        simctl("bootstatus", udid, "-b")
        simctl("install", udid, str(args.app))
        launch = simctl("launch", udid, "com.fattyrecording.beca.apple")
        pid = int(launch.strip().rsplit(" ", 1)[-1])
        time.sleep(12)
        services = simctl("spawn", udid, "launchctl", "list")
        if not any(line.split()[:1] == [str(pid)] for line in services.splitlines()):
            raise RuntimeError(f"BECA stopped after launch on {device['name']}")
        simctl("io", udid, "screenshot", str(args.output / f"{family}-portrait.png"))
        results.append({"device": device["name"], "launch": "pass", "alive_after_seconds": 12,
                        "scope": "native simulator shell; no physical Bluetooth/audio certification"})
    finally:
        if not was_running:
            subprocess.run(["xcrun", "simctl", "shutdown", udid], check=False)
(args.output / "results.json").write_text(json.dumps(results, indent=2) + "\n")
print(json.dumps(results))
