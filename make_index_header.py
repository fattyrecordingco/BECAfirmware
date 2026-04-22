#!/usr/bin/env python3
from pathlib import Path

IN_HTML = Path("index.html")
OUT_H = Path("index_html.h")


def escape_c_string(text: str) -> str:
    return text.replace("\\", "\\\\").replace('"', '\\"')


def main() -> None:
    if not IN_HTML.exists():
        raise SystemExit(f"Missing {IN_HTML}")

    html = IN_HTML.read_text(encoding="utf-8")
    body = "".join(f'"{escape_c_string(line)}\\n"\n' for line in html.splitlines())

    out = (
        "// Auto-generated — do not edit by hand\n"
        "#pragma once\n"
        "#include <Arduino.h>\n\n"
        "const char INDEX_HTML[] PROGMEM =\n"
        f"{body}"
        ";\n"
    )

    OUT_H.write_text(out, encoding="utf-8")
    print(f"OK: {OUT_H} written (escaped string literal)")


if __name__ == "__main__":
    main()
