/** Actual-vs-target judgement for the connected panes' live comparison
 *  (Phase 7B Task 3: presentational extraction + this one domain helper).
 *  ONE caller in `src/`, deliberately and permanently:
 *  `src/workout/connected/surfaceModel.ts`'s `judgedValue`, which every
 *  judged cell on every pane is built by (handoff §3: "One helper decides
 *  the colour; no pane implements its own judgement"). A second caller
 *  appearing in `src/` is the drift this arrangement exists to prevent.
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

export type Judgement = "slower" | "within" | "faster" | "stale";

/** The two judged kinds' tolerance, or `null` for a kind this task doesn't
 *  judge yet. `"hr"`/`"meters"` are in the `kind` union below because
 *  `domain/monitor/types.ts`'s `MonitorFrame` already carries
 *  `heartRateBpm`/`distanceMeters` alongside `spm`/`currentSplit` — the
 *  same seam the connected panes read all four off of — but no tolerance
 *  constant for either is pinned by this task's brief (only
 *  `PACE_TOLERANCE_SECONDS`/`SPM_TOLERANCE` are "the constants"). Task-3
 *  review, Adjudication 1: this is the only honest answer today, not a
 *  shortcut — no HR field exists anywhere in the domain (`Step`,
 *  `Baselines`, preferences all checked; `MonitorCapabilities`'s own
 *  comment confirms this is deliberate: "heart rate is NOT here"), so
 *  there is no programmed HR target for a real threshold to compare
 *  against in the first place.
 *
 *  TRIPWIRE (task-3 review, Adjudication 1): the `null`-target branch in
 *  `judgeActual` already covers today's actual real-world case (no HR/
 *  meters target ever exists); THIS branch only fires if a future caller
 *  passes a non-`null` HR/meters target. If some later phase adds a real
 *  HR-zone (or a real meters) target without ALSO updating this switch,
 *  the result is a silent, always-`"within"` verdict no matter how far
 *  off the live reading is — update this function deliberately the same
 *  change that introduces such a target, don't assume the existing
 *  null-target tests already prove tomorrow's case too. */
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
 *     flagged as no-longer-fresh is never "within," "under," or "faster" no
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
 *     uses); past it, `"slower"` or `"faster"` — see the direction rule below,
 *     which is NOT the same for both judged kinds.
 *
 *  **`"faster"`/`"slower"` MEAN WHAT THEY SAY — faster or slower than the
 *  target, from the ROWER's point of view, never above/below the numeral.**
 *  `1:57.8` against a `TARGET 2:00.0` is `"faster"`.
 *
 *  | State | The rower is | pace (s/500m) | spm |
 *  |---|---|---|---|
 *  | `"faster"` | ahead of target, working harder | a SMALLER number | a LARGER number |
 *  | `"slower"` | behind target, working easier | a LARGER number | a SMALLER number |
 *
 *  THESE WERE `"over"`/`"under"` until 2026-08-13 (James: "I've been using
 *  'under' to mean 'faster' and you just did the opposite"). They meant
 *  over/under the EFFORT asked, so `"over"` was the FASTER split — a
 *  defensible rule that is unguessable and the exact inverse of how a rower
 *  says it. Two more reasons the words had to go: the same pair already
 *  means something else in this codebase (`api/useRecentLogs.ts`'s
 *  `HeldResult`, the log screen's own held/under/over self-report — which
 *  this rename deliberately did NOT touch), and 7B Task 6 had already spent
 *  a fix round correcting a direction bug under the old names.
 *  `"faster"`/`"slower"` cannot be read backwards.
 *
 *  For `"spm"` that is the plain numeric reading: a higher rate is more
 *  effort. For `"pace"` it is the INVERSE, because a split is
 *  seconds-per-500m — a SMALLER number is a faster boat. Judging pace
 *  numerically painted every rower who was beating their target in the
 *  "you are behind" colour, and every rower falling behind in the "you are
 *  ahead" one; caught by the first `pnpm screenshots` run of the connected
 *  panes, which is the only place the two colours had ever been rendered
 *  against a real target.
 *
 *  This lives HERE, in the one helper, rather than in the pane that
 *  noticed — the whole point of `judgeActual` is that no consumer forms its
 *  own opinion about a direction. */
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
  // A smaller split is FASTER; a smaller rate is SLOWER.
  const fasterThanTarget = kind === "pace" ? diff < 0 : diff > 0;
  return fasterThanTarget ? "faster" : "slower";
}
