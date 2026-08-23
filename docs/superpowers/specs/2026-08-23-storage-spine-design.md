# The storage spine — the burst is the machine's finish, and work and rest come apart

**What and why, in plain words.** The PM5 announces its own finish: at
log commit it sends the final interval's data, the work-only summary
(0x0039), and the verification hash (0x003F), and jumps its state to
WORKOUTLOGGED — the 2026-08-23 walk captured the whole burst. We miss it
today for TWO reasons, not one: when the burst beats our own terminal
transition (3 of 5 committed finishes), **our gate discards a summary the
link delivered perfectly** (`graceIsOpen` refuses summaries before the
run closes); when our terminal wins the race, we hang up 21–107 ms later,
inside the burst's ~310 ms window. This spec accepts the burst on BOTH
sides of that race, stores work and rest as the separate quantities
Concept2 actually keeps, corrects the fake's lies about exactly these
fields, and adds a continuity bound that catches what F2a traded away.
TRIAD twice (a stored shape; what a record contains and when the guard
closes one) — full treatment. One spec, three PRs (James: "One spec,
phased PRs"; revised design after the antagonist pass killed the
original window mechanism, approved "Yes" 2026-08-23).

## 1. Research record

- **PRIMARY (walk 2026-08-23 keystone, re-decoded at the antagonist
  pass):** burst ordering on that finish — 0x0037 at t=171859.9, 0x0039
  at 172129.5, 0x003F at 172167.7, and OUR terminal transition at
  172309.3 (state 5→12 directly; **state 10 never appears in the
  capture**). The burst preceded our terminal by 142–449 ms and the
  0x0039 was received link-up and discarded by the gate
  (`driver.ts:2522`; the session-c shape `driver.ts:2293-2302` already
  documents). Across all five committed natural finishes the
  split-vs-terminal order goes BOTH ways (3 of 5 burst-first): **it is a
  race, and any design must serve both sides.**
- **PRIMARY (all five committed finishes):** the final interval's 0x0037
  arrived before disconnect every time — the synthesized-final-interval
  path has NEVER fired at a real erg. The burst's value is NOT "replacing
  synthesis": it is 0x0039's work-only totals, 0x003F's bytes, state 12,
  and robustness on the race's late side.
- **PRIMARY (measured):** production disconnect 21.7/24.1/30.6/107.3 ms
  after the terminal 0x0031 — the late-side loss mechanism.
- **Terminate: UNKNOWN, not "no burst".** Ring-3's teardown stashed the
  ring at our terminal — deaf by construction, the same shape that hid
  0x0039 for five walks. The walk card gets the properly-instrumented
  ask; until answered, terminate keeps today's synthesis and this spec
  claims nothing about it.
- **PRIMARY (code):** 0x0037's `intervalRestTimeSeconds` (offset 12) and
  `splitIntervalType` (offset 16) are decoded (`parse.ts:236,238`) and
  dropped. `IntervalActual` carries `restDistanceMeters` but not rest
  time/type. **0x0031 carries NO interval number** (all 19 bytes
  decoded; only an `intervalType` enum) — the machine's count is
  0x0033's, base-ambiguous (`interface-notes.md` §15 #1), and consumers
  see it only through `toProgramIndex`'s clamped/nullable output. The
  rings do not carry it at all.
- **Caveat carried verbatim (ROADMAP RC-1):** whether 0x0037's rest time
  is a measurement or a readback of the programmed rest is NOT
  established (every committed value equals the programmed rest). Stored
  as the machine's rest field, never sold as measured. **And the
  keystone cannot discriminate work-only totals (it is r0)** — the
  work-only pins use the rest-bearing captures (session-2: work 1535 m
  against fused 1599; pyramid: 1300 against 1347), where the two
  definitions actually differ.
- **F5 caveat:** TWD semantics inconsistent on time intervals; no part
  of this spec reads TWD except F2a's existing signature, unchanged.
- **Post-close writers, vetted ground:** `acceptableFinalBoundary` is
  today's ONLY post-close writer. Folding summary observations onto a
  closed record therefore requires a NEW post-close writer — §2 designs
  it explicitly and names its TRIAD weight, rather than pretending close
  semantics are untouched.

## 2. PR 1 — accept the burst, both sides of the race

**Early side (the gate bug — 3 of 5 finishes).** A 0x0039 arriving while
an open run is in its FINAL interval is buffered (`noteSummary`), not
discarded. Two delta-pass corrections shape the consumer:

- **The split-won branch stops discarding.** `reconcileSummary`'s first
  branch (`driver.ts:2983-2987`) — the ONLY branch production has ever
  taken, since the final split arrived before disconnect in 5 of 5
  committed finishes — currently logs the held summary "discarded
  unread". It now consumes the summary FOR OBSERVATIONS (totals + hash)
  even when the split won; `deriveFinalIntervalFromSummary` stays
  no-split-only, so its undiscriminated premise 2 (rest-inclusive vs
  work-only) remains fenced behind a condition that has never occurred
  at a real erg — stated, not assumed cosmetic.
- **Single-interval blindness, stated:** a 1-interval program is always
  in its final interval, so the gate buffers any 0x0039 whenever it
  arrives. A spurious mid-row 0x0039 COULD NOT HAVE BEEN OBSERVED by
  this corpus (every session but one was deaf before one could arrive —
  the B3 evidence shape); buffering is bounded either way (observations
  land only at close, through the guarded writer below).

**Late side (the hangup — 2 of 5).** At a natural-finish terminal where
the burst has NOT yet arrived, teardown defers THREE of its steps to
`BURST_LINGER_MS = 2000` (or earlier, on burst completion): the
synchronous `driver.reconcile()` drain (today STEP 1 — draining at t=0
would consume the deadline before the burst lands, the delta pass's A3),
the unsubscribe, and the disconnect. Everything else (navigation,
closeRecord, wake-lock release) proceeds at t=0 as today. Consequences,
each stated and guarded:

- **A SECOND ring stash runs at linger end** (the `holdOpen.ts` pattern:
  its own ring + injected stash — not a reorder), because STEP 2's
  snapshot at t=0 would otherwise lose every burst-era entry, and that
  stash is the only readout exit 7 has. STEP 2's doc comment is
  rewritten in the same PR.
- **The listener deliberately outlives the unmounted component** for up
  to 2 s — that is how the burst is heard. The post-close doors it can
  reach are guarded: the observation writer (below) re-reads
  `MONITOR_RUN_KEY` and SKIPS if the stored record is gone or is not
  this run (the `clearMonitorRun()` resurrection race —
  `LogSession.tsx:1162/1372/1569`, `Today.tsx:631`); the pre-existing
  `acceptableFinalBoundary` door gets the same re-read guard, since the
  linger widens its window ~20–100×.
- **The wake lock is already released at unmount** and no
  `UIBackgroundModes` exist — the linger is the first mechanism
  expecting delivery after the lock drops. Fine at 2 s in-foreground;
  stated so nobody discovers it.
- **A link death inside the linger ends the LISTENING half early; the
  deferred `disconnect()` still owns the hangup** (the disconnected
  branch cannot issue it — `driverRef` is already null by then).
- `BURST_LINGER_MS = 2000` holds at ~5.0× the modelled worst case
  (398 ms: late-side first element +90.2 ms plus the burst span
  +307.8 ms), structurally bounded at one burst span because our
  terminal cannot precede the machine's own flip. **n = 1 caveat
  carried:** the burst-span offsets come from the only 0x0039/0x003F
  ever captured, on a 2-interval piece.

**0x003F gets a PRODUCTION subscriber (delta-pass B3 — without this,
`verificationBytes` is unobtainable):** the driver's subscribe list
gains `LOGGED_WORKOUT_UUID` in the NON-CRITICAL class (LL's degrade
semantics — absent-on-firmware must not fail a connect), and
`capacitorBle.ts`'s characteristic→service map gains its entry (the
native map has none today; `webBluetooth.ts:118` already does). The
keystone's 0x003F frames came from the dev instrument's subscription —
a replay proves decode, not production reachability; the fake proves
the plumbing.

**The post-close observation writer** — TRIAD-weight, and **PR 1 is
thereby a localStorage stored-shape change, said plainly** (delta C-ii):
it appends two write-once fields, `summaryTotals` (0x0039's work-only
numbers) and `verificationBytes` (0x003F raw), to a record closed by
natural finish. Write-once and identity are enforced ON THE RUN, not
"the session" (delta C-i — `program()` can open a second run in one hook
instance): the writer keys on the record's own `startedAt` identity and
skips if fields exist or identity mismatches. Safety of the shape
change, cited not implied: `isMonitorRun` is a positive conjunction with
no unknown-key check (`monitorRun.ts:290-335`, the file's own comment),
`v` stays 2, no migration, records round-trip both directions. No server
change (delta C-iii, attacked and held: `MonitorRun` never crosses the
wire).

- **Terminate/END paths untouched** (burst status UNKNOWN, §1).
- **Watchdog:** liveness runs through the linger; no banner post-close.
- **RC-7 rides here:** the synthesized-final fallback (never yet fired
  at a real erg; kept as fallback) stops writing
  `restDistanceMeters: 0` and omits instead.
- **Fake support (RC-8's first half):** the fake gains a natural-finish
  burst — final 0x0037/38 then 0x0039/3A/3F, work-only totals from its
  script, BOTH race orderings scriptable (both are real), emitted
  through the existing wrapper-clock machinery (wall-clock-free contract
  intact).

## 3. PR 2 — RC-1: work and rest stored separately (TRIAD: stored shape)

- `IntervalActual` gains `restSeconds?: number` (0x0037 offset 12 — the
  machine's rest field, a readback per §1) and `type?: number` (offset
  16, stored raw; enum unverified). Additive-optional
  (`restDistanceMeters` precedent).
- Session-level: `workSeconds`/`workMeters` and `restSeconds`/
  `restMeters` stored separately, summed from actuals; fused totals
  become DISPLAY sums; screens do not change (RC-5 stays open and is not
  closed by this).
- **The display-sum invariant pins the ROUNDING LAW** (the antagonist's
  correction to exit 3): the displayed total must equal the legacy
  rendering to the digit, so the sum is computed as
  `round(Σ(work+rest))` — one rounding at the end, never
  `round(Σwork)+round(Σrest)` — and the pin asserts a case where the two
  laws differ.
- Server: additive columns/fields; migration additive; **no backfill —
  old records keep fused-only quantities forever, said above the fold.**
  API additive-only.
- **End-during-rest bound documented, not hidden:** an END during a
  trailing rest loses the just-finished interval's 0x0037 (arrives at
  rest END; terminate burst unknown). Falls back to synthesis, rest
  fields absent. Carried in the spec, DEVIATIONS, and the record's own
  absent fields; never estimated.
- **RC-8's remaining corrections gate this PR's tests** — at the sites
  the antagonist located: the `intervalRestTimeSeconds: 0` hardcode at
  `fake.ts:928`; `restSeconds` forced 0 off-rest; `ergMachineType: 1` in
  BOTH fake sites plus the three domain fixtures carrying it (real
  machine reads 0 in 3448/3448 frames); `splitIntervalType` reflecting
  the scripted kind. Every pin that can replay a committed capture does
  (fakes prove plumbing; captures prove meaning), and the work-only pins
  use the REST-BEARING captures per §1.

## 4. PR 3 — F2b: the interval-count bound (TRIAD: when the guard closes records)

- The guard gains 0x0033's RAW interval count as an ADDITIONAL bound —
  read pre-`toProgramIndex` (unclamped, never nulled), a NEW
  additive-optional `MonitorFrame` field (the `totalWorkDistanceMeters`
  precedent; this reverses `driver.ts:1824-1830`'s "the raw value
  survives only in the event log" contract — named as work, with the
  DEVIATIONS row reconciled, delta D6). `ContinuityReading`'s
  same-frame doc comment is rewritten honestly: the count axis comes
  from the most recent 0x0033, a different characteristic than the
  0x0031 axes, carried with the reading. `after.intervalCount <
  before.intervalCount` ⇒ `"reset"`. The F2a three-axis signature stays
  unchanged as the other bound.
- **Honest capability statement (delta D3):** the count reads 0 through
  interval 1 of EVERY program (0-based, forward-attributed — settled
  free by the sweep), so the bound is inert through the whole first
  interval and on 1-interval programs — 78.3% of 30 s-gap pairs across
  the corpus see no count change at all. Where it IS live
  (multi-interval, past interval 1) it closes exactly F2a's §2b blind
  window, and it is never worse than F2a anywhere.
- **True-positive power is SYNTHETIC-ONLY and the spec says so (delta
  D5):** no committed recording contains an interruption episode, and
  the rings carry no interval count — exit 6's conviction runs on a
  constructed multi-interval fixture, and with all suppression removed
  the F2a signature convicts zero times in 3,316 corpus pairs, so this
  bound is the only live conviction path the corpus can even exercise.
- **The corpus's ONE backward count reading is in the spec, with its
  safety argument localized (delta D2):** session-2 seq 24→29 (count
  3→0, the leftover-register connect shape) — harmless in production
  ONLY because `applyContinuityCheck` short-circuits on `run === null`;
  a test pins that exact shape THROUGH the production path, so the
  safety stops living in a different file by accident.
- **The base ambiguity needs NO settling for this bound (delta D4):**
  `after < before` is invariant under any constant offset. §15 #1 gets
  the 0-based/forward-attributed note for free; it is not a gate.
- **Suppression, decided with both eyes open (delta D5):** the sweep
  supports lifting it for the count bound (the count held constant
  across BOTH real backward-TWD glitches, step-2 500→250 and pyramid
  1347→1047), and the one backward count sits inside the suppressed
  region but PRE-RUN, where production never runs the check. The lift
  ships ONLY IF the sweep is clean under BOTH `distanceGoal` predicates
  — the wire's per-sample `durationType===128` AND production's
  `programHasDistanceGoal(run.program)` (two different rules; the
  existing CI sweep measures only the first — delta D5's
  oracle-blindness catch) — with both results recorded. Otherwise the
  count bound stays under F2a's suppression and the spec records why.
- **New wire fact documented in `pm5-interface-notes.md` in this PR
  (delta D1):** the count increments at REST ONSET — 29.8 s (r30) and
  59.7 s (r60) ahead of that interval's own 0x0037, lagging it only
  0.28–0.72 s on r0 — independently corroborating §3's end-during-rest
  bound.

## 5. Out of scope, said aloud

- RC-2/RC-3 (identity decode, 0x0039's nine fields as product data) —
  next wave; PR 1 records bytes, displays nothing.
- RC-5, RC-9, RC-10, RC-11 — unchanged homes. The hash equation stays
  INFERENCE until a sandbox POST tests it.
- Any display change. Any terminate-path change.

## 6. Exit criteria — written so they can go red

1. Fake-driven, BOTH race orderings: a burst-first finish consumes the
   summary for observations even though the split won (the branch that
   used to log "discarded unread"), and a terminal-first finish captures
   the burst inside the linger with the deferred reconcile drain; both
   store `summaryTotals` + `verificationBytes` as write-once
   observations keyed on the run's identity, on a record whose every
   pre-existing field is byte-identical to a no-burst run — and a
   post-linger write against a CLEARED `MONITOR_RUN_KEY` is skipped
   (the resurrection race, pinned).
2. Committed-capture replay (2026-08-23 keystone): the burst-first race
   replayed end-to-end; the record carries summaryTotals 500.0 m and
   the hash bytes `27d8f36e e152555b`; the final interval is the real
   0x0037's (68.6 s / 250 m shape). The replay proves DECODE and fold;
   production 0x003F reachability is proven separately by the driver
   subscription's own tests on both arms (the capture's 0x003F came
   from the instrument's subscription).
3. A post-RC-1 record stores work and rest separately; the display-sum
   pin includes a case where `round(Σ(w+r)) ≠ round(Σw)+round(Σr)` and
   asserts the former.
4. The work-only distinction is pinned on a rest-bearing capture
   (session-2: stored session work 1535 m ≠ fused 1599 m), not the r0
   keystone.
5. The fake's corrected fields each match a committed capture value; the
   `ergMachineType` fix covers both fake sites and the three fixtures.
6. F2b: the F2a §2b under-count scenario convicts on a multi-interval
   SYNTHETIC fixture via the count bound (stated as synthetic — no real
   interruption recording exists); the corpus sweep (recordings only)
   shows zero false convictions under BOTH distanceGoal predicates,
   results recorded; the session-2 seq 24→29 backward-count shape is
   pinned through the production path (run === null ⇒ no conviction).
7. On a real PM5 (next walk, production build, one keystone-shaped piece
   WITH a rest — so work-only discriminates): the log's stored summary
   totals match the PM5 memory screen's work-only row, and the stored
   final interval matches its interval row — the first production row
   the machine itself confirms. The readout is the ring's SECOND stash
   (the linger-end stash; without it the walk sees nothing — delta B1).

## 7. Gates and sequencing

- **Antagonist:** the full pass ran and KILLED the original mechanism
  (window-after-terminal; driver-level hold; an 0x0031 interval key that
  does not exist); this revision is its product. A **scoped DELTA pass**
  re-attacks only §2's burst-as-event + linger and §4's count bound
  before implementation.
- **PM final-PR gates on all three PRs** (spoken now: PR 1 adds a
  post-close writer and changes what a record contains; PR 2 is a stored
  shape; PR 3 changes when the guard closes records).
- Order: PR 1 → PR 2 (lands alone) → PR 3 (lands alone). Notes clauses
  accumulate to the next MINOR; the no-backfill sentence rides PR 2's.
