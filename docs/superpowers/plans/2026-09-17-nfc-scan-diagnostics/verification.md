# Author paste-test evidence

## Scope and trees

Product baseline: `55c63d63`. Research/spec/plan base: `75e2c0a5`.
Prototype: `ce33e750`, branch `codex/nfc-diagnostics-paste`, separate from the
documentation branch `codex/nfc-scan-diagnostics`. No phone install or merge.
The patch is extracted with `git diff 75e2c0a5 <prototype> -- app`.

The exact `git apply --check` and `git apply` commands in the plan passed
in the documentation worktree, then the patch was reversed there to keep
its branch documentation-only.

Phase 0 fixed the draft's **untested prescribed content**: executable code,
tests and mutation instructions now accompany the plan and were run by the
author. No in-document line references or unmeasured gate forecasts remain.

## Observed commands

Node 26.5.0; dependencies installed at root and app. A temporary Node-v1
stub made `git hook run pre-commit` fail with `HOOK BLOCKED: Node >=26
required, found 1`; the real commit ran lint-staged and typecheck.

- Initial `pnpm test --project client src/monitor/nfcScanDiagnostics.test.tsx`
  against unchanged product: 21 failed, 1 passed. Failures were missing
  cause/summary/outcome markers. The no-trace outcome already passed.
- The new test exposed a null localName handling mistake in the authored
  counter. Typecheck also rejected passing the transport factory directly
  to the hook's different factory interface. Both fixed before review.
- Focused command from the plan: 7 files, 469 tests passed on the first
  complete prototype (before additional absent/empty/queue/ownership cases).
- `pnpm test --project unit --project client --coverage`: 333 files,
  8662 passed and 1 skipped at `24412f02`. Production code is identical
  to `44aa4787`; later vendor-queue and recovery tests have their own focused
  and mutation gate receipt.
- Focused command at `44aa4787`: 7 files, 482 tests passed. The
  new native diagnostic seam accounts for 35 cases, also restored green
  after the recorded mutations.
- `pnpm lint`, `pnpm format:check`, `pnpm typecheck`: passed. Commit hook
  repeated typecheck against the committed prototype.
- `pnpm e2e connected.spec.ts --grep 'Phase NF: Scan NFC'`: 4 passed.
  Browser tests use the existing fake transport; the native seam test
  crosses the real reader/coordinator/lifecycle/transport/hook/export/viewer
  with only native plugins and paint/haptic mocked.

Full local logs were retained during authoring under `/tmp/nfc-diagnostics-*`;
the committed mutation receipt below preserves its output. Counts describe
these commands and source revisions, not future expected suite totals.

## Per-file coverage

Read the generated HTML reports at `app/coverage/src/monitor/` from the full
unit/client coverage run at `ce33e750`. `connectionAttemptTrace.ts`: 100% statements,
branches, functions and lines. `useMonitorSession.ts`: 97.93% statements,
92.41% branches, 100% functions, 98.83% lines. Native `capacitorBle.ts` is
excluded by existing vitest configuration; its direct tests and the native
plugin seam tests cover the prescribed diagnostics without claiming radio
or iOS-hardware coverage.

## Mutation evidence

The exact script is [mutations.py](mutations.py). It modifies committed
producer code, checks red, restores the original bytes and checks green.
The native receipt is [mutation-results.txt](mutation-results.txt).
The [browser receipt](browser-mutation-results.txt) records one failure with
the marker removed, then a restored pass. The browser mutation rebuilds the
compose image for each leg.

## Limits

The photographed failure is reproduced conditionally by background events;
these tests do not establish which event occurred on the wife's phone.
No stationary-tag interference or ignored-banner lifecycle behavior has
been observed on that device. No hardware or deployment success is claimed.

## Mechanism fold

The reviewer found that independent scan/stop mocks permitted an ordering
excluded by the vendor queue. The test now uses installed `getQueue(true)`;
a deliberate `false` bypass must fail its native-entry ordering assertions.
The start-release and cleanup-deadline legs also assert the hook export.
Additional tests cover a memoized initialization that remains pending across
retries and manual discovery after ordinary interruption versus poison.
These are source-level conditional cases, not incident reproductions.

The mechanism fold at `44aa4787` changed no product code; it changed test
fidelity and expanded the research evidence. The subsequent code fold below
adds the diagnostic classification corrections. The commit
hook caught conditional test assertions, which were moved outside the
conditional and typechecked/linted before the fold was committed.

## Prescribed-code fold

Reviewer-proposed native error names were added first. At `44aa4787` plus
those tests, the seam command failed four cases: undefined name reported a
matched summary; `constructor`, `__proto__` and `toString` reported an
undefined finished outcome. The fixes at `ce33e750` distinguish error
presence from its metadata and give missing mapped reasons a diagnostic-only
`link-failed` fallback. The seam then passed all 41 cases; the commit hook
ran lint and typecheck. The final mutation script restores each reviewer's
discriminator to verify these exact failure modes, not a substitute mutant.

## Final author verification

`pnpm test --project unit --project client --coverage` at `ce33e750`:
333 files passed, 8671 tests passed and one skipped. Repository aggregate
coverage passed; per-file HTML figures above are from this final tree.
The final mutation receipt and browser result below complete the same
prescription; they do not imply a third review or hardware validation.

At `ce33e750`, the final script caught all 26 mutants and restored a green
41-case seam run (count from `rg -c ': KILLED'` over the committed receipt).
The final named e2e command passed all four NFC flows. The earlier browser
mutation receipt concerns the unchanged requested-marker producer: removing
it failed the real viewer/export flow, restoring it passed.

The controller shut down compose project `ergomatic-99872` with its volume
after verification. Both worktrees remain for review; the main checkout's
three pre-existing iOS release edits were not changed.
