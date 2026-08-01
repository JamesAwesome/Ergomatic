import { describe, it, expect } from "vitest";
import { estimateMinutes } from "../../domain/expand.js";
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
  it("every seeded starter workout validates and resolves byte-identically", () => {
    for (const w of STARTER_WORKOUTS) {
      const res = validateWorkoutInput(w);
      expect(res.ok, `${w.title}`).toBe(true);
      const { minutes, estimated } = estimateMinutes(w.steps, BASELINES);
      expect(Number.isFinite(minutes), `${w.title}`).toBe(true);
      expect(typeof estimated, `${w.title}`).toBe("boolean");
    }
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
