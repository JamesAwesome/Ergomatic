import { describe, it, expect } from "vitest";
import { linearScale, domainFromReadings, decimate } from "./scale.js";

describe("linearScale", () => {
  it("maps the domain endpoints and midpoint onto the range", () => {
    const scale = linearScale({ domain: [0, 10], range: [0, 100] });
    expect(scale(0)).toBe(0);
    expect(scale(10)).toBe(100);
    expect(scale(5)).toBe(50);
  });

  it("maps a range that does not start at zero", () => {
    const scale = linearScale({ domain: [100, 200], range: [40, 340] });
    expect(scale(100)).toBe(40);
    expect(scale(200)).toBe(340);
    expect(scale(150)).toBe(190);
  });

  it("inverts so the LOW domain value lands on the HIGH range end (the pace case)", () => {
    // Pace domain is seconds/500m: low = fast. On a faster-is-up axis the
    // range is pixel-y (0 = top). A fast (low) pace must land at the
    // BOTTOM of the range array's numeric span... no: per the brief, invert
    // means the low domain value maps to the range's HIGH end, numerically.
    const scale = linearScale({
      domain: [100, 140],
      range: [0, 300],
      invert: true,
    });
    expect(scale(100)).toBe(300); // low value -> high range end
    expect(scale(140)).toBe(0); // high value -> low range end
    expect(scale(120)).toBe(150); // midpoint unaffected by direction
  });

  it("a faster (lower) pace reading renders higher than a slower one, when the caller orients range bottom-first (§3's faster-is-up)", () => {
    // This module has no idea what SVG is; "faster is up" is the CALLER's
    // job (a future trace component). On an SVG canvas a SMALLER y-pixel
    // is higher. A caller wanting faster-is-up builds range as
    // [bottom-pixel, top-pixel] = [chartHeight, 0] and passes invert:true
    // — the low (fast) domain value then lands on range's high END
    // (index 1, the top pixel, 0) per the literal invert contract above.
    const scale = linearScale({
      domain: [100, 140], // pace seconds/500m: low = fast
      range: [300, 0], // [bottom pixel, top pixel]
      invert: true,
    });
    const fastY = scale(105); // fast: 105s/500m
    const slowY = scale(135); // slow: 135s/500m
    expect(fastY).toBeLessThan(slowY);
  });

  it("never divides by zero on a zero-width domain, returning the range midpoint", () => {
    const scale = linearScale({ domain: [5, 5], range: [0, 100] });
    expect(scale(5)).toBe(50);
    expect(scale(999)).toBe(50); // off-domain input still yields a finite number
  });
});

describe("domainFromReadings", () => {
  it("returns null for zero values", () => {
    expect(domainFromReadings([], { minHeight: 10 })).toBeNull();
  });

  it("returns null for a single value", () => {
    expect(domainFromReadings([42], { minHeight: 10 })).toBeNull();
  });

  it("pads a real spread to round numbers", () => {
    const domain = domainFromReadings([90, 110, 100, 105], {
      minHeight: 10,
    });
    expect(domain).not.toBeNull();
    const [lo, hi] = domain as [number, number];
    // Round to a clean multiple of the chosen step (verified, not asserted
    // blind): both bounds land on multiples of 5.
    expect(lo % 5).toBe(0);
    expect(hi % 5).toBe(0);
    // The real reading range is fully contained.
    expect(lo).toBeLessThanOrEqual(90);
    expect(hi).toBeGreaterThanOrEqual(110);
  });

  it("enforces minHeight on a constant input, centred on the value", () => {
    const domain = domainFromReadings([50, 50, 50, 50], { minHeight: 10 });
    expect(domain).not.toBeNull();
    const [lo, hi] = domain as [number, number];
    expect(hi - lo).toBeGreaterThanOrEqual(10);
    expect((lo + hi) / 2).toBeCloseTo(50, 5);
  });

  it("leaves a real span alone when it already exceeds minHeight", () => {
    const domain = domainFromReadings([0, 100], { minHeight: 10 });
    expect(domain).not.toBeNull();
    const [lo, hi] = domain as [number, number];
    expect(hi - lo).toBeGreaterThan(10);
  });

  it("honours an explicit pad amount", () => {
    const domain = domainFromReadings([100, 200], {
      minHeight: 10,
      pad: 0,
    });
    const [lo, hi] = domain as [number, number];
    // With zero pad the rounded bounds still fully contain the readings.
    expect(lo).toBeLessThanOrEqual(100);
    expect(hi).toBeGreaterThanOrEqual(200);
    // fraction = 1 exactly -> the round-to-nearest-1x branch.
    expect(domain).toStrictEqual([100, 200]);
  });

  it("rounds a wide span (fraction > 5) down to the nearest 10x-step bound", () => {
    const domain = domainFromReadings([0, 600], { minHeight: 1, pad: 0 });
    expect(domain).toStrictEqual([0, 600]);
  });

  it("never divides by zero when minHeight and pad are both 0 on a constant input", () => {
    // Degenerate on purpose: the caller asked for no floor and no pad, so
    // the domain collapses to a point rather than crashing.
    const domain = domainFromReadings([50, 50], { minHeight: 0, pad: 0 });
    expect(domain).toStrictEqual([50, 50]);
  });
});

describe("decimate", () => {
  it("returns points unchanged when already at or under the column budget", () => {
    const points = [
      { x: 0, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 3 },
    ];
    expect(decimate(points, 10)).toStrictEqual(points);
  });

  it("returns points unchanged for a non-positive column count", () => {
    const points = [
      { x: 0, y: 1 },
      { x: 1, y: 2 },
    ];
    expect(decimate(points, 0)).toStrictEqual(points);
  });

  it("caps output at roughly 2 points per column and preserves the global min/max (spike survives)", () => {
    // A 14,400-point fixture (4 hours at 1 Hz) with a single-sample spike
    // buried in the middle — this is the property decimation must not lose.
    const n = 14_400;
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      // Gentle drift so most columns are unremarkable.
      points.push({ x: i, y: 120 + Math.sin(i / 400) * 3 });
    }
    const spikeIndex = 7_213;
    const globalMax = 999; // an outlier spike (a real 164 spm-style event)
    const globalMin = 1; // a real low reading elsewhere
    points[spikeIndex] = { x: spikeIndex, y: globalMax };
    points[200] = { x: 200, y: globalMin };

    const columns = 400; // e.g. a 400px-wide chart
    const out = decimate(points, columns);

    expect(out.length).toBeLessThanOrEqual(columns * 2);
    const ys = out.map((p) => p.y);
    expect(Math.max(...ys)).toBe(globalMax);
    expect(Math.min(...ys)).toBe(globalMin);
  });

  it("keeps a lone point per column without duplicating it (single-point bucket)", () => {
    // Bucket 0 gets 4 points (min/max distinct, exercising the multi-point
    // path); bucket 1 gets exactly one point (exercising the single-point
    // path, where min and max are the same index and must be pushed once).
    const points = [
      { x: 0, y: 5 },
      { x: 1, y: 1 }, // bucket 0's min
      { x: 2, y: 9 }, // bucket 0's max
      { x: 3, y: 3 },
      { x: 100, y: 7 }, // alone in bucket 1
    ];
    const out = decimate(points, 2);
    expect(out).toStrictEqual([
      { x: 1, y: 1 },
      { x: 2, y: 9 },
      { x: 100, y: 7 },
    ]);
  });

  it("never divides by zero when every point shares the same x (degenerate span)", () => {
    const points = [
      { x: 5, y: 3 },
      { x: 5, y: 9 },
      { x: 5, y: 1 },
    ];
    const out = decimate(points, 1);
    const ys = out.map((p) => p.y);
    expect(Math.max(...ys)).toBe(9);
    expect(Math.min(...ys)).toBe(1);
  });

  it("keeps output points in ascending x order (order stable)", () => {
    const n = 5_000;
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      points.push({ x: i, y: Math.random() * 10 });
    }
    const out = decimate(points, 200);
    for (let i = 1; i < out.length; i++) {
      expect(out[i].x).toBeGreaterThanOrEqual(out[i - 1].x);
    }
  });
});
