# Just Row without the monitor (time only) + the JR chip — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every subagent reads `.claude/agent-briefing.md` first, works ONLY in the worktree named below, runs `git rev-parse --show-toplevel` before every commit, commits the real change BEFORE any mutation probe (RF22), and never merges.

**Goal:** A rower with no erg link times a row on the phone's wall clock and saves it with time only; free rows carry a hollow JR chip; log provenance becomes a stored, non-null fact on every row.

**Architecture:** One `SessionRun` with a required `mode` and a metre-less `PhaseActual` variant drives the shipped Timer through two label branches and a finish that records elapsed. The Just Row log door gains a timer entry kind. `session_logs.source` (NOT NULL, backfilled) replaces the client's provenance inference. A `FreeRowChip` renders where `isFreeRow(workoutId, workoutType)` holds.

**Tech Stack:** React 19 + Vite client, Express 5, Drizzle/Postgres (migration 0020), Vitest (unit/client/integration), Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-09-02-just-row-unconnected-design.md` (rev 5). Gate 0: `docs/design/handoffs/2026-09-02-just-row-unconnected/` (rev 2e, PASSED). Executors read both.

**Worktree:** `/Users/james/projects/github/jamesawesome/Ergomatic-wt-jrunc`, branch `jr-unconnected` (already carries the spec, handoff, ROADMAP status, ledger entry, and the merged `jr-close` branch).

## Global Constraints

- TRIAD PR: three stored-shape changes (`SessionRun.mode`, `PhaseActual` union, `session_logs.source`). Not fast path. PM final-PR gate before merge.
- Every label on screen is the handoff's exact string: `Start Timer`, `NO TARGETS · NO PLAN`, STEP slot `JUST ROW`, `Free`, `UP NEXT · FINISH`, `Finish this session?`, `Keep going`, `Finish session`, `TIMER`, `Save this row`. No em-dashes in user-facing copy.
- No distance: never post `distanceMeters`/`avgSplitSeconds` for a timer row; never render a `0 m` or `—` for it — absence only.
- `"JR"` is never stored; the chip is derived from `isFreeRow(workoutId, workoutType)` (the PAIR). Its class is `free-row-chip`, never `type-badge`.
- Additive-only API between tags: `source` optional on the wire, derived server-side when absent, contradiction → 400. NOT NULL in the column.
- Tests: red first; every new assertion gets a mutation probe and the report names the mutation and the failure text (RF21). Client tests run as `pnpm exec vitest run <file>` from `app/` (NOT `--project client <file>`, which runs outside jsdom). Read BOTH summary lines.
- `pnpm e2e` and `pnpm screenshots` before reporting any task that touches `app/src/` done (RF1).
- Migration: `pnpm db:generate` produces the file; hand-add the backfill + NOT NULL and the header comment in 0019's style.

---

### Task 1: `SessionRun.mode` (required, load-upgraded) and the `PhaseActual` union

**Files:**
- Modify: `app/src/session/run.ts` (types, `isSessionRun`, `loadRun`)
- Modify: `app/src/session/engine.ts` (`buildRun` sets `mode: "workout"`; every `PhaseActual` construction)
- Modify: `app/src/session/logDraft.ts:456-471` (`actualSplit` only from the `"stopwatch"` member)
- Modify: every TS site that constructs a `SessionRun` or `PhaseActual` literal (`grep -rn "actualSource: \"stopwatch\"" app/src` and `grep -rn "v: 1," app/src/session app/src/today app/src/workout` — fixtures included; typecheck finds the rest)
- Test: `app/src/session/run.test.ts`, `app/src/session/logDraft.test.ts`

**Interfaces:**
- Produces: `type SessionRunMode = "workout" | "justrow"`; `SessionRun.mode: SessionRunMode`; `type PhaseActual = { actualSource: "stopwatch"; elapsedSeconds: number; splitSeconds: number } | { actualSource: "stopwatch-elapsed"; elapsedSeconds: number }`.

- [ ] **Step 1: Failing tests (run.test.ts)** — three `it`s:

```ts
it("a LEGACY run with no mode (byte-literal of today's shape) loads with mode 'workout' and re-saves with it", () => {
  localStorage.setItem(RUN_KEY, JSON.stringify({ v: 1, workoutId: "w1", title: "T", phases: [], index: 0, phaseStartedAt: "2026-09-02T00:00:00.000Z", pausedAt: null, pausedTotalMs: 0, actuals: {}, startedAt: "2026-09-02T00:00:00.000Z", completedAt: null }));
  const run = loadRun();
  expect(run?.mode).toBe("workout");
  saveRun(run!);
  expect(JSON.parse(localStorage.getItem(RUN_KEY)!).mode).toBe("workout");
});
it("rejects mode 'corrupt' (the twin record's PR 1 lesson)", () => { /* seed with mode: "corrupt" → loadRun() === null */ });
it("PhaseActual union at the boundary: stopwatch without splitSeconds and stopwatch-elapsed WITH one are both rejected; a well-formed stopwatch-elapsed round-trips", () => { /* three seeds */ });
```

- [ ] **Step 2: Run, expect FAIL** (`mode` undefined; corrupt loads; union unchecked).
- [ ] **Step 3: Implement** — in `run.ts`: the two types; `isSessionRun` adds `(value.mode === undefined || value.mode === "workout" || value.mode === "justrow")` and validates each `actuals` value with `isPhaseActual` (switch on `actualSource`, exhaustive, `typeof splitSeconds === "number"` required for `"stopwatch"` and FORBIDDEN for `"stopwatch-elapsed"`); `loadRun` returns `{ ...parsed, mode: parsed.mode ?? "workout" }` with a comment: *legacy upgrade, the ONLY place absence is read, and it is read as the legacy shape, never as a value*. `buildRun` sets `mode: "workout"`. `logDraft.ts:466`: `actualSplit` written only when `actual.actualSource === "stopwatch"`.
- [ ] **Step 4: Run — PASS. Mutation probes:** delete the `mode` clause → corrupt test red; delete the `splitSeconds` check → union test red. Record both failure strings.
- [ ] **Step 5: `pnpm typecheck && pnpm lint`; commit** `feat(session): SessionRun.mode required with load-time upgrade; PhaseActual discriminated union`.

### Task 2: `buildFreeRowRun`

**Files:** Modify `app/src/session/engine.ts`; Test `app/src/session/engine.test.ts`.

**Interfaces:** Produces `buildFreeRowRun(now: Date): SessionRun` — `{ v: 1, mode: "justrow", workoutId: null, title: "Just Row", phases: [expandOne({ k: "test", label: "Just Row" })], index: 0, phaseStartedAt: now.toISOString(), pausedAt: null, pausedTotalMs: 0, actuals: {}, startedAt: now.toISOString(), completedAt: null }`. Use the same phase-builder `buildRun` uses for a `test` step so the phase is byte-identical to a one-step test workout's (the mechanical reference); assert that equality in the test.

- [ ] Failing test: `buildFreeRowRun(now)` has `mode "justrow"`, `workoutId null`, one phase with `type "test"` and label `"Just Row"`, no `seconds`/`meters`; and `bigNumberSeconds(run, run.phases[0], now + 12_340ms)` is `12.34` → counts UP.
- [ ] Implement; PASS; probe (set `mode: "workout"` → red); commit.

### Task 3: `session_logs.source` — schema, migration 0020, validator, GET, domain type

**Files:**
- Modify: `app/server/db/schema.ts` (enum `logSourceEnum = pgEnum("log_source", ["pm5","timer","manual"])`, column `source: logSourceEnum("source").notNull()`)
- Create: `app/drizzle/0020_<generated>.sql` — generated, then hand-edited: `ALTER TABLE session_logs ADD COLUMN source log_source;` → `UPDATE session_logs SET source = CASE WHEN device_name IS NOT NULL THEN 'pm5' WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(steps) s WHERE s->>'actualSource' = 'stopwatch') THEN 'timer' ELSE 'manual' END;` → `ALTER TABLE session_logs ALTER COLUMN source SET NOT NULL;` — with a 0019-style header naming the spec and the backfill rule. Check `steps`' actual column type first (`\d session_logs`); if it is `json` not `jsonb`, cast.
- Create: `app/server/logSource.ts` — `deriveLogSource({ deviceName, steps }): LogSource` (the SAME rule as the SQL, in TS) and `logSourceContradiction(source, { deviceName, steps }): string | null`.
- Modify: `app/server/routes/data.ts` — after the `deviceName` block (`:1478-1487`): if `body.source !== undefined` it must be one of three (400 `"source must be one of pm5, timer, manual"`, field `source`) and `logSourceContradiction` must return null (400 with its message, field `source`); at the insert (`:1688`) `source: body.source ?? deriveLogSource(...)`; when derived, append a ring/diagnostic line `source: derived` (the server's existing request-log line is enough — name it). GET mapping returns `source`.
- Modify: `app/domain/types.ts` — `export type LogSource = "pm5" | "timer" | "manual"` + `LOG_SOURCES` tuple.
- Test: `app/server/routes/source.integration.test.ts` (new), `app/server/logSource.test.ts` (new, unit), extend `freeRow.integration.test.ts`.

- [ ] **Failing tests:** (a) unit: `deriveLogSource` three cases + contradictions (`pm5` without device; `timer` with device; `manual` with device; `timer` with a non-stopwatch, non-empty steps); (b) integration: POST absent → GET returns derived member, three bodies; POST each contradiction → 400 naming `source`; POST `source: "bogus"` → 400; (c) migration: insert three rows BEFORE running 0020 (the integration harness migrates on boot — use a test that runs 0019's migrator state, inserts, then applies 0020; if the harness cannot stage that, run the backfill CASE as a query against three inserted rows and assert the same three answers, and SAY that is what was proven); (d) NOT NULL: a raw insert without `source` is refused by Postgres.
- [ ] Implement; PASS; probes: flip the CASE order in TS (device row → `timer`) → (a) red; remove the contradiction check → (b) red. Commit `feat(server): session_logs.source, NOT NULL with backfill; derive-when-absent + contradiction refusal`.

### Task 4: Every door posts `source`; the client reads the column and nothing else

**Files:**
- Modify: `app/src/session/LogSession.tsx` (posts `source: run ? "timer" : "manual"` — find the one `useLogForm` body builder; the manual door is `Log it after`), `app/src/justrow/JustRowLog.tsx:89-102` (`source: "pm5"` for the monitor entry — the timer entry lands in Task 7)
- Modify: `app/src/log/storedSummary.ts:137,272-276,300` — `StoredLog.source: LogSource` (non-null); `sourceLabel` = switch on `row.source` (`pm5` → `row.deviceName ?? "PM5"`, `timer` → `"TIMER"`, `manual` → `"LOGGED BY HAND"`), delete the steps inference and the header paragraph's "the schema lacks" sentence (replace with: the column landed here, 2026-09-02); `buildMeta` unchanged (keys on the word).
- Modify: `app/src/api.ts` (or wherever `RecentLog`/stored row types live — `grep -rn "deviceName: string | null" app/src`) to carry `source`.
- Modify: every test fixture building a stored row (`grep -rln "deviceName:" app/src --include=*.test.tsx`) gains a `source` — fixtures must be REALISTIC (RF3): device rows `pm5`, stopwatch-step rows `timer`, all-assumed rows `manual`.
- Test: `app/src/log/storedSummary.test.ts`, `app/src/session/LogSession.test.tsx`, `app/src/justrow/JustRowLog.test.tsx`.

- [ ] **Failing tests:** each door's posted body carries its member (spy on the API); `sourceLabel` from the column for three fixtures; a fixture with `source: "timer"` and `steps: []` renders `TIMER` with a time-of-day segment (the board's meta line).
- [ ] Implement; PASS; probe: swap `timer`/`manual` in `sourceLabel` → red. Criterion 3d: `grep -n 'actualSource === "stopwatch"' app/src/log/storedSummary.ts` returns nothing. Commit.

### Task 5: Timer — draft guard, labels, finish that records, freeze at ▶, completion route

**Files:** Modify `app/src/session/Timer.tsx` (`:456` guard, `:478` title, the STEP label builder `:84-101`, the target panel's split text, `handleNext:539`, `handleConfirmFinish:558-569`, `handleKeepGoing`, the completion effect `:450-454`), `app/src/AppRoutes.tsx:114-119` (`CompleteRedirect`). Test `app/src/session/Timer.test.tsx`, `app/src/AppRoutes.test.tsx` (if present; else a routing test in Timer.test).

- [ ] **Failing tests** (seed `buildFreeRowRun` via `saveRun`, NO draft): (1) renders — heading name `Just Row`, STEP slot text exactly `JUST ROW`, target split text `Free`, `UP NEXT` `FINISH`; (2) a run whose `phaseStartedAt` is 10 min in the past renders `10:00` on mount with fake timers never advanced (criterion 5); (3) ▶ then 30 s of fake time then `Finish session` → `loadRun()` has `completedAt !== null` and `actuals[0]` equal to `{ actualSource: "stopwatch-elapsed", elapsedSeconds: <the elapsed at ▶, independent literal> }` — the 30 s did NOT bank (criterion 1/F10); (4) `Keep going` after ▶ resumes (elapsed advances again); (5) completion navigates to `/justrow/log`; a programmed run still goes to `/session/log`; (6) `CompleteRedirect` with a completed justrow run → `/justrow/log`.
- [ ] Implement: guard `run === null || (draft === null && run.mode !== "justrow")`; `title = run.mode === "justrow" ? run.title : draft.title`; label builder returns `"JUST ROW"` for `mode === "justrow"`; split slot `Free` for it; `handleNext` on a justrow run: `apply(pause)` + `setPausedByEndTap(true)`-style latch + `setFinishStaged(true)`; `handleConfirmFinish` for justrow: record `{ actualSource: "stopwatch-elapsed", elapsedSeconds: elapsedSeconds(currentRun, at) }` at `r.index` then `advance`; `handleCancelFinish` resumes if the ▶ paused it; completion effect and `CompleteRedirect` branch on `mode`.
- [ ] PASS; probes: remove the pause in `handleNext` → test 3 red ("expected 12.3 to be 42.3"-shaped); remove the actual write → test 3 red; swap the route → test 5 red. Commit.

### Task 6: `useStartWorkout` guards a LIVE `SessionRun`

**Files:** Modify `app/src/session/useStartWorkout.ts:147-171`; Test `app/src/session/useStartWorkout.test.ts` (or the existing test file for it).

- [ ] **Failing test:** with a LIVE justrow run stored (`completedAt: null`, no draft), `handleStart` stages the replace-confirm and does NOT call `clearRun`; cancelling leaves the stored bytes identical (`JSON.stringify` before/after). Also the pre-existing completed-run case still stages.
- [ ] Implement: the run branch at `:149` stages for any `existingRun !== null` (live or completed), with copy that names the live case if the existing confirm copy assumes "unlogged" — reuse the existing string if it is honest for both; if not, the copy is `A session is still running. Replace it?` ONLY if James approves — otherwise reuse (flag in the report).
- [ ] PASS; probe: restore the `completedAt !== null` condition → red. Commit.

### Task 7: The door, the timer log-door entry, Today's routing

**Files:** Modify `app/src/justrow/JustRow.tsx:122-150` (second action), `app/src/justrow/JustRowLog.tsx` (entry kind, precedence, body), `app/src/today/Today.tsx:559-623` (UnloggedRow `Log it` → `/justrow/log` when `run.mode === "justrow"`; the comment names WHICH record). Tests: `JustRow.test.tsx`, `JustRowLog.test.tsx`, `Today.test.tsx`.

- [ ] **Failing tests:** (1) door renders `Start Timer` under Connect, meta `NO TARGETS · NO PLAN`; pressing it with no stored run saves a `mode: "justrow"` run and navigates to `/session/run`; with an unlogged run stored it stages the SAME confirm Connect stages (assert the shared component/string) and cancelling leaves bytes identical (criterion 6); (2) log door with a completed timer run: heading `Just Row`, meta `SEP 2 · TIMER` (fake system time), card shows TIME `12:34` and NO `DISTANCE`/`AVG SPLIT` text, Save posts `{ workoutId: null, workoutType: null, workoutTitle: "Just Row", steps: [], timeSeconds: 754, advancesPlan: false, source: "timer", ... }` and the body has NO `distanceMeters` key (`expect("distanceMeters" in body).toBe(false)`); after success `loadRun()` is null; (3) precedence (criterion 7c): seed BOTH a completed justrow MonitorRun hand-off and a completed justrow SessionRun — the newer `completedAt` wins and the ring has an entry naming the other; (4) Today: unlogged justrow SessionRun's `Log it` navigates to `/justrow/log`.
- [ ] Implement per spec §Mechanism 2 and 4. `freeRowTotals` untouched (F6).
- [ ] PASS; probes: swap precedence → (3) red; drop `workoutTitle` → the integration test from Task 3 is the gate, so ALSO assert it in (2). Commit.

### Task 8: `FreeRowChip`

**Files:** Create `app/src/workout/FreeRowChip.tsx` (+ CSS rule `.free-row-chip` in `index.css` next to `.workout-row-custom`, copying its values: transparent, `1px solid var(--rule-3)`, `var(--ink-3)`, mono 11px/600, TypeBadge's 30×22 box); Modify `app/src/log/LogRow.tsx` (render `<FreeRowChip/>` in the badge slot when `isFreeRow(log.workoutId, log.workoutType)`), `app/src/justrow/JustRow.tsx` (badge row above the title). Tests: `FreeRowChip.test.tsx` (new), `HistoryList.test.tsx`, `JustRow.test.tsx`, and a structural test that `.free-row-chip` has exactly one rule and `.type-badge` is NOT applied to it (copy `ConnectedInterstitial.test.tsx:1098`'s pattern).

- [ ] **Failing tests:** a `(null, null)` row renders `JR` in a `.free-row-chip` and no `.type-badge`; a `(null, "O2")` row (the deleted-workout retry shape) renders the O2 badge and NO chip — the PAIR rule; the door shows the chip above the title.
- [ ] Implement; PASS; probe: key the chip on `workoutId === null` alone → the `(null,"O2")` test red. Commit.

### Task 9: e2e, captures, docs reconciliation

**Files:** `app/e2e/justrow.spec.ts` (new test: door → `Start Timer` → wait → ▶ → `Finish session` → log door → `Save this row` → History shows `Just Row` with `.free-row-chip`, no second line → detail meta contains `TIMER`), `app/e2e/screenshots.spec.ts` (`justrow-timer`, `justrow-timer-landscape`, `justrow-log-timer`, `justrow-history-chip` — the History row WITH a hero snippet AND the chip, the wrap question from the antagonist), `docs/design/DEVIATIONS.md` (reconcile any row describing "no badge for a free row"), `ROADMAP.md` (the derive-when-absent SUNSET item with the next tag as trigger — criterion 8b; Phase LM's queued "new stored field" row → landed here, LM keeps the naming question), `docs/RELEASING.md` (rollback floor row for 0020), the handoff README status line.

- [ ] Write the e2e red-first (the flow does not exist on main); implement nothing new — it goes green on Tasks 5-8; captures via `pnpm screenshots`, open every image (RF7), commit only the four new ones plus any that changed for a reason.
- [ ] `pnpm e2e` full, `pnpm test:coverage` (check per-file numbers for every new file, RF2), `pnpm build && pnpm dist:grep`.
- [ ] Commit `docs+e2e: unconnected Just Row flow, captures, ROADMAP sunset + LM reconcile, rollback floor`.

### Task 10: Close-out

- [ ] PR body in the human-first shape (≤120 words above the fold, Record block below) with the four captures; the risk note names the three stored shapes and the derive-when-absent sunset.
- [ ] PM final-PR gate (TRIAD) — dispatch with the PR, the spec (rev 5), and this plan; present the verdict; STOP for James.
- [ ] Release-notes entry is NOT in this PR (it rides the next notes PR, and must acknowledge v0.32.0's "connect to the erg" and "no type chip, on purpose" reversals — recorded in ROADMAP now so it is not lost, RF14).

## Self-review

- Spec coverage: §Mechanism 1 → T2; 2 → T7; 3 → T5; 4 → T7; 5 → T7; 6 → T3/T4; 7 → T8; stored shapes (a)(b) → T1, (c) → T3; lifetime table's live-Start guard → T6; sunset → T9. Exit criteria 1 → T7+T5, 2 → T3 (existing integration shape), 3/3b/3c/3d → T3/T4, 4 → T8/T9, 5 → T5, 6 → T6/T7, 7/7b/7c → T1/T7, 8/8b → T9, boards → T9.
- Placeholders: none. Type consistency: `SessionRunMode`, `PhaseActual` union, `LogSource` named once in T1/T3 and used by name after.
