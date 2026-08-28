# Audit Candidate Register

Baseline: `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`

### AUD-002 — A malformed successful history response crashes the History surface

- Category: brittleness
- Severity / confidence: P2 / Probable
- User impact: if a successful history response is not an array, the History
  screen enters ready state and fails while rendering instead of showing a
  bounded load error with Retry.
- Expected authority: the intended rower outcome is a bounded History load
  failure rather than a render crash, but no independent baseline server path
  or version-compatibility contract produces the injected body. The audit
  control requires this probe while explicitly denying that the control
  document itself proves product correctness
  (`docs/superpowers/specs/2026-08-28-codebase-integrity-audit-design.md:54,66-71,174-186`).
- Actual behavior: at baseline `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`,
  `useLogHistory` casts the successful body to `RecentLog[]`, reads `.length`,
  and enters ready state (`app/src/log/useLogHistory.ts:58-68`). `HistoryList`
  then calls `.map` (`app/src/log/HistoryList.tsx:180-199`). A calibrated
  temporary mounted probe returned `[]` and rendered the normal empty History,
  then returned `{}` and reached the real render failure; the other 4,032
  client tests passed.
- Independent disproof: the probe supplied literal response text and observed
  only the rendered result behind a test-only error catcher. It did not import
  `RecentLog`, the client hook's state type, a server serializer, or a server
  fixture. Changing the top-level response from array to object is the named
  corruption that makes it fail.
- Scope: only the initial `useLogHistory` → `HistoryList` response and render
  path is evidenced. Pagination, `useRecentLogs`, and every other successful
  body reader remain hypotheses until their first real consumers are probed.
- Existing coverage gap: happy-path mocks mirror the local array interface;
  rejection and non-2xx cases test transport failure, not a successful body
  whose consumed type is wrong.
- Smallest safe fix: validate that the initial History body is an array before
  entering ready state and use the hook's existing error/retry state otherwise.
  Do not introduce a generated contract system or reject additive unknown
  fields as part of this candidate.
- Verification required after a fix: failing initial History cases first for
  empty body and object, plus valid empty/populated arrays; separately probe
  malformed elements, load-more, and every other reader before expanding the
  fix scope; retain mounted-server happy paths.
- Status: candidate; final adjudication is Task 10.

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

### AUD-011 — Storage denial blocks Ergomatic's default screen

- Category: brittleness
- Severity / confidence: P1 / Confirmed
- User impact: when browser policy denies durable storage, the default Today
  screen throws during mount. The rower cannot enter the app, resume active
  work, or navigate to a safe recovery surface.
- Expected authority: the approved audit requires persisted values to read
  safely or reject deliberately and specifically requires storage read-failure
  injection
  (`docs/superpowers/specs/2026-08-28-codebase-integrity-audit-design.md:174-186,216-223`).
  WHATWG defines the needed platform attribute: the `localStorage` getter can
  throw `SecurityError` when policy forbids persistence
  ([Web Storage §12.2.3](https://html.spec.whatwg.org/multipage/webstorage.html#dom-window-localstorage)).
- Actual behavior: at baseline `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`,
  `loadRun`, `loadDraft`, `loadMonitorRun`, and `loadTodayPick` call
  `localStorage.getItem` before their parsing guards
  (`app/src/session/run.ts:129-148`, `app/src/session/draft.ts:138-152`,
  `app/src/monitor/monitorRun.ts:494-520`,
  `app/src/today/todayPick.ts:41-75`). The default `/today` route mounts Today,
  whose synchronous initializers call `loadRun` and `loadMonitorRun`
  (`app/src/shell/AppRoutes.tsx:124-125`,
  `app/src/today/Today.tsx:273-288`). A calibrated temporary
  `app/src/audit-storage-getter.test.ts` made the standards-defined
  `window.localStorage` getter throw; all three injected production loaders
  failed with `SecurityError` while the other 4,032 client tests passed. A
  separate temporary case mounted the real Today component with ready,
  realistic hook data; Today rejected at `loadRun`, while the other 4,032
  client tests passed. Lane C completed the census: `clearRun`, `clearDraft`,
  and `clearMonitorRun` also call `removeItem` without guards
  (`app/src/session/run.ts:147-149`, `draft.ts:151-153`,
  `monitor/monitorRun.ts:519-521`). A temporary real Log Session probe returned
  201, made only the draft clear throw, observed a false save error with both
  records retained, then restored storage and observed a retry send a second
  POST while the other 4,032 client tests passed.
- Independent disproof: the probe supplied only the standards-defined platform
  failure and asserted a bounded return. It did not read the stored payload,
  product validator, phase, program, actuals, or recovery output. Moving the
  first access inside the existing guard is the named change that makes the
  three calibrated cases and mounted Today pass. `loadTodayPick` shares the
  same pre-guard access and remains a required fourth direct case rather than a
  second finding. The separate cleanup probe supplied an independently shaped
  201, made only `DRAFT_KEY` removal fail, and observed retained keys plus POST
  count without importing product serializers or session-state helpers. That
  selective `removeItem` throw is a branch discriminator for the absorbed
  cleanup consequence, not the exact getter failure defined by WHATWG.
- Scope: the four loaders, three clear helpers, default Today, every
  synchronous initializer/route guard calling them, cancel/abandon/discard,
  post-save cleanup, active phone/timer recovery, monitor-log recovery, and
  storage denial in browser/web fallback environments. Session-storage UX
  helpers and diagnostic production reads were cleared; the one unguarded
  hold-open stash is dev/E2E-only instrumentation.
- Existing coverage gap: write-failure and malformed-JSON tests begin after a
  usable `Storage` object exists. None denies the getter/read boundary, and
  successful-save tests assume cleanup cannot throw after the server commit.
- Smallest safe fix: put the initial read and any attempted cleanup inside a
  storage-access guard in all four loaders and all three clear helpers. Return
  `null` when reads are unavailable, make clears idempotent/best-effort, and do
  not turn a committed server save back into a retryable failure merely because
  local cleanup failed. Do not clear other session keys.
- Verification required after a fix: failing direct tests first for all four
  loaders, then the mounted default Today route and Timer/Countdown/Log Session
  under denied access, the existing malformed/versioned recovery matrix,
  cancel/abandon/discard under throwing removal, and a 201-after-cleanup-fault
  test proving one POST and a successful visible result.
- Status: candidate; Task 7 completed the direct-access census, reproduced the
  post-commit cleanup consequence, and passed fresh high-end Lane C review.

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
  deployment-change PR must make both health endpoints succeed and retain the
  then-current seed cardinality and migration-journal cardinality, derived
  independently from the checked-in seed and journal rather than hard-coded
  baseline counts. One deliberate unprotected control must prove the test can
  go red.
- Status: candidate; final adjudication must decide whether this is a docs-only
  correction or scheduled code work based on the deployment roadmap.

### AUD-013 — One out-of-range stored summary number breaks the whole History list

- Category: brittleness
- Severity / confidence: P2 / Confirmed
- User impact: one database-valid machine-summary number that the list
  projection cannot convert to `double precision` makes the entire request
  return 500, hiding otherwise healthy sessions until the row is repaired.
- Expected authority: the audit requires every persisted malformed record to
  read safely or reject deliberately and explicitly requires raw JSONB probes
  rather than inferring safety from normal route validation
  (`docs/superpowers/specs/2026-08-28-codebase-integrity-audit-design.md:174-195`).
  PostgreSQL JSON validity is not Ergomatic field validity.
- Actual behavior: at baseline `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`,
  the history-list projection checks only that
  `avgPaceSecondsPer500m` is a JSON number, then casts its text to PostgreSQL
  `double precision` (`app/server/stores/logs.ts:269-294`). In a temporary real
  PostgreSQL 18.4 integration case, two healthy owned logs listed with 200.
  Raw-updating one row to the database-valid JSON number `1e1000` made the
  mounted `GET /api/logs` return 500. The exact file passed 12/12 with the
  discriminator present; Testcontainers removed the database afterward.
- Independent disproof: the probe wrote raw SQL after the normal create path
  and observed only HTTP status. It did not call the route validator, fake
  store, server serializer, client type, or stored-summary renderer to build
  its expectation. Changing one nested number from ordinary range to `1e1000`
  is the named corruption that changes a healthy 200 to 500.
- Scope: this exact `session_logs.machine_summary.avgPaceSecondsPer500m`
  history-list projection, every healthy row owned by the same user, and raw
  repair/import/legacy paths. Other JSON numeric projections and raw JSONB
  columns remain unconfirmed until their own mounted probes run.
- Existing coverage gap: POST tests enter through a JS/route writer and use
  ordinary finite values. The JSON-type guard has tests for wrong JSON types,
  but no database-valid number outside the SQL target type's range.
- Smallest safe fix: make conversion failure yield `null` for the list scalar
  without rewriting or deleting the stored row. Do not claim the detail path
  preserves the original exponent until that path is separately proved.
- Verification required after a fix: failing real-Postgres case first with one
  healthy and one corrupt row; normal, null, wrong-type, boundary, and extreme
  numeric values; mounted list/detail responses; and a red calibration proving
  removal of the safe conversion returns the whole-list 500.
- Status: candidate; stored-shape triad review is required before Task 10.

### AUD-014 — Offline native sign-out leaves the bearer in Keychain

- Category: correctness
- Severity / confidence: P2 / Confirmed
- User impact: a rower who taps Sign out during a rejected/offline request does
  not complete sign-out in the current UI, and the bearer remains in Keychain.
  A cold launch while still offline appears signed out, but the retained bearer
  authenticates again on the next online `/api/me` refetch or relaunch.
- Expected authority: the approved native-auth design defines sign-out as
  server `POST` plus Keychain wipe
  (`docs/superpowers/specs/2026-07-28-phase-3-capacitor-shell-design.md:49-51`).
  The local wipe is a separate required outcome, not proof that server
  revocation succeeded.
- Actual behavior: at baseline `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`,
  `nativeSignOut` awaits `/api/auth/signout` before `clearToken`
  (`app/src/native/signin.ts:38-40`). A temporary probe made the request reject
  with an offline error; the function propagated that error and called
  `clearToken` zero times. `You` awaits that rejection before notifying the app
  of sign-out (`app/src/You.tsx:42-49`), while later API calls reload the same
  Keychain bearer (`app/src/api.ts:14-18`, `app/src/useMe.ts:21-33`).
- Independent disproof: the probe supplied only a failing transport and a
  Keychain-removal spy. It did not inspect the bearer, session table, auth
  middleware, API response shape, or UI state. Running local deletion despite
  the rejected request is the named change that makes the probe pass.
- Scope: rejected native sign-out transport, Keychain persistence, You-screen
  completion state, and later online authentication. HTTP 5xx responses resolve
  from `api()` and already reach `clearToken`; web cookie logout and successful
  server revocation are not implicated.
- Existing coverage gap: adapter tests cover only a successful mocked native
  function; native wrappers are excluded from coverage, and no test rejects the
  server call while observing Keychain deletion.
- Smallest safe fix: treat server revocation as best-effort during native
  sign-out, always attempt Keychain deletion, and report local sign-out success
  once deletion succeeds. Do not clear the token before the server request,
  because the request needs that bearer.
- Verification required after a fix: a failing rejected-transport test first;
  successful and HTTP-5xx server responses; Keychain-delete failure remains
  visible; mounted You-screen completion; offline then online `useMe` behavior;
  and a device check only if Task 12 finds it can change priority.
- Status: candidate; Task 7 confirmed the surrounding `useMe`/You ownership and
  found no reason to change the P2 rank; final adjudication is Task 10.

### AUD-015 — A failed run-state write silently cancels workout start

- Category: correctness
- Severity / confidence: P1 / Confirmed
- User impact: after the draft is safely stored, a quota or storage write
  failure during Countdown appears to start the workout but immediately sends
  the rower back to Today. There is no error, retry, or usable Timer session.
- Expected authority: the locked product invariant says, “Active session
  (timer state, in-progress log) persists in localStorage; reload or dropped
  connection never loses a workout” (`ROADMAP.md:50`). WHATWG defines the
  platform attribute the argument needs: `setItem` throws `QuotaExceededError`
  when a value cannot be stored, including quota exhaustion or disabled storage
  ([Web Storage §12.2.1](https://html.spec.whatwg.org/multipage/webstorage.html#the-storage-interface)).
- Actual behavior: at baseline `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`,
  Countdown builds a run, ignores `saveRun`'s boolean, commits its local clock,
  and navigates to Timer (`app/src/session/Countdown.tsx:219-227,338-343`).
  Timer reloads storage and redirects to Today when the run is absent
  (`app/src/session/Timer.tsx:354-361,456-458`). A calibrated temporary test
  saved a real library draft, made only `RUN_KEY` writes throw, mounted the real
  zero-countdown → Timer route, and observed Today with no run; the other 4,032
  client tests passed.
- Independent disproof: the probe injected only the platform write failure and
  observed route plus stored-key state. It did not mock `saveRun`, build an
  expected run, inspect Countdown's local state, or call Timer's redirect logic
  as an oracle. Throwing only for `RUN_KEY` is the named corruption that turns a
  normal usable Timer hand-off into the Today bounce.
- Scope: Countdown with zero or nonzero delay, `saveRun` callers, Timer reload,
  quota/private-mode/storage exhaustion after a draft fits but the larger run
  does not, and repeated Start attempts.
- Existing coverage gap: `run.test.ts` proves `saveRun` returns false, while
  Countdown tests assume it returns true. No existing test composes the caller's
  ignored result with Timer's fresh storage read.
- Smallest safe fix: Countdown must branch on `saveRun` failure, remain on a
  recoverable screen, and show an actionable storage error/retry instead of
  entering a Timer route that cannot reload. Do not treat its in-memory run as
  durable unless Timer receives an explicit, reload-safe ownership contract.
- Verification required after a fix: failing real Countdown → Timer case first
  for zero and nonzero countdown; retry after storage becomes writable; reload
  during error; existing StrictMode one-write pin; and a deliberate mutation
  that ignores the boolean and restores the Today bounce.
- Status: candidate; P1 requires fresh high-end Lane C validation.

### AUD-016 — Connected storage loss leaves a finished workout outside the log door

- Category: brittleness
- Severity / confidence: P1 / Probable
- User impact: a connected workout can keep collecting measured intervals and
  finish normally in memory, then arrive at the Log screen with no monitor
  record. The rower receives the manual form instead of the measured session;
  reload and the existing recovery row have nothing to recover.
- Expected authority: the locked offline decision says an active session
  persists in localStorage and reload or a dropped connection never loses a
  workout (`ROADMAP.md:47-52`). The approved series-capture design also says a
  storage failure “must never cost the run,” but later acknowledges that the
  smaller retry can fail and is not a guarantee
  (`docs/superpowers/specs/2026-08-19-series-capture-design.md:62-71`). That
  conflict leaves the desired response to a genuinely unavailable origin
  incomplete, which is why confidence is Probable rather than Confirmed.
- Actual behavior: at baseline
  `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`, `saveMonitorRun` swallows a
  failed write and returns no durability result; its comment says downstream
  readers see the caller's in-memory copy
  (`app/src/monitor/monitorRun.ts:449-490`). The connected Log route instead
  calls `loadMonitorRun()` and rejects a missing record
  (`app/src/session/LogSession.tsx:323-345`). A calibrated temporary client
  probe built the real “Filling Low” workout, denied only
  `MONITOR_RUN_KEY`, recorded a 2,000 m interval, and finished. The returned
  record retained the interval and completion stamp, while both
  `loadMonitorRun()` and the real `monitorModeRun(?from=monitor)` returned
  `null`; the full client suite passed 150 files / 4,033 tests.
- Independent disproof: the probe derived its workout through the real
  compiler but supplied the storage failure and measured interval literally;
  it observed the persisted read and log gate, not the caller's in-memory
  object, as the downstream consequence. With the storage fault disabled, the
  same probe failed at the expected-null assertion and printed the complete
  stored record. An earlier fixture accidentally omitted `workoutId`; its
  fault-off control stayed green, so that false confirmation was rejected and
  corrected before this evidence was accepted.
- Scope: every monitor-record writer, the hook's durability knowledge,
  connected end navigation, Today recovery, monitor-mode Log initialization,
  quota/private-mode/disabled-storage behavior, and trace-sacrifice retry.
- Existing coverage gap: monitor-run tests prove swallowed writes and Log
  tests prove the stored-record gate separately. No persistent test joins a
  failed open/boundary/close write to the actual cross-route hand-off.
- Smallest safe fix: make monitor persistence report durability and make the
  connected workflow own that result through completion. The log hand-off must
  either receive the completed in-memory record through an explicit safe
  contract or hold a recoverable storage-error state before navigation. Do not
  silently substitute the manual form or add a second durable store without a
  product decision.
- Verification required after a fix: failing cases first for storage denial at
  open, boundary, series retry, and close; real connected finish → Log and
  Today recovery; reload/exit behavior stated explicitly; successful storage
  control; and a deliberate mutation restoring the void/swallow hand-off.
- Status: candidate promoted by Task 9; fresh P1 validation remains required.

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
