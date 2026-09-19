# Wave D — The toolbox (DISSOLVED 2026-09-19)

**Dissolved by James on 2026-09-19, before it opened.** A row-by-row
refinement against `main` at `aa2be8a2` found the wave's premise false: it
existed to build "the instruments Wave C's audit needs", and Wave C needs
neither. Wave C's accessibility row asks for 44×44 targets and 4.5:1 contrast
as computed numbers, which `design.spec.ts` already gates in Playwright; its
cold-start row says in its own words that a simulator run is not its exit; and
no Wave C row reaches a connected screen.

**Where each of the twelve rows went:**

| Row | Disposition |
| --- | --- |
| Simulator as a standing instrument | KILLED. VoiceOver is not available on Simulator (Apple, "Performing accessibility testing for your app"); Dynamic Type is inert in this app on any device (0 rem, 359 px font sizes, no `text-size-adjust`); `index.css` has no animation to reduce. A simulator already runs the Swift tests (`app/scripts/ios-test.sh`, wired into `ios:build`). |
| Native fake-transport flag | KEPT — ROADMAP "Tooling". |
| Lint/type ratchet slice | Was already done, 2026-08-29. |
| Type-hardening follow-on | ICEBOX, with a trigger. |
| THREE order-dependent flakes | STRUCK — superseded by the #457 hunt (`docs/superpowers/research/2026-09-15-flake-hunt/`); `Releases.test.tsx`'s falsifiable prediction held. |
| Hunt the e2e flakes | STRUCK — the order was carried out; `stableBoundingBox` folded into FLAKE 5 as one line. |
| Integration container-contention flake | STRUCK — never reproduced; zero integration failures in CI since 2026-09-16. |
| Burst-handoff timeout race | MOVED — ROADMAP "Small, queued", keeping its `dies 2026-10-15`. |
| Mutation-testing gate | SHRUNK — the decision was already made in `docs/TESTING.md` §3; what is left is archiving the stale §3.1 baseline. ROADMAP "Small, queued". |
| Dangling `.superpowers/` citations | SHRUNK — the 8 hits in live reference material plus a CI gate. ROADMAP "Tooling". |
| e2e fixture that exercises a REST | Was already done (#204, #292). |
| Real capture witness for a wire gap | Was already done (#141, `traceModel.test.ts`). |

The body below is the wave as it stood, kept verbatim for the measurements in
it — the flake rows in particular are a dated record, not a live one.

---

## Wave D — The toolbox

**Status:** After A; **releases with Wave C**, never alone. **M.**
**Ships a tester nothing** — but two items are Wave C dependencies: simulator
coverage and native-fake reachability for connected surfaces.

**Goal:** the instruments Wave C's audit needs, and the standing traps retired
while we are in here.

- [ ] **Stand the iOS simulator up as a standing instrument.** James,
      2026-08-20: _"make sure to consider the iOS simulator."_ It is used
      nowhere — `grep -ri simulator` across the repo returns only the fake
      transport's own prose. **Wave C's accessibility audit depends on this:**
      real Dynamic Type, VoiceOver and Reduce Motion cannot be produced by
      desktop Chrome. Carries a corrected mechanism note worth keeping —
      safe-area insets DO transfer to Safari-in-simulator (webkit.org/blog/7929,
      PRIMARY), but the height model does not, because Safari's chrome collapses
      on scroll, so Safari-in-simulator is **never authoritative for a `100dvh`
      question**. **S**
      **OPEN QUESTION (Phase OD, 2026-09-09): this row's own receipt is STALE,
      and the receipt is the only thing saying the order is undone.** The row
      claims `grep -ri simulator` "returns only the fake transport's own
      prose"; re-run 2026-09-09 it returns 15 hits across
      `domain/monitor/pm5/ergMachine.ts`, `intervalIndex.ts`,
      `transports/capacitorBle.ts`, `adapters/nfcReader.ts`, `fake.ts` and six
      test files (`grep -ric simulator app`).
      The ORDER is still undone. **The receipt, with its output NAMED rather
      than summarised:** `grep -rn simulator app/scripts` returns nothing — no
      harness, no script. `grep -rn simulator .github` returns exactly ONE hit,
      `.github/workflows/ci.yml:73`, and **it does not count**: it is prose
      inside a `dist:grep` comment about `fake.ts`'s simulator, not a job. So no
      simulator instrument exists. The first draft of this row claimed the
      combined grep "returns nothing" and was wrong on the day it was written —
      which is the rule, not an anecdote: **a "grep finds nothing" sentence
      pastes its actual output and names every hit that does not count.**
      **Trigger note:** bound to Wave D, which follows Wave A, which is
      unopened — so its subject is two waves out and on no calendar.
- [ ] **Let a build flag reach the fake transport on NATIVE.** One line in
      `src/adapters/monitorTransport.ts`. Today `isNative()` sends the simulator
      down the Capacitor arm, `initialize()` rejects `BLE unsupported`, and the
      armed screen is unreachable (`capacitorBle.ts:138-145`; Apple TN2295 — the
      Simulator has no Bluetooth). **This is the same defect recurring failure
      13 records**, so fixing it retires a standing trap rather than adding a
      feature. Dev and debug builds only, proven absent from the production
      bundle by `dist-grep.sh` in both directions per recurring failure 12. **S**
- [x] **Pre-Wave-D enabling slice — the lint/type ratchet and `e2e/`
      typecheck.** James explicitly pulled this one slice forward on
      2026-08-29. Every linted TS/TSX file now has typed project ownership,
      `pnpm typecheck` covers `e2e/`, the selected typed rules use a
      prune-aware no-growth ceiling, and pre-commit is fail-fast. This did
      **not** open Wave D, advance its other work, or alter D's release-with-C
      sequencing. Detailed contract and proof:
      `docs/superpowers/specs/2026-08-29-lint-type-ratchet-design.md`. **M**
- [ ] **Finish the ordered type-hardening follow-on.** Clear and globally
      enable `exactOptionalPropertyTypes`, then `noUncheckedIndexedAccess`,
      then validate unsafe server-test response bodies before reconsidering
      the four unsafe-`any` rules there. Do not queue
      `noPropertyAccessFromIndexSignature` without a real failure class; its
      current volume is mostly access style. **M**
- [ ] **THREE order-dependent flakes now — two seen during Phase JC's release
      (2026-09-08/09), both filed here rather than shrugged at.** · dies
      2026-11-14 · dated on the way past (campsite rule) by the 2026-09-14
      flake hunt, which refuted (a)'s stated mechanism but did not reproduce
      any of the three; the trigger below is real but a trigger is not a
      schedule. Neither
      reproduced alone or on a re-run of the same command, so both are
      ORDER-dependent rather than broken tests, and both were observed by
      different agents in different worktrees.
      (a) `e2e/connected.spec.ts`'s genuine-`QuotaExceededError` leg failed
      once in a full run (550/551), passed alone, then passed 551/551 twice.
      **Its stated mechanism is REFUTED, measured 2026-09-14.** This row
      said the test "fills origin storage to a real quota error, which is
      exactly the shape that makes a suite order-sensitive — a neighbour
      that writes to the same origin afterwards would see a full store".
      A neighbour cannot: `playwright.config.ts` sets no `storageState` and
      reuses no context, so every test gets a fresh one and localStorage is
      partitioned per test. Proved with a throwaway two-test probe in one
      serial file — A wrote `zz.probe.key` and read it back (so the write
      genuinely happened), B on the next test read `null`. Whatever is
      order-dependent about this leg, **it is not the origin store it
      fills**, and a hunt that starts from leaked localStorage starts in the
      wrong place.
      **A real robustness gap it did surface, FIXED in the same pass:**
      `fillOriginStorage` was called OUTSIDE the `try` whose `finally` cleans
      the junk up, so a throw in the headroom-freeing block between them left
      the store full with no cleanup at all. The fill and the freeing now sit
      inside the `try`, with `added` declared above it so the `finally` can
      still see it.
      (c) **A THIRD, unit project, seen 2026-09-14** in this branch's pre-push:
      `server/routes/data.test.ts` > "Phase LP: rejects a malformed per-split
      machine field {machineDragFactor:256}, naming it" asserted 400 and got
      **401**. Same signature as (a) and (b): it passed alone immediately after
      (387/387, `--project unit server/routes/data.test.ts`), the same suite had
      passed in full two commits earlier on the same branch, and the commit that
      hit it changes `ROADMAP.md` and nothing else — so it cannot be a
      regression. Not a signal death either (RF40): exit 1 with a real
      assertion diff and a complete `Test Files` summary, not 137/134 and no
      `Allocation failed`. **INFERENCE, not measured:** 401 is the auth
      middleware refusing, and this test's subject is body validation that never
      runs if auth rejects first — so the leak is most likely a neighbour
      resetting or replacing the auth stub, which makes it a MOCK-lifetime
      question rather than a storage one. That is a different mechanism from
      (a)'s refuted origin-storage theory and from (b)'s client-only shape, so
      the three may not share a cause at all.
      (b) `src/news/Releases.test.tsx`'s "renders each release's version,
      date, and every item" failed once in a full `--project client --project
      unit` run and passed both alone (6/6) and on an immediate full re-run
      (286 files, 7937). Client-project only, so unrelated to (a)'s origin
      storage.
      **SIGHTED A SECOND TIME 2026-09-14** (PR #434's `app` job, run
      `34845000865` attempt 1, head `08eac824`) — **the trigger this row
      names has now FIRED.** Same file, same test. The branch touched ZERO
      files under `app/src/` (its diff is e2e specs and markdown), so it
      cannot be a regression, and there is no signal-death signature in the
      log: no `Allocation failed`, no 137/134 (RF40 checked before the
      re-run, not after).
      **THE NEW FACT, and it narrows the hunt more than the second sighting
      does: the failure is `Test timed out in 5000ms` on a SYNCHRONOUS
      test.** `Releases.test.tsx:32` is `it("…", () => {` with no `async`
      and a plain `renderReleases()` — there is nothing in it to await. A
      synchronous render exceeding five seconds is not a statement about
      the test's logic; it is the worker not being scheduled. The run's own
      numbers agree: 8,940 tests, `Duration 292.55s` of which
      `environment 210.12s`.
      **SIGHTED A THIRD AND FOURTH TIME 2026-09-15** (PR #452's `app` job, run
      `34973719187`, head `da58d1b9`, under `pnpm test:coverage`). Same
      file, same test, same `Test timed out in 5000ms` on the synchronous
      test. The branch touches `driver.ts`, `eventLog.ts`, `ergMachine.ts`
      and their tests — **nothing `Releases.test.tsx` reads**, so again it
      cannot be a regression. RF40 checked BEFORE the re-run: zero
      `Allocation failed`, zero 137/134, and vitest printed a full summary
      (9,083 passed of 9,085), so this is its own 5 s timeout and not a
      kill. `Duration 320.77s`, `environment 223.87s` against the second
      sighting's 292.55/210.12, and this run carried coverage
      instrumentation, which is the slowest shape the suite runs in.
      **THE FOURTH CAME THE SAME MORNING, on the very commit that
      recorded the third** (run `34975109761`, head `f3b5a2f9`, whose only
      diff from the last green head is this ROADMAP row — so the fourth
      sighting is as close to a pure re-run as the record gets). Same file,
      same test, same 5 s timeout; RF40 clean again (zero `Allocation
      failed`, exit 1, full summary of 9,083 passed of 9,085).
      **AND ITS DURATION WAS NOT WORSE: `297.66s` / `environment 210.26s`,
      within a second of the second sighting's 210.12.** The third
      sighting's write-up above originally read those numbers as a
      worsening trend; that clause has been REMOVED rather than appended
      to, because the fourth falsifies it. Slow runs and flaking runs are
      not the same population, so duration is a correlate at best and
      cannot be used to predict a sighting or to excuse one. Four sightings, all four under a full-suite run,
      none ever alone.
      **That makes (b) evidence for FLAKE 2's runner hypothesis rather than
      a separate puzzle** — and unlike (a), whose stated mechanism was
      refuted, this one has a mechanism nobody has argued against yet.
      **AND IT PASSED ON A WHOLE-SUITE RE-RUN OF THE IDENTICAL COMMIT** —
      run `34845000865` attempt 2, all seven jobs green at head
      `08eac824`. Stated with the attempt named, because RF42's whole point
      is that "green on re-run" is a claim about a specific attempt or it
      is nothing; and re-run in the WHOLE-SUITE form, never
      `gh run rerun --failed`, which would have run a different population
      and could not have answered the question (the trap FLAKES 1-3 share).
      **SIGHTED A THIRD AND FOURTH TIME 2026-09-14, and this is the
      escalation: both were MAIN's own post-merge runs, eleven minutes
      apart.** Same file, same test, same `Test timed out in 5000ms`, `app`
      job, attempt 1 each time. Run `34876650602` at head `8486a349`
      (17:45 UTC, the 13-package Dependabot bump, #440) and run
      `34877745107` at head `b6ede012` (17:56 UTC, TD-5's capture, #442).
      **`b6ede012` touched ZERO files under `app/src/`** — one e2e spec,
      `ROADMAP.md` and one PNG — so it cannot be a regression, and its
      whole-run re-run (attempt 2, all seven jobs including `deploy`) went
      green on the identical commit. `8486a349` is the one sighting that is
      NOT diff-innocent, since it moved 13 packages; what clears it is
      `a3292ba2` (#441), which CONTAINS that bump and passed at 17:51
      between the two failures. Numbers from `b6ede012` attempt 1, for the
      runner hypothesis: 356 files, 9,033 passed, `Duration 298.85s` of
      which `environment 210.82s`.
      **Why the escalation matters more than the count:** sightings 1-2 were
      branch runs, where someone is watching. These two are RF28's exact
      shape — main red after a merge, with nothing but the post-merge ritual
      standing between that and eleven hours of nobody reading it. Twice in
      fifteen minutes on the same afternoon.
      So (b) is now: four sightings, two sourced whole-run re-runs, and a
      mechanism — and with (d) below, the family has its first LOCAL
      occurrence, which is what makes "starved scheduler" rather than
      "uncapped pool" the shape worth instrumenting.
      **THE OPEN QUESTION, scheduled before the order (Phase OD's rule),
      and it took one read to find:** `vitest.config.ts:11` is
      `maxWorkers: isCI() ? undefined : workerCap(…, 4)`. The cap that
      exists to protect a laptop is **INERT IN CI BY DESIGN** — vitest
      falls back to its CPU-derived default there. Combine that with the
      fact already recorded under the integration-flake row below (the
      `maxWorkers` key sits on the ROOT `test` block, so unit, client and
      integration files share ONE pool, and each integration file starts
      its own `PostgreSqlContainer`) and CI runs its default pool against
      containers, under v8 coverage instrumentation (`pnpm test:coverage`),
      with all three projects in one invocation.
      **"UNCAPPED" WAS WRONG, MEASURED 2026-09-15, and the word is removed
      rather than softened.** `undefined` does not mean unbounded: vitest's
      own `getDefaultThreadsCount`
      (`node_modules/vitest/dist/chunks/cli-api.CnMVyzaz.js:2354`) returns
      `Math.max(availableParallelism - 1, 1)` off watch — **3 workers on a
      4-core `ubuntu-latest`, which leaves a core free and is more
      conservative than the local cap of 4.** So the contention in CI is
      real but it comes from the containers and the coverage
      instrumentation, not from a worker count nobody capped, and there is
      nothing here to cap: picking a number now would be RF30.
      **THE ACTUAL MECHANISM, FOUND 2026-09-15, and it is the test's own
      cost.** `Releases.test.tsx:32` was QUADRATIC in the length of
      `RELEASE_NOTES` — one `screen.getByText` per release and per item,
      each scanning the whole rendered tree, so cost = queries x tree size
      and BOTH halves grow per release. Measured on truncated copies of the
      real list: 13 releases 35.3ms, 26 releases 83.1ms, 39 releases
      174.7ms, 52 releases 361.3ms — **4.3x for 2x the list.** And the list
      grew underneath it: **31 entries on 2026-09-01, 52 on 2026-09-14**
      (`git show <sha>:app/src/news/content/releaseNotes.ts | grep -c
      'version:'` walked back over its history), so the test's cost roughly
      TRIPLED across the fortnight in which this flake went from one
      sighting to four. **Why this test out of 6,254:** ranked by duration
      with each `it(` classified sync or async, it was the SLOWEST
      SYNCHRONOUS client test by 3.1x over the runner-up (541ms against
      175ms). A synchronous test's whole duration is CPU on its worker, so
      it is exactly the population that stretches under contention — at
      541ms it needed a **9.2x** stretch to miss the deadline where every
      other synchronous test needed 28x or more.
      **FIXED in #452 (`8db5c58d`, test file only): the test now walks the
      rendered section list once instead of querying the tree 256 times.
      541ms -> 106ms, and linear, so it stops degrading per release.** It
      also asserts strictly MORE than the version it replaces — restoring
      the old body, a mutant reversing section order and a mutant dropping
      the date both PASSED against it, so the test's own title had promised
      a date it never checked.
      **WHAT THIS DOES NOT PROVE, and the falsifiable prediction that
      settles it:** the flake has hit ZERO times locally and only ever
      under CI load, so no local green is evidence of a fix — it was never
      reproduced and cannot be. **If this test times out again after
      `8db5c58d`, the quadratic cost was NOT the cause**, and this row goes
      back to the contention lead with that result recorded. Margin is now
      51x rather than 9.2x.
      **`test-run.sh`'s capacity banner prints the runner's real core count
      on every CI run and nobody has read one yet** — capture that reading
      next time regardless of whether the flake returns; it is the one
      number this whole hunt kept assuming.
      **CORRECTION, 2026-09-14, same day it was filed:** this row first
      said "a two-core runner". **That was never measured** — it was the
      shape of an explanation, which is exactly what RF16 forbids. The
      repo is PUBLIC, and GitHub's standard `ubuntu-latest` for public
      repositories is documented as larger than two cores, so the number
      was probably wrong as well as unsourced. **Nothing in CI prints the
      runner's core count or vitest's resolved worker count today**, so
      neither figure can be recovered from the logs we already have.
      **THE FIRST THING THIS ROW OWES IS THEREFORE THE INSTRUMENT, NOT THE
      EXPERIMENT** — print `os.availableParallelism()` and the worker count
      vitest actually resolved, so the next red run carries its own
      explanation. A before/after on a capped pool is the SECOND step and
      is meaningless before the first: capping to a number we have not
      measured against a baseline we cannot see is guessing twice.
      **Deliberately NOT changed in #434.** Capping CI workers is a cost
      nobody has measured (RF30) and would slow every run.
      **(d) THE FIRST LOCAL SIGHTING, 2026-09-15, and it is evidence FOR the
      runner hypothesis rather than against it.** During Wave A PR2's Task 1,
      `attempts.integration.test.ts`'s neighbour
      `"refuses a contradiction — manual with a deviceName — with a 400
      naming the field, and persists nothing"` failed once in a full
      `--project integration` run and passed on the next TWO runs of the
      identical command and tree.
      **And a SECOND local test, same day, same shape:**
      `frontDoorRoutes.integration.test.ts`'s `"anonymous start request 121
      is rejected after 120 shared admissions"` failed twice in separate
      probe runs and passed on two consecutive re-runs of the identical tree
      (532/532 both times). **Ruled out as a budget collision, not assumed:**
      it lives in a different file from the work in flight, builds its own
      app in `beforeEach`, and TRUNCATEs — so a neighbouring file's `begin()`
      calls cannot consume its 120 admissions. Different tests, different
      projects from (b); same shape.
      **Why it matters more than a fifth tally mark:** every prior sighting
      was in CI, where the hypothesis is an UNCAPPED worker pool
      (`vitest.config.ts:11` makes the cap CI-inert). This one ran with
      `ERGOMATIC_TEST_WORKERS=2` on a laptop the same session had just
      measured at **58 MB of free pages, 3.1 GB inactive, Docker's VM at
      1.1 GB RSS**, with a background task KILLED for low memory minutes
      earlier. So the common factor across CI and local is not the worker
      COUNT, which differed by an order of magnitude — it is a starved
      scheduler. **That narrows the instrument this row already owes:**
      printing `os.availableParallelism()` and vitest's resolved worker
      count is still step one, but memory pressure at the moment of failure
      belongs beside them, or the local half of this evidence stays
      unexplainable.
      **RF40 check, stated because it is the trap here:** this was NOT a
      signal death. Exit was a normal vitest failure with a `Test Files`
      summary and no `Allocation failed` on stderr, so it is a test result
      and re-running it was legitimate.
      (c) A third, on the SAME release run: `pnpm e2e` returned `553 passed`
      with exit 1, and the two immediately following full runs both returned
      `554 passed`. **Which test failed was not captured** — the tail showed
      only the progress line — so this one is logged as an occurrence rather
      than a suspect, deliberately: guessing the test from a progress line is
      how a flake hunt chases the wrong file.
      **Trigger:** the flake hunt below, or a further sighting of any of the
      three. **S**
- [ ] **Hunt the e2e flakes.** James, 2026-08-20: _"post release lets hunt down
      the flake."_ Its trigger ("immediately after v0.15.0 ships") fired
      2026-08-20. **STRUCK 2026-09-09 — the manual-door tap-target flake
      (399/401, then 401/401 twice) is DONE**, fixed in `1602248e` (#150) two
      days after this order was given; the finding is below and the strike is
      applied HERE rather than left to a NEXT, because a row that carries its
      own correction twenty lines below its claim is the contradiction, not
      the record of one. **ONE named flake remains unresolved:**
      `design.spec.ts`'s `stableBoundingBox` flake (`e2e/helpers.ts:89`). #152
      landed evidence capture for a _third_ flake and produced
      `docs/superpowers/research/2026-08-22-e2e-readiness-gate-flake.md`.
      **The `stableBoundingBox` flake was sighted again on 2026-09-08**
      (Phase MT, filed as its own row at first and folded in here — a new
      datapoint, not a new flake): `design.spec.ts:3541`, "picking a effort
      level does not shift the chips below it", failed once in a 547-test
      parallel run, then passed in isolation immediately after AND on a full
      re-run of the same tree. It compares a chip's `y` before and after a
      click through that same helper, so the suspicion is LOAD rather than
      the assertion. CI retries once, so it costs a red PR check at worst.
      **M**
      **TRIGGER ALREADY FIRED — 2026-08-20, and 20 days have passed.** The row
      says so itself. This is the order that falsified "passive triggers are
      the problem": it had an ACTIVE trigger, the trigger FIRED, and nothing
      happened, because the question underneath it had no owner.
      **ANSWERED 2026-09-09 — it is THREE live producers, not four, and one of
      the four was already fixed.** The shared-producer read that this row's own
      NEXT called for has run; findings, each with the evidence that settled it:
      - **The manual-door tap-target flake is DONE, and has been since
        2026-08-22.** Both halves landed in `1602248e` ("The warm-up leaves
        (Phase WU)", #150): the `h1.summary-title` waits in `design.spec.ts` and
        the atomic `$$eval` in `assertTapTargets`. Measured 114/120 early gates
        before, 0/120 after — the figures come from
        `docs/superpowers/research/2026-08-22-e2e-readiness-gate-flake.md`,
        NOT from `git log -S`, which this row used to cite for them and which
        does not produce a rate. **It was fixed two days after this
        order was given and this row has claimed it open for the eighteen days
        since** — which is the row's own lesson about itself.
      - **Phase JC's `connected.spec.ts` origin-poisoning row is the SAME TEST
        as Wave D's (a)** — both are the S3 genuine-`QuotaExceededError` leg and
        its `fillOriginStorage` halving fill. Merge them; nobody would hunt them
        as two. **And its stated mechanism is FALSE:**
        `grep -rn "storageState\|launchPersistentContext\|userDataDir" e2e/
        playwright.config.ts` returns NOTHING, so every test gets a fresh
        context and origin partition and browser storage cannot survive into a
        later run. Whatever fails a warm-stack sign-in, it is not this test's
        leftover `localStorage`. Same RF16 shape as SR-13's falsified premise.
        **MEASURED 2026-09-14, not just grepped** — a throwaway two-test
        serial probe wrote a key in A and read `null` in B — and the (a) row
        above now carries that receipt, so nobody re-derives this a third
        time. That pass also moved `fillOriginStorage` inside its own `try`.
      - **`stableBoundingBox` stands alone.** It polls the real box and throws
        after 20 rAF, so it has no proxy-signal defect; what fails is its settle
        budget against genuine layout work. Load is an amplifier, not a
        producer — the research doc's §4 measured the same unchanged build at
        73% then 95%, moving the metric the WRONG way.
        **HUNTED 2026-09-14 AND NOT SOLVED, said plainly rather than
        closed.** The sighted test (`design.spec.ts`, "picking a effort level
        does not shift the chips below it") was read end to end and its
        screen's async inputs enumerated: `Builder.tsx` early-returns on
        `baselinesState` loading, so the chips do not exist until baselines
        are ready, and the only other async input, `useWorkouts`, feeds AUTO
        NAME alone and moves no layout. **No late-arriving element above the
        chips was found**, which is what a settle-budget story needs. That
        leaves the mechanism unestablished, and fixing it on a guess is how
        the wrong layer gets chased.
        **What DID land: the helper now throws with the whole frame-by-frame
        trajectory, not only the last box.** A box still travelling in one
        direction is layout that had not finished; one that jumped once and
        held is a different bug. The instrument was proved to fire both ways
        (a zero-frame budget reports 1 entry, a never-satisfied settle
        condition reports 21) — so the next sighting names the mechanism
        instead of adding a datapoint. **The row stays open until it does.**
      - **The integration/container-contention class stands alone.** Different
        runner, different pool: `vitest.config.ts`'s `maxWorkers` sits on the
        ROOT `test` block, so unit and client files share one pool with the
        integration files that each start their own `PostgreSqlContainer`.
      **A candidate for SR-13, tagged INFERENCE and NOT acted on:**
      `LogSession.tsx` reads `workoutIsGlobal` from React state, and that file's
      own comment describes the reported symptom — while the library is still
      loading at save time it "honestly reads 'not the designated test' and the
      save navigates exactly as before", i.e. straight to Today. A network
      response resolving in Playwright is not the instant a fetch callback's
      `setState` commits. **What this does NOT explain is SR-13's `down -v`
      correlation** — a colder stack should make a race worse, not better — so
      either that correlation is an n=2 artifact or there is a second mechanism.
      Do not fix on this until the correlation is explained.
      **NEXT (≤0.25): fold Phase JC's row into Wave D's (a).** The manual-door
      strike is DONE (applied at the head of this row, 2026-09-09). After the
      fold this row is two producers, not four, and `stableBoundingBox` is the
      only one with no diagnosis.
- [ ] **A THIRD flake class: integration, under container contention.**
      `server/routes/isolation.integration.test.ts` failed once with
      `expected 401 to be 400` on 2026-09-01, and a second run of the same
      full sweep failed a different test
      (`server/routes/data.test.ts`'s baseline-delete case) instead. Neither
      reproduced: the unit project passed 3/3 alone, integration 301/301
      alone. It appears only when `--project unit --project client --project
      integration` run together and several Postgres containers start at
      once, so the working theory is resource starvation rather than test
      pollution — but nothing has been measured and the auth-boundary
      symptom (401 where a 400 was expected) deserves better than a shrug.
      Distinct from the e2e flakes above and from the two unit-project ones
      further down; filed at the PM gate on #255 rather than left in a PR
      comment (recurring failure 14). CI runs the projects separately and
      has stayed green throughout. **S**
- [ ] **The burst-handoff tests race their own timeout, so a failure there
      cannot say what failed.** The four ~2.3s tests in
      `app/src/workout/WorkoutDetail.postReleaseCommit.test.tsx` each wait out
      `BURST_HANDOFF_HOLD_MS` (2000ms) on the real wall clock, and each sets
      its `waitFor` budget to `BURST_HANDOFF_HOLD_MS + 3000` = **5000ms,
      exactly equal to vitest's `testTimeout`**. The two clocks are tied, so
      under any slowdown the TEST timeout can win the race and report a bare
      `Test timed out in 5000ms` with no assertion detail — the same
      uninformative signature the `Releases.test.tsx` hunt spent two days
      reading, on a different file. **No sighting yet**; found by ranking
      every client test by duration while chasing that flake, where these
      four are the top four at ~2.3s against a 541ms runner-up. Their time is
      a deliberate sleep, not CPU, so they are a DIFFERENT class from the
      quadratic cost fixed in #452 and a cap would not touch them.
      **What would fix it now:** give those `waitFor` calls a budget strictly
      below `testTimeout`, or raise `testTimeout` for that file alone, so a
      failure names the assertion that never settled. **Not doing it here
      because** it is a different file and a different mechanism from the one
      #452 was opened for, it has no sighting behind it, and that file's own
      comments say fake timers are unusable in this stack — so changing a
      timing constant there needs its own reading rather than riding a
      news-screen test fix. James ruled KEEP at #452's hand-back,
      2026-09-15. **S** · dies 2026-10-15 · a latent timeout race in another
      file with no sighting yet; folding it into a news-screen fix would put
      two unrelated risk models in one review
- [ ] **Settle the mutation-testing gate, one way or the other.**
      `docs/TESTING.md` explicitly demoted the full `pnpm mutate` run from an
      unrun phase gate to an on-demand probe; its only baseline is still
      2026-07-29 and covers 7 domain modules against today's 29. Either make
      a current full run a real enforced gate with an owned cadence, or keep
      it on-demand and retire the stale baseline as evidence. **S/M**
- [ ] **The 23 dangling `.superpowers/` citations across 14 tracked files.**
      That directory is git-excluded and unreachable to anyone but the session
      that wrote it. _"A dangling citation is worse than no citation, because it
      reads as evidence."_ Affected: `app/src/monitor/driver.test.ts`,
      `docs/monitor/pm5-interface-notes.md`, and twelve files under
      `docs/superpowers/` (seven plans, four specs, one research note).
      **Do NOT create `docs/superpowers/sdd/` to make the paths resolve.** **S**
      **Counted 2026-09-04, not carried** — the citation count was right and
      the FILE count read 11 and was wrong:
      `git grep -ln "\.superpowers/[A-Za-z0-9]" 2f258006 -- . ':!*.html'
      ':!CLAUDE.md' ':!ROADMAP.md' ':!.claude/agents/pm-ledger.md'` lists the
      fourteen, and the same grep without `-l` counts the twenty-three. Two
      choices in that command are what make the number mean what the row says:
      the pattern requires a character AFTER the slash, so a bare mention of
      the directory is not counted as a citation into it; and the three
      excluded files DISCUSS this debt rather than cite into it. `docs/TESTING.md`
      and two `docs/history/` files mention the directory and are therefore
      NOT in the fourteen — an earlier version of this row named the first of
      them. The per-user-gate branch briefly took the count to 27 and
      re-pointed its own four at a tracked spec before merge, so that work
      leaves the debt unchanged.
- [ ] **An e2e fixture that exercises a REST.** The `est-left` spec's criterion
      6 is HALF MET: no fixture drives `state: "resting"` with a scripted rest
      value. **S**
- [ ] **A real capture witness for a wire gap.** #140 removed three tests and
      lost the witness for a genuine >3 s gap breaking the trace line. It is
      **un-bound from the hardware walk:** `adapters/monitorTransport.ts:70`
      composes the recorder on the WEB arm only, so the laptop leg had the
      recorder and no gaps while the phone leg had gaps and no recorder. New
      home: a deliberate web-leg capture, or extend the recorder to native. **S**

**Exit:** the accessibility audit can run on real assistive technology; the
simulator reaches a connected screen; the lint/type slice remains green; no
tracked file cites a path that does not exist; and the named flakes,
mutation-gate decision, REST-bearing fixture, wire-gap witness, and ordered
type-hardening follow-on are each completed or explicitly disposed.
