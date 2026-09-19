# Antagonist ledger

Claims this project believed that turned out false, and **the technique that
settled each**. Read by the `antagonist` agent before every engagement.

The techniques are the durable part. The next antagonist should inherit a
toolkit, not a history.

## Falsified claims, and how

- **An exact-selection API can inherit a lossy changed-path producer.** Trace
  Git bytes through the vendor VCS adapter into dependency matching; commit
  Unicode/newline filenames and assert selected identities. NUL-safe source
  fingerprints cannot repair a separate producer that splits quoted Git output
  on newlines. Exercise both rename endpoints and global config inputs too.

- **Process cleanup is not staged-edit restoration.** Hold the actual vendor
  restore operation across the owner's escalation deadline, then inspect the
  index/worktree and backup. A disappeared process can leave edits hidden;
  preserve the first cancellation cause alongside the restoration diagnostic.

- **A wrapper's lifetime is not its descendants' or its vendor session's
  lifetime.** Trace actual spawn and cleanup call sites: Playwright detaches
  browsers and can force-kill them during cleanup; Testcontainers can reuse
  one Ryuk session across unrelated clients. Gate crashes before registration,
  concurrent nested work, competing recoverers, and foreign resources sharing
  vendor labels. A sampled PID/start pair is an observation, not an
  identity-bound signaling handle.

- **Performance advice is entry-point-specific.** Trace where an option
  takes effect relative to expensive work, then measure the phases: axe
  `resultTypes` prunes before serialization under `run`, but after eager raw
  serialization under `runPartial`. A native fast path may have a coverage
  restriction; give its fallback an independent real-boundary witness.

- **A native logger unit test can prove the sink while missing the bridge that selects it.** For a Console override, drive `console.*` inside the loaded production WKWebView and capture process stdout; in the same host, send a forbidden synthetic result through native `toJs` and JavaScript `fromNative`. Read the no-callback error branch too: it can call patched `console.warn` even when generic logging is disabled. A prebuilt framework’s `#if DEBUG` was evaluated when that framework was built; changing the app configuration cannot change it. Inspect the exact platform slice and built app plist before using that getter as an app-build oracle.

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

- **A native test report is not the whole-command verdict; an invocation
  is not one worker lifetime.** Trace reporter finalization through later
  coverage/global-error producers, repeat hashes and detached browser
  launches. Pin passing assertions plus command failure, and a detached
  descendant beside an unrelated sentinel. Trace one fresh evidence root
  through producer/checker/summary/upload; exercise stale or missing output
  and ensure publication runs even when command or evidence fails.

- **Transcribe a wire field's enum from the document that DEFINES the field,
  not from a sibling vendor document that also contains it.** Concept2 ships
  two: PM5 BLE Interface Definition rev 1.30 (revision history: "Added Erg
  Machine Type parameter to characteristic 0x0032/0x0038") and PM5 CSAFE
  Communication Definition rev 0.27. Their `OBJ_ERGMACHINETYPE_T` agree on all
  23 values and 22 of 23 names, and disagree on exactly one:
  `SLIDES_DYNAMIC = 32` versus `LINKED_DYNAMIC = 32`. **Diff the two enums
  mechanically before storing any name** — one divergence in twenty-three is
  invisible to spot-checking, and it was the value the transcription pinned.
- **A spot-checked transcription table is the rule's half-application (RF34);
  prove it with a typo mutation on an UNPINNED row.** Corrupt one capital in a
  row nobody asserted (`MULTIERG_SKI` -> `MULTIERG_SKl`) and delete another
  outright; a green suite means "the vendor's own token" is untested for every
  unpinned value. The cheap deterministic close is a string-literal union on
  the map's value type — `pnpm typecheck` then names the typo and suggests the
  fix, covering every row with no new test. Only the exhaustive `it.each`
  table catches a DROPPED row, so do both.
- **"A new X per attempt against the SAME Y" is a lifetime claim: count the
  construction sites before rejecting an option on it.**
  `grep -rn "createPm5Driver(\|createEventLog(" app/src | grep -v test`
  returned one apiece, 94 lines apart in one block — so the reconnect scenario
  a design option was rejected on cannot occur. A rejected option's stated
  cost carries the evidence bar of the chosen one (RF30), and a false one is
  still false when the chosen option happens to be right.
- **Prove a test is order-sensitive by writing the WRONG order against the
  restored bug.** Restoring the defect AND reordering the two frames made
  every assertion pass, while the shipped order went red — which turns "the
  obvious test would be decoration" from rhetoric into a measurement a
  reviewer can re-run.
- **A replay test that releases its tx barriers can still prove an rx-ordering
  claim — count what the driver received, do not infer it either way.**
  Wrapping `transport.subscribe` to tally callbacks showed all 174x3 status
  frames delivered under `barrierTimeoutMs: 1`, with seven tx divergences,
  because `transports/replay.ts`'s `run()` pushes a divergence and CONTINUES
  rather than aborting. Read the loop, then count.

- **An access check after session resolution can refresh the credential it denies.** Put policy before expiry extension; enumerate direct resolver consumers and the losing credential in bearer/cookie precedence.
- **A pending-new identity can become an existing account at conflict resolution.** Check the candidate before creation and the canonical row returned by the conflict path before grants or sessions. The pending provider email no longer owns access once a subject winner exists.
- **A live original-session foreign key proves liveness, not current entitlement.** Trace every attempt transition through its original-session resolver and apply current account policy before advancement.
- **Boot proves configuration shape, not provider registration.** Presence, syntax and bounds are locally checkable; account-console association and credential acceptance require a real provider exchange.

- **A failed CAS can still erase the winner in its catch.** Hold two supported callbacks after they read the same authorization stage; let one commit, then release the loser and inspect the real row after cleanup. Apple auth's version guard rejected correctly while ID-only failure cleanup deleted the winner's pending credential. Trace ownership through the exception path, and through every await in client cancellation.
- **A plugin with no logging calls can still log its whole credential through the bridge.** Follow `call.resolve` into native serialization and JavaScript `fromNative`, then run the vendor bridge with the actual build's logging configuration; a plugin-only forbidden-string test cannot gate that producer. Native authorization identity also does not prove JavaScript document identity.

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

28. **A text grep offered as an exit oracle measures a SPELLING, not an
    invariant — drop a decoy declaration in and watch it stay silent.** Phase
    MD's "no second declaration of the sample shape survives" gate greps
    `r\??: true`; a decoy interface spelling the flag `rest?: true` under
    `src/monitor/` left the count at exactly 3. What actually held was
    structural (a `-readonly [K in keyof Sample]` mapped type and a `Pick`),
    so cite the derivation, not the grep.
29. **When a census's numbers rest on an intermediate artifact that was not
    committed, re-derive them from the document's own method BEFORE citing
    them at a phase exit.** Exploration B's 109/8/59 states two incompatible
    core boundaries in one file; the two readings give 161/8/101 and 80/8/40.
    The 8/8 row and the ~half-unique conclusion reproduce under both, so the
    decision was safe and the figures are not quotable — which is the
    distinction to report.
30. **A refactor's capture-before contract is only as good as its TIER COVERAGE
    — enumerate the fixtures by the branch each one LANDS ON, not by its name.**
    Six "one per tier" fixtures covered machine ×2, work-pair ×2, stored ×2 and
    the `steps` tier ZERO times — the one branch with a nullable field and a
    hand-written key mapping (RF33). The tell: a fixture named for a tier it
    only reaches under the mutation.
31. **A zone pinned to the DEVELOPER'S OWN zone is green by environment twice
    over** — the "did the pin take" assertion is vacuous locally, and any
    Node-side `new Date("…T09:00:00")` or `resolvedOptions().timeZone` parses in
    the RUNNER's zone while `test.use({timezoneId})` only moves the BROWSER.
    Recompute the expected instant under UTC before believing a local pass.
32. **Diff the prescribed CSS class list against the prescribed JSX.** Rules
    with no element (`.stats-legend-row`, `.stats-legend-pct`) are invisible to
    jsdom, to `textContent` assertions, and to the a11y sweep — only a capture
    sees them. RF5 in the other direction.
33. **Lens 2 — the zero-total surface.** When a chart's layout function
    handles `total = 0` by returning `[]`, render the SURFACE with ≥ 2 rows
    whose summed field is all-null and read what the rower sees: PS PR 1's bar
    and legend both rendered EMPTY with a caption underneath, while every unit
    test of the layout was green. The unit is right; the seam above it has no
    sentence for "rows, but nothing to draw".
34. **Lens 2 — a hand-rolled input map beside the ONE builder.** Grep every
    test for the field-by-field `?? null` mapping the domain builder exists to
    own; a test that maps by hand cannot see the builder's key-rename
    mutation.
35. **Lens 2 — `page.goto` after a delete proves reload, not remount.** A "no
    cache outlives the screen" invariant needs one same-document leg.
36. **A "no write in flight" guard is a liveness check on a shared slot, not
    an ordering proof.** `pendingWrites.size > 0` cannot tell a GET that
    predates a write from one that postdates it — a write that SETTLES before
    the slow GET resolves empties the slot and the stale response is applied.
    Ask what VALUE makes the ordering decidable (an epoch we increment and
    sample at issue time) before accepting any size/emptiness guard, and check
    whether the design newly lets a write start while a GET is in flight.
37. **A gate that waits for a condition is vacuous once a cache makes that
    condition true at first render — check the path the gate EXISTS for.**
    News's scroll restore waits on `contentSettled`; every mount it serves
    (BACK from Reader) is warm, so the wait never waits. Name the mount the
    gate is for, then ask whether the new fast path is that exact mount.
38. **A per-account clear placed on the sign-out BUTTON misses the 401 path.**
    `useMe`'s non-OK arm signs out without calling `signOut()`, and native
    sign-in re-enters the same document — so unkeyed module state crosses
    accounts. The repo already bounded one instance of this by KEYING the fact
    to `user.id` (`You.tsx`'s `clearConcept2Seen`); an unkeyed cache inherits
    the gap without the bound.
39. **When a spec cites the numbers ON an approved artboard, extract the
    artboard's own text nodes and diff them against the spec's sentence.**
    PS §5 said week bars "carry their value label when non-zero (A3: 10,000,
    13,000, 2,000)"; A3's week SVG holds exactly two bar labels and the cited
    `10,000` is a GRIDLINE TICK (`build.mjs`: `cur || i === maxI`). A spec
    generalises a RULE from a rendered FRAME and the rule is usually wider
    than the frame.
40. **A hand-drawn artboard is not a call of the primitive it claims.** PS §5
    said the trend axis is `chooseTicks(kind: "pace")`; `chooseTicks(domain,
    count)` takes no kind, `niceNum` admits only 1/2/5/10×10^k so the
    artboard's 4-second step is unreachable, and `formatTick(v,"pace")`
    prints `1:55.0` where the artboard's `.slice(0,-2)` printed `1:54`. Run
    the primitive on the artboard's own domain before believing "drawn on X".
41. **Check that a card's figures come from ONE row set.** PS's approved A5
    shows a season curve labelled `18,000 TODAY` beside `AVG M/DAY 319` under
    a caption reading `NOT FILTERED`: the builder passed the FILTERED set to
    the curve and the unfiltered one to the tile. RF7, applied to two
    mechanisms in one frame rather than to one headline.
42. **List the fixture's dates against every BOUNDARY the code computes, not
    against the rule the boundary implements.** Not one of PS's 13 seed rows
    sits on any preset's `from` or `to` (newest 09-11 vs today 09-12), so
    every inclusive/exclusive off-by-one above `inRange` is invisible to the
    whole reference fixture — while `inRange` itself is pinned. And ask which
    pins a convention bug CANNOT move: the metres/week series moves under
    Sunday-start; the 3/3 streak does not.
43. **`role="img"` PRUNES the text inside an SVG — the `aria-label` is the
    only thing assistive tech hears.** Diff the label against the MARKS: a
    sibling `<text>` is not a word in the label, so a label built from raw
    values told a screen reader `0` for a week the chart drew as OUT OF
    RANGE (PS PR 2 plan, `WeekBarsChart`). `StackedBar`'s `aria-hidden` +
    real-text legend is the safe shape; rulings 18/19 had removed the text
    carrier and nobody re-asked what the SVG said.
44. **Apply a convention mutation at EVERY call site before declaring a
    fixture unmoved.** Sunday-start "broke" PS's fixture (b) until
    `streakOf`'s own `thisWeek` was mutated too — then (b) read `{3, 4}` both
    ways and three of the four `streakOf` pins moved instead. A half-applied
    mutant is RF35's mirror: the gate you credit is the one the mutation
    never reached.
45. **Run every pure numeric helper on `NaN` and `Infinity` under `timeout`,
    not only on 0.** An unbounded `for (;;)` ladder whose exit test is
    `x <= n` never exits on NaN, and the render thread hangs — `niceMax`
    (Phase PS PR 2 plan, 2026-09-13) did exactly that; pins at 0 and 1000
    were green. Exit 124 is the finding; "unreachable through the routes" is
    the severity, not the verdict.

## Things attacked and found sound

- The single-writer discipline on the run record, and its refusal to be
  re-derived.
- `verifyArmed` reading the machine's own state back rather than trusting an
  acknowledgement.
- One judgement call site, enforced by a census test, held across seven phases.
- The view layer deriving everything and storing nothing.

- **A live stored session does not prove the callback browser still holds it.**
  Apple `form_post` crosses sites while the ordinary session is `SameSite=Lax`.
  Trace credentials across each redirect method; require same-origin finalization
  to compare the current session with the original operation's session.
- **An exact callback route can still be unreachable.** Trace middleware order
  and parser selection before the handler: a global foreign-origin rejection and
  JSON-only parsing stop Apple's form POST before any state check can run.

- **A navigation request is not a permanent route invariant.** After an auth result, click the next ordinary tab through the real router. A terminal `/you` destination coupled to pathname changes sent Library straight back to You; a test stopping at the result screen missed it. This is the confirmed ordinary finding from the interrupted Apple code lens (2026-09-13); no completed review PASS is implied.

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

46. **A vendor sentence opening with `If you don't have…` licenses the CASE, not
    the rule — and check whether the doc prescribes a FALLBACK inside that case.**
    TN3194's "you must still fulfill the user's account deletion request" is
    conditioned on holding no refresh token, access token or authorization code —
    the opposite of our situation — and Apple's response to that condition is a
    three-step manual path ending "Direct the user to manually revoke access for
    your client", not an exemption. RF16's third corollary, measured on a
    compliance argument: quote the FULL paragraph AND the list that follows the
    colon, because that is where the obligation lives.
47. **"Reuses the existing X" is a claim about CHECK constraints, not vocabulary
    — paste the row the design implies into the real DDL.** A deletion
    confirmation "reusing the reauth stage" was refused three ways against
    migration 0031: `purpose='delete'` violates `auth_attempts_purpose_check`;
    the honest shape (existing = target) violates `auth_attempts_session_check`;
    the only insertable row is a lie. A reuse claim that needs a migration is a
    SECOND stored shape, and TRIAD scoping will have missed it.
48. **An unqualified `FOR UPDATE` over a JOIN locks every table in the FROM list
    — that is a lock ORDER, and a new `DELETE FROM parent` enters it backwards.**
    `SELECT … FROM sessions INNER JOIN users … FOR UPDATE` takes sessions then
    users; a delete transaction touching the parent first deadlocks 40P01 with
    the AUTH transaction as victim. When a module carries a lock-order rule in a
    COMMENT, a new writer inherits it — grep for the comment before adding one.
49. **An "anonymous" row holding a live credential is pseudonymous, and the
    anonymity is usually what breaks the deterministic guard.** A revocation
    tombstone stripped of the Apple subject cannot ask
    `SELECT 1 FROM users WHERE apple_sub = $1` — the exact question that settles
    its own named re-registration hazard — so it substitutes a bounded window: a
    heuristic wearing a number. **Ask what the erased field would have DECIDED
    before crediting the erasure.**
50. **A per-surface client id means a per-surface CREDENTIAL — read the PK, not
    the prose.** `apple_grants` is keyed `(user_id, client_id)` and boot refuses
    `nativeClientId === webClientId`, so a phone-and-web rower holds TWO live
    refresh tokens. Any singular "read the grant" is one credential short.
51. **A design's own stated principle is a grep.** "Holding a live refresh token
    for a provider the rower just detached is the inconsistency this avoids"
    governed three credentials and the spec touched one. RF34 applied to a
    sentence rather than a function.
52. **A lock-ORDER claim is about the whole transaction, so read its FIRST
    statement, not the commented one.** A prescribed "sessions before users"
    was inert: `bound()` -> `original()` runs an unqualified `FOR UPDATE` over
    `sessions INNER JOIN users` before either ordered statement, so `users` was
    already held. Measured on postgres:18.4 with TWO live sessions: both orders
    deadlock a concurrent `original()`, auth as victim (40P01) — and the plan's
    swap-the-order mutation therefore could not go red (RF21). Build the
    acquisition list from the CALL GRAPH, and check whether the prescribed
    test's holder takes a lock the subject already holds, or no cycle is
    possible in either direction. **A concurrency test seeded with ONE of the
    thing it contends over proves nothing.**
53. **`ON CONFLICT DO UPDATE` that leaves the FK column unchanged takes NO lock
    on the parent, so `FOR UPDATE` on the parent does not serialize writes to
    the child.** Postgres skips the RI check when the referencing key is
    unmodified. Measured: a concurrent `grant()` refreshed
    `apple_grants.refresh_token` straight through a delete transaction's
    `users FOR UPDATE`; the post-commit revoke then sent the STALE token, Apple
    answered 200 ("or was previously invalid"), and the success flag reported
    true over a live credential. For any "read it under the parent lock, the
    cascade cleans up" claim, replace the read with `DELETE ... RETURNING` and
    measure — the delete blocks and returns the NEW value, the SELECT does not.
54. **A CHECK constraint cannot fail a cascade DELETE, so it cannot inject the
    write failure an RF25 gate needs.** A prescribed test added
    `CHECK (token_hash <> 'x')` to a child table to make a delete transaction
    fatal; `DELETE FROM users` cascaded cleanly (rowCount=1) and
    `assert.rejects` got no rejection. Use a `BEFORE DELETE` trigger that
    RAISEs. Run any fault-injection block as written before the plan ships it:
    a gate that cannot go GREEN sends the implementer to invent an unreviewed
    substitute for the invariant the plan headlines.
55. **Widening a SHARED union type breaks consumers a scoped typecheck cannot
    see.** Adding a member to `AuthStep` in `shared/` compiled clean under
    `tsc -p tsconfig.server.json`, and broke the CLIENT: `acceptStep()` reads
    `step.stage` on a union narrowed only by earlier early-returns, so a member
    without `.stage` is `TS2339`. When a paste-test covers one project of a
    multi-project build, its silence covers only that project — say which one
    ran, and run the others over any `shared/` edit.
56. **"Mount the router" is a claim about which OBJECT is mounted.** A factory
    returning `{...routes, attempts, close}` exposes exactly one `router`, and
    the app mounts that one value; a second router constructed beside it and
    never merged is a 404 in production with every unit test green. Follow the
    value from the factory's return to the `app.use()` call before believing
    any route exists — and require ONE test that reaches it over HTTP, because
    tests calling the store directly cannot see the gap.
57. **"The machine does not report X" is a claim about ONE FIELD; ask whether
    it reports X's COMPONENTS and whether we already store them.** The
    number-provenance spec concluded a session wall clock is "asserted on the
    machine's behalf" from 0x0039 being work-only — while §27.3's own table two
    subsections down carries per-interval rest time `[12..13]`, which we store
    as `storedSummary.ts`'s `machineRestSeconds` and already transmit to
    Concept2 as `rest_time`. Measured on
    `walk-2026-08-25/rests-finished-recording.jsonl.gz`: work-only 254.8 s +
    machine rest 120 s = 374.8 s against a host wall clock of 374.76 s. Grep
    the stored shape for the field before writing "we would have to invent
    this".
58. **A "the rower might do X" failure mode needs a mechanism by which the
    rower CAN do X.** The same spec rejected a wall-clock axis because "the
    rower rests longer than the program says, the ordinary case at a real erg".
    A PM5 fixed rest is a machine-run countdown (measured 59.5 s and 59.0 s of
    host wall clock against 60 s programmed) and `commands.ts:29-31` never
    emits undefined rest (`docs/monitor/undefined-rest.md`: "We do NOT support
    it at any layer"), so the rower has no mechanism to extend one. The real
    failure mode was elsewhere and larger — see 59.
59. **Replay the JUST ROW capture before generalising any clock claim.**
    `walk-2026-08-31-justrow`: at the rower's stop, 104.63 s of host wall clock
    passed while the PM5's elapsed advanced 1.69 s, frozen at exactly
    185.81/656.7 for 104 consecutive frames — the row ran 499.52 s wall against
    393.58 s elapsed, a 26.9 % gap. A free row has no program, no steps
    (`server/concept2/intervals.ts:27`) and no rest-marked samples, so the
    pause is invisible to the series, to the rest bands and to any
    program-derived reconstruction — and `traceModel.ts`'s gap break does not
    fire on 1.69 s, so the trace line is drawn CONTINUOUS across it. The free
    row is the worst case for every session-clock design, not the edge case.
60. **A gutter that clips at the corrected metric usually clipped at the
    assumed one too — run the arithmetic BOTH ways before naming the
    mechanism.** A spec pinned a live axis clip on a 5 % per-glyph advance
    error (5.94 measured vs ~5.67 assumed). At the assumed 5.67 a seven-glyph
    label still needs 39.69 into a 38-unit gutter. The mechanism is GLYPH
    COUNT, not advance, and the fix follows from the invariant, never from the
    measurement that motivated it.
61. **`document.fonts.check(...)` returns TRUE for a family that does not
    exist**, and a monospace fallback measures the same ~0.6 em advance — so
    neither a `check()` nor a per-glyph measurement can identify the face.
    Measured: a fabricated family returned `true`, and a deliberately
    Plex-free `ui-monospace` control measured `perGlyph = 5.942`, identical to
    the real one. Any "the intended font IS drawing it" claim needs a metric
    the fallback does not share, or it is untagged inference.
62. **jsdom has no layout engine: `getBBox`/`getComputedTextLength` are
    `undefined` and `getBoundingClientRect()` returns a zero rect.** Any
    prescribed "assert the label's own box" gate in the `client` project is
    RF21's purest form — `expect(box.x >= 0)` passes forever on 0. Name the
    layer (Playwright e2e) in the plan, or the implementer invents an
    un-reddenable substitute.
63. **A gate prescribed as "build the row the seed does not have" is a claim
    about the seed — open it.** `domain/stats/gate0Seed.ts:28` already IS a
    stored-tier pm5 row carrying 6,240 m, and `StatsScreen.test.tsx:292`
    already asserts it beside `AVG WATTS —`. The prescribed gate would have
    passed identically before and after the fix, because the behaviour is
    deliberate and mutation-pinned (`aggregate.test.ts:44-51`); what needed a
    gate was the ABSENCE OF THE EXPLANATION.
64. **A member whose "agrees when" clause offers two options usually spans two
    RISK MODELS — so a PR table written before a design gate assigns a risk
    model to a decision nobody has made.** "The tile says it is ours" is copy;
    "the tile reads the same source the column does" moves a number. Diff each
    member's options against its PR row's risk model before the table is
    believed.

65. **A CHECK constraint is not the authority on which rows a state machine
    admits — find the module's own consistency predicate and run the row
    through it.** Wave A PR2's plan proved `auth_attempts_session_check` and
    `auth_attempts_stage_check` admit `purpose='signin'` at `stage='reauth_*'`
    and concluded "no migration". True and irrelevant: `attempts.ts`'s
    `consistent()` refuses it at `(a.purpose === "signin") !== signup`, and it
    is called by BOTH `load()` and `save()`, so the read path and the write
    path each reject it. Measured on `postgres:18.4`, one row, three stages,
    nothing else varied: `confirm` reads OK, `reauth_authorize` and
    `reauth_exchanging` both throw `attempt_expired`.
66. **A column a CHECK forces NULL is still being READ — grep the `!`
    assertions over it before calling it unused.** The same plan said a signin
    attempt "may not record which provider the rower is about to prove. It does
    not need to." `attemptProvider()` is
    `a.stage.startsWith("reauth_") ? a.existingProvider! : a.targetProvider`,
    so it returns `null` for exactly that row — and the web callback's own
    `attemptProvider(a) !== provider` guard then rejects BOTH providers with
    `invalid_proof`. Enumerate every read of the forced-NULL column and sort
    them into null-safe (`IS NOT DISTINCT FROM`, `if (x)`, `===`) and
    asserting (`x!`); the asserting ones are the design's real cost.
67. **A confirmation screen is a control only if the ACCOUNT OWNER is the one
    reading it — name the reader, not the screen.** Moving a link confirmation
    before the second authentication satisfies "the confirmation names the
    provider and the address" and voids its function, because the threat model
    the control exists for (a per-client secret collapses the attack to one
    device, two people) puts the attacker in front of it. Ask who is holding
    the phone at each screen before crediting any confirmation.
68. **Two clocks guarding one lifetime: prove the new one can bite before the
    old one.** A carried identity gated by both `expires_at` (never refreshed)
    and a fresh `reauthenticated_at` is gated by `expires_at` alone —
    `reauthenticated_at >= exchange time` makes its window strictly wider, so
    its check can never fire first, and the test prescribed for it ("proved
    more than ttl ago, expires_at still in the future") describes a state the
    design cannot produce. RF21, applied to a redundant timer instead of an
    assertion.
69. **RFC 9700 contains NO account-linking section — a repo that cites it
    correctly four times will transfer its authority to a fifth claim it does
    not support.** Measured: 2569 lines, `grep -ci linking` = 0, the four
    `account` hits are all "take into account", §4's TOC runs 4.1-4.17 with
    nothing on linking. The real primary is NIST SP 800-63C-4 §3.8.1 ("the RP
    SHALL require an authenticated session with the subscriber account for all
    linking functions"), plus Sudhodanan & Paverd, USENIX Security 2022, for
    the attack. Neither addresses CONSENT ORDERING — that is a genuine
    nothing-found and therefore a judgment call, not a citable one. RF16's
    second corollary: download the document and grep it before inheriting a
    peer artifact's confident phrasing (technique 10).
70. **"Function X works unchanged" is a claim about X's CALLERS, not about X.**
    Wave A PR2's design turned on `finalize()` needing no edit, and it does not
    — every precondition in its body is satisfiable. But its second argument is
    `req.sessionId` behind `requireUser`, and no route could hand the client a
    session while keeping the attempt alive: the callback's attempt-surviving
    branch never sets the session cookie, the shared `result()` returns one or
    the other, the client nulls the operation on `outcome === "signed_in"`, and
    the wire union makes `SignedIn` and `link_ready` mutually exclusive members.
    **Trace every parameter of the "unchanged" function back to the request
    field that fills it, and find the code that puts it there** — a
    falsification test scoped to the store certifies a narrower claim than the
    plan is making, and passes.
71. **Widening a predicate that cross-checks TWO enums: run every value of the
    OTHER enum through the widened form before believing it.** `consistent()`'s
    first clause is `(purpose === "signin") !== stageIsSignup` — an EQUALITY, so
    "add three stages so signin may sit there" also refuses link and delete at
    those stages, and a stage-keyed `verified` requirement refuses rows the
    producer inserts with those columns NULL. Extract the predicate verbatim,
    build one row per (purpose x stage) pair the producer can actually emit, and
    print a three-column before/naive/intended table. Measured: the literal
    wording broke every link and every delete at its starting stage, and every
    probe the plan prescribed entered on a signin row (RF24).
72. **A "the client does X unconditionally" finding is about a CALL SITE, not a
    branch — grep the function name before prescribing the fix.** Wave A PR2's
    revision 4 correctly found `acceptStep`'s unconditional `finalizeLink`
    (`authFlow.ts:477`) and prescribed qualifying that branch;
    `grep -n "finalizeLink("` returns a SECOND site at `:553` inside
    `authorizeNative`, which runs BEFORE the `acceptStep` call on `:558` and is
    the native surface's only route. The prescribed fix would have left the
    primary surface defeating the ruling with every server test green.
73. **Widening a `shared/` union member proves nothing about the CONSUMER —
    paste-test both projects and read which one is silent.** Adding required
    `profile` + `session` to `AuthStep`'s `link_ready` member broke exactly one
    producer (`frontDoorRoutes.ts:121`, TS2322) and produced ZERO output from
    `tsc -b`. So "one declaration both sides compile against, so a renamed
    field is a build error" (RF33) is true for the writer and FALSE for the
    reader — and the reader was the half that had to store a native token and
    refetch `me`. Technique 55's mirror: there the silent project was the
    client because only the server was checked; here both were checked and the
    client is silent by construction.
74. **When a design MOVES a confirmation later in a bounded window, the
    window's own field becomes a decision — name it, or the plan is silent on
    whether the feature works at a rower's pace.** PR2 moved the confirm after
    the proof inside a 300 s `expires_at`; the plan pinned `expires_at` as
    unchanged in one task and said nothing in the other, while the sibling arm
    it copies (`accept()`'s reauth branch) DOES refresh it. Both answers have
    consequences; neither was stated.
75. **A census a plan pins a test to is a number — run it.** "Five user-facing
    strings, two quoted and three not" measured as two quoted and FOUR
    unquoted, plus a THIRD treatment ("the You tab") in live UI and three
    undated article bodies the step never mentions. Strip comments before
    counting: half the grep hits for a screen name in this repo are rationale
    prose.
76. **A merge-conflict marker is a defect NO gate in this repo could see, and
    it reached main in the agent instructions themselves.** PR #446 landed
    `<<<<<<< HEAD` / `=======` / `>>>>>>> origin/main` in
    `antagonist-techniques.md`, `antagonist-ledger.md` and `pm-ledger.md`:
    `.claude/` paths, so `ci-changes.sh` correctly skipped app/docker/e2e;
    lint-staged's globs are `app/**`, so no formatter opened them; prose, so
    no compiler or test could. **Where the conflict is in a NUMBERED list,
    both sides usually appended from the same integer** — in
    `antagonist-techniques.md` both began at 57 — so the resolution is to keep
    both and renumber one, never to pick. `scripts/conflict-markers.sh` is now
    the gate.
77. **RENUMBERING A LIST IS A CLAIM ABOUT EVERY CITATION OF THE OLD NUMBERS,
    AND THE CITATIONS LIVE IN A DIFFERENT FILE FROM THE LIST.** The fix for 76
    renumbered seven entries 57-63 to 65-71 in `antagonist-techniques.md` and
    swept nothing; the eight stale citations were in `antagonist-ledger.md`,
    inside its own Wave A PR2 entry, and each then resolved to an unrelated
    technique — a record citing seven wrong techniques about itself, shipped.
    **The check has to be case-insensitive, plural-tolerant and repo-wide**,
    because this corpus writes them at least four ways — `technique 57`,
    `Technique 58`, `TECHNIQUE 1`, `Techniques 43-44`:
    `grep -rniE 'technique[s]? ?#?(<old range>)' --include='*.md' .`
    A `grep -nE '[Tt]echnique …' .claude/agents/*.md` misses the ALL-CAPS and
    plural-range forms that are already in the very file it targets, and
    scopes out `docs/`, `.agents/`, `ROADMAP.md` and `CLAUDE.md` entirely.
    It is RF16's correct-it-where-it-is-USED rule with an integer instead of a
    phrase, and an integer is worse, because a wrong number still resolves to
    something that reads like evidence.
78. **Follow every native failure channel before claiming no recovery.** A
    runner can reject a promise, return an Error status, lose its parent
    process, or lose only an inner thread. Kill the actual execution unit in
    the fixture and observe the next queued witness. Measured on Stryker10 /
    Vitest4.1.11: the parent-process probe passed while a thread-only exit
    became RuntimeError and four later bodies ran (8bafc6ba). With two witnesses
    it became five Killed results (bce04c94). A final-result latch is too late
    when the inner queue has already advanced; startup death also needs a
    channel that does not await the runner's handshake or final reporter.
79. **Compare requested paths with the runner's effective population.** A
    canonical file can still belong to a vendor's unconditional ignore set.
    Use one valid plus one excluded source/witness: an all-invalid fixture may
    fail for unrelated reasons and conceal partial selection. Config/include
    equality is not resolved-membership equality. Native mixed requests under
    `.next` and `node_modules` publicly passed after silently shrinking scope
    (6b25b70e). Check membership before bodies, not mutant-report counts:
    a valid source may genuinely contain no mutatable expressions.

80. **An async plugin mock can erase the queue that decides which outcomes
    are reachable.** Trace start and cleanup through the installed wrapper,
    then hold start under its real queue: successful stop cannot overtake it,
    while a cleanup deadline can. Gate both orders and distinguish the
    settlement decision from the returned result; a biting mutation on an
    impossible ordering proves only the injected case.
81. **Missing error metadata is not success, and a typed object lookup is
    not a closed dictionary.** Separate absence of the error from absence of
    its name; test undefined, empty, arbitrary and prototype-key names at
    the rejection boundary, then assert the exported vocabulary. Synthetic
    inputs prove classifier robustness, not an observed native incident.

82. **A foreground recovery waiter needs its return listener before its
    departure listener.** Trace native event retention and bridge ordering;
    pause-first registration can observe departure and discard return. Clean
    partial registration and distinguish an aborted pass from cancellation
    of the containing operation. Returned abort identity, not a lifecycle
    flag or shared error name, determines whether retry is warranted.
83. **A throwing cleanup in `finally` can skip the ownership clear and escape
    a closed result union.** Put fallible listener removal inside the
    operation's settlement model and keep identity clearing in an outermost
    `finally`. Gate the success-plus-throw case: require terminal mapping and
    trace publication, then prove a later cancel cannot target the settled
    operation. Comparing only the main async body misses the cleanup channel
    that overrides its return.
84. **A fire-and-forget Cancel is a live generation until its last await
    settles.** Hold the old Cancel at an asynchronous transport continuation,
    expose the connection door, try to start B, then release A and inspect B's
    epoch, controller and keyed authorization. Clearing a driver ref
    synchronously prevents duplicate teardown but does not stop A's later
    cleanup from invalidating B through shared refs. Keep a drain barrier
    through settlement; when user activation matters, refuse B and require a
    fresh press rather than queueing it.
85. **A refusal seam cannot preserve authority that its producer already
    overwrote.** Trace mint and staging order into the refusal callback, then
    inspect the authoritative slot after the refused successor. If a
    single-slot producer writes B before `begin(B)` can reject it, discarding B
    cannot restore A. Put admission before staging, make staging conditional,
    or narrow the invariant to producers that cannot invoke B.
86. **A bounded buffer's length is not a publication version.** Fill it to
    capacity, publish, append one entry, and compare both length and tail
    identity. Once eviction begins, length stays constant while content
    changes; dirty detection needs a monotonic generation or tail sequence.
87. **Identity checks on owner state do not protect an unkeyed global
    diagnostic sink.** Release A's admission barrier, let B publish, then
    settle A's retained cleanup. Assert the global readout still names B;
    otherwise late A can overwrite the evidence for the operation the rower is
    currently seeing.
88. **A structural test double cannot stand in for an object whose authority
    lives in a private `WeakMap`.** Exercise the lifetime consumer with a
    foreign lookalike. Throwing breaks prescribed fixtures; returning quietly
    makes route loss fail open. Brand owner-created objects and mock the
    boundary only in tests that deliberately do not exercise ownership.
89. **A guard that excludes a sentinel tail can swallow the real span it is
    attached to.** Claimed: "a stop counts only if a real reading FOLLOWS
    it, which excludes the post-END tail." Believed because the tail and the
    threshold were the only two cases anyone drew. Settled by DELETING ONE
    SAMPLE from the real capture: with one moving sample after a 60.5 s stop
    the mark fires, with the recording ending inside the stop it returns
    `[]` — the stop and the tail are ONE flat run. For any guard phrased as
    "X only counts if Y follows it", build the case where X runs to the end
    of the data, and ask whether the fix is to DROP X or to CLIP X at Y.
90. **An SVG chart is one `role="img"`, and everything drawn inside it is
    invisible to a screen reader.** Believed safe because the same file had
    already added an accessible clause for an earlier mark, on the reasoning
    that the mark "has no accessible presence of its own" — and then shipped
    a second mark under the same `aria-label` with no clause. Settled by
    reading the `<svg>`'s own attributes and printing the built summary
    string. When a change adds a MARK to a chart, grep the figure for
    `role="img"`/`aria-label` and print what the label resolves to; every
    mark not named in that string does not exist for half the readers.
91. **A change that inserts WIDTH into an axis falsifies every "readings
    never land far apart" comment in the module.** A `toSegments` doc
    comment said a rest can never break the line "on its own account"; the
    same PR's headline cost was "4 segments, not 2". Settled by running the
    module with and without the new input and diffing the segment count
    (1 to 3 on one capture). When a change re-maps what an axis coordinate
    MEANS, re-read every comment that reasons about DISTANCES in that
    coordinate — they were written about the old quantity.
92. **Grep the spec for the dead premise's QUESTION, not just its answer.** A
    PR rewrote a falsified table ROW and left the table's own COLUMN HEADER
    ("survives the open freeze question?") and a later section's "subject to
    the open freeze question" standing in the present tense. When a walk
    closes an open question, grep for "open question", "subject to", "not
    desk-answerable" and the question's own noun — the places that USED the
    premise outnumber the one place that ARGUED it.
93. **"Equal by construction" is worth testing with UNEQUAL inputs.** A band
    documented as "the machine's own rest seconds" was actually
    `max(readback, observed)`; on the corpus observed is always the smaller,
    so equal bands looked structural. Settled by setting one readback to 20 s
    against an observed 49.1 s and watching the band draw 49.1. When a fix
    claims a property "by construction", feed it inputs where the two clauses
    of its own `max`/`min` swap order.
94. **A hostile input that reproduces is not a defect until you name the
    state byte that can produce it.** Three constructed inputs each
    mis-assigned every rest band in a chart; all three died on
    `WORKOUTSTATE_TO_STATE`, which reaches `"resting"` only from three
    interval-rest ordinals, and on a capture where a 60.5 s dead stop
    produced ZERO rest-marked samples. For a flag derived from a wire enum,
    read the enum's full mapping table and find a capture of the state you
    claim can set it wrongly, before promoting the reproduction.
95. **A census of "every path that destroys row X" is a census of CASCADES,
    not of statements — grep every `DELETE` of the PARENT table before
    believing it.** The attempt-revocation spec enumerated eight
    `DELETE FROM auth_attempts` statements plus one cascade
    (`DELETE FROM users`) and called it nine paths.
    `auth_attempts.original_session_id` is `ON DELETE cascade` on `sessions`
    (`app/drizzle/0031_apple_front_door.sql:41`), and `sessions.ts:74`/`:78`
    delete sessions on SIGN-OUT (`routes.ts:169-175`, reachable from
    `You.tsx:76`) and on a 60-second sweep (`frontDoor.ts:84-86`) — both
    through drizzle's builder, in another file, invisible to a choke point
    and to a source-text census test. The producers to enumerate are every
    writer of every ancestor table: one
    `grep -rn "delete(<parent>)\|DELETE FROM <parent>"` per FK hop.
96. **A guard keyed on a CONTAINER identity when the question is about a
    SUBJECT identity fails in both directions — write the
    two-different-subjects row out before believing it.** "Revoke the attempt
    token only when no live `apple_grants` row exists for that
    `(user_id, client_id)`" skips the revoke when the grant belongs to a
    DIFFERENT Apple subject (reachable: an existing `apple_sub=X` account, a
    signin with a second Apple ID Y, follow-through by the other provider,
    `finalize` refusing with `account_conflict`, cancel) and revokes when it
    should not (the null-session rows, where the spec claimed "no user to
    check against" — false: `consistent()` REQUIRES `verified_subject` at
    every stage those rows can occupy, so the subject is always on the row).
    Ask which column ANSWERS the question, then check whether the design
    reads it.
97. **A "this literal appears exactly once" census test is a spelling pin —
    append five bypasses to a copy of the file and re-run the grep before
    crediting it.** Measured on `attempts.ts`: the drizzle builder
    (`db.delete(authAttempts)`), lowercase, `public."quoted"`, a composed
    identifier `${T}`, and a template literal wrapping after `DELETE` all
    left the count at 8. RF26's strongest-conclusion rule: it proves a byte
    sequence is unique in one file's source text, never that a choke point is
    the only path. It also goes RED spuriously, because a source-text count
    counts the comments (technique 11) and this file quotes SQL in comments
    constantly.

98. **When both sides of an "external oracle" read the same stored column,
    the agreement is a round-trip receipt, not a measurement.** Phase PS's
    exit criterion compared the app's weekly metres against Concept2's
    logbook rows — but `mapping.ts`'s `postedMeters` and
    `domain/stats/rowContribution.ts`'s machine tier both return
    `row.machineWorkMeters`, so the 24,507 m row-for-row agreement proved the
    send path and the stats path read one column and that Concept2 stored it
    unchanged. Before crediting an external number, find the FIELD each side
    derives from; if it is one field, say what the check DID prove (a seam, a
    transport) rather than what it looks like it proved. RF11's second half,
    applied to a number we posted ourselves.
99. **An oracle run against a SANDBOX account cannot go red on a lifetime
    total, because the sandbox holds only what we put there.** PS's Concept2
    LIFETIME was "inferred equal to its season"; on `log-dev.concept2.com` it
    could not have been anything else. Ask whether the authority holds any row
    we did not write before counting it as an authority (RF21, applied to a
    data source).
100. **A residual computed by subtraction is a restatement, not a second
     observation.** "~49,635 m was never sent" is exactly 128,660 − 79,025. For
     any "the gap is explained by X" claim, check whether X was MEASURED or
     whether it is the difference the claim is explaining.
101. **A drizzle migration file is ATOMIC with every other pending file and
     with its own journal row** — `drizzle-orm/pg-core/dialect.js` runs the
     whole loop inside one `session.transaction`. So evidence that ONE
     statement in a multi-DROP migration landed proves they all did. Read the
     migrator before pricing a per-statement confirmation on production.
102. **A close record that inherits the ROADMAP's Exit PARAGRAPH inherits a
     SHORTER list than the spec's.** Phase DE's worklist walked four criteria
     and cited "spec §6", which has six; the two it dropped were the
     test-suite criterion and the housekeeping one that owns the archive move
     itself. Open the spec's own section and count before writing MET against
     anything.

