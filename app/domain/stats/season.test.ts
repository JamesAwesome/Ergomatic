import { describe, expect, it } from "vitest";
import { toDayNumber } from "./calendar.js";
import { GATE0_ROWS, GATE0_TODAY } from "./gate0Seed.js";
import { seasonSummary, streakOf } from "./season.js";
import type { DatedStatsRow } from "./statsRow.js";

// Independent literals throughout (RF21): every date is typed, every
// expected figure is `compute.mjs`'s printout or hand arithmetic shown in
// the test name. W1..W5 = the Monday-start weeks of 2026-08-10 … 09-07.
const W = {
  W1: { y: 2026, m: 8, d: 10 },
  W2: { y: 2026, m: 8, d: 17 },
  W3: { y: 2026, m: 8, d: 24 },
  W4: { y: 2026, m: 8, d: 31 },
  W5: { y: 2026, m: 9, d: 7 },
};
const key = (d: { y: number; m: number; d: number }) => toDayNumber(d);
const weeks = (...ds: { y: number; m: number; d: number }[]) =>
  new Set(ds.map(key));

function row(
  id: string,
  date: { y: number; m: number; d: number },
  workMeters: number | null = 1000,
): DatedStatsRow {
  return {
    id,
    loggedAt: "",
    date,
    source: "manual",
    workoutType: null,
    tier: workMeters === null ? "stored" : "steps",
    workMeters,
    workSeconds: null,
    restMeters: null,
    restSeconds: null,
    calories: null,
  };
}

describe("streakOf — weeks by ROWS; an unfinished week never breaks a streak (spec §3.3, invariant 10)", () => {
  it("rows in W1, W2, W4 with today in W5 (empty): CURRENT falls back to last week → 1; LONGEST 2", () => {
    expect(
      streakOf(weeks(W.W1, W.W2, W.W4), { y: 2026, m: 9, d: 12 }),
    ).toStrictEqual({
      current: 1,
      longest: 2,
    });
  });
  it("rows in W1, W2, W4, W5 with today in W5: current 2, longest 2", () => {
    expect(
      streakOf(weeks(W.W1, W.W2, W.W4, W.W5), { y: 2026, m: 9, d: 12 }),
    ).toStrictEqual({ current: 2, longest: 2 });
  });
  it("rows in W1, W2, W4 with today in W4: current 1", () => {
    expect(
      streakOf(weeks(W.W1, W.W2, W.W4), { y: 2026, m: 9, d: 2 }).current,
    ).toBe(1);
  });
  it("no rows: 0 and 0; a week two back with nothing since: current 0, longest 1", () => {
    expect(streakOf(new Set(), GATE0_TODAY)).toStrictEqual({
      current: 0,
      longest: 0,
    });
    expect(streakOf(weeks(W.W3), GATE0_TODAY)).toStrictEqual({
      current: 0,
      longest: 1,
    });
  });
});

describe("seasonSummary — ONE unfiltered row set: May 1 … today (invariant 19)", () => {
  it("the seed: 9 rows, 43,012 m, 135 days, avg 318.6 (prints 319), 9 points ascending, streak 3 / 3, season 2027", () => {
    const s = seasonSummary(GATE0_ROWS, GATE0_TODAY);
    expect(s.season.name).toBe(2027);
    expect(s.rows).toBe(9);
    expect(s.total).toBe(43012);
    expect(s.days).toBe(135);
    expect(Math.round(s.avgPerDay)).toBe(319);
    expect(s.points.map((p) => p.cumulative)).toStrictEqual([
      8000, 10000, 13012, 15012, 25012, 33012, 38012, 41012, 43012,
    ]);
    expect(s.points[0]!.date).toStrictEqual({ y: 2026, m: 5, d: 14 });
    expect(s.streak).toStrictEqual({ current: 3, longest: 3 });
  });

  it("boundary rows (spec §8.5 a): a row on 2026-05-01 and one on today both count — 11 rows, 46,012 m, the May 1 point first", () => {
    const rows = [
      ...GATE0_ROWS,
      row("may1", { y: 2026, m: 5, d: 1 }, 1000),
      row("today", { y: 2026, m: 9, d: 12 }, 2000),
    ];
    const s = seasonSummary(rows, GATE0_TODAY);
    expect(s.rows).toBe(11);
    expect(s.total).toBe(46012);
    expect(s.points[0]!.date).toStrictEqual({ y: 2026, m: 5, d: 1 });
    expect(s.points[s.points.length - 1]!.cumulative).toBe(46012);
    // May 1 2026 is a Friday: its week KEY is Monday Apr 27, before
    // season.start — the key is kept (the ROW is in season). Alone it joins
    // nothing: {3, 3}.
    expect(s.streak).toStrictEqual({ current: 3, longest: 3 });
  });

  it("a run straddling May 1 counts from May 1's own week: May 1 (key Apr 27) + May 6 + May 20 join R5 (May 14) into FOUR weeks — {3, 4}; clamping keys to season.start would read {3, 3}", () => {
    const rows = [
      ...GATE0_ROWS,
      row("may1", { y: 2026, m: 5, d: 1 }),
      row("may6", { y: 2026, m: 5, d: 6 }),
      row("may20", { y: 2026, m: 5, d: 20 }),
    ];
    expect(seasonSummary(rows, GATE0_TODAY).streak).toStrictEqual({
      current: 3,
      longest: 4,
    });
  });

  it("a row on 2026-04-30 is the PREVIOUS season: not counted with today = 2026-09-12; with today = 2026-04-30 it is, and 2025-04-30 is not", () => {
    const apr30 = row("apr30", { y: 2026, m: 4, d: 30 }, 5000);
    expect(seasonSummary([...GATE0_ROWS, apr30], GATE0_TODAY).total).toBe(
      43012,
    );
    const lastSeason = seasonSummary(
      [
        apr30,
        row("old", { y: 2025, m: 4, d: 30 }, 700),
        row("first", { y: 2025, m: 5, d: 1 }, 300),
      ],
      { y: 2026, m: 4, d: 30 },
    );
    expect(lastSeason.season.name).toBe(2026);
    expect(lastSeason.total).toBe(5300);
    expect(lastSeason.days).toBe(365);
  });

  it("fixture (b): an older four-week run inside the season — rows on May 20 and May 27 join R5 (May 14) and R6 (Jun 2) — LONGEST 4, CURRENT still 3", () => {
    const rows = [
      ...GATE0_ROWS,
      row("b1", { y: 2026, m: 5, d: 20 }),
      row("b2", { y: 2026, m: 5, d: 27 }),
    ];
    expect(seasonSummary(rows, GATE0_TODAY).streak).toStrictEqual({
      current: 3,
      longest: 4,
    });
  });

  it("fixture (c): the seed with R13 dropped — this week is empty, CURRENT falls back to last week: 2 / 2", () => {
    const rows = GATE0_ROWS.filter((r) => r.id !== "R13");
    expect(seasonSummary(rows, GATE0_TODAY).streak).toStrictEqual({
      current: 2,
      longest: 2,
    });
    expect(seasonSummary(rows, GATE0_TODAY).total).toBe(41012);
  });

  it("the null-metres pin: W2's only row has null metres and still counts — current 2, longest 2 with today in W2; the total ignores it", () => {
    const rows = [
      row("w1", { y: 2026, m: 8, d: 12 }, 1000),
      row("w2", { y: 2026, m: 8, d: 19 }, null),
    ];
    const s = seasonSummary(rows, { y: 2026, m: 8, d: 20 });
    expect(s.streak).toStrictEqual({ current: 2, longest: 2 });
    expect(s.total).toBe(1000);
    expect(s.rows).toBe(2);
  });

  it("on May 1 the divisor is 1: one 1,000 m row that day reads avg 1,000", () => {
    const s = seasonSummary([row("x", { y: 2026, m: 5, d: 1 }, 1000)], {
      y: 2026,
      m: 5,
      d: 1,
    });
    expect(s.days).toBe(1);
    expect(s.avgPerDay).toBe(1000);
    expect(s.season.name).toBe(2027);
  });

  // §14 ruling 22: LONGEST is the longest run WITHIN this season — a run
  // that ends before May 1 never counts, and never joins a May streak.
  it("the pre-May-1 pin: four April weeks beside the seed leave LONGEST 3; four April weeks and one May 5 row with today = May 6 read current 1, longest 1", () => {
    const april = [
      row("a1", { y: 2026, m: 4, d: 8 }),
      row("a2", { y: 2026, m: 4, d: 15 }),
      row("a3", { y: 2026, m: 4, d: 22 }),
      row("a4", { y: 2026, m: 4, d: 29 }),
    ];
    expect(
      seasonSummary([...GATE0_ROWS, ...april], GATE0_TODAY).streak,
    ).toStrictEqual({ current: 3, longest: 3 });
    expect(
      seasonSummary([...april, row("m", { y: 2026, m: 5, d: 5 })], {
        y: 2026,
        m: 5,
        d: 6,
      }).streak,
    ).toStrictEqual({ current: 1, longest: 1 });
  });

  it("two rows on one date are ONE point whose metres are their sum", () => {
    const s = seasonSummary(
      [
        row("a", { y: 2026, m: 6, d: 1 }, 100),
        row("b", { y: 2026, m: 6, d: 1 }, 200),
      ],
      GATE0_TODAY,
    );
    expect(s.points).toStrictEqual([
      { date: { y: 2026, m: 6, d: 1 }, meters: 300, cumulative: 300 },
    ]);
    expect(s.rows).toBe(2);
  });
});
