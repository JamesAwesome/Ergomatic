import { describe, it, expect, beforeEach, vi } from "vitest";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import type { Step, WorkoutType, Baselines } from "../../domain/types.js";
import {
  buildDraft,
  buildNudgedDraft,
  saveDraft,
  loadDraft,
  clearDraft,
  draftSteps,
  draftMinutes,
  effectiveSteps,
  withNudge,
  startDraft,
  DRAFT_KEY,
  type SessionDraft,
} from "./draft";
import { buildRun } from "./engine";

// Realistic fixtures, per repo convention: pull real library workouts
// (app/server/seed/library/index.ts) rather than hand-built minimums.
// - Fork Lightning (AN): the effort-ref fixture — `ref: { effort: "max" }` —
//   proving nudges refuse an entry for it.
// - Calm Sea (O2): the distance fixture — a single 10,000 m work step —
//   proving draftMinutes needs baselines and pins an exact total. (Meltemi
//   used to hold this role; the library rewrite turned it into a 5-phase
//   TIME workout with no distance step at all, so this suite re-anchored to
//   Calm Sea — same 10,000 m distance, minimizing drift elsewhere.)
// - Hoarfrost (O2): the reps-marker fixture — `{ k: "reps", count: 2 }` —
//   proving draftSteps keeps the marker so estimateMinutes still expands it.
function library(title: string) {
  const w = LIBRARY_WORKOUTS.find((s) => s.title === title);
  if (!w) throw new Error(`missing library fixture: ${title}`);
  return w;
}

function draftInputFor(title: string, id: string) {
  const w = library(title);
  return { id, title: w.title, type: w.type as WorkoutType, steps: w.steps };
}

const baselines: Baselines = { k2Seconds: 100, k6Seconds: 120 };

describe("buildDraft", () => {
  it("builds a v1 draft with defaults from a real library workout", () => {
    const calmsea = library("Calm Sea");
    const d = buildDraft(draftInputFor("Calm Sea", "id-calmsea"));
    expect(d.v).toBe(1);
    expect(d.workoutId).toBe("id-calmsea");
    expect(d.title).toBe("Calm Sea");
    expect(d.type).toBe("O2");
    expect(d.steps).toStrictEqual(calmsea.steps);
    expect(d.nudges).toStrictEqual({});
    expect(d.spmOverrides).toStrictEqual({});
    expect(d.removed).toStrictEqual([]);
    expect(d.startedAt).toBeNull();
    expect(new Date(d.createdAt).toISOString()).toBe(d.createdAt);
  });

  it("deep-copies steps so mutating the draft never touches the library workout", () => {
    const calmsea = library("Calm Sea");
    const d = buildDraft(draftInputFor("Calm Sea", "id-calmsea-2"));
    expect(d.steps).not.toBe(calmsea.steps);
    const draftWork = d.steps.find((s) => s.k === "w") as Extract<
      Step,
      { k: "w" }
    >;
    draftWork.spm = 999;
    const libraryWork = calmsea.steps.find((s) => s.k === "w") as Extract<
      Step,
      { k: "w" }
    >;
    expect(libraryWork.spm).not.toBe(999);
  });
});

describe("draftSteps", () => {
  it("folds SPM overrides into work steps and keeps the reps marker intact", () => {
    const d = buildDraft(draftInputFor("Hoarfrost", "id-hoarfrost"));
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
    // Moonbow (w, r, w) rather than Hoarfrost: this used to strike
    // Hoarfrost's lead `wu` step, and no workout has one since 2026-08-09's
    // warmup setting. Its standalone REST row is the same shape of thing —
    // a non-work row a rower can strike on Confirm.
    const d = buildDraft(draftInputFor("Moonbow", "id-moonbow-2"));
    const restIndex = d.steps.findIndex((s) => s.k === "r");
    expect(restIndex).toBe(1);
    const mutated: SessionDraft = { ...d, removed: [restIndex] };
    const steps = draftSteps(mutated);
    expect(steps).toHaveLength(d.steps.length - 1);
    expect(steps.some((s) => s.k === "r")).toBe(false);
  });

  it("folds a split-ref work step's nudge into its ref.off", () => {
    const d = buildDraft(draftInputFor("Calm Sea", "id-calmsea-nudge"));
    const workIndex = d.steps.findIndex((s) => s.k === "w");
    const nudged = withNudge(d, workIndex, -5);
    const steps = draftSteps(nudged);
    const work = steps[workIndex] as Extract<Step, { k: "w" }>;
    expect(work.ref).toStrictEqual({ base: "6k", off: 7 }); // 12 + (-5)
  });
});

describe("effectiveSteps", () => {
  // F2 (6B contract): draftSteps'/effectiveSteps' filtered array is NOT
  // index-aligned with `nudges`/`spmOverrides`/`removed` once anything is
  // removed — the whole reason this function exists is so a caller never
  // has to re-derive "which original step was this" by counting positions
  // in the filtered array.
  it("pairs each surviving step with its ORIGINAL index, not its filtered position", () => {
    // Moonbow (w, r, w) — a three-step real workout, striking index 0.
    // (Hoarfrost held this role while every workout opened with a `wu`
    // step; since 2026-08-09's warmup setting it is only two steps long,
    // too short to tell "original index" from "filtered position" apart.)
    const d = buildDraft(draftInputFor("Moonbow", "id-moonbow-effective"));
    const mutated: SessionDraft = { ...d, removed: [0] };

    const effective = effectiveSteps(mutated);
    expect(effective).toHaveLength(d.steps.length - 1);
    // Position 0 in the filtered array is originally index 1 (the rest
    // row) — a caller that mistakenly used the filtered position as the
    // key into `nudges`/`spmOverrides` would silently address the wrong
    // step the moment anything upstream of it was removed.
    expect(effective[0]!.originalIndex).toBe(1);
    expect(effective[0]!.step.k).toBe("r");
    expect(effective[1]!.originalIndex).toBe(2);
    expect(effective[1]!.step.k).toBe("w");
  });

  it("agrees with draftSteps' own step values (same fold, just paired with the index)", () => {
    const d = buildDraft(
      draftInputFor("Hoarfrost", "id-hoarfrost-effective-2"),
    );
    const workIndex = d.steps.findIndex((s) => s.k === "w");
    const mutated: SessionDraft = { ...d, spmOverrides: { [workIndex]: 24 } };

    const effective = effectiveSteps(mutated);
    const plain = draftSteps(mutated);
    expect(effective.map((e) => e.step)).toStrictEqual(plain);
  });
});

describe("draftMinutes", () => {
  it("computes an exact pinned total for a distance workout (Calm Sea) given baselines", () => {
    const d = buildDraft(draftInputFor("Calm Sea", "id-calmsea-3"));
    // 10,000m @ 6k+12 = 132 s/500m -> 20 * 132 = 2640s -> 2640/60 = 44
    // exactly. (Was 52 while the workout also carried a wu 8' step; the
    // warm-up is a SETTING now and no workout contributes one.)
    expect(draftMinutes(d, baselines)).toBe(44);
  });

  it("returns null for a distance workout when baselines are absent", () => {
    const d = buildDraft(draftInputFor("Calm Sea", "id-calmsea-4"));
    expect(draftMinutes(d, null)).toBeNull();
  });

  it("also returns null for a TIME-based work step without baselines (any pace ref needs resolving)", () => {
    // Hoarfrost is time-based (not distance), but its work step still carries
    // a SplitRef that expand.ts's phases() resolves unconditionally via
    // resolveSplit(baselines, ref) regardless of duration kind - so it
    // crashes without baselines exactly like the distance case. The brief
    // frames the null case as "a distance step needs baselines"; the actual
    // domain code (domain/pace.ts resolveSplit/estimationSplit, domain/
    // expand.ts phases()) requires baselines for ANY "w" step, split or
    // effort ref, time or distance duration. This test pins that broader,
    // actually-correct rule.
    const d = buildDraft(draftInputFor("Hoarfrost", "id-hoarfrost-3"));
    expect(draftMinutes(d, null)).toBeNull();
  });

  // Phase 6I: `draftMinutes` was ALREADY null-tolerant for an effort-only
  // workout before this task — it returns null the moment ANY "w" step is
  // present and baselines are null, with no branch distinguishing effort
  // from split refs (an estimate is genuinely impossible either way; the
  // onboarding CARD's fixed nominal copy, not this function, is what
  // covers "never a bare dash" for the two designated workouts — Task 5).
  // Pinned here against a REAL effort-only library fixture (Fork
  // Lightning, needsBaselines() false) specifically because Task 2 is what
  // makes this path actually REACHABLE in production (the Confirm footer
  // used to block START before a rower's draft could ever render here with
  // null baselines) — no production code changed in this file for Task 2,
  // only this covering test.
  it("returns null for a REAL effort-only library workout too (Fork Lightning) — no different from any other work step without baselines", () => {
    const d = buildDraft(draftInputFor("Fork Lightning", "id-fork-null"));
    expect(draftMinutes(d, null)).toBeNull();
  });

  it("still computes minutes without baselines when no work step is present", () => {
    const d: SessionDraft = {
      v: 1,
      workoutId: "synthetic",
      title: "Rest only",
      type: "O2",
      // A lone REST row: the only remaining step kind that prices itself
      // with no pace ref to resolve. (This was a lone `wu` row until
      // 2026-08-09's warmup setting deleted that step kind; the property
      // under test — "no work step, so no baselines needed" — is the same.)
      steps: [{ k: "r", minutes: 5 }],
      nudges: {},
      spmOverrides: {},
      removed: [],
      createdAt: new Date().toISOString(),
      startedAt: null,
    };
    expect(draftMinutes(d, null)).toBe(5);
  });

  it("computes an exact pinned total for an effort-ref workout (Fork Lightning) given baselines", () => {
    const d = buildDraft(draftInputFor("Fork Lightning", "id-fork-lightning"));
    // reps(5) x [w1{30s work + 45s rest} + w2{30s work + 135s rest}]
    // = 5 * (30+45+30+135) = 5*240 = 1200s -> 1200/60 = 20 exactly.
    expect(draftMinutes(d, baselines)).toBe(20);
  });

  // F1 fix (final whole-branch review): draftMinutes used to price the
  // recount from the UN-nudged split — nudging a distance step's target
  // moved the resolved split shown on its own row but never touched the
  // Confirm footer's minute recount, because draftMinutes called
  // estimateMinutes over draftSteps(d) while draftSteps folded SPM
  // overrides but not nudges. (The reviewer's exact probe: nudging a
  // distance step's split should move its minute recount; instead it read
  // the same number before and after.) Pinned here with a nudge big enough
  // to actually change the recount, so a fix that folds the nudge in but
  // gets the sign or magnitude wrong would still fail this.
  it("prices a nudge into the recount for a distance workout (the exact case a prior version silently ignored)", () => {
    const d = buildDraft(draftInputFor("Calm Sea", "id-calmsea-priced"));
    const workIndex = d.steps.findIndex((s) => s.k === "w");
    // Unnudged: 10,000m @ 6k+12 = 132 s/500m -> 20*132 = 2640s ->
    // 2640/60 = 44 exactly (same pinned total as the earlier "exact pinned
    // total" test above — this test's whole point is the BEFORE/AFTER
    // delta, not a fresh number).
    expect(draftMinutes(d, baselines)).toBe(44);

    // -5s/500m nudge: split becomes 127 -> 20*127 = 2540s ->
    // round(2540/60) = 42. A version that ignores nudges would still
    // report 44 here.
    const nudged = withNudge(d, workIndex, -5);
    expect(draftMinutes(nudged, baselines)).toBe(42);
  });
});

describe("withNudge", () => {
  it("no-ops on an effort-ref work step (Fork Lightning)", () => {
    const d = buildDraft(
      draftInputFor("Fork Lightning", "id-fork-lightning-2"),
    );
    const workIndex = d.steps.findIndex((s) => s.k === "w");
    const result = withNudge(d, workIndex, 5);
    expect(result).toBe(d);
    expect(result.nudges).toStrictEqual({});
  });

  it("nudges a split-ref work step cumulatively (Meltemi)", () => {
    const d = buildDraft(draftInputFor("Calm Sea", "id-calmsea-5"));
    const workIndex = d.steps.findIndex((s) => s.k === "w");
    const once = withNudge(d, workIndex, 3);
    expect(once.nudges[workIndex]).toBe(3);
    const twice = withNudge(once, workIndex, -1);
    expect(twice.nudges[workIndex]).toBe(2);
  });

  it("no-ops on a non-work step index and on an out-of-range index", () => {
    // Moonbow's index 1 is a REST row — a real non-work step index, which
    // Calm Sea (a single work step) has none of. This test used to reach
    // for the `wu` row every workout carried before 2026-08-09's warmup
    // setting.
    const d = buildDraft(draftInputFor("Moonbow", "id-moonbow-6"));
    expect(d.steps[1]!.k).toBe("r");
    expect(withNudge(d, 1, 1)).toBe(d);
    expect(withNudge(d, 999, 1)).toBe(d);
  });
});

describe("startDraft", () => {
  it("startDraft stamps a real ISO startedAt", () => {
    const d = buildDraft(draftInputFor("Hoarfrost", "id-hoarfrost-start"));
    expect(d.startedAt).toBeNull();
    const started = startDraft(d);
    expect(started.startedAt).not.toBeNull();
    expect(new Date(started.startedAt!).toISOString()).toBe(started.startedAt);
  });

  it("touches no other field — the same 'one field' discipline the module's other pure mutators follow", () => {
    const d = buildDraft(draftInputFor("Hoarfrost", "id-hoarfrost-start-2"));
    const started = startDraft(d);
    expect(started).toStrictEqual({
      ...d,
      startedAt: started.startedAt,
    });
  });
});

// buildNudgedDraft moved here from workout/WorkoutDetail.tsx (fast-follow
// Task 4): the shared builder every rewired entry point uses now that
// ConfirmTargets — the screen that used to let a rower adjust targets AFTER
// committing to a draft — is gone.
describe("buildNudgedDraft", () => {
  it("bakes a cumulative nudge map into a fresh draft, matching a manual withNudge sequence", () => {
    const input = draftInputFor("Calm Sea", "id-nudged-1");
    const workIndex = LIBRARY_WORKOUTS.find(
      (w) => w.title === "Calm Sea",
    )!.steps.findIndex((s) => s.k === "w");

    const nudged = buildNudgedDraft(input, { [workIndex]: -5 });

    const manual = withNudge(buildDraft(input), workIndex, -5);
    // Different createdAt timestamps are the only expected difference — both
    // are built independently a moment apart.
    expect({ ...nudged, createdAt: "" }).toStrictEqual({
      ...manual,
      createdAt: "",
    });
  });

  it("refuses an effort-ref entry — the map may carry one, but withNudge is what drops it", () => {
    const heatLightning = library("Heat Lightning");
    const input = draftInputFor("Heat Lightning", "id-nudged-2");
    const repIndex = heatLightning.steps.findIndex((s) => s.k === "w");

    const draft = buildNudgedDraft(input, { [repIndex]: 3 });

    // Heat Lightning's own work step is an effort ref (`{effort:"max"}`) —
    // withNudge refuses to record a nudge against one, the same rule this
    // reuses verbatim.
    expect(draft.nudges).toStrictEqual({});
  });

  // Fix round 1 (I-2): the test above (previously named "applies every entry
  // in the map") passed only ONE key, against an effort-ref step — it proved
  // the REFUSAL, not the iteration. A `buildNudgedDraft` rewritten to apply
  // just the FIRST entry via a single `withNudge` call would have passed
  // every test in this describe block until now. Flat Calm (O2) is a REAL
  // two-work-step library workout, both split-ref (`6k+12`), so this is the
  // genuine multi-key case: two DIFFERENT nudges on two DIFFERENT original
  // indices, both landing.
  it("applies every entry in the map — two distinct nudges on two distinct steps both land at their own original index", () => {
    const flatCalm = library("Flat Calm");
    const input = draftInputFor("Flat Calm", "id-nudged-multi");
    const workIndices = flatCalm.steps
      .map((s, i) => (s.k === "w" ? i : null))
      .filter((i): i is number => i !== null);
    expect(workIndices).toHaveLength(2);
    const [first, second] = workIndices as [number, number];

    const draft = buildNudgedDraft(input, { [first]: -5, [second]: 3 });

    expect(draft.nudges).toStrictEqual({ [first]: -5, [second]: 3 });
    // Byte-equal to applying both deltas by hand — proves the loop doesn't
    // stop after the first entry AND doesn't let a later entry clobber an
    // earlier one.
    const manual = withNudge(
      withNudge(buildDraft(input), first, -5),
      second,
      3,
    );
    expect({ ...draft, createdAt: "" }).toStrictEqual({
      ...manual,
      createdAt: "",
    });
  });

  it("a zero-valued nudge entry is skipped, not recorded as a live no-op nudge", () => {
    const input = draftInputFor("Calm Sea", "id-nudged-3");
    const workIndex = LIBRARY_WORKOUTS.find(
      (w) => w.title === "Calm Sea",
    )!.steps.findIndex((s) => s.k === "w");

    const draft = buildNudgedDraft(input, { [workIndex]: 0 });

    expect(draft.nudges).toStrictEqual({});
  });

  it("an empty nudge map ({} — a caller with no preview surface) builds an un-nudged draft", () => {
    const input = draftInputFor("Calm Sea", "id-nudged-4");

    const draft = buildNudgedDraft(input, {});

    expect(draft.nudges).toStrictEqual({});
    expect(draft.steps).toStrictEqual(library("Calm Sea").steps);
  });
});

describe("saveDraft / loadDraft / clearDraft", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a Fork Lightning (effort step) draft byte-identical after mutation", () => {
    const d = buildDraft(
      draftInputFor("Fork Lightning", "id-fork-lightning-3"),
    );
    const workIndex = d.steps.findIndex((s) => s.k === "w");
    const nudged = withNudge(d, workIndex, 5); // no-op: effort ref
    const mutated: SessionDraft = {
      ...nudged,
      spmOverrides: { [workIndex]: 30 },
      // Strike the reps MARKER (index 0) — the removal this draft can
      // still make now that no workout opens with a warm-up step, and a
      // sharper one for a round trip: it changes the phase count of every
      // step after it.
      removed: [0],
    };
    expect(saveDraft(mutated)).toBe(true);
    const loaded = loadDraft();
    expect(loaded).toStrictEqual(mutated);
    expect(loaded!.nudges).toStrictEqual({});
    const effective = draftSteps(loaded!);
    expect(effective.some((s) => s.k === "reps")).toBe(false);
    // Unrepeated: w1{30s work + 45s rest} + w2{30s work + 135s rest} =
    // 240s -> 240/60 = 4 exactly (a fifth of the repeated 20).
    expect(draftMinutes(loaded!, baselines)).toBe(4);
  });

  it("round-trips a Calm Sea (distance) draft byte-identical with a nudge applied", () => {
    const d = buildDraft(draftInputFor("Calm Sea", "id-calmsea-7"));
    const workIndex = d.steps.findIndex((s) => s.k === "w");
    // -5, not -1: a -1 nudge (132 -> 131 s/500m) still rounds to the same
    // 44-minute total as unnudged (2620/60 = 43.67 -> 44), so it would pass
    // whether or not draftMinutes actually priced the nudge in — exactly
    // the gap the F1 fix ("prices a nudge into the recount…" test above)
    // was found through. -5 changes the total (44 -> 42), so this round
    // trip also proves the nudge survived storage AND still prices
    // correctly after a reload.
    const nudged = withNudge(d, workIndex, -5);
    expect(saveDraft(nudged)).toBe(true);
    const loaded = loadDraft();
    expect(loaded).toStrictEqual(nudged);
    expect(draftMinutes(loaded!, baselines)).toBe(42);
    expect(draftMinutes(loaded!, null)).toBeNull();
  });

  it("round-trips a Hoarfrost (reps marker) draft, keeping the marker live", () => {
    const d = buildDraft(draftInputFor("Hoarfrost", "id-hoarfrost-4"));
    expect(saveDraft(d)).toBe(true);
    const loaded = loadDraft();
    expect(loaded).toStrictEqual(d);
    const steps = draftSteps(loaded!);
    expect(steps.some((s) => s.k === "reps")).toBe(true);
    // 2 * (12' work + 5' rest) = 2040s -> 2040/60 = 34 exactly.
    expect(draftMinutes(loaded!, baselines)).toBe(34);
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
    const d = buildDraft(draftInputFor("Calm Sea", "id-calmsea-8"));
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
    const d = buildDraft(draftInputFor("Calm Sea", "id-calmsea-malformed"));
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ ...d, steps: {}, removed: {} }),
    );
    expect(loadDraft()).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("returns null for v:1 with nudges/spmOverrides as the wrong shape (an array, not a record)", () => {
    const d = buildDraft(draftInputFor("Calm Sea", "id-calmsea-malformed-2"));
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ ...d, nudges: [], spmOverrides: [] }),
    );
    expect(loadDraft()).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("returns null for v:1 with a non-string title", () => {
    const d = buildDraft(draftInputFor("Calm Sea", "id-calmsea-malformed-3"));
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, title: 42 }));
    expect(loadDraft()).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("clearDraft removes the stored draft", () => {
    const d = buildDraft(draftInputFor("Calm Sea", "id-calmsea-9"));
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
    const d = buildDraft(draftInputFor("Calm Sea", "id-calmsea-10"));
    expect(() => saveDraft(d)).not.toThrow();
    expect(saveDraft(d)).toBe(false);
    spy.mockRestore();
  });

  it("exposes the storage key used", () => {
    expect(DRAFT_KEY).toBe("ergomatic.sessionDraft");
  });
});

describe("loadDraft and a pre-2026-08-09 draft that still carries a `wu` step", () => {
  beforeEach(() => localStorage.clear());

  // PHASE WU deleted `stripLegacyWarmups` and the three cases that pinned
  // its mechanics (the splice itself, and the re-keying of
  // `nudges`/`spmOverrides`/`removed` around the hole). The claim that made
  // deleting it safe is that a surviving `wu` step is INERT, and this case
  // proves that claim rather than restating it: the draft loads, the step
  // is still there, and `buildRun` emits no phase for it because
  // `effectiveSteps` gates on `k !== "w"` and `phases()`'s switch has no
  // `wu` arm and no default. If either of those ever grows a `wu` path,
  // this goes red.
  //
  // No real seeded workout carries a `wu` step any more (2026-08-09's Task
  // 3 stripped all 302) — this hand-splices one onto a REAL library
  // workout's own steps, the exact shape a draft snapshotted into
  // localStorage before that date would still hold.
  function legacyDraftFor(title: string, id: string): SessionDraft {
    const d = buildDraft(draftInputFor(title, id));
    return {
      ...d,
      steps: [{ k: "wu", minutes: 8 } as unknown as Step, ...d.steps],
    };
  }

  it("loads it unchanged, produces no phase for it, and still attributes an index-keyed nudge ACROSS it", () => {
    // INDEX ATTRIBUTION ACROSS THE HOLE is the half that matters, and the
    // half the three deleted tests actually guarded. `stripLegacyWarmups`
    // spliced the `wu` step out and RE-KEYED `nudges`/`spmOverrides`/
    // `removed` around the gap; the claim that deleting it is safe is
    // really the claim that nothing needs re-keying, because nothing is
    // spliced. So this fixture keys both index-maps at position 1 — Calm
    // Sea's own work step, sitting BEHIND the `wu` step at position 0 —
    // and asserts the built phase carries them.
    const legacy = legacyDraftFor("Calm Sea", "id-legacy-1");
    const withState: SessionDraft = {
      ...legacy,
      nudges: { 1: -5 },
      spmOverrides: { 1: 24 },
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(withState));

    const draft = loadDraft();
    expect(draft).toStrictEqual(withState);
    expect(draft!.steps.some((st) => (st.k as string) === "wu")).toBe(true);

    // Calm Sea is a single 10000 m work step, so the ONLY phase this run
    // can have is that step's. A `wu` arm anywhere downstream would add a
    // second one.
    const run = buildRun(
      draft!,
      { k2Seconds: 100, k6Seconds: 120 },
      new Date(0),
    );
    expect(run.phases).toHaveLength(1);
    const phase = run.phases[0]!;
    expect(phase.meters).toBe(10000);
    // `originalIndex` is the DRAFT position, unshifted — 1, behind the
    // surviving `wu` step, not the 0 a splice would have re-keyed it to.
    expect(phase.originalIndex).toBe(1);
    // The nudge reached the target it was keyed against: Calm Sea is
    // 6k+12, so 120 + 12 − 5 = 127, not the un-nudged 132 a mis-keyed
    // fold would leave (`effectiveSteps` folds a nudge into `ref.off`).
    expect(phase.targetSplit).toBe(127);
    // …and so did the SPM override, the other index-keyed map: 24, not
    // Calm Sea's own authored 20.
    expect(phase.spm).toBe(24);
  });

  it("returns the exact same draft by value when there is nothing to strip", () => {
    const d = buildDraft(draftInputFor("Calm Sea", "id-clean-1"));
    saveDraft(d);

    const draft = loadDraft();
    expect(draft).toStrictEqual(d);
  });
});
