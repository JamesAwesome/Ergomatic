# The lint and type ratchet — design

## What and why

Ergomatic's current checks are green, but they leave three useful classes of
mistake outside the fence: typed promise/`any` failures, Playwright code that
TypeScript never checks, and a pre-commit hook that can report success after
lint-staged fails. This change makes those failures mechanically harder to add
without turning the existing codebase into a cleanup project. Existing typed
lint debt is grandfathered by ESLint's own suppression mechanism, every
relevant edit must leave its campsite better, and TypeScript flags are enabled
only when their debt is genuinely zero.

**Status:** James-approved pre-Wave-D enabling slice; approved for
implementation on 2026-08-29. This does **not** open Wave D.
James explicitly pulled forward this one repository-enforcement slice on
2026-08-29; Wave D remains **After A**, all other Wave D work remains queued,
and its release remains paired with Wave C. The normal Wave D phase-open PM and
antagonist gates remain due before any other Wave D work starts.

Pre-wave review gates: **PM GO_WITH_CHANGES** after the sequencing boundary
above was made explicit; **antagonist GO** after the full project-owned lint
population, E2E membership census, and real-hook oracle were added.

This is one pulled-forward piece of Wave D infrastructure. It changes no
rower-visible behavior, number, stored shape, authentication contract, or PM5
interaction. It adds no dependency.

## Evidence at the current baseline

Baseline: `07f0c7f5c99f40cd744f6c4f9d650421885c9789` (`main`, after #225).

- The one TypeScript ESLint block extends only the untyped `recommended`
  configuration and has no parser project service
  (`app/eslint.config.js:19-45`). `pnpm lint` is currently clean.
- `pnpm lint` is one unqualified `eslint .` invocation and `pnpm typecheck`
  checks the app projects plus a separate server project
  (`app/package.json:14-18`). CI calls those same two entry points
  (`.github/workflows/ci.yml:49-71`), so they can remain the single owners of
  enforcement.
- `tsconfig.app.json` includes `src`, `domain`, and `scripts`, but not `e2e`
  (`app/tsconfig.app.json:14-21`). The existing ROADMAP item correctly names
  the missing coverage, but its inherited count of 14 errors is stale
  (`ROADMAP.md:403-407`). A current strict probe over E2E plus both declaration
  owners — `src/vite-env.d.ts` and the global `Window` declaration in
  `src/monitor/transports/index.ts:115-138` — finds two real errors: nullable
  DOM queries at `app/e2e/design.spec.ts:4241-4244`. Omitting the monitor
  declaration owner produces 12 additional missing-`Window` diagnostics; those
  are a probe-configuration defect, not product findings.
- A current compiler probe finds zero `noImplicitReturns` diagnostics in the
  app and server projects. `noImplicitOverride` finds one:
  `ProgramBusyError.name` overrides `Error.name` without `override`
  (`app/src/monitor/driver.ts:290-297`).
- The high-debt compiler flags are not switch-sized changes:
  `exactOptionalPropertyTypes` reports 71 diagnostics in the app project and
  7 in the server project; `noUncheckedIndexedAccess` reports 242 and 405.
  Those project counts overlap in shared `domain` files and therefore must not
  be presented as unique-error totals. `noPropertyAccessFromIndexSignature`
  reports 290 and 205, dominated by access style rather than a demonstrated
  failure class.
- On the pre-design typed-lint probe, all of
  `recommendedTypeChecked` produced 1,826 diagnostics across 227 files plus 69
  out-of-project parser failures. It increased a clean lint run from 6.46 s to
  52.6 s. The largest rule alone, `no-unnecessary-type-assertion`, produced
  1,319 findings. That is cleanup volume, not a coherent first correctness
  gate.
- The first selected-rule probe produced 109 diagnostics but also exposed 86
  project-service ownership failures: all 15 E2E files, 69 server files,
  `playwright.config.ts`, and `vitest.stryker.config.ts`. That number is
  **rejected as an adoption baseline**: an unowned file is omitted population,
  not a zero-diagnostic file.
- Running the same rules over the server files with their real project adds 482
  diagnostics, all in 14 test files: 408 unsafe member accesses, 37 unsafe
  assignments, 33 unsafe calls, 3 unsafe returns, and 1 misused promise.
  `server/routes/data.test.ts` alone contributes 340 unsafe member accesses.
  A file/rule allowance of 340 would not meaningfully fence that test.
- A second probe temporarily gave every intended file real project ownership
  and scoped the four unsafe-`any` rules to non-test code. It produced zero
  project-service fatals and **56** diagnostics in 14.12 s: 26 floating
  promises, 18 misused promises, 2 non-thenable awaits, 4 unsafe assignments,
  1 unsafe return, 2 non-Error throws, and 3 non-Error promise rejections.
  `no-unsafe-call` and `no-unsafe-member-access` are enabled but have zero
  production debt. This is the adoption candidate; the committed suppression
  file generated from the implemented configuration is the final authority.
- The temporary E2E project covered all 15 `e2e/**/*.ts` files plus
  `playwright.config.ts`: an exact filesystem-versus-`tsc --listFilesOnly`
  census returned 16 expected, 16 actual, no missing or extra project files.

The hook defect is reproduced, not inferred. In a clean worktree at the
baseline, a temporary staged TypeScript file containing only a `debugger`
statement made lint-staged fail with `no-debugger`; the following typecheck
passed; `.husky/pre-commit` exited **0**. The cause is sequential commands with
no fail-fast boundary (`.husky/pre-commit:1-3`). The probe file was unstaged and
deleted, and the worktree was proven clean before this spec was written.

## Research and does-it-exist result

- **PRIMARY — ESLint:** bulk suppressions exist specifically to enforce a new
  error-level rule on new code while leaving existing violations to be fixed
  over time. ESLint creates a committed `eslint-suppressions.json`; when a
  violation disappears, an unused suppression makes lint exit non-zero until
  `--prune-suppressions` removes it. The same documentation says suppressions
  are matched by file path. [ESLint bulk suppressions](https://eslint.org/docs/latest/use/suppressions).
- **PRIMARY — typescript-eslint:** `parserOptions.projectService` uses the same
  TypeScript project service as editors, automatically finds a TSConfig for
  each file, and supports project references. The maintainers explicitly cite
  avoiding lint-only TSConfigs with divergent compiler options as a benefit.
  [Typed linting with Project Service](https://typescript-eslint.io/blog/project-service/).
- **PRIMARY — typescript-eslint:** `recommendedTypeChecked` is a suggested
  starting point, but projects may configure their own rules; the strict
  configurations are more opinionated, and `strictTypeChecked` is not stable
  under semantic versioning. That supports selecting the rules tied to this
  audit's failure classes instead of importing a noisy bundle wholesale.
  [Shared configurations](https://typescript-eslint.io/users/configs/).
- **PRIMARY — TypeScript:** `noImplicitReturns` checks that every code path in
  a value-returning function returns, while `noImplicitOverride` protects a
  subclass from silently drifting when a base member is renamed.
  [noImplicitReturns](https://www.typescriptlang.org/tsconfig/noImplicitReturns.html),
  [noImplicitOverride](https://www.typescriptlang.org/tsconfig/noImplicitOverride.html).
- **NOT FOUND:** TypeScript exposes the high-debt flags, but no first-party
  equivalent of ESLint's committed, prune-aware suppression ledger was found.
  A custom diagnostic counter would be a new mechanism that can hide one
  error replacing another. This design does not invent it.

The underlying system therefore **has** the incremental-adoption concept for
ESLint and **does not expose one** for TypeScript compiler diagnostics. The two
tools deliberately get different rollout strategies.

## Contract

After this change:

1. A new selected typed-lint violation fails local lint and CI when its
   file/rule pair has no allowance or when it increases an existing allowance.
   Same-count replacement inside one grandfathered file is the explicit blind
   spot in “Honest limitation” below.
2. Existing selected-rule debt can stay in place, but its suppression ledger
   must not grow without James explicitly approving adoption of a new rule.
3. Removing a violation makes normal full lint fail until the ledger is
   pruned, so improvements cannot disappear silently.
4. A focused edit does not owe whole-file cleanup. It does owe safe, local
   cleanup of relevant debt in the function, test, or behavior already being
   changed.
5. Every TypeScript/TSX file ESLint checks — including `playwright.config.ts`
   and `vitest.stryker.config.ts` — belongs to a discoverable TypeScript
   project. Parser fallbacks are not accepted as typed coverage. E2E membership
   is proven by set equality between the filesystem census and the E2E
   project's `tsc --listFilesOnly` output.
6. `pnpm typecheck` checks Playwright E2E source as well as the existing app,
   domain, script, config, and server source.
7. The pre-commit hook stops at and returns the first failing gate.

The ratchet is **raise-only**, not warning-based. Selected rules are errors;
the implementation must not use `--pass-on-unpruned-suppressions` in the full
lint/CI path.

## Typed ESLint boundary

Enable type information with `parserOptions.projectService` and explicitly
enable this correctness subset:

| Concern              | Rules                                                                                   | Scope                | Failure class fenced                                                                          |
| -------------------- | --------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------- |
| Promise control flow | `no-floating-promises`, `no-misused-promises`, `await-thenable`                         | Production and tests | Lost rejection, async callback used where its promise is ignored, or `await` on a non-promise |
| Unsafe boundaries    | `no-unsafe-assignment`, `no-unsafe-return`, `no-unsafe-call`, `no-unsafe-member-access` | Non-test code        | An unchecked `any` value crossing into trusted application code                               |
| Error contracts      | `only-throw-error`, `prefer-promise-reject-errors`                                      | Production and tests | Throwing or rejecting with a value that does not obey the Error contract                      |

Promise and Error rules apply to tests because a floating assertion helper or
bad rejection can make a red product look green. The unsafe-`any` rules do not
apply to `**/*.test.{ts,tsx}` or `e2e/**` in this slice: Supertest's untyped
`response.body` dominates the server-test population and would create a
340-count blind allowance in one file. Validating those response bodies is
valuable, but it is a separate API-test-hardening task, not useful debt to
grandfather. Production code receives all nine rules immediately.

Do **not** import all of `recommendedTypeChecked` or `strictTypeChecked` in this
slice. Defer `no-unnecessary-type-assertion`, `require-await`, `unbound-method`,
non-null bans, template restrictions, `no-confusing-void-expression`, and
`no-unnecessary-condition`. Their current volume is dominated by cleanup,
style, or test idioms; none is needed to make the selected gate work.

Project-service parse failures are gate failures, never suppressions. The
implementation may add or reposition normal TSConfigs so `src`, `domain`,
`scripts`, `playwright.config.ts`, `vitest.stryker.config.ts`, `server`, and
`e2e` all have project ownership, but it must not create a second set of
compiler semantics only for ESLint.

## Suppression ledger and campsite rule

The initial ledger is generated once, only for the nine named rules, after
project ownership is complete. There is deliberately no permanent
`lint:baseline` or `lint:suppress` package script: a convenient regeneration
command would turn the ceiling into a button.

Normal commands are:

- `pnpm lint` — applies the committed ledger and rejects new or stale debt;
- `pnpm lint:prune` — removes suppressions whose violations were fixed, then
  leaves normal lint green.

Canonical LLM instruction in `CLAUDE.md`:

> **Typed-lint ratchet and campsite rule.** Existing debt in the committed
> ESLint suppression ledger may only decrease. Never add or regenerate a
> suppression to make a change pass; adopting a new suppressed rule requires
> James's explicit approval. When changing code that carries grandfathered
> debt, remove suppressions for violations in the function, test, or behavior
> being changed when doing so is safe and local, then run `pnpm lint:prune`.
> Do not expand a focused change into unrelated cleanup.

`AGENTS.md` remains the thin Codex pointer to `CLAUDE.md`; copying this policy
there would create two authorities. `docs/TESTING.md` records the commands,
selected rules, limitations, and how to interpret the ledger. It does not
restate agent authority.

Normal lint mechanically detects additional diagnostics only while the ledger
is unchanged. A contributor can edit the ledger just as they can disable a
rule in `eslint.config.js`; preventing deliberate gate edits would require a
base-branch comparison plus an authenticated approval channel. This slice does
not invent that machinery. The no-growth rule is therefore enforced by the
canonical LLM instruction, the required suppression-count line in the PR, and
James's diff review. The spec does not call that boundary mechanical.

### Honest limitation

ESLint bulk suppressions are file/rule based. A same-rule violation can replace
another in the same legacy file without increasing that file's allowance. The
campsite rule and review constrain that case, but the mechanism does not prove
line identity. A custom fingerprint engine or mandatory whole-file cleanup
would close it at much higher complexity; James explicitly chose not to impose
whole-file cleanup. New files have no allowance and are fully fenced.

A scratch probe also settles staged-file behavior: with suppressions in two
files, linting or pruning only one did not treat the unvisited file as unused
and did not alter its ledger entry. lint-staged can therefore use the same
ledger safely. A same-rule, same-count replacement in the visited file remained
suppressed, confirming the limitation above rather than merely inferring it
from the JSON shape.

## TypeScript compiler boundary

This slice enables only zero/near-zero-debt compiler checks:

- add `noImplicitReturns` to every applicable compiler project;
- add `override` to `ProgramBusyError.name`, then enable
  `noImplicitOverride`;
- give `e2e` a real strict TypeScript project with its Playwright/Node inputs,
  `src/vite-env.d.ts`, and the existing global `Window` declaration owner in
  `src/monitor/transports/index.ts` (or extract that declaration once without
  duplicating it);
- replace the two nullable DOM assumptions in `design.spec.ts` with an explicit
  runtime assertion that fails the test intelligibly if either required
  element is absent;
- make `pnpm typecheck` invoke the E2E project.

The E2E project is a checking/editor boundary, not a production-build input.
`pnpm build` must not begin compiling Playwright into either bundle.

Two high-value flags remain ordered Wave D work:

1. `exactOptionalPropertyTypes` — absence versus explicitly present
   `undefined`; clean its current debt, then enable it globally
   ([TypeScript reference](https://www.typescriptlang.org/tsconfig/exactOptionalPropertyTypes.html)).
2. `noUncheckedIndexedAccess` — indexed reads become possibly undefined; clean
   its larger debt after exact optionals, then enable it globally
   ([TypeScript reference](https://www.typescriptlang.org/tsconfig/noUncheckedIndexedAccess.html)).

They are not called “ratcheted” before they are enabled. ROADMAP records the
work honestly; it does not claim a count that no gate enforces.
`noPropertyAccessFromIndexSignature` is not queued automatically: revisit it
only if a real finding justifies the mostly stylistic churn.

## Hook and CI ownership

`.husky/pre-commit` becomes explicitly fail-fast. Its permanent regression
test executes the real hook with a fake `node -v` returning Node 26 and a fake
`pnpm` that records invocation order. It proves all three outcomes:

1. lint-staged returns sentinel 17 → typecheck is not run and the hook returns
   17;
2. lint-staged passes, typecheck returns sentinel 23 → the hook returns 23;
3. both pass → the hook returns zero.

The small shell test joins the always-running `scripts` CI job. It protects the
hook's control-flow contract without staging real files or depending on the
current lint corpus. The controlled Node preamble is required because that CI
job does not otherwise install Node 26; a preamble rejection is not evidence
about hook sequencing.

No new CI job is added. Existing `pnpm lint` and `pnpm typecheck` calls own the
new behavior. lint-staged uses the same ESLint configuration for staged
TypeScript files; the full lint path remains authoritative for pruning the
repository-wide ledger.

## Proof plan

Implementation is not accepted merely because the final commands are green.
Record each temporary corruption and its red result, restore it, then prove
green. Every red proof records the expected rule ID, TypeScript diagnostic, or
hook call sequence; a generic non-zero exit caused by the wrong failure does
not count.

1. add an unsuppressed floating promise in a zero-allowance file → lint fails;
2. exceed a temporary file/rule allowance of one with two violations → both
   violations fail;
3. remove one grandfathered violation without pruning → full lint fails for an
   unused suppression; prune → ledger shrinks and lint passes;
4. replace one grandfathered same-rule violation without changing its count →
   lint passes, recording the known blind spot rather than claiming it is
   fenced;
5. run the permanent hook test against the current sequential hook → it fails;
   apply fail-fast control flow → all three cases pass;
6. reintroduce one E2E nullable dereference → typecheck fails; restore the
   runtime assertion → typecheck passes;
7. remove `override` after enabling `noImplicitOverride` → typecheck fails;
   restore it → typecheck passes.
8. compare every `e2e/**/*.{ts,tsx}` path plus `playwright.config.ts` against
   `tsc --listFilesOnly` → exact set equality; omitting any one E2E file makes
   the census fail.

The final branch gate is lint, format check, typecheck, the permanent shell
tests, the full unit/client/integration suite, coverage, build, `dist:grep`, and
E2E. The `override` edit touches `app/src/`, so the repository's standing rule
requires E2E even though runtime behavior is unchanged. There is no layout
change, so screenshots are not required.

## Repository record and delivery

One coherent infrastructure PR carries:

- the typed ESLint project/rules and committed suppression ledger;
- the TypeScript flags, E2E project, and two local fixes;
- the fail-fast hook and regression test;
- the canonical `CLAUDE.md` ratchet/campsite rule;
- operational detail in `docs/TESTING.md`;
- the PM and antagonist rulings in their respective ledgers;
- `ROADMAP.md` replacement of the stale standalone E2E checkbox with this
  explicitly pulled-forward slice, plus the ordered exact-optional and
  indexed-access cleanup items;
- the Wave D exit amended so its flake disposition, mutation-gate decision,
  REST fixture, and wire-gap witness are all owned before that wave can close;
- the unsupported “three Wave C dependencies” claim corrected to the two
  dependencies the slate actually names: simulator coverage and the native
  fake path needed to reach connected surfaces.

This is not fast-path work: the diff changes repository-wide enforcement, and
a mistaken gate can create a durable false green. It gets an independent code
review. The pull-forward PM ruling is GO_WITH_CHANGES: this one slice may move
now because James explicitly requested it, but it does not change F → A → D,
advance Wave D's other work, or trigger D's phase-open gates. Those gates still
review the complete Wave D slate when that wave actually opens.

## Exit criteria

1. Every linted TS/TSX file, including `playwright.config.ts` and
   `vitest.stryker.config.ts`, has typed project ownership; no parser fallback
   or project-service fatal remains. The E2E filesystem/list-files census is
   exact.
2. The nine named rules are errors, current debt is committed once, a new
   zero-allowance or count-increasing violation fails, and a removed violation
   forces pruning; the same-count replacement blind spot is demonstrated and
   stated.
3. The suppression total never increases during implementation after its
   initial creation; any campsite cleanup decreases it.
4. `noImplicitReturns` and `noImplicitOverride` are enabled, with the
   `ProgramBusyError` mutation proving the latter bites.
5. `pnpm typecheck` covers E2E and the nullable-DOM mutation proves it bites.
6. The hook returns the first failure; its three-case regression test runs in
   the always-on scripts job by executing the real hook with controlled Node
   and pnpm boundaries.
7. `CLAUDE.md`, `docs/TESTING.md`, and `ROADMAP.md` carry one canonical policy,
   one operational explanation, and one forward-looking work record without
   duplicating authority.
8. The PM and antagonist ledger entries preserve the sequencing ruling and the
   probe techniques that corrected the first false baseline.
9. All final branch gates pass, and the PR presents the measured lint runtime
   cost and final suppression count rather than calling the ratchet free.
