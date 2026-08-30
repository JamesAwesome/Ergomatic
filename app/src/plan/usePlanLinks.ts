import { useEffect, useState } from "react";
import { api } from "../api";
import type { PlanKey } from "../api/usePlan";

/** What one linked done row knows about the session that closed it: which
 *  log to open, and the workout that log recorded. `GET /api/logs?plan=
 *  <key>`'s own response shape minus `planIndex`, which becomes this Map's
 *  key (spec §3, newest-wins per index via `stores/logs.ts`'s
 *  `listPlanLinks`). Declared locally rather than imported from the server
 *  (same `src/`-independent-of-`server/` convention `useRecentLogs.ts`'s
 *  own header states for `RecentLog`).
 *
 *  `workoutType` is a bare `string`, mirroring the column it comes from
 *  (`session_logs.workout_type` is plain `text`, deliberately NOT the
 *  workouts table's enum) — the Plan screen narrows it to a `WorkoutType`
 *  for itself, and falls back to the plan's own type when it cannot. */
export interface PlanLink {
  id: string;
  workoutTitle: string;
  workoutType: string;
}

/** Plan's done-row link (spec §1/§3): "one fetch on mount when a plan is
 *  active" — antagonist B10's own correction that this is an ADDITION to
 *  Plan's existing `/api/plan` fetch, not a reuse, and explicitly NOT a
 *  per-row fetch or a join into plan_state. `planKey === null` (no active
 *  plan — the picker screen) fires no fetch at all: there is no sequence
 *  to link.
 *
 *  A failure (network error, non-2xx) or the fetch simply still being in
 *  flight both resolve to the same empty Map: this is a progressive
 *  enhancement over the plan sequence `usePlan` already delivered, not a
 *  second thing that can fail the whole Plan screen — done rows fall back
 *  to plain text exactly the way a genuinely unlinked pre-spec-2 row does
 *  (§1: "rows without linkage stay plain text"), with no separate loading/
 *  error state surfaced anywhere. */
// Stable empty-Map reference for the no-active-plan case — returned
// directly rather than synced into state via a `setLinks(new Map())` call
// in the effect body below (which the `react-hooks/set-state-in-effect`
// rule flags: a value computable straight from a prop/argument, here
// `planKey === null`, should be derived during render, not synchronized
// after the fact — same reasoning `FromTheLog.tsx`'s own `FetchState`
// comment gives for its lazy `useState` initializer).
const EMPTY_LINKS: Map<number, PlanLink> = new Map();

/** Per-entry shape check.
 *
 *  This response used to be read for exactly one purpose — an `id` to put
 *  in a URL — where a malformed entry could do nothing worse than produce
 *  a link to nowhere. It now supplies RENDERED TEXT and picks a badge
 *  colour, so a bad entry draws a wrong row rather than a dead one.
 *
 *  Each entry is validated on its own and a bad one is dropped alone: one
 *  malformed record must never discard the rest of a rower's plan history.
 *  Leniency covers ABSENCE of an entry, never a present-but-wrong value —
 *  the same posture `todayOverrides.ts`'s `parseOverrides` settled on. */
function parseLink(
  entry: unknown,
): { planIndex: number; link: PlanLink } | null {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    return null;
  }
  const e = entry as Record<string, unknown>;
  if (!Number.isInteger(e.planIndex) || (e.planIndex as number) < 0) {
    return null;
  }
  if (typeof e.id !== "string" || e.id.length === 0) return null;
  if (typeof e.workoutTitle !== "string") return null;
  if (typeof e.workoutType !== "string") return null;
  return {
    planIndex: e.planIndex as number,
    link: {
      id: e.id,
      workoutTitle: e.workoutTitle,
      workoutType: e.workoutType,
    },
  };
}

function parseLinks(body: unknown): Map<number, PlanLink> {
  if (typeof body !== "object" || body === null) return new Map();
  const links = (body as Record<string, unknown>).links;
  if (!Array.isArray(links)) return new Map();
  const parsed = new Map<number, PlanLink>();
  for (const entry of links) {
    const valid = parseLink(entry);
    if (valid !== null) parsed.set(valid.planIndex, valid.link);
  }
  return parsed;
}

export function usePlanLinks(planKey: PlanKey | null): Map<number, PlanLink> {
  const [links, setLinks] = useState<Map<number, PlanLink>>(() => new Map());

  useEffect(() => {
    // No active plan: no fetch, nothing to clear — the render-time
    // fallback to `EMPTY_LINKS` below handles this case entirely; any
    // `links` state left over from a PREVIOUS active plan is simply never
    // read while `planKey` is null (see the return statement).
    if (planKey === null) return;
    let cancelled = false;
    api(`/api/logs?plan=${planKey}`)
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        setLinks(parseLinks(await res.json()));
      })
      .catch(() => {
        // Swallowed — see this hook's own header comment: a failed fetch
        // here degrades to plain-text done rows, never a page error. A
        // body that is not JSON at all lands here too, via `res.json()`.
      });
    return () => {
      cancelled = true;
    };
  }, [planKey]);

  return planKey === null ? EMPTY_LINKS : links;
}
