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
  8-byte _Logged Workout Hash_ + log address + size + erg model type); "Workout Verification
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
  packing was tagged "PRIMARY (hardware, 2 captures)"; both are Aug 24 2026, hour 15. One date, one hour — the formula is INFERENCE, and §4's boundary tests pin
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

## Phase LM anchor pass (TRIAD), 2026-08-25 — "when the monitor is lost, say so"

- **"End with the link gone already stores `endedBy: "link-lost"`, so the label is a
  read of a fact we have."** True — and vacuous in the flagship case, because there is
  no record to read it off. `createMonitorRun` has ONE call site
  (`useMonitorSession.ts:1681`), inside the `phase === "ready"` first-pull gate
  (`state === "rowing" && rowingActive && distanceMeters > 0`, or a 5-frame streak),
  and `closeRecord` (`:1477`) opens with `if (run === null …) return`. A rower who
  locks the phone BEFORE the first pull never leaves `ready`, so End stores nothing at
  all — and the manual door's save (`LogSession.tsx:1605`) posts neither `deviceName`
  nor `endedBy`, so the stored row's `ended_by` is NULL and `buildLinkLostLine`
  (`storedSummary.ts:882`) can never fire either. The file's OWN comment at
  `useMonitorSession.ts:988-990` states the mechanism verbatim ("End produces a session
  with no record and no error anywhere"), and `ROADMAP.md:3271` had already recorded it
  from the original tester report. **Technique: for any "the record already carries X"
  premise, find the record's CONSTRUCTOR and read its gate — not the writer of X. A
  field's writer proves the field is set when the record exists; only the constructor
  says whether it does. And when a spec's own cited ROADMAP section is one scroll from
  the answer, read the section, not the anchor.**

- **A spec's two-candidate dichotomy, both candidates killed by the spec's own
  photograph.** Task 1 offered "door fallthrough" vs "`storedSummary`'s label ladder".
  `phone-lost-saved-row.png` renders the `WORKOUT COMPLETE` eyebrow, which lives only in
  `PostWorkoutSummary.tsx:639`, imported by exactly one file (`LogSession.tsx:44`) — the
  LIVE summary. `storedSummary.ts` cannot produce that frame at all. And
  `MonitorRun.deviceName` is a REQUIRED `string` (`monitorRun.ts:131`), so "no device
  name was stored" is impossible on a live run regardless. The surviving mechanism
  (`run === null`) was the one condition the spec's own enumeration of "four conditions"
  dropped. **Technique: identify WHICH COMPONENT a committed screenshot is, by grepping
  a literal string visible in it, before reasoning about which builder produced its
  fields. A screen's identity is a free, exact discriminator between candidate
  mechanisms, and "the saved record" in prose can mean two different screens with two
  different derivations.**

- **Fusing a provenance field with a close-reason field is the mirror shape in
  display clothing.** `sourceLabel` answers "where did these numbers come from";
  `endedBy` answers "how did this close". They agree only on the zero-measured close.
  On a link that drops after 3 of 4 intervals, a `LINK LOST` source label stamps failure
  over genuinely PM5-measured data and deletes the one signal saying it came off the
  machine — while `LINK_LOST_LINE` (`storedSummary.ts:874`) already exists to say
  exactly that, on a row with data. **Technique: before merging two fields because they
  agree in the observed case, write the 2x2 and name the quadrant where they disagree.
  If the codebase already has a separate renderer for the second field, that renderer IS
  the prior team's answer to this question.**

- **A research pass can be thorough, correctly tagged, and answer at the wrong LAYER.**
  The spec cited Apple's Core Bluetooth background doc (PRIMARY, accurate) to conclude
  iOS "HAS the concept" of listening while pocketed, and scoped a `UIBackgroundModes` PR
  2 on it. That concept belongs to the NATIVE app; our logging lives in a WebView, and
  the repo's own `docs/superpowers/research/2026-08-20-ble-connection-management.md:1500`
  had already established that WebKit's WebContent throttler suspends it on a rule where
  "nothing … reads `UIBackgroundModes`" — with a James ruling on the same date
  (`ROADMAP.md:2120`): "CORRECT RESUME, not a background mode." **Technique: before
  accepting a does-it-exist answer, name the LAYER the capability is documented at and
  the layer your code runs at. Then `ls docs/superpowers/research/` — this project
  researches things once and then re-researches them from scratch, and the second pass
  is always the shallower one.**

- **"This is a complete explanation of the observed 0 m."** Not complete: queue-and-
  deliver predicts data ARRIVING on resume, and `pm5-interface-notes.md:4663` records a
  15-20 s screen lock NOT dropping the GATT link with "the session resumed ticking on
  unlock". The walk README's own W-10 declines to establish the mechanism. A second
  producer lives in our code: the ready gate needs `rowingActive` AND increasing
  distance, so a rower who stops before unlocking loses the session on a healthy link.
  **Technique: an explanation is "complete" only if it predicts the observation
  UNIQUELY. Ask what the cited mechanism predicts, compare that to what was seen, and
  enumerate the in-house producers of the same symptom before crediting the platform.**

- **Attacked and NOT broken (Phase LM's vetted ground):** the absent `UIBackgroundModes`
  key (whole plist read); keep-awake spanning the live surface
  (`ConnectedInterstitial.tsx:283-286` + its own `<ConnectedSurface>` at `:716`, plugin
  present in `package.json` and `Package.swift`) and therefore the MANUAL-lock
  inference; `closeRecord(true, linkGone ? "link-lost" : "rower")` at `:2782` with
  `linkGone` correctly covering both `disconnected` and latched `frameSilence`;
  `buildMonitorLogSteps` throwing only on a missing/mis-sized `logSeed`
  (`logDraft.ts:834-843`); `storedSummary.ts:281`'s source-keyed `timeLabel`
  suppression; the "all three exits" criterion on either door (`PostWorkoutSummary` is
  shared, both doors pass `plan`); `targetsOnlyCaption` as an existing one-rule-two-
  screens precedent; and every `file:line` citation in the spec — all eleven resolve to
  their subject, which is rare enough to be worth recording. Two residuals: the spec's
  `timeLabel` warning is INVERTED (the current condition already gives a fourth value
  its time), and `row.loggedAt` is the SAVE moment (`schema.ts:148`), not the closing
  moment the spec justifies it with.

- **Controller's follow-up ruling (James, 2026-08-25), which the pass earned:** the
  2026-08-20 "correct resume, not a background mode" ruling was scoped to an
  interruption of a session ALREADY RUNNING, and the never-started case falls outside
  it — correct resume has nothing to correct toward. So §D1e's probe (one build with
  `bluetooth-central`, one without, count frames across a ~60 s background window) is
  folded into PR 1's instrumentation rather than deferred, and PR 2 gets scoped on
  measurement. **PR 1 still ships no plist change.** Note §D1e's own closing line —
  "Do not write a spec that assumes either answer" — which revision 1 violated in both
  directions at once.

## Phase LM delta pass (revision 2), 2026-08-25 — "the instrument that cannot be read"

- **"Task 1 adds ring entries so the next occurrence is self-diagnosing."** The
  entries are real; the readout does not exist. `ergomatic:last-rowed-log` is
  written only inside `if (runRef.current !== null)` (`useMonitorSession.ts:2296`),
  `MonitorLogRow` renders only when that key exists (`LogSession.tsx:743`, its own
  comment: "a session that never rowed has no key at mount and none ever
  materializes later either"), `RecordingDownloadRow` gates on a dev-only global
  (`:691`), and the walk README's own provenance table says piece 3 had "none (no
  console on iOS)". So a phase whose entire subject is the never-rowed session
  planned to instrument it into a store that is run-gated, session-scoped and
  console-only. §D1e had specified `localStorage`; substituting "the existing ring"
  is what introduced it. **Technique: for any "we will instrument it" claim, trace
  the READOUT to the device, not the write. Find the export affordance's own render
  gate and ask whether the failure under study satisfies it — the anchor pass's
  read-the-constructor's-gate rule, applied one layer further out.**

- **A spec can forbid asserting a cause in one section and license the assertion as
  user-facing copy in another.** §"What we do NOT know" named two producers and
  refused to choose; Task 2's warning constraints then licensed "State what we know
  — we hear the erg only while the app is on screen", which is producer #1 stated as
  fact, in shipped copy, in the same PR whose probe exists to decide between them —
  quoting §D1e's "Do not write a spec that assumes either answer" two pages earlier.
  **Technique: after a spec adds a no-asserting-a-cause rule, grep its own later
  sections for the cause. The rule and its violation are usually separated by enough
  pages that neither author nor reviewer holds both at once.**

- **A probe's procedure and its justification can describe different machine states.**
  §D1e's verbatim procedure opens "Row, background the app" — the record is already
  open. The spec's reason for running it was retroactive READY-gate opening, which
  only exists before the first pull. It also never said the rower must keep rowing
  while backgrounded, without which a drained backlog carries no pull and cannot
  open the gate. **Technique: for any inherited procedure, state the starting STATE
  it produces and check it against the state the conclusion needs. A verbatim quote
  is not a checked instruction (recurring failure #13).**

- **A frame count is not one measurement.** It cannot separate "JS ran" from
  "backlog drained" (only the stamp distribution can, and a processing-time stamp
  makes a drain look like a freeze); it cannot separate "no frames delivered" from
  "the link dropped while suspended" (Apple, PRIMARY, §D2b: you do not learn of a
  disconnect until resume) without a link-state readout the probe did not have; and
  it is uninterpretable with no denominator — `pm5-interface-notes.md:4152` gives
  ~2 Hz even while merely armed, so ~120 frames per 60 s is the expectation.
  **Technique: before accepting a scalar as an oracle, write the outcomes it must
  distinguish and check that each maps to a different value of THAT scalar. Two
  outcomes sharing a value is a mirror with extra steps.**

- **"Post a close reason" is not a decision until the field and the value exist.**
  Task 4's option 1 had two candidate fields and both were determined wrong:
  `endedBy`'s five values (`schema.ts:68-74`) contain none meaning "connected, never
  saw a pull", a sixth is a pgEnum migration the spec never mentioned, and
  `buildLinkLostLine` (`storedSummary.ts:881`) is a deliberate equality check that
  would render it invisibly; while `deviceName` alone flips `sourceLabel`
  (`storedSummary.ts:252`) to the erg's name on a row with zero measured data — the
  same provenance/close-reason fusion the spec forbids, inverted. **Technique: for
  any "store what it is" option, enumerate the writable fields, read each one's
  READER, and check the stored enum's actual members. An option with no legal value
  is not the cheap option, it is not an option.**

- **A photograph can record our own code rather than the world.** `· LOST` in
  `phone-lost-live.png` proves nothing about the link: the app-lifecycle listener
  sets `frameSilence: true` on EVERY foreground event unconditionally
  (`useMonitorSession.ts:2653`), retracting only after the hysteresis window.
  **Technique: before reading a banner in a capture as evidence about the device,
  find every unconditional writer of the state behind it.**

- **Attacked and NOT broken (added to Phase LM's vetted ground):** the app-lifecycle
  resume path does not tear down the driver, unsubscribe, or reset the ready-gate
  streak (`useMonitorSession.ts:2649-2661`), so a drained backlog would genuinely
  reach the gate — the spec's "the gate would have opened" leg survives; the PM5
  notifies at ~2 Hz while merely armed (`pm5-interface-notes.md:4152`), so a frame
  count is meaningful even if the rower stops; and the proximate defect
  (`run === null`, phase never left `ready`) is PROVEN rather than merely surviving
  elimination. **Moved OFF the vetted ground:** "keep-awake means the screen will
  not sleep on its own" — the anchor vetted the SPAN, not the EFFICACY, which is
  INFERENCE (the plugin sets `UIApplication.shared.isIdleTimerDisabled`; Apple's own
  documentation for that property could not be retrieved this session), is armed
  fire-and-forget with no catch on the native arm, and is best-effort on the web arm.

## Premise pass, 2026-08-26 (the WorkoutType "generic rename" instinct)

- **"The four codes select which baseline a workout's targets resolve against
  (AN/TR -> 2k, AT/O2 -> 6k)."** Believed because `plans.ts:29-30` says exactly
  that, in prose, beside the checkpoint constants that act on it. FALSE as a
  code claim: `pace.ts:33` keys on **`ref.base`**, a field stored PER WORK STEP
  (`types.ts:5-8`), and a repo-wide search for a behavioural branch on a
  `WorkoutType` literal in product code returns **ZERO** -- every `.type ===`
  hit belongs to the PHASE union (`"work"|"rest"|"test"`), a different union
  sharing the field name. But the comment is true about the DATA: counting the
  seed gives **an 68/0, tr 218/0 (2k), at 0/193, o2 0/206 (6k) -- 286/286 and
  399/399, zero crossings** -- and `library.test.ts`'s authoring gates all key
  on `ref.base`, never `w.type`, so the invariant is enforced by NOTHING.
  **Technique: when a comment asserts a semantic coupling, ask separately
  whether the CODE implements it and whether the CORPUS obeys it. The
  interesting answer here was "no and yes" -- an unenforced 100%-held
  convention living in one comment, which no amount of reading either the
  code or the prose alone would have found. Count the corpus.**

- **"A rename is expensive because of the pgEnum."** Deflated by the primary
  source: PostgreSQL `ALTER TYPE name RENAME VALUE old TO new` is catalog-only,
  no table rewrite, ordering preserved
  (<https://www.postgresql.org/docs/current/sql-altertype.html>). Four DDL
  lines for `workouts.type`; one UPDATE for `session_logs.workout_type` (which
  is plain `text`, not the enum -- `schema.ts:147` vs `:46`). The real cost is
  **1230 literal occurrences across 88 files** (26 non-test), 5 e2e spec files,
  84 captures, and 8 documented ordinal/grouping invariants. **Technique: price
  a migration against the vendor's DDL semantics before calling it expensive --
  and then count the literals, because the cost is almost never the database.**

- **"We haven't hit prod yet, so nobody has meaningfully seen the article."**
  Two claims wearing one sentence. `RELEASING.md:3` -- "The web app at
  https://ergomatic.waffle.haus deploys continuously on every merge";
  `deploy.md` documents a GitHub environment named `production`. Every deploy
  runs the seeder, so **every prod DB holds 300+ typed `workouts` rows before
  any user exists**. And the article is `articles.tsx:47-56`, slug
  `workout-types`, `pinned: true`, **registry index 0**, published 2026-08-07 --
  `git tag --contains` returns **20 tags, v0.6.0 through v0.23.0**.
  **James's correction, verified and upheld:** prod is CLOSED --
  `server/index.ts:84` gates account creation on `ALLOWED_EMAILS` and warns
  "nobody can create an account" when empty -- so the seeded rows regenerate
  and real user history is bounded by the allowlist. **Technique: when an owner
  says "we haven't shipped X", split it into the AUDIENCE claim and the
  STORED-DATA claim and check them separately -- `git tag --contains <commit>`
  settles the second in one line, a seeder settles it without a single user,
  and an auth allowlist can make both true at once.**

- **"There is no pressure to extend the four-member set."** Half wrong, and the
  correction relocates the problem. `git log -L1,1:app/domain/types.ts` shows
  **two commits in the repo's life -- the creation and a prettier quote change.
  The members have never changed** (the only nearby taxonomy event went the
  other way: ROADMAP:1445 RETIRED `"TEST"` from the sibling `PlanCode` union).
  But the merged Just Row spec writes a fifth value -- `"JustRow"` -- into
  `session_logs.workout_type` and CLOSES that column to `AN/O2/AT/TR/JustRow`.
  Verified against the primary source that this conflates two orthogonal
  taxonomies: Concept2's `workout_type` is **structural** (`JustRow`,
  `FixedDistanceInterval`, `VariableInterval`...) and its only intensity
  concept is `targets.heart_rate_zone` 0-5
  (<https://log.concept2.com/developers/documentation/>), while ours is
  **intensity**. **Technique: when a design adds a value to a set, check
  whether the new value comes from the SAME taxonomy as the existing members.
  A fifth member borrowed from another vendor's vocabulary is a name
  collision, not an extension -- and it is cheap to catch before the column
  closes around it.**

- **A grep-driven rename would corrupt an English article.**
  `surfaceModel.ts:1573`, `if (digits.startsWith("8")) return "AN";` -- "AN 800
  M PIECE". **Technique: before scoping any rename of a short uppercase token,
  grep the literal and read every hit for HOMOGRAPHS. Two-letter domain codes
  collide with ordinary words, CSS values, and article words.**

- **Attacked and NOT broken:** the ordinal/grouping semantics really do survive
  a neutral rename mechanically -- `plans.test.ts:49`'s strict `O2 > AT > TR >
AN` pyramid, `:71-79`'s `["AN","TR"]`-vs-`["O2","AT"]` partition,
  `library.test.ts:65-79`'s monotone spm/pain bands, and `patterns.json`'s
  quota grid are all expressible over `Type1..Type4`. The case against generic
  names is not that the code breaks; it is that eight invariants stop being
  READABLE and one (the type-to-base pairing) loses its only written record.
  Worth keeping: **"does the rename break the code" and "does the rename break
  the audit" are different questions, and for a taxonomy the second is the
  expensive one.**

## Premise pass, 2026-08-27 (screenshot capture churn)

- **"The ~21 remaining PNG diffs are date-driven; freeze the clock and the
  suite is stable."** False. Ran `pnpm screenshots` TWICE on the same day at
  the same commit: 13 of 90 captures still differ with the calendar held
  constant, and only 7 of the 22 baseline diffs are date text. The dominant
  source is `e2e/helpers.ts:50`'s `RUN_ID`, rendered by `src/You.tsx`, which
  flipped the test user's email between a 2-line and a 3-line wrap and
  shifted four whole pages by one line — 48,610-62,167 px per capture, an
  independent coin flip per capture per run (three runs showed each of the
  three possible odd-one-out patterns). **Technique: to separate date churn
  from nondeterminism, run the capture suite TWICE IN ONE DAY and diff run
  against run. The calendar is held constant for free, and everything that
  still moves is the part a frozen clock cannot reach.**

- **"`RUN_ID` is now fixed width, so the reflow is fixed" (`ROADMAP.md`,
  marked DONE 2026-08-20; restated at length in `e2e/helpers.ts:20-50`).**
  False, and the note contains its own warning against the assumption that
  killed it ("isolate the exact length-varying sub-mechanism before assuming
  a frozen `RUN_ID` alone fixes it"). What was made fixed by construction is
  LENGTH; the reflow depends on WIDTH. Measured in the running stack:
  Archivo has no tabular figures (ten `1` = 67.734 px, ten `8` = 74.625 px at
  13px), a 6-char base36 suffix spans `jjjjjj` 17.41 px to `mmmmmm` 67.09 px,
  and 12 random samples of the rendered line spread 9.23 px — straddling the
  wrap boundary. The same file the note names, `you-derive-offer.png`, still
  churned across the same 13 row bands at 1.85x the pixels the note measured.
  **Technique: when a fix claims to have made a rendered string invariant,
  measure the dimension the LAYOUT reads, not the one the code controls.
  "Fixed length" and "fixed width" are the same sentence in a monospace font
  and different claims in every other font — check the font before believing
  either.** Corollary, from an option this pass nearly recommended: the
  obvious repair (digits only) is also wrong for the same reason, and the
  measurement killed it in thirty seconds.

- **A pixel COUNT does not classify a diff.** Four of the diffs found here
  are 39k-80k px: one is stale committed content (`releases.png` still showed
  `v0.23.0 · 25 AUG` two releases after #205), one is a deterministic
  sub-pixel shift invisible to a human (`news-reader.png`, max delta 227 and
  still nothing to see), and two are the wrap flip. Two others are 8 and 10
  px at max channel delta 2-3 — invisible, but they still dirty `git status`.
  **Technique: for every image diff, report the max channel delta and whether
  the pair is stable across a second run, alongside the pixel count. Count
  alone cannot tell a real regression from a half-pixel of nothing, and both
  shapes are present in the same suite.**

- **Controller's note on the fix that followed.** The repair landed at the
  LAYOUT, not the string: `.you-identity { min-width: 0 }` plus the address
  clamped to one line, so the block's height stops depending on its content
  and no future identity scheme can reintroduce the reflow. Residual churn on
  those six captures fell to 541-3,090 px inside rows 45-91. **The first
  version of the test for it passed vacuously** — it compared a "short" and a
  "long" address, but `signInViaBackdoor` appends `RUN_ID` to both, so both
  wrapped to 42 px and the heights matched for the wrong reason. Caught by
  probing what the test actually rendered. The shipped test measures the
  element against ITS OWN line box, which is this pass's own lesson applied
  to its own fix.

## Phase LA anchor pass (TRIAD), 2026-08-27 — "the link authority"

- **"`withLiveness` is the one seam that sees all three inputs — it already accepts a
  `LivenessLifecycleEvent`."** FALSE, and the whole design was drawn on it.
  `grep -rn LivenessLifecycleEvent src/ domain/ server/` returns FOUR hits, all inside
  `liveness.ts`: it is the decorator's OWN event-record type and its `kind` union is
  `connect|write|disconnect|link-drop|silence|recovery` — no lifecycle member. App
  lifecycle is registered in `useMonitorSession.ts:2962` and reaches the decorator only
  via `markSuspect()`, which by a Phase LM exit criterion **refuses to carry a cause**
  ("Names WHO, never WHY"). **Technique: a type whose NAME matches the concept you need
  is the cheapest false premise in a codebase this heavily commented. Grep the type name
  repo-wide and read its member list before writing "already accepts" — a producer of a
  record type is not a consumer of an input.**

- **"There is exactly one user-visible consumer of `endedBy === 'link-lost'`."** False,
  and the misses change stored NUMBERS. `"rower"` sits on the admitted side of two
  `{finished, rower}` allowlists the enumeration never opened: `burstEligible`
  (`useMonitorSession.ts:2630`) makes teardown LINGER 2000 ms for the summary burst, and
  `appendSummaryObservations` (`monitorRun.ts:1096`) then WRITES `summaryTotals`, which
  becomes `machine_work_*` and flips the saved row onto `storedSummary.ts:618`'s TIER A —
  a different derivation of the headline split/distance. **Technique: for any spec that
  RELABELS an enum value, do not grep the OLD value's readers. Grep the NEW value's
  readers, and specifically every allowlist the new value is a MEMBER of. A relabel moves
  a row across every predicate that partitions the enum, and the interesting ones name the
  destination, never the source.**

- **A new licensing rule can switch off shipped code nobody listed.**
  `applyContinuityCheck` (`useMonitorSession.ts:585`) opens `if (!frameSilence) return`,
  and its only writing exit is `completeContinuityReset` → stored `endedBy: "link-lost"`.
  The spec's "only `down` or `quiet` may change what is stored" therefore disables the
  continuity door for lifecycle-explained resumes — the exact case it was built for
  (RULED F1/I1: "the close with the STRONGEST evidence"). **Technique: for any rule of the
  form "only verdict X may write field F", grep every WRITER of F and check what gates it.
  A writer gated on the same flag the new verdict re-classifies is silently inside the
  rule's blast radius, and specs enumerate readers, never writers.**

- **"A wrong verdict now costs a terminate on an already-finished piece."** The safety
  argument assumes the machine did nothing during a blind window the same walk measured at
  39.4 s. Rower backgrounds mid-session, finishes at the erg, starts a cool-down, unlocks,
  presses End → the spec's rule sends a terminate into a LIVE new piece. No safety net at
  the machine: `pm5-interface-notes.md:1598-1602` records a standalone idle terminate
  acking slaveState READY — "**An ACCEPT, not a reject**", retracting the earlier
  "the PM refuses a terminate when nothing is loaded" as a misparse. And a terminated
  partial leaves NO trace in PM5 memory (walk-2026-08-27 finding 7). **Technique: for any
  "the safe direction" claim about a wire command, ask what the machine could have done
  during the window that produced the wrong verdict. A blind window long enough to cause
  the misclassification is long enough for the state the argument assumes away.**

- **A ring is not a recording, and the difference kills replay gates.**
  `walk-2026-08-26/phone-ring.json` and `walk-2026-08-27/lock-phone-ring.json` are
  event-log rings (`{seq,kind,detail}`), zero bytes; the spec called the first "real wire
  data". Further: `grep -c '"kind":"lifecycle"'` returns **0 across all six committed
  `.jsonl.gz`**, and none can ever carry one — the byte recorder is web/dev-only
  (`adapters/monitorTransport.ts` header) while the web lifecycle arm is a deliberate
  no-op (Phase LL minor 9). The platform with the signal has no recorder; the platform
  with the recorder has no signal. The runnable substitute already exists:
  `lifecycleReplay.test.ts` SPLICES synthetic lifecycle events into a real capture.
  **Technique: before citing a walk directory as a replay fixture, `ls` it and check the
  extension. `*-ring.json` and `*-recording.jsonl.gz` are different instruments; then grep
  the recordings for the literal event kind the gate needs, and ask which PLATFORM can
  produce it.**

- **Reusing one half of a two-part verdict is a false economy the code warns about.**
  The spec reused `STRUCTURE_MISMATCH_TICKS`'s N=3 "rather than invent a second constant".
  That constant's own comment: "**NO LONGER SUFFICIENT ON ITS OWN** (hardware walk 5)…
  this count now carries only the STABILITY half; `STRUCTURE_MISMATCH_WINDOW_MS` carries
  the DURATION half… and a rejection needs both." Reusing BOTH invents nothing. Measured
  for free: the RC-37 mismatch holds 112 frames / 56.4 s, so no aggressive threshold is
  needed. **Technique: when a spec proposes reusing a constant, read the constant's doc
  comment for a sibling. This repo splits verdicts across paired constants and records the
  hardware that forced the split, in the comment of the half you were about to reuse
  alone.**

- **Attacked and NOT broken (Phase LA's vetted ground):** every `file:line` citation in
  the spec resolves to its subject (11 of 11, including the `endedBy` doc-comment quote
  and the driver's "one entry per verify phase" note, both verbatim); every walk figure
  reproduces from the committed artifacts (re-decoded `menu-at-ready-recording.jsonl.gz`
  independently — `wt 8→1` at t=29.05, 156 frames, median 540 ms spacing, plus a
  two-step arm at t=6.63→7.17 the README omits); the stored shape follows `0012`/`0013`
  exactly (new pgEnum + additive nullable column, no default, no backfill) and the API
  stays additive (GET selects columns explicitly, no analytics/CSV/export path exists
  anywhere in `src/` or `server/`); RC-37's fold-in is ROADMAP-directed
  (`ROADMAP.md:3430`, "Mirror of RC-30 … design them together"), not scope creep; and
  RC-38's binding is already how `verifyArmed` works (`expectedArmedStructure(p)` =
  "the sent program's interval 0", never a literal 8).
  **One self-correction worth keeping:** the pass first measured that the structural
  quadruple MOVES mid-session in healthy captures (`rests-finished` durRaw 6000→500 with
  durType 0→128; `pyramid` 300→700→300) and called the always-on comparator fatal. It is
  not — the existing `armed` (ws==0) gate excludes every one of them: filtered to armed
  frames across four healthy captures, 447 frames, only 2 mismatch, both single-tick
  arming transitions. **Technique: when a per-tick comparison looks unsafe, re-run the
  corpus filtered by the predicate's OWN guard before writing the finding. The guard is
  usually the reason the shipped code was safe, and the spec's real defect is failing to
  say the guard must stay.**

## Phase RC — link-authority YAGNI pass (2026-08-27)

- **CLAIM (spec outcome 1, headline): "nine LOST THE MONITOR banners in 288 s"
  is the harm this spec fixes. FALSIFIED AS CURRENT.** Phase LM shipped
  `decideResumeLatch` (v0.24.0) and the production ring from the NEXT day
  (`walk-2026-08-27/lock-phone-ring.json`, v0.25.0 build 759) shows ONE latch
  for one 39.4 s lock, with `silent=true` — the watchdog firing correctly over
  a stream that genuinely stopped, exactly as v0.24.0's own release note
  promised testers. **Technique: read the spec's motivating capture, then read
  the NEWEST capture from the same directory and diff the behaviour.** A spec
  written days after its evidence inherits a defect the fix already closed.
  Sibling of recurring failure 16's "corpus facts have expiry dates" — this
  time the stale fact was OUR OWN BUG, not a wire observation.

- **CLAIM: relabelling `endedBy: "link-lost"` -> `"rower"` lets a saved row
  show what was rowed. FALSE.** `isReconstructableClose` (`storedSummary.ts:472`)
  admits only `"finished" || null`, so `"rower"` lands in FALLBACK too. The
  relabel buys exactly TIER A eligibility, and the spec's own walk shows TIER A
  can render SMALLER than the rower rowed (500 m vs 559.8 m). **Technique: for
  any "this change makes X display better", find the predicate that gates the
  display and read its literal members — not the enum, the GATE.** The spec
  reasoned from the value's name, never from the function that reads it.

- **CLAIM (RC-37): the structural mismatch is a deterministic signal, not a
  heuristic. HELD, and verified independently of the spec.** Decoded 0x0031
  bytes 6/14-16/17 directly out of `menu-at-ready-recording.jsonl.gz`: all
  THREE `expectedArmedStructure` fields diverge together and hold 112
  consecutive frames / 56.4 s. Across four healthy captures, **300 armed
  frames, ZERO mismatches** — stronger than the 447/2 figure in circulation.
  **Technique: decode the committed capture yourself rather than accept the
  README's transcription; count the NEGATIVE corpus (healthy armed frames)
  before believing a detector.** A false-positive rate is evidence; a single
  positive observation is not.

- **TECHNIQUE, general — the brittleness axis separates the cheap work from
  the expensive work.** Ask of every mechanism: does the machine TELL us this,
  or are we inferring it from a coincidence? Here it split the spec cleanly:
  RC-37 compares a readback against a value we ourselves sent (deterministic);
  `explained-quiet` infers causation from a lifecycle event near a silence,
  over `SILENCE_THRESHOLD_MS`, whose own comment concedes _"Native's own
  inter-frame gap distribution is UNMEASURED… necessary-and-not-sufficient
  evidence, not proof, for the platform it exists to protect"_
  (`liveness.ts:126`). The axis inverted the spec's own priority ranking:
  its outcome 6 was the one worth building, its outcome 1 was a copy change.
  **James supplied the axis** ("I don't want to invent brittle heuristics to
  catch something that we're not told about in a deterministic way").

- **TECHNIQUE — distinguish a REPORTED harm from an AUDIT-PREDICTED one before
  ranking.** The only user-reported loss in this whole area was the pre-row
  lock (`ROADMAP.md:6455-6474`: record never opened, row saved LOGGED BY HAND),
  and v0.24.0 shipped its fix. RC-29 and RC-30 have never been observed in the
  field. A spec that ranks by predicted severity and never asks "has anyone hit
  this" will build the rare thing first.

- **CORRECTION TO THE RECORD:** `ROADMAP.md`'s RC-30 entry sizes the ready-gate
  lag at "up to ~5 s at the 1 Hz cadence". The gate's own comment
  (`useMonitorSession.ts:1203-1210`) says 5 frames at the observed **2 Hz** =
  ~2.5 s, and the `declared` path fires on the FIRST rowing frame, so the
  window only opens when `rowingActive` is stuck unset. The ROADMAP number is
  double, and its trigger is narrower than the entry implies.

## Phase RC YAGNI triage, 2026-08-27 (an audit's own findings, re-audited)

- **"Of the eight committed recordings exactly ONE carries a 0x0039, and it is
  the only one with ZERO rest frames" (RC-9(b), and repeated verbatim in
  `avgPaceVerdict.replay.test.ts`'s header).** FALSE as of two walks ago. A
  census of all twelve committed recordings — `gzcat | jq` over `dir==="rx"`,
  bucketing by characteristic — gives **four** with a 0x0039
  (`walk-2026-08-23/keystone`, `walk-2026-08-25/rests-finished`,
  `walk-2026-08-25/smoke-terminated`, `walk-2026-08-27/boundaries-terminated`),
  and `rests-finished` is rest-bearing, reaches 0x0039, and won on the split
  rather than `filled-from-summary`, so it is not tautological either. The
  ROADMAP contradicted itself on the same page: W11's own entry already said
  the blocker had lifted. **Technique: never take a corpus claim from prose.
  Census the capture directory yourself, by characteristic, and print the
  table. Corpus facts here have expiry dates and the document stating one is
  always older than the walk that killed it.**

- **"Two consumers already opted out individually, so the source is wrong"
  (RC-36) — a code-smell argument, not a harm argument.** The genuinely wrong
  arm (`intervalIndex === null` while an interval is current) **already has its
  own instrument**: `driver.ts:2497` logs
  `"has no corresponding interval in a N-interval program"`. Grepping every
  committed capture, ring and walk README for that literal returns **zero**.
  The other arm is deliberate, with the reason in the code
  (`"needed there so the hero targets always show SOMETHING"`).
  **Technique: before pricing a fix for an unobserved defect, grep for the
  defect's OWN log line across the capture corpus. An instrument that already
  exists and has never fired is the cheapest possible close — and this repo
  keeps filing items whose instrument is already shipped and silent.**

- **"F2b's clean sweep is VACUOUS" (RC-32) had nothing to ship.** The vacuity
  is not a discovery: `continuity.ts`'s own doc records the decision as
  "KEPT", and `continuity.test.ts:974` asserts `nonSuppressedPairs === 0`
  deliberately, citing recurring failure #21 by name. **Technique: when an
  audit reports a gate as vacuous, read the gate's own test before filing —
  if the test already asserts the vacuity on purpose, the finding is the
  test's, and the remedy is a capture, not a PR.**

- **"The series recorder's absent-key arm rests on a false premise" (RC-35) —
  the premise is the ITEM's, not the code's.** `seriesRecorder.ts:325-336`
  opens with an explicit, documented ABSENT arm ("ABSENT continues the last
  key … it never starts a register"). What is actually wrong is one adjacent
  sentence. **Technique: when an audit says code "assumes X is present", read
  the branch that handles X being absent before believing it. Three of this
  audit's eight queued items were the audit reading a deliberate design as an
  oversight.**

- **"Terminate ⇒ 0x0039's avgStrokeRate reads exactly double" (RC-16), from
  two captures.** Falsified by the third: walk-2026-08-27's terminated piece
  reads 25 against the PM5's own screen reading 25. The suppression the item
  asked for would have been WRONG on the newest capture, and the field is
  rendered nowhere. **Technique: a rule inferred from two observations of the
  same state gets re-checked against every later capture in that state before
  it is built. Two points define a line and also define a coincidence.**

- **"A different assertion failing each time means shared state or ordering"
  (RC-19).** An inference presented as a conclusion, excluding a producer
  nobody ruled out: vitest's default 5000 ms timeout under a combined-project
  run, against a file posting 1 MB bodies and 14,400-sample series. Both
  producers predict "a different test each time". **Technique: for any flake,
  the first evidence is the FAILURE MESSAGE, not a theory. `Test timed out in
5000ms` and an assertion diff are one line apart and point at opposite
  fixes.**

- **Attacked and NOT broken (Phase RC's vetted ground for its close):** the
  exit criteria at `ROADMAP.md:4759` are real, falsifiable, and four of five
  are met with committed evidence; RC-30's mechanism is genuine (`terminate()`
  keyed on our derived `phase`, not `frame.state`) though its ROADMAP entry
  doubles the window — the code is 5 frames at ~500 ms in the stuck-byte case
  only, not "~5 s at 1 Hz"; RC-13's cancel-not-drain at `driver.ts:5773-5774`
  is exactly as described; and the C' rider at `useMonitorSession.ts:2049` is
  real, on a close path the distance-goal suppression makes near-unreachable.

- **The structural lesson, worth more than any single item.** A derivation
  audit's output is a list of SHAPES, and shapes are hypotheses. Eight items
  were queued "ranked by cost"; re-audited against captures and the code's own
  instruments, **one earns a build, one is half-fixed by the PR already open,
  and six close** — one of them (RC-31) already falsified at the erg the same
  day. **Technique: an audit's findings get the same evidence bar as a spec's
  premises. Ask of each: has this ever happened, and does an instrument for it
  already exist and sit silent? Run that pass BEFORE the items enter the
  ROADMAP, not after they have been ranked and sequenced.**

## Phase RC exit pass, 2026-08-28 — the oracle corpus and the close-out claims

- **"Every committed wire recording this repo holds is replayed" (the corpus
  test's own header; ROADMAP softened it to "that carries a program").** FALSE
  both ways: `find docs/monitor/sessions -name "*.jsonl*"` returns **14**, the
  file replayed **8**, and the ONLY recording whose header carries a `program`
  object (`walk-2026-08-17/step-3`) was one of the six omitted. Two of the
  omitted (`session-1-keystone`, `step-2`) replay clean and produce full
  agreeing avg-pace verdicts (delta 0.19 / 0.08) off a program identical to one
  already transcribed — free coverage, since added. **Technique: for any
  "every X" claim about a corpus, run the `find` yourself and diff the count
  against the literals in the file. A coverage headline is a countable claim,
  and it is the cheapest one in any exit pass to check.**

- **"Every assertion class was mutation-proved" (recurring failure 21's own
  discipline, claimed).** FALSE for one class: none of the six listed mutations
  touched the rest-exclusivity assertions, and the `/10`->`/100` decode mutation
  leaves them GREEN (`25.48 < 373.8`). One of the three was VACUOUS: its bound
  was the program's TOTAL programmed rest (120 s) while only ONE rest was taken,
  so a rest-INCLUSIVE 0x0039 would read ~120.2 s and `120.2 < 179` passes — the
  assertion could not distinguish the hypothesis it exists to falsify. Fixed by
  rebuilding the bound from the rest actually TAKEN and hoisting the class ahead
  of the equality pins so it is the assertion that REPORTS; a `+120` decode
  mutation now turns all three red (`374.8 < 373.8`, `252.5 < 191.5`,
  `180 < 119`). **Technique: walk the mutation LIST against the assertion list
  and find the assertions no mutation names. Then, for each survivor, compute
  what the losing hypothesis would actually have printed and check the
  inequality by hand — a bound built from PROGRAMMED quantities instead of
  OBSERVED ones is the usual way a discriminator goes vacuous. And an assertion
  that only ever fires AFTER a stricter neighbour is an assertion whose
  mutation evidence belongs to the neighbour.**

- **"Or the reason it CANNOT is documented" used to discharge a criterion that
  CAN be met.** Exit (d)'s documented reason was "it deserves its own phase",
  quoted beside James's "we can open the logbook Saturday" — affirmative
  evidence of feasibility. Scheduling is not impossibility, and (d) was the only
  criterion reaching outside our own definitions. Repaired to CARRIED FORWARD,
  with the sentence transcribed into the receiving phase's exit block as the
  receipt. **Technique: read a criterion's escape clause LITERALLY and ask
  whether the reason offered is the KIND of reason the clause admits. "Not
  done" and "cannot be done" are one word apart and a phase apart.**

- **A tolerance stated in s/500 m is distance-dependent, and every verifying row
  was long.** (c)'s rewritten 1.0 s/500 m band absorbs rounding noise that
  scales as `500/distance`: 0.076-0.14 s/500 m on the five photographed rows
  (3500-6574 m), but **1.0 on a 500 m row and 2.0 on a 250 m row** — the
  keystone shape this phase rows constantly. The criterion had only ever been
  exercised where its own tolerance is loose by 10x, and would go red on
  arithmetic rounding on a short row with nothing wrong. Now bounded to rows of
  1000 m or more, in the criterion itself. **Technique: for any tolerance
  expressed as a RATE, compute it at the smallest member of the population
  before believing the verifying sample.**

- **A derived figure added to a diagnostic string can print an impossible
  number.** The reconciled `how` string printed
  `elapsedSeconds - programmedRestSeconds`, where the subtrahend reduces over
  EVERY interval's `restSeconds` including the final interval's trailing rest,
  which never elapses. On `rests-finished`'s own committed program a dropped
  final split makes the ring print `the true final interval would read -60s`,
  and 161 of 300 seeded workouts carry a final trailing rest, so the figure was
  biased low across the library. The old string said "up to Ns too long"; the
  new one asserted a point value, and its pinning test used the one fixture
  where it landed tidily on 240. **Technique: when a diagnostic gains a DERIVED
  figure, evaluate it on a real committed program rather than the test's
  fixture, and check the sign. Replacing "up to" with an equals sign is a claim
  upgrade that needs the same evidence as any other.**

- **A shipped verdict's ALARM arm had no positive assertion anywhere.**
  `grep -rn 'toContain("DIFFER")' src/` returned exactly one hit — the REST
  oracle's. `recordAvgPaceVerdict`'s false arm was pinned by nothing, and the
  new corpus could not add one because no committed capture disagrees. A
  mutation showing the band CAN bite is not the same as a test saying what the
  alarm says. Now has one, mutation-proved by forcing `agrees = true`.
  **Technique: for every verdict that has two arms, grep for a positive
  assertion on the arm the corpus never exercises. "No capture disagrees" is
  exactly why nobody writes it.**

- **Attacked and NOT broken (Phase RC's exit ground):** the barrier-timeout pin
  (identical divergence sets at 250/500/2000/4000 ms, and both pinned barriers
  are the LAST `tx` in their capture so a timeout cannot cascade — though the
  0x0039/0x003A that drive both oracles arrive AFTER it, seq 844/845 vs tx#839,
  now said in the comment); the walk-2026-08-28 hand-decode, re-derived byte by
  byte from the `ce060021` chunks (three slots, TIME/6000, rest 60/60/0, target 15200) with the two captures' programming frames confirmed byte-identical;
  RC-9(b)'s corpus-expiry claim, censused independently as exactly
  six-of-fourteen with three rest-bearing (`rests-finished` 235,
  `boundaries-terminated` 118, `rest-boundary` 119 workoutState-3 frames — and
  THIS LEDGER'S OWN "four of twelve" from 2026-08-27 is itself now expired,
  which is that entry's own point); the mirror analysis, traced through
  `finalFilledFromSummary` and `restPairComplete` rather than the prose; and
  §27.1's support for the reconciled `driver.ts` comment, quoted verbatim.
  **RC-14's four eliminations all hold, and the build one is provable rather
  than inferential: `git log -S` returns the SAME single commit (c219ee0, #196)
  for both `recordAvgPaceVerdict` and `recordRestDistanceVerdict`, so the seq-69
  `rest-distance-verdict` cannot come apart from the avg-pace half — and the
  walked ring's own `summary-log-stamp` wall clock is 14 minutes after that
  commit's timestamp.** Technique worth keeping: **`git log -S <symbol>` on BOTH
  halves of a "same PR shipped it" argument settles in one line what a ring-line
  argument only makes plausible.**

- **A prospective finding that DEFUSED, worth recording because the defusal is
  the technique.** Exemption (ii) claims a recorded null-index actual is
  "observed in zero committed rings", while the same PR's corpus test asserts
  `smoke-terminated` emits exactly one. Not a contradiction: the walked ring's
  seq 29 reads `record-actual index=null … -> REFUSED (the record returned
unchanged)`. **Technique: a driver-level EMIT is not a stored actual. Before
  reporting a corpus claim as contradicted by a test's event stream, find the
  ring line where the RECORD accepts or refuses it.**

- **And the (i)-verified-empty inference holds, for a reason the ROADMAP never
  stated — now written down so nobody re-derives it.** "Every photographed row
  carries a `plus N m coasting in rest` clause, which an incomplete close CANNOT
  have" is true, via two files: `monitorRun.ts`'s writer refuses RC-1's four
  fields for any `endedBy` other than `"finished"` ("no attempt beats no
  number"), so `storedSummary.ts`'s `buildStoredRest` rung 1 cannot fire; and
  rung 2 is gated on `isReconstructableClose`, which admits only `"finished" ||
null`. The hand-arithmetic table, offered first, does NOT do this work — the
  criterion's own "up to ~26 s/500 m" is an UPPER bound, so a low-rest
  population-(i) row would reconcile too. **Technique: when an exit block offers
  a primary and a "second, independent confirmation", check which one is
  actually load-bearing. Here they were in the wrong order.**

### 2026-08-28 — Codebase integrity audit phase-open anchor

- **“Authority before implementation” was not independent in four rows.** It
  was believed because real server, database, and rendered surfaces are
  stronger than mocks; separating expected authority from the production
  subject and probe medium showed that the audit could otherwise let the
  implementation clear itself.
- **“No shared implementation” was not a sufficient non-circularity test.** It
  was believed because the repository's known failures share helpers;
  constructing separate implementations with the same wrong premise or
  quantity showed that provenance and measured quantity, not symbol sharing,
  settle independence.
- **Lane D's four traces did not cover the connected-monitor path.** They were
  believed complete because they spanned programming through persistence;
  tracing Connect from platform selection through initialization,
  retrieval/picker, connection, and notification subscription found a whole
  pre-program trace with distinct native failure modes.
- **Parallel trace review did not prove interacting-state-machine behavior.**
  The split looked efficient because each investigator owned two end-to-end
  traces; following shared `phase`, `frameSilence`, interval identity,
  `endedBy`, terminate, and persistence fields across trace boundaries showed
  that a required composition matrix was missing.
- **The read-only audit contract could not run its own mutation probes.** “No
  committed mutation” was treated as equivalent to “no mutation”; comparing
  the global write prohibition with the disposable-worktree and negative-fake
  tasks exposed the authorization contradiction. Name an isolated mutation
  owner and prove the intended branch changed.
- **VETTED GROUND:** fixed baseline isolation, browser/native separation, the
  fake's real production-helper circularity, explicit native unknowns, lane
  dependency order, and proportional scout/investigator/validator allocation
  all survived direct baseline checks.

### 2026-08-28 — Codebase integrity audit phase-exit corrections

- **“Every promoted finding has an external condition” was false.** AUD-013's
  only producer was raw SQL, while the supported PM5/route/Drizzle path bounds
  or serializes the extreme value to `null`. Compare a corruption probe's writer
  with every supported producer before treating the probe as product authority.
- **Storage failure semantics are method-specific.** Getter and `setItem`
  failures were generalized to a throwing `removeItem`, but the normative
  algorithm has no throwing branch. Read the exact method algorithm before
  promoting a monkeypatched exception.
- **A reproduced failure does not choose severity without a supported trigger.**
  Dual empty-database startup really fails, but the deployment contract is
  serial/single-replica; comparing the trigger with the severity definition
  moved AUD-012 from P2 to P3.
- **Exact PM5 clearances survived raw-first replay.** Decode boundaries before
  consulting app expectations and state only the quantity/device observed;
  firmware was not recorded, so the clearance does not name it.

### 2026-08-28 — Phase F anchor pass (Wave F, "the app stops losing rows")

- **"The app stayed at `phase=ready` and opened no record" was FALSE, and its
  own cited ring said so.** Believed because the resume line
  (`resume-frames phase=ready`) was read as a session-long state rather than
  an instant. `rowing-active-fallback` has exactly ONE emit site
  (`useMonitorSession.ts:1909`) and it IS the run opening; a later
  `resume-frames phase=live` confirmed it. **Technique: for any log line
  quoted as a STATE, find the single emit site of the NEXT line in the same
  ring and ask what it proves. A diagnostic names an instant, not a duration.**
- **"The pre-row lock loses the rower's metres" was FALSE.** Believed because
  the record opened 43 s late. But the interval actual is the machine's
  0x0037/0x0038 pair verbatim (`parse.ts:653-676` -> `useMonitorSession.ts:2272`),
  so a late open still receives the machine's whole-interval numbers; only the
  1 Hz series trace loses its head. **Technique: before believing a
  late-start defect costs a NUMBER, find where that number is derived. If it
  comes off the wire at a boundary, our clock's start time is irrelevant.**
- **The leading suspect for the destroyed row was two lines nobody had
  listed.** `useMonitorSession.ts:2319-2320` returns on `programDropped`
  whenever `phase` is not `programming`/`ready` — so a machine that discards
  the program mid-row is ignored; on this reading no later boundary arrives
  and the record closes with zero actuals. Its own comment admits the case
  was "left alone rather than guessed at", and the test suite covers only
  the `ended` arm. **Corrected at James's PR #225 review (2026-08-29): the
  ignore is PROVEN; the causal link to the lost row is a HYPOTHESIS — the
  curated ring omits what End stored and cannot prove an absence, which is
  this very entry's own gap-check technique applied back at it.**
  **Technique: when a symptom has a named owner item, still enumerate every
  producer. The owner item was the wrong producer — and the replacement
  producer's causal role gets the same evidence bar the original failed.**
- **A committed walk README carried a false counterfactual.** "The #211 build
  would have caught it and returned him to the workout screen" — it would not;
  `phase` was `live` and `phase: "ready"` is only ever set from an `armed`
  event requiring `verifyArmed` against OUR program. **Technique: a
  counterfactual about a build needs the guard read, not the feature named.
  Follow the event to its handler's first `return`.**
- **An audit's four-item enumeration named the wrong fourth item.**
  `loadTodayOverrides` is guarded (`todayOverrides.ts:211-212`, getter INSIDE
  the try); the real unguarded Today loader is `loadTodayPick`
  (`todayPick.ts:53`). The audit never saw it because `loadRun`
  (`Today.tsx:280`) throws first and masks it. **Technique: when a probe
  reports "all N threw", check whether the FIRST throw could mask the rest —
  and re-derive the set from the code, never from the probe's own count.**
- **"n = 1, the only 0x0039/0x003F ever captured" was stale by five walks.**
  EIGHT unique committed web recordings now carry a complete burst, plus TWO
  production native rings (`walk-2026-08-24/phone-exit7-ring.json` +358 ms;
  `walk-2026-08-28/summary-never-stored-ring.json` +452 ms) — n=10, not the
  n=9 this pass first reported (James's PR #225 review caught the missed
  exit7 ring). Measured positive post-terminal lags: 271-542 ms; two web
  captures deliver the burst BEFORE the terminal observation. `BURST_LINGER_MS`'s
  2000 and its "~1 s terminate lag" both rest on the dead n=1. **Technique:
  a constant's comment claiming a corpus size has an expiry date. Before
  designing on it, re-run the count over `docs/monitor/sessions/**` by
  date — decoding the gzipped captures took one script — and count RINGS as
  well as recordings; the corpus has two shapes.**
- **A durability fix and an ordering fix at the same reader are NOT one
  contract.** The hold fixes WHEN the record is read; AUD-016 fixes WHETHER it
  exists. Holding longer over a rejected write changes nothing. **Technique:
  for any "these two share a seam" claim, write the failing input for each and
  check whether the proposed fix consumes both. Same file is not same failure.**
- **A green gate for the machine-summary fix would be blind to the rejected
  write.** `storage-persist denied` on the tester's own production iPhone makes
  eviction a supported producer, so the fix can pass its gate and still fail
  in the field. **Technique: after fixing an ordering bug, ask what makes the
  now-correctly-ordered write FAIL — the ordering gate never sees it.**
- **VETTED GROUND (attacked this pass and held):** AUD-011's standards
  authority (WHATWG HTML §12.2.3, quoted verbatim) and its three other
  loaders; AUD-015's exact chain (`Countdown.tsx:220` -> `:343` ->
  `Timer.tsx:456-458`); AUD-016's chain and its production-observed producer;
  zero `app/` changes since `fd4d06a`; PR 1 being client-only (a stored-NUMBER
  TRIAD, not a stored-shape one); the deliberateness of
  `LogSession.tsx:1487`'s snapshot and why James's hold ruling sidesteps it;
  the no-backfill claim (`LogPatch` is four keys); door-before-RC-18 via
  `LogSession.tsx:686-701`'s `delete body.deviceName`; the door column's
  SECOND consumer (`storedSummary.ts:606`); migration ground (0016 highest,
  door = 0017); the interval actual's determinism; and AUD-011+AUD-015
  grouping, conditioned on a composed denial-then-Start test and a non-retry
  exit on the Retry surface.
- **Could not establish:** the 0-of-16 prod count (no DB); whether the hold's
  duration survives native BACKGROUNDING (all eight burst recordings are
  `transport=web, app=dev`; both native ring points are foreground); what leg 4
  actually stored; and whether a resume-time deterministic ready signal exists
  (the coast/row-to-begin control does not exist in any capture).
- **Evidence-integrity note for the phase:** `walk-2026-08-28/pocketed-phone-prerow-ring.json`
  has six seq gaps against a contiguous-numbering `record()`, so it is a
  CURATED excerpt, not a capture. The phase's #1 item rests on it.
  `ergomatic:last-session-log` is localStorage and may still hold the full
  ring on the phone. **Technique: check a committed ring's seq numbering for
  gaps before treating an absence in it as evidence.**

### 2026-08-29 — Pre-Wave-D lint/type ratchet pass

- **“109 diagnostics is the typed-lint adoption baseline” was false because
  86 project-service failures omitted most server, E2E, and config files.**
  Full ownership exposed 482 additional server-test diagnostics; scoping
  unsafe-`any` rules away from tests produced the honest candidate: 56
  diagnostics, zero fatals. **Technique: establish project ownership before
  counting rule debt; parser failures are omitted populations, not clean files.**
- **One biting compiler mutation does not prove project membership.** A
  TSConfig could include the mutated E2E file and omit its fourteen siblings.
  **Technique: compare the filesystem census with `tsc --listFilesOnly` by
  exact set equality, then separately mutate a diagnostic. Membership and
  enforcement are different proofs.**
- **A hook regression must execute the real hook and control its preamble.**
  The always-running scripts job lacks Node 26, so an uncontrolled test can
  fail before reaching sequencing; copied control flow can pass while the
  hook remains broken. **Technique: run the actual hook with fake Node and
  recording command boundaries, then assert exit status and invocation order.**
- **A phase exit must own every item in its slate.** Wave D's first exit
  omitted flake disposition, mutation-gate disposition, the REST fixture, and
  the wire-gap witness. **Technique: diff unchecked-item nouns against
  exit-criterion nouns before calling a phase closable.**
- **“Nonzero” does not prove exit-status propagation.** When a wrapper
  promises to return the first failing gate, inject distinct sentinel
  statuses for each dependency and assert the exact numeric result as well as
  later-command absence. A test that normalizes every failure to “nonzero”
  cannot detect wrappers that remap or discard the underlying status.
- **VETTED GROUND:** ESLint's native suppression ledger enforces file/rule
  count ceilings and prune-required improvements; Project Service is the
  correct editor-aligned ownership mechanism; the scoped nine-rule candidate
  is measured over the complete intended population; E2E membership is 16/16;
  the near-zero TypeScript flags and real-hook fail-fast proof are deterministic.
- **“Normal full lint rejects every stale native suppression” is false when
  the entire debt-bearing file leaves the lint population.** ESLint applies
  native suppressions only to returned lint results; a deleted file produces
  no result and therefore no unused-suppression failure. **Technique: test
  ratchets by deleting or ignoring the whole debt-bearing file, not only by
  removing individual diagnostics, and compare ledger keys with the actual
  lint population.**

### 2026-08-29 — Wave F PR 1 spec pass (machine-summary hold, TRIAD: a stored number's meaning)

- **"Menu terminate opens its hold in `endSession`" was FALSE, and it is the arm
  the gate replays.** Believed because `MonitorRun.endedBy` is `"rower"` for both
  a Menu press and the App's End button, so the spec grouped them by the RECORD's
  close reason. They are different HOOK FUNCTIONS: a Menu terminate arrives as a
  wire event (`driver.ts:2724` -> `useMonitorSession.ts:2314` -> `endByMachine(true)`,
  session `endedBy: "machine"`, `held` hardcoded `false` at `:2201`), while End
  runs `endSession`. The spec's own gate recording
  (`walk-2026-08-25/smoke-terminated`, its 542 ms worst case) is a Menu terminate
  — `README.md:15`, "Menu-killed at ~31 s" — and its raw bytes carry NO tx after
  programming, so nobody presses End in it. Under the spec as written the gate is
  red today and would STAY red after the fix. **Technique: when a spec groups two
  cases by a STORED field's value, follow each case's producing EVENT to its own
  handler and compare the two functions. A shared `endedBy` is not a shared code
  path — and check the gate recording for the tx that the arm it claims to
  exercise would have to contain.**
- **A Gate 0 "before" number was read off the live accumulator, not the stored
  row.** The spec rendered 375.1 m / 124.9 s -> 358 m / 120.0 s (a 17.1 m drop).
  The saved row has never shown 375.1: `computeWorkRestSums`
  (`monitorRun.ts:756-783`) sums the 0x0037/0x0038 actuals into
  `workSeconds`/`workMeters`, and `storedSummary.ts:660-681` (tier B1) renders
  those — the ring's own seq 53 says the recorded actuals total **120s/360m**,
  while 375.1/124.9 is seq 40's `accumulator` (work + rest coast; 358 + 15 rest =
  373 = seq 38's `machineTotal`). The real change is 360 m -> 358 m with an
  IDENTICAL clock, plus an unstated third hero (avg split 2:46.7 -> the machine's
  2:47.5, decoded from seq 51 offsets 18-19 `8b 06` = 167.5 s/500m). ROADMAP:763
  already registers "live TOTAL METERS is fused, stored is work-only" as a
  separate defect. **Technique: for any before/after on a SAVED row, find the
  function the ROW's renderer calls and re-derive the before-number from it —
  never from a ring entry that happens to carry a number of the right magnitude.
  A diagnostic entry names the layer that emitted it, and a live accumulator and
  a stored hero are different layers. Then check ALL the heroes, not the two the
  spec mentions.**
- **A backstop anchored at "the ended flip, roughly the terminal observation" is
  false on the arm the app initiates.** `endSession` flips `ended`
  (`useMonitorSession.ts:3219`) BEFORE `await driver.terminate()` (`:3233`), so
  the End arm's clock starts at the button, not the machine. The corpus's only
  app-End capture — `walk-2026-08-28/end-on-interval-1-recording.jsonl.gz`, the
  NEWEST walk, uncited by the spec — measures it: terminate tx t=15155.4, ack
  +106.6, machine terminal +286.3, 0x003F +558.6. So 3.58x, not 3.7x, and the
  terminate round-trip comes off the top exactly the way navigate-and-unmount
  does for `BURST_LINGER_MS`. **Technique (RF16 second corollary, applied): when
  a spec reuses a corpus measured against event X to budget a window anchored at
  event Y, decode one capture and measure X-to-Y. And list the capture directory
  by date first — the newest walk held the only measurement of the arm the spec
  called its worst case.**
- **A "the condition is never owed" guard that can never be true.** The spec
  justified the burst-first ordering costing nothing via
  `run.summaryTotals !== undefined` at the `ended` transition. Both driver arms
  fold the buffered burst AFTER their terminal emit, deliberately and with
  comments saying so (`driver.ts:2702-2711`, `:2751-2760`), because
  `appendSummaryObservations` declines a record whose `completedAt` is still
  `null` (`monitorRun.ts:1095`). So the field is always `undefined` there; the
  condition IS owed and resolves synchronously in the same block. **Technique:
  for a guard keyed on a field another module writes, find that module's WRITE
  ORDER relative to the event the guard runs on. A guard that reads a field
  written one line later is decoration.**
- **A replay gate whose virtual clock stops before its own backstop.**
  `transports/replay.ts:270` advances the clock only at recorded events and
  `advanceClock` is module-local (`ReplayClock` exposes `now`/`schedule` only), so
  a 2000 ms timer armed at the terminal cannot fire on a recording with 544 ms of
  events left. Separately, `openHandoffHold` schedules through
  `MonitorSessionDeps.schedule` (`useMonitorSession.ts:1823`), which
  `burstReplay.test.ts` never binds — so the hold's backstop runs on REAL time in
  that harness. **Technique: before specifying "fires at N ms on the virtual
  clock", check (a) how much recorded time remains after the trigger event and
  (b) which injected scheduler the timer under test actually uses. Two clocks in
  one harness is the default, not the exception.**
- **VETTED GROUND (attacked this pass and held):** the two-condition hold has no
  never-releasing, early-releasing, or double-releasing path; `closeRecord` writes
  `completedAt`/`endedBy` synchronously before every hold-opening site
  (`:1728-1732` before `:2201` and `:3219`), so no opening condition reads a stale
  `runRef`; no path navigates at 2000 ms that today waits 3500 (the split
  condition is owed exactly when the 3000 ms fill matters, and the burst backstop
  only adds); `logRef` survives teardown (assigned once at `:2928`, never nulled)
  so §5's receipts are recordable on every path; End at READY opens no hold
  (`runRef.current === null`); 542 ms re-derived from `smoke-terminated`'s raw
  bytes (seq 288 t=52686.2 -> seq 296 t=53228.6 = 542.4 ms); §7's three
  release-note clauses and the 2026-09-11 clock match `ROADMAP.md:774-790`; the
  leg-5 evidence citations (270 ms, elapsed=120s/distance=358m, `driver.ts:4181`)
  are all accurate.
- **Could not establish:** the 0-of-16 prod count (no DB); native
  background/resume burst timing (still zero captures); the exact tier-B1 avg
  split for the leg-5 row (needs the Gate 0 render); whether
  `end-on-interval-1`'s program transcribes cleanly from its seq 15-19 tx bytes.

### 2026-08-29 — AUD-016 spec delta pass (Wave F chunk 2, verify-at-release)

- **A writer that re-reads storage cannot be rescued by an in-memory carry.**
  The AUD-016 spec proposed carrying a completed run through in memory when
  localStorage rejects writes. `appendSummaryObservations` (`monitorRun.ts:1093`)
  re-reads storage fresh via `stillLive`/`loadMonitorRun` by design, so when the
  writes are denied it finds NOTHING to append to, declines, and the machine's
  own summary never reaches the in-memory run at all — the memory carry preserves
  a record strictly poorer than the storage path it replaces, on the one path the
  spec exists for. Believed because the burst handler assigns `runRef.current =
  appended` and everyone read that line, not the `appended === null` branch four
  lines below it. **Technique: a 20-line probe that denied `setItem` from the
  FIRST write, then RESTORED it before the burst — so the decline could not be
  blamed on the burst's own write.** Printed `stored: NOTHING STORED / appended:
  DECLINED (null) / inMemoryHasSummary: false`. Generalises: for any "carry it in
  memory instead" design, grep every writer downstream of the failure for a fresh
  `load*()` — a re-reading writer is silently coupled to the broken store.
- **A fault-injection stub that engages LATE proves the plumbing and nothing
  else.** The same spec's gate stubbed `localStorage.setItem` "from the
  release-verify onward", leaving create/record-actual/close/append all
  successful — so storage held a COMPLETE record, the verify's failure had no
  consequence, and the leg's own assertion ("the POST carries the measured work
  with NO prior successful storage write") was false by construction. Its sibling
  claim, that a reload lands in a `no-run` miss, was false for the same reason:
  all four `monitorModeRun` gates pass on the stale stored record. **Technique:
  for every injected fault, enumerate the writers that ran BEFORE injection and
  state what storage holds at the moment of the assertion.** The audit's own
  prescription had said it: "rejected writes at OPEN, boundary, retry, and close."
- **React 19 StrictMode invokes a `useState` lazy initializer TWICE and keeps
  the FIRST result.** Demonstrated (`calls = 2, committed = "THE-RUN"`), not
  inferred. So a one-shot module slot consumed inside such an initializer SURVIVES
  — but the discarded second invocation still runs every side effect in that
  initializer, which for `monitorModeRun` means a spurious
  `recordLogDoorMiss("no-run")` written into the very counter the design depends
  on. **Technique: assert against a deliberately impossible expected value
  (`toEqual({calls: -1, ...})`) so vitest's diff PRINTS the real answer** — faster
  and more honest than a console.log the runner may swallow.
- **"Zero production readers" from a grep of the constant.** The PM ledger and
  this spec both said `ergomatic:log-door-misses` had none; `withDoorMisses`
  (`LogSession.tsx:868-874`) reads it in production on every `?from=monitor`
  arrival, and the grep that produced the claim saw that exact line and counted
  it as a test hit. **Technique: for any "nothing reads X" claim, grep the raw KEY
  STRING as well as the constant, and follow every hit to a call site — a
  reader can be one helper away from the writer in the same file.**
- **A receipt written to the store that is failing is decoration (RF21).** §5
  proposed `recordLogDoorMiss("storage-failed-proceed")` as the counter that
  "finally counts its headline case" — it writes via `localStorage.setItem` inside
  a try/catch, so under the denial it exists to count, it records nothing.
  **Technique: for every instrument added to a failure path, ask which subsystem
  it writes through and whether that subsystem is the one that failed.**
- **`storage-persist denied` is not evidence of a rejected write** (RF16 second
  corollary, fourth instance). The string means `navigator.storage.persist()`
  returned falsy — the origin is EVICTABLE — and its own doc comment calls denial
  the expected, tolerated WKWebView outcome. No instrument in this codebase can
  observe a rejected monitor-run write at all (`saveMonitorRun`'s catch records
  nothing), so "production-observed producer" cannot be true of any write
  rejection. Worse, the thing actually observed — eviction — is a producer a
  verifying re-save does NOT cover. **Technique: before accepting a ring entry as
  evidence of failure X, read the CODE that emits that string and ask what
  condition it actually tests.**

### 2026-08-30 — James's #230 review (the slot's three ownership races)

- **"A one-shot slot makes a failed hand-off safe even though teardown keeps
  listening."** Believed because the run was stashed before release and
  teardown separately preserved late bursts. False: the new route consumes the
  immutable object before the old passive cleanup opens its linger, and a
  later fold replaces only the dead owner's `runRef`. **Technique: sequence
  render, passive cleanup, and late producer events explicitly, recording
  object identity at every hand-off; two individually correct lifetimes can
  leave the consumer holding the pre-update object.**

### 2026-08-30 — the hand-off store protocol draft (anchor pass, Wave F / AUD-016 reset)

- **CLAIM: "a closed `MonitorRun` is immutable, so the finish-grace boundary can
  only ever add one actual." FALSE when the close write failed.** `recordActual`'s
  late branch rebuilds the record from `stillLive(startedAt)` (`monitorRun.ts:1019-1021`),
  which matches on `startedAt` ALONE — so when `completeMonitorRun`'s own write was
  rejected, the base is storage's stale LIVE copy and the returned record comes back
  with `completedAt: null`, `endedBy: undefined`, the RC-1 sums gone, and only the
  actuals the last SUCCESSFUL write happened to contain. Measured: 3 in-memory actuals
  → 1, on a real compiled `Filling Low` program. The hook then assigns it to
  `runRef.current` (`useMonitorSession.ts:2732-2734`), so PROCEED stashes an OPEN
  record and `LogSession`'s `completedAt` gate bounces it to the manual door — the
  AUD-016 escape hatch defeated on the path AUD-016 exists for.
  **TECHNIQUE: run the failure ORDERING, not the failure.** Both shipped legs deny
  storage at an endpoint (leg A from the first write, leg B at the release-verify
  only) and both are safe — leg A leaves storage empty so `stillLive` refuses, leg B
  leaves it closed so the base is right. The defect lives strictly BETWEEN them:
  storage that ACCEPTED a write and then stopped. RF24's real question is not "are the
  gates green" but "which test starts upstream of the producer" — and the harness
  already had the primitive (`stubStorageWrites(...).armAfter(n)` is a COUNTDOWN, so
  the denial can be landed on any nth write by count, not by timing).
- **CLAIM: "one write path means the guard's inspect-set and the destroy-set are the
  same set by construction." FALSE — the draft's caller list was three short.**
  Grepping every writer of `MONITOR_RUN_KEY` found EIGHT destroyers, not five:
  `Today.tsx:627`, `WorkoutDetail.tsx:298` and `useStartWorkout.ts:99` are all
  durable-only clears the design never named, and the Start door's own guard
  (`useStartWorkout.ts:118-135`) reads only the durable tier — the exact P1-1 hole
  `connectGuardStage` was patched for, still open at a different door.
  **TECHNIQUE: for any "only X destroys" claim, grep every writer of the KEY, not
  every caller of the named function.** A destroyer that reaches storage through a
  different helper is invisible to a call-graph read of the helper you believe is the
  only one.
- **CLAIM: "`commit` already returned the verdict for the close write, so the second
  serialize goes away." FALSE on every held path.** Up to two durable writes land
  between the close and the release funnel — the finish-grace boundary
  (`monitorRun.ts:1043`) and the burst append (`monitorRun.ts:1297`) — so the close
  verdict is stale by release time and can release green over a durable copy missing
  the final interval. **TECHNIQUE: when a design deletes a re-check, ask what it was
  re-checking AGAINST, then count the writes between the two moments.** The saving is
  real; the reason was not. (Fix: the store caches the durable verdict per key.)
- **CLAIM (invariant wording): "remains recoverable after that consumer acts."
  Unsatisfiable under the ratified contract, and the draft's own §3 gloss and §6.4
  both say so two lines apart.** Words in invariants get implemented.
  **TECHNIQUE: read every invariant against the residual list that follows it — a
  design that names its own accepted loss has already falsified any invariant
  promising that loss cannot happen.**
- **HELD, and worth reusing: `snapshot()` copies its samples array every call
  (`seriesRecorder.ts:426-431`, cap 14_400), so "immutable entry per revision" is a
  memory question, not a style one** — an hour's session at a 30 s flush retains ~120
  distinct arrays if the store keeps history. **TECHNIQUE: for any "entries are
  immutable" design, find the largest field, find whether it is copied or shared, and
  multiply by the write frequency before accepting the word "immutable".**

### 2026-08-30 — the hand-off store protocol rev 3 (delta pass, Wave F / AUD-016 reset)

- **CLAIM: "the single producer loop makes `expectedRevision` one local variable, so
  CAS refusal is a non-event." HELD on interleaving, FALSE on the caller contract.**
  No writer spans a yield — `handleEvent`/`handleFrame` are synchronous
  (`useMonitorSession.ts:2623`, `:2189`) and `endSession` closes the record thirty-nine
  lines before its first `await` (`:3887` vs `:3930`, its own comment: "Close BEFORE
  awaiting anything"). But the design leaves `commit`'s CALLER unnamed while today's
  writer gates persist their own writes and return a bare record (`monitorRun.ts:1043-1044`),
  so a refusal cannot reach the line that assigns `runRef` — recurring failure 25 rebuilt
  inside the fix for it. **TECHNIQUE: for any new write primitive, name its caller and
  then read the CURRENT signature of every function that would call it; a discriminated
  result is only as load-bearing as the return type that can carry it.**
- **CLAIM: "a new key appearing between armed and first pull is left standing, not
  silently destroyed." FALSE — the durable tier is one localStorage key.**
  `saveMonitorRun` writes `MONITOR_RUN_KEY` unconditionally (`monitorRun.ts:501-521`),
  so `createMonitorRun`'s own first write (`:770`) overwrites the standing entry's
  durable half with no retire and no receipt, falsifying invariant 2 ("only `retire`
  destroys"). **TECHNIQUE: when a design introduces multi-KEY entries over an existing
  store, open the writer and count how many records the substrate can hold. A protocol
  cannot be more granular than the key it persists through.**
- **CLAIM: "the cross-key Replace copy is needed." NO PRODUCER FOUND — and it was
  carrying a Gate 0.** Entries are created only by `commit`, only the hook produces,
  and `ConnectAction` always runs `connectGuardStage()` before a session can arm
  (`ConnectAction.tsx:72`), so the guard stages and armed retires any prior key before
  a second one can exist. **TECHNIQUE: before designing for a state, try to build a
  production sequence that reaches it — the enumeration cuts gate rows, residuals AND
  rower-facing copy, which is the most expensive thing an unreachable state can buy.**
- **CLAIM (rule contradiction): §1 "a superseded claimed revision REJECTS where the
  authorization was rower-facing" vs §6 "save-success retires and receipts
  `richer-at-save`."** Both rower-facing, mutually exclusive; under §1 the save-success
  retire refuses and Today renders an unlogged row for a session just logged.
  **TECHNIQUE: for every general rule a spec states, list the specific operations it
  quantifies over and check each — a rule written for one door will be applied at every
  door by whoever implements it.**
- **HELD, and reusable: React cannot schedule an arbitrary driver callback between the
  new tree's render and its mount effect** — only work React itself runs there can
  occupy that window, which is the old subtree's passive cleanup (`teardown`,
  `useMonitorSession.ts:3426`). **TECHNIQUE: before writing a race row into a gate, name
  the PRODUCER that can occupy the window in the harness; a row that cannot be built as
  written gets silently rebuilt one layer down, where it cannot fail (RF24).**
- **PRIMARY, worth not re-researching (WHATWG HTML, Web Storage):** `removeItem` carries
  no throw condition; `setItem` throws `QuotaExceededError`; the `localStorage` getter
  throws `SecurityError` — which fails every access, not one method. A "throwing
  `removeItem`" residual has no supported producer.

### 2026-08-30 — PR #233 review rounds (findings from James's PR review)

- **CLAIM: "a snapshot title plus the linked row's ownership is workout
  identity." FALSE — the two facts can name different workouts.** It was
  believed because adding the join appeared to distinguish global from
  personal rows, but `POST /api/logs` accepts the snapshot and `workoutId`
  independently. **Technique: drive a supported writer → join → consumer test
  in which the snapshot stays constant while the linked entity changes; every
  field in an identity predicate must come from the same authoritative row.**
- **CLAIM: "no swap mark" proved the joined identity was accepted. FALSE —
  the pre-fetch fallback already had no mark.** A negative e2e assertion went
  green before the plan-link response arrived. **Technique: before asserting
  absence on asynchronously enriched UI, wait for a positive readiness witness
  owned by that enrichment (the resolved anchor in this case), then make the
  identity source wrong and confirm the absence assertion turns red.**

## 2026-08-30 — the hand-off store's §10 gate matrix (branch `handoff-store`, HEAD 28196b51)

- **CLAIM (false): "§10 row 2 is substantially covered by the existing burst-linger
  and last-split describe blocks; no dedicated test needed" (task-3-report,
  carried into the consolidated ledger).** Believed because a mutation was run and 17
  tests failed. **Technique that settled it: run the row's OWN named mutation, not a
  neighbour's.** The ledger's mutation disabled `openBurstHold` (the hold never
  engages); the row's named mutation is "gate the post-release commit on a window
  predicate." Running the real one — a `releasedRef` set at both release points,
  checked in `applyProducerCommit` — gave **0 failures / 5638 tests**, and still 0 when
  escalated from `return false` to `throw`. **Probe-bites check, and it is what made
  the finding safe to report: throwing at the RELEASE point instead failed 33 tests
  across 5 files**, proving releases fire everywhere and that not one is followed by a
  producer commit. Corroborating one-liner: `grep -c "MemoryRouter\|useNavigate\|navigate("
  useMonitorSession.test.ts` returns **0**, so the row's navigation axis does not exist
  in the file at all — the 2×2 matrix is a 1×2 with one column driven.
- **Generalised rule: a mutation that fails N tests proves those N tests exist, not that
  the row's invariant is gated.** Read the failing test TITLES against the row's own
  text. Here every named failure belonged to rows 3 and 7 and to the burst-hold
  mechanism. The ledger looked densest exactly where it was emptiest.
- **CLAIM (true but under-read): "the §1 committer discipline holds — a refusal can never
  diverge producer from store."** The spec homed two exceptions and missed a third:
  the create path assigns `runRef.current = run` unconditionally, refused or not.
  **Technique: probe the divergence in the direction that RESTORES the spec.**
  Rewriting the create path to honour §1 produced 0 failures — so neither the shipped
  behaviour nor the spec's text was pinned, and the code comment justifying the
  divergence was an untested assertion. (Both directions now resolved: §1 homes the
  exception and a test pins the shipped direction.)
- **Technique: check the report's SHAs against `git merge-base --is-ancestor` before
  trusting any recorded gate number.** Every SHA in the close-out report was a
  pre-rebase commit and none an ancestor of HEAD; the report's `Tests 5576` was 62
  short of HEAD's `Tests 5638` at an identical 201 files. A rebase the report itself
  listed as "NOT done" had happened by the time it was read.
- **Technique for "receipted" claims: ask WHICH PROCESS the receipt channel was wired
  to.** A row-9 test asserted a `commit-accepted` receipt on a channel installed before
  `vi.resetModules()` — forensic evidence about the pre-reload commit, structurally
  unable to bite on a reload regression. The file disclosed this honestly; §9.5 was
  amended to rule it acceptable; §10 row 9's text was never reconciled and still
  demanded a post-reload receipt nobody built. **A spec amendment that resolves a
  residual must also amend the GATE ROW that tests it, or the matrix keeps asking for
  something the design decided not to build.** (Row 9 now reconciled.)
- **HELD under attack (worth knowing):** row 8 (`handoffStoreReplay.test.ts`) — real
  walk bytes, real hook, payload-inspecting sticky denial, asserted against the
  ATTEMPTED write because a sticky content-keyed denial makes a storage read structurally
  unable to distinguish bug from fix; red-then-green genuinely on the record at commit
  `e84d781f`. Row 12 (`WorkoutDetail.connectedRecovery.test.tsx`) — RF24 hunted and
  not found: no key seeding, no direct `commit`, the POSTed machine numbers traceable
  to `deliverSummary` frames. And the staged-authorization leak has no producer, because
  `ConnectAction.handleConnect` calls `stageRetire` UNCONDITIONALLY on every press,
  staging `[]` when there is nothing to protect.

## Wave E anchor pass (TRIAD), 2026-08-31 — "the Concept2 logbook"

Spec: `docs/superpowers/specs/2026-08-31-concept2-logbook-design.md`.
Verdict REVISE: three kill-shots, five serious findings, fourteen claims held.

**Falsified, and the technique that settled each**

1. **"The OAuth link flow works on the primary surface."** BROKEN. The spec
   specced the WEB redirect flow (302 → C2 → cookie-authed callback) for an
   app whose native half has no cookie at all. Technique: **follow the
   credential, not the route.** `api.ts` attaches a Keychain bearer on native
   and `requireUser` accepts bearer OR cookie — so a top-level navigation
   carries neither, and a `fetch` silently follows the 302 into a JS string
   because `capacitor.config.ts` enables `CapacitorHttp`. The clincher was
   internal precedent, not the spec: **`docs/deploy.md:105-108` step 5 exists
   because steps 1-4 do not serve the native app** — the repo had already paid
   for this lesson with Google and got a native SDK; Concept2 has none.
   Primary: RFC 8252 §8.12 *"native apps MUST NOT use embedded user-agents"*;
   C2's own token-endpoint example redirect is `myiphoneapp://oauth/callback`.
   **Generalised rule: when a spec adds an OAuth provider, grep for how the
   EXISTING provider is wired on native before believing the web arm generalises.**

2. **"`stroke_rate` comes from `machineSummary.summaryDetail.avgStrokeRate`."**
   BROKEN — that path exists on zero stored rows. The writer
   (`LogSession.tsx:1863-1878`) SPREADS `summaryDetail` flat into
   `machineSummary`; there is no nesting key. Technique: **read the WRITER, not
   the column.** The spec cited `schema.ts machineSummary` — the line that
   names the subject. Three independent corroborations at depth one: the schema
   comment's own "the nine fields verbatim", `machineSummary.integration.test.ts`'s
   realistic fixture, and `logs.ts`'s `machineSummary->'avgPaceSecondsPer500m'`
   SQL projection. RF24 shape, and worse: the field is OPTIONAL, so nothing
   ever goes red, and `machineSummary` is 0-of-18 on prod so no send would
   exercise it either.

3. **"The `date` deviation is minutes."** BROKEN — it is hours, and can be a
   calendar day. Technique: **read the sibling fields in the response example,
   not just the field you're mapping.** C2's result object carries `timezone`
   and `date_utc` beside `date`, and **`timezone` is an accepted POST
   parameter** — which proves `date` is LOCAL wall-clock. Our `logged_at` is
   `defaultNow()` server UTC (`schema.ts:148`, and no `loggedAt` appears
   anywhere in `routes/data.ts`), and `grep -rn timezone app/{src,server,domain}`
   proves we store no zone for anyone. An evening Pacific row files with
   Concept2 on the wrong day. The spec's Research record omitted `timezone`
   and eight other POST fields; **enumerating the full POST parameter table
   was what found it.**

4. **"`state` is part of the authorize call."** UNPROVABLE, presented as
   settled. The spec's own PRIMARY research block lists the authorize params as
   client_id/scope/response_type/redirect_uri; the Architecture section two
   pages later appends `&state={csrf}` under the same implied tag. `state`
   appears NOWHERE on C2's page. **RF16 variant worth naming: an INFERENCE
   inherits a PRIMARY tag by proximity when the research record and the design
   section are in the same document.** Technique: diff the parameter list the
   research section transcribed against the URL the architecture section builds.

5. **"Everything runs against log-dev with the key already in `.env`."**
   BROKEN. `.env` holds ONE line (`LOGBOOK_DEV_KEY`, 40 chars — measured with
   `awk` printing only lengths, never the value); C2's token endpoint marks
   `client_secret` **Required: Yes**. One credential cannot satisfy a
   two-credential grant, and `.env` is gitignored so the WORKTREE has none at
   all. Technique: **measure the shape of a secret without reading it**
   (`awk -F= '{print length($2)}'`), then compare against the documented
   credential count.

6. **"`workout_type` is derived."** It is a constant.
   `commands.ts:158` sets `WORKOUTTYPE_VARIABLE_INTERVAL` **unconditionally**
   at index 0 — so the cited line proves the opposite of "derivation", and the
   value describes OUR programming rather than the workout. The machine's own
   `MachineSummaryDetail.workoutType` is already stored and is the field C2's
   `verification_code` requires a match on. The sibling branch (`free row →
   JustRow`) is unreachable: a JustRow opens no run and Phase JR's build has
   not happened.

7. **"Built FROM THE SERVER ROW ONLY, never from client-supplied numbers."**
   False for the one machineSummary-sourced field. `validateMachineSummary`'s
   own comment: *"the nine fields ride along VERBATIM, whatever their shape"*,
   and `logs.ts` says *"an authenticated client can post ANYTHING under this
   key."* **The distinction that matters is VALIDATED vs UNVALIDATED, not
   server-row vs client-body — every column is client-supplied.**

**Attacked and HELD (the wave's vetted ground)**

RC (d)'s verbatim transcription (byte-compared against `phase-rc.md:163`);
no-PKCE → server-broker; refresh rotation; explicit scopes and their
one-way narrowing; no revocation endpoint; `workout` optional so a
summary-level post is valid; per-interval rest genuinely absent from
`LogStep` while present on `IntervalActual`; the tenths conversion at the
doublePrecision boundary (**probed**: sums of tenths carry ~1e-12 against a
0.05 margin — 12x32.7 → 3924 exact; only a true half-tenth breaks it and
the wire cannot produce one); the 409 semantics and leaving the id null;
`weight_class` unavailable from C2's user object (enumerated all 13 fields);
`c2_result_id` as integer (`"id": 339`); RC-1's split genuinely matching C2's
work-only definitions; PR0-before-PR1; RF25 seam ownership.

**Techniques worth keeping**

- **Follow the credential.** For any browser-mediated flow in a Capacitor app,
  ask what carries auth on native. This repo answers it in two files
  (`api.ts`, `auth/middleware.ts`) and the answer is "a bearer, and nothing
  else."
- **Internal precedent outranks external docs for "can we do this here?"**
  `docs/deploy.md`'s Google step 5 settled K1 faster than RFC 8252 did.
- **Read the WRITER for any jsonb path.** A blob column's shape is defined by
  its producer, never by its schema comment; nesting bugs in untyped jsonb are
  invisible to typecheck and to every optional-field test.
- **Enumerate the whole POST parameter table, not the fields you planned to
  send.** `timezone` was not in our design vocabulary, which is exactly why it
  was the finding.
- **Ask what the read-back CANNOT see.** ~~C2's result object returns no
  top-level `stroke_rate`/`rest_time`/`rest_distance`~~ **FALSIFIED LIVE
  at PR0 (2026-08-31, result 85557): the result object returns all
  three** — this pass's enumeration of the response example was itself
  under-read, the exact failure class it was hunting. The TECHNIQUE
  stands (the question found a real limit one door over: `export/` 404s
  entirely on stroke-less rows, "Stroke data not found"); the specific
  claim does not. A doc-derived field list is a hypothesis until a live
  response confirms it.
- **An export of a row you just posted is an ECHO.** It can go red on
  encoding (units, rounding, timezone) and never on meaning. The genuinely
  independent oracle here is ErgData posting the same physical row and
  comparing C2's two records — which is also the dedup experiment.

## Wave F lifecycle spec — full pass (2026-08-31)

Spec: `docs/superpowers/specs/2026-08-31-lifecycle-design.md` (PR #245).
Verdict REVISE: three kill-shots, three overstatements, two claims held.
All findings folded into the spec's same-day revision; James's destination
ruling ("Just go to log") resolved kill-shots 1 and 4 in one move.

**Falsified, and the technique that settled each**

1. **"The row is saved and reachable from the log."** BROKEN — the record had
   ZERO doors. Technique: **enumerate every PRODUCER of the route, not the
   route's existence.** `grep -rn "from=monitor"` returns exactly two
   navigations: `WorkoutDetail.tsx` (which the draft suppressed by design)
   and `Today.tsx`, gated `monitorEntry.run.completedAt === null` — an OPEN
   run only. Closing the record disqualified it from the second door while
   the spec removed the first. The clincher was the repo's own stated
   premise for that exclusion (`Today.tsx`): a completed-but-unlogged
   MonitorRun is ruled out "because 7C's own log path already owns that
   record's state" — the draft deleted the path the premise depends on.
   RF25 with the polarity flipped: the writer succeeds and no reader exists.

2. **"No migration; every consumer is an allowlist keyed on `finished`."**
   BROKEN three ways, all server-side, all invisible to the four consumers
   the draft enumerated. Technique: **grep the union's VALUE STRINGS across
   `server/` and `drizzle/`, not the type name.** `schema.ts:68` is a
   `pgEnum` (so `ALTER TYPE … ADD VALUE` is required); `routes/data.ts:164`
   is a hard validator that 400s an unknown value, and `LogSession.tsx`
   posts the field verbatim; and `logs.ts:40`'s `EndedBy` is a HAND-COPIED
   literal union, not derived from `CloseReason`, so widening the client
   union typechecks clean and fails only at runtime on a phone.
   **Generalised: when a client union is "mirrored" server-side, check
   whether the mirror is a copy or a derivation — a copy makes the compiler
   blind at exactly the seam a stored-shape spec is reasoning about.**

3. **"`openBurstHold()` runs unconditionally."** A NO-OP as designed. Its own
   predicate is an allowlist of TWO (`finished`/`rower`), which the draft
   paraphrased as "keyed on `finished`". Technique: **read the callee's
   predicate for every "reuse unconditionally"** — "unconditionally"
   describes the call site and says nothing about the callee's own gate.

4. **"The exit does not happen until the record is durable."** Structurally
   impossible as scoped. The READY exit is
   `update({ ...INITIAL_STATE, programDropped: true })` → `phase: "idle"` →
   the interstitial renders null and fires `onExit()` on the flag; the
   COULD-NOT-KEEP surface renders only inside `ConnectedSurface`'s ended
   frame on `holdError === "storage-failed"`, unreachable from a full state
   reset. Technique: **trace the state RESET, not the flag.** A spec that
   says "reuse the existing exit" and "hold the existing failure state" is
   asserting two mutually exclusive states when the exit is a reset.

5. **"The machine has left mid-interval, so CSAFE-DEF footnote 12 applies
   verbatim."** The antecedent is false. RC-37's emit site sits inside
   `toMonitorFrame(raw).state === "armed"` — at detection the PM5 is back at
   WaitToBegin holding its unprogrammed default, ≥3 ticks and ≥2000 ms after
   the drop. PRIMARY: `walk-2026-08-28/README.md` ("`frame state=armed
   elapsed=50.81`") and the same walk's leg 3 ("`ws=11` means not `armed`,
   so the detector correctly ignored it"). The CONCLUSION (no split hold)
   survives for a stronger reason — there will never be another boundary —
   but the citation was under-read. Technique: **for any "X is like Y" claim
   about the machine, find the wire state the DETECTOR requires and check it
   against a capture.**

6. **"Recordings and lifecycle events are mutually exclusive BY CONSTRUCTION;
   we can NEVER record wire bytes across an iOS lifecycle event."**
   OVERSTATED, and the repo had already written the honest version.
   `recording.ts:44-59` gives the real cause (the `isNative()` branch plus a
   web `appLifecycle` no-op — NOT `dist-grep.sh`, which proves the
   consequence) and ends "Both ends would have to change first … and neither
   is this task's to decide." RF18 exactly: a documented deferral
   re-researched into an impossibility. Also: the corpus count was stated as
   eight without listing the directory; `find` returns TEN (zero with
   lifecycle events — the zero held). Technique: **before writing
   "impossible", grep for the repo's own comment on the same question** —
   this codebase's deferrals are documented at the seam and are usually one
   sentence more honest than the spec re-deriving them.

7. **"The distance-goal suppression covers every one of the six committed
   captures."** A true quote, three days stale. `continuity.ts` last changed
   2026-08-25; the corpus now holds TEN recordings, and
   `walk-2026-08-28/rest-boundary-recording.jsonl.gz` is described by its
   own README as "TIME-ONLY by design (no distance interval anywhere)" with
   a real rest boundary — a committed, non-suppressed pair source. RF16's
   second corollary, committed inside the section that invokes it by name.
   Technique: **corpus facts expire, and so do the CODE COMMENTS that state
   them — `git log` the file and `find` the corpus before re-filing an item
   on a comment's count.**

**Attacked and HELD (Wave F's vetted ground)**

- §0.3's unrecoverability — three probes, and it strengthened: the SECOND
  teardown key (`sessionStorage["ergomatic:last-monitor-log"]`) is MORE
  perishable, not less; `git show` of the committing revision shows the ring
  was never fuller; and "lossy commit, not lossy instrument" is now PROVEN —
  `eventLog.ts` pushes unconditionally with a monotonic `nextSeq` and only
  tail-slices, so interior seq gaps cannot be produced by the ring. Verified
  seqs `[21,23,24,25,27,28,29,30,32,34,35,37,39]`; the six named gaps exact.
- RC-29's retirement — verified from both cited sources plus the artifact:
  `decideResumeLatch`'s own doc comment names the 9-banner rate as a property
  of the code it replaced; `lock-phone-ring.json` decodes to exactly one
  latch (`gap=39410ms silent=true`) preceded by a genuine `liveness-silence`.
  The spec correctly declines to claim a post-fix rate and ships a counter.
- The `storedSummary.ts` fifth-value quote — byte-compared, verbatim,
  correctly applied.
- RF24 test SHAPE — replaying real frames and synthesising only the trigger
  does start upstream of the producer; `WorkoutDetail.connectedRecovery
  .test.tsx` is the model. The SCOPE failed (see below) and was widened.

**Techniques worth keeping**

- **Enumerate the producers of a ROUTE.** "Reachable from X" is a claim about
  producers; specs state it as a property of the destination. Grep the
  literal route, count the navigations, read each one's render gate.
- **Ask whether a server "mirror" is a copy or a derivation.** For any new
  union member, grep the VALUE STRINGS across `server/` and `drizzle/`.
- **A gate that asserts the buggy behaviour cannot go red on it.** The
  draft's "destination is the workout, not the log" assertion passed on the
  exact defect that stranded the record. When an assertion pins a REMOVAL,
  pair it with an assertion that the removed thing is replaced.

## Phase JR, PR 1 full pass (TRIAD — stored shapes), 2026-08-31, main bb0b66cc

- **"The client renderers absorb `steps: []`."** Half true, and the false half is a
  NUMBER. `SummaryIntervalsBlock` really does self-gate (`PostWorkoutSummary.tsx:335`),
  but `storedSummary.ts:671`'s TIER B1 derives AVG SPLIT from
  `tierBAvgSplitSeconds(row.steps)`, which returns `undefined` on `[]` (`:519`, `d` never
  leaves 0) — while the history list's `heroAvgSplitSeconds` falls through to the stored
  column (`LogRow.tsx:154`). Same row, two screens, one number present and one absent —
  the exact defect RC-5 was built to kill. `LogRow.tsx:129-141` certifies the two agree
  because they "read the identical population by construction"; an empty `steps` is what
  falsifies that premise.
  **Technique: a stored-shape table is a set of SIMULTANEOUS values, and the bug lives in
  the combination, not the row. Take the whole table at once, hand-execute every tier gate
  that reads two or more of its cells, and check that every screen showing a number lands
  in the same tier. A per-row "is this field tolerated?" sweep passes all of them.**

- **"A walked-away row rides Today's existing recovery path and stamps `interrupted`."**
  Unreachable in BOTH branches for a workout-less run. `completeInterruptedRun` has exactly
  one non-test caller (`Today.tsx:778`), inside `handleLogIt`, behind a button gated
  `run.workoutId !== null` (`Today.tsx:810`) — so a null-workout run is discard-only; and a
  run the link-drop path CLOSED renders nothing at all, because the row's gate is
  `completedAt === null` (`Today.tsx:1454`). The code documents the first half itself
  (`Today.tsx:673-677`, "the null-`workoutId` latent"), and the spec cites that same latent
  three sections away while a ruling one section later depends on the path being open.
  **Technique: when a ruling says "no new mechanism, the existing path already does this",
  walk the path BACKWARDS from the function it names to the render condition of the control
  that calls it. The claim is about REACHABILITY, and reachability lives at the button,
  never at the function. A ruling that cites a `file:line` for its mechanism has cited the
  SUBJECT, not the falsifier.**

- **A refusal keyed on "unknown" when it means "absent".** The spec's plan refusal fires on
  `workoutType === null` while the fact it needs is "this was a free row". Those coincide
  only while `resolveWorkoutType`'s `?? "O2"` last resort survives (`LogSession.tsx:475`) —
  and the same spec, in its rationale for choosing null, proposed to retire it. Retiring it
  makes an unmatched phone-timer session post a null type, which the new refusal then
  silently declines to advance the plan for: a 201, and `SESSION n OF 84` does not move.
  **Technique: when a spec justifies a stored value by what it MEANS ("no intensity was
  prescribed"), grep every OTHER producer that could write that value and read the sentence
  aloud for each one. A sentinel's meaning is only true of the producer the author had in
  mind; a second producer turns the same cell into a lie, and any predicate keyed on it
  inherits the lie.**

- **"`buildMonitorLogSteps` returns `[]` on it (vetted, no throw)."** True of a 0-length
  seed/program PAIR — which is what the anchor pass vetted — and false of the shape rev 3
  actually specified, which named `program: { intervals: [] }` and never mentioned
  `logSeed`. `logDraft.ts:836-843` throws on `seed === undefined` before it compares
  lengths.
  **Technique: when a later revision re-cites its own earlier vetted ground, diff the
  WORDING. A vetted claim is scoped to the exact conjunction that was tested; a revision
  that drops one conjunct keeps the "vetted" tag and loses the guarantee. The tell is a
  citation to a prior pass that is SHORTER than what that pass wrote.**

- **An "invisible badge" that is not text at all.** Rev 3 carried the anchor pass's 1.11:1
  contrast finding forward to cover BOTH an unknown string and a null. Recomputed: 1.110:1
  on `--page`, 1.000:1 on `--surface`. But `TypeBadge` renders `{type}`, and React renders
  `null` as NOTHING — so the null case has no text to measure. What remains is a
  `display:inline-block` span with `padding: 3px 7px` and (per `.type-badge`,
  `index.css:509-516`) no background declaration at all: an empty padded gap, i.e. the
  "empty badge" exit criterion 2 explicitly forbids. A contrast assertion would pass it.
  **Technique: before reusing a contrast number as a fallback's justification, ask what the
  MISSING VALUE renders as. `undefined`/`null` as a React child is an absence, not faint
  text; a contrast ratio can only convict the case that still draws glyphs. Two different
  failures need two different assertions, and the structural one (no element in the DOM) is
  the only one that can convict both.**

- **Attacked and NOT broken (Phase JR PR 1's vetted ground):** `steps: []` absorbed as an
  ABSENCE end to end (`buildRows([])` → `SummaryIntervalsBlock`'s `rows.length === 0` gate
  at `PostWorkoutSummary.tsx:335`, which takes the `caption` with it); the migration's
  mechanics (`workout_type` is plain `text` with no index, CHECK or FK —
  `drizzle/0001:36,44,78` — and `DROP NOT NULL` has precedent in `0009`; the repo has no
  `down` migrations at all, so irreversibility is the standing convention, not a new risk);
  `PATCH /api/logs/:id` never revalidating `workoutType`/`steps` (`data.ts:1180-1233`);
  `GET /api/today` never reading a log's type; `postTestOffer` title-gating before anything
  type-shaped (`postTestOffer.ts:52-54`); the delete un-count guard being structurally
  unable to fire on a `planKey === null` row; and `MonitorRun`'s additive-key tolerance,
  which now ALSO survives the hand-off store the rev-3 spec predates (`handoffStore.ts:520`
  persists `JSON.stringify(run)` whole and re-admits via the same unknown-key-tolerant
  `isMonitorRun`). `WorkoutProgram` is literally `{ intervals: ProgramInterval[] }`, so
  `{ intervals: [] }` is complete.
  **Corollary worth keeping: a spec written before a storage refactor lands must have its
  storage claims re-run against the NEW writer, not the one it cited. This one survived;
  the check took two greps and would have been the whole finding if it had not.**

- **Operational, found by `gh pr list` rather than by reading:** TWO open PRs both mint
  drizzle index `0017` (#249 `0017_magical_hobgoblin`, #248 `0017_fair_whizzer`) against a
  journal head of 16, and #248 adds a SIXTH `ended_by` member (`program-dropped`) across
  three hand-copied mirrors. Any spec that freezes an enum enumeration or plans a migration
  index is stale the moment either merges.
  **Technique: on any pass that touches a migration or an enum, run `gh pr list` and
  `gh pr diff <n> --name-only | grep drizzle` FIRST. Two of this repo's named traps
  (competing migration index, three unshared enum mirrors) are only visible from the
  open-PR set, and no amount of reading main can see them.**

## Wave E PR1 — premise pass on the server-broker plan (2026-08-31)

Verdict REVISE. The spec's anchor ground was inherited; only the plan's six
deviations and its fresh factual claims were attacked.

**Falsified**

1. **"A 400 or 401 from C2's token endpoint on refresh = grant dead."**
   C2's own doc assigns 400 to *"one or more of the request parameters is
   missing"* (its example error_description literally says `Check the
   "client_secret" parameter`) and 401 to *"Incorrect login or **client**
   credentials"*. Both documented meanings are OUR bug or OUR config, not the
   user's grant — so the rule destroys links on a code defect or a rotated
   client secret. A reachable producer sat in the same plan: `scope` is
   `Required: Yes` on every token call including refresh, and the plan's
   refresh body never mentioned it. **Technique: for any status-code
   discrimination, read the vendor's own table for what that code MEANS
   before assigning it a meaning — the shape you measured is not the
   semantics you inferred.**
2. **"C2 never emits RFC 6749's `{"error":...}` shape."** The documented
   token-endpoint bodies are exactly `{error, error_description}`
   (`invalid_request`, `invalid_credentials`). The measured
   `{"message":…,"status_code":…}` is the API's generic envelope. **Technique:
   a "never" from one observation dies to the vendor's response examples;
   fetch the page and grep it rather than generalising a probe.**
3. **The refresh-error measurement existed only in the plan file.** `grep`
   for the quoted body across the whole repo: zero hits outside the plan;
   `raw-output.txt` contained no `refresh`, no `401`, no `access_token` — while
   the plan told the implementer to transcribe stubs from "the measured refresh
   probe". **Technique: grep the repo for the literal string a plan says was
   measured. A "MEASURED" tag is a claim about the RECORD, and this repo has
   shipped conversation-only wire facts before.**
4. **"u8 wire band" as the authority for stroke_rate 1..99.** u8 is 0..255,
   and `routes/data.ts` says so verbatim. The band is right; its real
   authority is the house convention `ACTUAL_SPM_MIN`/`PM5_SPM_MAX`.
   **Technique: when a plan justifies a number from "the wire", read the
   decode (`readU8`) — the wire's range is almost never the product's range,
   and the repo usually already has the right precedent.**
5. **"RC-16's 2× anomaly is terminate-only."** `phase-rc.md:1962-1968` records
   RC-16 as *CLOSED UNBUILT — PREMISE FALSIFIED*, 2-of-3 terminates, cause
   *"unknown and deliberately not guessed"*, n=1 on the finished side.
   **Technique: an item cited as support may have been CLOSED as refuted —
   read the item's status line, not its title.**
6. **`commands.ts:386` as evidence for the 0x0039 workout-type ordinal.**
   That line is 0x0031 armed-readback prose. Wrong characteristic, wrong
   layer. **Technique: CLAUDE.md #21's layer corollary applies inside one
   file — a doc comment near the right word can describe a different
   characteristic entirely.**
7. **"Mounted like `stores`" would have killed Branch A.** `data.ts`'s
   `router.use("/api", requireUser)` runs for every `/api/*` that enters the
   root-mounted data router, so an unauthenticated `GET
   /api/concept2/callback` mounted after it 401s. Demonstrated with a minimal
   express reproduction of both orders (401 vs 200). `originCheck` skipping
   GETs is true and is not the gate that bites. **Technique: for a new
   unauthenticated route, find every middleware that runs BEFORE it by mount
   order, and demonstrate the order rather than reasoning about it — the
   in-repo precedent (`createAuthRouter` mounted before the data router) is
   the tell.**

**Heuristic-vs-deterministic (the standing axis)**

The plan's rotation-race guard was a HEURISTIC: it inferred "another request
rotated first" from a value comparison against a row that may not be
committed yet. Named false-negative: the loser re-reads inside the window
between the winner's HTTP 200 and the winner's DB commit, sees equality,
destroys a healthy link. Named false-positive-adjacent: two refreshes that
both SUCCEED never trigger the guard, and Postgres Read Committed applies
the second UPDATE over the first with no error raised (PRIMARY, docs 13.2.1)
— silent last-write-wins. The premise itself was unmeasured: C2's doc is
SILENT on whether rotation invalidates the old refresh token. Deterministic
replacement adopted: `SELECT … FOR UPDATE` on the link row (the machine
tells us) plus a `needs_reauth` flag instead of `deleteLink` (which retires
the guard entirely and preserves the one PII answer). The premise was then
MEASURED (refresh-probe-2026-08-31.md): rotation invalidates the old token
immediately — the race is real, and the serialization is the right fix.

**Consequences found by following a measurement into a design**

The plan moved the legacy-date zone from link-time to upload-time. PR0 had
already measured dedup as datetime-granular to the second — so the same
legacy row re-sent from a different zone renders a different `date` and
lands as a SECOND row on C2 instead of the 409 the spec's RF25 recovery
depends on. PR0's own census says all 6 currently eligible prod rows are
legacy, i.e. 100% of the affected class. Fixed by persist-on-first-use.
**Technique: when a deviation makes a payload field vary per attempt, check
it against every measured idempotency/dedup key in the same evidence
directory.**

**Gates that cannot go red**

Every committed `machineSummary` fixture carries `workoutType: 1`; none
carries 8. The one fixture labelled "a REAL, capture-derived observation set"
is `avgStrokeRate: 44, workoutType: 1` — a TERMINATED row carrying the 2×
anomaly, i.e. an ineligible row. A `{8: "VariableInterval"}` map tested
against the committed corpus maps nothing. Fixed: PR1 transcribed a fresh
finished-row fixture from the ring JSON. **Technique: before trusting an
enum map's test, grep the corpus for the literal value the map's key
expects.**

**Attacked and HELD**

`redirect_kind` dropped (C2 documents `redirect_uri` must match the
authorize call, and Branch A has exactly one env-derived URI captured once
at boot; a mid-hop `SITE_URL` change costs one recoverable attempt). The
upload-time-tz PII reading (exit criterion 3 governs the LINK flow's bodies,
so a mint-body zone would literally be a second attribute). The already-sent
short-circuit contradicts no spec line. `endedBy "rower"` is a real enum
member. Migration index free across every ref. The Google redirect
precedent. The `endedBy`/`deviceName` idioms.

**Techniques worth keeping**

- **Grep the repo for the literal string a plan calls "MEASURED".** Two of
  this plan's three C2 responses lived only in the plan file.
- **Read the vendor's status-code table before assigning a status a meaning.**
- **Demonstrate mount order; do not reason about it.** Twenty lines of
  express settled a 401 that would have shipped as "Branch A doesn't work".
- **Ask what a validator rejecting the whole request costs.** A sanity band
  on one optional field was rejecting the entire workout save — RF25's
  shape, pointed at the product's own north star.
- **Run the validator's own primitives.** `Intl.DateTimeFormat` accepts
  `+05:00`, `utc`, `US/Pacific`, `EST5EDT`; `Date.parse` accepts
  `"March 5, 2020"` and `"2026"`. Both error messages claimed stricter
  contracts than the code enforced.

## Phase JR, PR 2 plan — delta pass (2026-09-01, worktree `just-row-pr2` @ e77dda0f)

Verdict REVISE. Anchor + PR 1 ground inherited; only the shared-hook architecture
ruling, the plan's three read-derived hazards, Task 7's RF24 claim and the AVG
SPLIT oracle were attacked.

- **"`toProgramIndex` returns null for an empty program, so today every frame of a
  free row writes a `divergence` entry."** False, and the falsifier is nine lines
  from the cited line. `driver.ts:2548` is `if (p && intervalActive && intervalIndex
  === null)` — already gated on an armed program — and its own comment says why:
  *"Gated on a program actually being armed: with none, `programLength` is 0 and
  `toProgramIndex` always returns `null` by its own contract — informative about
  nothing."* A free row's `armedProgram()` is null (`:1774`), so the escalation never
  runs. A whole task existed to fix nothing.
  **Technique: when a plan derives a hazard from a pure function's contract, do not
  stop at the function — read the CALL SITE's guard. A contract that returns a
  sentinel is usually already handled by whoever asked for it; the defect, if any,
  lives in the caller's `if`, not the callee's `return`.**

- **"Everything downstream of `ready` is inherited unchanged."** Half true, and the
  false half is the machine-facing half. `phase: "ready"` and the driver's
  `activeRun` are opened by DIFFERENT things — `beginFreeRow()` moves the hook,
  `program()` alone opens `activeRun` — so a free row silently loses three
  subsystems at once: `workoutComplete`/`terminated` never emit
  (`driver.ts:2579` `if (!runIsOpen()) … return`), the machine's own 0x0039 is
  never filed (`:2974-2981`, `if (run === null) … "nothing filed"; return`), and
  auto-split boundaries take the out-of-run branch (`:4438`) — where the hook,
  now holding an open record, files them anyway.
  **Technique: when a plan says "we reach state X by a new door and inherit
  everything downstream", ask what ELSE the OLD door set on the way through.
  Grep the layer below for the field the old door wrote (`activeRun`) and list
  its guards. A phase flip is one variable; a door is a sequence.**

- **"Only the entry door and the log door are new components; the ended surface is
  shared."** True, and that is the defect. `ConnectedSurface.tsx:397`'s ended block
  returns at `:515`, BEFORE `buildSurfaceModel` is called at `:575` — so no
  `SurfaceModel` branch can reach it. It renders `kept =
  measuredIntervalCount(session.actuals)`, and `readingOfIntervalActual`
  (`summaryModel.ts:639`) never reads `index`, so a free row's population is the
  PM5's auto-splits: **"No numbers to keep."** under 5:00 (zero splits) and
  **"2 intervals kept."** over it. The block's own comment (`:405-414`) documents
  the identical defect being fixed once already.
  **Technique: for any screen a new mode inherits, find where the render function
  RETURNS EARLY. A model-shaped fix cannot reach anything above the model's own
  construction, and early-return frames are exactly the ones nobody re-reads.**

- **A hold whose exit condition the new mode cannot produce.** `openBurstHold`
  (`useMonitorSession.ts:2268-2282`) opens on `endedBy: "rower"` +
  `summaryTotals === undefined`; the free row can never obtain `summaryTotals`
  (above), so the only exit is the 2000 ms backstop — two seconds of *"Getting the
  monitor's own numbers."* for a number that is structurally unobtainable.
  **Technique: for every timeout-backed wait a new mode inherits, name the EVENT
  that satisfies it and prove that event can still be produced. A hold whose
  satisfier is unreachable is not a delay, it is a screen making a promise.**

- **A plan can pin a rendered number with no persisted source.** The plan pins
  `Just Row: 6:33 · 1,396 m`, derives `AVG SPLIT = 500 × time ÷ distance`, and tells
  a task to assert all three — while `MonitorRun`'s complete field list
  (`monitorRun.ts:114-183`) carries no cumulative elapsed/distance pair at all
  (`actuals` empty under 5:00, `summaryTotals` unwritable).
  **Technique: read the persisted TYPE's field list end to end before believing any
  plan that renders a number from a stored record. "The frame has it" is not
  "the record has it", and the gap is invisible in every test that seeds the record
  by hand.**
  **Controller's follow-up (2026-09-01), since the pass left it open: `series` is
  the only remaining candidate and it is NOT a sound one as-is. `Sample` carries
  `t`/`d` (`seriesRecorder.ts:219-224`), so the tail LOOKS like the pair — but the
  trace is whole-second-bucketed, capped by `SERIES_SAMPLE_CAP`, and carries its own
  `truncated?: true` (`:237-240`). On a truncated trace the last sample is not the
  row's end, so reading the headline totals off it is wrong precisely on the long
  rows the phase exists to support.**

- **Mirror check.** No mirror in the unit test (independent literals — correct). One
  in the replay test: asserting avg split as `500 × rendered-time ÷ rendered-distance`
  can never go red. The capture carries a real oracle nobody used — 0x0039's own
  average-pace FIELD (140.9 s vs our 140.97), decoded from a different wire field
  than elapsed/distance.
  **Technique (extends RF11's amendment): a same-quantity comparison across two
  DECODES of the same two fields is a transcription check; only a comparison against
  the machine's own DERIVED field is a definition check. Say which one a walk bought
  you before spending it as evidence.**

- **Attacked and NOT broken (PR 2's vetted ground):** the detection-rule equivalence
  (spec `:408-410` vs `useMonitorSession.ts:2356-2359` — same three terms, same
  seam, with an undisclosed 5-frame fallback disjunct that cannot false-trip at
  `workoutState 0`); `phase: "ready"` having exactly one write site (`:2864`); the
  staged-retire hazard exactly as derived (the `armed` handler's retire at
  `:2160-2164` is unreachable, `createMonitorRun-defense` at `:2453-2461` is the sole
  executor, and the same-key adoption branch is what stops it self-tombstoning);
  Today's two recovery gates being the only two; `createMonitorRun`'s unconditional
  `clearRun()` being authorized by `connectGuardStage`; the new-log-door
  justification (`LogSession.tsx:386`, the `workoutId` mismatch return);
  `program-dropped` being unreachable because `armedWatch` only evaluates when
  `armedProgram() !== null` (`driver.ts:4946-4948`); and Task 7 being genuinely
  upstream of the producer — with the caveat that it gates ONE reader while Today's
  own mount snapshot is the other.

## Wave E PR1.5 full pass (TRIAD — AUTH), 2026-09-01, worktree head 303987ab

Target: the revised native-link design — plan
`docs/superpowers/plans/2026-09-01-concept2-pr15-native-link.md`, the rebuilt
gate package `…-pr15-gate.md`, the walk card `…-pr15-walk.md`, and the round-2
implementation. Verdict REVISE: two broken claims, five over-stated ones,
three missing option classes, and the build-fold claim PROVEN by producing
the artifact.

**Falsified, and the technique that settled each**

1. **"The register-before-open contract is satisfied by construction."**
   BROKEN. `useForegroundRefetch.ts:107` depends on `[cb]`, and the only
   consumer that exists (`Concept2LinkProbe.tsx:35`) passes an inline arrow —
   so every render tears down and asynchronously re-adds the native
   `browserFinished` listener, and a dismiss landing in that window is the
   exact miss the fix round exists to close. Technique: **when a comment
   claims a lifecycle property "for free", read the dependency array and then
   read what the ONE real consumer passes into it.** The tests all pass a
   stable `vi.fn()` hoisted outside the render function, so nothing could go
   red — RF21/RF24 in hook form: the gate's fixture is the only shape it can
   fail on.

2. **"Step 7: the counter should read 2."** BROKEN, and determined, not
   probabilistic. Backgrounding and returning restores the presented
   `SFSafariViewController`, so the operator lands on the browser sheet and
   cannot read the counter without dismissing — which fires `browserFinished`.
   The real value is 3. Technique: **walk the operator's VIEW, not just their
   taps — ask what is on screen when the instruction says "read the counter."**
   RF13's class; the card also told him `log-dev.concept2.com` would show an
   error page (it returns HTTP 200) and labelled a fold check as "confirm you
   built with the flag" (it confirms neither the flag nor the phone's build).

3. **"Bounded today by two things only: ALLOWED_EMAILS and the dark flag."**
   Under-stated. Two more real bounds sit in the same file the doc cites:
   one live attempt per user (`routes/concept2.ts:159-161`, its own comment
   says so) and a 15-minute delivery window (`ATTEMPT_MAX_AGE_MS`,
   `routes/concept2.ts:38`, enforced in `consumeAttempt`'s `fresh` column).
   Technique: **for a ruling doc, enumerate the posture from the code, not
   from the threat sentence** — the same read that finds the residual finds
   the bounds, and leaving them out biases the ruling against "accept".

4. **"(b)'s information cost: the email is shown to whoever holds the URL."**
   Over-stated. Minting is `requireUser`-gated (`routes/concept2.ts:139`), so
   the only way a URL exists is that someone holding that user's session made
   it — in the attack scenario the email displayed is the ATTACKER's own, and
   (b) makes the attack self-identifying. Technique: **trace who can CAUSE the
   disclosure, not who can receive it.**

5. **"(c) costs a second tap."** It costs more: (c)'s Confirm button competes
   with the dismissal gesture in the same modal, and dismissal is exactly what
   PR1.5's own return signal keys on and what the walk card trains. Technique:
   **read the mitigation against the OTHER document shipped in the same PR** —
   this collision is invisible from inside either doc alone.

6. **The gate package's option list was missing its cheapest member.** A
   pre-consent interstitial on our own origin (`/api/concept2/start?state=…`
   → identity → 302 to C2) prevents at the consenting principal BEFORE
   anything is written: no pending state, no confirm token, no GC, no stored
   shape, no change to `consumeAttempt`. Also missing: shortening
   `ATTEMPT_MAX_AGE_MS`, and a `UNIQUE` on `concept2_links.c2_user_id` — the
   only option that gives the VICTIM a signal at zero disclosure. Technique:
   **for any "accept / detect / prevent" package, ask separately about
   constraining the TARGET and constraining the WINDOW** — those are option
   classes, not variations, and a principal-shaped list will never contain
   them.

**Attacked and HELD**

`browserFinished` as the right event (verbatim in the installed
`definitions.d.ts:16-17`, corroborated in the plugin's own
`safariViewControllerDidFinish` → `notifyListeners` iOS source); `resume`
alone genuinely missing the modal dismiss (`@capacitor/app`
`definitions.d.ts:217/227` map pause/resume to didEnterBackground/
willEnterForeground, which a modal presentation never raises); §2's credential
fact (attacked via `WKHTTPCookieStore` — no rescue, because there is no
Ergomatic cookie on native to share, `api.ts:14-17`); (c) surviving the
single-use nonce (verified against `routes/concept2.ts:193-196` +
`stores/concept2.ts:181-196` — it mints a new token and confirms after the
exchange, reopening nothing); §3's rebuild around the consenting principal
(there is NO minter-binding fix, because minter == attacker); the build-time
fold; every quote and nine spot-checked `file:line` citations.

**Techniques worth keeping**

- **Build it twice.** RF12's rule, applied to a NEW dev flag: `vite build`
  with and without the exported var, grep six needles over both trees. It
  settled the fold, the red proof, that a shell `export` of a `VITE_`-prefixed
  var reaches a production build, that `ios:build` is the same invocation the
  walk card names, AND the plan's own narrowed lazy-chunk claim — four
  questions, one command run twice.
- **`curl` the URL an operator instruction predicts.** "It will very likely
  show an error page" is a factual claim about a host, and it costs one
  command to check. It was wrong.
- **Read the operator's SCREEN.** RF13's usual form is "the flag doesn't reach
  the code"; this pass found the other form — the flag works, the taps work,
  and the operator physically cannot see the readout at the step that tells
  him to read it.
- **A ruling document is evidence, and under-stating the posture biases the
  ruling.** Both directions count: bounds left out make "accept" look worse,
  and a cost over-stated makes "detect" look worse. Enumerate both halves
  from the code.

**CORRECTION (2026-09-01, fix round 9 scoped re-review — a visible
correction, not a silent rewrite: the entry above is left as this pass
wrote it, since it is a record of what was found and believed AT THE
TIME, and erasing it would just make the same claim easy to re-believe
later).** Two claims in this entry were superseded by the SAME gate
document this pass reviewed, after later rounds read primary sources this
pass did not:
- Finding 6's `"accept / detect / prevent"` phrasing (this entry's own
  words, matching the gate doc's THEN-current taxonomy) was renamed by
  the gate doc's own round 7 to accept / detect / physically-confirm —
  nothing in the package as it stood achieved cryptographic principal
  binding, so "prevent" was the wrong word throughout. **The defect was
  not merely a label, round 10 clarifies: finding 6's own claim that the
  interstitial "prevents ... BEFORE anything is written" was FALSIFIED,
  not just mislabeled — the gate doc's own §3(d) proof shows it is
  BYPASSABLE by the publicly-constructible raw authorize URL, which
  skips the interstitial's origin entirely.** Round 9 then added a
  FOURTH bucket, app-bind (option (g), an authenticated app-return
  exchange) — round 10 found the SAME bypass shape applies to (g) too:
  as round 9 wrote it, (g) did NOT achieve unconditional principal
  binding either, since nothing stops an attacker minting for the WEB
  surface and completing through the existing, unauthenticated https
  callback, never reaching (g)'s own check. (g) needs an added
  precondition (a surface-binding column enforced at both routes) before
  the "first and only option that does" claim holds. **Round 12 found
  round 10's OWN fix insufficient, on the SAME claim: a surface column
  only stops a nonce crossing surfaces — it does nothing about the web
  path used NORMALLY, since `/api/concept2/callback` stays
  unauthenticated regardless of a correct surface tag. An attacker can
  mint a WEB-surface attempt and the victim's ordinary, correctly-
  surfaced consent still links the account under the attacker's id, no
  cross-surface trick required. A surface column is ROUTE INTEGRITY, not
  PRINCIPAL AUTHORITY — round 10 conflated the two, and this correction
  block repeated that conflation. (g) needs BOTH the surface column AND
  a real identity check on BOTH completion routes (native's own new
  exchange route, plus the EXISTING web callback retrofitted with one)
  before it binds anything.**
- "Attacked and HELD... §2's credential fact (attacked via
  `WKHTTPCookieStore` — no rescue, because there is no Ergomatic cookie on
  native to share, `api.ts:14-17`)" HELD for the NATIVE APP's own
  credential specifically (a Keychain bearer, never a cookie) — that part
  is still true today. But the broader shape of the claim, that no
  Ergomatic-issued cookie exists anywhere in this flow, was narrowed by
  the gate doc's own round 5/7: the SERVER does issue a real
  `erg_session` cookie, for WEB sessions (`server/auth/cookies.ts:6,20-29`)
  — only the native app itself never carries one. Neither correction
  changes this pass's verdict (REVISE) or any of its other five findings.

**SECOND CORRECTION (2026-09-01, fix round 15, reviewer finding — this
entry's own finding 3 is itself now further refined, not reversed):**
finding 3's "two more real bounds" (one live attempt per user, the
15-minute window) grew the census from two to four, and every later
round through 14 carried that four-bound framing forward as though all
four held equal weight. A reviewer re-read the same two cited files and
found two of the four weaker than the doc claimed: `ALLOWED_EMAILS`
(`signin.ts:30-42`) gates NEW-account admission only — an
already-admitted account is never re-checked — not a current holder's
standing to act; and "one live attempt per user" is a three-call,
untransacted mint sequence with no `UNIQUE(user_id)`
(`server/routes/concept2.ts:157-167`, `schema.ts:510-519`), raceable
under CONCURRENT mints even though a sequential second mint does replace
the first, as originally claimed. The gate doc's §1 now reads two firm
bounds (the nonce's single-use + 15-minute expiry) plus the dark flag,
and two soft/best-effort factors the acceptance does not lean on.
**Shown this corrected picture, James REAFFIRMED the same ACCEPT
ruling** — the correction narrowed the evidence, not the decision.
Technique, same shape as this entry's own finding 3: **re-read a ruling
doc's cited code against the doc's OWN prose, not just against the
threat sentence** — a census can be under-stated in one direction and
over-stated in another within the same revision, and both are found the
same way.

## 2026-09-01 — Phase JR exit pass (walk record + eight criteria)

- **CLAIM:** "Both endings store the machine's row — Done-ended and Menu-ended
  free rows both landed in the log." **FALSE AS EVIDENCED.** Believed because
  the walk record's provenance table listed an app capture for each piece.
  **TECHNIQUE: open the image.** `piece1-app-log.png` is the log DOOR carrying
  `Couldn't save this session. Try again.` — the failure screen, not a saved
  row. The Done ending's landing is testimony (James's operator report, now
  recorded as such); only the Menu ending has an artifact. Corollary now
  standing: **a provenance table entry names a FILE, not a fact — read the
  file and say what it shows, not what it was taken for.**
- **CLAIM (spec + `totals.ts:8-12`):** "Both supported endings produce the
  machine's 0x0039." **UNGATED INFERENCE.** Believed because the burst path is
  shared with programmed rows and the sentence carries a citation. **TECHNIQUE:
  read the cited capture's own header for which ending it contains.**
  `justRowReplay.test.ts:15-17` says "Menu end"; the e2e fake script attaches no
  `burst`; so no test or capture covers the app-End arm — and the one hardware
  instance (walk piece 1) was performed with its discriminating artifact
  unphotographed. **A citation that proves one arm of an "either way" claim
  proves the claim for that arm only.** Still open after the close-out PR.
- **CLAIM:** "The PM entry is expected LONGER on a Done-ended row (coast-down);
  the observed delta is ≤0.3 s." **NON-OBSERVATION.** Believed because the spec
  said so at design time. **TECHNIQUE: follow the END control into the hook.**
  `useMonitorSession.ts`'s `endSession` awaits `driver.terminate()` and
  `ConnectedSurface.tsx:34` states it in prose — an app End ends the MACHINE's
  workout at the same instant, so a ~0 delta is structural and measures nothing.
  **Before recording a delta as a result, ask what would have made it non-zero.**
- **CLAIM:** "The hold-and-retry path proved itself live — AUD-015/016's
  invariant, observed on prod." **MIS-CITED.** Both findings concern LOCAL
  durability (Countdown's `saveRun`; `saveMonitorRun`); the walk observed a
  SERVER 400 surfaced by `LogSession.tsx:846`, which emits one string for every
  non-ok status and every exception. AUD-015 is still OPEN, so the sentence
  read as field-validation of an unimplemented fix. **TECHNIQUE: grep the
  finding id in ROADMAP and read its checkbox before citing it as discharged.**
  Withdrawn in the walk README and ROADMAP in the close-out PR.
- **CLAIM (`HistoryList.test.tsx:308-311`):** "The mutation the criterion asks
  for is built in… two independently-written literals would let one screen
  drift." **FALSE, and self-refuting.** There WERE two independently-written
  `140.9` literals (`:318` and `:337`) in two different fixture objects, and
  `:324`'s hard `expect(avgSplit).toBe("2:20.9")` failed before the list
  rendered. **TECHNIQUE: when a test comment claims a mutation is built in,
  perform the mutation in your head against BOTH fixtures and name the line
  that goes red first.** Fixed: one stored-row object now feeds both.
- **CLAIM (implicit):** "The exit criteria are discharged because the PRs
  merged." **PARTLY FALSE.** Criterion 5 (`ended_by` on a free row) had no
  assertion of any PRODUCED value: `link-lost` had no free-row test at all,
  `rower` was echoed from a seeded literal, `interrupted` was executed and
  unasserted. **TECHNIQUE for any enum criterion: grep each member's literal and
  classify every hit as SEEDED or PRODUCED.** A member that only ever appears
  as a fixture value is unpinned, however many tests mention it. `rower` and
  `interrupted` now asserted on produced values; `link-lost` on a free row
  remains untested.
- **PROCESS, PROVEN:** main's CI `deploy` job failed on SIX consecutive pushes
  (runs 33513607396 → 33576692923, 13:37Z–00:46Z), including the phase's own
  PR 1, PR 2, the tag's notes PR and the release-capture PR, with
  `deploy: refusing — host checkout is dirty` / exit 3 — and it was found by a
  hardware walk, not by anyone reading main. **TECHNIQUE: `gh run list --branch
  main` before any phase-close or release gate.** The pre-merge PR check being
  green says nothing about the post-merge run. Root cause was RF20's class
  (shell redirects into a checkout) on the PRODUCTION host. Now RF28.
- **HELD under attack, and how:** the version skew (`git diff --name-only
  v0.32.0..d0af9022` → zero `app/server/` and zero `drizzle/` paths, so the
  server was byte-identical to the tag under test); the "recordings are
  impossible on native" claim (`adapters/monitorTransport.ts`'s own header:
  the byte recorder "stays behind its own build-time-foldable gate… reached
  only on the web arm's dev/e2e path"); the deploy.sh root cause (`git status
  --porcelain` lists untracked files, so four empty droppings really do block
  it); criterion 1's integration test (it observes `GET /api/plan`'s `doneN`,
  a quantity that genuinely moves, after its predecessor was caught unable to
  fail); and the 4-hour truncation cap (`SERIES_SAMPLE_CAP = 14_400` at ~1
  sample/s while rowing).

### 2026-09-02 — Phase JR follow-on, "Just Row without the monitor": delta pass (TRIAD, stored field)

- **CLAIM:** "The Just Row timer mints only a `SessionRun` — no synthetic
  `SessionDraft`, since `SessionDraft.type` is required." FALSE as a shippable
  mechanism. `Timer.tsx:456` early-returns `<Navigate to="/today">` when
  `draft === null`, and `:478` reads the on-screen name from `draft.title`, not
  the run's own. A draft-less run cannot render the screen it exists for.
  **Technique:** for any record a screen loads, read the screen's OWN null
  guard and its field reads before believing the record is sufficient — grep
  the component for every `loadX()` in its lazy initializers, not just the one
  the spec names. The spec cited the record it was adding; the falsifying line
  was about the record it wasn't.
- **CLAIM (spec + Gate-0 handoff, twice): "storing `timeSeconds` makes the
  detail's provenance predicate say `TIMER`."** FALSE, and it invalidated an
  approved board. The predicate is `storedSummary.ts:272-276` —
  `row.steps.some((s) => s.actualSource === "stopwatch")` — which never reads
  `timeSeconds`; with `steps: []` it returns `LOGGED BY HAND`, and
  `buildMeta:300` then also suppresses the time-of-day segment, so the approved
  `SEP 2 · 21:57 · TIMER` renders `SEP 2 · LOGGED BY HAND`: three tokens wrong
  out of three. The spec named `summaryModel.ts` instead, whose timer model
  hardcodes `"TIMER"` (`:1177`) and is not what the detail reads.
  **Technique:** grep the STRING the board displays, not the module the spec
  names, and follow the screen's import chain to the function that produces it.
  A board approved on a screen nobody traced is a Gate 0 that approved fiction.
- **CLAIM: "`applyDistanceActual` returns early with no metres, which is why
  the test row read LOGGED BY HAND (`Timer.tsx:575-578`)."** Right conclusion,
  wrong mechanism, wrong lines — repeated verbatim into the design handoff.
  `isDistance = phase.meters !== undefined` (`Timer.tsx:481`) and a `test`
  phase has no `meters` (`domain/expand.ts:149`), so `applyDistanceActual` is
  unreachable on that path; `handleConfirmFinish`'s `else` branch (`:566`)
  records nothing. `575-578` is a doc comment; the early return is `:587`.
  **Technique:** when a spec explains a symptom by a function's early return,
  check the CALLER's guard first — an unreachable early return explains nothing,
  and the real fix site is a different branch. A cited line range landing inside
  a comment is the tell.
- **CLAIM: "loose `isSessionRun`, expand-only"** — reintroduced, on the twin
  record, the exact defect Phase JR PR 1's own review had already fixed:
  `monitorRun.ts:483-489` carries a comment saying declaring `mode?: "justrow"`
  and never checking it let `mode: "corrupt"` load as valid.
  **Technique:** when a spec adds a field to record A "the same word record B
  already uses", open B's validator and its review comments. A sibling record
  that already survived a review of this exact field is a free checklist, and
  RF18's tripwire phrasing applies to code comments that record a FIX, not only
  ones that record a precondition.
- **CLAIM: the posted free-row body.** Omitted `workoutTitle`, required
  non-empty at `data.ts:1369-1372`; every existing free-row body carries it
  (`JustRowLog.tsx:89`, `freeRow.integration.test.ts:89`). **Technique:** don't
  read the validator for the fields the spec lists — diff the spec's body
  against the nearest SHIPPING body for the same endpoint. The missing key is
  never one the spec thought about.
- **CLAIM: the RF27 lifetime table is complete.** It named two clear sites and
  missed six. The live one: `useStartWorkout.ts:149` stages a replace-confirm
  only for a COMPLETED `SessionRun`; a live run is protected solely by the
  started-draft check at `:166`, which a draft-less Just Row does not trip — so
  Start on any workout reaches `confirmReplace()`'s unguarded `clearRun()`
  (`:114`) mid-row. **Technique:** build the lifetime table by grepping
  `clearX|saveX|buildX` across `src/` and forcing a row per hit, rather than by
  enumerating the flows you can picture. Then, for each guard you find, read the
  CONDITION — a guard that exists is not a guard that fires.
- **CLAIM: "`freeRowTotals` widens its `meters` to `number | null`."** The
  function is typed `(run: MonitorRun)` (`totals.ts:35`) and cannot accept the
  new `SessionRun` at all. **Technique:** when a spec proposes widening a
  helper's RETURN type for a new caller, check the PARAMETER type first — a
  helper that cannot accept the new input is the wrong helper, and widening it
  hides that.
- **Brittleness axis (§1b):** the proposed provenance rule ("`steps: []` + no
  `deviceName` ⇒ TIMER") is a HEURISTIC — provenance inferred from an absence.
  Safe today (`MonitorRun.deviceName: string` non-null, `monitorRun.ts:167`;
  one free-row producer in `src/`). False positive named: follow-on item 5's
  plan-visible free row, or any manual free-row door, reads TIMER silently.
  This is verbatim the objection the same spec used to REJECT `workoutId ===
  null` as its mode marker. **Technique:** when a spec rejects marker A for
  being "free today, silent tomorrow", check whether it then adopts marker A's
  logic somewhere downstream. Specs are internally inconsistent about their own
  best arguments. **Controller's disposition:** rev 2 adopted it as a
  closed-world rule with the false positive named; James read that and said
  "Harden it" — rev 3 stores provenance as a nullable `session_logs.source`
  enum written by every door, which is the field `storedSummary.ts:36-66` had
  already queued under Phase LM. The finding stands as written: the fix was
  the column, not a better comment.
- **HELD under attack:** `mode` survives every engine transition (all eight
  spread `...run` — `engine.ts:170/179/192/203/220/229/243/278`; no field-by-
  field reconstruction exists). Connect IS guarded for a live Just Row
  (`connectGuardStage`, `monitorRun.ts:1544-1550`, stages for any `SessionRun`).
  The server accepts `timeSeconds` with `distanceMeters` absent
  (`data.ts:1512-1514`; `freeRow.integration.test.ts:86-106` posts neither and
  gets 201). Exit criterion 2's `.type-badge` pin is class-scoped
  (`e2e/justrow.spec.ts:153`) and a `.free-row-chip` cannot break it; no
  child-count assertion on `.today-log-row` exists in any of the six e2e specs.
  The wall-clock claim is deterministic and correct (`engine.ts:104-110`,
  `Timer.tsx:420-423`).

### 2026-09-02 — Wave E PR1.75 design (full option (g)), anchor-class TRIAD pass

- **CLAIM:** "native fetches are cross-origin with default credentials, so the
  WebView's cookie jar never rides" — used to justify a `400 ambiguous_auth`
  in `requireUser`. **FALSE AS REASONED.** `capacitor.config.ts` enables
  `CapacitorHttp`, so `native-bridge.js:454-475` replaces `window.fetch`:
  POST goes to native `URLSession` (`CapacitorUrlRequest.swift:239-245`), GET
  to a proxy also on `URLSession.shared` (`WebViewAssetHandler.swift:142`).
  Both use `HTTPCookieStorage.shared` with `httpShouldHandleCookies` true;
  `credentials` and origin are never consulted. **TECHNIQUE: when a claim
  names a WEB API's behaviour inside a native shell, read the shell's own
  bridge source for a patch of that API before believing the web semantics.**
  Corollary: the conclusion may still hold while the mechanism is wrong —
  which is worse, because the invariant is then held up by nothing anyone
  wrote down.
- **CLAIM:** the same rule is a safe loud-failure. **FALSE.** The 400 lives in
  `requireUser`, mounted `router.use("/api", requireUser)` at
  `routes/data.ts:826` and on `/api/me` — so an unreachable-state refusal is a
  TOTAL native lockout with no in-app recovery, for zero security gain
  ("bearer wins" is safe: an attacker supplying a bearer is already themselves).
  **TECHNIQUE: for any new refusal added to shared middleware, grep every
  `router.use` of it and price the blast radius before pricing the case.**
- **CLAIM:** "mutation: drop the unique index → the race test shows two rows."
  **CANNOT BITE (RF21).** Proven on real Postgres: without the index the upsert
  raises `there is no unique or exclusion constraint matching the ON CONFLICT
  specification` — every mint dies trivially and the test proves only that the
  index exists. The biting mutation is on the STATEMENT (upsert → delete+insert),
  measured at 2 rows. **TECHNIQUE: for a mutation on a DB constraint, run it —
  a constraint an ON CONFLICT clause NAMES is a syntax dependency, not just a
  behavioural one.**
- **CLAIM (implicit):** `NOT NULL surface` is a safe additive migration.
  **FALSE.** Proven: the rollback image's `createAttempt`
  (`stores/concept2.ts:159-165`) omits the column → `null value in column
  "surface" … violates not-null constraint`; every mint 500s after a rollback.
  **TECHNIQUE: run the PREVIOUS image's exact INSERT against the NEW schema.
  "Additive" is about readers; rollback is about writers.**
- **CLAIM:** the native mechanism is "~60 lines". **INCOMPLETE.**
  `presentationContextProvider` (iOS 13+) is required —
  `ASWebAuthenticationSessionError.presentationContextNotProvided` is a
  documented case — and the design named it zero times, while the plugin
  already in `node_modules` sets it twice. **TECHNIQUE: for a new OS API, read
  its ERROR ENUM, not just its initializer; a dedicated error case is the
  vendor telling you which step is mandatory.**
- **CLAIM:** no existing plugin offers this. **UNDER-CHECKED, conclusion
  survived.** `@capgo/capacitor-social-login@8.4.4` — already a dependency —
  exposes `provider:'oauth2'` on `ASWebAuthenticationSession`, but its
  `OAuth2LoginResponse` has no `code` field and it exchanges in-app with PKCE
  on. **TECHNIQUE: run the does-it-exist question against `package.json`
  FIRST, not just against npm; the design evaluated an uninstalled package and
  missed the installed one.**
- **CORPUS FACT WITH AN EXPIRY DATE, again:** "migration 0019" was free when
  the number was chosen and taken by the time it was written
  (`drizzle/0019_happy_virginia_dare.sql`, Phase JR, on main). **TECHNIQUE:
  `ls` the migration directory in the same pass that writes the index.**
- **TRIPWIRE STEPPED OVER, third instance:** the `dist:grep` bullet reinstated
  the exact "the native module folds out" overclaim that
  `adapters/externalBrowser.ts:4-23` retracts in its own header, in the file
  the bullet is about. **TECHNIQUE: before writing a claim about a module,
  read that module's own header comment — this repo's retractions live there.**
- **HELD, and worth recording as ground:** C2's token endpoint requires
  `client_secret` (PRIMARY, their parameter table) and documents no PKCE, so an
  intercepted code is unredeemable without our server or the victim's bearer;
  `SameSite=Lax` IS sent on a cross-site top-level GET redirect
  (rfc6265bis §5.8.3's four conditions, all satisfied); the upsert serializes
  concurrent mints to exactly one row (PROVEN); and posting the mint's own
  `state` genuinely dissolves the native echo dependency — which matters more
  than the design knew, since Concept2 documents `state` NOWHERE.
- **NEW GENERAL RULE FROM THIS PASS:** an interception INFERENCE should be
  attacked in three legs, not one — can the holder REDEEM it (no), can they
  DENY it to the victim (yes, here: consume preceded the identity check on
  both routes), and does the design NAME the second. Unredeemable is not
  harmless. Rev 2 moved identity/surface checks BEFORE consume on both routes.

### 2026-09-02 — Wave E PR1.75 design REV 2, second pass (attacker/concurrency/platform lenses)

- **CLAIM (PRIMARY-tagged, load-bearing):** an intercepted code "cannot be
  redeemed — our `/exchange` needs the victim's bearer." **FALSE.** It needs
  *an* Ergomatic bearer; the attacker uses their OWN. Presenting the victim's
  code with the attacker's own attempt `state` and own bearer passes every
  check in the design's §6 and links the victim's Concept2 grant
  (`results:write`) to the attacker's account — RFC 9700 §4.5 authorization
  code injection, verbatim. The identity check binds the ATTEMPT to the
  presenter; nothing binds the CODE to the attempt, and §2.1.1's mandated
  mitigations (PKCE, OIDC `nonce`) are both unavailable at Concept2.
  **TECHNIQUE: for every "the attacker cannot use X" claim, ask who the
  attacker is in the sentence — a control naming the VICTIM's credential is
  not a control, because the attacker supplies their own.** Corollary: the
  three-legs rule from pass 1 was itself under-enumerated — the third leg is
  "redeem it INTO THEIR OWN ACCOUNT", which is neither deny nor
  redeem-as-the-victim.
- **CLAIM (implicit):** the post-consume re-verify of `user_id`/`surface`
  guards the peek→consume race. **CANNOT GO RED (RF21, caught in the DESIGN).**
  Census of every writer: the mint upsert's `DO UPDATE SET nonce =
  excluded.nonce` always rewrites the nonce, so for a FIXED nonce
  `(user_id, surface)` are immutable for the row's lifetime — a concurrent
  re-mint makes the row vanish (consume → null → 400) rather than change.
  **TECHNIQUE: to test whether a TOCTOU re-check can ever fire, enumerate the
  writers and ask which one mutates the checked columns WITHOUT changing the
  key you re-read by. If none does, the re-check is theater — replace the
  two-step with a conditional `DELETE … WHERE key AND predicate RETURNING`,
  which makes the check unseparable from the consume by construction.**
- **CLAIM:** the device walk's step (a) is executable. **FALSE — no host
  exists.** It needs a server with log-dev creds and `C2_LINK_ENABLED=1` that
  the phone can reach; `ios:build` defaults to prod (`package.json:29`), and
  the `ERGOMATIC_API_BASE` override to a LAN `http://` is blocked by ATS —
  `Info.plist` carries NO `NSAppTransportSecurity` key and `CapacitorHttp` puts
  every request on native `URLSession`. **TECHNIQUE (RF13): follow a walk step
  to the TRANSPORT, not just to the feature. "Point the build at your dev
  server" is a claim about ATS, and the plist settles it in one grep.**
- **CLAIM:** the vendor API needs `presentationContextProvider` (pass 1's
  finding). **INCOMPLETE — there is a THIRD error case.** The SDK header
  carries `ASWebAuthenticationSessionErrorCodePresentationContextInvalid = 3`:
  *"For iOS, validate that the UIWindow is in a foreground scene."*
  `TARGETED_DEVICE_FAMILY = "1,2"` makes multi-scene real. **TECHNIQUE: read
  the SDK HEADER, not the doc site — `xcrun --sdk iphoneos --show-sdk-path`
  gives verbatim availability annotations, deprecation sentinels, property
  ownership (`presentationContextProvider` is `weak`) and the full error enum,
  and it answered five questions the documentation site could not be fetched
  for at all.**
- **CLAIM:** "the `callbackURLScheme` initializer is deprecated at iOS 27."
  **FALSE — an invented version.** The header says
  `API_DEPRECATED(..., ios(12.0, API_TO_BE_DEPRECATED), ...)`, Apple's
  "unspecified future release" sentinel. RF16's shape: a sourced-sounding
  specific inside an otherwise correct, genuinely-sourced paragraph.
- **CLAIM (SECONDARY, forum thread 679251):** Info.plist `CFBundleURLTypes` is
  not required. **TRUE, and a PRIMARY source existed all along** — the SDK
  header: *"it needs to either register the custom URL scheme in its
  Info.plist, or set the scheme to callbackURLScheme argument in the
  initializer."* **TECHNIQUE: before settling for a forum post, check whether
  the framework HEADER states the same fact — a SECONDARY tag on a
  PRIMARY-available claim understates evidence we already have on disk.**
- **CLAIM:** the design's rollback analysis is complete after the `NOT NULL`
  fix. **INCOMPLETE.** Pass 1's own technique (run the previous image's writers
  against the new schema) has a second hit nobody followed: the surviving
  `UNIQUE(user_id)` turns the rollback image's concurrent double-mint into a
  500. Acceptable, but unnamed. **TECHNIQUE: apply a rollback technique to
  EVERY object the migration adds, not just the one that produced the first
  finding — a fix round tends to stop at the first hit.**
- **HELD under attack, and worth recording as ground:** CSRF on the web
  callback is closed in BOTH directions by the identity check; open redirect
  and reflected XSS are closed by construction (no `res.redirect`, `page()`
  interpolates only literals); mix-up is N/A for a stated reason (one AS, a
  boot-time constant endpoint, no AS identifier read from the response);
  the empty-cookie rule is already true for auth today (`getCookie` → `""` →
  falsy → 401) and is load-bearing only for the NEW `authVia` derivation; the
  400/403 ladder discloses only what a state-holder knows, bounded by a
  256-bit nonce; and the mixed-version window is closed because NOTHING in
  `src/` posts to `/api/concept2/connect` — the whole link plumbing's only
  consumer is a dev-flag-gated probe that posts nothing.
- **NEW GENERAL RULE:** **a residual an identity check cannot close must be
  closed by COPY, and that makes it a Gate 0 item, not a footnote.** The
  shared-browser fixation case (victim consents at the AS while the browser
  holds the ATTACKER's session) passes every server-side check correctly,
  because the Ergomatic principal genuinely IS the attacker. The only
  mitigation is rendering BOTH identities on the success page — which means
  the security finding lands in the design's copy section. Look for this
  whenever a control answers "who is our principal" against a threat whose
  premise is that our principal is wrong.
- **Controller's addendum — the desk pre-check the pass asked for was run and
  is INCONCLUSIVE at the unauthenticated layer:** log-dev answers `302 →
  /login` for the registered native scheme AND for a bogus unregistered one
  (curl, 2026-09-02), so `redirect_uri` validation happens after login. A
  probe that returns the same answer for the registered and the bogus scheme
  has not measured anything; the check moved to a logged-in browser with the
  bogus scheme kept as the red control. **TECHNIQUE: every pre-check carries
  its own red control, run in the same breath — a green without a red is a
  guess.**
- **Process, recorded:** an agent COMMITTED design rev 3 (`0c2063ce`) to the
  worktree branch despite the read-only brief. Content was reviewed and kept;
  the breach stands as the reason "agents propose, the controller lands" is in
  CLAUDE.md and not only in the dispatch text.

## 2026-09-02 — Wave F PR 3 §4 freeze-predicate design: the fix that ignored its own capture

- **Claim (plan §4 Design, first draft):** "a pause may not be declared until
  at least one frame has ADVANCED distance since the resume edge" suppresses
  the resume-stall false positive; I1/I2 "HOLD." Believed because Reading 2
  showed distance advancing throughout the false pause, so "advance = fresh
  stream" looked like the discriminator.
- **FALSE. The mechanism is inert for Reading 2, the capture it was designed
  from.** Technique: trace the founding capture's literal frame numbers
  against the proposed latch instead of reasoning abstractly. `pause-declared
  frames=4 d=115.3` (seq 33) means 4 identical frames at 115.3; the resume
  frame is 110.8 (seq 29). The latch clears on "first frame > 110.8" — which
  is the FIRST 115.3 frame, three frames before the pause. The stall value is
  itself an advance over the resume frame, so any "advanced since resume"
  test clears exactly when it must hold. Both candidate shapes the plan
  floated break identically, because there is one distinct post-resume value
  appearing four times.
- **Root lesson: when a discriminator keys on a monotonic quantity
  (distance), confirm the failure case isn't monotonic too.** A re-emission
  stall and a genuine row-then-stop are both "advance then freeze" in
  distance; distance cannot separate them. The deterministic axis is frame
  ARRIVAL TIMING — which the spec (§4) originally named and the plan's design
  silently dropped. Brittleness axis: a HEURISTIC (infer "fresh stream" from
  a distance advance) presented as deterministic; the machine never told us
  "this frame is a re-emission."
- **Second catch (I1 overstated):** the design marked I1 "HOLDS" analysing
  only resume→row→stop. Resume→already-stopped never advances, so the latch
  never clears and a genuine pause is suppressed forever; every foreground
  edge re-arms it (a second resume suppresses a real stop); the
  absolute-distance reference goes stale across a no-rest interval boundary
  where `distanceMeters` resets to 0. Technique: enumerate producers of "no
  advance after a resume edge" — the design imagined one and missed three.
- **RF21 trap:** the named suppression-mutation can only go red by
  constructing a stall with no post-resume advance — which is a genuine stop,
  so its green state encodes the fix suppressing a real pause. A mutation
  whose green means "the bug is present" is decoration; the tell that the
  mechanism, not the test, is wrong.
- **VETTED GROUND that held:** the defect's location and cause (post-resume
  repeat-stall on a fresh value; `stale`'s pre-vs-post window genuinely can't
  gate it) is correct; I3 (pure predicate, stateful suppression) is
  satisfiable. Only the discriminator was broken. **Ruled (James, option 1):
  instrument arrival timing first, then design.**

## 2026-09-02 — Wave F PR 3 §3 timing addendum (PR #267), pre-review pass 1

- **Claim: "corpus regression over every committed recording asserting
  identical `pause-declared` count and positions."** FALSE — no suite asserts
  `pause-declared` at all. Technique: **grep the asserted STRING across
  `app/src`, not the suite names.** `grep -rn "pause-declared" app/src`
  returned one file; three corpus replay suites exist and none touch it. A
  "regression over the corpus" claim is settled by grepping for the thing it
  says it pins.
- **Claim: "the corpus replay harness calls the predicate directly and is
  structurally unable to see this change."** Half true, and the false half
  was the stronger evidence: `lifecycleReplay.test.ts` drives the REAL hook
  over a committed recording with a real lifecycle transition and reads the
  ring — it can see the change and stayed green. **When a PR argues a gate is
  blind, check whether a DIFFERENT gate is sighted.**
- **Claim: a mirrored reset keeps two structures "in lockstep."** Real and
  correct, but UNFALSIFIABLE: removing it left 165 client files / 4385 tests
  green. **Mutate the defensive branch, not only the asserted one.** The
  actual guarantee was a numeric relation nobody had written down —
  `PULL_EVIDENCE_FRAMES` (5) > `PAUSED_FRAME_HOLD` (4) forces ≥7 window
  appends before any declaration. A comment crediting the wrong mechanism
  survives every test.
- **Merge mechanics are a finding class, not a chore.** `gh pr view --json
  mergeable,mergeStateStatus` said CONFLICTING/DIRTY and the head had ZERO
  check-runs while the body reported gate results as final. **Run both as the
  first step of any pre-merge pass.** `git merge-tree --write-tree
  origin/main <head>` names the conflicting file before the reviewer does.
- **Attacked and HELD:** predicate byte-identity (hashed the
  `freezeKey`→`NO_FREEZE` region on both revs); `gapsMs` always the declaring
  run's own four frames (proven from the two constants); edge-only; injected
  clock throughout; counts and coverage reproduced to the digit; all three
  named mutations reproduced red.

## 2026-09-02 — Wave F PR 3 §3 timing addendum (PR #267), pre-review pass 2

- **The fix wave introduced no defect; every finding was the fix wave's own
  reconciliation debt.** Nothing in the code broke under attack (predicate
  byte-identity re-proved by hunk positions; `gapsMs`'s three-entry
  guarantee attacked through four independent clear sites and held; the M3
  `frames=<n>` count correct at all four window depths).
- **Claim: pass 1's M2 "lockstep" comment was fixed.** HALF FIXED. The
  append-site comment was rewritten to credit the append count; the ref's
  OWN doc comment 1,230 lines earlier still credited the mirrored reset
  ("no other reset is needed to keep the two in lockstep"). Technique:
  **after a comment fix, grep the ref's IDENTIFIER, not the fixed phrase** —
  a mechanism is usually described twice, once where it is argued and once
  where it is declared, and a fix lands on one.
- **Claim: pass 1's B3 removed the false "corpus regression" claim from the
  plan.** HALF FIXED, in the SAME FILE: the Gates paragraph was corrected
  and the INVARIANTS section's I1 kept the identical parenthetical.
  Technique: **when withdrawing a claim, grep the phrase inside the file you
  just edited before grepping the tree** — invariant/requirement sections
  restate gates in the future tense and read as forward-looking, so a
  phrase-sweep aimed at "claims" skips them.
- **A comment's replacement attribution deserves the same attack as the one
  it replaced.** The new "REAL GUARANTEE is `PULL_EVIDENCE_FRAMES (5) >
  PAUSED_FRAME_HOLD (4)`" is true but not load-bearing — set PULL=3 and the
  guarantee still holds on locality alone (every frame that increments
  `freeze.frames` appends in the same straight-line block; the window cap IS
  the hold). Technique: **falsify a numeric attribution by changing the
  numbers on paper** — if the conclusion survives the constants moving, the
  constants are not the reason.
- **Cheap census that found three items at once:** `gh pr diff --name-only`
  against the PR body (ROADMAP.md unaccounted for), leg count in the test
  file against the plan's "four new legs" (five), and named mutations
  against new record sites (four vs five). All three are counts, all three
  are one command each, and all three were review rounds waiting to happen.

## 2026-09-02 — Wave F PR 3 §3 timing addendum (PR #267), pre-review pass 3

- **No defect in the code, third pass running: the structural guarantee the
  fix wave substituted for the old numeric one is TRUE and deterministic.**
  `pulled` cannot flip mid-run because `nextRowingStreak` returns
  `{frames: 1}` for any rowing frame that does not STRICTLY beat the previous
  distance, and every frame of a freeze run shares `freezeKey`'s distance —
  so the `pulled` disjunct can only be satisfied on the run's FIRST frame.
  Technique: **attack a claim about a derived flag by reading the SIBLING
  pure function it delegates to** (`nextRowingStreak`), not the function that
  states the claim (`nextFreezeRun`) — the reset-to-one rule that settles it
  lives entirely in the callee.
- **A WITHDRAWAL CAN OVER-WITHDRAW, and the over-withdrawal reads as a
  contradiction with production source.** Pass 1 correctly killed "corpus
  regression asserting `pause-declared` count and positions" (no suite
  asserts that string). The corrected plan then said such a regression is
  "TO BE BUILT" — while `useMonitorSession.test.ts:8329` already replays
  ALL NINE committed recordings through the pure predicate and pins pause
  ONSET FRAMES (`expect(onsets).toStrictEqual(...)`), which is what the
  hook's own comment at `:3143` means by "corpus regression over all nine
  committed recordings". Technique, the mirror of pass 2's: **after
  withdrawing a claim, grep the withdrawn phrase for a TRUE instance, not
  only for un-fixed copies** — if production source still asserts it and is
  right, the correction is what needs the qualifier ("that STRING", not
  "that regression").
- **Re-run a comment's own claimed mutation to check its NUMBER, not just
  its conclusion.** `useMonitorSession.ts:3128` credited "169 client test
  files / 4410 tests green" with the defensive reset deleted. Re-running the
  same mutation at head reproduced the conclusion (still fully green) and
  falsified the count: 169 files / **4411** tests — the figure predated the
  fifth leg added two commits later. A stale count in a production comment
  is the cheapest possible review round, and only re-running finds it.
- **Attacked and HELD:** the 7-append lower bound (traced from the ready→live
  seed, which is never appended); five clear sites enumerated by grep rather
  than read from the comment; `lastResumeAtMsRef` armed at EVERY foreground
  edge (only `event !== "foreground"` returns before the write);
  `postResumeArrivalsRef`'s "every later frame appends" (no `return` between
  `handleFrame`'s entry and the append); predicate byte-identity by hunk
  position; the `nowDate` dep-array addition is identity-safe
  (`useCallback(..., [])`); no consumer of either ring kind exists outside
  the hook and its test.

## 2026-09-02 — Wave F PR 3 §3 timing addendum (PR #267), pre-review pass 4

- **Fourth pass, first pass with no code finding at all — and the one
  remaining defect was a body that contradicted ITSELF.** The PR's top fold
  said `resume-first-frame` "records the first four post-resume GAPS"; its
  own Record block, five lines down, said "the first four post-resume
  ARRIVALS". `PAUSED_FRAME_HOLD = 4` arrivals yield THREE gaps
  (`useMonitorSession.ts:2720`, and the leg asserts `nextGapsMs=[70,70,70]`
  literally at `useMonitorSession.test.ts:12596`). Technique, cheaper than
  reading either half: **grep the PR body for the SAME noun phrase twice**
  (`gh pr view --json body -q .body | grep -o "four post-resume [a-z]*"`
  returned `gaps` and `arrivals`) — a body that states one fact in the fold
  and again in the Record can disagree with itself, and the fold is the half
  James reads.
- **A count-vs-collection off-by-one hides behind a constant's name.** Seven
  places state this fact; five say frames/arrivals and two say gaps, and the
  two are the ones that wrote `HOLD` instead of `HOLD-1`. **When a window of
  N samples produces N-1 intervals, grep the constant's name and check every
  sentence that uses it for which of the two it means** — the plan's own
  lifetime-table row got it wrong in the parenthetical and right in the clear
  column, in a single line.
- **Attacked and HELD (the vetted ground is now closed):** the corrected I1
  paragraph (`:8395`'s `toStrictEqual` over all nine files, and `:3143` is
  genuinely the comment it names); every body number reproduced rather than
  cited — 15 commits, 5 files, 223/6090|1, e2e 8m6s from check-run
  timestamps, and the production comment's 169/4411 reproduced exactly by
  re-running the client suite; the append/record ordering (no `return`
  between `:3137` and `:3156`) and guard identity (`:1340` == `:3131`)
  proving `gapsMs` is the declaring run's own frames; all five
  `lastResumeAtMsRef` clear sites named by enclosing function; ring capacity
  500 vs one added entry per resume; the ROADMAP register row's
  `ConnectedSurface.tsx:848` citation; `merge-tree` clean and a CI run
  present at head.

- **2026-09-02, PR #267 pass 5 (closure):** BLANK on code and on the
  gaps/arrivals sweep; the only residue was a Record block that said "two
  internal passes" above a narration of five, and a "Pass 5 verdict below"
  pointing at nothing. Technique: **a PR body's own bolded lead-in is a
  figure like any other — grep the noun it counts against the items it then
  lists** (`grep -c "^Pass [0-9]"` vs the word before "internal passes"), the
  same sweep RF27's pre-ready checklist item 3 asks for and the same class
  pass 4 caught one round earlier in a different sentence. Second: **a
  `pull_request` CI event never skips the code jobs** — `ci.yml:31` feeds
  `ci-changes.sh` the PR BASE sha, so it diffs the whole range; "docs-only
  push, expect a skip" is only true of a bare `push` event, and expecting a
  skip will make a reviewer read a legitimately-running gate as stuck.

### 2026-09-02 — Just Row substitution spec (TRIAD anchor)

- **"Enforced at the store" was enforced at the route.** The spec moved a
  free row's `advancesPlan` DEFAULT to `data.ts` while claiming the store
  kept the check. Caught by reading `LogInput`'s type: `advancesPlan:
  boolean` (required) makes `=== true` identical to the bare flag, so the
  store's "rule" was a no-op. **Technique: for any "the server checks it"
  claim, read the INPUT TYPE — an already-defaulted field cannot carry a
  default, and the layer that defaults is the layer that enforces.**
- **A door "already posts the flag" posted only one arm of it.**
  `useLogForm` writes `advancesPlan` ONLY when false (`LogSession.tsx:720`);
  `true` has never crossed the wire, by design and by comment. **Technique:
  for "the client already sends X", grep the SETTER, not the option — the
  call site passing `{x: true}` proves nothing about the body builder.**
- **A "renders wrong / no mark" premise was half true.** `swapMark`'s
  checkpoint branch already marks a free row (null identity pair falls back
  to the snapshot title, which differs). **Technique: trace BOTH branches of
  a two-branch predicate for the new input; a spec that says "it returns
  undefined" usually traced the branch it was thinking about.**
- **A design board asserted a string the app cannot produce.**
  `INSTEAD OF 2K TEST` vs shipped `INSTEAD OF 2K Test` — the mark returns
  `ref.title` uncased and the class has no `text-transform`. **Technique: a
  board claiming "exactly as it reads today" is a testable claim; grep the
  existing test that pins the live string before believing it.**
- **"What does NOT change" is where the number change hides.** Making a free
  row linkable silently enabled the plan footer on the log detail, the
  un-tick delete copy, and `done_n` DECREMENT on deleting a Just Row —
  none in scope. **Technique: for any spec that makes a row newly eligible
  for an existing field, grep every READER of that field and diff the
  behaviour, including the DELETE path.** (Disposition: all three adopted
  as intended behaviour in rev 2, the decrement stated as a ruling for
  James to overrule at Gate 0.)

### 2026-09-02 — Just Row substitution spec REV 2 (second pass: attack the fixes)

- **A "within 1 px" layout assertion placed in a jsdom test.** Rev 2's
  centring fix arrived with a gate that measures `getBoundingClientRect()`
  in `Plan.test.tsx`. Ran jsdom directly: every rect is
  `{w:0,h:0,top:0,left:0}`, so `|0−0| ≤ 1` passes against any layout.
  **Technique: before believing a geometry gate, count the file's existing
  geometry assertions — `Plan.test.tsx` had 0, `design.spec.ts` had 61
  `boundingBox` calls. The suite already tells you which layer can see
  layout.**
- **A CSS fix aimed at a property the layout mode ignores.** The spec
  prescribed `justify-self: center` for slots in `.plan-row` and
  `.today-log-row`, both `display:flex` — `justify-self` is inert there.
  Its premise ("today the row top-aligns its badge") was also false:
  `.plan-row-swapped` is already `display:grid; align-items:center`.
  **Technique: read the CONTAINER's `display` before accepting any
  alignment fix, and read the rule the fix claims to change — RF21's flex
  smell recurs with `justify-self` as well as `min-width`.**
- **A tolerant parser told to become strict.** "`parseLink` accepts
  `string | null`" would drop every entry when an OLD server omits the new
  key — the exact failure the same function's `workoutIsGlobal` comment
  already documents ("a MISSING key is … what an older server sends").
  **Technique: when adding a field to a wire shape, read the neighbouring
  field's guard — a parser that survived one additive change has already
  written down the rule the new one must follow.**
- **A Gate-0 artifact that denies the change its spec makes.** The handoff
  README said "Nothing else changes" while the spec moved every swapped
  row's badge; James approved the board on the README. **Technique: diff
  the handoff's "what changes" column against the spec's mechanism section
  line by line — the approval attaches to the README, not the spec.**
- **An amendment aimed at the wrong criterion number.** Spec and ROADMAP
  both amended "frozen exit criterion 1 (`done_n` unchanged)"; criterion 1
  pins the POST body and the retired button, criterion 2 is `done_n`.
  **Technique: open the frozen criteria and read the numbered line, never
  the paraphrase that has been copied between two documents.**
- **Held under attack (vetted ground for the implementation):** the store-
  side `?? !isFreeRow(...)` default is behaviour-identical on all four
  arms; `stores.logs.create` has exactly one production caller
  (`data.ts:1718`); the delete decrement keys on the stored LINK, not on
  `advancesPlan`, and link fields are written inside the same `if` as the
  advance, so a non-opted-in free row cannot decrement; `advancesPlan:
  true` is accepted unchanged by an old server.

## 2026-09-02 — Wave F `door` re-scope, phase-open anchor pass (D1-D4 pre-spec)

- **CLAIM (D1): "PARTIAL is derivable — `endedBy` says I stopped, `steps[].meters`
  vs `actualMeters` says how far."** FALSIFIED four ways in one pass, and the
  technique for each is the cheap one. (a) **Read the door's ONLY exit copy**:
  `Timer.tsx:815` says *"Abandon this session? Nothing will be saved: no log, no
  actuals"* and `Timer.tsx:477` reaches `/session/log` only from
  `isComplete(run)` — a timer row cannot BE partial, so the mapping is vacuous
  there. (b) **grep the field's WRITERS, not its readers**: `actualMeters` is
  written at exactly two lines, both inside `buildMonitorLogSteps` — the
  comparison does not exist off the pm5 door. (c) **Run the predicate against
  the feature that shipped this morning**: a connected Just Row always closes
  `endedBy: "rower"` with `steps: []`, so `endedBy !== "finished"` marks every
  successful Just Row PARTIAL. (d) **Count the union**: D1 listed five of six
  `endedBy` members plus no `null`; the predicate owes seven states.
- **ROOT LESSON: `endedBy` answers "how did the session end", never "did the
  rower stop short of a plan".** Those coincide only when a plan exists. Before
  keying a product word on a stored enum, ask what the enum's WRITERS actually
  know — `monitorRun.ts:184-188` says `"rower"` means End-button OR machine
  TERMINATE, and a Just Row has no other exit.
- **The two inputs disagree in BOTH directions, and the codebase names both
  producers in comments.** `logDraft.ts:805` ("a lost boundary whose pair never
  both arrived") and `types.ts:62` ("an interval that produces ZERO frames is
  lost entirely") give short actuals on a `finished` row. TECHNIQUE: **when a
  predicate combines two stored inputs, grep the source for a comment naming a
  producer of their disagreement** — this repo documents its own edge cases and
  the spec had not read them.
- **CLAIM (D2): "the in-flight interval lands in `steps` jsonb without a
  migration and without changing what sums mean."** NARROWED to one safe shape
  by reading the server's own validator comment: `routes/data.ts:594` —
  *"Built from an explicit field list … any extra keys the client sent are
  silently dropped, not persisted."* So a partial carried in `actualMeters` plus
  a new `measured:false` marker reaches an older server as **the number without
  the marker, 201, forever, in every sum** — while a new `actualSource` member
  400s the whole save with no client retry. **TECHNIQUE: for any new field inside
  an existing jsonb payload, run the additive matrix in BOTH directions and ask
  what the old server does with each KEY SEPARATELY — a marker and its number in
  different keys can be split by a validator's allowlist.** The fix is one line
  of design: number and marker share new key names, so an old server drops both
  together and the row degrades to today's behaviour.
- **CLAIM (D3): "`no-reading` requires a `deviceName` like `pm5`."** FALSIFIED
  against a ruling this repo had already written down twice — `storedSummary.ts:70`
  (*"a best-effort LAST-USED name, so posting it would have the row assert that a
  named erg supplied numbers that came off nothing"*) and `pm-ledger.md:2710`
  (*"Prefer the false negative"*). TECHNIQUE: **before designing a stored field's
  requirement, grep the tree for the field name plus the word the design needs —
  a rejected option is usually documented AT the site that rejected it**, and a
  spec that re-proposes it is reversing a ruling without quoting it.
- **A fourth enum member is NOT additive the way its column was.** An old server
  ignores an unknown BODY KEY (that is why `source` shipped safely) but 400s an
  unknown ENUM MEMBER at `data.ts:1677` with no client retry. TECHNIQUE:
  **"we added a field additively last time" is not evidence about adding a value
  to that field.** Reachability is cited, not assumed: `RELEASING.md:95-97`
  records six merges deploying nothing for eleven hours on 2026-09-01.
- **A biconditional nobody wrote down had a shipped consumer.**
  `deviceName ≠ null ⟺ source = 'pm5'` is enforced on every write by
  `logSource.ts:54,63-75`, and `server/concept2/mapping.ts:49` already keys
  "monitor provenance" on it. D3 breaks it; only the NEXT line of that predicate
  (`endedBy !== 'finished'`) stops the leak. TECHNIQUE: **when a validator
  enforces an if-and-only-if between two columns, grep for readers of EITHER
  side — the invariant is load-bearing wherever it was convenient, not only
  where it was stated.**
- **CLAIM (D4): "renders `MONITOR`."** FALSE. `grep -c "text-transform"
  app/src/index.css` returns **1**, and it is not on `.summary-meta` — every cap
  on that line is a literal. `"monitor"` renders lowercase beside `TIMER` and
  `LOGGED BY HAND`. TECHNIQUE: **a claim about rendered CASE is settled by
  counting `text-transform` in the stylesheet, not by reading the string.**
- **A fallback can be unreachable by construction and still get a test.**
  `capacitorBle.ts:494`'s `device.name ?? "PM5"` sits behind a picker whose only
  filter is `namePrefix: "PM5"` (`:481`) — the fallback cannot fire. Its two
  siblings (`:465` held-device, `webBluetooth.ts:296` OR'd service filter) can.
  TECHNIQUE (RF21): **before pinning a fallback, read the FILTER that produced
  the value — a scan constraint upstream can make the `??` arm dead code, and a
  green test on it is decoration.**
- **A dated trigger fired while the spec was being written.** `git tag` showed
  `v0.34.0` already cut at HEAD containing #268, so the `source` sunset's "next
  tag" trigger is now due — and its blast radius is bigger than the ROADMAP row
  says (`source` REQUIRED on POST means every pre-v0.34.0 install loses all
  saving, not just the derive path). TECHNIQUE: **for any roadmap row whose
  trigger is a tag, run `git tag --sort=-v:refname | head` and
  `git log <prev>..<tag> --oneline` in the pass itself** — trigger rows expire
  silently, and the pre-spec's own base SHA was one commit stale.
- **VETTED GROUND (holds under attack):** `steps` needs no migration for a new
  key; `ALTER TYPE ADD VALUE` is legal inside drizzle's transaction given no
  backfill (PG18 docs, verbatim: *"the new value cannot be used until after the
  transaction has been committed"*); an unmatched interval already carries no
  `actualSource`, so the never-reached discriminator exists; the `?? "PM5"`
  census is complete and collides with no identity read; `DROP COLUMN
  preferences.warmup` has no reader in either direction; the C2 mapping reads no
  step field; `from=monitor` is intent, not evidence.
- **Filed, outside the pass (RF14): no connected Just Row can ever reach
  Concept2** — `mapping.ts:50` requires `endedBy === 'finished'` and a JR always
  closes `rower`. The v0.34.0 flagship is permanently ineligible for the Wave E
  export button.

## 2026-09-02 — Wave F `door` spec pass (written spec, post-anchor)

- **CLAIM: "the existing `LINK LOST` line is subsumed by the PARTIAL marker."**
  FALSIFIED by reading the OLD line's own trigger rather than the new one's.
  `storedSummary.ts:960-962` renders it on `endedBy === "link-lost"` ALONE,
  steps-independent and deliberately so; the new marker needs four clauses. So
  "subsumed" silently deletes a shipped, release-noted line
  (`releaseNotes.ts:351`) from every link-lost row the new predicate EXCLUDES —
  a link-lost Just Row (`steps: []`) and a link-lost row with every step
  measured. TECHNIQUE: **when a spec says a new marker "subsumes" an old line,
  enumerate the rows the NEW predicate excludes and ask what renders there —
  the old line's trigger is almost always broader, and the spec's own gate list
  will be indexed on the new predicate, so nothing can go red.**
- **CLAIM: "N = steps carrying `actualSource`" as the marker's number.**
  FALSIFIED twice. (a) The spec's OWN cited producers of a short step
  (`logDraft.ts:804-806`, `types.ts:62-63`) mean N under-counts what was ROWED
  after a lost boundary — `1 of 5` for a rower who did two and a bit, on the
  screen built to stop the app under-stating a session. (b) The repo already
  computes this count, twice, under one shared rule: `isMeasuredReading`
  (`summaryModel.ts:613-619`) via `readingOfLogStep`, whose adapter's doc
  comment says outright *"so the connected surface's lost banner counts
  intervals by the same rule this screen will judge them by."* The spec's N
  drops that rule's elapsed clause, making a THIRD definition — while the same
  spec's §5.4 argues at length that its number and the banner's cannot collide.
  TECHNIQUE: **before accepting a new COUNT in a spec, grep for the count the
  codebase already computes over the same objects and read its doc comment.
  This repo writes "so X and Y agree" into the predicate itself; a spec that
  redefines the quantity beside it has broken an agreement nobody restated.**
- **RF24 AT SPEC STAGE, not review stage.** §5 designed new step keys
  (`partialMeters`/`partialSeconds`) on the correct reasoning that the server's
  explicit field list drops unknown keys — and then listed six client tasks and
  a gate that reads back from localStorage. The NEW server drops them too.
  TECHNIQUE: **for any new field inside an existing payload, find the server's
  explicit field list and confirm a TASK adds it, then check that the named
  gate STARTS upstream of the POST. A spec can quote the exact comment that
  explains the hazard and still decompose past it.**
- **LINE NUMBERS TRANSCRIBED FROM THE ROADMAP ARE STALE BY CONSTRUCTION.** Two
  of three riders cited lines that no longer hold their subject:
  `domain/monitor/types.ts:607` for an RC-12 comment (`grep -n RC-12` on that
  file returns NOTHING; the comment is at `:630-631`), and `logDraft.ts:865-871`
  / `:600` for a guard at `:864` and a union at `:607`. Both numbers came from
  `ROADMAP.md:701-709` verbatim. TECHNIQUE: **verify a transcribed citation by
  grepping the cited file for the SUBJECT (the ticket id, the string literal),
  never by reading the cited line — a stale number often lands on plausible
  code, and `607` appearing as both a true and a false citation in one spec is
  how the file name got swapped.**
- **BEFORE DELETING A FUNCTION AT A SUNSET, GREP ITS NON-ROUTE CALLERS.**
  `deriveLogSource` is not only the route's derive path: it is the oracle in
  `routes/source.integration.test.ts:447` ("the migration's own CASE and
  deriveLogSource agree on every row"), and migration
  `0020_wooden_millenium_guard.sql`'s own header cites that test by name.
  Deleting it retires the only executable check on a shipped backfill and
  falsifies a migration's documentation. TECHNIQUE: **a sunset's blast radius
  includes every gate the symbol IS, not only every caller it has — grep the
  migrations directory for the function name.**
- **A CENSUS CLAIM IS A GREPPABLE CLAIM, AND TWO IN THIS SPEC WERE SHORT.** The
  mirror set "eight" misses `routes/source.integration.test.ts:164` and `:252`
  (the latter pins the exact 400 message and goes red); the biconditional-reader
  census names `mapping.ts:49` and misses `storedSummary.ts:648`, whose own
  comment claims it uses "the SAME signal `sourceLabel`/`buildMeta` above
  already use" — which the same PR makes false. TECHNIQUE: **run the spec's own
  census command. "The real set is eight" is the one kind of claim that costs
  ten seconds to check and reads as authority forever.**
- **VETTED GROUND (held under this pass, on top of the anchor's):** the
  `source !== "pm5"` rewrite is a true no-op for every stored row (0020's
  backfill CASE plus `logSourceContradiction` make the biconditional total in
  both eras); the SQL key-presence test and the TS `undefined` test agree
  exactly, because the route 400s `actualSource: null`; the RC-18 census is
  line-exact; a stored `MONITOR` collides with nothing (every stored-row
  `deviceName` consumer is a null check, never a value comparison); clause 4's
  allowlist is exactly the server enum minus `finished`; `interrupted` has no
  live frame; the additive matrix's old-client-reads-new-row row is correct.

- **2026-09-02, `door` spec DELTA pass (the revision that applied the spec
  pass).** The five blockers landed and 27 of 31 new citations were exact —
  and the fix to the biggest one OVER-CORRECTED. "LINK LOST is subsumed" was
  closed by widening `buildLinkLostLine`'s allowlist from one value to five,
  keeping its steps-INDEPENDENT trigger — which prints `STOPPED EARLY` on
  every connected Just Row (`steps: []`, `endedBy: "rower"`,
  `useMonitorSession.ts:5010`), the population the spec's own clause 2 exists
  to protect, and on a planned row Ended after its last interval. TECHNIQUE:
  **when a fix widens a predicate to preserve something, enumerate the rows
  the WIDENING newly admits, not the rows the old predicate excluded** — a
  spec that fixes an under-render by loosening a trigger will exemplify only
  the case where the loosening is harmless (here, link-lost, where the word is
  true regardless of steps), and never state what the new population renders.
- **A shared rule can have three spellings, and the spec will name the one
  that cannot be called.** `N = steps.filter(isMonitorRowMeasurable)` — that
  function is `function`, not `export function` (`summaryModel.ts:987`), takes
  the LIVE door's `LogStep`, and the stored door where the marker renders
  already carries the generalisation (`storedSummary.ts:801`), whose own doc
  comment says it generalises exactly that check. TECHNIQUE: **before
  accepting "the repo's ONE rule", grep the rule's name and read the comments
  that CITE it — this repo documents its own generalisations at the
  generalisation, and the sibling that names you is the one you should have
  called.** Corollary: check `export` before citing a function as shared.
- **A prescribed census command is a gate, and it can be unable to go red.**
  The spec told the plan to trust `grep -rn '"pm5", "timer", "manual"' app`
  over its own ten-item paragraph; the command returns THREE. Worse, the most
  dangerous mirror is invisible to both compiler and grep: `LOG_SOURCES` is
  `readonly LogSource[]` (`domain/types.ts:102`), so a short array compiles
  clean and 400s every save of the new member. TECHNIQUE: **run any command a
  spec prescribes, and count its hits against the list it replaces** — same
  ten seconds as the previous pass's census check, one layer up.
- **Corrected where argued, left where used — again, and in the same file
  pair.** The revision fixed `logDraft.ts:857`→`:864`, `:600`→`:607`,
  `types.ts:607`→`:630-631` in the spec and left all three in
  `ROADMAP.md:702-707`, the document every one of them was transcribed FROM.
  TECHNIQUE: after correcting a transcribed citation, grep the NUMBER in the
  source document, not just the subject in the code.
- **Attacked and HELD:** the SQL boolean needs no elapsed clause (the floor
  lives in N, not the predicate) and `NOT (s ? 'actualSource') ≡ undefined`
  because `data.ts:472-479` 400s an explicit null; `M` is work intervals, not
  steps-plus-rests (`logDraft.ts:856`); the RC-12 rider really is ONE site —
  `schema.ts:237-251` already carries the CORRECTED block the history doc
  still lists as owed, so `docs/history/` was the stale record, not the
  ROADMAP; the `driver.ts:2605-2622` free-row SUSPECTED claim is honest (no
  `freeRow` opt-out there; the two that exist are `:2575`/`:4982`); the sunset
  row already says "the route's `deriveLogSource` call", so it survived the
  oracle correction untouched.

## 2026-09-02 — Wave F `door` PR A plan, antagonist DELTA (post-spec, post-Gate-0-A)

- **CLAIM: "clause 2 (`steps.length > 0`) is what stops every successful Just
  Row reading STOPPED EARLY" — the spec's own most-emphasised clause, carried
  into a code comment, two test comments and TWO named mutations.** FALSIFIED
  by evaluating the predicate as WRITTEN rather than as ARGUED: clause 3
  (`steps.some(s => s.actualSource === undefined)`) is already false for `[]`,
  so clause 2 is redundant and both its mutations (`M3.1` delete clause 2;
  `M4.1` drop `jsonb_array_length > 0`) leave every test green. Same in SQL:
  `exists (select 1 from jsonb_array_elements('[]'::jsonb) …)` is false.
  TECHNIQUE: **when a plan lands a defensive clause and a mutation that
  "proves" it, run the SIBLING clauses against the same input first — a clause
  added by an earlier pass to fix a THREE-clause predicate is often subsumed
  by the fourth clause a later pass added, and the mutation inherits the
  earlier pass's reasoning rather than the current code's.** The biting
  mutation is the one that makes the empty case TRUE (`.every()` for `.some()`,
  `not exists` for `exists`), never the one that deletes a redundant guard.
  - **CORRECTION, 2026-09-02 (door PR A, Tasks 3/4 measured it; landed at Task
    7).** The falsification above is right and its technique holds; its LAST
    sentence is wrong. Making the empty case true is not sufficient either,
    because the redundant guard still returns FIRST. **Neither mutation alone
    bites the Just Row leg; only both together do.** Measured, TS side (Task
    3, at `8b8a07f3`): `.every` alone = **RED on 21 other tests but the Just
    Row leg GREEN**; clause 2 deleted alone = **all green**, `Test Files 170
    passed (170)` / `Tests 4591 passed (4591)`; both together = **RED, 31
    tests**, `AssertionError: expected 'rower' to be undefined`. SQL side
    (Task 4): dropping `jsonb_array_length > 0` alone = **green, 9 passed**;
    `not exists` alone = **red on 3 tests but on the PARTIAL row**
    (`"partial": true → false`), the Just Row untouched; both together = the
    Just Row flips `false → true` alongside `link-lost just row`. TECHNIQUE
    the correction adds: **a redundant guard and the clause that subsumes it
    are one gate with two doors — a probe of the subsuming clause is blind
    while the guard stands, so the mutation that proves the RULE has to close
    both doors at once.** And the failure is instructive twice over: this
    ledger's own bullet, written to catch a plan reasoning about a predicate
    as ARGUED rather than as WRITTEN, then reasoned about the MUTATED
    predicate the same way. Evaluate the mutant, not the mutation.
- **A SUNSET'S BLAST RADIUS IS COUNTED IN CALL SITES AND MISSES THE FIXTURES
  THAT EXIST TO BE OLD.** The plan's per-file table counted
  `grep -c 'post("/api/logs")'` and reported "via helpers" for five e2e files.
  Actual: `design.spec.ts` (5) and `today.spec.ts` (4) use NO helper, and
  `screenshots.spec.ts` has two direct POSTs outside its `postLog`. Worse,
  `data.test.ts` carries three `Object.freeze`d bodies named
  `V0_11_0_LOG_BODY`/`V0_12_0_LOG_BODY`/(a third) whose tests assert an OLD
  client "still 201s", plus `e2e/log.spec.ts`'s `postV0110Log` — the plan's
  instruction ("add `source` to each file's shared body helper") would destroy
  the exact fixtures that encode the contract the sunset breaks. TECHNIQUE:
  **for any required-field sunset, grep the request VERB not the helper
  (`grep -rn 'fetch("/api/logs"'` as well as `.post(`), and grep the test tree
  for `Object.freeze` / "frozen" / a version number in a fixture NAME — a repo
  that pins old wire shapes on purpose has tests that must INVERT, not be
  swept.**
- **CONVERTING A TEST'S ASSERTION SILENTLY REMOVES ITS ROWS.**
  `source.integration.test.ts:135/144/150` are the only POSTs before `:157`'s
  list-projection parity test, whose `arrayContaining` at `:164` the same plan
  separately edits as "mirror 8". Making the three legs assert a 400 leaves
  `:164` with no fixtures. TECHNIQUE: **in a shared-app integration file,
  before changing a test from "creates a row" to "is rejected", grep the rest
  of the file for readers of the collection it was seeding — vitest runs `it`s
  in file order, so the coupling is positional and invisible to a per-test
  review.**
- **A LIST/DETAIL "agree by construction" CLAIM IS ABOUT ONE BOOLEAN, NEVER THE
  WORD.** The chip is gated on `partial`, so a link-lost Just Row shows
  `LINK LOST` on the detail screen and nothing in History — the divergence
  class the spec's own agreement test was built for, one field to the left of
  where it looks. TECHNIQUE: **when a surface derives BOTH a boolean and a
  word from one predicate, check that the agreement test compares the word.**
- **Attacked and HELD:** `LOG_SOURCES` really is `readonly LogSource[]`, so
  `M1.1` is a genuine compiler-blindness probe; only two exhaustive switches
  exist over `LogSource`; `interrupted` is in the `ended_by` pgEnum AND in
  `data.ts`'s `ENDED_BY_VALUES`, so the SQL allowlist cannot throw;
  `coalesce(…, false)` is load-bearing (`ended_by` nullable, `source`/`steps`
  NOT NULL) and its mutation bites; `data.ts:472-475` really does 400 an
  explicit `actualSource: null`, so `NOT (s ? 'actualSource')` ≡ `undefined`;
  the partial chip really cannot reuse `.free-row-chip`
  (`FreeRowChip.test.tsx:71-76` pins one rule, one selector);
  `ROADMAP.md:701`'s `schema.ts:369` is stale and `:425` is right; the
  shortened-literal grep returns exactly the 6 hits claimed; no `.summary-meta`
  e2e locator can see a second element; and PR A introduces no session-scoped
  state, so RF27 owes nothing.
### 2026-09-02 — Wave E PR1.75b native plan (DELTA pass 1)

- **A vendor lifecycle hook named in a design without checking that it fires in the case
  it was chosen for.** Design §2 cleared the in-flight link claim via the Capacitor plugin's
  `load()` "on a fresh document over a live session". `load()` runs ONCE, from
  `registerPluginInstance` at view-controller construction; a WebView reload runs
  `bridge.reset()` (storedCalls + listeners only) and never re-runs it, so the literal design
  leaks the claim forever. Caught by the plan writer, not the design pass.
  **Technique: for any vendor hook a design depends on, find its CALL SITES in the vendored
  source — not its declaration — and check the call site is reachable in the failure case.**
  RF16's second corollary aimed at a MECHANISM instead of a document: the API was real, the
  argument needed an attribute of it (when it fires) that nobody checked.
- **"Single resolution by construction" that is actually single resolution by ordering.**
  The substituted `shouldOverrideLoad` teardown clears `activeCall` before cancelling, and the
  completion handler guards on `activeCall != nil` — which asks "is there ANY call", not "is
  this MY session's call". A superseded session's late completion can resolve the NEXT
  session's call. Unreachable in practice (the window is a full page load), so hardening debt,
  not a defect — but the comment claimed the strong version.
  **Technique: for every "by construction" claim about single resolution, name the VALUE that
  makes the two instances distinguishable. If the guard reads a shared slot rather than an
  identity, the guarantee is ordering luck. A per-attempt token turns it deterministic.**
- **A typed union that names every failure the AUTHOR thought of, and not the transport.**
  `LinkOutcome` mapped nine plugin rejections and two server hops and had no member for a
  thrown `fetch`/`JSON.parse`/`new URL` — on a walk conducted over a cloudflared quick tunnel.
  Symptom: the operator taps and nothing happens, with no readout.
  **Technique: for any union claiming to name "every way X can end", walk the function line by
  line and list every expression that can THROW. Every throw with no catch is a missing member.**
- **A comment-leader normaliser that strips `//` and leaves the third slash.** The phrase
  census's `sed -E 's@^[[:space:]]*(\*|//|--|>)[[:space:]]?@@'` finds a JSDoc-wrapped phrase and
  MISSES a Swift `///`-wrapped one — in the same PR that adds a `///`-commented Swift file to
  the census corpus. Proven both ways with a two-line fixture.
  **Technique: run a normaliser against a fixture in EVERY comment syntax its own `find` will
  reach, not just the syntax that motivated it. `(\*+/?|/\*+|/{2,}|-{2,}|>|#)` is the fixed form.**
- **A test-file insertion point identified from a string inside a heredoc.** The plan pointed
  at "the trailing `case "$1" in` dispatch at :212" of `ios-release.test.sh`; that `case` is
  inside a `cat > … <<'STUB'` block building a pnpm stub, and the file has no trailing dispatch.
  **Technique: before citing a shell construct's line number as a structural anchor, check
  whether it sits inside a heredoc — `grep -n "<<'" file` first.**
- **Walk-card blocks written in bash for a fish shell.** `set -a; . .env; set +a` and `export`
  are bash-only; the operator's default shell is fish, so the card's FIRST block fails.
  **Technique: RF13's "run it or read the code" extends to the SHELL — check the operator's
  `$SHELL` against the syntax, and say "run this in bash" when they differ.**
- **HELD under attack, and worth recording as vetted:** all fifteen `ASWebAuthenticationSession.h`
  quotes verbatim and line-exact; all `project.pbxproj` anchors exact (`objectVersion = 60`, no
  synchronized groups, so manual refs are required not optional); `cap update ios` writes
  `Package.swift`/Podfile and never `project.pbxproj`/`Main.storyboard`/`Info.plist`; the whole
  retirement census reproduced exactly (`browserFinished` = 52 under `src`, to the occurrence);
  the Info.plist scheme registration does NOT reopen RFC 8252 because zero `appUrlOpen`
  listeners exist — an absence that is now a permanent census row, since a future listener
  would silently reopen it.

### 2026-09-02 — Wave E PR1.75b native plan (DELTA pass 2, verifying pass 1's fixes)

- **A build-output gate whose expected number nobody had ever measured.** Gate (a) asserted
  `grep -c 'SwiftCompile.*Foo\.swift' build.log` == 1 to prove Sources-phase membership. Measured
  on a cold `-derivedDataPath` build at this head: a genuine member counts **4** (two log line
  forms × two architectures, because `generic/platform=iOS Simulator` builds arm64 AND x86_64)
  and **0** on any warm re-run — so `1` is the one value it can never legitimately print, and the
  plan re-ran it in a second task where the build is warm by construction.
  **Technique: a gate whose pass value is a COUNT of build-log lines is a heuristic wearing a
  number until someone has run the build and counted. The deterministic artifact was one
  directory away: `…/App.build/Objects-normal/<arch>/App.SwiftFileList` is the compiler's own
  input list for the target's Sources phase, written by `WriteAuxiliaryFile`, and reflects the
  pbxproj rather than the build's incremental state.**
- **A compile gate that runs before the step that creates its inputs.** `xcodebuild build` failed
  with `error: The file "public" couldn't be opened` — `app/ios/App/App/public` and `config.xml`
  are gitignored (`app/ios/.gitignore:4,13`) and generated by `cap sync`, which the plan ran in
  the NEXT gate. **Technique: before ordering an iOS gate, `ls` the target directory against
  `.gitignore` — a generated input absent from a fresh worktree makes the gate unrunnable, and
  no amount of reading the command reveals it.**
- **A census regex defeated by the exact case its own comment cited as the reason for its
  design.** `rejectCodes` took the last `/"([^"\\]*)"/g` match per `.reject(` line "because
  messages carry `\(interpolation)`" — and `[^"\\]*` stops dead at the backslash of a Swift
  interpolation. Measured: 12 of 14 reject lines collected, and renaming the `@unknown default`
  arm's code to `typoCode` left the sorted-set assertion GREEN. The two invisible lines were
  precisely the two the comment named.
  **Technique: for any regex census, assert that the number of codes extracted equals the number
  of lines matched — `expect(codes).toHaveLength(lines)`. A regex that silently skips a line
  shrinks the expectation instead of failing, and the set comparison then passes forever.
  `/"((?:[^"\\]|\\.)*)"/g` is the fixed form.**
- **A "diff, not a reading" gate that cannot be diffed.** Step 3b replaced two judgement calls
  with "diff against an expected file built from the table" — but the table's residual cells name
  document nicknames ("gate doc ×2", "1.75a plan ×4"), not paths, so the expected file cannot be
  built mechanically and the gate collapses back into the judgement it replaced.
  **Technique: when a census needs a mechanical pass condition, diff BASE-vs-HEAD captures of the
  same script, never head-vs-a-table-transcribed-by-hand. A prose table is not an artifact.**
- **A gate green on a surface it cannot reach, again.** `grep -rn -i concept2 app/e2e` → one
  unrelated comment. `pnpm e2e` is correctly REQUIRED (RF1) and cannot touch one line this PR
  adds, because the only consumer is compiled out of the stack's bundle.
  **Technique: for every required gate, ask what it proves ABOUT THIS DIFF, and write
  "required-but-blind, here is what actually proves it" into the plan — otherwise a green badge
  becomes the coverage claim (RF26).**
- **HELD under attack, and now vetted:** the `activeToken` guard is sound on every path (a
  superseded completion is discarded by identity; the four pre-claim early returns correctly do
  NOT clear, and `busy` clearing would strand a live session); all four `WebViewDelegationHandler`
  citations line-exact (`:45-48`, `:77-92`, `:108-115`, `:158-162`), plus `CAPPlugin.h:34-40` /
  `.m:170-172` and `CapacitorBridge.swift:115` (`[String: CapacitorPlugin]`); `debug.xcconfig` is
  `baseConfigurationReference` at `project.pbxproj:187,308`, so dropping `assertionFailure` was
  right; `ios-release.test.sh` is 250 lines with `:246` the summary block and no pre-existing
  `trap`; the census normaliser reproduces exactly (`///` old=0 new=1, all four comment syntaxes);
  WHATWG `URL`/`searchParams` parse the private-use scheme correctly (PROVEN in Node 26, spec-
  backed — query state is scheme-independent); every exchange error string is expressible in
  `LinkOutcome`; `POST /connect` has no already-linked guard so the walk's re-link path works;
  and all ten clauses of `ROADMAP.md:1096-1128` have a disposition.

### 2026-09-02 — Wave E PR1.75b native plan (DELTA pass 3, verifying pass 2's fixes)

- **A concurrency test whose mock arms its resolver BELOW two awaits, released
  from above them.** The `busy` case did `const second = await startLink(...)`
  (one microtask) and then `release(...)` — but the first attempt was still
  inside `await res.json()`, which settles on a LATER task, so `WebAuth.start`
  had not been called, `release` still held its `() => undefined` initializer,
  the release was dropped silently and `await first` never settled. The same
  test then `await`ed a THIRD call against a mock returning a fresh
  never-resolved promise per invocation. Both are timeouts; the test is red on
  the mutant AND red on correct code, so the `finally`-deletion probe would be
  logged as "biting" against a test that cannot go green.
  **Technique: simulate the mock and the implementation in plain Node with a
  `Promise.race` timeout before believing any test that interleaves a pending
  promise with a module-scope guard. Two questions settle it — "is the
  resolver armed when the test calls it?" and "how many times is the plugin
  called versus how many resolvers exist?" Arm-detection (`releases.push`
  + `vi.waitFor(() => expect(releases).toHaveLength(n))`) replaces a single
  `let release` variable and makes both bugs impossible.**
- **A prerequisite chain fixed one link short — the SAME defect class, one
  layer up, inside the pass that fixed it.** Pass 2 moved `cap sync` in front
  of `xcodebuild` because `xcodebuild` needed gitignored inputs `cap sync`
  writes. `cap sync` itself needs `dist/client`, which is also gitignored:
  in a fresh worktree it exits 1 with `Could not find the web assets
  directory`. **Technique: when a fix reorders a gate because of a missing
  generated input, walk the chain to the FIRST command whose inputs are all
  tracked — one `ls` against `.gitignore` per hop, not one for the hop that
  failed.**
- **A mutation instruction that is not valid syntax.** "Delete `readStatus`'s
  `catch` block (leave the `try`)" — `try {}` with no `catch`/`finally` is a
  `SyntaxError: Missing catch or finally after try`. The sibling row in the
  same plan ("remove the catch, leave `try`/`finally`") was legal, which is
  how the illegal one read as fine. **Technique: paste every mutation
  instruction into `node -e` (or a scratch file) before shipping it. A
  mutation is code, and the same "run it or read the code that serves it" bar
  applies (RF13).** Corollary: a mutation row that PREDICTS its failure mode
  ("it dies by THROWING, record that exact text") must name the layer that
  observes the failure — a rejection from `void f()` inside `useEffect` dies
  as an assertion timeout, never as a thrown test.
- **"finds nothing" about a grep that finds one unrelated line.** The e2e
  blindness argument was correct and its own cited command falsified it
  (`design.spec.ts:2017`, a PM5 BLE-name comment). **Technique: for every
  "grep X finds nothing" sentence, run the grep and paste its ACTUAL output;
  if it is non-empty, name the hit and why it does not count. A conclusion
  that survives the real output is stronger than one that needs the output to
  be empty.**
- **Attacked and HELD (this plan's vetted ground is now closed):** the
  clear-site clause against the Swift's four pre-claim / two post-claim
  returns; the contract regex reproduced in Node (14 lines → 14 codes on the
  fixed form, 12 on the naive, and the `typoCode` probe green on the naive /
  red on the fixed); `census.sh` complete and its `norm()` reproduced across
  all four comment syntaxes; the whole step-3b base-vs-head census procedure
  run end to end (diff = 15 lines, all the plan's own file; `browserFinished`
  = 52 under `app/src`; `appUrlOpen` = 0; every residual count exact);
  `cap sync` leaving `git diff -- app/ios` EMPTY; `xcodebuild` BUILD SUCCEEDED
  and `App.SwiftFileList` present at the named arm64 path listing
  `AppDelegate.swift`; the fold counted at 119 words / 24 longest;
  `UIApplicationSceneManifest` = 0; `searchParams` and Node's `querystring`
  both decoding `+` as a space; `CAPBridgeProtocol.swift:80` declaring
  `registerPluginInstance` (so `bridge?.` compiles) and
  `capacitorDidLoad()` being an empty `open func` at `:164` called at `:53`
  after the bridge is assigned; the storyboard's current
  `customModule="Capacitor"` with no `customModuleProvider`, making the
  plan's `customModule="App" customModuleProvider="target"` the correct
  replacement; all Task 3 deletion ranges exact; and the three pre-existing
  main-checkout items named correctly.

### 2026-09-02 — Wave E PR1.75b native plan (DELTA pass 4, verifying pass 3's fixes)

- **A test added because a probe could not discriminate, gated by a mutation that also
  cannot discriminate.** REV 4 added a RE-READ test because "the mount test alone cannot
  tell a correct check order from a swapped one" — and named its biting mutation as
  "`statusError` moved BELOW the `status === null` check". Measured in Node against the
  plan's own `describeStatus`: that reordering still returns `unreadable` on the re-read
  path (statusError is checked before `!status.available`), so the new test stays GREEN
  and the row would be logged as biting. The plan's PROSE described the right mutation
  ("falls straight through to `not linked`"); only moving the check below `!status.linked`
  produces it. **Technique: for a guarded ORDER, do not describe the mutation by which
  neighbour it moves past — run every reordering against every state the tests reach, and
  name the destination that changes ALL of them. Prose describing a mutant's effect and the
  instruction producing it are two claims; check them separately.**
- **A cited edit RANGE that includes the first line of the next thing.** Task 8's "replace
  the Status block (`ROADMAP.md:1120-1128`)" — the block is 1120-1127; 1128 is the PR2 row.
  **Technique: for any "replace lines N-M" instruction, print line M+1 as well and confirm
  it is NOT part of what you named.** Same family as the ledger's heredoc-anchor entry: a
  line number is only an anchor once you have looked at both ends of it.
- **A walk observation whose precondition the card never establishes.** Check (a) told the
  operator the sheet "should ask you to log in even if Safari already has a Concept2
  session" — but no step signs in to Concept2 in the phone's Safari, so "it asked me to log
  in" is exactly what a NON-ephemeral session produces on a fresh phone. It was also absent
  from the check's RECORD bullets and from the report's contents, while the PR fold sold it
  above the fold as a rower-facing control. **Technique: for every walk observation, ask
  what state the phone must be in for a NO to be possible — if the card does not put it
  there, the observation is decoration, and the fix is a precondition step plus a RECORD
  line, not better wording.**
- **Attacked and HELD (this pass added no new ground beyond the above):** the busy test
  simulated in Node — correct code passes in 145 ms, the `finally`-deleted mutant fails at
  exactly `expected [ … ] to have a length of 2 but got 1`, and the shared-`Response`
  counterfactual reproduces the JSDoc's predicted failure verbatim (Node 26's message is
  `Body is unusable: Body has already been read`); `pnpm build` → `cap sync` → `-list` from
  a truly emptied `dist/` (`git diff -- app/ios` EMPTY; `public/` = 74 files, css/html/js/
  png/woff/woff2, zero census-matching extensions); `census.sh` exits 0 with
  `browserFinished` = 52 under `app/src`; both e2e greps reproduce (one PM5 comment, one
  empty); `ios-google-client-id.sh` written and run — 5/5 cases pass on the real plist, the
  index-0 PlistBuddy mutant fails 2; `ios-release.test.sh` is `set -uo pipefail` with no
  `-e`, so the new block's idiom matches the file; migrations run at boot
  (`server/index.ts:32`) so the walk DB needs no migrate step; `c2UserId` IS unique but a
  `--rm` walk container makes collision unreachable; the fold counts 119/24 exactly; and an
  attack on check (c) failed — an existing grant does NOT suppress Concept2's consent
  screen (the 08-31 crossconnect authorized user 2211 on the same client, and D3 on 09-02
  still rendered "Authorize James Morelli to use your account?").

### 2026-09-02 — Wave E PR1.75b native plan (DELTA pass 5, verifying pass 4's fixes)

- **A red proof that names its MUTATION but not its TREE.** Task 8's census probe said
  "delete the leader-strip and re-run: the wrapped hit disappears" — true at the baseline,
  a guaranteed no-op at the head. Measured corpus-wide: the leader strip changes exactly
  ONE count in the whole corpus, `Concept2LinkProbe.tsx`'s wrapped phrase, and the same
  plan rewrites that file and deletes the phrase. **Technique: for any probe run over a
  CORPUS rather than one file, diff the normaliser's output with and without the mutation
  at the tree the step actually runs on — if only one file discriminates, ask whether the
  plan changes that file before the probe fires. A red proof states the tree, not just the
  mutation.**
- **A plan's own pass-count bullet goes stale at every fold, and it is the one that reaches
  the reviewer.** REV 5 folded pass 4 and left "THREE DELTA passes … folded at REV 2, REV 3
  and REV 4" ticked `- [x]` in Task 9 AND in the PR Record's risk line. **Technique: after
  folding a pass, grep the plan for the pass COUNT and for every REV number, the same sweep
  CLAUDE.md already demands for a withdrawn claim's phrasing.**
- **Attacked and HELD:** all three `describeStatus` orderings run in Node (correct green/green,
  the old reorder green on re-read, the bottom-move red on both); `ROADMAP.md:1120-1127` vs
  `:1128` verbatim; the four ephemeral-precondition sites consistent, with a NO now reachable;
  the fold at 120 words / 24 longest by `wc`, every bullet backed by a named walk RECORD or
  test; every mutation table's target committed before its probe; and — newly measured — gate
  (a)'s pass value of `1`, counted against a real Sources-phase member in
  `App.SwiftFileList` (`grep -c 'App/AppDelegate\.swift$'` → `1`), so the number that replaced
  the unmeasurable `SwiftCompile` count is itself measured. ~40 `file:line` citations re-read
  at this head, one drifted (`eslint.config.js:86-89` excludes `src/adapters/**` at `:90`).

### 2026-09-02 — Wave E PR1.75b native plan (DELTA pass 6, verifying pass 5's fixes)

- **A phrase-census gate whose expected ZEROS are falsified by the same plan's own new
  source.** The retirement row said `browserFinished` = 0 under `app/src`, and the plan's
  prescribed `src/adapters/linkFlow.ts` header contains the literal (plan `:1227`); the
  PERMANENT `appUrlOpen` row said 0 under `app/src` AND `app/ios`, and the plan's own
  `WebAuthPlugin.swift` doc comment contains it (`:263`). Both counts were measured against
  the CURRENT tree, where the new files do not exist yet, so the table was true when written
  and false the moment the plan is executed. **Technique: for any census/grep gate, run the
  phrase list against the CODE THE PLAN PRESCRIBES — the file-content code blocks, not the
  plan's prose — before believing an expected count. A gate's expected value is a claim about
  the post-change tree, and a pre-change measurement cannot support it.**
- **A gate ordered before the edits it will judge.** The base-vs-head census diff sat at step
  3b while steps 4-6 each add a `browserFinished` sentence to ROADMAP.md (1→2) and the two
  PR1.5 documents (3→4, 7→8) — so the diff either describes a tree the PR does not ship or
  reports the plan's own prescribed edits as defects. **Technique: for a diff-shaped gate,
  ask which later steps in the SAME task still change the corpus, and either move the gate
  behind them or enumerate their deltas in the permitted list with exact before→after counts.**
- **A mutation that breaks the TOOL is observationally identical to the mutation biting.**
  "Delete the `sed -E` leader-strip from `norm()`" leaves `norm() { | tr … }` — bash syntax
  error, exit 2, zero output — so every hit "disappears" and the red proof reads as passing.
  Pass 3's `try {}` entry covers invalid mutation syntax; this is its corollary.
  **Technique: a probe that removes part of a tool must state the tool-still-runs form AND a
  SURVIVOR — here, `never a real link` must still report 1 while `posts nothing and carries
  no client id` goes to 0. A red proof with no survivor cannot tell a bite from a crash.**
- **Attacked and HELD:** all six of pass 5's folds (pass counts consistent at both sites; the
  baseline-tree probe run end to end and biting, `never a real link` surviving;
  `eslint.config.js:89-90`; `You.tsx:19-20`'s `DEV ||` OR; observation 10's grep list exact);
  ~30 fresh citations across `concept2.ts`, `middleware.ts`, `index.ts`, `auth/routes.ts`,
  `project.pbxproj` (all four anchors + thirteen settings lines), `Main.storyboard:14`,
  `dist-grep.sh`, `ios-release.sh/.test.sh`, `ci.yml`, `phase-lt.md`, the gate doc's three
  markers, `ROADMAP.md:1086-1095`; the Swift's two compile-blocking signatures verified in the
  vendored sources (`CAPPlugin.h:40` is `NSNumber* _Nullable`, so the `-> NSNumber?` override
  is legal; `JSTypes.swift:34` gives a NON-optional `getBool(key, default)`); `compose.yml:61-64`
  never exporting `VITE_ENABLE_C2_LINK_PROBE`, so the e2e/screenshots blindness claim holds; and
  the "only the calling app's session" guarantee traced to design §Research `:73` (PRIMARY,
  developer.apple.com) rather than the SDK header, which does not contain it — the Swift comment
  attributes it correctly.

### 2026-09-02 — Wave E PR1.75b native plan (DELTA pass 7, verifying pass 6's fixes)

Seventh consecutive verification pass on one plan. Three REVISE, all
found by re-running the previous pass's own reasoning one column over.

- **CLAIM (pass 6's fix): the census table's residual cells now reflect the
  plan's own prescribed record edits.** FALSE for the sibling row. Pass 6
  re-counted `browserFinished` after steps 4-5 add sentences to three
  documents, and got 1→2 / 3→4 / 7→8 exactly right. It never re-counted the
  OTHER phrase inside the same prescribed block: step 4's replacement ROADMAP
  Status block also contains `appUrlOpen` once, so ROADMAP goes 2→3 and step
  6b's gate diff emits an unpermitted line. **Technique: when a fix re-measures
  ONE row of a table against a newly-written source, re-measure every row
  against that same source — the source is the unit, not the row.** Settled by
  running the plan's own census script against a detached worktree at the
  stated baseline, then grepping the prescribed replacement text for each
  phrase in the list.
- **CLAIM: an operator command in a walk card is checked when its OUTPUT is
  checked.** FALSE. `pnpm ios:build` (package.json:29) ends in
  `scripts/ios-version.sh:12-13`, which rewrites two TRACKED files with version
  stamps. The plan's own Global Constraints state the rule and the required
  `git restore`; the card is the plan's only invocation of the command and
  carries neither, and the SDLC step that would catch it names those exact two
  files as known pre-existing dirt in a DIFFERENT checkout. **Technique: for
  every command handed to an operator, read what it writes, not only what it
  prints — and grep the plan for who restores it.** The main checkout's own
  `git status` was the standing proof nobody restores them.
- **CLAIM: a walk case that carries a PASS criterion is fully recorded.**
  FALSE for an OPTIONAL variant. Check (d)'s optional WebContent-termination
  run is, by the plan's own words, "the only thing that can settle" an
  INFERENCE the shipped Swift comment declares in its own text — and it had no
  bullet in the report contents and no row in the fold task, so a measurement
  would have left `INFERENCE, not measured` standing in shipped code.
  **Technique: for every "UNMEASURED"/"INFERENCE" string a plan puts into
  shipped prose, find the walk step that measures it AND the fold row that
  rewrites it; a measurement with no fold row is not an instrument.**
- **HELD, attacked hard:** all four of pass 6's folds — the `linkFlow.ts`
  header and every prescribed `app/src` block re-grepped (0 lowercase
  `browserFinished`, including the surviving halves of the three edited files);
  the single permitted `app/ios` `appUrlOpen` hit; step 6b's placement and all
  three `browserFinished` post-edit counts re-derived by counting the current
  files; the `/tmp/pr175b-base` worktree lifecycle (created once, reused,
  removed once). The census mutation was RUN: exit 0, `posts nothing and
  carries no client id` drops 1→0 for `Concept2LinkProbe.tsx` while `never a
  real link` survives at 1, and the diff moves exactly one line — the survivor
  requirement is what separates a bite from a crashed tool. Pass counts
  consistent at all three sites. **Newly verified PRIMARY, and it was the
  walk's single point of failure: the (d) inspector chain** —
  `debug.xcconfig:1` → `project.pbxproj:187,308` → `Info.plist:5-6` →
  `CAPInstanceDescriptor.swift:144` / `CapacitorBridge.swift:31` →
  `CapacitorBridge.swift:458` `isInspectable`, documented at
  `CAPInstanceDescriptor.h:102`. Also verified: `POST /connect`
  (`routes/concept2.ts:212-277`) has no already-linked refusal, so the card's
  "an already linked account can re-link" holds and checks (b)-(d) survive a
  successful (a).

### 2026-09-02 — Wave E PR1.75b native plan (DELTA pass 8, verifying pass 7's fixes)

Eighth consecutive verification pass on one plan. Two REVISE, both found by
running something the plan only asserted.

- **CLAIM: "the six new checks FAIL" before the code exists.** FALSE — five do.
  The third, `[ "$rc" -ne 0 ]` on a script that does not exist yet, passes
  vacuously: `bash <missing file>` exits 127, which is indistinguishable from
  the correct refusal it will later assert. **Technique: a failing-test-first
  step's expected failure COUNT is a measurement, not an inference — run the
  prescribed block against the pre-fix tree (point its `$HERE` at the real
  directory from a scratch copy; nothing needs writing into the worktree) and
  count the FAIL lines. Any check whose assertion is "exits non-zero", "returns
  empty", or "is absent" is green before the subject exists, so it can never be
  part of a red proof.** Sibling of the ledger's `SwiftCompile`-count entry: the
  pass value was reasoned, not counted.
- **CLAIM (pass 7's own fold): the SDK-header citation rule is widened.** TRUE
  where the rule is ARGUED (Global Constraints), FALSE where it is USED. The
  prescribed `WebAuthPlugin.swift` still ships "Every Apple-behaviour claim
  below quotes the SDK header … by line", and two claims below it do not: the
  bare-scheme guard rests on a labelled SECONDARY forums post (`grep -i
  "special char|should not include|bare|colon"` over
  `ASWebAuthenticationSession.h` → EMPTY, so no header line exists to quote),
  and the `shouldOverrideLoad` comment cites WebKit and Capacitor with zero
  header quotes. **Technique: when a pass RELAXES a rule, grep the relaxed
  absolute ("every", "only", "by line") through the plan's own PRESCRIBED CODE
  BLOCKS, not just its prose — shipped comments are where a withdrawn absolute
  survives, and CLAUDE.md's sweep rule names exactly this ("correcting where the
  claim was ARGUED and leaving it where it was USED is the failure").**
- **Attacked and HELD:** the whole census re-run one more time, per phrase,
  against every prescribed insertion and code block extracted to files — only
  the two documented additions appear (`appUrlOpen` in `WebAuthPlugin.swift`
  and in step 4's ROADMAP block; `browserFinished` in that block and in step 5's
  HISTORICAL note), and `ROADMAP.md`'s baseline (2 / 1, at `:1091,:1108` /
  `:1089`) plus the replaced `:1120-1127` block containing neither confirms the
  2→3 and 1→2 cells exactly; two apparent extra hits were extraction artefacts
  (a quoted sentence being REMOVED, and the plan's own instruction prose).
  `ios-version.sh:14` prints the card's success line byte-for-byte.
  `Main.storyboard:14` and the `Info.plist` `:21-30` fragment are BYTE-identical
  to the plan's replacements (tabs included). All four `project.pbxproj`
  anchors, the seven existing id prefixes, `E2A1` = 0. `ios-release.sh:101-108`
  is exactly the block being replaced, with `APP_DIR`/`PLIST` in scope. Task 1's
  commit stages zero lint-staged-matching files (`package.json:14,18`), so no
  hook can reformat it. No Xcode state is required that a fresh engineer lacks:
  no scheme is tracked, none is needed (`CODE_SIGNING_ALLOWED=NO`, `generic/
  platform=iOS Simulator`), and `Package.resolved` is untracked so it cannot
  break gate (b). `linkFlow.test.ts` lands in the jsdom `client` project, loads
  cleanly (only `vitest` is a static import) and fails per-test on the dynamic
  import — no zero-collection trap. `eslint.config.js:89-90` still exact.
- **Nit, optional:** Task 9's `git status -- app/ios` "must be empty" — that
  form prints five lines on a clean tree; Task 6 step 4's `--short` form is the
  one that reads empty.

### 2026-09-02 — Wave E PR1.75b native plan (DELTA pass 9, verifying pass 8's fixes)

Ninth consecutive verification pass. One REVISE, found by testing the surviving
universal rather than the two claims that triggered the previous pass.

- **CLAIM (pass 8's fix): the Swift header's citation rule now matches the code
  below it.** HALF TRUE. Pass 8 widened the rule where it is USED (the plugin
  header, four source categories) but not where it is ARGUED (Global Constraint
  `:41`, still three — missing "the vendored Capacitor sources by file:line",
  the category the `shouldOverrideLoad` comment leans on hardest), while REV 9's
  own summary claims the two "mirror ... exactly". And the universal is still
  falsified below it: `// shouldOverrideLoad(_:) is a WKNavigationDelegate
  callback, which UIKit already delivers on main` cites nothing, is the whole
  thread-confinement argument for the RF27 table's four fields, names the wrong
  framework (WebKit), and mis-describes a CAPPlugin method as a delegate callback
  (`WebViewDelegationHandler.swift:67` → `:82`). A PRIMARY line existed the whole
  time and the plan already uses the identical idiom one observation away:
  `WKNavigationDelegate.h:69-70` carries `WK_SWIFT_UI_ACTOR`, defined
  `= NS_SWIFT_UI_ACTOR` at `WKFoundation.h:60`. **Technique: when a pass RELAXES
  an absolute, run the check in BOTH directions — (a) the argued site and the
  used site must enumerate the SAME set, and (b) re-test the universal against
  every claim it governs, not only the ones that triggered the pass. Grepping for
  the absolute's WORDS finds instance (a); only enumerating the governed claims
  finds (b), and (b) is where the uncited premise lives.**
- **Technique added: a plan that predicts `format:check → green` is making a
  measurable claim about its own prescribed code.** Extract every prescribed
  source block to files and run the repo's own formatter over them. Measured
  here: four of six blocks fail `prettier --check` (pure 80-column re-wrapping,
  no literal or census phrase moves), so the gate as written goes red on
  verbatim paste.
- **Attacked and HELD:** the step-1 block RUN against a scratch copy pointed at
  the real `app/scripts` — 20 pre-existing `ok`, `fails=5`, the vacuous
  "exits non-zero" check green and the next check failing on the
  `No such file or directory` text, exactly as REV 9 states; `:246` is the
  summary-block anchor on the current 250-line file and the new block's
  `trap … EXIT` collides with nothing; `git status -- app/ios` prints 6 lines vs
  `--short`'s 0, at both live `--short` sites; the census guard at all three
  sites naming both tokens; the pass count EIGHT / REV 2–9 at both live sites;
  the fold recounted at 120 words / 24 longest (a naive `wc -w` reads 126 —
  it counts the bullet dashes); `94b83c84` confirmed as the commit before the
  plan file was added and an ancestor of HEAD; the `/tmp/pr175b-base` lifecycle
  and step 6b's placement; Task 5's gate order carrying no
  prerequisite-after-consumer; every walk-card citation verbatim
  (`index.ts:76`, `:126`, `:79-83`, `package.json:29,30`,
  `ios-release.sh:42-45`, `auth/routes.ts:101-106`); `no-non-null-assertion`
  absent from tseslint `recommended` (it is `strict`-only) and `app/scripts`
  already in `tsconfig.app.json`'s include, so the new contract test is not
  first-of-kind; `NATIVE_REDIRECT_URI` at `routes/concept2.ts:67` and the
  prescribed `LINK_CALLBACK_SCHEME` both matching the contract test's regexes;
  and `Concept2LinkProbe.test.tsx` loading cleanly (all imports static-safe,
  component and adapter both dynamic) with `toHaveBeenCalledExactlyOnceWith`
  already in use at `useMonitorSession.test.ts:9541`.
- **Nit, optional:** Task 4 step 4's RF5 sweep says "the ONLY surviving hits may
  be the two narrative sentences added in Task 3 steps 3-4"; the plan's own
  prescribed text leaves three grep lines in two files (plan `:1674`, `:1678`,
  `:1705`). The allowlist is defined by provenance, not the numeral, so nothing
  is wrongly deleted — but it is the same off-by-one class as passes 6 and 7.

### 2026-09-02 — Wave E PR1.75b native plan (DELTA pass 10, verifying pass 9's fixes)

Tenth consecutive verification pass. One REVISE, found by running the previous
pass's own token list against the sources it never re-measured.

- **CLAIM (pass 9's fix): the RF5 sweep now names its three surviving hit lines
  exactly.** FALSE — there are FIVE. Pass 9 corrected "two" to "three" by
  re-counting inside Task 3's own two files (`externalBrowser.ts`,
  `appLifecycle.ts`) and never ran the four-token list against the OTHER
  prescribed sources: Task 2 step 4's `linkFlow.ts` header and Task 4 step 3's
  `Concept2LinkProbe.tsx` doc comment each carry `useReturnToApp`. Since the
  step's escalation clause is absolute ("Any other hit is dead prose or a dead
  import: fix it here"), the sweep as written directs the implementer to strip
  two sentences the plan deliberately prescribes — including its own stated
  justification for the retirement. Settled by extracting every prescribed
  `app/src` fence to files and running the sweep command verbatim against them:
  5 lines, not 3.
  **Technique: a phrase list gets a "new prose must not reintroduce this token"
  GUARD at every site that writes prose, or its expected set goes stale at the
  next fold. The census phrases in this same plan carry that guard at three
  sites and never drifted; the RF5 token list carries none and drifted twice
  (passes 9 and 10). When a pass corrects a count, re-run the FULL token list
  against the FULL prescribed corpus — a count corrected in one file is not a
  count corrected.**
- **Technique added: plan-internal line citations cannot survive their own
  fold.** REV 10 cited the Global Constraint as `:41` and the Swift header as
  `:292-296`; prepending the REV 10 paragraph moved both by +2 in the same
  commit. Cite by provenance (Task/step/symbol), never by the plan's own line
  number.
- **Attacked and HELD:** the whole thread-confinement chain re-read in the
  iOS 26.5 SDK — `WKNavigationDelegate.h:69-70` (`WK_SWIFT_UI_ACTOR` on the
  protocol), `WKFoundation.h:59-60` (the `#ifdef` branch is live;
  `NS_SWIFT_UI_ACTOR` is defined at `NSObjCRuntime.h:253`), and
  `WebViewDelegationHandler.swift:7` conforming to `WKNavigationDelegate`, `:67`
  the `decidePolicyFor` handler, `:82` the `shouldOverrideLoad` call — every
  clause of the new comment accurate, including the framework attribution the
  previous version got wrong. Global Constraint and Swift header enumerate the
  SAME four source categories. Ten citations spot-checked verbatim:
  `ASWebAuthenticationSession.h:50-53,71,73-77,79-82,89-92,94-99` (typo "do
  not not share" reproduced faithfully), `CapacitorBridge.swift:348-365`
  (`plugins[…] = pluginInstance` at `:361`) and `:295-298`,
  `CAPPlugin+LoadInstance.swift:10-19`, `CAPBridgeViewController.swift:48-53`,
  `project.pbxproj:239,314,336`. `pnpm format` measured: `prettier --write .`
  over the whole `app/` tree, but `.prettierignore` excludes
  `ios`/`dist`/`drizzle` and `pnpm format:check` is green at `cdcfee41`, so the
  write cannot reach the scope gate. Pass count NINE / REV 2–10 consistent at
  both live sites. Design↔plan seam closed in both directions: every
  §0/§2/§4/§Testing/exit-4/6(a)/8 requirement mapped to a task (including §0's
  "one sentence" and its STOP branch, and all six §Testing `linkFlow`
  assertions), and all three scope-creep items carry a named rule.

### 2026-09-02 — Wave E PR1.75b native plan (DELTA pass 11, the whole-plan consistency lens)

Eleventh consecutive pass. Three REVISE, two of them the same class, and the class
survived ten passes because every one of them checked the plan's blocks with the
plan's own tools and never with the REPO's.

- **CLAIM: prescribed source blocks are paste-ready because a pass ran `prettier
  --check` over them.** FALSE for two of the three gates that actually run. Placed
  all six prescribed TS/TSX blocks at their real paths: `pnpm typecheck` dies with
  `TS2493` (the probe test's `mockLink` declares `vi.fn(async () => …)`, zero
  parameters, and a test three screens down does `api.mock.calls.filter(c => c[0]
  === …)`), and `pnpm lint` dies with `react-hooks/set-state-in-effect` on the
  probe component's `useEffect(() => { void readStatus(); })`, where `readStatus`
  is a `useCallback(async …)` that sets state. The plan's own sibling test file got
  the mock arity right twice; the repo's own established mount-fetch idiom
  (`WorkoutDetail.tsx:52`, `void f().then(cb)`) passes the lint rule where the
  `async`/`await` shape does not — isolated with a two-file A/B probe.
  **Technique: a plan that prescribes source blocks is making a claim about the
  repo's gates, not about its own prose. Extract every block to its REAL path and
  run `pnpm typecheck` and `pnpm lint`, not only `prettier --check` — formatting is
  the one gate that cannot fail on semantics. Then run the prescribed TESTS against
  the prescribed IMPLEMENTATION: 19/19, 11/11 and 4/4 green here, which is what
  makes the two red gates a paste-readiness defect rather than a design defect.**
  Corollary: when a lint fix changes a function's SHAPE (async/try -> then/catch),
  sweep the plan's mutation table — a row whose rationale is "`try {}` alone is a
  SyntaxError" is about the old shape.
- **CLAIM (pass 6's fix): the census's `appUrlOpen` expectation is correct.** TRUE
  where it is USED (the table, step 3b's permitted list, step 6b), FALSE where it
  is ARGUED — Task 1 step 4's rationale paragraph still reads "expected 0 under
  `app/src` and `app/ios`" while the plan's own prescribed Swift carries the hit.
  `git log -L` shows the line untouched since REV 2, five passes before the row was
  corrected. **Technique: CLAUDE.md's sweep rule runs in BOTH directions. Passes 8
  and 9 caught argued-fixed/used-stale; this is used-fixed/argued-stale, and the
  same `git log -L <line>,<line>` on the surviving sentence dates it instantly.**
- **Attacked and HELD:** all five of pass 10's folds (the RF5 five re-derived from
  the fences AND from every deletion range in the real tree; both token guards; zero
  bare plan-internal citations in Task 9, the five in the REV block being the quoted
  defect itself; RF19's three sub-claims — `vitest.config.ts:48`, one
  `PBXNativeTarget`, e2e-on-web; TEN / REV 2–11). Six recounts exact: prettier 4-of-6
  and precisely the four named; `browserFinished` = 52 split 3/1/1/14/33; 14 reject
  lines -> 14 fixed / 12 naive; fold 120/24; `fails=5` with the vacuous check green;
  RF5 = 5. **Every cell of the census table verified against a live run** — all
  twelve rows, all residual counts, no drift. The leader-strip red proof re-run
  corpus-wide: diff is exactly one line and `never a real link` survives. And
  CLAUDE.md's own `pnpm exec vitest run --project client <file>` footgun was
  called STALE here — **WRONG, corrected at #277's PM gate (2026-09-02):** the
  footgun is REAL and its mechanism is the dropped `NODE_OPTIONS=--no-experimental-webstorage`
  that `package.json`'s `test` script sets (the bare form produced 1582 false
  failures across client+unit against a green head; the two-file spot check
  passed by luck of file selection). The plan's uses carry the `NODE_OPTIONS=`
  prefix, which is why they were correct; the diagnosis ("jsdom loads, vitest 4")
  was not. `.claude/agent-briefing.md` already carried the right mechanism —
  a pass contradicted a standing in-repo rule and nobody grepped. **Nit: step 3b's example read-line says "all 19
  surviving `browserFinished` hits"; the table sums to 25.**

### 2026-09-02 — Wave E PR1.75b IMPLEMENTATION (lessons found by review, not by the 11 plan passes)

- **A WHATWG getter answers `""` where the reader assumed `null`.** The prescribed
  `linkFlow.ts` guarded `params.get("code") === null` for "no code"; `?code=`
  (an empty parameter, exactly what a `?error=access_denied&code=` decline can
  carry) yields `""`, skipped the guard, skipped the `declined` branch, and
  POSTed `{code: ""}` to `/exchange` — a rower's decline surfaced as a server
  400. It survived eleven antagonist passes because every pass parsed the
  happy-path callback and the absent-key callback, never the present-but-empty
  key. **Technique: for every `get()`/`params`/`searchParams` read, test three
  shapes — absent, empty, valued — and name which of `null`/`""` the code treats
  as "not there".** The sibling `?state=` read fails SAFE (an empty state is a
  mismatch, so the exchange is refused) and is recorded as untested.
- **A client constant compared only against itself, one seam over from the one
  that was cross-checked.** `LINK_CALLBACK_SCHEME` had both an independent
  literal pin and a server cross-check in the contract census;
  `LINK_CLIENT`, gating the same mint, had neither — the test asserted the
  posted body against the imported symbol. A one-character drift would 409
  every native mint. **Technique: when a census cross-checks one literal across
  two files, list every OTHER literal the same request carries and ask whether
  each has the same two pins.**
- **A mutation row whose fallback restores the original value.** The plan's row
  "exchange body `state` → `returnedState ?? state`" was meant to prove the
  exchange sends the MINT's state, not the callback's; but `??` falls back on
  nullish, and every test's callback either omits `state` (→ the mint's `state`,
  the original behaviour) or carries a matching one — so the mutant is a
  semantic no-op and the suite stays green. The row predicted a `null` that only
  the OTHER mutation (`state: returnedState`) produces; that form bit
  immediately. Anyone running the table mechanically logs a pass. **Technique:
  before trusting a mutation row, ask what value the mutant produces for EACH
  fixture the suite feeds it; a mutation that maps every fixture to the
  original output is not a mutation of the behaviour under test.**

### 2026-09-03 — Wave E PR2 client plan (harden Lens 1)

- **The spec's PRIMARY mapping branch was unreachable because the two PRs that
  own its halves each built the other's.** PR1 shipped `completed_at`/`tz`
  through the POST validator; no PR ever taught the client to POST them, so
  `buildC2Payload`'s accurate branch never fires and every Concept2 upload
  carries the SAVE clock. Both halves are tested; the seam has no test because
  no test starts upstream of the writer. **Technique: for any field a spec
  splits across PRs, grep the CLIENT tree for the field name before believing
  the server-side validator means the field arrives — `git grep "\btz\b" --
  src/` returning nothing outside tests settled it in one command. A validator
  is evidence that a field is ACCEPTED, never that it is SENT.**
- **A schema comment naming a future PR is a claim about that PR's scope, and
  nobody checks it when the PR is written.** `session_logs.tz`'s own comment
  said "posted at save from PR2 on"; PR2's plan never mentioned it. **Technique:
  when planning PR N, grep the repo for the PR's own name (`PR2`, `Wave E PR2`)
  — comments, spec bullets and ROADMAP clauses that assign work to it are
  requirements the plan must either schedule or explicitly decline.**
- **`??` is not a null-guard for a vendor string.** The identity line meant to
  discharge an account-injection residual renders blank on `username: ""`,
  because `fetchMe` passes the empty string through and `??` only catches
  nullish — one seam over from the `?code=` defect that taught this ledger the
  absent/empty/valued rule, and with a doc comment claiming "never an empty
  identity". **Technique: the absent/empty/valued triad applies to every
  vendor-supplied STRING that reaches a rendered surface, not just to URL
  params; and when a code comment claims a guarantee, feed the code the value
  the guarantee names and read the output.**
- **A retired lifecycle seam retires its justification too, and the surviving
  half of the reasoning goes unexamined.** `useReturnToApp` was deleted on
  "native resolves in a promise, web unloads" — true of native, and true of web
  only until the back-forward cache RESTORES the page instead of reloading it,
  at which point no mount runs and the card is frozen mid-attempt. **Technique:
  when a design says "the mount read reveals it", ask what re-mounts — and check
  for `pageshow`/bfcache eligibility by looking for `no-store` on the DOCUMENT
  and for any `unload` handler, both of which are one grep each.**
- **A capture whose seed has no supported producer.** A screenshot seeding
  `c2_result_id` cannot exist in a stack where the only writer of that column is
  a route that 403s. **Technique: for every "seed state X and capture" step,
  name the WRITER of X and confirm it is reachable in the environment the
  capture runs in; `git grep` the column name minus tests usually returns the
  single writer.**
- **`A && B || C` in a prescribed gate block reports C's exit status when A
  fails.** A red suite reads green. **Technique: run every prescribed shell
  block with a deliberately failing first command and read `$?`, or forbid
  `&&`/`||` chains in gate blocks outright — one command per line.**
- **Attacked and HELD:** all nine contrast figures recomputed independently from
  `tokens.css` (17.11 / 10.81 / 7.43 / 5.29 / 14.50 / 6.30 / 4.48 / 5.94 / 1.73
  — every one exact, including the `--ink-4`-on-sunken refusal); ruling (i)'s
  "the mint 400s without `weightClass`" and the sixteen-field `/users/me`
  measurement; ruling (ii)'s "both write sites already hold `me`"; the 409
  duplicate's write-before-respond and its readback through `db.select()`;
  `upsertLink` clearing `needsReauthAt` on every path; `api()` not throwing on
  non-2xx; the `busy` widening against the contract census (it parses case
  LABELS, not returns); the measured logbook origin; and every REASON string
  present in the Gate 0 amendment.

#### Lens 2 techniques (the same engagement, code-reader lens)

- **A gate can pin the wrong reader.** `webauth-contract.test.ts` holds the
  `GET /link` response equal to the DEV PROBE's interface, which no rower sees;
  the product reader is `normalizeLink`, and every test that touched it either
  hand-built the body or CAST the route's. Believed because the gate exists and
  is green. Settled by asking, of each gate, WHICH consumer it compares against
  — then renaming a key and watching the whole suite stay green while the card
  would render `account #2211` forever.
- **A fix that re-reads the wrong state.** The bfcache fix re-read the LINK,
  but the frozen panel is drawn from the ATTEMPT (`outcome`/`busy`), so it fixed
  only the case where the link succeeded and left the DECLINED case frozen
  exactly as before. Believed because the observation and the fix both said
  "re-read on restore". Settled by reading the JSX predicate that draws the
  stuck panel and asking which state it actually keys on.
- **An absent/empty/valued rule applied to one field and not its neighbour.**
  The plan WROTE the rule for `c2Username` and left `logbookBaseUrl` guarded on
  `typeof` alone, with `??` on the server env read — an empty origin builds a
  RELATIVE url that opens on our own domain. Settled by running the plan's own
  stated rule over every vendor string in the same response, mechanically, as a
  table.
- **A conjunction that hides one of its conjuncts.** The result id rendered
  inside `url !== null && resultId !== null`, so the deployment case that kills
  the link-out also killed the id — the evidence an earlier amendment change had
  just declared durable. Settled by asking, for each `&&` in a render guard,
  what each side can independently be false for.
- **"The block disappears" used for two different facts.** `unlinked` (a
  precondition lapsed) and `not_eligible` (the two predicates disagree) were
  folded into one state, so the divergence a whole seam test exists to catch
  would reach the rower as a control vanishing under their finger. Settled by
  reading each error code's PRODUCER and asking who is wrong when it fires.
- **A degraded field disabling the only control that reads it.** `normalizeLink`
  maps an unrecognised `weightClass` to `null`, and RECONNECT was wired to it
  alone — a permanently dead button under a failure message, on a card where
  every other failure carries a reason. Settled by tracing each normalizer's
  degrade path to the control that consumes the degraded value.
- **A client field that can cost a rower their row (TRIAD).** `POST /api/logs`
  400s on any `tz` outside the SERVER image's zone list; before PR2 no client
  sent the field, so the branch had never fired. Believed safe because the
  validator predates the producer. Settled by asking what happens the first time
  the field is actually sent, and by whom the disagreeing list is owned — ours.
  The route's own sibling (`checkCompletedAt` returning `{ok:true, value:null}`)
  already modelled the answer.
- **A "precedent" that is erased at runtime.** The cross-tree import cited
  `import type`, which compiles to nothing; the new imports are runtime ones and
  nothing in the repo resolved a `.js` specifier into `src/*.ts` at runtime.
  Settled by writing a one-line scratch test and running it — it DOES resolve,
  and the trap is that the specifier is relative to the FILE's directory, so the
  same string is right from `server/routes/` and wrong from `server/`.
- **A mutation hidden by a gate the covering scenario flips.** M21c targeted a
  panel rendered under `link.linked && unlinkFailed !== null`, and its scenario
  made `link.linked` false — so the mutant was invisible regardless. Settled by
  asking, for every probe, which RENDER CONDITION stands between the mutated
  state and the assertion, and whether the test's own scenario satisfies it.
