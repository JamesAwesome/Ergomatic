# Phase 5H — Custom-workout badge, CUSTOM filter, iOS callout fix

**Date:** 2026-08-01
**Status:** Approved (badge form and filter semantics decided by James
2026-08-01; both his device reports)

## Problem

1. Nothing in the library distinguishes a personal workout from the 35
   seeded globals, and there is no way to filter to your own.
2. On the iOS app, long-pressing interactive controls pops the text-selection
   callout (Copy / Look Up / Translate) — reported with a screenshot of the
   You screen's baseline `+` stepper. WKWebView treats control text as
   selectable; desktop Chromium e2e cannot see this.

No API change anywhere: `workout.isGlobal` already reaches the client
(WorkoutDetail gates Edit/Delete on it).

## Decisions

| Question | Decision |
|---|---|
| Badge | A small `CUSTOM` tag on the row's second line, beside the TYPE tag — mono uppercase, **ink outline, not filled**, so it reads as metadata rather than a fifth category colour. Globals unmarked. |
| Filter | An independent `CUSTOM` toggle chip in the existing filter row. **ANDs** with type/duration/`PAIN ≤3`/RECENT, exactly like `PAIN ≤3` behaves today. `ALL` clears it with the rest. |
| Callout fix | `-webkit-user-select: none` (+ `user-select: none`) and `-webkit-touch-callout: none` on interactive controls, **keeping real text inputs selectable** (title field, ClockInput, SPM value, bulk textarea — a user must be able to select and clear typed text). |

## Design

### Badge (`WorkoutRow.tsx`)

`isGlobal` joins the row props (the list already has the value from
`GET /api/workouts`). When `!isGlobal`, render `CUSTOM` beside the type tag
on line 2: same mono size/tracking as the TYPE tag, `--ink-3` text, 1px
`--rule-3` border, transparent fill, 2px radius. Not focusable, not a
control; screen readers get it via the row's accessible name gaining
", custom workout".

### Filter (`filters.ts`, `FilterChips.tsx`, `Library.tsx`)

- `filters.ts`: filter state gains `customOnly: boolean`; the predicate ANDs
  `!w.isGlobal` when set. Bucketing/estimation untouched.
- `FilterChips.tsx`: a `CUSTOM` chip after the existing groups, same chip
  component and pressed styling as `PAIN ≤3`. `ALL` resets it.
- Empty state: filtering to CUSTOM with no custom workouts shows the list's
  existing empty treatment plus a line linking to the builder ("No custom
  workouts yet — build one"), reusing the existing empty-state pattern if one
  exists; if none exists, plain text + the existing `+` path, no new
  component.

### Callout fix (`index.css`, one rule)

A grouped rule applying `user-select: none; -webkit-user-select: none;
-webkit-touch-callout: none` to `button`, `[role="radio"]`,
`[role="group"] > span`, the tag/chip classes, and stepper value **spans** —
NOT to `input`, `textarea`, or any editable field. Verification is split
honestly: jsdom/Chromium can assert the computed `user-select` style
(structural), but the callout behaviour itself is **verified on device by
James** — the PR says so explicitly rather than pretending e2e covered it.

## Testing

- `filters.ts`: predicate unit tests — customOnly alone, ANDed with type and
  duration, cleared by ALL. Self-mutation per TESTING.md §13.
- `WorkoutRow`: badge renders for a custom row, absent for a global (fixture:
  real starter workout for the global; a stored custom shape for the custom).
  Accessible-name check.
- e2e: author a workout (makes it custom), filter CUSTOM → only it remains;
  tap ALL → full list returns. Design sweep unchanged screens; screenshots
  refreshed with at least one custom workout visible so the badge is in the
  visual record.
- Callout: structural assertion on computed `user-select` for a button and a
  chip, and an inverse assertion that the title input remains selectable.

## Out of scope

Any server/API change; sorting customs separately; the Phase 6 items.

## Exit criteria

- A custom workout shows `CUSTOM` in the list; CUSTOM+AN shows only your
  anaerobic customs; ALL restores.
- Long-pressing controls on device no longer pops the callout; typed text in
  the title field is still selectable (James verifies on device post-merge).
- All gates green for the change class; screenshots show the badge.
