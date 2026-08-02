import { phases, phaseSeconds, type Phase } from "../../domain/expand.js";
import type { Baselines } from "../../domain/types.js";
import { effectiveSteps, type SessionDraft } from "./draft";
import type { PhaseActual, SessionRun } from "./run";

/** A frozen phase inside a `SessionRun`: the domain's `Phase` (target split,
 *  spm, label, set), minus its own `originalStepIndex` (an index into the
 *  EFFECTIVE steps array `phases()` was called with — an implementation
 *  detail of that call, not meaningful to anything outside `buildRun`),
 *  plus `originalIndex` — the position in the DRAFT's `steps` array (see
 *  draft.ts's module header) this phase was expanded from. A "reps" block's
 *  repeated phases all carry the SAME originalIndex (they came from one
 *  authored step); a work step's auto-inserted rest phase also shares its
 *  work phase's originalIndex (one authored step produced both). 6C's
 *  per-step actuals attribution is keyed off this, not off position in
 *  `phases` (which is per-OCCURRENCE, not per-authored-step — see
 *  `nextDistance`/`actuals` below). */
export interface EnginePhase extends Omit<Phase, "originalStepIndex"> {
  originalIndex: number;
}

/** Builds a fresh `SessionRun` from a confirmed draft. Freezes phases from
 *  the draft's EFFECTIVE steps — `effectiveSteps` folds `spmOverrides` and
 *  nudges into each work step's `ref.off`/`spm` (see draft.ts's own header
 *  comment on why that's the same math as a "real" nudge) — so the run's
 *  targets match exactly what Confirm displayed, not the raw authored
 *  steps. `baselines`/`tol` resolve every split ONCE, here; the frozen
 *  `targetSplit`/`label` never change even if the rower's baselines change
 *  mid-run. Pure given `now`: two calls with identical arguments produce
 *  deep-equal records (byte-stable), since nothing here reads the clock or
 *  storage.
 *
 *  `originalIndex` attribution is a lookup, not a reimplementation:
 *  `phases()` itself stamps every `Phase` with `originalStepIndex` — the
 *  index into the array PASSED to it, i.e. `effective`'s own position
 *  scheme — so this just resolves that back through `effective`'s
 *  `{step, originalIndex}` pairs to the TRUE draft index. Before Phase 6B's
 *  Task 1 review, this module reimplemented `phases()`'s reps-expansion
 *  independently to derive the same mapping, and the two copies drifted on
 *  the exact truthiness-vs-`!== undefined` distinction of `restMinutes: 0`
 *  (F1) — moving the one algorithm that decides phase count into
 *  `domain/expand.ts` itself makes that class of drift structurally
 *  impossible, since there is only one place left to get it wrong.
 *
 *  `workoutId`/`title` (whole-branch review, F3a) are stamped straight from
 *  `draft` — the run's own copy, not a live reference back to it — so any
 *  screen that only has the run record (Today's resume card, F2) can name
 *  the session without also touching `SessionDraft`. */
export function buildRun(
  draft: SessionDraft,
  baselines: Baselines,
  tol: number,
  now: Date,
): SessionRun {
  const effective = effectiveSteps(draft);
  const rawSteps = effective.map((e) => e.step);
  const enginePhases: EnginePhase[] = phases(rawSteps, baselines, tol).map(
    (phase) => {
      const { originalStepIndex, ...rest } = phase;
      return {
        ...rest,
        originalIndex: effective[originalStepIndex]!.originalIndex,
      };
    },
  );
  const nowIso = now.toISOString();
  return {
    v: 1,
    workoutId: draft.workoutId,
    title: draft.title,
    phases: enginePhases,
    index: 0,
    phaseStartedAt: nowIso,
    pausedAt: null,
    pausedTotalMs: 0,
    actuals: {},
    startedAt: nowIso,
    completedAt: null,
  };
}

/** Milliseconds elapsed in the CURRENT phase (`run.index`), pause-adjusted:
 *  while paused, `pausedAt` — not `now` — is the clock's right edge, which
 *  is what makes elapsed FREEZE across however much wall time passes before
 *  `resume` is called. `pausedTotalMs` (folded in by `resume`) subtracts
 *  every earlier pause within this same phase. Never negative — a `now`
 *  earlier than `phaseStartedAt` (shouldn't happen, but a defensive floor
 *  costs nothing) reads as zero elapsed rather than a negative duration. */
function phaseElapsedMs(run: SessionRun, now: Date): number {
  const startMs = new Date(run.phaseStartedAt).getTime();
  const endMs =
    run.pausedAt !== null ? new Date(run.pausedAt).getTime() : now.getTime();
  return Math.max(0, endMs - startMs - run.pausedTotalMs);
}

/** Seconds elapsed in the current phase. Used directly as a distance
 *  phase's count-up stopwatch display, AND as the shared building block
 *  `remainingSeconds`/`totalRemainingSeconds` subtract from a phase's full
 *  duration/estimate — the "totals" half of this function's job. */
export function elapsedSeconds(run: SessionRun, now: Date): number {
  return Math.floor(phaseElapsedMs(run, now) / 1000);
}

/** Seconds remaining in the current TIME phase (0 past the last phase, or
 *  when the current phase has no fixed `seconds` — a distance or "test"
 *  phase counts up, it has nothing to count down from). Never negative. */
export function remainingSeconds(run: SessionRun, now: Date): number {
  const phase = run.phases[run.index];
  if (phase === undefined || phase.seconds === undefined) return 0;
  return Math.max(0, phase.seconds - elapsedSeconds(run, now));
}

/** The catch-up walk: consumes whole phase durations starting from
 *  `phaseStartedAt`, seeding each next phase's start at the PREVIOUS
 *  phase's boundary — never `now` — so a phase reached mid-walk shows
 *  correct (not full) remaining time. Halts at any phase with no fixed
 *  `seconds` (distance, and open-ended "test" phases) — those can't
 *  auto-advance, the rower presses NEXT — leaving the stopwatch baseline at
 *  the walk's arrival boundary. Completing the last time phase during a
 *  walk sets `completedAt` to the TRUE finish boundary, not `now` — the
 *  same "seed at the boundary, not now" rule this function applies to
 *  every other phase transition, applied to completion too. A no-op
 *  (returns the SAME `run` reference) when paused, already complete, or
 *  nothing has elapsed enough to advance. */
export function tick(run: SessionRun, now: Date): SessionRun {
  if (run.completedAt !== null || run.pausedAt !== null) return run;
  const nowMs = now.getTime();
  let index = run.index;
  // The wall-clock instant at which the CURRENT phase's countdown reaches
  // zero elapsed: phaseStartedAt shifted forward by however much pause time
  // has already been folded in for this phase.
  let boundaryMs = new Date(run.phaseStartedAt).getTime() + run.pausedTotalMs;
  let advanced = false;

  while (index < run.phases.length) {
    const phase = run.phases[index]!;
    if (phase.seconds === undefined) break;
    if (nowMs - boundaryMs < phase.seconds * 1000) break;
    boundaryMs += phase.seconds * 1000;
    index += 1;
    advanced = true;
  }

  if (!advanced) return run;

  const seededStart = new Date(boundaryMs).toISOString();
  if (index >= run.phases.length) {
    // `completedAt` is the true boundary the last phase FINISHED at
    // (`seededStart`/`boundaryMs`), not `now` — the whole point of the
    // catch-up walk is that `now` can be arbitrarily later than the
    // workout's real end (Phase 6B Task 1 review, F2: a phone waking at
    // 13:00 from a workout that actually finished at 12:02 must log 12:02,
    // not the wake time).
    return {
      ...run,
      index,
      phaseStartedAt: seededStart,
      pausedAt: null,
      pausedTotalMs: 0,
      completedAt: seededStart,
    };
  }
  return {
    ...run,
    index,
    phaseStartedAt: seededStart,
    pausedAt: null,
    pausedTotalMs: 0,
  };
}

/** Pauses the run at `now`. Idempotent: pausing an already-paused run is a
 *  no-op (returns the same reference) rather than overwriting `pausedAt`,
 *  which would otherwise silently shrink the elapsed time already frozen. */
export function pause(run: SessionRun, now: Date): SessionRun {
  if (run.pausedAt !== null) return run;
  return { ...run, pausedAt: now.toISOString() };
}

/** Resumes a paused run at `now`, folding the just-finished pause into
 *  `pausedTotalMs` (see `phaseElapsedMs`: that's what keeps elapsed
 *  identical to what it read the instant `pause` was called, no matter how
 *  long the pause lasted). No-op on a run that isn't paused. */
export function resume(run: SessionRun, now: Date): SessionRun {
  if (run.pausedAt === null) return run;
  const pausedMs = now.getTime() - new Date(run.pausedAt).getTime();
  return {
    ...run,
    pausedAt: null,
    pausedTotalMs: run.pausedTotalMs + Math.max(0, pausedMs),
  };
}

/** Skips to the next phase, re-seeding its start at `now` (fresh clock,
 *  pause state cleared). Skipping past the last phase completes the run,
 *  same as the catch-up walk reaching the end. No-op once already
 *  complete — see the module-level note on completion above `isComplete`
 *  for why that's a deliberate one-way door, not an oversight. */
export function advance(run: SessionRun, now: Date): SessionRun {
  if (run.completedAt !== null) return run;
  const nowIso = now.toISOString();
  const nextIndex = run.index + 1;
  if (nextIndex >= run.phases.length) {
    return {
      ...run,
      index: run.phases.length,
      phaseStartedAt: nowIso,
      pausedAt: null,
      pausedTotalMs: 0,
      completedAt: nowIso,
    };
  }
  return {
    ...run,
    index: nextIndex,
    phaseStartedAt: nowIso,
    pausedAt: null,
    pausedTotalMs: 0,
  };
}

/** Steps back to the previous phase, re-seeding its start at `now`. Clamped
 *  at phase 0 — rewinding the first phase restarts its clock rather than
 *  underflowing the index. No-op once complete (mirrors `advance`). */
export function rewind(run: SessionRun, now: Date): SessionRun {
  if (run.completedAt !== null) return run;
  return {
    ...run,
    index: Math.max(0, run.index - 1),
    phaseStartedAt: now.toISOString(),
    pausedAt: null,
    pausedTotalMs: 0,
  };
}

/** Records the current distance phase's actual (elapsed seconds and the
 *  average split they imply — `(elapsedSeconds / meters) * 500`, per the
 *  handoff's NEXT contract), keyed by the phase's POSITION in `run.phases`
 *  — not `originalIndex` — because a repeated distance step (e.g. 4×2000m)
 *  produces multiple occurrences sharing one originalIndex, and each needs
 *  its own actual. No-op (returns `run` unchanged) if the current phase
 *  isn't a distance phase (no `meters`) — NEXT only exists on the distance
 *  screen, but a caller misusing this off-screen shouldn't corrupt state.
 *  Then advances exactly like `advance` (skip + re-seed) — including
 *  clearing any pause. DELIBERATE (Phase 6B Task 1 review, F4): NEXT is an
 *  active, physical button press, same as ◀/▶ — a rower who presses it
 *  while paused is choosing to move on, not asking to stay paused, so
 *  implicitly resuming is the same "manual navigation clears pause state"
 *  rule `advance`/`rewind` already apply, not a special case. */
export function nextDistance(run: SessionRun, now: Date): SessionRun {
  const meters = run.phases[run.index]?.meters;
  if (meters === undefined) return run;
  const elapsed = elapsedSeconds(run, now);
  // Hand-pinned: entered at t=0, NEXT at t=452s on a 2000m phase ->
  // splitSeconds = (452 / 2000) * 500 = 113.0 exactly.
  const splitSeconds = (elapsed / meters) * 500;
  const actual: PhaseActual = {
    elapsedSeconds: elapsed,
    splitSeconds,
    actualSource: "stopwatch",
  };
  return advance(
    { ...run, actuals: { ...run.actuals, [run.index]: actual } },
    now,
  );
}

/** Past the last phase — the state `advance`/`tick` leave a finished run
 *  in.
 *
 *  Completion is a DELIBERATE one-way door (Phase 6B Task 1 review, F3):
 *  every mutator above (`tick`/`pause`/`resume`/`advance`/`rewind`/
 *  `nextDistance`) no-ops once `completedAt` is set, and nothing in this
 *  module ever clears it. An accidental ▶ on the last phase therefore ends
 *  the session with no engine-level undo. This is judged acceptable for
 *  6B because the spec already gives the rower a deliberate, separate
 *  abandon path (`END →`'s staged confirm) and reaching the true last
 *  phase's ▶ is itself a deliberate act, not an ambient one a stray tap
 *  invites mid-workout. Task 3's UI is responsible for keeping it that way
 *  (e.g. treating the final phase's advance control as "finish," not just
 *  another skip) rather than relying on the engine to reopen a finished
 *  run. If a genuine "un-finish" need ever surfaces, it should be a new,
 *  explicit function — not a side effect folded into `rewind`. */
export function isComplete(run: SessionRun): boolean {
  return run.index >= run.phases.length;
}

/** TOTAL LEFT: remaining seconds in the current phase plus the FULL
 *  duration of every phase after it. A time phase's full duration is its
 *  `seconds`; a distance phase has none — `domain/expand.ts`'s
 *  `phaseSeconds` prices it from the frozen `targetSplit` (`(meters / 500)
 *  * targetSplit`) at second (not rounded-minute) granularity, since this
 *  ticks every render. That helper is shared with `estimateMinutes` rather
 *  than duplicated here (Phase 6B Task 1 review: a duplicated copy of this
 *  same formula in this file was flagged as the same lockstep risk
 *  `buildRun`'s `originalIndex` lookup exists to prevent — see its own
 *  comment). This module still doesn't call `estimateMinutes` ITSELF: that
 *  function resolves splits from `Step[]` + live `Baselines`, but a run's
 *  targets are frozen at `buildRun` time (this module's own contract) —
 *  recomputing from current baselines here would let a baselines edit
 *  mid-run silently change TOTAL LEFT for an already-started session,
 *  which the frozen-phases design exists specifically to prevent. An
 *  open-ended "test" phase (no `seconds`, no `meters`) contributes nothing
 *  — `phaseSeconds` returns `null`, nothing to add. */
export function totalRemainingSeconds(run: SessionRun, now: Date): number {
  let total = 0;
  for (let i = run.index; i < run.phases.length; i++) {
    const phase = run.phases[i]!;
    const full = phaseSeconds(phase);
    if (full === null) continue;
    total +=
      i === run.index ? Math.max(0, full - elapsedSeconds(run, now)) : full;
  }
  return total;
}
