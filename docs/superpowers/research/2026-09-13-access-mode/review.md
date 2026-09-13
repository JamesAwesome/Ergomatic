Receipts named in this report are members of [the portable evidence archive](../../access-mode-evidence.tar.gz). Coverage includes the aggregate landing page and the nine affected source pages; it is a subset of the full report.

### Spec Compliance

- ✅ Spec compliant. `createAccessPolicy` validates the trimmed two-value enum, defaults absent/blank to restricted, normalizes the allowlist, denies an empty restricted list, and bypasses only that list in public mode (`app/server/auth/accessPolicy.ts:10-23`).
- ✅ Existing identities are resolved before the saved account email is authorized, and both legacy Google paths preserve that email while allowing name refresh (`app/server/auth/signin.ts:30-44`; `app/server/auth/attempts.ts:486-496`).
- ✅ Pending confirmation checks both the candidate and the canonical row returned after `ON CONFLICT` before grants or session minting (`app/server/auth/attempts.ts:402-415`, with the second check in `finishSignin` at `:224-233`).
- ✅ Session denial happens inside resolution before refresh, so protected middleware and direct consumers share the same behavior; bearer precedence returns on a denied winner before consulting the cookie (`app/server/auth/sessions.ts:45-70`; `app/server/auth/middleware.ts:71-102`; `app/server/routes/concept2.ts:337-352`).
- ✅ Every advancing link path reaches the policy-aware original-session resolver through `load`/`bound`, while begin, reauthentication acceptance, and finalization also recheck it directly (`app/server/auth/attempts.ts:120-156, 355-374, 417-430`). Denial remains transactional and the integration fixtures assert no attempt advance, identity attachment, grant, session, or account deletion (`app/server/auth/attempts.integration.test.ts:444-567`).
- ✅ Apple availability is derived only from the five trimmed configuration values: all blank returns Google-only before HTTPS validation, while any partial or locally invalid set rejects (`app/server/auth/frontDoor.ts:9-51`). Provider availability is independent of access mode.
- ✅ Production compose defaults to restricted and omits the test helper; E2E explicitly selects public with its secret-gated helper (`compose.yml:40-53`; `compose.e2e.yml:31-36`; `compose-validation.json`). No schema, migration, frontend copy, layout, or persisted revocation state was added.

### Strengths

- The implementation keeps policy in one immutable boot snapshot and injects it into every account/session boundary instead of caching eligibility in sessions or attempts (`app/server/auth/accessPolicy.ts:18-23`; `app/server/index.ts:88-94,187-200`).
- The real-Postgres tests cover the canonical-subject race with a blocked conflicting insert, retained denied sessions with later reallow, both providers, both legacy Google paths, relay linking, and every link transition (`app/server/auth/attempts.integration.test.ts:94-180,444-627`; `app/server/auth/sessions.integration.test.ts:88-115`).
- Saved evidence is strong: 344 files / 8,810 passing tests / 1 existing skip, aggregate coverage 98.26/96.56/98.98/98.99, nine actual touched-source HTML pages, green lint/typecheck/format, 12 biting behavior mutations, and a separate bounded SQL/lock PASS (`implementation-report.md:78-149`; `db-cost/report.md:1-80`). `app/server/index.ts` is correctly reported as compile-tested and coverage-excluded rather than as a 100% source page.

### Issues

#### Critical (Must Fix)

None.

#### Important (Should Fix)

None.

#### Minor (Nice to Have)

- `app/server/index.ts:92-95` — the empty-list warning checks raw text rather than the normalized parsed list, so `ALLOWED_EMAILS=, ,` denies everyone without the warning that the previous parsed-size check emitted. Its text also says only account creation is blocked, while the new policy blocks existing accounts and sessions too. Base the warning on normalized emptiness and describe all account access. Enforcement itself is correct.
- `implementation-report.md:151-160` — the first full integration run produced two unexplained recency failures (`expected 0`, received `-1`). A corrected d54 two-file baseline later passed 64/64, and later full integration (461/461) plus full coverage passed, but the cause remains unproved. The report accurately preserves it as an unresolved transient; do not relabel it pre-existing or fixed.

### Checks

- The review package's first single read was truncated by the harness mid-`attempts.integration.test.ts`; I continued only the unread line ranges. I inspected `app/server/auth/attempts.ts:90-530` separately because its package hunks cut the returned method object between transitions, and the requirement was that every in-flight link transition share the original-session policy check.
- Named unchanged-interface risk checked: `resolveSession` is called directly by Concept2 callback helpers and for the losing cookie in bearer/cookie disagreement. Both use the policy-aware resolver, and middleware stops after a denied winning bearer (`app/server/routes/concept2.ts:337-352`; `app/server/auth/middleware.ts:71-102`).
- No test was rerun. I read the source-pinned receipts and mutation logs. The report's final 8,810-pass count supersedes the earlier 8,808 count.

### Assessment

**Task quality:** Approved

**Reasoning:** The approved ACCESS_MODE amendment is implemented at every required authority and side-effect boundary, with focused concurrency, retention, compatibility, fixture, mutation, coverage, and database evidence. The two minor items do not undermine policy enforcement. This task review does not resume or complete the separately platform-blocked broad Apple code lens, which remains INCOMPLETE; no expiry probe or live provider/runtime check was performed.

## Controller disposition

The boot-warning minor was fixed in `05e7d8f554cae104e8d872f0a038113068db77b4`: normalized emptiness now controls the warning, which describes all account access. Existing normalization tests, scoped lint/format, and normal-hook full typecheck passed. The controller inspected the diagnostic-only diff; the independent approval above remains pinned to `c3e75610`. The transient recency failures remain explicitly unresolved.
