import { estimateMinutes } from "../../domain/expand.js";
import { isEffortRef } from "../../domain/pace.js";
import type { Baselines, Step, WorkoutType } from "../../domain/types.js";

/** localStorage key for the session draft — the one artifact 6B's timer
 *  consumes. Exported so callers (and tests) never hardcode it twice. */
export const DRAFT_KEY = "ergomatic.sessionDraft";

/** The session draft: an expand-only shape from day one (spec: "Session
 *  draft (the load-bearing contract)"). `steps` is a deep copy taken at
 *  confirm time — never the library object — so later edits here can never
 *  reach back into the library. Index-keyed `nudges`/`spmOverrides` and the
 *  `removed` index list all key off positions in `steps`, not step identity;
 *  they are meaningless against any other steps array. */
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

function isSessionDraft(value: unknown): value is SessionDraft {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { v?: unknown }).v === 1
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

/** The effective steps: removed indices dropped, SPM overrides folded into
 *  their work step. The reps marker (and every other non-work step) passes
 *  through untouched unless its own index was removed, so `estimateMinutes`
 *  still expands it. */
export function draftSteps(d: SessionDraft): Step[] {
  return d.steps
    .map((s, i) => {
      if (s.k !== "w") return s;
      const spm = d.spmOverrides[i];
      return spm === undefined ? s : { ...s, spm };
    })
    .filter((_, i) => !d.removed.includes(i));
}

/** Estimated minutes for the effective steps, via `estimateMinutes`. Every
 *  work step's pace ref — split or effort, time or distance duration alike —
 *  is resolved against `baselines` unconditionally by domain/expand.ts's
 *  `phases()`, so any work step present with no baselines would crash
 *  `estimateMinutes`; this returns null instead in that case. */
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
