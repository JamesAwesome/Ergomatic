# Audit Candidate Register

Baseline: `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`

### AUD-006 — Workout previews hide accepted rest that the timer retains

- Category: correctness
- Severity / confidence: P2 / Confirmed
- User impact: Today and Library can show a shorter rest prescription than the
  workout the timer will run, while Today's TOTAL still includes the hidden
  time.
- Expected authority: the approved step-detail design says Today prints the
  pieces, Library states the structure, rest phases attach to the preceding
  piece, hiding a carried rest misstates the session, and “WORK plus displayed
  rests equals TOTAL on every workout”
  (`docs/superpowers/specs/2026-08-10-workout-step-detail-design.md:15-20,54-58,84-89,151-162`).
- Actual behavior: at baseline `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`,
  `validateSteps` and bulk import accept standalone rest. `pieceList` and
  `structureLine` drop a leading rest and keep only the first of consecutive
  rests (`app/domain/display/stepDetail.ts:48-72,233-272`), while
  `workAndTotal` sums all phases (`:200-215`). Both `r 2; w 1 with r 1` and
  `w 1 with r 1; r 2` show only `1′ r` on Today and Library but report
  `4′ TOTAL` on Today. A custom workout carrying either shape remains eligible
  for Today's recommendation and Library display.
- Independent disproof: the probe independently summed seconds from raw,
  validation-accepted authored steps and compared that number with both preview
  projections and Today's TOTAL. It did not read `phases`, `pieceList`,
  `structureLine`, `workAndTotal`, or compiler output to derive the expectation.
  Dropping either raw rest from a projection is the named corruption that makes
  it fail.
- Scope: bulk and JSON workout writers, persisted custom workouts, suggestion
  selection, Today's `PieceRegion`, Library's `structureLine`, detail/timer
  consumers, and PM5 Connect's separate handling of leading versus consecutive
  rest.
- Existing coverage gap: all 302 seeded rows compile, but none contains a
  leading rest or adjacent rest phases. Existing `pieceList` tests assert the
  deliberate drop in isolation rather than the approved visible-rest/TOTAL
  invariant across realistic custom Today and Library paths.
- Smallest safe fix: aggregate consecutive rest onto its existing preceding
  piece in both projections without changing timer/compiler elapsed time. For
  leading rest, Gate 0 must first decide whether the shape remains valid; then
  either reject/normalize it coherently at every authoring, import, and stored-
  data boundary or approve a visible representation on both scanning surfaces.
  Do not invent a pre-work row or patch Today alone before that decision.
- Verification required after a fix: failing domain cases first for leading
  and consecutive rest; realistic custom workouts through the real Today and
  Library paths; raw authored rest sum against both projections and Today
  TOTAL; detail, timer, stored compatibility, and compiler contract checks;
  both-orientation rendered approval, contrast calculations, `pnpm e2e`, and
  `pnpm screenshots`.
- Status: candidate; final adjudication is Task 10.

### AUD-011 — Storage denial can crash active-session recovery

- Category: brittleness
- Severity / confidence: P2 / Probable
- User impact: when browser policy denies durable storage, opening Timer,
  Countdown, or Log Session can throw while checking for a saved phone or
  monitor session instead of loading a bounded empty/recovery state.
- Expected authority: the approved audit requires persisted values to read
  safely or reject deliberately and specifically requires storage read-failure
  injection
  (`docs/superpowers/specs/2026-08-28-codebase-integrity-audit-design.md:174-186,216-223`).
  WHATWG defines the needed platform attribute: the `localStorage` getter can
  throw `SecurityError` when policy forbids persistence
  ([Web Storage §12.2.3](https://html.spec.whatwg.org/multipage/webstorage.html#dom-window-localstorage)).
- Actual behavior: at baseline `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`,
  `loadRun`, `loadDraft`, and `loadMonitorRun` call
  `localStorage.getItem` before their parsing guards
  (`app/src/session/run.ts:129-148`, `app/src/session/draft.ts:138-152`,
  `app/src/monitor/monitorRun.ts:494-520`). A temporary policy-denial probe made
  each loader throw `SecurityError`; the other 4,032 client tests passed.
- Independent disproof: the probe supplied only the standards-defined platform
  failure and asserted a bounded return. It did not read the stored payload,
  product validator, phase, program, actuals, or recovery output. Moving the
  first access inside the existing guard is the named corruption that makes
  all three cases pass.
- Scope: the three loaders, every synchronous React initializer or route guard
  calling them, active phone/timer recovery, monitor-log recovery, and storage
  denial in browser/web fallback environments.
- Existing coverage gap: write-failure and malformed-JSON tests begin after a
  usable `Storage` object exists. None denies the getter/read boundary itself.
- Smallest safe fix: put the initial read and any attempted cleanup inside a
  storage-access guard in all three loaders and return `null` when storage is
  unavailable; do not clear other session keys.
- Verification required after a fix: failing direct tests first for all three
  loaders, then mounted Timer/Countdown/Log Session cases under denied access,
  plus the existing malformed/versioned recovery matrix.
- Status: candidate; mounted user-outcome confirmation is assigned to Task 7
  before final adjudication.

### AUD-012 — The booting-replica safety claim fails before the seed lock

- Category: hallucinated claim
- Severity / confidence: P2 / Confirmed
- User impact: if two server instances ever start together on an empty
  database, one can crash before serving health, turning a scaled or overlapping
  rollout into a partial outage. Today's declared compose deploy is
  single-replica, so the trigger is outside the current supported rollout.
- Expected authority: the live library-convergence design says the advisory
  lock “serializes booting replicas” and the loser observes converged state
  (`docs/superpowers/specs/2026-08-04-library-converge-design.md:38-39`). The
  older deployment contract separately says concurrent migrators are impossible
  only because compose is single-replica and serial
  (`docs/superpowers/specs/2026-07-27-phase-2-auth-design.md:25-32`).
- Actual behavior: at the baseline, `server/index.ts` awaits Drizzle migration
  before it enters the advisory-locked seed path
  (`app/server/index.ts:27-49`). Two built server processes started
  simultaneously against one empty PostgreSQL 18.4 database; one became
  healthy, while the other exited on `CREATE SCHEMA IF NOT EXISTS "drizzle"`
  with PostgreSQL `23505`, duplicate `pg_namespace_nspname_index`.
- Independent disproof: the probe used two real processes and a fresh external
  database, reading only process exit, health, and direct row counts. It did not
  call the seed fake, migration test helpers, or use Drizzle output as the
  expectation. The winner independently had 302 globals and 17 migration rows;
  serializing the migration stage is the named change that would let both
  processes reach health.
- Scope: empty-database boot, migration schema/table creation, every future
  multi-replica or overlapping rollout, startup health, and the accuracy of the
  replica-safety design claim. Existing seeded databases were not shown to fail.
- Existing coverage gap: the seed concurrency integration test begins after
  migrations and therefore proves only the later advisory lock. No existing
  gate launches two complete server entrypoints on one empty database.
- Smallest safe fix: keep single-replica startup as the supported contract and
  correct the broader replica-safe claim now; require a migration-level lock or
  one-shot deploy migration before enabling overlapping replicas.
- Verification required after a fix: a two-process empty-Postgres test in the
  deployment-change PR must make both health endpoints succeed and retain
  exactly 302 globals and 17 migration rows, with one deliberate unprotected
  control proving the test can go red.
- Status: candidate; final adjudication must decide whether this is a docs-only
  correction or scheduled code work based on the deployment roadmap.

### AUD-014 — Offline native sign-out leaves the bearer in Keychain

- Category: correctness
- Severity / confidence: P2 / Confirmed
- User impact: a rower who taps Sign out while offline remains locally
  authenticated; reopening the app on a shared phone can reuse the stored
  bearer instead of requiring sign-in.
- Expected authority: the approved native-auth design defines sign-out as
  server `POST` plus Keychain wipe
  (`docs/superpowers/specs/2026-07-28-phase-3-capacitor-shell-design.md:49-51`).
  The local wipe is a separate required outcome, not proof that server
  revocation succeeded.
- Actual behavior: at baseline `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`,
  `nativeSignOut` awaits `/api/auth/signout` before `clearToken`
  (`app/src/native/signin.ts:38-40`). A temporary probe made the request reject
  with an offline error; the function propagated that error and called
  `clearToken` zero times.
- Independent disproof: the probe supplied only a failing transport and a
  Keychain-removal spy. It did not inspect the bearer, session table, auth
  middleware, API response shape, or UI state. Running local deletion despite
  the rejected request is the named change that makes the probe pass.
- Scope: native sign-out, Keychain persistence, You-screen completion state,
  offline/revocation error handling, and the next app launch. Web cookie logout
  and successful server revocation are not implicated.
- Existing coverage gap: adapter tests cover only a successful mocked native
  function; native wrappers are excluded from coverage, and no test rejects the
  server call while observing Keychain deletion.
- Smallest safe fix: treat server revocation as best-effort during native
  sign-out, always attempt Keychain deletion, and report local sign-out success
  once deletion succeeds. Do not clear the token before the server request,
  because the request needs that bearer.
- Verification required after a fix: failing offline and server-error tests
  first; successful server-revocation coverage; Keychain-delete failure remains
  visible; mounted You-screen completion; a device check only if Task 12 finds
  it can change priority.
- Status: candidate; surrounding UI recovery is assigned to Task 7 before final
  adjudication.

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
