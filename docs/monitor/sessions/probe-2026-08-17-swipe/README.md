# Swipe probe — 2026-08-17 (Phase CS Item A, Step 0)

**Verdict: the swipe works on the device. What kills a grid-origin drag is
our own interactive-element guard, not WebKit.**

Medium: native Capacitor app (WKWebView) on James's iPhone, built from
branch `probe-swipe` (`d1da5f7`, throwaway — never merged) with
`VITE_ENABLE_FAKE_MONITOR=1`. Trace captured to `sessionStorage` and
retrieved with `copy(sessionStorage.getItem("ergomatic:probe-swipe"))`.
1779 events over ~63 s of drags.

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
starts. The rows themselves are plain `<div>`s with no handler — nothing
about them is operable. The `[role]` wildcard was the mistake: the only
three roles inside the surface are `status` (the lost-connection banner)
and two `group`s (this list, the log sheet's log) — all structural, none
operable. Every genuinely operable control in the surface is a native
`<button>`.

Decisive pair from the trace — same pane, same direction, opposite outcome,
the only difference being which element the finger landed on:

```json
{"type":"pointerdown","x":289,"y":230.3,"target":"connected-pane connected-pane-grid","interactive":false,"seq":995}
{"type":"pointerup","x":578.7,"y":207.7,"target":"screen connected-surface","tracking":true,"seq":1022}
{"kind":"commit","reason":"pane-change","from":"grid","to":"live","dx":289.7,"dy":-22.7,"seq":1023}
```

```json
{"type":"pointerdown","x":598.3,"y":123.3,"target":"connected-grid-row connected-grid-active","interactive":true,"seq":830}
{"type":"touchmove","x":565,"y":126,"target":"connected-grid-row connected-grid-active","seq":833}
{"type":"touchmove","x":212.7,"y":157.7,"target":"connected-grid-row connected-grid-active","seq":849}
{"type":"pointerup","x":211,"y":158.3,"target":"connected-grid-row connected-grid-active","tracking":false,"seq":850}
```

The second drag travelled −387px — eight times the 48px threshold — and
produced no commit. Note it also produced no `pointermove` entries: that is
the probe's own logging gate (moves are logged only while tracking), not
evidence the browser withheld them.

**2. `touch-action` / scroller intersection — FALSIFIED for the horizontal
case.** The touch stream ran the full length of every grid-origin drag and
ended in `touchend`; `pointerup` (not `pointercancel`) was delivered, on the
original target, with no capture in play. The UA never claimed the gesture,
so the scroller never got the chance to swallow it. **No `pointercancel` and
no `touchcancel` appears anywhere in the 1779 events.**

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
- Vertical scrolling survives: `seq 494-520` is a −178px vertical drag over
  the grid that correctly commits `below-threshold` instead of paging.
- The guard must be narrowed to elements that are actually operable, and
  `[role]` must not appear in it.

## Open, not settled by this probe

The probe's program had a grid short enough that the row list may never have
needed to scroll. Whether a **scrollable** row list claims a horizontal
gesture (the `touch-action` intersection rule stops at the first scroll
container) is untested on device. The implementation pins this with a
scrollable-grid case, and the phone leg re-checks it with a long program.
