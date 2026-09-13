import type { SeasonSummary } from "../../../domain/stats/season.js";
import type {
  TestDistance,
  TestTrend,
} from "../../../domain/stats/testTrend.js";
import type { WeekBar } from "../../../domain/stats/weekly.js";
import { fmtMeters, fmtSplit } from "../../../domain/format.js";
import { fmtDayMonth } from "./format";

/**
 * The three charts' accessible names. `role="img"` PRUNES an SVG's own
 * `<text>` nodes (ARIA presentational children), so the `aria-label` is the
 * ONLY thing assistive tech hears — each label says what the marks MEAN,
 * never a raw value for a mark that means something else (an out-of-range
 * week is not `0`). `StackedBar` takes the other safe shape: `aria-hidden`
 * with the values in a real-text legend beside it.
 */
export function weekBarsLabel(bars: readonly WeekBar[]): string {
  const parts = bars.map((b) =>
    b.outOfRange
      ? `${fmtDayMonth(b.weekStart)} outside the range`
      : b.current
        ? `this week ${fmtMeters(b.meters)}`
        : `${fmtDayMonth(b.weekStart)} ${fmtMeters(b.meters)}`,
  );
  return `Metres per week, eight weeks: ${parts.join(", ")}`;
}

/** `<n> TODAY`, AVG M/DAY and the streaks, SAID (the tiles below the curve
 *  are real text and carry the last three again). */
export function seasonLabel(s: SeasonSummary): string {
  return `Season ${s.season.name} cumulative metres, ${fmtMeters(s.total)} today, ${fmtMeters(s.avgPerDay)} per day, current streak ${s.streak.current}, longest ${s.streak.longest}`;
}

/** The `<p>` legend under the trend carries only the series names, so the
 *  last splits are said here. */
export function trendLabel(trend: TestTrend): string {
  const last = (k: TestDistance) => {
    const p = trend[k][trend[k].length - 1];
    return p ? `latest ${k} ${fmtSplit(p.splitSeconds)}` : `no ${k}`;
  };
  return `2k and 6k test splits over time, ${trend["2k"].length + trend["6k"].length} tests, ${last("2k")}, ${last("6k")}`;
}
