# Phase SF PR3 — Library search by name: Implementation Plan (record)

> **For agentic workers:** the RECORD of a PR the controller implemented
> inline (the accepted shape, CLAUDE.md SDLC bullet). Light cycle per spec
> §6: James reviews, no PM gate, antagonist SKIP spoken.

**Goal:** a SEARCH BY NAME field on the Library, live, case-insensitive
substring on the title, composing with every other filter, riding the BACK
record and cleared at the tab.

**Spec:** `docs/superpowers/specs/2026-09-04-shuffle-and-filters-design.md`
§4 (I-14, I-15, I-16, as built).

## Tasks (one commit)

1. **`library/filters.ts`** — `Filters.query: string` (`""` off),
   `setQuery`, `normalizeQuery` (trim + lower-case), `applyFilters` AND-s
   the substring, `hasActiveFilters` counts a non-blank query,
   `clearSheetFilters` keeps it. Tests: `filters.test.ts` "query".
2. **`library/libraryFilters.ts`** — parser: missing `query` → `""` (a new
   concept), non-string → reject. Test in `libraryFilters.test.ts`.
3. **`library/Library.tsx` + `index.css`** — the field above the FILTER
   row: `type=search`, `aria-label="Search by name"`, placeholder
   `SEARCH BY NAME`, 44px, native cancel suppressed, our 44px `✕`
   (`aria-label="Clear search"`) while non-empty, no autofocus. Tests:
   `Library.test.tsx` "search by name" (live narrowing + count row + no
   token; AND with a type chip to the empty state; clear control and CLEAR
   ALL; sheet CLEAR leaves it; BACK-record restore without focus).
4. **e2e** — `library.spec.ts` "Phase SF PR3: search by name" (exit
   criterion 6: `fog` on the real seed, BACK round trip keeps it, the
   LIBRARY tab clears it); `screenshots.spec.ts` `library-search.png` +
   `library-search-landscape.png`.
5. **Docs** — spec I-16 as built, DEVIATIONS row (Library CLEAR ALL cell),
   ROADMAP PR3 line, this record.

## Contrast (computed from `tokens.css`, 2026-09-05)

| Pairing | Ratio |
|---|---|
| placeholder `--ink-4` on `--page` | 4.76:1 |
| typed text `--ink` on `--page` | 15.41:1 |
| clear `✕` `--ink-3` on `--page` | 6.69:1 |
| field border `--rule-3` on `--page` (non-text, same as the sheet cells) | 1.56:1 |
