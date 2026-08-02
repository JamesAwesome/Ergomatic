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
  effectiveSteps,
  withNudge,
  startDraft,
  cancelStart,
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

  it("folds a split-ref work step's nudge into its ref.off", () => {
    const d = buildDraft(draftInputFor("Jet Stream", "id-jet-stream-nudge"));
    const workIndex = d.steps.findIndex((s) => s.k === "w");
    const nudged = withNudge(d, workIndex, -5);
    const steps = draftSteps(nudged);
    const work = steps[workIndex] as Extract<Step, { k: "w" }>;
    expect(work.ref).toStrictEqual({ base: "6k", off: 3 }); // 8 + (-5)
  });
});

describe("effectiveSteps", () => {
  // F2 (6B contract): draftSteps'/effectiveSteps' filtered array is NOT
  // index-aligned with `nudges`/`spmOverrides`/`removed` once anything is
  // removed — the whole reason this function exists is so a caller never
  // has to re-derive "which original step was this" by counting positions
  // in the filtered array.
  it("pairs each surviving step with its ORIGINAL index, not its filtered position", () => {
    const d = buildDraft(draftInputFor("Doldrums", "id-doldrums-effective"));
    const wuIndex = d.steps.findIndex((s) => s.k === "wu");
    expect(wuIndex).toBe(0); // Doldrums: wu, reps, w — striking index 0
    const mutated: SessionDraft = { ...d, removed: [wuIndex] };

    const effective = effectiveSteps(mutated);
    expect(effective).toHaveLength(d.steps.length - 1);
    // Position 0 in the filtered array is originally index 1 (the reps
    // marker) — a caller that mistakenly used the filtered position as the
    // key into `nudges`/`spmOverrides` would silently address the wrong
    // step the moment anything upstream of it was removed.
    expect(effective[0]!.originalIndex).toBe(1);
    expect(effective[0]!.step.k).toBe("reps");
    expect(effective[1]!.originalIndex).toBe(2);
    expect(effective[1]!.step.k).toBe("w");
  });

  it("agrees with draftSteps' own step values (same fold, just paired with the index)", () => {
    const d = buildDraft(draftInputFor("Doldrums", "id-doldrums-effective-2"));
    const workIndex = d.steps.findIndex((s) => s.k === "w");
    const mutated: SessionDraft = { ...d, spmOverrides: { [workIndex]: 24 } };

    const effective = effectiveSteps(mutated);
    const plain = draftSteps(mutated);
    expect(effective.map((e) => e.step)).toStrictEqual(plain);
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

  // F1 fix (final whole-branch review): draftMinutes used to price the
  // recount from the UN-nudged split — nudging a distance step's target
  // moved the resolved range shown on its own row but never touched the
  // Confirm footer's minute recount, because draftMinutes called
  // estimateMinutes over draftSteps(d) while draftSteps folded SPM
  // overrides but not nudges. (The reviewer's exact probe: nudging Jet
  // Stream's split step should move its 44-ish minute recount; instead it
  // read the same number before and after.) Pinned here with a nudge big
  // enough to cross a rounding boundary, so a fix that folds the nudge in
  // but gets the sign or magnitude wrong would still fail this.
  it("prices a nudge into the recount for a distance workout (the exact case a prior version silently ignored)", () => {
    const d = buildDraft(draftInputFor("Jet Stream", "id-jet-stream-priced"));
    const workIndex = d.steps.findIndex((s) => s.k === "w");
    // Unnudged: wu 5' (300s) + 10,000m @ 6k+8 = 128 s/500m -> 20*128 = 2560s;
    // total 2860s -> round(2860/60) = 48 (same pinned total as the earlier
    // "exact pinned total" test above — this test's whole point is the
    // BEFORE/AFTER delta, not a fresh number).
    expect(draftMinutes(d, baselines)).toBe(48);

    // -5s/500m nudge: split becomes 123 -> 20*123 = 2460s; total 2760s ->
    // round(2760/60) = 46 exactly. A version that ignores nudges would
    // still report 48 here.
    const nudged = withNudge(d, workIndex, -5);
    expect(draftMinutes(nudged, baselines)).toBe(46);
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

describe("startDraft / cancelStart", () => {
  it("startDraft stamps a real ISO startedAt", () => {
    const d = buildDraft(draftInputFor("Doldrums", "id-doldrums-start"));
    expect(d.startedAt).toBeNull();
    const started = startDraft(d);
    expect(started.startedAt).not.toBeNull();
    expect(new Date(started.startedAt!).toISOString()).toBe(started.startedAt);
  });

  it("cancelStart reverses startDraft, returning startedAt to null", () => {
    const d = buildDraft(draftInputFor("Doldrums", "id-doldrums-cancel"));
    const started = startDraft(d);
    const cancelled = cancelStart(started);
    expect(cancelled.startedAt).toBeNull();
    // Every other field survives untouched — this only ever touches
    // startedAt, the same "one field" discipline startDraft itself follows.
    expect(cancelled).toStrictEqual({ ...started, startedAt: null });
  });

  it("cancelStart on an already-unstarted draft is a no-op value (still null)", () => {
    const d = buildDraft(draftInputFor("Doldrums", "id-doldrums-cancel-2"));
    expect(cancelStart(d).startedAt).toBeNull();
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
    // -5, not +2: a +2 nudge (128 -> 130 s/500m) still rounds to the same
    // 48-minute total as unnudged (2900/60 = 48.33 -> 48), so it would pass
    // whether or not draftMinutes actually priced the nudge in — exactly
    // the gap the F1 fix ("prices a nudge into the recount…" test above)
    // was found through. -5 crosses the rounding boundary (48 -> 46), so
    // this round trip also proves the nudge survived storage AND still
    // prices correctly after a reload.
    const nudged = withNudge(d, workIndex, -5);
    expect(saveDraft(nudged)).toBe(true);
    const loaded = loadDraft();
    expect(loaded).toStrictEqual(nudged);
    expect(draftMinutes(loaded!, baselines)).toBe(46);
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

  // F5 fix (final whole-branch review): isSessionDraft used to check only
  // `v === 1`, so this exact reviewer probe — a lone `{"v":1}` with none of
  // the fields every screen reads unconditionally — used to satisfy the
  // guard and load "successfully", then throw the moment ConfirmTargets (or
  // Timer) touched `.steps`/`.nudges`/`.removed`/`.title`.
  // Malformed now fails the same guard an unknown version already did:
  // null back, key cleared, no downstream crash.
  it("returns null and clears the key for a bare {v:1} with none of the load-bearing fields", () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ v: 1 }));
    expect(loadDraft()).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("returns null and clears the key for valid JSON that isn't a plain record at all (an array)", () => {
    // Distinct from the garbage-JSON case above: `JSON.parse` succeeds here
    // (this is valid JSON), it just doesn't parse into an object shape at
    // all — the `isPlainRecord` guard's own array rejection, not its
    // `v === 1` check.
    localStorage.setItem(DRAFT_KEY, "[]");
    expect(loadDraft()).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("returns null for v:1 with steps/removed as the wrong shape (an object, not an array)", () => {
    const d = buildDraft(
      draftInputFor("Jet Stream", "id-jet-stream-malformed"),
    );
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ ...d, steps: {}, removed: {} }),
    );
    expect(loadDraft()).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("returns null for v:1 with nudges/spmOverrides as the wrong shape (an array, not a record)", () => {
    const d = buildDraft(
      draftInputFor("Jet Stream", "id-jet-stream-malformed-2"),
    );
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ ...d, nudges: [], spmOverrides: [] }),
    );
    expect(loadDraft()).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("returns null for v:1 with a non-string title", () => {
    const d = buildDraft(
      draftInputFor("Jet Stream", "id-jet-stream-malformed-3"),
    );
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, title: 42 }));
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
