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
// NO BOUNDARY MARKS (§4's cut, pinned): this file renders exactly three
// kinds of SVG mark — the polyline(s), the y-axis tick marks/labels, and
// nothing else. Any future interval-boundary feature is a deliberate,
// separate addition, never a quiet insertion here.

import { useMemo, useState } from "react";
import type { SeriesData } from "../monitor/seriesRecorder.js";
import { linearScale, decimate } from "../charts/scale.js";
import { formatTick } from "../charts/axis.js";
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
const CHART_HEIGHT = 140;
const LEFT_PAD = 36;
const RIGHT_PAD = 8;
const TOP_PAD = 10;
const BOTTOM_PAD = 10;

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
    range: [CHART_HEIGHT - BOTTOM_PAD, TOP_PAD],
    invert: trace.invert,
  });

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
        {/* trace-truth Task 2 (spec §3): drawn FIRST — beneath the tick
            marks and the polyline(s) — so the band reads as a background
            tint the line and ticks sit on top of, never a foreground
            overlay that could obscure a reading. Computed from the
            FULL (non-decimated) points per segment; the polyline below
            is decimated independently and stays one continuous stroke
            across the band (§3: a rest is not a gap). */}
        {trace.points.map((segment, segIndex) =>
          restBandsForSegment(segment).map((band, bandIndex) => {
            const x1 = xScale(Math.max(trace.domainX[0], band.startX));
            const x2 = xScale(Math.min(trace.domainX[1], band.endX));
            return (
              <rect
                key={`${segIndex}-${bandIndex}`}
                className="trace-rest-band"
                x={x1}
                y={TOP_PAD}
                width={Math.max(0, x2 - x1)}
                height={CHART_HEIGHT - TOP_PAD - BOTTOM_PAD}
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
                className="trace-tick-label"
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
    </figure>
  );
}
