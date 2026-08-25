# Summary Record PR 1 (capture + hybrid storage + terminate gates) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store the PM5's full end-of-workout summary on the client run record AND the saved log's server row, capture it on Menu-terminated pieces through four named gates (observations-only), and log the burst's date/time stamp as a diagnostic.

**Architecture:** The driver already parses 0x0039 and emits a `summary-observations` event consumed by `useMonitorSession`, which calls `appendSummaryObservations` on the localStorage `MonitorRun`. This PR widens that pipe (event carries the nine detail fields), adds a terminate-shaped admission that can only reach the observation write, and adds three additive nullable columns to `session_logs` that the save POST fills from the client record.

**Tech Stack:** React 19 + Vite client, Express 5 + Drizzle/Postgres server, Vitest (`--project unit|client|integration`), fake PM5 transport for wire-shaped tests.

**Spec:** `docs/superpowers/specs/2026-08-24-summary-record-design.md` (read it first — the four-gate terminate section and the antagonist's constraints are binding).

## Global Constraints

- TRIAD: stored-shape change. Failing test first everywhere; per-file coverage checked for every touched file.
- Client detail values come VERBATIM from `parseEndOfWorkoutSummary` — no re-decoding, no unit changes. `avgPaceSecondsPer500m` is SECONDS (already descaled). `workoutType` stays a raw byte.
- Terminate summaries are observations-only: structurally unable to reach `reconcileSummary`'s derive/`filled-from-summary` path. The terminate's own partial 0x0037 keeps taking `boundary-out-of-run`.
- Burst-eligible close predicate everywhere: `endedBy === "finished" || endedBy === "rower"` (the complement of link-lost/program-failed). Never write "terminated" as a reason; the reason is `"rower"`.
- Server columns: `machine_work_seconds` doublePrecision (wire tenths — PR #182 lesson), `machine_work_meters` integer (store `Math.round`), `machine_summary` jsonb. Additive, nullable, no default, NO backfill. API additive-only.
- Wire date/time stamp is DIAGNOSTIC only: one ring entry per 0x0039 notification, no storage, no comparison logic.
- The lab terminate capture's anomalous `avgStrokeRate: 44` is pinned verbatim in the terminate test (never normalised).
- No em-dashes in any user-facing string (none added in this PR; diagnostics exempt).
- Run `pnpm test --project unit|client|integration` (NEVER bare `vitest run` — bypasses NODE_OPTIONS). Diff touches `app/src/` ⇒ run `pnpm e2e` before reporting done.

---

## File map

- `app/domain/monitor/pm5/parse.ts` — add `parseSummaryLogStamp` (Task 1)
- `app/src/monitor/monitorRun.ts` — `MachineSummaryDetail` type, `summaryDetail?` field, writer widening (Task 2)
- `app/src/monitor/driver.ts` — event carries detail; RC-2 ring entry; terminate admission door + observations-only drain (Tasks 3, 4)
- `app/src/monitor/useMonitorSession.ts` — burst-eligible linger predicate (Task 4)
- `app/src/monitor/transports/fake.ts` — terminate burst script, loud `pendingBurst` overwrite, offsets note (Task 5)
- `app/server/db/schema.ts`, `app/drizzle/0016_*.sql`, `app/server/routes/data.ts` — server tier (Task 6)
- `app/src/session/LogSession.tsx` — save payload carries the machine fields (Task 7)

### Task 1: `parseSummaryLogStamp` (pure codec)

**Files:**
- Modify: `app/domain/monitor/pm5/parse.ts` (near `parseEndOfWorkoutSummary`, ~line 347)
- Test: `app/domain/monitor/pm5/parse.test.ts`

**Interfaces:**
- Produces: `parseSummaryLogStamp(bytes: Uint8Array): SummaryLogStamp | null` where `SummaryLogStamp = { year: number; month: number; day: number; hours: number; minutes: number }`. Returns null if `bytes.length < 4`.

- [ ] **Step 1: Write the failing tests** (in `parse.test.ts`, new describe block):

```ts
describe("parseSummaryLogStamp", () => {
  // Both committed hardware stamps (walk-2026-08-24): date u16 0x3588,
  // time u16 0x0F03 (phone) and 0x0F0E (lab). INFERENCE formula over one
  // date/hour — these tests pin OUR decoder against the two captures.
  it("decodes the exit-7 phone stamp to Aug 24 2026 15:03", () => {
    const bytes = new Uint8Array([0x88, 0x35, 0x03, 0x0f]);
    expect(parseSummaryLogStamp(bytes)).toEqual({
      year: 2026, month: 8, day: 24, hours: 15, minutes: 3,
    });
  });
  it("decodes the lab terminate stamp to Aug 24 2026 15:14", () => {
    const bytes = new Uint8Array([0x88, 0x35, 0x0e, 0x0f]);
    expect(parseSummaryLogStamp(bytes)).toEqual({
      year: 2026, month: 8, day: 24, hours: 15, minutes: 14,
    });
  });
  // Boundary stamps pin OUR ENCODING of the formula, not the machine
  // (no capture varies these fields yet — spec §2's honest tag).
  it("round-trips boundary encodings of the inferred formula", () => {
    const enc = (y: number, mo: number, d: number, h: number, mi: number) =>
      new Uint8Array([
        (mo | (d << 4) | ((y - 2000) << 9)) & 0xff,
        (mo | (d << 4) | ((y - 2000) << 9)) >> 8,
        mi, h,
      ]);
    expect(parseSummaryLogStamp(enc(2026, 1, 1, 0, 0))).toEqual({
      year: 2026, month: 1, day: 1, hours: 0, minutes: 0,
    });
    expect(parseSummaryLogStamp(enc(2031, 12, 31, 23, 59))).toEqual({
      year: 2031, month: 12, day: 31, hours: 23, minutes: 59,
    });
  });
  it("returns null on fewer than 4 bytes", () => {
    expect(parseSummaryLogStamp(new Uint8Array([0x88, 0x35, 0x03]))).toBeNull();
  });
});
```

- [ ] **Step 2: Run** `pnpm test --project unit -- parse.test` — expect FAIL (`parseSummaryLogStamp` not exported).
- [ ] **Step 3: Implement** in `parse.ts`, beside `parseEndOfWorkoutSummary`, with a doc comment carrying the spec's evidence tag (bytes PRIMARY, formula INFERENCE over one date/hour, no vendor doc — §23 "UNCERTAIN"):

```ts
export interface SummaryLogStamp {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
}

export function parseSummaryLogStamp(
  bytes: Uint8Array,
): SummaryLogStamp | null {
  if (bytes.length < 4) return null;
  const date = readU16LE(bytes, 0);
  const time = readU16LE(bytes, 2);
  return {
    year: 2000 + (date >> 9),
    month: date & 0x0f,
    day: (date >> 4) & 0x1f,
    hours: time >> 8,
    minutes: time & 0xff,
  };
}
```

- [ ] **Step 4: Run the test again** — expect PASS. Also `pnpm typecheck`.
- [ ] **Step 5: Commit** `feat: decode the 0x0039 log date/time stamp (RC-2, diagnostic-only)`.

### Task 2: `summaryDetail` on the record + burst-eligible writer

**Files:**
- Modify: `app/src/monitor/monitorRun.ts` (field beside `verificationBytes` ~line 212; writer `appendSummaryObservations` ~line 1033)
- Test: `app/src/monitor/monitorRun.test.ts`

**Interfaces:**
- Produces: `type MachineSummaryDetail = { avgStrokeRate: number; endingHeartRateBpm: number | null; avgHeartRateBpm: number | null; minHeartRateBpm: number | null; maxHeartRateBpm: number | null; dragFactorAverage: number; workoutType: number; recoveryHeartRateBpm: number | null; avgPaceSecondsPer500m: number }` (exported). `MonitorRun.summaryDetail?: MachineSummaryDetail`. `appendSummaryObservations(runStartedAt, observations: { totals; detail: MachineSummaryDetail; verificationBytes? })` — `detail` REQUIRED in the argument (both producers always hold a parsed summary; spec finding 9).
- Consumes: nothing new.

- [ ] **Step 1: Failing tests** — extend the existing `appendSummaryObservations` describe:

```ts
it("writes summaryDetail in the same single write as summaryTotals", () => {
  // build + complete a run with endedBy "finished" (reuse the file's
  // existing helper for a completed run), then:
  const detail = {
    avgStrokeRate: 26, endingHeartRateBpm: null, avgHeartRateBpm: null,
    minHeartRateBpm: null, maxHeartRateBpm: null, dragFactorAverage: 100,
    workoutType: 8, recoveryHeartRateBpm: null, avgPaceSecondsPer500m: 124,
  };
  const next = appendSummaryObservations(startedAt, {
    totals: { workElapsedSeconds: 124, workDistanceMeters: 500 },
    detail,
    verificationBytes: [6, 71, 153, 175, 84, 176, 33, 192],
  });
  expect(next?.summaryDetail).toEqual(detail);
  expect(loadMonitorRun()?.summaryDetail).toEqual(detail);
});
it("admits a rower-ended run (Menu terminate / app STOP)", () => {
  // complete the run with endedBy: "rower"; append must succeed
});
it("still refuses link-lost and program-failed closes", () => {
  // endedBy: "link-lost" -> returns null, record untouched
});
it("write-once door still keyed on summaryTotals", () => {
  // second append returns null; first detail survives
});
```

- [ ] **Step 2: Run** `pnpm test --project unit -- monitorRun` — FAIL.
- [ ] **Step 3: Implement.** Field doc comment states: verbatim parser values, additive-optional, never migrated, `isMonitorRun` unchecked, avgPace in SECONDS (descaled). Writer guard becomes:

```ts
if (run.completedAt === null) return null;
// Burst-eligible closes only: the complement of link-lost/program-failed.
// "rower" covers BOTH venues (Menu-at-the-erg and the app's End button,
// CloseReason's own doc) and stays correct if W8's inactivity
// auto-terminate lands in "rower" later (spec §1 gate 1).
if (run.endedBy !== "finished" && run.endedBy !== "rower") return null;
if (run.summaryTotals !== undefined) return null;
const next: MonitorRun = {
  ...run,
  summaryTotals: observations.totals,
  summaryDetail: observations.detail,
  ...(observations.verificationBytes !== undefined
    ? { verificationBytes: observations.verificationBytes }
    : {}),
};
```

- [ ] **Step 4: Run tests** — PASS. `pnpm typecheck` (expect Task 3's producers to now fail compilation IF they call with the old shape — they don't yet; the event still carries totals only, so nothing else compiles against `detail` until Task 3 wires it. If typecheck breaks in `useMonitorSession`'s call site, fix that call site by passing the detail off the event in Task 3, not here — keep this commit green by making `detail` required only after checking the single existing call site compiles; if it does not, land Tasks 2+3 as one commit).
- [ ] **Step 5: Commit** `feat: the record keeps the machine's nine summary fields (RC-3 client half)`.

### Task 3: the event carries detail + the RC-2 ring entry

**Files:**
- Modify: `app/src/monitor/driver.ts` — `summaryObservationsEvent` (~line 3195) gains `detail`; both producers (split-won ~3283, the `filled-from-summary`/derive path's observation emit, and the early-side buffered flow) pass the held `WorkoutSummary`'s nine fields; `noteSummary` (~2556, right after `parseEndOfWorkoutSummary` succeeds) records the RC-2 ring entry.
- Modify: `app/src/monitor/useMonitorSession.ts` — the `summary-observations` handler passes `event.detail` through to `appendSummaryObservations`.
- Test: `app/src/monitor/driver.test.ts`, plus the existing burst replay (`app/src/monitor/burstReplay.test.ts`) extended.

**Interfaces:**
- Produces: `summary-observations` event shape gains `detail: MachineSummaryDetail` (required — every producer holds a parsed summary at the emit).
- Consumes: `MachineSummaryDetail` from Task 2, `parseSummaryLogStamp` from Task 1.

- [ ] **Step 1: Failing tests.** (a) Extend `burstReplay.test.ts`: replaying the walk-2026-08-23 keystone asserts the recorded run's `summaryDetail` equals the capture's own hand-decoded 0x0039 bytes (write the expected object from the capture's raw bytes in the test, values byte-derived, e.g. `dragFactorAverage` from offset 15 — do NOT copy from the implementation). (b) Driver test: a burst notification produces exactly one `summary-log-stamp` ring entry whose text contains the decoded `wire=` stamp and `wall=`; a second 0x0039 (the recovery-HR re-fire) produces a second entry (one per NOTIFICATION — spec exit criterion 3).
- [ ] **Step 2: Run** `pnpm test --project client -- driver burstReplay` — FAIL.
- [ ] **Step 3: Implement.** In `noteSummary` after a successful parse:

```ts
const stamp = parseSummaryLogStamp(bytes);
if (stamp !== null) {
  const pad = (n: number): string => String(n).padStart(2, "0");
  log.record(
    "summary-log-stamp",
    `wire=${stamp.year}-${pad(stamp.month)}-${pad(stamp.day)} ${pad(stamp.hours)}:${pad(stamp.minutes)} wall=${new Date(now()).toISOString()} (wire carries no seconds; DIAGNOSTIC only, never an identity - spec S2)`,
  );
}
```

(use the driver's existing clock seam if one exists — grep `now()` in driver.ts and match its idiom; never bare `Date.now()` if the driver injects time). Extend `summaryObservationsEvent(run, totals, summary)` to build `detail` from the `WorkoutSummary`'s nine fields explicitly (field-by-field object literal, not a spread — the event must not leak `elapsedSeconds`/`meters` duplicates). Update every emit site and the hook's handler (`appendSummaryObservations(run.startedAt, { totals: event.totals, detail: event.detail, ...bytes })`).

- [ ] **Step 4: Run tests + typecheck** — PASS.
- [ ] **Step 5: Commit** `feat: the burst's nine fields ride the observation event; the log stamp reaches the ring (RC-2)`.

### Task 4: the four-gate terminate capture (observations-only)

**Files:**
- Modify: `app/src/monitor/useMonitorSession.ts` (~line 2270: the `naturalFinish` predicate) — gate 1.
- Modify: `app/src/monitor/driver.ts` (terminated close branch ~2413-2415; `noteSummary`'s admission ~2595-2680) — gates 2+3.
- Test: `app/src/monitor/useMonitorSession.test.ts` (or the hook's existing test file — find it with `ls src/monitor/*.test.ts*`), fake-driven, with a REAL unmount/teardown.

**Interfaces:**
- Consumes: Task 5's `FakeBurst` terminate script (write Task 5 first if the fake cannot yet script a terminate-then-burst sequence; the plan orders Task 5 before this task's test run — read Task 5 now if implementing this).
- Produces: no new public surface; behaviour only.

- [ ] **Step 1: Failing test** (the spec's riskiest claim; MUST drive the hook, not the driver — a driver-level test is blind to gate 1):

```ts
it("captures the burst on a Menu-terminate as observations only", async () => {
  // Arm the fake with a terminate script shaped like
  // docs/monitor/sessions/walk-2026-08-24/lab-terminate-ring.json:
  // rowing ~24s into interval 1 of 1, then workoutState terminate (11),
  // partial 0x0037 (24.26s/75.6m), then ~1s later 0x0039
  // (elapsed 24.30s, meters 76.0, avgStrokeRate 44, drag 100,
  // workoutType 1, avgPace 159.8), 0x003A, 0x003F.
  // Drive the hook to connected+rowing, deliver the terminate,
  // let the app navigate/unmount (the real teardown), then advance the
  // fake past the burst delay and the linger.
  const run = loadMonitorRun();
  expect(run?.endedBy).toBe("rower");
  expect(run?.summaryTotals).toEqual({
    workElapsedSeconds: 24.3, workDistanceMeters: 76,
  });
  expect(run?.summaryDetail?.avgStrokeRate).toBe(44); // pinned anomaly
  expect(run?.verificationBytes).toHaveLength(8);
  // Observations-only: the abandoned run gained NO synthesized interval
  // and its actuals/heroes are exactly what the terminate left.
  expect(run?.actuals ?? []).toHaveLength(0);
});
```

- [ ] **Step 2: Run it** — FAIL (today: teardown disconnects at t≈0; ring-phone-3 is the production proof).
- [ ] **Step 3: Implement the gates.**
  - **Gate 1 (hook):** rename/widen the linger predicate:

```ts
// Burst-eligible: the link was still up when this closed - the
// complement of link-lost/program-failed (spec S1 gate 1). Covers
// natural finishes AND rower-ended closes (Menu terminate emits the
// identical burst ~1s later - notes S25; production heard nothing
// before this: walk-2026-08-23 ring-phone-3).
const burstEligible =
  run !== null &&
  run.completedAt !== null &&
  (run.endedBy === "finished" || run.endedBy === "rower");
```

  and use `burstEligible && !burstAlreadyHeard` where `naturalFinish && !burstAlreadyHeard` is today. Check the OTHER teardown call sites (the End-button `endSession` path ~2755) reach this same `teardown` — they do; the predicate change covers both venues.
  - **Gate 2+3 (driver):** in the terminated close branch (~2413), set a flag on the run (`run.terminatedAwaitingSummary = true`, typed on the run object beside `summaryInGrace`). In `noteSummary`, BEFORE the existing closed-run branches, add:

```ts
if (run.closed && run.terminatedAwaitingSummary) {
  // Observations-only door (spec S1 gates 2+3): a terminate summary may
  // reach the observation write ALONE. It never touches summaryInGrace,
  // never arms or drains the reconcile, and the terminate's own partial
  // 0x0037 keeps taking boundary-out-of-run - CSAFE-DEF footnote 12's
  // housekeeping boundary must never become an interval actual.
  run.terminatedAwaitingSummary = false; // once per run
  log.record(
    "summary-reconciled",
    "terminate-observations - 0x0039 after a rower-ended close is recorded as observations only; no interval is derived from it (summary-record spec S1)",
  );
  emit(summaryObservationsEvent(run, {
    workElapsedSeconds: summary.elapsedSeconds,
    workDistanceMeters: summary.meters,
  }, summary));
  return;
}
```

  Verify by reading `reconcileSummary` that nothing else can consume a terminate-path summary (`summaryInGrace` stays null on this path). The 0x003F handler's existing late-bytes flow must also work on this path — read `driver.ts:3035-3050` and extend its admission the same way if it is finished-gated.
- [ ] **Step 4: Run the test** — PASS. Run the FULL client project (`pnpm test --project client`) — the natural-finish linger tests must be untouched.
- [ ] **Step 5: Commit** `feat: a Menu-terminate's burst is captured, observations only (four gates, spec §1)`.

### Task 5: FakeBurst terminate script + loud overwrite + offsets note

**Files:**
- Modify: `app/src/monitor/transports/fake.ts` (`pendingBurst` ~line 1519, its setter ~2341, offsets doc note — grep `three offsets`)
- Test: `app/src/monitor/transports/fake.test.ts`

**Interfaces:**
- Produces: a fake script step for "terminate now, burst after delay" usable by Task 4's hook test (match the fake's existing script-step idiom — read how the natural-finish burst script is expressed and add the terminate variant beside it, emitting workoutState 11 in 0x0031 then the burst frames with the lab capture's bytes).

- [ ] **Step 1: Failing tests:** (a) scripting a second burst while one is pending throws (or console.errors AND replaces — pick throw; the slot is a scripting foot-gun, spec rider a); (b) the terminate script emits, in order: a state-11 0x0031, 0x0037, then after the scripted delay 0x0039/0x003A/0x003F with the exact lab bytes.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** the loud overwrite (`if (pendingBurst) throw new Error(\`pendingBurst already armed (\${...}); a fake script may hold at most one burst\`)`), the terminate script step, and correct the offsets note ("two offsets by spec notation" — delete the stale "three").
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat: the fake can terminate mid-piece and burst late; pendingBurst is loud`.

(Order note: implement Task 5 BEFORE Task 4's Step 2 if the fake cannot express the sequence — the task ordering here is 1,2,3,5,4 at the implementer's discretion, stated in the report.)

### Task 6: the server tier (migration 0016 + validation + round-trip)

**Files:**
- Modify: `app/server/db/schema.ts` (beside the RC-1 block ~line 239)
- Create: `app/drizzle/0016_*.sql` via `pnpm drizzle-kit generate` (NEVER hand-edit or rewrite an already-committed migration — agent-briefing's hash-hazard bullet; 0016 is new so generate is safe)
- Modify: `app/server/routes/data.ts` (validation beside `workRestQuantityError` ~1299; the INSERT's column list; the GET/list serializers that return log rows — grep `workSeconds` in data.ts for every site RC-1 touched and mirror them)
- Test: `app/server/**` integration tests (mirror `schema.integration.test.ts`'s migration-0011/0015 describe patterns)

**Interfaces:**
- Produces: columns `machineWorkSeconds` (`doublePrecision("machine_work_seconds")`), `machineWorkMeters` (`integer("machine_work_meters")`), `machineSummary` (`jsonb("machine_summary")`); POST body fields of the same names; GET responses carrying them (null for old rows).
- Consumes: nothing client-side yet (Task 7 sends them).

- [ ] **Step 1: Failing integration tests** (real Postgres, the compose test DB):

```ts
it("round-trips fractional machine totals and the summary blob", async () => {
  const res = await post("/api/logs", { ...validLogBody,
    machineWorkSeconds: 24.3,          // the terminate capture's tenths
    machineWorkMeters: 76,
    machineSummary: {
      verificationBytes: [118, 120, 230, 126, 35, 227, 228, 1],
      avgStrokeRate: 44, endingHeartRateBpm: null, avgHeartRateBpm: null,
      minHeartRateBpm: null, maxHeartRateBpm: null, dragFactorAverage: 100,
      workoutType: 1, recoveryHeartRateBpm: null, avgPaceSecondsPer500m: 159.8,
    },
  });
  expect(res.status).toBe(201);
  const got = await get(`/api/logs/${res.body.id}`);
  expect(got.body.machineWorkSeconds).toBe(24.3);
  expect(got.body.machineWorkMeters).toBe(76);
  expect(got.body.machineSummary.avgStrokeRate).toBe(44);
});
it("stores nulls when the machine fields are absent", ...);
it("400s a fractional machineWorkMeters", ...);
it("400s a machineSummary that is not an object or exceeds 2KB serialized", ...);
it("pre-migration rows read all three back as null", ...); // capped-migrations pattern from the 0011 describe block
```

- [ ] **Step 2: Run** `pnpm test --project integration` — FAIL.
- [ ] **Step 3: Implement.** Schema columns with a doc comment mirroring the RC-1 block's posture (client decides, server stores what POST validated, no backfill). Generate migration 0016. Validation in the POST handler beside the RC-1 checks: `machineWorkSeconds` via `workRestQuantityError(body.machineWorkSeconds, "machineWorkSeconds", WORK_REST_SECONDS_MAX, false)`; `machineWorkMeters` via the same with `wholeNumber: true` and the meters max; `machineSummary` accepted when `undefined`/`null`, else must be a plain object whose `JSON.stringify` length ≤ 2048 and whose `verificationBytes`, when present, is an array of exactly 8 integers 0-255 (reject otherwise, field-named 400). Store verbatim (jsonb, no `$type` — the 0011 `series` precedent). Add all three to the INSERT and to every serializer that returns a full log row.
- [ ] **Step 4: Run integration + unit** — PASS.
- [ ] **Step 5: Commit** `feat: session_logs keeps the machine's summary (migration 0016, hybrid shape)`.

### Task 7: the save carries the machine fields

**Files:**
- Modify: `app/src/session/LogSession.tsx` (the POST body type ~line 414-441 and the body construction where `workSeconds`/`endedBy` are spread)
- Test: `app/src/session/LogSession.test.tsx`

**Interfaces:**
- Consumes: `MonitorRun.summaryTotals`/`summaryDetail`/`verificationBytes` (Tasks 2-4); server fields from Task 6.
- Produces: POST body optional keys `machineWorkSeconds`, `machineWorkMeters`, `machineSummary`.

- [ ] **Step 1: Failing tests:** (a) saving with a run whose observations are present sends `machineWorkSeconds: 124`, `machineWorkMeters: 500`, and a `machineSummary` containing the nine fields + `verificationBytes` (assert on the fetch mock's body — realistic values from the walk, not round fixtures); (b) a run without observations sends none of the three keys (absent, not null); (c) `machineWorkMeters` is `Math.round(workDistanceMeters)`.
- [ ] **Step 2: Run** `pnpm test --project client -- LogSession` — FAIL.
- [ ] **Step 3: Implement** with the file's established optional-key idiom (the `endedBy`/`workSeconds` block ~line 425):

```ts
...(monitorRun?.summaryTotals !== undefined
  ? {
      machineWorkSeconds: monitorRun.summaryTotals.workElapsedSeconds,
      machineWorkMeters: Math.round(
        monitorRun.summaryTotals.workDistanceMeters,
      ),
      machineSummary: {
        ...(monitorRun.verificationBytes !== undefined
          ? { verificationBytes: [...monitorRun.verificationBytes] }
          : {}),
        ...(monitorRun.summaryDetail ?? {}),
      },
    }
  : {}),
```

  (guard: if `summaryDetail` could be absent while `summaryTotals` is present — only records written by shipped build 738 — the blob then carries bytes only; that is correct and stated in a comment).
- [ ] **Step 4: Run tests** — PASS. Then the wave gates: `pnpm lint && pnpm typecheck && pnpm test` (all projects), per-file coverage for every touched file, and `pnpm e2e` (src/ touched). Fix anything red.
- [ ] **Step 5: Commit** `feat: the save posts the machine's summary to the server row`.

### Task 8: docs reconciliation (same PR)

**Files:**
- Modify: `ROADMAP.md` — mark the RC-2/RC-3 bullets' storage half done-by-this-PR (leave display for PR 2); note the app-STOP-venue capture gap as an owed walk item alongside the terminated-piece photograph.
- Modify: `docs/monitor/pm5-interface-notes.md` — §25 gains one line: production capture of terminate bursts ships with this PR (the four gates), pointing at the spec.

- [ ] **Step 1: Make both edits** (each ≤ 6 lines, referencing the spec by path).
- [ ] **Step 2: Commit** `docs: ROADMAP + §25 reflect the terminate capture shipping`.

---

## Self-review record

- Spec coverage: §1 client (T2), server (T6, T7), four gates (T4, T5), riders a/b (T5), rider c already committed with the spec; §2 (T1, T3); §4's replay oracle (T3), terminate test (T4), write-once (T2), server round-trip (T6). §3 is PR 2 (not this plan).
- Type consistency: `MachineSummaryDetail` defined in T2, consumed in T3/T6-tests/T7. Event `detail` required (T3) matches writer's required `detail` (T2) — T2's step 4 carries the compile-coupling note.
- No placeholders; every code step carries real code or an exact named pattern to mirror (0011/0015 describe blocks, the optional-key idiom).
