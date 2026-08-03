import { describe, it, expect } from "vitest";
import { estimateMinutes } from "../../../domain/expand.js";
import type { Difficulty, WorkoutType } from "../../../domain/types.js";
import { validateWorkoutInput } from "../../../domain/validate.js";
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

// The spec's quota grid, verbatim (docs/superpowers/specs/
// 2026-08-03-workout-generation-design.md §4). Rows sum 90/75/75/60 = 300.
const QUOTA: Record<WorkoutType, Record<Band, number>> = {
  O2: { "<20": 2, "20-30": 14, "30-45": 36, "45-60": 18, "60+": 20 },
  AT: { "<20": 5, "20-30": 19, "30-45": 34, "45-60": 13, "60+": 4 },
  TR: { "<20": 9, "20-30": 22, "30-45": 32, "45-60": 9, "60+": 3 },
  AN: { "<20": 14, "20-30": 20, "30-45": 18, "45-60": 5, "60+": 3 },
};

// Authoring bands from the starter library's conventions (starter.ts header).
const SPM: Record<WorkoutType, [number, number]> = {
  O2: [18, 22],
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

  it("fills the quota grid exactly", () => {
    const got: Record<string, number> = {};
    for (const w of LIBRARY_WORKOUTS) {
      const { minutes } = estimateMinutes(w.steps, BASELINES);
      const key = `${w.type}|${band(minutes)}`;
      got[key] = (got[key] ?? 0) + 1;
    }
    for (const [type, bands] of Object.entries(QUOTA))
      for (const [b, n] of Object.entries(bands))
        expect(got[`${type}|${b}`] ?? 0, `${type} ${b}`).toBe(n);
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
