import { useEffect, useState } from "react";
import { api } from "../api";

export interface BaselinesData {
  k2Seconds: number | null;
  k6Seconds: number | null;
}

/** Task review round (PR #66, Finding 1, BLOCKER): PARTIAL — the server's
 *  own per-field PUT loop (server/routes/data.ts's `/api/baselines` route)
 *  only writes fields present in the body, and `stores/baselines.ts`'s
 *  `put()` spreads that same partial object into both the INSERT and the
 *  `onConflictDoUpdate` set, so an omitted field is never touched in
 *  Postgres either. `BaselineEditor.tsx`'s Apply relies on this to never
 *  fabricate a value for a side the rower never actually touched. */
export interface BaselinesPatch {
  k2Seconds?: number;
  k6Seconds?: number;
}

export type BaselinesState =
  | { state: "loading" }
  | { state: "error"; retry: () => void }
  | {
      state: "ready";
      baselines: BaselinesData;
      save: (next: BaselinesPatch) => Promise<void>;
    };

export function useBaselines(): BaselinesState {
  const [state, setState] = useState<BaselinesState>({ state: "loading" });
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const refetch = () => setGeneration((g) => g + 1);
    const save = async (next: BaselinesPatch) => {
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
