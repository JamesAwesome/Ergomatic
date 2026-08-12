import { useRef } from "react";
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
  type Filters,
} from "./filters";

const PAIN_LEVELS = [1, 2, 3, 4, 5];

// The one h2 in this sheet — SheetShell points its own `aria-labelledby` at
// this id rather than taking the title text itself, so it stays completely
// unaware of what a caller's title even says.
const TITLE_ID = "filter-sheet-title";

/**
 * The FILTER sheet (Task 4, ui-fix round — DESIGN.md's "Library, second
 * pass"): slides up over the list (not a route — Library.tsx never pushes
 * history for it), holding four filter groups plus a live-counting L1
 * button. Operates entirely on a DRAFT copy of Filters that the caller owns
 * (`draft`/`onChangeDraft`) — nothing here writes to the list's actually-
 * applied filters directly. `onApply` commits the draft (Library.tsx's own
 * "Show N workouts" handler); `onDismiss` (backdrop tap) discards it.
 *
 * TYPE left this sheet entirely (library-filter-unification round, Task 1,
 * pulled forward from Task 2's own item so the branch keeps compiling
 * across the task boundary — spec §2: "The TYPE group leaves `FilterSheet`
 * entirely"). Its chip row above the list, and DIFFICULTY joining this
 * sheet in TYPE's old slot, are Task 2's own work — until that lands, this
 * branch has no UI path to filter by type at all (the predicate in
 * `filters.ts` already supports it; nothing here surfaces it).
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
 * component supplies only the filter groups and the resultCount-driven
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
