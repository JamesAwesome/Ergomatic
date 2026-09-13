import { fmtDuration } from "../../../domain/duration.js";

// The ONE `fmtMeters` (domain/format.ts) and the ONE YYYY-MM-DD pair
// (domain/stats/calendar.ts), re-exported so this surface's imports stay
// local.
export { fmtMeters } from "../../../domain/format.js";
export { fmtDate, parseDate } from "../../../domain/stats/calendar.js";

/** Elapsed seconds as the house positional clock (`3:59:39`, `13:43`). */
export function fmtSeconds(seconds: number): string {
  return fmtDuration(seconds / 60);
}

/** A 0..1 share as the whole percent the legend prints (spec §3.2). */
export function fmtPercent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/** The seam line (spec §14 rulings 15 and 18): singular at one, plural
 *  above; no `NOT IN AVG WATTS` suffix (ruling 18 struck it). */
export function seamLine(k: number): string {
  return k === 1
    ? "1 ROW PREDATES WORK-ONLY TOTALS"
    : `${k} ROWS PREDATE WORK-ONLY TOTALS`;
}
