import { fmtDuration } from "../../domain/duration.js";
import { liveSteps } from "../../domain/expand.js";
import {
  effortFromWord,
  isEffortRef,
  refLabel,
  resolveSplit,
} from "../../domain/pace.js";
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
 *  LABEL IDIOM (Task 1 F1 review, James's resolution): a step's LABEL is
 *  its identity and must match every other step-text surface — the chip
 *  idiom (`refLabel`'s "MAX"/"MIN"), not a target-display word. `EnginePhase`
 *  carries no raw `PaceRef` (see the next paragraph for the split-ref case,
 *  which genuinely can't reach the chip), but an EFFORT phase doesn't need
 *  one: `domain/expand.ts` sets its frozen `label` to `effortWord(ref.effort)`
 *  ("ALL OUT"/"EASY"), and `domain/pace.ts`'s `effortFromWord` is that
 *  function's exact inverse — bijective over the two-element `Effort` type,
 *  so recovering the ref and re-deriving the chip via `refLabel({effort:
 *  effortFromWord(phase.label)})` is a lookup, not a guess (unlike the
 *  split-ref case below, which has no such inverse: a resolved split number
 *  doesn't uniquely determine which `(base, off)` pair produced it). Before
 *  this fix, `buildLogSteps` rendered an effort step as "0:30 @ ALL OUT"
 *  while `buildManualLogSteps` rendered the SAME workout's SAME step as
 *  "0:30 @ MAX" — the same session, logged through either door, disagreeing
 *  with itself in history. Pinned by a same-workout, both-doors equality
 *  test (Microburst) in the test file.
 *
 *  The split-ref case remains a genuine, unresolved asymmetry (not part of
 *  the F1 fix — `effortWord`'s bijection has no split-ref equivalent):
 *  `buildLogSteps` composes a split-ref work phase's label as `${duration} @
 *  ${phase.label}`, reusing the RESOLVED split range/value domain/expand.ts
 *  already computed (`toleranceRange(...).label`, e.g. "2:16.0"), because
 *  `SessionRun` carries no authored `Step[]` to recover a `PaceRef` from at
 *  all, and reconstructing "6k +10" from a resolved number would be
 *  genuinely lossy (many `(base, off)` pairs, plus any session nudge, can
 *  resolve to the same split) — the exact re-derivation the original task
 *  brief said not to do. `buildManualLogSteps` DOES have the real `Step[]`
 *  (with `ref`), so its split-ref labels use `refLabel` directly (`6k +10`,
 *  matching the detail screen's own idiom, `StepRow.tsx`'s `left = `${duration}
 *  @ ${refLabel(ref)}``). So the two doors' split-ref labels still differ
 *  ("2:16.0" vs "6k +16") even after this fix — only the effort case was
 *  unifiable, and F1 only asked for the effort case (verified live against
 *  Microburst).
 *
 *  SERVER CONTRACT (Task 1.5 amendment, 2026-08-02 — supersedes what this
 *  paragraph used to say): `server/stores/logs.ts`'s `LogStep` and
 *  `server/routes/data.ts`'s `validateLogStepEntry` were amended the same
 *  day this module shipped, specifically because this module proved the old
 *  validation predated effort refs. `targetSplit` is now OPTIONAL there too
 *  (previously required unconditionally), and `actualSplit`/`actualSource`
 *  are now a PAIRED unit — both present or both absent, enforced by the
 *  route, never one without the other. This module's own `LogStep` below
 *  was ALREADY shaped this way (the 5G rule, implemented here before the
 *  server caught up) — the two are now the same shape, not two different
 *  ones needing a bridge at POST time. An effort work step's `LogStep` from
 *  either builder here posts to `/api/logs` cleanly. */

export type ActualSource = "assumed" | "stopwatch" | "pm5";

/** This module's own `LogStep` — now the SAME shape as `server/stores/
 *  logs.ts`'s `LogStep` (Task 1.5 amendment, module header): `targetSplit`
 *  optional, `actualSplit`/`actualSource` a paired unit, both omitted
 *  together for an effort phase (5G rule). */
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
 *  - `label`: `${duration} @ ${pace}`, where `pace` is `refLabel({effort:
 *    effortFromWord(phase.label)})` for an effort phase (module header's
 *    LABEL IDIOM paragraph — matches `buildManualLogSteps`'s chip byte for
 *    byte) or the phase's own frozen `phase.label` (a resolved split/range)
 *    for a split-ref phase (no raw `ref` available on `EnginePhase` to do
 *    better — see the module header's split-ref paragraph).
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
    // Effort phases: recover the chip word ("MAX"/"MIN") from the frozen
    // display word via effortFromWord's inverse, so this door's label
    // matches buildManualLogSteps's for the same workout (module header's
    // LABEL IDIOM paragraph). The cast is safe: this branch only runs when
    // `targetKind === "effort"`, and domain/expand.ts's "case w" sets
    // `label` to exactly `effortWord(ref.effort)` in that case — never any
    // other string. Split-ref phases keep the phase's own resolved label
    // (no raw ref to do better with).
    const pace = isEffort
      ? refLabel({ effort: effortFromWord(phase.label as "ALL OUT" | "EASY") })
      : phase.label;
    const step: LogStep = {
      label: `${durationText(phase)} @ ${pace}`,
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
 *  `buildLogSteps` (module header's SERVER CONTRACT paragraph). */
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
