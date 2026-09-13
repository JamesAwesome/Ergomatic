import { describe, expect, it } from "vitest";
import { GATE0_TESTS } from "./gate0Seed.js";
import { testTrend } from "./testTrend.js";

describe("testTrend — two series ascending by date, deleted-log points kept (spec §3.3, §14 ruling 4)", () => {
  it("the seed: 2k = T2 · T4 · T6 and 6k = T1 · T3 · T5, oldest first, from a newest-first input", () => {
    const trend = testTrend([...GATE0_TESTS].reverse());
    expect(trend["2k"].map((p) => p.id)).toStrictEqual(["T2", "T4", "T6"]);
    expect(trend["6k"].map((p) => p.id)).toStrictEqual(["T1", "T3", "T5"]);
    expect(trend["2k"][2]!.splitSeconds).toBe(114);
    expect(trend["6k"][0]!.date).toStrictEqual({ y: 2025, m: 11, d: 22 });
  });

  it("two tests on one day keep their input (append) order — the sort is stable", () => {
    const d = { y: 2026, m: 9, d: 11 };
    const trend = testTrend([
      { id: "first", distance: "2k", splitSeconds: 120, date: d },
      { id: "second", distance: "2k", splitSeconds: 119, date: d },
    ]);
    expect(trend["2k"].map((p) => p.id)).toStrictEqual(["first", "second"]);
    expect(trend["6k"]).toStrictEqual([]);
  });
});
