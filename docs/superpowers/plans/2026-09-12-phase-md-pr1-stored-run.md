# Phase MD PR 1 — One Writer for the Stored Run: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `handoffStore.ts` becomes the only module that touches the `ergomatic.monitorRun` localStorage key; `monitorRun.ts` keeps the record type and its pure builders with no storage call left in it; every test fixture that seeds the key does so through the store's real writer.

**Architecture:** A MOVE, not a merge (spec §11 — do not re-propose the merge). The persistence half of `monitorRun.ts` (the key, the validators, `loadMonitorRun`, `connectGuardStage`) moves into `handoffStore.ts`, so the dependency runs one way (persistence imports the type) and the circular-import constraint that forced `connectGuardStage`'s boolean parameter is gone. `saveMonitorRun` and `clearMonitorRun` are deleted; fixtures seed through `commit`. `retire` takes one entry and a closed `RetireReason` union. `anyLiveSession` and `monitorRunState` are deleted per James's ruling (spec §7) and `todayGuard.pin.test.ts` is rewritten so all three of its assertions still bite.

**Tech Stack:** React 19 + Vite, TypeScript, Vitest (`client` project = jsdom, `unit` project = node), Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-09-12-stored-run-module-design.md` revision 2. Executors read it AND `~/.claude/handoffs/2026-09-12-phase-md-pr1.md` is NOT required — this plan carries what it said.

**Baseline:** every number here was measured in the worktree `.claude/worktrees/md-pr1` at `4aa3d132f957d93ce62b72cf3e91be5d4e9ce07e` (main, `#406`), run from `app/` unless stated. Re-run any of them; a number without a command beside it is a plan defect.

**TRIAD: stored shape.** PM final-PR gate on the PR. The antagonist anchor pass is folded into spec rev 2; `/harden` runs on THIS plan (two passes max) before Task 1 starts.

**James's riders (2026-09-12, this session):** `isPlainRecord` ×4 is folded into this PR as a shared predicate (Task 1). The hand-off residual-1 row is proposed for STRIKE at the hand-back. The free-row rate-tile ROADMAP row (fixed in #402) is closed on this branch (Task 7).

---

## Global Constraints

- **No behaviour change a rower can see. No screenshot is committed** (spec §9.7).
- **Invariants, not mechanisms (spec §3):** (1) one writer — exactly one function writes the key (`performDurableWrite`) and no export lets a caller write it another way; (2) the bytes are unchanged — gated by Task 0, not asserted; (3) the sacrifice ordering survives with ONE copy; (4) a read destroys nothing; (5) retire is key-bound and a superseded revision is receipted, never refused — `retire` matches on `sessionKey` alone, removes unconditionally, computes `superseded` AFTER. **Do not "fix" (5).**
- **The boundary gate is EXTENDED, never replaced** (`app/scripts/handoffStoreBoundary.test.ts`, `unit` project). A grep in a PR body does not satisfy spec §9.2.
- **Every new assertion gets a mutation that makes it fail**, and the task report states what was mutated and what the failure said (RF21). **Commit before every probe** and confirm with `git log -1` (RF22). A mutation must COMPILE (RF12 corollary).
- **Test invocation:** `pnpm test --project client -- <pattern>` silently runs the whole suite. For one file: `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client <file>` (collapses signal deaths to exit 1 — RF40; never re-run a run showing exit ≥128 or `Allocation failed`). Read BOTH summary lines (`Test Files` and `Tests`).
- **Run `git rev-parse --show-toplevel` before every commit** and confirm it prints `.../.claude/worktrees/md-pr1`. Every subagent reads `.claude/agent-briefing.md` first. Never merge, never remove the worktree.
- **PM5 in copy:** none of this PR touches copy. Comments are not copy.
- **No em-dashes in user-facing strings** — none are written here.
- **Anything with a life after merge goes in `ROADMAP.md` at the moment it is found** (RF14), stamped `· dies YYYY-MM-DD · <why a row>`.

## Names this plan fixes (every task uses exactly these)

| Symbol | After this PR | Module |
| --- | --- | --- |
| `isPlainRecord(value: unknown): value is Record<string, unknown>` | one shared export | `app/src/isPlainRecord.ts` (new) |
| `MONITOR_RUN_KEY` | exported (kept for the 16 test files that seed raw bytes — the one demotion this plan does not take; see "The export count") | `handoffStore.ts` |
| `isMonitorRun`, `stripMalformedSeries`, `hasValidSeries` | private | `handoffStore.ts` |
| `loadMonitorRun(): MonitorRun \| null` | exported, durable-tier raw read, never consults `current`, never clears | `handoffStore.ts` |
| `connectGuardStage(): ConnectGuardStage` and `type ConnectGuardStage` | exported, NO parameter, reads `loadRun()` then `currentUnretired() !== null` | `handoffStore.ts` |
| `saveMonitorRun`, `clearMonitorRun`, `anyLiveSession`, `monitorRunState`, `sessionRunState`, `RecordState` | DELETED | — |
| `measuredSessionSeconds(run: MonitorRun): number` | the one surviving name (was the alias of `interruptedTotalSeconds`, which is renamed away) | `monitorRun.ts` |
| `type HandoffRef = Pick<HandoffEntry, "sessionKey" \| "revision">` | new type export | `handoffStore.ts` |
| `type RetireReason` | new closed union, listed in Task 5 | `handoffStore.ts` |
| `retire(entry: HandoffRef, reason: RetireReason): void` | one entry, not an array | `handoffStore.ts` |
| `stageRetire(entry: HandoffRef \| null, attemptId): void`, `takeStagedRetire(attemptId): HandoffRef \| null` | single entry; receipt payloads UNCHANGED (still `discarded: HandoffRef[]`) | `handoffStore.ts` |
| `handoffStore` namespace object | DELETED | — |
| `seedMonitorRun(run: MonitorRun): Promise<HandoffRef>` | new test helper, seeds through `commit` | `app/src/test/seedHandoff.ts` (new) |

**The export count.** Baseline: `grep -cE '^export (function|const) ' src/monitor/monitorRun.ts src/monitor/handoffStore.ts` → `19` + `16` = **35**. Target after Task 4 (derived from the lists below; the grep is the gate): `monitorRun.ts` **9** (`createMonitorRun`, `recordActual`, `completeMonitorRun`, `completeInterruptedRun`, `withPartial`, `partialRefusal`, `completeContinuityReset`, `appendSummaryObservations`, `measuredSessionSeconds`) + `handoffStore.ts` **18** (the 15 surviving today's 16 minus the namespace object, plus `MONITOR_RUN_KEY`, `loadMonitorRun`, `connectGuardStage`) = **27** = 35 − 5 deleted (`saveMonitorRun`, `clearMonitorRun`, `anyLiveSession`, `interruptedTotalSeconds` [the alias survives], `handoffStore`) − 3 demoted (`isMonitorRun`, `isPlainRecord` [moves to the shared module, which is outside the two counted files], `stripMalformedSeries`) + 0. `MONITOR_RUN_KEY` stays exported (spec §6's slack: 16 files outside the two modules reference it, of which **11 import it by name** — the other five are two e2e specs and the boundary gate holding the literal — and a string literal in 11 test files is a worse duplication than one export; the PR body prints 11). `clearMonitorRun` is deleted rather than moved — spec §4 said "move and stay exported" for it, but it has ZERO production callers (`grep -rn 'clearMonitorRun(' src e2e --include='*.ts' --include='*.tsx' | grep -v '\.test\.' | grep -v monitorRun.ts` → comments only), it is a raw `removeItem` that would leave the store's `current` disagreeing with the durable tier, and the boundary gate names it as a legacy writer. Its 12 test call sites (`grep -rn 'clearMonitorRun(' src --include='*.test.*' | wc -l` → 12, six files) become `localStorage.removeItem(MONITOR_RUN_KEY)` (test files are exempt from the gate by pattern, and that is exactly what the function did). RF10: this is a stated deviation from §4, not a silent one; the harden pass rules on it.

## The lifetime table (RF27) — every piece of state the store owns

This PR mints NO new session-scoped state. `connectGuardStage` reads through `currentUnretired()`; `loadMonitorRun` is stateless. The table exists so the reviewer can check that claim, and so the "what survives" column is written down once.

| State (`handoffStore.ts`) | Minted | Cleared / reset | Survives hook teardown? | Survives relaunch? | Survives re-arm (new connect, same process)? |
| --- | --- | --- | --- | --- | --- |
| `current: HandoffEntry \| null` | `ensureHydrated` (durable → revision 0) or `acceptCommit` | `retire` (per matched key); `resetForTests` | YES (module singleton) | NO — rebuilt from durable bytes at the first non-render access | YES unless the armed handler retires it (`connect-guard-armed`) or `createMonitorRun-defense` retires a different key |
| `tombstones: Set<string>` | `retire` | `resetForTests` only | YES | NO — and normally nothing rehydrates because `retire` removed the bytes; but a `safeRemoveItem` that FAILS is masked (receipted `storage-getter-error`, flag cleared "once the attempt is MADE"), so on that path a relaunch rehydrates the retired record at revision 0. Pre-existing, not this PR's (harden lens 1) | YES — a retired key stays refused for the process |
| `claims: Map` | `claim` | `retire` (per key); `resetForTests` | YES | NO | YES |
| `durableStateByKey: Map` | `ensureHydrated`; `performDurableWrite` on a landed write | `retire` (per key); `resetForTests` | YES | NO | YES |
| `cachedVerdicts: Map` | `ensureHydrated`; `acceptCommit`; `retryDurable` | `retire` (per key); `resetForTests` | YES | NO | YES |
| `hydrated: boolean` | first `ensureHydrated` | `resetForTests` only | YES | NO (false on relaunch — that is what makes hydration happen once per process) | YES |
| `durableMalformed: boolean` | `ensureHydrated` on unparsable/invalid bytes or getter error | `acceptCommit` when the write LANDS; `retire` after its sweep; `resetForTests` | YES | NO | YES until a landed write or a retire |
| `stagedRetireSet` / `stagedRetireAttempt` (becomes `stagedRetire: HandoffRef \| null` + attempt) | `stageRetire` (ConnectAction's guard) | `takeStagedRetire` (keyed by attempt); `discardStagedRetire`; `resetForTests` | YES — deliberately: the guard and the hook are different components | NO | consumed at the NEXT armed event of the SAME attempt; a different attempt's take is a pure read |
| `receiptChannel` | `setReceiptChannel` | `setReceiptChannel(null)`; `resetForTests` | YES | NO | YES |

## How this plan is executed

The controller coordinates. A **fresh subagent implements each task** (Sonnet for Tasks 1, 2, 3, 5, 7; Opus for Tasks 0 [author-run], 4 and 6, which need judgement about which tests die). Each task ends with a commit on `phase-md-pr1` and a report naming: the commands run and their summary lines, every mutation and what its failure said, and any place the plan contradicted what the implementer observed (RF10 — say so, do not work around it). The controller reviews between tasks. Tasks are STRICTLY SEQUENTIAL — every one touches `handoffStore.ts` or its tests.

---

### Task 0: Capture the byte-compatibility fixtures FROM MAIN, and the gate that reads them

**DONE by the author, commit `5c4f8665` — gate green on main (20 tests), both mutations measured (results inline below).**

**Run by the plan author, in this worktree, BEFORE any other task changes a line** (spec §5: "captured from `main`, before the first line of the change"). The gate is green on main and must stay green through Task 7.

**Files:**
- Create: `app/src/monitor/fixtures/monitorRunShapes.ts` — the seven deterministic inputs
- Create: `app/scripts/capture-monitor-run-fixtures.ts` — drives the REAL writer (`commit`) under a storage shim and writes the bytes it produced
- Create: `app/src/monitor/fixtures/monitorRun-bytes/<shape>.json` ×7 (generated)
- Create: `app/src/monitor/handoffStoreBytes.test.ts` — the gate (client project)

**Interfaces:**
- Produces: `MONITOR_RUN_SHAPES: readonly ShapeCase[]` where `ShapeCase = { name: string; run: MonitorRun; throwFirstWrite: boolean }`, and the fixture JSON shape `{ name, verdict, bytes: string | null }`.

- [ ] **Step 1: Write the seven inputs**

`app/src/monitor/fixtures/monitorRunShapes.ts`:

```ts
// The seven MonitorRun inputs the byte-compatibility gate drives through
// the store's REAL writer (Phase MD PR 1, spec §5). Deterministic by
// construction: fixed clocks, a real library program compiled through the
// real assembly (RF3), and no Date.now()/Math.random() anywhere. The
// captured bytes under `monitorRun-bytes/` were produced from THESE inputs
// by `scripts/capture-monitor-run-fixtures.ts` against main at 4aa3d132,
// BEFORE the persistence half moved (RF11: a fixture generated afterwards
// is a mirror one step later). Regenerate ONLY when the stored shape is
// deliberately changed, and say so in that PR.
import { LIBRARY_WORKOUTS } from "../../../server/seed/library/index";
import type { Baselines, WorkoutType } from "../../../domain/types.js";
import {
  compileProgram,
  type WorkoutProgram,
} from "../../../domain/monitor/program.js";
import { buildDraft } from "../../session/draft";
import { buildRun } from "../../session/engine";
import type { LogSeed } from "../../session/logDraft";
import {
  appendSummaryObservations,
  withPartial,
  type MonitorRun,
} from "../monitorRun";

export interface ShapeCase {
  readonly name: string;
  readonly run: MonitorRun;
  /** When true the capture/gate makes the FIRST `localStorage.setItem`
   *  throw, so the writer takes its series-sacrifice retry. This is the
   *  only shape that STAMPS `seriesDropped` rather than copying it from
   *  the input, and therefore the only one that can catch its rename. */
  readonly throwFirstWrite: boolean;
}

const baselines: Baselines = { k2Seconds: 100, k6Seconds: 120 };
const t0 = new Date("2026-08-05T12:00:00.000Z");
const STARTED_AT = "2026-08-05T12:00:00.000Z";
const COMPLETED_AT = "2026-08-05T12:20:00.000Z";

const SEED: LogSeed = {
  steps: [{ label: "8:00 warm-up", kind: "work" }],
  paces: {},
};

function fillingLowProgram(): WorkoutProgram {
  const w = LIBRARY_WORKOUTS.find((s) => s.title === "Filling Low");
  if (!w) throw new Error("missing library fixture: Filling Low");
  const draft = buildDraft({
    id: "fl-bytes-fixture",
    title: w.title,
    type: w.type as WorkoutType,
    steps: w.steps,
  });
  const result = compileProgram(buildRun(draft, baselines, t0).phases);
  if ("code" in result) {
    throw new Error(`fixture failed to compile: ${result.code}`);
  }
  return result;
}

const PROGRAM = fillingLowProgram();

function base(): MonitorRun {
  return {
    v: 2,
    workoutId: "fl-bytes-fixture",
    title: "Filling Low",
    program: PROGRAM,
    logSeed: SEED,
    actuals: [],
    deviceName: "PM5 430123456",
    startedAt: STARTED_AT,
    completedAt: null,
    terminated: false,
  };
}

const SERIES = {
  samples: [
    { t: 0, d: 0, p: 120, spm: 24 },
    { t: 1, d: 4, p: 121.5, spm: 25, hr: 140 },
    { t: 2, d: 8, p: 122, spm: 25, r: true as const },
  ],
};

/** `appendSummaryObservations` refuses a run it cannot observe against
 *  (returns null); the fixture must never silently become a base run. */
function summaryDetailRun(
  ...args: Parameters<typeof appendSummaryObservations>
): MonitorRun {
  const run = appendSummaryObservations(...args);
  if (run === null) throw new Error("summary-detail fixture refused");
  return run;
}

export const MONITOR_RUN_SHAPES: readonly ShapeCase[] = [
  {
    name: "ordinary",
    run: { ...base(), series: SERIES },
    throwFirstWrite: false,
  },
  {
    name: "sacrifice-thrown-with-series",
    run: { ...base(), series: SERIES },
    throwFirstWrite: true,
  },
  { name: "thrown-without-series", run: base(), throwFirstWrite: true },
  {
    name: "v1-record",
    run: (() => {
      const { logSeed: _seed, ...v1 } = base();
      return { ...v1, v: 1 as const };
    })(),
    throwFirstWrite: false,
  },
  {
    name: "partial",
    run: withPartial(
      { ...base(), completedAt: COMPLETED_AT, endedBy: "rower" },
      "rower",
      { intervalIndex: 0, meters: 250, seconds: 60.5 },
    ),
    throwFirstWrite: false,
  },
  {
    name: "summary-detail",
    run: summaryDetailRun(
      { ...base(), completedAt: COMPLETED_AT, endedBy: "finished" },
      {
        totals: { workElapsedSeconds: 480, workDistanceMeters: 2000 },
        detail: {
          avgStrokeRate: 26,
          endingHeartRateBpm: 150,
          avgHeartRateBpm: 145,
          minHeartRateBpm: 120,
          maxHeartRateBpm: 160,
          dragFactorAverage: 118,
          workoutType: 3,
          recoveryHeartRateBpm: 130,
          avgPaceSecondsPer500m: 120,
          totalCalories: 140,
          avgWatts: 190,
          avgCalPerHour: 1050,
          totalRestMeters: 12,
        },
        verificationBytes: [1, 2, 3],
      },
    ),
    throwFirstWrite: false,
  },
  {
    name: "mode-justrow",
    run: {
      ...base(),
      mode: "justrow",
      workoutId: null,
      program: { intervals: [] },
      logSeed: { steps: [], paces: {} },
    },
    throwFirstWrite: false,
  },
];
```

(`appendSummaryObservations` returns `MonitorRun | null` — the `summaryDetailRun` wrapper is why; paste-tested at baseline.)

- [ ] **Step 2: Write the capture script**

`app/scripts/capture-monitor-run-fixtures.ts`:

```ts
// Drives the hand-off store's REAL writer over the seven shapes in
// `src/monitor/fixtures/monitorRunShapes.ts` and writes the bytes each
// one leaves under MONITOR_RUN_KEY to `src/monitor/fixtures/monitorRun-
// bytes/<name>.json`. Run ONCE against main before Phase MD PR 1's move
// (RF11), and again only when the stored shape deliberately changes.
//
//   pnpm exec tsx scripts/capture-monitor-run-fixtures.ts
//
// Node has no `localStorage` (the repo runs with
// --no-experimental-webstorage); the shim below is the smallest thing the
// store's `safeSetItem`/`safeGetItem`/`safeRemoveItem` need, plus a
// one-shot throw so the sacrifice path runs for the shapes that ask for it.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "..", "src", "monitor", "fixtures", "monitorRun-bytes");

let throwNext = false;
const store = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (throwNext) {
        throwNext = false;
        throw new Error("QuotaExceededError (simulated, first write only)");
      }
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  },
});

const { MONITOR_RUN_SHAPES } =
  await import("../src/monitor/fixtures/monitorRunShapes.ts");
const handoff = await import("../src/monitor/handoffStore.ts");
const KEY = "ergomatic.monitorRun";

mkdirSync(OUT, { recursive: true });
for (const shape of MONITOR_RUN_SHAPES) {
  handoff.resetForTests();
  store.clear();
  throwNext = shape.throwFirstWrite;
  const result = handoff.commit(shape.run.startedAt, null, shape.run);
  if (!result.accepted) {
    throw new Error(`${shape.name}: commit refused (${result.reason})`);
  }
  const bytes = store.get(KEY) ?? null;
  const out = { name: shape.name, verdict: result.verdict, bytes };
  writeFileSync(
    join(OUT, `${shape.name}.json`),
    JSON.stringify(out, null, 2) + "\n",
  );
  console.log(
    `${shape.name}: ${result.verdict}, ${bytes === null ? "no bytes" : `${bytes.length} bytes`}`,
  );
}
```

- [ ] **Step 3: Run it against main and look at the output**

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/md-pr1/app
pnpm exec tsx scripts/capture-monitor-run-fixtures.ts
ls src/monitor/fixtures/monitorRun-bytes/
grep -l 'seriesDropped' src/monitor/fixtures/monitorRun-bytes/*.json   # the bytes are a JSON string, so quotes are escaped inside
```

Expected: seven files; `sacrifice-thrown-with-series.json` has `verdict: "saved-without-series"` and its bytes contain `"seriesDropped":true` and NO `"series"`; `thrown-without-series.json` has `verdict: "failed"` and `bytes: null`; the other five are `"saved"`. Open `ordinary.json` and READ it (RF7): the keys are exactly the fields `base()` sets plus `series`.

- [ ] **Step 4: Write the gate**

`app/src/monitor/handoffStoreBytes.test.ts`:

```ts
// The byte-compatibility gate (Phase MD PR 1, spec §5 — rebuilt after the
// anchor pass proved revision 1's could not go red). Three claims; (a) and
// (c) go red under a production mutation, (b) under a fixture regeneration:
//
//  (a) BYTE IDENTITY: the writer, driven with the SAME input the fixture
//      was captured from, produces the SAME bytes. This is the gate that
//      catches an added field AND a renamed one (`seriesDropped` ->
//      `seriesTrimmed` changes the sacrifice fixture's bytes).
//  (b) KEY SET: each fixture's parsed key set equals a literal list, so a
//      reviewer sees a renamed/added field BY NAME rather than as a diff
//      of program bytes. This leg pins the FIXTURE FILES, not the writer —
//      no production change can redden it; it goes red exactly when someone
//      regenerates the fixtures, which is when a reviewer must look.
//  (c) OLD BYTES STILL LOAD: bytes main wrote are accepted by the current
//      reader. `toStrictEqual` here is a courtesy (the reader returns its
//      parse unmodified — spec §5); the `not.toBeNull()` is the assertion
//      that bites when a validator is tightened.
//
// Fixtures were captured by `scripts/capture-monitor-run-fixtures.ts`
// against main at 4aa3d132 (RF11). Never regenerate them to make this
// green.
import { afterEach, describe, expect, it, vi } from "vitest";
import { MONITOR_RUN_SHAPES } from "./fixtures/monitorRunShapes";
import ordinary from "./fixtures/monitorRun-bytes/ordinary.json?raw";
import sacrifice from "./fixtures/monitorRun-bytes/sacrifice-thrown-with-series.json?raw";
import thrownNoSeries from "./fixtures/monitorRun-bytes/thrown-without-series.json?raw";
import v1 from "./fixtures/monitorRun-bytes/v1-record.json?raw";
import partial from "./fixtures/monitorRun-bytes/partial.json?raw";
import summaryDetail from "./fixtures/monitorRun-bytes/summary-detail.json?raw";
import justrow from "./fixtures/monitorRun-bytes/mode-justrow.json?raw";

interface Captured {
  name: string;
  verdict: "saved" | "saved-without-series" | "failed";
  bytes: string | null;
}

const CAPTURED: Record<string, Captured> = Object.fromEntries(
  [ordinary, sacrifice, thrownNoSeries, v1, partial, summaryDetail, justrow]
    .map((raw) => JSON.parse(raw) as Captured)
    .map((c) => [c.name, c]),
);

const KEY = "ergomatic.monitorRun";

// Independent literals (RF21): NOT derived from the MonitorRun type or the
// fixture inputs. A field added to the record shows up here as a named
// diff, and the list is what a reviewer reads.
const BASE_KEYS = [
  "actuals",
  "completedAt",
  "deviceName",
  "logSeed",
  "program",
  "startedAt",
  "terminated",
  "title",
  "v",
  "workoutId",
];
const EXPECTED_KEYS: Record<string, readonly string[]> = {
  ordinary: [...BASE_KEYS, "series"],
  "sacrifice-thrown-with-series": [...BASE_KEYS, "seriesDropped"],
  "v1-record": BASE_KEYS.filter((k) => k !== "logSeed"),
  partial: [...BASE_KEYS, "endedBy", "partial"],
  "summary-detail": [
    ...BASE_KEYS,
    "endedBy",
    "summaryDetail",
    "summaryTotals",
    "verificationBytes",
  ],
  "mode-justrow": [...BASE_KEYS, "mode"],
};

type StoreModule = typeof import("./handoffStore");

async function freshStore(): Promise<StoreModule> {
  vi.resetModules();
  localStorage.clear();
  return import("./handoffStore");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("byte compatibility of the stored run (spec §5)", () => {
  it("captured seven shapes, and the capture recorded the verdict each one produced", () => {
    expect(Object.keys(CAPTURED).sort()).toStrictEqual(
      MONITOR_RUN_SHAPES.map((s) => s.name).sort(),
    );
    expect(CAPTURED["sacrifice-thrown-with-series"]!.verdict).toBe(
      "saved-without-series",
    );
    expect(CAPTURED["thrown-without-series"]!.verdict).toBe("failed");
    expect(CAPTURED["thrown-without-series"]!.bytes).toBeNull();
  });

  for (const shape of MONITOR_RUN_SHAPES) {
    it(`(a) the writer reproduces the captured bytes for "${shape.name}"`, async () => {
      const store = await freshStore();
      if (shape.throwFirstWrite) {
        const real = localStorage.setItem.bind(localStorage);
        let first = true;
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
          this: Storage,
          k: string,
          v: string,
        ) {
          if (first) {
            first = false;
            throw new Error("QuotaExceededError (simulated)");
          }
          real(k, v);
        });
      }
      const result = store.commit(shape.run.startedAt, null, shape.run);
      expect(result.accepted).toBe(true);
      if (!result.accepted) return;
      expect(result.verdict).toBe(CAPTURED[shape.name]!.verdict);
      expect(localStorage.getItem(KEY)).toBe(CAPTURED[shape.name]!.bytes);
    });
  }

  for (const [name, keys] of Object.entries(EXPECTED_KEYS)) {
    it(`(b) the key set of "${name}" is exactly the pinned list`, () => {
      const bytes = CAPTURED[name]!.bytes;
      expect(bytes).not.toBeNull();
      const parsed = JSON.parse(bytes!) as Record<string, unknown>;
      expect(Object.keys(parsed).sort()).toStrictEqual([...keys].sort());
    });
  }

  for (const [name, captured] of Object.entries(CAPTURED)) {
    if (captured.bytes === null) continue;
    it(`(c) bytes main wrote for "${name}" still load through the current reader`, async () => {
      const store = await freshStore();
      localStorage.setItem(KEY, captured.bytes!);
      store.hydrate();
      const entry = store.currentUnretired();
      expect(entry).not.toBeNull();
      expect(entry!.run).toStrictEqual(JSON.parse(captured.bytes!));
    });
  }
});
```

- [ ] **Step 5: Run the gate on main — it must be GREEN**

```bash
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/monitor/handoffStoreBytes.test.ts
```

Expected: `Test Files 1 passed`, `Tests 20 passed` (1 + 7 + 6 + 6). If (a) fails for a shape on main, the input is non-deterministic — find the `Date`/`Math.random` and fix the SHAPE, never the fixture.

- [ ] **Step 6: Commit, then prove the gate can go red (two mutations, both against `performDurableWrite` in `handoffStore.ts`)**

```bash
git rev-parse --show-toplevel   # must print .../.claude/worktrees/md-pr1
git add src/monitor/fixtures scripts/capture-monitor-run-fixtures.ts src/monitor/handoffStoreBytes.test.ts
git commit -m "Capture the stored run's bytes from main, and gate them" 
git log -1 --oneline
```

Mutation 1 — the writer adds a field. In `handoffStore.ts` `performDurableWrite`, change `JSON.stringify(run)` (the primary write) to `JSON.stringify({ ...run, extra: 1 })`. Run the gate. **Measured on main (5c4f8665):** the five shapes whose bytes come from the PRIMARY write fail (`ordinary`, `v1-record`, `partial`, `summary-detail`, `mode-justrow` — `5 failed | 15 passed`); `sacrifice-thrown-with-series` passes because its bytes come from the unmutated RETRY write, and `thrown-without-series` writes nothing. Revert with `git checkout -- src/monitor/handoffStore.ts` (the file is clean — the commit above landed). Note macOS `sed` has no `0,/re/` form; the anchor is unique (`grep -c 'JSON.stringify(run)'` → 1), so a plain `s/…/…/` is the probe.

Mutation 2 — rename `seriesDropped`. In the same function, change `seriesDropped: true` to `seriesTrimmed: true` in the retry's `dropped` record (add `// @ts-expect-error mutation probe` above the line if `MonitorRun` refuses the key, so the probe COMPILES). Run the gate. **Measured on main (5c4f8665):** ONLY `(a) the writer reproduces the captured bytes for "sacrifice-thrown-with-series"` fails — `1 failed | 19 passed`, `AssertionError: expected '{"v":2,"workoutId":"fl-bytes-fixture"…' to be '{"v":2,…'`, received bytes ending `"terminated":false,"seriesTrimmed":true}`. (`as unknown as MonitorRun` on the mutated literal keeps the probe compiling.) Revert. **The PR body prints both results (spec §9.4).**

---

### Task 1: One `isPlainRecord` (James's rider)

**Files:**
- Create: `app/src/isPlainRecord.ts`, `app/src/isPlainRecord.test.ts`
- Modify: `app/src/monitor/monitorRun.ts` (delete the export at `:453-457`, import the shared one), `app/src/monitor/handoffStore.ts` (import from the shared module instead of `./monitorRun.js`), `app/src/builder/builderDraft.ts:47`, `app/src/session/draft.ts:85`, `app/src/session/run.ts:75` (delete the private copy, import)

**Interfaces:**
- Produces: `export function isPlainRecord(value: unknown): value is Record<string, unknown>` from `app/src/isPlainRecord.ts`.

- [ ] **Step 1: Failing test**

`app/src/isPlainRecord.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isPlainRecord } from "./isPlainRecord";

describe("isPlainRecord — the one JSON-shape guard every localStorage reader shares", () => {
  it("accepts a plain object, including an empty one", () => {
    expect(isPlainRecord({})).toBe(true);
    expect(isPlainRecord({ v: 1 })).toBe(true);
  });

  it("rejects null, arrays and primitives — each is `typeof object` or a JSON value that must NOT read as a record", () => {
    expect(isPlainRecord(null)).toBe(false);
    expect(isPlainRecord([])).toBe(false);
    expect(isPlainRecord([{ v: 1 }])).toBe(false);
    expect(isPlainRecord("{}")).toBe(false);
    expect(isPlainRecord(1)).toBe(false);
    expect(isPlainRecord(undefined)).toBe(false);
  });
});
```

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/isPlainRecord.test.ts` → FAIL (module not found).

- [ ] **Step 2: The module**

`app/src/isPlainRecord.ts`:

```ts
/** The one shape guard every localStorage reader in `src/` shares. Was
 *  declared four times byte-identically (`monitor/monitorRun.ts`,
 *  `builder/builderDraft.ts`, `session/draft.ts`, `session/run.ts`) until
 *  Phase MD PR 1 folded them here. An array is `typeof "object"` and so is
 *  `null`; neither is a record a validator may index into. */
export function isPlainRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
```

Run the test → PASS.

- [ ] **Step 3: Re-point the four copies**

In each of `builder/builderDraft.ts`, `session/draft.ts`, `session/run.ts`: delete the private `function isPlainRecord(...)` (one line body each — confirm with `grep -n -A2 'function isPlainRecord'` that the body is exactly `typeof value === "object" && value !== null && !Array.isArray(value)` before deleting) and add `import { isPlainRecord } from "../isPlainRecord";`. In `monitor/monitorRun.ts`: delete the `export function isPlainRecord` block (`:453-457`) and its doc comment's "EXPORTED (hand-off store...)" paragraph (`:447-452` — the paragraph that starts `// EXPORTED (hand-off store, design spec §8)`; keep the paragraphs above it, they are about `ProgramInterval.type`), add `import { isPlainRecord } from "../isPlainRecord";`. In `monitor/handoffStore.ts`: remove `isPlainRecord` from the `./monitorRun.js` import (`:63-70`) and add `import { isPlainRecord } from "../isPlainRecord";`.

- [ ] **Step 4: Gates and commit**

```bash
pnpm typecheck && pnpm lint
pnpm test --project client
git rev-parse --show-toplevel
git add -A src/isPlainRecord.ts src/isPlainRecord.test.ts src/monitor src/builder src/session
git commit -m "Fold the four byte-identical isPlainRecord copies into one shared guard"
```

Mutation: in `src/isPlainRecord.ts` drop `&& !Array.isArray(value)`. Expected: `isPlainRecord.test.ts` fails on `[]`; `session/run.test.ts` or `monitorRun.test.ts`'s "an array, not an object" case fails too (name which in the report). Revert.

Report the count: `grep -rn 'function isPlainRecord' src` → exactly 1.

---

### Task 2: Fixtures seed through the real writer

**Files:**
- Create: `app/src/test/seedHandoff.ts`
- Modify: `app/src/session/LogSession.test.tsx` (76 call sites), `app/src/workout/WorkoutDetail.test.tsx` (11), `app/src/session/useStartWorkout.test.tsx` (5), `app/src/monitor/ConnectAction.test.tsx` (1). NOT `monitorRun.test.ts` (Task 4 owns it).

Counts at baseline: `for f in src/session/LogSession.test.tsx src/workout/WorkoutDetail.test.tsx src/session/useStartWorkout.test.tsx src/monitor/ConnectAction.test.tsx; do echo "$f $(grep -c 'saveMonitorRun(' $f)"; done` → 76 / 11 / 5 / 1.

**Why a dynamic import inside the helper:** `LogSession.test.tsx` and `WorkoutDetail.test.tsx` call `vi.resetModules()` in `beforeEach` and import the screen dynamically, so the store instance the SCREEN sees is whichever the module registry holds at that moment. A helper that imported the store statically would hold the pre-reset instance forever, and its `commit` would start refusing `second-key` on the second test. A dynamic import inside the helper resolves against the current registry, so the seed lands in the same instance the screen reads. (`commit(key, null, run)` accepts at revision 0 — `handoffStore.ts` `commit`'s create branch calls `acceptCommit(sessionKey, 0, next)` — which is the same revision hydration assigns, so a screen mounting afterwards sees exactly what a reload would.)

- [ ] **Step 1: The helper**

`app/src/test/seedHandoff.ts`:

```ts
import type { MonitorRun } from "../monitor/monitorRun";

export interface SeededRef {
  readonly sessionKey: string;
  readonly revision: number;
}

function refuse(reason: string, run: MonitorRun): never {
  throw new Error(
    `seedMonitorRun refused (${reason}) for ${run.startedAt} — reset the store or retire the current entry first`,
  );
}

/** Seeds a MonitorRun the way production writes one: through the store's
 *  `commit`. Replaces the deleted `saveMonitorRun` fixture seeder (Phase MD
 *  PR 1) so no test starts DOWNSTREAM of the producer (RF24). Throws on a
 *  refused commit: a fixture that silently failed to seed is how a green
 *  suite hides a broken seam.
 *
 *  Dynamic import on purpose — a file that calls `vi.resetModules()` per
 *  test must seed the store instance the screen will import NEXT, not one
 *  this module cached at load. Use this form by default. */
export async function seedMonitorRun(run: MonitorRun): Promise<SeededRef> {
  const store = await import("../monitor/handoffStore");
  const result = store.commit(run.startedAt, null, run);
  if (!result.accepted) refuse(result.reason, run);
  return { sessionKey: run.startedAt, revision: result.revision };
}
```

- [ ] **Step 2: Rewrite the call sites, file by file, running each file after**

The transformation is mechanical: `saveMonitorRun(X);` → `await seedMonitorRun(X);` and the enclosing `it(...)` callback becomes `async` if it is not already. Remove `saveMonitorRun` from each file's `./monitorRun`/`../monitor/monitorRun` import and add `import { seedMonitorRun } from "../test/seedHandoff";` (path relative to the file). If a seed sits inside a nested helper function, make that helper `async` and `await` its callers. **A seed inside a SYNC callback a component invokes** (e.g. an `onProceed` prop) cannot await: call the store directly there (`commit(run.startedAt, null, run)` from a static import in a file that never `vi.resetModules()`; from `await import(...)` taken at the top of the test otherwise). **`ConnectAction.test.tsx` was converted by the author and taught something:** its stand-in `onProceed` (`connectAsTaskFiveWill`) runs TWICE in some tests — once as setup, once when the component fires it — and the real writer refuses the second create as `stale` where the raw seeder silently overwrote. The fixture now mirrors the hook's own create-commit (adopt a same-key entry as an update). Task 2's full-suite run is where that surfaced: `Tests 5970 passed` beside `Errors 2` — **read the `Errors` line too, not only `Test Files`/`Tests`.**

**Three exceptions, each with a one-line comment at the site:**
1. A test whose SUBJECT is the durable-only/reload shape — it asserts hydration receipts, `revision: 0` from hydration, or "a reload sees…" — keeps a raw `localStorage.setItem(MONITOR_RUN_KEY, JSON.stringify(run))` seed (test files are exempt from the boundary gate by pattern; the raw seed IS the reload shape). Comment: `// raw bytes on purpose: this test is about what a RELOAD sees`.
2. A seed followed in the same test by a second seed of a DIFFERENT key with no reset between: the second `commit` is refused `second-key`. Retire the first through `store.retire(...)` (Task 5 changes the signature; until then pass `[{ sessionKey, revision }]`) or call `resetForTests()` between them, whichever the test's own narrative wants.
3. A seed the test later MUTATES (`run.x = …` after seeding): `commit` stores `next` by reference, so mutate a copy before seeding instead.

Run after each file: `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client <file>` and read BOTH summary lines. `LogSession.test.tsx` is large (6.5k lines); expect minutes.

- [ ] **Step 3: Prove the helper is load-bearing**

Commit first. Then mutation: in `seedHandoff.ts` replace each form's body with `localStorage.setItem("ergomatic.monitorRun", JSON.stringify(run)); return { sessionKey: run.startedAt, revision: 0 };` — the OLD seeding shape. Run the four files. **Measured by the author on `ConnectAction.test.tsx` alone: 28/28 STILL PASS under the mutation** — that file resets the store in `beforeEach`, so the store hydrates lazily from the raw bytes after the seed and both forms converge. That is the expected shape wherever a seed precedes the store's first non-render access. The helper's value is not that mutation; it is that a fixture can now express what raw bytes cannot — **a denied durable write** (`vi.spyOn(Storage.prototype, "setItem")` throwing before the seed yields a memory-only entry with verdict `failed`, the row Today renders from the memory tier). `Today.test.tsx`'s "renders while the durable write stays denied, then a reload sees nothing" already drives that through `commit`. Report which of the four files, if any, went red under the mutation, and name that as the measured answer rather than promising one.

- [ ] **Step 4: Gates and commit**

```bash
grep -rn 'saveMonitorRun(' src/session/LogSession.test.tsx src/workout/WorkoutDetail.test.tsx src/session/useStartWorkout.test.tsx src/monitor/ConnectAction.test.tsx   # must be empty
pnpm typecheck && pnpm lint && pnpm test --project client
git rev-parse --show-toplevel
git add src/test/seedHandoff.ts src/session src/workout src/monitor
git commit -m "Seed monitor-run fixtures through the store's own commit, not a writer production never calls"
```

Report: the per-file before/after counts, the exceptions taken (file:line and which of the three), and the mutation result.

---

### Task 3: `retire`, `stageRetire`, `takeStagedRetire` take one entry, and `RetireReason` closes

**Files:**
- Modify: `app/src/monitor/handoffStore.ts` (`stageRetire` `:345`, `takeStagedRetire` `:363`, `discardStagedRetire` `:394`, `deriveClaim` `:589`, `retire` `:861`, `resetForTests` `:973`, the two `let stagedRetire*` at `:333-338`, header comment `:14` and `:43`)
- Modify the 13 call sites: `monitor/useMonitorSession.ts:3277` and `:3880`, `today/UnsavedWorkouts.tsx:100`, `justrow/JustRowLog.tsx:188` and `:229`, `justrow/JustRow.tsx:649`, `workout/WorkoutDetail.tsx:426`, `session/useStartWorkout.ts:119`, `session/ReviewSession.tsx:79` and `:113`, `session/LogSession.tsx:1986`, `:2097`, `:2317`; `monitor/ConnectAction.tsx:206` (`stageRetire`)
- Modify tests: **measured by the author with the production half applied — `pnpm exec tsc -b` reports 42 errors in exactly 7 test files:** `monitor/handoffStore.test.ts` (23), `monitor/useMonitorSession.test.ts` (8, incl. `:4405` and `:5002`, the two test-only reasons), `session/LogSession.test.tsx` (4), `monitor/ConnectAction.test.tsx` (3), `monitor/nfc/useNfcEntry.test.tsx` (2), `session/ReviewSession.test.tsx` (1), `workout/ConnectedInterstitial.test.tsx` (1). The typecheck IS the census; re-run it rather than trusting this list.

**Measured:** production `retire` reasons, all 13 arguments read: `createMonitorRun-defense`, `connect-guard-armed`, `today-discard`, `monitor-discard`, `save-success`, `start-replace`, `row-instead`, `manual-discard` — **8 distinct** (spec §2 says 9; the ninth does not exist in production source at baseline — `grep -rnoE '"[a-z-]+"' <the 13 sites>` — so the union has 8 members. RF10: recorded here rather than padded to match the spec).

**The two sub-decisions (spec §4, ruled by this plan):**
(a) `stageRetire`/`takeStagedRetire` carry ONE entry or `null`. `ConnectAction` stages one entry or nothing; the hook takes one or nothing. Receipt payloads (`stage-retire-replaced.discarded`, `staged-retire-discarded.discarded`) KEEP their array shape — they reach the session ring, and a diagnostic's shape is not this PR's to change; wrap at the emit site.
(b) The two test-only reasons are REASSIGNED, the union stays closed: `"test-simulated-save-while-burst-open"` → `"manual-discard"` (the test asserts a save that must NOT take `deriveClaim`'s consumed branch — any reason other than `"save-success"` keeps that; "manual-discard" is what a rower's own Discard on LogSession sends); `"test-simulated-discard"` → `"monitor-discard"`. Before changing either, `grep -n 'test-simulated' src/monitor/useMonitorSession.test.ts` and confirm no assertion pins the old string (baseline: the two occurrences are the calls themselves).

- [ ] **Step 1: Failing tests (compile-red is the red here — a signature change)**

In `handoffStore.test.ts`, rewrite every `store.retire([{ sessionKey, revision }], reason)` to `store.retire({ sessionKey, revision }, reason)`, every `store.stageRetire([entry], id)` to `store.stageRetire(entry, id)`, `stageRetire([], id)` to `stageRetire(null, id)`, and every `expect(store.takeStagedRetire(id)).toStrictEqual([...])` to the single-entry / `null` form. Add ONE new test in the `retire` describe:

```ts
  it("the reason is a closed union — a call site passing the entry it already holds needs no array and no cast", () => {
    const run = freshRun("2026-08-05T12:00:00.000Z");
    const created = store.commit(run.startedAt, null, run);
    expect(created.accepted).toBe(true);
    const entry = store.currentUnretired()!;
    // Passing the whole HandoffEntry is what 12 of 13 production sites do
    // after Phase MD PR 1 — structural typing accepts it as a HandoffRef.
    store.retire(entry, "save-success");
    expect(store.currentUnretired()).toBeNull();
    const receipt = receiptsOfKind("retire").at(-1)!;
    expect(receipt.reason).toBe("save-success");
    expect(receipt.claimState).toBe("unclaimed");
  });
```

Run `pnpm typecheck` → red (`retire` expects an array).

- [ ] **Step 2: The store**

Replace the two declarations at `:333-338`:

```ts
let stagedRetire: HandoffRef | null = null;
let stagedRetireAttempt: ConnectionAttemptId | null = null;
```

Add after `HandoffEntry`'s declaration (`:77-90`):

```ts
/** The key-and-revision pair every retire/stage call names — a
 *  `HandoffEntry` satisfies it structurally, so a door passes the entry it
 *  already holds (Phase MD PR 1: 12 of 13 sites used to wrap it in a
 *  one-element array). */
export type HandoffRef = Pick<HandoffEntry, "sessionKey" | "revision">;

/** Every reason a production door gives when it retires the record. CLOSED
 *  on purpose (Phase MD PR 1): `deriveClaim` branches on `"save-success"`,
 *  and a free string made that comparison a convention. Tests use these
 *  same members — a test-only reason would un-close the union. */
export type RetireReason =
  | "save-success"
  | "manual-discard"
  | "monitor-discard"
  | "today-discard"
  | "start-replace"
  | "row-instead"
  | "connect-guard-armed"
  | "createMonitorRun-defense";
```

`stageRetire`:

```ts
export function stageRetire(
  entry: HandoffRef | null,
  attemptId: ConnectionAttemptId,
): void {
  if (stagedRetire !== null) {
    emit({ kind: "stage-retire-replaced", discarded: [stagedRetire] });
  }
  stagedRetire = entry;
  stagedRetireAttempt = attemptId;
}
```

`takeStagedRetire` (keep its doc comment; the body):

```ts
export function takeStagedRetire(
  attemptId: ConnectionAttemptId,
): HandoffRef | null {
  if (stagedRetireAttempt !== attemptId) return null;
  const entry = stagedRetire;
  stagedRetire = null;
  stagedRetireAttempt = null;
  return entry;
}
```

`discardStagedRetire`'s body: `const entry = takeStagedRetire(attemptId); if (entry !== null) { emit({ kind: "staged-retire-discarded", discarded: [entry] }); }`.

`deriveClaim(sessionKey: string, reason: RetireReason)` — only the parameter type changes.

`retire`:

```ts
export function retire(
  { sessionKey, revision: authorizedRevision }: HandoffRef,
  reason: RetireReason,
): void {
  ensureHydrated();

  if (durableMalformed) {
    const removal = safeRemoveItem(MONITOR_RUN_KEY);
    if (!removal.ok) {
      emit({ kind: "storage-getter-error", operation: "remove" });
    }
    durableMalformed = false;
  }

  const entry =
    current !== null && current.sessionKey === sessionKey ? current : null;
  if (entry === null) return; // nothing found -> nothing emitted (§1)

  const { claimState, claimedRenderedRevision } = deriveClaim(
    sessionKey,
    reason,
  );

  current = null;
  tombstones.add(sessionKey);
  claims.delete(sessionKey);
  durableStateByKey.delete(sessionKey);
  cachedVerdicts.delete(sessionKey);
  const removal = safeRemoveItem(MONITOR_RUN_KEY);
  if (!removal.ok) {
    emit({ kind: "storage-getter-error", operation: "remove" });
  }

  const superseded = entry.revision !== authorizedRevision;
  emit({
    kind: "retire",
    sessionKey,
    authorizedRevision,
    retiredRevision: entry.revision,
    superseded,
    claimState,
    ...(claimedRenderedRevision !== undefined
      ? { claimedRenderedRevision }
      : {}),
    reason,
  });

  if (reason === "save-success" && entry.revision > authorizedRevision) {
    emit({
      kind: "handoff-dropped",
      reason: "richer-at-save",
      sessionKey,
      claimedRevision: authorizedRevision,
      currentRevision: entry.revision,
    });
  }
}
```

Keep every existing comment inside `retire` that the loop body carried (the "task-2 review, minor: gated on STRICTLY GREATER" paragraph above the `handoff-dropped` emit, and the `§1` note). `resetForTests`: `stagedRetire = null;`. Header comment `:14` `retire(set, reason)` → `retire(entry, reason)`; `:43` `stageRetire(set)` → `stageRetire(entry)`. If the `HandoffReceipt` union types `discarded` as `readonly { sessionKey; revision }[]`, leave it — `[stagedRetire]` satisfies it.

- [ ] **Step 3: The 13 sites and the stager** — *the author has paste-tested every one of these edits; the exact diff is `scratchpad/patches/task3-production.patch` in the controller's scratchpad and is handed to the implementer with the dispatch. Apply it with `git apply`, then read it.*

Each `retireHandoff([{ sessionKey: X.sessionKey, revision: X.revision }], R)` becomes `retireHandoff(X, R)` where `X` is the entry the site already holds (`stale`, `recording.entry`, `door.entry`, `selected.entry`, `entry`, `fallenThrough`, `monitorEntry`, `activeMonitorEntry`). `useMonitorSession.ts:3874-3882`:

```ts
        const staged =
          attemptIdRef.current === null
            ? null
            : takeStagedRetireHandoff(attemptIdRef.current);
        if (staged !== null) {
          retireHandoff(staged, "connect-guard-armed");
        }
```

`ConnectAction.tsx:206-216`: `stageRetireHandoff(monitorEntry, attemptId);` (it is already `HandoffEntry | null`). Update the comment at `useMonitorSession.ts:3863-3866` ("consumes (returns AND clears) the set unconditionally — a no-op array when…") to say "the entry … `null` when `ConnectAction.tsx` had nothing to stage".

- [ ] **Step 4: Tests that call with arrays**

`grep -rnE '(retire|stageRetire|takeStagedRetire)(Handoff|ForTest)?\(\s*\[' src --include='*.test.ts' --include='*.test.tsx'` — rewrite each one-element call to the single-entry form; reassign the two `test-simulated` reasons per (b). **Four sites pass an EMPTY set** (`handoffStore.test.ts:1023`, `:1024`, `:1025`, `:1038` — harden lens 1): they are the only gates on the `durableMalformed` sweep, and the narrowed `retire` has no empty case. Rewrite each as `store.retire({ sessionKey: "irrelevant-key", revision: 0 }, R)` — the sweep runs BEFORE the per-entry lookup, so a key that matches nothing is the empty set's exact equivalent, and the sibling test at `:1002` already uses that form. **Do NOT widen `retire` to `HandoffRef | null`**: no production producer can emit the empty case (`ConnectAction.tsx` stages 0-or-1; the hook guards on `null`), so a nullable arm would be a shape only tests reach. **Comment sweep in the same step:** `retire`'s doc comment ("Each `{sessionKey, revision}` in `set`…", "its own `set` argument"), the `stagedRetire` binding's own doc comment, `takeStagedRetire`'s and `discardStagedRetire`'s all still describe a SET — reword each to the entry. `pnpm typecheck` is the census: it must be clean.

- [ ] **Step 5: Gates, commit, mutation**

```bash
pnpm typecheck && pnpm lint && pnpm test --project client
git rev-parse --show-toplevel
git add -A src
git commit -m "retire takes the entry a door already holds, and its reason is a closed union"
```

Mutation: in `deriveClaim` change `reason === "save-success"` to `reason === "manual-discard"`. Expected: the new test (`claimState` on save-success) does NOT catch it — it asserts `"unclaimed"` because nothing claimed — so name the EXISTING test that does: `handoffStore.test.ts`'s retire describe has a "consumed" case (grep `"consumed"`); it must go red with `expected 'claimed' to be 'consumed'`. If no test goes red, add one that claims then retires with `save-success` and asserts `consumed`. Revert. Report the union's 8 members and the typecheck-clean census.

---

### Task 4: THE MOVE — the persistence half leaves `monitorRun.ts`, and its tests move or die

**Opus.** This is the compile-coupled task: deleting `saveMonitorRun`/`clearMonitorRun` and moving `loadMonitorRun`/`MONITOR_RUN_KEY`/`connectGuardStage` breaks every importer at once, so the whole re-point lands in one commit.

**The author has paste-tested the PRODUCTION half of this task together with Task 3's** (they overlap in `ConnectAction.tsx`, so one patch carries both): `scratchpad/patches/task3+4-production.patch` in the controller's scratchpad, handed over with the dispatch. Against the baseline it typechecks with ZERO non-test errors, lints clean, and measures `grep -cE '^export (function|const) '` → `9` + `18` = 27. Apply it with `git apply --3way` on top of Task 3's commit (Task 3's hunks are already in; expect its `ConnectAction.tsx`/`handoffStore.ts`/`JustRow.tsx` hunks to need a hand-merge), then READ the result against Step 3 below — the step is the authority, the patch is the shortcut. Two things Step 3's prose omitted that the patch has: `monitorRun.ts` loses the `import { isPlainRecord }` Task 1 added (its only consumers moved), and `ConnectAction.tsx` adds `connectGuardStage, type ConnectGuardStage` to its existing `./handoffStore` import (it had a separate `./monitorRun` import for them, now deleted). **One more edit in this task (lens 2):** `src/test/seedHandoff.ts` declares `SeededRef { sessionKey; revision }`, a second spelling of the `HandoffRef` Task 3 exported — replace it with `import type { HandoffRef } from "../monitor/handoffStore"` (a type-only import; the dynamic-import argument does not apply to types).

**Files:**
- Modify: `app/src/monitor/handoffStore.ts` (absorbs), `app/src/monitor/monitorRun.ts` (sheds `:28`, `:453-720` persistence half, `:1484-1612` `sessionRunState`/`monitorRunState`/`anyLiveSession`, `:1614-1719` `connectGuardStage`; `measuredSessionSeconds` becomes the function)
- Modify: `app/src/monitor/handoffStore.test.ts` (gains the tests that move), `app/src/monitor/monitorRun.test.ts` (loses them), `app/scripts/handoffStoreBoundary.test.ts` (extended)
- Modify every importer of a moved symbol — the list at baseline (`grep -rnE 'from "(\./|\.\./monitor/)monitorRun(\.js)?"' src e2e -B8 | grep -E 'loadMonitorRun|clearMonitorRun|MONITOR_RUN_KEY|saveMonitorRun|anyLiveSession|connectGuardStage|ConnectGuardStage|measuredSessionSeconds|interruptedTotalSeconds'`): `justrow/JustRow.tsx`, `monitor/ConnectAction.tsx`, `monitor/ConnectAction.test.tsx`, `monitor/burstReplay.test.ts`, `monitor/handoffStore.test.ts`, `monitor/handoffStoreReplay.test.ts`, `monitor/liveDropSeamReplay.test.ts`, `monitor/partialReplay.test.ts`, `monitor/summaryHoldReplay.test.ts`, `monitor/useMonitorSession.test.ts`, `session/logDraft.test.ts`, `session/LogSession.test.tsx`, `session/ReviewSession.test.tsx`, `session/summaryModel.ts`, `session/useStartWorkout.test.tsx`, `today/Today.test.tsx`, `today/Today.tsx`, `workout/WorkoutDetail.connectedRecovery.test.tsx`, `workout/WorkoutDetail.postReleaseCommit.test.tsx`, `workout/WorkoutDetail.programDropped.test.tsx`, `workout/WorkoutDetail.test.tsx` — re-run the grep, the list is the command's output, not this paragraph.
- `todayGuard.pin.test.ts` is Task 6's — but this task MUST update its import-line constant minimally (assertion 2) so the suite is green at this commit; Task 6 rewrites the file properly.

**Interfaces:**
- Produces: `loadMonitorRun()`, `connectGuardStage()`, `type ConnectGuardStage`, `MONITOR_RUN_KEY` from `handoffStore.ts`; `measuredSessionSeconds` as the function in `monitorRun.ts`.

**The importer census, measured with the production patch applied and Task 3's test fixes NOT yet made** (so it includes Task 3's residue): `pnpm exec tsc -b` → errors in 20 test files — `handoffStore.test.ts` 24, `useMonitorSession.test.ts` 16, `LogSession.test.tsx` 8, `monitorRun.test.ts` 7, `ConnectAction.test.tsx` 5, `Today.test.tsx` 4, and 1-2 each in `burstReplay`, `handoffStoreReplay`, `liveDropSeamReplay`, `partialReplay`, `summaryHoldReplay`, `nfc/useNfcEntry`, `logDraft`, `ReviewSession`, `useStartWorkout`, `ConnectedInterstitial`, `WorkoutDetail.connectedRecovery`, `WorkoutDetail.postReleaseCommit`, `WorkoutDetail.programDropped`, `WorkoutDetail`. The typecheck is the census.

- [ ] **Step 1: Failing tests in `handoffStore.test.ts` (red: the symbols do not exist on the store yet)**

Add a `describe("loadMonitorRun — the raw durable read the Today guard needs (Phase MD PR 1)")` — **paste-tested by the author as a standalone file (`scratchpad/patches/task4-loadMonitorRun-tests.ts`, 6/6 green against the moved store); fold its six `it`s into `handoffStore.test.ts` using that file's `store`/`freshRun` fixtures** (the standalone used `MONITOR_RUN_SHAPES[0].run` for want of `freshRun`). The sixth `it` — `connectGuardStage` staging `"unlogged"` for a memory-only entry after a denied write — is the P1-1 hole the old boolean parameter closed; it goes in with the other five, not only if mutation 3 needs it:

```ts
describe("loadMonitorRun — the raw durable read the Today guard needs (Phase MD PR 1)", () => {
  it("reads the DURABLE tier only: after a denied durable write the store still holds the entry, and loadMonitorRun says null", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const run = freshRun("2026-08-05T12:00:00.000Z");
    const result = store.commit(run.startedAt, null, run);
    expect(result.accepted && result.verdict).toBe("failed");
    expect(store.currentUnretired()).not.toBeNull();
    expect(store.loadMonitorRun()).toBeNull();
  });

  it("returns the parsed record for bytes the writer produced, and null for nothing", () => {
    expect(store.loadMonitorRun()).toBeNull();
    const run = freshRun("2026-08-05T12:00:00.000Z");
    store.commit(run.startedAt, null, run);
    expect(store.loadMonitorRun()).toStrictEqual(JSON.parse(JSON.stringify(run)));
  });

  it("returns null for garbage JSON and LEAVES THE BYTES ALONE (§8: a read destroys nothing)", () => {
    localStorage.setItem(store.MONITOR_RUN_KEY, "{not json");
    expect(store.loadMonitorRun()).toBeNull();
    expect(localStorage.getItem(store.MONITOR_RUN_KEY)).toBe("{not json");
  });

  it("returns null when the GETTER throws — denial reads as absent, nothing cleared, nothing thrown", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(() => store.loadMonitorRun()).not.toThrow();
    expect(store.loadMonitorRun()).toBeNull();
  });

  it("strips a malformed `series` before validating, so the rest of a good record still loads", () => {
    const run = freshRun("2026-08-05T12:00:00.000Z");
    localStorage.setItem(
      store.MONITOR_RUN_KEY,
      JSON.stringify({ ...run, series: "not a series" }),
    );
    expect(store.loadMonitorRun()).toStrictEqual(JSON.parse(JSON.stringify(run)));
  });

  it("connectGuardStage reads the store: a memory-only entry (denied write) still stages 'unlogged' — the P1-1 hole the old boolean parameter closed", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const run = freshRun("2026-08-05T12:00:00.000Z");
    store.commit(run.startedAt, null, run);
    expect(store.connectGuardStage()).toBe("unlogged");
  });

  it("a denied GETTER is receipted, not silently read as absent — the same storage-getter-error hydration emits", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(store.loadMonitorRun()).toBeNull();
    expect(receiptsOfKind("storage-getter-error")).toHaveLength(1);
  });
});
```

Then MOVE (cut from `monitorRun.test.ts`, paste into `handoffStore.test.ts`, adapt `saveMonitorRun(x)` → `store.commit(x.startedAt, null, x)` and `loadMonitorRun()` → `store.loadMonitorRun()`, `MONITOR_RUN_KEY` → `store.MONITOR_RUN_KEY`) these `monitorRun.test.ts` cases, because each asserts a READER behaviour no existing store test covers (checked against the describe list at `handoffStore.test.ts:836` "hydration" — which covers garbage JSON, unknown version and getter throw at HYDRATION, not through `loadMonitorRun`):
- `:200` rejects a record whose mode is a value this build does not know
- `:244` unknown version leaves BOTH its own bytes and a SessionRun untouched
- `:256`, `:264`, `:270`, `:276`, `:282`, `:356`, `:366`, `:380`, `:432`–`:502` — the shape-rejection cases (fold the `it`s that differ only in the field into ONE `it.each` over `[field, badValue]`, keeping every field)
- `:309` a v1 record with no logSeed loads
- `:534` `MONITOR_RUN_KEY` / `RUN_KEY` are distinct keys
- `:541`, `:561` partial round-trips and unknown-key tolerance

Move `connectGuardStage`'s describe (`:1308-1415`) whole, dropping the two `DISAGREES` tests (`:1387`, `:1394` — their subject is deleted), and rewrite every seed: `saveMonitorRun(x)` → `store.commit(x.startedAt, null, x)`, and every call `connectGuardStage(loadMonitorRun() !== null)` → `store.connectGuardStage()`. The `saveRun(...)` seeds for the phone record stay as they are.

DELETE (do not port) from `monitorRun.test.ts`:
- `:162`, `:180`, `:209`, `:215`, `:426`, `:1677`, `:1686`, `:1695`, `:1704` — round-trips through `saveMonitorRun`; Task 0's gate now owns byte identity through the real writer, and `handoffStore.test.ts:157` already round-trips the free row.
- `:229`, `:233`, `:404` — duplicated by the new `loadMonitorRun` describe above.
- `:512` (`clearMonitorRun`), `:519` (`saveMonitorRun` never throws), `:530` (exposes the key), and the whole `saveMonitorRun: the sacrifice` describe (`:1777-1855`) — the sacrifice ordering is `performDurableWrite`'s and `handoffStore.test.ts:381` "durable bookkeeping" already drives it (confirm with `grep -n 'saved-without-series' src/monitor/handoffStore.test.ts` → several hits).
- `:1719`, `:1739`, `:1753`, `:1766` — `stripMalformedSeries` through the loader: covered by the new "strips a malformed series" case plus hydration's own; if the hydration describe lacks the "samples is an object" case, move `:1739` instead of deleting it.
- The whole `anyLiveSession` describe (`:1226-1307`): 12 cases die with the function (spec §7).
- `S4` (`:1856-1947`): keep, but its writes go through `JSON.stringify` directly — read it; if it calls `saveMonitorRun`, replace with `JSON.stringify(run)` timing (the subject is serialisation cost, not the writer).

After the cut, `monitorRun.test.ts`'s imports lose `saveMonitorRun`, `loadMonitorRun`, `clearMonitorRun`, `anyLiveSession`, `connectGuardStage`, `MONITOR_RUN_KEY`, and `interruptedTotalSeconds` becomes `measuredSessionSeconds` (7 references, `:27`, `:1556`, `:1586`, `:1600`, `:1609`, `:1610`, `:1614`, `:1649`). Its header comment at `:1289` (the circular-import note) is deleted.

- [ ] **Step 2: Extend the boundary gate (red until Step 3)**

In `app/scripts/handoffStoreBoundary.test.ts`:
- `SRC_ALLOWLIST` (`:119-133`): delete the `"src/monitor/monitorRun.ts"` entry and its comment, leaving `new Set<string>([])` with a comment: `// Empty since Phase MD PR 1: the legacy writers are gone and monitorRun.ts holds no storage call. An entry added here re-opens the invariant this gate closes (RF21).`
- Replace the `it("monitorRun.ts holds EXACTLY the three sanctioned raw key operations …")` test (`:536-560`) with:

```ts
  // Phase MD PR 1: the persistence half moved into the store, so the
  // pure-builder module must contain NO storage access at all — not the
  // key, not the identifier, not the global. Stronger than the old count
  // of three, and a count of zero is the one value a re-added writer
  // cannot hide behind.
  it("monitorRun.ts holds ZERO storage references — no `localStorage`, no MONITOR_RUN_KEY, no key literal (Phase MD PR 1)", () => {
    const source = stripComments(
      readFileSync(join(APP_ROOT, "src/monitor/monitorRun.ts"), "utf8"),
    );
    expect(source).not.toMatch(/localStorage/);
    expect(source).not.toMatch(new RegExp(`\\b${KEY_IDENTIFIER}\\b`));
    expect(source).not.toContain(KEY_LITERAL);
  });

  // The store is skipped by the offender loop, so its OWN raw operations
  // need a count the way monitorRun.ts's used to: every localStorage call
  // in the store goes through the three safe* wrappers, and nothing else.
  it("handoffStore.ts touches localStorage ONLY inside safeGetItem/safeSetItem/safeRemoveItem — three call sites, one per wrapper", () => {
    const source = stripComments(
      readFileSync(join(APP_ROOT, STORE_FILE), "utf8"),
    );
    // Every mention, not only the three method forms — `.clear()`, a bracket
    // access or an alias would evade a method-name count (lens 2).
    expect(source.match(/\blocalStorage\b/g)).toHaveLength(3);
    // …and each mention is the one inside its wrapper, so a raw call that
    // replaced a wrapper's own keeps the count and still fails.
    expect(source).toContain("safeStorageOp(() => localStorage.getItem(key))");
    expect(source).toContain(
      "safeStorageOp(() => localStorage.setItem(key, value))",
    );
    expect(source).toContain(
      "safeStorageOp(() => localStorage.removeItem(key))",
    );
  });
```

- The `LEGACY_WRITER_CALL` regex (`:192`) stays — its detector self-test at `:765` exercises it against synthetic source, and a re-added `saveMonitorRun(` anywhere in production `src/` is exactly what it should still catch.
- The module-scope-binding test (`:596`) is unchanged: `STORE_FILE` is still `src/monitor/handoffStore.ts` (one file — spec §10's open question, ruled here: the boundary gate's `STORE_FILE`/exemption constrain a split to cost two constants and a second exemption for nothing; the absorbed half is ~150 lines).
- Header comment at `:105-118` (the NARROWED paragraph about `monitorRun.ts` holding sanctioned writes): rewrite to say the file now holds none and the count test asserts zero.

**The boundary patch carries the two tests and the allowlist entry removal ONLY — the comment rewrites below are yours** (the empty `Set` still carries the old 11-line "Kept, not deleted…" justification, and the header paragraph still names the deleted "EXACTLY the three" test; both are false after this task). Run: `pnpm test --project unit` → the first new test red (monitorRun.ts still has `localStorage`); the second is green already (the store has exactly three raw calls, one per wrapper — measured). **Measured after Step 3: `Tests 25 passed (25)`** (24 before, one replaced, two added). The exact edit is `scratchpad/patches/task4-boundary-test.patch`.

- [ ] **Step 3: The move**

In `handoffStore.ts`, immediately after the `safeRemoveItem` helper (`:268`), add the absorbed half. `MONITOR_RUN_KEY` moves to the top of the file's constants (replace the `./monitorRun.js` import at `:63-70` with `import type { MonitorRun } from "./monitorRun.js";` and add `import { loadRun } from "../session/run";`):

```ts
export const MONITOR_RUN_KEY = "ergomatic.monitorRun";
```

Then, after the safe helpers:

```ts
// ---------------------------------------------------------------------
// The durable record's validators and its raw read (Phase MD PR 1: moved
// here from `monitorRun.ts` so the module that WRITES the key is the one
// that says what a valid record is; the builders over there have no
// storage call left). Every doc comment below travelled with its function.
// ---------------------------------------------------------------------

function hasValidSeries(value: Record<string, unknown>): boolean {
  const series = value.series;
  return (
    series === undefined ||
    (isPlainRecord(series) && Array.isArray(series.samples))
  );
}

function stripMalformedSeries(
  value: Record<string, unknown>,
): Record<string, unknown> {
  if (hasValidSeries(value)) return value;
  const { series: _series, ...withoutSeries } = value;
  return withoutSeries;
}

function isMonitorRun(value: unknown): value is MonitorRun {
  // ... the body from monitorRun.ts:510-597, VERBATIM, comments included
}

/** JSON → stripped → validated, or null. The ONE parse both readers share:
 *  `ensureHydrated` (which additionally records the malformed state and
 *  receipts it) and `loadMonitorRun` (which does neither — a raw read). */
function parseDurableRun(raw: string): MonitorRun | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const candidate = isPlainRecord(parsed) ? stripMalformedSeries(parsed) : parsed;
  return isMonitorRun(candidate) ? candidate : null;
}

/** The raw durable read — `Today.tsx`'s cold-start guard needs a
 *  synchronous, un-hydrated, always-fresh read of the BYTES (its pin,
 *  `todayGuard.pin.test.ts`, says why), so this never consults `current`
 *  and never triggers hydration. Garbage, an unknown shape, or a denied
 *  getter all read as `null` (the denied getter is receipted); NOTHING is
 *  cleared on any path (§8). The
 *  full history of why the read destroys nothing lives in `Today.tsx`'s
 *  guard comment and the hand-off design spec §8. */
export function loadMonitorRun(): MonitorRun | null {
  const raw = safeGetItem(MONITOR_RUN_KEY);
  if (!raw.ok) {
    // Denied, not absent — receipted the way hydration receipts the same
    // failure, so a guard that then discards a draft leaves a record of
    // WHY it saw nothing (RF25: the owner of "what does Today do when the
    // origin denies storage" is the receipt channel, not this reader).
    emit({ kind: "storage-getter-error", operation: "get" });
    return null;
  }
  if (raw.value === null) return null;
  return parseDurableRun(raw.value);
}
```

Carry the doc comments: `hasValidSeries`'s (`:460-466`), `stripMalformedSeries`'s (`:468-490`, minus the sentence about "the next `saveMonitorRun` call overwrites it" — reword to "the next landed `performDurableWrite`"), `isMonitorRun`'s two "Task 2: EXPORTED for handoffStore.ts" lines are DROPPED (no longer true). `loadMonitorRun`'s old 40-line comment is replaced by the one above; its "THE GETTER IS INSIDE THE GUARD TOO" paragraph is now a property of `safeGetItem` and needs no repeating.

Rewrite `ensureHydrated`'s parse (`:491-508`) to use the shared function:

```ts
  const candidate = parseDurableRun(raw.value);
  if (candidate === null) {
    durableMalformed = true;
    emit(malformedReceipt(raw.value));
    return;
  }
```

(the two former branches — JSON failure and shape failure — did the identical thing.)

`connectGuardStage` moves to the END of `handoffStore.ts` (after `resetForTests`; the namespace object at `:1002-1016` is DELETED — its three consumers `today/Today.test.tsx:3170` and `session/LogSession.test.tsx:6364`, `:6482` destructure `commit` from the dynamic import instead of `handoffStore`):

```ts
/** What a Connect press has to warn about before it is allowed through, or
 *  `null` when nothing is at risk. [carry the rest of the doc comment from
 *  monitorRun.ts:1608-1613 verbatim] */
export type ConnectGuardStage = "unlogged" | "in-progress" | null;

/**
 * The Connect guard (7B, spec §3 — "the F5 walk, closed"). [carry
 * monitorRun.ts:1616-1703's doc comment, with THREE edits: (1) every
 * "`anyLiveSession()` directly above" → "the deleted `anyLiveSession()`
 * (see the anti-pattern note below)"; (2) delete the final paragraph
 * "**Hand-off store design spec section 5, plan Task 5 -- the
 * `MonitorRun` check now takes its answer as a PARAMETER…**" entirely —
 * its whole reason (the circular import) is gone; (3) append the
 * paragraph below.]
 *
 * **The anti-pattern this guard exists to avoid — formerly
 * `anyLiveSession()`, deleted in Phase MD PR 1 (James's ruling, spec §7).**
 * That helper collapsed both records to a live/not-live answer and so
 * returned `"none"` for a finished-but-unlogged record — the exact record
 * F5 destroyed (ROADMAP M-1, quoted above). Its nine-cell truth table and
 * twelve tests died with it. The rule it was the counter-example for
 * stands: a guard that protects an unlogged record reads that record
 * DIRECTLY and asks about unlogged specifically. `Today.tsx`'s cold-start
 * guard (`todayGuard.pin.test.ts`) and this function are the two live
 * examples.
 *
 * **Phase MD PR 1: this function reads the store itself.** It lives in the
 * store now, so the boolean its callers used to compute for it — because
 * the reverse import was circular — is gone. Sold honestly: both callers
 * (`ConnectAction.tsx`'s `handleEntry`, `JustRow.tsx`'s `handleStart`)
 * still call `currentUnretired()` themselves for `setUnsavedCount`, so the
 * count the rower sees and the decision to stage come from two reads of
 * the same in-memory entry rather than one. That is consistent with the
 * existing double read of `loadRun()` here and in those callers, not a
 * simplification.
 */
export function connectGuardStage(): ConnectGuardStage {
  const run = loadRun();
  if (run !== null) {
    return run.completedAt === null ? "in-progress" : "unlogged";
  }
  if (currentUnretired() !== null) {
    // A MonitorRun visible at a Connect door is dead: the connected
    // session lives on WorkoutDetail's surface and reload/navigation
    // tears it down. "In progress" would assert machine state we do
    // not have (spec 2b, exit criterion 5).
    return "unlogged";
  }
  return null;
}
```

In `monitorRun.ts`: delete `:28` (the key), `:447-452` (already gone in Task 1), `:459-720` (validators, `saveMonitorRun`, `loadMonitorRun`, `clearMonitorRun`), `:1486-1612` (`RecordState`, `sessionRunState`, `monitorRunState`, `anyLiveSession`), `:1614-1719` (`ConnectGuardStage`, `connectGuardStage`). Rename `interruptedTotalSeconds` → `measuredSessionSeconds` at `:1458` and delete the alias at `:1484` — MERGE the alias's doc comment (`:1462-1483`, which explains why the name is right) into the function's own. Delete `import { clearRun, loadRun } from "../session/run";` only if `loadRun`/`clearRun` have no remaining use in the file (`createMonitorRun` calls `clearRun()` — keep that import, drop `loadRun`). Then sweep the file's COMMENTS: `grep -n 'saveMonitorRun\|loadMonitorRun\|clearMonitorRun\|anyLiveSession\|connectGuardStage\|MONITOR_RUN_KEY\|localStorage' src/monitor/monitorRun.ts` — each hit is reworded to name where the thing lives now (`handoffStore.ts`), or, for `saveMonitorRun`, to past tense ("the deleted `saveMonitorRun`"). The header comment (`:1-20`) says "best-effort IO that never throws, and a `clear*` that removes the key outright" — rewrite that sentence: the record type and its pure builders live here; persistence is `handoffStore.ts`'s.

Re-point every importer (the grep in Files). `Today.tsx:45-50` becomes:

```ts
import {
  hydrate as hydrateHandoff,
  loadMonitorRun,
  read as readHandoff,
  type HandoffEntry,
} from "../monitor/handoffStore";
```

and `todayGuard.pin.test.ts:86-91`'s two `toContain` constants are updated to match (assertion 1's guard block is untouched; delete assertion 2's old `import { loadMonitorRun } from "../monitor/monitorRun";` line). `JustRow.tsx:10-17` and `ConnectAction.tsx:9` import `connectGuardStage`/`ConnectGuardStage` from `./handoffStore`/`../monitor/handoffStore` and drop the argument at `JustRow.tsx:663` and `ConnectAction.tsx:217`. `summaryModel.ts:102` keeps its name. Every test file: `MONITOR_RUN_KEY`/`loadMonitorRun` from the store; `clearMonitorRun(...)` → `localStorage.removeItem(MONITOR_RUN_KEY)` (12 test call sites: `grep -rn 'clearMonitorRun(' src --include='*.test.*'`); `LogSession.test.tsx:5197`, `:5210` → `connectGuardStage()`.

- [ ] **Step 4: Gates, commit**

```bash
pnpm typecheck && pnpm lint
pnpm test --project unit && pnpm test --project client
grep -rn 'saveMonitorRun(\|clearMonitorRun(\|anyLiveSession\|monitorRunState' src e2e scripts   # must be EMPTY for call sites; comment hits listed in the report
grep -cE '^export (function|const) ' src/monitor/monitorRun.ts src/monitor/handoffStore.ts   # prints two per-file counts: expected 9 and 18 (sum 27)
git rev-parse --show-toplevel
git add -A src scripts
git commit -m "Move the stored run's persistence half into the store; delete the writer production never called"
```

Mutations (commit first, `git log -1`), **all three measured by the author in the scratch tree:** (1) in `loadMonitorRun` replace the WHOLE body (`safeGetItem` … `parseDurableRun`) with `ensureHydrated(); return current?.run ?? null;` — the "reads the DURABLE tier only" test fails (`expected { v: 2, … } to be null`) and the "returns the parsed record" test fails too (memory holds the reference, not the JSON copy). *A weaker mutant that keeps the `raw.value === null` early return is caught ONLY by the second test — the durable-only test never reaches the fallback when no bytes exist; use the whole-body form.* (2) in `monitorRun.ts` append `const _probe = localStorage.getItem("x"); void _probe;` at module scope (compiles) — the boundary gate's ZERO-references test fails (`not to match /localStorage/`, `1 failed | 24 passed`). (3) in `connectGuardStage` swap `currentUnretired() !== null` for `loadMonitorRun() !== null` — the memory-only `it` fails (`expected null to be 'unlogged'`, `1 failed | 5 passed`). Revert each.

Report: the export census (both lists, before and after — spec §9.3), which `monitorRun.test.ts` cases moved / died / stayed with counts, the comment sweep hits, all three mutation outputs.

---

### Task 5: Reword the six comments that name `saveMonitorRun`, and the citers of `anyLiveSession`

**Files:**
- Modify: `src/you/concept2Seen.ts:11` and `:42`, `src/monitor/handoffStore.ts` (`:86`, `:537`, `:953` — line numbers at baseline; re-grep), `src/monitor/useMonitorSession.ts:2408`, `e2e/connected.spec.ts:1616`; `src/monitor/ConnectAction.tsx:67-69`, `src/session/useStartWorkout.ts:138`, `src/today/Today.tsx:407-421`, `src/workout/WorkoutDetail.test.tsx:856`, `src/monitor/useMonitorSession.ts:19-21`, `src/monitor/useMonitorSession.ts:3237-3239`

Spec §9.1: call sites, not the bare string — these are history and get REWORDED, not deleted.

- [ ] **Step 1: Each site, one sentence**

- `concept2Seen.ts:11` "`localStorage` is the store this WebView already writes from (`monitor/monitorRun.ts`'s `saveMonitorRun`)" → "(`monitor/handoffStore.ts`'s `commit`)". `:42` "the opposite of RF25/AUD-016's `saveMonitorRun`" → "the opposite of RF25/AUD-016's old `saveMonitorRun` (deleted in Phase MD PR 1; the store's `commit` reports its verdict instead)".
- `handoffStore.ts:86` "ported verbatim from `monitorRun.ts`'s old `saveMonitorRun`" → stands as written (it is past tense already); `:537` "ported verbatim from `monitorRun.ts`'s retired `saveMonitorRun` (Task 3 removes that function's own copy once its callers move onto this store)" → "ported verbatim from `monitorRun.ts`'s `saveMonitorRun`, which Phase MD PR 1 deleted — this is now the ONLY copy of the sacrifice ordering (spec §3 invariant 3)"; `:953` "a stateless, unconditional `saveMonitorRun` overwrite" → stands (describes the OLD `createMonitorRun`).
- `useMonitorSession.ts:2408` "re-serialized `runRef.current` through `saveMonitorRun` a SECOND time" → stands (history of #230). `:19-21` "`anyLiveSession()` has no production consumer, and the first one inherits…" → "`anyLiveSession()` (deleted in Phase MD PR 1) had no production consumer; the live/live tie-break it carried is gone with it, and this hook tracks its own record". `:3237-3239` "a circular import with `handoffStore.ts`" → "the store owns persistence (Phase MD PR 1); the builder stays pure".
- `e2e/connected.spec.ts:1616` "The mocked-throw unit leg (`monitorRun.test.ts`'s own `saveMonitorRun` suite) proves the CATCH/RETRY logic" → "(`handoffStore.test.ts`'s durable-bookkeeping suite drives `performDurableWrite`'s sacrifice)".
- `ConnectAction.tsx:67-69`, `useStartWorkout.ts:138`, `Today.tsx:407-421`, `WorkoutDetail.test.tsx:856`: each "rather than through `anyLiveSession()`" → "rather than through a live-only collapsing helper (the deleted `anyLiveSession()` — `connectGuardStage`'s doc comment in `handoffStore.ts` keeps the anti-pattern's record)". `Today.tsx:416-418`'s "the THIRD legacy `loadMonitorRun()` read the review named alongside `monitorRunState()`/`anyLiveSession()`" → "the ONE surviving raw `loadMonitorRun()` read (its two legacy siblings, `monitorRunState()`/`anyLiveSession()`, were deleted in Phase MD PR 1)".

- [ ] **Step 2: Gates and commit**

```bash
grep -rn 'anyLiveSession\|monitorRunState' src e2e scripts | grep -v 'deleted in Phase MD\|the deleted'   # every remaining hit must be a past-tense reference; list them
pnpm lint && pnpm typecheck
git rev-parse --show-toplevel && git add -A src e2e && git commit -m "Reword the comments that cited the deleted writer and the deleted guard helper"
```

No mutation — comment-only.

---

### Task 6: Rewrite `todayGuard.pin.test.ts` so all three assertions still bite

**Opus.** Spec §7/§8. After Task 4 the file's assertion 2 pins the new import line and assertion 3 (`not.toMatch(/import\s*\{[^}]*\banyLiveSession\b/)`) can NEVER fail — the symbol does not exist (RF21).

**Files:**
- Modify: `app/src/today/todayGuard.pin.test.ts` (whole file), `app/src/monitor/handoffStore.test.ts` (one test)

- [ ] **Step 1: The rewritten pin**

Replace the second `it` (`still reads the monitor record DIRECTLY, never through anyLiveSession()`) with two:

```ts
  it("imports loadMonitorRun from the STORE (Phase MD PR 1 moved it) beside the store's own hydrate/read — the raw read and the hydrated read are deliberately two different calls", () => {
    // Phase MD PR 1: `loadMonitorRun` lives in `handoffStore.ts` now, so
    // this screen's monitor imports collapse to one line. The guard block
    // above is byte-identical to before the move — only the import moved.
    expect(source).toContain(
      'import {\n  hydrate as hydrateHandoff,\n  loadMonitorRun,\n  read as readHandoff,\n  type HandoffEntry,\n} from "../monitor/handoffStore";',
    );
    expect(source).not.toMatch(/from "\.\.\/monitor\/monitorRun"/);
  });

  it("the guard's raw read is the ONLY loadMonitorRun call in this screen, and it is inside the pinned block — every other monitor read here goes through the store's hydrated tier", () => {
    // Replaces the old negative pin on an `anyLiveSession` import, which
    // could never fail once that helper was deleted (RF21). The rule it
    // protected — Today's cold-start guard reads the DURABLE BYTES,
    // synchronously and un-hydrated, and asks about a live record
    // specifically — is bound here to the call itself: exactly one raw
    // read in the file, and it is the pinned one. Re-routing the guard
    // through `readHandoff()` fails this AND the byte pin above; adding a
    // second raw read anywhere in the screen fails this alone.
    // Comments in Today.tsx mention the call in backticks (four
    // occurrences of `loadMonitorRun(` at baseline, ONE of them code); a
    // call is never preceded by a backtick or an identifier character, so
    // those are excluded — measured, not assumed.
    const calls = source.match(/(^|[^`\w])loadMonitorRun\(\)/gm) ?? [];
    expect(calls).toHaveLength(1);
    expect(PINNED_GUARD).toContain("loadMonitorRun()");
  });
```

Rewrite the file's header comment: keep the 7B history, add one paragraph: "Phase MD PR 1 (2026-09-12): `anyLiveSession` was deleted, `loadMonitorRun` moved into the store, and the negative import pin was replaced by the call-count pin below because a pin on a symbol that cannot exist cannot fail."

- [ ] **Step 2: The store-side half of the rule**

The pin binds Today to a raw read; the store must keep `loadMonitorRun` RAW. Task 4's "reads the DURABLE tier only" test is that gate. Add to its `it` title the cross-reference: `… (todayGuard.pin.test.ts binds the caller; this binds the callee)`.

- [ ] **Step 3: Run, commit, prove red under spec §8's mutation**

```bash
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/today/todayGuard.pin.test.ts
git rev-parse --show-toplevel && git add src/today/todayGuard.pin.test.ts src/monitor/handoffStore.test.ts && git commit -m "Rebind Today's guard pin to the rule, not to a symbol that no longer exists"
git log -1 --oneline
```

**Paste-tested by the author (`scratchpad/patches/task6-pin.patch`, 4/4 green against the moved import).** Mutation A (spec §8's): in `Today.tsx` change the guard's `const monitorRun = loadMonitorRun();` to `const monitorRun = readHandoff()?.run ?? null;` (compiles; `readHandoff` is already imported). **Measured:** three tests fail — the byte pin, the call-count test (`expected [] to have a length of 1`), and the occurs-once pin. Mutation B: add a second `loadMonitorRun();` statement OUTSIDE the pinned block (e.g. inside `UnloggedMonitorRow`'s body — NOT at the top of the guard's own `useEffect`, which also breaks the byte pin). Expected: ONLY the call-count test fails (`got 2`). Revert both; record both messages.

---

### Task 7: Bookkeeping, the full gate, the PR

**Files:**
- Modify: `ROADMAP.md` (three edits), `docs/superpowers/specs/2026-09-12-stored-run-module-design.md` (§4 note on `clearMonitorRun`, one paragraph), `app/src/monitor/handoffStore.ts` header comment (`:1-55`) — the module's own description now includes the validators, the raw read and the Connect guard.

- [ ] **Step 1: ROADMAP**

1. `## The free row's rate tile disagrees with itself` (`ROADMAP.md:472`): Status line → `**Status: DONE — fixed and merged in #402 (2026-09-12). Closed on Phase MD PR 1's branch on the way past.** S.` Keep the body (it is the record).
2. `## Phase MD` PR 1 row: tick `- [x]` and append `**LANDED as PR #<n>** — one file, 27 exports (from 35), `clearMonitorRun` deleted rather than moved (zero production callers; plan "The export count").`
3. `## Small, queued` `isPlainRecord` row: prefix `**DONE — folded into Phase MD PR 1 (James's rider, 2026-09-12): one export in `src/isPlainRecord.ts`, four call sites re-pointed.**`. Do NOT strike the row; James rules strikes at the hand-back.
4. `## Codebase-audit owners`, hand-off residual 1: append `**Landed in Phase MD PR 1 (#<n>); proposed for STRIKE at that PR's hand-back.**`
5. `## Phase MD` **Exploration A** row: append the verdict paragraph from `docs/superpowers/audits/2026-09-12-architecture-walk/exploration-a-freeze-observer.md` §B.3 ("**Exploration A — answered 2026-09-12: NO PR.** …", verbatim — it is already written as ROADMAP text), and change its `- [ ]` to `- [x]`. That report file rides this PR (it is already in the worktree, uncommitted until Task 7 commits it); its §B.4 riders (three one-line items) belong to PR 2 and are recorded in the controller's memory, not here.

- [ ] **Step 2: The full gate (RF1 — this diff touches `app/src/`)**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
pnpm test            # all three projects; integration needs Docker
pnpm test:coverage   # read the per-file numbers for handoffStore.ts, isPlainRecord.ts, seedHandoff.ts (RF2)
pnpm e2e             # the full suite, locally; read the result. Then read the e2e job on the PR too.
git status --short docs/screenshots   # must be EMPTY (spec §9.7); `git checkout -- docs/screenshots/` if not
```

Re-run Task 0's two mutations and Task 6's Mutation A against the FINAL tree (RF31/RF35: a fix is a claim and gets the gate the original got). Record the outputs.

- [ ] **Step 3: The PR**

`gh pr create` from `phase-md-pr1`. Body, James-first (CLAUDE.md "Write for James first"): line one "This PR makes `handoffStore.ts` the only module that touches the stored run, and makes every test fixture seed it the way production does." Then ≤6 bullets (what moved, what died, the seeding change, the retire cleanup, the two debt riders, tester impact = none). Then a collapsed `<details>` "Record (for agents and audits)" carrying: which module got deeper and what its interface now is (phase exit, ONE sentence at the top of the body); the export lists before/after (§9.3); the fixture-shape table and both Task 0 mutations verbatim (§9.4); the pin's two mutations (§9.5); the boundary-gate extension (§9.2); the comment-sweep list (§9.1); the `clearMonitorRun` deviation and the 8-not-9 reasons count (RF10); the lifetime table's headline (no new state); e2e run URL and conclusion; coverage per touched file. Then the hand-back: **Proposed to add** (none expected — say so) and **Now overdue** (`grep -n 'dies 2026' ROADMAP.md` → none earlier than today at baseline; re-check on the day). Then STOP — PM final-PR gate, then James.

---

## Self-review (done by the author before /harden)

- **Spec coverage:** §1 nothing to build; §2 census re-measured (8 reasons, not 9 — recorded); §3 invariants 1-5 → boundary gate (1), Task 0 (2), Task 4 single copy (3), `loadMonitorRun` tests (4), `retire` body unchanged in semantics (5); lifetime table → above; §4 every bullet → Tasks 1, 3, 4 (with the `clearMonitorRun` deviation stated); §5 → Task 0; §6 → 27 with the census command; §7 → Tasks 4, 5, 6; §8 → Tasks 2, 4, 6; §9 criteria 1-7 → Tasks 5, 4, 4, 0+7, 6, 7, 7; §10's three opens → ruled ("one file", the two `retire` sub-decisions, the table).
- **Placeholders:** the `isMonitorRun` body in Task 4 is prescribed as "VERBATIM from `:510-597`" rather than reprinted — 88 lines that must not change, and reprinting them is where a transcription error would hide. The implementer cuts and pastes.
- **Type consistency:** `HandoffRef`, `RetireReason`, `seedMonitorRun`, `parseDurableRun`, `connectGuardStage()` used with the same names and signatures in every task that names them.
