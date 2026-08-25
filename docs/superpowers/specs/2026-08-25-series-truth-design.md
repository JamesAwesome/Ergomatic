# The series stops lying on distance intervals — design

**What and why.** James's exit-7 row (2×250m r60) drew a "weird graph"
because the stored series had silently LOST its second interval and
trailing rest: on distance-kind intervals with rests, the PM5's
ephemeral boundary state 9 emits one frame whose `intervalIndex` lies
forward while the elapsed pair still belongs to the finishing interval.
The driver guards its own accumulator against exactly this (the ring's
`divergence` entry proves the guard fired) but does not mirror the
correction onto the `frame.intervalIndex` it emits — a hole
`driver.ts`'s own comment predicted, waiting for a capture. The series
recorder keys on that emitted index with no reset guard, latches
forward, inflates its clock by the finished interval's register, and its
backward-bucket monotonicity guard then discards every later sample
without a trace. 56.1 seconds of real rowing (the FASTER interval)
never reached the stored series. Every connected distance-with-rest row
saved to date carries this; the loss is ongoing until this ships. Fix is
PROSPECTIVE ONLY — the dropped samples were never constructed, so no
migration can repair old rows.

TRIAD twice over: `frame.intervalIndex` is a number several consumers
key on (driver change), and `Sample.t`/`Sample.d` are stored meanings
(recorder change). Full antagonist pass required; PM final gate on the
PR. Ships ALONE, before the summary-record wave's PR 2 (James's
sequencing call, 2026-08-25: data loss first, display second).

## Evidence base

- PRIMARY (production ring, exit-7 walk):
  `docs/monitor/sessions/walk-2026-08-24/phone-exit7-ring.json` seq
  27/28 — `workoutState=9` at the boundary; the driver's open-on-reset
  guard refusing key 1 and merging into key 0.
- PRIMARY (diagnosis probe, 2026-08-25): the ring's numbers synthesized
  through the REAL `createSeriesRecorder` → `buildTrace` → `chooseTicks`
  reproduce the screenshot digit for digit with the poison tick present
  (129 samples, t→196s, one displaced band, ticks 0:00/0:50/1:40/2:30,
  fastest 2:15.8) and produce the correct chart without it (230 samples,
  t→230s, two bands, fastest 1:52.2, final d=742.7m == the driver's own
  accumulator at ring seq 49 — an independent cross-check).
- PRIMARY (code): `driver.ts`'s mirror is gated on
  `workoutState === WORKOUTSTATE_INTERVALWORKTIMETOREST` (8) alone; its
  own comment names state 9 as "the symmetric, plausible sibling case —
  NOT gated here, since no capture ... evidences it either way ... the
  same one-line extension if a future walk shows it". This walk is that
  capture.
- PRIMARY (replay): both committed rest-bearing captures run CLEAN
  through driver→recorder (`session-2-wu-4unequal`: 419 samples, all 3
  rests placed, d=1598.8 vs TWD 1599) — because NEITHER is a
  distance-kind interval WITH a rest. The corpus hole is why three
  gates walked past this (recurring failure 3).
- Corollary evidence for the docs fix: the healthy probe run reaches
  t=230s on a 124s-work piece — `traceModel.ts`'s header claim that `t`
  "excludes rest duration" is FALSE when the wire advances elapsed
  through a rest; `t` is the sum of per-interval FINAL elapsed readings,
  rest included whenever the flywheel kept moving.

## The fixes (one PR, five parts)

**A — driver: the one-line extension its comment reserved.** The
refused-open mirror onto `emittedIntervalIndex` fires for
`WORKOUTSTATE_INTERVALWORKDISTANCETOREST` (9) exactly as it does for 8.
Nothing else about the gate changes; the existing regressions that
killed the unconditional mirror (state-8 tests) stay green untouched.

**B — recorder: port the open-on-reset guard the design was modelled
on.** Before `currentKey` may RISE to a frame's higher `intervalIndex`,
the recorder applies the driver's own level-triggered predicate: a new
key opens only when no key has been seen yet, or when this frame's
`elapsedSeconds` is strictly less than the CURRENT key's own register
(a genuine wire reset). Otherwise the frame merges into the current key.
No constants, no edge memory. B makes the recorder self-defending
against ANY future emitted-index lie; A removes the one poison we have
evidence for at source. They are complementary, both required.

**C — recorder: the drop becomes loud.** Backward-bucket rejections
(`bucket <= lastEmittedBucket`) are counted and the count surfaces the
same way `truncated` already does (the recorder's result carries it and
the driver/hook logs a ring entry when nonzero). A defect of this class
must be visible at a desk, not discovered at an erg.

**D — docs on the same surface, no behaviour change.** `traceModel.ts`'s
header is corrected: `t` is the sum of per-interval final elapsed
readings and INCLUDES rest whenever the wire advanced through it — the
chart's x-axis and 0x0039's work-only elapsed measure different
quantities. The axis-quantity question (should the chart use a true
work-only clock?) is explicitly OUT of this PR and queued in ROADMAP —
changing what the axis means is its own number-meaning decision.

**E — the regression fixture is synthetic, and says so.** No replayable
capture of this defect exists (production build, no instrument — only
the ring). The failing-first test synthesizes the ring's own frame
sequence (interval 1 to 67.91s, the state-9 poison tick at 68.02s,
advancing rest to 129.5s, interval 2's reset to 0 then 56.1s, trailing
rest), replays it through the REAL driver → recorder, and asserts the
healthy shape: contiguous samples, two rest runs, final d within 1m of
742.7, fastest split 1:52.2 present. The test's comment states it is
synthesized FROM the production ring and that a lab capture of a
2×Nm rNN piece is owed (ROADMAP walk item rides this PR). Both
committed clean captures stay pinned as replay regressions so A/B
cannot disturb them.

## Explicitly not in this PR

- No repair of already-saved rows (impossible — the samples were never
  built; said in ROADMAP where the walk item lands).
- No axis-quantity change (D queues it).
- No display work (the summary-record wave's PR 2 follows separately).
- No change to the driver's own accumulator/register logic — the guard
  that already works is not touched, only mirrored (A) and ported (B).

## Exit criteria

1. The synthetic exit-7-shaped replay produces a contiguous series with
   both intervals, both rests, fastest 1:52.2, and final d within 1m of
   the accumulator — failing before A+B, passing after.
2. Both committed captures replay byte-identically to their pre-fix
   series (A/B change nothing on state-8 and no-rest shapes).
3. A forced backward-bucket sequence yields a nonzero drop count that
   reaches the ring; zero on all clean replays.
4. `traceModel.ts`'s header states the t-includes-advancing-rest truth;
   ROADMAP carries the axis-quantity question and the 2×Nm rNN capture
   walk item, and corrects the stale "rides the next log-surface PR"
   line (the defect was wire-attribution, not render).
