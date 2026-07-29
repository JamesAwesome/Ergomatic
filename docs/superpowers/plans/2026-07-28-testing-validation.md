# Testing & Validation Phase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Codify the testing philosophy and build the harnesses (contracts, e2e + design assertions, mutation testing, formatter, ergonomic hooks) before Phase 5's UI work.

**Architecture:** Prettier + `@vitest/eslint-plugin` move assertion/format policing into tooling. Shared fakes get contract suites run against both fake and real stores. Playwright lives outside Vitest (`app/e2e/`) against the compose stack via a secret-gated test-signin route. Stryker is on-demand, scoped. Hooks become Docker-less on push with a fail-loud Node check.

**Tech Stack (verified 2026-07-28):** prettier 3.9.6, eslint-config-prettier 10.1.8, **@vitest/eslint-plugin 1.6.24** (NOT eslint-plugin-vitest — abandoned since 2024), @playwright/test 1.62.0, @axe-core/playwright 4.12.1, @stryker-mutator/{core,vitest-runner} 9.6.1.

**Spec (binding):** `docs/superpowers/specs/2026-07-28-testing-validation-design.md`

## Global Constraints

- Node 26 via PATH prefix on every command incl. git commit/push until Task 3 lands the fail-loud preamble (after which the hooks enforce it themselves — still prefix for non-hook commands).
- Branch `testing-phase`. Main PR-only; rebase-merge at end.
- Re-verify each version above at its install step; never substitute from memory.
- Format-only changes live in their own commit (`style:` prefix) — never mixed with logic.
- The test-signin backdoor: registered ONLY when `TEST_AUTH_SECRET` env is non-empty; request must present the exact secret; boot warns loudly when active; never in host `.env`.
- Contract principle: fakes mirror REAL store behavior (incl. throwing); routes guard, stores don't forgive. The two historical regressions are named contract cases.
- Coverage ≥90 throughout; domain 100 per-glob threshold lands in Task 2.
- e2e is Chromium-only; screenshots 390×844 (handoff frame), light theme.

---

### Task 1: Prettier adoption

**Files:**
- Create: `app/.prettierrc.json` (`{}` — defaults, the anti-bikeshed stance in file form), `app/.prettierignore`
- Modify: `app/package.json` (devDeps + `format`/`format:check` scripts), `app/eslint.config.js` (append eslint-config-prettier LAST), root `package.json` lint-staged (prettier before eslint), `.github/workflows/ci.yml` app job (`pnpm format:check` after lint)

- [ ] **Step 1:** `npm view prettier version` (expect 3.9.6+); `cd app && pnpm add -D prettier eslint-config-prettier`
- [ ] **Step 2:** `.prettierignore`:

```
dist
coverage
drizzle
ios
pnpm-lock.yaml
```

Scripts: `"format": "prettier --write ."`, `"format:check": "prettier --check ."`. eslint.config.js: `import prettierConfig from 'eslint-config-prettier'` and add `prettierConfig` as the LAST array element. Root lint-staged becomes:

```json
  "lint-staged": {
    "app/**/*.{ts,tsx}": [
      "pnpm --dir app exec prettier --write",
      "pnpm --dir app exec eslint --max-warnings 0 --no-warn-ignored"
    ],
    "app/**/*.{json,css,md,html}": "pnpm --dir app exec prettier --write"
  }
```

- [ ] **Step 3:** Commit tooling only: `chore: add prettier + config wiring`
- [ ] **Step 4:** Mass format: `pnpm format`, verify `pnpm lint && pnpm typecheck && pnpm test` all still green (formatting must not change behavior — the suite is the proof), commit separately: `style: prettier mass-format (no logic changes)`
- [ ] **Step 5:** CI: add `- run: pnpm format:check` after the lint step. Commit `ci: enforce formatting`.

---

### Task 2: Vitest lint rules + coverage per-glob thresholds

**Files:**
- Modify: `app/eslint.config.js`, `app/vitest.config.ts`, any test files the new rules flag

- [ ] **Step 1:** `npm view @vitest/eslint-plugin version`; `cd app && pnpm add -D @vitest/eslint-plugin`
- [ ] **Step 2:** eslint.config.js — add a test-file block BEFORE the prettier element:

```js
import vitest from '@vitest/eslint-plugin'
```
```js
  {
    files: ['**/*.test.{ts,tsx}'],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      'vitest/expect-expect': 'error',
      'vitest/no-conditional-expect': 'error',
      'vitest/no-disabled-tests': 'error',
      'vitest/no-focused-tests': 'error',
      'vitest/prefer-strict-equal': 'error',
    },
  },
```

- [ ] **Step 3:** `pnpm lint` — fix every violation PROPERLY: a flagged test either gains a real assertion or is deleted as filler (list each fix in the report; `toEqual`→`toStrictEqual` churn is mechanical and fine).
- [ ] **Step 4:** vitest.config.ts coverage: add per-glob domain pin inside `thresholds`:

```ts
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
        'domain/**/*.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
      },
```

Run `pnpm test:coverage` — if domain isn't at 100, close the gap with BEHAVIOR tests (the known candidates: expand.ts test-step branch, suggest edge paths) or a commented `v8 ignore` with a reason. No filler.
- [ ] **Step 5:** Full verify + commit `test: vitest assertion rules + domain 100% pin`

---

### Task 3: Hook ergonomics — fail-loud Node, Docker-less push

**Files:**
- Create: `.husky/common.sh`
- Modify: `.husky/pre-commit`, `.husky/pre-push`, `CLAUDE.md` (hook description update)

- [ ] **Step 1:** `.husky/common.sh`:

```sh
# Shared hook preamble: enforce the .nvmrc Node major, loudly.
required_major="$(cat "$(git rev-parse --show-toplevel)/.nvmrc" | tr -d 'v \n')"
current="$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1)"
if [ -z "$current" ] || [ "$current" -lt "$required_major" ]; then
  echo "HOOK BLOCKED: Node >=$required_major required, found ${current:-none}." >&2
  echo "Fix: nvm use $required_major   (or: export PATH=\"\$HOME/.local/share/nvm/v26.5.0/bin:\$PATH\")" >&2
  exit 1
fi
```

- [ ] **Step 2:** `pre-commit` becomes:

```sh
. "$(dirname "$0")/common.sh"
pnpm exec lint-staged
pnpm --dir app typecheck
```

`pre-push` becomes:

```sh
. "$(dirname "$0")/common.sh"
# Unit + client only: fast (~1s) and Docker-free. CI runs integration + e2e.
pnpm --dir app test --project unit --project client
```

- [ ] **Step 3: Prove the exit criteria.** (a) Node fail-loud: `env PATH="/usr/bin:/bin" sh .husky/pre-commit; echo "exit: $?"` → expect the BLOCKED message + nonzero exit (ambient node absent or v25 → blocked either way; capture actual output). (b) Worktree + Docker-less: `git worktree add /tmp/erg-hook-test HEAD`, then from INSIDE the worktree root (`cd /tmp/erg-hook-test`): `cd app && pnpm install --frozen-lockfile && cd ..` then run the hook script directly with the Node-26 PATH prefix: `sh .husky/pre-push` → expect unit+client green with zero testcontainers/Docker lines in the output. Clean up: `git worktree remove --force /tmp/erg-hook-test`. Capture both outputs in the report.
- [ ] **Step 4:** Update CLAUDE.md hooks line (pre-push = unit+client; CI = full gate; Node enforced by hooks). Commit `chore: fail-loud Node hooks; Docker-less pre-push`

---

### Task 4: Shared fakes extraction

**Files:**
- Create: `app/server/testing/fakes.ts`
- Modify: `app/server/routes/data.test.ts`, `app/server/auth/native.test.ts` (and any other file defining inline store fakes — grep `as unknown as SessionStore|as unknown as UserStore|FakeStores|fakeStores`)

**Interfaces:**
- Produces: `makeFakeStores(): Stores` (complete per-user in-memory implementation of all six stores mirroring real signatures) + `makeFakeSessions()` / `makeFakeUsers()` for auth tests. Behavior-faithful TO THE REAL STORES as of today (Task 5 tightens throw-parity). Route tests keep their per-test spies by wrapping (`vi.spyOn`) rather than re-implementing.

- [ ] **Step 1:** Extract the existing fake implementations from data.test.ts into `testing/fakes.ts` verbatim (they're already per-user maps); export a factory. Update data.test.ts + native.test.ts to consume it (spies via `vi.spyOn(stores.planState, 'set')` etc. replacing bespoke `vi.fn` wiring where present).
- [ ] **Step 2:** Full suite green — THE refactor proof is zero assertion changes (report must state "no test assertions modified"). Exclude `server/testing/**` from coverage (add to vitest exclude list).
- [ ] **Step 3:** Commit `refactor(test): shared store fakes`

---

### Task 5: Store contract suites

**Files:**
- Create: `app/server/stores/contracts/storeContracts.ts`, `app/server/stores/contracts/contracts.fake.test.ts` (unit project), `app/server/stores/contracts/contracts.real.integration.test.ts`
- Modify: `app/server/testing/fakes.ts` (throw-parity fixes), `app/vitest.config.ts` (unit include gains `server/stores/contracts/*.fake.test.ts` if not already matched)

**Interfaces:**
- Produces: `describeStoreContracts(makeStores: () => Promise<StoresUnderTest>, opts: {label: string})` — a suite-of-suites callable with either implementation. `StoresUnderTest` = the six stores + a `makeUser(): Promise<string>` seam (real: insert into users; fake: register an id).

- [ ] **Step 1:** Write `storeContracts.ts` covering, per store, the CONTRACT cases (each an `it()` with a behavior-naming string). Minimum set — including the two named historical regressions:
  - baselines: get-null-before-set; put/get round-trip; partial put preserves other field.
  - preferences: defaults-without-insert; round-trip; **`put(userId, {})` THROWS (named: 'empty patch throws — the 2026-07-28 empty-update regression')**.
  - workouts: create/list/get round-trip incl. isGlobal decoration; num-clash → StoreConflictError; update/remove cannot touch globals; **`get(userId, 'not-a-uuid') THROWS (named: 'non-UUID input throws — the 2026-07-28 22P02 regression')**; cross-user invisibility.
  - logs: create bumps done_n atomically (verify via planState.get); list scoped; lastDonePerWorkout grouped + scoped.
  - planState: set zeroes doneN; reset; get-null-default.
  - testHistory: append computes delta vs same-distance prior; list scoped.
- [ ] **Step 2:** `contracts.real.integration.test.ts`: Testcontainers + migrate + real stores through the harness. Run it FIRST — the real behavior is the specification. Capture which cases the REAL stores fail (expect: none; they define truth).
- [ ] **Step 3:** `contracts.fake.test.ts`: fakes through the same harness. RED expected on throw-parity (fakes today return null on bad UUID, accept empty patch). Fix `fakes.ts` to mirror real behavior (throw `StoreConflictError`/errors where real throws; a tiny uuid-shape check + empty-patch throw). Route tests must STAY GREEN (routes guard before stores — if a route test breaks, that's a real finding: report it, don't paper it).
- [ ] **Step 4:** Full suite + coverage; commit `test: store contract suites — fakes provably mirror real Postgres`

---

### Task 6: test-signin backdoor + Playwright scaffold + design assertions + screenshots

**Files:**
- Create: `app/server/auth/testSignin.ts`, `app/server/auth/testSignin.test.ts`, `app/playwright.config.ts`, `app/e2e/flows.spec.ts`, `app/e2e/design.spec.ts`, `app/e2e/helpers.ts`, `app/scripts/e2e.sh`, `app/scripts/screenshots.sh`, `app/e2e/screenshots.spec.ts`
- Modify: `app/server/app.ts` (conditional route registration via AppDeps), `app/server/index.ts` (env read + loud warning), `app/server/testDeps.ts`, `.env.example`, `app/package.json` (scripts), `.github/workflows/ci.yml` (e2e job + deploy needs), `app/.gitignore`/`.prettierignore` (playwright-report, test-results), `docs/screenshots/` (captures)

**Interfaces:**
- `AppDeps.testAuthSecret: string | null` (default null in testDeps). When non-null, `POST /api/auth/test-signin {secret, email?, name?}` → 401 wrong secret; else find-or-create user (googleSub `test:<email>`, default `e2e@test.local`), mint session, set cookie, 200 `{user}`. When null: route absent (404).
- `pnpm e2e` → `scripts/e2e.sh`: ensures compose stack up with `POSTGRES_PASSWORD=devpass TEST_AUTH_SECRET=e2e-secret APP_VERSION=e2e`, waits healthy, `playwright test`. `pnpm screenshots` → same stack, runs `screenshots.spec.ts` (project-filtered), writes `docs/screenshots/`.

- [ ] **Step 1:** Backdoor TDD — unit tests: absent (null) → 404; wrong secret → 401 `{error:'unauthorized'}`; correct → 200, Set-Cookie contains erg_session, user created via users store (fake), second call same email reuses user. Implement `testSignin.ts` (router factory like createAuthRouter, mounted in app.ts only `if (deps.testAuthSecret)`); index.ts reads `TEST_AUTH_SECRET`, warns `'WARNING: TEST_AUTH_SECRET set — test sign-in backdoor ACTIVE (never in production)'` when non-empty. `.env.example`: documented as e2e-only, never set on the host.
- [ ] **Step 2:** `npm view @playwright/test version && npm view @axe-core/playwright version`; `pnpm add -D @playwright/test @axe-core/playwright`; `pnpm exec playwright install chromium`. `playwright.config.ts`: testDir `./e2e`, baseURL `http://127.0.0.1:8081`, chromium project only, `viewport: {width: 390, height: 844}`, screenshots project separated by testMatch.
- [ ] **Step 3:** `helpers.ts`: `signInViaBackdoor(page)` (POST via request context with secret `e2e-secret`, then page.goto('/')). `flows.spec.ts`:
  - health endpoint returns ok/db/version JSON (request context)
  - unauthenticated `/` shows the sign-in screen (`getByRole('link', {name: /continue with google/i})`)
  - `?denied=x%40y.com` variant shows the invite-refused notice
  - backdoor sign-in → shell renders (`getByRole('heading', {name: /ergomatic/i})`, You card shows the e2e user email) → sign out returns to sign-in screen
  - browser fetch of `/api/workouts` unauthenticated → 401 (request context, no cookie)
- [ ] **Step 4:** `design.spec.ts` — the structural rules, both auth states:
  - every `a, button, [role=button], input, select` visible on the page has boundingBox width ≥44 AND height ≥44
  - `new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze()` → zero violations
  - token conformance: computed background of body = rgb(244,241,232) (`--page`), sign-in primary button background = rgb(181,52,31) (`--accent`) — values from the handoff palette; if DEVIATIONS.md changes a checked token later, this test is WHERE that change gets asserted
- [ ] **Step 5:** `screenshots.spec.ts` captures `signin.png`, `signed-in-home.png` (and later screens as they exist) to `docs/screenshots/`; commit the two current captures. `scripts/e2e.sh` + `scripts/screenshots.sh` (compose up --wait, run, leave stack up; `E2E_KEEP=0` tears down).
- [ ] **Step 6:** CI `e2e` job: ubuntu, checkout, pnpm/node setup, `pnpm install --frozen-lockfile`, `pnpm exec playwright install --with-deps chromium`, `docker compose up -d --build --wait` with the three env vars, `pnpm exec playwright test`, upload `playwright-report` artifact on failure. `deploy.needs` gains `e2e`.
- [ ] **Step 7:** Full local `pnpm e2e` green; commit `feat(e2e): playwright flows, structural design assertions, screenshot capture`

---

### Task 7: Stryker on-demand

**Files:**
- Create: `app/stryker.config.json`
- Modify: `app/package.json` (`"mutate": "stryker run"`), `.github/workflows/mutation.yml` (workflow_dispatch), `app/.prettierignore`/`.gitignore` (reports)

- [ ] **Step 1:** `npm view @stryker-mutator/core version`; `pnpm add -D @stryker-mutator/core @stryker-mutator/vitest-runner`
- [ ] **Step 2:** `stryker.config.json`:

```json
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "testRunner": "vitest",
  "vitest": { "configFile": "vitest.config.ts" },
  "mutate": ["domain/**/*.ts", "server/stores/**/*.ts", "server/routes/**/*.ts", "!**/*.test.ts", "!**/fixtures.ts", "!server/stores/contracts/**"],
  "reporters": ["html", "clear-text", "progress"],
  "coverageAnalysis": "perTest"
}
```
(If the vitest runner requires project filtering or chokes on the integration project, scope it via a dedicated `vitest.stryker.config.ts` that includes only unit+client projects — document whichever was needed.)
- [ ] **Step 3:** `.github/workflows/mutation.yml`: workflow_dispatch, ubuntu, standard setup, `pnpm mutate`, upload the HTML report artifact.
- [ ] **Step 4:** Run `pnpm mutate` locally (minutes — fine). Record: overall score + per-directory scores + the 5 most interesting surviving mutants (are any real test gaps? If a surviving mutant reveals a genuinely untested behavior in domain/, add the killing test NOW; report each). Baseline numbers go to Task 8's TESTING.md.
- [ ] **Step 5:** Commit `test: stryker mutation testing, on-demand + dispatch workflow`

---

### Task 8: TESTING.md + close-out docs + PR

**Files:**
- Create: `docs/TESTING.md`
- Modify: `CLAUDE.md` (Rules pointer + commands), `.superpowers` ledger via controller

- [ ] **Step 1:** Write `docs/TESTING.md` with the spec's eight sections, concretely: the pyramid table (layer / lives in / runs in / speed / what it may assert); naming rule with a good/bad example pair; assertion-quality rules (the banned patterns, the lint rules that enforce the mechanical subset, mutation testing trigger + "surviving mutants in changed files" review question + the Task 7 baseline scores); coverage stance (90 ratchet raise-only, domain 100, ignore-with-reason example); the contract rule (new store method ⇒ contract case in the same PR); readability (Prettier is law; comments state constraints; anti-bikeshed clause verbatim: "stylistic preferences beyond Prettier's defaults are out of scope for review"); the deliberate-don'ts with reasons (no pixel gates — brittleness; no snapshots — assert nothing legible; no filler coverage; no per-PR mutation); structural design assertions (what design.spec.ts enforces and that new screens must register in it + screenshots.spec.ts as part of each UI phase's definition of done).
- [ ] **Step 2:** CLAUDE.md: Rules gains `- Testing policy: docs/TESTING.md governs...` line; Commands gains `pnpm e2e`, `pnpm screenshots`, `pnpm mutate`, `pnpm format`.
- [ ] **Step 3:** Full verify: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:coverage && pnpm e2e`. Push, PR titled "Testing & validation phase" — body includes: the philosophy summary, the mutation baseline scores, the two captured screenshots embedded (docs/screenshots committed — first PR under the screenshots standard!), the hook-ergonomics proof outputs. `gh run watch --exit-status` green incl. the new e2e job.

---

### Task 9: Merge + close-out (controller)

- [ ] Merge (rebase) → deploy green (server behavior unchanged except the inert backdoor gate — verify live health + confirm test-signin 404s on prod: `curl -X POST https://ergomatic.waffle.haus/api/auth/test-signin` → 404).
- [ ] Release recommendation per standing rule (expected: none — tooling only).
- [ ] Ledger; ROADMAP untouched (this was an inter-phase pause; note it under a short "Testing & validation interlude" line after Phase 4's section if clean).

## Exit criteria (spec)

- [ ] TESTING.md merged; CLAUDE.md points at it
- [ ] Prettier repo-wide + staged + CI check
- [ ] @vitest/eslint-plugin rules active, zero violations; domain pinned 100
- [ ] Contract suites green against fakes AND real Postgres incl. both named regressions
- [ ] Playwright flows + design assertions + screenshots green locally and in CI
- [ ] Stryker baseline recorded; surviving-mutant test gaps in domain/ closed
- [ ] Pre-push proven Docker-less in a fresh worktree; Node fail-loud proven
- [ ] Prod verify: test-signin 404 live
