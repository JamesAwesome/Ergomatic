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

- **"Making an optional field a required key valued `true | undefined` is
  byte-free, so nothing existing changes."** The bytes held under every
  serializer (`JSON.stringify`, drizzle's `jsonb.mapToDriverValue`, `pg`'s
  `prepareValue` — the last two both being `JSON.stringify` again), but four
  IN-MEMORY witnesses distinguish present-undefined from absent and one of
  them was a shipped test: `Object.keys`, `"k" in o`, `hasOwnProperty`, and
  vitest's `toStrictEqual`. For a "costs zero bytes" claim, enumerate the
  SERIALIZERS and the in-memory KEY WITNESSES separately, and re-point any
  proxy assertion at `JSON.stringify` output.
- **"`as const satisfies readonly (keyof T)[]` pins the field list against
  drift."** False in the direction that matters: `satisfies` on an array
  checks that each member is assignable, never that every union member
  appears; only `Record<keyof T, true>` errors (`TS2741`). To test an
  exhaustiveness pin, delete one member and run `tsc` — silence means
  decoration (RF21).
- **"`StoredLog` is structurally assignable to a domain input with every field
  REQUIRED, so the refactor is a call, not a mapping."** False on exactly one
  field, and it is the load-bearing one: `endedBy` is declared `endedBy?: … |
  null`, so TS2322 fires and the `steps`-tier gate's own input needs a `??
  null`. **Technique:** paste the spec's prescribed interface into a scratch
  file at a REAL path and run the project's tsc — and check WHICH tsconfig
  covers that path first (`tsconfig.json` here compiles no `src/` file at all;
  the probe silently passed until a deliberate `const bite: number = "x"`
  proved the file was never in the program).
- **"A structural text scan gates `no Concept2 dependency`."** The scan's own
  grep is case-sensitive and the module is `useConcept2Link` — a file importing
  it matches nothing. **Technique:** for any identifier-scan gate, take the
  REAL name of the thing it forbids, paste an import of it into a scratch file,
  and run the gate's literal command. The spec's own mutation named a module
  (`concept2Link`) that does not exist.

## Attacked and NOT broken

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

11. **A source-text count assertion counts the comments too.** `split("foo(")`
    over a `?raw` import sees every backticked `foo()` in a doc comment. Strip
    comments (or exclude backtick-preceded mentions) and RUN the count before
    writing the expected value — a plan that predicts the post-strip number
    while prescribing the raw form is telling you which one it reasoned about.
12. **When a signature narrows a collection to one element, grep the TESTS for
    the EMPTY and MULTI forms.** Production may only ever pass one; a test is
    where the degenerate case lives, and four `retire([], …)` calls were the
    only gate on a sweep the code's own comment calls "previously permanently
    unreachable".

13. **Ask whether the recorder is still OPEN at the line you are adding to it.**
    A diagnostic can be in lexical scope and still write nowhere: this repo's
    connection-attempt trace is drained into the session ring and `complete()`d
    partway through `connect()`, so a `trace?.record` added below that point
    reaches neither the ring nor the published snapshot — and is a no-op on
    every attempt that carried no trace. For any "records X through the same
    recorder as Y", find Y's line, find the recorder's CLOSE, and check which
    side of it your line is on.

14. **A derived type is not automatically a tighter type — probe which DIRECTION
    it gates.** `Pick<InferInsertModel<table>, …>` makes a nullable column
    OPTIONAL, so omitting it compiles, and `db.insert().values(input)` already
    refused an added/renamed/re-typed column under the hand-written type it
    replaces. The only case derivation catches that the old shape did not is a
    WIDENED column. Write the four schema changes out and run `tsc` on each;
    then apply RF33 literally — `Required<Pick<…>>` with `null` meaning absent.
15. **A migrator that never compares hashes silently accepts a DB that is AHEAD
    of its folder.** drizzle's `pg-core/dialect.js` reads only
    `max(created_at)` and applies anything newer, so "code rollback stays valid"
    after a migration has already run is TRUE — and provable in ninety seconds
    by migrating a throwaway container forward, then calling `migrate()` again
    with the OLD folder. Run it; do not reason about it.
16. **Find the file that OWNS the fact before prescribing an edit.** A rollback
    floor lives in `docs/RELEASING.md`'s table (which has a "Not a floor"
    precedent for exactly this case); `docs/deploy.md`'s sentence is a QUOTE of
    it, and had been stale for six table rows. Adding a new fact beside a stale
    quote is the partial-reconciliation failure.
17. **A date gate that never pins `TZ` is green by environment.** Nothing in
    `vitest.config.ts` or the workflows sets it, so Actions runs UTC and every
    `new Date("YYYY-MM-DD")`-plus-local-getter bug is invisible. Only pins on a
    week/season BOUNDARY day can move at all, and only at a non-zero offset.
18. **`Record<string, unknown>` assigns BOTH WAYS to an all-optional narrowed
    view.** The compiler is never the gate on a jsonb blob's values — find the
    runtime validator (here `validateMachineSummary`, the route, not the view)
    before crediting a type with the guard.
19. **A structural gate scoped to NEW directories cannot go red in the OLD file
    the change edits.** `You.tsx` already imports `Concept2Row`; the scan
    covered `src/you/stats/` and missed it.
20. **Ask which fixture the prescribed mutation can actually MOVE.** A spec
    named "swap the work-pair and steps gates" against a fixture with
    `workMeters: null` and a declining `endedBy` — nothing to reorder, result
    identical both ways. Read the fixture's fields, not its name.

21. **When a design MOVES a type into a shared tree, re-derive the seam claim
    from the tsconfig `include` lists and the existing import graph — never
    from the comment that predates the move.** `logs.ts`'s "server code never
    imports from `src/`" is true and stops covering the case the moment the
    shape lands in `domain/`: `tsconfig.server.json` includes `domain`, 27
    server files already import from it, and `concept2/mapping.ts` already
    imports the very module in question. "No compiler can cross this seam" is
    a claim about a build graph, so read the build graph.
22. **A normaliser applied to the SUBJECT of an assertion converts an oracle
    into a mirror; apply it only to the EXPECTED value.** Wrapping a store's
    OUTPUT in `JSON.parse(JSON.stringify(…))` makes the in-memory fake and
    real Postgres agree by construction on exactly the property the contract
    suite exists to compare. Wrap the constructed side; let the fake go red.
23. **Before believing "everything downstream re-serializes", grep for the
    in-memory FAKE of the store.** A fake that keeps the object it was handed
    is a consumer with no serializer between it and the caller.
24. **Postgres `jsonb` does not preserve object key order** (sorts by length
    then bytewise; measured on `postgres:18.4`). Any "the stored bytes are the
    bytes we sent" claim about a jsonb column is false; settle it with one
    `psql -c`.
25. **A payload assertion that depends on two derivations DIFFERING must
    assert that they differ.** Pin the divergence, or a capture swap silently
    retires every assertion beneath it (RF21).
26. **A mutation on a newly published field must be run in a file that
    INSTANTIATES the producer.** Before writing "both these files must go
    red", grep each for `renderHook`/the producer's own `doMock`: a screen
    test that builds its own `session` fixture, or that `vi.doMock`s the hook
    outright, sits downstream of the break and cannot fail for a change
    inside it. And when the fixture helper calls the SAME derive function the
    producer calls, every ported test is a mirror, not an oracle — the gate
    has to live where the producer runs.
27. **Classify a lifetime table's clear sites by their ENCLOSING FUNCTION
    with a script, not from memory.** Walking backward from each `grep -n`
    hit to the nearest `const X = useCallback(` moved four "cancel/teardown"
    sites to `handleEvent` ×2 / `teardown` / `fail` + `connect` — and
    `handleEvent` being an owner is the lifetime fact the table existed to
    surface (a mid-session drop marks the attempt cancelled).

## Things attacked and found sound

- The single-writer discipline on the run record, and its refusal to be
  re-derived.
- `verifyArmed` reading the machine's own state back rather than trusting an
  acknowledgement.
- One judgement call site, enforced by a census test, held across seven phases.
- The view layer deriving everything and storing nothing.

## Where the dated record lives

The per-engagement record — one section per engagement, in date order,
10015 lines of them — is `antagonist-ledger.md`. **Do not read it up front.**
Grep it for the detail behind an entry above, or for the history of a phase
you are about to touch; every citation elsewhere in this repo that names an
entry points there.

**To find what to grep for, list the record's sections first:**
`grep -n '^## ' .claude/agents/antagonist-ledger.md` — one line per
engagement, dated and named by phase. That index is the thing to scan; the
sections themselves are what you open.

**Propose every entry to BOTH files.** The durable line belongs here, under the
section it fits; the engagement record belongs there, as its own dated section.
An entry that lands only in the record is invisible to the next agent — which
is exactly what happened: every section in this file stopped growing on
2026-08-15, while the record beneath it reached 10015 lines.
