import { describe, it, expect } from "vitest";
import { validateSteps, validateWorkoutInput } from "./validate.js";

const work = (over: object = {}) => ({
  k: "w",
  duration: { kind: "time", minutes: 10 },
  ref: { base: "6k", off: -2 },
  spm: 22,
  ...over,
});

describe("validateSteps", () => {
  it("accepts the interval-ladder shape", () => {
    const steps = [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 4 },
      work(),
      work(),
      work(),
      work(),
      work(),
      { k: "r", minutes: 5 },
    ];
    const r = validateSteps(steps);
    expect(r.ok).toBe(true);
  });
  it("accepts distance work steps", () => {
    const r = validateSteps([
      work({ duration: { kind: "distance", meters: 2500 } }),
    ]);
    expect(r.ok).toBe(true);
  });
  it("rejects non-arrays, junk kinds, and empty step lists", () => {
    expect(validateSteps("nope").ok).toBe(false);
    expect(validateSteps([{ k: "zap" }]).ok).toBe(false);
    expect(validateSteps([]).ok).toBe(false);
  });
  it("rejects a step item that isn't an object", () => {
    const r = validateSteps([42, work()]);
    expect(r.ok).toBe(false);
    const errors = r.ok ? [] : r.errors;
    expect(errors).toStrictEqual(
      expect.arrayContaining([expect.stringContaining("not an object")]),
    );
  });
  it("rejects a wu/r step with out-of-range or non-whole-second minutes", () => {
    expect(validateSteps([{ k: "wu", minutes: 0 }, work()]).ok).toBe(false);
    expect(validateSteps([{ k: "wu", minutes: 10.123456 }, work()]).ok).toBe(false);
    expect(validateSteps([work(), { k: "r", minutes: 200 }]).ok).toBe(false);
  });
  it("rejects out-of-bounds values with messages", () => {
    for (const bad of [
      [work({ duration: { kind: "time", minutes: 0 } })],
      [work({ duration: { kind: "time", minutes: 10.123456 } })],
      [work({ duration: { kind: "distance", meters: 50 } })],
      [work({ spm: 200 })],
      [work({ ref: { base: "5k", off: 0 } })],
      [work({ restMinutes: 0.123456 })],
      [work({ restMinutes: 90 })],
      [{ k: "wu", minutes: 10 }], // no work/test step
      [work(), { k: "reps", count: 4 }], // marker last
      [{ k: "reps", count: 2 }, work(), { k: "reps", count: 2 }, work()], // two markers
      [{ k: "reps", count: 0 }, work()], // reps count out of 1..12
      [{ k: "test", label: "x".repeat(41) }], // test label too long
    ]) {
      const r = validateSteps(bad);
      expect(r.ok).toBe(false);
      const errorCount = r.ok ? 0 : r.errors.length;
      expect(errorCount).toBeGreaterThan(0);
    }
  });
  it("accepts valid restMinutes", () => {
    const r = validateSteps([work({ restMinutes: 5 })]);
    expect(r.ok).toBe(true);
  });
  it("treats the wu/restMinutes upper bounds as inclusive, not exclusive", () => {
    // minutes tops out at 180 and restMinutes at 60 — both boundary values
    // themselves must be accepted, only values strictly above are invalid.
    expect(validateSteps([{ k: "wu", minutes: 180 }, work()]).ok).toBe(true);
    expect(validateSteps([{ k: "wu", minutes: 180.5 }, work()]).ok).toBe(false);
    expect(validateSteps([work({ restMinutes: 60 })]).ok).toBe(true);
    expect(validateSteps([work({ restMinutes: 60.5 })]).ok).toBe(false);
  });
  it("accepts valid test-step with label", () => {
    const r = validateSteps([{ k: "test", label: "2k test" }]);
    expect(r.ok).toBe(true);
  });
  it("rejects steps array exceeding 100 items", () => {
    const steps = Array.from({ length: 101 }, () => work());
    const r = validateSteps(steps);
    expect(r.ok).toBe(false);
  });
});

describe("validateWorkoutInput", () => {
  const base = {
    title: "Ladder Day",
    type: "AT",
    difficulty: "medium",
    pain: 3,
    steps: [work()],
  };
  it("accepts a valid workout", () => {
    expect(validateWorkoutInput(base).ok).toBe(true);
  });
  it("rejects a non-object workout", () => {
    const r = validateWorkoutInput("nope");
    expect(r.ok).toBe(false);
    const errors = r.ok ? [] : r.errors;
    expect(errors).toStrictEqual(["not an object"]);
  });
  it("rejects pain outside 1..5 and book-era difficulty labels", () => {
    expect(validateWorkoutInput({ ...base, pain: 7 }).ok).toBe(false);
    expect(validateWorkoutInput({ ...base, pain: 0 }).ok).toBe(false);
    expect(
      validateWorkoutInput({ ...base, difficulty: "introductory" }).ok,
    ).toBe(false);
  });
  it("rejects bad title/type", () => {
    expect(validateWorkoutInput({ ...base, title: "" }).ok).toBe(false);
    expect(validateWorkoutInput({ ...base, type: "XX" }).ok).toBe(false);
  });
  it("rejects a non-integer pain even when the value is in range", () => {
    // 2.5 falls inside 1..5, so this only fails if integer-ness is actually
    // enforced rather than just the numeric range.
    expect(validateWorkoutInput({ ...base, pain: 2.5 }).ok).toBe(false);
  });
  it("ignores a leftover `num` field rather than rejecting it (2026-07-30: num retired)", () => {
    // Old clients (and the pre-5C bulk grammar) still send a number. It is
    // no longer part of WorkoutInput, so it must neither be required nor be
    // grounds for rejection — the store simply never writes it.
    expect(validateWorkoutInput({ ...base, num: 12 }).ok).toBe(true);
  });
});

describe("whole-second durations", () => {
  const workout = (steps: unknown[]) => ({
    title: "T",
    type: "O2",
    difficulty: "easy",
    pain: 3,
    steps,
  });

  it("accepts a 45-second work step", () => {
    const res = validateWorkoutInput(
      workout([
        {
          k: "w",
          duration: { kind: "time", minutes: 0.75 },
          ref: { base: "6k", off: 0 },
        },
      ]),
    );
    expect(res.ok).toBe(true);
  });

  it("accepts 20 seconds, which is not exact in binary", () => {
    // 20 / 60 * 60 === 19.999999999999996, so a naive Number.isInteger(n * 60)
    // check rejects it. This test fails against that implementation.
    const res = validateWorkoutInput(
      workout([
        {
          k: "w",
          duration: { kind: "time", minutes: 20 / 60 },
          ref: { base: "6k", off: 0 },
        },
      ]),
    );
    expect(res.ok).toBe(true);
  });

  it("still accepts the half-step values that already exist in stored data", () => {
    for (const minutes of [0.5, 1, 2.5, 20, 180]) {
      const res = validateWorkoutInput(
        workout([
          {
            k: "w",
            duration: { kind: "time", minutes },
            ref: { base: "6k", off: 0 },
          },
        ]),
      );
      expect(res.ok, `minutes ${minutes}`).toBe(true);
    }
  });

  it("rejects a sub-second duration and one past the ceiling", () => {
    for (const minutes of [0, 0.001, 180.5]) {
      const res = validateWorkoutInput(
        workout([
          {
            k: "w",
            duration: { kind: "time", minutes },
            ref: { base: "6k", off: 0 },
          },
        ]),
      );
      expect(res.ok, `minutes ${minutes}`).toBe(false);
    }
  });

  it("applies the same rule to wu, r and restMinutes", () => {
    const res = validateWorkoutInput(
      workout([
        { k: "wu", minutes: 0.75 },
        {
          k: "w",
          duration: { kind: "time", minutes: 1 },
          ref: { base: "6k", off: 0 },
          restMinutes: 0.75,
        },
        { k: "r", minutes: 0.25 },
      ]),
    );
    expect(res.ok).toBe(true);

    const tooLong = validateWorkoutInput(
      workout([
        {
          k: "w",
          duration: { kind: "time", minutes: 1 },
          ref: { base: "6k", off: 0 },
          restMinutes: 60.25,
        },
      ]),
    );
    expect(tooLong.ok).toBe(false);
  });
});
