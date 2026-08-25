# Antagonist ledger

Claims this project believed that turned out false, and **the technique that
settled each**. Read by the `antagonist` agent before every engagement.

The techniques are the durable part. The next antagonist should inherit a
toolkit, not a history.

## Falsified claims, and how

- **"The paused derivation depends on seeing zero stroke rates."** Believed
  because a long comment discussed `spm === 0` at length. False: that passage is
  the epitaph of a DELETED predicate, and the live guard is on
  `distanceMeters <= 0`. **Technique:** replayed all 25,511 captured frames
  through verbatim copies of the real functions and compared paused sequences
  byte-for-byte. Reading the comment produced the wrong answer; running the code
  over real data produced the right one.

- **"These three e2e pins are vacuous — `overflow: clip` makes scrollHeight
  equal clientHeight."** Believed because a 4000px child was injected and the
  numbers did not move. False: the container is a flex COLUMN, so the child was
  shrunk to 205px and the probe never violated the invariant. With `flex: none`
  it gives 4127 vs 344. **Technique:** before believing a probe's result,
  confirm the probe produced the state it claims to test. Check the computed
  box, not the requested one. Acting on this would have deleted three working
  geometry pins.

- **"`max(left, right)` fixed a rotation asymmetry James saw on his phone."**
  False: iOS reports the landscape side inset on BOTH sides regardless of which
  side the housing is on, and CSS cannot tell which side it is, by design. The
  one-sided condition came from our own CDP override, where we chose the side.
  **Technique:** ask where the input came from. An asymmetry that only appears
  under a harness you control is the harness's, until a primary source says
  otherwise. (The fix was kept — Android's `DisplayCutout` really is asymmetric.)

- **"The corners of a notched edge are clear, so the tap targets can move
  outboard."** True about the CAMERA (LIVE clears it by 76.5px) and false about
  the constraint: Apple states the landscape inset protects the sensor housing
  AND the rounded corners, and the corner radius is roughly equal to the inset
  (55 vs 59, 62 vs 62). **Technique:** when a reservation seems too large, ask
  what ELSE it might be reserving before assuming waste. The vendor documents it.

- **"A required field on a persisted type is a migration hazard."** Structurally
  true, consequentially false: the field has one consumer, and the program
  reaching it is always freshly compiled, never loaded from storage. **Technique:**
  trace the readers BACKWARD from the persisted shape, not the field forward from
  its type. The original analysis went forward and never checked who reads.

- **"The session accumulator over-counts because the clock drops at work/rest
  boundaries."** False, and it was written into the ROADMAP where an investigator
  would have followed it. Measured: work→rest never drops the clock (0 of 7);
  rest→work drops once, correctly (4 of 4). The real cause is Terminate re-bases,
  where elapsed jumps back to a non-zero value while distance stands still.
  **Technique:** count the events in the captures rather than reasoning about
  which events should exist. 9 of 25 drops did not reset distance, which no
  amount of reasoning would have produced.

- **"Swiping the content area already changes panes and works today."** Believed
  because the handler exists (`ConnectedSurface.tsx:319-320`), the arithmetic is
  well tested, and `e2e/connected.spec.ts:341-344`'s own comment asserts a
  synthetic `Touch`/`TouchEvent` pair "satisfies [it] exactly like a real finger
  would". Unproven, and unprovable by this suite: `playwright.config.ts:24` uses
  `devices["Desktop Chrome"]`, which is **`hasTouch: false`** — the harness cannot
  deliver a real touch at all, which is _why_ the helper resorts to
  `el.dispatchEvent`. The unit swipe is jsdom `fireEvent` (`:221-225`). So hit
  testing, `touch-action: pan-y`, gesture arbitration and `touchcancel` are all
  untested by construction, and the rower says it does not work.
  **Technique: check the harness's INPUT CAPABILITY, not the test's assertion.**
  A test that reaches the handler by a route no finger can take proves the
  handler, never the gesture. Ask what the device descriptor says before
  believing any input-level green.

- **"The gutter is 103pt and the content column 682pt."** Believed from a CSS
  comment (`index.css:7224`) that says exactly those numbers. The declaration
  three lines away says `grid-template-columns: calc(44px + var(--edge-inset))`
  (`:7267`); 103/682 is the CDP-injected 59px-inset condition only, and every one
  of the 62 committed captures draws 44/800. **Technique:** a comment quoting a
  measurement is quoting ONE condition. Read the declaration and ask which
  condition the reader will be in.

- **"The type scale is 104 / 54 / 52 / 44 / 30 / 22 / 19 / 10."** That is the
  PORTRAIT scale (`tokens.css:173-180`), quoted to describe a landscape screen.
  Landscape redefines it once (`index.css:7145-7159`): 112 / 58 / 56 / 46 / 30 /
  22 / 19 / **11**. **Technique:** when a token has a media-query redefinition,
  quote the branch that applies to the surface you are describing — and check
  whether the "one label size" is one size (here two of the six implicated labels
  are 11px literals that never track the token at all).

- **"The software cannot reliably ask which side the housing is on."** CSS
  cannot — `env()` reports the landscape inset on both sides by design. But
  `screen.orientation.angle` can (90 = left, 270 = right), which is the hinge the
  whole "put the controls opposite the notch" idea turns on. **Technique:**
  "CSS cannot" and "the software cannot" are different claims; the second is much
  larger and forecloses designs. Do not let the first get promoted into the second.

- **Two peer reports, same number, different confidence.** The Dynamic Island's
  126 / 230 / 371pt widths are "Apple's HIG, authoritative" in
  `gutter-thin-report.md` and `[S]` (Behance/Infinum) in `notch-research.md`,
  which adds "whether iOS presents the expanded form while the foreground app is
  in landscape I could not confirm". The downstream brief inherited the confident
  one. **Technique:** when a figure appears in more than one peer artifact, diff
  their PROVENANCE TAGS, not their values — a brief always inherits the most
  confident phrasing available upstream.

- **"The base disappears when a workout has 5+ piece rows AND every piece shares
  one base."** Nearly right, and wrong in the way that widens the blast radius:
  `stepDetail.ts:42-52` builds the base set from SPLIT refs only
  (`!isEffortRef`), so a set of 6k pieces plus a MAX/MIN effort piece still has
  `bases.size === 1` and still suppresses. Six seeded workouts are exactly that
  shape. **Technique:** when a brief says "all X share one Y", read the FILTER
  that builds the set, not the predicate that tests it — the filter is where the
  exceptions get quietly excluded from the population.

- **"Nothing renders the base anywhere else."** True of the Today card, and it
  hid the bigger finding: the SIBLING renderer of the same data,
  `structureLine`'s `offsetRange` (`stepDetail.ts:304-318`), drops the base the
  same way, and 94 of the 300 seeded Library rows carry no base token at all
  (`4-6-8-6-4 @ +12 → +10`). A ruling phrased as a product principle ("we always
  need full form") outruns the one screen the brief scopes it to. **Technique:**
  before accepting a fix scoped to one screen, grep the other CONSUMERS of the
  same domain module and run the real seed through each — `pieceList` and
  `structureLine` live in one file and had the same defect.

- **Width claims are cheap to settle without a browser.** "Does always-full make
  a compact row wrap?" was answered by rebuilding the row string for all 344
  visible compact rows across the 300-workout seed: max length is 25 characters
  both before and after, delta ≤ 3, and zero rows exceed a length that already
  renders today. **Technique:** when the question is "does this get too wide",
  enumerate the real corpus and compare the new worst case against the worst case
  ALREADY SHIPPING, rather than measuring one example in a browser.

## Attacked and NOT broken (this engagement)

- **Is the swipe handler or its CSS defective?** No, not as Chromium implements
  them. A standalone repro of the exact structure (`touch-action: pan-y`, a
  `100dvh` grid, a scrollable child, the same threshold and handlers) driven by
  real `Input.dispatchTouchEvent` at 844×390 changed pane on all four drag shapes
  tried, including one with 200px of vertical drift, and never emitted
  `touchcancel`. So the device failure is WebKit- or situation-specific, and
  remains unexplained. **Technique worth keeping:** when the app harness cannot
  produce the input, reproduce the MECHANISM standalone under a real input
  pipeline; it cheaply eliminates the simple explanations before anyone spends a
  hardware session on them.

## Techniques that keep paying

1. **Replay the committed captures.** Most wire questions are already answered in
   `docs/monitor/sessions/*.log.gz`. No hardware, no speculation.
2. **Make the probe bite before trusting its silence.** Demonstrate the failure
   the assertion claims to prevent.
3. **Trace backward from the consumer**, not forward from the definition.
4. **Ask where a measurement came from.** Our own harness is a suspect.
5. **Check what a reservation is reserving.** Vendors document it; we guessed.
6. **Count, do not characterise.** "Sometimes" and "roughly" hide the answer.
7. **Compare against the external authority.** Every internal gate agreed with
   every other internal gate while the app read 16938 m and the erg read 4384.
8. **Check the harness's input capability before believing an input-level test.**
   `hasTouch: false` made every swipe test in the repo a handler test.
9. **Read the declaration, not the comment that measures it.** Comments here
   quote one condition (an injected inset, one orientation) as if it were the
   value.
10. **Diff provenance tags across peer artifacts**, not just values. Confidence
    is what gets inherited downstream, and it inflates at every hop.

## Things attacked and found sound

- The single-writer discipline on the run record, and its refusal to be
  re-derived.
- `verifyArmed` reading the machine's own state back rather than trusting an
  acknowledgement.
- One judgement call site, enforced by a census test, held across seven phases.
- The view layer deriving everything and storing nothing.

## Spec-stage pass, 2026-08-15 (Phase CR2 spec 1, "numbers")

- **"A capture-replay test can drive the real driver and exercise an
  interval-keyed accumulator."** False, twice over, and it was about to become
  four exit criteria. `docs/monitor/sessions/*.log.gz` carry the driver's
  DECODED OUTPUT (`[event]` MonitorFrame JSON), not wire bytes — the only raw
  0x0031 payloads in the whole record are 16 `structure` log entries. The
  review's own re-encode harness zero-fills 0x0033, so `intervalCount` is always
  0; and a replay never calls `program()`, so `programLength` is 0 and
  `intervalIndex.ts:167` returns `null` before it looks at state. Every frame
  keys to nothing. **Technique: before trusting a replay-based exit criterion,
  ask what the harness FEEDS the field under test.** A harness that faithfully
  reproduces three published numbers can still be structurally blind to the
  mechanism the next fix turns on — ours reproduced 47.8 m and 108.4 m exactly
  while being incapable of writing a single map key.

- **"The three committed captures are three captures."** False:
  `session3 ⊂ session4a ⊂ session4b`, byte-for-byte prefixes (1,114,926 /
  1,877,344 / 2,036,658 B). Every "measured across all three captures" in the
  spec AND in the architecture review's §F2 has the evidential weight of one.
  **Technique: when a README records a prefix relation for ONE pair in a set (it
  did, for sessions 2/3), test the rest of the set.** Three lines of
  `bytes.startswith()` deleted a whole class of "independently confirmed".

- **"Last-write-wins on an interval-keyed map holds each interval's final
  reading."** False. At a work→work boundary with NO intervening rest, 0x0031's
  counters reset one notification BEFORE 0x0033's Interval Count increments, so a
  `(0, 0)` frame still carrying the completed interval's key clobbers it —
  permanently, with no link gap involved. Measured (`pm5-session4b`
  L2835-2838): oracle 74.4 m, the existing fold 74.4 m, the proposed map
  **0.0 m** — a regression on a segment the old code got right. 35 of the 300
  seeded library workouts contain such a boundary (`compileProgram` defaults
  `restSeconds: 0`, `program.ts:554`). **Technique: when a design keys one
  characteristic's value by another characteristic's field, ask what makes them
  ATOMIC.** Here nothing does — and the clean boundaries in the capture were
  clean only because `toProgramIndex` keys off `state`, which rides in the SAME
  payload as the pair. Enumerate which cases have that property and which do not;
  the ones that do will make the design look correct.

- **"No threshold change fixes it — the bad drops are far above any threshold
  that still catches a real 60 s interval."** Right conclusion, backwards reason.
  Measured: real resets span 14.14-156.76 s, bad drops 10.90-117.43 s, and the
  four smallest bad drops sit BELOW the smallest real reset — a ~13 s threshold
  would eliminate four of nine. The claim survives on the OVERLAP, not on "far
  above". **Technique: when a spec argues "no scalar separates these", print BOTH
  populations sorted.** The stated direction was wrong and a reader acting on it
  would have retuned the constant upward.

- **"`totalWorkDistanceMeters` appears only at arm and terminate moments."**
  False in its literal form, and the correction strengthened the design:
  `raw=e6 1d 00 3b 01 00 08 01 05 …` is workoutState 5 (INTERVALWORKDISTANCE →
  `rowing`), elapsed 76.54 s, distance 31.5 m, TWD 500 on a 500 m goal — a live
  mid-row sample proving TWD reads the GOAL while rowing, not merely as an arm
  artefact. The operative claim (no mid-piece TIME-goal sample) survives.
  **Technique: decode the STATE BYTE of every sample before characterising when a
  field appears.** "Only at arm and terminate" was a summary of the states
  someone expected, not of the states present.

- **A cheap catch worth repeating: an oracle can share a premise with the fix.**
  "Each interval's own final pre-reset reading" is sound when computed by RESET
  DETECTION (elapsed drop + distance drop, no index involved) and tautological
  when computed by grouping frames on their recorded `intervalIndex` — the field
  the implementation keys on. Both are natural readings of the same English
  sentence. **Technique: for any oracle, name the field it must NOT touch.**

## Task-brief pass, 2026-08-15 (CR2 spec 1 Task 11, the walk's falsification)

- **"The poisoned tick is not in the ring; the mechanism is arithmetic
  inference."** Understated. `parse.ts` maps workoutState **8**
  (`INTERVALWORKTIMETOREST`, an ephemeral PM5 transition state) to `"rowing"`,
  and `walk-2026-08-15/session-a-multitest.json` seq 26 is a captured 0x0031
  sample IN state 8 carrying the completed interval's pair (60.05 s / 181.2 m),
  one entry before the `resting` flip at 60.4 s. The poison WINDOW is recorded;
  only 0x0033's count at that instant is not. **Technique: before tagging a
  mechanism INFERENCE, check whether the state byte you are theorising about is
  a DOCUMENTED state with its own ordinal — and grep the capture for that
  ordinal.** A brief that reasons about "a work/rowing state" in prose skips the
  question of WHICH of the five ordinals our own map calls rowing.

- **"353 ≈ 176 + 177 — both registers hold interval-1-sized distance."** The
  conclusion is right and the decomposition is impossible. Key 0 keeps receiving
  rest ticks from the same monotone pair AFTER the poison, so `key0 ≥ key1`
  always; that forces key1 ∈ [173.3, 176.5] and key0 ∈ [176.5, 179.7], honest
  total 195.5-198.7 (not "≈195"), and it pins the poison to within ~3 s of the
  work→rest boundary. **Technique: a max-merge accumulator imposes ORDER
  constraints between its own registers. Before accepting a decomposition of an
  observed total, ask which register is downstream of which — the arithmetic
  bounds the timing for free, with no new capture.**

- **A guard's own defence table had the inequality backwards, and its test
  fixture instantiated the failure.** The brief argued "59.5 NOT < register only
  if register already ≥ 59.5" (false: `59.5 < R` is true when `R > 59.5`) and
  ordered its failing test rest-ticks-then-poison, so key 0's register held 90
  and the guard would have opened the poisoned key anyway — red before AND after
  the fix. The predicate is nonetheless sound, for a reason the brief never
  stated: within one un-reset pair elapsed is monotone, and the register is a max
  over readings from that SAME pair, so a poison can never be strictly smaller.
  **Technique: for any guard expressed as a comparison, hand-execute it on the
  brief's OWN fixture in the brief's OWN order before reading its argument. The
  ordering of a synthetic fixture is a factual claim about the wire, and it is
  the claim briefs get wrong.**

- **Attacked and not broken:** the elapsed-only open predicate, against seven
  recorded and constructed shapes including both skew directions at an r0
  boundary, the trailing-rest phantom (which `toProgramIndex`'s upper clamp makes
  immune — the poison bites only at NON-final boundaries, so an N-interval
  program takes exactly N-1 of them), and a null-index tick inside the poisoned
  window. Adding a distance clause was considered and rejected: its only
  motivating shape (elapsed re-bases while distance stands still) is the
  Terminate re-base, which the write rule already excludes, while its cost — a
  previous key holding ≤0.8 m collapses two keys and loses ~60 s of session
  elapsed — is reachable by a rower who simply doesn't pull.

- **Addendum to the Task 11 pass — one of its own "attacked and not broken"
  rows was falsified a day later by the implementation.** The pass certified
  "the trailing-rest phantom (clamp → existing key, never an open)". Shape 2 of
  the outage suite IS a trailing-rest clamp, and it DOES open — when a frame gap
  has kept the next key from ever being opened, the clamped phantom is the first
  write to reach it. The guard still behaves safely there (refused, merged,
  logged), but the certification was wrong: the clamp guarantees the KEY VALUE
  is an existing interval's, not that the key is already IN the map.
  **Technique: for every "never happens" row in a soundness table, ask what
  state the claim quietly assumes (here: that earlier frames already opened the
  key) and construct the run where that state is absent.** A frame gap is
  always the cheapest absence generator in this codebase.

- **A test fixture's premises can collide with new code while both are
  "settled".** The Sea Fret happy-path fixture modeled 0x0031's elapsed/distance
  as session-cumulative (never resetting) — wire-impossible, hardware-settled as
  per-interval by walk 4 and re-confirmed twice in walk-2026-08-15 — and the
  open-on-reset guard is the first code whose behaviour DIFFERS on the
  impossible shape, so the flagship test broke on a fixture bug, not a code bug.
  The first draft blamed interface-notes item 24, a category error: item 24 is
  about 0x0033's Last Split CHECKPOINT pair, not 0x0031's own counters.
  **Technique: when new code breaks an old fixture, ask which of the fixture's
  premises the new code is the first to observe — and check whether that premise
  was ever hardware-settled before blaming an open question.**

## Spec-stage pass, 2026-08-15 (PM5 record-and-replay harness)

- **"A replay can serve recorded notifications on the recorded clock while
  matching the driver's writes in order."** False for any ack-gated driver, and
  the spec's own cited prior art already solved it. `sendSequence` awaits each
  frame's ack before the next write (`driver.ts:3876-3892`) and `discardStaleAcks`
  (`:3857`, `:1405-1413`) purges anything that arrived before the sequence began —
  so an ack released by the clock is discarded and `program()` hangs with no
  timeout; released late, it burns `verifyArmed`'s 30-tick budget (`:628`, `:3229`)
  and rejects `"not-observed"`. ErgometerJS's `ReplayDriver.checkQueue()` only ever
  inspects `_events[0]`: the total order is a BARRIER — a recorded notification
  cannot fire until the caller issues the write ahead of it — and its README says
  so ("otherwise it will sometimes wait for a response which was not recorded").
  **Technique: when a spec cites prior art, read the prior art's SOURCE, not its
  summary. A design that adopts a format and drops the scheduling rule has adopted
  the part that does not matter.** Corollary: the repo's own reactive harness
  (`sessionTotals.test.ts:360-389` — wait for the write, then ack, then drain 50
  microtasks) was the local proof, sitting in the file the spec cited for something
  else.

- **"Instant mode ignores `t`, so replay is deterministic."** False: this driver
  reads a wall clock. `FINISH_GRACE_MS = 3000` (`driver.ts:794`) is compared with
  `now()` (`:2100`, `:2783`) and armed via `schedule(..., 3000)` (`:2465`); both
  default to `Date.now`/`setTimeout` (`:858`, `:863`). A session replayed in ~0 ms
  of wall clock never expires its finish grace — the machinery that decided whether
  every interval was measured, twice, on the walk. **Technique: before calling a
  replay deterministic, grep the code under replay for its own clock reads. "The
  engine consumes recorded time" is a property of the ENGINE, and ours has two
  injectable clocks precisely because it does not.**

- **"Extend the bundle probe to the recorder's identifier."** Vacuous, and this
  repo had already measured why: `scripts/dist-grep.sh`'s header records that
  grepping for the identifier `createFakeTransport` came back CLEAN against a build
  that genuinely contained `fake.ts`, because minification renames identifiers —
  every needle there is a string literal on purpose. **Technique: for any
  "prove X is absent from the bundle" criterion, ask what survives minification.
  The gate that passes on a bundle it should have failed is the expensive kind.**

- **"The wire-capable fake zero-fills 0x0033."** False, and inherited verbatim from
  a test-file header (`captureReplay.test.ts:23-26`) into a spec. `fake.ts:649`
  computes `intervalCount` via `toMachineIndex` — the algebraic inverse of the
  `toProgramIndex` under test, which `intervalIndex.ts:41-47` says is kept
  separately written for exactly that reason — and `fake.ts:1064-1066` emits
  0x0033 BEFORE 0x0031 atomically, so the fake has zero inter-characteristic skew,
  in the opposite order to the hardware the walk logged twice. The zero-fill is the
  test PRIMING shortcut (`sessionTotals.test.ts:402`), a different object.
  **Technique: when a spec repeats a code comment's parenthetical, open the file
  the comment names. A wrong "our harness is blind here" is more dangerous than no
  claim: it hides a harness that is blind somewhere ELSE.**

- **"The delivered notification rate is unmeasured (estimates disagree 5x)."**
  False twice. Measured from the committed record: 2,651 status frames over 1,190
  machine-seconds of rowing/resting in `pm5-session4b-final.log.gz` = **2.23/s,
  modal spacing 0.50 s** (`maybeEmitFrame` is one frame per 0x0031,
  `driver.ts:2990-2996`). And the 5x is a PLATFORM fact already written down:
  `pm5-interface-notes.md:4403`, "~90-180ms spacing on iOS (vs the slower effective
  cadence the desktop walks logged)". So a dev/web walk cannot produce the on-device
  number a Tier 2 gate was going to wait for. **Technique: a rate is measurable from
  any capture that carries the machine's OWN clock — count events per unit of
  MACHINE time, not per unit of ours. And before believing two estimates conflict,
  check whether they are estimates of two different transports.**

- **Attacked and not broken:** the seam choice, against the primary source — the
  live CDP `BluetoothEmulation` listing has 15 commands and none injects a
  characteristic notification with data, so browser-level fake BLE genuinely cannot
  replay a PM5 stream; the totally-ordered single log (independently confirmed in
  ErgometerJS's source); the oracle-independence rule; and the tap's cost, which is
  ~6.6 events/s of one hex encode — disproven as a perturbation risk by arithmetic
  rather than by argument.

## Task-brief pass, 2026-08-15 (PM5 record-replay Stage A plan)

- **"`pnpm test --project unit -- <filter>` verifies TDD red/green for the new
  `src/monitor/transports/*.test.ts` and `src/monitor/captureReplay.test.ts`
  files."** False, and it would have made three tasks' verification steps
  silently no-ops. `vitest.config.ts:9-17`'s "unit" project only includes
  `server/**`, `domain/**`, `scripts/**` — nothing under `src/`, regardless of
  whether a file touches the DOM (the plan's own stated reasoning, "no DOM
  use, so unit," conflates the two). Measured: `pnpm test --project unit --
src/monitor` returns the exact same 43 files/1163 tests as `pnpm test
--project unit` with no filter at all — the filter matched nothing and the
  command ran an unrelated, pre-existing suite. `pnpm test --project client --
src/monitor` correctly returns 104-105 files including every touched
  module. **Technique: when a plan claims a `--project`/filter combination
  scopes a run, diff its reported file count against that same project run
  with NO filter.** An identical count is proof the filter did nothing —
  cheaper than reading the include globs by eye, and it catches what eye-
  reading missed here. Corollary, same session: the trailing `-- <fragment>`
  positional filter this plan uses throughout doesn't narrow at all in this
  repo's pnpm+vitest invocation (a filter guaranteed to match zero files
  still ran the full 104-file client project) — every "run to verify
  failure/pass" step in this plan already runs the WHOLE selected project;
  only the `--project` choice itself matters, and getting that right is where
  the entire defect lived.

## Spec-stage pass, 2026-08-15 (Phase CR2 spec 2, "state axes")

- **"METERS LEFT is wrong on MIXED programs; the mechanism is either a stale
  reference or a unit mismatch."** Both candidates false, and the real shape is
  wider. `intervalRemaining` is `V − (obs − checkpoint)`, so the wire's 0x0033
  Last Split pair can be INVERTED out of the committed lab captures — which
  already ran this exact subtraction before every capture. Measured:
  `obs + remaining ≡ V` on every unclamped frame of all three files, including
  a fully-rowed interval INDEX 1 after a completed interval 0 — **the
  checkpoint is 0 at interval 1**, killing both candidates; the walk's 578
  signature pins it to **181 at interval 2** (whole meters — the spec's
  "181.2" is a value the field cannot carry). Surviving reading: the pair LAGS
  one boundary, as 0x0033's Interval Count already does live. Consequences:
  bites ANY program from interval 2 onward, both dimensions; hits
  `intervalAccrued` too (rendered on screen); no capture or ring could ever
  have shown it. **Technique: when a derived field is published in the
  captures, INVERT it to recover the wire input the captures do not carry —
  after confirming with `git show <capture-commit>:<file>` that the code that
  produced it is the code under suspicion.**

- **"The fake models the wire well enough to test the fix against."** No, and
  it is why this survived: the fake books the scenario's own cumulative pair as
  Last Split — a self-consistent world in which the subtraction is CORRECT.
  Hardware sends 0 (intervals ≤1) and a lagging value after. **Technique: when
  a fix touches a wire field, read what the FAKE puts in that field before
  writing the failing test.** An internally coherent fake is the most
  expensive kind of wrong.

- **"A suspicious `finished` is one whose counts don't reconcile."** Marked 2
  of the 4 committed rings' HONEST finishes suspicious — the final boundary
  routinely arrives after the finished tick, inside the finish grace (the walk
  README celebrates it firing in exactly those two sessions), so N−1 of N is
  the normal terminal state; the register-count leg discriminates nothing (the
  killer's instant reads 1-of-2, byte-identical to an honest 2×1:00 terminal).
  Fix: `0x0039 seen OR actuals ≥ programmed − 1`, admitting 1-interval
  programs can never trip it. **Technique: hand-execute a proposed predicate
  against EVERY committed capture and tabulate the verdicts before believing
  the shape it was designed from.** Four rings, four rows, ten minutes.

- **"The hardware answer is: mirror the machine and show 0 while ARMED."** The
  walk's own sentence says "before the first pull of piece TWO" — a
  mid-session boundary where our phase is `live`, not `ready`, and three of
  four rings carry the spm ghost at exactly that frame (25/28/25, all
  `state=rowing, rowingActive=false, distance≈0`). A fix scoped to `armed`
  misses the observed case. **Technique: for any ruling derived from a
  hardware observation, re-derive WHICH APP STATE the app was in at that
  instant from the ring — not from the state the ruling's wording implies.**

- **"The recorded rings are the transition inventory for a zero-behaviour-
  change proof."** The rings contain no phase entries at all, and their frame
  entries appear only on STATE CHANGE — four consecutive identical frames, the
  freeze predicate's entire input, cannot exist in one by construction.
  **Technique: before proposing a capture as a fixture, ask what its recorder
  DROPS.** A state-change-only ring is structurally blind to every predicate
  whose input is repetition.

- **Attacked and not broken:** banner suppression during genuine rests —
  already structurally guaranteed (`nextFreezeRun` resets on any non-`rowing`
  frame; rests map from workoutStates 3/6/7). Caveat kept: the guarantee
  belongs to the freeze predicate; re-deriving `activity` from anything else
  silently removes it.

## Task-brief pass, 2026-08-15 (CR2 spec 2a, Tasks 1-9)

- **"interface-notes §17 items 17 and 24" name the checkpoint content Task 9
  corrects.** False on the section: §17 has its own independently-numbered
  list stopping at item 22; the actual prose lives in **§20** items 17/24.
  **Technique: this doc renumbers from 1 at every `##` heading — grep the
  phrase, not the number; a bare "item N" finds the wrong section as readily
  as the right one.**

- **"recorded-actuals count, programmed count, 0x0039-seen (all in hand at
  the terminal tick)."** Two of three are; 0x0039-seen is NOT — `noteSummary`
  only persists inside an open grace (`run.closed === true`), so a 0x0039
  arriving before the terminal frame (walk-documented, real) is logged
  out-of-window and discarded with nothing stored. **Technique: "in hand" is
  a control-flow claim — trace whether the code path that would have stored
  the fact runs BEFORE the point that wants to read it, not whether the
  event happened.**

- **"67 test call sites" for buildSurfaceModel: counted 63** (54 via the
  `model()` wrapper + 9 direct). **Technique: when a brief says count,
  count with grep on distinct lines, not by eye.**

- **Task 5 filed `.connected-paused` under PaneLive.tsx; it lives in
  ConnectedSurface.tsx:436-447 (CSS index.css:6973+).** PaneLive owns the
  adjacent TOTAL LEFT bar, which is how two claims merged into one path.
  **Technique: when a brief bundles two "same area" claims into one file
  path, verify each claim's OWN grep hit — UI proximity is not tree
  proximity.**

## Spec-stage pass, 2026-08-16 (the stale-count rest fix + Stage B)

- **"Poisoned writes +233.3 m, register under-read of TWD elsewhere −12.6 m,
  net +220.7."** Only the SUM is right; both summands are wrong and the
  second has the wrong sign. Measured over the recording: poison +219.8 m,
  and the honest registers OVER-read TWD by +0.9 m (1599.9 vs 1599). The
  error is reconstructible to the digit — `461.4−260.1 = 201.3` plus
  `501.6−469.6 = 32.0` = 233.3, where 469.6 is the distance immediately
  after the @285.4 s mid-rest elapsed re-base: the honest baseline cut an
  interval short at a re-base, the exact misclassification the spec's own
  Stage B oracle was supposed to avoid. A Stage B band built on −12.6 m
  would have failed a correct fix. **Technique: when a spec offers a
  decomposition (A + B = observed), recompute BOTH summands, not the total.
  A decomposition that reconciles to the observed number is the most
  convincing way to be wrong, because the sum is the only part anyone
  checks — and reverse-engineering which wrong intermediate reproduces the
  stated figure EXACTLY names the analytical error for free.**

- **"A mutation of the clamp's comparison direction (`>` for `<`) is also
  caught."** True but worthless: with `>` the clamp never fires on either
  committed recording, so it is byte-identical to REVERTING the clamp —
  same registers (1819.7 m), same zero logs. It is the revert test wearing
  a hat, presented as independent evidence. Simulation found the two
  mutants that actually matter: `<=` for `<` survives every numeric
  assertion (identical 1599.9 m; caught only by an EXACT clamp-log count),
  and **dropping the `state === "resting"` guard is totally silent** —
  identical registers, totals AND log entries on both recordings, so the
  rule's entire scoping predicate is untested by the capture rung.
  **Technique: run each proposed mutant through the fixture and compare its
  output to the REVERT's output, not to the correct output. A mutant whose
  result equals the revert's tests nothing new; a mutant whose result
  equals the correct one is a hole in the suite.** Both are invisible if
  you only ask "does the test go red".

- **"The order of two clamps that both rewrite `activeKey` is a silent
  implementer trap."** Not here: enumerating all four cases showed every
  path converges on `max(seen)`, because the clamp's output is always a key
  already in `session.seen`, which short-circuits the refused-open guard's
  own `!session.seen.has(activeKey)` (`driver.ts:1914`). Simulating both
  orders gave identical registers and identical logs. **Technique: before
  writing an ordering finding, ask whether the first transform's OUTPUT
  falsifies the second's GUARD. Two clamps compose commutatively whenever
  one lands inside the other's exclusion set — cheaper to check than to
  reason about, and it turns an "ambiguous, must pin" into a "pin it for
  the log, the value is safe".**

- **"982 of 983 bursts put 0x0031 first (the 983rd is the first-ever
  notification)."** 983 of 983, and the excused case does not exist — the
  first 0x0031 precedes the first 0x0033 by 0.5 ms. **Technique: a
  hand-excused exception in a counted claim is the part to check first. It
  costs three lines of pairing to confirm, and "N−1 of N, because <story>"
  is how a plausible narrative gets written over a clean measurement.**

- **A capture can validate the FIX and still be blind to its RULE.** Both
  2026-08-16 recordings pin the clamp's arithmetic perfectly (post-fix
  accumulator tracks the PM5's own TWD within −1.3..+0.9 m at eight
  sampled instants, including the photographed frame) while pinning none of
  its scoping conditions. **Technique: for every conjunct in a new
  predicate, delete it and re-run the capture. The conjuncts that survive
  deletion are the ones needing a synthetic fixture — and they are exactly
  the ones a spec describes most confidently, because the capture agreed
  with them.**

- **Attacked and not broken:** the clamp rule itself, against reconnect
  (`session.seen` is reset only inside `program()`, `driver.ts:4239`, so a
  mid-session link gap preserves `max(seen)`), JustRow (structurally
  unreachable — `programLength 0 → null index → empty map → null key`,
  forever), the D3 phantom and `count = programLength + 1` (both folded by
  `toProgramIndex`'s upper clamp, `intervalIndex.ts:177`), the finished
  fallback, and the "keys only grow" universality claim within one run.
  One residual, disclosed rather than fixed: `session.seen` outlives the
  RUN, so a rower re-starting a workout on the erg without the app
  re-arming carries the old `max(seen)` — already broken today, but the
  clamp changes the failure's direction from undercount to inflating the
  previous workout's top key.

## Task-brief premise pass, 2026-08-16 (rest-keying-fix plan, Task 1)

- **"The armed program comes from each recording's header (`header.program`)."**
  Believed because the sibling harness (`recordReplay.roundtrip.test.ts`) reads
  `header.program` successfully and `RecordingHeader.program` is a typed field.
  FALSE for the two committed 2026-08-16 hardware captures:
  `grep -c '"program"' session-{1,2}-*.jsonl` returns 0 for both — the header
  line captured over real Web Bluetooth carries only `v`/`app`/`transport`/`ua`,
  no `program` key. The sibling test only has a populated `header.program`
  because it BUILDS its own header itself (`buildRecordingFile(tap, {...,
program: ROUNDTRIP_PROGRAM})` around a synthetic fake-driven session) — it
  never reads one out of a real capture, because a real Web Bluetooth capture
  never has one to read. `driver.program(p)` requires `WorkoutProgram`, not
  `WorkoutProgram | undefined`, so the plan's own interface (as written) is
  either a typecheck error or a `!`-suppressed runtime crash on the first
  hardware-replay test written against it. **Technique: grep the actual
  committed artifact for the literal field name a plan depends on, rather than
  trusting that a sibling test's successful use of a type-optional field means
  THIS artifact populates it — a reader working elsewhere proves the reader
  works, not that the specific file has the data.**

## Task-brief pass, 2026-08-16 (CR2 spec 2b, F6 Tasks 1-5)

- **"`useNavigate` is already imported in Today.tsx" / "the guard pin test
  passes unmodified."** Both false, and the second is the expensive one:
  `todayGuard.pin.test.ts:56-58` pins the EXACT import line
  `import { loadMonitorRun } from "../monitor/monitorRun";`, so widening
  that import for the new twin row fails the pin with the pinned guard
  byte-identical. **Technique: a source-pin test constrains more than its
  headline constant — before promising "passes unmodified", read every
  `toContain` in the pin file, not just the block it is named for.**

- **"Tests to update: monitorRun.test.ts + ConnectAction.test.tsx."** The
  set was found by grepping the function name; a third red test hid in
  `WorkoutDetail.test.tsx:1750`, which exercises `connectGuardStage`
  through the mounted ConnectAction and never names it. **Technique: for a
  copy-changing behaviour change, grep the ASSERTED COPY STRING across
  src+e2e, not the function name — host-component tests reach the guard by
  a route that never says its name.**

- **"Copy the client tests' `makeMonitorRun` shape for the e2e seed."** That
  shape (v1, empty program, no logSeed) makes `buildMonitorLogSteps` throw
  (`logDraft.ts:739-746`), so `monitorModeRun` silently degrades to the
  manual door and the e2e's header assertion can never pass. **Technique:
  before citing a fixture helper as a seed recipe, hand-run it through
  every gate the flow under test must pass — a seed that renders is not a
  seed that ENGAGES.**

- **Recurrence, third sighting:** `pnpm test --project unit -- <src file>`
  again briefed for a `src/` test file (unit = server/domain/scripts only,
  `vitest.config.ts:9-17`; the positional filter doesn't narrow). The
  2026-08-15 Stage A entry's technique caught it in seconds; the shape now
  qualifies as a standing check on any brief's verify commands.

- **Attacked and not broken:** Task 3 entirely (module-private
  `monitorLogTotals`, single caller `:1247`, every line number exact);
  Task 4's "not `fire()`" reasoning (`useStagedDiscard.fire()` really
  clears draft + phone run); the `endedBy` clause as a safe tightening
  (shallow validator, no fixture writes the field); the copy
  "interrupted connected session." against the spec's F6 text; and the
  Start-door blast radius (its mapping is `useStartWorkout.ts`'s own,
  so `session.spec.ts:1295` stays green by design — but
  `monitorRun.ts:519-521`'s "both doors speak the same two sentences"
  comment dies with the change and the brief's doc sweep stops one
  comment short of it).

## Spec-stage pass, 2026-08-16 (Phase CR2 spec 3, "the redesign")

- **"2a's mirror model feeds frame 2D; only the ghost COLOUR and the READY
  caption are new."** False — the up-next line is a third new thing, and
  the spec's own 2D table demands it. `upNextTextAt` is `phases[index + 1]`
  by construction (`Timer.tsx:272`) and `surfaceModel.ts:677` calls it with
  no armed branch, so armed shows the coming REST, never "the first interval
  forward". The committed capture says so outright:
  `docs/screenshots/connected-armed-landscape.png` reads
  `UP NEXT REST 3:00 · then WORK 2:06.0`. **Technique: when a spec says "only
  X is new", enumerate every field the target frame renders and trace each
  backward to its producer — and prefer the COMMITTED SCREENSHOT over the
  code for the fields you can see. A frame's picture is a per-field
  falsification oracle nobody has to run.**

- **"The type scale ships as written" is not a value change, it is a
  cross-surface change.** The eight `--size-*` roles are one global `:root`
  pair (`tokens.css:173-180`, `index.css:7163-7177`) shared with the
  unconnected phone timer — `--size-label` reaches `.timer-card-label` and
  the timer's own END, `--size-total` reaches `.timer-total-value`,
  `--size-subhero` is the timer's ALONE. So a spec that says "fork, do not
  reach the phone timer" and "ship the new scale" is asking for two
  incompatible things, and `tokens.test.ts:248` bans the obvious escape
  (`--size-*-landscape`/`-portrait`) by name while `:180` whitelists the
  exact token set. **Technique: before accepting a redesign's type scale,
  grep `var(--token)` for every role it moves and list the consumers OUTSIDE
  the surface being redesigned. A design token is a coupling; a scale table
  hides it behind a row of pixels.**

- **A high-fidelity handoff can re-propose a number the project already
  measured and rejected.** The packet's "grid rows 36px" is the same 36px
  `index.css:7858` records James ruling down to 32 on 2026-08-12 ("8 rows at
  36px is 288px, more than any measured build of this frame has ever
  offered"), documented in `DEVIATIONS.md:101` and pinned in
  `screenshots.spec.ts` (276px scroller, rowHeight 32, visible 8).
  **Technique: for every geometric constant a new design packet asserts,
  grep DEVIATIONS.md and the CSS comments for that same number before
  transcribing it. This repo writes its reversals down; a packet delivered by
  someone who has not read them will re-propose the original.**

- **"The gutter absorbs `env(safe-area-inset-left)`."** False and load-
  bearing: it is `max(left, right)` (`index.css:7281`), spent on BOTH sides
  (`:7321` padding-right, `:7457`/`:7475` gutter width + padding-left), and
  the `max()` exists for Android's asymmetric `DisplayCutout` with a
  shouting comment at `:7206` telling the next reader to keep it. A
  relocation instruction phrased with the single-sided `env()` deletes the
  Android fix in passing. **Technique: when a spec proposes to RELOCATE a
  computed value, quote the declaration, not the concept — a `max()` of two
  insets and one inset relocate differently.**

- **An exit criterion can name an artifact that does not exist.** "The walk
  sheet carries the re-pointed session-meters row" — `grep -rn "walk sheet"`
  over `docs/`, `ROADMAP.md` and both ledgers returns only the spec itself.
  The nearest real file is a PAST walk's `RUNSHEET.md`, whose two `TOTAL M`
  rows the redesign invalidates; editing it to describe a future walk
  corrupts a record. **Technique: for every exit criterion naming a document,
  `ls` its path. A criterion whose artifact has no path cannot be checked,
  and the file someone will edit instead is usually a record, not a plan.**

- **A "carried debt" tag is not a citation.** The iPhone 17 / Air "20pt
  landscape TOP inset" appears three times, all inside the spec, and nowhere
  else in the repo — while `index.css:7197` records that Chromium reports
  every `env(safe-area-inset-*)` as `0px`, so no gate here can observe it and
  the only source of a non-zero one is our own CDP override (the harness this
  ledger already caught inventing a rotation asymmetry). **Technique: grep
  the whole repo for a device constant a spec attributes to "carried debt"
  before letting a row COUNT be derived from it. Debt has a creditor; if the
  grep finds only the spec, the number was carried in conversation.**

- **The consumer inventory, done backward, found four dead fields where the
  spec named one.** `hr`, `intervalClockLabel` and `intervalClockValue` also
  lose their only render sites, `totalLeftSeconds` loses its (it was
  TimerRuler's prop) while the spec lists it as SURVIVING, and
  `elapsedDisplay` — the field that actually feeds the log sheet's SESSION
  line — is never named at all. **Technique: for a spec that deletes a pane,
  build the table before believing the prose — `grep "model\.<field>"` across
  the non-test tree for EVERY field, and mark each survives/dies. Prose
  inventories name the field the author was thinking about.**

- **Attacked and not broken:** every number in §2 against the handoff README
  (header, heroes, band, all seven grid columns, both type-scale lists,
  `--rule` = `#d8d3c4`, `--progress-active` = `#8a8478`) — no transcription
  error; the triple-tap port and its `logOpener` focus restore; `meters`'s
  single render site; the TimerRuler/UpNextStrip consumer set; the
  `.connected-paused` description; the armed TOTAL LEFT; and the
  decoration-only ruling on `--progress-active`, whose 3.29:1 on page is
  literally the ratio CLAUDE.md's recurring-failure #6 was written about.
  One residual disclosed rather than fixed: the bar's active-vs-upcoming
  segment contrast is 2.61:1, under WCAG 1.4.11's 3:1, defensible only
  because the same state is in the status text.

## Task-brief pass, 2026-08-16 (Phase CR2 spec 3, six briefs)

- **"Consumes X, Y, Z — the same values `TimerRuler` receives today from the
  model."** Three claims, three wrong: `boundaries` is `IntervalBoundaries`
  (an object, `surfaceModel.ts:315` / `intervalBoundaries.ts:47-49`), not
  `number[]`; TimerRuler receives no elapsed at all (`PaneLive.tsx:234-238`
  passes `totalLeftSeconds`/`totalSeconds`/`boundaries`); and `SurfaceModel`
  has no numeric elapsed field anywhere — only `elapsedDisplay: string`. The
  bar's only route to elapsed was `totalSeconds - totalLeftSeconds`, and
  `totalLeftSeconds` is the field the same spec's fate table deletes.
  **Technique: a props claim is settled by reading the CALL SITE's prop list
  and the interface's field types, never by the sentence "the same values X
  gets today" — that sentence is a memory of a concept, and a component that
  takes `remaining` does not take `elapsed`.**

- **A brief said "rewrite `PaneLive.test.tsx`" and "delete `PagerRail.tsx`
  (+ its test file)". Neither test file exists.** PaneLive's assertions live
  in a 1619-line `ConnectedSurface.test.tsx` and a 5593-line
  `design.spec.ts`, neither in the brief's Files list — so "rewrite one
  colocated file" was really "create one, then do surgery on two big ones".
  **Technique: `ls` every test path a brief names before believing its
  SCALE. A colocated `.test.tsx` is a convention here, not a guarantee, and
  the brief's estimate of a task's size is carried entirely by that
  assumption.**

- **"Copy the existing rail triple-tap tests — they exist."** They did — in
  `connected/ConnectionLogSheet.test.tsx:207-300`, eight of them through a
  `pagerTarget()` helper, in a file the brief never listed. The named file
  had zero (its one `triple` hit was an unrelated CSS class).
  **Technique: locate existing tests by grepping their ASSERTION HELPER or
  the selector string, not the feature word — behaviour tests in this repo
  routinely live in the file that owns the CONSEQUENCE (the sheet), not the
  one that owns the GESTURE (the surface).**

- **The fate table that calls itself "THE inventory" omitted the field that
  breaks.** `thenNext` appears in no row, while `upNext` gets an armed
  branch — but `thenNextTextAt` is `phases[index + 2]` (`Timer.tsx:290-298`),
  so shifting only `upNext` makes the armed band read
  `WORK 10:00 · then <the interval after the rest>`, skipping the REST the
  spec's own example names. The exit criterion greps the table, so the gap
  is self-concealing. **Technique: for a paired field (`upNext`/`thenNext`,
  `label`/`value`, `start`/`end`), check the SIBLING's producer whenever one
  of the pair changes index arithmetic. Inventories are written from the
  field the author was thinking about; pairs are where the other one hides.**

- **A deletion assigned to "the task that removes its render site" is wrong
  when the field has TWO render sites in two tasks.** `intervalClockValue`
  dies in Task 4 by the brief, but `PaneGrid.tsx:126` still reads it and
  `PaneGrid.tsx` is not in Task 4's files — the spec's own table said "PaneLive
  cell + PaneGrid headline" and the brief compressed it to one.
  **Technique: for every field a wave deletes, grep `model.<field>` across
  the non-test tree and check the SITE COUNT against the task that owns the
  deletion. One field, two tasks, is a typecheck failure the plan cannot see.**

- **A "regenerate the fixtures at the end" step can be a gate at the
  BEGINNING.** The ten frozen `e2e/fixtures/connected-*.html` are written by
  `ConnectedSurface.screens.test.tsx` via `toMatchFileSnapshot`, in the
  CLIENT project — so the first task that changes the DOM fails that test,
  not the last one. **Technique: before believing a plan's ordering for a
  captured artifact, find the writer. `toMatchFileSnapshot` turns a
  documentation step into a per-task green-suite obligation.**

- **"DEVIATIONS row N" is a LINE NUMBER, and the citations have already
  rotted.** The file says so itself (`DEVIATIONS.md:112-115`: add rows only at
  the bottom, citations rot on any insertion above) — and `index.css:7042`
  and `ConnectedSurface.test.tsx:482` both cite "row 4", which is prose, not
  a row. **Technique: when a brief says "reconcile the DEVIATIONS row",
  check the file's own citation convention first and find the row by
  CONTENT. Reconciling by deleting a row silently rots every citation below
  it, in CSS comments and test names where no compiler looks.**

- **A brief file is not the plan.** All six briefs were verbatim slices of
  the plan's task sections and carried none of its header — so the VALUE
  AUTHORITY ruling ("the spec's tables outrank any number this plan states")
  and the Global Constraints reached nobody who would implement against
  them. **Technique: when a wave's briefs are generated by slicing a plan,
  diff a brief against the plan and ask what the SLICE DROPPED. The header
  is where the rulings live and the slice never includes it.**

- **Attacked and not broken:** every line anchor in Task 1 (`PANES`/`PaneId`
  `PagerRail.tsx:28,30`; `useTripleTap` `:166`; `logOpener` `:225`;
  `handleRailPress` `:263-267`; `SWIPE_THRESHOLD_PX` `:93`; `paneAfterSwipe`
  `:99`); Task 5's "both row-height pins intact" (`index.css:6607`/`:7864`,
  `screenshots.spec.ts:2550`/`:2723`); Task 6's "regenerate by the existing
  route" (the route is real); and — the one I most expected to break —
  "extend `tokens.test.ts`" for a family scoped to `.connected-surface`.
  That file reads BOTH stylesheets as source text and locates blocks with a
  selector-agnostic scanner (`:66,69` + `scopedRuleBodies`), and
  `.connected-surface` has exactly one base and one landscape block, so the
  `:root` framing is convention, not capability, and the `toHaveLength(1)`
  idiom transfers unchanged. **Technique for the near-miss: before calling a
  pin file "structurally unable to see X", read its HELPER's signature — a
  test named for `:root` may be a general CSS-source scanner wearing one
  selector.**

## Phase-exit pass, 2026-08-16 (Phase CR2, the exit walk sheet)

- **"TOTAL LEFT is the distance verification route now that TOTAL M is cut."**
  False, and it wrote three rows of a release-gating walk sheet. `TOTAL LEFT` is
  `fmtDuration(totalLeftSeconds / 60)` (`surfaceModel.ts`) — a `m:ss` clock,
  as it has been since walk 4 (`ROADMAP.md` records the bug as "TOTAL LEFT
  rising at interval 2, METERS falling 109 -> 50"). The sheet asked the walker to
  photograph it beside the PM5's distance and expect agreement "within ~1 m".
  **Technique: for any walk row that says "these two numbers must agree", read
  the FORMATTER of each side, not its label.** A cell's caption is the last thing
  to change in a redesign and the first thing a protocol author trusts; `m:ss`
  versus metres is invisible in prose and fatal in execution. The committed
  design fixture settled it in one grep (`connected-pane-live.html` renders
  `39:48`), cheaper than reading the model.

- **"The rest-bearing session checks the clamp; the keystone re-run checks the
  screens."** Structurally inverted. The only comparison that reaches the
  register accumulator (the log sheet's `SESSION` line) was written into Session
  1 ONLY — and Session 1 is the 2×250 r0 keystone, whose committed capture
  contains workout states {0, 5, 10}: **zero resting frames, zero work→rest
  boundaries**, provably incapable of exercising the clamp. The row that checks
  could not exercise; the row that exercised could not check. **Technique: for
  every walk session, decode the committed capture of that same program and count
  the transitions the new code keys on. A program's ability to exercise a fix is
  a countable property of its own recording, not a matter of judgement** — three
  lines of state-byte decoding placed both rows correctly.

- **"An accumulator bug on the distance axis is only visible in distance."**
  False, and this is what rescued the sheet. Simulating the poison over
  `session-2-wu-4unequal.jsonl` reproduced the published 1819.7 m to the digit
  (which validated the simulation) and showed the SAME poison moves the elapsed
  axis by **+52.0 s** — 419.8 s honest vs 471.8 s poisoned, i.e. `SESSION` reads
  `7:51` where the erg reads `6:59`. One photograph. **Technique: a max-merge
  register holds a PAIR; a mis-keyed write poisons every dimension the register
  carries. Before declaring an oracle lost because its dimension left the screen,
  compute the bug's magnitude in the dimensions that remain.**

- **A release gate can contain a physically impossible step.** The sheet's item 4
  ("confirm the F6 reload session's logged minutes against the recording's own
  elapsed-seconds") gates the v0.10.0 tag, and the recording cannot exist: the
  recorder is `window.__pm5Recording__`, an in-memory global with no
  `localStorage`/`indexedDB` anywhere in `recording.ts` or `transports/index.ts`
  — and the same session's own instruction is "reload the browser tab". The act
  under test destroys its own evidence. **Technique: for every "compare X against
  the recording" step, ask what the step BEFORE it does to the recorder's
  storage. Persistence is a one-grep question and protocol authors never ask it.**
  (Fix was one line: download before the reload — the actuals are all pre-reload.)

- **A binding medium and a borrowed checklist can be mutually exclusive.** The
  sheet bound the walk to laptop Chrome + Web Bluetooth (`webBluetooth.ts:1-7`:
  "Chromium-only… a laptop has no Capacitor native shell") and then reproduced,
  verbatim, an 8-item list requiring a mounted phone — including a touch
  mis-hit test and a both-rotations occlusion check, the latter testing safe-area
  insets that are identically ZERO in desktop Chrome. Only one item was flagged
  moot. **Technique: when a protocol imports a checklist verbatim from a design
  handoff, re-ask each item against the EXECUTION MEDIUM the protocol just
  declared, not against the product.** Ledger technique 8 (check the harness's
  input capability) applies to human walks, not only to test suites.

- **Attacked and NOT broken:** the §2 property-table witness mechanism — my
  hypothesis that the design assertions read hand-written fixtures that could
  drift is false; `ConnectedSurface.screens.test.tsx:344-348` writes every
  fixture from the real component tree via `toMatchFileSnapshot`, and the one
  historical exception (`connected-armed.html`, documented as having gone stale
  twice) was closed by this PR. Also verified rather than trusted: criterion 5's
  gates (unit 1163, client 2814, **e2e 331 passed**). One row remains witnessless
  and is untestable as phrased — 2B's "TOTAL LEFT source … never plan+elapsed",
  which no assertion names and which the implementation contradicts literally
  (it IS `totalSeconds − elapsed`); a source claim cannot be witnessed from DOM.

- **Addendum (same pass, deeper evidence sweep): a `a ?? b` factory default
  makes every test blind to which field is wired.** Spec §2B's "TOTAL LEFT
  source" row was both false as written (the code IS plan minus elapsed; the
  invariant is WHICH elapsed) and unwitnessed: every frame factory in the
  repo defaults `sessionElapsedSeconds ?? f.elapsedSeconds`, so all five
  test files mirror the pair and mutating the model to read the
  interval-resetting `frame.elapsedSeconds` left the ENTIRE suite green —
  reintroducing the exact recorded hardware bug ("TOTAL LEFT … falling 1:30
  -> 1:11 and then RISING to 1:38") the line's own comment documents.
  Closed same-day: a diverging-fixture test now discriminates (mutation
  executed, went red, restored). Also closed: the progress bar's
  duration-proportional widths had no COMPUTED-style witness (the unit test
  reads the inline style; a CSS `flex-grow: 1 !important` would equalize
  the bar green) — design.spec now asserts computed flex-grow ratios.
  **Technique: when two fields of a fixture are related by `a ?? b`, every
  test that reads either one is blind to which is wired. Grep the FACTORY
  DEFAULT before believing any assertion that names one of them — the
  default is the assertion's real subject.**

## Spec-stage anchor pass, 2026-08-17 (Phase CS, "connected swipe + NEXT")

- **"The original swipe worked in every harness and failed under James's finger."**
  The premise of a whole phase item, and its only source is one clause in THIS
  ledger (`:66-67`, "and the rower says it does not work"), landed 2026-08-14/15
  with no device, engine or transport recorded anywhere in the repo. The record
  contradicts it: `ROADMAP.md:1755-1760` sets a Phase CR exit item "on his iPhone
  against a real PM5 … when swiping LIVE <-> GRID" and `:1777-1778` records it
  **PASSED, "it holds"**, on 2026-08-13 — one to two days earlier, on the exact
  engine the new spec suspects (a phone + real PM5 can only be the native
  Capacitor app; `walk-phase-cr2-exit/RUNSHEET.md:212-214`). Resolution: the
  controller ASKED JAMES at the gate; he confirmed the failure was on the phone
  (the walk's "it holds" was about column stability). The question cost one
  message and settled what the whole ladder could not. **Technique: when a
  spec's history section cites THIS ledger as its evidence, go find the ledger
  entry's own source. An agent-written parenthetical is testimony, and it inherits
  the confidence of a citation without ever having had one.** Corollary: grep
  ROADMAP's exit-and-outcome pairs for the same gesture before accepting "it
  failed on hardware" — this repo records what actually happened at the erg.

- **"A missing/overridden `touch-action` is the strongest candidate for the old
  device failure."** Falsified by the repo's own history in two commands.
  `git show 3dc3b06^:app/src/index.css` puts `touch-action: pan-y` at line 6041
  inside the `.connected-surface { … }` block that opens at 5988 — the very
  element carrying `onTouchStart`/`onTouchEnd` — and `grep -c touch-action` over
  that whole stylesheet returns **1**, so nothing overrode it either.
  **Technique: before theorising about why a deleted feature failed, `git show
<deletion-commit>^:<file>` and read the code as it actually shipped.** A
  hypothesis about a missing declaration is settled by the file it was missing
  from, not by reasoning about what the browser would have done.

- **"Pointer Events + `setPointerCapture` avoid the touch-specific cancel
  semantics."** False, PRIMARY: W3C Pointer Events 3 fires `pointercancel` when
  "the pointer is subsequently used by the user agent to manipulate the page
  viewport (e.g. panning or zooming)" and the same algorithm must "implicitly
  release the pointer capture". MDN `touch-action` says the same from the other
  side. Capture is no shield against gesture arbitration, which is the exact
  failure mode being chased — and the spec added an `onPointerCancel` handler four
  lines after claiming it didn't need one. **Technique: when a design's rationale
  says a new model avoids an old model's failure, find that failure's NAME in the
  new model's spec. `touchcancel` → `pointercancel` is a rename, not a fix; a
  design that then handles the renamed event has refuted itself in its own prose.**

- **A whole rung of a verification ladder can be structurally impossible.**
  `design.spec.ts:4589-4605`'s `loadConnectedFixture` does
  `document.body.innerHTML = <static html>` — no React, no handlers, no `pane`
  state — so "e2e asserts the swipe changes pane" cannot be written against the
  ten committed connected fixtures at all; it belongs in `connected.spec.ts`, the
  fake-driven live walk. Same rung, deeper: every harness that ever tested this
  gesture (the fixtures AND the standalone CDP repro) ran an IDLE static DOM,
  while the real surface rebuilds its model and both panes 5-11 times a second on
  iOS (`pm5-interface-notes.md:4403`). **Technique: for any input-level test, ask
  what the page is DOING while the input arrives, not just whether the input is
  real. Ledger technique 8 upgraded a harness's input capability; this is the
  other half — a static-page harness is blind to every failure whose trigger is
  load.**

- **`touch-action` is intersected only up to the first containing SCROLL
  container** (PRIMARY, MDN: "up to the one that implements the gesture (in other
  words, the first containing scrolling element)"). `index.css:6754` gives the
  connected grid its own `overflow-y: auto` scroller, so a swipe starting on a
  grid row — every GRID→LIVE swipe — may never reach the surface's `pan-y`.
  **Technique: "declare `touch-action` on the surface" is not a location. Walk the
  ancestor chain from where the finger actually lands and stop at the first
  `overflow` that isn't `visible`; that element is where the declaration has to be.**

- **A new string builder can drop a field that only two phase kinds carry.** A
  "kind + extent + split + rate" composition, applied literally, renders bare
  `TEST` and `WARM-UP 2000m`, silently discarding `label` ("All out", "Easy") —
  and the warm-up is the FIRST thing the connected NEXT line ever says for a rower
  with the preference on, because the armed branch reads `phases[0]`
  (`surfaceModel.ts:772-774`). **Technique: for any builder replacing a `switch`
  over a union, enumerate every member's producer and list which FIELDS each
  actually sets. `phases()` and `warmupPhases()` set disjoint subsets; a rule
  written from the two commonest members drops the other two in silence.**

- **Attacked and NOT broken (Phase CS vetted ground):** the CSS-ellipsis
  truncation design — the mechanism already ships (`index.css:6580-6587`), the
  direction claim is right, and it is MOOT: rebuilding both strings over all 3,063
  phases of the seeded 300 gives a new worst case of 30 chars against today's
  shipped 39 (`"NEXT · WORK 1:00:00 2:14.0 @20"` vs
  `"NEXT · WORK ALL OUT · then WORK ALL OUT"`), so the enriched line fits wherever
  today's does and the two committed `scrollWidth <= clientWidth` pins stay green.
  Also held: `Phase`'s field-presence rules for work/rest; `surfaceModel.ts:329-334`
  exact; TOTAL LEFT's non-shrink — but guaranteed by `flex: 1 1 0%` + `min-width: 0`
  on the SIBLING (`index.css:8093-8096`), not by anything on the cell itself;
  and PE/`setPointerCapture`/`touch-action` availability against the repo's
  iOS 15.0 deployment target (`project.pbxproj:239`).

## Phase-open anchor pass, 2026-08-17 (Phase PW spec 1, the post-workout summary)

- **"`Σ actual.distanceMeters` is the session distance — restore it as the walk's
  check route."** Off by 64 m against the machine on the one committed
  rest-bearing recording. Decoding every 0x0037 in `walk-2026-08-16/
session-2-wu-4unequal.jsonl`: Σ `splitIntervalDistanceMeters` = 1535, Σ
  `intervalRestDistanceMeters` = 64, and the final 0x0031
  `totalWorkDistanceMeters` = **1599** — exactly 1535 + 64. The PM5 counts the
  rower's coasting during programmed rests; `IntervalActual` has no slot for it.
  The r0 keystone agrees exactly (500 = 500), so the shape is invisible to the
  regression that runs today. The spec's exit criterion ("DISTANCE equals the
  actuals' sum on a replayed recording") compares the cell to the array it is
  computed from and would have gone green. **Technique: a characteristic that
  reports a WORK value beside a REST value reports two numbers, and the machine's
  own total is their sum. Before adopting one field as a session total, decode
  every field in the same record and check whether the machine's own total
  equals your Σ — the difference is the field you dropped, and it names itself.**
  Corollary: any exit criterion of the form "X equals the sum of the things X is
  computed from" is tautological; name the EXTERNAL number instead.

- **"Widening a stored column to NULL is additive."** At the DB layer yes
  (`DROP NOT NULL` is safe, and a `between 1 and 5` CHECK is satisfied by NULL
  per PostgreSQL's own rule). At the API layer no: `GET /api/logs` is an
  unprojected `db.select()`, `Today.tsx:1464` does `log.held.toUpperCase()`, and
  there is no `ErrorBoundary` anywhere in `src/` — so the first empty reflection
  blank-screens the landing route of every v0.10.0 TestFlight build, against
  `RELEASING.md:38`'s "old builds talk to the newest server". **Technique: for
  any column going nullable, grep the field's consumers in the SHIPPED client,
  not the branch's. The spec's read inventory is written for the code being
  edited; the breaking read is in the binary already on someone's phone. Ask
  which artifact the crash lives in, not which file.**

- **A warm-up is an interval to the accumulator and not an interval to the
  list.** `recordActual` files every boundary including the warm-up's, while
  `buildMonitorLogSteps` drops warm-up steps by kind — so heroes computed from
  `run.actuals` and rows rendered from `logSteps` disagree, on screen, by
  arithmetic the rower can do. Measured on `walk-2026-08-17/step-3`: AVG SPLIT
  2:40.4 with the warm-up vs 2:20.2 without; on `session-2` the shift is 1.3 s,
  i.e. 81% of the deviation bar's entire ±1.6 s scale. **Technique: when a
  design derives a TOTAL from one array and a LIST from another, diff the two
  arrays' membership before believing either. Two producers of "the intervals"
  is the default in this codebase, not the exception.**

- **"Time-only means nothing was measured."** False for the phone timer:
  `PhaseActual` is `{elapsedSeconds, splitSeconds, actualSource: "stopwatch"}` —
  a real reading the rower takes at a distance mark, rendered by
  `SessionComplete` today. A spec that maps doors to variants on a
  connected/not-connected axis prints `TARGETS ONLY · NOTHING MEASURED` over it.
  The data was already three-valued (`ActualSource`). **Technique: when a design
  offers two variants and the code offers three states, the spec has collapsed an
  axis. Find the existing union that models the distinction and count its members
  before accepting the binary.**

- **"The hint anchors the ruling on screen."** `TARGET m:ss` is undefined for
  133 of the 300 seeded workouts — 101 carry two or more distinct split refs
  and 32 are effort-only. **Technique: a spec phrase of the form "THE session's
  X" is a uniqueness claim about the corpus. Run it over the real 300 and count
  how many rows have exactly one — twelve lines of script, and it settles the
  rulings that hang off the hint.**

- **A chrome replacement deletes the tools bolted to the chrome.** `LogScreen`'s
  last two children are `MonitorLogRow` and `RecordingDownloadRow` — the
  latter shipped in PR #106 precisely because the walk operator could not reach
  Download anywhere else, and the CR2 exit pass's own fix ("download before the
  reload") depends on it being here. No spec section mentioned either.
  **Technique: read the render function's LAST lines before accepting "the chrome
  is replaced". Diagnostic affordances are appended, never designed in, so they
  live below the part a spec author reads and above nothing at all.**

- **Attacked and NOT broken (the phase's vetted ground):** that
  `IntervalActual.elapsedSeconds` might be work-plus-rest — the open caveat at
  `logDraft.ts:164-175` — is now settled on the wire (0x0037 reports
  `splitTime 60.0` beside `restTime 30` for a 1:00 r30 interval, in all three
  recordings), so the TIME formula double-counts nothing and the caveat can be
  retired with a citation. Also held, each after a real attempt: "Newsreader 500
  already loaded"; "meters already cross the wire in the steps jsonb"
  (unprojected `db.select()`); the `useLogForm` gate and `monitorModeRun`'s four
  conditions, quoted exactly; `DROP NOT NULL` at the DB layer including the pain
  CHECK; and killing `/session/complete` orphaning nothing. One arithmetic
  confirmation worth keeping: the PM5's own per-interval `avgPace` equals
  `500 × splitTime / splitDist` **exactly** across all nine committed boundaries
  — the spec's Σ-weighted average is the machine's own formula generalized, and
  the mock's unweighted mean of row paces (2:09.1 vs the correct 2:09.2) is the
  thing that is wrong.

## Delta pass, 2026-08-17 (Phase CS Item A, the device probe's verdict)

- **"The probe falsified the scroller-intersection candidate."** True of the
  horizontal case, and conditional in a way the README never said: the probe
  build (`d1da5f7`) ADDED `touch-action: pan-y` at three places, and
  `connected-polish` has none — `grep -n "touch-action" app/src/index.css`
  returns nothing. The falsification transfers only if those three
  declarations ship with the handler. **Technique: a probe's verdict is a
  claim about the BUILD IT RAN. Diff the probe branch's non-handler files
  against the branch that will ship, and re-read every "we falsified X" for
  whether X was falsified by the fix or by the environment.** A CSS file is
  where the environment hides.

- **"Vertical scrolling survives (a −178px vertical drag committed
  below-threshold)."** Unsupported by its own trace, and the README voided the
  premise three paragraphs later ("the row list may never have needed to
  scroll"). `.connected-grid-rows` is `flex: 0 1 auto` and hugs its content
  (`index.css:6727-6733`); with a short program NOTHING on that surface can
  pan, so the drag proves only that our handler declined to page. Settled by
  the trace's own decisive quote: the SUCCESSFUL drag's pointerdown targets
  bare `.connected-pane-grid` at y=230, which in a filled scroller would be
  inside the row list. **Technique: a negative-result claim ("X survived the
  gesture") needs proof that X was CAPABLE of happening. For scroll claims,
  that is a two-line geometry check — box height vs content height — not an
  event count.**

- **"Every genuinely operable control in this surface is a native
  `<button>`" — the premise a guard narrowing was justified with.** False:
  `SheetShell.tsx:123` is `<div className="filter-sheet-backdrop"
onClick={onDismiss}>`, rendered inside `.connected-surface`. Consequence nil
  (a separate `logSheetOpen` boolean covers it), but the narrowing takes the
  sheet subtree from two independent guards to one, and the survivor is a
  boolean the next overlay author must remember. The same pass found the
  probe's role census undercounted: it named `status` + two `group`s and
  missed `role="dialog"` (`SheetShell.tsx:127`). **Technique: when a guard is
  narrowed on the strength of "everything operable is an X", grep for
  `onClick` on NON-X elements across the whole subtree INCLUDING shared
  shells — the exceptions live in the generic component nobody counts as part
  of the screen.**

- **The planned regression pin could not exercise the gap it existed to
  close.** The real-touch e2e was to ride `connected.spec.ts`'s walk, whose
  fixture is five work intervals (`:84-90`, asserted `:626`), in a portrait
  390x844 project (`playwright.config.ts:22-24`) whose grid scroller holds
  FIFTEEN rows (`screenshots.spec.ts:2546/:2662`). Five into fifteen never
  scrolls — the pin would have reproduced the probe's blind spot exactly.
  Landscape needs >=9 rows, portrait >=16. **Technique (third recurrence of
  oracle blindness, after the 2x250 keystone and the a??b factory default):
  for any pin whose subject is a CONTAINER STATE, compute the fixture's
  content against the container's pinned budget. Both numbers are already
  committed as constants in the screenshot spec; the comparison is
  arithmetic, not judgement.**

- **jsdom 30 has `PointerEvent` but NO pointer capture at all.** Verified by
  running it: `PointerEvent: function`, `setPointerCapture: undefined`,
  `hasPointerCapture: undefined`; `pointerType` defaults to `""` and
  `isPrimary` to `false`. So an unguarded `el.setPointerCapture(id)` throws in
  every unit test, a guarded one silently tests a no-capture machine, and any
  handler branch on `pointerType`/`isPrimary` is dead-or-inverted unless every
  fixture sets it. What jsdom CAN do is discriminate the guard predicate
  exactly (`closest("…,[role]")` -> the `role="group"` scroller; the narrowed
  selector -> null) PROVIDED the test renders the real `PaneGrid` rather than
  a hand-built row. **Technique: before designing a jsdom oracle for a DOM
  API, run six lines of node+jsdom to enumerate what that jsdom version
  actually implements. It costs one tool call and it moved three "the unit
  test covers it" claims in this pass.**

- **A Chromium/CDP pin is on the WRONG SIDE of a documented interop gap, not
  merely "a different engine".** WebKit fires `pointercancel` during a
  horizontal pan on a `touch-action: pan-y` element inside a vertically
  scrollable page "unless the user is careful not to stray from a very
  straight horizontal panning gesture" — w3c/pointerevents#303, filed by
  `graouts` (Antoine Quint, WebKit), 2019-08-30, closed via PR #351; the
  issue's whole subject is that Safari and Chrome disagree. **Technique: when
  arguing that harness engine A cannot prove behaviour on engine B, search the
  standards body's ISSUE TRACKER for the interop gap by name. A WG issue filed
  by a vendor engineer is the strongest possible statement that the two
  engines differ, and it is far cheaper to find than a repro.**

- **Attacked and NOT broken:** the guard conviction itself. `.connected-grid-row`
  is a plain `<div>` with no handler (`PaneGrid.tsx:163-172`) whose only
  `[role]` ancestor is the scroller (`:143-146`), so `interactive: true` is
  entailed by the markup, not correlated with it. The one alternative the
  published evidence left open is the OTHER disjunct of
  `if (logSheetOpen || interactive) return;` — and the README's "verbatim"
  quotes stripped `kind`, `t` and **`logSheetOpen`** from every pointerdown
  entry, with the raw trace uncommitted. It dies on geometry instead:
  `.filter-sheet-backdrop` is `position: fixed; inset: 0; z-index: 30`
  (`index.css:663-672`), so while the sheet is open nothing can hit-test to a
  grid row; the recorded target proves the sheet was closed. **Technique: when
  a guard is a disjunction and the evidence records only one disjunct, do not
  accept the conviction on the recorded one — find the physical fact that
  excludes the other. Hit testing against a `fixed; inset: 0` overlay excludes
  more than any log line.** And: quote elision is a defect in a record that
  will outlive the trace — commit the raw artifact or mark the elision.

## Phase-exit pass, 2026-08-18 (Phase CS, the swipe + NEXT)

- **"The diagonal drag fails because of a documented WebKit limit — W3C
  pointerevents#303."** Cited in three artifacts (probe README, walk README,
  `connected.spec.ts`'s pin header) as a live interop gap. The issue is
  CLOSED, resolved by w3c/pointerevents **PR #351 (merged 2021-02-19)**,
  which added a normative SHOULD saying close to the opposite: with
  `touch-action: pan-y`, once the UA has decided at the START of a gesture,
  "a subsequent change in the direction of the same gesture SHOULD be ignored
  ... if a touch gesture starts off horizontally, no vertical scrolling should
  occur." The report is also about **iOS 13, 2019**. So the observation may be
  real but it is a CONFORMANCE question, not a limit the platform documents —
  and the iOS version that would settle it is the field the walk record
  omitted. **Technique: when a spec cites a bug tracker issue as its
  authority, read the issue's RESOLUTION, not its opening comment. A closed
  issue's fix is often a normative clause pointing the other way, and "filed
  by a vendor engineer" is provenance for the report, never for the verdict.**
  (Controller's note: verified independently against the tracker before
  landing this entry — the correction itself got the treatment it prescribes.)

- **"The rows scrolled up and down, so the UA claimed the gesture."** Does not
  follow. `swipe.ts` refuses any drag with `|dy| >= |dx|` — so a
  _deliberately diagonal_ drag is refused by OUR OWN rule with the UA doing
  nothing, and the probe had already recorded this device delivering
  `pointerup` (never `pointercancel`) on a -178px vertical drag. A third
  mechanism fits too: a `pointerup` at coordinates frozen where scrolling took
  over yields a sub-threshold `dx`. Three producers, one observation, and the
  one instrument that discriminates was inert. **Technique: when a walk
  instruction asks for the EXTREME version of an input ("a deliberately
  diagonal drag"), check whether the app's own guard rejects that extreme by
  construction. The gesture the source describes (a near-horizontal that
  strays) and the gesture the walker was told to make are different
  populations, and only the second was tested.**

- **A build-flag instrument can be untestable by the suite that pins it.**
  The `pointercancel` readout is gated on `import.meta.env.DEV ||
import.meta.env.VITE_ENABLE_FAKE_MONITOR === "1"`; `ios:build` is
  `vite build` (DEV false), so ON THE PHONE only the flag arm can fire — and
  the pin runs under vitest, where DEV is true. Measured: `CI=true
VITE_ENABLE_FAKE_MONITOR= pnpm test --project client` -> 115 files / 2928
  tests, all green. Deleting the flag arm keeps every gate green and disarms
  the phone's only instrument for the phase's one open risk — the exact
  disarming that had already cost this walk once. **Technique: for any code
  behind `A || B`, run the suite with B forced off. If it stays green, B is
  untested — and if B is the only arm true in the PRODUCTION build, the test
  proves nothing about the artifact anyone ships.**

- **"Two identical CI failures falsify the theory."** They falsified ONE
  theory (Chromium tap heuristics) and a second was adopted without a
  control: no run was ever made without the swipe handler, and `grep -rn
"\.tap(" app/e2e/` shows no green `locator.tap()` anywhere in this repo, so
  "headless Chromium can't tap this" has no precedent either. The downgrade
  to `.click()` also deleted the only automated touch coverage of the rail —
  the fallback path the phase's own platform-limit acceptance rests on.
  **Technique: a repeated failure is evidence about the mechanism, not about
  the harness, until you run the SAME assertion against a build without your
  change. "It failed twice the same way" is equally consistent with a real
  regression.**

- **An exit criterion's field list can be silently shortened in the report
  that claims it.** Criterion 2 demanded "medium/BUILD/iOS recorded", written
  precisely because the original device report lacked those fields; the walk
  record has medium only, and the PR body reads "medium/**program**
  recorded." **Technique: at a phase exit, diff the criterion's own noun list
  against the artifact's, word for word. A criterion written to fix an
  omission is the one most likely to repeat it, and the substitution happens
  in the summary, not in the evidence.**

- **Attacked and NOT broken:** the disposition rule itself — pre-registered
  before the walk, applied literally, and no fourth outcome class it fails to
  sort; the narrowed `isSwipeBlocked` predicate (pinned in jsdom AND e2e
  against the REAL `PaneGrid`, since a hand-built row has no `role="group"`
  ancestor and would pass against the broken predicate); the scrollable-grid
  e2e, which opens on `scrollHeight > clientHeight` and asserts `scrollTop`
  actually moved; the `touch-action`/`user-select` pins, which read COMPUTED
  style in a real browser on both the surface and the scroller — the thing
  that makes the probe's conditional falsification transfer at all; and
  criterion 3, verified by opening `connected-armed-landscape.png`.

## Spec-stage full pass (triad), 2026-08-18 (Phase PW spec 2, "from the log")

- **"Opening a detail screen lands at the top — same witness shape as the News
  fix."** The News fix's own CSS comment (`index.css:4992-4996`) records THREE
  window-scroll fixes lost to real iOS WebKit, and `App.tsx:16-17` records that
  **Playwright's WebKit never reproduced the failure**. Only the overlay
  scroller worked, and its `position: fixed` then clamps `window.scrollY` to 0 —
  the sibling requirement's own bug. **Technique: when a spec cites a past fix as
  its witness, read that fix's comment for what it TRIED and what the harness
  could SEE. A repo that fixed something four times wrote down why the first
  three greens were lies, and the citation usually points at the green.**
- **"Cursor = the last row's `loggedAt`+`id` pair, stable under equal
  timestamps."** False before it reaches equal timestamps. Postgres `timestamptz`
  is microseconds (`now()` measured `.884291`); drizzle maps it through
  `new Date()`/`toISOString()` (`pg-core/columns/timestamp.js:30-36`) —
  milliseconds. The truncated cursor sits EARLIER than its own row, so rows in
  `[cursor_ms, true_ts)` are skipped permanently: a four-row demo returned only
  the last one, two real rows gone. **Technique: for any keyset cursor, run the
  timestamp through the ORM's `mapFromDriverValue` and back and diff it against
  the column's declared precision. The type in the schema is not the type on the
  wire, and truncation toward zero SKIPS rows rather than duplicating them —
  silent, not noisy.**
- **"The client posts what the summary displayed; the server stores it
  verbatim."** Impossible: `SummaryHeroes` is `{avgSplit?: string; time?: string;
distanceMeters?: number}` — two of three are pre-formatted strings by design
  (`summaryModel.ts:121-133`). **Technique: before accepting "we store what we
  rendered", read the render model's TYPE. Display models are strings on purpose
  in this repo, and "copy the rendered value" into a numeric column always means
  a second reach past the model.**
- **"Written in the same transaction as the plan_state upsert, so they can never
  disagree."** The upsert (`stores/logs.ts:129-137`) is `insert {userId, doneN:1}
onConflictDoUpdate set doneN+1` — it carries no `planKey`, never reads `doneN`,
  returns nothing, and increments even when `plan_key` is NULL. **Technique: a
  "same transaction" guarantee names two writes; open the transaction and check
  the second one actually HAS the values the first is claimed to agree with. An
  upsert that only increments knows neither the key nor the index.**
- **A design can kill an inference on the write side and re-import it on the
  read side.** §2 rejected mapping done-rows to logs by order because Reset and
  Switch zero `doneN` while logs persist (`stores/planState.ts:35-40`) — then
  §3 resolved links by `plan_index`, which those same operations make
  NON-UNIQUE per plan_key. **Technique: after a spec rejects an alternative for
  a stated reason, re-apply that exact reason to every other section. The
  rejection proves the author saw the hazard; it does not prove they carried it.**
- **Two API personalities.** POST `/api/logs` ignores unknown keys; the repo's
  only partial update, `PUT /api/prefs`, documents ignoring them as required
  (`data.ts:884-890`); the spec's PATCH 400'd on them — which also breaks
  additive-only in the new-client/old-server direction (`RELEASING.md:38`).
  **Technique: before specifying validation on a NEW route, grep the nearest
  existing route of the same verb-shape and quote its behaviour. "Same
  validation as POST" usually means the value checks and silently inverts the
  unknown-key policy.**
- **`real` is not "full precision".** float4 round trip measured:
  `2.7182818284 → 2.7182817`. Postgres's shortest-round-trip text output hides
  it for ≤7-digit values, so a client-side formatter comparison — the spec's own
  exit criterion — cannot see it at all. **Technique: a "byte-for-byte equals
  what we rendered" criterion that formats BOTH sides in the same process has
  tested the formatter, not the storage. Push the value through the real column
  and prove the probe can go red.**
- **Attacked and NOT broken (PW spec 2's vetted ground):** the timer door's TIME
  survives a reload (`summaryModel.ts:584` reads the persisted run, not screen
  lifetime); every §4 burn citation is real and individually verified
  (`e2e/session.spec.ts:1038/1065/1146`, `News.tsx:209`, `AppRoutes.tsx`'s
  `CompleteRedirect`, `BackLink.tsx`'s §2A label ruling, `Today.tsx:1458`'s
  reused empty-state string); POST stays additive for v0.11.0 clients; migration
  0010 is uncontested by any open PR; and DISTANCE-vs-machine-total remains the
  one genuinely EXTERNAL oracle in the criteria list.

## Spec-stage anchor pass, 2026-08-18 (Phase CM, "connected metrics")

- **"`Total Work Distance` excludes rest meters" (INFERENCE, from the field
  list) — so the live total is `0x0031` TWD + `0x0032` restDistance.**
  Falsified twice over by decoding the committed raw captures. TWD's final
  value equals Sigma work PLUS Sigma rest exactly (`session-2-wu-4unequal.jsonl`:
  1599 = 1535 + 64), and TWD ticks up one metre at a time DURING each rest in
  lockstep with `restDistanceMeters` — so the sum double-counts the current
  rest (measured overshoot +30 m). Worse, TWD is not a live counter at all:
  it is a step function frozen for the entire work interval, advancing only at
  boundaries and during rests (62 changes in 983 frames). Mid-work the spec's
  number reads 360 m where the machine has 809 m. **Technique: for any field
  whose name contains a scope word ("work", "total", "session"), plot it
  against the frames' own state byte before believing the name. A field-list
  INFERENCE describes the DOCUMENT's taxonomy, never the firmware's — and the
  cheapest disproof is "does it move when the rower is resting?", three lines
  over a capture we already own.** Corollary that generalises: a counter's
  UPDATE CADENCE is as load-bearing as its scope, and no vendor table states
  it. Ask "how often does this change?" of every field a design puts on a
  live screen.

- **"The just-finished interval's average, held from the interval's end
  through the rest, from the `0x0038` boundary record."** Structurally
  impossible: `0x0037`/`0x0038` carry the interval's own restTime/restDistance,
  so the PM5 cannot emit them until the rest is OVER. Measured: interval 2
  ends t=112.8 s, the record lands t=142.9 s — 0.3 s before the rule says to
  discard it. Through the whole rest the newest `0x0038` is the PREVIOUS
  interval's, so rest #1 shows the WARM-UP's 2:28.5 where the interval
  averaged 2:11.0. And the mechanism is unnecessary: `0x0033.splitAvgPace`
  already holds the finished interval's average flat for the entire rest,
  agreeing with `0x0038` to <=0.2 s across all five recorded rests.
  **Technique: for any "hold the value from record X across window W", find
  X's ARRIVAL TIME in a capture and check it falls inside W. A record that
  reports what happened during W cannot exist before W ends — and the field
  the design is trying to reproduce is usually already being held by the
  machine, one characteristic over.**

- **"A +/-0.5 s/500m dead band makes the on-target state stable."** The band is
  not the problem. Measured across seven work runs, the live interval average
  does not enter +/-0.5 s of its own final value until 65-99% of the interval
  has elapsed (median ~80%) — the standing start dominates. So the judged cell
  reads SLOWER for most of every interval regardless of the rower, and becomes
  informative only when there is least time to act. **Technique: before tuning
  a threshold on a running average, plot the average's CONVERGENCE against
  the window it averages over. "Is the band right?" is the wrong question
  whenever the quantity has not settled; no scalar fixes a transient.**

- **An exit criterion can be blind by TIMING rather than by construction.**
  "The live total equals the summary's DISTANCE at the end of a piece" cannot
  fail: at the terminal frame `restDistanceMeters` is 0 in every completed
  capture and TWD has caught up, so the correct value, the double-counted
  value and the frozen value all agree there. The two defects are visible
  only mid-work and mid-rest. **Technique: for every equality criterion, ask
  at WHICH INSTANT it is evaluated, then check whether the terms are
  degenerate at that instant. An end-of-session comparison is blind to every
  bug whose magnitude is zero at the end — which is most accumulator bugs.**

- **Recurrence, third sighting: ask what the fake FEEDS the field under test.**
  `fake.ts:672` zero-fills `splitAvgPace` and `:690` zero-fills
  `restDistanceMeters`, so every fake-driven harness (e2e, the ten frozen
  connected fixtures, `VITE_ENABLE_FAKE_MONITOR=1`, screenshots) is
  structurally blind to BOTH numbers this spec adds — the AVG cell renders
  nothing and the total adds zero. And `fake.ts:592-630`'s TWD model
  (`Math.trunc(distanceMeters)` on a time goal) is a third wrong world,
  contradicted by 2,363 raw frames.

- **Attacked and NOT broken (Phase CM vetted ground):** the 0.01-vs-0.1
  sec/lsb split between `0x0033` and `0x0038` is real, not a mis-transcription
  — `0x0038` raw/10 reproduces `500 x splitTime / splitDist` exactly at all
  nine committed boundaries, and `parse.ts:200`/`:274` are both correct (which
  also means the spec's headline "10x hazard" is already neutralised before
  any consumer sees it; the swap that CAN happen post-parse yields two values
  0.2 s apart). `splitAvgPace` really is the programmed interval's own average
  and resets exactly at work-interval starts (matched to `0x0038` in three
  files) — but no committed capture holds an interval longer than 500 m /
  129 s, so the multiple-splits-per-interval question is genuinely open and
  the walk should keep asking it. "Treat a zero average as absent" is right
  (the zero is on the wire at workout start and at each new interval's first
  frame), though the spec cites the Last Split CHECKPOINT pair for it, which
  is a different field. And the summary's DISTANCE now equals the machine's
  own total to the metre (1599 = 1599, 500 = 500).

### Delta pass, 2026-08-18, Phase CM — the rest-phase referent switch

- **"During a rest, `frame.intervalIndex` names the interval that just
  finished, so the row can safely show its target."** FALSE for the first
  emitted frame of most rests: 4 of 5 rest entries across every committed raw
  capture (`walk-2026-08-16/session-2`, `walk-2026-08-17/step-3`) carry an
  index one whole interval behind for **450-540 ms**. _Technique:_ decode the
  raw jsonl and replay the DRIVER'S OWN emission rule, not the wire's. A frame
  is emitted only from the 0x0031 handler (`driver.ts:3298`, deliberate —
  comment at `:3182`), so a late 0x0033 never gets a frame to correct itself
  and the documented 10-93 ms wire skew becomes a FULL STATUS TICK on screen.
  Counting notify records misses this; counting emitted frames finds it.
- **"The driver already clamps the stale rest count."** Half-true, and the
  dangerous half is the other one: the stale-count rest clamp
  (`driver.ts:1870-1887`) lifts `activeKey` (the register map) only, while the
  consumer-facing field is built six lines later from the UNCLAMPED value
  (`driver.ts:1989`, `{ ...base, intervalIndex }`). _Technique:_ read the line
  that CONSUMES the clamped variable, never the clamp itself. Scar tissue can
  be real and still not cover the seam you are standing on.
- **"`splitAvgPace` reads 0 on the first frame of each interval"** (the spec's
  own field table). FALSE: the first emitted frame of every work start in
  every capture carries the PREVIOUS interval's average for 450-540 ms; 0
  arrives on the second frame. Same one-tick mechanism. _Technique:_ a claim
  about "the first frame" is about the EMISSION, not the field.
- **An accepted limitation needs a number before it is accepted.** "An r0
  program never shows a verdict" sounded like an edge case; against the real
  seed it is **33 of 300 library workouts (11%)**, including 20-interval
  pieces and every float workout, with zero AN coverage — and the walk's own
  keystone (`session-1-keystone-2x250r0`) has **0 resting frames in 286**.
  _Technique:_ quantify the accepted loss against production data
  (`server/seed/library/`), and check whether the phase's own regression
  capture can even reach the new code.
- **Survived the attack:** the pane DOES disambiguate a phase-dependent
  referent. `headerTrailing` renders `intervalLabelShort` in both orientations
  (`ConnectedSurface.tsx:125-141`/`:498`; `index.css:7292` resets order only,
  never display), reading `3 OF 4 · REST` off the SAME index the target would
  use; and `upNext` during a rest names the FOLLOWING work phase with its
  split and rate (`surfaceModel.ts:207` + `:837` + `:152`). _Attack used:_
  traced both fields to their render sites AND their CSS, rather than trusting
  the doc comments — which in this file have twice described renderers that
  had already retired.

## Ad hoc pass, 2026-08-18 (PR #123, the session-meters counter's flooring fix)

- **"Flooring the meters counter fixes the jitter — the tenths were ticking
  every ~450ms."** The premise is true and the fix does almost nothing.
  Decoded 1085 0x0031 frames from `walk-2026-08-18-metrics/pyramid-pm5-
recording-*.jsonl.gz`: over 357.7 s of rowing the DISPLAYED STRING changed
  1.97/s with tenths and **1.96/s floored**. The rate is `min(tick rate,
speed in m/s)` — at 3.72 m/s and 1.97 ticks/s the counter was already
  tick-limited, advancing a median 1.90 m per tick, so every tick crossed a
  metre boundary either way. **Technique: measure the change rate of the
  RENDERED STRING, not the precision of the field behind it. A formatting
  change that removes a digit removes churn per repaint, never repaints per
  second — those are two different quantities and only one of them is what
  "jumpy" means.**

- **"The walk validated the calm."** The walk's rowing leg was Chrome on a
  laptop (~508 ms effective spacing); its iPhone leg was the ZERO-STROKE
  swipe leg (that walk's own README). `driver.ts` requests 100 ms and iOS
  delivers ~90-180 ms (`pm5-interface-notes.md`, hardware-observed).
  Resampling the same motion at the iOS spacing: **3.71 repaints/s on the
  primary surface, ~2x what James called "far too jumpy" on the laptop.**
  At >=2 m granularity the rate becomes speed-limited and therefore
  transport-independent; at 1 m it inherits whatever the transport does.
  **Technique: before accepting a UI-calm verdict, resample the capture at
  the SHIPPING platform's own measured notification spacing. A desktop walk
  is a different transport, not a slower version of the same one.**

- **"The PM5's own screen truncates the same way (325 beside our 325.4)."**
  False, and the cited evidence cannot decide it: floor(325.4) == round(325.4).
  Decoding `totalWorkDistanceMeters` at all three walk instants — rest-1
  325/325/325, rest-2 1043 vs ours 1042.1, **finish 1347 vs floor 1346 vs
  round 1347**. At the only instant where floor and round disagree, the
  machine agrees with ROUND. Worse, `summaryModel.ts` rounds, so the live
  counter said `1,346m` where our own summary and the machine both say 1347.
  **Technique: a rounding-convention claim needs a data point where floor
  and round DISAGREE. A citation whose value satisfies both conventions is
  decoration. And when one screen changes its rounding, grep every other
  screen that renders the same number.**

- **Attacked and not broken:** the shimmer worry and the staleness worry.
  Playwright `setContent` against the three real rules measured `1,042m` /
  `1,888m` / `1,111m` at an identical 81.859 px — `--font-mono` falls back to
  `ui-monospace` and every candidate is fixed-advance, so same-width digit
  swaps genuinely cannot shimmer. Staleness is an explicit link event with
  its own banner, caption and `LAST` label — the counter's motion is not the
  liveness cue, so quantising it introduces no stalled/live ambiguity. What
  the same probe DID find: `flex: none` with no `min-width` made the bar's
  width a function of the counter's character count — **999m -> 1,000m
  shrank the bar 27.3 px on a 390 px pane**, at exactly the milestone James
  named. **Technique: a layout-shift claim is cheap to settle for real —
  `page.setContent` with the rules copied verbatim, `getBoundingClientRect`
  on the FLEXING sibling, no server and no stack. Measure the neighbour that
  absorbs the change, not the element that causes it.**

## Spec-stage full pass (triad), 2026-08-18 (log-delete: the first DELETE + a counter write)

- **"Deleting a plan-linked log and decrementing `done_n` un-ticks that
  session's checkmark."** Believed because the spec reasoned about the last
  session only. False for every earlier index: `done_n` is a positional COUNT
  (`data.ts:959`) while `plan_index` is immutable history, so deleting index 0
  of a two-save cycle un-ticks index 0 and STRANDS the index-1 survivor at
  status "today", where `Plan.tsx:292` never consults its link. **Technique:**
  booted the server from source against a scratch DB, made two ordinary
  advancing saves, applied the spec's rule in raw SQL, and read the two SHIPPED
  read paths (`GET /api/plan`, `GET /api/logs?plan=`) back. The arithmetic was
  readable in three lines; only the round trip made the orphan visible.
- **"The exit criterion's e2e proves the checkmark re-points."** False: its
  fixture (save, Reset, save, delete the newest) drives `done_n` to 0, so the
  checkmark disappears instead. **Technique:** RUN THE FIXTURE THE CRITERION
  SPECIFIES before believing its stated outcome — then find the minimal fixture
  that WOULD pass. Here that fixture exists and is itself a demonstration of the
  defect the criterion was blind to. An exit criterion is a claim, not a plan.
- **"Condition 2 makes the `done_n` floor unreachable; the clamp is
  belt-and-braces."** False under this DB: `show default_transaction_isolation`
  is READ COMMITTED, so a Reset or Switch committing between the DELETE's
  decide and its write lets `done_n - 1` land on -1 or on the wrong plan's
  counter. And -1 is not benign — `GET /api/today` returns "No **undefined**
  sessions in your library" (`sequence[Math.min(-1, …)]`). **Technique:** ask
  the database what isolation it actually runs at, then WRITE the impossible
  value and call the read paths. A guard split across a read and a later write
  is not a guard; put the predicate in the UPDATE's WHERE and lock the row
  (`FOR UPDATE`) the concurrent writer already locks.
- **"The client can evaluate the server's predicate from the row plus plan
  state."** False: the newest-wins condition needs a SIBLING fact carried by
  neither `GET /api/logs/:id` nor `GET /api/plan` — only by
  `GET /api/logs?plan=`. **Technique:** capture the actual response bodies and
  try to compute the predicate from them by hand. Predicate-agreement designs
  fail on INPUTS far more often than on logic; a shared imported predicate makes
  the logic test true by construction and proves nothing about the inputs. When
  agreement can't be guaranteed, have the server RETURN what it did.
- **Operational:** a worktree's own compose stack can be many commits stale —
  `ergomatic-61404` served a `session_logs` with no `plan_key` column while the
  branch's source had it for two specs. **Technique:** before trusting any
  browser/API probe, ask the running stack for a column or field the newest
  spec introduced; if it's missing, rebuild or run the server from source
  against a scratch DB (`DATABASE_URL=…/scratch npx tsx server/index.ts`,
  migrations apply at boot — ~12s, and it's the honest oracle).
- **Attacked and held (this spec's vetted ground):** Switch-back cannot
  mis-decrement (doneN zeroing + newest-wins are both load-bearing); newest-wins
  re-point needs no tombstone (demonstrated live); POST writes only
  plan_state + session_logs, so deletion has no hidden derived state; the
  owner-404 idiom carries; the cross-cycle re-pointed log renders its own date
  and footer from its own columns — the honesty question was the tick's, not
  the link's.

## Phase-open anchor pass (triad), 2026-08-18 (Phase LT spec 1, "target truth")

- **"The target stroke rate already lives in the row label's authored text."**
  False everywhere: both timer and manual labels are `refPaceLabel` =
  `${duration} @ ${refLabel(ref)}` (`logDraft.ts:199-201`), and `refLabel`
  (`domain/pace.ts:106-111`) emits only base/±off or MAX/MIN. A spec justified
  hiding a new cell by claiming the value was already on screen. **Technique:
  when a design omits a field because "it's already shown somewhere", open the
  FORMATTER that builds the string it points at, not the object that holds the
  value.**
- **"`deviceName` non-null → the row's `spm` was measured" as the back-compat
  discriminant.** Unnecessary and wrong for new rows: the door is knowable
  PER ROW — `actualSource: "pm5"` is written unconditionally beside the only
  `step.spm = actual.avgSpm` write (`logDraft.ts:770-777`) and by no other
  builder — and the rule as written carries no age test, so it re-reads every
  post-split authored target as a measurement. **Technique: for any
  "distinguish old rows from new" rule, first look for a field already written
  in the same `if` block as the ambiguous one. A row-local discriminant beats a
  row-external one, and a rule about "old rows" needs a predicate that can
  actually tell their age.**
- **"Judged when the row has BOTH a measured actual and a target."** "Measured"
  is not a field: `actualSplit` is also written with `actualSource: "assumed"`
  — equal to the target — for every non-effort manual row (`logDraft.ts:481-483`)
  and for completed timer TIME phases. Literal implementation paints the entire
  by-hand door red `+0.0`, because `judge()` reads deviation 0 as SLOWER
  (`summaryModel.ts:229-237`). **Technique: when a spec's gate uses an adjective
  ("measured", "real", "actual"), find the union that already encodes it
  (`ActualSource`) and make the spec name the member set. Adjectives compile to
  presence checks.**
- **A "zero means placeholder" premise nobody had ever seen.** The floor change
  (`MONITOR_SPM_MIN` 0→1) is safe — `avgSpm` is a u8, 1 spm/lsb
  (`pm5/parse.ts:271`), so sub-1 is unrepresentable — but all 14 committed
  0x0038 boundary records across six captures read 23-29, never 0; the only
  demonstrable producer of 0 is our own fake (`fake.ts:833`). **Technique:
  separate "safe by construction" from "witnessed". A band change justified by
  device behaviour should cite a frame that shows the behaviour; if the captures
  can't, say the argument is about the FIELD'S TYPE instead.**
- **A "reproduce it and file what you find" open item that the code already
  answers.** END closes the record (`useMonitorSession.ts:1436-1449`), the nav
  carries `?from=monitor` (`WorkoutDetail.tsx:337`), the gate passes, and the
  monitor door's discard is unconditional (`LogSession.tsx:1066-1078`,
  `PostWorkoutSummary.tsx:537-541`). The only discard-less save surface is the
  manual door (`discardSlot={null}`, `:1218`) — where the monitor path lands on
  ANY gate miss, including a catch-all `catch {}`. **Technique: before accepting
  "reproduce, then fix", enumerate every render site of the missing affordance
  and diff them; a missing control is a code question far more often than a
  device question. And name the BUILD — a tester's repro lives in the binary he
  rowed, not in main.**
- **Attacked and held (Phase LT vetted ground):** warm-up carries no target on
  all three doors (`logDraft.ts:305-317/:465-471/:757`; the distance warm-up's
  display estimate is nulled at compile, `program.ts:125-131`); effort rows
  genuinely lack `targetSplit` by the 6I rule while keeping measured actuals;
  no non-monitor row can carry `deviceName` (`LogSession.tsx:1016` is the only
  writer); additivity is witness-backed (`steps` is jsonb,
  `validateLogStepEntry` never rejects unknown keys, GET is an unprojected
  `db.select()`); retiring the `count>=2` lone-row gate is sound because the
  tautology it guarded was self-comparison. One cross-surface seam found and
  RULED at the gate (James: same band everywhere): the connected rest verdict's
  ±0.5s dead band now binds the summary too — the two surfaces' wire fields
  agree to ≤0.12s across every rest-bearing capture.

## Vetted-ground amendment, 2026-08-18 (Phase LT Task 1 review broke anchor claim B3's soundness)

- **The anchor's "row-local discriminant" (`actualSource === "pm5" &&
actualSpm === undefined` → pre-split measured value) was UNSOUND for new
  rows.** A matched actual whose measurement is DROPPED (avgSpm null/0/out
  of band) plus the unconditional authored-target copy produces a shape
  byte-identical to a pre-split row — so the renderer would print the
  rower's target as his measured rate. Found at TRIAD task review by asking
  what every WRITE path can produce, not what the discriminant reads; the
  exhibit was already in the suite (a walk-derived synthesized actual with
  `avgSpm: null`). **Amendment (spec §2): the monitor builder writes the
  authored `spm` only alongside `actualSpm` — a dropped measurement writes
  neither — so the ambiguous shape is unreachable by new code and the
  discriminant is sound BY CONSTRUCTION. Technique: a discriminant over
  stored shapes is only as sound as the writers' reachable-shape set;
  enumerate what new code can WRITE before trusting what old rows imply.
  When a discriminant is ambiguous, prefer shrinking the writer's shape set
  over widening the reader's heuristics.**

## Spec-stage full pass (triad), 2026-08-19 (Phase LT spec 2, "series capture")

- **"The wire's elapsed can key a 1 Hz decimator, and rests are recorded
  because the machine keeps reporting through them."** The machine reports;
  the CLOCK DOES NOT. Across the 30 s rest in `walk-2026-08-17/step-3`, all 66
  0x0031 frames carry elapsed frozen at 60.00 and distance at 213.7 (0x0032
  identical) — so an elapsed-keyed decimator emits ZERO samples for every rest,
  under both the raw wire field and driver.ts's register-map sum. step-3: 308.5 s
  wall → 243 samples. **Technique: when a design keys on a field, replay the
  captures and print that field's VALUE through the state you care about — not
  the frame count. "The frames keep arriving" and "the field keeps moving" are
  different claims, and only the second one keys anything.**
- **"Keyed on the WIRE's elapsed (`t`), cumulative — never duplicates."** Two
  fields wearing one name: 0x0031's elapsed is PER-INTERVAL (`parse.ts:311-317`,
  walk 4), and the only cumulative value is `MonitorFrame.sessionElapsedSeconds`,
  a DERIVED sum (`driver.ts:2148-2155`). Keying on the wire field collapses
  step-2 from 139 to 75 distinct seconds — the resets at wall=75.83 (wState 4→4,
  a restSeconds:0 boundary) and 167.27. **Technique: when a spec names a field
  and states its semantics in the same table cell, check whether the semantics
  belong to the field or to something downstream that computes it.**
- **"A total serialized byte ceiling of 1 MB" on the POST.** `app/server/app.ts:30`
  is bare `express.json()`; body-parser 2.3.0 defaults `limit` to 102400
  (`lib/utils.js:61-63`). Probed against real express: 2200 samples (106 KB) →
  413 `entity.too.large`; 14,400 (720 KB) → 413. True ceiling ~2,150 samples
  ≈ 36 minutes — below the memo's own 70-minute case. And `LogSession.tsx:437-466`
  turns any non-ok into a permanent "Try again" over a deterministic body, so the
  ROWER LOSES THE WHOLE LOG, not just the trace. **Technique: a size ceiling in a
  spec is a claim about the middleware, not about the validator — read the
  framework's default and POST a real body of the stated size before believing
  either. The sacrifice ordering that protects localStorage must be repeated at
  every OTHER boundary the payload crosses.**
- **"The final sample's t/d agree with the machine's own terminal totals."**
  ZERO 0x0039 end-of-workout frames exist in ANY committed recording (7 session
  dirs + 3 top-level .gz; 0x0037/0038 pairs present 7/10/12) — the external number
  the oracle names is not in the corpus, and CLAUDE.md item 11 already names the
  substitute ("each interval's own final pre-reset reading"). It also fails by
  construction: step-4's final decimated sample is t=43.16/d=150.7 against the
  machine's t=43.67/d=151.8. **Technique: before accepting an external-number
  oracle, grep the corpus for the CHARACTERISTIC that carries the number. An
  oracle whose authority does not exist in the fixtures is an oracle that will be
  loosened at task time.**
- **"Riding the existing `recordActual` write — zero new write events."**
  `recordActual` (`monitorRun.ts:373-392`) has no buffer parameter and RETURNS
  EARLY WITHOUT SAVING on a refused actual (`:387-389`), a branch production
  reaches (`useMonitorSession.ts:1101-1111`). **Technique: "rides an existing
  write" is only true if the existing writer can SEE the new data and always
  fires — read the early returns, not the save call.**
- **Attacked and held (LT spec 2 vetted ground):** `isMonitorRun`
  (`monitorRun.ts:149-176`) is a pure positive conjunction with no unknown-key
  or key-count check, so `series`/`seriesDropped` survive the never-migrate
  validator — the `endedBy?` precedent is real. The log door reads
  `loadMonitorRun()` fresh (`LogSession.tsx:1219-1224`), so a series-less retried
  record posts consistently. The ≤30 s loss window survives iOS backgrounding
  because `Info.plist` declares NO `UIBackgroundModes` — a suspended app receives
  no frames either, so nothing accrues to lose. `JSON.stringify` of 14,400
  samples measured at 0.61 ms (bound 100 ms), real size 720 KB not 650 KB.
  `navigator.storage.persist()` never prompts (PRIMARY, webkit.org/blog/14403) —
  and the same heuristics mean a Capacitor WKWebView is probably DENIED: free,
  not mitigation. `LOG_LIST_COLUMNS` exists (`stores/logs.ts:150`).

## Delta pass, 2026-08-19 (Phase LT spec 3, "trace rendering")

- **"Interval boundaries can be derived by summing the stored steps' durations."**
  False twice over, and the repo had already solved it. (1) The series starts at the
  first rowing-active frame — the WARM-UP (`useMonitorSession.ts:1120`) — while
  `buildMonitorLogSteps` emits no step for one (`logDraft.ts:851`), and
  `storedSummary.ts:50` says the stored shape cannot recover it: every mark lands one
  whole warm-up too far left, and the "totals disagree" guard never fires because the
  disagreement IS the warm-up. (2) The named fallback ("the prescribed duration
  otherwise") does not exist for a distance interval — `durationText`'s comment states
  the construction guarantee that a work step has EXACTLY ONE of seconds/meters.
  **Technique: before accepting a derivation over a stored shape, grep for a module
  that already performs it** — `session/intervalBoundaries.ts` had the fold, the
  lead-in, the warm-up cap and an "honest stop" for the unpriceable piece, all with
  their rationale attached. Second technique: **when a spec inherits a per-row field
  and starts CUMULATING it, its per-row caveats are new ground** — `actualSeconds`
  carries an unverified work-vs-work+rest unit caveat that is bounded per row and
  compounding once summed.
- **"A 5th-95th-percentile clip marks the exceptional outlier."** False on this app's
  own data. Replaying the three committed captures through the recorder's decimation
  rule: 26% of samples carry `p === 0` (`seriesRecorder.ts:283` maps both a null
  reading and the machine's own zero to 0), 262 of them in state `rowing`, in 12
  separate runs up to 85 s long — 8,098 frames literally send `"currentSplit":0`. So
  p5 = 0 exactly, and on a faster-is-up axis those render as twelve plunges to
  "infinitely fast". Excluding zeros, p5/p95 still clips ~10% of EVERY session's
  samples, because instantaneous 1 Hz pace is that noisy. **Technique: compute the
  proposed statistic over the committed captures before believing a story about what
  it will select.** A ~40-line replay script settled in minutes what the fixture
  ("steady rowing plus one 164 spm") was constructed to confirm — and the exit
  criterion written around that fixture would have passed while the mark fired dozens
  of times per real trace. Corollary: a "min/max preserved per column" decimation rule
  PROTECTS sentinel artifacts as faithfully as it protects real spikes.
- **"A rest leaves a gap in the trace's clock."** False — the work clock freezes, so no
  new whole-second bucket is crossed and rests produce zero samples by construction.
  But gaps ARE real: 5-6 per capture, largest 41 s, from rejected reset candidates and
  dropped frames. **Technique: when a spec forbids reading a gap as a boundary, count
  the gaps in the captures and ask what actually produces them** — the prohibition was
  right and its stated cause was wrong, which made the exit criterion's fixture
  unbuildable as written.
- **Attacked and HELD (spec 3's vetted ground):** the stored source round-trips
  (`data.test.ts:1994`) and the list still excludes `series` (`stores/logs.ts:177-185`);
  the shared horizontal domain already makes a late-starting HR line honest; the
  inverted pace axis contradicts no shipped surface (the deviation bar draws faster
  LEFT of a centre tick, which is orthogonal); min/max decimation is
  orientation-independent; and the controller's bundle probe method is sound — a
  `window.location.search` gate is a runtime value Rollup cannot fold (this repo's own
  recurring failure #12 records the converse), so +94 KB gz is a floor, re-measured
  independently at 158.18 KB gz baseline today.

## Phase-exit pass, 2026-08-20 (Phase LT, the close-out walk + exit criteria)

- **"The phone can be dumped over Safari Web Inspector before Log it."** False on
  the build under test. `WKWebView.isInspectable` defaults false since iOS 16.4
  (webkit.org/blog/13936, PRIMARY); Capacitor sets it from `isWebDebuggable`
  (`CapacitorBridge.swift:458`), true only via config, `#if DEBUG`, or Info.plist
  `CAPACITOR_DEBUG` (`CAPInstanceDescriptor.swift:137-147`) — and `debug.xcconfig`
  is the `baseConfigurationReference` for the DEBUG configs only, while
  `ios-release.sh` archives `-configuration Release`. The 2026-08-19 walk's own
  Web Inspector dump worked because it was an Xcode DEBUG build. **Technique: a
  debugging route proven on a dev build is a claim about the BUILD CONFIGURATION,
  not the device. Follow the flag from the plist through the xcconfig to the
  configuration the release script actually names.** Same class as
  `VITE_ENABLE_FAKE_MONITOR`.
- **"F-2: does the NATIVE transport sample TWD at all?"** Malformed. Total Work
  Distance is bytes 11-13 of 0x0031 (`pm5-interface-notes.md:459`, C2 BLE doc
  p.13; `parse.ts:135`) — the same characteristic every frame rides, so no
  transport can deliver frames while omitting it. Decoding byte 8 + bytes 11-13
  across the committed corpus settles what the observation actually meant: TWD is
  ZERO for all 94 frames of walk-2026-08-17/step-4 and through every first work
  interval, first going nonzero at a completed boundary (152/391 and 145/287 on
  the two 2×250 captures, max 500). A 45 s single-interval piece can never produce
  a nonzero machineTotal. **Technique: before booking hardware time for a "does
  the device do X" question, find which characteristic carries X and replay the
  corpus for it. A transport question and a machine-behaviour question look
  identical in a ring entry.**
- **"The same-frame DISTANCE photo goes at rest 1, because the REST screen shows
  the session total and the END screen does not."** The phone half does not exist
  at rest 1: the DISTANCE hero is Σ over IntervalActual (`summaryModel.ts:577-583`)
  and renders only after Log it; the live pane's counter is the register-map
  accumulator (`PaneLive.tsx:150-155`), a different derivation already
  hardware-checked 2026-08-18. **Technique: for a same-frame oracle, check BOTH
  sides exist in the same instant — name the render site and the moment it mounts,
  not just the number.**
- **"Item E re-observes F-1."** F-1's two surviving theories are
  interruption-specific ("a fourth actual written by something only the real
  browser does at reload"), and item E is a normal completion. The TIME-hero
  formula IS shared (`measuredSessionSeconds` is a literal alias of
  `interruptedTotalSeconds`, `monitorRun.ts:665`) — so the walk exercises the
  formula but cannot exercise the theory. **Technique: an open finding's
  re-observation must reproduce its MEDIUM, not just the code path it printed
  through. Read the original finding's disposition paragraph, not its headline.**
- **The phase's flagship feature has no picture of real data.**
  `screenshots.spec.ts:1915-1923` honestly labels `log-detail`'s series hand-built,
  then calls `log-monitor` "a genuine recorder replay" — but that series is the
  REAL recorder fed HAND-SCRIPTED fake-transport events whose own comment concedes
  they are "WIRE-IMPOSSIBLE-but-harmless". Neither capture can show the 26%
  sentinel breaks or a real 41 s gap. **Technique: "real X" in a fixture comment
  is a claim about the INPUT, not the module — ask which half of the pipeline the
  word is defending.**
- **Attacked and HELD (Phase LT exit ground):** spec 2's replay oracle is NOT
  oracle-blind — `toMonitorFrame` passes `elapsedSeconds`/`distanceMeters` through
  raw (`parse.ts:497-498`) and `maybeEmitFrame`'s emitted object spreads `base`
  untouched, the register max-merge touching only `session*` fields the recorder
  never reads (`driver.ts:2136-2156`), so the hand-built replay frames are faithful
  for exactly the two fields under test. Spec 3's sentinel and gap criteria are
  proven against committed captures, not fixtures (`traceModel.test.ts:167/190/215/262`).
  The walk plan's own "four asks against two rests" worry is unfounded (three are
  no-rowing, before the piece). The simulator settles nothing here: TestFlight
  builds cannot run on it, and `isNative()` routes to Capacitor BLE which rejects
  "BLE unsupported" (`capacitorBle.ts:138-145`; Apple TN2295) — so the armed
  connected surface every bundle item needs is unreachable. WebKit says
  `env(safe-area-inset-*)` tracks device physics, not browser chrome
  (webkit.org/blog/7929, PRIMARY) — the Safari-in-simulator worry was right about
  the conclusion and wrong about the mechanism; it is `100dvh` under collapsing
  chrome that does not transfer, not the insets.

## Spec-design pass, 2026-08-20 (Phase LL, "EST LEFT" — the countdown that stalls)

- **"The rower's position inside a rest is unknowable from the wire, so the
  estimate must be reconstructed from programmed lengths."** False, and the
  answer was already parsed in-repo: `0x0032` Additional Status 1 offsets
  13-15 carry **Rest Time** (0.01 s/lsb; `pm5-interface-notes.md` §10;
  decoded at `parse.ts:169`), counting DOWN in real time regardless of the
  flywheel — measured on `session-2-wu-4unequal.jsonl`, interval elapsed
  frozen at 133.08 for 26 s while restSec ran 26.91 → 1.85. Consumed by
  nothing; `fake.ts` hardcoded it to 0, which is why no test could ever have
  surfaced it. **Technique: before accepting "the machine cannot tell us X",
  grep the PARSER for X.** This repo decodes more of the wire than it
  consumes, and a field parsed-but-unused reads exactly like a field that
  does not exist. Second technique: a spec that FORBIDS an input has usually
  enumerated exactly two options; go looking for the third.
- **"The bar's fill and the countdown are computed separately today."** False
  and self-refuting: `surfaceModel.ts:970-984` gives `max(0, T−x)` and
  `min(x, T)` off the same `x`, and `T − min(x,T) ≡ max(T−x, 0)`.
  **Technique: when a spec explains a shared symptom by claiming two
  independent producers, do the algebra before believing there are two.**
- **"A completed-phase accumulator can only step forward."** False: five
  measured backwards steps on one capture, worst −428.5 s at the `finished`
  frame because `frame.intervalIndex` is null there and `surfaceModel.ts:703`
  launders it `?? 0`, collapsing phaseIndex 7 → 0. **Technique: implement the
  proposed formula verbatim in a throwaway replay test and assert MONOTONICITY
  over a real capture — do not reason about it.** Then grep for `?? 0` on the
  field your formula keys on and read who already refused it and why: the same
  file refuses that laundering for the AVG cell, 160 lines away.
- **"Ten minutes of rest, about a minute of drift — the right order of
  magnitude."** Not a confirmation. Measured loss is 77% of rest wall-time,
  predicting ~7:40 for that session. James was paddling lightly, which
  reconciles it — but only once asked. **Technique: when a spec offers an
  observed magnitude as evidence FOR a mechanism, compute what the mechanism
  actually predicts. Off by 7× is under-determination wearing a
  confirmation's clothes.**
- **Citation hygiene, twice in one spec.** §4 cited `types.ts:36-38` for
  flywheel gating (that passage says something else); it also named the
  2026-08-20 walk record as replayable when that record's own README — which
  the controller wrote — says no wire recording exists for the phone half.
  **Technique: open every capture a spec names and count the frames before
  planning work that replays it.** `ls` settles it in five seconds.
- **Attacked and HELD:** the wall-clock prohibition (PW's shipped promise;
  `Date.now()` genuinely breaks on suspend), `totalSeconds` including rests,
  the subtraction being the mechanism, and `phases` being the flat work/rest
  list. **The FAKE-VS-PARSER AUDIT that followed found the dangerous bucket
  EMPTY at the time — CORRECTED 2026-08-20, same commit range as the fix it
  gated: it is not empty any more.** The audit's own prediction landed on
  its own subject the moment the fix shipped — `restSeconds` gained a real
  consumer (`surfaceModel.ts`) and the fake's own value for it stayed `0`
  for every existing fixture (script-authorable since this task, never
  scripted by any e2e/screenshot fixture) — the exact HARDCODED-bucket shape
  the audit was built to catch, now occupied by the field it was written
  about. No live defect follows from this (the consumer is proven correct
  against real wire bytes via a replay test, never the fake), but the
  fake-driven layer has zero discriminating power over the mechanism as a
  result — corrected in `docs/monitor/fake-vs-parser-audit.md` itself
  (headline findings 1/3, the `restSeconds` table row, the two-rest-time-
  fields section, and the "which HARDCODED fields" section).

## Ecosystem review under THE BAR, 2026-08-21 (connected state vs Concept2's logbook)

- **"Our accumulator agrees with the machine, so our numbers are right."** True and
  irrelevant. Total Work Distance is work PLUS rest-coast metres — decoded to the
  metre on two captures (session-2: 1535 work + 64 rest = 1599 = terminal TWD;
  pyramid: 1300 + 47 = 1347) — and Concept2's `distance` is work only. So the one
  external number we check ourselves against measures a quantity the authority does
  not store, and PR #123's celebrated sub-metre three-way agreement cannot see the
  gap. **Technique: before trusting an oracle, ask what QUANTITY it measures, not
  just whether it agrees.** An oracle that shares your definition is a mirror.

- **"The end-of-workout summary path is a fallback we have not exercised much."**
  False, and much worse: 0x0039 and 0x003A are subscribed in every one of the six
  committed wire recordings and have delivered **zero** notifications, across five
  natural finishes. WORKOUTSTATE_WORKOUTLOGGED has never appeared either. An entire
  subsystem — `noteSummary`, `graceIsOpen`, `armSummaryReconcile`,
  `deriveFinalIntervalFromSummary` and its two agonised-over premises — is dead code
  at the erg, and we disconnect 22-107 ms after the terminal frame. **Technique:
  count the RECEIVE frames per characteristic across every committed capture before
  reasoning about any code that consumes one.** `grep` on the subscribe list proves
  intent; only the rx census proves arrival.

- **"The specification says 0.1 sec lsb, four times, in two documents."** False.
  Last Split Time is 0.01 s/lsb: nine capture pairs where 0x0037's tenths value is the
  exact truncation of 0x0033's hundredths, plus the PM5's own memory screen (7476 →
  1:14.7). Our decode is 10x too LARGE and dormant. It survived because
  `statusFrames.ts` is a deliberate byte-inverse of the parser and `parse.test.ts:198`
  pins the same wrong scale by hand. **Technique: neither a round-trip through your
  own encoder NOR a hand-built fixture is an oracle for a scale. Only a capture or the
  machine's own screen is.** A vendor document is a hypothesis about the wire.

- **"Three heroes on one screen, all derived from the same session, must agree."**
  Never checked, and they do not: DISTANCE and TIME imply 2:32.7/500 m beside an AVG
  SPLIT hero reading 2:08.5 on the same stored row (24.3 s apart; 39.9 s on the
  pyramid piece). Each is computed over a deliberately different population of
  intervals. **Technique: when a screen shows N numbers derived from one session,
  recompute each from the others by hand before shipping.** PR #117 shipped this exact
  shape and seven reviews missed it; the PM caught it with arithmetic.

- **"No capture evidences that state, so the guard does not need to cover it."** The
  claim was true when written (`driver.ts:2094-2099`, state 9) and false two days
  later — `walk-2026-08-18-metrics` contains the frame, and the walk's own README said
  so while the code comment did not. **Technique: when a walk lands a capture, grep
  the guards whose comments say "no capture evidences this" and re-read every one.**
  A comment that cites the absence of evidence has an expiry date and no alarm.

- **"The premise is unverifiable on a healthy row."** False: it was verified, by a
  capture committed five days after the premise was written down, whose own entry
  printed its three-way decision rule before the numbers
  (`walk-2026-08-15/session-c-rewalk-row1.json` seq 35: 120 == 120, not 150, not 60).
  Nobody read the answer back, so the driver still hedges and the interface notes still
  send the next conductor to re-row it. **Technique: an instrument that prints its own
  decision rule has already decided; grep the CAPTURES for the instrument's format
  string before scheduling hardware to answer the question.**

- **Attacked and HELD:** the boundary pairing by identity rather than arrival order;
  the register map's key discipline (and the recorded failure of its unconditional
  generalisation); the both-sentinels-null HR rule; the band guards on interval rows;
  the refusal to fabricate a measurement; the build-time gate keeping the recorder out
  of production `dist/`. Also held: 0x0037's split time is WORK-ONLY, re-derived here
  from the programmed interval lengths (1:00 r30 intervals read 60.0, not 90.0) — an
  external anchor our own §20 item 22 never considered while calling the question open.

- **Refuted candidate findings, recorded so they are not re-raised:** (1) "the series
  fold and the driver fold are two independent derivations we could reconcile" — the
  recorder keys on the driver's own post-clamp emitted index, so a lost interval is
  lost by both and the delta is exactly zero in the case it was meant to catch;
  (2) "0x003A carries three fields nothing else on the wire gives us" — two of the
  three are on 0x0037 and already decoded; (3) "our review's claim that we have no
  route to the monitor's log is half wrong" — the sentence attacked says the LOG has
  no route, and Concept2 publishes the log READ COMMANDS while publishing none of the
  record layouts, which is exactly the original claim.

## Phase-open anchor pass (triad), 2026-08-21 (Phase WU, "the warm-up leaves")

- **"The two unions are compile-coupled and cannot be split — removing
  `Phase["type"]`'s member alone errors at `WorkoutDetail.tsx:275`."** False as
  stated, and backwards. Measured in a throwaway worktree with `tsc -b --force`:
  removing `Phase["type"]` alone gives 29 distinct errors over 15 files and **no
  `WorkoutDetail.tsx` error at all** — shrinking the source union leaves
  `EnginePhase` a SUBSET of `CompiledPhase`, still assignable. Only the reverse
  order breaks the mirror (probe B, 77 errors). Both at once: 59 errors, 23 files
  (7 source, 16 test) — SMALLER than either half implies, because 18 of B's files
  were pure mirror-breakage noise, and `WorkoutDetail.tsx` needs no edit under the
  approach actually chosen. **Technique: when a spec says two type changes are
  coupled, run BOTH orders and the COMBINATION, and diff the three file sets. A
  coupling claim derived from two separate one-at-a-time probes describes an
  intermediate state nobody will ever compile; C ⊄ A ∪ B tells you which errors
  were real work and which were the half-removal talking.**
- **"Approach A removes the union members so the compiler enumerates every
  dependent."** False for the dangerous half. `grep '"warmup"'` over non-test
  source found FOUR unions carrying the member, not two: `LogSeed.steps[].kind`
  (`logDraft.ts:590`) and `IntervalSegments`'s `kinds` (`:24`) are invisible to
  both probes — and the first is PERSISTED, with its own comment saying "doing so
  is a stored-shape migration, not a comment sweep". Its two readers are exactly
  the ones protecting stored numbers: `logDraft.ts:851` (keeps the warm-up out of
  a SAVED log) and `summaryModel.ts:564` (keeps it out of AVG SPLIT).
  **Technique: a `tsc` error census is an enumeration of the union you edited, not
  of the CONCEPT. Grep the string literal across non-test source and bucket the
  hits by which union each belongs to — the ones the compiler misses are
  disproportionately the persisted ones, because a stored shape is exactly the
  place a codebase keeps a second copy of the discriminant.**
- **"§5 covers the stored population: forward-only, rows already logged."**
  Incomplete — there is a second population and it is the one that can still
  change. `MonitorRun` and `SessionRun` both persist to localStorage under
  deliberately shallow validators with no version bump and no strip
  (`run.ts:74-90` is `Array.isArray(value.phases)`), so a pre-WU UNLOGGED record
  survives the update. Deleting `warmupIndex` moves that record's AVG SPLIT;
  deleting `logDraft.ts:851` adds a phantom row to what gets SAVED; and the timer's
  exhaustive switches have no default — probe run: `phaseKindWord("warmup")` returns
  `undefined`, rendering `STEP 1 OF 5 · undefined`. **Technique: for any removal of
  a value from a union, ask which records ALREADY ON DISK contain it, then read the
  loader's validator to see whether it can reject them. "Rows already logged" and
  "records already written" are different populations, and only the second one is
  still being read by live code paths.** Corollary: an exhaustive switch with no
  default is a runtime `undefined` generator the moment the union shrinks under it.
- **"§4: `0007` dropped two warm-up columns and its own comment says why — they
  were 'never consumed anywhere'."** The comment does not exist:
  `0007_shallow_kang.sql` is three lines of SQL. The quoted text is
  `schema.ts:228-231` and says the OPPOSITE — "the **override** was never consumed
  anywhere; **minutes' one consumer, the Builder hint, is rewritten against this
  column**" — and `git show dad9643 -- server/stores/preferences.ts` removes both
  fields from the drizzle SELECT in the same commit as the migration. **0007 IS the
  hazard the spec cites it as a counterexample to.** The repo's real precedent is
  the num retirement (`f0a2166` → `16ded6c`, whose message spells out the
  two-release contract). The conclusion (expand/contract) holds and is stronger
  than argued: `scripts/deploy.sh:22-30` rolls back by `git checkout --force $PREV`
  - rebuild (an old SERVER image, not just old clients), `/api/health` is `select 1`
    and stays green over a dead prefs path, and `stores.preferences.get()` has four
    callers including `GET /api/today`. **Technique: when a spec attributes a
    rationale to "its own comment", open the file and `grep '^--'`. A migration quote
    that actually lives in `schema.ts` has been paraphrased at least once, and the
    paraphrase is where the scope qualifier ("the override") gets dropped.** Second
    technique: **for any rollback argument, read the health check the rollback gates
    on** — a `select 1` cannot see a column.
- **"Exit criterion 2: the whole-session numbers move by exactly the warm-up's own
  contribution and no more."** Not evaluable, and two of the three terms cannot
  move at all. Decoded all five 0x0037 records from `session-2-wu-4unequal.jsonl`:
  DISTANCE (`summaryModel.ts:577-583`) and TIME (`monitorRun.ts:639-649`) are
  unconditional over `run.actuals` and never consult warm-up-ness — 1599 m and
  8:08.4 both ways. The sole mover is AVG SPLIT, 2:08.5 → 2:09.8, a RE-WEIGHTING
  with no additive "contribution" to compare against. **Technique: before accepting
  a criterion of the form "X moves by exactly Y", read each term's producer and ask
  whether it can move at all; then ask whether the moving term is a SUM (where a
  delta is meaningful) or a RATIO (where it is not). A criterion phrased additively
  over a weighted average cannot go red on the right thing.** The honest form names
  the value. And the inert control was missing: `session-1-keystone-2x250r0` is the
  no-warm-up capture that must change by nothing, and no criterion named it —
  the oracle-blindness shape, with the only named capture being the one that MUST
  change.
- **"§6: nothing is offered in place; the release notes are history."** One live
  surface is instructional, not historical:
  `news/content/bodies/yourFirstRow.tsx:13-14` is an evergreen onboarding article
  telling the rower "set yours on the You tab under WARM-UP" — plus
  `validate.ts:85` and `bulk.ts:362`, two live strings pointing at a screen that
  will not exist. **Technique: "the copy is history" is a claim about each string's
  TENSE, not its file. Grep the user-facing strings and sort them into dated notes
  versus evergreen prose; the evergreen ones are instructions, and an instruction
  that names a deleted control is recurring failure 13 aimed at a tester.**
- **"§9: keep `droppedWarmupNotice` — a pasted `wu` line already fails validation
  (`validate.test.ts:68`)."** Conclusion right, reason false. `bulk.ts:334-339`'s
  `tryParseWarmupLine` intercepts a well-formed `wu N` and `continue`s BEFORE
  `parseStepLine` builds a Step, so no `{k:"wu"}` ever reaches `validateSteps`; the
  cited test calls the validator directly with a hand-built step. The paste yields
  the NOTICE, not an error. **Technique: when a spec justifies keeping a guard by
  citing a DIFFERENT guard that "already" handles the case, trace the input from the
  entry point and find where it stops. A test that constructs the offending shape
  by hand proves the validator, never that anything can reach it.**
- **"WU shrinks RC-5 to the rest question alone."** Quantified: 5%, and 0% on the
  other exhibit. Session-2's hero contradiction goes 24.2 s → 22.9 s; the pyramid
  capture (39.9 s) is three work intervals with no warm-up, so WU moves it by
  nothing. **Technique: when a phase's payoff is "it shrinks problem P", compute P
  before and after over every exhibit P is cited with. A payoff stated as a
  direction survives review; the same payoff stated as a percentage names the real
  cause.**
- **Attacked and HELD — Phase WU's VETTED GROUND:** (1) a stored step list has
  never contained a warm-up (`logDraft.ts:851`, `storedSummary.ts:50-56`);
  (2) recompute is impossible AND moot — an already-logged row's heroes are stored
  COLUMNS (`storedSummary.ts:217-223`), untouchable by any code change; (3) "no
  judged number changes for a session that never had a warm-up" — `warmupIndex`
  → -1, both warm-up row builders → null, `warmupEndsAt` → null, DISTANCE/TIME
  never conditional; (4) expand/contract with no migration in WU; (5) migrations
  are awaited at boot before `listen` (`server/index.ts:28` / `:119`, single-replica
  compose); (6) `warmup jsonb` nullable, no default, no CHECK, OFF by default;
  (7) Approach A over B/C — the compiler-invisible unions strengthen it rather than
  weakening it; (8) **the replay stays byte-faithful after the fixture edit** — the
  warm-up arm (`program.ts:524-531`) only NULLS `targetSplit` and `commands.ts:183`
  sends the same `0` sentinel an effort interval sends, so `{type:"work",
targetSplit:null}` reproduces the recorded tx exactly and `divergences` stays
  empty; (9) WU before RC-1, for the ROADMAP's stated reason at `:2542-2555` (the
  program-time piece-splitting question disappears) rather than the spec's;
  (10) WU not concurrent with LL; (11) the owed `DROP COLUMN` is really in ROADMAP.
- **Scope findings that are grep-work, not compiler-work** (the spec's removal list
  was incomplete and its "the compiler enumerates everything" mitigation therefore
  unsound): `summaryModel`'s entire warm-up row machinery (`isWarmup` on two
  exported types, `warmupIndex`, both row builders), `TimerRuler`'s three-tone bar,
  `intervalBoundaries.warmupEndsAt` as a FIELD, `PaneGrid.tsx:185`'s `"WU"` arm,
  `data.ts:65-91`'s six bound constants, `droppedWarmups` as an API RESPONSE field
  (`data.ts:808` — additive-only decision unmade), three CSS regions beyond the two
  named **and the named range is wrong: the block ends at 1596, and 1598-1600 opens
  an unrelated comment**, four frozen e2e fixtures, six DEVIATIONS rows, five
  committed screenshots that must be DELETED rather than regenerated, and a third
  historical release note (`:204`). Also: `routes/data.ts:893` and
  `stores/logs.ts:164` both cite the `PUT /api/prefs` warmup presence-check as the
  PRECEDENT for a surviving idiom, so removing it also orphans the only written
  explanation of a live pattern. And `patterns.json`'s own `_meta` says the
  2026-08-09 drop did NOT orphan its `warmupMinutes` stats and the library rebalance
  depends on them — the ROADMAP's file map points an implementer straight at it and
  the spec must rule it OUT.

## Implementation-phase addendum, 2026-08-22 (Phase WU execution)

- **"The vulnerable-gate count is five" — an undercount produced by the sweep's
  own shape.** The flake investigation grepped for the idiom keyed on its
  `title` VARIABLE and missed a sixth, structurally identical gate whose name
  was the hardcoded literal `"First 6k"`. Caught by a reviewer grepping the
  NAVIGATION ("Log it after" clicks) instead of the assertion. **Technique: a
  sweep for an idiom keys on the STRUCTURE (the surrounding flow, the call
  shape), never on an operand — any operand can be a variable in one instance
  and a literal in the next. Corollary proven twice this phase: the same
  session's own line-number citations (two CSS ranges) were wrong while its
  structural findings all held; trust a review's shapes, re-derive its
  coordinates.**

## Delta pass, 2026-08-22 (Phase 8A open, plan prescriptions)

- **"The 8A rename flows through one constant now, so it's easier than the spec's
  plan."** The string change is easier; the SEMANTICS got worse, and the
  centralisation is what hid it. `isOnboardingTitle` has FIVE consumers, not the
  four an enumeration of `domain/onboarding.ts`'s own header comment produces —
  the fifth is `LogSession.tsx:825/1115/1284`, feeding `PostWorkoutSummary.tsx:596`,
  where an onboarding title DEMOTES `Log against plan` out of the lead slot
  ("a baseline test must not silently consume plan session 1", 6I). 8A makes those
  same two titles the plan's own checkpoints, which MUST consume a plan session or
  `done_n` never advances past index 6 — and `stores/logs.ts:540` writes the
  plan-linkage columns only on an advancing save, so the checkpoint is also
  unanswerable to 8B. **Technique: a shared constant's own doc comment is an
  enumeration written at one moment in time — grep the SYMBOL, not the comment.**
  Corollary: when a phase gives an existing identity a NEW meaning, list every
  predicate keyed on that identity and ask whether each one's meaning survived — a
  rename that changes no predicate is exactly the change that gets waved through.

- **"That collision would show up as a red test."** No. `PostWorkoutSummary.test.tsx:883`
  pins the demotion by passing `isOnboarding: true` as a PROP, so it stays green
  through the rename and through 8A entirely. **Technique: when a test takes the
  disputed condition as an input instead of deriving it, it cannot see a change to
  what produces that condition.** Ask what the test would have to compute for itself
  before believing it guards the invariant.

- **"`estimateMinutes` returns 0 for the effort-only test workouts, so the checkpoint
  card shows 0 MIN."** FALSE, and I had it drafted as a finding. `expand.ts:224-227`
  says "an effort distance step has no `targetSplit`, so `phaseSeconds` can't estimate
  it" — that comment describes the NULL-BASELINES branch only. `pace.ts:101-102`
  resolves `max → k2Seconds`, `min → k6Seconds + 20` whenever baselines exist, so the
  estimate is real. **Ledger technique #9 applied to myself: read the declaration, not
  the comment that measures one condition.**

- **"The rename map retires once every environment has booted past it"
  (ROADMAP triggered follow-on).** Unsatisfiable as written. `session_logs.workout_title`
  (`schema.ts:112`) is a NOT NULL snapshot written at save time and never reconciled;
  every pre-rename log carries `First 2k` permanently. **Technique: for any rename,
  separate the rows that are RECONCILED from the rows that were COPIED.** A migration
  fixes the first class; the second class outlives the migration and every query over
  it needs both spellings forever.

- **"§5's `GET /api/today` has no product consumers, so no wire risk."** True of that
  route (re-verified) and it hid the sibling: `GET /api/plan` serialises
  `sequence[].code` from `PLANS` (`data.ts:1131-1139`), the literal `"TEST"` crosses
  it, and `usePlan.ts:9` / `Plan.tsx:300` / `Today.tsx:885` all consume it. Retiring
  the `PlanCode` union is a wire change on an installed-client route. **Technique:
  when a review clears ONE route of consumers, enumerate the other routes that
  serialise the same domain type.** The clearance is about the endpoint; the risk is
  about the type.

- **Plan-tally arithmetic is cheap to settle by recount.** All of spec §6's numbers —
  sprint 34/23/14/13, head 41/24/11/8, the strict pyramid, max-run ≤ 3, the six
  checkpoint neighbours, AN+TR front 9→11 / back 15→16 — reproduce exactly from a
  twenty-line script over the literal week arrays. **Technique: when a spec's claim is
  a count over data that lives in the repo as a literal, recount it rather than
  reading the table.** Two minutes, and it also proves the arrays have not moved.

### Phase 8A VETTED GROUND (attacked this pass and held)

- `contentEqual` (`seed.ts:19-33`) ignores title; the converge's delete pass
  (`:80-88`) really would drop a renamed row; `workout_id` really is
  `ON DELETE SET NULL` (`schema.ts:109-111`). The migration premise is sound.
- `needsBaselines` (`needsBaselines.ts:16-18`) reads `steps` only — reclassifying
  difficulty/pain cannot break the no-baseline promise.
- `--type-tr: var(--ink)` (`tokens.css:132`), NOT an alias of `--type-test`;
  deleting `--type-test` is safe.
- The prescribed entry being outside `poolIds` is required by SHUFFLE's escape, so
  the suggestion-pool exclusion filters are load-bearing and stay.
- `plan_key`/`plan_index` shipped in migration 0010 (PR #121); 8B's stamp bullet is
  satisfied, the column is `plan_index` (= `doneN - 1`), and no migration is owed.
- `plans.ts`, `suggest.ts`, `onboarding.ts`, `seed.ts`, `seed/library/onboarding.ts`
  and `usePlan.ts` have zero commits since the 2026-08-12 spec. All churn is in
  `data.ts`, `Today.tsx`, `LogSession.tsx`, `Plan.tsx`, `tokens.css`.

## Anchor pass, 2026-08-22 (Phase BL, "three doors in, one measurement out")

- **"`POST /api/logs` accepts `isTestResult: true` and appends to
  `test_history` (`data.ts:606`)."** The line number is right and the route is
  wrong: `:606` sits inside `router.put("/api/baselines")` (opened `:582`);
  `router.post("/api/logs")` opens at `:939` and never mentions the field.
  Implementing it literally would have sent the flag where nothing reads it,
  left `test_history` empty, and failed the phase's own exit criterion while
  every other gate stayed green. **Technique: a `file:line` citation pins a
  LINE, not a SCOPE — before trusting "endpoint X accepts field F", grep the
  field and then find which `router.<verb>(` opened above the hit.** A correct
  line number inside the wrong handler is the most credible kind of wrong.

- **"`baselines` gains `source` (`manual | estimated | tested`)."** Structurally
  impossible to mean what the spec wants: `baselines` is ONE row per user
  carrying BOTH `k2Seconds` and `k6Seconds` (`schema.ts:63-73`), and both the
  route and the store are strict per-FIELD patch semantics
  (`stores/baselines.ts:23-33`'s `onConflictDoUpdate({set: {...patch}})`, which
  the You editor's `touched` machinery deliberately relies on). So one `source`
  column records whichever FIELD was written last — and the phase's own flow
  produces mixed provenance within a day (door 1 writes both `estimated`, the
  session-7 checkpoint writes k2 `tested`, the row then claims `tested` for an
  unmeasured k6). **Technique: for any provenance/metadata column, count the
  VALUES the row holds before accepting one column for them. A per-row tag on a
  multi-value row is a lie the moment two values have different origins, and
  the flow that creates the divergence is usually already in the same spec.**

- **"Door 3 (row a test) sets your baseline."** Sets ONE. The app's standing
  convention is that `baselines` is null the moment EITHER side is null
  (`Today.tsx:417-424`, `Library.tsx:249-255`), so a rower who rows the 6k and
  accepts lands back on Today looking at the same onboarding card. Doors 1 and
  2 write both; door 3 writes one, and the spec never cited
  `domain/deriveBaseline.ts` (`K2_K6_OFFSET_SECONDS = 7`), which already exists
  as the editor's derivation OFFER. **Technique: for any "this door reaches a
  working app" claim, find the predicate the app uses for "configured" and
  hand-execute the door's END STATE against it.**

- **"The 2k/6k pair must respect the domain's own invariant (6k slower than
  2k)."** There is no such invariant. Server validates each field independently
  against 60..240 (`data.ts:588-597`); the only relationship in the codebase is
  a 7-second heuristic whose own header says "a starting ESTIMATE only, never a
  measurement". What inversion would cost is real: `pace.ts:103` prices MAX as
  `k2Seconds` and MIN as `k6Seconds + 20`, so k2 > k6+20 makes an ALL OUT
  target slower than an EASY one. **Technique: when a spec says "respect the
  existing invariant", grep for the ENFORCEMENT (a throw, a validator, a check
  constraint, a test), not for the concept.**

- **"Derive the table's values from Concept2's published logbook rankings."**
  The named PRIMARY source cannot answer the question. Rankings filter by age
  range, weight class, sex, country and adaptive classification — no experience
  or cardio dimension (PRIMARY, fetched 2026-08-22) — while the table's axes
  are experience x cardio and the standing PII ruling excludes exactly the axes
  the source carries. And the ranked population is self-selected committed
  ergers — structurally wrong for the "never rowed" cell. **Technique: before
  accepting a deferred research task, open the named source and read its
  FILTER/AXIS LIST.** A source's dimensions are the questions it can answer.

- **"The shipped BaselineCard already carries exactly this 6k/2k toggle, so the
  build reuses it."** True only in the both-missing state:
  `showToggle={bothMissing}` (`BaselineCard.tsx:172`); the one-missing branch
  deliberately offers ONLY the missing distance, and the You shortcut's
  population is both-SET, a state the component refuses to render in at all.
  **Technique: when a spec reuses a shipped component, enumerate the
  component's OWN gating props and compare their domains against the new
  caller's state space.** "It already has this control" is a claim about one
  branch.

- **A shipped card can assert a behaviour the app does not have, and a spec
  will inherit it.** BL's "What and why" said "row a First 6k and it sets your
  baseline". It sets nothing: the ONLY writer of baselines in the whole client
  is `you/BaselineEditor.tsx:298` — while the card reads "SUGGESTED - SETS
  YOUR BASELINE" and `START_HERE_STEPS[0]` teaches "Row 6k once. That is your
  baseline." (pinned by `e2e/flows.spec.ts:52`). **Technique: for any "the app
  already does X" premise, grep for the WRITER of the state X changes, not for
  the screen that offers X.**

- **Attacked and NOT broken (Phase BL VETTED GROUND):** the additive column's
  read safety (the store PROJECTS `{k2Seconds, k6Seconds}` explicitly — traced
  through all eight consumers); per-field patch semantics surviving new
  fields; `real` precision for split seconds (float32 ulp ~7.6e-6 s in range);
  8A's narrowed demotion, hand-executed for door 3's no-baseline rower (the
  hazard is only a prompt WRITING before the stack renders — hence post-save
  only); `ONBOARDING_TITLES` as the prompt's identity hook; and a dispatch
  premise corrected: `suggest()` does not consume baselines (difficulty is an
  authored row property; baselines reach suggestion only via `estMinutes`).

- **A live migration-index collision, found by looking rather than
  reasoning.** Journal head 0011; open PR #160 (Phase LL) already mints
  `0012_amused_wild_child.sql`. Whichever merges second regenerates.
  **Technique: `gh pr diff <n> --name-only | grep drizzle` across every open
  PR is a ten-second check — run it at SPEC time, not implement time.**
### 2026-08-22 — Phase LL anchor pass (link-truth spec, TRIAD)

- **CLAIM: "no committed capture trips a 2500 ms frame-silence watchdog while healthy" (spec §7 criterion 1). FALSE as written — 6 of 6.**
  Believed because the in-stream gap distribution is comfortable (3442 gaps, max 810.3 ms, 3.09x margin) and nobody
  asked when the watchdog ARMS. Every capture is silent for **3775-4454 ms** between the last `subscribe` and the
  first 0x0031 — no 0x0031, no 0x0032, no 0x0033; the first inbound byte is the CSAFE ack on 0x0022.
  **Technique: decode the corpus OUTSIDE the app and tabulate gaps per workout state, including the window BEFORE
  the first frame.** Every prior gap analysis in this repo started at frame 1, which is precisely where the defect
  hides. Second-order: arming at the sample-rate write leaves only a 404 ms margin (2096 vs 2500) — measure both
  candidate arming points, not one.
- **CLAIM: RowTracer's continuity constants (elapsed back >2 s, distance back >5 m, strokes dropped) guard a resume.
  FALSE on our wire — they reject 12.7%-26.0% of healthy 30 s interruptions.**
  Believed because the rule is MIT, battle-shaped and cited to a real file. But 0x0031's elapsed is a PER-INTERVAL
  clock: the corpus contains 8 boundary resets (-29 s to -188 s, -98 m to -715 m) and **4 mid-rest re-bases with no
  boundary at all** (-5.97, -5.90, -4.35, -3.15 s, distance flat).
  **Technique: simulate the rule's own scenario over the corpus rather than eyeballing its constants** — slide the
  spec's own 30 s gap across every frame of every capture and count rejections. A borrowed rule's LICENCE transfers;
  its constants only transfer if the field it reads means the same thing. Ask what quantity the borrowed rule assumes
  is monotonic.
- **CLAIM: a finish hold can exit early on workout state 12 or a 0x0039 arrival. Unsupported both ways.**
  State 12: **zero occurrences** in the whole byte corpus. 0x0039: **zero occurrences** in any byte capture, and the
  one ring observation (`walk-2026-08-15/session-c` seq 34) shows it arriving BEFORE the terminal frame — the same
  arrives-first shape the spec had just corrected for the final split. A spec can fix a premise in one paragraph and
  re-commit it in the next.
  **Technique: before trusting an early-exit condition, grep the corpus for the event and check its SIGN relative to
  the trigger.** Confirm the recorder can see it so absence is evidence, not a blind spot.
- **CLAIM: a new "stale link axis" that recovers. Unimplementable as described, and the word is taken.**
  `surfaceModel.ts:66` already has `SurfaceStatus = "stale"`, meaning "the link is LOST" (`staleFor`'s own comment),
  and it already drives `LostBanner`. `connectedAxes.ts:122` `deriveLink` is a PURE FUNCTION OF PHASE — no input a
  watchdog can push. A retracting LOST THE MONITOR banner is also the reconnecting UI DEVIATIONS 75 forbids.
  **Technique: before adding a state, grep the target module for the WORD — the union-name trap works on additions,
  not just deletions — and read the function that PRODUCES the axis, not the type that names it.**
- **CLAIM: "failure disposes" makes the LINK-FAILED loop unrepresentable. It moves it.**
  `ConnectedInterstitial.tsx:298-313` branches on `session.deviceName`, NOT on `driverRef`, and its own comment says
  nothing but `cancel()` clears it. Null the driver and leave the name and Try Again re-enters `program()`, which
  instant-fails `transport-missing` (`useMonitorSession.ts:1603-1610`).
  **Technique: for any "this loop becomes unrepresentable" claim, find the CONDITIONAL that chooses the loop's next
  step and check the spec names that exact field.** Nulling a ref the branch does not read changes nothing.
- **CLAIM (correct conclusion, wrong citation): Apple says CBPeripherals go invalid on Bluetooth power-off.**
  Apple's `centralManagerDidUpdateState(_:)` says invalidation happens "**if the state moves below poweredOff**" —
  and poweredOff is 4, poweredOn is 5, so poweredOff is not below itself. The sentence that DOES apply is stronger
  and was not quoted: below poweredOn, scanning stops, "which in turn disconnects any previously-connected
  peripherals."
  **Technique: when a doc quote contains an ordinal comparison, resolve the ordinals.** "Below X" is a fact about an
  enum's raw values, not a synonym for X.
- **CLAIM: whether `retrieveConnectedPeripherals` finds an unadvertised-service PM5 is an open probe. Wrong question.**
  Apple, verbatim: peripherals "currently connected to the system and that **contain** any of the services specified".
  Advertising governs `startScan`; containment governs this API. The repo's hard-won "0x0030 is not advertised" lesson
  (`capacitorBle.ts:330-337`) does not transfer, and reading it across cost the spec a real design decision.
  **Technique: when reusing an in-repo lesson about one API on a different API, fetch the second API's own contract.**
  Apple's docs are JS-rendered and defeat WebFetch — the `developer.apple.com/tutorials/data/documentation/....json`
  endpoint returns abstract, parameters, return value and discussion as text. Use it.
- **CLAIM: 2500 ms is "~25x the native ~100 ms cadence". The 100 ms is a REQUEST we already know is not honoured.**
  `useMonitorSession.ts:537-539`: "the driver requests 100 ms sampling but the record shows ~500 ms delivered (the
  sample-rate write is fire-and-forget and its outcome is swallowed)". Measured mean with that write already sent:
  508.3 ms.
  **Technique: a cadence in a derivation is a MEASUREMENT or it is nothing — grep the repo for the number's own
  provenance before it ships inside a constant's comment.**
- **ORACLE BLINDNESS, new shape: the mechanism is placed at a layer the test harnesses' clocks do not reach.**
  `replay.ts` binds its virtual clock as `DriverOptions.now/schedule` (the DRIVER's), `fake.ts` is tick-driven, and
  `replay.ts:205`'s barrier timeout is a REAL `setTimeout` — so `vi.useFakeTimers()` over a replay hangs the barrier.
  A wall-clock watchdog in a TRANSPORT decorator is unprovable by either harness.
  **Technique: for any new time-based mechanism, name the layer it sits at and check that layer receives an injected
  clock — before writing the exit criterion that assumes it can be tested.** (`ReplayHandle.clock` is public; binding
  it to the decorator makes the corpus a real CI gate.)
- **STANDING FACT worth inheriting: every committed byte capture is `transport: "web"`.** Zero native captures exist,
  by construction (no native diagnostics seam). Any "validated against the corpus" claim about native behaviour is
  necessary-and-not-sufficient, and should say so in the criterion rather than in a footnote.
- **Held under attack (Phase LL vetted ground):** 2500 ms once the stream runs (3442 gaps, 0 over, worst 810.3 ms in
  INTERVALREST); rests and armed-not-rowing are NOT quiet periods (states 3 and 0 both notify at 540 ms median);
  0x0031/0x0032/0x0033 arrive in exact lockstep so keying on 0x0031 alone loses nothing; all four §2 mechanisms
  verify at their cited lines; both finish-race measurement sets reproduce to the digit (disconnect at 21.7/24.1/
  30.6/107.3 ms after the terminal frame; 0x0037 at -179.9/+90.2/-89.7/+7.6 ms); `terminated: true` really is written
  by both the link-gone and the rower-quit path while the server row carries neither flag; `link-lost` vs
  `ended-by-rower` IS knowable at write time (`linkGone`, `useMonitorSession.ts:1651`); two decorators is right
  because `defaultTransport()`'s `import()` sits behind a RUNTIME check; the `initialize()` memo hoist is safe but
  does not survive `webView.reload()`.


## Anchor pass, 2026-08-22 (Phase RC open: the held-open finish spec + decomposition)

- **"The hold-open instrument goes where the tap seam already lives — the DEV/web arm of
  `adapters/monitorTransport.ts`."** False on both halves, and that file's own doc comment
  says so: the byte recorder is deliberately NOT composed there, it lives behind
  `transports/index.ts`'s BUILD-TIME-foldable `fakeMonitorEnabled` gate, and the adapter's
  only conditional is a runtime `isNative()` Rollup cannot fold. Worse, `import.meta.env.DEV`
  is FALSE on the walk lab: `walk-lab.sh` boots the compose stack and `compose.e2e.yml:39`
  sets `VITE_ENABLE_FAKE_MONITOR=1` as a build arg on a PRODUCTION build — a DEV-only gate
  would have handed James a console variable that does not exist at the erg.
  **Technique:** when a spec says "follow the precedent of X", open X's install site and read
  the gate EXPRESSION, not the prose about it — then follow the flag into the file that
  builds the thing the operator will actually run (`compose.e2e.yml`, not `package.json`).

- **"Failure to subscribe 0x003F degrades — Phase LL's non-critical class."** False on the web
  arm, which is the arm the spec targeted. `webBluetooth.ts`'s `subscribe()` is
  `void getCharacteristic(...).then(...)` with NO `.catch()`; the degrade class
  (`onCharacteristicDegraded`, CRITICAL_CHARACTERISTICS routing) exists only in
  `capacitorBle.ts`. A missing characteristic is a silent unhandled rejection — which makes
  "absent on this firmware" and "present but never fires" INDISTINGUISHABLE in every artifact
  the walk collects, gutting the walk item that existed to tell them apart.
  **Technique:** for any "it degrades gracefully" claim, grep the callback's name across
  `src/` and check WHICH TRANSPORT ARM defines it. Then ask the oracle question: after this
  failure, what does the evidence look like, and is it distinguishable from success?

- **"`Sample.p`/`spm` can become optional — readers already handle absent fields on `hr`'s
  precedent."** False. `traceModel.ts:161,164` guard those two fields on `!== 0` (the stored
  trace's sentinel rule), not on `!== undefined` like `hr`; an absent `p` yields
  `undefined !== 0 === true` and pushes NaN into the chart. And `server/routes/data.ts`'s
  `validateSeriesSample` REQUIRES both and rebuilds the sample from an explicit
  `{ t, d, p, spm }` list, so omitting either 400s the whole POST — the "shape unchanged"
  claim was wrong on both sides of the API.
  **Technique:** "field X becomes optional" is a claim about every READER of X. Grep the field
  and open each guard: a codebase can have two different absence idioms (`!== undefined` and a
  `0` sentinel) side by side in one interface, and the precedent you cite may be the other one.
  Then check the SERVER validator — a client-side optional is an API change.

- **"The ring and the recording both capture the held-open window."** False for the ring.
  `useMonitorSession.ts`'s teardown serialises `exportLog()` into sessionStorage at STEP 2,
  BEFORE the disconnect at STEP 4 — its own comment says an entry written after that line
  "would never reach sessionStorage at all" — and `LogSession.tsx:666`'s `MONITOR LOG · COPY`
  reads exactly that key. Deferring only the last step leaves the ring capturing into a
  snapshot nobody can retrieve, so the exit criterion could go green on zero evidence.
  **Technique:** for any "we will observe X" criterion, trace the DOOR the operator will use
  to read the observation, and check it is downstream of the observation in wall-clock order.
  Capture and retrieval are different questions.

- **"The PM5 emits 64/101 spm in coherent frames AT BOUNDARIES."** Half false: 101 is a
  boundary artifact (pyramid seq 3273→3276, wState 5→10 at 300 m), but 64 is a FIRST-STROKE
  transient (step-2 seq 828, elapsed 13.4 s, 12 m, rowState 0→1) — nowhere near a boundary.
  Two producers wearing one name.
  **Technique:** before accepting a stated mechanism for an artifact, dump the surrounding
  frames and read the state bytes. Filtering the corpus for the VALUE takes a minute and
  routinely shows the story attached to it is a composite of two different events.

- **ANTAGONIST'S OWN REVERSAL, recorded on purpose: "0x003F's byte order is not really
  disputed — that's a CSAFE-command convention confused for a BLE payload."** I ruled the
  spec's claim down on that reasoning, then opened both rows of the PDF. The dispute is REAL
  and it is Concept2 contradicting ITSELF in one file: the BLE attribute table prints the
  Logged Workout Hash `(Lo)`-first, and `CSAFE_PM_GET_CURRENT_WORKOUT` (0x72) in the same
  document prints `Byte 0: Hash (MSB)`. The spec was right and I was about to cost it a walk
  item. **Technique:** an antagonist's "this is a category error, not a contradiction" is
  itself a claim, and it gets the same evidence bar — extract the PDF and grep for BOTH rows
  before downgrading someone else's uncertainty. A wrongly-closed question is more expensive
  than a wrongly-open one, because nobody reopens it.

- **"The PM5's own memory screen agrees: 7476 → 1:14.7 (`walk-2026-08-17/README.md:14`)."**
  The cited line actually reads "PM5 memory interval 2 = 1:14.7 matches wire **74.71s**
  exactly" — a different field (0x0031/0x0033 `elapsedSeconds`, confirmed in
  `step-2-ring.json` seq 35-37). The screen's 0.1 s resolution cannot separate 74.71 from
  74.76, so it rules out `/10` but evidences nothing about 7476. The claim survived because
  the RIGHT answer (`/100`) was reached by other evidence.
  **Technique:** the briefing's §-citation rule, applied to walk READMEs too — paste the cited
  sentence beside the claim. A correct conclusion resting on a mis-cited premise is still a
  defect, because the next spec inherits the premise, not the conclusion.

- **"0x003F is the verification-code characteristic, and it's in the BLE Interface
  Definition."** Both wrong in a way that would have dangled the phase's first citation.
  Concept2 calls it the **"C2 rowing logged workout characteristic"** (15 bytes, NOTIFY,
  8-byte *Logged Workout Hash* + log address + size + erg model type); "Workout Verification
  State" is a byte in the DIFFERENT characteristic 0x003E. And the BLE Interface Definition
  **Rev 1.30 — the revision this repo holds and every `uuids.ts` constant cites** — has no
  0x003F at all; its rowing table ends at 0x003D. Concept2 folded the BLE attribute tables
  into the CSAFE Communication Definition and stopped publishing a standalone BLE PDF.
  **Technique:** before citing "the doc", check the REVISION we actually hold contains the
  thing. `pm5-interface-notes.md:13-14` records both revisions and their page counts — a
  ten-second check that stops a house-style citation from pointing at a page that does not
  exist. Corollary: extracting the PDF (`pdftotext -layout` + grep for the handle) answers
  name, owning service, payload, and firmware bands in one pass, and is cheaper than any
  amount of arguing from the community's naming.

- **HELD under attack, worth recording as ground:** RC-4's nine capture pairs are real — I
  re-derived all nine from the committed bytes independently of the review that asserted them
  (`floor(0x0033.u24LE@14 / 10) === 0x0037.u24LE@6`, four files). And the 500-entry ring
  cannot overflow during a 90 s hold: real sessions use 41-56 entries because the ring is
  event-driven, not per-frame.
  **Technique that settled both:** decode the committed captures with a throwaway script
  rather than reasoning about them. `docs/monitor/sessions/*.jsonl(.gz)` are raw wire hex and
  a fifteen-line decoder answers in seconds what a spec argues about for pages.

## Spec-stage pass, 2026-08-23 (Phase RC, F2a — the continuity guard's three-axis conviction)

- **"A boundary cannot fake the three-axis reset signature on a non-distance
  program — see keystone seq 305→310, TWD 0→250 while elapsed/distance
  reset."** The conclusion holds; the citation proves nothing about it. Byte
  17 of both cited frames is `0x80` = 128, the distance-goal identifier: the
  keystone is a 2×250 m DISTANCE program, all 254 of its frames are
  suppressed, and it contributes **zero** non-suppressed pairs to the corpus
  gate. The claim's real evidence is three boundaries the spec never cited
  (`walk-2026-08-17/step-3` seq 411→416 TWD 0→160 and seq 953→956 TWD
  373→373; `walk-2026-08-16/session-2` seq 776→781 TWD 360→360). **Technique:
  when a claim is scoped to a program shape / mode / platform, decode the
  cited frame's own MODE BYTE before accepting it as evidence.** A capture
  can carry exactly the right numbers and still live in the regime the claim
  excludes.

- **"The corpus gate (1,026 pairs) passing under the new predicate is
  evidence the new predicate is safe."** Vacuous by construction: the new
  rule is a conjunctive NARROWING of the old one, and the old one already
  scored zero. Measured at seven gap lengths (5/15/30/60/120/180/300 s):
  old-rule resets 0, new-rule resets 0, every time. The gate cannot go red
  for the change it is gating. **Technique: for any "the existing gate still
  passes" criterion, ask whether the change could have made it fail. If the
  new predicate is a subset of the old, the answer is no, and the criterion
  is a non-regression pin wearing an exit criterion's clothes.**

- **"The 2026-08-23 walk's time-program captures can be added to the corpus."**
  There are none. The walk's only `pm5-recording/v1` file is the keystone
  (100 % `durationType 128`); the time-program evidence lives in the phone
  RINGS, which are event logs `parseRecording` cannot read. Adding the
  keystone leaves the non-suppressed pair count at exactly 1,026 —
  unchanged. **Technique: before writing "add capture X to the corpus",
  decode X and count the pairs it contributes to the population the gate
  actually evaluates.** A capture can be added, parsed, and contribute
  nothing.

- **A conjunctive predicate needs one falsifying test PER CLAUSE, and a
  spec's test list will not have them.** F2a's five proposed tests, self-
  mutated clause by clause, pin only the TWD clause: delete the elapsed
  clause or the distance clause and every proposed test stays green, because
  the two real-capture pairs each have TWO axes moving forward, so either
  survivor saves the verdict. **Technique: tabulate mutation × test for each
  conjunct before approving a test list. An AND of N clauses needs N pairs in
  which exactly one clause is the sole reason for the verdict** — and if the
  record contains no such pair, say SYNTHETIC out loud rather than skipping
  the pin.

- **Making a test fixture's new field REQUIRED can silently disarm the
  guard the fixture was written to test.** `ContinuityReading` gaining
  required `elapsedSeconds`/`distanceMeters` makes every existing suppression
  fixture default them to 0 — and `0 < 0` is false, so all three suppression
  tests return "continuation" whether or not the suppression line still
  exists, and the 1,026-pair corpus sweep returns "continuation" trivially.
  **Technique: when a predicate gains a conjunct, re-run every EXISTING test
  of the OTHER conjuncts against a deleted-clause mutant. A default value of
  0 for a new axis is a permanent false in a strict comparison.**

- **The axis that earns its place was not the one the spec argued for.** In
  all six mid-rest elapsed re-bases in the corpus (−3.15 s to −5.97 s, no
  boundary), `distanceMeters` holds or ADVANCES — so the distance clause, not
  the TWD clause, is what makes the documented re-base safe. **Technique:
  for each clause of a new conjunctive guard, find the recorded event that
  clause alone defuses. The one you cannot find an event for is the one to
  question.**

- **A conjunction over PER-INTERVAL axes makes detection depend on where in
  the interval the reading fell.** F2a loses a real conviction the old rule
  made: a monitor reset during a background gap that began early in an
  interval leaves the post-reset elapsed/distance ABOVE the pre-gap
  per-interval values, so two of three clauses read forward and the records
  merge silently. Blind for roughly the first `gap` seconds of each interval
  — ~14 % of a 180 s interval at a 30 s gap, ~64 % at a 2-minute gap, i.e.
  detection degrades exactly as the gap grows. **Technique: before ANDing a
  new axis into a guard, ask what that axis is measured RELATIVE TO. A
  per-interval quantity compared across a gap is not comparing the same
  origin at both ends.**

- **Attacked and NOT broken:** the predicate itself. Zero triple-backward
  pairs in 3,637 slid pairs across seven captures at seven gap lengths and at
  all 11 boundaries in the record; TWD decreases exactly twice in the entire
  wire corpus, both on distance-goal frames and both mid-interval; `0 → 0`
  is a continuation under strict `<`; the decode is order-preserving so the
  zero tolerance is not flappy; and the stale-backlog attack is closed at the
  code (one frame per 0x0031, `elapsed`/`distance` from that same 0x0031's
  decode, no buffer or reorder in `capacitorBle.ts`, `lastTwd` updated every
  live frame so pairs are always consecutive). **Probe validated before
  trusting it: my independent decoder reproduces the repo's own published
  1,026 non-distance-goal pairs exactly.** The one residual is honest and
  unclosable from the record: the mechanism behind `ring-phone-2`'s 81→0 is
  unexplained (the walk's own F5 says so), it is the only backward TWD
  reading on a time program ever observed, and nothing proves it cannot land
  on the `before` side of a boundary. "Cannot" is the wrong word; "never
  observed in 3,637 wire pairs" is the right one.

### Phase RC anchor pass — the storage spine (2026-08-23)

- **CLAIM: "we hang up inside the burst window, so hold the link open."**
  Believed because four captures measure the disconnect 21.7–107.3 ms after
  the terminal 0x0031, every one before the 0x0039. FALSE as a complete
  diagnosis. **Technique: decode the finish ordering, not just the finish
  latency.** Extracting the 0x0031 state byte (offset 8) alongside every
  0x0037/0x0039/0x003F timestamp showed the terminal is not a fixed point:
  the machine's burst is ~310 ms after IT finishes, our terminal is the next
  status sample (0–1260 ms later), so the race goes both ways — split-before-
  terminal in 3 of 5 natural finishes, and on the 2026-08-23 keystone the
  ENTIRE burst (0x0037, 0x0039, 0x003F) preceded our terminal by 449/180/142
  ms. The 0x0039 was received with the link up and refused by our own gate
  (`driver.ts:2522`, `graceIsOpen`). A window armed on the terminal folds
  nothing there. **Lesson: when a spec says "we were too late", check whether
  the event was actually EARLY.**
- **CLAIM: "a terminate produces no burst — proven absent (ring-3)."**
  FALSE as evidence. **Technique: count the ring's last entry.** ring-3 ends
  AT the terminal (seq 28 of 29) because teardown stashes the ring
  immediately — it stops ~310 ms before any burst could arrive. The same walk
  README argues "the app was deaf by construction, not the machine silent"
  about 0x0039 and then accepts the identical absence as proof one paragraph
  later. **Absence in an artifact that ends at the event proves nothing about
  what follows the event.**
- **CLAIM: "the interval number is 0x0031's own field, already decoded,
  monotonic 1,2,3."** FALSE three times. **Technique: read the parser's
  return statement, not the field's name.** `parseGeneralStatus` decodes all
  19 bytes of 0x0031 and there is no interval number in it (only
  `intervalType`, an enum). The count is 0x0033's; it is 0-based and
  forward-attributed (§20 item 15); and the value a consumer actually reads
  is `toProgramIndex` output — CLAMPED to [0, N-1] and NULL outside
  rowing/resting, so on a 1-interval program the proposed key is a constant.
  Measured 78.3% unchanged across the corpus's own 30 s-gap simulation, vs a
  TWD key with zero backward readings in 1,026 pairs.
- **CLAIM: "0x0039's totals are work-only (500.0 m on the keystone)."**
  Over-claimed. **Technique: check whether the fixture can DISCRIMINATE the
  hypotheses.** The keystone is 2×250 m r0 — zero rest on both 0x0037s and
  `r:00` on the memory screen — so work-only and work-plus-rest predict the
  same 500.0 m. The one premise the storage split exists to settle is
  untouched by the capture cited as settling it. Recurring failure #11's
  addendum, one level up: an oracle whose quantity is undetermined is not an
  oracle.
- **CLAIM: "a driver-level window keeps the link up long enough to fold."**
  FALSE structurally. **Technique: read the teardown's step order.**
  `useMonitorSession`'s teardown unsubscribes (STEP 3) before disconnecting
  (STEP 4) and stashes the ring (STEP 2) before both — so a post-teardown
  window emits into an empty listener set and logs into a stash already
  written. The receipt is `holdOpen.ts`'s own `stash()` dependency: the
  instrument needed one precisely because the hook's export had already
  happened. **A window that outlives its listeners is not a window.**
- **SURVIVED my attack:** the four disconnect measurements (reproduced to the
  tenth), the burst offsets (+269.6 / +307.8 ms), 0x0039's decode against the
  PM5's own screen field-for-field, the exit-2 shape pin (68.6 s / 250 m), and
  the one-shot post-close `acceptableFinalBoundary` exception being the ONLY
  post-close writer.

### Phase RC delta pass — the revised storage spine (2026-08-23)

- **CLAIM: "the existing reconcile path consumes the buffered summary at
  close."** FALSE on both sides at once, for two different reasons.
  **Technique: read the consumer's FIRST branch, and then find out when the
  consumer actually runs.** `reconcileSummary`'s first branch is `split-won`
  and its own log string says the held 0x0039 is "discarded unread" — and the
  final split arrived before disconnect in 5 of 5 committed finishes, so that
  branch is the only one production has ever taken. Separately, the deadline
  never waits its 3 s: `useMonitorSession`'s teardown STEP 1 calls
  `driver.reconcile()`, which drains it SYNCHRONOUSLY 21–107 ms after the
  terminal. **Lesson: a deferral that adds 2 s of listening is worthless if
  the thing that would consume the data was drained at t=0. Ask when the
  consumer runs, not just whether it exists.**
- **CLAIM: "0x003F's bytes are ours to store" (a spec built on a capture that
  contains them).** FALSE for production. **Technique: grep the UUID for its
  non-test callers.** `LOGGED_WORKOUT_UUID`'s only non-test subscriber is
  `holdOpen.ts` — the dev instrument `dist-grep.sh` exists to prove is absent
  from real builds — and `capacitorBle.ts`'s characteristic→service map has no
  entry for it at all, so the iOS surface cannot subscribe it even if the
  driver asked. The keystone capture has 0x003F ONLY because the instrument
  subscribed it. **A field present in a capture is not a field the app can
  receive: check which code path put it in the capture.**
- **CLAIM: "a corpus sweep shows zero backward interval-count readings on
  healthy resumes, including the leftover-numbers re-arm."** FALSE, and its
  falsifier is the exact shape the claim named. **Technique: sweep every
  consecutive pair, not the interesting ones.** One backward transition in
  3,695 pairs: `walk-2026-08-16/session-2` seq 24→29, count 3→0 at
  workoutState 0 — the leftover register. It cannot false-convict today, but
  only because `applyContinuityCheck` short-circuits on `run === null` and
  the record opens on the first LIVE rowing frame — a safety argument living
  in a different file from the bound. **When the reason a bad reading is
  harmless lives elsewhere, pin it elsewhere.**
- **CLAIM: "settle the 0- vs 1-based interval-count base before shipping the
  bound."** UNNECESSARY. **Technique: ask whether the mechanism is invariant
  to the question.** `after < before` on a raw counter is invariant under any
  constant offset, so the base cannot change a single verdict. A gate the
  design is provably indifferent to is spend, not rigour. (The sweep answers
  it for free anyway: 0-based, forward-attributed.)
- **CLAIM: "the corpus sweep proves the guard convicts nothing healthy."**
  The sweep measures a DIFFERENT RULE from the one production runs.
  **Technique: compare the test's predicate to the caller's predicate, field
  by field.** `continuity.test.ts` derives `distanceGoal` from the wire's
  per-sample `workoutDurationType === 128`; production derives it from
  `programHasDistanceGoal(run.program)` — the armed program, constant for the
  session. Under the production predicate essentially the whole committed
  corpus is suppressed, and the one backward count reading sits exactly where
  the two predicates disagree. **Oracle blindness does not only mean "the
  fixture cannot reach the code"; it also means "the fixture reaches it
  through a different door."**
- **NEW WIRE FACT, PROVEN (8 boundaries, 5 captures):** 0x0033's Interval
  Count increments at the START of a rest and the matching 0x0037 arrives at
  its END — a 29.8 s lead on r30 programs, 59.7 s on r60 — while on r0
  programs it LAGS the 0x0037 by 0.28–0.72 s. **Technique: put the two
  characteristics on one timeline with the state byte, instead of reading
  each alone.** It also corroborates the end-during-rest bound from a second
  field.
- **SURVIVED my attack:** the burst geometry re-derived independently
  (+269.6 / +307.8 ms, hash bytes `27d8f36e e152555b`); BURST_LINGER_MS=2000
  against a worst modelled late-side arrival of terminal +398 ms; "final
  interval" being determinable at receive time from data the driver already
  holds; `run.summaryInGrace` surviving a pre-close write to the deadline;
  two additive-optional `MonitorRun` fields being safe in both directions
  (`isMonitorRun` has no unknown-key check, no `v` bump); and PR 1 needing no
  server change at all.

## Spec-stage anchor pass, 2026-08-24 (Phase JR, "Just Row")

- **"Live Just Row = workoutType 0/1 + WORKOUTROW + rowingActive."** Unobservable
  and unsupported. Two of the three terms do not exist at the `MonitorFrame` seam:
  `workoutType` never leaves the driver (`driver.ts:4264-4266` says so in prose),
  and WORKOUTROW (ordinal 1) collapses with 4/5/8/9 into `"rowing"`
  (`parse.ts:427-443`). And the MEANING is falsified by our own record: the repo
  pins exactly ONE member of `OBJ_WORKOUTTYPE_T` (ordinal 8,
  `pm5-interface-notes.md:454`), while `pm5-session4a-final.log.gz` shows
  `workoutType=1` on a TERMINATING type-8 programmed workout (`raw=... 01 01 0b ...`,
  byte 6 = type, byte 8 = 0x0b TERMINATE), plus types 0, 1 AND 8 all at idle.
  **Technique: for any predicate a spec proposes, check that EVERY term survives
  to the seam the consumer reads -- list the target interface's fields and strike
  the terms that aren't there -- before arguing about the predicate's logic. A
  spec's detection rule is written in the vocabulary of the WIRE DECODE, and this
  codebase deliberately narrows that vocabulary one layer up.**

- **"Appendix E (PRIMARY): JustRow never reaches WORKOUTEND/WORKOUTLOGGED."**
  The repo transcribes Appendix E (`pm5-interface-notes.md:3491-3493`) and it
  documents WORKOUTROW->WorkoutEnd->WorkoutLogged for fixed-duration workouts, with
  no JustRow attribution anywhere; the only text linking the two is our own gloss
  at `:646`. And `parse.ts:410-416` already records the real machine going 5->12
  with WORKOUTEND never appearing -- Appendix E falsified once already, on the same
  two ordinals. **Technique: when a spec tags a vendor document PRIMARY, grep the
  repo for our own transcription of it AND for any code comment recording a
  hardware DEPARTURE from it. A document this project has already caught being
  wrong about a state machine does not get a fresh PRIMARY tag on the neighbouring
  claim.**

- **"0x0039 has appeared in ZERO of our five captured natural finishes."** False:
  `walk-2026-08-23/keystone-*.jsonl.gz` seq 516/517 are an rx 0x0039 + 0x003A, and
  that walk's own README:30-36 explains the old zero as OUR deafness, not the
  machine's silence. The spec cited `pm5-ble-ecosystem-review.md` (08-21), the
  stale half of a contradiction resolved in the same directory two days later.
  **Technique: for any "we have never observed X" claim, `ls` the capture
  directory by DATE and read the newest walk's README first. Corpus facts in this
  repo have expiry dates, and the document that states one is usually older than
  the walk that killed it.**

- **A comment can be the load-bearing wire premise, unmeasured.**
  `driver.ts:2205-2214` reads "a JustRow with no program armed has no interval
  identity at all, and there per-interval IS the session" -- and NO genuine
  unprogrammed JustRow capture exists (checked: all 8 recordings carry type 8
  only). The PM auto-splits a Just Row at 5:00/10:00/20:00, so if 0x0031's pair
  resets at a split, every free row over five minutes stores the last split.
  **Technique: when a design will store a number straight off a frame, find the
  code comment that says what that frame's field MEANS in the new mode, then ask
  which capture measured it. The most dangerous premise is the one already written
  down confidently in the file you were going to reuse.**

- **A stored-shape table can name a number with no source.** `avg_split_seconds`
  = "last live frame": no live frame carries a piece average. `MonitorFrame` has
  `currentSplit` and per-SPLIT `splitAvgPace`; `AdditionalStatus1.averageSplit` is
  parsed and never surfaced (its only non-test reader is `fake.ts:947`, which
  fakes it as `currentSplit`); the only piece average on the wire is 0x0039's,
  the frame the same spec forbids depending on. **Technique: for every row of a
  stored-shape table, grep the named SOURCE FIELD forward to the consumer. A row
  that cites "the frame" without naming the field is a derivation nobody has
  designed yet -- and a derivation is a TRIAD number.**

- **"The plan derivation must provably skip it."** The derivation is not
  type-aware and never was: `data.ts` defaults `advancesPlan` to `true` and
  `stores/logs.ts:581` increments `plan_state.done_n` on that flag alone. A free
  row would tick off a training-plan session and stamp plan linkage, and deleting
  it later un-counts a plan day. **Technique: when a spec says an existing
  mechanism "must skip" a new case, read the mechanism's ACTUAL predicate and its
  DEFAULT. "Must skip" is a wish; the default is the behaviour, and here it ran
  the wrong way.**

- **An enum value can carry shipped COPY that contradicts a new use.**
  `ended_by: "link-lost"` renders "LINK LOST - the app lost the monitor before the
  end" (`storedSummary.ts:410`) and a release note sells it as "a row the app lost
  is never confused with a row you chose to end". Reusing it for the PM5's own
  designed idle power-off labels the most normal free-row ending a failure.
  **Technique: before reusing an enum member for a new producer, grep for its
  RENDERED STRING and its release note, not just its type. A value's meaning in
  this codebase is the sentence a rower reads, not the identifier.**

- **An unknown enum value degraded to invisible text, not to a fallback.**
  `TypeBadge`'s `Record<WorkoutType, string>` yields `background: var(undefined)`
  -- an invalid declaration, dropped -- leaving `--on-color` #fffdf7 on --page
  #f4f1e8: **1.11:1** against a 4.5:1 floor. And the read-side fallback must ship
  in an EARLIER TAG than the writer, the R-A discipline `schema.ts` already
  records by name. **Technique: for an "old clients must degrade gracefully"
  claim, hand-execute the lookup miss and COMPUTE the resulting contrast. "Does
  not crash" and "degrades" are different claims, and an invisible badge passes
  the first.**

- **Attacked and NOT broken (Phase JR's vetted ground):** the Concept2 Logbook
  API claims, verified against the live source (`JustRow` spelled exactly,
  distance+time both required, rest fields "for interval workouts only", no title
  field) -- the one citation in the spec that fully earns PRIMARY; TERMINATE's
  observability at the frame level (`parse.ts:439`, ordinal 11 is the sole
  producer of `"terminated"`); `session_logs.workout_type` being plain `text`, not
  the same-named pgEnum that types `workouts.type` (so no migration, no
  collision); the narrowness of `steps: []` (one server consumer, the create-time
  validation; `buildRows([])` and `PostWorkoutSummary`'s own `rows.length === 0`
  gate absorb it client-side); post-test-prompt ineligibility (title-gated before
  anything else); `buildMonitorLogSteps` NOT throwing on a 0-length seed/program
  pair; and `MonitorRun`'s additive-field contract tolerating a new `mode` --
  with two corrections: v2 already exists, and `monitorRun.ts:275-282` prices a
  v3 bump at outright data loss.

## Phase RC, the summary-record wave spec (2026-08-24) — full pass, TRIAD

- **"Widen THAT gate" hid four gates in series.** The spec said a terminate burst
  needed the writer's `endedBy` guard widened. It needs four: the hook's linger is
  gated on `endedBy === "finished"` (`useMonitorSession.ts:2270`) so the link is
  torn down ~1s before the burst; `noteSummary`'s admission needs a grace only the
  `finished` branch arms (`driver.ts:2376/2390/2400` vs the bare `2413-2415`
  terminated branch); nothing drains a buffered summary because
  `maybeReconcileImmediately` needs `recordedActuals.has(lastIndex)`
  (`driver.ts:3064`) and the terminate's own 0x0037 takes `boundary-out-of-run`
  (`driver.ts:3522`) and is never recorded; only then the writer
  (`monitorRun.ts:1042`). **Technique: when a spec proposes to "widen a gate",
  trace the value END TO END from wire to storage and COUNT the refusals. A
  singular noun in a spec is a claim about arity, and it was wrong by 4x.**

- **The repo already held the capture that falsified the claim, from the walk the
  spec cited.** The spec's terminate premise rested on ONE lab capture (web arm,
  hold-open instrument). `docs/monitor/sessions/walk-2026-08-23/ring-phone-3-menu-
  terminate.json` is a PRODUCTION-arm phone ring of a Menu-terminate, 29 entries,
  ending at `terminal terminated` with no 0x0039/0x003A/0x003F at all — the
  finished ring from the same era carries all three. **Technique: before accepting
  "one capture supports it", `ls` the whole sessions directory for the same EVENT
  on the OTHER arm. The lab proves what the machine does; only a phone ring proves
  what production hears.**

- **A display spec named a screen and a store that do not meet.** §3 said the log
  detail renders `summaryTotals` "via `storedSummary`'s read path".
  `FromTheLog.tsx:82` fetches `GET /api/logs/:id`; `storedSummary.ts:5-8` says it
  reads a stored `session_logs` row; the observations live only on the localStorage
  `MonitorRun` — which `LogSession.tsx:1178` DELETES inside the save's success
  callback. The placement anchor the spec gave ("above MONITOR LOG · COPY") exists
  only on the OTHER screen (`LogSession.tsx:743`). **Technique: for any "show X on
  screen Y" claim, grep X across `src/` excluding its own module. Zero consumers
  means greenfield, and then follow the record's LIFETIME to the line that clears
  it — a field you can only read before the save is a field the saved row cannot
  show.**

- **Admitting a value to a shared reconciler arms every branch of it, not one.**
  Widening the summary gate to terminate also feeds `deriveFinalIntervalFromSummary`,
  whose `filled-from-summary` branch emits `intervalComplete{finalBoundary:true}`
  (`driver.ts:3390`) — synthesising a COMPLETED final interval into a record whose
  whole meaning is "abandoned". **Technique: when a spec admits a new input to an
  existing function, enumerate that function's BRANCHES and say which the new input
  may reach. "Admit it" is not a scope; a branch list is.**

- **The spec under-tagged its own best evidence, and the mis-tag was heading into
  code.** It called the 0x003F-to-verification-code equation "INFERENCE (standing,
  unphotographed)". It is photographed: walk-2026-08-23 `photo-w4-verification-
  code.jpeg`, 6EF3-D827 5B55-52E1, LE-u32 of `27 d8 f3 6e | e1 52 55 5b`, exact.
  **Technique: check citations in BOTH directions. Recurring failure 16 catches
  premises claiming more evidence than they have; this is the mirror — a premise
  claiming LESS still misleads, and it produced hedged user copy for a settled
  fact.**

- **A stored-shape comment mis-stated a unit the parser had already applied.**
  `avgPaceSecondsPer500m: number; // 0.1 s/lsb scale` — but `parse.ts:362` already
  divides by 10, so the stored value is seconds. **Technique: for every unit
  comment on a stored field, read the LINE THAT PRODUCES the value, not the wire
  table it came from. Scale caveats belong to the wire; stored fields carry the
  descaled unit.**

- **Two captures of the same wire fact are not two samples.** RC-2's date/time
  packing was tagged "PRIMARY (hardware, 2 captures)"; both are Aug 24 2026, hour
  15. One date, one hour — the formula is INFERENCE, and §4's boundary tests pin
  our own encoder, not the machine. No vendor documentation of the packing exists
  (§23 says "UNCERTAIN"; a web search found nothing authoritative — recorded as a
  result). **Technique: before crediting N captures, check whether they VARY in the
  field the claim is about.**

- **Attacked and NOT broken (Phase RC's vetted ground):** 0x0039's byte offsets,
  confirmed against the PM5's own View Detail SCREEN (avg stroke rate 26 and avg
  pace 124.0 = 2:04.0, digit for digit) and internally cross-checked on the
  terminated piece (24.30s x 500 / 76.0m = 159.87 vs the wire's 159.8) — so the
  "does the layout shift on a terminated piece?" hypothesis is FALSIFIED, and the
  `01` vs `08` byte is most likely the machine logging a terminated piece under its
  default workout type (`ring-phone-3` seq 6 shows type 1 pre-programming); the
  0x003F rendering; RC-2's formulas as arithmetic; `CloseReason`'s venue-blindness
  (`useMonitorSession.ts:1857` and `:2711`); the single write-once door keyed on
  `summaryTotals` (both `summary-observations` producers hold a full parsed summary
  at the emit); and `summaryDetail` as an additive-optional field needing no `v`
  bump. ONE new residual found: the terminate capture's 0x0039 avgStrokeRate reads
  44 while the same burst's 0x0038 reads 22 and 0x0032 reads 29 instantaneous —
  physically 22 is the true value (8.5 m/stroke vs an impossible 4.3), so a number
  the wave will STORE is anomalous on the one path with no SCREEN oracle.

## Spec-stage full pass (TRIAD), 2026-08-25 (Phase RC, "the series stops lying on distance intervals")

- **"Count the recorder's backward-bucket rejections and the count is zero on a
  clean replay."** The two halves contradict each other and the second is right.
  `seriesRecorder.ts:250`'s `bucket <= lastEmittedBucket` IS the 1 Hz decimation,
  not an error path: at the measured 2.23 frames/s desktop and 90-180 ms iOS
  spacing (`pm5-interface-notes.md:4403`), 80-90% of all healthy frames take that
  return. The defect signal is the STRICTLY backward case (`<`) — the exit-7 loss
  reads buckets 67..124 against a `lastEmittedBucket` of 196. **Technique: when a
  spec proposes to instrument an existing early-return, ask what fraction of
  NORMAL traffic already takes it — the frame rate is in the ledger and the answer
  is arithmetic. A new alarm wired to a hot path is an alarm nobody can read, and
  the spec's own "zero on clean replays" criterion is what proves it.**

- **"The count surfaces the same way `truncated` already does."** Both halves of
  the symmetry are false. `truncated` produces NO ring entry anywhere
  (`grep -rn truncated src server domain` — recorder, monitorRun, store, route,
  nothing in `useMonitorSession.ts`), so there is no precedent to inherit; and
  `truncated` IS persisted (`server/routes/data.ts:641` reconstructs it by name)
  while a new sibling field is silently dropped by that same reconstruction.
  The spec also assigned the write to "the driver", which never sees the recorder
  (`useMonitorSession.ts:1270` owns it). **Technique: "it surfaces the same way X
  does" is two claims — the CHANNEL and the PERSISTENCE — and they fail
  independently. Grep X across src+server and check both ends before inheriting
  a precedent; then name the module that actually holds the reference.**

- **Porting a guard across a seam that has lost the guard's discriminator.** The
  spec proposed re-applying the driver's open-on-reset predicate inside
  `seriesRecorder`. `driver.ts:2207` can gate its mirror on the raw
  `status.workoutState` byte (8/9); `MonitorFrame` carries only the six-valued
  `state` (`parse.ts:457-471`) and `rawIntervalCount`, on which the poison tick
  and an honest post-gap first tick are IDENTICAL. So the port fires exactly on
  the driver's own disclosed bounded edge — hand-executed red on two of the repo's
  own regressions (`driver.test.ts:979` idx0 e40 / idx1 e40 -> refuse, sample
  dropped, clock 40 not 80; `driver.test.ts:1101` e30/e28/e45 -> key 2 never
  opens, clock 75 not 103) — and the refusal is PERMANENT, because the refused
  interval's own elapsed keeps growing the register it was merged into. That is
  verbatim the "short by the whole skipped interval, forever" failure
  `seriesRecorder.ts:44-50` says the register map exists to eliminate, and
  `ROADMAP.md:2124-2131` still carries it OPEN and TRIAD-tagged — uncited by the
  spec. **Technique: before porting a predicate one layer up, list the fields the
  ORIGINAL reads and strike the ones absent from the target interface. If the
  discriminating term is among them, the port is not the same guard — it is the
  guard's false-positive set with the guard removed. Then grep ROADMAP for the
  failure the port re-creates.**

- **A guard whose read/write ORDER the spec never pinned.** "Strictly less than
  the current key's register" is evaluated before the register write
  (`seriesRecorder.ts:217-224`); after it, the test becomes
  `elapsed < max(register, elapsed)` — false always — collapsing every interval
  into key 0 forever. **Technique: recurrence of the 2026-08-15 Task 11 lesson.
  For any guard expressed as a comparison against a running max, state which side
  of the max's own update it sits on. The spec that omits it has a 50% chance of
  shipping a permanent no-op.**

- **"No migration can repair old rows."** True of the SAMPLES, false of the
  DISPLACEMENT — which is the part James actually saw. The inflation applied from
  the poison tick onward is exactly the finishing interval's final work elapsed
  (67.91 s), and the saved row already stores it as `LogStep.actualSeconds`
  (`server/stores/logs.ts:80-82`), cross-confirmed by 0x0039's own 124 s total
  (ring seq 61 = 67.91 + 56.2). Repairable to 0.1 s. **Technique: "impossible to
  repair" is a claim about the STORED SHAPE, not about the lost values — enumerate
  the row's other fields and ask whether the CORRUPTION (not the data) is a
  function of one of them. A defect with a closed-form magnitude is invertible even
  when its casualties are not.**

- **A docs-truth fix that corrected one axis and left its twin.**
  `traceModel.ts:38-40`'s "the work clock excludes rest duration" is false
  (key 0's register is 129.5 s for a 67.91 s interval). The spec corrected `t` and
  said nothing about `d`, where the identical mismatch is larger: the series ends
  at 742.7 m against 0x0039's work-only 500 m. And the quantity is
  ROWER-DEPENDENT — a frozen rest contributes nothing, an advancing one
  contributes all of itself — so `t` is not a clock and is not comparable between
  intervals. **Technique: for a header correction on a paired axis (`t`/`d`,
  `x`/`y`), check the sibling before believing the fix is complete; and when a
  quantity turns out CONDITIONAL on behaviour, say conditional, not "includes" —
  the second phrasing still lets a reader treat it as a unit.**

- **A synthetic fixture asserting a number it planted.** Exit criterion "fastest
  split 1:52.2 present" reads as hardware corroboration; `p` comes from
  `currentSplit`, which the fixture invents, and 1:52.4 / 2:15.8 are just each
  interval's average pace (250 m / 56.2 s, 250 m / 67.91 s). **Technique: for every
  assertion in a synthesized-fixture test, ask which committed artifact the
  asserted number came from. The ones that came from the fixture are testing the
  fixture — restate them as the structural fact they proxy for ("interval 2's
  samples exist"), and keep the assertions to the capture's own numbers.**

- **Attacked and NOT broken (added to Phase RC's vetted ground):** the whole
  diagnosis, re-derived by hand from `walk-2026-08-24/phone-exit7-ring.json`
  (seq 27/28/35/42/49) through `parse.ts:467` -> `toProgramIndex` ->
  `driver.ts:2207` -> `seriesRecorder.ts:217/250`, sample counts and the 101 s
  delta closing against the ring's own registers; part A's gate widening (neither
  killed `driver.test.ts` regression uses state 8 or 9, no fixture in `src/` uses
  9 at all, every `frame.intervalIndex` consumer moves the right way for the
  affected tick, and no honest-data false positive is constructible since a
  genuine distance interval starts in state 5); the final-boundary immunity
  (`toProgramIndex`'s upper clamp, confirmed on ring seq 42's SECOND state-9);
  rests keying backward via the `resting -1` offset, so no rest frame is ever the
  poison; additive-field safety on the localStorage side
  (`monitorRun.ts:352-366` validates `series` structurally); and E's harness not
  being self-confirming (the fake speaks `toMachineIndex`, the deliberately
  separate inverse). ONE correction to the spec's framing: A is a three-line,
  two-file change — `parse.ts:423-448` exports ordinals 0,3,4,5,8,10,11,12,13 and
  9 exists only inside `WORKOUTSTATE_TO_STATE`, so the constant must be exported
  first.

- **Resolution (controller + James, same day):** B replaced by B-prime — the
  driver emits `attributedIntervalIndex` on the frame (rawIntervalCount's
  additive precedent) and the recorder's own derivation is DELETED (trace-truth's
  "delete the heuristic" ruling); grounded by a research pass (Concept2
  single-writer interval identity, FIT device-authored boundaries, DDIA single
  deriver; verdict durable-with-conditions). C corrected to strict `<`,
  hook-owned, client-only. Old-row displacement repair DECLINED by James
  (population ~1 row), recorded as possible-but-declined.

## Pre-spec oracle-soundness pass, 2026-08-25 (Phase RC, RC-9)

- **"0x0031's Total Work Distance reports the GOAL on a distance-goal interval,
  not what was rowed."** Believed since Phase CM, written into `driver.ts`'s
  `recordTwdVerdict` doc comment as "confirmed PRIMARY", and promoted to
  `pm5-interface-notes.md` item 25 as "a boundary accumulator of INTENDED work,
  not an odometer". **FALSE under an armed program.**
  `session-1-keystone-2x250r0.jsonl` (2×250 m, durationType 128 throughout)
  reads TWD **0** for the whole of interval 1 while 250 m are genuinely rowed,
  250 for interval 2, 500 at WORKOUTEND — Σ completed work, lagging the current
  interval entirely; the pyramid shows it ticking one-per-metre through the ws3
  rest (301→332), i.e. work PLUS rest coast. The two samples the original claim
  rests on are both from `pm5-session4b`'s ring **seq 3 and 14 — before
  `program()`'s writes at seq 7+**, a stale monitor state observed twice.
  **Technique: when a wire claim's evidence predates our own arm, it is evidence
  about the machine's LEFTOVER state, not about our program. Check the seq of
  the cited sample against the seq of the first `write`.**

- **Two counted claims in the same interface-notes item, both wrong in the same
  direction.** Item 25: "the field changes value on 41 of 1085 status ticks, and
  every one of those 41 reads workoutState 3". The 41 is exact; the "every one"
  is false — **36 ws3, 3 ws5, 1 ws9, 1 ws10**, and the five exceptions are where
  the mechanism lives. Item 25 also places a cited sample "mid the FIRST 250"
  when TWD had already stepped 0→250 at the boundary 84 ticks earlier: it is
  interval TWO, and the reading is a **1.6 s transient that reverts** (step-2
  seq 822 = 500, seq 831 = 250; pyramid seq 3255 = 1347, seq 3273 = 1047).
  **Technique: a hand-excused universal ("every one of the N") inside a
  correctly-counted N is where the counting stopped and the narrative started.
  Recount the histogram, not the total — and re-derive WHICH interval a cited
  sample is in from the boundary markers, never from the prose.**

- **"0x0032's Average Pace might be a mirror of our AVG SPLIT."** It is not, and
  the captures settle its population without hardware. Measured over all seven
  recordings, `averageSplit` tracks `500·ΣT_work/ΣD_work` to a **median
  0.07-0.20 s** (n=252/770/248/467/85/679/135), **freezes solid through rest**
  (session-2 seq 600→774: 136.13 unchanged across 9.6 s and 30.6 m of coasting),
  never resets at a boundary, and includes the opening interval (seq 594:
  135.85, where interval-2-alone would be 130.39). Work-only cumulative — the
  same quantity the C2 logbook stores ("for interval workouts this is work
  distance only", PRIMARY) and the same our `monitorAvgSplit` computes, from a
  different characteristic. **Technique: a mirror is an oracle that shares your
  DEFINITION where the AUTHORITY's differs — not merely one that agrees with
  you. Before killing an oracle as a mirror, state all three definitions (ours,
  its, the authority's) and check which pair diverges.**

- **The PM5 disagrees with itself, so "the machine's number" is not one number.**
  On the only capture carrying both, 0x0039's Avg Pace reads **138.7**
  (0.1 s/lsb) while 0x0032's `averageSplit` reads **138.44** at the last work
  sample and **138.23** after the terminal transition — a **0.47 s** spread, and
  the terminal step recurs (session-2: 129.78 → 128.76 at WORKOUTEND, −1.02 s,
  unexplained by any constructible population change). **Technique: for any
  field a verdict will sample at "the end", print its value on the last WORK
  frame and on the terminal frame separately. The step between them is a free
  measurement of how much the sampling instant is worth — here, a second.**

- **ORACLE BLINDNESS, the exit-pass class, proven by a two-column table.** Of the
  eight committed `.jsonl` recordings, exactly **one** carries a 0x0039 — and it
  is the **only one with zero `workoutState 3` frames** (rest-tick histogram
  0/177/0/116/0/236/0; 0x0039 present only on the last). So any verdict against
  0x0039's work-only totals is, on the committed corpus, testable only where
  work-only and work+rest are the same number. The rest-bearing evidence exists
  solely as a text line in `walk-2026-08-24/phone-exit7-ring.json` seq 61, which
  no CI gate can replay. **Technique: before proposing a verdict against a wire
  field, tabulate (capture × carries the field × contains the discriminating
  state). Two columns, eight rows, and it either finds the gate or proves it
  cannot exist yet.**

- **A fill path can make an oracle tautological in exactly the case it exists
  for.** `deriveFinalIntervalFromSummary` builds a missing final actual as
  `0x0039 totals − Σ recorded priors`, and its single-interval arm takes 0x0039
  verbatim. So "Σ recordedActuals vs 0x0039" is honest on a healthy run and an
  identity on a run with a dropped boundary — the run the verdict was built to
  catch. **Technique: for any oracle, grep for a code path that WRITES one side
  from the other. Name the FUNCTION that must not have run.**

- **A better oracle was sitting undecoded.** 0x003A offsets 12-14, **Total Rest
  Distance** (1 m/lsb, PRIMARY, BLE rev 1.30 p.22), has no parser at all — and
  it reads **242 m** on the 2026-08-24 r60 walk against our own 242.7 m of
  measured rest coast, and **0** on the r0 keystone. It checks the population
  RC-1 just started storing and RC-10 must POST, which nothing external checks.
  **Technique: when asked "is this oracle sound?", also ask "is it the BEST one
  available?" — grep the parsers for fields with zero non-test consumers, then
  grep for characteristics with no parser at all. The second list is where this
  one was.**

- **Attacked and NOT broken:** `parse.ts`'s 0x0037 Split/Interval Time scale
  (`/10` — a 686 raw against a 68.6 s interval looked 10× wrong until read; it
  is correct); 0x0039's cumulative-and-rest-exclusive premise (exit-7 ring seq
  61: 124 s/500 m from 0x0039 against 124 s/500 m from 0x0037/0x0038, on a run
  with 120 s programmed rest and both actuals from real splits); and the
  0.1-vs-0.01 s/lsb pace-scale split, which `parse.ts` already documents.

- **`fake.ts` sets `averageSplit: e.currentSplit`** — a coherent world in which
  no cumulative work-only average exists. Third sighting of the shape ("read
  what the FAKE puts in that field before writing the failing test"); it now
  qualifies as a standing check on any spec that turns on a wire field.

- **James's scope ruling (2026-08-25):** ship (a) rescoped + (c)
  retire-and-correct + (d) the rest-distance oracle; QUEUE (b) until a
  rest-bearing capture that survives to 0x0039 exists.
