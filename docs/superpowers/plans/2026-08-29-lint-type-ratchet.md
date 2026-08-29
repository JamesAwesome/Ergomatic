# Lint and Type Ratchet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make typed promise/error mistakes, untyped Playwright code, and a
false-green pre-commit hook fail locally and in CI without forcing a whole-codebase
cleanup.

**Architecture:** TypeScript Project Service gives every linted TS/TSX file a
real project. Nine selected typed ESLint rules use ESLint's native committed
suppression ledger as a no-growth ceiling, while zero-debt compiler flags and a
dedicated E2E project fail directly. The existing `lint` and `typecheck` entry
points remain the CI owners; small permanent tests prove hook sequencing and E2E
project membership.

**Tech Stack:** TypeScript 6.0, ESLint 10 bulk suppressions, typescript-eslint
Project Service, pnpm 11, Bash, Husky, GitHub Actions.

**Spec:**
`docs/superpowers/specs/2026-08-29-lint-type-ratchet-design.md`

## Global Constraints

- Work only in
  `/Users/james/projects/github/jamesawesome/Ergomatic-lint-type-ratchet` on
  `codex/lint-type-ratchet`; never write to the main checkout.
- Before every commit, run `git rev-parse --show-toplevel` and require the exact
  worktree path above. Never bypass hooks, merge, close, approve, or remove the
  worktree.
- No dependency is added or upgraded. No rower-visible behavior, persisted
  shape, auth contract, number meaning, or PM5 interaction changes.
- Use failing-test/probe first. Every permanent test gets a documented mutation
  that makes it red, followed by a clean green restore.
- Production and tests get `no-floating-promises`, `no-misused-promises`,
  `await-thenable`, `only-throw-error`, and `prefer-promise-reject-errors`.
  Only non-test code gets the four `no-unsafe-*` rules.
- ESLint project-service fatals are never suppressed. Do not add a fallback
  project, `allowDefaultProject`, `recommendedTypeChecked`, or
  `strictTypeChecked`.
- Generate the native ESLint suppression ledger exactly once after project
  ownership is complete. Do not add a baseline/regeneration package script;
  expose only `lint` and `lint:prune`.
- After initial generation, the committed suppression total may only stay flat
  or decrease. Record the final count and lint runtime in the PR.
- `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, and unsafe server
  test response bodies remain explicitly ordered Wave D follow-on work; do not
  pretend they are enforced in this slice. Do not queue
  `noPropertyAccessFromIndexSignature`.
- The E2E TypeScript project is a checking/editor boundary. Do not add it to the
  production `tsc -b` reference graph or either Vite/server bundle.
- `AGENTS.md` remains unchanged. `CLAUDE.md` is the only canonical LLM policy;
  `docs/TESTING.md` explains operation without copying authority.
- This is a James-approved pre-Wave-D slice. It does not open Wave D, move its
  other work, or change its release-with-C sequencing.

## File Structure

| File                                                                          | Responsibility                                                                                           |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `.husky/pre-commit`                                                           | Run staged lint, then whole-project typecheck, stopping at the first failure.                            |
| `scripts/pre-commit.test.sh`                                                  | Execute the real hook behind controlled Node/pnpm boundaries and prove all three exit paths.             |
| `.github/workflows/ci.yml`                                                    | Run the hook regression in the always-on `scripts` job; retain existing lint/typecheck owners.           |
| `app/e2e/tsconfig.json`                                                       | Strict Playwright checking project, including required ambient declaration owners.                       |
| `app/scripts/e2e-typecheck-census.sh`                                         | Compare every E2E TS/TSX file plus `playwright.config.ts` with the E2E project's file list.              |
| `app/package.json`                                                            | Add E2E/census work to `typecheck` and expose `lint:prune`.                                              |
| `app/tsconfig.app.json`, `app/tsconfig.node.json`, `app/tsconfig.server.json` | Enable the two zero-debt compiler flags; give root config files typed ownership.                         |
| `app/server/tsconfig.json`                                                    | Give server files a nearest discoverable project without changing compiler semantics.                    |
| `app/src/monitor/driver.ts`                                                   | Mark the one real `Error.name` override explicitly.                                                      |
| `app/e2e/design.spec.ts`                                                      | Replace two nullable DOM assumptions with an intelligible runtime assertion.                             |
| `app/eslint.config.js`                                                        | Enable Project Service and the selected nine-rule boundary.                                              |
| `app/eslint-suppressions.json`                                                | Native file/rule/count ceiling for existing selected-rule debt.                                          |
| `CLAUDE.md`                                                                   | Canonical no-growth and campsite rule; accurate fail-fast hook statement.                                |
| `docs/TESTING.md`                                                             | Commands, rule scopes, ownership failure semantics, and honest ledger limitation.                        |
| `ROADMAP.md`                                                                  | Completed pulled-forward slice, grouped follow-on, corrected dependency count, and complete Wave D exit. |
| `.claude/agents/pm-ledger.md`, `.claude/agents/antagonist-ledger.md`          | Preserve the approved sequencing ruling and the techniques that corrected the false baseline.            |

---

### Task 1: Make the real pre-commit hook fail fast

**Files:**

- Create: `scripts/pre-commit.test.sh`
- Modify: `.husky/pre-commit`
- Modify: `.github/workflows/ci.yml` (`scripts` job)

**Interfaces:**

- Consumes: `.husky/common.sh`'s Node-major preamble and the existing two pnpm
  commands.
- Produces: a real-hook regression returning non-zero on the first failed gate
  and a CI invocation independent of the runner's installed Node version.

- [ ] **Step 1: Write the failing real-hook regression**

  Create `scripts/pre-commit.test.sh` with this content:

  ```bash
  #!/usr/bin/env bash
  # Executes the real pre-commit hook behind controlled process boundaries.
  set -uo pipefail

  HERE="$(cd "$(dirname "$0")" && pwd)"
  ROOT="$(cd "$HERE/.." && pwd)"
  HOOK="$ROOT/.husky/pre-commit"
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  mkdir -p "$TMP/bin"
  FAILS=0

  cat > "$TMP/bin/node" <<'FAKE_NODE'
  #!/usr/bin/env bash
  if [ "${1:-}" = "-v" ]; then printf '%s\n' 'v26.0.0'; exit 0; fi
  exit 64
  FAKE_NODE

  cat > "$TMP/bin/pnpm" <<'FAKE_PNPM'
  #!/usr/bin/env bash
  printf '%s\n' "$*" >> "$FAKE_PNPM_LOG"
  if [ "${1:-} ${2:-}" = "exec lint-staged" ]; then
    exit "${FAKE_LINT_RC:-0}"
  fi
  if [ "${1:-} ${2:-} ${3:-}" = "--dir app typecheck" ]; then
    exit "${FAKE_TYPECHECK_RC:-0}"
  fi
  exit 65
  FAKE_PNPM
  chmod +x "$TMP/bin/node" "$TMP/bin/pnpm"

  check() {
    if [ "$1" = "$2" ]; then
      printf 'ok: %s\n' "$3"
    else
      printf 'FAIL: %s (want %q got %q)\n' "$3" "$2" "$1"
      FAILS=$((FAILS + 1))
    fi
  }

  run_case() {
    name="$1" lint_rc="$2" typecheck_rc="$3" expected_rc="$4" expected_log="$5"
    : > "$TMP/pnpm.log"
    PATH="$TMP/bin:$PATH" FAKE_PNPM_LOG="$TMP/pnpm.log" \
      FAKE_LINT_RC="$lint_rc" FAKE_TYPECHECK_RC="$typecheck_rc" \
      bash "$HOOK" > "$TMP/output" 2>&1
    rc=$?
    check "$rc" "$expected_rc" "$name exact exit status"
    check "$(cat "$TMP/pnpm.log")" "$expected_log" "$name invocation order"
  }

  run_case "lint failure" 17 0 17 "exec lint-staged"
  run_case "typecheck failure" 0 23 23 $'exec lint-staged\n--dir app typecheck'
  run_case "both pass" 0 0 0 $'exec lint-staged\n--dir app typecheck'

  if [ "$FAILS" -eq 0 ]; then
    echo "ALL PASS"
    exit 0
  fi
  echo "$FAILS FAILED"
  exit 1
  ```

- [ ] **Step 2: Run the regression and confirm the current hook is false-green**

  Run from the repository root:

  ```bash
  bash -n scripts/pre-commit.test.sh
  bash scripts/pre-commit.test.sh
  ```

  Expected: FAIL in the `lint failure` case because the current hook invokes
  typecheck and exits zero after lint-staged returns 17. Record both the wrong
  exit status and the unwanted second invocation.

- [ ] **Step 3: Make the hook return the first failing gate**

  Replace `.husky/pre-commit` with:

  ```bash
  . "$(dirname "$0")/common.sh"
  pnpm exec lint-staged &&
    pnpm --dir app typecheck
  ```

- [ ] **Step 4: Prove all three real-hook cases pass**

  Run:

  ```bash
  bash -n .husky/pre-commit
  bash scripts/pre-commit.test.sh
  ```

  Expected: `ALL PASS`; lint failure records only `exec lint-staged` and returns
  17, typecheck failure records both calls and returns 23, and both-pass returns 0.

- [ ] **Step 5: Wire the regression into the always-on scripts job**

  Add this step to `.github/workflows/ci.yml` under `scripts`, after checkout
  and before the existing deploy/path-filter tests:

  ```yaml
  - name: Lint + test the pre-commit hook
    run: |
      bash -n .husky/pre-commit
      bash scripts/pre-commit.test.sh
  ```

  Run all always-on script tests:

  ```bash
  bash scripts/pre-commit.test.sh
  bash scripts/deploy.test.sh
  bash scripts/ci-changes.test.sh
  ```

  Expected: all three report `ALL PASS`.

- [ ] **Step 6: Commit the hook boundary**

  ```bash
  git rev-parse --show-toplevel
  git add .husky/pre-commit scripts/pre-commit.test.sh .github/workflows/ci.yml
  git commit -m "test: keep pre-commit failures red"
  ```

  The first command must print the worktree path in Global Constraints. The
  real commit hook must itself print lint-staged and typecheck output.

---

### Task 2: Give Playwright a checked project with a membership oracle

**Files:**

- Create: `app/e2e/tsconfig.json`
- Create: `app/scripts/e2e-typecheck-census.sh`
- Modify: `app/e2e/design.spec.ts:4241-4244`
- Modify: `app/package.json` (`typecheck` script)

**Interfaces:**

- Consumes: `tsconfig.app.json` compiler semantics,
  `src/vite-env.d.ts`, and the existing `Window` declaration owner in
  `src/monitor/transports/index.ts`.
- Produces: `tsc -p e2e/tsconfig.json --noEmit` plus an exact set comparison
  over all E2E TS/TSX files and `playwright.config.ts`.

- [ ] **Step 1: Create the E2E checking project**

  Create `app/e2e/tsconfig.json`:

  ```json
  {
    "extends": "../tsconfig.app.json",
    "compilerOptions": {
      "tsBuildInfoFile": "../node_modules/.tmp/tsconfig.e2e.tsbuildinfo",
      "types": ["node", "vite/client"]
    },
    "include": [
      "./**/*.ts",
      "./**/*.tsx",
      "../playwright.config.ts",
      "../src/vite-env.d.ts",
      "../src/monitor/transports/index.ts"
    ]
  }
  ```

  Run from `app/`:

  ```bash
  pnpm exec tsc -p e2e/tsconfig.json --noEmit
  ```

  Expected: exactly two real TS18047 errors at `e2e/design.spec.ts:4243-4244`
  (`controls` and `screen` possibly null), with no missing-Window or ambient
  declaration diagnostics.

- [ ] **Step 2: Replace nullable DOM assumptions with an intelligible runtime failure**

  In the `page.evaluate` callback at `app/e2e/design.spec.ts:4241`, insert this
  guard before reading either rectangle:

  ```ts
  if (!controls || !screen) {
    throw new Error("timer controls and timer screen must both be present");
  }
  ```

  Run:

  ```bash
  pnpm exec tsc -p e2e/tsconfig.json --noEmit
  ```

  Expected: PASS.

- [ ] **Step 3: Write the exact E2E membership census**

  Create `app/scripts/e2e-typecheck-census.sh`:

  ```bash
  #!/usr/bin/env bash
  # Every Playwright source file must belong to the checked E2E project.
  set -euo pipefail

  ROOT="$(cd "$(dirname "$0")/.." && pwd)"
  EXPECTED="$(mktemp)"
  ACTUAL="$(mktemp)"
  trap 'rm -f "$EXPECTED" "$ACTUAL"' EXIT

  {
    find "$ROOT/e2e" -type f \( -name '*.ts' -o -name '*.tsx' \) -print
    printf '%s\n' "$ROOT/playwright.config.ts"
  } | LC_ALL=C sort -u > "$EXPECTED"

  "$ROOT/node_modules/.bin/tsc" -p "$ROOT/e2e/tsconfig.json" --listFilesOnly |
    awk -v root="$ROOT" '
      index($0, root "/e2e/") == 1 && $0 ~ /\.tsx?$/ { print; next }
      $0 == root "/playwright.config.ts" { print }
    ' | LC_ALL=C sort -u > "$ACTUAL"

  if ! diff -u "$EXPECTED" "$ACTUAL"; then
    echo "E2E TypeScript project membership differs from the filesystem" >&2
    exit 1
  fi

  printf 'E2E TypeScript membership: %s/%s\n' \
    "$(wc -l < "$ACTUAL" | tr -d ' ')" \
    "$(wc -l < "$EXPECTED" | tr -d ' ')"
  ```

  Run:

  ```bash
  bash -n scripts/e2e-typecheck-census.sh
  bash scripts/e2e-typecheck-census.sh
  ```

  Expected: `E2E TypeScript membership: 16/16`.

- [ ] **Step 4: Prove the census catches an omitted file**

  Temporarily add this top-level property to `app/e2e/tsconfig.json`:

  ```json
  "exclude": ["./today.spec.ts"]
  ```

  Run `bash scripts/e2e-typecheck-census.sh`. Expected: FAIL with
  `today.spec.ts` present only on the `EXPECTED` side of the diff. Restore the
  config and rerun; expected: `16/16`.

- [ ] **Step 5: Make the existing typecheck entry point own E2E**

  Change `app/package.json`'s script to:

  ```json
  "typecheck": "tsc -b && tsc -p tsconfig.server.json --noEmit && tsc -p e2e/tsconfig.json --noEmit && bash scripts/e2e-typecheck-census.sh"
  ```

  Do not add the E2E project to `app/tsconfig.json` references. Run:

  ```bash
  pnpm typecheck
  pnpm build
  ```

  Expected: both PASS; the build continues to use only its existing project
  references and does not emit Playwright code.

- [ ] **Step 6: Self-mutate the DOM guard**

  Temporarily remove the runtime guard from `design.spec.ts`, run
  `pnpm typecheck`, and require TS18047 on both dereferences. Restore the exact
  guard and require `pnpm typecheck` to pass.

- [ ] **Step 7: Commit E2E coverage**

  ```bash
  git rev-parse --show-toplevel
  git add app/e2e/tsconfig.json app/scripts/e2e-typecheck-census.sh \
    app/e2e/design.spec.ts app/package.json
  git commit -m "test: typecheck every Playwright source"
  ```

---

### Task 3: Enable the zero-debt compiler checks

**Files:**

- Modify: `app/tsconfig.app.json`
- Modify: `app/tsconfig.node.json`
- Modify: `app/tsconfig.server.json`
- Modify: `app/src/monitor/driver.ts:290-292`

**Interfaces:**

- Consumes: every existing compiler project and the E2E project inheriting
  `tsconfig.app.json`.
- Produces: global `noImplicitReturns` and `noImplicitOverride` enforcement,
  with one explicit existing override.

- [ ] **Step 1: Prove `noImplicitOverride` finds the measured debt**

  Run from `app/`:

  ```bash
  pnpm exec tsc -p tsconfig.app.json --noEmit --noImplicitOverride
  ```

  Expected: one TS4114 at `src/monitor/driver.ts` for
  `ProgramBusyError.name`, and no second override diagnostic.

- [ ] **Step 2: Mark the override explicitly**

  Change the class member to:

  ```ts
  override readonly name = "ProgramBusyError";
  ```

- [ ] **Step 3: Enable both flags in all applicable compiler roots**

  Add these two keys beside the existing strictness keys in
  `tsconfig.app.json`, `tsconfig.node.json`, and `tsconfig.server.json`:

  ```json
  "noImplicitReturns": true,
  "noImplicitOverride": true,
  ```

  The E2E project inherits both from `tsconfig.app.json`; the server build
  inherits both from `tsconfig.server.json`. Run `pnpm typecheck`; expected:
  PASS.

- [ ] **Step 4: Prove both compiler flags bite**

  First, temporarily remove `override` from `ProgramBusyError.name` and run
  `pnpm typecheck`. Expected: TS4114. Restore `override` and require PASS.

  Then temporarily create `app/src/test/noImplicitReturnsProof.ts`:

  ```ts
  export function noImplicitReturnsProof(flag: boolean) {
    if (flag) return 1;
  }
  ```

  Run `pnpm typecheck`. Expected: TS7030 in the proof file. Delete the temporary
  file with `apply_patch`, rerun `pnpm typecheck`, and require PASS.

- [ ] **Step 5: Run the scoped gate and commit**

  ```bash
  pnpm lint
  pnpm format:check
  pnpm typecheck
  pnpm e2e
  git rev-parse --show-toplevel
  git add app/tsconfig.app.json app/tsconfig.node.json app/tsconfig.server.json \
    app/src/monitor/driver.ts
  git commit -m "build: enable zero-debt compiler checks"
  ```

  E2E is required because this task touches `app/src/`, even though the runtime
  value is unchanged. Screenshots are not required because layout is unchanged.

---

### Task 4: Install the selected typed-ESLint ratchet

**Files:**

- Create: `app/server/tsconfig.json`
- Create: `app/eslint-suppressions.json` (generated, never hand-authored)
- Modify: `app/tsconfig.node.json`
- Modify: `app/eslint.config.js`
- Modify: `app/package.json` (`lint:prune`)

**Interfaces:**

- Consumes: the E2E project from Task 2, existing app/server compiler semantics,
  and ESLint's native default `eslint-suppressions.json` lookup.
- Produces: typed project ownership for every linted TS/TSX file, nine selected
  error-level rules, and a prune-aware no-growth ceiling for existing debt.

- [ ] **Step 1: Add discoverable projects without lint-only semantics**

  Create `app/server/tsconfig.json`:

  ```json
  {
    "extends": "../tsconfig.server.json",
    "compilerOptions": {
      "noEmit": true
    },
    "include": [".", "../domain"]
  }
  ```

  Add both root config files to `app/tsconfig.node.json`'s existing `include`
  array:

  ```json
  "playwright.config.ts",
  "vitest.stryker.config.ts"
  ```

  These are ownership changes only; they reuse the existing compiler options.

- [ ] **Step 2: Enable Project Service and the nine-rule boundary**

  In the main TypeScript block in `app/eslint.config.js`, add:

  ```js
  parserOptions: {
    projectService: true,
    tsconfigRootDir: import.meta.dirname,
  },
  ```

  Add these error rules to that block:

  ```js
  "@typescript-eslint/no-floating-promises": "error",
  "@typescript-eslint/no-misused-promises": "error",
  "@typescript-eslint/await-thenable": "error",
  "@typescript-eslint/no-unsafe-assignment": "error",
  "@typescript-eslint/no-unsafe-return": "error",
  "@typescript-eslint/no-unsafe-call": "error",
  "@typescript-eslint/no-unsafe-member-access": "error",
  "@typescript-eslint/only-throw-error": "error",
  "@typescript-eslint/prefer-promise-reject-errors": "error",
  ```

  After the existing Vitest test block, add this override:

  ```js
  {
    files: ["**/*.test.{ts,tsx}", "e2e/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
    },
  },
  ```

  Promise and Error rules remain active in tests. Do not disable the unsafe
  rules for `*.spec.ts` outside `e2e/`; production source uses that suffix in
  no current path, and broadening would weaken the stated contract.

- [ ] **Step 3: Measure the complete unsuppressed population**

  Run this diagnostic pipeline before creating the ledger:

  ```bash
  pnpm exec eslint . -f json | node --input-type=module -e '
    let text = "";
    process.stdin.on("data", (chunk) => { text += chunk; });
    process.stdin.on("end", () => {
      const results = JSON.parse(text);
      const ruleIds = [
        "@typescript-eslint/no-floating-promises",
        "@typescript-eslint/no-misused-promises",
        "@typescript-eslint/await-thenable",
        "@typescript-eslint/no-unsafe-assignment",
        "@typescript-eslint/no-unsafe-return",
        "@typescript-eslint/no-unsafe-call",
        "@typescript-eslint/no-unsafe-member-access",
        "@typescript-eslint/only-throw-error",
        "@typescript-eslint/prefer-promise-reject-errors",
      ];
      const messages = results.flatMap((result) => result.messages);
      const fatals = messages.filter((message) => message.fatal);
      const rules = Object.fromEntries(
        ruleIds.map((ruleId) => [
          ruleId,
          messages.filter((message) => message.ruleId === ruleId).length,
        ]),
      );
      const selected = Object.values(rules).reduce((sum, count) => sum + count, 0);
      console.log(JSON.stringify({ fatals: fatals.length, selected, rules }, null, 2));
      if (fatals.length) process.exit(1);
    });
  '
  ```

  Expected: zero fatals. Compare the selected total and per-rule output with
  the spec's measured 56-diagnostic candidate; explain any current-branch delta
  before continuing. A parser failure is a blocker, not debt.

- [ ] **Step 4: Generate the one allowed committed baseline**

  From `app/`, with no existing `eslint-suppressions.json`, run:

  ```bash
  pnpm exec eslint . \
    --suppress-rule @typescript-eslint/no-floating-promises \
    --suppress-rule @typescript-eslint/no-misused-promises \
    --suppress-rule @typescript-eslint/await-thenable \
    --suppress-rule @typescript-eslint/no-unsafe-assignment \
    --suppress-rule @typescript-eslint/no-unsafe-return \
    --suppress-rule @typescript-eslint/no-unsafe-call \
    --suppress-rule @typescript-eslint/no-unsafe-member-access \
    --suppress-rule @typescript-eslint/only-throw-error \
    --suppress-rule @typescript-eslint/prefer-promise-reject-errors
  ```

  Inspect the generated JSON. It must contain only the nine named rules, no
  parser failures, and no unsafe-rule entries under tests or `e2e/`.

- [ ] **Step 5: Expose pruning, not regeneration**

  Add this package script:

  ```json
  "lint:prune": "eslint . --prune-suppressions"
  ```

  Keep `"lint": "eslint ."` unchanged. Run:

  ```bash
  pnpm lint
  pnpm lint:prune
  pnpm lint
  ```

  Expected: all PASS and the second lint produces no unpruned-suppression
  warning. The prune command must not use
  `--pass-on-unpruned-suppressions`.

- [ ] **Step 6: Prove the native ledger's exact boundary in a temporary owned file**

  Temporarily create `app/src/test/lintRatchetProof.ts`:

  ```ts
  export function lintRatchetProof(): void {
    Promise.resolve("first");
    Promise.resolve("second");
  }
  ```

  Run normal ESLint on the file. Expected: two
  `@typescript-eslint/no-floating-promises` errors because the committed ledger
  has no allowance for the new file.

  Generate a **separate temporary** ledger for only that file:

  ```bash
  pnpm exec eslint src/test/lintRatchetProof.ts \
    --suppress-rule @typescript-eslint/no-floating-promises \
    --suppressions-location .lint-ratchet-proof.json
  ```

  Remove the `Promise.resolve("second")` line and rerun ESLint with
  `--suppressions-location .lint-ratchet-proof.json`. Expected: non-zero unused
  suppression. Add `--prune-suppressions`, confirm its count drops from 2 to 1,
  then rerun green.

  Add a second floating promise again while the temporary allowance remains 1.
  Rerun ESLint with the temporary ledger. Expected: non-zero with two
  `no-floating-promises` diagnostics because the count grew above the ceiling.
  Remove the second promise, replace `"first"` with `"replacement"`, and rerun.
  Expected: green, demonstrating the same-file/same-rule/same-count blind spot.
  Delete both temporary proof files with `apply_patch` and require `pnpm lint`
  to remain green against the committed ledger.

- [ ] **Step 7: Count debt and measure the cost**

  Run:

  ```bash
  node --input-type=module -e '
    import fs from "node:fs";
    const ledger = JSON.parse(fs.readFileSync("eslint-suppressions.json", "utf8"));
    const entries = Object.values(ledger).flatMap((rules) => Object.values(rules));
    console.log({ pairs: entries.length, diagnostics: entries.reduce((n, x) => n + x.count, 0) });
  '
  /usr/bin/time -p pnpm lint
  ```

  Record the file/rule pair count, diagnostic count, and wall time. Confirm
  `git diff -- app/eslint-suppressions.json` never adds an entry after this
  point.

- [ ] **Step 8: Run the scoped gates and commit**

  ```bash
  pnpm lint
  pnpm format:check
  pnpm typecheck
  git rev-parse --show-toplevel
  git add app/server/tsconfig.json app/tsconfig.node.json app/eslint.config.js \
    app/eslint-suppressions.json app/package.json
  git commit -m "build: ratchet typed lint debt"
  ```

  The commit hook is an additional staged-file proof: lint-staged must use the
  same suppression ledger and then run whole-project typecheck.

---

### Task 5: Make the ratchet part of repository policy and Wave D

**Files:**

- Modify: `CLAUDE.md`
- Modify: `docs/TESTING.md`
- Modify: `ROADMAP.md`
- Modify: `.claude/agents/pm-ledger.md`
- Modify: `.claude/agents/antagonist-ledger.md`
- Modify: `docs/superpowers/specs/2026-08-29-lint-type-ratchet-design.md`
- Verify unchanged: `AGENTS.md`

**Interfaces:**

- Consumes: final rule scopes, final suppression count, PM
  `GO_WITH_CHANGES`, and antagonist `GO` from the approved spec.
- Produces: one canonical agent policy, one operational testing reference, one
  forward-looking roadmap owner, and the two standing-agent precedents.

- [ ] **Step 1: Land the canonical campsite rule**

  In `CLAUDE.md`'s Rules section, immediately before TDD, add the spec's exact
  policy:

  ```markdown
  - **Typed-lint ratchet and campsite rule.** Existing debt in the committed
    ESLint suppression ledger may only decrease. Never add or regenerate a
    suppression to make a change pass; adopting a new suppressed rule requires
    James's explicit approval. When changing code that carries grandfathered
    debt, remove suppressions for violations in the function, test, or behavior
    being changed when doing so is safe and local, then run `pnpm lint:prune`.
    Do not expand a focused change into unrelated cleanup.
  ```

  Tighten the existing hook bullet to say: pre-commit runs staged format/lint
  first and whole-project typecheck second; it is fail-fast. Do not copy either
  rule into `AGENTS.md`.

- [ ] **Step 2: Add operational mechanics to the testing authority**

  Append this section to `docs/TESTING.md` (the generated ledger, not the
  provisional design count, stays authoritative):

  ```markdown
  ## 14. Typed-lint ratchet

  `pnpm lint` applies `app/eslint-suppressions.json` and fails when a selected
  rule appears in a file/rule pair with no allowance, exceeds an existing
  allowance, or leaves an allowance stale after cleanup. Run `pnpm lint:prune`
  after removing grandfathered violations; normal lint must then be green.
  There is deliberately no command that regenerates the baseline.

  Five typed rules apply to production and tests:
  `no-floating-promises`, `no-misused-promises`, `await-thenable`,
  `only-throw-error`, and `prefer-promise-reject-errors`. Four more apply to
  non-test code only: `no-unsafe-assignment`, `no-unsafe-return`,
  `no-unsafe-call`, and `no-unsafe-member-access`. Unsafe server-test response
  bodies are separate Wave D hardening work; they are not hidden behind a
  high-count allowance here.

  Every TS/TSX file ESLint checks must belong to a TypeScript Project Service
  project. A project-service/parser failure means omitted coverage and is never
  suppressible debt. `pnpm typecheck` separately checks every E2E source and
  its membership census.

  ESLint bulk suppressions count violations by file and rule, not by source
  location. They reject a count increase and force pruning after a decrease,
  but cannot detect one same-rule violation replacing another in the same file
  while the count stays equal. `CLAUDE.md` owns the no-growth and campsite
  policy for that honest limitation.
  ```

- [ ] **Step 3: Correct and complete Wave D without opening it**

  Keep `Status: After A` and `releases with Wave C`. Replace the sentence under
  it with:

  ```markdown
  **Ships a tester nothing** — but two items are Wave C dependencies: simulator
  coverage and native-fake reachability for connected surfaces.
  ```

  Replace the stale E2E checkbox with these two items after Tasks 1-4 pass:

  ```markdown
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
  ```

  Correct the mutation item so it agrees with the current testing policy:

  ```markdown
  - [ ] **Settle the mutation-testing gate, one way or the other.**
        `docs/TESTING.md` explicitly demoted the full `pnpm mutate` run from an
        unrun phase gate to an on-demand probe; its only baseline is still
        2026-07-29 and covers 7 domain modules against today's 29. Either make
        a current full run a real enforced gate with an owned cadence, or keep
        it on-demand and retire the stale baseline as evidence. **S/M**
  ```

  Replace Wave D's exit with:

  ```markdown
  **Exit:** the accessibility audit can run on real assistive technology; the
  simulator reaches a connected screen; the lint/type slice remains green; no
  tracked file cites a path that does not exist; and the named flakes,
  mutation-gate decision, REST-bearing fixture, wire-gap witness, and ordered
  type-hardening follow-on are each completed or explicitly disposed.
  ```

  Finally, change the Locked Decisions hook row's enforcement cell to:

  ```markdown
  husky + lint-staged — pre-commit: staged format/lint, then whole-project
  typecheck, fail-fast; pre-push: unit + client tests (fast, Docker-free)
  ```

- [ ] **Step 4: Append the PM precedent**

  Append this H2 entry to `.claude/agents/pm-ledger.md`:

  ```markdown
  ## PM ruling, 2026-08-29 (lint/type ratchet)

  - **A James-approved pre-wave enabling slice can pull forward one explicitly
    owned infrastructure item without opening its wave.** The lint/type ratchet
    is Wave D's `e2e/` typecheck/enforcement item, pulled forward by James before
    F → A → D completes; Wave D's status, remaining items, normal phase-open
    gates, and release-with-C rule stay unchanged. The exception is valid only
    when the roadmap names the slice and its exit, rather than claiming the
    whole phase has opened.
  ```

- [ ] **Step 5: Append the antagonist techniques**

  Append this H3 entry to `.claude/agents/antagonist-ledger.md`:

  ```markdown
  ### 2026-08-29 — Pre-Wave-D lint/type ratchet pass

  - **“109 diagnostics is the typed-lint adoption baseline” was false because
    86 project-service failures omitted most server, E2E, and config files.**
    Full ownership exposed 482 additional server-test diagnostics; scoping
    unsafe-`any` rules away from tests produced the honest candidate: 56
    diagnostics, zero fatals. **Technique: establish project ownership before
    counting rule debt; parser failures are omitted populations, not clean files.**
  - **One biting compiler mutation does not prove project membership.** A
    TSConfig could include the mutated E2E file and omit its fourteen siblings.
    **Technique: compare the filesystem census with `tsc --listFilesOnly` by
    exact set equality, then separately mutate a diagnostic. Membership and
    enforcement are different proofs.**
  - **A hook regression must execute the real hook and control its preamble.**
    The always-running scripts job lacks Node 26, so an uncontrolled test can
    fail before reaching sequencing; copied control flow can pass while the
    hook remains broken. **Technique: run the actual hook with fake Node and
    recording command boundaries, then assert exit status and invocation order.**
  - **A phase exit must own every item in its slate.** Wave D's first exit
    omitted flake disposition, mutation-gate disposition, the REST fixture, and
    the wire-gap witness. **Technique: diff unchecked-item nouns against
    exit-criterion nouns before calling a phase closable.**
  - **“Nonzero” does not prove exit-status propagation.** When a wrapper
    promises to return the first failing gate, inject distinct sentinel
    statuses for each dependency and assert the exact numeric result as well as
    later-command absence. A test that normalizes every failure to “nonzero”
    cannot detect wrappers that remap or discard the underlying status.
  - **VETTED GROUND:** ESLint's native suppression ledger enforces file/rule
    count ceilings and prune-required improvements; Project Service is the
    correct editor-aligned ownership mechanism; the scoped nine-rule candidate
    is measured over the complete intended population; E2E membership is 16/16;
    the near-zero TypeScript flags and real-hook fail-fast proof are deterministic.
  ```

- [ ] **Step 6: Update the approved record and verify one authority**

  Confirm the spec keeps the already-approved status and now says “all other
  Wave D work” rather than a count that the grouped follow-on would make stale.

  Run:

  ```bash
  git diff --exit-code -- AGENTS.md
  git diff --check
  cd app && pnpm format:check
  ```

  Expected: `AGENTS.md` unchanged, no whitespace errors, format check PASS.

- [ ] **Step 7: Commit the repository record**

  ```bash
  git rev-parse --show-toplevel
  git add CLAUDE.md docs/TESTING.md ROADMAP.md \
    .claude/agents/pm-ledger.md .claude/agents/antagonist-ledger.md \
    docs/superpowers/specs/2026-08-29-lint-type-ratchet-design.md
  git commit -m "docs: make the type ratchet a campsite rule"
  ```

---

### Task 6: Re-prove the boundary, review the whole branch, and open the PR

**Files:**

- Inspect: every file changed by Tasks 1-5
- Modify only if a gate or reviewer finds a defect
- Create externally: one GitHub pull request; do not merge it

**Interfaces:**

- Consumes: the complete ratchet and repository record.
- Produces: exact red/green evidence, an independent code-review verdict, and a
  PR James can approve with measured debt/cost visible above the fold.

- [ ] **Step 1: Re-run every biting proof from a clean branch state**

  Record all of these exact outcomes in the task report:

  1. a new owned file with a floating promise fails with
     `@typescript-eslint/no-floating-promises`;
  2. the separate temporary ledger fails stale after one violation is removed,
     prunes from 2 to 1, and passes a same-count replacement;
  3. the real hook's lint failure skips typecheck, its typecheck failure remains
     non-zero, and its all-green case is zero;
  4. removing the E2E DOM guard yields TS18047;
  5. removing `override` yields TS4114;
  6. excluding `today.spec.ts` makes the E2E census fail, then restore reports
     exact membership.

  Delete all temporary proof files with `apply_patch`. Require `git status` to
  show no proof residue.

- [ ] **Step 2: Run the full branch gate**

  From `app/`, run in this order:

  ```bash
  pnpm lint
  pnpm format:check
  pnpm typecheck
  cd .. && bash scripts/pre-commit.test.sh
  bash scripts/deploy.test.sh
  bash scripts/ci-changes.test.sh
  cd app && pnpm test --project unit --project client
  pnpm test --project integration
  pnpm test:coverage
  pnpm build
  pnpm dist:grep
  pnpm e2e
  ```

  Read per-file coverage for `app/src/monitor/driver.ts`; no new runtime branch
  should exist. Screenshots are not required because no screen layout changes.

- [ ] **Step 3: Measure the final ratchet and audit the diff**

  Re-run the suppression-count and `/usr/bin/time -p pnpm lint` commands from
  Task 4. Then run:

  ```bash
  git diff main...HEAD --check
  git diff main...HEAD --stat
  git diff main...HEAD -- app/eslint-suppressions.json
  git status --short
  ```

  Require: clean status, no suppression growth after initial generation, no
  accidental `AGENTS.md` diff, no temporary configs/probes, and no E2E reference
  in the production `tsconfig.json` graph.

- [ ] **Step 4: Dispatch one independent whole-branch code review**

  The reviewer reads `.claude/agent-briefing.md`, the spec, and this plan, then
  inspects `main...HEAD`. Ask them specifically to attack:

  - file ownership omissions hidden by parser service;
  - unsafe-rule leakage into tests or accidental disablement in production;
  - suppression regeneration/no-growth escape hatches;
  - hook tests that mirror instead of execute the real hook;
  - E2E census false positives;
  - production-build inclusion of Playwright;
  - duplicated or contradictory repository policy.

  Fix every confirmed finding, rerun its scoped gate, and obtain a clean
  re-review. This non-fast-path infrastructure PR needs no PM final-PR gate and
  no second antagonist pass: it changes no product function and the approved
  pre-wave spec already received both design gates.

  The first whole-branch review found one confirmed escape: ESLint 10.9 marks
  stale suppressions only for files present in its lint results. A deleted or
  newly ignored debt-bearing file therefore leaves normal native lint green.
  Task 7 closes that escape before the PR is created.

---

### Task 7: Close the missing-file suppression escape and re-review

**Files:**

- Create: `app/scripts/eslint-suppression-census.mjs`
- Create: `app/scripts/eslint-suppression-census.test.ts`
- Modify: `app/package.json`
- Modify: `docs/TESTING.md`
- Modify: `docs/superpowers/specs/2026-08-29-lint-type-ratchet-design.md`
- Modify: `.claude/agents/antagonist-ledger.md`
- Modify: this plan

**Interfaces:**

- Consumes: ESLint's public `isPathIgnored()` membership decision, the native
  ledger, and the confirmed final-review finding.
- Produces: normal-lint rejection and prune-only removal for whole ledger files
  that leave ESLint's configured population, without duplicating typed lint or
  replacing ESLint's diagnostic/count semantics.

- [x] **Step 1: Write the real CLI fixture first and watch it fail**

  Add a Node-project Vitest file that executes the real census CLI as a child
  process against a temporary flat-config workspace. Use a separate
  `ESLint.lintFiles(["."])` call as the independent membership oracle. Prove:

  - a configured debt-bearing file is in the oracle population and census is
    green;
  - deleting that file makes census non-zero and names its ledger path;
  - an existing file newly ignored by config leaves the oracle population and
    makes census non-zero;
  - prune removes only invalid top-level file entries, preserves a valid
    entry's nested rule/count data, writes deterministic two-space JSON with a
    final newline, is idempotent, and restores green;
  - absolute, empty, non-canonical, backslash, and `..`-escaping ledger keys
    fail closed; a non-object ledger fails without being rewritten;
  - unrelated configured and ignored files that have no ledger entry do not
    create false positives.

  Before the CLI exists, run the focused test and record RED from the missing
  behavior, not a passing framework assertion.

- [x] **Step 2: Implement the narrow membership/prune helper**

  The ESM CLI defaults to the app cwd and `eslint-suppressions.json`, with
  explicit `--cwd` and `--suppressions-location` options only so the real CLI
  can be tested in an isolated fixture. Normal mode never writes.

  For every ledger key, require a canonical contained relative POSIX path, a
  regular existing file, and `await eslint.isPathIgnored(path) === false`.
  Report every invalid key together. Treat config, filesystem, JSON, and shape
  errors as fatal.

  `--prune` removes only invalid top-level file entries. Preserve nested
  rule/count data byte-semantically, serialize deterministic two-space JSON
  with a final newline (`{}\n` when empty), and replace the ledger atomically so
  failure cannot leave a partial file.

- [x] **Step 3: Wire native lint first, census second**

  Change only these scripts:

  ```json
  "lint": "eslint . && node scripts/eslint-suppression-census.mjs",
  "lint:prune": "eslint . --prune-suppressions && node scripts/eslint-suppression-census.mjs --prune"
  ```

  Native ESLint remains the sole owner of diagnostics, parser/config errors,
  per-file rule/count ceilings, within-file stale detection, output formatting,
  and their exit precedence. The census never performs a second typed lint.

- [x] **Step 4: Prove the package boundary and self-mutate**

  Against the real worktree, temporarily generate a suppression for an owned
  proof file, require `pnpm lint` green, delete the file with `apply_patch`, and
  require normal `pnpm lint` red naming that path. Run `pnpm lint:prune`, prove
  the entry disappears and normal lint returns green. Separately inject an
  ignored-path proof entry, require red, prune it, and require green. Restore
  via the product commands plus `apply_patch`; assert the committed ledger is
  still exactly 37 pairs / 56 diagnostics and `git status` contains only the
  intended Task 7 files.

  Self-mutate the ignored-file membership branch and the prune deletion branch;
  each covering fixture test must fail for the intended reason, then pass after
  restoration.

- [x] **Step 5: Correct the record**

  Amend the spec and `docs/TESTING.md` to distinguish native within-file
  rule/count pruning from the repository's whole-file membership census. State
  that deleted and newly ignored ledger files are detected by normal lint and
  removed only by `lint:prune`; keep the same-count replacement as the sole
  accepted blind spot.

  Append the final review's ready-to-paste antagonist lesson:

  ```markdown
  - **“Normal full lint rejects every stale native suppression” is false when
    the entire debt-bearing file leaves the lint population.** ESLint applies
    native suppressions only to returned lint results; a deleted file produces
    no result and therefore no unused-suppression failure. **Technique: test
    ratchets by deleting or ignoring the whole debt-bearing file, not only by
    removing individual diagnostics, and compare ledger keys with the actual
    lint population.**
  ```

- [ ] **Step 6: Commit, replay the full gate, and obtain a clean re-review**

  Run the focused test RED/GREEN record, `pnpm lint`, `pnpm lint:prune`,
  `pnpm format:check`, and `pnpm typecheck`; verify the worktree root and commit
  as `build: close stale lint-ledger paths`. Then rerun every Task 6 proof and
  the complete Task 6 gate, remeasure lint time, confirm the clean worktree and
  unchanged 37/56 ledger, and return the whole branch to the original final
  reviewer. The reviewer must prove contained configured membership, exact
  failure naming, prune-only top-level removal, preserved native count
  semantics, idempotent formatting, and no diagnostic/exit-precedence drift.

- [ ] **Step 7: Create the PR and stop before merge**

  Only after a clean re-review, push `codex/lint-type-ratchet` and create one PR.
  Its first line is exactly:

  ```markdown
  This PR makes new typed-lint debt, untyped Playwright files, and false-green
  pre-commit failures mechanically visible.
  ```

  Follow it with at most six one-line bullets containing the measured
  diagnostic and file/rule-pair counts, `16/16` E2E membership, real-hook
  outcome, whole-file census/campsite behavior, no tester impact/no standalone
  release, and measured lint wall time. Put exact red/green probes, full gate
  results, the suppression breakdown, review verdict, spec/plan links, and the
  same-count blind spot in a collapsed `Record (for agents and audits)` block.

  Present the PR URL, CI status, suppression count, runtime, and independent
  review verdict to James. Do not merge without his explicit approval.
