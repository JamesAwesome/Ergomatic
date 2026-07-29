import { resolveSplit, toleranceRange } from "./pace.js";
import type { Baselines, Step } from "./types.js";

export interface Phase {
  type: "warmup" | "work" | "rest" | "test";
  seconds?: number; // time-based phases
  meters?: number; // distance work phases
  targetSplit?: number; // work phases (resolved, nudge excluded — session nudges are applied by callers)
  spm?: number;
  label: string; // 'Easy' | 'Rest' | 'All out' | fmtSplit-range label
  set?: { index: number; of: number };
}

export function liveSteps(steps: Step[]): Step[] {
  const idx = steps.findIndex((s) => s.k === "reps");
  if (idx === -1) return steps;
  const marker = steps[idx] as Extract<Step, { k: "reps" }>;
  const before = steps.slice(0, idx);
  const repeated = steps.slice(idx + 1);
  const out = [...before];
  for (let i = 0; i < marker.count; i++) out.push(...repeated);
  return out;
}

export function phases(
  steps: Step[],
  baselines: Baselines,
  tol: number,
): Phase[] {
  const idx = steps.findIndex((s) => s.k === "reps");
  const marker =
    idx === -1 ? null : (steps[idx] as Extract<Step, { k: "reps" }>);
  const perSet = marker ? steps.length - idx - 1 : 0;
  const out: Phase[] = [];
  const expanded = liveSteps(steps);
  const preCount = marker ? idx : expanded.length;

  expanded.forEach((s, i) => {
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
        });
        break;
      case "r":
        out.push({ type: "rest", seconds: s.minutes * 60, label: "Rest", set });
        break;
      case "test":
        out.push({ type: "test", label: "All out", set });
        break;
      case "w": {
        const split = resolveSplit(baselines, s.ref);
        const base: Phase = {
          type: "work",
          targetSplit: split,
          spm: s.spm,
          label: toleranceRange(split, tol).label,
          set,
        };
        if (s.duration.kind === "time") base.seconds = s.duration.minutes * 60;
        else base.meters = s.duration.meters;
        out.push(base);
        if (s.restMinutes)
          out.push({
            type: "rest",
            seconds: s.restMinutes * 60,
            label: "Rest",
            set,
          });
        break;
      }
      case "reps":
        break;
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
  for (const p of phases(steps, baselines, 0)) {
    if (p.seconds !== undefined) {
      seconds += p.seconds;
    } else if (p.meters !== undefined && p.targetSplit !== undefined) {
      estimated = true;
      seconds += (p.meters / 500) * p.targetSplit;
    }
  }
  return { minutes: Math.round(seconds / 60), estimated };
}
