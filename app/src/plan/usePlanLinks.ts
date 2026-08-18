import { useEffect, useState } from "react";
import { api } from "../api";
import type { PlanKey } from "../api/usePlan";

/** One `{planIndex, id}` pair per linked done row — `GET /api/logs?plan=
 *  <key>`'s own response shape (spec §3, newest-wins per index via
 *  `stores/logs.ts`'s `listPlanLinks`). Declared locally rather than
 *  imported from the server (same `src/`-independent-of-`server/`
 *  convention `useRecentLogs.ts`'s own header states for `RecentLog`). */
interface PlanLink {
  planIndex: number;
  id: string;
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
const EMPTY_LINKS: Map<number, string> = new Map();

export function usePlanLinks(planKey: PlanKey | null): Map<number, string> {
  const [links, setLinks] = useState<Map<number, string>>(() => new Map());

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
        const body = (await res.json()) as { links: PlanLink[] };
        setLinks(new Map(body.links.map((link) => [link.planIndex, link.id])));
      })
      .catch(() => {
        // Swallowed — see this hook's own header comment: a failed fetch
        // here degrades to plain-text done rows, never a page error.
      });
    return () => {
      cancelled = true;
    };
  }, [planKey]);

  return planKey === null ? EMPTY_LINKS : links;
}
