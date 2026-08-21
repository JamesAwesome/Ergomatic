# Phase WU — Warm-up Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the warm-up from Ergomatic entirely, so that nothing a
rower can do produces a warm-up phase.

**Architecture:** Approach A — delete the two compiler-reachable warm-up
union members so `tsc` enumerates every dependent, then remove the setting
that produced them. Two further unions are invisible to the compiler; one
is PERSISTED and its readers stay as documented legacy guards. No database
migration ships in this phase.

**Tech Stack:** TypeScript 6, React 19, Vite, Express 5, Drizzle/Postgres,
Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-21-warmup-removal-design.md`
(revision 2). **Read it before Task 1.** This plan argues from it and does
not restate its evidence.

## Global Constraints

- **SDLC:** all work in a git worktree, never the main checkout. Run
  `git rev-parse --show-toplevel` before EVERY commit and confirm it
  prints the worktree path. Never merge; present and stop.
- **Read `.claude/agent-briefing.md` before starting.**
- **TDD:** failing test first, every task.
- **pnpm only. ESM only.** Server imports use `.js` extensions.
- **No em-dashes in user-facing strings** (periods, colons, middle dots).
- **`pnpm e2e` is mandatory if the diff touches `app/src/`** — it gates CI
  and this diff touches it heavily. `pnpm screenshots` too.
- **Per-file coverage** on every touched source file. The 90% gate is
  repo-wide and will not catch a newly-uncovered branch.
- **DO NOT TOUCH** `app/domain/generation/patterns.json`,
  `scripts/library-warmups-before.json`, or `library-moves.ts`. Their
  `warmupMinutes` statistics are historical generation data the
  2026-08-10 library rebalance depends on. The ROADMAP's older file map
  points at `patterns.json`; that reference is wrong.
- **Do not rewrite historical release notes** (`releaseNotes.ts:120`,
  `:165`, `:204`). They describe behaviour that was true when shipped.

---

## The one asymmetry that will cause a wrong edit

Two of the four warm-up unions are PERSISTED, and they are treated
DIFFERENTLY. Getting this backwards either ships a wrong number or leaves
dead code:

| Union                         | Where                                    | This plan                                                                                                                                                                                                                                               |
| ----------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. `Phase["type"]`            | `domain/expand.ts:12`                    | **DELETE the member.** A legacy persisted `SessionRun` degrades gracefully: its measured warm-up row vanishes while its metres stay in the totals. Accepted by spec §5.2. The ONLY protection needed is a `default` arm so nothing renders `undefined`. |
| 2. `IntervalType`             | `domain/monitor/program.ts:37`           | **DELETE the member.**                                                                                                                                                                                                                                  |
| 3. `LogSeed.steps[].kind`     | `src/session/logDraft.ts:590`            | **KEEP the member and both readers**, commented legacy-only. This one is PERSISTED on `MonitorRun` and its readers are what keep a stored record's AVG SPLIT and saved log rows correct.                                                                |
| 4. `IntervalSegments` `kinds` | `src/components/IntervalSegments.tsx:24` | **DELETE `"wu"`**, and delete it from `Timer.tsx`'s `segmentKind` RETURN type too — the return type keeps `"wu"` after the case goes.                                                                                                                   |

**Union 3 is why `warmupIndex` (`summaryModel.ts:563-564`) and the guard at
`logDraft.ts:851` SURVIVE this phase**, along with
`monitorAvgSplit`'s `wuIndex` skip at `:624`. For a post-WU run
`warmupIndex` returns `-1` and skips nothing, which is correct. Deleting
them moves a stored record's AVG SPLIT.

---

## File Structure

**Task 1 creates:** `app/src/session/warmupRemoval.replay.test.ts` — the
two behavioural pins, following this repo's replay-harness convention (an
independently-typed re-derivation, never an import from another test file
— see `connectedMetricsReplay.test.ts`'s own header).

**Task 2 modifies (source):** `domain/expand.ts`,
`domain/monitor/program.ts`, `src/session/engine.ts`,
`src/session/logDraft.ts`, `src/session/summaryModel.ts`,
`src/session/Timer.tsx`, `src/session/TimerRuler.tsx`,
`src/session/Countdown.tsx`, `src/session/draft.ts`,
`src/session/intervalBoundaries.ts`,
`src/workout/connected/surfaceModel.ts`,
`src/workout/connected/PaneGrid.tsx`, `src/workout/WorkoutDetail.tsx`,
`src/components/IntervalSegments.tsx`, `src/log/storedSummary.ts`,
`src/session/PostWorkoutSummary.tsx`, `src/builder/Builder.tsx`.
**Task 2 also modifies every red test fixture** — same commit, because
`tsc -b` covers tests and the pre-commit hook runs typecheck.

**Task 3 modifies (the setting):** `server/stores/preferences.ts`,
`server/routes/data.ts`, `src/api/usePreferences.ts`, `src/You.tsx`,
`src/index.css`. **Deletes:** `src/you/WarmupRow.tsx`.

**Task 4 modifies (copy and evidence):**
`src/news/content/bodies/yourFirstRow.tsx`, `domain/validate.ts`,
`domain/bulk.ts`, `src/news/content/releaseNotes.ts`,
`docs/design/DEVIATIONS.md`, e2e fixtures, `docs/screenshots/`.

---

### Task 1: The two replay pins

Test-first artifact. For a deletion the compiler drives, so these pins are
the only thing that can fail meaningfully. **They land GREEN against
today's code**, then Task 2 must keep the control green and flip the mover
to its stated new value.

**Files:**

- Create: `app/src/session/warmupRemoval.replay.test.ts`
- Reads: `docs/monitor/sessions/walk-2026-08-16/session-2-wu-4unequal.jsonl`
- Reads: `docs/monitor/sessions/walk-2026-08-16/session-1-keystone-2x250r0.jsonl`

**Interfaces:**

- Consumes: `buildSurfaceModel` / `summaryModel`'s exported builders, and
  `EnginePhase` from `src/session/engine`. Copy the harness shape from
  `src/monitor/connectedMetricsReplay.test.ts` — do NOT import from it.
- Produces: nothing. This file is a pin, not a fixture other tasks use.

- [ ] **Step 1: Read the existing harness so the pin matches house style**

Read `app/src/monitor/connectedMetricsReplay.test.ts` in full, especially
its header (why it re-derives rather than imports) and its
`SESSION_2_PROGRAM` / `CM_PHASES` literals at `:86` and `:147`. Your new
file mirrors that structure against the summary model rather than the
surface model.

**You write the harness helper the steps below call.** It is not exported
by anything — no test file in `src/monitor/` imports another test file, by
this repo's own convention. Its signature:

```ts
/** Replays one committed capture's rx frames through the real driver and
 *  returns the summary model the app would store. `capture` is the parsed
 *  JSONL; `program` and `phases` are the hand-built literals for that
 *  session, exactly as `connectedMetricsReplay.test.ts` builds its own. */
function buildSummaryForCapture(capture: {
  path: string;
  program: WorkoutProgram;
  phases: EnginePhase[];
}): SummaryModel;
```

Build `SESSION_2` and `SESSION_1` as module constants of that shape.

- [ ] **Step 2: Write the MOVER pin, asserting TODAY's values**

`session-2-wu-4unequal` today has a warm-up as interval 0. Assert the
three heroes and the row count as they are NOW:

```ts
// The MOVER. Today interval 0 is a warm-up and AVG SPLIT excludes it.
// Phase WU retypes it `work`; this pin exists so that change is visible
// and deliberate rather than silent. Post-WU expectations are in the
// same file, skipped, and swapped in by Task 2 — see the block below.
it("session-2: today's heroes, with the warm-up excluded from AVG SPLIT", () => {
  const summary = buildSummaryForCapture(SESSION_2);
  expect(summary.hero.distanceMeters).toBe(1599);
  expect(summary.hero.timeSeconds).toBeCloseTo(488.4, 1);
  expect(summary.hero.avgSplitSeconds).toBeCloseTo(128.467, 2); // 2:08.5
  expect(summary.rows.filter((r) => r.measured)).toHaveLength(5); // 1 wu + 4 work
});
```

- [ ] **Step 3: Write the CONTROL pin**

`session-1-keystone-2x250r0` has NO warm-up. It must be inert across the
whole phase. **Its absence from the original exit criteria was the
oracle-blindness shape — the only named capture was the one that must
change.**

```ts
// The INERT CONTROL. No warm-up anywhere in this capture, so every number
// here must be byte-identical before and after Phase WU. If this moves,
// the removal perturbed arithmetic it had no business touching.
it("session-1 keystone: nothing changes, before or after WU", () => {
  const summary = buildSummaryForCapture(SESSION_1);
  expect(summary.hero.distanceMeters).toBe(KEYSTONE_DISTANCE);
  expect(summary.hero.timeSeconds).toBeCloseTo(KEYSTONE_TIME, 1);
  expect(summary.hero.avgSplitSeconds).toBeCloseTo(KEYSTONE_AVG, 2);
});
```

Derive `KEYSTONE_*` by running the harness once and reading the actual
values — then paste them as literals with a comment recording that they
were measured, not chosen. **Do not assert a value you have not observed.**

- [ ] **Step 4: Run both pins and confirm they PASS against today's code**

Run: `cd app && pnpm test --project unit -- warmupRemoval.replay`
Expected: PASS. These pin current behaviour; they are not red-first tests.
If the mover's AVG SPLIT is not ~128.467, STOP — the spec's arithmetic is
wrong and the phase needs re-gating before any removal.

- [ ] **Step 5: Commit**

```bash
git rev-parse --show-toplevel   # MUST print the worktree path
git add app/src/session/warmupRemoval.replay.test.ts
git commit -m "test: pin the two captures Phase WU must and must not move"
```

---

### Task 2: Remove both compiler-reachable unions, in ONE commit

**One commit is not stylistic.** `tsc -b` covers tests and the pre-commit
hook runs typecheck, so the tree is red until every source branch AND
every fixture is fixed. A partial commit cannot land.

**Files:** every source file in "Task 2 modifies" above, plus every red
test file.

**Interfaces:**

- Consumes: Task 1's pins (they must stay green except the one documented
  flip).
- Produces: `buildRun(draft, baselines, now)` — the fourth `warmup?`
  parameter is GONE. Task 3 relies on that signature.

- [ ] **Step 1: Delete the producer**

`src/session/engine.ts` — delete `warmupPhases` (`:76-112`),
`WARMUP_ESTIMATE_REF` (`:40`), `WARMUP_ORIGINAL_INDEX`, the
`...warmupPhases(warmup, baselines),` spread at `:170`, and the `warmup?:
WarmupSetting | null` parameter at `:165`.

- [ ] **Step 2: Delete both union members and let tsc enumerate**

```ts
// domain/expand.ts:12
type: "work" | "rest" | "test";

// domain/monitor/program.ts:37
export type IntervalType = "work" | "test";
```

Run: `cd app && pnpm exec tsc -b --pretty false 2>&1 | grep "error TS"`
Expected: ~59 errors across ~23 files. **That list is your worklist.**

- [ ] **Step 3: Fix the source branches — delete, do not redesign**

Every one is an unreachable branch. Delete the `case "warmup":` arms in
`Timer.tsx:50,66` and `surfaceModel.ts:167`; delete the comparisons at
`logDraft.ts:661` and `summaryModel.ts:787`'s `timerWarmupRow`;
`program.ts:526`; `intervalBoundaries.ts:151,239` and its `warmupEndsAt`
FIELD at `:78,238-241`; `surfaceModel.ts:260`.

Then the grep-only source sites the compiler will NOT name:
`summaryModel.ts`'s `isWarmup` on both exported row types (`:190`, `:263`),
`monitorWarmupRow` (`:663-682`), both row-prepend sites (`:925-927`);
`PostWorkoutSummary.tsx:179-191`; `TimerRuler.tsx:104,133,160,186-189`;
`PaneGrid.tsx:185`; `IntervalSegments.tsx:24`; `storedSummary.ts:280,302`;
`Countdown.tsx:211,229` and `WorkoutDetail.tsx:272` (the `buildRun` fourth
argument); `draft.ts:139-173,195`; `Builder.tsx:6,103-109,585,597-598`.

- [ ] **Step 4: KEEP the legacy guards, and add the default arms**

Do NOT delete these. Add a comment to each:

```ts
// src/session/logDraft.ts — KEEP. `LogSeed` is PERSISTED on a stored
// MonitorRun, so a record written before Phase WU still carries
// kind: "warmup". Removing this guard adds a phantom warm-up row to what
// gets SAVED from such a record. Owed removal: ROADMAP Phase WU, at the
// first server-touching phase after two tags have shipped.
if (seedStep.kind === "warmup") return;
```

Keep `LogSeed.steps[].kind` as the LITERAL union `"warmup" | "work"` —
**do not widen it to `string`.** Widening admits typos, erases the
enumeration, and hides the owed cleanup from the compiler.

Keep `summaryModel.ts:563-564`'s `warmupIndex` and its consumption in
`monitorAvgSplit` at `:624`, with the same comment. Post-WU it returns
`-1` and skips nothing.

Add a `default` arm to each `Timer.tsx` switch that previously had a
`"warmup"` case. **An exhaustive switch with no default is a runtime
`undefined` generator the moment its union shrinks underneath it** — a
legacy persisted `SessionRun` renders `STEP 1 OF 5 · undefined` without
this.

- [ ] **Step 5: Sweep the fixtures — change the CONSTRUCTOR, never the assertion**

**This is the step that lands green and wrong if rushed.** A fixture that
built a warm-up phase and asserted it was excluded from AVG SPLIT becomes
a fixture that does not build a warm-up phase. It does NOT become a
fixture that keeps building one and lowers its expectation.

Worked example, `src/monitor/connectedMetricsReplay.test.ts:86-92`:

```ts
// BEFORE
{ type: "warmup", kind: "distance", value: 100, targetSplit: null,
  displaySpm: null, restSeconds: 0 },
// AFTER — retyped, everything else byte-identical. `targetSplit: null`
// is what makes the replay reproduce the recorded tx bytes exactly:
// program.ts's warm-up arm only NULLED targetSplit, and commands.ts:183
// sends the same NO_TARGET_PACE_SECONDS = 0 sentinel for an effort
// interval. `divergences` must stay empty.
{ type: "work", kind: "distance", value: 100, targetSplit: null,
  displaySpm: null, restSeconds: 0 },
```

And `:147-148` — note `originalIndex: -1` was `WARMUP_ORIGINAL_INDEX`,
which no longer exists, so it needs a real index:

```ts
// BEFORE
const CM_PHASES: EnginePhase[] = [
  { type: "warmup", meters: 100, label: "Easy", originalIndex: -1 },
// AFTER
const CM_PHASES: EnginePhase[] = [
  { type: "work", meters: 100, label: "Easy", originalIndex: 0 },
```

Enumerate the rest — the compiler finds ~16, grep finds more:

```bash
cd app && pnpm exec tsc -b --pretty false 2>&1 | grep "error TS" | sed 's/(.*//' | sort -u
grep -rln 'warmup\|"wu"' src domain e2e | grep -E '\.(test|spec)\.(tsx?)$'
```

**Every changed expected literal must be recorded, with its reason, for
the PR body.** If you cannot justify a changed number, you have made the
mistake this step exists to prevent — revert it and change the
constructor instead.

- [ ] **Step 6: Flip the mover pin, keep the control green**

In `warmupRemoval.replay.test.ts`, update the mover's expectations to the
spec's stated post-WU values and leave the control untouched:

```ts
expect(summary.hero.distanceMeters).toBe(1599); // unchanged
expect(summary.hero.timeSeconds).toBeCloseTo(488.4, 1); // unchanged
expect(summary.hero.avgSplitSeconds).toBeCloseTo(129.772, 2); // 2:09.8, was 2:08.5
expect(summary.rows.filter((r) => r.measured)).toHaveLength(5); // now 5 work rows
```

**DISTANCE and TIME must not move.** If either does, the removal touched
an accumulator it had no business touching — stop and diagnose.

- [ ] **Step 7: Run the full gate**

```bash
cd app && pnpm typecheck && pnpm lint && pnpm test
pnpm e2e
```

Expected: all green. Record the per-file coverage of every source file
touched.

- [ ] **Step 8: Commit**

```bash
git rev-parse --show-toplevel   # MUST print the worktree path
git add -A
git commit -m "refactor: remove the warm-up from both compiler-reachable unions"
```

---

### Task 3: Remove the setting

**Files:**

- Delete: `app/src/you/WarmupRow.tsx`
- Modify: `app/server/stores/preferences.ts`, `app/server/routes/data.ts`,
  `app/src/api/usePreferences.ts`, `app/src/You.tsx`, `app/src/index.css`

**Interfaces:**

- Consumes: Task 2's `buildRun(draft, baselines, now)` signature.
- Produces: `PreferencesRow` without `warmup`. Nothing later depends on it.

- [ ] **Step 1: Write the failing API test**

```ts
it("rejects a warmup key on PUT /api/prefs", async () => {
  const res = await request(app).put("/api/prefs").send({ warmup: null });
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd app && pnpm test --project integration -- prefs`
Expected: FAIL — today the key is accepted.

- [ ] **Step 3: Remove the setting**

`server/stores/preferences.ts` — delete `WarmupSetting` (`:12`), the
`warmup` field on `PreferencesRow` (`:19`), and its entry in
`PREFERENCES_DEFAULTS` (`:30`) and `get()` (`:51`).
`server/routes/data.ts` — delete the `"warmup" in body` block (`:1281`),
`isValidWarmup`, and the six `WARMUP_*_MIN/MAX` constants (`:65-91`).
`src/api/usePreferences.ts` — delete the mirrored `WarmupSetting` (`:23`)
and the `warmup` field (`:42`). Delete `you/WarmupRow.tsx` and its row in
`You.tsx`.

**LEAVE `warmup jsonb` IN `schema.ts`.** No migration ships in this phase
— see spec §4. Dropping it in the release that stops reading it breaks
rollback, and `/api/health` is `select 1` so the rollback would report
healthy over a dead preferences path.

- [ ] **Step 4: Delete the CSS, with the corrected ranges**

`index.css` **1533-1596** — NOT 1533-1600. Line 1597 is blank and
**1598-1600 opens the unrelated `.learning-progress-*` comment**; cutting
to 1600 corrupts it. Also `:4166-4211` (`.timer-total-warmup`),
`:8603-8608`, `:3393-3401`, and `.builder-warmup-line` at `:2841`.

Note `PaneGrid.test.tsx:1205` holds a NEGATIVE guard on
`.timer-total-warmup` that becomes vacuous once the class is gone — delete
or retarget it deliberately. `.summary-row-warmup` is applied in TSX with
no rule at all; it is a pure test hook.

- [ ] **Step 5: Run the gate and commit**

```bash
cd app && pnpm typecheck && pnpm lint && pnpm test && pnpm e2e
grep -rn "warmup-row-button\|warmup-editor\|timer-total-warmup\|summary-row-warmup\|builder-warmup-line" src e2e
```

Expected: tests green; the grep returns nothing.

```bash
git rev-parse --show-toplevel
git add -A && git commit -m "feat: remove the warm-up setting"
```

---

### Task 4: Copy, captures and the record

**Files:** `src/news/content/bodies/yourFirstRow.tsx`,
`domain/validate.ts`, `domain/bulk.ts`, `src/news/content/releaseNotes.ts`,
`docs/design/DEVIATIONS.md`, `app/e2e/fixtures/`, `docs/screenshots/`

- [ ] **Step 1: Surgical edit to the onboarding article**

`yourFirstRow.tsx:13-14`. **Keep** "Warm up for ten minutes first." —
evergreen, still true, the point of the paragraph. **Delete only**
"Warm-ups are a setting now: set yours on the You tab under WARM-UP and
every session, this one included, will start with it."

- [ ] **Step 2: Fix the two other live strings**

`validate.ts:85` ("Warm-ups moved to Settings. Set yours on the You tab.")
and `bulk.ts:362` ("Warm-ups are a setting now.") both name a screen that
no longer exists. Reword to say a warm-up can be an ordinary first step.

**Keep `droppedWarmupNotice` and `tryParseWarmupLine`.** A pasted `wu`
line never reaches `validateSteps` — `bulk.ts:334-339` intercepts it and
`continue`s before `parseStepLine` builds a Step. The paste produces the
NOTICE, not an error. Deleting the strip as "redundant" is the mistake
this note prevents.

**And keep `droppedWarmups` as an API response field** (`data.ts:808`).
Spec §3 leaves this as an explicit decision; take the keep. API changes
are ADDITIVE-ONLY between tags (docs/RELEASING.md), so removing a response
field is a breaking change, and the paste path still needs the count to
render its notice. Record the decision in the PR body so the next reader
does not re-open it.

- [ ] **Step 3: New release note**

Add a note saying the setting is gone AND that a warm-up can be built in
as an ordinary first step. **A note that only announces a deleted control
is the note that generates the support question.** Do not edit
`releaseNotes.ts:120`, `:165` or `:204`.

- [ ] **Step 4: Captures — five DELETED, three regenerated**

Delete: `you-warmup-on`, `timer-warmup`, `timer-warmup-landscape`,
`connected-pane-live-warmup`, `connected-pane-live-warmup-landscape`.
Regenerate: `you`, `countdown`, `post-workout-summary` and landscapes.

```bash
cd app && pnpm screenshots
```

**Open every changed image and look at it.** Committed screenshots are the
PR's visual record and have twice shipped showing fallback dashes.

- [ ] **Step 5: Reconcile DEVIATIONS**

`docs/design/DEVIATIONS.md` rows **17, 18, 94, 95, 99, 103** describe live
warm-up behaviour. DEVIATIONS documents CURRENT STATE, not history.

- [ ] **Step 6: Retarget the four frozen e2e fixtures** carrying
      `WARM-UP`/`WU`, then run `pnpm e2e` and commit.

---

## Execution strategy — and whether the fixture sweep fans out

**Tasks 1, 3 and 4: serial, one agent.** Small, sequential, and Task 4 is
judgement-heavy (copy and captures) rather than volume.

**Task 2 cannot be parallelised across its source half.** Both unions land
in one commit and the tree does not compile until every branch is fixed,
so no parallel agent can run a test to know whether it is right.

**Task 2 Step 5 (the fixture sweep) is the only genuine fan-out**, and it
is a judgement call worth making with the real count in hand:

- Compiler-flagged: ~16 files. Grep-reachable: ~55 test/spec files.
- **If the edits are near-identical** (retype a fixture literal), a single
  careful pass or a codemod beats orchestration, and costs a fraction.
- **If they are varied**, pipeline one agent per file, each briefed with
  Step 5's constructor-vs-assertion rule verbatim.

**If it does fan out, the verifier must be a SCRIPT, not an agent.** The
failure mode — lowering an assertion rather than fixing a constructor — is
mechanically detectable, and a script cannot be talked into accepting it:

```bash
git diff --unified=0 -- '*.test.ts' '*.test.tsx' \
  | grep '^[+-].*expect(' | grep -E '[0-9]+(\.[0-9]+)?'
```

Any changed numeric literal inside an `expect(` is a finding until
justified by name in the PR body. Thirty agents each locally rationalising
a lowered expectation is exactly how this lands green and wrong.

---

## Definition of done

Spec §8's nine criteria are the ONE exit list. ROADMAP points at them and
carries no copy. Before opening the PR, walk §8 clause by clause and state
each one's evidence in the PR body.

**Two owed items must be in ROADMAP, not the PR body** (they already are —
confirm they survived): the `ALTER TABLE "preferences" DROP COLUMN
"warmup"` at the next server-touching phase, and the legacy-guard removal
at the first server-touching phase after two tags have shipped.

**Release:** no tag for Phase WU alone. It is a MINOR clause riding the
tag that carries Phase LL's brick fix.
