import { useRef } from "react";
import { CellGrid } from "../components/CellGrid";
import { SheetShell } from "../components/SheetShell";
import { DurationRange } from "../components/DurationRange";
import {
  RECENCY_BOUNDARY_DAYS,
  clearSheetFilters,
  setLastDone,
  setSource,
  setDurationRange,
  togglePainLevel,
  type Filters,
} from "./filters";

const PAIN_LEVELS = [1, 2, 3, 4, 5];

// The one h2 in this sheet — SheetShell points its own `aria-labelledby` at
// this id rather than taking the title text itself, so it stays completely
// unaware of what a caller's title even says.
const TITLE_ID = "filter-sheet-title";

// Fix round (M1, 2026-08-04 round, mirrored here Task 2 of the
// library-filter-unification round): the live-count caption's own id —
// SheetShell's primary button points its `aria-describedby` here, so a
// screen-reader user tabbing to (or announcing) "Apply Filter" also hears
// the count and the reason it's disabled at 0, which a disabled button's own
// unreachable focus state can no longer surface any other way now that the
// count left the button's accessible NAME. Copied verbatim from
// TodayFilterSheet.tsx's own COUNT_ID idiom (spec §3).
const COUNT_ID = "filter-sheet-count";

/**
 * The FILTER sheet (Task 4, ui-fix round — DESIGN.md's "Library, second
 * pass"): slides up over the list (not a route — Library.tsx never pushes
 * history for it), holding four filter groups (TIME, PAIN, LAST
 * DONE, SOURCE) plus a live-counting L1 button. Operates entirely on a DRAFT
 * copy of Filters that the caller owns (`draft`/`onChangeDraft`) — nothing
 * here writes to the list's actually-applied filters directly. `onApply`
 * commits the draft (Library.tsx's own handler); `onDismiss` (backdrop tap)
 * discards it.
 *
 * TYPE left this sheet entirely (library-filter-unification round, Task 1,
 * pulled forward from Task 2's own item so the branch kept compiling across
 * the task boundary — spec §2: "The TYPE group leaves `FilterSheet`
 * entirely"). Its chip row now lives above the list (Library.tsx, Task 2's
 * own work) — this sheet has no UI path to filter by type at all, by design.
 * Library's own convention for every group here is the same as
 * `durations`/`painLevels` — empty means no filter, and CLEAR ALL keeps
 * emptying to nothing (spec §1). DIFFICULTY left this sheet in Phase DE
 * PR 1 (the product has no difficulty any more).
 *
 * CLEAR vs. CLEAR ALL (fix round, whole-branch review finding B): this
 * sheet's own CLEAR button (`clearSheetFilters`) resets only the groups
 * rendered IN HERE — TIME/PAIN/LAST DONE/SOURCE — leaving
 * `draft.types` exactly as the rower left it. Before this fix CLEAR called
 * the whole-library `clearFilters()`, silently emptying `types` too even
 * though the sheet shows no TYPE control and gives no indication that
 * pressing CLEAR would touch it. `Library.tsx`'s own CLEAR ALL (the
 * token-row control, outside this component entirely) is unchanged — it
 * still calls `clearFilters()` and still empties everything, `types`
 * included; that is the one control whose whole job is "clear everything."
 *
 * The primary reads the constant **`Apply Filter`** (Today's own contract,
 * adopted verbatim, spec §3) rather than a live "Show N workouts" — the
 * count moved OUT of the button's accessible name into a caption above it
 * (`{n} WORKOUTS` / `1 WORKOUT` / `NO WORKOUTS MATCH`, singular- and zero-
 * aware), wired by `aria-describedby` so a screen-reader user still hears
 * why a disabled button is disabled. Library's own zero-match copy
 * ("NO WORKOUTS MATCH") deliberately diverges from Today's ("0 OPTIONS") —
 * the old "no workouts match" wording's helpfulness is worth keeping now
 * that the count moved, per the spec's own flagged divergence.
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
        label: "Apply Filter",
        disabled: resultCount === 0,
        onPress: onApply,
        describedBy: COUNT_ID,
      }}
    >
      <div className="filter-sheet-header">
        <h2 id={TITLE_ID} className="filter-sheet-title">
          Filter
        </h2>
        <button
          type="button"
          className="filter-sheet-clear"
          onClick={() => onChangeDraft(clearSheetFilters(draft))}
        >
          CLEAR
        </button>
      </div>

      {/* Phase SF PR2 (spec §3): TIME is a minutes range on one rail —
          the shared `DurationRange` control, identical on Today's sheet. */}
      <DurationRange
        label="TIME"
        value={draft.durationRange}
        onChange={(range) => onChangeDraft(setDurationRange(draft, range))}
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

      {/* Phase SF PR2 Gate 0 (James: variant B): SOURCE on its own full-width
          row so ERGOMATIC LIBRARY / MY WORKOUTS sit on one line; LAST DONE
          takes a full row too, the same width as every other pair. */}
      <CellGrid
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
        label="SOURCE"
        cells={[
          {
            value: "global",
            label: "ERGOMATIC LIBRARY",
            pressed: draft.source === "global",
          },
          {
            value: "custom",
            label: "MY WORKOUTS",
            pressed: draft.source === "custom",
          },
        ]}
        onToggle={(value) =>
          onChangeDraft(setSource(draft, value as "global" | "custom"))
        }
      />

      {/* The live match count, moved off the primary button's own copy
          (now the constant "Apply Filter") onto a small mono caption
          directly above it — the only remaining explanation of why the
          button disables at 0 (spec §3). Singular- and zero-aware; Library's
          own noun ("WORKOUTS"), not Today's ("OPTIONS"). */}
      <p id={COUNT_ID} className="library-filter-sheet-count">
        {resultCount === 0
          ? "NO WORKOUTS MATCH"
          : `${resultCount} WORKOUT${resultCount === 1 ? "" : "S"}`}
      </p>
    </SheetShell>
  );
}
