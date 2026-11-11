#!/usr/bin/env bash
# check-deck.sh — Automated layout QA for a Frontend Slides deck
#
# Usage:
#   bash scripts/check-deck.sh <path-to-html> [output-dir]
#
# What it does (headless Chromium via Playwright):
#   1. Serves the deck's folder over HTTP so fonts and relative assets load
#   2. Renders every slide at 1920×1080 with all fragments revealed and
#      animations settled
#   3. Runs the deck-runtime audit on each slide: clipped text, text off the
#      slide, overlapping text, text < 18px, broken images, leaked
#      placeholder/workflow text, word-count density
#   4. Checks the stage stays 16:9 on a phone viewport (390×844)
#   5. Saves slide-NN.png screenshots, a contact sheet (overview.png) and
#      report.json to the output dir (default: <deck>-check/ next to the deck)
#
# Exit code: 0 = no errors (warnings allowed), 1 = layout errors found, 2 = setup failure.
# Playwright is cached in ~/.cache/frontend-slides so only the first run downloads it.
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'
info() { echo -e "${CYAN}ℹ${NC} $*"; }
ok()   { echo -e "${GREEN}✓${NC} $*"; }
err()  { echo -e "${RED}✗${NC} $*" >&2; }

if [[ $# -lt 1 ]]; then
  err "Usage: bash scripts/check-deck.sh <path-to-html> [output-dir]"
  exit 2
fi
INPUT_HTML="$1"
[[ -f "$INPUT_HTML" ]] || { err "File not found: $INPUT_HTML"; exit 2; }
INPUT_HTML="$(cd "$(dirname "$INPUT_HTML")" && pwd)/$(basename "$INPUT_HTML")"
OUT_DIR="${2:-$(dirname "$INPUT_HTML")/$(basename "$INPUT_HTML" .html)-check}"
mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_JS="$SCRIPT_DIR/../deck-runtime.js"
[[ -f "$RUNTIME_JS" ]] || { err "deck-runtime.js not found next to scripts/"; exit 2; }

command -v node >/dev/null || { err "Node.js is required (macOS: brew install node, or https://nodejs.org)"; exit 2; }

# ─── Cached Playwright install ────────────────────────────
CACHE_DIR="${FRONTEND_SLIDES_CACHE:-$HOME/.cache/frontend-slides}"
mkdir -p "$CACHE_DIR"
if [[ ! -d "$CACHE_DIR/node_modules/playwright" ]]; then
  info "Installing Playwright into $CACHE_DIR (first run only)..."
  ( cd "$CACHE_DIR" && { [[ -f package.json ]] || echo '{"name":"fs-tools","private":true}' > package.json; } \
      && npm install --silent playwright >/dev/null ) || { err "npm install playwright failed"; exit 2; }
fi
( cd "$CACHE_DIR" && npx --no-install playwright install chromium >/dev/null 2>&1 ) || {
  err "Could not install Chromium. Try: cd $CACHE_DIR && npx playwright install chromium"; exit 2; }

CHECK_JS="$CACHE_DIR/check-deck.mjs"
cat > "$CHECK_JS" <<'NODE'
import { createRequire } from 'module';
import { createServer } from 'http';
import { readFileSync, existsSync, writeFileSync, statSync } from 'fs';
import { join, extname, resolve, normalize } from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const [, , serveDir, htmlFile, outDir, runtimePath] = process.argv;
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.avif': 'image/avif', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.otf': 'font/otf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg' };
const root = resolve(serveDir);
const server = createServer((req, res) => {
  const p = normalize(join(root, decodeURIComponent(req.url.split('?')[0].split('#')[0])));
  if (!p.startsWith(root) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[extname(p).toLowerCase()] || 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/${encodeURIComponent(htmlFile)}`;

const browser = await chromium.launch();
const SETTLE = '*,*::before,*::after{transition:none!important;animation-duration:0s!important;animation-delay:0s!important;animation-iteration-count:1!important;caret-color:transparent!important}';
const consoleErrors = [];

async function openDeck(viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.on('pageerror', e => consoleErrors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  await page.goto(url, { waitUntil: 'networkidle' }).catch(() => page.goto(url, { waitUntil: 'load' }));
  await page.evaluate(() => document.fonts && document.fonts.ready);
  const hasRuntime = await page.evaluate(() => !!window.FrontendSlides);
  if (!hasRuntime) {
    await page.evaluate(() => { window.FS_NO_AUTOINIT = true; });
    await page.addScriptTag({ path: runtimePath });
  }
  await page.addStyleTag({ content: SETTLE });
  return { page, hasRuntime };
}

const { page, hasRuntime } = await openDeck({ width: 1920, height: 1080 });
const total = await page.evaluate(() => {
  const st = document.getElementById('deckStage') || document.querySelector('.deck-stage');
  return st ? [...st.querySelectorAll('.slide')].filter(s => !s.parentElement.closest('.slide')).length : 0;
});
if (!total) { console.error('  No .deck-stage / .slide elements found.'); await browser.close(); server.close(); process.exit(2); }

const issues = [];
const shots = [];
for (let i = 0; i < total; i++) {
  await page.evaluate((i) => {
    const api = window.presentation;
    if (api && typeof api.goToSlide === 'function') {
      api.goToSlide(i);
      if (api.showAllFragments) api.showAllFragments();
    } else {
      const st = document.getElementById('deckStage') || document.querySelector('.deck-stage');
      [...st.querySelectorAll('.slide')].filter(s => !s.parentElement.closest('.slide'))
        .forEach((s, j) => { s.classList.toggle('active', j === i); s.classList.toggle('visible', j === i); });
    }
    document.querySelectorAll('.fragment').forEach(f => f.classList.add('fs-shown'));
  }, i);
  await page.waitForTimeout(120);
  issues.push(...await page.evaluate((i) => window.FrontendSlides.audit({ slide: i, plain: true }), i));
  const file = join(outDir, `slide-${String(i + 1).padStart(2, '0')}.png`);
  await page.screenshot({ path: file });
  shots.push(file);
}

// Phone sanity check: stage must stay 16:9 and the page must not scroll sideways
const phone = await openDeck({ width: 390, height: 844 });
const phoneInfo = await phone.page.evaluate(() => {
  const st = document.getElementById('deckStage') || document.querySelector('.deck-stage');
  const r = st.getBoundingClientRect();
  return { ratio: r.width / r.height, hScroll: document.documentElement.scrollWidth > window.innerWidth + 1 };
});
if (Math.abs(phoneInfo.ratio - 16 / 9) > 0.02) issues.push({ slide: 0, severity: 'error', type: 'stage', message: `Stage is ${phoneInfo.ratio.toFixed(3)}:1 on a phone — it must stay 16:9 (scale, don't reflow)` });
if (phoneInfo.hScroll) issues.push({ slide: 0, severity: 'error', type: 'stage', message: 'Page scrolls horizontally on a phone viewport' });
await phone.page.screenshot({ path: join(outDir, 'phone.png') });

// Contact sheet of every slide for a one-glance review
const cols = total <= 4 ? total : total <= 9 ? 3 : 4;
const tw = 480, th = 270, gap = 16;
const sheet = await browser.newPage({ viewport: { width: cols * (tw + gap) + gap, height: 400 } });
await sheet.setContent(`<body style="margin:0;padding:${gap}px;background:#1a1a1e;font:600 14px system-ui;color:#ddd;display:grid;grid-template-columns:repeat(${cols},${tw}px);gap:${gap}px">` +
  shots.map((s, i) => {
    const bad = issues.some(x => x.slide === i + 1 && x.severity === 'error');
    return `<div><img src="data:image/png;base64,${readFileSync(s).toString('base64')}" style="width:${tw}px;height:${th}px;display:block;border-radius:4px;outline:${bad ? '4px solid #ff3b30' : '1px solid #333'}"><div style="margin-top:6px">${i + 1}${bad ? ' — has errors' : ''}</div></div>`;
  }).join('') + '</body>');
await sheet.screenshot({ path: join(outDir, 'overview.png'), fullPage: true });

await browser.close();
server.close();

const errors = issues.filter(i => i.severity === 'error');
const warns = issues.filter(i => i.severity === 'warn');
writeFileSync(join(outDir, 'report.json'), JSON.stringify({ deck: htmlFile, slides: total, runtime: hasRuntime, errors: errors.length, warnings: warns.length, issues, consoleErrors }, null, 2));

console.log(`\n  ${total} slides · runtime ${hasRuntime ? 'present' : 'NOT inlined (audit injected)'}\n`);
for (const i of issues) {
  const tag = i.severity === 'error' ? '\x1b[31mERROR\x1b[0m' : '\x1b[33mwarn \x1b[0m';
  console.log(`  ${tag} ${i.slide ? 'slide ' + String(i.slide).padStart(2) : 'deck    '}  ${i.type.padEnd(12)} ${i.message}${i.selector ? '\n                              ↳ ' + i.selector : ''}`);
}
for (const e of consoleErrors.slice(0, 5)) console.log(`  \x1b[31mJS   \x1b[0m ${e}`);
console.log(`\n  ${errors.length} error(s), ${warns.length} warning(s)`);
console.log(`  Screenshots + overview.png + report.json → ${outDir}\n`);
process.exit(errors.length || consoleErrors.length ? 1 : 0);
NODE

info "Checking $(basename "$INPUT_HTML")..."
NODE_PATH="$CACHE_DIR/node_modules" node "$CHECK_JS" "$(dirname "$INPUT_HTML")" "$(basename "$INPUT_HTML")" "$OUT_DIR" "$RUNTIME_JS"
