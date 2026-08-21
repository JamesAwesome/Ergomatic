# Phase WU — removing the warm-up (design, 2026-08-21)

**What and why, in plain words.** The app can prepend a warm-up to every
session: a preference on the You screen, a phase the timer runs, a
`WARM-UP` label on the connected surface. James's call on 2026-08-21 is to
remove it entirely. Nobody else in this space models a warm-up, Concept2's
own logbook has no slot for the idea, and the feature costs us a
population disagreement in three separate places — the stored DISTANCE and
TIME totals count the warm-up while the stored step list does not, which
is part of why one saved row can print numbers implying 2:32.7/500 m
beside an AVG SPLIT hero reading 2:08.5. A rower who warms up will keep
warming up; the app simply stops having an opinion about it.

This spec covers the removal only. It is a precondition for Phase RC's
RC-1 and RC-5, which would otherwise be written against a population about
to change.

**Design authority:** ROADMAP Phase WU. **Source review:**
`docs/monitor/pm5-ble-ecosystem-review.md` (reconciled 2026-08-21) and the
antagonist ledger entry of the same date.

## §1 The decision, and the two rulings it reverses

**Approach A of three, chosen by James:** full removal INCLUDING the type
unions, so the compiler enumerates every dependent. The rejected
alternatives were (B) remove the producer and leave the union members
unreachable, which recreates the exact ambiguity 2026-08-09 left behind
and trips recurring failure 5; and (C) B now and A later, which splits one
compile-forcing change into two review cycles over the same files.

Named so nobody restores them as a regression:

1. **The 2026-08-09 warmup-setting spec**
   (`docs/superpowers/specs/2026-08-09-warmup-setting-design.md` and its
   adversarial review), which built this shape deliberately — moving
   warm-ups out of the `Step` union into a single preference, and
   replacing the earlier `warmup_minutes`/`warmup_override` columns.
2. **James's 2026-08-12 connected-mode requirement**, that a rower must be
   able to see a warm-up is NOT a working interval. Shipped, and announced
   to testers (`releaseNotes.ts:165`). This removal dissolves the problem
   rather than regressing it, but the requirement is RETIRED.

## §2 The shape, measured rather than grepped

**The ROADMAP's "37 non-test files" figure is wrong and this section
replaces it.** That number came from grepping the string `warmup`, which
counts comments, historical release notes and CSS. The real shape was
measured by removing each union member and reading `tsc`:

| Union                                           | Errors | Source files | Test files |
| ----------------------------------------------- | ------ | ------------ | ---------- |
| `Phase["type"]` (`domain/expand.ts:12`)         | 30     | 5            | 9          |
| `IntervalType` (`domain/monitor/program.ts:37`) | 77     | 4            | 29         |

**THE TWO UNIONS ARE COMPILE-COUPLED AND CANNOT BE SPLIT INTO TWO TASKS.**
`CompiledPhase`'s own comment says it "Mirrors `Phase["type"]`";
`WorkoutDetail.tsx:275` passes `EnginePhase[]` where `CompiledPhase[]` is
expected, and `src/monitor/enginePhase.compileCompat.test.ts` exists to
pin that mirror. Remove one union without the other and the mirror breaks.
This is the evidence behind the ROADMAP's claim that this is one task; the
claim was previously an assertion.

**Every `Phase["type"]` source site is an unreachable branch, not logic
needing redesign:** `engine.ts:84,91` (the two emissions, which vanish with
`warmupPhases` itself), `logDraft.ts:661`, `summaryModel.ts:787`,
`Timer.tsx:50,66`, `surfaceModel.ts:167`. The `IntervalType` source sites
are `program.ts:526`, `intervalBoundaries.ts:151,239`,
`surfaceModel.ts:260`, `WorkoutDetail.tsx:275`.

**So the true risk profile is a large test-fixture migration, not a
domain-logic change.** Roughly nine source files against roughly thirty
test files. §7 is therefore the most important section in this spec.

## §3 What is removed

**Half one — the type-level removal (compiler-enumerated).** Both union
members; `warmupPhases` and `WARMUP_ESTIMATE_REF`/`WARMUP_ORIGINAL_INDEX`
in `src/session/engine.ts`; and every branch `tsc` names above.

**Half two — the setting (invisible to the compiler, enumerate by grep).**
`WarmupSetting`, declared TWICE and kept in lockstep by hand
(`server/stores/preferences.ts:12` and `src/api/usePreferences.ts:23` —
the client cannot import the server module); `warmup` from
`PreferencesRow` and `PREFERENCES_DEFAULTS`; `src/you/WarmupRow.tsx` (303
lines) and its row in `You.tsx`; the `"warmup" in body` validation at
`routes/data.ts:1281`; the CSS at `index.css:1533-1600` and
`.builder-warmup-line` at `:2841`.

**A documented special case disappears with it, and that is a win worth
stating:** `routes/data.ts:1266-1275` records `warmup` as the ONLY field on
that route needing presence-checked `"warmup" in body` rather than
`!== undefined`, because present-and-null must clear the setting.
Removing warm-ups deletes that special case and the tests pinning it.

**Kept, reworded:** `domain/bulk.ts`'s `droppedWarmupNotice`. A pasted
`wu` line already fails validation (`validate.test.ts:68`) and legacy text
still needs the silent strip plus its count, but the notice must stop
naming a concept the app no longer has.

**Already done, do not redo:** `0008_strip_wu_steps.sql` stripped `wu`
from every stored workout at boot in 2026-08. The workouts table is clean;
the only stored residue is the preferences column.

## §4 The migration: a two-step contract, deliberately unlike its precedent

`0007_shallow_kang.sql` dropped `warmup_minutes` and `warmup_override` in
the same migration that added `warmup jsonb`. **That precedent does not
transfer**, and its own comment says why: those columns were "never
consumed anywhere". This one is consumed.

Migrations run at boot before the API serves a request
(`0008`'s own ordering requirement). Drop the column in the release that
stops reading it, redeploy an older image later, and that bundle's drizzle
select names a column that is gone — preferences 500s until you roll
forward. CLAUDE.md recurring failure 10 already records a `DROP COLUMN`
sequencing that would have broken rollback.

**Therefore, expand/contract:**

- **This release (WU):** every read and write of `warmup` is removed. The
  column STAYS. No migration ships in this phase at all.
- **A later server-touching phase:** `ALTER TABLE "preferences" DROP
COLUMN "warmup";`, one line. **This must land in ROADMAP as an owed
  item in the same commit as this spec**, or it will be forgotten —
  recurring failure 14 in its purest form.

Rollback is safe for the whole window, and the second step costs one line
whenever the next phase touches the server.

## §5 Rows already logged with a warm-up: left exactly as they are

**James's ruling, 2026-08-21: forward-only, no marker, say nothing.**

Establishing the facts first, because two of them contradict what the
ROADMAP originally assumed:

- **A stored step list has NEVER contained a warm-up.** `logDraft.ts:851`
  is `if (seedStep.kind === "warmup") return;`. The ROADMAP's concern that
  "logged rows keep rendering their warm-up" was unfounded — there is
  nothing in the step list to preserve.
- **But the stored TOTALS do include it.** `monitorDistanceMeters`
  (`summaryModel.ts:577-583`) sums every actual with no warm-up filter,
  and `monitorTimeSeconds`'s own comment says "warm-up included". So a
  historical row has totals counting a warm-up beside a step list that
  does not.
- **Recompute is impossible, and that is settled by the schema, not by
  preference.** The row persists `series` and `steps`, never `actuals`,
  and the series carries an `r` REST marker with no warm-up role. Neither
  the totals nor the sample range can be recovered.
- **The affected population is small by construction:** `warmup jsonb` is
  nullable and defaults to null, which means OFF for every row unless a
  rower explicitly switched it on.

Consequence accepted on the record: a pre-WU row's DISTANCE and TIME
include a warm-up, nothing marks it, and such a row compared against
Concept2 would be off by the warm-up. That is the stated cost of
forward-only.

## §6 What the rower loses: nothing is offered in its place

**James's ruling, 2026-08-21.** No replacement copy, no static line on the
workout, no untimed pre-session gate. The app has no opinion on warming
up. This is the does-it-exist question answered against ourselves rather
than against the PM5: the ritual exists, the rower keeps it, the app stops
modelling it.

A release note tells testers the setting is gone. `releaseNotes.ts:120`
and `:165` describe behaviour that was true when shipped and are HISTORY —
do not rewrite them.

## §7 Testing — the most important section

**The failure mode this section exists to prevent:** a sweep across ~30
fixture files invites "fixing" a red test by changing what it ASSERTS
rather than what it CONSTRUCTS. A fixture that built a warm-up phase and
asserted it was excluded from AVG SPLIT must become a fixture that does
not build a warm-up phase — NOT a fixture that keeps building one and
lowers its expectation. **Every fixture edit is a change to the
constructor, and any change to an expected number must be justified in the
PR body by name.**

**Test-first artifact, landed BEFORE any removal.** For a deletion the
compiler drives, so the only thing that can fail meaningfully is a
behavioural pin: a replay against
`docs/monitor/sessions/walk-2026-08-16/session-2-wu-4unequal.jsonl`
capturing today's per-interval numbers for the four WORKING intervals.

**The exit criterion in ROADMAP Phase WU is wrong and this spec corrects
it.** It reads "every judged number for that row unchanged". That cannot
hold and should not: post-WU there is no warm-up phase type, so replaying
that capture constructs five WORK intervals, and AVG SPLIT — which today
excludes the warm-up — correctly moves. The honest criterion is:

> The four working intervals' numbers are byte-identical, and the
> whole-session numbers move by exactly the warm-up's own contribution and
> no more.

That distinguishes a clean removal from one that perturbed the arithmetic.
Correct the ROADMAP line in the same PR as this spec.

**Also required:** per-file coverage on every touched source file, not the
aggregate 90% gate (recurring failure 2); `pnpm e2e` and `pnpm
screenshots`, since `You.tsx` loses a row — **open the changed captures
and look at them** rather than regenerating and committing (recurring
failure 7); and a grep of the removed CSS class names across `src/` and
`e2e/` (recurring failure 5, which has fired three times).

## §8 Exit criteria — written so they can go red

1. No `EnginePhase` and no `CompiledPhase` can carry a warm-up, and `tsc`
   proves it: both union members are gone and the build is green.
2. A replay of `session-2-wu-4unequal` shows the four working intervals'
   numbers byte-identical, and every whole-session number that moved moved
   by exactly the warm-up's own contribution, itemised in the PR body.
3. An already-logged row renders correctly, with its historical totals
   untouched.
4. `PUT /api/prefs` no longer accepts a `warmup` key, and the
   presence-check special case and its tests are gone.
5. A grep of `src/` and `e2e/` finds no orphaned warm-up class name, copy
   string, or comment describing live behaviour.
6. The `warmup` column still EXISTS and is read by nothing; ROADMAP
   carries the owed one-line drop for a later server-touching phase.
7. A release note tells testers the setting is gone; the two historical
   notes are unedited.

## §9 Out of scope, each with its reason

- **Dropping the `warmup` column.** §4's contract; owed to a later phase.
- **RC-5, the three-hero contradiction.** Removing warm-ups shrinks it to
  the rest question but does not close it — Concept2 has no average-split
  field, so that is a rower question with its own answer. It must not be
  closed by citing this spec.
- **Anything in Phase RC.** WU is a precondition, not a down payment.
- **`droppedWarmupNotice`'s existence.** Reworded here, not removed;
  legacy pasted text still needs the strip and the count.

## §10 Risks

- **The fixture sweep lands green and wrong** (§7). Mitigated by the
  constructor rule and by requiring every changed expectation to be named.
- **A grep-only enumeration misses part of half two**, because the
  compiler cannot see it. Mitigated by the explicit file list in §3 and by
  exit criterion 5.
- **The two unions are removed in separate commits**, breaking the mirror
  mid-branch. Mitigated by §2: they land in ONE commit.
- **The owed column drop is forgotten.** Mitigated by landing the ROADMAP
  line in the same commit as this spec, and by exit criterion 6.
