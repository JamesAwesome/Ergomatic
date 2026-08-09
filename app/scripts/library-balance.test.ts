import { describe, it, expect } from "vitest";
import {
  band,
  bucket,
  drift,
  gridMismatches,
  TARGET,
  type WorkoutStat,
} from "./library-balance.js";

// A fixed, hand-built fixture — deliberately NOT the real seed content, so
// this test exercises only the bucket math (band edges, counting, drift),
// independent of anything the strip changed in the actual library.
const FIXTURE: WorkoutStat[] = [
  { type: "O2", minutes: 19 }, // <20
  { type: "O2", minutes: 20 }, // 20-30 (lower edge is inclusive)
  { type: "O2", minutes: 29 }, // 20-30
  { type: "O2", minutes: 30 }, // 30-45 (lower edge is inclusive)
  { type: "AT", minutes: 44 }, // 30-45
  { type: "AT", minutes: 45 }, // 45-60 (lower edge is inclusive)
  { type: "AT", minutes: 59 }, // 45-60
  { type: "TR", minutes: 60 }, // 60+ (lower edge is inclusive)
  { type: "TR", minutes: 90 }, // 60+
  { type: "AN", minutes: 0 }, // <20
];

describe("band", () => {
  it("assigns the five bands with inclusive lower edges (docs/superpowers/specs/2026-08-03-workout-generation-design.md §4)", () => {
    expect(band(19)).toBe("<20");
    expect(band(20)).toBe("20-30");
    expect(band(29)).toBe("20-30");
    expect(band(30)).toBe("30-45");
    expect(band(44)).toBe("30-45");
    expect(band(45)).toBe("45-60");
    expect(band(59)).toBe("45-60");
    expect(band(60)).toBe("60+");
    expect(band(9999)).toBe("60+");
  });
});

describe("bucket", () => {
  it("counts the fixture into the exact type|band cells", () => {
    const counts = bucket(FIXTURE);
    expect(counts).toStrictEqual({
      "O2|<20": 1,
      "O2|20-30": 2,
      "O2|30-45": 1,
      "AT|30-45": 1,
      "AT|45-60": 2,
      "TR|60+": 2,
      "AN|<20": 1,
    });
  });

  it("sums to the fixture's own length across every cell", () => {
    const counts = bucket(FIXTURE);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(FIXTURE.length);
  });
});

describe("drift", () => {
  it("is actual minus target, per cell, including cells the fixture never touched", () => {
    // A target grid distinct from the real TARGET, so this test can't pass
    // by coincidentally matching the design constant.
    const flatTarget = {
      O2: { "<20": 1, "20-30": 1, "30-45": 1, "45-60": 0, "60+": 0 },
      AT: { "<20": 0, "20-30": 0, "30-45": 2, "45-60": 1, "60+": 0 },
      TR: { "<20": 0, "20-30": 0, "30-45": 0, "45-60": 0, "60+": 3 },
      AN: { "<20": 0, "20-30": 0, "30-45": 0, "45-60": 0, "60+": 0 },
    } as const;
    const d = drift(bucket(FIXTURE), flatTarget);
    expect(d["O2|<20"]).toBe(0); // 1 actual - 1 target
    expect(d["O2|20-30"]).toBe(1); // 2 - 1
    expect(d["AT|30-45"]).toBe(-1); // 1 - 2
    expect(d["AT|45-60"]).toBe(1); // 2 - 1
    expect(d["TR|60+"]).toBe(-1); // 2 - 3
    expect(d["AN|<20"]).toBe(1); // 1 - 0
    // A cell nothing landed in and target expects nothing: zero drift.
    expect(d["AN|30-45"]).toBe(0);
  });

  it("against the REAL design TARGET, an empty actual grid drifts by exactly -TARGET everywhere", () => {
    const d = drift({}, TARGET);
    expect(d["O2|<20"]).toBe(-2);
    expect(d["AN|60+"]).toBe(-3);
    const total = Object.values(d).reduce((a, b) => a + b, 0);
    expect(total).toBe(-300);
  });
});

// Arc review F9: the faithfulness check is what licenses reading the MOVED
// row at all, so it gets its own pin rather than living only in the CLI
// path. Its input in production is the BEFORE (warm-up-inclusive) replay
// over the 300 grid rows; here it is exercised against synthetic grids so
// the assertion is about the COMPARISON, not about seed content.
describe("gridMismatches", () => {
  it("is empty when every one of the 20 cells matches the design grid", () => {
    // Rebuild the exact TARGET counts as a `type|band` map.
    const perfect: Record<string, number> = {};
    for (const type of ["O2", "AT", "TR", "AN"] as const) {
      for (const b of ["<20", "20-30", "30-45", "45-60", "60+"] as const) {
        perfect[`${type}|${b}`] = TARGET[type][b];
      }
    }
    expect(gridMismatches(perfect)).toStrictEqual({});
  });

  it("names only the cells that differ, with their signed delta", () => {
    const perfect: Record<string, number> = {};
    for (const type of ["O2", "AT", "TR", "AN"] as const) {
      for (const b of ["<20", "20-30", "30-45", "45-60", "60+"] as const) {
        perfect[`${type}|${b}`] = TARGET[type][b];
      }
    }
    // The exact shape the two onboarding rows produce when they are NOT
    // excluded (O2 30-45 and AN <20 each gain one) — the case the report's
    // CHECK row shows and the verdict line deliberately filters out.
    const withOnboarding = {
      ...perfect,
      "O2|30-45": perfect["O2|30-45"]! + 1,
      "AN|<20": perfect["AN|<20"]! + 1,
    };
    expect(gridMismatches(withOnboarding)).toStrictEqual({
      "O2|30-45": 1,
      "AN|<20": 1,
    });
  });

  it("reports a MISSING cell as a negative delta, never as absent", () => {
    // An empty grid: all 20 cells differ, each by -TARGET.
    const all = gridMismatches({});
    expect(Object.keys(all)).toHaveLength(20);
    expect(all["O2|<20"]).toBe(-2);
    expect(Object.values(all).reduce((a, b) => a + b, 0)).toBe(-300);
  });
});
