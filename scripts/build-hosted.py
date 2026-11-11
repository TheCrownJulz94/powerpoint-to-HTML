#!/usr/bin/env python3
"""build-hosted.py — make the claude.ai copy of pptx-converter.html.

Usage:
    python3 scripts/build-hosted.py <out.html>

claude.ai wraps a published page in its own <!doctype html><head>…<body>
skeleton (with charset and viewport tags), so the hosted copy is the same
page minus the document wrapper. On claude.ai the page uses the visitor's own
Claude account instead of an API key; publish it with the capabilities
    {"sample": {"images": true}, "downloads": true}
Run inline-runtime.py on pptx-converter.html first so the copy is current.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

if len(sys.argv) != 2:
    print(__doc__)
    sys.exit(2)

html = (ROOT / "pptx-converter.html").read_text(encoding="utf-8")
for pattern in (r"^<!DOCTYPE html>\s*", r"^<html[^>]*>\s*", r"^<head>\s*",
                r"^<meta charset=[^>]*>\s*", r"^<meta name=\"viewport\"[^>]*>\s*"):
    html, n = re.subn(pattern, "", html, count=1, flags=re.I)
    assert n == 1, f"expected {pattern!r} at the top of pptx-converter.html"
# </head><body> sits between the page's styles and its markup; </body></html> ends it.
html, n = re.subn(r"</head>\s*<body>\s*", "", html, count=1, flags=re.I)
assert n == 1, "expected </head><body> in pptx-converter.html"
html, n = re.subn(r"</body>\s*</html>\s*$", "", html, count=1, flags=re.I)
assert n == 1, "expected </body></html> at the end of pptx-converter.html"
assert html.lstrip().startswith("<title>"), "the <title> must come first"

out = Path(sys.argv[1])
out.write_text(html, encoding="utf-8")
print(f"  ✓ {out}: hosted copy ({len(html) // 1024} KB)")
