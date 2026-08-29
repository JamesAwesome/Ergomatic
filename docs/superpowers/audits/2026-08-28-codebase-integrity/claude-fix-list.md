# Prioritized Fix List for Claude Code

Baseline reproduction: `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`

Current-main check: `fd4d06a57581e1e814ecd06f74274a30bffce6ee`

Status: READY_FOR_PHASE_CLOSE

All nine items are still present on current `main`. Execute them as seven
coherent chunks in the order below. Each chunk gets a worktree, failing tests
first, scoped mutation proof, the gates named here, and a PR; never merge
without James's explicit approval. Read `.claude/agent-briefing.md` and
`docs/TESTING.md` before implementation.

## Fix order

| Order | Chunk                                           | Findings         | Live ROADMAP owner                      | Why here                                                                         |
| ----- | ----------------------------------------------- | ---------------- | --------------------------------------- | -------------------------------------------------------------------------------- |
| 1     | Preserve measured connected work                | AUD-016          | Wave F — storage-failure recovery       | Irreplaceable rowed measurements can currently miss the Log door.                |
| 2     | Keep a committed save committed                 | AUD-020          | Wave F — committed saves stay committed | Retry can create durable duplicate logs and advance a plan twice.                |
| 3     | Make local-storage failure recoverable          | AUD-011, AUD-015 | Wave F — storage-failure recovery       | The default screen and Start path both fail at the same platform boundary.       |
| 4     | Bound the History contract                      | AUD-013, AUD-002 | History boundary hardening              | One corrupt scalar hides healthy rows; malformed success can crash the client.   |
| 5     | Make workout previews state every accepted rest | AUD-006          | Workout scan-surface truth              | Two rower-facing surfaces give a wrong prescription and require design approval. |
| 6     | Complete native sign-out while offline          | AUD-014          | Wave A — native sign-out                | Auth triad work lands alone.                                                     |
| 7     | Correct the replica-safety contract             | AUD-012          | Deployment contract                     | Current deployment is unaffected; correct the claim now and gate future scaling. |

## 1. Preserve measured connected work through the Log hand-off — AUD-016

**Outcome and impact.** A connected workout that has measured intervals must
reach the connected Log door even when localStorage rejects monitor-run writes.
Today the rower can finish real work and receive `NO MONITOR READING` because
the next route reloads a record that never became durable.

**Evidence and trigger.** At the fixed baseline, `saveMonitorRun` swallows a
failed write and returns no durability result
(`app/src/monitor/monitorRun.ts:449-490`). The Log route fresh-loads storage
(`app/src/session/LogSession.tsx:323-345`). A fresh validator compiled a real
workout, retained a literal 2:20.0 measured actual in memory through five
rejected monitor writes, and mounted finish→Log: the screen showed
`NO MONITOR READING`. Persisting the same closed run restored 2:20.0.

**Authority.** ROADMAP's locked Offline decision requires active session and
in-progress log state to survive reload or a dropped connection. The quantity
to preserve is the PM5-measured interval actual, not a reconstruction from the
planned step.

**Smallest safe direction.** Make monitor persistence report whether the
record is durable and carry that result through completion. Either hand the
completed in-memory record to Log through one explicit, reload-safe ownership
contract or hold a recoverable storage-error state before navigation. Do not
silently fall back to the manual form and do not invent a second durable store
without a product decision.

**Scope.** `monitorRun.ts`, `useMonitorSession.ts`, connected finish/navigation,
Today recovery, `LogSession.tsx`, and their tests. Do not fold in summary-burst
handoff work or AUD-020 cleanup semantics.

**Required proof.** Start with failing cases for rejected writes at open,
boundary, retry, and close. Mount real connected finish→Log and Today recovery;
cover reload/exit and the successful-storage control. Add a mutation that
restores the void/swallowed durability result and must re-create
`NO MONITOR READING`. Run unit, client, integration as applicable, e2e for all
`app/src/` changes, and screenshots if a recovery surface changes.

**Disposition and gates.** Confirmed P1; still present at current main. Full
Wave F cycle. If the solution adds visible copy/layout, Gate 0 renders both
orientations first. A new hand-off mechanism requires an antagonist delta;
Wave F's phase-close PM gate judges the delivered recovery.

## 2. A successful POST cannot become a retryable save error — AUD-020

**Outcome and impact.** Once the server returns 201, the app must report the
save as committed. A local cleanup failure must not offer another POST that
duplicates the row or advances the active plan twice.

**Evidence and trigger.** `useLogForm` runs `onSaved` inside the POST's generic
`try` (`app/src/session/LogSession.tsx:702-780`). Session cleanup removes draft
and run (`:1173-1192`); monitor cleanup removes the monitor run
(`:1548-1568`). Those removal helpers are unguarded. Both real Log doors turned
a literal 201 followed by selective cleanup failure into a retryable error and
sent a second POST. A fresh PostgreSQL probe observed two distinct rows and,
with a plan, `doneN: 2`.

**Authority.** RFC 9110 §15.3.2 defines 201 as a fulfilled request that created
resource(s). Local cleanup is downstream bookkeeping and cannot make the
server commit untrue.

**Smallest safe direction.** Separate the committed POST result from local
cleanup. Preserve the created ID, enter the successful UI state once, and run
cleanup as idempotent best effort with a bounded recovery path if needed. Do
not solve AUD-017's ambiguous lost-response problem here; that needs operation
identity/idempotency and is a different contract.

**Scope.** Both Log doors, draft/run/monitor cleanup, post-test offer and
navigation, session-log creation, optional plan advancement, and real store
tests.

**Required proof.** Failing session-door and monitor-door cases first. Against
real server/PostgreSQL, force a 201 then fail each clear operation; repeated UI
actions must leave exactly one log and one plan advance. Retain cleanup-success,
post-test offer, and navigation controls. A mutation moving cleanup back into
the retryable POST boundary must fail.

**Disposition and gates.** Confirmed P1; still present. Full Wave F cycle and
one PR separate from ambiguous-network idempotency. No design gate unless new
rower-visible copy/layout is introduced.

## 3. Local-storage denial is a recoverable state — AUD-011 and AUD-015

These findings may share one PR because they exercise the same browser
platform boundary. Keep separate tests and consequences; neither proves the
other.

### AUD-011 — denied reads cannot block Today

**Outcome and impact.** Policy-denied storage must not throw while mounting the
default route. The rower needs a usable empty/recovery state.

**Evidence and trigger.** `loadRun`, `loadDraft`, `loadMonitorRun`, and
`loadTodayPick` access localStorage before their parsing guards
(`app/src/session/run.ts:129-148`, `draft.ts:138-152`,
`monitor/monitorRun.ts:494-520`, `today/todayPick.ts:41-75`). Denying the actual
`window.localStorage` getter with `SecurityError` made all four loaders throw;
mounted Today rejected during initialization.

**Authority and safe direction.** WHATWG Web Storage permits the getter to
throw when policy forbids persistence. Put the initial access inside each
existing guard and return the loader's bounded absent result. Do not clear
other keys or change stored shapes.

**Required proof.** Direct failing tests for all four loaders, then mounted
Today, Timer/Countdown, and Log Session under denied access; preserve malformed
and versioned-value controls. Mutation: move one access back outside the guard
and require its route test to fail.

### AUD-015 — Start cannot enter Timer without a durable run

**Outcome and impact.** If the larger active-run write fails after the draft
fits, Countdown must stay recoverable instead of appearing to start and then
bouncing silently to Today.

**Evidence and trigger.** Countdown ignores `saveRun`'s boolean and navigates
(`app/src/session/Countdown.tsx:219-227,338-343`); Timer reloads and redirects
when the run is absent (`app/src/session/Timer.tsx:354-361,456-458`). A fresh
mounted zero-countdown→Timer probe rejected only the run-key write and observed
Today with no run; restoring writes produced a usable Timer.

**Authority and safe direction.** The locked Offline decision requires the
active run to persist. Branch on the failed write, remain on a recoverable
screen, and expose retry. Do not treat an in-memory object as reload-safe unless
Timer receives an explicit durable ownership contract.

**Required proof.** Failing zero/nonzero countdown cases, retry after storage
recovers, reload during the error, StrictMode's one-write pin, and a mutation
that ignores the boolean and restores the Today bounce.

**Disposition and gates.** Both are Confirmed P1 and still present. Full Wave F
cycle. AUD-015 changes what the rower sees, so render its error/retry state in
both orientations and get Gate 0 approval before implementation.

## 4. One bad History value cannot hide healthy sessions — AUD-013 and AUD-002

One History API/client PR is coherent: harden the server's stored-value
projection first, then bound the client's top-level success shape. Do not merge
their evidence grades or expand into a generated schema system.

### AUD-013 — bound an extreme stored summary scalar

**Outcome and impact.** One database-valid summary number must not turn the
entire owned History list into HTTP 500.

**Evidence and trigger.** The list projection type-checks JSON then casts text
to `double precision` (`app/server/stores/logs.ts:269-294`). A real PostgreSQL
18.4 validator added valid JSON number `1e1000`; authenticated History returned
500 and hid nine healthy/control rows. Deleting only that row restored 200.

**Authority and safe direction.** PostgreSQL JSON validity is not field
validity. Make conversion failure yield `null` for this list scalar without
rewriting/deleting the stored row. Do not claim the detail path preserves the
exponent until it is separately proved.

**Required proof.** Real-PostgreSQL failing case with healthy and corrupt rows;
normal, null, wrong-type, finite boundaries, overflow and underflow; mounted
list/detail responses; red calibration removing the safe conversion.

### AUD-002 — validate the successful top-level body

**Outcome and impact.** A parseable non-array 200 must enter History's existing
error/Retry state instead of reaching `.map` and crashing.

**Evidence and trigger.** `useLogHistory` casts any parseable success to
`RecentLog[]` (`app/src/log/useLogHistory.ts:58-68`); `HistoryList` maps it
(`app/src/log/HistoryList.tsx:180-199`). Literal `200 {}` reproduced the render
failure; empty content used error/Retry and valid arrays rendered normally. No
real producer of `{}` was found, so this remains Probable.

**Authority and safe direction.** The existing bounded History load failure is
the expected client result. Require an array before ready state; do not reject
additive unknown element fields or introduce generated contracts in this fix.

**Required proof.** Empty body, object, empty array, and realistic populated
array through the mounted initial request. Probe malformed elements and
load-more separately before widening scope.

**Disposition and gates.** AUD-013 is Confirmed P1; AUD-002 is Probable P2;
both are still present. Full cycle because server behavior and a blocked
surface change. No stored shape is changed.

## 5. Today and Library must state every accepted rest — AUD-006

**Outcome and impact.** A custom workout cannot show one minute of rest while
the timer will run three. Today and Library currently hide accepted standalone
rest even though Today's TOTAL includes it.

**Evidence and trigger.** Validation and bulk import accept leading and
consecutive rest. `pieceList` and `structureLine` drop leading rest and retain
only the first consecutive rest (`app/domain/display/stepDetail.ts:48-72,
233-272`); `workAndTotal` sums all phases (`:200-215`). Raw authored examples
with 1 minute work + 3 minutes rest render only `1′ r`, while Timer runs 240 s.

**Authority.** The approved step-detail design requires both scan surfaces to
state the structure and requires WORK plus displayed rests to equal TOTAL. The
expected rest quantity is summed directly from authored steps, not from either
projection helper.

**Smallest safe direction.** Aggregate consecutive rest onto the preceding
piece in both projections without changing execution. Before touching leading
rest, Gate 0 decides whether it remains valid: either reject/normalize it at
every authoring/import/stored compatibility boundary or approve a visible
representation. Do not invent a pre-work row or patch Today alone.

**Scope and proof.** `stepDetail.ts`, validation/import compatibility, Today,
Library, detail, Timer, and compiler contracts. Start with raw-rest arithmetic
and realistic custom-workout failures. Render before/after in both orientations
with contrast numbers, then run unit/client/integration as applicable, e2e and
screenshots. Mutation: drop either authored rest and require the cross-surface
TOTAL invariant to fail.

**Disposition and gates.** Confirmed P2; still present. A displayed number and
prescription changes, so this is TRIAD: full antagonist spec pass, rendered
Gate 0, and PM final-PR gate. Land alone.

## 6. Native sign-out always attempts the Keychain wipe — AUD-014

**Outcome and impact.** A rejected/offline server request must not leave the
native bearer in Keychain. Today a cold offline launch can look signed out,
then reuse the bearer when connectivity returns.

**Evidence and trigger.** `nativeSignOut` awaits the POST before `clearToken`
(`app/src/native/signin.ts:38-40`). A fresh actual-adapter/mounted-You probe
rejected the transport: Keychain removal was not called, sign-out did not
complete, and a later online read reused the bearer. Success, HTTP 500, and
Keychain-delete failure controls isolated the ordering.

**Authority.** The approved native-auth design independently requires server
POST and Keychain wipe. Local deletion is not evidence that revocation
succeeded, and revocation failure does not cancel the local wipe requirement.

**Smallest safe direction.** Send revocation while the bearer is available,
then always attempt Keychain deletion. Report local sign-out success only when
deletion succeeds; keep deletion failure visible. Web cookie logout is out of
scope.

**Required proof.** Rejected transport first; success and HTTP 5xx; deletion
failure; mounted You completion; offline→online `useMe`; exact bearer lifecycle.
Use the real native wrapper boundary, not a mock of `nativeSignOut`.

**Disposition and gates.** Confirmed P2; still present. AUTH triad: full
antagonist spec pass and PM final-PR gate. Wave A owner; land alone.

## 7. Do not claim booting-replica safety before migrations are serialized — AUD-012

**Outcome and impact.** Two complete server processes started together on an
empty database can leave one unhealthy. Current compose is serial and
single-replica, so no current rollout outage was shown.

**Evidence and trigger.** `server/index.ts:27-49` runs Drizzle migrations
before the advisory-locked seed. In three PostgreSQL 18.4 trials, overlapping
production-built servers produced one healthy process and one migration
`23505`; serial controls made both healthy. The design's claim that the lock
“serializes booting replicas” is therefore false at current main.

**Authority and smallest safe direction.** The supported deployment contract
is single-replica/serial. Correct the broader design claim now. Do not add
locking code until overlapping replicas are actually supported; before that
change, choose migration-level locking or a one-shot deploy migration.

**Required proof for future code.** Two complete processes against empty
PostgreSQL must both reach health, with migration-journal and seed cardinality
derived from checked-in sources. Include one unprotected red control.

**Disposition and gates.** Confirmed P2; still present. Immediate work is a
docs correction that rides the next deployment-doc PR. Future multi-replica
code gets its own full cycle; do not bundle it with product fixes above.

## Explicit exclusions

Do not turn AUD-001, AUD-007, AUD-008, AUD-009, AUD-010, AUD-017, AUD-018, or
AUD-019 into fixes. They remain hypotheses or exact-case hardware clearances.
AUD-003 is P3 process debt, and AUD-005 is cleared at the audited baseline.
