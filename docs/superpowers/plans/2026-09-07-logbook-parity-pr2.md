# Phase LP PR 2 — the upload — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Read `.claude/agent-briefing.md` first; every commit runs `git rev-parse --show-toplevel` and confirms the worktree path.

**Goal:** send Concept2 everything its results API accepts from a machine row — session calories, drag, heart rate, the PM5's own rest distance, and one `workout.intervals[]` object per stored step with its rest, stroke rate, calories, heart rate and targets — so the logbook page for an Ergomatic upload reads like ErgData's.

**Architecture:** two per-step keys join `LogStep` (`machineRestSeconds`, `machineRestMeters`, off the 0x0037 readback the live run already holds) because the API's interval object REQUIRES `rest_time`; `SessionLogRow` gains `steps`; `buildC2Payload` adds the result-level fields and an all-or-nothing `workout.intervals[]` builder in a new `server/concept2/intervals.ts`. Nothing derived is sent; every number is an integer or omitted. The stored strip's REST column fills from the new key as a side effect.

**Tech Stack:** TypeScript, Express 5 route + pure mapper, Vitest unit/client, Playwright e2e (fake Concept2 host records `sendBodies`).

**Spec:** `docs/superpowers/specs/2026-09-06-logbook-parity-design.md` rev 2.5 — §2.1 (the two keys), §5 (every API row quoted verbatim, re-fetched 2026-09-07), §4.2 (the walk).

## Global Constraints

- Worktree `/Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/lp-pr2`, branch `phase-lp-pr2-upload`, base `origin/main` `a6fc1e96`.
- **Omit, never zero; `0` is a value.** Every emitted numeric field passes `Number.isInteger` or is omitted (API: "Sending across a decimal value or a string where an integer is expected … will result in the workout failing").
- **All-or-nothing `workout.intervals[]`:** sent only when `workout_type` maps AND every step has `actualSource === "pm5"`, `actualSeconds`, `actualMeters`, `machineRestSeconds`. Otherwise no `workout` key at all.
- **Untouched:** `type`, `date`, `timezone`, `distance`, `time`, `weight_class`, `rest_time`, `stroke_rate`, `workout_type` (`verification_code` has never been emitted by `buildC2Payload` — antagonist delta 5). The route test "happy path posts EXACTLY the fixture payload" must keep passing byte-for-byte on its `steps: []` fixture.
- Never `git checkout --` a file with uncommitted work (RF22); commit before each mutation.
- No device install without James's permission; the walk rides Wave E's flag-flip trip (spec §4.2), not this PR.
- Tests: `cd app && NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project unit <file>` (server) / `--project client <file>` (src). `pnpm e2e` once at the end.

---

## File map

| File | Responsibility |
| --- | --- |
| `app/src/session/logDraft.ts` | `LogStep.machineRestSeconds/machineRestMeters`; `buildMonitorLogSteps` copies them |
| `app/server/stores/logs.ts` | server `LogStep` mirror |
| `app/server/routes/data.ts` | integer bands for the two keys |
| `app/src/log/storedSummary.ts` | `StoredLogStep` mirror |
| `app/src/session/summaryModel.ts` | `machineSplitRows` reads `machineRestMeters` (stored strip REST fills) |
| `app/server/concept2/mapping.ts` | `SessionLogRow.steps`; result-level fields; calls the intervals builder |
| `app/server/concept2/intervals.ts` (new) | `buildC2Intervals(steps)`: the all-or-nothing array |
| `app/server/routes/concept2.ts` | `toMappingRow` passes `steps` |
| `app/e2e/concept2.spec.ts` | STRUCK at execution (RF10): the e2e fake intercepts OUR route (`page.route(/\/api\/concept2\//)`), so `sendBodies` holds `{tz}`, never the C2 payload; the C2 payload is gated at the route test's `client.postResult` mock and the real-Postgres integration case |
| `docs/design/DEVIATIONS.md`, `ROADMAP.md` | REST column row closed; LP status |

---

### Task 1: `LogStep` carries the interval's rest (readback seconds, measured metres)

**Files:** `app/src/session/logDraft.ts`, `app/server/stores/logs.ts`, `app/src/log/storedSummary.ts`, `app/server/routes/data.ts`; tests `app/src/session/logDraft.test.ts`, `app/server/routes/data.test.ts`, `app/src/monitor/partialReplay.test.ts`.

**Interfaces:** `LogStep.machineRestSeconds?: number` (← `IntervalActual.restSeconds`, whole seconds, 0x0037 offset 12, a programmed-rest READBACK per `types.ts`), `LogStep.machineRestMeters?: number` (← `IntervalActual.restDistanceMeters`, 0x0037's measured Interval Rest Distance). Server bands: integers, `machineRestSeconds` `0..86400`, `machineRestMeters` `0..WORK_REST_METERS_MAX`.

- [ ] **Step 1: failing tests.** `logDraft.test.ts`, beside the T4 machine-fields test:

```ts
it("Phase LP PR 2: copies the interval's rest readback and rest metres onto the step, and omits both when the actual lacks them", () => {
  const run: MonitorRun = {
    ...THREE_STEP_RUN,
    actuals: [
      { ...THREE_STEP_ACTUALS[0]!, restSeconds: 60, restDistanceMeters: 147 },
      { ...THREE_STEP_ACTUALS[1]!, restSeconds: 0, restDistanceMeters: 0 },
      (({ restSeconds: _s, restDistanceMeters: _m, ...rest }) => rest)(THREE_STEP_ACTUALS[2]!),
    ],
  };
  const steps = buildMonitorLogSteps(run);
  expect(steps[0]).toMatchObject({ machineRestSeconds: 60, machineRestMeters: 147 });
  // 0 is a value on both.
  expect(steps[1]).toMatchObject({ machineRestSeconds: 0, machineRestMeters: 0 });
  expect(steps[2]).not.toHaveProperty("machineRestSeconds");
  expect(steps[2]).not.toHaveProperty("machineRestMeters");
});
```

`data.test.ts`, three rows in the Phase LP `it.each` band table: `[{ machineRestSeconds: 1.5 }, "machineRestSeconds must be an integer, 0..86400"]`, `[{ machineRestSeconds: 86401 }, …same]`, `[{ machineRestMeters: -1 }, "machineRestMeters must be an integer, 0..1000000"]`; and the round-trip step gains `machineRestSeconds: 60, machineRestMeters: 147`.

`partialReplay.test.ts` LEG B's strict-equal step gains `machineRestSeconds: 60, machineRestMeters: 6` (the actual above it already carries `restSeconds: 60, restDistanceMeters: 6`, seq 771/772).

- [ ] **Step 2: run → FAIL.**
- [ ] **Step 3: implement.** `logDraft.ts` `LogStep`, after `machineRestHr`:

```ts
  /** Phase LP PR 2 (spec §2.1 rev 2.5): the interval's own rest — the
   *  0x0037 rest-time READBACK (`IntervalActual.restSeconds`, whole
   *  seconds; every committed capture reads the programmed value) and the
   *  measured rest distance (`restDistanceMeters`). The logbook API's
   *  interval object REQUIRES `rest_time`, so a row without these sends no
   *  `workout` array (all-or-nothing, `server/concept2/intervals.ts`).
   *  `machineRestMeters` also fills the stored strip's REST m column. */
  machineRestSeconds?: number;
  machineRestMeters?: number;
```

`buildMonitorLogSteps`, after the `machineRestHr` block:

```ts
      if (actual.restSeconds !== undefined)
        step.machineRestSeconds = actual.restSeconds;
      if (actual.restDistanceMeters !== undefined)
        step.machineRestMeters = actual.restDistanceMeters;
```

`server/stores/logs.ts` and `src/log/storedSummary.ts`: the same two optional fields on their `LogStep`/`StoredLogStep` mirrors. `routes/data.ts`: destructure both; band (copy the `machineDragFactor` block twice with `MACHINE_REST_SECONDS_MAX = 86400` and `WORK_REST_METERS_MAX`); build (`typeof … === "number"` guards like the T4 five).

- [ ] **Step 4: run the three files + typecheck + lint → PASS.**
- [ ] **Step 5: mutation** — drop the `machineRestSeconds` copy line → logDraft test "expected … to match object". Restore. Commit.

---

### Task 2: The stored strip's REST column fills (closes the register row)

**Files:** `app/src/session/summaryModel.ts` (`machineSplitRows`), `app/src/session/summaryModel.test.ts`, `app/src/log/storedSummary.test.ts`, `app/e2e/design.spec.ts` (seed gains `machineRestMeters: 147 / 95`; row expectations `…100147` / `…10095`), `app/e2e/screenshots.spec.ts` (machine-confirmed seed gains the same; strip expectations updated; captures refreshed), `docs/design/DEVIATIONS.md` (the "REST m reads a dash on a stored row" clause removed), `ROADMAP.md` (register row struck with "closed by PR 2").

- [ ] **Step 1: failing test** in `summaryModel.test.ts`'s `machineSplitRows` test: give the first pm5 step `machineRestMeters: 147` and expect `restMeters: 147` (and the manual step still skipped).
- [ ] **Step 2: run → FAIL.**
- [ ] **Step 3: implement.** In `machineSplitRows`: add `"machineRestMeters"` to the `Pick`, set `restMeters: s.machineRestMeters`; delete the "LogStep carries no per-step rest metres" doc clause and `machineSplitRowsFromRun`'s actual lookup **only if** the live run's steps now carry the key — they do (Task 1's `buildMonitorLogSteps`), so `machineSplitRowsFromRun` becomes `machineSplitRows(buildMonitorLogSteps(run))` and `monitorStepProgramIndices` loses its only consumer: **delete it and its test** (RF29: no dead helper without a row).
- [ ] **Step 4: run summaryModel/storedSummary suites, update the two e2e specs' expectations, `pnpm e2e design.spec.ts --grep "Phase LP"`, `pnpm screenshots` (retain the LP captures only), record edits.**
- [ ] **Step 5: mutation** — `restMeters: undefined` in `machineSplitRows` → the test fails on 147. Restore. Commit.

---

### Task 3: Result-level fields on the payload

**Files:** `app/server/concept2/mapping.ts`, `app/server/concept2/mapping.test.ts`, `app/server/routes/concept2.ts` (`toMappingRow`), `app/server/routes/concept2.test.ts`.

**Interfaces:** `SessionLogRow.steps: LogStep[]` (import the server `LogStep` from `../stores/logs.js`). `buildC2Payload` emits `calories_total`, `drag_factor`, `heart_rate {average,min,max,ending,recovery}`, and `rest_distance` ← `machineSummary.totalRestMeters` when integer > 0 else today's `row.restMeters` rule.

- [ ] **Step 1: failing tests** (`mapping.test.ts`; every existing fixture gains `steps: []`, which keeps "maps the fixture row to EXACTLY PR0's accepted payload" byte-identical):

```ts
it("Phase LP PR 2: posts calories_total, drag_factor and a heart_rate object from the stored 0x0039/0x003A keys, each only when present", () => {
  const post = buildC2Payload(
    { ...FINISHED_ROW, machineSummary: { avgStrokeRate: 24, workoutType: 8, totalCalories: 372, dragFactorAverage: 101, avgHeartRateBpm: 142, minHeartRateBpm: 96, maxHeartRateBpm: 175, endingHeartRateBpm: 168, recoveryHeartRateBpm: null } },
    LINK, "UTC",
  );
  expect(post).toMatchObject({ calories_total: 372, drag_factor: 101, heart_rate: { average: 142, min: 96, max: 175, ending: 168 } });
  expect((post.heart_rate as Record<string, unknown>)).not.toHaveProperty("recovery");
});

it("Phase LP PR 2: 0 calories posts 0 (a value); a missing key posts nothing; an all-null heart rate posts no heart_rate object at all", () => {
  const zero = buildC2Payload({ ...FINISHED_ROW, machineSummary: { avgStrokeRate: 24, workoutType: 8, totalCalories: 0 } }, LINK, "UTC");
  expect(zero.calories_total).toBe(0);
  expect(zero).not.toHaveProperty("drag_factor");
  expect(zero).not.toHaveProperty("heart_rate");
  const nulls = buildC2Payload({ ...FINISHED_ROW, machineSummary: { avgStrokeRate: 24, workoutType: 8, avgHeartRateBpm: null, minHeartRateBpm: null, maxHeartRateBpm: null, endingHeartRateBpm: null, recoveryHeartRateBpm: null } }, LINK, "UTC");
  expect(nulls).not.toHaveProperty("heart_rate");
});

it("Phase LP PR 2: rest_distance is the PM5's own session total when stored and > 0, else today's summed rest metres; a stored 0 falls back (matching the > 0 rule the field already has)", () => {
  expect(buildC2Payload({ ...FINISHED_ROW, machineSummary: { avgStrokeRate: 24, workoutType: 8, totalRestMeters: 275 } }, LINK, "UTC").rest_distance).toBe(275);
  expect(buildC2Payload({ ...FINISHED_ROW, machineSummary: { avgStrokeRate: 24, workoutType: 8, totalRestMeters: 0 } }, LINK, "UTC").rest_distance).toBe(274);
  expect(buildC2Payload(FINISHED_ROW, LINK, "UTC").rest_distance).toBe(274);
});

it("Phase LP PR 2: a non-integer or string stored value is omitted, never sent (the API fails the whole workout on one decimal)", () => {
  const post = buildC2Payload({ ...FINISHED_ROW, machineSummary: { avgStrokeRate: 24, workoutType: 8, totalCalories: 372.5, dragFactorAverage: "101", avgHeartRateBpm: 142.2 } }, LINK, "UTC");
  expect(post).not.toHaveProperty("calories_total");
  expect(post).not.toHaveProperty("drag_factor");
  expect(post).not.toHaveProperty("heart_rate");
});
```

`concept2.test.ts`: the route fixture (`steps: []`, `machineSummary: { avgStrokeRate: 24, workoutType: 8 }`) keeps the happy-path payload byte-identical; add one route test whose seeded log carries the LP session keys and asserts `calories_total`/`drag_factor`/`heart_rate` reach `client.postResult` (RF24: starts at the store).

- [ ] **Step 2: run → FAIL** (`steps` missing on the type first — add it, then the field assertions fail).
- [ ] **Step 3: implement.** `mapping.ts`:

```ts
import type { LogStep } from "../stores/logs.js";
// SessionLogRow gains:
  steps: LogStep[];

/** A stored number that may be sent: an integer within [min, max]; anything
 *  else — null, undefined, a decimal, a string — is omitted, because the
 *  API fails the WHOLE workout on one non-integer (spec §5). */
function sendableInt(value: unknown, min: number, max: number): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
    ? value
    : undefined;
}
```

In `buildC2Payload`, after the `rest_time` block replace the `rest_distance` block:

```ts
  // Phase LP PR 2 (spec §5): the PM5's own session rest total when stored
  // and > 0 (0x003A, offsets 12-14 — agrees with our sum to the metre on
  // every committed capture), else today's summed rest metres, same > 0 rule.
  const machineRest = sendableInt(row.machineSummary?.totalRestMeters, 1, 1_000_000);
  if (machineRest !== undefined) {
    post.rest_distance = machineRest;
  } else if (row.restMeters !== null && row.restMeters > 0) {
    post.rest_distance = row.restMeters;
  }
```

After the `workout_type` block:

```ts
  // Phase LP PR 2 (spec §5, each API row quoted there): result-level fields
  // the logbook stores as its own — never derived, never zero-filled.
  const calories = sendableInt(row.machineSummary?.totalCalories, 0, 65535);
  if (calories !== undefined) post.calories_total = calories;
  const drag = sendableInt(row.machineSummary?.dragFactorAverage, 0, 255);
  if (drag !== undefined) post.drag_factor = drag;
  const heartRate: Record<string, number> = {};
  for (const [key, field] of [
    ["average", "avgHeartRateBpm"],
    ["min", "minHeartRateBpm"],
    ["max", "maxHeartRateBpm"],
    ["ending", "endingHeartRateBpm"],
    ["recovery", "recoveryHeartRateBpm"],
  ] as const) {
    const bpm = sendableInt(row.machineSummary?.[field], HR_MIN, HR_MAX);
    if (bpm !== undefined) heartRate[key] = bpm;
  }
  if (Object.keys(heartRate).length > 0) post.heart_rate = heartRate;
```

with `const HR_MIN = 20; const HR_MAX = 254;` beside `STROKE_RATE_MIN` (the same band `routes/data.ts` admits on write). `routes/concept2.ts` `toMappingRow`: add `steps: LogStep[]` to its parameter type and `steps: row.steps` to the return.

- [ ] **Step 4: run mapping + route suites, typecheck, lint → PASS.**
- [ ] **Step 5: mutation** — `sendableInt` accepts non-integers (drop `Number.isInteger`) → the decimal test fails. Restore. Commit.

---

### Task 4: `workout.intervals[]`, all or nothing

**Files:** create `app/server/concept2/intervals.ts` + `intervals.test.ts`; modify `mapping.ts` (call site), `mapping.test.ts`, `concept2.test.ts`.

**Interfaces:**

```ts
export interface C2Interval {
  type: "time" | "distance";
  time: number;          // tenths, work only
  distance: number;      // metres, work only
  rest_time: number;     // tenths
  rest_distance?: number;
  stroke_rate?: number;
  calories_total?: number;
  heart_rate?: { average?: number; rest?: number };
  targets?: { pace?: number; stroke_rate?: number };
}
/** Every stored step → one interval object, or `null` when ANY step cannot
 *  fill a REQUIRED key (spec §5: a manual step, a dropped boundary, a row
 *  saved before PR 2). Never a partial list. */
export function buildC2Intervals(steps: readonly LogStep[]): C2Interval[] | null;
```

- [ ] **Step 1: failing tests** (`intervals.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { buildC2Intervals } from "./intervals.js";
import type { LogStep } from "../stores/logs.js";

// The exit-7 walk's two intervals as PR 1 stores them (screenshots.spec.ts's
// own seed), plus PR 2's rest keys: 67.9 s / 250 m / rest 60 s / 147 m and
// 56.1 s / 250 m / rest 60 s / 95 m; targets 2:07.0 at 26 spm.
const STEP_1: LogStep = { label: "250m @ 2:07.0", targetSplit: 127.0, actualSplit: 135.8, actualSeconds: 67.9, actualSource: "pm5", meters: 250, actualMeters: 250, actualSpm: 25, spm: 26, avgHr: 142, machineCalories: 16, machineCalPerHour: 848, machineWatts: 140, machineDragFactor: 100, machineRestHr: null, machineRestSeconds: 60, machineRestMeters: 147 };
const STEP_2: LogStep = { ...STEP_1, actualSplit: 112.2, actualSeconds: 56.1, actualSpm: 28, avgHr: undefined, machineRestHr: 120, machineRestMeters: 95 };

describe("buildC2Intervals (Phase LP PR 2, spec §5)", () => {
  it("maps every stored step to the API's interval object — integers only, targets per interval, heart_rate keys only when present", () => {
    expect(buildC2Intervals([STEP_1, STEP_2])).toStrictEqual([
      { type: "distance", time: 679, distance: 250, rest_time: 600, rest_distance: 147, stroke_rate: 25, calories_total: 16, heart_rate: { average: 142 }, targets: { pace: 1270, stroke_rate: 26 } },
      { type: "distance", time: 561, distance: 250, rest_time: 600, rest_distance: 95, stroke_rate: 28, calories_total: 16, heart_rate: { rest: 120 }, targets: { pace: 1270, stroke_rate: 26 } },
    ]);
  });
  it("a time-prescribed step is type time; a zero rest posts rest_time 0 and no rest_distance; no targets object when the step stored none", () => {
    const step: LogStep = { label: "1:00", seconds: 60, actualSource: "pm5", actualSeconds: 60, actualMeters: 197, machineRestSeconds: 0, machineRestMeters: 0 };
    expect(buildC2Intervals([step])).toStrictEqual([{ type: "time", time: 600, distance: 197, rest_time: 0 }]);
  });
  it("returns null — no array, never a partial one — when any step lacks a REQUIRED key: a manual step, a dropped boundary, a pre-PR-2 row, or an empty list", () => {
    expect(buildC2Intervals([STEP_1, { ...STEP_2, actualSource: "assumed" }])).toBeNull();
    expect(buildC2Intervals([STEP_1, { ...STEP_2, actualSeconds: undefined }])).toBeNull();
    expect(buildC2Intervals([STEP_1, (({ machineRestSeconds: _r, ...rest }) => rest)(STEP_2)])).toBeNull();
    expect(buildC2Intervals([])).toBeNull();
  });
  it("rounds the work distance to a whole metre and drops a non-integer optional rather than sending it", () => {
    const out = buildC2Intervals([{ ...STEP_1, actualMeters: 249.6, actualSpm: 25.4 }]);
    expect(out?.[0]?.distance).toBe(250);
    expect(out?.[0]).not.toHaveProperty("stroke_rate");
  });
});
```

`mapping.test.ts`: `buildC2Payload({ ...FINISHED_ROW, steps: [STEP_1, STEP_2] }, …).workout` equals `{ intervals: […] }`; with `steps: []` no `workout` key (the PR0 fixture stays exact); with `machineSummary.workoutType: 1` and full steps, no `workout` key (a `workout_type` we do not map sends no array). `concept2.test.ts`: a route test seeding a log with both steps and asserting `postResult` received `workout.intervals` of length 2 (RF24 seam, store → route → client).

- [ ] **Step 2: run → FAIL.**
- [ ] **Step 3: implement** `intervals.ts`:

```ts
import type { LogStep } from "../stores/logs.js";
import { c2Tenths } from "./mapping.js";

export interface C2Interval { /* as above */ }

const U16 = 65535;
function int(value: unknown, min: number, max: number): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : undefined;
}

/**
 * Phase LP PR 2 (spec §5, the API's interval-object rows quoted there).
 * REQUIRED per object: `type`, `time`, `distance`, `rest_time` — so a step
 * missing any of `actualSource === "pm5"`, `actualSeconds`, `actualMeters`,
 * `machineRestSeconds` fails the WHOLE array: `null`, never a partial
 * list, never a zero standing in for a reading (a manual step, a dropped
 * boundary, a row saved before PR 2). Every emitted number is an integer.
 * Targets ride each interval because every row we send is VariableInterval.
 */
export function buildC2Intervals(steps: readonly LogStep[]): C2Interval[] | null {
  if (steps.length === 0) return null;
  const out: C2Interval[] = [];
  for (const s of steps) {
    if (s.actualSource !== "pm5") return null;
    if (s.actualSeconds === undefined || s.actualMeters === undefined || s.machineRestSeconds === undefined) return null;
    if (!(s.actualSeconds >= 0) || !(s.actualMeters >= 0) || !Number.isInteger(s.machineRestSeconds) || s.machineRestSeconds < 0) return null;
    const type: C2Interval["type"] = s.seconds !== undefined ? "time" : "distance";
    const interval: C2Interval = {
      type,
      time: c2Tenths(s.actualSeconds),
      distance: Math.round(s.actualMeters),
      rest_time: c2Tenths(s.machineRestSeconds),
    };
    const restMeters = int(s.machineRestMeters, 1, 1_000_000);
    if (restMeters !== undefined) interval.rest_distance = restMeters;
    const spm = int(s.actualSpm, 1, 99);
    if (spm !== undefined) interval.stroke_rate = spm;
    const cal = int(s.machineCalories, 0, U16);
    if (cal !== undefined) interval.calories_total = cal;
    const hr: C2Interval["heart_rate"] = {};
    const avg = int(s.avgHr, 20, 254);
    if (avg !== undefined) hr.average = avg;
    const rest = int(s.machineRestHr, 20, 254);
    if (rest !== undefined) hr.rest = rest;
    if (Object.keys(hr).length > 0) interval.heart_rate = hr;
    const targets: C2Interval["targets"] = {};
    if (typeof s.targetSplit === "number" && s.targetSplit > 0) targets.pace = c2Tenths(s.targetSplit);
    const targetSpm = int(s.spm, 1, 255);
    if (targetSpm !== undefined) targets.stroke_rate = targetSpm;
    if (Object.keys(targets).length > 0) interval.targets = targets;
    out.push(interval);
  }
  return out;
}
```

`mapping.ts`, after `workout_type`:

```ts
  // Phase LP PR 2 (spec §5): the per-interval array rides ONLY with a
  // workout_type we map (VariableInterval — every programmed Ergomatic
  // piece) and only when every step can fill the API's REQUIRED keys.
  if (post.workout_type !== undefined) {
    const intervals = buildC2Intervals(row.steps);
    if (intervals !== null) post.workout = { intervals };
  }
```

(`c2Tenths` is exported from `mapping.ts`; `intervals.ts` importing it while `mapping.ts` imports `buildC2Intervals` is a cycle — move `c2Tenths` into `intervals.ts`? No: put `c2Tenths` in a new `server/concept2/tenths.ts` and re-export from `mapping.ts` so both import one leaf. Same commit.)

- [ ] **Step 4: run all concept2 suites, typecheck, lint → PASS.** Also `pnpm e2e concept2.spec.ts` — the fake host's `sendBodies` gains the array on a seeded machine row; assert `sendBodies[0].workout.intervals.length === 2` in the existing send test (extend its seed with the two steps).
- [ ] **Step 5: mutations** — (a) return the partial list instead of `null` on a bad step → the null test fails; (b) drop the `post.workout_type !== undefined` guard → the ordinal-1 mapping test fails. Restore both. Commit.

---

### Task 5: Integer sweep, records, and the PR

- [ ] One test in `mapping.test.ts`: `JSON.parse(JSON.stringify(buildC2Payload(FULL_ROW, LINK, "UTC")))` walked recursively — every number leaf `Number.isInteger`; every string leaf in the set `{type, date, timezone, weight_class, workout_type, interval.type}`.
- [ ] `docs/design/DEVIATIONS.md`: strip REST clause removed; `ROADMAP.md`: register row struck ("closed by PR 2, `machineRestMeters`"), Phase LP status "PR 2 BUILT"; the Wave E `intervals` sentence corrected (spec §6). (The verification-research note the plan first owed is struck: no Ergomatic upload has ever carried `verification_code` — antagonist delta 5.)
- [ ] **Folded from the antagonist delta pass (2026-09-07):** the route retries once without `workout` on a non-auth, non-duplicate refusal and logs both paths; interval `rest_distance` sends 0; `drag_factor` 1..255; spec §5 corrected (trailing-rest evidence, `pace` unit INFERENCE, the "validated" prose, `verification_code`, heart-rate type contradiction, the accepted SPM-target cost); §4.2 gains the last-interval-rest and pace read-backs; ROADMAP register row for the rows already sent thin.
- [ ] Gates: lint, typecheck, format, unit+client, `pnpm build` + `dist:grep`, `pnpm e2e`, `pnpm screenshots` (LP captures only).
- [ ] PR (human-first body, TRIAD twice stated), review half: whole-branch review + PM final gate. Walk stays on the flag-flip trip.

---

## Self-review

- Spec §5 rows → T3 (result-level) + T4 (interval object, targets, integers) ✓; §2.1 rev 2.5 keys → T1 ✓; register row → T2 ✓; §6 PR 2 list (verification spec reconciled, Wave E sentence) → T5 ✓; §4.2 walk → out of scope by design ✓.
- Placeholders: none — every helper named exists (`THREE_STEP_RUN`, `FINISHED_ROW`, `LINK`, `seedEligibleLog`, `makeStubClient`, `sendBodies`).
- Types: `machineRestSeconds/machineRestMeters` (T1) → `buildC2Intervals` reads (T4) → `machineSplitRows` reads `machineRestMeters` (T2); `SessionLogRow.steps` (T3) → `buildC2Payload` (T4).
