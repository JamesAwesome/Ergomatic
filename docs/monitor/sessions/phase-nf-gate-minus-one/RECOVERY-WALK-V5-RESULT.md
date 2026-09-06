# NF-RECOVERY-v5 result — case 2 read the tag but stalled in query-scenario mechanics

## Outcome

Continuation of v4 at James's direction ("lets keep walking"), cases only, same
installed 0.23.0/789, transport wired. **Case 2 (stop-during-query) stopped on
a helper `TimeoutError`** (no guard), the block stopped per protocol, cases 3-4
unrun. Two reader starts used. Cleanup verified.

**Unlike v3, this is not the dark-PM5 problem.** The native trace shows the tag
was read: generation 1 `rf.active → ending`, Core NFC **200**, 2.7 s;
generation 2 `rf.active → error → ending`, Core NFC **200**, 4.2 s. The probe
reached the query hold (`"stage":"query"` logged) and exported a partial
(`inspector-stop-during-query/partial-evidence.json`, exportId `f7f4f12`).

## The new signal (for desk diagnosis, no erg)

Every one of the seven receipt exports shows `records: 0`, `decodedName: null`,
`connected: false` — even though two native NDEF sessions succeeded (code 200).
So the JS layer did not carry the read into `entry.records` for this scenario,
or the query-stage hold cleared it, and generation 2 logged an `error` event
before its (successful) ending. The helper then timed out at an
`active-document` DOM wait after the hold. Whether that wait is the terminal
"BLE connect and disconnect observed." wait after Start B, and why no attempt
populated records or connected, are the two desk questions. Both are
reproducible against the Flipper replica (NFC read works desk-side, proven in
NF-FLIPPER-EMU-v2) and in jsdom against the probe's query-hold path.

## Operator/host issues this run (fix before v6)

**Root cause James named (2026-09-06): not prepared enough in real time.** The
locking followed dead time the controller created (two restarts, a resent step
block), not just the phone's auto-lock. Before v6 the full host sequence
(controller launch + `WebView loaded` + idle check) is rehearsed to green at the
desk in a zero-scan dry run immediately before the invitation, so **go →
present-tag has no host work in between**, and every case block is pre-written
and sent end-of-turn. Recorded as a standing rule (memory: nfc-walk-realtime-prep).


1. **The phone locked between the v4 bracket and case 2**, and iOS refused the
   app relaunch: `FBSOpenApplicationServiceError … device was not, or could
   not be, unlocked`. Readiness must include "keep the screen awake"; the
   `set`-reply gate the PM added is what let us recover without burning a case.
2. **The controller rejects a 10-minute deadline** (hard cap 8 min): it must be
   launched with an ≤8-minute clock nested inside the operator cap, or the
   controller changed (code change, own review). Cost two restarts across
   v4/v5.
3. **A stale `inspector-idle/` output directory blocks a rerun** (helper's
   no-reuse rule); the controller relaunch also needs the prior console/evidence
   moved aside. Both are controller/helper ergonomics, not walk findings.

## Next (superseded 2026-09-06)

Superseded the same day: cases 2-4 and this query-scenario diagnosis were cut
as ship gates on the antagonist's verdict (REMAINING-PROOF.md, "Ship
decision"). The paragraph below is retained as the record of what was planned.


`NF-RECOVERY-v6` needs no new erg time yet: first diagnose the query-scenario
zero-records/timeout at the desk (Flipper replica + jsdom), because if the
scenario mechanics are wrong the walk cannot pass regardless of the PM5. Only
after that, a walk for cases 2-4 with: readiness "screen awake", the controller
clock ≤8 min, and per-case `set` gating (already PM-approved for the bracket).
Raw trace kept private under R (`authorized-recovery-v5-*/`).
