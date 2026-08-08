# Phase 6I — Today Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** START HERE onboarding on Today, a no-baseline SETS YOUR BASELINE
card that runs a real (effort-ref) workout without baselines, Learning the
app on You, the Start-here pin in News, and two new articles — plus three
folded 6H minors.

**Architecture:** One domain predicate (`needsBaselines`) and a nullable-
baselines path through `phases()`/`buildRun` unlock the flow at every
coupled guard site; two quota-exempt seeded workouts are the card's
targets, excluded from all suggestion/browse surfaces; dismissal is a
preferences boolean; step progress reuses `article_reads`.

**Tech Stack:** existing stack; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-08-phase-6i-onboarding-design.md`
(READ IT FIRST — it carries the corrected mechanics from the antagonistic
pass; where this plan is terse the spec is binding).

## Global Constraints

- Worktree `.claude/worktrees/onboarding`, branch `phase-6i-onboarding`;
  `git rev-parse --show-toplevel` before every commit. pnpm, ESM, `.js`
  server imports. TDD everywhere; domain gets the heaviest coverage.
- Never a bare dash in UI; house time format; pain 1–5; tokens only;
  44px targets; WCAG AA computed, numbers reported.
- API/schema additive-only. `pnpm e2e` before done on any `app/src/`
  diff; screenshots for changed screens, opened and described.
- **Landmines (spec §Implementer landmines):** `todayGuard.pin.test.ts`
  byte-pins Today.tsx's stale-draft effect via `?raw` — do not reformat
  that block; `/you/learning` registers inside the `user && onSignedOut`
  conditional; its BackLink `fallback="/you"`.
- Article prose in Task 6 is transcribed EXACTLY (James reviews the diff);
  fact-check `connect-the-monitor` against shipped 7B components and FLAG
  drift in your report — never silently edit the prose.
- Shared e2e stack may be stomped by the concurrent 7C session — if e2e
  results look impossible, check whose bundle is served (grep the JS for
  "NEWS") before debugging; see memory note in
  `.claude/agent-briefing.md`-adjacent docs if present.

## File Structure

```
app/domain/needsBaselines.ts (+ test)        new   the one predicate
app/domain/expand.ts / pace.ts               mod   Baselines|null path
app/domain/onboarding.ts (+ test)            new   designated titles + fixed copy
app/src/session/engine.ts, draft.ts          mod   nullable buildRun/estimates
app/src/session/ConfirmTargets.tsx           mod   footer guard via predicate
app/src/session/Countdown.tsx                mod   redirect + buildRun null path
app/src/session/Timer.tsx                    mod   hide TOTAL LEFT/progress when no estimates
app/src/session/logDraft.ts                  mod   stopwatch actuals survive on effort phases
app/src/workout/WorkoutDetail.tsx            mod   guards via predicate (START/Connect/log door)
app/src/session/useStartWorkout.ts (+ test)  new   extracted start-guard flow
app/server/seed/library/onboarding.ts (+gate) new  the two workouts
app/server/seed/seed.ts / library/index.ts   mod   converge input concat
app/server/db/schema.ts + drizzle/0005_*     mod   prefs start_here_dismissed
app/server/routes/data.ts (+ tests)          mod   prefs field; DELETE article-reads
app/server/stores/articleReads.ts (+fake+contracts+isolation) mod  unmarkRead
app/src/api/useArticleReads.ts (+ test)      mod   purity fix (minor #1) + markUnread
app/src/api/usePreferences.ts (+ test)       mod   startHereDismissed field
app/src/today/StartHere.tsx (+ test)         new   the block
app/src/today/BaselineCard.tsx (+ test)      new   the card
app/src/today/Today.tsx (+ test)             mod   mount both; hide plan apparatus
app/src/you/LearningTheApp.tsx (+ test)      new   /you/learning
app/src/You.tsx (+ test)                     mod   SETTINGS section + row
app/src/news/News.tsx (+ test)               mod   Start-here pin; .news-latest (minor #3)
app/src/news/content/bodies/{yourFirstRow,connectTheMonitor}.tsx  new
app/src/news/content/articles.tsx (+ test)   mod   two entries
app/src/shell/AppRoutes.tsx (+ test)         mod   /you/learning
app/src/index.css                            mod   block/card/learning styles
app/e2e/*.spec.ts, screenshots               mod   flows, sweeps, captures
ROADMAP.md, docs/design/DEVIATIONS.md        mod
```

---

### Task 1: the domain — `needsBaselines` and the nullable path

**Files:** Create `app/domain/needsBaselines.ts` (+test); modify
`app/domain/pace.ts` (`estimationSplit`), `app/domain/expand.ts`
(`phases`, `estimateMinutes`), types as needed. Create
`app/domain/onboarding.ts`: `ONBOARDING_TITLES = { k6: "First 6k", k2:
"First 2k" }`, `ONBOARDING_DURATION_COPY = { k6: "ABOUT 25 MIN", k2:
"ABOUT 8 MIN" }`, `isOnboardingTitle(title)`.

**Interfaces (later tasks depend on these exact names):**
```ts
// domain/needsBaselines.ts — true unless EVERY work step is an effort ref
export function needsBaselines(steps: Step[]): boolean;
// pace.ts: estimationSplit(baselines: Baselines | null, ref): number | null
// expand.ts: phases(steps, baselines: Baselines | null, …): Phase[]
//   — with null baselines an effort work phase gets NO targetSplit and no
//   seconds estimate; a split-ref step with null baselines is a PROGRAMMER
//   ERROR (throw): callers must gate on needsBaselines first.
// expand.ts: estimateMinutes(…, baselines: Baselines | null): number | null
```

- [ ] **Step 1: failing tests.** `needsBaselines`: all-effort → false;
  any split-ref work step → true; warm-up/rest steps ignored (verify how
  `phases()` targets warm-ups today — if warm-ups derive a split from
  baselines, an effort-only workout's warm-up must render its existing
  "Easy" word from a null split; pin that). `phases(null)` on the First-6k
  shape: one warm-up + one 6000m effort phase, no `targetSplit`, no
  estimate; `phases(null)` with a split-ref step throws.
  `estimateMinutes(null)` → null. Existing suites untouched-green (every
  current caller passes concrete baselines).
- [ ] **Step 2:** run, RED. **Step 3:** implement. **Step 4:** run, GREEN;
  full `pnpm test --project unit`. **Step 5:** commit
  (`feat: a workout can say it needs no baselines — and mean it`).

### Task 2: the session flow runs it — every coupled guard site

**Files:** `engine.ts`/`draft.ts` (`buildRun(draft, baselines:
Baselines | null, now)`, `draftMinutes` null-tolerant),
`ConfirmTargets.tsx` (footer: block only when `needsBaselines(steps) &&
baselines === null`), `Countdown.tsx` (same predicate for the redirect AND
its `buildRun` call), `Timer.tsx` (when NO phase has a seconds estimate:
hide the TOTAL LEFT row and the phase progress bar entirely — never a
frozen 0:00/0%), `WorkoutDetail.tsx` (START footer, Connect guard, manual
log door: all three through the predicate), `logDraft.ts` (an effort
distance phase with a MEASURED actual keeps
`actualSplit`/`actualSource:'stopwatch'` in the log; assumed actuals stay
dropped — `validateLogStepEntry` already accepts paired actuals without
`targetSplit`).

**Consumes:** Task 1's exports. **Produces:** an effort-only workout runs
Confirm → Countdown → Timer → Complete → Log end to end with null
baselines; Task 5's card can START.

- [ ] Failing tests first per site (client project): Confirm shows START
  for an effort-only workout with null baselines and still blocks a
  split-ref one; Countdown builds and saves a run (no redirect loop —
  regression-pin the loop: with the old guard shape the run record was
  never written); Timer hides TOTAL LEFT/progress for the no-estimate
  session and shows them unchanged otherwise; logDraft keeps the measured
  stopwatch split on an effort phase (unit); WorkoutDetail's three doors
  open for effort-only/null and stay shut for split-ref/null.
- [ ] Implement; full `pnpm test`; commit
  (`feat: the session flow stops assuming a baseline it never needed`).

### Task 3: server — seed pair, prefs column, DELETE route, minor #2

**Files:** `server/seed/library/onboarding.ts` (two workouts: title from
`ONBOARDING_TITLES`, type O2/AN, difficulty easy, pain 2/5, steps
`[{kind:"wu"…default}, {kind:"w", distance 6000|2000, ref {effort:"min"}|
{effort:"max"}}]` — copy the exact step-shape idiom from an existing
seed file; NO spm), its own gate test (2 rows, effort refs, fixed titles,
distance steps), `library/index.ts` concat AFTER the 300 (sortOrder
continues), `library.test.ts` untouched (its 300-grid asserts only the
main list — verify; if it counts the converge input instead, scope its
selector to the main list and say so); `schema.ts` +
`start_here_dismissed boolean notNull default false` + `pnpm db:generate`
(migration creates ONLY that column); `data.ts` PUT `/api/prefs` accepts
`startHereDismissed` (boolean validation per siblings) and GET returns
it; `DELETE /api/article-reads/:slug` (SLUG_RE, 204, idempotent);
`stores/articleReads.ts` `unmarkRead(userId, slug)`; fake +
`StoresUnderTest.articleReads` becomes REQUIRED with dead guards removed
(minor #2) + contract cases for unmarkRead (round-trip, idempotent,
per-user) + isolation row.

- [ ] TDD: integration + route tests red first (delete round-trip,
  idempotent, isolation, bad slug 400; prefs field round-trip; seed gate).
  Implement; `pnpm test --project unit && --project integration`; commit
  (`feat: the server learns forgetting, dismissal, and two first rows`).

### Task 4: client plumbing — hook purity + markUnread, prefs field, start-guard extraction

**Files:** `useArticleReads.ts`: move the `has(slug)` guard + PUT OUT of
the setState updater (minor #1 — compute outside, fire before setState),
add `markUnread(slug)` (optimistic delete + fire-and-forget DELETE, same
silence rules; no call for a slug not in the set) — extend
`ArticleReadsState`'s ready variant; tests mirror the existing five plus
markUnread cases (optimistic-before-resolve, silent failure, no duplicate
DELETE). `usePreferences.ts`: expose `startHereDismissed` + a `save`
patch for it (follow the hook's existing field pattern exactly).
`session/useStartWorkout.ts`: extract WorkoutDetail's `handleStart` flow
(unlogged-run staged confirm state, live-MonitorRun confirm, draft
build/save, cross-clears, navigate) into a hook consumed by
WorkoutDetail with byte-equivalent behavior — WorkoutDetail's existing
tests must pass UNCHANGED (that is the extraction's proof), plus new
direct hook tests for the confirm-stage transitions.

- [ ] TDD; full client project; commit
  (`refactor: start is a hook, reads can be unread, prefs know the block`).

### Task 5: Today — the block and the card

**Files:** `StartHere.tsx` (header `START HERE · N OF 4 READ` — count
suppressed on reads-error, mono; `DISMISS` 44px accent text link; four
step rows: unread square + copy + minutes, exact copy from the spec's
table, `Link`s with `state={{from:"/today"}}` to
`/news/your-first-row`, `/news/baselines`, `/news/picking-a-workout`,
`/news/connect-the-monitor`), `BaselineCard.tsx` (`SUGGESTED · SETS YOUR
BASELINE`, designated title, `ONBOARDING_DURATION_COPY` constant (never a
computed estimate), dashed chip `6K BASELINE · NOT SET · ROW IT HOW IT
FEELS`, START via `useStartWorkout`, `2K INSTEAD`/`6K INSTEAD` secondary
per the spec's either-null rules), `Today.tsx`: mount StartHere above
everything while `!preferences.startHereDismissed`; show BaselineCard and
HIDE the suggestion card + plan line + type-swap chips + FILTER/SHUFFLE
header while either baseline is null; **do not touch the byte-pinned
stale-draft effect**. Log-screen default: designated-workout logs pre-set
the plan toggle to outside-plan (visible, changeable) — smallest honest
implementation: `LogSession` checks `isOnboardingTitle(workoutTitle)` for
the DEFAULT only.
CSS: block + card + dashed chip styles, tokens only; dashed uses
`--rule-3` per the handoff's "means nothing here yet".

- [ ] TDD: block renders/counts/suppresses/dismisses (optimistic PUT
  spied); step links + state; card branch logic (both-null default 6k +
  toggle, one-null missing-distance no-toggle, both-set → normal Today
  with plan apparatus back); plan-mode hiding; outside-plan default.
  Realistic fixtures (real registry, real prefs shapes). Full client +
  `pnpm test`; commit (`feat: Today teaches — four steps and a first row`).

### Task 6: the two articles

**Files:** `bodies/yourFirstRow.tsx`, `bodies/connectTheMonitor.tsx`,
registry entries (`your-first-row`, minutes by the 6H formula
`ceil(words/180)`; `connect-the-monitor` likewise; both unpinned,
`publishedAt: "2026-08-08"`), registry tests updated (launch-shelf
assertions grow; unreadCount math shifts by 2 — update, never weaken).
Transcribe EXACTLY (the `[…]` chips rule does not apply here — no chips
in these two):

`yourFirstRow.tsx` — `export function YourFirstRowBody()`:

> The app can't write your targets until it knows one number: the average
> split you can hold for six thousand metres. Getting that number is your
> first row, and Today is already offering it.
>
> Tap START on the suggested 6k. There are no targets yet, and that is
> the point: the timer runs a plain six-thousand-metre piece and clocks
> your average split. Warm up for ten minutes first, then row it honestly
> rather than heroically: hold as even a pace as you can. A 6k that
> starts too hot undersells your real fitness.
>
> When you finish, your average split is on the summary screen and stays
> in the log. That split is your 6k baseline. Enter it under You, in the
> baselines editor, and from that moment every workout in the library
> resolves into real numbers written relative to you.
>
> Prefer the short test? 2K INSTEAD runs two thousand metres all out and
> sets your 2k the same way. The app wants both eventually (short, sharp
> workouts key off your 2k; longer ones key off your 6k), and Today keeps
> offering whichever is missing.
>
> One honest warning: your first baseline will be a little wrong.
> Everyone's is. Row for a few weeks, notice workouts drifting easier
> than their forecasts, and re-test. The library moves with you.

`connectTheMonitor.tsx` — `export function ConnectTheMonitorBody()`:

> Every workout in this app can run two ways. Manual mode is the phone
> alone: you follow the timer and row. Connected mode adds a Concept2
> PM5, and the piece changes character: the app writes the whole workout
> into the monitor before you take a stroke.
>
> Connect from the workout's own screen before you start. The app finds
> the monitor over Bluetooth and sends every interval: the work, the
> rests, the distances, the times. The PM5 then runs the piece the way it
> runs a race. Intervals advance themselves, rest counts itself down, and
> the monitor's numbers are the numbers.
>
> While you row, the timer shows your actual pace beside the target and
> your stroke rate beside the prescribed rate. No guessing about whether
> you're on: the screen says so, stroke by stroke.
>
> If the connection drops mid-piece, nothing is lost. The timer falls
> back to manual and the session keeps going. Manual mode is never taken
> away; connected mode is simply the erg doing the bookkeeping.
>
> You'll need a PM5 (the standard Concept2 monitor) with Bluetooth
> switched on. Your first baseline row works either way; connect whenever
> you're ready.

**Fact-check duty:** verify every `connect-the-monitor` claim against
`src/monitor/ConnectAction.tsx` and the timer's connected surface (button
placement/label, auto-advance, live pace+rate display, disconnect
fallback). If ANY claim doesn't match shipped behavior, do NOT edit the
prose — report the exact mismatch (status DONE_WITH_CONCERNS) so the
controller re-drafts with James's voice rules.

- [ ] TDD (registry invariants first), transcribe, render tests per 6H's
  bodies.test pattern, minutes by formula (report word counts); commit
  (`feat: two more stories — the first row, and the wired monitor`).

### Task 7: You + News — Learning the app, the pin, minor #3

**Files:** `You.tsx` (SETTINGS section header + `Learning the app` row,
meta `START HERE · N OF 4`), `you/LearningTheApp.tsx` (`/you/learning`):
progress, the four rows (same read styling/links), status line when
dismissed `DISMISSED ON TODAY · STILL PINNED IN NEWS`, `PUT IT BACK ON
TODAY` (clears the flag; hidden when not dismissed), `MARK ALL FOUR
UNREAD` (staged tap-again confirm; four `markUnread` calls AND clears the
dismissed flag). `AppRoutes.tsx`: route inside the `user &&` conditional;
BackLink `fallback="/you"`. `News.tsx`: the Start-here pinned row (only
while dismissed): `Start here, in four steps` + `N OF 4 READ · DISMISSED
ON TODAY`, links to `/you/learning` with `state={{from:"/news"}}`; LATEST
section gains `.news-latest` and `e2e/news.spec.ts`'s negation locator
switches to it (minor #3).

- [ ] TDD: row meta counts; detail controls (staged confirm actually
  stages; unread wave calls markUnread ×4 + un-dismisses — assert
  consequences on the mocked hook); pin only-when-dismissed + its meta;
  route conditional (signed-out config wildcards to /today); cross-surface
  pin: reading `baselines` from News moves Today's and Learning's counts.
  Commit (`feat: the tutorial has a home on You, and a bookmark in News`).

### Task 8: proof, pixels, record

- [ ] e2e (`app/e2e/onboarding.spec.ts`, fresh RUN_ID user): the whole
  arc — fresh user sees START HERE (`0 OF 4`… header shows count only
  with reads loaded) + baseline card; read `baselines` via News → Today
  reads `1 OF 4 READ`; card START → confirm (no block) → SKIP countdown →
  timer (effort word, NO TOTAL LEFT row) → complete → log (outside-plan
  default when plan active — seed a plan for this user first) → save →
  log's step shows the measured split; set the 6k in You → card offers
  `SETS YOUR 2K BASELINE`; set the 2k → real suggestions return with the
  plan apparatus; DISMISS → News pin appears → `/you/learning` → PUT IT
  BACK restores; MARK ALL FOUR UNREAD un-reads + un-dismisses and News's
  count rises. Design sweeps: axe/44px/contrast (dashed chip measured) on
  Today-with-block+card, `/you/learning`, News-with-pin. Suggestion
  exclusion pinned: a baselines-set user's SHUFFLE pool never contains a
  designated title, and Library's list doesn't show them.
- [ ] `pnpm e2e` ×2 back to back; `pnpm screenshots`: new
  `today-onboarding.png`, `you-learning.png`; News + Today recaptured;
  open and describe each.
- [ ] Docs: DEVIATIONS (settings rows not built; pin cap spoken for —
  pain-scale stays unpinned; the stopwatch-actual amendment to the 5G
  drop rule; anything found); ROADMAP 6I section (Done) + auto-capture
  follow-on under triggered follow-ons; rebase onto origin/main; full
  gates; push; PR "Phase 6I — Today teaches" (feature table, screenshots,
  contrast numbers, risk note incl. the domain-change blast radius and
  the 7C-collision note). Do NOT merge.

## Self-review record

Spec coverage: every corrected-spec mechanic has a task (nullable domain
1; guard sites + timer + logDraft 2; seed/prefs/DELETE/minor-2 3; hook
purity + markUnread + start-guard extraction 4; block/card/plan-hiding/
outside-plan 5; articles 6; You/News/pin/minor-3 7; proof + docs 8).
Placeholders: none — prose, interfaces, copy constants all concrete;
"copy the idiom from an existing seed file" defers mechanics to the
canonical source, not content. Type consistency: `needsBaselines(steps)`
(T1) is what T2/T5 gate on; `ONBOARDING_TITLES`/`isOnboardingTitle` (T1)
feed T3's seed, T5's card/log default, T8's exclusion pins;
`markUnread` (T4) is what T7's wave calls; `startHereDismissed` name
identical across schema/route/hook/screens.
