/**
 * Pure axis primitives: tick selection and tick label formatting. Same
 * purity rule as `scale.ts` — no traces, no series, no React, no DOM
 * (trace-rendering design spec §2's tripwire; 6J's bars consume this
 * same file).
 */

import { fmtSplit } from "../../domain/format.js";

/**
 * "Nice numbers for graph labels" (Heckbert, Graphics Gems I, 1990) — a
 * variant of the same algorithm in `scale.ts`, not shared, so each file
 * in `app/src/charts/` stays a self-contained pure module exporting
 * exactly its named primitives. SECONDARY: standard graphics technique,
 * nothing invented (design spec §6). This file's only caller
 * (`chooseTicks`) wants the ROUNDED tick-step variant (nearest 1, 2, 5 or
 * 10 times a power of ten) rather than the round-up-only variant
 * `scale.ts` uses for domain bounds. `range` is always > 0 at this
 * file's one call site (`chooseTicks` already rejects d1 <= d0 before
 * computing it), so unlike `scale.ts`'s variant this one carries no
 * defensive zero/negative guard — there is nothing here that could
 * exercise it.
 */
function niceNum(range: number): number {
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / 10 ** exponent;
  let niceFraction: number;
  if (fraction < 1.5) niceFraction = 1;
  else if (fraction < 3) niceFraction = 2;
  else if (fraction < 7) niceFraction = 5;
  else niceFraction = 10;
  return niceFraction * 10 ** exponent;
}

function roundToStep(v: number, step: number): number {
  // Kill float noise (e.g. 89.99999999999999) without hiding real
  // sub-step precision when `step` itself is fractional.
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 6);
  const factor = 10 ** decimals;
  return Math.round(v * factor) / factor;
}

/**
 * Choose up to `count` round tick values that fall strictly inside
 * `domain` (design spec §3/§7.3: ticks are asserted at their own
 * coordinates against the un-inverted domain — this function never sees
 * `invert`, that is `linearScale`'s concern applied by the caller).
 * Returns `[]` for a degenerate (zero/negative-width) domain or a
 * non-positive count.
 */
export function chooseTicks(domain: [number, number], count: number): number[] {
  const [d0, d1] = domain;
  if (!Number.isFinite(d0) || !Number.isFinite(d1) || d1 <= d0) return [];
  if (!(count > 0)) return [];

  const rawStep = (d1 - d0) / Math.max(count - 1, 1);
  const step = niceNum(rawStep);
  const start = Math.ceil(d0 / step) * step;
  const epsilon = step * 1e-9;

  const ticks: number[] = [];
  for (let v = start; v <= d1 + epsilon; v += step) {
    ticks.push(roundToStep(v, step));
  }
  return ticks;
}

export type TickKind = "pace" | "rate" | "hr";

/**
 * Format a single axis tick value. Pace ALWAYS goes through the house
 * `fmtSplit` (`domain/format.ts`) — never a bespoke formatter (the spec's
 * own cautionary tale is spec 1's `fmtDuration`-takes-minutes trap).
 * Rate and hr are whole-number counts (stroke rate, beats per minute)
 * with no house formatter of their own to delegate to.
 */
export function formatTick(value: number, kind: TickKind): string {
  switch (kind) {
    case "pace":
      return fmtSplit(value);
    case "rate":
    case "hr":
      return String(Math.round(value));
  }
}
