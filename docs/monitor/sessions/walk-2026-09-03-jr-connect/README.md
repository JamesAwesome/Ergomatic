# Walk 2026-09-03 · Connect puts the erg into a Just Row session (PR #278, item 2)

Phone walk (native build 0.35.0 (845) from Xcode, worktree `Ergomatic-wt-jr2`,
branch `jr-connect-drives-erg`), against prod (v0.35.0). NO recordings: the
recording seam is web-only. Evidence: three diagnostics rings copied off the
door (`ring-*.json`, byte-identical COPY export), James's screen reports, and
two PM5-only photos, transcribed below.
Scope: this PM5, these three sessions. Serial and firmware: not captured.

## Provenance

| Ring | Leg | What the PM5 showed (James, SCREEN) |
| --- | --- | --- |
| `ring-1-control.json` | control + positive | powered to the plain menu, photographed; on Connect "shows the just row screen"; 20.8 m / 11.2 s; END on the phone; saved |
| `ring-2-menu-end.json` | negative (erg ends) | Connect → Just Row screen; pulled (12.2 m / 8.9 s); Menu on the PM5 ended it; app closed and saved ("works") |
| `ring-3-reconnect-cancel.json` | reconnect + Cancel | Connect again → Just Row screen ("yes"); James tapped Cancel on the Ready screen; the PM5 STAYED on the Just Row screen |

## Photos (SCREEN, PM5 only — no phone in frame; CORRELATED to ring 1 by
James's sequence, not SAME-FRAME)

| File | Shows | Reads |
| --- | --- | --- |
| `photo-1-control-menu.jpg` | the control: PM5 main menu BEFORE Connect | `Main Menu`, date line `3 Sep 03:…`, entries `Just Row / Select Workout / Connect / Memory / More Options` |
| `photo-2-justrow-screen.jpg` | the PM5 AFTER Connect, before the first stroke | Just Row screen: `:00` / `:00` (elapsed, split), `0 m`, `0 s/m`, `ave /500m :00.0`, `split meters 0`, `projected 30:00 0 m` |

The second frame is the PM5's own Just Row screen with nothing rowed, which
is what the app's frame is meant to produce; ring 1's `workoutType=1` is the
wire-side reading of the same state.

## Findings (wire, from the rings; script: see the numbers below)

1. **PASS, with the control: the frame changes the erg.** Ring 1's first
   `structure` line reads `workoutType=0` (the virgin menu, the PM5's idle
   default) 1.16 s after the write; the ack `f1 81 76 02 01 13 e7 f2` lands at
   1.97 s; the next `structure` reads `workoutType=1` 89 ms after the ack and
   stays there. The transition is inside one ring, ordered write → type 0 →
   ack → type 1. (Status byte 0x81 is an accept, Phase 7A. Ring 3's ack for
   the same frame reads `f1 01 76 02 01 13 67 f2` — status `0x01`, ALSO an
   accept: the two differ only in the CSAFE frame-toggle bit, which
   "toggles between 0 and 1 on alternate frames" ([CSAFE-DEF] p.11 Table 9,
   quoted at `docs/monitor/pm5-interface-notes.md` §19.2). This repo once
   invented a machine-side mechanism to explain that alternation — defects
   D1/D2, both withdrawn in §19.2 — so read it there before deriving
   anything from a status byte. All three rings are accepts, which is also
   why the driver logged `free-row-program-sent` in each: that entry
   requires `frameStatus === "ok"`.)
2. **Readback is unsound, confirmed on hardware.** Rings 2 and 3 open at
   `workoutType=1` BEFORE their ack (the PM5 keeps the last Just Row's type at
   its idle screen), which is exactly why the spec dropped verification.
3. **A Menu end mid-row closes cleanly.** Ring 2: `state=terminated` off the
   0x0031 (`terminal-raw … 7d 03 00 7a`), record closed, saved, no terminate
   written by the app.
4. **DEFECT (James, at the erg): Cancel on the Ready screen leaves the erg in
   the Just Row session.** Ring 3 ends `disconnect-requested` with no
   terminate write. **ONE cause was OBSERVED**, and only one:
   `useMonitorSession.ts`'s `cancel` excludes `mode === "justrow"` from its
   terminate, justified by "a free row armed nothing" — true before this PR,
   false now. RF18's tripwire (a comment naming its own precondition), stepped
   over by the PR's prose sweep because it is code, not the listed prose.
   **What was NOT observed, and must not be written up as if it were:** the
   driver's own `terminate()` refusal while the p.80 send holds the ack slot.
   Ring 3's Cancel ran 1589 ms AFTER that send's ack (`684570` → `686159`),
   so `programInFlight` was already `false` and the refusal was never
   entered. It is separately reachable — an END or a Cancel inside the ~2 s
   ack window, silent because both callers swallow the rejection — and is
   fixed as HARDENING beside the observed cause, not as a second cause of
   what James saw.
   **FIXED in `b74c65a0`** (same PR): `cancel()`'s armed predicate and
   `teardown`'s both drop the `mode === "justrow"` exclusion, so Cancel and
   an unmount at `ready` terminate a free row; and `driver.terminate()` now
   WAITS for the free-row send to settle instead of refusing it, so an END
   inside the window reaches the erg too. Pinned at the hook (the layer that
   can reach it), plus a door test that the Ready screen's Cancel button
   actually calls `session.cancel()`.
   **AND A THIRD PATH, found by the delta pass on the fix and fixed in
   `ed8b0766`:** the 5000 ms wait `terminate()` now takes races the app's
   own teardown, which hangs up. Ring 1 times the whole END→hang-up chain
   at **4027 ms** (all offsets from its p.80 write): `handoff-hold` +66903
   → `handoff-released` +68905, a 2002 ms burst hold, then +70930
   `disconnect-requested`, 2025 ms of release/navigation/unmount. The Ready
   screen is up at its first `frame`, +1159 ms, so the EARLIEST END lands
   the hang-up at about write+5186 ms — against a suspended terminate the
   deadline releases at write+5000 ms. About 186 ms, on the wrong side of a
   wait nobody tuned for it. `disconnect()` now holds the hang-up while any
   terminate still owes its write.
5. **Ack latency is ~2 s, not ~90 ms.** write→ack: 1968 / 2060 / 1788 ms
   (three rings). The spec's "~90 ms ack seen on hardware" was a workout
   program's ack; the Just Row frame's ack arrives after the three
   `notify-first` lines. `FREE_ROW_PROGRAM_DEADLINE_MS = 3000` leaves ~1 s of
   margin, and the Ready screen is up (first `frame`) ~0.8 s before the ack:
   a Cancel or END in that window meets the send still in flight.
   **FIXED in `b74c65a0`** (same PR): the deadline is 5000 ms — ~2.4x the
   slowest ack measured here — and it is a ceiling, not a delay, since an
   ack that lands clears the flag on arrival. The "~90 ms" figure is
   corrected at the constant itself and in spec rev 5.
6. Observation: ring 1 latched once (`gap=4258ms`) while James photographed
   with the app backgrounded; recovery was clean, no banner reported.

## Numbers

```
ring-1-control.json            write→ack 1968 ms | structure: type 0 (t+1158) then type 1 (t+2057)
ring-2-menu-end.json           write→ack 2060 ms | structure: type 1 pre-ack
ring-3-reconnect-cancel.json   write→ack 1788 ms | structure: type 1 pre-ack | no terminate write
                               | ack→disconnect-requested 1589 ms (the Cancel, well AFTER the send settled)
ring-1-control.json            | offsets from its own p.80 write: first frame +1159 | handoff-hold +66903
                               | handoff-released +68905 (2002 ms hold) | disconnect-requested +70930 (+2025 ms)
```

Produced by: `python3 -c` over the three files (write→ack = first `ack`.atMs
− first `write`.atMs; structure types in order).
