import { Link } from "react-router-dom";
import {
  parsePaceRef,
  resolveSplit,
  toleranceRange,
} from "../../domain/pace.js";
import type { Baselines } from "../../domain/types.js";
import type { BuilderRow } from "./builderState";

type RowField = "dur" | "ref" | "spm" | "rest";

// Resolves a work row's live SPLIT cell. Baselines missing takes priority
// over an unparseable ref: per the handoff, "no target" means "you haven't
// set baselines yet," not "you haven't finished typing a valid pace ref" —
// those are different states with different fixes (go set baselines vs.
// keep typing), so an in-progress/invalid ref while baselines ARE set
// renders nothing rather than a misleading "no target" + link to /you.
function resolvedSplit(
  row: BuilderRow,
  baselines: Baselines | null,
  tolerance: number,
) {
  if (baselines === null) {
    return (
      <span className="step-row-no-target">
        <em>no target</em> <Link to="/you">Set baselines</Link>
      </span>
    );
  }
  const ref = parsePaceRef(row.ref);
  if (!ref) return null;
  // No nudge in the builder — nudging a target is a per-run timer concept
  // (WorkoutDetail), not something a not-yet-saved workout has yet.
  const resolved = resolveSplit(baselines, ref);
  return (
    <span className="step-row-range">
      {toleranceRange(resolved, tolerance).label}
    </span>
  );
}

export default function StepRowEditor({
  row,
  index,
  inSet,
  baselines,
  tolerance,
  fieldError,
  onChange,
  onToggleMarked,
  onRemove,
}: {
  row: BuilderRow;
  index: number;
  // Whether this row falls inside the repeated block — computed by the
  // parent from `setRowIds(form)`, NOT from `row.marked`. The domain
  // repeats everything positioned after the first marked row, so every row
  // from there on is "in the set" even if its own `marked` flag is false;
  // both the left-rule highlight and the SET toggle's filled state must
  // agree with that, or the row would visually contradict the totals the
  // same module computes.
  inSet: boolean;
  baselines: Baselines | null;
  tolerance: number;
  fieldError: (field: RowField) => string | undefined;
  onChange: (patch: Partial<BuilderRow>) => void;
  onToggleMarked: () => void;
  onRemove: () => void;
}) {
  const isWork = row.kind === "w";

  return (
    <div
      className={
        inSet ? "step-row-editor step-row-editor--marked" : "step-row-editor"
      }
    >
      <div className="step-row-editor-line1">
        <button
          type="button"
          className="set-toggle"
          aria-pressed={inSet}
          aria-label="Mark row for the repeat set"
          onClick={onToggleMarked}
        >
          ↻
        </button>
        <input
          className="field-dur"
          aria-label={`Row ${index + 1} duration`}
          placeholder={isWork ? "5' or 2500m" : "10'"}
          value={row.dur}
          onChange={(e) => onChange({ dur: e.target.value })}
        />
        {isWork && (
          <>
            <input
              className="field-ref"
              aria-label={`Row ${index + 1} pace reference`}
              placeholder="2k / 6k-2"
              value={row.ref}
              onChange={(e) => onChange({ ref: e.target.value })}
            />
            <input
              className="field-spm"
              aria-label={`Row ${index + 1} stroke rate`}
              placeholder="spm"
              value={row.spm}
              onChange={(e) => onChange({ spm: e.target.value })}
            />
            <input
              className="field-rest"
              aria-label={`Row ${index + 1} rest`}
              placeholder="rest"
              value={row.rest}
              onChange={(e) => onChange({ rest: e.target.value })}
            />
          </>
        )}
        <button
          type="button"
          className="row-delete"
          aria-label="Remove row"
          onClick={onRemove}
        >
          ×
        </button>
      </div>
      {fieldError("dur") && <p className="field-error">{fieldError("dur")}</p>}
      {isWork && fieldError("ref") && (
        <p className="field-error">{fieldError("ref")}</p>
      )}
      {isWork && fieldError("spm") && (
        <p className="field-error">{fieldError("spm")}</p>
      )}
      {isWork && fieldError("rest") && (
        <p className="field-error">{fieldError("rest")}</p>
      )}
      {isWork && (
        <p className="step-row-editor-split">
          {resolvedSplit(row, baselines, tolerance)}
        </p>
      )}
    </div>
  );
}
