# Testing philosophy

This document governs how Ergomatic is tested. It exists because a solo-dev
project without a formal review board needs its review standards written
down somewhere other than one person's head — so a future PR (yours or an
agent's) can be judged against the same bar, and a reviewer's "add a test"
comment can point here instead of relitigating first principles each time.

**Why this exists, concretely:** on 2026-07-28, the Phase 4 data router
mounted its `requireUser` auth guard unscoped (`router.use(requireUser)`)
instead of scoped to `/api`. Every unit test for that router either exercised
it in isolation (no SPA fallback to shadow) or via `createApp()` with
`stores: null` (so the router was never mounted at all) — 392 passing tests,
96%+ coverage, and the bug was invisible to every one of them. It shipped.
The **first real run of the new Playwright e2e harness** hit `GET /`
against the actual compose stack and got a `401` instead of the sign-in
page — a page any human opening the deployed app would have seen instantly.
Fixed same-day (`9afc5fd`) with a scoped mount and a regression test. The
lesson isn't "write more unit tests" — the unit tests were fine at the layer
they operate at. It's that **some bugs only exist at the boundary between
layers**, and only a test that exercises the real, wired-together app will
ever see them. That's why e2e is a permanent layer here, not a nice-to-have.

## 1. The pyramid

Each layer has one job. Don't ask a layer to do another layer's job (e.g.
don't re-verify Erg Book math through an e2e click, don't mock your way
around a real Postgres constraint in a "unit" test that's secretly testing
SQL).

| Layer | Lives in | Runs in | Speed | What it may assert |
|---|---|---|---|---|
| Domain | `app/domain/**` | Vitest `unit` project | milliseconds | Exact values. This is the product's math contract (pace, pain, splits, plan expansion) — no framework, no I/O, so there's no excuse for anything less than precise. Pinned to 100% coverage. |
| Stores | `app/server/stores/**` | Vitest `integration` project (Testcontainers Postgres, started through `app/server/testing/postgres.ts`, which retries testcontainers' hardcoded 10 s port-bind timeout once) | seconds | The only place SQL behavior is truth: constraints, error codes, transactions, real UUID/type coercion. If a store test passes here, it passes against real Postgres — not an approximation of it. |
| Routes | `app/server/routes/**`, `app/server/auth/**` | Vitest `unit` project (in-memory fakes) | milliseconds | Request handling, validation, auth gating, status codes — fast, because it runs against fakes. The store **contract suites** (§5) are what keep those fakes honest so "fast" doesn't mean "fictional." |
| Client | `app/src/**` | Vitest `client` project (jsdom) | milliseconds | Rendered output and behavior, queried **by role and accessible name** (React Testing Library) — never by snapshot, never by implementation detail. |
| E2E | `app/e2e/**` | Playwright, Chromium + scoped WebKit, against the real `docker compose` stack | ~1–2s per test, minutes for the stack boot | A few golden flows through the fully wired app (real server, real DB, real static-file serving) — the layer that catches boundary bugs no layer below it can see by construction (see the incident above). |

## 2. Test naming

The `it()` string names the **protected behavior**, not the mechanism. A
test failure must be diagnosable from the name alone in a CI log, without
opening the file.

**Bad:** `it("works", ...)`, `it("test 2", ...)`, `it("calls the store",
...)` — none of these say what breaking would mean.

**Good:** `it("treats the r/restMinutes upper bounds as inclusive, not
exclusive", ...)` (from `domain/validate.test.ts`) — a maintainer reading
just the name knows exactly what regressed if it fails, with no need to read
the assertions to find out.

## 3. Assertion quality

**Banned patterns** (not enforced by a rule, but a rejection in review):

- **Assert-no-throw-only** — a test whose only assertion is that the code
  under test didn't throw. This passes for almost any change, including
  wrong ones; it protects against crashes, not incorrect behavior.
- **Self-comparison** — asserting a value equals itself, or asserting a
  mock's return value equals the value you just told the mock to return.
  Nothing under test is exercised.
- **Mock-echo assertions** — asserting that a spy was called with exactly
  the arguments the test itself constructed and passed in, with no
  independent check that the *result* was correct. This proves the plumbing
  exists, not that it works.

**Mechanical subset enforced by lint** (`@vitest/eslint-plugin`, wired into
`app/eslint.config.js` for `**/*.test.{ts,tsx}`):

- `vitest/expect-expect` — every test must contain an assertion (kills the
  "test that tests nothing" class outright).
- `vitest/no-conditional-expect` — an `expect()` inside an `if`/`try`/`catch`
  can silently never run; banned.
- `vitest/no-disabled-tests` / `vitest/no-focused-tests` — no `.skip`/`.only`
  left in committed code.
- `vitest/prefer-strict-equal` — `toStrictEqual` over `toEqual`, so an extra
  `undefined` property or a wrong prototype doesn't pass silently.

Lint catches the mechanical failures above. It cannot tell you whether a
passing suite would notice a *wrong* line of code — that's a semantic
question, and mutation testing is the deep check for it.

**React 19 + jsdom: a synchronous throw inside an event handler does NOT
propagate through `fireEvent`/`userEvent`'s call frame** (learned building
PR #100's stale-global-guard test). React's discrete-event dispatch
reports the error through the global error channel instead, so
`expect(() => fireEvent.click(...)).toThrow()` passes whether or not the
handler throws — a mutation that removes the guard survives it. The
working pattern: register a `window.addEventListener("error", ...)` spy
(capturing and `preventDefault()`ing), fire the event, then await one
macrotask tick (`await new Promise((r) => setTimeout(r, 0))`) before
asserting on the captured error. Prove the probe bites: temporarily break
the guard and confirm the listener test goes red before trusting it.

**Mutation testing** (Stryker, scoped to `domain/**`,
`server/stores/**`, `server/routes/**`): flips small pieces of source
(a `<` to `<=`, a `&&` to `||`, a boolean literal) and reruns the suite. A
mutant that **survives** — the suite stayed green despite the code changing
— is source code no test actually protects. It is on-demand, never per-PR
(see §7 for why), and the review question it exists to answer is: **"do any
mutants survive in the files this PR changed?"** A survivor in a changed file
is either a real gap (write the killing test) or genuinely equivalent code
(document why, per the examples in §3.1) — never silently ignored.

Local invocation is explicit and admitted:
`pnpm mutate --concurrency 1 --mutate domain/recency.ts`.
Repeat `--mutate <exact-path>` to select several source files. Optional repeated
`--test-file <exact-unit-test>` deliberately narrows witnesses and is recorded
as such; without it, the existing native related-test policy applies. Full
configured mutation scope requires `pnpm mutate --all --concurrency 1`.
Concurrency must be an explicit integer 1–16, not a guarantee of available
memory. Missing scope/bound, globs, literal `--`, unsupported producer/config
controls, escaped paths and non-unit witnesses refuse rather than widen scope.
Commas, spaces and Unicode in a filename remain literal, never CLI CSV.

One shared owner covers Stryker. Installed Stryker10/Vitest4.1 uses one
isolated thread per outer runner; a reporter checks the actual resolved inner
pool before test bodies. The requested outer bound is preserved independently
of the private child payload. Source/index/configuration changes invalidate
the result. Native `mutation-report.json`, `mutation.html`, frozen options and
scope record live in the unique receipt directory (§16); failed sandboxes
remain there too. Command success is not an all-mutants-killed claim: the
existing survivor/threshold policy is unchanged. Stryker's native interrupt
handler returns 130 for INT; receipts retain that actual status and the
owner's cancellation cause. Hosted manual mutation keeps its original full
scope, CPU-derived concurrency and `app/reports/mutation/` artifact path.

> **This document used to call mutation testing "a phase close-out gate". It is
> not one, and calling it one was worse than saying nothing** — a gate nobody
> runs retires the suspicion that would have found the bug. There is no evidence
> of a new full baseline since 2026-07-29. The bounded September16 probes in
> `docs/testing/2026-09-16-resource-tuning.md` are targeted evidence, not a
> refreshed full score. **Running a
> mutation probe on the specific assertion you are adding is still the standing
> rule** (see §3 and CLAUDE.md's recurring failure 21) — that is a per-change
> discipline, not a phase gate. **Settled 2026-09-19 (James): the full run
> stays on-demand and is not a gate.** What remains is archiving §3.1's stale
> baseline, filed under ROADMAP's "Small, queued".

### 3.1 Baseline (run 2026-07-29, `pnpm mutate`, full scope)

> **STALE, knowingly.** Never refreshed since. It scores **7** domain modules;
> `app/domain/` now holds **29** non-test modules, so roughly three quarters of
> today's scope has never been measured. **Do not read a number here as
> current.** The original full run was written under `.superpowers/`, which is
> git-excluded and unreachable — this table is all that survives of it.

| Scope | Mutation score | Killed | Timeout | Survived | No coverage |
|---|---|---|---|---|---|
| **All files** | **74.99%** | 1297 | 1 | 287 | 146 |
| domain (all) | **88.96%** | 797 | 1 | 99 | 0 |
| &nbsp;&nbsp;domain/bulk.ts | 91.23% | 208 | 0 | 20 | 0 |
| &nbsp;&nbsp;domain/expand.ts | 88.35% | 90 | 1 | 12 | 0 |
| &nbsp;&nbsp;domain/format.ts | 100.00% | 8 | 0 | 0 | 0 |
| &nbsp;&nbsp;domain/pace.ts | 91.89% | 34 | 0 | 3 | 0 |
| &nbsp;&nbsp;domain/plans.ts | 95.07% | 193 | 0 | 10 | 0 |
| &nbsp;&nbsp;domain/suggest.ts | 87.01% | 67 | 0 | 10 | 0 |
| &nbsp;&nbsp;domain/validate.ts | 81.74% | 197 | 0 | 44 | 0 |
| server (all) | 59.95% | 500 | 0 | 188 | 146 |
| &nbsp;&nbsp;server/routes/data.ts | 70.34% | 498 | 0 | 180 | 30 |
| &nbsp;&nbsp;server/stores (all) | **1.59%** | 2 | 0 | 8 | 116 |

**`server/stores` reads near-zero BY DESIGN — this is not a real gap, don't
panic at this number later.** `vitest.stryker.config.ts` scopes mutation to
the `unit` Vitest project only (the `integration` project spins up a
Testcontainers Postgres per test file; running it per-mutant would be
prohibitively slow and would force Docker onto every mutation run).
Unit
tests only exercise the in-memory fakes, never the real Drizzle-backed store
files — so mutating the real store implementations against unit-only
coverage produces almost entirely `[NoCoverage]` mutants: the mutated line
is real production code, but no *unit* test path reaches it. The real
stores ARE tested — thoroughly — by
`server/stores/contracts/contracts.real.integration.test.ts` against actual
Postgres; that suite is just outside this scope for cost reasons. The store
**contract suites** (§5) are the parity mechanism that keeps the fakes (what
mutation *can* see) honest against the real stores (what mutation
*can't* afford to see per-run). Read `server/stores`'s mutation score as
"N/A — see contracts," not as "untested."

**Accepted-equivalent survivors** — four examples of mutants that survived
and were *correctly* left surviving, because no test can kill a mutant that
produces no observable difference in behavior:

1. `domain/validate.ts:18:3` (`ConditionalExpression`): `typeof n ===
   "number" && Number.isInteger(n)` → `true && Number.isInteger(n)`.
   `Number.isInteger(x)` already returns `false` for every non-number `x`
   per spec, so the `typeof` check is redundant with it — no input can
   distinguish the mutant from the original.
2. `domain/suggest.ts:64:17` (`BooleanLiteral`): `fellBack: false` →
   `fellBack: true` in the "no library entries of this type at all"
   early-return branch. `fellBack` is computed before this branch runs, and
   the branch is only reachable when `fellBack` is already `false` by
   construction — the `true` mutant can never be observed at that point.
3. `domain/expand.ts:99:16` (`LogicalOperator`): `p.meters !== undefined &&
   p.targetSplit !== undefined` → `||`. Every `Phase` built for a `'w'` step
   unconditionally sets `targetSplit` whenever it might set `meters`, so the
   two undefined-checks can never disagree in practice.
4. `domain/validate.test.ts`'s `"rejects num given as a numeric string"`
   test is the same reasoning turned into a documentation choice rather
   than a mutant-kill: `Number.isInteger("12")` is `false` regardless of
   any `typeof` guard, so no mutant at that guard actually depends on the
   string-vs-number distinction. The test is kept anyway as cheap,
   accurate documentation of the contract ("a numeric-string `num` is
   rejected") — not because it kills anything.

Forcing an assertion to "kill" any of these would mean asserting on a
provably-dead code path — a mutant-shaped test with no behavior behind it,
which is exactly the kind of filler this document tells you not to write.
Documenting *why* a survivor is safe to leave is the correct response, not
chasing 100%.

**An optional field that is ABSENT is not the same as one that is
`undefined`, and only one of those assertions can go red.** Neither
`noUncheckedIndexedAccess` nor `exactOptionalPropertyTypes` is set in any of
our tsconfigs, so an out-of-bounds read through a non-null-asserted helper
(`bytes[offset]!`) typechecks as `number` and evaluates to `undefined` at
runtime. A test asserting `toBeUndefined()` therefore passes for BOTH the
correct implementation, which omits the property, AND the half-fix that reads
past the buffer unguarded. Assert `Object.hasOwn(decoded, "field")` is
`false` instead: key absence is observable where `undefined` is not.
Measured 2026-09-07 (PR #350): the half-fix mutation left the seam test green
and failed only the key-absence assertion.

## 4. Coverage stance

Coverage is a **floor detector, not a goal**. It tells you code nothing
runs; it says nothing about whether what runs is *correct* (that's what §3
is for). Treat a coverage gap as a prompt to ask why, not a number to chase.

- Global ratchet: 90% statements/branches/functions/lines
  (`app/vitest.config.ts`'s `coverage.thresholds`), **raise-only** — once
  the suite clears a higher number, the floor moves up with it; it never
  moves down to accommodate a change that dropped coverage.
- `app/domain/**` is pinned to 100% via a per-glob threshold override.
  Domain is pure math with no framework or I/O excuse for gaps — every
  branch is a real workout-math decision someone will hit.
- Uncovered code gets a **behavior test**, or — only when a test genuinely
  cannot reach the line (an environment-bound wrapper, not "this was
  annoying to test") — a commented ignore with a stated reason. Real example
  from this codebase (`app/server/auth/nativeVerify.ts`):

  ```ts
  /* v8 ignore start -- thin jose/JWKS wrapper; proven by the live TestFlight
     sign-in path, not exercisable without a real Apple-issued token */
  ...
  /* v8 ignore stop */
  ```

  Never a filler test written just to move the percentage — that's coverage
  theater, and it fails §3's assert-no-throw-only ban in practice even if
  not in letter.

## 5. Contract rule

Every store has both a real implementation (Postgres, via Drizzle) and an
in-memory fake (for fast route/unit tests). The two can drift — a fake that
returns `null` where the real store throws is a fake lying about production
behavior, and every route test built on it is validating against a fiction.

`app/server/stores/contracts/storeContracts.ts` defines one
`describeStoreContracts()` suite per store, run against **both**
implementations: `contracts.fake.test.ts` (unit project, in-memory fakes)
and `contracts.real.integration.test.ts` (integration project, real
Postgres via Testcontainers). Both must pass identically. This is where the
two historical regressions are pinned permanently as named contract cases,
not just fixed and forgotten:

- `preferences`: `"empty patch throws — the 2026-07-28 empty-update
  regression"`
- `workouts`: `"non-UUID input throws — the 2026-07-28 22P02 regression"`

**Rule: a new store method ships with a new contract case in the same PR.**
A store method with no contract case is a method whose fake and real
behavior have never been checked against each other — don't add one without
also adding the case.

## 6. Readability

- **Prettier is law.** `app/.prettierrc.json` is `{}` — the defaults, on
  purpose, as the anti-bikeshed stance made literal: there is no house style
  to argue about because there is no house style, only Prettier's. `pnpm
  format` / `pnpm format:check` are the only formatting authority; CI runs
  `format:check` and fails the build on drift.
- Comments explain **constraints**, not mechanics — why a bound, a guard, or
  a workaround exists, not a restatement of the line below it in English.
  (See `nativeVerify.ts`'s ignore comment above, or `data.ts`'s comment on
  why `requireUser` is scoped to `/api` — both explain a *why* a reader
  can't get from the code alone.)
- Test files should read as executable specs: a maintainer should be able to
  skim the `it()` names in a file and come away knowing the module's
  contract, without reading a single assertion body.
- **Anti-bikeshed clause:** stylistic preferences beyond Prettier's defaults
  are out of scope for review.

## 7. What we deliberately don't do

- **No pixel-diff gates.** Pixel comparisons are brittle by nature — they
  break on font-rendering differences, sub-pixel anti-aliasing, and
  legitimate intentional restyling, and every break demands a human look at
  a diff image anyway. We get the human look via committed screenshots
  (§8) without the false-positive tax of an automated gate deciding a
  1px shift is a failure.
- **No snapshot tests.** A snapshot assertion asserts "the output is
  whatever it was last time," which is nothing legible — it can't tell a
  reviewer what behavior it protects, and it "passes" the moment someone
  runs `--update` without looking. Every assertion in this codebase names
  what it protects (§2); a snapshot can't.
- **No filler coverage.** A test written to move a coverage percentage
  rather than to protect a behavior actively makes the suite worse: it adds
  runtime and review surface while asserting nothing (§3's banned patterns).
  Coverage gaps get real tests or a documented ignore (§4), never padding.
- **No per-PR mutation testing.** Stryker's full scope takes ~1.5 minutes
  locally but is genuinely expensive to run on every push at CI scale, and
  most PRs don't touch enough domain/store/route logic to justify it.
  Mutation testing is on-demand only (`workflow_dispatch`,
  `.github/workflows/mutation.yml`) — **not the phase-close-out gate this
  document used to claim; see the note in §3** — with baseline
  scores tracked here (§3.1) — not a blocking check on every commit.

## 8. Structural design assertions

The design handoff's hard rules (`docs/design/`, `docs/design/DEVIATIONS.md`)
aren't just guidance — the non-negotiable ones are **tests**, in
`app/e2e/design.spec.ts`, run against the real rendered app in the `e2e` CI
job:

- Every visible `a, button, [role=button], input, select` has a bounding
  box of at least 44×44 (the handoff's hard tap-target minimum).
- `AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa']).analyze()` reports
  zero violations (WCAG AA, machine-checkable a11y baseline).
- Key computed styles match the token palette (e.g. body background =
  `rgb(244, 241, 232)` for `--page`, primary button background =
  `rgb(181, 52, 31)` for `--accent`). If `DEVIATIONS.md` changes a checked
  token later, **this is where that change gets asserted** — update the
  expected value here in the same PR as the deviation, not as a follow-up.

Restyling a screen (new spacing, new copy, new layout) passes as long as
these rules hold; breaking one of these rules fails regardless of how the
rest of the screen looks. This is the "machines judge rules, humans judge
aesthetics" split in enforceable form.

**New screens must register in `design.spec.ts`** — a new screen with no
entry here is a screen the a11y/tap-target/token rules aren't actually
checking. This is the hard half of the requirement, and `design.spec.ts` runs
in CI.

`app/e2e/screenshots.spec.ts` is the soft half. **Screenshot policy (James,
2026-09-16): capture only what a visual change needs, not on a schedule.**

- **Captures are documentation, not a CI gate** (2026-08-27: *"We honestly
  don't need to run these in ci. It can be part of the release skill and maybe
  a scheduled reup."*). The `chromium` project carries
  exclusions for `screenshots.spec.ts`, `touch.spec.ts` and
  `sheetScroll.spec.ts`. CI runs `--project=chromium --project=touch
  --project=webkit-sheet` — **captures are in none of them**, so a
  missing capture does not turn CI red and is not supposed to.
  **THIS IS THE THIRD PLACE THAT NAMES THE PROJECT LIST**, after
  `scripts/e2e.sh` and `.github/workflows/ci.yml`. A project added to the
  config and not to the two runners never executes; one added to the runners
  and not corrected here leaves this file lying about what CI does. The
  commit that added `touch` said there were TWO places and missed this one.
  `webkit-sheet` runs only `sheetScroll.spec.ts`: the log's fixed ancestor
  scrolls under its sheet in WebKit while Chromium's backdrop gesture does
  not reach it. Both orientations preserve the log offset and restore log
  scrolling after close; landscape also proves the long sheet can scroll.
  Local setup needs `pnpm exec playwright install webkit` once; CI installs
  both engines. See `docs/testing/2026-09-15-sheet-scroll.md` for the repro.
- **Captures are for LAYOUT or STRUCTURE changes, never wording-only ones**
  (2026-08-23). A copy diff gets no screenshot.
- **No captures for text-only work**, including release notes, version
  bumps, tags, docs and wording-only UI changes. A release is not an
  exception. Review text and run the relevant correctness tests; do not
  boot Docker or a browser merely to refresh the date or wording in a PNG.
- **Scope before launching.** For an actual layout/structure change, name
  the affected views and the visual question the captures will answer.
  Reuse applicable existing captures. List test names without booting the
  stack, then preview the chosen pattern:

  ```sh
  # From app/. Listing loads test definitions, not browsers or Docker.
  pnpm exec playwright test --project=screenshots --list
  pnpm exec playwright test --project=screenshots --list -g "<affected test names>"
  pnpm screenshots -g "<affected test names>"
  ```

  `-g` is Playwright's regex filter, **not an exact-file or narrowness
  guarantee**. Check the listed names/count before capture; do not use a
  catch-all pattern to evade the full-refresh rule. A named test may write
  multiple views/orientations: inspect that test's outputs when choosing it.
  Do not derive the test name from the PNG filename alone — helpers and
  template literals generate many filenames. The wrapper accepts one
  nonblank `-g`/`--grep` selection or `--all`; bare, empty and extra-argument
  invocations refuse before stack discovery/reaping/boot. Pass arguments
  directly, without a literal `--`. `pnpm screenshots --help` is safe and
  shows the listing command; the wrapper itself does not accept `--list`.
- **Full corpus only on James's explicit request**, using
  `pnpm screenshots --all`. The flag records deliberate command scope; it
  does not supply that permission. There is no per-release refresh, no
  automatic second run and no full refresh to make dates consistent.
  This supersedes the 2026-09-12 "regenerate broadly" / scheduled-reup rule.
  Capture-spec assertions are not CI gates; a release does not claim they
  were exercised. Correctness assertions belong in CI's test projects.
- **Commit narrowly.** Open each image you intend to commit (RF7), and
  retain only relevant, explained changes. A full-refresh request does not
  authorize committing unexplained churn. Check for pre-existing modified
  captures before running; never blanket-revert another session's work.
  Do not run twice just to distinguish rasterizer noise.

Screenshots remain heavy, manually coordinated browser/Compose work (§16).
The guard is not a memory-pressure or lifecycle adapter: use the controller's
serial validation slot, require normal pressure, and stop on a resource
event without automatic retry. Capture on the build Mac, not Linux, whose
font rendering differs. The existing fresh-database boot and `E2E_KEEP`
cleanup behavior are unchanged.

So: registering in `design.spec.ts` is part of a UI change's definition of
done. Capturing is part of layout/structure work, not wording-only work;
selecting and committing only relevant captures is part of capturing.

## 9. Fixture realism

A test's fixture is a claim about what production looks like. When that claim
is wrong, the test passes and the bug ships. Both of the worst defects this
codebase has shipped were fixture failures, not logic failures:

- **The name generator returned the same name on every press.** Its tests
  seeded an *empty* library, so four consecutive seeds produced four different
  names. Against the real 35-workout library — whose titles occupy the front
  of the generator's own word list — every seed collapsed onto the same
  first-free slot. The fix's regression test imports `LIBRARY_WORKOUTS` and
  asserts four seeds give four distinct names.
- **A whole rendering branch shipped with a WCAG Level A violation** because
  every unit test and every `design.spec.ts` sweep built `kind: "w"` rows. The
  `wu`/`r` branch — which that phase existed to preserve — had no coverage at
  all, and a collapsed warm-up card rendered a focusable button with no
  accessible name on essentially every stored workout.

**The rule:** prefer the real thing. Use `LIBRARY_WORKOUTS`
(`app/server/seed/library`), a workout produced by `fromWorkout` from stored
steps, or a fully populated form — not a
hand-built minimum. When a code path is reachable only by data you don't
normally author (a warm-up row, a bulk-imported shape, an unset baseline),
that path is *more* likely to be wrong, not less, because nothing else
exercises it.

Corollary for `design.spec.ts`: a sweep that only ever builds one variant only
ever checks one variant. If a screen renders different row kinds or states,
the sweep must visit them.

## 10. Per-file coverage

The 90×4 gate in `app/vitest.config.ts` is a **repo-wide aggregate**. A new
file can ship with entire branches uncovered and the suite still passes,
because a few thousand covered lines elsewhere absorb it. That has happened
four times here — two hand-rolled keyboard handlers and two error branches,
each needing a follow-up fix wave after a reviewer noticed.

**When you add or substantially change a file, read its own line in the
coverage table**, not just the exit code. `pnpm test:coverage` prints per-file
numbers; new components should generally reach 100% because they are small and
fully reachable. If a branch genuinely can't be reached, §4's documented-ignore
rule applies — but "the aggregate passed" is not a reason.

## 11. Verification is measured, not asserted

Three habits, each learned the same way:

- **Contrast is computed.** `--ink-4` shipped at 3.29:1 against a 4.5:1
  requirement and survived a full review, because it was judged by looking.
  Compute the ratio and put the number in the report. A design handoff's own
  accessibility note is not authority either — one of ours labelled a
  fill-vs-background ratio as fill-vs-text, off by half a point.
- **Screenshots are opened and read.** They are the PR's visual record. Two
  have shipped showing fallback dashes (no baselines seeded) or scrolled past
  the very control the phase added. Seed real data, capture, then look at the
  image.
- **Behaviour is exercised, not existence-checked.** Covered by §3, but the
  most common live instance is a retry/callback asserted with
  `expect(typeof fn).toBe("function")`. Call it and assert what changed.
- **A probe's readout has to be readable, and `console.log` is not.** Under
  `pnpm exec vitest run --project client <file>`, a client test's
  `console.log` never reaches stdout — the project runs in jsdom and jsdom
  owns the console, and `--silent=false` does not help.
  `process.stdout.write` does reach it. Measured 2026-09-12: a one-test probe
  printed `HELLO_FROM_STDOUT` and swallowed `HELLO_FROM_TEST`. **This bites
  investigative probes specifically** — the ones that dump a ring buffer and
  quote it back as evidence — and it bit one: a spike's report carried
  "verbatim" ring entries that could not have come from the command it cited.
  An assertion is unaffected; only the human-readable readout is lost, which
  is exactly the part a reader trusts. Route readouts through
  `process.stdout.write`, or write them to a file and commit it.
- **The monitor's ring is readable from an e2e run, with no dev seam.**
  When a browser-side test needs to know what the driver actually saw and
  in what order, read
  `localStorage.getItem("ergomatic:last-session-log")` after teardown:
  `useMonitorSession.ts`'s `stash()` writes that key UNCONDITIONALLY on the
  way out (the two `sessionStorage` siblings beside it are gated), so it is
  there in the production bundle the compose stack serves. Measured
  2026-09-14 on TD-5: four runs of the real free-row flow, each dumping the
  ring, settled a timing question that three attempts had guessed at — the
  answer was a **9 ms** ordering miss, invisible to every assertion in the
  suite. **Reach for this before inventing an observable.** A question of
  the form "did the app see X before Y?" has an answer already written
  down, and a new production seam to expose it is a cost the question does
  not justify.
- **A page-side event is never synchronised with one wall-clock wait.**
  `await page.waitForTimeout(n)` measures Node's clock, not the page's, so
  a single wait aimed at a window with a near bound AND a far bound can
  fail in both directions — too short and the event has not happened, too
  long and the window has closed — and the failure arrives on a loaded CI
  runner rather than on the machine where it was tuned. Every other
  `waitForTimeout` in these specs is a one-sided settling wait, which is
  safe; a two-sided one is not. **Pump instead:** offer the input on an
  interval for as long as the precondition holds (`while
  (page.url().endsWith("/justrow") && Date.now() < stopAt)`), and let the
  consequence itself end the loop. That also makes every offer satisfy the
  precondition by construction rather than by a separate assertion. TD-5's
  capture is the worked example.

## 12. What a reviewer is for

Per-task reviews in this repo have repeatedly caught things no suite could,
and the pattern is worth naming so reviews aim there:

- **Mutation-test the guard, not the feature.** Reviewers here have deleted a
  `key={}` prop, swapped positional bucketing for kind bucketing, and dropped
  an `env()` rule, then re-run — proving the test either dies or doesn't. A
  test that passes with the code removed is not a test.
- **Re-derive the arithmetic independently.** Never recompute an expected pace
  by calling the same function the component calls; hand-compute it, or read
  it off a committed screenshot.
- **Check the seams the diff doesn't show.** Client bounds against
  `app/domain/validate.ts`; fake stores against real ones (§5); a deleted
  component's CSS; whether the named e2e specs still pass locally against an
  already-booted stack, then whether the e2e job on the PR is green for the
  full suite. That split is James's tiering decision (2026-09-08) — CI owns
  the full suite, locally you run what your change touches — not a
  wall-clock saving, though a full local run does cost ~1.5x under the
  worker cap (CLAUDE.md RF1).

## 13. Self-mutation is part of writing the test

**For every behavioural test you add: break the code path it guards, run the
covering tests, watch them fail, restore, watch them pass.** Document the
mutation and both results in your task report. This is the implementer's
definition of done, not a review step.

Why it moved upstream: §11's rule ("verification is measured") was written
after reviewers kept catching tests that passed against broken code — and
then reviewers kept catching them anyway. In one phase, four of nine tasks
looped on exactly this: an epsilon suite that survived a floor-for-round
swap, a rounding guard whose removal failed zero tests, a compatibility
sweep that asserted `Number.isFinite` and stayed green while every resolved
split was corrupted by +1000. The next phase made the mutation the
implementer's job before commit: five of seven tasks cleared review with no
fix round at all, with ~30 self-mutations run before any reviewer looked.

Two rules of craft:

- **Target the mutant at the logic, not the vicinity.** A rounding predicate
  gets a value where round and floor *disagree* (31 s: `31/60*60 ===
  31.000000000000004`), not a clean value that passes either way. A pinned
  table gets a gross corruption (+1000) that must fail on real value diffs.
- **The reviewer no longer re-runs your documented mutations** — it spends
  its effort on the seams you didn't look at. That only works if your report
  states each mutation precisely enough to be trusted: what you broke, which
  tests died, that the restore is clean.

## 14. Typed-lint ratchet

`pnpm lint` first applies `app/eslint-suppressions.json` through native ESLint,
then runs the repository's whole-file membership census. The ESLint pass uses a
content cache at `app/node_modules/.cache/eslint/<sha256>.cache`. The cache
identity includes the Node version and the contents of `pnpm-lock.yaml`,
`eslint.config.js`, and `eslint-suppressions.json`; ESLint separately hashes
each source file because the runner always selects `--cache-strategy content`.
Changing any identity input selects a fresh cache instead of trusting results
produced by a different toolchain or policy.

On a cold cache, the runner lints three measured app-test slices first, then
production, server, E2E, and root configuration files in sequential processes
so their TypeScript programs are not resident together. It then runs an
authoritative `eslint .` sweep against the same populated cache: the partition
list controls memory, while the final sweep controls membership. When that
fingerprint cache already exists, the runner starts with the authoritative
sweep instead of paying eight process startups; ESLint checks any changed files
and skips the rest. An adjacent `<sha256>.complete` marker is written only after
the final sweep succeeds, so a cache left by an interrupted or failed cold run
cannot take the warm shortcut. A run with one changed TypeScript file still has
to initialize TypeScript Project Service for that process; the cache avoids
repeat rule work, not TypeScript's per-process startup cost.

Native ESLint owns diagnostics, per-file rule/count ceilings, and within-file
stale-suppression pruning; the census rejects ledger files that were deleted or
newly ignored and therefore no longer belong to ESLint's configured population.
Run `pnpm lint:prune` after removing grandfathered violations: it deliberately
runs one uncached native `eslint . --prune-suppressions` pass, then the census
removes only its invalid top-level file entries. It may rewrite only stale
native suppression counts and stale census entries. Normal lint never writes.
There is deliberately no command that regenerates the baseline.

On local macOS, `local-work.mjs` admits the routed lint workload only at normal
pressure, monitors it while it runs, and owns interruption and cleanup. The
lint runner repeats the pre-child pressure check before creating a cache or
starting ESLint. Exit 75 means no ESLint child ran because admission was
refused; it is neither a lint pass nor evidence of an OOM. Do not retry into
the same pressure window.

Five typed rules apply to production and tests:
`no-floating-promises`, `no-misused-promises`, `await-thenable`,
`only-throw-error`, and `prefer-promise-reject-errors`. Four more apply to
non-test code only: `no-unsafe-assignment`, `no-unsafe-return`,
`no-unsafe-call`, and `no-unsafe-member-access`. Unsafe server-test response
bodies are separate hardening work, iceboxed with the two compiler flags
(ROADMAP, Icebox); they are not hidden behind a
high-count allowance here.

Every TS/TSX file ESLint checks must belong to a TypeScript Project Service
project. A project-service/parser failure means omitted coverage and is never
suppressible debt. `pnpm typecheck` separately checks every E2E source and
its membership census.

ESLint bulk suppressions count violations by file and rule, not by source
location. Native pruning plus the census detect both within-file decreases and
whole ledger files that leave the lint population, but cannot detect one
same-rule violation replacing another in the same file while the count stays
equal. That same-count replacement is the sole accepted blind spot;
`CLAUDE.md` owns the no-growth and campsite policy for it.

## 15. First-failure evidence

CI captures each test command in a fresh `app/.test-evidence/<UUID>/`
directory. Vitest retains its default human reporter plus native JSON;
Playwright retains HTML plus human and JSON reports. Ordinary commands
keep their existing reporting. Recovered Playwright retries remain
report-only; ordinary command failures still block. Strict flake gating
is a separate policy decision.

The observer records exact argv, cwd, Git SHA and tracked-diff fingerprint,
installed runner/Node versions, CI run/attempt/job context, timestamps and
the real child wait status. A nonterminal receipt is written before launch,
then atomically replaced after wait. The terminal receipt fingerprints the
native report. Native JSON never supplies or overrides command status:
passing assertions followed by failed coverage remain a failed command.
Vitest's native JSON omits project identity and global unhandled errors;
those identities are unknown unless the invocation scopes a project, and
global diagnostics remain in the durable stderr log.

The workflow publishes a summary and uploads the invocation directory
under `always()`, then checks required evidence and the upload URL. The
final check adds the actual archive link to the job summary. Archives last
14 days. Within the downloaded directory, `summary.md` links the receipt,
raw streams, resources and native report. Treat raw traces/logs as sensitive:
inspect before sharing or committing; traces can contain tokens and cookies.

From `app/`, the explicit capture entry point is:

```sh
pnpm test:capture --project unit domain/pace.test.ts
node scripts/test-evidence.mjs summary <printed-invocation-directory>
node scripts/test-evidence.mjs check <printed-invocation-directory>
```

Local capture is internal to the admitted owner: one ownership lifetime,
one resource sampler, and the same native report/summary/check authority as
CI. Its printed directory is under the Git-common-directory admission
receipts, not a second outer `.test-evidence` tree. Do not wrap this command
in `test-evidence run`. No public token borrows an existing owner.

For the hosted CI observer, an omitted `--root` uses ignored
`.test-evidence` relative to cwd; an
explicitly empty root fails. Custom roots should be outside tracked source
or git-ignored. Invocation IDs are UUIDs and existing directories are refused.
Symlink path components are refused except the operating system's
`/var` and `/tmp` aliases on macOS; the resolved directory is minted once
and passed to the runner. Never point native reporting at an old invocation.

For an already-booted, owned stack, the Playwright command is
`node scripts/test-evidence.mjs run playwright -- node_modules/.bin/playwright test --project=chromium <named-file>`.
The opt-in environment variable `ERGOMATIC_EVIDENCE_TRACE=1` selects
`retain-on-failure`; otherwise tracing stays `on-first-retry`, except for
the two-test `webkit-sheet` project, which always retains failed traces.
Capture mode takes failed screenshots. Benchmark a named selection with
and without tracing before adopting it across CI.

The hosted `test-evidence run` CLI remains a **passive evidence observer**,
not a local resource admission controller. Its extracted recording helper
has no sampler or signal handlers; locally the admitted owner supplies
those lifetimes. The standalone observer does not enforce hunt budgets.
The hunt controller must defer under warning/critical/unknown pressure,
stop its owned command on rising pressure, and stop after a resource event.
Local browser probes remain deferred until detached browser ownership and
cleanup are separately demonstrated. Sending SIGINT/SIGTERM to the observer
forwards it only to its own child process group. It never kills by name or
deletes Docker resources. A signal proves termination, not an OOM cause.
After the command leader exits, the observer allows two seconds for stdout
and stderr to drain. A descendant retaining either pipe beyond that budget
leaves capture explicitly incomplete; the observer closes its read ends and
preserves the leader's actual exit. This bounds pipe draining, not test runtime.

Resources are appended once per second and at boundaries, separately from
reporter finalization. macOS records pressure (1 normal, 2 warning,
4 critical) and swap; Linux records meminfo, PSI and cgroup v2 events.
Process samples attribute PID/start-time identities observed in the child
tree, including observed detached descendants. Missing diagnostics are
explicit. Container and Docker VM measurements are unavailable without
attributable ownership; do not add their memory to host/process totals.
Short-lived descendants can escape polling, so cleanup is never certified
from a missing leader. Observed survivors make evidence incomplete and
defer another local probe.

| State | Minted | Cleared / survives |
| --- | --- | --- |
| Observer and signal handlers | One capture invocation, outside child group | Exit after child wait; SIGKILL can leave a nonterminal receipt |
| Child PID/PGID | Spawn with a new process group | Wait status preserved; disappearance does not certify descendants |
| Observed descendant identities | PID plus start time while visible in ancestry | Retained in terminal receipt; survivors recorded, never broadly killed |
| Sample timer and stream descriptors | Before/at spawn | After leader wait and bounded pipe drain, timer cleared and descriptors closed; files survive |
| Invocation directory and receipt | Fresh UUID before spawn | Never reused or automatically deleted; CI retention 14 days |
| Native JSON/HTML/test output | Invocation-scoped runner configuration | Survive child exit; absent/stale/replaced report fails evidence check |
| Containers / detached unobserved browsers | Not owned by this wrapper | Unknown; controller must establish ownership and cleanup separately |

Counts describe observed initial executions, first failures, interrupted
initial/retry attempts, recovered retries, exhausted executions and
JSON-visible suite errors separately. An interrupted initial attempt is an
observed exposure, not a failed assertion; a genuinely failed initial attempt
is retained even when a later retry is interrupted. Receipt-known termination
events remain visible even when required report artifacts are missing.
Repeated executions count initial executions; retries do not. Playwright
1.63's native JSON omits the numeric repeat index: distinct opaque spec IDs
preserve repeat-specific executions. The summary prints that ID/project and
marks the numeric index unknown. Experiments needing a numeric repeat index
or fixture RUN_ID must explicitly record or attach it. The summary's
job incidence is for that invocation's entire selected population, not a
historical per-test rate. Raw JSON retains per-test/project/repeat/retry
details where the runner supplies them. Historical exposure remains unknown
unless execution is independently evidenced.

Ordinary admission receipts also carry source SHA, a tracked index/worktree
diff fingerprint, exact invocation and per-phase argv/scope, installed tool
versions, times/status/pressure/cleanup, wrapper RSS and streamed stdout/stderr.
The fingerprint excludes untracked files and is not a complete tree identity.
Missing Git or version observations are explicitly unavailable, never invented;
the native evidence check refuses unavailable local source provenance.
Git/version subprocess probes are bounded. Configured worker limits record
CLI/env/config provenance separately from the actual concurrent worker count,
which remains unknown unless independently observed. Stream write/close errors
make local evidence incomplete/nonzero while preserving each phase's actual
wait status. Native assertions never override command failure or unresolved
cleanup, and a resource event is not an assertion failure or an OOM diagnosis.

The lightweight gates are `node --test scripts/test-evidence.test.mjs` and
`node --test scripts/test-evidence-record.test.mjs scripts/local-work/*.test.mjs`
(run serially with `--test-concurrency=1`).
It launches harmless fixture children; it does not run Vitest, a browser,
containers, or allocate artificial memory pressure.

## 16. Local resource ownership

This is the admission increment of the approved local resource design, not
the complete lifecycle or exact-subset implementation. One controller owns
serial heavy validation. Reviewers use exact-head receipts and request named
gaps; they do not duplicate full-suite runs. CI retains full correctness and
coverage gates. The existing four Vitest/three browser worker defaults have
not changed; no memory-savings figure has yet been measured.

Run these from `app/`:

```sh
node scripts/local-work.mjs status
pnpm test --project unit domain/pace.test.ts
pnpm test --project client src/session/reviewSelector.test.ts
pnpm test:list --project unit scripts/testEnv.test.ts
pnpm test --project unit scripts/testEnv.test.ts -t 'worker'
pnpm test:related --project unit --base origin/main --list
pnpm test:full --project unit --project client
node scripts/local-work.mjs recover <generation-from-status>
```

Replace examples with intended existing files/names. Unit/client paths are
exact, not substring filters or shell globs. Discovery prints the native
project/file manifest, closes its process, then execution checks exact
membership before bodies and afterward. Bare/project-only tests, unmatched
files/names, malformed controls and literal `--` refuse. Listing cannot
satisfy a push hook. Full/coverage commands require explicit projects;
integration is never included implicitly and its lifecycle remains excluded.

Pre-push executes related tests UNION mandatory unit scripts UNION
filesystem-reading client tests once, in serial bounded batches. A valid
empty related set still runs the mandatory populations. Missing history,
empty mandatory census or discovery errors refuse without a full fallback.
Changed package manifests, package-manager/workspace config, lockfiles,
Vite/Vitest config and tsconfig inputs also refuse related mode: their global
dependency impact requires an explicit full request. Unicode/newline filenames
and both rename endpoints survive the NUL-delimited changed-path producer.
Use `pnpm push:full <git push arguments>` (root or app) for deliberate full
unit/client verification inside the real hook. Its one-shot request is not
an exported mode for later pushes. Actual pushed objects must resolve to the
checked HEAD tree, and the working tree must be clean; deletion-only pushes
make no HEAD-test claim. Source/index/configuration changes during validation
invalidate its receipt and fail the push. No cross-run passed-test cache.

Pre-commit skips app lint/typecheck only for positively identified plain
documentation in the staged snapshot with no relevant unstaged input.
Executable/symlink Markdown, renames, deletions, code/config/native edits,
empty staging and classification errors keep the complete code path.
Staged conflict-marker and skill-parity checks remain; lint-staged groups
run serially and retain their partial-staging restoration. Root/docs prose
is not globally reformatted. Reuse exact-head hook evidence instead of
duplicating those heavy checks immediately before commit/push.
On lint-staged failure/cancellation, process cleanup alone cannot certify edit
restoration. A changed source/index fingerprint retains the owner, reports
unverified staging restoration and preserves lint-staged's backup for explicit
inspection/repair before recovery. Nothing automatically resets or reapplies
your edits.

| Entry point                                                                                | Current ownership                                                    |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `lint`, `lint:prune`, `typecheck`, `build`                                                 | Fixed sequential foreground pipeline                                 |
| Exact/list/related/full/coverage unit/client tests | Owner spans discovery, execution and cleanup; capture uses the same sampler |
| Pre-commit | Owner before classification/staged mutation, through all required checks |
| Pre-push | Owner spans native discovery and exact deduplicated batches |
| Mutation | Owner spans explicitly bounded Stryker; guarded inner pool and private native reports |
| Integration, browser/Compose, native, watch/dev, install/bootstrap | Not lifecycle-managed yet; controller coordination required |
| Hosted CI                                                                                  | Explicit workflow mode; not a local memory guard                     |
| Dockerfile build                                                                           | Fixed internal container build; host Docker lifecycle is not covered |

Cooperating worktrees share a private owner directory under their canonical
Git common directory. This is same-user cooperation, not a security boundary
or universal machine lock; independent clones and older revisions do not
participate. `CI=1` alone cannot disable admission. Hosted mode requires the
explicit workflow setting and GitHub-hosted runner context. Unsupported local
platforms and unavailable pressure/census observations fail closed.

Normal macOS pressure is required before heavy launch and checked during
owned work. Refusal is exit 75 (outer pnpm/Git may map it to another nonzero
status), not a test failure or pass. No automatic retries. Do not bypass the
guard with raw tools, hook suppression or an inherited-owner token. A rising
pressure event remains nonzero even if the child handles interruption with
exit zero. Status stays lightweight and reports exclusions while busy.

Cancellation targets only the current live owned child process group: INT,
five seconds, TERM, five seconds, then unresolved. It never sends SIGKILL or
kills old PIDs from a census. Missing cleanup observations or surviving
descendants retain ownership. Recovery requires the exact generation and an
exclusive maintenance barrier; this increment recovers only proven-stale
idle owners. Active/launching, malformed or partial metadata is diagnostic-only.
Do not delete owner directories or steal a lease by age. Report blocked
evidence to the controller; unrelated processes/stacks are never cleanup targets.

Each run streams resource observations and writes a terminal receipt under
`<common-dir>/ergomatic-local-work/receipts/<generation>/`. Wrapper RSS is
separate from observed child-tree RSS (KiB); this is not whole-host attribution
and must not be added to Docker VM/container totals. Receipts preserve phase
exit/signal and cleanup outcome; they do not replace Vitest's native result
reporter. Exit 137 alone proves termination, not OOM: memory causality needs
allocation or corroborating OS evidence.
