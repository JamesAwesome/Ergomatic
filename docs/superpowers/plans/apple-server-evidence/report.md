# Apple server candidate — author evidence

Candidate: `0f4921d8` in `.claude/worktrees/wave-a-apple-server-paste`, based on `3cf849c7`. Source commits are `82fb92cb` (candidate), `299a31d3` (session-first locking), `f31b4190` and `832cde62` (producer/cleanup/input/freshness gates), `16b659f1` (untrusted signing-key rejection), and `0f4921d8` (shared HTTP start boundary). The server plan's complete patches are generated from that committed range. Parent branch/native/client/deployment changes are not included in this source claim.

The initial provider and store suites ran without their implementation modules and failed; receipts are `provider-red.log` and `attempts-red.log`. Additional coverage tests were written against the existing candidate, then tested by deciding-source mutations; they are not relabelled as tests-first implementation. The DBA concurrency regression ran red against the committed old lock ordering before the fix and green afterward (`lock-order-red.log`, `lock-order-green.log`).

## Executed gates

Node `v26.5.0`, pnpm `11.17.0`. Both scratch dependency roots were installed. The actual pre-commit hook rejected a deliberately injected Node 22 executable (`hook-reject.log`); each source commit subsequently emitted staged format/lint and whole-project typecheck output.

| Command / operation | Actual result and source revision |
|---|---|
| `paste_check.py <server-plan> <server-paste-worktree>` | Extracted all complete patches through real source paths; `git diff --exit-code` proved byte-identical to committed HEAD |
| `pnpm typecheck` | PASS; E2E TypeScript membership 24/24 (`typecheck.log`) |
| `pnpm lint` | PASS; normal ratchet/census checks, no suppression added (`lint.log`) |
| `pnpm format:check` | PASS (`format.log`) |
| `pnpm test:coverage --project unit --project integration server/auth server/app.test.ts --coverage.include='server/auth/**' --coverage.include=server/app.ts` | PASS at `16b659f1`: 129 tests, 16 files; scoped statements 93.35%, branches 90.50%, functions 99.12%, lines 94.69% (`coverage.log`) |
| `mutations.py <server-paste-worktree> --output <receipt-directory>` and the added `--only signed-audience-both-guards` run | Every prescribed deciding-source case produced assertion failures; all source restored. `mutations.json` and individual logs contain exact commands, head, anchors and failure summaries |
| `gh pr list --state open --json number,title,headRefName,files …` | Final audit returned only #423 `phase-td`, with no `app/drizzle/` files. Recheck before parent adoption; this is not a permanent promise about migration index 0031 |

No full unrelated unit/client suite, CI, browser suite, real-provider login, production boot, deployment, or phone operation is claimed by this report. Parent owns the whole-branch integration/release gates.

## HTTP admission preflight receipt

The test-only commit `0f4921d8` adds independent literal expectations for 120 admitted starts and HTTP 429 `{error:"rate_limited"}` at request 121. Fresh `createAttempts` plus sweep and a fresh `createFrontDoorRoutes` limiter are mounted in real `createApp` for each case. New native/web starts alternate and persist actual Postgres attempt rows; two companion cases use legacy native or web as the first charged request. Exhaustion is checked on all four routes, with no extra attempt/session row and no provider exchange. The legacy web URL builder is a fixture; admission and its actual router middleware are production code.

`pnpm test --project integration server/auth/frontDoorRoutes.integration.test.ts` passed 19 tests before mutation and after restoration (`http-boundary-green.log`, `http-boundary-restored.log`). `pnpm lint`, `pnpm typecheck`, and `pnpm format:check` passed; dedicated `http-boundary-*.log` receipts preserve the commands. The initial lint run caught conditional test assertions; they were made unconditional before commit. The actual commit hook again ran staged Prettier/ESLint and whole-project typecheck (`http-boundary-commit.log`). No production bytes, including the DBA-measured store, changed.

The following added `mutations.py --only` cases ran against committed `0f4921d8`: `http-start-limit` changes `limit: 120` to `121`; `legacy-native-start-charge` removes the legacy native admission mount; `legacy-web-start-charge` removes the legacy web admission mount. Each produced assertion failures and restored the committed source. Exact commands/head/failure counts are in `mutations.json`, alongside the earlier 38 receipts at their recorded revisions. The final whole route suite passed after all three restores. No unrelated suites or new aggregate coverage run were requested or claimed.

## Per-file coverage

Numbers below are the scoped coverage run at `16b659f1`, before the test-only HTTP boundary addition; coverage was not rerun for that addition. They were read from the actual HTML indexes, including fully covered files omitted by the text summary. The original HTML indexes are retained as `server-auth-coverage.html` and `server-coverage.html`; `coverage.json` is their mechanically extracted table. `server/index.ts` is excluded by the repository's existing coverage configuration: its wiring is compile/source evidence, not a booted-server claim. Shared types have no runtime coverage. Schema/migration behavior is exercised by real-Postgres fixtures and DBA queries.

| File | Statements | Branches | Functions | Lines |
|---|---:|---:|---:|---:|
| `server/app.ts` | 96.77% | 88.88% | 100% | 96.66% |
| `server/auth/attempts.ts` | 91.61% | 89.84% | 100% | 95.1% |
| `server/auth/frontDoor.ts` | 100% | 100% | 100% | 100% |
| `server/auth/frontDoorErrors.ts` | 88.88% | 90.9% | 100% | 88.88% |
| `server/auth/frontDoorRoutes.ts` | 87.34% | 82.75% | 95.23% | 88.07% |
| `server/auth/middleware.ts` | 100% | 100% | 100% | 100% |
| `server/auth/providers.ts` | 93.65% | 93.9% | 100% | 96.55% |
| `server/auth/routes.ts` | 95.94% | 90% | 100% | 95.89% |
| `server/auth/sessions.ts` | 100% | 100% | 100% | 100% |


The low branch rows are visible rather than hidden behind the passing scoped aggregate. Remaining route branches include malformed cookie/URL/body variants, persistence/cancel error paths, missing provider availability, and web returning-signin success. The runtime cleanup module is fully covered; physical cleanup during a stopped process is deliberately not promised.

## Requirement → supported test → deciding source

| Spec requirement | Executed proof | Deciding mutation(s) |
|---|---|---|
| 120 starts/minute, shared across new and legacy entry points | `frontDoorRoutes.integration.test.ts`: real HTTP/PG 120 admitted, request 121 rejected; legacy native/web start charged first; all four paths reject after exhaustion | `http-start-limit`, `legacy-native-start-charge`, `legacy-web-start-charge` |
| Signature, issuer, exact audience, expiry and nonce | `providers.test.ts`: signed wrong-claim cases and correctly shaped token signed by an untrusted RSA key | `signed-issuer-expiry`, `signed-nonce-audience`, `signed-audience-both-guards` (audience has two guards; remove both to test the oracle) |
| Exchanged Apple code resolves to original subject/configured client | Signed initial/exchange token subject mismatch; native/web path-specific audiences in producer tests | `exchange-subject`, audience probes |
| State and immutable provider intent, no earlier callback consuming later authority | Signed state rejection; wrong-provider callback leaves attempt; replayed authorization cancellation cannot erase confirm | `provider-state`, `callback-provider-intent`, `old-callback-stage` |
| Apple form_post reaches parser before origin protection; ordinary writes remain protected | Real `createApp` callback with Apple Origin and URL-encoded body succeeds; unbound callback leaves attempt; hostile-Origin confirm is 403 | `callback-mount`, `form-post-producer`; this is Express behavior, not a real browser cookie experiment |
| Missing/empty/overbound input creates nothing | Native malformed state/token/code/name cases and malformed begin cases; wrong state keeps authorize intact | `native-input-bounds`, `native-code-required`, `begin-shape` |
| New account has no user/session before confirmation | Native Apple/Google supported producer→confirm→usable `/api/me`; transactional pending signup row test | Grant/identity transaction probes plus native input/stage probes; no standalone premature-create mutation is claimed |
| Subject authority, relay email, missing name, no email merge | Returning subject works without email; different subject with same email creates a distinct user; supplied relay email preserved; absent name becomes Rower | `returning-subject-first`, `email-required`, `retained-grant`, `link-profile` |
| Two proofs and exact current-session finalization, both directions | Store tests cover Google→Apple and Apple→Google; native/web producer tests start Google signup then reauth and Apple target; same-user alternate session rejected; cross-site callback only stages before final POST | `existing-proof-owner`, `exact-session`, `native-nonce-rotation`, `link-profile` |
| Fresh existing-provider proof even if row expiry is later | Real Postgres timestamp placed beyond five-minute freshness with a later attempt expiry; finalize rejects and attaches nothing | `reauth-freshness` |
| Single exchange / binding / cancel cannot resurrect | Store claim replay/binding/cancel test; native and web bound cancellation; missing callback binding cannot erase a row | `binding`, `native-cancel-erasure`, `callback-cancel-erasure` |
| Atomic user/grant/session/consume; no session before commit | Forced named grant CHECK failure leaves no user/session and keeps confirm row; successful native token resolves through real session store | `grant-atomicity`, `retained-grant`; user/session transaction body is the actual pg transaction |
| One subject/one owner and explicit named conflict mapping | Real held conflicting INSERT blocks confirm, then returns the winner; linking an already-owned subject refuses without grant/consume mutation | `signup-conflict`, `link-profile`; no unrelated constraint is mapped to an account conflict |
| Session deletion and replacement do not deadlock transition | Query-paused real claim + same-session replacement asserts blocking and both completions; DBA independently reran original reproducer and session-revocation case | `session-before-attempt-lock`; see `../../research/2026-09-13-apple-db-measurement/report.md` for its exact source fingerprint and independent result |
| No provider HTTP under database locks | Native supported producer's exchange fetch obtains `SELECT id FROM auth_attempts FOR UPDATE NOWAIT` on another client, then verifies completed account/session | Named NOWAIT test and `provider-nowait.log`; no provider network is stubbed inside a transaction |
| Anonymous resident cap and physical cleanup | Real 512-row resident boundary refuses start; expired row rejects before sweep and disappears after sweep | `resident-cap`, `expiry-authority`, `physical-cleanup` |
| Startup cleanup, fail-closed readiness, minute recovery, shutdown | Runtime test makes startup query fail with a secret-bearing test exception, checks generic log only, denies begin, advances 59,999+1 ms, verifies recovery and close | `startup-sweep`, `sweep-interval`, `sweep-shutdown` |
| Disabled default and configuration readiness | Dark routes/options; exact flag literal; distinct Apple audiences/HTTPS/valid ES256 PKCS8 checks | `default-dark`, `flag-literal`, `valid-boot-key`, `disabled-route-response` |
| Legacy installed Google success contract / open admission | Existing legacy tests stay green dark; enabled native legacy request outside empty allowlist returns existing token/expiresAt/user shape; new native/web Google signup producer tests pass | `legacy-open-admission`; enabled legacy web callback uses same tested login adapter, but has no separate enabled-web end-to-end test |
| Never project Apple credential or web Ergomatic plaintext token | Native response contains no refresh credential; web JSON has no token and ordinary Lax cookie receives session | `retained-grant`, `web-token-projection` |

## Measurement limits and handoff concerns

- The Express limiter is configured with maintained `express-rate-limit`'s default in-process store, a constant global key, 120/minute and fail-closed store errors. The database 512 cap is the cross-process resident bound. The real Express/PG request-121 boundary and shared charging across new native/web and legacy native/web starts are exercised with fresh limiter/store fixtures. No multi-process shared-rate-limit claim is made.
- Stage/version/immutable-field equality is enforced by `bound`/`same` under row locks and guarded update. Replay and stage changes are exercised; there is no separate isolated mutation for every equality term or every malformed stored row.
- Freshness is tested at finalization; accepting a target after freshness expiry is guarded by the same five-minute bound but not independently mutated here. Existing completion while cleanup health is false is permitted by code but not exercised as a combined scenario.
- Account conflict with an absent/different target, grant retention in both directions, and rollback are exercised. Reattaching an already-equal subject through two simultaneously authorized operations is permitted by the conditional update but not separately exercised.
- Real Apple configuration/grouping, native/web subject continuity, actual Apple refresh-token behavior, real browser SameSite delivery, native bridge signing/entitlement and external release with deletion are later release evidence. Mock signers cannot settle those.
- This author did not change deployment/recovery docs or enable the front door. Controller owns those patches and the final rollback-floor record. No ROADMAP row was added or struck.

The measured structural defect was lock-order inversion. `begin(link)` held the session then waited for the attempt, while `bound` held the attempt then waited for the session. The correction locks the original session before the attempt in every transition, matching session deletion/cascade; it adds no retry. Other candidate corrections were adapter/test typing and coverage gaps, not new product scope.
