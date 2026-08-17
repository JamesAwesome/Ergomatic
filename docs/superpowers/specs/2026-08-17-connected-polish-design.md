# Phase CP (connected polish): swipe returns, and NEXT says more

**Date:** 2026-08-17 · **Status:** spec slate for phase open; PM slate
gate + antagonist anchor pass pending. · **Origin:** James, from the live
v0.10.0 connected screen (screenshot on record): "make the touch controls
work so I can swipe between views" and "fit more info in about the next
interval and drop the 'then'".

## What and why

Two operator-experience items on the connected surface, both James's own
device feedback. First: you cannot swipe between LIVE and GRID — the
swipe was deliberately cut at CR2 spec 3's design gate (Ruling 3/4;
`ConnectedSurface.tsx:13-20` records it), leaving the segmented control
as the only switcher, and on a phone clamped to a rowing erg a 44px
control is a much worse target than anywhere-on-the-pane. James is
reversing that ruling. Second: the footer's next-interval line spends its
room on a "then REST …" tail while omitting the next interval's extent
and rate — `NEXT · WORK 2:13.0 · then REST …` becomes
`NEXT · WORK 1500m 2:13.0 @24`, truncating from the right when the room
runs out.

Neither item is triad (no number changes meaning, no stored shape, no
auth). Item A is a DEVICE INTERACTION — explicitly not fast path, and it
carries the repo's one unexplained device mystery (below), so the phase
anchor attacks this spec and the exit runs through a `/hardware-walk`.

## Item A — swipe between panes

### The history this must answer (research pass, in-repo evidence)

- The ORIGINAL swipe (pre-spec-3) "worked" in every harness and failed
  under James's finger. The antagonist ledger's `hasTouch` entry is the
  autopsy: `playwright.config.ts` used Desktop Chrome (`hasTouch:
  false`), so the e2e swipe was `el.dispatchEvent` of synthetic touches
  and the unit swipe was jsdom `fireEvent` — hit testing, `touch-action`,
  gesture arbitration and `touchcancel` were untested BY CONSTRUCTION.
- The follow-up standalone repro (real CDP `Input.dispatchTouchEvent`,
  844×390, the exact DOM structure) changed pane on all four drag shapes
  and never emitted `touchcancel` — so the device failure is WebKit- or
  situation-specific and REMAINS UNEXPLAINED. That mystery is why this
  spec prescribes a different input model, a real-input test, and a
  hardware gate rather than resurrecting the old handler.

### Design

- **Pointer Events, not Touch Events** (PRIMARY: W3C Pointer Events is
  the successor model; one handler set covers touch/pen/mouse, and
  `setPointerCapture` gives drag tracking without the touch-specific
  cancel semantics the old code never handled). Handlers:
  `onPointerDown` records origin and captures; `onPointerMove` tracks
  delta; `onPointerUp` commits when |Δx| ≥ threshold AND |Δx| > |Δy|;
  `onPointerCancel` aborts cleanly (the case the old implementation had
  no test for).
- **`touch-action: pan-y` on the surface** (PRIMARY: CSS touch-action
  spec — declares horizontal gestures app-owned so the UA neither
  scrolls horizontally nor arbitrates them away; vertical pan stays the
  browser's). This is the strongest candidate for the old mystery: a
  missing/overridden `touch-action` lets WebKit's own gesture
  arbitration steal the pan mid-drag on a real device while synthetic
  dispatch (which skips arbitration) sails through. INFERENCE, marked as
  such — the walk decides.
- Swipe is ADDITIVE: the segmented control stays exactly as shipped
  (it is the accessible path and the discoverable one); swipe changes
  the same `pane` state through the same setter, persisting per-rower as
  today. Left = next pane, right = previous, no wraparound, no slide
  animation (spec 3's Ruling 3 cut the slide; only the GESTURE returns —
  the pane cut remains instant).
- Guards: ignore pointers that start on interactive elements (the
  segmented control, END, the log-sheet trigger); single-pointer only
  (a second concurrent pointer aborts); threshold ~48px with the
  dominant-axis check above.

### Verification ladder (the harness-blindness lesson applied)

1. Unit: handler logic through Pointer Events in jsdom (delta math,
   cancel, dominant-axis, interactive-element guard).
2. e2e: a REAL-TOUCH project — Playwright context with `hasTouch: true`
   and CDP `Input.dispatchTouchEvent` (the standalone repro's proven
   method), asserting pane changes on the four drag shapes and that
   vertical pans still scroll. The old suite's synthetic-dispatch swipe
   test taught us a green here is necessary, not sufficient.
3. **Hardware: a `/hardware-walk` item** — the only gate that can close
   the unexplained-mystery file. Walk asks: swipe LIVE↔GRID mid-rest on
   the laptop (and on the phone IF a phone pass is scheduled), plus one
   deliberate diagonal and one slow drag. If the device failure
   reproduces under Pointer Events + `touch-action`, the recording +
   ring give the evidence the last mystery never had.

## Item B — the NEXT line says more

### Design

Replace the connected footer's `NEXT · WORK 2:13.0 · then REST …` with a
single richer announcement of the next phase, the `then` clause dropped
entirely:

    NEXT · WORK 1500m 2:13.0 @24        (distance work)
    NEXT · WORK 6:00 2:13.0 @24         (time work)
    NEXT · REST 1:00                    (rest next)
    NEXT · FINISH                       (past the last)

- Composition per `Phase`'s own fields, all already present
  (`expand.ts:11-42`): kind word; extent (`meters` as `1500m`, else
  `seconds` via the house duration format); `targetSplit` via `fmtSplit`
  (only when `targetKind === "split"` — an effort phase shows its label
  word, e.g. `WORK 1500m ALL OUT`, per the 5G rule that an effort's
  number is never real); `@{spm}` only when `spm` is set.
- **Truncation: CSS ellipsis, rightmost-first.** The line is composed in
  full and the container truncates with `text-overflow: ellipsis` when
  room runs out — the field order (extent, split, rate) is chosen so the
  least-load-bearing field (@rate) is the first to go. No measurement
  code, no per-breakpoint ladders. TOTAL LEFT keeps its fixed right slot
  and never shrinks (it is the number that catches clock lies — CR2's
  own lesson).
- **Scope: the CONNECTED surface only.** `surfaceModel`'s `upNext`/
  `thenNext` fields are rebuilt on a new connected-only builder;
  `Timer.tsx`'s `upNextTextAt`/`thenNextTextAt` (the timer's UP NEXT
  strip and its landscape "then" line) are UNTOUCHED — the timer's
  layout was not the complaint and its "then" line is a different,
  landscape-only surface. `thenNext` leaves the connected model (its
  armed-branch shift note at `surfaceModel.ts:329-334` retires with it).
- The armed branch keeps its existing shift (armed's NEXT names the
  first interval); only the string composition changes.

### Verification

Unit tests on the new builder against realistic fixtures (distance work,
time work, effort work, rest-next, FINISH, armed shift — seeded-library
shapes, not hand-minimal ones); e2e structural + `pnpm screenshots`
(footer layout changes on a captured surface); DEVIATIONS.md reconciled
(the spec-3 handoff describes the `then` tail — its row gets the update).

## Exit criteria (each can fail)

1. Swipe changes pane on the real-touch e2e project's four drag shapes,
   vertical pan still scrolls, and a drag starting on the segmented
   control does not change pane.
2. The walk item passes live: LIVE↔GRID by finger at the erg, logged in
   the walk record. If it fails, the recording + ring from that session
   are committed as the mystery's first real evidence — that outcome
   fails THIS criterion but is named as the honest alternative result.
3. The NEXT line renders all four forms above from seeded-library
   fixtures, pixel-verified in updated screenshots, and the `then`
   clause appears nowhere on the connected surface.
4. Full gates green (client, e2e incl. the new touch project,
   screenshots refreshed); per-file coverage on new/touched files at the
   repo bar.
5. Segmented-control behavior byte-identical (its tests untouched and
   green) — swipe is additive, not a replacement.

## Honest limits

- Pointer Events + `touch-action` is a HYPOTHESIS about the old device
  failure, not a diagnosis; the mystery closes only at the walk, in
  either direction.
- CSS ellipsis can cut mid-field on extreme widths (a truncated split
  digit); accepted by design — James's ask was "still truncating if
  there's not enough room", and the field order puts the sacrifice on
  @rate first.
- The timer's UP NEXT keeps its old format; if James wants the richer
  line there too, that is its own small item (different surface,
  different room).
