# Lucky Maco

A little Macoji slot machine. Pull the lever, shake your phone, or hit space.

**Play:** https://lucky.mcai.dev

## Embed it anywhere

```html
<script src="https://lucky.mcai.dev/luckymaco.js" defer></script>
```

Adds a floating Maco button in the corner that expands the game. No dependencies,
no network calls, nothing stored. Renders in a shadow root, so its styles and the
host page's cannot touch each other.

## Settings

All optional, set as `data-*` on the script tag.

| Attribute | Default | What it does |
|---|---|---|
| `data-triple` | `0.05` | Odds of 3 identical (jackpot) |
| `data-twins` | `0.10` | Odds of exactly 2 identical, any position. `data-pair` still works as an alias. |
| `data-near-miss` | `0.60` | Share of twins with the odd one on reel 3, so reel 3 crawls. Presentation only — pays the same either way. |
| `data-rows` | `3` | Visible rows per reel: 1, 3 or 5. Only the centre row pays. |
| `data-packing` | `1.2` | How tightly the heaps stack. `1` = faces touching, `1.3` = airier. Fewer fit as it rises, and the hopper's stock is the jackpot payout, so a looser machine pays out less. Range 0.8–1.5. |
| `data-spin-speed` | `1` | Multiplies every reel duration. `1.5` = half again as long, `0.7` = snappier. Range 0.4–2.5. |
| `data-mode` | `widget` | `widget` = floating button, `page` = always open |
| `data-theme` | `auto` | `auto` / `light` / `dark` |
| `data-position` | `bottom-right` | Or `bottom-left` |
| `data-sound` | `true` | Lever clunk, reel stops, win chimes (WebAudio, no files) |
| `data-shake` | `true` | Shake-to-pull on mobile (needs HTTPS) |
| `data-shake-force` | `18` | How hard a shake must be, 8–60. Measured as *change* in acceleration, so a still phone reads ~0. Higher = less sensitive. Tunable live from the ⚙️ sheet. |
| `data-haptics` | `true` | Vibration on pull, wins and shake. Android reliable; iOS Safari support is unreliable, so it self-detects. |
| `data-set` | — | Restrict the pool, e.g. `fire,joy,wink,grin` |

Also `window.LuckyMacoConfig = {...}` before the script, or `LuckyMaco.configure({...})`
at runtime. The ⚙️ button in the app shows current settings and generates the embed
snippet for you.

## The 28

The machine holds the whole set at once: **9 on the reels, 19 in the hopper**. The
hopper is a window onto a slightly wider heap, so a few run off the edges — there
is more back there than you can see, but the count is honest. On a jackpot all 28
fall into the reel window and stay there until the next pull.

## Odds

| Outcome | Layout | Odds |
|---|---|---|
| Jackpot | `X X X` | 5% |
| Twins | 2 identical, any position | 10% |
| No match | all different | 85% |

Outcome-first: the machine picks the **pattern** first, then fills it with random
faces. So the odds are independent of how many Macoji exist — adding art never
changes how often you win. Verified over 500,000 pulls at both 28 and 280 symbols.

## Hidden

Triple-click the Master Concept mark to reveal buttons that force a jackpot or
twins. Session-scoped. Or `LuckyMaco.pull('TRIPLE' | 'PAIR' | 'ALLDIFF')` from the console.

## Files

- `index.html` — the game, played full page
- `about.html` — how it plays, settings, embed snippet
- `luckymaco.js` — the whole widget, no dependencies
- `demo.html` — embed test on a deliberately hostile host page
- `sounds.html` — audition every sound option side by side
- `pour.html`, `pours.html` — physics prototypes for a Tsum Tsum style pour
