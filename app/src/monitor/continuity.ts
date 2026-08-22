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
//   session-wide counter (R0, CR2 spec 1) that only ever grows while the
//   machine is rowing — UNLESS the armed program contains a
//   distance-programmed interval, in which case this same field reports
//   the INTERVAL'S GOAL, not distance actually rowed (confirmed PRIMARY,
//   `src/monitor/driver.ts`'s own `recordTwdVerdict`: "500 m goal read
//   against 13.4 m genuinely rowed, mid-row"; full mechanism, both
//   captures, and the rest-window half of the finding are now written up
//   in `docs/monitor/pm5-interface-notes.md` §20 item 25, the house
//   convention's home for this class of wire fact). This task's own corpus
//   derivation (`continuity.test.ts`) reproduced the exact shape live: one
//   capture flickers 0/250/500 (a boundary accumulator, never distance
//   rowed), mid-interval, on a 2x250m-shaped distance program — a false
//   "reset" on every single simulated resume inside it; a second capture
//   (the mixed pyramid) shows the field frozen through every work bout and
//   ticking only during rests, confirming the same mechanism a second,
//   independent way. `check` below applies the IDENTICAL suppression
//   `recordTwdVerdict` already ships (a distance-kind interval anywhere in
//   the armed program), because it is the same wire fact, not a new one.
//
// On the residual, non-distance-goal corpus (the only stretches where this
// field means "distance genuinely rowed"), the measurement is unambiguous:
// **zero backward transitions across 1,026 simulated 30-second-gap pairs**
// (`continuity.test.ts`'s own corpus-derivation block, the same
// slide-a-gap-across-every-frame simulation shape the anchor pass used to
// falsify RowTracer's elapsed bound). NO TOLERANCE IS NEEDED — a single
// GATT-notified characteristic delivers in order (0x0031's own guarantee),
// there is no rounding in a `readU24LE` whole-metre read to introduce
// drift, and nothing in 3,092 raw (pre-suppression) or 1,026
// (post-suppression) simulated pairs ever showed the counter move
// backward for a reason other than the distance-goal flicker above.
// `CONTINUITY_BACKWARD_TOLERANCE_METERS` is therefore `0`: that
// measurement, not an engineered cushion.

/** A single wire reading `check` below judges continuity from.
 *  `totalWorkDistanceMeters` is 0x0031's own Total Work Distance, exactly
 *  as `domain/monitor/pm5/parse.ts`'s `GeneralStatus.totalWorkDistanceMeters`
 *  decodes it (offset 11, whole metres, unscaled) — a caller reads this off
 *  a `MonitorFrame`'s own `totalWorkDistanceMeters` (additive-optional,
 *  `domain/monitor/types.ts`), never re-decodes bytes itself.
 *  `distanceGoal` is NOT a wire field — it is the caller's own answer to
 *  "does the armed program contain a distance-kind interval", the exact
 *  predicate `driver.ts`'s `recordTwdVerdict` already computes
 *  (`program.intervals.some((i) => i.kind === "distance")`) — carried per
 *  reading rather than as a third `check` argument so a caller comparing
 *  two readings from DIFFERENT programs (a boundary that changed which
 *  program is armed) states each reading's own truth rather than one fact
 *  assumed to cover both. */
export interface ContinuityReading {
  totalWorkDistanceMeters: number;
  distanceGoal: boolean;
}

export type ContinuityVerdict = "continuation" | "reset";

/** NO TOLERANCE IS NEEDED (measured, Task 4 review fix F5/Minor — reworded
 *  from an earlier "measured floor"/"cushion" framing that implied a
 *  margin was chosen; none was). Zero backward transitions were observed
 *  across every non-distance-goal simulated resume in the corpus — see
 *  this file's own header comment for the full derivation and why that
 *  is the expected, not merely lucky, result (a single-characteristic
 *  GATT stream delivers in order; the field is an unscaled whole-metre
 *  integer with nothing to round). `0` is that measurement, not a
 *  deliberately engineered slack value. `continuity.test.ts`'s
 *  corpus-derivation block reproduces the underlying count (1,026 pairs,
 *  0 violations) as a live CI gate — if a future capture ever shows a
 *  genuine backward blip on a healthy resume, that test is where the
 *  evidence for a nonzero value would first appear, not here in
 *  isolation. */
export const CONTINUITY_BACKWARD_TOLERANCE_METERS = 0;

/**
 * Judges whether `after` is an honest continuation of `before`, or a reset
 * (design spec §4: "keyed on quantities that are MONOTONIC across
 * boundaries on our wire — `totalWorkDistanceMeters` ... going backward").
 *
 * Suppressed (always `"continuation"`) whenever EITHER reading was taken
 * while a distance-goal interval was armed — see this file's own header
 * comment for why that suppression is required, not optional, on this
 * particular field. This is the ONLY bound this function implements: the
 * spec's other candidate ("stroke count dropping") has no wire field to
 * read on this codebase's decode surface (this file's own header comment)
 * and is not silently approximated by anything else here.
 *
 * A forward jump — of ANY size, including one covering a genuine multi-
 * minute background gap — is always `"continuation"`: only a reading that
 * goes BACKWARD, past the measured tolerance, is a `"reset"`. This is what
 * makes the rule safe for an honest long resume (the counter simply grew a
 * lot while the stream was suspect) while still catching a genuine
 * discontinuity (the counter reads LOWER than it did before).
 */
export function check(
  before: ContinuityReading,
  after: ContinuityReading,
): ContinuityVerdict {
  if (before.distanceGoal || after.distanceGoal) return "continuation";
  const backward =
    before.totalWorkDistanceMeters - after.totalWorkDistanceMeters;
  if (backward > CONTINUITY_BACKWARD_TOLERANCE_METERS) return "reset";
  return "continuation";
}
