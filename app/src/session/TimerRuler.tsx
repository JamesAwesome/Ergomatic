import { fmtDuration } from "../../domain/duration.js";

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

export default function TimerRuler({
  totalLeftSeconds,
  totalSeconds,
}: {
  totalLeftSeconds: number;
  totalSeconds: number;
}) {
  const pct = totalProgressPct(totalLeftSeconds, totalSeconds);
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
      </div>
      <div className="timer-ruler">
        {rulerLabels(totalSeconds).map((label, i) => (
          <div className="timer-ruler-tick" key={i}>
            <span className="timer-ruler-mark" />
            <span className="timer-ruler-label">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
