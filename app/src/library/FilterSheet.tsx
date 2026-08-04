import { useRef } from "react";
import type { WorkoutType } from "../../domain/types.js";
import type { DurationBucket } from "../../domain/duration.js";
import { CellGrid } from "../components/CellGrid";
import { SheetShell } from "../components/SheetShell";
import { DURATION_CHIPS } from "../components/durationChips";
import {
  RECENCY_BOUNDARY_DAYS,
  clearFilters,
  setLastDone,
  setSource,
  toggleDuration,
  togglePainLevel,
  toggleType,
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

// The one h2 in this sheet — SheetShell points its own `aria-labelledby` at
// this id rather than taking the title text itself, so it stays completely
// unaware of what a caller's title even says.
const TITLE_ID = "filter-sheet-title";

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
 *
 * The dialog machinery itself (backdrop, `role="dialog"`, the focus
 * trap/restore) lives in SheetShell now (extracted for Today's own
 * collapsible filter sheet, task-1 of the 2026-08-04 round) — this
 * component supplies only the five filter groups and the resultCount-driven
 * primary button, via SheetShell's `children`/`primary` props.
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
  // Captured at first render — before SheetShell's own mount effect can
  // move focus into the dialog — so this is "whatever had focus right
  // before the sheet opened," the same value the pre-extraction version
  // captured inside its own mount effect (nothing moves focus in between).
  const openerRef = useRef<HTMLElement | null>(
    document.activeElement as HTMLElement | null,
  );

  return (
    <SheetShell
      open
      titleId={TITLE_ID}
      onDismiss={onDismiss}
      opener={openerRef}
      primary={{
        label:
          resultCount === 0
            ? "No workouts match"
            : `Show ${resultCount} workout${resultCount === 1 ? "" : "s"}`,
        disabled: resultCount === 0,
        onPress: onApply,
      }}
    >
      <div className="filter-sheet-header">
        <h2 id={TITLE_ID} className="filter-sheet-title">
          Filter
        </h2>
        <button
          type="button"
          className="filter-sheet-clear"
          onClick={() => onChangeDraft(clearFilters())}
        >
          CLEAR
        </button>
      </div>

      <CellGrid
        label="TYPE"
        cells={TYPE_CHIPS.map(({ type, label }) => {
          const active = draft.type === type;
          return {
            value: type,
            label,
            pressed: active,
            style: typeCellStyle(active, type),
          };
        })}
        onToggle={(value) =>
          onChangeDraft(toggleType(draft, value as WorkoutType))
        }
      />

      <CellGrid
        label="TIME"
        cells={DURATION_CHIPS.map(({ bucket, label }) => ({
          value: bucket,
          label,
          pressed: draft.durations.includes(bucket),
        }))}
        onToggle={(value) =>
          onChangeDraft(toggleDuration(draft, value as DurationBucket))
        }
      />

      <CellGrid
        label="PAIN"
        cells={PAIN_LEVELS.map((level) => ({
          value: String(level),
          label: String(level),
          pressed: draft.painLevels.includes(level),
        }))}
        onToggle={(value) =>
          onChangeDraft(togglePainLevel(draft, Number(value)))
        }
      />

      <div className="filter-sheet-row">
        <CellGrid
          className="filter-sheet-group-half"
          label="LAST DONE"
          cells={[
            {
              value: "under21",
              label: `<${RECENCY_BOUNDARY_DAYS}D`,
              pressed: draft.lastDone === "under21",
            },
            {
              value: "over21",
              label: `${RECENCY_BOUNDARY_DAYS}D+`,
              pressed: draft.lastDone === "over21",
            },
          ]}
          onToggle={(value) =>
            onChangeDraft(setLastDone(draft, value as "under21" | "over21"))
          }
        />
        <CellGrid
          className="filter-sheet-group-half"
          label="SOURCE"
          cells={[
            {
              value: "global",
              label: "GLOBAL",
              pressed: draft.source === "global",
            },
            {
              value: "custom",
              label: "CUSTOM",
              pressed: draft.source === "custom",
            },
          ]}
          onToggle={(value) =>
            onChangeDraft(setSource(draft, value as "global" | "custom"))
          }
        />
      </div>
    </SheetShell>
  );
}
