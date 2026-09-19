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
// logbook shape) — `axis.ts`'s pace gridline (`formatTick(…, "split")`
// since Gate 0A; it was `"pace"`) takes TOTAL SECONDS, and §3's own
// minimum-domain-height
// table is stated in seconds ("pace 10 s/500m"), not tenths. This module
// converts `p`/`t` to real seconds ONCE, at the boundary, so every
// downstream consumer (the domain, the ticks, the SVG scale, the summary)
// works in the same honest unit and never has to remember the tenths
// convention again.
//
// REAL GAPS, NOT RESTS (§3): a rest does not always freeze the work
// clock — the wire keeps advancing elapsed/distance during a rest
// whenever the rower keeps the flywheel moving (`seriesRecorder.ts`'s
// own header, corrected trace-truth Task 2: measured at 21 rest samples
// on `session-2-wu-4unequal.jsonl`, and 3 even on `step-3`'s own tail).
//
// NEITHER `t` NOR `d` IS A WORK-ONLY QUANTITY (series-truth spec §D,
// widened to both axes): each is the sum of per-interval final readings,
// and each is CONDITIONAL ON ROWER BEHAVIOUR DURING RESTS — a frozen
// rest contributes nothing to either axis; an advancing rest contributes
// all of itself (the exit-7 ring: key 0's own register read 129.5s
// against a 67.91s WORK interval, and the series' final `d` of 742.7m
// stands against 0x0039's work-only 500m — the ring is the receipt, not
// this file). Say "conditional on rower behaviour during rests", never
// "includes rest": the second phrasing still reads as one fixed unit,
// when what actually lands on either axis depends on what the rower did.
//
// Despite that, a rest by itself still never produces a gap in `t` — but
// not because the work clock "excludes" rest duration (it does not: an
// advancing rest's samples land IN `t`, same as work). Either way —
// frozen (zero samples, nothing to skip) or advancing (samples at the
// ordinary cadence, folded straight into `t`) — consecutive real samples
// never land more than `GAP_BREAK_SECONDS` apart on their own account. A
// real gap is a dropped frame or a rejected reset candidate, and IS
// visible as a jump in consecutive samples' `t`. This module breaks the
// line at any gap over `GAP_BREAK_SECONDS` between two consecutive REAL
// (sentinel-excluded) readings for the measure being drawn — which also,
// correctly, breaks the line across a long run of sentinel samples (no
// real pace exists there either), exactly the "breaks... across a
// missing-hr stretch" behavior §2 already describes for HR's own
// absence.
//
// The axis-quantity question (should the chart use a true work-only
// clock instead?) is explicitly OUT of scope here and queued in ROADMAP
// (series-truth spec §D) — changing what an axis MEANS is its own
// number-meaning decision, not a docs fix.
//
// RESTS ARE DRAWN BUT DO NOT SET THE VERTICAL SCALE (2026-08-20 ruling,
// from a real photographed session where they did): a rest excursion
// (pace 5:00+/500m on the 2026-08-20 walk; measured on the committed
// `session-2-wu-4unequal.jsonl` capture at up to 364.9 s/500m against a
// real WORK range of 114.8-210.7 s/500m) stretched `domainY` so far that
// ~2s of genuine work-pace variation drew as a flat line across the top
// of the chart. `domainY` below is now built from WORK readings only
// (`rest === false`); rest points are still pushed into `points` exactly
// as before (never hidden, never excluded from the line) — they simply
// no longer widen the axis they render outside of. `TraceChart` clips the
// polyline to the plot rect so a rest excursion runs off the bottom
// rather than painting over the axis or the rest band.

import { domainFromReadings, type ChartPoint } from "../charts/scale.js";
import { chooseTicks } from "../charts/axis.js";
import type { SeriesData, Sample } from "../monitor/seriesRecorder.js";
import { fmtSplit } from "../../domain/format.js";

export type Measure = "pace" | "rate" | "hr";

/** trace-truth Task 2 (spec §3): a `ChartPoint` plus the recorder's own
 *  rest marker, carried through UNCHANGED so `TraceChart` can tint a rest
 *  span without re-deriving anything from `Sample`/steps — the renderer
 *  cannot recover this later (a stored log's steps never carry a warm-up
 *  row — nothing has PRODUCED one since Phase WU, and
 *  `buildMonitorLogSteps` still skips a legacy warm-up seed step on the
 *  one population that can persist the string, its own KEEP guard — and
 *  no step carries a marker to key a positional derivation off either,
 *  so anything positional derived from steps lands displaced; the
 *  recorder is the only place that ever saw the wire's own state byte).
 *  A structural superset of `ChartPoint` (never a narrower/different `x`/
 *  `y`), so it still passes to `decimate` (Task 1's own shared primitive,
 *  also consumed by bars/stacked bars — §2's tripwire) unchanged. */
export interface TracePoint extends ChartPoint {
  rest: boolean;
}

/** Gate 0B board 2 (APPROVED 2026-09-19): one interval's two machine
 *  figures, in the order the machine rowed them — the only stored input
 *  candidate B's axis needs.
 *
 *  `restSeconds` is a READBACK, never a measurement
 *  (`domain/monitor/types.ts`'s own rule for `IntervalActual.restSeconds`,
 *  which every comment about the field must repeat). Whether it is the
 *  machine's own timing of the rest or a readback of the rest we
 *  programmed is not established; on every committed capture it equals the
 *  program exactly, the rower has no mechanism to extend a rest
 *  (`domain/monitor/pm5/commands.ts`), and the arithmetic has closed once
 *  against a real walk (wall 374.76 s against work 254.8 + rest 120,
 *  BOARD2.md). That is a stated dependency of this axis, not a proof.
 *
 *  `workSeconds` is 0x0039's own per-interval elapsed — WORK ONLY, which
 *  is why it can place a rest the series itself never recorded. */
export interface IntervalSpan {
  workSeconds: number;
  /** The rest that FOLLOWS this interval. `0` for the last one, and for
   *  any interval the program gave no rest. */
  restSeconds: number;
}

/** A rest span in the axis's own x units (seconds). */
export interface RestBand {
  startX: number;
  endX: number;
}

/** Gate 0B board 2, M3: a span where the machine's own DISTANCE did not
 *  move while its CLOCK did — the rower standing still inside a work
 *  interval. Recoverable from the series alone, unlike a free row's pause
 *  (the clock sleeps there, so no samples exist to flatten). */
export interface StopSpan {
  startX: number;
  endX: number;
  seconds: number;
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
  /** The full range of this measure's real WORK readings — `rest === true`
   *  readings are excluded from this domain (2026-08-20 ruling, above),
   *  though never from `points` — padded to a round number, floored at
   *  the measure's own minimum height. Still never clipped or
   *  percentiled WITHIN the work readings themselves (§3's original
   *  ruling, unchanged for the population it now applies to). */
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
  /** Gate 0B board 2 (APPROVED 2026-09-19, candidate B): every rest span
   *  to draw, in the axis's own x units. The renderer never re-derives
   *  these from `points` — under candidate B a band's WIDTH is the
   *  machine's own rest readback, and the rest-marked points cover only
   *  the part of the rest the rower kept the flywheel moving through,
   *  which is the defect (M6) the band exists to fix. With no stored
   *  intervals the bands fall back to those same points, which is exactly
   *  what shipped before this change. */
  restBands: RestBand[];
  /** Gate 0B board 2, M3: every span where the machine's own distance
   *  stood still while its clock ran. Orthogonal to the axis — a stop
   *  happens INSIDE a work interval, where no rest exists to widen. */
  stops: StopSpan[];
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
function realReadings(
  samples: readonly Sample[],
  measure: Measure,
  xs: readonly number[],
): Reading[] {
  const out: Reading[] = [];
  for (const [i, s] of samples.entries()) {
    // `t` is the sample's position on the AXIS, which is no longer always
    // its own `t` (Gate 0B board 2): `buildAxis` below owns that mapping,
    // and hands one x per sample in wire order.
    const t = xs[i]!;
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
 *  more than `GAP_BREAK_SECONDS` apart (§3). A rest never trips this on
 *  its own — not because it "freezes" (it doesn't always: a rest whose
 *  wire keeps advancing produces samples at the ordinary ~1s cadence,
 *  same as work, folded straight into `t` — series-truth spec §D, this
 *  file's own header above: `t` is not a work-only quantity either), but
 *  because either way — frozen (zero samples, nothing to skip over) or
 *  advancing (samples at the ordinary cadence, no abnormal gap between
 *  them) — consecutive real readings never land far enough apart on
 *  their own account. A real gap (a dropped frame, a rejected reset
 *  candidate, or a long sentinel run) does. */
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
 *  ONLY when the line actually breaks — never the word "interval".
 *  Review round 2 (F-3): a rest clause is appended when the trace
 *  carries any rest-marked reading — the ONLY place a screen-reader user
 *  learns a rest happened at all, since the tint (§3's own design) has
 *  no accessible presence of its own. Names that spans exist, never
 *  their pace value — §3 forbids claiming the rest PACE is meaningful,
 *  and this clause doesn't. */
function buildSummary(
  measure: Measure,
  restBands: readonly RestBand[],
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
  // Gate 0B board 2: the BANDS, not the rest-marked readings. A rest the
  // rower sat still through has no readings of its own and still draws,
  // so counting readings would leave a screen-reader user short of a
  // span a sighted reader can see.
  const restRuns = restBands.length;
  // "marked", never "shaded" (review round 4, C1's own reasoning applied
  // here too): round 1's rest treatment was a full-height tint — that
  // was shading. Round 2 replaced it with a short band, and this string
  // would otherwise still be describing the rejected geometry, same
  // mismatch C1 found in the visible `.trace-legend` text.
  const restClause =
    restRuns > 0
      ? `, ${restRuns} rest ${restRuns === 1 ? "span" : "spans"} marked`
      : "";

  return (
    `${MEASURE_LABEL[measure]}, ${formatValue(measure, first)} at the start ` +
    `to ${formatValue(measure, last)} at the end, ` +
    `${extremeLabel} ${formatValue(measure, extreme)}${segmentClause}${restClause}`
  );
}

/** Gate 0B board 2, M3: the shortest flat-distance run this treats as the
 *  rower standing still. It sits above every non-stop flat run this repo
 *  has measured (4 s across staging; 3.0 s, 1.0 s and 0.00 s on the three
 *  committed captures BOARD2.md names) and below the one real stop, at
 *  60.5 s. */
const STOP_SECONDS = 5;

/** trace-truth Task 2 (spec §3): half a sample-second of padding on each
 *  side of a rest run's own x-range, so a single ISOLATED rest sample
 *  (surrounded by work on both sides) still draws a visible band rather
 *  than a zero-width rect — the 1 Hz sample it came from genuinely covers
 *  about this much of the timeline either side of its own timestamp.
 *  Applies ONLY to the no-stored-intervals fallback: candidate B's bands
 *  take their width from the machine, which needs no such nicety. Moved
 *  down here from `TraceChart.tsx` with the band derivation itself. */
const REST_BAND_PAD_SECONDS = 0.5;

interface Axis {
  /** One x per sample, in wire order — the sample's position on the axis
   *  the chart draws. */
  xs: number[];
  /** Candidate B's bands, from the machine's own rest seconds. Empty when
   *  there are no stored intervals; the caller falls back to the rest
   *  RUNS then, which is what shipped before this change. */
  bands: RestBand[];
}

/** Gate 0B board 2's candidate B, APPROVED 2026-09-19: `x = work + the
 *  machine's own rest`.
 *
 *  WHAT WAS WRONG. Today's axis is each sample's own `t`, which is not a
 *  defined quantity: this module's own header says so — a frozen rest
 *  contributes nothing to `t` and an advancing rest contributes all of
 *  itself. Measured on `session-2-wu-4unequal`, three EQUAL 30 s rests
 *  drew 5.75, 5.21 and 2.71 SVG units, the last at 47 % of the first.
 *
 *  WHY THE WORK BOUNDARY PLACES THE REST, rather than the rest-marked
 *  samples. A rest the rower sits still through emits NO samples at all:
 *  0x0031's elapsed advances only while the flywheel turns (measured on
 *  `walk-2026-08-25`'s own frames — elapsed held at 64.62 s across three
 *  still seconds inside a rest), and the recorder buckets on that clock.
 *  Keying the band off the rest RUNS would therefore lose such a rest
 *  entirely AND shift every later one onto the wrong interval. The work
 *  clock is what both kinds of rest have in common: interval `i`'s rest
 *  opens at the first sample that is either rest-marked or has carried
 *  the work clock to interval `i`'s own end, whichever comes first.
 *
 *  WHAT THIS ASSERTS ON THE MACHINE'S BEHALF: nothing. Both inputs are
 *  the machine's own per-interval figures (0x0039's work elapsed,
 *  0x0037's rest readback). What it does NOT have is an oracle — 0x0039
 *  is work-only, so no PM5 field ever reports "time at the erg" for this
 *  to be checked against. */
function buildAxis(
  samples: readonly Sample[],
  intervals: readonly IntervalSpan[],
): Axis {
  const xs: number[] = [];
  if (intervals.length === 0) {
    // No stored intervals — a free row (which has no rests to widen), a
    // timer/manual row, or a row saved before the rest readback shipped.
    // The axis stays exactly what it was.
    for (const s of samples) xs.push(s.t / 10);
    return { xs, bands: [] };
  }

  const bands: RestBand[] = [];
  /** The work clock: seconds of NON-rest samples, which is the quantity
   *  interval boundaries are stated in. */
  let work = 0;
  /** Rest already inserted ahead of `work` on the axis. */
  let offset = 0;
  /** Which interval's work is being accumulated. */
  let cursor = 0;
  /** The work clock at which `cursor`'s own interval ends. */
  let boundary = intervals[0]!.workSeconds;
  let open: { startX: number; seconds: number; advance: number } | null = null;
  let prevT: number | null = null;
  let lastX = 0;

  for (const s of samples) {
    const dt = prevT === null ? s.t / 10 : (s.t - prevT) / 10;
    prevT = s.t;
    const resting = s.r === true;

    if (
      open === null &&
      cursor < intervals.length &&
      (resting || work >= boundary)
    ) {
      open = {
        startX: work + offset,
        seconds: intervals[cursor]!.restSeconds,
        advance: 0,
      };
    }

    if (open !== null) {
      if (resting) {
        // Inside the band. A rest sample carries no work, so it advances
        // by its own elapsed only — which is how the part the rower DID
        // row through keeps its shape inside a band the machine sized.
        open.advance += dt;
        // No clamp needed: the band's own width below is
        // `max(seconds, advance)`, so a rest sample can never land past
        // the band that contains it.
        lastX = open.startX + open.advance;
        xs.push(lastX);
        continue;
      }
      // The first work sample after the rest closes it. The band is the
      // machine's own rest seconds — never NARROWER than what was
      // actually observed, which would stack several samples on one x.
      const width = Math.max(open.seconds, open.advance);
      if (width > 0)
        bands.push({ startX: open.startX, endX: open.startX + width });
      offset += width;
      cursor += 1;
      if (cursor < intervals.length) boundary += intervals[cursor]!.workSeconds;
      open = null;
    }

    if (resting) {
      // A rest with no interval left to name it (the series outran the
      // stored steps). Today's behaviour: it advances the axis by its own
      // elapsed and adds no work.
      lastX += dt;
      xs.push(lastX);
      continue;
    }
    work += dt;
    lastX = work + offset;
    xs.push(lastX);
  }

  if (open !== null) {
    // The piece ended inside a rest.
    const width = Math.max(open.seconds, open.advance);
    if (width > 0)
      bands.push({ startX: open.startX, endX: open.startX + width });
  } else if (cursor < intervals.length && work >= boundary) {
    // The piece ended ON an interval boundary, with that interval's own
    // rest still to come and no sample left to open it — the ordinary
    // shape of a programmed row whose last interval carries a rest. The
    // `work >= boundary` guard is what keeps this from inventing a rest
    // for a piece that stopped PART WAY through its last interval.
    const seconds = intervals[cursor]!.restSeconds;
    if (seconds > 0)
      bands.push({ startX: work + offset, endX: work + offset + seconds });
  }
  return { xs, bands };
}

/** Every contiguous run of `rest === true` points in ONE segment, as an
 *  x-range padded per `REST_BAND_PAD_SECONDS`. The no-stored-intervals
 *  fallback, and byte-for-byte the derivation `TraceChart.tsx` ran
 *  itself before Gate 0B board 2 — per segment, so a rest run split by a
 *  real gap becomes two bands rather than one band spanning the gap. */
function restBandsForSegment(points: readonly TracePoint[]): RestBand[] {
  const bands: RestBand[] = [];
  let runStart: number | null = null;
  let runEnd = 0;
  for (const p of points) {
    if (p.rest) {
      if (runStart === null) runStart = p.x;
      runEnd = p.x;
    } else if (runStart !== null) {
      bands.push({
        startX: runStart - REST_BAND_PAD_SECONDS,
        endX: runEnd + REST_BAND_PAD_SECONDS,
      });
      runStart = null;
    }
  }
  if (runStart !== null) {
    bands.push({
      startX: runStart - REST_BAND_PAD_SECONDS,
      endX: runEnd + REST_BAND_PAD_SECONDS,
    });
  }
  return bands;
}

/** Gate 0B board 2, M3: every span of at least `STOP_SECONDS` where the
 *  machine's own distance did not move while its clock did.
 *
 *  WHY IT SHIPS. On `walk-2026-09-15-work-clock` the monitor holds its
 *  last pace and last stroke rate across a 60.5 s dead stop, so the trace
 *  draws a flat minute at 2:16.0 at 26 spm with distance frozen at
 *  51.7 m, directly under a header reading 2:09.2 work · 250 m — a stored
 *  split of 4:18.4/500m for a piece pulled at about 2:17. Unmarked, the
 *  chart does not merely fail to show the stop: it asserts the rower was
 *  pulling.
 *
 *  THE TAIL IS NOT A STOP. Every sample after the rower presses END is a
 *  `p === 0` sentinel at a frozen distance (measured at 5.1 s on that same
 *  capture), so a stop counts only when a REAL reading for the drawn
 *  measure follows it — otherwise the mark would land on the moment the
 *  piece ended. */
function findStopSpans(
  samples: readonly Sample[],
  xs: readonly number[],
  measure: Measure,
): StopSpan[] {
  let lastReal = -1;
  for (const [i, s] of samples.entries()) {
    const v =
      measure === "pace" ? s.p : measure === "rate" ? s.spm : (s.hr ?? 0);
    if (v !== 0) lastReal = i;
  }
  const out: StopSpan[] = [];
  let from = 0;
  for (let i = 1; i <= samples.length; i++) {
    // `d` is stored in TENTHS of a metre, so `< 1` is "under 0.1 m".
    const same =
      i < samples.length && Math.abs(samples[i]!.d - samples[from]!.d) < 1;
    if (same) continue;
    const seconds = (samples[i - 1]!.t - samples[from]!.t) / 10;
    if (seconds >= STOP_SECONDS && i - 1 < lastReal) {
      out.push({ startX: xs[from]!, endX: xs[i - 1]!, seconds });
    }
    from = i;
  }
  return out;
}

export function buildTrace(
  series: SeriesData | undefined,
  measure: Measure,
  /** Gate 0B board 2: the machine's own per-interval work and rest
   *  seconds, in rowed order. Empty (the default) keeps the axis exactly
   *  as it was — see `buildAxis`. */
  intervals: readonly IntervalSpan[] = [],
): TraceModel | null {
  if (series === undefined || series.samples.length === 0) return null;

  const axis = buildAxis(series.samples, intervals);
  const readings = realReadings(series.samples, measure, axis.xs);
  if (readings.length < MIN_REAL_READINGS) return null;

  // 2026-08-20 ruling (file header, above): the vertical domain is built
  // from WORK readings only — a rest excursion must not stretch the
  // scale, even though the rest point itself still draws (`toSegments`
  // below still receives every `readings` entry, rest included). Unlike
  // the old "all real readings" domain, this is NOT guaranteed non-null
  // by `readings.length >= MIN_REAL_READINGS` alone: a run that clears 3
  // total readings can still carry fewer than 2 WORK ones (up to and
  // including "every reading here is a rest"), so `domainFromReadings`'s
  // own `>= 2` floor can genuinely fail here where it couldn't before.
  // When it does, there is no honest scale to draw this measure against
  // — the same per-measure "too little to draw" absence idiom
  // `MIN_REAL_READINGS` above already uses, extended to "too little
  // WORK", rather than inventing a second, rest-inclusive fallback
  // domain that would just reintroduce the bug for this one case.
  const workValues = readings.filter((r) => !r.rest).map((r) => r.value);
  const domainY = domainFromReadings(workValues, {
    minHeight: MIN_DOMAIN_HEIGHT[measure],
  });
  if (domainY === null) return null;

  // The axis runs to the last sample — or, when the piece ENDS in a rest,
  // to the end of that rest. Without the second arm the trailing band is
  // clipped at the domain's own edge and draws NARROWER than the rest
  // before it, which is M6 all over again on the one band whose width
  // nothing else can check (seen on `log-detail`'s own capture, where
  // both steps carry a 60 s readback).
  const lastSampleX = axis.xs[axis.xs.length - 1] ?? 0;
  const lastBandX = axis.bands[axis.bands.length - 1]?.endX ?? 0;
  const domainX: [number, number] = [0, Math.max(lastSampleX, lastBandX)];

  const segments = toSegments(readings);
  // Candidate B's bands come from the machine; with no stored intervals
  // they come from the rest-marked points, exactly as before.
  const restBands = (
    intervals.length > 0
      ? axis.bands
      : segments.flatMap((segment) => restBandsForSegment(segment))
  ).map((band) => ({
    startX: Math.max(domainX[0], band.startX),
    endX: Math.min(domainX[1], band.endX),
  }));
  const stops = findStopSpans(series.samples, axis.xs, measure);
  const ticksY = chooseTicks(domainY, TICK_COUNT);
  const invert = measure === "pace";
  const summary = buildSummary(measure, restBands, readings, segments);

  return {
    points: segments,
    domainX,
    domainY,
    ticksY,
    invert,
    summary,
    restBands,
    stops,
  };
}
