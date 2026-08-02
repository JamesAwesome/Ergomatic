import { useEffect, useState } from "react";
import { api } from "../api";
import type { Difficulty } from "../../domain/types.js";

// GET /api/prefs already returns every PreferencesRow field (server/stores/
// preferences.ts); this type only exposed warmupMinutes until Today (Phase
// 6A) needed difficulties/timeCapMinutes too, and now Countdown (Phase 6B
// Task 2) needs countdownSeconds for the pre-workout count. Purely
// additive each time — no response shape changed, just what the client
// bothers to type.
export interface PreferencesData {
  difficulties: Difficulty[];
  timeCapMinutes: number;
  warmupMinutes: number;
  countdownSeconds: number;
}

export type PreferencesState =
  | { state: "loading" }
  | { state: "error"; retry: () => void }
  | { state: "ready"; preferences: PreferencesData };

export function usePreferences(): PreferencesState {
  const [state, setState] = useState<PreferencesState>({ state: "loading" });
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const retry = () => setGeneration((g) => g + 1);

    api("/api/prefs")
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const preferences = (await res.json()) as PreferencesData;
          setState({ state: "ready", preferences });
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
