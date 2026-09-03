# `rowingActive`: pin the surviving use, and put the raw byte in the ring

**Date:** 2026-09-03 · **ROADMAP item:** Wave F, "`rowingActive` is falsified
but not dangerous" · **Size:** S · **TRIAD:** no (no stored shape, no number's
meaning, no auth)

## What and why

`MonitorFrame.rowingActive` is the PM5's rowing-state byte flattened to a
boolean (`pm5/parse.ts`, `raw.rowingState === 1`). The repo has already
convicted it as a rowing signal — `useMonitorSession.ts`'s pause derivation
says so at its own site: *"now with the byte FALSIFIED as a hard gate (Phase
LM task 2: it read `false` through an entire real row)"*. Nothing here
changes that verdict and nothing here changes behaviour.

Two things are owed. The byte still has ONE live consumer, and that
consumer's dependence on it is currently held up by an incidental snapshot
rather than by a test that says what it means. And when the byte next does
something surprising, the diagnostics ring will not say what it did, because
the ring records the raw value at exactly one moment — a resume edge — and
the case we most want to read is a mid-work stop, which produces no resume
edge. A rower who reports a wrong number gets us a ring that cannot answer
the question we already know to ask.

## §1 — The surviving consumer, pinned on purpose (I-1)

`surfaceModel.ts`'s `midSessionMirror` is the byte's only remaining
behavioural use: at a mid-session interval boundary, before the first pull of
the next piece, both heroes read `0` rather than previewing a target. It is
three terms ANDed — `!armedMirror`, `frame.rowingActive === false`, and
`frame.distanceMeters <= MID_SESSION_RESET_METERS`.

**I-1: a frame inside the reset-distance window with the byte reading TRUE
must not mirror.** That is the term's whole job — it is what stops the mirror
firing on a rower who is actually rowing through the window.

**The ROADMAP's measurement for this item is stale and is corrected by this
spec.** It says deleting the term "leaves 5,357 tests / 191 files green, so
nothing gates it today". Re-measured on this branch's base (`c2182ef5`),
against a green baseline of `Test Files 231 passed (231)` /
`Tests 6597 passed | 1 skipped (6598)`:

    (delete `frame.rowingActive === false &&` from surfaceModel.ts)
    NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run \
      --project unit --project client
    -> Test Files 1 failed | 230 passed (231)
       Tests  1 failed | 6596 passed | 1 skipped (6598)

So the term IS gated today — but only by
`ConnectedSurface.screens.test.tsx`'s `"pane C, the grid mid-rest (RC-24)"`
snapshot, and only as an HTML diff: the received markup renders
`connected-grid-spm` as `0` where the expected renders `21`. A snapshot says
"this page changed"; it does not say "the mirror must not fire while the
rower is rowing", and it would be silently re-baselined by anyone running
with `-u`. The pin this item owes is an explicit assertion that names the
invariant, in `surfaceModel.test.ts`, at the model layer where the decision
is actually made rather than at the rendered HTML.

**The work is a test only. `surfaceModel.ts` is not modified.**

## §2 — The raw byte in the ring, on change (I-2, I-3)

`MonitorFrame.rawRowingState` already exists and `pm5/parse.ts` already
populates it on every frame (both shipped with the lifecycle spec's §3, PR
#267). Its only consumer is `useMonitorSession.ts`'s `resume-first-frame`
ring entry — one entry, at one moment, on a resume edge.

**I-2: when the raw byte's value changes, the ring records the new value and
enough context to place it in the session.** A mid-work stop then leaves a
readable trace without needing a resume edge to have happened.

**I-3: the entry is recorded on CHANGE, never per frame.** The ring holds 500
entries (`eventLog.ts`, `DEFAULT_CAPACITY`) and drops the oldest as it fills;
a per-frame entry would evict the rest of the session's evidence to record a
value that is constant almost all of the time.

### The measurement that sets the rate

`docs/monitor/sessions/rowing-state-census.py` (committed with this spec —
the script is the artifact, not a transcribed table) reads byte 9 of every
`ce060031` rx frame in every committed recording. Run against this branch:

    python3 docs/monitor/sessions/rowing-state-census.py
    TOTAL frames: 7777 values: {0: 3009, 1: 4768} changes: 91

Three facts follow, and each one is load-bearing:

1. **The byte takes only 0 and 1 across 7,777 frames**, in 17 recordings
   spanning 2026-08-16 to 2026-09-01. The ROADMAP's stated worry — that
   `rowingState === 1` flattens "any non-1 read" to `false` and the next
   occurrence will not say WHICH non-1 value it was — describes a value this
   corpus has never contained. The diagnostic is still worth building, but
   for the timing, not for the value: what is unobserved is WHEN the byte
   moves relative to a stop, not which of several values it takes.
2. **91 changes in 7,777 frames — 1.2%.** Worst single recording: 14. That
   is the number that makes I-3 affordable against a 500-entry ring.
3. **The byte reads 0 in 39% of all frames**, which is consistent with the
   standing falsification rather than with "0 means resting". This is why §1
   pins a mirror and not a rowing signal, and why nothing in this change
   reads the byte to decide anything.

**Scope of that census, stated rather than implied:** these are OUR committed
recordings, which are web-transport captures from a small number of PM5s. It
bounds what our corpus has seen; it is not a claim about the firmware.

## §3 — What this deliberately does not do

- **No behaviour change.** No screen, number, stored row or decision reads
  differently. §1 adds a test; §2 adds a diagnostic entry.
- **No new predicate on the byte.** `PAUSED_FRAME_HOLD`'s comment gives the
  standing reason and it stands: keying a pause on a byte that reads `false`
  through a real row would trade a visible defect for a silent one.
- **No change to `parse.ts` or `types.ts`.** Both already carry the raw byte
  and its doc comment.

## §4 — Riders, both record corrections found while writing this

- **ROADMAP (b) is already DONE and its box should say so.** The owed
  "reconciled comment" is `domain/monitor/types.ts`'s `restSeconds` block,
  which was narrowed at its own site on 2026-09-03 by #280's walk — it no
  longer claims the clock freezes "whenever `rowingActive` goes false" and
  now records the measured mid-WORK case. No work is owed; the entry is
  corrected to say so.
- **ROADMAP's `programDropped` item is still `- [ ]` while its own prose says
  it shipped.** The entry reads "SHIPS as the live-drop PR from spec §1 …
  **PR #248**, PM final gate GO-WITH-CONDITIONS"; `gh pr view 248` reports
  `MERGED 2026-09-01T03:32:52Z`. The box is ticked, naming #248. This is the
  same prose-corrected-but-box-unticked failure the AUD PR's whole-branch
  review caught two hours earlier, which is why it is being swept here rather
  than left for the next reviewer to find.

## §5 — Decomposition and spoken skips

One PR, one implementer, one task review, one whole-branch review.

- **Antagonist:** ONE lens-1 pass on this spec (James, 2026-09-03: "harden
  once"). Lens 2 is SKIPPED and the skip is spoken: this spec prescribes no
  executable content, so there are no blocks for it to read.
- **PM gate:** SKIPPED. Non-TRIAD, and by the PM-gate rule this changes
  nothing the app DOES and gives a tester no new capability — it is a test, a
  diagnostic and two record corrections.
- **Gate 0:** not required. Nothing user-visible changes; the ring is an
  operator surface reached through You → DIAGNOSTICS.
- **Not fast path**, and the reason is I-3: a wrong version floods the ring
  and evicts a session's evidence, which is a lost record, not a cosmetic
  failure.
