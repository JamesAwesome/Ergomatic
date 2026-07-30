import { Link } from "react-router-dom";
import { resolveSplit, toleranceRange } from "../../domain/pace.js";
import type { Baselines, PaceRef } from "../../domain/types.js";
import type { BuilderRow } from "./builderState";
import PaceRefInput from "./PaceRefInput";

type RowField = "dur" | "ref" | "spm" | "rest";

// Resolves a work row's live SPLIT cell. `refBase`/`refOff` are always
// structurally valid (the builder can no longer represent an unparseable
// base like "8k"), so — unlike the old free-text `ref` field — there's no
// "in-progress/invalid ref" state to special-case here; only "baselines
// aren't set yet" needs the no-target treatment.
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
  const ref: PaceRef = { base: row.refBase, off: row.refOff };
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
  isBlockStart,
  baselines,
  tolerance,
  fieldError,
  onChange,
  onSetBlockStart,
  onRemove,
  registerRef,
}: {
  row: BuilderRow;
  index: number;
  // Whether this row falls inside the repeated block — computed by the
  // parent from `setRowIds(form)`, NOT from `row.marked`. The domain
  // repeats everything positioned after the first marked row, so every row
  // from there on is "in the set" even if its own `marked` flag is false;
  // both the left-rule highlight and the SET cell's filled state must
  // agree with that, or the row would visually contradict the totals the
  // same module computes.
  inSet: boolean;
  // Whether this row is specifically the block's current start (the first
  // marked row), not merely inside it — determines what clicking the SET
  // cell does (move/start the block vs. clear it) and what its accessible
  // name says, so it has to be more precise than `inSet`.
  isBlockStart: boolean;
  baselines: Baselines | null;
  tolerance: number;
  fieldError: (field: RowField) => string | undefined;
  onChange: (patch: Partial<BuilderRow>) => void;
  onSetBlockStart: () => void;
  onRemove: () => void;
  // Lets the parent build a `row:<id>:<field>` → element map (the same keys
  // `toSteps` uses for its error object) so a failed Save can focus the
  // first invalid control even when it's scrolled off-screen. Optional
  // because a caller that doesn't need save-focus (there is none today, but
  // nothing here should require it) shouldn't have to wire a no-op.
  registerRef?: (field: RowField, el: HTMLElement | null) => void;
}) {
  const isWork = row.kind === "w";

  // Stable per-row ids (keyed off row.id, not `index`, which shifts as rows
  // are added/removed) so each field's aria-describedby points at exactly
  // its own error message rather than colliding with another row's.
  function errorId(field: RowField): string {
    return `row-${row.id}-${field}-error`;
  }

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
          aria-label={
            isBlockStart ? "Clear the repeat set" : "Start the repeat set here"
          }
          onClick={onSetBlockStart}
        >
          ↻
        </button>
        <input
          ref={(el) => registerRef?.("dur", el)}
          className="field-dur"
          aria-label={`Row ${index + 1} duration`}
          aria-invalid={Boolean(fieldError("dur"))}
          aria-describedby={fieldError("dur") ? errorId("dur") : undefined}
          placeholder={isWork ? "5' or 2500m" : "10'"}
          value={row.dur}
          onChange={(e) => onChange({ dur: e.target.value })}
        />
        {isWork && (
          <>
            <input
              ref={(el) => registerRef?.("spm", el)}
              className="field-spm"
              aria-label={`Row ${index + 1} stroke rate`}
              aria-invalid={Boolean(fieldError("spm"))}
              aria-describedby={fieldError("spm") ? errorId("spm") : undefined}
              placeholder="spm"
              value={row.spm}
              onChange={(e) => onChange({ spm: e.target.value })}
            />
            <input
              ref={(el) => registerRef?.("rest", el)}
              className="field-rest"
              aria-label={`Row ${index + 1} rest`}
              aria-invalid={Boolean(fieldError("rest"))}
              aria-describedby={
                fieldError("rest") ? errorId("rest") : undefined
              }
              placeholder="opt"
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
      {isWork && (
        <div
          className="step-row-editor-pace"
          // Not natively focusable (a plain wrapper div) — tabIndex=-1 makes
          // it a valid `.focus()` target (out of tab order) so a failed Save
          // can land keyboard/screen-reader focus here when this row's pace
          // ref is the first invalid control, the same way it can land on a
          // plain <input> for dur/spm/rest.
          tabIndex={-1}
          ref={(el) => registerRef?.("ref", el)}
        >
          <PaceRefInput
            base={row.refBase}
            off={row.refOff}
            rowLabel={`Row ${index + 1}`}
            invalid={Boolean(fieldError("ref"))}
            errorId={fieldError("ref") ? errorId("ref") : undefined}
            onChange={({ base, off }) =>
              onChange({ refBase: base, refOff: off })
            }
          />
        </div>
      )}
      {fieldError("dur") && (
        <p id={errorId("dur")} className="field-error">
          {fieldError("dur")}
        </p>
      )}
      {isWork && fieldError("ref") && (
        <p id={errorId("ref")} className="field-error">
          {fieldError("ref")}
        </p>
      )}
      {isWork && fieldError("spm") && (
        <p id={errorId("spm")} className="field-error">
          {fieldError("spm")}
        </p>
      )}
      {isWork && fieldError("rest") && (
        <p id={errorId("rest")} className="field-error">
          {fieldError("rest")}
        </p>
      )}
      {isWork && (
        <p className="step-row-editor-split">
          {resolvedSplit(row, baselines, tolerance)}
        </p>
      )}
    </div>
  );
}
