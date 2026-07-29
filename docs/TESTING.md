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
| Stores | `app/server/stores/**` | Vitest `integration` project (Testcontainers Postgres) | seconds | The only place SQL behavior is truth: constraints, error codes, transactions, real UUID/type coercion. If a store test passes here, it passes against real Postgres — not an approximation of it. |
| Routes | `app/server/routes/**`, `app/server/auth/**` | Vitest `unit` project (in-memory fakes) | milliseconds | Request handling, validation, auth gating, status codes — fast, because it runs against fakes. The store **contract suites** (§5) are what keep those fakes honest so "fast" doesn't mean "fictional." |
| Client | `app/src/**` | Vitest `client` project (jsdom) | milliseconds | Rendered output and behavior, queried **by role and accessible name** (React Testing Library) — never by snapshot, never by implementation detail. |
| E2E | `app/e2e/**` | Playwright, Chromium, against the real `docker compose` stack | ~1–2s per test, minutes for the stack boot | A few golden flows through the fully wired app (real server, real DB, real static-file serving) — the layer that catches boundary bugs no layer below it can see by construction (see the incident above). |

## 2. Test naming

The `it()` string names the **protected behavior**, not the mechanism. A
test failure must be diagnosable from the name alone in a CI log, without
opening the file.

**Bad:** `it("works", ...)`, `it("test 2", ...)`, `it("calls the store",
...)` — none of these say what breaking would mean.

**Good:** `it("treats the wu/restMinutes upper bounds as inclusive, not
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

**Mutation testing** (`pnpm mutate`, Stryker, scoped to `domain/**`,
`server/stores/**`, `server/routes/**`): flips small pieces of source
(a `<` to `<=`, a `&&` to `||`, a boolean literal) and reruns the suite. A
mutant that **survives** — the suite stayed green despite the code changing
— is source code no test actually protects. This is on-demand (phase
close-out gate today, not per-PR — see §7 for why), and the review question
it exists to answer is: **"do any mutants survive in the files this PR
changed?"** A survivor in a changed file is either a real gap (write the
killing test) or genuinely equivalent code (document why, per the examples
in §3.1) — never silently ignored.

### 3.1 Baseline (run 2026-07-29, `pnpm mutate`, full scope — see `.superpowers/sdd/task-7-report.md` for the complete run)

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
prohibitively slow and would force Docker onto every mutation run). Unit
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
  Mutation testing is an on-demand, phase-close-out gate
  (`workflow_dispatch`, `.github/workflows/mutation.yml`) with baseline
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
checking. `app/e2e/screenshots.spec.ts` capturing that screen into
`docs/screenshots/` (embedded in the phase PR body) is part of the same
requirement: **both together are part of each UI phase's definition of
done**, not an optional nice-to-have tacked on afterward.
