# Connected numbers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the connected session totals correct, and make the machine's own
total observable, without changing a single pixel.

**Architecture:** The driver's edge-triggered session fold — which banks the
previous frame's pair whenever the elapsed clock drops more than 2 s — is
replaced by a per-interval register map that merges each frame's reading into the
key the frame already carries, taking the **maximum** of each field. No edge is
detected, so no edge can be missed or misread. Instrumentation (R0) lands first,
on the broken code, so the fix is demonstrated rather than asserted.

**Tech Stack:** TypeScript 6, Vitest 4, the existing `createPm5Driver` +
`domain/monitor/pm5/statusFrames.ts` byte builders. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-15-connected-numbers-design.md`. Read
it before Task 1 — it carries the evidence and the two gate reports that reshaped
this work.

## Global Constraints

- **Worktree only.** All work happens in `.claude/worktrees/cr2-numbers`. Run
  `git rev-parse --show-toplevel` before every commit and confirm it prints that
  path. Three agents have committed to the main checkout despite being told not
  to.
- **Node 26 required.** The hooks block below `.nvmrc`. If a commit fails with
  "HOOK BLOCKED: Node >=26 required", run
  `export PATH="$HOME/.local/share/nvm/v26.5.0/bin:$PATH"` and retry. Never use
  `--no-verify`.
- **Commands run in `app/`.** `pnpm lint` · `pnpm typecheck` · `pnpm test` ·
  `pnpm test --project unit` · `pnpm e2e`.
- **Failing test first, always.** Domain code gets the heaviest coverage.
- **Assert consequences, not existence.** `expect(typeof x).toBe("function")` is
  a banned shape. Invoke it and assert the number.
- **Check per-file coverage** for every file touched. The 90×4 gate is repo-wide
  and has let new files ship with whole branches uncovered four times.
- **No em-dashes in user-facing strings.** Log `detail` strings are wire
  diagnostics and are exempt.
- **Zero visual change is a claim this plan must prove**, not assume: `pnpm e2e`
  must be green with no screenshot churn (Task 8).
- **If the plan contradicts what you observe, say so in your report** instead of
  working around it silently. Plans in this repo have carried factual errors, and
  this one was rewritten twice after two gates found some.

---

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `app/src/monitor/driver.ts` | the accumulator, R0's log lines, F7's cancel | 1, 4, 6, 7 |
| `app/src/monitor/driver.test.ts` | shape tests driving the real driver | 1, 3, 6 |
| `app/src/monitor/sessionTotals.test.ts` (new) | the seven cited shapes, one file | 3, 4 |
| `app/src/monitor/captureReplay.test.ts` (new) | the honestly-scoped replay rung | 9 |
| `app/src/monitor/transports/fake.ts` | learns the terminate re-base | 5 |
| `app/domain/monitor/types.ts` | the false premise on the public type | 7 |

`sessionTotals.test.ts` is a new file rather than more lines in
`driver.test.ts` (already 5000+ lines) because these tests share one harness and
one subject. Follow `driver.test.ts`'s existing fixture idiom.

---

## Task 1: R0 — put the accumulator into the comparison that already exists

**Files:**
- Modify: `app/src/monitor/driver.ts:2001-2018` (`logSummaryTotals`)
- Modify: `app/src/monitor/driver.ts` (the 0x0031 handler, near `:2640-2668`)
- Test: `app/src/monitor/driver.test.ts`

**Interfaces:**
- Consumes: nothing — this is the first task.
- Produces: two log kinds later tasks assert on — `summary-totals` (extended
  detail string) and a new `twd-sample` kind. The `divergence` kind already
  exists and is reused.

**This task lands on the BROKEN accumulator deliberately.** Do not fix anything
here. The point is that the instrumentation exists on the defect, so the
before/after is measurable.

- [ ] **Step 1: Write the failing test for the extended summary line**

Add to `app/src/monitor/driver.test.ts`, in a new `describe("R0 instrumentation")`:

```ts
it("prints the accumulator and the machine's own total beside 0x0039's", async () => {
  const { driver, transport, log } = await programmedDriver(MINIMAL_PROGRAM);

  // Row far enough to put something in the accumulator.
  transport.notify0x0031(buildGeneralStatusBytes({
    elapsedSeconds: 30, distanceMeters: 120.5, workoutType: 8,
    intervalType: 0, workoutState: WORKOUTSTATE_INTERVALWORKTIME,
    rowingState: 1, strokeState: 2, totalWorkDistanceMeters: 120,
    workoutDurationRaw: 6000, workoutDurationType: 0, dragFactor: 130,
  }));
  transport.notify0x0039(buildEndOfWorkoutSummaryBytes({
    elapsedSeconds: 30, meters: 120, workoutType: 8,
  }));
  await driver.settled();

  const entry = log.entries().find((e) => e.kind === "summary-totals");
  expect(entry).toBeDefined();
  // The consequence, not the existence: all five numbers are present.
  expect(entry!.detail).toContain("distance=120m");
  expect(entry!.detail).toContain("accumulator=120.5m");
  expect(entry!.detail).toContain("accumulatorElapsed=30s");
  expect(entry!.detail).toContain("machineTotal=120m");
});
```

If `programmedDriver`, `notify0x0031`, `notify0x0039` or `settled` do not exist
under those exact names in `driver.test.ts`, use whatever the file's existing
`stubTransport` idiom provides (see `driver.test.ts:492`) and adapt the names —
do not invent a new harness. Report the names you used.

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm test --project unit -t "prints the accumulator"`
Expected: FAIL — the detail string has no `accumulator=` or `machineTotal=`.

- [ ] **Step 3: Extend `logSummaryTotals`**

In `driver.ts`, `logSummaryTotals` currently interpolates `summary.elapsedSeconds`
and `summary.meters` plus the `against` clause. Add the three numbers. The
function already receives `run`; read the accumulator from the driver's `session`
state and the machine's total from `raw`:

```ts
log.record(
  "summary-totals",
  `0x0039 decoded: elapsed=${summary.elapsedSeconds}s distance=${summary.meters}m ` +
    `workoutType=${summary.workoutType} | accumulator=${sessionDistanceMeters()}m ` +
    `accumulatorElapsed=${sessionElapsedSeconds()}s ` +
    `machineTotal=${raw.totalWorkDistanceMeters ?? "?"}m ` +
    `durationType=${raw.workoutDurationType ?? "?"} (${against}). ` +
    `§23 walk items 2 and 4 settle HERE, by comparing the two elapsed figures: ` +
    /* ...keep the existing explanatory tail verbatim... */
);
```

Keep the existing explanatory tail.

**A trap this plan nearly set for you.** `logSummaryTotals` fires at the finish,
on the 0x0039 path — it has no `base` frame in hand, so it cannot recompute
today's `session.offsetDistance + base.distanceMeters`. Do **not** try to derive
it there. Instead cache the pair as each frame is emitted, next to `session`:

```ts
/** The last totals actually PUT ON A FRAME. `logSummaryTotals` fires on
 *  0x0039, which carries no per-interval pair of its own, so the value the
 *  rower last saw has to be remembered rather than recomputed. */
let lastEmittedTotals = { elapsedSeconds: 0, distanceMeters: 0 };
```

Set it in `maybeEmitFrame` immediately after `frame` is built, and read it in
`logSummaryTotals`. Task 4 changes how the totals are computed; it does not
change this cache.

- [ ] **Step 4: Run it and confirm it passes**

Run: `pnpm test --project unit -t "prints the accumulator"`
Expected: PASS.

- [ ] **Step 5: Write the failing test for the mid-piece TWD sample**

```ts
it("samples the machine's own total mid-piece, at a bounded cadence", async () => {
  const { driver, transport, log } = await programmedDriver(MINIMAL_PROGRAM);
  const status = (d: number, twd: number) => buildGeneralStatusBytes({
    elapsedSeconds: d / 4, distanceMeters: d, workoutType: 8,
    intervalType: 0, workoutState: WORKOUTSTATE_INTERVALWORKTIME,
    rowingState: 1, strokeState: 2, totalWorkDistanceMeters: twd,
    workoutDurationRaw: 6000, workoutDurationType: 0, dragFactor: 130,
  });
  // Ten frames, but the machine's whole-metre total only advances five times.
  for (const [d, twd] of [[1,1],[1.4,1],[2,2],[2.6,2],[3,3],[3.4,3],[4,4],[4.6,4],[5,5],[5.5,5]] as const) {
    transport.notify0x0031(status(d, twd));
  }
  await driver.settled();

  const samples = log.entries().filter((e) => e.kind === "twd-sample");
  // Bounded: one per whole-metre change, not one per notification.
  expect(samples).toHaveLength(5);
  expect(samples[4]!.detail).toContain("machineTotal=5m");
});
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `pnpm test --project unit -t "samples the machine's own total"`
Expected: FAIL — no `twd-sample` entries exist.

- [ ] **Step 7: Add the bounded-cadence sample**

Beside `lastLoggedStructure` (`driver.ts:1107-1110`), add:

```ts
/** R0 (CR2 spec 1). 0x0031 carries an absolute Total Work Distance that
 *  `parseGeneralStatus` has always decoded and this driver has always
 *  thrown away, so the one field that could retire the accumulator has
 *  never been observed mid-piece — an absence that was OURS, not the
 *  machine's (see the spec's own correction). Sampled on WHOLE-METRE
 *  CHANGE only, the same on-change discipline `lastLoggedStructure` uses
 *  and for the identical flood reason: 0x0031 notifies ~2/second and the
 *  ring holds 500 entries. */
let lastLoggedTwd: number | null = null;
```

In the 0x0031 handler, beside the `structure` block:

```ts
if (decoded.totalWorkDistanceMeters !== lastLoggedTwd) {
  lastLoggedTwd = decoded.totalWorkDistanceMeters;
  log.record(
    "twd-sample",
    `machineTotal=${decoded.totalWorkDistanceMeters}m at elapsed=${decoded.elapsedSeconds}s ` +
      `distance=${decoded.distanceMeters}m workoutState=${decoded.workoutState} ` +
      `durationRaw=${decoded.workoutDurationRaw} durationType=${decoded.workoutDurationType}`,
  );
}
```

`workoutState` and `durationType` are in the string on purpose: the antagonist
established that characterising when this field appears without decoding the
state byte is exactly how the last wrong conclusion was reached.

- [ ] **Step 8: Run both tests and the full unit project**

Run: `pnpm test --project unit`
Expected: PASS, no regressions.

- [ ] **Step 9: Check per-file coverage for `driver.ts`**

Run: `pnpm test:coverage --project unit`
Read `driver.ts`'s own row. Both new branches must be covered.

- [ ] **Step 10: Commit**

```bash
git rev-parse --show-toplevel   # must print .../worktrees/cr2-numbers
git add app/src/monitor/driver.ts app/src/monitor/driver.test.ts
git commit -m "feat: the accumulator finally stands next to the number it contradicts"
```

---

## Task 2: Reconstruct the four §F2 segment numbers, or stop

**Files:**
- Create: `app/src/monitor/sessionTotals.test.ts` (harness only, no assertions yet)

**Interfaces:**
- Consumes: Task 1's driver (unchanged behaviour).
- Produces: `feedShape(driver, transport, frames)` and `totalsFor(...)` helpers
  that Tasks 3 and 4 use.

**This is a stop-gate, not a feature.** The spec's numbers come from §F2's replay
and were NOT reproduced by the controller. If they do not reproduce, the plan
halts and reports rather than proceeding — a fix aimed at numbers nobody could
reproduce is a fix aimed at nothing.

- [ ] **Step 1: Build the harness**

Create `app/src/monitor/sessionTotals.test.ts` with a helper that programs a
driver and feeds hand-built 0x0031 + 0x0033 payloads:

```ts
/** Feeds one 0x0031 (and optionally a 0x0033 interval-count update) and
 *  returns the frame the driver emitted. 0x0033 is SEPARATE on purpose:
 *  the no-rest boundary in Task 3 depends on withholding it for one tick,
 *  which is the whole mechanism. */
async function tick(
  h: Harness,
  f: { elapsed: number; distance: number; state: number; twd?: number },
  intervalCount?: number,
): Promise<MonitorFrame> { /* ... */ }
```

- [ ] **Step 2: Reproduce the terminate segment**

Feed the L5342 shape — rowing to 23.9 m, then a Terminate frame whose elapsed
jumps backwards to a smaller non-zero value while distance stands still — and
print `frame.sessionDistanceMeters`.

Expected under today's fold: **47.8 m for 23.9 m of rowing** (exactly 2.00x).

- [ ] **Step 3: Reproduce the no-completed-interval segment**

Expected under today's fold: **108.4 m against a truth of 0 m.**

- [ ] **Step 4: Reproduce the sound segment**

§F2 says a 3 × 1:00-with-rest piece reports **455.1 m, exact**. Note: this number
is NOT reproducible from §F2's Appendix recipe (segmenting at each `armed` yields
525.2 m); the antagonist located the real slice as **frames L1–L428 of
`pm5-session3-final.log.gz`**. Reproduce the shape, not the file slice.

- [ ] **Step 5: STOP AND REPORT if any of the three disagree**

If a number differs, do not adjust it to match and do not proceed to Task 3.
Report the number you got, the shape you fed, and stop. Two gates have already
found errors in this spec's antecedents; a third is entirely possible.

- [ ] **Step 6: Commit the harness**

```bash
git rev-parse --show-toplevel
git add app/src/monitor/sessionTotals.test.ts
git commit -m "test: the harness that can actually reach the accumulator"
```

---

## Task 3: The seven shapes, written against the CURRENT code

**Files:**
- Modify: `app/src/monitor/sessionTotals.test.ts`

**Interfaces:**
- Consumes: Task 2's `tick`/`Harness`.
- Produces: the failing suite Task 4 must turn green.

**Read this before writing:** these tests do NOT all fail today. The terminate
shapes fail (the bug). **The no-rest boundary PASSES today** — the existing fold
gets it right — and it is here as a *regression guard*, because the design
originally chosen for this spec would have broken it. A test that passes both
before and after proves nothing; this one must fail if the implementation ever
uses last-write-wins.

- [ ] **Step 1: Terminate re-base (fails today)**

```ts
it("a terminate does not double the session distance", async () => {
  const h = await programmed(MINIMAL_PROGRAM);
  await tick(h, { elapsed: 33.57, distance: 23.9, state: WORKOUTSTATE_INTERVALWORKTIME }, 0);
  // CSAFE-DEF footnote 12: elapsed jumps BACK to a smaller non-zero value,
  // distance stands exactly still. Six of these are in the record.
  const f = await tick(h, { elapsed: 21.51, distance: 23.9, state: WORKOUTSTATE_TERMINATE });
  expect(f.sessionDistanceMeters).toBeCloseTo(23.9, 1);   // today: 47.8
});
```

- [ ] **Step 2: The no-rest work→work boundary (passes today, MUST fail under last-write-wins)**

```ts
it("keeps a completed interval when 0x0033's index lags 0x0031's reset", async () => {
  const h = await programmed(TWO_INTERVAL_NO_REST_PROGRAM);
  await tick(h, { elapsed: 59.83, distance: 74.4, state: WORKOUTSTATE_INTERVALWORKTIME }, 0);
  // pm5-session4b L2837: the counters reset one notification BEFORE the
  // interval count increments, so this frame still carries key 0.
  await tick(h, { elapsed: 0, distance: 0, state: WORKOUTSTATE_INTERVALWORKTIME }, 0);
  // L2838: the index catches up.
  const f = await tick(h, { elapsed: 0.5, distance: 1.2, state: WORKOUTSTATE_INTERVALWORKTIME }, 1);
  // 74.4 must survive. Last-write-wins writes (0,0) onto key 0 and reports 1.2.
  expect(f.sessionDistanceMeters).toBeGreaterThan(74);
});
```

- [ ] **Step 3: Clean rest boundary (passes today)**

Both intervals present and summed, driven through a `resting` tick so
`toProgramIndex`'s state-keyed path is exercised.

- [ ] **Step 4: Divergence stretch keeps the number moving**

```ts
it("keeps the total moving when the machine reports no interval identity", async () => {
  const h = await programmed(MINIMAL_PROGRAM);
  await tick(h, { elapsed: 30, distance: 100, state: WORKOUTSTATE_INTERVALWORKTIME }, 0);
  // An interval count the armed program cannot explain -> toProgramIndex
  // returns null while the machine is genuinely rowing. 21% of rowing
  // frames in the record look like this.
  const f = await tick(h, { elapsed: 40, distance: 140, state: WORKOUTSTATE_INTERVALWORKTIME }, 99);
  expect(f.sessionDistanceMeters).toBeGreaterThan(100);   // must NOT freeze
});
```

- [ ] **Step 5: Re-arm after terminate writes no key**

- [ ] **Step 6: Gap inside an interval converges**

Feed a reading, skip several ticks, resume with a larger reading on the same
key. Assert the total equals the resumed reading, not the sum.

- [ ] **Step 7: Gap across a whole interval loses it, and SAYS SO**

```ts
it("loses an interval it never saw, and logs that it did", async () => {
  // ...feed interval 0, skip ALL of interval 1, resume in interval 2...
  expect(f.sessionDistanceMeters).toBeCloseTo(expectedWithoutInterval1, 1);
  const div = h.log.entries().filter((e) => e.kind === "divergence");
  expect(div.some((e) => e.detail.includes("intervals seen"))).toBe(true);
});
```

- [ ] **Step 8: Run the suite and record which pass and which fail**

Run: `pnpm test --project unit sessionTotals`
Expected: Steps 1, 4, 7 FAIL. Steps 2, 3, 5, 6 PASS.

**Write the pass/fail split into your report.** Task 4's job is to flip the
failures without flipping the passes, and Step 2 flipping is the alarm.

- [ ] **Step 9: Commit**

```bash
git rev-parse --show-toplevel
git add app/src/monitor/sessionTotals.test.ts
git commit -m "test: seven shapes the wire actually produces, three of them red"
```

---

## Task 4: Replace the fold with the max-merge register map

**Files:**
- Modify: `app/src/monitor/driver.ts:830` (delete `SESSION_RESET_ELAPSED_DROP`)
- Modify: `app/src/monitor/driver.ts:1060-1093` (the `session` state + its comment)
- Modify: `app/src/monitor/driver.ts:1678-1700` (the fold, in `maybeEmitFrame`)
- Modify: `app/src/monitor/driver.ts:3676` (the per-run reset)

**Interfaces:**
- Consumes: Task 3's suite; Task 1's `sessionDistanceMeters()`/`sessionElapsedSeconds()` helper names.
- Produces: `session.seen: Map<number, {elapsedSeconds, distanceMeters}>`, replacing
  `offsetElapsed`/`offsetDistance`/`prev`.

- [ ] **Step 1: Replace the state**

```ts
/** THE SESSION REGISTER MAP (CR2 spec 1, replacing walk 4's fold).
 *
 *  0x0031's Elapsed Time and Distance are PER-INTERVAL. The fold this
 *  replaces detected a new interval by watching the clock DROP, which is
 *  edge-triggered, and a missed or misread edge is permanent: a Terminate
 *  re-bases elapsed to a smaller non-zero value while distance stands
 *  still (CSAFE-DEF footnote 12), and the fold banked a distance the
 *  machine never cleared — an exact 2.00x, six times in the record.
 *
 *  This holds each interval's reading under the key the frame already
 *  carries, merged by MAXIMUM. No edge is detected, so none can be missed.
 *
 *  Maximum, not last-write-wins, for two independently-found reasons:
 *  `toProgramIndex` clamps at both ends so the key is not injective; and
 *  at a work->work boundary with NO intervening rest, 0x0031's counters
 *  reset one notification BEFORE 0x0033's Interval Count increments, so a
 *  (0,0) frame still carrying the completed interval's key would clobber
 *  it (pm5-session4b L2835-2838, 74.4m). The counters are monotone within
 *  an interval, so maximum equals last in every honest case.
 *
 *  HONEST LIMIT: an interval that produces ZERO frames is lost, because
 *  nothing ever writes its key. That is bounded (it cannot compound) and
 *  it errs SAFE — an undercount makes TOTAL LEFT read high, where the old
 *  defect made it read zero mid-session. It is reported, not silent: see
 *  the interval-count divergence at the finish.
 */
let session = {
  seen: new Map<number, { elapsedSeconds: number; distanceMeters: number }>(),
};
```

- [ ] **Step 2: Replace the fold**

```ts
// THE REGISTER WRITE (CR2 spec 1 — see `session`'s own doc comment).
// Done BEFORE the frame is finished so the emitted frame already carries
// the totals, and deliberately AFTER `computeRemainingForFrame`'s inputs
// are untouched: `intervalRemaining` reads the RAW per-interval pair and
// walk 4 proved that countdown correct exactly as it stands.
const activeKey =
  intervalIndex ??
  // The machine is rowing/resting but reports an identity the armed
  // program cannot explain. Attributing to the newest key keeps the
  // rower's number MOVING (freezing it reproduces the very symptom this
  // change exists to fix) and, being a max into an existing key, cannot
  // double count. Logged as divergence below, never silent.
  ((base.state === "rowing" || base.state === "resting") && session.seen.size > 0
    ? Math.max(...session.seen.keys())
    : null);

if (activeKey !== null) {
  const prior = session.seen.get(activeKey);
  session.seen.set(activeKey, {
    elapsedSeconds: Math.max(prior?.elapsedSeconds ?? 0, base.elapsedSeconds),
    distanceMeters: Math.max(prior?.distanceMeters ?? 0, base.distanceMeters),
  });
}
```

And the read:

```ts
const totals = [...session.seen.values()];
const frame: MonitorFrame = {
  ...frameWithIndex,
  intervalRemaining: computeRemainingForFrame(frameWithIndex),
  intervalAccrued: computeAccruedForFrame(frameWithIndex),
  // An EMPTY map falls back to the raw pair: a JustRow with no program
  // armed has no interval identity at all, and there per-interval IS the
  // session.
  sessionElapsedSeconds: totals.length === 0
    ? base.elapsedSeconds
    : totals.reduce((a, r) => a + r.elapsedSeconds, 0),
  sessionDistanceMeters: totals.length === 0
    ? base.distanceMeters
    : totals.reduce((a, r) => a + r.distanceMeters, 0),
};
```

- [ ] **Step 3: Update the per-run reset at `:3676`**

```ts
session = { seen: new Map() };
```

Keep the surrounding comment's reasoning; correct its wording (it names
`prev` and the banked offsets, which no longer exist).

- [ ] **Step 4: Delete `SESSION_RESET_ELAPSED_DROP`**

Remove the constant at `:830` and any remaining reference. `pnpm typecheck`
finds them.

- [ ] **Step 5: Run the shape suite**

Run: `pnpm test --project unit sessionTotals`
Expected: **all seven PASS.**

**If Step 2 of Task 3 (the no-rest boundary) now fails, stop.** That means the
implementation is behaving like last-write-wins somewhere, which is the exact
regression this design exists to avoid.

- [ ] **Step 6: Prove the guard bites (self-mutation)**

Temporarily change the write to `session.seen.set(activeKey, {elapsedSeconds: base.elapsedSeconds, distanceMeters: base.distanceMeters})` — i.e. last-write-wins.

Run: `pnpm test --project unit sessionTotals`
Expected: the no-rest boundary test **FAILS**. Revert the mutation.

A guard that cannot fail is a guard that proves nothing; this repo nearly
deleted three working pins over exactly that mistake.

- [ ] **Step 7: Run the whole unit + client suite**

Run: `pnpm test --project unit --project client`

**Read BOTH summary lines.** Vitest's "Tests" line reports all-passed while a
file that failed to LOAD contributes zero — grep "Test Files" too.

- [ ] **Step 8: Commit**

```bash
git rev-parse --show-toplevel
git add app/src/monitor/driver.ts app/src/monitor/sessionTotals.test.ts
git commit -m "fix: the session total stops guessing where the intervals are"
```

---

## Task 5: The interval-count divergence, so a lost interval is not silent

**Files:**
- Modify: `app/src/monitor/driver.ts` (`logSummaryTotals`)
- Modify: `app/src/monitor/sessionTotals.test.ts`

- [ ] **Step 1: Write the failing test**

At the finish, with a program of 3 intervals and only 2 keys in the map, a
`divergence` entry naming both counts must be recorded.

- [ ] **Step 2: Run it, confirm it fails**

- [ ] **Step 3: Implement, in `logSummaryTotals`**

```ts
const programIntervals = run?.program.intervals.length ?? 0;
if (programIntervals > 0 && session.seen.size !== programIntervals) {
  log.record(
    "divergence",
    `${session.seen.size} intervals seen of ${programIntervals} programmed — ` +
      `the session total is missing any interval that produced no frames ` +
      `(bounded loss, CR2 spec 1). Keys seen: ${[...session.seen.keys()].join(",")}`,
  );
}
```

And the TWD comparison, with the suppression the spec fixed:

```ts
// Suppressed on distance goals: the machine reports the GOAL there, not
// the metres rowed (500 at 13.4m rowed, PRIMARY — and confirmed mid-row
// at workoutState 5, not merely at arm). Widened to any program CONTAINING
// a distance interval, because `workoutDurationType`'s scope is per-frame
// and `compileProgram` emits mixed programs.
const distanceGoal =
  raw.workoutDurationType === 128 ||
  (run?.program.intervals.some((i) => i.kind === "distance") ?? false);
const delta = Math.abs(lastEmittedTotals.distanceMeters - (raw.totalWorkDistanceMeters ?? 0));
if (!distanceGoal && delta > 5) {
  log.record("divergence", `accumulator and machine total differ by ${delta.toFixed(1)}m`);
}
```

**5 m absolute, with no percentage arm.** A percentage would make the alarm less
sensitive as the session lengthens, and one lost 500 m interval in a 20×500 is
exactly 5% — precisely the failure mode this design introduces.

- [ ] **Step 4: Run, confirm pass. Step 5: Commit.**

```bash
git commit -m "feat: a lost interval says so instead of vanishing"
```

---

## Task 6: F7 — stop cancelling a verdict we can already reach

**Files:**
- Modify: `app/src/monitor/driver.ts:1495-1507`
- Test: `app/src/monitor/driver.test.ts`

- [ ] **Step 1: Write the failing test**

Drop the link at t+400 ms **after** a 0x0039 has arrived and been decoded, with
the run closed. Assert the log screen's fill happens — `1 OF 1 INTERVALS
MEASURED`, not `0 OF 1`.

- [ ] **Step 2: Run it, confirm it fails**

- [ ] **Step 3: Narrow the cancel**

The rule: cancel the deadline's ability to **wait for more wire evidence**; do
not cancel the verdict it can already reach. If the summary has already arrived,
run the reconcile synchronously instead of dropping it. Check the hook's hold is
still open rather than assuming it.

- [ ] **Step 4: Rewrite the comment even though the behaviour changed**

The existing comment (`:1495-1505`) gives two reasons, and both are false for
this case: "cancelling costs the run nothing it still had" (the fill needs no
wire traffic) and "a screen that is being torn down" (the 3500 ms hold exists to
keep it mounted). It is testimony that was true of an earlier design. Replace
it; do not leave a corrected behaviour under an argument for the old one.

- [ ] **Step 5: Run, confirm pass. Step 6: Commit.**

```bash
git commit -m "fix: the link dying no longer throws away a summary already in hand"
```

---

## Task 7: Correct the record — the premise that is false on the wire

**Files:**
- Modify: `app/domain/monitor/types.ts:30-45`
- Modify: `app/src/monitor/driver.ts:1060-1065`

- [ ] **Step 1: Correct the public type's comment**

`types.ts` currently asserts "BOTH fields reset together at each new work
interval". Measured false: across the record there are elapsed-drops that do not
reset distance at all, every one carrying real distance being a Terminate.
Rewrite to state what is true, and name the Terminate case explicitly.

- [ ] **Step 2: Correct the same claim in `driver.ts:1062-1063`.**

- [ ] **Step 3: Reconcile `docs/design/DEVIATIONS.md`**

Grep it for rows describing the fold or the session totals. It documents
*current state*, not history — rows have described deleted code before.

- [ ] **Step 4: `pnpm lint && pnpm typecheck`. Step 5: Commit.**

```bash
git commit -m "docs: the type stops asserting a premise the wire disproves"
```

---

## Task 8: Teach the fake the terminate shape

**Files:**
- Modify: `app/src/monitor/transports/fake.ts`

**Why this is in scope and not a follow-up:** the fake cannot currently produce
elapsed jumping backwards to a smaller non-zero value while distance stands
still. A fix verified only against it is verified against a machine that cannot
exhibit the interesting half of the bug.

- [ ] **Step 1: Add a scripted terminate re-base to the fake's wire.**
- [ ] **Step 2: Add a test driving the FAKE (not hand-built bytes) through it, asserting the total does not double.**
- [ ] **Step 3: Also correct `fake.ts:645`**, which sets `totalWorkDistanceMeters` to the per-interval distance. The real semantics are: metres rowed truncated on time goals, the GOAL on distance goals. Leaving it wrong makes any future TWD test prove nothing.
- [ ] **Step 4: Run, confirm pass. Step 5: Commit.**

```bash
git commit -m "test: the fake can finally do the thing that broke us"
```

---

## Task 9: The replay rung, scoped to what it can honestly assert

**Files:**
- Create: `app/src/monitor/captureReplay.test.ts`

**Read this first.** A replay **cannot** exercise the register map, for three
independent reasons: the captures store decoded `MonitorFrame` JSON rather than
wire bytes; the re-encode harness zero-fills 0x0033; and a replay never calls
`program()`, so `programLength` is 0 and `intervalIndex.ts:167` returns `null`
before it even looks at state. Do not try to make it. Do not synthesize 0x0033
by inverting the recorded index through `toMachineIndex` — that is the exact
tautology `intervalIndex.ts:32-46` was written to prevent.

- [ ] **Step 1: Assert frame-level invariants only.**

Read `docs/monitor/sessions/*.log.gz`, and assert relationships that need no
program: every `terminated` frame carries `intervalIndex: null` (zero exceptions
across the record); the classified drop populations match the spec's table.

**Classify by RESET DETECTION — an elapsed drop >2 s AND a distance drop — using
`intervalIndex` nowhere.** This is spec exit criterion 4 and it is not
cosmetic: "each interval's own final pre-reset reading" has a second, natural
reading that groups frames by their recorded `intervalIndex`, which derives the
oracle from the very field the implementation keys on, so the two would agree by
construction. **Put that reason in a comment in this file**, naming the field the
oracle must not touch.

- [ ] **Step 2: Write the file's own limits into a header comment** — all three
  reasons above, so the next person does not spend a day discovering them again.

- [ ] **Step 3: Note the captures are ONE capture.**
  `session3 ⊂ session4a ⊂ session4b`, byte-for-byte prefixes. The test must not
  claim three independent confirmations. Assert the containment, so the claim
  stays true.

- [ ] **Step 4: Run, confirm pass. Step 5: Commit.**

```bash
git commit -m "test: 25,511 captured frames stop being read by nothing at all"
```

---

## Task 10: Gates, and the claim of zero visual change

- [ ] **Step 1:** `pnpm lint`
- [ ] **Step 2:** `pnpm typecheck`
- [ ] **Step 3:** `pnpm test` — read **both** summary lines.
- [ ] **Step 4:** `pnpm test:coverage` — read the per-file rows for `driver.ts`,
      `fake.ts` and every new test file. The repo-wide 90×4 gate does not protect
      a new file.
- [ ] **Step 5:** `pnpm e2e` — **must be green with no screenshot churn.** This
      spec claims it changes nothing visible; a changed screenshot is that claim
      being false, and the diff does touch `app/src/`.
- [ ] **Step 6:** Open `git diff --stat` and confirm zero files under
      `app/src/workout/` or `app/src/components/`.
- [ ] **Step 7: Push and open the PR.**

The PR body carries: the before/after numbers for all seven shapes; the
self-mutation result from Task 4 Step 6; the per-file coverage numbers; and an
explicit statement that **the hardware walk gates the merge, not CI**.

- [ ] **Step 8: Do NOT merge.**

`CLAUDE.md` is explicit: no merges without James's word, and this spec merges on
the walk rather than on green CI. Present the verdict and stop. The
`product-manager` gate runs again on the final PR before his merge word.

---

## The walk this plan owes

One erg session, covering CR2 items 0 and 3 together (the review's R6), so James
is asked once:

1. Row a multi-interval piece. **Photograph the PM5 and the phone in ONE FRAME**
   with the totals visible on both. This is the only check that compares the app
   against the machine rather than against itself.
2. Read the `summary-totals` entry from the stash. Confirm the accumulator,
   0x0039's decoded total and `machineTotal` agree.
3. Read the `twd-sample` entries. **Does TWD track metres rowed mid-piece on a
   TIME goal?** No sample of this exists anywhere in the record; it decides
   whether R7 can retire the map entirely.
4. **Does the PM5's own displayed total include rest-coasting metres?** Our
   per-interval counter accrues them (76.1 m over one 30 s rest). If the monitor
   excludes them, the map reads systematically high against what James sees, and
   the fix is not finished. **This is the most important question on the list.**
5. For spec 2, in the same session: on piece TWO, before pulling, what does the
   PM5's own screen show for rate?
