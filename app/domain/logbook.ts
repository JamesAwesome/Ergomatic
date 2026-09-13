/**
 * Phase LP — the two figures Concept2's logbook DERIVES rather than
 * stores, reproduced exactly (spec 2026-09-06-logbook-parity §1.2, §3.1).
 * Moved here from `src/session/logbookDerived.ts` by Phase PS PR 1 (spec
 * §4.1) so the domain's AVG WATTS can call them; that file re-exports both,
 * and its tests are the gate that the move changed nothing.
 *
 * WATTS. Concept2 publishes `watts = 2.80 / pace³` with pace in seconds
 * per metre (concept2.com/training/watts-calculator, PRIMARY). From full-
 * precision (time, distance): 6 of 6 of James's photographed cells.
 *
 * CAL/HR. The logbook's is `floor(calories × 3600 / seconds)`.
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
