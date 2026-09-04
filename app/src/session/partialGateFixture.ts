/** Door spec (2026-09-02) §8.2 — the two steps the headline gate expects,
 *  declared ONCE. `partialReplay.test.ts` (client, the replay half) and
 *  `server/routes/data.test.ts` (unit, the POST→GET half) both IMPORT
 *  these; a hand-written second copy is RF11's mirror, the same ruling
 *  `server/routes/partial.integration.test.ts` already states for the PR A
 *  gate ("IMPORTED, never hand-copied here — a copy would be a third
 *  mirror"), which is also the precedent that a server test MAY reach into
 *  `src/`.
 *
 *  The numbers are the two 2026-08-28 captures' own last rowing frames,
 *  decoded (Measurements appendix), never chosen. */
export const PARTIAL_STEP_LEG_A = {
  label: "1:00 @ 2:32",
  targetSplit: 152,
  seconds: 60,
  partialMeters: 15,
  partialSeconds: 8.28,
} as const;

export const PARTIAL_STEP_LEG_B = {
  label: "1:00 @ 2:32",
  targetSplit: 152,
  seconds: 60,
  partialMeters: 37.6,
  partialSeconds: 10.9,
} as const;
