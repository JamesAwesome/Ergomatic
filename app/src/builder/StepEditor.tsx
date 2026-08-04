import { Link } from "react-router-dom";
import {
  restSecondsFromRow,
  rowWithRestSeconds,
  REST_STEP_SECONDS,
  type BuilderRow,
  type RowField,
} from "./builderState";
import DurationInput from "./DurationInput";
import PaceRefInput from "./PaceRefInput";
import Stepper from "./Stepper";

// Mirrors the deleted SpmInput.tsx's own bounds/wake value (which in turn
// mirrored domain/validate.ts's `int(s.spm, 10, 60)` and James's rule for
// the wake value) — kept local rather than shared because SpmInput.tsx
// bundled its own free-text-plus-steppers UI, which the redesign's SPM row
// (a Stepper built directly into this file — typable again since Task 5,
// see below) no longer uses at all.
const SPM_MIN = 10;
const SPM_MAX = 60;
const SPM_WAKE = 20;

function parseSpm(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

// Returns `undefined` (not clamped to SPM_MIN) when `n` falls below the
// floor — a `−` press at the minimum must clear to FREE, not get stuck at
// 10 forever (the defect this function used to have: `Math.max(SPM_MIN, n)`
// floored instead of clearing, so once a step had spm it could never become
// free-rate again, in direct contradiction of the spec's own "SPM stays
// optional" line and the handoff's own "`−` below 17 goes to 0 = FREE").
function clampSpm(n: number): number | undefined {
  if (n < SPM_MIN) return undefined;
  return Math.min(SPM_MAX, n);
}

/** The expanded step editor (docs/design/builder-redesign/README.md §4b):
 *  seven rows — header, DUR, PACE, SPM, REST, TARGET, DONE — for a work
 *  step. `wu`/standalone `r` rows (James's recorded departure from the
 *  handoff, which models only work steps) get a minutes-only editor: just
 *  the header, DUR and DONE, since those rows have no pace ref, spm or rest
 *  concept of their own (see builderState.ts's stepSummary/stepSubSummary
 *  comments) and every seeded library workout plus anything bulk-imported
 *  can contain them.
 *
 *  Replaces StepRowEditor.tsx (deleted this task) — DUR reuses
 *  DurationInput and PACE reuses PaceRefInput wholesale (both already
 *  handle their own clamping/formatting correctly, including the ±60 pace
 *  offset bound this task's brief calls out as a recorded departure from
 *  the handoff's −15..+30); SPM and REST are built directly on the new
 *  shared `Stepper` control instead. The redesign first turned both into
 *  bare steppers with no typable field at all; Phase 5F (Task 5) gave the
 *  value cell back its typable input (with a "FREE"/"NONE" placeholder for
 *  the empty state, Task 9), so reaching a value or clearing one doesn't
 *  take several presses each way any more. */
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
  // Pre-computed resolved range (e.g. "2:11.0–2:13.0"), an effort word
  // ("ALL OUT"/"EASY"), or null when baselines are unknown — this component
  // does no pace math of its own, same convention as StepCard.tsx's own
  // splitLabel prop. Builder's splitLabelFor is the one place that branches
  // on row.refEffort: an effort target renders even when baselines are
  // unset (a word needs no resolution, unlike a split range), which is a
  // deliberate difference from a split row's null/"no target" case below —
  // not an oversight that a future baselines check should "fix".
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
    if (current === undefined) {
      onChange({ spm: String(SPM_WAKE) });
      return;
    }
    const next = clampSpm(current + delta);
    onChange({ spm: next === undefined ? "" : String(next) });
  }

  function stepRest(delta: number) {
    const current = restSecondsFromRow(row);
    const updated = rowWithRestSeconds(row, current + delta);
    onChange({ rest: updated.rest });
  }

  // The displayed value is the raw field, not "FREE"/fmtRestSeconds's "NONE"
  // (Task 5) — a field a user can type into can't also render a word while
  // holding "", so an empty field falls back to the Stepper's own
  // `placeholder` prop ("FREE"/"NONE", Task 9) instead: same reading, but
  // as a `::placeholder` the browser clears the instant a digit lands, and
  // one that never becomes the accessible name (`aria-label` already is
  // one). The muted styling below still keys off the same trimmed/zero
  // checks, so the empty state still reads visually distinct even before
  // any placeholder renders.
  const spmTrimmed = row.spm.trim();
  const restSeconds = restSecondsFromRow(row);

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
            effort={row.refEffort}
            rowLabel={rowLabel}
            invalid={Boolean(fieldError?.("ref"))}
            errorId={fieldError?.("ref") ? errorId("ref") : undefined}
            onChange={({ base, off, effort }) =>
              onChange({ refBase: base, refOff: off, refEffort: effort })
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
        <div className="step-editor-row">
          <span className="step-editor-row-label">SPM</span>
          <Stepper
            label={`${rowLabel} stroke rate`}
            value={row.spm}
            valueClassName={
              spmTrimmed === "" ? "stepper-value-muted" : undefined
            }
            placeholder="FREE"
            onDecrement={() => stepSpm(-1)}
            onIncrement={() => stepSpm(1)}
            onValueChange={(next) => onChange({ spm: next })}
            invalid={Boolean(fieldError?.("spm"))}
            errorId={fieldError?.("spm") ? errorId("spm") : undefined}
            registerRef={(el) => registerRef?.("spm", el)}
          />
        </div>
      )}
      {isWork && fieldError?.("spm") && (
        <p id={errorId("spm")} className="field-error">
          {fieldError("spm")}
        </p>
      )}

      {isWork && (
        <div className="step-editor-row">
          <span className="step-editor-row-label">REST</span>
          <Stepper
            label={`${rowLabel} rest`}
            value={row.rest}
            valueInput="clock"
            valueClassName={
              restSeconds === 0 ? "stepper-value-muted" : undefined
            }
            placeholder="NONE"
            onDecrement={() => stepRest(-REST_STEP_SECONDS)}
            onIncrement={() => stepRest(REST_STEP_SECONDS)}
            onValueChange={(next) => onChange({ rest: next })}
            invalid={Boolean(fieldError?.("rest"))}
            errorId={fieldError?.("rest") ? errorId("rest") : undefined}
            registerRef={(el) => registerRef?.("rest", el)}
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
