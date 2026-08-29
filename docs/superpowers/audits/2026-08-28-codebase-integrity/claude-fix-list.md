# Prioritized Fix List for Claude Code

Baseline reproduction: `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`

Current-main check: `fd4d06a57581e1e814ecd06f74274a30bffce6ee`

Status: READY_FOR_WAVE_F_PHASE_OPEN

The audit established six actionable findings grouped into five coherent
implementation chunks. Their relative audit priority is below, but this is not
a global execution order: current main already contains the hardware-reproduced
Wave F pre-row P1 and a newer stored-number TRIAD P1. Wave F's phase-open gate
must sequence its existing work with chunks 1–2 before Claude implements any of
them.

Every chunk gets a worktree, failing tests first, scoped mutation proof, the
named gates, and a PR; never merge without James's explicit approval. Read
`.claude/agent-briefing.md` and `docs/TESTING.md` before implementation.

## Audit-relative priority

| Rank | Chunk                                           | Findings         | Live ROADMAP owner | Why it outranks the next audit item                                                          |
| ---- | ----------------------------------------------- | ---------------- | ------------------ | -------------------------------------------------------------------------------------------- |
| 1    | Preserve measured connected work                | AUD-016          | Wave F             | Completed PM5 measurements can miss the Log door.                                            |
| 2    | Make local-storage failure recoverable          | AUD-011, AUD-015 | Wave F             | Policy-denied storage blocks Today or silently cancels Start before work is completed.       |
| 3    | Make workout previews state every accepted rest | AUD-006          | Open-item register | Two rower-facing surfaces give a wrong prescription while execution keeps the hidden rest.   |
| 4    | Complete native sign-out while offline          | AUD-014          | Wave A             | A rejected revocation leaves the bearer available for later reuse, but does not bypass auth. |
| 5    | Bound History's successful top-level body       | AUD-002          | Open-item register | A parseable malformed 200 crashes History, but no supported producer has been found.         |

## 1. Preserve measured connected work through the Log hand-off — AUD-016

**Outcome and impact.** A connected workout with measured intervals must reach
the connected Log door even when localStorage rejects monitor-run writes. Today
the rower can finish real work and receive `NO MONITOR READING` because the next
route reloads a record that never became durable.

**Evidence and trigger.** `saveMonitorRun` swallows a failed write and returns no
durability result (`app/src/monitor/monitorRun.ts:449-490`). The Log route
fresh-loads storage (`app/src/session/LogSession.tsx:323-345`). A blind validator
compiled a real workout, retained a literal 2:20.0 measured actual in memory
through five rejected writes, and mounted finish→Log: the screen showed
`NO MONITOR READING`. Persisting the same closed run restored 2:20.0.

**Authority.** ROADMAP's locked Offline decision requires active session and
in-progress log state to survive reload or a dropped connection. Preserve the
PM5-measured interval actual, not a reconstruction from the planned step.

**Smallest safe direction.** Make monitor persistence report durability and
carry that result through completion. Either hand the completed in-memory record
to Log through one explicit, reload-safe ownership contract or hold a
recoverable storage-error state before navigation. Do not silently fall back to
the manual form or invent a second durable store without a product decision.

**Scope and proof.** `monitorRun.ts`, `useMonitorSession.ts`, connected
finish/navigation, Today recovery, `LogSession.tsx`, and their tests. Start with
rejected writes at open, boundary, retry, and close; mount real finish→Log and
reload/exit controls. A mutation restoring the swallowed result must recreate
`NO MONITOR READING`. Run unit/client/integration as applicable, E2E for
`app/src/`, and screenshots if a recovery surface changes.

**Disposition and gates.** Confirmed P1; still present. Full Wave F cycle. If
the solution changes copy/layout, rendered Gate 0 in both orientations comes
first. A new hand-off mechanism requires an antagonist delta. Wave F phase-open
decides sequencing against the pre-row lock and machine-summary hand-off.

## 2. Local-storage denial is a recoverable state — AUD-011 and AUD-015

One Wave F PR may own the shared storage-failure surface, but each failure keeps
its own regression and consequence.

### AUD-011 — storage access cannot block Today

**Outcome and trigger.** If the `window.localStorage` getter throws
`SecurityError`, Today, Timer/Countdown, Log, and monitor recovery must return a
bounded absent/error result. Today currently throws during initialization.

**Evidence.** Four loaders access `localStorage` before their parse guards
(`app/src/session/run.ts:129-148` and the corresponding draft, monitor-run, and
Today-override loaders). Getter denial made all four throw and real Today reject;
empty and malformed-value controls remained bounded.

**CORRECTED at the Wave F phase-open anchor (2026-08-28): the fourth loader
above is wrong.** `loadTodayOverrides` is already guarded — its getter sits
inside its own try (`app/src/today/todayOverrides.ts:211`). The real unguarded
set is `loadRun`, `loadDraft`, `loadMonitorRun`, and **`loadTodayPick`**
(`app/src/today/todayPick.ts:53`). The mounted-Today probe could not see the
difference because `loadRun` (`Today.tsx:280`) throws first and masks every
later loader; reaching the `loadTodayPick` call (`Today.tsx:1044`) needs a
fixture with a plan and a pool. A fix written to the original list guards an
already-guarded function and ships Today still broken behind a green gate.

**Authority and safe direction.** The WHATWG Web Storage standard permits the
getter to throw for policy denial. Obtain storage inside each existing guard and
return the loader's bounded absent result. Do not clear unrelated keys or change
stored shapes.

**Required proof.** Direct failures for all four loaders, then mounted Today,
Timer/Countdown, and Log under denied access; preserve malformed/versioned
controls. Moving one access outside the guard must turn its route test red.

### AUD-015 — Start cannot enter Timer without a durable run

**Outcome and trigger.** If the larger active-run write fails after the draft
fits, Countdown must stay recoverable instead of appearing to start and bouncing
silently to Today.

**Evidence.** Countdown ignores `saveRun`'s boolean and navigates
(`app/src/session/Countdown.tsx:219-227,338-343`); Timer reloads and redirects
when the run is absent (`app/src/session/Timer.tsx:354-361,456-458`). A mounted
zero-countdown→Timer probe rejected only the run-key write and observed Today
with no run; restoring writes produced a usable Timer.

**Authority and safe direction.** The locked Offline decision requires the
active run to persist. Branch on the failed write, remain on a recoverable
screen, and expose Retry. Do not call an in-memory object reload-safe unless
Timer receives an explicit durable ownership contract.

**Required proof and gates.** Cover zero/nonzero countdown, Retry after recovery,
reload during error, and StrictMode's one-write pin. Ignoring the boolean must
restore the Today bounce. Both findings are Confirmed P1 and still present.
Rendered Gate 0 is required for AUD-015's error/Retry surface before
implementation.

## 3. Today and Library must state every accepted rest — AUD-006

**Outcome and impact.** A custom workout cannot show one minute of rest while
the timer will run three. Today and Library currently hide accepted standalone
rest even though Today's TOTAL includes it.

**Evidence and trigger.** Validation and bulk import accept leading and
consecutive rest. `pieceList` and `structureLine` drop leading rest and retain
only the first consecutive rest (`app/domain/display/stepDetail.ts:48-72,
233-272`); `workAndTotal` sums every phase (`:200-215`). Raw authored examples
with one minute work plus three minutes rest render only `1′ r`, while Timer
runs 240 seconds.

**Authority.** The approved step-detail design requires both scan surfaces to
state structure and requires WORK plus displayed rests to equal TOTAL. Expected
rest is summed from authored steps, not either projection helper.

**Smallest safe direction.** Aggregate consecutive rest onto the preceding
piece in both projections without changing execution. Gate 0 first decides
whether leading rest remains valid: reject/normalize it at every authoring,
import, and compatibility boundary, or approve a visible representation. Do
not invent a pre-work row or patch Today alone.

**Proof and gates.** Start with raw-rest arithmetic and realistic custom-workout
failures across Today, Library, detail, Timer, and compiler. Render before/after
in both orientations with contrast numbers; run unit/client/integration, E2E,
and screenshots. Dropping either authored rest must fail the cross-surface TOTAL
invariant. Confirmed P2; displayed-number TRIAD, full antagonist spec pass and
PM final-PR gate; lands alone.

## 4. Native sign-out always attempts the Keychain wipe — AUD-014

**Outcome and impact.** A rejected/offline revocation request must not leave the
native bearer in Keychain. Today a cold offline launch can look signed out, then
reuse the bearer when connectivity returns.

**Evidence and trigger.** `nativeSignOut` awaits the POST before `clearToken`
(`app/src/native/signin.ts:38-40`). A blind actual-adapter/mounted-You probe
rejected transport: Keychain removal was not called, sign-out did not complete,
and a later online read reused the bearer. Success, HTTP 500, and
Keychain-delete-failure controls isolated ordering.

**Authority and safe direction.** The approved native-auth design independently
requires server POST and Keychain wipe. Send revocation while the bearer is
available, then always attempt local deletion. Report local sign-out success
only when deletion succeeds; keep deletion failure visible. Web cookie logout
is out of scope.

**Proof and gates.** Cover rejected transport, success, HTTP 5xx, deletion
failure, mounted You completion, offline→online `useMe`, and the exact bearer
lifecycle through the real native wrapper boundary. Confirmed P2; AUTH triad,
full antagonist spec pass and PM final-PR gate; Wave A owner and lands alone.

## 5. A malformed successful History body enters Retry — AUD-002

**Outcome and impact.** A parseable non-array 200 must enter History's existing
error/Retry state instead of reaching `.map` and crashing.

**Evidence and trigger.** `useLogHistory` casts any parseable success to
`RecentLog[]` (`app/src/log/useLogHistory.ts:58-68`); `HistoryList` maps it
(`app/src/log/HistoryList.tsx:180-199`). Literal `200 {}` reproduced the render
failure; empty content used error/Retry and valid arrays rendered normally. No
supported producer of `{}` was found, so this remains Probable.

**Authority and safe direction.** The existing bounded load-failure surface is
the expected client result. Require an array before ready state; do not reject
additive unknown element fields or introduce generated contracts in this fix.

**Proof and gates.** Cover empty body, object, empty array, realistic populated
array, malformed elements, and load-more separately before widening scope.
P2/Probable; still present. It rides the next History API/client boundary PR and
is not bundled with AUD-013's unsupported raw-database hardening case.

## Explicit exclusions

Do not turn AUD-012, AUD-013, or AUD-020 into P1/P2 fixes. AUD-012 is Confirmed
P3 stale-claim debt that rides the next deployment-doc PR. AUD-013 and AUD-020
are P3 unsupported-trigger hardening until a legitimate producer/throwable
operation is established.

Do not turn AUD-001, AUD-007, AUD-008, AUD-009, AUD-010, AUD-017, AUD-018, or
AUD-019 into fixes. They remain hypotheses or exact-case hardware clearances.
AUD-003 is P3 process debt and AUD-005 is cleared at the audited baseline.

Over-engineering is only partially covered: runtime cycles and state/authority
seams were checked, but extra state, one-consumer/unused interfaces, production
dead branches, duplicate mechanisms, and measurable change amplification remain
deferred. No refactor prompt should be inferred from that gap.
