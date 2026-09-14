import { toDayNumber } from "../../../domain/stats/calendar.js";
import type { SeasonSummary } from "../../../domain/stats/season.js";
import {
  ADVANCE,
  chooseTicks,
  formatTick,
  labelRoom,
  niceMax,
} from "../../charts/axis";
import { polylinePoints } from "../../charts/line";
import { linearScale } from "../../charts/scale";
import { seasonLabel } from "./chartLabels";
import { fmtMeters, fmtMonth } from "./format";
import { TWO_ROWS_MAKE_A_CHART } from "./TimeByTypeGroup";

const W = 320;
const H = 140;
/** DERIVED (invariant I4, Gate 0A ruling 1) — see `WeekBarsGroup`'s
 *  `PAD_L`, the same widest-ever tick (`1000k`) and the same arithmetic. */
const PAD_L = labelRoom(["1000k"], ADVANCE.spaced, 6);
const PAD_R = 12;
const PAD_T = 14;
const PAD_B = 18;
const PLOT_BOTTOM = H - PAD_B;
// DERIVED per render (invariant I4, Gate 0A ruling 1) from the label this
// season actually prints, at `.stats-point-label`'s own measured advance —
// the comment this replaces priced 12 glyphs "at 0.06 em ≈ 70 px", but that
// class carries NO letter-spacing (5.40, not 5.83), and 78 was 0.22 short
// at the worst placement its own rule allowed.
const labelRoomFor = (label: string) => labelRoom([label], ADVANCE.plain, 8);

export const NO_ROWS_THIS_SEASON = "NO ROWS THIS SEASON YET";
export const STREAK_UNIT = "WEEKS · ERGOMATIC";

/** SEASON <name> (spec §5 item 5, invariant 19): the cumulative curve
 *  May 1 → today across the whole season's width, its `<n> TODAY` end
 *  label, and AVG M/DAY / CURRENT STREAK / LONGEST STREAK — ONE row set,
 *  never the filter's. No caption (rulings 18/19). At 0 season rows the
 *  card reads NO ROWS THIS SEASON YET; at 1, TWO ROWS MAKE A CHART. */
export default function SeasonGroup({ summary }: { summary: SeasonSummary }) {
  return (
    <section className="stats-group" aria-labelledby="stats-season-h">
      <h2 id="stats-season-h" className="stats-group-title">
        SEASON {summary.season.name}
      </h2>
      {summary.rows === 0 ? (
        <p className="stats-caption">{NO_ROWS_THIS_SEASON}</p>
      ) : summary.rows === 1 ? (
        <p className="stats-caption">{TWO_ROWS_MAKE_A_CHART}</p>
      ) : (
        <div className="stats-card">
          <SeasonChart summary={summary} />
          <dl className="stats-tiles">
            <Tile
              label="AVG M/DAY"
              value={fmtMeters(summary.avgPerDay)}
              unit="M"
            />
            <Tile
              label="CURRENT STREAK"
              value={String(summary.streak.current)}
              unit={STREAK_UNIT}
            />
            <Tile
              label="LONGEST STREAK"
              value={String(summary.streak.longest)}
              unit={STREAK_UNIT}
            />
          </dl>
        </div>
      )}
    </section>
  );
}

function Tile({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="stats-tile">
      <dt>{label}</dt>
      <dd>
        <span className="stats-tile-value">{value}</span>
        <span className="stats-tile-unit">{unit}</span>
      </dd>
    </div>
  );
}

export function SeasonChart({ summary }: { summary: SeasonSummary }) {
  const { season, points, total } = summary;
  const start = toDayNumber(season.start);
  const end = toDayNumber(season.end);
  const todayX = start + summary.days - 1;
  const x = linearScale({ domain: [start, end], range: [PAD_L, W - PAD_R] });
  const { max, step } = niceMax(total);
  const y = linearScale({ domain: [0, max], range: [PLOT_BOTTOM, PAD_T] });
  const grid = chooseTicks([0, max], max / step + 1);
  const months = [5, 8, 11, 2, 4].map((m) => ({
    y: m >= 5 ? season.start.y : season.end.y,
    m,
    d: 1,
  }));
  const line = polylinePoints(
    [
      { x: start, y: 0 },
      ...points.map((p) => ({ x: toDayNumber(p.date), y: p.cumulative })),
      { x: todayX, y: total },
    ],
    x,
    y,
  );
  const tx = x(todayX);
  // The same overrun rule TestTrendGroup uses: the label sits to the right of
  // the dot unless it would leave the viewBox. A share of the width (60 %)
  // flipped labels that still fitted, for two months of every season.
  const pointLabel = `${fmtMeters(total)} TODAY`;
  const labelRight = tx + labelRoomFor(pointLabel) <= W;
  return (
    <svg
      className="stats-chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={seasonLabel(summary)}
    >
      {grid.map((v) => (
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
            {formatTick(v, "metres")}
          </text>
        </g>
      ))}
      {months.map((m) => (
        <text
          key={m.m}
          className="stats-tick"
          x={x(toDayNumber(m))}
          y={H - 5}
          textAnchor="middle"
        >
          {fmtMonth(m)}
        </text>
      ))}
      <polyline className="stats-line" points={line} />
      <line
        className="stats-today-line"
        x1={tx}
        x2={tx}
        y1={PAD_T}
        y2={PLOT_BOTTOM}
      />
      <circle className="stats-dot" cx={tx} cy={y(total)} r={5} />
      <text
        className="stats-point-label"
        x={labelRight ? tx + 8 : tx - 8}
        y={y(total)}
        textAnchor={labelRight ? "start" : "end"}
        dominantBaseline="middle"
      >
        {pointLabel}
      </text>
    </svg>
  );
}
