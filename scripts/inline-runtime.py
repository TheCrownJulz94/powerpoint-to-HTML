#!/usr/bin/env python3
"""inline-runtime.py — fill (or refresh) the shared base CSS and runtime JS in a deck.

Usage:
    python3 scripts/inline-runtime.py <deck.html> [more.html ...]

In the deck, write empty placeholder tags instead of pasting the files by hand:

    <style data-fs-base></style>          <!-- receives viewport-base.css -->
    ...
    <script data-fs-runtime></script>     <!-- receives deck-runtime.js, end of <body> -->

The script replaces whatever is inside those tags with the current files, so
running it again later upgrades an existing deck to the newest runtime.
The deck stays a single self-contained HTML file. Exit code 1 if a placeholder is missing.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE_CSS = (ROOT / "viewport-base.css").read_text(encoding="utf-8")
RUNTIME_JS = (ROOT / "deck-runtime.js").read_text(encoding="utf-8")

# Guard against the inlined text closing its own tag early
assert "</style" not in BASE_CSS.lower() and "</script" not in BASE_CSS.lower() and "</script" not in RUNTIME_JS.lower()

PATTERNS = [
    # <style data-fs-base> in decks; <script type="text/plain" data-fs-base> in pptx-converter.html,
    # which carries the CSS as text to write into the decks it generates.
    ("data-fs-base", re.compile(r"(<(?:style|script)\b[^>]*\bdata-fs-base\b[^>]*>)(.*?)(</(?:style|script)>)", re.S | re.I), BASE_CSS),
    ("data-fs-runtime", re.compile(r"(<script\b[^>]*\bdata-fs-runtime\b[^>]*>)(.*?)(</script>)", re.S | re.I), RUNTIME_JS),
]


def process(path: Path) -> bool:
    html = path.read_text(encoding="utf-8")
    ok = True
    for name, rx, body in PATTERNS:
        if not rx.search(html):
            print(f"  ✗ {path.name}: no <… {name}> placeholder found")
            ok = False
            continue
        html = rx.sub(lambda m, b=body: m.group(1) + "\n" + b.rstrip() + "\n" + m.group(3), html, count=1)
    if ok:
        path.write_text(html, encoding="utf-8")
        print(f"  ✓ {path.name}: inlined viewport-base.css + deck-runtime.js ({len(html) // 1024} KB)")
    return ok


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    results = [process(Path(p)) for p in sys.argv[1:]]
    sys.exit(0 if all(results) else 1)
