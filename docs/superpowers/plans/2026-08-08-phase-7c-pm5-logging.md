# Phase 7C — PM5 Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A session fully driven by a connected PM5 saves a log indistinguishable in shape from a phone-timer session, with real monitor-measured splits (`actualSource: "pm5"`).

**Architecture:** A `logSeed` frozen onto `MonitorRun` at creation (labels + warmup-ness + locked paces — the data the adversarial review proved unreachable later); a monitor-side builder in `logDraft.ts` mirroring the manual one; an explicit `?from=monitor` mode on `LogSession` (flag + record + seed alignment, so the manual "Log it after" door can never be hijacked); additive server validation with a pm5-only band widening and one nullable `device_name` column.

**Tech Stack:** existing — React/TS client, Express + drizzle/Postgres server, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-08-phase-7c-pm5-logging-design.md` (adversarially revised — its section numbers are cited throughout). Adversarial review: `docs/superpowers/specs/2026-08-08-phase-7c-adversarial-review.md`.

## Global Constraints

- Worktree `.claude/worktrees/7c-logging`, branch `phase-7c-logging`. `export PATH="$HOME/.local/share/nvm/v26.5.0/bin:$PATH"` before ANY pnpm/git command (pre-commit hooks need Node 26).
- `pnpm test` / `pnpm test -- <file>` only. NEVER bare `vitest` (webstorage/jsdom collision).
- Read `.claude/agent-briefing.md` before starting. COMMIT FIRST, MUTATE AFTER.
- NO em-dash in any user-facing string (memory rule; periods/colons/middle dots).
- `domain/**` imports nothing from `src/**`. No wall clock in monitor code paths.
- Baselines to preserve: **2840 unit / 244 e2e / 47 screenshots** on current main. Every task ends green.
- The compose stack may be in use by the operator: never `docker compose down`; `pnpm e2e`/`pnpm screenshots` reuse a running stack.
- Copy literals in this plan are exact: `FROM <deviceName> · N OF M INTERVALS MEASURED`, `ALL M INTERVALS MEASURED` (middle dot, not em-dash).

---

### Task 1: The log seed — `buildLogSeed`, `MonitorRun` v2, the threading

**Files:**
- Modify: `app/src/session/logDraft.ts` (new `LogSeed` type + `buildLogSeed`)
- Modify: `app/src/monitor/monitorRun.ts` (`MonitorRun.logSeed`, v1→v2 load tolerance, `createMonitorRun` arg)
- Modify: `app/src/monitor/useMonitorSession.ts` (`RunIdentity.logSeed`, passthrough at the `createMonitorRun` call)
- Modify: `app/src/workout/WorkoutDetail.tsx` (build the seed where `connecting` state is set — it already holds `phases` and `baselines`)
- Test: `app/src/session/logDraft.test.ts`, `app/src/monitor/monitorRun.test.ts`, `app/src/monitor/useMonitorSession.test.ts`

**Interfaces:**
- Consumes: `EnginePhase[]` (`src/session/engine.ts`), `Baselines` (`api/useBaselines`), `compileProgram`'s phase conventions (`domain/monitor/program.ts`: warmup/work/rest/test types; rests fold, so seed steps align 1:1 with `program.intervals` = the non-rest phases).
- Produces: `interface LogSeed { steps: { label: string; kind: "warmup" | "work" }[]; paces: { k2?: number; k6?: number } }` exported from `logDraft.ts`; `buildLogSeed(phases: EnginePhase[], baselines: Baselines): LogSeed`; `RunIdentity` gains `logSeed: LogSeed`; `MonitorRun` gains `logSeed?: LogSeed` with `v: 2`.

- [ ] **Step 1: failing tests for `buildLogSeed`** in `logDraft.test.ts`. Reuse the file's existing phase-fixture idiom (look at `buildLogSteps`' tests for the `EnginePhase` shapes). Assertions:

```ts
describe("buildLogSeed: the monitor run's frozen log identity (7C spec §2)", () => {
  it("emits one seed step per NON-REST phase, in program-interval order, with the manual builder's own label text", () => {
    // phases: warmup 300s, work 120s @ split, rest 60s, work 100m @ split
    const seed = buildLogSeed(phases, BASELINES);
    expect(seed.steps).toHaveLength(3); // warmup + 2 work; the rest folded
    expect(seed.steps[0]).toEqual({ label: expect.any(String), kind: "warmup" });
    expect(seed.steps[1]!.kind).toBe("work");
    // Label parity: byte-identical to what buildManualLogSteps produces
    // for the same authored step (shape-parity is the spec's whole game).
  });
  it("captures only the REFERENCED paces (the manual PACES LOCKED F1 rule: no step references 2k -> no k2)", () => {
    const seed = buildLogSeed(sixKOnlyPhases, BASELINES);
    expect(seed.paces).toEqual({ k6: BASELINES.k6Seconds });
  });
});
```

- [ ] **Step 2: run to fail** — `pnpm test -- src/session/logDraft.test.ts` → `buildLogSeed is not defined`.
- [ ] **Step 3: implement `buildLogSeed`** in `logDraft.ts`, next to `buildManualLogSteps`. Reuse the SAME internal label/`durationText` helpers the manual builder uses (do not duplicate string construction — a drifted label breaks §3's alignment silently). `kind` maps phase `type === "warmup" ? "warmup" : "work"` for every non-rest phase (`test` phases compile as work intervals; seed them `"work"`). Paces: walk the phases' pace refs the way the manual builder's PACES LOCKED derivation does (`F1` rule: only referenced bases appear).
- [ ] **Step 4: green**, then failing tests for the record: `monitorRun.test.ts` — `createMonitorRun({ ...args, logSeed })` persists it under `v: 2`; `loadMonitorRun()` returns a v1 record (hand-written JSON without `logSeed`) UNCHANGED except it simply has no seed (no throw, no migration — spec §2's "a v1 record loads as today").
- [ ] **Step 5: implement**: `MonitorRun.v: 1 | 2`, `logSeed?: LogSeed` (type-only import from `logDraft.ts` — check the import direction: `monitorRun.ts` is src, `logDraft.ts` is src, fine); `createMonitorRun` takes `logSeed` in its args object and stamps `v: 2`.
- [ ] **Step 6: thread it**: `RunIdentity` (`useMonitorSession.ts:146`) gains `logSeed: LogSeed` (REQUIRED — same reasoning as the task-4 review's ruling that made `identity` itself required: forgetting it fails silently as a manual-only log later). The hook's `createMonitorRun` call passes it through. `WorkoutDetail.tsx` builds it at the point the Connect flow constructs `connecting`/identity (it has `phases` and `baselines` in scope there — the `ConnectedInterstitial` props are built from the same values). Compiler chases every `RunIdentity` literal in tests: give test fixtures a `TEST_SEED` constant.
- [ ] **Step 7: full suite green** (`pnpm test`), lint, typecheck.
- [ ] **Step 8: commit** — `feat: the run learns its log identity at birth`

### Task 2: `buildMonitorLogSteps` + the walk-4 fixture

**Files:**
- Modify: `app/src/session/logDraft.ts` (`LogStep` growth + the builder)
- Test: `app/src/session/logDraft.test.ts`

**Interfaces:**
- Consumes: `MonitorRun` (with `logSeed`, Task 1), `IntervalActual` (`domain/monitor/types.ts`: `{ index: number | null; elapsedSeconds; distanceMeters; avgSplit; avgSpm; avgHeartRateBpm }`).
- Produces: `LogStep` gains `avgHr?: number; actualSeconds?: number; actualMeters?: number`; `buildMonitorLogSteps(run: MonitorRun): LogStep[]`; exported `MONITOR_HR_MIN = 20`, `MONITOR_HR_MAX = 254`.

- [ ] **Step 1: freeze the walk-4 fixture from the wire itself.** Walk 4's raw 0x0037/0x0038 pair for interval 2 is IN THE REPO record (`docs/monitor/pm5-interface-notes.md` §18, 2026-08-08 — the pasted log's seq 24/25 hex). Write a THROWAWAY test that runs those hex bytes through `parseSplitIntervalData`/`toIntervalActual` (`domain/monitor/pm5/parse.ts`) and prints the result; copy the printed values into a permanent fixture literal `WALK4_ACTUALS: IntervalActual[]` in `logDraft.test.ts` with a comment citing §18 and the raw hex; DELETE the throwaway. (Interval 1's pair wasn't captured raw — synthesize it consistent with the frame record: `index: 0`, distance ≈ 101.8, and say so in the comment.) The fixture's program: 2×100 m distance intervals, 30 s rest, warmup none (walk 4's own shape).
- [ ] **Step 2: failing tests** — the full §3 battery, each case one `it`:

```ts
describe("buildMonitorLogSteps (7C spec §3)", () => {
  it("maps walk 4's interval 0: label from the seed, target from the program, actualSplit/spm/avgHr/actualSeconds/actualMeters verbatim from the actual, source pm5", () => {
    const steps = buildMonitorLogSteps(WALK4_RUN);
    expect(steps[0]).toEqual({
      label: WALK4_RUN.logSeed!.steps[0]!.label,
      targetSplit: WALK4_RUN.program.intervals[0]!.targetSplit ?? undefined,
      meters: 100,
      actualSplit: WALK4_ACTUALS[0]!.avgSplit,
      actualSource: "pm5",
      spm: WALK4_ACTUALS[0]!.avgSpm,
      avgHr: WALK4_ACTUALS[0]!.avgHeartRateBpm ?? undefined,
      actualSeconds: WALK4_ACTUALS[0]!.elapsedSeconds,
      actualMeters: WALK4_ACTUALS[0]!.distanceMeters,
    });
  });
  it("a warmup interval produces NO step (manual parity, adversarial B2) and shifts nothing", () => {});
  it("a lost boundary (actuals shorter, that index absent) leaves the step with NO actual and NO source, never 'assumed'", () => {});
  it("index:null actuals are dropped entirely", () => {});
  it("an early End leaves trailing steps bare (partials ruling)", () => {});
  it("an effort interval (targetSplit null) still carries its measured actual, no target", () => {});
  it("avgSplit 0 keeps source pm5 and the verbatim fields but omits actualSplit (the pm5 pairing exception)", () => {});
  it("avgHr outside 20-254 is omitted; the save never rejects for it", () => {});
  it("a missing or misaligned logSeed throws MonitorLogSeedError (the screen catches it as mode disqualification)", () => {});
});
```

- [ ] **Step 3: fail**, **Step 4: implement.** Matching: build a `Map` from `IntervalActual.index` (skip null) to actual; walk `program.intervals` with a parallel index over `logSeed.steps`; `kind === "warmup"` → skip (no step); else emit the LogStep per the spec table. Export a tiny `MonitorLogSeedError`. The `LogStep` doc comment gains the pm5 pairing exception sentence and the unit caveat (spec §3's "work vs work-plus-rest never stopwatch-read; stored under the documented meaning").
- [ ] **Step 5: green; full suite; commit** — `feat: the monitor builder logs what the erg saw`

### Task 3: Server — validation growth + the deviceName column

**Files:**
- Modify: `app/server/routes/data.ts` (POST /api/logs step validation, `deviceName`)
- Modify: `app/server/db/schema.ts` (`deviceName: text("device_name")` nullable on `sessionLogs`)
- Create: drizzle migration via `pnpm db:generate` (commit the generated SQL)
- Test: `app/server/app.test.ts` (or the file that holds the existing POST /api/logs validation tests — find them by grepping `"pm5"` / `MIN_SPLIT_SECONDS` usages in tests)

**Interfaces:**
- Consumes: the existing validation helpers in `data.ts` (`badRequest`, the split band at `:226`'s `MIN_SPLIT_SECONDS`/`MAX_SPLIT_SECONDS`, spm band, `ACTUAL_SOURCES` at `:41`, the 200-step ceiling at `:458`).
- Produces: steps admit `avgHr` (int 20-254), `actualSeconds` (number ≥ 0), `actualMeters` (number ≥ 0); `actualSource: "pm5"` valid WITHOUT `actualSplit`; pm5-only bands split `> 0 && <= 6000`, spm `0-99` int; body admits `deviceName` (string 1-64) → new column; response/reads include it.

- [ ] **Step 1: failing server tests** (use the existing app.test.ts idiom — authenticated agent, seeded workout):
  - a pm5 step with `avgSpm: 66` and `actualSplit: 882.3` saves (walk-4 reality, adversarial B3); the SAME values with `actualSource: "stopwatch"` still 400 (manual bands unmoved);
  - `actualSource: "pm5"` with no `actualSplit` but `actualSeconds`/`actualMeters` saves; `"stopwatch"` without `actualSplit` still 400 (pairing rule scoped);
  - `avgHr: 300` → 400; `avgHr: 20` and `254` save; `actualSeconds: -1` → 400;
  - `deviceName: "PM5 432331249 Row"` round-trips on read; absent stays null; 65 chars → 400.
- [ ] **Step 2: fail. Step 3: schema + `pnpm db:generate`** (Node 26 PATH; commit the migration file verbatim, never hand-edit). **Step 4: validation code.** Keep the manual bands as named constants; add `PM5_MAX_SPLIT_SECONDS = 6000`, `PM5_SPM_MIN = 0`, `PM5_SPM_MAX = 99`, `HR_MIN = 20`, `HR_MAX = 254` beside them with a comment citing walk 4 (§18) for why the bands differ.
- [ ] **Step 5: green (server project + full suite); commit** — `feat: the server admits what the machine measured`

### Task 4: The monitor mode on LogSession

**Files:**
- Modify: `app/src/workout/WorkoutDetail.tsx` (`handleConnectedEnded` navigates to `` `/library/${workout.id}/log?from=monitor` ``)
- Modify: `app/src/session/LogSession.tsx` (mode detection, builder call, render-gate widening at `:516`, PACES LOCKED from seed, caption, date/duration from stamps, save payload + clear)
- Test: `app/src/session/LogSession.test.tsx`, `app/src/workout/WorkoutDetail.test.tsx`
- CSS: reuse existing classes; the caption uses the `.log-monitor-diag` idiom's tokens (mono 11px `--ink-3`) under a new class `.log-from-monitor`

**Interfaces:**
- Consumes: `buildMonitorLogSteps`/`MonitorLogSeedError` (Task 2), `loadMonitorRun`/`clearMonitorRun` (`monitorRun.ts`), `useSearchParams` (react-router — check the file's existing router imports).
- Produces: the four-condition gate as a pure helper `monitorModeRun(search: URLSearchParams, workoutId: string): MonitorRun | null` (exported for tests); the save payload fields (`avgHr`, `actualSeconds`, `actualMeters`, `deviceName`) flowing exactly as built.

- [ ] **Step 1: failing tests**, one per §4 condition plus behavior:
  - flag+record+match+seed → monitor mode: pm5 splits VISIBLE (the widened gate), caption `FROM PM5 432331249 Row · ALL 2 INTERVALS MEASURED`, PACES LOCKED from `logSeed.paces`, date/duration from `startedAt/completedAt`;
  - each condition removed independently → the manual form byte-for-byte (assert a known manual-only element and the ABSENCE of the caption); the no-flag case with a stale completed record is the hijack pin;
  - partial: one actual missing → caption `1 OF 2 INTERVALS MEASURED`, bare step shows the dash;
  - save: payload includes `actualSource: "pm5"`, `avgHr`, `actualSeconds`, `actualMeters`, `deviceName`; `clearMonitorRun` effect asserted via `loadMonitorRun() === null` after save resolves — exactly once;
  - the render gate: a `"stopwatch"` step still renders (regression), an `"assumed"` still doesn't show an actual.
- [ ] **Step 2: fail. Step 3: implement.** Mode detection at the top of the component beside the existing record loads; `:516`'s gate becomes `(step.actualSource === "stopwatch" || step.actualSource === "pm5")`. Date/duration REPLACE the manual estimates only in monitor mode. Save path: on success, `clearMonitorRun()` before navigation. No em-dash in the caption.
- [ ] **Step 4: green; full suite; commit** — `feat: the log screen learns the monitor mode`

### Task 5: The monitor discard + lifecycle + the record's paper trail

**Files:**
- Modify: `app/src/session/LogSession.tsx` (monitor-mode `discardSlot`, staged, session-door idiom — find `useStagedDiscard`/the session door's discard for the exact pattern)
- Modify: `app/src/monitor/monitorRun.ts` (header comment: index-null actuals are DROPPED by 7C, not surfaced — adversarial m10)
- Modify: `docs/design/DEVIATIONS.md` (three rows AT THE BOTTOM of the table: row-41 amendment naming the monitor mode as the storage exception; effort-with-actual departure (m6); index-null drop)
- Modify: `ROADMAP.md` (7C checkboxes → checked with one-line homes; the anonymous-run logging gap as a named follow-on line; §17 open item for work-vs-work+rest lands in `docs/monitor/pm5-interface-notes.md` §17)
- Test: `app/src/session/LogSession.test.tsx`

**Interfaces:**
- Consumes: Task 4's mode; the existing staged-discard idiom.
- Produces: nothing new for later tasks — this is the close-out of behavior.

- [ ] **Step 1: failing tests**: monitor mode shows the discard (staged: first press arms, second fires); fire clears the record and navigates to the workout detail; the MANUAL door still renders NO discard (`discardSlot` null — the row-41 property, now a pinned assertion); BackLink exit leaves the record standing (`loadMonitorRun()` non-null after unmount).
- [ ] **Step 2: fail. Step 3: implement + write all three DEVIATIONS rows + the ROADMAP/§17 lines.** Remember: rows append at the table BOTTOM (the file's own citation-convention note).
- [ ] **Step 4: green; full suite; commit** — `feat: the record's life ends at save or the monitor discard, and the table says so`

### Task 6: e2e, screenshots, close-out

**Files:**
- Modify: `app/e2e/connected.spec.ts` (the walk extends through Save; assert the stored log via GET /api/logs)
- Modify: `app/e2e/screenshots.spec.ts` (monitor-mode form captures, portrait `log-monitor.png` + landscape `log-monitor-landscape.png`)
- Test: full gates ×2 runs

**Interfaces:** consumes everything; produces the phase's evidence.

- [ ] **Step 1: extend the walk** — after the existing `Log ${title}` assertion: the caption is visible, a pm5 split renders, fill pain/held via the form's existing controls (copy the manual e2e's fill idiom from `session.spec.ts`), Save, then `page.evaluate(fetch('/api/logs'))` and assert the newest log's steps carry `actualSource: "pm5"` and a numeric `actualSeconds`, and `deviceName` matches the fake's. NOTE the walk's fake must emit boundary actuals — check `buildStoryEvents()` already includes `intervalComplete` boundary events (7B's story has them); if its actuals lack plausible avgSplit values, adjust the STORY fixture, never the assertion.
- [ ] **Step 2: screenshots** of the monitor-mode form (both orientations), seeded the walk's way. Baselines become 244+1(or +2) e2e / 47+2 screenshots — record exact counts in the report.
- [ ] **Step 3: run all gates twice** (unit, e2e, screenshots, build + dist:grep, lint/typecheck). Revert known cross-session capture noise (`today-sheet.png`, `news-reader.png` class) if it appears; commit the two NEW captures.
- [ ] **Step 4: commit** — `test: the walk logs what it rowed`

## Execution notes

- Task order is strict (each consumes the previous task's exports).
- The walk-4 §18 record and the adversarial review are the two documents an implementer should have beside the spec.
- Model guidance for the controller: Tasks 1/2 standard tier (multi-file seams); Task 3 cheap-to-mid (mechanical validation + migration); Task 4 standard; Task 5 cheap-to-mid; Task 6 standard (fixture archaeology).
