# Rest-Keying Fix + Stage B Rung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop resting frames from filing a finished interval's totals
under the previous interval, and land both walk recordings as permanent
CI regression tests.

**Architecture:** One clamp in `maybeEmitFrame` (resting frames never key
below `max(session.seen.keys())`), placed BEFORE the refused-open guard.
A new test file replays both committed recordings through the real driver
via `createReplayTransport`, judged by an independent 0x0031 reader
(machine TWD + reset-detected per-interval finals). A directed synthetic
fixture pins the one conjunct no capture can test.

**Tech Stack:** TypeScript, Vitest (client project), the Stage A replay
harness. Zero new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-16-rest-keying-fix-design.md` —
binding; its antagonist amendments (measured numbers, mutant selection,
reader definition) are exact values, not suggestions.

## Global Constraints

- All `src/**` tests run under `pnpm test --project client` (NOT unit;
  the positional filter does not narrow the run — read your file's own
  lines and BOTH summary lines).
- TDD: the session-2 test goes RED on unfixed code first, and the failing
  output is captured for the PR. Do not push while red (pre-push runs
  tests); commit locally is fine (pre-commit is lint+typecheck).
- The independent reader MUST NOT read `intervalCount`, call
  `toProgramIndex`, or consume any driver output (tautology rule). It MAY
  use max-merge.
- Assertion tolerances and checkpoint values come from the spec verbatim.
- No `pnpm e2e` per task; Task 4 runs it once.
- ESM; domain imports carry `.js`; sibling transport imports extensionless.
- Commit after each task; `git rev-parse --show-toplevel` must print
  `.../.claude/worktrees/rest-keying` before every commit.
- Commands run in `app/`.

## File Structure

- Create: `app/src/monitor/registerReplay.test.ts` — the Stage B rung:
  independent reader + both recording replays. One responsibility:
  judge the driver's registers against the machine's own numbers.
- Modify: `app/src/monitor/driver.ts` (the clamp, ~15 lines inside
  `maybeEmitFrame`).
- Modify: `app/src/monitor/sessionTotals.test.ts` (the directed
  rowing-frame fixture).
- Modify: `app/domain/monitor/pm5/intervalIndex.ts` (comment-only:
  the `:80-81` evidence-base sentence).

---

### Task 1: The independent reader and the two replay tests (session 2 RED)

**Files:**
- Create: `app/src/monitor/registerReplay.test.ts`

**Interfaces:**
- Consumes: `parseRecording` from `./transports/recording`;
  `createReplayTransport` from `./transports/replay` (ReplayHandle
  `{transport, clock, run()}`); `createPm5Driver` from `./driver`
  (`DriverOptions.now`/`schedule` bound to `replay.clock` — the Stage A
  round-trip test `recordReplay.roundtrip.test.ts` is the harness
  template, including transport-level `scan()`/`connect()`; MonitorDriver
  has NO connect()); `createEventLog` from `./eventLog`; recordings at
  `../../docs/monitor/sessions/walk-2026-08-16/session-1-keystone-2x250r0.jsonl`
  and `session-2-wu-4unequal.jsonl` (resolve relative to
  `import.meta.url` by string surgery, the `captureReplay.test.ts` idiom
  — jsdom mangles `new URL` file bases). The armed program comes from
  each recording's header (`header.program`), passed to
  `driver.program(...)`.
- Produces (private to the test file — exported for nothing):

```ts
/** Independent 0x0031 reader. Reads hex payloads ONLY. Forbidden: intervalCount, toProgramIndex, driver output. */
interface MachineReading { t: number; elapsedSeconds: number; distanceMeters: number; stateByte: number; twdMeters: number; }
function readGeneralStatus(recording: ParsedRecording): MachineReading[];  // decode every 0x0031 rx: elapsed u24LE@0 (0.01s), distance u24LE@3 (0.1m), state byte @8, TWD u24LE@11 (m) — offsets per domain/monitor/pm5/parse.ts's documented layout, re-implemented here, not imported
interface HonestRegister { elapsedSeconds: number; distanceMeters: number; }
function honestRegisters(readings: MachineReading[]): Map<number, HonestRegister>;
// segments on `elapsed drop AND distance drop` (AND-rule; session 2 has THREE
// pseudo-drops it must reject: @137.1, @285.4, @456.3); per segment takes MAX
// elapsed and MAX distance over frames whose stateByte maps to
// rowing/resting/finished ordinals; maps segment k -> key k.
```

- [ ] **Step 1: Write the test file.** Structure:

```ts
// Session 1 (keystone) describe:
//  - replay through real driver (program from header; now/schedule bound)
//  - expect result.divergences toStrictEqual []
//  - expect driver register map to equal honestRegisters(readings) — via the
//    driver's session registers as exposed in `final-totals` logging or, if
//    not reachable, by asserting the emitted frames' sessionDistanceMeters /
//    sessionElapsedSeconds final values; ALSO assert the known constants:
//    accumulator distance within 1.5 of machine TWD final (500), and
//    segment count === header program interval count (2)
//  - expect ZERO clamp divergence entries in the event log
// Session 2 describe:
//  - same harness; assert segment count === 5
//  - FINAL: |accumulator − twdFinal(1599)| <= 1.5
//  - EIGHT checkpoints (spec values): at the reading nearest each of
//    t≈52.6, 112.8, 137.6, 263.1, 265.1, 422.3, 424.9, 514.9 s, the
//    driver's session distance at that point within 1.5 m of the reading's
//    twdMeters. (Capture the driver's per-frame session totals by
//    subscribing to driver.events and recording frame.sessionDistanceMeters
//    keyed by the replay clock time.)
//  - register map equals honestRegisters(readings)
//  - the event log contains clamp entries for EXACTLY keys {1, 2}
//    (count === 2 and the key set matches; kills the `<=` mutant)
```

How to read the driver's final register map: the driver logs
`final-totals` with every register at terminal transitions (R0
instrumentation, PR #99) — parse the event log's entries; if the shape is
awkward, assert via the last emitted frame's `sessionElapsedSeconds`/
`sessionDistanceMeters` plus the checkpoint series (the accumulator IS
the register sum). Choose whichever the code actually exposes; do not add
a new driver API for the test.

- [ ] **Step 2: Run — session 1 GREEN, session 2 RED.**
  `pnpm test --project client`. Session 2 must fail on the final-TWD
  assertion with accumulator ≈1819.7. Save the failing output excerpt to
  the SDD report (it is PR evidence, exit criterion 1).
- [ ] **Step 3: Commit** (locally only, no push):
  `git commit -m "test: session 2 replays red, the registers disagree with the erg by 221 metres"`.

---

### Task 2: The clamp

**Files:**
- Modify: `app/src/monitor/driver.ts` (inside `maybeEmitFrame`, after
  `activeKey` is computed at ~`:1890`, BEFORE the refused-open guard at
  `:1911` — verify line numbers by reading; they drift)

**Interfaces:**
- Consumes: `session.seen: Map<number, {elapsedSeconds, distanceMeters}>`,
  `base.state`, `activeKey`, `log.record`, and a new `Set<number>`
  throttle beside `refusedKeysLogged` (same idiom, own set — name it
  `clampedKeysLogged`).

- [ ] **Step 1: Implement exactly:**

```ts
// THE STALE-COUNT REST CLAMP (rest-keying spec, 2026-08-16). The PM5
// notifies 0x0031 before 0x0033 in every measured burst (983/983,
// walk-2026-08-16), so the first resting tick of interval N's rest can
// still carry count N; the resting -1 arm then keys N-1 and max-merge
// would keep the poison. Rest always belongs to the newest key (the
// machine numbers rests forward; keys only grow within a run), so a
// resting frame below max(seen) is the stale window by construction.
// Placed BEFORE the refused-open guard: the clamp's output is a key
// already in `seen`, which short-circuits that guard's own gate — the
// value is order-independent (both orders simulated), the LOG is not,
// and this order makes the specific diagnosis win the log. A stale
// ROWING frame needs no clamp: it keys its own just-finished interval,
// where its pair is a max-merge no-op — do not generalise this.
if (
  base.state === "resting" &&
  activeKey !== null &&
  session.seen.size > 0
) {
  const newestKey = Math.max(...session.seen.keys());
  if (activeKey < newestKey) {
    if (!clampedKeysLogged.has(activeKey)) {
      clampedKeysLogged.add(activeKey);
      log.record(
        "divergence",
        `stale-count rest clamp: resting key ${activeKey} lifted to ` +
          `${newestKey} (count lags state at the boundary)`,
      );
    }
    activeKey = newestKey;
  }
}
```

  Also: reset `clampedKeysLogged` wherever `refusedKeysLogged` resets
  (find it — likely `program()`'s session reset at ~`:4239`).
- [ ] **Step 2: Run — session 2 GREEN now, session 1 still green,
  full client project green.** Both summary lines.
- [ ] **Step 3: Self-mutation probes (report, never commit):**
  (a) revert clamp → session-2 red; (b) `<=` for `<` → the exact
  clamp-log assertion red, all numeric assertions still green (verify
  BOTH halves — that asymmetry is the evidence); (c) restore, green.
- [ ] **Step 4: Commit** `git commit -m "fix: a resting frame can no longer file its interval under the previous one"`.

---

### Task 3: The directed fixture and the comment reconciliation

**Files:**
- Modify: `app/src/monitor/sessionTotals.test.ts` (one new shape)
- Modify: `app/domain/monitor/pm5/intervalIndex.ts` (`:80-81` comment)

- [ ] **Step 1: The directed fixture** (kills the drop-resting-conjunct
  mutant, which is silent on both recordings). Using the file's existing
  wire-byte harness (`stubTransport` + `buildGeneralStatusBytes` +
  `armProgram`): establish registers key0=(200, 500), key1=(60, 150) via
  rowing frames; then drive a ROWING frame whose 0x0033 count keys it to
  0 carrying (100, 300); assert key 1's register is UNCHANGED (60, 150)
  and key 0's register is UNCHANGED (200, 500) (max-merge no-op). Name
  the test for the invariant ("a stale rowing frame never lifts to the
  newest key"), with a comment citing the spec's F2 finding.
- [ ] **Step 2: Verify it bites:** temporarily remove
  `base.state === "resting"` from the clamp — this test must go RED
  (key 1 inflated to (100, 300)); restore, green. Record in the report.
- [ ] **Step 3: The comment** — `intervalIndex.ts` ~`:80-81`: replace
  "the one hardware reading available for it (`0`) matches identity
  exactly" with the three-reading evidence base (both 2026-08-16
  recordings show the count advancing across w→w boundaries 10.6-92.9 ms
  AFTER the reset tick; identity keying during work is unchanged —
  walk-2026-08-16 diagnosis). Comment-only; run
  `pnpm test --project unit` (domain file — unit project covers
  domain/**) AND `--project client`, both summary lines.
- [ ] **Step 4: Commit** `git commit -m "test: the conjunct no capture can see gets its own fixture, and a comment catches up with the evidence"`.

---

### Task 4: Gates and the PR

- [ ] **Step 1:** `pnpm lint && pnpm typecheck && pnpm test` (all
  projects; integration needs Docker — if absent, unit+client and note
  CI covers it). Both summary lines.
- [ ] **Step 2:** `pnpm test:coverage` — per-file rows for driver.ts,
  registerReplay.test.ts targets, sessionTotals.test.ts. New clamp
  branches must be covered (they are: both recordings + fixture + log
  throttle paths).
- [ ] **Step 3:** `pnpm e2e` (diff touches app/src). No screenshots (no
  layout change).
- [ ] **Step 4:** Push, open PR titled "The finished interval stays in
  its own register". Body per the human-first rule: outcome line, ~6
  bullets (what a rower's TOTAL M does now, the +221 walk number, the
  recordings as permanent tests, testers unaffected until release),
  `<details>` Record block (spec cites, mutation evidence incl. the
  red-run excerpt, checkpoint table, coverage). This PR changes what a
  number means: the PM final gate runs before James's word (controller
  dispatches it; implementer only opens the PR).
