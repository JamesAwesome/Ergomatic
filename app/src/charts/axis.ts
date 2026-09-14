/**
 * Pure axis primitives: tick selection and tick label formatting. Same
 * purity rule as `scale.ts` — no traces, no series, no React, no DOM
 * (trace-rendering design spec §2's tripwire; 6J's bars consume this
 * same file).
 */

import { fmtDuration } from "../../domain/duration.js";

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

// `"pace"` (tenths, `fmtSplit`) was removed at Gate 0A: its only caller
// was `TraceChart`'s y axis, which now prints whole seconds like the stats
// charts, and an arm no production path can reach is dead code with no row
// (RF29). `fmtSplit` itself is untouched and still formats every pace a
// rower READS; this type is only about gridlines.
export type TickKind = "rate" | "hr" | "time" | "split" | "metres";

/**
 * Format a single axis tick value. Every kind that has a house formatter
 * delegates to it and never hand-rolls one (the spec's own cautionary tale
 * is spec 1's `fmtDuration`-takes-minutes trap): a pace gridline is
 * `"split"`, through `fmtDuration`. Rate and hr are whole-number counts
 * (stroke rate, beats per minute) with no house formatter of their own to
 * delegate to.
 *
 * `"time"` (trace-truth Task 3, spec §4) is the one deliberate exception
 * to "every other kind takes its own real unit": it takes TENTHS OF A
 * SECOND, matching `Sample.t`'s own wire unit, never converted seconds —
 * the recorder emits `Math.round(workClockSeconds * 10)`
 * (`seriesRecorder.ts`), so a caller building x-axis ticks off a
 * `domainX` already in real seconds multiplies back by 10 before calling
 * this, rather than this function silently assuming seconds the way every
 * other kind here does. Routed through the house `fmtDuration`
 * (`domain/duration.ts`), never a bespoke `m:ss` formatter — the same
 * cautionary tale this doc comment already names, `fmtDuration` takes
 * MINUTES, so tenths convert via `/600` (10 tenths/s * 60 s/min).
 */
export function formatTick(value: number, kind: TickKind): string {
  switch (kind) {
    case "rate":
    case "hr":
      return String(Math.round(value));
    case "time":
      return fmtDuration(value / 600);
    // Phase PS PR 2 (career-stats spec §5 item 6): a WHOLE-SECOND split
    // tick, `1:55`, at `chooseTicks`'s own 1/2/5 steps — `"pace"` prints
    // tenths (`1:55.0`), which a gridline never needs. Takes SECONDS, like
    // `"pace"`; routed through the house `fmtDuration` (minutes), never a
    // bespoke `m:ss`.
    case "split":
      return fmtDuration(value / 60);
    // A metres GRIDLINE, shortened to `150k` (James, Gate 0A 2026-09-14):
    // the house grouping needs a seventh glyph past 100,000 and every
    // gutter here was hand-tuned against six, which is how a production
    // frame came to read `L00,000`. Safe at the low end because `niceMax`
    // floors its ladder at `base = 1000`, so every tick above zero is a
    // whole thousand and no `0k` is reachable. The exact figures beside
    // these — a bar's own value, the season's `<n> TODAY` — keep their
    // grouping (same gate, ruling 3): a scale marker rounds, a reading
    // does not.
    case "metres":
      return value === 0 ? "0" : `${Math.round(value / 1000)}k`;
  }
}

/**
 * The metres axes' domain top (Phase PS PR 2, `docs/design/career-stats/
 * build.mjs` `niceMax`): the series' maximum rounded UP to the smallest
 * step in 1 / 2 / 5 × 10^k (k ≥ 3) that leaves at most `maxLines`
 * gridlines above zero — so `13,000 → 15,000 by 5,000`, `43,012 → 60,000
 * by 20,000`, and nothing below 1,000 (`0 → 1,000 by 1,000`). The ladder
 * continues past the design's 20,000 (its fallback capped the STEP at
 * 20,000, which a 2,000,000 m season would turn into 100 gridlines).
 * `chooseTicks([0, max], max / step + 1)` reproduces exactly this grid.
 */
export function niceMax(
  value: number,
  maxLines = 4,
): { max: number; step: number } {
  // NaN/Infinity would never satisfy `max / step <= maxLines`: the ladder
  // below has no other exit, so a non-finite value is the floor, not a hang.
  const v = Number.isFinite(value) ? Math.max(value, 1) : 1;
  for (let base = 1000; ; base *= 10) {
    for (const f of [1, 2, 5]) {
      const step = base * f;
      const max = Math.ceil(v / step) * step;
      if (max / step <= maxLines) return { max, step };
    }
  }
}

/**
 * Invariant I4 (number-provenance spec §6, Gate 0A ruling 1): the space a
 * set of formatted labels actually needs, from the MEASURED per-glyph
 * advance of the class that draws them — never a constant chosen by looking
 * at a chart. Four charts hand-tuned four gutters against a guess of
 * roughly 5.67 and three of them were wrong; one shipped `L00,000` to a
 * rower's phone.
 *
 * Advances measured in Chromium 2026-09-14 (`app/e2e/axisProbe.spec.ts`):
 * `spaced` is 9 px IBM Plex Mono at `letter-spacing: 0.06em` (`.stats-tick`)
 * and advances 5.94 user units; `plain` is the same face with no
 * letter-spacing (`.trace-tick-label`, `.stats-point-label`,
 * `.stats-bar-label`) and advances 5.40.
 */
export const ADVANCE = { spaced: 5.94, plain: 5.4 } as const;

/** The gutter those labels need: the widest one, plus the gap between the
 *  label's anchor and the plot's own edge. */
export function labelRoom(
  labels: readonly string[],
  advance: number,
  gap: number,
): number {
  const widest = labels.reduce((m, s) => Math.max(m, s.length), 0);
  return Math.ceil(widest * advance) + gap;
}
