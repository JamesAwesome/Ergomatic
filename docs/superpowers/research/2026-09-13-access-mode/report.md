# Account-access amendment — verification

The approved policy is implemented in `c3e756105ecce9df745902043f8690e5bc86db3c`; the boot-warning correction is `05e7d8f554cae104e8d872f0a038113068db77b4`. The [spec amendment](../../specs/2026-09-12-apple-signin-design.md) and [deployment instructions](../../../deploy.md) define restricted staging access, both providers, saved account-email authority and removal blocking existing sessions after configuration reload.

The independent [task review](review.md) approved spec compliance and code quality. Its diagnostic minor was corrected with scoped verification; no policy finding remains. The [implementation report](implementation.md) records TDD, all changed files, coverage and mutation evidence.

| Check | Evidence |
|---|---|
| Full coverage at `c3e75610` | 344 files; 8,810 pass, 1 existing skip; 98.26/96.56/98.98/98.99 statements/branches/functions/lines |
| Covered policy core | Access policy, sessions, sign-in helper, user store and Apple config all 100% in their actual HTML source pages |
| Mutation verification | 12 mutants killed; restored focused suites 67 unit + 28 integration tests pass |
| Static gates | Lint, formatting, full typecheck including E2E membership pass; boot-warning fix separately passes normalization tests and normal commit hooks |
| Production build at `c3e75610` | Build and ten-marker distribution gate pass; existing large-chunk warning retained in build.log |
| Compose defaults | Synthetic default deploy selects restricted with no test helper; explicit E2E override selects public with its helper; old switch absent |
| Database | [Measured point-query and lock check](db-cost.md) passes at synthetic household and stress scales; no schema/index/bulk-read change |

`server/index.ts` is compile-tested and excluded from coverage. Auth attempts, route and error files retain the per-file gaps disclosed in the implementation report; aggregate coverage does not erase them. CI for the final pushed documentation head is recorded in PR #425, rather than relabelling an earlier run as final-head evidence.

The first complete integration run reported two workout-recency assertions returning -1 instead of 0. A corrected unchanged-source two-file baseline passed 64/64, and later integration and full coverage passed. Their cause is unproved; this remains an unresolved transient under the existing integration-flake tracking, with no unrelated recency change.

The earlier broad Apple review remains platform-blocked and incomplete. This new policy review does not resolve that block or the original whole-PR gates. The PR remains draft; no merge to main, deployment, phone install or real provider login occurred. James's reported Apple host setup is preserved, while the new `ACCESS_MODE=restricted` host edit is still unconfirmed.

## Portable evidence

[Download the evidence archive](../../access-mode-evidence.tar.gz). SHA-256: `eb4de9b3e44a6a4966cf537bdce153f04ada011c1ed7f7958106d8cad2d64d84`. It contains reports, recorded gate and mutation output, affected coverage HTML, synthetic database scripts, configuration checks and a source manifest. `manifest.json` records every member's digest; all member bytes were verified after compression. Files and fixture credentials in the bundle are synthetic or repository source, with no real private key or host environment included.

## Integration with current main

GitHub withheld CI at `850bf12f` because the branch conflicted with newer main. Commit `e03bd0936642d726769a246be7a80e03e6ef4c91` merges main `67758f433aa4e0c8f622e4ef33a4d03e1ed2a17e`. The only manual conflict was two additive sections in the antagonist ledger; both were preserved. Normal merge hooks and full typecheck passed. The auth production directory, server entry point/app wiring, shared auth contract and both Compose files are byte-identical to `850bf12f` (`git diff --name-only 850bf12f e03bd093 -- app/server/auth app/server/index.ts app/server/app.ts app/shared/auth.ts compose.yml compose.e2e.yml` returned no paths).

Main contributes its already-landed Stats and Concept2 changes. The earlier coverage remains explicitly scoped to the policy source above; the named browser checks and completed CI for the combined tree are recorded in PR #425. Six trailing-whitespace lines arrived unchanged in main’s generated career-stats design HTML; no policy file introduced them.
