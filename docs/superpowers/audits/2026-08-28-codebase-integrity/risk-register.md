# Audit Risk Register

Baseline: `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`

## Task 10 disposition

- No hypothesis was promoted into the preliminary validation slate.
- AUD-001, AUD-007, AUD-009, and AUD-010 remain device hypotheses for Task
  12's ranking-based hardware decision; no hardware spend is authorized yet.
- AUD-004 and AUD-017 require product-contract decisions before a code fix can
  be prescribed.
- AUD-008, AUD-018, and AUD-019 require external or device evidence that the
  existing audit does not possess.
- AUD-003 is P3 process debt and AUD-005 is cleared at the baseline. Neither
  consumes Task 11 validation spend.
- AUD-020 was split from preliminary finding AUD-011 because post-commit
  cleanup/retry behavior has a distinct trigger, authority, fix boundary, and
  regression.

## Task 11 disposition

- Four fresh blind passes validated all nine preliminary findings. Eight are
  Confirmed; AUD-002 is Probable because no real malformed-success producer or
  compatibility trigger is established.
- AUD-013 moved from P2 to P1 after a real boundary matrix proved one owned row
  blocks the entire History surface without rower recovery.
- AUD-016 and AUD-020 moved from Probable to Confirmed after mounted
  finish-to-Log and real-PostgreSQL duplicate/plan-cardinality probes.
- AUD-014 remains P2 despite a validator's P1 recommendation: rejected logout
  never reports success and does not bypass server authorization, so it does
  not meet the fixed P1 definition.
- No quarantined hypothesis was promoted or cleared by these passes. Task 12
  still owns only the decision value of external/hardware evidence.

## Task 12 hardware-ranking decision

Decision: `HARDWARE_COMPLETE`; no hypothesis entered the fix list.

James approved and completed the compact three-row matrix. The evidence is in
`docs/monitor/sessions/walk-2026-08-28-codebase-audit/`. The PM5 and app photos
are correlated pairs rather than same-frame captures; raw Web Bluetooth
streams establish ordering for the programming legs, and the native ring plus
saved-detail screenshot establish the interruption-to-save path. That
substitution is sufficient for AUD-007/AUD-010 and the observed AUD-001 path,
but not for AUD-009's semantic control.

| Included question                                                 | Observed evidence                                                                                                                                                                                                      | Disposition                                                                                                                                                                                                                          |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AUD-010 later-frame retention plus AUD-007 stale-tail replacement | The six-interval raw stream contains ordered 0x0037/38 boundaries 1–6; interval 5 carries the authored 60 s rest. The immediate two-interval replacement contains only boundaries 1–2 and naturally finishes at 200 m. | Clear both hypotheses for PM5 `432331249` in these observed runs; firmware was not recorded. Do not generalize to other devices or firmware. No finding promoted.                                                                    |
| AUD-009 zero-target meaning                                       | The ring proves raw zero pace; the PM5 READY screen shows `:00 /500m`, but that screen position is also the live/current-pace field. No omitted-pace control was run.                                                  | Remains a P2 hypothesis. Ack, successful rowing, and an ambiguous display do not establish sentinel meaning or target enforcement.                                                                                                   |
| AUD-001 native interruption-to-save                               | Radio-off after one complete 100 m produced a native disconnect, `1 interval kept`, and a saved 100 m / 0:29 / 2:23.5 row matching the PM5's approximately 28.7 s / 2:23.8 display and boundary ring.                  | No P1 outcome. Narrowed for this exact native path; global callback-order and buffering uncertainty remains. A 4.6 s camera excursion separately produced a self-recovering false LOST banner, recorded as low-priority brittleness. |

Excluded from this walk:

- AUD-008 needs a primary general interval-limit statement or a long 51-interval
  execution. Its possible P2 result cannot reorder the five validated P1s, so
  the operator cost is not justified now.
- AUD-018 already has two conflicting real PM5 outcomes. A third sample cannot
  establish a general partial-work rule; replay and a product decision come
  before more hardware.
- AUD-019 is a missing bounded-recovery control. Injected browser chunk loss can
  test that locally; an ordinary successful hardware run cannot disprove the
  unbounded wait.

The walk used eight 100 m intervals plus about ten seconds of a ninth, within
the approved reduced budget. Bluetooth was restored and the lab was torn down
after evidence collection.

## Task 13 current-main and queue disposition

Current main: `fd4d06a57581e1e814ecd06f74274a30bffce6ee`.

All six phase-close P1/P2 paths remain present. The baseline→main `app/` diff
touches only a monitor type test, design/screenshot tests, and
`BaselineEditor`; none intersects an actionable production scope. Later-main
behavior was not used to rewrite any baseline reproduction.

The six findings are assigned to five ROADMAP-owned chunks, but current main
added a newer Wave F P1 and the audit does not impose a global execution order.
Hypotheses and P3 results remain outside `claude-fix-list.md`; the only hardware
dispositions are exact-case clearances/narrowing, not universal device claims.
AUD-003 remains grouped P3 process debt and AUD-005 remains cleared.

## Task 14 phase-close evidence corrections

- **AUD-013:** raw SQL proves a list-cast hardening gap, but supported writers
  do not preserve `1e1000` and no repair/import/legacy producer was found.
  Downgraded from P1 to P3 unsupported-trigger debt.
- **AUD-020:** duplicate rows/plan advancement are real if post-201 cleanup
  throws, but all probes fabricated a selectively throwing `removeItem`; the
  normative Storage algorithm defines no such branch. Downgraded from P1 to P3
  unsupported-trigger debt pending a real throwable operation.
- **AUD-012:** concurrent empty-database startup really fails, but the supported
  deployment is explicitly serial and single-replica. Downgraded from P2 to P3
  stale-claim debt; its docs correction rides the next deployment-doc PR.
- **Over-engineering:** partially covered. Runtime cycles, state/writer/authority
  seams, and platform/test reachability were checked. Repository-wide extra
  state, one-consumer/unused interfaces, production dead branches, duplicate
  mechanisms, and measurable change amplification remain deferred.

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
- Status: Task 12 reproduced a native radio-off interruption after one complete
  interval. The app exposed a recoverable End/save route and persisted the same
  100 m the PM5/ring measured, so the ranking-changing P1 outcome did not occur.
  The broad hypothesis remains narrowed, not globally cleared. Separately, a
  4.613 s camera excursion produced a transient LOST banner with no disconnect
  and recovered 34 ms after resume; that is confirmed low-priority brittleness,
  not data loss.

### AUD-003 — The repository has no current measurement of mutation strength

- Category: circular proof
- Severity / confidence: P3 / Confirmed
- User impact: tests may stay green while important decisions are corrupted, allowing a wrong number, lost record, or broken recovery to ship.
- Expected authority: a current mutation run over decision-relevant source with each survivor adjudicated; mutation establishes assertion bite, not product truth.
- Actual behavior: `docs/TESTING.md:106-123` says there is no evidence of a run since 2026-07-29; Stryker runs unit tests only and excludes contracts, client, integration, native, and radio paths.
- Independent disproof: Task 9 mapped each promoted candidate to the exact corruption its regression must kill. The candidate reproductions entered the missing branches while the ordinary suite stayed green; no aggregate score was needed to establish those concrete gaps.
- Scope: `domain/**`, `server/stores/**`, `server/routes/**`, plus high-risk paths outside configured mutation scope.
- Existing coverage gap: the old aggregate score covered only seven of the then-current domain modules and cannot describe this baseline.
- Verification required after a fix: candidate fixes carry their own documented red mutation. Refresh the aggregate report only if it becomes a real scheduled gate rather than a historical score.
- Status: Task 9 confirmed the stale measurement, but it is not a separate product candidate. The repository already labels it stale, and candidate-specific regressions own the demonstrated user risks.

### AUD-004 — Permissive machine-summary persistence lacks an established semantic contract

- Category: hallucinated claim
- Severity / confidence: P2 / Hypothesis
- User impact: malformed or invented summary fields could be stored and later interpreted as machine truth, or stricter validation could wrongly break compatible installed clients.
- Expected authority: an independent installed-client compatibility contract naming which fields are defined and optional. Task 6 found no such contract; repository design prose and interfaces remain testimony.
- Actual behavior: `app/server/routes/data.ts:648-706` accepts any plain object under 2048 UTF-16 code units and validates only `verificationBytes`; the adjacent comment says nine detail fields ride verbatim but cites repository design prose. Lane B confirmed the absence of a stronger field contract without claiming a user consequence.
- Independent disproof: Task 7 must independently construct unknown, wrong-typed, old-client, and future-additive payloads; verify persistence/readback and the first real consumer without using the route validator as the oracle. Corrupt a consumed field's type and require the relevant contract probe to fail.
- Scope: log POST validation, jsonb storage, list/detail projection, installed clients, and summary rendering.
- Existing coverage gap: field-by-field tests can confirm current permissiveness without establishing whether it is the intended durable contract.
- Verification required after a fix: real-Postgres round trips, mounted API tests, old/new client compatibility cases, and consumer rendering.
- Status: Tasks 6–7 mapped the first consumers, and Task 10 found that no code
  fix is supportable without a product compatibility contract. Deferred as a
  P2 Hypothesis; no implementation prompt is prescribed.

### AUD-005 — No harmful production import cycle exists at this baseline

- Category: circular proof
- Severity / confidence: P3 / Cleared
- User impact: a cycle-sensitive initialization path could block startup or a screen only under a different entrypoint or import order while current lint, typecheck, and build remain green.
- Expected authority: ESM initialization semantics plus the repository's declared domain/server/client and adapter-layer boundaries; Task 9 must establish the exact violated rule before promotion.
- Actual behavior: at the baseline, package, ESLint, and TypeScript configuration contains no `madge`, dependency-cruiser, `import/no-cycle`, or equivalent graph analyser. A TypeScript-AST graph over 217 production runtime modules and 489 relative value-import edges found zero strongly connected components.
- Independent disproof: a disposable two-module runtime cycle inside the scanned graph produced exactly one SCC; after removal the same probe returned zero. Type-only and external-package edges were excluded deliberately.
- Scope: production TypeScript/ESM imports, dynamic monitor seams, adapter boundaries, and all application/server entrypoints.
- Existing coverage gap: lint, typecheck, tests, and build consume the current graph but do not reject a cycle merely because it exists.
- Verification required after a fix: none at this baseline. If a persistent gate is later added, retain the disposable red calibration.
- Status: cleared by Task 9. Missing continuous enforcement is P3 process debt, not evidence of a current architecture defect.

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
- Status: Task 12 cleared the stale-tail hypothesis for PM5 `432331249` in the
  observed runs (firmware was not recorded): immediately after a six-interval program, a two-interval
  same-first replacement emitted only split numbers 1 and 2 and naturally
  finished at 200 m. Cross-device/firmware generalization remains unsupported;
  no finding is promoted.

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
- Status: Task 9 confirmed the cited source is silent on the required general
  variable-interval attribute. Task 12 excluded an interval-51 hardware probe
  because it could not change the final ranking. Deferred as a P2 Hypothesis.

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
- Status: Task 12 photographed `:00 /500m` at READY after raw zero was emitted,
  but that screen location is also the live/current-pace field. Without the
  required omitted-pace or real-target control, sentinel meaning and enforcement
  remain unknown. The P2 hypothesis stays quarantined and does not enter the fix
  list.

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
- Status: Task 12 cleared the retention hypothesis for PM5 `432331249` in the
  observed runs; firmware was not recorded. The authored second frame contained intervals 5 and 6;
  the raw stream reached both in order, recorded the unique 60 s rest on
  interval 5, and naturally finished after interval 6. This is exact-case
  physical evidence, not a universal firmware contract; no finding is promoted.

### AUD-017 — Ambiguous committed responses can duplicate a log and plan advance

- Category: brittleness
- Severity / confidence: P1 / Hypothesis
- User impact: if the server commits a log but the response is lost, a normal
  retry can create another row and may advance the active plan twice.
- Expected authority: no durable session identity or retry-idempotency product
  contract has yet been approved; intentional same-workout repeated logs must
  remain possible.
- Actual behavior: client failure recovery retains the session and invites
  retry (`app/src/session/LogSession.tsx:702-781`); each server create inserts a
  new row and resolves plan position transactionally without a client operation
  key (`app/server/stores/logs.ts:598-675`).
- Independent disproof: abort a mounted response after the real transaction
  commits, retry once, and inspect log rows plus `plan_state`. The probe must use
  an independently assigned operation identity rather than title/time guesses.
- Scope: phone and monitor save, network/proxy loss after commit, log store,
  plan advancement, and manual duplicate-log intent.
- Existing coverage gap: client tests model rejection or status, while server
  tests always deliver the created id; neither creates an ambiguous outcome.
- Verification required after a fix: commit-then-abort, retry, deliberate second
  session, plan and no-plan saves, and backward compatibility for installed
  clients without an operation key.
- Status: requires a product identity decision before promotion.

### AUD-018 — A PM5-retained partial can lose its saved measurement

- Category: correctness
- Severity / confidence: P2 / Hypothesis
- User impact: after a Menu-terminated workout, the saved summary can include
  work from a partial interval while its planned step has no measured fields,
  leaving two parts of the same log describing different work.
- Expected authority: the PM5 memory row for the same terminated session and an
  approved product rule for partial work. Two physical captures establish that
  PM5 behavior is not uniform enough to infer the rule from one session.
- Actual behavior: at baseline, the hook closes synchronously on `terminated`
  and the record admits a late boundary only after natural finish
  (`app/src/monitor/useMonitorSession.ts:2153-2200,2302-2308`,
  `app/src/monitor/monitorRun.ts:618-674`). The Aug-24 raw web capture delivered
  a 24.26 s / 75.6 m partial split after terminal and the PM5 retained it
  (`docs/monitor/sessions/walk-2026-08-24/README.md:102-131`); the Aug-27
  laptop/Chrome session's PM5 memory omitted a 59.8 m partial
  (`docs/monitor/sessions/walk-2026-08-27/README.md:6-18,122-130`). Summary
  totals may still feed heroes, while submitted measured step fields come only
  from accepted actuals (`app/src/session/logDraft.ts:834-867`,
  `app/src/log/storedSummary.ts:624-653`).
- Independent disproof: replay the exact Aug-24 terminal-then-partial sequence
  through the mounted hook and real monitor log door, then replay Aug-27's
  no-partial sequence. The expected presence or absence of measured fields
  comes from the independently recorded PM5 outcomes, not the driver's boundary
  policy or app summary.
- Scope: terminate event order, late-boundary admission, summary observations,
  monitor storage, submitted steps, and saved detail heroes/rows.
- Existing coverage gap: tests assert the selected no-terminate-grace policy;
  no mounted replay uses the real post-terminal partial capture, and the two
  physical sessions disagree.
- Verification required after a fix: both captured sequences, natural finish,
  app End, duplicate terminal/boundary orderings, PM5 memory comparison, and a
  saved log whose heroes and rows name the same measured work.
- Status: Task 10 found no authority that chooses between the two recorded PM5
  outcomes, and Task 12 excluded another replay as non-decisive. Deferred as a
  P2 Hypothesis; no fix is prescribed while the product rule is unresolved.

### AUD-019 — Web chunk loss can leave programming unbounded

- Category: brittleness
- Severity / confidence: P2 / Hypothesis
- User impact: a desktop/web rower could remain on Sending indefinitely, or see a
  programming rejection, if a queued chunk never produces the complete PM5
  response and no acknowledgement timeout is configured.
- Expected authority: independently observed web write delivery and bounded
  recovery for a decisive multi-chunk program. Native acknowledged writes do
  not establish browser delivery.
- Actual behavior: at baseline, web prefers
  `writeValueWithoutResponse`, while Capacitor uses an acknowledged write
  (`app/src/monitor/transports/webBluetooth.ts:341-359`,
  `app/src/monitor/transports/capacitorBle.ts:534-545`). The driver awaits a
  parsed OK CSAFE response for every complete frame, but its acknowledgement
  timeout is optional and absent by default
  (`app/src/monitor/driver.ts:5642-5657,5678-5802`). The installed plugin's
  native without-response semantics are not Web Bluetooth authority. Committed
  web sessions observed no symptom but explicitly lacked a decisive stress case
  (`docs/monitor/pm5-interface-notes.md:1371-1384,2497-2500`).
- Independent disproof: in a browser-level transport control, lose one queued
  chunk and observe bounded rejection/retry rather than an unresolved program
  call; then run a decisive multi-chunk web hardware stress case. The control
  must not borrow Capacitor semantics or treat encoder output as delivery.
- Scope: Web Bluetooth write mode, CSAFE chunk ordering, frame response,
  acknowledgement waiting, programming UI, failure classification, and retry.
- Existing coverage gap: encoder and driver tests prove local order and normal
  responses; no browser-level control loses a queued chunk while the default
  acknowledgement policy is active. Native physical evidence uses a different
  write mode.
- Verification required after a fix: a red calibrated lost-chunk control,
  bounded timeout/rejection and retry, a decisive web hardware stress case, and
  unchanged native programming. Full tail retention/execution remains AUD-010.
- Status: Task 9 confirmed the missing default acknowledgement bound but no
  supported lost-chunk trigger. Task 12 excluded web hardware because it would
  not change the final ranking. Deferred as a P2 Hypothesis.

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
