import { describe, it, expect } from "vitest";
import { needsBaselines } from "../../../domain/needsBaselines.js";
import { ONBOARDING_TITLES } from "../../../domain/onboarding.js";
import { validateWorkoutInput } from "../../../domain/validate.js";
import { ONBOARDING_LIBRARY_WORKOUTS } from "./onboarding.js";
import { GLOBAL_LIBRARY_SEED, LIBRARY_WORKOUTS } from "./index.js";

// Its own tiny gate (Phase 6I spec): exactly the two designated rows,
// each an effort-ref distance work step with a fixed title — exempt from
// library.test.ts's 300-count/quota-grid/spm gate on purpose (see the
// header comment in onboarding.ts for why they can't live there).
describe("ONBOARDING_LIBRARY_WORKOUTS", () => {
  it("has exactly two rows", () => {
    expect(ONBOARDING_LIBRARY_WORKOUTS).toHaveLength(2);
  });

  it("carries the two fixed onboarding titles, and only those", () => {
    expect(
      new Set(ONBOARDING_LIBRARY_WORKOUTS.map((w) => w.title)),
    ).toStrictEqual(new Set([ONBOARDING_TITLES.k6, ONBOARDING_TITLES.k2]));
  });

  it("every row passes validateWorkoutInput", () => {
    for (const w of ONBOARDING_LIBRARY_WORKOUTS) {
      const r = validateWorkoutInput(w);
      expect(r.ok, `${w.title}: ${r.ok ? "" : r.errors.join("; ")}`).toBe(true);
    }
  });

  it("each row is a single distance work step at an effort ref, no spm", () => {
    for (const w of ONBOARDING_LIBRARY_WORKOUTS) {
      const workSteps = w.steps.filter((s) => s.k === "w");
      expect(workSteps, `${w.title}`).toHaveLength(1);
      const [step] = workSteps;
      expect(step!.duration.kind, `${w.title}`).toBe("distance");
      expect("effort" in step!.ref, `${w.title}`).toBe(true);
      expect(step!.spm, `${w.title}`).toBeUndefined();
    }
  });

  it("the 6K Test is a 6000m min-effort row; the 2K Test is a 2000m max-effort row", () => {
    const k6 = ONBOARDING_LIBRARY_WORKOUTS.find(
      (w) => w.title === ONBOARDING_TITLES.k6,
    )!;
    const k2 = ONBOARDING_LIBRARY_WORKOUTS.find(
      (w) => w.title === ONBOARDING_TITLES.k2,
    )!;
    const k6Work = k6.steps.find((s) => s.k === "w")!;
    const k2Work = k2.steps.find((s) => s.k === "w")!;
    expect(k6Work).toMatchObject({
      duration: { kind: "distance", meters: 6000 },
      ref: { effort: "min" },
    });
    expect(k2Work).toMatchObject({
      duration: { kind: "distance", meters: 2000 },
      ref: { effort: "max" },
    });
  });

  // Phase 8A PR B: the two tests are classified HONESTLY — instruments,
  // not sessions. A 2K test is an all-out anaerobic effort (AN/hard/5);
  // a 6K test rides the anaerobic threshold (AT/hard/4). The old
  // O2/easy/2 and AN/easy/2 rows undersold both.
  it("the 2K Test is AN/hard/pain 5; the 6K Test is AT/hard/pain 4", () => {
    const k6 = ONBOARDING_LIBRARY_WORKOUTS.find(
      (w) => w.title === ONBOARDING_TITLES.k6,
    )!;
    const k2 = ONBOARDING_LIBRARY_WORKOUTS.find(
      (w) => w.title === ONBOARDING_TITLES.k2,
    )!;
    expect(k2).toMatchObject({ type: "AN", difficulty: "hard", pain: 5 });
    expect(k6).toMatchObject({ type: "AT", difficulty: "hard", pain: 4 });
  });

  it("needs no baselines to run (the whole point of the onboarding card)", () => {
    for (const w of ONBOARDING_LIBRARY_WORKOUTS) {
      expect(needsBaselines(w.steps), `${w.title}`).toBe(false);
    }
  });

  it("titles do not collide with any real library workout", () => {
    const libTitles = new Set(LIBRARY_WORKOUTS.map((w) => w.title));
    for (const w of ONBOARDING_LIBRARY_WORKOUTS) {
      expect(libTitles.has(w.title), `${w.title}`).toBe(false);
    }
  });
});

describe("GLOBAL_LIBRARY_SEED — the converge input", () => {
  it("is the 300-workout library plus the two onboarding rows, in that order", () => {
    expect(GLOBAL_LIBRARY_SEED).toHaveLength(LIBRARY_WORKOUTS.length + 2);
    expect(GLOBAL_LIBRARY_SEED.slice(0, LIBRARY_WORKOUTS.length)).toStrictEqual(
      LIBRARY_WORKOUTS,
    );
  });

  it("continues sortOrder after the 300 (301, 302) rather than colliding", () => {
    const tail = GLOBAL_LIBRARY_SEED.slice(LIBRARY_WORKOUTS.length);
    expect(tail.map((w) => w.sortOrder)).toStrictEqual([
      LIBRARY_WORKOUTS.length + 1,
      LIBRARY_WORKOUTS.length + 2,
    ]);
    expect(tail.map((w) => w.title)).toStrictEqual([
      ONBOARDING_TITLES.k6,
      ONBOARDING_TITLES.k2,
    ]);
  });

  it("does NOT mutate LIBRARY_WORKOUTS itself — the starter-library gate stays exactly 300", () => {
    expect(LIBRARY_WORKOUTS).toHaveLength(300);
  });
});
