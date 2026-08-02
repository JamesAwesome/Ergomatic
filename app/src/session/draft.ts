import { estimateMinutes } from "../../domain/expand.js";
import { isEffortRef } from "../../domain/pace.js";
import type {
  Baselines,
  PaceRef,
  Step,
  WorkoutType,
} from "../../domain/types.js";

/** localStorage key for the session draft — the one artifact 6B's timer
 *  consumes. Exported so callers (and tests) never hardcode it twice. */
export const DRAFT_KEY = "ergomatic.sessionDraft";

/** The session draft: an expand-only shape from day one (spec: "Session
 *  draft (the load-bearing contract)"). `steps` is a deep copy taken at
 *  confirm time — never the library object — so later edits here can never
 *  reach back into the library. Index-keyed `nudges`/`spmOverrides` and the
 *  `removed` index list all key off positions in `steps`, not step identity;
 *  they are meaningless against any other steps array.
 *
 *  These keys are ORIGINAL indices — positions in `d.steps` as authored —
 *  FOREVER, not positions in any filtered/expanded view. `effectiveSteps`
 *  below drops removed entries, which shifts every surviving element's
 *  array position; a caller that re-keyed off that filtered position would
 *  silently read another step's nudge/spm. And once 6B's `liveSteps()`
 *  expands a "reps" block into its repeated instances, per-repetition
 *  indexing is a 6B-owned layer on top of this one — this module never
 *  produces or consumes it. Any future consumer (6B's timer included) must
 *  key off `originalIndex`, never off position in a derived array. */
export interface SessionDraft {
  v: 1;
  workoutId: string | null;
  title: string;
  type: WorkoutType;
  steps: Step[];
  nudges: Record<number, number>;
  spmOverrides: Record<number, number>;
  removed: number[];
  createdAt: string;
  startedAt: string | null;
}

/** Builds a fresh draft from a workout (library entry or stored workout).
 *  `steps` is deep-copied so mutating the draft never touches the library
 *  object it was built from. */
export function buildDraft(w: {
  id: string;
  title: string;
  type: WorkoutType;
  steps: Step[];
}): SessionDraft {
  return {
    v: 1,
    workoutId: w.id,
    title: w.title,
    type: w.type,
    steps: structuredClone(w.steps),
    nudges: {},
    spmOverrides: {},
    removed: [],
    createdAt: new Date().toISOString(),
    startedAt: null,
  };
}

// Loose on purpose (see loadDraft's own comment): not full domain
// validation of every step, just "is this shaped enough to not crash the
// screens that immediately read it" — a plain object, not an array.
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Checks `v` plus every field a screen reads unconditionally on load:
// ConfirmTargets maps over `steps` and indexes into `nudges`/`spmOverrides`,
// Timer/ConfirmTargets both read `title`, and `removed.includes`
// requires an array. A record with only `{"v":1}` used to satisfy this
// check and then throw downstream the moment a screen touched any of those
// fields — malformed now fails here instead, same as an unknown version.
function isSessionDraft(value: unknown): value is SessionDraft {
  if (!isPlainRecord(value)) return false;
  return (
    value.v === 1 &&
    typeof value.title === "string" &&
    Array.isArray(value.steps) &&
    Array.isArray(value.removed) &&
    isPlainRecord(value.nudges) &&
    isPlainRecord(value.spmOverrides)
  );
}

/** Persists the draft. localStorage can throw (quota, private-mode Safari,
 *  disabled storage) — this never lets that escape uncaught; callers get a
 *  boolean instead. */
export function saveDraft(d: SessionDraft): boolean {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}

/** Loads the draft. Garbage JSON or an unrecognized version is discarded
 *  (the key is cleared) rather than crashing the caller — an expand-only
 *  shape means a stale build's `v` is the only thing that ever needs this
 *  escape hatch. */
export function loadDraft(): SessionDraft | null {
  const raw = localStorage.getItem(DRAFT_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isSessionDraft(parsed)) return parsed;
  } catch {
    // fall through: garbage JSON is handled the same as an unknown shape
  }
  clearDraft();
  return null;
}

export function clearDraft(): void {
  localStorage.removeItem(DRAFT_KEY);
}

/** The effective steps, paired with the ORIGINAL index each came from (see
 *  the module header: `nudges`/`spmOverrides`/`removed` all key off that
 *  original position, never off a position in this filtered array). Removed
 *  indices are dropped; SPM overrides are folded into their work step; and
 *  a split-ref work step's nudge is folded into its `ref.off` — pace.ts's
 *  `resolveSplit` computes `base + off + nudge`, so adding the nudge onto
 *  `off` before resolution and never applying a nudge at all are the exact
 *  same number for any consumer that resolves the ref, `estimateMinutes`
 *  (via domain/expand.ts's `phases()`) included. Folding it here, once, is
 *  what makes `draftMinutes` price a nudge instead of silently ignoring it
 *  (the bug this fixes: nudging a distance step's split used to leave the
 *  Confirm footer's minute recount unchanged). Effort refs have no `off` to
 *  nudge and are passed through untouched (`withNudge` already refuses to
 *  record a nudge against one). The reps marker (and every other non-work
 *  step) passes through untouched unless its own index was removed, so
 *  `estimateMinutes` still expands it. */
export function effectiveSteps(
  d: SessionDraft,
): { step: Step; originalIndex: number }[] {
  return d.steps
    .map((s, i) => {
      if (s.k !== "w") return { step: s, originalIndex: i };
      let step = s;
      const spm = d.spmOverrides[i];
      if (spm !== undefined) step = { ...step, spm };
      const nudge = d.nudges[i];
      if (nudge !== undefined && !isEffortRef(step.ref)) {
        const ref: PaceRef = { ...step.ref, off: step.ref.off + nudge };
        step = { ...step, ref };
      }
      return { step, originalIndex: i };
    })
    .filter((_, i) => !d.removed.includes(i));
}

/** The effective steps as a plain `Step[]` — `effectiveSteps` without the
 *  original-index pairing, for callers that only need the resolved shape
 *  (e.g. `draftMinutes` below). Keeping one implementation
 *  (`effectiveSteps`) means the nudge-folding fix above applies here too. */
export function draftSteps(d: SessionDraft): Step[] {
  return effectiveSteps(d).map((e) => e.step);
}

/** Estimated minutes for the effective steps, via `estimateMinutes`. Every
 *  work step's pace ref — split or effort, time or distance duration alike —
 *  is resolved against `baselines` unconditionally by domain/expand.ts's
 *  `phases()`, so any work step present with no baselines would crash
 *  `estimateMinutes`; this returns null instead in that case. Uses
 *  `draftSteps` (nudges already folded into `off`), not raw `d.steps` — see
 *  `effectiveSteps`'s comment for why that's the same math as a "real"
 *  nudge. */
export function draftMinutes(
  d: SessionDraft,
  baselines: Baselines | null,
): number | null {
  const steps = draftSteps(d);
  if (baselines === null) {
    if (steps.some((s) => s.k === "w")) return null;
    return estimateMinutes(steps, { k2Seconds: 0, k6Seconds: 0 }).minutes;
  }
  return estimateMinutes(steps, baselines).minutes;
}

/** Stamps `startedAt` — the one field 6B requires non-null before it will
 *  consume a draft (spec: "Session draft"). Pure, like `withNudge`: the
 *  caller still owns calling `saveDraft` with the result, so the module
 *  stays the only thing that ever writes the storage key while every
 *  mutation shape (this, `withNudge`) lives here rather than in a
 *  component. */
export function startDraft(d: SessionDraft): SessionDraft {
  return { ...d, startedAt: new Date().toISOString() };
}

/** Reverses `startDraft` — clears `startedAt`, returning the draft to its
 *  pre-start, editable state. This is what makes the countdown screen's
 *  CANCEL button coherent (Phase 6B Task 2's report flagged the loop this
 *  closes): `ConfirmTargets` redirects a STARTED draft straight to the live
 *  timer (so a back-swipe mid-session resumes the action instead of
 *  re-showing stale editable targets), so CANCEL navigating to
 *  `/session/confirm` with `startedAt` still set would immediately bounce
 *  the rower right back to the timer instead of letting them re-edit. The
 *  caller (`Countdown.tsx`) pairs this with `run.ts`'s `clearRun()` — an
 *  un-started draft coexisting with a live run record would leave the two
 *  keys disagreeing about whether a session is in progress. Pure, like
 *  `startDraft`/`withNudge`: the caller still owns `saveDraft`. */
export function cancelStart(d: SessionDraft): SessionDraft {
  return { ...d, startedAt: null };
}

/** Nudges a split step's target by `delta` seconds (cumulative). No-ops
 *  (returns `d` unchanged) when the step at `i` isn't a split-ref work step
 *  — effort steps ("ALL OUT"/"EASY") have nothing to nudge, the same rule
 *  the detail screen already follows. */
export function withNudge(
  d: SessionDraft,
  i: number,
  delta: number,
): SessionDraft {
  const step = d.steps[i];
  if (!step || step.k !== "w" || isEffortRef(step.ref)) return d;
  return {
    ...d,
    nudges: { ...d.nudges, [i]: (d.nudges[i] ?? 0) + delta },
  };
}
