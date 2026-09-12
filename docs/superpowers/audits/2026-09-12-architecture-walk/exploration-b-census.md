# Exploration B — read-only census of the eight session-level replay specs

Repo `/Users/james/projects/github/jamesawesome/Ergomatic`, `main` at `bed5c1e4`
(working tree clean). Nothing was edited, committed, or run as a test; every
number below comes from a static command whose invocation is shown. All paths
are relative to `app/src/monitor/` unless absolute.

**One brief correction up front.** The ROADMAP row says each file
"re-hand-roll[s] the same ~45 lines of setup: ... two `vi.doMock`s,
`resetModules`, a dynamic import". After #413 that is true of **two** of the
eight (`liveDropSeamReplay`, `structureWatchSessionReplay`), which #413 did not
touch. Of the other six: two (`lifecycleReplay`, `partialReplay`) have **no**
`vi.doMock`, **no** `resetModules` and **no** dynamic import at all; four still
carry `resetModules` + a dynamic import for reasons unrelated to mocking; and
the only surviving mocks in those four are `../api*` door mocks in two files,
not transport/lifecycle mocks. Command:

```
$ cd app/src/monitor && grep -n "vi\.doMock(" burstReplay.test.ts lifecycleReplay.test.ts \
    summaryHoldReplay.test.ts handoffStoreReplay.test.ts justRowReplay.test.ts \
    partialReplay.test.ts liveDropSeamReplay.test.ts structureWatchSessionReplay.test.ts
burstReplay.test.ts:33:// PR 2; this file used to reach it through a `vi.doMock("../adapters/      <- COMMENT
lifecycleReplay.test.ts:12://   - unit tests — they used to `vi.doMock("../adapters/appLifecycle")`,  <- COMMENT
justRowReplay.test.ts:118:    vi.doMock("../api", () => ({ api: apiFn }));
justRowReplay.test.ts:223:    vi.doMock("../api/useWorkouts", () => ({
justRowReplay.test.ts:226:    vi.doMock("../api/useBaselines", () => ({
justRowReplay.test.ts:232:    vi.doMock("../api/usePlan", () => ({
justRowReplay.test.ts:238:    vi.doMock("../api/usePreferences", () => ({
justRowReplay.test.ts:248:    vi.doMock("../api/useRecentLogs", () => ({
summaryHoldReplay.test.ts:624:  vi.doMock("../api", () => ({ api: fn }));
summaryHoldReplay.test.ts:674:  vi.doMock("../api/useWorkouts", () => ({
summaryHoldReplay.test.ts:680:  vi.doMock("../api/useBaselines", () => ({
summaryHoldReplay.test.ts:686:  vi.doMock("../api/usePlan", () => ({
liveDropSeamReplay.test.ts:281:  vi.doMock("../adapters/monitorTransport", () => ({
structureWatchSessionReplay.test.ts:134:  vi.doMock("../adapters/monitorTransport", () => ({
```

`vi.mock(` (hoisted) count is **0** in all eight (`grep -c "vi\.mock("` → 0×8).
`handoffStoreReplay` and `partialReplay` carry zero `doMock`s.

`git show --stat bed5c1e4` lists `burstReplay`, `handoffStoreReplay`,
`justRowReplay`, `lifecycleReplay`, `partialReplay`, `summaryHoldReplay` as
touched by #413; `liveDropSeamReplay` and `structureWatchSessionReplay` are
absent — their last touch was `deb50b77` (Phase MD PR 1) / `a5519e8c`.

---

## 0. Size of the thing

```
$ wc -l burstReplay.test.ts lifecycleReplay.test.ts summaryHoldReplay.test.ts \
        handoffStoreReplay.test.ts justRowReplay.test.ts partialReplay.test.ts \
        liveDropSeamReplay.test.ts structureWatchSessionReplay.test.ts
```

| file | total | header comment | imports | preamble (1 → first `describe`−1) | runner fn span (non-comment lines) | `it()` | runner calls |
|---|---|---|---|---|---|---|---|
| `burstReplay` | 411 | 1–60 | 61–81 | 290 | `runReplay` 232–289 (38) | 1 | **2 in one test** |
| `lifecycleReplay` | 412 | 1–61 | 62–79 | 321 | `runReplay` 261–316 (45) | 3 | 3 (1/test) |
| `summaryHoldReplay` | 1184 | 1–135 | 136–175 | 752 | `runReplay` 539–612 (50) | 3 | **5 (2+2+1)** |
| `handoffStoreReplay` | 676 | 1–116 | 117–128 | 401 | `runReplay` 329–400 (55) | 3 | 3 (1/test) |
| `justRowReplay` | 399 | 1–37 | 38–55 | 81 | **no runner** — inline 96–149 (35) | 1 | 1 (inline) |
| `partialReplay` | 637 | 1–87 | 88–107 | 371 | `runReplay` 312–370 (50) | 5 | 5 (1/test) |
| `liveDropSeamReplay` | 434 | 1–55 | 56–80 | 365 | `runLiveDropReplay` 269–364 (76) | 2 | 1 (test 2 needs no hook) |
| `structureWatchSessionReplay` | 246 | 1–17 | 18–29 | 196 | `runReplay` 110–187 (59) | 2 | 2 (1/test) |

"non-comment lines" = the runner's body with blank lines, `//` lines and
`/** */` blocks stripped (the line-set script is in the Method notes at the end).

**Line-level overlap of the eight runner cores.** I extracted the stanza from
`const replay = createReplayTransport…` through the end of the
`program()`/`run()` act block from each file, stripped comments/blanks, and
normalised the per-file constant names (`*_CAPTURE` → `CAPTURE`, `*_PROGRAM` →
`PROGRAM`, `*_IDENTITY` → `IDENTITY`). 109 distinct normalised lines across the
eight. Distribution:

| present in | count | the lines |
|---|---|---|
| **8/8** | 8 | `);` · `}),` · `});` · `},` · `await act(async () => {` · `await result.current.connect();` · `driverOptions: {` · `now: () => FIXED_NOW,` |
| 7/8 | 3 | `let replayResult: ReplayResult = { divergences: [] };` · `now: () => replay.clock.now(),` · `schedule: (fn, ms) => replay.clock.schedule(fn, ms),` |
| 6/8 | 8 | `await import("./useMonitorSession");` · `await pending;` · `const { result } = renderHook(() =>` · `const { useMonitorSession: freshUseMonitorSession } =` · `freshUseMonitorSession({` · `replayResult = await replay.run();` · `schedule: releasingSchedule((cb, ms) => replay.clock.schedule(cb, ms)),` · `vi.resetModules();` |
| 5/8 | 7 | `const transport = withLiveness(replay.transport, {` · `createTransport: () => transport,` · `onSilence: () => undefined,` · `onRecovery: () => undefined,` · `registerAppLifecycleListener: () => (): void => undefined,` · `}` · `};` |
| 4/8 | 1 | `const replay = createReplayTransport(CAPTURE);` |
| 3/8 | 4 | `const pending = result.current.program(PROGRAM, IDENTITY);` · `divergences: replayResult.divergences,` · `localStorage.clear();` · `return {` |
| 2/8 | 19 | — |
| 1/8 | **59** | — |

**Four of the eight 8/8 lines are punctuation** (`);`, `}),`, `});`, `},`).
The genuinely semantic lines shared by all eight are exactly four:
`await act(async () => {`, `await result.current.connect();`,
`driverOptions: {`, `now: () => FIXED_NOW,`.

---

## 1. Per-file setup census

### `burstReplay.test.ts` (411 lines; setup 1–290)

- **Recording**: `walk-2026-08-23/keystone-pm5-recording-1787491974452.jsonl.gz`
  (`CAPTURE_FILE`, :96). One capture.
- **Path**: `import.meta.url` surgery, :89–95 —
  `.replace(/^file:\/\//,"").replace(/src\/monitor\/burstReplay\.test\.ts$/, "../docs/monitor/sessions/walk-2026-08-23/")`.
  Comment (:85–88) states the reason: *"this project's jsdom environment resolves
  `new URL(...)` against `http://localhost:3000/` instead of a `file://` base, so
  plain string surgery on `import.meta.url` is used instead."*
- **Parse**: `parseRecording(gunzipSync(readFileSync(...)).toString("utf8"))` at
  module scope, :100–102. Comment: *"gunzip+parse is fast but not worth repeating
  per test."*
- **Fixtures**: hand-transcribed `KEYSTONE_PROGRAM` (:128), `KEYSTONE_IDENTITY`
  with empty `logSeed` (:154–158), `FIXED_NOW = 2026-08-23T09:28:00.000Z` (:169),
  `stripBurst()` helper.
- **Transport**: `createReplayTransport(recording)` **no options** (:248);
  `withLiveness(replay.transport, {now, schedule, onSilence: () => undefined,
  onRecovery: () => undefined})` built OUTSIDE the hook (:249–255) — the hook's
  own silence handlers are **stubbed out**.
- **Mocks**: none. `vi.resetModules()` (:260) + `await import("./useMonitorSession")`
  (:262–263) survive for a stated non-mock reason — :203–232: *"Called TWICE in the
  one test below (the real burst run, then the burst-stripped control) —
  `vi.resetModules()` forces a genuinely fresh module graph … the handoffStore
  module's own in-memory `current`/`tombstones` would otherwise still hold the real
  run's record … found empirically — `control.record` came back `null`."*
  Also `localStorage.clear()` at the top of `runReplay` (:243) for the same
  collision on the physical global.
- **`renderHook` deps**: `{ now: () => FIXED_NOW, createTransport: () => transport,
  registerAppLifecycleListener: () => () => undefined, driverOptions: { now,
  schedule: releasingSchedule(...) } }`.
- **before/after**: `afterEach` only (:292–296): `vi.resetModules(); vi.restoreAllMocks();
  localStorage.clear();`. No `resetHandoffStore()`.

### `lifecycleReplay.test.ts` (412 lines; setup 1–321)

- **Recording**: the SAME `walk-2026-08-23/keystone-pm5-recording-1787491974452.jsonl.gz`
  (:91). One capture, spliced by `spliceBriefInterruption()` / used raw.
- **Path**: `import.meta.url` surgery, :84–90, same shape, own filename regex.
- **Parse**: gunzip + `parseRecording` at module scope, :100–102.
- **Fixtures**: `KEYSTONE_PROGRAM` (:109), `KEYSTONE_IDENTITY` empty `logSeed`
  (:130–134), `FIXED_NOW = 2026-08-23T09:28:00.000Z` (:136) — **identical to
  `burstReplay`'s two fixtures, re-derived by hand.**
- **Transport**: `createReplayTransport(recording, { onLifecycle: (e) => lifecycleCb?.(e) })`
  (:269–271) — the ONLY file passing `onLifecycle`. `withLiveness` composed
  **INSIDE** `createTransport(liveness)` spreading `...liveness` (:283–288), so the
  hook's REAL `onSilence`/`onRecovery` reach the decorator. Doc comment :249–252:
  *"the hook's OWN `onSilence`/`onRecovery` handlers, spread through from the `deps`
  it passes in, never stubs."*
- **Mocks / resets**: **none.** Comment :276–279: *"Both halves of this harness are
  DEPENDENCIES now — the transport and the lifecycle registrar — so a recording's
  `lifecycle` track reaches the production handler with no module mock, no
  `vi.resetModules()`, and no dynamic re-import."*
- **`renderHook` deps**: `{ now, createTransport: (liveness: LivenessDeps) => withLiveness(...),
  registerAppLifecycleListener: (cb) => { lifecycleCb = cb; return () => undefined; },
  driverOptions }`.
- **before/after**: `beforeEach` (:323–330) `resetHandoffStore(); resetConnectionAttemptTraceForTests();`
  with the comment *"The isolation `vi.resetModules()` used to give this file (Phase MD
  PR 2) … Both are reset per test now, explicitly."* `afterEach` (:331–334)
  `vi.restoreAllMocks(); localStorage.clear();`.

### `summaryHoldReplay.test.ts` (1184 lines; setup 1–752)

- **Recordings**: **two** — `walk-2026-08-25/smoke-terminated-recording.jsonl.gz`
  (:197) and `walk-2026-08-28/end-on-interval-1-recording.jsonl.gz` (:202), via a
  local `loadCapture(walkDir, file)` (:189–195).
- **Path**: `MONITOR_SESSIONS_ROOT` — surgery to the sessions ROOT, not a walk dir
  (:182–188); each leg joins its own `walkDir` underneath.
- **Fixtures**: two hand-transcribed programs (`SMOKE_TERMINATED_PROGRAM` :221,
  `END_ON_INTERVAL_1_PROGRAM` :268); two identities with **populated `logSeed`s**
  (:246–250 length-1, :304 length-3); `FIXED_NOW = 2026-08-25T09:00:00.000Z` (:321);
  `stripBurst`, `buildTrailingEvent`, `endTerminateBarrier` (:344),
  `lastRxBeforeBarrier` (:374), `scheduleEndPress(replay, result)` (:500–507).
- **Transport**: `createReplayTransport(recording)` no options (:560);
  `withLiveness` built OUTSIDE, onSilence/onRecovery **stubbed** (:561–566).
- **Mocks**: 4 `vi.doMock`s, ALL `../api*` for the LogSession door —
  `../api` (:624), `../api/useWorkouts` (:674), `../api/useBaselines` (:680),
  `../api/usePlan` (:686). `mountLogSessionAndSave()` (:665–738) renders `LogSession`
  through `MemoryRouter` and drives HELD / Effort 2 / Save. Its doc comment (:660–664)
  says it deliberately does NOT `resetModules()` before importing `./LogSession`.
- **Resets**: `vi.resetModules()` (:573) + dynamic import (:575–576), same
  FRESH-MODULE-GRAPH reason as `burstReplay`, stated at :529–531 and :549–558 plus
  `localStorage.clear()` at :559.
- **`renderHook` deps**: adds a **top-level `schedule: (cb, ms) => replay.clock.schedule(cb, ms)`**
  (:585, "Antagonist REVISE 6") — the ended hand-off's `FINISH_HANDOFF_HOLD_MS` /
  `BURST_HANDOFF_HOLD_MS` backstops on the replay clock. Only `partialReplay` also
  has this. Runner signature is generalised: `runReplay(recording, program, identity,
  scheduleAction?)`.
- **before/after**: file-level `afterEach` (:743–751): four `vi.doUnmock`s +
  `vi.resetModules(); vi.restoreAllMocks(); localStorage.clear();`. No `resetHandoffStore()`.

### `handoffStoreReplay.test.ts` (676 lines; setup 1–401)

- **Recording**: `walk-2026-08-25/rests-finished-recording.jsonl.gz` (:141). One.
- **Path**: `import.meta.url` surgery to the walk dir, :134–139.
- **Parse**: gunzip + `parseRecording` at module scope, :145–147.
- **Fixtures**: `RESTS_PROGRAM` (:151), `RESTS_IDENTITY` empty `logSeed` (:182–186),
  `FIXED_NOW = 2026-08-25T09:00:00.000Z` (:192), `snapshotStore()` (~:290),
  **`installClosedWriteDenial()`** (:218–250) — a `vi.spyOn(Storage.prototype, "setItem")`
  that records every `MONITOR_RUN_KEY` write attempt and then throws a sticky
  `QuotaExceededError` once a `completedAt`-bearing value appears. Unique to this file.
- **Transport**: `createReplayTransport(RESTS_CAPTURE)` no options (:332);
  `withLiveness` OUTSIDE, onSilence/onRecovery **stubbed** (:333–338).
- **Mocks**: none.
- **Resets**: `vi.resetModules()` (:346) + `await import("./useMonitorSession")` (:348–349)
  + **`const freshStore = await import("./handoffStore")` (:351)**. Doc comment
  :322–327: *"The store instance read there is the one the FRESH hook got, obtained by
  importing `./handoffStore` inside this function's own `vi.resetModules()` epoch; the
  module-scope import at the top of a test file would be a different instance entirely
  and would report `null` forever."* Note the file ALSO statically imports
  `loadMonitorRun` from the same module (:123) and uses it for the final read.
  No `localStorage.clear()` inside the runner.
- **Extra runner parameter**: `snapshotAtMs: readonly number[]` — snapshots scheduled
  on `replay.clock` so they fire *between* two recorded wire frames (:355–359),
  plus a final snapshot after the bytes run out (:387–391).
- **`renderHook` deps**: the burst shape exactly (no top-level `schedule`).
- **before/after**: `afterEach` inside the first `describe` (:403–407):
  `vi.resetModules(); vi.restoreAllMocks(); localStorage.clear();`. No `resetHandoffStore()` —
  `resetModules` IS its per-test store isolation.

### `justRowReplay.test.ts` (399 lines; setup 1–81, then everything inline)

- **Recording**: `walk-2026-08-31-justrow/just-row-pm5-recording-1788214688045.jsonl.gz`
  (:64–69). One.
- **Path**: `import.meta.url` surgery, :57–62 — the only one of the eight with **no
  explanatory comment** on the surgery.
- **Parse**: gunzip + `parseRecording` at module scope.
- **Fixtures**: **no `WorkoutProgram`, no `RunIdentity`** — the free row never
  programs. Three independent literals transcribed from the walk README
  (`MACHINE_ELAPSED_SECONDS` 393.6, `MACHINE_DISTANCE_METERS` 1396.0,
  `MACHINE_AVG_PACE_SECONDS` 140.9, :73–78). `FIXED_NOW = 2026-08-31T09:00:00.000Z` (:80).
- **No runner function.** The whole setup is inline in the single `it` (:96–149).
- **Transport**: `createReplayTransport(JUST_ROW_CAPTURE)` no options (:96);
  `withLiveness` OUTSIDE, onSilence/onRecovery **stubbed** (:97–102).
- **Mocks**: 6 `vi.doMock`s, all `../api*` (`../api` :118, `useWorkouts` :223,
  `useBaselines` :226, `usePlan` :232, `usePreferences` :238, `useRecentLogs` :248).
  Comment :103–117: *"The api mock stays a `vi.doMock` — it is a THIRD module (rule iv)
  — in the SAME epoch as the door import below … `vi.resetModules()` + the dynamic
  re-import survive for that reason: reaching `../api`'s mock AND sharing ONE module
  epoch for the hook, the store and the door — a static import at the top of this file
  would be a different store instance and would read null forever."*
- **Resets**: `vi.resetModules()` (:119) + `import("./useMonitorSession")` (:121–122)
  + `import("./handoffStore")` (:123); later `import("../today/Today")` (:251) and
  `import("../justrow/JustRowLog")` (:280) in the same epoch.
- **Drive**: `connect()` then **`result.current.beginFreeRow()`** (:145–147), then
  `replay.run()` (:149). **No `program()` call anywhere.**
- **before/after**: `afterEach` (:83–93): six `vi.doUnmock`s + `vi.resetModules();
  vi.restoreAllMocks(); localStorage.clear();`.

### `partialReplay.test.ts` (637 lines; setup 1–371)

- **Recordings**: **three** — `walk-2026-08-28/end-on-interval-1-recording.jsonl.gz`
  (:127), `walk-2026-08-28/rest-boundary-recording.jsonl.gz` (:131),
  `walk-2026-08-25/rests-finished-recording.jsonl.gz` (:135), via a local
  `loadCapture(walkDir, file)` (:119–125) over `MONITOR_SESSIONS_ROOT` (:112–118).
- **Fixtures**: two hand-transcribed programs (`WALK_0828_PROGRAM` :150,
  `RESTS_FINISHED_PROGRAM` :203), two identities with populated `logSeed`s
  (:169, :232), `FIXED_NOW = 2026-08-28T09:00:00.000Z` (:247),
  `EXPECTED_END_DIVERGENCE = ["tx#75 barrier timeout"]` / `EXPECTED_REST_DIVERGENCE
  = ["tx#839 barrier timeout"]` (:259–260), `BARRIER_TIMEOUT_MS = 250` (:270),
  `cutAt(capture, tMs)` (:278–283).
- **Transport**: **`createReplayTransport(recording, { barrierTimeoutMs: BARRIER_TIMEOUT_MS })`**
  (:323–325) — the only file overriding the 2000 ms default. `withLiveness` OUTSIDE,
  onSilence/onRecovery **stubbed** (:326–331).
- **Mocks / resets**: **none.** Comment :373–377: *"Phase MD PR 2 dropped this file's
  `vi.resetModules()` (its mocks are deps now); these two resets are the isolation it
  used to give."*
- **Runner extras**: `opts.pressEnd` calls `void result.current.endSession()`
  un-awaited (:347–351) with a stated reason (:307–311: awaiting it *"times the test
  out at 5000 ms (measured)"*); a throw-if-`loadMonitorRun()`-is-null guard (:353–359).
  `localStorage.clear()` at :322.
- **`renderHook` deps**: includes the **top-level `schedule`** (:336), like `summaryHoldReplay`.
  Uses the **statically imported** `useMonitorSession` (:101), not a fresh one.
- **before/after**: `beforeEach` (:378–381) `resetHandoffStore(); resetConnectionAttemptTraceForTests();`;
  `afterEach` (:383–386) `vi.restoreAllMocks(); localStorage.clear();`.

### `liveDropSeamReplay.test.ts` (434 lines; setup 1–365)

- **Recording**: `walk-2026-08-16/session-1-keystone-2x250r0.jsonl` — **plain, not
  gzipped**: `parseRecording(readFileSync(path, "utf8"))` (:91–93), no `gunzipSync`,
  no `node:zlib` import. Sliced to `LIVE_CAPTURE_PREFIX` at seq 510 (:110).
- **Path**: `import.meta.url` surgery, :82–88, **no explanatory comment**.
- **Fixtures**: `SESSION_1_PROGRAM` (:121), `LIVE_DROP_IDENTITY` empty `logSeed`
  (:142–146), `FIXED_NOW = 2026-08-16T00:00:00.000Z` (:148),
  `wrongArmedStatus()` (hand-built GeneralStatus bytes),
  **`extendClock(base)`** (:206–217) — lets the harness advance virtual time past the
  end of the recording, and **`injectable(inner)`** (:232–253) — a `Transport` wrapper
  tracking its own subscriber map so `notify(uuid, bytes)` can call the driver's
  registered callback directly, *"bypassing `createReplayTransport`'s own
  recorded-event queue entirely."* Both unique to this file.
- **Transport**: `createReplayTransport(LIVE_CAPTURE_PREFIX)` (:270), wrapped by
  `injectable`, then `withLiveness(wrapped, {...deps, now: clock.now, schedule:
  clock.schedule})` **inside `mockDefaultTransport`** (:274–280) — real liveness deps
  spread through.
- **Mocks**: `vi.doMock("../adapters/monitorTransport", () => ({ defaultTransport:
  mockDefaultTransport }))` (:281–283) + `vi.resetModules()` (:284) + dynamic import
  (:286–287). The mock spy is **never asserted on** (grep `mockDefaultTransport` →
  definition + use only).
- **`renderHook` deps**: `{ now: () => FIXED_NOW, driverOptions: { now, schedule:
  releasingSchedule(...) } }` — **no `createTransport`, no `registerAppLifecycleListener`.**
  Destructures `{ result, unmount }`.
- **Post-run**: three `clock.advance(1000)` + `wrapped.notify(GENERAL_STATUS_UUID, …)`
  ticks (:317–330), then `unmount()`.
- **before/after**: `afterEach` (:367–373): `vi.doUnmock("../adapters/monitorTransport");
  vi.resetModules(); vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear();`.
- Second `describe` (:428–433) is a pure array-shape precondition on `FULL_CAPTURE` —
  no hook, no transport, no harness.

### `structureWatchSessionReplay.test.ts` (246 lines; setup 1–196)

- **Recording**: `walk-2026-08-27/menu-at-ready-recording.jsonl.gz` (:38). One.
- **Path**: `import.meta.url` surgery, :31–36.
- **Parse**: gunzip + `parseRecording` at module scope, :40–42.
- **Fixtures**: `MENU_AT_READY_PROGRAM` (:49), `MENU_AT_READY_IDENTITY` empty `logSeed`
  (:70–74), `FIXED_NOW = 2026-08-27T09:00:00.000Z` (:76),
  `RECORDED_RECEIVE_TX_COUNT` derived from the capture (:193–196).
- **Transport**: `createReplayTransport(MENU_AT_READY_CAPTURE)` (:111), wrapped by a
  local **`countingTransport`** that counts writes to `RECEIVE_CHARACTERISTIC_UUID`
  (:117–125), then `withLiveness(countingTransport, {...deps, now, schedule})` inside
  `mockDefaultTransport` (:127–133) — real liveness deps spread.
- **Mocks**: `vi.doMock("../adapters/monitorTransport", …)` (:134–136) +
  `vi.resetModules()` (:137) + dynamic import (:139–140). Header (:5–7) names the
  idiom as copied from `lifecycleReplay.test.ts` — a citation that is now stale,
  since `lifecycleReplay` no longer does any of it.
- **`renderHook` deps**: `{ now: () => FIXED_NOW, driverOptions: { now, schedule:
  releasingSchedule(...) } }` — no `createTransport`, no `registerAppLifecycleListener`.
  Destructures `{ result, unmount }`.
- **Post-run**: `unmount()` inside `act` (:171–173) before reading
  `sessionStorage.getItem("ergomatic:last-monitor-log")` (:185).
- **before/after**: `afterEach` (:198–204): `vi.doUnmock; vi.resetModules();
  vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear();`.

---

## 2. The matrix

`burst`=burstReplay, `life`=lifecycleReplay, `sumH`=summaryHoldReplay,
`hoff`=handoffStoreReplay, `jrow`=justRowReplay, `part`=partialReplay,
`live`=liveDropSeamReplay, `swss`=structureWatchSessionReplay.
`=` identical (modulo a per-file constant name or filename).

| # | setup element | burst | life | sumH | hoff | jrow | part | live | swss | same in |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | capture lives in `docs/monitor/sessions/`, loaded at module scope | = | = | = | = | = | = | = | = | **8** |
| 2 | path = string surgery on `import.meta.url`, strip `file://` | = | = | = | = | = | = | = | = | **8** |
| 2a | …surgery target: one walk dir vs. the sessions ROOT + `loadCapture(walkDir,file)` | dir | dir | **ROOT** | dir | dir | **ROOT** | dir | dir | 6 |
| 2b | …surgery regex names the test's OWN filename | = | = | = | = | = | = | = | = | **8** (8 distinct literals) |
| 2c | …comment explaining the jsdom `new URL` reason | yes | yes | yes | yes | **no** | yes | **no** | **no** | 5 |
| 3 | `gunzipSync` before parse | = | = | = | = | = | = | **plain `.jsonl`** | = | 7 |
| 4 | `parseRecording(...)` | = | = | = | = | = | = | = | = | **8** |
| 5 | number of captures | 1 | 1 | **2** | 1 | 1 | **3** | 1 | 1 | 6 |
| 6 | hand-transcribed `WorkoutProgram` | 1 | 1 | 2 | 1 | **0** | 2 | 1 | 1 | 7 (≥1) |
| 7 | `RunIdentity` | = | = | 2 | = | **none** | 2 | = | = | 7 |
| 7a | …`logSeed` empty vs. populated | empty | empty | **pop.** | empty | n/a | **pop.** | empty | empty | 5 |
| 8 | `FIXED_NOW` constant | = | = | = | = | = | = | = | = | **8** (6 distinct dates; burst==life, sumH==hoff) |
| 9 | `createReplayTransport(...)` call | = | = | = | = | = | = | = | = | **8** |
| 9a | …options | none | **`onLifecycle`** | none | none | none | **`barrierTimeoutMs:250`** | none | none | 6 |
| 9b | …input is the whole capture | = | **spliced** | **stripped/trailing** | = | = | **`cutAt`** | **seq-sliced** | = | 3 |
| 10 | extra `Transport` wrapper before `withLiveness` | – | – | – | – | – | – | **`injectable`** | **counting** | 6 (none) |
| 11 | extra clock wrapper | – | – | – | – | – | – | **`extendClock`** | – | 7 (none) |
| 12 | `withLiveness` composed outside the hook (pre-built `transport`) | = | **inside `createTransport`** | = | = | = | = | **inside mock** | **inside mock** | 5 |
| 13 | `onSilence`/`onRecovery` | **stub** | **real deps** | stub | stub | stub | stub | real | real | 5 stub / 3 real |
| 14 | `createTransport` dep passed | = | = | = | = | = | = | **no (doMock)** | **no (doMock)** | 6 |
| 15 | `registerAppLifecycleListener` dep passed | no-op | **captures cb** | no-op | no-op | no-op | no-op | **absent** | **absent** | 5 no-op |
| 16 | `driverOptions: { now: replay.clock.now, schedule: releasingSchedule(...) }` | = | = | = | = | = | = | = | = | **8** |
| 17 | top-level `schedule` dep (hand-off backstops) | – | – | **yes** | – | – | **yes** | – | – | 6 (absent) |
| 18 | `vi.resetModules()` + dynamic `import("./useMonitorSession")` | = | **none** | = | = | = | **none** | = | = | 6 |
| 19 | dynamic `import("./handoffStore")` in the same epoch | – | – | – | **yes** | **yes** | – | – | – | 6 (absent) |
| 20 | `vi.doMock("../adapters/monitorTransport")` | – | – | – | – | – | – | **yes** | **yes** | 6 (absent) |
| 21 | `vi.doMock("../api*")` | 0 | 0 | **4** | 0 | **6** | 0 | 0 | 0 | 6 (zero) |
| 22 | `localStorage.clear()` inside the runner | **yes** | – | **yes** | – | – | **yes** | – | – | 5 (absent) |
| 23 | `beforeEach` `resetHandoffStore()`+`resetConnectionAttemptTraceForTests()` | – | **yes** | – | – | – | **yes** | – | – | 6 (absent) |
| 24 | `afterEach` contains `vi.restoreAllMocks(); localStorage.clear();` | = | = | = | = | = | = | = | = | **8** |
| 25 | `afterEach` also `vi.resetModules()` | = | **no** | = | = | = | **no** | = | = | 6 |
| 26 | `afterEach` also `sessionStorage.clear()` | – | – | – | – | – | – | **yes** | **yes** | 6 (absent) |
| 27 | `afterEach` also `vi.doUnmock(...)` | – | – | **yes** | – | **yes** | – | **yes** | **yes** | 4 (absent) |
| 28 | `connect()` then `program()+replay.run()` in one `act` | = | = | = | = | **`beginFreeRow()`** | = | = | = | 7 |
| 29 | `renderHook` destructures `{ result }` vs `{ result, unmount }` | res | res | res | res | res | res | **+unmount** | **+unmount** | 6 |
| 30 | `Storage.prototype.setItem` spy | – | – | – | **yes** | – | – | – | – | 7 (absent) |
| 31 | runner called ≥2× in one test | **yes** | – | **yes (2 legs)** | – | – | – | – | – | 6 (no) |
| 32 | extra runner parameters | `events` | `events` | `recording, program, identity, scheduleAction?` | `snapshotAtMs` | n/a | `recording, program, identity, {pressEnd}` | none | none | 2 (none) |

### Counts

- **Elements identical across ALL EIGHT: 8 of 32** — rows 1, 2, 2b, 4, 8, 9, 16, 24.
  Reduced to actual shareable *code*, those eight are: the `import.meta.url` surgery
  idiom, `parseRecording`, the existence of a `FIXED_NOW`, the
  `createReplayTransport(...)` call, the `driverOptions` block, and the
  `restoreAllMocks`/`localStorage.clear` afterEach. Row 2b is identical in *shape*
  only — all eight regex literals differ.
- **Elements identical across ≥6 of 8: 21 of 32** — the eight above plus rows 2a, 3, 5,
  6, 7, 10, 11, 14, 17, 18, 19, 20, 21, 23, 25, 26, 29, 31 (counting "6+ files agree
  on one value", including "6 files have none of this"). Note that half of these are
  "absent in six" rather than "present and identical in six".
- **Differences with a stated load-bearing reason: 14 of 32 rows** — 9a (both
  overrides carry a quoted reason), 9b (all four constructions carry one), 10 (both),
  11, 12/13 (`lifecycleReplay`'s doc comment states the real-handler requirement),
  15 (`lifecycleReplay`), 17 (summaryHold's "Antagonist REVISE 6"; partial's End arm),
  18 (`burstReplay`/`summaryHoldReplay` two-call collision, `handoffStoreReplay` store
  epoch, `justRowReplay` door epoch), 19, 21, 22, 30, 31, 32.
- **Differences with NO stated reason / apparently accidental: 8 of 32 rows** —
  - row 13 for the five stubbing files: `burstReplay`'s doc comment (:198–201) claims
    the composition is *"the genuine production wiring, not a bypass"*, but
    `onSilence: () => undefined` / `onRecovery: () => undefined` replace the hook's own
    handlers. No file states why. (None of the five asserts on `frameSilence`, so it is
    inert today — but it is an undocumented divergence from production, not a choice.)
  - rows 14, 15, 20, 26, 29 for `liveDropSeamReplay`/`structureWatchSessionReplay`:
    those two files were simply not in #413's diff. Their `vi.doMock` is convertible
    (see §4). `structureWatchSessionReplay`'s header still cites `lifecycleReplay.test.ts`
    as the source of an idiom `lifecycleReplay` no longer has.
  - row 2c: three files carry the surgery with no explanation; five explain it.
  - row 2a: `summaryHoldReplay`/`partialReplay` independently wrote the same
    `MONITOR_SESSIONS_ROOT` + `loadCapture(walkDir, file)` helper; the other six did not,
    and `burstReplay`/`lifecycleReplay` load the *identical file* through two separate
    walk-dir-pinned regexes.
  - rows 23/25: `resetHandoffStore()` vs. relying on `vi.resetModules()` for store
    isolation is now split 2/6 purely by which files #413 converted.
  - row 22: `localStorage.clear()` inside the runner is present in 3 and absent in 5 with
    no principle distinguishing them (`handoffStoreReplay` and
    `structureWatchSessionReplay` clear only in `afterEach`).
  - rows 5/6/7: `burstReplay` and `lifecycleReplay` hand-transcribe the **same**
    `KEYSTONE_PROGRAM` and the **same** `KEYSTONE_IDENTITY`/`FIXED_NOW` for the **same**
    capture, independently; `handoffStoreReplay`, `summaryHoldReplay` and `partialReplay`
    each transcribe a program for `rests-finished` / `end-on-interval-1`, two of which are
    shared captures. That duplication is explained by a convention ("no test file in
    `src/monitor/` imports another"), not by any semantic difference.

---

## 3. The `import.meta.url` path surgery

**8 of 8 use it, and none of the eight uses any other mechanism.** Six pin the
regex's replacement to a single walk directory (`burst`, `life`, `hoff`, `jrow`,
`live`, `swss`); two (`sumH`, `part`) resolve to the sessions ROOT and take
`walkDir` as an argument to a local `loadCapture(walkDir, file)`. Every one of
the eight regexes embeds **its own filename**, so the literal differs eight ways:

```
/src\/monitor\/burstReplay\.test\.ts$/                      -> "../docs/monitor/sessions/walk-2026-08-23/"
/src\/monitor\/lifecycleReplay\.test\.ts$/                  -> "../docs/monitor/sessions/walk-2026-08-23/"
/src\/monitor\/summaryHoldReplay\.test\.ts$/                -> "../docs/monitor/sessions/"
/src\/monitor\/handoffStoreReplay\.test\.ts$/               -> "../docs/monitor/sessions/walk-2026-08-25/"
/src\/monitor\/justRowReplay\.test\.ts$/                    -> "../docs/monitor/sessions/walk-2026-08-31-justrow/"
/src\/monitor\/partialReplay\.test\.ts$/                    -> "../docs/monitor/sessions/"
/src\/monitor\/liveDropSeamReplay\.test\.ts$/               -> "../docs/monitor/sessions/walk-2026-08-16/"
/src\/monitor\/structureWatchSessionReplay\.test\.ts$/      -> "../docs/monitor/sessions/walk-2026-08-27/"
```

Context: `grep -rln "import.meta.url" src/` returns **42 files** and
`grep -rln "docs/monitor/sessions" src/ e2e/` returns **64 files**, so the idiom
is far wider than these eight (`oracleCorpusReplay`, `registerReplay`,
`captureReplay`, `connectedMetricsReplay`, `structureWatchReplay`,
`driver.test.ts`, `seriesRecorder.test.ts`, `avgPaceVerdict.replay.test.ts`,
`derivedHeartRate.replay.test.ts`, `warmupRemoval.replay.test.ts`,
`continuity.test.ts`, `liveness.test.ts`, `nfc/fixtures.ts` … all do it too).
`grep -rn "new URL(" src/ | grep -i "session\|docs"` returns only two hits, both
inside comments explaining why `new URL` is NOT used.

**A fixed shared loader** would be one helper module under `src/test/` doing the
surgery once on **its own** `import.meta.url` (so no caller's filename appears in
any regex) and exporting `loadCapture(walkDir, file)` that gunzips-or-not by
extension — turning eight bespoke regexes into eight call sites of the form
`loadCapture("walk-2026-08-23", "keystone-….jsonl.gz")`, and it is
independently useful to the ~13 driver-level replay specs outside this set.

---

## 4. Which remaining `vi.doMock`s could NOT become injectable deps

**Transport mocks — both CAN be replaced; no new dep is needed.**
`liveDropSeamReplay.test.ts:281` and `structureWatchSessionReplay.test.ts:134`
are the only two `vi.doMock("../adapters/monitorTransport")`s left in the eight.
`useMonitorSession.ts:5288` reads `depsRef.current.createTransport ?? defaultTransport`
— that is the sole consumer of the imported `defaultTransport`
(`grep -n "defaultTransport" useMonitorSession.ts` shows one import at :103 and
one use at :5288; everything else is comment). Both files' mock factories have the
signature `(deps: LivenessDeps) => withLiveness(wrapped, {...deps, now, schedule})`,
which is *exactly* the `createTransport(liveness)` contract `lifecycleReplay.test.ts:283-288`
already uses. Neither mock spy is asserted on. So both convert to
`createTransport: (liveness) => withLiveness(<their wrapper>, {...liveness, now, schedule})`
with **no new dep**, and both then lose `vi.resetModules()`, the dynamic import and
the `vi.doUnmock` — they would need `registerAppLifecycleListener: () => () => undefined`
added (row 15) and `resetHandoffStore()`/`resetConnectionAttemptTraceForTests()`
in a `beforeEach` (row 23) to keep today's isolation, per `partialReplay.test.ts:373-381`'s
own recorded precedent.

**Door mocks — CANNOT be replaced by any `useMonitorSession` dep.** The ten
remaining `vi.doMock`s in the eight are all `../api*`:
`summaryHoldReplay` (`../api`, `../api/useWorkouts`, `../api/useBaselines`,
`../api/usePlan`) and `justRowReplay` (those four plus `../api/usePreferences`,
`../api/useRecentLogs`). These are consumed by `../session/LogSession`,
`../today/Today` and `../justrow/JustRowLog` — **components, not the hook**.
`grep -n "from \"\.\./api" useMonitorSession.ts` returns nothing (exit 1), so
`MonitorSessionDeps` has no seam that could reach them, and no dep added to
`useMonitorSession` ever could: a hook cannot inject a sibling component's data
hooks. Removing those would take either an injectable API client at the door
components (a product-code change well outside this row), or a shared
`renderDoorWithMocks()` test helper that owns the same ten `doMock`s.

**Consequence for a shared harness:** the two files that still need
`resetModules` + a dynamic import for *mocking* reasons are exactly the two
files whose mock is convertible; the four files that keep `resetModules` keep it
for **module-epoch/store-identity** reasons that a shared harness must either
reproduce or expose as a flag (see §5).

---

## 5. Load-bearing differences — tests whose assertions depend on their setup

Eight, one per file.

1. **`burstReplay`** — the file's single test (`:298`) calls `runReplay` twice
   (`:302` real, `:387` burst-stripped control) and compares the two records
   "byte-identical but for observations". Both `vi.resetModules()` (:260) and
   `localStorage.clear()` (:243) are required, and the reason is recorded as a
   measurement, not a guess: *"found empirically — `control.record` came back `null`,
   not the control's own record"* (:214–221, restated :233–242). A harness that
   reuses one module graph across calls silently turns this test's control leg
   into a null.

2. **`summaryHoldReplay`** — legs 1 (:754) and 2 (:968) each call `runReplay` twice
   (truncated-before-the-burst, then full), same collision as above. Leg 2 needs
   `scheduleAction = scheduleEndPress` (:500–507, :982) to press End from *inside*
   the replay clock at a due time derived from `endTerminateBarrier` (:344). Leg 3
   (:1101) asserts the `BURST_HANDOFF_HOLD_MS` backstop releases the hold — that
   depends on the **top-level `schedule` dep** at :585 routing the backstop onto
   `replay.clock`; with the default `setTimeout` the backstop never fires in virtual
   time. All three legs then mount the real Log door via `mountLogSessionAndSave`,
   which depends on the four `../api*` mocks and on that helper deliberately NOT
   calling `resetModules` (:660–664).

3. **`handoffStoreReplay`** — the "denied live→closed write" test (:439) depends
   entirely on `installClosedWriteDenial()`'s `Storage.prototype.setItem` spy
   (:218–250); its own doc comment says a raw `loadMonitorRun()` read *"is therefore
   not a fair oracle … it is permanently the same regardless"*, so the assertion is
   on the recorded write *attempts*. Row 2 (:590) asserts store state at instants
   between two wire frames via `snapshotAtMs` scheduled on `replay.clock`, and the
   snapshots read `freshStore.currentUnretired()` — the doc comment (:322–327)
   states that a module-scope import *"would be a different instance entirely and
   would report `null` forever."*

4. **`justRowReplay`** — the single test (:95) drives `beginFreeRow()` (:146)
   with **no `program()`**, and then asserts
   `ring.filter(kind==="write").map(detail)` equals exactly one frame
   (`["f1 76 07 01 01 01 13 02 01 01 61 f2"]`, :157–159). Any harness that programs
   the erg adds writes and reddens that assertion. The test also depends on the hook,
   `handoffStore`, `Today` and `JustRowLog` all landing in ONE `resetModules` epoch
   that also contains the `../api` mock (:103–117, :251, :280) — six `doMock`s, none
   replaceable by a hook dep.

5. **`partialReplay`** — legs A and B assert `divergences` is **exactly** the
   one-element pin `["tx#75 barrier timeout"]` / `["tx#839 barrier timeout"]`
   (:259–260), which is only reachable with `barrierTimeoutMs: 250` (:270, :323–325);
   the comment records that 250/500/2000/4000 ms were verified to give byte-identical
   divergence sets, so this is a stated, tested choice. Legs C1/C2 depend on
   `cutAt()` truncation plus `opts.pressEnd` calling `endSession()` **un-awaited**
   (:299–311: *"awaiting it times the test out at 5000 ms (measured)"*), and on the
   top-level `schedule` dep. It is also the only file that throws if
   `loadMonitorRun()` is null rather than asserting on a null.

6. **`liveDropSeamReplay`** — the seam test (:375) needs `extendClock` to advance
   virtual time **past the end of the recording** and `injectable` to deliver three
   constructed wrong-structure frames at the transport's own subscriber callbacks
   (:317–330). Its header states the boundary verbatim: *"The BYTES are constructed
   (no committed recording carries this shape mid-live, §0.4); the DETECTOR, the emit,
   the listener seam, and everything downstream are real."* It also needs the real
   `...deps` spread (:276) so the liveness bookkeeping is in the chain the constructed
   notify crosses. Its second test (:429) uses no harness at all.

7. **`structureWatchSessionReplay`** — asserts `totalWireWrites` equals the capture's
   own recorded tx count (`RECORDED_RECEIVE_TX_COUNT`, :193), which requires the
   `countingTransport` wrapper (:117–125) sitting *between* the replay transport and
   `withLiveness`. Its own comment records that a before/after split around
   `program()` was tried and **failed its own self-mutation**: *"adding a
   `driver.terminate()` call to the consumer left the before/after split at 0
   regardless, because both snapshots were taken on the far side of it"* (:82–96).
   Its second test (:233) asserts the `sessionStorage` stash written by the **unmount
   cleanup**, so the `unmount()` inside `act` (:171–173) and `sessionStorage.clear()`
   in `afterEach` are both part of the assertion.

8. **`lifecycleReplay`** — all three tests turn on `createReplayTransport`'s
   `onLifecycle` option (:269–271) wired to the `registerAppLifecycleListener` dep
   that captures the callback (:291–294), and on `withLiveness` being composed
   **inside** `createTransport` with `...liveness` spread (:283–288) so the hook's own
   `onSilence`/`onRecovery` are in the chain — the tests assert `frameSilence` and the
   `app-lifecycle` ring entries. Under the five-file stubbed composition
   (`onSilence: () => undefined`), `frameSilence` can never become true and the whole
   file is decoration.

**The shape of it.** Every one of the eight has at least one assertion that dies
if its setup is replaced by another file's. The shared surface is the six
elements in §2's "all eight" row — capture location, the surgery idiom,
`parseRecording`, `FIXED_NOW`, the `driverOptions` block, and the
`restoreAllMocks`/`localStorage.clear` afterEach — plus the four semantic lines
`await act(async () => {` / `await result.current.connect();` /
`driverOptions: {` / `now: () => FIXED_NOW,`. Fifty-nine of the 109 normalised
core lines appear in exactly one file.

---

## Method notes / caveats

- No tests were run. Every number above comes from `wc`, `grep`, `git show` or the
  line-set script below; nothing rests on a passing or failing suite.
- **Exit pass (antagonist, 2026-09-12): the 109/59 totals are NOT quotable.** This
  document states two core boundaries (§0's cited spans; "`createReplayTransport`
  → the `run()` act block"); re-extracting at `bed5c1e4` under each gives
  161/8/101 and 80/8/40. The 8-in-all row reproduces exactly under all three
  (same eight lines, four punctuation) and the unique fraction is 50-63% either
  way, so NO HARNESS holds; cite the 8/8 row.
- **The line-set counts (109 / 8 / 59), reproduced by the controller 2026-09-12**
  from the eight extracted cores (each core = the runner span cited in §0's table,
  blank lines, `//` lines and `/** */` blocks stripped, per-file constant names
  unified to `CAPTURE`/`FIXED_NOW`). The cores were not committed; the spans are
  cited by line so the extraction is repeatable against `bed5c1e4`. The script:
  ```python
  import glob, collections, os
  sets = {os.path.basename(f): {l.strip() for l in open(f) if l.strip()}
          for f in sorted(glob.glob('cores/*.core'))}
  c = collections.Counter(l for s in sets.values() for l in s)
  print(len(c), sum(v == 8 for v in c.values()), sum(v == 1 for v in c.values()))
  # -> 109 8 59
  ```
- The "runner fn span" ends at the first column-0 `}` after the function's `async
  function` line; for `justRowReplay` there is no function and I measured the inline
  block from `const replay = createReplayTransport` (:96) to the `replay.run()` line
  (:149).
- Row-count arithmetic in §2 counts a row as "same in N" when N files carry the same
  value, including the value "absent". Where that reading flatters the overlap I have
  said so in the row.
- The stated-reason / accidental split in §2 is a judgement about whether the file
  itself records a reason in a comment, not about whether a reason exists. I did not
  go looking for reasons the files do not state.
