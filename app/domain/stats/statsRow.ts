import type { LogSource, WorkoutType } from "../types.js";
import type { StatsTier } from "./rowContribution.js";
import type { CalendarDate } from "./calendar.js";

/**
 * `GET /api/stats/rows`'s per-row projection (spec §4.3), declared ONCE
 * here so the route that builds it and the hook that reads it share one
 * key set — the §8.4 key-set test pins this against an independent
 * literal list, and no logbook-link field may ever join it (invariant 12).
 * `loggedAt` is the ISO instant; the CLIENT adapter turns it into a date.
 */
export interface StatsRow {
  id: string;
  loggedAt: string;
  source: LogSource;
  workoutType: WorkoutType | null;
  tier: StatsTier;
  workMeters: number | null;
  workSeconds: number | null;
  restMeters: number | null;
  restSeconds: number | null;
  calories: number | null;
}

export interface StatsRowsResponse {
  rows: StatsRow[];
}

/** What the domain aggregates over: the wire row plus the device-zone
 *  calendar date the adapter derived from `loggedAt` (spec §4.3). */
export type DatedStatsRow = StatsRow & { date: CalendarDate };
