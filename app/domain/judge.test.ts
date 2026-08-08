import { describe, expect, it } from "vitest";
import { judgeActual, PACE_TOLERANCE_SECONDS, SPM_TOLERANCE } from "./judge.js";

describe("judgeActual: pace boundaries (PACE_TOLERANCE_SECONDS = 2)", () => {
  const target = 120;

  it("is 'within' exactly AT the tolerance below target — the boundary itself is not a deviation", () => {
    expect(
      judgeActual({
        kind: "pace",
        actual: target - PACE_TOLERANCE_SECONDS,
        target,
        stale: false,
      }),
    ).toBe("within");
  });

  // A SMALLER split is a FASTER boat, so a number below the target is
  // MORE effort than asked — `"over"`, the ochre state (7B Task 6; the
  // handoff's own table and its `1:57.8` vs `TARGET 2:00.0` mockup, drawn
  // ochre). This is the direction Task 3 had numerically inverted.
  it("is 'over' one second FASTER than the tolerance allows (a smaller split)", () => {
    expect(
      judgeActual({
        kind: "pace",
        actual: target - PACE_TOLERANCE_SECONDS - 1,
        target,
        stale: false,
      }),
    ).toBe("over");
  });

  it("is 'within' exactly AT the tolerance above target — the boundary itself is not a deviation", () => {
    expect(
      judgeActual({
        kind: "pace",
        actual: target + PACE_TOLERANCE_SECONDS,
        target,
        stale: false,
      }),
    ).toBe("within");
  });

  it("is 'under' one second SLOWER than the tolerance allows (a bigger split)", () => {
    expect(
      judgeActual({
        kind: "pace",
        actual: target + PACE_TOLERANCE_SECONDS + 1,
        target,
        stale: false,
      }),
    ).toBe("under");
  });

  // The two kinds do NOT share a direction, which is the whole reason the
  // rule lives in this one function: the same arithmetic sign means
  // opposite things for a split and for a stroke rate.
  it("rate and pace disagree on direction for the same sign of error", () => {
    const faster = judgeActual({
      kind: "pace",
      actual: target - 10,
      target,
      stale: false,
    });
    const slowerRate = judgeActual({
      kind: "spm",
      actual: 12,
      target: 22,
      stale: false,
    });
    expect(faster).toBe("over");
    expect(slowerRate).toBe("under");
  });

  it("is 'within' when actual exactly equals target", () => {
    expect(
      judgeActual({ kind: "pace", actual: target, target, stale: false }),
    ).toBe("within");
  });
});

describe("judgeActual: spm boundaries (SPM_TOLERANCE = 2)", () => {
  const target = 20;

  it("is 'within' exactly AT the tolerance below target", () => {
    expect(
      judgeActual({
        kind: "spm",
        actual: target - SPM_TOLERANCE,
        target,
        stale: false,
      }),
    ).toBe("within");
  });

  it("is 'under' one stroke past the tolerance below target", () => {
    expect(
      judgeActual({
        kind: "spm",
        actual: target - SPM_TOLERANCE - 1,
        target,
        stale: false,
      }),
    ).toBe("under");
  });

  it("is 'within' exactly AT the tolerance above target", () => {
    expect(
      judgeActual({
        kind: "spm",
        actual: target + SPM_TOLERANCE,
        target,
        stale: false,
      }),
    ).toBe("within");
  });

  it("is 'over' one stroke past the tolerance above target", () => {
    expect(
      judgeActual({
        kind: "spm",
        actual: target + SPM_TOLERANCE + 1,
        target,
        stale: false,
      }),
    ).toBe("over");
  });
});

describe("judgeActual: stale overrides everything", () => {
  it("reads 'stale' even when actual is deep 'over' territory", () => {
    expect(
      judgeActual({ kind: "pace", actual: 200, target: 120, stale: true }),
    ).toBe("stale");
  });

  // Task-3 review's own mutation (stale demoted to "only wins if the
  // non-stale path would already be 'within'"): the deep-over test above
  // still catches that bug, but the other two tests in this block
  // (actual===target; both null) pass EVEN UNDER the wrong precedence,
  // because those particular fixtures already resolve to "within" on
  // their own — coincidence, not proof. This fixture is the minimal case
  // that isolates precedence from magnitude: `target + tolerance + 1` is
  // the SMALLEST actual that reads "over" at all (one past the boundary),
  // so a precedence bug has nowhere to hide behind "well, it was an
  // extreme value anyway."
  it("reads 'stale' even one unit past the 'over' boundary — the minimal over case, not just a deep outlier (pins precedence, not coincidence)", () => {
    expect(
      judgeActual({
        kind: "pace",
        actual: 120 + PACE_TOLERANCE_SECONDS + 1,
        target: 120,
        stale: true,
      }),
    ).toBe("stale");
  });

  it("reads 'stale' even when actual exactly equals target", () => {
    expect(
      judgeActual({ kind: "spm", actual: 20, target: 20, stale: true }),
    ).toBe("stale");
  });

  it("reads 'stale' even when actual and/or target are null", () => {
    expect(
      judgeActual({ kind: "pace", actual: null, target: null, stale: true }),
    ).toBe("stale");
  });
});

describe("judgeActual: a null actual or target is never judged — 'within'", () => {
  it("null actual, real target", () => {
    expect(
      judgeActual({ kind: "pace", actual: null, target: 120, stale: false }),
    ).toBe("within");
  });

  it("real actual, null target (an effort/warmup/rest/test phase has none)", () => {
    expect(
      judgeActual({ kind: "pace", actual: 118, target: null, stale: false }),
    ).toBe("within");
  });

  it("both null", () => {
    expect(
      judgeActual({ kind: "spm", actual: null, target: null, stale: false }),
    ).toBe("within");
  });
});

describe("judgeActual: 'hr'/'meters' are not judged by this task — always 'within'", () => {
  it("hr, deep outside any plausible band, still reads 'within' (no tolerance pinned)", () => {
    expect(
      judgeActual({ kind: "hr", actual: 200, target: 140, stale: false }),
    ).toBe("within");
  });

  it("meters, deep outside any plausible band, still reads 'within' (no tolerance pinned)", () => {
    expect(
      judgeActual({ kind: "meters", actual: 100, target: 500, stale: false }),
    ).toBe("within");
  });
});
