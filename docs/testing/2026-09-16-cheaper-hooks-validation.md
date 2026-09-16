# Cheaper hooks: validation record

Scope: the cheaper-hooks increment stacked on admission `d61100b7`, not the
whole resource spec. Implementation: `cfa8b6f3`; mechanism repairs: `c22909c8`.
The plan author implemented inline with failing producer witnesses, real hooks,
commits before mutations, and independent review. Full exact-head hosted CI and
the final branch review are still outstanding. Worker defaults are unchanged.
No screenshots, Docker settings changes, broad cleanup or memory-savings claim.

## Reproducible gates

From `app/`, pure fixtures use Node's `--test --test-concurrency=1` on named
`scripts/local-work/*.test.mjs` files; installed-runner/real-hook fixtures live
in `scripts/local-work/native/`. Local author runs use the existing shared
owner/sampler via the plan's ignored `guard-native.mjs` driver. The driver only
accepts named fixture files and Node coverage controls; no admission bypass.
CI runs the native directory after installing both dependency roots.

Receipts are at the canonical Git common directory's
`ergomatic-local-work/receipts/<UUID>/`, with actual argv, source fingerprint,
stdout/stderr and streamed resource samples. IDs below name that evidence.
Short IDs are unique prefixes, not portable copies of private host telemetry.

| Gate and command scope | Source | Receipt | Result |
| --- | --- | --- | --- |
| All then-current harmless local-work fixtures | dirty parent paste-test tree | `4ca59c94-3997-4a7c-8fdf-fc8b4b9dddda` | 121/121 |
| Native + selection/docs/push-input fixtures, restored after mutations | clean `cfa8b6f3` | `4257305f-bdd5-4c98-b34d-71f81bd5c44e` | 43/43 |
| entrypoints, workloads, run, selection-git and all native fixtures | repair tree later committed as `c22909c8` | `c328d184-89e0-4661-93a3-4ba6a3c46859` | 87/87 |
| run, selection-git, native/selection-run and native/pre-commit with Node coverage | clean `c22909c8`, restored after mutations | `7e13d327-0cb4-4584-9014-9a625b0006f9` | 51/51 |
| Real pre-commit for mechanism repairs; installed lint-staged and all four compiler checks | committing `c22909c8` | `370c88d1-584c-42f4-aac2-1cdf69947fe8` | pass; E2E membership30/30 |

All listed outer receipts ended with verified cleanup. The fixtures deliberately
exercise simulated pressure, assertion failures, signal exits and allocator
messages; these are not host resource events. Actual sampler pressure remained
normal. `c328d184` and `7e13d327` are not full app-suite runs.

## Producer regressions and mutation evidence

The native fixtures start from actual Git input, installed Vitest, installed
lint-staged/ESLint/TypeScript, real pnpm, or Git/Husky as appropriate. They cover
exact-vs-substring paths, no-body inspection/refusal, dropped selectors,
duplicate protection identities, CSS/capture/native-file readers, signal/teardown
completion, partially staged edits and actual push consent lifetimes.

At `cfa8b6f3`, eleven separate mutations failed their intended checks: dropping
project from identity, exempting staged code as docs, ignoring untracked code,
ignoring full-request HEAD, widening native exact objects (`dfb06355`), dropping
owner-intent comparison (`5e046297`), omitting mandatory client/script producers
(`fd0adf6b`/`faf8bf0f`), accepting stale source (`25fb9d5b`), restoring native forced
exit (`356a1d0f`), and stripping the test-name filter in the actual public wrapper.
The four pure cases use `selection.test.mjs`, `docs-only.test.mjs` and
`push-input.test.mjs`; the public wrapper case uses `entrypoints.test.mjs`.
Restored public wrapper behavior is included in `c328d184`.

At `c22909c8`, removing NUL framing failed both unusual-path cases (`5eea94a2`);
enabling rename folding lost old endpoints (`4bcce324`); disabling global-input
refusal produced false empty passes (`24fa075b`); accepting a newly minted source
after cleanliness testing accepted the wrong push (`9ef404d5`); and removing
the production staging-restoration flag falsely released the interrupted hook
(`d6a221e3`). All were restored; `git diff --exit-code` was clean before the
51-test restored coverage run.

## Coverage and limits

Read Node's per-file text coverage, not the aggregate. In `7e13d327`,
selection-git is99.48% lines/86.57% branches, selection-run94.90%/59.09%, and
run91.71%/89.12%. Real-hook fixtures copy production modules into private Git
repositories; that subprocess coverage is outside these source-path rows.
Earlier native-adapter coverage in `4257305f` was96.45%/81.36%. These are scoped
rows, not a claim that every exceptional branch or future vendor version works.

Source observations cannot prove an edit was never made and restored between
samples. Native dependency selection is bounded by the import graph plus the
independent mandatory filesystem census; uncertain global inputs require full
consent. Interrupted restoration may need explicit manual repair from the
preserved backup; it never certifies success from process exit alone.

Measured tuning, browser/Compose, integration, native and interactive/bootstrap
lifecycle work remains in the whole-spec delivery checklist.
