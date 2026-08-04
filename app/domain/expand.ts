import { fmtSplit } from "./format.js";
import {
  effortWord,
  estimationSplit,
  isEffortRef,
  resolveSplit,
} from "./pace.js";
import type { Baselines, PaceRef, Step } from "./types.js";

export interface Phase {
  type: "warmup" | "work" | "rest" | "test";
  seconds?: number; // time-based phases
  meters?: number; // distance work phases
  targetSplit?: number; // work phases (resolved, nudge excluded — session nudges are applied by callers)
  targetKind?: "split" | "effort"; // work phases only; set on every work phase
  // The raw ref a "split" targetKind phase was resolved from — set ONLY
  // for that case (an effort phase's target is words, never a number to
  // trace back to a ref; the same 5G rule). When this Phase came from
  // `buildRun` (engine.ts), `effectiveSteps` has already folded any
  // confirm-time nudge into `off` before `phases()` ever sees it, so this
  // is always the EFFECTIVE ref — the same one `targetSplit` was resolved
  // against — not the pre-nudge authored value. Exists so a display
  // surface that needs "where did this number come from" (the timer's
  // TARGET SPLIT sub-line, ui-fix round Item 1) can call `domain/pace.ts`'s
  // `refLabel` directly, without reaching back into a `SessionDraft` the
  // way `logDraft.ts`'s own LABEL IDIOM comment documents having to do
  // before this field existed.
  ref?: PaceRef;
  spm?: number;
  // 'Easy' | 'Rest' | 'All out' | 'ALL OUT' | 'EASY' | the EXACT resolved
  // split (`fmtSplit`) for a "split" targetKind phase. Ui-fix round, Item
  // 1: this used to be `toleranceRange(split, tol).label` (a "lo–hi"
  // band) — retired because this label reaches display (Timer.tsx's own
  // `upNextText`/`thenNextText` read `EnginePhase.label` straight
  // through, and `logDraft.ts`'s `buildLogSteps` fallback path composes a
  // LogStep's label from it too), and the round's own rule is that no
  // display surface shows a band any more.
  label: string;
  set?: { index: number; of: number };
  // The index in the `steps` array PASSED TO `phases()` (before this
  // function's own reps-block expansion) that this phase was expanded
  // from. A "reps" block's every repeated occurrence carries the SAME
  // `originalStepIndex` (they all came from one authored step); a work
  // step's auto-inserted rest phase shares its work phase's
  // `originalStepIndex` too (one authored step produced both). Callers
  // needing per-step attribution across repeats (6B's session engine) must
  // key off this, not off position in the returned array — stamping it
  // HERE means the one place deciding whether/how many phases a step
  // produces is the same place that knows which original step it was
  // (Phase 6B Task 1 review, F1: a caller-side reimplementation of this
  // same reps-expansion drifted from this function's own truthiness check
  // below the moment a stale/hand-edited `restMinutes: 0` reached it).
  originalStepIndex: number;
}

export function liveSteps(steps: Step[]): Step[] {
  return liveIndices(steps).map((i) => steps[i]!);
}

// For each element `liveSteps(steps)` would produce (reps block expanded,
// marker still included at its own slot), the index in the ORIGINAL
// `steps` array it came from. `liveSteps` and `phases()` both derive from
// this single expansion so a repeated step's every occurrence and the
// phases() attribution below can never disagree about where the marker
// sits or how many times its block repeats.
function liveIndices(steps: Step[]): number[] {
  const idx = steps.findIndex((s) => s.k === "reps");
  if (idx === -1) return steps.map((_, i) => i);
  const beforeIdx = steps.slice(0, idx).map((_, i) => i);
  const repeatedIdx = steps.slice(idx + 1).map((_, i) => idx + 1 + i);
  const marker = steps[idx] as Extract<Step, { k: "reps" }>;
  const out = [...beforeIdx];
  for (let i = 0; i < marker.count; i++) out.push(...repeatedIdx);
  return out;
}

/** The seconds a single phase represents: its fixed `seconds` for a time
 *  phase, or an ESTIMATE for a distance phase (`(meters / 500) *
 *  targetSplit` — the average pace its resolved target implies), or
 *  `null` for a phase with neither (an open-ended "test" phase has
 *  nothing to estimate). Shared by `estimateMinutes` below and by 6B's
 *  session engine (`totalRemainingSeconds`) so the one formula for "how
 *  long is this phase" lives in one place (Phase 6B Task 1 review: a
 *  duplicated copy of this same arithmetic in `engine.ts` was flagged as
 *  the same lockstep risk `originalStepIndex` above exists to prevent).
 *  Takes only the three fields it reads, not the full `Phase` — 6B's
 *  `EnginePhase` strips `originalStepIndex` (an implementation detail of
 *  `phases()`'s own call, replaced by its own `originalIndex`) and would
 *  otherwise fail to structurally satisfy a `Phase` parameter. */
export function phaseSeconds(
  phase: Pick<Phase, "seconds" | "meters" | "targetSplit">,
): number | null {
  if (phase.seconds !== undefined) return phase.seconds;
  if (phase.meters !== undefined && phase.targetSplit !== undefined) {
    return (phase.meters / 500) * phase.targetSplit;
  }
  return null;
}

export function phases(steps: Step[], baselines: Baselines): Phase[] {
  const idx = steps.findIndex((s) => s.k === "reps");
  const marker =
    idx === -1 ? null : (steps[idx] as Extract<Step, { k: "reps" }>);
  const perSet = marker ? steps.length - idx - 1 : 0;
  const out: Phase[] = [];
  // Step's "reps" variant is documented as "at most one per workout"
  // (types.ts) and validate.ts enforces that; liveIndices strips the sole
  // marker's own slot the same way liveSteps always has, so any live
  // "reps" step remaining here can only be a second, invalid marker nested
  // inside the first's repeated block — a shape validateSteps already
  // rejects. Drop it defensively rather than giving the switch below a
  // dead no-op case for it.
  const expanded = liveIndices(steps)
    .map((originalStepIndex) => ({
      step: steps[originalStepIndex]!,
      originalStepIndex,
    }))
    .filter((e) => e.step.k !== "reps");
  const preCount = marker ? idx : expanded.length;

  expanded.forEach(({ step: s, originalStepIndex }, i) => {
    const set =
      marker && i >= preCount
        ? { index: Math.floor((i - preCount) / perSet) + 1, of: marker.count }
        : undefined;
    switch (s.k) {
      case "wu":
        out.push({
          type: "warmup",
          seconds: s.minutes * 60,
          label: "Easy",
          set,
          originalStepIndex,
        });
        break;
      case "r":
        out.push({
          type: "rest",
          seconds: s.minutes * 60,
          label: "Rest",
          set,
          originalStepIndex,
        });
        break;
      case "test":
        out.push({ type: "test", label: "All out", set, originalStepIndex });
        break;
      case "w": {
        let base: Phase;
        if (isEffortRef(s.ref)) {
          base = {
            type: "work",
            targetKind: "effort",
            targetSplit: estimationSplit(baselines, s.ref),
            spm: s.spm,
            label: effortWord(s.ref.effort),
            set,
            originalStepIndex,
          };
        } else {
          const split = resolveSplit(baselines, s.ref);
          base = {
            type: "work",
            targetKind: "split",
            targetSplit: split,
            ref: s.ref,
            spm: s.spm,
            label: fmtSplit(split),
            set,
            originalStepIndex,
          };
        }
        if (s.duration.kind === "time") base.seconds = s.duration.minutes * 60;
        else base.meters = s.duration.meters;
        out.push(base);
        if (s.restMinutes)
          out.push({
            type: "rest",
            seconds: s.restMinutes * 60,
            label: "Rest",
            set,
            originalStepIndex,
          });
        break;
      }
    }
  });
  return out;
}

export function estimateMinutes(
  steps: Step[],
  baselines: Baselines,
): { minutes: number; estimated: boolean } {
  let seconds = 0;
  let estimated = false;
  for (const p of phases(steps, baselines)) {
    const s = phaseSeconds(p);
    if (s === null) continue;
    if (p.seconds === undefined) estimated = true;
    seconds += s;
  }
  return { minutes: Math.round(seconds / 60), estimated };
}
