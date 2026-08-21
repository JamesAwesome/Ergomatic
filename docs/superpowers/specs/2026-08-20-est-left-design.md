# The estimate keeps counting through a rest (Phase LL)

## What and why

James rowed Strong Breeze on his phone — 5×2:00 of work with rests of
2:00/2:00/3:00/3:00 — and watched `TOTAL LEFT` finish roughly a minute high,
with the progress bar lagging when interval 4 handed over to interval 5.

The countdown subtracts the wire's session elapsed from a programmed total that
**includes the rests**. But the PM5's interval clock advances 1:1 with wall time
only while `rowingActive` is true, and freezes to the centisecond when it goes
false. Sit still in a rest and the subtraction stops moving while real time
passes.

**The fix is to read the field the machine already sends.** `0x0032` Additional
Status 1 carries **Rest Time** at offsets 13-15, 0.01 s/lsb, and it counts down
in real time regardless of the flywheel. We have parsed it since Phase 7A
(`parse.ts:169`, `AdditionalStatus1.restSeconds`) and **consumed it nowhere.**

**Weight: TRIAD.** Full antagonist pass: DONE 2026-08-20, and it rewrote this
spec — the first version invented a completed-phase accumulator to avoid needing
a number the machine reports twice a second, and that accumulator went backwards
five times on a single replayed capture. §7 records what it broke.

## §1 The rule

```
estElapsed = Σ programmed seconds of every COMPLETED phase
           + live term for the CURRENT phase
           where live term = (current phase is a REST)
                             ? phaseSeconds(phase) − frame.restSeconds
                             : frame's own interval clock

estElapsed = max(estElapsed, previous estElapsed)      // monotonic, §3
estLeft    = max(0, totalSeconds − estElapsed)
```

`phases` is the flat expanded work/rest list `totalSessionSecondsOf`
(`Timer.tsx:206`) already sums. A completed phase contributes its programmed
length; a rest in progress contributes how much of it the machine says has
elapsed; a work phase in progress contributes the interval clock, which is
correct there because a rower in a work phase who is not moving is not rowing.

**Wall-clock is forbidden.** `Date.now()` since session start breaks when a
rower leaves and returns — Phase PW moved TIME off it deliberately and told
testers so in v0.11.0 ("never the clock on the wall"). The antagonist attacked
this prohibition and could not break it. It simply is not the only alternative
to a frozen clock; Rest Time is.

## §2 The clamp is the change, not the unification

**CORRECTED.** The first draft claimed the bar's fill and the countdown are
computed separately and that this explains the shared lag. That was false and
self-refuting: `surfaceModel.ts:970-984` derives `max(0, T−x)` and `min(x, T)`
from the same `x`, and `T − min(x,T) ≡ max(T−x, 0)`. They lag together **because
they are already one figure.**

The real change is that `min(x, T)` today caps the bar at 100%, and
`Σ completed + live` has no such cap. **The clamp is therefore load-bearing and
must be kept**: the fill stays capped at the session's own length, so a final
interval rowed long can never push it past full.

## §3 Monotonicity is a requirement, not a property

The estimate **must never decrease**. The first draft assumed a
completed-phase sum could only step forward; replayed frame-by-frame over
`session-2-wu-4unequal.jsonl` it dropped five times:

| cause | worst |
|---|---|
| `finished` frame: `frame.intervalIndex` is `null` and `surfaceModel.ts:703` launders it `?? 0`, collapsing the phase index 7 → 0 | **−428.5 s** (`0:00` → `7:08`) |
| r0 work→work boundary: 0x0031's counters reset one notification before 0x0033's Interval Count | −29.25 s |
| mid-rest elapsed re-base (CSAFE-DEF fn 12), absorbed by the register map's MAX today | −5.97 s |

Two guards, both required:

- **A `null` intervalIndex must NOT be laundered to 0.** `surfaceModel.ts:865-870`
  already refuses exactly this for the AVG cell and says why; the headline number
  needs the same refusal.
- **`estElapsed` is clamped monotonic non-decreasing.** That covers the boundary
  races and the re-base without needing to enumerate them.

## §4 What this does NOT fix

- **Dawdling at the START of a work interval still runs the estimate HIGH** —
  the same direction as the bug being fixed. The interval clock is flywheel-gated
  at the start of every work phase too (measured: four frames at `el=0.00` before
  the first stroke). Rest Time does not help here because it is not a rest.
- **It remains an ESTIMATE.** A distance phase contributes distance ÷ target
  pace, so rowing faster than target genuinely shortens the session. Hence the
  `EST LEFT` rename shipping separately.
- **An UNPRICED phase is a live-term hole.** `phaseSeconds` returns `null` with
  neither seconds nor a meters+targetSplit pair, and `totalSessionSecondsOf`
  maps null → 0. Reachable on connected with null baselines (a distance warm-up,
  `engine.ts:88-94`). The SUM is self-consistent, but inside such a phase the
  live term grows and then drops to 0 on completion. The phone timer guards this
  with `hasRemainingEstimate` and hides the row; `PaneLive.tsx` renders the cell
  unconditionally and needs the same guard.
- **REMOVED from this list:** the first draft claimed over-resting makes the
  estimate run low. On a programmed interval workout the PM5 ends the rest
  itself — measured, `restSec → 0.00` and the state flips with `el=0`. A rower
  cannot over-rest within a rest, so that sentence would have put a wrong
  accepted-limit into DEVIATIONS.

## §5 The premise, verified not inherited

Replayed through the production driver on
`docs/monitor/sessions/walk-2026-08-16/session-2-wu-4unequal.jsonl`:

| rest | wall | wire elapsed credited | lost |
|---|---|---|---|
| 1 | 29.4 s | 9.45 s | 19.9 s |
| 2 | 29.5 s | 7.23 s | 22.3 s |
| 3 | 29.5 s | 3.90 s | 25.6 s |

Session-wide 491.1 s wall against 419.76 s credited. Rest Time measured against
the same frames: interval clock frozen at `133.08` for 26 s while `restSec` ran
`26.91 → 1.85`, one second per second.

**Why James lost only ~1:00 rather than the ~7:40 a 77% loss rate predicts:** he
was **paddling lightly through the rests** (his own account, asked because the
arithmetic did not reconcile and no wire recording of that session can exist —
a TestFlight build cannot record). Keeping the flywheel moving keeps the wire's
clock running. The mechanism holds; the magnitude was never confirmation of it.

**Citation corrections.** The first draft cited `types.ts:36-38` for flywheel
gating; that passage says something else and never mentions the flywheel. The
real support is `seriesRecorder.ts:20-33`. It also named the 2026-08-20 walk
record as replayable; that record's own README says no wire recording exists for
the phone half.

## §6 Testing

- **Failing test first, from a REPLAYED CAPTURE**, red against today's code.
- **Assert MONOTONICITY across a whole real capture**, not just the happy path —
  that is what caught all five regressions, and reasoning did not.
- Pin the measured drift from §5 as a number.
- **`fake.ts:746` hardcodes `restSeconds: 0` on every 0x0032.** Until the fake
  reports it honestly, no e2e or screenshot fixture can exercise this at all.
  Teaching the fake is part of the work, not a follow-up.
- **Two existing tests pin the current behaviour and must be read before
  editing:** `surfaceModel.test.ts:1508` ("TOTAL LEFT subtracts the SESSION
  clock, never the interval's own resetting one" — added by an earlier
  antagonist pass as the suite's one discriminator) and `e2e/connected.spec.ts:628`
  (asserts the text changes across a 700 ms window). If either needs changing,
  that is a finding to report, not a quiet edit.
- Self-mutation on every behavioural test; foreground e2e and screenshots.

## §7 Exit criteria

1. Replaying a rest-bearing capture, `estLeft` decreases **continuously** through
   a rest in which the rower is motionless — with a test red against today's code.
2. `estElapsed` never decreases across an entire replayed capture, including its
   `finished` frame. Pinned by a monotonicity assertion, not by inspection.
3. A `null` `intervalIndex` is never laundered to `0` on this path — proven by
   grep in the report.
4. No `Date.now()` or equivalent on this path — proven by grep.
5. The bar's fill remains capped at the session length; a long final interval
   cannot exceed 100%.
6. The fake reports Rest Time honestly, and an e2e fixture exercises a rest.
   **STATUS AT PR TIME: HALF MET, and deliberately not softened.** The fake
   reports it honestly and `FakeStatusEvent.restSeconds` is scriptable — but a
   grep of `e2e/` finds ZERO events driving `state: "resting"` with a scripted
   rest value, so the back half is unmet in the repo today. The behaviour's
   real proof lives one layer down: unit replay tests against a committed
   capture (the mechanism) plus a component test that renders twice and reads
   the DOM (the production wiring). Both were confirmed by an independent
   reviewer applying the exact inverse-bug and deleted-wiring mutants.
   **This is recorded rather than rewritten because weakening a criterion to
   match what shipped is the failure this spec's own §6 warns about.** The PM
   final-PR gate rules on whether replay-layer proof suffices for merge; if it
   does, an e2e fixture is owed as a follow-up rather than a blocker.
7. `PaneLive.tsx` guards the unpriced-phase case the way the phone timer does.
8. `DEVIATIONS.md` carries §4's real accepted limits — the work-interval dawdle
   and the unpriced phase. NOT the over-rest sentence, which was wrong.
9. The next tag's notes say the estimate used to run high during rests and no
   longer does.
