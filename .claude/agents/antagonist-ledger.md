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
  *deliberately diagonal* drag is refused by OUR OWN rule with the UA doing
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
