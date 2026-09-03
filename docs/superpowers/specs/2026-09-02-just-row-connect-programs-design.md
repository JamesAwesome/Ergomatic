# Connect puts the erg into a Just Row session — design

**Status: spec REV 2, 2026-09-02. Gate 0 PASSED on rev 1c (James: copy A is
`The clock starts on your first stroke.`). The antagonist's full pass
(wire semantics) is folded: the frame HELD byte for byte; the readback
verification was FALSIFIED — rev 2 removes it and with it copy B and the
transient state. No stored shape.**
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
  (0x0031 offset 6, `parse.ts:130`): at a VIRGIN main menu `workoutType = 0`
  (`PRE_ARM_BASELINE_STRUCTURE`, "before anything has ever been armed");
  from the first pull `1`; and after the Menu end, 105 consecutive idle
  frames read `type = 1, state = 0` with nothing sent by anyone. This
  repo already names that shape: `statusFrames.ts:131-135`
  `EMPTY_ARM_STRUCTURE = { workoutType: 1, durationRaw: 0, durationType: 128 }`
  — "session 4a's captured empty-arm anatomy", the signature of a PM5 that
  armed NOTHING — and `driver.ts:4963` records that `sendPrepare()`'s own
  terminate drives the machine into exactly it. Rev 1 read the first 94
  frames of the capture and proposed `type === 1 && armed` as proof of our
  program; the antagonist decoded the whole file. **A verification whose
  preceding step manufactures its own pass condition is not a
  verification.** The only field that would answer "is the Just Row
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
- **Prepare:** the programmed path sends `TERMINATEWORKOUT` first
  (`sendPrepare`, `driver.ts:5656`); EXR does the same at session start
  (ecosystem review §g). What a terminate does at the main menu is
  UNOBSERVED (Appendix E documents terminate from WorkoutRow and
  WorkoutLogged only, §19.4/§19.5; `driver.ts:4963` says it can itself put
  the machine at type 1) — it is sent unconditionally, its NAK/timeout
  swallowed as today (`sendPrepare` rethrows only `"disconnected"`), and
  the walk leg observes it. `waitForPrepareSettle` returns at once unless
  the prior state was rowing/resting (`driver.ts:5532`), so nothing
  stalls at the menu. Reused, not re-invented.

## Rulings

1. Send Concept2's p.80 frame, byte for byte (`buildJustRowProgram()`
   returns exactly it; a test pins the literal including the checksum —
   the antagonist ran the real framer over the two units and got
   `F1 76 07 01 01 01 13 02 01 01 61 F2`, wrapper count `07`, checksum
   `0x61`, HELD).
2. **No readback verification** (rev 2; rev 1's was falsified above). The
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
   RC-37 `armedWatch` branch is held off during the send by ONE line —
   `driver.ts:4982`'s `!activeRun?.freeRow` guard — because `beginFreeRow`
   does not set `programInFlight`; a test pins that guard.**

## Mechanism

1. `commands.ts`: `WORKOUTTYPE_JUSTROW = 0x01` (a doc LABEL — the notes
   never transcribe `OBJ_WORKOUTTYPE_T`; machine corroboration above; NOT
   named `_SPLITS`, which the notes cannot quote) and
   `buildJustRowProgram(): Uint8Array[][]` — one unit, the p.80 payload,
   for `sendSequence`.
2. `driver.ts` `beginFreeRow()` stays SYNCHRONOUS in everything the hook
   relies on: it opens `activeRun` (with `freeRow: true`, so both opt-outs
   hold throughout) and returns as today. It additionally FIRES a detached
   send — `void (async () => { await sendPrepare(); await sendSequence(buildJustRowProgram(), "free-row-program-sent"); })().catch(log …)` —
   whose only effects are ring entries. No state, no promise surfaced, so
   the hook's synchronous `ready` flip (`useMonitorSession.ts:4773-4775`,
   "one indivisible step") and `JustRow.tsx`'s once-latch are untouched
   and the arm effect cannot re-trigger. Every rejection, NAK, timeout and
   disconnect is caught and logged; a disconnect mid-send is already the
   hook's link-lost path.
3. `JustRow.tsx`: the Ready body line becomes James's line. No branch.
4. Fake transport: accepts the p.80 frame like a workout program (acks);
   a scripted `nakJustRow` option answers a real NAK (`(status & 0x30) ===
   0x10`, §19.1) so the failed-send ring entry has a producer.
5. Comments swept in the same PR (they become false): `driver.ts:5836`
   ("DELIBERATELY SYNCHRONOUS AND UNACKED… no wire traffic"),
   `useMonitorSession.ts:4773`, `JustRow.tsx:291-293` ("a free row arms
   nothing, which is exactly why `beginFreeRow` sends no bytes").

## Lifetime

No state. The detached send belongs to the driver instance; a teardown
mid-send resolves as a disconnect and is logged as such.

## Exit criteria

1. `buildJustRowProgram()` through the real framer equals
   `F1 76 07 01 01 01 13 02 01 01 61 F2` (a literal, not derived from the
   constants).
2. Driver on the fake transport: `beginFreeRow()` returns synchronously
   with the run open and `phase` flipped BEFORE any byte is written
   (asserted by ordering); the prepare and the frame are sent, in that
   order, and `free-row-program-sent` is logged; with `nakJustRow` the run
   is still open and `free-row-program-failed` carries the hex trace; a
   mutation that drops the `!activeRun?.freeRow` guard at `driver.ts:4982`
   goes red on a test that ticks 0x0031 during the send.
3. Replay over the 08-31 capture (observe-only; the capture carries no
   acks): the free row still opens and completes exactly as today — the
   send's failure is a ring entry, never a behaviour change (RF24).
4. Door: the body line reads James's line, verbatim; `Nothing is
   programmed` appears nowhere (grep).
5. **Walk leg, with a CONTROL (the antagonist's shape, since pulling from
   the menu enters Just Row anyway and a terminate may leave the monitor
   at type 1):** (a) power-cycle the PM5 to a virgin main menu and confirm
   `type = 0` in the ring; photograph the PM5 screen BEFORE connecting;
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
