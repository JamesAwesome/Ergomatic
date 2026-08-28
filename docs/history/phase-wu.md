> **Archived 2026-08-28** from `ROADMAP.md` (lines 5316-5519 of the pre-rebalance file, main `39e9430`).
>
> This is the phase as it was written while it ran. It is a RECORD: nothing
> here is scheduled, and its open items were lifted into `ROADMAP.md`'s live
> slate before this file was created. Do not cite it for a live question.

## Phase WU — The warm-up leaves

**Status:** SHIPPED 2026-08-22 — PR #150, main `1602248`, all nine exit
criteria green at the final whole-branch review; James confirmed his own
warm-up setting was OFF, so the removal cost the cohort nothing.
**Decided by James, 2026-08-21**, during the Phase
RC review: "let's just drop warmups. We uniquely do them nobody else
does." Scope chosen the same day, from three costed options: **remove
warm-ups ENTIRELY** — the setting, the preference, the `EnginePhase`
member and every downstream branch — not merely stop programming them to
the PM5. No spec yet.

**What and why, in plain words.** The app prepends a configurable warm-up
to every session. Nobody else in this space models one, Concept2's own
data model has no slot for the idea, and the feature costs us a
population disagreement in three different places. It goes.

**The premise, stated accurately, because it is smaller than it sounds.**
Warm-ups already left the `Step` union on 2026-08-09 (`expand.ts:135-139`:
"no `Step[]` input can produce a `type: \"warmup\"` Phase anymore"). Today
a warm-up is a GLOBAL PREFERENCE (`warmup jsonb` on the preferences row,
`schema.ts:235`), not part of any workout — the 300-workout library
carries exactly one `warmup` occurrence and it is in a test. So this
retires a setting and its downstream, not a concept threaded through the
library.

**What this reverses, named so nobody restores it as a regression:**

1. **The 2026-08-09 warmup-setting spec**
   (`docs/superpowers/specs/2026-08-09-warmup-setting-design.md` and its
   adversarial review), which deliberately built this shape — moving
   warm-ups out of the Step union into a single setting, and replacing the
   earlier `warmup_minutes`/`warmup_override` columns (`schema.ts:228-235`).
2. **James's 2026-08-12 connected-mode requirement**, that the rower must
   be able to see a warm-up is NOT a working interval. Shipped, and
   announced to testers in the release notes
   (`releaseNotes.ts:165`). Removing warm-ups dissolves the problem it
   solved rather than regressing it, but the requirement is retired and
   should be recorded as retired.

**Design authority:**
`docs/superpowers/specs/2026-08-21-warmup-removal-design.md` (2026-08-21).
Approach A of three: full removal INCLUDING both type unions, so the
compiler enumerates every dependent.

**Not fast path, and TRIAD by the standing rule.** Full cycle: a spec, a
full antagonist pass on it, subagent implementation and review, and a PM
final-PR gate.

**Footprint, MEASURED (corrected twice — see the spec's revision 2).**
The original "37 non-test files" was a string grep. The first measurement
then probed the two unions SEPARATELY and misread its own output. Probing
them TOGETHER: **59 errors across 23 files, 7 source and 16 test** —
smaller than either half implies, because 18 files were pure
mirror-breakage noise. `WorkoutDetail.tsx` needs no edit at all.
**But the grep-only half is roughly 65 test and spec files**, so the work
is bigger than any probe says AND less compiler-guided.
**THERE ARE FOUR WARM-UP UNIONS, NOT TWO**, and the two the compiler
cannot see are the ones that matter: `LogSeed.steps[].kind`
(`logDraft.ts:590`) is PERSISTED, and its readers are exactly what keep a
stored record's AVG SPLIT and saved log rows correct. The coupling between
the two compiler-reachable unions is ONE-DIRECTIONAL, so the change could
be split — it lands in one commit by choice, not by necessity.

### What the spec has to answer

- **CORRECTED 2026-08-21: a stored step list has NEVER contained a
  warm-up** (`logDraft.ts:851`, `if (seedStep.kind === "warmup") return;`),
  so this section's original worry about renderers losing a branch was
  unfounded. What IS true: the stored TOTALS include the warm-up
  (`summaryModel.ts:577-583` filters nothing, and `monitorTimeSeconds`'s
  comment says "warm-up included") while the step list does not, and
  recompute is impossible because the row persists `series` and `steps`
  but never `actuals`. **James's ruling: forward-only, no marker, say
  nothing.** Accepted cost: a pre-WU row is off by its warm-up against
  Concept2 and nothing marks it.
- **SETTLED 2026-08-21: expand/contract, two steps.** `0007` dropped the
  two older warm-up columns in one migration, but its own comment says
  that was safe because they were "never consumed anywhere" — this one is
  consumed, migrations run at boot before the API serves a request, and a
  rollback would hit a column that no longer exists. **WU ships NO
  migration:** every read and write goes, the column stays.
- [ ] **OWED to the next server-touching phase: `ALTER TABLE
      "preferences" DROP COLUMN "warmup";`** One line, safe once no
      deployed image reads it. Recorded here rather than in the spec
      because a PR body is not a record (recurring failure 14).
- [ ] **OWED at the first server-touching phase after TWO tags have
      shipped — a countable trigger, replacing "once no pre-WU persisted
      record can plausibly exist" (PM gate 2026-08-21: that trigger is
      unmeasurable by construction, spec §12 concedes the population size
      is unknown, and an unmeasurable trigger never fires). Remove the
      legacy guards.** James's ruling 2026-08-21 keeps two readers of
      the PERSISTED `LogSeed.steps[].kind` union alive (`logDraft.ts`'s
      `buildMonitorLogSteps` skip, `summaryModel.ts`'s
      `warmupIndex`/`monitorAvgSplit` exclusion), plus a default arm on
      `Timer.tsx`'s switches. Without them a rower mid-session at
      update time gets a moved AVG SPLIT on a stored record and a
      `STEP 1 OF 5 · undefined` label. They are deliberate vestigial code
      and they have an expiry.
      **`kind` STAYS THE LITERAL `"warmup" | "work"` union — it is NOT
      widened to `string`** (PM gate, 2026-08-21, overturning this
      bullet's own earlier "retyped `kind: string`" wording, which
      survived into the first draft of the Task 2 brief). Widening admits
      typos, erases the enumeration, and hides this very cleanup from the
      compiler: the literal union is what lets a future implementer grep
      the member and find every site that still reads it. Nothing
      PRODUCES `"warmup"` after Phase WU — `buildLogSeed` cannot — so the
      member is legacy-read-only, not dead.
- **`EnginePhase`'s `"warmup"` member** (`expand.ts:12`) is currently
  unreachable from `Step[]` but still in the union, and `expand.ts:139`
  says every downstream branch is untouched. Removing the member is a
  compile-forcing change across every exhaustive switch. That is a
  FEATURE — the compiler enumerates the work — but it is also why this is
  one task and cannot be split across several.
- **Does any NUMBER change for an existing row?** `judge.ts:78` treats
  warmup alongside effort/rest/test as "no numeric target at all", and
  AVG SPLIT already excludes warm-up phases. If no warm-up phases can
  exist, those exclusions become dead code rather than changed behaviour —
  **but that must be PROVEN by replaying a committed capture that contains
  a warm-up** (`walk-2026-08-16/session-2-wu-4unequal.jsonl` is the one),
  not argued. This is the triad clause.
- **The does-it-exist question, pointed at ourselves.** A rower who warms
  up will still warm up; they just will not do it inside a session. Is
  there now a place where the app says nothing about warming up when it
  used to? Name the gap and decide it deliberately, rather than
  discovering it from a tester.
- **Orphaned UI and CSS.** `you/WarmupRow.tsx` goes, and `index.css` is in
  the touched list — recurring failure 5 is deleting a component and
  leaving its rules behind, three times now. Grep the class names across
  `src/` and `e2e/`.
- **Release notes are history, not state.** `releaseNotes.ts:120` and
  `:165` describe shipped behaviour at the time. Do NOT rewrite them; add
  a new note saying the warm-up is gone.

### The files, so the spec starts from a map

- **Domain:** `expand.ts`, `judge.ts`, `types.ts`, `bulk.ts`,
  `fixtures.ts`, `display/stepDetail.ts`, `generation/patterns.json`,
  `monitor/program.ts` (the warm-up arm, `:512-526`), `monitor/types.ts`,
  `monitor/pm5/commands.ts`
- **Server:** `db/schema.ts` (`warmup jsonb`, `:235`), `routes/data.ts`,
  `stores/logs.ts`, `stores/preferences.ts`
- **Client:** `You.tsx`, `you/WarmupRow.tsx`, `api/usePreferences.ts`,
  Builder (`Builder.tsx`, `builderState.ts`, `BulkImport.tsx`,
  `StepCard.tsx`, `StepEditor.tsx`), session (`draft.ts`, `engine.ts`,
  `intervalBoundaries.ts`, `logDraft.ts`, `summaryModel.ts`,
  `Countdown.tsx`, `Timer.tsx`, `TimerRuler.tsx`, `TimerTargets.tsx`,
  `PostWorkoutSummary.tsx`), `workout/connected/surfaceModel.ts`,
  `monitor/driver.ts`, `monitor/useMonitorSession.ts`,
  `WorkoutDetail.tsx`, `index.css`, `news/content/releaseNotes.ts`

### What it buys Phase RC

- **The program-time warm-up question disappears.** RC's own warm-up
  section exists to decide whether a warm-up should be its own PM5 piece.
  With no warm-ups, there is nothing to decide.
- **RC-5 barely moves — CORRECTED 2026-08-21, quantified.** This
  section originally claimed RC-5 "shrinks to the rest question alone".
  Measured: **WU buys about 5%** (session-2's contradiction goes 24.2 s →
  22.9 s) and **0% on the other exhibit** — the pyramid capture has no
  warm-up at all, so its 39.9 s is untouched. RC-5 was already ~95% the
  rest question. Do not let WU be cited as closing any part of it.
- **RC-1's spec gets simpler**, which is why sequencing matters below.

**Sequencing: WU lands BEFORE RC-1, and must not run concurrently with
Phase LL.** Before RC-1 because otherwise RC-1's spec designs storage and
display for a phase type about to be deleted, and the migration is written
twice. Not concurrent with LL because both edit `useMonitorSession.ts`,
`driver.ts` and `surfaceModel.ts` — no logical dependency, a real merge
hazard. WU has no dependencies of its own, so it is free to go first. The
full worked order lives in Phase RC's "Sequencing across RC, WU and LL".

**Exit: see the spec's §8, which is the ONE list.** Ruling at the
2026-08-21 PM gate — this section previously carried its own (a)-(f), and
clause (b) still demanded "every whole-session number that moved moved by
exactly the warm-up's own contribution" after spec §8 had already called
that clause NOT EVALUABLE (DISTANCE and TIME cannot move; AVG SPLIT is a
re-weighting with no additive contribution). ROADMAP's copy was also
missing the inert-control criterion and the unlogged-record criterion.
**A close gate reads ROADMAP, so two exit lists means closing against the
wrong one.** When a spec writes numbered exit criteria, ROADMAP points at
them and never copies them.

### What this phase taught (2026-08-22)

1. **`app/e2e/` is NOT typechecked.** `tsconfig.app.json` covers only
   `src`, `domain` and `scripts`; Playwright transpiles and erases types
   at run time without ever checking them. A stale 4-argument `buildRun()`
   call compiled and ran silently in an e2e fixture, and a hand-rolled
   `tsc` config scoped to `e2e/` alone surfaces 14 pre-existing errors
   there today. Owner: the next infra-touching phase.
2. **`pnpm e2e -- -g "pattern"` silently runs the FULL suite** — even the
   double-dash form is swallowed; pnpm eats `-g` (its own `--global`) no
   matter where it sits on the command line. The LT-era note prescribing
   the double-dash form (above, PM gate 2026-08-19) was wrong and is now
   corrected in place. **Working form: `pnpm exec playwright test
   --grep`.**
3. **A sweep for an idiom must key on the STRUCTURE, not the operand.**
   The flake investigation's grep for the vulnerable readiness-gate
   pattern keyed on the `title` variable name and missed a sixth instance
   that hardcoded its literal instead of naming a variable — same gate,
   same bug shape, invisible to a search for the operand rather than the
   pattern.
