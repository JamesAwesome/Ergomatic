import { describe, it, expect } from "vitest";
import { estimateMinutes, liveSteps, phases, phaseSeconds } from "./expand.js";
import { distanceRepeats, intervalLadder } from "./fixtures.js";
import type { Baselines, Step } from "./types.js";

const B = { k2Seconds: 112, k6Seconds: 122 };

describe("liveSteps", () => {
  it("repeats post-marker steps count times", () => {
    expect(liveSteps(intervalLadder.steps)).toHaveLength(1 + 4 * 6);
  });
  it("is identity without a marker", () => {
    const steps = [{ k: "r" as const, minutes: 5 }, intervalLadder.steps[2]];
    expect(liveSteps(steps)).toStrictEqual(steps);
  });
});

describe("phases", () => {
  it("expands the interval ladder to 25 phases / 50 minutes", () => {
    const p = phases(intervalLadder.steps, B);
    expect(p).toHaveLength(25);
    const totalSeconds = p.reduce((s, ph) => s + (ph.seconds ?? 0), 0);
    expect(totalSeconds).toBe(50 * 60);
  });
  it("inserts a rest phase after attached-rest work steps", () => {
    const p = phases(distanceRepeats.steps, B);
    // lead-in "r" + 5 × (work-distance + rest)
    expect(p).toHaveLength(1 + 10);
    expect(p[1]).toMatchObject({
      type: "work",
      meters: 2500,
      targetSplit: 108,
    });
    expect(p[2]).toMatchObject({ type: "rest", seconds: 300 });
  });
  it("labels non-work phases with words, never a bare dash", () => {
    const p = phases(intervalLadder.steps, B);
    expect(p[0].label).toBe("Rest");
    expect(p.at(-1)!.label).toBe("Rest");
  });
  it("marks set membership on repeated steps", () => {
    const p = phases(intervalLadder.steps, B);
    expect(p[1].set).toStrictEqual({ index: 1, of: 4 });
    expect(p.at(-1)!.set).toStrictEqual({ index: 4, of: 4 });
  });
  it("expands a test step to an 'All out' phase with no timing fields", () => {
    const steps = [
      { k: "r" as const, minutes: 5 },
      { k: "test" as const, label: "2k test" },
    ];
    const p = phases(steps, B);
    expect(p).toHaveLength(2);
    expect(p[1]).toStrictEqual({
      type: "test",
      label: "All out",
      set: undefined,
      originalStepIndex: 1,
    });
  });

  it("attributes the same originalStepIndex to every repeated occurrence of a reps block (interval ladder: 5 work + 1 rest, x4)", () => {
    const p = phases(intervalLadder.steps, B);
    expect(p[0]!.originalStepIndex).toBe(0); // the lead-in rest, index 0
    // Steps 2..7 (5 w's + 1 r) form the repeated block; every one of the 4
    // cycles must attribute back to those SAME original indices, not to
    // four distinct sets of indices.
    const cycle1 = p.slice(1, 7).map((ph) => ph.originalStepIndex);
    const cycle4 = p.slice(19, 25).map((ph) => ph.originalStepIndex);
    expect(cycle1).toStrictEqual([2, 3, 4, 5, 6, 7]);
    expect(cycle4).toStrictEqual([2, 3, 4, 5, 6, 7]);
  });

  it("shares one originalStepIndex between a work phase and its auto-inserted rest (distance repeats)", () => {
    const p = phases(distanceRepeats.steps, B);
    expect(p[1]!.originalStepIndex).toBe(2); // the "w" step, index 2
    expect(p[2]!.originalStepIndex).toBe(2); // its auto-inserted rest — SAME step
  });

  // Phase 6B Task 1 review, F1: a caller-side reimplementation of this same
  // reps-expansion (6B's session engine, before this fix) tested
  // `restMinutes !== undefined` while this function tests truthiness
  // (`if (s.restMinutes)` below) — a stale/hand-edited draft with
  // `restMinutes: 0` (unreachable via validateSteps, but `SessionDraft`'s
  // own loose load-time validation admits it) made the two expansions
  // disagree on phase COUNT, silently shifting every later
  // `originalStepIndex`. Fixed by having ONLY this function decide phase
  // count and stamp attribution in the same pass — this pins the exact
  // `restMinutes: 0` case at the source of truth instead of in a caller.
  it("does not insert a rest phase for restMinutes: 0 (falsy, not just absent) and does not shift later attribution", () => {
    const steps: Step[] = [
      { k: "r", minutes: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "6k", off: 0 },
        restMinutes: 0,
      },
      { k: "r", minutes: 2 },
    ];
    const p = phases(steps, B);
    expect(p.map((ph) => ph.type)).toStrictEqual(["rest", "work", "rest"]);
    expect(p[2]!.originalStepIndex).toBe(2); // the authored "r" step, not shifted
  });

  it("marks an effort work phase and labels it with the effort word", () => {
    const phases_ = phases(
      [
        {
          k: "w",
          duration: { kind: "time", minutes: 0.5 },
          ref: { effort: "max" },
          spm: 32,
        },
      ],
      { k2Seconds: 112, k6Seconds: 122 },
    );
    expect(phases_[0]).toMatchObject({
      type: "work",
      targetKind: "effort",
      targetSplit: 112, // estimationSplit(max) — scheduling only, never shown
      label: "ALL OUT",
      spm: 32,
    });
  });

  it("marks split work phases targetKind split, with an EXACT label — no tolerance band (ui-fix round, Item 1)", () => {
    const ref = { base: "6k" as const, off: -2 };
    const phases_ = phases(
      [
        {
          k: "w",
          duration: { kind: "time", minutes: 1 },
          ref,
        },
      ],
      { k2Seconds: 112, k6Seconds: 122 },
    );
    expect(phases_[0]).toMatchObject({
      targetKind: "split",
      targetSplit: 120,
      ref,
    });
    // Exact — never a "lo–hi" band.
    expect(phases_[0]!.label).toBe("2:00.0");
    expect(phases_[0]!.label).not.toContain("–");
  });

  it("a split work phase carries no ref when the target is an effort (5G rule: an effort target is a word, never a number to trace a ref for)", () => {
    const phases_ = phases(
      [
        {
          k: "w",
          duration: { kind: "time", minutes: 0.5 },
          ref: { effort: "max" },
        },
      ],
      { k2Seconds: 112, k6Seconds: 122 },
    );
    expect(phases_[0]!.targetKind).toBe("effort");
    expect(phases_[0]!.ref).toBeUndefined();
  });
});

describe("estimateMinutes", () => {
  it("sums exact time workouts without the estimated flag", () => {
    expect(estimateMinutes(intervalLadder.steps, B)).toStrictEqual({
      minutes: 50,
      estimated: false,
    });
  });
  it("estimates distance steps at resolved pace and flags it", () => {
    const r = estimateMinutes(distanceRepeats.steps, B);
    // 2500m at 108 s/500m = 540 s = 9 min per rep; 5 reps × (9 + 5 rest) + 10 lead-in rest = 80
    expect(r.estimated).toBe(true);
    expect(r.minutes).toBe(80);
  });
  it("ignores test-step phases (no seconds/meters) when summing duration", () => {
    const steps = [
      { k: "r" as const, minutes: 5 },
      { k: "test" as const, label: "2k test" },
    ];
    expect(estimateMinutes(steps, B)).toStrictEqual({
      minutes: 5,
      estimated: false,
    });
  });

  it("estimates a distance-at-max step's minutes from the 2k baseline", () => {
    const mins = estimateMinutes(
      [
        {
          k: "w",
          duration: { kind: "distance", meters: 500 },
          ref: { effort: "max" },
        },
      ],
      { k2Seconds: 112, k6Seconds: 122 },
    );
    expect(mins.minutes).toBe(Math.round(((500 / 500) * 112) / 60));
  });
});

// Phase 6I Task 1: the no-baseline onboarding path. `phases()` accepts
// `Baselines | null`; with null, an effort-ref work phase resolves (no
// number, no crash) while a split-ref work phase is a programmer error —
// callers must gate on `needsBaselines()` first. Rest phases never touched
// baselines to begin with (see `phases()`'s "r" case above: fixed minutes,
// fixed "Rest" word), so the null path changes nothing about them — pinned
// here rather than assumed. (Before 2026-08-09 the same held for "wu"'s
// fixed "Easy" word; that case left `phases()` with the Step union member —
// see the warmup-setting spec, §6.)
describe("phases with null baselines (Phase 6I: no-baseline onboarding)", () => {
  // The First-6k shape (design spec): one 6000m distance work step at an
  // effort ref. Pre-2026-08-09 this fixture also carried a leading
  // `{ k: "wu", minutes: 10 }` step, matching the real designated
  // workout's shape at the time; the warmup-setting spec strips that step
  // from every seed (Task 3) and from the Step union itself, so the
  // fixture now matches the workout's POST-strip shape instead — a single
  // work step, no lead-in of any kind.
  const firstSixK: Step[] = [
    {
      k: "w",
      duration: { kind: "distance", meters: 6000 },
      ref: { effort: "min" },
    },
  ];

  it("expands to one effort work phase, with no targetSplit and no seconds estimate", () => {
    const p = phases(firstSixK, null);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({
      type: "work",
      targetKind: "effort",
      meters: 6000,
      label: "EASY", // effortWord("min") — the word, never a number
    });
    expect(p[0]!.targetSplit).toBeUndefined();
    // No targetSplit means phaseSeconds (the estimate builder) can't price
    // this phase either — the "no duration estimate" half of the rule.
    expect(phaseSeconds(p[0]!)).toBeNull();
  });

  it("renders rest-step words unaffected by null baselines (they never read baselines)", () => {
    const steps: Step[] = [
      { k: "r", minutes: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { effort: "max" },
        restMinutes: 2,
      },
    ];
    const p = phases(steps, null);
    expect(p[0]).toMatchObject({ type: "rest", label: "Rest" });
    expect(p.at(-1)).toMatchObject({
      type: "rest",
      label: "Rest",
      seconds: 120,
    });
  });

  it("throws when a split-ref work step reaches phases(null) — programmer error, callers gate on needsBaselines() first", () => {
    const steps: Step[] = [
      { k: "r", minutes: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: 0 },
      },
    ];
    expect(() => phases(steps, null)).toThrow(/baselines/i);
  });

  it("existing concrete-baseline callers are untouched (same fixture as the top-level describe, byte-identical result)", () => {
    expect(phases(intervalLadder.steps, B)).toStrictEqual(
      phases(intervalLadder.steps, B),
    );
    expect(phases(intervalLadder.steps, B)[1]).toMatchObject({
      targetKind: "split",
      targetSplit: 122,
    });
  });
});

describe("estimateMinutes with null baselines (Phase 6I: no-baseline onboarding)", () => {
  // Post-strip First-6k shape — see the note on the same-named fixture
  // above: no lead-in step of any kind since 2026-08-09.
  const firstSixK: Step[] = [
    {
      k: "w",
      duration: { kind: "distance", meters: 6000 },
      ref: { effort: "min" },
    },
  ];
  const splitRefSteps: Step[] = [
    { k: "r", minutes: 5 },
    {
      k: "w",
      duration: { kind: "time", minutes: 5 },
      ref: { base: "6k", off: 0 },
    },
  ];

  it("returns null for an effort-only workout rather than a partial/misleading number", () => {
    expect(estimateMinutes(firstSixK, null)).toBeNull();
  });

  // 2026-08-08 review fix: the null branch used to short-circuit BEFORE
  // ever looking at `steps`, so a split-ref workout under null baselines
  // (a programmer error — the caller forgot to gate on needsBaselines())
  // silently read as "no estimate" instead of the same loud throw
  // `phases()`/`estimationSplit` already give that exact misuse.
  it("throws for a split-ref workout under null baselines — the same programmer-error guard as phases()/estimationSplit", () => {
    expect(() => estimateMinutes(splitRefSteps, null)).toThrow(/baselines/i);
  });

  // 2026-08-08 review fix: the reviewer's live tsc compile proved the old
  // two-overload shape ("Baselines" / bare "null") rejected a caller
  // holding a `Baselines | null`-typed VARIABLE ("No overload matches
  // this call") — neither overload's parameter type is a superset of the
  // union. This is a type-level assertion: the test's mere existence
  // typechecking is half the proof; the runtime behavior on both branches
  // (already covered above/elsewhere) is the other half.
  it("accepts a Baselines | null-typed variable directly (type-level proof: this must typecheck)", () => {
    function pickBaselines(useReal: boolean): Baselines | null {
      return useReal ? { k2Seconds: 112, k6Seconds: 122 } : null;
    }
    const nullable: Baselines | null = pickBaselines(false);
    expect(estimateMinutes(firstSixK, nullable)).toBeNull();

    const realNullable: Baselines | null = pickBaselines(true);
    expect(estimateMinutes(splitRefSteps, realNullable)).toStrictEqual({
      minutes: 10, // r 5' + w 5' — both time-based, no estimate
      estimated: false,
    });
  });
});

// Spec §8's property test: since "wu" left the Step union (2026-08-09, the
// warmup-setting spec), `phases()` has no case left that can EVER emit a
// `type: "warmup"` Phase from a Step[] input — the ONLY producer left is
// `buildRun` (engine.ts), prepending a phase straight from the preference,
// never through this function. Exercised against a realistic spread of
// step shapes (every surviving kind, mixed refs, reps blocks, distance and
// time durations) rather than one hand-picked case.
describe("no Step[] input can produce a warmup phase (spec §8)", () => {
  const LIBRARY_LIKE_FIXTURES: Step[][] = [
    intervalLadder.steps,
    distanceRepeats.steps,
    [{ k: "test", label: "2k test" }],
    [
      {
        k: "w",
        duration: { kind: "time", minutes: 20 },
        ref: { effort: "min" },
      },
      { k: "r", minutes: 3 },
    ],
    [
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { effort: "max" },
      },
      { k: "r", minutes: 2 },
    ],
    [
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "6k", off: -2 },
      },
    ],
  ];

  it("no Step[] input can produce a warmup phase anymore", () => {
    for (const steps of LIBRARY_LIKE_FIXTURES) {
      expect(phases(steps, B).some((p) => p.type === "warmup")).toBe(false);
    }
  });
});

describe("phaseSeconds", () => {
  it("returns a time phase's fixed seconds", () => {
    expect(phaseSeconds({ seconds: 300 })).toBe(300);
  });

  it("estimates a distance phase's seconds from meters and targetSplit — (meters / 500) * targetSplit", () => {
    expect(phaseSeconds({ meters: 2000, targetSplit: 120 })).toBe(480); // (2000 / 500) * 120
  });

  it("returns null for a phase with neither seconds nor a resolved meters/targetSplit pair (an open-ended test phase)", () => {
    expect(phaseSeconds({})).toBeNull();
  });

  it("also works against a real phases() output, not just a hand-built shape (real-fixture parity)", () => {
    const p = phases(distanceRepeats.steps, B);
    expect(phaseSeconds(p[0]!)).toBe(600); // the 10' lead-in rest step
    expect(phaseSeconds(p[1]!)).toBe(540); // 2500m @ 108 s/500m -> 5*108
  });
});
