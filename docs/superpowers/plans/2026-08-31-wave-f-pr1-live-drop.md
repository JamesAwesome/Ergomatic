# Wave F PR 1 — Live Program Drop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the erg drops the program mid-row, close the record with the new
`"program-dropped"` close reason, keep every completed interval, and hand off
to the log screen — instead of silently ignoring the event as today.

**Architecture:** The driver already detects the drop (RC-37) and emits
`programDropped`; only the hook's live arm swallows it. The fix is a third
`endByMachine`-shaped close inside the existing `programDropped` handler,
plus one new published session field (`closeReason`) so the ended frame can
tell the truth, plus the stored/server union widened end to end (a Postgres
enum migration), plus two Gate-0-approved copy surfaces.

**Tech Stack:** React 19 client hook + components; Express 5 server;
Drizzle/Postgres migration; Vitest (unit/client/integration projects).

**Spec:** `docs/superpowers/specs/2026-08-31-lifecycle-design.md` §1 (rev 4,
merged as #245, Gate 0 CLEARED in full). Read §1 before any task — every
behavioural rule below is argued there.

## Global Constraints

- Worktree: `/Users/james/projects/github/jamesawesome/Ergomatic-wt-livedrop`
  (branch `wave-f-pr1-live-drop`). Run `git rev-parse --show-toplevel` before
  EVERY commit and confirm it prints that path. Shell writes use absolute
  paths (RF20).
- All commands run in `<worktree>/app/` unless stated.
- **Gate-0 copy is EXACT and frozen** (spec §1 "Copy — GATE 0"):
  - Log strip title: `THE ERG DROPPED THE WORKOUT.`
  - Log strip body (kept ≥ 1): `2 intervals kept. The row below is what the
    erg measured before it stopped.` — the count from `measuredIntervalCount`,
    `1 interval kept.` singular.
  - Log strip body (kept = 0): `Nothing kept. You had not finished an
    interval yet.`
  - Interim ended frame body line (sentence case, that surface's voice):
    `The erg dropped the workout. 2 intervals kept.` /
    `The erg dropped the workout. Nothing kept.`
  - Copy says "erg"/"monitor", NEVER "PM5" (RC-18 standing rule). No
    em-dashes in user-facing strings (house style).
- **No `terminate()` is ever sent on this path** (James's RC-37 ruling,
  inherited by the live arm — spec §1 Mechanism).
- **No split hold, no burst hold** on this close;
  `noHoldCloseVerdict(false)` runs the durable verify synchronously
  (spec §1 Mechanism — `openBurstHold` would be a no-op here anyway and a
  burst can never be stored for this close reason).
- **The live arm does NOT set `programDropped: true`** — that boolean is the
  pre-row exit signal (`ConnectedInterstitial.tsx:347-350` calls `onExit()`
  on it). Setting it would race the ended hand-off (spec §1, review P1-1).
- The three server sites widen **in the same commit** as the client union
  (spec §1 "The migration, owned").
- Test footguns: `pnpm test --project client -- <pattern>` silently runs the
  FULL suite; `pnpm exec vitest run --project client <file>` runs client
  files OUTSIDE jsdom. Scope with `pnpm exec vitest run --project client -t
  "<name>"` or run the whole project. Read BOTH summary lines ("Test Files"
  too). Integration project needs Docker.
- Typed-lint ratchet: no new suppressions. TDD: failing test first. Commit
  the real change BEFORE any mutation probe (RF22). Every new assertion gets
  a biting mutation, reported with what the failure said (RF21).
- Per-file coverage for every file touched (RF2), not the aggregate gate.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/monitor/monitorRun.ts` | `CloseReason` union + load-membership check (client stored shape) |
| `server/db/schema.ts` | `endedByEnum` pgEnum gains the value |
| `server/stores/logs.ts` | server `EndedBy` union (hand-copied mirror — widen it) |
| `server/routes/data.ts` | `ENDED_BY_VALUES` + validator error string |
| `drizzle/0017_*.sql` (new) | `ALTER TYPE ... ADD VALUE 'program-dropped'` |
| `server/routes/endedBy.integration.test.ts` | the POST seam test (extend) |
| `src/monitor/useMonitorSession.ts` | live arm in the `programDropped` handler; `closeReason` session field |
| `src/monitor/useMonitorSession.test.ts` | live-arm unit tests |
| `src/workout/ConnectedSurface.tsx` | interim ended frame body line |
| `src/workout/ConnectedSurface.test.tsx` | rendered-path test before the route effect |
| `src/session/LogSession.tsx` | the log strip |
| `src/session/LogSession.test.tsx` | strip tests |
| `src/index.css` | strip styles (Gate-0 tokens) |
| `src/workout/WorkoutDetail.connectedRecovery.test.tsx` idiom → new `src/workout/WorkoutDetail.programDropped.test.tsx` | full composition drive-through |

---

### Task 1: The stored shape widens end to end

**Files:**
- Modify: `src/monitor/monitorRun.ts:51` (union), `:438-443` (membership)
- Modify: `server/db/schema.ts:68-74`, `server/stores/logs.ts:40-43`,
  `server/routes/data.ts:65-70` and `:169`
- Create: `drizzle/0017_<generated-name>.sql`
- Test: `server/routes/endedBy.integration.test.ts` (extend),
  `server/stores/contracts/contracts.fake.test.ts` +
  `contracts.real.integration.test.ts` (round-trip — find the `endedBy`
  member list and add the value)

**Interfaces:**
- Produces: `CloseReason = "finished" | "rower" | "link-lost" |
  "program-failed" | "program-dropped"` — every later task imports this.

- [ ] **Step 1: Write the failing integration test** — extend
  `server/routes/endedBy.integration.test.ts` with a leg modeled exactly on
  its existing per-value legs: POST a log row carrying
  `endedBy: "program-dropped"`, expect 200, GET it back and assert the field
  round-trips. Read that file first; copy its existing leg shape verbatim
  with the new value.
- [ ] **Step 2: Run it, verify it fails** with the validator's 400
  (`endedBy must be one of ...`). Docker up; run:
  `pnpm test --project integration -t "program-dropped"` — confirm "Test
  Files 1 failed" on the right file.
- [ ] **Step 3: Widen the client union** in `src/monitor/monitorRun.ts`:

```ts
export type CloseReason =
  | "finished"
  | "rower"
  | "link-lost"
  | "program-failed"
  | "program-dropped";
```

  and add `value.endedBy === "program-dropped" ||` to the shallow membership
  check beside its siblings (`monitorRun.ts:438-443`). Extend the comment's
  "four new `CloseReason` values" wording to five.
- [ ] **Step 4: Widen the three server sites in the same edit session.**
  `schema.ts` pgEnum array gains `"program-dropped"`; `logs.ts`:

```ts
export type EndedBy =
  | "finished"
  | "rower"
  | "link-lost"
  | "program-failed"
  | "program-dropped"
  | "interrupted";
```

  `data.ts` `ENDED_BY_VALUES` gains the value and the error string becomes
  `"endedBy must be one of finished|rower|link-lost|program-failed|program-dropped|interrupted or null"`.
  Add one comment line at the pgEnum citing spec §1 "The migration, owned"
  and the hand-copied-mirror hazard (why all three move together).
- [ ] **Step 5: Generate the migration**: `pnpm db:generate`. Verify the
  emitted SQL is exactly
  `ALTER TYPE "public"."ended_by" ADD VALUE 'program-dropped';` (drizzle may
  order values — inspect). Prepend a comment header in the repo's own
  migration style (see `drizzle/0012_amused_wild_child.sql`): additive enum
  value, no default, no backfill, legacy rows unchanged.
- [ ] **Step 6: Update the contract round-trip tests** — grep
  `server/stores/contracts/` for the existing `endedBy` value list and add
  `"program-dropped"` so the fake/real stores stay in lockstep.
- [ ] **Step 7: Run** `pnpm test --project integration` (Docker) and
  `pnpm typecheck && pnpm lint`. All green; the Step-1 leg passes.
- [ ] **Step 8: Mutation (RF21):** remove `"program-dropped"` from
  `ENDED_BY_VALUES` only (leave the type); re-run the Step-1 leg; it must go
  red with the 400. Restore. This is the compiler-blindness probe from spec
  §1 — record what the failure said.
- [ ] **Step 9: Commit** (`git rev-parse --show-toplevel` first):
  `feat: widen endedBy to program-dropped across client, server, and enum`

### Task 2: The hook's live arm

**Files:**
- Modify: `src/monitor/useMonitorSession.ts` — `SessionState` (`:1403`
  region), `INITIAL_STATE` (`:1438`), the published `MonitorSession` type
  (`:878` region) and return (`:4131-4143`), and the `programDropped`
  handler (`:2910-2966`)
- Test: `src/monitor/useMonitorSession.test.ts`

**Interfaces:**
- Consumes: Task 1's `CloseReason`.
- Produces: `MonitorSession.closeReason: CloseReason | null` — Task 4's
  `ConnectedSurface` branches on it. The live arm's ended patch:
  `{ phase: "ended", endedBy: "machine", closeReason: "program-dropped",
  handoffHeld, holdError, runOpen: false }`.

- [ ] **Step 1: Write the failing unit tests** in the hook's existing
  scripted-transport idiom (find the `programDropped` describe block and the
  `endByMachine` tests; reuse their drivers/helpers). Legs:

```ts
// (a) live drop closes the record: drive to phase "live" with ≥1 completed
//     interval actual, deliver { kind: "programDropped" }, assert:
//     - the run's completedAt !== null, terminated === true,
//       endedBy === "program-dropped" (read through the store/run ref)
//     - session phase === "ended", endedBy === "machine",
//       closeReason === "program-dropped", runOpen === false
//     - programDropped stays false (the pre-row flag must NOT fire)
//     - NO terminate frame was written to the transport (assert on the
//       scripted transport's write log — the idiom the READY-exit test
//       already uses for the same assertion)
// (b) denied durable write: force verifyHandoffWritable's failure (the
//     storage mock the AUD-016 tests already use), same delivery, assert
//     handoffHeld === true and holdError === "storage-failed" — the ended
//     patch, not INITIAL_STATE
// (c) the P3b pin holds: a run already closed (completedAt set) ignores a
//     late programDropped — state unchanged
// (d) READY exit unchanged: the existing pre-row test still passes and
//     still sees programDropped: true
```

- [ ] **Step 2: Run to verify (a)/(b) fail** — `closeReason` does not exist
  and the handler early-returns on live:
  `pnpm exec vitest run --project unit -t "program-dropped"` (this file is
  in the unit project; confirm via its header, else use the client project).
- [ ] **Step 3: Implement.** Add `closeReason: CloseReason | null` to
  `SessionState`, `INITIAL_STATE` (`closeReason: null`), the published type
  (doc comment: "record-derived mirror set only by the live-drop close, in
  the SAME patch that flips the phase — spec §1 Mechanism; null everywhere
  else"), and the published return. Then the handler — insert the live
  branch ABOVE the existing `phase !== "programming" && phase !== "ready"`
  return:

```ts
if (event.kind === "programDropped") {
  const phase = stateRef.current.phase;
  if (phase === "live") {
    // Spec §1 (lifecycle design, rev 4): the erg dropped its own program
    // mid-row. A third endByMachine-shaped close: keep what was rowed,
    // no terminate (RC-37 ruling — the machine already left), no holds
    // (there will never be another boundary, and a burst can neither
    // arrive nor be stored for this close reason), synchronous verify.
    const run = runRef.current;
    if (run !== null && run.completedAt !== null) return; // P3b pin
    closeRecord(true, "program-dropped");
    const { handoffHeld, holdError } = noHoldCloseVerdict(false);
    // closeReason rides the SAME patch as the phase flip so no frame can
    // render "ended" without it (review P1-1's transport). programDropped
    // stays false: that flag is the pre-row exit signal and would arm
    // ConnectedInterstitial's onExit effect against this navigation.
    update({
      phase: "ended",
      endedBy: "machine",
      closeReason: "program-dropped",
      handoffHeld,
      holdError,
      runOpen: false,
    });
    return;
  }
  if (phase !== "programming" && phase !== "ready") return;
  // ...existing READY exit body unchanged...
```

  Rewrite the handler's stale scoping comment ("left alone rather than
  guessed at") — it is now false; cite spec §0.2.
- [ ] **Step 4: Run the tests; all four legs green.** Also run the FULL unit
  + client projects (the ended patch touches shared state; read both
  summary lines).
- [ ] **Step 5: Commit**, then **Step 6: Mutations (RF21), each reverted by
  `git checkout` against the now-clean file:**
  - forge `closeReason: null` in the live patch → leg (a) must fail;
  - swap `closeRecord(true, "program-dropped")` to `"program-failed"` →
    leg (a) must fail on the stored reason;
  - set `programDropped: true` in the live patch → leg (a)'s flag assertion
    must fail;
  - make the live branch call `driver.terminate()` (or write a terminate
    frame) → the no-terminate assertion must fail.
  Record each failure message in the task report.

### Task 3: The real-driver seam test

**Files:**
- Create: `src/monitor/liveDropSeamReplay.test.ts`
- Read first: `src/monitor/structureWatchSessionReplay.test.ts` (the exact
  harness idiom: path-surgery `SESSIONS_DIR`, `vi.doMock` the transport
  seam, `vi.resetModules()`, dynamic re-import), and `driver.test.ts`'s
  armed-watch describe block (`~:8480`) for the RC-37 frame construction
  helpers and the detector's thresholds.

**Interfaces:**
- Consumes: Task 2's live arm. Nothing downstream consumes this file.

- [ ] **Step 1: Write the failing test.** Drive a REAL committed live
  capture (`docs/monitor/sessions/walk-2026-08-16/session-1-keystone-2x250r0.jsonl`
  or another the harness file already trusts) through the real driver and
  real hook to a live phase with ≥1 completed interval — then feed
  constructed 0x0031 frames carrying RC-37's signature (state `armed`, all
  three `expectedArmedStructure` fields diverged: `wt=1 it=1 durType=128`),
  repeated past the detector's ≥3-tick / ≥2000 ms window (fake timers, same
  as the driver tests). Assert: the DRIVER's own armed-watch emits
  `programDropped` (spy on the event stream, the idiom
  `structureWatchSessionReplay.test.ts` uses), the live hook receives it
  through its real listener, and the session ends with
  `closeReason === "program-dropped"` and the run's actuals intact.
  State the honest boundary in the header comment: constructed input, real
  producer (spec §1 test obligation, review P1-3).
- [ ] **Step 2: Run; verify it fails** only if Task 2 is absent — on this
  branch it should PASS immediately if Tasks 1-2 landed; the failing-first
  half is satisfied by writing it against a temporary revert: run once with
  the hook's live branch commented out locally, confirm red (the event
  arrives, nothing closes), restore, confirm green. Record both outputs.
- [ ] **Step 3: The wiring mutation (RF21, spec §1):** delete the hook's
  live branch (the mutation from Step 2's probe, formalized) → this test
  red while `driver.test.ts` stays green — proving the seam test sees what
  driver-only tests cannot. Restore.
- [ ] **Step 4: Full unit+client run, commit.**

### Task 4: The two Gate-0 surfaces

**Files:**
- Modify: `src/workout/ConnectedSurface.tsx:483-495` (ended body line),
  `src/session/LogSession.tsx` (strip, in the monitor door near the title),
  `src/index.css` (strip styles)
- Test: `src/workout/ConnectedSurface.test.tsx`,
  `src/session/LogSession.test.tsx`

**Interfaces:**
- Consumes: Task 2's `session.closeReason`; `LogSession`'s existing
  `monitorRun` (`monitorModeRun`) and `measuredIntervalCount` from
  `src/session/summaryModel.ts`.

- [ ] **Step 1: Failing tests first.**
  - ConnectedSurface: render the ended frame with
    `closeReason: "program-dropped"`, kept = 2, BEFORE any effect-driven
    navigation (renderless assertion on the frame — the review's
    "rendered-path test before the route effect"): body line reads exactly
    `The erg dropped the workout. 2 intervals kept.`; with kept = 0,
    `The erg dropped the workout. Nothing kept.`; with
    `closeReason: null, endedBy: "machine"` the existing
    `The monitor finished it. Your numbers are kept.` still renders.
  - LogSession: a `?from=monitor` arrival whose run has
    `endedBy: "program-dropped"` renders the strip title
    `THE ERG DROPPED THE WORKOUT.` and the kept-count body; an
    `endedBy: "finished"` run renders NO strip.
- [ ] **Step 2: Run, verify red.**
- [ ] **Step 3: Implement.** ConnectedSurface — extend the ended body-line
  ternary, drop branch ahead of the kept/endedBy branches (holdError and
  handoffHeld branches stay first, unchanged):

```tsx
: session.closeReason === "program-dropped"
  ? kept === 0
    ? "The erg dropped the workout. Nothing kept."
    : `The erg dropped the workout. ${kept} ${kept === 1 ? "interval" : "intervals"} kept.`
  : kept === 0
    ? "No numbers to keep."
    ...
```

  LogSession — a strip component above the title in the monitor door,
  rendered only when `monitorRun.endedBy === "program-dropped"`:

```tsx
<div className="log-dropped-strip">
  <p className="log-dropped-title">THE ERG DROPPED THE WORKOUT.</p>
  <p className="log-dropped-body">
    {kept === 0
      ? "Nothing kept. You had not finished an interval yet."
      : `${kept} ${kept === 1 ? "interval" : "intervals"} kept. The row below is what the erg measured before it stopped.`}
  </p>
</div>
```

  (`kept` from `measuredIntervalCount(monitorRun.actuals)` — never a second
  notion.) CSS per the Gate-0 artifact: `--surface` panel, `--rule-2`
  border, 3px `--ink-3` left border, mono 11px `--ink` title, 13px
  `--ink-3` body with `--ink-2` bold — every pairing's ratio is already
  computed on the artifact (17.11 / 7.43 / 10.81); copy those numbers into
  the CSS comment.
- [ ] **Step 4: Run client project green.**
- [ ] **Step 5: Commit, then mutations:** (i) drop `closeReason` from Task
  2's ended patch (repeat of Task 2's first mutation, now proving THIS
  test's transport claim — the ConnectedSurface test must observe the false
  `The monitor finished it.` copy); (ii) flip the strip's gate to
  `"program-failed"` → the LogSession no-strip leg must fail. Record both.
- [ ] **Step 6: `pnpm e2e` (RF1 — the diff touches `app/src/`), and
  `pnpm screenshots`** — the strip is a layout change to the log screen;
  open the captures and look at them (RF7): seed a program-dropped row so
  the strip actually renders, and eyeball the kept count against the rows.

### Task 5: Composition drive-through and close-out

**Files:**
- Create: `src/workout/WorkoutDetail.programDropped.test.tsx` (modeled on
  `WorkoutDetail.connectedRecovery.test.tsx` — read its header; same
  real-stack idiom, one seam mocked)
- Modify: `ROADMAP.md` (tick the Wave F item), `docs/design/DEVIATIONS.md`
  only if a row describes the ended frame's copy (check; RF9)

- [ ] **Step 1: The failing composition test:** real `WorkoutDetail` →
  real `ConnectedInterstitial` → real hook over the scripted transport →
  drive to live with one completed interval → deliver the drop → assert the
  REAL `handleConnectedEnded` navigation fires (to
  `/library/:id/log?from=monitor`), a real `LogSession` mounts, **the log
  door renders the row AND the strip** (the reader-exists assertion, spec
  §1 assertion 3), and under a forced durable-write failure NO navigation
  occurs and the COULD-NOT-KEEP state renders (assertion 4).
- [ ] **Step 2: Red → implement nothing (Tasks 1-4 make it green) → green.**
  If anything is red here, the seam it names is the finding — report it,
  don't patch the test.
- [ ] **Step 3: Full gates:** `pnpm lint && pnpm typecheck && pnpm test`
  (all projects, Docker up), `pnpm build && pnpm dist:grep`, per-file
  coverage for every touched file (RF2).
- [ ] **Step 4: ROADMAP tick** — mark the Wave F "Handle `programDropped`
  while a run is live" item SHIPPED with the PR number; one line, wrap by
  hand (root markdown is never Prettier-formatted).
- [ ] **Step 5: Commit; push; open the PR** with the human-first body
  (~120 words above the fold): outcome line, tester impact (visible only
  when an erg drops a program mid-row), the two screenshots, the risk
  paragraph, and the Record block carrying every mutation's failure text.
  **Present and STOP — James merges.**
