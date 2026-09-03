# Connect puts the erg into a Just Row session — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development, tasks SEQUENTIAL in one worktree. Read `.claude/agent-briefing.md` first; `git rev-parse --show-toplevel` before every commit; commit the real change BEFORE any mutation probe (RF22); never merge.

**Goal:** When the Just Row door's link comes up, the app sends Concept2's p.80 Just Row frame — alone, no prepare — so the PM5 leaves its main menu; the phone's Ready line becomes James's; nothing on the phone branches on the send's outcome.

**Spec:** `docs/superpowers/specs/2026-09-02-just-row-connect-programs-design.md` (rev 4, HARDENED). **Gate 0:** `docs/design/handoffs/2026-09-02-just-row-connect/` (rev 1c PASSED; one copy after rev 2).
**Worktree:** `/Users/james/projects/github/jamesawesome/Ergomatic-wt-jr2`, branch `jr-connect-drives-erg`.

## Global Constraints
- The frame is `F1 76 07 01 01 01 13 02 01 01 61 F2`, pinned as a LITERAL through the real framer.
- `beginFreeRow()` stays synchronous in everything the hook reads (run open, phase flip); the send is detached; its only effects are ring entries. No new state anywhere.
- `activeRun.freeRow` is set BEFORE any byte is written; the `!activeRun?.freeRow` guard at `driver.ts:4982` is what holds the RC-37 watch off during the send — pin it.
- The Ready line is exactly `The clock starts on your first stroke.`; `Nothing is programmed` appears nowhere after this PR.
- Client/unit tests: `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run <file>` from app/ (never `--project client <file>`); read BOTH summary lines; `pnpm typecheck && pnpm lint` before each commit; `pnpm e2e` before reporting done (RF1). Every new assertion gets a named mutation probe with its failure text (RF21).

### Task 1: `buildJustRowProgram()` (domain)
Files: `app/domain/monitor/pm5/commands.ts` (`WORKOUTTYPE_JUSTROW = 0x01` with the doc-label caveat and the machine corroboration cited; `buildJustRowProgram(): Uint8Array[][]` — one unit of two commands, `[SET_WORKOUTTYPE, 0x01, WORKOUTTYPE_JUSTROW]` + `buildScreenState(SCREENVALUEWORKOUT_PREPARETOROWWORKOUT)`, wrapped exactly as `buildProgrammingSequence` wraps its units); `app/domain/monitor/pm5/commands.test.ts`.
- [ ] Failing test: the unit through the real framer (`packPayload`/`chunkFrames` — the same path `sendSequence` takes) yields ONE frame equal to the literal `f1 76 07 01 01 01 13 02 01 01 61 f2`; a second assertion pins the ack shape the driver will match (`76 02 01 13`).
- [ ] Implement; green; commit; probe: change the type byte to `0x00` → red on the literal.

### Task 2: the bounded detached send in `beginFreeRow()` (driver + fake)
Files: `app/src/monitor/driver.ts` (`beginFreeRow`: open the run as today; `const seq = buildJustRowProgram()` BEFORE `programInFlight = true`; then `void Promise.race([sendSequence(seq, "free-row-program-sent"), deadline(FREE_ROW_PROGRAM_DEADLINE_MS)]).then(…record sent / unanswered…, (err) => log.record("free-row-program-failed", err instanceof ProgramRejectionError ? err.hexTrace : String(err))).finally(() => { programInFlight = false; })` with `FREE_ROW_PROGRAM_DEADLINE_MS = 5000` a named literal (**rev 5, after the 2026-09-03 walk measured write→ack at 1968/2060/1788 ms**; it was 3000 against a workout program's ~90 ms ack); `terminate()` AWAITS the send's own settled promise `freeRowSendSettled` while it is non-null (**rev 5: it REFUSED with `ProgramBusyError` until the walk found Cancel leaving the erg in the Just Row session — finding 4**; `program()`'s hold stays terminable for the hook's unmount interleave, unchanged); NO `sendPrepare()`; sweep the prose the spec lists), `app/src/monitor/transports/fake.ts` (accept the frame like a workout program; `synthesizeTerminated` reacts to a terminate at an idle machine under the `terminateReactsWhileIdle` script opt-in; NAK via the existing `failNextProgramFrame: "reject"`). Tests: the free-row driver suite from #259, reading `log.entries()`.
- [ ] Failing tests: (1) ring order — `free-row-open` before the first `write`; (2) the `write` entries are exactly the p.80 frame, none equal to `f1 76 04 13 02 01 02 60 f2`; `free-row-program-sent` present; (3) `failNextProgramFrame: "reject"` → run still open, `free-row-program-failed` with a hex trace; (4) `fake.delayWrites(50)` then `driver.terminate()` — the ring reads p.80 write, its ack, `free-row-program-sent`, THEN the terminate write (rev 5); (5) ack withheld → a mid-window `terminate()` is unwritten and unsettled at 4999 ms, and at 5000 ms the deadline logs `free-row-program-unanswered` and the terminate goes out; (6) terminate-reacting fake → the free row stays open through the send.
- [ ] Implement; green; commit; probes (record failure texts): re-add `sendPrepare()` → (2)+(6) red; drop the `await freeRowSendSettled` → (4) red (the terminate write precedes `free-row-program-sent`); drop the deadline → (5) hangs/red; move the send above the run assignment → (1) red.

### Task 3: the Ready line + replay + e2e
Files: `app/src/justrow/JustRow.tsx:306` (the line), `JustRow.test.tsx`, `app/src/monitor/justRowReplay.test.ts` (the replay never acks: assert the free row still opens/completes, the ring holds one `write` of the p.80 frame and `free-row-program-unanswered` after the deadline, and neither `-sent` nor `-failed`), `app/e2e/justrow.spec.ts` (the connected flow shows the new line AND `/you/diagnostics/monitor-logs`'s COPY export carries `free-row-program-sent` for the session — the ring is the only thing an e2e can see), no capture: copy-only change (James's rule); `justrow-ready.png` is refreshed by the next layout capture.
- [ ] Failing tests; implement; green; `grep -rn "Nothing is programmed" app/src app/e2e` → nothing; commit; probe: revert the line → red. Full `pnpm e2e`, `pnpm screenshots` (keep `justrow-ready.png`, revert churn), `pnpm test:coverage` per-file for `commands.ts`, `driver.ts`, `JustRow.tsx`.

### Task 4: docs + PR
- [ ] ROADMAP: item 2 → IMPLEMENTED, walk leg owed (with the control + negative leg); RC-38 disposition line. Handoff README status → IMPLEMENTED.
- [ ] PR body, human-first (≤120 words above the fold): the walk leg is the gate; James reviews after it.

### Task 5: the walk leg (James at the erg, `/hardware-walk`, PHONE walk — no recordings)
- [ ] Build from the branch (`pnpm ios:build` with the derived client id; Xcode Run). Control: PM5 power-cycled to a virgin menu (ring shows type 0); photo of the PM5 BEFORE connect; connect from the door; photo of PM5 + phone in one frame BEFORE the first stroke; pull; end; log. Negative leg: reconnect right after a Menu end. Record the split cadence as an observation. Walk record under `docs/monitor/sessions/walk-<date>-jr-connect/`.

### Task 6 (rev 5, ADDED by the walk): Cancel and END must undo the arm
Walk `docs/monitor/sessions/walk-2026-09-03-jr-connect/`, findings 4 and 5.
The frame works (control leg PASSED, `workoutType` 0 → ack → 1); what does
not is leaving: Cancel on the Ready screen left the PM5 in the Just Row
session the app had just armed. **Precision the walk's own record now
carries and this task did not: only the exclusion was OBSERVED.** Ring 3's
Cancel ran 1589 ms after the send's ack, so the driver's refusal was never
entered; an END inside the send window would hit it, but nobody pressed
one. The refusal goes as hardening beside the observed cause.
Files: `app/src/monitor/driver.ts` (`terminate()` waits on
`freeRowSendSettled` instead of throwing `ProgramBusyError`; the deadline
becomes 5000 ms against the walk's measured 1968/2060/1788 ms write→ack),
`app/src/monitor/useMonitorSession.ts` (`cancel()`'s armed predicate and
`teardown`'s both drop `identityRef.current.mode !== "justrow"`),
`driver.test.ts`, `useMonitorSession.test.ts`, `JustRow.test.tsx`.
- [ ] Failing tests: driver — the ordering (p.80 write, ack,
      `free-row-program-sent`, terminate write) and the bounded wait
      (unwritten at 4999 ms, out at 5000 ms). Hook — `cancel()` at ready
      on a free row puts the terminate literal on the wire after the ack;
      an unmount does too; `endSession()` mid-send does too. Door — the
      ready frame's Cancel calls `session.cancel()`.
- [ ] Implement; green; commit; probes (record failure texts): restore the
      refusal → the driver ordering test red; drop the `await` → the
      terminate write precedes `free-row-program-sent`; restore the
      `mode !== "justrow"` exclusion → the hook tests red; delete
      `void session.cancel()` from the door's Cancel → the door test red.
      **CORRECTED after the probes ran (see the spec's exit criterion 2b
      table): `cancel()`'s exclusion restored ALONE leaves the whole suite
      green — its own `teardown(armed, driver)` sends the terminate — so
      the biting mutation there is both exclusions together, and
      `endSession`'s leg has no exclusion to restore at all; the refusal is
      what bites it.**

### Task 7 (ADDED by the delta pass on Task 6): the hang-up must not overtake the terminate
Task 6's wait gave `terminate()` a suspension BEFORE it writes, and that
wait races the app's own teardown hang-up (~186 ms, from ring 1's own END
timings — spec §Rulings 4). Invariant: a hang-up never precedes a terminate
that still owes its write.
Files: `app/src/monitor/driver.ts` (`terminate()` registers the write it
owes; `sendSequence` gains an `onFrameWritten` hook; `disconnect()` holds
while any debt stands and logs `disconnect-deferred`), `driver.test.ts`,
`useMonitorSession.test.ts`.
- [ ] Failing tests: driver — an unanswered send, a terminate issued
      mid-window and a `disconnect()` behind it; the transport's own
      `disconnect()` sees the terminate frame already written, and not
      before 5000 ms. Hook — END at `ready` inside the send window followed
      by an unmount; the terminate frame reaches the wire before the
      transport's `disconnect()`.
- [ ] Implement; green; commit; probes: drop `disconnect()`'s await → both
      red; register the debt AFTER the wait instead of on entry → both red.
