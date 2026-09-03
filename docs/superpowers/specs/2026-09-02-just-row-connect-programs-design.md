# Connect puts the erg into a Just Row session — design

**Status: spec REV 5, 2026-09-03 — BUILT, WALKED, and revised BY the walk
(`docs/monitor/sessions/walk-2026-09-03-jr-connect/`). The walk's control
leg PASSED (the p.80 frame drives the erg) and its findings 4 and 5 are
folded here: `terminate()` WAITS the free-row send out instead of refusing
it, Cancel and unmount undo the arm, and the deadline is 5000 ms against
a MEASURED ack latency. Rev 4 (2026-09-02) was hardened, both lenses run,
one ledger entry. Gate 0 PASSED on rev 1c (James: the Ready line is
`The clock starts on your first stroke.`). No stored shape.**
Phase JR follow-on item 2, re-confirmed by James 2026-09-02 ("i do want
item 2"). Handoff: `docs/design/handoffs/2026-09-02-just-row-connect/`.

## What and why

Today the Just Row door connects and sends no bytes; the PM5 stays on its
main menu, so to the rower the connection did nothing (James, at the erg,
2026-09-01). The erg does enter Just Row on the first pull (walk
2026-08-31, OPEN 5), so this is an ACKNOWLEDGMENT gap: the app should put
the monitor on its Just Row screen when the link comes up, the way it
programs a workout, and say so on the Ready frame — and say the truth if
the machine did not take it.

## Research (RF18: the ground was already in the repo)

- **The frame is Concept2's own worked example, p.80** (transcribed at
  `docs/monitor/pm5-interface-notes.md:204`):
  `F1 76 07 01 01 01 13 02 01 01 61 F2` = wrapper `0x76` carrying
  `SET_WORKOUTTYPE(0x01) = 0x01` and `SET_SCREENSTATE(0x13) = (WORKOUT,
  PREPARETOROWWORKOUT)`, checksum `0x61`; its ack `01|81 76 02 01 13`
  (`:249`), cross-checked at `:966`. Both commands already exist in
  `domain/monitor/pm5/commands.ts` (`SET_WORKOUTTYPE` :25, `buildScreenState`
  :209-214); `buildProgrammingSequence` ends with the same screen-state
  command (:363). PRIMARY.
- **The type byte is what the machine picks for itself — and it is ALSO
  the machine's idle default, so it verifies nothing.** Decoded from
  `docs/monitor/sessions/walk-2026-08-31-justrow/just-row-pm5-recording-1788214688045.jsonl.gz`
  (0x0031 offset 6, `parse.ts:130`; census by
  `docs/monitor/sessions/walk-2026-08-31-justrow/decode-0031.py`, run
  against that file — the counts are its output, not transcribed): at a
  VIRGIN main menu `workoutType = 0` (`PRE_ARM_BASELINE_STRUCTURE`, "before
  anything has ever been armed"); from the first pull `1`; and after the
  Menu end the idle frames read `type = 1, state = 0` with nothing sent by
  anyone. This
  repo already names that shape: `statusFrames.ts:131-135`
  `EMPTY_ARM_STRUCTURE = { workoutType: 1, durationRaw: 0, durationType: 128 }`
  — "session 4a's captured empty-arm anatomy", the signature of a PM5 that
  armed NOTHING — and `driver.ts:4963` records that `sendPrepare()`'s own
  terminate drives the machine into exactly it. **A verification whose
  preceding step manufactures its own pass condition is not a
  verification** — the technique that caught it is in the antagonist
  ledger (2026-09-02). The only field that would answer "is the Just Row
  SCREEN up" is `CSAFE_PM_GET_SCREENSTATESTATUS` (CSAFE-DEF p.65 via
  §19.6: a `SetScreenState` ack means "posted for processing by the UI
  task"), a read command this codebase has never sent — out of scope
  here, named as the future path. PRIMARY (machine + notes). **RC-38
  disposition:** the Appendix A `OBJ_WORKOUTTYPE_T` row
  for `0x01` stays a doc LABEL (Concept2's PDFs are served behind
  Cloudflare and could not be fetched for transcription — James can drop
  the PDF into `docs/monitor/` if a verbatim row is wanted); the machine
  corroboration above is what this spec rests on.
- **An ack is not a program** (`pm5-interface-notes.md` D2 + its
  2026-08-06 correction): during a LIVE Just Row a program ack is a silent
  no-op, and a `SET_SCREENSTATE` ack means "queued" (§19.6). The driver's
  `program()` therefore clears, sends, and VERIFIES against the machine's
  reported state (`verifyArmed`). This spec verifies the same way, with
  the readback fact above.
- **Programming a live Just Row cannot happen from this door:** the PM5
  does not advertise mid-Just-Row (N1), so the link only ever comes up at
  the menu (or on a finished screen).
- **No prepare step — and this is load-bearing** (harden lens 1). The
  programmed path sends `TERMINATEWORKOUT` first (`sendPrepare`) BEFORE any
  run exists — `program()` assigns `activeRun` only after `verifyArmed`.
  `beginFreeRow` opens the run FIRST, and a terminate sent while a run is
  open makes the PM5 report `terminated`, which the driver's terminal
  branch (`maybeEmitFrame`: `finished`/`terminated` → `activeRun.closed`
  → `emit({kind:"terminated"})` → the hook's `endByMachine`) treats as the
  row ending — the same reaction the app's own END relies on (`fake.ts`'s
  `synthesizeTerminated` doc: prepare and END "send the SAME wire command
  — byte for byte — so they get the SAME machine reaction"). The two
  `freeRow` guards (`grep -n freeRow driver.ts` → the divergence
  escalation and the RC-37 watch) do not cover that branch. So the free
  row sends the p.80 frame ALONE: a program replaces a loaded workout
  (§19.1 verdict (b)), and a finished-workout screen is the walk's
  negative leg to observe, not something the app clears first.

## Rulings

1. Send Concept2's p.80 frame, byte for byte (`buildJustRowProgram()`
   returns exactly it; a test pins the literal including the checksum;
   the real framer over the two units yields
   `F1 76 07 01 01 01 13 02 01 01 61 F2` — wrapper count `07`, checksum
   `0x61`).
2. **No readback verification** (see Research: the readback is the idle
   default). The
   send's outcome — acked, NAK'd, timed out, link dropped — goes to the
   ring as `free-row-program-sent` / `free-row-program-failed` with the hex
   trace, and nothing on the phone branches on it. The free row proceeds
   exactly as today on every branch; the erg's own screen is the
   acknowledgment, and the walk leg (with a control) is what proves the
   frame does what p.80 says.
3. **One copy, James's line (Gate 0 rev 1c):** `The clock starts on your
   first stroke.` It is true whether or not the program landed, so the
   phone claims nothing about the monitor and there is no copy B and no
   pending state. It replaces the shipped `Nothing is programmed…` line,
   which becomes FALSE the moment this ships.
4. The `freeRow` opt-outs (no divergence escalation, no structure
   watchdog) stay: a JustRow program has no interval structure. **The
   send holds `programInFlight`** for its duration (harden lens 1): that
   flag already gates `program()`'s re-entry and the RC-37 watch, and
   `terminate()` — which has no re-entrancy guard and would share
   the driver's ONE `pendingAck` slot with the in-flight send (the ack
   matcher is arrival-order only; it never reads the ack's command byte,
   and production configures no `ackTimeout`, so an orphaned slot never
   expires) — **WAITS for the free-row send to settle before it writes**
   (rev 5). Not refuses. `programInFlight` stays a holder label,
   `false | "program()" | "beginFreeRow()"`, one lifetime, because it
   still gates `program()`'s re-entry and the RC-37 watch; the WAIT reads
   a second value minted beside it, the send's own settled promise
   (`freeRowSendSettled`, §Lifetime), which resolves on ack, NAK,
   deadline or disconnect. `program()`'s hold is not waited on:
   `useMonitorSession`'s teardown deliberately interleaves a terminate
   with an in-flight `program()` ("best-effort by design — including the
   case where a `program()` is still in flight", pinned by its "unmount
   while programming (before armed) also terminates first" test), and
   blocking there would leave the erg holding a workout the rower backed
   out of.

   **Rev 4.1 said REFUSES, and rev 5 withdraws it — but NOT because the
   walk caught it refusing.** Rev 5 first wrote that James's Cancel "threw
   here"; that is false, and the ring says so. Ring 3's
   `disconnect-requested` lands 1589 ms after the p.80 ack, so
   `programInFlight` was already `false` and nothing was refused. The
   OBSERVED cause of finding 4 was the hook's `mode !== "justrow"`
   exclusion, below. The refusal is a SEPARATELY reachable defect — an END
   or a Cancel inside the ~2 s ack window — withdrawn as hardening on its
   own merits: a refusal is only safe when some caller can act on it, and
   both callers here (`cancel`, `endSession`) are best-effort and swallow,
   so it could only ever mean "the erg is not told", silently. The wait is
   bounded by the deadline below, so it can never mean "hang".

   **And the wait it replaces the refusal with introduced a THIRD path,
   found by the delta pass and fixed in the same PR:** a terminate
   suspended on the send can be overtaken by the app's own teardown
   hang-up. Measured on ring 1 (offsets from its p.80 write): the Ready
   screen's first `frame` at +1159 ms, END's burst hold `handoff-hold`
   +66903 → `handoff-released` +68905 (2002 ms), then
   `disconnect-requested` +70930 (2025 ms of release, navigation and
   unmount) — 4027 ms from END to hang-up, so the earliest END puts the
   hang-up at about write+5186 ms against a terminate the deadline releases
   at write+5000 ms. **INVARIANT: a hang-up never precedes a terminate that
   still owes its write.** `terminate()` registers the write it owes on
   entry and releases it when the frame is on the wire (or when the call
   fails before it can be); `disconnect()` holds while any debt stands.
   The wait is bounded by exactly what `terminate()` can block on before
   writing — `freeRowSendSettled`, capped at the deadline — and
   deliberately excludes the ack and settle waits, whose only production
   exit is that very disconnect: awaiting those would be a deadlock, not a
   bound.

   **And the arm is now UNDONE at both exits** (rev 5): `cancel()`'s armed
   predicate and `teardown`'s both excluded `mode === "justrow"` on the
   ground that "a free row armed nothing" — true before this spec, false
   after it. Both exclusions go. Cancel on the Ready screen, and an unmount
   at `ready` (the tab bar), terminate a free row exactly as they do a
   programmed one; the accepted worst case is the one the programmed path
   already accepts, a rower who began pulling inside the motion gate's ~5
   frames losing that row on the erg.

   **The send is BOUNDED** (harden lens 2): production
   configures no `ackTimeout`, and the replay transport (and a PM5 that
   never answers) acks nothing, so an unbounded send would hold
   `programInFlight` for the driver's life and a terminate would wait on it
   forever. The
   send races its ack against a deadline of `FREE_ROW_PROGRAM_DEADLINE_MS`
   (a named literal, **5000 ms**); on the deadline the
   send is abandoned, `free-row-program-unanswered` is recorded, and the
   flag clears. **The number is MEASURED, not reasoned** (rev 5): rev 4.1
   set 3000 ms against "the ~90 ms ack seen on hardware", which was a
   WORKOUT program's ack; the walk timed the Just Row frame's own ack at
   **1968 / 2060 / 1788 ms** across three sessions (its finding 5 — the ack
   arrives after the PM's three `notify-first` lines), leaving 3000 ms
   under a second of margin. 5000 ms is ~2.4x the slowest observed, and it
   is a ceiling rather than a delay: an ack that lands clears the flag when
   it arrives. What END does DURING the window is now the same as outside
   it: `endSession` flips to `ended`, then awaits `driver.terminate()`,
   which waits out the send and writes the terminate after its ack.

## Mechanism

1. `commands.ts`: `WORKOUTTYPE_JUSTROW = 0x01` (a doc LABEL — the notes
   never transcribe `OBJ_WORKOUTTYPE_T`; machine corroboration above; NOT
   named `_SPLITS`, which the notes cannot quote) and
   `buildJustRowProgram(): Uint8Array[][]` — one unit, the p.80 payload,
   for `sendSequence`.
2. `driver.ts` `beginFreeRow()` stays SYNCHRONOUS in everything the hook
   relies on: it opens `activeRun` (with `freeRow: true`, so both opt-outs
   hold throughout) and returns as today. It additionally FIRES a detached
   send — the sequence is BUILT before the flag is set, then
   `programInFlight = "beginFreeRow()"; freeRowSendSettled = Promise.race([sendSequence(seq, "free-row-program-sent"), deadline(FREE_ROW_PROGRAM_DEADLINE_MS)]).then(onSettled, onFailed).finally(() => { programInFlight = false; freeRowSendSettled = null; })`
   — NO prepare, whose only effects are ring entries. `onFailed` records
   `free-row-program-failed` with `err instanceof ProgramRejectionError ?
   err.hexTrace : String(err)` (the transport's own rejections — the
   fake's "unexpected write" and `capacitorBle`'s post-disconnect throw —
   are plain `Error`s with no `hexTrace`), never throws itself (a throwing
   handler leaves the stored chain rejected, and nothing may reject at a
   caller that only wants to know the send is OVER), and the deadline
   branch records `free-row-program-unanswered`. `sendSequence` runs
   synchronously to its first `await`, so the write is issued INSIDE
   `beginFreeRow()` — after the run is open, which is the ordering that
   matters. No state, and the promise is surfaced to ONE reader inside the
   driver (`terminate()`, ruling 4) and to nobody outside it, so
   the hook's synchronous `ready` flip (`useMonitorSession.ts:4773-4775`,
   "one indivisible step") and `JustRow.tsx`'s once-latch are untouched
   and the arm effect cannot re-trigger. Every rejection, NAK, timeout and
   disconnect is caught and logged; a disconnect mid-send is already the
   hook's link-lost path.
2b. `useMonitorSession.ts` (rev 5): `cancel()`'s armed predicate and
   `teardown`'s both drop their `identityRef.current.mode !== "justrow"`
   exclusion, so a free row at `programming`/`ready` is terminated on the
   way out by either exit. Nothing else about either path changes:
   `alreadyTerminated` still stops the two from writing twice, and both
   still swallow the terminate's failure.
2c. `driver.ts` (delta pass on rev 5): `terminate()` takes a debt token
   from a driver-closure counter on ENTRY — before the wait, which is the
   point — and releases it from `sendSequence`'s new `onFrameWritten`
   callback (fired once a frame's chunks are handed to the transport,
   before its ack is awaited) or from its own `finally` if it never got
   that far. `disconnect()` logs `disconnect-deferred` and awaits the
   drain while any debt stands, then hangs up as before. The release is
   idempotent and the counter is a count, not a flag, so overlapping
   terminates cannot mask each other. Nothing outside the driver changes:
   the hook's two existing terminate-then-disconnect chains (`fail()`,
   `teardown`'s armed branch) still do their own ordering, and this makes
   the same ordering hold for every OTHER caller of `disconnect()` —
   including `teardown` at `ended`, which is the one that bit.
3. `JustRow.tsx`: the Ready body line becomes James's line. No branch.
4. Fake transport: accepts the p.80 frame like a workout program (acks);
   the NAK case rides the fake's EXISTING `failNextProgramFrame: "reject"`
   hook (its own comment forbids "a second way to ASK for a reject"), so
   no `nakJustRow` option. The fake keeps no write log — assertions read
   the driver's own ring (`log.entries()` kind `write`, one entry per
   chunk). **And it
   reacts to a TERMINATE with `synthesizeTerminated` at an idle machine
   under a script opt-in, `terminateReactsWhileIdle`, marked synthetic**
   — NOT by default (rev 4.1): the fake's honest default is the observed
   one, a terminate at an armed-idle screen is accepted with no state
   change (walk §18 s3 item 15, pinned by `fake.test.ts`), and the fake's
   header rule forbids unobserved defaults. Today it queues that reaction
   only for a running machine, which is why a prepare-at-the-menu defect
   could not go red (harden lens 1); with the opt-in, a mutation that
   re-adds `sendPrepare()` to the detached send closes the free row in
   the test.
5. Prose swept in the same PR (it becomes false): the `free-row-open`
   ring string "opened a free row (no program sent)" (an operator reads it
   on the walk), `beginFreeRow`'s JSDoc ("sending the machine nothing",
   "no wire traffic to await"), `driver.ts`'s "DELIBERATELY SYNCHRONOUS
   AND UNACKED… no wire traffic" comment, `useMonitorSession.ts`'s two
   comments on the arm (near the `ready` flip and near line 2564),
   `Today.tsx`'s free-row comment (~685), `JustRow.tsx`'s door comments
   (~108 and ~291-293, "a free row arms nothing, which is exactly why
   `beginFreeRow` sends no bytes"), `justRowReplay.test.ts`'s header.

## Lifetime

FOUR driver-closure values. The first two belong to the send, minted in
`beginFreeRow()` after the run is open and the sequence built and cleared
in the send chain's own `finally`; the last two belong to the terminate
and were added by the delta pass's fix:

| value | is | mint | clear | survives |
| --- | --- | --- | --- | --- |
| `programInFlight` | the holder label `false \| "program()" \| "beginFreeRow()"` (pre-existing; gates `program()`'s re-entry and the RC-37 watch) | `beginFreeRow()`, set to `"beginFreeRow()"` | the chain's `finally`, back to `false` | nothing; and it cannot be overwritten while live — see the guard note below |
| `freeRowSendSettled` | the send's own settled promise, `Promise<void> \| null`; resolves (never rejects) on ack, NAK, deadline or disconnect | same statement | same `finally`, back to `null` | as above |
| `terminateWritesOwed` | a COUNT of `terminate()` calls that have entered and not yet put their frame on the wire | `terminate()`'s entry, one increment per call | that call's own release, run once: from `sendSequence`'s `onFrameWritten` when the frame is out, or from `terminate()`'s `finally` if it failed first | nothing; a counter rather than a boolean so two overlapping terminates cannot mask each other, and so this design owes no claim that callers never overlap |
| `terminateWritesDrained` | the promise `disconnect()` awaits, `Promise<void> \| null`; `null` whenever the count is zero | the first increment from zero | the decrement back to zero, which resolves it and nulls it | as above |

**The guard that actually holds row 1 and 2's "cannot be overwritten" is
the HOOK's, not the driver's** (corrected by the delta pass; rev 5 said the
driver's own `runIsOpen()` refusal did it). `beginFreeRow()`'s
`runIsOpen()` check is `activeRun !== null && !activeRun.closed`, and the
machine's own terminal frame sets `activeRun.closed` — reachable during the
~2 s send if the rower presses Menu — after which a second call would be
accepted. What holds is `useMonitorSession`'s `beginFreeRow`, which returns
early at `programming`/`ready`/`live`/`ended`; the phase is `ready` for the
whole send, flipped synchronously by the same call. The driver's guard is
belt, not braces.

INVARIANTS, not mechanisms. (a) While a free-row send is live, a
`terminate()` writes no byte until that send has settled — one ack slot,
one conversation at a time. (b) That wait is bounded: it can never outlast
`FREE_ROW_PROGRAM_DEADLINE_MS`. (c) **A hang-up never precedes a terminate
that still owes its write**, whichever caller fires it. (d) That wait is
bounded by the same ceiling, and by nothing else: it covers only what
`terminate()` can block on BEFORE writing, never its ack or its settle
ticks, whose only production exit is the disconnect itself. (e) No value
here outlives its send or its terminate, and none outlives the driver — a
driver does not outlive its connection, so nothing survives a teardown, a
relaunch or a re-arm. (f) A `terminate()` already suspended on the send
chain holds its own reference and resumes normally after the clear.

The detached
promise belongs to the driver instance; `capacitorBle.write` throws from
`requireConnected` after a disconnect, so a teardown mid-send rejects and
is caught. **The ring is snapshotted BEFORE unsubscribe/disconnect**
(the hook's teardown comment says so), so a `free-row-program-failed`
recorded AFTER teardown never reaches the diagnostics door — the
design's only artifact is missing in exactly that branch. Stated, not
fixed: the walk's negative leg does not rely on the ring for a
teardown-timed failure.

## Exit criteria

1. `buildJustRowProgram()` through the real framer equals
   `F1 76 07 01 01 01 13 02 01 01 61 F2` (a literal, not derived from the
   constants).
2. Driver on the fake transport: the ring's `free-row-open` entry precedes
   its first `write` entry (ordering; mutation: move the send above the
   `activeRun` assignment → red); the ring's `write` entries hold exactly
   the p.80 frame and NO terminate — pinned against the terminate literal
   `f1 76 04 13 02 01 02 60 f2` (the one `commands.test.ts` already uses);
   `free-row-program-sent` is logged; with `failNextProgramFrame: "reject"`
   the run is still open and `free-row-program-failed` carries the hex
   trace; with `fake.delayWrites(50)` holding the write open, `terminate()`
   WAITS (rev 5) — the ring reads p.80 write, its ack,
   `free-row-program-sent`, THEN the terminate write, in that order (drop
   the await and the terminate write precedes the send's completion, since
   the fake's ack lands inline while its write promise is held — so the
   `free-row-program-sent` position is the assertion that bites); with the
   ack withheld, a `terminate()` issued mid-window is still unwritten and
   unsettled at 4999 ms, and at 5000 ms the deadline fires,
   `free-row-program-unanswered` is logged and the terminate goes out
   (independent literals, never the constant); a mutation that re-adds
   `sendPrepare()` closes the free row on the terminate-reacting fake (red).
2b. Hook (rev 5, the layer that can reach it) — four legs, and **the
   mutation is NOT the same one for each**. Rev 5 said "restore the
   `mode !== "justrow"` exclusion → red" for all of them, and two thirds of
   that was false: `cancel()`'s exclusion restored ALONE leaves the whole
   suite green, and `endSession` has no such exclusion to restore. Measured
   on `ed8b0766`, one mutation at a time, `pnpm test --project unit
   --project client` (baseline: `Test Files 230 passed`, `Tests 6584 passed
   | 1 skipped`):

   | leg | assertion | the mutation that BITES | what its failure says |
   | --- | --- | --- | --- |
   | `cancel()` at `ready` | the terminate literal reaches the wire after the p.80 write and its ack | **both** exclusions restored (`cancel`'s AND `teardown`'s) | `expected +0 to be 1` — `Test Files 1 failed \| 229 passed`, `Tests 2 failed \| 6582 passed` (this leg and the unmount leg) |
   | an unmount at `ready` | same | `teardown`'s exclusion alone | `expected +0 to be 1` — `Test Files 1 failed \| 229 passed`, `Tests 1 failed \| 6583 passed` |
   | `endSession()` inside the send window | the terminate follows `free-row-program-sent` | **the refusal**: restore `if (programInFlight === "beginFreeRow()") throw new ProgramBusyError(programInFlight)` in `terminate()` | `ProgramBusyError: beginFreeRow() is already in flight on this driver…` — `Tests 6 failed \| 6578 passed` across `driver.test.ts` and `useMonitorSession.test.ts` |
   | an unmount while END's terminate is still suspended | the terminate frame is on the wire before the transport's `disconnect()` | drop `disconnect()`'s await of the owed write | `expected 1 to be 2` (hook), `expected 1 to be -1` (driver) |

   **The falsified leg, stated where it was argued:** restoring `cancel()`'s
   exclusion alone leaves `Test Files 230 passed` / `Tests 6584 passed | 1
   skipped` — its own `teardown(armed, driver)` call then sends the
   terminate instead. Recorded at the predicate and at the test in
   `7d0c50ce`; recorded here, where the claim was made, in the delta pass's
   second fix round.
3. Replay over the 08-31 capture (observe-only; the replay transport
   resolves writes and never acks): the free row still opens and
   completes exactly as today, the ring holds ONE `write` of the p.80
   frame and, after the deadline, `free-row-program-unanswered` — and NO
   `free-row-program-sent`/`-failed` (RF24; note `run()` cannot see an
   unrecorded write, so this test's value is the ring, not the replay's
   divergence check).
4. Door: the body line reads James's line, verbatim; `Nothing is
   programmed` appears nowhere (grep). E2E on the fake: the connected
   flow shows the line AND the diagnostics door (`/you/diagnostics/monitor-logs`)
   carries `free-row-program-sent` in its COPY export for that session (the door lists sessions and event counts, never lines; rev 4.2) — the only place an
   e2e can see a detached send (nothing on the flow branches on it).
5. **Walk leg, with a CONTROL (the antagonist's shape, since pulling from
   the menu enters Just Row anyway and a terminate may leave the monitor
   at type 1):** (a) power-cycle the PM5 to a virgin main menu; the ring
   exists only after connect, so the control reads "the FIRST `structure`
   line in the diagnostics door says `workoutType=0`" (that entry carries
   the raw type on change from the first 0x0031); photograph the PM5
   screen BEFORE connecting;
   (b) connect from the door; photograph PM5 + phone in one frame BEFORE
   the first stroke — the PM5 on its Just Row screen, the phone reading
   the line; (c) pull, frames arrive, end, log. Negative leg: connect
   again immediately after a Menu end (the PM5 sitting at type 1) and
   photograph whether the screen changes. Observation to record, not a
   gate: the split cadence of the programmed row versus the menu-entered
   row's 5:00.
6. The three stale comments are gone (grep the quoted phrases).

## PR shape

One PR, not fast path (driver + domain commands + door + fake; the hook
is untouched). Antagonist full pass DONE (rev 1 → 2; ledger entry rides
this branch); no PM gate (no number, no shape, no auth; the release call
rides the next notes PR). James reviews after the walk leg.
