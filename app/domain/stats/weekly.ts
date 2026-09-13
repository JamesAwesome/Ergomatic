/**
 * METRES PER WEEK (spec §3.2, §5 item 3): Σ workMeters over the rows in
 * range, grouped by Monday-start week, as the eight weeks ending at the
 * week containing the range's LAST day — `to` for CUSTOM, today for every
 * preset (`presetRange` sets `to = today`; ALL has no `to`).
 */
import {
  addDays,
  compareDates,
  mondayOf,
  toDayNumber,
  type CalendarDate,
  type DateRange,
} from "./calendar.js";
import { rowsInRange } from "./aggregate.js";
import type { DatedStatsRow } from "./statsRow.js";

export const WEEKS_SHOWN = 8;

export interface WeekBar {
  weekStart: CalendarDate;
  meters: number;
  /** The calendar's current week (today's) — drawn in `--ink`, `THIS WK`. */
  current: boolean;
  /** The week begins before the range's FROM: no data by construction,
   *  drawn as a dashed outline. The week CONTAINING FROM is in range even
   *  when FROM is not a Monday. Never true on ALL. */
  outOfRange: boolean;
}

export function metresPerWeek(
  rows: readonly DatedStatsRow[],
  range: DateRange,
  today: CalendarDate,
): WeekBar[] {
  // A CUSTOM `to` after today would anchor the window on a future week and
  // draw future zero baselines: the anchor is never later than today.
  const anchor =
    range.to === null || compareDates(range.to, today) > 0 ? today : range.to;
  const lastWeek = mondayOf(anchor);
  const thisWeek = toDayNumber(mondayOf(today));
  const fromWeek =
    range.from === null ? null : toDayNumber(mondayOf(range.from));
  const sums = new Map<number, number>();
  for (const r of rowsInRange(rows, range)) {
    const key = toDayNumber(mondayOf(r.date));
    sums.set(key, (sums.get(key) ?? 0) + (r.workMeters ?? 0));
  }
  return Array.from({ length: WEEKS_SHOWN }, (_, i) => {
    const weekStart = addDays(lastWeek, -7 * (WEEKS_SHOWN - 1 - i));
    const key = toDayNumber(weekStart);
    return {
      weekStart,
      meters: sums.get(key) ?? 0,
      current: key === thisWeek,
      outOfRange: fromWeek !== null && key < fromWeek,
    };
  });
}
