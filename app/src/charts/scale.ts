/**
 * Pure chart primitives: linear domain->range mapping, domain derivation
 * from real readings, and point decimation. This module knows NOTHING
 * about traces, series, pace semantics, or any app screen (trace-rendering
 * design spec §2's tripwire) — Phase 6J's bars and stacked bars are meant
 * to consume this same file. No React, no DOM.
 */

export interface LinearScaleOptions {
  /** [low, high] input bound. */
  domain: [number, number];
  /** [low, high] output bound. */
  range: [number, number];
  /**
   * When true, the LOW domain value maps to the HIGH end of `range` (index
   * 1), and the high domain value maps to the LOW end (index 0) — the
   * pace case: pace is stored as seconds/500m where a SMALLER number is a
   * FASTER split, and the design spec (§3) rules faster-is-up. On an SVG
   * canvas a smaller y-pixel is higher, so a caller wanting faster-is-up
   * builds `range` as [bottom-pixel, top-pixel] (e.g. [chartHeight, 0])
   * and passes invert:true. Default false (domain low -> range index 0,
   * as for rate/hr where higher is up and a caller builds range the other
   * way round, [0, chartHeight]).
   */
  invert?: boolean;
}

/** Build a linear domain->range mapping function. Pure; no state. */
export function linearScale(opts: LinearScaleOptions): (v: number) => number {
  const [d0, d1] = opts.domain;
  const [r0, r1] = opts.range;
  const invert = opts.invert ?? false;
  const span = d1 - d0;
  return (v: number) => {
    const t = span === 0 ? 0.5 : (v - d0) / span;
    return invert ? r1 - t * (r1 - r0) : r0 + t * (r1 - r0);
  };
}

/**
 * "Nice numbers for graph labels" — the classic axis-rounding algorithm
 * (Heckbert, Graphics Gems I, 1990; the same shape ships in D3's
 * `.nice()`/`ticks()`). SECONDARY: well-established graphics technique,
 * not primary-sourced live for this task; nothing invented (design spec
 * §6 — linear scales and tick rounding are standard). Rounds `range` UP
 * to the nearest 1, 2, 5 or 10 times a power of ten — this file's only
 * caller (`domainFromReadings`) wants a fine rounding granularity for
 * domain BOUNDS, not a coarse tick step (that variant lives in
 * `axis.ts`, which wants the opposite rounding direction).
 */
function niceNum(range: number): number {
  if (!(range > 0)) return 1;
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / 10 ** exponent;
  let niceFraction: number;
  if (fraction <= 1) niceFraction = 1;
  else if (fraction <= 2) niceFraction = 2;
  else if (fraction <= 5) niceFraction = 5;
  else niceFraction = 10;
  return niceFraction * 10 ** exponent;
}

export interface DomainFromReadingsOptions {
  /**
   * The minimum height the returned domain must span, so a near-constant
   * measure (design spec §3: ordinary for spm/hr over a short piece) never
   * divides by a zero-height domain. Enforced centred on the readings.
   */
  minHeight: number;
  /**
   * Explicit padding (in domain units) added to each end before rounding
   * outward to a round number. Defaults to 10% of the (post-minHeight)
   * span.
   */
  pad?: number;
}

/**
 * Compute a [lo, hi] vertical domain covering the full range of `values`
 * (the caller has already excluded sentinels per §2 — this function does
 * not know what a sentinel is), padded outward to round numbers, with a
 * floor of `opts.minHeight` enforced and centred. Returns null when fewer
 * than 2 real (finite) values are given — the caller decides what absence
 * means (design spec's per-measure "too little to draw" gate is a
 * separate, higher threshold owned by the component, not this primitive).
 */
export function domainFromReadings(
  values: number[],
  opts: DomainFromReadingsOptions,
): [number, number] | null {
  const real = values.filter((v) => Number.isFinite(v));
  if (real.length < 2) return null;

  let lo = Math.min(...real);
  let hi = Math.max(...real);

  if (hi - lo < opts.minHeight) {
    const center = (lo + hi) / 2;
    lo = center - opts.minHeight / 2;
    hi = center + opts.minHeight / 2;
  }

  const padAmount = opts.pad ?? (hi - lo) * 0.1;
  lo -= padAmount;
  hi += padAmount;

  const step = niceNum(hi - lo) / 10;
  return [Math.floor(lo / step) * step, Math.ceil(hi / step) * step];
}

export interface ChartPoint {
  x: number;
  y: number;
}

/**
 * Reduce `points` to at most ~2 points per column (design spec §3: "at
 * most ~2 points per horizontal pixel"), preserving the global min and
 * max y value per column so a real spike is never smoothed away (§3
 * "noise is shown, not smoothed"; §7.5's spike-survives exit criterion).
 * Output stays in the input's original x order. `columns` is the number
 * of horizontal buckets to divide the point set's x-span into (typically
 * the chart's pixel width) — this function is unaware of a "pixel" or a
 * "measure"; the caller computes columns per measure per §3.
 */
export function decimate(points: ChartPoint[], columns: number): ChartPoint[] {
  if (columns <= 0 || points.length <= columns * 2) {
    return points.slice();
  }

  const xs = points.map((p) => p.x);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const span = xMax - xMin || 1;

  interface Slot {
    minPoint: ChartPoint;
    minIndex: number;
    maxPoint: ChartPoint;
    maxIndex: number;
  }
  const buckets = new Map<number, Slot>();

  points.forEach((p, index) => {
    // p.x - xMin is always >= 0 (xMin is the minimum of the same set), so
    // col is always >= 0 by construction — only the upper edge needs
    // clamping, for the single point sitting exactly at xMax.
    let col = Math.floor(((p.x - xMin) / span) * columns);
    if (col >= columns) col = columns - 1;
    const slot = buckets.get(col);
    if (!slot) {
      buckets.set(col, {
        minPoint: p,
        minIndex: index,
        maxPoint: p,
        maxIndex: index,
      });
      return;
    }
    if (p.y < slot.minPoint.y) {
      slot.minPoint = p;
      slot.minIndex = index;
    }
    if (p.y > slot.maxPoint.y) {
      slot.maxPoint = p;
      slot.maxIndex = index;
    }
  });

  const picked: { point: ChartPoint; index: number }[] = [];
  for (const slot of buckets.values()) {
    picked.push({ point: slot.minPoint, index: slot.minIndex });
    if (slot.maxIndex !== slot.minIndex) {
      picked.push({ point: slot.maxPoint, index: slot.maxIndex });
    }
  }
  picked.sort((a, b) => a.index - b.index);
  return picked.map((p) => p.point);
}
