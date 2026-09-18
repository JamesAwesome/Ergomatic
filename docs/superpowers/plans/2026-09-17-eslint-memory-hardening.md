# ESLint memory hardening implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Ergomatic's full typed-lint contract while reducing repeat-run
memory to a few hundred megabytes and bounding cache-cold lint below the
current one-process peak.

**Architecture:** A small Node runner owns one content-addressed ESLint cache,
runs cache-cold files through sequential population slices, then finishes with
an authoritative `eslint .` sweep against the same cache so no path can be
omitted. The existing ESLint configuration stops parsing generated iOS output,
scopes React-only rules to client source, and skips unused JSDoc parsing. A
macOS pressure preflight refuses to start ESLint when the host already reports
warning or critical pressure; native suppression pruning stays uncached.

**Tech Stack:** Node 26 ESM, ESLint 10 flat config and native cache, TypeScript
ESLint Project Service, Vitest 4, pnpm 11.

**Spec:**
`docs/superpowers/specs/2026-08-29-lint-type-ratchet-design.md`, extended by
the measured 2026-09-17 spike approved in chat. The existing spec remains
authoritative for typed-rule coverage, project ownership, suppression pruning,
and the no-growth campsite rule.

## Global constraints

- Preserve all nine selected typed rules and their present production/test
  scopes; do not weaken or suppress a rule to save memory.
- Preserve native ESLint suppression semantics: normal lint never writes;
  pruning remains explicit; the repository census still runs after ESLint.
- Preserve one authoritative final `eslint .` population sweep so a new
  top-level lintable path cannot silently escape a hand-written partition.
- Cache identity includes Node version, `pnpm-lock.yaml`, `eslint.config.js`,
  and `eslint-suppressions.json`; a dependency, rule, runtime, or ledger change
  cannot reuse an older namespace.
- ESLint concurrency stays off. No worker-thread or parallel-process linting.
- A local macOS pressure value other than documented normal (`1`) defers before
  launching ESLint with exit 75. Linux/CI continues normally.
- Do not touch `app/src/`, `app/domain/`, stored data, auth, or product behavior.

---

### Task 1: Scope work to files that can use it

**Files:**

- Modify: `app/eslint.config.js:9-59`
- Create: `app/scripts/eslint-config-boundaries.test.ts`

**Interfaces:**

- Consumes: ESLint's `isPathIgnored()` and `calculateConfigForFile()` APIs.
- Produces: generated iOS output ignored; JSDoc parsing disabled for TS/TSX;
  React Hooks and React Refresh rules active under `src/**` only.

- [ ] **Step 1: Write the failing configuration-boundary test**

  Create a real-config test that asserts all three deciding boundaries:

  ```ts
  import { ESLint } from "eslint";
  import { describe, expect, it } from "vitest";

  const eslint = new ESLint({ cwd: new URL("..", import.meta.url).pathname });

  describe("ESLint cost boundaries", () => {
    it("ignores generated iOS web output", async () => {
      expect(
        await eslint.isPathIgnored("ios/App/App/public/cordova.js"),
      ).toBe(true);
    });

    it("parses no unused JSDoc and limits React rules to client source", async () => {
      const client = await eslint.calculateConfigForFile("src/main.tsx");
      const e2e = await eslint.calculateConfigForFile("e2e/design.spec.ts");

      expect(client.languageOptions.parserOptions.jsDocParsingMode).toBe("none");
      expect(client.rules["react-hooks/rules-of-hooks"][0]).toBe(2);
      expect(e2e.rules["react-hooks/rules-of-hooks"]).toBeUndefined();
      expect(e2e.rules["react-refresh/only-export-components"]).toBeUndefined();
    });
  });
  ```

- [ ] **Step 2: Run the focused test and verify the current config fails**

  Run:
  `pnpm test --project unit scripts/eslint-config-boundaries.test.ts`

  Expected: FAIL because the iOS bundle is not ignored, JSDoc mode is unset,
  and React rules are active on `e2e/design.spec.ts`.

- [ ] **Step 3: Implement the minimal flat-config split**

  Add `"ios/App/App/public"` to the global ignores and
  `jsDocParsingMode: "none"` beside `projectService: true`. Remove the React
  plugins and rules from the all-TypeScript block, then add this block directly
  after it:

  ```js
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
  ```

- [ ] **Step 4: Run the focused test and config-sensitive lint slices**

  Run:

  ```bash
  pnpm test --project unit scripts/eslint-config-boundaries.test.ts
  pnpm exec eslint src e2e server domain scripts shared
  ```

  Expected: PASS with no Babel deoptimization warning for
  `e2e/design.spec.ts`.

- [ ] **Step 5: Commit the config boundary**

  Before committing, run `git rev-parse --show-toplevel` and confirm it is the
  `eslint-memory-hardening` worktree. Commit the test and config together.

---

### Task 2: Add the cached sequential lint runner

**Files:**

- Create: `app/scripts/lint-run.mjs`
- Create: `app/scripts/lint-run.test.ts`

**Interfaces:**

- Consumes: `node_modules/.bin/eslint`, the three cache-identity files, and
  macOS `sysctl -n kern.memorystatus_vm_pressure_level`.
- Produces: `runLint(options): number`; CLI
  `node scripts/lint-run.mjs [--prune]`; cache files under
  `node_modules/.cache/eslint/<sha256>.cache`.

- [ ] **Step 1: Write failing tests for the runner contract**

  Import `cacheFingerprint`, `lintInvocations`, and `runLint` from the wished-for
  module. Inject a fake child runner and pressure reader; assert:

  1. cold normal mode runs the three app-test partitions, production, server,
     E2E, root configs, then final `.` in that exact order;
  2. every invocation receives `--cache`, `--cache-strategy content`, the same
     `--cache-location`, and no `--concurrency` flag;
  3. the final `.` sweep exists—deleting it is the deciding mutation;
  4. the first non-zero child status stops later invocations and is returned;
  5. pressure `2`, pressure `4`, and unreadable pressure on Darwin return 75
     without calling the child; pressure `1` runs; Linux skips the macOS probe;
  6. changing each cache-identity input or Node version changes the fingerprint;
  7. prune mode is exactly one uncached
     `eslint . --prune-suppressions` invocation after the same pressure guard.

  The expected normal-mode patterns are:

  ```js
  [
    [
      "src/monitor/**/*.test.{ts,tsx}",
      "--no-error-on-unmatched-pattern",
    ],
    [
      "src/session/**/*.test.{ts,tsx}",
      "src/workout/**/*.test.{ts,tsx}",
      "--no-error-on-unmatched-pattern",
    ],
    [
      "src/**/*.test.{ts,tsx}",
      "domain/**/*.test.{ts,tsx}",
      "scripts/**/*.test.{ts,tsx}",
      "shared/**/*.test.{ts,tsx}",
      "--ignore-pattern", "src/monitor/**",
      "--ignore-pattern", "src/session/**",
      "--ignore-pattern", "src/workout/**",
      "--no-error-on-unmatched-pattern",
    ],
    [
      "src", "domain", "scripts", "shared",
      "--ignore-pattern", "**/*.test.{ts,tsx}",
    ],
    ["server"],
    ["e2e"],
    ["*.{js,mjs,cjs,ts,tsx}"],
    ["."],
  ];
  ```

- [ ] **Step 2: Run the focused test and verify module absence is the failure**

  Run: `pnpm test --project unit scripts/lint-run.test.ts`

  Expected: FAIL because `scripts/lint-run.mjs` does not exist.

- [ ] **Step 3: Implement cache identity and invocation construction**

  Implement these exact exports:

  ```js
  export function cacheFingerprint({ nodeVersion, files }) {
    const hash = createHash("sha256");
    hash.update("ergomatic-eslint-cache-v1\0");
    hash.update(nodeVersion);
    for (const [name, contents] of files) {
      hash.update("\0");
      hash.update(name);
      hash.update("\0");
      hash.update(contents);
    }
    return hash.digest("hex");
  }

  export function lintInvocations({ cacheLocation, prune = false }) {
    if (prune) return [[".", "--prune-suppressions"]];
    const cache = [
      "--cache",
      "--cache-strategy", "content",
      "--cache-location", cacheLocation,
    ];
    return PARTITIONS.map((args) => [...args, ...cache]);
  }
  ```

  `PARTITIONS` ends with the authoritative `.` sweep shown in Step 1. Read and
  hash `pnpm-lock.yaml`, `eslint.config.js`, and
  `eslint-suppressions.json`; include `process.version`; create only the
  selected cache directory beneath `node_modules/.cache/eslint`. If the
  selected fingerprint cache and its success marker already exist, schedule
  only the final authoritative sweep; ESLint's content cache decides which
  files changed. Write the adjacent `<fingerprint>.complete` marker only after
  the cold final sweep succeeds, so a failed or interrupted partial cache is
  never mistaken for warm.

  Implementation amendment: the production-first and combined-test layouts
  missed the cold ceiling, so the final runner uses three test slices selected
  by measured source weight. `pnpm lint`, run from `app/` at normal pressure on
  the merge working tree based on `origin/main` `b15b800e` with no selected
  fingerprint cache, produced a passed local-work receipt whose maximum
  observed child-tree RSS was `1771392` KiB (`1813905408` bytes). A following
  `/usr/bin/time -l pnpm lint` warm run on the same tree reported `326238208`
  bytes maximum RSS and 5.62 seconds including the unchanged census phases.
  The warm single-sweep path removes seven needless process startups without
  changing lint membership.

- [ ] **Step 4: Implement pressure and child-process control**

  `runLint` accepts injected `platform`, `readPressure`, `runChild`, and `cwd`
  defaults. On Darwin, only pressure `1` proceeds; `2`, `4`, missing output,
  a failed `sysctl`, or an unknown integer prints one defer line and returns
  75 before cache creation or child launch. Elsewhere it proceeds.

  Run each ESLint process synchronously with inherited stdio and stop at the
  first non-zero status. If the child is signalled, the CLI re-signals itself
  so a killed ESLint cannot be flattened into an ordinary lint failure.

- [ ] **Step 5: Run tests to green and run deciding mutations**

  Run the focused test. Then temporarily remove the final `.` partition,
  restore a constant cache fingerprint, and treat Darwin pressure `2` as
  normal, one mutation at a time. Each mutation must fail the named assertion;
  restore after each and finish green.

- [ ] **Step 6: Commit the runner**

  Confirm the worktree root, inspect the staged diff against the commit
  message, and commit the runner with its tests.

---

### Task 3: Make the runner authoritative and document operation

**Files:**

- Modify: `app/package.json:17-18`
- Modify: `app/scripts/local-work/workloads.mjs`
- Modify: `app/scripts/local-work/workloads.test.mjs`
- Modify: `app/scripts/lint-run.test.ts`
- Modify: `docs/TESTING.md:543-571`

**Interfaces:**

- Consumes: Task 2's CLI, the shared local-work controller, and existing
  suppression/census scripts.
- Produces: `pnpm lint` as cached sequential normal mode;
  `pnpm lint:prune` as pressure-guarded native prune mode.

- [ ] **Step 1: Add a failing package-wiring assertion**

  Main-integration amendment (`origin/main` at `b15b800e`): package commands
  already route through the shared-worktree resource controller. Assert the
  package routes and the controller's internal lint phases:

  ```ts
  expect(pkg.scripts.lint).toBe("node scripts/local-work.mjs run lint");
  expect(pkg.scripts["lint:prune"]).toBe(
    "node scripts/local-work.mjs run lint-prune",
  );
  ```

  The workload contract expects `scripts/lint-run.mjs` and
  `scripts/lint-run.mjs --prune` as the first internal phases. Verify it fails
  while the controller still launches native ESLint directly.

- [ ] **Step 2: Wire package scripts without changing downstream gates**

  Keep the routed package scripts. Replace only the controller's native ESLint
  phase with the runner. Keep normal mode's suppression census, NUL check,
  transport census, and mock-registration census byte-for-byte and in their
  existing order. This preserves shared ownership, continuous pressure
  sampling, signal cleanup, and receipts around every lint run.

- [ ] **Step 3: Document cache, cold partitions, and exit 75**

  Extend TESTING §14 with:

  - cache identity and location;
  - content-based invalidation;
  - sequential cold slices plus final authoritative sweep;
  - one changed TS file still initializes Project Service;
  - `lint:prune` is uncached and may rewrite only native/census stale entries;
  - local Darwin exit 75 means the resource controller or runner started no
    ESLint child because pressure was not normal; it is neither a pass nor an
    OOM.

- [ ] **Step 4: Run the focused unit project and package gates**

  Run:

  ```bash
  pnpm test --project unit \
    scripts/lint-run.test.ts scripts/eslint-config-boundaries.test.ts
  pnpm format:check
  pnpm typecheck
  ```

  Expected: all green.

- [ ] **Step 5: Commit wiring and documentation**

  Confirm the worktree root and that no file under `app/src/` or `app/domain/`
  changed. Commit package wiring, tests, and documentation together.

---

### Task 4: Prove memory behavior and review the current head

**Files:**

- Modify only if a gate exposes a defect in Tasks 1-3.

**Interfaces:**

- Consumes: authoritative package commands from Task 3.
- Produces: measured cold/warm evidence and independent Standards + Spec review.

- [ ] **Step 1: Establish a normal-pressure measurement window**

  On macOS run `memory_pressure -Q`; proceed only when it reports normal.
  Record Node, pnpm, ESLint, and typescript-eslint versions. Do not launch a
  second heavy suite concurrently.

- [ ] **Step 2: Measure one cold and one warm full lint**

  Remove only the selected fingerprint's cache file beneath
  `app/node_modules/.cache/eslint/`, then run twice:

  ```bash
  /usr/bin/time -l pnpm lint
  /usr/bin/time -l pnpm lint
  ```

  Acceptance targets on this 16 GB Mac:

  - cold maximum RSS at or below 2.2 GB;
  - warm maximum RSS below 500 MB;
  - warm ESLint-runner wall time below 3 seconds, plus the unchanged normal
    census time for the full package command;
  - both runs execute the final population sweep and all four downstream
    repository gates.

  A signal death or `Allocation failed` ends the run; do not retry.

- [ ] **Step 3: Prove prune behavior on a disposable fixture**

  Use the existing suppression-census fixture tests plus a temporary ESLint
  fixture carrying one stale native suppression. Show normal mode fails without
  writing, prune mode removes only the stale entry, and the next normal mode
  passes. Do not mutate the committed suppression ledger for this probe.

- [ ] **Step 4: Run the final scoped verification**

  Run:

  ```bash
  pnpm test --project unit \
    scripts/lint-run.test.ts \
    scripts/eslint-config-boundaries.test.ts \
    scripts/eslint-suppression-census.test.ts
  pnpm lint
  pnpm format:check
  pnpm typecheck
  bash ../scripts/conflict-markers.sh
  ```

  No product source changed, so E2E, screenshots, PM, DBA, and hardware gates
  skip: this is repository tooling with no rower-visible, stored-shape, auth,
  database, or device behavior.

- [ ] **Step 5: Request independent branch review**

  Run the repository code-review workflow against the branch merge-base. The
  reviewer must check both axes: documented standards and this plan's contract,
  especially final-sweep completeness, cache invalidation, signal preservation,
  and suppression pruning.

- [ ] **Step 6: Reconcile findings and present the branch**

  Fix findings test-first, rerun affected gates, then reconcile the current
  head and diff. Do not merge; present the review verdict and measured cold/warm
  numbers for James's approval.
