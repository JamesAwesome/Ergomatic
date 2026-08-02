import { fmtDuration } from "../../domain/duration.js";
import { liveSteps } from "../../domain/expand.js";
import { isEffortRef, refLabel, resolveSplit } from "../../domain/pace.js";
import type { Baselines, Step } from "../../domain/types.js";
import type { EnginePhase } from "./engine";
import type { SessionRun } from "./run";

/** The two "log a session" doors (Phase 6C spec, "Doors" decision): a
 *  completed timer session (`buildLogSteps`, from the frozen `SessionRun`)
 *  and an off-app row logged after the fact from a workout's own authored
 *  steps (`buildManualLogSteps`, resolved fresh at CURRENT baselines — "that
 *  IS the lock moment for an off-app row," per the spec). Both are pure:
 *  no clock reads, no storage access, same input in -> same output out.
 *
 *  PINNED READING — work steps only (spec's own Design section: "walks
 *  `run.phases`: work phases -> {...}"; `docs/design/README.md` §7: "listing
 *  each work step"). Neither warm-up nor rest phases ever become a
 *  `LogStep`, and neither does an open-ended "test" phase (`type: "test"`,
 *  e.g. a 2k/6k test piece) — §7 never mentions one, and structurally a
 *  "test" `Phase` (`domain/expand.ts`'s `case "test"`) carries no
 *  `targetSplit`/`seconds`/`meters` at all, so there is nothing to build a
 *  `LogStep` out of even if it were included. This was verified against
 *  `domain/expand.ts` directly, not assumed from the brief's prose alone.
 *
 *  DEVIATION FROM THE TASK BRIEF'S OWN LABEL EXAMPLES (flagged per CLAUDE.md
 *  rule #10 — say so rather than silently working around it): the brief
 *  gives `buildLogSteps` the same label examples as the detail screen's
 *  ref-based idiom (`20:00 @ 6k +10`, `0:30 @ MAX`, via `refLabel`). That
 *  idiom needs the step's raw `PaceRef` (base+offset, or which effort word).
 *  `SessionRun.phases` is `EnginePhase[]` (`engine.ts`), which is `Phase`
 *  (`domain/expand.ts`) minus `originalStepIndex` plus `originalIndex` — it
 *  carries only the RESOLVED `targetSplit` (a number) and the frozen display
 *  `label` domain/expand.ts already computed (`toleranceRange(...).label`
 *  for a split ref, `effortWord(ref.effort)` for an effort ref). There is no
 *  `ref` field anywhere on it, and `buildLogSteps(run)` has no OTHER
 *  parameter to recover one from — `SessionRun` doesn't carry the workout's
 *  authored `Step[]`, only `workoutId`/`title`. Reconstructing "6k +10" from
 *  a resolved `targetSplit` number would also be genuinely lossy (many
 *  `(base, off)` pairs, plus any session nudge folded in by
 *  `effectiveSteps` before `buildRun` ever ran, can resolve to the same
 *  number) — exactly the kind of re-derivation the brief itself says not to
 *  do ("reuse refLabel/fmtDuration, don't re-derive"). So `buildLogSteps`
 *  composes each label as `${duration} @ ${phase.label}` — reusing the
 *  phase's OWN frozen display text verbatim, never recomputing it — which
 *  for an effort phase literally IS `effortWord`'s output already ("ALL
 *  OUT"/"EASY"), matching the spec's own (more precise) Design-section line
 *  for that case: "label carries the effort word" — not the brief's `MAX`
 *  chip. `buildManualLogSteps` below, by contrast, DOES receive the
 *  workout's real `Step[]` (with `ref`), so it reuses `refLabel` directly
 *  and matches the brief's literal examples exactly (see its own comment).
 *  Net effect: the two doors render an effort step's pace text differently
 *  ("ALL OUT" vs "MAX") — worth the Log screen task (not this one) knowing
 *  about, not a bug in either builder.
 *
 *  A SECOND, MORE SERIOUS CONTRADICTION (also flagged, not silently
 *  resolved): the spec's Design section says an effort phase's `targetSplit`
 *  is "omitted" from the `LogStep` entirely (the 5G rule — an effort's
 *  frozen number is an estimate, never a real prescription to hold), and
 *  this file implements that literally (`targetSplit`/`actualSplit`/
 *  `actualSource` are all optional below, all omitted together for an
 *  effort phase). But `server/stores/logs.ts`'s `LogStep` declares
 *  `targetSplit: number` and `actualSource: ActualSource` as REQUIRED
 *  (non-optional), and `server/routes/data.ts`'s `validateLogStepEntry`
 *  enforces that unconditionally — there is no branch that accepts a
 *  missing `targetSplit` or `actualSource` for any reason. Since the spec
 *  also says "Zero server changes" for this phase, a `LogStep` this module
 *  emits for an effort work step CANNOT be POSTed to `/api/logs` as-is; it
 *  will 400. This module's own `LogStep` type is therefore NOT identical to
 *  the server's — it's the honest, pure-domain shape the spec asks for.
 *  Whichever later task assembles the actual POST body (the Log screen) has
 *  to decide how to bridge the gap (e.g. filling a placeholder number back
 *  in for `targetSplit`/`actualSource` immediately before the request, the
 *  same way the estimate already exists on the frozen phase/resolved split
 *  even though this module never surfaces it). Flagging this now rather
 *  than guessing at that task's resolution and baking a silent workaround
 *  into a "pure" file that has no reason to know about the wire format. */

export type ActualSource = "assumed" | "stopwatch" | "pm5";

/** This module's own `LogStep` — see the module header's second flagged
 *  contradiction for exactly how (and why) this is NOT byte-identical to
 *  `server/stores/logs.ts`'s `LogStep`: `targetSplit` and `actualSource`
 *  are optional here (omitted together for an effort phase, per the 5G
 *  rule) where the server's shape requires both unconditionally. */
export interface LogStep {
  label: string;
  targetSplit?: number;
  actualSplit?: number;
  actualSource?: ActualSource;
  spm?: number;
  meters?: number;
  seconds?: number;
}

// Shared by both builders: the step-text idiom's duration half. A work
// phase/step always has EXACTLY ONE of seconds/meters (domain/expand.ts's
// "case w" sets one or the other, never both, never neither) — the `!`
// reflects that construction guarantee, not a runtime check performed here.
function durationText(phase: { seconds?: number; meters?: number }): string {
  return phase.seconds !== undefined
    ? fmtDuration(phase.seconds / 60)
    : `${phase.meters!} m`;
}

/** Builds the Log screen's step list from a completed session run. Walks
 *  `run.phases` in POSITION order (not `originalIndex`) because that's how
 *  `run.actuals` is keyed (`run.ts`'s own doc on `PhaseActual`) — a repeated
 *  distance step (4x2000m) produces multiple occurrences sharing one
 *  `originalIndex` but each needs its OWN actual lookup.
 *
 *  Per work phase (module header: wu/rest/test never produce one):
 *  - `label`: `${duration} @ ${phase.label}` — see the module header's first
 *    flagged deviation for why this reuses the phase's own frozen label
 *    rather than `refLabel` (no raw `ref` available on `EnginePhase`).
 *  - `targetSplit`: omitted for an effort phase (5G rule — the frozen number
 *    is `estimationSplit`'s guess, never a real prescription); present
 *    otherwise, straight from the phase (already resolved at `buildRun`
 *    time, frozen against later baseline edits).
 *  - `spm`/`seconds`/`meters`: copied straight through when the phase set
 *    them.
 *  - the actual, joined by phase position (module header's own "subtle
 *    rules", each pinned by a fixture in the test file):
 *      - effort phase -> neither `actualSplit` nor `actualSource` (no
 *        actual is ever attributed to an estimate that was never a target).
 *      - `run.actuals[i]` present -> it can only be a KEPT distance actual
 *        (the engine's `nextDistance` is the only place that ever writes to
 *        `actuals`, and it only runs on a phase with `meters`) -> passes
 *        through as `actualSplit: splitSeconds, actualSource: "stopwatch"`.
 *      - no `actuals[i]` entry, phase has `seconds` (a TIME phase) -> the
 *        engine NEVER records an actual for a time phase (only
 *        `nextDistance` writes one, and it's distance-only) — a completed
 *        time phase is read as "held the target": `actualSplit:
 *        targetSplit, actualSource: "assumed"`.
 *      - no `actuals[i]` entry, phase has `meters` (a DISTANCE phase) -> the
 *        rower's split was flagged suspect and DISCARDED
 *        (`Timer.tsx`'s `handleDiscardSplit` calls `advance`, not
 *        `nextDistance` — "Discard records NO actual") -> neither key at
 *        all. Absence here is deliberate, not a logged zero. */
export function buildLogSteps(run: SessionRun): LogStep[] {
  const out: LogStep[] = [];
  run.phases.forEach((phase: EnginePhase, i: number) => {
    if (phase.type !== "work") return;
    const isEffort = phase.targetKind === "effort";
    const step: LogStep = {
      label: `${durationText(phase)} @ ${phase.label}`,
    };
    if (!isEffort) {
      // Both branches of domain/expand.ts's "case w" set targetSplit for
      // every work phase; the `!` documents that guarantee.
      step.targetSplit = phase.targetSplit!;
    }
    if (phase.spm !== undefined) step.spm = phase.spm;
    if (phase.seconds !== undefined) step.seconds = phase.seconds;
    if (phase.meters !== undefined) step.meters = phase.meters;
    if (!isEffort) {
      const actual = run.actuals[i];
      if (actual !== undefined) {
        step.actualSplit = actual.splitSeconds;
        step.actualSource = "stopwatch";
      } else if (phase.seconds !== undefined) {
        step.actualSplit = phase.targetSplit!;
        step.actualSource = "assumed";
      }
      // else: a distance phase with no recorded actual is a discarded
      // suspect split — neither key, per the module header.
    }
    out.push(step);
  });
  return out;
}

/** Builds the manual ("Log it after") door's step list straight from a
 *  workout's authored steps, resolved at CURRENT baselines — the spec's own
 *  "that IS the lock moment for an off-app row." Unlike `buildLogSteps`,
 *  this DOES have the raw `Step[]` (with each work step's real `ref`), so it
 *  reuses `refLabel`/`isEffortRef`/`resolveSplit` directly, matching the
 *  detail screen's exact idiom (`StepRow.tsx`'s `left = `${duration} @
 *  ${refLabel(ref)}``) and the task brief's own literal examples
 *  (`0:30 @ MAX` is Microburst's real effort step, pinned in the test file).
 *
 *  `liveSteps` (not `phases()`) does the reps-block expansion: it returns
 *  the flat, repeats-expanded `Step[]` (one entry per physical repetition,
 *  reps marker's own slot dropped) with no need for `Baselines`/tolerance to
 *  do it — reusing the ONE place that decides reps-expansion rather than
 *  hand-rolling it again, the exact drift `engine.ts`'s own header comment
 *  documents as a past defect (originalIndex attribution used to be
 *  reimplemented independently and disagreed with `phases()` on a
 *  `restMinutes: 0` truthiness edge case).
 *
 *  ALL split-ref actuals are `"assumed"` (there is no run, no stopwatch, no
 *  discard concept for an off-app row — the spec's "ALL actuals 'assumed'"),
 *  using the SAME resolved number for both `targetSplit` and `actualSplit`
 *  (an off-app row is recorded as "held the target", identical to
 *  `buildLogSteps`'s completed-time-phase rule). Effort steps omit
 *  `targetSplit`/`actualSplit`/`actualSource` entirely, same 5G rule as
 *  `buildLogSteps` (module header's second flagged contradiction applies
 *  here too). */
export function buildManualLogSteps(
  workout: { steps: Step[] },
  baselines: Baselines,
): LogStep[] {
  const out: LogStep[] = [];
  for (const step of liveSteps(workout.steps)) {
    if (step.k !== "w") continue;
    const isEffort = isEffortRef(step.ref);
    const durationLabel =
      step.duration.kind === "time"
        ? fmtDuration(step.duration.minutes)
        : `${step.duration.meters} m`;
    const logStep: LogStep = {
      label: `${durationLabel} @ ${refLabel(step.ref)}`,
    };
    if (!isEffort) {
      const split = resolveSplit(baselines, step.ref);
      logStep.targetSplit = split;
      logStep.actualSplit = split;
      logStep.actualSource = "assumed";
    }
    if (step.spm !== undefined) logStep.spm = step.spm;
    if (step.duration.kind === "time") {
      logStep.seconds = step.duration.minutes * 60;
    } else {
      logStep.meters = step.duration.meters;
    }
    out.push(logStep);
  }
  return out;
}

// Mirrors Today.tsx's own (private, unexported) `formatLogDate` byte for
// byte — the house day format `docs/design/README.md`:185 established
// ("JUL 25"). NOT imported from Today.tsx: that file is a screen component
// (react-router-dom, hooks, JSX) and this module is a pure, framework-free
// session builder with no other reason to depend on a screen — pulling in
// Today.tsx's whole import chain to reuse six lines would be backwards
// (screens depend on session/, not the other way around) and this task is
// explicitly scoped pure/no-e2e, so touching `src/today/Today.tsx` to
// export the helper is out of scope here too. A future DRY pass could hoist
// this into `domain/format.js` now that there are two call sites — flagged,
// not fixed, in this task's report.
const MONTH_ABBREV = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

function formatLogDate(iso: string): string {
  const d = new Date(iso);
  return `${MONTH_ABBREV[d.getMonth()]} ${d.getDate()}`;
}

/** The Log screen's header line: `JUL 27 · 50 MIN`. `dateLabel` reads
 *  `completedAt` (falling back to `startedAt` only if somehow null — this
 *  function takes no `now` and must stay pure, so there is no clock to fall
 *  back on). `totalMinutes` is the session's REAL wall-clock length
 *  (`completedAt - startedAt`, floored at 0, rounded to the nearest minute)
 *  — the same quantity `SessionComplete.tsx`'s own `totalElapsedSeconds`
 *  computes for its TOTAL, recomputed independently here rather than
 *  imported (same reasoning as `formatLogDate` above: that's a screen
 *  file's export, and this module has no reason to pull in its import
 *  chain) rather than the domain's *estimated* length — the Log screen is
 *  recording what actually happened, and showing a different total here
 *  than the one the rower just saw on the Complete screen moments earlier
 *  would read as a discrepancy, not two honestly-different numbers. */
export function logTotals(run: SessionRun): {
  dateLabel: string;
  totalMinutes: number;
} {
  const completedAt = run.completedAt;
  const totalMinutes =
    completedAt === null
      ? 0
      : Math.round(
          Math.max(
            0,
            new Date(completedAt).getTime() - new Date(run.startedAt).getTime(),
          ) / 60000,
        );
  return {
    dateLabel: formatLogDate(completedAt ?? run.startedAt),
    totalMinutes,
  };
}
