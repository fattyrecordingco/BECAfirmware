#!/usr/bin/env python3
import argparse
import datetime as dt
import json
import pathlib
import re
import sys


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate BECA firmware-manifest.json")
    parser.add_argument("--repo", required=True, help="GitHub repo in owner/name form")
    parser.add_argument("--version", required=True, help="Firmware semantic version, e.g. 1.0.1")
    parser.add_argument("--tag", required=True, help="Git tag used for release, e.g. firmware-v1.0.1")
    parser.add_argument("--channel", default="stable", help="Release channel, e.g. stable/beta")
    parser.add_argument("--hardware", default="ESP32-PICO-V3", help="Supported hardware id")
    parser.add_argument("--asset-name", required=True, help="Merged firmware binary asset name")
    parser.add_argument("--sha256", required=True, help="64-char hex SHA256 of merged firmware binary")
    parser.add_argument("--output", required=True, help="Output manifest file path")
    return parser.parse_args()


def validate_semver(version: str) -> None:
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError(f"invalid semantic version: {version}")


def validate_sha256(value: str) -> None:
    if not re.fullmatch(r"[0-9a-fA-F]{64}", value):
        raise ValueError("sha256 must be exactly 64 hex chars")


def main() -> int:
    args = parse_args()
    validate_semver(args.version)
    validate_sha256(args.sha256)

    generated_at = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    merged_url = f"https://github.com/{args.repo}/releases/download/{args.tag}/{args.asset_name}"
    notes_url = f"https://github.com/{args.repo}/releases/tag/{args.tag}"

    manifest = {
        "schema_version": "1.0.0",
        "repository": args.repo,
        "generated_at": generated_at,
        "firmware": [
            {
                "version": args.version,
                "channel": args.channel,
                "supported_hardware": [args.hardware],
                "merged_bin_url": merged_url,
                "merged_bin_sha256": args.sha256.lower(),
                "release_notes_url": notes_url,
            }
        ],
    }

    output = pathlib.Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {output}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(2)
