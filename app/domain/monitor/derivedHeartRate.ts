/**
 * The rower's average heart rate for a piece, derived from the trace.
 *
 * WHY THIS EXISTS: the monitor leaves the four heart-rate fields of its
 * end-of-workout summary empty. Not sometimes — measured 2026-09-07 across
 * the whole committed corpus, 11 of 20 captures carry a 0x0039 summary and in
 * ALL ELEVEN every heart-rate slot is a sentinel, while three of those same
 * walks carry real per-interval heart rate at the same moment. So AVG HR has
 * read `—` on every row anyone has ever saved, on a screen whose own table
 * shows real numbers two lines below.
 *
 * WHICH AVERAGE (James, 2026-09-07, Gate 0 option A): the time-weighted mean
 * over WORKING strokes, excluding rest. Measured on four captures with the
 * repo's own parser, that lands within 0.5 bpm of a whole-session mean on
 * every one, and it measures the same quantity as the per-interval HR column
 * beneath the tile, so the two agree by construction. The monitor's own
 * per-interval figure was the third option and was rejected on evidence: it
 * reads 4-15 bpm HIGHER than the trace on all four captures, and Concept2
 * documents that field only as "Split/Interval Work Heartrate", never saying
 * whether it is a mean, a final reading or a peak
 * (`docs/monitor/pm5-interface-notes.md` §10). An unexplained gap is not a
 * foundation for a number a rower reads.
 *
 * TIME-WEIGHTED, not a plain mean: samples arrive per stroke, so a slow
 * stroke would otherwise count the same as a fast one. Each sample is
 * weighted by the gap to the next.
 */

/** The recorder's own `Sample`, narrowed to the three fields this needs.
 *  The names are NOT a paraphrase: `r` is what `src/monitor/seriesRecorder.ts`
 *  writes and `server/stores/logs.ts` mirrors. This interface first spelled it
 *  `rest`, and because the field is optional, structural typing accepted the
 *  real `Sample` with the key simply absent — so the rest exclusion never
 *  fired on any production path while every test, which built `rest` by hand,
 *  proved that it did. Diff a narrowed input interface against the producer's
 *  real declaration field by field; a renamed optional is invisible to the
 *  compiler in exactly the direction that matters. */
export interface HeartRateSample {
  /** DECISECONDS on the run's own work clock — `Math.round(seconds * 10)` at
   *  `seriesRecorder.ts`'s construction site. Not seconds. Every threshold
   *  below is in these units for that reason, and a weighted mean is
   *  scale-invariant, so no assertion on the RESULT can catch a unit error
   *  here; only a threshold can. */
  readonly t: number;
  readonly hr?: number;
  /** Present and `true` only for a sample the monitor itself called resting. */
  readonly r?: true;
}

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
