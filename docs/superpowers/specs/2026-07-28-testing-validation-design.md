# Testing & Validation Phase — Design

Approved 2026-07-28. A pause between Phases 4 and 5 to codify testing
philosophy and build the harnesses Phase 5's UI work will need. Grounded in
the audited current state: 323 tests / 3 Vitest projects / 5.15s wall
(1.15s Docker-less), 90-gate coverage at ~94, stock ESLint, no formatter,
Docker-dependent pre-push, zero visual tooling.

## Goals / anti-goals (James, verbatim in spirit)

Maximize automation for a single-dev project; reduce re-review cycles;
human-readable code and tests; every test earns its place. AVOID: coverage
bloat; agent-only-legible code; brittle over-corrections; LLM-as-linter
where real linters work; hooks that make worktrees painful.

## Decisions

| Question | Decision |
|---|---|
| Visual validation | **Functional e2e + structural design assertions; NO pixel-diff gating.** Screenshots auto-captured for PR bodies, never diff-asserted — humans judge aesthetics, machines judge rules |
| Tests-with-teeth enforcement | `eslint-plugin-vitest` mechanical rules per-commit + **Stryker mutation testing on-demand** (phase close-out gate; scoped to domain/, stores/, routes/) |
| Formatter | **Prettier, default config**, `eslint-config-prettier`, one mass-format commit, staged-enforced. No further stylistic lint rules — anti-bikeshed clause in TESTING.md |
| Coverage | Keep 90/90/90/90 global ratchet (raise-never-lower); `app/domain/**` pinned 100 via per-glob thresholds; coverage is a floor detector — uncovered code gets a behavior test OR a commented `v8 ignore` with a reason, never a filler test |
| Fake/real gap | **Store contract tests**: shared `describeStoreContract(makeStore)` suites run against BOTH the in-memory fakes and real Postgres; includes the two historical regressions (empty-update throw, non-UUID input) as named cases |
| Pre-push hook | Drops to **unit + client only** (1.15s, no Docker); CI is the integration/e2e gate. Worktree-friendly by construction |
| Node-version enforcement | Shared hook preamble: reads `.nvmrc`, FAILS LOUDLY with the fix command when ambient node < required. Kills the engine-warning class in every checkout |
| E2E | Playwright (Chromium only), separate `app/e2e/` layer + `pnpm e2e` + own CI job; runs against the compose stack |
| E2E auth | `POST /api/auth/test-signin` backdoor gated on `TEST_AUTH_SECRET` env being set AND the request presenting that exact secret (the e2e stack runs the PRODUCTION image, so NODE_ENV can't be the gate). Route registered only when the env is non-empty; boot logs a LOUD warning whenever active; production `.env` never defines it and `.env.example` documents it as e2e-only. Compose e2e usage passes it via an env override, never committed |
| PR screenshots | `pnpm screenshots` Playwright capture (fixed viewport, light theme) → committed `docs/screenshots/*.png`, embedded in phase PR bodies |

## docs/TESTING.md contents (the philosophy document)

1. **The pyramid with named roles**: domain (pure, 100%, exact values — the
   product's math contract) → stores (real Postgres, the only SQL truth) →
   routes (fakes for speed + contract suites keeping fakes honest) → client
   (RTL by role/name, no snapshots) → e2e (few, golden flows).
2. **Test naming**: the `it()` string names the protected behavior; a failure
   must be diagnosable from the name alone.
3. **Assertion quality**: banned patterns (assert-no-throw-only,
   self-comparison, mock-echo assertions); vitest-plugin rules that enforce
   the mechanical subset (`expect-expect`, `no-conditional-expect`,
   `prefer-strict-equal`, `no-disabled-tests`, `no-focused-tests`);
   mutation testing as the deep check with phase-close trigger and
   "surviving mutants in changed files" as the review question.
4. **Coverage stance** (floor, not goal; ignore-with-reason pattern).
5. **Contract-test rule**: every fake used in tests has a contract suite;
   new store method ⇒ new contract case in the same PR.
6. **Readability**: Prettier is law; comments explain constraints not
   mechanics; test files read as executable specs; the anti-bikeshed clause.
7. **What we deliberately don't do**: pixel-diff gates, snapshot tests,
   coverage-driven filler, per-PR mutation runs — each with its reason.
8. **Structural design assertions**: the handoff's hard rules are TESTS —
   ≥44×44 tap targets, AA contrast (axe-core), palette conformance incl.
   DEVIATIONS.md. Restyling passes; rule-breaking fails.

## Harness specifics

- **Playwright**: version registry-verified at plan time; `app/e2e/`
  (outside Vitest projects); `pnpm e2e` boots or reuses the compose stack
  (POSTGRES_PASSWORD=devpass, test-auth envs), runs Chromium headless;
  CI job `e2e` (ubuntu; compose up in job) added to needs-chain for deploy.
- **Golden flows now (pre-Phase-5 surface)**: health JSON; sign-in screen
  renders (denied notice param variant); test-signin backdoor → shell
  renders with You card; API guard (workouts 401 unauthenticated via
  browser fetch). Phase 5 adds library/builder/baseline flows to the SAME
  spec files as those screens land — e2e-per-screen becomes part of each
  UI phase's definition of done.
- **design.spec.ts**: walks every rendered screen; interactive elements'
  bounding boxes ≥44×44; axe-core WCAG AA scan; computed styles of key
  elements match the token palette. Runs in the e2e job.
- **Screenshots**: `pnpm screenshots` captures each screen (390×844 —
  the handoff's frame) into docs/screenshots/, committed; phase PRs embed
  them (per pr-body-standards).
- **Stryker**: `pnpm mutate` → domain/stores/routes scope, dashboard off,
  HTML report; CI `workflow_dispatch` job; baseline score recorded in
  TESTING.md at this phase's close; no gate threshold yet (record + review).
- **Hooks**: `.husky/common.sh` preamble (nvmrc check, fail-loud);
  pre-commit = preamble + lint-staged (prettier→eslint on staged) + typecheck;
  pre-push = preamble + `pnpm test --project unit --project client`.
- **Contract suites**: `app/server/stores/contracts/` — one
  `describeStoreContract` per store, exercised by (a) a unit-project file
  running fakes through it, (b) an integration-project file running real
  stores through it. The route-test fakes move to a shared
  `app/server/testing/fakes.ts` so contracts and route tests use the SAME
  fake implementations (no drift between what's contract-tested and what
  routes actually stub).

## Exit criteria

- TESTING.md merged; CLAUDE.md points to it.
- Prettier applied repo-wide (one commit), staged-enforced; CI green.
- vitest-plugin rules active; zero violations.
- Contract suites for all six stores pass against fakes AND real Postgres,
  including the two named historical regression cases.
- Playwright + design assertions + screenshot capture green against the
  current two screens, locally and in CI.
- Stryker runs on domain/ + stores/ + routes/; baseline mutation score
  recorded in TESTING.md.
- Pre-push succeeds in a fresh worktree with Docker stopped (proven).
- Node fail-loud proven: hook aborts under ambient Node 25 with the fix
  message.

## Out of scope

Pixel-diff baselines; iOS-simulator e2e automation (manual runbook remains);
mutation gates in CI; any Phase 5 feature work.
