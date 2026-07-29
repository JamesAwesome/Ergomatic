import { useEffect, useState } from "react";
import { api } from "../api";

export interface BaselinesData {
  k2Seconds: number | null;
  k6Seconds: number | null;
}

export type BaselinesState =
  | { state: "loading" }
  | { state: "error"; retry: () => void }
  | {
      state: "ready";
      baselines: BaselinesData;
      save: (next: { k2Seconds: number; k6Seconds: number }) => Promise<void>;
    };

export function useBaselines(): BaselinesState {
  const [state, setState] = useState<BaselinesState>({ state: "loading" });
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const refetch = () => setGeneration((g) => g + 1);
    const save = async (next: { k2Seconds: number; k6Seconds: number }) => {
      const res = await api("/api/baselines", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error("failed to save baselines");
      refetch();
    };

    api("/api/baselines")
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const baselines = (await res.json()) as BaselinesData;
          setState({ state: "ready", baselines, save });
        } else {
          setState({ state: "error", retry: refetch });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ state: "error", retry: refetch });
      });
    return () => {
      cancelled = true;
    };
  }, [generation]);

  return state;
}
