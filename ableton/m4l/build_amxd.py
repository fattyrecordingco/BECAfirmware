#!/usr/bin/env python3
"""Build an Ableton-loadable .amxd from a .maxpat source file.

Ableton Live expects AMXD files in AMPF container form. This script wraps a
JSON .maxpat payload into that container and can optionally copy the result
into the local Ableton User Library MIDI Effects folder.
"""

from __future__ import annotations

import argparse
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


def safe_copy2(src: str, dst: str) -> str:
    try:
        return shutil.copy2(src, dst)
    except PermissionError:
        # Skip locked files (commonly native node_modules binaries in use by Live/Max).
        print(f"Skipped locked file: {dst}")
        return dst


def copy_support_folders(source_root: Path, target_dir: Path) -> None:
    for name in ("code", "assets"):
        src = source_root / name
        if not src.exists():
            continue
        dst = target_dir / name
        if src.is_dir():
            try:
                shutil.copytree(
                    src,
                    dst,
                    dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns("__pycache__", "*.pyc"),
                    copy_function=safe_copy2,
                )
            except shutil.Error as err:
                # Continue if a subset of files are locked/inaccessible.
                print(f"Warning: partial copy for {src}: {err}")
        else:
            dst.parent.mkdir(parents=True, exist_ok=True)
            safe_copy2(str(src), str(dst))

    # UI scripts resolve most reliably when copied next to the AMXD.
    root_jsui = source_root / "code" / "beca_control_ui.js"
    if root_jsui.exists():
        safe_copy2(str(root_jsui), str(target_dir / "beca_control_ui.js"))
    root_node_bootstrap = source_root / "beca_control_node.js"
    if root_node_bootstrap.exists():
        safe_copy2(str(root_node_bootstrap), str(target_dir / "beca_control_node.js"))


def copy_primary_amxd(source_amxd: Path, target_dir: Path) -> Path:
    primary = target_dir / source_amxd.name
    shutil.copy2(source_amxd, primary)
    return primary


def remove_legacy_aliases(target_dir: Path) -> None:
    for name in (
        "BECA Control v2.amxd",
        "BECA Control Native.amxd",
        "BECA Control Fresh.amxd",
        "BECA Control Pro.amxd",
        "BECA Control.v2.amxd",
    ):
        p = target_dir / name
        if p.exists():
            p.unlink()
            print(f"Removed legacy alias: {p}")


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
    remove_legacy_aliases(args.amxd.parent)
    build_amxd(args.maxpat, args.amxd)
    print(f"Built: {args.amxd} ({args.amxd.stat().st_size} bytes)")

    if args.copy_user_library:
        target_dir = args.user_library_dir or default_user_library_target()
        target_dir.mkdir(parents=True, exist_ok=True)
        remove_legacy_aliases(target_dir)
        copied = copy_primary_amxd(args.amxd, target_dir)
        copy_support_folders(root, target_dir)
        print("Copied:")
        print(f"  - {copied}")
        print(
            "Synced support folders: "
            f"{target_dir / 'code'} and {target_dir / 'assets'}"
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
