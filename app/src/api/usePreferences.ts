import { useEffect, useState } from "react";
import { api } from "../api";
import type { Difficulty } from "../../domain/types.js";

/** The warm-up SETTING (2026-08-09's warmup-setting design, §2): a per-user
 *  preference that `buildRun` (`src/session/engine.ts`) prepends to every
 *  session, replacing the `wu` step type that left the authoring union.
 *  `null` (the column's default) means OFF, which is the default for
 *  everyone per James's ruling.
 *
 *  Written as an intersection of a kind-discriminated union with an
 *  optional `restSeconds` so a REST-ONLY setting is UNREPRESENTABLE: every
 *  value must name a `kind` and its duration first. Bounds (time 1..30
 *  whole minutes; distance 100..10000 whole meters; rest 5..595 whole
 *  seconds, the PM5 rest ceiling) are the SERVER's to enforce on PUT
 *  /api/prefs — this client type deliberately states the shape only.
 *
 *  MIRROR NOTE (plan Task 2/Task 4): the plan orders the server column
 *  (Task 2) before this prepend (Task 4), but the tasks were reordered, so
 *  this client copy is introduced FIRST and is currently the only
 *  declaration. Task 2 exports the identical type from
 *  `server/stores/preferences.ts` (`PreferencesRow.warmup`) — keep the two
 *  byte-identical; the client cannot import from `server/stores/` and the
 *  repo's existing convention for this hook's other fields is a
 *  hand-mirrored client type, not a shared module. */
export type WarmupSetting = (
  { kind: "time"; minutes: number } | { kind: "distance"; meters: number }
) & { restSeconds?: number };

// GET /api/prefs already returns every PreferencesRow field (server/stores/
// preferences.ts); this type only exposed warmupMinutes until Today (Phase
// 6A) needed difficulties/timeCapMinutes too, and now Countdown (Phase 6B
// Task 2) needs countdownSeconds for the pre-workout count, and Phase 6I's
// START HERE block needs startHereDismissed. Purely additive each time — no
// response shape changed, just what the client bothers to type.
//
// `warmup` (the warmup-setting design §2) is the field that eventually
// REPLACES `warmupMinutes` — but the two overlap for now, on purpose:
// Task 2 is what drops the `warmupMinutes`/`warmupOverride` columns and
// Task 5 is what rewrites the Builder's hint line (Builder.tsx:415), this
// hook's only reader of the old field. Removing it here would be doing
// Task 5's work with none of Task 5's tests.
//
// Until Task 2 lands, the route does not send `warmup` at all, so it reads
// `undefined` at runtime rather than `null` (hence the `?`). Every
// consumer treats absent and null identically — `buildRun`'s own
// `warmup?: WarmupSetting | null` parameter accepts both and prepends
// nothing for either.
export interface PreferencesData {
  difficulties: Difficulty[];
  timeCapMinutes: number;
  warmupMinutes: number;
  warmup?: WarmupSetting | null;
  countdownSeconds: number;
  startHereDismissed: boolean;
}

export type PreferencesState =
  | { state: "loading" }
  | { state: "error"; retry: () => void }
  | {
      state: "ready";
      preferences: PreferencesData;
      // Phase 6I: START HERE's DISMISS is the first client-side write this
      // hook has ever needed to expose. Same optimistic/silent-failure shape
      // as useArticleReads.ts's markRead/markUnread (PUT /api/prefs already
      // accepts any subset of fields — server/routes/data.ts's own patch —
      // so `save` mirrors that: a partial patch merged into the local value
      // immediately, the PUT fired fire-and-forget beside it).
      save: (patch: Partial<PreferencesData>) => void;
    };

export function usePreferences(): PreferencesState {
  const [state, setState] = useState<PreferencesState>({ state: "loading" });
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const retry = () => setGeneration((g) => g + 1);
    // Mutable snapshot of the ready preferences, kept OUTSIDE React state —
    // same purity shape as useArticleReads.ts's `currentSlugs`: the merge
    // and the PUT both happen here, before `setState` runs, so a StrictMode
    // double-invoke of the updater below can only replay the same
    // already-computed `next`, never refire the request.
    let current: PreferencesData | null = null;

    const save = (patch: Partial<PreferencesData>) => {
      // Required for TypeScript to narrow `current` before the spread below
      // — not reachable at runtime, since `save` is only ever exposed once
      // the "ready" state (set in the same tick `current` is first
      // assigned, right below) has been reached.
      if (current === null) return;
      current = { ...current, ...patch };
      // Fire-and-forget: a failed PUT simply leaves the preference
      // unchanged server-side; the optimistic value may revert on next
      // load (same nicety-class failure handling as article reads).
      void api("/api/prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }).catch(() => {});
      const next = current;
      // Same TypeScript-narrowing requirement as useArticleReads.ts's
      // mirror comment, and equally unreachable at runtime for the same
      // reason: `retry` (the only thing that can rerun this effect) lives
      // exclusively on the ERROR variant, never the ready one, so a hook
      // that has reached "ready" has no path back out of it — `save` can
      // never observe a `prev` other than "ready" when its queued update
      // actually runs.
      setState((prev) =>
        prev.state !== "ready" ? prev : { ...prev, preferences: next },
      );
    };

    api("/api/prefs")
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const preferences = (await res.json()) as PreferencesData;
          current = preferences;
          setState({ state: "ready", preferences, save });
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
