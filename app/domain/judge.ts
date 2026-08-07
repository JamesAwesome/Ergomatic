/** Actual-vs-target judgement for the connected panes' live comparison
 *  (Phase 7B Task 3: presentational extraction + this one domain helper —
 *  Tasks 6/7 are the actual consumers, wiring a real PM5 `MonitorFrame`
 *  through this function; nothing in `src/` calls it yet).
 *
 *  This is NOT `toleranceRange()` come back. That function — along with its
 *  whole client-side reading chain (`domain/expand.ts`'s `phases()` own
 *  inert `_tol` parameter, `buildRun()`'s `tol` parameter, `Countdown.tsx`'s
 *  `readPaceTolerance`, and `tokens.css`'s unwritten `--pace-tolerance`
 *  token) — was DELETED outright (`docs/design/DEVIATIONS.md` row 53, fix
 *  round 2): a repo-wide search found no reader of its `.lo`/`.hi` band
 *  anywhere, past or present, and every display surface that used to show
 *  the band moved to the single exact resolved split instead. That row is
 *  history now, not a design this file revives.
 *
 *  `PACE_TOLERANCE_SECONDS`/`SPM_TOLERANCE` below are a fresh, unrelated
 *  pair of constants for a fresh purpose: judging a LIVE actual against its
 *  target once a PM5 is actually feeding one, not labelling a target's own
 *  display. They are also NOT the server's persisted
 *  `preferences.pace_tolerance_seconds` column (`docs/design/DEVIATIONS.md`
 *  row 54) — that field is real and round-trips through `PUT /api/prefs`,
 *  but is read by nothing client-side today. The backlog item that turns it
 *  into a live setting this function reads instead of a hardcoded constant
 *  is Phase 9's own ("Pace tolerance (0-3s) and accent color as real
 *  settings") — not this task's. Hardcoding here is deliberate scoping, not
 *  a placeholder left by oversight. */
export const PACE_TOLERANCE_SECONDS = 2;
export const SPM_TOLERANCE = 2;

export type Judgement = "under" | "within" | "over" | "stale";

/** The two judged kinds' tolerance, or `null` for a kind this task doesn't
 *  judge yet. `"hr"`/`"meters"` are in the `kind` union below because
 *  `domain/monitor/types.ts`'s `MonitorFrame` already carries
 *  `heartRateBpm`/`distanceMeters` alongside `spm`/`currentSplit` — the
 *  same seam Tasks 6/7 will read all four off of — but no tolerance
 *  constant for either is pinned by this task's brief (only
 *  `PACE_TOLERANCE_SECONDS`/`SPM_TOLERANCE` are "the constants"). Rather
 *  than invent an unreviewed threshold for heart rate or distance
 *  progress, both fall through to `null` here, which `judgeActual` reads
 *  as "not judged" — the identical "within" verdict a null actual/target
 *  already gets, for the identical reason. */
function toleranceFor(kind: "pace" | "spm" | "hr" | "meters"): number | null {
  switch (kind) {
    case "pace":
      return PACE_TOLERANCE_SECONDS;
    case "spm":
      return SPM_TOLERANCE;
    case "hr":
    case "meters":
      return null;
  }
}

/** Judges a single live actual against its target. Precedence, in order:
 *
 *  1. `stale` overrides everything — a reading the driver itself has
 *     flagged as no-longer-fresh is never "within," "under," or "over" no
 *     matter how close `actual`/`target` are, even if one or both are
 *     `null`.
 *  2. A `null` `actual` OR a `null` `target` reads `"within"` — there is
 *     nothing to judge (no live reading yet, or this phase kind carries no
 *     numeric target at all — an effort/warmup/rest/test phase), and
 *     "within" is the neutral, un-alarming default rather than a fabricated
 *     verdict.
 *  3. `"hr"`/`"meters"` read `"within"` unconditionally (see `toleranceFor`
 *     above) — not judged by this task.
 *  4. Otherwise, `|actual - target| <= tolerance` is `"within"` (the
 *     boundary itself is not a deviation, the same "boundary itself is not
 *     suspect" convention `src/session/Timer.tsx`'s own `isSuspectActual`
 *     uses); past it, `"under"` if `actual` is below `target`, `"over"` if
 *     above. */
export function judgeActual(args: {
  kind: "pace" | "spm" | "hr" | "meters";
  actual: number | null;
  target: number | null;
  stale: boolean;
}): Judgement {
  const { kind, actual, target, stale } = args;
  if (stale) return "stale";
  if (actual === null || target === null) return "within";
  const tolerance = toleranceFor(kind);
  if (tolerance === null) return "within";
  const diff = actual - target;
  if (Math.abs(diff) <= tolerance) return "within";
  return diff < 0 ? "under" : "over";
}
