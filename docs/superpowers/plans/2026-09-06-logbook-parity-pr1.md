# Phase LP PR 1 — record + screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Read `.claude/agent-briefing.md` first; every commit runs `git rev-parse --show-toplevel` and confirms the worktree path.

**Goal:** keep every figure the PM5 already sends per split and per session, store it verbatim, and show it on machine rows — six hero tiles and a sideways-scrolling MACHINE SUMMARY table — with Concept2's arithmetic for the two figures the logbook derives.

**Architecture:** the 0x0038 decoder already yields the per-split fields; the driver keeps them on `IntervalActual` instead of dropping them, and `buildMonitorLogSteps` copies them onto `LogStep`. A new 0x003A parser yields the four session fields; the driver stashes them on the run and they ride the existing `summary-observations` event onto `MonitorRun.summaryDetail` → `machineSummary` jsonb. **No SQL migration:** per-split fields live in the `steps` jsonb and session fields in `machine_summary` jsonb, both already untyped and additive (a plan-level choice within spec §2's invariant — the spec's §2.2 said "four nullable columns"; the jsonb the row already carries is the same store with no deploy ordering; the spec is amended in Task 12). A pure module owns the two logbook derivations. The screen adds a second hero tier and a `MachineSummaryTable` under the INTERVALS list, on machine rows only.

**Tech Stack:** TypeScript, React 19, Vitest (unit/client), Playwright e2e, Express 5 + Drizzle (validation only, no migration), the PM5 BLE replay corpus in `docs/monitor/sessions/`.

**Spec:** `docs/superpowers/specs/2026-09-06-logbook-parity-design.md` (rev 2). The spec's §1.1 measured facts and §4.1 identities are this plan's oracles.

## Global Constraints

- Worktree `/Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/phase-lp-logbook-parity`; branch `phase-lp-logbook-parity`; base `origin/main` `534367df`.
- **Absence is `undefined`/`null`, never falsy — `0` is a value** (spec §2). Never `if (x)` on a calorie or watt.
- **Nothing derived is stored** (spec §2): watts and cal/hr are computed at render from stored integers; the wire's own `machineWatts`/`machineCalPerHour` are stored as provenance only.
- Watts = `Math.round(2.80 / (seconds / metres) ** 3)`; cal/hr = `Math.floor(calories * 3600 / seconds)` (spec §1.2, verified 6/6 against James's logbook row — those six values are the unit-test literals).
- The dash glyph is `DASH` from `src/workout/connected/surfaceModel.ts` (`—`), never `-`.
- No em-dashes in user-facing strings (house style); `DASH` as a data placeholder is exempt.
- Copy: `MACHINE SUMMARY`, `PM5 · PER INTERVAL`, tile labels `AVG WATTS · CALORIES · CAL / HR · RATE · TARGET · DRAG · REST`.
- Machine rows only: the tier and the table render only when the row is PM5-sourced; manual rows are unchanged.
- Test invocation: from `app/`, `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client <file>` (client) or `--project unit <file>` (domain/server). `pnpm e2e` rebuilds a Docker stack — run it once at the end, not per task.
- Every new assertion gets a mutation that makes it fail, recorded in the commit message (RF21).
- Commit after every task; `git rev-parse --show-toplevel` before each commit.
- **No device installs by anyone but the controller, and never without James's permission** (agent briefing).

---

## File map

| File | Responsibility |
| --- | --- |
| `app/domain/monitor/pm5/parse.ts` | `parseAdditionalSummary` (0x003A: calories, watts, rest metres, avg cal/hr); `toIntervalActual` keeps the 0x0038 fields |
| `app/domain/monitor/types.ts` | `IntervalActual` gains five optional fields; `summary-observations` detail carries `MachineSummaryDetail` (extended in `monitorRun.ts`) |
| `app/src/monitor/monitorRun.ts` | `MachineSummaryDetail` gains four optional fields |
| `app/src/monitor/driver.ts` | stash 0x003A on the run; include it in `summaryObservationsEvent`; bounded wait; summary-fallback arm omits the new fields |
| `app/src/session/recoveryValidation.ts` | validate the new optional numbers |
| `app/src/session/logDraft.ts` | `LogStep` gains five `machine*` keys; `buildMonitorLogSteps` copies them |
| `app/server/stores/logs.ts` | server `LogStep` mirror |
| `app/server/routes/data.ts` | integer bands for the five step keys and the four summary keys |
| `app/src/log/storedSummary.ts` | client `StoredLogStep`/`StoredLog.machineSummary` narrow view gains the keys; `buildHeroes` builds the tier |
| `app/src/session/logbookDerived.ts` (new) | `logbookWatts`, `logbookCalPerHour`, `sessionStrokeRate` |
| `app/src/session/summaryModel.ts` | also `agreedTargetSpm`, `MachineSplitRow`, `machineSplitRows`, `machineSplitRowsFromRun` |
| `app/src/session/summaryModel.ts` | `SummaryHeroes.machine` tier from a `MonitorRun`; `MachineSplitRow[]` for the table |
| `app/src/session/MachineSummaryTable.tsx` (new) | the sideways-scrolling strip |
| `app/src/session/PostWorkoutSummary.tsx` | render the tier and the strip |
| `app/src/log/FromTheLog.tsx` | render the tier and the strip for a stored row |
| `app/src/index.css` | `.summary-machine-tier`, `.machine-summary-*` |
| `app/src/monitor/transports/fake.ts` | real per-split values, not zeros |
| `app/src/monitor/logbookParityReplay.test.ts` (new) | cross-characteristic identities over the corpus |
| `app/e2e/design.spec.ts` | structural assertion for the strip |
| `docs/design/DEVIATIONS.md`, spec §2.2 amendment | record |

---

### Task 1: Decode 0x003A's calories, watts and average calories

**Files:**
- Modify: `app/domain/monitor/pm5/parse.ts` (beside `parseAdditionalSummaryRest`)
- Test: `app/domain/monitor/pm5/parse.test.ts`

**Interfaces:**
- Produces: `export interface AdditionalSummary { totalCalories: number; avgWatts: number; totalRestDistanceMeters: number; avgCalPerHour: number }` and `export function parseAdditionalSummary(bytes: Uint8Array): AdditionalSummary | null` (null when `bytes.length < 19`). Offsets from the BLE rev 1.30 table (`docs/monitor/pm5-interface-notes.md` §23) and confirmed by the corpus identities in spec §1.1: Total Calories `[8..9]` u16 LE, Watts `[10..11]` u16 LE, Total Rest Distance `[12..14]` u24 LE, Avg Calories `[17..18]` u16 LE. `[15..16]` (Interval Rest Time) is deliberately NOT returned (spec §1.1: reads 0 on 9/9 captures; undetermined).

- [ ] **Step 1: Write the failing test** (append to `parse.test.ts`; the file already imports from `./parse` — extend that import with `parseAdditionalSummary`)

```ts
describe("parseAdditionalSummary (0x003A)", () => {
  // Bytes 0-7 (log date/time, split type/size/count) are irrelevant here and
  // zeroed. Total Calories 372 = 0x0174 LE → [0x74, 0x01]; Watts 162 →
  // [0xa2, 0x00]; Total Rest Distance 274 = 0x000112 LE → [0x12, 0x01, 0x00];
  // Interval Rest Time (unread) [0x00, 0x00]; Avg Calories 858 = 0x035a →
  // [0x5a, 0x03].
  const frame = new Uint8Array([
    0, 0, 0, 0, 0, 0, 0, 0, 0x74, 0x01, 0xa2, 0x00, 0x12, 0x01, 0x00, 0x00,
    0x00, 0x5a, 0x03,
  ]);

  it("reads calories, watts, rest distance and avg cal/hr at the rev 1.30 offsets", () => {
    expect(parseAdditionalSummary(frame)).toStrictEqual({
      totalCalories: 372,
      avgWatts: 162,
      totalRestDistanceMeters: 274,
      avgCalPerHour: 858,
    });
  });

  it("returns null for a frame shorter than 19 bytes, never a partial object", () => {
    expect(parseAdditionalSummary(frame.subarray(0, 18))).toBeNull();
  });

  it("keeps 0 as a value: a zero-calorie frame reads 0, not null", () => {
    const zero = new Uint8Array(19);
    expect(parseAdditionalSummary(zero)?.totalCalories).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `app/`): `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project unit domain/monitor/pm5/parse.test.ts`
Expected: FAIL — `parseAdditionalSummary` is not exported.

- [ ] **Step 3: Implement** (place directly after `parseAdditionalSummaryRest`)

```ts
/**
 * 0x003A — C2 rowing end-of-workout additional summary 1, 19 bytes
 * (BLE rev 1.30 table, pm5-interface-notes.md §23). Phase LP reads the
 * four fields the logbook shows and we upload: Total Calories [8..9],
 * Watts [10..11], Total Rest Distance [12..14], Avg Calories [17..18].
 * Offsets 8-9 / 10-11 / 12-14 / 17-18 are each confirmed by an identity
 * we did not compute (per-split calories sum to [8..9] on 9/9 committed
 * captures; [10..11] is within 1 W of 2.80/pace³; [12..14] = 130 + 144 on
 * walk-2026-08-25/rests). Interval Rest Time [15..16] is NOT returned: it
 * reads 0 on every committed capture and its meaning is undetermined
 * (spec §1.1) — an unobserved field never ships as a stored value.
 */
export interface AdditionalSummary {
  totalCalories: number;
  avgWatts: number;
  totalRestDistanceMeters: number;
  avgCalPerHour: number;
}

export function parseAdditionalSummary(
  bytes: Uint8Array,
): AdditionalSummary | null {
  if (bytes.length < 19) return null;
  return {
    totalCalories: readU16LE(bytes, 8),
    avgWatts: readU16LE(bytes, 10),
    totalRestDistanceMeters: readU24LE(bytes, 12),
    avgCalPerHour: readU16LE(bytes, 17),
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Same command. Expected: PASS (3 new tests).

- [ ] **Step 5: Mutation — swap the calorie and watt offsets** (`readU16LE(bytes, 8)` → `readU16LE(bytes, 10)` for `totalCalories`), run, expect `expected 162 to be 372`-shaped failure; revert precisely (`git status` first — the file carries no other uncommitted work after Step 3's commit; commit before mutating).

- [ ] **Step 6: Commit**

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/phase-lp-logbook-parity && git rev-parse --show-toplevel
git add app/domain/monitor/pm5/parse.ts app/domain/monitor/pm5/parse.test.ts
git commit -m "LP PR1 T1: decode 0x003A calories, watts, rest distance, avg cal/hr

Mutation: calories read at offset 10 → 'expected 162 to be 372'; restored."
```

---

### Task 2: Keep the 0x0038 fields on `IntervalActual`

**Files:**
- Modify: `app/domain/monitor/types.ts` (`IntervalActual`)
- Modify: `app/domain/monitor/pm5/parse.ts` (`toIntervalActual`)
- Modify: `app/src/session/recoveryValidation.ts`
- Test: `app/domain/monitor/pm5/parse.test.ts`, `app/src/session/recoveryValidation.test.ts`

**Interfaces:**
- Produces on `IntervalActual` (all optional, absent when the frame lacked them): `calories?: number` (0x0038 `splitIntervalTotalCalories`), `calPerHour?: number` (`splitIntervalAvgCalories` — the PM5's own, provenance), `watts?: number` (`splitIntervalPowerWatts`), `dragFactor?: number` (`splitAvgDragFactor`), `restHeartRateBpm?: number | null` (`splitIntervalRestHeartRateBpm`; `null` = no belt reading).

- [ ] **Step 1: Failing test** (append to `parse.test.ts`, in the existing `toIntervalActual` describe if there is one; otherwise a new one — `RawPm5Status` fixtures already exist in this file; reuse the nearest one and spread over it)

```ts
it("toIntervalActual keeps the 0x0038 split fields the logbook shows", () => {
  const raw = {
    ...baseRaw(), // parse.test.ts's fully-populated RawPm5Status fixture (line ~603)
    splitIntervalNumber: 2,
    splitIntervalTimeSeconds: 313.5,
    splitIntervalDistanceMeters: 1200,
    splitIntervalAvgPace: 130.6,
    splitIntervalAvgStrokeRate: 27,
    splitIntervalWorkHeartRateBpm: 55,
    splitIntervalRestHeartRateBpm: null,
    splitIntervalTotalCalories: 73,
    splitIntervalAvgCalories: 840,
    splitIntervalPowerWatts: 157,
    splitAvgDragFactor: 101,
  } as RawPm5Status;
  const actual = toIntervalActual(raw);
  expect(actual.calories).toBe(73);
  expect(actual.calPerHour).toBe(840);
  expect(actual.watts).toBe(157);
  expect(actual.dragFactor).toBe(101);
  expect(actual.restHeartRateBpm).toBeNull();
});
```

(`baseRaw(overrides)` is the file's existing `RawPm5Status` builder; the `toIntervalActual` describe at ~line 787 is where this test goes.)

- [ ] **Step 2: Run — expect FAIL** (`calories` undefined).

- [ ] **Step 3: Implement**

`types.ts`, inside `IntervalActual` after `restDistanceMeters?: number;`:

```ts
  /** Phase LP — the 0x0038 fields the logbook shows, kept verbatim
   *  (spec §2.1). Absent when the frame did not carry them; `0` is a
   *  value. `calPerHour` and `watts` are the PM5's OWN figures, stored as
   *  provenance — the screen shows the logbook's derivation
   *  (`logbookDerived.ts`), which differs by ≤1 W and 24–78 cal/hr. */
  calories?: number;
  calPerHour?: number;
  watts?: number;
  dragFactor?: number;
  /** null = the belt reported nothing for the rest; absent = no frame. */
  restHeartRateBpm?: number | null;
```

`parse.ts` `toIntervalActual`, after `avgHeartRateBpm: raw.splitIntervalWorkHeartRateBpm,`:

```ts
    calories: raw.splitIntervalTotalCalories,
    calPerHour: raw.splitIntervalAvgCalories,
    watts: raw.splitIntervalPowerWatts,
    dragFactor: raw.splitAvgDragFactor,
    restHeartRateBpm: raw.splitIntervalRestHeartRateBpm,
```

`recoveryValidation.ts`, after the `actual.type` check inside the actuals loop:

```ts
    if (actual.calories !== undefined) requireFiniteNumber(actual.calories);
    if (actual.calPerHour !== undefined)
      requireFiniteNumber(actual.calPerHour);
    if (actual.watts !== undefined) requireFiniteNumber(actual.watts);
    if (actual.dragFactor !== undefined)
      requireFiniteNumber(actual.dragFactor);
    if (actual.restHeartRateBpm !== undefined)
      requireNullableFiniteNumber(actual.restHeartRateBpm);
```

`recoveryValidation.test.ts` — add one case alongside the existing actual-field cases: a run whose actual carries `calories: Number.NaN` is rejected (mirror the file's existing `avgHeartRateBpm` NaN test verbatim, field renamed).

- [ ] **Step 4: Run both files — expect PASS.** Also `pnpm typecheck` — the summary-fallback arm in `driver.ts` builds an `IntervalActual` literal with the fields absent; optional fields compile as-is.

- [ ] **Step 5: Mutation** — remove the `calories:` line from `toIntervalActual`; the new test fails "expected undefined to be 73". Restore.

- [ ] **Step 6: Commit**

```bash
git add app/domain/monitor/types.ts app/domain/monitor/pm5/parse.ts app/domain/monitor/pm5/parse.test.ts app/src/session/recoveryValidation.ts app/src/session/recoveryValidation.test.ts
git commit -m "LP PR1 T2: IntervalActual keeps calories, cal/hr, watts, drag and rest HR from 0x0038

Mutation: calories dropped from toIntervalActual → 'expected undefined to be 73'; restored."
```

---

### Task 3: Stash 0x003A on the run and ride it onto the summary observations

**Files:**
- Modify: `app/src/monitor/monitorRun.ts` (`MachineSummaryDetail`)
- Modify: `app/src/monitor/driver.ts`
- Modify: `app/src/session/recoveryValidation.ts`
- Test: `app/src/monitor/driver.test.ts` (existing summary tests), `app/src/session/recoveryValidation.test.ts`

**Interfaces:**
- `MachineSummaryDetail` gains `totalCalories?: number; avgWatts?: number; avgCalPerHour?: number; totalRestMeters?: number` (0x003A). Everything downstream (`appendSummaryObservations`, `LogSession`'s `machineSummary: {...summaryDetail}`) already spreads the detail, so the four keys reach `machine_summary` jsonb with no further change.
- Driver: `activeRun` gains `additionalSummary: AdditionalSummary | null` and `additionalSummaryWaited: boolean`; the 0x003A subscribe handler calls `noteAdditionalSummary(bytes)`; `summaryObservationsEvent` spreads the four keys when present; `reconcileSummary`'s emit path arms one `HASH_SUBWINDOW_MS` wait if 0x003A is still null and no wait has been taken; if still absent when emitting, `log.record("summary-1-missing", …)`.

- [ ] **Step 1: Failing driver test.** `driver.test.ts` ~10212 defines `FULL_SUMMARY` (the nine-field `detail` fixture) and ~10360 asserts the `summary-observations` event from it; reuse that harness (`g.events`) and add beside it:

```ts
it("carries 0x003A's calories, watts, avg cal/hr and rest distance on the summary observations when it arrives after 0x0039", async () => {
  // Same arrange as the neighbouring 0x0039 test (program, finish, feed
  // the 0x0039 frame), then feed the 0x003A frame from parse.test.ts's
  // fixture (372 cal, 162 W, 274 m rest, 858 cal/hr) on
  // END_OF_WORKOUT_ADDITIONAL_SUMMARY_UUID, then let the grace/sub-window
  // timers run as the neighbouring test does.
  const ev = events.find((e) => e.kind === "summary-observations");
  expect(ev).toBeDefined();
  if (ev?.kind !== "summary-observations") throw new Error("unreachable");
  expect(ev.detail.totalCalories).toBe(372);
  expect(ev.detail.avgWatts).toBe(162);
  expect(ev.detail.avgCalPerHour).toBe(858);
  expect(ev.detail.totalRestMeters).toBe(274);
});

it("emits the summary without the 0x003A fields, and records summary-1-missing, when 0x003A never arrives", async () => {
  // Arrange as above but never feed 0x003A; advance past HASH_SUBWINDOW_MS.
  const ev = events.find((e) => e.kind === "summary-observations");
  if (ev?.kind !== "summary-observations") throw new Error("unreachable");
  expect(ev.detail.totalCalories).toBeUndefined();
  expect(log.entries().some((e) => e.kind === "summary-1-missing")).toBe(true);
});
```

- [ ] **Step 2: Run — expect FAIL** (`totalCalories` undefined / no such log kind).

- [ ] **Step 3: Implement**

`monitorRun.ts`, `MachineSummaryDetail`:

```ts
export type MachineSummaryDetail = {
  avgStrokeRate: number;
  endingHeartRateBpm: number | null;
  avgHeartRateBpm: number | null;
  minHeartRateBpm: number | null;
  maxHeartRateBpm: number | null;
  dragFactorAverage: number;
  workoutType: number;
  recoveryHeartRateBpm: number | null;
  avgPaceSecondsPer500m: number;
  /** Phase LP — 0x003A, absent when the additional summary did not
   *  arrive inside the summary burst (spec §2.2/§2.3). `0` is a value. */
  totalCalories?: number;
  avgWatts?: number;
  avgCalPerHour?: number;
  totalRestMeters?: number;
};
```

`driver.ts`:

1. Import `parseAdditionalSummary` and `type AdditionalSummary` from `../../domain/monitor/pm5/parse` (beside the existing `parseAdditionalSummaryRest` import).
2. In the `activeRun` shape (the block that declares `summaryInGrace: WorkoutSummary | null;`) add:

```ts
    /** Phase LP: 0x003A's decoded fields, stashed when the frame arrives
     *  so the summary observations can carry them (spec §2.3 — the
     *  summary burst's second half). null until it arrives. */
    additionalSummary: AdditionalSummary | null;
    /** True once the reconcile has spent its one HASH_SUBWINDOW_MS wait
     *  for 0x003A; the second look emits without it. */
    additionalSummaryWaited: boolean;
```

and initialise both (`null`, `false`) at both `summaryInGrace: null` sites (driver.ts ~6344 and ~6602).

3. Replace the 0x003A subscription body:

```ts
    t.subscribe(END_OF_WORKOUT_ADDITIONAL_SUMMARY_UUID, (bytes) => {
      noteSummaryHalf("0x003A", bytes);
      noteAdditionalSummary(bytes);
      recordRestDistanceVerdict(bytes);
    });
```

and add, beside `noteSummaryHalf`:

```ts
  /** Phase LP: keep 0x003A's four logbook fields on the run. Refused when
   *  no run is open (the summary path already refuses 0x0039 there and
   *  logs it); a short frame is logged, never partially stored. */
  function noteAdditionalSummary(bytes: Uint8Array): void {
    const run = activeRun;
    if (run === null) return;
    const decoded = parseAdditionalSummary(bytes);
    if (decoded === null) {
      log.record(
        "summary-1-short",
        `0x003A arrived with ${bytes.length} byte(s); the 19-byte layout was not decoded, nothing stored`,
      );
      return;
    }
    run.additionalSummary = decoded;
    // ONLY when the drain is already waiting on this frame. Unconditional
    // reached the `verificationBytes === null` arm from a pre-terminal burst
    // (the keystone's burst-first race) and armed a reconcile against a run
    // not yet closed — observations lost, avg-pace verdict fired twice
    // (burstReplay + oracleCorpusReplay went red, measured 2026-09-06).
    if (run.additionalSummaryWaited) maybeReconcileImmediately(run);
  }
```

4. In `summaryObservationsEvent`, extend `detail`:

```ts
    const additional = run.additionalSummary;
    const detail = {
      avgStrokeRate: summary.avgStrokeRate,
      endingHeartRateBpm: summary.endingHeartRateBpm,
      avgHeartRateBpm: summary.avgHeartRateBpm,
      minHeartRateBpm: summary.minHeartRateBpm,
      maxHeartRateBpm: summary.maxHeartRateBpm,
      dragFactorAverage: summary.dragFactorAverage,
      workoutType: summary.workoutType,
      recoveryHeartRateBpm: summary.recoveryHeartRateBpm,
      avgPaceSecondsPer500m: summary.avgPaceSecondsPer500m,
      ...(additional !== null
        ? {
            totalCalories: additional.totalCalories,
            avgWatts: additional.avgWatts,
            avgCalPerHour: additional.avgCalPerHour,
            totalRestMeters: additional.totalRestDistanceMeters,
          }
        : {}),
    };
    if (additional === null) {
      log.record(
        "summary-1-missing",
        "0x003A did not arrive inside the summary burst; calories, avg watts, avg cal/hr and rest distance are absent on this run's observations (rendered as a dash, never zero)",
      );
    }
```

5. The bounded wait: in `maybeReconcileImmediately` (the function that arms `HASH_SUBWINDOW_MS` when `verificationBytes === null`), add before `drainSummaryReconcile()`:

```ts
    if (run.additionalSummary === null && !run.additionalSummaryWaited) {
      run.additionalSummaryWaited = true;
      armSummaryReconcile(run, HASH_SUBWINDOW_MS);
      return;
    }
```

(When `verificationBytes === null` the existing arm already waits the same window, and 0x003A lands ~1 ms after 0x0039 on every capture, so this branch only fires on the rare complete-bytes-but-no-0x003A path.)

`recoveryValidation.ts`, inside the `summaryDetail` block:

```ts
    if (run.summaryDetail.totalCalories !== undefined)
      requireFiniteNumber(run.summaryDetail.totalCalories);
    if (run.summaryDetail.avgWatts !== undefined)
      requireFiniteNumber(run.summaryDetail.avgWatts);
    if (run.summaryDetail.avgCalPerHour !== undefined)
      requireFiniteNumber(run.summaryDetail.avgCalPerHour);
    if (run.summaryDetail.totalRestMeters !== undefined)
      requireFiniteNumber(run.summaryDetail.totalRestMeters);
```

- [ ] **Step 4: Run** `driver.test.ts` and `recoveryValidation.test.ts` — expect PASS; `pnpm typecheck` clean; `pnpm test --project unit --project client` still green (the existing 0x0039 tests must not change).

- [ ] **Step 5: Mutation** — in `summaryObservationsEvent` replace `additional.totalCalories` with `additional.avgWatts`; the first new test fails "expected 162 to be 372". Restore.

- [ ] **Step 6: Commit**

```bash
git add app/src/monitor/monitorRun.ts app/src/monitor/driver.ts app/src/monitor/driver.test.ts app/src/session/recoveryValidation.ts app/src/session/recoveryValidation.test.ts
git commit -m "LP PR1 T3: 0x003A rides the summary observations (calories, avg watts, avg cal/hr, rest metres)

One HASH_SUBWINDOW_MS wait if 0x003A is late; summary-1-missing logged if
it never comes. Mutation: calories swapped for watts → 'expected 162 to be 372'; restored."
```

---

### Task 4: `LogStep` carries the per-split machine fields; the server accepts them with bands

**Files:**
- Modify: `app/src/session/logDraft.ts` (`LogStep`, `buildMonitorLogSteps`)
- Modify: `app/server/stores/logs.ts` (`LogStep`)
- Modify: `app/server/routes/data.ts` (`validateLogStepEntry`, `validateMachineSummary`)
- Modify: `app/src/log/storedSummary.ts` (`StoredLogStep`, `StoredLog.machineSummary`)
- Test: `app/src/session/logDraft.test.ts`, `app/server/routes/data.test.ts`

**Interfaces:**
- `LogStep` (client and server mirror) gains `machineCalories?: number; machineCalPerHour?: number; machineWatts?: number; machineDragFactor?: number; machineRestHr?: number | null`.
- `buildMonitorLogSteps` copies `actual.calories → machineCalories`, `calPerHour → machineCalPerHour`, `watts → machineWatts`, `dragFactor → machineDragFactor`, `restHeartRateBpm → machineRestHr` when defined.
- Server bands: `machineCalories`, `machineCalPerHour`, `machineWatts` integers `0..65535`; `machineDragFactor` integer `0..255`; `machineRestHr` `null` or integer `HR_MIN..HR_MAX`. `machineSummary.totalCalories/avgWatts/avgCalPerHour` integers `0..65535`, `totalRestMeters` integer `0..WORK_REST_METERS_MAX`.

- [ ] **Step 1: Failing tests**

`logDraft.test.ts` (reuse the file's existing `buildMonitorLogSteps` fixture run; add an actual carrying the new fields):

```ts
it("buildMonitorLogSteps copies the 0x0038 machine fields onto the step, and omits them when the actual lacks them", () => {
  const run = makeRunWithActuals([
    { ...baseActual, index: 0, calories: 73, calPerHour: 840, watts: 157, dragFactor: 101, restHeartRateBpm: null },
    { ...baseActual, index: 1 }, // an old-shape actual: no machine fields
  ]);
  const steps = buildMonitorLogSteps(run);
  expect(steps[0]).toMatchObject({ machineCalories: 73, machineCalPerHour: 840, machineWatts: 157, machineDragFactor: 101, machineRestHr: null });
  expect(steps[1]).not.toHaveProperty("machineCalories");
  expect(steps[1]).not.toHaveProperty("machineRestHr");
});
```

(Use the file's `THREE_STEP_RUN`/`THREE_STEP_ACTUALS` fixtures at ~line 1223: spread the new fields onto `THREE_STEP_ACTUALS[0]` and leave `[1]` old-shape, `{ ...THREE_STEP_RUN, actuals }`.)

`server/routes/data.test.ts` — two new rows in the step-validation table the file already drives: `{ machineCalories: 73.5 }` → 400 `steps[0]: machineCalories must be an integer, 0..65535`; `{ machineRestHr: 300 }` → 400 `steps[0]: machineRestHr must be null or an integer, 20..254`; and a positive case: a step with all five keys is stored and read back unchanged (extend the file's existing POST-then-GET round-trip test).

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**

`logDraft.ts` `LogStep` (after `partialSeconds?: number;`):

```ts
  /** Phase LP — the PM5's own per-split figures, verbatim (spec §2.1).
   *  `machineCalPerHour` and `machineWatts` are provenance; the screen
   *  shows the logbook's derivation (`logbookDerived.ts`). */
  machineCalories?: number;
  machineCalPerHour?: number;
  machineWatts?: number;
  machineDragFactor?: number;
  machineRestHr?: number | null;
```

`buildMonitorLogSteps`, inside `if (actual !== undefined) {` after the `actualSpm` block:

```ts
      if (actual.calories !== undefined) step.machineCalories = actual.calories;
      if (actual.calPerHour !== undefined)
        step.machineCalPerHour = actual.calPerHour;
      if (actual.watts !== undefined) step.machineWatts = actual.watts;
      if (actual.dragFactor !== undefined)
        step.machineDragFactor = actual.dragFactor;
      if (actual.restHeartRateBpm !== undefined)
        step.machineRestHr = actual.restHeartRateBpm;
```

`server/stores/logs.ts` `LogStep`: the same five optional fields (copy the block; keep the two interfaces byte-identical in field order — `storeContracts` compares shapes).

`server/routes/data.ts`:

- Bands, beside `HR_MIN/HR_MAX`:

```ts
const MACHINE_U16_MAX = 65535;
const MACHINE_DRAG_MAX = 255;
```

- In `validateLogStepEntry`, add the five names to the destructure and, after the `avgHr` check:

```ts
  for (const [name, value] of [
    ["machineCalories", machineCalories],
    ["machineCalPerHour", machineCalPerHour],
    ["machineWatts", machineWatts],
  ] as const) {
    if (
      value !== undefined &&
      (typeof value !== "number" ||
        !Number.isInteger(value) ||
        value < 0 ||
        value > MACHINE_U16_MAX)
    ) {
      return {
        ok: false,
        message: at(`${name} must be an integer, 0..${MACHINE_U16_MAX}`),
      };
    }
  }
  if (
    machineDragFactor !== undefined &&
    (typeof machineDragFactor !== "number" ||
      !Number.isInteger(machineDragFactor) ||
      machineDragFactor < 0 ||
      machineDragFactor > MACHINE_DRAG_MAX)
  ) {
    return {
      ok: false,
      message: at(`machineDragFactor must be an integer, 0..${MACHINE_DRAG_MAX}`),
    };
  }
  if (
    machineRestHr !== undefined &&
    machineRestHr !== null &&
    (typeof machineRestHr !== "number" ||
      !Number.isInteger(machineRestHr) ||
      machineRestHr < HR_MIN ||
      machineRestHr > HR_MAX)
  ) {
    return {
      ok: false,
      message: at(`machineRestHr must be null or an integer, ${HR_MIN}..${HR_MAX}`),
    };
  }
```

and in the `const step: LogStep = { label };` build:

```ts
  if (machineCalories !== undefined) step.machineCalories = machineCalories;
  if (machineCalPerHour !== undefined)
    step.machineCalPerHour = machineCalPerHour;
  if (machineWatts !== undefined) step.machineWatts = machineWatts;
  if (machineDragFactor !== undefined)
    step.machineDragFactor = machineDragFactor;
  if (machineRestHr !== undefined) step.machineRestHr = machineRestHr;
```

- In `validateMachineSummary`, after the `verificationBytes` block:

```ts
  for (const key of ["totalCalories", "avgWatts", "avgCalPerHour"] as const) {
    const v = raw[key];
    if (
      v !== undefined &&
      (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > MACHINE_U16_MAX)
    ) {
      return {
        ok: false,
        message: `machineSummary.${key} must be an integer, 0..${MACHINE_U16_MAX}`,
      };
    }
  }
  const rest = raw.totalRestMeters;
  if (
    rest !== undefined &&
    (typeof rest !== "number" || !Number.isInteger(rest) || rest < 0 || rest > WORK_REST_METERS_MAX)
  ) {
    return {
      ok: false,
      message: `machineSummary.totalRestMeters must be an integer, 0..${WORK_REST_METERS_MAX}`,
    };
  }
```

`storedSummary.ts`: `StoredLogStep` gains the same five optional keys; `StoredLog.machineSummary`'s narrowed object gains `totalCalories?: number; avgWatts?: number; avgCalPerHour?: number; totalRestMeters?: number; avgStrokeRate?: number; dragFactorAverage?: number` (the last two already exist in the jsonb and the tier needs them — check `grep -n "avgStrokeRate\|dragFactorAverage" app/src/log/storedSummary.ts` first; add only what is missing). Extend the server's narrow jsonb-path list read (`stores/logs.ts` ~line 395 pattern) ONLY if the history LIST needs a tile — it does not; the detail route returns the whole jsonb.

- [ ] **Step 4: Run** `logDraft.test.ts`, the data route tests, `pnpm typecheck`, `pnpm lint`. Expect PASS.

- [ ] **Step 5: Mutations** — (a) drop `step.machineCalories = actual.calories` → logDraft test fails "expected … to match object"; (b) change `MACHINE_U16_MAX` check to `<` → the 73.5 case still fails on integer, so instead send `65536` in a new table row and confirm 400; restore both.

- [ ] **Step 6: Commit** (`git rev-parse --show-toplevel` first)

```bash
git add app/src/session/logDraft.ts app/src/session/logDraft.test.ts app/server/stores/logs.ts app/server/routes/data.ts app/server/routes/data.test.ts app/src/log/storedSummary.ts
git commit -m "LP PR1 T4: LogStep carries the per-split machine fields; server bands for them and for the 0x003A summary keys"
```

---

### Task 5: The logbook's arithmetic, pinned against James's row

**Files:**
- Create: `app/src/session/logbookDerived.ts`
- Test: `app/src/session/logbookDerived.test.ts`

**Interfaces:**
- `export function logbookWatts(seconds: number, meters: number): number | undefined` — `Math.round(2.80 / (seconds / meters) ** 3)`; `undefined` when either input is not `> 0`.
- `export function logbookCalPerHour(calories: number, seconds: number): number | undefined` — `Math.floor((calories * 3600) / seconds)`; `undefined` when `seconds` is not `> 0`; `calories = 0` → `0`.
- `export function sessionStrokeRate(input: { finished: boolean; avgStrokeRate: number | undefined; splits: readonly { seconds: number; spm: number }[] }): number | undefined` — `avgStrokeRate` when `finished`; otherwise the time-weighted mean of the splits' rates, rounded, or `undefined` with no splits (spec §3.2: 0x0039's rate reads 2× on terminated pieces).

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  logbookCalPerHour,
  logbookWatts,
  sessionStrokeRate,
} from "./logbookDerived";

// James's 6k, photographed from the Concept2 logbook 2026-09-06 (spec §1.2).
// INDEPENDENT literals — never derived from the functions under test.
const ROW = [
  { seconds: 313.5, meters: 1200, cal: 73, watts: 157, calHr: 838 },
  { seconds: 309.0, meters: 1200, cal: 75, watts: 164, calHr: 873 },
  { seconds: 310.1, meters: 1200, cal: 74, watts: 162, calHr: 859 },
  { seconds: 310.1, meters: 1200, cal: 75, watts: 162, calHr: 870 },
  { seconds: 307.4, meters: 1200, cal: 75, watts: 167, calHr: 878 },
  { seconds: 1550.1, meters: 6000, cal: 372, watts: 162, calHr: 863 },
];

describe("logbookWatts", () => {
  it.each(ROW)("reproduces the logbook's watts from time and distance: $seconds s / $meters m → $watts W", (r) => {
    expect(logbookWatts(r.seconds, r.meters)).toBe(r.watts);
  });
  it("is undefined without a positive time and distance", () => {
    expect(logbookWatts(0, 1200)).toBeUndefined();
    expect(logbookWatts(300, 0)).toBeUndefined();
  });
});

describe("logbookCalPerHour", () => {
  it.each(ROW)("reproduces the logbook's cal/hr from calories and time: $cal cal / $seconds s → $calHr", (r) => {
    expect(logbookCalPerHour(r.cal, r.seconds)).toBe(r.calHr);
  });
  it("keeps zero calories as 0, not undefined", () => {
    expect(logbookCalPerHour(0, 60)).toBe(0);
  });
  it("is undefined without a positive time", () => {
    expect(logbookCalPerHour(10, 0)).toBeUndefined();
  });
});

describe("sessionStrokeRate", () => {
  it("uses 0x0039's average for a finished piece", () => {
    expect(sessionStrokeRate({ finished: true, avgStrokeRate: 26, splits: [{ seconds: 60, spm: 40 }] })).toBe(26);
  });
  it("uses the time-weighted per-split mean for a terminated piece (0x0039 reads double there)", () => {
    // smoke-terminated: 0x0039 said 46, the splits said 23 (spec §1.1).
    expect(sessionStrokeRate({ finished: false, avgStrokeRate: 46, splits: [{ seconds: 60, spm: 22 }, { seconds: 120, spm: 24 }] })).toBe(23);
  });
  it("is undefined for a terminated piece with no splits", () => {
    expect(sessionStrokeRate({ finished: false, avgStrokeRate: 46, splits: [] })).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — FAIL** (module not found).

- [ ] **Step 3: Implement**

```ts
/**
 * Phase LP — the two figures Concept2's logbook DERIVES rather than
 * stores, reproduced exactly (spec §1.2, §3.1), plus the session
 * stroke-rate rule (spec §3.2).
 *
 * Watts: Concept2 publishes `watts = 2.80/pace³` with pace in seconds per
 * metre (concept2.com/training/watts-calculator). The logbook derives from
 * full-precision time and distance — NOT from the tenths-quantised pace on
 * the wire, which reproduces only 5 of 6 of James's cells under any
 * rounding rule. From (time, distance): 6 of 6.
 *
 * Cal/hr: the logbook's is calories ÷ time (6/6 on the same row). The
 * PM5's own `splitIntervalAvgCalories` is `300 + 4×0.8604×W` from its
 * unrounded watts and differs from the logbook by 24–78 cal/hr on six of
 * nine committed captures — it is stored as provenance and never shown.
 *
 * `0` is a value; `undefined` means "cannot be derived" and renders as a
 * dash. Nothing here is stored.
 */
export function logbookWatts(
  seconds: number,
  meters: number,
): number | undefined {
  if (!(seconds > 0) || !(meters > 0)) return undefined;
  return Math.round(2.8 / (seconds / meters) ** 3);
}

export function logbookCalPerHour(
  calories: number,
  seconds: number,
): number | undefined {
  if (!(seconds > 0)) return undefined;
  return Math.floor((calories * 3600) / seconds);
}

/** 0x0039's average stroke rate reads exactly 2× the per-split rate on
 *  terminated pieces (2 of 9 committed captures; pm5-interface-notes §27.6:
 *  "never display 0x0039's average stroke rate for a terminated piece").
 *  A finished piece uses the machine's own average; a terminated one uses
 *  the time-weighted mean of the splits' 0x0038 rates. */
export function sessionStrokeRate(input: {
  finished: boolean;
  avgStrokeRate: number | undefined;
  splits: readonly { seconds: number; spm: number }[];
}): number | undefined {
  if (input.finished) return input.avgStrokeRate;
  let weight = 0;
  let sum = 0;
  for (const s of input.splits) {
    if (!(s.seconds > 0)) continue;
    weight += s.seconds;
    sum += s.seconds * s.spm;
  }
  if (weight === 0) return undefined;
  return Math.round(sum / weight);
}
```

- [ ] **Step 4: Run — PASS** (all 6 watts, 6 cal/hr, 3 rate cases).

- [ ] **Step 5: Mutation** — change `Math.floor` to `Math.round` in `logbookCalPerHour`: the 1550.1 s case fails "expected 864 to be 863" and 309.0 s "expected 874 to be 873". Restore. Change `2.8` to `2.80` is a no-op; instead change `** 3` to `** 2` — every watts case fails. Restore.

- [ ] **Step 6: Commit**

```bash
git add app/src/session/logbookDerived.ts app/src/session/logbookDerived.test.ts
git commit -m "LP PR1 T5: the logbook's watts and cal/hr, pinned 6/6 against James's row; the terminated-piece stroke-rate rule

Mutations: floor→round → 'expected 864 to be 863'; pace cubed→squared → every watts case fails; restored."
```

---

### Task 6: The hero's second tier — `SummaryHeroes.machine` from a run and from a stored row

**Files:**
- Modify: `app/src/session/summaryModel.ts` (`SummaryHeroes`, `monitorHeroes`)
- Modify: `app/src/log/storedSummary.ts` (`buildHeroes`)
- Modify: `app/src/session/PostWorkoutSummary.tsx` (`SummaryHeroesBlock`)
- Modify: `app/src/index.css`
- Test: `app/src/session/summaryModel.test.ts`, `app/src/log/storedSummary.test.ts`, `app/src/session/PostWorkoutSummary.test.tsx`

**Interfaces:**
- `SummaryHeroes` gains `machine?: MachineTier` where

```ts
export interface MachineTier {
  avgWatts?: number;      // logbookWatts(workElapsedSeconds, workDistanceMeters)
  calories?: number;      // summaryDetail.totalCalories
  calPerHour?: number;    // logbookCalPerHour(calories, workElapsedSeconds)
  rate?: number;          // sessionStrokeRate(...)
  targetRate?: number;    // only when every interval's target agrees
  drag?: number;          // summaryDetail.dragFactorAverage
  restMeters?: number;    // summaryDetail.totalRestMeters
}
```

- `machine` is present iff the row is machine-sourced (a `MonitorRun` with `summaryTotals`, or a `StoredLog` with `machineWorkMeters !== null`); each field is `undefined` when its source is absent and the tile renders `DASH`.
- `SummaryHeroesBlock` renders the six tiles as `.summary-machine-tier` under `.summary-heroes` when `heroes.machine` is defined.

- [ ] **Step 1: Failing tests**

`summaryModel.test.ts` (the file has a `monitorHeroes`/`buildSummaryModel` fixture with `summaryTotals` + `summaryDetail`; extend that fixture):

```ts
it("builds the machine tier from the run's summary: derived watts and cal/hr, stored calories, drag, rest", () => {
  const model = buildSummaryModel({ door: "monitor", run: runWithSummary({
    summaryTotals: { workElapsedSeconds: 1550.1, workDistanceMeters: 6000 },
    summaryDetail: { ...baseDetail, totalCalories: 372, dragFactorAverage: 101, totalRestMeters: 0, avgStrokeRate: 26 },
    endedBy: "finished",
  }) });
  expect(model.heroes.machine).toStrictEqual({
    avgWatts: 162, calories: 372, calPerHour: 863, rate: 26, targetRate: undefined, drag: 101, restMeters: 0,
  });
});

it("leaves calories and cal/hr undefined on an old machine row that never stored 0x003A, and still derives watts", () => {
  const model = buildSummaryModel({ door: "monitor", run: runWithSummary({
    summaryTotals: { workElapsedSeconds: 636, workDistanceMeters: 2440 },
    summaryDetail: { ...baseDetail, dragFactorAverage: 104 },
    endedBy: "finished",
  }) });
  expect(model.heroes.machine?.avgWatts).toBe(158);
  expect(model.heroes.machine?.calories).toBeUndefined();
  expect(model.heroes.machine?.calPerHour).toBeUndefined();
  expect(model.heroes.machine?.drag).toBe(104);
});

it("has no machine tier on a manual row", () => {
  const model = buildSummaryModel({ door: "manual", steps: [manualStep], dateIso: "2026-09-06T17:00:00Z" });
  expect(model.heroes.machine).toBeUndefined();
});

it("shows the target rate only when every interval agrees", () => {
  const agree = buildSummaryModel({ door: "monitor", run: runWithSummary({ intervalsTargetSpm: [26, 26, 26], ... }) });
  expect(agree.heroes.machine?.targetRate).toBe(26);
  const disagree = buildSummaryModel({ door: "monitor", run: runWithSummary({ intervalsTargetSpm: [26, 28, 26], ... }) });
  expect(disagree.heroes.machine?.targetRate).toBeUndefined();
});
```

(`monitorRun(overrides: Partial<MonitorRun>)` at summaryModel.test.ts ~line 106 is the run builder and `exit7SummaryDetail` its `MachineSummaryDetail` fixture — use those names in place of `runWithSummary`/`baseDetail`; `interval(...)` at ~134 builds program intervals, so the target-rate cases pass `program` intervals whose `displaySpm` agree or disagree rather than an `intervalsTargetSpm` knob. The manual-door case follows the file's existing manual `buildSummaryModel` tests.)

`storedSummary.test.ts`: the same three shapes from a `StoredLog` (machine row with `machineSummary.totalCalories`; old machine row without; manual row) asserting `buildStoredSummary(row).heroes.machine`.

`PostWorkoutSummary.test.tsx`: render `SummaryHeroesBlock` with `heroes.machine` set → six tiles by their labels (`getByText("AVG WATTS")` … `"REST"`), values `162 · 372 · 863 · 26 / 26 · 101 · —`; without `machine` → none of the labels; with `calories: undefined` → the CALORIES tile reads `—`.

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement**

`summaryModel.ts`:

```ts
import { logbookCalPerHour, logbookWatts, sessionStrokeRate } from "./logbookDerived";

export interface MachineTier {
  avgWatts?: number;
  calories?: number;
  calPerHour?: number;
  rate?: number;
  targetRate?: number;
  drag?: number;
  restMeters?: number;
}

export interface SummaryHeroes {
  avgSplit?: string;
  avgSplitSeconds?: number;
  time?: string;
  timeSeconds?: number;
  distanceMeters?: number;
  totalLine?: string;
  /** Phase LP: the six machine tiles (spec §3). Present only on a
   *  machine row; each field undefined where the machine did not say. */
  machine?: MachineTier;
}

/** The session's target stroke rate — one number only when every interval
 *  authored the same one (spec §3.2); otherwise undefined and the
 *  per-interval targets stay in the INTERVALS table. */
export function agreedTargetSpm(
  targets: readonly (number | null | undefined)[],
): number | undefined {
  const present = targets.filter((t): t is number => typeof t === "number");
  if (present.length === 0 || present.length !== targets.length) return undefined;
  return present.every((t) => t === present[0]) ? present[0] : undefined;
}

function machineTierFromRun(run: MonitorRun): MachineTier | undefined {
  if (run.summaryTotals === undefined) return undefined;
  const t = run.summaryTotals.workElapsedSeconds;
  const d = run.summaryTotals.workDistanceMeters;
  const detail = run.summaryDetail;
  const calories = detail?.totalCalories;
  return {
    avgWatts: logbookWatts(t, d),
    calories,
    calPerHour: calories === undefined ? undefined : logbookCalPerHour(calories, t),
    rate: sessionStrokeRate({
      finished: run.endedBy === "finished",
      avgStrokeRate: detail?.avgStrokeRate,
      splits: run.actuals
        .filter((a) => a.avgSpm !== null && a.elapsedSeconds > 0)
        .map((a) => ({ seconds: a.elapsedSeconds, spm: a.avgSpm as number })),
    }),
    targetRate: agreedTargetSpm(run.program.intervals.map((i) => i.displaySpm)),
    drag: detail?.dragFactorAverage,
    restMeters: detail?.totalRestMeters,
  };
}
```

and in `monitorHeroes`'s `summaryTotals !== undefined` branch add `machine: machineTierFromRun(run),` to the returned object.

`storedSummary.ts` `buildHeroes(row)`: when `row.machineWorkMeters !== null && row.machineWorkSeconds !== null`, set `machine`:

```ts
  const ms = row.machineSummary;
  const calories = ms?.totalCalories;
  heroes.machine = {
    avgWatts: logbookWatts(row.machineWorkSeconds, row.machineWorkMeters),
    calories,
    calPerHour: calories === undefined ? undefined : logbookCalPerHour(calories, row.machineWorkSeconds),
    rate: sessionStrokeRate({
      finished: row.endedBy === "finished" || row.endedBy == null,
      avgStrokeRate: ms?.avgStrokeRate,
      splits: row.steps
        .filter((s) => s.actualSource === "pm5" && s.actualSpm !== undefined && (s.actualSeconds ?? 0) > 0)
        .map((s) => ({ seconds: s.actualSeconds as number, spm: s.actualSpm as number })),
    }),
    targetRate: agreedTargetSpm(row.steps.map((s) => s.spm)),
    drag: ms?.dragFactorAverage,
    restMeters: ms?.totalRestMeters,
  };
```

(`agreedTargetSpm`, `logbookWatts`, `logbookCalPerHour`, `sessionStrokeRate` imported from `../session/summaryModel` / `../session/logbookDerived`. Confirm `StoredLog.endedBy` values by reading the type — `"finished"` is the natural close; treat `null`/`undefined` as finished for pre-close-reason rows.)

`PostWorkoutSummary.tsx` `SummaryHeroesBlock`, after the `.summary-heroes` div (inside `.summary-heroes-block`):

```tsx
      {heroes.machine !== undefined && (
        <div className="summary-machine-tier" data-testid="summary-machine-tier">
          <MachineTile label="AVG WATTS" value={heroes.machine.avgWatts} />
          <MachineTile label="CALORIES" value={heroes.machine.calories} />
          <MachineTile label="CAL / HR" value={heroes.machine.calPerHour} />
          <MachineTile
            label="RATE · TARGET"
            value={heroes.machine.rate}
            suffix={heroes.machine.targetRate !== undefined ? ` / ${heroes.machine.targetRate}` : undefined}
          />
          <MachineTile label="DRAG" value={heroes.machine.drag} />
          <MachineTile label="REST" value={heroes.machine.restMeters} unit="m" />
        </div>
      )}
```

with, above the component:

```tsx
import { DASH } from "../workout/connected/surfaceModel";

function MachineTile({ label, value, suffix, unit }: { label: string; value: number | undefined; suffix?: string; unit?: string }) {
  return (
    <div className="summary-machine-tile">
      <span className="summary-hero-label">{label}</span>
      <span className="summary-machine-value">
        {value === undefined ? DASH : value}
        {value !== undefined && suffix !== undefined && <small>{suffix}</small>}
        {value !== undefined && unit !== undefined && <small>{unit}</small>}
      </span>
    </div>
  );
}
```

`index.css`, after the `.summary-hero-value` rules:

```css
/* Phase LP — the six machine tiles under the hero (spec §3, mockup
   docs/design/logbook-parity/03-chosen-composed.html). Same label style as
   the heroes (`.summary-hero-label`, --ink-3 on --page, 6.69:1 — computed
   in this file's own contrast notes above); values in --ink on --page,
   the hero pairing. Three columns, two rows, at every width the hero
   already handles. */
.summary-machine-tier {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px 8px;
  margin-top: 10px;
}
.summary-machine-tile {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.summary-machine-value {
  font-family: var(--font-mono);
  font-size: 17px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--ink);
}
.summary-machine-value small {
  font-size: 10px;
  font-weight: 400;
  margin-left: 2px;
  color: var(--ink-3);
}
```

- [ ] **Step 4: Run** the three test files + `pnpm typecheck` + `pnpm lint` — PASS.

- [ ] **Step 5: Mutations** — (a) in `machineTierFromRun` compute `calPerHour` with `Math.round` by temporarily inlining → "expected 864 to be 863"; (b) drop the `heroes.machine !== undefined &&` guard → the manual-row render test fails (labels present). Restore both.

- [ ] **Step 6: Commit**

```bash
git add app/src/session/summaryModel.ts app/src/session/summaryModel.test.ts app/src/log/storedSummary.ts app/src/log/storedSummary.test.ts app/src/session/PostWorkoutSummary.tsx app/src/session/PostWorkoutSummary.test.tsx app/src/index.css
git commit -m "LP PR1 T6: the hero's machine tier — watts and cal/hr by the logbook's arithmetic, calories/drag/rest from the record, rate per the terminated-piece rule"
```

---

### Task 7: `MachineSummaryTable` — the sideways-scrolling strip

**Files:**
- Create: `app/src/session/MachineSummaryTable.tsx`
- Modify: `app/src/session/summaryModel.ts` (`MachineSplitRow`, `machineSplitRows`)
- Modify: `app/src/session/PostWorkoutSummary.tsx`, `app/src/log/FromTheLog.tsx`
- Modify: `app/src/index.css`
- Test: `app/src/session/MachineSummaryTable.test.tsx`, `app/src/session/summaryModel.test.ts`

**Interfaces:**

```ts
export interface MachineSplitRow {
  index: number;               // 1-based, the INTERVALS table's own numbering
  hr?: number | null;          // avgHr (work HR); null = belt gave nothing
  watts?: number;              // logbookWatts(actualSeconds, actualMeters)
  calories?: number;           // machineCalories
  calPerHour?: number;         // logbookCalPerHour(machineCalories, actualSeconds)
  drag?: number;               // machineDragFactor
  restMeters?: number;         // restDistanceMeters / the step's rest metres
}
export function machineSplitRows(steps: readonly LogStep[]): MachineSplitRow[]   // only steps with actualSource === "pm5"
export function machineSplitRowsFromRun(run: MonitorRun): MachineSplitRow[]      // from run.actuals via buildMonitorLogSteps-equivalent mapping
```

- `<MachineSummaryTable rows={rows} />` renders nothing when `rows.length === 0`; otherwise heading `MACHINE SUMMARY` with eyebrow `PM5 · PER INTERVAL`, a `.machine-summary-scroller` (`overflow-x: auto`) containing a `<table class="machine-summary">` with `border-collapse: separate`, a sticky first column `#`, columns `HR · WATTS · CAL · CAL/HR · DRAG · REST m`, `DASH` for undefined, `0` rendered as `0`.

- [ ] **Step 1: Failing tests**

`summaryModel.test.ts`:

```ts
it("machineSplitRows maps pm5 steps to the strip's rows with the logbook's watts and cal/hr, and skips manual steps", () => {
  const rows = machineSplitRows([
    { label: "1", actualSource: "pm5", actualSeconds: 313.5, actualMeters: 1200, avgHr: 55, machineCalories: 73, machineDragFactor: 101 },
    { label: "2", actualSource: "manual", actualSeconds: 300, actualMeters: 1200 },
    { label: "3", actualSource: "pm5", actualSeconds: 307.4, actualMeters: 1200, avgHr: 170, machineCalories: 75 },
  ]);
  expect(rows).toStrictEqual([
    { index: 1, hr: 55, watts: 157, calories: 73, calPerHour: 838, drag: 101, restMeters: undefined },
    { index: 3, hr: 170, watts: 167, calories: 75, calPerHour: 878, drag: undefined, restMeters: undefined },
  ]);
});
```

`MachineSummaryTable.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MachineSummaryTable from "./MachineSummaryTable";

describe("MachineSummaryTable", () => {
  it("renders one row per machine split with a dash where the machine did not say and 0 as 0", () => {
    render(<MachineSummaryTable rows={[
      { index: 1, hr: 55, watts: 157, calories: 73, calPerHour: 838, drag: 101, restMeters: undefined },
      { index: 2, hr: null, watts: 164, calories: 0, calPerHour: 0, drag: undefined, restMeters: 18 },
    ]} />);
    expect(screen.getByRole("heading", { name: "MACHINE SUMMARY" })).toBeVisible();
    const table = screen.getByRole("table", { name: "Machine summary per interval" });
    const rows = within(table).getAllByRole("row").slice(1); // drop the header
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getAllByRole("cell").map((c) => c.textContent)).toStrictEqual(["1", "55", "157", "73", "838", "101", "—"]);
    expect(within(rows[1]!).getAllByRole("cell").map((c) => c.textContent)).toStrictEqual(["2", "—", "164", "0", "0", "—", "18"]);
  });
  it("renders nothing at all with no machine rows", () => {
    const { container } = render(<MachineSummaryTable rows={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

(`within` from `@testing-library/react`.)

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement**

`summaryModel.ts`:

```ts
export interface MachineSplitRow {
  index: number;
  hr?: number | null;
  watts?: number;
  calories?: number;
  calPerHour?: number;
  drag?: number;
  restMeters?: number;
}

/** The MACHINE SUMMARY strip's rows (spec §3): one per PM5-sourced step,
 *  numbered as the INTERVALS table numbers them (1-based position in the
 *  step list), watts and cal/hr by the logbook's arithmetic, everything
 *  else the machine's own. Manual steps are skipped, not dashed. */
export function machineSplitRows(steps: readonly LogStep[]): MachineSplitRow[] {
  const out: MachineSplitRow[] = [];
  steps.forEach((s, i) => {
    if (s.actualSource !== "pm5") return;
    const seconds = s.actualSeconds;
    const meters = s.actualMeters;
    out.push({
      index: i + 1,
      hr: s.avgHr,
      watts: seconds !== undefined && meters !== undefined ? logbookWatts(seconds, meters) : undefined,
      calories: s.machineCalories,
      calPerHour:
        s.machineCalories !== undefined && seconds !== undefined
          ? logbookCalPerHour(s.machineCalories, seconds)
          : undefined,
      drag: s.machineDragFactor,
      restMeters: undefined,
    });
  });
  return out;
}
```

(`LogStep` carries NO per-step rest metres today — `storedSummary.ts` says so at its line ~248 — so `machineSplitRows` sets `restMeters: undefined` and the run-side builder below fills it from `IntervalActual.restDistanceMeters`; a stored row's REST column reads a dash until PR 2 decides whether rest metres join `LogStep`, and the plan says so in DEVIATIONS.)

```ts
export function machineSplitRowsFromRun(run: MonitorRun): MachineSplitRow[] {
  return machineSplitRows(buildMonitorLogSteps(run)).map((row, i) => ({
    ...row,
    restMeters: run.actuals.find((a) => a.index === row.index - 1)?.restDistanceMeters ?? row.restMeters,
  }));
}
```

(`buildMonitorLogSteps` throws `MonitorLogSeedError` for a run with no seed — `machineSplitRowsFromRun` catches it and returns `[]`, the same tolerance the summary already shows for seedless runs; wrap accordingly.)

`MachineSummaryTable.tsx`:

```tsx
import { DASH } from "../workout/connected/surfaceModel";
import type { MachineSplitRow } from "./summaryModel";

const COLUMNS = ["HR", "WATTS", "CAL", "CAL/HR", "DRAG", "REST m"] as const;

function cell(v: number | null | undefined): string {
  return v === undefined || v === null ? DASH : String(v);
}

/** Phase LP (spec §3; mockup 03-chosen-composed.html): the PM5's own
 *  per-interval figures under today's INTERVALS table. Scrolls sideways
 *  inside its own container with the `#` column pinned; never wraps. No
 *  ALL row (the hero tiles are the session) and no SPM (the INTERVALS
 *  table shows it beside its target). Renders nothing without rows, so a
 *  manual row or a Just Row (`steps: []`) adds no surface. */
export default function MachineSummaryTable({ rows }: { rows: readonly MachineSplitRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="machine-summary-block">
      <div className="machine-summary-head">
        <h3 className="machine-summary-title">MACHINE SUMMARY</h3>
        <span className="machine-summary-eyebrow">PM5 · PER INTERVAL</span>
      </div>
      <div className="machine-summary-scroller">
        <table className="machine-summary" aria-label="Machine summary per interval">
          <thead>
            <tr>
              <th scope="col" className="machine-summary-pin">#</th>
              {COLUMNS.map((c) => (
                <th scope="col" key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.index}>
                <td className="machine-summary-pin">{r.index}</td>
                <td>{cell(r.hr)}</td>
                <td>{cell(r.watts)}</td>
                <td>{cell(r.calories)}</td>
                <td>{cell(r.calPerHour)}</td>
                <td>{cell(r.drag)}</td>
                <td>{cell(r.restMeters)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

`PostWorkoutSummary.tsx`: where the INTERVALS list (`.summary-row-list`) is rendered, immediately after it render `<MachineSummaryTable rows={machineRows} />`, with `machineRows` computed by the component from its input: the monitor door has the `MonitorRun` (→ `machineSplitRowsFromRun(run)`), the timer/manual doors have `steps` (→ `machineSplitRows(steps)`). Read how `PostWorkoutSummary` receives its `SummaryInput`/`model` today (its props) and add `machineRows` to `SummaryModel` in `buildSummaryModel` instead if the component only receives the model — that is the cleaner seam: `SummaryModel` gains `machineRows: MachineSplitRow[]`, computed in `buildSummaryModel` per door.

`FromTheLog.tsx`: after `<SummaryHeroesBlock heroes={view.heroes} />` and its rows list, render `<MachineSummaryTable rows={machineSplitRows(row.steps)} />` (the `StoredLogStep` shape is `LogStep`'s mirror; if the types differ, add `machineRows` to `StoredSummaryView` in `buildStoredSummary` the same way).

`index.css`:

```css
/* Phase LP — MACHINE SUMMARY (spec §3). The strip scrolls sideways inside
   its own container; the page never scrolls sideways. `border-collapse:
   separate` on purpose: collapsed borders belong to the table and do not
   travel with a stuck cell (WebKit bug 128486, csswg-drafts #3136), so the
   pinned column paints its own opaque background and a soft right shadow
   instead of a border. Both `position: sticky` and `overflow-x` are new to
   this stylesheet (anchor pass m7). Text pairings: --ink on --page (cells),
   --ink-3 on --page (headers/eyebrow, 6.69:1). */
.machine-summary-block { margin-top: 18px; }
.machine-summary-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 6px;
}
.machine-summary-title {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  margin: 0;
}
.machine-summary-eyebrow {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  color: var(--ink-3);
}
.machine-summary-scroller {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  margin: 0 -20px;
  padding: 0 20px;
}
.machine-summary {
  border-collapse: separate;
  border-spacing: 0;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.machine-summary th,
.machine-summary td {
  padding: 8px 10px;
  text-align: right;
  border-bottom: 1px solid var(--rule);
}
.machine-summary th {
  font-weight: 400;
  font-size: 10px;
  letter-spacing: 0.12em;
  color: var(--ink-3);
}
.machine-summary .machine-summary-pin {
  position: sticky;
  left: 0;
  z-index: 1;
  text-align: left;
  background: var(--page);
  box-shadow: 6px 0 6px -6px rgba(0, 0, 0, 0.25);
}
```

(No `--screen-pad` token exists; `.screen` pads `20px` + the horizontal safe-area insets (index.css ~line 511). Use `margin: 0 -20px; padding: 0 20px;` and let the safe-area inset stay inside `.screen`.)

- [ ] **Step 4: Run** the two test files, `PostWorkoutSummary.test.tsx`, `FromTheLog.test.tsx`, `pnpm typecheck`, `pnpm lint` — PASS.

- [ ] **Step 5: Mutations** — (a) in `machineSplitRows` skip the `actualSource` filter → the manual step appears, test fails on length; (b) in `cell()` return `"0"` for `undefined` → the dash assertions fail. Restore.

- [ ] **Step 6: Commit**

```bash
git add app/src/session/MachineSummaryTable.tsx app/src/session/MachineSummaryTable.test.tsx app/src/session/summaryModel.ts app/src/session/summaryModel.test.ts app/src/session/PostWorkoutSummary.tsx app/src/log/FromTheLog.tsx app/src/index.css
git commit -m "LP PR1 T7: MACHINE SUMMARY strip — per-interval HR, watts, cal, cal/hr, drag, rest; sideways scroll, pinned #, dashes for absence"
```

---

### Task 8: The fake transport stops lying with zeros

**Files:**
- Modify: `app/src/monitor/transports/fake.ts` (the `asSplit` literal)
- Test: `app/src/monitor/transports/fake.test.ts`

**Interfaces:** the fake's 0x0038 frame carries `splitIntervalPowerWatts = round(2.80/(t/d)³)`, `splitIntervalAvgCalories = floor(300 + 4 × 0.8604 × W)` (the PM5's own relation, spec §1.1), `splitIntervalTotalCalories = round(avgCalories × t / 3600)`, `splitAvgDragFactor = 101`, `splitIntervalRestHeartRateBpm = HEARTRATE_NO_BELT` unchanged.

- [ ] **Step 1: Failing test** (in `fake.test.ts`, using the file's existing `asSplits` capture + `decodeAsSplit` harness at ~line 1273/1679 — drive one finished interval of 1200 m in 313.5 s the way that test drives its split, then decode the captured frame):

```ts
it("emits the PM5's own per-split relations, never zeros: watts from pace, cal/hr from watts, calories from cal/hr and time, drag 101", () => {
  const split = decodeAsSplit(asSplits[0]!); // 1200 m in 313.5 s
  expect(split.splitIntervalPowerWatts).toBe(157);
  expect(split.splitIntervalAvgCalories).toBe(840); // floor(300 + 3.4416 × 157.03)
  expect(split.splitIntervalTotalCalories).toBe(73); // round(840 × 313.5 / 3600)
  expect(split.splitAvgDragFactor).toBe(101);
});
```

- [ ] **Step 2: Run — FAIL** (0 !== 157).

- [ ] **Step 3: Implement** — replace the four zero/130 literals:

```ts
      splitIntervalTotalCalories: fakeSplitCalories(actual.elapsedSeconds, actual.distanceMeters),
      splitIntervalAvgCalories: fakeSplitCalPerHour(actual.elapsedSeconds, actual.distanceMeters),
      splitIntervalSpeedMetersPerSecond: actual.elapsedSeconds > 0 ? Math.round((actual.distanceMeters / actual.elapsedSeconds) * 1000) / 1000 : 0,
      splitIntervalPowerWatts: fakeSplitWatts(actual.elapsedSeconds, actual.distanceMeters),
      splitAvgDragFactor: 101,
```

with, at module level:

```ts
/** Phase LP: the fake models the PM5's OWN relations honestly (agent
 *  briefing: never "helpfully"). Real captures read drag 100-104, watts
 *  = 2.80/pace³, cal/hr = 300 + 4×0.8604×W from the machine's unrounded
 *  watts. A zero here can only ever mean "unwired". */
function fakeSplitWatts(seconds: number, meters: number): number {
  if (!(seconds > 0) || !(meters > 0)) return 0;
  return Math.round(2.8 / (seconds / meters) ** 3);
}
function fakeSplitCalPerHour(seconds: number, meters: number): number {
  if (!(seconds > 0) || !(meters > 0)) return 0;
  const w = 2.8 / (seconds / meters) ** 3;
  return Math.floor(300 + 4 * 0.8604 * w);
}
function fakeSplitCalories(seconds: number, meters: number): number {
  return Math.round((fakeSplitCalPerHour(seconds, meters) * seconds) / 3600);
}
```

- [ ] **Step 4: Run** `fake.test.ts` and the whole client project — every replay/e2e fixture that asserted `0` for these fields must be updated to the relation (grep `splitIntervalTotalCalories: 0` across `app/src` and `app/e2e`; each hit is either a fixture to update or a test that now proves the fake is honest).

- [ ] **Step 5: Mutation** — set `splitAvgDragFactor: 130` back → test fails "expected 130 to be 101". Restore.

- [ ] **Step 6: Commit**

```bash
git add app/src/monitor/transports/fake.ts app/src/monitor/transports/fake.test.ts
git commit -m "LP PR1 T8: the fake's split frames carry the PM5's own watts, cal/hr, calories and a real drag factor"
```

---

### Task 9: Cross-characteristic identities over the corpus (real oracles, not mirrors)

**Files:**
- Modify: `app/src/monitor/oracleCorpusReplay.test.ts` (a new `describe` at the end)

**Why not a new file (RF10, found at execution):** `src/monitor` test files never import each other — each re-declares its programs verbatim — so a new file would re-transcribe seven `WorkoutProgram`s. The corpus file already holds every program, `loadCapture`, `replayThroughDriver` and `fromHexString`; the identities are the same kind of evidence it exists for. Captures carrying 0x003A are SIX, not nine: rests-finished, smoke-terminated, boundaries-terminated, keystone, rest-boundary, end-on-interval-1 (`grep -c '"rx".*ce06003a'` per file, 2026-09-06 — menu-at-ready, pyramid, session-1-keystone and step-2 carry none). Two of the six (smoke-terminated, end-on-interval-1) end before any boundary, so the driver-side per-actual checks are conditional there while the raw-bytes identities still run.

- [ ] **Step 1: Write the test** (it is expected to PASS from the start on the retention code Tasks 2–3 landed; its value is that it can go RED — Step 3 proves it)

```ts
/**
 * Phase LP §4.1 — identities that do not share our arithmetic:
 *  (1) the per-split 0x0038 calories sum to 0x003A's Total Calories;
 *  (2) the wire's per-split watts equal round(2.80/(t/d)³) from the same
 *      split's own 0x0037 time and distance;
 *  (3) the session 0x003A watts are within 1 W of the derivation.
 * Measured 9/9, 15/15 and 8/9 by hand before this test existed (spec
 * §1.1); the test turns those into a gate. Captures listed by date; a new
 * walk capture is added here the day it lands.
 */
const CAPTURES: { path: string; program: WorkoutProgram }[] = [
  // one entry per capture in spec §1.1's list that carries 0x003A, paired
  // with the program oracleCorpusReplay.test.ts already assigns it — copy
  // those pairs verbatim; `walk-2026-08-31-justrow/*` use the JustRow
  // program the same file uses.
];

describe.each(CAPTURES)("logbook-parity identities: $path", ({ path, program }) => {
  it("per-split calories sum to 0x003A's Total Calories, and watts match the derivation", async () => {
    const outcome = await replayThroughDriver(path, program);
    const actuals = outcome.events
      .filter((e): e is Extract<MonitorEvent, { kind: "intervalComplete" }> => e.kind === "intervalComplete")
      .map((e) => e.actual)
      .filter((a) => a.index !== null);
    const summary = outcome.events.find((e): e is Extract<MonitorEvent, { kind: "summary-observations" }> => e.kind === "summary-observations");
    expect(summary).toBeDefined();
    const total = summary!.detail.totalCalories;
    expect(total).toBeDefined();
    const sum = actuals.reduce((n, a) => n + (a.calories ?? 0), 0);
    expect(sum).toBe(total);
    for (const a of actuals) {
      if (a.watts === undefined) continue;
      expect(logbookWatts(a.elapsedSeconds, a.distanceMeters)).toBe(a.watts);
    }
    const derived = logbookWatts(summary!.totals.workElapsedSeconds, summary!.totals.workDistanceMeters);
    expect(Math.abs((summary!.detail.avgWatts ?? 0) - (derived ?? 0))).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run** `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/monitor/logbookParityReplay.test.ts` — expect PASS on every listed capture. If a capture's replay yields no `summary-observations` (terminated pieces where the burst is refused), exclude it with a one-line reason in `CAPTURES`, the way `oracleCorpusReplay.test.ts`'s header lists its exclusions.

- [ ] **Step 3: Mutation (this is the gate's receipt)** — in `parse.ts` `parseAdditionalSummary`, read `totalCalories` at offset 10 → every capture fails "expected 162 to be 372"-shaped on the sum; and in `toIntervalActual` map `calories: raw.splitIntervalAvgCalories` → the sum fails again by hundreds. Restore both; record both failure texts in the commit.

- [ ] **Step 4: Commit**

```bash
git add app/src/monitor/logbookParityReplay.test.ts
git commit -m "LP PR1 T9: corpus identities — split calories sum to 0x003A, wire watts equal 2.80/(t/d)^3

Mutations: 0x003A calories read at offset 10 → <text>; split calories mapped from avg calories → <text>; restored."
```

---

### Task 10: e2e — the strip's shape on Chromium, and the tier's tiles

**Files:**
- Modify: `app/e2e/design.spec.ts`
- Read: `app/e2e/screenshots.spec.ts` ~3545 (the seed to copy)

**Interfaces:** the existing machine-row seeding lives in `app/e2e/screenshots.spec.ts` (~line 3545, the `MACHINE CONFIRMED · WORK ONLY` group test) — copy its API seed into `design.spec.ts` and extend it with `machineSummary.totalCalories: 372, avgWatts: 162, avgCalPerHour: 858, totalRestMeters: 0` and steps carrying `machineCalories`/`machineDragFactor`, then assert.

- [ ] **Step 1: Add, in that describe:**

```ts
test("Phase LP: a machine row shows the six tiles and a sideways-scrolling MACHINE SUMMARY with a pinned # column", async ({ page }) => {
  // seed as the neighbouring MACHINE CONFIRMED test does, plus the LP fields
  await page.goto(`/today/log/${id}`);
  const tier = page.getByTestId("summary-machine-tier");
  await expect(tier).toBeVisible();
  await expect(tier).toContainText("AVG WATTS");
  await expect(tier).toContainText("372");
  const table = page.getByRole("table", { name: "Machine summary per interval" });
  await expect(table).toBeVisible();
  const shape = await table.evaluate((el) => {
    const scroller = el.parentElement!;
    const pin = el.querySelector("tbody .machine-summary-pin")!;
    const cs = getComputedStyle(pin);
    return {
      collapse: getComputedStyle(el).borderCollapse,
      overflowX: getComputedStyle(scroller).overflowX,
      pinPosition: cs.position,
      pinLeft: cs.left,
      // the CELL's box, never an inline child (RF21)
      pinWidth: (pin as HTMLElement).getBoundingClientRect().width,
      pageScrollWidth: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    };
  });
  expect(shape.collapse).toBe("separate");
  expect(shape.overflowX).toBe("auto");
  expect(shape.pinPosition).toBe("sticky");
  expect(shape.pinLeft).toBe("0px");
  expect(shape.pinWidth).toBeGreaterThan(20);
  // the PAGE never scrolls sideways; only the strip does
  expect(shape.pageScrollWidth).toBeLessThanOrEqual(shape.viewport);
});

test("Phase LP: a manual row shows neither the tier nor the strip", async ({ page }) => {
  // seed a manual row as the file's manual-door tests do
  await expect(page.getByTestId("summary-machine-tier")).toHaveCount(0);
  await expect(page.getByRole("table", { name: "Machine summary per interval" })).toHaveCount(0);
});
```

- [ ] **Step 2: Run** `pnpm e2e design.spec.ts --grep "Phase LP" --reporter=line` — expect PASS.

- [ ] **Step 3: Mutation** — `border-collapse: collapse` in `.machine-summary` → "expected 'collapse' to be 'separate'"; `.machine-summary-scroller { overflow-x: visible }` → the page-scroll-width assertion fails at 393px. Restore; record.

- [ ] **Step 4: Commit**

```bash
git add app/e2e/design.spec.ts
git commit -m "LP PR1 T10: e2e — tier and strip shape on a machine row, absent on a manual row; page never scrolls sideways"
```

---

### Task 11: Record — DEVIATIONS, stale comments, spec §2.2 amendment

**Files:**
- Modify: `docs/design/DEVIATIONS.md` (one row after the status-bar row)
- Modify: `app/domain/monitor/pm5/parse.ts` (the 0x0039 comment's `interface-notes.md` → `pm5-interface-notes.md`; the "a wider parser would be undecoded surface with no reader" note now has readers — reword)
- Modify: `app/src/monitor/driver.ts` (the same path typo in its 0x0039 comments)
- Modify: `docs/superpowers/specs/2026-09-06-logbook-parity-design.md` §2.2 — replace "four nullable columns" with "four optional keys on `machineSummary` jsonb (`totalCalories`, `avgWatts`, `avgCalPerHour`, `totalRestMeters`); no migration", and §2.3's migration bullet accordingly.

- [ ] **Step 1: DEVIATIONS row**

`| N/A — the handoff has no per-interval machine metrics or session tiles | **Machine rows carry a second hero tier (AVG WATTS · CALORIES · CAL / HR · RATE · TARGET · DRAG · REST) and a sideways-scrolling MACHINE SUMMARY table (HR · WATTS · CAL · CAL/HR · DRAG · REST m) under the INTERVALS table** (\`PostWorkoutSummary.tsx\`, \`MachineSummaryTable.tsx\`). Watts and cal/hr are the LOGBOOK's arithmetic (\`logbookDerived.ts\`), not the PM5's own; absence renders \`DASH\`, \`0\` renders 0; manual rows show neither | Phase LP (\`docs/superpowers/specs/2026-09-06-logbook-parity-design.md\`), 2026-09-06 — James: "show everything that Concept2's logbook shows … be absolutely certain our numbers match Concept2's". Layout B + B from the visual companion (\`docs/design/logbook-parity/03-chosen-composed.html\`); no ALL row and no SPM in the strip (both would duplicate what the tiles / INTERVALS table already show). The PM5's own watts/cal-hr are stored as provenance and differ from the logbook's by ≤1 W and 24–78 cal/hr — the Gate 0 option James chose |`

- [ ] **Step 2: Comment sweep** — `grep -rn "interface-notes.md" app/src app/domain` → each hit becomes `pm5-interface-notes.md`; `grep -n "undecoded surface with no reader" app/domain/monitor/pm5/parse.ts` → reword to "Phase LP gave these fields readers (spec §2)".

- [ ] **Step 3: Spec §2.2 amendment** as above; add one line to the spec's rev note: "rev 2.1 (PR 1 plan): session fields ride `machineSummary` jsonb, not new columns — same store, no migration."

- [ ] **Step 4: Commit**

```bash
git add docs/design/DEVIATIONS.md app/domain/monitor/pm5/parse.ts app/src/monitor/driver.ts docs/superpowers/specs/2026-09-06-logbook-parity-design.md
git commit -m "LP PR1 T11: DEVIATIONS row; pm5-interface-notes path fixed; spec §2.2 amended to the jsonb shape"
```

---

### Task 12: Gates, then Gate 0 on the phone (controller-owned)

- [ ] `pnpm lint && pnpm typecheck && pnpm format:check && pnpm test --project unit --project client && pnpm build && pnpm dist:grep && pnpm e2e --reporter=line` — all green; no `docs/screenshots` capture moved except ones the spec names (the summary screens — run `pnpm screenshots` twice and retain only `post-workout-summary*.png`, `log-detail*.png` if they show the tier on a seeded machine row; restore the rest).
- [ ] Push; open the PR (draft) with the human-first body; dispatch the whole-branch review (two-stage) and the PM final gate (TRIAD).
- [ ] **Gate 0** (spec §3.3): build for Kaito; **ask James before installing**; captures — fresh machine row (session door + log detail), a REAL old machine row, portrait and landscape, beside v0.39.2; the §3.1 option pair stated with its measured deltas; contrast ratios stated from `theme/tokens.css`.
- [ ] Present the verdicts; stop for James's merge approval.

---

## Self-review

- **Spec coverage:** §2.1 → T2/T4; §2.2 → T3 (+T11 amendment); §2.3 lifetime → T3 (stash + wait + missing log), summary-fallback omission → T2 (optional fields absent by construction); §3 tier → T6; §3 strip → T7; §3.1 arithmetic → T5; §3.2 stroke-rate rule → T5/T6; §3.3 Gate 0 → T12; §4.1 retention → T2/T3 tests, identities → T9, derived pair → T5, fake → T8, screen → T6/T7/T10; §6 PR 1 list → all; DEVIATIONS → T11. §5 (upload) and §4.2 (walk) are PR 2 / the trip — out of this plan by design.
- **Placeholders:** the `existingRawStatusFixture`, `runWithSummary`, `fakeSplitFrameFor` and the T9 `CAPTURES` table are named as "the file's existing helper — grep names it"; each carries the grep. T10 depends on the existing MACHINE CONFIRMED seed — named by grep.
- **Type consistency:** `IntervalActual.calories/calPerHour/watts/dragFactor/restHeartRateBpm` (T2) → `LogStep.machineCalories/machineCalPerHour/machineWatts/machineDragFactor/machineRestHr` (T4) → `MachineSplitRow.calories/calPerHour/watts/drag/hr` (T7); `MachineSummaryDetail.totalCalories/avgWatts/avgCalPerHour/totalRestMeters` (T3) → `MachineTier.calories/avgWatts/calPerHour/restMeters` (T6); `logbookWatts/logbookCalPerHour/sessionStrokeRate/agreedTargetSpm` names match across T5–T7.

---

## Execution record (2026-09-07, inline shape, PR #327)

Twelve task commits on `phase-lp-logbook-parity` (T1–T11, T12a captures),
each failing-test-first. The biting mutation for each, with what its
failure said — the record the whole-branch review (H2) asked for, kept
here rather than in commit messages so it is greppable from the plan:

| Task | Mutation (deciding source) | What failed |
| --- | --- | --- |
| T1 | `parseAdditionalSummary` reads calories at offset 10 | `expected totalCalories 184 to be 32` (exit-7 frame) |
| T2 | `calories:` line removed from `toIntervalActual` | `expected undefined to be 73`, `expected undefined to be +0` |
| T2 | the five new `requireFiniteNumber` guards removed | 3 `ReviewSession` "stays read-only" rows go green→red |
| T3 | `totalCalories: additional.avgWatts` in `summaryObservationsEvent` | 4 driver tests: `"totalCalories": 184` vs `32` |
| T4 | `step.machineCalories = actual.calories` removed | `logDraft` "copies the 0x0038 machine fields": `machineCalories: 73` missing |
| T4 | u16 band `> MACHINE_U16_MAX + 1` | route test `65536` → `expected 201 to be 400` |
| T5 | `Math.floor` → `Math.round` in `logbookCalPerHour` | `874 vs 873`, `871 vs 870`, `864 vs 863` (James's row) |
| T5 | `** 3` → `** 2` in `logbookWatts` | all six watts cells fail |
| T6 | same floor→round, seen through the stored tier | `calPerHour 864 vs 863` |
| T6 | `machine !== undefined` guard removed in `SummaryHeroesBlock` | "no machine tier on a model without one" fails |
| T7 | `actualSource !== "pm5"` skip removed in `machineSplitRows` | length 3 vs 2 (manual step appears) |
| T7 | `cell()` renders `0` for `undefined` | dash assertions fail |
| T8 | `FAKE_DRAG_FACTOR = 130` | `expected 130 to be 101` |
| T9 | 0x003A calories at offset 10 | 6 corpus cases: `expected +0 to be 15`, `10 to be 101`… |
| T9 | `calories: raw.splitIntervalAvgCalories` in `toIntervalActual` | 4 corpus cases: `641 vs 10`, `735 vs 14` |
| T10 | `border-collapse: collapse` (served bundle, `pnpm e2e`) | `Expected "separate" Received "collapse"` |
| T10 | `.machine-summary-scroller { overflow-x: visible }` (served bundle) | `Expected "auto" Received "visible"` |

Review fix round (whole-branch review, 2026-09-07): H1 focusable scroll
region + behavioural overflow e2e; H3 six more recovery-validation rows;
M1 `machineRestHr` banded like `avgHr`; M2 RF24 seam test in
`summaryHoldReplay.test.ts` leg 1 (wire → hook record → LogSession body →
real router → GET); M4 spec §3/§5 names; M5 `RATE · TARGET` / `RATE`; M6
0x003A folded in only under the held 0x0039's Log Entry stamp
(`summary-1-mismatch`); L1–L6 as filed. M3 (REST tile duplicates the
total line's rest metres) is James's call.
