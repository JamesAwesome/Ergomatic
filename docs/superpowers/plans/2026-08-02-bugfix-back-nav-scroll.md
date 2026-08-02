# Bugfix round — BACK + scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ← BACK returns where you came from; Library keeps your scroll
position across a detail round trip.

**Architecture:** One `BackLink` component reading `location.state.from`
(fallback `/library`); origin chained through detail→edit; Library-only
scroll persistence in sessionStorage restored post-render.

**Spec:** `docs/superpowers/specs/2026-08-02-bugfix-back-nav-scroll-design.md`.
**Every implementer reads `.claude/agent-briefing.md` first.**

## Global Constraints (beyond the briefing)

- Worktree `.claude/worktrees/bugfix-nav`, branch `bugfix-back-nav-scroll`.
- Delete navigates `/library` regardless of origin (deliberate; comment it).
- A fresh tab-tap to Library starts at the top; only BACK restores (if
  distinguishing proves brittle, restoring on both is acceptable — report it).
- Restore AFTER rows render (`useLayoutEffect` gated on loaded state).
- The 6A flow e2e asserts navigation paths — update, never weaken.
- **Commit before running any self-mutation** (two incidents of
  `git checkout` eating uncommitted fixes; the mutation step operates on
  committed state only).

---

### Task 1: BackLink + origin chaining

**Files:**
- Create: `app/src/shell/BackLink.tsx` (+test)
- Modify: `app/src/workout/WorkoutDetail.tsx:78,:225` (both back links; the
  edit link at `:241`-ish passes the ORIGINAL `from` through),
  `app/src/builder/Builder.tsx:334`, `app/src/builder/EditWorkout.tsx:46`,
  `app/src/today/Today.tsx` (suggestion card + last-three links gain
  `state={{ from: "/today" }}` — read how they link first),
  `app/src/library/Library.tsx` (`WorkoutRow`'s Link gains
  `state={{ from: "/library" }}` — it lives in `WorkoutRow.tsx`)
- Test: each touched screen's test file; the BackLink table test

**Produces:** `BackLink({ fallback?: string })` — renders the `.back-link`
idiom; target = `location.state?.from` when it starts with `/` and is a
known-safe in-app path (reject junk: anything not starting `/` or
containing `//`), else `fallback ?? "/library"`.

Requirements with teeth:
- Target table: state present/absent/junk (`"https://evil"`,
  `"//evil"`, `""`).
- The chain: Today → detail (`from=/today`) → edit (detail forwards its own
  received `from`, NOT its own pathname) → BACK → detail → BACK → Today.
  Client test asserts both hops.
- Delete-from-Today still lands `/library` (comment + test).
- Builder's BACK: entered from Library's `+ NEW` (pass `from`) and from a
  deep link (fallback). The `/library/new` and `/library/import` entry
  points gain state where they link.
- e2e: the recorded flow — Today → suggestion → detail → BACK → **Today**
  (assert the Today heading, not just URL).
- Self-mutation per the briefing (commit first).

Full gate (src change). Commit: `fix: BACK returns where you came from`.

---

### Task 2: Library scroll restoration + close-out

**Files:**
- Modify: `app/src/library/Library.tsx` (+test)
- Modify: `app/e2e/library.spec.ts` (the scroll e2e), `ROADMAP.md` (a
  one-line bugfix-round note under 6B's section or a Fixes list —
  match whatever precedent exists; if none, add a `## Bugfix rounds`
  section after the phases), `docs/design/DEVIATIONS.md` only if a row is
  affected (unlikely — say so).

Mechanism: on scroll (throttled ~100ms) write `scrollY` to
`sessionStorage["ergomatic.libraryScroll"]`; on mount with loaded rows,
if `location.state?.from` is a workout-detail return (or the simpler
restore-on-both fallback per the spec), `window.scrollTo(0, saved)` in a
`useLayoutEffect` that runs only once rows exist. Tab-tap entry (no state)
clears the key.

Requirements with teeth:
- Client test: restore fires only after rows render (assert order via a
  loading→ready mock transition); tab-entry clears.
- e2e: Library → scroll deep (row ~30) → open detail → BACK → scrollY
  within ±50px of saved; then tab-tap Library → top. Real 35-row seeded
  list.
- Self-mutation (commit first): drop the restore call → e2e/client test
  dies; drop the rows-rendered gate → the order test dies.

Full gate. Commit:
`fix: Library remembers where you were; record the bugfix round`.
