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
