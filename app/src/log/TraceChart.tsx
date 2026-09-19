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
//
// PLOT CLIP (2026-08-20): the polyline group also carries a `clip-path`
// scoped to the plot rect (`PLOT_CLIP_*` below) — `traceModel.ts` now
// builds `domainY` from WORK readings only, so a rest excursion's own
// pixel can genuinely fall outside the plot; this is what makes it run
// off the bottom instead of painting over the axis gutter/rest band.

import { useId, useMemo, useState } from "react";
import type { SeriesData } from "../monitor/seriesRecorder.js";
import { linearScale, decimate } from "../charts/scale.js";
import { ADVANCE, chooseTicks, formatTick, labelRoom } from "../charts/axis.js";
import {
  buildTrace,
  type IntervalSpan,
  type Measure,
  type TraceModel,
} from "./traceModel.js";

const MEASURES: readonly Measure[] = ["pace", "rate", "hr"];

/** The default `intervals`, hoisted so the doors that have none (timer,
 *  manual, Just Row) hand the memo below a STABLE array and keep their
 *  own traces cached across a parent render. The doors that do have
 *  intervals do not get that — see the memo's own comment. */
const NO_INTERVALS: readonly IntervalSpan[] = Object.freeze([]);

const MEASURE_LABEL: Record<Measure, { visible: string; spoken: string }> = {
  pace: { visible: "PACE", spoken: "Pace" },
  rate: { visible: "RATE", spoken: "Stroke rate" },
  hr: { visible: "HR", spoken: "Heart rate" },
};

const CHART_WIDTH = 320;
/** DERIVED (invariant I4, Gate 0A rulings 1 and 4), and smaller because the
 *  labels are shorter. The y ticks now print whole seconds (`1:50`, the
 *  `split` kind Phase PS added for exactly this reason), so the widest
 *  label any measure can produce is four glyphs — pace tops out at `1:50`
 *  scale, rate at `28`, heart rate at `152`:
 *  `labelRoom(["1:50"], ADVANCE.plain, 6)` = ceil(4 x 5.40) + 6 = 28.
 *  The 42 it replaces was a hand bump from 36 after a clipped `1` read as
 *  `L` (`L:40.0`) on two committed captures.
 *
 *  THE BOUND, STATED RATHER THAN ASSUMED (review finding). Four glyphs is
 *  not a property of the format, it is a property of the DATA: nothing
 *  clamps pace, and `traceModel` builds `domainY` from any non-zero work
 *  reading, so a light-paddle stretch slower than 9:59 per 500 m puts a
 *  five-glyph `10:00` on this axis and clips it by ~1 unit. **Not a
 *  regression** — the 42 this replaces broke at the identical 600 s
 *  threshold, with `fmtSplit`'s seven-glyph `10:00.0`. Left fixed rather
 *  than derived per render because the y gutter sets the plot's left edge
 *  and Gate 0A approved that frame; a per-render gutter is PR 3's to
 *  propose, where the axis is already being reopened. Rate tops out at two
 *  glyphs and heart rate at three, so pace is the only measure that can
 *  reach this bound at all. */
const LEFT_PAD = labelRoom(["1:50"], ADVANCE.plain, 6);
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

/** 2026-08-20: `domainY` (`traceModel.ts`) is now built from WORK
 *  readings only, so a rest excursion's own pixel — computed off that
 *  same `yScale`, unaware anything was excluded — can genuinely land
 *  outside `[TOP_PAD, PLOT_BOTTOM)`. The polyline is clipped to exactly
 *  this rect so an excursion runs off the bottom (or top) and simply
 *  disappears there, rather than painting over the x-axis labels or the
 *  rest band sitting in the gutter below `PLOT_BOTTOM`. Deliberately the
 *  PLOT rect, not the full `[0, CHART_WIDTH]x[0, CHART_HEIGHT]` canvas —
 *  clipping to the whole SVG would also cut off the y-axis labels
 *  (anchored left of `LEFT_PAD`) and the gutter contents themselves. */
const PLOT_CLIP_X = LEFT_PAD;
const PLOT_CLIP_Y = TOP_PAD;
const PLOT_CLIP_WIDTH = CHART_WIDTH - LEFT_PAD - RIGHT_PAD;
const PLOT_CLIP_HEIGHT = PLOT_BOTTOM - TOP_PAD;

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

/** Gate 0B board 2, M3: the `STOPPED 61s` label's own baseline, just
 *  inside the plot's top padding — the same "positions, not fractions"
 *  rule the axis gutter's constants above follow. */
const STOP_LABEL_Y = TOP_PAD + 8;

/** Keeps a centred SVG label inside the viewBox by hanging it the other
 *  way when it would otherwise overrun an edge, DERIVED FROM THE LABEL
 *  rather than from where it sits (invariant I4). Shared by the x-axis
 *  ticks (Gate 0A member M8, where a tick on the plot's right edge lost
 *  its final glyph) and by the stop label, which has the same problem
 *  from the other direction: `STOPPED 61s` is ~59 units wide and a short
 *  stop's own rect can be three.
 *
 *  THE TWO CALLERS PASS DIFFERENT BOUNDS, and that is the point. An
 *  x-axis tick label may use the whole viewBox — it sits in the gutter,
 *  below everything. A stop label sits INSIDE the plot, level with the
 *  y-axis tick labels, so its bound is the plot's own left edge:
 *  centred, a 6 s stop's label starts at x 7 and paints straight across
 *  a `2:10` sitting at x 22. */
function anchorFor(
  x: number,
  label: string,
  min: number,
  max: number,
): "start" | "middle" | "end" {
  const half = (label.length * ADVANCE.plain) / 2;
  if (x - half < min) return "start";
  if (x + half > max) return "end";
  return "middle";
}

export default function TraceChart({
  series,
  intervals = NO_INTERVALS,
}: {
  series: SeriesData | undefined;
  /** Gate 0B board 2 (APPROVED 2026-09-19): the machine's own
   *  per-interval work and rest seconds, in rowed order, which is what
   *  makes the x axis `work + rest` rather than each sample's own `t`.
   *  Defaults to none — a free row, a timer/manual row, and a row saved
   *  before the rest readback shipped all keep the axis they had. */
  intervals?: readonly IntervalSpan[];
}) {
  const [measure, setMeasure] = useState<Measure>("pace");
  // Scopes the plot clip-path to THIS component instance — React's own
  // SSR/multi-instance-safe id (never a hardcoded string: two traces on
  // one page, e.g. a future comparison view, would otherwise collide on
  // one `id` and one clip-path would silently win for both).
  const plotClipId = useId();

  // WHAT THIS MEMO DOES AND DOES NOT BUY, measured rather than assumed.
  // It holds across a MEASURE TAP (`setMeasure` re-renders this
  // component alone, with the same props), which is what it is for. It
  // does NOT hold across a parent render: both producers of `intervals`
  // (`buildStoredSummary`, `buildSummaryModel`) run unmemoized, so the
  // array is a fresh object every time even when nothing in it changed,
  // and the log-detail screen re-renders on every keystroke in its
  // notes field. Rebuilding all three traces costs **0.070 ms** on the
  // real 419-sample `session-2` capture (200 iterations, throwaway
  // probe, 2026-09-19), so that is a real miss and not a real cost —
  // stated here because the obvious fix, keying on the array's VALUES,
  // needs either a ref read during render or an eslint suppression, and
  // neither is worth 70 microseconds.
  const traces = useMemo(() => {
    const built = {} as Record<Measure, TraceModel | null>;
    for (const m of MEASURES) built[m] = buildTrace(series, m, intervals);
    return built;
  }, [series, intervals]);

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
        <defs>
          <clipPath id={plotClipId}>
            <rect
              x={PLOT_CLIP_X}
              y={PLOT_CLIP_Y}
              width={PLOT_CLIP_WIDTH}
              height={PLOT_CLIP_HEIGHT}
            />
          </clipPath>
        </defs>
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
            own comment above.
            SINCE GATE 0B BOARD 2 the bands come from `traceModel`, not
            from these points: under the stored-interval axis a band's
            WIDTH is the machine's own rest readback, which the points
            cannot supply (they cover only the part of the rest the rower
            kept moving through — that is the defect). The line no longer
            runs continuously across a band either; it breaks, because
            there are no readings for the part of the rest the rower sat
            still through. Both were true before and are stated here
            because this comment used to assert them. */}
        {trace.restBands.map((band, index) => {
          const x1 = xScale(band.startX);
          const x2 = xScale(band.endX);
          return (
            <rect
              key={index}
              className="trace-rest-band"
              x={x1}
              y={REST_BAND_Y}
              width={Math.max(0, x2 - x1)}
              height={REST_BAND_HEIGHT}
            />
          );
        })}
        {/* Gate 0B board 2, M3 (APPROVED 2026-09-19): a span where the
            machine's own distance stood still while its clock ran.
            Drawn BENEATH the polyline on purpose — the line has to stay
            readable across it, and it does: the stroke measures 4.80:1
            where the band crosses it, against WCAG's 3:1 for a graphical
            object (`board2/frames/contrast.json`). The band itself is
            `--ink-3` at 0.68, which sits in the middle of that token's
            own window — below 0.647 the band misses 3:1 against the
            page, above 0.710 the 9 px label on it misses 4.5:1. Colour
            and opacity live in `index.css`, never inline, so the window
            is stated in one place. */}
        {trace.stops.map((stop, index) => {
          const x1 = xScale(stop.startX);
          const x2 = xScale(stop.endX);
          const label = `STOPPED ${Math.round(stop.seconds)}s`;
          return (
            <g key={index}>
              <rect
                className="trace-stop-span"
                x={x1}
                y={TOP_PAD}
                width={Math.max(0, x2 - x1)}
                height={PLOT_BOTTOM - TOP_PAD}
              />
              <text
                className="trace-tick-label trace-stop-label"
                x={(x1 + x2) / 2}
                y={STOP_LABEL_Y}
                textAnchor={anchorFor(
                  (x1 + x2) / 2,
                  label,
                  LEFT_PAD,
                  CHART_WIDTH - RIGHT_PAD,
                )}
                dominantBaseline="hanging"
              >
                {label}
              </text>
            </g>
          );
        })}
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
                {formatTick(tick, selected === "pace" ? "split" : selected)}
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
          const label = formatTick(tick * 10, "time");
          // Gate 0A, member M8: a tick sitting ON the plot's right edge
          // carries a CENTRED label that overhangs the viewBox by 2.80
          // units and loses its final glyph (`0:4(` — measured 2026-09-14,
          // and visible in this branch's own before-capture). The mark
          // never moves; only the text hangs the other way, and ONLY when
          // it has to.
          //
          // DERIVED FROM THE LABEL, not from its index (invariant I4, and
          // review caught the first draft doing the latter). A tick lands
          // on the edge only when the trace's duration is an exact
          // multiple of the chosen step, and the first tick — `chooseTicks`
          // always emits `0` — never reaches an edge at all, so anchoring
          // by index pulled labels off their own marks on every other
          // trace to prevent a clip that was not happening there.
          const anchor = anchorFor(x, label, 0, CHART_WIDTH);
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
                textAnchor={anchor}
                dominantBaseline="hanging"
              >
                {label}
              </text>
            </g>
          );
        })}
        {/* 2026-08-20: clipped to the plot rect (see `PLOT_CLIP_*` above)
            — a rest excursion's own pixel can now fall outside
            `[TOP_PAD, PLOT_BOTTOM)` since `domainY` no longer scales to
            include it, and this is what stops it painting over the axis
            gutter/rest band below instead of just running off the plot. */}
        <g clipPath={`url(#${plotClipId})`}>
          {trace.points.map((segment, index) => {
            const decimated = decimate(segment, PLOT_COLUMNS);
            const pointsAttr = decimated
              .map((p) => `${xScale(p.x)},${yScale(p.y)}`)
              .join(" ");
            return (
              <polyline
                key={index}
                className="trace-line"
                points={pointsAttr}
              />
            );
          })}
        </g>
      </svg>
      {/* F-2 (James's ruling, review round 2): one quiet line explaining
          the band, shown only when there is something to explain, never a
          permanent fixture on a rest-free trace. It used to cite the
          summary's `.summary-legend` and that file's `hasJudgedRow` guard
          as its idiom; Phase JC deleted both, on this very comment's own
          reasoning below — the legend named two colours a rower can now
          repoint or switch off. The additive-only-when-there-is-something-
          to-explain rule is unchanged; only the precedent moved. Spec §3 forbids copy claiming the rest PACE is
          meaningful; it says nothing about naming what the mark
          itself is, so this says only that.
          THE WORD "BAND" IS NOW THE MARK ITSELF (Gate 0B board 2,
          James 2026-09-19: "if instead of the word 'band' just show a
          [yellow] bar and then '= rest'"). The swatch is `--trace-rest`,
          the same fill `.trace-rest-band` carries, so the legend and the
          thing it names cannot drift; it measures 4.25:1 against the
          page, and WCAG 1.4.11's 3:1 binds it because it carries
          meaning. The word survives visually hidden, for a screen reader
          that cannot see a swatch — which also keeps the old rule that
          the copy never names a COLOUR (`#97692a` reads amber in a PR
          body and bronze on the capture) and never claims the rest PACE
          is meaningful (spec §3).
          THE AXIS CAPTION IS GONE (James, same session: "you can drop
          the label for x, it's obvious what it is"). What names the
          quantity now is the mark: a rest drawn at its own length is
          what says the axis counts rest, which is the whole of what
          separates this axis from a work-only one. Invariant I3 is
          reworded to match in the spec, in this PR's own commit. */}
      {trace.restBands.length > 0 && (
        <p className="trace-legend">
          <span className="trace-legend-swatch" aria-hidden="true" />
          <span className="visually-hidden">Band</span>
          {" = REST"}
        </p>
      )}
    </figure>
  );
}
