> **Archived 2026-08-28** from `ROADMAP.md` (lines 7001-7312 of the
> pre-rebalance file, main `39e9430`). **This section was still LIVE when it
> was archived.** PR 1 shipped as #198 / v0.24.0. Everything still owed became Wave F, including the stored-row analysis this body carries.
>
> It is kept verbatim so no detail is lost, and it is a RECORD: the work is
> maintained in `ROADMAP.md`'s live slate, not here. Do not work from this file.

## Phase LM — When the monitor is lost, say so and stop lying about it

**Opened 2026-08-25**, straight out of the walk that reproduced a tester's
report first try (`docs/monitor/sessions/walk-2026-08-25/`, finding W-10).
Scoped by James to all three defects together after he was shown the frame:
*"the LOST isn't easy to notice, i think we need to highlight that more."*

**What happened. CORRECTED 2026-08-25 by the antagonist anchor pass — the
first diagnosis was wrong and the corrected one is narrower and sharper.** A
tester connected, programmed a workout, tapped "Show me the numbers", locked
the phone and pocketed it, rowed, then hit End, and concluded the recording was
lost. It was never STARTED. The app opens a record only when it sees the first
pull — `createMonitorRun` has one call site (`useMonitorSession.ts:1681`) inside
the `phase === "ready"` gate — so locking before that pull leaves the phase in
`ready` forever, creates no record, and gives End nothing to close
(`closeRecord:1477` returns on `run === null`). The file's own comment at
`useMonitorSession.ts:988-990` describes this verbatim, and **this ROADMAP
already recorded the mechanism at `:3271` from James's own 2026-08-24 tester
report** — the phase was opened without reading it.

The row then saves through the MANUAL door (`monitorModeRun` null →
`LogSession.tsx:1578`), whose POST carries neither `deviceName` nor `endedBy`,
so the stored row reads **LOGGED BY HAND** — which is exactly what a vanished
recording looks like from the outside.

**The three defects, which are one story.**

1. **The screen looks like a session in progress when it is not.** The panes
   paint live-LOOKING numbers off fall-through frames while the phase is still
   `ready`, and the only contrary signal is `· LOST` in small mono text beside
   the erg's serial. James asked for that to be louder, and he was right for a
   sharper reason than he was given: those numbers are not stale readings, they
   were never readings at all.
2. **The banner promises something false.** "Row on. The erg is still counting
   and End keeps what we saw" is true whenever we saw anything, and a lie in
   the one case that costs a workout — where we saw nothing. Copy that is
   reassuring in proportion to how bad the situation is.
3. **The saved row poses as hand-logged.** The rower rowed and we did not hear
   them; neither of those is "logged by hand". **But the fix is NOT a
   `LINK LOST` source label** (anchor pass, and this was revision 1's biggest
   hole): `sourceLabel` answers "where did these numbers come from" while
   `endedBy` answers "how did this close", and they agree only on the
   zero-measured case. On a link dropping after 3 of 4 intervals, a `LINK LOST`
   source would stamp failure over genuinely PM5-measured rows and delete the
   one signal saying they came off the machine — the mirror shape in display
   clothing. `LINK_LOST_LINE` (`storedSummary.ts:874`) already carries the close
   reason for rows that have data.

**TRIAD weight** — defect 3 changes what a stored row claims about itself, so
this gets the full antagonist pass on its spec and a PM final-PR gate,
regardless of how small the diff turns out to be. Note the stored row currently
has `ended_by = NULL` (the manual door never posts it), so fixing the STORED
record — not just the live screen — is a write-path change, and the spec makes
the PR say which of the two it did.

**The research was ALREADY DONE and is not owed again** — this is the second
correction the anchor pass forced. `docs/superpowers/research/2026-08-20-ble-connection-management.md`
plus James's ruling at `:2095-2130` settle it: **"The recommendation is CORRECT
RESUME, not a background mode."** The obstacle is WebKit's WebContent
throttler, whose runnable set is *visible, audible, capturing*, and **nothing in
that chain reads `UIBackgroundModes`** — so a background mode buys "the link
stays up" and never "we keep logging the row". Keep-awake is likewise already
done (`ConnectedInterstitial.tsx:283`, spanning the whole connected flow since
2026-08-11), so this was a MANUAL lock and no wake-lock work would have helped.
**PR 2 is correct resume.** Any proposal for `UIBackgroundModes` is re-opening a
closed ruling and needs James, not a research pass.

**What is genuinely unknown** and must not be asserted in any copy or PR body:
whether the zero came from frames never arriving (WebKit suspended) or frames
arriving and the ready gate refusing them (it needs `rowingActive` AND
increasing distance). `pm5-interface-notes.md:4663` records a 15-20 s lock NOT
dropping the link, with the session resuming ticking on unlock — so the platform
explanation is not even complete. PR 1's Task 1 instruments this rather than
guessing, because PR 2's shape depends on the answer.

**Three open questions, ANSWERED 2026-08-25 as PR 1 was built** (this list
documented current state and had gone stale):

- *Should a zero-measured connected session offer "Log against plan" at all?*
  **Yes, and undemoted** — James's ruling: the rower did the work, only our
  recording failed. All three exits stay, `Log against plan` leads. Pinned by
  a test in `LogSession.test.tsx`, not left to the shared component's defaults.
- *Should the rower be warned BEFORE locking rather than after?* **Yes** —
  PR 1's ready-screen warning (spec Task 2).
- *Should a lost link mid-piece be recoverable by reconnecting?* Still **PR 2**
  (correct resume). Unchanged.

**Status: PR 1 walked and ready to merge (2026-08-26).** The re-walk passed
leg A with zero spurious latches, counted from a committed ring
(`docs/monitor/sessions/walk-2026-08-26b/`). Criterion 9 is CLOSED BY RULING,
not met — James cancelled the probe on incidental evidence, and it closed the
control arm only. Criterion 10's leg B was SUBSTITUTED by a 98 s background
rather than a deliberate lock. **Nothing else in this phase is complete on
merge:** PR 2 (correct resume) and three owed rows below remain.

### Phase LM — owed work

Checkboxes, because this section ran 140 lines with none, and its own defect had
to be filed into Phase RC's backlog for want of a home here. Caught at #198's PM
gate.

- [ ] **Lifecycle transitions are REPLAY-ONLY, never captured live — and both
      ends would have to move before that changes.** Filed by fix-round-2
      Task 4, which added the `lifecycle` member to `RecordedEvent` and taught
      `transports/replay.ts` to emit it. Live capture was considered and
      rejected on evidence, not taste: the recording tap is reachable only from
      `transports/index.ts`'s `fakeMonitorEnabled`-gated WEB arm, and
      `adapters/monitorTransport.ts`'s `isNative()` branch takes native
      straight to Capacitor BLE without passing through it — so the recorder
      exists only where `adapters/appLifecycle.ts`'s web arm is a deliberate
      no-op (Phase LL minor 9) and never calls back. A live recorder would be
      an instrument wired to a surface with no signal on it. **Revisit when
      either end moves**: a recorder composed on the native arm, or a web arm
      that reports transitions again. Until then a synthesised transition
      drives the same production handler through the same seam, which is what
      the gate needs — see `lifecycleReplay.test.ts`.
- [ ] **THE PRE-ROW LOCK — a whole piece rowed and nothing kept. REPRODUCED
      ON HARDWARE 2026-08-28, still unfixed, and filed here (not in RC) at
      the RC close gate because it is a lifecycle defect, not a
      number-meaning one.**
      Connect, program, tap "show me the numbers", lock the phone BEFORE the
      first pull, row, unlock. The app is still `phase=ready`, has opened no
      record, and End silently discards the row — the never-rowed path has
      no save door.
      **The evidence, from `docs/monitor/sessions/walk-2026-08-28/README.md`
      (leg 4, iPhone, v0.25.0 build 759, PRODUCTION):**
      ```
      app-lifecycle   resume gap=27886ms  silent=true latched=true
      resume-frames   phase=ready  framesWhileHidden=1  rowingActive=false
      twd-sample      machineTotal=52m at elapsed=24.71s distance=52.6m workoutState=4
      ```
      The machine had him 24.7 s and 52.6 m into interval 1 while we sat at
      `ready`. **This is a tester's own report, reproduced to the frame** —
      the same report Phase LM opened on, whose walk item Phase RC had been
      carrying as owed and is now discharged (RC's pocketed-phone item).
      **Deliberately NOT claimed in v0.26.0's notes**, because it is not
      fixed.
      **RC-37 does NOT cover it.** RC-37 catches the OTHER case the same leg
      found — a long background where the erg drops the program — and returns
      the rower to the workout screen. This case has the program intact and
      the machine rowing; nothing tells us so.
      **Three siblings from the same leg, same window, same root:** a
      `pause-declared … d=64.2 split=297.56 spm=66` while he was rowing (the
      freeze predicate calling a pause, and the source of the 4:57.6 split
      and 66 spm James asked about — wire readings from the confused
      post-unlock window, not our arithmetic); TWD going non-monotonic
      52 -> 0 -> 64 m across three samples; and `rowing-active-fallback`
      firing, so `rowingActive` was stuck false throughout.
      **Recurring failure 19 is the frame to design in:** the trigger enters
      ABOVE the transport seam, so every instrument we own is blind to it
      unless the fix builds one. `RecordedEvent`'s `lifecycle` member and
      `transports/replay.ts`'s lifecycle emission exist for exactly this and
      are the starting ground. **M**
- [ ] **LM PR 2 — correct resume**, per James's 2026-08-20 ruling ("CORRECT
      RESUME, not a background mode"). **UNBLOCKED 2026-08-26 — and it was
      blocked on an event that will never happen.** This row used to read "do
      not start before the probe reports"; James CANCELLED the probe, so the
      probe will never report. What the cancellation gathered instead:
      `framesWhileHidden=2` on both real backgrounds, i.e. a genuine background
      delivers almost nothing, which is the input correct resume has to assume.
      Start from that.
- [ ] **The stored row still reads `LOGGED BY HAND` for a connected session
      that opened no record — permanently and unbackfillably, for that row and
      every earlier one.** PR 1 took option 2 knowingly. **This is a knowing
      exception to James's 2026-08-18 ruling that the same fact must not read as
      two different words live versus from the log**, and the strongest argument
      against option 2 is that the divergence is PERMANENT — so it gets a
      trigger, not merely a record. **Trigger: the `door` column lands with the
      NEXT stored-shape change to the logs table.** The argument that settles
      the original call, worth reusing: a row that UNDER-claims is a recoverable
      false negative, while a row posting a best-effort last-used `deviceName`
      over a session that measured nothing is a false positive indistinguishable
      from a real measurement, and would poison the very audit that counts how
      often this fires.
- [ ] **The in-flight interval's metres are DISCARDED on a mid-row link loss,
      and `Nothing kept.` is honestly reporting it.** Filed at #198's PM gate,
      which checked rather than accepting the "cosmetic" label:
      `measuredIntervalCount` counts COMPLETED intervals, `closeRecord` records
      no partial, tier-B heroes need actuals. **On a SINGLE-interval workout —
      the tester's own 2000 m "Beam Sea" — any mid-row loss gives `kept = 0`
      beside a nonzero greyed counter.** That is not an oddity to note on walk
      leg B; it is the MAJORITY outcome of leg B. Say explicitly whether PR 2's
      correct resume recovers those metres; if not, that is a product decision,
      not an implementation detail.
- [x] **The diagnostics row never renders on a device's FIRST EVER
      connected session, and no hardware walk can catch it.** FIXED by
      fix-round-2 Task 3: `MonitorLogRow` now re-reads the stash once in a
      post-mount effect, which React runs AFTER the outgoing subtree's
      passive cleanup in the same commit, so the teardown's write is seen
      without a remount. The connected-arrival gate is unchanged (the
      re-read goes through the same `readMonitorLogStash(fromMonitor)`), and
      a session that already had a stash at mount renders exactly as before.
      Pinned by two tests that drive the REAL navigation ordering rather
      than seeding storage and mounting: a first-ever-device hand-off that
      must show and copy the row, and a by-hand arrival that must still show
      nothing when a teardown writes while it is on screen. **The
      walk-protocol trap below still stands** — a walk on a much-connected
      phone would have passed either way, so the ordering test is the only
      thing that proves this, and any walk card claiming to exercise the
      never-rowed readout must still say which device state it ran on.
      (Was RC-20; re-homed to Phase LM at #198's PM gate — it is Phase LM's own component, found by Phase LM's own fix round.) Found by Phase
      LM's fix round, verified independently at its re-review, and filed rather
      than fixed at the time because it was pre-existing (shipped by Task 1) and
      narrower than the PR that found it. **The mechanism, kept because it is the
      class rather than the instance:** `MonitorLogRow` read the stash in a
      `useState` LAZY INITIALIZER only — no effect, no storage listener, no
      re-read — while `useMonitorSession`'s `teardown` is a passive `useEffect`
      cleanup, and React runs the new route's render BEFORE the outgoing
      subtree's passive cleanup. So on a genuine first-ever connected session
      there was no prior entry at mount, the row rendered `null`, and it never
      got a second chance; Task 1's promise (diagnostics reachable on a phone in
      the never-rowed case) held only from the SECOND connected session onward.
      **A test that seeds storage and then mounts cannot see this** — it
      exercises the already-working path, which is why every unit test was green.
      **The walk-protocol trap is the important half, and it is why this got
      its own row rather than a line in a PR body:** every walk this project
      runs happens on a phone that has connected dozens of times, so **a walk
      will PASS while a brand-new tester gets nothing.** Validating this case
      needs a factory-reset-equivalent device state, not merely "has not rowed
      this session". That is the same verify-the-app-against-itself shape as
      recurring failure #11. Any walk card claiming to exercise the
      never-rowed readout must say which device state it ran on.
- [ ] **`rowingActive` is falsified but not dangerous — one test and one
      diagnostic are owed, no behaviour change.** Walk 2026-08-26 read
      0x0031's byte 9 `false` on every frame of a real row (§20 fact 13,
      corrected). Task 2 enumerated all six production consumers; **four need
      nothing at all**, and the two that carry the predicate are:
      - **The ready gate's fallback works and is pinned.** It is the only
        consumer where a stuck byte can lose data, and it already carries
        `ROWING_ACTIVE_FALLBACK_FRAMES`. Deleting `frame.rowingActive` from
        `declared` (`useMonitorSession.ts:1747`) fails three tests. **Stated
        cost, accepted:** the fallback opens the record ~5 frames late, so
        that walk's record opened at the machine's own `elapsed=24.03 /
        distance=32.9` and `seriesRecorder` missed the row's first metres.
        The stored per-interval actuals come from 0x0037/0x0038 and are
        unaffected.
      - **`surfaceModel.ts:915`'s `midSessionMirror` conjunct is UNPINNED, and
        this is the actual owed work.** MEASURED, not inferred: deleting
        `frame.rowingActive === false` from that predicate leaves **5357 tests
        and 191 test files green**. Its own guard test says in a comment that
        it isolates the DISTANCE half; nothing isolates the other half. The
        degeneration is cosmetic — the predicate widens to distance-only, so
        the heroes read `0:00.0 / 0` for the first metre of an interval
        instead of clearing on the first pull, self-clearing in ~1 stroke —
        which is why **no behaviour change is proposed**. Owed: one test that
        pins the byte half (a `rowingActive: true` frame inside the reset
        window must NOT mirror), and a reconciled comment.
      - **Owed diagnostic, and it is the thing that would settle the
        question:** the ring stores only the decoded boolean, and
        `pm5/parse.ts:608` is a strict `rowingState === 1`, so any non-1 value
        reads `false`. Raw `0x0031` ring lines fire on terminal states only.
        **The next occurrence still will not tell us whether the machine said
        Inactive or said something we do not decode.** Carry the raw byte in
        the `frame` / `rowing-active-fallback` entries, or require a
        `.jsonl.gz` recording on any walk re-testing this.
      - **Not owed, stated so it is not re-derived:** `parse.ts:608` is the
        producer; the three log entries (`driver.ts:2517`,
        `useMonitorSession.ts:1768`, `:2868`) are diagnostics with no
        behaviour attached; `surfaceModel.ts:312`'s `NO_FRAME` is a constant.
        `seriesRecorder.ts` never reads the field, so **no stored data depends
        on this byte**.

**OWED, and deliberately not built in PR 1: the STORED row for a
never-started connected session is still wrong.** PR 1 took the design
spec's Task 4 **option 2** — fix the live screen, leave the stored row —
and this is the record of what that costs and of the analysis the next
attempt should start from rather than redo.

- **What ships in PR 1:** the end-of-session summary for a `?from=monitor`
  arrival with NO record reads `NO MONITOR READING` in the SOURCE slot instead of
  `LOGGED BY HAND`, and takes the workout's own target hint instead of
  `BY FEEL`. The predicate is deliberately narrow — `from=monitor` AND no
  record in storage at all — because the other three `monitorModeRun` miss
  conditions leave a record that may hold real PM5 readings we simply cannot
  render, and claiming "no reading" over those would not be earned.
- **What stays wrong:** the saved row keeps reading `LOGGED BY HAND` on the
  history screen, permanently and unbackfillably, for this row and every
  earlier one. It is not wrong about its NUMBERS (`TARGETS ONLY · NOTHING
  MEASURED` is exactly true); it is wrong about the DOOR. The live screen and
  the stored screen therefore disagree for this one case, which is a knowing
  exception to the 2026-08-18 copy ruling that the same fact must not read as
  two different words live versus from the log (`storedSummary.ts`'s SOURCE
  INFERENCE header carries the exception, at the place the ruling lives).
- **Why not option 1, and what a future attempt must not re-derive.** Making
  the stored row honest needs a NEW stored field plus a migration; neither
  existing candidate works. `endedBy` would assert a close reason for a record
  that never existed (a sixth enum value, and `buildLinkLostLine`'s deliberate
  equality check would render it invisibly anyway); `deviceName` IS reachable
  (`loadLastDevice()`, `ConnectedInterstitial.tsx:57`, written on every pair at
  `:321` — the "unknowable" claim was itself false and is corrected here), but
  it is a best-effort LAST-USED name rather than this session's authoritative
  device, and posting it would make the stored row assert that a named erg
  supplied numbers that came off nothing — a STRONGER false claim than
  `LOGGED BY HAND` — while granting it a wall-clock `timeLabel` the live screen
  never shows. Worth keeping, because the spec first rejected `deviceName` for a
  DIFFERENT
  reason ("claims PM5 provenance for numbers that came off nothing") that
  **already describes shipped behaviour**: a monitor-door row whose record
  exists but measured nothing posts `deviceName` today and renders
  `PM5 <name>` with the targets-only caption. So the provenance objection is
  not the one that kills it here; the missing data is.
- **The shape a future spec should weigh:** a narrow nullable column
  carrying exactly "this row came through the connected door and holds no
  monitor reading", versus the broader and better-modelled `door` column the
  from-the-log spec's own SOURCE INFERENCE note already wishes existed. The
  second would retire an inference this repo has flagged as a hack, and would
  change what EVERY row claims — its own spec, not a tail task. Either way
  the timeLabel gate in `storedSummary.ts`'s `buildMeta` (currently keyed on
  `sourceLabel !== "LOGGED BY HAND"`) has to be re-derived positively, or a
  third bucket silently gains a wall-clock reading the live screen never
  shows.
