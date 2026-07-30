import { Link } from "react-router-dom";
import {
  fmtRestSeconds,
  restSecondsFromRow,
  rowWithRestSeconds,
  REST_STEP_SECONDS,
  type BuilderRow,
} from "./builderState";
import DurationInput from "./DurationInput";
import PaceRefInput from "./PaceRefInput";
import Stepper from "./Stepper";

type RowField = "dur" | "ref" | "spm" | "rest";

// Mirrors SpmInput.tsx's own bounds/wake value (which in turn mirror
// domain/validate.ts's `int(s.spm, 10, 60)` and James's rule for the wake
// value) — kept local rather than imported because SpmInput.tsx bundles its
// own free-text-plus-steppers UI, which the redesign's SPM row (a bare
// Stepper, no typable field) no longer uses at all.
const SPM_MIN = 10;
const SPM_MAX = 60;
const SPM_WAKE = 20;

function parseSpm(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

function clampSpm(n: number): number {
  return Math.min(SPM_MAX, Math.max(SPM_MIN, n));
}

/** The expanded step editor (docs/design/builder-redesign/README.md §4b):
 *  seven rows — header, DUR, PACE, SPM, REST, TARGET, DONE — for a work
 *  step. `wu`/standalone `r` rows (James's recorded departure from the
 *  handoff, which models only work steps) get a minutes-only editor: just
 *  the header, DUR and DONE, since those rows have no pace ref, spm or rest
 *  concept of their own (see builderState.ts's stepSummary/stepSubSummary
 *  comments) and the 35 starter workouts plus anything bulk-imported can
 *  contain them.
 *
 *  Replaces StepRowEditor.tsx (deleted this task) — DUR reuses
 *  DurationInput and PACE reuses PaceRefInput wholesale (both already
 *  handle their own clamping/formatting correctly, including the ±60 pace
 *  offset bound this task's brief calls out as a recorded departure from
 *  the handoff's −15..+30); SPM and REST are built directly on the new
 *  shared `Stepper` control instead, since the redesign turns both into
 *  bare steppers with no typable field at all. */
export default function StepEditor({
  row,
  index,
  splitLabel,
  onChange,
  onDuplicate,
  onDelete,
  onDone,
  typeColorVar,
  fieldError,
  registerRef,
}: {
  row: BuilderRow;
  index: number;
  // Pre-computed resolved range (e.g. "2:11.0–2:13.0") or null when
  // baselines are unknown — this component does no pace math of its own,
  // same convention as StepCard.tsx's own splitLabel prop.
  splitLabel: string | null;
  onChange: (patch: Partial<BuilderRow>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDone: () => void;
  // The left marker's colour source (design doc §4: "left marker: the
  // current TYPE colour" for an expanded card) — optional, and unused when
  // omitted, mirroring StepCard.tsx's own typeColorVar prop so a future
  // assembly (Task 5) can hand the identical props object to whichever of
  // StepCard/StepEditor it renders for a given row.
  typeColorVar?: string;
  // Optional error wiring, same idiom as StepRowEditor's own fieldError —
  // preserved here so Builder's failed-Save focus-first-invalid-field
  // behaviour survives the swap from StepRowEditor to this component.
  fieldError?: (field: RowField) => string | undefined;
  registerRef?: (field: RowField, el: HTMLElement | null) => void;
}) {
  const isWork = row.kind === "w";
  const rowLabel = `Row ${index + 1}`;
  const stepLabel = `Step ${index + 1}`;

  function errorId(field: RowField): string {
    return `row-${row.id}-${field}-error`;
  }

  function stepSpm(delta: number) {
    const current = parseSpm(row.spm);
    const next = current === undefined ? SPM_WAKE : clampSpm(current + delta);
    onChange({ spm: String(next) });
  }

  function stepRest(delta: number) {
    const current = restSecondsFromRow(row);
    const updated = rowWithRestSeconds(row, current + delta);
    onChange({ rest: updated.rest });
  }

  const spmTrimmed = row.spm.trim();
  const spmValue = spmTrimmed === "" ? "FREE" : spmTrimmed;
  const restSeconds = restSecondsFromRow(row);
  const restValue = fmtRestSeconds(restSeconds);

  return (
    <div
      className="step-editor"
      style={
        typeColorVar ? { borderLeftColor: `var(${typeColorVar})` } : undefined
      }
    >
      <div className="step-editor-header">
        <span className="step-editor-header-label">
          {stepLabel.toUpperCase()}
        </span>
        <button
          type="button"
          className="step-editor-duplicate"
          aria-label={`Duplicate ${stepLabel}`}
          onClick={onDuplicate}
        >
          DUPLICATE
        </button>
        <button
          type="button"
          className="step-editor-delete"
          aria-label={`Delete ${stepLabel}`}
          onClick={onDelete}
        >
          ×
        </button>
      </div>

      <div className="step-editor-row">
        <span className="step-editor-row-label">DUR</span>
        <DurationInput
          value={row.durValue}
          unit={row.durUnit}
          onChange={({ value, unit }) =>
            onChange({ durValue: value, durUnit: unit })
          }
          rowLabel={rowLabel}
          invalid={Boolean(fieldError?.("dur"))}
          errorId={fieldError?.("dur") ? errorId("dur") : undefined}
          registerRef={(el) => registerRef?.("dur", el)}
        />
      </div>
      {fieldError?.("dur") && (
        <p id={errorId("dur")} className="field-error">
          {fieldError("dur")}
        </p>
      )}

      {isWork && (
        <div
          className="step-editor-row step-editor-pace"
          // PaceRefInput has no single focusable root of its own (a
          // radiogroup plus two bare buttons) — same trick StepRowEditor's
          // own `.step-row-editor-pace` wrapper used, so a failed Save can
          // still `.focus()` this row's pace control.
          tabIndex={-1}
          ref={(el) => registerRef?.("ref", el)}
        >
          <span className="step-editor-row-label">PACE</span>
          <PaceRefInput
            base={row.refBase}
            off={row.refOff}
            rowLabel={rowLabel}
            invalid={Boolean(fieldError?.("ref"))}
            errorId={fieldError?.("ref") ? errorId("ref") : undefined}
            onChange={({ base, off }) =>
              onChange({ refBase: base, refOff: off })
            }
          />
        </div>
      )}
      {isWork && fieldError?.("ref") && (
        <p id={errorId("ref")} className="field-error">
          {fieldError("ref")}
        </p>
      )}

      {isWork && (
        <div
          className="step-editor-row"
          tabIndex={-1}
          ref={(el) => registerRef?.("spm", el)}
          aria-invalid={Boolean(fieldError?.("spm"))}
          aria-describedby={fieldError?.("spm") ? errorId("spm") : undefined}
        >
          <span className="step-editor-row-label">SPM</span>
          <Stepper
            label={`${rowLabel} stroke rate`}
            value={spmValue}
            valueClassName={
              spmTrimmed === "" ? "stepper-value-muted" : undefined
            }
            onDecrement={() => stepSpm(-1)}
            onIncrement={() => stepSpm(1)}
          />
        </div>
      )}
      {isWork && fieldError?.("spm") && (
        <p id={errorId("spm")} className="field-error">
          {fieldError("spm")}
        </p>
      )}

      {isWork && (
        <div
          className="step-editor-row"
          tabIndex={-1}
          ref={(el) => registerRef?.("rest", el)}
          aria-invalid={Boolean(fieldError?.("rest"))}
          aria-describedby={fieldError?.("rest") ? errorId("rest") : undefined}
        >
          <span className="step-editor-row-label">REST</span>
          <Stepper
            label={`${rowLabel} rest`}
            value={restValue}
            valueClassName={
              restSeconds === 0 ? "stepper-value-muted" : undefined
            }
            onDecrement={() => stepRest(-REST_STEP_SECONDS)}
            onIncrement={() => stepRest(REST_STEP_SECONDS)}
          />
        </div>
      )}
      {isWork && fieldError?.("rest") && (
        <p id={errorId("rest")} className="field-error">
          {fieldError("rest")}
        </p>
      )}

      {isWork && (
        <div className="step-editor-target">
          <span className="step-editor-target-label">TARGET</span>
          {splitLabel !== null ? (
            // Ink, not accent — deliberately: this is resolved output, not
            // a selected state, and accent stays reserved for the unit/pace
            // toggles and Save (docs/design/builder-redesign/README.md §4b).
            <span className="step-editor-target-value">{splitLabel}</span>
          ) : (
            <span className="step-editor-target-value step-editor-no-target">
              <em>no target</em> <Link to="/you">Set baselines</Link>
            </span>
          )}
        </div>
      )}

      <button type="button" className="step-editor-done" onClick={onDone}>
        DONE
      </button>
    </div>
  );
}
