// Phase LT spec 3, Task 2. The chart component: pace by default, rate and
// heart rate a tap away (§1 ruling 2), drawn as hand-rolled inline SVG
// (§2 ruling 3 — no charting dependency; Recharts measured at +94 KB
// gzipped for a feature this small, the spec's own ruling). Absence is
// the idiom every surface in this phase uses (§1): no series, or fewer
// than 3 real pace readings, renders NOTHING — no empty frame, no
// placeholder, the exact same rule `traceModel.ts`'s own `buildTrace`
// already enforces per measure; this component just reads its null.
//
// The toggle follows the connected surface's `SegmentedControl.tsx` idiom
// (plain buttons, `aria-current`, no roving tabindex — "no APG tablist
// invention", that file's own ruling) rather than `PaceRefInput`'s
// radiogroup: this switches between named VIEWS of the same trace, the
// same relationship LIVE/GRID has, not a domain VALUE a form field owns.
// `aria-current="true"` rather than `"page"` — `SegmentedControl.tsx`'s
// own comment names `"page"` as "the one shipped use... in this app", a
// claim a second use here would silently break; `"true"` is the ARIA spec's
// own generic value for exactly this "currently selected/shown" case.
// Built off a fixed measure list, filtered to what the series can
// actually draw — the same "never a hardcoded pair" guard
// `SegmentedControl.tsx`'s own `PANES` carries, so a fourth measure would
// fail loudly rather than render silently unreachable.
//
// NO BOUNDARY MARKS (§4's cut, pinned): this file renders the polyline(s),
// the y-axis tick marks/labels, the rest band (Task 2), and — as of
// trace-truth Task 3 — the x-axis (time) tick marks/labels, and nothing
// else. None of these name an interval: the x-axis spans the trace's own
// elapsed time, not step boundaries. Any future interval-boundary feature
// is a deliberate, separate addition, never a quiet insertion here.

import { useMemo, useState } from "react";
import type { SeriesData } from "../monitor/seriesRecorder.js";
import { linearScale, decimate } from "../charts/scale.js";
import { chooseTicks, formatTick } from "../charts/axis.js";
import {
  buildTrace,
  type Measure,
  type TraceModel,
  type TracePoint,
} from "./traceModel.js";

const MEASURES: readonly Measure[] = ["pace", "rate", "hr"];

const MEASURE_LABEL: Record<Measure, { visible: string; spoken: string }> = {
  pace: { visible: "PACE", spoken: "Pace" },
  rate: { visible: "RATE", spoken: "Stroke rate" },
  hr: { visible: "HR", spoken: "Heart rate" },
};

const CHART_WIDTH = 320;
/** Bumped from 36 (trace-truth Task 3): the y-axis label anchor sat at
 *  `LEFT_PAD - 6` = 30, and the widest real label (`1:40.0`/`1:50.0`, 6
 *  monospace glyphs) overhung that anchor far enough left to clip against
 *  the SVG's own x=0 edge — confirmed on both committed captures, where
 *  the clipped "1" reads as "L" (`L:40.0`). The extra 6 units of anchor
 *  room removes the overhang; ordinary digits (`2:00.0` etc.) were never
 *  clipped, so this is sized for the widest case, not the common one. */
const LEFT_PAD = 42;
const RIGHT_PAD = 8;
const TOP_PAD = 10;
const BOTTOM_PAD = 10;

/** The plot's own frame — unchanged in SIZE since Task 2, still what the
 *  y-scale, the polylines and the y-axis ticks live inside. Named
 *  `PLOT_AREA_HEIGHT` (not `CHART_HEIGHT`, trace-truth Task 3) now that
 *  the SVG's own total height is taller than the plot: the axis gutter
 *  below is additional canvas, not a resize of this frame. `PLOT_BOTTOM`
 *  is the one value the rest of this file needs from it (the y-scale's
 *  own lower bound, and the axis gutter's own top edge) — no code here
 *  still needs the plot's own height as a number now that the rest band
 *  no longer sizes itself as a fraction of it (see that constant's own
 *  comment below). */
const PLOT_AREA_HEIGHT = 140;
const PLOT_BOTTOM = PLOT_AREA_HEIGHT - BOTTOM_PAD;

/** trace-truth Task 3 (spec §4): the axis gutter — the x-axis's own tick
 *  marks/labels, and (moved down here from inside the plot, see the rest
 *  band comment below) the rest band. `CHART_HEIGHT` is now the SVG's
 *  full height (plot + gutter); the y-scale/polyline/y-ticks all keep
 *  using `PLOT_BOTTOM` explicitly, never this, so none of their geometry
 *  moves. */
const AXIS_GUTTER_HEIGHT = 34;
const CHART_HEIGHT = PLOT_AREA_HEIGHT + AXIS_GUTTER_HEIGHT;

/** Review round 2 (James's ruling, three mocked treatments against the
 *  real tokens and geometry — bottom-anchored won): a full-height,
 *  100%-opacity band read as "something is blocking the data", and let
 *  the polyline cross it at full plot height, dropping the stroke's own
 *  contrast from 17.11:1 to 3.62:1 wherever a rest sat on the chart's
 *  own lowest plateau. Round 2's fix was a SHORT bar at the plot's own
 *  foot, still INSIDE the plot's `[TOP_PAD, PLOT_BOTTOM)` y-range —
 *  "in practice" clear of the line only because `domainY`'s own 10%
 *  padding usually left room, never a hard guarantee.
 *
 *  SUPERSEDED (trace-truth Task 3): the band now sits ENTIRELY in the new
 *  axis gutter, its top edge flush with `PLOT_BOTTOM` and hanging DOWN
 *  from there — never up into the plot. `yScale`'s own range tops out at
 *  `PLOT_BOTTOM` (never higher), so no rendered polyline pixel can ever
 *  reach a y-coordinate this band occupies: the crossing round 2 traded
 *  off against is now impossible by construction, not merely unlikely in
 *  practice. `TraceChart.test.tsx`'s own "the rest band never overlaps
 *  the plot's own data space" pins exactly this — every band's `y` is
 *  `>= PLOT_BOTTOM`, on a real rest-bearing capture. Colour/opacity
 *  unchanged (`--trace-rest`, full strength — §3's own word is "tint",
 *  never an alpha wash). */
const REST_BAND_HEIGHT = 8;
const REST_BAND_Y = PLOT_BOTTOM;

/** trace-truth Task 3 (spec §4): the x-axis's own tick marks (a short
 *  vertical line below the plot floor) and labels (below that), stacked
 *  beneath the rest band row so nothing in the gutter overlaps anything
 *  else in it. Positions, not fractions — this gutter has no reason to
 *  scale with plot height the way the old in-plot rest band did. */
const X_TICK_MARK_Y1 = REST_BAND_Y + REST_BAND_HEIGHT + 4;
const X_TICK_MARK_LEN = 4;
const X_TICK_MARK_Y2 = X_TICK_MARK_Y1 + X_TICK_MARK_LEN;
const X_TICK_LABEL_Y = X_TICK_MARK_Y2 + 4;

/** A fixed, modest x-axis tick budget for a small mobile chart — the same
 *  reasoning `traceModel.ts`'s own `TICK_COUNT` (y-axis) gives: nothing
 *  in spec §4 pins a count, and this keeps a narrow SVG legible without
 *  crowding `chooseTicks`'s own round-number selection. */
const X_TICK_COUNT = 4;

/** Decimation's own `columns` argument (Task 1's `decimate`, §3's "~2
 *  points per horizontal pixel"). An inline SVG has no fixed device-pixel
 *  width of its own (it scales with the viewport) — the plot area's own
 *  SVG user-unit width stands in for "pixel", the same approximation the
 *  design's own "roughly" already allows. Applied PER SEGMENT and PER
 *  MEASURE (§3): each measure's own trace is decimated on its own points,
 *  never columns computed once and reused across measures. */
const PLOT_COLUMNS = CHART_WIDTH - LEFT_PAD - RIGHT_PAD;

/** trace-truth Task 2 (spec §3): half a sample-second of padding on each
 *  side of a rest run's own x-range, so a single ISOLATED rest sample
 *  (surrounded by work on both sides) still draws a visible band rather
 *  than a zero-width rect — the 1 Hz sample it came from genuinely
 *  covers about this much of the timeline either side of its own
 *  timestamp. Purely a rendering nicety; never affects `rest` itself or
 *  which points are marked. */
const REST_BAND_PAD_SECONDS = 0.5;

interface RestBand {
  startX: number;
  endX: number;
}

/** Finds every contiguous run of `rest === true` points in ONE segment.
 *  Never across a segment boundary — this function is only ever called
 *  per-segment (below), so a run spanning two segments is impossible by
 *  construction of the CALL SITE, not because a rest itself can't
 *  straddle a real gap (a dropped frame mid-rest would split one across
 *  two segments same as it would any other reading; `toSegments` doesn't
 *  special-case rest either way — a rest run that DID straddle a gap
 *  would simply become two separate bands, one per segment, which this
 *  function still renders correctly). Returns each run's own x-range,
 *  padded per `REST_BAND_PAD_SECONDS`. Reads the FULL, non-decimated
 *  segment — a band's own boundary must reflect the real rest span even
 *  when `decimate` would have dropped the exact point that started or
 *  ended it. */
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

export default function TraceChart({
  series,
}: {
  series: SeriesData | undefined;
}) {
  const [measure, setMeasure] = useState<Measure>("pace");

  const traces = useMemo(() => {
    const built = {} as Record<Measure, TraceModel | null>;
    for (const m of MEASURES) built[m] = buildTrace(series, m);
    return built;
  }, [series]);

  // §1's absence idiom: the DEFAULT measure alone decides whether the
  // chart exists — never a partial toggle-only shell around a broken
  // default.
  if (traces.pace === null) return null;

  const available = MEASURES.filter((m) => traces[m] !== null);
  const selected = available.includes(measure) ? measure : "pace";
  const trace = traces[selected]!;

  const xScale = linearScale({
    domain: trace.domainX,
    range: [LEFT_PAD, CHART_WIDTH - RIGHT_PAD],
  });
  const yScale = linearScale({
    domain: trace.domainY,
    range: [PLOT_BOTTOM, TOP_PAD],
    invert: trace.invert,
  });
  // trace-truth Task 3 (spec §4): `chooseTicks` reused unchanged, over
  // the SAME `domainX` the polyline/x-scale already use — the axis spans
  // exactly the trace's own duration, never a re-derived one.
  const ticksX = chooseTicks(trace.domainX, X_TICK_COUNT);

  return (
    <figure className="trace-figure">
      <nav className="trace-toggle" aria-label="Trace measure">
        {available.map((m) => (
          <button
            key={m}
            type="button"
            className="trace-toggle-button"
            aria-current={m === selected ? "true" : undefined}
            aria-label={MEASURE_LABEL[m].spoken}
            onClick={() => setMeasure(m)}
          >
            <span aria-hidden="true">{MEASURE_LABEL[m].visible}</span>
          </button>
        ))}
      </nav>
      <svg
        className="trace-svg"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-label={trace.summary}
      >
        {/* trace-truth Task 2 (spec §3) / Task 3: drawn FIRST — beneath the
            tick marks and the polyline(s) — still guarantees paint-order
            continuity (the line always sits on top, so it is never
            occluded), and (Task 3) the band now sits in the axis gutter
            below the plot floor (`REST_BAND_Y` = `PLOT_BOTTOM`), never
            inside the plot's own `[TOP_PAD, PLOT_BOTTOM)` y-range — round
            1 shipped a full-height in-plot fill that read as "something is
            blocking the data" and let the line cross it at full height;
            round 2's in-plot short bar fixed the visual but the crossing
            stayed geometrically possible, "in practice" prevented only by
            `domainY`'s own padding. Moving the band out of the plot
            entirely removes that "in practice" hedge — see the constant's
            own comment above. Computed from the FULL (non-decimated)
            points per segment; the polyline below is decimated
            independently and stays one continuous stroke across the
            band's own x-range (§3: a rest is not a gap). */}
        {trace.points.map((segment, segIndex) =>
          restBandsForSegment(segment).map((band, bandIndex) => {
            const x1 = xScale(Math.max(trace.domainX[0], band.startX));
            const x2 = xScale(Math.min(trace.domainX[1], band.endX));
            return (
              <rect
                key={`${segIndex}-${bandIndex}`}
                className="trace-rest-band"
                x={x1}
                y={REST_BAND_Y}
                width={Math.max(0, x2 - x1)}
                height={REST_BAND_HEIGHT}
              />
            );
          }),
        )}
        {trace.ticksY.map((tick) => {
          const y = yScale(tick);
          return (
            <g key={tick}>
              <line
                className="trace-tick-mark"
                x1={LEFT_PAD - 4}
                x2={LEFT_PAD}
                y1={y}
                y2={y}
              />
              <text
                className="trace-tick-label trace-tick-label-y"
                x={LEFT_PAD - 6}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {formatTick(tick, selected)}
              </text>
            </g>
          );
        })}
        {/* trace-truth Task 3 (spec §4): the x-axis — same tick-render
            shape as the y-axis loop just above (a mark, then a label),
            reused rather than hand-rolled a second way. `formatTick`'s
            own `"time"` kind takes TENTHS (`../charts/axis.js`'s doc
            comment), so each tick — a value in `domainX`'s own real
            seconds — is converted back (`* 10`) at the one call site that
            needs it; `domainX`/`xScale` themselves stay in seconds, the
            same unit the polyline already uses. `data-testid="trace-x-tick"`
            is this axis's own selector — the shared `.trace-tick-label`
            class alone can't distinguish an x-label from a y-label now
            that both exist. */}
        {ticksX.map((tick) => {
          const x = xScale(tick);
          return (
            <g key={tick}>
              <line
                className="trace-tick-mark"
                x1={x}
                x2={x}
                y1={X_TICK_MARK_Y1}
                y2={X_TICK_MARK_Y2}
              />
              <text
                className="trace-tick-label trace-tick-label-x"
                data-testid="trace-x-tick"
                x={x}
                y={X_TICK_LABEL_Y}
                textAnchor="middle"
                dominantBaseline="hanging"
              >
                {formatTick(tick * 10, "time")}
              </text>
            </g>
          );
        })}
        {trace.points.map((segment, index) => {
          const decimated = decimate(segment, PLOT_COLUMNS);
          const pointsAttr = decimated
            .map((p) => `${xScale(p.x)},${yScale(p.y)}`)
            .join(" ");
          return (
            <polyline key={index} className="trace-line" points={pointsAttr} />
          );
        })}
      </svg>
      {/* F-2 (James's ruling, review round 2): one quiet line explaining
          the band, same idiom as `PostWorkoutSummary.tsx`'s own
          `.summary-legend` ("<- FASTER (BLUE) . SLOWER (RED) ->") —
          shown only when there is something to explain (that file's own
          `hasJudgedRow` guard), never a permanent fixture on a rest-free
          trace. Spec §3 forbids copy claiming the rest PACE is
          meaningful; it says nothing about naming what the mark
          itself is, so this says only that.
          "BAND = REST", never "SHADED = REST" (review round 4, C1):
          round 1 shipped a full-height tint — THAT was shading. Round 2
          replaced it with a short bar on the plot floor and the word
          never moved with the geometry, so it named the rejected
          treatment. "Band" stays true regardless of geometry, and
          carries no colour word on purpose — `#97692a` reads amber in
          the PR body and bronze on the actual capture; naming a colour
          here would just be a second thing to get wrong later. */}
      {trace.points.some((segment) => segment.some((p) => p.rest)) && (
        <p className="trace-legend">BAND = REST</p>
      )}
    </figure>
  );
}
