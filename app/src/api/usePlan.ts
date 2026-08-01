import { useEffect, useState } from "react";
import { api } from "../api";
import type { PlanCode } from "../../domain/plans.js";

export type PlanKey = "sprint" | "head";

export interface PlanSequenceItem {
  index: number;
  code: PlanCode;
  status: "done" | "today" | "upcoming";
}

export interface PlanData {
  planKey: PlanKey | null;
  doneN: number;
  sequence: PlanSequenceItem[];
}

export type PlanState =
  | { state: "loading" }
  | { state: "error"; retry: () => void }
  | { state: "ready"; plan: PlanData };

// Mirrors useWorkouts.ts's state-machine idiom exactly (loading/error/ready,
// a `generation` counter driving retry) — no plan hook existed before Today
// needed one (grepped for "api/plan" in src first).
export function usePlan(): PlanState {
  const [state, setState] = useState<PlanState>({ state: "loading" });
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const retry = () => setGeneration((g) => g + 1);
    api("/api/plan")
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const plan = (await res.json()) as PlanData;
          setState({ state: "ready", plan });
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
