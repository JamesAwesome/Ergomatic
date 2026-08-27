# Derivation audit — `app/src/monitor/useMonitorSession.ts` (3,254 lines)

Phase RC close-out derivation audit (ROADMAP, James 2026-08-25). Read completely,
line 1 to 3,254. Other files opened only to establish authority: `driver.ts`,
`domain/monitor/types.ts`, `monitorRun.ts`, `continuity.ts`, `transports/liveness.ts`,
`connectedAxes.ts`, `useMonitorSession.test.ts`.

## Counts

| Class | Count |
|---|---|
| INVENTED-HEURISTIC | 13 |
| RE-DERIVED | 7 |
| CONSUMES-AUTHORITY | 13 |
| NOT-A-DERIVATION | 7 |
| **Total** | **40** |

## What the wire and the driver actually resolve (the authority baseline)

Established before classifying, so "no authority exists" is a finding and not a shrug:

- `MonitorFrame.state` (`types.ts:177`) — `idle|armed|rowing|resting|finished|terminated`,
  the PM5's own WORKOUTSTATE. **`types.ts:181` verbatim: "There is NO paused state on
  the wire — mid-workout the clock runs whether or not the rower pulls (C4/H1)."**
  This is the authority for REST STATE and for the machine's own lifecycle.
- `MonitorFrame.rowingActive` (`types.ts:80-88`) — 0x0031 offset 9, Rowing State byte,
  "the machine's OWN declaration of 'is this person rowing'". The authority for
  "has the rower started."
- `MonitorFrame.intervalIndex` — **already normalised by the driver**: `driver.ts:2109`
  `toProgramIndex(...)`, written into the frame at `driver.ts:2427` before any consumer
  sees it. INTERVAL MEMBERSHIP is fully resolved upstream.
- `MonitorEvent{intervalComplete, finalBoundary}` — the driver decides which boundary is
  the final one (`driver.ts` finish grace, `FINISH_GRACE_MS = 3000`).
- `MonitorEvent{armed, workoutComplete, terminated, disconnected, summary-observations}` —
  driver-resolved session lifecycle.
- `MonitorFrame.sessionDistanceMeters/sessionElapsedSeconds` — driver's session register
  map. TOTALS are resolved upstream.
- `LivenessSnapshot.silent` + `SILENCE_THRESHOLD_MS = 2500` (`liveness.ts:137`) — the
  transport decorator's own stream-health verdict.

**Headline positive result: this file re-derives NO interval membership and NO totals.**
Every actual is filed under `event.actual.index` exactly as the driver handed it
(`:2257`); `identity.program` is stored, never re-derived from bytes (`:1917-1918`);
`sessionDistanceMeters` is deliberately never substituted for `distanceMeters` in any
predicate (`:1121-1131`, `:1856-1862`). The series-truth class of defect (a consumer
re-deriving a key the driver already resolved) does **not** recur in this file for
membership or totals. It recurs for **rest/activity state**, **link state**, and
**session lifecycle**, which is where all 20 findings sit.

---

## INVENTED-HEURISTIC (13)

### H1. `endSession`'s `linkGone` — the highest-cost derivation in the file
- **file:line** `:3145` — `const linkGone = phase === "disconnected" || stateRef.current.frameSilence;`
  Constants: inherited `SILENCE_THRESHOLD_MS = 2500` (`liveness.ts:137`) and
  `BANNER_RETRACT_HYSTERESIS_MS = 10_000` (`:366`).
- **Authority?** **Partially, and it is being overridden.** `phase === "disconnected"` IS
  authority — it comes from the driver's own `disconnected` event. `frameSilence` is NOT:
  it is a 2.5 s inter-arrival threshold on 0x0031 invented at the transport seam. The
  wire carries no "the link is degraded but not dropped" fact, so the heuristic is
  legitimate *as a banner*. What is not legitimate is that a banner-grade signal is
  ORed into a **stored field** and into a **wire send decision**.
- **What breaks on disagreement?** Two things, both concrete:
  1. **A wrong stored number/field.** `closeRecord(true, linkGone ? "link-lost" : "rower")`
     (`:3152`). A false `frameSilence` stores `endedBy: "link-lost"` for a rower who
     pressed End on a perfectly healthy link — the exact conflation `endedBy` was
     introduced (Phase LL Task 4) to end, reintroduced from the other side. The
     comment at `:3135-3144` argues the inclusion is a FIX; it is, for the true-positive
     case, and a defect for the false-positive one.
  2. **A wrong device interaction.** `:3155` `if (driver === null || linkGone) return;` —
     the `await driver.terminate()` is SKIPPED. On a false latch the rower presses End,
     the app says the session is over, and **the PM5 is left running the piece.**
- **Is the false positive hypothetical?** No. `docs/monitor/sessions/walk-2026-08-26/`:
  nine red LOST THE MONITOR banners in 288 s over a link that never dropped, 233 frames
  across the nine supposed gaps. Phase LM fixed only the **lifecycle** producer
  (`decideResumeLatch`, H5 below). The **watchdog** producer is untouched, and its own
  constant is explicitly hedged: `liveness.ts:126` — "Native's own inter-frame gap
  distribution is UNMEASURED ... necessary-and-not-sufficient evidence, not proof, for
  the platform it exists to protect."
- **Pinned by a test?** The behaviour is pinned in the TRUE-positive direction only:
  `"Phase LL Task 4: End after the link is gone stores endedBy link-lost"` (`:2951` of
  the test file), `"End while the monitor has gone silent still closes the record"`
  (`:3223`), and the whole `describe('Whole-branch review B1: End under a
  watchdog-fired banner ...')` (`:3292`). **No test asserts that a FALSE latch is
  survivable** — nothing pins "the erg still gets terminated when the banner is wrong",
  and nothing pins that a healthy-link End cannot store `link-lost`. The suppressed
  terminate has no test at all in the false-positive direction.

### H2. `applyContinuityCheck`'s gate — `frameSilence` as the trigger for a stored close
- **file:line** `:585` `if (!frameSilence) return run;`, call site `:2013-2020`.
- **Authority?** For "is this a different session now", the wire DOES answer:
  `frame.state` returns to `armed`/`idle`, and the driver opens a fresh `activeRun` and
  emits `terminated`. This check runs BESIDE that authority, not from it. The
  three-axis backward comparison itself lives in `continuity.ts` (out of scope), but the
  DECISION TO RUN IT is this file's, and it is gated on H1's suspect signal.
- **What breaks?** `completeContinuityReset(run, now)` → `endedBy: "link-lost"`,
  `phase: "ended"`, `runOpen: false` (`:628`, `:2084`). Every later boundary is then
  refused by `recordActual`'s `completedAt` guard. **A run closed under a rower who is
  still rowing loses every remaining interval.** This is the single largest data-loss
  path in the file. It inherits H1's false-positive source directly.
- **Mitigations that are real and should be stated:** three-axis conjunction (TWD AND
  elapsed AND distance all backward), `programHasDistanceGoal` suppression (`:590`,
  `:507`), `run === null`/`completedAt` short-circuits, and `intervalCount` corroboration.
  These make the conjunction hard to satisfy accidentally.
- **Pinned by a test?** Extensively — `describe("Phase LL Task 4: applyContinuityCheck
  (pure ...)")` (test `:7478`, 12 cases including the F2a false-kill shape and the
  three-`<`-comparison mutation), the real-driver composition suite (test `:7844-8338`),
  and the healthy-resume no-op (test `:7770`). The PURE function is well pinned; the
  GATE (that `frameSilence` is a sound trigger) is not independently pinned.

### H3. `nextFreezeRun` / `freezeKey` / `PAUSED_FRAME_HOLD = 4` / `isPausedRun`
- **file:line** `:1020` (`PAUSED_FRAME_HOLD = 4`), `:1120-1133` (`freezeKey`),
  `:1137-1163` (`nextFreezeRun`), `:1170-1172` (`isPausedRun`). Signal: the string key
  `` `${frame.distanceMeters}|${frame.currentSplit}|${frame.spm}` `` identical across 4
  consecutive frames, while `frame.state === "rowing"` and `frame.distanceMeters > 0`
  and `pulled`.
- **Authority?** **NO — and this is the file's clearest legitimate invention.**
  `types.ts:181` states the PM5 has no paused state on the wire, and the clock keeps
  running. `rowingActive` is the nearest wire fact and was FALSIFIED as a hard gate
  (`:1065-1068` — Phase LM task 2: "it read `false` through an entire real row").
  There is nothing to consume; the fact must be invented or not exist.
- **What breaks?** Nothing stored and no wire traffic. `frozen` feeds
  `connectedAxes.ts:267` `deriveActivity` → `"frozen"` → the PULL TO RESUME copy. A
  disagreement is a wrong word on screen. `phase` deliberately never leaves `"live"`
  (`:1972-1979`), so no lifecycle consequence. **Cosmetic by construction.**
- **Pinned by a test?** Heavily — `describe("the paused derivation, replayed frame by
  frame from the record")` (test `:4682-4961`, 9 cases against real captured frames),
  the corpus regression `describe("Phase LL minor 3: §2b's falsification ... zero PAUSED
  firings at any post-rest work-interval start, across the full committed corpus")`
  (test `:5138`) with its own "the corpus genuinely contains post-rest starts" sanity
  case (test `:5219`), and the end-to-end `describe("useMonitorSession: frozen ...")`
  (test `:5268`).

### H4. `PULL_EVIDENCE_FRAMES = 5` (the "was rowing" half of the pause)
- **file:line** `:1091`, consumed `:1155-1158`. Signal: 5 consecutive strictly-increasing
  `distanceMeters` frames inside the current interval, via `nextRowingStreak`.
- **Authority?** Same as H3 — none the code is willing to trust. Comment documents the
  residual false positive honestly (`:1070-1078`) and its cadence dependence
  (`:1080-1089`: ~2.5 s at 2 Hz, **~5 s** on the 1 Hz `walk-2026-08-23` capture).
- **What breaks?** Cosmetic — same `frozen` path as H3. A too-slow gate withholds
  PULL TO RESUME for a few seconds; a too-fast one shows it falsely.
- **Pinned by a test?** Yes — `describe("the interval that has not been pulled in yet")`
  (test `:4963-5137`): the dying-coast case, the same-coast-after-a-real-pull case,
  "five progressing frames earn a pause and four do not" (`:5035`), and "the PREVIOUS
  interval's rowing does not count as this one's pull" (`:5047`).

### H5. `decideResumeLatch` + `SILENCE_THRESHOLD_MS`
- **file:line** `:480-491`, call site `:2980-2983`. Constant `SILENCE_THRESHOLD_MS = 2500`
  imported from `liveness.ts:137`.
- **Authority?** **Split, and the split is correct.** The `snapshot.silent` arm (`:488`)
  CONSUMES the watchdog's own verdict — classified separately as A11 below. The
  `gapMs >= thresholdMs` arm (`:490`) is this file's own derivation over
  `snapshot.atMs - lastArrivalMs`, i.e. the same two numbers the watchdog reads.
  It is the SECOND reader of a fact the decorator already owns.
- **What breaks?** Everything H1 and H2 break — this is one of the two producers of
  `frameSilence`. If it latches when the watchdog would not, End stores `link-lost` and
  sends no terminate; if it fails to latch when the stream really did stop, the fail-safe
  is the watchdog's own still-pending timer, which the handler deliberately does not
  disturb (`:2933-2942`).
- **Pinned by a test?** Yes, and unusually well: `describe("Phase LM: decideResumeLatch
  (pure) — the resume alarm keys on a measurement")` (test `:6301-6435`) pins both sides
  of the threshold to the millisecond, the corpus's worst in-stream gap (810 ms), the
  negative-gap/NTP case, the unmeasured cases, and that it reads 0x0031 specifically.
  Hook-level: test `:6986` (no false alarm), `:7080` (the fail-safe), `:7147` (mid-retract),
  `:7226` (`markSuspect` routing).
- **Note.** This one is the model the rest of the file should follow: an invented
  mechanism whose constant is measured, whose both-sides boundary is pinned, and which
  defers to the existing authority when that authority has already spoken.

### H6. Teardown's terminate decision, keyed on OUR derived phase
- **file:line** `:2513-2522` — `const phase = stateRef.current.phase;
  if (!alreadyTerminated && (phase === "programming" || phase === "ready")) driver.terminate()...`
- **Authority?** **YES, and it is not read.** `stateRef.current.frame.state` carries the
  machine's own WORKOUTSTATE (`armed` vs `rowing`) on every frame; the driver also knows
  whether its `activeRun` is open. This branch instead asks OUR `phase`, whose
  `ready → live` promotion is itself heuristic (H7 below) and can LAG the machine.
- **What breaks?** A wrong device interaction with the largest human cost in the file:
  while the ready gate has not yet fired — the machine's Active byte stuck false and
  fewer than 5 strictly-increasing frames banked, i.e. up to ~5 s on the 1 Hz capture's
  cadence — `phase` is still `"ready"` while the rower is genuinely rowing. Any unmount
  in that window (tab-bar tap, back gesture; `useEffect(() => teardown)` at `:3235`)
  sends a **TERMINATE that kills the rower's live piece on the erg.** The inverse, an
  erg left ARMED with an orphan workout, is DEVIATIONS row 63 and is exactly what this
  branch was added to prevent — so the branch is right in intent and reads the wrong fact.
- **Pinned by a test?** The intended cases are: `"unmount while armed (ready) terminates
  BEFORE hanging up"` (test `:4339`), `"unmount while programming (before armed) also
  terminates first"` (`:4357`), `"unmount while live sends NO terminate"` (`:4392`).
  **The lagging-gate case — unmount while `phase === "ready"` but the machine is
  rowing — has no test.**

### H7. `ROWING_ACTIVE_FALLBACK_FRAMES = 5` — the ready→live promotion fallback
- **file:line** `:1212` (constant), `:1879-1883` (the `fallback` predicate),
  `:1236-1246` (`nextRowingStreak`). Signal: 5 consecutive strictly-increasing
  `distanceMeters` frames while `frame.state === "rowing"` and `!declared`.
- **Authority?** **YES — `frame.rowingActive`, and this deliberately overrides it.**
  The `declared` leg (`:1872-1875`) reads the machine's own Active byte; `fallback` fires
  precisely when the machine says Inactive and we promote anyway. The comment
  (`:1182-1211`) states the asymmetry openly: a stuck-Inactive byte silently loses a
  whole session, so the fallback is "deliberately generous about the coast and
  unforgiving about losing a session." This is a considered override, not an oversight.
- **What breaks?** Session lifecycle. Promotion runs `createSeriesRecorder()` and
  `createMonitorRun(...)` (`:1911-1932`), and `createMonitorRun` performs an
  unconditional `clearRun()` that **destroys any live phone `SessionRun`** (this file's
  own header, `:13-18`). Promoting on a coast the PM5 does not consider a start
  therefore opens a record early AND fires that destruction early. Mitigations: the
  Connect guard already asked the rower about that destruction before `connect()` ran,
  and walk-3 evidence bounds the coast (a decaying flywheel breaks strict increase
  within one to two frames, `:1074-1078`). Residual cost is a record stamped a beat
  early — reported as cosmetic, and the `clearRun()` edge is the part that is not.
- **Pinned by a test?** Yes, both directions: `"the STUCK Inactive byte does not cost the
  session: five frames of strictly increasing distance promote to live anyway, and the
  log says so"` (test `:1160`), `"the COASTING flywheel holds ready"` (`:1048`),
  `"the COASTING flywheel, extended: meters that stop climbing break the streak"`
  (`:1208`), `"the INSTANT path is untouched"` (`:1243`), plus
  `describe("nextRowingStreak: the rowingActive fallback's own counter")` (`:5237`).

### H8. `nextFreezeRun`'s `distanceMeters <= 0` reset — a boundary inference
- **file:line** `:1148` — `if (frame.state !== "rowing" || frame.distanceMeters <= 0)`
  resets the whole `FreezeRun` including `pulled`.
- **Authority?** `frame.intervalIndex` changing IS the driver-resolved boundary, and it
  is not consulted. The comment at `:1103-1105` asserts the equivalence out loud:
  "every reset of the freeze run IS an interval boundary". Its own header then
  falsifies the converse (`:960-968`): 4 of 5 recorded no-rest changeovers carry `d 0`,
  **the fifth does not** — `walk-2026-08-23/keystone-…jsonl.gz` index 96 goes
  `rowing/248.5 -> rowing/1.9` with no intervening `d<=0` frame, so pull evidence
  carries across a boundary there.
- **What breaks?** Cosmetic — pull evidence leaking one interval forward can declare a
  pause in an interval the rower never pulled in. Same `frozen` surface as H3/H4.
  Cheap fix available and not taken: reset on `frame.intervalIndex` change.
- **Pinned by a test?** The `d 0` majority case is (test `:4683`, `:4813`, `:5383`).
  The keystone index-96 exception is documented in the comment and **has no test**.

### H9. `FINISH_HANDOFF_HOLD_MS = 3500`
- **file:line** `:726`, used `:1806-1809`. Coupled constant: `driver.ts:857`
  `FINISH_GRACE_MS = 3000`, with the inequality documented as STRICT (`hold > grace`).
- **Authority?** No — the wire says nothing about how long a split takes to arrive.
  Measured from walk day 3 (`docs/monitor/pm5-interface-notes.md` §22 item 5), which is
  the right kind of derivation.
- **What breaks?** If the inequality inverts, the driver's summary fill and this backstop
  become two timers due at the same millisecond and the rower gets "0 OF 1 MEASURED" on
  whichever ordering the event loop picks — **a lost measurement**, the exact defect the
  hold exists to prevent.
- **Pinned by a test?** The behaviour is: `describe("the ended hand-off waits for the last
  split (walk day 2)")` (test `:1453-2084`, 10 cases incl. the walk-day-3 replay at
  `:1454`, the bounded backstop at `:1541`, and the dropped-split end-to-end at `:1861`).
  **The `hold > grace` inequality itself is not asserted anywhere** — no test would go
  red if someone set `FINISH_HANDOFF_HOLD_MS = 3000`. Cheapest possible gate, absent.

### H10. `BURST_LINGER_MS = 2000`
- **file:line** `:761`, used `:2687`. Deferral cap for teardown steps 1/3/4.
- **Authority?** No wire fact. Modelled on a natural finish's 398 ms worst case; the
  comment states honestly that the terminate path's own measured lag is ~1 s (n = 1,
  `walk-2026-08-24/lab-terminate-ring.json`) and that the real budget is smaller still
  because the clock starts at teardown, not at the terminal frame (`:746-753`).
- **What breaks?** A slow burst is capped and lost — `summaryTotals`/`verificationBytes`
  simply absent from the stored record. Missing stored data, never wrong stored data.
- **Pinned by a test?** Yes — `describe("useMonitorSession: teardown — the burst linger")`
  (test `:2085-2886`, cases (a) through (h) incl. the cap at `:2216`, no-burst at
  `:2434`, terminate lingering at `:2529`, and the menu-terminate capture at `:2597`).

### H11. `BANNER_RETRACT_HYSTERESIS_MS = 10_000`
- **file:line** `:366`, used `:414-416`.
- **Authority?** No. Derived from the measured ~540 ms median inter-frame gap (≈18
  frames), which is a defensible derivation.
- **What breaks?** Cosmetic on its own — banner retract latency. **But it holds
  `frameSilence` true for up to 10 s of healthy stream**, which is a 10-second window in
  which H1 and H2 both read a stale suspect flag. That is how a cosmetic constant
  becomes load-bearing for a stored close; noted here rather than under H1 because the
  constant itself is sound.
- **Pinned by a test?** Yes — `describe("Phase LL Task 2: handleFrameSilence/
  handleFrameRecovery")` (test `:6231`) and the composed hysteresis walk (`:6684`).

### H12. `SERIES_FLUSH_INTERVAL_MS = 30_000`
- **file:line** `:766`, used `:1654`.
- **Authority?** No, and none needed — "the spec names the number directly, no derivation
  to carry" (`:763-765`).
- **What breaks?** Up to 30 s of series trace lost on an unclean exit. Missing data only;
  the close flush and the boundary flush both cover the ordinary paths.
- **Pinned by a test?** Yes — `"the 30-second timer flush fires independent of any
  boundary"` (test `:5640`), plus the S1 write-count witness (`:5902`).

### H13. `mapRadioFailure`'s prose sniffing
- **file:line** `:1366-1383` — the `unavailable` regex
  `/adapter|not enabled|not available|unavailable|disabled|powered off|turned off/i`
  and the `/cancel/i` fallback.
- **Authority?** Partially. The two `name ===` checks above it (`:1351`, `:1359`) DO
  consume authority — names the Capacitor transport deliberately set — and the ordering
  pin (`:1346-1350`) is correct. The regexes are prose sniffing over adapter messages
  that no vendor contract fixes.
- **What breaks?** Only which remedy copy a rower reads on the failure screen. No stored
  value, no wire traffic. Bottom of the risk order despite looking the most fragile.
- **Pinned by a test?** Yes — the ordering pin (test `:649`), bluetooth-off vs
  scan-dismissed under the same `NotFoundError` name (`:737`), both connect-timeout
  literals (`:690`, `:711`), and non-Error throws (`:757`).

---

## RE-DERIVED (7)

### R1. `openHandoffHold`'s "is the last interval measured"
- **file:line** `:1798-1799` — `const lastIndex = run.program.intervals.length - 1;
  if (run.actuals.some((a) => a.index === lastIndex)) return false;`
- **Also computed by** `monitorRun.ts:618-627` `acceptableFinalBoundary`, which asks the
  identical two questions (`actual.index !== run.program.intervals.length - 1`,
  `!run.actuals.some((a) => a.index === actual.index)`) to decide whether to ACCEPT the
  late actual. Two copies of one predicate in two files.
- **If they disagreed:** the hook would hold for a split the record would then refuse
  (bounded 3.5 s delay), or hand off before a split the record would have accepted
  (a lost final measurement). They cannot disagree today — the expressions are
  identical — so the exposure is drift, not a live defect.
- **Pinned?** Behaviour yes (test `:1601` desktop order, `:1668` no record). The
  DUPLICATION is not pinned; nothing fails if one copy changes.

### R2. `burstEligible`
- **file:line** `:2629-2632` — `run.completedAt !== null && (run.endedBy === "finished"
  || run.endedBy === "rower")`.
- **Also computed by** `monitorRun.ts`'s `appendSummaryObservations` (summary-record spec
  §1 gate 4), which admits the identical pair. The comment names the duplication as
  deliberate: "one predicate, two enforcement points ... this one decides whether the
  bytes can still ARRIVE, that one decides whether they may be WRITTEN" (`:2622-2625`).
- **If they disagreed:** hook lingers 2 s and the write is declined (latency, nothing
  stored), or hook hangs up at t=0 and the burst never arrives — **`summaryTotals`
  missing from the stored record**, which is precisely the production defect the widening
  fixed (`ring-phone-3-menu-terminate.json` ended with no 0x0039/0x003A/0x003F because
  teardown hung up at t=0 while the burst was ~1 s out).
- **Pinned?** Yes, on both sides — test `:2529` (e), `:2597` (f), `:2730` (g), `:2805` (h).

### R3. `terminated: true` written by paths where no TERMINATE occurred
- **file:line** `:3152` (`endSession` → `closeRecord(true, ...)`) and `:3110`
  (`program()`'s P3b → `closeRecord(true, "program-failed")`).
- **Authority?** YES, and it is being asserted rather than observed. `monitorRun.ts:135`
  and `:870` define `terminated` as "HOW THE MACHINE reported it" — the
  `WORKOUTEND`/`TERMINATE` split, i.e. `MonitorFrame.state`. `endByMachine` (`:2171`)
  correctly passes the driver's own boolean. The two End-side paths INVENT it, and in
  the `linkGone` case (H1) no terminate is even sent, so the machine will never report
  the thing the record claims.
- **What breaks?** A stored boolean that means something the machine never said.
  `monitorRun.ts:138-143` already records the damage: "this comment used to claim
  `terminated` 'already losslessly distinguishes' ... End-in-the-app and
  Menu-at-the-erg store the identical `terminated: true`." `endedBy` was added to carry
  the truth, so `terminated` is now a legacy field whose stored value is partly fiction.
  No current consumer is known to be misled — this is a latent stored-shape defect, not
  a live wrong number.
- **Pinned?** The values are pinned as-is (test `:2922`, `:2951`, `:2980`, `:3008`).
  Nothing pins that they are HONEST.

### R4. `endByMachine`'s `terminated ? "rower" : "finished"` CloseReason
- **file:line** `:2171`.
- **Authority?** The driver resolves THAT a terminate happened; it does not resolve WHO
  terminated. The `"rower"` attribution is this file's inference, and the comment flags
  it as such ("FINDING (task-4 brief did not name this call site explicitly; the spec's
  own writer table lists only 'machine WORKOUTEND -> finished'", `:2162-2168`).
- **What breaks?** A wrong stored `endedBy`. The named live risk is walk question W8's
  PM5 inactivity auto-terminate: if the machine terminates itself, this stores `"rower"`
  for something no rower did. The comment anticipates it and calls it acceptable
  (`:2619-2621`).
- **Pinned?** Yes, the current mapping — test `:3008` `"a machine TERMINATE ... stores
  endedBy rower"`. The auto-terminate case is unmeasured (W8 is an open walk question).

### R5. `applyContinuityCheck`'s reset decision as a whole
- **file:line** `:572-629`, call site `:2013-2085`. Classified under H2 for its GATE;
  listed again here for its VERDICT, which duplicates a lifecycle the driver also tracks
  (`activeRun` open/closed, `terminated`/`armed` events).
- **If they disagree:** the record closes as `link-lost` while the driver still considers
  its run open and keeps emitting boundaries for it — which is then handled correctly
  (`recordActual`'s `completedAt` guard refuses them). The disagreement is therefore
  SAFE in mechanism and LOSSY in outcome: every refused boundary is a measurement gone.
- **Pinned?** See H2. Extensively at the pure and composed level.

### R6. `accepted = next !== candidate`
- **file:line** `:2260`. Re-derives `recordActual`'s verdict from reference identity
  rather than from a returned status.
- **If they disagree:** `withSeries` returning a new object would make a REFUSAL look
  like an acceptance. The code is aware and handles it — acceptance is compared against
  `candidate`, not `run` (`:2251-2255`) — which is exactly the trap the same idiom fell
  into at `:2035-2039` and had to be commented against.
- **What breaks?** A refused actual would be persisted into `runRef` and published to
  `state.actuals` — a wrong count on the save screen. Not currently reachable.
- **Pinned?** Yes — test `:1402` `"a boundary the machine reports after the run closed is
  never appended"`, `:1326` walk 5, and the ring entry pin at `:1812`.

### R7. `startSeriesFlush`'s `next === run` skip
- **file:line** `:1651`. Same reference-identity idiom, self-documented as currently
  unreachable belt-and-braces (`:1639-1650`, "a mutant removing this line is expected
  to survive").
- **What breaks?** Nothing today. A missed flush at worst.
- **Pinned?** No, and the comment says so explicitly. Correctly declared rather than
  pretended.

---

## CONSUMES-AUTHORITY (13)

| # | file:line | Fact | Authority read |
|---|---|---|---|
| A1 | `:2257` | interval membership of every actual | `event.actual.index`, already `toProgramIndex`-normalised by `driver.ts:2109/2427` — never recomputed |
| A2 | `:2242` | is this boundary inside our run | `runRef.current !== null`, plus the driver's own `index: null` for out-of-run boundaries |
| A3 | `:2284` | which boundary is final | `event.finalBoundary` (driver's finish grace) |
| A4 | `:2287-2293` | session finished vs terminated | `workoutComplete` / `terminated` events |
| A5 | `:2219` | armed → ready | the `armed` event, emitted only after `verifyArmed` |
| A6 | `:2338-2392` | link dropped | the `disconnected` event |
| A7 | `:2313-2323` | machine's own summary totals | `event.totals`/`detail`/`verificationBytes` folded on unchanged |
| A8 | `:1872-1875` | has the rower started (primary leg) | `frame.state === "rowing" && frame.rowingActive && distanceMeters > 0` |
| A9 | `:1148`, `:1240` | is the machine rowing / resting | `frame.state` — the rest-state authority, read directly, never inferred from spm or split |
| A10 | `:1913-1930` | what workout this is | `identity.program` as sent; `driver.capabilities.deviceName` as advertised |
| A11 | `:488` | has the watchdog already declared silence | `snapshot.silent` — its verdict stands regardless of the gap |
| A12 | `:1703`, `:2153` | is our record already closed | `run.completedAt` |
| A13 | `:2156`, `:3131`, `:3174` | has this session already ended | `stateRef.current.phase`, written only from real events |

A9 is worth naming: the file never asks "is a rest running" by looking at `restSeconds`,
`spm === 0`, or a timer. It reads `frame.state === "resting"`. The one place a
rest-adjacent inference exists (H8's `distanceMeters <= 0` reset) is about the boundary,
not the rest.

---

## NOT-A-DERIVATION (7)

| # | file:line | What it does |
|---|---|---|
| N1 | `:2133` | fall-through `update({ frame })` for every non-ready/non-live phase — renders, decides nothing |
| N2 | `:1953-1961`, `:2089-2097` | `lastContinuityRef` snapshots — four frame fields copied verbatim |
| N3 | `:1823-1825`, `:3014` | `framesWhileHiddenRef` counter — diagnostic ring entry only |
| N4 | `:2276`, `:3243` | `actuals` published from `run.actuals` |
| N5 | `:3228-3230` | `exportLog()` — a window onto the ring |
| N6 | `:1966`, `:1967`, `:3245-3247` | `frozen`/`runOpen`/`frameSilence` mirrors of refs into published state |
| N7 | `:2119-2125`, `:2267`, `:2997`, `:3019` | ring entries (`pause-declared`, `record-actual`, `app-lifecycle`, `resume-frames`) — record what was measured, assert no cause |

N7 deserves a note in the file's favour: RC-25's `pause-declared` entry (`:2102-2125`)
instruments a derivation that previously left no trace, and the `app-lifecycle` entry
was explicitly rewritten to stop asserting a cause it had not checked (`:2989-2996`).
That is recurring-failure-19's instrument-in-the-same-change rule being followed.

---

## Open questions — authority I could not establish

1. **Does anything upstream resolve "the stream is degraded but not dropped"?** I traced
   `frameSilence` to two producers inside this file's composition (the `liveness.ts`
   watchdog and `decideResumeLatch`) and found no third. I could NOT establish whether
   the Capacitor plugin or CoreBluetooth surfaces a link-quality or
   notification-stall signal that the transport could consume instead of thresholding.
   If one exists, H1 and H2 both change class from INVENTED-HEURISTIC to RE-DERIVED.
2. **Is `MonitorRun.terminated` read by any consumer that would be misled by R3?**
   I stayed inside this file's consumption boundary and did not sweep every reader of
   the stored record, so I can state that the value is asserted rather than observed
   but not that it currently produces a wrong number on any screen.
3. **Does the PM5 auto-terminate on inactivity (R4's exposure)?** This is walk question
   W8 and is open in the repo's own record; I did not resolve it.

---

## Summary of what a fix pass would touch, in cost order

1. **H1** — stop `frameSilence` alone deciding a stored `endedBy` and suppressing the
   terminate. Corroborate with a driver-resolved fact (`phase === "disconnected"`, or
   attempt the terminate regardless and let it fail) before storing `link-lost`.
2. **H2/R5** — the continuity reset inherits H1's trigger. Fixing H1 narrows it for free.
3. **H6** — read `stateRef.current.frame?.state` beside `phase` before sending a
   teardown terminate, so a lagging ready gate cannot kill a live piece.
4. **H9** — one assertion that `FINISH_HANDOFF_HOLD_MS > FINISH_GRACE_MS`. The comment
   says "change the two together or not at all" and nothing enforces it.
5. **H8** — reset the freeze run on `frame.intervalIndex` change rather than on
   `distanceMeters <= 0`, closing the documented keystone index-96 leak.
