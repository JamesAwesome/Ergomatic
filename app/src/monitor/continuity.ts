// Phase LL Task 4 (design spec §4's continuity rule): "RowTracer's SHAPE,
// our own constants — because the borrowed constants reject healthy
// streams on our wire." RowTracer (MIT-licensed, the spec's own citation)
// guards a resumed stream against three bounds: elapsed going backward,
// distance going backward, and stroke count dropping. The LICENCE to guard
// a resume this way transfers; the CONSTANTS only transfer if the field
// they read means the same thing on OUR wire, and the anchor pass proved
// two of the three do not:
//
// - **Elapsed was REJECTED before this task started** (the anchor pass,
//   `.claude/agents/antagonist-ledger.md`'s "Phase LL anchor pass" entry,
//   folded into the spec at §4): 0x0031's own Elapsed Time is a
//   PER-INTERVAL clock that legally jumps backward at every boundary
//   (measured: -29 s to -188 s across 8 boundary resets in the corpus) and
//   re-bases mid-rest with no boundary at all (4 occurrences, -3.15 s to
//   -5.97 s). A bound on it would reject 12.7%-26.0% of healthy 30 s
//   resumes. Not implemented here.
// - **Stroke count is REJECTED by THIS task, for a different reason: no
//   such field exists on our wire at all.** `domain/monitor/pm5/parse.ts`
//   decodes every field this codebase has ever pulled off 0x0031-0x0033/
//   0x0037-0x0039, and none of them is a cumulative stroke counter — the
//   nearest cousin, 0x0031's own Stroke Rate (`AdditionalStatus1.spm`), is
//   an INSTANTANEOUS rate, not a count, and legitimately reads 0 whenever
//   the rower is not mid-drive (not a "dropped" count, a true one). A
//   monitor-level Stroke Data characteristic (PM5 0x0035/0x0036) exists
//   per the BLE doc's own table of contents but is never subscribed by
//   this codebase (confirmed: `grep -rn "0x0035\|0x0036" docs/monitor/
//   pm5-interface-notes.md` finds no decode of either). RowTracer's own
//   "stroke count dropping" bound therefore has nothing to read from on
//   this wire, and inventing an accumulator to manufacture one is exactly
//   the "mechanism we are about to INVENT" this repo's research-before-
//   invention rule requires a primary source for BEFORE it ships, not
//   after — out of scope for this task. **Reported, not silently
//   dropped**: a future task that adds 0x0035/0x0036 support is what
//   would make this bound honestly implementable.
// - **Total Work Distance survives, WITH a suppression RowTracer never
//   needed**: 0x0031's own Total Work Distance (`GeneralStatus.
//   totalWorkDistanceMeters`, offset 11, whole meters) is an absolute,
//   session-wide ODOMETER of metres genuinely rowed — work plus rest coast
//   — that LAGS the interval currently in progress and catches up in a
//   jump at each boundary (RC-9c, design spec 2026-08-25-free-oracles §2,
//   correcting an earlier PRIMARY claim here that it "reports the
//   interval's goal": that claim rested on two `pm5-session4b` ring
//   samples taken BEFORE `program()`'s own writes, a stale pre-arm state
//   read twice. `session-1-keystone-2x250r0` shows the real mechanism: TWD
//   reads 0 through the whole of interval 1 while 250 m are genuinely
//   rowed, jumps to 250 through interval 2, and settles at 500 at
//   WORKOUTEND). On a distance-programmed interval this lag makes the
//   field jump exactly like a reset would even though nothing reset —
//   which is why it cannot be trusted as a continuity signal there, goal
//   report or not. This task's own corpus derivation (`continuity.test.ts`)
//   reproduced the exact shape live: one capture flickers 0/250/500 (the
//   lagging odometer, never the metres genuinely in progress at that
//   instant), mid-interval, on a 2x250m-shaped distance program — a false
//   "reset" on every single simulated resume inside it; a second capture
//   (the mixed pyramid) shows the field frozen through every work bout and
//   ticking only during rests, confirming the same lag a second,
//   independent way. `check` below applies the suppression this file has
//   always shipped (a distance-kind interval anywhere in the armed
//   program) — RC-9c retired the separate per-run TWD verdict that used to
//   compare this same field against the accumulator (both sides were the
//   same work-plus-rest-coast quantity, so a green verdict was a mirror),
//   but this suppression is a DIFFERENT use of the same wire fact and is
//   unaffected by that retirement: it protects a reset-detector, not a
//   stored number.
//
// On the residual, non-distance-goal corpus (the only stretches where this
// field means "distance genuinely rowed"), the measurement was
// unambiguous: **zero backward transitions across 1,026 simulated
// 30-second-gap pairs** (`continuity.test.ts`'s own corpus-derivation
// block, the same slide-a-gap-across-every-frame simulation shape the
// anchor pass used to falsify RowTracer's elapsed bound). NO TOLERANCE WAS
// NEEDED — a single GATT-notified characteristic delivers in order
// (0x0031's own guarantee), there is no rounding in a `readU24LE`
// whole-metre read to introduce drift, and nothing in 3,092 raw
// (pre-suppression) or 1,026 (post-suppression) simulated pairs ever
// showed the counter move backward for a reason other than the
// distance-goal flicker above. That measurement is why a single backward
// TWD reading, alone, was trusted as a conviction — and F2a below is the
// record of that trust being wrong.
//
// ============================================================================
// F2a (2026-08-23): a single backward TWD reading is NO LONGER a
// conviction on its own — one flaky reading closed a HEALTHY row mid-pull
// (`docs/monitor/sessions/walk-2026-08-23/ring-phone-2-background-
// continuity-kill.json` seq 30->33->34: TWD 81->0 while elapsed
// 56.11s->59.33s and distance 81.2m->83.3m BOTH ADVANCE, workoutState 4
// throughout — the stream never stopped rowing). The six-row TWD table
// (ROADMAP, Phase LL walk card, corrected F2) shows this was not a rare
// fluke: five zero readings — including a WEB capture's flat 0 across a
// 248.5 m interval — against one 81, on time-programmed intervals, in one
// day. Zero is this field's NORMAL reading there; the 81 was the outlier,
// and nothing about the shape is iOS-specific.
//
// `check` below now requires the FULL reset signature a genuine monitor
// reset actually produces, not one axis of it: TWD, elapsed, AND distance
// all strictly backward IN THE SAME READING. Every post-reset connect in
// the corpus reads zeros on all three together (e.g.
// `ring-phone-4-btoff-midpiece.json` seq 6-8: elapsed=0, distance=0,
// machineTotal=0m). A legal boundary, by contrast, holds or grows TWD
// while elapsed/distance reset — confirmed against the three real
// NON-DISTANCE boundaries this corpus contains (the keystone capture is a
// distance program and belongs to the suppression case below, not here):
// step-3 recording seq 411->416 (twd 0->160, elapsed 59.77->0, distance
// 159.3->0), step-3 recording seq 953->956 (twd 373->373, elapsed
// 60->0, distance 213.7->0), and session-2 recording seq 776->781 (twd
// 360->360, elapsed 69.63->0.31, distance 260.1->1.1) — TWD backward at
// NONE of them. Only a genuine reset backs all three up at once.
//
// **§2b's traded-away cost (design spec 2026-08-23-continuity-
// corroboration §2b, TRIAD-weight, accepted deliberately, not free):**
// narrowing from one axis to three LOSES a conviction the old rule made —
// a real reset during a gap that began EARLY in an interval can leave
// elapsed and distance both reading FORWARD again by the time the next
// reading lands (per-interval clocks restart from 0 and can outrun a low
// before-value before the next sample), so that record now MERGES instead
// of closing: blind for roughly 14% of a 180 s interval at a 30 s gap,
// growing to ~64% at two minutes. Accepted because the old rule bought
// that coverage by killing healthy rows (this file's own F2a fix is the
// receipt) — but the trade is NOT "visible garbage instead of silent
// loss" as an earlier draft of this comment claimed (final-review
// MEDIUM-1, 2026-08-23): `driver.ts`'s own per-interval session register
// (`session.seen`, max-merged per key, `driver.ts:2107-2119`) means a
// merged post-reset stream reads as a PLAUSIBLE, not obviously broken,
// number. After a genuine reset the machine re-enters interval 0, an
// `activeKey` the register already holds, so post-reset metres are
// absorbed by `Math.max` against the pre-reset maximum until they exceed
// it — 300 m rowed, a reset, 200 m more rowed stores ≈300 m, not 500 m,
// silently. The merge trades one silent-loss failure mode (a killed
// healthy row) for a DIFFERENT silent-under-count failure mode, not for a
// visible one. F2b SHIPPED (the spine's PR 3, this file's interval-count
// bound below): it closes this window on MULTI-INTERVAL programs past
// interval 1 — but NOT on distance-goal programs (the suppression covers
// both bounds; the sweep's KEPT decision), interval 1, or 1-interval
// programs, where this under-count trade remains live. This file's
// predicates are bounds tightened, not a re-key; a true re-key would
// need a field the corpus has not yet supplied.
//
// The distance-goal suppression below is UNCHANGED and still load-
// bearing, not superseded by the three-axis signature: at a
// distance-programmed boundary TWD, elapsed, AND distance can ALL go
// backward together (the same 0/250/500 TWD flicker, paired with the
// interval's own elapsed/distance reset), so the three-axis signature
// alone would false-convict there too. The suppression guards that
// program shape; the signature guards the rest; neither replaces the
// other.
//
// **The corpus claim is an observation, not a proof — stated that way on
// purpose:** the design spec's own antagonist pass (§1) measured zero
// triple-backward (all three axes) readings across 3,637 slid pairs at
// seven gap lengths. This file's own corpus-derivation block (below)
// re-runs the equivalent check at a single 30 s gap as a live CI gate
// (1,026 non-distance-goal pairs, the regression floor — it cannot go red
// for this narrowing alone, since the old single-axis bound already found
// zero backward TWD there and the new predicate only convicts on a
// STRICT SUBSET of what the old one did). "Never observed in 3,637 wire
// pairs" is the claim — not "cannot": ring-phone-2's own 81->0 TWD-only
// backward reading remains the one unexplained backward TWD reading this
// codebase has captured on a time program (walk F5), and nothing here
// claims to explain it away, only to stop convicting a healthy row on it
// alone.
// ============================================================================

/** A single wire reading `check` below judges continuity from. **Not every
 *  field comes off the same characteristic** (storage-spine design spec
 *  §4, PR 3 Task 2 — this doc comment's own honesty rewrite): the three
 *  0x0031 fields below (`totalWorkDistanceMeters`/`elapsedSeconds`/
 *  `distanceMeters`) come off the SAME `MonitorFrame`/frame-derived
 *  General Status reading — never re-decoded, never resampled from a
 *  different moment. `intervalCount` does NOT: it is 0x0033's (Additional
 *  Status 2's) own Interval Count, a DIFFERENT characteristic sampled
 *  independently of 0x0031 and merged in by the time this reading was
 *  taken — the most recent 0x0033 as of this reading, not a value decoded
 *  from the same notification (`domain/monitor/types.ts`'s
 *  `MonitorFrame.rawIntervalCount` doc comment has the full merge story;
 *  `src/monitor/driver.ts`'s `raw` object is what does the merging in
 *  production). Carried WITH the reading rather than fetched separately,
 *  same reasoning as `distanceGoal` below: a caller comparing two readings
 *  states each reading's own truth.
 *  `totalWorkDistanceMeters` is 0x0031's own Total Work Distance, exactly
 *  as `domain/monitor/pm5/parse.ts`'s `GeneralStatus.totalWorkDistanceMeters`
 *  decodes it (offset 11, whole metres, unscaled) — a caller reads this off
 *  a `MonitorFrame`'s own `totalWorkDistanceMeters` (additive-optional,
 *  `domain/monitor/types.ts`), never re-decodes bytes itself.
 *  `elapsedSeconds` and `distanceMeters` are the SAME `GeneralStatus`
 *  frame's own Elapsed Time and Distance fields (offsets 0 and 3, both
 *  0.01/0.1-scaled per `parse.ts`) — the two axes the F2a fix (this file's
 *  own header comment) adds to corroborate `totalWorkDistanceMeters`
 *  before convicting a reset, precisely BECAUSE elapsed alone was already
 *  rejected as a standalone bound (the header comment's own first bullet:
 *  it legally jumps backward at every boundary) — it is trustworthy only
 *  in CONJUNCTION with the other two, never on its own.
 *  `intervalCount` is 0x0033's own raw Interval Count, exactly as
 *  `domain/monitor/pm5/parse.ts`'s `AdditionalStatus2.intervalCount`
 *  decodes it (offset 3, unclamped, un-normalized) — a caller reads this
 *  off a `MonitorFrame`'s own `rawIntervalCount` (additive-optional, F2b's
 *  bound, design spec §4). `undefined` until the run's first 0x0033 has
 *  arrived; a reading pair missing it on EITHER side falls back to F2a's
 *  three-axis signature alone (`check`'s own doc comment below has the
 *  exact rule and why the corpus sweep decided it stays under the SAME
 *  suppression as the three-axis signature, not a separately-lifted one —
 *  `continuity.test.ts`'s own PART 5).
 *  `distanceGoal` is NOT a wire field — it is the caller's own answer to
 *  "does the armed program contain a distance-kind interval"
 *  (`program.intervals.some((i) => i.kind === "distance")`), the same
 *  predicate `useMonitorSession.ts`'s own `programHasDistanceGoal` computes
 *  for production callers (RC-9c retired the only other computer of this
 *  predicate, `driver.ts`'s per-run TWD verdict — see this file's own
 *  header comment) — carried per reading rather than as a third `check`
 *  argument so a caller comparing two readings from DIFFERENT programs (a
 *  boundary that changed which program is armed) states each reading's
 *  own truth rather than one fact assumed to cover both. */
export interface ContinuityReading {
  totalWorkDistanceMeters: number;
  elapsedSeconds: number;
  distanceMeters: number;
  distanceGoal: boolean;
  /** F2b (design spec §4): 0x0033's raw Interval Count, carried with this
   *  reading — see this interface's own doc comment above for the full
   *  merge story. `undefined` until the run's first 0x0033 arrives. */
  intervalCount?: number;
}

export type ContinuityVerdict = "continuation" | "reset";

/**
 * Judges whether `after` is an honest continuation of `before`, or a reset
 * (F2a, design spec 2026-08-23-continuity-corroboration §2: "conviction
 * takes a full-reset signature, not one reading"; F2b, storage-spine
 * design spec 2026-08-23 §4: the interval-count bound below).
 *
 * Suppressed (always `"continuation"`) whenever EITHER reading was taken
 * while a distance-goal interval was armed — see this file's own header
 * comment for why that suppression is required, not optional, on this
 * particular field, and why it survives the F2a change unchanged. **F2b's
 * count bound runs under this SAME suppression, not a separately-lifted
 * one** — `continuity.test.ts`'s own PART 5 sweep decided the spec §4
 * conditional: the count bound's own suppression LIFTS only if a
 * both-predicate sweep is clean AND non-vacuous; the production predicate
 * (`programHasDistanceGoal(run.program)`, the ARMED PROGRAM, constant for
 * the whole session — a DIFFERENT rule from this file's own per-sample
 * wire signal, `.claude/agents/antagonist-ledger.md`'s "Phase RC delta
 * pass" entry) suppresses the ENTIRE committed corpus (every one of the 6
 * captures armed a program containing a distance-kind interval), so that
 * arm of the sweep is clean but VACUOUS — 0 pairs ever compared. A 0-pair
 * "zero backward readings" is not evidence the bound is safe unsuppressed;
 * the decision recorded there is KEPT.
 *
 * Convicts `"reset"` when EITHER of two independent signatures fires:
 *
 * 1. **F2a's three-axis signature, unchanged**: ALL THREE axes are
 *    strictly backward in the same reading — `totalWorkDistanceMeters`,
 *    `elapsedSeconds`, AND `distanceMeters` each read LOWER in `after`
 *    than in `before`. No tolerance on any axis: the reset signature this
 *    predicate looks for is zeros against real progress, nothing marginal
 *    is being discriminated (design spec §2), and the corpus measurement
 *    backing the old single-axis tolerance (this file's own header
 *    comment) never needed one either. A forward or unchanged reading on
 *    ANY one of the three axes blocks this signature — this is what makes
 *    it safe against a flaky single-field reading (the F2a false kill:
 *    TWD backward alone, elapsed and distance both advancing) while still
 *    catching a genuine discontinuity, where a reset monitor reads all
 *    three lower at once.
 * 2. **F2b's count bound**: BOTH readings carry an `intervalCount`
 *    (`!== undefined` — a genuine `0` reading, interval 1 of every
 *    program, 0-based, is PRESENT, not missing; a truthiness check would
 *    misread it) AND `after.intervalCount < before.intervalCount`. A
 *    reading pair missing the count on EITHER side falls back to
 *    signature 1 alone — EXACTLY F2a's verdict, never worse (spec §4:
 *    additive-optional, the `totalWorkDistanceMeters` precedent). This is
 *    the conviction the three-axis signature alone cannot make: a mid-gap
 *    reset whose per-interval clocks (elapsed/distance) read FORWARD
 *    again by the time the next reading lands — F2a's own §2b traded-away
 *    blind window (this file's header comment) — still shows the raw
 *    interval count reading backward, because a genuine machine reset
 *    re-arms an EARLIER interval, and the count is unclamped
 *    (`domain/monitor/types.ts`'s `rawIntervalCount` doc comment).
 */
export function check(
  before: ContinuityReading,
  after: ContinuityReading,
): ContinuityVerdict {
  if (before.distanceGoal || after.distanceGoal) return "continuation";
  const resetSignature =
    after.totalWorkDistanceMeters < before.totalWorkDistanceMeters &&
    after.elapsedSeconds < before.elapsedSeconds &&
    after.distanceMeters < before.distanceMeters;
  const countBackward =
    before.intervalCount !== undefined &&
    after.intervalCount !== undefined &&
    after.intervalCount < before.intervalCount;
  return resetSignature || countBackward ? "reset" : "continuation";
}
