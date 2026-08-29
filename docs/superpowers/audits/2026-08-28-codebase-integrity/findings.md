# Preliminary Validation Slate

Baseline: `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`

These nine findings passed controller adjudication but are not independently
validated. Task 11 may confirm, downgrade, clear, or defer each one. Validators
receive only the blind briefs below, not the candidate conclusions or proposed
fixes.

| ID      | Preliminary rank | Why this rank, not the adjacent one                                                | Validation pass         |
| ------- | ---------------- | ---------------------------------------------------------------------------------- | ----------------------- |
| AUD-011 | P1 / Confirmed   | Default entry can fail under a standards-defined storage denial; no data loss.     | V1 storage lifecycle    |
| AUD-015 | P1 / Confirmed   | A started workout is silently cancelled; the draft remains recoverable.            | V1 storage lifecycle    |
| AUD-016 | P1 / Probable    | Measured work can miss the log hand-off; final mounted consequence is inferred.    | V1 storage lifecycle    |
| AUD-020 | P1 / Probable    | A committed save can invite a duplicate retry; real-store duplication is unproved. | V1 storage lifecycle    |
| AUD-002 | P2 / Probable    | One screen crashes on an injected producer breach; no real producer is known.      | V3 auth/client response |
| AUD-006 | P2 / Confirmed   | Previews misstate accepted rest, while the timer still retains it.                 | V4 workout projection   |
| AUD-012 | P2 / Confirmed   | Concurrent empty-database boot fails, but the supported deploy is single-replica.  | V2 PostgreSQL/startup   |
| AUD-013 | P2 / Confirmed   | One corrupt summary hides History; it neither changes nor deletes stored data.     | V2 PostgreSQL/startup   |
| AUD-014 | P2 / Confirmed   | Offline native sign-out retains a bearer, but the UI does not claim success.       | V3 auth/client response |

No item meets P0. The audit found no validated security escape, destructive
data path, unsafe operator command, or silently wrong durable number requiring
an immediate stop. P1 is reserved here for blocked or lost active work and a
credible durable-duplicate path without safe recovery.

## Adjudication rulings

- AUD-002 and AUD-013 stay separate: their triggers, authorities, and safe
  boundaries are client response validation versus SQL conversion.
- AUD-011, AUD-015, and AUD-016 stay separate: getter denial, an ignored
  `saveRun` result, and monitor hand-off durability can each pass independently.
- AUD-020 is split from AUD-011: it begins after a successful server commit and
  requires cleanup/retry separation, not a storage-read guard.
- AUD-017 remains a hypothesis separate from AUD-020: a lost response requires
  operation identity or idempotency; AUD-020 has an observed 201 response.
- No over-engineering finding is promoted. File size and complexity alone do
  not establish duplicated authority, unreachable state, a contradictory
  interface, or measurable change cost; Task 9 found no runtime import cycle.
- AUD-003 remains P3 process debt and AUD-005 remains cleared, so neither
  consumes another validation pass.

## Blind validation briefs

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
