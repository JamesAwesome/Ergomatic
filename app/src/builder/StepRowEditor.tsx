import { Link } from "react-router-dom";
import { resolveSplit, toleranceRange } from "../../domain/pace.js";
import type { Baselines, PaceRef } from "../../domain/types.js";
import type { BuilderRow } from "./builderState";
import DurationInput from "./DurationInput";
import PaceRefInput from "./PaceRefInput";
import SpmInput from "./SpmInput";

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
  baselines,
  tolerance,
  fieldError,
  onChange,
  onRemove,
  onClone,
  registerRef,
}: {
  row: BuilderRow;
  index: number;
  // Whether this row falls inside the derived repeat span — computed by the
  // parent from `spanStartIndex(form)`. Used for the left-rule highlight;
  // the repeat span itself is derived, not clicked (Phase 5D Task 2).
  inSet: boolean;
  baselines: Baselines | null;
  tolerance: number;
  fieldError: (field: RowField) => string | undefined;
  onChange: (patch: Partial<BuilderRow>) => void;
  onRemove: () => void;
  // Duplicates this row directly beneath itself — the SET cell's
  // replacement (Phase 5D Task 4; see docs/design/DEVIATIONS.md). The
  // parent owns `cloneRow` and the post-clone focus call (it needs the new
  // row's generated id, which this component never sees).
  onClone: () => void;
  // Lets the parent build a `row:<id>:<field>` → element map (the same keys
  // `toSteps` uses for its error object) so a failed Save can focus the
  // first invalid control even when it's scrolled off-screen. Optional
  // because a caller that doesn't need save-focus (there is none today, but
  // nothing here should require it) shouldn't have to wire a no-op.
  registerRef?: (field: RowField, el: HTMLElement | null) => void;
}) {
  const isWork = row.kind === "w";
  const rowLabel = `Row ${index + 1}`;

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
        {/* Same cell position the old bare "↻" SET-cell replacement used to
            occupy (Phase 5D Task 4) — now carries a visible text label too
            (fix wave: James could name the old SET cell no better than this
            unlabelled glyph, so the glyph alone can't be the fix). The
            glyph stays (established shorthand for "duplicate"), but "COPY"
            is real text content, not a placeholder or icon-only affordance. */}
        <button
          type="button"
          className="row-clone"
          aria-label={`Duplicate ${rowLabel}`}
          onClick={onClone}
        >
          <span aria-hidden="true">↻</span> COPY
        </button>
        {/* "DUR" is a static affix beside the value+unit control, same
            treatment as REST's own affix below — line1 used to distinguish
            duration from rest only by chip weight (fix wave). */}
        <div className="field-dur-group">
          <span className="row-affix">DUR</span>
          <DurationInput
            value={row.durValue}
            unit={row.durUnit}
            onChange={({ value, unit }) =>
              onChange({ durValue: value, durUnit: unit })
            }
            rowLabel={rowLabel}
            invalid={Boolean(fieldError("dur"))}
            errorId={fieldError("dur") ? errorId("dur") : undefined}
            registerRef={(el) => registerRef?.("dur", el)}
          />
        </div>
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
        // REST has no pace ref (see docs/design/DEVIATIONS.md), so it can
        // never be a distance the way DUR can — no unit toggle, just a
        // static "MIN" marking next to the field so it's never mistaken for
        // the unitless free text it used to be. Static, not a placeholder: a
        // placeholder vanishes the moment the rower types, which was the
        // exact complaint that started this phase (James couldn't tell what
        // the SET cell — or, here, the unit — meant). Moved off line1 onto
        // its own line (fix wave, Task 1): adding the "DUR"/"REST" affixes
        // that same complaint asked for didn't leave room for REST beside
        // DUR at the 390px mobile viewport this app targets, so REST gets a
        // line the same way SPM and the pace ref already do below.
        <div className="field-rest-group">
          <span className="row-affix">REST</span>
          <input
            ref={(el) => registerRef?.("rest", el)}
            className="field-rest"
            aria-label={`${rowLabel} rest`}
            aria-invalid={Boolean(fieldError("rest"))}
            aria-describedby={fieldError("rest") ? errorId("rest") : undefined}
            placeholder="opt"
            value={row.rest}
            onChange={(e) => onChange({ rest: e.target.value })}
          />
          <span className="field-rest-unit">MIN</span>
        </div>
      )}
      {isWork && (
        // SPM doesn't fit alongside clone/DUR/delete in line1 at the 390px
        // mobile viewport this app targets — the same reason PaceRefInput
        // got its own line below (see that control's own comment) — so it
        // gets one too, between line1 and the pace line. "SPM" is a static
        // affix beside the stepper (fix wave, Task 1) — the bare "− 20 +"
        // never said what it was stepping.
        <div className="step-row-editor-spm">
          <span className="row-affix">SPM</span>
          <SpmInput
            value={row.spm}
            onChange={(spm) => onChange({ spm })}
            rowLabel={rowLabel}
            invalid={Boolean(fieldError("spm"))}
            errorId={fieldError("spm") ? errorId("spm") : undefined}
            registerRef={(el) => registerRef?.("spm", el)}
          />
        </div>
      )}
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
            rowLabel={rowLabel}
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
