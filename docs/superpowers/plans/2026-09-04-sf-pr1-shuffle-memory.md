# Phase SF PR1 — Shuffle, daily type, per-type filter memory: Implementation Plan

> **For agentic workers:** this plan is the RECORD of a PR the controller
> implemented inline, task by task, in the worktree `Ergomatic-wt-sf` on
> branch `phase-sf-spec`, because the repo's plan-authoring rule (every
> prescribed block paste-tested at its real path) makes the author the
> implementer. What remains for a fresh agent is REVIEW, not transcription:
> each task names its commit, its gates, and the mutations that bit. Use
> superpowers:requesting-code-review per task or on the whole branch.

**Goal:** SHUFFLE draws at random without repeats, the day's first card is
random within the least-recently-done tie and stable across reloads, a
freestyle day rolls its type once (a clear holds for the day), and Today's five
filter groups are remembered per type.

**Architecture:** the domain (`domain/suggest.ts`) stays deterministic and
grows a tie class (`tieIds`) plus two pure helpers over id arrays
(`drawOne`, `nextShuffle`) that take an injected `Rng`; the client draws
ONCE inside Today's two lazy initializers and persists the draw (no seeded
PRNG); filters move from the dated per-day record into an undated per-key
store; a module-scope fallback owns storage-denial.

**Tech stack:** React 19 + Vite client, Vitest (unit/client), Playwright
e2e against the per-worktree compose stack, `crypto.getRandomValues`.

**Spec:** `docs/superpowers/specs/2026-09-04-shuffle-and-filters-design.md`
§2, revision 1 plus the PR1 corrections (`drawnId`, `shuffled`, the
stale-pick fall-through) recorded there.

## Global constraints

- No framework or platform import in `app/domain/` (lint-enforced).
- Platform conditionals only in adapters; `crypto.getRandomValues` is a
  browser global on every surface, so `src/today/rng.ts` is not one.
- No em-dashes in user-facing copy; none added.
- Every stored-shape loader: try/catch around the getter, null/empty on
  denial, never clear on mismatch (storage-denial research 2026-09-03).
- Every new assertion gets a mutation that makes it fail (RF21), stated.
- I-8: no request per tap; the e2e request-list gate proves it.

---

### Task 1: domain — `tieIds`, `drawOne`, `nextShuffle`

**Commit:** `b7a3844e` (on `phase-sf-spec`).
**Files:** `app/domain/suggest.ts`, `app/domain/suggest.test.ts`.
**Produces:** `Suggestion.tieIds: string[]`; `type Rng = () => number`
(uniform integer in `[0, RNG_RANGE)`), `RNG_RANGE = 2 ** 32`;
`drawOne<T extends string>(ids: readonly T[], rng: Rng): T | null`
(rejection sampling; singleton returns without consulting rng);
`nextShuffle(poolIds, shownIds, currentId: string | null, rng): { id;
shownIds } | null`.

- [x] Failing tests first (`pnpm exec vitest run --project unit
      domain/suggest.test.ts`: 8 failed before, 82 passed after).
- [x] Mutations, each on the clean commit, each reverted with `git
      checkout` after `git status` showed nothing else pending:
      M1 drop the shown-set subtraction → 3 failed; M2 tie class returns
      only the head → 2 failed; M3 no reset after exhaustion → 2 failed;
      M4 remove the rejection loop → 1 failed.

### Task 1b: domain — `drawnId` beside `todayPickId`

**Commit:** `8bd0c2bb` (lands with tasks 2+3; found while wiring).
**Why:** passing the day's draw as `todayPickId` made the first card say
"YOUR PICK" and beat a checkpoint pin. `drawnId` is honoured for the card,
reported as least recently done, never beats the pin.
**Produces:** `SuggestInput.drawnId?: string`;
`suggestFreestyle(library, prefs, todayPickId?, drawnId?)`.

- [x] Five tests in `domain/suggest.test.ts` ("drawnId (the day's drawn
      first card)"); 87 passed.

### Task 2: stored shapes

**Commit:** `8bd0c2bb`.
**Files:** `app/src/today/todayFilters.ts` (NEW) + test,
`app/src/today/todayOverrides.ts` + test, `app/src/today/todayPick.ts` +
test.
**Produces:** `TODAY_FILTERS_KEY`, `TodayFilterKey = WorkoutType | "ANY"`,
`FilterSet`, `TodayFilters { v: 1; byKey }` (revision 1's `rollSuppressed`
struck by James at Gate 0),
`loadTodayFilters(): TodayFilters` (never null), `saveTodayFilters():
boolean`, `filterSetFor`, `withFilterSet`, `filterKeyFor`;
`TodayOverrides = { date, planKey, doneN, swapType }`,
`saveTodayOverrides(): boolean`; `TodayPick` + `shownIds: string[]` +
`shuffled: boolean`, `loadTodayPick(): StoredPick | null`.

- [x] 69 tests across the three store files (`pnpm exec vitest run
      --project client src/today/todayFilters.test.ts
      src/today/todayOverrides.test.ts src/today/todayPick.test.ts`).
- [x] Compile-coupled with Task 3: removing the five filter fields from
      `TodayOverrides` breaks `Today.tsx` until it is rewired, and the
      pre-commit hook typechecks the whole project, so the two land in one
      commit (RF10's own example of a type-forced coupling).

### Task 3: Today wiring + the client rng

**Commit:** `8bd0c2bb`.
**Files:** `app/src/today/Today.tsx`, `app/src/today/rng.ts` (NEW) + test,
`app/src/today/todayFilterTokens.ts` (param type → `FilterSet`),
`app/src/today/TodayFilterSheet.tsx` (`TodayFilterDraft = FilterSet`),
`app/src/today/Today.test.tsx`.
**Consumes:** everything above. **Produces:** the two write-once-per-day
initializers, `sessionFallback` (module scope, keyed
`${date}|${planKey}|${doneN}`), `handleShuffle` via `nextShuffle`,
`updateFilters` keyed on `filterKeyFor(effectiveType)`; a clear writes
`swapType: null` into today's record, which is what stops a re-roll today.

- [x] Ten new client tests in `Today.test.tsx` ("Phase SF PR1" describe),
      including the seam test that mounts, unmounts, and remounts against
      an advancing scripted rng; 150 passed.
- [x] Mutations on the clean commit: M1 first-pick initializer skips the
      write → 4 failed; M2 daily roll skips the write → 1; M3 sticky clear
      never written → 1; M4 memory keyed on ANY always → 12; M5 fallback
      never consulted under denial → 1; M6 SHUFFLE writes `shuffled:
      false` → 2 (YOUR PICK gone, pin not escaped).
- [x] `pnpm typecheck`, `pnpm exec eslint src/today domain` clean.

### Task 4: e2e, captures, and the server route

**Files:** `app/e2e/today.spec.ts` (freestyle spot-check rewritten; three
new describes: two-run random shuffle + reload, request-list baseline,
per-type memory across chips and reload), `app/e2e/screenshots.spec.ts`
(`pinToday` seeding helper; `today`, `today-freestyle`, `today-capped`,
`today-rolled`, `today-interrupted`, `recovery-today-*` pinned so a random
draw cannot make a committed capture unreviewable),
`docs/screenshots/today-freestyle*.png`. `server/routes/data.ts` needs no
edit: `/api/today` destructures only the fields it uses from `suggest()`.

- [x] `pnpm e2e`: 486 passed, 4 failed — all four `today.spec.ts` tests
      that imported two never-done fixtures and assumed creation order
      broke the tie (they had passed a four-spec run by coin flip); fixed
      by stating the draw with `pinToday` (`df5b35b4`), then
      `--repeat-each 2` → 28 passed. PR checks green at `d738ea4f`.
- [x] `pnpm screenshots` 127 passed; `today-freestyle.png` +
      `today-freestyle-cleared.png` committed, the narrowed capture
      retired, 20 date-only diffs reverted.
- [x] Request-list gate proven red: `void fetch("/api/prefs")` inside
      `handleShuffle` → `+ Received + 12` lines of `"GET /api/prefs"`.

### Task 5: review and PR

- [x] Whole-branch review (two-stage): FIX-THEN-APPROVE. F1 a stored
      record beat a newer failed-write fallback (fixed: fallback consulted
      first, cleared on a landed write; regression test + probe bit);
      F2 a fell-back pool counted as a roll candidate (fixed; test + probe
      bit); F3 `pinToday` key literals → imported constants; F4 checkpoint
      escape's `shownIds` pinned; F5 rejection test on independent
      literals. Commit `f05f7ce7` + the F3 commit.
- [x] PM final gate: PASS WITH CONDITIONS — fold trimmed, `/api/today`
      divergence registered in ROADMAP, next-day roll test added
      (`rolls again on the next local day…`), plan ticked, RF26 clause in
      the Record. Two rulings owed to James at Gate 0.
- [x] PR #297 body per the human-first shape; Gate 0 captures committed.
- [x] Gate 0 rulings (James, 2026-09-04): sticky clear STRUCK — the day
      record now carries the clear (roll always writes it; remount today
      does not re-roll; tomorrow rolls), tests and e2e re-pointed; build
      shape accepted (CLAUDE.md); one release at phase close.
- [x] Post-gate ask (James: "Can it re-roll after a workout is saved as
      well?" → "Logged only"): both day records gain `session` (sessions
      logged today, freestyle only, derived from the recent-logs fetch,
      widened 3 → 10); a logged session re-keys the day, so the next mount
      rolls and draws afresh. Client tests (re-roll after a log; plan mode
      and unlogged saves do not re-key), store tests (session mismatch and
      malformed values), one e2e through the real log API. Probes: counter
      pinned to 0 → the re-roll test failed; counter ignoring the date →
      the two cleared-day tests failed (their seeded record says session
      0 while the fixture's July logs would count 3). Scoped re-review of
      the two deltas: FIX-THEN-APPROVE, two LOW — a completed plan rolled
      like freestyle but did not re-key (predicate now shared with the
      roll; test + probe), and nothing pinned the widened fetch (the mock
      records its `limit`; probe 10 → 3 bites). The first CI run's e2e
      failure was the new test logging a GLOBAL row through a helper that
      resolves personal ones; it now imports its own fixture.
