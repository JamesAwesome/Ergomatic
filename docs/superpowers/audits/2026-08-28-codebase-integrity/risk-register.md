# Audit Risk Register

Baseline: `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`

### AUD-001 — Native monitor failures can remain invisible to automated evidence

- Category: brittleness
- Severity / confidence: P1 / Hypothesis
- User impact: a rower may lose the monitor or fail to recover on iOS even while every browser and replay gate is green.
- Expected authority: Apple/Capacitor/plugin lifecycle and BLE contracts plus correlated native-device and PM5 observation; not yet established in Pass 1.
- Actual behavior: at baseline, `app/src/adapters/monitorTransport.ts:80-91` sends native directly to Capacitor BLE, while the recorder is reachable only through the web arm (`app/src/monitor/transports/recording.ts:44-57`). All 14 committed recording headers identify `transport: "web"`.
- Independent disproof: pending Task 8 native trace; it must not use the web fake, must correlate the phone and PM5, and must enter background/foreground, Bluetooth-off, link loss, and recovery. The web-only fields it does not read are irrelevant; replacing native callbacks with a dropped or reordered event must make the probe fail.
- Scope: native transport selection, plugin delivery, lifecycle, liveness, recovery, and diagnostic capture.
- Existing coverage gap: Vitest excludes `src/native/**` and both radio adapters; Playwright runs Chromium with the fake-injection seam.
- Verification required after a fix: native capture or hardware walk only if Task 12 finds it can change the ranking, plus replayable regression evidence where possible.
- Status: deferred to Task 8.

### AUD-002 — Successful malformed API responses may enter client ready states

- Category: brittleness
- Severity / confidence: P2 / Hypothesis
- User impact: an old or partially deployed client/server pair could render broken data or throw instead of offering a recoverable error.
- Expected authority: explicit version-compatible client/server response contract; Tasks 6–7 must establish it.
- Actual behavior: baseline readers including `app/src/api/useRecentLogs.ts:86-102` and `app/src/builder/BulkImport.tsx:72-87` cast successful `res.json()` values to local interfaces without runtime validation.
- Independent disproof: return a successful independently hand-shaped payload missing or corrupting a consumed field; the probe must assert the user-visible consequence without importing the client interface or server serializer. Removing a required field or changing its type must fail the probe.
- Scope: all successful JSON response readers, server serializers, installed-client compatibility, and UI error boundaries.
- Existing coverage gap: mocked happy-path payloads can mirror local interfaces; a TypeScript cast generates no runtime check.
- Verification required after a fix: malformed-success contract tests plus real mounted-server happy and backward-compatible responses.
- Status: deferred to Tasks 6–7.

### AUD-003 — The repository has no current measurement of mutation strength

- Category: circular proof
- Severity / confidence: P2 / Hypothesis
- User impact: tests may stay green while important decisions are corrupted, allowing a wrong number, lost record, or broken recovery to ship.
- Expected authority: a current mutation run over decision-relevant source with each survivor adjudicated; mutation establishes assertion bite, not product truth.
- Actual behavior: `docs/TESTING.md:106-123` says there is no evidence of a run since 2026-07-29; Stryker runs unit tests only and excludes contracts, client, integration, native, and radio paths.
- Independent disproof: Task 9 runs prioritized mutants selected from Lane A–D risk, records killed/survived/no-coverage, and separately verifies each expected value's authority. A deliberately corrupted protected decision must make its named test fail.
- Scope: `domain/**`, `server/stores/**`, `server/routes/**`, plus high-risk paths outside configured mutation scope.
- Existing coverage gap: the old aggregate score covered only seven of the then-current domain modules and cannot describe this baseline.
- Verification required after a fix: current scoped report and explicit dispositions for decision-relevant survivors/no-coverage paths.
- Status: deferred to Task 9.

### AUD-004 — Permissive machine-summary persistence lacks an established semantic contract

- Category: hallucinated claim
- Severity / confidence: P2 / Hypothesis
- User impact: malformed or invented summary fields could be stored and later interpreted as machine truth, or stricter validation could wrongly break compatible installed clients.
- Expected authority: the approved stored-shape and installed-client compatibility contract, including which fields are defined and optional; Task 6 must quote the load-bearing rule.
- Actual behavior: `app/server/routes/data.ts:648-706` accepts any plain object under 2048 UTF-16 code units and validates only `verificationBytes`; the adjacent comment says nine detail fields ride verbatim but cites repository design prose.
- Independent disproof: independently construct unknown, wrong-typed, old-client, and future-additive payloads; verify persistence/readback and every consumer without using the route validator as the oracle. Corrupt a consumed field's type and require the relevant contract probe to fail.
- Scope: log POST validation, jsonb storage, list/detail projection, installed clients, and summary rendering.
- Existing coverage gap: field-by-field tests can confirm current permissiveness without establishing whether it is the intended durable contract.
- Verification required after a fix: real-Postgres round trips, mounted API tests, old/new client compatibility cases, and consumer rendering.
- Status: deferred to Task 6.

`Smallest safe fix` is forbidden here until a risk reaches Confirmed or Probable confidence.

## Record contract

### AUD-### — short user-outcome statement

- Category: correctness | brittleness | over-engineering | circular proof | hallucinated claim
- Severity / confidence: P# / Confirmed | Probable | Hypothesis
- User impact: what a rower, operator, or account holder experiences.
- Expected authority: source, exact quoted rule, and what it measures.
- Actual behavior: baseline SHA, exact code/capture/build evidence, and trigger.
- Independent disproof: probe used; why it does not share the product's implementation, premise, source, or quantity; production fields it does not read; and a corruption that makes it fail.
- Scope: writers, readers, stored shapes, and paths affected.
- Existing coverage gap: why current tests did not or could not catch it.
- Verification required after a fix: test/capture/build/hardware proof.
- Status: candidate | validated | cleared | deferred.
