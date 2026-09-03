# Connect puts the erg into a Just Row session — design

**Status: spec rev 1, 2026-09-02. Gate 0 presented (the Ready frame's two
copies). Antagonist FULL pass owed (wire semantics). No stored shape.**
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
- **The type byte is what the machine picks for itself.** Decoded from
  `docs/monitor/sessions/walk-2026-08-31-justrow/just-row-pm5-recording-1788214688045.jsonl.gz`
  (0x0031 offset 6, `parse.ts:130`): at the main menu, before any pull,
  `workoutType = 0`, state `0` (WAITTOBEGIN); at the first pull (t=109.7 s)
  `workoutType = 1` with state still `0`, then state `1` (rowing). So the
  PM5's own menu-entered Just Row is type `1`, the same byte p.80 programs
  — and the readback DISCRIMINATES menu (0) from Just-Row-armed (1). PRIMARY
  (machine). **RC-38 disposition:** the Appendix A `OBJ_WORKOUTTYPE_T` row
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
  (ecosystem review §g). At the menu it is a no-op; on a finished-workout
  screen it clears it. Reused, not re-invented.

## Rulings

1. Send Concept2's p.80 frame, byte for byte (`buildJustRowProgram()`
   returns exactly it; a test pins the literal including the checksum).
2. Verify like a workout: within the same tick budget `verifyArmed` uses,
   the machine must report `workoutType === 1` and state WAITTOBEGIN.
   Verified → Ready copy A. Not verified → Ready copy B (today's words)
   and a ring entry; the free row proceeds exactly as today, because
   pulling from the menu still enters Just Row. Never fatal.
3. Copy A (Gate 0): `Just Row is on the monitor. The clock starts on your
   first stroke.` Copy B: the shipped line, unchanged.
4. The `freeRow` opt-outs (no divergence escalation, no structure
   watchdog) stay: a JustRow program has no interval structure.

## Mechanism

1. `commands.ts`: `WORKOUTTYPE_JUSTROW_SPLITS = 0x01` (doc label; machine
   corroboration cited), `buildJustRowProgram(): Uint8Array[][]` — one
   unit, the p.80 frame's payload for `sendSequence`.
2. `driver.ts` `beginFreeRow()` becomes `beginFreeRow(): Promise<"programmed" | "unverified">`:
   open `activeRun` as today, then `sendPrepare()`, `sendSequence(buildJustRowProgram(), "free-row-programmed")`,
   then a verify that resolves when a 0x0031 tick reports `workoutType === 1`
   and state `armed`, or rejects after `verifyArmed`'s tick budget; every
   rejection/timeout is caught, logged (`free-row-program-unverified`, with
   the hex trace), and returns `"unverified"`. `activeRun.freeRow` is set
   BEFORE the send so the opt-outs hold throughout.
3. `useMonitorSession.ts`: `beginFreeRow()` returns the promise; the hook
   stores `freeRowProgram: "pending" | "programmed" | "unverified"` on the
   session (transient, not persisted — no stored shape).
4. `JustRow.tsx`: Ready copy branches on that value; `"pending"` shows copy
   B until the promise settles (never a blank line).
5. Fake transport: answers the p.80 frame like a workout program and flips
   its 0x0031 `workoutType` readback to `1`; a scripted `refuseJustRow`
   option leaves it `0` (the unverified branch).

## Lifetime (no stored state)

`freeRowProgram` is minted per arm attempt, cleared when the session
leaves `ready`, never persisted; a relaunch re-arms and re-sends.

## Exit criteria

1. `buildJustRowProgram()`'s bytes equal `F1 76 07 01 01 01 13 02 01 01 61 F2`
   through the framer (a literal, not derived from the constants).
2. Driver, fake transport: `beginFreeRow()` sends prepare then the frame,
   resolves `"programmed"` when the readback flips to 1, `"unverified"`
   when it stays 0 (both branches; a mutation that skips the verify goes
   red on the unverified case).
3. Replay over the 08-31 capture (observe-only, readback 0): resolves
   `"unverified"` and the door shows copy B — the negative branch on real
   bytes (RF24).
4. Door: copy A when programmed, copy B when unverified or pending
   (client test on the mocked session; e2e on the fake for the A path).
5. **Walk leg (the gate for the screen itself):** connect from the door at
   the main menu; photograph the PM5 showing its Just Row screen BEFORE
   the first pull, with the phone reading copy A in the same frame; pull;
   frames arrive; end; log. Second leg: connect with a FINISHED workout on
   the PM5's screen; the prepare clears it and the Just Row screen shows.
6. Every string on the board appears verbatim.

## PR shape

One PR, not fast path (driver + domain commands + hook + door + fake).
Antagonist full pass on this spec (wire semantics); no PM gate (no number,
no shape, no auth; the release call rides the next notes PR). James
reviews after the walk leg.
