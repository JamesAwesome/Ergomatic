/**
 * TEST TREND (spec §3.3, §5 item 6): two series of split seconds over the
 * date of `test_history.loggedAt`, never filtered by the range, and never
 * dropped when the linked log is deleted (`ON DELETE SET NULL`, §14
 * ruling 4). Two tests on one calendar day are UNORDERED between
 * themselves (`stores/testHistory.ts` `list()` orders by `desc(loggedAt)`
 * alone and the wire carries no tiebreaker) — and unreachable in
 * production, where every append is keyed to one saved log
 * (`sessionLogId` UNIQUE) at `defaultNow()`. The sort is stable, so such
 * a pair keeps the order the adapter handed over; nothing depends on it.
 */
import { compareDates, type CalendarDate } from "./calendar.js";

export type TestDistance = "2k" | "6k";

export interface TestPoint {
  id: string;
  distance: TestDistance;
  splitSeconds: number;
  date: CalendarDate;
}

export type TestTrend = Record<TestDistance, TestPoint[]>;

export function testTrend(points: readonly TestPoint[]): TestTrend {
  const byDate = [...points].sort((a, b) => compareDates(a.date, b.date));
  return {
    "2k": byDate.filter((p) => p.distance === "2k"),
    "6k": byDate.filter((p) => p.distance === "6k"),
  };
}
