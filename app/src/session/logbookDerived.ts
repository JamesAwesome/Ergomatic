/**
 * Phase LP — the two figures Concept2's logbook DERIVES rather than
 * stores, reproduced exactly (spec 2026-09-06-logbook-parity §1.2, §3.1),
 * plus the session stroke-rate rule (§3.2). Nothing here is stored: every
 * function runs at render time over the integers the record keeps.
 *
 * WATTS. Concept2 publishes `watts = 2.80 / pace³` with pace in seconds
 * per metre (concept2.com/training/watts-calculator, PRIMARY). The
 * logbook computes it from full-precision time and distance — NOT from the
 * tenths-quantised `avgSplit` on the wire, which reproduces only 5 of 6 of
 * James's photographed cells under any rounding rule. From (time,
 * distance): 6 of 6 (`logbookDerived.test.ts`).
 *
 * CAL/HR. The logbook's is `floor(calories × 3600 / seconds)` — 6 of 6 on
 * the same row. The PM5's own `splitIntervalAvgCalories` is a different
 * quantity (`300 + 4 × 0.8604 × W` from its unrounded watts) and differs
 * from the logbook's by 24–78 cal/hr on six of nine committed captures
 * (spec §1.1); it is stored as provenance and never shown.
 *
 * `0` is a value. `undefined` means "cannot be derived" and renders as a
 * dash.
 */
export function logbookWatts(
  seconds: number,
  meters: number,
): number | undefined {
  if (!(seconds > 0) || !(meters > 0)) return undefined;
  return Math.round(2.8 / (seconds / meters) ** 3);
}

export function logbookCalPerHour(
  calories: number,
  seconds: number,
): number | undefined {
  if (!(seconds > 0)) return undefined;
  return Math.floor((calories * 3600) / seconds);
}

/**
 * The session's stroke rate for the RATE tile (spec §3.2). 0x0039's own
 * average reads exactly 2× the per-split rate on terminated pieces (2 of 9
 * committed captures; `docs/monitor/pm5-interface-notes.md` §27.6 — never
 * display it for a terminated piece), so a FINISHED piece uses the
 * machine's own average and a terminated one uses the time-weighted mean
 * of the splits' 0x0038 rates. Splits without a positive duration carry no
 * weight; no weighable split means no number.
 */
export function sessionStrokeRate(input: {
  finished: boolean;
  avgStrokeRate: number | undefined;
  splits: readonly { seconds: number; spm: number }[];
}): number | undefined {
  if (input.finished) return input.avgStrokeRate;
  let weight = 0;
  let sum = 0;
  for (const s of input.splits) {
    if (!(s.seconds > 0)) continue;
    weight += s.seconds;
    sum += s.seconds * s.spm;
  }
  if (weight === 0) return undefined;
  return Math.round(sum / weight);
}
