import { useEffect, useState } from "react";
import { api } from "../api";
import type { Step, WorkoutType } from "../../domain/types";

export interface LibraryWorkout {
  id: string;
  title: string;
  type: WorkoutType;
  pain: number;
  steps: Step[];
  isGlobal: boolean;
  lastDoneDaysAgo: number | null;
}

export type WorkoutsState =
  | { state: "loading" }
  | { state: "error"; retry: () => void }
  | { state: "ready"; workouts: LibraryWorkout[] };

export function useWorkouts(): WorkoutsState {
  const [state, setState] = useState<WorkoutsState>({ state: "loading" });
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const retry = () => setGeneration((g) => g + 1);
    api("/api/workouts")
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          // RC-21 (ULTRAREVIEW round, 2026-08-26): this used to be a bare
          // `as LibraryWorkout[]` — a CAST, not a check — so any 200 whose
          // body is not an array reached `state: "ready"` with a non-array,
          // and `RetestShortcut`'s `workouts.find(...)` threw
          // `workouts.find is not a function`, taking down the You screen.
          // An error envelope, `null`, `{}`, or the HTML a captive portal or
          // a misrouted proxy serves with a 200 all reach it.
          // The unit suite reproduced it INTERMITTENTLY through mock
          // ordering, which is why it was recorded as a flake three times
          // rather than fixed. A TypeError thrown from a component is never
          // a flake; it is a real crash with a timing-dependent trigger.
          // Failing into the existing `"error"` state costs nothing and
          // gives the rower the retry that state already carries.
          const body: unknown = await res.json();
          if (Array.isArray(body)) {
            setState({ state: "ready", workouts: body as LibraryWorkout[] });
          } else {
            setState({ state: "error", retry });
          }
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
