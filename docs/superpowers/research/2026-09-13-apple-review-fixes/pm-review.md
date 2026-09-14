# PM final gate — Apple AUTH correction round

**Corrected function: ACCEPTED at `c7fce22337bb03b486a7c2fd074c1fb1c7f96385`. Merge readiness: NOT READY. Public/TestFlight release readiness: NOT READY.**

The correction preserves the approved Apple-first product: Apple and Google remain available on native and web; an unknown provider identity reaches first-account confirmation before creation; email never joins identities; existing accounts link explicitly with fresh proof from both providers; one saved-email allowlist governs both providers and existing sessions; invitation denial keeps the authoritative email; and cancellation advances only after acknowledged cleanup. Disabled Add now reads disabled in both inspected viewports while retaining the existing `not-allowed` cursor. The local tester exit passes.

Final source-pinned validation passed at the frozen SHA: 351 files, 8,895 tests, one existing skip; 98.23% statements, 96.52% branches, 99.01% functions, 98.96% lines; lint, format, typecheck with 25/25 E2E membership, build, and dist grep all exited 0. The final disabled-Add browser case passed 1/1; root inspected all ten correction-round captures. Scoped spec and quality re-reviews pass. Targeted mutation evidence covers the changed denial, cancellation, capability, sweep, native logging, and disabled-action behavior. `authFlow.ts` branch coverage is 85.31% and is not exhaustive, but the approved product paths have targeted tests and killed production mutants; this does not reopen the functional gate.

This verdict was issued before publication; the controller subsequently replaced the validation placeholder, and exact-head CI status belongs to the PR record. Merge remains not ready because the original whole-PR code-lens review ended incomplete after an automatic platform block, and the scoped correction reviews cannot discharge it. Changed-head CI has not run because there has been no push. The PR record also still contained `VALIDATION_PENDING` at this inspection; the controller is replacing it. A merge automatically deploys this SHA to the staging host and activates the configured Apple/Google front door. Before merge, confirm `ACCESS_MODE=restricted` and the intended staging `ALLOWED_EMAILS`; current host values/loading were not inspected.

Public or external TestFlight release remains not ready until in-app account deletion exists, real Apple authorization proves native/web same-account continuity, and physical-device diagnostic collection proves the operator can receive the restored app-console signal. These are release gates, not defects in the correction.

Recommendation: accept the correction round and preserve the branch, but do not approve or merge the whole PR until the incomplete broad review is resolved and the staging access configuration is confirmed. This costs another review and delays staging deployment. The strongest case against holding is that local evidence is unusually broad and every named correction has scoped PASS plus mutation evidence; it still cannot establish the unperformed whole-PR review or live staging state.

## Proposed `pm-techniques.md` entry

Under **Patterns that recur**:

- **A scoped correction review can accept the named fixes, but it cannot discharge an incomplete whole-PR review.** Report corrected-function acceptance, merge readiness, and release readiness separately; otherwise strong local evidence silently turns a bounded PASS into approval of code the reviewer never covered. (Wave A Apple AUTH correction, 2026-09-13.)

## Proposed `pm-ledger.md` entry

```markdown
## 2026-09-13 — Wave A Apple AUTH correction final gate

- **Corrected function ACCEPTED at `c7fce223`; merge NOT READY; public/TestFlight release NOT READY.** The approved two-provider continuity, first-account confirmation, no-email-join, shared saved-email admission, both-proof linking, invitation denial, cancellation recovery, independent cleanup, and native diagnostic boundaries survive the fixes. Final local validation passed 8,895 tests in 351 files with one existing skip, 98.23/96.52/99.01/98.96 coverage, all static/build/dist gates, and the final browser recheck; scoped spec and quality reviews pass. The original whole-PR code-lens review remains incomplete after its platform block, so the scoped PASS cannot establish merge readiness. A merge auto-deploys the configured staging front door: confirm restricted mode and tester allowlist first. External TestFlight still waits for account deletion, real native/web Apple continuity, and physical-device log collection. No new ROADMAP filing.
```
