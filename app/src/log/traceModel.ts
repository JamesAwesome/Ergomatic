// Phase LT spec 3
// (`docs/superpowers/specs/2026-08-19-trace-rendering-design.md`), Task 2.
// The pure "series -> drawable" step: turns spec 2's stored `SeriesData`
// into a `TraceModel` a component can draw without knowing anything about
// sentinels, gaps, units, or scales itself. Consumes Task 1's primitives
// (`../charts/scale.js`, `../charts/axis.js`) verbatim, never re-derives a
// domain, a tick, or a decimation rule — §2's tripwire is that Phase 6J's
// bars/stacked bars share those two files, and re-deriving here would fork
// them on day one.
//
// SENTINELS ARE NOT READINGS (§2, PROVEN on the committed captures,
// `seriesRecorder.ts`'s own header): the recorder collapses "no reading"
// and "the machine said 0" into the same stored `p === 0` / `spm === 0`.
// Every renderer treats a sentinel as ABSENT — excluded from both the
// drawn line and the vertical domain (never clipped to a floor, never
// drawn as zero on a faster-is-up axis, where it would read as
// "infinitely fast"). `hr` never carries this ambiguity: the recorder
// OMITS the key entirely when there is no real reading (never a
// zero-valued `hr`), so its own sentinel rule is simply "the key is
// present."
//
// UNITS: `Sample.p`/`Sample.t` are stored in TENTHS (spec 2's own C2
// logbook shape) — `axis.ts`'s `formatTick("pace")` delegates straight to
// `fmtSplit`, which takes TOTAL SECONDS, and §3's own minimum-domain-height
// table is stated in seconds ("pace 10 s/500m"), not tenths. This module
// converts `p`/`t` to real seconds ONCE, at the boundary, so every
// downstream consumer (the domain, the ticks, the SVG scale, the summary)
// works in the same honest unit and never has to remember the tenths
// convention again.
//
// REAL GAPS, NOT RESTS (§3): a rest freezes the work clock — no new whole
// second is ever crossed (`seriesRecorder.ts`'s own header) — so it
// produces ZERO samples and therefore no gap in `t` at all. A real gap is
// a dropped frame or a rejected reset candidate, and IS visible as a jump
// in consecutive samples' `t`. This module breaks the line at any gap over
// `GAP_BREAK_SECONDS` between two consecutive REAL (sentinel-excluded)
// readings for the measure being drawn — which also, correctly, breaks the
// line across a long run of sentinel samples (no real pace exists there
// either), exactly the "breaks... across a missing-hr stretch" behavior
// §2 already describes for HR's own absence.

import { domainFromReadings, type ChartPoint } from "../charts/scale.js";
import { chooseTicks } from "../charts/axis.js";
import type { SeriesData, Sample } from "../monitor/seriesRecorder.js";
import { fmtSplit } from "../../domain/format.js";

export type Measure = "pace" | "rate" | "hr";

/** trace-truth Task 2 (spec §3): a `ChartPoint` plus the recorder's own
 *  rest marker, carried through UNCHANGED so `TraceChart` can tint a rest
 *  span without re-deriving anything from `Sample`/steps — the renderer
 *  cannot recover this later (a stored log's steps never carry a warm-up
 *  row, so anything positional derived from steps lands displaced; the
 *  recorder is the only place that ever saw the wire's own state byte).
 *  A structural superset of `ChartPoint` (never a narrower/different `x`/
 *  `y`), so it still passes to `decimate` (Task 1's own shared primitive,
 *  also consumed by bars/stacked bars — §2's tripwire) unchanged. */
export interface TracePoint extends ChartPoint {
  rest: boolean;
}

export interface TraceModel {
  /** Segments — a gap over `GAP_BREAK_SECONDS` between two consecutive
   *  real readings starts a new one, so the drawn line breaks there. A
   *  REST never starts a new segment (§3: a rest is present data, not a
   *  gap) — only `GAP_BREAK_SECONDS` does. Never empty: a model with
   *  nothing to draw is `null`, not `{points: []}`. */
  points: TracePoint[][];
  /** `[0, the session's last sample's own t]`, in seconds — computed
   *  ONCE regardless of which measure is drawn (§3), so a heart-rate line
   *  that starts a third of the way across (a cold strap) reads as a late
   *  start rather than being rescaled to look complete. */
  domainX: [number, number];
  /** The FULL range of this measure's real readings, padded to a round
   *  number, floored at the measure's own minimum height. Never clipped,
   *  never percentiled (§3's own ruling, broken by measurement before this
   *  task started). */
  domainY: [number, number];
  ticksY: number[];
  /** true for pace (faster is UP, §3) — the caller builds the y `range`
   *  bottom-first (`[height, 0]`) and passes this straight to
   *  `linearScale`'s own `invert` option. false for rate/hr (higher is
   *  up, the ordinary direction). */
  invert: boolean;
  /** §5's text alternative — computed from this same model, never
   *  hand-written by a caller. Deliberately never says "interval": §4
   *  cuts interval boundary marks from this spec entirely, and this
   *  module has no step data to name one honestly even if it wanted to. A
   *  segment count (when the line actually breaks) is a fact about the
   *  DRAWN LINE, not a claim about workout structure. */
  summary: string;
}

/** §3: the line breaks across a gap of more than this many seconds. */
const GAP_BREAK_SECONDS = 3;

/** §3/§7.5: fewer than this many real readings for the measure being
 *  drawn is "too little to draw" — a HIGHER, per-measure gate owned by
 *  this module, above `domainFromReadings`'s own >= 2 floor (Task 1's own
 *  division of labour: that primitive doesn't know what "too little"
 *  means for a chart, only when it would divide by nothing). */
const MIN_REAL_READINGS = 3;

/** §3's per-measure minimum domain height, in the measure's own real
 *  unit (pace: seconds/500m, not tenths) — so a near-constant session
 *  (ordinary for spm/hr over a short piece) never divides by a
 *  zero-height domain. */
const MIN_DOMAIN_HEIGHT: Record<Measure, number> = {
  pace: 10, // seconds/500m
  rate: 6, // spm
  hr: 20, // bpm
};

/** A fixed, modest y-axis tick budget for a small mobile chart. Nothing in
 *  §3/§5 pins a specific count; 4 keeps a narrow SVG legible without
 *  crowding `chooseTicks`'s own round-number selection. */
const TICK_COUNT = 4;

/** One measure's own real (non-sentinel) reading, already unit-converted
 *  to seconds (`t`) and the measure's own real unit (`value`), plus the
 *  recorder's own rest marker (trace-truth Task 2, spec §3) — the pace
 *  value during a rest is real but not meaningful; `rest` is what says
 *  so, carried straight from `Sample.r`, never re-derived. */
interface Reading {
  t: number;
  value: number;
  rest: boolean;
}

/** Extracts `measure`'s own real readings from `samples`, in wire order —
 *  §2's sentinel rule, applied once per measure so `buildTrace` never
 *  repeats the exclusion logic per caller. */
function realReadings(samples: readonly Sample[], measure: Measure): Reading[] {
  const out: Reading[] = [];
  for (const s of samples) {
    const t = s.t / 10;
    const rest = s.r === true;
    switch (measure) {
      case "pace":
        if (s.p !== 0) out.push({ t, value: s.p / 10, rest });
        break;
      case "rate":
        if (s.spm !== 0) out.push({ t, value: s.spm, rest });
        break;
      case "hr":
        if (s.hr !== undefined) out.push({ t, value: s.hr, rest });
        break;
    }
  }
  return out;
}

/** Splits `readings` into segments wherever consecutive real readings are
 *  more than `GAP_BREAK_SECONDS` apart (§3). The rest case (no gap at all
 *  — the work clock froze) never trips this; a real gap (a dropped frame,
 *  a rejected reset candidate, or a long sentinel run) does. */
function toSegments(readings: readonly Reading[]): TracePoint[][] {
  const segments: TracePoint[][] = [];
  let current: TracePoint[] = [];
  let prevT: number | null = null;
  for (const r of readings) {
    if (prevT !== null && r.t - prevT > GAP_BREAK_SECONDS) {
      segments.push(current);
      current = [];
    }
    current.push({ x: r.t, y: r.value, rest: r.rest });
    prevT = r.t;
  }
  // No trailing empty-segment guard: `current` always gains the loop's
  // last reading before falling out (the push above is unconditional),
  // and this module's own sole caller (`buildTrace`) never invokes this
  // function with fewer than `MIN_REAL_READINGS` (>= 1) readings — so
  // `current` is never empty here, and a defensive `if` would be
  // permanently uncovered dead code rather than a real guard.
  segments.push(current);
  return segments;
}

const MEASURE_LABEL: Record<Measure, string> = {
  pace: "Pace",
  rate: "Stroke rate",
  hr: "Heart rate",
};

function formatValue(measure: Measure, value: number): string {
  if (measure === "pace") return fmtSplit(value);
  const unit = measure === "rate" ? "spm" : "bpm";
  return `${Math.round(value)} ${unit}`;
}

/** §5's text alternative: the measure, its first/last real reading (the
 *  session's own direction of travel), and its own extreme — "fastest"
 *  for pace (the minimum split), "highest" for rate/hr (the maximum
 *  count, since a stroke-rate trace can legitimately spike, spec 2's
 *  device-witnessed handoff to this spec). A segment clause is appended
 *  ONLY when the line actually breaks — never the word "interval". */
function buildSummary(
  measure: Measure,
  readings: readonly Reading[],
  segments: readonly ChartPoint[][],
): string {
  const values = readings.map((r) => r.value);
  const first = readings[0]!.value;
  const last = readings[readings.length - 1]!.value;
  const extreme =
    measure === "pace" ? Math.min(...values) : Math.max(...values);
  const extremeLabel = measure === "pace" ? "fastest" : "highest";
  const segmentClause =
    segments.length > 1 ? `, in ${segments.length} segments` : "";

  return (
    `${MEASURE_LABEL[measure]}, ${formatValue(measure, first)} at the start ` +
    `to ${formatValue(measure, last)} at the end, ` +
    `${extremeLabel} ${formatValue(measure, extreme)}${segmentClause}`
  );
}

export function buildTrace(
  series: SeriesData | undefined,
  measure: Measure,
): TraceModel | null {
  if (series === undefined || series.samples.length === 0) return null;

  const readings = realReadings(series.samples, measure);
  if (readings.length < MIN_REAL_READINGS) return null;

  // Non-null by construction, not narrowed with an `if`: `readings.length`
  // just cleared `MIN_REAL_READINGS` (3), which always clears
  // `domainFromReadings`'s own lower `>= 2` floor — an `if (domainY ===
  // null) return null` here would be permanently uncovered dead code (the
  // `toSegments` comment above states the identical reasoning for its own
  // trailing-segment guard).
  const domainY = domainFromReadings(
    readings.map((r) => r.value),
    { minHeight: MIN_DOMAIN_HEIGHT[measure] },
  )!;

  const lastSample = series.samples[series.samples.length - 1]!;
  const domainX: [number, number] = [0, lastSample.t / 10];

  const segments = toSegments(readings);
  const ticksY = chooseTicks(domainY, TICK_COUNT);
  const invert = measure === "pace";
  const summary = buildSummary(measure, readings, segments);

  return { points: segments, domainX, domainY, ticksY, invert, summary };
}
