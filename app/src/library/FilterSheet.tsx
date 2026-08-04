import { useEffect } from "react";
import type { WorkoutType } from "../../domain/types.js";
import {
  clearFilters,
  setLastDone,
  setSource,
  toggleDuration,
  togglePainLevel,
  toggleType,
  type DurationBucket,
  type Filters,
} from "./filters";

// Chip order per docs/design/README.md §Screens → "2. Library" (AN before O2
// — not alphabetical), carried over from the retired FilterChips.tsx.
const TYPE_CHIPS: { type: WorkoutType; label: string }[] = [
  { type: "AN", label: "AN" },
  { type: "O2", label: "O2" },
  { type: "AT", label: "AT" },
  { type: "TR", label: "TR" },
];

const DURATION_CHIPS: { bucket: DurationBucket; label: string }[] = [
  { bucket: "<30", label: "<30′" },
  { bucket: "30-45", label: "30–45′" },
  { bucket: "45-60", label: "45–60′" },
  { bucket: "60+", label: "60′+" },
];

const PAIN_LEVELS = [1, 2, 3, 4, 5];

// CSS custom property per workout type — never a raw hex (tokens.css). Kept
// local rather than shared with TypeBadge.tsx/Today.tsx/ClassificationCard.tsx's
// own identical maps: this repo's established per-file duplication
// convention (TypeBadge.tsx's own comment names the precedent).
const TYPE_COLOR_VAR: Record<WorkoutType, string> = {
  O2: "--type-o2",
  AT: "--type-at",
  AN: "--type-an",
  TR: "--type-tr",
};

function typeCellStyle(active: boolean, type: WorkoutType) {
  if (!active) return undefined;
  const v = `var(${TYPE_COLOR_VAR[type]})`;
  return { background: v, borderColor: v, color: "var(--on-color)" };
}

/**
 * The FILTER sheet (Task 4, ui-fix round — DESIGN.md's "Library, second
 * pass"): slides up over the list (not a route — Library.tsx never pushes
 * history for it), holding all five filter groups plus a live-counting L1
 * button. Operates entirely on a DRAFT copy of Filters that the caller owns
 * (`draft`/`onChangeDraft`) — nothing here writes to the list's actually-
 * applied filters directly. `onApply` commits the draft (Library.tsx's own
 * "Show N workouts" handler); `onDismiss` (backdrop tap) discards it.
 *
 * BACK-with-sheet-open decision (task-4-brief's own ask): this component has
 * no route and pushes no history entry, so leaving Library by ANY means
 * while it's open (a tab tap, a hardware/browser back navigation) unmounts
 * it the same way a backdrop tap would — the draft is simply never written
 * back to the committed `filters` state, identical to a cancel. The
 * mockup's own build notes only ever describe two ways out (backdrop tap,
 * the primary button); this extends that same "closes without applying"
 * behaviour to the one exit the mockup doesn't enumerate, rather than
 * inventing a history-trap (push-a-state-and-intercept-popstate) this
 * codebase has no other precedent for.
 */
export default function FilterSheet({
  draft,
  onChangeDraft,
  resultCount,
  onApply,
  onDismiss,
}: {
  draft: Filters;
  onChangeDraft: (next: Filters) => void;
  resultCount: number;
  onApply: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onDismiss]);

  return (
    <div className="filter-sheet-backdrop" onClick={onDismiss}>
      <div
        className="filter-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Filter"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="filter-sheet-header">
          <h2 className="filter-sheet-title">Filter</h2>
          <button
            type="button"
            className="filter-sheet-clear"
            onClick={() => onChangeDraft(clearFilters())}
          >
            CLEAR
          </button>
        </div>

        <div className="filter-sheet-group">
          <span className="filter-sheet-group-label">TYPE</span>
          <div className="filter-sheet-grid filter-sheet-grid-4">
            {TYPE_CHIPS.map(({ type, label }) => {
              const active = draft.type === type;
              return (
                <button
                  key={type}
                  type="button"
                  className="filter-sheet-cell"
                  aria-pressed={active}
                  style={typeCellStyle(active, type)}
                  onClick={() => onChangeDraft(toggleType(draft, type))}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="filter-sheet-group">
          <span className="filter-sheet-group-label">TIME</span>
          <div className="filter-sheet-grid filter-sheet-grid-4">
            {DURATION_CHIPS.map(({ bucket, label }) => (
              <button
                key={bucket}
                type="button"
                className="filter-sheet-cell"
                aria-pressed={draft.durations.includes(bucket)}
                onClick={() => onChangeDraft(toggleDuration(draft, bucket))}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-sheet-group">
          <span className="filter-sheet-group-label">PAIN</span>
          <div className="filter-sheet-grid filter-sheet-grid-5">
            {PAIN_LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                className="filter-sheet-cell"
                aria-pressed={draft.painLevels.includes(level)}
                onClick={() => onChangeDraft(togglePainLevel(draft, level))}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-sheet-row">
          <div className="filter-sheet-group filter-sheet-group-half">
            <span className="filter-sheet-group-label">LAST DONE</span>
            <div className="filter-sheet-grid filter-sheet-grid-2">
              <button
                type="button"
                className="filter-sheet-cell"
                aria-pressed={draft.lastDone === "under21"}
                onClick={() => onChangeDraft(setLastDone(draft, "under21"))}
              >
                &lt;21D
              </button>
              <button
                type="button"
                className="filter-sheet-cell"
                aria-pressed={draft.lastDone === "over21"}
                onClick={() => onChangeDraft(setLastDone(draft, "over21"))}
              >
                21D+
              </button>
            </div>
          </div>
          <div className="filter-sheet-group filter-sheet-group-half">
            <span className="filter-sheet-group-label">SOURCE</span>
            <div className="filter-sheet-grid filter-sheet-grid-2">
              <button
                type="button"
                className="filter-sheet-cell"
                aria-pressed={draft.source === "global"}
                onClick={() => onChangeDraft(setSource(draft, "global"))}
              >
                GLOBAL
              </button>
              <button
                type="button"
                className="filter-sheet-cell"
                aria-pressed={draft.source === "custom"}
                onClick={() => onChangeDraft(setSource(draft, "custom"))}
              >
                CUSTOM
              </button>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="button-l1"
          disabled={resultCount === 0}
          onClick={onApply}
        >
          {resultCount === 0
            ? "No workouts match"
            : `Show ${resultCount} workouts`}
        </button>
      </div>
    </div>
  );
}
