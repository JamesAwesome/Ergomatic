import { describe, it, expect } from "vitest";
import { estimateMinutes, phases } from "../../domain/expand.js";
import { distanceRepeats, intervalLadder } from "../../domain/fixtures.js";
import type { Difficulty, WorkoutType } from "../../domain/types.js";
import { validateWorkoutInput } from "../../domain/validate.js";
import { PLANS, STARTER_WORKOUTS } from "./starter.js";

// Reference baselines for composition checks (splits in seconds per 500 m).
const BASELINES = { k2Seconds: 112, k6Seconds: 122 };

const TYPES: WorkoutType[] = ["AN", "O2", "AT", "TR"];
const DIFFS: Difficulty[] = ["easy", "medium", "hard"];

const band = (m: number): string => {
  if (m < 30) return "<30";
  if (m < 45) return "30-45";
  if (m < 60) return "45-60";
  return "60+";
};

describe("STARTER_WORKOUTS", () => {
  it("every entry passes validateWorkoutInput", () => {
    for (const w of STARTER_WORKOUTS) {
      const r = validateWorkoutInput(w);
      expect(r.ok, `${w.title}: ${r.ok ? "" : r.errors.join("; ")}`).toBe(true);
    }
  });

  // Phase 5G Task 2's compatibility sweep: the seeded set is entirely
  // split refs today (Task 6 is where effort refs get added to it), so this
  // proves the new effort-ref branches in validate.ts/expand.ts left every
  // existing workout's validation and phase-expansion behavior unchanged.
  // Lives here (not domain/expand.test.ts) because app/domain/ is
  // dependency-zero and must not import server/seed/starter — this file
  // already imports both STARTER_WORKOUTS and the domain functions under
  // test, same pattern src/builder/builderState.test.ts and
  // src/builder/nameGenerator.test.ts use for the same reason.
  //
  // The first version of this test only checked `Number.isFinite(minutes)`
  // and `typeof estimated === "boolean"` — existence, not behavior (the
  // repo's recurring failure #4). A reviewer injected +1000s into every
  // resolved split and the sweep stayed green. This version pins the exact
  // `estimateMinutes` output per workout, generated once from the current
  // code, so a pacing regression like that produces a hard mismatch instead
  // of a silently-true type check.
  //
  // Hand-verified arithmetic for three entries (methodology mirrors
  // expand.ts's estimateMinutes: time-based phase seconds sum exactly;
  // distance-based phase seconds are estimated as
  // (meters/500)×resolvedSplit; the total is rounded to the nearest minute
  // only at the very end):
  //
  //   Zephyr — wu 5' + 20' continuous work, both time-based:
  //     5 + 20 = 25 minutes exactly (estimated: false).
  //
  //   Dust Devil — wu 5' + 6×(0.5' work + 2' rest), all time-based:
  //     5 + 6×(0.5 + 2) = 5 + 6×2.5 = 5 + 15 = 20 minutes exactly
  //     (estimated: false).
  //
  //   Storm Front — wu 5' + 4×(3000 m work @ 6k+2 + 6' rest), distance work:
  //     split = k6Seconds(122) + off(2) = 124 s/500m
  //     work seconds/rep = (3000/500)×124 = 6×124 = 744s
  //     rest seconds/rep = 6×60 = 360s
  //     total = 300 (wu) + 4×744 + 4×360 = 300 + 2976 + 1440 = 4716s
  //     4716 / 60 = 78.6 → rounds to 79 minutes (estimated: true).
  const EXPECTED_MINUTES: ReadonlyArray<
    readonly [title: string, minutes: number, estimated: boolean]
  > = [
    ["Zephyr", 25, false],
    ["Drizzle", 35, false],
    ["Trade Winds", 45, false],
    ["Halcyon", 28, false],
    ["Doldrums", 50, false],
    ["Westerlies", 56, false],
    ["Monsoon", 65, false],
    ["Mackerel Sky", 50, false],
    ["Jet Stream", 48, true],
    ["High Pressure", 74, false],
    ["Isobar", 41, false],
    ["Warm Front", 34, false],
    ["Tailwind", 26, false],
    ["Cold Front", 58, true],
    ["Low Pressure", 59, false],
    ["Crosswind", 67, true],
    ["Storm Front", 79, true],
    ["Headwind", 61, false],
    ["Dust Devil", 20, false],
    ["Brickfielder", 28, false],
    ["Squall", 45, false],
    ["Haboob", 44, true],
    ["Sirocco", 60, false],
    ["Microburst", 35, false],
    ["Williwaw", 53, false],
    ["Derecho", 66, false],
    ["Waterspout", 21, false],
    ["Anvil Cloud", 22, false],
    ["Gale", 40, false],
    ["Cyclone", 41, false],
    ["Cloudburst", 52, true],
    ["Nor'easter", 27, true],
    ["Thunderhead", 52, true],
    ["Tempest", 42, true],
    ["Storm Surge", 53, false],
  ];

  it("every seeded starter workout validates and resolves to its pinned exact minutes", () => {
    expect(STARTER_WORKOUTS.map((w) => w.title)).toStrictEqual(
      EXPECTED_MINUTES.map(([title]) => title),
    );
    const actual = STARTER_WORKOUTS.map((w) => {
      const res = validateWorkoutInput(w);
      expect(res.ok, `${w.title}`).toBe(true);
      const { minutes, estimated } = estimateMinutes(w.steps, BASELINES);
      return [w.title, minutes, estimated] as const;
    });
    expect(actual).toStrictEqual(EXPECTED_MINUTES);
  });

  it("pins Storm Front's full phase expansion exactly (marker + distance + rest + spm)", () => {
    const stormFront = STARTER_WORKOUTS.find((w) => w.title === "Storm Front");
    expect(stormFront).toBeDefined();
    const work = {
      type: "work",
      targetKind: "split",
      targetSplit: 124, // k6Seconds(122) + off(2)
      spm: 26,
      label: "2:03.0–2:05.0", // toleranceRange(124, 1)
      meters: 3000,
    };
    const rest = { type: "rest", seconds: 360, label: "Rest" };
    expect(phases(stormFront!.steps, BASELINES, 1)).toStrictEqual([
      { type: "warmup", seconds: 300, label: "Easy", set: undefined },
      { ...work, set: { index: 1, of: 4 } },
      { ...rest, set: { index: 1, of: 4 } },
      { ...work, set: { index: 2, of: 4 } },
      { ...rest, set: { index: 2, of: 4 } },
      { ...work, set: { index: 3, of: 4 } },
      { ...rest, set: { index: 3, of: 4 } },
      { ...work, set: { index: 4, of: 4 } },
      { ...rest, set: { index: 4, of: 4 } },
    ]);
  });

  it("sortOrders are exactly 1..N with no gaps or duplicates", () => {
    const order = STARTER_WORKOUTS.map((w) => w.sortOrder).sort(
      (a, b) => a - b,
    );
    expect(order).toStrictEqual(
      Array.from({ length: STARTER_WORKOUTS.length }, (_, i) => i + 1),
    );
  });

  it("has ~35 workouts", () => {
    expect(STARTER_WORKOUTS).toHaveLength(35);
  });

  it("titles are unique and collide with no domain fixture", () => {
    const titles = STARTER_WORKOUTS.map((w) => w.title);
    expect(new Set(titles).size).toBe(titles.length);
    expect(titles).not.toContain(intervalLadder.title);
    expect(titles).not.toContain(distanceRepeats.title);
  });

  it("covers every type × difficulty combination at least twice", () => {
    for (const t of TYPES) {
      for (const d of DIFFS) {
        const n = STARTER_WORKOUTS.filter(
          (w) => w.type === t && w.difficulty === d,
        ).length;
        expect(n, `${t}/${d}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("fills every time band with at least 6 workouts at reference baselines", () => {
    const counts: Record<string, number> = {
      "<30": 0,
      "30-45": 0,
      "45-60": 0,
      "60+": 0,
    };
    for (const w of STARTER_WORKOUTS) {
      counts[band(estimateMinutes(w.steps, BASELINES).minutes)] += 1;
    }
    for (const [b, n] of Object.entries(counts)) {
      expect(n, `band ${b}`).toBeGreaterThanOrEqual(6);
    }
  });

  it("includes at least 6 workouts with distance-based work steps", () => {
    const withDistance = STARTER_WORKOUTS.filter((w) =>
      w.steps.some((s) => s.k === "w" && s.duration.kind === "distance"),
    );
    expect(withDistance.length).toBeGreaterThanOrEqual(6);
  });

  it("prescribes spm on every work step, within 18..32", () => {
    for (const w of STARTER_WORKOUTS) {
      for (const s of w.steps) {
        if (s.k !== "w") continue;
        expect(s.spm, `${w.title}: work step missing spm`).toBeDefined();
        expect(s.spm, `${w.title}`).toBeGreaterThanOrEqual(18);
        expect(s.spm, `${w.title}`).toBeLessThanOrEqual(32);
      }
    }
  });

  it("bands spm by methodology: O2 18-22, AT 22-26, TR 24-28, AN 26-32", () => {
    const bands: Record<WorkoutType, [number, number]> = {
      O2: [18, 22],
      AT: [22, 26],
      TR: [24, 28],
      AN: [26, 32],
    };
    for (const w of STARTER_WORKOUTS) {
      const [lo, hi] = bands[w.type];
      for (const s of w.steps) {
        if (s.k !== "w" || s.spm === undefined) continue;
        expect(s.spm, `${w.title} (${w.type})`).toBeGreaterThanOrEqual(lo);
        expect(s.spm, `${w.title} (${w.type})`).toBeLessThanOrEqual(hi);
      }
    }
  });

  it("assigns pain sensibly: easy O2 stays low, hard AN/TR stays high", () => {
    const easyO2 = STARTER_WORKOUTS.filter(
      (w) => w.type === "O2" && w.difficulty === "easy",
    );
    expect(easyO2.length).toBeGreaterThan(0);
    for (const w of easyO2) {
      expect(w.pain, `${w.title}`).toBeLessThanOrEqual(2);
    }

    const hardAnTr = STARTER_WORKOUTS.filter(
      (w) => (w.type === "AN" || w.type === "TR") && w.difficulty === "hard",
    );
    expect(hardAnTr.length).toBeGreaterThan(0);
    for (const w of hardAnTr) {
      expect(w.pain, `${w.title}`).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("PLANS re-export", () => {
  it("exposes both presets for review context", () => {
    expect(PLANS.sprint.sessions).toHaveLength(84);
    expect(PLANS.head.sessions).toHaveLength(84);
  });
});
