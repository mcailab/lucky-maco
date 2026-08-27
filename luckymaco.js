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
    set:      null,             // restrict pool, e.g. "fire,joy,wink,grin"
    iconBase: null              // override where the PNGs live
  };
  var DEFAULTS = {};
  for (var _k in CFG) DEFAULTS[_k] = CFG[_k];

  var NUM = { triple: 1, twins: 1, nearMiss: 1 };
  var BOOL = { shake: 1, sound: 1, changer: 1, haptics: 1 };
  var RANGE = { shakeForce: [8, 60], spinSpeed: [0.4, 2.5], packing: [0.8, 1.5],
                stock: [6, 40], triple: [0.01, 0.5], twins: [0.01, 0.6] };
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
  function draw(force) {
    var pattern = force;
    if (!pattern) {
      var r = Math.random();
      pattern = r < CFG.triple ? 'TRIPLE'
              : r < CFG.triple + CFG.twins ? 'PAIR' : 'ALLDIFF';
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
    ':host{',
    '--cab:linear-gradient(180deg,#FFFFFF,#F2F5FA);--cab-br:rgba(27,42,91,.14);',
    '--cab-sh:0 24px 60px rgba(27,42,91,.22);',
    '--txt:#2D3436;--mut:#6B7280;--faint:#9AA1AC;',
    '--win:linear-gradient(180deg,#FBFCFE,#EDF1F7);--win-br:rgba(233,152,43,.45);',
    '--win-sh:inset 0 4px 14px rgba(27,42,91,.10);--reel:rgba(27,42,91,.05);',
    '--gold:#B87410;--gold-lit:#E9982B;--gold-soft:rgba(233,152,43,.38);',
    '--mq:linear-gradient(180deg,rgba(233,152,43,.18),rgba(233,152,43,.04));',
    '--mq-sh:inset 0 1px 0 rgba(255,255,255,.75);',
    '--glow1:rgba(233,152,43,.14);--glow2:rgba(233,152,43,.30);',
    '--mount:linear-gradient(180deg,#DFE4EE,#C2C9D8);--rail:rgba(27,42,91,.13);',
    '--scrim:rgba(27,42,91,.42);--close-bg:rgba(27,42,91,.08);--close-fg:#2D3436}',

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
    ':host{--cabw:min(360px, 88vw);--maxcell:93px;',
    /* 40 cabinet padding + 16 window padding + 8 for the two gaps between cells,
       so the three cells actually fill the window instead of floating in it. */
    '--cell:min(var(--maxcell), calc((var(--cabw) - 64px) / 3));',
    '--hop:74px;--mqpad:14px;--msg:56px;--sharepad:8px;--gap:20px;--winpad:8px}',
    '@media (min-width:620px) and (min-height:880px){',
    ':host{--cabw:440px;--maxcell:118px;--hop:84px;--mqpad:18px;--msg:62px;',
    '--sharepad:10px;--gap:24px}}',
    '@media (max-height:800px){:host{--maxcell:80px;--hop:68px;--mqpad:12px;',
    '--msg:50px;--sharepad:7px;--gap:15px}}',
    '@media (max-height:730px){:host{--maxcell:68px;--hop:60px;--mqpad:10px;',
    '--msg:46px;--sharepad:6px;--gap:13px}}',
    '@media (max-height:665px){:host{--maxcell:58px;--hop:50px;--mqpad:9px;',
    '--msg:40px;--sharepad:5px;--gap:11px}}',
    '@media (max-height:605px){:host{--maxcell:48px;--hop:42px;--mqpad:7px;',
    '--msg:36px;--sharepad:4px;--gap:9px}}',
    '@media (max-height:545px){:host{--maxcell:40px;--hop:34px;--mqpad:6px;',
    '--msg:30px;--sharepad:4px;--gap:8px}}',
    '@media (max-height:510px){:host{--maxcell:32px;--hop:28px;--mqpad:5px;',
    '--msg:26px;--sharepad:3px;--gap:6px}}',
    '@media (max-height:470px){:host{--maxcell:26px;--hop:22px;--mqpad:4px;',
    '--msg:22px;--sharepad:3px;--gap:5px}}',
    /* A phone on its side has no room for a portrait cabinet. Drop the hopper and
       the time-of-day labels rather than clipping the reels, which are the part
       you actually need. */
    '@media (max-height:440px){.hopper,.labels,.mq-sub{display:none}',
    '.marquee img{width:24px;height:24px}.mq-name{font-size:16px}',
    ':host{--maxcell:28px;--msg:19px;--gap:4px;--mqpad:4px;--sharepad:3px}}',
    '@media (max-height:380px){:host{--maxcell:22px;--msg:16px}}',
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
    '.stack{display:flex;flex-direction:column;align-items:center;gap:11px;',
    'width:var(--cabw)}',
    /* One row, always. Fixed height so revealing the test buttons cannot shift
       the machine down or change its height by a pixel. */
    /* Three tracks: the test buttons sit in the middle one so they stay centred
       on the row no matter how wide the control cluster on the right is. */
    '.bar{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;',
    'gap:8px;width:100%;height:38px;flex:0 0 38px}',
    '.test{grid-column:2;justify-self:center}',
    '.ctls{grid-column:3;justify-self:end;display:flex;gap:9px}',
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
    /* Sits in the top bar beside the mode buttons — never over the machine. */
    '.test{display:flex;gap:5px;flex-wrap:nowrap;align-items:center;min-width:0}',
    '.test button{padding:5px 7px;border:1px dashed var(--gold-lit);border-radius:7px;',
    'background:transparent;color:var(--gold);font:700 8.5px/1 inherit;cursor:pointer;',
    'letter-spacing:.04em;text-transform:uppercase;white-space:nowrap;opacity:.8;',
    '-webkit-tap-highlight-color:transparent}',
    '.test button:hover{opacity:1}',
    '.test button:hover{background:var(--gold-soft)}',
    '.test button:active{transform:scale(.94)}',
    '.test[hidden]{display:none}',
    '.marquee.armed{outline:1px dashed var(--gold-lit);outline-offset:3px}',
    '@keyframes tap{0%{transform:scale(1)}45%{transform:scale(.82)}100%{transform:scale(1)}}',
    '.marquee img.tapped{animation:tap .22s ease-out}',
    '.marquee img{cursor:pointer;-webkit-tap-highlight-color:transparent}',

    /* marquee — the lit topper above the reels */
    '.marquee{display:flex;align-items:center;justify-content:center;gap:13px;',
    'margin:2px 0 var(--gap);padding:var(--mqpad) 22px;border-radius:18px;',
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
    'margin:0 0 var(--gap);',
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
    '.window{position:relative;display:flex;gap:4px;justify-content:center;',
    'padding:var(--winpad);border-radius:18px;',
    'background:var(--win);border:2px solid var(--win-br);box-shadow:var(--win-sh)}',
    '.reel{width:var(--cell);height:calc(var(--cell) * ' + ROWS + ');overflow:hidden;',
    'border-radius:12px;background:var(--reel);',
    '-webkit-mask-image:' + MASK + ';mask-image:' + MASK + '}',
    '.strip{will-change:transform;transition:opacity .45s ease-in .25s}',
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

    '.labels{display:flex;gap:8px;justify-content:center;margin-top:8px}',
    /* These name the three parts of the day, so they must be readable. They were
       on --faint, the tone reserved for near-invisible hints. Also pinned to 84px
       while the cells shrink to 66px on mobile, so they no longer lined up. */
    /* Size with the cell, not fixed. At 10.5px "AFTERNOON" measures ~77px, which
       overflows a 66px cell on mobile and a 50px one on a short screen — the
       labels ran into each other. Ratio chosen so the longest word always fits. */
    '.labels span{width:var(--cell);text-align:center;font-weight:700;',
    'font-size:calc(var(--cell) * 0.125);letter-spacing:.06em;',
    'text-transform:uppercase;color:var(--mut);overflow:hidden}',

    '.share{display:flex;align-items:center;justify-content:center;gap:7px;',
    'margin:8px auto 0;padding:var(--sharepad) 16px;border-radius:999px;cursor:pointer;',
    'border:1px solid var(--gold-soft);background:transparent;color:var(--gold);',
    'font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;',
    '-webkit-tap-highlight-color:transparent;',
    'transition:background .15s,transform .12s,opacity .22s}',
    '.share:hover{background:var(--gold-soft)}',
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
    '.sheet button.step{flex:none;width:30px;padding:5px 0;margin:0 7px;border-radius:8px;',
    'font-size:15px;line-height:1;vertical-align:middle}',
    '.sheet .force{display:inline-block;min-width:24px;text-align:center;vertical-align:middle}',
    '.sheet button:hover{filter:brightness(1.08)}',

    /* lever — right-hand side, pull down, springs back */
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
    'box-shadow:0 4px 12px rgba(0,0,0,.5),inset 0 -3px 6px rgba(0,0,0,.35)}',
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
    '.copy{position:fixed;left:0;right:0;bottom:11px;text-align:center;font-size:10px;',
    'letter-spacing:.1em;color:var(--faint);pointer-events:none;display:none}',
    '.spark{position:absolute;width:9px;height:9px;border-radius:2px;pointer-events:none}',
    '@media (max-width:430px){.lever{right:-10px;transform:scale(.82);transform-origin:50% 30%}}',
    '@media (prefers-reduced-motion:reduce){.fab img,.marquee,.bulb,.mq-name{animation:none}',
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
           '.scrim{padding-top:76px;padding-bottom:34px}' +
           '@media (max-height:440px){.scrim{padding-top:64px;padding-bottom:20px}' +
           '.copy{display:none}}' +
           '.copy{display:block}' : ''
  ].join('');

  root.innerHTML =
    '<style>' + CSS + '</style>' +
    '<button class="fab" part="fab" aria-label="Play Lucky Maco">' +
      '<img src="' + FACE + '" alt=""></button>' +
    '<div class="scrim" role="dialog" aria-modal="true" aria-label="Lucky Maco">' +
      '<div class="stack">' +
      '<div class="bar">' +
        '<div class="test" hidden>' +
          '<button data-f="TRIPLE">Jackpot</button>' +
          '<button data-f="PAIR">Twins</button>' +
        '</div>' +
        '<div class="ctls">' +
          '<button class="ctl tog" aria-label="Switch theme"></button>' +
          '<button class="ctl snd" aria-label="Sound"></button>' +
          '<button class="ctl cog" aria-label="Settings and embed code"></button>' +
        '</div>' +
      '</div>' +
      '<div class="cab">' +
        '<button class="close" aria-label="Close">&#10005;</button>' +
        '<div class="marquee">' +
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
        '<button class="share off">' +
          '<svg viewBox="0 0 24 24"><path d="M12 16V4M8 8l4-4 4 4"/>' +
          '<path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>Share</button>' +
        '<div class="sheet">' +
          '<button class="shut" aria-label="Close settings">&#10005;</button>' +
          '<div class="sbody"></div></div>' +
        '<div class="toast"><div class="card"></div></div>' +
        '<div class="copy">&copy; 2026 Lucky Maco</div>' +
        '<div class="lever"><div class="rail"></div><div class="mount"></div>' +
          '<div class="arm"><div class="knob"></div></div></div>' +
      '</div>' +
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
  var TRAIL = 26, STRIP = TRAIL + ROWS + 1, AT = TRAIL + CENTRE, spinning = false;

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
    var lastEl = msg.querySelector('small') || msg.querySelector('b') || msg;
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
    var pileCard = lastResult && lastResult.pattern === 'TRIPLE' &&
                   lastPile.length && dumpBox.children.length === lastPile.length;
    if (pileCard) {
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
    for (i = 0; i < strips.length; i++) {
      for (var k = 0; k < ROWS; k++) {
        var cellEl = strips[i].children[first + k];
        if (cellEl) sprite(cellEl.querySelector('img'), first + k, i);
      }
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
  function shareText() {
    var r = lastResult, day = today(), tail = '\nTry your luck \u2192 ' + EMBED_HOME;
    if (!r) return 'Lucky Maco \u2014 a little slot machine that reads your day ' +
                   'in Maco faces.' + tail;
    var line = 'My ' + day + ' on Lucky Maco: ' +
      label(r.reels[0]) + ' morning, ' +
      label(r.reels[1]) + ' afternoon, ' +
      label(r.reels[2]) + ' evening.';
    if (r.pattern === 'TRIPLE') line += ' Three of a kind is the jackpot.';
    else if (r.pattern === 'PAIR') line += ' Two of a kind.';
    return line + tail;
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

  function shareResult() {
    var file = pendingCard;
    var after = function (err) {
      if (!err) return;
      if (err && err.name === 'AbortError') return;      // they just backed out
      if (file) saveCard(file);
      else toast('<b>Could not share</b><small>' + (err.message || err.name || '') +
                 '</small>', 2600);
    };
    if (file) {
      var p;
      try { p = handOff(file); } catch (e) { after(e); return; }
      if (p && p['catch']) p['catch'](after);
      return;
    }
    /* No card ready — build one, then share. Activation may already be gone, so
       this path is expected to fall through to saving. */
    shareCanvas().toBlob(function (blob) {
      if (!blob) { toast('<b>Could not build the card</b>', 2200); return; }
      var f;
      try { f = new File([blob], 'lucky-maco.png', { type: 'image/png' }); } catch (e) { f = blob; }
      file = f;
      var p;
      try { p = handOff(f); } catch (e) { after(e); return; }
      if (p && p['catch']) p['catch'](after);
    }, 'image/png');
  }

  function saveCard(blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'lucky-maco.png';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    try { navigator.clipboard && navigator.clipboard.writeText(shareText()); } catch (e) {}
    toast('<b>' + LOCK_OPEN + 'Card saved</b><small>and the text is on your clipboard</small>', 2000);
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
  var lastPile = [], lastResult = null;
  function clearDrops() {
    while (dumpBox.firstChild) dumpBox.removeChild(dumpBox.firstChild);
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
  function restock() {
    clearDrops();
    $('.window').classList.remove('emptied');    // reels refill with the next spin
    if (!hstock.children.length) {
      hopper.classList.remove('open');           // floor swings shut
      fillHopper();
      pourHopper();
    }
  }
  /* count = how many Macoji fall; empty = whether the hopper drains with them.
     Jackpot dumps the lot, a pair just spills a few. */
  /* `faces` is the list of Macoji to drop — one entry each, no repeats. It used
     to be a count, with each drop picking at random WITH replacement, so the same
     face turned up several times in one pile. */
  function dump(faces, empty) {
    var count = faces.length;
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
        var iconName = faces[i];
        var el = document.createElement('img');
        el.className = 'drop';
        el.src = ICON(iconName);
        el.style.width = el.style.height = S + 'px';
        el.style.left = (spot.x - S / 2).toFixed(1) + 'px';
        el.style.top = (spot.y - FACE_Y * S).toFixed(1) + 'px';   // resting place
        lastPile.push({ x: spot.x, y: spot.y, n: iconName, r: 0 });
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

  /* ── load-in ──────────────────────────────────────────────────────────────
     The machine starts empty and Macoji pour in, filling each column from the
     bottom up. Runs once, on open. Pure Web Animations on the cells that are
     already there — no canvas, no physics, no cost after it finishes. */
  var filled = false;
  function fillIn() {
    filled = true;
    var CELL = cellPx();
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches;
    pourHopper();                                // the supply arrives first
    strips.forEach(function (strip, col) {
      strip.style.transition = 'none';
      strip.innerHTML = cells(STRIP);
      strip.style.transform = 'translateY(-' + (TRAIL * CELL) + 'px)';
      if (reduce) return;
      for (var r = 0; r < ROWS; r++) {
        var el = strip.children[TRAIL + r];
        if (!el) continue;
        el.animate([
          { transform: 'translateY(-' + (CELL * 4.2) + 'px) rotate(-20deg)', opacity: 0 },
          { transform: 'translateY(0) rotate(0)', opacity: 1 }
        ], {
          duration: 560,
          delay: 300 + col * 90 + (ROWS - 1 - r) * 120,   // left to right, bottom row first
          easing: 'cubic-bezier(.34,1.5,.6,1)',
          fill: 'backwards'
        });
      }
    });
  }

  /* ── spin ─────────────────────────────────────────────────────────────── */
  function spin(force) {
    if (spinning) return;
    spinning = true;
    lever.classList.add('busy');
    $('.share').classList.add('off');
    marquee.classList.add('fast');               // lights race while reels run
    $('.window').classList.add('live');
    idleShowing = false;                         // a result replaces the prompt
    restock();                                   // sweep the floor, reload the hopper
    sClunk(); hPull();
    var res = draw(force);
    msg.className = 'msg';
    msg.innerHTML = '<b>&nbsp;</b><small>&nbsp;</small>';

    /* Weighted so the slowdown is visible, and spaced so each reel landing is its
       own beat: ~1s between stop 1 and 2, ~1.1s between 2 and 3. Bunched-up stops
       read as one event rather than three. */
    var dur = [1600, 2650, res.tease ? 5000 : 3700];   // reel 3 crawls on a near-miss
    for (var d = 0; d < 3; d++) dur[d] = Math.round(dur[d] * CFG.spinSpeed);
    stopSpinSound();
    sSpin(dur[2]);
    var CELL = cellPx(), done = 0;
    strips.forEach(function (strip, i) {
      strip.style.transition = 'none';
      strip.style.transform = 'translateY(0)';
      strip.innerHTML = cells(STRIP, res.reels[i], AT);
      void strip.offsetHeight;                          // force reflow
      strip.style.transition = 'transform ' + dur[i] + 'ms cubic-bezier(.5,.2,.25,1)';
      strip.style.transform = 'translateY(-' + (TRAIL * CELL) + 'px)';
      setTimeout(function () { sStop(); hStop(); if (++done === 3) settle(res); }, dur[i] + 60);
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
    lastResult = res;
    stopSpinSound();
    lever.classList.remove('busy');
    $('.share').classList.remove('off');         // there is now something to share
    setTimeout(prepareCard, 60);                 // ready before the button is pressed
    marquee.classList.remove('fast');
    $('.window').classList.remove('live');
    var r = res.reels;
    if (res.pattern === 'TRIPLE') {
      msg.className = 'msg jackpot';
      /* All three winners, cheering in sequence. */
      var win = '<img src="' + ICON(r[0]) + '" alt="">';
      msg.innerHTML = '<b>' + win + win + win + 'JACKPOT!</b><small>Triple ' +
        label(r[0]) + ' &mdash; all of ' + today() + ' is yours</small>';
      celebrate();
    } else if (res.pattern === 'PAIR') {
      var dbl = r[0] === r[1] ? r[0] : r[2];
      msg.className = 'msg win';
      /* Show the actual twins, twice, rather than a generic Maco — the message
         then depicts the thing it is announcing. */
      var twin = '<img src="' + ICON(dbl) + '" alt="">';
      msg.innerHTML = '<b>' + twin + twin + 'Twins!</b><small>Double ' +
        label(dbl) + ' kind of ' + today() + '</small>';
      celebrateSmall(res);
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
  function celebrate() {
    marquee.classList.add('allon');              // every bulb, alternating
    setTimeout(function () { marquee.classList.remove('allon'); }, 2200);
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
  function celebrateSmall(res) {
    marquee.classList.add('allon');
    setTimeout(function () { marquee.classList.remove('allon'); }, 700);
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
  var MAX = 110, FIRE = 30, DOWN = 58, SHRINK = 0.42;
  var TAP = 6, FLICK = 0.9;                    // px of slop for a click, px/ms for a flick
  function setArm(deg) {
    var k = deg / DOWN, sy = 1 - SHRINK * k;
    arm.style.transform = 'rotate(' + deg + 'deg) scaleY(' + sy + ')';
    knob.style.transform = 'scaleY(' + (1 / sy) + ')';   // keep the ball round
  }

  var t0 = 0, moved = 0;
  lever.addEventListener('pointerdown', function (e) {
    if (spinning) return;
    dragging = true; y0 = e.clientY; pulled = 0; moved = 0; t0 = Date.now();
    lever.classList.add('dragging');
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
  });
  function release() {
    if (!dragging) return;
    dragging = false;
    lever.classList.remove('dragging');
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
    var op = !testPanel.hidden;
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
      '<h3>Odds</h3><table>' +
        '<tr><td>Jackpot &mdash; 3 identical</td><td>' +
          step('triple', 0.01, pct(CFG.triple)) + '</td></tr>' +
        '<tr><td>Twins &mdash; 2 identical</td><td>' +
          step('twins', 0.01, pct(CFG.twins)) + '</td></tr>' +
        '<tr><td>No match</td><td>' + pct(1 - CFG.triple - CFG.twins) + '</td></tr>' +

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
        var v = Math.max(lo, Math.min(hi, Math.round((CFG[k] + d) * 10) / 10));
        CFG[k] = v;
        try { localStorage.setItem('luckymaco:' + k, String(v)); } catch (err) {}
        if (k === 'packing' || k === 'stock') {
          fillHopper(); pourHopper();            // re-heap so you can see it at once
        }
        if (k === 'triple' || k === 'twins') {   // keep the split coherent
          if (CFG.triple + CFG.twins > 0.95) CFG[k] = v - d;
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
  var testPanel = $('.test'), taps = 0, tapAt = 0;
  var marquee, mark;

  /* One pair of padlocks, shared by the mode toast and the sheet's badge, so the
     two always agree. */
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
    }, ms || 1800);
  }

  function setTest(on) {
    testPanel.hidden = !on;
    marquee.classList.toggle('armed', on);      // dashed ring = armed, at a glance
    try { on ? sessionStorage.setItem('luckymaco:test', '1')
             : sessionStorage.removeItem('luckymaco:test'); } catch (e) {}
    toast(on
      ? '<b>' + LOCK_OPEN + 'You&rsquo;re the Game Changer</b>' +
        '<small>Customise your machine in Settings</small>'
      : '<b>' + LOCK_SHUT + 'Machine Settings Locked</b>', on ? 2600 : 1600);
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
    var now = Date.now();
    /* Cooldown after a toggle: without it, the tap that follows a successful
       triple starts counting immediately, so a couple of extra taps flip it
       straight back. Also reset tapAt so the next sequence begins fresh. */
    if (now - toggledAt < 700) return;
    taps = (now - tapAt < TAP_WINDOW) ? taps + 1 : 1;
    tapAt = now;
    if (taps >= TAPS) {
      taps = 0; tapAt = 0; toggledAt = now;
      setTest(testPanel.hidden);
    }
  });

  root.querySelectorAll('.test button').forEach(function (b) {
    b.addEventListener('click', function (e) { e.stopPropagation(); yank(b.dataset.f); });
  });

  var wasArmed = false;
  try { wasArmed = sessionStorage.getItem('luckymaco:test') === '1'; } catch (e) {}
  if (CFG.changer || wasArmed) setTest(true);

  /* Tap anywhere on the cabinet to sweep the pile away early — it otherwise sits
     until the next pull, which is deliberate but sometimes in the way. */
  cab.addEventListener('click', function (e) {
    if (!dumpBox.children.length) return;
    if (e.target.closest && e.target.closest('button, .lever, .sheet')) return;
    clearDrops();
  });

  $('.share').addEventListener('click', function (e) {
    e.stopPropagation(); shareResult();
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
    if (!testPanel.hidden) {
      var forced = { Digit1: 'TRIPLE', Digit2: 'PAIR' }[e.code];
      if (forced) { e.preventDefault(); yank(forced); }
    }
  });

  window.LuckyMaco = {
    open: open, close: close, pull: yank,   // pull('TRIPLE'|'PAIR'|'ALLDIFF')
    share: shareResult, card: shareCanvas,
    configure: configure, config: snapshot, draw: draw, pool: function () { return POOL.slice(); },
    mute: function (v) { sound = !v; paintSound(); return !sound; },
    theme: function (t) {
      if (t) { CFG.theme = t; remember(t === 'auto' ? '' : t); }
      applyTheme(); return host.getAttribute('data-theme');
    }
  };
})();
