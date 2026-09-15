import { fmtSplit } from "../../../domain/format.js";
import {
  compareDates,
  firstOfMonth,
  lastOfMonth,
  monthStarts,
  toDayNumber,
} from "../../../domain/stats/calendar.js";
import {
  testTrend,
  type TestDistance,
  type TestPoint,
} from "../../../domain/stats/testTrend.js";
import type { TestHistoryState } from "../../api/useTestHistory";
import { ADVANCE, chooseTicks, formatTick, labelRoom } from "../../charts/axis";
import { polylinePoints } from "../../charts/line";
import { domainFromReadings, linearScale } from "../../charts/scale";
import { trendLabel } from "./chartLabels";
import { fmtMonth } from "./format";

const W = 320;
const H = 150;
/** DERIVED (invariant I4, Gate 0A ruling 1). This axis prints whole-second
 *  splits, so its widest tick is four glyphs (`2:05`):
 *  ceil(4 x 5.94) + 6 = 30. The 40 it replaces had 10.23 of slack. */
const PAD_L = labelRoom(["2:05"], ADVANCE.spaced, 6);
const PAD_R = 52;
const PAD_T = 12;
const PAD_B = 18;
const PLOT_BOTTOM = H - PAD_B;
/** ≤ 6 month labels along the x-axis (A3 draws six over eleven months). */
const MAX_MONTH_LABELS = 6;
/** DERIVED (invariant I4, Gate 0A ruling 1) from the label itself at
 *  `.stats-point-label`'s measured 5.40 plus its 8 px gap — `2K 1:54.0` is
 *  9 glyphs, so ceil(48.6) + 8 = 57. The 58 it replaces was adequate, but
 *  only by luck: its comment priced the glyph at 5.56 and the class that
 *  draws it advances 5.40. Past `W − room` the label flips LEFT of the dot. */
const labelRoomFor = (label: string) => labelRoom([label], ADVANCE.plain, 8);
/** The y-domain floor for a single test (`domainFromReadings` needs two). */
const ONE_POINT_HALF_SPAN = 5;
// One line-height at the label's 9 px type: closer than this and the two end
// labels overprint.
const LABEL_GAP = 12;

export const NO_TEST_LOGGED = "NO 2K OR 6K TEST LOGGED";
export const FASTER_IS_UP = "FASTER IS UP";
/** The trend's own fetch failed; the rest of the page stands. Copy
 *  pending James at PR review (Gate 0 drew no failed-fetch frame). */
export const COULDNT_LOAD_TESTS = "Couldn't load your tests.";

/** TEST TREND (spec §5 item 6, §14 ruling 4): 2k (`--ink`) and 6k
 *  (`--type-o2`) split seconds over the date of `test_history.loggedAt`,
 *  faster is UP, whole-second `split` ticks at `chooseTicks`'s steps, the
 *  last point of each series labelled; every point kept whether or not
 *  its log survives. Never filtered. No caption (rulings 18/19). */
export default function TestTrendGroup({ state }: { state: TestHistoryState }) {
  return (
    <section className="stats-group" aria-labelledby="stats-trend-h">
      <h2 id="stats-trend-h" className="stats-group-title">
        TEST TREND
      </h2>
      {state.state === "loading" && <p className="stats-caption">LOADING…</p>}
      {state.state === "error" && (
        <p className="notice" role="alert">
          {COULDNT_LOAD_TESTS}{" "}
          <button
            type="button"
            className="button-outline"
            onClick={state.retry}
          >
            Try again
          </button>
        </p>
      )}
      {state.state === "ready" && state.points.length === 0 && (
        <p className="stats-caption">{NO_TEST_LOGGED}</p>
      )}
      {state.state === "ready" && state.points.length > 0 && (
        <div className="stats-card">
          <TestTrendChart points={state.points} />
          <p className="stats-trend-legend">
            <span className="stats-legend-chip">
              <span
                className="stats-trend-swatch stats-trend-swatch-2k"
                aria-hidden="true"
              />
              2K
            </span>
            <span className="stats-legend-chip">
              <span
                className="stats-trend-swatch stats-trend-swatch-6k"
                aria-hidden="true"
              />
              6K
            </span>
            <span>{FASTER_IS_UP}</span>
          </p>
        </div>
      )}
    </section>
  );
}

const SERIES: readonly TestDistance[] = ["6k", "2k"]; // 2k drawn last, on top

export function TestTrendChart({ points }: { points: readonly TestPoint[] }) {
  const trend = testTrend(points);
  const all = [...trend["6k"], ...trend["2k"]];
  const dates = all.map((p) => p.date).sort(compareDates);
  const from = firstOfMonth(dates[0]!);
  const to = lastOfMonth(dates[dates.length - 1]!);
  const x = linearScale({
    domain: [toDayNumber(from), toDayNumber(to)],
    range: [PAD_L, W - PAD_R],
  });
  const splits = all.map((p) => p.splitSeconds);
  const domainY = domainFromReadings(splits, { minHeight: 10 }) ?? [
    splits[0]! - ONE_POINT_HALF_SPAN,
    splits[0]! + ONE_POINT_HALF_SPAN,
  ];
  // Faster (a smaller split) is UP: `invert` maps the low domain end to the
  // top pixel, the same rule TraceChart's pace axis uses.
  const y = linearScale({
    domain: domainY,
    range: [PLOT_BOTTOM, PAD_T],
    invert: true,
  });
  // Two series ending within a line-height of each other overprint their end
  // labels, so the LOWER one (the slower split) moves down to clear it.
  const endY = new Map<TestDistance, number>();
  for (const k of SERIES) {
    const last = trend[k][trend[k].length - 1];
    if (last) endY.set(k, y(last.splitSeconds));
  }
  // The lower label's y is set FROM the upper one, so the two land exactly
  // LABEL_GAP apart rather than a float's width short of it.
  const labelY = new Map<TestDistance, number>(endY);
  if (endY.size === 2) {
    const [a, b] = [...endY.entries()];
    if (Math.abs(a![1] - b![1]) < LABEL_GAP) {
      const [upper, lower] = a![1] <= b![1] ? [a!, b!] : [b!, a!];
      labelY.set(lower[0], upper[1] + LABEL_GAP);
    }
  }
  const ticks = chooseTicks(domainY, 4);
  const months = monthStarts(from, to);
  const every = Math.ceil(months.length / MAX_MONTH_LABELS);
  return (
    <svg
      className="stats-chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={trendLabel(trend)}
    >
      {ticks.map((v) => (
        <g key={v}>
          <line
            className="stats-grid"
            x1={PAD_L}
            x2={W - PAD_R}
            y1={y(v)}
            y2={y(v)}
          />
          <text
            className="stats-tick"
            x={PAD_L - 6}
            y={y(v)}
            textAnchor="end"
            dominantBaseline="middle"
          >
            {formatTick(v, "split")}
          </text>
        </g>
      ))}
      {months.map((m, i) =>
        i % every === 0 ? (
          <text
            key={`${m.y}-${m.m}`}
            className="stats-tick"
            x={x(toDayNumber(m))}
            y={H - 5}
            textAnchor="middle"
          >
            {fmtMonth(m)}
          </text>
        ) : null,
      )}
      {SERIES.map((k) => {
        const pts = trend[k];
        const last = pts[pts.length - 1];
        const cls = k === "6k" ? "-6k" : "";
        return (
          <g key={k} data-series={k}>
            {pts.length > 1 && (
              <polyline
                className={`stats-line stats-line${cls}`}
                points={polylinePoints(
                  pts.map((p) => ({
                    x: toDayNumber(p.date),
                    y: p.splitSeconds,
                  })),
                  x,
                  y,
                )}
              />
            )}
            {pts.map((p) => (
              <circle
                key={p.id}
                className={`stats-dot stats-dot${cls}`}
                cx={x(toDayNumber(p.date))}
                cy={y(p.splitSeconds)}
                r={4}
              />
            ))}
            {last &&
              (() => {
                const label = `${k.toUpperCase()} ${fmtSplit(last.splitSeconds)}`;
                const tx = x(toDayNumber(last.date));
                const right = tx + labelRoomFor(label) <= W;
                return (
                  <text
                    className="stats-point-label"
                    x={right ? tx + 8 : tx - 8}
                    y={labelY.get(k) ?? y(last.splitSeconds)}
                    textAnchor={right ? "start" : "end"}
                    dominantBaseline="middle"
                  >
                    {label}
                  </text>
                );
              })()}
          </g>
        );
      })}
    </svg>
  );
}
