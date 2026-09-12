# Recurring failures — the incident record

The rules live in `CLAUDE.md`'s "Recurring failures" section, which is what
agents read. This file is the evidence behind them: the full original text of
each entry as it stood before the 2026-09-12 compression, keyed by RF number.

**This is a record, not guidance.** Read it when you want to know what actually
happened, why a rule is worded the way it is, or whether your situation is the
one an entry describes. Never cite it as the current rule — `CLAUDE.md` is.

Numbers are permanent and match `CLAUDE.md` exactly; 1387 citations across the
repo depend on them.

## RF1

1. **Changing UI without running `pnpm e2e`.** Three phases running, a task
   changed a component and left the e2e suite red because only
   `--project unit --project client` was run. The e2e job gates CI. **If your
   diff touches anything under `app/src/`, run the named e2e specs locally
   against an already-booted stack, then read the e2e job on the PR for the
   full suite** — and `pnpm screenshots` too if you changed a screen's
   layout, **committing only the captures for screens your diff touched;
   `git checkout -- docs/screenshots/` discards the rest** (TESTING.md §8,
   "Regenerate broadly; commit narrowly" — a browser does not render
   deterministically and the noise is discarded, never engineered away).
   **The reason the local half is now NAMED specs is James's
   decision to tier the gate (2026-09-08, Phase MEM): CI owns the full
   suite, locally you run what your change touches.** It is not a
   wall-clock argument — the Playwright worker cap that costs ~1.5x
   locally (RF40) is one env var away from being lifted, and a cost you
   can opt out of could never justify weakening the repo's number-one
   gate. What justifies it is that the full suite still runs, on every
   PR, where nobody can skip it. The obligation is unchanged: **an
   `app/src/` change is not done until a full e2e run has passed
   somewhere you have read the result.**

## RF2

2. **Trusting the aggregate coverage gate.** The 90×4 threshold is repo-wide,
   so a brand-new file can ship with entire branches uncovered and the gate
   still passes. Four components did exactly that (keyboard handlers twice,
   error branches twice). **Check the per-file numbers for files you touched.**

## RF3

3. **Fixtures that don't look like production data.** The name generator
   returned the same name forever against the real 35-workout library while
   every test passed, because the tests used an empty library. A whole phase's
   `wu`/`r` rendering branch shipped with an accessibility defect because every
   test and design sweep built `kind: "w"` rows. **Test against a realistic
   fixture — the seeded library, a stored workout, a populated form.**

## RF4

4. **Asserting a thing exists instead of that it works.**
   `expect(typeof retry).toBe("function")` passes whether or not retry
   retries. **Invoke it and assert the consequence.** See docs/TESTING.md §3.

## RF5

5. **Deleting a component and leaving its CSS.** Happened three times
   (`.col-*`, `.set-toggle`, `.field-dur`/`.field-spm`). **After deleting a
   component, grep its class names across `src/` and `e2e/` and remove the
   dead rules.**

## RF6

6. **Judging contrast by eye.** A token shipped at 3.29:1 against a 4.5:1
   requirement and was only caught by a later automated scan. **Compute the
   ratio; put the number in your report.**

## RF7

7. **Screenshots that capture empty states.** Committed screenshots are the
   PR's visual record and have twice shown fallback dashes or scrolled past
   the feature. **Seed real data, then open the image and look at it — and when the
   screen derives a number from other numbers in the same frame, recompute
   the headline from the rows by eye** (PR #117's flagship capture showed a
   hero contradicting its only row by 37s/500m through seven reviews; the
   PM caught it with ten seconds of arithmetic).

## RF8

8. **Hand-rolling the same ARIA pattern again.** There are already three
   roving-tabindex radiogroups; each shipped untested and needed a follow-up.
   **Reuse `PaceRefInput`/`ClassificationCard`'s pattern and copy its keyboard
   tests.**

## RF9

9. **Letting `docs/design/DEVIATIONS.md` drift.** It documents _current state_,
   not history. Rows have described deleted code and contradicted each other.
   **When you change or remove something it describes, reconcile the row.**

## RF10

10. **Assuming the plan is right.** Plans in this repo have contained factual
    errors — a route-ordering claim that the router made moot, a
    `DROP COLUMN` sequencing that would have broken rollback, a task split that
    was impossible because a type change forces compilation coupling. **If the
    brief contradicts what you observe, say so in your report instead of
    working around it silently.**

## RF11

11. **Verifying the app only against itself.** Every gate this repo has —
    fixtures, captures, unit tests, design sweeps, even the hardware walks —
    checks the app for INTERNAL consistency. A nine-task wave, three
    adversarial reviews, a test-integrity sweep and a five-item erg walk all
    passed while the app reported 16938 m against the PM5's own 4384 m
    (2026-08-13, "Sun fret"). James found it in one session by
    photographing the monitor and the phone in the SAME FRAME. **When the
    machine reports a number we also compute, compare them** — on hardware
    with both screens in one shot, or in a test by replaying a capture from
    `docs/monitor/sessions/` and checking the derived total against each
    interval's own final pre-reset reading (the captures contain no
    `boundary` events, and the boundary-actual sum is an unsound oracle —
    architecture review §F2). An agreement with our own fixtures proves
    nothing about the erg.
    **AND ASK WHAT QUANTITY THE ORACLE MEASURES, not just whether it
    agrees (2026-08-21).** This rule as written above would have passed
    the defect that produced it. We DID compare against the machine —
    `recordTwdVerdict` checked our accumulator against the PM5's Total
    Work Distance, and PR #123 celebrated a sub-metre three-way
    agreement. It proved nothing: TWD is work PLUS rest-coast metres
    (decoded to the metre, 1535+64=1599 and 1300+47=1347) and so is our
    sum, while Concept2's logbook — the actual authority for what the row
    was — stores work only. Both screens in one photograph would have
    shown two numbers agreeing about a quantity the authority does not
    store. **An oracle that shares your definition is a mirror.** Before
    trusting any external number, state what it measures and confirm it
    is the same thing you are trying to be right about. **VINDICATED
    (RC-9c, 2026-08-25): `recordTwdVerdict` is now RETIRED, for exactly
    this entry's own reason — lifting its distance-interval suppression
    (the fix a naive reading of "compare against the machine" would
    reach for) makes it PASS everywhere, 0.2-1.5 m deltas across five
    captures, all mirrors, never a real check. This entry warned about
    the shape a phase before the code caught it; RC-9 replaced the
    mirror with two genuinely independent oracles instead (0x0032's own
    average pace, 0x003A's own rest distance — design spec
    `2026-08-25-free-oracles`) rather than trying to fix the mirror in
    place.**

## RF12

12. **Settling a claim about build output by reading code instead of
    building it.** Twice now: `dist-grep.sh`'s own header records an
    identifier needle coming back clean against a build that genuinely
    contained `fake.ts` (minification renamed it), and PR #100's planned
    download path — a dynamic `import()` behind a runtime check — read
    correctly and still emitted the whole module graph as its own chunk,
    because Rollup only folds an `import()` behind a BUILD-TIME constant.
    Both were caught by producing the artifact, never by review. **Any
    claim of the form "X is not in the production bundle" is settled by
    `pnpm build` plus a string-literal grep over `dist/`, in both
    directions — prove the probe can go red before trusting its green.**
    **Corollary, from PR #344 (2026-09-07): a mutation that breaks the BUILD
    reads as a passing probe.** Three e2e probes in one session came back
    green because the mutation left an import unused, `pnpm build` exited 2
    inside `docker compose up --build`, compose kept the PREVIOUS image, and
    Playwright ran against unmutated code. Same shape as this entry, one
    machine over: the artifact you reason about is not the artifact that ran.
    **An e2e mutation must COMPILE** — swap one call for another that keeps
    every import used, rather than deleting a call — **and the build must be
    seen to succeed before the test result is read.**

## RF13

13. **Handing James an operator instruction nobody checked against the
    code.** Item 10 covers plans that contain factual errors; this is its
    operator-facing sibling, and it burns HIS time rather than an agent's.
    Phase CS's spec said `VITE_ENABLE_FAKE_MONITOR=1 pnpm ios:build` puts
    a fake PM5 on the phone so a walk needs no erg; the plan and two walk
    cards inherited it verbatim, and it is impossible —
    `adapters/monitorTransport.ts` takes the Capacitor BLE arm whenever
    `isNative()`, and ONLY the web arm reaches the fake seam. He built,
    tapped Connect, and found nothing. The same day, the canned keystone
    block in `/hardware-walk` failed to import at all (`r0` is not a rest
    the grammar accepts) — also never once pasted before being shipped as
    an instruction. **Before an instruction reaches him, run it or read
    the code that serves it: paste the block, follow the flag to the
    branch that consumes it. An instruction is a claim about the system,
    and it gets the same evidence bar as any other.** Corollary, from the
    fix that followed: **a diagnostic hidden behind a build flag is
    disarmed by anyone who edits the build command for unrelated
    reasons** — correcting that same walk card silently removed the
    `pointercancel` readout, so the one case that needed instrumenting was
    walked without it. If a flag carries a diagnostic, say so where the
    flag is written down.

## RF14

14. **Treating a PR body as a record.** Five times in six PM gates, a real
    finding lived only in a PR's Record block — an owed follow-up, an
    unexplained capture diff, a product gap — and had to be rescued into
    ROADMAP or a ledger at the gate, or was lost. **A PR body is a
    presentation; anything with a life after merge goes in ROADMAP, a
    ledger, DEVIATIONS, or a RUNSHEET at the moment it is found.**

## RF15

15. **Writing release notes from your own branch instead of the tag's
    range.** v0.13.0 was one command from being cut with notes covering
    only the phase this session ran; session deletion had merged from a
    parallel session in between, and testers would have found a delete
    button no note mentioned. It was caught by reading the commit log by
    hand, which is luck, not a gate. **Before cutting a tag, list every
    merge since the previous one and account for each: a note, or a
    stated reason it needs none.** Parallel sessions make this the normal
    case, not the rare one. **Use `git log <prev-tag>..main --oneline`
    WITHOUT `--merges`** — this rule shipped prescribing `--merges`, and
    on this repo that returns EMPTY, because main is squash-merged and has
    no merge commits. The one gate that exists to stop notes being written
    from a branch instead of a range was unrunnable as written for four
    tags (found at PR #144's PM re-gate, 2026-08-20). A gate nobody can
    run is not a gate.

## RF16

16. **Stating an unsourced premise as fact.** In one day the controller
    told James "the PM5 is single-central" and "App Review scrutinises a
    `bluetooth-central` declaration" — both load-bearing, both used to
    reason about real decisions, both false or unsourceable, and both
    caught by a research pass rather than by the person saying them. The
    icon's "ERGOMATIO" claim is the same shape and survived three hops
    over weeks because nobody opened the PNG. **A premise you cannot cite
    is a premise you are inventing: tag it PRIMARY / SECONDARY /
    INFERENCE, or do not say it.** The tell is a sentence that sounds
    like it came from a document. Corollary from PR #141's gate:
    **a dangling citation is worse than no citation, because it reads as
    evidence** — 23 citations across 11 tracked files point into
    `.superpowers/`, which is git-excluded and unreachable to anyone but
    the session that wrote it.
    **Second corollary, added 2026-08-26 after the same class recurred
    twice in one spec: A SOURCED premise fails differently, and this rule
    did not cover it.** Phase JR's spec justified a STORED SHAPE from a
    citation twice, and both times the citation was real:
    (1) _"0x0039 has appeared in zero of our five captures"_ was true when
    written and false when used — the 2026-08-23 keystone walk had
    captured the frame two days earlier, and the cited document was the
    stale half of a contradiction resolved in the same directory;
    (2) _"Concept2's API carries `JustRow` first-class"_ was correct about
    the enum and silent on the attribute the whole argument rested on —
    that field is documented `Required: No`. Neither was unsourced; both
    were UNDER-READ. Both were caught by an adversarial pass rather than
    by the person citing, at a cost of a spec revision each.
    **A citation is only as load-bearing as the line you actually
    quoted.** When an argument depends on an attribute of a source —
    required vs optional, current vs superseded, what a field MEANS —
    quote that line verbatim beside the claim and name the attribute the
    argument needs. A URL is not evidence; a sentence is. Both failures
    die to this on sight: quoting the API's field row shows
    `Required: No`, and quoting a capture claim means opening the capture
    directory, where the newer walk is sitting.
    **Third corollary, 2026-08-31 (PR #246): READING A CONDITIONAL AS AN
    ENUMERATION.** The quoted line was real, current, and correctly
    transcribed. It said: _"For any fixed duration workout **or JustRow (no
    defined end)** that **is terminated** prior to reaching its defined end:
    `WaitToBegin->WorkoutRow->Terminate->Rearm->WaitToBegin`"_. It was written
    up as "Appendix E gives a JustRow only a Terminate exit", tagged PRIMARY,
    and propagated to four files — when the sentence documents where a
    TERMINATED row goes and enumerates nothing. **The tell is writing "the
    only X it lists" about a sentence containing a conditional clause**
    (`that is…`, `when…`, `if…`): such a sentence describes a case, and a
    case is not a set. Ask what the sentence would still permit if the
    condition were false. **And the reason this one is promoted rather than
    left in a ledger: it was committed INSIDE the pass that was correcting a
    different instance of this very rule.** Being alert to a failure mode in
    someone else's work is no protection at all against committing it in your
    own; the check has to be mechanical, not attentional.
    **Two checks, promoted here from the antagonist's ledger because a
    ledger only one agent reads cannot prevent anything:** for any
    "we have never observed X" claim, list the capture directory BY DATE
    and read the newest walk's README first — corpus facts in this repo
    have expiry dates, and the document stating one is usually older than
    the walk that killed it. And when a spec tags a vendor document
    PRIMARY, grep the repo for our own transcription of it AND for any
    code comment recording a hardware DEPARTURE from it; a document this
    project has already caught being wrong does not get a fresh PRIMARY
    tag on the neighbouring claim.
    **Fourth corollary, 2026-09-07: A VENDOR'S REVISION HISTORY LOGS EDITS
    TO A DOCUMENT, NOT CHANGES TO THE WIRE.** The short-status-frame fix
    scoped itself by reading Concept2's revision history end to end and
    concluding the affected family was exactly two characteristics. The
    conclusion was right and the method was not: a revision row exists only
    where an engineer wrote one, and the same pass found three
    GATT-versus-multiplexed layout divergences carrying no row at all. What
    rescued it was a second, non-mirror route computed from OUR OWN source —
    for each parser, `length floor − (highest byte offset of a field that has
    a consumer)`; exactly two had slack. **When a scope claim rests on a
    vendor's changelog, re-derive it from a property of our own code and
    require both routes to agree.** A changelog is corroboration, never the
    proof.

## RF17

17. **Opening a phase without writing it into the ROADMAP.** Four phases
    running (PW, CS close, CM, LT), the phase's own gate ran
    `grep "<phase>" ROADMAP.md` and got zero — the roadmap learned about
    the phase only when a gate demanded it. **The brainstorm that names a
    phase adds its ROADMAP section in the same commit as its spec.**

## RF18

18. **Opening a phase without READING the ROADMAP — and re-researching what
    this repo already settled.** The sibling of #17, and it cost a whole
    spec. Phase LM was opened on 2026-08-25 to fix a tester's lost workout;
    its spec diagnosed the wrong bug, proposed a fix that could not work,
    and scoped a PR 2 that contradicted a standing James ruling. All four
    corrections were already in the repo: `ROADMAP.md:3271` carried the
    real mechanism from James's own tester report the day before
    ("still in the pre-row state with no record"); `ROADMAP.md:2095-2130`
    carried his 2026-08-20 ruling ("CORRECT RESUME, not a background
    mode"); `docs/superpowers/research/2026-08-20-ble-connection-management.md`
    had already done the research, at the right LAYER; and the code
    described its own failure in a comment
    (`useMonitorSession.ts:988-990`). Only the antagonist caught it.
    **Before researching anything the OS, browser or device owns, run
    `ls docs/superpowers/research/` and `grep` the ROADMAP for the
    symptom.** This project researches things once and then re-researches
    them from scratch, and the second pass is always the shallower one.
    **And name the LAYER**: Apple's Core Bluetooth background docs are
    accurate and govern the NATIVE app, while our logging runs in a
    WebView that WebKit throttles on rules that never read a plist key. A
    correct citation answering the wrong layer reads exactly like
    evidence.
    **A COMMENT THAT NAMES ITS OWN PRECONDITION IS A TRIPWIRE, AND THIS ONE
    WAS STEPPED OVER (PR #246, 2026-08-31).** `useMonitorSession.ts`'s
    connect guard read: _"Unreachable today only because `onExit()` unmounts
    the interstitial synchronously — nothing can press Connect mid-cancel. If
    cancel ever stops unmounting, this guard needs a `cancellingRef`."_ A new
    screen was added that stays mounted through a cancel and offers Connect
    again — exactly the caller the comment described — and the comment was
    never read. The abandoned attempt then installed a driver and ten
    subscriptions behind a screen reading "Not connected". **Before adding a
    caller to a shared hook, grep its source for "unreachable", "only
    because", "as long as", and "today":** those phrases mark invariants held
    up by the current call graph, and a new caller is exactly what changes
    it.
    **AND IT APPLIES TO PROCESS, NOT ONLY CODE (screenshot churn,
    2026-09-11).** Two sessions and three PRs went into making `pnpm
    screenshots` byte-stable — a fresh-database boot, a stable `RUN_ID`, a
    secret-gated server route to rewrite `logged_at` — before an antagonist
    asked who consumed the bytes (nobody automated) and then grepped
    `docs/TESTING.md`, where James had already written the answer on
    2026-08-27: _"maybe a scheduled reup."_ Scoped capture per PR plus a
    periodic full refresh, ruled two weeks before the engineering started,
    never implemented. The route was reverted; the rule is now TESTING.md
    §8. **Before designing a fix for a workflow problem, grep the repo for
    a ruling on it** — `grep -rn "<the symptom>" docs/ ROADMAP.md CLAUDE.md`
    — and read the consumer before optimising the producer.

## RF19

19. **Trusting a verification stack that stops at the wire.** Our
    instruments all sit at or below the transport seam, so a defect whose
    trigger enters ABOVE it — platform lifecycle, permissions,
    backgrounding, OS interruptions — is invisible to every gate we own.
    On 2026-08-26 a red `LOST THE MONITOR` banner fired nine times in
    288 s over a link that never dropped, and four instruments were blind
    at once: `RecordedEvent` had no lifecycle member, so no recording
    could carry it; the unit tests `vi.doMock` `adapters/appLifecycle`,
    replacing the seam that was wrong; `src/native/**` is `v8 ignore`d,
    and that was the arm with the bug; e2e runs on web, where the
    lifecycle arm is a deliberate no-op. It shipped through a full review
    and was caught by James at an erg
    (`docs/monitor/sessions/walk-2026-08-26/`). **For any new
    platform-sourced input, ask which instrument would catch it if it
    were wrong — and if the answer is none, build the instrument in the
    same change.** The recording format now carries `lifecycle` events
    and `transports/replay.ts` emits them for exactly this reason; a
    recording that carries one and finds no handler wired reports a
    divergence rather than skipping it silently.

## RF20

20. **Writing to the main checkout with a relative shell path.** The SDLC
    rule requires `git rev-parse --show-toplevel` before every COMMIT, and
    that guard works. It does not cover WRITES: the shell's cwd resets
    between tool calls, so a `cat >>` or `>` redirect after a reset edits
    the main checkout instead of the worktree. Happened again on
    2026-08-25 (PR #197), the fifth stray main-checkout write, caught only
    at `git add`. **Every shell write uses an ABSOLUTE worktree path, or a
    `cd` in the SAME command.** Edit/Write tools take absolute paths and
    are safe; shell redirects are not.

## RF21

21. **Shipping a gate that cannot go red.** A green check you never proved
    can fail is not evidence; it is decoration that reads as evidence, and
    it is worse than no gate because it retires the suspicion that would
    have found the bug. **RC-24 shipped TWO in a single task** (2026-08-26,
    PR #204): a `min-width: max-content` clip fix placed on a plain child
    of the flex item — where `min-width` cannot influence flex shrink at
    all, since that algorithm reads the ITEM's own value and never a
    descendant's, so the fix did nothing — and, in the same commit, the
    e2e no-clip test that measured **that same inline element**, whose
    `scrollWidth`/`clientWidth` are both always `0`. The gate was green
    regardless of overflow and would have passed a fully clipped cell.
    Both survived a full review AND a scoped re-review; the implementer
    found them itself while rewriting the rule for an unrelated reason.
    **Every new assertion gets a mutation that makes it fail, and the
    report states what was mutated and what the failure said.** This is
    already the rule for "this test can't fail" claims (see the
    mutation-probe memory and the antagonist's ledger); it is promoted
    here because a rule only one agent reads cannot prevent anything.
    **Two smells that predict it:** an assertion measuring a DIFFERENT
    element than the one the fix changed, and any measurement of an inline
    element's box (`scrollWidth`, `clientWidth`, `offsetWidth` are `0`
    there — blockify it or measure its flex-item parent).
    **Corollary on LAYERS, inside our own code.** Item 18 names the layer
    trap for external docs; the same PR proved it applies internally. The
    clip fix was justified by citing `domain/validate.ts`'s `0:01..60:00`
    rest bound as making `REST 59:59` reachable. The citation was real and
    answered the wrong layer: that is the BUILDER's authoring bound, while
    every connected program also passes `compileProgram`, which rejects a
    folded rest over `MAX_REST_SECONDS = 595` (9:55). The true worst case
    was four characters narrower, and knowing it deleted the fix outright.
    **When a bound justifies a decision, name the layer that enforces it
    and check whether a NARROWER one sits downstream.**
    **Two more smells, from PR #228 (2026-08-29), where James's review
    caught what one antagonist pass, six task reviews, and a whole-branch
    final review all missed — both are RF11's mirror, in test form:**
    (1) **a test that imports the constant it exists to gate proves
    nothing about it** — the 2000 ms deadline test derived its clock from
    `BURST_HANDOFF_HOLD_MS`, so retuning the constant to 2400 retuned the
    test with it, every suite green; a contract is pinned with
    INDEPENDENT literals (held at 1999, released at 2000), never with the
    production symbol. (2) **mutations must also run ABOVE the seam under
    test** — every hook-level mutation bit, while a parent component
    passing `handoffHeld: false` straight into the surface beat 4,042
    client tests and all six connected e2e walks, because every gate
    entered the pipe below the prop. When a fix's value crosses a
    component seam, one mutation forges the value AT the seam.
    **A THIRD smell, from PR #246: a probe can fail to bite because the test
    sits at the wrong LAYER, not because it is written badly.** A guard
    stopping a superseded connect attempt from releasing a newer attempt's
    single-flight claim was first tested at the component, where it passed
    with the guard deleted — no screen offers Connect while an attempt is
    live, so the claim is unobservable from there. Moved to the hook, the
    same mutation failed immediately ("expected 3 to be 2"). **If a guard
    protects an invariant no user-facing path can reach, the test belongs at
    the layer that can reach it** — and a green assertion you could not make
    fail is decoration, so delete it or move it rather than keeping it for
    the coverage.
    **AN IN-MEMORY FALLBACK BESIDE A STORE DISARMS EVERY PERSISTENCE GATE,
    AND THE READ ORDER IS NOT THE HALF THAT MATTERS (Phase RN, 2026-09-09).**
    A preference module kept a module-scope `lastSet` so a REFUSED write still
    took effect for the session. Written the obvious way — assigned on every
    write, read before storage — it meant a completely broken `setItem` still
    read back the chosen value, so the seam test and the e2e leg that existed
    to catch a broken store both stayed green. The antagonist settled it by
    running the module under Node with `setItem` replaced by a no-op: the save
    reported `true`, storage held nothing, the read said `skip`.
    **The fix is the ASSIGNMENT, not the ordering:** set the fallback only on
    the refused path and clear it on the successful one. Four probes against
    the finished suite measured which half was load-bearing — restoring the old
    read order alone fails NOTHING, restoring the old assignment fails two — so
    the spec says the ordering is defence-in-depth rather than the thing under
    test (RF26). **Any value a module can answer with WITHOUT consulting its
    store is a value that hides the store being broken.**

    **AND A PROBE THAT REPORTS "THIS CHANGES NOTHING" IS A QUESTION ABOUT THE
    SUITE, NOT AN ANSWER ABOUT THE CODE (added 2026-09-09, from the same
    phase).** A mutation proves an assertion can fail when the CODE changes.
    It cannot tell you the assertions are missing a STATE, and that is a
    different defect with the same green. Phase RN measured that restoring its
    store's old read order failed none of 17 cases and wrote that up as
    "defence-in-depth, not the thing under test" — the measurement was
    accurate and the conclusion was wrong. No case in the suite held a valid
    value in storage at the moment a write was refused, which is the only
    state where the two orders differ; that state was a live bug, and the
    screen told the rower their choice was set while the erg obeyed the old
    one. A reviewer found it by enumerating orderings of USE, which is not
    what a mutation probe does.
    **So when a probe comes back green, name the case in the suite where it
    could have gone red.** If you cannot name one, you have found a hole in
    the tests, not a fact about the code — and the write-up says so instead of
    promoting the silence into a property of the design (RF26). The tell is a
    sentence of the form "restoring X alone breaks nothing, so X is safe":
    that is only true if something was watching X.

    **A concurrency gate proved by RACING is RF21 by construction (PR #269,
    2026-09-02).** "Two concurrent mints leave one row" was specified with a
    `Promise.all` race; the named mutation (atomic upsert → delete + insert)
    stayed green three runs running because two promises do not reliably
    interleave on a fast local Postgres. What bit was DETERMINISTIC: hold an
    uncommitted conflicting row inside an open transaction on one connection
    while the code under test runs on another — the upsert blocks and then
    resolves, the mutant blocks and then dies on the unique index. Prefer one
    arranged race to any number of parallel attempts, and verify the pool has
    ≥2 connections or the test hangs instead of failing.

## RF22

22. **`git checkout -- <file>` to revert a mutation probe, on a file that
    also holds uncommitted work.** Queued as a lesson by James on
    2026-08-24 and never landed; it then happened again on 2026-08-28,
    during the very PR that was landing it. Reverting a one-line mutation
    with `git checkout -- app/src/monitor/driver.ts` also destroyed an
    unrelated, uncommitted comment fix in the same file — silently, because
    checkout does not warn and the suite went green either way (the fix was
    a comment). Caught by `git status`, which is luck rather than a gate.
    **Before reverting anything with `git checkout`, run `git status` and
    check whether the file you are about to restore carries work you have
    not committed.** The cheap habit that removes the class entirely:
    **commit the real change BEFORE running any mutation probe**, so every
    probe's revert is a no-op against a clean file, and the probe can never
    take anything with it. `git stash` is not the alternative here — the
    stash stack is shared with other sessions (agent briefing).
    **And confirm the commit LANDED before the probe (`git log -1`):** on
    2026-09-07 (Phase RW PR A, Task 5) the pre-commit typecheck blocked
    the commit, the file stayed dirty, and the probe's `git checkout --`
    erased forty lines of the real change — this entry's exact class, one
    step later in the sequence.
    **And anchor the mutation on a UNIQUE string (PR #269, 2026-09-02).**
    Task 6's round-0 probe edited the first match of a `sessions:` line —
    the unmounted test-signin router, not the concept2 mount it meant to
    break — and read green as evidence. A probe that lands on a duplicate
    line is RF21 with extra steps: grep the anchor first and confirm it
    returns ONE hit, or anchor on surrounding context that does.

## RF23

23. **Adding an affordance to a surface that already offers the same
    thing, and killing the better offer with it.** Queued as a lesson by
    James on 2026-08-24 alongside item 22; the case is PR #189's baseline
    round, and `you/BaselineEditor.tsx`'s `seedFor` comment
    (lines 165-186) is the full account. The round added `[−][+]` steppers
    to the 2K/6K fields. Those fields ALREADY carried a derivation offer
    beneath them, and the two suggestion mechanisms disagreed: the
    placeholder showed the generic table seed (2:25.0) while the button
    offered a derivation from the rower's OWN rowed 6k (2:23.0). The new
    stepper materialised the generic seed, which made
    `draftValue !== offer.value` — the predicate `DeriveSlot` renders on —
    so **the better estimate vanished in ONE TAP**, and Apply then stored
    the generic seed as `manual`. The fix was to make the offer's value BE
    that side's seed, so all three paths name one number.
    **No test caught it, and the reason generalises:** every existing test
    reached that field through the offer button or by typing, because
    those were the only ways in when they were written. A new entry path
    is a new way to reach every state the old paths reached, and the
    suite's coverage of that surface is silently scoped to the old ones.
    **Before adding an affordance, enumerate everything else on that
    surface that already offers, suggests, or writes the same value, and
    write a test driving the NEW affordance against each.** The smell is
    two mechanisms proposing one field's value; the failure is the
    better-informed one losing silently, which no assertion about the new
    control will ever notice.

## RF24

24. **Every test seeding PAST the producer, so no gate can go red on the one
    defect that matters.** Item 21 covers a gate that can never fail at all.
    This is its sibling and it is harder to see: each gate CAN fail, they are
    all green, and none of them can fail on this bug — because every one of
    them enters the pipe downstream of the break. **Measured cost: a headline
    feature that shipped having never once worked.**
    `MACHINE CONFIRMED · WORK ONLY` and the PM5 verification code reached
    **zero of sixteen** production rows (counted on the prod DB, 2026-08-28)
    while three gates stayed green — `FromTheLog.test.tsx` mocks the API row
    with `machineWorkSeconds: 124`, `LogSession.test.tsx` seeds a `MonitorRun`
    already carrying `summaryTotals` before it renders, and
    `screenshots.spec.ts` seeds the API row and says so in its own comment.
    Two replay suites DO drive the real driver, hook and localStorage over
    real walk bytes, and both stop at `loadMonitorRun()`. **Nothing mounted
    the reader before the producer wrote.** The break was one line: a
    mount-time `useState` snapshot that never re-read.
    **The check is not "are the gates green" — it is "which test STARTS
    upstream of the producer?"** For any A-writes-then-B-reads seam, one test
    must begin before A and assert after B. Both halves being well tested is
    exactly the condition that hides a broken seam.
    **Two tells, both present here and both missed:** a test whose own name
    explains the production symptom away as legacy (this suite had one titled
    "renders NO block when all three machine fields are null — **the common
    case, old rows**"), and a phase criterion verified at the wrong LAYER —
    a walk table's column read "App stored (WIRE→record)" while the cell
    under it cited a driver ring entry, on a build shipped the day BEFORE the
    storage code existed. **A criterion cannot be verified on a build where
    its code does not exist**, and "verified on hardware" means nothing until
    the layer is named.

## RF25

25. **A lower layer reports a durability failure and its caller proceeds as
    if persistence succeeded.** The 2026-08-28 codebase-integrity audit's
    headline systemic pattern
    (`docs/superpowers/audits/2026-08-28-codebase-integrity/final-report.md`),
    and it had already
    shipped three times before the audit named it: `Countdown.tsx:220` calls
    `saveRun(run)` — a function that RETURNS a boolean for exactly this —
    ignores it, and navigates to Timer, which silently bounces to Today when
    the run never persisted (AUD-015); `saveMonitorRun` swallows its failed
    write and returns `void` while the Log door fresh-loads the record that
    never became durable, so completed PM5 work renders `NO MONITOR READING`
    (AUD-016); and recurring failure 24's machine-summary defect is the same
    shape with a reader instead of a writer. **The tell is a documented
    rationale of the form "the caller has no different action to take on a
    failed write"** — `monitorRun.ts` says those words verbatim, and AUD-016
    is the different action it did not imagine (hold the hand-off). At any
    seam where A persists and B proceeds or reads, the spec names ONE owner
    of the end-to-end invariant: either the caller branches on the failure
    it can now see, or a comment states why the outcomes are genuinely
    indistinguishable — a claim that gets the same evidence bar as any
    other, because every instance above falsified one.

## RF26

26. **Promoting a useful gate into a stronger product claim than it proves.**
    PR #239 took nine review rounds; its last round changed comments and spec
    prose only because the remaining defects were claims about the evidence,
    not product behavior. Three green gates each proved something real and
    were still over-sold: a test-only `MutationObserver` delivery proved
    acceptance-if-delivered, not supported wire-producer reachability; a fresh
    router proved re-entry, not the original navigation's first mount; one
    `ts.createSourceFile` definition site did not prove one parse invocation.
    The shared failure was collapsing behavior, reachability, and proof method
    into one sentence, then letting the strongest reading become canonical.
    **Before building or reviewing any non-trivial gate, write its five-part
    proof contract:** (1) the production invariant; (2) the supported producer
    and reachable ordering; (3) the independent observable; (4) the exact
    deciding-source mutation and expected failure; and (5) the strongest
    conclusion the spec, test title, comments, and PR body may state. A
    synthetic ordering proves conditional acceptance only; re-entry proves
    re-entry; a definition- or call-site census proves structure, not runtime
    invocation. If the supported path cannot be gated, narrow the claim or
    change production — do not manufacture an interleaving and promote it.
    After every fix round, replace the superseded canonical claim instead of
    appending a correction beneath it. Splitting behavior from its proof or
    record makes this worse: all three stay in one review unit; the PM decides
    earlier whether the underlying product work contains more than one safely
    deployable invariant.

## RF27

27. **Session-scoped state shipped without a lifetime table — and a spec
    that names a mechanism where it owes an invariant.** PR #258 took nine
    external review rounds; five of them were ONE design flaw discovered a
    clause at a time. The plan specified the mechanism ("three rotated
    localStorage keys, push on every teardown"); the invariant it actually
    owed ("one entry per LOGICAL SESSION; an old log can never pair with a
    new id; relaunch-safe; platform-floor-safe") was never written down, so
    the reviewer derived it adversarially: per-teardown guard (round 1),
    identity upsert (2), relaunch collision in the id mint (3), an API
    below the deployment floor (4), and finally the cross-attempt alias
    whose fix — one `LogicalSession` value minting id, ring, and every
    per-session guard/counter at a single site — should have been the
    day-one design (5). Three of the five were LIFETIME bugs: state minted
    per-attempt, cleared per-teardown, compared per-document, all claiming
    to be per-session. **Two rules, both cheap:** (a) a plan introducing
    any session-scoped state carries a LIFETIME TABLE — every ref, guard,
    and counter; its mint site; its clear sites; what survives teardown,
    relaunch, and re-arm — and states invariants, never mechanisms;
    (b) the antagonist skip rule's own text was violated to enable this:
    the chunk "inherited the spec's vetted ground" was spoken for a PR that
    INVENTED a new stored shape and identity lifetime the spec's pass never
    saw. A novel mechanism gets the pass; a skip that waves one through
    buys the review churn at ~one invariant clause per round. Corollaries
    from the same PR's tail: adopt a reviewer's rule wording VERBATIM the
    first time and grep-sweep every sibling phrasing in the same round
    (three rounds were the same sentence restated too strongly); merge
    main before every ready comment (a parallel PR cost a full round); and
    a "CI green" claim requires the run to EXIST first — an empty check
    rollup reads as green to a wait loop that only greps for "pending".

## RF28

28. **Main's post-merge CI was red for eleven hours across six merges,
    and nobody read it — a hardware walk found it.** Every PR check was
    green; every push to main then failed its `deploy` job (`deploy:
    refusing — host checkout is dirty`, four empty shell-redirect
    droppings on the production host — RF20's class, one machine over).
    #255, #259, #260, #258, #261 and #263 all merged through it; v0.32.0
    was tagged, uploaded to TestFlight and walked at the erg against a
    server frozen at v0.31.0 that could not accept its own headline
    feature. The first save James tried failed. **A PR's green checks say
    nothing about the run its MERGE produces.** `gh run list --branch
    main --limit 5` is part of every release gate (RELEASING.md step 0)
    and every phase-close gate, and the post-merge ritual says which
    conclusion main's run reached, not just that the PR's did.

## RF29

29. **Leaving dead code behind with no ROADMAP row to remove it (James,
    2026-09-04).** `openExternalUrl`'s native arm lost its last caller when
    PR1.75b moved the account link to `ASWebAuthenticationSession`. The
    Task 2 review of PR2 flagged it, the ruling was "decide at the
    whole-branch review", the whole-branch review never returned to it, and
    it shipped — with `@capacitor/browser` still a dependency for a code path
    nothing could reach. It was found again only because the walk-fixes spec
    happened to need that same arm. **When a change makes code
    unreachable — an arm, a helper, a plugin, a CSS block — the same PR adds
    a ROADMAP row naming what is dead, why, and what removes it.** A
    "decide later" ruling is not a row; it lives in a PR body, which is a
    presentation (RF14). Deleting the consumer and leaving the dependency is
    RF5 with a package name.

## RF30

30. **Ruling an option OUT of a design gate on a cost nobody measured
    (James, 2026-09-06).** A gate's option list is where James decides, so
    every stated cost in it selects the design — and an invented cost
    selects the wrong one. The Library keyboard gate offered two fixes and
    dismissed the second, painting the strip the tab bar leaves exposed, as
    "guessing a height the platform won't tell us." Nobody tried it. James
    picked the first on that basis, it was built, reviewed and pushed —
    and the branch review then found that hiding the bar deletes the whole
    main navigation on a 1.21x pinch-zoom (`visualViewport.height` is in CSS
    pixels, so a zoom shrinks it exactly like a keyboard does), that it
    removes an affordance `e2e/builder.spec.ts` already tests, and that the
    rejected option needs NO height at all: you over-fill downward and the
    excess paints below the fold. The whole implementation was thrown away
    and rebuilt as six lines of CSS.
    **A cost attached to an option is a factual claim and carries the same
    evidence bar as the design itself.** Measure it, or write "untested" and
    let the gate decide with that on the table. The tell is a
    disqualifying reason that sounds like a platform limit and has no number
    beside it — this one had the shape of RF16's unsourced premise, but
    pointed at the road not taken, where nothing downstream ever re-checks
    it. Corollary: the option you are about to recommend is the one you
    tested; the one you rule out in a clause is the one that needs the
    receipt.
    **IT IS NOT ONLY DESIGN GATES, and PR #351 proved that within a day
    (2026-09-07).** A queued ROADMAP item — "also owed: a `design.spec.ts`
    assertion on the free-row tier" — was STRUCK on the stated ground that
    such a test needs a fake summary burst nobody has built. The reviewer
    asked for the receipt, and the receipt did not exist: the fake carries
    a boundary-free `deliverSummary` control that Playwright already drives
    on the programmed arm, so the strike's premise was never checked. Four
    orderings were then run and, as it happens, none folded a summary on
    the free-row End path — the conclusion survived, the REASON did not,
    and the row now carries a measurement instead of an argument.
    **Anything you remove from a queue, a slate or an option list on a
    stated cost owes the same evidence a design gate's option owes.**
    Striking an item is a decision James does not get to make again;
    "blocked on X" is a claim about X, and the cheapest version is to spend
    one probe rather than one sentence.

## RF31

31. **A fix is a new claim and gets the gate the original claim got — and
    a walk runsheet is a TIMED PROTOCOL between two machines (Phase NF,
    2026-09-06).** The Scan NFC walk runsheet went through seven PM gates;
    v1-v4 each failed on defects INSIDE the previous round's fix (a Save on
    a screen that does not exist; a diagnostic field the emitter never
    writes; a recount off by one; a plan-dependent button label), because
    the fixed steps were never walked the way the original ones were. Then
    James asked for "minimal gaps so the phone and PM5 don't time out, and
    I'm not holding my phone up without understanding why", and one
    timed-protocol pass found what five prose gates had not: the document
    contained not one duration, the controller's own turn was the clock
    that drove every other, and a "no discriminator" claim was false per
    the vendor header. **Three checks, all mechanical:** (1) re-run the
    state-machine walk over the FIXED steps — each step against the screen
    the previous step leaves the operator on, on BOTH machines (leg 1's END
    terminated the erg, so leg 2's "leave Connect Device" asked him to leave
    a screen he was not on); (2) a runsheet carries a TIMER TABLE — every
    clock, its value, what starts and clears it, and which human hold or
    controller gap can expire it — and every hold reads "hold until X, at
    most N, then Y"; (3) a count or a "we cannot tell X from Y" is settled
    by a command or the vendor's sentence, never by re-reading. Cost of
    skipping, measured: five gate rounds at roughly a PM dispatch each.

## RF32

32. **Naming the PM5 in copy where the rower is not being told WHICH
    monitor (James, 2026-09-07: "anonymize the pm5 in copy unless we are
    specifically referring to it").** The NFC sheet shipped as "Hold your
    iPhone near the PM5.", the post-scan button as `✓ PM5 found`, and the
    already-taken card as "End this PM5's current connection" — three
    lines on one surface, none of which needed the brand: the rower is
    holding a phone up to the thing they call the monitor. Fixed in
    #331. **The rule: in user-facing copy the erg's display is "the
    monitor". "PM5" appears ONLY where it is the device's own advertised
    name doing a job — disambiguating which monitor ("Looking for PM5
    432331249", "More than one PM5 has this name") or naming the source
    of a stored number where the reader must know it came from the
    machine (`MACHINE SUMMARY · PM5 · PER INTERVAL`).** The check is
    mechanical: `grep -rn "PM5" app/src --include='*.ts' --include='*.tsx'`
    over string literals, and for each hit ask "would this sentence be
    less true with 'monitor'?" — if not, it is the wrong word. Code
    identifiers, comments, wire notes and walk records are not copy and
    keep the name.

## RF33

33. **A narrowed input interface that renames the producer's field, and a
    constant whose unit no assertion can reveal (Phase LP, PR #345,
    2026-09-07).** Two defects in one function, both invisible to the
    compiler and to five green tests, and both in the number a rower reads.
    (1) `seriesRecorder.ts` marks a resting sample `r`; the domain function
    declared its own input interface "structurally what `Sample` carries" and
    spelled it `rest`. The field is OPTIONAL, so structural typing accepts
    the real `Sample` with the key simply absent — no error, no warning — and
    the rest exclusion was dead on every production path while every test,
    which built `rest` by hand, proved it worked. The app shipped an average
    James had explicitly not chosen. **When a domain function declares a
    narrow input interface described as "structurally what X carries", diff
    it against X's real declaration FIELD BY FIELD.** A renamed optional is
    invisible in exactly the direction that matters, and the fix is to make
    the field REQUIRED with `null` meaning absent, so the compiler becomes
    the gate. **And one test must build its input from the PRODUCER** — here,
    driving `createSeriesRecorder` and never naming the field at all.
    (2) `Sample.t` is DECISECONDS; the dropout cap was named, documented and
    written in seconds, so it shipped at 6.0 s while claiming 60. Four
    capture-derived literals held under either unit because **a weighted mean
    is scale-invariant** — no assertion on the RESULT could ever catch it.
    **For any test whose expected value would be UNCHANGED by a unit error,
    list the constants that would not be; those are the untested ones**, and
    pin them at a boundary with independent literals.
    _Both were found by review, neither by the author, and the author had
    already run four mutation probes that all bit._

## RF34

34. **Stating an invariant in a spec and then applying it to ONE of the places
    it governs — and defending the gap as scope (James, 2026-09-07, PR #353).**
    The spec said, in as many words, that our own teardown must complete even
    if something that can fail is awaited: `nativeSignOut` was leaving the
    device's Google session alive, so the plugin logout moved AFTER the local
    token clear, swallowed. Shipped, reviewed, PM-gated. But the SAME function
    still awaited `api("/api/auth/signout")` FIRST, so a rower offline tapped
    Sign out and stayed signed in completely — token intact, Google session
    intact, rejection unhandled at the click handler. The identical mistake,
    one line higher, failing WORSE: a plugin failure costs a chooser, a network
    failure costs the whole sign-out.
    **It survived an antagonist pass on the spec, a code review, and a PM
    gate.** The reviewer did see it and filed it as pre-existing and
    out-of-scope; I accepted that and wrote it into the ROADMAP. It took James
    asking "Is the offline fix not in this?" to move it, and the honest answer
    was that my scope argument was a habit about small diffs applied to a
    defect in the same function, of the same class, one line away.
    **A change that half-applies its own stated principle is WORSE than one
    that never stated it, because it reads as though the case was considered
    and dismissed.** The check is mechanical, not attentional: **when a spec
    states an invariant, enumerate every site in the function or module it
    governs and say for each whether it holds — before calling the scope
    settled.** And treat "pre-existing, out of scope" with suspicion when the
    finding sits inside the very function under change: pre-existing is a fact
    about history, not an argument about scope.

## RF35

35. **A FIX IS A CLAIM, AND ITS GATE CAN MISS FOR A REASON THE ORIGINAL DID
    NOT (Phase AV, PR #360, 2026-09-08).** RF31 says a fix gets the gate the
    original claim got. This is the sharper half: the gate you write FOR a
    fix can fail to bite for a reason that has nothing to do with the bug.
    Measured three times in one branch.
    (1) A reviewer proved the stale-true bug by mutating the real store to
    drop a column when the verdict is `null`. The fix added a verdict
    assertion to the real-Postgres seam test — and the mutant still passed,
    because that test's send is a 2xx and the mutant only fires on the null
    path. It needed its own test at the store.
    (2) A gate written for the resolved-once-per-send invariant flipped the
    setting inside the refresh mock. `acquireAccessToken` takes its locked
    read BEFORE refreshing, so the reassigned value still carried the old
    flag and the mutant was behaviourally identical. Moving the toggle into
    the FIRST post — the only interleaving where the retry's own read can see
    something newer — made it bite.
    (3) A fail-closed ordering claim shipped with no gate at all; a probe
    moving one write above another's validation passed 178 of 178.
    **The rule: run the reviewer's OWN mutant against your fix, not a mutant
    of your own choosing.** A fix verified by a probe you designed after the
    fix tests the fix's shape, not the defect. And when a fix's gate passes
    on the first try, ask which arm of the predicate the test actually
    reaches — (1) and (2) both passed on the wrong arm.

## RF36

36. **A COMMIT MESSAGE IS A CLAIM ABOUT ITS OWN DIFF, AND NOTHING CHECKS IT
    (Phase AV, PR #360, 2026-09-08).** A fix commit's message said it
    "removed two stray fields from link fixtures". It removed none — the
    count in the message matched exactly what was still in the tree, so the
    work had been intended and skipped, and the message read as evidence that
    it had happened. Caught by a reviewer running `git show <sha> -U0 | grep
    '^-'` and finding no such deletion.
    **Before writing a commit message, diff it against the diff:** every
    concrete claim ("removed X", "added Y", "N files") is checkable against
    `git diff --cached` in the moment it is written, and a claim that fails
    that check is worse than silence — CLAUDE.md already requires a command
    or citation behind every factual claim in a report or code comment, and a
    commit message is the one place that rule was never spelled out. This
    matters more than a PR body (RF14) because a PR body is a presentation
    that someone reads once; a commit message is what `git log` hands the
    next person forever.

## RF37

37. **MOVING A RULE IN A STYLESHEET SILENTLY CHANGES WHICH OF TWO
    EQUAL-SPECIFICITY RULES WINS, AND ONLY A REAL BROWSER CAN SEE IT (Phase
    JC, 2026-09-08).** The judged-colour rename moved the summary's verdict
    classes onto a shared family ~5000 lines UP `index.css`, above
    `.summary-row-pace { color: var(--ink) }` at identical (0,1,0)
    specificity. Later won, and **every judged row on the post-workout summary
    rendered plain ink.** The old `.summary-row-faster` had sat 30 lines BELOW
    that rule and beaten it, which is why nothing ever had to know.
    **No class-name assertion could catch it by construction:** Vitest imports
    every `.css` as `""` here AND jsdom does not resolve `var()` at all, so
    `getComputedStyle(el).color` returns the literal `"var(--judge-pace-
    slower)"`. An assertion written as `toContain("var(--x)")` **passes
    against a totally broken cascade.** `pnpm e2e` caught it. `index.css`
    already stated the rule in prose after the identical bug on a connected
    pane's hero — **prose is not a gate.**
    Two checks: **any change that MOVES a colour rule rather than editing it
    needs a browser gate**, and a repo whose client tests cannot see colour
    owes a sweep asserting that no bare class declares `color` on a
    verdict-bearing element. **Make that sweep's element list DERIVED, not
    typed out** — JC's shipped as a hand-list of eight, and a ninth judged
    cell would have narrowed it silently; it is now two censuses, one over
    source files and one that mounts every screen and forces every verdict,
    each proven red by adding a ninth cell.

## RF38

38. **A TEST WHOSE VALUE DEPENDS ON HOW IT NAVIGATED NEEDS AN ASSERTION ABOUT
    THE NAVIGATION (Phase JC, 2026-09-08).** JC's seam test has two legs that
    only test different things because leg A navigates by CLICK: the settings
    screen's inline root properties survive a client-side nav and die on a
    reload, and that asymmetry is the whole gate. The plan required the click
    in PROSE and gated nothing. Measured: swap the click for a `page.goto` and
    **every colour assertion still passes** — the boot apply repaints from
    storage, so the cell is the right colour either way — while the
    two-legs claim is silently false. A same-document sentinel, asserted
    PRESENT in one leg and ABSENT in the other, is what closes it; neither leg
    alone is sound. Generalised: **when a test's conclusion rests on a
    property of HOW it got there, that property is an assertion, not a
    comment.**
    **THE MIRROR, from Phase RN (2026-09-09): a CLICK navigation makes both
    legs BLIND where JC's reload made both PASS.** A click is same-document by
    construction, so a module's own in-memory state survives it — a storage
    seam test that navigates by click proves the module remembers, never that
    the store does. A phase whose whole claim was "the rower's choice survived
    being written down" prescribed exactly that leg and called it
    load-bearing. **Ask which process boundary a gate actually crosses**, then
    take two legs and say which one IS the gate; a same-document sentinel,
    asserted present in one and absent in the other, is what keeps them
    honest. It earned itself immediately: the first draft's setup helpers used
    `page.goto`, so its "same document" claim was false before the feature was
    even reached.

## RF39

39. **A FORCE-PUSH CAN PRODUCE NO CI RUN AT ALL, AND `gh pr checks` THEN SAYS
    "no checks reported" — ABSENT, NOT RED (2026-09-08).** After amending a
    commit message and `--force-with-lease`-ing, PR #371's head had **zero**
    runs; `gh run list` showed only the previous head's green, and a wait loop
    scoped to the new SHA would have hung forever. This is recurring failure
    28's shape one machine over: there, a PR's green said nothing about the
    run its MERGE produced; here, a PR's green belonged to a head that no
    longer existed. **Before any merge, assert the run's `headSha` EQUALS the
    PR's current head and its `conclusion` is `success`** — never that "a
    green run exists on this branch". The same trap bit a watcher in the same
    session: an `until` loop that exited on the first COMPLETED run in a list
    reported a neighbouring PR's success as this merge's.

## RF40

40. **Reading a KILLED test run as a flaky one, and retrying it into a
    machine that just proved it has no room (Phase MEM, 2026-09-08).**
    Three signatures, none of which is a test result:
    **(a) An exit code ≥ 128 is a signal death.** 137 is SIGKILL and reads
    as memory on its own, because an OS memory kill leaves no message at
    all. 134 is SIGABRT, which covers a V8 fatal OOM *and* every other
    abort, so it reads as memory only when stderr carries
    `Allocation failed` and as a plain signal death otherwise. 130 is your
    own Ctrl-C and 143 a SIGTERM — killed, but not memory.
    **(b) `pnpm exec` COLLAPSES all of them to exit 1.** Measured: raw
    node and `pnpm run` both preserve 134/137; `pnpm exec` reports 1 with
    `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL`. This matters because the
    Commands section above prescribes `pnpm exec vitest` as the scoped-run
    workaround — **the repo's own advice hides this signal**, so when you
    use that form, a kill is indistinguishable from a failure by status.
    **(c) A fork-worker OOM exits 1 AND prints a full `Test Files`
    summary.** Vitest defaults to `pool: "forks"` and each fork has its own
    4192 MB heap limit, so the parent survives. The presence of a summary
    proves nothing; the tell is `Allocation failed` on stderr.
    **Never re-run a suite showing any of the three.** `pnpm test` routes
    through `app/scripts/test-run.sh`, which says so out loud and writes
    the evidence to `app/.test-kills/`. A retry is not free: it is the
    thing that turns one kill into a lost session.
    **And the lesson that generalises past this bug:** the first draft of
    the design asserted "the system gives us no signal", derived entirely
    from measurements taken through `pnpm exec`. When a claim is that no
    signal exists, re-run it through every INVOCATION SHAPE the production
    path uses before believing it.

## RF41

41. **A CONNECTED E2E FIXTURE THAT STREAMS FRAMES MAKES EVERY ASSERTION ABOUT
    A PRE-ROW STATE DECORATION (Phase RN, 2026-09-09).** `injectFakeMonitor`
    and the Just Row capture harness both default to a streaming timeline. The
    first rowing frame OPENS THE RUN, and an open run makes
    `axes.session !== "none"`, which renders the connected surface **regardless
    of any pre-row flag, screen or setting**. So a test that waits patiently
    for the surface will find it whether or not the thing it is testing works.
    **Measured, in both directions.** A phase gating a new pre-row preference
    deleted its store's `setItem` — the mutation the whole feature's gate
    existed to catch — and **all three e2e legs passed**. On an empty
    timeline (`events: []`) the same mutation fails both. Separately, a Just
    Row capture probe waiting 20 s for the surface passed with the feature
    reverted; bounded to 4 s, under the fake's own 8 s story start, it failed
    correctly. **It hit twice in one day in two different harnesses, which
    makes it a property of the fake rather than of one test.**
    Two checks: **any assertion about a state BEFORE the first pull runs on a
    motionless fixture, or bounded below the fixture's own first frame**; and
    when such a test passes on the first try, delete the producer it depends on
    and confirm it goes red, because "the surface appeared" is the one
    observable this fake will hand you for free.

