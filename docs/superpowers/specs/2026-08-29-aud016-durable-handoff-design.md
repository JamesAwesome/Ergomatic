# The hand-off refuses to end silently on a failed write — AUD-016 design

**What and why.** A completed PM5 session whose monitor-run writes were
rejected reaches the log screen with no record: the measured work renders
`NO MONITOR READING` and the rower can only save it as hand-logged. The
swallow is documented at the seam: `saveMonitorRun` returns `void` by
design, its own comment reasoning that "the caller has no different action
to take on a failed write" — recurring failure 25's tell, verbatim.
AUD-016 is the different action, and PR #228's hold makes it possible: the
ended hand-off is now the last owned moment before the reader mounts. This
spec makes that hand-off VERIFY writability once and refuse to end
silently when the store says no — the rower sees it, can retry, or carries
the record through in memory with the machine's own numbers intact.

**The producer, stated honestly (corrected at the delta pass).** No
instrument in this codebase can observe a rejected monitor-run write —
`saveMonitorRun`'s catch records nothing — so "production-observed
rejected write" cannot be claimed and is not claimed here. What IS
observed on James's phone is `storage-persist denied`
(`useMonitorSession.ts:660-663`), which means only that
`navigator.storage.persist()` returned falsy: the origin is EVICTABLE,
the expected tolerated WKWebView outcome (that comment's own PRIMARY,
WebKit's policy blog). The audit's AUD-016 evidence was INJECTED rejected
writes (its fix-list §1), validated blind — a confirmed consequence, not
a field observation. Two producers therefore matter and differ:
quota/denial (a write THROWS — this spec's verify catches it) and
EVICTION (every write returns green and the record later vanishes — the
verify CANNOT catch it; disclosed in §3 as the design's false-negative,
with the §5 receipts as the only instrument either producer gets).

Direction approved by James 2026-08-29 ("Approve"); revised the same
session through the antagonist DELTA pass (verdict REVISE: one kill —
the burst append's storage re-read starves the memory carry; one scope
kill — link-lost End closes escaped the verify; the gate's stub shape,
the receipt's own store, the producer citation, and a false zero-readers
claim). All folded in below; the pass's ledger entry rides this PR.

## Evidence base

The AUD-016 chain is the Wave F anchor pass's vetted ground. New claims
verified against main `e78a0de2`:

- PRIMARY (code): `saveMonitorRun` (`monitorRun.ts:475-492`) — bare
  catch, series-sacrifice retry, `void`. FOUR exits, not three: `:477`
  clean success; `:479` threw with no series to sacrifice (a FAILURE);
  `:486` sacrifice succeeded; `:490` sacrifice threw. Seven non-test
  callers (`monitorRun.ts:583/:856/:920/:959/:1110`,
  `useMonitorSession.ts:1748/:2250`), none seeing failure today.
- PRIMARY (code, the delta pass's kill): `appendSummaryObservations`
  re-reads storage via `stillLive` → `loadMonitorRun()`
  (`monitorRun.ts:1021-1025`, by design per `:1036-1039`) — under denied
  writes it finds NOTHING, declines (`appended === null`,
  `useMonitorSession.ts:2611-2623`), and the in-memory run never gains
  `summaryTotals`. Proven by probe: denied from the first write, restored
  before the burst → `appended: DECLINED, inMemoryHasSummary: false`. §1
  step 4 exists because of this.
- PRIMARY (code): TWO release funnels, not one — `releaseHandoff`
  (`useMonitorSession.ts:1885`) and `resolveHandoffCondition` (`:1925`);
  the deferred-teardown burst linger can drive the second AFTER unmount
  (`:2946-2998`). §1's placement rules exist because of this.
- PRIMARY (code): `ergomatic:log-door-misses` HAS a production reader —
  `withDoorMisses` (`LogSession.tsx:868-874`) feeds MONITOR LOG · COPY on
  every `?from=monitor` arrival. The PM ledger's 2026-08-28 "zero
  production readers" claim is corrected by a note riding this PR.
  `recordLogDoorMiss` itself writes through `localStorage.setItem` in a
  try/catch (`:254-257`) — under the very denial this spec handles it
  records nothing, so NO failure receipt in this design goes through it
  (§5; RF21).
- PRIMARY (ruling): phase-open gate 2026-08-28 — "hold a recoverable
  storage-error state before navigation — PR 1's mechanism at PR 1's
  seam"; #228 spec §3 exit 3b names this successor.
- PRIMARY (probe, delta pass): React 19 StrictMode invokes a `useState`
  lazy initializer TWICE and keeps the FIRST result
  (`calls = 2, committed first`) — §3's slot survives; the discarded
  second run's side effects do not (§3's dev-only disclosure).

## §1 The mechanism: verify once, at the hand-off

1. **`saveMonitorRun` gains a return** mapping its four exits:
   `:477 → "saved"`, `:486 → "saved-without-series"`, `:479` and
   `:490 → "failed"`. All existing callers may ignore it. The doc
   comment's "no different action" rationale is rewritten to name the
   caller that now acts. Stated cost, not smoothed over: the verify
   re-serializes the full run synchronously (series can reach ~720 KB,
   `monitorRun.ts:459-461`) once per session, at the ended frame.
2. **The verifying re-save runs at every ended hand-off with a completed
   run — hold or NO hold.** The delta pass killed the hold-only scope: an
   `endedBy: "link-lost"` End close opens no burst hold
   (`openBurstHold` refuses the reason, `:2006`), yet five rowed
   intervals are exactly the audit's case. So the verify belongs to the
   HAND-OFF, not the burst hold: it runs (a) inside the release funnel
   when a hold resolves its last owed condition, and (b) synchronously in
   the `ended` patch for closes that open no hold (link-lost End,
   continuity reset, the no-conditions-owed finish) — in both cases
   BEFORE `handoffHeld` reaches `false`. On `"failed"` the patch carries
   `handoffHeld: true` + `holdError: "storage-failed"`; a hold with no
   timers, exited only by §4's controls. `runRef.current === null` (End
   at READY) skips everything.
   Placement rules, from the two-funnel reality: `releaseHandoff("teardown")`
   NEVER verifies (unmount path; state on a dead hook renders to nobody,
   and after a held-error it is already a no-op — both refs null). A
   `resolveHandoffCondition` release reached POST-unmount (the linger's
   burst) also never verifies or renders — it STASHES to §3's slot with a
   receipt instead. The verify never runs twice per hand-off: it sits
   behind the same both-refs-null release guard.
   The claim that a transient rejection clears by release time is
   INFERENCE, not sourced — the healed path is a bonus when it happens,
   never the design's argument.
3. **`"saved"` releases as today. `"saved-without-series"` releases
   normally too, but ALSO stashes the in-memory run (which keeps its
   series — `saveMonitorRun`'s own comment, `:471-474`) into §3's slot,
   with a receipt:** the reader then serves the full-trace copy and the
   POST keeps `series` (a first-class body key, `LogSession.tsx:749-753`);
   a reload degrades gracefully to the seriesless stored copy. Silent
   trace loss ends without a rower decision or any UI.
4. **The burst fold (the kill's fix).** When `appendSummaryObservations`
   declines because storage holds no live record (the `stillLive → null`
   reason specifically — writer-gate rejections keep declining as today),
   the handler folds the observations onto `runRef.current` IN MEMORY:
   same fields the append would have written (`summaryTotals`,
   `summaryDetail`, `verificationBytes`), same at-most-once discipline,
   its own receipt (`summary-folded-in-memory`). Without this, the memory
   carry preserves a record strictly poorer than the storage path it
   replaces — the machine's numbers, dropped on exactly the path this
   spec exists for.
   **Amended at the final review (I1, Important):** the shipped guard
   cannot itself call `stillLive` (module-private to `monitorRun.ts`) or
   distinguish "genuinely empty" from "storage holds a record, but for the
   WRONG identity" — a naive `loadMonitorRun() === null` reads identically
   in both cases. The fold stays correct anyway because C1's create-time
   clear (below) makes the second case unreachable: `createMonitorRun`
   empties both hand-off carriers unconditionally the instant a session
   opens, so for the rest of that session's life storage can only ever
   hold nothing or a record sharing THIS run's own `startedAt` — an
   unrelated prior session's record can never be the thing `loadMonitorRun()`
   returns while this session is live. Under that invariant
   `loadMonitorRun() === null` and "`stillLive` → null specifically" are
   the same fact, not two things a gate has to tell apart. Pinned by a
   dedicated leg-A test (`summaryHoldReplay.test.ts`) that seeds an
   unrelated prior record before the session opens and asserts the fold
   still fires. The `completedAt`/`endedBy` eligibility gates this step
   already carried are unchanged.
5. **RETRY** re-runs the verify; success releases and clears `holdError`;
   each attempt gets a receipt. **PROCEED ANYWAY** (the non-retry exit)
   releases AND stashes the in-memory run into §3's slot — the measured
   session, machine numbers included via step 4, still renders and still
   saves to the server; the server POST was never the broken link.
6. **The escape hatch is enumerated, not silent (delta pass).** From
   held-error the rower can also leave via the tab bar or back gesture —
   unmount, `teardown`. Teardown while `holdError` is set STASHES the run
   to the slot with a receipt before its normal work: the record survives
   the most likely response to an error screen, and the next
   `?from=monitor` arrival for that workout serves it — **as long as
   nothing else has opened a NEW session in the meantime** (amended, C1,
   final review — see §3 below: `createMonitorRun` retires an unconsumed
   stash the instant a new session opens, and that is the intended trade,
   not a residual bug, since the alternative is the stash outliving the
   session it belonged to and beating a genuinely fresher record). A later
   session's stash supersedes the slot (newest wins, receipt on
   overwrite) — that rule now composes with the new one: a new session
   opening always wins outright; superseding still describes two stashes
   that both survive without a session ever opening between them.
   **Amended honestly (I2, Important, final review): "the next `?from=monitor`
   arrival ... serves it" overstated how a rower actually GETS to that
   arrival.** `Today.tsx`'s own unlogged-connected-session row (the one
   discoverable, unprompted path back to `?from=monitor` — `UnloggedMonitorRow`,
   `Today.tsx:604`, wired from `loadMonitorRun()` at `Today.tsx:288`) reads
   STORAGE, never the slot — so under the leg A shape (denied from the
   session's first write, storage empty throughout) Today renders no such
   row at all, and the escape hatch's stash sits in the slot with nothing
   in the app pointing the rower back at it. The claim is honest only when
   a stored record — complete or not — still exists for Today to build
   that row from (leg B's shape, or any case where earlier writes landed);
   under leg A the escape hatch preserves the run for a rower who
   independently returns to the exact URL (a bookmark, browser history),
   not one Today ever prompts. §3 below carries the full, corrected
   picture.
7. **The late-burst restash — introduced at James's first PR #230 review
   (P1b, "RULED: restash-only", not previously written up in this spec —
   corrected here) and WIDENED at his second review (P1-2, Critical).** A
   burst whose numbers arrive only AFTER the hand-off has already released
   (a retry-heal, PROCEED ANYWAY, or the ordinary backstop release)
   restashes `runRef.current` into §3's slot with its own receipt
   (`handoff-stashed reason=late-burst`) — never a Save-time pull into an
   already-mounted reader (Gate 0's own "a Save must post exactly what the
   screen showed, never numbers it didn't"), only a copy for the NEXT
   `?from=monitor` arrival to find. **The correct trigger is "this
   hand-off has already released", not "we are inside teardown's own
   post-unmount linger" — the first fix's own condition, and the gap the
   second review found.** Release always happens strictly BEFORE the
   navigation that eventually unmounts the driving hook
   (`workout/ConnectedSurface.tsx`'s own `onEnded` effect fires only once
   `handoffHeld` is already `false`), and a wire event answers to no React
   commit — so a burst can land on EITHER side of that unmount: before it
   (a real gap, bounded by nothing, that the first fix's own
   linger-only condition missed entirely) or after it, inside `teardown`'s
   own deferred linger (the shape the first fix did cover). Both windows
   now restash identically, keyed on the release having already happened
   rather than on which side of `teardown` the burst happens to land.

## §2 Scope

Every `ended` hand-off with a completed run is covered — the three
burst-holding arms AND the no-hold closes (§1.2's (b) branch). Still out:
`fail()` closes — restated as REACHABILITY, not completedAt (the delta
pass's correction): `fail()`'s callers live in `connect()`/`program()`
paths no UI reaches from a completed session; if a completed-run path
through `fail()` is ever found, it joins §1.2(b).

## §3 The reader: slot first, storage second — and what a reload really does

`monitorModeRun` consults a one-shot module slot — AFTER its
`from=monitor` guard (`LogSession.tsx:327`), so an ordinary manual visit
never consumes it — then falls through to `loadMonitorRun()` unchanged.
The slot API is a QUARTET (amended at Task 5, forced by the
non-destructive rule below): `stashHandoffRun` / `peekHandoffRun` /
`takeHandoffRun` / `clearHandoffSlot` in `monitorRun.ts`. The reader
PEEKS first and takes only a run that passes the same gates storage
would apply (workoutId match, completedAt, steps build) — a mismatching
or gate-failing slot run is NEVER consumed-and-discarded; it stays for
its own workout's later arrival while the reader falls through to
storage. The post-unmount stash means the slot is live on ordinary
HEALTHY linger-burst closes too, which is why the workoutId check is
load-bearing, not defensive.

**The consume itself is split across a render/commit boundary (James's
first PR #230 review, P1c, Critical — not previously written up here).**
`monitorModeRun` runs inside a `useState` lazy initializer — during
RENDER, which React may repeat or abandon without ever committing — so it
only ever `peekHandoffRun`s; a separate exported `confirmSlotOwnership(run)`
claims the slot exactly once, called from `ManualDoorLog`'s own mount
EFFECT, after commit. **Amended at his SECOND review (P1-3, Critical):
`confirmSlotOwnership` compares by REFERENCE IDENTITY (`slotted === run`),
never by `startedAt`.** `startedAt` alone cannot tell "the exact revision
this screen rendered" from "a different revision of the same run" —
§1 step 7's own late-burst restash can replace the slot with a RICHER
same-`startedAt` copy in the gap between this screen's render (which
peeked the poorer one) and its own effect's commit-time confirm, and a
`startedAt` match would TAKE the richer copy out from under a screen that
is still rendering the poorer one, destroying it with nothing left to
claim it. Reference identity is exact by construction (`stashHandoffRun`
always installs a new object) and fails safe: a mismatch does nothing,
leaving the fresher revision in the slot for the next arrival, the same
non-destructive rule the eligibility gates above already apply.

**The guard at the OTHER door also reads the slot (P1-1, Critical).**
`connectGuardStage()` (`monitorRun.ts`) — the confirm `ConnectAction`
stages before a rower may start a NEW connected session at all — checks
`SessionRun` and stored `MonitorRun` but, before this review, never the
hand-off slot. A completed run can live in the slot ALONE (PROCEED
ANYWAY, or the late-burst restash) with no other carrier holding it, and
that shape used to sail past the guard with no warning at all: the very
next `"armed"` transition (§1's own acceptance point) clears the slot
unconditionally. The guard now also `peekHandoffRun()`s — a peek, never a
take, matching the reader's own non-destructive discipline above — and
stages `"unlogged"` on a hit, the same sentence the stored-`MonitorRun`
case already uses.

Slot lifecycle:
cleared on consume, on save-success (beside `clearMonitorRun`, which also
usefully clears any stale earlier-session stored record), on the
manual discard path (a discarded session's slot must not resurrect at the
next arrival), **and — added at the final review, C1, Critical — on
`createMonitorRun` itself, unconditionally, the instant a NEW session
opens.** This is the fix the traced Critical finding required: nothing
previously retired an earlier session's stash (a post-unmount burst or a
teardown-escape that was never Saved) when a later session began, so that
stash could still be sitting there, eligible for the SAME workout, once
the later session itself ended healthy and mounted — the reader's
slot-first order would then serve the OLDER session instead of the one
that just finished. `createMonitorRun` also calls `clearMonitorRun()`
unconditionally, ahead of its own save attempt, for the identical reason
one layer down: `saveMonitorRun`'s overwrite-on-success cannot reach a
create whose OWN write then fails (a quota rejection throws before
writing anything at all), so without the explicit clear a create-time
failure would leave an old, unrelated completed record in storage instead
of nothing. StrictMode: the lazy initializer runs twice and React
keeps the FIRST result, so the slot survives; the discarded second run
can write a spurious dev-only `no-run` miss into the door-miss counter —
stated here so the counter's reader is not fooled.

**The reload residual, honestly (the delta pass falsified the first
draft's version; amended again at the final review, I2):** a reload
between proceed-anyway/stash and Save lands on whatever the last
successful write left in storage — a complete or near-complete record
under a mid-session quota producer, or a `no-run` miss when the store was
denied from the session's first write. The first draft's "possibly a
STALE record from an earlier session on the same workout" residual is now
closed by C1's create-time clear above: nothing but THIS session's own
writes (or nothing at all) can occupy storage during its own life, so a
reload can no longer resurrect an unrelated earlier session's numbers.
What remains is genuinely narrower: **§1.6's own claim that "the next
`?from=monitor` arrival ... serves it" is honest only up to the moment
some OTHER session opens** — a stashed escape-hatch record is preserved
for the workout's own next arrival, not forever, and the common case
where nothing else opens a session on that workout first is exactly when
the escape hatch does its job. Rower-initiated either way, disclosed, not
mitigated here.

**The eviction false-negative, disclosed:** on an unpersisted origin
(the `storage-persist denied` phones), a green verify does not make the
record survive to a later Save — eviction is the producer this design
cannot catch, and the §5 receipts are its only instrument.

## §4 What the rower sees, and Gate 0

New copy and the ended frame's FIRST-EVER interactive elements, only in
the held-error state (every existing state renders exactly as #228
shipped). **GATE 0 APPROVED (James, 2026-08-29, "Approve" on rendered
captures, both orientations, real fixture pipeline) — these are now the
exact strings and structure:**

- Strip, on the ready-screen's `.connected-keep-on` gold warning pattern
  (gold = "look here", never "you did wrong"):
  `COULD NOT KEEP THE RECORD ON THIS PHONE.` — 5.50:1 (`--marker` on
  `--surface-sunken`), computed.
- `Retry` — `.button-l2` (outline, 52 px), first in reading order (the
  recovery story reads try-again-then-proceed). 17.11:1.
- `Log it anyway` — `.button-l1` (lead action, 56 px), second: the lead
  token because it is the path that always works. 5.94:1 (`--on-color`
  on `--accent`).
- Headline stays `Wrapping up`; focus order is document order; the tab
  bar is hidden on this surface (existing rule), so the controls coexist
  with nothing.

House rules bind (no em-dashes, never "PM5"). The frame's renders are the
Gate 0 artifact of 2026-08-29; the implementation must match them.

## §5 Receipts — every one through the RING, none through the failing store

`release-save` (verdict + attempt ordinal), `summary-folded-in-memory`,
`hold-error-entered` / `-retry` / `-proceed`, `handoff-stashed` (reason:
proceed / teardown-escape / post-unmount-burst / without-series /
superseded), `handoff-released` (reason: teardown / final-boundary /
burst-heard / burst-timeout / backstop / **retry-heal / proceed, added at
the final review, M2, Minor** — every way the hand-off ends now logs
through the SAME funnel receipt, not just the ordinary release paths).
**`hold-error-entered` fires at most once per hold (M1, Minor, final
review):** a `retryHandoffSave()` that fails again re-logs `hold-error-retry`
(spec's own "each attempt gets a receipt"), never a second `-entered` for
a hold already open. All via `logRef.record` — the ring reaches the
operator through the sessionStorage stash fallback even when localStorage
is the thing failing. Deliberately NOT `recordLogDoorMiss`: it writes
through `localStorage.setItem` and under this spec's denial it records
nothing — a receipt through the failing subsystem is decoration (RF21).

## §6 The gate

Extends `summaryHoldReplay.test.ts` (RF24 chain intact: real bytes →
driver → hook → storage → fresh `LogSession` mount → POST). TWO stub
shapes, because the design behaves differently under each and the first
draft's single late stub proved only plumbing (delta pass: with
create/actual/close/append all green, storage held a complete record and
the leg's own claim was false by construction; the audit's prescription
was always "rejected writes at OPEN, boundary, retry, and close"):

- **Leg A — denied from the FIRST write** (the kill's shape): assert the
  burst declines against empty storage AND `runRef` gains the machine
  numbers via the in-memory fold; the hand-off enters held-error; RETRY
  under the stub stays held with its receipt; PROCEED ANYWAY mounts the
  reader from the slot and the POST carries `machineWorkSeconds` /
  `machineWorkMeters` / verification bytes with storage still empty —
  the assertion the first draft could not construct.
- **Leg B — fails from the release-verify only** (mid-session quota
  shape): earlier writes green, held-error entered, un-stub + RETRY heals
  and releases; and the reload assertion is the HONEST one — the stored
  (pre-verify, in this shape complete) record renders, no `no-run` miss.
- **No-hold arm:** a link-lost End close (leg B's stub) must also enter
  held-error — the §1.2(b) branch's own leg.
- Unit tests: the four-exit verdict mapping, the no-record skip, slot
  consume-once/supersede/clear-on-discard, the fold's at-most-once.

**Mutations (RF21 + #228's two lessons), each per RF22:** (a) release
ignores the verdict — leg A/B assertion 1 fails; (b) remove the in-memory
fold — leg A's machine-columns assertion fails; (c) ABOVE the seam: a
parent forging `holdError: null` into the surface — the component/e2e
gate fails; (d) break the slot's one-shot — unit test fails; (e) copy
pinned with literals, not imported constants.

## §7 Out of scope, stated

- Reading the door-miss counter's aggregate (Wave B) — and note §5 sends
  nothing new through it.
- AUD-011/015 (chunk 3, own Gate 0).
- `fail()` closes (§2's reachability reasoning).
- Reload-safety of the slot and the eviction producer (§3's two disclosed
  residuals).
- Quota management beyond the existing series sacrifice.
- `loadMonitorRun`'s `getItem` sitting outside its own try
  (`monitorRun.ts:498`) — hardening debt the delta pass noted and
  deliberately did not promote (no supported producer found; the same
  reasoning that downgraded AUD-020). §3's slot-before-storage ordering
  already shields the new path. The same disposition covers
  `createMonitorRun`'s session-open clears (final-review fix C1): they
  are bare `removeItem` calls, unguarded like the codebase's nine other
  `removeItem` sites — an exotic denial mode that made `removeItem`
  throw would propagate, a pre-existing class this PR neither introduced
  nor widened, left unguarded on the AUD-020 reasoning.

## Process

Delta pass RAN 2026-08-29 (verdict REVISE — one kill, one scope kill,
four falsified claims — all folded above; ledger entry rides this PR,
plus a correction note to the PM ledger's zero-readers claim). Gate 0
APPROVED same day on rendered captures (§4 carries the approved strings).
Next: plan → implementation in this worktree, failing legs first (§6's
two stub shapes) → PM final-PR gate (TRIAD seam).

**Final-review fix wave (2026-08-30):** a whole-branch review of Tasks
3/5/6's implementation found one Critical (C1: a stale slot entry beating
a fresher stored record — fixed by `createMonitorRun` retiring both hand-
off carriers unconditionally at session-open), two Important findings
(I1: the fold's `loadMonitorRun() === null` gate reads a genuine identity
mismatch the same as empty storage — resolved by relying on C1's own
invariant rather than teaching the gate to call `stillLive`; I2: §1.6's
escape-hatch claim overstated how a rower reaches the next `?from=monitor`
arrival under a denied-from-open close, where Today's own door never
renders), and three Minors (M1: `hold-error-entered` deduplicated to the
hold's first entry; M2: `handoff-released` now fires on the retry-heal and
proceed exits too; M3: a stale line-number citation replaced with a
function-name one). All folded into §1/§3/§5 above. The full account —
gates, mutation runs, per-fix evidence — lives in PR #230's Record block
(the SDD workspace that first held it is git-excluded and dies with the
worktree; a pointer there would be a dangling citation, RF16's
corollary).

**James's first PR #230 review (P1a/P1b/P1c/P2a/P2b, 2026-08-30):** five
findings — P1a (Critical, the `"armed"` clear moved from `createMonitorRun`
to the event handler itself), P1b (Important, the late-burst restash
mechanism, RULED restash-only), P1c (Critical, the reader's peek/take split
via `confirmSlotOwnership`), P2a (Important, the real recovery composition
test), P2b (docs, the ROADMAP note count) — were fixed and gated but never
folded into this document at the time; that gap is corrected retroactively
by this same paragraph and by the mechanism descriptions §1 step 7 and §3
now carry, since James's SECOND review (immediately below) builds directly
on them.

**James's SECOND PR #230 review (P1-1/P1-2/P1-3, 2026-08-30):** three
further Critical findings, each a race the first round's own fixes opened.
P1-1: `connectGuardStage()` missed the hand-off slot as a carrier, so a
slot-only unlogged run got no Connect warning before the next `"armed"`
clear destroyed it — fixed by peeking the slot too (§3). P1-2: the
late-burst restash (§1 step 7) only fired inside `teardown`'s own
post-unmount linger, missing the equally real window between a release and
the navigation-triggered unmount that eventually reaches `teardown` at
all — fixed by keying the restash on "already released"
(`!handoffHeld`), not on which side of `teardown` the burst lands. P1-3:
`confirmSlotOwnership` matched by `startedAt`, which cannot tell a
render-time revision from a richer same-identity one P1-2's own restash
installs before the mount effect commits — fixed by reference-identity
CAS (§3). All three closed with failing-first tests reproducing his own
probes; full account in the SDD workspace's `task-6-report.md` (git-
excluded, dies with the worktree — the same RF16 corollary the paragraph
above already names).
