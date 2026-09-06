# Phase SB — A blurred strip behind the status bar

**What and why.** Scroll any screen on the phone and its text slides up
under the clock: James's capture of the Detail screen (2026-09-06, v0.39.2)
shows `← BACK` and `4:31` printed on top of each other. The cause is how
the app is set up, not a screen: `viewport-fit=cover` lets the page run
under the status bar, every screen pads its own top by
`env(safe-area-inset-top)` so nothing is under the clock AT REST, and the
moment the document scrolls that padding scrolls away with it. Apple's
guidance is one line — _"Obscure content under the status bar"_ — and the
preferred way is _"a blurred view behind the status bar."_ Native apps get
that from a navigation bar; we have no bar there, so this phase adds the
strip itself: one fixed element the height of the top inset, painted the
page's colour through a blur, that everything scrolls beneath. At rest
nothing changes on any screen. Scrolled, the clock stays legible and the
page reads as passing under glass.

**Why now.** Every scrolling screen shows it; it costs a rower nothing
functional but reads as a broken app on the first scroll. James: _"don't
want to overlook an easy win"_ — and then, seeing how many surfaces it
touches, _"don't treat this as fast path."_

**Gate class, spoken.** Not fast path, by James's call: one CSS rule and one
element, but rendered on every screen. Not TRIAD. **Antagonist: anchor pass
on this spec** (the census in §4 is the thing to attack). **PM at open and
close: SKIPPED, said aloud** — pure UI, no function changes, no tester
capability; the release call is "rides the next tag". **Gate 0: rendered on
the phone** (§5), because it changes what a rower sees on every scroll.

## 1. Research (the platform owns this)

- **PRIMARY — Apple HIG, "Status bars"** (fetched 2026-09-06 via the page's
  JSON): _"Obscure content under the status bar."_ · _"By default, the
  background of the status bar is transparent, allowing content beneath to
  show through. This transparency can make it difficult to see information
  presented in the status bar."_ · _"If controls are visible behind the
  status bar, people may attempt to interact with them and be unable to do
  so."_ · _"Be sure to keep the status bar readable, and don't imply that
  content behind it is interactive."_ · **_"Prefer using a scroll edge
  effect to place a blurred view behind the status bar."_** · _"Avoid
  permanently hiding the status bar."_
- **Does the system have the concept?** Yes: UIKit's navigation bar and
  the scroll edge effect are exactly this strip, drawn by the system for
  native view hierarchies. A WKWebView with `viewport-fit=cover` opts out
  of that and owns the region itself; there is nothing to assert on the
  system's behalf — we are supplying the view the HIG says to place there.
- **Ionic:** its `ion-header` carries the top inset so content scrolls under
  a header, not the clock (`ion-tab-bar`'s keyboard handling was read
  PRIMARY for Phase KB). The exact top-inset rule was NOT located in
  `toolbar.scss` or `toolbar.ios.scss` (fetched; both apply only left/right
  insets), so Ionic is cited for the shape only, not a line.
- **Prior art in this repo:** `grep -n "safe-area-inset-top" app/src/index.css`
  → 11 consumers, every one a per-screen `padding-top`; no fixed element
  owns the region. `ls docs/superpowers/research/` — nothing on the status
  bar.

## 2. Decision

One element and one rule, rendered once in `AppRoutes` (the signed-in
shell — the sign-in screen is a single viewport that does not scroll and
is left alone):

```tsx
// app/src/shell/AppRoutes.tsx, first child of .app-shell
<div className="status-backdrop" aria-hidden="true" />
```

```css
/* app/src/index.css */
.status-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: env(safe-area-inset-top, 0px);
  background: color-mix(in srgb, var(--page) 82%, transparent);
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
  pointer-events: none;
  z-index: 30;
}
```

- **Height is the inset itself**, so the strip is exactly the status bar's
  band on the phone and **0px on the web and in landscape** (iPhone reports
  no top inset in landscape — the housing is at the side; the landscape
  capture at Gate 0 confirms), where it is invisible by construction.
- **`pointer-events: none`** — the HIG's "don't imply content behind it is
  interactive" and its converse: a tap on the status bar must still reach
  WKWebView's scroll-to-top, and the element must never eat a tap meant
  for the page during a scroll.
- **`z-index: 30`** — above the tab bar (20) and the reader/releases
  overlay (10); `.tabbar`'s own comment names those two.
- **Blur, not paint**: an opaque `--page` strip would also obscure, but the
  HIG's preferred form is the blurred view, and blur makes the colour
  choice forgiving on any screen whose top is not exactly `--page` (§4).
  `color-mix` at 82% keeps the clock's black text on a near-page ground
  (contrast §5).
- **Nothing moves at rest.** No screen's padding changes; the strip sits
  over the padding every screen already has.

### Options, with every cost measured or marked

| Option | Outcome | Evidence |
| --- | --- | --- |
| **Fixed blurred strip (chosen)** | content scrolls under a blurred page-coloured band; the clock stays legible; nothing moves at rest | Gate 0 render |
| Opaque `--page` strip, no blur | same, but a hard edge where scrolled content is cut; the HIG names the blurred form as preferred | HIG PRIMARY; untested here |
| `@capacitor/status-bar` with `overlaysWebView: false` | the WebView starts below the status bar; every `env(safe-area-inset-top)` pad drops to 0 (11 rules re-checked); another plugin whose `load()` we have not read (Phase KB: a plugin's config surface is not its behaviour surface) | untested — not built |
| Per-screen sticky headers | the BACK row becomes a sticky bar on each screen — a redesign of every screen's top, not a fix | untested — out of scope |
| Leave it | the reported defect | measured (James's capture) |

## 3. What a rower sees

- **At rest, any screen:** identical to v0.39.2.
- **Scrolled, any scrolling screen:** the page passes under a blurred band
  the height of the status bar; the clock and indicators stay readable.
- **Landscape:** nothing — the strip is 0px tall.
- **Web:** nothing — no inset, 0px strip.

## 4. Surface census (what the strip sits over)

Method: every selector in `app/src/index.css` naming a screen-level
container (`*screen*`, `*surface*`, `*interstitial*`, `*overlay*`,
`.app-shell`, `.signin`, `.onb-screen`) was scanned for a `background`
declaration in its own rule (2026-09-06, this worktree). Result: **only
`.overlay-screen` sets one, and it is `var(--page)`**; every other screen
inherits `body { background: var(--page) }`. So the region under the
status bar is `--page` on every screen at rest, and the strip's blurred
`--page` matches it exactly.

What the antagonist should attack in that method: it reads each rule's own
declarations, so a screen whose FIRST CHILD is full-bleed and differently
coloured (a dark hero at the very top of the connected surface, say) would
pass the census and still put a dark edge under the strip when scrolled.
Two facts narrow it: the non-scrolling screens (`.timer-screen`,
`.countdown-screen`, `.connected-surface`, `.connected-interstitial` —
`100dvh`, own scrollers inside) never move their top edge, so the strip
sits over their own padding forever; and the blur is there precisely so a
near-miss reads as glass, not a bar.

## 5. Gate 0 — rendered on the phone, before this is called done

A Debug build of this branch on Kaito, installed with `devicectl` (the
recipe in `docs/testing/2026-09-06-keyboard-harness.md` §2), and captures
beside v0.39.2's:

1. **Detail, scrolled** so `← BACK` is under the clock — the reported
   frame (James's v0.39.2 capture is the before).
2. **Library, scrolled** — a list under the strip, portrait.
3. **Landscape, Detail scrolled** — expected: no strip (0px), status bar
   hidden by iOS.
4. **A non-scrolling screen at rest** (timer or connected) — expected:
   pixel-identical to v0.39.2.

**Colour pairings, computed:** the only text on the strip is iOS's own
status bar (black, `#000000`) over the blurred ground, which at 82%
`--page` (`#f4f1e8`) over `--page` is `#f4f1e8` at rest — **18.6:1**; over
the darkest thing that scrolls under it, `--ink` text (`#1b1a17`) at 18%
through the mix, the ground is no darker than
`color-mix(#f4f1e8 82%, #1b1a17 18%)` ≈ `#ccc9c1` → **13.2:1**. Both far
above AA 4.5:1; the blur only lightens further.

Present the captures, state the numbers, and stop. The gate is the
approval, not the presentation.

## 6. One PR

- `app/src/index.css`: the rule in §2.
- `app/src/shell/AppRoutes.tsx`: the element.
- `app/src/shell/AppRoutes.test.tsx`: renders the backdrop (red first).
- `app/e2e/design.spec.ts`: a structural assertion — the backdrop exists,
  is `position: fixed` at `top: 0`, `pointer-events: none`, z-index above
  `.tabbar`'s; it CANNOT see the inset on Chromium (0px) and says so.
  Mutation: drop `pointer-events: none` → the assertion names it.
- `docs/design/DEVIATIONS.md`: a row (the handoff has no status-bar strip).
- `ROADMAP.md`: this phase's section; the ledger bullet at close.
- No release note of its own: cosmetic, rides the next tag's "polish"
  line if one is written.

## 7. Instruments (RF19)

The inset exists only on the device; Chromium reports 0. The e2e assertion
pins the element's shape; Gate 0 is the only place the band itself is seen.
Accepted: a future change that breaks the blur (a `transform` ancestor, a
`z-index` reshuffle) is visible on the first scrolled screenshot a phone
takes, and `pnpm screenshots` on the web cannot show it.

## 8. Exit

- Gate 0 approved on the four captures.
- Unit + client green; e2e green with the new assertion and its recorded
  mutation; no web capture moved (0px strip).
- DEVIATIONS row present; ROADMAP ledger bullet at close.
- Release: **not needed alone** — rides the next tag.
