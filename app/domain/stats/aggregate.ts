/**
 * Phase PS (spec §3.2): the career figures as pure sums over
 * `DatedStatsRow[]`. No clock, no zone, no `Date` (invariant 14). PR 1
 * ships totals, both columns, and TIME BY TYPE; metres per week, the
 * season curve, streaks and avg m/day are PR 2.
 */
import { logbookWatts } from "../logbook.js";
import { inRange, type DateRange } from "./calendar.js";
import type { DatedStatsRow } from "./statsRow.js";

export interface Totals {
  meters: number;
  seconds: number;
  sessions: number;
}

export interface MachineTotals extends Totals {
  /** Rows in tier `machine` — the `n` of `n OF m CARRY THE MONITOR'S OWN
   *  TOTALS`; `m` is `sessions`. */
  ownTotals: number;
  restMeters: number;
  calories: number;
  /** Rows carrying a `totalCalories` — the `n` of `n OF m ROWS CARRY IT`. */
  caloriesRows: number;
  /** `logbookWatts(Σs, Σm)` over machine rows whose tier can know work-only
   *  (§14 ruling 6: `stored`-tier rows excluded); `undefined` = a dash. */
  avgWatts: number | undefined;
}

export interface StatsSummary {
  all: Totals;
  machine: MachineTotals;
  /** Rows in tier `stored` in range (any source) — the `k` of the seam
   *  line `k ROWS PREDATE WORK-ONLY TOTALS · NOT IN AVG WATTS`. */
  storedTierRows: number;
}

export function rowsInRange(
  rows: readonly DatedStatsRow[],
  range: DateRange,
): DatedStatsRow[] {
  return rows.filter((r) => inRange(r.date, range));
}

function totals(rows: readonly DatedStatsRow[]): Totals {
  let meters = 0;
  let seconds = 0;
  for (const r of rows) {
    meters += r.workMeters ?? 0;
    seconds += r.workSeconds ?? 0;
  }
  return { meters, seconds, sessions: rows.length };
}

export function summarize(
  rows: readonly DatedStatsRow[],
  range: DateRange,
): StatsSummary {
  const inR = rowsInRange(rows, range);
  const machine = inR.filter((r) => r.source === "pm5");
  let restMeters = 0;
  let calories = 0;
  let caloriesRows = 0;
  let wattsSeconds = 0;
  let wattsMeters = 0;
  for (const r of machine) {
    restMeters += r.restMeters ?? 0;
    if (r.calories !== null) {
      calories += r.calories;
      caloriesRows += 1;
    }
    if (
      r.tier !== "stored" &&
      r.workSeconds !== null &&
      r.workMeters !== null
    ) {
      wattsSeconds += r.workSeconds;
      wattsMeters += r.workMeters;
    }
  }
  return {
    all: totals(inR),
    machine: {
      ...totals(machine),
      ownTotals: machine.filter((r) => r.tier === "machine").length,
      restMeters,
      calories,
      caloriesRows,
      avgWatts: logbookWatts(wattsSeconds, wattsMeters),
    },
    storedTierRows: inR.filter((r) => r.tier === "stored").length,
  };
}

/** Stack order, validated by the dataviz palette check (§14 ruling 13).
 *  NO TYPE is Ergomatic's own bucket for `workoutType === null`, never a
 *  member of `WORKOUT_TYPES` (invariant 9). */
export const TYPE_BUCKET_ORDER = ["AN", "AT", "O2", "TR", "NO TYPE"] as const;
export type TypeBucketKey = (typeof TYPE_BUCKET_ORDER)[number];

export interface TypeBucket {
  key: TypeBucketKey;
  seconds: number;
  /** seconds ÷ the range's Σ workSeconds (0..1); printed as a whole percent. */
  share: number;
}

/** Non-empty buckets only, in stack order (invariant 17: a 0-s bucket has
 *  no segment and no legend row); their seconds sum to the TIME row. */
export function timeByType(
  rows: readonly DatedStatsRow[],
  range: DateRange,
): TypeBucket[] {
  const seconds: Record<TypeBucketKey, number> = {
    AN: 0,
    AT: 0,
    O2: 0,
    TR: 0,
    "NO TYPE": 0,
  };
  let total = 0;
  for (const r of rowsInRange(rows, range)) {
    const s = r.workSeconds ?? 0;
    seconds[r.workoutType ?? "NO TYPE"] += s;
    total += s;
  }
  return TYPE_BUCKET_ORDER.filter((key) => seconds[key] > 0).map((key) => ({
    key,
    seconds: seconds[key],
    share: total > 0 ? seconds[key] / total : 0,
  }));
}
