#!/usr/bin/env python3
"""Build an Ableton-loadable .amxd from a .maxpat source file.

Ableton Live expects AMXD files in AMPF container form. This script wraps a
JSON .maxpat payload into that container and can optionally copy the result
into the local Ableton User Library MIDI Effects folder.
"""

from __future__ import annotations

import argparse
import os
import shutil
import struct
from pathlib import Path


def build_amxd(maxpat_path: Path, amxd_path: Path) -> None:
    payload = maxpat_path.read_bytes()
    if payload.endswith(b"\x00"):
        payload = payload[:-1]
    payload += b"\x00"

    header = (
        b"ampf"
        + struct.pack("<I", 4)
        + b"mmmm"
        + b"meta"
        + struct.pack("<I", 4)
        + struct.pack("<I", 0)
        + b"ptch"
        + struct.pack("<I", len(payload))
    )
    amxd_path.write_bytes(header + payload)


def default_user_library_target() -> Path:
    home = Path.home()
    one_drive = home / "OneDrive" / "Documents" / "Ableton" / "User Library" / "Presets" / "MIDI Effects" / "Max MIDI Effect"
    plain_docs = home / "Documents" / "Ableton" / "User Library" / "Presets" / "MIDI Effects" / "Max MIDI Effect"

    if one_drive.exists():
        return one_drive
    if plain_docs.exists():
        return plain_docs
    if (home / "OneDrive").exists():
        return one_drive
    return plain_docs


def copy_support_folders(source_root: Path, target_dir: Path) -> None:
    for name in ("code", "assets"):
        src = source_root / name
        if not src.exists():
            continue
        dst = target_dir / name
        if src.is_dir():
            shutil.copytree(
                src,
                dst,
                dirs_exist_ok=True,
                ignore=shutil.ignore_patterns("node_modules", "__pycache__", "*.pyc"),
            )
        else:
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)


def main() -> int:
    root = Path(__file__).resolve().parent
    default_maxpat = root / "BECA Control.maxpat"
    default_amxd = root / "BECA Control.amxd"

    parser = argparse.ArgumentParser(description="Build BECA Control.amxd from maxpat source")
    parser.add_argument("--maxpat", type=Path, default=default_maxpat, help="Input .maxpat file")
    parser.add_argument("--amxd", type=Path, default=default_amxd, help="Output .amxd file")
    parser.add_argument(
        "--copy-user-library",
        action="store_true",
        help="Also copy the built .amxd into Ableton User Library MIDI Effects folder",
    )
    parser.add_argument(
        "--user-library-dir",
        type=Path,
        default=None,
        help="Override target Ableton User Library MIDI Effects folder",
    )
    args = parser.parse_args()

    if not args.maxpat.exists():
        raise SystemExit(f"Input maxpat not found: {args.maxpat}")

    args.amxd.parent.mkdir(parents=True, exist_ok=True)
    build_amxd(args.maxpat, args.amxd)
    print(f"Built: {args.amxd} ({args.amxd.stat().st_size} bytes)")

    if args.copy_user_library:
        target_dir = args.user_library_dir or default_user_library_target()
        target_dir.mkdir(parents=True, exist_ok=True)
        target_file = target_dir / args.amxd.name
        shutil.copy2(args.amxd, target_file)
        copy_support_folders(root, target_dir)
        print(f"Copied: {target_file}")
        print(f"Synced support folders: {target_dir / 'code'} and {target_dir / 'assets'}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
