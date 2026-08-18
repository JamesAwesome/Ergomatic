import { useEffect, useState } from "react";
import { api } from "../api";
import type { WorkoutType } from "../../domain/types.js";

// Declared locally rather than imported from server/stores/logs.ts: client
// hooks in this codebase type their own view of a server response
// (useWorkouts.ts's LibraryWorkout, usePreferences.ts's PreferencesData)
// rather than importing the server's row type, keeping src/ independent of
// server/'s module graph (drizzle-orm, the db schema) entirely.
// UNDER = FASTER than target (under the target NUMBER), OVER = SLOWER
// (post-workout-summary spec, ruling option B, James 2026-08-17): stored
// members unchanged, only the button labels/direction reading changed.
// Mirrored at the options array (LogSession.tsx's HELD_OPTIONS), the
// server's own copy (server/stores/logs.ts), and the pgEnum
// (server/db/schema.ts's `heldResultEnum`).
export type HeldResult = "held" | "under" | "over";
export type Thumbs = "up" | "down";

export interface RecentLog {
  id: string;
  workoutId: string | null;
  workoutTitle: string;
  workoutType: WorkoutType;
  loggedAt: string;
  // Nullable ahead of the write side (post-workout-summary spec, ruling
  // R-A): this read has to tolerate a null row before any code can write
  // one, so an already-installed client never white-screens on it.
  held: HeldResult | null;
  pain: number | null;
  // Post-workout-summary spec (2026-08-17), §3: nullable from day one —
  // this column never had non-null historical data to be backward
  // compatible with (thumbs is new, not loosened), so there is no
  // sequencing concern like `held`/`pain`'s R-A.
  thumbs: Thumbs | null;
  // From-the-log spec (2026-08-18), §2/§3: the three stored heroes plus
  // plan linkage, carried on every list row (`stores/logs.ts`'s
  // `LOG_LIST_COLUMNS` projection) — nullable for the same R-A reason as
  // `held`/`pain` above (pre-spec-2 rows, and any row whose summary never
  // showed a given hero, read back null everywhere; §2's own migration
  // note: "old rows read back null everywhere"). `steps` is deliberately
  // NOT declared here: the list projection drops it (spec §3), and this
  // type never carried it even before this spec.
  avgSplitSeconds: number | null;
  timeSeconds: number | null;
  distanceMeters: number | null;
  planKey: string | null;
  planIndex: number | null;
}

export type RecentLogsState =
  | { state: "loading" }
  | { state: "error"; retry: () => void }
  | { state: "ready"; logs: RecentLog[] };

// Mirrors useWorkouts.ts's state-machine idiom exactly. GET /api/logs?limit=N
// is the existing endpoint (no server changes this phase) — "last three"
// needs no new route, just this client hook and limit=3 at the call site.
export function useRecentLogs(limit: number): RecentLogsState {
  const [state, setState] = useState<RecentLogsState>({ state: "loading" });
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const retry = () => setGeneration((g) => g + 1);
    api(`/api/logs?limit=${limit}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const logs = (await res.json()) as RecentLog[];
          setState({ state: "ready", logs });
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
  }, [limit, generation]);

  return state;
}
