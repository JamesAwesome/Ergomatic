# Swipe probe — 2026-08-17 (Phase CS Item A, Step 0)

**Verdict: the swipe works on the device. What kills a grid-origin drag is
our own interactive-element guard, not WebKit.**

Medium: native Capacitor app (WKWebView) on James's iPhone, built from
branch `probe-swipe` (`d1da5f7`, throwaway — never merged). Trace captured
to `sessionStorage` and retrieved with
`copy(sessionStorage.getItem("ergomatic:probe-swipe"))`. 1779 events over
~63 s of drags.

**On the build flag, corrected 2026-08-18:** the probe was built with
`VITE_ENABLE_FAKE_MONITOR=1` because the spec said that yields a fake
device on the phone. It does not. `adapters/monitorTransport.ts` picks the
Capacitor BLE arm whenever `isNative()`, and only the WEB arm reaches the
fake seam — so the session behind this trace was a real PM5, and the flag
was inert. Nothing in the verdict below depends on it (every claim here is
read off pointer/touch events and the DOM), but a later reader must not
infer that a fake can drive the native app. It cannot.

## What James saw

| Scenario | Result |
| --- | --- |
| Clean horizontal drag | works |
| Diagonal drag | works |
| Slow horizontal drag | works |
| Drag while the numbers are ticking | works |
| **Drag starting on a grid line** | **does nothing** |

His own note on the failure: "might be an issue for larger grids" — the
more rows a program has, the more of the pane is un-swipeable.

## The three candidates, judged against the trace

**1. Our interactive guard — CONVICTED.** The probe rejects a pointer whose
target matches `closest("button, a, input, select, textarea, [role]")`.
`.connected-grid-rows` carries `role="group"` (`PaneGrid.tsx:141-146`, for
the keyboard-scrollable list), so **every** pointerdown anywhere in the row
list resolves to an ancestor with a `[role]` and is refused before tracking
starts. The rows themselves are plain `<div>`s with no handler
(`PaneGrid.tsx:163-172`) — nothing about them is operable. The `[role]`
wildcard was the mistake: the roles inside the surface are `status` (the
lost-connection banner), two `group`s (this list, the log sheet's log) and
`dialog` (`SheetShell.tsx:127`) — all structural, none operable.

The refusal is a disjunction, so the other arm has to die too: while the
log sheet is open its backdrop is `position: fixed; inset: 0; z-index: 30`
(`index.css:663-672`), so nothing can hit-test to a grid row. A recorded
target of `connected-grid-row` therefore proves `logSheetOpen === false`,
and the quoted entries show it directly.

Nearly every operable control here is a native `<button>` — with one
exception worth naming, since the fix leans on the rule: `SheetShell`'s
dismiss backdrop is a `<div onClick>` (`SheetShell.tsx:123`). It was not
matched by the old predicate either, so it is not a regression, but it is
why the narrowing carries a `data-swipe-ignore` opt-out and puts the sheet
behind two guards instead of one.

Decisive pair from the trace — same pane, same direction, opposite outcome,
the only difference being which element the finger landed on:

Entries below are verbatim, every field included — `logSheetOpen` in
particular, because the probe's refusal is a disjunction
(`if (logSheetOpen || interactive) return;`) and a reader must be able to
see which disjunct fired. Only `touchmove` runs are elided, and the
elision is marked.

```json
{"kind":"pointer","type":"pointerdown","pointerType":"touch","x":289,"y":230.33333333333331,"target":"connected-pane connected-pane-grid","interactive":false,"logSheetOpen":false,"seq":995,"t":1787015004001}
{"kind":"pointer","type":"pointerup","pointerType":"touch","x":578.6666666666666,"y":207.66666666666666,"target":"screen connected-surface","tracking":true,"seq":1022,"t":1787015004183}
{"kind":"commit","reason":"pane-change","from":"grid","to":"live","dx":289.66666666666663,"dy":-22.666666666666657,"seq":1023,"t":1787015004184}
```

```json
{"kind":"pointer","type":"pointerdown","pointerType":"touch","x":598.3333333333334,"y":123.33333333333333,"target":"connected-grid-row connected-grid-active","interactive":true,"logSheetOpen":false,"seq":830,"t":1787015000501}
{"kind":"touch","type":"touchmove","pointerType":"touch","x":565,"y":126,"touches":1,"target":"connected-grid-row connected-grid-active","seq":833,"t":1787015000531}
… 15 further touchmove entries, seq 834-848, elided …
{"kind":"touch","type":"touchmove","pointerType":"touch","x":212.6666666666667,"y":157.66666666666666,"touches":1,"target":"connected-grid-row connected-grid-active","seq":849,"t":1787015000796}
{"kind":"pointer","type":"pointerup","pointerType":"touch","x":211.00000000000003,"y":158.33333333333331,"target":"connected-grid-row connected-grid-active","tracking":false,"seq":850,"t":1787015000798}
```

The second drag travelled −387px — eight times the 48px threshold — and
produced no commit. Note it also produced no `pointermove` entries: that is
the probe's own logging gate (moves are logged only while tracking), not
evidence the browser withheld them.

**2. `touch-action` / scroller intersection — FALSIFIED for the horizontal
case, CONDITIONALLY.** The touch stream ran the full length of every
grid-origin drag and ended in `touchend`; `pointerup` (not `pointercancel`)
was delivered, on the original target, with no capture in play. The UA never
claimed the gesture, so the scroller never got the chance to swallow it. **No
`pointercancel` and no `touchcancel` appears anywhere in the 1779 events.**

The condition, which matters: the probe build **added** `touch-action:
pan-y` in three places (`.connected-surface`, `.connected-pane`,
`.connected-grid-rows`), and `connected-polish` has **none** — `grep -n
"touch-action" app/src/index.css` returns nothing today; it retired with
the old handler. This falsification transfers to the shipped build only if
those declarations ship with the handler. Land the handler without the CSS
and the probe says nothing about what happens.

**3. Busy main thread — FALSIFIED.** The "while the numbers are ticking"
drag committed normally (`seq 1024-1044`), with `pointermove` arriving on a
steady ~16 ms cadence throughout. The surface re-rendering 5-11×/s does not
cost the gesture.

**The historical failure is NOT reproduced, and that is the honest record.**
The deleted implementation (`git show 3dc3b06^`) had no interactive guard at
all, so this probe's failure mode cannot have been its failure mode. Its
`onTouchStart`/`onTouchEnd` pair with no `onTouchCancel` remains the standing
hypothesis for why it died under the finger — untestable now, and the new
design's `pointercancel` path covers it either way.

## What this buys the implementation

- The Pointer Events design is confirmed on the device: capture retargeting
  works (`target` flips to `screen connected-surface` after the first move),
  the 48px + dominant-axis commit rule behaves, and the no-op paths fire as
  designed (`below-threshold`, `not-dominant-axis`, `clamped-no-op` all
  appear in the trace).
- Our handler declines vertical drags: `seq 494-520` is a −178px vertical
  drag over the grid that commits `below-threshold` instead of paging. Note
  what this does NOT show — that scrolling survives. See the open item
  below: the list probably could not scroll at all.
- The guard must be narrowed to elements that are actually operable, and
  `[role]` must not appear in it.

## Open, not settled by this probe — and it is a real risk

**The grid almost certainly could not scroll during this probe.**
`.connected-grid-rows` is `flex: 0 1 auto` and hugs its content
(`index.css:6727-6733`), and the successful grid-origin drag's pointerdown
landed on bare `.connected-pane-grid` at y=230 (seq 995) — a point that
would be *inside* the row list if the list had filled its box. So every
"the scroller didn't interfere" observation above was taken where no
scroller could interfere. (Inference from one hit-test target, not proof.)

**What a scrollable list changes.** `touch-action: pan-y` correctly forbids
the UA from claiming a *horizontal* pan, and that reasoning holds. What a
long program newly enables is **vertical** panning — and WebKit applies a
directional-lock slop to it. W3C Pointer Events issue
[#303](https://github.com/w3c/pointerevents/issues/303), filed by a WebKit
engineer in 2019, describes exactly this: on iOS, a page that scrolls
vertically delivers `pointercancel` during a horizontal pan "unless the user
is careful not to stray from a very straight horizontal panning gesture."
The issue exists *because Safari and Chrome disagree*, which is also why no
Chromium test can ever see it.

**No declaration prevents it.** Only `touch-action: none` on the scroller
would, and that kills grid scrolling outright. `pan-y` is already the
maximal correct claim; arbitration past that belongs to the UA. The failure
mode is benign and recoverable — the list scrolls, the swipe doesn't take,
the segmented control still works — and it is bounded to diagonal drags on
programs long enough to scroll.

**Consequence for verification.** A phone leg on a short program is
indistinguishable from this probe, and a Chromium pin is on the wrong side
of a documented interop gap. The walk must therefore use a program whose
grid genuinely overflows (≥9 rows in landscape, ≥16 in portrait, against
the committed scroller budgets in `screenshots.spec.ts:2546-2547`) and must
include a deliberate **diagonal** drag starting inside the rows.
