# Today's collapsible filter — the sheet pattern comes to Today

**Date:** 2026-08-04
**Status:** Approved (James, 2026-08-04: full Library treatment at rest;
the type swap stays on the plan line; `Show N options`)

## Problem

Phase 6F gave Today three labelled chip groups (DIFFICULTY / TIME / PAIN,
eleven cells) sitting permanently on the screen, and gave the Library the
collapsible `FILTER ⌄` + sheet + tokens pattern. James: Today should
collapse the same way — the same modal pattern, backed by Today's own
state, not the Library's.

## Verified facts

- Today's filter state lives in `todayOverrides` (localStorage, keyed
  `{date, planKey, doneN}`, v2 shape with `painLevels`) — initialized
  from the server prefs each day (`difficulties` as-is, `capMinutes` via
  `snapCap`, `painLevels: []`). The Library's lives in `libraryFilters`
  (sessionStorage) — fully separate stores already.
- The Library's `FilterSheet` (277 lines) is hardwired to the Library's
  `Filters` type: backdrop + `role="dialog"` + focus trap/restore (built
  in 6F's final wave), draft state committed only by the L1 button,
  discard on backdrop/Escape/BACK (no history entry).
- Semantics differ where they look alike: the Library's TIME is a bucket
  UNION; Today's is a cap SINGLE-SELECT. The Library has no DIFFICULTY
  group. Only PAIN (five-cell union) is identical.
- `suggest()` consumes the overrides; `poolIds` is the SHUFFLE pool —
  the sheet's live count counts it.

## Decisions

| Question | Decision |
|---|---|
| Rest state | **Full Library treatment**: `FILTER ⌄` chip (chip geometry, beside `SHUFFLE ↻` on the suggestion header's right), active overrides as removable tokens below the header. |
| Type swap | **Stays on the plan line** — the swap picks the pool (plan semantics); filters narrow it. The sheet has no TYPE group. |
| Primary button | **`Show N options`** — live count of the filtered suggestion pool (`suggestion.poolIds.length` computed on the DRAFT), disabled at 0 (the standing zero-result ruling). Singular-aware (`Show 1 option`). |
| "Active" means | **Deviates from the day's pref-derived defaults** — tokens appear only for state differing from the initial derivation (difficulties narrowed, cap ≠ snapCap(pref), any pain). A default cap shows NO token. |
| CLEAR ALL | **Resets to the pref-derived defaults**, NOT to nothing — a deliberate divergence from the Library's CLEAR ALL (which empties). DEVIATIONS row. |
| Storage | **Unchanged.** `todayOverrides` v2 exactly as-is; the sheet edits a draft copy of the same fields. No migration, no suggest() change. |

## Design

### 1. Shared primitives (extracted from the Library's sheet)

- `src/components/SheetShell.tsx` — backdrop, dialog semantics, focus
  trap + restore-to-opener, slide-up, the L1 primary-button slot,
  discard-on-any-exit (backdrop/Escape/no-history-BACK). The Library's
  `FilterSheet` refactors onto it with ZERO behaviour change (its
  existing tests must pass unmodified — that is the extraction's proof).
- `src/components/CellGrid.tsx` — label + N-cell grid; `mode: "multi" |
  "single"`; cells `{value, label, pressed}`; the ink selected-state and
  44px targets come with it. Library's five groups and Today's three
  both render through it.
- `src/components/TokenRow.tsx` — the removable-token row, fed a
  `Token[]` (`{label, fill: "ink" | <type token>, onClear}`); the
  Library's token rendering moves onto it (again: existing tests prove
  the move).

### 2. Today's pieces

- `src/today/todayFilterTokens.ts` (pure): `(overrides, defaults) →
  Token[]` — one token per DEVIATING group. Difficulty collapses as an
  ordered range (`EASY–MEDIUM`; non-contiguous `EASY, HARD`); cap is a
  single token (`≤45′` / `NO CAP` when the default had a cap); pain uses
  the Library's collapse rules verbatim (`PAIN 1–2`, `PAIN 1, 4`). Each
  token's clear resets ONLY its group to the default.
- `src/today/TodayFilterSheet.tsx`: SheetShell + three CellGrids
  (DIFFICULTY multi 3-cell; TIME single 5-cell ≤30′/≤45′/≤60′/≤90′/NO
  CAP; PAIN multi 5-cell). Draft = a `{difficulties, capMinutes,
  painLevels}` copy; `Show N options` computes `suggest(...)` (or
  `suggestFreestyle`) against the DRAFT with everything else (todayCode
  incl. swap, pick, library, baselines) as-is, and commits on tap.
- `Today.tsx`: the three inline chip groups GO; the header's right side
  becomes `FILTER ⌄` + `SHUFFLE ↻` (both chip geometry); TokenRow below
  the header when any token exists; CLEAR ALL (44px accent-label
  control, the Library's idiom) on the token row's line, resetting to
  the pref-derived defaults. The plan-line swap chips are untouched.

### 3. Behaviour rules

- Sheet discard = draft dropped, applied state untouched (backdrop,
  Escape, BACK, tab-tap — no history entry, the 6F semantics).
- Token ✕ / CLEAR ALL apply IMMEDIATELY (no sheet, no confirm) and save
  the record — same as a chip tap did before.
- The pool count under null baselines uses the same `estMinutes: 0`
  convention — the count cannot lie (durations just never exclude).
- Reason-line honesty, SHUFFLE, the pick, invalidation keying: all
  unchanged (this is presentation over the same state).

## Testing

- SheetShell/CellGrid/TokenRow extraction: the Library's existing
  FilterSheet + token tests pass UNMODIFIED (the refactor's gate).
- `todayFilterTokens` table: per-group deviation detection (incl. the
  no-token-at-defaults rule and cap-default edge), ordered-range
  collapse for difficulty, the pain rules, per-token clear resets only
  its group.
- TodayFilterSheet: draft/apply/discard round trip; the live count
  matches the pool the card then shows; disabled at 0; singular copy;
  focus trap/restore (shared shell — spot-assert on Today's instance).
- Today client tests: chips-gone/sheet-present; CLEAR ALL resets to
  pref-derived defaults (NOT empty — assert difficulties back to all
  three, cap back to snapCap(pref)); tokens render only on deviation;
  overrides persistence/invalidation untouched (existing tests keep
  passing).
- e2e: the three today.spec flows re-route through the sheet (the
  neutralize + personal-fixture technique survives; the tap moves
  inside the sheet + apply); one new assertion: CLEAR ALL ≠ Library
  CLEAR (defaults restored, token row empty, card back to the
  unfiltered pick); design sweeps (sheet axe both states, 44px, the
  ink-4 rule) on Today's instance; screenshots: today.png (rest),
  today-filtered.png (tokens), today-sheet.png (open) — captured,
  opened, described.
- Self-mutation DoD; full e2e ×2 (fresh volume; isolated project name).

## Out of scope

The plan-line swap chips, SHUFFLE, the Library's behaviour (its tests
must not change), any storage shape change, server, suggest() logic.

## Exit criteria

- Today at rest shows one `FILTER ⌄` chip and no filter cells; active
  overrides read as tokens; the sheet round-trips with a live, honest
  pool count.
- CLEAR ALL restores the day's defaults and says so in DEVIATIONS.
- The Library's sheet behaves byte-identically on its extracted shell.
- Full gates; three Today captures reviewed.

## Amendment (2026-08-04, PR #50 feedback — James)

1. **TIME unifies on the Library's bucket ranges.** The cap single-select
   (≤30′…NO CAP) dies; Today's TIME group becomes the Library's four
   bucket cells (`<30′ 30–45′ 45–60′ 60′+`), multi-select union, `[]` =
   off. Consequences, all in-branch:
   - `SuggestPrefs.timeCapMinutes: number | null` is REPLACED by
     `durations?: DurationBucket[]` — the predicate mirrors the
     Library's (`bucketFor(estMinutes) ∈ durations` when non-empty and
     durations are known; skipped otherwise). The standard reason's
     "within your N min cap" sentence dies with the cap — the plain
     "Least recently done (…)" form is always used, and the fellBack
     wording names `time` when the union is active (the honesty rule
     unchanged in spirit).
   - `todayOverrides` v3: `capMinutes` → `durations: DurationBucket[]`
     (validated against the bucket set, de-duped; the v2 shape falls
     back — same contract as every prior bump). `snapCap` is REPLACED by
     `bucketsForCap(prefCap)`: the buckets whose LOWER bound is below
     the pref's cap (cap 60 → the first three; cap > 60 → all four =
     effectively unfiltered; cap ≤ 30 → `<30′` only). Defaults/deviation
     /CLEAR ALL all operate on that derived set.
   - Tokens: the TIME token uses the Library's range-collapse rules
     verbatim (`<30′–45–60′` style contiguous collapse; the shared
     collapse helper should now genuinely be shared, not parallel).
2. **The plan line's type-swap chips span the full screen width** — the
   four cells stretch as a 4-column 1fr row (44px height unchanged),
   instead of sitting inline at content width.
