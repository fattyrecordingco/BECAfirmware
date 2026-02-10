#!/usr/bin/env python3
from pathlib import Path

IN_HTML = Path("index.html")
OUT_H = Path("index_html.h")


def pick_delimiter(text: str, base: str = "BECA_UI_HTML") -> str:
    delim = base
    while f"){delim}\"" in text:
        delim += "_X"
    return delim


def main() -> None:
    if not IN_HTML.exists():
        raise SystemExit(f"Missing {IN_HTML}")

    html = IN_HTML.read_text(encoding="utf-8")
    delim = pick_delimiter(html)

    out = (
        "// Auto-generated — do not edit by hand\n"
        "#pragma once\n"
        "#include <Arduino.h>\n\n"
        f"const char INDEX_HTML[] PROGMEM = R\"{delim}(\n"
        + html
        + f"\n){delim}\";\n"
    )

    OUT_H.write_text(out, encoding="utf-8")
    print(f"OK: {OUT_H} written (delimiter {delim})")


if __name__ == "__main__":
    main()
