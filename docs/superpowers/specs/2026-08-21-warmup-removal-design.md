# Phase WU — removing the warm-up (design, 2026-08-21)

**Revision 2, after the phase-open antagonist pass (triad).** That pass
falsified three of revision 1's load-bearing evidence claims and found a
BLOCKING scope gap. Every correction is marked in place rather than
silently applied, because the wrong versions were persuasive and a future
reader deserves to see why.

**What and why, in plain words.** The app can prepend a warm-up to every
session: a preference on the You screen, a phase the timer runs, a
`WARM-UP` label on the connected surface. James's call on 2026-08-21 is to
remove it entirely. Nobody else in this space models a warm-up, Concept2's
own logbook has no slot for the idea, and the concept costs us machinery
in four separate type unions and a row-building path in three screens. A
rower who warms up will keep warming up; the app stops having an opinion
about it.

This spec covers the removal only. It is a precondition for Phase RC's
RC-1 — see §9 for the honest, much smaller, version of what it buys RC-5.

**Design authority:** ROADMAP Phase WU. **Sources:**
`docs/monitor/pm5-ble-ecosystem-review.md` (reconciled 2026-08-21) and the
antagonist ledger entry of 2026-08-21.

## §1 The decision, and the two rulings it reverses

**Approach A of three, chosen by James:** full removal INCLUDING the type
unions, so the compiler enumerates every dependent it can reach. Rejected:
(B) remove the producer and leave union members unreachable, recreating
the exact ambiguity 2026-08-09 left behind; (C) B now and A later,
splitting one compile-forcing change across two review cycles.

**The antagonist pass strengthened this choice rather than weakening it.**
Approach A's premise — force the compiler to find the dependents — is
worth MORE once you know that four unions carry the member and only two
are compiler-reachable (§2). The sites the compiler cannot see are the
argument for making it work everywhere it can.

**What "entirely" means, stated before anyone cites it as something else
(PM gate 2026-08-21).** It is a claim about the PRODUCT: **nothing a rower
can do produces a warm-up.** It is NOT a claim about the code. A database
column (§4), two legacy readers on a persisted union (§5.2), the `wu`-line
paste intercept and `validate.ts:85`'s stored-row guard (§9) all outlive
this phase, each with a stated expiry. Do not let a later phase cite this
removal as proof that no warm-up code exists.

Reversed, named so nobody restores them as a regression:

1. **The 2026-08-09 warmup-setting spec**
   (`docs/superpowers/specs/2026-08-09-warmup-setting-design.md` and its
   adversarial review), which built this shape deliberately.
2. **James's 2026-08-12 connected-mode requirement**, that a rower must be
   able to see a warm-up is NOT a working interval. Shipped and announced
   (`releaseNotes.ts:165`). This removal dissolves the problem rather than
   regressing it, but the requirement is RETIRED.

## §2 The shape, measured — and what measurement cannot reach

### §2.1 Four unions, not two

**BLOCKING FINDING, revision 2.** Revision 1 named two unions. There are
four:

| #   | Union                                                                   | Compiler-reachable?    |
| --- | ----------------------------------------------------------------------- | ---------------------- |
| 1   | `Phase["type"]` (`domain/expand.ts:12`)                                 | yes                    |
| 2   | `IntervalType` (`domain/monitor/program.ts:37`)                         | yes                    |
| 3   | **`LogSeed.steps[].kind`** (`src/session/logDraft.ts:590`)              | **NO — and PERSISTED** |
| 4   | `IntervalSegments`'s `kinds` (`src/components/IntervalSegments.tsx:24`) | NO                     |

Union 3 is the dangerous one, and the codebase already warned us.
`logDraft.ts:583-589`'s own comment: _"this seed is PERSISTED (a stored
`MonitorRun` written before that change still carries it and nothing else)
… A later pass may retire it; **doing so is a stored-shape migration, not
a comment sweep**."_

**Its two readers are exactly the ones protecting stored numbers**, and
neither appears in any typecheck output:

- `logDraft.ts:851` — `if (seedStep.kind === "warmup") return;` — why a
  saved log has no warm-up row.
- `summaryModel.ts:563-564` — `warmupIndex()`, reading
  `run.logSeed?.steps.findIndex((s) => s.kind === "warmup")`, consumed at
  `:624` so `monitorAvgSplit` excludes the warm-up, and at `:664`.

Union 4's sibling hazard: `Timer.tsx`'s `segmentKind` keeps `"wu"` in its
RETURN type after the case is deleted.

**Therefore the safety argument must be stated honestly.** "The compiler
enumerates every dependent" is FALSE. The true statement is: _the compiler
enumerates unions 1 and 2; unions 3 and 4, and the whole setting half, are
found by grep and by this spec's explicit lists, and they are
disproportionately the sites that touch stored numbers._ §10's mitigation
is rewritten accordingly.

### §2.2 The compile probe, run correctly

**CORRECTION.** Revision 1 claimed removing union 1 alone errors at
`WorkoutDetail.tsx:275`, and used that as proof the two unions cannot be
split. **It does not.** That error came from the union-2 probe; revision 1
conflated its two probe outputs. Re-measured:

| Probe                 | Errors      | Files  | Source | Test   | `WorkoutDetail.tsx`? |
| --------------------- | ----------- | ------ | ------ | ------ | -------------------- |
| A — union 1 only      | 29 distinct | 15     | 5      | **10** | **no**               |
| B — union 2 only      | 77          | 33     | 4      | 29     | yes                  |
| **C — both together** | **59**      | **23** | **7**  | **16** | **no**               |

**The coupling is ONE-DIRECTIONAL.** Shrink `Phase["type"]` first and
`EnginePhase` becomes a SUBSET of `CompiledPhase` — still assignable.
Shrink `IntervalType` first and it is not. So the change _could_ be split,
in the order union 1 → union 2.

**It still lands in ONE commit**, for two reasons that are now evidenced
rather than asserted: the intermediate state recreates the 2026-08-09
unreachable-member ambiguity this phase exists to end, and C is SMALLER
than either half implies — 18 of probe B's files were pure
mirror-breakage noise that never needs touching. **`WorkoutDetail.tsx`
needs no edit at all** under the chosen approach; revision 1 listed it as
a source site and that was a false positive on the implementer's map.

**Revision 1's ratio was wrong in both directions.** Compiler-flagged is
**7 source / 16 test**, not "~9 / ~30". But the grep-only half is far
larger: roughly **65 test and spec files** carry `warmup` or `wu`. The
work is bigger than revision 1 said AND less compiler-guided.

### §2.3 The compiler-reachable source sites

Union 1: `engine.ts:84,91` (the emissions, gone with `warmupPhases`),
`logDraft.ts:661`, `summaryModel.ts:787`, `Timer.tsx:50,66`,
`surfaceModel.ts:167`. Union 2: `program.ts:526`,
`intervalBoundaries.ts:151,239`, `surfaceModel.ts:260`.

Each is an unreachable branch once nothing can produce a warm-up — with
the §5.2 exception, which is the whole reason that section exists.

## §3 What is removed — the complete list

Revision 1's list was materially incomplete. The additions below came from
the antagonist pass and are not optional extras; an implementer working
from revision 1 would have left live code behind.

**Type-level (unions 1 and 2):** both members; `warmupPhases`,
`WARMUP_ESTIMATE_REF`, `WARMUP_ORIGINAL_INDEX` in `src/session/engine.ts`;
every site in §2.3.

**The row machinery — `summaryModel.ts`, and it is far more than `:787`:**
`isWarmup` on **two exported row types** (`:190`, `:263`), `warmupIndex`
(`:563-564`, but see §5.2), `monitorWarmupRow` (`:663-682`),
`timerWarmupRow` (`:786-806`), the consumption sites (`:624`, `:714`,
`:739`) and both row-prepend sites (`:925-927`).

**Rendering:** `PostWorkoutSummary.tsx:179-191` (the row, its
`aria-label`, `.summary-row-warmup*`); `TimerRuler.tsx:104,133,160,186-189`
(`warmupPercent`/`warmupFillPercent`, the three-tone total bar);
`PaneGrid.tsx:185`'s `row.ordinal === null ? "WU"` arm;
`IntervalSegments.tsx:24` and `Timer.tsx`'s `segmentKind` return type.

**Types carrying a warm-up FIELD, not a branch:**
`intervalBoundaries.ts:78,238-241`'s `warmupEndsAt` on an exported type;
`storedSummary.ts:280,302`'s `isWarmup: false`.

**Call sites:** `Countdown.tsx:211,229` and `WorkoutDetail.tsx:272` (the
two `buildRun` warm-up arguments); `draft.ts:139-173,195`'s
`stripLegacyWarmups`; `Builder.tsx:6,103-109,585,597-598`'s
`warmupHintText()` and its render (self-hiding when OFF, so no product
gap).

**The setting half (compiler-invisible; enumerate by grep):**
`WarmupSetting`, declared TWICE and kept in lockstep by hand
(`server/stores/preferences.ts:12`, `src/api/usePreferences.ts:23`);
`warmup` on `PreferencesRow` and `PREFERENCES_DEFAULTS`;
`src/you/WarmupRow.tsx` (303 lines) and its row in `You.tsx`;
`routes/data.ts:1281`'s validation and `:65-91`'s six `WARMUP_*_MIN/MAX`
constants plus `isValidWarmup`, mirrored at `WarmupRow.tsx:19-24`.

**An API decision revision 1 missed:** `data.ts:808` returns
`droppedWarmups` as a RESPONSE field. API changes are additive-only
between tags (docs/RELEASING.md). **Decide explicitly:** keep the field
and its count, or remove it and accept a non-additive change. Recommended:
keep it; the paste path still needs the count (§9).

**CSS — revision 1's range was WRONG and following it corrupts the file.**
The block runs **1533-1596**; 1597 is blank; **1598-1600 opens the
unrelated `.learning-progress-*` comment.** Three further regions:
`index.css:4166-4211` (`.timer-total-warmup` — note `PaneGrid.test.tsx:1205`
holds a negative guard that becomes VACUOUS when the class dies, so
retarget or delete it deliberately), `:8603-8608`
(`.summary-row-warmup-label`), `:3393-3401`, and `.builder-warmup-line`
at `:2841`. `.summary-row-warmup` is applied in TSX with **no rule at
all** — a pure test hook.

**DO NOT TOUCH, and the ROADMAP's file map points an implementer straight
at it:** `domain/generation/patterns.json`. Its own
`_meta.cellsAreWarmupInclusive` records that the 2026-08-09 drop _"neither
changed that nor orphaned those stats — the 2026-08-10 library-rebalance
spec §6 depends on them"_. Likewise `scripts/library-warmups-before.json`
and `library-moves.ts`. These are historical generation statistics, not
live warm-up code.

**Already done, do not redo:** `0008_strip_wu_steps.sql` stripped `wu`
from every stored workout at boot. The workouts table is clean.

## §4 The migration: expand/contract, with the right precedent

**CORRECTION.** Revision 1 justified this by quoting a comment in
`0007_shallow_kang.sql` saying the dropped columns were "never consumed
anywhere". **That comment does not exist** — the file is three lines of
SQL. The text is `schema.ts:228-231`, and it says the OPPOSITE: _"the
**override** was never consumed anywhere; **minutes' one consumer, the
Builder hint, is rewritten against this column**."_ `git show dad9643 --
app/server/stores/preferences.ts` removes both fields from the drizzle
select in the same commit as the migration. **`0007` is an instance of the
hazard revision 1 cited it as a counterexample to.**

**The repo's real precedent is the `num` retirement**, `f0a2166` →
`16ded6c`, whose message spells out this contract: _"Release (a) removed
num from schema.ts and deployed green, so no running image selects the
column anymore."_ Follow that.

The conclusion is unchanged and better founded:

- Drizzle emits a **named column list** including `"warmup"`, never
  `SELECT *`, on the read path; `put()` names it on the write path too. An
  old image breaks on both verbs.
- Migrations are awaited at boot before `listen` (`server/index.ts:28`
  and `:119`), single-replica compose.
- `stores.preferences.get()` has **four** callers including
  `GET /api/today` (`data.ts:1426`) — the blast radius is Today, not just
  You.
- **The rollback reports healthy.** Measured against postgres:18.4 with
  all twelve migrations then a manual `DROP COLUMN`: `GET`/`PUT
/api/prefs` both 500 with `42703`, while `select 1` still succeeds — so
  `/api/health` (`app.ts:49-61`) is green. `scripts/deploy.sh:22-30` rolls
  back by `git checkout --force $PREV` plus rebuild, i.e. an old SERVER,
  and would print "healthy" over a dead preferences path.

**Therefore:**

- **This release (WU): no migration at all.** Every read and write of
  `warmup` goes; the column stays.
- **A later server-touching phase:** `ALTER TABLE "preferences" DROP
COLUMN "warmup";`. Already recorded as an unchecked ROADMAP item at
  Phase WU, per recurring failure 14.

## §5 Stored records — TWO populations, not one

### §5.1 Rows already logged: left exactly as they are

**James's ruling: forward-only, no marker, say nothing.** The facts, two
of which correct the ROADMAP's original assumptions:

- **A stored step list has NEVER contained a warm-up**
  (`logDraft.ts:851`; `storedSummary.ts:50-56`). Nothing to preserve.
- **The stored TOTALS include it** — `monitorDistanceMeters`
  (`summaryModel.ts:577-583`) is unconditional over `run.actuals`, and
  `monitorTimeSeconds`'s comment says "warm-up included".
- **Recompute is impossible AND moot.** A logged row's heroes are stored
  COLUMNS (`storedSummary.ts:217-223` reads `row.avgSplitSeconds`,
  `timeSeconds`, `distanceMeters`), untouchable by any code change.
- The population is narrow: `warmup jsonb` is nullable with no default, so
  OFF unless explicitly switched on.

Accepted on the record: a pre-WU row's DISTANCE and TIME include a
warm-up, nothing marks it, and such a row compared against Concept2 is off
by the warm-up.

### §5.2 Records persisted but NOT YET logged — the guards stay

**BLOCKING FINDING, revision 2. Revision 1 missed this population
entirely.** `MonitorRun` and `SessionRun` both persist to localStorage
under deliberately shallow validators with no version bump and no strip
(`run.ts:74-90`'s `isSessionRun` is essentially
`Array.isArray(value.phases)`). A pre-WU UNLOGGED record survives the
update and is still read by live code.

Taking §2.3's "unreachable branch" instruction literally would, on such a
record:

| Deleted                                | Effect                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------- |
| `summaryModel.ts:564` `warmupIndex`    | AVG SPLIT silently gains the warm-up — **a judged number changing on a stored record** |
| `logDraft.ts:851` guard                | the warm-up becomes an extra SAVED log row                                             |
| `Timer.tsx:50,66` cases                | `phaseKindWord("warmup")` → `undefined`, rendering **`STEP 1 OF 5 · undefined`**       |
| `summaryModel.ts:787` `timerWarmupRow` | the measured warm-up row vanishes while its metres stay in DISTANCE/TIME               |

**Stripping on load is NOT available.** `logDraft.ts`'s seed aligns
index-for-index with the program intervals — its own comment calls that
"the alignment contract" — so removing an entry breaks alignment.

**James's ruling, 2026-08-21: keep the guards as explicit legacy
readers.**

- KEEP union 3's two readers (`logDraft.ts:851`, `summaryModel.ts:564`).
  **CORRECTED at the PM gate: keep the LITERAL UNION
  (`kind: "warmup" | "work"`) with the `"warmup"` member commented
  legacy-only — do NOT widen it to `kind: string`.** Widening a persisted
  discriminant admits typos (`"warmUp"` would compile), erases the
  enumeration a future implementer needs, and makes the owed cleanup
  invisible to the compiler. A stored shape legitimately carries values no
  current producer emits; that is what a stored shape is FOR, and it is
  not the 2026-08-09 unreachable-member ambiguity Approach A exists to
  end.
- Give the `Timer.tsx` switches a DEFAULT arm rather than deleting the
  cases blind. **An exhaustive switch with no default is a runtime
  `undefined` generator the moment its union shrinks underneath it.**
- **Owed, and it goes in ROADMAP not just here:** remove the legacy
  guards once no pre-WU persisted record can plausibly exist.

Nothing renders `undefined`, no stored record's judged number moves, and
nobody loses an in-flight session.

## §6 What the rower loses: nothing is offered in its place

**James's ruling.** No replacement copy, no static line, no untimed gate.

**CORRECTION.** Revision 1 said the only user-facing strings were
historical release notes. **One live surface is instructional, not
historical:** `news/content/bodies/yourFirstRow.tsx:13-14` is evergreen
onboarding — _"Warm up for ten minutes first. Warm-ups are a setting now:
set yours on the You tab under WARM-UP and every session, this one
included, will start with it."_ Two more live strings become lies:
`validate.ts:85` (_"Warm-ups moved to Settings. Set yours on the You
tab."_) and `bulk.ts:362` (_"Warm-ups are a setting now."_). All three
must be rewritten — an instruction naming a deleted control is recurring
failure 13 aimed at a tester.

**But "no replacement feature" must not silence the question a tester
asks in the first thirty seconds (PM gate 2026-08-21): "where did WARM-UP
go, and how do I warm up now?"** There is a true, cheap answer this spec
originally never stated: **build it into the workout as an ordinary first
step.** The grammar already supports it; only the `wu` keyword goes. That
sentence belongs in the release note alongside "the setting is gone" — a
note that only announces a deleted control is the note that generates the
question.

**`yourFirstRow.tsx:13-14` is a SURGICAL edit, not a deletion.** Keep
"Warm up for ten minutes first." — evergreen, still true, and the point of
the paragraph. Delete only "Warm-ups are a setting now: set yours on the
You tab under WARM-UP and every session, this one included, will start
with it." Stated explicitly because an implementer sweeping instructional
strings will otherwise cut the advice along with the mechanism.

Today and `ConnectedInterstitial` carry no warm-up reference; §6 holds
there.

A new release note says the setting is gone. `releaseNotes.ts:120`,
`:165` **and `:204`** (revision 1 named two of three) are HISTORY — do not
rewrite them.

## §7 Testing — the most important section

**The failure mode this exists to prevent:** a sweep across dozens of
fixtures invites "fixing" a red test by changing what it ASSERTS rather
than what it CONSTRUCTS. A fixture that built a warm-up phase and asserted
it was excluded from AVG SPLIT must become one that does not build a
warm-up phase — NOT one that keeps building it and lowers its
expectation. **Every fixture edit changes the constructor. Any changed
expectation must be justified by name in the PR body.**

**Test-first artifact, before any removal:** replay pins on BOTH captures
named in §8 — the mover and the control.

**Attacked and held, so the fixture edit is safe:** retyping the capture's
first interval `work` reproduces the recorded tx bytes exactly.
`program.ts:524-531`'s warm-up arm exists solely to null `targetSplit`,
and `commands.ts:183` then sends the `NO_TARGET_PACE_SECONDS = 0`
sentinel — identical to an effort or test interval. `divergences` stays
empty.

**Also required:**

- Per-file coverage on every touched source file, not the aggregate gate.
- `pnpm e2e` and `pnpm screenshots`. **Five committed screenshots must be
  DELETED, not regenerated** (`you-warmup-on`, `timer-warmup`,
  `timer-warmup-landscape`, `connected-pane-live-warmup`,
  `connected-pane-live-warmup-landscape`); three change (`you`,
  `countdown`, `post-workout-summary`, plus landscapes). Open the changed
  ones and look at them.
- **Four frozen e2e fixtures carry `WARM-UP`/`WU`** and need retargeting.
- **`docs/design/DEVIATIONS.md` rows 17, 18, 94, 95, 99 and 103 describe
  live warm-up behaviour** — reconcile them (recurring failure 9).
- Grep removed CSS class names across `src/` and `e2e/`, and note
  `PaneGrid.test.tsx:1205`'s guard goes vacuous.

## §8 Exit criteria — written so they can go red

**CORRECTION.** Revision 1's clause "every whole-session number moved by
exactly the warm-up's own contribution" is **not evaluable**, and two of
its three terms cannot move at all. Decoded from all five 0x0037/0x0038
records of `session-2-wu-4unequal.jsonl`: DISTANCE is 1599 m and TIME is
8:08.4 **both ways** — neither producer consults warm-up-ness. The sole
mover is AVG SPLIT, and it moves by a RE-WEIGHTING, not an additive
contribution. Name the number instead:

1. No `EnginePhase` and no `CompiledPhase` can carry a warm-up; `tsc` is
   green with both members gone.
2. **The mover.** Replaying `session-2-wu-4unequal` with its first
   interval retyped `work`: the four working intervals' rows are
   byte-identical; **DISTANCE stays 1599 m; TIME stays 8:08.4; AVG SPLIT
   reads 2:09.8** (500·Σt/Σd over all five, up from 2:08.5); the log
   gains a fifth row for the 100 m piece.
3. **The inert control** — missing from revision 1, and its absence was
   the ledger's oracle-blindness shape, since the only named capture was
   the one that MUST change. Replaying
   `session-1-keystone-2x250r0` changes **nothing at all**.
4. A pre-WU record persisted but unlogged still renders its correct AVG
   SPLIT and no `undefined` step label (§5.2).
5. An already-logged row renders correctly, historical totals untouched.
6. `PUT /api/prefs` rejects a `warmup` key; the presence-check special
   case and its tests are gone.
7. No orphaned warm-up class name, live-behaviour comment, or
   instructional string survives a grep of `src/` and `e2e/`; DEVIATIONS
   rows 17/18/94/95/99/103 reconciled.
8. The `warmup` column still EXISTS and is read by nothing; ROADMAP
   carries the owed drop and the owed legacy-guard removal.
9. A release note says the setting is gone; the three historical notes are
   unedited.

## §9 Out of scope, each with its reason

- **Dropping the `warmup` column** — §4's contract; owed to a later phase.
- **Removing the §5.2 legacy guards** — owed once no pre-WU record can
  exist.
- **RC-5.** **CORRECTION, quantified:** revision 1 and the ROADMAP both
  say WU "shrinks RC-5 to the rest question alone". Measured, **WU buys
  about 5%**: session-2's contradiction goes 24.2 s → 22.9 s. And it buys
  **0%** on the other exhibit — the pyramid capture
  (`walk-2026-08-18-metrics`, `w 300m · w 700m · w 300m`) has no warm-up
  at all, so its 39.9 s is untouched. RC-5 was already ~95% the rest
  question. It must not be closed by citing this spec.
- **Anything else in Phase RC.** WU is a precondition, not a down payment.
- **`droppedWarmupNotice`.** Kept and reworded. **CORRECTION to revision
  1's reason**, which was false: a pasted `wu` line does NOT reach
  `validateSteps`. `bulk.ts:334-339`'s `tryParseWarmupLine` intercepts a
  well-formed `wu N`, increments the count and `continue`s BEFORE
  `parseStepLine` builds a Step; `validate.test.ts:59-69` calls the
  validator directly with a hand-built step, which is a stored-row path.
  The paste produces the NOTICE, not an error. **Stated correctly so an
  implementer does not delete the strip as redundant.** (`bulk.ts:63-66`'s
  own comment is also stale — it claims `draft.ts` imports the notice; it
  does not.)
- **`patterns.json` and the library-generation statistics** — §3.

## §10 Risks, with revision 1's unsound mitigation replaced

- **The compiler does NOT enumerate the dangerous half.** Revision 1
  mitigated scope risk with "Approach A forces the compiler to find
  everything". False (§2.1). Replaced by: §3 is an explicit list, §2.1
  names all four unions, and exit criterion 7 is a grep.
- **The fixture sweep lands green and wrong** (§7). Mitigated by the
  constructor rule and by naming every changed expectation.
- **A stored record's judged number moves silently** (§5.2). Mitigated by
  the legacy guards and exit criterion 4.
- **Following §3's CSS line numbers corrupts an unrelated block.**
  Mitigated by the corrected ranges; verify the neighbours before cutting.
- **The unions are removed in separate commits**, breaking the mirror
  mid-branch. Mitigated by §2.2: one commit.
- **`patterns.json` gets "cleaned"** because the ROADMAP's file map lists
  it. Mitigated by §3's DO NOT TOUCH.
- **The owed items are forgotten.** Both are ROADMAP lines, not PR-body
  lines.

## §11 Phase WU's VETTED GROUND

Attacked in the 2026-08-21 anchor pass and held. Later specs in this phase
inherit these and need not re-establish them:

1. A stored step list has never contained a warm-up.
2. Recompute of a logged row is impossible and moot — its heroes are
   stored columns.
3. No judged number changes for a session that never had a warm-up:
   `warmupIndex` → -1, both row builders → null, `warmupEndsAt` → null,
   and DISTANCE/TIME were never conditional.
4. Expand/contract, with no migration in WU.
5. Migrations are awaited at boot before `listen`, single-replica compose.
6. `warmup jsonb` is nullable, no default, no CHECK, OFF by default.
7. Approach A over B and C — strengthened by the compiler-invisible
   unions, not weakened.
8. The replay stays byte-faithful after the fixture edit (§7).
9. WU before RC-1 — **for the ROADMAP's reason** (`:2542-2555`: the
   program-time "should a warm-up be its own PM5 piece" question
   disappears), not revision 1's weaker "written against a population
   about to change". RC-1's own interval `type` comes from 0x0037 offset
   16, the machine's dimension, unrelated to our role.
10. WU must not run concurrently with Phase LL.
11. The owed `DROP COLUMN` really is in ROADMAP (`:2773-2776`).

## §11.5 Release posture (PM gate, 2026-08-21)

**No tag for WU alone.** A removal has nothing a tester can try, so a solo
tag is a version number with no falsification value. WU is a MINOR clause
riding whatever tag carries Phase LL's brick fix.

## §12 Open, could not be established by the pass

- What `GET /api/today` returning 500 does on screen. There is **no
  `ErrorBoundary` anywhere in `app/src/`**. Worth one probe before the
  later phase drops the column.
- Whether a pre-WU image's `migrate()` boots cleanly against a post-drop
  database. Forward-only, so expected, but unrun.
- The size of the §5.2 in-flight population. Mechanism proven, incidence
  unknown — which is why the ruling is to guard rather than to measure.
