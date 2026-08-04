# Today's Collapsible Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Today's three inline filter groups collapse into the Library's
`FILTER ⌄` + sheet + tokens pattern, backed by Today's own unchanged
state.

**Architecture:** Task 1 extracts the reusable primitives (SheetShell /
CellGrid / TokenRow) out of the Library's sheet with the Library's
existing tests as the unmodified proof; Task 2 builds Today's sheet,
token builder, and screen rewiring on them; Task 3 closes out (e2e,
screenshots, DEVIATIONS). Zero storage changes — `todayOverrides` v2
stays byte-identical; zero suggest() changes.

**Spec:** `docs/superpowers/specs/2026-08-04-today-filter-sheet-design.md`.
**Every implementer reads `.claude/agent-briefing.md` first.** Visual
authority: the shipped Library sheet (6F) — same shell, same grids, same
token treatment; no new mockup exists for this round.

## Global Constraints (beyond the briefing)

- Worktree `.claude/worktrees/today-filter-sheet`, branch
  `today-filter-sheet`. `pnpm install` at the worktree root once (hooks).
  **COMMIT FIRST, MUTATE AFTER** — the literal sequence.
- **The extraction's gate:** the Library's existing `FilterSheet.test.tsx`
  and token/`Library.test.tsx` assertions pass UNMODIFIED after Task 1.
  Renaming imports inside the Library's own files is allowed; test files
  are not (if a test imports a moved symbol from a component file, keep a
  re-export so the test stays untouched — and say so).
- `todayOverrides`' shape, keying, and validation: UNTOUCHED. suggest():
  UNTOUCHED. The plan-line swap chips: UNTOUCHED.
- Copy: `FILTER ⌄` chip; `Show N options` / `Show 1 option` / disabled
  at 0; `CLEAR ALL` (accent label, 44px). Tokens: `EASY–MEDIUM` /
  `EASY, HARD` (ordered-range collapse), `≤45′` (cap; `NO CAP` when it
  deviates from a capped default), `PAIN 1–2` / `PAIN 1, 4` (the
  Library's rules verbatim). All ink-filled.
- "Active" = deviates from the day's pref-derived defaults
  (`difficulties` = all three, `capMinutes` = `snapCap(pref)`,
  `painLevels` = []). CLEAR ALL resets TO those defaults, never to
  empty — the divergence from the Library's CLEAR ALL gets a DEVIATIONS
  row.
- Sheet semantics (6F's): draft state, commit only via the L1 button,
  discard on backdrop/Escape/BACK/tab-tap, no history entry, focus
  trapped and restored to the opener.
- compose ONLY with `--project-directory` + absolute worktree paths +
  unique APP_VERSION curl-verified; fresh volume for full e2e; e2e ×2
  back-to-back; existing e2e keep their ASSERTIONS (selectors may move).

---

### Task 1: Extract the primitives; the Library re-seats without moving

**Files:** Create `app/src/components/SheetShell.tsx`,
`app/src/components/CellGrid.tsx`, `app/src/components/TokenRow.tsx`
(+ a test file per component); Modify `app/src/library/FilterSheet.tsx`
(re-compose onto the primitives), `app/src/library/Library.tsx` (token
row renders through TokenRow), `app/src/index.css` (move the sheet/
grid/token rules to component-named classes IF names must change —
prefer keeping the existing class names so CSS moves nowhere).

**Interfaces produced (Task 2 consumes verbatim):**

```tsx
// SheetShell — the dialog machinery, no filter knowledge
export function SheetShell(props: {
  open: boolean;
  titleId: string;            // aria-labelledby target rendered by children
  onDismiss: () => void;      // backdrop/Escape/BACK — draft-discard is the CALLER's job
  opener: React.RefObject<HTMLElement>; // focus restore target
  primary: { label: string; disabled: boolean; onPress: () => void };
  children: React.ReactNode;  // the group grids
}): JSX.Element | null;

// CellGrid — one labelled group of cells
export function CellGrid(props: {
  label: string;              // "PAIN"
  cells: { value: string; label: string; pressed: boolean }[];
  onToggle: (value: string) => void;  // single/multi is the CALLER's reducer
}): JSX.Element;

// TokenRow — the removable-token strip + optional trailing control
export interface Token { key: string; label: string; onClear: () => void;
  fill?: "ink" | string /* a CSS color var for type tokens */ }
export function TokenRow(props: { tokens: Token[];
  trailing?: React.ReactNode /* CLEAR ALL lives here */ }): JSX.Element | null;
```

Steps: move the shell/grid/token JSX+CSS hookups out of
`FilterSheet.tsx`/`Library.tsx` into the three components; re-compose
the Library onto them; run the FULL existing Library test files —
`FilterSheet.test.tsx`, `Library.test.tsx`, the library e2e — asserting
ZERO test-file diffs (`git diff --stat` must show no `*.test.*` /
`e2e/*` changes this task). Keep the focus-trap/restore logic INSIDE
SheetShell (it moves whole, its tests keep passing). No behaviour
change anywhere — this task's whole diff is structure.

Full gate (unit+client+integration, library+today e2e serial, full e2e
once). Commit: `refactor: the sheet's bones come out — shell, grid,
tokens`.

---

### Task 2: Today's sheet, tokens, and rewiring

**Files:** Create `app/src/today/TodayFilterSheet.tsx` (+test),
`app/src/today/todayFilterTokens.ts` (+test); Modify
`app/src/today/Today.tsx` (chips go; FILTER ⌄ + TokenRow + sheet
arrive), `app/src/today/Today.test.tsx`, `app/src/index.css` (only if a
Today-specific spacing rule is needed).

**Interfaces consumed:** Task 1's three components verbatim.
**Interfaces produced:**

```ts
// todayFilterTokens.ts (pure)
export interface TodayFilterDefaults {
  difficulties: Difficulty[];   // all three
  capMinutes: number | null;    // snapCap(prefs.timeCapMinutes)
}
export function todayFilterTokens(
  overrides: Pick<TodayOverrides, "difficulties" | "capMinutes" | "painLevels">,
  defaults: TodayFilterDefaults,
  onReset: (group: "difficulties" | "cap" | "pain") => void,
): Token[];  // one Token per DEVIATING group, ink fill, collapse rules per the spec
```

`TodayFilterSheet`: SheetShell + three CellGrids — DIFFICULTY (multi,
EASY/MEDIUM/HARD), TIME (single, ≤30′/≤45′/≤60′/≤90′/NO CAP — exactly
one pressed), PAIN (multi, 1–5). Draft `{difficulties, capMinutes,
painLevels}`; the primary label computes the pool live against the
draft: run the SAME suggest call Today already makes (todayCode incl.
swap, entries, pick) with prefs built from the DRAFT — label
`Show {poolIds.length} options` (singular-aware), disabled at 0. Apply
= save the merged overrides record + close; dismiss = drop the draft.

`Today.tsx`: delete the three inline chip groups + their group labels;
`FILTER ⌄` (chip geometry, `aria-expanded`, the sheet's opener ref)
joins `SHUFFLE ↻` on the suggestion header's right; TokenRow below the
header, `trailing` = CLEAR ALL (only when tokens exist), CLEAR ALL =
save `{...overrides, difficulties: defaults.difficulties, capMinutes:
defaults.capMinutes, painLevels: []}`. Token clears reset only their
group (via `onReset`). Everything else — swap chips, SHUFFLE, pick,
resume/unlogged rows, LAST THREE — untouched.

Client tests: chips absent / FILTER ⌄ present; sheet round trip (draft
edits don't touch the record until apply; dismiss drops); live count
matches the pool the card then shows (assert via the rendered reason/
title after apply); disabled at 0 (drive difficulties to none + a pain
level nothing matches); singular copy at 1; tokens only on deviation
(cap-at-default shows none); per-token clear; CLEAR ALL restores
defaults (difficulties all three, cap back to snapCap, pain empty) and
the record SAVED that way; focus restored to FILTER ⌄ on close;
overrides invalidation untouched (existing tests pass). 100% on
`todayFilterTokens.ts`.

Full gate. Commit: `feat: Today's filter folds away — same sheet, its
own state`.

---

### Task 3: Flows, captures, the record

**Files:** `app/e2e/today.spec.ts` (the three flows re-route through
the sheet; one new CLEAR-ALL assertion), `app/e2e/design.spec.ts`
(sweeps: Today's sheet axe open/closed, FILTER ⌄ + token 44px targets,
the ink-4 rule on any new small labels), `app/e2e/screenshots.spec.ts`
(`today.png` rest / `today-filtered.png` tokens / `today-sheet.png`
open), `docs/design/DEVIATIONS.md` (the CLEAR-ALL-resets-to-defaults
row + an end-to-end pass), `docs/design/README.md` (§1 Today: one
sentence pointing the filter description at the sheet pattern —
follow the prose-frozen convention marker from 6F), `ROADMAP.md` (this
round; next pointers unchanged: Phase 7 PM5).

e2e specifics: the neutralize + personal-fixture technique survives —
the filter taps move inside the sheet then apply (e.g. open → tap PAIN
1 + 2 → `Show N options` → the card is the fixture); flow 2's chip-
reset-after-log assertion becomes token-absence; the new assertion:
set two groups off-default → CLEAR ALL → tokens gone AND the card shows
the unfiltered pick again (NOT an empty pool — the distinction from the
Library's CLEAR). Sheet-dismiss-discards (backdrop) pinned in e2e once.
Screenshots captured, opened, described. Full e2e ×2 back-to-back,
fresh volume, isolated project. Commit: `test: the fold holds — flows,
captures, and the record`.

---

## Notes

- Tasks strictly sequential (1→2 share the components; 2→3 share
  Today.tsx and the specs).
- Task 1 is a REFACTOR with a structural no-op gate — if any Library
  test needs edits to pass, the extraction is wrong; go back, don't
  edit the test.
- The primary-button pool count reuses Today's existing suggest inputs;
  if the computation needs extraction from TodayView to be callable
  with a draft, extract a pure helper INSIDE Today.tsx (module scope)
  rather than lifting state.
- `snapCap` and `EMPTY`/default derivations already exist in
  `todayOverrides.ts` — consume, don't re-derive.
