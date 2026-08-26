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
    triple:   0.08,             // odds of 3 identical  → JACKPOT
    pair:     0.22,             // odds of exactly 2 identical, any position
    nearMiss: 0.60,             // share of pairs landing XXO. Pays the same wherever
                                // the odd one lands — this only decides how often
                                // reel 3 crawls, i.e. how often you get suspense.
    test:     false,            // force the outcome panel open. Normally you unlock it
                                // by tapping the Master Concept mark 5x — see below.
    haptics:  true,             // vibration on pull, wins and shake (Android; iOS Safari
                                // support is unreliable, so it self-detects)
    sound:    true,             // lever clunk, reel stops, win chimes (WebAudio, no files)
    spinSpeed: 1,              // multiplies every reel duration. 1.5 = half again as
                                // long, 0.7 = snappier. Range 0.4-2.5.
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

  var NUM = { triple: 1, pair: 1, nearMiss: 1 };
  var BOOL = { shake: 1, sound: 1, test: 1, haptics: 1 };
  var RANGE = { shakeForce: [8, 60], spinSpeed: [0.4, 2.5] };
  var ENUM  = { rows: [1, 3, 5] };

  function warn(m) { try { console.warn('[Lucky Maco] ' + m); } catch (e) {} }

  function configure(o) {
    if (!o) return snapshot();
    for (var k in CFG) {
      if (!Object.prototype.hasOwnProperty.call(o, k) || o[k] == null) continue;
      var v = o[k];
      if (NUM[k]) {
        var n = parseFloat(v);
        if (isNaN(n) || n < 0 || n > 1) { warn(k + ' must be 0–1, got "' + v + '" — ignored'); continue; }
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
    if (CFG.triple + CFG.pair > 1) {          // keep the split coherent
      var t = CFG.triple + CFG.pair;
      CFG.triple /= t; CFG.pair /= t;
      warn('triple + pair exceeded 1 — normalised to ' +
           CFG.triple.toFixed(3) + ' / ' + CFG.pair.toFixed(3));
    }
    return snapshot();
  }
  function snapshot() {
    var o = {};
    for (var k in CFG) o[k] = CFG[k];
    o.allDifferent = +(1 - CFG.triple - CFG.pair).toFixed(4);
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
    if (ok.length < 3) warn('"set" needs at least 3 known Macoji — using the full set');
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
              : r < CFG.triple + CFG.pair ? 'PAIR' : 'ALLDIFF';
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

    ':host{--cell:84px}',
    '@media (max-width:430px){:host{--cell:66px}}',
    '@media (max-height:760px){:host{--cell:70px}}',
    '@media (max-height:670px){:host{--cell:60px}}',
    '@media (max-height:580px){:host{--cell:50px}}',
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
    'width:min(360px,88vw)}',
    /* One row, always. Fixed height so revealing the test buttons cannot shift
       the machine down or change its height by a pixel. */
    '.bar{display:flex;align-items:center;gap:8px;width:100%;',
    'flex-wrap:nowrap;height:38px;flex:0 0 38px}',
    '.ctls{display:flex;gap:9px;margin-left:auto;flex:0 0 auto}',
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
    '.test button{padding:7px 8px;border:1px dashed var(--gold-lit);border-radius:9px;',
    'background:transparent;color:var(--gold);font:700 9.5px/1 inherit;cursor:pointer;',
    'letter-spacing:.05em;text-transform:uppercase;white-space:nowrap;',
    '-webkit-tap-highlight-color:transparent}',
    '@media (max-width:400px){.test button{padding:6px 6px;font-size:8.5px;letter-spacing:0}',
    '.test{gap:4px}}',
    '.test button:hover{background:var(--gold-soft)}',
    '.test button:active{transform:scale(.94)}',
    '.test[hidden]{display:none}',
    '.marquee.armed{outline:1px dashed var(--gold-lit);outline-offset:3px}',
    '@keyframes tap{0%{transform:scale(1)}45%{transform:scale(.82)}100%{transform:scale(1)}}',
    '.marquee img.tapped{animation:tap .22s ease-out}',
    '.marquee img{cursor:pointer;-webkit-tap-highlight-color:transparent}',

    /* marquee — the lit topper above the reels */
    '.marquee{display:flex;align-items:center;justify-content:center;gap:11px;',
    'margin:4px 0 14px;padding:10px 18px;border-radius:16px;',
    'background:var(--mq);border:1px solid var(--gold-soft);',
    'box-shadow:var(--mq-sh);position:relative}',
    '.marquee::after{content:"";position:absolute;inset:-1px;border-radius:16px;',
    'pointer-events:none;box-shadow:0 0 32px var(--glow2);',
    'animation:marquee 3.6s ease-in-out infinite}',
    '@keyframes marquee{0%,100%{opacity:.28}50%{opacity:1}}',
    '.marquee img{width:30px;height:30px;flex:none;display:block;',
    'filter:drop-shadow(0 2px 7px rgba(233,152,43,.55))}',
    '.mq{display:flex;flex-direction:column;line-height:1}',
    '.mq-name{font-size:20px;font-weight:800;letter-spacing:.005em;color:var(--gold)}',
    '.mq-sub{font-size:8.5px;letter-spacing:.22em;text-transform:uppercase;',
    'color:var(--mut);margin-top:4px}',

    /* hopper — the machine's visible supply of Macoji, sitting above the reels */
    '.hopper{position:relative;height:46px;margin:0 0 10px;border-radius:12px;',
    'overflow:hidden;background:var(--reel);border:1px solid var(--cab-br)}',
    '.hopper img{position:absolute;width:40px;height:40px;pointer-events:none}',
    '.hopper::after{content:"";position:absolute;inset:0;pointer-events:none;',
    'background:linear-gradient(180deg,var(--cab) -30%,transparent 55%);opacity:.55}',
    /* jackpot dump — clipped to the cabinet without clipping the lever */
    '.dump{position:absolute;inset:0;overflow:hidden;border-radius:28px;',
    'pointer-events:none;z-index:2}',
    '.drop{position:absolute;top:96px;width:46px;height:46px;will-change:transform;',
    'filter:drop-shadow(0 5px 10px rgba(0,0,0,.34))}',
    '.window{position:relative;display:flex;gap:8px;justify-content:center;padding:12px;border-radius:18px;',
    'background:var(--win);border:2px solid var(--win-br);box-shadow:var(--win-sh)}',
    '.reel{width:var(--cell);height:calc(var(--cell) * ' + ROWS + ');overflow:hidden;',
    'border-radius:12px;background:var(--reel);',
    '-webkit-mask-image:' + MASK + ';mask-image:' + MASK + '}',
    '.strip{will-change:transform}',
    '.cell{width:var(--cell);height:var(--cell);display:grid;place-items:center}',
    '.cell img{width:calc(var(--cell) * .74);height:calc(var(--cell) * .74);display:block}',
    /* the pay row — the only one that counts */
    '.band{position:absolute;left:7px;right:7px;pointer-events:none;border-radius:10px;',
    'top:calc(12px + var(--cell) * ' + CENTRE + ');height:var(--cell);',
    'background:linear-gradient(90deg,transparent,var(--gold-soft),transparent);',
    'border-top:1px solid var(--gold-lit);border-bottom:1px solid var(--gold-lit);opacity:.55}',
    '.pip{position:absolute;top:calc(12px + var(--cell) * ' + (CENTRE + 0.5) + ' - 6px);',
    'width:0;height:0;border-top:6px solid transparent;border-bottom:6px solid transparent;pointer-events:none}',
    '.pip.l{left:2px;border-left:8px solid var(--gold-lit)}',
    '.pip.r{right:2px;border-right:8px solid var(--gold-lit)}',

    '.labels{display:flex;gap:8px;justify-content:center;margin-top:8px}',
    '.labels span{width:84px;text-align:center;font-size:10px;letter-spacing:.08em;',
    'text-transform:uppercase;color:var(--faint)}',

    '.msg{min-height:56px;display:grid;place-items:center;text-align:center;margin-top:12px;padding:0 4px}',
    '.msg b{display:block;font-size:19px;letter-spacing:.03em;white-space:nowrap}',
    '.msg b img{width:25px;height:25px;vertical-align:-6px;margin-right:7px}',
    '.msg.jackpot b img{width:36px;height:36px;vertical-align:-9px;margin-right:8px;',
    'animation:cheer .5s cubic-bezier(.34,1.7,.64,1) 3}',
    '@keyframes cheer{0%,100%{transform:rotate(0) scale(1)}',
    '35%{transform:rotate(-13deg) scale(1.14)}70%{transform:rotate(9deg) scale(1.08)}}',
    '.msg small{display:block;font-size:13px;color:var(--mut);margin-top:3px}',
    '.msg.win b{color:var(--gold);animation:pop .5s cubic-bezier(.34,1.7,.64,1)}',
    '.msg.jackpot b{font-size:25px;color:var(--gold);animation:pop .55s cubic-bezier(.34,1.9,.64,1)}',
    '@keyframes pop{0%{transform:scale(.5);opacity:0}100%{transform:none;opacity:1}}',

    '.hint{text-align:center;font-size:11px;color:var(--faint);margin-top:12px}',
    '.hint:empty{display:none}',
    /* settings sheet — slides over the cabinet interior */
    '.sheet{position:absolute;inset:0;border-radius:28px;background:var(--cab);z-index:4;',
    'padding:18px 18px 16px;overflow-y:auto;display:none}',
    '.sheet.on{display:block}',
    '.sheet h3{margin:0 0 12px;font:800 11px/1 inherit;letter-spacing:.16em;',
    'text-transform:uppercase;color:var(--gold)}',
    '.sheet table{width:100%;border-collapse:collapse;margin-bottom:14px}',
    '.sheet td{padding:5px 0;font-size:12.5px;border-bottom:1px solid var(--cab-br);',
    'color:var(--mut)}',
    '.sheet td:last-child{text-align:right;color:var(--txt);font-weight:700}',
    '.sheet pre{margin:0 0 10px;padding:11px 12px;border-radius:10px;overflow-x:auto;',
    'background:var(--reel);border:1px solid var(--cab-br);',
    'font:500 10.5px/1.6 ui-monospace,Menlo,monospace;color:var(--txt);white-space:pre}',
    '.sheet .row{display:flex;gap:8px}',
    '.sheet button{flex:1;padding:9px;border:1px solid var(--cab-br);border-radius:10px;',
    'background:var(--reel);color:var(--txt);font:700 11px/1 inherit;cursor:pointer;',
    'letter-spacing:.06em;text-transform:uppercase}',
    '.sheet button.primary{background:var(--gold-lit);color:#fff;border-color:transparent}',
    '.sheet td.stepcell{white-space:nowrap}',
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
    '.spark{position:absolute;width:9px;height:9px;border-radius:2px;pointer-events:none}',
    '@media (max-width:430px){.lever{right:-10px;transform:scale(.82);transform-origin:50% 30%}}',
    '@media (prefers-reduced-motion:reduce){.fab img,.marquee{animation:none}}',
    /* page mode: the cabinet IS the page — no button, no scrim, nothing to close */
    PAGE ? '.fab,.close{display:none}' +
           '.scrim{background:none;-webkit-backdrop-filter:none;backdrop-filter:none;' +
           'opacity:1;pointer-events:none}' +
           '.stack{pointer-events:auto}.cab{transform:none}' : ''
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
          '<button data-f="PAIR">Pair</button>' +
          '<button data-f="ALLDIFF">No match</button>' +
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
          '<img src="' + LOGO + '" alt="Master Concept">' +
          '<div class="mq"><span class="mq-name">Lucky Maco</span>' +
            '<span class="mq-sub">Master Concept</span></div>' +
        '</div>' +
        '<div class="glare"></div>' +
        '<div class="dump"></div>' +
        '<div class="hopper"></div>' +
        '<div class="window">' +
          '<div class="reel"><div class="strip"></div></div>' +
          '<div class="reel"><div class="strip"></div></div>' +
          '<div class="reel"><div class="strip"></div></div>' +
          '<div class="band"></div>' +
          '<div class="pip l"></div><div class="pip r"></div>' +
        '</div>' +
        '<div class="labels"><span>Morning</span><span>Afternoon</span><span>Evening</span></div>' +
        '<div class="msg" aria-live="polite"><b>Pull the lever</b>' +
          '<small>let&rsquo;s see your ' + today() + '</small></div>' +
        '<div class="hint"></div>' +
        '<div class="sheet"></div>' +
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

  try {
    var savedForce = parseFloat(localStorage.getItem('luckymaco:force'));
    if (savedForce >= 8 && savedForce <= 60) CFG.shakeForce = savedForce;
  } catch (e) {}

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
  var hPull  = function () { buzz(14); };                        // lever released
  var hStop  = function () { buzz(9); };                         // a reel lands
  var hShake = function () { buzz(28); };                        // shake registered
  var hPair  = function () { buzz([30, 45, 30]); };
  var hJack  = function () { buzz([70, 45, 70, 45, 70, 45, 90, 60, 320]); };  // long finish

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
  var hopper = $('.hopper'), dumpBox = $('.dump');
  function fillHopper() {
    var n = 10, h = '';
    for (var i = 0; i < n; i++) {
      var m = POOL[Math.floor(Math.random() * POOL.length)];
      h += '<img src="' + ICON(m) + '" alt="" style="left:' +
           (i / n * 104 - 4 + (Math.random() - 0.5) * 5).toFixed(1) + '%;bottom:' +
           (-8 - Math.random() * 9).toFixed(0) + 'px;transform:rotate(' +
           ((Math.random() - 0.5) * 54).toFixed(0) + 'deg)">';
    }
    hopper.innerHTML = h;
  }
  fillHopper();

  /* Jackpot: the hopper empties itself over the reels and piles up at the bottom. */
  var dumpTimer = null;
  function restock() {
    while (dumpBox.firstChild) dumpBox.removeChild(dumpBox.firstChild);
    fillHopper();
    hopper.style.opacity = '1';
  }
  /* count = how many Macoji fall; empty = whether the hopper drains with them.
     Jackpot dumps the lot, a pair just spills a few. */
  function dump(count, empty) {
    var box = cab.getBoundingClientRect();
    var H = box.height, W = box.width;
    if (dumpTimer) clearTimeout(dumpTimer);
    restock();                                   // clear any dump still in flight
    if (empty) { hopper.style.transition = 'opacity .3s'; hopper.style.opacity = '.15'; }

    /* Resting places are worked out up front by dropping each Macoji straight
       down at a random x and stopping the moment it touches one already placed.
       No columns, no rows — pieces nestle into whatever gaps exist, so the heap
       comes out organic. Circle-to-circle, since every Macoji is round. */
    var D = 42, PAD = 16, BASE = 26;
    var minX = PAD + D / 2, maxX = W - PAD - D / 2;
    var floorY = H - BASE - D / 2;
    var placed = [];

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
    function dropSpot() {
      /* Try a few random x's and take the one that settles lowest — that is what
         makes a pile fill its gaps and mound up instead of towering. */
      var best = null;
      for (var t = 0; t < 5; t++) {
        var x = minX + Math.random() * (maxX - minX);
        var y = restFor(x);
        if (!best || y > best.y) best = { x: x, y: y };
      }
      placed.push(best);
      return best;
    }

    for (var i = 0; i < count; i++) {
      (function (i) {
        var spot = dropSpot();
        var el = document.createElement('img');
        el.className = 'drop';
        el.src = ICON(POOL[Math.floor(Math.random() * POOL.length)]);
        el.style.left = spot.x.toFixed(1) + 'px';
        dumpBox.appendChild(el);
        var floor = spot.y;
        var turn = (Math.random() - 0.5) * 76;             // tossed, not filed away
        var rest = 'translate(-50%,' + floor + 'px) rotate(' + turn + 'deg)';
        el.animate([
          { transform: 'translate(-50%,-40px) rotate(0deg)', opacity: 0,
            easing: 'cubic-bezier(.4,0,.95,.6)' },                       // gravity
          { transform: rest, opacity: 1, offset: .34, easing: 'ease-out' },
          { transform: 'translate(-50%,' + (floor - 13) + 'px) rotate(' + (turn + 9) + 'deg)',
            opacity: 1, offset: .44, easing: 'ease-in' },                // bounce
          { transform: rest, opacity: 1, offset: .53 },
          { transform: rest, opacity: 1, offset: .88 },                  // the pile sits
          { transform: rest, opacity: 0 }
        ], { duration: 2900 + Math.random() * 700,
             delay: i * 26 + Math.random() * 55,          // ragged, not metronomic
             fill: 'backwards' })
          .onfinish = function () {
            el.remove();
            if (!dumpBox.children.length) restock();      // last one out
          };
      })(i);
    }
    /* Belt and braces: if the tab is hidden mid-dump the animations pause and
       onfinish may never land, which would leak these nodes. Sweep them anyway. */
    dumpTimer = setTimeout(function () { dumpTimer = null; restock(); }, count * 26 + 4400);
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
          delay: col * 90 + (ROWS - 1 - r) * 120,   // left to right, bottom row first
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
    stopSpinSound();
    lever.classList.remove('busy');
    var r = res.reels;
    if (res.pattern === 'TRIPLE') {
      msg.className = 'msg jackpot';
      msg.innerHTML = '<b><img src="' + BODY + '" alt="">JACKPOT!</b><small>Triple ' +
        label(r[0]) + ' &mdash; all of ' + today() + ' is yours</small>';
      celebrate();
    } else if (res.pattern === 'PAIR') {
      var dbl = r[0] === r[1] ? r[0] : r[2];
      msg.className = 'msg win';
      msg.innerHTML = '<b><img src="' + FACE + '" alt="">Nice pair!</b><small>A double-' +
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
    restart(cab, 'jackpot');
    restart(marquee, 'flash');
    restart($('.glare'), 'on');
    pulse([0, 1, 2], 'won');
    sJack(); sFall(); hJack(); dump(34, true);
    setTimeout(function () { marquee.classList.remove('flash'); }, 2100);
  }

  /* A pair stays inside the window: payline lights, the two matching Macoji
     wiggle. No shake, no strobe, nothing falls. */
  function celebrateSmall(res) {
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
    motionSeen = true;
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
  var SHAKE_LABEL = {
    unsupported: 'Not supported on this device',
    off:         'Turned off',
    ask:         'Tap Enable below',
    denied:      'Blocked \u2014 see below',
    ready:       'On',
    granted:     'On'
  };

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
  /* The hint is keyboard-only advice: pointless on a phone, and "Esc to close"
     is a lie in page mode where there is nothing to close. */
  (function () {
    var coarse = window.matchMedia && window.matchMedia('(pointer:coarse)').matches;
    if (coarse) return;
    $('.hint').innerHTML = 'Space to pull' + (PAGE ? '' : ' &middot; Esc to close');
  })();

  /* ── settings sheet ───────────────────────────────────────────────────── */
  var EMBED_SRC = 'https://lucky.mcai.dev/luckymaco.js';
  var sheet = $('.sheet'), sheetTick = null;
  var SHOWN = ['triple', 'pair', 'rows', 'spinSpeed', 'position', 'shake', 'shakeForce', 'haptics', 'set', 'mode'];

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
    sheet.innerHTML =
      '<h3>Odds</h3><table>' +
        '<tr><td>Jackpot &mdash; 3 identical</td><td>' + pct(CFG.triple) + '</td></tr>' +
        '<tr><td>Pair &mdash; 2 identical</td><td>' + pct(CFG.pair) + '</td></tr>' +
        '<tr><td>No match</td><td>' + pct(1 - CFG.triple - CFG.pair) + '</td></tr>' +
        '<tr><td>Suspense &mdash; reel 3 crawls</td><td>' +
          pct(CFG.triple + CFG.pair * CFG.nearMiss) + ' of pulls</td></tr>' +
      '</table>' +
      '<h3>Machine</h3><table>' +
        '<tr><td>Macoji in play</td><td>' + POOL.length + '</td></tr>' +
        '<tr><td>Rows</td><td>' + CFG.rows + '</td></tr>' +
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
          'higher = less sensitive</span></td><td class="stepcell">' +
          '<button class="step" data-d="-3">&minus;</button>' +
          '<b class="force">' + CFG.shakeForce + '</b>' +
          '<button class="step" data-d="3">+</button><br>' +
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
      '<pre>' + esc(embedCode()) + '</pre>' +
      '<div class="row"><button class="copy">Copy code</button>' +
      '<button class="primary done">Close</button></div>';
    sheet.querySelector('.copy').addEventListener('click', function (e) {
      e.stopPropagation();
      var btn = e.currentTarget;
      var write = navigator.clipboard && navigator.clipboard.writeText
        ? navigator.clipboard.writeText(embedCode())
        : Promise.reject();
      write.then(function () { btn.textContent = 'Copied'; })
           .catch(function () { btn.textContent = 'Select and copy'; });
      setTimeout(function () { btn.textContent = 'Copy code'; }, 1600);
    });
    sheet.querySelector('.done').addEventListener('click', function (e) {
      e.stopPropagation(); sheet.classList.remove('on');
    });
    sheet.querySelectorAll('.step').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var v = Math.max(8, Math.min(60, CFG.shakeForce + parseInt(b.dataset.d, 10)));
        CFG.shakeForce = v;
        try { localStorage.setItem('luckymaco:force', String(v)); } catch (err) {}
        sheet.querySelector('.force').textContent = v;
        peakMag = 0;
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
     Jackpot is 5%, so waiting for one to test the dump is painful. Triple-click
     (or triple-tap) the Master Concept mark to reveal buttons that force each
     outcome; triple-tap again to hide them. 900ms window, so it takes a real
     triple-click rhythm rather than three idle taps. Session-scoped, so it can
     never linger into a demo. */
  var TAPS = 3, TAP_WINDOW = 900;
  var testPanel = $('.test'), taps = 0, tapAt = 0;
  var marquee, mark;

  var flashTimer = null;
  function flash(html) {
    if (spinning) return;                       // never stomp on a result
    if (flashTimer) clearTimeout(flashTimer);
    var wasClass = msg.className, wasHTML = msg.innerHTML;
    msg.className = 'msg win';
    msg.innerHTML = html;
    flashTimer = setTimeout(function () {
      flashTimer = null;
      msg.className = wasClass; msg.innerHTML = wasHTML;
    }, 1500);
  }

  function setTest(on) {
    testPanel.hidden = !on;
    marquee.classList.toggle('armed', on);      // dashed ring = armed, at a glance
    try { on ? sessionStorage.setItem('luckymaco:test', '1')
             : sessionStorage.removeItem('luckymaco:test'); } catch (e) {}
    flash(on ? '<b>&#9881;&#65039; Test mode ON</b><small>forcing buttons below</small>'
             : '<b>Test mode off</b><small>back to normal odds</small>');
    if (on) {
      tone(880, 0.09, 'square', 0.10);
      setTimeout(function () { tone(1320, 0.12, 'square', 0.10); }, 90);
    } else { tone(440, 0.10, 'square', 0.08); }
  }
  marquee = $('.marquee'); mark = $('.marquee img');
  mark.addEventListener('click', function (e) {
    e.stopPropagation();
    mark.classList.remove('tapped');            // restart the pop on every tap
    void mark.offsetWidth;
    mark.classList.add('tapped');
    var now = Date.now();
    taps = (now - tapAt < TAP_WINDOW) ? taps + 1 : 1;
    tapAt = now;
    if (taps >= TAPS) { taps = 0; setTest(testPanel.hidden); }
  });

  root.querySelectorAll('.test button').forEach(function (b) {
    b.addEventListener('click', function (e) { e.stopPropagation(); yank(b.dataset.f); });
  });

  var wasArmed = false;
  try { wasArmed = sessionStorage.getItem('luckymaco:test') === '1'; } catch (e) {}
  if (CFG.test || wasArmed) setTest(true);

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
      var forced = { Digit1: 'TRIPLE', Digit2: 'PAIR', Digit3: 'ALLDIFF' }[e.code];
      if (forced) { e.preventDefault(); yank(forced); }
    }
  });

  window.LuckyMaco = {
    open: open, close: close, pull: yank,   // pull('TRIPLE'|'PAIR'|'ALLDIFF')
    configure: configure, config: snapshot, draw: draw, pool: function () { return POOL.slice(); },
    mute: function (v) { sound = !v; paintSound(); return !sound; },
    theme: function (t) {
      if (t) { CFG.theme = t; remember(t === 'auto' ? '' : t); }
      applyTheme(); return host.getAttribute('data-theme');
    }
  };
})();
