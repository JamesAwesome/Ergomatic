import { describe, it, expect } from "vitest";
import {
  BOOKEND_ROW_KINDS,
  EMPTY_FORM,
  REST_MAX_SECONDS,
  REST_STEP_SECONDS,
  addBlankStep,
  addRow,
  cloneRow,
  fmtRestSeconds,
  fromWorkout,
  hasMidSpanReps,
  hasUnsupportedSteps,
  newForm,
  newRow,
  removeRow,
  restSecondsFromRow,
  rowWithRestSeconds,
  setReps,
  spanStartIndex,
  stepSubSummary,
  stepSummary,
  toSteps,
  totals,
  type BuilderForm,
  type BuilderRow,
} from "./builderState";
import { fmtDuration, parseClock } from "../../domain/duration.js";
import { validateSteps } from "../../domain/validate.js";
import { estimateMinutes } from "../../domain/expand.js";
import type { Step } from "../../domain/types.js";
import { STARTER_WORKOUTS } from "../../server/seed/starter";

const baselines = { k2Seconds: 112, k6Seconds: 122 };

// A default work row with a valid duration and ref (unlike EMPTY_FORM's
// blank starter row) so `formWith()` alone yields a form `toSteps` accepts —
// callers that need to exercise a specific invalid row still override `rows`
// explicitly, same as before.
function defaultValidRow(): BuilderRow {
  return {
    id: "default",
    kind: "w",
    durValue: "5:00",
    durUnit: "min",
    refBase: "6k",
    refOff: 0,
    spm: "",
    rest: "",
  };
}

// Shared row-shape helpers for the new BuilderRow (no `marked`, `durValue` +
// `durUnit` instead of `dur`). `workRow`/`wuRow`/`restRow` all default to a
// valid, minimal row of their kind — callers spread and override for
// anything more specific, same convention as `defaultValidRow`.
function workRow(id: string): BuilderRow {
  return {
    id,
    kind: "w",
    durValue: "5:00",
    durUnit: "min",
    refBase: "6k",
    refOff: 0,
    spm: "",
    rest: "",
  };
}

// `minutes` is still a plain decimal-minutes string, same convention every
// caller below already uses ("10", "5", "2") — this formats it into the
// clock string `durValue` actually holds now, so none of those call sites
// need to spell out `fmtDuration` themselves. `""` stays `""` (blank is a
// distinct state from a zero duration — `fmtDuration(0)` would be "0:00", a
// non-blank value the blank-duration tests must NOT get by accident).
function wuRow(id: string, minutes: string): BuilderRow {
  return {
    id,
    kind: "wu",
    durValue: minutes === "" ? "" : fmtDuration(Number(minutes)),
    durUnit: "min",
    refBase: "6k",
    refOff: 0,
    spm: "",
    rest: "",
  };
}

function restRow(id: string, minutes: string): BuilderRow {
  return {
    id,
    kind: "r",
    durValue: minutes === "" ? "" : fmtDuration(Number(minutes)),
    durUnit: "min",
    refBase: "6k",
    refOff: 0,
    spm: "",
    rest: "",
  };
}

function formWith(over: Partial<BuilderForm> = {}): BuilderForm {
  return {
    ...EMPTY_FORM,
    title: "Test Piece",
    pain: 3,
    rows: [defaultValidRow()],
    ...over,
  };
}

describe("rows", () => {
  it("adds a row of the requested kind", () => {
    const f = addRow(EMPTY_FORM, "r");
    expect(f.rows).toHaveLength(EMPTY_FORM.rows.length + 1);
    expect(f.rows.at(-1)!.kind).toBe("r");
  });

  // The brief names "6k" as the specific default (not "2k" or any other
  // base) for a freshly-created work row's pace reference.
  it("defaults a new row's pace reference to the 6k base with no offset", () => {
    const row = newRow("w");
    expect(row.refBase).toBe("6k");
    expect(row.refOff).toBe(0);
  });

  it("removes only the named row and leaves the form otherwise untouched", () => {
    const two = addRow(EMPTY_FORM, "r");
    const target = two.rows[0].id;
    const f = removeRow(two, target);
    expect(f.rows.map((r) => r.id)).toStrictEqual([two.rows[1].id]);
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

describe("spanStartIndex / BOOKEND_ROW_KINDS", () => {
  it("only 'wu' is a bookend kind today", () => {
    expect(BOOKEND_ROW_KINDS).toStrictEqual(["wu"]);
  });

  it("keeps a leading warm-up outside the repeat so editing a starter workout doesn't repeat it", () => {
    const f = formWith({ reps: 3, rows: [wuRow("wu1", "10"), workRow("a")] });
    expect(spanStartIndex(f)).toBe(1);
  });

  it("repeats everything when there is no bookend row", () => {
    const f = formWith({ reps: 3, rows: [workRow("a"), restRow("r1", "2")] });
    expect(spanStartIndex(f)).toBe(0);
    const out = toSteps(f);
    if (!out.ok) throw new Error("expected ok");
    expect(out.steps[0]).toStrictEqual({ k: "reps", count: 3 });
  });

  it("returns rows.length (nothing to repeat) when every row is a bookend", () => {
    const f = formWith({ rows: [wuRow("wu1", "10")] });
    expect(spanStartIndex(f)).toBe(1);
  });
});

describe("cloneRow", () => {
  // Two rows, cloning the first: with a one-row fixture, `rows.push()` and
  // `rows.splice(index + 1, 0, clone)` are indistinguishable (both leave the
  // clone at index 1). A trailing second row pins the real insertion point —
  // only splice puts the clone directly beneath "a" and ahead of "b"; push
  // would put it after "b" instead.
  it("clones a row directly beneath the original, copying every field, and returns the new id", () => {
    const f = formWith({
      rows: [
        {
          ...workRow("a"),
          durValue: "90",
          durUnit: "m",
          refBase: "2k",
          refOff: -4,
          spm: "26",
          rest: "3",
        },
        workRow("b"),
      ],
    });
    const { form: cloned, id } = cloneRow(f, "a");
    expect(cloned.rows).toHaveLength(3);
    expect(cloned.rows[0]!.id).toBe("a");
    expect(cloned.rows[1]!.id).not.toBe("a");
    expect(cloned.rows[1]!.id).not.toBe("b");
    expect(cloned.rows[2]!.id).toBe("b");
    expect(id).toBe(cloned.rows[1]!.id);
    expect(cloned.rows[1]).toMatchObject({
      kind: "w",
      durValue: "90",
      durUnit: "m",
      refBase: "2k",
      refOff: -4,
      spm: "26",
      rest: "3",
    });
  });

  it("returns the form unchanged, and the same id back, when the id isn't found", () => {
    const f = formWith();
    const result = cloneRow(f, "nope");
    expect(result.form).toBe(f);
    expect(result.id).toBe("nope");
  });
});

describe("toSteps", () => {
  it("builds a work step from valid row text", () => {
    const f = formWith({
      rows: [
        {
          id: "a",
          kind: "w",
          durValue: "5:00",
          durUnit: "min",
          refBase: "6k",
          refOff: -2,
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

  it("builds a pace ref from the structured base and offset", () => {
    const f = formWith({
      rows: [
        {
          id: "a",
          kind: "w",
          durValue: "5:00",
          durUnit: "min",
          refBase: "6k",
          refOff: -2,
          spm: "22",
          rest: "",
        },
      ],
    });
    const out = toSteps(f);
    if (!out.ok)
      throw new Error(`expected ok, got ${JSON.stringify(out.errors)}`);
    expect(out.steps[0]).toStrictEqual({
      k: "w",
      duration: { kind: "time", minutes: 5 },
      ref: { base: "6k", off: -2 },
      spm: 22,
    });
  });

  it("emits no num, so the server assigns ordering itself", () => {
    const out = toSteps(formWith());
    if (!out.ok) throw new Error("expected ok");
    expect(out).not.toHaveProperty("num");
  });

  it("emits no reps marker at x1", () => {
    const f = formWith({ reps: 1, rows: [workRow("a")] });
    const out = toSteps(f);
    if (!out.ok) throw new Error("expected ok");
    expect(out.steps.some((s) => s.k === "reps")).toBe(false);
  });

  it("emits one marker before the first non-bookend row at xN", () => {
    const f = formWith({
      reps: 4,
      rows: [wuRow("wu1", "10"), workRow("a"), restRow("r1", "5")],
    });
    const out = toSteps(f);
    if (!out.ok) throw new Error("expected ok");
    expect(out.steps.map((s) => s.k)).toStrictEqual(["wu", "reps", "w", "r"]);
    expect(out.steps[1]).toStrictEqual({ k: "reps", count: 4 });
  });

  it("rejects a form with no work step, matching the domain rule", () => {
    const f = formWith({ rows: [wuRow("a", "10")] });
    const out = toSteps(f);
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected failure");
    expect(Object.values(out.errors).join(" ")).toMatch(/work/i);
  });

  it("rejects a blank duration on a warm-up/rest row", () => {
    const f = formWith({ rows: [wuRow("a", ""), workRow("b")] });
    const out = toSteps(f);
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected failure");
    expect(out.errors["row:a:dur"]).toMatch(/duration must be minutes/);
  });

  // A clock string can only ever produce a whole number of seconds (there's
  // no way to type a fraction of a second), so the only way left to violate
  // this bound is going past the ceiling — the old "off the half-step grid"
  // shape (e.g. 5.25 minutes) isn't reachable through the field any more.
  it("rejects a warm-up/rest row's duration past the domain's 3:00:00 ceiling", () => {
    const f = formWith({
      rows: [{ ...wuRow("a", "10"), durValue: "3:00:01" }, workRow("b")],
    });
    const out = toSteps(f);
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected failure");
    expect(out.errors["row:a:dur"]).toMatch(/0:01\.\.3:00:00/);
  });

  it("enforces the domain's spm bounds", () => {
    const f = formWith({ rows: [{ ...workRow("a"), spm: "70" }] });
    expect(toSteps(f).ok).toBe(false);
  });

  it("rejects a work row's distance below the domain's 100m floor", () => {
    const f = formWith({
      rows: [{ ...workRow("a"), durValue: "50", durUnit: "m" }],
    });
    const out = toSteps(f);
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected failure");
    expect(out.errors["row:a:dur"]).toMatch(/100\.\.42195/);
  });

  it("rejects a work row's duration past the domain's 3:00:00 ceiling", () => {
    const f = formWith({
      rows: [{ ...workRow("a"), durValue: "3:00:01", durUnit: "min" }],
    });
    const out = toSteps(f);
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected failure");
    expect(out.errors["row:a:dur"]).toMatch(/0:01\.\.3:00:00/);
  });

  it("omits spm entirely when the field is empty", () => {
    const f = formWith({ rows: [{ ...workRow("a"), spm: "" }] });
    const out = toSteps(f);
    if (!out.ok) throw new Error("expected ok");
    expect(out.steps[0]).not.toHaveProperty("spm");
  });

  // Final-review fix wave item 1: rest must accept the same optional-
  // apostrophe grammar as before (parseDurationToken), not a bare Number() —
  // otherwise the literal `5'` from James's device screenshot is rejected
  // by REST while DUR accepts it, 40px apart on the same row.
  it("accepts a bare number rest, matching dur's optional apostrophe", () => {
    const f = formWith({ rows: [{ ...defaultValidRow(), rest: "5" }] });
    const out = toSteps(f);
    if (!out.ok)
      throw new Error(`expected ok, got ${JSON.stringify(out.errors)}`);
    expect(out.steps[0]).toMatchObject({ restMinutes: 5 });
  });

  it("accepts an apostrophe rest, e.g. 5'", () => {
    const f = formWith({ rows: [{ ...defaultValidRow(), rest: "5'" }] });
    const out = toSteps(f);
    if (!out.ok)
      throw new Error(`expected ok, got ${JSON.stringify(out.errors)}`);
    expect(out.steps[0]).toMatchObject({ restMinutes: 5 });
  });

  it("rejects a distance in the rest field with a message that doesn't mention the apostrophe", () => {
    const f = formWith({ rows: [{ ...defaultValidRow(), rest: "2500m" }] });
    const out = toSteps(f);
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected failure");
    expect(out.errors["row:default:rest"]).toMatch(/rest must be minutes/);
  });

  // 0.25 minutes (15s) used to violate the old half-step grid but is a
  // legal whole second under the widened bound — 61 (over the 60-minute
  // ceiling) is the value that's actually still rejected.
  it("still enforces the rest bound", () => {
    const f = formWith({ rows: [{ ...defaultValidRow(), rest: "61" }] });
    const out = toSteps(f);
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected failure");
    expect(out.errors["row:default:rest"]).toMatch(/0:01\.\.60:00/);
  });

  it("accepts a rest value that would have violated the old half-step grid, e.g. 0.25 minutes (15s)", () => {
    const f = formWith({ rows: [{ ...defaultValidRow(), rest: "0.25" }] });
    const out = toSteps(f);
    if (!out.ok)
      throw new Error(`expected ok, got ${JSON.stringify(out.errors)}`);
    expect(out.steps[0]).toMatchObject({ restMinutes: 0.25 });
  });

  it("requires a title", () => {
    const out = toSteps(formWith({ title: "" }));
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected failure");
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
        wuRow("wu", "10"),
        { ...workRow("a"), durValue: "1:00", refOff: -2 },
        restRow("b", "5"),
      ],
    });
    expect(totals(f, baselines)).toStrictEqual({
      loose: 10,
      perSet: 6,
      total: 34,
    });
  });

  it("totals bookend minutes once and the span N times", () => {
    const f = formWith({
      reps: 4,
      rows: [
        wuRow("wu1", "10"),
        { ...workRow("a"), durValue: "5:00", durUnit: "min" },
      ],
    });
    expect(totals(f, baselines)).toStrictEqual({
      loose: 10,
      perSet: 5,
      total: 30,
    });
  });

  it("estimates a distance set from the resolved pace", () => {
    // 2000m at 2k+0 = 112.0s/500m -> 4 x 112s = 448s = 7.4666 min
    const f = formWith({
      reps: 2,
      rows: [
        { ...workRow("a"), durValue: "2000", durUnit: "m", refBase: "2k" },
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
        { ...workRow("a"), durValue: "2000", durUnit: "m", refBase: "2k" },
      ],
    });
    expect(totals(f, null)).toBeNull();
  });
});

describe("fromWorkout", () => {
  it("round-trips a workout into editable rows, hoisting the reps count", () => {
    const f = fromWorkout({
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
    expect(f.reps).toBe(4);
    expect(f.rows.map((r) => r.kind)).toStrictEqual(["wu", "w"]);
    expect(f.rows[1]).toMatchObject({
      durValue: "1:00",
      durUnit: "min",
      refBase: "6k",
      refOff: -2,
      spm: "22",
    });
  });

  it("round-trips the structured ref out of a stored workout", () => {
    const f = fromWorkout({
      title: "Ladder",
      type: "AT",
      difficulty: "medium",
      pain: 3,
      steps: [
        {
          k: "w",
          duration: { kind: "time", minutes: 1 },
          ref: { base: "2k", off: 4 },
        },
      ],
    });
    expect(f.rows[0]).toMatchObject({ refBase: "2k", refOff: 4 });
  });

  it("splits a stored duration into value and unit", () => {
    const f = fromWorkout({
      title: "T",
      type: "O2",
      difficulty: "easy",
      pain: 2,
      steps: [
        {
          k: "w",
          duration: { kind: "distance", meters: 2000 },
          ref: { base: "2k", off: 0 },
        },
      ],
    });
    expect(f.rows[0]).toMatchObject({ durValue: "2000", durUnit: "m" });
  });

  it("round-trips a stored step that has no spm without adding one", () => {
    const f = fromWorkout({
      title: "T",
      type: "O2",
      difficulty: "easy",
      pain: 2,
      steps: [
        {
          k: "w",
          duration: { kind: "time", minutes: 5 },
          ref: { base: "6k", off: 0 },
        },
      ],
    });
    expect(f.rows[0].spm).toBe("");
    const out = toSteps(f);
    if (!out.ok) throw new Error("expected ok");
    expect(out.steps[0]).not.toHaveProperty("spm");
  });

  it("round-trips restMinutes so an edited workout with rest can be saved (H1/H2)", () => {
    const workout = {
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
    expect(form.rows[0].rest).toBe("2:00");

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

  it("H3: agrees with estimateMinutes for a bookend + repeated tail, including a row kind that isn't itself a bookend", () => {
    // [wu 10' bookend, w 5' repeated, r 2' repeated], reps 3. toSteps emits
    // [wu, reps, w, r] because the marker goes at spanStartIndex (right
    // after the bookend) and liveSteps repeats everything after it — so the
    // "r" row repeats even though it was never individually marked, the
    // same shape the old per-row `marked` model needed a dedicated
    // non-contiguous-marking regression test for. Under the bookend model
    // this just falls out of `r` not being in BOOKEND_ROW_KINDS.
    const f = formWith({
      reps: 3,
      rows: [
        wuRow("wu", "10"),
        { ...workRow("w"), durValue: "5:00", refBase: "2k" },
        restRow("r", "2"),
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

  // Reviewer's mutation-testing probe (M4): a mutant that buckets `totals`
  // by row KIND (`!BOOKEND_ROW_KINDS.includes(row.kind)`) instead of
  // POSITION (`i >= spanStartIndex(f)`) passes every other test in this
  // file, because every other fixture only ever puts a bookend row at the
  // very front. `+ WARM-UP` appends at the end, so a bookend row landing
  // AFTER the span start is reachable in one click — this pins that exact
  // shape. Under the kind-bucketing mutant this reports 40 (the mid-span
  // `wu` treated as always-loose, regardless of where it sits); the correct
  // positional bucketing reports 60, matching estimateMinutes.
  it("H4/M4: agrees with estimateMinutes when a bookend row sits AFTER the span start ([w, wu, w] x3)", () => {
    const f = formWith({
      reps: 3,
      rows: [
        { ...workRow("a"), durValue: "5:00" },
        wuRow("wu", "10"),
        { ...workRow("b"), durValue: "5:00" },
      ],
    });
    expect(spanStartIndex(f)).toBe(0);

    const out = toSteps(f);
    if (!out.ok)
      throw new Error(`expected ok, got ${JSON.stringify(out.errors)}`);

    const t = totals(f, baselines);
    expect(t).not.toBeNull();
    expect(Math.round(t!.total)).toBe(60);
    const estimate = estimateMinutes(out.steps, baselines);
    expect(estimate.minutes).toBe(60);
    expect(Math.round(t!.total)).toBe(estimate.minutes);
  });
});

describe("toSteps additional coverage", () => {
  it("builds a distance work step", () => {
    const f = formWith({
      rows: [
        { ...workRow("a"), durValue: "2500", durUnit: "m", refBase: "2k" },
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
      rows: [{ ...workRow("a"), refBase: "2k", refOff: 99 }],
    });
    const out = toSteps(f);
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected failure");
    expect(out.errors["row:a:ref"]).toMatch(/pace/i);
  });

  it("agrees with the domain on the ±60 pace-ref boundary (M1): +60 is accepted by both, +61 by neither", () => {
    const inside = formWith({
      rows: [{ ...workRow("a"), refBase: "2k", refOff: 60 }],
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
      rows: [{ ...workRow("a"), refBase: "2k", refOff: 61 }],
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
    const rows: BuilderRow[] = Array.from({ length: 100 }, (_, i) =>
      workRow(`r${i}`),
    );
    // 100 rows + 1 reps marker = 101 emitted steps, over the domain's cap.
    const out = toSteps(formWith({ rows, reps: 2 }));
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected failure");
    expect(out.errors.steps).toMatch(/100/);
  });

  it("allows exactly 100 emitted steps (rows plus the reps marker), and the domain agrees (M2)", () => {
    const rows: BuilderRow[] = Array.from({ length: 99 }, (_, i) =>
      workRow(`r${i}`),
    );
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
      rows: [{ ...workRow("a"), durValue: " 5:00 ", refBase: "2k" }],
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
});

describe("clock durations in rows", () => {
  it("round-trips a 45-second stored step through the form and back", () => {
    const form = fromWorkout({
      title: "Sprints",
      type: "AN",
      difficulty: "hard",
      pain: 4,
      steps: [
        {
          k: "w",
          duration: { kind: "time", minutes: 0.75 },
          ref: { base: "6k", off: 0 },
        },
      ],
    });
    expect(form.rows[0]!.durValue).toBe("0:45");
    expect(form.rows[0]!.durUnit).toBe("min");

    const res = toSteps(form);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.steps[0]).toMatchObject({
      duration: { kind: "time", minutes: 0.75 },
    });
  });

  // The masked field can never produce a bare number for a `min`-unit row
  // (ClockInput always supplies the colon) — a mutant that let
  // `rowDurationNumber` read "20" as 20 minutes still passed every other
  // test in this file, because nothing pinned the rejection directly. If a
  // bare number were readable as minutes, it would be ambiguous with the
  // old pre-Task-4 grammar, exactly the ambiguity this phase exists to kill.
  it("rejects a bare number on a min-unit row — the mask can never produce one, so it must not be silently readable as minutes", () => {
    const f = formWith({
      rows: [{ ...workRow("a"), durValue: "20", durUnit: "min" }],
    });
    const out = toSteps(f);
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected failure");
    expect(out.errors["row:a:dur"]).toBe("duration is required, e.g. 5");
  });

  it("keeps meters as a plain integer string", () => {
    const form = fromWorkout({
      title: "Distance",
      type: "O2",
      difficulty: "easy",
      pain: 2,
      steps: [
        {
          k: "w",
          duration: { kind: "distance", meters: 2000 },
          ref: { base: "2k", off: 0 },
        },
      ],
    });
    expect(form.rows[0]!.durValue).toBe("2000");
    expect(form.rows[0]!.durUnit).toBe("m");
  });

  it("summarises a clock duration without inventing a prime mark", () => {
    const row = { ...newRow("w"), durValue: "0:45", durUnit: "min" as const };
    expect(stepSummary(row)).toBe("0:45 @ 6k ±0");
    expect(stepSummary({ ...row, kind: "wu" })).toBe("0:45 warm-up");
  });

  it("rejects a duration past the ceiling and one below a second", () => {
    for (const durValue of ["3:00:01", "0:00"]) {
      const form = {
        ...newForm(),
        title: "T",
        pain: 3,
        rows: [{ ...newRow("w"), durValue, durUnit: "min" as const }],
      };
      expect(toSteps(form).ok, `${durValue}`).toBe(false);
    }
  });

  it("round-trips every whole second the field can produce", () => {
    for (const seconds of [1, 20, 45, 59, 60, 90, 3599, 3600, 10800]) {
      const minutes = seconds / 60;
      const form = fromWorkout({
        title: "T",
        type: "O2",
        difficulty: "easy",
        pain: 3,
        steps: [
          {
            k: "w",
            duration: { kind: "time", minutes },
            ref: { base: "6k", off: 0 },
          },
        ],
      });
      const res = toSteps(form);
      expect(res.ok, `${seconds}s`).toBe(true);
      if (!res.ok) continue;
      expect(res.steps[0]).toMatchObject({
        duration: { kind: "time", minutes },
      });
    }
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

describe("hasMidSpanReps (H3)", () => {
  // The reviewer's exact regression shape: a `reps` marker that sits after
  // one work step but before another. `fromWorkout` only hoists the
  // marker's COUNT into `f.reps` — the row model has no field for its
  // position — so re-saving this would silently move the marker to the
  // derived span start and change the workout's meaning (16 min stored ->
  // 36 min re-saved).
  it("flags a reps marker that isn't at the derived span start, e.g. [w, reps, w]", () => {
    const steps: Step[] = [
      {
        k: "w",
        duration: { kind: "time", minutes: 10 },
        ref: { base: "6k", off: 0 },
      },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { base: "6k", off: 0 },
      },
    ];
    expect(hasMidSpanReps(steps)).toBe(true);
  });

  it("is false when the marker sits at the derived span start, e.g. a normal [wu, reps, w]", () => {
    const steps: Step[] = [
      { k: "wu", minutes: 10 },
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: 0 },
      },
    ];
    expect(hasMidSpanReps(steps)).toBe(false);
  });

  it("is false when the marker leads a bookend-free workout, e.g. [reps, w, r]", () => {
    const steps: Step[] = [
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: 0 },
      },
      { k: "r", minutes: 2 },
    ];
    expect(hasMidSpanReps(steps)).toBe(false);
  });

  it("is false when there is no reps marker at all", () => {
    const steps: Step[] = [
      {
        k: "w",
        duration: { kind: "time", minutes: 5 },
        ref: { base: "6k", off: 0 },
      },
    ];
    expect(hasMidSpanReps(steps)).toBe(false);
  });
});

describe("rowDurationNumber's Number()-isms guard (L-low10)", () => {
  it("rejects a hex-looking duration Number() would otherwise parse as 16", () => {
    const f = formWith({ rows: [{ ...workRow("a"), durValue: "0x10" }] });
    const out = toSteps(f);
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected failure");
    expect(out.errors["row:a:dur"]).toMatch(/duration is required/);
  });

  it("rejects scientific notation Number() would otherwise parse as 1000", () => {
    const f = formWith({ rows: [{ ...workRow("a"), durValue: "1e3" }] });
    const out = toSteps(f);
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected failure");
    expect(out.errors["row:a:dur"]).toMatch(/duration is required/);
  });

  // A bare decimal like "5.5" used to be accepted (the old grammar read any
  // row's duration as a free-text number-or-apostrophe token). Now that a
  // `min`-unit row's duration is a clock string, "5.5" isn't parseable at
  // all — the equivalent half-minute value is spelled `5:30`.
  it("still accepts a half-minute expressed as a clock string", () => {
    const f = formWith({ rows: [{ ...workRow("a"), durValue: "5:30" }] });
    const out = toSteps(f);
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected ok");
    expect(out.steps[0]).toMatchObject({
      duration: { kind: "time", minutes: 5.5 },
    });
  });
});

describe("EMPTY_FORM safety (L4)", () => {
  it("is frozen, so an in-place edit throws instead of corrupting shared state", () => {
    expect(() => {
      (EMPTY_FORM as { title: string }).title = "changed";
    }).toThrow();
    expect(() => {
      (EMPTY_FORM.rows[0] as { durValue: string }).durValue = "5";
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

describe("rest seconds bridge", () => {
  it("reads an empty rest as zero seconds", () => {
    expect(restSecondsFromRow({ ...workRow("a"), rest: "" })).toBe(0);
  });

  it("reads a clock-form rest as seconds", () => {
    expect(restSecondsFromRow({ ...workRow("a"), rest: "1:30" })).toBe(90);
  });

  // A bare decimal ("1.5") isn't a clock string any more — reading it would
  // silently reintroduce the pre-Task-4 ambiguity this bridge exists to
  // remove, so it must read as no rest (0), not 90s.
  it("reads a non-clock rest as zero seconds rather than misreading it as minutes", () => {
    expect(restSecondsFromRow({ ...workRow("a"), rest: "1.5" })).toBe(0);
  });

  it("writes seconds back as a clock string, snapped to the 30s step", () => {
    const row = rowWithRestSeconds(workRow("a"), 90);
    expect(row.rest).toBe("1:30");
    expect(rowWithRestSeconds(workRow("a"), 100).rest).toBe("1:30");
  });

  it("clears rest at zero rather than storing 0:00", () => {
    expect(rowWithRestSeconds({ ...workRow("a"), rest: "2:00" }, 0).rest).toBe(
      "",
    );
  });

  it("clamps at the 15-minute ceiling", () => {
    expect(rowWithRestSeconds(workRow("a"), 99999).rest).toBe("15:00");
  });

  it("every reachable rest value is a legal domain duration, round-tripping through the stored clock string", () => {
    for (let s = 0; s <= REST_MAX_SECONDS; s += REST_STEP_SECONDS) {
      const rest = rowWithRestSeconds(workRow("a"), s).rest;
      if (rest === "") continue;
      const minutes = parseClock(rest);
      expect(minutes).not.toBeNull();
      expect(restSecondsFromRow({ ...workRow("a"), rest })).toBe(s);
      expect(minutes!).toBeLessThanOrEqual(60);
    }
  });

  it("formats seconds for display", () => {
    expect(fmtRestSeconds(0)).toBe("NONE");
    expect(fmtRestSeconds(90)).toBe("1:30");
    expect(fmtRestSeconds(600)).toBe("10:00");
  });

  // Task 5 brief's own regression shape — kept verbatim even though the
  // "rest seconds bridge" tests above already cover reading/writing/
  // clearing individually, so a reviewer can see this exact case pinned.
  it("reads and writes rest as a clock string", () => {
    const row = { ...newRow("w"), rest: "1:30" };
    expect(restSecondsFromRow(row)).toBe(90);
    expect(rowWithRestSeconds(row, 210).rest).toBe("3:30");
    expect(rowWithRestSeconds(row, 0).rest).toBe("");
  });

  // Realistic fixture (docs/TESTING.md's "test against production-shaped
  // data" rule, and this task's own brief): a real starter workout pushed
  // through fromWorkout, not a hand-built row — the exact shape (stepToRow
  // writing restMinutes as a clock string) that hid the NaN bricking bug
  // Task 4's fix wave found. "High Pressure" carries both spm and
  // restMinutes on its one work step.
  it("reads rest correctly off a real starter workout pushed through fromWorkout", () => {
    const highPressure = STARTER_WORKOUTS.find(
      (w) => w.title === "High Pressure",
    );
    if (!highPressure) throw new Error("fixture not found");
    const form = fromWorkout(highPressure);
    const workStep = form.rows.find((r) => r.kind === "w");
    if (!workStep) throw new Error("expected a work row");

    expect(workStep.rest).toBe("3:00");
    expect(workStep.spm).toBe("22");
    expect(restSecondsFromRow(workStep)).toBe(180);

    // One tap of REST − still produces a valid, saveable clock string —
    // the exact seam ("3:00" parsed with `Number()`) that used to write
    // the literal string "NaN" into the row.
    const stepped = rowWithRestSeconds(workStep, 180 - REST_STEP_SECONDS);
    expect(stepped.rest).toBe("2:30");
    const out = toSteps({ ...form, rows: [stepped] });
    expect(out.ok).toBe(true);
  });
});

describe("summaries", () => {
  it("summarises a minutes step with a signed offset", () => {
    expect(
      stepSummary({
        ...workRow("a"),
        durValue: "20:00",
        durUnit: "min",
        refBase: "6k",
        refOff: 10,
      }),
    ).toBe("20:00 @ 6k +10");
  });

  it("summarises a metres step and renders a zero offset as ±0", () => {
    expect(
      stepSummary({
        ...workRow("a"),
        durValue: "2000",
        durUnit: "m",
        refBase: "2k",
        refOff: 0,
      }),
    ).toBe("2000 m @ 2k ±0");
  });

  it("renders a negative offset with a real minus sign", () => {
    expect(
      stepSummary({
        ...workRow("a"),
        durValue: "5:00",
        durUnit: "min",
        refBase: "6k",
        refOff: -2,
      }),
    ).toBe("5:00 @ 6k −2");
  });

  it("omits the spm term when spm is free", () => {
    expect(stepSubSummary({ ...workRow("a"), spm: "", rest: "1:30" })).toBe(
      "rest 1:30",
    );
  });

  it("says rest none at zero", () => {
    expect(stepSubSummary({ ...workRow("a"), spm: "20", rest: "" })).toBe(
      "20 spm · rest none",
    );
  });

  // The landmine Task 1's review carried forward: called on a `wu`/`r` row,
  // `stepSummary` used to echo `refBase`/`refOff` straight off `newRow`'s
  // unused defaults, fabricating a pace reference ("10′ @ 6k ±0") the row
  // never represents. StepCard renders stored workouts — the 35 starters and
  // anything bulk-imported genuinely contain `wu` and standalone `r` rows —
  // so this can't stay a `w`-only assumption.
  it("summarises a warm-up row by duration and kind, with no fabricated pace reference", () => {
    expect(stepSummary(wuRow("wu1", "10"))).toBe("10:00 warm-up");
  });

  it("summarises a standalone rest row by duration and kind, with no fabricated pace reference", () => {
    // Non-default refBase/refOff on the row itself — proves the guard keys
    // off `row.kind`, not off whether the ref happens to still be blank.
    expect(
      stepSummary({ ...restRow("r1", "5"), refBase: "2k", refOff: 10 }),
    ).toBe("5:00 rest");
  });

  it("gives a wu/r row nothing to add on the sub-summary line — no fabricated spm/rest", () => {
    expect(stepSubSummary(wuRow("wu1", "10"))).toBe("");
    expect(stepSubSummary(restRow("r1", "5"))).toBe("");
  });
});

describe("addBlankStep", () => {
  it("adds an empty work step rather than a copy of the last one", () => {
    const filled: BuilderForm = {
      ...newForm(),
      rows: [
        {
          ...newRow("w"),
          durValue: "20:00",
          durUnit: "min",
          refBase: "2k",
          refOff: 5,
          spm: "27",
          rest: "3:00",
        },
      ],
    };

    const { form, id } = addBlankStep(filled);
    const added = form.rows.find((r) => r.id === id)!;

    expect(form.rows).toHaveLength(2);
    expect(added).toMatchObject({
      kind: "w",
      durValue: "",
      durUnit: "min",
      refBase: "6k",
      refOff: 0,
      spm: "",
      rest: "",
    });
    // The previous row is untouched — this is an add, not a move.
    expect(form.rows[0]).toMatchObject({ durValue: "20:00", spm: "27" });
  });

  it("still gives the first step of an empty workout its head start", () => {
    const { form, id } = addBlankStep({ ...newForm(), rows: [] });
    expect(form.rows.find((r) => r.id === id)).toMatchObject({
      durValue: "5:00",
      durUnit: "min",
      refBase: "6k",
      refOff: 0,
      spm: "22",
      rest: "1:00",
    });
  });

  it("adds a work step even when the last row is a warm-up", () => {
    const { form, id } = addBlankStep({
      ...newForm(),
      rows: [{ ...newRow("wu"), durValue: "10:00" }],
    });
    expect(form.rows.find((r) => r.id === id)!.kind).toBe("w");
  });
});
