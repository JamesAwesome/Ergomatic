import { useEffect, useState } from "react";
import { api } from "../api";
import type { CalendarDate } from "../../domain/stats/calendar.js";
import type {
  DatedStatsRow,
  StatsRowsResponse,
} from "../../domain/stats/statsRow.js";

/** THE ONE PLACE an instant becomes a date (career-stats spec §4.3): the
 *  LOCAL getters, so a row saved at 23:30 UTC lands on the device's own
 *  calendar day. `useStatsRows.tz.test.ts` pins this under a negative-
 *  offset `TZ`; the domain never sees a `Date` (invariant 14). */
export function toCalendarDate(instant: Date): CalendarDate {
  return {
    y: instant.getFullYear(),
    m: instant.getMonth() + 1,
    d: instant.getDate(),
  };
}

export type StatsRowsState =
  | { state: "loading" }
  | { state: "error"; retry: () => void }
  | { state: "ready"; rows: DatedStatsRow[]; today: CalendarDate };

/** Fetches every row on every mount (`useRecentLogs`'s shape): hook-local
 *  state, no cache outliving the screen, nothing in localStorage — a row
 *  saved or deleted before the next mount is reflected on it (spec §4.3).
 *  `today` is converted here, the same way as every row date. */
export function useStatsRows(): StatsRowsState {
  const [state, setState] = useState<StatsRowsState>({ state: "loading" });
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Retry shows LOADING again at once (the stale alert must not survive
    // the tap), then refetches under a new generation.
    const retry = () => {
      setState({ state: "loading" });
      setGeneration((g) => g + 1);
    };
    api("/api/stats/rows")
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const body = (await res.json()) as StatsRowsResponse;
          setState({
            state: "ready",
            rows: body.rows.map((r) => ({
              ...r,
              date: toCalendarDate(new Date(r.loggedAt)),
            })),
            today: toCalendarDate(new Date()),
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
