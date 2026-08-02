# Bugfix round — history-aware BACK, Library scroll restoration

**Date:** 2026-08-02
**Status:** Approved (both James's device reports; flow + back-model
confirmed by him 2026-08-02)

## Problems

1. **Today → workout → ← BACK lands on Library, not Today** (screen
   recording). Every `← BACK` link is hardcoded `to="/library"`
   (`WorkoutDetail.tsx:78/:225`, `Builder.tsx:334`, `EditWorkout.tsx:46`),
   which predates Today being the landing screen.
2. **Returning to Library loses scroll position** — back from a detail
   scrolls to the top of the 35-row list.

## Decisions (James's)

| Question | Decision |
|---|---|
| Back model | **Return where you came from.** From Today back to Today; from Library back to Library (scroll intact). Deep links / cold loads fall back to `/library`. |
| Scope | All `← BACK` links share one mechanism — no per-screen bespoke logic. |

## Design

- **`src/shell/BackLink.tsx`** (new): renders the existing `← BACK` style;
  target = `location.state?.from` when it is an in-app path, else
  `/library`. Every screen that links INTO a detail-ish screen passes
  `state={{ from: location.pathname }}` (Today's suggestion card + last-three
  rows, Library's workout rows, detail → edit). Chains preserve the
  ORIGINAL origin: detail passes its own `from` through to edit, so
  Today → detail → edit → BACK → detail → BACK → Today.
- **Delete stays `/library`**: after deleting, the thing you came from may
  not make sense (a Today suggestion that no longer exists) — deletion
  navigates to `/library` regardless of origin. Deliberate, documented.
- **Scroll restoration, Library only** (the one long list): save `scrollY`
  keyed by a session marker on unmount/scroll (throttled), restore in a
  `useLayoutEffect` AFTER the rows have rendered (the list must have its
  height — the LOADING-race lesson from the screenshot captures applies).
  sessionStorage, cleared on explicit navigation to `/library` via the tab
  (a fresh visit starts at the top; only BACK restores). If distinguishing
  tab-visits from back-visits proves brittle, restoring on both is
  acceptable — say so in the report.

## Testing

- Client: BackLink target table (state present / absent / external junk);
  the Today→detail→edit→back→back chain; delete-from-Today still →
  `/library`. Self-mutation DoD per TESTING.md §13.
- e2e: the recorded flow exactly — Today → tap suggestion → BACK → **on
  Today**; Library → row 30ish → BACK → Library **scrolled to where you
  were** (assert scrollY within a tolerance, after rows render); tab-tap to
  Library starts at top.
- The 6A flow e2e asserts navigation paths — update, don't weaken.

## Out of scope

Today enhancements (filters, type-swap — queued separately). 6C. Any other
buffer item that arrives mid-round joins the NEXT round.

## Exit criteria

James's recorded flow lands on Today; Library browsing position survives a
detail round trip; full gates green.
