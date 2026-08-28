import { describe, it, expect } from "vitest";
import { estimateMinutes } from "../../../domain/expand.js";
import type {
  Difficulty,
  PaceBase,
  WorkoutType,
} from "../../../domain/types.js";
import { validateWorkoutInput } from "../../../domain/validate.js";
import patterns from "../../../domain/generation/patterns.json";
import { debtRegressions } from "../../../scripts/library-balance.js";
import { LIBRARY_WORKOUTS } from "./index.js";

// Reference baselines for banding (splits, s/500m) — the values the retired
// starter.test.ts used. Nominal: they only band, they never ship.
const BASELINES = { k2Seconds: 112, k6Seconds: 122 };

type Band = "<20" | "20-30" | "30-45" | "45-60" | "60+";
const band = (m: number): Band =>
  m < 20
    ? "<20"
    : m < 30
      ? "20-30"
      : m < 45
        ? "30-45"
        : m < 60
          ? "45-60"
          : "60+";

// THE TARGET GRID IS NOT DUPLICATED HERE ANY MORE. It used to be: this file
// kept its own copy (the measured post-strip reality) and a comment saying
// the divergence from `scripts/library-balance.ts`'s TARGET was deliberate.
// The 2026-08-10 library-rebalance spec (§2) made `patterns.json`'s new
// `targets` block the single source, and the balance script and this gate
// both read it. Change the grid in one place and both move.
const TARGETS = patterns.targets as Record<WorkoutType, Record<Band, number>>;

// What the CONTENT still owed that target when this branch started, cell by
// cell — a FROZEN BASELINE, never edited again. The warmup-setting spec
// (Task 3, 2026-08-09) deleted the 302 `{ k: "wu", ... }` seed lines — the
// same content, 4-20 fewer minutes each — and a meaningful slice of the
// library crossed a band boundary downward; the 2026-08-10 library-
// rebalance (below) is the answer, and its content tasks have since landed
// (93 retunes + 11 replacements; every cell measures exactly onto TARGETS,
// 0 debt). This table stays frozen at its non-zero starting values — that
// is the point of a ratchet baseline — even though today's live debt is
// zero everywhere.
//
// The gate below is a RATCHET against this table, not an equality against a
// hand-maintained copy of reality (block review §7): the previous form
// asserted `measured === target + OUTSTANDING`, which cannot tell content
// landing on target from content landing in the WRONG band with the
// constant edited to match — the per-type sum and the nets-to-zero property
// both survive a compensating ∓1 pair. Measuring the debt live and holding
// each cell's |debt| non-increasing means a mis-landing fails on its own,
// and the phase's end state (all zeros) becomes a property rather than a
// promise. Rows still sum 90/75/75/60 = 300 — no workout moves TYPE.
const DEBT_BASELINE: Record<WorkoutType, Record<Band, number>> = {
  O2: { "<20": 7, "20-30": 1, "30-45": 1, "45-60": -5, "60+": -4 },
  AT: { "<20": 8, "20-30": 7, "30-45": -6, "45-60": -9, "60+": 0 },
  TR: { "<20": 9, "20-30": 3, "30-45": -10, "45-60": 0, "60+": -2 },
  AN: { "<20": 18, "20-30": -2, "30-45": -8, "45-60": -6, "60+": -2 },
};

// Authoring bands from the starter library's conventions (starter.ts header).
// O2 widened at James's review (2026-08-03): mode 22, with 18 and 26
// reserved for ladder extremes. Guidance on when to use the extremes lives
// with the authors, not here — this gate only checks the bounds.
const SPM: Record<WorkoutType, [number, number]> = {
  O2: [18, 26],
  AT: [22, 26],
  TR: [24, 28],
  AN: [26, 32],
};
const PAIN_BY_DIFF: Record<Difficulty, [number, number]> = {
  easy: [1, 2],
  medium: [2, 4],
  hard: [4, 5],
};
const PAIN_BY_TYPE: Record<WorkoutType, [number, number]> = {
  O2: [1, 3],
  AT: [2, 4],
  TR: [2, 5],
  AN: [3, 5],
};

describe("LIBRARY_WORKOUTS", () => {
  it("has exactly 300 workouts with contiguous sortOrder", () => {
    expect(LIBRARY_WORKOUTS).toHaveLength(300);
    LIBRARY_WORKOUTS.forEach((w, i) => expect(w.sortOrder).toBe(i + 1));
  });

  it("every entry passes validateWorkoutInput", () => {
    for (const w of LIBRARY_WORKOUTS) {
      const r = validateWorkoutInput(w);
      expect(r.ok, `${w.title}: ${r.ok ? "" : r.errors.join("; ")}`).toBe(true);
    }
  });

  it("titles are unique", () => {
    expect(new Set(LIBRARY_WORKOUTS.map((w) => w.title)).size).toBe(300);
  });

  it("every cell's distance from the target grid is non-increasing (the rebalance ratchet)", () => {
    const got: Record<string, number> = {};
    for (const w of LIBRARY_WORKOUTS) {
      const { minutes } = estimateMinutes(w.steps, BASELINES);
      const key = `${w.type}|${band(minutes)}`;
      got[key] = (got[key] ?? 0) + 1;
    }
    expect(debtRegressions(got, TARGETS, DEBT_BASELINE)).toStrictEqual([]);
  });

  it("targets sum to 300 across 90/75/75/60, and the measured debt nets out per type", () => {
    // Two properties the rebalance cannot break without noticing: the grid
    // is still the same library (no workout changes TYPE), and the debt is
    // a redistribution within each type, never a change to its size.
    const got: Record<string, number> = {};
    for (const w of LIBRARY_WORKOUTS) {
      const { minutes } = estimateMinutes(w.steps, BASELINES);
      const key = `${w.type}|${band(minutes)}`;
      got[key] = (got[key] ?? 0) + 1;
    }
    const perType: Record<string, number> = { O2: 90, AT: 75, TR: 75, AN: 60 };
    for (const [type, bands] of Object.entries(TARGETS)) {
      const sum = Object.values(bands).reduce((a, b) => a + b, 0);
      expect(sum, `${type} targets`).toBe(perType[type]);
      const debt = Object.entries(bands).reduce(
        (a, [b, target]) => a + ((got[`${type}|${b}`] ?? 0) - target),
        0,
      );
      expect(debt, `${type} debt`).toBe(0);
      const owed = Object.values(DEBT_BASELINE[type as WorkoutType]).reduce(
        (a, b) => a + b,
        0,
      );
      expect(owed, `${type} baseline`).toBe(0);
    }
  });

  it("the frozen baseline still says 108 — the phase closed by moving content, not by editing this table", () => {
    // The rebalance's exit condition (§8) is met: live debt is zero in all
    // 20 cells, pinned by library-balance.test.ts's ACCEPTANCE test. This
    // pin guards the other half of the ratchet: the STARTING debt stays
    // frozen at its measured 108, so nobody can retroactively shrink what
    // the phase owed.
    const outstanding = Object.values(DEBT_BASELINE)
      .flatMap((row) => Object.values(row))
      .reduce((a, b) => a + Math.abs(b), 0);
    expect(outstanding).toBe(108);
  });

  it("keeps every work step's spm inside its type's band", () => {
    for (const w of LIBRARY_WORKOUTS) {
      const [lo, hi] = SPM[w.type];
      const workSteps = w.steps.filter((s) => s.k === "w");
      for (const s of workSteps) {
        expect(
          s.spm !== undefined && s.spm >= lo && s.spm <= hi,
          `${w.title}: spm ${s.spm}`,
        ).toBe(true);
      }
    }
  });

  it("calls every rate in twos — stroke rates are even", () => {
    // Rowing rates are called in twos (16/18/…/32); the reference material
    // is 94% even and every Concept2 reference is all-even. Odd rates read
    // as typos on the water and on the erg.
    for (const w of LIBRARY_WORKOUTS) {
      const workSteps = w.steps.filter((s) => s.k === "w");
      for (const s of workSteps) {
        expect(
          s.spm !== undefined && s.spm % 2 === 0,
          `${w.title}: spm ${s.spm}`,
        ).toBe(true);
      }
    }
  });

  it("prescribes nothing faster than 2k-4 as a split — beyond that is max", () => {
    // James's line between a prescribable split and just saying max: the
    // book uses 2k-4 commonly, -5..-7 vanishingly rarely. Anything faster
    // than 2k-4 should be an EffortRef ({effort:"max"}), not a SplitRef.
    for (const w of LIBRARY_WORKOUTS) {
      const workSteps = w.steps.filter((s) => s.k === "w");
      for (const s of workSteps) {
        const isSplit = "base" in s.ref && s.ref.base === "2k";
        const off = "base" in s.ref ? s.ref.off : undefined;
        expect(
          !isSplit || (off ?? -Infinity) >= -4,
          `${w.title}: 2k${off}`,
        ).toBe(true);
      }
    }
  });

  it("keeps 6k work at +12 or faster — slower is only a float between real work", () => {
    // James's calibration (2026-08-03): the book's aerobic prescriptions
    // concentrate at 6k+0..+10; its rare +14-and-slower usages are recovery
    // floats inside hard sessions, never the session's own pace. So a 6k
    // offset of +13..+16 must be a designated float — the same workout must
    // hold a work step (2k or 6k base) resolving at least 6 s/500m faster —
    // and nothing anywhere sits slower than +16.
    for (const w of LIBRARY_WORKOUTS) {
      const workSteps = w.steps.filter((s) => s.k === "w");
      // Each work step's split at the nominal baselines (2k = 112+off,
      // 6k = 122+off); effort steps carry no split and can't relieve a float.
      const splits = workSteps.map((s) =>
        "base" in s.ref
          ? (s.ref.base === "2k" ? BASELINES.k2Seconds : BASELINES.k6Seconds) +
            s.ref.off
          : null,
      );
      workSteps.forEach((s, i) => {
        const off =
          "base" in s.ref && s.ref.base === "6k" ? s.ref.off : -Infinity;
        const mySplit = splits[i] ?? -Infinity;
        const hasFasterWork = splits.some(
          (r) => r !== null && r <= mySplit - 6,
        );
        expect(
          off < 13 || (off <= 16 && hasFasterWork),
          `${w.title}: 6k+${off}`,
        ).toBe(true);
      });
    }
  });

  it("resolves each type against its own baseline — AN/TR off the 2k, AT/O2 off the 6k", () => {
    // `domain/plans.ts` states this convention in PROSE and nothing checked
    // it: "the sprint plan re-tests the 2k (AN — the ceiling every AN/TR pace
    // resolves against), the head plan the 6k (AT — the threshold every
    // AT/O2 pace resolves against)". That sentence is the entire reason each
    // plan pins the instrument it does, and the code has ZERO behavioural
    // branches on a WorkoutType literal — `SplitRef.base` is authored per
    // step, so nothing but this test stops a workout resolving off the wrong
    // measurement. Measured at authoring time: 286 conforming steps in the
    // 2k family (AN 68, TR 218), 399 in the 6k family (O2 206, AT 193), and
    // zero crossings across all 300 workouts.
    //
    // ABSOLUTE, not a ratchet, and not float-exempt (James, 2026-08-28). The
    // neighbouring 6k+12 test contemplates a slow 6k RECOVERY FLOAT inside a
    // hard session, which under this rule an AN or TR workout cannot carry.
    // Nothing in the library does that today; if a future one wants to, it
    // hits this test and the exception gets argued rather than absorbed.
    //
    // EFFORT REFS ARE EXEMPT BY CONSTRUCTION, not by choice: `{effort:"max"}`
    // carries no `base` to check. That is not a rounding error — 88 work
    // steps are effort refs, 82 of them AN, which is most of AN's own work.
    const BASE_FOR_TYPE: Record<WorkoutType, PaceBase> = {
      AN: "2k",
      TR: "2k",
      AT: "6k",
      O2: "6k",
    };
    for (const w of LIBRARY_WORKOUTS) {
      for (const s of w.steps) {
        if (s.k !== "w" || !("base" in s.ref)) continue;
        expect(
          [w.title, s.ref.base],
          `${w.title} is ${w.type}, so it resolves against ${BASE_FOR_TYPE[w.type]}`,
        ).toStrictEqual([w.title, BASE_FOR_TYPE[w.type]]);
      }
    }
  });

  it("prescribes spm on every work step", () => {
    for (const w of LIBRARY_WORKOUTS) {
      const workSteps = w.steps.filter((s) => s.k === "w");
      for (const s of workSteps) {
        expect(s.spm, `${w.title}`).toBeDefined();
      }
    }
  });

  it("pairs difficulty and pain plausibly", () => {
    for (const w of LIBRARY_WORKOUTS) {
      const [dLo, dHi] = PAIN_BY_DIFF[w.difficulty];
      const [tLo, tHi] = PAIN_BY_TYPE[w.type];
      expect(
        w.pain >= dLo && w.pain <= dHi,
        `${w.title}: ${w.difficulty}/${w.pain}`,
      ).toBe(true);
      expect(
        w.pain >= tLo && w.pain <= tHi,
        `${w.title}: ${w.type}/${w.pain}`,
      ).toBe(true);
    }
  });

  it("has no two structurally identical workouts", () => {
    // Signature = everything but the title. Same structure + same numbers
    // under a different name is a duplicate, not variety.
    const sigs = LIBRARY_WORKOUTS.map((w) =>
      JSON.stringify({ t: w.type, s: w.steps }),
    );
    expect(new Set(sigs).size).toBe(sigs.length);
  });

  it("orders each type block easy→hard (difficulty never decreases)", () => {
    const rank: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 };
    for (const type of ["O2", "AT", "TR", "AN"] as const) {
      const block = LIBRARY_WORKOUTS.filter((w) => w.type === type);
      for (let i = 1; i < block.length; i++)
        expect(
          rank[block[i]!.difficulty] >= rank[block[i - 1]!.difficulty],
          `${type}: ${block[i - 1]!.title} -> ${block[i]!.title}`,
        ).toBe(true);
    }
  });
});
