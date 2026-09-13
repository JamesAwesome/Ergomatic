import { useEffect, useState } from "react";
import { api } from "../api";
import type { TestPoint } from "../../domain/stats/testTrend.js";
import { toCalendarDate } from "./useStatsRows";

/** `GET /api/test-history`'s row (`server/stores/testHistory.ts` `list`,
 *  `res.json` of the store row): the four fields the trend reads. */
export interface TestHistoryRow {
  id: string;
  distance: "2k" | "6k";
  splitSeconds: number;
  /** ISO instant — the APPEND instant (spec §3.3); converted here. */
  loggedAt: string;
}

/** The SAME conversion as every stats row date: `toCalendarDate`, the one
 *  instant→date seam, in the device zone. `useTestHistory.tz.test.ts` pins
 *  it under a negative-offset `TZ`. */
export function testRowToPoint(row: TestHistoryRow): TestPoint {
  return {
    id: row.id,
    distance: row.distance,
    splitSeconds: row.splitSeconds,
    date: toCalendarDate(new Date(row.loggedAt)),
  };
}

export type TestHistoryState =
  | { state: "loading" }
  | { state: "error"; retry: () => void }
  | { state: "ready"; points: TestPoint[] };

/** Fetches every test on every mount (`useStatsRows`'s shape): hook-local
 *  state, no cache outliving the screen. The route lists NEWEST first; the
 *  points are handed over OLDEST first — append order — so the domain's
 *  stable sort keeps two same-day tests in the order they were logged. */
export function useTestHistory(): TestHistoryState {
  const [state, setState] = useState<TestHistoryState>({ state: "loading" });
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const retry = () => {
      setState({ state: "loading" });
      setGeneration((g) => g + 1);
    };
    api("/api/test-history")
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const rows = (await res.json()) as TestHistoryRow[];
          setState({
            state: "ready",
            points: rows.map(testRowToPoint).reverse(),
          });
        } else {
          setState({ state: "error", retry });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ state: "error", retry });
      });
    return () => {
      cancelled = true;
    };
  }, [generation]);

  return state;
}
