import { Link } from "react-router-dom";
import { resolveSplit, toleranceRange } from "../../domain/pace.js";
import { fmtDuration, fmtDurationSpoken } from "../../domain/duration.js";
import type { Baselines, PaceRef, Step } from "../../domain/types.js";

// "6k" / "6k-2" / "6k+3" — the same shorthand the builder's bulk-paste
// syntax accepts (domain/pace.ts's parsePaceRef), read back out.
function refLabel(ref: PaceRef): string {
  if (ref.off === 0) return ref.base;
  return `${ref.base}${ref.off > 0 ? "+" : ""}${ref.off}`;
}

// MINUS SIGN (U+2212) for negative, matching the tolerance range's EN DASH
// convention of using real typographic characters rather than ASCII "-".
function nudgeLabel(nudge: number): string | null {
  if (nudge === 0) return null;
  return nudge > 0 ? `nudged +${nudge}s` : `nudged −${-nudge}s`;
}

export default function StepRow({
  step,
  baselines,
  tolerance,
  nudge,
  onNudge,
}: {
  // WorkoutDetail renders the "reps" marker itself (a row above the block
  // it governs) and never hands one to StepRow, so the prop type excludes
  // it — that also lets TS narrow straight to the "w" fields below without
  // a dead branch.
  step: Exclude<Step, { k: "reps" }>;
  baselines: Baselines | null;
  tolerance: number;
  nudge: number;
  onNudge: (delta: number) => void;
}) {
  if (step.k === "wu") {
    return (
      <div className="step-row">
        <div className="step-row-main">
          <span className="step-row-label">Warm-up</span>
          <span
            className="step-row-duration"
            aria-label={fmtDurationSpoken(step.minutes)}
          >
            {fmtDuration(step.minutes)}
          </span>
        </div>
      </div>
    );
  }

  if (step.k === "r") {
    return (
      <div className="step-row">
        <div className="step-row-main">
          <span className="step-row-label">Rest</span>
          <span
            className="step-row-duration"
            aria-label={fmtDurationSpoken(step.minutes)}
          >
            {fmtDuration(step.minutes)}
          </span>
        </div>
      </div>
    );
  }

  if (step.k === "test") {
    return (
      <div className="step-row">
        <div className="step-row-main">
          <span className="step-row-label">{step.label}</span>
        </div>
      </div>
    );
  }

  // step.k === "w"
  const durationLabel =
    step.duration.kind === "time"
      ? fmtDuration(step.duration.minutes)
      : `${step.duration.meters} m`;
  const durationSpoken =
    step.duration.kind === "time"
      ? fmtDurationSpoken(step.duration.minutes)
      : `${step.duration.meters} meters`;
  const pace = refLabel(step.ref);
  const left = `${durationLabel} @ ${pace}`;
  // Composed left-hand label ("20:00 @ 6k+10") would otherwise announce as
  // digits ("twenty colon zero zero at six k plus ten") — build the
  // accessible name from the spoken duration plus the same pace text.
  const leftSpoken = `${durationSpoken} at ${pace}`;

  // Parallel visible/spoken sub-line parts — the rest duration is a
  // positional duration too ("2:30 rest" would otherwise announce as
  // digits), so it gets the same spoken-form treatment as the left label.
  const subParts: string[] = [];
  const subPartsSpoken: string[] = [];
  if (step.spm !== undefined) {
    subParts.push(`${step.spm} spm`);
    subPartsSpoken.push(`${step.spm} strokes per minute`);
  }
  if (step.restMinutes !== undefined) {
    subParts.push(`${fmtDuration(step.restMinutes)} rest`);
    subPartsSpoken.push(`${fmtDurationSpoken(step.restMinutes)} rest`);
  }
  const nudgeText = nudgeLabel(nudge);
  if (nudgeText) {
    subParts.push(nudgeText);
    subPartsSpoken.push(nudgeText);
  }

  return (
    <div className="step-row">
      <div className="step-row-main">
        <span className="step-row-label" aria-label={leftSpoken}>
          {left}
        </span>
        {baselines ? (
          <span className="step-row-range">
            {
              toleranceRange(
                resolveSplit(baselines, step.ref, nudge),
                tolerance,
              ).label
            }
          </span>
        ) : (
          <span className="step-row-no-target">
            <em>no target</em> <Link to="/you">Set baselines</Link>
          </span>
        )}
      </div>
      {subParts.length > 0 && (
        <p className="step-row-sub" aria-label={subPartsSpoken.join(", ")}>
          {subParts.join(" · ")}
        </p>
      )}
      {baselines && (
        <div className="step-row-nudges">
          <button
            type="button"
            className="nudge-btn"
            aria-label="Nudge faster"
            onClick={() => onNudge(-1)}
          >
            ▲
          </button>
          <button
            type="button"
            className="nudge-btn"
            aria-label="Nudge slower"
            onClick={() => onNudge(1)}
          >
            ▼
          </button>
        </div>
      )}
    </div>
  );
}
