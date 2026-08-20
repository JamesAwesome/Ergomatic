# The estimate keeps counting through a rest (Phase LL)

## What and why

James rowed Strong Breeze on his phone — 5×2:00 of work with rests of
2:00/2:00/3:00/3:00 — and watched `TOTAL LEFT` finish roughly a minute high,
with the progress bar lagging when interval 4 handed over to interval 5.

The countdown subtracts the wire's session elapsed from the session's
programmed total, and that total **includes the rests**. But this phase's own
antagonist pass established that the PM5's elapsed clock advances during a rest
**only while the flywheel is turning**. Sit still through a rest and the wire's
clock freezes, so the subtraction stops moving while real time passes. Ten
minutes of programmed rest in that session, and about a minute of drift.

The bar stalls for the same reason: its fill is driven by the same figure.

This spec makes the estimate count what it should have counted all along:
**every phase you have finished contributes what it was programmed to take, and
only the phase you are in is read live from the erg.**

**Weight: TRIAD** — it changes what a number a rower reads mid-row MEANS. Full
antagonist pass on this spec, PM final-PR gate on its PR.

## §1 The rule

```
estElapsed = Σ programmed seconds of every COMPLETED phase
           + (live seconds within the CURRENT phase)

estLeft    = max(0, totalSeconds − estElapsed)
```

`phases` is already the flat expanded list — work, rest, work, rest — that
`totalSessionSecondsOf` (`src/session/Timer.tsx:206`) sums today, so "phase"
here is that list's element, not the rower's interval ordinal. A rest is a
phase like any other and contributes its programmed length the moment it ends.

**Wall-clock is forbidden.** Not "discouraged" — forbidden. `Date.now()` since
session start breaks the moment a rower leaves and returns, which Phase PW
deliberately fixed and told testers about in v0.11.0's notes ("TIME counts the
work you rowed plus the rests you completed, never the clock on the wall"). Any
implementation reaching for a wall clock is wrong by construction.

## §2 One figure, two consumers

The progress bar's fill (`PaneLive.tsx` passes `model.elapsedSeconds` to
`ConnectedProgressBar`) and this countdown **derive from the same
`estElapsed`**. They are computed separately today, which is why the bar lagged
alongside the countdown rather than independently of it. After this they cannot
disagree.

## §3 What this does NOT fix, stated because a rower will meet it

- **Over-resting makes the estimate run LOW.** Rest 4:00 where 3:00 was
  programmed and the estimate is a minute optimistic near the end, because a
  completed rest contributes its programmed length, not its actual one.
  **Accepted, and the direction is deliberate**: under-promising remaining time
  is the kinder error, and the alternative — running our own rest clock — means
  asserting a clock the PM5 is not reporting, which is the shape of the PAUSED
  state this project shipped once and had to retract.
- **The estimate can hold briefly at a handover and then step.** "Completed"
  is decided by the machine's own phase progression, and that indexing is known
  to lag at a boundary — the stale-count rest clamp (`driver.ts:1970-1987`)
  exists for exactly that, and fired live in the 2026-08-20 walk. A brief hold
  at a boundary is a large improvement on a stall for a whole rest, but it is
  not invisible and should not be described as exact.
- **It remains an ESTIMATE even with a perfect clock.** A distance phase's
  contribution to `totalSeconds` is distance ÷ target pace, so rowing faster
  than target genuinely shortens the session. This is why the label becomes
  `EST LEFT` (shipping separately, James's ruling).

## §4 The premise this rests on, and how it gets verified

The whole design assumes the wire's elapsed **freezes when the rower stops
moving during a rest**. That is this phase's own finding and it is well
evidenced — `domain/monitor/types.ts:36-38`, and `seriesRecorder.ts`'s header
records 21 rest samples on a capture where the rower kept paddling against 3 on
one where he mostly stopped.

**It is nonetheless verified inside this work, not inherited.** Replay a
committed rest-bearing capture through the real driver and measure whether
`sessionElapsedSeconds` flatlines through the rests and by how much. No
hardware. If it does NOT flatline, this spec's diagnosis is wrong and the work
stops for a re-think rather than proceeding to a different wrong number.

Captures: `docs/monitor/sessions/walk-2026-08-16/session-2-wu-4unequal.jsonl`
(real rests, rower moving) and the 2026-08-20 walk record (rests where he sat).

## §5 Testing

- **Failing test first, driven by a REPLAYED CAPTURE**, not a hand-built frame
  sequence — the stall must be reproduced from real wire data before it is
  fixed, and the test must go red against today's code.
- Pin the measured drift from §4 as a number, so a regression is visible as a
  changed figure rather than a vague "it stalls again".
- **Check whether any existing test pins the CURRENT stalling behaviour.** If
  one does, that is a finding to report, not an edit to make quietly.
- Self-mutation on every behavioural test, restored byte-identical.
- `pnpm e2e` and `pnpm screenshots` foreground — the connected surface renders
  this.

## §6 Exit criteria

1. Replaying a rest-bearing capture, `estLeft` decreases monotonically through
   a rest in which the wire's elapsed does not advance — with a test that goes
   RED against today's code.
2. The measured stall from §4 is recorded as a number in the spec's own record
   and pinned by a test.
3. The progress bar's fill and `estLeft` derive from one figure, proven by a
   test that moves both when that figure moves.
4. No `Date.now()` or equivalent wall-clock reads anywhere on this path, proven
   by grep in the report.
5. Over-resting is covered by a test asserting the estimate runs LOW rather
   than negative or clamped-wrong (§3's accepted limit, pinned so nobody
   "fixes" it into a wall clock later).
6. `DEVIATIONS.md` carries §3's two accepted limits.
7. The next tag's notes say the estimate used to run high during rests and no
   longer does.
