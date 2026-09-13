/**
 * The SEASON card (spec §3.2 "Season cumulative", §3.3, invariant 19): ONE
 * row set — every row dated May 1 of the current season through today,
 * NEVER the filter's range — feeds the curve, `<n> TODAY`, AVG M/DAY and
 * both streaks, so no two figures in the card can disagree about which
 * rows exist. The streak is Ergomatic-invented (the logbook has none) and
 * keys on ROWS, not metres: a week whose only row has null metres counts.
 */
import {
  compareDates,
  mondayOf,
  seasonOf,
  toDayNumber,
  type CalendarDate,
  type Season,
} from "./calendar.js";
import { rowsInRange } from "./aggregate.js";
import type { DatedStatsRow } from "./statsRow.js";

export interface SeasonPoint {
  date: CalendarDate;
  /** Σ workMeters of the rows on this date. */
  meters: number;
  cumulative: number;
}

export interface Streak {
  /** Counting weeks ending at this week, or at last week when this week
   *  has no row yet (an unfinished week never breaks a streak). */
  current: number;
  longest: number;
}

export interface SeasonSummary {
  season: Season;
  /** Rows dated May 1 … today. */
  rows: number;
  total: number;
  /** (today − May 1) + 1: May 1 itself is day 1 (§14 ruling 3). */
  days: number;
  avgPerDay: number;
  /** One point per row DATE, ascending. */
  points: SeasonPoint[];
  streak: Streak;
}

/** Streak arithmetic over week-start day numbers (Mondays). */
export function streakOf(
  weekKeys: ReadonlySet<number>,
  today: CalendarDate,
): Streak {
  const thisWeek = toDayNumber(mondayOf(today));
  let cursor = weekKeys.has(thisWeek) ? thisWeek : thisWeek - 7;
  let current = 0;
  while (weekKeys.has(cursor)) {
    current += 1;
    cursor -= 7;
  }
  let longest = 0;
  let run = 0;
  let prev: number | null = null;
  for (const k of [...weekKeys].sort((a, b) => a - b)) {
    run = prev !== null && k === prev + 7 ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = k;
  }
  return { current, longest };
}

export function seasonSummary(
  rows: readonly DatedStatsRow[],
  today: CalendarDate,
): SeasonSummary {
  const season = seasonOf(today);
  const inSeason = rowsInRange(rows, { from: season.start, to: today }).sort(
    (a, b) => compareDates(a.date, b.date),
  );
  const points: SeasonPoint[] = [];
  let cumulative = 0;
  for (const r of inSeason) {
    const m = r.workMeters ?? 0;
    cumulative += m;
    const last = points[points.length - 1];
    if (last && compareDates(last.date, r.date) === 0) {
      last.meters += m;
      last.cumulative = cumulative;
    } else {
      points.push({ date: r.date, meters: m, cumulative });
    }
  }
  const days = toDayNumber(today) - toDayNumber(season.start) + 1;
  const weekKeys = new Set(inSeason.map((r) => toDayNumber(mondayOf(r.date))));
  return {
    season,
    rows: inSeason.length,
    total: cumulative,
    days,
    avgPerDay: cumulative / days,
    points,
    streak: streakOf(weekKeys, today),
  };
}
