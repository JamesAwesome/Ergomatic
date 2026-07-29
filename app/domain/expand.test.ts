import { describe, it, expect } from "vitest";
import { estimateMinutes, liveSteps, phases } from "./expand.js";
import { distanceRepeats, intervalLadder } from "./fixtures.js";

const B = { k2Seconds: 112, k6Seconds: 122 };

describe("liveSteps", () => {
  it("repeats post-marker steps count times", () => {
    expect(liveSteps(intervalLadder.steps)).toHaveLength(1 + 4 * 6);
  });
  it("is identity without a marker", () => {
    const steps = [{ k: "wu" as const, minutes: 5 }, intervalLadder.steps[2]];
    expect(liveSteps(steps)).toStrictEqual(steps);
  });
});

describe("phases", () => {
  it("expands the interval ladder to 25 phases / 50 minutes", () => {
    const p = phases(intervalLadder.steps, B, 1);
    expect(p).toHaveLength(25);
    const totalSeconds = p.reduce((s, ph) => s + (ph.seconds ?? 0), 0);
    expect(totalSeconds).toBe(50 * 60);
  });
  it("inserts a rest phase after attached-rest work steps", () => {
    const p = phases(distanceRepeats.steps, B, 1);
    // wu + 5 × (work-distance + rest)
    expect(p).toHaveLength(1 + 10);
    expect(p[1]).toMatchObject({
      type: "work",
      meters: 2500,
      targetSplit: 108,
    });
    expect(p[2]).toMatchObject({ type: "rest", seconds: 300 });
  });
  it("labels non-work phases with words, never a bare dash", () => {
    const p = phases(intervalLadder.steps, B, 1);
    expect(p[0].label).toBe("Easy");
    expect(p.at(-1)!.label).toBe("Rest");
  });
  it("marks set membership on repeated steps", () => {
    const p = phases(intervalLadder.steps, B, 1);
    expect(p[1].set).toStrictEqual({ index: 1, of: 4 });
    expect(p.at(-1)!.set).toStrictEqual({ index: 4, of: 4 });
  });
  it("expands a test step to an 'All out' phase with no timing fields", () => {
    const steps = [
      { k: "wu" as const, minutes: 5 },
      { k: "test" as const, label: "2k test" },
    ];
    const p = phases(steps, B, 1);
    expect(p).toHaveLength(2);
    expect(p[1]).toStrictEqual({
      type: "test",
      label: "All out",
      set: undefined,
    });
  });
});

describe("estimateMinutes", () => {
  it("sums exact time workouts without the estimated flag", () => {
    expect(estimateMinutes(intervalLadder.steps, B)).toStrictEqual({
      minutes: 50,
      estimated: false,
    });
  });
  it("estimates distance steps at resolved pace and flags it", () => {
    const r = estimateMinutes(distanceRepeats.steps, B);
    // 2500m at 108 s/500m = 540 s = 9 min per rep; 5 reps × (9 + 5 rest) + 10 wu = 80
    expect(r.estimated).toBe(true);
    expect(r.minutes).toBe(80);
  });
  it("ignores test-step phases (no seconds/meters) when summing duration", () => {
    const steps = [
      { k: "wu" as const, minutes: 5 },
      { k: "test" as const, label: "2k test" },
    ];
    expect(estimateMinutes(steps, B)).toStrictEqual({
      minutes: 5,
      estimated: false,
    });
  });
});
