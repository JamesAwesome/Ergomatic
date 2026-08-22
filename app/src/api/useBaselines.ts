import { useEffect, useState } from "react";
import { api } from "../api";

export interface BaselinesData {
  k2Seconds: number | null;
  k6Seconds: number | null;
}

/** Phase BL PR A: the provenance vocabulary the server's baseline_source
 *  pgEnum accepts. The editor only ever sends `manual` (a typed/nudged
 *  entry) and `derived` (an accepted counterpart derivation); `estimated`
 *  and `tested` belong to the questionnaire and the post-test prompt
 *  (PRs B/C). */
export type BaselineSource = "manual" | "estimated" | "derived" | "tested";

/** Task review round (PR #66, Finding 1, BLOCKER): PARTIAL — the server's
 *  own per-field PUT loop (server/routes/data.ts's `/api/baselines` route)
 *  only writes fields present in the body, and `stores/baselines.ts`'s
 *  `put()` spreads that same partial object into both the INSERT and the
 *  `onConflictDoUpdate` set, so an omitted field is never touched in
 *  Postgres either. `BaselineEditor.tsx`'s Apply relies on this to never
 *  fabricate a value for a side the rower never actually touched — and,
 *  since PR A, to never flip an omitted field's stored SOURCE either: a
 *  number sent without its source is stamped `manual` server-side (an old
 *  client's plain write is a manual entry), so an untouched field must
 *  stay out of the body entirely, not ride along as a value no-op. */
export interface BaselinesPatch {
  k2Seconds?: number;
  k2Source?: BaselineSource;
  k6Seconds?: number;
  k6Source?: BaselineSource;
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
