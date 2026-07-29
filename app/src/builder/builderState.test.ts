import { describe, it, expect } from "vitest";
import {
  EMPTY_FORM,
  addRow,
  fromWorkout,
  parseDurationInput,
  removeRow,
  setReps,
  toSteps,
  toggleMarked,
  totals,
  type BuilderForm,
} from "./builderState";

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
});
