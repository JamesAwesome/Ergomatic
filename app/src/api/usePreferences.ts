import { useEffect, useState } from "react";
import { api } from "../api";

// GET /api/prefs already returns every PreferencesRow field (server/stores/
// preferences.ts); this type only exposed warmupMinutes until Today (Phase
// 6A) needed timeCapMinutes too, and now Countdown (Phase 6B
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
// Phase DE PR 1: the server still serves `difficulties` (compat for
// pre-PR-1 builds, server/compat/difficulty.ts); this build does not type
// or read it.
export interface PreferencesData {
  timeCapMinutes: number;
  countdownSeconds: number;
  // Phase RW PR C: "this rower chose to go on without a baseline." Today's
  // doors card renders iff the pair is unset AND this is false.
  baselinesSkipped: boolean;
}

export type PreferencesState =
  | { state: "loading" }
  | { state: "error"; retry: () => void }
  | {
      state: "ready";
      preferences: PreferencesData;
      /** Phase RW PR C. Resolves TRUE only when the server confirms the new
       *  value in its response row — never on `res.ok` alone. An older
       *  server (a rollback to `$PREV`, which `scripts/deploy.sh` really
       *  does) silently ignores an unrecognised key and then returns 200
       *  with the unchanged row, so `res.ok` is true for a write that
       *  stored nothing; a caller branching on it would show the rower a
       *  state the server does not have. On false the caller leaves the UI
       *  as it was and says so (RF25). Refetches on success, the same
       *  `generation` idiom `useBaselines`'s own `save` uses — without it
       *  `preferences` would be stale and the doors would not move. */
      setBaselinesSkipped: (value: boolean) => Promise<boolean>;
    };

export function usePreferences(): PreferencesState {
  const [state, setState] = useState<PreferencesState>({ state: "loading" });
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const retry = () => setGeneration((g) => g + 1);
    const setBaselinesSkipped = async (value: boolean): Promise<boolean> => {
      const res = await api("/api/prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baselinesSkipped: value }),
      });
      if (!res.ok) return false;
      const row = (await res.json()) as Partial<PreferencesData>;
      if (row.baselinesSkipped !== value) return false;
      retry();
      return true;
    };

    api("/api/prefs")
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const preferences = (await res.json()) as PreferencesData;
          setState({ state: "ready", preferences, setBaselinesSkipped });
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
