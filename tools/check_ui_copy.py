#!/usr/bin/env python3
"""Reject known filler phrases in BECA UI sources; review context with the copy rules."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILES = [
    "index.html", "apps/beca-phone/index.html", "apps/beca-phone/app.js",
    "apps/beca-setup/ui/index.html", "apps/beca-setup/ui/control.html",
    "apps/beca-setup/ui/src/main.js", "apps/beca-setup/ui/src/performance.js",
    "apps/beca-setup/ui/src/performance-instrument.js",
]
PHRASES = ["your device. your sound.", "living signal", "midi note garden", "local assistant", "session summary", "unleash your creativity", "seamless experience", "sound journey"]
errors = []
for name in FILES:
    for number, line in enumerate((ROOT / name).read_text().splitlines(), 1):
        for phrase in PHRASES:
            if phrase in line.casefold():
                errors.append(f'{name}:{number}: replace filler phrase "{phrase}"; see docs/design/UI_COPY.md')
if errors:
    raise SystemExit("\n".join(errors))
print(f"UI copy check passed for {len(FILES)} sources; contextual review still required.")
