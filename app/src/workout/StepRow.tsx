import { Link } from "react-router-dom";
import { resolveSplit, toleranceRange } from "../../domain/pace.js";
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
  index,
  baselines,
  tolerance,
  nudge,
  onNudge,
}: {
  step: Step;
  index: number;
  baselines: Baselines | null;
  tolerance: number;
  nudge: number;
  onNudge: (delta: number) => void;
}) {
  if (step.k === "wu") {
    return (
      <div className="step-row" data-step-index={index}>
        <div className="step-row-main">
          <span className="step-row-label">Warm-up</span>
          <span className="step-row-duration">{step.minutes}′</span>
        </div>
      </div>
    );
  }

  if (step.k === "r") {
    return (
      <div className="step-row" data-step-index={index}>
        <div className="step-row-main">
          <span className="step-row-label">Rest</span>
          <span className="step-row-duration">{step.minutes}′</span>
        </div>
      </div>
    );
  }

  if (step.k === "test") {
    return (
      <div className="step-row" data-step-index={index}>
        <div className="step-row-main">
          <span className="step-row-label">{step.label}</span>
        </div>
      </div>
    );
  }

  if (step.k === "reps") {
    // liveSteps() strips the sole "reps" marker before this list is built
    // (domain/expand.ts); validate.ts rejects more than one per workout, so
    // this branch is unreachable at runtime — kept only to satisfy the
    // exhaustive union without a false-positive TS2339 on the "w" fields
    // below.
    return null;
  }

  // step.k === "w"
  const durationLabel =
    step.duration.kind === "time"
      ? `${step.duration.minutes}′`
      : `${step.duration.meters} m`;
  const left = `${durationLabel} @ ${refLabel(step.ref)}`;

  const subParts: string[] = [];
  if (step.spm !== undefined) subParts.push(`${step.spm} spm`);
  if (step.restMinutes !== undefined)
    subParts.push(`${step.restMinutes}′ rest`);
  const nudgeText = nudgeLabel(nudge);
  if (nudgeText) subParts.push(nudgeText);

  return (
    <div className="step-row" data-step-index={index}>
      <div className="step-row-main">
        <span className="step-row-label">{left}</span>
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
        <p className="step-row-sub">{subParts.join(" · ")}</p>
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
