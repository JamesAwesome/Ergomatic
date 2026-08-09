import { Link } from "react-router-dom";
import {
  effortSpoken,
  effortWord,
  isEffortRef,
  refLabel,
  resolveSplit,
} from "../../domain/pace.js";
import { fmtSplit } from "../../domain/format.js";
import { fmtDuration, fmtDurationSpoken } from "../../domain/duration.js";
import type { Baselines, Step } from "../../domain/types.js";

// MINUS SIGN (U+2212) for negative — a real typographic character rather
// than ASCII "-".
function nudgeLabel(nudge: number): string | null {
  if (nudge === 0) return null;
  return nudge > 0 ? `nudged +${nudge}s` : `nudged −${-nudge}s`;
}

export default function StepRow({
  step,
  baselines,
  nudge,
  onNudge,
}: {
  // WorkoutDetail renders the "reps" marker itself (a row above the block
  // it governs) and never hands one to StepRow, so the prop type excludes
  // it — that also lets TS narrow straight to the "w" fields below without
  // a dead branch.
  step: Exclude<Step, { k: "reps" }>;
  baselines: Baselines | null;
  nudge: number;
  onNudge: (delta: number) => void;
}) {
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
  //
  // An effort ref is the one exception: its VISIBLE chip word ("MAX"/"MIN")
  // still drives `left` above, but the chip word is ambiguous spoken aloud
  // ("MIN" reads identically to "minutes") — domain/pace.ts's
  // `effortSpoken` substitutes real effort language instead ("at max
  // effort" / "easy"), so the spoken and visible forms diverge here on
  // purpose.
  const leftSpoken = isEffortRef(step.ref)
    ? `${durationSpoken} ${effortSpoken(step.ref.effort)}`
    : `${durationSpoken} at ${pace}`;

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
        {isEffortRef(step.ref) ? (
          // An effort word needs no baseline to resolve — "ALL OUT"/"EASY"
          // is the target, not a computed split, so it renders even when
          // baselines are unset (unlike the split branch's no-target
          // fallback below).
          <span className="step-row-range">{effortWord(step.ref.effort)}</span>
        ) : baselines ? (
          // Ui-fix round, Item 1: the exact resolved split, not a
          // tolerance band — this display call site now shows only the
          // single number.
          <span className="step-row-range">
            {fmtSplit(resolveSplit(baselines, step.ref, nudge))}
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
      {baselines && !isEffortRef(step.ref) && (
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
