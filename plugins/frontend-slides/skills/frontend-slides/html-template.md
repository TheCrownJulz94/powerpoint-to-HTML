# HTML Presentation Template

Reference architecture for generating slide presentations. Every presentation follows a fixed 16:9 stage model: slides are authored at 1920×1080 and the whole stage scales to fit the browser window.

## Base HTML Structure

The shared stage CSS and the runtime JS are **not typed out by hand**. Write the two empty placeholder tags below, then run:

```bash
python3 scripts/inline-runtime.py presentation.html
```

That fills `<style data-fs-base>` with [viewport-base.css](viewport-base.css) and `<script data-fs-runtime>` with [deck-runtime.js](deck-runtime.js). The output is still one self-contained HTML file. Running the command again later upgrades an older deck to the current runtime.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Presentation Title</title>

    <!-- Fonts: use Fontshare or Google Fonts — never system fonts -->
    <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=...">

    <!-- === BASE STAGE CSS === filled by scripts/inline-runtime.py — leave empty -->
    <style data-fs-base></style>

    <style>
        /* ===========================================
           CSS CUSTOM PROPERTIES (THEME)
           Change these to change the whole look
           =========================================== */
        :root {
            /* These five names are the theme roles the runtime's switcher (T)
               recolours. Use other names? Map them on .deck-stage with
               data-fs-theme-vars="bg:--x; surface:--y; text:--z; muted:--m; accent:--a" */
            --bg-primary: #0a0f1c;
            --surface: #141b2d;                    /* cards, table stripes */
            --text-primary: #ffffff;
            --text-secondary: #9ca3af;
            --accent: #00ffcc;                     /* also colours the progress bar */
            --accent-glow: rgba(0, 255, 204, 0.3); /* used by .fragment.highlight */
            --stage-bg: #000;                      /* letterbox colour */
            --slide-bg: var(--bg-primary);

            /* Typography — authored at 1920×1080 stage size */
            --font-display: 'Clash Display', sans-serif;
            --font-body: 'Satoshi', sans-serif;
            --title-size: 112px;
            --body-size: 28px;

            --slide-padding: 72px;
            --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
            --duration-normal: 0.6s;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        /* ===========================================
           ENTRANCE ANIMATIONS — play when a slide becomes .visible
           =========================================== */
        .reveal {
            opacity: 0;
            transform: translateY(30px);
            transition: opacity var(--duration-normal) var(--ease-out-expo),
                        transform var(--duration-normal) var(--ease-out-expo);
        }
        .slide.visible .reveal { opacity: 1; transform: none; }
        .slide.visible .reveal:nth-child(2) { transition-delay: 0.1s; }
        .slide.visible .reveal:nth-child(3) { transition-delay: 0.2s; }

        /* ... style-specific slide CSS ... */
    </style>
</head>
<body>
    <div class="deck-viewport">
        <main class="deck-stage" id="deckStage">
            <section class="slide title-slide active" data-title="Title">
                <h1 class="reveal">Presentation Title</h1>
                <p class="reveal">Subtitle or author</p>
                <aside class="notes">What to say on this slide. Shown only in presenter view (P).</aside>
            </section>

            <section class="slide" data-title="Three reasons">
                <h2 class="reveal">Slide Title</h2>
                <ul>
                    <li class="fragment">Appears on the 1st keypress</li>
                    <li class="fragment">Appears on the 2nd keypress</li>
                </ul>
                <aside class="notes">Speaker notes...</aside>
            </section>
        </main>
    </div>

    <!-- === DECK RUNTIME === filled by scripts/inline-runtime.py — leave empty -->
    <script data-fs-runtime></script>
</body>
</html>
```

Do **not** write your own `SlidePresentation` class, keyboard handler, stage scaler, or edit mode. The runtime provides all of them. Deck-specific JavaScript (particles, counters, charts) goes in a separate `<script>` **after** the runtime and hooks into the `slidechange` event:

```javascript
document.addEventListener('slidechange', (e) => {
    const { index, previousIndex, total, slide, step } = e.detail;
    if (slide.matches('.stats-slide')) startCounters(slide);
});
```

## What the Runtime Provides

| Feature | How it is used |
| --- | --- |
| Fixed 16:9 scaling | Automatic. The 1920×1080 stage is letterboxed to any window. |
| Navigation | → ← Space PgUp/PgDn Home End, number + Enter to jump, mouse wheel, swipe, tap on the left/right third on touch screens |
| **Fragments** (step builds) | Add `class="fragment"` to any element. Elements with the same `data-fragment-index="N"` appear together. Variants: `fragment fade-only` (no slide-up), `fragment highlight` (accent background when shown). Going back to a slide shows all of its fragments. |
| **Speaker notes** | `<aside class="notes">…</aside>` inside a slide. Hidden on the slide, shown in presenter view. HTML is allowed. |
| **Presenter view** (P) | Second window with the current slide, next step/slide preview, notes, timer (R resets) and clock. Keys in either window drive both. |
| **Overview** (O) | Grid of every slide. Captions come from `data-title` or the first heading. Arrows + Enter, or click. |
| **Deep links** | URL hash follows position: `deck.html#5` is slide 5, `#5.2` is slide 5 after 2 steps. |
| Progress bar + counter | Thin bar in `var(--accent)` along the top edge. A `3 / 12` counter appears when the mouse moves. Disable with `data-fs-progress="off"` / `data-fs-counter="off"` on `.deck-stage`. |
| **Inline editing** (E) | Click any text to edit it. Edits auto-save to localStorage and are restored on reload. ⌘/Ctrl+S downloads a clean `.html` without editing artefacts, ready to replace the original. Disable with `data-fs-edit="off"`. |
| **Print / PDF** (⌘P) | One slide per 1920×1080 page, with every `.reveal` and fragment visible. No Playwright needed. |
| **Layout audit** (D) | Outlines clipped, off-slide, overlapping or too-small text on the current slide and lists the issues. |
| **Slides panel** (L) | Thumbnail strip on the left edge with autoplay and theme controls; the stage fits beside it. Opens by default on windows ≥ 900px wide and remembers the viewer's choice. `data-fs-rail="closed"` starts it hidden, `"off"` removes it. Hidden in presenter previews, print and automated checks. |
| **Autoplay** (A) | Advances one step (fragment or slide) every N seconds; pauses while editing or with an overlay open. Loops by default. Start automatically with `data-fs-autoplay="8"` on `.deck-stage` or `?autoplay=8` in the URL; `data-fs-loop="off"` stops at the end. |
| **Themes** (T) | **Standard** (the deck's own `:root` colours), **Black & Red**, **Custom** (two colour pickers; text, muted and surface are derived). Works when the deck's colours live in the role variables above (or are mapped with `data-fs-theme-vars`); colours hard-coded in slide CSS won't change. A starting theme can be set with `<html data-fs-theme="black-red">` or `data-fs-theme="custom" data-fs-theme-bg="#…" data-fs-theme-accent="#…"`. ⌘S saves the current choice that way. Disable with `data-fs-themes="off"`. |
| Fullscreen (F), blackout (B), help (?) | Built in |
| API | `window.presentation.goToSlide(i, step)`, `.next()`, `.prev()`, `.showAllFragments()`, `.current`, `.total`, `FrontendSlides.audit()` |

Accessibility: inactive slides get `aria-hidden="true"`, slide changes are announced through a polite live region, and `prefers-reduced-motion` is respected by viewport-base.css.

**Audit opt-outs** for intentional effects: `data-allow-overlap` (layered type), `data-allow-overflow` (deliberately cropped text), `aria-hidden="true"` (decorative giant numerals or watermarks), `data-fs-audit-off` on a whole slide. Raise the per-slide word limit with `data-fs-max-words="180"` on `.deck-stage` for reading-first decks.

## Image Pipeline (Skip If No Images)

If user chose "No images" in Phase 1, skip this entirely. If images were provided, process them before generating HTML.

**Dependency:** `pip install Pillow`

### Image Processing

```python
from PIL import Image, ImageDraw

# Circular crop (for logos on modern/clean styles)
def crop_circle(input_path, output_path):
    img = Image.open(input_path).convert('RGBA')
    w, h = img.size
    size = min(w, h)
    left, top = (w - size) // 2, (h - size) // 2
    img = img.crop((left, top, left + size, top + size))
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size, size], fill=255)
    img.putalpha(mask)
    img.save(output_path, 'PNG')

# Resize (for oversized images that inflate HTML)
def resize_max(input_path, output_path, max_dim=1200):
    img = Image.open(input_path)
    img.thumbnail((max_dim, max_dim), Image.LANCZOS)
    img.save(output_path, quality=85)
```

| Situation | Operation |
|-----------|-----------|
| Square logo on rounded aesthetic | `crop_circle()` |
| Image > 1MB | `resize_max(max_dim=1200)` |
| Wrong aspect ratio | Manual crop with `img.crop()` |

Save processed images with `_processed` suffix. Never overwrite originals.

### Image Placement

**Use direct file paths** (not base64) — presentations are viewed locally:

```html
<img src="assets/logo_round.png" alt="Logo" class="slide-image logo">
<img src="assets/screenshot.png" alt="Screenshot" class="slide-image screenshot">
```

```css
.slide-image {
    max-width: 100%;
    max-height: 560px; /* stage px — never vh: the stage is fixed 1920×1080 */
    object-fit: contain;
    border-radius: 8px;
}
.slide-image.screenshot {
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}
.slide-image.logo {
    max-height: 220px;
}
```

**Adapt border/shadow colors to match the chosen style's accent.** Never repeat the same image on multiple slides (except logos on title + closing).

**Placement patterns:** Logo centered on title slide. Screenshots in two-column layouts with text. Full-bleed images as slide backgrounds with text overlay (use sparingly).

---

## Code Quality

**Comments:** Every section needs clear comments explaining what it does and how to modify it.

**Accessibility:**
- Semantic HTML (`<section>`, `<nav>`, `<main>`)
- Keyboard navigation works fully
- ARIA labels where needed
- `prefers-reduced-motion` support (included in viewport-base.css)

## File Structure

Single presentations:
```
presentation.html    # Self-contained, all CSS/JS inline (after inline-runtime.py)
assets/              # Images only, if any
```

Multiple presentations in one project:
```
[name].html
[name]-assets/
```
