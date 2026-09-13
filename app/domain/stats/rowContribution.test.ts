import { describe, expect, it } from "vitest";
import {
  rowContribution,
  stepActuals,
  stepActualSums,
  type StatsRowInput,
} from "./rowContribution.js";

function input(overrides: Partial<StatsRowInput> = {}): StatsRowInput {
  return {
    endedBy: null,
    machineWorkSeconds: null,
    machineWorkMeters: null,
    workSeconds: null,
    workMeters: null,
    distanceMeters: null,
    timeSeconds: null,
    restSeconds: null,
    restMeters: null,
    steps: [],
    totalCalories: undefined,
    ...overrides,
  };
}

// The exit-7 walk's real steps (docs/monitor/sessions/walk-2026-08-24):
// 250 m / 67.9 s and 250 m / 56.1 s, Σ 500 m / 124.0 s.
const EXIT7 = [
  { actualMeters: 250, actualSeconds: 67.9 },
  { actualMeters: 250, actualSeconds: 56.1 },
];

describe("rowContribution — the tier rule transcribed from buildHeroes (spec §3.1)", () => {
  // PM5 step actuals are FRACTIONAL (`src/monitor/driver.ts`: a finished
  // frame reads `distanceMeters: 194.1`, another 104.8), so the steps tier
  // rounds its metres like the machine and work-pair tiers do; seconds stay
  // verbatim on every tier (parity).
  it("the steps tier rounds Σ actualMeters like the other tiers and keeps seconds verbatim: 194.1 + 104.8 → 299 m, 64.3 + 86.57 s", () => {
    const c = rowContribution(
      input({
        endedBy: "finished",
        steps: [
          { actualMeters: 194.1, actualSeconds: 64.3 },
          { actualMeters: 104.8, actualSeconds: 86.57 },
        ],
      }),
    );
    expect(c.tier).toBe("steps");
    expect(c.workMeters).toBe(299);
    expect(c.workSeconds).toBeCloseTo(150.87, 6);
  });

  it("machine totals win over a work pair and over steps, metres rounded", () => {
    const c = rowContribution(
      input({
        machineWorkSeconds: 97.9,
        machineWorkMeters: 300.4,
        workSeconds: 90,
        workMeters: 280,
        steps: EXIT7,
        endedBy: "finished",
      }),
    );
    expect(c).toStrictEqual({
      tier: "machine",
      workMeters: 300,
      workSeconds: 97.9,
      restMeters: null,
      restSeconds: null,
      calories: null,
    });
  });

  it("a zero machine total is NOT a machine tier: the gate is both > 0", () => {
    const c = rowContribution(
      input({
        machineWorkSeconds: 0,
        machineWorkMeters: 500,
        workSeconds: 120,
        workMeters: 500,
      }),
    );
    expect(c.tier).toBe("work-pair");
  });

  it("the RC-1 work pair beats Σ steps even when the two disagree", () => {
    const c = rowContribution(
      input({
        workSeconds: 130.5,
        workMeters: 560.4,
        steps: EXIT7,
        endedBy: "finished",
      }),
    );
    expect(c).toMatchObject({
      tier: "work-pair",
      workMeters: 560,
      workSeconds: 130.5,
    });
  });

  it("Σ steps is trusted only when endedBy is finished or null; seconds may be null when no step carries them", () => {
    expect(
      rowContribution(input({ steps: EXIT7, endedBy: "finished" })),
    ).toMatchObject({
      tier: "steps",
      workMeters: 500,
      workSeconds: 124,
    });
    expect(
      rowContribution(input({ steps: EXIT7, endedBy: null })),
    ).toMatchObject({ tier: "steps" });
    expect(
      rowContribution(
        input({ steps: [{ actualMeters: 2000, actualSeconds: null }] }),
      ),
    ).toMatchObject({ tier: "steps", workMeters: 2000, workSeconds: null });
  });

  it.each([
    "rower",
    "link-lost",
    "program-failed",
    "program-dropped",
    "interrupted",
    "a-value-this-build-never-saw",
  ])(
    "endedBy %s DECLINES the steps tier and falls to the stored columns (allowlist, fails closed)",
    (endedBy) => {
      const c = rowContribution(
        input({ steps: EXIT7, endedBy, distanceMeters: 742, timeSeconds: 244 }),
      );
      expect(c).toMatchObject({
        tier: "stored",
        workMeters: 742,
        workSeconds: 244,
      });
    },
  );

  it("a row with nothing to sum is tier stored with null metres and seconds — still a session", () => {
    expect(rowContribution(input())).toStrictEqual({
      tier: "stored",
      workMeters: null,
      workSeconds: null,
      restMeters: null,
      restSeconds: null,
      calories: null,
    });
  });

  it("rest is the RC-1 pair verbatim and calories the stored integer; a non-integer calories value reads null", () => {
    expect(
      rowContribution(
        input({ restMeters: 242, restSeconds: 120, totalCalories: 372 }),
      ),
    ).toMatchObject({ restMeters: 242, restSeconds: 120, calories: 372 });
    expect(rowContribution(input({ totalCalories: 37.5 })).calories).toBeNull();
    expect(
      rowContribution(input({ totalCalories: "372" })).calories,
    ).toBeNull();
  });

  it("stepActuals reads only numeric actuals and shrugs at anything that is not an array of objects", () => {
    expect(stepActuals(null)).toStrictEqual([]);
    expect(stepActuals("[]")).toStrictEqual([]);
    expect(
      stepActuals([
        { label: "Work", actualMeters: 250, actualSeconds: 67.9 },
        { label: "Work", actualMeters: "250" },
        7,
        null,
      ]),
    ).toStrictEqual([
      { actualMeters: 250, actualSeconds: 67.9 },
      { actualMeters: null, actualSeconds: null },
      { actualMeters: null, actualSeconds: null },
      { actualMeters: null, actualSeconds: null },
    ]);
  });

  it("stepActualSums sums only steps carrying the field; none → null, never 0", () => {
    expect(stepActualSums([])).toStrictEqual({ meters: null, seconds: null });
    expect(
      stepActualSums([
        { actualMeters: 250, actualSeconds: null },
        { actualMeters: null, actualSeconds: 56.1 },
      ]),
    ).toStrictEqual({ meters: 250, seconds: 56.1 });
  });
});
