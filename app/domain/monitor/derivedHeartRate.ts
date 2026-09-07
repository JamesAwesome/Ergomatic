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

/** The one sample shape this needs — structurally what `SeriesData` carries,
 *  declared here so `domain/` stays free of the recorder. `hr` absent means
 *  the belt reported nothing for that stroke; `rest` present and true marks a
 *  sample the monitor itself called resting. */
export interface HeartRateSample {
  readonly t: number;
  readonly hr?: number;
  readonly rest?: true;
}

/** A gap longer than this is a dropout, not a stroke, and weighting by it
 *  would let one sample either side of a reconnect dominate the whole mean.
 *  The recorder samples per stroke; even a very slow stroke is seconds. */
const MAX_GAP_SECONDS = 60;

/**
 * `null` when the trace carries no usable working samples at all — no belt,
 * no trace, or a piece that was all rest. Callers render the dash for that,
 * which is the honest answer rather than a number derived from nothing.
 *
 * Rounded to a whole beat: the tile has never shown a fraction of one, and
 * neither does the monitor.
 */
export function deriveAverageHeartRate(
  samples: readonly HeartRateSample[],
): number | null {
  let weighted = 0;
  let seconds = 0;
  for (let i = 0; i < samples.length - 1; i += 1) {
    const s = samples[i]!;
    // A resting sample is excluded, and so is one with no reading. The gap is
    // still taken from the NEXT sample whatever that one is, because the gap
    // is how long THIS reading stood.
    if (s.hr === undefined || s.rest === true) continue;
    const gap = samples[i + 1]!.t - s.t;
    if (gap <= 0 || gap >= MAX_GAP_SECONDS) continue;
    weighted += s.hr * gap;
    seconds += gap;
  }
  return seconds > 0 ? Math.round(weighted / seconds) : null;
}
