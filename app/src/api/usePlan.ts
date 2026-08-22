import { useEffect, useState } from "react";
import { api } from "../api";
import type { WorkoutType } from "../../domain/types.js";

export type PlanKey = "sprint" | "head";

export interface PlanSequenceItem {
  index: number;
  // Phase 8A wire contract: a bare WorkoutType string — a checkpoint day
  // carries its REAL type here, and the prescription never crosses the
  // wire (Plan.tsx computes the checkpoint mark client-side from PLANS).
  code: WorkoutType;
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
  | {
      state: "ready";
      plan: PlanData;
      // Both PUT /api/plan under the hood (server/routes/data.ts): a bare
      // {planKey} chooses/switches a plan, {reset:true} zeroes doneN without
      // changing planKey — there is no DELETE route for this. Mirrors
      // useBaselines.ts's `save`: await the PUT, throw on a non-2xx so the
      // caller's own try/catch can surface an error, then refetch on
      // success so `plan` reflects the server's new state.
      choose: (planKey: PlanKey) => Promise<void>;
      reset: () => Promise<void>;
    };

// Mirrors useWorkouts.ts's state-machine idiom exactly (loading/error/ready,
// a `generation` counter driving retry) — no plan hook existed before Today
// needed one (grepped for "api/plan" in src first). Task 3 (the Plan screen)
// adds choose/reset to the ready state, the same way useBaselines.ts's ready
// state carries `save` alongside its data.
export function usePlan(): PlanState {
  const [state, setState] = useState<PlanState>({ state: "loading" });
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const refetch = () => setGeneration((g) => g + 1);

    const mutate = async (body: { planKey: PlanKey } | { reset: true }) => {
      const res = await api("/api/plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("failed to update plan");
      refetch();
    };
    const choose = (planKey: PlanKey) => mutate({ planKey });
    const reset = () => mutate({ reset: true });

    api("/api/plan")
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const plan = (await res.json()) as PlanData;
          setState({ state: "ready", plan, choose, reset });
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
