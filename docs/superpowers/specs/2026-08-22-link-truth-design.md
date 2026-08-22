# The link can be lost, and the app says so (Phase LL, the phase's own subject)

## What and why

On 2026-08-20 James armed a workout on his phone, walked out of range, cycled
Bluetooth off and on, and rowed. The screen held `1 OF 3 · READY` the whole
time; his rowing went nowhere; and the app then could not reconnect —
surviving a force-quit and a PM5 restart — until he deleted and reinstalled
it. He also reports the opposite: being offered Connect while already
connected.

One root: **the app's connection state is a local belief, never an
observation, and it can be wrong in both directions.** This spec makes the
app observe. Its goal is not to keep the link alive; it is that a rower is
never lied to about the link, never loses a row silently, and never has to
delete the app.

The ecosystem review of 2026-08-21 found the problem is wider than the walk
showed: **four distinct mechanisms produce the same silent short row**, and
only one of them is even partially covered today. It also corrected our own
retry-path diagnosis — there is no existing discipline to copy for recovery;
it is specified from scratch here.

**Weight: TRIAD** — task 4 adds a reason code to a stored row (a stored
shape), and the watchdog changes when live numbers freeze (what a rower sees
a number do). Full antagonist pass on this spec before implementation; PM
final-PR gate on the PR.

**Sequence (ruled, research pass 2026-08-20): diagnosability → detection →
recovery.** You cannot fix what you cannot see, and the walk proved it —
both of its findings were evidence-poor because nothing on native could
record anything.

**Standing rulings inherited, not reargued:** buy nothing; correct-resume
over a background mode; RECONNECT IS OUT (preconditions in ROADMAP);
banner-as-shipped for the lost-link UX (James, 2026-08-22) — this phase
makes the existing "LOST THE MONITOR" promise true rather than designing a
new one; the PM5 has no resume concept, so no copy may promise a gap gets
filled.

## §1 Diagnosability — two decorators, deliberately not one

**The gap:** `adapters/monitorTransport.ts:49-56` returns
`createCapacitorBleTransport()` raw. Byte capture is structurally impossible
on the platform that produces every real row, and there is nowhere to hang a
watchdog.

- **A production-safe LIVENESS decorator, on BOTH arms.** Wraps any
  `Transport`; records frame-arrival times, last-N lifecycle events with
  timestamps, and counters — numbers, never payload bytes. Always on. This
  is where §2's watchdog lives.
- **The byte RECORDER stays a separate decorator behind its existing
  build-time constant.** One combined `withDiagnostics` wrapper would ship
  the recorder's whole module graph into production — recurring failure 12,
  settled by building and grepping `dist/` in both directions, not by
  reading the import graph.
- **The ring grows up.** Today it records decisions and almost no numbers,
  has no time axis, and dies with the tab — on native it IS the record.
  Entries gain a monotonic timestamp; the ring gains the liveness numbers;
  and it is retrievable from the FAILURE screen, not only the log screen —
  the 2026-08-20 walk lost F-1's evidence precisely because the ring's only
  door was downstream of the failure.
- **`0x0039` and `0x003A` stop bypassing the ring.** They subscribe directly
  (`driver.ts:3649/3653`) so not even their hex could reach it, and
  `0x003A`'s callback takes no bytes parameter at all. One-line class of
  fix, and the precondition for ever settling the summary premises.

## §2 Detection — four mechanisms, one honest axis

The four, from the review, each with its cover:

1. **Bluetooth power-cycle** (James's exact reported trigger). Apple's
   `centralManagerDidUpdateState(_:)`, quoted with its condition intact
   (the anchor pass caught the first draft misapplying the invalidation
   sentence, which covers states BELOW poweredOff only): *"A state with a
   value lower than poweredOn implies that scanning has stopped, which in
   turn disconnects any previously-connected peripherals."* So the
   disconnection itself is DOCUMENTED — stronger ground than the draft
   claimed — while whether `didDisconnectPeripheral` fires for our device
   remains INFERENCE (Apple documents only the connect/cancel cases) and is
   walk item W5. The signal that IS emitted, `onEnabledChanged`, we have
   never subscribed to. **Subscribe it.** Cheapest fix in the phase.
2. **iOS backgrounding.** `Info.plist` declares no `UIBackgroundModes` and
   the monitor stack registers no app-lifecycle listener anywhere — an
   incoming call mid-piece produces the reported failure with no radio fault
   at all. **Register the lifecycle listener**; on resume, treat the stream
   as suspect until the continuity rule (§4) passes it. Whether a backlog
   drains on resume is walk item W6 — design for both outcomes, promise
   neither.
3. **A single characteristic's subscribe rejection** calls `disconnectCb`
   while every other subscription keeps delivering (`capacitorBle.ts:430-448`)
   — a `disconnected` phase with an intact frame stream, which then freezes
   the series recorder for the rest of the session (measured on replay: 197
   of 419 samples lost, `truncated` false, stored heroes unchanged).
   **Remedy, disambiguated at the anchor pass — the existing routing exists
   to kill a real hang and must not be blindly removed** (`capacitorBle.ts`'s
   own comment: a dead CSAFE subscription means acks can never arrive and
   the driver waits below its ready gate forever). The rule is
   PER-CHARACTERISTIC CRITICALITY: a failure on the CSAFE control
   characteristic stays FATAL exactly as today (the hang guard survives);
   a failure on a status characteristic becomes a DEGRADED state — the
   session continues, the ring records which characteristic died, and the
   series recorder is told rather than left to starve.
4. **A genuine drop inside the `callerInitiatedDisconnect` window** is
   swallowed as housekeeping (`capacitorBle.ts:227-238`). **Attribute by
   device+attempt, not by a global boolean window.**

**The watchdog.** Status-arrival watchdog at the transport seam, keyed on
`0x0031` ONLY. Threshold **2500 ms**.

**ARMING RULE (added at the anchor pass, which measured the spec's first
draft tripping on 6 of 6 healthy captures):** the watchdog arms at the
**first valid 0x0031 after connect**, never at connect or subscribe time.
Every committed capture is silent for **3775–4454 ms** between the last
subscribe and the first status frame — nothing arrives at all until the
CSAFE ack — so a watchdog armed any earlier declares every healthy session
dead during setup. The pre-stream window is the connect/program timeouts'
job, not the watchdog's.

**The constant's comment carries MEASURED numbers only:** ~3× the worst
recorded inter-frame gap once the stream runs (810.3 ms, in INTERVALREST,
across 3,442 measured gaps with zero over 2500). It must NOT cite the
"native ~100 ms cadence" — that is a REQUEST the record already shows is not
honoured (`useMonitorSession.ts:537-539`: requested 100 ms, delivered
~508 ms mean on web; the sample-rate write is fire-and-forget). Native
cadence is unmeasured; measuring it is the liveness decorator's first job.

**DISARM during workout state 10 and the finish hand-off window.** The
anchor pass settled the rest of the list by measurement: rests are NOT a
quiet period (state 3 delivers at the same ~540 ms median), armed-but-not-
rowing is NOT a quiet period (state 0, same cadence — the erg notifies
regardless of the flywheel, so a racked handle changes nothing), and states
11/12 appear zero times in the corpus. One unverifiable left as a walk
question: whether the PM5 goes quiet while a rower navigates its own menu
mid-session (W7, below).

Its output drives the EXISTING lost-link presentation (§2a); it NEVER
fakes a disconnect event. Stale is a fact about our inbox, worded as ours.

### §2a What fires the banner, and how it clears

**Corrected at the anchor pass — the first draft invented a new "stale link
axis", and both halves of that were wrong.** `stale` is ALREADY a
`SurfaceStatus` member meaning exactly "the link is lost" (`surfaceModel.ts:66`,
and `staleFor`'s own comment: "Only the lost link makes a number stale"), and
`connectedAxes.ts`'s `deriveLink` is a PURE FUNCTION of phase — there is no
input a watchdog can push. So this spec adds **one new `AxesInput` field**
(`frameSilence: boolean`, from the liveness decorator) and routes it through
the existing derivation to the EXISTING `stale` status and `LostBanner`
treatment. No new axis, no new word, no parallel path.

**What fires it:** disconnect (real), enabled-off, and frame silence past
threshold. All three land on the same shipped "LOST THE MONITOR" treatment
(banner-as-shipped ruling). Live numbers freeze visibly; End keeps what we
saw.

**How it clears — WITH HYSTERESIS, and DEVIATIONS row 75 is reconciled in
the same PR.** A banner that appears at 2.5 s and retracts on the next frame
is a reconnecting indicator without the word — the thing row 75 forbids. So:
the banner LATCHES once shown, and retracts only after **10 s of continuous
healthy frames** (≈18 frames at the measured cadence; the constant's comment
carries the derivation). It cannot blink. It never says "reconnecting" and
never promises anything — it reports, late and steadily, that the stream is
back. Row 75 gains the sentence that says so.

## §2b The resume band must not flash at a flywheel-gated interval start

**AMENDED IN, 2026-08-22, mid-phase — James's device report, and it lives in
the same derivation Task 2 edits:** after a rest completes, if the next work
interval starts while the rower is fully extended and returning to the catch,
the "row to resume" band sometimes flashes for a split second.

**The suspected mechanism is already in this phase's vetted ground and must
be VERIFIED from the corpus before the fix is written, not assumed:** work
intervals open with frames at `el=0.00`, `rowingActive: false` until the
first pull — the interval clock is flywheel-gated at the start of work
exactly as it is during rests (measured: four such frames before the first
stroke). A stale-frames detection that keys on the clock not advancing sees
a legally stationary clock in that window.

**The rule, mirroring James's own framing:** between an interval's start and
its first stroke, the resume band never shows — "resume" has no meaning
before the first pull, the same way the READY screen behaves after "Show me
the numbers". The suppression window closes on the first frame with
`rowingActive: true` or advancing elapsed.

**Scope guard:** this amends the band's FIRING condition only. The standing
follow-on to REMOVE the PULL TO RESUME band entirely (James, 2026-08-17)
stays where it is and is strengthened by this report — the ROADMAP entry
gains a cross-note. If the mechanism verification shows a different cause,
STOP and report rather than fixing the wrong thing.

**Exit criterion (joins §7 as 1a):** a replayed capture's own work-interval
starts never show the band, pinned with a test whose mutation (drop the
first-stroke guard) reds it against the corpus's measured `el=0.00` frames.

## §3 Recovery — specified from scratch, because the record was wrong

**Correction inherited from the review:** the walk README's diagnosis said
`connect()`'s catch clears `driverRef`; it does not, and never did. The only
two `driverRef.current = null` sites are `cancel()` and teardown.
`ConnectedInterstitial.tsx:299-309` reads a stale local and its own comment
says so. There is no existing discipline to copy.

The rule set:

- **Failure disposes — and the field that DECIDES is `deviceName`, not the
  driver ref.** Corrected at the anchor pass: `ConnectedInterstitial.tsx:298-313`
  branches its retry on `session.deviceName`, which nothing but `cancel()`
  clears — so a version of this rule that nulls only the transport and
  `driverRef` replaces the LINK-FAILED loop with an INSTANT-FAIL loop
  (`program()` with a null driver fails `transport-missing` immediately).
  The rule in full: any failed `connect()` or `program()` tears down the
  transport, nulls the driver ref, AND clears `deviceName` before the
  failure screen renders. Try Again then genuinely starts from nothing.
- **The disposal's cost is stated, not discovered:** a retry now passes
  through `scan()` → the plugin's MODAL device-pick sheet — the file's most
  hazardous path (`capacitorBle.ts:305-316`: no BleClient call may be issued
  between `ScanTimeoutError` and the sheet's dismissal, and no test can
  guard it). Accepted: a transient program failure costing a re-pick is a
  visible nuisance; the loop it replaces cost the app. **The
  already-connected guard below SHORT-CIRCUITS the sheet** whenever iOS
  still holds our peripheral, which should make the modal the rare case.
- **The already-connected guard (F-6).** Before scanning, call the plugin's
  `getConnectedDevices` with **`[ROWING_SERVICE_UUID, CONTROL_SERVICE_UUID]`**
  — the anchor pass corrected the first draft's open probe, which asked the
  wrong question. Apple's `retrieveConnectedPeripherals(withServices:)`
  filters on services the peripheral CONTAINS, not services it advertises;
  the hard-won "0x0030 is not advertised" scan lesson does not transfer to
  this API, and the plugin requires a services array (rejects without one).
  If iOS holds our peripheral, offer it — never a second connect against a
  machine that may already be held. Real remaining unknowns, recorded:
  whether the query returns before a fresh `CBCentralManager` reaches
  `.poweredOn`, and that the force-quit brick is NOT covered (iOS releases
  the link when the owning app dies) — this guard addresses F-6's
  "offering Connect while connected", not the brick. If it returns nothing,
  degrade to today's flow and say so in the ring.
- **The `initialize()` memo hoists to module scope** in `capacitorBle.ts` —
  one line, restoring an invariant the file's own comment already claims
  (every connect attempt currently constructs a new `CBCentralManager` while
  the plugin reuses the old `Device` with its callback map intact). The harm
  is unproven and this does not claim to explain the force-quit survival; it
  restores a stated invariant cheaply.
- **What this does NOT do:** auto-reconnect, background scan, RSSI ranking,
  MISSED-row backfill. All remain OUT with their preconditions unchanged.

## §4 The honest close — a stored reason, and a continuity rule

**Today a link death and a rower stopping early are both `terminated: true`,
and the server row carries neither flag.** A tester's "the app lost my row"
and "I bailed at minute two" are indistinguishable in the record.

- **The close reason EXTENDS the existing `endedBy` field — it does not
  mint a third one.** Corrected at the anchor pass: `monitorRun.ts:96`
  already stores `endedBy?: "interrupted"`, whose own comment records the
  exact conflation this section fixes, and a third overlapping field beside
  `terminated` and `endedBy` would leave nothing enforcing agreement. The
  union widens to
  `"finished" | "rower" | "link-lost" | "program-failed" | "interrupted"`,
  populated per close path — and every value is one the writer HONESTLY
  KNOWS, which the anchor pass verified writer by writer:
  - machine WORKOUTEND → `finished`
  - End button with the link up → `rower` (`linkGone === false`, computed
    on the line above the close)
  - End button with the link gone → `link-lost` (`linkGone === true`)
  - a failed `program()` closing an open run → `program-failed` (was
    unmapped in the first draft)
  - Today's row, closed later with no evidence → `interrupted` — which
    keeps its existing stored meaning: ABSENCE of evidence, not a cause.
  The machine's own TERMINATE stays on `terminated: true`, which already
  distinguishes it losslessly; `endedBy` never re-encodes it.
  The server row gains the same field, additive-optional; old rows read as
  unknown, never backfilled. **This is the stored shape that makes the spec
  TRIAD.**
- **An honest limit on the server row's reach, stated up front:** a server
  row exists only if the rower SAVES, and the rower whose row was eaten is
  the least likely to save. The artifact that answers "the app lost my row"
  in the field is §1's ring; the stored reason serves the saved corpus and
  Phase RC's reconciliation, not live support.
- **The continuity rule: RowTracer's SHAPE, our own constants — because the
  borrowed constants reject healthy streams on our wire.** The anchor pass
  simulated RowTracer's bounds (elapsed back >2 s, distance back >5 m,
  strokes dropped) over the spec's own W6 scenario — a 30 s interruption
  slid across every frame of every capture — and they rejected **12.7% to
  26.0% of healthy resumes**, because 0x0031's elapsed is a PER-INTERVAL
  clock that legally jumps back at every boundary (−29 s to −188 s in the
  corpus) and re-bases mid-rest with no boundary at all (−5.97, −5.90,
  −4.35, −3.15 s, distance flat, four occurrences). The licence transfers;
  the constants only transfer if the field they read means the same thing,
  and ours does not.
  The rule as adopted: keyed on quantities that are MONOTONIC across
  boundaries on our wire — `totalWorkDistanceMeters` (0x0031 bytes 11-13)
  going backward, or stroke count dropping — with thresholds derived from
  the corpus in implementation and validated the same way the watchdog is
  (no healthy capture's own resumes may trip it). On reset: preserve the
  interrupted record, start clean, never merge silently — that verdict
  survives from RowTracer unchanged, and it is the half worth borrowing.

## §5 The finish-line race — CUT from this phase, moved to Phase RC

The first draft carried the review's A-2 input (hold the radio past the
terminal frame until state 12, a 0x0039, or 3.5 s). The anchor pass walked
the four recorded finishes through that design and killed it as specified:
**workout state 12 appears zero times in the corpus; 0x0039 appears zero
times in any byte capture** — and the recorder taps every subscribed
characteristic, so that absence is evidence, not a blind spot. The one ring
observation of a 0x0039 shows it arriving BEFORE the terminal frame — the
same arrives-first shape this spec's own inputs had just corrected for the
final split. On 100% of recorded data, the design reduces to "make the rower
stare at the finish frame for a flat 3.5 seconds after every piece", with
both early exits unobserved or inverted.

Nothing in Phase LL consumes the hold — its beneficiary is Phase RC's
logbook reconciliation (the 0x003F row identity). **It moves there**, to be
re-specced against a walk that deliberately holds the radio and observes
what actually arrives after a terminal frame — which is the only way its
design can be validated at all. The measured inputs travel with it
(disconnect at 21.7/24.1/30.6/107.3 ms after the terminal frame; the final
split at −179.9 to +90.2 ms, sign varying). The false "~1 ms after" premise
in `ConnectedSurface.tsx:52-55` is corrected in THIS phase as a comment fix,
since leaving a falsified premise in shipped source is how premises regrow.

## §6 Testing, bound by Phase WU's lessons

- **`app/e2e/` is NOT typechecked** — no brief may claim the compiler
  catches anything there. Assertions must be run, not compiled.
- **pnpm eats scoped-run flags in both suites.** Working forms:
  `pnpm exec playwright test --grep`, `pnpm exec vitest run`. **Check the
  run count**; a full-suite count means the filter was eaten.
- **All gates FOREGROUND** — a dispatched subagent's background waits die
  when it idles.
- The fake models what this spec consumes: enabled-state notifications, a
  suppressible frame stream (for the watchdog), a per-characteristic
  subscribe failure, and a resumable stream that violates continuity. A
  fake that cannot produce the failure cannot prove the detector — the
  Rest Time lesson, one phase earlier.
- Replay the committed corpus wherever it can speak: the subscribe-rejection
  freeze already reproduces on replay (197/419 samples), and the watchdog's
  threshold must be validated against every capture's real inter-frame gaps
  (no capture may trip it while healthy — WITH the arming rule; without it,
  6 of 6 trip during setup silence, measured).
- **The liveness decorator takes an INJECTED clock (`now`/`schedule`), and
  replay tests bind `ReplayHandle.clock` to it** (anchor pass H5): the
  replay harness's virtual clock is the DRIVER's, `fake.ts` is tick-driven,
  and `replay.ts`'s barrier timeout is a real `setTimeout` — so a watchdog
  written naturally against wall clock is unprovable by either harness, and
  `vi.useFakeTimers()` over a replay hangs the barrier. With the injection
  done, the corpus genuinely proves the false-positive case in CI.
- **Tests must assert the COMPOSITION, not just the decorator** — every test
  that injects `MonitorSessionDeps.createTransport` bypasses
  `adapters/monitorTransport.ts`, which is where the decorator is composed.
- **Corpus-green is necessary, not sufficient: every committed byte capture
  is `transport: "web"`.** Zero native captures exist, by construction. The
  native gap distribution is a WALK deliverable (the liveness decorator's
  first output), criterion 9a.
- **The 0x0031-before-0x0033 skew is measured, not inherited** — the 2 Hz
  numbers do not transfer to native's ~10 Hz. The liveness decorator is the
  instrument; record the distribution in the report.
- Self-mutation on every behavioural test, byte-identical restore; per-file
  coverage; e2e + screenshots foreground.

## §7 Exit criteria

1. Each of §2's four mechanisms, reproduced in a test, moves the surface off
   `READY`/live numbers within its stated bound and shows the shipped
   banner. The watchdog case is proven with a suppressed-stream fake AND
   validated against every committed capture staying green while healthy —
   including the 3775–4454 ms setup silence, which the arming rule must
   cover and which a test must pin (arm too early and 6 of 6 captures go
   red).
2. A failed `program()` leaves NO driver ref and NO held transport — proven
   by a test that fails against today's code, reproducing the LINK-FAILED
   loop's precondition.
3. Try Again after an induced failure reaches a fresh scan/connect/program —
   the loop is unrepresentable, asserted structurally (no path from failure
   state to `program()` without passing through transport construction).
4. The already-connected guard consults the plugin before scanning, with
   both outcomes tested (device returned; nothing returned degrades to
   today's flow and logs it).
5. The widened `endedBy` lands on `MonitorRun` and the server row
   (additive-optional), round-trips POST→GET, rejects unknown values, a
   link-lost close is distinguishable from a rower's End in the stored row,
   and legacy `"interrupted"` rows read back unchanged. The banner's
   10 s retraction hysteresis is pinned by a test that fails if it can
   blink, and DEVIATIONS row 75 is reconciled in the same PR.
6. The continuity rule rejects a stream violating any of its three bounds,
   preserving the interrupted record and never merging — pinned against a
   synthetic resume built from a real capture's frames.
7. The ring carries timestamps and liveness numbers, is retrievable from the
   failure screen, and receives 0x0039/0x003A. Proven on the failure path,
   not the happy path.
8. The recorder's module graph is absent from the production bundle, proven
   by `pnpm build` + string grep over `dist/` in both directions.
9. W5, W6 and W7 are on the phase's walk card with their questions stated —
   W7 (new at the anchor pass): does the PM5 keep notifying while a rower
   navigates its own menu mid-session? If it goes quiet, that is a
   legitimate quiet period the disarm list does not cover.
9a. The native inter-frame gap distribution is measured by the liveness
    decorator on a real phone and recorded — the corpus's web-only numbers
    are necessary, not sufficient, for the watchdog's threshold on the
    platform it exists for.
10. The next tag's notes say a lost link now says so, and a lost-link ending
    is recorded as such.

## §8 Out of scope, each with its reason

- **Reconnect** — preconditions unchanged (fake can't prove it; detection
  ships first; buy-vs-build answered). §3's disposal rule is designed not to
  preclude it.
- **A fifth "reconnecting" UI state** — DEVIATIONS row 75's ruling stands;
  no copy promises what does not exist.
- **Background-mode logging** — ruled dead (WebKit throttler; correct-resume
  chosen).
- **The 90-second JS-survival probe (§D1e)** — still worth running once, at
  a walk, but nothing in this spec depends on its answer.
- **MISSED rows, RSSI, background scan** — reconnect's dependents, out with
  it.
