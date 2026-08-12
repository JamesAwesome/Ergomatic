# Library Filter Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Library gains difficulty filtering, moves TYPE to a multi-select chip row above the sheet, and adopts Today's `Apply Filter` + caption contract — per the approved spec.

**Architecture:** Three layers, three tasks. (1) The `Filters` shape + its pure consumers (`filters.ts`, `filterTokens.ts`, `libraryFilters.ts`) including the token-fill seam fix. (2) The screens: three CSS rules extracted to shared names, Today's JSX renamed onto them, Library's chip row + descriptor + sheet changes. (3) e2e, screenshots, DEVIATIONS.

**SCOPE AMENDMENT (controller, 2026-08-11, after Task 1 reported BLOCKED):**
the original split was impossible as written — recurring-failure #10's own
example, a type change forcing compilation coupling. Removing `Filters.type`
breaks `FilterSheet.tsx` at compile time, and the smallest compiling patch
would have silently shipped Task 2's multi-select behavior. **Task 1 therefore
also removes the TYPE group from `FilterSheet.tsx`** (spec'd behavior: "the
TYPE group leaves `FilterSheet` entirely"), replaces that file's single-select
TYPE tests with the dialog-has-no-type-cells assertion (Task 2's contract item
4, pulled forward with the code it guards), and updates `Library.test.tsx`'s
old-shape fixtures. Task 2 keeps the chip row, the CSS extraction, the
descriptor, `Apply Filter` + caption, and the `toRowTokens` fill passthrough.
Between the two commits the branch has NO type filtering at all; that
intermediate is accepted, and no test may pretend otherwise.

**Spec:** `docs/superpowers/specs/2026-08-11-library-filter-unification-design.md` (James approved 2026-08-11). Its antagonistic-pass report (`.superpowers/sdd/library-filters-spec-review.md`) is the authoritative test inventory — READ IT, it lists sites the spec summarizes.

## Global Constraints

- Worktree `.claude/worktrees/library-filters`, branch `library-filters`. `git rev-parse --show-toplevel` before every commit.
- No em dashes in user-facing strings. `·` U+00B7 joins multi-value token labels; `–` U+2013 stays in the existing pain range idiom.
- Copy is EXACTLY: `Apply Filter` (constant), `{n} WORKOUTS` / `1 WORKOUT`, `NO WORKOUTS MATCH` at zero.
- Every behavioral test self-mutates. `pnpm test`, never bare vitest.
- Contrast values are already verified (chip label 6.69:1, descriptor 9.74:1, active chip 6.67:1); re-state them in reports, do not re-derive by eye.
- Today's BEHAVIOR and pixels do not change — only three class names move under it, and its existing assertions must prove that.

---

### Task 1: the Filters shape, its pure consumers, and the fill seam

**Files:**
- Modify: `app/src/library/filters.ts`, `app/src/library/filterTokens.ts`, `app/src/library/libraryFilters.ts`
- Create: `app/src/components/difficultyTokenLabel.ts` (lift `collapseDifficulties`)
- Modify: `app/src/today/todayFilterTokens.ts` (import the lifted helper instead of defining it)
- Test: `filters.test.ts`, `filterTokens.test.ts`, `libraryFilters.test.ts` (+ `todayFilterTokens.test.ts` must stay green untouched — the lift is behavior-preserving)

**Interfaces (Tasks 2-3 consume exactly these):**

```ts
export interface Filters {
  types: WorkoutType[];        // was `type: WorkoutType | null`
  difficulties: Difficulty[];  // new
  durations: DurationBucket[];
  painLevels: number[];
  lastDone: "under21" | "over21" | null;
  source: "global" | "custom" | null;
}
export interface Token {
  kind: TokenKind;             // gains "difficulty"
  label: string;
  fill?: string;               // NEW: the token's own colour var, or undefined
  clear(f: Filters): Filters;
}
```

- [ ] **Step 1: failing tests.**

`filters.test.ts` additions (read the file's existing fixture idiom first — it uses real `LIBRARY_WORKOUTS`):

```typescript
it("difficulties: empty means no filter; a selection excludes the rest", () => {
  const all = applyFilters(WORKOUTS, { ...EMPTY_FILTERS }, BASELINES);
  expect(applyFilters(WORKOUTS, { ...EMPTY_FILTERS, difficulties: [] }, BASELINES)).toHaveLength(all.length);
  const easy = applyFilters(WORKOUTS, { ...EMPTY_FILTERS, difficulties: ["easy"] }, BASELINES);
  expect(easy.length).toBeGreaterThan(0);
  expect(easy.every((w) => w.difficulty === "easy")).toBe(true);
  const easyMed = applyFilters(WORKOUTS, { ...EMPTY_FILTERS, difficulties: ["easy", "medium"] }, BASELINES);
  expect(easyMed.length).toBeGreaterThan(easy.length);
  expect(easyMed.every((w) => w.difficulty !== "hard")).toBe(true);
});

it("types: empty means all; a two-type selection is their union", () => {
  const o2 = applyFilters(WORKOUTS, { ...EMPTY_FILTERS, types: ["O2"] }, BASELINES);
  const at = applyFilters(WORKOUTS, { ...EMPTY_FILTERS, types: ["AT"] }, BASELINES);
  const both = applyFilters(WORKOUTS, { ...EMPTY_FILTERS, types: ["O2", "AT"] }, BASELINES);
  expect(both).toHaveLength(o2.length + at.length);
  expect(both.every((w) => w.type === "O2" || w.type === "AT")).toBe(true);
});

it("composes: difficulty AND type AND pain narrow together against the real library", () => {
  // build from LIBRARY_WORKOUTS; assert the result is the intersection and
  // non-empty (pick values that co-occur — verify against the seeds, do not
  // guess).
});
```

`filterTokens.test.ts`: a difficulty token (label via the lifted `collapseDifficulties`, `clear` empties only that field); a one-type token (`label: "O2"`, `fill: "var(--type-o2)"`); a two-type token (`label: "O2 · AT"`, `fill: undefined` — the `--ink` default); the row ORDER array updated to TYPE → DIFFICULTY → TIME → PAIN → LAST DONE → SOURCE.

`libraryFilters.test.ts`: an OLD-shape stored record (`{type: "O2", durations: [], ...}`, no `difficulties`) loads as `EMPTY_FILTERS`; a NEW-shape record round-trips; a record with `types` present but not an array is rejected.

- [ ] **Step 2: run, verify failures** (`pnpm test --project unit --project client`; `filters.ts` is under `src/`, so its tests are in the client project — check which project the existing files run in and use that).

- [ ] **Step 3: implement.**
- `filters.ts`: the two field changes; `EMPTY_FILTERS` updated; `applyFilters` gains the difficulty clause and swaps the type clause to `types.length > 0 && !types.includes(w.type)`; `clearFilters` unchanged in spirit (returns `EMPTY_FILTERS`).
- `filterTokens.ts`: `"difficulty"` kind; the type token becomes plural (`f.types.length > 0`), label `f.types.join(" · ")` **in the repo's O2·AT·TR·AN order, not selection order** (sort by the canonical order before joining), `fill` set to that type's var only when `f.types.length === 1`; every other token sets no `fill`. Update the module's own doc comment — it currently states "for a type token, `label` IS the WorkoutType code itself, so a renderer never needs a second field", which this change makes FALSE (that comment is exactly what licensed the label-lookup bug).
- `libraryFilters.ts`: validator checks both new fields (`Array.isArray(f.types)` and every member a WorkoutType; same for difficulties).
- Lift `collapseDifficulties` to `src/components/difficultyTokenLabel.ts` (mirroring `durationTokenLabel.ts`'s existing precedent) and import it in both token modules.

- [ ] **Step 4: green**, including `todayFilterTokens.test.ts` untouched.
- [ ] **Step 5: self-mutations** (minimum): drop the `types.length === 1` condition so every type token gets a fill → the two-type fill test fails; make the difficulty predicate ignore empty (always filter) → the empty-is-no-filter test fails; loosen the validator's `types` check → the old-shape reset test fails; return selection order instead of canonical order in the label → the two-type label test fails.
- [ ] **Step 6: gates + commit** (`feat: Library filters gain difficulty and multi-type, tokens carry their own fill`).

---

### Task 2: the screens

**Files:**
- Modify: `app/src/index.css` (extract three rules), `app/src/today/Today.tsx` (class renames ONLY), `app/src/library/Library.tsx` (chip row, descriptor, `toRowTokens`, trigger class), `app/src/library/FilterSheet.tsx` (DIFFICULTY in, TYPE out, `Apply Filter` + caption)
- Test: `Library.test.tsx`, `FilterSheet.test.tsx`, `Today.test.tsx` (only if a renamed class is asserted — grep first)

**Behavior contract (binding):**
1. **Extracted CSS**: the 4-column grid rule (today's `.today-type-chips`), the descriptor row rule (`.today-type-word-row`), and the FILTER trigger's chip look (`.today-shuffle`) become screen-neutral classes (`.type-chip-grid`, `.type-word-row`, `.filter-trigger`). Today's JSX uses the new names; Library's uses the same. **Grep `today-type-chips`, `today-type-word-row`, `today-shuffle`, and `library-filter-toggle` across `src/` AND `e2e/` first** — every hit is a deliberate update, listed in the report. Today's rendered pixels must not change.
2. **Library's chip row** sits above the token row: `.chip-wrap.type-chip-grid` of four `<button className="chip" aria-pressed={selected}>` in O2·AT·TR·AN order, each filled with its own `--type-*` when selected (the same treatment Today's chips use). Tapping toggles that type in `filters.types` and persists immediately (the existing `saveLibraryFilters` effect covers it).
3. **The descriptor row** renders beneath the chips only when `filters.types.length === 1`, aria-hidden, showing `TYPE_WORDS[type]`. Zero or several: no element at all.
4. **The sheet**: DIFFICULTY first (shared `DIFFICULTY_CHIPS` + `CellGrid`, multi-select), then TIME, PAIN, LAST DONE/SOURCE. No TYPE group. Its draft state carries `difficulties` and no longer carries `type`.
5. **The primary**: constant `Apply Filter`, disabled when the draft matches zero; a caption above it, wired by `aria-describedby`, reading `{n} WORKOUTS` / `1 WORKOUT` / `NO WORKOUTS MATCH`. Copy the wiring shape from `TodayFilterSheet.tsx` (its `COUNT_ID` idiom).
6. **`toRowTokens`** stops deriving fill from the label: it passes `token.fill` straight through. Delete `TYPE_COLOR_VAR` from `Library.tsx` if nothing else uses it (grep — recurring-failure #5's cousin).

- [ ] **Step 1: failing client tests** for the contract: difficulty group filters the list; TYPE is absent from the sheet (`getByRole("dialog")` has no O2 button); the chip row toggles multi and narrows the list to a union; the descriptor appears at one selection, absent at zero and two; the primary reads `Apply Filter` at every count and is disabled at zero; the caption text at 3 / 1 / 0 matches and is referenced by `aria-describedby`; a two-type token renders WITHOUT a type fill. Realistic fixtures throughout (the file already uses real seeds).
- [ ] **Step 2: red. Step 3: implement. Step 4: green** (unit + client, whole projects — the shape change reaches further than the files you edited).
- [ ] **Step 5: self-mutations** (minimum): render the descriptor unconditionally → the zero/two tests fail; leave the count inside the button's name → the caption/aria test fails; keep TYPE in the sheet → the absence test fails.
- [ ] **Step 6: gates** — lint, typecheck, format:check, `pnpm test --project unit --project client`, and `pnpm e2e` (it WILL be red until Task 3 updates the specs; run it anyway and report exactly which tests fail so Task 3 inherits a known list, not a surprise).
- [ ] **Step 7: commit** (`feat: Library's type chips leave the sheet; difficulty joins it; one Apply`).

---

### Task 3: e2e, screenshots, DEVIATIONS

**Files:**
- Modify: `app/e2e/library.spec.ts` (incl. `:68-105` wholesale — it drives TYPE through the sheet), `app/e2e/design.spec.ts` (the dialog-O2 locators at 413-417/438-442 and the `Show N workouts` sites at 417/442/459), `app/e2e/screenshots.spec.ts` (539/549), `docs/design/DEVIATIONS.md`, `docs/screenshots/*.png`

- [ ] **Step 1: update every pinned site** from the review report's inventory. For each: does the assertion still test its original point in the new UI, or has the UI made it meaningless? Rewrite deliberately; a test whose purpose is gone gets its purpose MOVED, not deleted (say where in the report).
- [ ] **Step 2: new e2e** — pick two types from the chip row, open the sheet, apply a difficulty, assert the list is the correct union-and-intersection against real seeded data; assert `Apply Filter` is the primary's name; BACK from a workout and confirm both the chips and the sheet filter survive (extending the existing persistence lock).
- [ ] **Step 3: full `pnpm e2e`** green in this worktree's own stack. If a result looks impossible, verify bundle identity per the briefing (and remember `--no-cache` if the served bundle lags your source).
- [ ] **Step 4: screenshots** — recapture `library.png`, `library-sheet.png`, `library-filtered.png`; OPEN each and describe it (the chip row visible with a selection, the descriptor, the sheet's DIFFICULTY group, the `Apply Filter` primary + caption). Revert byte-noise on unrelated captures.
- [ ] **Step 5: DEVIATIONS** — reconcile in place every row describing Library's sheet groups, its `Show N workouts` primary, its count vocabulary, and its zero-match disable; bottom-append ONE new row for the chips-outside-the-sheet decision (with the multi-select and descriptor rulings). The file documents CURRENT STATE, not history.
- [ ] **Step 6: full gates + commit** (`test: the filter suites follow Library's new surface`).
