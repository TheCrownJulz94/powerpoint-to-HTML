/* ===========================================================================
   FRONTEND SLIDES — DECK RUNTIME  (v3)
   Inline this ENTIRE file in a <script> tag at the end of <body>.
   Zero dependencies. Works from file://, a web server, or inside an iframe.

   Markup contract (same as viewport-base.css):
     <div class="deck-viewport">
       <main class="deck-stage" id="deckStage">
         <section class="slide">…
           <p class="fragment">appears on next keypress</p>
           <aside class="notes">Speaker notes (hidden on the slide)</aside>
         </section>
       </main>
     </div>

   Keyboard
     → ↓ Space PgDn Enter   next step / slide      ← ↑ PgUp Backspace  previous
     Home / End             first / last           12 Enter            jump to slide 12
     O                      overview grid          P                   presenter view (notes, timer, next)
     F                      fullscreen             B or .              blackout
     E                      edit text in place     ⌘/Ctrl+S            download edited .html
     D                      layout audit overlay   ?                   shortcut help
     L                      slides panel (left)    A                   autoplay on / off
     T                      next colour theme      Esc                 close any overlay

   Optional stage attributes:  data-fs-progress="off"  data-fs-counter="off"
                               data-fs-wheel="off"     data-fs-edit="off"
                               data-fs-rail="off|closed"  data-fs-themes="off"
                               data-fs-autoplay="8"    data-fs-loop="off"
                               data-fs-theme-vars="bg:--paper; surface:--paper-deep; text:--ink; muted:--ink-soft; accent:--accent"
   URL: ?autoplay=8 starts autoplay (8s per step).
   <html data-fs-theme="black-red|custom" data-fs-theme-bg="#…" data-fs-theme-accent="#…"> picks the starting theme.

   Public API (window.presentation / window.FrontendSlides):
     goToSlide(i, step?)  next()  prev()  current  total  showAllFragments()
     audit() → [{slide, severity, type, message, selector}]
   Event: document 'slidechange'  detail {index, previousIndex, total, slide, step}
   =========================================================================== */
(function () {
  'use strict';

  var W = 1920, H = 1080, RAIL_W = 128;
  var TEXT_SEL = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,td,th,dt,dd,label,.editable';
  var params = new URLSearchParams(location.search);
  var EMBED = params.has('fs-embed');           // presenter-view preview frames
  var AUTOMATED = !!navigator.webdriver;         // Playwright / export / check scripts

  /* ------------------------------------------------------------------------
     AUDIT — pure function, usable without initialising the runtime.
     Checks every slide (hidden slides still have layout, so no navigation).
     ------------------------------------------------------------------------ */
  function audit(opts) {
    opts = opts || {};
    var minFont = opts.minFontPx || 18;
    var stage = findStage();
    if (!stage) return [{ slide: 0, severity: 'error', type: 'structure', message: 'No .deck-stage element found' }];
    var slides = findSlides(stage);
    var issues = [];
    var sRect = stage.getBoundingClientRect();
    var scale = sRect.width / W || 1;
    var tol = 2; // stage px

    function push(slideIdx, severity, type, el, message) {
      issues.push({ slide: slideIdx + 1, severity: severity, type: type, message: message, selector: el ? describe(el) : '', el: el });
    }

    slides.forEach(function (slide, si) {
      if (slide.hasAttribute('data-fs-audit-off')) return;
      if (opts.slide != null && opts.slide !== si) return;
      var all = Array.prototype.slice.call(slide.querySelectorAll('*')).filter(function (el) {
        return !el.closest('aside.notes,.speaker-notes,[data-fs-chrome],[aria-hidden="true"]:not(.slide),[data-allow-overflow]') && isRendered(el);
      });

      // 1. Content clipped by its own box (text cut off inside a card/panel)
      all.forEach(function (el) {
        var cs = getComputedStyle(el);
        if (cs.overflow === 'visible' && cs.overflowX === 'visible' && cs.overflowY === 'visible') return;
        if (!hasText(el)) return;
        if (el.scrollHeight > el.clientHeight + tol || el.scrollWidth > el.clientWidth + tol) {
          push(si, 'error', 'overflow', el, 'Content is clipped inside its box (' +
            Math.round(el.scrollWidth) + '×' + Math.round(el.scrollHeight) + ' content in ' +
            Math.round(el.clientWidth) + '×' + Math.round(el.clientHeight) + ')');
        }
      });

      // 2. Text running outside the 1920×1080 slide
      var leaves = all.filter(ownsText);
      leaves.forEach(function (el) {
        var r = textRect(el); if (!r) return;
        var l = (r.left - sRect.left) / scale, t = (r.top - sRect.top) / scale;
        var rr = (r.right - sRect.left) / scale, b = (r.bottom - sRect.top) / scale;
        if (l < -tol || t < -tol || rr > W + tol || b > H + tol) {
          push(si, 'error', 'off-slide', el, 'Text extends outside the 1920×1080 slide');
        }
      });

      // 2b. Cards / panels that contain text but are cut off by the slide edge
      all.forEach(function (el) {
        if (!hasText(el) || !isPanel(el)) return;
        var r = el.getBoundingClientRect();
        var l = (r.left - sRect.left) / scale, t = (r.top - sRect.top) / scale;
        var rr = (r.right - sRect.left) / scale, b = (r.bottom - sRect.top) / scale;
        if ((rr - l) > W * 0.9 || (b - t) > H * 0.9) return; // full-bleed bands are intentional
        if (l < -tol || t < -tol || rr > W + tol || b > H + tol) {
          push(si, 'error', 'panel-clipped', el, 'Panel is cut off by the slide edge (' +
            Math.round(Math.max(-l, -t, rr - W, b - H)) + 'px outside)');
        }
      });

      // 3. Text lines overlapping each other
      var boxes = leaves.filter(function (el) { return !el.closest('[data-allow-overlap]'); })
        .map(function (el) { return { el: el, rs: textRects(el) }; })
        .filter(function (b) { return b.rs.length; });
      for (var i = 0; i < boxes.length; i++) {
        for (var j = i + 1; j < boxes.length; j++) {
          var a = boxes[i], c = boxes[j];
          if (a.el.contains(c.el) || c.el.contains(a.el)) continue;
          var hit = a.rs.some(function (ra) {
            return c.rs.some(function (rc) {
              var ix = Math.min(ra.right, rc.right) - Math.max(ra.left, rc.left);
              var iy = Math.min(ra.bottom, rc.bottom) - Math.max(ra.top, rc.top);
              return ix > 0 && iy > 0 && ix * iy > Math.min(ra.width * ra.height, rc.width * rc.height) * 0.08;
            });
          });
          if (hit) push(si, 'error', 'overlap', a.el, 'Text overlaps "' + snippet(c.el) + '"');
        }
      }

      // 4. Text too small to read when projected
      leaves.forEach(function (el) {
        var fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < minFont) push(si, 'warn', 'small-text', el, 'Font size ' + fs + 'px is below ' + minFont + 'px at 1920×1080');
      });

      // 5. Broken images
      slide.querySelectorAll('img').forEach(function (img) {
        if (img.complete && img.naturalWidth === 0) push(si, 'error', 'broken-image', img, 'Image failed to load: ' + img.getAttribute('src'));
      });

      // 6. Internal workflow text leaking onto slides
      var visible = slideText(slide);
      var leak = visible.match(/\b(preview\.md|design\.md|style option|option [abc]\b|lorem ipsum|placeholder text|TODO|TBD|generated by|wildcard)\b/i);
      if (leak) push(si, 'warn', 'leak', slide, 'Slide contains workflow/placeholder text: "' + leak[0] + '"');

      // 7. Density: too many words for one slide
      var words = visible.split(/\s+/).filter(Boolean).length;
      var maxWords = parseInt(stage.getAttribute('data-fs-max-words') || '120', 10);
      if (words > maxWords) push(si, 'warn', 'density', slide, words + ' words on one slide (limit ' + maxWords + ') — consider splitting');
    });
    return issues.map(function (i) { if (opts.plain) delete i.el; return i; });
  }

  function isRendered(el) {
    var cs = getComputedStyle(el);
    return cs.display !== 'none' && el.getClientRects().length > 0;
  }
  function isPanel(el) {
    var cs = getComputedStyle(el);
    var bg = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent';
    var border = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth) > 0;
    return bg || border || cs.backgroundImage !== 'none' || cs.boxShadow !== 'none';
  }
  function ownsText(el) {
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3 && n.nodeValue.trim()) return true;
    }
    return false;
  }
  function hasText(el) { return (el.textContent || '').trim().length > 0; }
  function textRect(el) {
    // Union of the element's own text lines (tighter than the element box)
    var rs = textRects(el); if (!rs.length) return null;
    var u = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
    rs.forEach(function (r) { u.left = Math.min(u.left, r.left); u.top = Math.min(u.top, r.top); u.right = Math.max(u.right, r.right); u.bottom = Math.max(u.bottom, r.bottom); });
    u.width = u.right - u.left; u.height = u.bottom - u.top;
    return u;
  }
  function textRects(el) {
    // Per-line rects of the element's own text nodes, trimmed vertically to
    // roughly the glyph height. A font's content box is ~1.2-1.3x its size, so
    // tight display type (line-height < 1) would otherwise "overlap" neighbours.
    var range = document.createRange(), out = [];
    var fs = parseFloat(getComputedStyle(el).fontSize) || 16;
    var scale = (findStage().getBoundingClientRect().width / W) || 1;
    var glyph = fs * 0.92 * scale;
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType !== 3 || !n.nodeValue.trim()) continue;
      range.selectNodeContents(n);
      Array.prototype.forEach.call(range.getClientRects(), function (r) {
        if (!r.width || !r.height) return;
        var inset = Math.max(0, (r.height - glyph) / 2);
        out.push({ left: r.left, right: r.right, top: r.top + inset, bottom: r.bottom - inset, width: r.width, height: r.height - 2 * inset });
      });
    }
    return out;
  }
  function slideText(slide) {
    var clone = slide.cloneNode(true);
    clone.querySelectorAll('aside.notes,.speaker-notes,script,style,[aria-hidden="true"]').forEach(function (n) { n.remove(); });
    return (clone.textContent || '').replace(/\s+/g, ' ').trim();
  }
  function snippet(el) { var t = (el.textContent || '').trim().replace(/\s+/g, ' '); return t.length > 40 ? t.slice(0, 40) + '…' : t; }
  function describe(el) {
    if (el.classList && el.classList.contains('slide')) return 'section.slide';
    var s = el.tagName.toLowerCase();
    if (el.id) return s + '#' + el.id;
    var cls = Array.prototype.filter.call(el.classList || [], function (c) { return c.indexOf('fs-') !== 0; });
    if (cls.length) s += '.' + cls.slice(0, 2).join('.');
    return s + ' "' + snippet(el) + '"';
  }
  function findStage() { return document.getElementById('deckStage') || document.querySelector('.deck-stage'); }
  function findSlides(stage) {
    return Array.prototype.filter.call(stage.querySelectorAll('.slide'), function (s) {
      return !s.parentElement.closest('.slide');
    });
  }

  /* ------------------------------------------------------------------------
     RUNTIME CHROME STYLES — injected, namespaced with fs-, never saved.
     ------------------------------------------------------------------------ */
  var CSS = [
    '.slide aside.notes,.slide .speaker-notes{display:none!important}',
    '.fragment{opacity:0;transform:translateY(16px);transition:opacity .45s cubic-bezier(.16,1,.3,1),transform .45s cubic-bezier(.16,1,.3,1)}',
    '.fragment.fs-shown{opacity:1;transform:none}',
    '.fragment.fade-only{transform:none}',
    '.fragment.highlight.fs-shown{background:var(--accent-glow,rgba(255,220,0,.35));border-radius:.15em}',
    '[data-fs-chrome]{font:500 13px/1.4 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.01em;box-sizing:border-box}',
    '[data-fs-chrome] *{box-sizing:border-box}',
    '.fs-progress{position:fixed;left:0;top:0;height:3px;width:0;background:var(--accent,#fff);z-index:9000;transition:width .35s cubic-bezier(.16,1,.3,1);pointer-events:none}',
    '.fs-counter{position:fixed;right:18px;bottom:14px;z-index:9000;color:#fff;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);padding:5px 10px;border-radius:999px;font-variant-numeric:tabular-nums;opacity:0;transition:opacity .3s;pointer-events:none}',
    '.fs-idle-off .fs-counter{opacity:.9}',
    '.fs-toast{position:fixed;left:50%;bottom:28px;transform:translate(-50%,20px);z-index:9600;background:#111;color:#fff;padding:10px 16px;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.35);opacity:0;transition:opacity .25s,transform .25s;pointer-events:none;max-width:80vw}',
    '.fs-toast.fs-on{opacity:1;transform:translate(-50%,0)}',
    '.fs-blackout{position:fixed;inset:0;background:#000;z-index:9400;display:none}',
    '.fs-blackout.fs-on{display:block}',
    '.fs-layer{position:fixed;inset:0;z-index:9500;display:none;color:#eee;background:rgba(10,10,12,.97);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);overflow:auto}',
    '.fs-layer.fs-on{display:block}',
    '.fs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:22px;padding:32px}',
    '.fs-thumb{cursor:pointer;border-radius:8px;outline:2px solid transparent;outline-offset:4px;transition:outline-color .15s}',
    '.fs-thumb.fs-sel,.fs-thumb:hover{outline-color:var(--accent,#fff)}',
    '.fs-thumb-frame{position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;border-radius:6px;background:var(--slide-bg,#fff)}',
    '.fs-thumb-frame>.deck-stage{position:absolute!important;left:0;top:0;transform-origin:0 0;pointer-events:none}',
    '.fs-thumb-cap{margin-top:8px;opacity:.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.fs-help{max-width:560px;margin:10vh auto;padding:28px 32px;background:#16161a;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.5)}',
    '.fs-help h2{font-size:18px;margin:0 0 16px}',
    '.fs-help table{width:100%;border-collapse:collapse}',
    '.fs-help td{padding:6px 0;border-bottom:1px solid #2a2a30;vertical-align:top}',
    '.fs-help td:first-child{width:42%;color:#aaa}',
    '.fs-help kbd{display:inline-block;min-width:1.6em;padding:1px 6px;border-radius:5px;background:#2a2a30;border:1px solid #3a3a42;font:inherit;text-align:center}',
    '.fs-edit-bar{position:fixed;left:14px;top:14px;z-index:9300;display:none;gap:6px;align-items:center;background:#111;color:#fff;padding:6px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.35)}',
    '.fs-editing .fs-edit-bar{display:flex}',
    '.fs-edit-bar span{padding:0 8px;opacity:.8}',
    '.fs-edit-bar button{font:inherit;color:inherit;background:#26262c;border:0;border-radius:8px;padding:6px 10px;cursor:pointer}',
    '.fs-edit-bar button:hover{background:#3a3a42}',
    '.fs-edit-hot{position:fixed;left:0;top:0;width:72px;height:72px;z-index:9200}',
    '.fs-edit-btn{position:fixed;left:14px;top:14px;z-index:9250;width:40px;height:40px;border-radius:50%;border:0;background:#111;color:#fff;font-size:18px;cursor:pointer;opacity:0;pointer-events:none;transition:opacity .25s;box-shadow:0 6px 18px rgba(0,0,0,.3)}',
    '.fs-edit-btn.fs-on{opacity:1;pointer-events:auto}',
    '.fs-editing .fs-edit-btn{display:none}',
    '.fs-editing [contenteditable="true"]{outline:1px dashed rgba(127,127,127,.55);outline-offset:4px;cursor:text}',
    '.fs-editing [contenteditable="true"]:focus{outline:2px solid var(--accent,#3b82f6)}',
    '.fs-editing .fragment{opacity:1!important;transform:none!important}',
    '.fs-audit-mark{outline:3px solid #ff3b30!important;outline-offset:2px;background-color:rgba(255,59,48,.08)!important}',
    '.fs-audit-mark.fs-warn{outline-color:#ff9f0a!important;background-color:rgba(255,159,10,.08)!important}',
    '.fs-audit-panel{position:fixed;right:14px;top:14px;z-index:9550;width:380px;max-height:70vh;overflow:auto;background:#111;color:#eee;border-radius:12px;padding:14px 16px;box-shadow:0 12px 40px rgba(0,0,0,.45);display:none}',
    '.fs-auditing .fs-audit-panel{display:block}',
    '.fs-audit-panel h3{margin:0 0 8px;font-size:14px}',
    '.fs-audit-panel li{margin:6px 0;list-style:none;padding-left:14px;position:relative}',
    '.fs-audit-panel li:before{content:"";position:absolute;left:0;top:7px;width:7px;height:7px;border-radius:50%;background:#ff3b30}',
    '.fs-audit-panel li.fs-warn:before{background:#ff9f0a}',
    '.fs-audit-panel ul{margin:0;padding:0}',
    '.fs-audit-panel small{opacity:.6}',
    /* Slides rail (L), autoplay (A), theme switcher (T) */
    '.fs-rail{position:fixed;left:0;top:0;bottom:0;width:' + RAIL_W + 'px;z-index:9100;display:flex;flex-direction:column;background:#0f0f12;color:#e8e8ea;border-right:1px solid #24242a;transform:translateX(-100%);visibility:hidden;transition:transform .3s cubic-bezier(.16,1,.3,1),visibility 0s .3s}',
    '.fs-rail-on .fs-rail{transform:none;visibility:visible;transition:transform .3s cubic-bezier(.16,1,.3,1)}',
    '.fs-rail-head{padding:8px;border-bottom:1px solid #24242a;display:flex;flex-direction:column;gap:7px;font-size:12px}',
    '.fs-rail-row{display:flex;gap:4px;align-items:center}',
    '.fs-rbtn{font:inherit;color:inherit;background:#1d1d22;border:1px solid #2c2c33;border-radius:7px;height:28px;min-width:28px;padding:0 7px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px}',
    '.fs-rbtn:hover{background:#2a2a31}',
    '.fs-rbtn:focus-visible,.fs-rail select:focus-visible{outline:2px solid #e8e8ea;outline-offset:1px}',
    '.fs-rbtn[aria-pressed="true"]{background:#e8e8ea;border-color:#e8e8ea;color:#111}',
    '.fs-rail select{font:inherit;color:inherit;background:#1d1d22;border:1px solid #2c2c33;border-radius:7px;height:28px;padding:0 4px;cursor:pointer;flex:1;min-width:0}',
    '.fs-rail-loop{flex:1}',
    '.fs-autobar{height:2px;background:#24242a;border-radius:2px;overflow:hidden;display:none}',
    '.fs-autoplaying .fs-autobar{display:block}',
    '.fs-autobar i{display:block;height:100%;width:0;background:#e8e8ea}',
    '.fs-lbl{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#8a8a92}',
    '.fs-themes{display:flex;gap:4px}',
    '.fs-theme-btn{flex:1;min-width:0;height:24px;padding:3px}',
    '.fs-theme-btn[aria-pressed="true"]{background:#2a2a31;border-color:#e8e8ea;color:#fff}',
    '.fs-sw{display:flex;width:100%;height:100%;border-radius:4px;overflow:hidden;border:1px solid rgba(255,255,255,.15)}',
    '.fs-sw i{flex:1}.fs-sw i:last-child{flex:.45}',
    '.fs-custom{display:none;flex-direction:column;gap:5px}',
    '.fs-theme-custom .fs-custom{display:flex}',
    '.fs-custom label{display:flex;align-items:center;gap:6px;font-size:11px;color:#aaa;cursor:pointer}',
    '.fs-custom input{width:26px;height:20px;flex:none;padding:0;border:1px solid #2c2c33;border-radius:5px;background:none;cursor:pointer}',
    /* Tiny thumbnails; the list scrolls by wheel, trackpad, touch and keyboard with no visible scrollbar */
    '.fs-rail-list{flex:1;overflow-y:auto;padding:8px 8px 16px;display:flex;flex-direction:column;gap:8px;overscroll-behavior:contain;scrollbar-width:none;-ms-overflow-style:none}',
    '.fs-rail-list::-webkit-scrollbar{display:none}',
    '.fs-rail-list .fs-thumb{display:flex;gap:4px;align-items:flex-start;outline:none!important}',
    '.fs-rail-num{width:12px;flex:none;text-align:right;font-size:10px;line-height:1;color:#8a8a92;font-variant-numeric:tabular-nums}',
    '.fs-rail-list .fs-thumb-frame{flex:1;min-width:0;outline:2px solid transparent;outline-offset:1px;border-radius:2px;transition:outline-color .15s}',
    '.fs-rail-list .fs-thumb:hover .fs-thumb-frame{outline-color:#55555e}',
    '.fs-rail-list .fs-thumb.fs-sel .fs-thumb-frame{outline-color:#e8e8ea}',
    '.fs-rail-list .fs-thumb.fs-sel .fs-rail-num{color:#e8e8ea}',
    '.fs-rail-tab{position:fixed;left:10px;top:50%;transform:translateY(-50%);z-index:9100;width:28px;height:56px;border:0;border-radius:8px;background:rgba(0,0,0,.55);color:#fff;cursor:pointer;opacity:0;transition:opacity .3s;font-size:14px}',
    '.fs-idle-off .fs-rail-tab,.fs-rail-tab:focus-visible{opacity:.85}',
    '.fs-rail-on .fs-rail-tab{display:none}',
    '.fs-rail-on .fs-edit-btn,.fs-rail-on .fs-edit-bar{left:' + (RAIL_W + 14) + 'px}',
    '.fs-rail-on .fs-edit-hot{left:' + RAIL_W + 'px}',
    '.fs-embed [data-fs-chrome]{display:none!important}',
    '.fs-automated .fs-progress,.fs-automated .fs-counter,.fs-automated .fs-edit-hot,.fs-automated .fs-edit-btn,.fs-automated .fs-rail,.fs-automated .fs-rail-tab{display:none!important}',
    '@page{size:1920px 1080px;margin:0}',
    '@media print{[data-fs-chrome]{display:none!important}.fragment{opacity:1!important;transform:none!important}html,body{print-color-adjust:exact;-webkit-print-color-adjust:exact}',
    '  *,*::before,*::after{transition:none!important;animation-duration:0s!important;animation-delay:0s!important;animation-iteration-count:1!important}}'
  ].join('\n');

  /* ------------------------------------------------------------------------
     RUNTIME
     ------------------------------------------------------------------------ */
  function Deck() {
    this.stage = findStage();
    if (!this.stage) { console.warn('[frontend-slides] no .deck-stage found'); return; }
    this.slides = findSlides(this.stage);
    this.total = this.slides.length;
    this.current = 0;
    this.step = 0;
    this.scale = 1;
    this.opt = function (name) { return (this.stage.getAttribute('data-fs-' + name) || 'on') !== 'off'; };
    this.storeKey = 'fs-edits:' + location.pathname;
    this.signature = hash(this.slides.map(function (s) { return s.innerHTML; }).join('\u0001'));

    this.injectStyles();
    this.restoreEdits();          // before fragment discovery, so restored markup is used
    this.collectFragments();
    this.buildChrome();
    this.setupTheme();
    this.setupAutoplay();
    this.buildRail();
    this.setupScale();
    this.setupKeys();
    this.setupPointer();
    this.setupPrint();
    this.setupMessaging();

    var start = this.readHash();
    this.goToSlide(start.index, start.step, 'init');
  }

  Deck.prototype.injectStyles = function () {
    var st = document.createElement('style');
    st.setAttribute('data-fs-chrome', '');
    st.textContent = CSS;
    document.head.appendChild(st);
    if (EMBED) document.documentElement.classList.add('fs-embed');
    if (AUTOMATED) document.documentElement.classList.add('fs-automated');
  };

  /* ---- Fragments (step-by-step builds) ---------------------------------- */
  Deck.prototype.collectFragments = function () {
    this.fragments = this.slides.map(function (slide) {
      var auto = 0, groups = {};
      slide.querySelectorAll('.fragment').forEach(function (f) {
        var idx = f.hasAttribute('data-fragment-index') ? parseInt(f.getAttribute('data-fragment-index'), 10) : auto++;
        (groups[idx] = groups[idx] || []).push(f);
      });
      return Object.keys(groups).map(Number).sort(function (a, b) { return a - b; }).map(function (k) { return groups[k]; });
    });
  };
  Deck.prototype.applyFragments = function () {
    var self = this;
    this.fragments.forEach(function (groups, si) {
      var shown = si < self.current ? groups.length : si > self.current ? 0 : self.step;
      groups.forEach(function (g, gi) {
        g.forEach(function (f) {
          f.classList.toggle('fs-shown', gi < shown);
          f.classList.toggle('fs-current', si === self.current && gi === shown - 1);
        });
      });
    });
  };
  Deck.prototype.showAllFragments = function () {
    this.step = this.fragments[this.current].length;
    this.applyFragments();
  };

  /* ---- Navigation -------------------------------------------------------- */
  Deck.prototype.goToSlide = function (index, step, reason) {
    if (!this.total) return;
    var prev = this.current;
    index = Math.max(0, Math.min(this.total - 1, index | 0));
    var maxStep = this.fragments[index].length;
    step = step == null ? 0 : step === 'end' ? maxStep : Math.max(0, Math.min(maxStep, step | 0));
    var changed = index !== prev || reason === 'init';
    this.current = index;
    this.step = step;
    this.slides.forEach(function (s, i) {
      s.classList.toggle('active', i === index);
      s.classList.toggle('visible', i === index);
      s.setAttribute('aria-hidden', i === index ? 'false' : 'true');
    });
    this.applyFragments();
    this.updateChrome();
    this.writeHash();
    this.broadcast();
    if (changed) {
      document.dispatchEvent(new CustomEvent('slidechange', {
        detail: { index: index, previousIndex: reason === 'init' ? -1 : prev, total: this.total, slide: this.slides[index], step: step, reason: reason || 'api' }
      }));
    }
  };
  Deck.prototype.next = function () {
    if (this.step < this.fragments[this.current].length) { this.step++; this.applyFragments(); this.updateChrome(); this.writeHash(); this.broadcast(); return; }
    if (this.current < this.total - 1) this.goToSlide(this.current + 1, 0, 'next');
  };
  Deck.prototype.prev = function () {
    if (this.step > 0) { this.step--; this.applyFragments(); this.updateChrome(); this.writeHash(); this.broadcast(); return; }
    if (this.current > 0) this.goToSlide(this.current - 1, 'end', 'prev');
  };

  /* Deep links: #5 or #5.2 (slide 5, step 2), 1-indexed slides */
  Deck.prototype.readHash = function () {
    var m = /^#\/?(\d+)(?:\.(\d+))?$/.exec(location.hash);
    return m ? { index: parseInt(m[1], 10) - 1, step: m[2] ? parseInt(m[2], 10) : 0 } : { index: 0, step: 0 };
  };
  Deck.prototype.writeHash = function () {
    if (EMBED) return;
    var h = '#' + (this.current + 1) + (this.step ? '.' + this.step : '');
    if (location.hash !== h) { try { history.replaceState(null, '', h); } catch (e) { /* sandboxed */ } }
  };

  /* ---- Stage scaling ----------------------------------------------------- */
  Deck.prototype.setupScale = function () {
    var self = this;
    function fit() {
      var off = self.railOpen() ? RAIL_W : 0;   // the open rail takes the left edge; the stage fits beside it
      var vw = window.innerWidth - off, vh = window.innerHeight;
      var f = Math.min(vw / W, vh / H);
      self.scale = f;
      self.stage.style.transform = 'translate(' + (off + (vw - W * f) / 2) + 'px,' + (vh - H * f) / 2 + 'px) scale(' + f + ')';
    }
    this.fit = fit;
    fit();
    window.addEventListener('resize', fit);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);
  };

  /* ---- Chrome: progress, counter, overlays ------------------------------ */
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    n.setAttribute('data-fs-chrome', '');
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    document.body.appendChild(n);
    return n;
  }
  Deck.prototype.buildChrome = function () {
    var self = this;
    if (this.opt('progress')) this.progress = el('div', 'fs-progress');
    if (this.opt('counter')) this.counter = el('div', 'fs-counter');
    this.toastEl = el('div', 'fs-toast');
    this.toastEl.setAttribute('role', 'status');
    this.blackout = el('div', 'fs-blackout');
    this.overview = el('div', 'fs-layer');
    this.overview.setAttribute('aria-label', 'Slide overview');
    this.help = el('div', 'fs-layer', helpHTML());
    this.help.addEventListener('click', function () { self.closeLayers(); });
    this.auditPanel = el('div', 'fs-audit-panel');
    this.live = el('div', '', '');
    this.live.setAttribute('aria-live', 'polite');
    this.live.style.cssText = 'position:fixed;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)';

    if (this.opt('edit') && !EMBED) {
      var hot = el('div', 'fs-edit-hot');
      var btn = el('button', 'fs-edit-btn', '✎');
      btn.title = 'Edit text (E)';
      btn.setAttribute('aria-label', 'Edit text');
      var t = null;
      var show = function () { clearTimeout(t); btn.classList.add('fs-on'); };
      var hide = function () { t = setTimeout(function () { btn.classList.remove('fs-on'); }, 400); };
      hot.addEventListener('mouseenter', show); hot.addEventListener('mouseleave', hide);
      btn.addEventListener('mouseenter', show); btn.addEventListener('mouseleave', hide);
      btn.addEventListener('click', function () { self.toggleEdit(true); });
      hot.addEventListener('click', function () { self.toggleEdit(true); });
      this.editBar = el('div', 'fs-edit-bar',
        '<span>Editing</span><button data-a="save">Save .html (⌘S)</button><button data-a="discard">Discard edits</button><button data-a="done">Done (Esc)</button>');
      this.editBar.addEventListener('click', function (e) {
        var a = e.target.getAttribute('data-a');
        if (a === 'save') self.saveFile();
        if (a === 'discard') self.discardEdits();
        if (a === 'done') self.toggleEdit(false);
      });
    }

    // Counter fades in on mouse movement, out when idle
    var idle = null;
    document.addEventListener('mousemove', function () {
      document.documentElement.classList.add('fs-idle-off');
      clearTimeout(idle);
      idle = setTimeout(function () { document.documentElement.classList.remove('fs-idle-off'); }, 1800);
    });
  };
  Deck.prototype.updateChrome = function () {
    var steps = this.fragments[this.current].length;
    var frac = this.total > 1 ? (this.current + (steps ? this.step / (steps + 1) : 0)) / (this.total - 1) : 1;
    if (this.progress) this.progress.style.width = (Math.min(1, frac) * 100) + '%';
    if (this.counter) this.counter.textContent = (this.current + 1) + ' / ' + this.total;
    if (this.live) this.live.textContent = 'Slide ' + (this.current + 1) + ' of ' + this.total;
    if (document.documentElement.classList.contains('fs-auditing')) this.renderAudit();
    if (this.presenter) this.presenter.update();
    if (this.railList) {
      var cur = this.current;
      Array.prototype.forEach.call(this.railList.children, function (c, i) {
        c.classList.toggle('fs-sel', i === cur);
        if (i === cur) c.setAttribute('aria-current', 'true'); else c.removeAttribute('aria-current');
      });
      var sel = this.railList.children[cur];
      if (sel && this.railOpen()) sel.scrollIntoView({ block: 'nearest' });
    }
    if (this.autoOn) this.armAuto();
  };
  Deck.prototype.toast = function (msg, ms) {
    var t = this.toastEl;
    t.textContent = msg; t.classList.add('fs-on');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(function () { t.classList.remove('fs-on'); }, ms || 2600);
  };
  Deck.prototype.layerOpen = function () {
    return this.overview.classList.contains('fs-on') || this.help.classList.contains('fs-on');
  };
  Deck.prototype.closeLayers = function () {
    this.overview.classList.remove('fs-on');
    this.overview.innerHTML = '';   // drop thumbnail clones (duplicate DOM, media)
    this.help.classList.remove('fs-on');
    this.blackout.classList.remove('fs-on');
  };

  /* ---- Overview grid (O) ------------------------------------------------- */
  Deck.prototype.toggleOverview = function () {
    var ov = this.overview, self = this;
    if (ov.classList.contains('fs-on')) { this.closeLayers(); return; }
    this.help.classList.remove('fs-on');
    ov.innerHTML = '';
    var grid = document.createElement('div');
    grid.className = 'fs-grid';
    ov.appendChild(grid);
    this.slides.forEach(function (slide, i) {
      var cell = self.makeThumb(slide, i);
      var cap = document.createElement('div');
      cap.className = 'fs-thumb-cap';
      cap.textContent = (i + 1) + '  ' + slideTitle(slide);
      cell.appendChild(cap);
      cell.addEventListener('click', function () { self.closeLayers(); self.goToSlide(i, 0, 'overview'); });
      grid.appendChild(cell);
    });
    ov.classList.add('fs-on');
    var fitThumbs = function () {
      grid.querySelectorAll('.fs-thumb-frame').forEach(function (f) {
        f.firstChild.style.transform = 'scale(' + f.clientWidth / W + ')';
      });
    };
    fitThumbs();
    this._ovSel = this.current;
    var sel = grid.children[this.current];
    if (sel) sel.scrollIntoView({ block: 'center' });
  };
  /* A static, scaled-down copy of one slide (used by the overview and the rail). */
  Deck.prototype.makeThumb = function (slide, i) {
    var cell = document.createElement('div');
    cell.className = 'fs-thumb' + (i === this.current ? ' fs-sel' : '');
    cell.tabIndex = 0;
    var frame = document.createElement('div');
    frame.className = 'fs-thumb-frame';
    var stage = document.createElement('div');
    stage.className = this.stage.className;   // keep `.deck-stage …` selectors working
    stage.style.background = 'var(--slide-bg,' + getComputedStyle(this.stage).backgroundColor + ')';
    var clone = cleanClone(slide);
    clone.classList.add('active', 'visible');
    clone.removeAttribute('aria-hidden');
    clone.querySelectorAll('.fragment').forEach(function (f) { f.classList.add('fs-shown'); });
    clone.querySelectorAll('[id]').forEach(function (n) { n.removeAttribute('id'); });
    clone.querySelectorAll('video,audio').forEach(function (m) { m.removeAttribute('autoplay'); m.preload = 'none'; });
    clone.querySelectorAll('iframe').forEach(function (f) { f.removeAttribute('src'); f.removeAttribute('srcdoc'); });
    stage.appendChild(clone);
    frame.appendChild(stage);
    cell.appendChild(frame);
    return cell;
  };
  function slideTitle(slide) {
    var h = slide.querySelector('h1,h2,h3');
    return slide.getAttribute('data-title') || (h ? h.textContent.trim().replace(/\s+/g, ' ') : '');
  }

  /* ---- Slides rail (L) ----------------------------------------------------
     A thumbnail strip on the left with autoplay and theme controls on top.
     Stage attribute data-fs-rail="off" removes it, "closed" starts it hidden. */
  Deck.prototype.railOpen = function () {
    return !!this.rail && document.documentElement.classList.contains('fs-rail-on');
  };
  Deck.prototype.buildRail = function () {
    if (EMBED || AUTOMATED || !this.opt('rail')) return;
    var self = this;
    var rail = this.rail = el('nav', 'fs-rail');
    rail.setAttribute('aria-label', 'Slides');
    var secs = [3, 5, 8, 10, 15, 30];
    if (secs.indexOf(this.autoSec) < 0) { secs.push(this.autoSec); secs.sort(function (a, b) { return a - b; }); }
    rail.innerHTML =
      '<div class="fs-rail-head">' +
        '<div class="fs-rail-row">' +
          '<button class="fs-rbtn" data-a="play" aria-pressed="false" title="Autoplay (A)">▶</button>' +
          '<select data-a="interval" title="Seconds per step" aria-label="Seconds per step">' +
            secs.map(function (s) { return '<option value="' + s + '">' + s + 's</option>'; }).join('') +
          '</select>' +
        '</div>' +
        '<div class="fs-rail-row">' +
          '<button class="fs-rbtn fs-rail-loop" data-a="loop" aria-pressed="false" title="Loop back to the start">Loop</button>' +
          '<button class="fs-rbtn" data-a="close" title="Hide slides panel (L)" aria-label="Hide slides panel">«</button>' +
        '</div>' +
        '<div class="fs-autobar"><i></i></div>' +
        (this.themable ?
          '<div class="fs-lbl">Theme</div>' +
          '<div class="fs-themes">' + Object.keys(THEMES).map(function (id) {
            return '<button class="fs-rbtn fs-theme-btn" data-theme="' + id + '" aria-pressed="false" title="' + THEMES[id].name + '" aria-label="' + THEMES[id].name + ' theme"><span class="fs-sw"></span></button>';
          }).join('') + '</div>' +
          '<div class="fs-custom">' +
            '<label><input type="color" data-c="bg">Background</label>' +
            '<label><input type="color" data-c="accent">Accent</label>' +
          '</div>' : '') +
      '</div>' +
      '<div class="fs-rail-list"></div>';
    this.railList = rail.querySelector('.fs-rail-list');
    this.railTab = el('button', 'fs-rail-tab', '»');
    this.railTab.title = 'Show slides panel (L)';
    this.railTab.setAttribute('aria-label', 'Show slides panel');
    this.railTab.addEventListener('click', function () { self.toggleRail(true); });

    var sel = rail.querySelector('select');
    sel.value = String(this.autoSec);
    sel.addEventListener('change', function () { self.autoSec = parseFloat(sel.value); self.savePlayPrefs(); if (self.autoOn) self.armAuto(); });
    rail.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var a = b.getAttribute('data-a'), th = b.getAttribute('data-theme');
      if (a === 'play') self.setAutoplay(!self.autoOn);
      if (a === 'loop') { self.autoLoop = !self.autoLoop; self.savePlayPrefs(); self.syncRail(); }
      if (a === 'close') self.toggleRail(false);
      if (th) self.setTheme(th);
      b.blur();   // keep Space / Enter for slide navigation
    });
    rail.querySelectorAll('input[type=color]').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var c = self.customColors || {};
        c[inp.getAttribute('data-c')] = inp.value;
        self.setTheme('custom', c, true);
      });
    });
    this.railList.addEventListener('click', function (e) {
      var t = e.target.closest('.fs-thumb');
      if (t) self.goToSlide(Array.prototype.indexOf.call(self.railList.children, t), 0, 'rail');
    });
    this.railList.addEventListener('keydown', function (e) {
      var t = e.target.closest('.fs-thumb');
      if (t && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault(); e.stopPropagation();
        self.goToSlide(Array.prototype.indexOf.call(self.railList.children, t), 0, 'rail');
      }
    });

    var pref = null;
    try { pref = localStorage.getItem('fs-rail'); } catch (e) { /* ignore */ }
    var open = pref ? pref === 'open' : this.stage.getAttribute('data-fs-rail') !== 'closed' && window.innerWidth >= 900;
    if (open) this.toggleRail(true, true);
    this.syncRail();
  };
  Deck.prototype.renderRail = function () {
    if (!this.railList) return;
    var self = this, list = this.railList;
    list.innerHTML = '';
    this.slides.forEach(function (slide, i) {
      var cell = self.makeThumb(slide, i);
      cell.setAttribute('role', 'button');
      cell.setAttribute('aria-label', 'Slide ' + (i + 1) + (slideTitle(slide) ? ': ' + slideTitle(slide) : ''));
      var num = document.createElement('div');
      num.className = 'fs-rail-num';
      num.textContent = i + 1;
      cell.insertBefore(num, cell.firstChild);
      list.appendChild(cell);
    });
    this._railDirty = false;
    var w = list.querySelector('.fs-thumb-frame');
    var f = w ? w.clientWidth / W : 0;
    list.querySelectorAll('.fs-thumb-frame').forEach(function (fr) { fr.firstChild.style.transform = 'scale(' + f + ')'; });
    this.updateChrome();
  };
  Deck.prototype.toggleRail = function (force, quiet) {
    if (!this.rail) return;
    var on = force == null ? !this.railOpen() : force;
    document.documentElement.classList.toggle('fs-rail-on', on);
    if (on && (this._railDirty !== false || !this.railList.children.length)) this.renderRail();
    if (!quiet) { try { localStorage.setItem('fs-rail', on ? 'open' : 'closed'); } catch (e) { /* ignore */ } }
    if (this.fit) this.fit();
  };
  Deck.prototype.syncRail = function () {
    if (!this.rail) return;
    var r = this.rail, self = this;
    var play = r.querySelector('[data-a=play]');
    play.setAttribute('aria-pressed', String(!!this.autoOn));
    play.textContent = this.autoOn ? '❚❚' : '▶';
    play.title = this.autoOn ? 'Pause autoplay (A)' : 'Autoplay (A)';
    r.querySelector('[data-a=loop]').setAttribute('aria-pressed', String(!!this.autoLoop));
    r.querySelector('select').value = String(this.autoSec);
    r.classList.toggle('fs-theme-custom', this.theme === 'custom');
    r.querySelectorAll('[data-theme]').forEach(function (b) {
      var id = b.getAttribute('data-theme');
      b.setAttribute('aria-pressed', String(id === self.theme));
      var p = id === 'standard' ? self.standardPal : id === 'custom' ? deriveTheme((self.customColors || {}).bg || CUSTOM_DEFAULT.bg, (self.customColors || {}).accent || CUSTOM_DEFAULT.accent) : THEMES[id];
      if (p) b.firstChild.innerHTML = '<i style="background:' + p.bg + '"></i><i style="background:' + p.accent + '"></i>';
    });
    var c = this.customColors || CUSTOM_DEFAULT;
    r.querySelectorAll('input[type=color]').forEach(function (inp) {
      var v = c[inp.getAttribute('data-c')] || CUSTOM_DEFAULT[inp.getAttribute('data-c')];
      if (document.activeElement !== inp) inp.value = v;
    });
  };

  /* ---- Autoplay (A) -------------------------------------------------------
     Advances one step every N seconds. Start it automatically with
     ?autoplay=8 in the URL or data-fs-autoplay="8" on the stage;
     data-fs-loop="off" stops at the last slide instead of looping. */
  Deck.prototype.setupAutoplay = function () {
    var prefs = null;
    try { prefs = JSON.parse(localStorage.getItem('fs-autoplay') || 'null'); } catch (e) { /* ignore */ }
    var q = params.get('autoplay'), a = this.stage.getAttribute('data-fs-autoplay');
    var secs = parseFloat(q) || parseFloat(a) || (prefs && prefs.sec) || 5;
    this.autoSec = Math.max(1, Math.min(600, secs));
    var loopAttr = this.stage.getAttribute('data-fs-loop');
    this.autoLoop = loopAttr ? loopAttr !== 'off' : prefs ? !!prefs.loop : true;
    this.autoOn = false;
    if ((q !== null || a) && !EMBED && !AUTOMATED) this.setAutoplay(true, true);
  };
  Deck.prototype.savePlayPrefs = function () {
    try { localStorage.setItem('fs-autoplay', JSON.stringify({ sec: this.autoSec, loop: this.autoLoop })); } catch (e) { /* ignore */ }
  };
  Deck.prototype.setAutoplay = function (on, quiet) {
    if (EMBED || AUTOMATED) return;
    this.autoOn = on;
    document.documentElement.classList.toggle('fs-autoplaying', on);
    clearTimeout(this.autoT);
    if (on) this.armAuto();
    this.syncRail();
    if (!quiet) this.toast(on ? 'Autoplay on: next step every ' + this.autoSec + 's (A to pause)' : 'Autoplay paused');
  };
  Deck.prototype.armAuto = function () {
    var self = this;
    clearTimeout(this.autoT);
    var bar = this.rail && this.rail.querySelector('.fs-autobar i');
    if (bar) {
      bar.style.transition = 'none'; bar.style.width = '0';
      void bar.offsetWidth;
      bar.style.transition = 'width ' + this.autoSec + 's linear'; bar.style.width = '100%';
    }
    this.autoT = setTimeout(function () { self.autoTick(); }, this.autoSec * 1000);
  };
  Deck.prototype.autoTick = function () {
    if (!this.autoOn) return;
    if (this.editing || this.layerOpen() || this.blackout.classList.contains('fs-on')) { this.armAuto(); return; }
    var atEnd = this.current === this.total - 1 && this.step >= this.fragments[this.current].length;
    if (!atEnd) { this.next(); return; }
    if (this.autoLoop) this.goToSlide(0, 0, 'autoplay');
    else this.setAutoplay(false);
  };

  /* ---- Themes (T) ---------------------------------------------------------
     Standard = the deck's own colours. Other themes override the deck's colour
     variables, which the stage maps to roles:
       data-fs-theme-vars="bg:--paper; surface:--paper-deep; text:--ink; muted:--ink-soft; accent:--accent"
     Without the attribute the html-template.md names are used. The choice is
     remembered per deck and written into the file on ⌘S as data-fs-theme on <html>. */
  Deck.prototype.setupTheme = function () {
    var self = this;
    this.themeVars = {};
    (this.stage.getAttribute('data-fs-theme-vars') || DEFAULT_THEME_VARS).split(';').forEach(function (pair) {
      var kv = pair.split(':');
      if (kv.length !== 2) return;
      var role = kv[0].trim(), name = kv[1].trim();
      if (THEME_ROLES.indexOf(role) >= 0 && /^--[\w-]+$/.test(name)) self.themeVars[role] = name;
    });
    var cs = getComputedStyle(document.documentElement);
    var read = function (role) { var n = self.themeVars[role]; return n ? toHex(cs.getPropertyValue(n).trim()) : null; };
    this.themable = this.opt('themes') && !!(read('bg') && read('text') && read('accent'));
    this.theme = 'standard';
    if (!this.themable) return;
    this.standardPal = { bg: read('bg'), text: read('text'), accent: read('accent') };
    this.themeStyle = document.createElement('style');
    this.themeStyle.setAttribute('data-fs-chrome', '');
    document.head.appendChild(this.themeStyle);
    this.themeKey = 'fs-theme:' + location.pathname;
    var root = document.documentElement, saved = null;
    try { saved = JSON.parse(localStorage.getItem(this.themeKey) || 'null'); } catch (e) { /* ignore */ }
    var init = saved || { id: root.getAttribute('data-fs-theme') || 'standard', bg: root.getAttribute('data-fs-theme-bg'), accent: root.getAttribute('data-fs-theme-accent') };
    this.setTheme(init.id, init, true, !saved);
  };
  Deck.prototype.setTheme = function (id, colors, quiet, noStore) {
    if (!this.themable) { if (!quiet) this.toast('This deck has no theme colour variables to switch'); return; }
    if (!THEMES[id]) id = 'standard';
    var pal = null, root = document.documentElement;
    if (id === 'custom') {
      var c = colors || this.customColors || {};
      this.customColors = { bg: toHex(c.bg) || CUSTOM_DEFAULT.bg, accent: toHex(c.accent) || CUSTOM_DEFAULT.accent };
      pal = deriveTheme(this.customColors.bg, this.customColors.accent);
    } else if (id !== 'standard') {
      pal = THEMES[id];
    }
    this.theme = id;
    var css = '';
    if (pal) {
      var v = this.themeVars, decl = [];
      THEME_ROLES.forEach(function (r) { if (v[r] && pal[r]) decl.push(v[r] + ':' + pal[r] + '!important'); });
      if (!v.surface) decl.push('--surface:' + pal.surface + '!important');
      decl.push('--slide-bg:' + pal.bg + '!important', '--stage-bg:' + mix(pal.bg, '#000000', 0.6) + '!important',
        '--accent-glow:' + rgba(pal.accent, 0.3) + '!important');
      css = 'html:root,html:root body,html:root .deck-stage{' + decl.join(';') + '}';
    }
    this.themeStyle.textContent = css;
    if (id === 'standard') root.removeAttribute('data-fs-theme'); else root.setAttribute('data-fs-theme', id);
    if (id === 'custom') { root.setAttribute('data-fs-theme-bg', this.customColors.bg); root.setAttribute('data-fs-theme-accent', this.customColors.accent); }
    else { root.removeAttribute('data-fs-theme-bg'); root.removeAttribute('data-fs-theme-accent'); }
    if (!noStore) {
      try { localStorage.setItem(this.themeKey, JSON.stringify({ id: id, bg: (this.customColors || {}).bg, accent: (this.customColors || {}).accent })); } catch (e) { /* ignore */ }
    }
    this.syncRail();
    if (!quiet) this.toast('Theme: ' + THEMES[id].name + (id === 'custom' && !this.railOpen() ? ' (pick colours in the slides panel, L)' : ''));
  };
  Deck.prototype.cycleTheme = function () {
    var ids = Object.keys(THEMES);
    this.setTheme(ids[(ids.indexOf(this.theme) + 1) % ids.length]);
  };

  var THEME_ROLES = ['bg', 'surface', 'text', 'muted', 'accent'];
  var DEFAULT_THEME_VARS = 'bg:--bg-primary; surface:--surface; text:--text-primary; muted:--text-secondary; accent:--accent';
  var CUSTOM_DEFAULT = { bg: '#0f1b2d', accent: '#f5b301' };
  var THEMES = {
    standard: { name: 'Standard' },
    'black-red': { name: 'Black & Red', bg: '#0b0b0c', surface: '#19191c', text: '#f5f5f4', muted: '#a8a29e', accent: '#e11d2a' },
    custom: { name: 'Custom' }
  };
  /* Build a full palette from two picked colours: text flips for contrast,
     muted/surface are blends, and an accent too close to the background is pushed toward the text colour. */
  function deriveTheme(bg, accent) {
    var dark = luminance(bg) < 0.36;
    var text = dark ? '#f7f6f3' : '#141414';
    var acc = contrast(accent, bg) < 2.4 ? mix(accent, text, 0.45) : accent;
    return { bg: bg, surface: mix(bg, text, dark ? 0.08 : 0.05), text: text, muted: mix(text, bg, 0.38), accent: acc };
  }
  function parseHex(h) {
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(h || '').trim());
    if (!m) return null;
    var s = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1];
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  }
  function toHex(c) {
    if (!c) return null;
    var rgb = parseHex(c);
    if (!rgb) {
      var m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(c);
      if (!m) {   // named colours, hsl(), etc.: let the browser resolve them
        var probe = document.createElement('span');
        probe.style.color = c;
        if (!probe.style.color) return null;
        document.body.appendChild(probe);
        m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(getComputedStyle(probe).color);
        probe.remove();
        if (!m) return null;
      }
      rgb = [+m[1], +m[2], +m[3]];
    }
    return '#' + rgb.map(function (n) { return ('0' + Math.round(n).toString(16)).slice(-2); }).join('');
  }
  function mix(a, b, t) {
    var x = parseHex(a), y = parseHex(b);
    return '#' + x.map(function (n, i) { return ('0' + Math.round(n + (y[i] - n) * t).toString(16)).slice(-2); }).join('');
  }
  function rgba(h, alpha) { var x = parseHex(h); return 'rgba(' + x.join(',') + ',' + alpha + ')'; }
  function luminance(h) {
    var x = parseHex(h).map(function (n) { n /= 255; return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4); });
    return 0.2126 * x[0] + 0.7152 * x[1] + 0.0722 * x[2];
  }
  function contrast(a, b) { var la = luminance(a), lb = luminance(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }

  Deck.prototype.moveOverviewSel = function (delta) {
    var grid = this.overview.firstChild; if (!grid) return;
    var cols = Math.max(1, Math.round(grid.clientWidth / (grid.children[0].offsetWidth + 22)));
    if (Math.abs(delta) === 2) delta = delta > 0 ? cols : -cols;
    this._ovSel = Math.max(0, Math.min(this.total - 1, this._ovSel + delta));
    Array.prototype.forEach.call(grid.children, function (c, i) { c.classList.toggle('fs-sel', i === this._ovSel); }, this);
    grid.children[this._ovSel].scrollIntoView({ block: 'nearest' });
  };

  /* ---- Keyboard ---------------------------------------------------------- */
  Deck.prototype.setupKeys = function () {
    if (EMBED) return;
    var self = this, digits = '', digitT = null;
    document.addEventListener('keydown', function (e) { self.onKey(e, function (d) {
      if (d === null) { var n = digits; digits = ''; return n; }
      digits += d; clearTimeout(digitT); digitT = setTimeout(function () { digits = ''; }, 1500); return null;
    }, function () { return digits; }); });
  };
  Deck.prototype.onKey = function (e, digitBuf, peekDigits) {
    var k = e.key, self = this;
    var mod = e.metaKey || e.ctrlKey;

    if (mod && (k === 's' || k === 'S') && this.opt('edit')) { e.preventDefault(); this.saveFile(); return; }
    if (mod || e.altKey) return;

    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) {
      if (k === 'Escape') { t.blur(); if (this.editing) this.toggleEdit(false); }
      return;
    }
    if (this.editing && k === 'Escape') { this.toggleEdit(false); return; }

    if (this.overview.classList.contains('fs-on')) {
      var m = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 2, ArrowUp: -2 }[k];
      if (m) { e.preventDefault(); this.moveOverviewSel(m); return; }
      if (k === 'Enter' || k === ' ') { e.preventDefault(); var sel = this._ovSel; this.closeLayers(); this.goToSlide(sel, 0, 'overview'); return; }
    }
    if (k === 'Escape') { this.closeLayers(); if (document.documentElement.classList.contains('fs-auditing')) this.toggleAudit(); return; }
    if (this.help.classList.contains('fs-on') && k !== '?') { this.closeLayers(); return; }

    if (/^[0-9]$/.test(k)) { digitBuf(k); return; }
    if (k === 'Enter' && peekDigits()) { e.preventDefault(); this.goToSlide(parseInt(digitBuf(null), 10) - 1, 0, 'jump'); return; }

    switch (k) {
      case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ': case 'Enter':
        if (this.layerOpen()) return;
        e.preventDefault(); this.blackout.classList.remove('fs-on'); this.next(); break;
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Backspace':
        if (this.layerOpen()) return;
        e.preventDefault(); this.blackout.classList.remove('fs-on'); this.prev(); break;
      case 'Home': e.preventDefault(); this.goToSlide(0, 0, 'keyboard'); break;
      case 'End': e.preventDefault(); this.goToSlide(this.total - 1, 'end', 'keyboard'); break;
      case 'o': case 'O': this.toggleOverview(); break;
      case 'p': case 'P': this.openPresenter(); break;
      case 'f': case 'F': this.toggleFullscreen(); break;
      case 'b': case 'B': case '.': this.blackout.classList.toggle('fs-on'); break;
      case 'e': case 'E': if (this.opt('edit')) this.toggleEdit(); break;
      case 'd': case 'D': this.toggleAudit(); break;
      case 'l': case 'L': this.toggleRail(); break;
      case 'a': case 'A': this.setAutoplay(!this.autoOn); break;
      case 't': case 'T': this.cycleTheme(); break;
      case '?': this.overview.classList.remove('fs-on'); this.help.classList.toggle('fs-on'); break;
    }
  };
  Deck.prototype.toggleFullscreen = function () {
    var d = document;
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    else { var r = d.documentElement; (r.requestFullscreen || r.webkitRequestFullscreen).call(r); }
  };

  /* ---- Wheel + touch ----------------------------------------------------- */
  Deck.prototype.setupPointer = function () {
    if (EMBED) return;
    var self = this;
    if (this.opt('wheel')) {
      var acc = 0, lockUntil = 0;
      window.addEventListener('wheel', function (e) {
        if (self.layerOpen() || self.editing) return;
        if (e.target.closest && e.target.closest('[data-fs-chrome]')) return;   // scrolling the rail
        if (scrollableAncestor(e.target)) return;
        e.preventDefault();
        var now = Date.now();
        if (now < lockUntil) return;
        acc += Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
        if (Math.abs(acc) > 60) {
          acc > 0 ? self.next() : self.prev();
          acc = 0; lockUntil = now + 650;
        }
      }, { passive: false });
    }
    var sx = 0, sy = 0, st = 0;
    window.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now();
    }, { passive: true });
    window.addEventListener('touchend', function (e) {
      if (self.layerOpen() || self.editing) return;
      if (e.target.closest && e.target.closest('[data-fs-chrome]')) return;
      var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2) { dx < 0 ? self.next() : self.prev(); return; }
      // Quick tap on the left / right edge third (ignoring interactive elements)
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && Date.now() - st < 300 &&
          !e.target.closest('a,button,input,textarea,select,video,[data-fs-chrome],[onclick]')) {
        var x = t.clientX / window.innerWidth;
        if (x > 0.66) self.next(); else if (x < 0.33) self.prev();
      }
    }, { passive: true });
  };
  function scrollableAncestor(n) {
    for (; n && n !== document.body && n.nodeType === 1; n = n.parentElement) {
      if (n.classList.contains('slide')) return false;
      var cs = getComputedStyle(n);
      if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight) return true;
    }
    return false;
  }

  /* ---- Print / Save as PDF ------------------------------------------------
     viewport-base.css lays every slide out on its own page, but animations
     keyed on `.slide.visible` would leave non-active slides blank. Mark every
     slide visible and every fragment shown while printing, then restore. */
  Deck.prototype.setupPrint = function () {
    var self = this, saved = null;
    window.addEventListener('beforeprint', function () {
      saved = { i: self.current, s: self.step };
      self.slides.forEach(function (s) { s.classList.add('visible'); });
      self.stage.querySelectorAll('.fragment').forEach(function (f) { f.classList.add('fs-shown'); });
    });
    window.addEventListener('afterprint', function () {
      if (saved) self.goToSlide(saved.i, saved.s, 'print');
    });
  };

  /* ---- Presenter view (P) -------------------------------------------------
     Opens a same-origin about:blank window we script directly. The current
     and next-slide previews are iframes of this deck in ?fs-embed mode,
     driven by postMessage (works from file:// too). */
  Deck.prototype.setupMessaging = function () {
    var self = this;
    window.addEventListener('message', function (e) {
      var d = e.data;
      if (!d || d.fs !== 'goto') return;
      self.goToSlide(d.index, d.step, 'remote');
    });
  };
  Deck.prototype.broadcast = function () { /* hook for presenter sync */ };
  Deck.prototype.openPresenter = function () {
    if (EMBED) return;
    if (this.presenter && !this.presenter.win.closed) { this.presenter.win.focus(); return; }
    var win = window.open('', 'fs-presenter-' + hash(location.pathname), 'width=1280,height=760');
    if (!win) { this.toast('Pop-up blocked — allow pop-ups to open presenter view'); return; }
    var self = this;
    var base = location.href.split('#')[0];
    var src = base + (base.indexOf('?') >= 0 ? '&' : '?') + 'fs-embed';
    var d = win.document;
    d.open();
    d.write('<!doctype html><html><head><meta charset="utf-8"><title>Presenter — ' + escapeHTML(document.title) + '</title><style>' + PRESENTER_CSS + '</style></head><body>' +
      '<div class="cur"><iframe id="cur"></iframe></div>' +
      '<div class="side"><div class="nextwrap"><div class="lbl">Next</div><div class="next"><iframe id="nxt"></iframe><div id="end" class="end">End of deck</div></div></div>' +
      '<div class="meta"><div id="pos"></div><div id="timer" title="Click to reset">00:00</div><div id="clock"></div></div>' +
      '<div class="lbl">Notes</div><div id="notes" class="notes"></div>' +
      '<div class="keys">←/→ navigate · B blackout · R reset timer · +/- note size</div></div>' +
      '</body></html>');
    d.close();
    var cur = d.getElementById('cur'), nxt = d.getElementById('nxt');
    cur.src = src; nxt.src = src;
    var started = Date.now(), fontSize = 22;
    var p = this.presenter = {
      win: win,
      update: function () {
        if (win.closed) { self.presenter = null; return; }
        var i = self.current, steps = self.fragments[i].length;
        post(cur, i, self.step);
        var hasNextStep = self.step < steps;
        var ni = hasNextStep ? i : i + 1, ns = hasNextStep ? self.step + 1 : 0;
        var atEnd = ni >= self.total;
        nxt.style.visibility = atEnd ? 'hidden' : 'visible';
        d.getElementById('end').style.display = atEnd ? 'flex' : 'none';
        if (!atEnd) post(nxt, ni, ns);
        d.getElementById('pos').textContent = 'Slide ' + (i + 1) + ' / ' + self.total + (steps ? '  ·  step ' + self.step + '/' + steps : '');
        var notes = self.slides[i].querySelector('aside.notes,.speaker-notes');
        d.getElementById('notes').innerHTML = notes ? notes.innerHTML : '<em style="opacity:.5">No notes for this slide.</em>';
      }
    };
    function post(frame, index, step) {
      try { frame.contentWindow.postMessage({ fs: 'goto', index: index, step: step }, '*'); } catch (e) { /* not ready */ }
    }
    cur.addEventListener('load', p.update);
    nxt.addEventListener('load', p.update);
    var tick = function () {
      if (win.closed) return;
      var s = Math.floor((Date.now() - started) / 1000);
      d.getElementById('timer').textContent = pad(Math.floor(s / 60)) + ':' + pad(s % 60);
      var now = new Date();
      d.getElementById('clock').textContent = pad(now.getHours()) + ':' + pad(now.getMinutes());
      win.setTimeout(tick, 500);
    };
    tick();
    d.getElementById('timer').addEventListener('click', function () { started = Date.now(); });
    d.addEventListener('keydown', function (e) {
      if (e.key === 'r' || e.key === 'R') { started = Date.now(); return; }
      if (e.key === '+' || e.key === '=') { fontSize += 2; d.getElementById('notes').style.fontSize = fontSize + 'px'; return; }
      if (e.key === '-') { fontSize = Math.max(12, fontSize - 2); d.getElementById('notes').style.fontSize = fontSize + 'px'; return; }
      if (/^[pPeEoOdDlL?]$/.test(e.key)) return; // audience-window-only shortcuts
      self.onKey(e, function () { return null; }, function () { return ''; });
    });
    p.update();
  };
  var PRESENTER_CSS = [
    '*{box-sizing:border-box}html,body{margin:0;height:100%;background:#0e0e11;color:#e8e8ea;font:15px/1.5 ui-sans-serif,system-ui,-apple-system,sans-serif}',
    'body{display:grid;grid-template-columns:1.55fr 1fr;gap:18px;padding:18px}',
    '.cur{position:relative;align-self:start;aspect-ratio:16/9;border-radius:10px;overflow:hidden;background:#000;outline:3px solid #3b82f6}',
    'iframe{position:absolute;inset:0;width:100%;height:100%;border:0;pointer-events:none}',
    '.side{display:flex;flex-direction:column;min-height:0;gap:10px}',
    '.next{position:relative;aspect-ratio:16/9;border-radius:8px;overflow:hidden;background:#000;opacity:.9}',
    '.end{position:absolute;inset:0;display:none;align-items:center;justify-content:center;color:#888}',
    '.lbl{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#8a8a92;margin-bottom:4px}',
    '.meta{display:flex;justify-content:space-between;align-items:baseline;padding:8px 0;border-top:1px solid #26262c;border-bottom:1px solid #26262c}',
    '#timer{font-size:34px;font-weight:600;font-variant-numeric:tabular-nums;cursor:pointer}#clock{color:#8a8a92;font-variant-numeric:tabular-nums}',
    '.notes{flex:1;overflow:auto;font-size:22px;line-height:1.45;padding-right:6px}.notes p{margin:0 0 .6em}',
    '.keys{font-size:12px;color:#6a6a72}'
  ].join('');

  /* ---- Inline editing (E) ----------------------------------------------- */
  Deck.prototype.toggleEdit = function (force) {
    var on = force == null ? !this.editing : force;
    if (on === !!this.editing) return;
    this.editing = on;
    var self = this;
    document.documentElement.classList.toggle('fs-editing', on);
    this.slides.forEach(function (slide) {
      slide.querySelectorAll(TEXT_SEL).forEach(function (n) {
        if (n.closest('aside.notes,.speaker-notes')) return;
        var parentMatch = n.parentElement && n.parentElement.closest(TEXT_SEL);
        if (parentMatch && slide.contains(parentMatch)) return; // edit outermost text block only
        if (on) { n.setAttribute('contenteditable', 'true'); n.setAttribute('spellcheck', 'true'); }
        else { n.removeAttribute('contenteditable'); n.removeAttribute('spellcheck'); }
      });
    });
    if (on) {
      if (!this._onInput) {
        this._onInput = function () { clearTimeout(self._saveT); self._saveT = setTimeout(function () { self.persistEdits(); }, 400); };
        this.stage.addEventListener('input', this._onInput);
      }
      this.toast('Edit mode — click any text. ⌘/Ctrl+S downloads the updated .html');
    } else {
      this.persistEdits();
      this._railDirty = true;
      if (this.railOpen()) this.renderRail();
    }
  };
  Deck.prototype.persistEdits = function () {
    try {
      localStorage.setItem(this.storeKey, JSON.stringify({
        sig: this.signature,
        slides: this.slides.map(function (s) { return cleanClone(s).innerHTML; })
      }));
    } catch (e) { /* storage unavailable */ }
  };
  Deck.prototype.restoreEdits = function () {
    var raw = null;
    try { raw = localStorage.getItem(this.storeKey); } catch (e) { return; }
    if (!raw) return;
    try {
      var data = JSON.parse(raw);
      if (data.sig !== this.signature || data.slides.length !== this.slides.length) return; // file changed since
      var changed = false;
      this.slides.forEach(function (s, i) { if (s.innerHTML !== data.slides[i]) { s.innerHTML = data.slides[i]; changed = true; } });
      if (changed) {
        var self = this;
        setTimeout(function () { self.toast('Restored unsaved text edits — press E then "Discard edits" to revert', 4500); }, 400);
      }
    } catch (e) { /* corrupt entry */ }
  };
  Deck.prototype.discardEdits = function () {
    try { localStorage.removeItem(this.storeKey); } catch (e) { /* ignore */ }
    location.reload();
  };
  Deck.prototype.saveFile = function () {
    var self = this;
    var root = document.documentElement.cloneNode(true);
    root.querySelectorAll('[data-fs-chrome]').forEach(function (n) { n.remove(); });
    Array.prototype.slice.call(root.classList).forEach(function (c) { if (c.indexOf('fs-') === 0) root.classList.remove(c); });
    if (!root.className) root.removeAttribute('class');
    var stage = root.querySelector('#deckStage') || root.querySelector('.deck-stage');
    if (stage) stage.style.removeProperty('transform');
    if (stage && !stage.getAttribute('style')) stage.removeAttribute('style');
    findSlidesIn(stage).forEach(function (s, i) {
      cleanNode(s);
      s.classList.remove('active', 'visible');
      s.removeAttribute('aria-hidden');
      if (i === 0) s.classList.add('active');
      if (!s.className) s.removeAttribute('class');
    });
    var html = '<!DOCTYPE html>\n' + root.outerHTML;
    var name = decodeURIComponent((location.pathname.split('/').pop() || 'presentation.html'));
    if (!/\.html?$/i.test(name)) name += '.html';
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    try { localStorage.removeItem(self.storeKey); } catch (e) { /* ignore */ }
    this.toast('Downloaded ' + name + ' — replace the original file with it', 4000);
  };
  function findSlidesIn(stage) {
    if (!stage) return [];
    return Array.prototype.filter.call(stage.querySelectorAll('.slide'), function (s) { return !s.parentElement.closest('.slide'); });
  }
  function cleanNode(root) {
    root.querySelectorAll('[data-fs-chrome]').forEach(function (n) { n.remove(); });
    [root].concat(Array.prototype.slice.call(root.querySelectorAll('*'))).forEach(function (n) {
      n.removeAttribute('contenteditable');
      n.removeAttribute('spellcheck');
      if (n.classList && n.classList.length) {
        Array.prototype.slice.call(n.classList).forEach(function (c) { if (c.indexOf('fs-') === 0) n.classList.remove(c); });
        if (!n.className) n.removeAttribute('class');
      }
    });
    return root;
  }
  function cleanClone(slide) { return cleanNode(slide.cloneNode(true)); }

  /* ---- Audit overlay (D) ------------------------------------------------- */
  Deck.prototype.toggleAudit = function () {
    var on = document.documentElement.classList.toggle('fs-auditing');
    if (on) this.renderAudit();
    else document.querySelectorAll('.fs-audit-mark').forEach(function (n) { n.classList.remove('fs-audit-mark', 'fs-warn'); });
  };
  Deck.prototype.renderAudit = function () {
    document.querySelectorAll('.fs-audit-mark').forEach(function (n) { n.classList.remove('fs-audit-mark', 'fs-warn'); });
    var all = audit();
    var here = all.filter(function (i) { return i.slide === this.current + 1; }, this);
    here.forEach(function (i) {
      if (i.el && !i.el.classList.contains('slide')) {
        i.el.classList.add('fs-audit-mark');
        if (i.severity === 'warn') i.el.classList.add('fs-warn');
      }
    });
    var others = {};
    all.forEach(function (i) { if (i.slide !== this.current + 1) others[i.slide] = (others[i.slide] || 0) + 1; }, this);
    var otherList = Object.keys(others).map(function (s) { return s + ' (' + others[s] + ')'; }).join(', ');
    this.auditPanel.innerHTML = '<h3>Layout audit — slide ' + (this.current + 1) + '</h3>' +
      (here.length ? '<ul>' + here.map(function (i) {
        return '<li class="' + (i.severity === 'warn' ? 'fs-warn' : '') + '"><b>' + i.type + '</b> ' + escapeHTML(i.message) + '<br><small>' + escapeHTML(i.selector) + '</small></li>';
      }).join('') + '</ul>' : '<p>✓ No issues on this slide.</p>') +
      '<p><small>' + (otherList ? 'Other slides with issues: ' + otherList : 'No issues on other slides.') + ' · D to close</small></p>';
  };

  /* ---- Helpers ----------------------------------------------------------- */
  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function escapeHTML(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function helpHTML() {
    var rows = [
      ['<kbd>→</kbd> <kbd>Space</kbd>', 'Next step / slide'], ['<kbd>←</kbd>', 'Previous'],
      ['<kbd>Home</kbd> <kbd>End</kbd>', 'First / last slide'], ['<kbd>1</kbd><kbd>2</kbd> <kbd>Enter</kbd>', 'Jump to slide 12'],
      ['<kbd>O</kbd>', 'Overview grid'], ['<kbd>P</kbd>', 'Presenter view: notes, timer, next slide'],
      ['<kbd>F</kbd>', 'Fullscreen'], ['<kbd>B</kbd>', 'Blackout screen'],
      ['<kbd>E</kbd>', 'Edit text in place'], ['<kbd>⌘</kbd>/<kbd>Ctrl</kbd> <kbd>S</kbd>', 'Download edited .html'],
      ['<kbd>⌘</kbd>/<kbd>Ctrl</kbd> <kbd>P</kbd>', 'Print / Save as PDF (one slide per page)'],
      ['<kbd>L</kbd>', 'Slides panel (thumbnails, autoplay, theme)'], ['<kbd>A</kbd>', 'Autoplay on / off'],
      ['<kbd>T</kbd>', 'Next colour theme'],
      ['<kbd>D</kbd>', 'Layout audit (overflow, overlap, tiny text)'], ['<kbd>Esc</kbd>', 'Close overlays']
    ];
    return '<div class="fs-help"><h2>Keyboard shortcuts</h2><table>' +
      rows.map(function (r) { return '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>'; }).join('') + '</table></div>';
  }

  /* ---- Boot -------------------------------------------------------------- */
  window.FrontendSlides = { audit: audit, version: '3.1.0' };
  function boot() {
    if (window.FS_NO_AUTOINIT) return;
    var deck = new Deck();
    if (!deck.stage) return;
    window.FrontendSlides.deck = deck;
    var api = {
      goToSlide: function (i, s) { deck.goToSlide(i, s, 'api'); },
      next: function () { deck.next(); },
      prev: function () { deck.prev(); },
      showAllFragments: function () { deck.showAllFragments(); },
      audit: audit,
      get current() { return deck.current; },
      get total() { return deck.total; },
      get step() { return deck.step; }
    };
    window.FrontendSlides.api = api;
    if (!window.presentation) window.presentation = api;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
