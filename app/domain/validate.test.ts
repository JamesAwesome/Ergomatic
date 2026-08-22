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
      { k: "r", minutes: 10 },
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
  it("rejects an r step with out-of-range or non-whole-second minutes", () => {
    expect(validateSteps([{ k: "r", minutes: 0 }, work()]).ok).toBe(false);
    expect(validateSteps([{ k: "r", minutes: 10.123456 }, work()]).ok).toBe(
      false,
    );
    expect(validateSteps([work(), { k: "r", minutes: 200 }]).ok).toBe(false);
  });

  // "wu" left the Step union 2026-08-09 (the warmup-setting spec), and the
  // setting itself left 2026-08-21 (Phase WU): validateSteps is the
  // permanent runtime guard for stored/imported data that can still
  // present the retired shape — it rejects every wu step outright,
  // regardless of whether its own minutes would have been in-bounds, with
  // copy that points the rower at authoring one as an ordinary step.
  it("rejects a wu step with copy that points at authoring an ordinary step", () => {
    const r = validateSteps([{ k: "wu", minutes: 5 }, work()]);
    expect(r.ok).toBe(false);
    const errors = r.ok ? [] : r.errors;
    expect(errors[0]).toBe(
      "Warm-ups aren't a step kind. Add it as an ordinary first step.",
    );
  });
  it("rejects a wu step even when its own minutes would have been in-bounds", () => {
    expect(validateSteps([{ k: "wu", minutes: 10 }, work()]).ok).toBe(false);
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
      [{ k: "r", minutes: 10 }], // no work/test step
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
  it("accepts an effort ref with any duration kind, spm and rest", () => {
    const steps = [
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { effort: "max" },
        spm: 32,
        restMinutes: 1,
      },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { effort: "min" },
      },
    ];
    const r = validateSteps(steps);
    expect(r.ok).toBe(true);
  });

  it("rejects an effort ref with extra keys or a bad effort", () => {
    for (const ref of [
      { effort: "max", off: 2 },
      { effort: "hard" },
      { effort: "" },
    ]) {
      const r = validateSteps([work({ ref })]);
      expect(r.ok, `${JSON.stringify(ref)}`).toBe(false);
    }
  });

  it("rejects a hybrid pace ref (split + effort keys together)", () => {
    // Defensive against a hand-built hybrid payload that mistakenly
    // combines both split and effort structure: {base:"2k", off:0, effort:"max"}
    const r = validateSteps([
      work({ ref: { base: "2k", off: 0, effort: "max" } }),
    ]);
    expect(r.ok).toBe(false);
    const errors = r.ok ? [] : r.errors;
    expect(errors).toStrictEqual(
      expect.arrayContaining([expect.stringContaining("invalid pace ref")]),
    );
  });

  it("rejects a split ref with missing off", () => {
    // A split ref missing the required `off` key should fail
    const r = validateSteps([work({ ref: { base: "2k" } })]);
    expect(r.ok).toBe(false);
    const errors = r.ok ? [] : r.errors;
    expect(errors).toStrictEqual(
      expect.arrayContaining([expect.stringContaining("invalid pace ref")]),
    );
  });

  it("accepts valid restMinutes", () => {
    const r = validateSteps([work({ restMinutes: 5 })]);
    expect(r.ok).toBe(true);
  });
  it("treats the r/restMinutes upper bounds as inclusive, not exclusive", () => {
    // minutes tops out at 180 and restMinutes at 60 — both boundary values
    // themselves must be accepted, only values strictly above are invalid.
    expect(validateSteps([{ k: "r", minutes: 180 }, work()]).ok).toBe(true);
    expect(validateSteps([{ k: "r", minutes: 180.5 }, work()]).ok).toBe(false);
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
  it("accepts a workout with effort-ref work steps end to end", () => {
    const res = validateWorkoutInput({
      title: "T",
      type: "AN",
      difficulty: "hard",
      pain: 5,
      steps: [
        {
          k: "w",
          duration: { kind: "time", minutes: 0.5 },
          ref: { effort: "max" },
          spm: 32,
          restMinutes: 1,
        },
        {
          k: "w",
          duration: { kind: "distance", meters: 500 },
          ref: { effort: "min" },
        },
      ],
    });
    expect(res.ok).toBe(true);
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

  it("accepts 31 seconds, which does not survive the round trip exactly", () => {
    // 31 / 60 * 60 === 31.000000000000004, so a naive Number.isInteger(n * 60)
    // rejects it. 407 of the 10,800 whole seconds in range are like this (31,
    // 62, 123, 124, 125, 245…) — a test built on a "clean" value such as 20s
    // passes against the naive predicate and proves nothing.
    const res = validateWorkoutInput(
      workout([
        {
          k: "w",
          duration: { kind: "time", minutes: 31 / 60 },
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

  it("applies the same rule to r and restMinutes", () => {
    const res = validateWorkoutInput(
      workout([
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
