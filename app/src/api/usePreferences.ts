import { useEffect, useState } from "react";
import { api } from "../api";
import type { Difficulty } from "../../domain/types.js";

// GET /api/prefs already returns every PreferencesRow field (server/stores/
// preferences.ts); this type only exposed warmupMinutes until Today (Phase
// 6A) needed difficulties/timeCapMinutes too, and now Countdown (Phase 6B
// Task 2) needs countdownSeconds for the pre-workout count. Purely
// additive each time — no response shape changed, just what the client
// bothers to type.
//
// The 2026-08-09 warmup-setting design (§2) REPLACED `warmupMinutes` with a
// `warmup` field here (Task 2 of that spec dropped the `warmupMinutes`/
// `warmupOverride` server columns); Phase WU (2026-08-21) then removed the
// setting outright, and with it this field. `startHereDismissed` (Phase
// 6I's START HERE block) went the same way on 2026-08-23 — James removed
// the teaching surfaces, and with them this hook's only write (`save`);
// the server column stays, dormant (server/db/schema.ts's own comment).
export interface PreferencesData {
  difficulties: Difficulty[];
  timeCapMinutes: number;
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
