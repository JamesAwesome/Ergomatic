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
  background: rgba(244, 241, 232, 0.82); /* --page #f4f1e8 at 82% — see below */
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
- **`pointer-events: none`** — a 59px full-width fixed strip at z 30 must
  never swallow a tap meant for content that scrolled under it. (Anchor
  pass m1 corrected rev 1's reason: the status-bar scroll-to-top gesture
  is UIKit's, dispatched to the native `UIScrollView` — `scrollsToTop`
  defaults `true`, Capacitor never sets it — and no DOM property can reach
  it in either direction.)
- **`rgba(244, 241, 232, 0.82)`, not `color-mix(... var(--page) ...)`**
  (anchor pass B1, BLOCKING in rev 1): the app's floor is
  `IPHONEOS_DEPLOYMENT_TARGET = 15.0` (`project.pbxproj`; `Package.swift`
  `platforms: [.iOS(.v15)]`) and `color-mix()` ships in Safari/iOS **16.2**
  (MDN browser-compat-data, `css/types/color.json`). Worse than "dropped":
  a declaration carrying `var()` is invalid at COMPUTED-value time, so the
  property computes as `unset` (CSS Custom Properties L1 §3.1 — PRIMARY:
  _"the computed value is … as if the property's value had been specified
  as the `unset` keyword"_), and a fallback `background:` line above it in
  the same block is discarded with it. On 15.0–16.1 the strip would have
  been an untinted 14px blur. The literal is the house idiom
  (`rgba(27, 26, 23, 0.45)` on `.filter-sheet-backdrop`); the cost is that
  the strip no longer follows the `--page` token, stated here.
  `-webkit-backdrop-filter` has no floor problem (iOS 9+ prefixed;
  unprefixed from 18.0 — WebKit "Features in Safari 18.0": _"you don't need
  the prefix"_).
- **`UIStatusBarStyle = UIStatusBarStyleDarkContent`** in `Info.plist`
  (anchor pass M1): Capacitor ships `.default` — Apple: _"automatically
  selects an appearance for the status bar and updates it dynamically to
  maintain contrast with the content below it"_ — which under system Dark
  Mode may draw WHITE glyphs; over this strip that would be 1.13:1. This
  app is light-only (`grep -rn prefers-color-scheme src/` → nothing), so
  the plist key Capacitor already reads (`setStatusBarDefaults()` maps it
  to `.darkContent`: _"A dark status bar, intended for use on light
  backgrounds"_) makes the glyphs dark everywhere and §5's numbers
  unconditional. Gate 0 adds a Dark Mode capture to see it.
- **`z-index: 30`** — above the tab bar (20) and the reader/releases
  overlay (10); it ties `.filter-sheet-backdrop` (30) and loses on DOM
  order (the strip is `.app-shell`'s first child; sheets render inside
  `<Routes>` after it), which is the right outcome — a modal scrim covers
  the status-bar band. The full z census is 10/20/30/30 over exactly four
  `position: fixed` rules; no `.tsx` sets a z-index and nothing portals
  (anchor pass m4).
- **Blur, not paint**: an opaque `--page` strip would also obscure, but the
  HIG's preferred form is the blurred view, and blur makes the colour
  choice forgiving on any screen whose top is not exactly `--page` (§4).
  The 82% tint keeps the clock's dark glyphs on a near-page ground
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
| Hide the status bar on the immersive screens (timer, countdown, connected) — the HIG's "consider temporarily hiding the status bar when displaying full-screen media"; `CAPBridgeViewController.setStatusBarVisible(_:)` exists | those screens do not scroll, so they never show the defect; hiding trades the clock for nothing here | untested — not built (anchor pass m5 asked for the row) |
| Leave it | the reported defect | measured: `docs/testing/2026-09-06-status-bar-backdrop/before-v0.39.2-detail-scrolled-crop.jpg` (James) and `docs/testing/2026-09-06-keyboard-probe/captures/app-v0.39.1-portrait-scrolled.png` (the clock over a `--surface` card, the battery pill over the red `10'` on the RIGHT) |

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

**What the anchor pass established about that census (M3):** its RESULT is
right — reproduced programmatically, and every route's root carries
`.screen`'s inset padding (route-by-route walk of every `<main>`; the sole
exception, `SignIn`, is never rendered by `AppRoutes` and cannot scroll).
But it samples the REST state, where the strip is invisible by
construction, and the design only acts when SCROLLED — where what passes
under it is everything the screen contains, not its container. The
committed capture `docs/testing/2026-09-06-keyboard-probe/captures/app-v0.39.1-portrait-scrolled.png`
shows the real scrolled band: a `--surface` card (not `--page`) behind the
clock, and the app's red `10'` under the battery pill on the RIGHT half.
The blur is what turns those into glass; the census cannot say whether it
does, and Gate 0 is where that is seen. The four `100dvh` screens
(`.timer-screen`, `.countdown-screen`, `.connected-surface`,
`.connected-interstitial`) never move their top edge, so the strip sits
over their own padding forever. Six routes render `.overlay-screen`
(Reader, Releases, FromTheLog, Concept2Screen, Diagnostics, MonitorLogs),
whose content scrolls INSIDE a fixed `-webkit-overflow-scrolling: touch`
element rather than in the document — a different composition under the
blur, and in Gate 0's set for that reason (M2).

## 5. Gate 0 — rendered on the phone, before this is called done

A Debug build of this branch on Kaito, installed with `devicectl` (the
recipe in `docs/testing/2026-09-06-keyboard-harness.md` §2), and captures
beside v0.39.2's:

1. **Detail, scrolled** so `← BACK` is under the clock — the reported
   frame (James's v0.39.2 capture is the before).
2. **Library, scrolled** — a list under the strip, portrait.
3. **Landscape, Detail scrolled** — expected: no strip (0px). Not because
   "iOS hides the status bar in landscape" as rev 1 said — Capacitor's
   `prefersStatusBarHidden` returns `false` in every orientation — but
   because two device captures in this repo show no status bar and a 0
   top inset there (`docs/design/findings/2026-09-02-timer-mode-landscape.png`;
   the 2026-08-17 measurement in `index.css`'s landscape notes). One
   residual, SECONDARY (Apple Forums 798014): iOS 26 has reported a stale
   20px landscape inset until a background/foreground — that would paint
   a stray band, and this capture is where it would show.
4. **A non-scrolling screen at rest** (timer or connected) — expected:
   pixel-identical to v0.39.2.
5. **Releases (`/news/releases`), scrolled** — an `.overlay-screen`: its
   list scrolls inside a fixed `-webkit-overflow-scrolling: touch` element
   under the blur (M2 — no source either way on backdrop sampling there;
   one capture settles it).
6. **Phone in Dark Mode, Library scrolled** — the glyphs must be dark
   (the plist key), not white over cream (M1).
7. **The straddle** (m3): scroll until a text row sits half under the
   strip's bottom edge. A constant blur with a hard edge is not Apple's
   progressive scroll-edge effect; the half-blurred row is the cost, and
   James should see it rather than read about it.

**Colour pairings, computed (recomputed by the anchor pass):** the only
text on the strip is iOS's own status bar — dark glyphs, now guaranteed by
`UIStatusBarStyleDarkContent` — over the blurred ground: at rest 82%
`#f4f1e8` over `#f4f1e8` is `#f4f1e8` → **18.6:1**; over the darkest thing
that scrolls under it (`--ink` `#1b1a17` at 18% through the tint) the
ground is `#cdcac2` → **12.8:1**. Both far above AA 4.5:1. Without the
plist key, white glyphs on the same grounds would be 1.13:1 and 1.64:1 —
the Dark Mode capture is there to show which we got.

Present the captures, state the numbers, and stop. The gate is the
approval, not the presentation.

## 6. One PR

- `app/src/index.css`: the rule in §2.
- `app/src/shell/AppRoutes.tsx`: the element.
- `app/ios/App/App/Info.plist`: `UIStatusBarStyle` =
  `UIStatusBarStyleDarkContent`.
- `app/src/shell/AppRoutes.test.tsx`: renders the backdrop (red first:
  "expected to have a length of 1 but got +0").
- `app/e2e/design.spec.ts`, two tests: the shape (fixed, top 0,
  `pointer-events: none`, z above `.tabbar`, `aria-hidden`, and the tint
  literal — a dropped `background` shows here on Chromium), and the
  geometry through CDP's `Emulation.setSafeAreaInsetsOverride` (rev 1
  claimed Chromium could not see the inset; the suite already emulates it
  at five sites — anchor pass B2): 0px with no inset, exactly 62px with
  one, and a scrolled `.workout-row` overlapping the strip. Mutations:
  `pointer-events` dropped → "Expected: none, Received: auto";
  `height: 20px` hardcoded → recorded in the PR.
- `docs/design/DEVIATIONS.md`: a row (the handoff has no status-bar strip).
- `ROADMAP.md`: this phase's section; the ledger bullet at close.
- No release note of its own: cosmetic, rides the next tag's "polish"
  line if one is written.

## 7. Instruments (RF19)

The e2e tests pin the element's shape and — through a CDP-emulated inset —
that its height is the inset and that scrolled content ends up under it.
That proves the CSS reacts to an inset, not what iOS reports; Gate 0 is
where the real band is seen. Accepted and named: a future change that
breaks the blur (a `transform` ancestor, a `z-index` reshuffle) is visible
on the first scrolled screenshot a phone takes, and `pnpm screenshots` on
the web cannot show it; the scroll-performance cost of a `backdrop-filter`
strip on iOS is UNMEASURED (no primary source found either way) and Gate
0's scrolled captures are the only reading.

## 8. Exit

- Gate 0 approved on the seven captures in §5.
- Unit + client green; e2e green with the new assertion and its recorded
  mutation; no web capture moved (0px strip).
- DEVIATIONS row present; ROADMAP ledger bullet at close.
- Release: **not needed alone** — rides the next tag.
