#!/usr/bin/env bash
# sync-plugin.sh — mirror the root skill files into the Claude Code plugin package.
# The repo root is the source of truth; run this after editing any skill file.
#   bash scripts/sync-plugin.sh          # copy
#   bash scripts/sync-plugin.sh --check  # exit 1 if the plugin copy is stale (for CI)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/plugins/frontend-slides/skills/frontend-slides"
ITEMS=(SKILL.md STYLE_PRESETS.md viewport-base.css html-template.md animation-patterns.md deck-runtime.js pptx-converter.html
       bold-template-pack examples
       scripts/extract-pptx.py scripts/deploy.sh scripts/export-pdf.sh scripts/check-deck.sh scripts/inline-runtime.py)

if [[ "${1:-}" == "--check" ]]; then
  stale=0
  for i in "${ITEMS[@]}"; do diff -rq "$ROOT/$i" "$DEST/$i" >/dev/null 2>&1 || { echo "stale: $i"; stale=1; }; done
  [[ $stale == 0 ]] && echo "plugin copy is up to date"
  exit $stale
fi

mkdir -p "$DEST/scripts"
for i in "${ITEMS[@]}"; do
  rm -rf "${DEST:?}/$i"
  mkdir -p "$(dirname "$DEST/$i")"
  cp -R "$ROOT/$i" "$DEST/$i"
done
echo "✓ synced ${#ITEMS[@]} items → plugins/frontend-slides/skills/frontend-slides"
