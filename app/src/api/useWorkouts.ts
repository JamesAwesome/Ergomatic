import { useEffect, useState } from "react";
import { api } from "../api";
import type { Difficulty, Step, WorkoutType } from "../../domain/types";

export interface LibraryWorkout {
  id: string;
  title: string;
  type: WorkoutType;
  difficulty: Difficulty;
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
          const workouts = (await res.json()) as LibraryWorkout[];
          setState({ state: "ready", workouts });
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
