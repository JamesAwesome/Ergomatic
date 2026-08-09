import { describe, it, expect } from "vitest";
import { needsBaselines } from "./needsBaselines.js";
import { LIBRARY_WORKOUTS } from "../server/seed/library/index.js";
import type { Step } from "./types.js";

describe("needsBaselines — true unless EVERY work step is an effort ref", () => {
  it("is false when there are no work steps at all (rest ignored)", () => {
    const steps: Step[] = [
      { k: "r", minutes: 10 },
      { k: "r", minutes: 2 },
    ];
    expect(needsBaselines(steps)).toBe(false);
  });

  it("is false when every work step is an effort ref (the onboarding shape)", () => {
    const steps: Step[] = [
      { k: "r", minutes: 10 },
      {
        k: "w",
        duration: { kind: "distance", meters: 6000 },
        ref: { effort: "min" },
      },
    ];
    expect(needsBaselines(steps)).toBe(false);
  });

  it("is true when a work step is a split ref", () => {
    const steps: Step[] = [
      { k: "r", minutes: 5 },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: 0 },
      },
    ];
    expect(needsBaselines(steps)).toBe(true);
  });

  it("is true for a mix of effort and split-ref work steps", () => {
    const steps: Step[] = [
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { effort: "max" },
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "2k", off: 0 },
      },
    ];
    expect(needsBaselines(steps)).toBe(true);
  });

  it("is true for a split ref sitting inside a reps-repeated block", () => {
    const steps: Step[] = [
      { k: "r", minutes: 5 },
      { k: "reps", count: 4 },
      {
        k: "w",
        duration: { kind: "time", minutes: 1 },
        ref: { base: "6k", off: -2 },
      },
      { k: "r", minutes: 1 },
    ];
    expect(needsBaselines(steps)).toBe(true);
  });

  it("is true for a real split-ref library workout (realistic-fixture guard)", () => {
    // Realistic-fixture guard (recurring failure #3): an O2 workout's
    // interval work steps are split refs against the 6k baseline.
    const real = LIBRARY_WORKOUTS.find((w) => w.type === "O2")!;
    expect(real.steps.some((s) => s.k === "w")).toBe(true); // sanity: it has work steps
    expect(needsBaselines(real.steps)).toBe(true);
  });

  // Finding (not a defect): the seeded AN library already contains
  // real, shipped effort-ref-only sprint workouts ("Dust Storm", "Heat
  // Burst", etc. — all-out reps with no split ref anywhere). This
  // predicate correctly reads them as needing no baselines too — the
  // guards it feeds (Task 2) aren't gating just the two NEW onboarding
  // workouts, they change behavior for this pre-existing AN content as
  // well. Pinned here so that consequence is explicit, not implicit.
  it("is false for real, shipped AN sprint workouts that are already effort-ref-only", () => {
    const dustStorm = LIBRARY_WORKOUTS.find((w) => w.title === "Dust Storm");
    expect(dustStorm).toBeDefined();
    expect(needsBaselines(dustStorm!.steps)).toBe(false);
  });
});
