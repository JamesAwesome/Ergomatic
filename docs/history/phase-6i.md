> **Archived 2026-08-28** from `ROADMAP.md` (lines 841-945 of the pre-rebalance file, main `39e9430`).
>
> This is the phase as it was written while it ran. It is a RECORD: nothing
> here is scheduled, and its open items were lifted into `ROADMAP.md`'s live
> slate before this file was created. Do not cite it for a live question.

## Phase 6I — Today onboarding

**Status:** Done (2026-08-09, PR #63)
**Goal:** A brand-new rower with no baseline gets taught the app from
Today itself, not from a screen they have to find.
**Design authority:** `docs/design/handoffs/2026-08-07-news-tab/README.md`
decisions 6 and 7.

**Removed by James's 2026-08-23 ruling** ("take the learning the app
section off the today screen and just have it pinned on news. Also remove
the setting from 'you' to reset it. The baseline recommended is enough."):
the teaching surfaces this phase built — Today's `START HERE` block
(Task 5's `StartHere.tsx`/`startHereSteps.tsx`), You's `Learning the app`
row and `/you/learning` screen, and News's dismissed-only Start-here pin
(all of Task 7) — are deleted. They shipped and worked; the removal is a
later product decision, not a reversal of this phase's exit. What
survives: the four articles themselves (with `your-first-row` now a
registry pin, so News's PINNED shelf carries the teaching alone), the
three-door card (superseded Task 5's `BaselineCard` via Phase BL PR C),
and the `preferences.start_here_dismissed` column — dormant server-side
(additive-only API; `server/db/schema.ts`'s own comment names it fallow).

- [x] **Task 1 — the nullable domain**: `needsBaselines(steps)`
      (`domain/needsBaselines.ts`) — true unless every work step is an
      effort ref — the one predicate every coupled call site shares;
      `phases()`/`buildRun`/`estimateMinutes` accept `Baselines | null` and
      resolve an effort work phase with no `targetSplit`/no duration
      estimate rather than throwing
- [x] **Task 2 — every coupled guard site**: Confirm's footer guard,
      Countdown's own null-baselines redirect and `buildRun` call, Timer's
      `hasRemainingEstimate` (TOTAL LEFT and the phase bar hidden, never
      frozen at 0:00/0%, once no phase ahead has an estimate), and
      `logDraft.ts`'s 5G-drop-rule amendment — a measured (stopwatch)
      actual on an effort DISTANCE phase now survives into the saved log
      (`actualSource:"stopwatch"`, `targetSplit` still omitted); an assumed
      actual stays effort-gated
- [x] **Task 3 — server & seed**: `preferences.start_here_dismissed`
      (migration + `PUT /api/prefs`), `DELETE /api/article-reads/:slug`
      (idempotent, full store/contract-test stack including per-user
      isolation), and the two designated global workouts (`First 6k`/
      `First 2k`, `server/seed/library/onboarding.ts`) via their own
      `GLOBAL_LIBRARY_SEED` concatenation and gate, exempt from
      `library.test.ts`'s 300-workout quota grid
- [x] **Task 4 — hook purity & the start-guard extraction**:
      `useArticleReads.ts`'s `has(slug)`+PUT hoisted out of the `setState`
      updater (StrictMode double-fire purity), `markUnread` alongside
      `markRead`, and `useStartWorkout.ts` — WorkoutDetail's own
      unlogged-run/live-MonitorRun staged-confirm start flow extracted so a
      second caller (the no-baseline card) gets the identical guard, never
      a bare navigate-and-start
- [x] **Task 5 — the block and the card**: `StartHere.tsx` (the
      dismissible `START HERE · N OF 4 READ` block, immediate DISMISS, no
      layout reservation once gone) and `BaselineCard.tsx` (the no-baseline
      `SUGGESTED · SETS YOUR BASELINE` card — both-null defaults to the 6k
      with `2K INSTEAD`, exactly-one-null offers only the missing distance
      with no toggle) replacing the entire plan/suggestion apparatus in
      `Today.tsx` while either baseline is missing; the designated
      workouts' own Log screen defaults the plan toggle to outside the plan
- [x] **Task 6 — the two new articles**: `your-first-row` and
      `connect-the-monitor` (`src/news/content/`), original prose,
      fact-checked against 7B's shipped Connect UI, 216/217 words ->
      2 min each by the house formula
- [x] **Task 7 — You, News, and the pin**: `You.tsx`'s `Learning the app`
      settings row (the phase's one real settings row — the mock's others
      stay unbuilt, per DEVIATIONS), `LearningTheApp.tsx` at
      `/you/learning` (`PUT IT BACK ON TODAY`, `MARK ALL FOUR UNREAD` —
      staged, un-reads all four slugs and clears the dismissed flag in one
      tap), and News's own `Start-here` pinned row, visible only while
      dismissed
- [x] **Task 8 — proof, pixels, record**: `e2e/onboarding.spec.ts` — the
      whole fresh-user arc against the real stack (block+card -> a
      cross-surface read from News advancing the count -> the card's own
      START through a real Confirm/Countdown/Timer/Complete/Log/Save loop
      run with null baselines -> the either-null card swap -> the
      apparatus returning once both baselines are set -> DISMISS -> the
      News pin -> `/you/learning`'s PUT IT BACK and MARK ALL FOUR UNREAD
      round-trip, un-reading and un-dismissing and raising News's own
      unread count back), plus the designated-workout exclusion pins
      (SHUFFLE never surfaces `First 6k`/`First 2k` to a baselines-set
      veteran; Library's list omits both). Folded in: the deferred
      `ManualDoorLog` fix (Task 2's ledger item) — the manual door's
      `baselines === null` block now gates on `needsBaselines(steps)`
      instead, so an effort-only workout (the two designated workouts, and
      every shipped effort-only AN sprint) opens the Log screen with null
      baselines rather than the "no target" block a split-ref workout still
      correctly hits. Design sweeps (axe, 44px, contrast — the dashed chip
      measured at 7.432:1) on Today's fresh-user state, `/you/learning`,
      and News-with-pin; `today-onboarding.png` (new) plus `you-learning.png`
      and `news.png` recaptured. Full e2e green ×2 back-to-back (255/255)
      plus unit/client/integration, 98%+ across all four coverage metrics

**Sequencing constraint:** landed after Phase 7B's own `Today.tsx`
guard-wiring touch, as planned; rebased onto `origin/main` immediately
before the PR, clean.

**Exit:** MET — a fresh account with no baseline is walked to a set
baseline without ever leaving Today, using a real effort-only session run
with null baselines end to end (proof, not just unit coverage); dismissing
and resetting the tutorial from You round-trips correctly, including its
cross-surface consequences on News; a baselines-set veteran never sees
either designated workout suggested or listed.

**Next:** Phase 6J (Trend charts on You), below. Also unblocked: the
auto-capture follow-on under "Triggered follow-ons."
