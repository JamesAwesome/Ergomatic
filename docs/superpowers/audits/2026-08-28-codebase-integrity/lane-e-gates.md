# Lane E — Tests, Build/Deploy Paths, and Documentation Truth

Baseline: `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`

Status: IN_PROGRESS — PASS 1 COMPLETE; biting probes remain Task 9

Scope: Vitest/coverage boundaries, real/fake contracts, fixture provenance,
PM5 recordings and fake, Playwright/design gates, mutation scope, production
bundle exclusion, compose health, deploy rollback, import-cycle enforcement,
and factual comments that operate as test premises.

Authorities: executable configuration and production paths at the baseline;
PostgreSQL/HTTP/platform/protocol/design authority only where independently
identified. Repository comments are testimony.

Claims tested:

- The three Vitest projects and all coverage exclusions were re-opened from
  `app/vitest.config.ts:6-88`.
- Real/fake store contracts were classified as one shared parity oracle, not
  independent confirmation (`storeContracts.ts:11-17`).
- The E2E compose stack builds the production Vite artifact and separately
  arms the fake through `VITE_ENABLE_FAKE_MONITOR=1`.
- All 14 committed PM5 recording headers were enumerated: all are web captures;
  one carries `program` metadata.
- The production bundle gate checks five stable literals; Task 3 proved its
  green direction at this baseline.
- `/api/health` and compose readiness traverse DB → API → nginx; deploy rollback
  snapshots the pre-deploy checkout HEAD.
- The mutation record explicitly says its 2026-07-29 score is stale and Stryker
  runs unit tests only.
- No configured import-cycle analyser was found.

Cleared probes:

- Baseline lint, format, typecheck, unit, client, build, dist-grep, coverage,
  integration, and 420-test E2E gates passed in Task 3.
- The inventory re-opened every promoted row rather than relying on the scout's
  report or historical prose.
- Capture-header census and configuration searches were executed directly.

Candidates: none. Pass 1 maps evidence and unknowns; it does not issue defect
verdicts.

Unknowns:

- Current mutation strength and the red calibration of the bundle grep.
- Harmful runtime import cycles, if any.
- Native BLE/lifecycle truth, malformed-success API handling, permissive
  machine-summary meaning, and the coverage of important E2E states.
- Whether any test oracle shares the wrong PM5 quantity with production; Lane A
  and Lane D must discriminate before Lane E can judge it.

Contradictions with the brief:

- The E2E stack is not a development build. It is a production Vite build with
  a specific build-time fake seam.
- The real/fake store suites are not two independent oracles. Their own contract
  says real behavior is the specification.
- A green coverage gate cannot be described as native/radio coverage because
  native modules and both radio adapters are explicitly excluded.
- A current mutation score cannot be reported; the surviving record is stale.
