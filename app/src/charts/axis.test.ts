import { describe, it, expect } from "vitest";
import {
  ADVANCE,
  chooseTicks,
  formatTick,
  labelRoom,
  niceMax,
} from "./axis.js";
import { domainFromReadings } from "./scale.js";
import { fmtSplit } from "../../domain/format.js";

describe("chooseTicks", () => {
  it("returns round values that fall inside the domain", () => {
    const ticks = chooseTicks([85, 115], 4);
    expect(ticks.length).toBeGreaterThan(0);
    for (const t of ticks) {
      expect(t).toBeGreaterThanOrEqual(85);
      expect(t).toBeLessThanOrEqual(115);
    }
    // Ticks land on a clean step (a "round" number), not an arbitrary
    // division of the domain.
    expect(ticks.length).toBeGreaterThan(1);
    const step = ticks[1] - ticks[0];
    const niceSteps = [1, 2, 5, 10, 20, 25, 50, 100];
    expect(niceSteps).toContain(step);
  });

  it("returns an empty array for a degenerate or backwards domain", () => {
    expect(chooseTicks([10, 10], 4)).toStrictEqual([]);
    expect(chooseTicks([10, 5], 4)).toStrictEqual([]);
  });

  it("returns an empty array for a non-positive tick count", () => {
    expect(chooseTicks([0, 100], 0)).toStrictEqual([]);
  });

  it("produces ticks that increase monotonically with no duplicates", () => {
    const ticks = chooseTicks([0, 254], 5); // hr domain, 20..254 bpm band
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]).toBeGreaterThan(ticks[i - 1]);
    }
  });

  // The four cases below walk the "nice number" step selector's full
  // fraction range (< 1.5, < 3, < 7, else) so every rounding branch is
  // exercised, not just whichever one the earlier domains happened to hit.
  it("rounds a raw step with fraction < 1.5 to a step of 1x", () => {
    const ticks = chooseTicks([0, 20], 3); // raw step 10, fraction 1 -> step 10
    expect(ticks).toStrictEqual([0, 10, 20]);
  });

  it("rounds a raw step with fraction in [1.5, 3) up to a step of 2x", () => {
    const ticks = chooseTicks([0, 50], 3); // raw step 25, fraction 2.5 -> step 20
    expect(ticks).toStrictEqual([0, 20, 40]);
  });

  it("rounds a raw step with fraction in [3, 7) up to a step of 5x", () => {
    const ticks = chooseTicks([0, 254], 5); // raw step 63.5, fraction 6.35 -> step 50
    expect(ticks).toStrictEqual([0, 50, 100, 150, 200, 250]);
  });

  it("rounds a raw step with fraction >= 7 up to a step of 10x", () => {
    const ticks = chooseTicks([0, 900], 2); // raw step 900, fraction 9 -> step 1000
    expect(ticks).toStrictEqual([0]); // only one multiple of 1000 lands in [0, 900]
  });
});

describe("formatTick", () => {
  it("formats a pace tick with the house fmtSplit formatter, never a bespoke one", () => {
    expect(formatTick(130, "pace")).toBe("2:10.0");
    expect(formatTick(130, "pace")).toBe(fmtSplit(130));
  });

  it("formats a rate tick as a rounded stroke-rate number", () => {
    expect(formatTick(28.4, "rate")).toBe("28");
    expect(formatTick(28.6, "rate")).toBe("29");
  });

  it("formats an hr tick as a rounded bpm number", () => {
    expect(formatTick(150.5, "hr")).toBe("151");
  });

  // trace-truth Task 3, spec §4: `Sample.t` is TENTHS of a second — the
  // formatter takes tenths, never seconds, and routes through the house
  // `fmtDuration`, never a bespoke `m:ss` formatter.
  it("formats a time tick as m:ss from tenths of a second", () => {
    expect(formatTick(0, "time")).toBe("0:00");
    expect(formatTick(2422, "time")).toBe("4:02"); // step-3's own final t
    expect(formatTick(600, "time")).toBe("1:00");
  });
});

// Phase PS PR 2 (career-stats spec §5 items 3/5/6).
describe("formatTick split and metres", () => {
  it("split prints a whole-second m:ss with no tenths: 115 → 1:55, 120 → 2:00, 125 → 2:05", () => {
    expect([115, 120, 125].map((v) => formatTick(v, "split"))).toStrictEqual([
      "1:55",
      "2:00",
      "2:05",
    ]);
  });
  // Gate 0A, ruling 1 (James, 2026-09-14). A metres GRIDLINE is a scale
  // marker, not a figure: the full grouping needs a seventh glyph past
  // 100,000 and every gutter in the repo was hand-tuned against six, which
  // is how a production frame came to read `L00,000`. The exact figure the
  // card carries beside these (`122,000` on a bar, `163,012 TODAY`) keeps
  // its grouping — ruling 3, same gate.
  it("metres prints a shortened thousands tick, 0 at the floor", () => {
    expect(formatTick(0, "metres")).toBe("0");
    expect(formatTick(5000, "metres")).toBe("5k");
    expect(formatTick(20000, "metres")).toBe("20k");
    expect(formatTick(150000, "metres")).toBe("150k");
  });
  // `niceMax` floors its ladder at `base = 1000`, so every tick above zero
  // is a whole thousand and no `0k` is reachable — the low end the
  // antagonist attacked this shape at. Pinned with an independent literal
  // rather than by calling `niceMax` here (RF21: a gate that imports the
  // constant it exists to gate retunes with it).
  it("never prints a fractional or zero k above the floor", () => {
    for (const step of [1000, 2000, 5000, 10000, 20000, 50000]) {
      expect(formatTick(step, "metres")).toBe(`${step / 1000}k`);
    }
    expect(formatTick(1000000, "metres")).toBe("1000k");
  });
});

// Gate 0A, ruling 1: invariant I4 — no constant reserving space for text is
// chosen by looking at a chart. The advances are MEASURED, in Chromium, and
// the arithmetic here is what four charts now derive their gutters from.
describe("labelRoom — the space a set of formatted labels needs", () => {
  it("takes the widest label, at the class's own advance, plus the gap", () => {
    // 5 glyphs x 5.94 = 29.7, ceil 30, + 6 of anchor gap.
    expect(labelRoom(["1000k"], ADVANCE.spaced, 6)).toBe(36);
    // The widest wins, not the last or the first.
    expect(labelRoom(["0", "1000k", "50k"], ADVANCE.spaced, 6)).toBe(36);
    // 4 glyphs x 5.40 = 21.6, ceil 22, + 6.
    expect(labelRoom(["1:50"], ADVANCE.plain, 6)).toBe(28);
  });

  // The two advances differ because the two classes differ: `.stats-tick`
  // carries `letter-spacing: 0.06em` at 9px (0.54 per glyph) and
  // `.trace-tick-label`/`.stats-point-label` carry none. Measured
  // 2026-09-14; a change to either CSS rule must change these.
  it("distinguishes the spaced class from the plain one", () => {
    expect(ADVANCE.spaced - ADVANCE.plain).toBeCloseTo(0.54, 5);
    expect(labelRoom(["100,000"], ADVANCE.spaced, 6)).toBeGreaterThan(
      labelRoom(["100,000"], ADVANCE.plain, 6),
    );
  });

  // THE BOUND THE TWO METRES GUTTERS REST ON, pinned at its boundary with
  // INDEPENDENT literals (RF21/RF33: never `niceMax`'s own output, never
  // the charts' `PAD_L`). Both gutters reserve five glyphs = 36 units, and
  // the first draft of their comments claimed five glyphs was all the
  // shortened format could EVER print. It is not — `niceMax`'s ladder is
  // unbounded, and at a total above 8,000,000 m the grid becomes
  // `0 / 5000k / 10000k`, whose six glyphs need 42. Five glyphs covers
  // every total at or below 8,000,000 m, which is several times the
  // highest-volume rowing anyone does. If this test goes red, a gutter is
  // now too small and the comments in `WeekBarsGroup` and `SeasonGroup`
  // are wrong with it.
  it("five glyphs holds every metres grid up to 8,000,000 m, and six are needed just past it", () => {
    const gridRoom = (total: number): number => {
      const { max, step } = niceMax(total);
      const ticks = chooseTicks([0, max], max / step + 1);
      return labelRoom(
        ticks.map((t) => formatTick(t, "metres")),
        ADVANCE.spaced,
        6,
      );
    };
    expect(gridRoom(43_012)).toBeLessThanOrEqual(36);
    expect(gridRoom(163_012)).toBeLessThanOrEqual(36);
    expect(gridRoom(8_000_000)).toBe(36);
    expect(gridRoom(8_000_001)).toBe(42);
  });

  it("an empty label set reserves only the gap", () => {
    expect(labelRoom([], ADVANCE.spaced, 6)).toBe(6);
  });

  // The defect this exists to make unreachable: the gutter that shipped was
  // 38 units of room for a label needing 41.59.
  it("the seventh glyph that clipped needs more room than the gutter had", () => {
    expect(labelRoom(["100,000"], ADVANCE.spaced, 0)).toBeGreaterThan(38);
    expect(labelRoom(["150k"], ADVANCE.spaced, 0)).toBeLessThan(38);
  });
});

describe("niceMax — the metres domain top, ≤ 4 gridlines above zero", () => {
  it("13,000 → 15,000 by 5,000 (A3); 43,012 → 60,000 by 20,000; 0 and 1,000 → 1,000 by 1,000", () => {
    expect(niceMax(13000)).toStrictEqual({ max: 15000, step: 5000 });
    expect(niceMax(43012)).toStrictEqual({ max: 60000, step: 20000 });
    expect(niceMax(0)).toStrictEqual({ max: 1000, step: 1000 });
    expect(niceMax(1000)).toStrictEqual({ max: 1000, step: 1000 });
  });
  // The ladder's only exit is `max / step <= maxLines`, which NaN and
  // Infinity never satisfy: without the guard this test HANGS the worker —
  // synchronously, so no per-test timeout can interrupt it (measured: the
  // whole run dies under an external `timeout`, exit 124). Run the file
  // under `timeout` when mutating the guard; that exit code is the red.
  it("NaN and Infinity read as the floor, 1,000 by 1,000 — never a hang", () => {
    expect(niceMax(NaN)).toStrictEqual({ max: 1000, step: 1000 });
    expect(niceMax(Infinity)).toStrictEqual({ max: 1000, step: 1000 });
  });
  it("continues the 1/2/5 ladder past 20,000: 80,001 → 100,000 by 50,000; 2,000,000 → 2,000,000 by 500,000", () => {
    expect(niceMax(80001)).toStrictEqual({ max: 100000, step: 50000 });
    expect(niceMax(2000000)).toStrictEqual({ max: 2000000, step: 500000 });
  });
  it("chooseTicks([0, max], max / step + 1) reproduces the grid: 0 · 5,000 · 10,000 · 15,000, and 0 · 1,000", () => {
    expect(chooseTicks([0, 15000], 4)).toStrictEqual([0, 5000, 10000, 15000]);
    expect(chooseTicks([0, 60000], 4)).toStrictEqual([0, 20000, 40000, 60000]);
    expect(chooseTicks([0, 1000], 2)).toStrictEqual([0, 1000]);
    expect(chooseTicks([0, 2000000], 5)).toStrictEqual([
      0, 500000, 1000000, 1500000, 2000000,
    ]);
  });
  it("the trend's split domain from the primitives: domainFromReadings of the seed's six splits at minHeight 10 is [112, 126], and chooseTicks at 4 gives 115 · 120 · 125", () => {
    expect(
      domainFromReadings([124.8, 117.6, 122.9, 115.3, 121.4, 114], {
        minHeight: 10,
      }),
    ).toStrictEqual([112, 126]);
    expect(chooseTicks([112, 126], 4)).toStrictEqual([115, 120, 125]);
  });
});
