#!/usr/bin/env python3
import gzip
import re
from pathlib import Path

IN_SVG = Path("logo.svg")
OUT_H  = Path("logo_svg.h")

def simple_minify_svg(s: str) -> str:
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)   # remove comments
    s = re.sub(r">\s+<", "><", s)                  # whitespace between tags
    s = re.sub(r"\s{2,}", " ", s)                  # collapse runs
    return s.strip()

def emit_c_array(data: bytes, name: str) -> str:
    # Write strictly valid C tokens: 0x00..0xFF only.
    # One line = 16 bytes to avoid any weird wrapping/copy issues.
    lines = []
    for i in range(0, len(data), 16):
        chunk = data[i:i+16]
        lines.append("  " + ", ".join(f"0x{b:02X}" for b in chunk) + ("," if i+16 < len(data) else ""))
    return (
        "// Auto-generated — do not edit by hand\n"
        "#pragma once\n"
        "#include <Arduino.h>\n\n"
        f"static const uint8_t {name}[] PROGMEM = {{\n"
        + "\n".join(lines) +
        "\n};\n"
        f"static const size_t {name}_LEN = {len(data)};\n"
    )

def main():
    if not IN_SVG.exists():
        raise SystemExit(f"Missing {IN_SVG}")

    svg = IN_SVG.read_text(encoding="utf-8", errors="ignore")
    svg = simple_minify_svg(svg)

    gz = gzip.compress(svg.encode("utf-8"), compresslevel=9)

    OUT_H.write_text(emit_c_array(gz, "LOGO_SVG_GZ"), encoding="utf-8")
    print(f"OK: {OUT_H} written — gz bytes: {len(gz)}")

if __name__ == "__main__":
    main()
