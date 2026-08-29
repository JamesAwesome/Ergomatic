# Validated Audit Findings

Baseline: `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`

Current-main revalidation: `fd4d06a57581e1e814ecd06f74274a30bffce6ee`

The phase-close gates accept six actionable P1/P2 findings: five Confirmed and
one Probable. Three additional reproduced conditions are P3/deferred because
the audit did not establish a supported producer or current deployment trigger.
No validator authored its candidate, and the controller re-opened every
phase-close challenge against production writers and primary standards.

All six actionable paths remain present on current `main`. Between the baseline
and `fd4d06a`, the only `app/` changes are a monitor type test,
design/screenshot tests, and `BaselineEditor`; none intersects their production
scope. Later-main code was not blended into the baseline reproductions. Product
ordering is separate: current main added a newer Wave F P1, so Wave F's
phase-open gate—not this audit—sequences its existing work against these owners.

| Rank | ID      | Severity / evidence | Current main  | Why it outranks the next item                                                                   |
| ---- | ------- | ------------------- | ------------- | ----------------------------------------------------------------------------------------------- |
| 1    | AUD-016 | P1 / Confirmed      | Still present | It can discard measurements after the rower has completed real connected work.                  |
| 2    | AUD-011 | P1 / Confirmed      | Still present | It blocks the default screen under a standards-defined denial, but destroys no data.            |
| 3    | AUD-015 | P1 / Confirmed      | Still present | It silently cancels Start, but the rower has not yet completed the workout and the draft stays. |
| 4    | AUD-006 | P2 / Confirmed      | Still present | It gives a wrong rest prescription on two scan surfaces; execution still retains the rest.      |
| 5    | AUD-014 | P2 / Confirmed      | Still present | Native local logout is incomplete, but the UI does not claim success and auth is not bypassed.  |
| 6    | AUD-002 | P2 / Probable       | Still present | The render crash is certain for `{}`, but no real producer or compatibility trigger was found.  |

| ID      | Phase-close disposition       | Why it is not in the P1/P2 fix list                                                                                                                                |
| ------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AUD-012 | P3 / Confirmed stale claim    | The concurrency failure is real, but the supported deployment is explicitly serial and single-replica; correct the claim with the next deployment-doc PR.          |
| AUD-013 | P3 / unsupported-trigger debt | Raw SQL can create the failure, but the PM5, route, and Drizzle writers do not preserve the extreme value and no repair/import/legacy producer was established.    |
| AUD-020 | P3 / unsupported-trigger debt | The duplicate consequence is real if cleanup throws, but the validator fabricated `removeItem` failure and the normative Storage algorithm has no throwing branch. |

No item meets P0. The audit found no validated security escape, destructive
data path, unsafe operator command, or silently wrong durable number requiring
an immediate stop. The disputed raw-database, post-commit cleanup, and
unsupported-topology results are retained explicitly rather than promoted past
their triggers.

## Adjudication rulings

- AUD-002 stays actionable without AUD-013: its client response boundary has a
  deterministic consequence, while the raw-database producer is unsupported.
- AUD-011, AUD-015, and AUD-016 stay separate: getter denial, an ignored
  `saveRun` result, and monitor hand-off durability can each pass independently.
- AUD-020 remains separate from AUD-011 but leaves the fix list: Web Storage
  getter/write failures do not establish a throwable `removeItem` after 201.
- AUD-017 remains a hypothesis separate from AUD-020: a lost response requires
  operation identity or idempotency; AUD-020 has an observed 201 response.
- Over-engineering is partially covered. The audit tested runtime import cycles
  and mapped state/writer/authority seams plus platform/test reachability. It
  did not perform a repository-wide review of unnecessary extra state,
  one-consumer abstractions, unused interfaces, production dead branches,
  duplicated mechanisms, or measurable change amplification. No finding is
  promoted; those subcategories are deferred, not cleared.
- AUD-003 remains P3 process debt and AUD-005 remains cleared, so neither
  consumes another validation pass.

## Independent validation verdicts

### AUD-011 — CONFIRMED, P1

The fresh validator denied the actual `window.localStorage` property getter,
not a usable Storage double. All four loaders threw `SecurityError`, and real
Today rejected during its `loadRun` initializer; empty and malformed-value
controls remained bounded. This independently reproduces the controller's
Task 6 getter and mounted-Today probes.

### AUD-015 — CONFIRMED, P1

With only the active-run key rejecting writes, real Countdown ignored
`saveRun`'s false result and real Timer redirected to Today without an error or
Retry. Restoring writes reached Timer with persisted state. This independently
reproduces the controller's Task 7 composed route probe.

### AUD-016 — CONFIRMED, P1

A real compiled connected workout retained a literal `2:20.0` measured actual
in memory through five rejected monitor writes. Real finish-to-Log rendered
`NO MONITOR READING`; persisting the same closed run restored `2:20.0`. This
settles the screen consequence that remained inferred after Task 9.

### AUD-020 — DOWNGRADED to P3 / unsupported-trigger debt

Both Log doors converted a real 201 followed by selective cleanup failure into
a retryable save error and sent a second POST. A separate real-PostgreSQL probe
observed distinct created IDs, two rows for the no-plan case, and `doneN:2` for
the advancing-plan case. Phase close re-opened the trigger: every validator
fabricated a selectively throwing `removeItem`, while the normative Web Storage
algorithm defines no throwing branch for that method and a previously obtained
local-storage holder is returned without a new policy decision. The consequence
is reproduced; a supported throwable post-201 operation is not.

### AUD-013 — DOWNGRADED to P3 / unsupported-trigger debt

A real authenticated History request listed nine boundary/control rows, then
returned 500 after raw SQL added valid JSONB number `1e1000`; deleting only that
row restored 200. Three direct overflow/underflow casts failed while finite
boundaries passed. Phase close traced every supported writer: the PM5 source is
bounded `u16 / 10`, the route parses the extreme to non-finite JavaScript, and
the Drizzle JSONB encoder serializes it to `null`. No repair, import, legacy, or
operational writer preserving `1e1000` was found. The raw-SQL hardening gap is
real, but the audit control document is not product authority for a P1.

### AUD-002 — DOWNGRADED to P2 / Probable

Literal `200 {}` reached ready state and crashed at `.map`; empty content used
the existing error/Retry path, and empty/populated arrays rendered normally.
The behavior is reproduced, but neither controller nor validator found a real
producer or compatibility path for the malformed success body, so Confirmed is
not supportable under the audit's evidence-grade definition.

### AUD-006 — CONFIRMED, P2

Both accepted authored shapes independently total one minute work plus three
minutes rest. Today and Library displayed only one rest minute, while detail
retained both rests and Timer ran 240 seconds. The compiler coherently rejected
leading rest and compiled consecutive rest as 180 seconds. The user harm is a
wrong scan-surface prescription, not wrong execution.

### AUD-012 — CONFIRMED, downgraded to P3

Across three fresh PostgreSQL 18.4 trials, two simultaneous production-built
servers produced exactly one healthy process and one migration `23505`; a
serial control made both healthy. Direct counts matched 17 checked-in journal
entries and 302 independently derived global seed rows. The live claim is false,
but the supported deployment explicitly forbids concurrent migrators through a
single-replica serial rollout. Under the audit's own severity table, this is a
stale claim with no demonstrated current user harm: P3 documentation debt.

### AUD-014 — CONFIRMED, retained at P2

Rejected native transport left the bearer in modeled Keychain, did not complete
the mounted You action, appeared signed out while offline, and reused the same
bearer when online. Success, HTTP 500, and Keychain-delete failure controls
isolated the ordering. The validator recommended P1, but the fixed definition
does not: the UI never reports successful sign-out, server authorization is not
bypassed, and the demonstrated harm is an auth-contract gap rather than a
blocked rower, lost active work, or wrong prescription.

## Controller acceptance check

The controller's calibrated Task 6–9 probes predate and are independent of the
validators. Phase close then tested the probes' premises, not just their output:
getter denial, failed run writes, rejected monitor persistence, malformed
History success, native sign-out, and raw-authored rest retained supported
triggers; selective `removeItem`, raw-SQL `1e1000`, and concurrent deployment did
not retain P1/P2 authority. Every temporary probe, process, container, and volume
was removed, and the product diff stayed empty.

## Validation record: blind briefs issued

### V1-A — Storage read boundary (AUD-011)

- Baseline: `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`.
- Behavior to test: the initial Today route and each of the four persisted-state
  loaders when the `window.localStorage` getter itself throws `SecurityError`.
- Authority: WHATWG Web Storage permits the getter to throw for a policy
  decision; the audit contract requires persisted reads to fail safely or
  reject deliberately.
- Trigger: deny the getter before any `Storage` object exists.
- Required disproof: mount the real initial route and directly invoke all four
  loaders; demonstrate a bounded, usable result under denial and normal results
  for valid and malformed stored values. A mock that supplies a usable Storage
  object does not test the trigger.

### V1-B — Countdown durability hand-off (AUD-015)

- Baseline: `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`.
- Behavior to test: a realistic stored draft starts through Countdown while
  only the active-run key rejects writes.
- Authority: `ROADMAP.md:50` requires active timer state to survive reload or a
  dropped connection; Web Storage permits `setItem` to reject storage.
- Trigger: allow the draft write, then reject only the larger run write.
- Required disproof: compose real Countdown and Timer ownership and show either
  a usable Timer session or a visible recoverable error without a silent Today
  bounce; restore writes and prove Retry succeeds. Do not mock `saveRun` itself.

### V1-C — Connected completion hand-off (AUD-016)

- Baseline: `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`.
- Behavior to test: a real compiled connected workout records literal measured
  work and completes while only monitor-run writes fail.
- Authority: `ROADMAP.md:50` requires active-session persistence; the approved
  series-capture design says a storage failure must not cost the run but also
  admits its reduced retry is not guaranteed.
- Trigger: reject monitor-run writes at open, boundary, retry, or close while
  preserving the in-memory record.
- Required disproof: mount the real connected finish-to-Log path and show that
  measured work remains available to the correct log door or an explicit
  recoverable state. Also prove successful-storage and reload controls. A
  direct call to the storage gate alone cannot settle the screen consequence.

### V1-D — Post-commit cleanup boundary (AUD-020)

- Baseline: `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`.
- Behavior to test: the real server and PostgreSQL return 201, then only local
  draft/run or monitor-run removal throws before the user continues.
- Authority: RFC 9110 section 15.3.2 defines 201 as a fulfilled request that
  created resource(s); cleanup is downstream of that result.
- Trigger: selectively fail local cleanup after the committed response, then
  take the UI's offered recovery action.
- Required disproof: inspect real log-row and plan-state cardinality and show
  that the UI cannot submit the committed operation twice. Cover session and
  monitor doors, plan and no-plan saves, and a cleanup-success control.

### V2-A — Complete-server concurrent boot (AUD-012)

- Baseline: `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`.
- Behavior to test: launch two production-built server entrypoints together
  against one empty PostgreSQL 18.4 database.
- Authority: the live convergence design claims its advisory lock serializes
  booting replicas; the deployment design says the current compose rollout is
  single-replica and serial.
- Trigger: overlap the migration and seed stages from an empty database.
- Required disproof: both independent health endpoints must become ready and
  direct database counts must match values derived from the checked-in seed and
  migration journal. An unprotected control must demonstrate the harness can
  detect a failed process.

### V2-B — Extreme stored summary number (AUD-013)

- Baseline: `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`.
- Behavior to test: list one healthy owned log beside a log whose raw JSONB
  `avgPaceSecondsPer500m` is the valid JSON number `1e1000`.
- Authority: the audit contract requires malformed persisted values to read
  safely or reject deliberately; PostgreSQL JSON validity is not field validity.
- Trigger: bypass the normal writer with raw SQL, then call the mounted History
  endpoint using the real store.
- Required disproof: the healthy row must remain available and the corrupt
  scalar must be bounded without deleting or rewriting the row. Removing the
  bounded conversion must make the calibrated control fail.

### V3-A — Malformed successful History body (AUD-002)

- Baseline: `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`.
- Behavior to test: the initial mounted History request receives literal HTTP
  200 bodies of `{}`, empty content, `[]`, and a realistic populated array.
- Authority: the intended bounded result is the existing History error/Retry
  surface; no real server or compatibility path is asserted to produce `{}`.
- Trigger: violate only the top-level successful response shape.
- Required disproof: demonstrate that malformed success cannot escape into a
  render failure while valid arrays retain normal behavior. Expectations must
  not come from the client type, server serializer, or shared fixture.

### V3-B — Offline native sign-out (AUD-014)

- Baseline: `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`.
- Behavior to test: native sign-out when the transport rejects before an HTTP
  response, followed by an offline and then online authentication read.
- Authority: the approved native-auth design defines sign-out as server POST
  plus Keychain wipe; those are independently required outcomes.
- Trigger: reject the server transport while observing Keychain deletion and
  mounted You-screen completion.
- Required disproof: establish the bearer lifecycle for rejected transport,
  successful response, HTTP server error, and Keychain-delete failure. Do not
  infer deletion from UI state or mock the native wrapper being evaluated.

### V4 — Accepted rest across workout projections (AUD-006)

- Baseline: `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`.
- Behavior to test: realistic custom workouts containing leading rest and
  consecutive rest through validation, Today, Library, detail, timer, and PM5
  compilation consumers.
- Authority: the approved step-detail design requires displayed work plus
  displayed rests to equal Today TOTAL and requires both scan surfaces to state
  the workout structure.
- Trigger: use `r 2; w 1 with r 1` and `w 1 with r 1; r 2`, deriving rest and
  total independently from the raw authored steps.
- Required disproof: every accepted rest must have an approved visible meaning
  or the shape must be rejected coherently at every writer and compatibility
  boundary; the timer/compiler elapsed result must remain consistent. Local
  projection helpers cannot serve as their own oracle.

## Approved-spend gate

Task 11 is limited to four fresh `gpt-5.6-sol` high passes:

| Pass | Candidates             | Mandatory work | Optional work and why it rides the pass                                               |
| ---- | ---------------------- | -------------- | ------------------------------------------------------------------------------------- |
| V1   | AUD-011, 015, 016, 020 | All four       | None; all are P1 and share one lifecycle harness.                                     |
| V2   | AUD-012, 013           | AUD-013        | AUD-012 reuses the same real-Postgres environment and can alter code-vs-doc priority. |
| V3   | AUD-002, 014           | AUD-014        | AUD-002 reuses the client boundary harness and can change P2 ordering.                |
| V4   | AUD-006                | AUD-006        | None; the finding changes a displayed prescription/number.                            |

The ceiling is four full validation turns plus at most one short correction
and recheck per pass. At most three run concurrently. No xhigh validator,
hardware walk, P3 probe, or open-ended exploration is authorized by this batch.
The app exposes no exact credit-price estimate, so the auditable estimate is
the dispatch count and model/effort ceiling above.

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
- Smallest safe fix: a bounded direction, not an untested rewrite.
- Verification required after a fix: test/capture/build/hardware proof.
- Status: candidate | validated | cleared | deferred.
