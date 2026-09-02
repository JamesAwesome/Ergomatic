import { useEffect, useState } from "react";
import { api } from "../api";
import type { WorkoutType } from "../../domain/types.js";
import type { CloseReason } from "../monitor/monitorRun";

// Declared locally rather than imported from server/stores/logs.ts: client
// hooks in this codebase type their own view of a server response
// (useWorkouts.ts's LibraryWorkout, usePreferences.ts's PreferencesData)
// rather than importing the server's row type, keeping src/ independent of
// server/'s module graph (drizzle-orm, the db schema) entirely.
// UNDER = FASTER than target (under the target NUMBER), OVER = SLOWER
// (post-workout-summary spec, ruling option B, James 2026-08-17): stored
// members unchanged, only the button labels/direction reading changed.
// Mirrored at the options array (LogSession.tsx's HELD_OPTIONS), the
// server's own copy (server/stores/logs.ts), and the pgEnum
// (server/db/schema.ts's `heldResultEnum`).
export type HeldResult = "held" | "under" | "over";
export type Thumbs = "up" | "down";

export interface RecentLog {
  id: string;
  workoutId: string | null;
  workoutTitle: string;
  /** Phase JR PR 1: NULLABLE. A free row (Just Row) prescribed no
   *  intensity, so it stores none. `TypeBadge` renders NOTHING for null —
   *  an absence, never an empty badge (exit criterion 2). */
  workoutType: WorkoutType | null;
  loggedAt: string;
  // Nullable ahead of the write side (post-workout-summary spec, ruling
  // R-A): this read has to tolerate a null row before any code can write
  // one, so an already-installed client never white-screens on it.
  held: HeldResult | null;
  pain: number | null;
  // Post-workout-summary spec (2026-08-17), §3: nullable from day one —
  // this column never had non-null historical data to be backward
  // compatible with (thumbs is new, not loosened), so there is no
  // sequencing concern like `held`/`pain`'s R-A.
  thumbs: Thumbs | null;
  // From-the-log spec (2026-08-18), §2/§3: the three stored heroes plus
  // plan linkage, carried on every list row (`stores/logs.ts`'s
  // `LOG_LIST_COLUMNS` projection) — nullable for the same R-A reason as
  // `held`/`pain` above (pre-spec-2 rows, and any row whose summary never
  // showed a given hero, read back null everywhere; §2's own migration
  // note: "old rows read back null everywhere"). `steps` is deliberately
  // NOT declared here: the list projection drops it (spec §3), and this
  // type never carried it even before this spec.
  avgSplitSeconds: number | null;
  timeSeconds: number | null;
  distanceMeters: number | null;
  planKey: string | null;
  planIndex: number | null;
  // RC-5 (hero-truth design spec) §3, Task 4: the list's own tier inputs
  // — `LogRow.tsx`'s tier logic reads these to make the SAME DISTANCE/AVG
  // SPLIT call `storedSummary.ts`'s `buildHeroes` makes on the detail
  // screen for the identical row, rather than always showing the OLD
  // fused `avgSplitSeconds`/`distanceMeters` columns below. Required-and-
  // nullable, same convention as every other hero field on this
  // interface (`stores/logs.ts`'s `LOG_LIST_COLUMNS` always selects all
  // five; null is the common case for a pre-tier row).
  //
  // RC-1's own work pair (`server/stores/logs.ts`'s `LOG_LIST_COLUMNS`,
  // already selected there before this task).
  workSeconds: number | null;
  workMeters: number | null;
  // RC-2/RC-3 wave's own machine totals (same source, already selected).
  machineWorkSeconds: number | null;
  machineWorkMeters: number | null;
  // RC-5 §3, Task 4, option (a): a narrow jsonb-path scalar projected out
  // of `machineSummary` server-side (`LOG_LIST_COLUMNS`'s own comment) —
  // the ONE key this screen needs (the machine's own average split) with
  // no blob and no migration. Absent (`null`) on a build-738-era row
  // whose machine totals predate this field entirely — `LogRow.tsx`
  // renders NO avg-split segment then, never a fallback quotient off
  // `avgSplitSeconds` below (Global Constraints: the PM5 truncates, we
  // round, and printing our own quotient beside what the detail screen
  // would show as absent is the exact defect this task exists to kill).
  machineAvgPaceSecondsPer500m: number | null;
  // Door spec (2026-09-02) §1.3: the honest close reason, required-and-
  // nullable — the same convention every hero field above uses, because
  // `LOG_LIST_COLUMNS` (`server/stores/logs.ts`) ALWAYS selects the
  // column and `null` is the common case (a phone-timer/manual log, or
  // any row predating Phase LL Task 4). The column has been projected
  // into this response since Phase LL Task 4; only the client-side
  // declaration is new, and only because `LogRow` now reads it — the
  // `link-lost` chip renders on rows the PARTIAL predicate EXCLUDES, so
  // the word cannot be derived from `partial` alone.
  //
  // Mirrors `StoredLog.endedBy`'s widened union rather than a fourth
  // hand-copied literal list, minus that field's optionality: the detail
  // row tolerates a response that never carried the key at all, while
  // this projection cannot omit it.
  endedBy: (CloseReason | "interrupted") | null;
  // Door spec (2026-09-02) §1.3: DERIVED at read time, not stored — no
  // column, no migration, nothing to roll back. `LOG_LIST_COLUMNS`
  // evaluates §1.1's four PARTIAL clauses in SQL because this projection
  // deliberately drops `steps`, which clause 3 needs; the detail screen
  // evaluates the identical clauses in TypeScript
  // (`src/log/storedSummary.ts`'s `partialCloseReason`), and
  // `server/routes/partial.integration.test.ts` holds the two equal row
  // for row.
  //
  // Required BOOLEAN, never nullable: the server wraps the whole
  // predicate in `coalesce(..., false)` precisely so a legacy row with a
  // null `ended_by` reads `false` here rather than `null`.
  partial: boolean;
}

export type RecentLogsState =
  | { state: "loading" }
  | { state: "error"; retry: () => void }
  | { state: "ready"; logs: RecentLog[] };

// Mirrors useWorkouts.ts's state-machine idiom exactly. GET /api/logs?limit=N
// is the existing endpoint (no server changes this phase) — "last three"
// needs no new route, just this client hook and limit=3 at the call site.
export function useRecentLogs(limit: number): RecentLogsState {
  const [state, setState] = useState<RecentLogsState>({ state: "loading" });
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const retry = () => setGeneration((g) => g + 1);
    api(`/api/logs?limit=${limit}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const logs = (await res.json()) as RecentLog[];
          setState({ state: "ready", logs });
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
  }, [limit, generation]);

  return state;
}
