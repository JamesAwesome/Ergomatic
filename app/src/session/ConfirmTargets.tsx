import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useBaselines } from "../api/useBaselines";
import { fmtDuration } from "../../domain/duration.js";
import { fmtSplit } from "../../domain/format.js";
import {
  effortWord,
  isEffortRef,
  refLabel,
  resolveSplit,
} from "../../domain/pace.js";
import type { Baselines, Step } from "../../domain/types.js";
import { MIN_SPLIT, MAX_SPLIT } from "../you/baselineDraft";
import TypeBadge from "../components/TypeBadge";
import Stepper from "../builder/Stepper";
import {
  draftMinutes,
  loadDraft,
  saveDraft,
  startDraft,
  withNudge,
  type SessionDraft,
} from "./draft";

// The house 30s grid (docs/superpowers spec: "duration steppers (30 s grid
// on the stepper, the house rule)") for time-based durations (wu/r minutes
// and a "w" step's own time-kind duration) — mirrors REST_STEP_SECONDS'
// convention (builderState.ts) at the same 30s granularity, just applied to
// the step's own duration field instead of its rest field. Floor of 30s
// (not the domain's true 1s floor) keeps every press meaningful on a phone;
// the domain ceiling (180 min, validate.ts's `checkDuration`) is kept
// verbatim since there's no house reason to clip it tighter.
export const DURATION_STEP_SECONDS = 30;
export const DURATION_MIN_SECONDS = 30;
export const DURATION_MAX_SECONDS = 180 * 60;

// A distance work step's duration is meters, not seconds — the "30s grid"
// house rule has no unit to apply to, so this steps by the domain's own
// minimum distance granularity (validate.ts: `int(meters, 100, 42195)`)
// instead. Not specified by the brief; a deliberate, documented choice
// rather than a silent guess.
export const METERS_STEP = 100;
export const METERS_MIN = 100;
export const METERS_MAX = 42195;

// The confirm screen's own SPM range (brief: "SPM stepper 18-32"), distinct
// from StepEditor.tsx's authoring-time SPM_MIN/MAX (10..60) — the builder
// permits any legal spm while authoring a workout, but the pre-session
// confirm step is deliberately narrower: 18-32 is the whole physiological
// band the seeded library ever prescribes (verified against every work
// step across the generated 300-workout library, server/seed/library/).
export const SPM_MIN = 18;
export const SPM_MAX = 32;
export const SPM_WAKE = 20;

// "reps" step count bound (domain/types.ts: "1..12, at most one per
// workout"; validate.ts's `int(s.count, 1, 12)`).
export const REPS_MIN = 1;
export const REPS_MAX = 12;

// Pure helpers exported for direct testing, same pattern as
// ClockInput.tsx's digitsToClock/TabBar.tsx/auth.tsx.
// eslint-disable-next-line react-refresh/only-export-components
export function snapDurationSeconds(seconds: number): number {
  const clamped = Math.min(
    DURATION_MAX_SECONDS,
    Math.max(DURATION_MIN_SECONDS, seconds),
  );
  return Math.round(clamped / DURATION_STEP_SECONDS) * DURATION_STEP_SECONDS;
}

// eslint-disable-next-line react-refresh/only-export-components
export function clampMeters(meters: number): number {
  return Math.min(METERS_MAX, Math.max(METERS_MIN, meters));
}

// eslint-disable-next-line react-refresh/only-export-components
export function clampSpm(n: number): number {
  return Math.min(SPM_MAX, Math.max(SPM_MIN, n));
}

// eslint-disable-next-line react-refresh/only-export-components
export function clampReps(n: number): number {
  return Math.min(REPS_MAX, Math.max(REPS_MIN, n));
}

function withStepAt(d: SessionDraft, i: number, step: Step): SessionDraft {
  return { ...d, steps: d.steps.map((s, idx) => (idx === i ? step : s)) };
}

function kindLabel(step: Step): string {
  switch (step.k) {
    case "wu":
      return "WARM-UP";
    case "r":
      return "REST";
    case "w":
      return isEffortRef(step.ref)
        ? effortWord(step.ref.effort)
        : refLabel(step.ref);
    case "test":
      return "TEST";
    case "reps":
      return `REPEAT ×${step.count}`;
  }
}

export default function ConfirmTargets() {
  const baselinesState = useBaselines();
  const navigate = useNavigate();
  // Lazy initializer, same idiom as WorkoutDetail.tsx's nudge state and
  // Today.tsx's pickOverride: read the module's own storage once at mount.
  // The module (draft.ts) stays the sole reader/writer of localStorage —
  // this component only ever calls its exported functions.
  const [draft, setDraft] = useState<SessionDraft | null>(() => loadDraft());

  // Deep-link/reload rule (spec): no draft redirects to /today with no
  // ceremony.
  if (draft === null) {
    return <Navigate to="/today" replace />;
  }

  // A STARTED draft (startedAt non-null) means a session is already in
  // progress — this screen is re-enterable at this route via back-swipe
  // after START already navigated to /session/run, and re-rendering the
  // editable target list here would let a second START re-stamp
  // `startedAt` and silently restart the clock on whatever 6B's real timer
  // is doing. Redirect straight back to the in-progress session instead.
  // 6A has no "abandon this session" flow yet — that's 6B's to add.
  if (draft.startedAt !== null) {
    return <Navigate to="/session/run" replace />;
  }

  if (baselinesState.state === "loading") {
    return (
      <main className="screen">
        <h1 className="screen-title">Confirm</h1>
        <p className="mono-status">LOADING…</p>
      </main>
    );
  }

  if (baselinesState.state === "error") {
    return (
      <main className="screen">
        <h1 className="screen-title">Confirm</h1>
        <p className="mono-status">Couldn't load your baselines.</p>
        <button
          type="button"
          className="button-outline"
          onClick={baselinesState.retry}
        >
          Retry
        </button>
      </main>
    );
  }

  const baselines: Baselines | null =
    baselinesState.baselines.k2Seconds !== null &&
    baselinesState.baselines.k6Seconds !== null
      ? {
          k2Seconds: baselinesState.baselines.k2Seconds,
          k6Seconds: baselinesState.baselines.k6Seconds,
        }
      : null;

  // Every mutation here goes through this one committer: derive the next
  // draft from the previous one, persist it via the module's own
  // `saveDraft` (never touching localStorage directly), then reflect it in
  // state. `prev` can't actually be null past the guard above (this
  // component only renders `ConfirmTargets`'s own body once `draft` is
  // non-null), but the updater form still narrows defensively rather than
  // capturing the outer `draft` by closure.
  function commit(updater: (d: SessionDraft) => SessionDraft) {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      saveDraft(next);
      return next;
    });
  }

  function toggleRemoved(i: number) {
    commit((prev) => {
      const step = prev.steps[i];
      // Binding handoff from Task 1's review: removing the reps marker
      // silently halves (or worse) a repeated workout with no visible
      // cause, since liveSteps()/phases() only repeat the block that
      // follows a LIVE marker — striking it is indistinguishable, at a
      // glance, from any other removed row. Rather than trying to make
      // that consequence "unmissable" with more UI, the marker row simply
      // never grows a remove/restore control at all (see the render
      // below) — the rep stepper is the only way to change its effect, and
      // every press of it already moves the footer recount live. This
      // no-op is defense in depth for a caller that reaches this function
      // directly; the real guard is the missing button.
      if (step.k === "reps") return prev;
      const removed = prev.removed.includes(i)
        ? prev.removed.filter((x) => x !== i)
        : [...prev.removed, i].sort((a, b) => a - b);
      return { ...prev, removed };
    });
  }

  function stepDuration(i: number, deltaSeconds: number) {
    commit((prev) => {
      const step = prev.steps[i];
      if (step.k === "wu" || step.k === "r") {
        const seconds = snapDurationSeconds(
          Math.round(step.minutes * 60) + deltaSeconds,
        );
        return withStepAt(prev, i, { ...step, minutes: seconds / 60 });
      }
      if (step.k === "w" && step.duration.kind === "time") {
        const seconds = snapDurationSeconds(
          Math.round(step.duration.minutes * 60) + deltaSeconds,
        );
        return withStepAt(prev, i, {
          ...step,
          duration: { kind: "time", minutes: seconds / 60 },
        });
      }
      // Defensive, not reachable via the UI: the render below only ever
      // wires a DUR stepper's onDecrement/onIncrement to this function for
      // a wu/r/w-time row in the first place (a distance "w" row gets
      // stepMeters instead, and reps/test rows get no DUR stepper at all),
      // so `i` can only ever name one of the two kinds handled above.
      return prev;
    });
  }

  function stepMeters(i: number, deltaMeters: number) {
    commit((prev) => {
      const step = prev.steps[i];
      // Defensive, not reachable via the UI: only a distance "w" row's own
      // DUR stepper ever calls this.
      if (step.k !== "w" || step.duration.kind !== "distance") return prev;
      const meters = clampMeters(step.duration.meters + deltaMeters);
      return withStepAt(prev, i, {
        ...step,
        duration: { kind: "distance", meters },
      });
    });
  }

  function stepReps(i: number, delta: number) {
    commit((prev) => {
      const step = prev.steps[i];
      // Defensive, not reachable via the UI: only the reps marker's own
      // REPS stepper ever calls this.
      if (step.k !== "reps") return prev;
      return withStepAt(prev, i, {
        k: "reps",
        count: clampReps(step.count + delta),
      });
    });
  }

  function stepSpm(i: number, delta: number) {
    commit((prev) => {
      const step = prev.steps[i];
      // Defensive, not reachable via the UI: SPM only ever renders inside
      // the `step.k === "w"` branch below.
      if (step.k !== "w") return prev;
      const current = prev.spmOverrides[i] ?? clampSpm(step.spm ?? SPM_WAKE);
      return {
        ...prev,
        spmOverrides: { ...prev.spmOverrides, [i]: clampSpm(current + delta) },
      };
    });
  }

  // Mirrors WorkoutDetail.tsx's own handleNudge: clamps the RESOLVED split
  // (baseline + existing nudge + this delta) to the same 60-240 s/500m
  // range the baseline editor and the API enforce, then converts that back
  // into a delta so the actual mutation still goes through draft.ts's
  // `withNudge` (the module's own sanctioned mutator, which also refuses an
  // effort ref and a non-work index). Unclamped, a repeated nudge could push
  // a split negative, which the display formatter (fmtSplit) has no sane
  // rendering for.
  function handleNudge(i: number, delta: number) {
    commit((prev) => {
      const step = prev.steps[i];
      // The fallback (unclamped `withNudge`) branch is defensive, not
      // reachable via the UI: the render below only ever wires a nudge
      // button up when `baselines && !isEffortRef(step.ref)` already holds,
      // the exact negation of this condition (`step.k !== "w"` can't fire
      // either — the nudge buttons only exist inside the `step.k === "w"`
      // branch). Kept anyway, same "structural defense-in-depth" reasoning
      // as WorkoutDetail.tsx's own identical guard, in case a future nudge
      // path reaches this function some other way.
      if (step.k !== "w" || isEffortRef(step.ref) || !baselines) {
        return withNudge(prev, i, delta);
      }
      const current = prev.nudges[i] ?? 0;
      const base = resolveSplit(baselines, step.ref, 0);
      const resolved = base + current + delta;
      const clamped = Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, resolved));
      return withNudge(prev, i, clamped - base - current);
    });
  }

  function handleStart() {
    // Defensive re-check: `draft` is non-null past the guard above for
    // every render this closure is created in, but TS's control-flow
    // narrowing doesn't propagate a const's narrowed type into a nested
    // function body across closures, so this both satisfies the compiler
    // and guards a hypothetical future caller of this closure outside its
    // originating render. `baselines === null` is also re-checked here
    // (not just in the render below, which swaps the whole button out) —
    // belt-and-suspenders against a future caller of this closure that
    // doesn't go through the render's own conditional.
    if (draft === null || baselines === null) return;
    const started = startDraft(draft);
    saveDraft(started);
    // Phase 6B Task 2's own gap report: Countdown existed, routed, and
    // tested from the moment it shipped, but nothing sent a rower there —
    // this was still navigating straight to the (now-replaced) /session/run
    // placeholder. Task 3 is the file's natural owner (it already rewrites
    // /session/run's content) and is the one wiring this handoff.
    navigate("/session/countdown");
  }

  const minutes = draftMinutes(draft, baselines);
  const minutesLabel = minutes === null ? "— MIN" : `${minutes} MIN`;

  return (
    <main className="screen confirm-screen">
      <Link to="/today" className="back-link">
        ← BACK
      </Link>
      <div className="workout-detail-meta">
        <TypeBadge type={draft.type} />
      </div>
      <h1 className="screen-title">{draft.title}</h1>
      <div className="confirm-steps">
        {draft.steps.map((step, i) => (
          <ConfirmStepRow
            key={i}
            index={i}
            step={step}
            removed={draft.removed.includes(i)}
            spmOverride={step.k === "w" ? draft.spmOverrides[i] : undefined}
            nudge={draft.nudges[i] ?? 0}
            baselines={baselines}
            onToggleRemoved={() => toggleRemoved(i)}
            onDurationStep={(delta) => stepDuration(i, delta)}
            onMetersStep={(delta) => stepMeters(i, delta)}
            onRepsStep={(delta) => stepReps(i, delta)}
            onSpmStep={(delta) => stepSpm(i, delta)}
            onNudge={(delta) => handleNudge(i, delta)}
          />
        ))}
      </div>
      {/* Task 1 (ui-fix round): the small bottom-right START becomes a
          full-width L1 "Looks right, start" (56px) below the TOTAL line,
          matching Detail's and Builder's own L1 — `.confirm-footer` moved
          from a row (recount + button side by side) to a column so the
          button sits BELOW the recount rather than beside it. */}
      <footer className="confirm-footer">
        <span className="confirm-recount">{minutesLabel}</span>
        {baselines ? (
          <button type="button" className="button-l1" onClick={handleStart}>
            Looks right, start
          </button>
        ) : (
          // Controller decision (Phase 6B Task 2's own flagged gap):
          // `buildRun` requires a concrete `Baselines` — always, even for a
          // workout with no split-ref step, since it's a fixed 4-arg
          // contract, not a per-workout one. Rather than have Countdown
          // silently freeze a near-zero split for the one library/authored
          // workout that DOES have a split-ref step (the {0,0} dummy this
          // replaces), START is blocked here, at the one place a rower can
          // still act on it — the row-level "no target" idiom already
          // covers this per split-ref row (see step-row-no-target above);
          // this is that same idiom at the footer, covering the SESSION as
          // a whole rather than one row. Flagged for James: this blocks
          // START unconditionally when baselines are unset, even for a
          // workout with no split-ref work step at all (e.g. warm-up +
          // effort-only), which technically wouldn't need baselines to
          // resolve. Simplicity over precision, deliberately — see the
          // task-3 report.
          <span className="step-row-no-target">
            <em>no target</em> <Link to="/you">Set baselines</Link>
          </span>
        )}
      </footer>
    </main>
  );
}

function ConfirmStepRow({
  index,
  step,
  removed,
  spmOverride,
  nudge,
  baselines,
  onToggleRemoved,
  onDurationStep,
  onMetersStep,
  onRepsStep,
  onSpmStep,
  onNudge,
}: {
  index: number;
  step: Step;
  removed: boolean;
  spmOverride: number | undefined;
  nudge: number;
  baselines: Baselines | null;
  onToggleRemoved: () => void;
  onDurationStep: (delta: number) => void;
  onMetersStep: (delta: number) => void;
  onRepsStep: (delta: number) => void;
  onSpmStep: (delta: number) => void;
  onNudge: (delta: number) => void;
}) {
  const rowLabel = `Row ${index + 1}`;
  const isMarker = step.k === "reps";

  return (
    <div
      className={removed ? "step-editor confirm-step-removed" : "step-editor"}
    >
      <div className="step-editor-header">
        <span className="step-editor-header-label">
          {rowLabel.toUpperCase()} · {kindLabel(step)}
        </span>
        {/* Binding decision (see ConfirmTargets' toggleRemoved comment): the
            reps marker never gets a remove/restore control — the rep
            stepper below is the only sanctioned way to change its effect. */}
        {!isMarker && (
          <button
            type="button"
            className={
              removed ? "confirm-toggle-btn is-removed" : "confirm-toggle-btn"
            }
            aria-label={removed ? `Restore ${rowLabel}` : `Remove ${rowLabel}`}
            onClick={onToggleRemoved}
          >
            {removed ? "RESTORE" : "REMOVE"}
          </button>
        )}
      </div>

      {(step.k === "wu" || step.k === "r") && (
        <div className="step-editor-row">
          <span className="step-editor-row-label">DUR</span>
          <Stepper
            label={`${rowLabel} duration`}
            value={fmtDuration(step.minutes)}
            onDecrement={() => onDurationStep(-DURATION_STEP_SECONDS)}
            onIncrement={() => onDurationStep(DURATION_STEP_SECONDS)}
          />
        </div>
      )}

      {isMarker && (
        <div className="step-editor-row">
          <span className="step-editor-row-label">REPS</span>
          <Stepper
            label={`${rowLabel} reps`}
            value={String(step.count)}
            onDecrement={() => onRepsStep(-1)}
            onIncrement={() => onRepsStep(1)}
          />
        </div>
      )}

      {step.k === "w" && (
        <>
          <div className="step-editor-row">
            <span className="step-editor-row-label">DUR</span>
            {step.duration.kind === "time" ? (
              <Stepper
                label={`${rowLabel} duration`}
                value={fmtDuration(step.duration.minutes)}
                onDecrement={() => onDurationStep(-DURATION_STEP_SECONDS)}
                onIncrement={() => onDurationStep(DURATION_STEP_SECONDS)}
              />
            ) : (
              <Stepper
                label={`${rowLabel} duration`}
                value={`${step.duration.meters} M`}
                onDecrement={() => onMetersStep(-METERS_STEP)}
                onIncrement={() => onMetersStep(METERS_STEP)}
              />
            )}
          </div>
          <div className="step-editor-row">
            <span className="step-editor-row-label">SPM</span>
            <Stepper
              label={`${rowLabel} stroke rate`}
              value={String(spmOverride ?? clampSpm(step.spm ?? SPM_WAKE))}
              onDecrement={() => onSpmStep(-1)}
              onIncrement={() => onSpmStep(1)}
            />
          </div>
          <div className="step-editor-target">
            <span className="step-editor-target-label">TARGET</span>
            {isEffortRef(step.ref) ? (
              <span className="step-editor-target-value">
                {effortWord(step.ref.effort)}
              </span>
            ) : baselines ? (
              // Ui-fix round, Item 1: the exact resolved split — a
              // tolerance band never appears here any more, though
              // `toleranceRange()` itself is unchanged in the domain.
              <span className="step-editor-target-value">
                {fmtSplit(resolveSplit(baselines, step.ref, nudge))}
              </span>
            ) : (
              <span className="step-editor-target-value step-editor-no-target">
                <em>no target</em> <Link to="/you">Set baselines</Link>
              </span>
            )}
          </div>
          {baselines && !isEffortRef(step.ref) && (
            <div className="step-row-nudges">
              <button
                type="button"
                className="nudge-btn"
                aria-label={`${rowLabel} nudge faster`}
                onClick={() => onNudge(-1)}
              >
                ▲
              </button>
              <button
                type="button"
                className="nudge-btn"
                aria-label={`${rowLabel} nudge slower`}
                onClick={() => onNudge(1)}
              >
                ▼
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
