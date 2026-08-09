import { describe, expect, it } from "vitest";
import { phases as expandPhases, type Phase } from "../expand.js";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index.js";
import { compileProgram, type CompiledPhase } from "./program.js";

// Baselines used throughout: DESIGN_BASELINES from app/e2e/design.spec.ts
// (the screenshot suite's fixed pair), reused here for the same reason it's
// used there — deterministic, hand-checkable splits. Not imported directly
// (e2e is a different project/runtime); the value is copied and cited.
const BASELINES = { k2Seconds: 100, k6Seconds: 120 };

/** Adapts `domain/expand.ts`'s `Phase[]` (keyed by `originalStepIndex`) to
 *  `CompiledPhase[]` (keyed by `originalIndex`) — the same rename
 *  `src/session/engine.ts`'s `buildRun` performs when it produces the real
 *  `EnginePhase[]`. For these fixtures (no removed steps), the rename is
 *  the ENTIRE difference — `effectiveSteps`'s index resolution is identity
 *  when nothing has been removed, so this is a faithful stand-in without
 *  needing a `src/` import (`domain/` cannot import `src/`; the full
 *  `buildRun`-driven assembly is exercised separately, in the client
 *  project's 300-workout sweep, `app/src/monitor/program.sweep.test.ts`). */
function toCompiledPhases(raw: Phase[]): CompiledPhase[] {
  return raw.map(({ originalStepIndex, ...rest }) => ({
    ...rest,
    originalIndex: originalStepIndex,
  }));
}

function realWorkoutPhases(title: string): CompiledPhase[] {
  const workout = LIBRARY_WORKOUTS.find((w) => w.title === title);
  if (!workout) throw new Error(`fixture workout not found: ${title}`);
  return toCompiledPhases(expandPhases(workout.steps, BASELINES));
}

/** A minimal, valid time-based work phase — the filler used by the
 *  interval-count boundary tests, where the count matters and the exact
 *  content of each interval doesn't. */
function fillerWorkPhase(originalIndex: number): CompiledPhase {
  return {
    type: "work",
    targetKind: "split",
    targetSplit: 120,
    spm: 24,
    seconds: 30,
    originalIndex,
  };
}

describe("compileProgram: real-starter pinned tables", () => {
  // 2026-08-09 (the warmup setting): every table in this describe used to
  // open with a warm-up interval, because every seeded workout opened with
  // a `wu` step. `wu` left the `Step` union and the seeds were stripped, so
  // `expandPhases` — this file's only phase source — can no longer produce
  // a `type: "warmup"` phase at all (`domain/expand.ts`'s own comment where
  // `case "wu"` used to be). A warm-up is now the rower's SETTING,
  // prepended by `src/session/engine.ts`'s `buildRun`, which `domain/`
  // cannot import: the warm-up interval's own compilation is pinned
  // directly from hand-built phases in "the warm-up arm" below, and
  // end-to-end from the setting in `src/monitor/program.sweep.test.ts`.

  // TR "Beam Sea": 2000m continuous @ 2k+6, spm 24 (server/seed/library/
  // tr.ts). No rest anywhere — the simplest table there is, one plain
  // distance-kind interval.
  it("Beam Sea: a single distance interval, no rest", () => {
    const result = compileProgram(realWorkoutPhases("Beam Sea"));
    expect(result).toStrictEqual({
      intervals: [
        {
          kind: "distance",
          value: 2000,
          targetSplit: 106,
          displaySpm: 24,
          restSeconds: 0,
        },
      ],
    });
  });

  // TR "Tidal Bore": 5x[1' @ 2k+3 / 1' rest] (server/seed/library/tr.ts).
  // Pins ordinary single-rest-per-interval folding across a reps block:
  // each work phase's immediately-following rest phase merges onto it,
  // never bleeding onto a neighbor.
  it("Tidal Bore: reps block folds each rest onto its own interval", () => {
    const result = compileProgram(realWorkoutPhases("Tidal Bore"));
    const rep = {
      kind: "time" as const,
      value: 60,
      targetSplit: 103,
      displaySpm: 26,
      restSeconds: 60,
    };
    expect(result).toStrictEqual({
      intervals: [rep, rep, rep, rep, rep],
    });
  });

  // AN "Dry Microburst": 4 descending ALL-OUT reps (90/60/45/30s,
  // each with its own rest) (server/seed/library/an.ts). The named
  // "Microburst" real-starter test the brief calls for. This is the H8
  // pin: `estimationSplit` resolves every one of these effort phases to a
  // real number (100, `baselines.k2Seconds` for "max") that a naive
  // `targetSplit === undefined` check would let through as a hard target;
  // asserting `targetSplit: null` here fails against that bug even though
  // the input's `targetSplit` is never undefined.
  it("Dry Microburst: effort phases compile to null targetSplit despite a real estimated value on the input", () => {
    const input = realWorkoutPhases("Dry Microburst");
    expect(
      input.some(
        (p) => p.targetKind === "effort" && p.targetSplit !== undefined,
      ),
    ).toBe(true);
    const result = compileProgram(input);
    expect(result).toStrictEqual({
      intervals: [
        {
          kind: "time",
          value: 90,
          targetSplit: null,
          displaySpm: 30,
          restSeconds: 210,
        },
        {
          kind: "time",
          value: 60,
          targetSplit: null,
          displaySpm: 30,
          restSeconds: 180,
        },
        {
          kind: "time",
          value: 45,
          targetSplit: null,
          displaySpm: 32,
          restSeconds: 150,
        },
        {
          kind: "time",
          value: 30,
          targetSplit: null,
          displaySpm: 32,
          restSeconds: 135,
        },
      ],
    });
  });
});

// 2026-08-09's warmup-setting design §4: the warm-up phase reaches this
// compiler from `src/session/engine.ts`'s `buildRun` (the preference's one
// producer), never from a step. `domain/` cannot import `src/`, so the
// phases here are hand-built to the exact shape `warmupPhases` emits —
// `src/monitor/program.sweep.test.ts` runs the same assertion through the
// real `buildRun` so the two shapes cannot drift silently.
describe("compileProgram: the warm-up arm", () => {
  const work: CompiledPhase = {
    type: "work",
    targetKind: "split",
    targetSplit: 110,
    spm: 24,
    seconds: 120,
    originalIndex: 0,
  };

  it("compiles a TIME warm-up as interval 0 with no target and no rate", () => {
    const result = compileProgram([
      { type: "warmup", seconds: 600, originalIndex: -1 },
      work,
    ]);
    expect(result).toStrictEqual({
      intervals: [
        {
          kind: "time",
          value: 600,
          targetSplit: null,
          displaySpm: null,
          restSeconds: 0,
        },
        {
          kind: "time",
          value: 120,
          targetSplit: 110,
          displaySpm: 24,
          restSeconds: 0,
        },
      ],
    });
  });

  it("folds the setting's own trailing rest onto the warm-up interval", () => {
    const result = compileProgram([
      { type: "warmup", seconds: 600, originalIndex: -1 },
      { type: "rest", seconds: 90, originalIndex: -1 },
      work,
    ]);
    expect(result).toMatchObject({
      intervals: [{ value: 600, restSeconds: 90 }, { value: 120 }],
    });
  });

  it("never programs a DISTANCE warm-up's display estimate as a hard target", () => {
    // The phase carries a real `targetSplit` (the easy-band estimate the
    // phone needs to price `meters` at all — `domain/expand.ts`'s
    // `phaseSeconds` returns null without one) and NO `targetKind`, so
    // neither of the two older null-arms would catch it. Only the phase
    // TYPE does. Without the warmup arm this interval compiles with
    // `targetSplit: 140` and the PM5 is handed a pace the rower never
    // chose for the one interval that is meant to have none.
    const result = compileProgram([
      { type: "warmup", meters: 2000, targetSplit: 140, originalIndex: -1 },
      work,
    ]);
    expect(result).toStrictEqual({
      intervals: [
        {
          kind: "distance",
          value: 2000,
          targetSplit: null,
          displaySpm: null,
          restSeconds: 0,
        },
        {
          kind: "time",
          value: 120,
          targetSplit: 110,
          displaySpm: 24,
          restSeconds: 0,
        },
      ],
    });
  });
});

describe("compileProgram: rest folding (H7)", () => {
  it("a rest before any work interval is a leading-rest error", () => {
    const phases: CompiledPhase[] = [
      { type: "rest", seconds: 60, originalIndex: 0 },
      {
        type: "work",
        targetKind: "split",
        targetSplit: 110,
        seconds: 120,
        originalIndex: 1,
      },
    ];
    expect(compileProgram(phases)).toStrictEqual({
      code: "leading-rest",
      // M-8 (final-review): every CompileError.message pinned exactly, not
      // expect.any(String) — spec §1 requires copy-ready strings a screen
      // can show verbatim; "" would have passed every one of these 19
      // assertions before this fix.
      message:
        "This workout starts with rest before any work. The PM5 has no way to program a rest before the first interval.",
      phaseIndex: 0,
    });
  });

  it("consecutive rest phases SUM onto the preceding interval, not last-wins", () => {
    const phases: CompiledPhase[] = [
      {
        type: "work",
        targetKind: "split",
        targetSplit: 110,
        seconds: 120,
        originalIndex: 0,
      },
      { type: "rest", seconds: 60, originalIndex: 1 },
      { type: "rest", seconds: 45, originalIndex: 1 },
    ];
    expect(compileProgram(phases)).toStrictEqual({
      intervals: [
        {
          kind: "time",
          value: 120,
          targetSplit: 110,
          displaySpm: null,
          restSeconds: 105,
        },
      ],
    });
  });

  it("a warmup interval can absorb a following rest just like a work interval", () => {
    const phases: CompiledPhase[] = [
      { type: "warmup", seconds: 300, originalIndex: 0 },
      { type: "rest", seconds: 30, originalIndex: 0 },
    ];
    expect(compileProgram(phases)).toStrictEqual({
      intervals: [
        {
          kind: "time",
          value: 300,
          targetSplit: null,
          displaySpm: null,
          restSeconds: 30,
        },
      ],
    });
  });
});

describe("compileProgram: interval-too-short (Table 19, :20 / 100m)", () => {
  it("a :19 work phase is interval-too-short", () => {
    const phases: CompiledPhase[] = [
      {
        type: "work",
        targetKind: "split",
        targetSplit: 110,
        seconds: 19,
        originalIndex: 0,
      },
    ];
    expect(compileProgram(phases)).toStrictEqual({
      code: "interval-too-short",
      message: "An interval of 19s is shorter than the PM5's minimum of :20.",
      phaseIndex: 0,
    });
  });

  it("exactly :20 is the inclusive boundary — it compiles", () => {
    const phases: CompiledPhase[] = [
      {
        type: "work",
        targetKind: "split",
        targetSplit: 110,
        seconds: 20,
        originalIndex: 0,
      },
    ];
    const result = compileProgram(phases);
    expect("intervals" in result).toBe(true);
  });

  it("a 99m distance phase is interval-too-short", () => {
    const phases: CompiledPhase[] = [
      {
        type: "work",
        targetKind: "split",
        targetSplit: 110,
        meters: 99,
        originalIndex: 0,
      },
    ];
    expect(compileProgram(phases)).toStrictEqual({
      code: "interval-too-short",
      message: "An interval of 99m is shorter than the PM5's minimum of 100 m.",
      phaseIndex: 0,
    });
  });

  it("exactly 100m is the inclusive boundary — it compiles", () => {
    const phases: CompiledPhase[] = [
      {
        type: "work",
        targetKind: "split",
        targetSplit: 110,
        meters: 100,
        originalIndex: 0,
      },
    ];
    const result = compileProgram(phases);
    expect("intervals" in result).toBe(true);
  });
});

describe("compileProgram: rest-too-long (Table 19, 9:55 = 595s, not 10:00)", () => {
  it("a 9:56 (596s) rest is rest-too-long", () => {
    const phases: CompiledPhase[] = [
      {
        type: "work",
        targetKind: "split",
        targetSplit: 110,
        seconds: 120,
        originalIndex: 0,
      },
      { type: "rest", seconds: 596, originalIndex: 1 },
    ];
    expect(compileProgram(phases)).toStrictEqual({
      code: "rest-too-long",
      message: "A rest of 596s exceeds the PM5's maximum rest of 9:55.",
      phaseIndex: 1,
    });
  });

  it("exactly 9:55 (595s) is the inclusive boundary — it compiles", () => {
    const phases: CompiledPhase[] = [
      {
        type: "work",
        targetKind: "split",
        targetSplit: 110,
        seconds: 120,
        originalIndex: 0,
      },
      { type: "rest", seconds: 595, originalIndex: 1 },
    ];
    expect(compileProgram(phases)).toStrictEqual({
      intervals: [
        {
          kind: "time",
          value: 120,
          targetSplit: 110,
          displaySpm: null,
          restSeconds: 595,
        },
      ],
    });
  });

  it("two consecutive rests that only exceed the cap once SUMMED are still rest-too-long", () => {
    const phases: CompiledPhase[] = [
      {
        type: "work",
        targetKind: "split",
        targetSplit: 110,
        seconds: 120,
        originalIndex: 0,
      },
      { type: "rest", seconds: 300, originalIndex: 1 },
      { type: "rest", seconds: 300, originalIndex: 1 },
    ];
    expect(compileProgram(phases)).toStrictEqual({
      code: "rest-too-long",
      message: "A rest of 600s exceeds the PM5's maximum rest of 9:55.",
      phaseIndex: 2,
    });
  });
});

describe("compileProgram: too-many-intervals (Table 19, max 50)", () => {
  it("exactly 50 intervals compiles", () => {
    const phases = Array.from({ length: 50 }, (_, i) => fillerWorkPhase(i));
    const result = compileProgram(phases);
    expect("intervals" in result && result.intervals).toHaveLength(50);
  });

  it("51 intervals is too-many-intervals, named at the 51st", () => {
    const phases = Array.from({ length: 51 }, (_, i) => fillerWorkPhase(i));
    expect(compileProgram(phases)).toStrictEqual({
      code: "too-many-intervals",
      message:
        "This workout has more than 50 intervals. The PM5 supports at most 50.",
      phaseIndex: 50,
    });
  });
});

describe("compileProgram: no-work", () => {
  it("an empty phase list is no-work", () => {
    expect(compileProgram([])).toStrictEqual({
      code: "no-work",
      message: "This workout has no work intervals to program.",
      phaseIndex: null,
    });
  });
});

describe("compileProgram: unrepresentable-value (never silently rounded/clamped)", () => {
  it("an open-ended 'test' (all-out) phase has no fixed value to program", () => {
    // Verifies domain/expand.ts's actual output for k:"test" steps against
    // the design spec's assumption of "a single fixed interval" — phases()
    // gives a phase with NEITHER seconds NOR meters, not a fixed one. The
    // seeded 300 contain no k:"test" steps (survey confirmed), so this
    // fixture is the only coverage this branch gets.
    const testPhase = expandPhases(
      [{ k: "test", label: "2k Test" }],
      BASELINES,
    )[0]!;
    expect(testPhase.seconds).toBeUndefined();
    expect(testPhase.meters).toBeUndefined();

    const phases = toCompiledPhases([testPhase]);
    expect(compileProgram(phases)).toStrictEqual({
      code: "unrepresentable-value",
      message:
        "An open-ended (all-out/test) interval has no fixed time or distance. The PM5 requires one to program a workout.",
      phaseIndex: 0,
    });
  });

  it("a fractional-second work phase (genuinely fractional, not float noise) is unrepresentable", () => {
    const phases: CompiledPhase[] = [
      {
        type: "work",
        targetKind: "split",
        targetSplit: 110,
        seconds: 20.5,
        originalIndex: 0,
      },
    ];
    expect(compileProgram(phases)).toStrictEqual({
      code: "unrepresentable-value",
      message:
        "An interval of 20.5s isn't a whole second. The PM5 can't program it.",
      phaseIndex: 0,
    });
  });

  it("float noise within tolerance rounds (uses Math.round, not Math.floor)", () => {
    // 21 - 9e-7: within the 1e-6 tolerance of 21, so representable as 21.
    // Math.floor of this value is 20 — a floor-instead-of-round mutant
    // would compile this to a 20s interval instead of 21s.
    const raw = 21 - 9e-7;
    const phases: CompiledPhase[] = [
      {
        type: "work",
        targetKind: "split",
        targetSplit: 110,
        seconds: raw,
        originalIndex: 0,
      },
    ];
    expect(compileProgram(phases)).toStrictEqual({
      intervals: [
        {
          kind: "time",
          value: 21,
          targetSplit: 110,
          displaySpm: null,
          restSeconds: 0,
        },
      ],
    });
  });

  it("float noise ABOVE an integer also compiles to it (M-7: kills a Math.round -> Math.ceil mutant the 'below' fixtures above cannot)", () => {
    // Every existing fixture in this file (21-9e-7, 21-2e-6, 20.5, 1e-6) has
    // its noise BELOW an integer, where Math.round and Math.ceil AGREE
    // (both give 21 for 20.9999991) — a round->ceil mutant survives the
    // entire suite despite this module's own header comment naming the
    // REAL-WORLD case as noise ABOVE an integer
    // (`31/60*60 === 31.000000000000004`). 21+9e-7 is exactly that shape:
    // Math.round(21.0000009) is 21 (correct — nearest integer), but
    // Math.ceil(21.0000009) is 22 (rounds UP over the boundary it hasn't
    // reached), which then fails the epsilon check against the raw value
    // and wrongly reports unrepresentable-value instead of compiling.
    const raw = 21 + 9e-7;
    const phases: CompiledPhase[] = [
      {
        type: "work",
        targetKind: "split",
        targetSplit: 110,
        seconds: raw,
        originalIndex: 0,
      },
    ];
    expect(compileProgram(phases)).toStrictEqual({
      intervals: [
        {
          kind: "time",
          value: 21,
          targetSplit: 110,
          displaySpm: null,
          restSeconds: 0,
        },
      ],
    });
  });

  it("a value exactly AT the epsilon boundary is unrepresentable — strict <, matching validate.ts's wholeSecond exactly (Task 2 review, L1)", () => {
    // A rest of exactly 1e-6 seconds is the clean case: round(1e-6) is 0,
    // so the diff IS the epsilon constant itself, bit-for-bit (verified —
    // for a nonzero base, `(base + 1e-6) - base` lands a hair off 1e-6 in
    // either direction due to floating rounding, which would already fail
    // both `<` and `<=` and so wouldn't distinguish this fix from the bug).
    // If this were wrongly treated as representable, it would fold in as a
    // silent, meaningless 0s rest. `domain/validate.ts`'s `wholeSecond` uses
    // strict `<` and would refuse to save a value exactly this far from
    // whole; this compiler must refuse it too, not silently admit it.
    const phases: CompiledPhase[] = [
      {
        type: "work",
        targetKind: "split",
        targetSplit: 110,
        seconds: 120,
        originalIndex: 0,
      },
      { type: "rest", seconds: 1e-6, originalIndex: 1 },
    ];
    expect(compileProgram(phases)).toStrictEqual({
      code: "unrepresentable-value",
      message:
        "A rest of 0.000001s isn't a whole second. The PM5 can't program it.",
      phaseIndex: 1,
    });
  });

  it("float noise just OUTSIDE tolerance is unrepresentable, not silently rounded", () => {
    const raw = 21 - 2e-6;
    const phases: CompiledPhase[] = [
      {
        type: "work",
        targetKind: "split",
        targetSplit: 110,
        seconds: raw,
        originalIndex: 0,
      },
    ];
    expect(compileProgram(phases)).toStrictEqual({
      code: "unrepresentable-value",
      message:
        "An interval of 20.999998s isn't a whole second. The PM5 can't program it.",
      phaseIndex: 0,
    });
  });

  it("a non-integer distance value is unrepresentable, never rounded", () => {
    const phases: CompiledPhase[] = [
      {
        type: "work",
        targetKind: "split",
        targetSplit: 110,
        meters: 500.5,
        originalIndex: 0,
      },
    ];
    expect(compileProgram(phases)).toStrictEqual({
      code: "unrepresentable-value",
      message:
        "An interval of 500.5m isn't a whole meter. The PM5 can't program it.",
      phaseIndex: 0,
    });
  });

  it("a rest phase with no seconds at all is unrepresentable", () => {
    const phases: CompiledPhase[] = [
      {
        type: "work",
        targetKind: "split",
        targetSplit: 110,
        seconds: 120,
        originalIndex: 0,
      },
      { type: "rest", originalIndex: 1 },
    ];
    expect(compileProgram(phases)).toStrictEqual({
      code: "unrepresentable-value",
      message: "A rest phase has no duration to program.",
      phaseIndex: 1,
    });
  });

  it("a fractional rest is unrepresentable, never rounded", () => {
    const phases: CompiledPhase[] = [
      {
        type: "work",
        targetKind: "split",
        targetSplit: 110,
        seconds: 120,
        originalIndex: 0,
      },
      { type: "rest", seconds: 60.5, originalIndex: 1 },
    ];
    expect(compileProgram(phases)).toStrictEqual({
      code: "unrepresentable-value",
      message:
        "A rest of 60.5s isn't a whole second. The PM5 can't program it.",
      phaseIndex: 1,
    });
  });

  it("a rest of exactly 0 seconds compiles — Table 19's own documented minimum, not an error (L-9: kills a restSeconds < 0 -> <= 0 mutant)", () => {
    // Under a `< 0` -> `<= 0` mutant, a legal :00 rest (Table 19's own
    // documented minimum, §8) would be wrongly rejected as negative — no
    // fixture anywhere else in this file uses a 0-second rest (none can
    // arise from the seeds either: `expand.ts`'s auto-rest only fires when
    // `restMinutes` is truthy), so this is the one fixture that
    // distinguishes the two.
    const phases: CompiledPhase[] = [
      {
        type: "work",
        targetKind: "split",
        targetSplit: 110,
        seconds: 120,
        originalIndex: 0,
      },
      { type: "rest", seconds: 0, originalIndex: 1 },
    ];
    expect(compileProgram(phases)).toStrictEqual({
      intervals: [
        {
          kind: "time",
          value: 120,
          targetSplit: 110,
          displaySpm: null,
          restSeconds: 0,
        },
      ],
    });
  });
});

describe("compileProgram: negative rest is guarded (Table 19's :00 minimum, Task 2 review L2)", () => {
  it("a rest of -60s (representable, but negative) is rejected, not silently folded through", () => {
    // A rest phase attached to a real preceding interval — not a leading
    // rest, which would be caught earlier and for a different reason.
    // Before this fix, a negative rest folded straight through into
    // ProgramInterval.restSeconds with no guard at all; Task 3 encodes that
    // field onto the wire, so a negative value must never reach it.
    const phases: CompiledPhase[] = [
      {
        type: "work",
        targetKind: "split",
        targetSplit: 110,
        seconds: 120,
        originalIndex: 0,
      },
      { type: "rest", seconds: -60, originalIndex: 1 },
    ];
    expect(compileProgram(phases)).toStrictEqual({
      code: "unrepresentable-value",
      message: "A rest of -60s is negative. The PM5's minimum rest is :00.",
      phaseIndex: 1,
    });
  });

  it("a negative rest folding onto an ALREADY-nonzero rest is also rejected — not just the first rest in a chain", () => {
    // Order matters (Task 2 review round 2, item 1): a valid rest FIRST
    // (so `previous.restSeconds` is already 10, not 0) before the negative
    // one arrives. A guard mutated to fire only when
    // `previous.restSeconds === 0` (i.e. only the first rest in a fold
    // chain) PASSES both this describe block's tests if the negative rest
    // sits at the chain head in either — the reviewer proved this exact
    // shape (valid rest, THEN a negative one) is the one that kills that
    // mutant: under it, a combined restSeconds of -20 slips through
    // silently instead of erroring. The previous version of this test put
    // -30 first, which is indistinguishable from the single-rest test
    // above under that mutant.
    const phases: CompiledPhase[] = [
      {
        type: "work",
        targetKind: "split",
        targetSplit: 110,
        seconds: 120,
        originalIndex: 0,
      },
      { type: "rest", seconds: 10, originalIndex: 1 },
      { type: "rest", seconds: -30, originalIndex: 1 },
    ];
    expect(compileProgram(phases)).toStrictEqual({
      code: "unrepresentable-value",
      message: "A rest of -30s is negative. The PM5's minimum rest is :00.",
      phaseIndex: 2,
    });
  });
});

describe("compileProgram: effort discriminant (H8), isolated", () => {
  it("targetKind === 'effort' nulls targetSplit even when a real estimate is present", () => {
    const phases: CompiledPhase[] = [
      {
        type: "work",
        targetKind: "effort",
        targetSplit: 87,
        spm: 30,
        seconds: 30,
        originalIndex: 0,
      },
    ];
    expect(compileProgram(phases)).toStrictEqual({
      intervals: [
        {
          kind: "time",
          value: 30,
          targetSplit: null,
          displaySpm: 30,
          restSeconds: 0,
        },
      ],
    });
  });

  it("targetKind === 'split' passes targetSplit through", () => {
    const phases: CompiledPhase[] = [
      {
        type: "work",
        targetKind: "split",
        targetSplit: 87,
        spm: 30,
        seconds: 30,
        originalIndex: 0,
      },
    ];
    expect(compileProgram(phases)).toStrictEqual({
      intervals: [
        {
          kind: "time",
          value: 30,
          targetSplit: 87,
          displaySpm: 30,
          restSeconds: 0,
        },
      ],
    });
  });
});

describe("compileProgram: targetSplit representability (M-9, final-review)", () => {
  // Realistic fixture (briefing rule): `domain/pace.ts`'s `resolveSplit` can
  // genuinely produce a fractional split (a baseline + an arbitrary
  // `2k+1.5`-style offset + a session-only preview nudge), unlike
  // duration/rest, which only ever carry whole seconds by construction —
  // this is the one path that reaches this compiler with a fractional
  // number in `targetSplit`.
  it("a half-second targetSplit (a real 2k+1.5-style offset) is representable: pace's wire unit is 0.01s (§12's worked example), not whole seconds", () => {
    // The PR #59 hardware-walk regression: M-9 as first shipped copied
    // duration's whole-second contract onto pace and refused 2:14.5-style
    // splits, which baseline-derived targets produce for MOST of the
    // library. SET_TARGETPACETIME is 0.01 sec/lsb, so 106.5 s is the
    // integer 10650 on the wire.
    const phases: CompiledPhase[] = [
      {
        type: "work",
        targetKind: "split",
        targetSplit: 106.5,
        seconds: 120,
        originalIndex: 0,
      },
    ];
    expect(compileProgram(phases)).toStrictEqual({
      intervals: [
        {
          kind: "time",
          value: 120,
          targetSplit: 106.5,
          displaySpm: null,
          restSeconds: 0,
        },
      ],
    });
  });

  it("a genuinely sub-hundredth targetSplit is unrepresentable, never silently truncated onto the wire", () => {
    const phases: CompiledPhase[] = [
      {
        type: "work",
        targetKind: "split",
        targetSplit: 106.505,
        seconds: 120,
        originalIndex: 0,
      },
    ];
    expect(compileProgram(phases)).toStrictEqual({
      code: "unrepresentable-value",
      message:
        "A target pace of 106.505s/500m isn't representable in hundredths of a second. The PM5 programs pace in 0.01s steps.",
      phaseIndex: 0,
    });
  });

  it("float noise on targetSplit within tolerance still rounds (representableCentiseconds keeps representableSeconds's SECONDS-measured epsilon)", () => {
    const phases: CompiledPhase[] = [
      {
        type: "work",
        targetKind: "split",
        targetSplit: 106 - 9e-7,
        seconds: 120,
        originalIndex: 0,
      },
    ];
    expect(compileProgram(phases)).toStrictEqual({
      intervals: [
        {
          kind: "time",
          value: 120,
          targetSplit: 106,
          displaySpm: null,
          restSeconds: 0,
        },
      ],
    });
  });

  it("an 'effort' phase's fractional targetSplit is never even checked — it nulls out before representability matters", () => {
    // Guards against a naive "always validate targetSplit" implementation
    // that would reject a display-only ESTIMATE (domain/pace.ts's
    // estimationSplit, which can itself be fractional) even though H8 says
    // it never reaches the wire at all.
    const phases: CompiledPhase[] = [
      {
        type: "work",
        targetKind: "effort",
        targetSplit: 100.7,
        seconds: 30,
        originalIndex: 0,
      },
    ];
    expect(compileProgram(phases)).toStrictEqual({
      intervals: [
        {
          kind: "time",
          value: 30,
          targetSplit: null,
          displaySpm: null,
          restSeconds: 0,
        },
      ],
    });
  });
});
