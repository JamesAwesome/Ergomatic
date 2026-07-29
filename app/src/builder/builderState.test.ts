import { describe, it, expect } from "vitest";
import {
  EMPTY_FORM,
  addRow,
  fromWorkout,
  hasUnsupportedSteps,
  newForm,
  parseDurationInput,
  removeRow,
  setReps,
  setRowIds,
  toSteps,
  toggleMarked,
  totals,
  type BuilderForm,
  type BuilderRow,
} from "./builderState";
import { validateSteps } from "../../domain/validate.js";
import { estimateMinutes } from "../../domain/expand.js";
import type { Step } from "../../domain/types.js";

const baselines = { k2Seconds: 112, k6Seconds: 122 };

function formWith(over: Partial<BuilderForm> = {}): BuilderForm {
  return { ...EMPTY_FORM, num: "7", title: "Test Piece", pain: 3, ...over };
}

describe("duration input", () => {
  it("reads minutes and meters the same way the bulk parser does", () => {
    expect(parseDurationInput("10'")).toStrictEqual({
      kind: "time",
      minutes: 10,
    });
    expect(parseDurationInput("2.5'")).toStrictEqual({
      kind: "time",
      minutes: 2.5,
    });
    expect(parseDurationInput("2500m")).toStrictEqual({
      kind: "distance",
      meters: 2500,
    });
  });

  it("rejects a bare number, so the unit is always explicit", () => {
    expect(parseDurationInput("10")).toBeNull();
  });

  it("rejects fractional meters and junk", () => {
    expect(parseDurationInput("250.5m")).toBeNull();
    expect(parseDurationInput("soon")).toBeNull();
  });
});

describe("rows", () => {
  it("adds a row of the requested kind", () => {
    const f = addRow(EMPTY_FORM, "r");
    expect(f.rows).toHaveLength(EMPTY_FORM.rows.length + 1);
    expect(f.rows.at(-1)!.kind).toBe("r");
  });

  it("removes only the named row and leaves the form otherwise untouched", () => {
    const two = addRow(EMPTY_FORM, "r");
    const target = two.rows[0].id;
    const f = removeRow(two, target);
    expect(f.rows.map((r) => r.id)).toStrictEqual([two.rows[1].id]);
  });

  it("toggles a row's SET marking without touching its neighbours", () => {
    const two = addRow(EMPTY_FORM, "w");
    const f = toggleMarked(two, two.rows[0].id);
    expect(f.rows[0].marked).toBe(true);
    expect(f.rows[1].marked).toBe(false);
    expect(toggleMarked(f, two.rows[0].id).rows[0].marked).toBe(false);
  });

  it("clamps the repeat count to the domain's 1..12", () => {
    expect(setReps(EMPTY_FORM, 0).reps).toBe(1);
    expect(setReps(EMPTY_FORM, 13).reps).toBe(12);
    expect(setReps(EMPTY_FORM, 4).reps).toBe(4);
  });

  it("never mutates the form it is given", () => {
    const before = JSON.stringify(EMPTY_FORM);
    addRow(EMPTY_FORM, "w");
    setReps(EMPTY_FORM, 5);
    expect(JSON.stringify(EMPTY_FORM)).toBe(before);
  });
});

describe("toSteps", () => {
  it("builds a work step from valid row text", () => {
    const f = formWith({
      rows: [
        {
          id: "a",
          kind: "w",
          marked: false,
          dur: "5'",
          ref: "6k-2",
          spm: "22",
          rest: "",
        },
      ],
    });
    const out = toSteps(f);
    expect(out).toStrictEqual({
      ok: true,
      steps: [
        {
          k: "w",
          duration: { kind: "time", minutes: 5 },
          ref: { base: "6k", off: -2 },
          spm: 22,
        },
      ],
    });
  });

  it("emits a reps marker before the first marked row and nowhere else", () => {
    const f = formWith({
      reps: 4,
      rows: [
        {
          id: "wu",
          kind: "wu",
          marked: false,
          dur: "10'",
          ref: "",
          spm: "",
          rest: "",
        },
        {
          id: "a",
          kind: "w",
          marked: true,
          dur: "1'",
          ref: "6k-2",
          spm: "",
          rest: "",
        },
        {
          id: "b",
          kind: "r",
          marked: true,
          dur: "5'",
          ref: "",
          spm: "",
          rest: "",
        },
      ],
    });
    const out = toSteps(f);
    if (!out.ok)
      throw new Error(`expected ok, got ${JSON.stringify(out.errors)}`);
    expect(out.steps.map((s) => s.k)).toStrictEqual(["wu", "reps", "w", "r"]);
    expect(out.steps[1]).toStrictEqual({ k: "reps", count: 4 });
  });

  it("omits the reps marker entirely when no row is marked", () => {
    const f = formWith({
      reps: 4,
      rows: [
        {
          id: "a",
          kind: "w",
          marked: false,
          dur: "1'",
          ref: "6k",
          spm: "",
          rest: "",
        },
      ],
    });
    const out = toSteps(f);
    if (!out.ok) throw new Error("expected ok");
    expect(out.steps.some((s) => s.k === "reps")).toBe(false);
  });

  it("reports a bad pace ref against the row that owns it", () => {
    const f = formWith({
      rows: [
        {
          id: "a",
          kind: "w",
          marked: false,
          dur: "5'",
          ref: "9k",
          spm: "",
          rest: "",
        },
      ],
    });
    const out = toSteps(f);
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected failure");
    expect(out.errors["row:a:ref"]).toMatch(/pace/i);
  });

  it("rejects a form with no work step, matching the domain rule", () => {
    const f = formWith({
      rows: [
        {
          id: "a",
          kind: "wu",
          marked: false,
          dur: "10'",
          ref: "",
          spm: "",
          rest: "",
        },
      ],
    });
    const out = toSteps(f);
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected failure");
    expect(Object.values(out.errors).join(" ")).toMatch(/work/i);
  });

  it("enforces the domain's spm bounds", () => {
    const f = formWith({
      rows: [
        {
          id: "a",
          kind: "w",
          marked: false,
          dur: "5'",
          ref: "6k",
          spm: "70",
          rest: "",
        },
      ],
    });
    expect(toSteps(f).ok).toBe(false);
  });

  it("requires num and title", () => {
    const out = toSteps(formWith({ num: "", title: "" }));
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected failure");
    expect(out.errors.num).toBeTruthy();
    expect(out.errors.title).toBeTruthy();
  });

  it("requires a pain rating", () => {
    const out = toSteps(formWith({ pain: null }));
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected failure");
    expect(out.errors.pain).toBeTruthy();
  });
});

describe("totals", () => {
  it("separates loose minutes from repeated set minutes", () => {
    const f = formWith({
      reps: 4,
      rows: [
        {
          id: "wu",
          kind: "wu",
          marked: false,
          dur: "10'",
          ref: "",
          spm: "",
          rest: "",
        },
        {
          id: "a",
          kind: "w",
          marked: true,
          dur: "1'",
          ref: "6k-2",
          spm: "",
          rest: "",
        },
        {
          id: "b",
          kind: "r",
          marked: true,
          dur: "5'",
          ref: "",
          spm: "",
          rest: "",
        },
      ],
    });
    expect(totals(f, baselines)).toStrictEqual({
      loose: 10,
      perSet: 6,
      total: 34,
    });
  });

  it("estimates a distance set from the resolved pace", () => {
    // 2000m at 2k+0 = 112.0s/500m -> 4 x 112s = 448s = 7.4666 min
    const f = formWith({
      reps: 2,
      rows: [
        {
          id: "a",
          kind: "w",
          marked: true,
          dur: "2000m",
          ref: "2k",
          spm: "",
          rest: "",
        },
      ],
    });
    const t = totals(f, baselines);
    expect(t).not.toBeNull();
    expect(t!.perSet).toBeCloseTo(7.4667, 3);
    expect(t!.total).toBeCloseTo(14.9333, 3);
  });

  it("returns null when a distance row cannot be estimated without baselines", () => {
    const f = formWith({
      rows: [
        {
          id: "a",
          kind: "w",
          marked: false,
          dur: "2000m",
          ref: "2k",
          spm: "",
          rest: "",
        },
      ],
    });
    expect(totals(f, null)).toBeNull();
  });
});

describe("fromWorkout", () => {
  it("round-trips a workout into editable rows, hoisting the reps count", () => {
    const f = fromWorkout({
      num: 12,
      title: "Ladder",
      type: "AT",
      difficulty: "medium",
      pain: 3,
      steps: [
        { k: "wu", minutes: 10 },
        { k: "reps", count: 4 },
        {
          k: "w",
          duration: { kind: "time", minutes: 1 },
          ref: { base: "6k", off: -2 },
          spm: 22,
        },
      ],
    });
    expect(f.num).toBe("12");
    expect(f.reps).toBe(4);
    expect(f.rows.map((r) => r.kind)).toStrictEqual(["wu", "w"]);
    expect(f.rows[1]).toMatchObject({
      marked: true,
      dur: "1'",
      ref: "6k-2",
      spm: "22",
    });
    expect(f.rows[0].marked).toBe(false);
  });

  it("round-trips restMinutes so an edited workout with rest can be saved (H1/H2)", () => {
    const workout = {
      num: 9,
      title: "Rest Test",
      type: "AT" as const,
      difficulty: "medium" as const,
      pain: 3,
      steps: [
        {
          k: "w" as const,
          duration: { kind: "time" as const, minutes: 4 },
          ref: { base: "2k" as const, off: 0 },
          restMinutes: 2,
        },
      ],
    };

    const form = fromWorkout(workout);
    expect(form.rows[0].rest).toBe("2");

    const out = toSteps(form);
    expect(out.ok).toBe(true);
    if (!out.ok)
      throw new Error(`expected ok, got ${JSON.stringify(out.errors)}`);
    expect(out.steps).toStrictEqual(workout.steps);

    // Pins client/server agreement directly: whatever the builder round
    // trips must also satisfy the domain's own bounds.
    expect(validateSteps(out.steps)).toStrictEqual({
      ok: true,
      steps: out.steps,
    });
  });
});

describe("totals vs. estimateMinutes agreement", () => {
  it("counts a work step's restMinutes, matching the domain's phases()/estimateMinutes()", () => {
    const workout = {
      num: 9,
      title: "Rest Test",
      type: "AT" as const,
      difficulty: "medium" as const,
      pain: 3,
      steps: [
        {
          k: "w" as const,
          duration: { kind: "time" as const, minutes: 4 },
          ref: { base: "2k" as const, off: 0 },
          restMinutes: 2,
        },
      ],
    };

    const form = fromWorkout(workout);
    const out = toSteps(form);
    if (!out.ok)
      throw new Error(`expected ok, got ${JSON.stringify(out.errors)}`);

    const t = totals(form, baselines);
    expect(t).not.toBeNull();
    const estimate = estimateMinutes(out.steps, baselines);
    expect(Math.round(t!.total)).toBe(estimate.minutes);
  });

  it("counts a DISTANCE work step's restMinutes too (H2 distance case)", () => {
    // 2500m at 2k+0 = 112s/500m -> 5 * 112s = 560s = 9.3333 min, plus a
    // 2-minute rest = 11.3333 min, rounding to 11 — matching the reviewer's
    // probe. Only the time-duration case had a regression test before this.
    const workout = {
      num: 9,
      title: "Distance Rest Test",
      type: "AT" as const,
      difficulty: "medium" as const,
      pain: 3,
      steps: [
        {
          k: "w" as const,
          duration: { kind: "distance" as const, meters: 2500 },
          ref: { base: "2k" as const, off: 0 },
          restMinutes: 2,
        },
      ],
    };

    const form = fromWorkout(workout);
    const out = toSteps(form);
    if (!out.ok)
      throw new Error(`expected ok, got ${JSON.stringify(out.errors)}`);

    const t = totals(form, baselines);
    expect(t).not.toBeNull();
    expect(t!.total).toBeCloseTo(11.3333, 3);
    const estimate = estimateMinutes(out.steps, baselines);
    expect(estimate.minutes).toBe(11);
    expect(Math.round(t!.total)).toBe(estimate.minutes);
  });

  it("H3: agrees with estimateMinutes for a non-contiguous marked set, by treating everything from the first marked row onward as repeated", () => {
    // Reviewer's exact probe: [wu 10' unmarked, w 5' marked, r 2' unmarked],
    // reps 3. toSteps emits [wu, reps, w, r] because the marker goes before
    // the FIRST marked row and liveSteps repeats everything after it — so
    // the "r" row repeats even though the user never marked it. Before this
    // fix, `totals` bucketed rows by their own `marked` flag: loose = 10
    // (wu) + 2 (r) = 12, perSet = 5 (w), total = 12 + 5*3 = 27 — contradicting
    // estimateMinutes's 31 for this exact same form.
    const f = formWith({
      reps: 3,
      rows: [
        {
          id: "wu",
          kind: "wu",
          marked: false,
          dur: "10'",
          ref: "",
          spm: "",
          rest: "",
        },
        {
          id: "w",
          kind: "w",
          marked: true,
          dur: "5'",
          ref: "2k",
          spm: "",
          rest: "",
        },
        {
          id: "r",
          kind: "r",
          marked: false,
          dur: "2'",
          ref: "",
          spm: "",
          rest: "",
        },
      ],
    });

    const out = toSteps(f);
    if (!out.ok)
      throw new Error(`expected ok, got ${JSON.stringify(out.errors)}`);
    expect(out.steps.map((s) => s.k)).toStrictEqual(["wu", "reps", "w", "r"]);

    const t = totals(f, baselines);
    expect(t).not.toBeNull();
    const estimate = estimateMinutes(out.steps, baselines);
    expect(estimate.minutes).toBe(31);
    expect(Math.round(t!.total)).toBe(estimate.minutes);
  });
});

describe("setRowIds", () => {
  it("returns every row id from the first marked row onward, including rows the user never clicked", () => {
    const f = formWith({
      rows: [
        {
          id: "wu",
          kind: "wu",
          marked: false,
          dur: "10'",
          ref: "",
          spm: "",
          rest: "",
        },
        {
          id: "w",
          kind: "w",
          marked: true,
          dur: "5'",
          ref: "2k",
          spm: "",
          rest: "",
        },
        {
          id: "r",
          kind: "r",
          marked: false,
          dur: "2'",
          ref: "",
          spm: "",
          rest: "",
        },
      ],
    });

    expect(setRowIds(f)).toStrictEqual(["w", "r"]);
  });

  it("returns an empty list when nothing is marked", () => {
    const f = formWith({
      rows: [
        {
          id: "a",
          kind: "w",
          marked: false,
          dur: "5'",
          ref: "2k",
          spm: "",
          rest: "",
        },
      ],
    });

    expect(setRowIds(f)).toStrictEqual([]);
  });
});

describe("toSteps additional coverage", () => {
  it("builds a distance work step", () => {
    const f = formWith({
      rows: [
        {
          id: "a",
          kind: "w",
          marked: false,
          dur: "2500m",
          ref: "2k",
          spm: "",
          rest: "",
        },
      ],
    });
    const out = toSteps(f);
    expect(out.ok).toBe(true);
    if (!out.ok)
      throw new Error(`expected ok, got ${JSON.stringify(out.errors)}`);
    expect(out.steps).toStrictEqual([
      {
        k: "w",
        duration: { kind: "distance", meters: 2500 },
        ref: { base: "2k", off: 0 },
      },
    ]);
  });

  it("rejects a pace-ref offset beyond the domain's ±60 bound (M1)", () => {
    const f = formWith({
      rows: [
        {
          id: "a",
          kind: "w",
          marked: false,
          dur: "5'",
          ref: "2k+99",
          spm: "",
          rest: "",
        },
      ],
    });
    const out = toSteps(f);
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected failure");
    expect(out.errors["row:a:ref"]).toMatch(/pace/i);
  });

  it("agrees with the domain on the ±60 pace-ref boundary (M1): +60 is accepted by both, +61 by neither", () => {
    const inside = formWith({
      rows: [
        {
          id: "a",
          kind: "w",
          marked: false,
          dur: "5'",
          ref: "2k+60",
          spm: "",
          rest: "",
        },
      ],
    });
    const insideOut = toSteps(inside);
    if (!insideOut.ok)
      throw new Error(`expected ok, got ${JSON.stringify(insideOut.errors)}`);
    // Route the client's accepted output through the domain's own validator
    // rather than only trusting the client's copy of the ±60 bound.
    expect(validateSteps(insideOut.steps)).toStrictEqual({
      ok: true,
      steps: insideOut.steps,
    });

    const outside = formWith({
      rows: [
        {
          id: "a",
          kind: "w",
          marked: false,
          dur: "5'",
          ref: "2k+61",
          spm: "",
          rest: "",
        },
      ],
    });
    expect(toSteps(outside).ok).toBe(false);
    // Confirm the domain rejects the same offset too — the client didn't
    // just invent a tighter bound than the server actually enforces.
    expect(
      validateSteps([
        {
          k: "w",
          duration: { kind: "time", minutes: 5 },
          ref: { base: "2k", off: 61 },
        },
      ]).ok,
    ).toBe(false);
  });

  it("bounds the emitted step count, not just the row count (M2)", () => {
    const rows: BuilderRow[] = Array.from({ length: 100 }, (_, i) => ({
      id: `r${i}`,
      kind: "w",
      marked: i === 0,
      dur: "1'",
      ref: "2k",
      spm: "",
      rest: "",
    }));
    // 100 rows + 1 reps marker = 101 emitted steps, over the domain's cap.
    const out = toSteps(formWith({ rows, reps: 2 }));
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected failure");
    expect(out.errors.steps).toMatch(/100/);
  });

  it("allows exactly 100 emitted steps (rows plus the reps marker), and the domain agrees (M2)", () => {
    const rows: BuilderRow[] = Array.from({ length: 99 }, (_, i) => ({
      id: `r${i}`,
      kind: "w",
      marked: i === 0,
      dur: "1'",
      ref: "2k",
      spm: "",
      rest: "",
    }));
    // 99 rows + 1 reps marker = 100 emitted steps, exactly at the cap.
    const out = toSteps(formWith({ rows, reps: 2 }));
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected ok");
    // Assert the actual count, not just ok — a regression to 99 emitted
    // steps would still pass an ok-only assertion.
    expect(out.steps.length).toBe(100);
    expect(validateSteps(out.steps)).toStrictEqual({
      ok: true,
      steps: out.steps,
    });
  });

  it("tolerates surrounding whitespace in a duration field, like every other field (L1)", () => {
    const f = formWith({
      rows: [
        {
          id: "a",
          kind: "w",
          marked: false,
          dur: " 5' ",
          ref: "2k",
          spm: "",
          rest: "",
        },
      ],
    });
    const out = toSteps(f);
    expect(out.ok).toBe(true);
    if (!out.ok)
      throw new Error(`expected ok, got ${JSON.stringify(out.errors)}`);
    expect(out.steps).toStrictEqual([
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "2k", off: 0 },
      },
    ]);
  });

  it("rejects exponent notation in num, requiring plain digits (L3)", () => {
    const out = toSteps(formWith({ num: "1e3" }));
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected failure");
    expect(out.errors.num).toBeTruthy();
  });
});

describe("duration input whitespace (L1)", () => {
  it("trims surrounding whitespace, matching typed vs. pasted input", () => {
    expect(parseDurationInput("5' ")).toStrictEqual({
      kind: "time",
      minutes: 5,
    });
    expect(parseDurationInput(" 2500m")).toStrictEqual({
      kind: "distance",
      meters: 2500,
    });
  });
});

describe("hasUnsupportedSteps (L2)", () => {
  it("flags a workout containing a test step, which the builder cannot represent", () => {
    const steps: Step[] = [
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "2k", off: 0 },
      },
      { k: "test", label: "2k test" },
    ];
    expect(hasUnsupportedSteps(steps)).toBe(true);
  });

  it("is false for a workout made entirely of representable step kinds", () => {
    const steps: Step[] = [
      { k: "wu", minutes: 10 },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "2k", off: 0 },
      },
    ];
    expect(hasUnsupportedSteps(steps)).toBe(false);
  });

  it("lets a caller detect the loss before fromWorkout silently drops the test step", () => {
    const workout = {
      num: 1,
      title: "Has a test piece",
      type: "AT" as const,
      difficulty: "medium" as const,
      pain: 3,
      steps: [
        {
          k: "w" as const,
          duration: { kind: "time" as const, minutes: 5 },
          ref: { base: "2k" as const, off: 0 },
        },
        { k: "test" as const, label: "2k test" },
      ],
    };

    expect(hasUnsupportedSteps(workout.steps)).toBe(true);
    const form = fromWorkout(workout);
    expect(form.rows).toHaveLength(1); // the test step did not survive
  });
});

describe("EMPTY_FORM safety (L4)", () => {
  it("is frozen, so an in-place edit throws instead of corrupting shared state", () => {
    expect(() => {
      (EMPTY_FORM as { num: string }).num = "5";
    }).toThrow();
    expect(() => {
      (EMPTY_FORM.rows[0] as { dur: string }).dur = "5'";
    }).toThrow();
  });

  it("newForm() returns a form with its own row, never shared with EMPTY_FORM or other calls", () => {
    const a = newForm();
    const b = newForm();
    expect(a.rows[0]).not.toBe(b.rows[0]);
    expect(a.rows[0]).not.toBe(EMPTY_FORM.rows[0]);
    expect(a).not.toBe(EMPTY_FORM);
  });
});
