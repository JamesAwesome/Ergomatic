import { describe, expect, it } from "vitest";
import { buildC2Intervals } from "./intervals.js";
import type { LogStep } from "../stores/logs.js";

// The exit-7 walk's two intervals as PR 1 stores them (`e2e/screenshots
// .spec.ts`'s own seed) plus PR 2's rest keys: 67.9 s / 250 m / rest 60 s /
// 147 m and 56.1 s / 250 m / rest 60 s / 95 m; target 2:07.0 at 26 spm.
// Expected literals are hand computed: 67.9 s → 679 tenths; 2:07.0 =
// 127.0 s → 1270; rest 60 s → 600.
const STEP_1: LogStep = {
  label: "250m @ 2:07.0",
  targetSplit: 127.0,
  actualSplit: 135.8,
  actualSeconds: 67.9,
  actualSource: "pm5",
  meters: 250,
  actualMeters: 250,
  actualSpm: 25,
  spm: 26,
  avgHr: 142,
  machineCalories: 16,
  machineCalPerHour: 848,
  machineWatts: 140,
  machineDragFactor: 100,
  machineRestHr: null,
  machineRestSeconds: 60,
  machineRestMeters: 147,
};
const STEP_2: LogStep = {
  ...STEP_1,
  actualSplit: 112.2,
  actualSeconds: 56.1,
  actualSpm: 28,
  avgHr: undefined,
  machineRestHr: 120,
  machineRestMeters: 95,
};

describe("buildC2Intervals (Phase LP PR 2, spec §5)", () => {
  it("maps every stored step to the API's interval object — integers only, targets per interval, heart_rate keys only when present", () => {
    expect(buildC2Intervals([STEP_1, STEP_2])).toStrictEqual([
      {
        type: "distance",
        time: 679,
        distance: 250,
        rest_time: 600,
        rest_distance: 147,
        stroke_rate: 25,
        calories_total: 16,
        heart_rate: { average: 142 },
        targets: { pace: 1270, stroke_rate: 26 },
      },
      {
        type: "distance",
        time: 561,
        distance: 250,
        rest_time: 600,
        rest_distance: 95,
        stroke_rate: 28,
        calories_total: 16,
        heart_rate: { rest: 120 },
        targets: { pace: 1270, stroke_rate: 26 },
      },
    ]);
  });

  it("a time-prescribed step is type time; a zero rest posts rest_time 0 AND rest_distance 0 (0 is a value); no targets object when the step stored none", () => {
    const step: LogStep = {
      label: "1:00",
      seconds: 60,
      actualSource: "pm5",
      actualSeconds: 60,
      actualMeters: 197,
      machineRestSeconds: 0,
      machineRestMeters: 0,
    };
    expect(buildC2Intervals([step])).toStrictEqual([
      {
        type: "time",
        time: 600,
        distance: 197,
        rest_time: 0,
        rest_distance: 0,
      },
    ]);
  });

  it("returns null — no array, never a partial one — when any step lacks a REQUIRED key: a manual step, a dropped boundary, a pre-PR-2 row, or an empty list", () => {
    expect(
      buildC2Intervals([STEP_1, { ...STEP_2, actualSource: "assumed" }]),
    ).toBeNull();
    expect(
      buildC2Intervals([STEP_1, { ...STEP_2, actualSeconds: undefined }]),
    ).toBeNull();
    const { machineRestSeconds: _r, ...prePr2 } = STEP_2;
    expect(buildC2Intervals([STEP_1, prePr2])).toBeNull();
    expect(buildC2Intervals([])).toBeNull();
  });

  it("rounds the work distance to a whole metre and drops a non-integer optional rather than sending it", () => {
    const out = buildC2Intervals([
      { ...STEP_1, actualMeters: 249.6, actualSpm: 25.4 },
    ]);
    expect(out?.[0]?.distance).toBe(250);
    expect(out?.[0]).not.toHaveProperty("stroke_rate");
  });

  it("a 0 calorie interval posts calories_total 0 — a value, not an absence", () => {
    expect(
      buildC2Intervals([{ ...STEP_1, machineCalories: 0 }])?.[0]
        ?.calories_total,
    ).toBe(0);
  });
});
