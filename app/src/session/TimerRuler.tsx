import { fmtDuration } from "../../domain/duration.js";
import type { IntervalBoundaries } from "./intervalBoundaries";

/** The total-progress bar's fill, 0-100 — the fraction of the WHOLE session
 *  (from phase 0, not the current phase) already elapsed. Guards a
 *  zero/negative denominator the same way `phaseProgressPct` (Timer.tsx)
 *  does, for the same reason: a workout built entirely from open-ended
 *  "test" steps prices to 0 total seconds. */
// eslint-disable-next-line react-refresh/only-export-components
export function totalProgressPct(
  totalLeftSeconds: number,
  totalSeconds: number,
): number {
  if (totalSeconds <= 0) return 0;
  return Math.min(
    100,
    Math.max(0, ((totalSeconds - totalLeftSeconds) / totalSeconds) * 100),
  );
}

/** The four ruler tick labels, handoff §6 verbatim: three fixed fractions
 *  plus the session's own total length in minutes with a prime mark
 *  (`Erg Log.dc.html`'s own `ruler` array — `¼`, `½`, `¾`, then
 *  `Math.round(totalSecs / 60) + '′'`). */
// eslint-disable-next-line react-refresh/only-export-components
export function rulerLabels(totalSeconds: number): string[] {
  return ["¼", "½", "¾", `${Math.round(totalSeconds / 60)}′`];
}

/** DENSITY (design spec §5): "at 390px landscape, more than ~16 boundaries
 *  puts notches under 24px apart and they read as texture, not structure."
 *  Above this the bar keeps the quarter ruler and the count stays textual —
 *  the grid pane is the honest place to read a 25-interval session. The
 *  arithmetic behind the number, against the tightest frame the bar is drawn
 *  in: landscape's content column is 390px wide at its widest, and 390 / 17
 *  spans = 22.9px per span, already under the 24px floor; 16 boundaries (17
 *  spans) is the last count that clears it at any realistic width. */
export const MAX_NOTCH_BOUNDARIES = 16;

/** The notch positions this bar will actually draw, as percentages of the
 *  session's own length — empty whenever the bar falls back to the ¼/½/¾
 *  ruler (no boundaries prop, a single-interval session, an unpriceable
 *  session with nothing to scale against, or too many boundaries to read).
 *
 *  Clamped at 100 rather than dropped: a re-anchored boundary CAN land past
 *  the end of an estimated session (the past is measured, the denominator
 *  is not), and `totalProgressPct` above already answers that overrun the
 *  same way — the bar is exhausted, and both the fill and the notch say so
 *  at its right edge. Dropping them instead would make the notch count
 *  disagree with the `N OF M` caption, which is the one thing §5 says the
 *  bar must never do. */
// eslint-disable-next-line react-refresh/only-export-components
export function notchPercents(
  boundaries: IntervalBoundaries | undefined,
  totalSeconds: number,
): number[] {
  if (boundaries === undefined || totalSeconds <= 0) return [];
  const { seconds } = boundaries;
  // The single-interval fallback needs no clause of its own: that session
  // HAS no interior boundary, so this maps an empty array to an empty one
  // and the quarter ruler renders for want of a notch to draw.
  if (seconds.length > MAX_NOTCH_BOUNDARIES) return [];
  return seconds.map((s) =>
    Math.min(100, Math.max(0, (s / totalSeconds) * 100)),
  );
}

export default function TimerRuler({
  totalLeftSeconds,
  totalSeconds,
  boundaries,
}: {
  totalLeftSeconds: number;
  totalSeconds: number;
  /** Where the intervals actually are (design spec §5). Absent — and the
   *  fallbacks `notchPercents` lists — leaves today's quarter ruler exactly
   *  as it was. ONE component serves both surfaces: the connected live pane
   *  and the unconnected phone timer pass the same shape, so neither can
   *  drift into its own bar. */
  boundaries?: IntervalBoundaries;
}) {
  const pct = totalProgressPct(totalLeftSeconds, totalSeconds);
  const notches = notchPercents(boundaries, totalSeconds);
  const predictedFrom = boundaries?.predictedFrom ?? null;
  return (
    <div className="timer-total">
      <div className="timer-total-head">
        <span className="timer-total-label">TOTAL LEFT</span>
        <span className="timer-total-value">
          {fmtDuration(totalLeftSeconds / 60)}
        </span>
      </div>
      <div className="timer-total-bar">
        <span style={{ width: `${pct}%` }} />
        {notches.map((at, i) => (
          <div
            key={i}
            className={
              // TWO TONES, ONE MONOCHROME RULE (§5: "1px `--ink` hairlines,
              // full bar height, monochrome"). A boundary the fill has
              // already passed cannot be drawn in ink on the connected
              // surface — that pane repaints the fill `--ink` too
              // (`index.css`'s `.connected-pane .timer-total-bar span`), so
              // an ink hairline over it measures 1.0:1 and the notches that
              // are FACTS are the ones that vanish. Behind the fill the
              // notch is therefore a hairline of the page instead: the same
              // 1px full-height mark, cut out of the fill rather than laid
              // on it, and still nothing but ink and paper. Ahead of the
              // fill it is the spec's ink line on the `--rule-2` track.
              at <= pct
                ? "timer-total-notch timer-total-notch-passed"
                : "timer-total-notch"
            }
            style={{ left: `${at}%` }}
            data-predicted={
              predictedFrom !== null && i >= predictedFrom ? "true" : undefined
            }
            aria-hidden="true"
          />
        ))}
      </div>
      {notches.length === 0 && (
        <div className="timer-ruler">
          {rulerLabels(totalSeconds).map((label, i) => (
            <div className="timer-ruler-tick" key={i}>
              <span className="timer-ruler-mark" />
              <span className="timer-ruler-label">{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
