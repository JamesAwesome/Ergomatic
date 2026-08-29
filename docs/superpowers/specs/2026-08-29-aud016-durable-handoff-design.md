# The hold refuses to release silently on a failed write — AUD-016 design

**What and why.** A completed PM5 session whose monitor-run writes were
rejected reaches the log screen with no record: the measured work renders
`NO MONITOR READING` and the rower can only save it as hand-logged. The
producer is real and production-observed — `storage-persist denied` on
James's own iPhone (the leg-5 ring's first entry) — and the swallow is
documented at the seam: `saveMonitorRun` returns `void` by design, its own
comment reasoning that "the caller has no different action to take on a
failed write." AUD-016 is the different action that comment did not imagine
(CLAUDE.md recurring failure 25's tell, verbatim), and PR #228's hold is
the mechanism that makes the action possible: the release is now the last
owned moment before the reader mounts. This spec makes that release VERIFY
durability once and refuse to proceed silently when the store says no —
the rower sees it, can retry, or can carry the record through in memory.

Direction approved by James 2026-08-29 ("Approve") on the presented
design: one verifying re-save at release, a visible held-error state with
RETRY and a non-retry proceed-anyway exit, memory-first reader fallback,
receipts, an RF24-shaped gate leg, and Gate 0 before implementation.

## Evidence base

The chain is the Wave F anchor pass's VETTED GROUND (antagonist ledger,
2026-08-28: "AUD-016's chain and its production-observed producer" held
under attack) — not re-derived here. What this spec adds is verified
against current main (`e78a0de2`):

- PRIMARY (code): `saveMonitorRun` (`monitorRun.ts:475-492`) — bare catch,
  series-sacrifice retry, `void` return; its doc comment carries the
  "no different action" rationale this spec retires. Seven non-test
  callers: `monitorRun.ts:583` (create), `:856/:920/:959` (record-actual /
  series / close writers), `:1110` (`appendSummaryObservations`),
  `useMonitorSession.ts:1748` (series flush), `:2250` (final-series
  close). None can see failure today.
- PRIMARY (code): the reader and its instrument — `monitorModeRun`
  (`LogSession.tsx:323-340`) fresh-loads storage and records
  `recordLogDoorMiss("no-run")` (`:239`, writing
  `ergomatic:log-door-misses`) when nothing is there. The counter has had
  ZERO production readers since Phase LM (PM ledger, 2026-08-28) — this
  spec's failure path is the moment it starts mattering, and reading it
  stays Wave B's item.
- PRIMARY (code, #228): the hold — `resolveHandoffCondition` /
  `releaseHandoff` in `useMonitorSession.ts`; every release path funnels
  to one `handoffHeld: false` update. PR #228's spec §3 exit 3b names this
  exact successor: "AUD-016's PR gives that write a signal and branches at
  THIS exit."
- PRIMARY (ruling): phase-open gate, 2026-08-28 (PM ledger) — "AUD-016's
  own safe direction is 'hold a recoverable storage-error state before
  navigation' — PR 1's mechanism at PR 1's seam. PR 1's spec enumerates
  the hold's exit conditions and names which PR implements each, so the
  successor extends rather than redesigns."
- PRIMARY (audit): `docs/superpowers/audits/2026-08-28-codebase-integrity/`
  final report — AUD-016 P1 Confirmed; safe direction offers a
  disjunction: "Preserve the measured actual through one explicit,
  reload-safe hand-off OR hold a recoverable storage state before
  navigation." This spec takes the second arm and says so (§4's
  reload-safety disclosure).

## §1 The mechanism: verify once, at the release

Threading a return value through all seven writers would put a branch at
six sites that genuinely have no different action mid-session (a failed
series flush changes nothing the rower can do at stroke 40). Instead the
durability question is asked ONCE, at the moment it has an answer that
matters: when the hold is about to release into navigation.

1. **`saveMonitorRun` gains a return:**
   `"saved" | "saved-without-series" | "failed"` — the three outcomes its
   body already distinguishes internally (clean write / sacrifice-retry
   succeeded / both threw). All existing callers may ignore it; the
   compiler forces nothing on them. Its doc comment's "no different
   action" rationale is REWRITTEN to name the one caller that now acts.
2. **The verifying re-save.** The release path (the same single funnel
   every resolve reaches) performs one `saveMonitorRun(runRef.current)`
   before flipping `handoffHeld` — re-persisting the CURRENT in-memory
   record, which both heals any earlier silently-failed write (a
   transient rejection often clears by release time; the self-healing
   common case costs one write) and yields the verdict to branch on.
   `"saved"` and `"saved-without-series"` release exactly as today.
   Runs with no record (`runRef.current === null` — End at READY) skip
   the verify: there is nothing to make durable.
3. **`"failed"` enters the held-error state.** `handoffHeld` stays true;
   a new session field (`holdError: "storage-failed" | null`) drives the
   ended frame's error rendering (§4). NO auto-release: unlike every
   other hold state this one is rower-attended — two controls are on
   screen, and an unbounded silent timer under a visible choice would
   race the rower's own hand. The backstop timers are already resolved
   by this point (the verify runs at release, after every condition
   resolved); nothing else can fire. This is the one deliberate
   exception to "every hold has a bounded backstop," stated here rather
   than discovered.
4. **RETRY** re-runs the verifying save; success releases normally and
   clears `holdError`. Each attempt records a receipt (§5) — a rower
   hammering retry against a full store produces a countable trail, not
   silence.
5. **PROCEED ANYWAY (the non-retry exit** — the AUD-011/015 anchor
   condition applied here: a Retry under a still-denied store is a
   loop). It releases the hold AND carries the record through IN MEMORY:
   a module-level one-shot slot in `monitorRun.ts`
   (`stashHandoffRun(run)` / `takeHandoffRun()`), consumed exactly once
   by the reader (§3). Navigation proceeds; the measured session still
   renders and still saves to the server — the server POST was never the
   broken link.

## §2 Scope: which closes get the verify

All three burst-eligible `ended` arms — machine finish, Menu terminate,
app End — i.e. every release of the hold. Closes that never hold
(`link-lost` through `fail()`, `program-failed`) are OUT OF SCOPE, with
the reason stated: a link-lost close the rower then Ends goes through
`endSession` and IS covered; a `program-failed` close never completed a
run, so there is no measured actual to preserve — the audit's case is
the COMPLETED session. If the antagonist finds a completed-run path
through `fail()`, that finding amends this section rather than the
mechanism.

## §3 The reader: memory first, storage second

`monitorModeRun` consults `takeHandoffRun()` before `loadMonitorRun()`.
The slot is one-shot and session-scoped:

- **Not reload-safe, disclosed.** A reload between proceed-anyway and
  Save loses the slot and lands in today's behavior (`no-run` miss,
  manual door). The audit's disjunction offered reload-safety OR a
  recoverable held state; we take the held state, and the residual
  reload window is (a) rower-initiated twice over, (b) counted by the
  existing `recordLogDoorMiss("no-run")` when it happens.
- The mount-time `useState` snapshot idiom in `LogSession` stays; the
  slot is read inside `monitorModeRun`, upstream of the snapshot.
- Save-success clearing (`clearMonitorRun`) is unaffected: a slot-carried
  run was never in storage, so there is nothing extra to clear; the
  clear call stays for the healed/normal path.

## §4 What the rower sees, and Gate 0

New copy and two controls on the ended frame, ONLY in the held-error
state (every existing state renders exactly as #228 shipped):

- Body line replaced by an error line naming the fact plainly — draft:
  `Could not keep the record on this phone.` — with the two controls
  beneath: `RETRY` and `LOG IT ANYWAY`. Draft copy only: exact strings,
  layout, hit-target sizes (44px floor), and every colour pairing's
  computed contrast ratio are GATE 0's to approve, rendered at real
  proportions in both orientations against the current frame, BEFORE any
  implementation task. House rules bind: no em-dashes, "monitor"/"phone"
  never "PM5", periods over dashes.
- The headline stays `Wrapping up` (it is still true: the app is trying
  to finish the hand-off).
- `LOG IT ANYWAY` must read as the safe path it is (the record survives
  to the log and the server), not as data loss — the thing actually at
  risk is only the LOCAL cache copy.

## §5 Receipts

Same ring idiom as #228's: `release-save` (verdict: saved /
saved-without-series / failed, attempt ordinal), `hold-error-entered`,
`hold-error-retry` (per attempt, with verdict), `hold-error-proceed`
(the rower took the memory exit). The proceed path also calls
`recordLogDoorMiss("storage-failed-proceed")` so the one counter that
already exists for this seam finally counts its headline case.

## §6 The gate

Extends `summaryHoldReplay.test.ts` (the RF24 chain): a leg replaying
leg 1's recording with `localStorage.setItem` stubbed to throw from the
release-verify onward. Assert, in sequence: (1) the hold does NOT
release — `handoffHeld` stays true with `holdError` set after the burst
was heard and appended; (2) RETRY with the stub still throwing records
its receipt and stays held; (3) un-stub, RETRY releases and the POST
carries the machine columns (the healed path); (4) a second run of the
leg takes PROCEED ANYWAY instead — the reader mounts with the
memory-carried run and the POST carries the measured work with NO prior
successful storage write. Unit tests cover the verify's three verdicts,
the no-record skip, and the one-shot slot's consume-once semantics.

**Mutations (RF21, including #228's two review lessons):** (a) make the
release ignore the verify's verdict — leg assertion (1) must fail;
(b) pin the held-error copy/controls with literals, not imported
constants; (c) one mutation ABOVE the seam: a parent forging
`holdError: null` into the surface while the hook holds the error — the
e2e or component gate must fail; (d) break the slot's one-shot (consume
twice) — the unit test must fail. Each run per RF22, evidence in the
report.

## §7 Out of scope, stated

- **Reading `ergomatic:log-door-misses`** — Wave B's item; this spec only
  feeds it.
- **AUD-011/015** (loader guards, Countdown's ignored `saveRun` boolean)
  — chunk 3's PR; same class, different seam, its own Gate 0.
- **`fail()`-path closes** — §2's reasoning.
- **Reload-safety of the memory slot** — §3's disclosed residual.
- **Quota management / eviction policy** — the series sacrifice already
  in `saveMonitorRun` stays as is.

## Process

Antagonist DELTA pass (mid-phase spec inventing a new mechanism on
anchored ground — the pass attacks §1's release-verify, §2's scope
boundary, §3's one-shot slot, and §6's stub soundness against the vetted
chain; the skip-vs-full decision is spoken here, not silent) → revisions
→ Gate 0 rendered and approved → plan → implementation in this worktree,
failing gate leg first → PM final-PR gate (TRIAD seam), riding the usual
merge duties.
