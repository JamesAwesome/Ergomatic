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

### AUD-005 — Harmful import cycles may be invisible to existing gates

- Category: circular proof
- Severity / confidence: P2 / Hypothesis
- User impact: a cycle-sensitive initialization path could block startup or a screen only under a different entrypoint or import order while current lint, typecheck, and build remain green.
- Expected authority: ESM initialization semantics plus the repository's declared domain/server/client and adapter-layer boundaries; Task 9 must establish the exact violated rule before promotion.
- Actual behavior: at the baseline, package, ESLint, and TypeScript configuration contains no `madge`, dependency-cruiser, `import/no-cycle`, or equivalent graph analyser. This proves only an enforcement gap, not that a harmful cycle exists.
- Independent disproof: run an explicit import-graph analyser over production modules, inspect every strongly connected component, and execute any affected entrypoint without importing production values as the expected result. A deliberately introduced known cycle must be reported by the probe.
- Scope: production TypeScript/ESM imports, dynamic monitor seams, adapter boundaries, and all application/server entrypoints.
- Existing coverage gap: lint, typecheck, tests, and build consume the current graph but do not reject a cycle merely because it exists.
- Verification required after a fix: zero unexplained production strongly connected components and a red calibration against a disposable known cycle.
- Status: deferred to Task 9.

### AUD-007 — A shorter reprogram may leave undetected stale PM5 intervals

- Category: brittleness
- Severity / confidence: P1 / Hypothesis
- User impact: after selecting a shorter workout, a rower could continue into
  intervals left from the previous program while Ergomatic reports that the new
  workout armed successfully.
- Expected authority: the selected workout's complete ordered interval sequence
  is the product contract; full replacement on a PM5 must be established by
  primary protocol semantics or independent physical observation, neither of
  which Task 5 found.
- Actual behavior: at baseline, `buildProgrammingSequence` sends only the new
  intervals and has no documented clear/truncate operation
  (`app/domain/monitor/pm5/commands.ts:319-359`). `verifyArmed` predicts and
  reads only workout type plus interval-zero duration/type
  (`app/domain/monitor/pm5/commands.ts:368-432`,
  `app/src/monitor/driver.ts:5156-5180,5312-5343,5367-5380`). Reprogramming five
  intervals to a shorter program with an identical first interval can therefore
  pass the existing check without observing the tail.
- Independent disproof: on a real PM5, program a five-interval fingerprint,
  then a shorter same-first-interval fingerprint, and advance past the intended
  endpoint while correlating command writes, PM5 screen, and app interval. The
  probe must not use `expectedArmedStructure` or synthetic status frames; a
  retained old interval must make it fail.
- Scope: compiler, programming sequence, ack-gated driver, structural readback,
  connected interval attribution, finish behavior, and stored actuals.
- Existing coverage gap: the primary worked examples program one workout; the
  physical two-frame capture does not perform long-to-short replacement; local
  tests can prove only which bytes Ergomatic sends.
- Verification required after a fix: long-to-short and short-to-long real-device
  sequences with distinct late intervals, plus replayable evidence if the
  device exposes a sufficient full-program readback.
- Status: deferred to Task 8 and Task 12's hardware decision.

### AUD-008 — The general 50-interval rejection lacks primary support

- Category: hallucinated claim
- Severity / confidence: P2 / Hypothesis
- User impact: Ergomatic may refuse a long but valid workout and tell the rower
  the PM5 cannot support it when the cited specification does not say that.
- Expected authority: Concept2's ordinary variable-interval count limit. In the
  official rev. 0.27 specification, Table 19's 50 applies to splits generated
  by a split duration, and the separate “up to a maximum of 50 intervals” text
  describes fixed-interval undefined-rest programming. Neither names the
  needed attribute: the general variable-interval count.
- Actual behavior: at baseline, `compileProgram` rejects interval 51 and states
  “The PM5 supports at most 50” (`app/domain/monitor/program.ts:458-463`).
- Independent disproof: obtain a primary Concept2 statement for the general
  variable count or program a 51-interval fingerprint whose last interval is
  unique and reach it on a PM5. The probe must not treat the code constant,
  compile error, or byte-sized index as authority; acceptance through interval
  51 must falsify the current message.
- Scope: validation's 100-step ceiling, repeat expansion, PM5 compilation,
  long-workout authoring, user error copy, and device behavior.
- Existing coverage gap: unit tests assert the chosen constant; no cited source
  or physical recording crosses it.
- Verification required after a fix: a primary-bound limit plus boundary tests
  below/at/above it; physical evidence only if Task 12 finds it decision-relevant.
- Status: deferred to Tasks 8–9.

### AUD-009 — Zero pace is assumed to mean no PM5 target

- Category: hallucinated claim
- Severity / confidence: P2 / Hypothesis
- User impact: effort-only intervals could display or enforce an unintended
  target even though the app presents them as untargeted effort.
- Expected authority: Concept2's defined representation and user-visible
  behavior for an individual untargeted variable interval. Rev. 0.27 examples
  containing `0x06` use nonzero pace, while several no-target fixed/JustRow
  examples omit `0x06`; none defines zero as a sentinel.
- Actual behavior: at baseline, null target compiles to raw zero
  (`app/domain/monitor/pm5/commands.ts:62-68,181-202`). A 2026-08-17 physical
  program accepted zero and ran, but the evidence did not establish what the
  target field displayed or enforced.
- Independent disproof: arm an effort-only variable program using zero, compare
  it with an otherwise equivalent omitted-`0x06` probe and a real-target
  control, and observe PM5 target presentation and pace behavior. The probe
  must not infer meaning from ack acceptance, the browser fake, or the app's
  own label; any semantic difference from a genuinely untargeted interval must
  make it fail.
- Scope: effort reference resolution, compiler null target, PM5 encoder,
  connected target presentation, and rower instruction.
- Existing coverage gap: encoder tests prove only that zero was sent; physical
  evidence proves only that the PM5 accepted the program.
- Verification required after a fix: primary-defined sentinel/omission behavior
  and a real-device effort-versus-target control.
- Status: deferred to Task 8 and Task 12's hardware decision.

### AUD-010 — Programming beyond the first PM5 frame lacks retention evidence

- Category: brittleness
- Severity / confidence: P1 / Hypothesis
- User impact: a long workout such as Sea Smoke could arm and begin normally but
  omit or reorder late intervals that were sent only in later frames.
- Expected authority: Concept2 multi-frame configuration retention semantics or
  a physical trace that reaches a uniquely fingerprinted later-frame interval.
  The primary protocol defines frame size and command boundaries but not
  cross-frame workout transaction behavior.
- Actual behavior: at baseline, Sea Smoke's 24 intervals are emitted locally in
  order over six ack-gated frames (`app/domain/monitor/pm5/commands.ts:235-317`,
  `app/domain/monitor/pm5/commands.test.ts:105-185`). The 2026-08-17 physical
  five-interval capture acknowledges both frames, but its only second-frame
  interval is index 4 and the run ends after indices 0–3
  (`docs/monitor/sessions/walk-2026-08-17/step-3-ring.json`, seq. 15–18, 54).
  Structural verification observes interval zero, so later-frame loss can pass.
- Independent disproof: send a workout with a unique interval only in a later
  frame, then reach and correlate that interval on the PM5 and app. The
  expected sequence must come from the raw authored fingerprint, not
  `buildProgrammingSequence`; dropping or reordering the last frame must fail.
- Scope: frame grouping, BLE write/ack order, PM5 configuration retention,
  structural verification, interval identity, and finish persistence.
- Existing coverage gap: local reassembly asserts that Ergomatic emitted its
  own output; no committed recording enters an interval configured outside the
  first frame.
- Verification required after a fix: a final-frame physical fingerprint across
  repeated arms, plus a replayable raw trace for every observable field.
- Status: deferred to Task 8 and Task 12's hardware decision.

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
