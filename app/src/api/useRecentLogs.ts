import { useEffect, useState } from "react";
import { api } from "../api";
import type { WorkoutType } from "../../domain/types.js";

// Declared locally rather than imported from server/stores/logs.ts: client
// hooks in this codebase type their own view of a server response
// (useWorkouts.ts's LibraryWorkout, usePreferences.ts's PreferencesData)
// rather than importing the server's row type, keeping src/ independent of
// server/'s module graph (drizzle-orm, the db schema) entirely.
export type HeldResult = "held" | "under" | "over";

export interface RecentLog {
  id: string;
  workoutId: string | null;
  workoutTitle: string;
  workoutType: WorkoutType;
  loggedAt: string;
  held: HeldResult;
  pain: number;
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
