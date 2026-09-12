/**
 * The rower's average heart rate for a piece, derived from the trace.
 *
 * WHY THIS EXISTS: the monitor leaves the four heart-rate fields of its
 * end-of-workout summary empty, and AVG HR has read `—` on every row anyone
 * has saved.
 *
 * HOW STRONG THAT EVIDENCE ACTUALLY IS, stated precisely because the first
 * version of this comment overstated it. Of 20 committed capture FILES, 11
 * carry a 0x0039 summary and every heart-rate slot in each is a sentinel —
 * but two pairs are `.jsonl`/`.gz` encodings of one recording, so that is 9
 * distinct recordings, and 7 of the 9 had no belt paired at all
 * (0x0032 live heart rate reads 255 throughout). An empty summary proves
 * nothing on those. **The real base is TWO belted recordings, from one walk,
 * one day, one erg, one belt, all over the web transport.** James's own
 * belted row on 2026-09-07 was empty too, but that log is not in the repo.
 * A single belted 0x0039 carrying a real average, on any other day or build,
 * falsifies this.
 *
 * WHICH AVERAGE (James, 2026-09-07, Gate 0 option A): the time-weighted mean
 * over WORKING strokes, excluding rest. Measured on four captures with the
 * repo's own parser, that lands within 0.5 bpm of a whole-session mean on
 * every one.
 *
 * IT WILL NOT MATCH THE COLUMN BENEATH IT, and an earlier version of this
 * comment claimed the opposite "by construction". The MACHINE SUMMARY table's
 * HR column is the monitor's own 0x0038 per-interval reading — the very field
 * measured 3.5 to 15.2 bpm ABOVE the trace — so the tile will usually read
 * below the rows under it. Two different quantities, honestly labelled: the
 * tile is the heart rate held while working, the column is whatever the
 * monitor recorded per interval. Worth knowing before anyone "fixes" the tile
 * to match the rows.
 *
 * WHY THAT COLUMN WAS NOT USED as the tile's source (option C, rejected):
 * weighted by interval duration it runs 3.5 to 15.2 bpm above the trace on
 * all four captures, or 0 to 15 as a plain mean of the intervals with one
 * capture agreeing — the range depends on the aggregation, which an earlier
 * version of this comment failed to state. Concept2
 * documents that field only as "Split/Interval Work Heartrate", never saying
 * whether it is a mean, a final reading or a peak
 * (`docs/monitor/pm5-interface-notes.md` §10). An unexplained gap is not a
 * foundation for a number a rower reads.
 *
 * TIME-WEIGHTED, not a plain mean. The recorder decimates to roughly 1 Hz,
 * so in a clean trace the two agree; they diverge around a gap, and weighting
 * by the interval to the next sample is what stops one reading either side of
 * a stall counting as much as a second of rowing.
 */

import type { Sample } from "./types.js";

/** The recorder's own `Sample`, narrowed to the three fields this needs —
 *  and DERIVED from it since Phase MD PR 3, so the narrowing is the
 *  compiler's and a rename cannot diverge.
 *
 *  Why that matters: this interface was hand-written and first spelled the
 *  rest flag `rest`. Because the field was optional, structural typing
 *  accepted the real `Sample` with the key simply absent — so the rest
 *  exclusion never fired on any production path while every test, which
 *  built `rest` by hand, proved that it did (RF33). A `Pick` cannot spell
 *  a field the producer does not have, and `r` is now a REQUIRED key
 *  valued `true | undefined`, so a caller that does not spell it does not
 *  compile.
 *
 *  `t` is DECISECONDS on the run's own work clock —
 *  `Math.round(seconds * 10)` at `seriesRecorder.ts`'s construction site,
 *  not seconds. Every threshold below is in these units for that reason,
 *  and a weighted mean is scale-invariant, so no assertion on the RESULT
 *  can catch a unit error here; only a threshold can. */
export type HeartRateSample = Pick<Sample, "t" | "hr" | "r">;

/** Six seconds, in the deciseconds `t` carries. A longer gap is a dropout or
 *  a reconnect rather than the next reading, and weighting by it would let one
 *  sample either side dominate the whole mean. The recorder decimates to 1 Hz
 *  (`seriesRecorder.ts` §1), so a real gap is a second; six is generous. */
const MAX_GAP_DECISECONDS = 60;

/** The same band the write door and the wire already apply
 *  (`server/routes/data.ts`, `sendableInt(..., HR_MIN, HR_MAX)`): a reading
 *  outside it is a bad byte, not a heart rate. Banded HERE so the tile cannot
 *  render a figure the upload would refuse — a live `MonitorRun` trace has not
 *  been through the server's validator. */
const HR_MIN = 20;
const HR_MAX = 254;

/**
 * `null` when the trace carries no usable working samples at all — no belt, no
 * trace, or a piece that was all rest. Callers render the dash for that, which
 * is the honest answer rather than a number derived from nothing.
 *
 * Rounded to a whole beat: the tile has never shown a fraction of one, and
 * neither does the monitor.
 */
export function deriveAverageHeartRate(
  samples: readonly HeartRateSample[],
): number | null {
  let weighted = 0;
  let deciseconds = 0;
  for (let i = 0; i < samples.length - 1; i += 1) {
    const s = samples[i]!;
    // A resting sample is excluded, and so is one with no reading or an
    // out-of-band one. The gap still comes from the NEXT sample whatever that
    // one is, because the gap is how long THIS reading stood.
    if (s.hr === undefined || s.r === true) continue;
    if (!Number.isFinite(s.hr) || s.hr < HR_MIN || s.hr > HR_MAX) continue;
    const gap = samples[i + 1]!.t - s.t;
    if (gap <= 0 || gap >= MAX_GAP_DECISECONDS) continue;
    weighted += s.hr * gap;
    deciseconds += gap;
  }
  return deciseconds > 0 ? Math.round(weighted / deciseconds) : null;
}
