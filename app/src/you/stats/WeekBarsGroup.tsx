import type { WeekBar } from "../../../domain/stats/weekly.js";
import { chooseTicks, formatTick, niceMax } from "../../charts/axis";
import { layoutBars } from "../../charts/bars";
import { linearScale } from "../../charts/scale";
import { weekBarsLabel } from "./chartLabels";
import { fmtDate, fmtDayMonth, fmtMeters } from "./format";
import { TWO_ROWS_MAKE_A_CHART } from "./TimeByTypeGroup";

const W = 320;
const H = 132;
/** 44, not A3's 36: a six-glyph tick (`15,000`) at 9 px mono is ~34 px
 *  wide and end-anchored at `PAD_L - 6`, so 36 clipped its first digit on
 *  the first capture — the same overhang `TraceChart`'s `LEFT_PAD` fixed. */
const PAD_L = 44;
const PAD_R = 8;
const PAD_T = 14;
const PAD_B = 18;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_BOTTOM = H - PAD_B;
const BAR_MAX = 24;
/** A3's rounded bar top (`build.mjs` `barsSvg`): 4 px caps, square base. */
const CAP = 4;
export const OUT_OF_RANGE = "OUT OF RANGE";
export const THIS_WEEK = "THIS WK";
/** Two or more rows in range and no METRES in the window's eight weeks
 *  (ALL with only old rows, or only null-metres rows there): the chart
 *  would be eight zero baselines. "Metres", not "nothing" — a stored-tier
 *  row with `workMeters: null` is still a session. Copy pending James at
 *  PR review (Gate 0 drew no such frame). */
export const NOTHING_IN_WINDOW = "NO METRES IN THESE EIGHT WEEKS";

/** METRES PER WEEK (spec §5 item 3; §14 ruling 12): eight Monday-start
 *  bars ending at the range's last day, this week in `--ink` and labelled
 *  `THIS WK`, the rest in `--ink-4`; value labels on the current and the
 *  tallest bar only; weeks before the range's FROM as a dashed outline.
 *  No caption (rulings 18/19). Under two rows in range it says so. */
export default function WeekBarsGroup({
  bars,
  rowsInRange,
}: {
  bars: readonly WeekBar[];
  rowsInRange: number;
}) {
  return (
    <section className="stats-group" aria-labelledby="stats-mpw-h">
      <h2 id="stats-mpw-h" className="stats-group-title">
        METRES PER WEEK
      </h2>
      {rowsInRange < 2 ? (
        <p className="stats-caption">{TWO_ROWS_MAKE_A_CHART}</p>
      ) : bars.every((b) => b.meters <= 0) ? (
        <p className="stats-caption">{NOTHING_IN_WINDOW}</p>
      ) : (
        <div className="stats-card">
          <WeekBarsChart bars={bars} />
        </div>
      )}
    </section>
  );
}

export function WeekBarsChart({ bars }: { bars: readonly WeekBar[] }) {
  const values = bars.map((b) => b.meters);
  const peak = Math.max(...values);
  const { max, step } = niceMax(peak);
  const y = linearScale({ domain: [0, max], range: [PLOT_BOTTOM, PAD_T] });
  const grid = chooseTicks([0, max], max / step + 1);
  const slots = layoutBars(bars.length, PLOT_W, BAR_MAX);
  const tallest = values.indexOf(peak);
  const out = bars.flatMap((b, i) => (b.outOfRange ? [i] : []));
  const summary = weekBarsLabel(bars);
  return (
    <svg
      className="stats-chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={summary}
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
      {bars.map((b, i) => {
        const s = slots[i]!;
        const x = PAD_L + s.x;
        const week = fmtDate(b.weekStart);
        if (b.outOfRange) {
          return (
            <rect
              key={week}
              className="stats-bar-out"
              data-week={week}
              x={x}
              y={PAD_T}
              width={s.width}
              height={PLOT_BOTTOM - PAD_T}
            />
          );
        }
        const cls = b.current ? "stats-bar stats-bar-current" : "stats-bar";
        if (b.meters <= 0) {
          return (
            <line
              key={week}
              className={`${cls} stats-bar-zero`}
              data-week={week}
              x1={x}
              x2={x + s.width}
              y1={PLOT_BOTTOM}
              y2={PLOT_BOTTOM}
            />
          );
        }
        const top = y(b.meters);
        const tall = PLOT_BOTTOM - top >= 2 * CAP;
        return (
          <g key={week}>
            {tall ? (
              <path
                className={cls}
                data-week={week}
                d={`M${x} ${PLOT_BOTTOM} V${top + CAP} a${CAP} ${CAP} 0 0 1 ${CAP} -${CAP} h${s.width - 2 * CAP} a${CAP} ${CAP} 0 0 1 ${CAP} ${CAP} V${PLOT_BOTTOM} Z`}
              />
            ) : (
              <rect
                className={cls}
                data-week={week}
                x={x}
                y={top}
                width={s.width}
                height={PLOT_BOTTOM - top}
              />
            )}
            {(b.current || i === tallest) && (
              <text
                className="stats-bar-label"
                x={x + s.width / 2}
                y={top - 4}
                textAnchor="middle"
              >
                {fmtMeters(b.meters)}
              </text>
            )}
          </g>
        );
      })}
      {bars.map((b, i) =>
        i % 2 === 1 || i === bars.length - 1 ? (
          <text
            key={fmtDate(b.weekStart)}
            className="stats-tick"
            x={PAD_L + slots[i]!.centre}
            y={H - 5}
            textAnchor="middle"
          >
            {i === bars.length - 1 && b.current
              ? THIS_WEEK
              : fmtDayMonth(b.weekStart)}
          </text>
        ) : null,
      )}
      {/* The caption is centred across the dashed slots, so over a single one
          it spills into the tick gutter and the next bar. One dashed week is
          named by the chart's own accessible label instead. */}
      {out.length > 1 && (
        <text
          className="stats-tick"
          x={
            PAD_L +
            (slots[out[0]!]!.centre + slots[out[out.length - 1]!]!.centre) / 2
          }
          y={PAD_T + (PLOT_BOTTOM - PAD_T) / 2}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {OUT_OF_RANGE}
        </text>
      )}
    </svg>
  );
}
