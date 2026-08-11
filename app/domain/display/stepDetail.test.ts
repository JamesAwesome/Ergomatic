import { describe, expect, it } from "vitest";
import {
  peakIndex,
  pieceList,
  structureLine,
  workAndTotal,
} from "./stepDetail.js";
import type { Baselines, Step } from "../types.js";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index.js";

const B: Baselines = { k2Seconds: 118, k6Seconds: 125 };
const w = (
  min: number,
  off: number,
  spm?: number,
  restMinutes?: number,
): Step => ({
  k: "w",
  duration: { kind: "time", minutes: min },
  ref: { base: "6k", off },
  ...(spm !== undefined ? { spm } : {}),
  ...(restMinutes !== undefined ? { restMinutes } : {}),
});

describe("pieceList", () => {
  it("renders the mock's short card: two pieces, rest on the first only", () => {
    const rows = pieceList([w(18, 10, 22, 3), w(9, 6, 24)], B);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      duration: "18:00",
      refTextFull: "at 6k +10",
      refTextCompact: "at +10",
      restText: "3′ r",
      split: "2:15.0",
      spm: 22,
      off: 10,
    });
    expect(rows[1].restText).toBeNull();
    expect(rows[1].split).toBe("2:11.0");
  });

  it("DEVIATION: a trailing rest on the last piece is SHOWN", () => {
    const rows = pieceList([w(5, 4, undefined, 2), w(5, 4, undefined, 2)], B);
    expect(rows[1].restText).toBe("2′ r");
  });

  it("expands a reps block into per-piece rows (James's ruling)", () => {
    const steps: Step[] = [{ k: "reps", count: 3 }, w(5, 10, 24, 2)];
    const rows = pieceList(steps, B);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.duration === "5:00")).toBe(true);
    expect(rows[2].restText).toBe("2′ r"); // authored on the step; deviation shows it
  });

  it("offset 0 reads 'at 6k pace' in both forms; fractional rest uses the clock", () => {
    const rows = pieceList([w(8, 0, 28, 2.5), w(2, 4)], B);
    expect(rows[0].refTextFull).toBe("at 6k pace");
    expect(rows[0].refTextCompact).toBe("at 6k pace");
    expect(rows[0].restText).toBe("2:30 r");
  });

  it("mixed bases keep the base in compact form", () => {
    const steps: Step[] = [
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "2k", off: 4 },
      },
      w(10, 8),
    ];
    const rows = pieceList(steps, B);
    expect(rows[0].refTextCompact).toBe("at 2k +4");
    expect(rows[1].refTextCompact).toBe("at 6k +8");
  });

  it("effort pieces: word in effortText, no split, no off", () => {
    const steps: Step[] = [
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { effort: "max" },
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { effort: "min" },
      },
    ];
    const rows = pieceList(steps, B);
    expect(rows[0]).toMatchObject({
      effortText: "ALL OUT",
      split: null,
      off: null,
    });
    expect(rows[1].effortText).toBe("EASY");
  });

  it("distance pieces put meters in the duration slot and price the split", () => {
    const steps: Step[] = [
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "6k", off: -4 },
        restMinutes: 1,
      },
    ];
    const rows = pieceList(steps, B);
    expect(rows[0].duration).toBe("500m");
    expect(rows[0].split).toBe("2:01.0");
  });

  it("a standalone r step attaches to the preceding piece", () => {
    const steps: Step[] = [w(18, 10), { k: "r", minutes: 3 }, w(9, 6)];
    const rows = pieceList(steps, B);
    expect(rows[0].restText).toBe("3′ r");
    expect(rows[1].restText).toBeNull();
  });

  it("a test step is a row: label in the duration slot, nothing else", () => {
    const steps: Step[] = [
      w(10, 8, undefined, 2),
      { k: "test", label: "All out" },
    ];
    const rows = pieceList(steps, B);
    expect(rows[1]).toMatchObject({
      duration: "All out",
      refTextFull: null,
      effortText: null,
      split: null,
    });
  });

  it("a leading rest (nothing precedes it) is dropped, not attached forward", () => {
    const steps: Step[] = [{ k: "r", minutes: 5 }, w(10, 8)];
    const rows = pieceList(steps, B);
    expect(rows).toHaveLength(1);
    expect(rows[0].restText).toBeNull();
  });

  it("two consecutive rests on one piece: the first shown wins", () => {
    const steps: Step[] = [w(5, 4, undefined, 2), { k: "r", minutes: 3 }];
    const rows = pieceList(steps, B);
    expect(rows).toHaveLength(1);
    expect(rows[0].restText).toBe("2′ r");
  });
});

describe("peakIndex", () => {
  it("min |off| among the visible window, ties to the LATER row", () => {
    const rows = pieceList(
      [
        w(2, 6, 22, 2),
        w(4, 4, 24, 2),
        w(6, 2, 26, 2),
        w(8, 0, 28, 2),
        w(6, 2, 26, 2),
        w(4, 4, 24, 2),
        w(2, 6, 22),
      ],
      B,
    );
    expect(peakIndex(rows, 4)).toBe(3); // the mock's 04-of-7
    expect(peakIndex(rows, rows.length)).toBe(3); // 0 beats the +2 tie rule
  });
  it("an actual tie in |off| (equal magnitude, opposite sign) goes to the LATER row", () => {
    // The symmetric-pyramid test above never exercises the tie branch
    // itself: its unique off-0 row always wins outright (0 < 2 is a
    // strict win, not a tie), so a `<=`→`<` mutant survives it. This one
    // has no unique minimum — both rows tie at |off| = 2.
    const rows = pieceList([w(5, 2, 22, 2), w(5, -2, 24)], B);
    expect(peakIndex(rows, 2)).toBe(1);
  });
  it("peak behind the cap means NO tint; all-effort means NO tint", () => {
    const rows = pieceList(
      [
        w(2, 8, 22, 2),
        w(4, 6, 24, 2),
        w(6, 4, 26, 2),
        w(8, 6, 28, 2),
        w(6, 0, 26),
      ],
      B,
    );
    expect(peakIndex(rows, 4)).toBeNull(); // true peak (off 0) is row 5
    const effort = pieceList(
      [
        {
          k: "w",
          duration: { kind: "time", minutes: 1 },
          ref: { effort: "max" },
          restMinutes: 1,
        },
        {
          k: "w",
          duration: { kind: "time", minutes: 1 },
          ref: { effort: "max" },
        },
      ],
      B,
    );
    expect(peakIndex(effort, 2)).toBeNull();
  });
});

describe("workAndTotal", () => {
  it("the mock's arithmetic: 18+9 work, +3 rest", () => {
    expect(workAndTotal([w(18, 10, 22, 3), w(9, 6, 24)], B)).toStrictEqual({
      workMinutes: 27,
      totalMinutes: 30,
    });
  });
  it("WORK + displayed rests equals TOTAL under the deviation", () => {
    const steps = [w(5, 4, undefined, 2), w(5, 4, undefined, 2)];
    const { workMinutes, totalMinutes } = workAndTotal(steps, B);
    expect(totalMinutes - workMinutes).toBe(4); // both rests, trailing included
  });
  it("a test step has no seconds to estimate: contributes 0 to WORK", () => {
    const steps: Step[] = [
      w(10, 8, undefined, 2),
      { k: "test", label: "All out" },
    ];
    expect(workAndTotal(steps, B)).toStrictEqual({
      workMinutes: 10,
      totalMinutes: 12,
    });
  });
});

describe("structureLine", () => {
  const line = (steps: Step[]) => structureLine(steps);

  it("format 1, single piece", () => {
    expect(line([w(10, 14)])).toBe("10:00 @ 6K+14");
  });
  it("format 2, uniform repeats via reps marker and via identical pieces", () => {
    expect(line([{ k: "reps", count: 3 }, w(5, 10, undefined, 2)])).toBe(
      "3 × 5:00 @ 6K+10 · 2′ REST",
    );
    expect(line([w(4, 12, undefined, 1), w(4, 12)])).toBe(
      "2 × 4:00 @ 6K+12 · 1′ REST",
    );
  });
  it("format 3, two unequal pieces: offsets-only range, zero renders the base", () => {
    expect(line([w(18, 10, undefined, 3), w(9, 6)])).toBe(
      "18:00 + 9:00 @ +10 → +6 · 3′ REST",
    );
    expect(line([w(18, 6, undefined, 3), w(9, 0)])).toBe(
      "18:00 + 9:00 @ +6 → 6K · 3′ REST",
    );
  });
  it("format 4, chain ≤8 with max→min range; fractional minutes as clock", () => {
    expect(
      line([
        w(2, 6, undefined, 2),
        w(4, 4, undefined, 2),
        w(6, 2, undefined, 2),
        w(8, 0, undefined, 2),
        w(6, 2, undefined, 2),
        w(4, 4, undefined, 2),
        w(2, 6),
      ]),
    ).toBe("2-4-6-8-6-4-2 @ +6 → 6K · 2′ REST");
    expect(line([w(4.5, 4, undefined, 1), w(2, 2)])).toBe(
      "4:30 + 2:00 @ +4 → +2 · 1′ REST",
    );
  });
  it("format 5, count fallback past 8 pieces (range kept when split refs exist)", () => {
    const steps: Step[] = [
      { k: "reps", count: 4 },
      w(2, 8, undefined, 1),
      w(1, 2, undefined, 1),
      w(3, 4, undefined, 1),
    ];
    expect(line(steps)).toBe("12 PIECES @ +8 → +2 · 1′ REST");
  });
  it("format 6, mixed frames name each base; effort prints its word", () => {
    const steps: Step[] = [
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "2k", off: 4 },
        restMinutes: 2,
      },
      w(10, 8),
    ];
    expect(line(steps)).toBe("4:00 @ 2K+4 + 10:00 @ 6K+8 · 2′ REST");
    expect(
      line([
        {
          k: "w",
          duration: { kind: "time", minutes: 5 },
          ref: { effort: "max" },
          restMinutes: 3,
        },
        w(10, 8),
      ]),
    ).toBe("5:00 @ MAX + 10:00 @ 6K+8 · 3′ REST");
  });
  it("format 7, distance", () => {
    const steps: Step[] = [
      { k: "reps", count: 8 },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "6k", off: -4 },
        restMinutes: 1,
      },
    ];
    expect(line(steps)).toBe("8 × 500m @ 6K−4 · 1′ REST");
  });
  it("unequal rests drop the rest clause; a test step forces the count form", () => {
    expect(line([w(4, 8, undefined, 2), w(4, 8, undefined, 1), w(4, 8)])).toBe(
      "3 × 4:00 @ 6K+8",
    );
    expect(
      line([w(10, 8, undefined, 2), { k: "test", label: "All out" }]),
    ).toBe("2 PIECES @ 6K+8 · 2′ REST");
  });
  it("a leading rest with nothing to attach to is dropped; nothing left renders empty", () => {
    expect(line([{ k: "r", minutes: 5 }])).toBe("");
  });
  it("property: every one of the 300 real workouts produces a sane line", () => {
    for (const wk of LIBRARY_WORKOUTS) {
      const out = structureLine(wk.steps);
      expect(out.length, `${wk.title}`).toBeGreaterThan(0);
      expect(out, `${wk.title}`).not.toMatch(/undefined|NaN/);
    }
  });
});
