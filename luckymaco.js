/*!
 * Lucky Maco — a drop-in Macoji slot widget.
 * Adds a floating Maco button to any page; tap it to expand and play.
 *
 *   <script src="luckymaco.js" defer></script>
 *   <script src="luckymaco.js" data-triple="0.05" data-pair="0.20" defer></script>
 *
 * No dependencies. No network calls. No storage. Shadow-DOM isolated.
 * Odds are outcome-first, so they never drift as the Macoji set grows.
 */
(function () {
  'use strict';
  if (window.__luckyMaco) return;
  window.__luckyMaco = true;

  /* Which <script> tag am I? Gives us both our own URL and the data-* config. */
  var ME = (function () {
    var s = document.currentScript;
    if (!s) {
      var all = document.getElementsByTagName('script');
      for (var i = all.length - 1; i >= 0; i--) {
        if (/luckymaco\.js/.test(all[i].src)) { s = all[i]; break; }
      }
    }
    return s;
  })();

  /* ── settings ────────────────────────────────────────────────────────────
     Three ways to configure — later wins:
       1. window.LuckyMacoConfig = {...}   before the script
       2. data-* attributes on the <script> tag   (easiest for embedders)
       3. LuckyMaco.configure({...})       at runtime                        */
  var CFG = {
    triple:   0.05,             // odds of 3 identical  → JACKPOT
    twins:    0.10,             // odds of exactly 2 identical, any position
    nearMiss: 0.60,             // share of pairs landing XXO. Pays the same wherever
                                // the odd one lands — this only decides how often
                                // reel 3 crawls, i.e. how often you get suspense.
    changer:  false,            // Game Changer: forced outcomes and editable machine
                                // settings. Unlocked by triple-clicking the mark.
    haptics:  true,             // vibration on pull, wins and shake (Android; iOS Safari
                                // support is unreliable, so it self-detects)
    sound:    true,             // lever clunk, reel stops, win chimes (WebAudio, no files)
    spinSpeed: 1,              // multiplies every reel duration. 1.5 = half again as
                                // long, 0.7 = snappier. Range 0.4-2.5.
    stock:    20,               // how many Macoji sit in the hopper. It is a window
                                // onto a wider heap, so some are clipped by the frame.
    packing:  1.2,              // how tightly heaps stack. 1 = faces touching,
                                // 1.3 = airier. Fewer fit as it rises. 0.8-1.5.
    rows:     3,                // visible rows per reel: 1, 3 or 5. Only the centre row pays.
    theme:    'auto',           // 'auto' follows the host page / OS | 'light' | 'dark'
    mode:     'widget',         // 'widget' = floating button | 'page' = always open, no button
    position: 'bottom-right',   // or bottom-left
    shake:    true,             // shake-to-pull on mobile
    shakeForce: 18,             // how hard a shake must be. Measured as CHANGE in
                                // acceleration, so a still phone reads ~0. Range 8-60.
    uneasy:   0.015,            // chance per lit Maco, every 3s, that the machine
                                // turns uneasy. 0 switches moods off entirely.
    charged:  0.04,             // chance every 3s of the opposite — a long spin
    set:      null,             // restrict pool, e.g. "fire,joy,wink,grin"
    iconBase: null              // override where the PNGs live
  };
  var DEFAULTS = {};
  for (var _k in CFG) DEFAULTS[_k] = CFG[_k];

  var NUM = { triple: 1, twins: 1, nearMiss: 1 };
  var BOOL = { shake: 1, sound: 1, changer: 1, haptics: 1 };
  var RANGE = { shakeForce: [8, 60], spinSpeed: [0.4, 2.5], packing: [0.8, 1.5],
                stock: [6, 40], triple: [0.01, 0.5], twins: [0.01, 0.6],
                uneasy: [0, 0.08], charged: [0, 0.25] };
  var ENUM  = { rows: [1, 3, 5] };

  function warn(m) { try { console.warn('[Lucky Maco] ' + m); } catch (e) {} }

  function configure(o) {
    if (!o) return snapshot();
    if (o.pair != null && o.twins == null) o.twins = o.pair;      // pre-Twins alias
    if (o.test != null && o.changer == null) o.changer = o.test;  // pre-Game-Changer alias
    for (var k in CFG) {
      if (!Object.prototype.hasOwnProperty.call(o, k) || o[k] == null) continue;
      var v = o[k];
      if (NUM[k]) {
        var n = parseFloat(v);
        if (isNaN(n) || n < 0 || n > 1) { warn(k + ' must be 0-1, got "' + v + '" — ignored'); continue; }
        CFG[k] = n;
      } else if (ENUM[k]) {
        var e = parseInt(v, 10);
        if (ENUM[k].indexOf(e) < 0) { warn(k + ' must be one of ' + ENUM[k].join('/') + ', got "' + v + '" — ignored'); continue; }
        CFG[k] = e;
      } else if (RANGE[k]) {
        var f = parseFloat(v), lo = RANGE[k][0], hi = RANGE[k][1];
        if (isNaN(f) || f < lo || f > hi) { warn(k + ' must be ' + lo + '-' + hi + ', got "' + v + '" — ignored'); continue; }
        CFG[k] = f;
      } else if (BOOL[k]) {
        CFG[k] = !(v === false || v === 'false' || v === '0');
      } else {
        CFG[k] = v;
      }
    }
    if (CFG.triple + CFG.twins > 1) {         // keep the split coherent
      var t = CFG.triple + CFG.twins;
      CFG.triple /= t; CFG.twins /= t;
      warn('triple + twins exceeded 1 \u2014 normalised to ' +
           CFG.triple.toFixed(3) + ' / ' + CFG.twins.toFixed(3));
    }
    return snapshot();
  }
  function snapshot() {
    var o = {};
    for (var k in CFG) o[k] = CFG[k];
    o.allDifferent = +(1 - CFG.triple - CFG.twins).toFixed(4);
    return o;
  }

  configure(window.LuckyMacoConfig);
  if (ME) {
    var attrs = {};
    for (var key in CFG) {
      var dash = 'data-' + key.replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); });
      if (ME.hasAttribute(dash)) attrs[key] = ME.getAttribute(dash);
    }
    configure(attrs);
  }

  var THEME_PINNED = !!((ME && ME.hasAttribute('data-theme')) ||
                       (window.LuckyMacoConfig && window.LuckyMacoConfig.theme));

  var BASE = ME ? ME.src.replace(/[^/]*$/, '') : './';
  var IBASE = CFG.iconBase || (BASE + 'macoji/');
  if (IBASE.slice(-1) !== '/') IBASE += '/';
  var ICON = function (name) { return IBASE + 'macoji-' + name + '.png'; };
  var LOGO = BASE + 'brand/masterconcept-mark.png';
  var FACE = BASE + 'brand/maco-face.png';
  var BODY = BASE + 'brand/maco-body.png';

  /* ── the cast ─────────────────────────────────────────────────────────── */
  var MACOJI = [
    'blush', 'cry', 'dizzy', 'eyes', 'fire', 'grimace', 'grin', 'heart-eyes',
    'hearts', 'innocent', 'joy', 'neutral', 'open-mouth', 'pleading', 'rage',
    'relieved', 'scream', 'sleeping', 'smirk', 'sob', 'sparkles', 'star-struck',
    'sunglasses', 'sweat-smile', 'thinking', 'tongue', 'wink', 'yum'
  ];
  var POOL = MACOJI.slice();
  if (CFG.set) {
    var want = String(CFG.set).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var ok = want.filter(function (n) { return MACOJI.indexOf(n) >= 0; });
    if (ok.length < 3) warn('"set" needs at least 3 known Macoji \u2014 using the full set');
    else POOL = ok;
  }


  /* ── outcome-first engine ────────────────────────────────────────────────
     Pick the PATTERN first, then fill it with faces. Because the pattern odds
     are fixed, the win rate is identical with 28 Macoji or 280. Adding art
     never changes the game.                                                 */
  function pickDistinct(n) {
    var pool = POOL.slice(), out = [];
    for (var i = 0; i < n && pool.length; i++) {
      out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    return out;
  }
  function oddOneSlot() {
    var q = Math.random();
    if (q < CFG.nearMiss) return 2;                                   // XXO — the tease
    return q < CFG.nearMiss + (1 - CFG.nearMiss) / 2 ? 1 : 0;         // XOX : OXX
  }
  /* force: 'TRIPLE' | 'PAIR' | 'ALLDIFF' — test mode and the public API use it to
     pick an outcome directly. Left undefined, the odds decide. */
  /* Luck multiplies the odds you set, and nothing else. Five levels, x1 to x5:
     at level 0 the machine runs exactly what the sheet says, at level 4 both
     Jackpot and Twins are five times as likely and the ratio between them is
     untouched. Neither can ever fall as luck rises, which is the whole point —
     an earlier version slid the jackpot share up and Twins went DOWN at high
     luck, which is not what luck means.

     The multiplier is capped so the two can never sum past 100%: with a base of
     5 + 10 the cap is x6.67, so x5 fits; set the base high enough and the top
     of the bar simply stops short of x5, which is the honest outcome rather
     than a broken one. */
  var LUCK_STEPS = 5;                       // 0, 1, 2, 3, 4  ->  x1 .. x5
  var luckLevel = 0;                        // 0 .. LUCK_STEPS - 1
  function luckMult() {
    var base = CFG.triple + CFG.twins;
    var want = 1 + luckLevel;               // level 0 is x1
    var cap = base > 0 ? 1 / base : want;
    return Math.min(want, cap);
  }
  function odds() {
    var k = luckMult();
    return { triple: CFG.triple * k, twins: CFG.twins * k };
  }

  function draw(force) {
    var pattern = force;
    if (!pattern) {
      var o = odds(), r = Math.random();
      pattern = r < o.triple ? 'TRIPLE'
              : r < o.triple + o.twins ? 'PAIR' : 'ALLDIFF';
    }
    if (pattern === 'TRIPLE') {
      var a = pickDistinct(1)[0];
      return { pattern: 'TRIPLE', reels: [a, a, a], tease: false };
    }
    if (pattern === 'PAIR') {
      var d = pickDistinct(2);
      /* Two identical pays the same wherever the odd one lands, so position is
         staging only: 60% put it on reel 3, where reels 1+2 already match and
         reel 3 crawls while the jackpot is still live. */
      var at = oddOneSlot();
      var reels = [d[0], d[0], d[0]];
      reels[at] = d[1];
      return { pattern: 'PAIR', reels: reels, tease: at === 2 };
    }
    return { pattern: 'ALLDIFF', reels: pickDistinct(3), tease: false };
  }

  /* Today's weekday. Pinned to en-US so it always reads "Monday", never 星期一 —
     the rest of the copy is English, a mixed sentence would look broken.
     Read per spin rather than cached, so a session left open overnight rolls over. */
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function today() { return DAYS[new Date().getDay()]; }

  /* ── shell ────────────────────────────────────────────────────────────── */
  var host = document.createElement('div');
  host.id = 'lucky-maco-root';
  var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
  var LEFT = CFG.position === 'bottom-left';
  var PAGE = CFG.mode === 'page';
  /* A touch device. Motion events alone are not enough — desktop Chrome fires
     devicemotion on Macs, which have a real motion sensor, so a laptop would be
     told to shake itself. */
  var COARSE = !!(window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
  var ROWS = CFG.rows, CENTRE = (ROWS - 1) / 2;
  /* How many cells sit above the resting row. Declared here rather than beside
     the reel code because the stylesheet is built before that and needs it. */
  var TRAIL = 26, STRIP = TRAIL + ROWS + 1, AT = TRAIL + CENTRE;
  /* Only the centre row pays. The rows above and below are decoration, faded
     out at the edges so the reel reads as a continuous strip behind a window. */
  var MASK = ROWS === 1 ? 'none' :
    'linear-gradient(to bottom,rgba(0,0,0,0) 0%,rgba(0,0,0,.45) ' + (18 / 3 * (3 / ROWS) * 3).toFixed(0) + '%,'
    + '#000 ' + (100 * CENTRE / ROWS).toFixed(1) + '%,#000 ' + (100 * (CENTRE + 1) / ROWS).toFixed(1) + '%,'
    + 'rgba(0,0,0,.45) ' + (100 - 18 / 3 * (3 / ROWS) * 3).toFixed(0) + '%,rgba(0,0,0,0) 100%)';

  var CSS = [
    /* Palette. Light on bare :host, dark swapped in by attribute — the attribute
       is set from JS so it works in a shadow root on every browser. Tokens follow
       Master Prize's brand vars (--primary #1B2A5B, --accent #E9982B). */
    /* Light mode was near-white on near-white: cabinet, hopper and reel window
       all sat within a few percent of each other, so nothing read as a separate
       part. The cabinet stays bright, but the recessed pieces are now a cooler
       slate and the borders carry more weight — contrast from depth rather than
       from turning up the colour. */
    ':host{',
    '--cab:linear-gradient(180deg,#FFFFFF,#EFF3FA);--cab-br:rgba(27,42,91,.20);',
    '--cab-sh:0 24px 60px rgba(27,42,91,.26);',
    '--txt:#232A33;--mut:#5A6472;--faint:#8E97A5;',
    '--win:linear-gradient(180deg,#DCE3F0,#CDD6E8);--win-br:rgba(214,132,20,.62);',
    '--win-sh:inset 0 5px 16px rgba(27,42,91,.20);--reel:rgba(27,42,91,.07);',
    '--gold:#A9660B;--gold-lit:#E08A17;--gold-soft:rgba(224,138,23,.42);',
    '--mq:linear-gradient(180deg,rgba(224,138,23,.26),rgba(224,138,23,.07));',
    '--mq-sh:inset 0 1px 0 rgba(255,255,255,.85);',
    '--glow1:rgba(224,138,23,.18);--glow2:rgba(224,138,23,.38);',
    '--mount:linear-gradient(180deg,#D5DCE9,#B3BCCD);--rail:rgba(27,42,91,.18);',
    '--scrim:rgba(27,42,91,.42);--close-bg:rgba(27,42,91,.10);--close-fg:#232A33}',

    ':host([data-theme="dark"]){',
    '--cab:linear-gradient(180deg,#22305F,#121A38);--cab-br:rgba(255,255,255,.10);',
    '--cab-sh:0 30px 70px rgba(0,0,0,.6);',
    '--txt:#fff;--mut:rgba(255,255,255,.62);--faint:rgba(255,255,255,.34);',
    '--win:radial-gradient(120% 140% at 50% 0%,#2E3E77,#0D1430);--win-br:rgba(255,201,107,.35);',
    '--win-sh:inset 0 6px 18px rgba(0,0,0,.65);--reel:rgba(255,255,255,.05);',
    '--gold:#FFD772;--gold-lit:#FFC96B;--gold-soft:rgba(255,201,107,.32);',
    '--mq:linear-gradient(180deg,rgba(255,201,107,.15),rgba(255,158,27,.04));',
    '--mq-sh:inset 0 1px 0 rgba(255,255,255,.15);',
    '--glow1:rgba(255,158,27,.10);--glow2:rgba(255,158,27,.28);',
    '--mount:linear-gradient(180deg,#3A4A80,#19233F);--rail:rgba(0,0,0,.35);',
    '--scrim:rgba(8,12,26,.72);--close-bg:rgba(255,255,255,.10);--close-fg:#fff}',

    /* Only the reel window used to scale with height. Everything else — marquee,
       hopper, message, share button — was fixed, so on a short screen the machine
       outgrew the space and safe-centring pinned it to the top, which reads as
       "not centred". These all shrink together now. */
    /* --cell is whatever fits BOTH ways: capped by --maxcell for height, and by
       the cabinet's own width so it can never overflow sideways. The old fixed
       66px width rule shrank the reels on phones that had room for full size,
       and the height rules started at 820px, which is shorter than most desktop
       windows — so the reels were being shrunk almost everywhere.
       --gap is the single spacing between stacked parts, so marquee-to-hopper and
       hopper-to-reels cannot drift apart. */
    /* --cabw is the cabinet's width; everything else is measured against it. It
       was pinned at 360px, so on a 1440px desktop the machine was 25% of the
       window while filling 88% of a phone — the reels looked small on desktop
       even though they were the same pixels. */
    /* The cabinet is as wide as its reels need and no wider. It used to be a
       flat 360px, so on a short desktop window — where the cells shrink for
       height — the reel window stayed 318px around 218px of reels and stranded
       them in a 100px band of nothing. Deriving the width from --maxcell (a
       constant per breakpoint, so no circular reference with --cell) keeps the
       machine in proportion at every size. The floor is what the marquee and
       the ten belly lamps need. */
    /* --maxcell was a staircase of nine breakpoints, and every step was more
       conservative than it needed to be: at 1280x713 it used 52px where 66px
       fitted. Measured the real ceiling at nine viewport heights and fitted a
       line through them — the cell now grows continuously with the window
       instead of jumping, and is bigger than the old staircase everywhere.
         inner height   fits     this formula gives
              913        92px          88px
              813        80px          75px
              713        66px          60px
              593        50px          41px */
    /* Whole pixels, always. A cell of 44.2px renders the sprite soft, and the
       strip is parked at 26 x cell — so the fraction is multiplied by 26 and the
       three visible cells end up straddling the reel's edges. round() where it
       exists; the plain value first so older engines still get a size. */
    ':host{--maxcell:clamp(18px, calc((100vh - 320px) / 6.6), 88px);',
    '--maxcell:round(down, clamp(18px, calc((100vh - 320px) / 6.6), 88px), 1px);',
    '--cabw:min(88vw, max(292px, calc(var(--maxcell) * 3 + 64px)));',
    /* 40 cabinet padding + 16 window padding + 8 for the two gaps between cells,
       so the three cells actually fill the window instead of floating in it. */
    '--cell:min(var(--maxcell), calc((var(--cabw) - 64px) / 3));',
    '--cell:round(down, min(var(--maxcell), calc((var(--cabw) - 64px) / 3)), 1px);',
    '--hop:90px;--mqpad:14px;--msg:56px;--sharepad:8px;--gap:20px;--winpad:8px;',
    /* The hopper is a separate box, not part of the title glass or the reels,
       so it gets more air than the standard gap on both sides. At --gap it read
       as stuck to the marquee above it. */
    '--hopgap:calc(var(--gap) + 9px);',
'--belly:54px}',
    '@media (min-width:620px) and (min-height:840px){',
    ':host{--hop:98px;--mqpad:17px;--msg:58px;',
'--sharepad:9px;--gap:18px;--belly:60px}}',
    '@media (max-height:880px){:host{--hop:76px;--mqpad:12px;',
'--msg:48px;--sharepad:7px;--gap:14px;--belly:54px}}',
    '@media (max-height:810px){:host{--hop:66px;--mqpad:10px;',
'--msg:44px;--sharepad:6px;--gap:12px;--belly:48px}}',
    '@media (max-height:745px){:host{--hop:56px;--mqpad:9px;',
'--msg:38px;--sharepad:5px;--gap:10px;--belly:42px}}',
    '@media (max-height:685px){:host{--hop:47px;--mqpad:7px;',
'--msg:34px;--sharepad:4px;--gap:8px;--belly:36px}}',
    '@media (max-height:625px){:host{--hop:42px;--mqpad:6px;',
    '--msg:30px;--sharepad:4px;--gap:8px;--belly:31px}}',
    '@media (max-height:590px){:host{--belly:27px;--hop:35px;--mqpad:5px;',
    '--msg:26px;--sharepad:3px;--gap:6px}}',
    '@media (max-height:550px){:host{--hop:28px;--mqpad:4px;',
    '--msg:22px;--sharepad:3px;--gap:5px}}',
    /* A phone on its side has no room for a portrait cabinet. Drop the hopper and
       the time-of-day labels rather than clipping the reels, which are the part
       you actually need. */
    '@media (max-height:520px){.marquee img{width:24px;height:24px}',
    '.mq-name{font-size:16px}',
    ':host{--msg:19px;--gap:4px;--mqpad:4px;--sharepad:3px}}',
    '@media (max-height:460px){:host{--msg:16px}}',
    ':host,*{box-sizing:border-box}',

    '.fab{position:fixed;bottom:16px;' + (LEFT ? 'left:16px;' : 'right:16px;') +
      'width:74px;height:74px;border:0;padding:0;background:none;',
    'cursor:pointer;display:grid;place-items:center;z-index:2147483000;',
    '-webkit-tap-highlight-color:transparent;',
    'transition:transform .2s cubic-bezier(.34,1.56,.64,1)}',
    '.fab img{width:74px;height:74px;display:block;pointer-events:none;',
    'filter:drop-shadow(0 7px 15px rgba(0,0,0,.34));animation:bob 3.2s ease-in-out infinite}',
    '@keyframes bob{0%,100%{transform:translateY(0) rotate(0deg)}',
    '50%{transform:translateY(-6px) rotate(-3.5deg)}}',
    '.fab:hover{transform:scale(1.08)}.fab:active{transform:scale(.93)}',
    '.fab:focus-visible{outline:2px solid var(--gold-lit);outline-offset:4px;border-radius:16px}',

    '.scrim{position:fixed;inset:0;z-index:2147483001;background:var(--scrim);',
    '-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);',
    'display:grid;place-items:center;place-items:safe center;',
    'padding:16px;opacity:0;pointer-events:none;transition:opacity .22s}',
    '.scrim.on{opacity:1;pointer-events:auto}',

    '.cab{position:relative;width:100%;border-radius:28px;padding:20px 20px 24px;',
    'background:var(--cab);border:1px solid var(--cab-br);box-shadow:var(--cab-sh);',
    'font:500 15px/1.4 ui-rounded,-apple-system,"Segoe UI",system-ui,sans-serif;color:var(--txt);',
    'transform:translateY(18px) scale(.96);transition:transform .28s cubic-bezier(.34,1.3,.64,1)}',
    '.scrim.on .cab{transform:none}',

    '.close{position:absolute;top:12px;right:14px;width:30px;height:30px;border:0;border-radius:50%;',
    'background:var(--close-bg);color:var(--close-fg);font-size:17px;line-height:1;cursor:pointer}',
    '.close:hover{filter:brightness(.92)}',
    '.stack{display:flex;flex-direction:column;align-items:center;gap:8px;',
    'width:var(--cabw)}',
    /* One row, always. Fixed height so revealing the test buttons cannot shift
       the machine down or change its height by a pixel. */
    /* Three tracks: the test buttons sit in the middle one so they stay centred
       on the row no matter how wide the control cluster on the right is. */
    /* Three buttons and nothing else in the bar now that Game Changer lives on
       the machine, so they centre over it rather than hugging the right edge. */
    '.bar{display:flex;align-items:center;justify-content:center;',
    'gap:8px;width:100%;height:38px;flex:0 0 38px}',
    '.ctls{display:flex;gap:9px}',
    '.ctl{width:36px;height:36px;border:1px solid var(--cab-br);border-radius:50%;',
    'background:var(--cab);color:var(--txt);cursor:pointer;padding:0;',
    'display:grid;place-items:center;-webkit-tap-highlight-color:transparent;',
    'box-shadow:0 4px 14px rgba(0,0,0,.18);transition:transform .15s,filter .15s}',
    '.ctl:hover{filter:brightness(1.08);transform:translateY(-1px)}',
    '.ctl:active{transform:scale(.93)}',
    '.ctl:focus-visible{outline:2px solid var(--gold-lit);outline-offset:3px}',
    '.ctl svg{width:17px;height:17px;display:block;stroke:currentColor;fill:none;',
    'stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
    '.ctl[hidden]{display:none}',
    '.ctl.off{opacity:.5}',
    /* While Game Changer is on, the cog breathes — the one control it unlocks,
       marking itself so the state is visible without a toast standing there. */
    '@keyframes cogbreath{0%,100%{border-color:var(--cab-br);color:var(--txt);',
    'box-shadow:0 4px 14px rgba(0,0,0,.18)}',
    '50%{border-color:var(--gold-lit);color:var(--gold-lit);',
    'box-shadow:0 4px 14px rgba(0,0,0,.18),0 0 14px -1px var(--glow2)}}',
    '.ctl.cog.unlocked{animation:cogbreath 2.4s ease-in-out infinite}',
    /* Sits in the top bar beside the mode buttons — never over the machine. */
    '.marquee.armed{outline:1px dashed var(--gold-lit);outline-offset:3px}',
    '@keyframes tap{0%{transform:scale(1)}45%{transform:scale(.82)}100%{transform:scale(1)}}',
    '.marquee img.tapped{animation:tap .22s ease-out}',
    '.marquee img{cursor:pointer;-webkit-tap-highlight-color:transparent}',

    /* marquee — the lit topper above the reels */
    /* A lamp behind the title box. Real cabinets light the top glass from
       inside, so the marquee is the natural place for the machine to answer
       you: brighter and longer the bigger the moment. It sits under the
       wordmark (z-index 0, like .mglow) and is invisible until something
       lights it. */
    '.mqlamp{position:absolute;inset:0;border-radius:18px;pointer-events:none;',
    'z-index:0;opacity:0;background:',
    'radial-gradient(120% 165% at 50% 118%,var(--gold-lit),transparent 62%),',
    'linear-gradient(180deg,rgba(255,201,107,.30),rgba(233,152,43,.52))}',
    '@keyframes mqlamp1{0%{opacity:0}20%{opacity:.8}100%{opacity:0}}',
    '@keyframes mqlamp2{0%,100%{opacity:0}10%{opacity:.72}26%{opacity:.1}',
    '42%{opacity:.72}}',
    '@keyframes mqlampJ{0%,100%{opacity:.18}50%{opacity:1}}',
    '@keyframes mqlampG{0%{opacity:0}8%{opacity:1}20%{opacity:.62}30%{opacity:1}',
    '86%{opacity:.9}100%{opacity:0}}',
    /* ── the machine's mood ────────────────────────────────────────────
       The top glass says it from across the room. Uneasy is a red wash with the
       bulbs slowed and dimmed — the machine visibly unwell. Charged is the
       opposite: white-gold, bulbs racing. Both sit on the same lamp layer the
       celebrations use, so they can never be showing at once. */
    '.mqmood{position:absolute;inset:0;border-radius:18px;pointer-events:none;',
    'z-index:0;opacity:0;transition:opacity .6s}',
    '.marquee.uneasy .mqmood{opacity:1;',
    'background:radial-gradient(120% 165% at 50% 118%,#C4322B,transparent 64%),',
    'linear-gradient(180deg,rgba(196,50,43,.24),rgba(120,20,18,.42));',
    'animation:moodbreath 1.5s ease-in-out infinite}',
    '.marquee.charged .mqmood{opacity:1;',
    'background:radial-gradient(120% 165% at 50% 118%,#FFF3CE,transparent 66%),',
    'linear-gradient(180deg,rgba(255,241,205,.50),rgba(255,190,60,.60));',
    'animation:moodbreath .5s ease-in-out infinite}',
    '@keyframes moodbreath{0%,100%{filter:brightness(.85)}50%{filter:brightness(1.2)}}',
    '.marquee.uneasy .bulb{animation-duration:5s;opacity:.12}',
    '.marquee.uneasy .mglow::before{animation-duration:9s;filter:saturate(.2)}',
    '.marquee.uneasy .mq-name{animation:none;-webkit-text-fill-color:#D8A99B}',
    '.marquee.charged .bulb{animation:flash .18s steps(1) infinite}',
    '.marquee.charged .mglow::before{animation-duration:.6s}',
    /* the lever looks unusable while the machine is unhappy */
    '.lever.cold .knob{filter:grayscale(.75) brightness(.7)}',
    '.lever.cold .arm{filter:brightness(.8)}',
    /* the Macoji that is about to fall — shaking is bad, bouncing is good, and
       they are deliberately nothing like each other */
    '@keyframes jitter{0%,100%{transform:translate(0,0) rotate(0)}',
    '20%{transform:translate(-2.5px,1px) rotate(-6deg)}',
    '40%{transform:translate(2.5px,-1px) rotate(6deg)}',
    '60%{transform:translate(-2px,1.5px) rotate(-4deg)}',
    '80%{transform:translate(2px,-1.5px) rotate(4deg)}}',
    '.cell.jitter img{animation:jitter .16s linear infinite;',
    'filter:drop-shadow(0 0 7px rgba(228,87,79,.75))}',
    '.cell.jitter.soft img{animation-duration:.3s;transform:scale(.98)}',
    '@keyframes bouncey{0%,100%{transform:translateY(0) scale(1)}',
    '45%{transform:translateY(-16%) scale(1.06)}}',
    '.cell.bouncey img{animation:bouncey .5s ease-in-out infinite;',
    'filter:drop-shadow(0 0 10px var(--gold-lit))}',
    '@media (prefers-reduced-motion:reduce){.cell.jitter img,.cell.bouncey img,',
    '.marquee.uneasy .mqmood,.marquee.charged .mqmood{animation:none}}',
    '.marquee.lit1 .mqlamp{animation:mqlamp1 .9s ease-out}',       /* tapping the mark */
    '.marquee.lit2 .mqlamp{animation:mqlamp2 1.15s ease-in-out}',  /* twins */
    '.marquee.litJ .mqlamp{animation:mqlampJ .3s ease-in-out 7}',  /* jackpot */
    '.marquee.litG .mqlamp{animation:mqlampG 6s ease-in-out}',     /* LUCKY MACO! */
    /* the wordmark and the mark ride the same light */
    '@keyframes mqheat{0%,100%{filter:none}50%{filter:brightness(1.35) ',
    'drop-shadow(0 0 12px var(--gold-lit))}}',
    '.marquee.litJ .mq,.marquee.litJ img{animation:mqheat .3s ease-in-out 7}',
    '.marquee.litG .mq,.marquee.litG img{animation:mqheat 1.5s ease-in-out 4}',
    '.marquee{display:flex;align-items:center;justify-content:center;gap:13px;',
    'margin:2px 0 var(--hopgap);padding:var(--mqpad) 15px;border-radius:18px;',  /* 22px side padding clipped MASTER CONCEPT once the cabinet narrowed */
    'background:var(--mq);border:1px solid var(--gold-soft);',
    'box-shadow:var(--mq-sh);position:relative}',
    '.marquee::after{content:"";position:absolute;inset:-1px;border-radius:18px;',
    'pointer-events:none;box-shadow:0 0 32px var(--glow2);',
    'animation:marquee 3.6s ease-in-out infinite}',
    /* A light travelling around the INSIDE edge of the box. A conic gradient is
       spun behind a ring-shaped mask, so only the border strip shows it. Where
       mask-composite is unsupported the mask simply does not apply and it reads
       as a soft glow behind the box instead — still fine, just less defined. */
    '.mglow{position:absolute;inset:0;border-radius:18px;pointer-events:none;',
    'overflow:hidden;padding:3px;z-index:0;',
    '-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);',
    '-webkit-mask-composite:xor;',
    'mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);',
    'mask-composite:exclude}',
    '.mglow::before{content:"";position:absolute;inset:-70%;',
    'background:conic-gradient(from 0deg,transparent 0 56%,var(--gold-soft) 68%,',
    'var(--gold-lit) 78%,#fff4cd 82%,var(--gold-lit) 86%,transparent 94%);',
    'animation:orbit 4.5s linear infinite}',
    '@keyframes orbit{to{transform:rotate(1turn)}}',
    '.marquee.fast .mglow::before{animation-duration:1.5s}',
    '.marquee.allon .mglow::before{animation-duration:.7s}',
    /* and a soft radial breath inside the frame */
    '.marquee{box-shadow:var(--mq-sh),inset 0 0 18px -6px var(--glow2)}',
    '.mq,.marquee img{position:relative;z-index:1}',
    /* chasing bulbs — a ring of lights running around the marquee */
    '.bulb{position:absolute;width:5px;height:5px;border-radius:50%;pointer-events:none;',
    'background:var(--gold-lit);opacity:.22;animation:chase 2.4s linear infinite}',
    '@keyframes chase{0%,72%{opacity:.2;box-shadow:none}',
    '10%{opacity:1;box-shadow:0 0 7px 2px var(--gold-lit)}',
    '30%{opacity:.45;box-shadow:0 0 3px var(--gold-lit)}}',
    '.marquee.fast .bulb{animation-duration:.85s}',
    '.marquee.allon .bulb{animation:flash .28s steps(1) infinite}',
    '.marquee.allon .bulb:nth-child(even){animation-delay:.14s}',
    '@keyframes flash{0%,49%{opacity:1;box-shadow:0 0 8px 2px var(--gold-lit)}',
    '50%,100%{opacity:.15;box-shadow:none}}',
    /* a highlight sweeping across the wordmark */
    '.mq-name{background-image:linear-gradient(100deg,',
    'var(--gold) 40%,#fff8e2 48%,var(--gold) 56%);',
    '-webkit-background-clip:text;background-clip:text;background-size:280% 100%;',
    '-webkit-text-fill-color:transparent;animation:sheen 5s ease-in-out infinite}',
    '@keyframes sheen{0%,62%{background-position:120% 0}',
    '86%,100%{background-position:-40% 0}}',
    /* the reel window powers up while the reels run */
    '.window{transition:border-color .35s,box-shadow .35s}',
    '.window.live{border-color:var(--gold-lit);',
    'box-shadow:var(--win-sh),0 0 22px -2px var(--glow2)}',
    '.window.live .band{animation:bandlit .9s ease-in-out infinite}',
    '@keyframes marquee{0%,100%{opacity:.28}50%{opacity:1}}',
    '.marquee img{width:36px;height:36px;flex:none;display:block;',
    'filter:drop-shadow(0 2px 7px rgba(233,152,43,.55))}',
    '.mq{display:flex;flex-direction:column;line-height:1}',
    '.mq-name{font-size:23px;font-weight:800;letter-spacing:.005em;color:var(--gold)}',
    '.mq-sub{font-size:9.5px;letter-spacing:.22em;text-transform:uppercase;',
    'color:var(--mut);margin-top:4px}',

    /* hopper — the machine's visible supply of Macoji, sitting above the reels.
       The frame stays put on a jackpot; only its floor opens and the stock falls
       through. */
    /* isolate, or the flaps' z-index escapes: position:relative with z-index
       auto creates no stacking context, so they competed with the lever at
       cabinet level and painted over it. */
    '.hopper{position:relative;isolation:isolate;height:var(--hop);',
    'margin:0 0 var(--hopgap);',
    'border-radius:12px;',
    'background:var(--reel);border:1px solid var(--cab-br)}',
    '.hstock{position:absolute;inset:0;overflow:hidden;border-radius:12px;',
    'transition:opacity .3s}',
    '.hstock img{position:absolute;pointer-events:none}',
    '.hopper::after{content:"";position:absolute;inset:0;pointer-events:none;',
    'border-radius:12px;background:linear-gradient(180deg,var(--cab) -30%,transparent 55%);',
    'opacity:.55}',
    /* The floor: two plates that slide apart, revealing the slot they were
       covering. A hinge reads as nothing at 5px tall — it is edge-on almost
       immediately. A widening gap is unmistakable. */
    '.hgap{position:absolute;left:10px;right:10px;bottom:0;height:3px;',
    'border-radius:2px;background:var(--cab);box-shadow:inset 0 1px 3px rgba(0,0,0,.6);',
    'opacity:0;transition:opacity .2s}',
    '.hopper.open .hgap{opacity:1}',
    '.flap{position:absolute;bottom:0;width:calc(50% - 9px);height:3px;',
    'border-radius:2px;background:var(--gold-lit);z-index:2;',
    'transition:opacity .45s ease}',
    '.flap.l{left:9px}',
    '.flap.r{right:9px}',
    '.hopper.open .flap{opacity:0}',
    /* Jackpot dump fills the reel window — the machine's own container. Piling it
       over the whole cabinet buried the result text. */
    '.dump{position:absolute;inset:0;overflow:hidden;border-radius:16px;',
    'pointer-events:none;z-index:3}',
    '.drop{position:absolute;will-change:transform;',
    'filter:drop-shadow(0 4px 9px rgba(0,0,0,.4))}',
    /* The window is exactly as wide as the three reels. It used to stretch the
       full cabinet, so whenever the cells shrank for height the reels sat in a
       band of nothing — worst on a short desktop window, where 218px of reels
       floated in 318px of glass. */
    '.window{position:relative;display:flex;gap:4px;justify-content:center;',
    'width:max-content;max-width:100%;margin-left:auto;margin-right:auto;',
    'padding:var(--winpad);border-radius:18px;',
    'background:var(--win);border:2px solid var(--win-br);box-shadow:var(--win-sh)}',
    '.reel{width:var(--cell);height:calc(var(--cell) * ' + ROWS + ');overflow:hidden;',
    'border-radius:12px;background:var(--reel);',
    '-webkit-mask-image:' + MASK + ';mask-image:' + MASK + '}',
    /* The strip rests TRAIL cells up. Expressing that in CSS rather than as a
       pixel number measured once means it can never go stale — it re-derives
       itself whenever --cell changes, so a resize, a font load or a rounding
       change cannot leave the reels parked between rows showing blank strip.
       JS only overrides this while a spin is actually running. */
    '.strip{will-change:transform;transition:opacity .45s ease-in .25s;',
    'transform:translateY(calc(var(--cell) * -' + TRAIL + '))}',
    '.window.emptied .strip{opacity:0}',
    '.cell{width:var(--cell);height:var(--cell);display:grid;place-items:center}',
    '.cell img{width:calc(var(--cell) * .86);height:calc(var(--cell) * .86);display:block}',
    /* the pay row — the only one that counts */
    '.band{position:absolute;left:7px;right:7px;pointer-events:none;border-radius:10px;',
    'top:calc(var(--winpad) + var(--cell) * ' + CENTRE + ');height:var(--cell);',
    'background:linear-gradient(90deg,transparent,var(--gold-soft),transparent);',
    'border-top:1px solid var(--gold-lit);border-bottom:1px solid var(--gold-lit);opacity:.55}',
    '.pip{position:absolute;top:calc(var(--winpad) + var(--cell) * ' + (CENTRE + 0.5) + ' - 6px);',
    'width:0;height:0;border-top:6px solid transparent;border-bottom:6px solid transparent;pointer-events:none}',
    '.pip.l{left:2px;border-left:8px solid var(--gold-lit)}',
    '.pip.r{right:2px;border-right:8px solid var(--gold-lit)}',

    /* One label per reel, the same width as a reel, so they line up with the
       thing they name instead of bunching in the middle. */
    '.labels{display:flex;gap:4px;justify-content:center;width:max-content;',
    'max-width:100%;margin:8px auto 0}',
    '.labels span{width:var(--cell);text-align:center}',
    /* These name the three parts of the day, so they must be readable. They were
       on --faint, the tone reserved for near-invisible hints. Also pinned to 84px
       while the cells shrink to 66px on mobile, so they no longer lined up. */
    /* Size with the cell, not fixed. At 10.5px "AFTERNOON" measures ~77px, which
       overflows a 66px cell on mobile and a 50px one on a short screen — the
       labels ran into each other. Ratio chosen so the longest word always fits. */
    '.labels span{width:var(--cell);text-align:center;font-weight:700;',
    'font-size:calc(var(--cell) * 0.125);letter-spacing:.06em;',
    'text-transform:uppercase;color:var(--mut);overflow:hidden}',

    /* One cell holding both, so the row keeps its height whichever is showing and
       the machine never shifts when a result lands. */
    /* The line and the share button share one cell — only one is ever shown, and
       the cell holds the row's height either way. */
    /* Under the belly, so Share and the free line always read as a caption to
       the lamps rather than something that floats above them. */
    '.actions{display:grid;place-items:center;margin-top:11px;',
    'min-height:calc(var(--sharepad) * 2 + 16px)}',
    '.actions > *{grid-area:1/1}',
    /* pointer-events:none is not decoration. The line is wider than the button,
       and `opacity:0` gives it a stacking context, which paints above a plain
       in-flow button in the same cell — so the hidden line sat over Share and
       swallowed the tap. It is a caption; it never needs the pointer. */
    '.progress{font-size:12px;font-weight:600;letter-spacing:.02em;color:var(--mut);',
    'text-align:center;pointer-events:none;transition:opacity .25s,color .3s;',
    'white-space:nowrap}',
    '.progress.off{opacity:0}',
    '.progress.close{color:var(--gold)}',
    '.share{display:flex;align-items:center;justify-content:center;gap:7px;',
    'padding:var(--sharepad) 16px;border-radius:999px;cursor:pointer;',
    'border:1px solid var(--gold-soft);background:transparent;color:var(--gold);',
    'font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;',
    '-webkit-tap-highlight-color:transparent;',
    'transition:background .15s,transform .12s,opacity .22s}',
    '.share:hover{background:var(--gold-soft)}',
    /* worth something right now */
    '.share.pays{border-color:var(--gold-lit);color:var(--gold-lit);',
    'animation:paysglow 2s ease-in-out infinite}',
    '@keyframes paysglow{0%,100%{box-shadow:0 0 0 0 rgba(255,201,107,0)}',
    '50%{box-shadow:0 0 13px 1px var(--glow2)}}',
    '@media (prefers-reduced-motion:reduce){.share.pays{animation:none}}',
    '.share:active{transform:scale(.95)}',
    /* Always occupies its space. Using [hidden] took it out of the flow, so the
       cabinet grew the moment a result landed and the whole machine shifted. */
    '.share.off{visibility:hidden;opacity:0;pointer-events:none}',
    '.share svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;',
    'stroke-linecap:round;stroke-linejoin:round}',
    '.msg{min-height:var(--msg);display:grid;place-items:center;text-align:center;',
    'margin-top:10px;padding:0 4px}',
    '.msg b{display:block;font-size:19px;letter-spacing:.03em;white-space:nowrap}',
    '.msg b img{width:25px;height:25px;vertical-align:-6px;margin-right:11px}',
    '.msg b img + img{margin-left:-13px}',      /* the pair huddles together */
    '.msg.jackpot b img{width:32px;height:32px;vertical-align:-8px;margin-right:14px;',
    'animation:cheer .5s cubic-bezier(.34,1.7,.64,1) 3}',
    '.msg.jackpot b img + img{margin-left:-15px}',
    '.msg.jackpot b img:nth-child(2){animation-delay:.1s}',   /* a wave, not a jolt */
    '.msg.jackpot b img:nth-child(3){animation-delay:.2s}',
    '@keyframes cheer{0%,100%{transform:rotate(0) scale(1)}',
    '35%{transform:rotate(-13deg) scale(1.14)}70%{transform:rotate(9deg) scale(1.08)}}',
    '.msg small{display:block;font-size:13px;color:var(--mut);margin-top:3px}',
    '.msg.win b{color:var(--gold);animation:pop .5s cubic-bezier(.34,1.7,.64,1)}',
    '.msg.jackpot b{font-size:25px;color:var(--gold);animation:pop .55s cubic-bezier(.34,1.9,.64,1)}',
    '@keyframes pop{0%{transform:scale(.5);opacity:0}100%{transform:none;opacity:1}}',

    /* settings sheet — slides over the cabinet interior */
    '.sheet{position:absolute;inset:0;border-radius:28px;background:var(--cab);z-index:4;',
    'overflow:hidden;display:none}',
    '.sheet.on{display:block}',
    /* the body scrolls, the sheet does not — so the close button stays put */
    '.sbody{position:absolute;inset:0;overflow-y:auto;padding:14px 16px 16px;',
    'scrollbar-width:thin;scrollbar-color:var(--cab-br) transparent;',
    'overscroll-behavior:contain}',
    /* A default scrollbar sits hard against the rounded corner and collides with
       the close button. Slim it, inset it, and keep the track invisible. */
    '.sbody::-webkit-scrollbar{width:5px}',
    '.sbody::-webkit-scrollbar-track{background:transparent;margin:8px 0}',
    '.sbody::-webkit-scrollbar-thumb{background:var(--cab-br);border-radius:3px}',
    '.sbody::-webkit-scrollbar-thumb:hover{background:var(--gold-soft)}',
    '.sheet h3{margin:0 0 12px;font:800 11px/1 inherit;letter-spacing:.16em;',
    'text-transform:uppercase;color:var(--gold)}',
    '.sheet table{width:100%;border-collapse:collapse;margin-bottom:14px}',
    '.sheet td{padding:5px 0;font-size:12.5px;border-bottom:1px solid var(--cab-br);',
    'color:var(--mut)}',
    '.sheet td:last-child{text-align:right;color:var(--txt);font-weight:700}',
    '.sheet pre{margin:0 0 10px;padding:11px 12px;border-radius:10px;overflow-x:auto;',
    'background:var(--reel);border:1px solid var(--cab-br);',
    'font:500 10.5px/1.6 ui-monospace,Menlo,monospace;color:var(--txt);white-space:pre}',
    '.sheet .shut{position:absolute;top:9px;right:14px;width:22px;height:22px;',
    'border:0;border-radius:50%;background:var(--close-bg);color:var(--close-fg);',
    'font-size:12px;line-height:1;cursor:pointer;padding:0;z-index:5;',
    'display:grid;place-items:center;-webkit-tap-highlight-color:transparent}',
    '.sheet .shut:hover{filter:brightness(.88)}',
    '.sheet .snip{position:relative;cursor:pointer;padding-right:38px;',
    'transition:border-color .15s}',
    '.sheet .snip:hover{border-color:var(--gold-lit)}',
    '.sheet .cpy{position:absolute;top:9px;right:10px;width:16px;height:16px;opacity:.55}',
    '.sheet .snip:hover .cpy{opacity:1}',
    '.sheet .cpy svg{width:16px;height:16px;stroke:var(--gold);fill:none;stroke-width:2;',
    'stroke-linejoin:round}',
    '.sheet .done-badge{position:absolute;top:7px;right:8px;padding:3px 8px;border-radius:7px;',
    'background:var(--gold-lit);color:#fff;font:700 10px/1.4 inherit;letter-spacing:.06em;',
    'text-transform:uppercase;opacity:0;transform:translateY(-3px);',
    'transition:opacity .18s,transform .18s;pointer-events:none}',
    '.sheet .done-badge.on{opacity:1;transform:none}',
    '.sheet .row{display:flex;gap:8px}',
    '.sheet button{flex:1;padding:9px;border:1px solid var(--cab-br);border-radius:10px;',
    'background:var(--reel);color:var(--txt);font:700 11px/1 inherit;cursor:pointer;',
    'letter-spacing:.06em;text-transform:uppercase}',
    '.sheet button.primary{background:var(--gold-lit);color:#fff;border-color:transparent}',
    '.sheet .stepcell{white-space:nowrap;display:inline-flex;align-items:center}',
    /* what the machine is doing right now, beside what it was set to */
    '.sheet .now{display:inline-block;min-width:38px;margin-left:10px;text-align:right;',
    'color:var(--gold-lit)}',
    '.sheet .hnote{margin-left:9px;color:var(--gold-lit);font-weight:800;',
    'letter-spacing:.1em;text-transform:none}',
    '.sheet .note{margin:-8px 0 14px;font-size:11.5px;line-height:1.45;color:var(--mut)}',
    '.sheet button.step{flex:none;width:30px;padding:5px 0;margin:0 7px;border-radius:8px;',
    'font-size:15px;line-height:1;vertical-align:middle}',
    '.sheet .force{display:inline-block;min-width:24px;text-align:center;vertical-align:middle}',
    '.sheet button:hover{filter:brightness(1.08)}',

    /* lever — right-hand side, pull down, springs back */
    /* Luck Boost lives on a deck plate along the bottom of the cabinet — the one
       strip of the machine that holds nothing else. It is always there, in both
       modes: a player sees a real switch that is locked, which is what a cabinet
       looks like, rather than a control that appears out of nowhere.

       Almost wordless on purpose. The plate is named once, and the three
       positions are marked the way the win messages already mark themselves —
       one dash, two faces, three faces. Nobody has to be told that three faces
       is the jackpot; the machine has been saying it all along. */
    '.luck{display:flex;align-items:center;gap:9px;margin-top:12px;',
    'padding:5px 7px;border-radius:11px;background:var(--mount);',
    'border:1px solid var(--cab-br);transition:opacity .3s}',
    /* Not disabled — the bar fills as a player earns luck, and only DRAGGING it
       belongs to Game Changer. Dimming it and padlocking it said the opposite. */
    '.luck.locked{pointer-events:none}',
    /* The plate's two pieces of colour. Grey read as switched off next to a
       bar that lights up orange, so the name and the marker keep Maco's own
       colour and the bar alone carries the level. */
    '.dname{display:flex;align-items:center;gap:4px;flex:none;',
    'font-size:8.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;',
    'color:var(--gold);transition:color .25s}',
    '.luck.twins .dname{color:var(--gold)}',
    '.luck.jack .dname{color:#FF8A8A}',
    '.track{position:relative;flex:1;height:14px;border-radius:8px;cursor:pointer;',
    'background:var(--reel);box-shadow:inset 0 2px 5px rgba(0,0,0,.4);',
    'overflow:hidden;touch-action:none;-webkit-tap-highlight-color:transparent}',
    '.track:focus-visible{outline:2px solid var(--gold-lit);outline-offset:2px}',
    /* Gold while it is a nudge, red as it approaches certainty — the same two
       colours Twins and Jackpot already use, so the bar says which end it is
       heading for without naming either. */
    '.fill{position:absolute;left:0;top:0;bottom:0;width:0;border-radius:8px;',
    'background:linear-gradient(90deg,#E9982B,#FFD98A 55%,#FF8A8A 88%,#C31432);',
    'background-size:calc(100% * var(--luckinv,1)) 100%;',
    'box-shadow:0 0 10px -1px var(--glow2);',
    'transition:width .22s cubic-bezier(.4,1.3,.5,1)}',
    /* ten notches, so a tap lands somewhere repeatable */
    '.ticks{position:absolute;inset:0;pointer-events:none;',
    'background:repeating-linear-gradient(90deg,transparent 0 calc(25% - 1px),',
    'rgba(0,0,0,.35) calc(25% - 1px) 25%)}',
    /* The marker on the right IS the readout — it wakes up as the bar fills and
       is fully lit at the top. No number: the bar already is one. */
    '.dface{width:17px;height:17px;flex:none;display:block;',
    'transform:scale(.9);transition:filter .3s,transform .3s}',
    '.luck.on .dface{transform:scale(1)}',
    '.luck.hot .dface{filter:none;transform:scale(1.1);',
    'animation:facehot 1.4s ease-in-out infinite}',
    '@keyframes facehot{0%,100%{filter:none}',
    '50%{filter:drop-shadow(0 0 6px var(--gold-lit))}}',
    /* the window wears the same colour, so the machine shows what is loaded */
    '.window.boost{border-color:var(--gold-lit);',
    'box-shadow:var(--win-sh),0 0 20px -3px var(--glow2)}',
    '.window.boostjack{border-color:#E4574F;',
    'box-shadow:var(--win-sh),0 0 20px -3px rgba(228,87,79,.55)}',
    '@media (prefers-reduced-motion:reduce){.luck .dome{animation:none}}',
    '.lever{position:absolute;right:-22px;top:60px;width:62px;height:210px;touch-action:none;',
    'cursor:grab;-webkit-user-select:none;user-select:none;',
    'transition:opacity .2s}',
    '.lever.dragging{cursor:grabbing}',
    '.lever.busy{opacity:.4;cursor:progress}',
    '.rail{position:absolute;left:26px;bottom:14px;width:5px;height:118px;border-radius:3px;',
    'background:var(--rail)}',
    '.arm{position:absolute;left:24px;bottom:6px;width:9px;height:120px;border-radius:5px;',
    'transform-origin:50% 100%;background:linear-gradient(90deg,#8F98A8,#EDF2F9 45%,#79828F);',
    'box-shadow:0 2px 6px rgba(0,0,0,.45)}',
    '.knob{position:absolute;left:-11px;top:-16px;width:31px;height:31px;border-radius:50%;',
    'background:radial-gradient(circle at 32% 28%,#FF8A8A,#C31432 70%);',
    'box-shadow:0 4px 12px rgba(0,0,0,.5),inset 0 -3px 6px rgba(0,0,0,.35);',
    'transition:box-shadow .15s}',
    /* Past the firing point the knob lights up, so the answer to "how far do I
       have to pull this" is on screen instead of in the source. */
    '.lever.ready .knob{box-shadow:0 4px 12px rgba(0,0,0,.5),',
    'inset 0 -3px 6px rgba(0,0,0,.35),0 0 0 3px var(--glow2),0 0 16px 2px var(--glow2)}',
    /* And a mouse has no way of knowing the thing is draggable, so it bobs. */
    '@keyframes leverhint{0%,72%,100%{transform:translateY(0)}',
    '80%{transform:translateY(7px)}88%{transform:translateY(2px)}}',
    '.lever.hint .arm{animation:leverhint 2.6s ease-in-out infinite}',
    '.lever.dragging .arm,.lever.busy .arm{animation:none}',
    '@media (prefers-reduced-motion:reduce){.lever.hint .arm{animation:none}}',
    '.mount{position:absolute;left:15px;bottom:0;width:28px;height:17px;border-radius:7px;',
    'background:var(--mount);border:1px solid var(--cab-br)}',

    /* jackpot celebration */
    '@keyframes shake{0%,100%{transform:translate(0,0) rotate(0)}',
    '12%{transform:translate(-7px,3px) rotate(-.8deg)}',
    '28%{transform:translate(6px,-3px) rotate(.7deg)}',
    '44%{transform:translate(-5px,2px) rotate(-.5deg)}',
    '62%{transform:translate(4px,-2px) rotate(.4deg)}',
    '82%{transform:translate(-2px,1px) rotate(-.2deg)}}',
    '.cab.jackpot{animation:shake .6s ease-in-out}',
    /* A judder, not a celebration: shorter, tighter, and it stops dead. */
    '@keyframes judder{0%,100%{transform:translate(0,0)}',
    '20%{transform:translate(-4px,2px)}45%{transform:translate(4px,-2px)}',
    '70%{transform:translate(-2px,1px)}}',
    '.cab.judder{animation:judder .3s linear 2}',
    /* Small win stays inside the reel window: the payline lights and the two
       matching Macoji wiggle in place. No cabinet movement, nothing falls. */
    '@keyframes wiggle{0%,100%{transform:scale(1) rotate(0)}',
    '25%{transform:scale(1.16) rotate(-8deg)}',
    '50%{transform:scale(1.16) rotate(8deg)}',
    '75%{transform:scale(1.16) rotate(-4deg)}}',
    '.cell.pairwin img{animation:wiggle .58s ease-in-out 2}',
    '@keyframes bandlit{0%,100%{opacity:.5}50%{opacity:1}}',
    '.band.lit{animation:bandlit .46s ease-in-out 3;',
    'background:linear-gradient(90deg,transparent,var(--gold-lit),transparent)}',
    '@keyframes winpulse{0%,100%{transform:scale(1);filter:none}',
    '50%{transform:scale(1.2);filter:drop-shadow(0 0 15px var(--gold-lit))}}',
    '.cell.won img{animation:winpulse .62s ease-in-out 4}',
    '@keyframes mqflash{0%,100%{opacity:.3}25%{opacity:1}50%{opacity:.15}75%{opacity:1}}',
    '.marquee.flash::after{animation:mqflash .34s linear 6}',
    '@keyframes glare{0%{opacity:0}18%{opacity:.85}100%{opacity:0}}',
    '.glare{position:absolute;inset:0;border-radius:28px;pointer-events:none;z-index:1;',
    'background:radial-gradient(60% 45% at 50% 42%,var(--gold-lit),transparent 70%);',
    'opacity:0}',
    '.glare.on{animation:glare 1.1s ease-out}',
    /* Mode changes announce themselves in the centre of the page, not down in
       the cabinet's message area where a result belongs. */
    '.toast{position:fixed;inset:0;display:grid;place-items:center;padding:20px;',
    'pointer-events:none;z-index:2147483003;opacity:0;transition:opacity .25s}',
    '.toast.on{opacity:1}',
    '.toast .card{background:var(--cab);border:1px solid var(--gold-soft);',
    'border-radius:20px;padding:18px 24px;text-align:center;max-width:340px;',
    'box-shadow:0 22px 60px rgba(0,0,0,.55);color:var(--txt);',
    'transform:scale(.92);transition:transform .3s cubic-bezier(.34,1.45,.64,1)}',
    '.toast.on .card{transform:none}',
    '.toast b{display:flex;align-items:center;justify-content:center;gap:9px;',
    'font-size:17px;color:var(--gold);letter-spacing:.01em;white-space:nowrap}',
    '.toast b svg{width:19px;height:19px;stroke:currentColor;fill:none;stroke-width:2;',
    'stroke-linecap:round;stroke-linejoin:round;flex:none}',
    /* Maco himself leans into the card when he is the one talking */
    '.toast .tmaco{width:38px;height:38px;flex:none;display:block;',
    'filter:drop-shadow(0 5px 12px rgba(240,130,30,.5))}',
    '.toast.on .tmaco{animation:tmaco .7s cubic-bezier(.34,1.5,.5,1)}',
    '@keyframes tmaco{0%{transform:translateY(18px) scale(.4) rotate(-14deg)}',
    '60%{transform:translateY(-3px) scale(1.1) rotate(5deg)}',
    '100%{transform:none}}',
    '.toast small{display:block;font-size:13px;color:var(--mut);margin-top:6px;',
    'white-space:nowrap}',
    /* mode badge at the head of the settings sheet */
    /* Sized to sit with the table rows below it, not shout over them: same
       12.5px as a row label, with an icon to match rather than a tiny mark. */
    '.modebar{display:flex;align-items:center;justify-content:center;gap:6px;',
    'margin:2px 0 13px;font-size:12.5px;font-weight:600;line-height:1;letter-spacing:0}',
    '.modebar svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;',
    'stroke-linecap:round;stroke-linejoin:round;flex:none}',
    '.modebar.locked{color:var(--mut)}',
    '.modebar.open{color:var(--gold)}',
    /* Under the machine, in the flow, not floating over it. Fixed to the bottom
       of the viewport it landed on top of the deck plate as soon as the cabinet
       grew tall enough to reach it. */
    '.copy{margin-top:2px;text-align:center;font-size:10px;',
    'letter-spacing:.1em;color:var(--faint);pointer-events:none;display:none}',
    /* Belly glass: on a real cabinet this is the lit lower panel carrying the
       game's character art and its payout ladder. Ours carries Maco and the
       five-lamp meter, which is the same job. */
    '.belly{position:relative;display:flex;align-items:center;justify-content:center;',
    'gap:calc(var(--belly) * .055);height:var(--belly);margin-top:var(--gap);',
    'padding:0 12px;border-radius:14px;',
    'background:linear-gradient(180deg,rgba(255,201,107,.10),rgba(255,158,27,.03));',
    'border:1px solid var(--cab-br);transition:border-color .4s,background .4s}',
    '.belly.full{border-color:var(--gold-lit);',
    'background:linear-gradient(180deg,rgba(255,201,107,.24),rgba(255,158,27,.08))}',
    /* Unlit lamps are a colour conversion, never transparency: fully opaque,
       just drained of colour. Fading them made them vanish against both themes;
       greyscale keeps the whole face readable, it is simply switched off. */
    /* Sized by the row, not by the panel alone: ten lamps at 60% of the belly
       height are wider than the cabinet. Whichever is smaller wins, so the count
       can change without the row ever overflowing. */
    '.lamp{width:min(calc(var(--belly) * .60),',
    'calc((100% - 26px) / var(--lampn,10) - 3px));',
    'height:auto;aspect-ratio:1;opacity:1;',
    'filter:grayscale(1) brightness(.78) contrast(.9);',
    'transition:filter .5s,transform .4s}',
    '.lamp.lit{filter:none;',
    'animation:lampon .55s cubic-bezier(.34,1.7,.64,1)}',
    '@keyframes lampon{0%{transform:scale(.35);opacity:0}',
    '60%{filter:brightness(1.6) drop-shadow(0 0 12px var(--gold-lit))}',
    '100%{transform:none;opacity:1}}',
    /* the last dark lamp breathes when you are one win away */
    /* The one-away tell brightens rather than fading, for the same reason. */
    '.lamp.next{animation:nextup 1.5s ease-in-out infinite}',
    '@keyframes nextup{0%,100%{filter:grayscale(1) brightness(.78) contrast(.9);',
    'transform:scale(1)}',
    '50%{filter:grayscale(.55) brightness(1.05);transform:scale(1.1)}}',
    /* Wildfire: Maco bursts out of the belly and grows up the page */
    '.bigmaco{position:fixed;pointer-events:none;z-index:2147483005;',
    'filter:drop-shadow(0 18px 40px rgba(240,130,30,.55))}',
    /* the Wildfire itself pours out of the machine and down the page */
    '.wild{position:fixed;inset:0;pointer-events:none;z-index:2147483004;overflow:hidden}',
    '.wild img{position:absolute;width:52px;height:52px}',
    '.spark{position:absolute;width:9px;height:9px;border-radius:2px;pointer-events:none}',
    '@media (max-width:430px){.lever{right:-10px;transform:scale(.82);transform-origin:50% 30%}}',
    /* These must sit after every component rule: they share specificity with the
       .belly / .hopper display declarations, so declared earlier they simply lose
       the cascade and nothing hides. */
    /* Below here the belly is gone and the hopper follows, which frees a lot of
       height at once — the main line would keep shrinking the cells for room
       that is no longer being used. Second line, same shape, steeper. */
    '@media (max-height:500px){.belly{display:none}',
    ':host{--maxcell:clamp(18px, calc((100vh - 252px) / 5.2), 88px);',
    '--maxcell:round(down, clamp(18px, calc((100vh - 252px) / 5.2), 88px), 1px)}}',
    '@media (max-height:440px){.hopper,.labels,.mq-sub,.belly{display:none}}',
    '@media (prefers-reduced-motion:reduce){.fab img,.marquee,.bulb,.mq-name{animation:none}',
    '.ctl.cog.unlocked{animation:none;border-color:var(--gold-lit);color:var(--gold-lit)}',
    '.mqlamp,.marquee.litJ .mq,.marquee.litG .mq,.marquee.litJ img,',
    '.marquee.litG img{animation:none}',
    '.mglow::before{animation:none}',
    '.mq-name{-webkit-text-fill-color:var(--gold)}}',
    /* page mode: the cabinet IS the page — no button, no scrim, nothing to close */
    PAGE ? '.fab,.close{display:none}' +
           '.scrim{background:none;-webkit-backdrop-filter:none;backdrop-filter:none;' +
           'opacity:1;pointer-events:none}' +
           '.stack{pointer-events:auto}.cab{transform:none}' +
           /* On its own page the controls belong to the page, not the machine —
              pinned to the top edge. The scrim then reserves that height, so the
              machine centres in what is left instead of sliding underneath. */
           '.bar{position:fixed;top:0;left:0;right:0;width:auto;height:auto;' +
           'flex:none;padding:13px 16px;z-index:2147483002;pointer-events:auto}' +
           '.scrim{padding-top:62px;padding-bottom:22px}' +
           '.copy{display:block}' +
           /* Declared AFTER the rule it overrides — same specificity, so order
              decides, and the hide has to come last or it never applies. */
           '@media (max-height:520px){.scrim{padding-top:64px;padding-bottom:20px}' +
           '.copy,.luck{display:none}}' : ''
  ].join('');

  root.innerHTML =
    '<style>' + CSS + '</style>' +
    '<button class="fab" part="fab" aria-label="Play Lucky Maco">' +
      '<img src="' + FACE + '" alt=""></button>' +
    '<div class="scrim" role="dialog" aria-modal="true" aria-label="Lucky Maco">' +
      '<div class="stack">' +
      '<div class="bar">' +

        '<div class="ctls">' +
          '<button class="ctl tog" aria-label="Switch theme"></button>' +
          '<button class="ctl snd" aria-label="Sound"></button>' +
          '<button class="ctl cog" aria-label="Settings and embed code"></button>' +
          '<button class="ctl rst" aria-label="Reset the machine"></button>' +
        '</div>' +
      '</div>' +
      '<div class="cab">' +
        '<button class="close" aria-label="Close">&#10005;</button>' +
        '<div class="marquee">' +
          '<div class="mqlamp"></div>' +
          '<div class="mqmood"></div>' +
          '<div class="mglow"></div>' +
          '<img src="' + LOGO + '" alt="Master Concept">' +
          '<div class="mq"><span class="mq-name">Lucky Maco</span>' +
            '<span class="mq-sub">Master Concept</span></div>' +
        '</div>' +
        '<div class="glare"></div>' +
        '<div class="hopper"><div class="hstock"></div><div class="hgap"></div>' +
          '<div class="flap l"></div><div class="flap r"></div></div>' +
        '<div class="window">' +
          '<div class="dump"></div>' +
          '<div class="reel"><div class="strip"></div></div>' +
          '<div class="reel"><div class="strip"></div></div>' +
          '<div class="reel"><div class="strip"></div></div>' +
          '<div class="band"></div>' +
          '<div class="pip l"></div><div class="pip r"></div>' +
        '</div>' +
        '<div class="labels"><span>Morning</span><span>Afternoon</span><span>Evening</span></div>' +
        '<div class="msg" aria-live="polite"></div>' +
        '<div class="belly"></div>' +
        '<div class="actions">' +
        '<div class="progress"></div>' +
        '<button class="share off">' +
          /* the three-dots-and-two-lines share mark, the one people recognise */
          '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="2.6"/>' +
          '<circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/>' +
          '<path d="M8.3 10.8 15.7 6.7M8.3 13.2l7.4 4.1"/></svg>' +
          '<span class="slabel">Share</span></button></div>' +
        '<div class="luck locked">' +
          '<span class="dname">Luck</span>' +
          '<div class="track" role="slider" aria-label="Luck" tabindex="0">' +
            '<div class="fill"></div><div class="ticks"></div></div>' +
          '<img class="dface" src="' + FACE + '" alt="">' +
        '</div>' +
        '<div class="sheet">' +
          '<button class="shut" aria-label="Close settings">&#10005;</button>' +
          '<div class="sbody"></div></div>' +
        '<div class="toast"><div class="card"></div></div>' +
        '<div class="lever"><div class="rail"></div><div class="mount"></div>' +
          '<div class="arm"><div class="knob"></div></div></div>' +
      '</div>' +
      '<div class="copy">&copy; 2026 Lucky Maco</div>' +
      '</div>' +
    '</div>';

  /* Follow the host page if it declares a theme, else the OS. Re-evaluated live. */
  var MQ = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function hostTheme() {
    var de = document.documentElement;
    var a = de.getAttribute('data-theme') || de.getAttribute('data-color-mode');
    if (a === 'dark' || a === 'light') return a;
    if (de.classList.contains('dark')) return 'dark';
    if (de.classList.contains('light')) return 'light';
    return MQ && MQ.matches ? 'dark' : 'light';
  }
  function applyTheme() {
    host.setAttribute('data-theme', CFG.theme === 'auto' ? hostTheme() : CFG.theme);
    if (tog) paintToggle();          // undefined until the toggle is wired up
  }
  /* Remembered per viewer. Wrapped because storage throws in some embeds. */
  var STORE = 'luckymaco:theme';
  function remembered() { try { return localStorage.getItem(STORE); } catch (e) { return null; } }
  function remember(v) { try { localStorage.setItem(STORE, v); } catch (e) {} }

  /* Preferences survive a reload; the odds do not — those are a demo setting,
     and a machine that quietly remembers 40% jackpots from last week is a trap. */
  var PERSIST = { packing: 1, stock: 1, shakeForce: 1 };
  ['packing', 'stock', 'shakeForce'].forEach(function (k) {
    try {
      var v = parseFloat(localStorage.getItem('luckymaco:' + k));
      if (v >= RANGE[k][0] && v <= RANGE[k][1]) CFG[k] = v;
    } catch (e) {}
  });

  var saved = remembered();
  if (!THEME_PINNED && (saved === 'light' || saved === 'dark')) CFG.theme = saved;

  applyTheme();
  if (MQ) {
    if (MQ.addEventListener) MQ.addEventListener('change', applyTheme);
    else if (MQ.addListener) MQ.addListener(applyTheme);
  }
  if (window.MutationObserver) {
    new MutationObserver(applyTheme).observe(document.documentElement,
      { attributes: true, attributeFilter: ['data-theme', 'data-color-mode', 'class'] });
  }

  document.documentElement.appendChild(host);

  var $ = function (s) { return root.querySelector(s); };
  var fab = $('.fab'), scrim = $('.scrim'), cab = $('.cab'), msg = $('.msg');
  var lever = $('.lever'), arm = $('.arm'), knob = $('.knob');
  var reels = Array.prototype.slice.call(root.querySelectorAll('.reel'));
  var strips = Array.prototype.slice.call(root.querySelectorAll('.strip'));
  var spinning = false;

  /* Cell height comes from CSS (it shrinks on small screens), so measure rather
     than assume — otherwise the reel lands between two rows. */
  function cellPx() {
    return reels[0] ? reels[0].getBoundingClientRect().height / ROWS : 84;
  }
  function cells(n, target, at) {
    var h = '';
    for (var i = 0; i < n; i++) {
      var m = (target && i === at) ? target : POOL[Math.floor(Math.random() * POOL.length)];
      h += '<div class="cell"><img src="' + ICON(m) + '" alt="' + m + '"></div>';
    }
    return h;
  }
  strips.forEach(function (s) { s.innerHTML = cells(STRIP); });
  msg.innerHTML = idlePrompt();

  /* ── haptics ──────────────────────────────────────────────────────────────
     navigator.vibrate is solid on Android and unreliable on iOS Safari, so every
     call is guarded and the settings sheet reports what this device actually did.
     A pattern is [buzz, pause, buzz, ...] in milliseconds. */
  var canBuzz = typeof navigator !== 'undefined' &&
                typeof navigator.vibrate === 'function';
  var buzzWorked = null;                        // null = not tried yet
  function buzz(pattern) {
    if (!CFG.haptics || !canBuzz) return;
    try { buzzWorked = navigator.vibrate(pattern) !== false; }
    catch (e) { buzzWorked = false; }
  }
  var hPull  = function () {
    if (shakeBuzzed) { shakeBuzzed = false; return; }   // the shake already spoke
    buzz(14);
  };
  var hStop  = function () { buzz(9); };                         // a reel lands
  /* navigator.vibrate REPLACES whatever is running rather than queueing, so the
     lever's own buzz 0ms later used to wipe this one out entirely. The shake now
     plays one pattern for the whole gesture and the lever buzz stands down. */
  var shakeBuzzed = false;
  var hShake = function () { shakeBuzzed = true; buzz([45, 70, 25]); };
  var hPair  = function () { buzz([30, 45, 30]); };
  var hJack  = function () { buzz([70, 45, 70, 45, 70, 45, 90, 60, 320]); };  // long finish

  /* ── share card ───────────────────────────────────────────────────────────
     Redrawn on a canvas rather than screenshotted: html2canvas cannot see into a
     shadow root reliably and would cost ~200KB. Every element is read straight
     off the live DOM — its box, its size, its rotation — so the card is a true
     copy of the machine you are looking at, pile and all. */
  var CARD_W = 1080, EMBED_HOME = 'https://lucky.mcai.dev';

  function rrect(c, x, y, w, h, r) {
    c.beginPath();
    if (c.roundRect) { c.roundRect(x, y, w, h, r); return; }
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);         c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function cssVar(n) { return getComputedStyle(host).getPropertyValue(n).trim(); }

  /* Angle out of a computed transform, so rotated sprites land as they appear. */
  function angleOf(el) {
    var m = getComputedStyle(el).transform;
    if (!m || m === 'none') return 0;
    var p = m.match(/matrix\(([^)]+)\)/);
    if (!p) return 0;
    var v = p[1].split(',');
    return Math.atan2(parseFloat(v[1]), parseFloat(v[0]));
  }

  function shareCanvas() {
    var cabR = cab.getBoundingClientRect();
    var levR = lever.getBoundingClientRect();
    /* The lever hangs off the cabinet's right edge, so a card exactly one cabinet
       wide clipped it off entirely. Frame the union of the two instead, with a
       margin, and the machine sits on the page colour with its lever intact. */
    var PAD = 26;
    /* End the cabinet under the result text. The live machine reserves room below
       it for the Share button, which the card has no reason to draw — left in, it
       is a dead band across the bottom of every card. */
    var bellyShown = getComputedStyle(belly).display !== 'none';
    var lastEl = bellyShown ? belly
               : (msg.querySelector('small') || msg.querySelector('b') || msg);
    var cabDrawH = Math.min(cabR.height,
                            lastEl.getBoundingClientRect().bottom - cabR.top + 22);
    var box = {
      left: Math.min(cabR.left, levR.left) - PAD,
      top:  cabR.top - PAD,
      width: Math.max(cabR.right, levR.right) - Math.min(cabR.left, levR.left) + PAD * 2,
      height: cabDrawH + PAD * 2
    };
    var SC = CARD_W / box.width;
    var FOOT = 74;
    var cv = document.createElement('canvas');
    cv.width = CARD_W;
    cv.height = Math.round(box.height * SC) + FOOT;
    var c = cv.getContext('2d');
    var dark = host.getAttribute('data-theme') === 'dark';

    var rel = function (el) {
      var r = el.getBoundingClientRect();
      return { x: (r.left - box.left) * SC, y: (r.top - box.top) * SC,
               w: r.width * SC, h: r.height * SC,
               cx: (r.left + r.width / 2 - box.left) * SC,
               cy: (r.top + r.height / 2 - box.top) * SC };
    };
    var panel = function (el, fill, stroke, radius) {
      var r = rel(el);
      rrect(c, r.x, r.y, r.w, r.h, radius * SC);
      if (fill) { c.fillStyle = fill; c.fill(); }
      if (stroke) { c.strokeStyle = stroke; c.lineWidth = 2 * SC; c.stroke(); }
      return r;
    };
    var sprite = function (img, cellIdx, reelIdx) {
      if (!img || !img.complete || !img.naturalWidth) return;
      var w = img.offsetWidth * SC, h = img.offsetHeight * SC;
      var cx, cy;
      if (cellIdx == null) {
        var r = rel(img);
        cx = r.cx; cy = r.cy;
      } else {
        /* Derive the slot from the reel's own box, so a strip whose transform has
           not been composited still lands in the right row. */
        var rr = reels[reelIdx].getBoundingClientRect();
        var cell = cellPx();
        cx = (rr.left + rr.width / 2 - box.left) * SC;
        cy = (rr.top + (cellIdx - (lastResult ? TRAIL : 0) + 0.5) * cell - box.top) * SC;
      }
      c.save(); c.translate(cx, cy); c.rotate(angleOf(img));
      c.drawImage(img, -w / 2, -h / 2, w, h); c.restore();
    };
    /* Width of the text itself, not of the box around it. Fitting a label to its
       84px slot let the words fill the whole slot and touch their neighbours. */
    var inkOf = function (el) {
      var t = null, n;
      for (n = 0; n < el.childNodes.length; n++) {
        if (el.childNodes[n].nodeType === 3 && el.childNodes[n].textContent.trim()) {
          t = el.childNodes[n];
        }
      }
      if (!t) return null;
      var rg = document.createRange(); rg.selectNodeContents(t);
      var r = rg.getBoundingClientRect();
      return { cx: (r.left + r.width / 2 - box.left) * SC,
               cy: (r.top + r.height / 2 - box.top) * SC, w: r.width * SC };
    };

    /* Canvas resolves the font stack differently from the DOM, so text drawn at
       the same px size comes out wider and spills over its neighbours. Measure
       and shrink to the width the browser actually gave it. */
    var text = function (str, x, y, font, fill, maxW, align) {
      var m = font.match(/([\d.]+)px/);          // "800 47px" -> 47, not 800
      var size = m ? parseFloat(m[1]) : 16;
      var fam = ' ui-rounded, -apple-system, "Segoe UI", system-ui, sans-serif';
      c.font = font + fam;
      if (maxW && c.measureText(str).width > maxW) {
        size = size * maxW / c.measureText(str).width;
        c.font = font.replace(/[\d.]+px/, size.toFixed(1) + 'px') + fam;
      }
      c.fillStyle = fill; c.textAlign = align || 'center'; c.textBaseline = 'middle';
      c.fillText(str, x, y);
    };

    /* page behind, then the cabinet as a panel on it */
    c.fillStyle = dark ? '#0E1430' : '#F4F6FA';
    c.fillRect(0, 0, cv.width, cv.height);
    var cabX = (cabR.left - box.left) * SC, cabY = (cabR.top - box.top) * SC;
    var cabW = cabR.width * SC, cabH = cabDrawH * SC;
    var g = c.createLinearGradient(0, cabY, 0, cabY + cabH);
    if (dark) { g.addColorStop(0, '#22305F'); g.addColorStop(1, '#121A38'); }
    else      { g.addColorStop(0, '#FFFFFF'); g.addColorStop(1, '#F2F5FA'); }
    c.save();
    c.shadowColor = 'rgba(0,0,0,' + (dark ? '.5' : '.22') + ')';
    c.shadowBlur = 40 * SC; c.shadowOffsetY = 14 * SC;
    rrect(c, cabX, cabY, cabW, cabH, 28 * SC); c.fillStyle = g; c.fill();
    c.restore();

    var gold = cssVar('--gold') || '#FFD772';
    var lit  = cssVar('--gold-lit') || '#FFC96B';
    var mut  = cssVar('--mut') || 'rgba(255,255,255,.62)';
    var txt  = cssVar('--txt') || '#fff';
    var line = cssVar('--cab-br') || 'rgba(255,255,255,.1)';

    /* marquee */
    var mr = panel(marquee, dark ? 'rgba(255,201,107,.10)' : 'rgba(233,152,43,.12)',
                   cssVar('--gold-soft') || lit, 18);
    sprite(mark);
    var nm = rel($('.mq-name'));
    text($('.mq-name').textContent, nm.cx, nm.cy,
         '800 ' + (23 * SC).toFixed(0) + 'px', gold, nm.w);
    var sb = rel($('.mq-sub'));
    c.save(); c.letterSpacing = (2.1 * SC).toFixed(1) + 'px';
    text($('.mq-sub').textContent.toUpperCase(), sb.cx, sb.cy,
         '600 ' + (9.5 * SC).toFixed(0) + 'px', mut, sb.w);
    c.restore();

    /* hopper, then whatever is in it — clipped to the tray, the way .hstock's
       overflow:hidden clips it on screen. Without this the heap spills out of
       the box, since the frame is a window onto a wider pile by design. */
    var jackpotNow = lastResult && lastResult.pattern === 'TRIPLE' && dumpBox.children.length;
    var hr = panel(hopper, dark ? 'rgba(255,255,255,.05)' : 'rgba(27,42,91,.05)', line, 12);
    var i, kids = hstock.children;
    if (!jackpotNow) {                           // after a jackpot it is empty
      c.save();
      rrect(c, hr.x, hr.y, hr.w, hr.h, 12 * SC); c.clip();
      for (i = 0; i < kids.length; i++) sprite(kids[i]);
      c.restore();
    }

    /* reel window: the pile if there is one, otherwise the grid */
    var win = $('.window');
    panel(win, dark ? 'rgba(20,28,60,.9)' : 'rgba(251,252,254,.95)', lit, 18);
    c.save(); var wr = rel(win);
    rrect(c, wr.x, wr.y, wr.w, wr.h, 18 * SC); c.clip();
    /* Draw whatever is actually inside the window. Picking cells by index assumed
       the strip had been scrolled to its landing position, which is only true
       after a spin — at rest the visible cells are the first three, not the ones
       around TRAIL. Testing against live rects is right in every state. */
    var wbox = win.getBoundingClientRect();
    var inWindow = function (el) {
      var q = el.getBoundingClientRect();
      return q.bottom > wbox.top - 4 && q.top < wbox.bottom + 4;
    };
    /* A jackpot shows the pile: the machine emptied itself, and that is the
       picture worth sending. Drawn from the resting places recorded as they fell,
       not from live rects, so it does not matter whether the drop animation has
       finished — or even started — when the card is made. */
    /* A Wildfire leaves the wheel full of whole Macos, so its card has to show the
       pile too — drawing the reels there would contradict the machine. */
    /* A Grand leaves nothing in the wheel — everything flew out — so the card must
       not draw reels or a pile there. Just the empty window and Maco standing in
       it, which is exactly where the animation ends. */
    var grandCard = lastResult && lastResult.pattern === 'WILDFIRE';
    var pileCard = !grandCard && lastResult && lastResult.pattern === 'TRIPLE' &&
                   lastPile.length && dumpBox.children.length === lastPile.length;
    if (grandCard) {
      /* nothing in the window: he is the whole picture */
    } else if (pileCard) {
      for (i = 0; i < lastPile.length; i++) {
        var pd = lastPile[i], pim = dumpBox.children[i];
        if (!pim || !pim.complete || !pim.naturalWidth) continue;
        var PS = pim.offsetWidth || 50, ps = PS * SC;
        c.save();
        c.translate(wr.x + pd.x * SC,
                    wr.y + (pd.y - FACE_Y * PS + PS / 2) * SC);
        c.rotate(pd.r * Math.PI / 180);
        c.drawImage(pim, -ps / 2, -ps / 2, ps, ps);
        c.restore();
      }
    } else {
    /* Pick the cells by index rather than by where they happen to be on screen.
       After a spin the window shows TRAIL..TRAIL+ROWS-1 by construction, so this
       is exact and does not depend on the transform having been composited yet.
       Before any spin the strip is untransformed, so the first rows are showing. */
    var first = lastResult ? TRAIL : 0;
    /* The machine masks each reel so the rows above and below the payline fade
       out at the window's edges — the card drew them flat, which made the three
       rows read as equals and lost the sense of a strip running past. Each reel
       is composed on its own canvas and masked the same way before it lands. */
    for (i = 0; i < strips.length; i++) {
      var rrct = reels[i].getBoundingClientRect();
      var rw = Math.max(1, Math.round(rrct.width * SC));
      var rh = Math.max(1, Math.round(rrct.height * SC));
      var rc = document.createElement('canvas');
      rc.width = rw; rc.height = rh;
      var rx = rc.getContext('2d');
      var cellH = cellPx() * SC;
      for (var k = 0; k < ROWS; k++) {
        var cellEl = strips[i].children[first + k];
        var im = cellEl && cellEl.querySelector('img');
        if (!im || !im.complete || !im.naturalWidth) continue;
        var iw = im.offsetWidth * SC, ih = im.offsetHeight * SC;
        rx.save();
        rx.translate(rw / 2, (k + 0.5) * cellH);
        rx.rotate(angleOf(im));
        rx.drawImage(im, -iw / 2, -ih / 2, iw, ih);
        rx.restore();
      }
      if (ROWS > 1) {                              // same stops as the live mask
        var gm = rx.createLinearGradient(0, 0, 0, rh);
        gm.addColorStop(0, 'rgba(0,0,0,1)');
        gm.addColorStop(0.18, 'rgba(0,0,0,.55)');
        gm.addColorStop(CENTRE / ROWS, 'rgba(0,0,0,0)');
        gm.addColorStop((CENTRE + 1) / ROWS, 'rgba(0,0,0,0)');
        gm.addColorStop(0.82, 'rgba(0,0,0,.55)');
        gm.addColorStop(1, 'rgba(0,0,0,1)');
        rx.globalCompositeOperation = 'destination-out';
        rx.fillStyle = gm;
        rx.fillRect(0, 0, rw, rh);
      }
      c.drawImage(rc, (rrct.left - box.left) * SC, (rrct.top - box.top) * SC, rw, rh);
    }
    var bd = rel($('.band'));
    c.strokeStyle = lit; c.lineWidth = 2.5 * SC;
    rrect(c, bd.x, bd.y, bd.w, bd.h, 10 * SC); c.stroke();
    }
    c.restore();

    /* labels */
    var labs = root.querySelectorAll('.labels span');
    for (i = 0; i < labs.length; i++) {
      var lr = inkOf(labs[i]) || rel(labs[i]);
      c.save(); c.letterSpacing = (0.8 * SC).toFixed(1) + 'px';
      text(labs[i].textContent.toUpperCase(), lr.cx, lr.cy,
           '700 ' + (10.5 * SC).toFixed(0) + 'px', mut, lr.w);
      c.restore();
    }

    /* the result */
    var b = msg.querySelector('b'), sm = msg.querySelector('small');
    if (b) {
      var imgs = b.querySelectorAll('img');
      for (i = 0; i < imgs.length; i++) sprite(imgs[i]);
      /* Range over the text node gives exactly where the browser put the words,
         icons and all — no reconstructing the flex layout by hand. */
      var size = parseFloat(getComputedStyle(b).fontSize);
      var win2 = /jackpot|win/.test(msg.className) ? gold : txt;
      var ink = inkOf(b);
      if (ink) {
        text(b.textContent.trim(), ink.cx, ink.cy,
             '800 ' + (size * SC).toFixed(0) + 'px', win2, ink.w);
      }
    }
    if (sm) {
      var sr = rel(sm);
      text(sm.textContent, sr.cx, sr.cy, '500 ' + (13 * SC).toFixed(0) + 'px', mut, sr.w);
    }

    /* belly glass and the meter */
    if (bellyShown) {
      var br = panel(belly, dark ? 'rgba(255,201,107,.12)' : 'rgba(224,138,23,.16)',
                     lamps >= LAMPS ? lit : line, 14);
      var lampEls = belly.querySelectorAll('.lamp');
      for (i = 0; i < lampEls.length; i++) {
        var lrct = rel(lampEls[i]), lw = lampEls[i].offsetWidth * SC;
        var isLit = lampEls[i].classList.contains('lit') ||
                    (lastResult && lastResult.pattern === 'WILDFIRE');
        c.save();
        if (!isLit) c.filter = 'grayscale(1) brightness(.78) contrast(.9)';
        c.drawImage(lampEls[i], lrct.cx - lw / 2, lrct.cy - lw / 2, lw, lw);
        c.restore();
      }
    }

    /* A Wildfire card is Maco himself, standing over the reels he just emptied. */
    if (lastResult && lastResult.pattern === 'WILDFIRE') {
      var bm = new Image(); bm.src = BODY;
      if (bm.complete && bm.naturalWidth) {
        var wrr = rel(win), bs = wrr.h * 0.86;
        c.save();
        c.shadowColor = 'rgba(240,130,30,.55)'; c.shadowBlur = 60 * SC; c.shadowOffsetY = 12 * SC;
        c.drawImage(bm, wrr.x + wrr.w / 2 - bs / 2, wrr.y + wrr.h / 2 - bs / 2, bs, bs);
        c.restore();
      }
    }

    /* the lever, at rest — rail, mount, arm, knob */
    var piece = function (sel) {
      var el = root.querySelector(sel);
      return el ? rel(el) : null;
    };
    var rail = piece('.rail'), mount = piece('.mount'),
        arm = piece('.arm'),  knob = piece('.knob');
    if (rail) { rrect(c, rail.x, rail.y, rail.w, rail.h, rail.w / 2);
                c.fillStyle = dark ? 'rgba(0,0,0,.35)' : 'rgba(27,42,91,.13)'; c.fill(); }
    if (mount) { rrect(c, mount.x, mount.y, mount.w, mount.h, 7 * SC);
                 c.fillStyle = dark ? '#2C3A६8'.replace('६','6') : '#D3D9E5'; c.fill(); }
    if (arm) {
      var ag = c.createLinearGradient(arm.x, 0, arm.x + arm.w, 0);
      ag.addColorStop(0, '#8F98A8'); ag.addColorStop(.45, '#EDF2F9'); ag.addColorStop(1, '#79828F');
      rrect(c, arm.x, arm.y, arm.w, arm.h, arm.w / 2); c.fillStyle = ag; c.fill();
    }
    if (knob) {
      var kr = knob.w / 2, kx = knob.cx, ky = knob.cy;
      var kg = c.createRadialGradient(kx - kr * .18, ky - kr * .22, kr * .1, kx, ky, kr);
      kg.addColorStop(0, '#FF8A8A'); kg.addColorStop(.7, '#C31432'); kg.addColorStop(1, '#A50F27');
      c.beginPath(); c.arc(kx, ky, kr, 0, 6.2832); c.fillStyle = kg; c.fill();
    }

    /* footer */
    c.save(); c.letterSpacing = (2 * SC).toFixed(1) + 'px';
    text('LUCKY.MCAI.DEV', cv.width / 2, cv.height - FOOT / 2 - 4,
         '700 ' + (11 * SC).toFixed(0) + 'px', gold, cv.width * 0.7);
    c.restore();
    return cv;
  }

  /* Written for whoever receives it, not scraped off the screen. The machine tells
     the player "all of Thursday is yours"; a shared message has to say "mine",
     name the game, and invite them to play. */
  /* Written so a stranger can follow it. Naming the three parts of the day makes
     the faces mean something without knowing the game, and the same opening on
     every message gives it a shape people recognise after seeing two. */
  /* The card already shows what happened — three faces, or a machine emptied
     onto the floor. Spelling it out again in the text made every share a
     scoreboard entry. One greeting, one invitation, the same for every result,
     so a losing pull is exactly as worth sending as a jackpot. */
  function shareText() {
    return 'Lucky ' + today() + '!\nJoin me to get Lucky Maco \u2192 ' + EMBED_HOME;
  }

  /* navigator.share only works while the click's user activation is still live.
     Building the PNG inside toBlob's async callback loses it on Android Chrome,
     which throws NotAllowedError — and my first version swallowed that in an
     empty catch, so the button looked dead. The card is now rendered as soon as
     a result lands, so the click has a file ready and calls share immediately. */
  var pendingCard = null;
  function prepareCard() {
    pendingCard = null;
    try {
      shareCanvas().toBlob(function (blob) {
        if (!blob) return;
        try { pendingCard = new File([blob], 'lucky-maco.png', { type: 'image/png' }); }
        catch (e) { pendingCard = blob; }
      }, 'image/png');
    } catch (e) { /* leave it null; the click will build one */ }
  }

  function handOff(file) {
    var payload = { title: 'Lucky Maco', text: shareText() };
    var isFile = file && file.name;
    if (isFile && navigator.canShare && navigator.canShare({ files: [file] })) {
      return navigator.share({ files: [file], title: payload.title, text: payload.text });
    }
    if (navigator.share) return navigator.share(payload);
    return Promise.reject(new Error('no-share'));
  }

  /* toBlob is async, and on Android Chrome the await costs the click its user
     activation — navigator.share then throws NotAllowedError and the button
     looks dead. toDataURL is synchronous, so a card built this way is still
     inside the activation window. Used only when the pre-rendered one is
     missing, which is the case a broken card render used to leave behind. */
  function cardNow() {
    var url = shareCanvas().toDataURL('image/png');
    var bin = atob(url.slice(url.indexOf(',') + 1));
    var buf = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    var blob = new Blob([buf], { type: 'image/png' });
    try { return new File([blob], 'lucky-maco.png', { type: 'image/png' }); }
    catch (e) { return blob; }
  }

  function shareResult() {
    var file = pendingCard;
    if (!file) { try { file = cardNow(); } catch (e) { file = null; } }
    var after = function (err) {
      if (!err) return;
      if (err && err.name === 'AbortError') return;      // they just backed out
      if (file) saveCard(file);
      else toast('<b>Could not share</b><small>' + (err.message || err.name || '') +
                 '</small>', 3200);
    };
    if (file) {
      var p;
      try { p = handOff(file); } catch (e) { after(e); return; }
      if (p && p['catch']) p['catch'](after);
      return;
    }
    /* No card at all — the render itself failed. Share the words rather than
       leaving the button doing nothing. */
    var q;
    try { q = handOff(null); } catch (e) { after(e); return; }
    if (q && q['catch']) q['catch'](after);
  }

  function saveCard(blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'lucky-maco.png';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    try { navigator.clipboard && navigator.clipboard.writeText(shareText()); } catch (e) {}
    toast('<b>' + LOCK_OPEN + 'Card saved</b><small>and the text is on your clipboard</small>', 2800);
  }

  /* ── sound ────────────────────────────────────────────────────────────────
     Synthesised with WebAudio — no files, nothing to load, ~1KB of code. The
     context is created lazily on the first pull, which is a user gesture, so
     no browser ever blocks it as autoplay. */
  var AC = null, sound = CFG.sound;
  function actx() {
    if (!AC) {
      var Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      try { AC = new Ctor(); } catch (e) { return null; }
    }
    if (AC.state === 'suspended' && AC.resume) AC.resume();
    return AC;
  }
  function tone(freq, dur, type, vol, slideTo, delay) {
    if (!sound) return;
    var c = actx(); if (!c) return;
    var t = c.currentTime + (delay || 0);
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  /* Filtered white noise. This is what makes a sound read as a mechanism rather
     than a beeper — pure oscillators always sound electronic. */
  var NOISE = null;
  function noise(dur, vol, freq, q, sweepTo, delay) {
    if (!sound) return;
    var c = actx(); if (!c) return;
    if (!NOISE) {
      var n = c.sampleRate * 2;
      NOISE = c.createBuffer(1, n, c.sampleRate);
      var d = NOISE.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    var t = c.currentTime + (delay || 0);
    var src = c.createBufferSource(); src.buffer = NOISE; src.loop = true;
    var f = c.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.setValueAtTime(freq, t); f.Q.value = q || 1;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + dur);
    var g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start(t); src.stop(t + dur + 0.02);
  }
  function chime(notes, step, dur, vol, type) {
    notes.forEach(function (f, i) { tone(f, dur, type || 'triangle', vol, 0, i * step / 1000); });
  }

  /* Lever: the ratchet clicking through its travel, ending on a firmer detent.
     No low thud — it muddied the clicks. */
  var sClunk = function () {
    for (var i = 0; i < 7; i++) noise(0.02, 0.26, 2200 - i * 160, 6, 0, i * 0.026);
    noise(0.038, 0.44, 1500, 5, 0, 0.19);
    tone(300, 0.05, 'square', 0.10, 0, 0.19);
  };

  /* Reels: a motor whir under a tick per symbol, both slowing with the reel. */
  var spinTick = null;
  function sSpin(ms) {
    if (!sound) return;
    noise(ms / 1000, 0.075, 300, 3.5, 140);
    var gap = 30, elapsed = 0;
    (function tick() {
      if (!sound || elapsed > ms - 160) { spinTick = null; return; }
      noise(0.013, 0.12, 2500, 7);
      gap += 1.6; elapsed += gap;
      spinTick = setTimeout(tick, gap);
    })();
  }
  function stopSpinSound() { if (spinTick) { clearTimeout(spinTick); spinTick = null; } }

  var sStop = function () { tone(660, 0.07, 'square', 0.07); };
  var sWin  = function () { chime([1047, 1319, 1568, 2093], 62, 0.18, 0.09, 'sine'); };
  var sJack = function () {
    [[523, 659], [587, 740], [659, 831], [784, 1047], [1047, 1319]].forEach(function (pair, i) {
      pair.forEach(function (f) { tone(f, 0.4, 'triangle', 0.13, 0, i * 0.13); });
    });
  };
  /* Luck going up: a short rising arpeggio with a soft noise swell under it, so
     it reads as the machine winding up rather than a notification chirp. */
  var sLuckUp = function () {
    chime([523, 659, 784, 1047, 1319], 55, 0.22, 0.075, 'triangle');
    noise(0.4, 0.05, 500, 2, 2600);
  };
  /* Luck going down: the same shape backwards, quieter and duller. Falling, not
     failing — a win is what costs you a level, so it must not sound like a loss. */
  var sLuckDown = function () {
    chime([784, 659, 523], 70, 0.2, 0.05, 'sine');
    noise(0.26, 0.035, 1600, 2, 400);
  };
  /* Maco appearing to speak: one soft pop, the sound of him arriving. */
  var sPop = function () {
    tone(320, 0.09, 'sine', 0.09, 900);
    noise(0.07, 0.06, 900, 3, 2200, 0.02);
  };
  /* Reset: the whole cabinet powering down and coming back. */
  var sReset = function () {
    tone(700, 0.22, 'sine', 0.08, 180);              // wind down
    noise(0.3, 0.06, 1800, 2, 260);
    chime([392, 523, 784], 60, 0.24, 0.07, 'triangle');   // and back up
    noise(0.18, 0.04, 400, 2, 2200, 0.28);
  };
  /* The machine getting uneasy: a low uneven grumble with a rattle over it.
     Deliberately unmusical — it should read as something loose, not a cue. */
  function sUneasy() {
    noise(0.9, 0.05, 190, 1.6, 120);
    tone(78, 0.9, 'sawtooth', 0.035, 62);
    for (var i = 0; i < 9; i++) noise(0.014, 0.05, 1100 + Math.random() * 700, 9, 0, i * 0.1);
  }
  /* Charged: the same idea an octave up and in tune — clearly a good thing. */
  function sCharged() {
    chime([784, 988, 1175, 1568], 70, 0.3, 0.055, 'sine');
    noise(0.5, 0.04, 900, 2, 3200);
  }
  /* And one shaking itself loose: a snap, then something falling away. */
  function sShakeLoose() {
    noise(0.05, 0.34, 700, 4, 200);
    tone(200, 0.5, 'sine', 0.11, 60);
    for (var i = 0; i < 5; i++) noise(0.03, 0.09, 600 - i * 90, 4, 0, 0.1 + i * 0.07);
  }

  /* ── the LUCKY MACO release ────────────────────────────────────────────
     Six seconds had one sound in it. Each beat gets its own now, so the ear
     follows the same story the eye does. */

  /* the belly lighting up, one lamp at a time: a rising ladder, each rung a
     little brighter than the last */
  function sLampUp(n, step) {
    for (var i = 0; i < n; i++) {
      tone(392 * Math.pow(2, i / 12), 0.13, 'triangle', 0.055 + i * 0.004, 0, i * step / 1000);
      noise(0.03, 0.05, 1400 + i * 130, 6, 0, i * step / 1000);
    }
  }
  /* all of them straining at once — a low rattle under a rising whine */
  function sRattle(ms) {
    noise(ms / 1000, 0.09, 180, 2.2, 420);
    tone(110, ms / 1000, 'sawtooth', 0.045, 190);
    for (var i = 0; i * 55 < ms; i++) noise(0.016, 0.07, 900, 8, 0, i * 0.055);
  }
  /* one Maco getting out: a short upward whoosh, pitched a little differently
     each time so a run of them does not sound like a machine gun */
  function sWhoosh(delay, pitch) {
    noise(0.24, 0.075, 300 * pitch, 1.6, 2400 * pitch, delay);
    tone(240 * pitch, 0.2, 'sine', 0.045, 900 * pitch, delay);
  }
  /* the hopper floor letting go */
  function sBurst() {
    noise(0.05, 0.4, 900, 3, 260);
    tone(90, 0.3, 'sine', 0.16, 45);
    for (var i = 0; i < 4; i++) noise(0.03, 0.2, 1800 - i * 300, 7, 0, 0.02 + i * 0.03);
  }
  /* he lands in the window: a big warm arrival, not a jingle */
  function sLand() {
    tone(65, 0.5, 'sine', 0.2, 40);
    [523, 659, 784, 1047].forEach(function (f, i) {
      tone(f, 0.75, 'triangle', 0.1, 0, i * 0.03);
    });
    noise(0.5, 0.07, 400, 1.4, 3000, 0.04);
  }
  /* and the wave, a couple of sparkles as his hand goes up */
  function sWave() {
    [1568, 2093, 1760].forEach(function (f, i) {
      tone(f, 0.16, 'sine', 0.05, 0, i * 0.13);
    });
  }
  /* LUCKY MACO! — the fanfare the message lands on */
  function sFanfare() {
    [[523, 0], [659, 0.09], [784, 0.18], [1047, 0.27], [1319, 0.36]].forEach(function (p) {
      tone(p[0], 0.6, 'triangle', 0.12, 0, p[1]);
      tone(p[0] * 2, 0.5, 'sine', 0.05, 0, p[1]);
    });
    tone(131, 0.9, 'sine', 0.14, 0, 0.36);
    noise(0.7, 0.05, 600, 1.2, 4000, 0.36);
  }

  /* Falling Macoji: wooden blocks tumbling, not metal. */
  function sFall() {
    for (var i = 0; i < 26; i++) {
      var d = 0.15 + i * 0.075;
      noise(0.045, 0.1, 420 + Math.random() * 380, 3, 0, d);
      tone(150 + Math.random() * 180, 0.07, 'sine', 0.07, 0, d);
    }
  }

  /* ── hopper ───────────────────────────────────────────────────────────────
     A jumbled heap of Macoji resting above the reels — the visible reason the
     machine has something to give you. Laid out once with random rotations and
     depths; it's static markup afterwards, so it costs nothing to keep on screen. */
  /* Measured off the artwork, not guessed: the pale face occupies 64% of the
     sprite's width and sits centred 70% of the way down, with the flame tail
     above it. Settling on the full box made sprites touch through empty tail
     space, which is why some looked suspended in mid-air. */
  var FACE_D = 0.64, FACE_Y = 0.70;

  function pileLayout(count, D, W, H, pad, base, tries, ceiling) {
    var minX = pad + D / 2, maxX = W - pad - D / 2;
    var floorY = H - base - D / 2, placed = [];
    function restFor(x) {
      var y = floorY;
      for (var k = 0; k < placed.length; k++) {
        var dx = Math.abs(placed[k].x - x);
        if (dx >= D) continue;                       // no horizontal overlap
        var top = placed[k].y - Math.sqrt(D * D - dx * dx);
        if (top < y) y = top;                        // must sit on top of it
      }
      return y;
    }
    for (var i = 0; i < count; i++) {
      var best = null;
      for (var t = 0; t < (tries || 5); t++) {
        var x = minX + Math.random() * (maxX - minX);
        var y = restFor(x);
        if (!best || y > best.y) best = { x: x, y: y };
      }
      /* `count` is a maximum, not a quota. Loosening the packing means fewer
         fit, so stop rather than stack them out through the roof. */
      if (ceiling != null && best.y < ceiling) break;
      placed.push(best);
    }
    return placed;
  }

  /* Distinct faces, drawn without replacement — picking at random each time put
     the same Macoji in the hopper three times over. */
  function distinct(n) {
    var pool = POOL.slice(), out = [];
    while (out.length < n && pool.length) {
      out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    while (out.length < n) out.push(POOL[Math.floor(Math.random() * POOL.length)]);
    return out;
  }

  var hopper = $('.hopper'), hstock = $('.hstock'), dumpBox = $('.dump');
  /* 9 showing on the reels, the other 19 heaped in the hopper — the machine holds
     the whole set. Laid out by the same settling routine as the jackpot pile, so
     they nestle into each other rather than lining up in rows. */
  /* The hopper is a WINDOW onto a bigger reservoir, not the whole of it. The heap
     is laid out across a box wider and taller than the frame, so Macoji run off
     the sides and above the top and get clipped — which reads as "there is more
     back there". It holds the 28 minus the 9 showing on the reels, and all 19
     fall on a jackpot — the supply and the payout are the same Macoji. */
  var HS = 34, OVER = 30;                        // OVER = overhang past each edge
  function fillHopper() {
    var W = hopper.clientWidth || 320, H = hopper.clientHeight || 72;
    var spots = pileLayout(CFG.stock, FACE_D * HS * CFG.packing, W + OVER * 2, H, 3, 3, 12,
                           FACE_Y * HS - 70);        // may stack up out of frame
    var faces = distinct(spots.length), h = '';
    for (var i = 0; i < spots.length; i++) {
      h += '<img src="' + ICON(faces[i]) + '" alt="" style="width:' + HS + 'px;height:' +
        HS + 'px;left:' + (spots[i].x - OVER - HS / 2).toFixed(1) + 'px;top:' +
        (spots[i].y - FACE_Y * HS).toFixed(1) + 'px;transform:rotate(' +
        ((Math.random() - 0.5) * 70).toFixed(0) + 'deg)">';
    }
    hstock.innerHTML = h;
  }

  /* Tip the stock in. Each sprite already carries its own rotate() inline, so the
     end keyframe reuses it verbatim and the start just prefixes a translateY —
     otherwise animating transform would wipe the tilt. */
  function pourHopper() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches) return;
    var kids = hstock.children;
    for (var i = 0; i < kids.length; i++) {
      var el = kids[i], t = el.style.transform || '';
      el.animate([
        { transform: 'translateY(-72px) ' + t, opacity: 0 },
        { transform: t, opacity: 1 }
      ], {
        duration: 460,
        delay: i * 24 + Math.random() * 40,      // ragged, like pouring
        easing: 'cubic-bezier(.34,1.45,.6,1)',
        fill: 'backwards'
      });
    }
  }
  fillHopper();

  /* Jackpot: the hopper empties itself over the reels and piles up at the bottom. */
  /* Drop `count` circles of diameter D into a W x H box: each takes a random x,
     falls, and settles the moment it touches one already placed. Trying several
     x's and keeping the one that settles LOWEST is what makes a heap fill its
     gaps and mound up rather than tower. Shared by the hopper and the jackpot. */
  var lastPile = [], lastResult = null, lastMaco = null;
  /* Bumped by a reset. Anything staged across time carries the generation it
     was scheduled in and gives up if the machine has moved on since — a reset
     mid-LUCKY-MACO would otherwise land its later steps on a machine that has
     already gone back to the start. */
  var gen = 0;
  function clearDrops() {
    while (dumpBox.firstChild) dumpBox.removeChild(dumpBox.firstChild);
  }

  /* Pulling the lever after a jackpot used to blink the pile out of existence and
     snap a full hopper back — the machine reset between two frames. The pile now
     falls out through the bottom of the window while the reels fade back in, all
     inside the first half-second of the spin. */
  function drainPile(done) {
    var kids = dumpBox.children;
    if (!kids.length) { done(); return; }
    var H = $('.window').getBoundingClientRect().height;
    for (var i = 0; i < kids.length; i++) {
      (function (el, i) {
        var cur = getComputedStyle(el).transform;
        el.animate([
          { transform: cur === 'none' ? 'translateY(0)' : cur, opacity: 1 },
          { transform: 'translateY(' + (H + 90) + 'px)', opacity: 1 }
        ], { duration: 420 + Math.random() * 220,
             delay: i * 9,
             easing: 'cubic-bezier(.45,0,.9,.55)', fill: 'forwards' });
      })(kids[i], i);
    }
    setTimeout(function () { clearDrops(); done(); }, 620);
  }
  /* The floor swings open and the stock drops through it. The frame itself never
     moves — an empty hopper still reads as part of the machine. */
  function emptyHopper() {
    hopper.classList.add('open');
    setTimeout(function () {
      hstock.style.opacity = '0';
      setTimeout(function () { hstock.innerHTML = ''; hstock.style.opacity = '1'; }, 300);
    }, 240);                                    // let the plates part first
  }
  /* Called at the start of a pull, not at the end of a dump: after a jackpot the
     machine sits empty with the pile on the floor until you play again. */

  function restock(done) {
    /* He is a fixed-position sprite over the whole page, so a restock behind him
       refills a machine nobody can see. spin() already sends him away; a tap on a
       spent machine goes nowhere near spin(). */
    if (lastMaco) {
      var going = lastMaco; lastMaco = null;
      going.animate([{ opacity: 1 }, { transform: 'scale(.86) translateY(14px)', opacity: 0 }],
                    { duration: 260, easing: 'ease-in', fill: 'forwards' });
      setTimeout(function () { going.remove(); }, 280);
    }
    /* And anything else still in the air. The release throws thirty-odd sprites
       across the page on their own timers; tracking only the one that lands in
       the window left the stragglers covering the machine it was refilling. */
    var strays = root.querySelectorAll('.bigmaco'), st;
    for (st = 0; st < strays.length; st++) {
      if (strays[st] !== lastMaco) strays[st].remove();
    }
    var refill = function () {
      var wasDark = $('.window').classList.contains('emptied');
      $('.window').classList.remove('emptied');
      if (!hstock.children.length) {
        hopper.classList.remove('open');         // floor swings shut
        fillHopper();
        pourHopper();
      }
      if (wasDark) dropCells();
      if (done) done(wasDark);
    };
    if (dumpBox.children.length) drainPile(refill);   // let it fall out first
    else { clearDrops(); refill(); }
  }
  /* count = how many Macoji fall; empty = whether the hopper drains with them.
     Jackpot dumps the lot, a pair just spills a few. */
  /* `faces` is the list of Macoji to drop — one entry each, no repeats. It used
     to be a count, with each drop picking at random WITH replacement, so the same
     face turned up several times in one pile. */
  function dump(faces, empty, forceSrc) {
    var count = forceSrc ? faces : faces.length;
    var box = $('.window').getBoundingClientRect();
    var H = box.height, W = box.width;
    clearDrops();                                // any dump still in flight
    lastPile = [];
    if (empty) emptyHopper();

    var S = 50;                                  // sprite size; the face is 0.64 of it
    var spots = pileLayout(count, FACE_D * S * CFG.packing, W, H, 10, 8, 5,
                           FACE_Y * S - 90);          // never truncate: every one must land

    for (var i = 0; i < spots.length; i++) {
      (function (i) {
        var spot = spots[i];
        var iconName = forceSrc ? null : faces[i];
        var el = document.createElement('img');
        el.className = 'drop';
        el.src = forceSrc || ICON(iconName);
        el.style.width = el.style.height = S + 'px';
        el.style.left = (spot.x - S / 2).toFixed(1) + 'px';
        el.style.top = (spot.y - FACE_Y * S).toFixed(1) + 'px';   // resting place
        lastPile.push({ x: spot.x, y: spot.y, n: iconName, r: 0, body: !!forceSrc });
        dumpBox.appendChild(el);
        var floor = 0;
        var turn = (Math.random() - 0.5) * 76;             // tossed, not filed away
        lastPile[lastPile.length - 1].r = turn;
        var from = -(spot.y) - 70;
        var rest = 'translateY(0) rotate(' + turn + 'deg)';
        el.animate([
          { transform: 'translateY(' + from + 'px) rotate(0deg)', opacity: 0,
            easing: 'cubic-bezier(.4,0,.95,.6)' },                       // gravity
          { transform: rest, opacity: 1, offset: .34, easing: 'ease-out' },
          { transform: 'translateY(-13px) rotate(' + (turn + 9) + 'deg)',
            opacity: 1, offset: .44, easing: 'ease-in' },                // bounce
          { transform: rest, opacity: 1 }                              // and there it stays
        ], { duration: 1400 + Math.random() * 450,
             delay: i * 30 + Math.random() * 60,          // ragged, not metronomic
             fill: 'both' });                             // holds where it landed
      })(i);
    }
  }

  /* ── the meter ────────────────────────────────────────────────────────────
     A collection meter, the standard slot mechanic: wins light lamps across
     pulls, and filling them triggers something the base game cannot. Each lamp
     lights with the face that actually won it, so the panel doubles as a record
     of the wins that got you there. Twins lights two, a jackpot lights three —
     otherwise the rarer result would be worth no more than the common one.

       0.10 x 2  +  0.05 x 3  =  0.35 lamps per pull  ->  ten lit every ~31 pulls at
       x1, and a good deal sooner once the Luck bar is up, which is the point of
       there being ten of them rather than eight. */
  var WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
               'eight', 'nine', 'ten'];
  function word(n) { return WORDS[n] || String(n); }
  var LAMPS = 10, lamps = 0;
  var belly = $('.belly'), lampRow = belly;
  belly.style.setProperty('--lampn', String(LAMPS));

  try {
    var saved = parseInt(localStorage.getItem('luckymaco:lamps'), 10);
    if (saved >= 0 && saved < LAMPS) lamps = saved;
  } catch (e) {}

  function drawLamps() {
    var h = '', i;
    for (i = 0; i < LAMPS; i++) {
      /* Every lamp is Maco himself, not the face that won it — five different
         Macoji read as five unrelated things rather than one meter filling. */
      var cls = i < lamps ? ' lit'
              : (i === lamps && lamps === LAMPS - 1 ? ' next' : '');
      h += '<img class="lamp' + cls + '" src="' + FACE + '" alt="">';
    }
    lampRow.innerHTML = h;
    belly.classList.toggle('full', lamps >= LAMPS);
    var pr = $('.progress');
    if (pr) {
      /* No running count — the lit faces below say it at a glance, and a number
         beside them only repeated it. What is left is the stake, stated once,
         and a tighter line on the pull that leaves a single lamp dark. */
      var left = LAMPS - lamps;
      pr.classList.toggle('close', left === 1);
      pr.innerHTML = left === 1 ? 'One more!'
                                : 'Light up all Maco to set them free';
    }
  }
  function saveLamps() {
    try { localStorage.setItem('luckymaco:lamps', String(lamps)); } catch (e) {}
  }
  drawLamps();

  /* Everything the machine holds pours out and keeps going past the cabinet —
     the jackpot fills the wheel, the Wildfire fills the page. */
  /* A sequence rather than one burst — the five faces you collected become Maco,
     he bursts out of the belly, grows across the page, and only then does the
     machine go up. Each phase hands off to the next. */
  /* Everything the machine holds becomes a whole Maco and escapes upward. The
     jackpot rains DOWN — gravity, the machine spilling. This goes UP, which reads
     as escape without needing a word of explanation. */
  function flyOut(img, delay, opts) {
    opts = opts || {};
    var r = img.getBoundingClientRect();
    var size = (opts.size || img.offsetWidth) || 40;
    var el = document.createElement('img');
    el.className = 'bigmaco';
    el.src = BODY;
    el.style.width = el.style.height = size + 'px';
    el.style.left = (r.left + r.width / 2 - size / 2) + 'px';
    el.style.top = (r.top + r.height / 2 - size / 2) + 'px';
    root.appendChild(el);
    var drift = (Math.random() - 0.5) * 300;
    var lift = window.innerHeight * (0.7 + Math.random() * 0.45);
    var turn = (Math.random() - 0.5) * 220;
    var dur = 2500 + Math.random() * 900;
    el.animate([
      { transform: 'translate(0,0) scale(.55) rotate(0deg)', opacity: 0 },
      { transform: 'translate(' + (drift * .1) + 'px,-30px) scale(1.22) rotate(' +
        (turn * .06) + 'deg)', opacity: 1, offset: .18,
        easing: 'cubic-bezier(.2,1.4,.4,1)' },
      { transform: 'translate(' + (drift * .5) + 'px,' + (-lift * .5) + 'px) scale(1.02) rotate(' +
        (turn * .5) + 'deg)', opacity: 1, offset: .6 },
      { transform: 'translate(' + drift + 'px,' + (-lift) + 'px) scale(.85) rotate(' +
        turn + 'deg)', opacity: 0 }
    ], { duration: dur, delay: delay,
         easing: 'cubic-bezier(.3,0,.5,1)', fill: 'backwards' })
      .onfinish = function () { el.remove(); };
    /* onfinish never lands if the tab is hidden mid-flight, and 30-odd of these
       would be left pinned over the page. Sweep them regardless. */
    setTimeout(function () { el.remove(); }, delay + dur + 400);
    if (opts.hide !== false) {
      img.animate([{ opacity: 1 }, { opacity: 0 }],
                  { duration: 200, delay: delay, fill: 'forwards' });
    }
  }

  function wildfire() {
    var myGen = gen, live = function () { return myGen === gen; };
    /* settle() frees the lever before the celebrations run, so for the six
       seconds of this the machine looked idle and would take another pull. The
       release's remaining steps then landed on top of that pull — emptying the
       hopper mid-spin, darkening the reels, and writing LUCKY MACO! over
       whatever had just come up. Hold the lever until he has finished. */
    celebrating = true;
    lever.classList.add('busy');
    /* One pattern for the whole sequence: navigator.vibrate replaces whatever is
       running, so staged calls would cut each other off. */
    buzz([55, 75, 55, 75, 55, 75, 55, 75, 55, 280,
          80, 70, 120, 70, 170, 90, 720]);

    /* The top glass burns for the whole release and only fades once he has
       landed — the one time in the game it stays lit rather than flashes. */
    mqLamp('litG', 6000);
    marquee.classList.add('allon');
    setTimeout(function () { marquee.classList.remove('allon'); }, 6000);

    var lampsEls = belly.querySelectorAll('.lamp');
    var i, t = 0;

    /* 1. the belly glows, face by face */
    for (i = 0; i < lampsEls.length; i++) {
      lampsEls[i].animate([
        { filter: 'none', transform: 'scale(1)' },
        { filter: 'brightness(2) drop-shadow(0 0 18px #FFC96B)', transform: 'scale(1.35)' },
        { filter: 'none', transform: 'scale(1)' }
      ], { duration: 460, delay: i * 90, easing: 'ease-out' });
    }
    sLampUp(lampsEls.length, 90);
    t = lampsEls.length * 90 + 320;

    /* 1b. then all eight rattle together — they know they are about to get out */
    for (i = 0; i < lampsEls.length; i++) {
      lampsEls[i].animate([
        { transform: 'translate(0,0) rotate(0deg)' },
        { transform: 'translate(-2px,1px) rotate(-7deg)' },
        { transform: 'translate(2px,-1px) rotate(7deg)' },
        { transform: 'translate(-2px,0) rotate(-5deg)' },
        { transform: 'translate(0,0) rotate(0deg)' }
      ], { duration: 420, delay: t - 120, iterations: 2, easing: 'linear' });
    }
    setTimeout(function () { if (live()) sRattle(840); }, t - 120);
    t += 640;

    /* 2. each becomes a whole Maco and leaps out, one at a time */
    for (i = 0; i < lampsEls.length; i++) {
      flyOut(lampsEls[i], t + i * 130, { size: lampsEls[i].offsetWidth * 1.7 });
      sWhoosh((t + i * 130) / 1000, 0.9 + i * 0.06);
    }
    t += lampsEls.length * 130 + 260;

    /* 3. the hopper and the reels go the same way */
    setTimeout(function () {
      if (!live()) return;
      emptyHopper();
      sBurst();
      $('.window').classList.add('emptied');
    }, t - 200);

    var stock = hstock.children, cells = [], k;
    for (i = 0; i < strips.length; i++) {
      for (k = 0; k < ROWS; k++) {
        var cel = strips[i].children[(lastResult ? TRAIL : 0) + k];
        if (cel) cells.push(cel.querySelector('img'));
      }
    }
    for (i = 0; i < stock.length; i++) {
      flyOut(stock[i], t + i * 55, { size: stock[i].offsetWidth * 1.5, hide: false });
      if (i % 3 === 0) sWhoosh((t + i * 55) / 1000, 0.75 + (i % 5) * 0.09);
    }
    for (i = 0; i < cells.length; i++) {
      flyOut(cells[i], t + stock.length * 55 + i * 80,
             { size: cells[i].offsetWidth * 1.1, hide: false });
      sWhoosh((t + stock.length * 55 + i * 80) / 1000, 1.15 + i * 0.05);
    }
    var lastAt = t + stock.length * 55 + cells.length * 80;

    /* 3b. a beat of silence — the machine is empty and nothing moves */
    var lastAtPause = 420;

    /* 4. the last one does not leave — it grows to fill the window, then waves */
    setTimeout(function () {
      if (!live()) return;
      var wr = $('.window').getBoundingClientRect();
      var S = wr.height * 0.86;
      var el = document.createElement('img');
      el.className = 'bigmaco';
      el.src = BODY;
      el.style.width = el.style.height = S + 'px';
      el.style.left = (wr.left + wr.width / 2 - S / 2) + 'px';
      el.style.top = (wr.top + wr.height / 2 - S / 2) + 'px';
      root.appendChild(el);
      el.animate([
        { transform: 'translateY(70px) scale(.10) rotate(-16deg)', opacity: 0 },
        { transform: 'translateY(-14px) scale(1.16) rotate(6deg)', opacity: 1, offset: .5,
          easing: 'cubic-bezier(.2,1.5,.4,1)' },
        { transform: 'translateY(4px) scale(.97) rotate(-3deg)', opacity: 1, offset: .72 },
        { transform: 'translateY(0) scale(1) rotate(0deg)', opacity: 1 }
      ], { duration: 1050, easing: 'ease-out', fill: 'forwards' });
      /* and once he has landed, he waves */
      setTimeout(function () {
        el.animate([
          { transform: 'rotate(0deg)' }, { transform: 'rotate(-8deg)' },
          { transform: 'rotate(6deg)' },  { transform: 'rotate(-4deg)' },
          { transform: 'rotate(0deg)' }
        ], { duration: 900, iterations: 2, easing: 'ease-in-out' });
        sWave();
      }, 1100);
      sLand();
      lastMaco = el;                       // stays until the next pull
    }, lastAt + lastAtPause);

    /* 5. the result line is the Grand's own */
    setTimeout(function () {
      if (!live()) return;
      lamps = 0; drawLamps(); saveLamps();
      lastResult = { pattern: 'WILDFIRE', reels: lastResult ? lastResult.reels : [] };
      msg.className = 'msg jackpot';
      msg.innerHTML = '<b><img src="' + BODY + '" alt="">LUCKY MACO!</b>' +
        '<small>I&rsquo;ll bring you fortune all day</small>';
      sFanfare();
      fitLine();
      $('.share').classList.remove('off');
      $('.progress').classList.add('off');
      setTimeout(prepareCard, 90);
      celebrating = false;
      lever.classList.remove('busy');
    }, lastAt + lastAtPause + 1150);
  }

  function rainDown(src) {
    var layer = document.createElement('div');
    layer.className = 'wild';
    root.appendChild(layer);
    var faces = distinct(POOL.length), W = window.innerWidth, H = window.innerHeight;
    var n = Math.min(56, faces.length * 2);
    for (var i = 0; i < n; i++) {
      (function (i) {
        var el = document.createElement('img');
        el.src = src || ICON(faces[i % faces.length]);
        el.style.left = (Math.random() * (W - 52)).toFixed(0) + 'px';
        el.style.top = '-70px';
        layer.appendChild(el);
        var drift = (Math.random() - 0.5) * 160, turn = (Math.random() - 0.5) * 900;
        el.animate([
          { transform: 'translate(0,0) rotate(0deg)', opacity: 0 },
          { transform: 'translate(' + (drift * .3) + 'px,' + (H * .3) + 'px) rotate(' +
            (turn * .3) + 'deg)', opacity: 1, offset: .25 },
          { transform: 'translate(' + drift + 'px,' + (H + 120) + 'px) rotate(' +
            turn + 'deg)', opacity: 1 }
        ], { duration: 1900 + Math.random() * 1400,
             delay: i * 40 + Math.random() * 120,
             easing: 'cubic-bezier(.35,0,.7,.6)', fill: 'backwards' });
      })(i);
    }
    sFall();
    setTimeout(function () { layer.remove(); }, 4800);
  }

  /* Wins feed the meter. Filling it resets the lamps and sets the page alight. */
  /* Returns true when this win completed the meter. The caller then skips its own
     celebration entirely: a Wildfire replaces the Twins or Jackpot that triggered
     it rather than arriving on top of it and leaving the smaller message on
     screen afterwards. */
  function feedMeter(res) {
    lamps = Math.min(LAMPS, lamps + (res.pattern === 'TRIPLE' ? 3 : 2));
    drawLamps(); saveLamps();
    if (lamps < LAMPS) return false;
    setTimeout(wildfire, 520);                 // let the last lamp land first
    return true;
  }

  /* ── load-in ──────────────────────────────────────────────────────────────
     The machine starts empty and Macoji pour in, filling each column from the
     bottom up. Runs once, on open. Pure Web Animations on the cells that are
     already there — no canvas, no physics, no cost after it finishes. */
  var filled = false;
  /* The nine visible cells drop in from above the window, left to right, bottom
     row first. This is the machine's load-in, and a jackpot restock uses exactly
     the same one — the window should refill the way it first filled, not fade
     back on. */
  function dropCells() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches) return;
    /* TRAIL is where a strip rests, always — fillIn parks it there and every
       spin ends there. Deriving it from lastResult meant that on the very first
       load this animated cells 0-2 while the window was showing 26-28: the
       load-in never played, and the three cells it left on opacity:0 (fill:
       backwards) were a trap for anything that later parked the strip at 0. */
    var CELL = cellPx(), first = TRAIL, running = [];
    strips.forEach(function (strip, col) {
      for (var r = 0; r < ROWS; r++) {
        var el = strip.children[first + r];
        if (!el) continue;
        running.push(el.animate([
          { transform: 'translateY(-' + (CELL * 4.2) + 'px) rotate(-20deg)', opacity: 0 },
          { transform: 'translateY(0) rotate(0)', opacity: 1 }
        ], {
          duration: 560,
          delay: 300 + col * 90 + (ROWS - 1 - r) * 120,   // left to right, bottom row first
          easing: 'cubic-bezier(.34,1.5,.6,1)',
          fill: 'backwards'
        }));
      }
    });
    /* fill:'backwards' holds the cells at opacity 0 until the animation starts.
       If the clock never advances — a background tab at load, a throttled or
       missing Web Animations implementation — that hold is permanent and the
       window sits empty. Cancel anything still unfinished well past its end;
       the cells then show their resting style, which is simply visible. */
    setTimeout(function () {
      for (var i = 0; i < running.length; i++) {
        try { if (running[i].playState !== 'finished') running[i].cancel(); } catch (e) {}
      }
    }, 2200);
  }

  function fillIn() {
    filled = true;
    var CELL = cellPx();
    pourHopper();                                // the supply arrives first
    strips.forEach(function (strip) {
      strip.style.transition = 'none';
      strip.innerHTML = cells(STRIP);
      strip.style.transform = '';                 // CSS parks it; see .strip
    });
    dropCells();
  }

  /* ── the machine's mood ───────────────────────────────────────────────────
     A slot machine that only ever gives is a slot machine with no tension. This
     is the only way to lose a lamp, and it is built so that losing one is always
     something you chose:

       - it does not exist until the belly has something in it, so a new player
         never meets it and you can only ever risk what you earned
       - the warning runs for three seconds and ramps visibly, in two places at
         once: the top glass reddens, and one Macoji on the payline shakes
       - pulling anyway still spins and still pays; the lamp is the whole cost
       - it cannot chain, and it never interrupts a spin or a celebration

     CHARGED is the mirror of it — same machinery, opposite sign. */
  var MOOD_TICK = 3000;          // how often the machine considers its mood
  var CHARGED_MS = 4000;
  var mood = '', moodCells = [], moodUntil = 0, moodNext = 0, moodTimer = null;
  /* How many shake, and therefore how many you lose: the machine shows the price
     before you pay it. One rule for how often, one for how much, one for how
     long, and none of them overlap. */
  function atStake() {
    return lamps <= 0 ? 0 : lamps <= 3 ? 1 : lamps <= 6 ? 2 : 3;
  }
  function rnd(lo, hi) { return lo + Math.random() * (hi - lo); }

  function paylineCells() {
    var out = [];
    for (var i = 0; i < strips.length; i++) {
      var c = strips[i].children[AT];
      if (c) out.push(c);
    }
    return out;
  }
  function clearMood() {
    for (var i = 0; i < moodCells.length; i++) {
      moodCells[i].classList.remove('jitter', 'soft', 'bouncey');
    }
    moodCells = [];
    marquee.classList.remove('uneasy', 'charged');
    lever.classList.remove('cold');
    mood = '';
  }
  function setMood(next) {
    clearMood();
    mood = next;
    var cells = paylineCells(), i;
    if (next === 'uneasy') {
      var n = Math.min(atStake() || 1, cells.length);
      /* Shuffle so it is not always the same reels that get nervous. */
      for (i = cells.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1)), t = cells[i];
        cells[i] = cells[j]; cells[j] = t;
      }
      moodCells = cells.slice(0, n);
      marquee.classList.add('uneasy');
      lever.classList.add('cold');
      for (i = 0; i < moodCells.length; i++) moodCells[i].classList.add('jitter', 'soft');
      setTimeout(function () {                      // a tremble, then the real thing
        if (mood !== 'uneasy') return;
        for (var k = 0; k < moodCells.length; k++) moodCells[k].classList.remove('soft');
      }, 500);
      sUneasy();
      moodUntil = Date.now() + rnd(3000, 5000);     // never the same length twice
    } else {
      moodCells = [cells[Math.floor(Math.random() * cells.length)]].filter(Boolean);
      marquee.classList.add('charged');
      for (i = 0; i < moodCells.length; i++) moodCells[i].classList.add('bouncey');
      sCharged();
      moodUntil = Date.now() + CHARGED_MS;
    }
    var mine = moodUntil;
    setTimeout(function () { if (mood && moodUntil === mine) clearMood(); },
               moodUntil - Date.now());
    moodNext = moodUntil + rnd(8000, 25000);        // and never the same gap twice
  }

  /* Touching the lever at all is enough. You do not have to complete a pull —
     the machine is already shaking, and a nudge is what shakes them loose. */
  function shakeLoose() {
    if (mood !== 'uneasy') return 0;
    var cells = moodCells.slice(), n = cells.length;
    clearMood();
    restart(cab, 'judder', 'jackpot');
    buzz([35, 45, 35, 45, 110, 60, 200]);          // the machine coming apart
    sShakeLoose();
    for (var i = 0; i < cells.length; i++) {
      (function (c, d) { setTimeout(function () { dropOne(c); }, d); })(cells[i], i * 130);
    }
    var lost = Math.min(n, lamps);
    if (lost > 0) { lamps -= lost; drawLamps(); saveLamps(); }
    setTimeout(function () { toast(lostLine(lost), 2400); }, 620);
    return n;
  }
  function moodTick() {
    var now = Date.now();
    if (mood || spinning || granting || celebrating || now < moodNext) return;
    /* settle() clears `spinning` before it starts celebrating, so `spinning` on
       its own does not cover a jackpot's dump or the six seconds of a LUCKY
       MACO release. Worse, the belly is still full during a release, which is
       exactly when uneasy is most likely to fire — the top glass would turn red
       in the middle of the biggest thing the machine does. A celebration is
       recognisable by what it leaves on screen: a pile on the floor, dark
       reels, or Maco standing in the window. */
    if (dumpBox.children.length || lastMaco ||
        $('.window').classList.contains('emptied')) return;
    /* And not while nobody is looking — a widget sitting closed behind a button
       should not come back red. */
    if (!scrim.classList.contains('on')) return;
    /* Never in the seconds right after a result — being ambushed while you are
       still reading what happened is not a warning, it is a trap. */
    if (now - settledAt < 2000) return;
    /* Flat, because the severity already scales with the belly — charging the
       endgame twice, more often AND more expensive, is not a difficulty curve,
       it is a punishment. */
    if (lamps > 0 && Math.random() < CFG.uneasy) return setMood('uneasy');
    if (Math.random() < CFG.charged) setMood('charged');
  }
  var settledAt = 0;
  moodTimer = setInterval(moodTick, MOOD_TICK);

  /* Maco is an invariant plural everywhere else in the machine — "light up all
     Maco", "every Maco set loose" — so it stays one here too. */
  function lostLine(n) {
    var head = n >= 3 ? 'All 3 escaped!'
             : n === 2 ? '2 Maco escaped!'
             : '1 Maco escaped!';
    return '<b>' + LOSTMACO + head + '</b>';
  }

  /* One Macoji shaken loose: it falls out of its cell, down past the machine and
     off the page, and takes a lamp with it. */
  function dropOne(cell) {
    var img = cell && cell.querySelector('img');
    if (!img) return;
    var r = img.getBoundingClientRect(), size = r.width || 40;
    var el = document.createElement('img');
    el.className = 'bigmaco';
    el.src = img.src;
    el.style.width = el.style.height = size + 'px';
    el.style.left = r.left + 'px';
    el.style.top = r.top + 'px';
    root.appendChild(el);
    img.style.visibility = 'hidden';
    setTimeout(function () { img.style.visibility = ''; }, 900);
    var drift = (Math.random() - 0.5) * 120;
    el.animate([
      { transform: 'translate(0,0) rotate(0)', opacity: 1 },
      { transform: 'translate(' + (drift / 2) + 'px,' + (window.innerHeight * 0.45) +
        'px) rotate(' + (drift > 0 ? 180 : -180) + 'deg)', opacity: 1, offset: .55 },
      { transform: 'translate(' + drift + 'px,' + (window.innerHeight + 120) +
        'px) rotate(' + (drift > 0 ? 420 : -420) + 'deg)', opacity: .85 }
    ], { duration: 1100, easing: 'cubic-bezier(.55,.06,.68,.19)', fill: 'forwards' });
    setTimeout(function () { el.remove(); }, 1300);
  }

  /* ── spin ─────────────────────────────────────────────────────────────── */
  var celebrating = false;
  function spin(force) {
    if (spinning || granting || celebrating) return;
    pulledOnce = true; lever.classList.remove('hint');
    spinning = true;
    lever.classList.add('busy');
    $('.share').classList.add('off');
    $('.progress').classList.remove('off');
    if (lastMaco) { lastMaco.remove(); lastMaco = null; }
    marquee.classList.add('fast');               // lights race while reels run
    $('.window').classList.add('live');
    idleShowing = false;                         // a result replaces the prompt
    var reloading = dumpBox.children.length > 0 ||
                    $('.window').classList.contains('emptied');
    restock();                                   // sweep the floor, reload the machine
    /* A click, the space bar, a shake, the API — none of them drag the arm, so
       the nudge handler never sees them. They pay here instead. */
    var pulledInto = mood;
    shakeLoose();
    clearMood();
    sClunk(); hPull();
    var res = draw(force);
    msg.className = 'msg';
    msg.innerHTML = '<b>&nbsp;</b><small>&nbsp;</small>';

    /* Weighted so the slowdown is visible, and spaced so each reel landing is its
       own beat: ~1s between stop 1 and 2, ~1.1s between 2 and 3. Bunched-up stops
       read as one event rather than three. */
    var dur = [1600, 2650, res.tease ? 5000 : 3700];   // reel 3 crawls on a near-miss
    /* Pulled while the machine was charged: it runs long, and the whole reading
       gets its anticipation back. */
    var boost = pulledInto === 'charged' ? 2 : 1;
    for (var d = 0; d < 3; d++) dur[d] = Math.round(dur[d] * CFG.spinSpeed * boost);
    stopSpinSound();
    sSpin(dur[2]);
    var CELL = cellPx(), done = 0;
    strips.forEach(function (strip, i) {
      strip.style.transition = 'none';
      strip.style.transform = 'translateY(0)';
      strip.innerHTML = cells(STRIP, res.reels[i], AT);
      void strip.offsetHeight;                          // force reflow
      var lead = reloading ? 980 : 0;           // let the machine restock first
      setTimeout(function () {
        strip.style.transition = 'transform ' + dur[i] + 'ms cubic-bezier(.5,.2,.25,1)';
        strip.style.transform = 'translateY(-' + (TRAIL * CELL) + 'px)';
      }, lead);
      var myGen = gen;
      setTimeout(function () {
        if (myGen !== gen) return;              // a reset happened mid-spin
        sStop(); hStop(); if (++done === 3) settle(res);
      }, lead + dur[i] + 60);
    });
  }

  /* Reels read out the Macoji's own name, title-cased: "sweat-smile" -> "Sweat Smile" */
  function label(n) {
    return String(n).split('-').map(function (part) {
      return part.charAt(0).toUpperCase() + part.slice(1);
    }).join(' ');
  }

  /* "Star Struck -> Sweat Smile -> Heart Eyes" is far wider than the cabinet at
     19px. Rather than wrap to two lines or clip it, shrink the type just enough
     to fit — measured, so short readings stay full size. */
  /* Offer shake only on a touch device that has actually delivered motion data
     and granted permission. Any one of those on its own is misleading: desktop
     Chrome fires devicemotion on Macs, and the API exists where it never works. */
  var idleShowing = true;
  function canShake() { return COARSE && motionSeen && shakeState === 'granted'; }
  function idlePrompt() {
    return '<b>' + (canShake() ? 'Shake or pull the lever' : 'Pull the lever') + '</b>' +
      '<small>let&rsquo;s see your ' + today() + '</small>';
  }
  function refreshIdle() {
    if (!idleShowing) return;
    msg.className = 'msg';
    msg.innerHTML = idlePrompt();
    fitLine();
  }

  function fitLine() {
    var b = msg.querySelector('b');
    if (!b) return;
    b.style.fontSize = '';
    var room = msg.clientWidth - 8;
    if (!room) return;
    /* Loop rather than compute once: letter-spacing and rounding mean the first
       estimate lands a few px over. Four passes is plenty. */
    for (var i = 0; i < 4 && b.scrollWidth > room; i++) {
      var cur = parseFloat(window.getComputedStyle(b).fontSize) || 19;
      if (cur <= 11) break;
      b.style.fontSize = Math.max(11, cur * room / b.scrollWidth * 0.98).toFixed(1) + 'px';
    }
  }

  function settle(res) {
    spinning = false;
    settledAt = Date.now();
    /* The spin animated to the same place CSS parks it, so drop the inline
       value — otherwise it is a stale pixel number until the next pull. */
    setTimeout(function () {
      if (spinning) return;
      for (var i = 0; i < strips.length; i++) {
        strips[i].style.transition = 'none';
        strips[i].style.transform = '';
      }
    }, 90);
    lastResult = res;
    stopSpinSound();
    lever.classList.remove('busy');
    $('.share').classList.remove('off');         // there is now something to share
    $('.progress').classList.add('off');
    setTimeout(prepareCard, 60);                 // ready before the button is pressed
    marquee.classList.remove('fast');
    $('.window').classList.remove('live');
    var r = res.reels;
    /* A win that completes the meter is a Wildfire, not a Twins that happens to
       be followed by one. Feeding the meter first means the smaller message is
       never written, so it cannot be left on screen afterwards. */
    /* Count the run before anything else claims the turn: a win spends the luck
       and re-arms the ways to get it back, a loss brings the third dry pull that
       much closer. */
    if (res.pattern === 'TRIPLE' || res.pattern === 'PAIR') {
      dryRun = 0;
      if (!unlocked) {
        if (luckLevel > 0) { setLuck(luckLevel - 1); setTimeout(sLuckDown, 900); }
        rearm();
      }
    } else if (++dryRun >= 3) {
      /* after the result has landed, so he is answering it rather than talking
         over it */
      setTimeout(function () {
        if (grantLuck('Let me give you more luck!', 'streak')) dryRun = 0;
      }, 900);
    }
    if ((res.pattern === 'TRIPLE' || res.pattern === 'PAIR') && feedMeter(res)) return;
    if (res.pattern === 'TRIPLE') {
      msg.className = 'msg jackpot';
      /* All three winners, cheering in sequence. */
      var win = '<img src="' + ICON(r[0]) + '" alt="">';
      msg.innerHTML = '<b>' + win + win + win + 'JACKPOT!</b><small>Triple ' +
        label(r[0]) + ' &mdash; all of ' + today() + ' is yours</small>';
      celebrateNow();
    } else if (res.pattern === 'PAIR') {
      var dbl = r[0] === r[1] ? r[0] : r[2];
      msg.className = 'msg win';
      /* Show the actual twins, twice, rather than a generic Maco — the message
         then depicts the thing it is announcing. */
      var twin = '<img src="' + ICON(dbl) + '" alt="">';
      msg.innerHTML = '<b>' + twin + twin + 'Twins!</b><small>Double ' +
        label(dbl) + ' kind of ' + today() + '</small>';
      celebrateSmallNow(res);
    } else {
      msg.className = 'msg';
      msg.innerHTML = '<b>' + label(r[0]) + ' &rarr; ' + label(r[1]) + ' &rarr; ' + label(r[2]) + '</b>' +
        '<small>That&rsquo;s your ' + today() + ', morning to evening</small>';
    }
    fitLine();
  }

  /* Re-trigger a CSS animation. `drop` clears rival classes first: .cab.nudge is
     declared after .cab.jackpot, so a leftover nudge would win the cascade and a
     jackpot following a pair would play the small shake. */
  function restart(el, cls, drop) {
    if (drop) el.classList.remove(drop);
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  }
  /* The top glass has one lamp and one owner. Left to themselves the classes
     pile up — a tap during a jackpot would run two animations on the same
     opacity — so every response clears the others first and hands the class
     back when it is done. */
  var LAMPCLS = ['lit1', 'lit2', 'litJ', 'litG'], lampTimer = 0;
  function mqLamp(cls, ms) {
    clearTimeout(lampTimer);
    for (var i = 0; i < LAMPCLS.length; i++) marquee.classList.remove(LAMPCLS[i]);
    void marquee.offsetWidth;
    marquee.classList.add(cls);
    lampTimer = setTimeout(function () { marquee.classList.remove(cls); }, ms);
  }
  function pulse(indexes, cls) {                  // mark the cells that won
    indexes.forEach(function (i) {
      var c = strips[i].children[AT];
      if (c) c.classList.add(cls);
    });
  }
  function matchedIndexes(reels) {               // which reels hold the repeated face
    var counts = {}, i;
    for (i = 0; i < reels.length; i++) counts[reels[i]] = (counts[reels[i]] || 0) + 1;
    var out = [];
    for (i = 0; i < reels.length; i++) if (counts[reels[i]] > 1) out.push(i);
    return out;
  }

  /* Two tiers, same vocabulary — cabinet moves, pay row glows, marquee lights,
     Macoji fall. A jackpot does all of it loudly; a pair does a small version. */
  /* Jackpot escapes the reel window — the whole cabinet celebrates and it rains
     Macoji. That shower is the jackpot's signature and appears nowhere else. */
  function celebrateNow() {
    marquee.classList.add('allon');              // every bulb, alternating
    setTimeout(function () { marquee.classList.remove('allon'); }, 2200);
    mqLamp('litJ', 2100);                        // top glass strobes
    restart(cab, 'jackpot');
    restart(marquee, 'flash');
    restart($('.glare'), 'on');
    pulse([0, 1, 2], 'won');
    /* Everything the machine is holding comes out: the hopper's stock plus the
       nine on the reels. That is the whole set of 28, which is also exactly what
       it takes to fill the window. */
    $('.window').classList.add('emptied');       // the reels fall too
    sJack(); sFall(); hJack();
    dump(distinct(POOL.length), true);           // the whole set, one of each
    setTimeout(function () { marquee.classList.remove('flash'); }, 2100);
  }

  /* A pair stays inside the window: payline lights, the two matching Macoji
     wiggle. No shake, no strobe, nothing falls. */
  function celebrateSmallNow(res) {
    marquee.classList.add('allon');
    setTimeout(function () { marquee.classList.remove('allon'); }, 700);
    mqLamp('lit2', 1150);                        // two soft pulses overhead
    var band = $('.band');
    restart(band, 'lit');
    pulse(matchedIndexes(res.reels), 'pairwin');
    sWin(); hPair();
    setTimeout(function () { band.classList.remove('lit'); }, 1500);
  }


  /* ── lever: drag down, spring back ────────────────────────────────────── */
  var dragging = false, y0 = 0, pulled = 0;
  /* FIRE was 62px, which meant a deliberate long drag — a tap or a short tug did
     nothing at all and read as the lever being broken. Now: a short pull fires, a
     quick flick fires, and a plain click fires. */
  var MAX = 110, FIRE = 22, DOWN = 58, SHRINK = 0.42;
  var TAP = 6, FLICK = 0.9;                    // px of slop for a click, px/ms for a flick
  function setArm(deg) {
    var k = deg / DOWN, sy = 1 - SHRINK * k;
    arm.style.transform = 'rotate(' + deg + 'deg) scaleY(' + sy + ')';
    knob.style.transform = 'scaleY(' + (1 / sy) + ')';   // keep the ball round
  }

  var t0 = 0, moved = 0, pulledOnce = false;
  /* Only where a pointer can hover — a finger already knows to grab it, and on a
     phone a bobbing arm just looks like a fault. Stops for good once you have
     worked it once. */
  if (window.matchMedia && window.matchMedia('(hover:hover)').matches) {
    setTimeout(function hint() {
      if (!pulledOnce) { lever.classList.add('hint'); setTimeout(hint, 9000); }
    }, 3500);
  }
  lever.addEventListener('pointerdown', function (e) {
    if (spinning) return;
    dragging = true; y0 = e.clientY; pulled = 0; moved = 0; t0 = Date.now();
    lever.classList.add('dragging');
    lever.classList.remove('hint');
    pulledOnce = true;
    arm.style.transition = 'none';
    try { lever.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });
  lever.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var dy = e.clientY - y0;
    moved = Math.max(moved, Math.abs(dy));
    pulled = Math.max(0, Math.min(MAX, dy));
    setArm((pulled / MAX) * DOWN);
    if (pulled > 4) shakeLoose();               // a nudge is enough while it shakes
    var armed = pulled >= FIRE;
    if (armed !== lever.classList.contains('ready')) {
      lever.classList.toggle('ready', armed);
      if (armed) noise(0.02, 0.14, 1900, 7);      // the detent you can hear
    }
  });
  function release() {
    if (!dragging) return;
    dragging = false;
    lever.classList.remove('dragging');
    lever.classList.remove('ready');
    arm.style.transition = 'transform .6s cubic-bezier(.34,1.8,.5,1)';   // the bounce back
    var ms = Math.max(1, Date.now() - t0);
    var fires = pulled >= FIRE                     // pulled far enough
             || (pulled / ms) > FLICK              // flicked down fast
             || moved < TAP;                       // just clicked it
    if (fires) { setArm(DOWN); setTimeout(function () { setArm(0); }, 130); spin(); }
    else setArm(0);
  }
  lever.addEventListener('pointerup', release);
  lever.addEventListener('pointercancel', release);

  function yank(force) {                  // programmatic pull — space / shake / API
    if (spinning) return;
    arm.style.transition = 'transform .16s ease-in';
    setArm(DOWN);
    setTimeout(function () {
      arm.style.transition = 'transform .6s cubic-bezier(.34,1.8,.5,1)';
      setArm(0);
    }, 170);
    spin(force);
  }

  /* ── shake to pull (mobile) ───────────────────────────────────────────────
     Three separate things can stop this working — no sensor, permission not
     granted, or shaking too gently — and they look identical from the outside.
     So we track which one it is and surface it in the settings sheet. */
  var lastShake = 0, listening = false, peakMag = 0, motionSeen = false;
  var shakeState =
      typeof DeviceMotionEvent === 'undefined' ? 'unsupported'
    : typeof DeviceMotionEvent.requestPermission === 'function' ? 'ask'
    : 'ready';

  /* Absolute magnitude was the wrong signal: accelerationIncludingGravity reads
     ~9.8 on a phone lying still, so the threshold had to clear gravity before it
     measured anything, and simply carrying the phone could cross it. We track the
     CHANGE between readings instead — a still phone reads ~0 whatever its
     orientation, and only real movement registers. */
  var lastMag = null;
  function onMotion(e) {
    var a = e.accelerationIncludingGravity;
    if (!a) return;
    if (!motionSeen) { motionSeen = true; refreshIdle(); }
    var mag = Math.sqrt((a.x || 0) * (a.x || 0) + (a.y || 0) * (a.y || 0) + (a.z || 0) * (a.z || 0));
    if (lastMag === null) { lastMag = mag; return; }
    var delta = Math.abs(mag - lastMag);
    lastMag = mag;
    if (delta > peakMag) peakMag = delta;
    var now = Date.now();
    if (delta > CFG.shakeForce && now - lastShake > 1200 && scrim.classList.contains('on')) {
      lastShake = now; hShake(); yank();
    }
  }
  function listen() {
    if (listening) return;
    listening = true;
    window.addEventListener('devicemotion', onMotion);
  }
  /* Must be called straight out of a real tap — iOS rejects it otherwise. */
  function enableShake(done) {
    if (!CFG.shake) { shakeState = 'off'; if (done) done(); return; }
    if (shakeState === 'unsupported') { if (done) done(); return; }
    if (shakeState === 'ready' || shakeState === 'granted') {
      shakeState = 'granted'; listen(); if (done) done(); return;
    }
    DeviceMotionEvent.requestPermission().then(function (r) {
      shakeState = r === 'granted' ? 'granted' : 'denied';
      if (r === 'granted') listen();
      if (done) done();
    })['catch'](function () { shakeState = 'denied'; if (done) done(); });
  }
  /* Only iOS needs a gesture before it will hand over motion data. Everywhere
     else, start listening straight away so the prompt can offer shake without
     making you tap the screen first to discover it. */
  function armShakeEarly() { if (shakeState === 'ready') enableShake(); }

  var SHAKE_LABEL = {
    unsupported: 'Not supported on this device',
    off:         'Turned off',
    ask:         'Tap Enable below',
    denied:      'Blocked \u2014 see below',
    ready:       'On',
    granted:     'On'
  };
  armShakeEarly();          // must run after shakeState is assigned, not before

  /* ── open / close ─────────────────────────────────────────────────────── */
  var shakeAsked = false;
  function open() {
    scrim.classList.add('on');
    if (!filled) fillIn();
    if (!shakeAsked) { shakeAsked = true; enableShake(); }
  }
  function close() { scrim.classList.remove('on'); }

  /* Theme toggle — needed in BOTH page and widget mode, so it lives outside
     the mode branch. Hidden entirely when the host pinned data-theme. */
  /* ── settings sheet ───────────────────────────────────────────────────── */
  var EMBED_SRC = 'https://lucky.mcai.dev/luckymaco.js';
  var sheet = $('.sheet'), sheetTick = null;
  var SHOWN = ['triple', 'twins', 'rows', 'stock', 'packing', 'spinSpeed', 'position', 'shake', 'shakeForce', 'haptics', 'set', 'mode'];

  function embedCode() {
    var lines = ['<script src="' + EMBED_SRC + '"'];
    SHOWN.forEach(function (k) {
      if (CFG[k] === DEFAULTS[k] || CFG[k] == null) return;
      var attr = 'data-' + k.replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); });
      lines.push('        ' + attr + '="' + CFG[k] + '"');
    });
    var t = host.getAttribute('data-theme');
    if (CFG.theme !== 'auto') lines.push('        data-theme="' + t + '"');
    if (!sound) lines.push('        data-sound="false"');
    lines.push('        defer><' + '/script>');
    return lines.join('\n');
  }
  function esc(x) { return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  function buildSheet() {
    var pct = function (v) { return (v * 100).toFixed(0) + '%'; };
    /* In Player Mode the sheet reports; in Operator Mode it edits. */
    var op = unlocked;
    var step = function (k, d, val) {
      return op ? '<span class="stepcell">' +
        '<button class="step" data-k="' + k + '" data-d="' + (-d) + '">&minus;</button>' +
        '<b>' + val + '</b>' +
        '<button class="step" data-k="' + k + '" data-d="' + d + '">+</button></span>'
        : val;
    };
    sheet.querySelector('.sbody').innerHTML =
      '<div class="modebar ' + (op ? 'open' : 'locked') + '">' +
        (op ? LOCK_OPEN : LOCK_SHUT) +
        '<span>' + (op ? 'Game Changer Mode' : 'Player Mode') + '</span></div>' +
      /* These three rows are the odds you SET. Luck multiplies them, so once the
         bar is up they are no longer what the machine is doing — and because
         Game Changer charges the bar to the top on entry, that was true every
         single time anyone read this table. The live figure now sits beside the
         base one whenever the two differ. */
      (function () {
        var k = luckMult(), o = odds(), live = k > 1.0001;
        var now = function (v) {
          return live ? ' <span class="now">' + pct(v) + '</span>' : '';
        };
        var capped = k < 1 + luckLevel - 0.0001;
        return '<h3>Odds' + (live
            ? '<span class="hnote">now &times;' + (Math.round(k * 100) / 100) + '</span>' : '') +
          '</h3><table>' +
          '<tr><td>Jackpot &mdash; 3 identical</td><td>' +
            step('triple', 0.01, pct(CFG.triple)) + now(o.triple) + '</td></tr>' +
          '<tr><td>Twins &mdash; 2 identical</td><td>' +
            step('twins', 0.01, pct(CFG.twins)) + now(o.twins) + '</td></tr>' +
          '<tr><td>No match</td><td>' + pct(1 - CFG.triple - CFG.twins) +
            now(1 - o.triple - o.twins) + '</td></tr>' +
          '</table>' +
          (capped
            ? '<p class="note">The bar reads &times;' + (1 + luckLevel) +
              ', but Jackpot and Twins already add up to ' +
              pct(CFG.triple + CFG.twins) + ', so the machine can only go to &times;' +
              (Math.round(k * 100) / 100) + ' before there is nothing left to win from.</p>'
            : '');
      })() +
      /* Two rates and, more usefully, what they actually come to — a percent per
         three seconds per lamp means nothing until it is a wait in seconds. */
      '<h3>Mood</h3><table>' +
        '<tr><td>Uneasy &mdash; per lit Maco</td><td>' +
          step('uneasy', 0.005, (CFG.uneasy * 100).toFixed(1) + '%') + '</td></tr>' +
        '<tr><td>Charged</td><td>' +
          step('charged', 0.01, (CFG.charged * 100).toFixed(0) + '%') + '</td></tr>' +
        '<tr><td>Uneasy at ' + LAMPS + ' lit</td><td>' +
          (CFG.uneasy > 0 ? 'about every ' +
            Math.round(3 / (CFG.uneasy * LAMPS)) + 's' : 'off') + '</td></tr>' +
        '<tr><td>Charged</td><td>' +
          (CFG.charged > 0 ? 'about every ' +
            Math.round(3 / CFG.charged) + 's' : 'off') + '</td></tr>' +
      '</table>' +
      '<h3>Machine</h3><table>' +
        '<tr><td>Macoji in play</td><td>' + POOL.length + '</td></tr>' +
        '<tr><td>Rows</td><td>' + CFG.rows + '</td></tr>' +
        '<tr><td>Macoji in hopper</td><td>' + step('stock', 1, CFG.stock) + '</td></tr>' +
        '<tr><td>Heap packing</td><td>' +
          step('packing', 0.1, CFG.packing.toFixed(1)) + '</td></tr>' +
        '<tr><td>Reel stops at</td><td>' +
          [1.6, 2.65, 3.7].map(function (v) { return (v * CFG.spinSpeed).toFixed(1); }).join('s / ') +
          's</td></tr>' +
        '<tr><td>Theme</td><td>' + host.getAttribute('data-theme') +
          (CFG.theme === 'auto' ? ' (auto)' : '') + '</td></tr>' +
        '<tr><td>Sound</td><td>' + (sound ? 'On' : 'Off') + '</td></tr>' +
        '<tr><td>Shake to pull</td><td>' + SHAKE_LABEL[shakeState] + '</td></tr>' +
        '<tr><td>Vibration</td><td>' + (!CFG.haptics ? 'Turned off'
          : !canBuzz ? 'Not supported here'
          : buzzWorked === false ? 'Blocked by browser'
          : buzzWorked === true ? 'Working' : 'Ready') + '</td></tr>' +
        '<tr><td>Shake needed<br><span style="opacity:.7;font-size:11px">' +
          'higher = less sensitive</span></td><td>' +
          step('shakeForce', 3, CFG.shakeForce) + '<br>' +
          '<span style="font-weight:400;opacity:.7;font-size:11px">peak ' +
          '<span class="peak">' + (motionSeen ? peakMag.toFixed(1) : '\u2013') +
          '</span></span></td></tr>' +
      '</table>' +
      (shakeState === 'ask' || shakeState === 'denied'
        ? '<div class="row" style="margin-bottom:14px">' +
          '<button class="shakebtn primary">Enable shake</button></div>' +
          (shakeState === 'denied'
            ? '<p style="margin:-6px 0 14px;font-size:11.5px;color:var(--mut)">' +
              'If nothing happens, iOS has remembered a refusal. Settings &rarr; Apps &rarr; ' +
              'Safari &rarr; Motion &amp; Orientation Access, then reload.</p>' : '')
        : '') +
      '<h3>Add to your page</h3>' +
      '<pre class="snip" title="Click to copy">' + esc(embedCode()) +
      '<span class="cpy"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/>' +
      '<path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg></span>' +
      '<span class="done-badge">Copied</span></pre>';
    var snip = sheet.querySelector('.snip');
    snip.addEventListener('click', function (e) {
      e.stopPropagation();
      var badge = snip.querySelector('.done-badge');
      var write = navigator.clipboard && navigator.clipboard.writeText
        ? navigator.clipboard.writeText(embedCode())
        : Promise.reject();
      write.then(function () { badge.textContent = 'Copied'; })
           .catch(function () { badge.textContent = 'Select and copy'; });
      badge.classList.add('on');
      setTimeout(function () { badge.classList.remove('on'); }, 1500);
    });
    sheet.querySelectorAll('.step').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var k = b.dataset.k || 'shakeForce', d = parseFloat(b.dataset.d);
        var lo = RANGE[k][0], hi = RANGE[k][1];
        /* Snap to the grid this button steps on, not to one decimal place. At a
           step of 0.01 the old rounding turned 5% + 1% into 10% and 5% - 1%
           into zero — the odds buttons had never worked. */
        var step = Math.abs(d) || 1;
        var v = Math.max(lo, Math.min(hi, Math.round((CFG[k] + d) / step) * step));
        v = Math.round(v * 1000) / 1000;         // float dust
        var was = CFG[k];
        CFG[k] = v;
        /* Undo rather than save a split that does not add up. */
        if ((k === 'triple' || k === 'twins') && CFG.triple + CFG.twins > 0.95) CFG[k] = was;
        if (PERSIST[k]) {
          try { localStorage.setItem('luckymaco:' + k, String(CFG[k])); } catch (err) {}
        }
        if (k === 'packing' || k === 'stock') {
          fillHopper(); pourHopper();            // re-heap so you can see it at once
        }
        if (k === 'shakeForce') peakMag = 0;
        buildSheet();
      });
    });
    var sb = sheet.querySelector('.shakebtn');
    if (sb) sb.addEventListener('click', function (e) {
      e.stopPropagation();
      peakMag = 0;
      enableShake(function () { buildSheet(); });   // redraw with the verdict
    });
    /* Live peak while the sheet is open: if this number moves, motion events are
       arriving and it is purely a matter of shaking harder. If it never moves,
       the problem is permission, not strength. */
    if (sheetTick) clearInterval(sheetTick);
    sheetTick = setInterval(function () {
      var el = sheet.querySelector('.peak');
      if (!el || !sheet.classList.contains('on')) { clearInterval(sheetTick); sheetTick = null; return; }
      el.textContent = motionSeen ? peakMag.toFixed(1) : '\u2013';
    }, 200);
  }

  var cog = $('.cog');
  cog.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/>' +
    '<path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1' +
    'a2 2 0 1 1-4 0 1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 15' +
    'a2 2 0 1 1 0-4 1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9 4.6' +
    'a2 2 0 1 1 4 0A1.6 1.6 0 0 0 15.7 5.7l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.6 1.6 0 0 0 19.4 11' +
    'a2 2 0 1 1 0 4z"/></svg>';
  sheet.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.shut')) {
      e.stopPropagation(); sheet.classList.remove('on');
    }
  });
  cog.addEventListener('click', function (e) {
    e.stopPropagation();
    if (sheet.classList.contains('on')) { sheet.classList.remove('on'); return; }
    buildSheet(); sheet.classList.add('on');
  });

  /* ── reset ──────────────────────────────────────────────────────────────
     Everything the machine remembers, back to the box: the meter, the luck it
     has been given, what has been earned, Game Changer, sound and theme. It
     also stops whatever is mid-flight — a reset during the LUCKY MACO release
     would otherwise leave sprites sailing up an empty page and timers landing
     on a machine that no longer matches them. */
  var rst = $('.rst');
  rst.innerHTML = '<svg viewBox="0 0 24 24">' +
    '<path d="M3 12a9 9 0 1 0 2.6-6.4"/><path d="M3 4v5h5"/></svg>';
  rst.addEventListener('click', function (e) {
    e.stopPropagation();
    resetAll();
  });

  function resetAll() {
    /* 1. stop the show */
    gen++;                             // everything in flight is now stale
    clearMood(); moodNext = Date.now() + 12000;   // a beat of calm after a reset
    if (flashTimer) { clearTimeout(flashTimer); flashTimer = null; }
    $('.toast').classList.remove('on');
    var junk = root.querySelectorAll('.bigmaco, .wild');
    for (var j = 0; j < junk.length; j++) junk[j].remove();
    lastMaco = null;
    granting = false;
    spinning = false;
    celebrating = false;
    lever.classList.remove('busy');
    marquee.classList.remove('fast', 'allon', 'lit1', 'lit2', 'litJ', 'litG');
    $('.window').classList.remove('live', 'emptied');
    sheet.classList.remove('on');
    stopSpinSound();

    /* 2. forget everything */
    try {
      localStorage.removeItem('luckymaco:lamps');
      localStorage.removeItem('luckymaco:sound');
      localStorage.removeItem(STORE);
      for (var pk in RANGE) localStorage.removeItem('luckymaco:' + pk);
    } catch (err) {}
    try { sessionStorage.removeItem('luckymaco:test'); } catch (err) {}

    /* 3. back to the defaults it shipped with — every tunable, not a hand-kept
       list of three that fell behind the moment the odds became editable */
    for (var ck in RANGE) CFG[ck] = DEFAULTS[ck];
    peakMag = 0;
    sound = true; paintSound();
    if (!THEME_PINNED) { CFG.theme = 'auto'; applyTheme(); paintToggle(); }
    setTest(false);                    // locks the deck and re-arms the streak
    setLuck(0, true);                  // and the luck itself, however it was earned
    dryRun = 0;
    lamps = 0; drawLamps(); saveLamps();
    lastResult = null;
    clearDrops();
    fillHopper(); pourHopper();
    hopper.classList.remove('open');
    fillIn();
    msg.className = 'msg';
    idleShowing = true;
    msg.innerHTML = idlePrompt();          // the same opening line, not a copy of it
    fitLine();
    $('.share').classList.add('off');
    sharePitch();
    toast('<b><img class="tmaco" src="' + BODY + '" alt="">All Reset</b>', 2400);
    sReset();
  }

  var tog = $('.tog');
  var SUN  = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2"/>' +
             '<path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2' +
             'M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var MOON = '<svg viewBox="0 0 24 24"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.7 6.7 0 0 0 10.5 10.5z"/></svg>';
  function paintToggle() {
    var dark = host.getAttribute('data-theme') === 'dark';
    tog.innerHTML = dark ? SUN : MOON;               // show what you'd switch TO
    tog.setAttribute('aria-label', dark ? 'Switch to light' : 'Switch to dark');
  }
  if (THEME_PINNED) tog.hidden = true; else paintToggle();

  var snd = $('.snd');
  var SPK = '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/>' +
            '<path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
  var MUTE = '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/>' +
             '<path d="M17 9.5l4 5M21 9.5l-4 5"/></svg>';
  function paintSound() {
    snd.innerHTML = sound ? SPK : MUTE;
    snd.classList.toggle('off', !sound);
    snd.setAttribute('aria-label', sound ? 'Mute' : 'Unmute');
    snd.setAttribute('aria-pressed', String(!sound));
  }
  var savedSnd = null;
  try { savedSnd = localStorage.getItem('luckymaco:sound'); } catch (e) {}
  if (savedSnd === '0') sound = false;
  paintSound();
  snd.addEventListener('click', function (e) {
    e.stopPropagation();
    sound = !sound;
    try { localStorage.setItem('luckymaco:sound', sound ? '1' : '0'); } catch (err) {}
    paintSound();
    if (sound) sStop();                       // a tick so you hear it come back
  });
  tog.addEventListener('click', function (e) {
    e.stopPropagation();
    var next = host.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    CFG.theme = next; applyTheme(); remember(next); paintToggle();
  });

  /* ── hidden outcome panel ─────────────────────────────────────────────────
     Game Changer, the way a real cabinet works: whoever opens it can reach the
     payout settings, players cannot. Triple-click the Master Concept mark to enter, triple-click to
     leave. 900ms window, so it takes a genuine triple-click rhythm rather than
     three idle taps. Session-scoped, so it can never linger into a demo. */
  var TAPS = 3, TAP_WINDOW = 900, toggledAt = 0;
  var unlocked = false;                       // Game Changer, the one source of truth
  var taps = 0, tapAt = 0;
  var marquee, mark;

  /* One pair of padlocks, shared by the mode toast and the sheet's badge, so the
     two always agree. */
  var LOSTMACO = '<img class="tmaco" style="filter:grayscale(1) brightness(1.3)" ' +
                 'src="' + FACE + '" alt="">';
  var LOCK_OPEN = '<svg viewBox="0 0 24 24"><rect x="4" y="11" width="16" height="10" rx="2"/>' +
        '<path d="M8 11V7a4 4 0 0 1 7.5-2"/></svg>';
  var LOCK_SHUT = '<svg viewBox="0 0 24 24"><rect x="4" y="11" width="16" height="10" rx="2"/>' +
        '<path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

  var flashTimer = null;
  /* Centred on the page and floating over everything, so it never touches the
     result text and cannot be clobbered by a spin. */
  function toast(html, ms) {
    var t = $('.toast');
    if (flashTimer) clearTimeout(flashTimer);
    t.querySelector('.card').innerHTML = html;
    t.classList.add('on');
    flashTimer = setTimeout(function () {
      flashTimer = null;
      t.classList.remove('on');
    }, ms || 2400);
  }

  function setTest(on) {
    unlocked = on;
    marquee.classList.toggle('armed', on);      // dashed ring = armed, at a glance
    try { on ? sessionStorage.setItem('luckymaco:test', '1')
             : sessionStorage.removeItem('luckymaco:test'); } catch (e) {}
    /* One line. The breathing cog says where to go next, so the second line was
       telling you something the interface already shows. */
    $('.cog').classList.toggle('unlocked', on);
    luck.classList.toggle('locked', !on);       // the switch is there either way
    setLuck(on ? TOP : 0, true);                // unlocked arrives charged, locked empty
    if (!on) rearm(); else sharePitch();        // Game Changer has nothing to earn
    toast(on ? '<b>' + LOCK_OPEN + 'You&rsquo;re the Game Changer</b>'
             : '<b>' + LOCK_SHUT + 'Machine Settings Locked</b>', on ? 2800 : 2200);
    if (on) {
      tone(880, 0.09, 'square', 0.10);
      setTimeout(function () { tone(1320, 0.12, 'square', 0.10); }, 90);
    } else { tone(440, 0.10, 'square', 0.08); }
  }
  marquee = $('.marquee'); mark = $('.marquee img');

  /* Bulbs around the marquee's perimeter, delayed in sequence so the light runs
     around it. Opacity and box-shadow only, so it stays on the compositor. */
  (function bulbs() {
    var NX = 9, NY = 2, spots = [], i, t, frag = '';
    for (i = 0; i < NX; i++) spots.push([(i + 0.5) / NX * 100, 0]);
    for (i = 0; i < NY; i++) spots.push([100, (i + 0.5) / NY * 100]);
    for (i = NX - 1; i >= 0; i--) spots.push([(i + 0.5) / NX * 100, 100]);
    for (i = NY - 1; i >= 0; i--) spots.push([0, (i + 0.5) / NY * 100]);
    for (i = 0; i < spots.length; i++) {
      t = (i / spots.length * 2.4).toFixed(2);      // one lap per cycle
      frag += '<span class="bulb" style="left:calc(' + spots[i][0] + '% - 2.5px);top:calc(' +
        spots[i][1] + '% - 2.5px);animation-delay:-' + t + 's"></span>';
    }
    marquee.insertAdjacentHTML('beforeend', frag);
  })();
  mark.addEventListener('click', function (e) {
    e.stopPropagation();
    mark.classList.remove('tapped');            // restart the pop on every tap
    void mark.offsetWidth;
    mark.classList.add('tapped');
    mqLamp('lit1', 900);                        // the top glass answers the touch
    var now = Date.now();
    /* Cooldown after a toggle: without it, the tap that follows a successful
       triple starts counting immediately, so a couple of extra taps flip it
       straight back. Also reset tapAt so the next sequence begins fresh. */
    if (now - toggledAt < 700) return;
    taps = (now - tapAt < TAP_WINDOW) ? taps + 1 : 1;
    tapAt = now;
    if (taps >= TAPS) {
      taps = 0; tapAt = 0; toggledAt = now;
      setTest(!unlocked);
    }
  });

  /* The bar stays where it is put — a setting, not a shot. Five notches, and
     the marker on the right is the readout, so there is no number to read. */
  var luck = $('.luck'), track = $('.track'), fillEl = $('.fill');
  var TOP = LUCK_STEPS - 1;                   // level 4 is the top of the bar
  function setLuck(lv, quiet) {
    lv = Math.max(0, Math.min(TOP, Math.round(lv)));
    track.setAttribute('aria-valuetext', 'x' + (1 + lv));
    if (lv === luckLevel && quiet) { sharePitch(); return; }
    var was = luckLevel;
    luckLevel = lv;
    var f = lv / TOP;
    fillEl.style.width = (f * 100) + '%';
    fillEl.style.setProperty('--luckinv', f ? (1 / f) : 1);   // keep the ramp full-length
    luck.classList.toggle('on', lv > 0);
    luck.classList.toggle('hot', lv === TOP);
    luck.classList.toggle('twins', lv > 0 && lv < TOP);
    luck.classList.toggle('jack', lv === TOP);
    var w = $('.window');
    w.classList.toggle('boost', lv > 0 && lv < TOP);
    w.classList.toggle('boostjack', lv === TOP);
    track.setAttribute('aria-valuetext', 'x' + (1 + lv));
    if (!quiet && lv !== was) {
      noise(0.03, 0.16, 1700, 6);                    // the notch it clicks into
      tone(420 + lv * 190, 0.06, 'square', 0.07);
    }
    sharePitch();                                    // the one place level changes
  }
  setLuck(0, true);                           // stamp the marker's starting state

  function luckFromX(x) {
    var b = track.getBoundingClientRect();
    return b.width ? ((x - b.left) / b.width) * TOP : 0;
  }
  var sliding = false;
  track.addEventListener('pointerdown', function (e) {
    e.stopPropagation(); e.preventDefault();
    /* pointer-events:none already stops a real tap while locked. This is for
       everything that is not a real tap. */
    if (!unlocked) return;
    sliding = true;
    try { track.setPointerCapture(e.pointerId); } catch (err) {}
    setLuck(luckFromX(e.clientX));
  });
  track.addEventListener('pointermove', function (e) {
    if (sliding && unlocked) setLuck(luckFromX(e.clientX), true);
  });
  track.addEventListener('pointerup', function (e) {
    sliding = false;
    try { track.releasePointerCapture(e.pointerId); } catch (err) {}
  });
  track.addEventListener('click', function (e) { e.stopPropagation(); });

  /* ── how a player earns luck ───────────────────────────────────────────
     A win spends ONE level, not the lot, and re-arms the dry-streak reward — so
     luck is a thing you build, cash a little of in, and build back.
     Sharing pays EVERY time rather than once: a share is worth the same to us
     each time it happens, and rationing it made the button lie about itself.
     A player still cannot pass level 3 either way; the top notch stays a Game
     Changer thing. */
  var PLAYER_TOP = 3;
  var earned = { streak: false };             // sharing is not rationed
  var dryRun = 0, granting = false;
  function rearm() { earned.streak = false; dryRun = 0; sharePitch(); }

  /* Nobody guesses that sharing pays. While it is unclaimed the button says so
     in its own label and glows; once it has paid it goes back to being a plain
     Share button, because then it is telling you nothing you can use. */
  /* Sharing lifts you off the floor and no further. Any other route into luck —
     a dry streak, Game Changer, a level still standing after a win — means the
     button has nothing left to offer, and it must say so rather than promise a
     boost it will refuse to give. */
  function sharePitch() {
    var b = $('.share'), on = !unlocked && luckLevel === 0;
    b.classList.toggle('pays', on);
    $('.slabel').textContent = on ? 'Share to boost luck' : 'Share';
  }

  /* Every gain announces itself. A bar that creeps up while you are looking at
     the reels is a bar nobody notices — Maco says it out loud, and the lever is
     held shut so the pull cannot land in the middle of it. */
  function grantLuck(line, why) {
    if (unlocked || granting || luckLevel >= PLAYER_TOP) return false;
    if (why && earned[why]) return false;
    if (why) earned[why] = true;
    granting = true;
    lever.classList.add('busy');
    toast('<b><img class="tmaco" src="' + BODY + '" alt="">' + line + '</b>' +
          '<small>Luck Boost</small>', 3400);
    sPop();                                          // he lands
    setTimeout(function () { setLuck(luckLevel + 1); sLuckUp(); }, 620);
    setTimeout(function () {
      granting = false;
      lever.classList.remove('busy');
    }, 3500);                                 // the lever waits out the card
    return true;
  }
  sharePitch();                               // the button's opening offer

  track.addEventListener('keydown', function (e) {
    var d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1
          : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (!d || !unlocked) return;
    e.preventDefault(); e.stopPropagation();
    setLuck(luckLevel + d);
  });


  var wasArmed = false;
  try { wasArmed = sessionStorage.getItem('luckymaco:test') === '1'; } catch (e) {}
  if (CFG.changer || wasArmed) setTest(true);

  /* The strip is parked at translateY(-TRAIL * cell), a pixel offset computed
     from the cell size at the time. Resize the window and the cell changes but
     the offset does not, so the reels slide off their row and the window shows
     blank strip. Re-park them — and re-heap the hopper, whose layout is also in
     pixels. Debounced, because a drag-resize fires this continuously. */
  var reflowTimer = null;
  window.addEventListener('resize', function () {
    if (reflowTimer) clearTimeout(reflowTimer);
    reflowTimer = setTimeout(function () {
      reflowTimer = null;
      if (spinning || !filled) return;
      for (var i = 0; i < strips.length; i++) {
        strips[i].style.transition = 'none';
        strips[i].style.transform = '';           // hand it back to CSS
      }
      if (hstock.children.length) fillHopper();     // its heap is in pixels too
    }, 180);
  });

  /* Tap anywhere on the cabinet to sweep the pile away early — it otherwise sits
     until the next pull, which is deliberate but sometimes in the way. */
  cab.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('button, .lever, .sheet')) return;
    var spent = dumpBox.children.length ||
                $('.window').classList.contains('emptied') || !hstock.children.length;
    if (!spent || spinning) return;
    /* Not just a sweep: a tap on a spent machine reloads it there and then —
       the pile falls out, the hopper tips back in, the window drops its cells
       from the top. Clearing the floor and leaving the reels bare was the part
       that felt broken. */
    restock();
  });

  $('.share').addEventListener('click', function (e) {
    e.stopPropagation();
    shareResult();
    /* On the click, not the outcome — sharing can be cancelled, and on a desktop
       it falls through to saving the card. It pays once either way. */
    /* Only from zero — the same rule the button is drawn from. */
    if (!unlocked && luckLevel === 0) {
      setTimeout(function () { grantLuck('Thanks! More luck for you', null); }, 500);
    }
  });

  if (PAGE) {
    scrim.classList.add('on');
    fillIn();
    // No FAB tap to piggyback on, so iOS motion permission rides the first
    // interaction with the page instead.
    var arm1 = function () {
      document.removeEventListener('pointerdown', arm1);
      document.removeEventListener('keydown', arm1);
      if (!shakeAsked) { shakeAsked = true; enableShake(); }
    };
    document.addEventListener('pointerdown', arm1);
    document.addEventListener('keydown', arm1);
  } else {
  fab.addEventListener('click', open);
    $('.close').addEventListener('click', close);
    scrim.addEventListener('click', function (e) { if (e.target === scrim) close(); });
  }
  document.addEventListener('keydown', function (e) {
    if (!scrim.classList.contains('on')) return;
    if (e.key === 'Escape') {
      if (sheet.classList.contains('on')) { sheet.classList.remove('on'); return; }
      if (!PAGE) close();
    }
    if (e.code === 'Space') { e.preventDefault(); yank(); }
    if (unlocked) {
      var forced = { Digit1: 'TRIPLE', Digit2: 'PAIR' }[e.code];
      if (forced) { e.preventDefault(); yank(forced); }
    }
  });

  window.LuckyMaco = {
    open: open, close: close, pull: yank,   // pull('TRIPLE'|'PAIR'|'ALLDIFF')
    /* mood('uneasy') / mood('charged') / mood() to clear — the states are rare
       by design, which makes them near-impossible to look at while building. */
    mood: function (m) { m ? setMood(m) : clearMood(); return mood; },
    share: shareResult, card: shareCanvas,
    configure: configure, config: snapshot, draw: draw, pool: function () { return POOL.slice(); },
    mute: function (v) { sound = !v; paintSound(); return !sound; },
    theme: function (t) {
      if (t) { CFG.theme = t; remember(t === 'auto' ? '' : t); }
      applyTheme(); return host.getAttribute('data-theme');
    }
  };
})();
