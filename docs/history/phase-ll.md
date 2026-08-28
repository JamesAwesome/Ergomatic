> **Archived 2026-08-28** from `ROADMAP.md` (lines 2130-2971 of the pre-rebalance file, main `39e9430`).
>
> This is the phase as it was written while it ran. It is a RECORD: nothing
> here is scheduled, and its open items were lifted into `ROADMAP.md`'s live
> slate before this file was created. Do not cite it for a live question.

## Phase LL — The link can be lost, and the app has to say so

**Status:** OPENED 2026-08-20 (James, after the LT close-out walk: "i think
some of the bluetooth problems deserve their own phase with dedicated
connection management research"). Phase-open PM gate run and folded — its
verdict re-scoped the ask and is in `pm-ledger.md`.

**Implementation merged in #160. The phase stays OPEN on its exit walk**
(clauses a-e, W5-W8, W9, 9a). Owner: James's next erg visit, run through
`/hardware-walk`. The "Release posture" paragraph's cohort-of-one rule
STANDS until clause (b) exists.

**This phase is the DISPOSAL of the triggered follow-on "Reconnect and
background scan, five pieces", which is deleted in the same commit that
creates this section.** Its stated trigger — "Capacitor BLE lands, or a
tester reports a mid-piece lost link" — fired twice, and a fired trigger
that stays a follow-on is filing-as-deferral. Two homes for one body of
work is the CP/CR2 mistake; there is now one.

**What and why, in plain words.** On 2026-08-20 James armed a workout on
his phone, walked out of range, cycled Bluetooth off and on, and rowed.
The screen never changed — it held `1 OF 3 · READY` the whole time, and
his rowing went nowhere. Then it would not reconnect at all, surviving a
force-quit and a PM5 restart, until he deleted and reinstalled the app.
Separately he reports the opposite symptom: offering to Connect when the
app is in fact already connected. **One root: the app's connection state
is a local belief, never an observation, and it can be wrong in both
directions.** The goal of this phase is not to keep the link alive. It is
that a rower is never lied to about it, and never has to delete the app.

Evidence: `docs/monitor/sessions/walk-2026-08-20-lt-close/` (F-1, F-2,
F-3, F-6).

### It starts with research, and the research decides the build

**James's requirement, 2026-08-20, binding on this phase's shape:** the
phase BEGINS with a research pass into Bluetooth connection-management
best practice, and that pass carries an explicit **BUY vs BUILD
evaluation** — "in case we could be leveraging a library rather than
hand-rolling something we're not destined to be good at."

No spec is written before that pass reports. The house research rule
already applies (BLE lifecycle is a named OS-owned trigger; PRIMARY /
SECONDARY / INFERENCE tagging; "nothing found" is a result), and this
phase adds the buy-vs-build question on top of it.

- [x] ~~**The research pass**~~ — **DONE 2026-08-20**:
      `docs/superpowers/research/2026-08-20-ble-connection-management.md`.
      **Recommendation: BUY NOTHING.** Every candidate's headline
      connection-management feature is a wrapper over the same two
      CoreBluetooth facilities we can reach ourselves, and the incumbent
      plugin is healthily maintained (8.3.0 published this month — and its
      iOS sources are byte-identical to our 8.2.0, so upgrading fixes
      nothing here). Use the platform and call the functions we already
      own. **The one input that flips the answer** and should be asked
      before the spec: whether the app should keep logging while
      backgrounded or terminated. **Revised sequence from the pass:
      diagnosability → detection → recovery** (it moves diagnosability
      FIRST — you cannot fix what you cannot see, and the walk proved it).
      What the pass changed in this phase's own scope, below.
- [ ] ~~The research pass's original brief, kept for the record:~~
      Deliverable is a document, not a decision:
      what the platform guarantees, what our plugin does with those
      guarantees, what the alternatives are, and a recommendation with its
      reasoning exposed. It must cover, at minimum:
      - **The BUY side, seriously rather than as a formality.** What
        exists for BLE connection management on a Capacitor/iOS app; what
        each actually gives us over `@capacitor-community/bluetooth-le`;
        migration cost; and the maintenance question that matters most
        here — a BLE reconnect layer is exactly the kind of code whose
        bugs only appear on real hardware, which is an argument FOR
        borrowing someone else's battle-tested one.
      - **The third option, which is neither buy nor build:** use the
        platform's own primitive. Apple's `centralManager.connect` never
        times out by contract — it is iOS's built-in "connect when this
        device comes back" — and the plugin wraps it in a JS timeout that
        CANCELS the pending connection (`DeviceManager.swift:397-411`).
        We may be hand-rolling a replacement for something we currently
        disarm. Settle this before costing anything else.
      - **What the plugin already exposes that we never call** —
        `getConnectedDevices`, `getDevices`/`retrievePeripherals`, and its
        enabled-state channel — since "build" may turn out to mean "call
        the two functions that are already there".
      - **The does-it-exist question, asked of the PM5:** does the machine
        have any concept of "the session I was part-way through
        continues"? If not, reconnect can only ever mean "start watching
        again", and no copy may promise otherwise. This is the PAUSED
        lesson pointed at a new state, and it constrains the design more
        than any library choice.
      - **Apple, PRIMARY:** what `.poweredOff` does to live connections
        and whether `didDisconnectPeripheral` is delivered through that
        transition; what bounds the delay on an out-of-range drop (this
        decides whether a frame-silence watchdog is mandatory or
        belt-and-braces); and whether the per-app peripheral identifier
        survives a delete-and-reinstall — which is also a candidate
        explanation for the brick.
      - **Our own prior art, quoted not re-derived:** the web arm's
        stale-GATT-handle `InvalidStateError` "would have broken the
        driver's whole reconnect path on real hardware while passing CI,
        since the fake had no handle invalidation"
        (`pm5-interface-notes.md:2502-2505`).

### The background question, ANSWERED — and it did not reopen BUY

**James's ruling, 2026-08-20: backgrounded YES, terminated NO.** His
reasoning defines the scope: "backgrounded could happen by accident if a
person gets an urgent text or a call and they answer mid-row." **This is
not background workouts. It is not losing a rower's row to an
interruption they did not choose.** Terminated-no removes state
restoration entirely (restoration exists to relaunch a KILLED app).

A research delta followed (same document, `# DELTA` section). Its result:

- **A background mode would probably buy nothing, and the mechanism is
  not the one anyone expected.** The obstacle is not iOS's app lifecycle,
  it is **WebKit's own process throttler**: the complete set of things
  that keep a WebContent process runnable is *visible, audible,
  capturing*. A running timer, an open BLE subscription and a workout in
  progress are on none of them, and **not one step in that chain reads
  `UIBackgroundModes`.** So "the link stays up" and "we keep logging the
  row" are genuinely different claims, and a background mode buys only
  the first.
- **COULD NOT ESTABLISH by reading**, and it is labelled that way: one
  escape hatch depends on private RunningBoard SPI with no published
  reference. **A 90-second probe settles it** — one build, two runs, with
  and without the plist key (procedure in the delta's §D1e).
- **The recommendation is CORRECT RESUME, not a background mode**, and it
  is robust to that unknown — which is why the probe is not a blocker.
  Compared on what the ROWER ends up with, the two options differ in
  **exactly one row**: whether the app tells him he was away. If JS
  freezes, the mode delivers nothing for the interruption case; if it
  does not freeze, the case is already handled without it. Keep-awake
  makes it decisive — the screen stays on, so the app is foregrounded for
  the whole normal row, and a permanent architectural commitment would be
  bought for an accident.
- **BUY stays closed.** The flip condition was narrowed, not triggered:
  `bluetooth-central` does not serve "backgrounded" for a WebView app,
  and "terminated" is ruled out. `@capacitor/background-runner` is
  eliminated on its own documentation (stateless, DOM-less, destroyed per
  event).

**Three findings from the delta that outlive the choice:**

- [x] **~~`seriesRecorder`'s boundary fold silently UNDER-COUNTS when a
      gap spans an interval boundary~~ — RECORDER-SIDE HALF SUPERSEDED,
      DRIVER-SIDE HALF NOW AN ACCEPTED, SPEC-RECORDED COST (series-truth
      spec §B′, 2026-08-25).** `seriesRecorder` no longer folds or
      rejects anything on its own account: B′ deletes its own boundary
      heuristic entirely and keys registers on `attributedIntervalIndex`
      — the ONE key the driver's own register logic already resolved —
      so there is no second, recorder-owned fold left to under-count.
      The driver-side observation stands, unchanged: on a refused open
      OUTSIDE states 8/9, the series still max-merges the post-gap
      interval into the prior key — short by the gap, the same
      short-by-the-gap the accumulator already accepts. James accepted
      that trade (consistent-with-the-accumulator over
      independently-diverging) rather than build a second guard; it is
      pinned by a `seriesRecorder.test.ts` regression on that exact
      edge, never left "unreachable".
- [ ] **A backlog may already exist, twice over, unbuilt.** Apple
      documents that for a foreground-only app "all Bluetooth-related
      events… are queued by the system and delivered to the app only when
      it resumes", and WebKit's IPC send queue is uncapped in source. Our
      pipeline is wire-clock driven (`driver.ts`, `seriesRecorder.ts`,
      three named wall-clock exceptions), so it **could consume a drained
      backlog** — the row might reconstruct itself. Depth and duration of
      both queues: could not establish. Probe before designing anything
      that assumes loss. **S**
- [ ] **Capacitor answers a killed WebContent process with
      `webView.reload()`**, destroying the driver, the recorder and up to
      30 s of unflushed series (the flush is a `setInterval`, frozen
      while suspended). Flagged by the delta as contradicting its own
      brief: **"terminated no" disposes of force-quit, not of memory
      pressure**, and the system killing a backgrounded app is exactly
      the termination case that matters here. **M**

**Two corrections to this section's earlier text**, both from the delta:
the claim that apps have been rejected for declaring `bluetooth-central`
without a qualifying use **could not be sourced** — Bluetooth appears
zero times in the App Store Review Guidelines, and 2.5.4 restricts USE,
not declaration. And a carve-out the first pass predates: **iOS 26 grants
foreground-equivalent Bluetooth privileges to an app that starts a Live
Activity before backgrounding** — attractive for exactly this scenario,
but it restores BLUETOOTH privileges only and says nothing about
WebKit's throttling, so it does not rescue the JS half.

### What the research changed — read before writing the spec

- **The frame-silence watchdog is MANDATORY, not belt-and-braces.** Apple
  documents no bound on out-of-range disconnection latency, and — the
  important silence — **does not document whether
  `didDisconnectPeripheral` fires on a Bluetooth power-off at all.** Since
  that callback is our only detector, detection may be *structurally
  absent* for exactly what James did. No amount of reading settles it.
- **A cheap second signal exists and we never subscribe to it:** the
  plugin's `startEnabledNotifications` channel reports the power-off
  directly (`DeviceManager.swift:48-70`).
- **iOS 17 ships Apple's own auto-reconnect** —
  `CBConnectPeripheralOptionEnableAutoReconnect`, with an `isReconnecting`
  signal — **and the incumbent plugin cannot reach it**, because it passes
  `options: nil` and exposes no connect-options passthrough. That is a
  fork/patch/upstream question, not a library-selection question, and it
  is the shape "reconnect" would most likely take here if it is ever IN.
- **F-2 is not a connect failure.** This record's own wording says the
  retries "reached programming" — connect kept succeeding, programming
  kept failing. Verified closed loop: `program()`'s catch never
  disconnects and never clears `driverRef`, Try Again reprograms over the
  same dead driver, and `connect()` early-returns while `driverRef` is
  set. Strongest instrumentable candidate for the link death: every
  connect attempt builds a **new `CBCentralManager`**
  (`Plugin.swift:62-71`) while the plugin's `deviceMap` retains
  peripherals from previous centrals. **It does not explain the
  force-quit survival, which is still unexplained.**
- **THE PM5 HAS NO RESUME CONCEPT — established by exhaustive
  enumeration, not assumed.** Its workout state machine has fourteen
  states and none concerns the link; a grep of the whole CSAFE spec for
  resume/reconnect finds nothing. What exists instead: the machine keeps
  counting and publishes its current state, so "start watching again"
  recovers the numbers but **never the gap**. The only retrospective
  store is a COMPLETED workout's internal log (`0x003F` +
  `CSAFE_PM_GET_INTERNALLOGPARAMS`), which is not a mid-piece backfill.
  This re-confirms DEVIATIONS 75 from first principles instead of
  inheriting it, and it binds any future copy: **no wording may promise
  a rower that a gap will be filled.**
- **"The PM5 is single-central" HAS NO SOURCE** — absent from Concept2's
  documents and from our own record, and it was stated as fact during the
  walk. It is a documented absence plus consistently singular language.
  Do not inherit it; settle it with a one-line device probe, on which
  part of the recovery design depends.
- **Two corrections to this phase's own opening text**, from the pass
  reading the source rather than the brief: the connect timeout is a
  Swift `DispatchWorkItem`, **not a JS timeout** (`DeviceManager.swift:
  398-411`) — which changes where any fix lives — and raising it would
  also un-bound **service discovery**, where there is a live path that
  never resolves (`Device.swift:81-91`).

### In scope

- [x] **The trace tells the truth about the row** — spec 1, written
      2026-08-20:
      `docs/superpowers/specs/2026-08-20-trace-truth-design.md`. **TRIAD**
      (a number's meaning AND a stored shape); full antagonist pass done
      and folded into its §8. Index-keyed max-merge REPLACING the boundary
      heuristic (not supplementing it — deletion retires four defects at
      once); rests drawn but MARKED, which puts a rest flag in the stored
      sample; and the chart gains the time axis it has never had. Three
      PRs, accumulator first and alone. **This is spec 1 of the phase by
      James's sequencing, ahead of the three items below.** **DONE
      2026-08-20 (Task 3, the time axis, trace-axis PR): all nine exit
      criteria met.** Criterion 7's own capture choice (below, ROADMAP's
      pre-task-3 item): `log-detail.png`, not `log-monitor.png` —
      `buildLogDetailSeries()`'s own fixture already derives its series
      from the SAME 478s used for the row's `timeSeconds`, so the axis's
      own last label (`7:58`) reconciles with the `TIME` hero exactly, in
      the same viewport-only frame; re-deriving `log-monitor.png`'s
      `avgSplit`/`avgSpm` off its raw elapsed stream would be a
      number-semantics change to the summary model, out of proportion to
      a screenshot fixture. `log-monitor.png` is left as-is (a genuine
      recorder replay, real wire frames through the real recorder — its
      own stated purpose, distinct from criterion 7's reconciliation
      check). The pre-existing y-axis label clipping (`L:40.0` ->
      `1:40.0`) is also fixed (`LEFT_PAD` 36 -> 42). **The owed notes
      clause (spec §7 criterion 9, below) is now due at the next tag —
      nothing further blocks it.** **M**
      **Task 1 review finding M1 (2026-08-20), owed to a later task:**
      `traceModel.test.ts`'s own "the line breaks across a REAL gap"
      evidence — a real capture proving a genuine >3s wire gap actually
      splits the drawn line — was REMOVED, not migrated, during Task 1's
      close-out (the only capture that had carried it,
      `pm5-session4b-final.log.gz`, concatenates four real sessions through
      one recorder, a scenario the new key-based accumulator does not
      support and cannot be used as evidence for). The gap-break behavior
      itself is unchanged and still covered by synthetic fixtures; what's
      owed is a fresh REAL-capture witness of a genuine >3s gap, the same
      evidentiary bar the rest of this module's tests hold themselves to.
      Owner: the standalone item below.
- [ ] **HARDWARE QUESTION owed to Phase LL's exit walk — DISTANCE only.**
      **CORRECTED at the 2026-08-20 PM gate: an earlier version of this item
      said the work→work reset had "never been confirmed on hardware." That
      was wrong for ELAPSED, and a walk item that overstates what is unknown
      buys an erg session to re-observe a settled fact.**
      `pm5-interface-notes.md:3268-3271` records a 2×TIME program with
      `restSeconds: 0` on both intervals where `state` stays `"rowing"`
      across the boundary and "the very next frame reset[s] `elapsed` to 0"
      — §19.1's correction at `:3290` calls it "the one and only
      elapsed-reset-while-rowing in the whole log" ([S2] D4, 2026-08-06).
      **ANSWERED 2026-08-23, from the keystone capture nobody had read
      (close-gate condition 3): DISTANCE DOES reset at a zero-rest
      work→work boundary** —
      `walk-2026-08-23/keystone-pm5-recording-1787491974452.jsonl.gz`
      seq 305→310: elapsed 69.75→0.50, distance 248.5→1.9, rowingState 1
      throughout, TWD 0→250. The feared over-report does not exist. No
      rowing owed; this box is checked by a committed file. (The original
      open question, kept for the record:) It matters: if it does not,
      the new accumulator silently OVER-reports on zero-rest boundaries —
      direction-flipped from the bug just fixed, and a shape the old
      edge-triggered code would have got right. Not exotic either:
      `program.ts:554` defaults `restSeconds: 0`, so a warm-up→work0
      transition is a zero-rest work→work boundary on essentially every
      connected session. **Probably already answered from a committed file:**
      the new accumulator is digit-identical to the shipped one on `step-3`,
      and since the shipped one detects boundaries ONLY by a backward elapsed
      jump, digit-identity across a key change is itself evidence a reset
      occurred there — check whether `step-3` contains a `restSeconds: 0`
      transition before booking any rowing. **S**
- [ ] **A replacement real-capture witness for a genuine >3 s wire gap
      breaking the trace line** — lost when three tests built on an invalid
      four-session capture were removed (PR #140). **Owner BOUND to Phase
      LL's exit walk** (PM gate, 2026-08-20): the deliverable is a CAPTURE,
      and captures come from walks, not from tasks. **UN-BOUND from the
      exit walk (close gate, 2026-08-23): the walk structurally could not
      produce it** — `adapters/monitorTransport.ts:70` composes the
      recorder on the WEB arm only, so the laptop leg had the recorder and
      no gaps and the phone leg had the gaps and no recorder. New home: a
      deliberate web-leg capture (background the Chrome tab mid-piece at
      any future lab session), or extend the recorder to the native arm
      first. Sits beside exit clause (e) so it cannot silently vanish. **S**
- [ ] **BEFORE the next tag: three owed clauses plus a version-marker
      ruling** (PM gate, round 4 of the Task 2 PR review, 2026-08-20;
      third clause added by the EST LEFT task, 2026-08-20).
      **The notes obligation** (spec §7 criterion 9, the
      pm-ledger, and a DEVIATIONS row 204 sentence all already say this —
      this is the fourth, GREPPABLE home, because the last two tags each
      shipped with a missing clause and whoever cuts v0.15.0 reads
      ROADMAP and the merge log, not the spec): the next tag's notes
      carry (1) a clause for the time axis and rest marking (the new,
      observable-to-a-tester feature), (2) a clause for the old
      corpus (§5's declination overturned at the 2026-08-20 PM gate —
      some traces recorded before this phase's fixes are silently wrong
      and cannot be told apart from correct ones), and (3) a clause for
      EST LEFT (`docs/superpowers/specs/2026-08-20-est-left-design.md`
      exit criterion 9): the connected screen's remaining-time estimate
      used to stall/read high through a rest, and no longer does — the
      rename from TOTAL LEFT shipped in the same window (PR #143) and its
      own notes clause is separate; this one is about the COUNTDOWN
      behavior, not the label. **Still open — Task 3 (the axis) landed
      2026-08-20 and the EST LEFT fix landed 2026-08-20, so this item is
      now fully armed: all three clauses' subject matter exists in
      shipped code, and whoever cuts v0.15.0 owes all three.** **Clause
      (4), added at Phase LL's close gate (2026-08-23, finding F3): the
      link-lost ending is STORED but rendered NOWHERE, and v0.17.0's
      shipped note claims the history "can tell the difference" — either
      the surface ships before the next tag and its clause says so, or
      the next tag's notes carry the honest "not yet" (the false half of
      the v0.17.0 note is struck in the same PR as this clause).**
      **Branch taken (cohort-unlock PR, 2026-08-23): the surface ships —
      `FromTheLog.tsx`'s detail header now renders `LINK LOST · the app
      lost the monitor before the end` for a stored `endedBy:
      "link-lost"` row. The v0.17.0 note's false half was already struck
      in an earlier PR (`src/news/content/releaseNotes.ts`'s v0.17.0
      entry carries the "Corrected 2026-08-23" parenthetical). The
      clause's own NOTES TEXT — the v0.20.0 entry saying the surface now
      exists — is still owed at the tag, not written here.** **New
      condition, this gate:** the phone→server trace leg must be
      WITNESSED before the tag
      that announces the trace fix ships, or the notes say plainly that
      traces are web-only today — announcing a fix for a leg nobody has
      run on a phone is its own false-completeness risk, the same shape
      as the three-clause rule itself protects against. **Version-marker
      ruling (NOT implemented here — adding a field at a merge-gate
      review is the escalate-mid-change hazard this repo's own rules
      name):** the next change that touches `series` carries a `v`
      version marker on `SeriesData`, decided before the phone→server leg
      ships. Reason: the meaning of these bytes has changed twice in six
      days with the bytes themselves unchanged (the accumulator fold,
      then the rest marker), spec §9 has a third change queued, and one
      integer per run makes era detection trivial RETROACTIVELY — absent
      `v` IS the pre-fix marker, cheap only while the corpus is one
      rower's two days old.
      **A FOURTH clause is now owed too (Phase LL, whole-branch review,
      exit criterion 10):** a lost link now says so, and a lost-link
      ending is recorded as such. Same "greppable home" reasoning as the
      other three — whoever cuts the next tag owes all four.
- [x] **BEFORE trace-truth task 3 (the time axis): its exit criterion 7 is
      currently UNSATISFIABLE on the flagship capture, and the reason is
      structural** (PM gate, 2026-08-20). Criterion 7 asks that the axis's
      values "reconcile with the session's own TIME hero in the same frame".
      On `docs/screenshots/log-monitor.png` they cannot: the chart's fastest
      pace reads ~1:38 beside a measured row reading `1:15.0`, because
      `screenshots.spec.ts:2951-2953` says outright that the fixture's
      `avgSplit`/`avgSpm` are "the fake's own scripted per-interval actuals
      (independent of the raw elapsed stream)" — the row and the trace are
      wired to disagree BY CONSTRUCTION, so the repo's own
      recompute-the-headline check returns a false RED on that screen
      forever. Four `—` rows and the crop also mean the TIME hero is not in
      frame at all. Task 3 either re-does the fixture so both numbers come
      from one path, or the criterion moves to a capture where they do.
      Recorded now so task 3 does not discover it at its own gate and fudge
      the criterion. **Also task 3's business, same captures:** the y-axis
      labels render CLIPPED (`L:40.0`, `L:50.0`) — pre-existing, shipped in
      v0.14.0, and squarely in scope since criterion 7 says labels must be
      readable. **DONE 2026-08-20 (Task 3, trace-axis PR):** the criterion
      moved to `log-detail.png` — its own fixture already derives the
      series and the `TIME` hero from the same 478s, so the axis's last
      label (`7:58`) reconciles exactly, in the same frame, with no fixture
      change needed. `log-monitor.png` was left alone (see the spec-1 entry
      above for why re-deriving it wasn't the proportionate fix). The
      y-axis clipping is fixed (`LEFT_PAD` 36 -> 42, both captures verified
      by eye). **S**
- [x] ~~**THE COUNTDOWN STALLS DURING RESTS, and the progress bar with
      it**~~ — **FIXED (Phase LL, 2026-08-20).** The hypothesis below was
      confirmed: `surfaceModel.ts`'s old `totalLeftSeconds = totalSeconds -
      frame.sessionElapsedSeconds` froze through a rest because the PM5's
      per-interval clock (what that accumulation is built from) only
      advances while `rowingActive` is true. The fix reads the field the
      machine already sends instead — `frame.restSeconds` (0x0032's own
      Rest Time, parsed since Phase 7A, consumed nowhere until now), which
      counts down in real time regardless of the flywheel. `estElapsed` is
      now every COMPLETED phase's own programmed length, summed, plus a
      LIVE term for the current one (Rest Time during a rest, the raw
      interval clock during work), clamped monotonic non-decreasing across
      frames — proven against a whole replayed capture
      (`docs/monitor/sessions/walk-2026-08-16/session-2-wu-4unequal.jsonl`),
      including the capture's own `finished` frame, where the first design
      of this fix went backwards 428.5 s from laundering a `null`
      `intervalIndex` to `0`. Spec:
      `docs/superpowers/specs/2026-08-20-est-left-design.md`. THREE
      accepted limits recorded in `docs/design/DEVIATIONS.md` (dawdling at
      the start of a work interval still runs high; an unpriced phase's
      live term is a hole, guarded on BOTH render sites of the number —
      `PaneLive.tsx`'s bar and cell and `ConnectedSurface.tsx`'s GRID
      header countdown — by the same `hasRemainingEstimate` the phone timer
      already uses; and on DISTANCE work the estimate holds still for
      seconds at each handover, measured at 6.6 s and 20.8 s on the pyramid
      capture, see the triggered follow-on for why the obvious repair does
      not work). Original hypothesis, kept for the
      record: (James, device report + two photos, 2026-08-20, rowing
      "Strong Breeze"). He saw `TOTAL LEFT` reading roughly a minute high,
      and the bar lagging when interval 4 handed over to interval 5 after
      its rest. **One likely cause for both, and it falls straight out of
      this phase's own B1 finding.** `surfaceModel.ts:970` computes
      `totalLeftSeconds = totalSeconds - frame.sessionElapsedSeconds`, and
      `totalSeconds` INCLUDES the programmed rests — but the antagonist
      pass established that the PM5's elapsed clock only advances during a
      rest while the flywheel is moving. Sit still through a rest and the
      wire's elapsed freezes, so the countdown stops ticking down while
      real time passes, and the bar's fill (driven by the same figure)
      stalls at the boundary then jumps. Strong Breeze carries 10:00 of
      rest across four rests; a ~1 min drift is the right order of
      magnitude. **HYPOTHESIS, not a finding** — testable with no hardware
      by replaying a committed rest-bearing capture and checking whether
      `sessionElapsedSeconds` flatlines through the rests. **TRIAD** (a
      number a rower reads). **M**
- [x] **Rename `TOTAL LEFT` to `EST LEFT`** (James's ruling, 2026-08-20).
      Honest for a second reason independent of the stall above: a
      DISTANCE interval's contribution to `totalSeconds` is distance ÷
      target pace, so rowing faster than target makes the session
      genuinely shorter than programmed. Copy only — rides the next PR
      touching the connected surface. **DONE 2026-08-20 (rest-scale PR):**
      `PaneLive.tsx`'s band cell label only — the header countdown's own
      `M:SS LEFT` format and the unconnected `TimerRuler`'s own `TOTAL
      LEFT` row (a different surface, `model.totalLeftDisplay` still the
      field name internally) are untouched. **S**
- [x] ~~The progress bar's segments are unevenly divided~~ — **NOT A BUG,
      settled 2026-08-20 from James's own two photos without touching the
      code.** Strong Breeze (`app/server/seed/library/tr.ts`) is 5×2:00
      work with rests of 2:00/2:00/3:00/3:00/none, so each interval's
      share of the session is 4:00/4:00/5:00/5:00/2:00 — 20% / 20% / 25% /
      25% / 10% of twenty minutes. Measured off his LIVE screenshot: 19.8%
      / 19.8% / 25.4% / 25.1% / 9.9%. The bar is proportional to work plus
      rest and the unequal rests are what make it uneven. Recorded because
      it will look wrong again to the next person who sees it.
- [x] **Detection — make the banner that already exists actually fire.** SHIPPED (Task 2, this branch): all four mechanisms + the hysteresis lifecycle.
      `1 OF 3 · READY` is structurally impossible once
      `phase === "disconnected"` (`surfaceModel.ts:787`), so its
      persistence proves the phase never moved. The app's only lost-link
      detector is the plugin's disconnect callback, fired solely from
      `didDisconnectPeripheral`; there is **no frame-silence watchdog
      anywhere**. The `LOST THE MONITOR` treatment is already designed and
      shipped (DEVIATIONS row 75) — this is not a design job, it is
      making a shipped thing reachable. **M**
- [x] **Recovery — a failed attempt no longer poisons the next one.** SHIPPED (Task 3): failure disposes (transport, driver, deviceName); the already-connected guard (F-6 only — the force-quit brick is NOT covered and remains unexplained); the memo hoist. Clause (b) — "without deleting the app" on real hardware — stays with the exit walk.
      `program()`'s catch never disconnects the transport (contrast
      `connect()`'s catch, `useMonitorSession.ts:1607`), and
      `handleTryAgain` (`ConnectedInterstitial.tsx:311-313`) reprograms
      over the same dead driver instead of reconnecting: a self-sustaining
      `LINK-FAILED` loop by construction. Includes F-6's missing
      already-connected guard — there is no `isConnected` /
      `getConnectedDevices` call anywhere, and `createTransport` builds a
      fresh transport per attempt, so a forgotten-but-live connection
      against a single-central PM5 is exactly the failure shape observed.
      **M**
- [x] **Diagnosability — move the diagnostic out from behind the door the
      bug locks.** SHIPPED (Task 1): liveness decorator both arms, timestamped ring readable from the failure screen, 0x0039/0x003A routed. `MONITOR LOG · COPY` lives on the log screen
      (`LogSession.tsx:668`), reachable only after a session finishes,
      which is downstream of the failure under study. It belongs on the
      failure and connected surfaces too. This is what made both walk
      findings evidence-poor, and it scopes any fix. **S**
- [x] **Re-reason the failed-`program()`-leaves-a-run-open item.** RESOLVED (Tasks 3+4): a failed program now disposes fully AND closes any open run with `endedBy: "program-failed"` — the parked P3b decision is superseded by construction; the terminate-then-disconnect ordering carries teardown's own chain.
      `driver.ts`'s `program()` replaces `activeRun` only after
      `sendPrepare()`/`sendSequence()`/`verifyArmed()` all resolve, so a
      throw part-way leaves the previous run open, still normalising the
      next boundary and still emitting its own `workoutComplete`. Parked
      in 7A-fix-2 Task 4's review (probe P3b) on a rationale citing a
      destructive-reject fact that §19.2 has since WITHDRAWN; the decision
      needs re-reasoning against the current record (draft in PR #70's
      body). Directly relevant: a failed `program()` is the exact event
      that started the walk's `LINK-FAILED` loop. **S**

### Explicitly OUT — with what has to be true before each is IN

Reconnect is **future work, not irrelevant** (James asked, 2026-08-20).
It is out of THIS phase because the harm observed does not require it,
because the shipped "lose and degrade" posture (design spec C5,
DEVIATIONS 75/82) was never proven broken — only never proven working, its
banner having never fired on native — and because it is the most
invention-heavy piece available: `createPm5Driver` subscribes only at
construction, has no teardown, and rebuilding a live driver
double-processes every notification. **RECONNECT PREREQUISITE from
#183's gate: the only real backward interval count in the corpus is a
CONNECT-TIME leftover register (`session-2-wu-4unequal.jsonl` AS2 seq
24→29, count 3→0) — harmless today only because no re-subscribe path
exists. A reconnect that re-subscribes with a run OPEN lets the first
post-resubscribe 0x0033 reach the continuity guard as `after` and would
convict a healthy row on the stale register; any reconnect design must
reset/quarantine `lastContinuityRef` (the count axis specifically)
across the re-subscribe.** Before reconnect is IN:

1. The research pass has answered the buy-vs-build question and the
   PM5's does-it-exist question.
2. **The fake models handle invalidation.** **Merge this with Phase RC's
   RC-8** (the fake's five contradictions of the real wire, including the
   `intervalRestTimeSeconds: 0` hardcode at `fake.ts:878`) — they are one
   piece of fake work and specced apart they get done twice. Today it
   cannot prove a
   reconnect works — see the quoted prior art above — so reconnect tests
   would be theatre. This is a real work item and it lands first.
3. Detection ships, so we have seen what "lose and degrade" actually
   feels like on hardware before deciding to replace it.

Also OUT, and each for a stated reason: **MISSED-rows inheritance**
(DEVIATIONS 82 — they exist only to catch what a reconnect BACKFILL fails
to fill; no backfill, no MISSED); **background scan** and
**`DiscoveredMonitor.rssi`** (convenience, not the defect); and **any
`RECONNECTING` copy** (DEVIATIONS row 75 made that ruling once; do not
un-make it before the thing it promises exists).

### Spec inputs from the 2026-08-21 ecosystem review

Not a second research pass — the pass already reported (BUY NOTHING;
diagnosability → detection → recovery). These are inputs shaped against
that sequence, from the review that also opened Phase RC above. Two of
Phase RC's blockers are LL's to fix, because both are link-caused.

**A-2 (detection/recovery tier) — hold the radio past the terminal frame
until the machine says it logged the piece.** We disconnect **21.7, 24.1,
30.6 and 107.3 ms** after the terminal 0x0031 on the four natural
finishes we have bytes for, and the `disconnect` line is written after
`await inner.disconnect()`, so real teardown began earlier. Keep the link
up after `ended` until whichever comes first: a 0x0031 reporting state
12, a 0x0039 arrival, or a bounded outer clock above 3.5 s.
`parse.ts:431` already maps state 12 to `"finished"` and the driver
already holds `raw.workoutState` in the finish path, so this is a read,
not a parser change. Ship the wall clock as a live fallback and log which
path fired — state 12 is an unobserved wire premise. **The real tension
the spec must resolve:** `ConnectedSurface.tsx:60-63` deliberately
refuses to hold a GATT link across iOS backgrounding.
**Also correct the premise the whole finish design rests on:**
`ConnectedSurface.tsx:52-55` says the final split arrives "~1 ms AFTER"
the frame that ends the workout, from one walk-day-2 observation.
Measured across four captures: **-179.9, +90.2, -89.7, +7.6 ms.** The
sign varies; in two of four the split arrives FIRST, the hand-off hold
never opens, and `FINISH_HANDOFF_HOLD_MS = 3500` buys nothing.

**A-4 (detection tier) — four mechanisms produce the same silent short
row, and only one is covered today.**

- **A Bluetooth power-cycle delivers no per-device callback.** Apple: all
  `CBPeripheral` objects "become invalid; you must retrieve or discover
  these peripherals again". The plugin's `.poweredOff` arm
  (`DeviceManager.swift:53-56`) runs `stopScan()` and
  `emitState(enabled: false)` and resolves no per-device key. The signal
  that IS emitted, `onEnabledChanged`, we never subscribe to. (That the
  per-device callback never fires is INFERENCE — Apple documents it
  neither way. Tag it so in the spec.)
- **iOS backgrounding, and nobody had checked.** `Info.plist` declares no
  `UIBackgroundModes` at all and the monitor stack registers no
  app-lifecycle listener anywhere. **An incoming call mid-piece produces
  the reported failure with no radio fault whatsoever.** This also
  falsifies the third clause of `types.ts:429-433`.
- **A single characteristic's subscribe rejection** calls `disconnectCb`
  while every other subscription keeps delivering
  (`capacitorBle.ts:430-448`) — a `disconnected` phase with an intact
  frame stream, which then freezes the series recorder for the rest of
  the session (197 of 419 samples lost on replay, `truncated` false, the
  stored heroes unchanged).
- **A genuine drop inside the `callerInitiatedDisconnect` window** is
  swallowed as housekeeping (`capacitorBle.ts:227-238`).

What to build, in the phase's own sequence: subscribe
`startEnabledNotifications` (cheapest, and it covers James's exact
reported trigger); add a status-arrival watchdog at the transport seam
keyed on 0x0031 only, threshold **2500 ms — about 3x our worst recorded
web gap (810 ms) and about 25x the native 100 ms cadence, and the
constant's comment should say BOTH numbers**. **CORRECTED 2026-08-22
(Phase LL anchor pass): the "25x native 100 ms cadence" half is FALSE.**
100 ms is a REQUEST the record already shows is not honoured —
`liveness.ts:121-127` measured ~508 ms mean delivered on web once the
sample-rate write is sent (the write itself is fire-and-forget and its
outcome is swallowed); native's own inter-frame gap distribution is
UNMEASURED (spec exit criterion 9a, a walk deliverable). The shipped
comment states the measured web margin (3.09x, 810.3 ms worst of 3,442
gaps) and says native is unmeasured — it does not carry a native cadence
number, because there isn't one to carry. Give it a DISARM rule for
workout states 10/11 and the finish hand-off window or it fires across
every normal finish and races the boundary the hold protects; drive a
`stale` link axis that recovers on the next valid frame rather than
faking a disconnect; and route an interrupted close through a distinct
reason code. **Today a link death and a rower stopping early are both
`terminated: true`, and the server row carries neither flag.**

**Before any recovery lands it needs a continuity rule.** RowTracer's
`pm5web/transport.js:117-129` `pm5Continuity(before, after)` returns
`"reset"` if elapsed went back more than 2 s, distance more than 5 m, or
stroke count dropped, and `:319-333` preserves the interrupted capture
and starts a clean one rather than merging — "Never merged silently."
**MIT, so legally borrowable**, unlike ORM and qdomyos-zwift. A resumed
stream folding into a stale register map is exactly the defect this phase
was opened to prevent.

**Diagnosability tier, three concrete gaps.** (1) There is no diagnostics
seam on native at all: `adapters/monitorTransport.ts:49-56` returns
`createCapacitorBleTransport()` raw, so byte capture is structurally
impossible on the platform that produces every real row, and there is
nowhere to hang the watchdog. **Build two decorators, not one** — a
production-safe liveness/probe decorator on both arms, and the recorder
kept behind its build-time constant; a single `withDiagnostics` wrapper
would ship the recorder's whole module graph into production (recurring
failure 12). (2) The ring records decisions and almost no numbers, has no
time axis, and dies with the tab; on native it IS the record.
(3) 0x0039 and 0x003A bypass `mergeStatus` entirely (direct `t.subscribe`
at `driver.ts:3649/3653`) so even their hex would never reach the ring,
and 0x003A's callback takes no `bytes` parameter at all. One-line fix,
and it is the precondition for ever settling the summary premises.

**Two corrections to this phase's own record**, both caught by the
review's verification pass:

- **The retry path's diagnosis was wrong.** The walk README said
  `connect()`'s catch clears `driverRef`; it does not. The only two
  `driverRef.current = null` sites are `cancel()` (`:1406`) and teardown
  (`:1694`). `ConnectedInterstitial.tsx:299-309` reads a stale local and
  says so in its own comment. **There is no existing discipline to copy;
  the fix must be specified from scratch.**
- **Do not inherit a loss estimate for the 0x0031-before-0x0033 skew.**
  It has only ever been measured at 2 Hz (median 2-11 ms, p99 ~180 ms,
  max 361 ms, quantised in ~90 ms steps that look like connection-event
  scheduling). The misattribution window is wall-clock skew, not frame
  count, so the primary platform's ~10 Hz is neutral-to-better. Measure
  it; drop the estimate.

**One cheap fix with an invariant behind it:** every connect attempt
constructs a new `CBCentralManager` while the plugin reuses the old
`Device` object with its callback map intact. Our half is one line —
hoist the `initialize()` memo to module scope in `capacitorBle.ts` —
restoring an invariant that file's own comment already claims holds.
Verified safe; nothing depends on re-initialisation. The harm is still
unproven and it still does not explain the force-quit survival.

**Three execution facts inherited from Phase WU (2026-08-22), each of
which bites this phase.** Full text in Phase WU's "What this phase taught":

1. **`app/e2e/` is NOT typechecked.** `tsconfig.app.json` covers only
   `src`/`domain`/`scripts` and Playwright erases types, so a stale call
   signature compiles and runs silently; a hand-rolled config over `e2e/`
   surfaces 14 pre-existing errors. This phase's diagnosability tier is the
   natural owner if it wants to fix it, and either way no LL brief may
   claim "the compiler will catch it" about anything under `e2e/`.
2. **pnpm swallows scoped-run flags in BOTH suites.** `pnpm e2e -- -g` runs
   all 401 tests even double-dashed, and `pnpm test --project client --
   <pattern>` does the same for vitest. Working forms:
   `pnpm exec playwright test --grep` and `pnpm exec vitest run`. **Check
   the run count** — a full-suite count means the filter was eaten.
   **SHARPENED at Phase LL's final re-review (2026-08-22): the "working
   form" is itself unsafe for SINGLE FILES** — `pnpm exec vitest run
   --project client <file>` runs the file OUTSIDE its jsdom environment in
   this workspace (`localStorage` undefined, 89 false failures against a
   green HEAD). Only the full-project run is trustworthy for client-env
   files; a single-file red must be reproduced at project scope before
   anyone "fixes" it.
3. **A dispatched subagent's background waits die when it idles.** Every
   implementer brief must say gates run FOREGROUND and blocking; four
   rounds were lost to armed monitors that could never wake.

**THE PHASE'S WALK CARD (Task 5, 2026-08-22)** — five questions plus one
deliverable, each stated so the walk can go red:

- **W5** — Bluetooth power-cycle, armed but not rowing: does
  `didDisconnectPeripheral` fire for our device (INFERENCE either way —
  Apple documents only connect/cancel), and does the now-subscribed
  `onEnabledChanged` catch it as designed?
- **W6** — background the app 30 s mid-piece: does a backlog of BLE events
  drain on resume (Apple documents queuing; depth unknown), and does the
  continuity guard pass the healthy resume (its corpus-derived bound says
  it must)?
- **W7** — navigate the PM5's own menu mid-session: does the wire go
  quiet? If yes, that is a legitimate quiet period the watchdog's disarm
  list does not cover and the 2500 ms threshold fires falsely — the one
  disarm unknown the corpus cannot answer. (Stays on the PHONE leg of
  Phase RC's combined walk — RC's own distance-shaped item was renamed
  W10 to stop the collision; see Phase RC's walk card, spec §6.)
- **W8** — leave an armed/live session untouched: does the PM5 ever emit
  TERMINATE on its own (an inactivity timeout)? `endedBy: "rower"` on the
  TERMINATE path asserts agency on the machine's behalf if it does.
- **W9** — `getConnectedDevices` may be SYSTEM-scoped: a phone where
  ErgData holds a DIFFERENT PM5 could be offered the wrong erg with no
  picker. One tap at the walk settles it.
- **9a (deliverable)** — the native inter-frame gap distribution from the
  liveness decorator's own snapshot, read off the ring on a real phone:
  the corpus's web-only numbers (worst 810.3 ms) are necessary, not
  sufficient, for the 2500 ms threshold on the platform it exists for.
- **Capture ask that costs nothing extra:** the ring now survives to the
  failure screen — if the row-to-resume FLASH (§2b, mechanism unexplained,
  corpus hypothesis falsified) appears during any piece, copy the
  connection log immediately after; the timestamped frames around that
  moment name the real mechanism.
- **WARNING — watch for false banners specifically:** a spurious watchdog
  fire plus End inside the 10 s hysteresis stores `endedBy: "link-lost"`
  on a healthy row. The threshold is web-derived (2500 ms); native is
  unmeasured (see 9a). A false LOST banner during the walk is itself a
  finding, not just an inconvenience to work around.
- **The negative result is committed, not just reported:** a regression
  test (`useMonitorSession.test.ts`, "Phase LL minor 3") replays all 6
  corpus captures through the real `nextFreezeRun`/`isPausedRun` and pins
  zero PAUSED firings at any post-rest work-interval start, so a future
  change to the guard cannot silently reopen the falsified mechanism
  without a red test naming it.

**WALKED 2026-08-23 — record: `docs/monitor/sessions/walk-2026-08-23/`.**
Clauses (a) both variants, (c), (d) PASS; (b) SPLIT at the gate
(2026-08-23 PM close): its destructive-workaround half — "without deleting
the app" — is DISCHARGED (Cancel → Connect recovers; the brick is dead);
its "Try Again reaches a fresh connect" half is NOT MET (F1: the button is
dead after a mid-session BT-off). No compound clause absorbs a failing
half into a passing one; (e)
carried by the shipped suites plus finding F2's counterexample. W5
off-direction ✓ (on-direction is F1); W6 ✓ with F2; W7 dissolved (PM5 Menu
mid-workout TERMINATES — state 11 on the wire — no quiet period exists, no
disarm needed); W8 unobserved (longest armed idle ~90 s, low priority); W9
guard ran clean every attempt (cross-app scenario untestable); 9a partial
(web cadence measured — median 990 ms, worst 1260 ms, corpus-worst 810.3 ms
does NOT bound it; watchdog margin ~2.0× today, no false fire; native
per-frame distribution still unmeasured); §2b flash not observed. **The
walk's three findings, filed as LL follow-ups:**

- **F1 (medium) — Try again never revives after a MID-SESSION BT-off.
  ROOT CAUSE CORRECTED at the cohort-unlock spec's own review (2026-08-23):
  the filed "the failure disposal tears down the per-session
  `onEnabledChanged` listener, so the enabled-true event has no ear" is
  FALSE — `canRetry` never reads enabled state, so a torn-down listener was
  never in the causal chain.** True mechanism (three compounding defects,
  all fixed by the cohort-unlock PR): `canRetry` was `phase === "failed"`
  only, so the disconnected-no-run branch rendered Try again disabled by
  construction; the disconnected event handler never disposed the driver,
  so even an enabled button's `connect()` silently no-op'd against a
  `driverRef` still holding the dead driver; and once both of those were
  fixed, the retry connected but never re-programmed, because
  `programmedForDeviceRef` only resets when `deviceName` goes `null` and
  the disconnected disposal deliberately preserves it (the LOST header
  needs it) — caught by a fake-driven walk test before merge. See the
  ticked item above for the fix. Cancel → Connect works and was the only
  live escape hatch before this PR.
- **F2 (SERIOUS, TRIAD-weight — it closes records) — the continuity guard
  convicts on a NON-MONOTONIC key. ROOT CAUSE CORRECTED at the close gate
  (2026-08-23): the filed "iOS resume produced a transient zeroed-TWD
  frame" is FALSE and the walk's own files disprove it.** The day's TWD
  readings: keystone (web) 0 across an entire 248.5 m interval then 250
  after the boundary; ring-3 0 at 94.6 m and 0 at 33.1 m (with its own
  `divergence` entry); ring-2 0 at 83.3 m post-resume — **five zeros
  against ring-2's single 81 at 56.1 s. Zero is the field's normal
  behaviour that day; the 81 is the outlier, and nothing here is
  iOS-specific** (the web capture shows the same zeros). The convicting
  frame had elapsed AND distance advancing while TWD went 81 → 0 — a real
  monitor reset zeroes all three. A successor spec that inherits the "iOS
  was outside the corpus" wording will special-case iOS and leave the web
  path broken. Fix is SPLIT: F2a (defuse via corroboration, Phase RC
  before RC-1) and F2b (re-key, inside RC-1/RC-8).
  `ring-phone-2-background-continuity-kill.json` is the capture.
  **F2a defuse SHIPPED (PR #174); F2b SHIPPED (PR 3, storage-spine spec
  §4, inside RC-1's ROADMAP row but not RC-1's own PR #182's diff) — the
  blind window closes on multi-interval programs past interval 1.
  Residual, honestly stated: interval 1 of every program and every
  1-interval program remain F2a-only (the count reads 0 there on any
  program, inert by construction); the count bound's true-positive
  evidence is SYNTHETIC-ONLY — no committed capture contains an
  interruption episode to convict on.**
- **F3 (small UI) — RESOLVED in the cohort-unlock PR (2026-08-23):**
  the log detail now renders `LINK LOST · the app lost the monitor
  before the end` for `endedBy: "link-lost"` sessions (FromTheLog.tsx;
  the GET had carried the field since #160). The v0.20.0 notes clause
  remains owed at the tag (the owed-clauses item tracks it).
- **F4 (tiny, deferred — evidence-capture gap only, not a merge blocker) —
  the `disconnected` event handler records no liveness-snapshot where
  `fail()` does.** Filed at the cohort-unlock PR's final review
  (2026-08-23): `fail()` writes one to the ring because Phase LL exit
  criterion 7 is about FAILURE; a raw link drop correctly writes no
  `ConnectedError` and so takes no snapshot either — but that means a
  disconnected-branch retry's own ring has one fewer data point than a
  failed-branch one for a future walk to read. No known stale-attachment
  risk today (the review traced `livenessRef`'s only consumer, `fail()`,
  and it is unreachable from the disconnected-no-run path). Worth a
  snapshot call for the next hardware walk's diagnosability, not urgent.

**Exit — written so it can go red.** Clause (e) added 2026-08-20 at the PM
gate's finding that four of this phase's items had no exit clause; the
trace-truth spec carries its own nine criteria and (e) is the phase-level
hook to them. On a real PM5 and a real phone, on a Release build: (a) a link killed BEFORE stroke one, and again MID-PIECE,
moves the surface off `READY`/live numbers within a stated bound and says
the link is lost; (b) Try Again reaches a fresh connect and programs
successfully **without deleting the app**; (c) the full diagnostics ring
for the episode is retrievable from the phone, from the failure screen
itself; (d) if the delete-to-fix residue turns out to be iOS-side and
unfixable, DEVIATIONS carries the row saying so and the recovery path is
documented and non-destructive; **(e)** a trace recorded across a gap that
spans an interval boundary is short by zero, rests are visibly marked as
rests, and the chart carries a time axis that reconciles with the
session's own TIME hero in the same frame.

**Sequencing (PM gate):** LT close → **LL** → CL2 → LQ → PROD. LL
displaces CL2, which is two items whose gap has a stated workaround (the
`xN` grammar already parses via import, `bulk.ts:268`). **LL is a PROD
precondition** — PROD's exit, an empty-phone install reaching a logged row
unaided, is unreachable while a link drop bricks the app.

**Release posture (PM gate, 2026-08-20):** v0.14.0 carries this defect but
does not own it — `git diff --stat v0.13.0 v0.14.0 --
app/src/monitor/transports/ app/src/adapters/` is empty and the native BLE
arm is unchanged since v0.10.0, so a rollback ships the same bug minus
five notes clauses. Not pulled. **But the delete-and-reinstall workaround
is DESTRUCTIVE** — it wipes `ergomatic.monitorRun`, `ergomatic.sessionRun`
and `ergomatic.sessionDraft`, costing an unlogged session and any
in-progress draft. **The original hold ("until criterion (b) exists") is
DISCHARGED (close gate, 2026-08-23): the destructive workaround is dead —
Cancel → Connect recovers without deletion. The cohort stays at ONE TESTER
on a NEW condition with its own discharge test: F2a is merged (PR #174,
the continuity guard no longer convicts on a single uncorroborated TWD
reading — a tester must not silently lose a measured row), AND either F1
is fixed or the tester note carries "if Try again does nothing, tap
Cancel then Connect". **F1 fixed (this PR, cohort-unlock, 2026-08-23) —
the second arm's disjunction resolves to the fixed branch; the cohort
note's fallback wording is no longer needed.**
