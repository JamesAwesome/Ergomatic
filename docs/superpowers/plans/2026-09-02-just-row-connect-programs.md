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
Files: `app/src/monitor/driver.ts` (`beginFreeRow`: open the run as today; `const seq = buildJustRowProgram()` BEFORE `programInFlight = true`; then `void Promise.race([sendSequence(seq, "free-row-program-sent"), deadline(FREE_ROW_PROGRAM_DEADLINE_MS)]).then(…record sent / unanswered…, (err) => log.record("free-row-program-failed", err instanceof ProgramRejectionError ? err.hexTrace : String(err))).finally(() => { programInFlight = false; })` with `FREE_ROW_PROGRAM_DEADLINE_MS = 3000` a named literal; `terminate()` gains a `ProgramBusyError` refusal while `programInFlight === "beginFreeRow()"` (holder label; `program()`'s hold stays terminable for the hook's unmount interleave); NO `sendPrepare()`; sweep the prose the spec lists), `app/src/monitor/transports/fake.ts` (accept the frame like a workout program; `synthesizeTerminated` reacts to a terminate at an idle machine under the `terminateReactsWhileIdle` script opt-in; NAK via the existing `failNextProgramFrame: "reject"`). Tests: the free-row driver suite from #259, reading `log.entries()`.
- [ ] Failing tests: (1) ring order — `free-row-open` before the first `write`; (2) the `write` entries are exactly the p.80 frame, none equal to `f1 76 04 13 02 01 02 60 f2`; `free-row-program-sent` present; (3) `failNextProgramFrame: "reject"` → run still open, `free-row-program-failed` with a hex trace; (4) `fake.delayWrites(50)` then `await expect(driver.terminate()).rejects.toThrow(ProgramBusyError)`, then the send completes; (5) ack withheld → after the deadline `free-row-program-unanswered`, and `terminate()` then resolves; (6) terminate-reacting fake → the free row stays open through the send.
- [ ] Implement; green; commit; probes (record failure texts): re-add `sendPrepare()` → (2)+(6) red; drop `programInFlight` → (4) red; drop the deadline → (5) hangs/red; move the send above the run assignment → (1) red.

### Task 3: the Ready line + replay + e2e
Files: `app/src/justrow/JustRow.tsx:306` (the line), `JustRow.test.tsx`, `app/src/monitor/justRowReplay.test.ts` (the replay never acks: assert the free row still opens/completes, the ring holds one `write` of the p.80 frame and `free-row-program-unanswered` after the deadline, and neither `-sent` nor `-failed`), `app/e2e/justrow.spec.ts` (the connected flow shows the new line AND `/you/diagnostics/monitor-logs`'s COPY export carries `free-row-program-sent` for the session — the ring is the only thing an e2e can see), no capture: copy-only change (James's rule); `justrow-ready.png` is refreshed by the next layout capture.
- [ ] Failing tests; implement; green; `grep -rn "Nothing is programmed" app/src app/e2e` → nothing; commit; probe: revert the line → red. Full `pnpm e2e`, `pnpm screenshots` (keep `justrow-ready.png`, revert churn), `pnpm test:coverage` per-file for `commands.ts`, `driver.ts`, `JustRow.tsx`.

### Task 4: docs + PR
- [ ] ROADMAP: item 2 → IMPLEMENTED, walk leg owed (with the control + negative leg); RC-38 disposition line. Handoff README status → IMPLEMENTED.
- [ ] PR body, human-first (≤120 words above the fold): the walk leg is the gate; James reviews after it.

### Task 5: the walk leg (James at the erg, `/hardware-walk`, PHONE walk — no recordings)
- [ ] Build from the branch (`pnpm ios:build` with the derived client id; Xcode Run). Control: PM5 power-cycled to a virgin menu (ring shows type 0); photo of the PM5 BEFORE connect; connect from the door; photo of PM5 + phone in one frame BEFORE the first stroke; pull; end; log. Negative leg: reconnect right after a Menu end. Record the split cadence as an observation. Walk record under `docs/monitor/sessions/walk-<date>-jr-connect/`.
