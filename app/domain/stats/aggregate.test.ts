import { describe, expect, it } from "vitest";
import { presetRange } from "./calendar.js";
import { earliestDate, summarize, timeByType } from "./aggregate.js";
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

  // James's ruling 17 (2026-09-12): the seam count and the watts exclusion
  // cover ONLY `source === "pm5"` rows in the stored tier. A timer row is
  // what the rower typed — `LogSession.tsx`'s save carries only
  // timeSeconds/distanceMeters and no steps actuals, so it lands in the
  // stored tier by shape, and it is work by definition: never in k. (It is
  // not a MACHINE row either — ruling 1 — so the MACHINE column's watts
  // figure does not see it; nothing on the surface excludes it.)
  it("ruling 17: a timer row in the stored tier is never counted in k ROWS PREDATE, and counts in ALL metres and time", () => {
    const timer = {
      id: "T-timer",
      loggedAt: "2026-09-10T12:00:00.000Z",
      date: { y: 2026, m: 9, d: 10 },
      source: "timer" as const,
      workoutType: "AT" as const,
      tier: "stored" as const,
      workMeters: 2000,
      workSeconds: 480,
      restMeters: null,
      restSeconds: null,
      calories: null,
    };
    const s = summarize(
      [...GATE0_ROWS, timer],
      presetRange("all", GATE0_TODAY),
    );
    expect(s.storedTierRows).toBe(1); // still R1 alone
    expect(s.all.meters).toBe(58752);
    expect(s.all.sessions).toBe(14);
    expect(s.machine.avgWatts).toBe(176);
    const timerOnly = summarize([timer], presetRange("all", GATE0_TODAY));
    expect(timerOnly.storedTierRows).toBe(0);
  });

  // M7's gate, CONSUMER HALF (number-provenance §2, narrowed by James
  // 2026-09-19). METRES and TIME sum over every machine row; AVG WATTS
  // skips the `stored` tier. Those are two populations, and the reason
  // the three cells still describe ONE is that a pm5 row in the stored
  // tier carries no distance and no time to contribute — see
  // `summaryModel.test.ts`'s producer half for why it cannot have them.
  //
  // This is the half that says the asymmetry is HARMLESS; that one says
  // it is UNREACHABLE. Either alone is an argument, not a gate.
  it("M7: METRES would move for a stored-tier pm5 row while AVG WATTS would not — which is why the producer may never emit one that carries a distance", () => {
    // THE ASYMMETRY ITSELF, pinned rather than described. This row is a
    // HYPOTHETICAL: a pm5 row in the stored tier carrying a real
    // distance. Nothing in the app can produce one — that is the
    // producer half's job — and this assertion is what says why that
    // matters, by showing what the column would print if one arrived.
    const hypothetical = {
      id: "M-hypothetical",
      loggedAt: "2026-09-10T12:00:00.000Z",
      date: { y: 2026, m: 9, d: 10 },
      source: "pm5" as const,
      workoutType: "AT" as const,
      tier: "stored" as const,
      workMeters: 5000,
      workSeconds: 1200,
      restMeters: null,
      restSeconds: null,
      calories: null,
    };
    const base = summarize(GATE0_ROWS, presetRange("all", GATE0_TODAY));
    const withIt = summarize(
      [...GATE0_ROWS, hypothetical],
      presetRange("all", GATE0_TODAY),
    );
    // METRES and TIME take it...
    expect(withIt.machine.meters).toBe(base.machine.meters + 5000);
    expect(withIt.machine.seconds).toBe(base.machine.seconds + 1200);
    // ...and AVG WATTS does not. Three cells, two populations — safe
    // only while the row above cannot exist.
    expect(withIt.machine.avgWatts).toBe(base.machine.avgWatts);
  });

  it("M7: the pm5 stored-tier row this build CAN produce moves nothing at all, and is still counted as a session", () => {
    // Nothing measured, so the save carried no distance and no time.
    const nothingMeasured = {
      id: "M-nothing",
      loggedAt: "2026-09-10T12:00:00.000Z",
      date: { y: 2026, m: 9, d: 10 },
      source: "pm5" as const,
      workoutType: "AT" as const,
      tier: "stored" as const,
      workMeters: null,
      workSeconds: null,
      restMeters: null,
      restSeconds: null,
      calories: null,
    };

    const before = summarize(GATE0_ROWS, presetRange("all", GATE0_TODAY));
    const after = summarize(
      [...GATE0_ROWS, nothingMeasured],
      presetRange("all", GATE0_TODAY),
    );

    // Every figure the MACHINE column prints is untouched...
    expect(after.machine.meters).toBe(before.machine.meters);
    expect(after.machine.seconds).toBe(before.machine.seconds);
    expect(after.machine.avgWatts).toBe(before.machine.avgWatts);
    expect(after.all.meters).toBe(before.all.meters);
    expect(after.all.seconds).toBe(before.all.seconds);

    // ...while the row itself is genuinely there, counted as a session
    // and seen by the seam counter. Without this the assertions above
    // would pass on a row the range had simply excluded.
    expect(after.all.sessions).toBe(before.all.sessions + 1);
    expect(after.storedTierRows).toBe(before.storedTierRows + 1);
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

describe("earliestDate — the first row's date for ALL's range line (§14 ruling 21)", () => {
  it("the seed's earliest is R1, 2025-11-08, whatever the input order; no rows → null", () => {
    expect(earliestDate([...GATE0_ROWS].reverse())).toStrictEqual({
      y: 2025,
      m: 11,
      d: 8,
    });
    expect(earliestDate([])).toBeNull();
  });
});
