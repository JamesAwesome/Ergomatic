# Storage Spine PR 1 — Accept the Burst (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The machine's finish burst (final 0x0037, 0x0039's work-only totals, 0x003F's hash bytes) is captured on BOTH sides of the finish race and stored as write-once observations on the closed record — nothing displayed, nothing else mutated.

**Architecture:** Driver side: the summary gate opens during an open run's final interval, and the split-won reconcile branch consumes the summary for observations instead of discarding; 0x003F gains a production subscription (non-critical class, both arms). A new driver event carries the observations out. Hook side: teardown defers three steps (reconcile drain, unsubscribe, disconnect) behind a 2s linger with a second ring stash; a guarded post-close writer appends the observations to the stored record keyed on the run's own `startedAt`. Fake side: a scriptable natural-finish burst, both race orderings.

**Tech Stack:** TypeScript; Vitest unit (domain) + client (src) projects; the committed keystone capture as the end-to-end replay.

**Spec:** `docs/superpowers/specs/2026-08-23-storage-spine-design.md` §2 (post-delta revision — its corrections are binding; on conflict with observation, report it, rule 10).

## Global Constraints

- Worktree `.claude/worktrees/rc-spine`, branch `rc-spine`. `git rev-parse --show-toplevel` before every commit. `export PATH="$HOME/.local/share/nvm/v26.5.0/bin:$PATH"` every shell.
- TDD; gates FOREGROUND; vitest via `pnpm test --project unit|client` only (never `pnpm exec vitest run` — jsdom/NODE_OPTIONS traps).
- Exact constants: `BURST_LINGER_MS = 2000` (comment carries the 5.0× margin math AND the n=1 caveat verbatim from spec §2). `SUMMARY_WINDOW_MS` does not exist — that was the killed design; never introduce it.
- The record's every pre-existing field stays byte-identical with or without a burst: `endedBy` writers, `closeRecord` timing, the summary screen — untouched. Only the two new observation fields may differ.
- The observation writer appends ONLY `summaryTotals` + `verificationBytes`, once, keyed on `startedAt` identity, and SKIPS if `MONITOR_RUN_KEY` is cleared or holds a different run. `isMonitorRun` gains NO new required checks (its positive-conjunction tolerance is the compatibility mechanism — `monitorRun.ts:290-335`'s own comment; `v` stays 2).
- 0x003F subscribe is NON-CRITICAL (LL's degrade class): a missing characteristic must not fail a connect, and the failure is recorded, not swallowed.
- Terminate/END paths byte-identical (burst status UNKNOWN per spec §1).
- This PR is a localStorage stored-shape change and gets the PM final gate — no merge on green alone.

## File map

- Modify: `app/src/monitor/driver.ts` (noteSummary gate ~:2515-2540, reconcileSummary split-won branch ~:2983-2987, subscribe list ~:3665-3695, RC-7's synthesized-final `restDistanceMeters: 0` ~:3037, new event), `app/src/monitor/transports/capacitorBle.ts` (SERVICE_OF ~:64-67), `app/src/monitor/monitorRun.ts` (fields + writer), `app/src/monitor/useMonitorSession.ts` (teardown STEP 1-4 restructure ~:2011-2130, linger, second stash, guards), `app/src/monitor/transports/fake.ts` (burst), `app/src/monitor/captureReplay.test.ts` (keystone end-to-end).
- Tests beside each file, plus `driver.test.ts` / `monitorRun.test.ts` / `useMonitorSession.test.ts` / `fake.test.ts`.

---

### Task 1: Driver — the gate, the consumer, the subscription, the event

**Files:**
- Modify: `app/src/monitor/driver.ts`, `app/src/monitor/transports/capacitorBle.ts`
- Test: `app/src/monitor/driver.test.ts`, `app/src/monitor/transports/capacitorBle.test.ts`

**Interfaces:**
- Produces (Tasks 3/5 rely on these exact names): a new driver event
  `{ kind: "summary-observations"; totals: { workElapsedSeconds: number; workDistanceMeters: number }; verificationBytes?: readonly number[] }`
  emitted AT MOST ONCE per run, from the reconcile consumption path (both branches: split-won and no-split), after the run closed naturally. `totals` are 0x0039's own decoded work-only values, untransformed. `verificationBytes` present only if a 0x003F frame was received this run (raw bytes, undecoded).
- Produces: 0x003F subscribed in the driver's non-critical set; a failed subscribe records to the event log (`subscribe-degraded` idiom — find LL's existing non-critical handling and match it); `capacitorBle.ts` SERVICE_OF maps `LOGGED_WORKOUT_UUID` → the rowing service (mirror `webBluetooth.ts:118`).

- [ ] **Step 1: Failing tests, gate + consumer.** In `driver.test.ts`, find the existing `noteSummary`/reconcile tests (grep `summary-reconciled`, `discarded unread`). Add: (a) a 0x0039 arriving while an open run is IN ITS FINAL interval (drive a 2-interval fake-scripted run to interval 2, deliver 0x0039 BEFORE the terminal) is buffered — no "out-of-window"/discard log — and at natural close the `summary-observations` event fires with the decoded totals; (b) the split-won path (final 0x0037 arrives, then 0x0039, then terminal) emits the SAME event instead of logging "discarded unread" — assert the old log line is GONE and the event carries the totals; (c) `deriveFinalIntervalFromSummary` still runs ONLY when no final split arrived (pin the existing no-split path unchanged); (d) a 0x003F frame during the run puts its raw bytes on the event; absence omits the field; (e) a terminate run emits NO `summary-observations` event even if bytes were buffered (natural-finish-only).
- [ ] **Step 2: Verify failures** — `pnpm test --project client` (driver tests are client-project; confirm via the file's header) or `--project unit` per its actual project; check the "Test Files" count.
- [ ] **Step 3: Implement** — the gate: `noteSummary`'s `!graceIsOpen(run)` branch gains the final-interval acceptance (an open, un-closed run whose current program index is the last interval buffers instead of logging out-of-window; the re-fire protection — the HRM ~1-minute second 0x0039 — is preserved by the run-closed check: a second fire after close hits the write-once event guard, assert it in (a)). The consumer: `reconcileSummary`'s split-won branch emits the event (totals + bytes) instead of discarding; the no-split branch emits it too after its existing derive. The subscription: 0x003F in the non-critical set with the recorded-failure idiom; SERVICE_OF entry in capacitorBle. Event plumbing follows the file's existing `emit` pattern.
- [ ] **Step 4: RC-7's omit** — the synthesized-final fallback stops writing `restDistanceMeters: 0`; omit the field (additive-optional shape). Retarget any test pinning the 0.
- [ ] **Step 5: Project green; per-file coverage on driver.ts's touched regions checked; self-mutation:** delete the final-interval acceptance → (a) red; restore the discard → (b) red; drop the natural-finish-only guard → (e) red. Record kills.
- [ ] **Step 6: Commit** `feat: the driver hears the machine's finish — and stops throwing it away`.

### Task 2: monitorRun — the observation fields and the guarded writer

**Files:**
- Modify: `app/src/monitor/monitorRun.ts`
- Test: `app/src/monitor/monitorRun.test.ts`

**Interfaces:**
- Produces (Task 3 relies on these): `MonitorRun` gains `summaryTotals?: { workElapsedSeconds: number; workDistanceMeters: number }` and `verificationBytes?: readonly number[]` (additive-optional; `isMonitorRun` untouched — its positive conjunction is the tolerance, cite the file's own comment in yours). And:

```ts
/** Appends the burst's observations to the STORED record — write-once,
 *  identity-keyed, and mute on every mismatch. Returns what it wrote, or
 *  null when it (correctly) declined. */
export function appendSummaryObservations(
  runStartedAt: string,
  observations: {
    totals: { workElapsedSeconds: number; workDistanceMeters: number };
    verificationBytes?: readonly number[];
  },
): MonitorRun | null;
```

Behavior (each line a test): re-reads `MONITOR_RUN_KEY` at call time; returns null (writing nothing) when the key is empty (the `clearMonitorRun()` resurrection race), when the stored run's `startedAt !== runStartedAt` (a second `program()` re-arm overwrote it), when the stored run is not naturally closed (`completedAt === null` or `endedBy !== "finished"`), or when `summaryTotals` already exists (write-once). On the one valid case it writes ONLY the two fields, preserving every other byte (assert deep-equality of the rest).

- [ ] **Step 1: Failing tests** — the five behavior lines, each with a realistic stored run built by the file's existing factory (never a minimal stub); plus a round-trip pin: a record WITH observations loads through `isMonitorRun` and back (v stays 2, no migration).
- [ ] **Step 2: Verify failures** (`pnpm test --project client`).
- [ ] **Step 3: Implement**, following the file's load/save idioms (`loadMonitorRun`/`saveMonitorRun`).
- [ ] **Step 4: Green; coverage; self-mutation:** drop the identity check → the second-run test red; drop write-once → red; drop the cleared-key guard → red.
- [ ] **Step 5: Commit** `feat: the record can hold the machine's own totals — once, and only its own`.

### Task 3: The hook — the linger, the second stash, the guarded doors

**Files:**
- Modify: `app/src/monitor/useMonitorSession.ts` (teardown ~:2011-2130 and the `acceptableFinalBoundary` door)
- Test: `app/src/monitor/useMonitorSession.test.ts`

**Interfaces:**
- Consumes: Task 1's `summary-observations` event; Task 2's `appendSummaryObservations`.
- Produces: `BURST_LINGER_MS = 2000` exported for tests; teardown semantics below.

Teardown at a NATURAL-FINISH terminal where the burst has not completed: STEP 2 (stash) runs at t=0 as today; STEPS 1 (reconcile drain), 3 (unsubscribe), 4 (disconnect) defer to the earlier of burst completion or `BURST_LINGER_MS`; at deferral end, run the drain-unsubscribe-disconnect in today's order and take a SECOND stash (`exportLog()` again, same keys, overwrite — the later snapshot strictly contains the earlier; rewrite STEP 2's "would never reach sessionStorage" comment to name the second stash). Every OTHER teardown cause (cancel, fail, unmount mid-session, terminate) is byte-identical to today — pin at least terminate. The `summary-observations` handler calls `appendSummaryObservations(run.startedAt, …)`; the `acceptableFinalBoundary` door gains the same re-read-and-identity guard before its `saveMonitorRun` (the linger widens its window ~20–100×). A link death during the linger ends the listening (handler no-ops) but the deferred disconnect still runs.

- [ ] **Step 1: Failing tests** — with the file's fake-driven idioms: (a) late-side: terminal then burst at +400ms (fake clock) → observations stored, second stash contains the burst-era ring entries, disconnect happened at burst completion (not 2000); (b) early-side: burst before terminal → NO added latency (disconnect timing unchanged from today's pin), observations stored; (c) no burst → disconnect at exactly `BURST_LINGER_MS`, record byte-identical to today's; (d) the resurrection race: clear `MONITOR_RUN_KEY` inside the linger → `appendSummaryObservations` declines, nothing reappears; (e) terminate teardown byte-identical (no linger).
- [ ] **Step 2: Verify failures at project scope.**
- [ ] **Step 3: Implement.** The deferral uses the hook's existing injected-clock idiom (grep the LL watchdog wiring for the pattern); never a bare `setTimeout` without it.
- [ ] **Step 4: Green; coverage on the teardown region; self-mutation:** un-defer STEP 1 (drain at t=0) → (a) red (observations lost — the delta pass's A3, now a pinned mutant); drop the second stash → (a)'s stash assertion red; drop the door guard → (d) red.
- [ ] **Step 5: Commit** `feat: teardown waits two seconds for the machine to finish its sentence`.

### Task 4: The fake's natural-finish burst

**Files:**
- Modify: `app/src/monitor/transports/fake.ts`
- Test: `app/src/monitor/transports/fake.test.ts`

**Interfaces:**
- Produces: `FakeScript` gains an optional burst description — follow the file's existing script-event shape (grep the 0x0037 boundary emission for the idiom): at a scripted natural finish the fake emits final 0x0037/0x0038, then 0x0039 (+`atMs` offset), then 0x003A, then 0x003F (each offset scriptable), with 0x0039's totals computed WORK-ONLY from the script's own intervals (never fused — this is the fake telling the truth the real machine tells). BOTH orderings scriptable: burst-before-terminal and terminal-before-burst (the script controls when the state flip frame goes out relative to the burst). Wall-clock-free contract intact — the wrapper's clock drives everything (`autoTicking`/`tick`).

- [ ] **Step 1: Failing tests** — burst frames arrive in scripted order with scripted offsets; totals are work-only (a script WITH rests: fused ≠ work-only, assert the work-only value); 0x003F bytes exactly as scripted; a script without a burst behaves byte-identically to today (regression pin).
- [ ] **Step 2: Verify failures.**
- [ ] **Step 3: Implement** inside the fake's existing event machinery; no `Date.now`, no timers.
- [ ] **Step 4: Green; the file's byte-for-byte write-verify tests untouched.**
- [ ] **Step 5: Commit** `feat: the fake finishes like the machine does — burst and all, both orders`.

### Task 5: The keystone replay, end to end, and the gates

**Files:**
- Modify: `app/src/monitor/captureReplay.test.ts` (or its sibling — follow the existing committed-capture replay idiom)
- No product files.

- [ ] **Step 1: The end-to-end replay (failing first only if Tasks 1-3 are wrong — this is the integration pin):** replay `docs/monitor/sessions/walk-2026-08-23/keystone-pm5-recording-1787491974452.jsonl.gz` through the real transport-replay seam into the real hook: the burst-first race as it actually happened. Assert: the record's `summaryTotals` reads workElapsedSeconds 138.7 and workDistanceMeters 500.0; `verificationBytes` begins `0x27 0xd8 0xf3 0x6e 0xe1 0x52 0x55 0x5b`; the final interval is the real 0x0037's (68.6 s / 250 m shape); `endedBy: "finished"`; every pre-existing field matches a burst-stripped replay of the same capture (byte-identical-but-for-observations, asserted programmatically). Note in the test: the capture's 0x003F exists via the instrument's subscription — this pin proves decode+fold; production reachability is Task 1's subscription tests.
- [ ] **Step 2: Full gate, foreground:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (both summary lines), `pnpm e2e` (full count — src touched), `pnpm screenshots` (expect zero committed diffs; investigate any, commit none that aren't this PR's surface — nothing here draws).
- [ ] **Step 3: Docs riders:** `pm5-interface-notes.md` gains the burst-race section (the §1 ordering facts: state 5→12, 3-of-5 burst-first, the gate-discard mechanism) — the notes file is the wire-facts home (RF14); DEVIATIONS untouched (nothing it describes changed).
- [ ] **Step 4: Commit** `test: the walk's own finish, replayed to the byte` and report done — the controller assembles the PR (PM final gate follows).

---

## Self-review (done at write time)

- Spec §2 coverage: early gate + consumer → T1; linger + stash + doors → T3; 0x003F production subscription → T1; observation writer + shape safety → T2; RC-7 → T1 Step 4; fake burst → T4; exit criteria 1 → T1/T3/T4 tests, 2 → T5, 7's readout → T3's second stash.
- Interfaces consistent: `summary-observations` event shape and `appendSummaryObservations` signature named identically in T1/T2/T3; `BURST_LINGER_MS` in T3 only.
- No placeholders. PR 2/3 explicitly out (own plans after this merges).
