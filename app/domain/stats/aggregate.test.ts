import { describe, expect, it } from "vitest";
import { presetRange } from "./calendar.js";
import { summarize, timeByType } from "./aggregate.js";
import { GATE0_ROWS, GATE0_TODAY } from "./gate0Seed.js";

// Every expected value is `compute.mjs`'s printout for the Gate 0 seed
// (spec §8.5), typed as an independent literal — never derived here.
describe("summarize — the Gate 0 seed, today = 2026-09-12 (spec §8.5, invariant 18)", () => {
  const all = summarize(GATE0_ROWS, presetRange("all", GATE0_TODAY));

  it("ALL: 56,752 m · 14379.3 s · 13 sessions; one stored-tier row (R1) in range", () => {
    expect(all.all.meters).toBe(56752);
    expect(all.all.seconds).toBeCloseTo(14379.3, 6);
    expect(all.all.sessions).toBe(13);
    expect(all.storedTierRows).toBe(1);
  });

  it("MACHINE: 36,752 m over 10 rows, 8 carry the monitor's own totals, rest 718, calories 1,731 on 8 rows, avg watts 176 over the nine non-stored rows", () => {
    const { seconds, ...rest } = all.machine;
    expect(seconds).toBeCloseTo(9271.1, 6);
    expect(rest).toStrictEqual({
      meters: 36752,
      sessions: 10,
      ownTotals: 8,
      restMeters: 718,
      calories: 1731,
      caloriesRows: 8,
      avgWatts: 176,
    });
  });

  it("the presets select the right rows: SEASON 43,012 (9 rows) · 30 DAYS 18,000 · MONTH 5,000", () => {
    expect(
      summarize(GATE0_ROWS, presetRange("season", GATE0_TODAY)).all,
    ).toMatchObject({ meters: 43012, sessions: 9 });
    expect(
      summarize(GATE0_ROWS, presetRange("30d", GATE0_TODAY)).all.meters,
    ).toBe(18000);
    expect(
      summarize(GATE0_ROWS, presetRange("month", GATE0_TODAY)).all.meters,
    ).toBe(5000);
  });

  it("AVG WATTS excludes the stored-tier row: with R1 counted the figure would be 174, not 176 (§14 ruling 6)", () => {
    const withR1Fused = GATE0_ROWS.map((r) =>
      r.id === "R1" ? { ...r, tier: "machine" as const } : r,
    );
    expect(
      summarize(withR1Fused, { from: null, to: null }).machine.avgWatts,
    ).toBe(174);
  });

  it("an empty range: every total 0, sessions 0, avg watts undefined (a dash)", () => {
    const empty = summarize(GATE0_ROWS, {
      from: { y: 2030, m: 1, d: 1 },
      to: { y: 2030, m: 1, d: 31 },
    });
    expect(empty.all).toStrictEqual({ meters: 0, seconds: 0, sessions: 0 });
    expect(empty.machine.avgWatts).toBeUndefined();
    expect(empty.machine.sessions).toBe(0);
  });

  it("a null-metres row still counts as a session (invariant 3)", () => {
    const rows = [{ ...GATE0_ROWS[0]!, workMeters: null, workSeconds: null }];
    expect(summarize(rows, { from: null, to: null }).all).toStrictEqual({
      meters: 0,
      seconds: 0,
      sessions: 1,
    });
  });
});

describe("timeByType — five buckets in stack order, empty buckets omitted (invariant 17)", () => {
  it("the seed's ALL buckets: AN 822.6 · AT 3819.4 · O2 6244.0 · TR 1387.3 · NO TYPE 2106.0, summing to the TIME row", () => {
    const buckets = timeByType(GATE0_ROWS, { from: null, to: null });
    expect(buckets.map((b) => [b.key, b.seconds])).toStrictEqual([
      ["AN", 822.6],
      ["AT", 3819.4],
      ["O2", 6244],
      ["TR", 1387.3],
      ["NO TYPE", 2106],
    ]);
    expect(buckets.reduce((s, b) => s + b.seconds, 0)).toBeCloseTo(14379.3, 6);
    expect(buckets.map((b) => Math.round(b.share * 100))).toStrictEqual([
      6, 27, 43, 10, 15,
    ]);
  });

  it("the three manual rows (R2 · R9 · R10) have no AN and no NO TYPE bucket — no segment, no legend row", () => {
    const manual = GATE0_ROWS.filter((r) => r.source === "manual");
    expect(
      timeByType(manual, { from: null, to: null }).map((b) => b.key),
    ).toStrictEqual(["AT", "O2", "TR"]);
  });

  it("no rows in range: no buckets, and no division by zero", () => {
    expect(
      timeByType(GATE0_ROWS, {
        from: { y: 2030, m: 1, d: 1 },
        to: { y: 2030, m: 1, d: 1 },
      }),
    ).toStrictEqual([]);
  });
});
