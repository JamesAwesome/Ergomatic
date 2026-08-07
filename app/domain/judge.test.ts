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

  it("is 'under' one second past the tolerance below target", () => {
    expect(
      judgeActual({
        kind: "pace",
        actual: target - PACE_TOLERANCE_SECONDS - 1,
        target,
        stale: false,
      }),
    ).toBe("under");
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

  it("is 'over' one second past the tolerance above target", () => {
    expect(
      judgeActual({
        kind: "pace",
        actual: target + PACE_TOLERANCE_SECONDS + 1,
        target,
        stale: false,
      }),
    ).toBe("over");
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
