> **Archived 2026-08-28** from `ROADMAP.md` (lines 1043-1134 of the pre-rebalance file, main `39e9430`).
>
> This is the phase as it was written while it ran. It is a RECORD: nothing
> here is scheduled, and its open items were lifted into `ROADMAP.md`'s live
> slate before this file was created. Do not cite it for a live question.

## Phase 7A-fix-2 — the status bitfield, and what it invalidates

**Status:** Done (Tasks 1-6, commits `0d0af28`..`fcb7a4c` on
`phase-7a-monitor-domain`; merged with 7A as PR #52 on James's explicit
approval, after the merge-gate row had run).
**Trigger:** FIRED — `docs/monitor/pm5-interface-notes.md` §19 (2026-08-06)
established that the CSAFE status byte was being parsed wrongly and that
several conclusions recorded as PM5 behaviour were consequences of that
parse. Nothing here is a new hardware finding; it is the fix list §19
generated, now shipped.
**Authority:** `docs/monitor/pm5-interface-notes.md` §19 for every citation
below.

- [x] **The status bitfield.** `app/domain/monitor/pm5/response.ts` masks
      instead of comparing: accept `(status & 0x30) === 0x00`, reject
      `(status & 0x30) === 0x10`, `bad`/`not-ready` for the other two
      previous-frame values, `status & 0x0F` the slave state, `status &
0x80` the frame toggle (never tested for failure), bit `0x40`
      reserved. `REJECT_STATUS_BYTE` is retired, and `CsafeResponse` gained
      a `kind: "unparseable"` member so a garbled frame is no longer
      conflated with a genuine reject; `buildAckFrame` and the fake
      synthesise all four frame statuses, any slave state and either
      toggle. Task 2 (§19.1).
- [x] **Re-derived D1/D2 from the raw traces.** §19.1's 34-row per-send
      table decodes every captured status byte in both sessions: zero of
      the twelve RAW bytes was a rejection. D1 is WITHDRAWN, with the
      display-emptying `:00` transition left STANDING OPEN as Verdict (a);
      D2's framing is WITHDRAWN while what it protected survives through
      the documented OFFLINE slave state (Verdict (c)); and
      program-over-loaded WORKS (Verdict (b)), on a weaker argument than
      first claimed, since the observed rest-free row followed a reconnect
      and a second send rather than one unbroken connection. Task 1
      (§19.1/§19.2).
- [x] **The terminal-latch recovery.** The monitor never stops responding;
      on completion it parks in `WorkoutLogged` and leaves via the Menu
      button or a terminate command ([CSAFE-DEF] Appendix E). `activeRun`
      (`src/monitor/driver.ts`) is opened by `program()` and only by
      `program()`; a terminal state closes that run while every
      subscription stays live, so frames keep flowing after
      `workoutComplete` and `program()` works again with no reconnect. A
      boundary arriving outside an open run emits `index: null` plus a
      `boundary-out-of-run`/`terminal-out-of-run` entry, and replacing an
      open run logs `run-replaced`, rather than corrupting a closed run's
      actuals. Task 4 (§19.4).
- [x] **The no-rest interval rule.** `domain/monitor/pm5/intervalIndex.ts`
      had applied forward attribution only on the resting side.
      `toActualIndex` now applies the offset unconditionally for 0x0037/38
      (`IntervalActual.index`), clamped to the explainable range
      `[0, L+1]`, emitting `null` plus a forked `"divergence"` entry
      outside it; 0x0033's own `toProgramIndex` stays rest-keyed. The
      `index-unverified` trace entry is RETIRED. Task 5 (§19.8, §17 item
      13).
- [x] **`sendPrepare` replaces the clear step.** `program()` still leads
      with a terminate-shaped step, re-justified as the documented
      `WaitToBegin` recovery path rather than a "clear" (nothing clears;
      terminate re-arms the same workout, §19.5); its refusal is swallowed
      as routine (`"prepare-rejected"`), broadened from nak-or-timeout to
      anything but a confirmed disconnect. Task 3.
- [x] **`SetScreenState` is asynchronous.** Its ack means "queued", not
      "done" ([CSAFE-DEF] p.65), so `terminate()` waits the documented
      ≥1 s fallback delay as a tick bound rather than polling
      `CSAFE_PM_GET_SCREENSTATESTATUS`, which needs the pull path this drop
      does not build (§17 item 14, §19.6).
- [x] **`GetErrorType` on a genuine reject.** A workout-configuration
      reject is atomic and not self-describing ([CSAFE-DEF] p.50), so
      `sendGetErrorType` fires ONE `buildGetErrorType()` on a genuine
      `"nak"`, bounded by `errorTypeTicks`, and logs the raw hex reply with
      no decode claim; the decode itself waits on §17 item 14. Task 3
      (§19.7).
- [x] **The fake and the driver stopped modelling the withdrawn
      behaviour.** `src/monitor/transports/fake.ts` accepts-and-replaces
      instead of rejecting-when-loaded, toggles bit 7 on every response
      frame, varies slave state, echoes opcodes in its acks, and can script
      a genuine `0x11` reject or a garbled frame (each marked synthetic and
      never observed); `driver.test.ts` no longer pins D1 by name. Task 6.

**Record:** the merge-gate row (§17's five James-operated steps) RAN on
2026-08-06 as laptop session 3, and §18's session-3 heading holds
Expected-vs-Observed for each step: all five PASSED and §17 item 15 is
ANSWERED. Heart rate joined that row when James's Apple Watch was paired to
the PM5 as its HR source, so live `heartRateBpm` and the actuals'
`avgHeartRateBpm` were observed PRESENT for the first time (every earlier
reading was the no-HR-source `0` sentinel, §19.9); the belt path and
`CSAFE_PM_GET_HRM` stay future. The row's own live bisect surfaced a defect
outside this phase's scope, programming over a RUNNING workout arming
structurally empty (§19.13), which became Phase 7A-fix-3 below and reopened
no bullet here.

**Exit:** MET — every bullet above has a passing test (2282 all-projects /
111 files, e2e 210), no test encodes a whole-byte status comparison, and
§18/§19's corrected record agrees with the code.
