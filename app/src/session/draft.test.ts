import { describe, it, expect, beforeEach, vi } from "vitest";
import { STARTER_WORKOUTS } from "../../server/seed/starter";
import type { Step, WorkoutType, Baselines } from "../../domain/types.js";
import {
  buildDraft,
  saveDraft,
  loadDraft,
  clearDraft,
  draftSteps,
  draftMinutes,
  withNudge,
  DRAFT_KEY,
  type SessionDraft,
} from "./draft";

// Realistic fixtures, per repo convention: pull real starter workouts
// (app/server/seed/starter.ts) rather than hand-built minimums.
// - Microburst (AN): the effort-ref fixture — `ref: { effort: "max" }` —
//   proving nudges refuse an entry for it.
// - Jet Stream (O2): the distance fixture — a single 10,000 m work step —
//   proving draftMinutes needs baselines and pins an exact total.
// - Doldrums (O2): the reps-marker fixture — `{ k: "reps", count: 2 }` —
//   proving draftSteps keeps the marker so estimateMinutes still expands it.
function starter(title: string) {
  const w = STARTER_WORKOUTS.find((s) => s.title === title);
  if (!w) throw new Error(`missing starter fixture: ${title}`);
  return w;
}

function draftInputFor(title: string, id: string) {
  const w = starter(title);
  return { id, title: w.title, type: w.type as WorkoutType, steps: w.steps };
}

const baselines: Baselines = { k2Seconds: 100, k6Seconds: 120 };

describe("buildDraft", () => {
  it("builds a v1 draft with defaults from a real starter workout", () => {
    const jetStream = starter("Jet Stream");
    const d = buildDraft(draftInputFor("Jet Stream", "id-jet-stream"));
    expect(d.v).toBe(1);
    expect(d.workoutId).toBe("id-jet-stream");
    expect(d.title).toBe("Jet Stream");
    expect(d.type).toBe("O2");
    expect(d.steps).toStrictEqual(jetStream.steps);
    expect(d.nudges).toStrictEqual({});
    expect(d.spmOverrides).toStrictEqual({});
    expect(d.removed).toStrictEqual([]);
    expect(d.startedAt).toBeNull();
    expect(new Date(d.createdAt).toISOString()).toBe(d.createdAt);
  });

  it("deep-copies steps so mutating the draft never touches the library workout", () => {
    const jetStream = starter("Jet Stream");
    const d = buildDraft(draftInputFor("Jet Stream", "id-jet-stream-2"));
    expect(d.steps).not.toBe(jetStream.steps);
    const draftWork = d.steps.find((s) => s.k === "w") as Extract<
      Step,
      { k: "w" }
    >;
    draftWork.spm = 999;
    const libraryWork = jetStream.steps.find((s) => s.k === "w") as Extract<
      Step,
      { k: "w" }
    >;
    expect(libraryWork.spm).not.toBe(999);
  });
});

describe("draftSteps", () => {
  it("folds SPM overrides into work steps and keeps the reps marker intact", () => {
    const d = buildDraft(draftInputFor("Doldrums", "id-doldrums"));
    const workIndex = d.steps.findIndex((s) => s.k === "w");
    const mutated: SessionDraft = {
      ...d,
      spmOverrides: { [workIndex]: 24 },
    };
    const steps = draftSteps(mutated);
    expect(steps).toHaveLength(d.steps.length);
    expect(steps.some((s) => s.k === "reps")).toBe(true);
    const work = steps[workIndex] as Extract<Step, { k: "w" }>;
    expect(work.spm).toBe(24);
  });

  it("excludes removed step indices from the effective list", () => {
    const d = buildDraft(draftInputFor("Doldrums", "id-doldrums-2"));
    const wuIndex = d.steps.findIndex((s) => s.k === "wu");
    const mutated: SessionDraft = { ...d, removed: [wuIndex] };
    const steps = draftSteps(mutated);
    expect(steps).toHaveLength(d.steps.length - 1);
    expect(steps.some((s) => s.k === "wu")).toBe(false);
  });
});

describe("draftMinutes", () => {
  it("computes an exact pinned total for a distance workout (Jet Stream) given baselines", () => {
    const d = buildDraft(draftInputFor("Jet Stream", "id-jet-stream-3"));
    // wu 5' (300s) + 10,000m @ 6k+8 = 128 s/500m -> 20 * 128 = 2560s.
    // total 2860s -> round(2860/60) = 48.
    expect(draftMinutes(d, baselines)).toBe(48);
  });

  it("returns null for a distance workout when baselines are absent", () => {
    const d = buildDraft(draftInputFor("Jet Stream", "id-jet-stream-4"));
    expect(draftMinutes(d, null)).toBeNull();
  });

  it("also returns null for a TIME-based work step without baselines (any pace ref needs resolving)", () => {
    // Doldrums is time-based (not distance), but its work step still carries
    // a SplitRef that expand.ts's phases() resolves unconditionally via
    // resolveSplit(baselines, ref) regardless of duration kind - so it
    // crashes without baselines exactly like the distance case. The brief
    // frames the null case as "a distance step needs baselines"; the actual
    // domain code (domain/pace.ts resolveSplit/estimationSplit, domain/
    // expand.ts phases()) requires baselines for ANY "w" step, split or
    // effort ref, time or distance duration. This test pins that broader,
    // actually-correct rule.
    const d = buildDraft(draftInputFor("Doldrums", "id-doldrums-3"));
    expect(draftMinutes(d, null)).toBeNull();
  });

  it("still computes minutes without baselines when no work step is present", () => {
    const d: SessionDraft = {
      v: 1,
      workoutId: "synthetic",
      title: "Warm-up only",
      type: "O2",
      steps: [{ k: "wu", minutes: 5 }],
      nudges: {},
      spmOverrides: {},
      removed: [],
      createdAt: new Date().toISOString(),
      startedAt: null,
    };
    expect(draftMinutes(d, null)).toBe(5);
  });

  it("computes an exact pinned total for an effort-ref workout (Microburst) given baselines", () => {
    const d = buildDraft(draftInputFor("Microburst", "id-microburst"));
    // wu 5' (300s) + 10 * (30s work + 150s rest) = 300 + 1800 = 2100s -> 35.
    expect(draftMinutes(d, baselines)).toBe(35);
  });
});

describe("withNudge", () => {
  it("no-ops on an effort-ref work step (Microburst)", () => {
    const d = buildDraft(draftInputFor("Microburst", "id-microburst-2"));
    const workIndex = d.steps.findIndex((s) => s.k === "w");
    const result = withNudge(d, workIndex, 5);
    expect(result).toBe(d);
    expect(result.nudges).toStrictEqual({});
  });

  it("nudges a split-ref work step cumulatively (Jet Stream)", () => {
    const d = buildDraft(draftInputFor("Jet Stream", "id-jet-stream-5"));
    const workIndex = d.steps.findIndex((s) => s.k === "w");
    const once = withNudge(d, workIndex, 3);
    expect(once.nudges[workIndex]).toBe(3);
    const twice = withNudge(once, workIndex, -1);
    expect(twice.nudges[workIndex]).toBe(2);
  });

  it("no-ops on a non-work step index and on an out-of-range index", () => {
    const d = buildDraft(draftInputFor("Jet Stream", "id-jet-stream-6"));
    const wuIndex = d.steps.findIndex((s) => s.k === "wu");
    expect(withNudge(d, wuIndex, 1)).toBe(d);
    expect(withNudge(d, 999, 1)).toBe(d);
  });
});

describe("saveDraft / loadDraft / clearDraft", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a Microburst (effort step) draft byte-identical after mutation", () => {
    const d = buildDraft(draftInputFor("Microburst", "id-microburst-3"));
    const workIndex = d.steps.findIndex((s) => s.k === "w");
    const nudged = withNudge(d, workIndex, 5); // no-op: effort ref
    const mutated: SessionDraft = {
      ...nudged,
      spmOverrides: { [workIndex]: 30 },
      removed: [0], // strike the warmup
    };
    expect(saveDraft(mutated)).toBe(true);
    const loaded = loadDraft();
    expect(loaded).toStrictEqual(mutated);
    expect(loaded!.nudges).toStrictEqual({});
    const effective = draftSteps(loaded!);
    expect(effective.some((s) => s.k === "wu")).toBe(false);
    // 35 total minus the removed 5' warmup.
    expect(draftMinutes(loaded!, baselines)).toBe(30);
  });

  it("round-trips a Jet Stream (distance) draft byte-identical with a nudge applied", () => {
    const d = buildDraft(draftInputFor("Jet Stream", "id-jet-stream-7"));
    const workIndex = d.steps.findIndex((s) => s.k === "w");
    const nudged = withNudge(d, workIndex, 2);
    expect(saveDraft(nudged)).toBe(true);
    const loaded = loadDraft();
    expect(loaded).toStrictEqual(nudged);
    expect(draftMinutes(loaded!, baselines)).toBe(48);
    expect(draftMinutes(loaded!, null)).toBeNull();
  });

  it("round-trips a Doldrums (reps marker) draft, keeping the marker live", () => {
    const d = buildDraft(draftInputFor("Doldrums", "id-doldrums-4"));
    expect(saveDraft(d)).toBe(true);
    const loaded = loadDraft();
    expect(loaded).toStrictEqual(d);
    const steps = draftSteps(loaded!);
    expect(steps.some((s) => s.k === "reps")).toBe(true);
    // wu 4' (240s) + 2 * (20' work + 3' rest) = 240 + 2760 = 3000s -> 50.
    expect(draftMinutes(loaded!, baselines)).toBe(50);
  });

  it("returns null when nothing is stored", () => {
    expect(loadDraft()).toBeNull();
  });

  it("returns null and clears the key for garbage JSON", () => {
    localStorage.setItem(DRAFT_KEY, "{not json");
    expect(loadDraft()).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("returns null and clears the key for an unknown version", () => {
    const d = buildDraft(draftInputFor("Jet Stream", "id-jet-stream-8"));
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, v: 2 }));
    expect(loadDraft()).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("clearDraft removes the stored draft", () => {
    const d = buildDraft(draftInputFor("Jet Stream", "id-jet-stream-9"));
    saveDraft(d);
    clearDraft();
    expect(loadDraft()).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("returns false without throwing when localStorage.setItem fails (quota)", () => {
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      });
    const d = buildDraft(draftInputFor("Jet Stream", "id-jet-stream-10"));
    expect(() => saveDraft(d)).not.toThrow();
    expect(saveDraft(d)).toBe(false);
    spy.mockRestore();
  });

  it("exposes the storage key used", () => {
    expect(DRAFT_KEY).toBe("ergomatic.sessionDraft");
  });
});
