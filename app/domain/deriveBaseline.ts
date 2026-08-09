/** UI notes round, item 2 — the 2k/6k derivation OFFER (James-approved
 *  shape: an offer, never an automatic write). A 2k (all-out, short) runs
 *  about this many seconds per 500 m faster than a 6k (sustained, longer)
 *  — the same heuristic the "your first row"/"baselines" news articles
 *  state in prose. It is a starting ESTIMATE only, never a measurement:
 *  the editor's own ± steppers still adjust whatever this fills in, and
 *  nothing reaches the server until the rower's existing Apply confirms
 *  it (see `BaselineEditor.tsx`). */
export const K2_K6_OFFSET_SECONDS = 7;

/** Estimate a 2k split (s/500m) from a known 6k split: a 2k runs
 *  `K2_K6_OFFSET_SECONDS` faster. Pure arithmetic — bounds/bookkeeping
 *  (whether the result stays inside the editor's own MIN/MAX split range)
 *  is the caller's job, per `you/baselineDraft.ts`'s MIN_SPLIT/MAX_SPLIT. */
export function deriveK2FromK6(k6Seconds: number): number {
  return k6Seconds - K2_K6_OFFSET_SECONDS;
}

/** Estimate a 6k split (s/500m) from a known 2k split: a 6k runs
 *  `K2_K6_OFFSET_SECONDS` slower. Same bounds caveat as `deriveK2FromK6`. */
export function deriveK6FromK2(k2Seconds: number): number {
  return k2Seconds + K2_K6_OFFSET_SECONDS;
}
