# NFC scan diagnostics implementation

James authorized implementation after the research and hardened plan.
The controller applied the committed patch inline, the shape permitted by
CLAUDE.md for an author-paste-tested plan; independent review remains required.

## Source and scope

The docs branch was rebased onto main `9c0e0618`. The implementation patch
applied without product-source conflicts. Both sides of the agent-ledger
append conflict were retained; NFC techniques became 80/81, with no numeric
citations to these entries elsewhere in the NFC record.

The first implementation commit `1d783de9` applied eight app source/test
files identical to the authored patch tested
at prototype `ce33e750`. Its initial failing tests, 26 deciding-source
mutations and browser mutation remain historical evidence in verification.md;
those results are not new runs on this implementation head.

## Current validation

Fresh implementation checks:

- Frozen installs at both roots; Node26.5.0. Deliberately presenting Node1 to
  the real pre-commit hook was blocked; normal hook then passed staged format,
  typed lint, full typecheck and E2E membership30/30 for `1d783de9`.
  Receipt `8d3e20f8-8588-47c5-b5f3-7986a2100599`.
- Exact seven-file client command from the plan:488 tests passed, including
  the41-case native seam. Receipt `5acc1fbc-573f-4f03-bb4d-ee190401d8a9`;
  tested the staged app bytes committed as `1d783de9`. Existing hook tests
  print React act warnings; no unhandled error or resource event was reported.
- `pnpm e2e connected.spec.ts --grep 'Phase NF: Scan NFC'`:4 passed
  against a freshly built stack from `1d783de9` product code plus the two
  added client-test assertions (no browser-source change). Stack
  `ergomatic-78603` was removed with its network and pgdata volume.
- The next commit hook refused before launching checks because pressure was
  warning (receipt `115fdef2-96b5-4751-afd2-86a8663a9611`, no phases).
  No automatic retry or bypass; the validation window was returned to the
  coordinating task. The first teardown attempt lacked REPO_ROOT and failed
  before removing anything; the corrected worktree-scoped teardown completed.
- New viewer-assertion mutations, normal push hook and current-head CI remain
  pending after resource coordination permits a new window.

Local receipts live under the Git common directory’s
`ergomatic-local-work/receipts/`; they are machine-local evidence, not committed
artifacts. The command results above are the durable record. The normal push
hook owns related plus mandatory verification, and hosted CI owns full
coverage/integration/browser validation. No duplicate full local coverage run
is needed: the unchanged covered product files reuse the author’s HTML rows
in verification.md (trace100% throughout; hook97.93% statements,92.41%
branches,100% functions,98.83% lines). The native transport has the existing
coverage exclusion and is exercised by direct/seam tests.

## Independent task review

Both agents reviewed the full staged app diff from docs base `dad6fdb8` and
read repository standards. They performed no heavy checks. No third hardening
pass was requested; these are implementation reviews.

### Standards

Verdict: changes requested, one medium maintenance heuristic. The reviewer
flagged repeated string classification in the transport summary and existing
hook error mapper, recommending a shared classifier/error type to avoid future
drift. No other concrete standards defect was found.

Controller ruling: no code change. These are deliberately different contract
values and authorities: the transport reports its winning decision with a
closed vocabulary, while the hook reuses the existing UI reason after cleanup.
For example, invalid-request maps to target-interrupted at the hook, and a
matched decision can finish as scan-cleanup-failed. No current misclassification
was shown; the cited Repeated Switches baseline is a heuristic, and RF26 does
not require one shared classifier. Moving or changing the existing UI mapper
would broaden this diagnostic change without repairing an observed defect.

### Spec

Verdict: PASS, with a low task-quality gap. The native viewer seam asserted the
abort cause but omitted explicit rendered requested/finished assertions;
the browser already covered those markers. The controller added both native
viewer assertions. No spec-behavior defect or scope creep was found.

### Remaining gate

Final whole-branch source review: PASS on `1d783de9` plus the staged viewer
assertions/docs. No code defects found. The reviewer confirmed attribution,
privacy, settlement/cleanup distinction and behavior preservation, including
the vendor-queue witnesses. No heavy checks were run by any reviewer.

Finalization is blocked by resource admission. After the first refusal, the
coordinator observed normal pressure with the owned stack removed and
explicitly assigned a new serial window. The normal commit hook then
admitted at normal pressure, completed staged formatting/lint and aborted on
rising pressure before completing all checks (receipt
`54c882a5-c93b-45b5-b8dc-a414bb4bb15f`, exit75, cleanup verified). No commit
landed and no retry followed. The window was returned. Preserve the staged
viewer assertions and this record; next work is their normal commit hook,
two deciding-source mutations/restored viewer pass, normal push protection,
and exact-head full hosted CI. No PR has been opened yet.



Physical causality remains unresolved. This change instruments future
failures and does not change connection policy, install a phone build,
authorize a hardware walk or merge a PR.
