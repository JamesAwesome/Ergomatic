# Cheaper hooks: validation record

Scope: the cheaper-hooks increment stacked on admission `d61100b7`, not the
whole resource spec. Implementation: `cfa8b6f3`; mechanism repairs: `c22909c8`.
The plan author implemented inline with failing producer witnesses, real hooks,
commits before mutations, and independent review. Tasks1–3 passed independent
spec/quality review at `b15da9a0`. Final Standards/Spec review passed at
`5daf579e99774a95e39b96c1af907b639177a7ec`, with no blocking findings.
Full hosted CI35113605158 passed at that exact head. Worker defaults are unchanged.
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

The code-lens diagnostic fix committed at `b15da9a0` also had a post-commit
mutation: discard the initiating pressure reason (`4a9f8763`), then restore and
pass (`7873de8f`). The real commit hook passed in `3ef788fb`.

The native hook fixture now explicitly exercises local admission even beneath
hosted CI. Its fixture-only driver uses the existing observation-injection
seam on Linux and real pressure on macOS; this adds no production bypass or
Linux admission claim. Ambient hosted-CI regression RED `6c352005`, repaired
five-case real-hook fixture GREEN `743986a4`.

The fixture correction is committed at `5daf579e`: removing its ambient-CI
normalization made the post-commit mutant fail (`981d4f5b`); restoration passed
(`1f01ab29`). Real pre-commit `7402459e` and full pre-push `e9533144` passed
with verified cleanup. No earlier head's telemetry is relabelled as this head.

## Exact-head hosted gate

[CI35113605158](https://github.com/JamesAwesome/Ergomatic/actions/runs/35113605158)
has head `5daf579e99774a95e39b96c1af907b639177a7ec` and conclusion success.
Root hooks, scripts, app, Docker and browser jobs passed; deployment was skipped
for this pull request. Job104853398659's native coverage evidence
`104fa7fb-fd8b-4af5-a722-e1704c032f4d` reports361files,
9167initial executions,1existing skipped test, no first-attempt failures,
retries, suite errors or termination/resource events. Job104853398869's
browser evidence `c874d3c6-93bc-4e8d-848b-10fbbc8fc9f7` reports603initial
executions, no first-attempt failures, retry recoveries, suite errors or
termination/resource events. These figures were read from both jobs' evidence
checks, not inferred from the green run.

## Landing after admission

James authorized merging ready increments as work proceeds on2026-09-16.
Admission #463 landed as2594c7a7. The ancestry-only reconciliation7c12b51b
preserved exactly5daf579e's tree7ef96bf7ad9e3b3b79ff07f5977e7fcb4a50a783;
the two independent review passes still cover that unchanged code. Real commit
hook6dd34140 and guarded full pushd01a50d8 both passed with verified cleanup.
Fresh [CI35126121543](https://github.com/JamesAwesome/Ergomatic/actions/runs/35126121543)
has headSha7c12b51b3866135e0230426508af3955684ba75c and conclusion success.
Its app evidence7f2f9608-1537-4f1e-b090-5b3c5a633e1a records9167initial
executions,1existing skip; browser07ddc83a-f201-47be-b152-c2845f8c5290 records603.
Both published checks show zero first-attempt failures, interruptions, retry
recoveries, exhausted executions, suite errors and termination/resource events.
All required jobs passed; deploy skipped for the PR. #464 merged asdae29d50.
Post-merge CI35127501979 passed atdae29d50, including deploy. No TestFlight release is
needed for tooling changes; agent guidance and techniques are in the PR.

## Actual full pre-push observation

At clean `b15da9a0`, `pnpm push:full --set-upstream origin
codex/memory-cheaper-hooks` passed in receipt
`cccb90d2-f7be-4791-8062-9e2dfd75b6a0`:332 unique unit/client identities executed
once in11batches. Summing each native `batch-*/report.json` gives8630passed,
1existing skipped witness and0failed. Cleanup verified, no allocation failure
or resource abort. This excludes integration, which remains hosted/explicit.

The receipt's start/end give50.837s. Streaming `resources.jsonl` and taking
the maxima of `observedTreeRssKiB` and `wrapperRssBytes` gives1513.28MiB test
tree and73.70MiB wrapper separately; largest consecutive timestamp gap1031ms.
All pressure states were normal. Host swap used moved4641.44MiB→4633.38MiB;
that is background-sensitive host state, not attributable test memory saved.
This is one sampled observation, not paired performance evidence. Existing
React act/navigation diagnostic noise is retained in the logs.

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
