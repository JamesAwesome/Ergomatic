import type { RefObject } from "react";
import type { Difficulty } from "../../domain/types.js";
import { RECENCY_BOUNDARY_DAYS } from "../../domain/recency.js";
import { CellGrid } from "../components/CellGrid";
import { SheetShell } from "../components/SheetShell";
import { DIFFICULTY_CHIPS } from "../components/difficultyChips";
import { DurationRange } from "../components/DurationRange";
import type { FilterSet } from "./todayFilters";

/** The sheet's own scratch copy of the five fields it edits — since Phase
 *  SF PR1 exactly one `FilterSet` (todayFilters.ts), the per-type memory's
 *  own unit; the day's swap record (swapType/date/planKey/doneN) is none
 *  of this sheet's business. */
export type TodayFilterDraft = FilterSet;

// PAIN's five cells, matching Library's own 1-5 union (FilterSheet.tsx's
// PAIN_LEVELS) — a local copy per the same duplication convention.
const PAIN_LEVELS: readonly number[] = [1, 2, 3, 4, 5];

// The one h2 in this sheet — SheetShell points its own `aria-labelledby`
// at this id, same pattern as Library's FilterSheet.tsx.
const TITLE_ID = "today-filter-sheet-title";

// Fix round (M1, 2026-08-04): the live-count caption's own id — SheetShell's
// primary button points its `aria-describedby` here, so a screen-reader
// user tabbing to (or announcing) "Apply Filter" also hears the count and
// the reason it's disabled at 0, which a disabled button's own unreachable
// focus state can no longer surface any other way now that the count left
// the button's accessible NAME (the Revision's own "Apply Filter" constant).
const COUNT_ID = "today-filter-sheet-count";

/**
 * Today's own FILTER sheet: slides up over the screen (Today.tsx never
 * pushes history for it — same BACK-with-sheet-open decision as Library's
 * FilterSheet.tsx, documented there). Operates entirely on a DRAFT copy of
 * `{difficulties, durations, painLevels, lastDone, source}` that the caller
 * owns (`draft`/`onChangeDraft`); nothing here writes to Today's actually-
 * applied `TodayOverrides` record directly. `onApply` commits the draft
 * (Today.tsx's own merge-and-save); `onDismiss` (backdrop tap, Escape, or
 * an unmount from any other exit) discards it.
 *
 * No TYPE group here — the type-swap chips stay on the plan line
 * (Today.tsx, untouched by this task): the swap picks the pool, the sheet
 * only narrows it.
 *
 * TIME (Phase SF PR2, spec §3): a minutes RANGE on one rail — the shared
 * `DurationRange` control (`src/components/DurationRange.tsx`), identical on
 * the Library's sheet. It replaced the four-bucket union of the 2026-08-04
 * Amendment, which itself replaced the original cap single-select
 * (`≤30′…NO CAP`); the `filter-sheet-group-time` CSS special-case died with
 * the latter. Every TIME group now renders the identical control the Library's own TIME
 * group already proved fits the 390px sheet width.
 *
 * LAST DONE/SOURCE (Round 2, 2026-08-04): the Library's own half-width pair
 * (FilterSheet.tsx's `filter-sheet-row`/`filter-sheet-group-half`), same
 * mutually-exclusive toggle-off semantics, added below PAIN.
 *
 * The dialog machinery (backdrop, `role="dialog"`, the focus trap/restore)
 * lives in SheetShell (extracted from Library's FilterSheet.tsx, Task 1 of
 * the 2026-08-04 round) — this component supplies the five filter groups,
 * the live-count caption, and the primary button, via SheetShell's
 * `children`/`primary` props. `opener` is the caller's own FILTER ⌄
 * button ref (unlike Library's FilterSheet, which captures
 * `document.activeElement` itself) — Today.tsx keeps that ref alive for
 * the lifetime of the button, so passing it through is simpler than
 * re-deriving "whatever had focus" here.
 *
 * Revision (mid-round, James): the primary button's copy settled on the
 * constant **`Apply Filter`** — no count, no singular/plural variant — after
 * the earlier `Show N options`/`Shuffle N options` drafts both named a
 * COUNT the button itself no longer carries. The count (and the ONLY
 * explanation of why the button is disabled at 0) moved to a small mono
 * caption directly above the button (`{poolCount} OPTION(S)`, singular-aware)
 * — the controller's own addition to preserve that honesty signal, flagged
 * for James at the gate rather than assumed. `disabled` and `onApply`'s
 * "narrows the pool; a still-matching pick stays, an excluded one moves to
 * the new pool's own top choice" behaviour are both unchanged — see
 * domain/suggest.ts's own `pickOverride ?? sorted[0]` for the mechanic this
 * relies on.
 */
export default function TodayFilterSheet({
  draft,
  onChangeDraft,
  poolCount,
  opener,
  onApply,
  onDismiss,
}: {
  draft: TodayFilterDraft;
  onChangeDraft: (next: TodayFilterDraft) => void;
  poolCount: number;
  opener: RefObject<HTMLElement | null>;
  onApply: () => void;
  onDismiss: () => void;
}) {
  return (
    <SheetShell
      open
      titleId={TITLE_ID}
      onDismiss={onDismiss}
      opener={opener}
      primary={{
        label: "Apply Filter",
        disabled: poolCount === 0,
        onPress: onApply,
        describedBy: COUNT_ID,
      }}
    >
      <div className="filter-sheet-header">
        <h2 id={TITLE_ID} className="filter-sheet-title">
          Filter
        </h2>
      </div>

      <CellGrid
        label="DIFFICULTY"
        cells={DIFFICULTY_CHIPS.map(({ value, label }) => ({
          value,
          label,
          pressed: draft.difficulties.includes(value),
        }))}
        onToggle={(value) => {
          const v = value as Difficulty;
          onChangeDraft({
            ...draft,
            difficulties: draft.difficulties.includes(v)
              ? draft.difficulties.filter((d) => d !== v)
              : [...draft.difficulties, v],
          });
        }}
      />

      {/* Phase SF PR2 (spec §3): TIME is a minutes range on one rail —
          the shared `DurationRange` control, identical on Library's
          sheet. */}
      <DurationRange
        label="TIME"
        value={draft.durationRange}
        onChange={(range) => onChangeDraft({ ...draft, durationRange: range })}
      />

      <CellGrid
        label="PAIN"
        cells={PAIN_LEVELS.map((level) => ({
          value: String(level),
          label: String(level),
          pressed: draft.painLevels.includes(level),
        }))}
        onToggle={(value) => {
          const level = Number(value);
          onChangeDraft({
            ...draft,
            painLevels: draft.painLevels.includes(level)
              ? draft.painLevels.filter((l) => l !== level)
              : [...draft.painLevels, level].sort((a, b) => a - b),
          });
        }}
      />

      {/* Round 2 (2026-08-04): the Library's own half-width LAST DONE/SOURCE
          pair (FilterSheet.tsx's exact layout — `filter-sheet-row` +
          `filter-sheet-group-half`), same mutually-exclusive toggle-off
          semantics (setting the already-active cell clears it). */}
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
        onToggle={(value) => {
          const v = value as "under21" | "over21";
          onChangeDraft({
            ...draft,
            lastDone: draft.lastDone === v ? null : v,
          });
        }}
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
        onToggle={(value) => {
          const v = value as "global" | "custom";
          onChangeDraft({ ...draft, source: draft.source === v ? null : v });
        }}
      />

      {/* Revision (mid-round): the live pool count, moved off the primary
          button's own copy (now the constant "Apply Filter") onto a small
          mono caption directly above it — the only remaining explanation of
          why the button disables at 0. Singular-aware, same idiom the
          button's own count used to carry. */}
      <p id={COUNT_ID} className="today-filter-sheet-count">
        {poolCount} OPTION{poolCount === 1 ? "" : "S"}
      </p>
    </SheetShell>
  );
}
