import { useEffect, useState } from "react";
import { api } from "../api";

export interface PreferencesData {
  warmupMinutes: number;
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
