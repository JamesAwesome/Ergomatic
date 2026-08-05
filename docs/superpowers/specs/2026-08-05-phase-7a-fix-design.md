# Phase 7A-fix — what the erg taught us

**Date:** 2026-08-05
**Status:** Approved (James, 2026-08-05: clear-ignore-verify; await the
machine's own state; the driver normalizes indices; the fake models every
observed behaviour)

## Why this exists

Laptop session 1 (PM5 432331249, the `pm5-lab` harness + bridge) ran 7A's
driver against real firmware for the first time. The codec's bytes were
right; its **model of the machine was wrong** in ways no document states
and no test could catch, because the fake transport imitated a PM5 that
does not exist. Full evidence: the ledger's LAPTOP SESSION 1 section
(`.superpowers/sdd/2026-08-05-phase-7a-monitor-domain/progress.md`) and
notes §18.

Nothing here is speculative — every item below was observed, most of them
twice, with the bytes captured.

## What the hardware established

**Confirmed correct** (no action): CSAFE framing and the XOR checksum rule
(the PM's own ack checksums satisfy it — the document's three printed
values are errata, as encoded); the GATT status parse (distance, elapsed,
pace, rate all cross-check); 0-based WRITE indices; `intervalRemaining`'s
rebuilt computation (58.92 remaining at 1.08s into 60s, re-rooted at the
next interval); the terminal latch (`finished` + `workoutComplete`, no
un-finishing); ack-gated multi-chunk writes; multi-interval programming
itself.

**Defects** (this spec's subject):

| # | Observed | Consequence |
|---|---|---|
| D1 | The PM accepts a program ONLY when no workout is loaded. Programming over a loaded workout is rejected AND wipes it. | Sends alternate accept/reject; a failed connect costs the rower their loaded workout. |
| D2 | The same bytes got `0x01` accept and `0x81` reject on different sends; an `0x01` also came back from a send that programmed nothing. | `program()` resolving on the ack reports success for a no-op. |
| D3 | The PM attributes rests FORWARD: work0→idx0, rest→idx1, work1→idx1, rest→idx2. A 2-interval workout's final `IntervalActual` carried `index: 2`. | 7C would mis-attribute every actual. `divergence` never fired: both machine fields agree with each other, and both differ from ours. |
| D4 | Only ONE `intervalComplete` fired for two intervals — the first boundary produced no actuals. | 7C's prefill would silently lose all but the last interval. Cause not isolated. |
| D5 | With no belt: `avgHeartRateBpm: 0` (not 255, not absent). | We map only 255→null, so a bare erg reports "0 bpm" where the design requires `—`. |

**Fixed live at the erg, untested** (D6): the discovery filter (0x0030 is
not advertised — the picker scanned forever); the frame flood evicting the
programming trace from the 500-entry ring; the GATT characteristic cache
surviving reconnects (`InvalidStateError` on every post-reconnect write —
this broke the driver's whole reconnect path on hardware while passing CI);
a duplicate `gattserverdisconnected` listener; raw per-characteristic
notification logging.

## Decisions

| Question | Decision |
|---|---|
| Clearing before programming | **Clear, ignore rejection, verify.** Always send the clear; a rejection means nothing was loaded (the PM said exactly that when idle); proceed regardless. No "is a workout loaded" read exists that we trust. |
| Proving success | **Await the machine's own state.** `program()` resolves only when status frames show the workout armed with the expected structure. New typed reason `"not-observed"` for acked-but-never-appeared. |
| Index translation | **The driver normalizes.** `MonitorFrame.intervalIndex` and `IntervalActual.index` always carry OUR program index; the raw machine value goes to the event log only. |
| Fake fidelity | **Model every observed behaviour.** Each hardware finding becomes a permanent CI behaviour + a test that fails against today's code. |
| D4's fix | **Diagnose first.** The raw notification logging answers "never arrives" vs "we discard it" in one row; the fix follows the answer. No speculative code. |

## Design

### 1. The programming lifecycle (D1, D2)

`program(p)` becomes three phases inside one method:

1. **Clear** — send the clear sequence; a `0x81` here is expected and
   logged as `clear-rejected` (informational, not an error). Rationale in
   a comment: the PM rejects a terminate when nothing is running.
2. **Send** — the existing ack-gated frame sequencing, unchanged.
3. **Verify** — await status frames showing `state === "armed"` and the
   machine reporting the expected interval structure, bounded by the
   existing tick-based policy (reuse `DriverOptions.ackTimeout`'s shape;
   name the verification bound separately — `verifyTicks` — so a slow
   monitor and a silent one stay distinguishable). On expiry:
   `ProgramRejection` with `reason: "not-observed"`, the full trace in
   the log.

The destructive consequence of a rejected program is documented at the
call site and in `MonitorDriver.program`'s JSDoc: **a failed program can
cost the rower a loaded workout** — 7B must warn before programming, not
after failing.

### 2. Index normalization (D3)

A pure function in `domain/monitor/pm5/` (bytes-adjacent, testable):

```ts
export function toProgramIndex(
  machineIndex: number,
  machineState: MonitorFrame["state"],
): number | null;
```

Rests report the index they are heading INTO; work reports its own. Our
program index is therefore `machineIndex` during work and
`machineIndex - 1` during rest, clamped at the ends, `null` when the
machine's value cannot be explained by the program's length (that case
logs `divergence` — which is what should have fired this session).
`IntervalActual.index` is normalized the same way at emission.

### 3. The missing boundary (D4)

Task 1 is a **diagnosis task**, not a fix: one verification row with the
new raw logging, reading whether `0x0037` arrives at the first boundary.
Its finding determines Task 3's content, which the plan states as a
branch (arrives-but-discarded → fix the emission condition;
never-arrives → subscribe/enable differently, or derive actuals from the
status stream at boundary transitions). Either way the fix ships with a
fake behaviour that reproduces the real timing.

### 4. Heart rate (D5)

Both `0` and `255` map to `null` in `parse.ts`, cited to §18's
observation and §15 #2's 0x0039 counter-evidence. The design's `—`
rendering then works on a bare erg.

### 5. The fake becomes a model (the hardening answer)

`fake.ts` gains, each with a test that fails against today's driver:
reject-when-loaded plus the destructive wipe; forward-attributed
indices; the HR zero sentinel; **handle invalidation on reconnect**
(writes after a reconnect must throw unless the transport re-fetched —
the behaviour whose absence hid D6's worst bug); and boundary
notification timing matching whatever Task 1 finds.

### 6. Retro-tests for the live fixes (D6)

One test each for the four erg-side patches: the discovery filter's
shape, cache-cleared-on-connect, single-listener-on-reconnect, and
state-change-only frame logging.

## Testing

Every defect gets a test that fails against today's code — that is the
acceptance bar for this spec, not coverage percentage. Plus: the
lifecycle's three phases (clear rejected → still programs; verify times
out → `not-observed`; happy path); `toProgramIndex`'s table including the
end clamps and the unexplainable case; parse's dual sentinel; and the
existing 2094 stay green. One short verification row closes the phase.

## Out of scope

7B's screens (the connect-flow warning is recorded for its spec, not
built); 7C's logging; the `program-many`/distance questions (untested
from a clean state — they go to §17 for the next session); any
protocol change beyond the clear step.

## Exit criteria

- Programming a loaded monitor clears, programs, and is verified from the
  machine's own state — with a typed failure when it doesn't appear.
- Indices reaching any consumer are ours; the machine's are in the log.
- Every observed hardware behaviour is a fake behaviour with a test that
  fails without its fix.
- D4 resolved by evidence, not inference.
- §17 updated with what's answered; §18 complete; full gates.
