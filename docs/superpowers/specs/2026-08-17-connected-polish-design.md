# Phase CS (connected swipe + NEXT): the gesture returns, the footer says more

**Date:** 2026-08-17 · **Status:** amended per the phase-open gates (PM
GO-WITH-CHANGES C1-C9; antagonist anchor A1-A8/B1-B4) and James's three
rulings; awaiting his spec approval. · **Phase code CS** (CP is taken:
ROADMAP's "the pause that isn't").

## What and why

Swipe comes back, and the NEXT line tells you the distance and rate
you're about to row. Both are James's device feedback on the released
v0.10.0. Swiping LIVE↔GRID was cut at CR2 spec 3's design gate (Ruling
3/4); James is reversing that — and he reports the ORIGINAL swipe
failed under his finger in the native app (his answer at this gate,
2026-08-17), so the reimplementation carries a real unexplained failure
and is treated as a device-interaction item: probe first, never fast
path. The footer's `NEXT · WORK 2:13.0 · then REST …` becomes
`NEXT · WORK 1500m · 2:13.0 @24` — the then-clause dies everywhere
(James: one richer phase in BOTH orientations), and time-work separates
its two clock numbers with the house middle dot (James's ruling):
`WORK 6:00 · 2:13.0 @24`.

Sequencing (PM + antagonist, agreed): **Item B first, merging on its own
gates**; Item A follows its probe. Neither is triad. Release: v0.10.2
PATCH once both land (or B alone if A dies at the probe); notes must
NAME the swipe — a gesture nobody knows exists is not a feature.

## Item A — swipe between panes (probe first)

### The corrected history (both gates, evidence cited)

- The deleted implementation ALREADY had `touch-action: pan-y` on the
  handler element (git show 3dc3b06^: `index.css:6041`, documented) —
  the spec's original missing-touch-action hypothesis is FALSIFIED.
- The credible candidate: the old handler was `touchstart`+`touchend`
  only — no `touchmove`, no `touchcancel`, no dominant-axis check —
  committing on an event WebKit never delivers once it claims the
  gesture (PM inference, unconfirmed; the probe's job).
- Pointer Events do NOT escape arbitration: `pointercancel` fires when
  the UA takes the gesture and implicitly releases capture (PRIMARY:
  W3C PE3; MDN). PE is still preferred — one handler set, pen/mouse
  free, and an explicit `pointercancel` path where the old code had
  nothing — but as hygiene, not as a shield.
- Two further candidates the probe must distinguish (antagonist A4/A5):
  `touch-action` intersects only up to the FIRST SCROLL CONTAINER (MDN,
  PRIMARY) and the grid pane has its own `overflow-y: auto` scroller
  (`index.css:6754`) — a GRID-origin swipe may never see the surface's
  `pan-y`; and every harness that ever tested this gesture ran an IDLE
  static DOM while the real surface re-renders 5-11×/s on iOS — a busy
  main thread handing the gesture to UIKit is SUSPECTED (no primary
  source; WebKit bug 204664 SECONDARY) and untouched by either fix.
- The 2026-08-13 walk's "swiping LIVE↔GRID … it holds" pass was about
  column stability; James's recollection stands: drags did nothing in
  the native app. The walk record for this item must capture what the
  original report lacks: medium (WKWebView vs Chrome), build, iOS
  version.

### Step 0 — the probe (before ANY ladder is built)

`VITE_ENABLE_FAKE_MONITOR=1 pnpm ios:build && pnpm ios:open` puts the
real surface in WKWebView on James's phone — no erg, no TestFlight, no
build number (the CR2 close gate's own instrument). Implement the
minimal PE handler on a branch, drive the fake, swipe with Safari Web
Inspector attached, and LOG the actual pointer/touch event sequence
under: a clean horizontal drag, a diagonal, a slow drag, a drag during
active fake ticking (the busy-main-thread case), and a GRID-origin drag
(the scroller-intersection case). The trace decides which candidate is
real; the ladder is built around a known answer. ~1 hour, and it is
the phase's cheapest possible falsifier.

### Design (contingent on the probe)

- PE handlers on the surface: `pointerdown` (origin + capture),
  `pointermove` (delta), `pointerup` (commit: |Δx| ≥ 48px AND
  |Δx| > |Δy|), `pointercancel` (clean abort — logged to the ring so a
  field failure finally leaves evidence).
- `touch-action: pan-y` on `.connected-surface` AND `.connected-pane`
  AND the grid scroller (the intersection rule), each pinned in the
  structural tests (`PaneGrid.test.tsx:1388`'s "no rule left to pin"
  comment retires).
- Additive: the segmented control stays the accessible/discoverable
  path; swipe drives the same `pane` setter; per-rower persistence
  unchanged; no wraparound; no slide animation (Ruling 3's cut stands —
  only the gesture returns).
- Guards: no swipe while the LOG SHEET is open (it renders inside the
  surface — antagonist A7); ignore pointers starting on interactive
  elements (capture retargeting makes this the correct and sufficient
  child-click guard — PE3, held); single pointer only.

### Verification ladder

1. Unit: handler logic in jsdom (delta, cancel, dominant axis, guards).
2. **Regression pin, NOT a gate** (PM C2): real-touch e2e in
   `connected.spec.ts` (the live fake-driven walk — the static fixtures
   have no React and cannot host this, antagonist B4), Playwright
   `hasTouch` + CDP touch, four drag shapes + vertical-scroll
   preservation + a CPU-throttled variant
   (`Emulation.setCPUThrottlingRate`, the scroll-echo recipe). Labeled
   a pin because Chromium+CDP already passed while the device failed —
   necessary, never sufficient.
3. **The phone leg is mandatory and IS the item** (antagonist A6): a
   `/hardware-walk` (or standalone phone session) exercising swipe in
   the native app, medium/build/iOS recorded. The laptop leg is smoke.
4. **Disposition rule for a failed walk** (antagonist A8): if the phone
   leg fails, the handler DOES NOT SHIP — the PR reverts to B-only, the
   probe trace + walk evidence are committed as the mystery's first
   real record, and item A refiles with that evidence. No shipping an
   unverified device interaction; CR2's Ruling 4 precedent.

## Item B — the NEXT line says more (ships first)

### Composition — exhaustive over `Phase["type"]` (antagonist B2)

Built from `EnginePhase.label` (the domain's already-resolved display
value — never re-derived from `targetSplit`, PM C5), plus extent and
`@spm` where present. The table (landscape shows the `NEXT · ` prefix;
portrait shows the same value under its stacked UP NEXT label — James:
one richer phase everywhere, portrait's second phase retires):

| Next phase | Line value |
| --- | --- |
| work, distance, split target | `WORK 1500m · 2:13.0 @24` |
| work, time, split target | `WORK 6:00 · 2:13.0 @24` (middle dot, James's ruling) |
| work, effort target | `WORK 1500m · ALL OUT` (label word; effort's number is never real — 5G) |
| warm-up | `WARM-UP 2000m · Easy` / `WARM-UP 10:00 · Easy` (label KEPT — the rower must see it is not a working interval, James's standing rule) |
| test | `TEST · All out` (no extent fields exist on a test phase) |
| rest | `REST 1:00` |
| past the last | `FINISH` |

`@spm` appears only when `spm` is set; extent is `meters` (as `1500m`)
or `seconds` (house duration format); armed branch keeps its shift
(NEXT names the first interval; the warm-up row above is literally the
first thing NEXT says for a warm-up-on rower). `thenNext` leaves the
model; its CSS (`.connected-band-upnext-then`, base + landscape) is
deleted with it (recurring failure #5).

### Width (antagonist B1 — measured, not designed)

Across all 3,063 phases of the seeded 300 (2k 1:52 / 6k 2:02
baselines): new worst case 30 chars vs today's shipped 39 (`NEXT ·
WORK ALL OUT · then WORK ALL OUT`). The enriched line fits wherever
today's fits, both orientations. The existing ellipsis on
`.connected-band-upnext-value` and the two committed
`scrollWidth <= clientWidth` pins stay as the backstop — now
load-bearing as proof the ellipsis path is NEVER entered, and the
criterion is the PM's: the seeded library's longest string shows its
rate on the reference landscape frame.

### Blast radius (named, antagonist B4)

`surfaceModel.ts` (`upNext` builder; `thenNext` retired) +
`PaneLive.tsx:191-206` + `index.css`; 6 of 10 frozen
`connected-*.html` fixtures carry then-markup (client-project file
snapshots — they go red at the first commit, expected); exact-string
e2e at `design.spec.ts:5121/:6177/:6322-6327`,
`screenshots.spec.ts:2573-2578/:2701-2706`; `PaneLive.test.tsx:245-308`
and `surfaceModel.test.ts:658-702`; screenshots re-captured; the
spec-3 handoff's DEVIATIONS row reconciled. Timer.tsx untouched.

## Exit criteria (each can fail)

1. Probe trace committed with a named verdict on the three candidates
   (touchend-only, scroller intersection, busy main thread) — or a
   reproduction failure honestly recorded.
2. Phone leg: swipe LIVE↔GRID by finger in the native app, medium/
   build/iOS recorded. Failure ⇒ the disposition rule above (A does
   not ship; this criterion stays red and says so).
3. NEXT renders every row of the composition table from seeded-library
   fixtures (property test over the type union × optional fields —
   PM C6), pixel-verified in refreshed screenshots, then-clause gone
   from both orientations, and the longest seeded string shows its
   rate on the reference landscape frame.
4. Full gates green (client, e2e incl. the touch pin, screenshots);
   per-file coverage at the bar; segmented-control tests untouched and
   green.
5. CR2 Item 4 non-implication recorded (PM): the NEXT line is
   23/30px, not the 10px label size Item 4 names — stated here so no
   reader re-derives it.

## Honest limits

- The probe may not reproduce the failure (idle fake vs real session
  variables); a clean probe plus a failed walk is possible, and the
  disposition rule covers it.
- Item B drops portrait's second phase (James's explicit ruling, not a
  side effect).
- The timer's UP NEXT keeps its old format; a richer timer line is its
  own future item.
