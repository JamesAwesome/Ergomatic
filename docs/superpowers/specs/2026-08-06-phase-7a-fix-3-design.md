# Phase 7A-fix-3 — program over a live piece

**Date:** 2026-08-06
**Status:** Revised after adversarial review (same day); awaiting James's
review of the revision. Prior approvals: settle + readback, both; fix-3
before 7B implementation.

## Why this exists

Hardware session 3 (§18 session 3) found and reproduced the merge-gate
row's one defect: **programming over a RUNNING workout arms an empty
workout** — the send acks clean, `verifyArmed` passes, the monitor shows
`:00`, and rowing past the first interval's length produces no boundary.
Reproduced twice with unrelated shapes after a seven-probe bisect cleared
every shape variable; the condition is machine state (§19's newest entry
— REAL PM5 BEHAVIOUR, UNDOCUMENTED). Both empty arms passed `verifyArmed`
— §17 item 12's structural upgrade, twice-justified. Item 15's captured
byte also proved the idle-terminate "refusal" never existed.

**What the adversarial review changed (2026-08-06):** the original draft
assumed item 12 might be answerable from archived logs and that the
readback was "plumbing". Both false: NO 0x0031 payload has ever been
recorded anywhere (the log's `notify-first` carries a byte count, not
hex — deliberate flood protection, `driver.ts` ~773; and `toMonitorFrame`
DROPS `workoutType`/`workoutDurationRaw`/`workoutDurationType` before
any log or event — §17 item 12's own stated method has never been
executable). Also: the two scratchpad "session logs" are byte-identical
prefixes of one capture — there is one archive, not two. The phase is
therefore **two-staged around a hardware reading that today's build
cannot even take.**

## Decisions

| Question | Decision |
|---|---|
| Remedy shape | Both: settle (prevention) + readback (detection). Unchanged. |
| Sequencing | Fix-3 before 7B implementation. Unchanged. |
| Staging | **Two stages, two short erg visits.** Stage 1 ships the instrumentation, the settle, and the fake prerequisites; session 4a takes the readings; Stage 2 builds the readback FROM the readings; session 4b validates detection on hardware with the settle disabled. |
| Item 12's outcome space | **Ternary, per shape** (see §1) — the tripwire fires on "doesn't echo", "doesn't refresh until rowing", OR variation across shapes that defeats a stable comparison. |
| Retries | None. Unchanged. |

## Design

### Stage 1 — instrumentation, prevention, and the fake's honesty

**1a. The structure log.** Extend the driver's logging so 0x0031's three
structure fields become capturable: a `structure` log entry recording
`workoutType`/`workoutDurationRaw`/`workoutDurationType` **on change**
(not per tick — the 0x0031 flood is why the raw-hex branch excludes it),
plus the raw 19-byte hex in that same entry. This is the prerequisite
for everything: item 12's reading, the empty arm's own bytes, and the
eventual readback's evidence trail. Correct §17 item 12's method text,
which currently instructs reading fields from `frame` entries that have
never carried them.

**1b. The settle — end-state pinned by the traces, not deferred.** In
`program()`'s prepare path, when the prepare's terminate fired while the
machine state was `rowing`/`resting`: wait for the machine to report
**`armed` (WaitToBegin — the auto-cycle's documented terminus) and then
one further tick**, before sending programming frames. `terminated` and
`idle` are NOT settled states — the session-3 traces show the cycle
passing through both (REPRO: rowing → terminated ×2 → idle → armed,
~0.85s; step 5: terminated → idle → armed inside 0.06s of PM clock).
Budget: the observed dispatch-to-armed spans were 4 and 5 status ticks,
so the wait's own bound is **10 ticks** (not the 3-tick `settleTicks`
default, which both observations exceed — and note this wait is
state-KEYED, a different mechanism from the state-blind `settleTicks`
counter; it gets its own name, `prepareSettleTicks`, its own option, and
its own pendingSettle slot — the existing slot's disconnect-resolves
comment is only true for `terminate()`'s use). On expiry without an
`armed` tick (a 2Hz sampler CAN coalesce the cycle — step 5's idle and
armed shared one elapsed reading): **proceed and let Stage 2's readback
catch any empty arm**; log `prepare-settle-expired` so the trace shows
the gamble. Common-path latency unchanged: the wait only arms when the
prior state was rowing/resting.

**1c. The fake's prerequisite — the prepare gets its machine reaction.**
Today the fake's `onClearingFrameComplete` acks and changes NOTHING —
no state transition, no status delivery — while hardware visibly runs
terminate → idle → armed off the same wire command (both empty arms and
every clean mid-session arm). Fix: the prepare synthesizes and delivers
the terminate transition exactly as `onArmedFrameComplete` does (cited
to §18 session 3), followed by the auto-cycle to `armed` across
subsequent ticks. THEN the empty arm is modelled honestly, keyed on
machine state: **programming frames that arrive while the fake's state
is still `rowing`/`resting` arm EMPTY** (armed, structure zeroed, no
boundaries ever). With that model, the settle test passes BECAUSE the
settle works (the fake reaches `armed` before frames go out), not
because a script or a tick-count agrees with the fix.

**1d. Item 15's obligations — the refusal moves, not vanishes.** The
fake's idle-terminate refusal is WITHDRAWN as default behaviour (the
captured byte says accepted), but per ROADMAP's own line it moves to an
explicit synthetic hook (a prepare-scoped sibling of
`failNextProgramFrame`, e.g. `refuseNextPrepare: true`, marked
never-observed) — because it is the ONLY way to exercise the prepare
swallow rule, which stays. The swallow tests re-point at the hook. Note
the blast radius honestly: the refusal is currently the default path for
every clean-state `program()` in the driver suite; the commit states
that they all now take the accepted-prepare path. `sendPrepare`'s
comments stop calling rejection "expected" (never-observed, §18 s3 item
15).

### Session 4a — the readings (James-operated, ~5 min, one short row)

With Stage 1 on the erg:

1. **Item 12, per shape:** arm from main menu, read the `structure` log
   entries while armed — for a TIME program (`program-two-time`), a
   DISTANCE program (`program-short`), and a rest-0 program
   (`program-no-rest`). Per shape, record: does `workoutType` echo (and
   is it ONE ordinal across shapes, or does the PM normalise — the SDK
   enum has four adjacent interval types and nothing proves it echoes
   the 8 we send)? Does `workoutDurationRaw` reflect interval 0, in
   what unit (the read-side distance scale is UNDOCUMENTED — §10's own
   row; read/write symmetry has burned this project three named times)?
   Does it refresh while merely armed, or only once rowing?
2. **The empty arm's own bytes:** driver constructed with the settle
   disabled (`prepareSettleTicks: 0`), row ~20m into a piece, program
   over it → capture the `:00` arm's `structure` entry. ("Duration
   reads 0" is today a hypothesis inferred from a photograph — this
   reading tests it.)
3. **Settle validation:** same repro with the settle ON → expect a
   structured arm (monitor shows the real workout).

**Outcome space (ternary, the tripwire):** (a) fields echo interval 0
stably per shape → Stage 2 builds the comparison as designed; (b) fields
echo something stable but different (a total, the last interval, a
normalised type) → the comparison target changes; controller may
adjudicate if the mapping is unambiguous, James rules otherwise;
(c) fields don't echo, don't refresh until rowing, or vary
unexplainably across shapes → STOP, redesign to James (the pull-path
GET, §17 item 14, is the fallback avenue — out of scope).
Also captured for free: 0x0033's `intervalCount` per shape (already
decoded; its base is ambiguous per §15 #1, but it is the one field that
could distinguish "25 intervals landed" from "1" — recorded as a
candidate second signal for Stage 2, not a commitment).

### Stage 2 — the readback (built FROM 4a's readings)

`verifyArmed`'s resolution requires, on fresh post-send ticks:
`state === "armed"` AND the structure fields matching the program per
4a's confirmed semantics (duration against interval 0 in the confirmed
unit; the type check ONLY if 4a shows one stable ordinal across shapes,
otherwise dropped — duration alone catches the observed class).

- **Early rejection, bounded both ends:** the observed clean arms show
  the 0x0031 payload lagging the armed state by ≥1 tick (two of five
  clean arms resolved on a tick still carrying the PREVIOUS program's
  payload), so single-tick mismatch must NOT reject. The observed empty
  arms show a rock-stable mismatch (100+ identical frames). Rule:
  reject after **N consecutive stable mismatched armed ticks, N=3**
  (> the observed 1-tick lag, << the outer bound), with `verifyTicks`
  retained as the outer bound. Reason: `"structure-mismatch"`, detail
  carrying observed-vs-expected, one log entry when the first mismatch
  is seen.
- **The unbounded-verify hole closes:** `verifyTicks` today is optional
  and unset means wait-forever; under a structure predicate that would
  turn a silent wrong success into an infinite hang. The readback
  REQUIRES a bound: `verifyTicks` gains a default (20, the lab's
  value) instead of "unbounded when omitted". Recorded as a
  `DriverOptions` semantics change; 7B inherits a safe default.
- The exit criterion on latency is scoped honestly: the SETTLE adds
  nothing to settled-state programs (pinned by test); the READBACK may
  add ~1 tick on hardware where the payload lags (observed 2-of-5) —
  accepted, stated, not pinned-away.
- The fake's status stream carries its loaded program's structure
  (extending the existing statusFrames builders; the fake echoes the
  ACCEPTED program — `script.program` remains only the pre-loaded
  fallback for scripts that never call program(), and an un-programmed
  fake emits zeroed structure, exactly the empty-arm shape).

### Session 4b — the merge-gate row (~3 min)

1. The repro with everything ON: row ~20m in, program over it →
   expected: clean structured arm (settle), monitor shows the real
   workout, one short row confirms the first boundary.
2. **The detection row (the honesty fix):** driver with
   `prepareSettleTicks: 0` — the repro again → expected: **typed
   `structure-mismatch`**, never a silent `:00`. This is the step that
   makes the load-bearing half hardware-validated instead of CI-only.
3. Expected-vs-observed to §18 session 4; disagreement is a finding.
   Merge on green + this row + James's explicit approval.

## Testing

Unchanged bar — every behaviour fails first. At minimum: the fake's
prepare now delivers the terminate transition (fails today: no state
change); program-over-running-fake arms EMPTY without the settle and
STRUCTURED with it (both fail today); the scripted/un-programmed empty
arm → `"structure-mismatch"` dying on an ASSERTION not a timeout (fails
today: resolves); single-tick payload lag does NOT reject (the 2-of-5
clean-arm shape, fails against a naive first-tick rule); N=3 stable
mismatches reject early, well inside the outer bound; `verifyTicks`
omitted now defaults bounded (fails today: hangs); settled-state
programs gain zero settle ticks (latency pin, settle-scoped);
`refuseNextPrepare` exercises the swallow rule (the refusal-removal's
replacement trigger); the structure log records on change only (a
10-tick same-structure burst yields one entry). Mutations: disable the
settle → the prevention test dies; disable the structure predicate →
the empty-arm test dies; drop the N-consecutive guard → the lag test
dies; re-default the fake's refusal → its hook test dies.

## Out of scope

P3b (7B's spec); the pull-path GETs (item 14 — the fallback avenue if
4a's tripwire fires); retry policies; full multi-interval structural
verification (0x0031 cannot express it; `intervalCount` is recorded as
a 4a-captured candidate, not built); 7B's screens.

## Exit criteria

- The structure log exists; §17 item 12's method text is executable for
  the first time; the readings are in §18 session 4 with raw hex.
- Item 12 answered per shape (or the tripwire fired and the redesign
  went to James with 4a's data attached).
- `program()` over a running piece arms with verified structure (settle
  ON) and rejects `"structure-mismatch"` (settle OFF, session 4b step
  2) — the silent empty arm is impossible in CI and DISPROVEN on
  hardware in both directions.
- `verifyTicks` is bounded by default; the N-consecutive rule is pinned
  against the observed payload lag.
- The fake's prepare behaves like the machine's; the empty arm is
  state-keyed; the refusal lives only behind `refuseNextPrepare`.
- §18 session 4 recorded; §17 items 12/15 dispositioned; ROADMAP's
  fix-3 checklist closed; green + the row + James's explicit approval.
