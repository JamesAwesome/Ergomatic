import { useState } from "react";
import { stepSubSummary, stepSummary, type BuilderRow } from "./builderState";

/** The collapsed accordion card (design doc §4a, ~86px): a step's index,
 *  one-line summary, resolved split, and a sub-summary line with inline
 *  quick actions. Renders ONLY the collapsed state — the expanded editor is
 *  `StepEditor.tsx` (Task 3), a separate component the parent swaps in for
 *  whichever row is `editing`. */
export default function StepCard({
  index,
  row,
  splitLabel,
  typeColorVar: _typeColorVar,
  onExpand,
  onDuplicate,
  onDelete,
}: {
  index: number;
  row: BuilderRow;
  // Pre-computed resolved range (e.g. "2:11.0–2:13.0") or null when
  // baselines are unknown — this card does no pace math of its own.
  splitLabel: string | null;
  // The left marker's colour source for the EXPANDED state (StepEditor.tsx,
  // Task 3) — the collapsed marker here is always --rule-2 (design doc
  // §4a), so this component never reads it. Kept in the prop signature
  // anyway so a parent (Task 5's assembly) can hand the identical props
  // object to whichever of StepCard/StepEditor it renders for a given row,
  // without reshaping it per component.
  typeColorVar: string;
  onExpand: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  // James's departure from the handoff (recorded in the task brief): the
  // handoff's × deletes immediately. The × sits 44px from the duplicate
  // cell in a joined control, on a phone, mid-authoring — a mis-tap must
  // not silently destroy a configured step, so it swaps the action group
  // for an inline confirm instead.
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const stepLabel = `Step ${index + 1}`;
  const summary = stepSummary(row);
  const subSummary = stepSubSummary(row);

  function handleDeletePress() {
    setConfirmingDelete(true);
  }

  function handleConfirmDelete() {
    // Reset before calling onDelete rather than after: onDelete normally
    // removes this row from the parent's list (unmounting this component),
    // but nothing here should rely on that — a caller that doesn't remove
    // the row (defensive, no real caller does this today) must not leave a
    // stale confirm showing.
    setConfirmingDelete(false);
    onDelete();
  }

  function handleCancelDelete() {
    setConfirmingDelete(false);
  }

  return (
    <div className="step-card">
      <button type="button" className="step-card-line1" onClick={onExpand}>
        <span className="step-card-index">{index + 1}</span>
        <span className="step-card-summary">{summary}</span>
        {splitLabel !== null && (
          <span className="step-card-split">{splitLabel}</span>
        )}
      </button>
      <div className="step-card-line2">
        <button type="button" className="step-card-sub" onClick={onExpand}>
          {subSummary}
        </button>
        {confirmingDelete ? (
          <div
            className="step-card-confirm"
            role="group"
            aria-label={`Delete ${stepLabel}: confirm`}
          >
            <span className="step-card-confirm-label">DELETE?</span>
            {/* aria-label includes the visible "Yes"/"No" text (WCAG 2.5.3
                Label in Name) — a voice-control user saying "click yes"
                must still hit this control, not just one that says
                "confirm delete". */}
            <button
              type="button"
              className="step-card-confirm-btn step-card-confirm-yes"
              aria-label={`Yes, confirm delete ${stepLabel}`}
              onClick={handleConfirmDelete}
            >
              YES
            </button>
            <button
              type="button"
              className="step-card-confirm-btn step-card-confirm-no"
              aria-label={`No, cancel delete ${stepLabel}`}
              onClick={handleCancelDelete}
            >
              NO
            </button>
          </div>
        ) : (
          <div className="step-card-actions">
            <button
              type="button"
              className="step-card-action step-card-edit"
              onClick={onExpand}
            >
              EDIT
            </button>
            <button
              type="button"
              className="step-card-action step-card-duplicate"
              aria-label={`Duplicate ${stepLabel}`}
              onClick={onDuplicate}
            >
              <span aria-hidden="true">⧉</span>
            </button>
            <button
              type="button"
              className="step-card-action step-card-delete"
              aria-label={`Delete ${stepLabel}`}
              onClick={handleDeletePress}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
