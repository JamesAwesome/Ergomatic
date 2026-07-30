import { useState } from "react";
import { Link } from "react-router-dom";
import {
  parsePaceRef,
  resolveSplit,
  toleranceRange,
} from "../../domain/pace.js";
import type { Baselines, PaceBase, PaceRef } from "../../domain/types.js";
import type { BuilderRow } from "./builderState";

type RowField = "dur" | "ref" | "spm" | "rest";

// Interim text rendering of a structured ref, for the free-text pace input
// below — `PaceRefInput` (a later task) replaces this input with a base
// chip + offset stepper that never needs to format/parse text at all.
function formatPaceRef(base: PaceBase, off: number): string {
  if (off === 0) return base;
  return `${base}${off > 0 ? "+" : ""}${off}`;
}

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
}) {
  const isWork = row.kind === "w";

  // Stable per-row ids (keyed off row.id, not `index`, which shifts as rows
  // are added/removed) so each field's aria-describedby points at exactly
  // its own error message rather than colliding with another row's.
  function errorId(field: RowField): string {
    return `row-${row.id}-${field}-error`;
  }

  // Interim free-text adapter over the structured refBase/refOff fields — a
  // later task replaces this whole input with a base chip + offset stepper
  // that writes refBase/refOff directly and never needs text at all. This
  // local draft, rather than a value derived straight from
  // `formatPaceRef(row.refBase, row.refOff)`, is what lets someone type
  // "6k-2" one character at a time: an in-progress "6k-" doesn't parse, so
  // it must NOT be clobbered back to the last committed value on every
  // keystroke the way a fully row-derived value would be.
  const [refDraft, setRefDraft] = useState(() =>
    formatPaceRef(row.refBase, row.refOff),
  );

  function handleRefChange(text: string) {
    setRefDraft(text);
    const parsed = parsePaceRef(text);
    if (parsed) onChange({ refBase: parsed.base, refOff: parsed.off });
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
              className="field-ref"
              aria-label={`Row ${index + 1} pace reference`}
              aria-invalid={Boolean(fieldError("ref"))}
              aria-describedby={fieldError("ref") ? errorId("ref") : undefined}
              placeholder="2k / 6k-2"
              value={refDraft}
              onChange={(e) => handleRefChange(e.target.value)}
            />
            <input
              className="field-spm"
              aria-label={`Row ${index + 1} stroke rate`}
              aria-invalid={Boolean(fieldError("spm"))}
              aria-describedby={fieldError("spm") ? errorId("spm") : undefined}
              placeholder="spm"
              value={row.spm}
              onChange={(e) => onChange({ spm: e.target.value })}
            />
            <input
              className="field-rest"
              aria-label={`Row ${index + 1} rest`}
              aria-invalid={Boolean(fieldError("rest"))}
              aria-describedby={
                fieldError("rest") ? errorId("rest") : undefined
              }
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
