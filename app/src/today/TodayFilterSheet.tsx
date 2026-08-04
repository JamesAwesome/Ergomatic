import type { RefObject } from "react";
import type { Difficulty } from "../../domain/types.js";
import { CellGrid } from "../components/CellGrid";
import { SheetShell } from "../components/SheetShell";
import { DIFFICULTY_CHIPS } from "../components/difficultyChips";
import type { TodayOverrides } from "./todayOverrides";

/** The sheet's own scratch copy of the three fields it edits — a subset of
 *  `TodayOverrides`, not the whole record (swapType/date/planKey/doneN are
 *  none of this sheet's business). */
export type TodayFilterDraft = Pick<
  TodayOverrides,
  "difficulties" | "capMinutes" | "painLevels"
>;

// Today's own cap chips — TIME is a single-select (exactly one always
// active), unlike Library's own duration UNION. Kept as a local copy per
// this repo's established per-file duplication convention rather than
// importing todayFilterTokens.ts's identical label set (TYPE_COLOR_VAR's
// own comment names the precedent).
const CAP_CHIPS: { value: number | null; label: string }[] = [
  { value: 30, label: "≤30′" },
  { value: 45, label: "≤45′" },
  { value: 60, label: "≤60′" },
  { value: 90, label: "≤90′" },
  { value: null, label: "NO CAP" },
];

// PAIN's five cells, matching Library's own 1-5 union (FilterSheet.tsx's
// PAIN_LEVELS) — a local copy per the same duplication convention.
const PAIN_LEVELS: readonly number[] = [1, 2, 3, 4, 5];

// The one h2 in this sheet — SheetShell points its own `aria-labelledby`
// at this id, same pattern as Library's FilterSheet.tsx.
const TITLE_ID = "today-filter-sheet-title";

/**
 * Today's own FILTER sheet: slides up over the screen (Today.tsx never
 * pushes history for it — same BACK-with-sheet-open decision as Library's
 * FilterSheet.tsx, documented there). Operates entirely on a DRAFT copy of
 * `{difficulties, capMinutes, painLevels}` that the caller owns
 * (`draft`/`onChangeDraft`); nothing here writes to Today's actually-
 * applied `TodayOverrides` record directly. `onApply` commits the draft
 * (Today.tsx's own merge-and-save); `onDismiss` (backdrop tap, Escape, or
 * an unmount from any other exit) discards it.
 *
 * No TYPE group here — the type-swap chips stay on the plan line
 * (Today.tsx, untouched by this task): the swap picks the pool, the sheet
 * only narrows it.
 *
 * The dialog machinery (backdrop, `role="dialog"`, the focus trap/restore)
 * lives in SheetShell (extracted from Library's FilterSheet.tsx, Task 1 of
 * the 2026-08-04 round) — this component supplies only the three filter
 * groups and the `poolCount`-driven primary button, via SheetShell's
 * `children`/`primary` props. `opener` is the caller's own FILTER ⌄
 * button ref (unlike Library's FilterSheet, which captures
 * `document.activeElement` itself) — Today.tsx keeps that ref alive for
 * the lifetime of the button, so passing it through is simpler than
 * re-deriving "whatever had focus" here.
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
        label: `Show ${poolCount} option${poolCount === 1 ? "" : "s"}`,
        disabled: poolCount === 0,
        onPress: onApply,
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

      <CellGrid
        label="TIME"
        // Final fix wave (2026-08-04 round, M1): scoped to this group alone
        // via CellGrid's own `className` passthrough (already used by
        // Library's LAST DONE/SOURCE half-width pair) — "NO CAP" is the one
        // label in the whole app that doesn't fit a filter-sheet-cell's
        // equal-fifth share of the 390px sheet width (index.css's own
        // `.filter-sheet-group-time` rule). Library's 5-cell PAIN group
        // shares the same `filter-sheet-grid-5` class (cell-count-derived,
        // m8) but single digits never need it, so scoping to this group by
        // name — not by cell count — keeps Library's rendering byte-for-
        // byte unchanged.
        className="filter-sheet-group-time"
        cells={CAP_CHIPS.map(({ value, label }) => ({
          value: value === null ? "none" : String(value),
          label,
          pressed: draft.capMinutes === value,
        }))}
        onToggle={(value) =>
          onChangeDraft({
            ...draft,
            capMinutes: value === "none" ? null : Number(value),
          })
        }
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
    </SheetShell>
  );
}
