import { describe, it, expect } from "vitest";
import { estimateMinutes } from "../domain/expand.js";
import { LIBRARY_WORKOUTS } from "../server/seed/library/index.js";
import {
  band,
  BASELINES,
  bucket,
  debtRegressions,
  DESIGN_GRID_2026_08_03,
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

  it("against the REAL rebalance TARGET, an empty actual grid drifts by exactly -TARGET everywhere", () => {
    // TARGET is patterns.json's `targets` block since the 2026-08-10
    // rebalance — warm-up-FREE, and the same object library.test.ts's quota
    // gate reads. These two cells are the ones the solve adjusted off §2's
    // draft (<20 4 -> 5, AN 60+ 4 unchanged but AN <20 12 -> 14).
    const d = drift({}, TARGET);
    expect(d["O2|<20"]).toBe(-5);
    expect(d["AN|60+"]).toBe(-4);
    expect(d["AN|<20"]).toBe(-14);
    const total = Object.values(d).reduce((a, b) => a + b, 0);
    expect(total).toBe(-300);
  });

  it("keeps the two grids distinct — the warm-up-free TARGET is not the 2026-08-03 design grid", () => {
    // The bug this pins: pointing the faithfulness check at TARGET, or the
    // AFT-TGT row at the design grid, silently compares warm-up-inclusive
    // counts against warm-up-free ones. They must stay two objects.
    expect(TARGET).not.toStrictEqual(DESIGN_GRID_2026_08_03);
    expect(DESIGN_GRID_2026_08_03.O2["<20"]).toBe(2);
    expect(TARGET.O2["<20"]).toBe(5);
    const sum = (g: typeof TARGET): number =>
      Object.values(g).reduce(
        (a, row) => a + Object.values(row).reduce((x, y) => x + y, 0),
        0,
      );
    expect(sum(TARGET)).toBe(300);
    expect(sum(DESIGN_GRID_2026_08_03)).toBe(300);
  });
});

// gridMismatches has two production call sites now (see its own doc
// comment): the default rod (DESIGN_GRID_2026_08_03) backs the HISTORICAL
// note behind library-balance.ts's `--history` flag (arc review F9's
// original faithfulness check, which read empty once, on 2026-08-09, and
// is not expected to any more post-rebalance); an explicit `TARGET` rod
// backs the live ACCEPTANCE gate main() prints by default. Both are
// exercised here against synthetic grids so the assertion is about the
// COMPARISON, not about seed content — the real-seed version of the
// ACCEPTANCE gate has its own describe block below.
describe("gridMismatches", () => {
  it("is empty when every one of the 20 cells matches the 2026-08-03 design grid (the historical rod)", () => {
    // Rebuild the exact design-grid counts as a `type|band` map. The default
    // rod is DESIGN_GRID_2026_08_03, not TARGET: this check exists to prove
    // the warm-up-INCLUSIVE replay reproduces the warm-up-INCLUSIVE grid.
    const perfect: Record<string, number> = {};
    for (const type of ["O2", "AT", "TR", "AN"] as const) {
      for (const b of ["<20", "20-30", "30-45", "45-60", "60+"] as const) {
        perfect[`${type}|${b}`] = DESIGN_GRID_2026_08_03[type][b];
      }
    }
    expect(gridMismatches(perfect)).toStrictEqual({});
  });

  it("defaults to the design grid, so a perfect TARGET grid does NOT read as faithful — passing TARGET explicitly is the live ACCEPTANCE gate", () => {
    const perfectTarget: Record<string, number> = {};
    for (const type of ["O2", "AT", "TR", "AN"] as const) {
      for (const b of ["<20", "20-30", "30-45", "45-60", "60+"] as const) {
        perfectTarget[`${type}|${b}`] = TARGET[type][b];
      }
    }
    expect(gridMismatches(perfectTarget)).not.toStrictEqual({});
    expect(gridMismatches(perfectTarget, TARGET)).toStrictEqual({});
  });

  it("names only the cells that differ, with their signed delta", () => {
    const perfect: Record<string, number> = {};
    for (const type of ["O2", "AT", "TR", "AN"] as const) {
      for (const b of ["<20", "20-30", "30-45", "45-60", "60+"] as const) {
        perfect[`${type}|${b}`] = DESIGN_GRID_2026_08_03[type][b];
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
    // -2 is the DESIGN grid's O2 <20, not TARGET's 5 — the default rod.
    expect(Object.values(all).reduce((a, b) => a + b, 0)).toBe(-300);
  });
});

// The one deliberate exception to this file's "synthetic fixture, not real
// seed" rule (see the top-of-file comment): this IS the claim
// library-balance.ts's default CLI output makes as its ACCEPTANCE
// statement ("AFTER matches patterns.targets exactly"), so it gets a real
// assertion against the real library rather than living only as something
// a human reads off a script run. Re-derives the count from LIBRARY_WORKOUTS
// + estimateMinutes, exactly as main() does, rather than asserting any
// hand-copied numbers.
describe("the ACCEPTANCE gate (library-balance.ts's default output, post-2026-08-10-rebalance)", () => {
  it("reads empty against the real library: AFTER lands on patterns.targets in all 20 cells", () => {
    const counts = bucket(
      LIBRARY_WORKOUTS.map((w): WorkoutStat => ({
        type: w.type,
        minutes: estimateMinutes(w.steps, BASELINES)!.minutes,
      })),
    );
    expect(gridMismatches(counts, TARGET)).toStrictEqual({});
  });
});

describe("debtRegressions (the rebalance ratchet, block review §7)", () => {
  const target = {
    O2: { "<20": 5, "20-30": 14, "30-45": 34, "45-60": 18, "60+": 19 },
    AT: { "<20": 8, "20-30": 20, "30-45": 32, "45-60": 12, "60+": 3 },
    TR: { "<20": 12, "20-30": 23, "30-45": 29, "45-60": 7, "60+": 4 },
    AN: { "<20": 14, "20-30": 17, "30-45": 18, "45-60": 7, "60+": 4 },
  } as const;
  const baseline = {
    O2: { "<20": 2, "20-30": 0, "30-45": 0, "45-60": -2, "60+": 0 },
    AT: { "<20": 0, "20-30": 0, "30-45": 0, "45-60": 0, "60+": 0 },
    TR: { "<20": 0, "20-30": 0, "30-45": 0, "45-60": 0, "60+": 0 },
    AN: { "<20": 0, "20-30": 0, "30-45": 0, "45-60": 0, "60+": 0 },
  } as const;
  const counts = (over: Record<string, number>): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const type of ["O2", "AT", "TR", "AN"] as const) {
      for (const b of ["<20", "20-30", "30-45", "45-60", "60+"] as const) {
        out[`${type}|${b}`] = target[type][b] + (baseline[type][b] as number);
      }
    }
    return { ...out, ...over };
  };

  it("passes the branch's own starting point — the baseline IS the debt today", () => {
    expect(debtRegressions(counts({}), target, baseline)).toStrictEqual([]);
  });

  it("passes content that closes debt, in one cell or all of them", () => {
    expect(
      debtRegressions(
        counts({ "O2|<20": target.O2["<20"] + 1, "O2|45-60": 17 }),
        target,
        baseline,
      ),
    ).toStrictEqual([]);
    // Every cell exactly on target — the phase's end state.
    const perfect: Record<string, number> = {};
    for (const type of ["O2", "AT", "TR", "AN"] as const) {
      for (const b of ["<20", "20-30", "30-45", "45-60", "60+"] as const) {
        perfect[`${type}|${b}`] = target[type][b];
      }
    }
    expect(debtRegressions(perfect, target, baseline)).toStrictEqual([]);
  });

  it("FAILS a cell whose debt grew", () => {
    expect(
      debtRegressions(
        counts({ "O2|<20": target.O2["<20"] + 3 }),
        target,
        baseline,
      ),
    ).toStrictEqual(["O2|<20: debt 3, worse than the baseline 2"]);
  });

  it("FAILS a cell the content walked straight through", () => {
    // Baseline debt +2, now −1: closer to zero, but on the wrong side.
    expect(
      debtRegressions(
        counts({ "O2|<20": target.O2["<20"] - 1 }),
        target,
        baseline,
      ),
    ).toStrictEqual(["O2|<20: debt -1 overshot the baseline 2"]);
  });

  it("FAILS a compensating pair the old per-type-sum check let through", () => {
    // The exact hole the block review named: +1 here, −1 there, so the type
    // still sums to its total and the debt still nets to zero — and both
    // cells are further from the grid than they started.
    const bad = counts({
      "AT|20-30": target.AT["20-30"] + 1,
      "AT|30-45": target.AT["30-45"] - 1,
    });
    expect(debtRegressions(bad, target, baseline)).toStrictEqual([
      "AT|20-30: debt 1, worse than the baseline 0",
      "AT|30-45: debt -1, worse than the baseline 0",
    ]);
  });
});
