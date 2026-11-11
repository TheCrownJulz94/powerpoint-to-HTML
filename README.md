# Frontend Slides

> No more old boring PowerPoints, now we have new age HTML versions.

A coding-agent skill for creating stunning HTML presentations — from scratch or by converting PowerPoint files. It is packaged as a Claude Code plugin, and the core `SKILL.md` can also be read by other coding agents with filesystem and shell access.

## Try It in Your Browser

**Easiest: [open the converter on claude.ai](https://claude.ai/artifact/PCY6D4bsocXYAQdNinwMUx).** Sign in with your Claude account, drop a `.pptx`, pick a style, and Claude designs the deck. It runs on your own Claude plan; there is no API key to set up. Click **Allow** when Claude asks the first time.

**Or run it from this repo.** GitHub shows `.html` files as code, so clicking them here won't open them:

1. Click the green **Code** button above → **Download ZIP**, then unzip it (or `git clone` the repo).
2. Double-click **`pptx-converter.html`** to open it in your browser. Opened this way it needs an Anthropic API key from [console.anthropic.com](https://console.anthropic.com/settings/keys), billed per conversion; the button shows an estimate first.
3. Drop a `.pptx`, pick a style, and click **Design my deck with Claude**. Preview it, then click **Download .html**.

Double-click **`examples/demo-deck.html`** to see a finished deck. Press **L** for the slides panel, **T** to change theme, and **?** for all shortcuts.

## What This Does

**Frontend Slides** helps non-designers create beautiful web presentations without knowing CSS or JavaScript. It uses a "show, don't tell" approach: instead of asking you to describe your aesthetic preferences in words, it generates visual previews and lets you pick what you like.

### Key Features

- **Zero Dependencies** — Single HTML files with inline CSS/JS. No npm, no build tools, no frameworks.
- **Visual Style Discovery** — Can't articulate design preferences? No problem. Pick from generated visual previews.
- **PPT Conversion** — Claude redesigns existing PowerPoint files as animated web decks, keeping all text, images, charts and notes. Use the skill in Claude Code, or the [converter page on claude.ai](https://claude.ai/artifact/PCY6D4bsocXYAQdNinwMUx) with your Claude account.
- **Slides Panel + Autoplay** — A thumbnail strip on the left (**L**) to jump between slides, with a play button that flips through steps on a timer.
- **Theme Switcher** — Every deck can switch between its own colours, **Black & Red**, or a **Custom** palette built from two colours you pick (**T**).
- **Anti-AI-Slop** — Curated distinctive styles that avoid generic AI aesthetics (bye-bye, purple gradients on white).
- **Bold Template Pack** — Optional design-forward templates from `beautiful-html-templates`, loaded progressively so safe presets still work as the default fallback.
- **Production Quality** — Accessible, fixed 16:9, well-commented code you can customize.

## What's New in v3

v3 moves everything a deck *does* into one shared, tested runtime, so the agent spends its effort on design and content instead of rewriting a slide controller for every deck. It also verifies every deck before showing it to you.

| | v2 | v3 |
| --- | --- | --- |
| Slide controller | Rewritten by the agent each time from a skeleton | Shared [`deck-runtime.js`](deck-runtime.js), inlined by one command |
| Speaker notes | Hidden as HTML comments | `<aside class="notes">` shown in a **presenter view** (P) with timer, clock and next-slide preview |
| Step-by-step builds | None | `class="fragment"`, with grouping via `data-fragment-index` |
| Find a slide | Click through | **Overview grid** (O), number + Enter, deep links `deck.html#7.2` |
| Edit text | Basic contenteditable | Edits survive reload; ⌘S downloads a **clean** `.html` with no editor artefacts |
| PDF | Playwright script only | **⌘P → Save as PDF** works too (fixes `.reveal` content being blank on printed pages) |
| Layout QA | "Take screenshots" | [`check-deck.sh`](scripts/check-deck.sh): automated audit of clipped text and panels, overlap, tiny text, broken images, leaked placeholder text, phone 16:9, plus a contact sheet. Live overlay with **D** |
| Box model | Padding could push content past 1920px | `.slide` is `box-sizing: border-box` in the base CSS |

Open [`examples/demo-deck.html`](examples/demo-deck.html) and press `?` to try it.

## What's New in v3.1

- **PowerPoint converter, designed by Claude.** Open [`pptx-converter.html`](pptx-converter.html), paste an Anthropic API key, drop a `.pptx` and pick a style: let Claude choose, keep the PowerPoint's colours, any of the 13 presets or 34 bold templates, or describe your own. Tick **Other instructions** to tell Claude anything else in your own words, such as "write talking notes for every slide". The page reads the file locally (text, bullet levels, images, tables, chart data, SmartArt, speaker notes) and sends it to Claude Opus 5.5 together with this skill's `SKILL.md`, `html-template.md`, `animation-patterns.md`, `STYLE_PRESETS.md` and the chosen template, so the deck follows the same design rules as the skill: animated entrances, step-by-step reveals, charts rebuilt as animated SVG. The page then runs the layout audit; **Fix flagged slides with Claude** sends any problems back. Under the preview, **Ask Claude to change the deck** takes requests in your own words ("delete slide 4", "swap slides 2 and 3", "write talking notes for every slide"); Claude sends back only the changes, and **Undo last change** steps back. On claude.ai, **My decks** keeps every deck you make in your Claude account, updated as you fix or change it, so you can reopen, download or delete it later from any device. On claude.ai it uses your own Claude account and writes the deck in parts (the design system first, then a few slides per request); opened as a file it uses an Anthropic API key, which stays in the browser tab and is sent only to Anthropic. Old `.ppt` files need re-saving as `.pptx` first.
- **Slides panel.** Thumbnails down the left edge; click one to jump to it. The stage shrinks to fit beside it. Toggle with **L**; it remembers whether you left it open.
- **Autoplay.** ▶ in the panel (or **A**) advances one step every 3–30 seconds, optionally looping. Start a kiosk-style loop with `deck.html?autoplay=8` or `data-fs-autoplay="8"` on the stage.
- **Themes.** **Standard** (the deck's own colours), **Black & Red**, and **Custom**: pick a background and an accent, and the text, muted and surface colours are derived for contrast. **T** cycles through them. The choice is remembered and saved into the file with ⌘S.

### Keyboard shortcuts in every deck

| Key | Action | Key | Action |
| --- | --- | --- | --- |
| → Space ← | Next / previous step or slide | **P** | Presenter view |
| Home / End | First / last slide | **O** | Overview grid |
| `12` Enter | Jump to slide 12 | **E** | Edit text in place |
| **F** | Fullscreen | ⌘/Ctrl **S** | Download edited `.html` |
| **B** | Blackout | ⌘/Ctrl **P** | Print / save PDF |
| **D** | Layout audit overlay | **?** | Help |
| **L** | Slides panel (thumbnails) | **A** | Autoplay on / off |
| **T** | Next colour theme | | |

## Installation

### Via Claude Code Custom Marketplace Source

Install directly from this public GitHub repo. Run these as two separate Claude Code messages; do not paste both lines into the prompt at once.

```text
/plugin marketplace add https://github.com/TheCrownJulz94/powerpoint-to-HTML
```

After that finishes, run:

```text
/plugin install frontend-slides@frontend-slides
```

Use the HTTPS URL. The shorter `TheCrownJulz94/powerpoint-to-HTML` form may make Claude Code try SSH, which can fail if GitHub is not already in your `known_hosts` file.

Then use it by typing `/frontend-slides:frontend-slides` in Claude Code. Claude Code namespaces plugin-installed skills as `/plugin-name:skill-name`.

### Claude Code Manual Installation

Copy the skill files to your Claude Code skills directory:

```bash
# Create the skill directory
mkdir -p ~/.claude/skills/frontend-slides/scripts

# Copy the user-facing skill files
cp SKILL.md STYLE_PRESETS.md viewport-base.css deck-runtime.js html-template.md animation-patterns.md ~/.claude/skills/frontend-slides/
cp -R bold-template-pack examples ~/.claude/skills/frontend-slides/
cp scripts/*.py scripts/*.sh ~/.claude/skills/frontend-slides/scripts/
```

Or clone directly:

```bash
git clone https://github.com/TheCrownJulz94/powerpoint-to-HTML.git ~/.claude/skills/frontend-slides
```

Then use it by typing `/frontend-slides` in Claude Code. Standalone skills are not namespaced.

### Other Coding Agents

Agents such as Codex, Kimi Code, OpenCode, Gemini CLI, or other local coding assistants can use the same core skill. The simplest path is to send the agent this GitHub repo link and ask it to use the Frontend Slides skill:

```text
https://github.com/TheCrownJulz94/powerpoint-to-HTML
```

If the agent can read GitHub repos or browse files, it should start from `SKILL.md` and load only the referenced support files it needs:

- `STYLE_PRESETS.md`
- `viewport-base.css`
- `deck-runtime.js`
- `html-template.md`
- `animation-patterns.md`
- `bold-template-pack/`
- `scripts/`

Some agents can also install the skill for you if they have filesystem access and a known local skills directory. If not, they can still follow `SKILL.md` directly for the current session.

The Claude Code plugin gives Claude Code a custom marketplace-source install flow and `/frontend-slides:frontend-slides` command. Other agents usually do not use that command surface.

## Usage

### Create a New Presentation

```text
/frontend-slides:frontend-slides

> "I want to create a pitch deck for my AI startup"
```

If installed manually as a standalone Claude Code skill, use `/frontend-slides` instead.

In non-Claude agents, ask the agent to use the Frontend Slides skill and point it at this repo or `SKILL.md`.

The skill will:

1. Ask about your content (slides, messages, images)
2. Generate 3 visual style previews for you to compare, inferring the vibe from your brief unless you already named one
3. Let you pick the visual direction
4. Create the full presentation in your chosen style, with speaker notes and step builds for talks
5. Run the layout audit and fix anything that overflows or overlaps
6. Open it in your browser

### Convert a PowerPoint

```text
/frontend-slides:frontend-slides

> "Convert my presentation.pptx to a web slideshow"
```

The skill will:

1. Extract all text, images, and notes from your PPT
2. Show you the extracted content for confirmation
3. Let you pick a visual style
4. Generate an HTML presentation with all your original assets

**Without Claude Code:** use the [converter on claude.ai](https://claude.ai/artifact/PCY6D4bsocXYAQdNinwMUx) with your Claude account, or download the repo and open [`pptx-converter.html`](pptx-converter.html) with an API key (see [Try It in Your Browser](#try-it-in-your-browser)). Drop the `.pptx`, pick a style and let Claude design the deck. It uses the same skill files, but you pick a style from a list instead of from three generated previews.

## Included Styles

### Dark Themes

- **Bold Signal** — Confident, high-impact, vibrant card on dark
- **Electric Studio** — Clean, professional, split-panel
- **Creative Voltage** — Energetic, retro-modern, electric blue + neon
- **Dark Botanical** — Elegant, sophisticated, warm accents

### Light Themes

- **Notebook Tabs** — Editorial, organized, paper with colorful tabs
- **Pastel Geometry** — Friendly, approachable, vertical pills
- **Split Pastel** — Playful, modern, two-color vertical split
- **Vintage Editorial** — Witty, personality-driven, geometric shapes

### Specialty

- **Neon Cyber** — Futuristic, particle backgrounds, neon glow
- **Terminal Green** — Developer-focused, hacker aesthetic
- **Swiss Modern** — Minimal, Bauhaus-inspired, geometric
- **Paper & Ink** — Literary, drop caps, pull quotes
- **Black & Red** — Bold, high-contrast, signal red on near-black (also a built-in theme in every deck)

### Bold Template Pack

The skill also includes 34 optional bold design systems from
`beautiful-html-templates`, such as **Neo-Grid Bold**, **Editorial Tri-Tone**,
**Creative Mode**, **Broadside**, **Signal**, and **Vellum**.

During style discovery, the preview set is:

- 1 safe preset from `STYLE_PRESETS.md`
- at least 1 bold template option from `bold-template-pack/selection-index.json`
- 1 wildcard option, either another bold template or a self-generated custom design

The agent reads the compact bold template index first, then loads only the
shortlisted candidates' small `preview.md` cards for title-slide previews. It
loads the full `design.md` for exactly one bold template only after the user
picks that template for the final deck. If the user picks a custom wildcard,
the agent expands that preview's own CSS and layout system into the full deck.

## Bold Template Gallery

Frontend Slides ships with 34 bold design systems in [`bold-template-pack/`](bold-template-pack/):

- **Soft Editorial** — Cormorant Garamond serif on warm paper with sage, blush, and lemon accents.
- **Editorial Forest** — Forest green, dusty pink, and warm cream in Source Serif 4 — quiet, intentional quarterly-review aesthetic.
- **Pin & Paper** — Yellow paper with safety-pin illustrations, ink-blue handwritten Caveat, paper-grain texture.
- **Sakura Chroma** — Vintage Japanese cassette-package aesthetic: cream paper, diagonal rainbow ribbons, condensed bold type, JIS-style spec checkboxes.
- **Stencil & Tablet** — Bone paper with stencil-cut headlines and a six-color earth palette: archaeology meets brand.
- **Cobalt Grid** — Electric cobalt italic serifs on a graph-paper canvas, anchored by stair-stepped pixel-glitch decorations and slim hairline rules.
- **Vellum** — Deep navy canvas with warm-yellow italic Cormorant serifs and a single dusty teal accent. A quiet, scholarly aesthetic.
- **Emerald Editorial** — Magazine-cover business deck: emerald + navy + paper with double-rule masthead ornaments and a heavy Bodoni-style display serif.
- **Neo-Grid Bold** — Editorial neo-brutalism with a single neon yellow accent on off-white paper.
- **Editorial Tri-Tone** — Three-color editorial system: dusty pink, mustard cream, and deep burgundy, set in Bricolage + Instrument Serif.
- **Creative Mode** — Cream paper canvas with confident multi-color (green, pink, orange, yellow) accents and Archivo Black display.
- **Monochrome** — Ivory ledger paper with all-black type; Lora serif headlines, Jost body, no color at all.
- **People's Platform (Block & Bold)** — Activist poster energy: blue, orange, red on cream, with Alfa Slab + Caveat Brush.
- **Pink Script — After Hours** — Black canvas, hot pink accent, pearl-cream paper, Instrument Serif headlines: late-night editorial luxury.
- **8-Bit Orbit** — Pixel-art neon arcade aesthetic on a deep navy void.
- **BlockFrame** — Neobrutalist deck with pastel-neon color blocks and chunky black borders.
- **Blue Professional** — Cream paper background with electric cobalt blue accents; clean modern professional.
- **Bold Poster** — Editorial poster aesthetic with massive Shrikhand display and a single fire-engine red accent.
- **Broadside** — Dark editorial canvas with a single fire orange accent and bilingual Latin/Chinese type stack.
- **Capsule** — Modular pill-shaped cards on warm bone with a full pastel-pop palette.
- **Cartesian** — Quiet warm-neutral palette with classical Playfair serifs; tasteful and unhurried.
- **Coral** — Cream and coral on near-black, set in oversized Bebas Neue.
- **Daisy Days** — Cheerful pastel deck with hand-drawn daisies, stars, and rainbows. Friendly, soft, and warm.
- **Grove** — Forest-green canvas with cream type, classical Playfair serifs, and a single rust accent.
- **Mat** — Dark sage canvas with bone paper and burnt-orange accent; mid-century modern with wood undertones.
- **Playful** — Sun-warm peach background with Syne display: a friendly indie launch deck.
- **Raw Grid** — Neo-brutalist deck with thick borders, offset shadows, and a pink/sage/ink palette.
- **Retro Windows** — Windows 95 chrome: gray title bars, MS Sans Serif, pixel typography, full nostalgia.
- **Retro Zine** — Beige paper with green accent and Bebas Neue + Caveat: a riso-printed zine in HTML form.
- **Scatterbrain** — Post-it inspired: pastel sticky notes, Caveat handwriting, Shrikhand and Zilla Slab type stack.
- **Signal** — Deep navy canvas with bone paper and a single muted-gold accent; institutional with quiet weight.
- **Studio** — Black canvas with electric-yellow type; high-voltage design studio aesthetic.
- **Biennale Yellow** — Solar yellow on warm parchment with deep indigo serif and atmospheric sun-glow gradients. Dutch-editorial poster energy.
- **Long Table** — Warm cream and rust-red supper-club aesthetic with bold uppercase grotesk headlines, italic Fraunces, and pill-shaped outlined buttons.

## Architecture

This skill uses **progressive disclosure** — the main `SKILL.md` is a workflow map, with supporting files loaded on-demand only when needed:

| File                      | Purpose                        | Loaded When               |
| ------------------------- | ------------------------------ | ------------------------- |
| `SKILL.md`                | Core workflow and rules        | Always (skill invocation) |
| `STYLE_PRESETS.md`        | 13 curated visual presets      | Phase 2 (style selection) |
| `bold-template-pack/selection-index.json` | Compact bold template metadata for candidate selection | Phase 2 (style selection) |
| `bold-template-pack/templates/*/preview.md` | Tiny style cards for shortlisted bold previews | Phase 2 after shortlisting |
| `bold-template-pack/templates/*/design.md` | Full design system for the selected bold template | Phase 3 after user selection |
| `html-template.md`        | HTML skeleton and runtime features | Phase 3 (generation)  |
| `viewport-base.css`       | Mandatory fixed-stage CSS (inlined by script) | Never read by the agent |
| `deck-runtime.js`         | Shared runtime: nav, fragments, notes, presenter, overview, editing, print, audit (inlined by script) | Never read by the agent |
| `scripts/inline-runtime.py` | Fills the CSS/JS placeholders; re-run to upgrade a deck | Phase 3 (generation) |
| `scripts/check-deck.sh`   | Automated layout QA with screenshots | Phase 3 (verification) |
| `animation-patterns.md`   | CSS/JS animation reference     | Phase 3 (generation)      |
| `scripts/extract-pptx.py` | PPT content extraction         | Phase 4 (conversion)      |
| `scripts/deploy.sh`       | Deploy to Vercel               | Phase 6 (sharing)         |
| `scripts/export-pdf.sh`   | Export slides to PDF           | Phase 6 (sharing)         |

Maintenance-only source metadata and regeneration helpers live outside the
user-facing skill package. Normal users do not need them.

This design follows agent-skill best practices: give the agent a map first,
then reveal only the specific files needed for the current choice.

## Philosophy

This skill was born from the belief that:

1. **You don't need to be a designer to make beautiful things.** You just need to react to what you see.

2. **Dependencies are debt.** A single HTML file will work in 10 years. A React project from 2019? Good luck.

3. **Generic is forgettable.** Every presentation should feel custom-crafted, not template-generated.

4. **Comments are kindness.** Code should explain itself to future-you (or anyone else who opens it).

## Sharing Your Presentations

After creating a presentation, the skill offers two ways to share it:

### Deploy to a Live URL

One command deploys your slides to a permanent, shareable URL that works on any device — phones, tablets, laptops:

```bash
bash scripts/deploy.sh ./my-deck/
# or
bash scripts/deploy.sh ./presentation.html
```

Uses [Vercel](https://vercel.com) (free tier). The skill walks you through signup and login if it's your first time.

### Export to PDF

Convert your slides to a PDF for email, Slack, Notion, or printing:

```bash
bash scripts/export-pdf.sh ./my-deck/index.html
bash scripts/export-pdf.sh ./presentation.html ./output.pdf
```

Uses [Playwright](https://playwright.dev) to screenshot each slide at 1920×1080 and combine into a PDF. Installs automatically if needed. Animations are not preserved (it's a static snapshot).

Or skip the tooling: open the deck, press ⌘/Ctrl+P, choose **Save as PDF**, set margins to **None** and turn on **background graphics**. You get one page per slide with selectable vector text.

### Check a Deck Before Presenting

```bash
bash scripts/check-deck.sh ./presentation.html
```

This renders every slide headlessly and reports clipped or overlapping text, panels cut off by the slide edge, text under 18px, broken images and leftover placeholder text. It also confirms the deck stays 16:9 on a phone. Screenshots, a one-glance `overview.png` contact sheet and `report.json` go to `presentation-check/`. The exit code is non-zero when errors are found, so you can use it in CI. Playwright is cached in `~/.cache/frontend-slides` after the first run.

## Maintaining

The repo root is the source of truth. After editing any skill file, mirror it into the Claude Code plugin package:

```bash
bash scripts/sync-plugin.sh          # copy root → plugins/frontend-slides/skills/frontend-slides
bash scripts/sync-plugin.sh --check  # CI: fail if the plugin copy is stale
python3 scripts/inline-runtime.py examples/demo-deck.html   # refresh the demo after runtime changes
python3 scripts/inline-runtime.py pptx-converter.html       # re-embed runtime + skill files in the converter
python3 scripts/build-hosted.py hosted.html                 # claude.ai copy of the converter, to republish
```

Republish the claude.ai converter from `hosted.html` with the capabilities `{"sample": {"images": true}, "downloads": true, "db": {}, "user": {}, "assets": {}}` so it keeps signing visitors in with their Claude account and keeps My decks working.

## Requirements

- A local coding agent with filesystem access and the ability to run shell commands
- Claude Code is required only for the custom marketplace-source install and `/frontend-slides:frontend-slides` command
- For PPT conversion: Python with `python-pptx` library
- For URL deployment: Node.js + Vercel account (free)
- For PDF export and `check-deck.sh`: Node.js (Playwright installs automatically). Browser ⌘P needs nothing extra
- For `inline-runtime.py`: Python 3 (standard library only)

## License

MIT — Use it, modify it, share it.
