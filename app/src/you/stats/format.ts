import { fmtDuration } from "../../../domain/duration.js";
import type {
  CalendarDate,
  DateRange,
} from "../../../domain/stats/calendar.js";

// The ONE `fmtMeters` (domain/format.ts) and the ONE YYYY-MM-DD pair
// (domain/stats/calendar.ts), re-exported so this surface's imports stay
// local.
export { fmtMeters } from "../../../domain/format.js";
import { MONTH_ABBREV } from "../../../domain/format.js";
export { fmtDate, parseDate } from "../../../domain/stats/calendar.js";

/** Elapsed seconds as the house positional clock (`3:59:39`, `13:43`). */
export function fmtSeconds(seconds: number): string {
  return fmtDuration(seconds / 60);
}

/** A 0..1 share as the whole percent the legend prints (spec §3.2). */
export function fmtPercent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/** `8 NOV` — a chart's x label and half of a range line. */
export function fmtDayMonth(d: CalendarDate): string {
  return `${d.d} ${MONTH_ABBREV[d.m - 1]}`;
}

/** `MAY` — the season and trend x-axis labels. */
export function fmtMonth(d: CalendarDate): string {
  return MONTH_ABBREV[d.m - 1]!;
}

/** The range line's shape (§14 ruling 21, `build.mjs` `rangeText`): the
 *  month once when both ends share it (`1 TO 12 SEP 2026`), the year once
 *  when both ends share it (`14 AUG TO 12 SEP 2026`), both ends in full
 *  across years (`8 NOV 2025 TO 12 SEP 2026`); a one-day range is ONE
 *  date (`1 OCT 2026`, §14 ruling 23), never `1 TO 1 OCT 2026`. */
export function fmtRange(from: CalendarDate, to: CalendarDate): string {
  if (from.y === to.y && from.m === to.m && from.d === to.d)
    return `${fmtDayMonth(from)} ${from.y}`;
  if (from.y === to.y && from.m === to.m)
    return `${from.d} TO ${to.d} ${MONTH_ABBREV[to.m - 1]} ${to.y}`;
  if (from.y === to.y)
    return `${fmtDayMonth(from)} TO ${fmtDayMonth(to)} ${to.y}`;
  return `${fmtDayMonth(from)} ${from.y} TO ${fmtDayMonth(to)} ${to.y}`;
}

/** The one prose line under the filter bar (§14 ruling 21, variant A on
 *  every preset): the days the totals cover. ALL names the earliest row;
 *  with no row it is `null` (the bar is hidden then too, ruling 16). */
export function fmtRangeLine(
  range: DateRange,
  earliest: CalendarDate | null,
): string | null {
  // `presetRange` and `customRange` set both ends together, so a one-sided
  // range has no producer; the type admits it and it reads as ALL.
  if (range.from === null || range.to === null) {
    return earliest === null
      ? null
      : `ALL TIME · SINCE ${fmtDayMonth(earliest)} ${earliest.y}`;
  }
  return fmtRange(range.from, range.to);
}
