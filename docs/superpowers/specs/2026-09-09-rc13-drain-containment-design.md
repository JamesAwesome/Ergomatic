# Spec — RC-13: contain a throwing subscriber, and settle a run before replacing it

Status: PM phase-open gate PASSED with five binding conditions, all applied.
(`scratchpad/pm-rc13.md`, 2026-09-09: CONDITIONAL PASS — build now, halves
inverted, five binding conditions). The
containment fix is the reason for this PR and the drain is the passenger. An earlier
rower-visible justification for the drain was falsified by the antagonist anchor
pass (`scratchpad/antagonist-rc13.md`) and is withdrawn, not annotated.

Register row: `ROADMAP.md`, connected-surface table, row **RC-13** (find by name);
that row is REWRITTEN by this PR (§13). Ledger home: `docs/history/phase-rc.md`.

Read this session: `app/src/monitor/driver.ts`, `app/src/monitor/eventLog.ts`,
`app/src/monitor/useMonitorSession.ts`, `app/src/justrow/JustRow.tsx`,
`app/src/workout/ConnectedInterstitial.tsx`, `app/src/monitor/driver.test.ts`,
`app/src/monitor/avgPaceVerdict.replay.test.ts`, `app/e2e/*.spec.ts`.

---

## 1. What and why

Right now, when you pick a workout and the app programs your erg, the very last
thing it does is announce the arm to the one piece of code listening. That
announcement is not protected: if the listener throws for any reason, the throw
comes back out of the programming call itself, and the app tells you programming
FAILED — for a workout the erg has already confirmed it is holding. You would see
an error, the record would close as failed, and the monitor would be sitting there
armed and ready. This is on the ordinary path, today, no unusual timing required.
The same missing protection is what has RC-14 stuck: James asked for that silent
zero-fired verdict to be INSTRUMENTED, and the obvious instrument cannot catch the
one survivor that matters, because a listener can throw before the instrument is
even reached. One fix — isolating each listener so one throwing listener costs only
its own delivery — closes both. **That is the head of this PR.**

Riding along, because it is two lines once you are in the file and RF34 forbids
half-applying an invariant: the driver has two doors that replace the workout it is
tracking, and both throw away the outgoing piece's unfinished business instead of
closing it out — the 3 s window after a natural finish, and the 200 ms wait for a
summary's verification hash. **No rower can currently reach either door**, and the
honest reason matters more than the fact: the guard that closes the free-row door
landed on **2026-09-01 in #259, one day AFTER James gave this order**, and its own
comment says it was added because the e2e flow caught the product doing exactly
this. So the defect was reachable when he asked for it, and was closed incidentally
by a different phase the next day. The driver's own comments still claim it cannot
happen and give a reason that is false. **Nothing a rower sees changes. No stored
number changes. No screen changes.**

James, 2026-08-31 on RC-13: _"FIX IT here"_ — drain the deadline rather than cancel
it. James on RC-14: _"do NOT hunt it; INSTRUMENT it."_ This PR discharges the first
and unblocks the second; it does not discharge the second (§13).

## 2. Live and latent, priced separately

The PM gate's ruling, carried here so the tasks and the PR body cannot drift back:

| Half | Producer | Cost | Why it is here |
| --- | --- | --- | --- |
| **Containment** — per-listener isolation inside `emit` | **SUPPORTED, LIVE.** One production subscriber, ordinary programmed path, no fault injection | 0.5 hd | It is the only part with a producer, and it is the blocker on a second standing order |
| **The drain** — settle the outgoing run at both replacement doors | **NONE.** Shut by three guards above the driver (§6) | 0.2 hd | RF34: the invariant governs every door, and it is two lines once in the file |
| **The comments** — name the layer that actually holds each invariant | n/a | 0.25 hd | RF18 tripwire; prose is not a gate (RF37) |

**A false comment justifies fixing the comment. It does not justify the code.** What
justifies the code is the live hazard plus the blocked order. Tester impact: **none**.
Release recommendation: **not needed on this alone** — it rides whatever tag ships next.

## 3. TRIAD — what is done and what is owed

The change decides whether an `avg-pace-verdict` entry and a final `IntervalActual`
get FILED, and it changes how every driver event is delivered. TRIAD stands; the gate
class does not bend for reachability, only the dispatch count does.

| Gate | Status |
| --- | --- |
| `antagonist` full pass on the spec | **DONE / DISCHARGED.** It produced the headline finding and rewrote the justification. **No delta pass owed.** |
| `/harden` two-lens loop | **SKIPPED, said aloud** — the inline shape (James, 2026-09-04, #297) is used, so there is no plan carrying code blocks for the prescribed-code lens to read. Run it only if a code-bearing plan is written. |
| `product-manager` final gate on the PR | **OWED.** |
| Gate 0 / design gate | **NONE OWED** (§12). |
| Hardware walk | **NONE OWED** — no wire change, no new byte, nothing for an erg to disagree with. |

Not fast path: check (1) fails (`app/src/monitor/driver.ts`), check (5) fails.

## 4. The invariants

Stated as invariants, never as mechanisms (RF27).

> **V1 — DELIVERY IS ISOLATED.** A listener that throws while receiving a driver
> event costs that listener's own delivery and nothing else. No event delivery may
> fail the operation that emitted it: programming an accepted workout reports
> success, a replacement completes, and the driver records that a delivery was
> contained.

> **V2 — A RUN MAY NOT BE REPLACED WHILE IT STILL OWES AN ANSWER.** At every door
> that replaces `activeRun`, the outgoing run's pending reconcile and its pending
> terminate-observations are SETTLED — decided from the evidence already in hand and
> filed — before the new run exists. Settling may not fail the replacement, and no
> settlement may be attributed to, or read state belonging to, the incoming run.

> **V3 — A REPLACEMENT IS ATOMIC WITH RESPECT TO THE DRIVER'S OWN API.** From the
> moment a door begins replacing `activeRun` until that door has finished announcing
> the new run, no re-entrant call may open, replace or settle a run. `activeRun` has
> exactly one writer in flight at any time, and **which door owns that window is a
> fact the driver knows about itself** — never one supplied by a caller's phase
> guard. A refused re-entrant call is REFUSED VISIBLY, in the ring; it is never
> silently ignored.

Consequences carried by V2:

- **I1 — one answer per run.** Every closed run that armed a reconcile gets exactly
  one `summary-reconciled` and one `avg-pace-verdict` outcome, whichever way it ended:
  deadline expiry, disconnect, `reconcile()`, or replacement by either door.
- **I2 — the answer is the outgoing run's**, read only from state belonging to it.

### 4.1 Why V3 is stated here and not decided at implementation time

This is condition 2 of the PM pass, and it is RF27's own failure mode: PR #258 paid
nine review rounds for a plan that specified a mechanism where it owed an invariant.
The concrete hole V3 closes: putting listener code on a door's stack lets a listener
call back INTO the driver mid-replacement. Traced (antagonist, PRIMARY):

| Re-entrant call during a replacement | Today |
| --- | --- |
| `driver.program()` | hits `programInFlight`, throws `ProgramBusyError` — already V3-compliant |
| `driver.disconnect()` | reaches `drainSummaryReconcile`'s idempotent no-op — safe |
| `driver.beginFreeRow()` | **passes `runIsOpen()`** (the outgoing run is closed) and assigns `activeRun` in the middle of `program()`'s replacement block, which `program()` then overwrites |

The third is held today only by the hook's `phase === "programming"` guard — the exact
call-graph argument this whole change exists to stop relying on. **V3 forbids it at the
driver.** `program()` already models the shape; the free-row door does not, and V3 says
it must, without prescribing which flag or which error type carries it.

## 5. The premise — VETTED GROUND, do not re-litigate

**A settlement performed at replacement time cannot see LESS evidence than the 3 s
deadline would have.** Attacked directly by the antagonist and held, more strongly than
PRIMARY throughout:

- `MonitorDriver.program`'s body is `programInFlight = "program()"` then one
  `try { … } finally { programInFlight = false; }`. **There is no `catch`.** Inside the
  `try`: the `raw` snapshot, `await sendPrepare()`, `await waitForPrepareSettle(…)`,
  `await sendSequence(…)`, `await verifyArmed(p)`, then the whole replacement block,
  then `activeRun = { … }`, then `log.record("armed", …)`, then `emit({ kind: "armed" })`.
  No `await`, `.then` or `yield` after `verifyArmed`. **No error path reaches the
  assignment at all** — every throw unwinds through `finally` and out.
- `MonitorDriver.beginFreeRow` assigns `activeRun` as the first statement past its
  `runIsOpen()` guard, with no await before it.
- Both scheduled callbacks self-void on `activeRun !== run`.
- `activeRun` is assigned at exactly two sites and never nulled (88-occurrence census).
- BLE notifications arrive as transport callbacks; nothing can interleave a synchronous
  block.

**What it does NOT prove:** that the drained verdict is CORRECT — that is carried by
`recordAvgPaceVerdict`'s guards and by C1's placement rule (§9).

**The one module input.** `recordAvgPaceVerdict` reads exactly two things outside its
`run` argument: `lastWorkStateAverageSplit` and `AVG_PACE_VERDICT_BAND_SECONDS`. The
first is a module variable, written only from the 0x0032 merge callback under a WORK
`workoutState`. This strengthens the premise: the deadline is exposed to it for the full
3 s where a door settlement is exposed only for the replacement block. **Exposed strictly
less.** (INFERENCE from the PRIMARY reads above.)

## 6. Reachability — and its DATE

### 6.1 The live half needs no reachability argument

`emit` is `for (const cb of listeners) cb(e)` with no isolation, and
`emit({ kind: "armed" })` is the **last statement inside `program()`'s own `try`**,
immediately above the `finally`, three lines below `activeRun = { … }`. So after
`await verifyArmed(p)` has confirmed the erg holds the workout, a throwing listener
rejects `driver.program(p)`. `useMonitorSession`'s catch calls `mapProgramFailure(err)`,
closes the still-open record as `program-failed`, and moves `phase` to `"failed"`.
**Supported path, one production subscriber, no fault injection.** (See §14 for what
this is NOT: a confirmed field defect.)

### 6.2 The latent half — neither door has a supported producer, and the guards have dates

`driver.program(` and `driver.beginFreeRow(` have exactly one non-test caller apiece,
both in `useMonitorSession.ts`. There is exactly ONE production subscriber to
`driver.events(`.

**The free-row door** — the hook's `beginFreeRow` returns on
`phase === "programming" | "ready" | "live" | "ended"`, and a closed run means the hook
already moved `phase` to `"ended"`. `JustRow.tsx` adds an independent `armedThisStart`
latch whose comment reads _"Once Ended, the observer NEVER re-opens on frames … a new
row requires a new user action."_

**The programming door** — `session.program(...)` has one caller,
`ConnectedInterstitial.tsx`'s effect, gated `session.phase === "pairing"`.
`phase: "pairing"` is written at exactly one line, inside `connect()`, which opens
`if (connectingRef.current || driverRef.current !== null) return;` — and the driver is
minted BELOW that guard. **So `driver.program()` always runs against a freshly minted
driver whose `activeRun` is `null`.** The hook concedes it verbatim: _"latent today,
since no UI path re-programs from ready, but one line closes it for whoever adds that
path."_

**No route out of `ended` short of unmount.** `grep -n 'phase: "idle"'` returns ONE hit
(the initial state). `cancel()` returns early on `ended`. Unmount → `teardown()` →
`driver.disconnect()` → `drainSummaryReconcile()`: the run IS settled today.

**AND THE GUARD HAS A DATE — this is the justification, not the falsity of the
comments.** `git blame` on the `ended` clause: **`8c8fe05e`, 2026-09-01, "JustRow PR 2:
the free row, wire to log (#259)"**. James gave the RC-13 order on **2026-08-31 — one
day earlier**. And the clause's own comment says why it exists:

> _"It was NOT here at first, and the e2e flow found the consequence: after the end,
> `deriveProgram("ended")` reads "none" and the link reads "up", so a caller arming on
> those axes re-armed the instant the row ended, re-seeded the identity over a closed
> record, and the next frame opened a second session."_

So: **his order was correct when he gave it**; the product had been observed doing this;
and a different phase closed the door the next day as a side effect. The neighbourhood
moved again on 2026-09-09 (Phase RN, #381, changed when the single `beginFreeRow` caller
fires). **A guard added last week, reactively, after the product was seen doing the
thing, is not the same evidence as an invariant that has held for a year** — and the
difference costs one `git blame`.

### 6.3 The doors, and the check that there is no third

```
grep -nE "(^|[^.=!<>])activeRun[[:space:]]*=[^=]" app/src/monitor/driver.ts
6606:      activeRun = {   ← beginFreeRow
6868:        activeRun = { ← program
```

The other way a run stops being the driver's concern was CHECKED, not assumed: `fail()`
and `teardown()` both reach `driver.disconnect()` → `drainSummaryReconcile()`, and
`t.onDisconnect` drains too. **No third door is owed.**

| Door | Today, `pendingSummaryReconcile` | Today, `pendingTerminateObservations` |
| --- | --- | --- |
| `program()` | cancel, no reconcile, no verdict — and it NULLS the slot, so every later `drainSummaryReconcile()` skips at its own non-null guard | cancel; the emit is dropped |
| `beginFreeRow()` | **nothing at all** — the slot keeps a live canceller for a timer that will fire, see `activeRun !== run`, and return | **nothing at all** — the 200 ms timer fires, takes its `activeRun !== run` branch, nulls the slot and drops the emit |

## 7. `beginFreeRow` IS IN SCOPE — RF34, as correctness

1. **RF34, and that is sufficient.** V2 governs every door that replaces a run.
   Applying it to one of two, in a change whose content is that invariant, is exactly
   the half-application RF34 forbids.
2. **One call at each door.** `drainSummaryReconcile()` already performs the whole
   settlement (`flushTerminateObservations()` first, then cancel-null-reconcile-verdict
   behind its own non-null guard), so four cancel lines at one door and nothing at the
   other collapse into one call at each.

**FALSE, and recorded so it is not re-derived:** that the free-row door "is independently reachable and loses
DATA". Reachable in the driver's API surface; NOT in the product (§6.2).

**Recorded because it will come up at review:** a cross-run reconcile is constructible at
the API surface today — natural finish arms the deadline, `beginFreeRow()` replaces the
run leaving the slot non-null, a later `drainSummaryReconcile()` cancels the OLD timer
then runs `reconcileSummary`/`recordAvgPaceVerdict` against the NEW free-row run. Traced
hop by hop: it lands SAFE (empty `program.intervals` → `lastIndex < 0`, then suppression
at `!run.recordedActuals.has(-1)`), producing a nonsense "index -1" ring line, not a
wrong number. A soundness hole that currently happens to land safe.

## 8. The two comments — NAME THE LAYER

Both sentences exist verbatim; both are false **in their stated reason**; neither is
false **in its conclusion**. "Closing the door makes both sentences true again"
is withdrawn — it restates a call-graph argument the next caller invalidates again.

| Comment | Its reason | Its conclusion |
| --- | --- | --- |
| `noteTerminateObservations`'s `activeRun !== run` branch: _"`program()` already cancels this timer before it swaps `activeRun`, and nothing else in this driver ever reassigns that variable, so this branch is UNREACHABLE today and is uncovered on purpose."_ | **FALSE** — `beginFreeRow` reassigns it | **HOLDS**, held up by hook guards the comment never names |
| `drainSummaryReconcile`: a pending deadline _"can only name the CURRENT `activeRun`, closed and non-null"_, supported by _"`armSummaryReconcile` is armed from exactly one call site"_ | **FALSE twice** — `beginFreeRow` does not cancel the slot, and `grep -n "armSummaryReconcile("` returns THREE call sites | **HOLDS**, same layer |

**Requirement:** each corrected comment names **which layer holds the invariant, that
there are now two independent holders** — the driver's own settlement and the hook's
`ended`/`pairing` guards — **and the DATE the hook's holder landed** (#259, 2026-09-01),
so the next reader can weigh it. Where a branch stays uncovered, the comment says which
holder makes it so.

## 9. Constraint C1 — placement: the settlement goes ABOVE the per-run reset block

`program()`'s replacement block resets ~10 per-run fields before it cancels the timers,
and `lastWorkStateAverageSplit = null` sits ~25 lines above the cancel. A settlement AT
the cancel site therefore runs `recordAvgPaceVerdict` with that variable already `null`,
takes the function's FIRST guard, and writes

> `suppressed — no work-state (0x0032) averageSplit observed this run`

— a FALSE reason for a run that did observe one. **Requirement: the outgoing run is
settled before ANY per-run reset in the replacement block runs.** A placement invariant,
not a line number; any future reset inherits it. At the free-row door there is no reset
block today, so it reduces to "before the `activeRun` assignment".

This is why a kind-only assertion is useless here (M2).

## 10. Copy that becomes untrue

Two `summary-reconciled` details assert the grace's own clock:

- `split-won — interval N was already recorded when the 3000ms finish grace closed…`
- `declined — interval N is still missing and no 0x0039 arrived inside the 3000ms finish grace; nothing filed…`

`grep -n 'FINISH_GRACE_MS}ms' app/src/monitor/driver.ts` returns three hits; the third is
inside **`describeClosedGrace`** — *not* `finishGraceRefusalReason`, a symbol that does not exist and was
which **does not exist**. That third string is a different kind and stays true.

**Both sentences are ALREADY untrue on the existing drain paths** (`disconnect()`,
`reconcile()`, `onDisconnect`). This change widens the debt by two doors; it did not
create it.

**Requirement, as an invariant:** every `summary-reconciled` detail states the RELEASE
CAUSE of the reconcile — the grace expiring on its own clock, or an early settlement and
which door caused it — rather than asserting the 3000 ms window closed. A named release
cause also makes details vary per door, defeating `eventLog.record`'s coalescing.

## 11. The gate

### 11.1 Two different reachability claims, gated differently

**Do not collapse these into one sentence** (RF26).

- **V1 (containment) — SUPPORTED PATH.** Its gate exercises the ordinary programmed
  path with a listener that throws. No fault injection into the ordering; the only
  injected thing is the throw itself, which is what the invariant is about.
- **V2 (the drain) and V3 (re-entrancy) — FAULT INJECTION at the driver's public API.**
  No component produces the ordering; the hook's callers cannot; and `ROADMAP.md`'s
  RC-13 row records that no committed capture re-arms inside 3 s (closest pieces 148.1 s
  apart — quoted, not re-derived). **Proves:** given a run replaced inside its window,
  the driver settles and files. **Cannot prove:** that the condition is reachable, how
  often, or anything about hardware.

### 11.2 The five-part proof contract (RF26)

1. **Production invariants.** V1, V2, V3 (§4), plus I1/I2 and C1.
2. **Producer and ordering.** §11.1 — one supported, two injected. Legs:
   - **(v1) the live site.** Drive the driver's ordinary `program()` to success with a
     registered listener that throws on `{ kind: "armed" }`; assert `program()` RESOLVES
     and a ring entry names the contained delivery.
   - **(a) real numbers, free-row door.** `avgPaceVerdict.replay.test.ts` already replays
     `docs/monitor/sessions/walk-2026-08-16/session-2-wu-4unequal.jsonl` and, per its own
     header, leaves the run CLOSED with the deadline PENDING (the trailing `disconnect`
     fires no `onDisconnect`; only `link-drop` does). Substituting `beginFreeRow()` for its
     `driver.reconcile()` exercises V2 against the capture's own numbers (0x0032 `129.78`,
     five-boundary quotient `129.7720`, delta `0.008 s`, verdict "agree").
   - **(b) both doors, stub transport.** `driver.test.ts`'s harness carries the committed
     `programViaStub` → `WORKOUTSTATE_WORKOUTEND` → `programViaStub` test, with file-wide
     `vi.useFakeTimers()` so the deadline never fires on its own. Needs a work-state 0x0032
     with a non-zero `averageSplit` and a boundary so the verdict is computable.
   - **(c) hook-level — DROPPED as a requirement.** It reads as "not optional" under
     RF24. RF24's obligation is that one test starts upstream of a PRODUCER; for V2 there
     is none, so calling the hook's `program()` from `ended` proves the consequence of a
     condition nothing creates. The one thing it would have settled is carried as an open
     INFERENCE (§13 row 6).
   - **RF41 note:** these legs assert about a CLOSED run, so the streaming-fixture trap does
     not bite; any assertion added about the state before a run opens inherits it.
3. **Independent observable.** The `avg-pace-verdict` ring entry's DETAIL; the
   `summary-observations` event; for V1, `program()`'s own resolution plus the contained-
   delivery ring entry. Never "an entry of kind X exists".
4. **Deciding-source mutations.** Six. All run against the FIXED code, all committed
   before the probe (RF22), each anchored on a grep-confirmed UNIQUE string.
   - **M4 is the load-bearing probe of this PR** and is listed first for that reason.
     **Mutation: remove the per-listener isolation from `emit`, restoring the bare
     `for (const cb of listeners) cb(e)`.** Expected failure: leg (v1) goes RED with
     `driver.program(p)` REJECTING — the arm reported as failed after `verifyArmed`
     confirmed the erg holds the workout. **It must bite at the already-live
     `emit({ kind: "armed" })` inside `program()`'s `try`, not only at the new settlement
     sites** — a mutation that only proves the new containment works leaves the live hazard
     ungated, which is RF34 inside the RF34 spec. State in the report which emit site the
     failing assertion reached.
   - **M5 — re-enter `beginFreeRow()` from the throwing listener during a replacement.**
     Expected: V3's refusal, visible in the ring; `activeRun` still names the run the door
     opened, not the re-entrant one.
   - **M1 — delete the settlement at the door under test.** Expected: the outgoing run's
     `avg-pace-verdict` entry DISAPPEARS. Bites by construction — no settlement runs at
     either door today. **RF21 hazard:** `eventLog.record()` coalesces a CONSECUTIVE entry
     with identical `kind` AND `detail` without advancing `seq`, so a constant marker is
     unreliable; the assertion pins the detail's numbers, and §10's release-cause wording
     keeps per-door details distinct.
   - **M1' — the pinned numbers are INDEPENDENT LITERALS.** The verdict detail interpolates
     `AVG_PACE_VERDICT_BAND_SECONDS` (`band ${…toFixed(1)}s`); per RF21's corollary the
     expected string is written out (`129.78`, `129.77`, `0.01`, `1.0`), never built from
     the imported symbol. Probe: retune the constant and confirm the test goes RED rather
     than retuning with it.
   - **M2 — move the settlement BELOW `lastWorkStateAverageSplit = null`.** Expected: the
     entry is still present, kind unchanged, detail becomes `suppressed — no work-state
     (0x0032) averageSplit observed this run`. Invisible to any kind-only assertion, which
     is why C1 needs its own detail assertion.
   - **M3 — restore the bare `cancel()` on the terminate slot.** Expected: the outgoing
     run's `summary-observations` event disappears. The RF34-twin probe.
   - **RF26/RF35 rule for all six:** for each mutation that passes first time, NAME the case
     in the suite where it could have gone red. If none exists, that is a hole in the tests
     and the report says so rather than promoting the silence into a property of the design.
5. **Strongest conclusion permitted.** May say: _"A listener that throws while receiving a
   driver event no longer fails the operation that emitted it — including the `armed`
   announcement inside `program()`'s own `try`, where a throw previously reported a verified
   arm as a failure. Separately, at the driver's API, a run replaced inside its finish grace
   or hash sub-window is settled and filed before the new run opens, at both doors; no
   product path produces that ordering today, and three guards above the driver prevent it —
   one of them added on 2026-09-01, a day after this order was given."_ May NOT say the
   replacement ordering is reachable, corpus-supported or hardware-verified; may NOT say a
   subscriber has been observed throwing in production (§14).

### 11.3 Scoped gates

`app/src/` is touched: `pnpm lint` · `typecheck` · `format:check` ·
`test --project unit --project client` · the named e2e specs locally against a booted
stack, then the full e2e job read on the PR (RF1). Per-file coverage for `driver.ts` from
the HTML report under `app/coverage/`, not the text reporter. **`emit` is on every driver
event path, so the e2e obligation here is not a formality** — the isolation change is
exercised by every connected spec.

## 12. Design gate: NONE OWED

No component file is touched, no screen changes, and no saved row renders a different
figure on any product path. The strings that change are monitor-log ring details, a
diagnostics surface, and the standing no-screenshots-for-copy ruling covers wording-only
diffs. **No Gate 0.** §1 and §11.3 agree.

## 13. Register rows this PR lands (PM conditions 3, 4, 5)

Every row below is written in `ROADMAP.md` **in this PR**, not mentioned in the PR body —
RF14 is countable, and five times in six PM gates a real finding lived only in a Record
block and had to be rescued at the gate.

| # | Row | What it must say |
| --- | --- | --- |
| 1 | **RC-13, REWRITTEN** | Its current opening — _"The avg-pace verdict zero-fires on a rapid re-arm"_ — is the framing the antagonist falsified, and the row itself records **two agents misreading it as already fixed in one session**. The rewrite states: no supported producer at either door; the guard that holds it and the DATE it landed (#259, 2026-09-01, one day after the order); what this change replaced it with; and that the live half was the containment. |
| 2 | **RC-14, UPDATED in the same commit** | What Shape A now supplies (per-listener isolation, so a throw inside a subscriber is contained and recorded) and what RC-14 **still owes**: the bracketing record at the call site BEFORE `reconcileSummary(...)`, and a discriminator in every constant detail string. **This PR does NOT discharge James's "INSTRUMENT it" order** and the row must not read as though it does. |
| 3 | `beginFreeRow()` has no per-run reset block at all — `program()` resets ~10 fields (`boundaryHalves`, `session`, `refusedKeysLogged`, `clampedKeysLogged`, `splitAvgPaceProvenanceIndex`, `lastEmittedTotals`, `lastLoggedTwd`, `lastWorkStateAverageSplit`, `summarySeen`, `armedWatch*`), the free-row door none. Harmless today only because a free row's empty `program.intervals` suppresses the verdict every time. **Whoever adds a reset block there must place it BELOW the settlement or re-introduce C1's exact bug.** |
| 4 | `drainSummaryReconcile` has no identity guard, unlike both scheduled callbacks. This change makes its stated precondition true by emptying the slot at every door; binding the run into the slot would make the guard structural rather than argued. |
| 5 | `run-replaced` is dead code from the product's side — `driver.test.ts` covers it, nothing produces it. Same reachability fact as §6.2. |
| 6 | **OPEN INFERENCE:** whether a door settlement's `summary-observations` write lands on the OUTGOING record. `applyProducerCommit` keys on `next.startedAt` and a revision ref rather than `identityRef`, and the hook's handler writes to `runRef.current`, which the hook does not touch before `await driver.program(p)` — so it probably would. **Unsettled on purpose:** the only ordering that exercises it is unreachable. Whoever adds a UI path that re-programs from `ready` inherits this question. |
| 7 | `HASH_SUBWINDOW_MS = 200` is SHORTER than the ~270–310 ms 0x0039→0x003F gap measured on the captures, which is why the "emit anyway" fall-through exists. RC-13 does not change it and must not be read as validating it. |

Two of §14's items are deliberately NOT filed as register rows, and this is the
one place I part company with condition 5 — said openly rather than dropped silently:

- **The falsified-premise lesson** ("walk UP from a driver method to its production call
  site, to that caller's guard, to the component, and stop only at a user gesture; date the
  guard") belongs in **`.claude/agents/antagonist-ledger.md`**, whose ready-to-paste entry
  the antagonist returned, plus the PM's own ledger entry. It is a technique, not work; a
  ROADMAP row for it would never be closed by anyone.
- **The e2e/native re-arm audit** — SETTLED THIS SESSION rather than filed. Counted per
  test block: **no e2e test arms a driver twice** (`connected.spec.ts` 12
  `injectFakeMonitor` calls, `justrow.spec.ts` 2, `screenshots.spec.ts` 3,
  `design.spec.ts` 1, `diagnostics.spec.ts` 1 — zero blocks with more than one). Native
  shares the same hook and the same two component call sites, so §6.2's three guards apply
  identically; not separately audited, and a hit would only strengthen the case.

## 14. Stated limits — carried, not resolved by assertion

Three things the PM gate could not establish. They stay unresolved and **the PR body may
not upgrade any of them.**

1. **Whether a subscriber has ever actually thrown in production.** RC-14's narrowing makes
   it the leading candidate for the observed silent zero, but that row says **"survivor",
   not "cause"**. So §6.1 is a *live hazard on a supported path* — PROVEN — and **not a
   confirmed field defect** — UNPROVEN.
2. **Whether the hook's subscriber can throw in practice.** `emit` and the call site were
   read; the subscriber's whole body was not. INFERENCE: a synchronous React state-update
   handler of that size has throwing paths. Not measured.
3. **Whether any native harness re-arms a driver.** The e2e half is settled (§13); native is
   not separately audited.

## 15. Tasks and sizes

**~1.35–1.75 half-days of implementer budget.** The PM accepted 1.5–2 and rejected
its itemisation on one point: the PM's own final gate is not the implementer's work and
comes out of their budget. **The flip does NOT change the total** — it is the same work
reordered, with containment promoted from task 3 to task 1 and its cost unchanged at
0.5 hd.

| # | Task | Size | Notes |
| --- | --- | --- | --- |
| 1 | **Shape A: per-listener isolation inside `emit`, its ring entry, leg (v1), M4 biting at the live `:6887` site** | 0.5 hd | The head of the PR. M4 is its load-bearing probe |
| 2 | V3: refuse a re-entrant open/replace at the driver, + M5 | 0.2 hd | Invariant already stated (§4.1); this is the code for it |
| 3 | Failing tests first for V2: leg (b) at both doors, detail pinned with independent literals | 0.4 hd | Harness has everything but the work-state 0x0032 frame |
| 4 | The settlement at both doors, above the reset block | 0.2 hd | Four cancel lines collapse to one call each |
| 5 | Leg (a): the capture replay through `beginFreeRow()` | 0.2 hd | Watch the unhandled p.80 send rejection |
| 6 | Comments (§8, naming the layer AND the date), release-cause strings, comment sweep | 0.25 hd | RF18/RF9/RF37 |
| 7 | The seven register rows (§13), including the RC-13 rewrite and the RC-14 update | 0.15 hd | Conditions 3–5; `ROADMAP.md` is Prettier-free, wrap by hand |
| 8 | Mutations M1/M1'/M2/M3, committed-then-probed, each written up | 0.2 hd | RF21/RF22/RF35 |

One PR; the triad exception to the grouping rule applies. **PR body, above the fold:** the
containment fix and what a rower would have seen; that no rower can reach either door and
the date of the guard that closed it; tester impact none; release not needed on this alone;
and the RC-14 row's update saying this does not discharge that order.
