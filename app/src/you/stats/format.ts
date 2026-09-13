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
