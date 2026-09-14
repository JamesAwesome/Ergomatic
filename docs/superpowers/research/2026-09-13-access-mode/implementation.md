Receipts named in this report are members of [the portable evidence archive](../../access-mode-evidence.tar.gz). Coverage includes the aggregate landing page and the nine affected source pages; it is a subset of the full report.

# ACCESS_MODE implementation report

## Source identity

- Product base: `d54d74ec8fa17138a89507f6706e60f9e247752a`
- Approved spec/operator commit: `c8369d43`
- Implementation commit: `c3e756105ecce9df745902043f8690e5bc86db3c` (`feat(auth): enforce access policy across accounts and sessions`)
- Review-fix commit / final source: `05e7d8f5` (`fix(auth): normalize restricted access warning`)
- Branch/worktree: `wave-a-apple` at `.claude/worktrees/wave-a-apple`
- Final full-suite and HTML evidence below is pinned to `c3e75610`. Self-mutations were applied only after that commit and were restored exactly; `mutation-restore-diff.log` records exit 0 for `git diff --exit-code HEAD -- app compose.yml compose.e2e.yml`.

## Result

The server now builds one immutable account-access policy at process boot. `ACCESS_MODE` accepts trimmed `restricted` or `public`; absent/blank means restricted and any other value rejects startup. Restricted mode normalizes the allowlist and denies everyone when it is empty. Public mode deliberately ignores the allowlist.

The same required policy instance now governs modern Apple and Google attempts, both legacy Google sign-in paths, and cookie/bearer session resolution. Subject lookup precedes authorization for existing accounts, so `users.email` is authoritative. Neither legacy Google path overwrites it; display-name refresh remains. Apple relay email is used only for an Apple-first account, while a linked Apple identity continues to use the saved account email. No email linking was added.

Attempt transactions authorize the candidate before new-account creation, authorize the canonical row returned after a subject conflict before grant/session commit, recheck pending confirmation under the current process policy, and authorize the saved original-account email for every link read/claim/accept/finalize transition. Denials roll back account, grant, session, and link mutations. Existing data remains stored.

Session resolution joins the saved account email and denies before expiry refresh. Direct callback readers therefore share the rule, and a denied bearer cannot fall back to an allowed cookie. A later process can reallow retained accounts/sessions because this is configuration authorization rather than permanent revocation.

Apple provider configuration no longer reads `FRONT_DOOR_ENABLED`. Five absent/blank Apple fields select Google-only configuration, including HTTP localhost. Any present Apple field requires all five and local validation, including HTTPS and the existing key/client constraints. A complete valid set enables Apple under either access mode. The internal `frontDoorEnabled` capability field remains for compatibility. Google credentials remain independent.

Compose defaults `ACCESS_MODE` to `restricted`; the synthetic E2E stack explicitly selects `public`.

## Changed files

Production/auth wiring and contracts:

```text
app/server/app.ts
app/server/auth/accessPolicy.ts
app/server/auth/attempts.ts
app/server/auth/frontDoor.ts
app/server/auth/frontDoorErrors.ts
app/server/auth/routes.ts
app/server/auth/sessions.ts
app/server/auth/signin.ts
app/server/auth/users.ts
app/server/index.ts
app/server/testDeps.ts
app/shared/auth.ts
compose.yml
compose.e2e.yml
```

Behavioral tests and explicit fixture injection:

```text
app/server/auth/accessPolicy.test.ts
app/server/auth/attempts.integration.test.ts
app/server/auth/frontDoor.test.ts
app/server/auth/frontDoorRoutes.integration.test.ts
app/server/auth/middleware.test.ts
app/server/auth/native.integration.test.ts
app/server/auth/native.test.ts
app/server/auth/routes.test.ts
app/server/auth/sessions.integration.test.ts
app/server/auth/testSignin.test.ts
app/server/auth/users.integration.test.ts
app/server/routes/baselineProvenance.integration.test.ts
app/server/routes/baselineReset.integration.test.ts
app/server/routes/completedAt.integration.test.ts
app/server/routes/concept2.integration.test.ts
app/server/routes/concept2Send.integration.test.ts
app/server/routes/endedBy.integration.test.ts
app/server/routes/freeRow.integration.test.ts
app/server/routes/isolation.integration.test.ts
app/server/routes/logAmendment.integration.test.ts
app/server/routes/machineSummary.integration.test.ts
app/server/routes/partial.integration.test.ts
app/server/routes/seriesCapture.integration.test.ts
app/server/routes/source.integration.test.ts
app/server/routes/stats.integration.test.ts
app/server/routes/testHistoryDecouple.integration.test.ts
```

No schema, migration, index, frontend, or native/iOS source changed.

## TDD evidence

Tests were written at each policy seam before its production change. The observed RED/GREEN sequence was:

| Seam | RED observation | GREEN observation |
|---|---|---|
| Mode parsing and Apple boot configuration | New access-policy module missing; old `FRONT_DOOR_ENABLED` behavior contradicted partial/complete configuration cases | 17/17 focused tests passed |
| Legacy web/native Google paths | 10 focused failures exposed old allowlist authority and profile-email updates | 24/24 focused tests passed |
| Session resolution | A denied retained session resolved and refreshed | 6/6 focused integration tests passed |
| Transactional attempts | Six focused failures exposed missing candidate/canonical/reload/link/legacy checks | Auth integration later passed 69/69; `attempts.integration.test.ts` ended at 22 tests |
| Combined-flow legacy denial contract | Web returned the generic error redirect and native returned 500 | Both new contract tests passed with the established redirect/body |
| Concurrent canonical winner | The test held an uncommitted competing subject insert and observed the blocked insert through `pg_stat_activity` before release | Confirmation rejected the disallowed canonical winner and committed no grant/session |

The final combined-flow tests account for the increase from the earlier 8,808-test receipt to the source-pinned 8,810-pass receipt. The final receipt and its slightly changed aggregate percentages supersede the earlier run.

## Final verification

| Command | Result | Receipt |
|---|---|---|
| `cd app && pnpm test:coverage` | 344 files passed; 8,810 passed, 1 skipped; exit 0 | `test-coverage.log` |
| `cd app && pnpm lint` | ESLint and all four repository censuses passed; exit 0 | `lint.log` |
| `cd app && pnpm typecheck` | Client/server/build/E2E TypeScript and E2E membership 25/25 passed; exit 0 | `typecheck.log` |
| `cd app && pnpm format:check` | Prettier passed; exit 0 | `format-check.log` |
| `POSTGRES_PASSWORD=test TEST_AUTH_SECRET=e2e-secret docker compose -f compose.yml -f compose.e2e.yml config` | Rendered successfully; exit 0. Only the expected blank `CLOUDFLARE_TUNNEL_TOKEN` warning appeared. | `compose-config.log` |
| `cd app && pnpm exec vitest run --project unit server/auth/accessPolicy.test.ts server/auth/frontDoor.test.ts server/auth/routes.test.ts server/auth/native.test.ts server/auth/middleware.test.ts` | Restored source: 5 files, 67/67 passed | `mutation-restore-unit.log` |
| `cd app && NODE_OPTIONS=--experimental-vm-modules pnpm exec vitest run --project integration server/auth/attempts.integration.test.ts server/auth/sessions.integration.test.ts` | Restored source against real Postgres: 2 files, 28/28 passed | `mutation-restore-integration.log` |

The normal commit hook ran lint-staged over the 38 staged TypeScript files and the full repository typecheck. It was not bypassed. No browser/E2E or device task was required because this change has no `app/src`, layout, native, or iOS delta. No provider network call, live host, deployment, upload, or secret was used.

### Aggregate coverage

| Metric | Coverage |
|---|---:|
| Statements | 98.26% (13,541/13,780) |
| Branches | 96.56% (10,388/10,757) |
| Functions | 98.98% (2,740/2,768) |
| Lines | 98.99% (12,361/12,487) |

### Per-file HTML coverage for touched production files

The preserved HTML tree is `coverage-c3e75610/`. These are the nine actual source pages; `coverage/server/index.html` was a directory aggregate and is deliberately absent from this table and the preserved subset.

| File | Statements | Branches | Functions | Lines |
|---|---:|---:|---:|---:|
| `app/server/app.ts` | 100% (31/31) | 100% (18/18) | 100% (4/4) | 100% (30/30) |
| `app/server/auth/accessPolicy.ts` | 100% (6/6) | 100% (8/8) | 100% (2/2) | 100% (6/6) |
| `app/server/auth/attempts.ts` | 92.07% (151/164) | 90% (117/130) | 100% (34/34) | 95.39% (145/152) |
| `app/server/auth/frontDoor.ts` | 100% (26/26) | 100% (19/19) | 100% (7/7) | 100% (24/24) |
| `app/server/auth/frontDoorErrors.ts` | 90% (9/10) | 90.9% (10/11) | 100% (3/3) | 90% (9/10) |
| `app/server/auth/routes.ts` | 94.87% (74/78) | 86.11% (31/36) | 100% (7/7) | 94.8% (73/77) |
| `app/server/auth/sessions.ts` | 100% (24/24) | 100% (8/8) | 100% (7/7) | 100% (22/22) |
| `app/server/auth/signin.ts` | 100% (13/13) | 100% (8/8) | 100% (1/1) | 100% (13/13) |
| `app/server/auth/users.ts` | 100% (6/6) | 100% (2/2) | 100% (4/4) | 100% (6/6) |

`app/server/index.ts` is compile-tested by `pnpm typecheck` and explicitly excluded from coverage at `app/vitest.config.ts:77`. `app/server/testDeps.ts` is likewise coverage-excluded. `app/shared/auth.ts` is a type-union extension with no executable statement. `html-coverage.log` contains the extracted source-page values.

## Meaningful self-mutations

Each mutant changed committed production behavior, the named focused test failed, and the precise inverse patch restored the source. The final restored suites and diff receipt above passed.

| Mutated behavior | Killed by | Observed failure | Receipt |
|---|---|---|---|
| Restricted policy always allows | `accessPolicy.test.ts` | 4 failed / 5 passed | `mutant-access-restricted.log` |
| Public policy incorrectly consults allowlist | `accessPolicy.test.ts` | 1 failed / 8 passed | `mutant-access-public.log` |
| Invalid modes no longer reject | `accessPolicy.test.ts` | 4 failed / 5 passed | `mutant-access-invalid.log` |
| Partial Apple config treated as absent | `frontDoor.test.ts` | 1 failed / 7 passed | `mutant-apple-partial.log` |
| Restored operative `FRONT_DOOR_ENABLED` short-circuit | `frontDoor.test.ts` | 2 failed / 6 passed | `mutant-front-door-switch.log` |
| Session access check removed before refresh | `sessions.integration.test.ts` | 1 failed / 5 passed; denied session resolved with `refreshed: true` | `mutant-session-access-before-refresh.log` |
| Shared attempts access check disabled | `attempts.integration.test.ts` | 8 failed / 14 passed across new/returning providers, reload, canonical conflict, link transitions, and legacy Google | `mutant-attempts-access.log` |
| Legacy Google conflict overwrites saved email | focused attempts integration test | 1 failed; returning allowed account became `access_denied` | `mutant-legacy-google-email.log` |
| Legacy direct sign-in authorizes provider email instead of saved email | focused web route test | 1 failed; expected success became denied | `mutant-signin-saved-email.log` |
| Legacy direct returning-user access check removed | focused web/native route tests | 2 failed; web redirected success and native returned 200 | `mutant-signin-existing-access.log` |
| Combined-flow typed denial is no longer converted to established legacy responses | focused web/native route tests | 2 failed; generic web error and native 500 returned | `mutant-legacy-denial-contract.log` |
| Cookie chosen ahead of supplied bearer | focused middleware test | 1 failed; response became 200 instead of 401 | `mutant-bearer-precedence.log` |

## SQL-cost evidence

The stable new query shapes were handed to the scoped DBA task after `attempts.ts`, `sessions.ts`, and the legacy paths stopped changing. Its independent synthetic Postgres gate reports PASS at both 5 users/25 sessions and 100,000 users/1,000,000 sessions. The public measurement report is `docs/superpowers/research/2026-09-13-access-mode/db-cost.md`; it contains the environment, plans, timings, and index verdict. No schema or index was added.

## Transient integration record and concerns

The first complete integration run had 457 passing tests and two failures: `server/routes/isolation.integration.test.ts` at line 657 and `server/stores/stores.integration.test.ts` at line 834 each received `-1` where recency expected `0`. That run was console-only. The relevant log/store source and store test were byte-identical to `d54`; the isolation delta only injected the explicit test access policy. A first narrow baseline attempt was invalid because its filter skipped the upstream seed-owning test and failed at missing `preC`; it is not recency evidence. The corrected extracted-`d54` full two-file baseline passed 64/64 (`recency-baseline-full-files.log`). A later complete integration run passed 461/461, and the final full coverage run passed all 344 files and 8,810 tests with one existing skip.

The cause of the original two `-1` results is not established. They are recorded as an unresolved transient, not characterized as pre-existing or fixed. The existing ROADMAP integration-flake row remains the repository tracker; this task filed no duplicate row and made no unrelated recency change.

There are no other known implementation concerns. The prior broad Apple implementation review remains independently incomplete and platform-blocked; this bounded policy implementation does not claim to resolve or resume it.

## Approved-review minor disposition

The independent task review approved both spec and quality with no Critical or Important findings. Its one Minor finding observed that the boot warning checked only raw string trimming, so `ALLOWED_EMAILS=', ,'` blocked all account access without printing the empty-list warning. Commit `05e7d8f5` now uses the existing normalized `parseAllowlist(...).size === 0` result and states that all account access is blocked.

The focused existing normalization tests passed 13/13 (`minor-normalization-test.log`), scoped ESLint passed (`minor-eslint.log`), and scoped Prettier passed (`minor-format.log`). The normal commit hook then ran Prettier and ESLint on `app/server/index.ts` and the full repository typecheck, including E2E membership 25/25; all passed. This low-impact diagnostic-only change added no policy interface or behavior and no implementation-mirroring test. Per the scoped review disposition, the full suite was not rerun. The full 344-file, 8,810-pass coverage and nine HTML source pages remain explicitly pinned to `c3e75610`; `app/server/index.ts` remains compile-tested and coverage-excluded.
