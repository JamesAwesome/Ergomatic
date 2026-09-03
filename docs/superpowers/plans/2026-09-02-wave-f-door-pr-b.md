# Wave F — door **PR B** (the stored number) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The metres a rower actually put on the erg before a connected
session stopped short are KEPT and shown. Today they are discarded: the
interval in flight has no boundary pair, so nothing about it survives, and a
single-interval piece lost mid-row keeps nothing at all. After this PR the
in-flight interval's own last reading is stored as OUR number, in two new
step keys, and renders on that step's row on both the log door and the saved
row. The lost banner stops saying "Nothing kept." when something now is.

**Architecture:** One session-scoped ref (`lastRowingFrameRef`) minted on
every rowing frame of the live run and cleared the moment that interval's
work bout ends; one pure gate (`withPartial`) applied at TWO close sites
covering FIVE producers; a new optional `MonitorRun.partial` (no `v` bump);
two new optional `LogStep` keys carried through THREE type declarations and
the route's explicit field list; one new formatter (`partialRowLabel`) that
both row builders call; one renderer change; one banner arm.

**Tech Stack:** React 19 client; Express 5 server; Vitest (unit / client /
integration); Playwright (e2e + screenshots). **No migration** — `steps` is
untyped `jsonb` (`server/db/schema.ts`'s `steps` column).

**Spec:** `docs/superpowers/specs/2026-09-02-door-partial-design.md` — §5
(5.1–5.4), §6's Gate 0-B, §7, §8.2, §8.3, §9. **PR A / §1–§4 is DONE**
(#276, merged; this branch's base). Read §5 before any task; every
behavioural rule below is argued there.

**Antagonist:** the FULL pass on §5, AND the `harden` lens-1 pass on this
plan, both live in `.claude/agents/antagonist-ledger.md`'s `2026-09-02 — Wave
F door PR B (§5, in-flight metres): harden lens 1` entry. All findings are
BINDING and each is named at the task that carries it. **Lens 1 on the plan
found five**, folded here: (1) `program()`'s clear must not sit beside
`rowingStreakRef`'s — Task 2 step 5, probed by M3.4; (2) the End-arm leg was
cut past its own clear — Task 7 step 3 splits it into C1 (positive) and C2;
(3) the two gate halves were two literals, not one import — Task 0 step 0's
fixture module; (4) the pair had no both-or-absent check — Task 0 step 4,
probed by M0.3; (5) `connect()`/`teardown()` are defensive and get no leg —
Task 2 steps 1/5 and the **Ungated by design** list. One of finding 3's own
clauses is corrected against a measurement, at Task 7 step 5's M7.3.

**Gate 0-B: APPROVED by James, 2026-09-02.** The artboard is
`docs/superpowers/specs/2026-09-02-door-gate-b.html`; the spec's own §6 now
records the seven decisions it settles, and every user-visible string and CSS
value below is approved copy rather than a proposal:

- **(a)** the pair then the dash on a DISTANCE row (`250 m · 1:03`).
- **(b)** a TIME row reads `2:10 · 480 m` against its `3:00` target.
- **(c)** a link-lost reading is marked by a CAPTION under the table, in
  `.summary-targets-only-caption`'s type — and on a single-interval
  link-lost row it REPLACES that caption rather than stacking under it. Not
  an inline word (an inline word collapses the pace-ref cell to zero,
  measured at the gate). Task 5 carries it.
- **(d)** an over-target partial still reads as a partial — no pace, no rate.
- **(e)** the lost banner's zero-kept arm renders the title alone, **and the
  two sibling surfaces that also say "Nothing kept." drop it the same way in
  THIS PR** — `ConnectedSurface.tsx`'s ended-frame line and
  `LogSession.tsx`'s dropped-program strip. Task 6 carries all three.
- **(f)** no split, pace or rate is ever derived from the pair.
- **(g)** the row's `aria-label` speaks `stopped at 250 m · 1:03`.

**No task is gate-blocked any more** — the tasks below run in order. The
DISTANCE hero's own gap (it already counts the abandoned interval's rowed
metres while the rows could not show them, so a rower can subtract and find
one) was accepted SILENTLY: **no sentence is owed anywhere in the product**,
and it is recorded once, in the PR's Record block, as an accepted
observation.

---

## Global Constraints

These are the spec's binding lines. They are constraints, not suggestions;
each one already cost somebody a round somewhere.

- **Worktree:** `/Users/james/projects/github/jamesawesome/Ergomatic-wt-door-b`
  (branch `wave-f-door-b`, base head `a50e06f3`). Run
  `git rev-parse --show-toplevel` before EVERY commit and confirm it prints
  that path. **Every shell write uses an absolute worktree path or a `cd` in
  the SAME command** (RF20 — five stray main-checkout writes so far).
- All commands run in `<worktree>/app/` unless stated. Node 26:
  `export PATH="$HOME/.local/share/nvm/v26.5.0/bin:$PATH"`.
- **TWO NEW STEP KEYS, `partialMeters` and `partialSeconds`. NEVER
  `actualMeters`/`actualSeconds`, NEVER a new `actualSource` member.** The
  reason is the route's own validator comment: _"any extra keys the client
  sent are silently dropped, not persisted."_ A partial carried in
  `actualMeters` plus a marker reaches an OLDER server as the number without
  the marker, 201, in every sum forever; a new `actualSource` member 400s the
  whole save with no retry. New key names make the old-server degradation
  identical to not shipping §5 at all: both keys dropped together, the row
  reads as it does today.
- **THREE step type declarations widen, not one** (antagonist finding 4):
  `LogStep` in `src/session/logDraft.ts` (the WRITE shape), `LogStep` in
  `server/stores/logs.ts` (the SERVER shape), and `StoredLogStep` in
  `src/log/storedSummary.ts` (the READ shape the new row renders from). Plus
  the route's explicit field list and its bounds.
- **BOUNDS: non-negative and finite, with NO upper bound against the step's
  own target.** A partial can legitimately exceed a distance target by the
  last stroke, and a validator that refused it would 400 the whole save over
  an honest number.
- **TWO STORED SHAPES CHANGE, NOT ONE.** The partial is read at close inside
  `closeRecord`, which builds the close through `completeMonitorRun`, while
  `buildMonitorLogSteps` runs later off the LOADED `MonitorRun` — so the
  partial lives first on `MonitorRun` (a versioned localStorage record and
  the hand-off store's durable bytes) and only then on the posted step.
  `isMonitorRun` has no unknown-key check (its own comment: the positive
  conjunction tolerates new fields), so **no `v` bump**.
- **I-B1** — a partial is written only on a close with `endedBy ≠ finished`.
  Tier B2 (`isReconstructableClose` = `finished | null | undefined`) therefore
  never sees one, and its GATED population stays provably historical.
- **I-B2** — a partial is NEVER an `IntervalActual`. `measuredIntervalCount`
  reads `run.actuals`, so "N intervals kept" does not move; a partial
  single-interval piece is still `kept = 0`.
- **I-B3** — a partial belongs to an interval whose WORK BOUT is still
  running. The bout ends at **the first `resting` frame carrying that
  interval's index OR that interval's own `IntervalActual`, whichever comes
  first.** The two are up to a full programmed rest apart — MEASURED at
  **59 940 ms** on `walk-2026-08-28/rest-boundary-recording.jsonl.gz` (the
  work→rest 0x0031 at t=76489 against the 0x0037 boundary at t=136429; command
  in the Measurements appendix). The mechanism is the wire: 0x0037 carries
  `intervalRestTimeSeconds`, so the characteristic CANNOT be emitted before
  the rest it reports has finished. **The first draft cleared on the boundary
  actual alone; an End during that rest would have stored a COMPLETED
  interval as a partial and counted it unmeasured — the inverse of the
  complaint this spec exists for.**
- **I-B4** — a stale re-emitted frame UNDER-counts, never over. A link-lost
  close banks what was LAST RECEIVED, which can be arbitrarily old
  (`endSession`'s `linkGone` includes frame silence), and the row's copy says
  what the pair IS rather than "so far".
- **I-B5** — no summing reader ever sees the new keys. Named:
  `stepActualSums`, `tierBAvgSplitSeconds`, the `hasStepActuals` predicate,
  `buildStoredRest`, `heroDistanceMeters`, `measuredElapsedSeconds`, and the
  Concept2 mapping. The census is a SCRIPT (Task 4), never a transcribed
  table.
- **I-B6** — never for an interval that already carries an `IntervalActual`,
  **checked against the RECORD, never inferred from boundary timing**
  (antagonist finding 2). `MonitorFrame.intervalIndex` lags the machine's own
  interval reset by up to 810 ms
  (`walk-2026-08-16/session-1-keystone-2x250r0.jsonl`, ledger entry), so a
  rowing frame can carry the index of an interval whose actual is already
  banked. Without this, a close in that window writes `partialMeters: 0`
  beside `actualMeters: 250`.
- **The pair is ELAPSED time, not rowing time.** _"There is NO paused state
  on the wire — mid-workout the clock runs whether or not the rower pulls"_
  (`domain/monitor/types.ts`, `MonitorFrame.state`'s doc comment). A rower who
  stops pulling and then presses End banks a `partialSeconds` that includes
  idle time. **NO SPLIT, PACE OR RATE IS EVER DERIVED FROM THE PAIR** — the
  step row shows the two numbers as what they are.
- **A `rowing` frame with `intervalIndex: null` (the D3 divergence) writes no
  partial.** Absence over invention, the rule `logDraft` already applies to
  null-index actuals.
- **FIVE PRODUCERS, TWO SITES** (antagonist finding 3). Four commit through
  `closeRecord` in `useMonitorSession.ts`: the End arm (writes `rower` or
  `link-lost` by `linkGone`), `endByMachine`'s `terminated` arm (the PM5's
  own Menu — **and the arm every committed capture exercises, because a
  replay cannot press a button**), the live `programDropped` arm, and
  `program()`'s catch. The read belongs INSIDE `closeRecord`, gated on
  I-B1/I-B3/I-B6, **one site, never per arm**. The fifth — the continuity
  reset (`completeContinuityReset` → `link-lost`, committed through
  `applyProducerCommit`) — never touches `closeRecord` and needs the same read
  at its own commit. **`interrupted` (Today's unlogged row,
  `completeWithoutWireEvidence` via `completeInterruptedRun`) runs outside the
  hook and writes none.**
- **A partial cannot be written twice:** `closeRecord` returns on
  `completedAt !== null` (attacked and HELD in the ledger).
- **At a terminate the PM5 DOES send the in-flight interval's own
  0x0037/0x0038** (`walk-2026-08-28/end-on-interval-1-recording.jsonl.gz`,
  t=15442: `splitIntervalTimeSeconds` 8.5, `splitIntervalDistanceMeters` 15,
  `splitIntervalNumber` 1) **and we decline it**, because `toActualIndex`
  returns `null` for `state === "terminated"` — CSAFE-DEF footnote 12 says the
  interval number _"will change depending on where you are in the interval"_,
  so the machine reports the QUANTITY but cannot ATTRIBUTE it. **The first
  implementer to see that event must not reach for it.**
- **Allowlists, never negations, for anything user-visible.** PR A's
  `PARTIAL_CLOSE_REASONS` is the five-member allowlist and is UNCHANGED by
  this PR. `withPartial`'s own gate is `endedBy === "finished"` → refuse,
  which is correct there because its input is a `CloseReason` the caller
  already has in hand (never a stored `null`).
- **Every new assertion gets a NAMED mutation with the failure text it must
  produce** (RF21), recorded in the task report. **Commit the real change
  BEFORE running any mutation probe** (RF22) so every revert is a no-op
  against a clean file. `git stash` is forbidden (shared stack).
- Typed-lint ratchet: no new suppressions. TDD: failing test first. Per-file
  coverage for every file touched (RF2), read from `app/coverage/`, not the
  aggregate gate.
- **Test invocation footguns:** never bare `vitest run` (Node 26 webStorage vs
  jsdom → ~445 phantom failures). `pnpm test --project client -- <pattern>`
  silently runs the FULL suite. `pnpm exec vitest run --project client <file>`
  runs client files OUTSIDE jsdom. The one scoping form MEASURED to work this
  session is
  `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client -t "<name>"`
  — without that env var even the `-t` form dies on
  `TypeError: Cannot read properties of undefined (reading 'clear')`.
  **Read BOTH summary lines** — "Tests" says all-passed while a file that
  failed to LOAD collects zero; grep "Test Files" too.
- House style: no em-dashes in user-facing copy (middle dot `·`); CSS custom
  properties only, never raw hex; hit targets ≥44×44; contrast computed and
  stated as a number, never judged by eye.

---

## Reachability and citations, verified at `a50e06f3`

Every subject below was read at THIS head this session — never transcribed
from the spec, the ROADMAP, or the ledger. Cited by SYMBOL wherever a symbol
exists, because line numbers in this repo move under every merge.

| Subject | Verified location | Note |
| --- | --- | --- |
| Write-shape `LogStep` | `app/src/session/logDraft.ts`, `export interface LogStep` | ends at `actualSpm?: number` |
| Server `LogStep` | `app/server/stores/logs.ts`, `export interface LogStep` | own-bounds mirror by convention, never a shared import |
| Read-shape `StoredLogStep` | `app/src/log/storedSummary.ts`, `export interface StoredLogStep` | the type `buildRows` renders from |
| The route's validator | `app/server/routes/data.ts`, `validateLogStepEntry` | destructure, then bounds, then the explicit field list under the comment _"any extra keys the client sent are silently dropped"_ |
| `steps` column | `app/server/db/schema.ts`, `session_logs.steps` | untyped `jsonb` — **no migration** |
| `PATCH /api/logs/:id` accepted fields | `app/server/routes/data.ts` | `held`/`pain`/`thumbs`/`notes` only — no edit path can strip the keys (ledger, HELD) |
| `MonitorRun` | `app/src/monitor/monitorRun.ts`, `export interface MonitorRun` | additive-optional precedents to copy: `endedBy?`, `series?`, `summaryTotals?` |
| `isMonitorRun` | same file | positive conjunction, **no unknown-key check** (its own comment says so) — verified by reading the whole return expression |
| `completeMonitorRun` | same file | `args.endedBy` REQUIRED; declines a run with `completedAt !== null` |
| `completeContinuityReset` | same file | delegates to `completeWithoutWireEvidence` with `"link-lost"` |
| `completeInterruptedRun` | same file | `"interrupted"`; its ONLY caller is `Today.tsx`'s `UnloggedMonitorRow` — outside the hook, writes no partial |
| `closeRecord` | `app/src/monitor/useMonitorSession.ts` | `(terminated, endedBy)`; `withSeries(run)` then `completeMonitorRun` then `applyProducerCommit` |
| `closeRecord` call sites | same file | exactly FOUR: `endByMachine` (`terminated ? "rower" : "finished"`), the `programDropped` live arm (`"program-dropped"`), `program()`'s catch (`"program-failed"`), `endSession` (`linkGone ? "link-lost" : "rower"`) |
| The fifth producer | same file, the `phase === "live"` continuity branch | `applyContinuityCheck` → `withSeries(closed)` → `applyProducerCommit`; **never `closeRecord`** |
| `rowingStreakRef` clear sites | same file | exactly FOUR, by symbol: the RC-37 programDropped/ready exit in `handleEvent`, `beginFreeRow()`, `program()`, `cancel()` — and NOT `connect()`/`teardown()` |
| `connect()`'s per-attempt reset block | same file | `livenessRef.current = null` and its neighbours, at the top of every attempt |
| `teardown()`'s per-run reset block | same file | `frameArrivalsRef.current = []; lastResumeAtMsRef.current = null;` immediately before STEP 2 (STASH) |
| The `intervalComplete` handler | same file | `recordActual` → `accepted` → `applyProducerCommit`; the accepted-actual clear rides here |
| `handleFrame`'s ready→live seed | same file | the branch ending `update({ frame, phase: "live", actuals: [], … }); return;` — the ONE live-run frame the `live` branch never sees |
| `MonitorFrame` | `app/domain/monitor/types.ts` | `elapsedSeconds`/`distanceMeters` are PER-INTERVAL; `intervalIndex` is OUR normalized index, `null` outside rowing/resting |
| `toProgramIndex` | `app/domain/monitor/pm5/intervalIndex.ts` | `resting` → `machineIndex - 1`, clamped at `-1`→`0`; **so the first resting frame of interval N carries index N either side of the 0x0033 update** (checked against the capture: `intervalCount` moves 0→1 at t=76494, 5 ms AFTER the first resting frame at t=76489, and both readings resolve to 0) |
| `toActualIndex` | same file | returns `null` for `state === "terminated"` — why the terminate-time 0x0037 is declined |
| `buildMonitorLogSteps` | `app/src/session/logDraft.ts` | iterates `run.program.intervals.forEach((interval, i))`; a legacy warm-up seed step `return`s WITHOUT pushing, so `out.length ≠ i` |
| `buildMonitorLogSteps` callers | `summaryModel.ts`'s `monitorWorkRows`; `LogSession.tsx` twice (the validation probe and the POST body) | so the partial reaches the wire with no extra plumbing |
| `stepActualSums` / `tierBAvgSplitSeconds` / `measuredElapsedSeconds` / `buildStoredRest` / `buildStoredTotalLine` | `app/src/log/storedSummary.ts` | all read `actualMeters`/`actualSeconds` only |
| `heroDistanceMeters` | `app/src/log/LogRow.tsx` | takes a `RecentLog`, which **has no `steps` at all** (`LOG_LIST_COLUMNS` excludes them) — its I-B5 leg is a type-level fact, stated as such |
| `measuredIntervalCount` | `app/src/session/summaryModel.ts` | reads `run.actuals`, never a step — I-B2 holds by construction |
| C2 eligibility fence | `app/server/concept2/mapping.ts` | `endedBy === "finished"`; reads `work_meters`/`work_seconds`, no step field |
| `SummaryRow` / `PrescribedRow` | `app/src/session/summaryModel.ts` | the unmeasured row: index, `durationLabel`, `targetPaceLabel`, offset, `—` |
| `targetsOnlyCaption` | `app/src/session/summaryModel.ts` | FOUR call sites; only two can carry a partial — `buildMonitorModel` (has `run.endedBy`) and `storedSummary.ts`'s `buildStoredSummary` (has `row.endedBy`). The timer door and the no-record manual model have neither and are untouched |
| `.summary-targets-only-caption` | `app/src/index.css`; rendered once by `SummaryIntervalsBlock` (`PostWorkoutSummary.tsx`) from a single `caption?: string` | the slot Gate 0-B decision (c) reuses. `--ink-3` `#57544c` on `--page` `#f4f1e8` = **6.69:1** (the gate's own contrast table) |
| `IntervalRow` | `app/src/session/PostWorkoutSummary.tsx` | ONE renderer, both doors; its unmeasured branch ends `<span className="summary-row-dash">—</span>` |
| `buildRows` | `app/src/log/storedSummary.ts` | the stored screen's own row builder, structurally identical unmeasured branch |
| `LostBanner` | `app/src/workout/ConnectedSurface.tsx` | `kept === 0 ? "Nothing kept." : …`; rendered `{model.stale && <LostBanner kept={model.measuredIntervals} />}` |
| The banner's shipped pins | `ConnectedSurface.test.tsx` (2 text assertions + 2 CSS assertions + the only-filled-red census), `e2e/design.spec.ts` (the `connected-disconnected` fixture, `1 interval kept.`) | the design.spec leg is the ≥1 arm and is UNAFFECTED |
| The banner's shipped FIXTURE | `ConnectedSurface.screens.test.tsx`'s `toMatchFileSnapshot("../../e2e/fixtures/connected-ready-lost.html")`; the file contains `connected-lost-body">Nothing kept.` | regenerated in Task 6 |
| `.summary-row` layout | `app/src/index.css` | `display: flex; gap: 8px`; `.summary-row-offset` is `flex: 1; min-width: 0` and ellipsises; `.summary-row-dash` is `flex: 0 0 20px` right-aligned |
| `--ink-2` contrast | `app/src/index.css`'s own computed comments | `#3f3c35` on `--page` `#f4f1e8` = **9.75:1**; on `--surface` = **10.81:1**. Floor 4.5:1. The partial cell reuses `.summary-row-time`'s existing pairing, so no new colour decision is introduced |
| Replay precedent | `app/src/monitor/lifecycleReplay.test.ts`, `summaryHoldReplay.test.ts` | `createReplayTransport` + `vi.doMock("../adapters/monitorTransport")` + `vi.resetModules()` + dynamic re-import + `withLiveness` clock rebind |
| supertest precedent | `app/server/routes/data.test.ts`, the `pm5 fields (Phase 7C Task 3)` describe | `asA(request(app).post("/api/logs")).send({...validLogBody(), steps:[…]})`, then `getLogById`, then `toStrictEqual` on `steps[0]`; a bounds refusal is `400` with `body.field === "steps"` and the member named in `body.error` |
| e2e seeding helpers | `app/e2e/log.spec.ts`'s `postLog` (`steps?: { label; actualSource?; actualSeconds? }[]`) and `app/e2e/screenshots.spec.ts`'s `postLog` (a wider step type) | both need the new pair, plus `meters`/`seconds`/`targetSplit` on the narrow one |
| Existing partial captures | `screenshots.spec.ts`: `log-detail-partial`, `log-detail-partial-landscape`, `log-history-partial` (all PR A's) | Task 8 EXTENDS the first two rather than adding a third portrait shot |
| ROADMAP §5 item | `ROADMAP.md`, _"The in-flight interval's metres are discarded on a mid-row link loss."_ | ticked in Task 8 |
| ROADMAP register row | `ROADMAP.md`, `## Codebase-audit owners` → _"LOST THE MONITOR must not say 'Nothing kept.'"_ | ticked in Task 8, **and its own sentence corrected** — see Finding 4 |

---

## Findings this plan carries that §8.2 does not name

Stated up front so a reviewer is not surprised. Each has its own step.

1. **`heroDistanceMeters` cannot be given a step at all.** §5.2 I-B5 names it
   among the summing readers, but it takes a `RecentLog`, and
   `LOG_LIST_COLUMNS` deliberately excludes `steps` for size. Its I-B5 leg is
   therefore a **type-level** fact, not a runtime one, and Task 4 says so in
   the census test rather than writing an equality leg that could never fail
   (RF21: a gate that cannot go red is decoration). The runtime hero leg goes
   through `buildHeroes` (which DOES read `stepActualSums`).

2. **TWO OTHER SURFACES SAY "Nothing kept." AND §5.4 NAMED ONLY THE
   BANNER — RULED AT GATE 0-B, AND ALL THREE CHANGE HERE.** Measured at
   `a50e06f3`:
   - `ConnectedSurface.tsx`'s `LostBanner` — §5.4's target.
   - `ConnectedSurface.tsx`'s ended-frame line — `"The erg dropped the
     workout. Nothing kept."`
   - `LogSession.tsx`'s dropped strip — `"Nothing kept."` over `"You had not
     finished an interval yet."`
   The third is the dangerous one: `program-dropped` IS one of the five
   partial producers, so after Task 5 that strip could read **"Nothing kept.
   You had not finished an interval yet."** directly above a step row showing
   `250 m · 1:03`. That is RF23's exact shape — two mechanisms describing one
   fact, the better-informed one losing. **James ruled at Gate 0-B
   (2026-09-02, decision (e)): all three drop the phrase, in this PR.** Task 6
   carries all three, each with its own shipped pin, leg and mutation.

3. **A shipped release note becomes FALSE.** `releaseNotes.ts`'s v0.24.0 item
   2 ends: _"it says how much survived: '2 intervals kept.', or 'Nothing
   kept.' when there is nothing."_ Task 6 removes that second string. The
   repo's convention is explicit at that same site — _"v0.17.0's own string
   stays unedited — shipped notes are history"_ — and v0.24.0 item 5 is the
   worked example of the alternative: the correction rides the NEW version's
   note. **Task 8 owes that correction line to the release notes**, and the
   old string is not edited.

4. **The ROADMAP register row's own sentence is wrong about I-B2.** It reads
   _"the same PR that makes a part-rowed interval count toward 'kept'"_. I-B2
   says the opposite and is deliberate: a partial is not an `IntervalActual`,
   `measuredIntervalCount` does not move, and a partial single-interval piece
   is still `kept = 0`. Task 8 reconciles that clause when it ticks the row
   (RF9 — the register documents current state).

5. **A replay CANNOT press End, and both 08-28 captures contain the terminate
   the app sent.** Each capture's LAST tx is
   `f1 76 04 13 02 01 02 60 f2` (the terminate frame) — so a replay that
   never presses End leaves that write unmatched and the harness reports
   **exactly one** divergence, `tx#75 barrier timeout` (end-on-interval-1) /
   `tx#839 barrier timeout` (rest-boundary). The precedent
   (`lifecycleReplay.test.ts`) asserts `divergences` is `[]`; **these two legs
   cannot and must assert the exact one-element array instead.** Measured, not
   predicted — see the Measurements appendix. This is also what proves the
   program transcription: every programming tx (seq 15–19) MATCHED, so a wrong
   field would have added a second divergence.

6. **The I-B6 window is not present in either 08-28 capture.** Measured:
   0x0033's `intervalCount` moves 0→1 during the rest (t=76494), so the first
   rowing frame of interval 1 (t=136699) already carries index 1 — there is no
   lagged frame to re-mint onto. The lag lives on
   `walk-2026-08-16/session-1-keystone-2x250r0.jsonl` (ledger, 810 ms). **So
   the I-B6 gate is a SYNTHETIC frame at the hook, exactly as §8.2 prescribes
   — not a replay leg**, and the plan says so rather than implying a capture
   covers it.

---

## The lifetime table (RF27), in the code's own symbols

One ref. One mint function. Six clear sites — FOUR gated by a leg, two
(`connect()`, `teardown()`) defensive and ungated by design — plus two
event-shaped clears inside the mint function itself.

| | |
| --- | --- |
| **State** | `lastRowingFrameRef: React.RefObject<{ intervalIndex: number; meters: number; seconds: number } \| null>` in `useMonitorSession.ts`, declared immediately after `rowingStreakRef` |
| **Invariant** | *At most one reading, and it always belongs to an interval whose work bout is still running in the CURRENT run of the CURRENT connection.* |
| **Mint site** | `noteFrameForPartial(frame)` — the ONLY writer. Called from exactly two places in `handleFrame`: the ready→live seed frame (the one live-run frame the live branch never sees), and the LAST statement of the `phase === "live"` branch |
| **Mint condition** | `frame.intervalIndex !== null` **and** `frame.state === "rowing"` **and** no `IntervalActual` on `runRef.current.actuals` already carries that index (I-B6 at mint) |
| **Clear — I-B3 (a)** | inside `noteFrameForPartial`: the first `frame.state === "resting"` frame whose `intervalIndex` equals the held reading's |
| **Clear — I-B3 (b)** | the `intervalComplete` handler, on an **ACCEPTED** actual whose `index` equals the held reading's. On an `r0` program this is the only clear and fires 180 ms after the last rowing frame; on a rested program (a) already fired ~60 s earlier |
| **Clear — per-arm ×4** | the four sites `rowingStreakRef` clears at, by symbol: the RC-37 programDropped/ready exit in `handleEvent`; `beginFreeRow()`; `cancel()`; `program()`. (The `beginFreeRow` copy is the one this file's own comment records being MISSED before — hence "by symbol", never "by neighbourhood.") **`program()`'s clear does NOT sit beside `rowingStreakRef`'s** (harden lens 1, finding 1): that one is above the `try`, and `program()`'s catch is itself one of the five producers, so this ref clears at the two points where `program()` is DONE with the old run — after the catch's `closeRecord(true, "program-failed")`, and after a successful `await driver.program(p)` |
| **Clear — per-attempt** | `connect()`'s top-of-attempt reset block, beside `livenessRef.current = null`. `rowingStreakRef` does NOT clear here; this ref does, because a reading banked against a run this attempt cannot see must never reach a close it has nothing to do with. **DEFENSIVE and UNGATED BY DESIGN:** `runRef.current` is null once `connect()` has run, so `closeRecord` returns at its no-record guard and no supported ordering reads the ref again |
| **Clear — per-session** | `teardown()`, beside `frameArrivalsRef.current = []`. Runs AFTER every close has already read the ref, so it can never cost a partial. **DEFENSIVE and UNGATED BY DESIGN**, same reason as `connect()` |
| **Survives teardown** | no |
| **Survives relaunch** | no — it is a `useRef`, never persisted; the DURABLE half is `MonitorRun.partial`, written once at close |
| **Survives re-arm** | no — `program()` and `beginFreeRow()` are the two arms and both clear |
| **Can a Just Row mint it?** | No. `toProgramIndex` returns `null` for `programLength <= 0`, so `frame.intervalIndex` is always `null` on a free row (ledger, attacked and HELD) |
| **Can two partials be written?** | No. `closeRecord` returns on `completedAt !== null`, and `completeWithoutWireEvidence` does the same (ledger, HELD) |

**Durable state:** `MonitorRun.partial?: { intervalIndex: number; meters:
number; seconds: number }` — minted exactly once, at close, by `withPartial`;
never mutated afterwards; never written by `completeMonitorRun` (which is the
wire-event closer and has no frame in hand). Its own lifetime is the record's.

---

## The additive matrix, per task where it bites

| Direction | Task | Behaviour |
| --- | --- | --- |
| **NEW client → OLD server** | 0 | The old validator's explicit field list drops BOTH keys TOGETHER (they are independent `if` lines added in the same commit and there is no way to have one without the other). 201, and the saved row reads exactly as it does today — degradation identical to not shipping §5. **NOT TESTED, on purpose:** a hand-written copy of the old allowlist would be a mirror (RF11). It is argued from the validator's own comment and stated as such (§8.2's own ruling). |
| **OLD client → NEW server** | 0 | The route's new bounds are `x !== undefined && …`, so a body with neither key is unchanged. Every existing `data.test.ts` step leg is that body; they stay green (measured: the unit project passed at 1794 tests with the new bounds in place). |
| **NEW build → OLD `MonitorRun`** | 1 | `run.partial` is `undefined`; `buildMonitorLogSteps` writes neither key; the row renders as today. |
| **OLD build → NEW `MonitorRun`** | 1 | `isMonitorRun` is a positive conjunction with no unknown-key check, so the record loads and the field is ignored. No `v` bump — the same never-migrate contract `endedBy?`/`series?`/`summaryTotals?` already established. |
| **NEW client → OLD stored row** | 4, 5 | A row saved before this PR has no partial keys; `partialRowLabel` returns `undefined`; the row renders the dash, as today. |
| **OLD client → NEW stored row** | 5 | An older bundle's `StoredLogStep` has no partial keys, so nothing reads them; the step renders the dash. The row is not wrong, only less informative. |

---

## Task 0: the three step types, the route's field list, and its bounds

**Files:**
- Add: `app/src/session/partialGateFixture.ts` (the ONE declaration of the
  headline gate's two expected steps — harden lens 1, finding 3)
- Modify: `app/src/session/logDraft.ts` (`LogStep`)
- Modify: `app/server/stores/logs.ts` (`LogStep`)
- Modify: `app/src/log/storedSummary.ts` (`StoredLogStep`)
- Modify: `app/server/routes/data.ts` (`validateLogStepEntry`: destructure,
  bounds, field list)
- Test: `app/server/routes/data.test.ts` (the `pm5 fields (Phase 7C Task 3)`
  describe)

**Interfaces produced:** two optional keys on three declarations —
`partialMeters?: number`, `partialSeconds?: number` — plus the two exported
consts of the shared gate fixture (step 0). Nothing else.

- [ ] **Step 0: the shared gate fixture**, `app/src/session/partialGateFixture.ts`.
      **This file exists so the headline gate's two halves are joined by an
      IMPORT, not by two equal literals** (harden lens 1, finding 3: "joined by
      one asserted fixture" is a claim about imports — the two halves used to
      carry the same object typed twice, and a change to what the hook banks
      would redden one while the other kept asserting a stale literal that
      still round-trips). Task 7a asserts against these same symbols.

      ```ts
      /** Door spec (2026-09-02) §8.2 — the two steps the headline gate expects,
       *  declared ONCE. `partialReplay.test.ts` (client, the replay half) and
       *  `server/routes/data.test.ts` (unit, the POST→GET half) both IMPORT
       *  these; a hand-written second copy is RF11's mirror, the same ruling
       *  `server/routes/partial.integration.test.ts` already states for the PR A
       *  gate ("IMPORTED, never hand-copied here — a copy would be a third
       *  mirror"), which is also the precedent that a server test MAY reach into
       *  `src/`.
       *
       *  The numbers are the two 2026-08-28 captures' own last rowing frames,
       *  decoded (Measurements appendix), never chosen. */
      export const PARTIAL_STEP_LEG_A = {
        label: "1:00 @ 2:32",
        targetSplit: 152,
        seconds: 60,
        partialMeters: 15,
        partialSeconds: 8.28,
      } as const;

      export const PARTIAL_STEP_LEG_B = {
        label: "1:00 @ 2:32",
        targetSplit: 152,
        seconds: 60,
        partialMeters: 37.6,
        partialSeconds: 10.9,
      } as const;
      ```
      It lives under `src/` rather than beside either test because neither test
      may import the other (`src/monitor/`'s own convention) and the server test
      cannot own a symbol the client test needs. Nothing in the app imports it,
      so it never reaches a bundle; `pnpm dist:grep` in Task 8 is the standing
      check for that.
- [ ] **Step 1: the failing POST→GET leg**, in `data.test.ts`'s own supertest
      idiom, inside the `pm5 fields` describe beside the `actualMeters: -1`
      legs. It imports the fixture — `import { PARTIAL_STEP_LEG_A } from
      "../../src/session/partialGateFixture.js";` — and posts a SPREAD of it,
      so the expected object and the posted body are the same declaration:

      ```ts
      // Door spec (2026-09-02) §5.1: the in-flight pair survives the route.
      // RF24 — this leg starts at the PRODUCER (the POST body) and asserts
      // after the READER (the GET), because both halves being well tested is
      // exactly the condition that hides a broken seam.
      it("round-trips partialMeters/partialSeconds through POST -> GET", async () => {
        const app = appFor(makeStores());
        const created = await asA(request(app).post("/api/logs")).send({
          ...validLogBody(),
          steps: [{ ...PARTIAL_STEP_LEG_A }],
        });
        expect(created.status).toBe(201);
        const fetched = await getLogById(app, created.body.id);
        expect(fetched.body.steps[0]).toStrictEqual({ ...PARTIAL_STEP_LEG_A });
      });

      it("rejects a half-pair: partialMeters with no partialSeconds", async () => {
        const res = await asA(
          request(appFor(makeStores())).post("/api/logs"),
        ).send({
          ...validLogBody(),
          steps: [{ label: "Row 1", partialMeters: 37.6 }],
        });
        expect(res.status).toBe(400);
        expect(res.body.field).toBe("steps");
        expect(res.body.error).toBe(
          "steps[0]: partialMeters and partialSeconds must both be present or both be absent",
        );
      });

      it("rejects a negative partialMeters, naming the field", async () => {
        const res = await asA(
          request(appFor(makeStores())).post("/api/logs"),
        ).send({
          ...validLogBody(),
          steps: [{ label: "Row 1", partialMeters: -1 }],
        });
        expect(res.status).toBe(400);
        expect(res.body.field).toBe("steps");
        expect(res.body.error).toBe(
          "steps[0]: partialMeters must be a number, >= 0",
        );
      });
      ```
      Add the mirror pair for `partialSeconds: -1`. **The negative-bound and
      half-pair legs stay hand-written literals** — they are about the
      validator's own rules, not about what the hook banks, so tying them to
      the replay fixture would couple two unrelated things.
      **`15 / 8.28` and `37.6 / 10.9` are not invented numbers** — they are
      the exact partials the two replays in Task 7 produce, and after Step 0
      this leg and that one read them from ONE declaration rather than two
      coincidentally equal literals.
      **No NaN/Infinity leg**: `JSON.parse('{"a":NaN}')` throws (run this
      session), so neither value can reach the validator over the wire and a
      400 test for them could never go red (RF21). The `Number.isFinite`
      check is defensive and its comment says so.
- [ ] **Step 2: run; verify red.**
      `pnpm test --project unit` → the round-trip leg fails with an
      `AssertionError` of the shape
      `expected { label: …, …(2) } to strictly equal { label: …, seconds: 60,
      …(3) }` (**measured this session** against a `label: 'Row 1'` body,
      before the fixture carried `1:00 @ 2:32`; the implementer quotes what it
      actually prints, not this); the negative leg and the half-pair leg both
      fail on `expected 201 to be 400`. **Quote all three.**
- [ ] **Step 3: widen the three type declarations.** In
      `app/src/session/logDraft.ts`, after `actualSpm?: number;`:

      ```ts
        /** Door spec (2026-09-02) §5.1: OUR reading of the interval that was
         *  still in flight when a connected session closed short — the last
         *  rowing frame's own 0x0031 distance, never an `IntervalActual`.
         *  Written ONLY by `buildMonitorLogSteps` below, only on a step with NO
         *  `actualSource`, and only from `MonitorRun.partial`. NEW KEY NAMES on
         *  purpose (§5.1): a partial carried in `actualMeters` would reach an
         *  older server as the number without its marker and enter every sum
         *  forever. Never summed, never paced (§5.2 I-B5). */
        partialMeters?: number;
        /** The same reading's ELAPSED time, not rowing time — the PM5 has no
         *  paused state and its clock runs whether or not the rower pulls
         *  (`domain/monitor/types.ts`). Paired with `partialMeters` above:
         *  `buildMonitorLogSteps` writes both or neither. */
        partialSeconds?: number;
      ```

      In `app/server/stores/logs.ts`, after `actualSpm?: number;`:

      ```ts
        /** Door spec (2026-09-02) §5.1: the in-flight interval's own reading on
         *  a connected close that was not `finished`. Independent, own-bounds
         *  mirror of `src/session/logDraft.ts`'s `LogStep` (this type's own
         *  convention). Bounds live in `routes/data.ts`'s
         *  `validateLogStepEntry`: finite, >= 0, NO upper bound against the
         *  step's own target (a partial can legitimately exceed a distance
         *  target by the last stroke). */
        partialMeters?: number;
        partialSeconds?: number;
      ```

      In `app/src/log/storedSummary.ts`, after `actualSpm?: number;`:

      ```ts
        /** Door spec (2026-09-02) §5.1 — the READ shape of the in-flight pair.
         *  The third of the three `LogStep` declarations task (0) widens (write:
         *  `session/logDraft.ts`; server: `server/stores/logs.ts`; read: here),
         *  and the one the partial step row renders from. Never summed: every
         *  reader in this file that adds step actuals reads
         *  `actualMeters`/`actualSeconds` and nothing else (§5.2 I-B5). */
        partialMeters?: number;
        partialSeconds?: number;
      ```
- [ ] **Step 4: the route.** Add `partialMeters, partialSeconds,` to
      `validateLogStepEntry`'s destructure (after `actualSpm,`), then the
      bounds immediately BEFORE the `// Built from an explicit field list`
      comment:

      ```ts
        // Door spec (2026-09-02) §5.1/§8.2 task (0): the in-flight pair's own
        // bounds. FINITE and >= 0, and deliberately NO upper bound against the
        // step's own `meters`/`seconds` target — a rower's last stroke can carry
        // a distance interval past its target before the close, and a validator
        // that refused it would 400 the whole save over an honest number.
        // `Number.isFinite` also covers the `typeof` check; NaN/Infinity are
        // unreachable over JSON (`JSON.parse('{"a":NaN}')` throws), so no test
        // asserts a 400 for them — the check is defensive, and saying so keeps
        // it from being read as a gate that could go red (RF21).
        if (
          partialMeters !== undefined &&
          (!Number.isFinite(partialMeters) || (partialMeters as number) < 0)
        ) {
          return { ok: false, message: at("partialMeters must be a number, >= 0") };
        }
        if (
          partialSeconds !== undefined &&
          (!Number.isFinite(partialSeconds) || (partialSeconds as number) < 0)
        ) {
          return { ok: false, message: at("partialSeconds must be a number, >= 0") };
        }
      ```
      then the PAIR check, immediately after those two bounds and still before
      the `// Built from an explicit field list` comment (harden lens 1,
      finding 4):

      ```ts
        // Door spec §5.1: the pair is a UNIT. Same both-or-absent rule
        // `actualSplit`/`actualSource` above already enforces for its own pair —
        // `buildMonitorLogSteps` writes both or neither, and a stored half-pair is a
        // metre count with no clock that no renderer can use.
        if ((partialMeters === undefined) !== (partialSeconds === undefined)) {
          return {
            ok: false,
            message: at("partialMeters and partialSeconds must both be present or both be absent"),
          };
        }
      ```
      **Prettier wraps that `message:` line**, measured this session, to:

      ```ts
            message: at(
              "partialMeters and partialSeconds must both be present or both be absent",
            ),
      ```
      Run `pnpm exec prettier --write server/routes/data.ts` and take its
      output verbatim — the WORDS are fixed, the wrapping is Prettier's.

      and the two field-list lines, after `if (seconds !== undefined) …`:

      ```ts
        if (partialMeters !== undefined) step.partialMeters = partialMeters as number;
        if (partialSeconds !== undefined)
          step.partialSeconds = partialSeconds as number;
      ```
      **`pnpm format:check` fails on this file if you write the first line
      wrapped** — Prettier joins it. Run `pnpm exec prettier --write
      server/routes/data.ts` and take its output verbatim.
- [ ] **Step 5: green, then MUTATE.** `pnpm test --project unit`.
      **M0.1** — delete the two field-list lines from step 4. The round-trip
      leg must go red with
      `AssertionError: expected { label: '1:00 @ 2:32', …(2) } to strictly
      equal { label: '1:00 @ 2:32', …(4) }` (**measured this session with the
      fixture-based leg**). Restore.
      **M0.2** — flip `< 0` to `< -1` in the `partialMeters` bound. The
      negative leg must go red with `expected 201 to be 400`.
      **M0.3** — delete the both-or-absent pair check. The half-pair leg must
      go red with `expected 201 to be 400`.
      Restore each; re-run; green.
- [ ] **Step 6: scoped gates.** `pnpm lint && pnpm typecheck && pnpm format:check`
      and `pnpm test --project unit`. **Deliverable:** the wire carries the
      pair, end to end, with nothing producing it yet.

---

## Task 1: `MonitorRun` carries the partial, and the one pure gate

**Files:**
- Modify: `app/src/monitor/monitorRun.ts` (`MonitorRun`, plus a new exported
  `withPartial`)
- Test: `app/src/monitor/monitorRun.test.ts`

**Interfaces produced:**

```ts
partial?: { intervalIndex: number; meters: number; seconds: number };

export function withPartial(
  run: MonitorRun,
  endedBy: CloseReason | "interrupted",
  reading: { intervalIndex: number; meters: number; seconds: number } | null,
): MonitorRun;
```

- [ ] **Step 1: the failing legs**, in `monitorRun.test.ts`:
      - `isMonitorRun` accepts a record carrying `partial` (tolerance, no `v`
        bump) **and** accepts one carrying an unknown key beside it — the
        second leg is what proves the tolerance is the validator's, not this
        field's.
      - `saveMonitorRun` → `loadMonitorRun` round-trips `partial` byte for
        byte. **Start at the writer, assert after the reader** (RF24).
      - `withPartial` refuses on `endedBy: "finished"` (I-B1) — returns the
        SAME object reference.
      - `withPartial` refuses a `null` reading (I-B3's caller contract) —
        same reference.
      - `withPartial` refuses when `run.actuals` already carries that index
        (I-B6) — same reference. Build the run from a real
        `createMonitorRun` + `recordActual`, never a hand-built literal
        (RF3).
      - `withPartial` accepts on each of the five allowlisted close reasons
        and returns a NEW object whose `partial` is the reading.
- [ ] **Step 2: run; verify red.** `withPartial is not a function`. **Quote it.**
- [ ] **Step 3: implement.** Add the field after `verificationBytes?`:

      ```ts
        /**
         * Door spec (2026-09-02) §5.1 — THE FIRST OF THE TWO STORED SHAPES this
         * change touches (the second is the posted `LogStep`). OUR reading of
         * the interval that was still in flight when this run closed short: the
         * last rowing frame's own 0x0031 `distanceMeters`/`elapsedSeconds`, plus
         * the program index they belong to. Never an `IntervalActual` (§5.2
         * I-B2), so `measuredIntervalCount` does not move and "N intervals kept"
         * is unchanged.
         *
         * Additive-optional with NO `v` bump, the same never-migrate contract
         * `endedBy`/`series`/`summaryTotals` above already established:
         * `isMonitorRun` is a positive conjunction with no unknown-key check
         * (its own comment says so), so an older build reading a newer record
         * ignores this and a newer build reading an older one sees `undefined`.
         *
         * Written ONCE, at close, by `withPartial` below — never by
         * `completeMonitorRun` (which is the wire-event closer and has no frame
         * in hand) and never after `completedAt` is set.
         */
        partial?: { intervalIndex: number; meters: number; seconds: number };
      ```

      and the gate, immediately above `completeContinuityReset`:

      ```ts
      /**
       * Door spec (2026-09-02) §5.2 — the in-flight reading's gate, as ONE pure
       * function so both close sites (`useMonitorSession.ts`'s `closeRecord` and
       * its continuity-reset commit) apply the identical rule rather than two
       * copies of it.
       *
       * - **I-B1** — nothing is banked on a `"finished"` close. Tier B2
       *   (`storedSummary.ts`'s `isReconstructableClose`) therefore never sees a
       *   partial and its GATED population stays provably historical.
       * - **I-B3** — the caller passes `null` once the in-flight interval's WORK
       *   BOUT has ended; this function does not re-derive that from timing.
       * - **I-B6** — never for an interval that already carries an
       *   `IntervalActual`, checked against the RECORD, never against boundary
       *   timing: `MonitorFrame.intervalIndex` lags the machine's own interval
       *   reset by up to 810 ms (`walk-2026-08-16/session-1-keystone-2x250r0.jsonl`),
       *   so a rowing frame can carry the index of an interval whose actual is
       *   already banked. Without this check a close in that window writes
       *   `partialMeters: 0` beside `actualMeters: 250`.
       *
       * Returns its input unchanged when any gate refuses, so a caller can hand
       * the result straight on without an identity check of its own.
       */
      export function withPartial(
        run: MonitorRun,
        endedBy: CloseReason | "interrupted",
        reading: { intervalIndex: number; meters: number; seconds: number } | null,
      ): MonitorRun {
        if (endedBy === "finished") return run;
        if (reading === null) return run;
        if (run.actuals.some((a) => a.index === reading.intervalIndex)) return run;
        return { ...run, partial: reading };
      }
      ```
      **`isMonitorRun` gains NO check for this field** — write-once and
      identity are the writer's job, not the validator's, the same ruling
      `summaryTotals` already carries.
- [ ] **Step 4: green, then MUTATE.**
      **M1.1** — delete `if (endedBy === "finished") return run;`. The I-B1
      leg goes red (`expected { …, partial: {…} } to be` the same reference).
      **M1.2** — delete the `run.actuals.some(...)` line. The I-B6 leg goes
      red.
      **M1.3** — add `partial: undefined` handling to `isMonitorRun` as a
      REJECTION (`value.partial === undefined`). The tolerance leg goes red.
      Restore each; re-run; green.
- [ ] **Step 5: scoped gates.** `pnpm lint && pnpm typecheck && pnpm format:check`
      and `pnpm test --project client` (`monitorRun.test.ts` is a client
      project file — it uses `localStorage`).
      **Deliverable:** the durable shape exists and its gate is proven, with
      no producer yet.

---

## Task 2: the ref and its lifetime

**Files:**
- Modify: `app/src/monitor/useMonitorSession.ts`
- Test: `app/src/monitor/useMonitorSession.test.ts`

**Interfaces:** none exported. `lastRowingFrameRef` and
`noteFrameForPartial` are module-internal to the hook.

- [ ] **Step 1: the failing legs.** One `describe` in
      `useMonitorSession.test.ts`, driving the hook through its existing fake
      transport, asserting on `loadMonitorRun()?.partial` after a close:
      - **The mint:** a rowing frame with a non-null index, then a close →
        the partial is that frame's `distanceMeters`/`elapsedSeconds`.
      - **I-B3 (a):** …then a `resting` frame carrying the SAME index, then a
        close → no partial.
      - **I-B3 (b):** …then an accepted `intervalComplete` for the same
        index, then a close → no partial.
      - **I-B6 at mint:** an accepted actual for index 0, then a SYNTHETIC
        rowing frame carrying `intervalIndex: 0` (the 810 ms lag shape), then
        a close → **no partial**, and the interval's `actualMeters` is
        untouched. **This is the synthetic leg §8.2 prescribes; no committed
        capture contains the window** (Finding 6).
      - **A null-index rowing frame** (the D3 divergence) → no partial.
      - **FOUR clear-site legs, one per symbol** — after minting a reading,
        drive the hook through each of `program()`, `beginFreeRow()`,
        `cancel()` and the RC-37 programDropped/ready exit, then close and
        assert no partial. **Name the symbol in each test title**, so a future
        reader can tell which site a red leg means.
      - **`connect()` and `teardown()` get NO leg: they are DEFENSIVE**
        (harden lens 1, finding 5). No supported ordering closes a record
        after either — `runRef.current` is `null` once each has run, so
        `closeRecord` returns at its own no-record guard and nothing reads the
        ref again. Their clears stay in the code as belt-and-braces, say so in
        their own `// §5.3:` comments, and are listed under **Ungated by
        design** rather than given a leg that could not go red (RF21).
- [ ] **Step 2: run; verify red.** **Quote the failure.**
- [ ] **Step 3: declare the ref and the mint function**, immediately after
      `rowingStreakRef`:

      ```ts
        /** Door spec (2026-09-02) §5.3's LIFETIME TABLE, in one ref.
         *
         *  MINT: every `state === "rowing"` frame of the LIVE run whose
         *  `intervalIndex` is non-null and whose interval does not already carry
         *  an `IntervalActual` (I-B6) — `noteFrameForPartial` below is the only
         *  writer.
         *  CLEAR: the first `resting` frame carrying that interval's index, or
         *  that interval's own accepted `IntervalActual`, whichever comes first
         *  (I-B3 — the two are up to a full programmed rest apart: 59 940 ms on
         *  `walk-2026-08-28/rest-boundary-recording.jsonl.gz`); the FOUR per-run
         *  reset sites `rowingStreakRef` clears at (the RC-37 programDropped/ready
         *  exit in `handleEvent`, `beginFreeRow()`, `cancel()`, and `program()` —
         *  the last of those NOT beside `rowingStreakRef`'s own clear, because
         *  `program()`'s catch is itself one of the five producers; see that
         *  function); and, DEFENSIVELY and for this ref only, `connect()` and
         *  `teardown()`. SIX sites, found by symbol; FOUR of them carry a leg.
         *  SURVIVES teardown / relaunch / re-arm: no / no / no. */
        const lastRowingFrameRef = useRef<{
          intervalIndex: number;
          meters: number;
          seconds: number;
        } | null>(null);

        /** §5.3's mint and its two event-shaped clears, in one place so the
         *  lifetime is readable as a unit rather than reconstructed from call
         *  sites. Reads refs only — `[]` deps are honest. */
        const noteFrameForPartial = useCallback((frame: MonitorFrame): void => {
          const index = frame.intervalIndex;
          if (index === null) return;
          if (frame.state === "resting") {
            // I-B3, half one: the work bout is over. This fires ~60 s BEFORE the
            // interval's own `IntervalActual` on a rested program, and an End
            // during that rest would otherwise store a COMPLETED interval as a
            // partial and count it unmeasured.
            if (lastRowingFrameRef.current?.intervalIndex === index) {
              lastRowingFrameRef.current = null;
            }
            return;
          }
          if (frame.state !== "rowing") return;
          // I-B6 at MINT time, against the RECORD. `intervalIndex` lags the
          // machine's interval reset by up to 810 ms, so a rowing frame can
          // carry the index of an interval whose actual is already banked;
          // re-minting onto it is what would produce `partialMeters: 0` beside
          // `actualMeters: 250`. `withPartial` checks the same thing again at
          // close — belt and braces, and the close-time check is the durable one
          // because it reads the record the partial is about to be written to.
          if (runRef.current?.actuals.some((a) => a.index === index) === true) {
            return;
          }
          lastRowingFrameRef.current = {
            intervalIndex: index,
            meters: frame.distanceMeters,
            seconds: frame.elapsedSeconds,
          };
        }, []);
      ```
- [ ] **Step 4: the two mint call sites**, in `handleFrame`. At the ready→live
      seed, immediately above its `update({ frame, phase: "live", … })`:

      ```ts
            // §5.3: the run's FIRST frame is a rowing frame of the live run
            // and mints like any other. Without this call an End inside the
            // very first frame after the record opens would bank nothing —
            // honest, but needlessly so, and this is the one frame the live
            // branch below never sees (it returns here).
            noteFrameForPartial(frame);
      ```
      and as the LAST statement of the `phase === "live"` branch, immediately
      above its `update({ frame, frozen: nowPaused });`:

      ```ts
              // §5.3: LAST in this branch, on purpose. The continuity-reset
              // commit above reads `lastRowingFrameRef` to bank what was LAST
              // RECEIVED (§5.1) — and the frame that TRIPS a continuity reset is
              // by definition the dishonest one, so it must not have been folded
              // into the ref before that read.
              noteFrameForPartial(frame);
      ```
      Add `noteFrameForPartial` to `handleFrame`'s dependency array.
      **THE ORDERING IS LOAD-BEARING AND IS NOT A STYLE CHOICE.** Putting the
      mint above the continuity check would bank the very frame whose
      dishonesty caused the reset.
- [ ] **Step 5: the six clear sites, by symbol — five of them beside an
      existing reset, and `program()` NOT.** For the five, put the line
      immediately beside the existing per-run/per-attempt reset it belongs
      with, with a one-line `// §5.3:` comment naming why:
      - the RC-37 programDropped/ready exit in `handleEvent` — beside
        `rowingStreakRef.current = null;` / `lastContinuityRef.current = null;`
      - `beginFreeRow()` — beside its `rowingStreakRef.current = null;`
        (**its comment must note this is the copy the file itself records
        being missed before**)
      - `cancel()` — beside its `rowingStreakRef.current = null;`
      - `connect()` — beside `livenessRef.current = null;`, DEFENSIVE, with
        the note that `rowingStreakRef` deliberately does NOT clear here and
        that no supported ordering closes a record after a fresh attempt
        begins (`runRef.current` is null by then, so `closeRecord` returns at
        its no-record guard)
      - `teardown()` — beside `frameArrivalsRef.current = [];`, DEFENSIVE,
        with the note that teardown runs after every close has already read
        the ref

      **`program()` IS THE EXCEPTION, AND GETTING IT WRONG IS A BLOCKER**
      (harden lens 1, finding 1). Its `rowingStreakRef` clear sits at the TOP
      of the function, above the `try` — and `program()`'s catch CLOSES the
      previous run with `"program-failed"`, one of §5.3's five producers. A
      clear there empties the ref before that close reads it, and Task 3's
      `program-failed` leg becomes unpassable. Put it instead at the two
      points where `program()` is finished with the OLD run — in the catch
      immediately after `closeRecord(true, "program-failed"); update({ runOpen:
      false });`, and on the success path immediately after
      `await driver.program(p);` — with this comment at each:

      ```ts
      // §5.3: deliberately NOT beside `rowingStreakRef`'s own clear at the top
      // of this function. `program()` is the only arming site that also CLOSES
      // the run it is replacing (its catch writes `program-failed`, one of §5.3's
      // five producers), so the reading has to survive until that close has read
      // it. Nothing can mint in between: `noteFrameForPartial` runs only in
      // `handleFrame`'s ready-seed and `live` branches, and the synchronous
      // `update({ phase: "programming" })` above moves `stateRef` off both before
      // the first await (this function's own double-fire pin says so).
      lastRowingFrameRef.current = null;
      ```

      The `driver === null` early return deliberately clears nothing: that
      attempt armed nothing, so a still-open run keeps a reading a later close
      is entitled to.
- [ ] **Step 6: the accepted-actual clear**, in the `intervalComplete`
      handler, immediately above `if (accepted && applyProducerCommit(next))`:

      ```ts
              // §5.3, I-B3 half two: the interval's own actual has landed, so
              // its work bout is over by the other of the two events. On a
              // program with rests the `resting` clear above already fired ~60 s
              // ago and this is a no-op; on an `r0` program (no rest frames at
              // all) this is the ONLY clear, and it fires 180 ms after the last
              // rowing frame (`walk-2026-08-16/session-1-keystone-2x250r0.jsonl`).
              // Keyed on ACCEPTANCE, so a refused actual (a closed record, a free
              // row) never retires a reading the record still owns.
              if (
                accepted &&
                lastRowingFrameRef.current?.intervalIndex === event.actual.index
              ) {
                lastRowingFrameRef.current = null;
              }
      ```
- [ ] **Step 7: green, then MUTATE, one per leg.** Each mutation names the leg
      it must redden:
      **M2.1** delete the `resting` clear → the I-B3 (a) leg red.
      **M2.2** delete the accepted-actual clear → the I-B3 (b) leg red.
      **M2.3** delete the `runRef.current?.actuals.some(...)` guard → the
      I-B6 mint leg red.
      **M2.4** drop `if (index === null) return;` → the D3 leg red.
      **M2.5–M2.8** delete each of the FOUR gated clear-site lines in turn
      (`program()`, `beginFreeRow()`, `cancel()`, the RC-37 exit) → its own
      named leg red, and **only** its own. If deleting one leaves every leg
      green, that site has no gate and the report says so rather than shipping
      it unproven (RF21). `connect()`'s and `teardown()`'s clears carry no
      mutation because they carry no leg — they are declared defensive under
      **Ungated by design** instead (finding 5).
      **M2.11** move the live-branch `noteFrameForPartial(frame)` ABOVE the
      continuity check → Task 3's continuity leg goes red (run it after Task 3
      and record it there).
- [ ] **Step 8: scoped gates.** lint · typecheck · format:check ·
      `pnpm test --project client`.
      **Deliverable:** the ref lives and dies correctly, with nothing reading
      it yet.

---

## Task 3: the read, at both close sites

**Files:**
- Modify: `app/src/monitor/useMonitorSession.ts` (`closeRecord`; the
  continuity-reset commit; the `withPartial` import)
- Test: `app/src/monitor/useMonitorSession.test.ts`

- [ ] **Step 1: the failing legs — FIVE producers, each asserting the partial
      lands on the RIGHT step, plus `finished` → none.** All six drive the
      hook and read `loadMonitorRun()`:
      | leg | how it is reached | expected `endedBy` |
      | --- | --- | --- |
      | End, link up | `endSession()` with `phase === "live"` and `frameSilence` false | `rower` |
      | End, link gone | `endSession()` with `frameSilence` latched (`linkGone`) | `link-lost` |
      | machine TERMINATE | a `ws=11` frame → `endByMachine(true)` | `rower` |
      | program dropped mid-row | the live `programDropped` event | `program-dropped` |
      | `program()` fails over an open run | the catch arm | `program-failed` |
      | natural finish | a WORKOUTEND frame → `endByMachine(false)` | `finished`, **and `partial` is `undefined`** |
      | continuity reset | a stream that violates `continuity.ts`'s `check` while `frameSilence` is latched | `link-lost`, **partial present** |
      Each of the six positive legs also asserts `run.actuals` and
      `measuredIntervalCount(run.actuals)` are **unchanged** by the partial
      (I-B2).
- [ ] **Step 2: run; verify red.** **Quote the failure.**
- [ ] **Step 3: import and apply, inside `closeRecord`.** Add `withPartial,`
      to the `./monitorRun` import list, then:

      ```ts
            const withFinalSeries = withSeries(run);
            // Door spec §5.3: THE ONE READ, covering FOUR of the five producers
            // of an allowlisted `endedBy` — the End arm (`rower` or `link-lost`
            // by `linkGone`), `endByMachine`'s `terminated` arm (the PM5's own
            // Menu, and the arm every committed capture exercises because a
            // replay cannot press a button), the live `programDropped` arm, and
            // `program()`'s catch. Gated inside `withPartial` on I-B1/I-B3/I-B6,
            // never per arm. The fifth producer (the continuity reset) never
            // reaches this function and carries the same read at its own commit.
            const banked = withPartial(
              withFinalSeries,
              endedBy,
              lastRowingFrameRef.current,
            );
            const next = completeMonitorRun(
              banked,
              { terminated, endedBy },
              nowDate(),
            );
      ```
- [ ] **Step 4: the fifth producer.** In the continuity branch, after
      `const withFinalSeries = withSeries(closed);`:

      ```ts
                // Door spec §5.3, THE FIFTH PRODUCER. `completeContinuityReset`
                // is a pure transform committed here, never through
                // `closeRecord`, so a read installed only there would miss this
                // close entirely. `closed.endedBy` is `"link-lost"`
                // (`monitorRun.ts`'s `completeContinuityReset`); the `??` is a
                // total-function fallback, not a case this reaches.
                const banked = withPartial(
                  withFinalSeries,
                  closed.endedBy ?? "link-lost",
                  lastRowingFrameRef.current,
                );
      ```
      and change the commit below it from `applyProducerCommit(withFinalSeries)`
      to `applyProducerCommit(banked)`. **`withFinalSeries` stays as its own
      const** so the surrounding comment about `withSeries` returning a new
      object remains true of the thing it describes.
- [ ] **Step 5: green, then MUTATE.**
      **M3.1** invert `withPartial`'s gate to `if (endedBy !== "finished")
      return run;` → all five positive legs red, `finished` leg still green.
      Record the exact text of one.
      **M3.2** revert step 4 (`applyProducerCommit(withFinalSeries)`) → **only**
      the continuity leg red. If any other leg also reddens, the continuity leg
      is not isolated and the report says so.
      **M3.3** replace `lastRowingFrameRef.current` with `null` at the
      `closeRecord` site only → the four `closeRecord` legs red, the continuity
      leg green — the discriminating probe that the two sites are genuinely
      two.
      **M3.4** move `program()`'s clear back to the TOP of `program()`, beside
      `rowingStreakRef.current = null;` → the `program-failed` leg goes red,
      because the arm empties the ref before its own catch closes the run it
      is replacing. This is harden lens 1's finding 1 as a probe, and it is
      the reason Task 2 step 5 puts that one clear somewhere else.
      **M2.11 from Task 2** (mint moved above the continuity check) → the
      continuity leg banks the dishonest frame; record what it banked.
- [ ] **Step 6: scoped gates.** lint · typecheck · format:check ·
      `pnpm test --project client`.
      **Deliverable:** the durable record carries the partial on all five
      producers and on none other.

---

## Task 4: `buildMonitorLogSteps` copies the pair, and the I-B5 census

**Files:**
- Modify: `app/src/session/logDraft.ts` (`buildMonitorLogSteps`)
- Add: `app/scripts/partial-key-census.sh`
- Test: `app/src/session/logDraft.test.ts`, `app/src/log/storedSummary.test.ts`

- [ ] **Step 1: the failing legs.**
      - `buildMonitorLogSteps` puts the pair on the step whose PROGRAM index
        matches `run.partial.intervalIndex`, and on no other.
      - It writes **neither** `actualMeters` nor `actualSeconds` for that step
        (the anti-leg — assert their absence explicitly).
      - A run whose partial index collides with an interval that HAS an actual
        writes no partial (I-B6 restated on the read side).
      - **The legacy warm-up leg:** a `MonitorRun` whose `logSeed.steps[0]`
        carries `kind: "warmup"` (the persisted legacy population the existing
        guard exists for) and whose `partial.intervalIndex` is `1` puts the
        pair on the FIRST emitted step — because the warm-up step returns
        without pushing and `out.length` has diverged from `i`. **This is the
        leg that would go red if anyone keyed on `out.length`.**
      - Build every fixture from a real library workout via the file's
        existing helpers, never a hand-built minimum (RF3).
- [ ] **Step 2: the I-B5 census as a TEST**, in `storedSummary.test.ts`: one
      `it` that takes a realistic seeded `StoredLog` and asserts that adding
      `partialMeters`/`partialSeconds` to one of its steps changes **nothing**
      about `buildStoredSummary(row)`'s heroes, total line, caption, or
      `measuredElapsedSeconds` for that step. One `expect` comparing the whole
      summary object with and without the keys — which covers
      `stepActualSums`, `tierBAvgSplitSeconds`, the `hasStepActuals`
      predicate, `buildStoredRest`, `buildStoredTotalLine` and
      `measuredElapsedSeconds` in one assertion, because every one of them is
      upstream of that object. **`rows` is the one field that legitimately
      differs after Task 5** — compare `{...summary, rows: undefined}` and say
      so in the test's own comment, or run this test BEFORE Task 5 and widen
      it afterwards; do not silently loosen it.
      Then two separate legs the summary object cannot cover:
      - **the C2 mapping** — `eligibilityFailure` over a row whose steps carry
        the keys returns the identical verdict (and the fence excludes every
        partial row anyway: `endedBy === "finished"`).
      - **`heroDistanceMeters`** — **stated, not asserted.** `RecentLog` has
        no `steps` field, so no value of the new keys can reach it. Put that
        sentence in the census test's comment rather than writing an equality
        leg that could never fail (RF21).
- [ ] **Step 3: the census SCRIPT**, `app/scripts/partial-key-census.sh`:

      ```bash
      #!/usr/bin/env bash
      # Door spec (2026-09-02) §5.2 I-B5, as a SCRIPT rather than a table.
      set -euo pipefail
      cd "$(dirname "$0")/.."
      echo "== every non-test reader of actualMeters/actualSeconds under src/ server/ domain/"
      grep -rn --include='*.ts' --include='*.tsx' -E 'step\.(actualMeters|actualSeconds)' \
        src server domain | grep -v '\.test\.' || true
      echo
      echo "== every generic iteration over a step object (spread / Object.keys / entries)"
      grep -rn --include='*.ts' --include='*.tsx' -E '(\.\.\.step|Object\.(keys|entries|values)\([a-zA-Z]*[Ss]tep)' \
        src server domain | grep -v '\.test\.' || true
      ```
      **Run it and paste its output into the task report and the PR's Record
      block**, base and head, with every hit classified. Its output at
      `a50e06f3` + this plan's own implementation is in the Measurements
      appendix; the four hits in the second section are all FALSE POSITIVES
      (`src/session/draft.ts` spreads the BUILDER's `WorkoutStep`, a different
      type; the two `domain/` hits are `...steps.errors` and a destructuring
      rest). **Do not transcribe those numbers into the plan or the PR body —
      ship the script's output.**
- [ ] **Step 4: implement**, in `buildMonitorLogSteps`, immediately before
      `out.push(step);`:

      ```ts
          // Door spec (2026-09-02) §5.1: the in-flight interval's own reading,
          // copied onto the step it belongs to and NEVER into
          // `actualMeters`/`actualSeconds`. Keyed on the PROGRAM index `i` (the
          // index `MonitorRun.partial` carries), not on `out.length` — a legacy
          // warm-up seed step returns above without pushing, so the two diverge.
          // `actual === undefined` restates I-B6 on the read side: the writer
          // (`withPartial`) already refuses an interval that carries an actual,
          // and a step can never show both.
          const partial = run.partial;
          if (
            partial !== undefined &&
            partial.intervalIndex === i &&
            actual === undefined
          ) {
            step.partialMeters = partial.meters;
            step.partialSeconds = partial.seconds;
          }
      ```
- [ ] **Step 5: green, then MUTATE.**
      **M4.1** change `partial.intervalIndex === i` to
      `partial.intervalIndex === out.length` → the legacy warm-up leg red.
      **M4.2** write into `step.actualMeters`/`step.actualSeconds` instead →
      the anti-leg red **and** the I-B5 census test red (the heroes move) —
      two independent reds for the one mistake this whole key-naming decision
      exists to prevent.
      **M4.3** drop `actual === undefined` → the collision leg red.
- [ ] **Step 6: scoped gates.** lint · typecheck · format:check ·
      `pnpm test --project unit --project client`.
      **Deliverable:** the partial reaches the POST body and no reader that
      sums anything has moved.

---

## Task 5: the step row, both interval kinds

**COPY AND CSS VALUES APPROVED at Gate 0-B (James, 2026-09-02) — decisions
(a), (b), (c), (d), (f) and (g). Nothing here is a proposal.**

**Files:**
- Modify: `app/src/session/summaryModel.ts` (`PrescribedRow`, a new
  `partialRowLabel`, a new `partialCaption`, `monitorWorkRows`,
  `buildMonitorModel`'s caption)
- Modify: `app/src/log/storedSummary.ts` (`buildRows`, `buildStoredSummary`'s
  caption)
- Modify: `app/src/session/PostWorkoutSummary.tsx` (`IntervalRow`)
- Modify: `app/src/index.css` (`.summary-row-partial`)
- Test: `app/src/session/summaryModel.test.ts`,
  `app/src/log/storedSummary.test.ts`,
  `app/src/session/PostWorkoutSummary.test.tsx`,
  `app/src/log/FromTheLog.test.tsx`

**Interfaces produced:**

```ts
// summaryModel.ts
export function partialRowLabel(
  step: Pick<LogStep, "partialMeters" | "partialSeconds" | "seconds">,
): string | undefined;

export function partialCaption(
  rows: SummaryRow[],
  endedBy: (CloseReason | "interrupted") | null | undefined,
): string | undefined;

// PrescribedRow gains:
partialLabel?: string;
```

**The design decision, stated because it is not obvious.** A partial step is
by construction UNMEASURED — it carries no `actualSource`, so
`measuredElapsedSeconds`/`isMonitorRowMeasurable` return `undefined` and it
renders through `PrescribedRow`, the branch that today shows a `—`. The
partial replaces that dash. **ONE renderer serves both doors**
(`IntervalRow`), and **ONE formatter serves both builders**, so the log door
(before saving) and the saved row cannot describe the same number two ways.

- [ ] **Step 1: the failing legs.**
      - `partialRowLabel` on a DISTANCE interval (`meters` set, `seconds`
        absent) → `250 m · 1:03`.
      - on a TIME interval (`seconds` set) → `2:10 · 480 m`.
      - with only one of the two keys → `undefined` (the pair is a unit).
      - `monitorWorkRows` and `buildRows` both put the SAME string on the
        same step for the same data — one test, both builders, one expected
        value. **This is the leg that catches a second copy of the format.**
      - `IntervalRow` renders `.summary-row-partial` with that text and NO
        `.summary-row-dash` when a partial is present; the reverse when it is
        not.
      - **No pace, split or rate cell appears on a partial row** — assert
        `.summary-row-pace` and `.summary-row-dev` are absent, so a future
        "helpful" derivation goes red.
      - The aria-label reads the partial rather than `not measured`.
      - **A structural CSS pin** (docs/TESTING.md §8): `.summary-row-partial`
        exists, is `white-space: nowrap`, and `flex-shrink` is `0` — asserted
        on the RULE for the FLEX ITEM, never a descendant (RF21's recorded
        failure was a `min-width` on a child, where the shrink algorithm never
        reads it).
      - **The link-lost caption (Gate 0-B decision (c)), three legs at the
        MODEL** (`summaryModel.test.ts` for `buildMonitorModel`,
        `storedSummary.test.ts` for `buildStoredSummary` — each owns its own
        call, so each needs its own leg): a `link-lost` model whose rows carry
        a partial has `caption ===
        "INTERVAL 1 · LAST READING BEFORE THE LINK WENT"`; the SAME rows on a
        `rower` close have the caption they have today; and a
        SINGLE-INTERVAL link-lost row — the one case where
        `targetsOnlyCaption` also fires — has `caption` **exactly equal to the
        partial sentence**, never `TARGETS ONLY · NOTHING MEASURED` and never
        a concatenation of the two (the gate's C2b frame: precedence, not
        stacking). Equality, never `toContain` — a `toContain` assertion
        stays green under a stacked value, which is the failure this leg
        exists for.
      - **And one RENDERED leg** (`PostWorkoutSummary.test.tsx`): the
        single-interval link-lost model renders **exactly one**
        `.summary-targets-only-caption` element with that text. The model legs
        gate the VALUE; this one gates that the block still renders one
        element for it.
- [ ] **Step 2: run; verify red.** **Quote the failure.**
- [ ] **Step 3: the formatter**, in `summaryModel.ts` above
      `measuredIntervalCount`:

      ```ts
      /** Door spec (2026-09-02) §5.1 — the in-flight pair, formatted, and the
       *  ONE place that decides its order and separator.
       *
       *  **APPROVED at Gate 0-B (James, 2026-09-02), decisions (a) and (b).**
       *  The order puts the counted-DOWN dimension first: a distance interval
       *  reads `250 m · 1:03`, a time interval `2:10 · 480 m`. Nothing else in
       *  the codebase re-derives either the order or the separator.
       *
       *  NO SPLIT, PACE OR RATE IS DERIVED FROM THIS PAIR (§5.1). The seconds
       *  are ELAPSED, not rowing time — the PM5 has no paused state and its
       *  clock runs whether or not the rower pulls — so a quotient of the two
       *  would be a number nobody rowed. */
      export function partialRowLabel(
        step: Pick<LogStep, "partialMeters" | "partialSeconds" | "seconds">,
      ): string | undefined {
        const meters = step.partialMeters;
        const seconds = step.partialSeconds;
        if (meters === undefined || seconds === undefined) return undefined;
        const metersLabel = `${Math.round(meters)} m`;
        const clockLabel = fmtDuration(seconds / 60);
        return step.seconds === undefined
          ? `${metersLabel} · ${clockLabel}`
          : `${clockLabel} · ${metersLabel}`;
      }
      ```
- [ ] **Step 4: `PrescribedRow` gains the field**, with the reason it is
      assigned CONDITIONALLY spelled out:

      ```ts
        /** Door spec (2026-09-02) §5.1: the in-flight interval's own reading,
         *  already formatted — `partialRowLabel` below is the ONE producer, and
         *  both row builders (this file's `monitorWorkRows` for the live/log
         *  door and `log/storedSummary.ts`'s `buildRows` for the stored screen)
         *  call it rather than formatting twice. Present ONLY on a step whose
         *  `partialMeters`/`partialSeconds` are both set — a partial step is by
         *  construction UNMEASURED (it carries no `actualSource`), which is why
         *  this lives here and not on `MeasuredRow`.
         *
         *  ASSIGNED CONDITIONALLY by both builders, never as an explicit
         *  `undefined`: rows in this repo are compared with `toStrictEqual`
         *  (`docs/TESTING.md` §3's `vitest/prefer-strict-equal`), which
         *  distinguishes an absent key from a present-and-undefined one. */
        partialLabel?: string;
      ```
- [ ] **Step 5: both builders.** In `monitorWorkRows` and in
      `storedSummary.ts`'s `buildRows`, turn the unmeasured branch's inline
      `return { … }` into a named `const row: PrescribedRow = { … };`, then:

      ```ts
            const partial = partialRowLabel(step);
            if (partial !== undefined) row.partialLabel = partial;
            return row;
      ```
      `storedSummary.ts` imports `partialRowLabel` and `type PrescribedRow`
      from `../session/summaryModel` — it already imports `SummaryRow` and
      `rowJudgment` from there, so no new module edge is created.
- [ ] **Step 5b: the link-lost caption** (Gate 0-B decision (c)). In
      `summaryModel.ts`, beside `targetsOnlyCaption` — and add
      `type CloseReason,` to this file's existing `../monitor/monitorRun.js`
      import:

      ```ts
      /** Door spec (2026-09-02) §6, Gate 0-B decision (c), APPROVED: on a
       *  `link-lost` close the pair is what GOT THROUGH, not where the rower got
       *  to, and the ROW itself cannot say so — an inline word collapses the
       *  pace-ref cell to zero (measured at the gate). The sentence goes under
       *  the table instead, in `.summary-targets-only-caption`'s own type (mono
       *  10px, `--ink-3`, centred; 6.69:1 on `--page`, computed at the gate).
       *
       *  PRECEDENCE, NEVER STACKING (the gate's C2b frame): a single-interval
       *  link-lost piece measures nothing, so `targetsOnlyCaption` fires in the
       *  very same slot. When this caption fires it REPLACES that one — two
       *  centred captions read as clutter, and `TARGETS ONLY · NOTHING MEASURED`
       *  is arguably false once a reading is on the row. Both callers therefore
       *  write `partialCaption(...) ?? targetsOnlyCaption(rows)` and neither
       *  renders a second element. */
      export function partialCaption(
        rows: SummaryRow[],
        endedBy: (CloseReason | "interrupted") | null | undefined,
      ): string | undefined {
        if (endedBy !== "link-lost") return undefined;
        const row = rows.find(
          (r) => r.measured === false && r.partialLabel !== undefined,
        );
        if (row?.index === undefined) return undefined;
        return `INTERVAL ${row.index} · LAST READING BEFORE THE LINK WENT`;
      }
      ```

      Then both callers, which already have the close reason in hand:
      `buildMonitorModel`'s `caption: targetsOnlyCaption(rows),` becomes
      `caption: partialCaption(rows, run.endedBy) ?? targetsOnlyCaption(rows),`
      and `buildStoredSummary`'s `const caption = targetsOnlyCaption(rows);`
      becomes
      `const caption = partialCaption(rows, row.endedBy) ?? targetsOnlyCaption(rows);`
      — **on ONE line**; Prettier joins it (measured: writing it wrapped fails
      `format:check` on `storedSummary.ts`).
      `storedSummary.ts` adds `partialCaption` to the import it already takes
      from `../session/summaryModel`. **The other two `targetsOnlyCaption`
      call sites (the timer door, and the no-record manual model) are NOT
      touched** — neither has a `MonitorRun` or a stored `endedBy`, and
      neither can carry a partial row.
- [ ] **Step 6: the renderer**, replacing `IntervalRow`'s unmeasured
      `return`:

      ```tsx
        // Door spec (2026-09-02) §5.1: a step the rower was IN THE MIDDLE OF
        // when the session closed short reads its own two numbers where an
        // unreached step reads the dash. Both are unmeasured rows — the
        // difference is that one has a reading and the other genuinely has
        // nothing. Gate 0-B decision (g), APPROVED: the accessible name says
        // `stopped at 250 m · 1:03`. Decision (d): an over-target partial
        // reads exactly the same way — there is no over/under branch here.
        return (
          <li
            className="summary-row"
            aria-label={`Interval ${row.index}: ${row.label}${
              row.partialLabel === undefined
                ? ", not measured"
                : `, stopped at ${row.partialLabel}`
            }`}
          >
            <span className="summary-row-index">{row.index}</span>
            <span className="summary-row-duration">{row.durationLabel ?? ""}</span>
            <span className="summary-row-target">{row.targetPaceLabel ?? ""}</span>
            <span className="summary-row-offset">{offsetFragment(row.label)}</span>
            {row.partialLabel === undefined ? (
              <span className="summary-row-dash">—</span>
            ) : (
              <span className="summary-row-partial">{row.partialLabel}</span>
            )}
          </li>
        );
      ```
- [ ] **Step 7: the CSS**, immediately after `.summary-row-dash`:

      ```css
      /* Door spec (2026-09-02) §5.1: the in-flight pair, in the slot the dash
         occupies on an unreached row. `flex: 0 0 auto` plus `nowrap` ON THE FLEX
         ITEM ITSELF — RF21's own recorded failure was a `min-width` placed on a
         CHILD of the flex item, where the shrink algorithm never reads it. The
         e2e no-clip assertion measures THIS element's `scrollWidth` against its
         `clientWidth`, and this element is a block-level flex item, so both are
         real (an inline element reports 0 for both, RF21's second smell).
         `.summary-row-offset` beside it is `flex: 1; min-width: 0` and already
         ellipsises, so it is what yields the space. VALUES APPROVED at Gate
         0-B (James, 2026-09-02). */
      .summary-row-partial {
        flex: 0 0 auto;
        text-align: right;
        white-space: nowrap;
        font-family: var(--font-mono);
        font-size: 13px;
        color: var(--ink-2);
      }
      ```
      **Contrast, computed, not eyeballed:** `--ink-2` (`#3f3c35`) on `--page`
      (`#f4f1e8`) is **9.75:1** and on `--surface` is **10.81:1**, both against
      the 4.5:1 floor — the numbers `index.css` itself already carries for this
      exact pairing, which `.summary-row-time` ships with. The gate's own
      contrast table carries it. **State the number in the PR.**
- [ ] **Step 8: green, then MUTATE.**
      **M5.1** invert the order inside `partialRowLabel`'s ternary → the two
      kind legs swap and both go red.
      **M5.2** make `buildRows` format its own string instead of calling
      `partialRowLabel` (change the separator) → the both-builders-agree leg
      red. **This is the mutation that proves there is one formatter.**
      **M5.3** delete `white-space: nowrap` → the structural pin red, and
      re-run the e2e no-clip leg (Task 8) to confirm it also bites there.
      **M5.4** render `row.partialLabel` inside a nested `<span>` within
      `.summary-row-dash` → the structural pin's flex-item assertion red.
      **M5.5** drop `partialCaption`'s `endedBy !== "link-lost"` guard → the
      `rower`-close leg red (the caption appears where it must not).
      **M5.6** change BOTH callers from `??` to a concatenation
      (`[partialCaption(...), targetsOnlyCaption(rows)].filter(Boolean).join(" · ")`)
      → the single-interval caption legs red in both model tests. This is the
      mutation that proves precedence rather than stacking; an assertion
      written with `toContain` would stay green under it, which is why the
      legs are written as equality.
      **M5.7** make `partialCaption` read `rows[0]` instead of `rows.find(…)`
      → the multi-interval leg red (the caption names the wrong interval). A
      single-interval fixture cannot tell the two apart, so at least one
      caption leg uses a MULTI-interval program with the partial on a row
      other than the first (RF3 — a fixture emptier than production).
- [ ] **Step 9: scoped gates.** lint · typecheck · format:check ·
      `pnpm test --project client`. **`pnpm e2e` is Task 8's** — but if this
      task's diff touches `src/`, `pnpm e2e` must be green before the task is
      reported done (RF1).
      **Deliverable:** both doors render the partial, identically, with no
      derived number anywhere near it.

---

## Task 6: "Nothing kept." leaves all three surfaces

**COPY APPROVED at Gate 0-B (James, 2026-09-02), decision (e).**

**Files:**
- Modify: `app/src/workout/ConnectedSurface.tsx` (`LostBanner` **and** the
  ended-frame body line)
- Modify: `app/src/workout/ConnectedSurface.test.tsx` (two banner text pins
  **and** the ended-frame pin `says Nothing kept when the drop happened before
  anything was measured`)
- Modify: `app/src/session/LogSession.tsx` (the dropped-program strip)
- Modify: `app/src/session/LogSession.test.tsx` (the pin `says Nothing kept
  when the drop happened before any interval was measured`)
- Regenerate: `app/e2e/fixtures/connected-ready-lost.html`
- Modify: `app/src/workout/ConnectedSurface.screens.test.tsx` (its fixture
  test's own comment, which currently says the banner reads `Nothing kept.`)
- Modify: `app/e2e/screenshots.spec.ts` (the `CONNECTED_STATES` comment beside
  `connected-ready-lost`, same reason)

- [ ] **Step 1: the ruling this task implements.** Finding 2, RULED at Gate
      0-B: **all three surfaces drop the phrase, in this PR.** The reason it
      could not be deferred: `ConnectedSurface.tsx`'s ended-frame
      `"The erg dropped the workout. Nothing kept."` and `LogSession.tsx`'s
      dropped strip (`"Nothing kept." / "You had not finished an interval
      yet."`) are BOTH reachable on `program-dropped`, which is a partial
      producer — so after Task 5 the strip would sit directly above a step row
      showing the metres. That is RF23's shape. What each becomes:
      - the banner (`LostBanner`, `kept === 0`) → the title alone, no body
        element at all.
      - the ended-frame line (`kept === 0`, `closeReason === "program-dropped"`)
        → `"The erg dropped the workout."` — the sentence stops there.
      - the log strip (`droppedKept === 0`) → `"You had not finished an
        interval yet."` alone, with no bold clause before it.
      Each keeps its `kept >= 1` arm **byte for byte unchanged**.
- [ ] **Step 2: the failing legs, all three surfaces.**
      - **Banner:** flip the two `ConnectedSurface.test.tsx` pins to
        `"LOST THE MONITOR"` and add a leg asserting `.connected-lost-body` is
        **absent** (not empty) at `kept === 0` — an empty element would still
        occupy the flex column's `gap: 5px`. Keep the existing
        `expect(bannerText()).not.toMatch(/\d/)` / `not.toMatch(/interval/i)`
        pair: they are still exactly right and now hold for a stronger reason.
      - **Ended frame:** flip `ConnectedSurface.test.tsx`'s
        `says Nothing kept when the drop happened before anything was
        measured` to expect `"The erg dropped the workout."`, and rename it so
        the title no longer states the removed copy. Its sibling
        (`1 interval kept.`) stays untouched — assert it in the same round, so
        the report can say the `>= 1` arm did not move.
      - **Log strip:** flip `LogSession.test.tsx`'s `says Nothing kept when
        the drop happened before any interval was measured` to expect
        `"You had not finished an interval yet."`, rename it likewise, and add
        a leg asserting `.log-dropped-body b` is **absent** at
        `droppedKept === 0` (the bold clause is the element that carried the
        phrase; an empty `<b>` would keep its own leading space).
- [ ] **Step 3: run; verify red. FIVE reds, MEASURED with all three surfaces
      changed** (`Test Files 3 failed | 168 passed (171)`, `Tests 5 failed |
      4690 passed (4695)`) — those five and nothing else:
      - `ConnectedSurface.test.tsx > the lost banner says what survived >
        claims nothing when nothing was measured, on the surface that never
        saw a pull`
      - `… > claims nothing mid-row too, when no boundary ever arrived`
      - `ConnectedSurface.test.tsx > the interim ended frame tells the truth
        about a program drop (Gate 0) > says Nothing kept when the drop
        happened before anything was measured`
      - `LogSession.test.tsx > LogSession: the drop strip (Wave F PR 1 Task 4,
        Gate 0) > says Nothing kept when the drop happened before any interval
        was measured`
      - `ConnectedSurface.screens.test.tsx > screen fixtures for pnpm
        screenshots > pane B, armed and the link lost — nothing was ever
        measured` (a file snapshot)
      **Any red beyond those five is a surface this plan did not find** — say
      so rather than fixing it silently. Note what the same run PROVES about
      Task 5: the row and caption changes reddened NOTHING, because no shipped
      fixture carries a partial; every Task 5 gate is a new leg.
- [ ] **Step 4: implement.**

      ```tsx
      function LostBanner({ kept }: { kept: number }) {
        return (
          <div className="connected-lost" role="status">
            <span className="connected-lost-title">LOST THE MONITOR</span>
            {kept > 0 && (
              <span className="connected-lost-body">
                {`${kept} ${kept === 1 ? "interval" : "intervals"} kept.`}
              </span>
            )}
          </div>
        );
      }
      ```
      Replace the component's own doc comment's account of the zero arm with
      why the body is now dropped: it read as loss at the exact moment a
      reconnect was nullifying it, and — after §5 — at the exact moment
      something IS being kept.

      Then the two siblings, same ruling. In `ConnectedSurface.tsx`'s
      ended-frame ternary, the `program-dropped` zero arm becomes a sentence
      that stops:

      ```tsx
                    ? "The erg dropped the workout."
      ```

      and in `LogSession.tsx`'s `droppedStrip`, the body loses its bold clause
      at zero rather than emptying it:

      ```tsx
              <p className="log-dropped-body">
                {droppedKept === 0 ? (
                  "You had not finished an interval yet."
                ) : (
                  <>
                    <b>{`${droppedKept} ${droppedKept === 1 ? "interval" : "intervals"} kept.`}</b>{" "}
                    The row below is what the erg measured before it stopped.
                  </>
                )}
              </p>
      ```
      **The `>= 1` arms of all three are unchanged**, which is what the
      untouched sibling assertions in step 2 prove.
- [ ] **Step 5: regenerate the fixture.** `pnpm test --project client -u`
      (the whole client project, with update — the documented safe
      invocation; do NOT use a positional file filter). Then
      `git diff --stat app/e2e/fixtures/` must show **exactly one** file
      changed, `connected-ready-lost.html`. If it shows more, stop: a
      snapshot moved that this change has no business moving.
- [ ] **Step 6: the stale-comment sweep — WIDER than two files now that all
      three surfaces change.** `ConnectedSurface.screens.test.tsx`'s fixture
      test and `screenshots.spec.ts`'s `CONNECTED_STATES` entry both SAY the
      banner reads `Nothing kept.` Reconcile both, then grep the withdrawn
      phrasing across the repo and reconcile or justify EVERY hit — the
      CLAUDE.md rule is that correcting a claim where it was ARGUED and
      leaving it where it was USED reads as a done reconciliation:
      ```
      grep -rn "Nothing kept" app/src app/e2e docs ROADMAP.md | grep -v node_modules
      ```
      At `a50e06f3` that grep also reaches prose comments in
      `ConnectedSurface.tsx`, `ConnectedSurface.test.tsx`,
      `summaryModel.ts`, `useMonitorSession.ts`, and the
      `docs/design/DEVIATIONS.md` row that describes the banner's body (RF9 —
      DEVIATIONS documents current state). **Paste the grep's actual output
      into the task report and classify every line**; do not write "the grep
      is clean" without it.
      **Two classes of hit are HISTORY and must NOT be edited:**
      `releaseNotes.ts`'s v0.24.0 string (shipped notes are history — that
      file says so at this exact site; its correction rides the new version's
      note, Task 8) and the walk READMEs / walk cards under
      `docs/monitor/`, which record what a screen said on the day.
- [ ] **Step 7: MUTATE.** **M6.1** restore `kept === 0 ? "Nothing kept." : …`
      in `LostBanner` → the two text legs and the file snapshot go red.
      **M6.2** render the body element with an empty string at zero → the
      absence leg red, the text legs green — which is why the absence leg
      exists. **M6.3** restore `"The erg dropped the workout. Nothing kept."`
      → the ended-frame leg red, and **only** it. **M6.4** restore the strip's
      `<b>Nothing kept.</b>` clause → the log-strip text leg AND its
      `.log-dropped-body b` absence leg red. M6.3 and M6.4 must each leave the
      other two surfaces green: three surfaces, three independent gates.
- [ ] **Step 8: scoped gates.** lint · typecheck · format:check ·
      `pnpm test --project client` · **`pnpm e2e`** (`design.spec.ts`'s banner
      test uses the ≥1 fixture and must stay green).
      **Deliverable:** no surface claims a loss the app is about to disprove
      — banner, ended frame and log strip all stop saying the phrase.

---

## Task 7: the headline gate — two tests, one asserted fixture

Nothing can host both halves: the replay half needs jsdom (`client`,
`src/**`) and the POST→GET half is a supertest route test (`unit`,
`server/**`). **They are joined by ONE IMPORTED fixture module** — Task 0
step 0's `src/session/partialGateFixture.ts` — not by two equal literals, so
they can never drift into two stale copies (harden lens 1, finding 3). Each
half gates a DIFFERENT thing (7a: what the hook banks; the route leg: that the
route preserves the pair), and no single mutation reddens both — step 5's M7.3
measures that and says so.

**Files:**
- Add: `app/src/monitor/partialReplay.test.ts`
- Modify: `app/server/routes/data.test.ts` (its round-trip legs are the
  fixture's other consumer)
- Uses: `app/src/session/partialGateFixture.ts` (added in Task 0 step 0)

### 7a — the replay half (`client`)

Composition: exactly `lifecycleReplay.test.ts`'s —
`createReplayTransport` + `vi.doMock("../adapters/monitorTransport")` +
`vi.resetModules()` + dynamic re-import of `useMonitorSession` + the
`withLiveness` decorator with its clock rebound to the replay clock. **No test
file in `src/monitor/` imports another**; that convention holds here too — the
one import this file adds is a NON-test module,
`src/session/partialGateFixture.ts` (Task 0 step 0).

**The program, hand-transcribed and PROVEN BY THE HARNESS.** Both captures
carry byte-identical programming tx (seq 15–19), and this transcription
reproduces them exactly, checksum included — verified this session by running
`buildProgrammingSequence` + `chunkFrames` over it and diffing against the
recorded hex (Measurements appendix):

```ts
const WALK_0828_PROGRAM: WorkoutProgram = {
  intervals: [0, 1, 2].map((i) => ({
    type: "work",
    kind: "time",
    value: 60,
    targetSplit: 152,
    displaySpm: null,
    restSeconds: i === 2 ? 0 : 60,
  })),
};
```

- [ ] **Step 1: leg A — `end-on-interval-1-recording.jsonl.gz`.** 8.3 s into
      interval 1, ZERO attributable actuals — the partial is the only number
      the row has. Assert, in this order:
      1. `divergences` is `["tx#75 barrier timeout"]` **exactly** — the
         recorded terminate tx the app sent and a replay cannot. **A
         `toStrictEqual([])` here would be wrong** (Finding 5), and asserting
         the exact one-element array is what proves the programming tx all
         MATCHED.
      2. `loadMonitorRun()!.endedBy` is `"rower"` — **the machine-TERMINATE
         arm**, `endByMachine(true)`, because a replay cannot press End.
      3. `run.actuals` is `[]` and `measuredIntervalCount(run.actuals)` is `0`
         (I-B2 — the partial moved neither).
      4. `run.partial` is `{ intervalIndex: 0, meters: 15, seconds: 8.28 }`
         (**measured**).
      5. `buildMonitorLogSteps(run)[0]` `toStrictEqual(PARTIAL_STEP_LEG_A)`
         — which asserts the pair AND the absence of
         `actualMeters`/`actualSeconds`/`actualSource` in one strict
         comparison; steps 1 and 2 carry neither partial key.
- [ ] **Step 2: leg B — `rest-boundary-recording.jsonl.gz`.** One banked
      actual, close in interval 2. Assert:
      1. `divergences` is `["tx#839 barrier timeout"]`.
      2. `endedBy` is `"rower"`.
      3. `run.actuals` is the ONE real boundary
         (`index: 0, elapsedSeconds: 60, distanceMeters: 197, avgSplit: 152.2,
         avgSpm: 25, restSeconds: 60, restDistanceMeters: 6`) and
         `measuredIntervalCount` is `1` — **unchanged by the partial**.
      4. `run.partial` is `{ intervalIndex: 1, meters: 37.6, seconds: 10.9 }`
         (**measured**).
      5. The built steps: step 0 carries the full pm5 actual set and **no**
         partial keys; `buildMonitorLogSteps(run)[1]`
         `toStrictEqual(PARTIAL_STEP_LEG_B)` (the pair, and no actual keys, in
         one strict comparison); step 2 carries neither.
- [ ] **Step 3: legs C1 and C2 — the End arm, as a CONSTRUCTED ORDERING
      (RF26). TWO cuts, not one** (harden lens 1, finding 2: a cut is a claim
      about where in the timeline you landed, and it needs the same
      measurement as the timeline itself). Both use the same harness call:

      ```ts
      // `endSession()` closes the record SYNCHRONOUSLY, before its first
      // await (`closeRecord` runs above the `terminate()`), so the close is
      // complete when this returns. The returned promise is NOT awaited: the
      // replay is finished, so its `terminate()` write has no barrier left to
      // match and never resolves — awaiting it times the test out at 5000 ms
      // (measured).
      act(() => {
        void result.current.endSession();
      });
      ```

      **C1 — the End arm itself, and the only POSITIVE End-arm assertion in
      this plan.** Cut `rest-boundary-recording.jsonl.gz` at `e.t <= 76200`:
      AFTER interval 0's last rowing frame (t=76039, el=59.74, d=196.6) and
      BEFORE its first resting frame (t=76489), so the reading is still live
      when End is pressed. Assert `divergences` is `[]` (the terminate tx is
      not in the cut), `endedBy` is `"rower"` (link up → the End arm, not
      `endByMachine`), and `run.partial` is the reading —
      `{ intervalIndex: 0, meters: 196.6, seconds: 59.74 }` **by INFERENCE
      from the decoded frame, not measured this session; the implementer
      records what it actually measures and corrects this line if it
      differs.** Mutation: `withPartial`'s `reading === null` short-circuit —
      the same probe as **M3.3** — must redden C1.

      **C2 — I-B3, under an End close.** Cut at `e.t <= 100000` (mid-rest,
      3.5 s after that first resting frame and 36 s before interval 0's own
      boundary at t=136429). Same three assertions except **`run.partial` is
      `undefined`** — interval 0's work bout ended at the resting frame, 60 s
      before its actual would have arrived. Mutation: **M7.1**.
      **This is today's leg, correctly labelled.** As written it gated I-B3
      and was described as gating the End arm; the cut landed past the clear,
      so its own assertion could only ever be negative. C1 is the End-arm
      gate.

      **State in each test's own comment that this is a constructed
      ordering**: the capture is cut and the API is called by the harness,
      because no recording can contain a button press. **And state each cut's
      timestamp against the frames it lands between** — that is what makes the
      cut a measurement rather than a guess.
- [ ] **Step 4: run; verify red.** Against a tree with Task 3 reverted, legs
      A, B and C1 fail on `run.partial`. **Quote one.** (C2's assertion is
      `undefined`, so it passes against the reverted tree by construction —
      that is what M7.1 is for, and the report says so rather than implying
      four reds.)
- [ ] **Step 5: MUTATE — the one that matters.** **M7.1** delete I-B3's
      `resting` clear from `noteFrameForPartial` and re-run leg C2. **Measured
      this session:** it goes red with
      `run.partial === { intervalIndex: 0, meters: 196.6, seconds: 59.74 }` —
      interval 0's last rowing frame, i.e. **a COMPLETED interval stored as a
      partial**, exactly the defect the antagonist's first finding predicts.
      Record the assertion text. (That triple is also C1's EXPECTED value, for
      the honest reason: C1 cuts before the clear, so the reading M7.1
      wrongly preserves is the one C1 legitimately banks.)
      **M7.3** change ONE number in `partialGateFixture.ts` (say
      `PARTIAL_STEP_LEG_A.partialMeters` to `15.5`) → **7a red; the route half
      GREEN, by design.** MEASURED this session: with the fixture mutated, the
      unit project stayed at `Tests 1796 passed | 1 skipped (1797)`.
      **This corrects the finding's own wording** ("both halves red"), which
      does not hold and would have shipped a claim no probe can produce: the
      route leg POSTS the fixture and asserts the fixture, so it is a
      round-trip identity over whatever the declaration says and is green for
      any value. What each half actually gates is different, and saying so is
      the point:
      - 7a gates **what the hook banks** — M7.3 reddens it, which is the proof
        it reads the shared declaration rather than a local literal.
      - the route leg gates **that the route preserves the pair** — **M0.1**
        reddens it (measured with the fixture leg in place:
        `AssertionError: expected { label: '1:00 @ 2:32', …(2) } to strictly
        equal { label: '1:00 @ 2:32', …(4) }`).
      The VALUE of one declaration is that the two can never drift into two
      stale copies: change what the hook banks and 7a forces the declaration
      to be updated, which re-points the route leg in the same edit. No single
      mutation reddens both, and the plan does not pretend one does.
      **M7.2** delete `withPartial`'s `endedBy === "finished"` gate and add a
      fourth leg replaying a naturally finished capture — or, if no committed
      capture finishes naturally, state that in the report and rely on Task 3's
      `finished` hook leg instead. **Do not invent a capture.**

### 7b — the route half (`unit`)

- [ ] **Step 6: bind the two halves — by IMPORT.** Task 0 step 0 declares
      `PARTIAL_STEP_LEG_A`/`PARTIAL_STEP_LEG_B` once; Task 0 step 1's
      round-trip leg already posts and asserts `{ ...PARTIAL_STEP_LEG_A }`.
      Add the mirror round-trip leg for `{ ...PARTIAL_STEP_LEG_B }`, and make
      7a assert `buildMonitorLogSteps(run)[0]` `toStrictEqual(PARTIAL_STEP_LEG_A)`
      for leg A and `buildMonitorLogSteps(run)[1]`
      `toStrictEqual(PARTIAL_STEP_LEG_B)` for leg B. **Neither side may retype
      the object.** The join is that ONE declaration serves both, so they can
      never drift into two stale copies: if what the hook banks changes, 7a
      goes red, the declaration is updated, and the route leg re-points in the
      same edit. **It is NOT that one mutation reddens both** — see step 5's
      M7.3, where that claim is measured and corrected. (`toStrictEqual` against an `as const` object compares values,
      not readonly-ness, so the assertion needs no cast.)
- [ ] **Step 7: scoped gates.** lint · typecheck · format:check ·
      `pnpm test --project unit --project client`.
      **Deliverable:** the seam is gated from the wire bytes to the stored row,
      starting upstream of the producer (RF24).

---

## Task 8: e2e, screenshots, notes, ROADMAP, and the whole-branch gates

**Files:**
- Modify: `app/e2e/log.spec.ts` (`postLog`'s step type + a detail leg)
- Modify: `app/e2e/screenshots.spec.ts` (`postLog`'s step type; the two
  existing `log-detail-partial*` seeds; one new time-interval capture)
- Modify: `app/src/news/content/releaseNotes.ts` (the new version's entry)
- Modify: `ROADMAP.md`
- Check: `docs/design/DEVIATIONS.md` (RF9)

- [ ] **Step 1: widen both `postLog` helpers.** `log.spec.ts`'s narrow step
      type needs `meters?`, `seconds?`, `targetSplit?`, `partialMeters?` and
      `partialSeconds?` (it currently carries only `label`, `actualSource`,
      `actualSeconds`); `screenshots.spec.ts`'s wider one needs the pair.
      Check each helper's `endedBy` field admits `"link-lost"` before writing
      the caption legs — `seedPartialLogDetail` posts `"rower"` today.
      **Both are hand-copied literal unions, not compiler-checked against the
      server type** — say so in the comment, the way the `source`/`endedBy`
      fields there already do.
- [ ] **Step 2: e2e legs through the real stack** (`log.spec.ts`):
      - A seeded `pm5` row, `endedBy: "rower"`, five steps of which two are
        measured and ONE unmeasured step carries the partial pair: its
        `.summary-row` shows `.summary-row-partial` with the expected text and
        **no** `.summary-row-dash`; the other unmeasured rows show the dash and
        no partial.
      - **The no-clip leg:** on the narrowest supported viewport, that
        element's `scrollWidth <= clientWidth`. Measure `.summary-row-partial`
        itself — a **flex item**, so both properties are real. **Prove it can
        go red**: temporarily set the seeded partial to a five-digit metre
        value and confirm the assertion fails before trusting its green
        (RF21).
      - **The heroes are unchanged** by the partial: seed the identical row
        twice, once with the keys and once without, and assert the same hero
        text. I-B5, made visible on the real stack.
      - **The caption, on the real stack:** a seeded `endedBy: "link-lost"`
        row carrying a partial shows exactly ONE
        `.summary-targets-only-caption`, reading
        `INTERVAL N · LAST READING BEFORE THE LINK WENT`; the same row seeded
        `endedBy: "rower"` shows none. Assert the element count, not only the
        text (Gate 0-B decision (c): precedence, never stacking).
- [ ] **Step 3: screenshots.**
      - **Extend** `seedPartialLogDetail` so one of its unmeasured steps
        carries a distance-interval partial. `log-detail-partial.png` and
        `log-detail-partial-landscape.png` then show the marker, the machine
        block, and the partial row in one frame — one capture, the whole
        vocabulary. Extend
        `openAndVerifyPartialLogDetail`'s assertions to match.
      - **Add** `log-detail-partial-time` (portrait + landscape) for the
        second interval kind (a TIME interval's partial), modelled on the
        `log-monitor-dropped` / `-landscape` pair idiom.
      - **The link-lost CAPTION gets a frame too** (Gate 0-B decision (c)):
        `seedPartialLogDetail` posts `endedBy: "rower"`, so nothing in the
        current capture set can show it. Seed one `endedBy: "link-lost"` row
        carrying a partial and capture it, so the approved caption has a
        visual record and the single-caption (never-stacked) rule is visible
        rather than only asserted.
      - `connected-ready-lost.png` regenerates from Task 6's fixture — no new
        capture.
      - Run `pnpm screenshots`, **open each image and describe what you see**
        (RF7), and **recompute the headline from the rows by eye**: the
        `N of M intervals measured` suffix must still equal the number of
        measured rows in the same frame, and the partial row must NOT have
        changed it (I-B2 — this is the arithmetic check PR #117 failed seven
        reviews of).
- [ ] **Step 4: `pnpm e2e`** (RF1 — this diff touches `app/src/`). Green, all
      specs.
- [ ] **Step 5: `pnpm build && pnpm dist:grep`.** The production-bundle gate.
      This PR adds no dev-only seam, so `dist:grep` is a regression check, not
      a new claim — say that rather than claiming it proves something about
      the partial.
- [ ] **Step 6: full `pnpm test`** (all projects, Docker up) and
      `pnpm lint && pnpm typecheck && pnpm format:check`.
- [ ] **Step 7: per-file coverage (RF2).** Read `app/coverage/`'s HTML report,
      not the aggregate. Report per-file rows for every file touched and name
      any uncovered branch left knowingly. `app/domain/**` is pinned at 100%
      and this PR touches none of it.
- [ ] **Step 8: the release note.** A new entry with the partial in plain
      words, **plus the correction v0.24.0's item 2 now needs** — its
      `"'Nothing kept.' when there is nothing"` clause is no longer true.
      Follow that same entry's own worked example (its item 5): carry the
      correction IN FULL in the new version's note, and **do not edit the
      shipped string**. Account for the tag's whole range with
      `git log <prev-tag>..main --oneline` (**no `--merges`** — main is
      squash-merged and that returns empty, RF15).
- [ ] **Step 9: ROADMAP.** Tick the `§5` item (_"The in-flight interval's
      metres are discarded on a mid-row link loss"_) with the PR number, one
      line, wrapped BY HAND (root markdown is not Prettier-formatted; never run
      `prettier --write` on it). Tick the `## Codebase-audit owners` register
      row and **correct its own sentence**: it says this PR _"makes a
      part-rowed interval count toward 'kept'"_, and I-B2 says the opposite
      (Finding 4). Check `docs/design/DEVIATIONS.md` for any row describing the
      summary row list or the lost banner and reconcile it (RF9).
- [ ] **Step 10: commit, push, open the PR** with the body below. **Present and
      STOP — James merges.**

---

## Gates, and the mutation each must fail under

| Gate | Lives in | Mutation that must make it red |
| --- | --- | --- |
| The pair survives POST → GET | `data.test.ts` (unit) | **M0.1** remove the two field-list `if` lines → `expected { label: '1:00 @ 2:32', …(2) } to strictly equal { label: '1:00 @ 2:32', …(4) }` (**measured with the fixture-based leg**) |
| A negative partial 400s, naming the member | `data.test.ts` | `< 0` → `< -1` → `expected 201 to be 400` |
| A HALF-pair 400s, naming both members | `data.test.ts` | **M0.3** delete the both-or-absent check → `expected 201 to be 400` |
| `isMonitorRun` tolerates the new field | `monitorRun.test.ts` | add a positive check for `partial` → the tolerance leg red |
| `MonitorRun.partial` round-trips storage | `monitorRun.test.ts` | drop the field from the save path → read-back leg red |
| I-B1: no partial on `finished` | `monitorRun.test.ts` + hook | delete `withPartial`'s `endedBy === "finished"` guard |
| I-B6 at the record | `monitorRun.test.ts` | delete `run.actuals.some(...)` |
| I-B6 at the mint (the 810 ms lag) | `useMonitorSession.test.ts`, SYNTHETIC frame | delete `noteFrameForPartial`'s `runRef.current?.actuals.some(...)` |
| I-B3 (a): a `resting` frame ends the bout | `useMonitorSession.test.ts` **and** `partialReplay.test.ts` leg **C2** | **M7.1** delete the `resting` clear → **measured:** C2 banks `{ intervalIndex: 0, meters: 196.6, seconds: 59.74 }`, a COMPLETED interval stored as a partial |
| The End arm banks a live reading (the only POSITIVE End-arm gate) | `partialReplay.test.ts` leg **C1** (cut at `e.t <= 76200`, between the last rowing frame at t=76039 and the first resting frame at t=76489) | **M3.3** — `withPartial`'s `reading === null` short-circuit → C1 red |
| 7a reads the SHARED declaration, not a local literal | `partialReplay.test.ts`, importing `src/session/partialGateFixture.ts` | **M7.3** change one number in the fixture module → 7a red. The route half stays GREEN by design (it round-trips the fixture); **measured**, and see Task 7 step 5 for why no single mutation reddens both |
| I-B3 (b): the accepted actual ends the bout | `useMonitorSession.test.ts` | delete the `intervalComplete` clear |
| FOUR gated clear sites, one leg each | `useMonitorSession.test.ts` | **M2.5–M2.8** delete each line in turn → **only** its own leg red |
| `program()`'s clear survives its own `program-failed` close | `useMonitorSession.test.ts`, the `program-failed` leg | **M3.4** move that clear to the top of `program()` → the `program-failed` leg red |
| The mint sits BELOW the continuity check | `useMonitorSession.test.ts` continuity leg | move `noteFrameForPartial(frame)` above `applyContinuityCheck` → the reset banks the dishonest frame |
| Five producers land the partial | `useMonitorSession.test.ts` | invert `withPartial`'s gate to `endedBy !== "finished"` → all five red, `finished` green |
| The continuity reset is a SECOND site | `useMonitorSession.test.ts` | revert its commit to `applyProducerCommit(withFinalSeries)` → **only** the continuity leg red |
| The two sites are genuinely two | `useMonitorSession.test.ts` | pass `null` at the `closeRecord` site only → four red, continuity green |
| The step keys are keyed on the PROGRAM index | `logDraft.test.ts` (legacy warm-up fixture) | `partial.intervalIndex === i` → `=== out.length` |
| The partial never becomes an actual | `logDraft.test.ts` + `storedSummary.test.ts` census | write into `actualMeters`/`actualSeconds` → the anti-leg **and** the census red |
| I-B5: no summing reader moves | `storedSummary.test.ts` census | as above |
| ONE formatter, both builders | `summaryModel.test.ts` | give `buildRows` its own separator → the agreement leg red |
| The partial row shows no derived pace | `PostWorkoutSummary.test.tsx` | render `paceLabel` on a prescribed row → the absence leg red |
| The partial cell cannot clip | `e2e` structural leg | delete `white-space: nowrap`; separately, seed a five-digit metre value and confirm the probe reddens BEFORE trusting its green |
| The banner drops its zero body | `ConnectedSurface.test.tsx` ×2 + the `connected-ready-lost` file snapshot | restore `kept === 0 ? "Nothing kept."` → **measured: exactly those three go red out of 4 695 client tests** |
| The banner renders no EMPTY body | `ConnectedSurface.test.tsx` | render the span with `""` at zero → the absence leg red, the text legs green |
| The ended frame drops the phrase | `ConnectedSurface.test.tsx` | **M6.3** restore `"The erg dropped the workout. Nothing kept."` → that leg red, and only it |
| The log strip drops the phrase | `LogSession.test.tsx` | **M6.4** restore the `<b>Nothing kept.</b>` clause → its text leg AND its `.log-dropped-body b` absence leg red |
| The link-lost caption fires only on `link-lost` | `summaryModel.test.ts` **and** `storedSummary.test.ts` (each door owns its own call) | **M5.5** drop `partialCaption`'s `endedBy !== "link-lost"` guard → the `rower`-close leg red |
| The caption REPLACES, never stacks | the single-interval link-lost legs, asserting the caption by EQUALITY | **M5.6** concatenate instead of `??` → both model legs red (a `toContain` assertion would stay green, which is why they are equalities) |
| The caption names the RIGHT interval | a MULTI-interval fixture with the partial on a row other than the first | **M5.7** `rows[0]` instead of `rows.find(…)` → that leg red |
| One caption ELEMENT is rendered for it | `PostWorkoutSummary.test.tsx` | render a second `.summary-targets-only-caption` → the count leg red |
| The headline seam, wire → stored row | `partialReplay.test.ts` legs A/B/C + `data.test.ts` | any of the above; the legs assert measured wire values, not hand-picked ones |

**Ungated by design, each stated in a comment beside the code:** the
`Number.isFinite` half of the route's bounds (NaN/Infinity cannot reach it over
JSON); `heroDistanceMeters`'s I-B5 leg (its input type has no `steps`); the
old-server direction of the additive matrix (a hand-written copy of the old
allowlist would be a mirror — §8.2's own ruling); and **`connect()`'s and
`teardown()`'s clears of `lastRowingFrameRef`** (harden lens 1, finding 5) —
no supported ordering closes a record after either, since `runRef.current` is
null by then and `closeRecord` returns at its no-record guard, so a leg for
them could not go red (RF21). They stay in the code as belt-and-braces, and
their `// §5.3:` comments say exactly this.

---

## PR body skeleton

Above the fold: **~120 words, ~25 words per bullet. Count, don't feel.**

```markdown
This PR keeps the metres you rowed into the interval you stopped in.

- Stop a connected piece mid-interval and that interval's row now shows what
  you actually did — `250 m · 1:03` — instead of a dash.
- The number is ours, read off the last frame the erg sent. It is never
  mixed into your totals, your split, or "N intervals kept".
- "Nothing kept." leaves all three screens that said it — the lost banner,
  the ended frame and the log strip. It was about to be untrue.
- Try it: start a connected piece, press End partway through the first
  interval, and open the row from the log.

<details><summary>Record (for agents and audits)</summary>

- Spec: `docs/superpowers/specs/2026-09-02-door-partial-design.md` §5–§9.
  Gate 0-B: `docs/superpowers/specs/2026-09-02-door-gate-b.html`, APPROVED
  <date>. Antagonist FULL pass: `antagonist-ledger.md`, 2026-09-02 entry.
- Two stored shapes: `MonitorRun.partial` (no `v` bump — `isMonitorRun` has
  no unknown-key check) and two new `LogStep` keys through THREE type
  declarations plus the route's field list. No migration (`steps` is jsonb).
- Head SHA, commit count, test counts, e2e duration — reproduced, not cited.
- Every mutation from the gates table with its exact failure text, including
  the one that proves I-B3: with the `resting` clear deleted, a COMPLETED
  interval is stored as a partial reading 196.6 m / 59.74 s.
- The lifetime table (one ref, six clear sites by symbol — four gated, two
  defensive — and two event clears).
- The I-B5 census as its SCRIPT's output, base and head.
- Per-file coverage rows for every touched file. Contrast: `--ink-2` on the
  row's ground, computed, stated as a number.
- The additive matrix, both directions. The old-server direction is argued,
  not tested — a hand-written copy of the old allowlist would be a mirror.
- Gate 0-B, APPROVED by James 2026-09-02: seven decisions, recorded in the
  spec's §6 and folded into Tasks 5 and 6. The DISTANCE hero already counts
  the abandoned interval's metres while the rows could not show them; James
  accepted that gap silently, so no sentence is owed in the product — this
  bullet is the whole record of it.
- Filed/decided here rather than deferred (RF14): the two OTHER surfaces
  that said "Nothing kept." (ruled at Gate 0-B — all three drop it here);
  the v0.24.0 release note whose promise this withdraws (corrected in the
  new note, old string untouched); the ROADMAP register row that said a
  partial would count toward "kept" (it does not).
- Risk note (what I'd have asked a reviewer to probe): the ref's lifetime.
  Six clear sites plus two event-shaped clears, and a missed one banks one
  run's metres onto another's record. FOUR carry a leg and a mutation;
  `connect()`/`teardown()` are declared defensive and ungated. The sharpest
  one is `program()`, whose clear must NOT sit where its sibling ref's does,
  because its own catch is one of the five producers. The replay legs are the
  only ones driven by real wire bytes.

</details>
```

---

## Self-review

**Spec coverage — every §5/§6/§8.2 requirement maps to a task.**

| Spec | Requirement | Task |
| --- | --- | --- |
| §5.1 | Two NEW keys, never `actualMeters`/`actualSeconds`, never a new `actualSource` | 0 |
| §5.1 | THREE type declarations + the route's field list and bounds | 0 |
| §5.1 | TWO stored shapes: `MonitorRun` first, then the posted step | 1, 4 |
| §5.1 | No `v` bump; `isMonitorRun` tolerance | 1 |
| §5.1 | A link-lost close banks what was LAST RECEIVED, and the copy says so | 3 (the read), 5 (the copy, Gate 0-B) |
| §5.1 | No split/pace/rate derived from the pair | 5 (with its own absence leg) |
| §5.1 | A `rowing` frame with `intervalIndex: null` writes nothing | 2 |
| §5.2 I-B1 | Only on `endedBy ≠ finished`; tier B2 never sees one | 1, 3 |
| §5.2 I-B2 | Never an `IntervalActual`; `measuredIntervalCount` unchanged | asserted in 3 and 7 |
| §5.2 I-B3 | Work bout ends at the first `resting` frame OR the actual, whichever first | 2, gated by 7's leg **C2** |
| §5.2 I-B4 | Stale re-emission under-counts; stated, not gated | Global Constraints |
| §5.2 I-B5 | No summing reader sees the keys; census as a SCRIPT | 4 |
| §5.2 I-B6 | Never for an interval already carrying an actual, checked at write time | 1 (record), 2 (mint), 4 (read side) |
| §5.3 | The ref, its mint, six clear sites by symbol (four gated, two defensive) | 2 |
| §5.3 | ONE read in `closeRecord` covering four producers + the continuity reset's own | 3 |
| §5.3 | `interrupted` writes none | stated; `completeInterruptedRun`'s only caller is outside the hook |
| §5.4 | The lost banner's `kept === 0` arm | 6 |
| §6 | Gate 0-B's seven decisions, APPROVED 2026-09-02 | 5 ((a),(b),(c),(d),(f),(g)), 6 ((e), all three surfaces) |
| §8.2 | The two-test headline gate, one fixture | 7 |
| §8.2 | The named captures, and the machine-TERMINATE arm | 7 |
| §8.2 | The End arm as a constructed ordering (RF26) | 7 leg **C1** (the positive End-arm gate); C2 is the same construction gating I-B3 |
| §8.2 | e2e + screenshots | 8 |
| §8.3 | The `IntervalActual` timing question — SETTLED, and I-B3 written from it | Global Constraints, re-measured this session |
| §9 | Vetted ground consumed, never re-derived | throughout |

**Placeholder scan:** no `TBD`, no "add validation", no "similar to task N".
Gate 0-B is APPROVED, so the two copy fill-ins it used to carry are gone.
**Two deliberate fill-ins remain**, each marked and each requiring a real
input rather than a guess: the new release-note version number and its range
(Task 8 step 8, from `git log`), and leg C1's expected triple (Task 7 step 3
— inferred from the decoded frame, not measured this session; the implementer
records what it measures).

**Type consistency across tasks:** `partialMeters`/`partialSeconds` are
declared in THREE places (Task 0) and never re-typed afterwards.
`MonitorRun.partial`'s inline object type and `withPartial`'s `reading`
parameter and `lastRowingFrameRef`'s value are the SAME three fields; if a
future task extracts a named type, it extracts one, not three.
`PrescribedRow.partialLabel` is `string | undefined` on both builders and the
one renderer. `partialRowLabel` takes a `Pick<LogStep, …>` so both
`LogStep` (write shape) and `StoredLogStep` (read shape) satisfy it
structurally without either importing the other — the same idiom
`rowJudgment` already uses across these two files.

---

## Measurements appendix — what was RUN, and against what

Everything below was executed this session in
`/Users/james/projects/github/jamesawesome/Ergomatic-wt-door-b/app` at head
`a50e06f3`, with `PATH="$HOME/.local/share/nvm/v26.5.0/bin:$PATH"` (Node
v26.5.0). No number in this plan was reasoned to.

**Wire facts, decoded with this repo's own `parseRecording` +
`domain/monitor/pm5/parse.ts` through a throwaway `pnpm exec tsx` script
(written, run, deleted):**

| Capture | Fact |
| --- | --- |
| `end-on-interval-1-recording.jsonl.gz` | armed t=5992; rowing from t=7522; **last rowing 0x0031 t=15184, el=8.28, d=15**; terminate (`ws=11`) t=15442 el=8.49 d=15.3; 0x0037 at t=15442 carries `splitIntervalTimeSeconds 8.5 / splitIntervalDistanceMeters 15 / splitIntervalNumber 1` — the in-flight reading the machine DOES send and `toActualIndex` declines; 90 events |
| `rest-boundary-recording.jsonl.gz` | rowing from t=17008; **last rowing before the rest t=76039, el=59.74, d=196.6**; first `resting` t=76489 (el=60.21 d=197.6); 0x0033 `intervalCount` 0→1 at t=76494; **interval 0's 0x0037 at t=136429** (`splitIntervalTimeSeconds 60`, `splitIntervalDistanceMeters 197`, `intervalRestTimeSeconds 60`); interval 1 rowing from t=136699; **last rowing t=147319, el=10.9, d=37.6**; terminate t=147859; 848 events |
| Both | **the boundary is 136429 − 76489 = 59 940 ms after the work→rest frame** (the spec's 59 941 measures to the 0x0038 at t=136430) |
| Both | the programming tx (seq 15–19) is byte-identical between the two files, and the LAST tx in each is the terminate `f1 76 04 13 02 01 02 60 f2` |
| Both | **the I-B6 lag window is absent**: `intervalCount` reaches 1 during the rest, so interval 1's first rowing frame already carries index 1 |

**The program transcription, proven not asserted:** running
`buildProgrammingSequence(WALK_0828_PROGRAM)` + `chunkFrames` produced the
five frames

```
f1 76 55 18 01 00 01 01 08 17 01 00 03 05 00 00 00 17 70 04
02 00 3c 06 04 00 00 3b 60 14 01 01 18 01 01 17 01 00 03 05
00 00 00 17 70 04 02 00 3c 06 04 00 00 3b 60 14 01 01 18 01
02 17 01 00 03 05 00 00 00 17 70 04 02 00 00 06 04 00 00 3b
60 14 01 01 13 02 01 01 1c f2
```

which match the recorded tx seq 15–19 **exactly, checksum `1c` included**, in
both captures. (`targetSplit: 152` was found by bisection: the recorded
`3b 60` = 15200 = 152 × 100; `120` produces `2e e0`.)

**The paste test, pass 2 (after the harden fold), run 2026-09-02 at
`89a534f1`.** Every prescribed implementation block in Tasks 0–6 plus Task 0
step 0's fixture module was extracted to its REAL path in this worktree and the
repo's own gates run over the result:

- `pnpm typecheck` — **PASS** (`E2E TypeScript membership: 19/19`).
- `pnpm lint` — **PASS**, clean, no new suppressions.
- `pnpm format:check` — FAILED on two files until `prettier --write` was taken
  verbatim: `server/routes/data.ts` (wraps the pair check's `message:` line)
  and `src/log/storedSummary.ts` (JOINS the `partialCaption(...) ??
  targetsOnlyCaption(rows)` line). Both are recorded at their own steps. PASS
  after.
- `pnpm test --project unit` — **`Test Files 58 passed (58)`,
  `Tests 1796 passed | 1 skipped (1797)`** with Task 0's four route legs.
- `pnpm test --project client` — **`Test Files 3 failed | 168 passed (171)`,
  `Tests 5 failed | 4690 passed (4695)`**, the five reds being exactly Task 6's
  own three surfaces (listed at its step 3) and nothing else.
- Mutations run in this pass: **M0.1** (field-list lines removed → the
  fixture-based round-trip leg red, `expected { label: '1:00 @ 2:32', …(2) } to
  strictly equal { label: '1:00 @ 2:32', …(4) }`); **M0.3** (pair check deleted
  → `expected 201 to be 400`, `Tests 1 failed | 1795 passed`); **M7.3**
  (`PARTIAL_STEP_LEG_A.partialMeters` 15 → 15.5 → unit project **stayed green**
  at 1796, which is what corrected the finding's "both halves red" wording).

Every touched source file was then restored from a pre-edit copy taken before
the pass began; `git checkout` was not used anywhere (RF22).

**Pass 1 (the plan as first written):** every prescribed code block in Tasks
0–6 was extracted the same way, with these results:

- `pnpm typecheck` — **PASS** (`tsc -b`, `tsconfig.server.json`,
  `e2e/tsconfig.json`, `E2E TypeScript membership: 19/19`).
- `pnpm lint` — **PASS**, clean, no new suppressions.
- `pnpm format:check` — **PASS** after taking Prettier's own line-joining for
  the route's first field-list line (noted in Task 0 step 4).
- `pnpm test --project unit --project client` — **`Test Files 2 failed | 227
  passed (229)`, `Tests 3 failed | 6484 passed | 1 skipped (6488)`.** The
  three reds are exactly Task 6's own copy change (two text pins plus the
  `connected-ready-lost.html` file snapshot) and nothing else. Both summary
  lines are quoted, per the two-line rule.
- `pnpm test --project unit` with Task 0's two prescribed route legs added —
  **`Test Files 58 passed (58)`, `Tests 1794 passed | 1 skipped (1795)`**,
  including the exact 400 string
  `"steps[0]: partialMeters must be a number, >= 0"`.

**Mutations actually run (not predicted):**

| # | Mutation | Result |
| --- | --- | --- |
| M0.1 | the two field-list lines removed from `validateLogStepEntry` | round-trip leg RED: `expected { label: 'Row 1', …(2) } to strictly equal { label: 'Row 1', seconds: 60, …(3) }`; `Tests 1 failed \| 1793 passed` |
| M7.1 | I-B3's `resting` clear deleted from `noteFrameForPartial` | leg **C2**'s `run.partial` became `{"intervalIndex":0,"meters":196.6,"seconds":59.74}` — the completed interval, stored as a partial. Restored → `undefined` |
| M6.1 | (implicit) the shipped `kept === 0 ? "Nothing kept."` restored is the pre-change tree | the three reds above are exactly this mutation's signature |

**The headline replay, actually executed.** A scratch
`src/monitor/_scratchPartialReplay.test.ts` built on `lifecycleReplay.test.ts`'s
composition drove both captures through the real driver and hook into
`loadMonitorRun()` and `buildMonitorLogSteps()`. Verbatim output:

```
DIVERGENCES ["tx#75 barrier timeout"]
ENDEDBY rower ACTUALS []
PARTIAL {"intervalIndex":0,"meters":15,"seconds":8.28}
STEPS [{"label":"1:00 @ 2:32","targetSplit":152,"seconds":60,"partialMeters":15,"partialSeconds":8.28},{…},{…}]

DIVERGENCES ["tx#839 barrier timeout"]
ENDEDBY rower ACTUALS [{"index":0,"elapsedSeconds":60,"distanceMeters":197,"avgSplit":152.2,"avgSpm":25,"avgHeartRateBpm":null,"restDistanceMeters":6,"restSeconds":60,"type":0}]
PARTIAL {"intervalIndex":1,"meters":37.6,"seconds":10.9}
STEPS [{…"actualSource":"pm5","actualSeconds":60,"actualMeters":197},{"label":"1:00 @ 2:32","targetSplit":152,"seconds":60,"partialMeters":37.6,"partialSeconds":10.9},{…}]

(cut at t<=100000, then endSession())
DIVERGENCES []
ENDEDBY rower ACTUALS []
PARTIAL undefined
```

**That third block is leg C2, not C1.** The cut at `t<=100000` lands 3.5 s
AFTER the first `resting` frame (t=76489), so I-B3 had already cleared the ref
and `undefined` is the only answer it could ever have printed: it gates I-B3
under an End close, and calling it the End-arm gate was harden lens 1's second
finding. **Leg C1 (cut at `e.t <= 76200`) was NOT run this session** — its
expected triple `{ intervalIndex: 0, meters: 196.6, seconds: 59.74 }` is an
INFERENCE from the decoded last-rowing frame at t=76039 in the table above,
corroborated by M7.1's measured output, and the implementer records what it
actually measures.

`Test Files 1 passed (172)`, `Tests 3 passed | 4695 skipped (4698)`. The
scratch test and the census script were then deleted and **every touched
source file was restored from a pre-edit copy taken before the paste test
began** — `git status --porcelain` is empty at this worktree apart from this
plan file. `git checkout` was not used anywhere (RF22).

**Two shell facts worth carrying:** `JSON.parse('{"a":NaN}')` and
`JSON.parse('{"a":Infinity}')` both throw `SyntaxError` (run with `node -e`),
which is why no NaN 400 test is prescribed. And
`pnpm exec vitest run --project client -t "<name>"` **without**
`NODE_OPTIONS=--no-experimental-webstorage` dies on
`TypeError: Cannot read properties of undefined (reading 'clear')` — the
Node-26 webStorage/jsdom collision, reached through `-t` as well as through a
positional filter.

**What this appendix does NOT claim.** The prescribed TESTS in Tasks 1–6 were
not written (they are failing-test-first work and belong to the implementer);
only the prescribed IMPLEMENTATION was pasted, compiled, linted and run
against the existing suite, plus the two route legs and the three replay legs
above, which were written and executed. Every mutation in the gates table that
is not in the table above is a prescription, not a measurement, and is marked
as such by its absence there.
