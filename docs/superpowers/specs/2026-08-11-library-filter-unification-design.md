# Library filters: difficulty, chips outside the sheet, one Apply

**Date:** 2026-08-11
**Trigger:** James, from device use: (1) "you can't filter by easy/medium/
hard", (2) "I'd like the workout types to be outside of the filter modal,
similar to how it is on Today", (3) "lets unify and say 'apply filter' —
I really want this filter experience to feel unified with Today".
**Rulings this session:** Library's type chips are MULTI-select (unlike
Today's single-select swap chips, which pick one type for the day); the
TYPE_WORDS descriptor row renders only while exactly one type is
selected.
**Revised after an antagonistic pass** (5 blocking findings, report at
`.superpowers/sdd/library-filters-spec-review.md`): the multi-type token
would have silently lost its colour, "reuse Today's classes" does not
reproduce Today's row, and my test inventory undercounted the work. All
five are resolved below; the pass CLEARED the storage-reset claim, the
`Filters`-export sweep, the caption/`SheetShell` contract, and every
contrast pairing (chip label 6.69:1, descriptor 9.74:1, active chip
6.67:1, 44px via `--tap`).

## The finding behind ask 1

Difficulty filtering is not broken in Library, it was never built there.
`Filters` (`app/src/library/filters.ts:31-37`) has no difficulty field,
`applyFilters` (`:77-101`) no predicate, `FilterSheet.tsx` no group,
`filterTokens.ts:11` no token kind, `libraryFilters.ts`'s validator no
key. Today's DIFFICULTY group arrived later (2026-08-04) and was never
back-ported; the DEVIATIONS row for Library's sheet lists "all five
groups" as TYPE/TIME/PAIN/LAST DONE/SOURCE, confirming the omission was
original. `WorkoutRow.tsx:52` only DISPLAYS difficulty. Additive work,
not a repair — and cheap, because `DIFFICULTY_CHIPS`
(`src/components/difficultyChips.ts`) is already shared with Today.

## What ships

### 1. DIFFICULTY, in the sheet, first

`Filters` gains `difficulties: Difficulty[]`, multi-select, using the
shared `DIFFICULTY_CHIPS` and `CellGrid` exactly as Today does.
Predicate follows LIBRARY's own convention, simpler than Today's: empty
means no filter (`difficulties.length > 0 &&
!difficulties.includes(w.difficulty)` excludes), the shape
`durations`/`painLevels` already use. Today's "empty is impossible"
constraint is a `suggest()` property and does NOT apply here; Library's
CLEAR ALL keeps emptying to nothing.

Sheet group order becomes DIFFICULTY → TIME → PAIN → LAST DONE /
SOURCE: identical to Today's, TYPE having left for the chip row.

**Its token label reuses the canonical `collapseDifficulties`**
(`src/today/todayFilterTokens.ts:72-88`) rather than inventing a third
join idiom — lift it to a shared module and import it in both token
files (the pass's finding 5a).

### 2. TYPE chips outside the sheet, multi-select

`Filters.type: WorkoutType | null` becomes `types: WorkoutType[]`. The
chip row renders above the token row, with the descriptor beneath it
(`TYPE_WORDS`, aria-hidden) ONLY when exactly one type is selected.
Tapping toggles; none selected means all types, like every other group's
empty state. The TYPE group leaves `FilterSheet` entirely.

**Shared classes, not borrowed ones** (finding 2): Today's row is
`.chip-wrap.today-type-chips`, and `.today-type-chips` is what overrides
`.chip-wrap`'s wrap into the 4-column grid — bare `.chip-wrap` yields a
different row plus a stray margin. So the grid rule and the descriptor
rule are EXTRACTED to screen-neutral names (`.type-chip-grid`,
`.type-word-row`), Today's JSX switches to them (a pure rename; its
pixels are unchanged and its existing assertions prove it), and Library
uses the same. Same treatment for the FILTER trigger (finding 3):
Today's look comes from `.today-shuffle`, not bare `.button-outline`, so
that rule is extracted too and both screens wear one class. **Grep every
test, design assertion and screenshot spec for the three old class names
before renaming**; each hit is a deliberate update.

**The token keeps its colour** (finding 1, the sharpest catch):
`Library.tsx:70-78` currently derives a type token's fill by looking
`TYPE_COLOR_VAR` up BY THE TOKEN'S LABEL, which only works while the
label is a bare code — `"O2 · AT"` would resolve `var(undefined)` and
silently fall back to `--ink`, breaking the type-colour rule with every
existing test still green. Fix the seam, not the symptom: `filterTokens`
emits the fill itself (`fill?: string`), Library stops guessing from the
label, and the rule is explicit — a single selected type fills with its
own colour, several fill with `--ink` and read `O2 · AT`. A test pins
the two-type case's fill.

### 3. One Apply, one caption

Library's primary adopts Today's contract verbatim: the constant
`Apply Filter`, with the live count moved OUT of the button's accessible
name into an `aria-describedby` caption above it (verified: `SheetShell`
imposes no constraint on where the caption lives). Caption copy uses
Library's own noun: `{n} WORKOUTS` (`1 WORKOUT` singular).

**One deliberate divergence, flagged for James's veto:** at zero matches
the caption reads `NO WORKOUTS MATCH` rather than `0 WORKOUTS`. The
button is disabled either way (unchanged), but the old copy's
helpfulness is worth keeping where the count now lives. Today's caption
at zero says `0 OPTIONS`; if James prefers strict parity, the caption
becomes `0 WORKOUTS` and this paragraph goes away.

## Storage: the shape change is a reset, and that is fine

Verified by the pass: `libraryFilters.ts:37-74` rejects a
non-conforming record WHOLE (`!Array.isArray(f.types)`), falling back to
`EMPTY_FILTERS` rather than half-applying, and nothing else persists or
transmits a `Filters` shape. So every currently stored record is
rejected on first load after deploy: a rower mid-session loses their
active Library filters once. Acceptable and stated — sessionStorage, and
the tab bar's LIBRARY link already clears it on every fresh tap. The
validator gains both new fields' checks. A test pins the reset (an
old-shape record loads as EMPTY_FILTERS, not a hybrid).

## Token row order

TYPE's token leads (its control now sits above the sheet), then
DIFFICULTY → TIME → PAIN → LAST DONE → SOURCE, so the row reads
top-to-bottom in the same order the controls appear (finding 5b;
`filterTokens.ts:28-32` currently ties order to the sheet's groups and
`filterTokens.test.ts:10-21` asserts the exact array — both updated
deliberately).

## What does not change

Today's BEHAVIOR (its chips remain the single-select plan swap, its
sheet its own component, its copy its own) — only three class names
move under it. The detail screen, the builder, `suggest()`, every API,
Library's CLEAR ALL semantics, and Library's sessionStorage key.

## Testing

Scope is larger than a first read suggests; the pass's verified
inventory governs (report §4), not my earlier counts. It includes, at
minimum:

- `Show N workouts` sites: `FilterSheet.test.tsx` (5 locators),
  `Library.test.tsx` (6 — its `:523` hit is unrelated empty-state copy),
  `library.spec.ts:32,35`, `design.spec.ts:417,442,459`,
  `screenshots.spec.ts:539,549`.
- **Old-shape sessionStorage seeds** in `Library.test.tsx` (511, 651,
  704, 936, 962, 1037) and four saved-shape assertions (1002-1039) —
  invalidated by the rename, missed by my first pass.
- `libraryFilters.test.ts:12,24,67,68,88`; the TYPE-in-sheet tests; the
  two `getByRole("dialog").getByRole("button",{name:"O2"})` locators
  (`design.spec.ts:413-417,438-442`); and `library.spec.ts:68-105`
  wholesale (it drives TYPE through the sheet).
- New: difficulty predicate incl. empty-is-no-filter; `types`
  multi-select incl. empty-is-all and a two-type union, composed with a
  difficulty AND a pain filter against the REAL `LIBRARY_WORKOUTS`; the
  descriptor row at exactly one selection and absent at zero and two;
  the two-type token's `--ink` fill; the caption's `aria-describedby`
  wiring; an e2e picking two types from the chip row plus a difficulty
  in the sheet, surviving a BACK round trip.
- Screenshots `library.png`, `library-sheet.png`, `library-filtered.png`
  recaptured and opened. Design sweep must stay green (the descriptor
  row is a small mono label — `--ink-2`, 9.74:1, verified).
- DEVIATIONS reconciliation (recurring-failure #9): the rows describing
  Library's sheet groups, its `Show N workouts` primary, its count
  vocabulary, and its zero-match disable all shift; reconcile each in
  place and bottom-append ONE new row for the chips-outside-the-sheet
  decision.

## Out of scope

Merging `FilterSheet` and `TodayFilterSheet` (their accessibility
contracts and reset semantics genuinely differ; this spec unifies
vocabulary, placement and now three CSS rules — not the
implementations), Today's storage backend, and the `collapsePain`
duplication.
