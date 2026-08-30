# The hand-off store: one authority for the connected record — protocol design (rev 3, pre-approval)

**What and why.** The logical connected workout lives in four carriers —
the hook's `runRef`, localStorage, a module slot, and the log form's
mount snapshot — and no component knows the full set. Six ownership races
in two James reviews shared one shape: a destructive or productive
transition consulting a private subset of the carriers. This design
replaces the carrier conventions with a PROTOCOL: one store, one
CAS-disciplined write path, one read path, revisioned entries, claim
tokens that retain what was rendered, key-bound destructive
authorization, and a self-contained gate. It implements the ratified
product contract (PM ruling 2026-08-30, RATIFIED): **renders snapshot;
destructive actions re-read; recording actions post what was shown** —
binding save-bearing forms only.

Rev 3 resolves James's design gate on `04e8a515` (all eight items;
§ references below). Rev 2 folded the anchor antagonist pass (one proven
current-code defect, §3; eight destroyers; cached verdicts; invariant 4
rewording). Baselines, named per gate item 6: **carrier facts describe
#230's head `04e8a515`**, whose substrate this design deletes;
**implementation starts from then-current `main`** (§11).

**Two structural facts anchor the design (antagonist-held):**

1. React runs the new route's render BEFORE the old subtree's passive
   unmount (`LogSession.tsx:226-228`, verbatim comment), and the old
   subtree's cleanup before the new subtree's mount effects. Any
   protection written "at teardown" can be too late for the reader's
   peek; a memory tier current BEFORE teardown is always visible to the
   claim. So the memory copy is current by construction — written on
   every accepted producer update — never an emergency slot.
2. With that, the stash vocabulary collapses. Every ordering INSIDE the
   burst delivery window takes one matrix row; the window itself is
   bounded by the producer's subscription life (`BURST_LINGER_MS`) and
   is residual §9.1 — bounded, not abolished.

## §1 The store

One module (`handoffStore`) owns BOTH persistence tiers of the connected
record. Nothing else writes `MONITOR_RUN_KEY` or holds a module-level
run.

- **Entry:** `{ sessionKey, revision, run }` — `sessionKey` =
  `startedAt`; `revision` = a per-key monotonic counter owned by the
  store; entries are immutable objects (a new revision is a new object;
  reference identity implements revision identity). **The store retains
  exactly ONE current entry per key** — `revision` is a counter, not a
  log (the series field is a copied array up to 14,400 samples; retained
  history would be ~10⁶ live objects on an hour's session). The claim
  token (§6) may additionally retain ONE older entry per claimed key —
  bounded, and released with the claim.

- **`commit(sessionKey, expectedRevision, next)` — expected-revision
  CAS** (gate item 2). A caller states the revision its `next` was
  derived from. Returns a discriminated result:
  - `{ accepted: true, revision, verdict }` — the store bumped the
    revision, wrote the memory tier, attempted the durable tier
    (verdict `"saved" | "saved-without-series" | "failed"`, the existing
    four-exit mapping), and cached the verdict (§7).
  - `{ accepted: false, reason: "stale", current }` — `expectedRevision`
    is not the current revision: a stale caller cannot silently
    overwrite the newest copy. The caller re-derives from `current` (or
    drops, per its own gate) — never blind-retries.
  - `{ accepted: false, reason: "retired" }` — the key is tombstoned
    (§5). **A refusal bumps nothing: not the revision, not the cached
    verdict, not `runRef`** — refusals are receipted, side-effect-free
    reads of the door.
  `commit` is a persistence primitive; every existing WRITER GATE stays
  where it is (`appendSummaryObservations`' four declines,
  `recordActual`'s immutability + finish-grace vouch,
  `completeMonitorRun`'s idempotence, the F1 fold's eligibility mirror)
  — policy above, persistence below. In the hook, the single producer
  loop makes `expectedRevision` bookkeeping one local variable
  (`runRef` and the last accepted revision travel together).

- **`read(sessionKey)`** returns the current entry for THAT key under
  §8's precedence rules. **`candidates()`** returns every unretired
  entry across both tiers (used by guards; cross-key states are
  REPORTED, never ranked — §5).

- **`retire(keys: {sessionKey, revision}[], reason)`** is the only
  destructive operation, and it is KEY- AND REVISION-BOUND (gate
  item 3): the caller passes the exact set its authorization covered.
  The store compares against its current state; **an unexpected set —
  any new key, or a claimed-set revision now superseded where the
  authorization was rower-facing — REJECTS with
  `{retired: false, reason: "set-changed", current}`**, and the caller
  re-prompts (Replace/Start doors) or re-derives (internal callers).
  One receipt PER retired entry: key, revision, claim state (§6). A
  retire that finds nothing emits nothing. **There is no
  `retire("all")`** — every §5 caller names its set from a
  `candidates()` read that its own confirmation covered.

- **Tombstones.** `retire` leaves a process-scoped tombstone per retired
  key. A post-retire `commit` for a tombstoned key returns
  `{accepted:false, reason:"retired"}` with a receipt. **A failed
  durable removal is MASKED by the tombstone** (gate item 4): the stale
  durable entry cannot reappear through `read`/`candidates` for the life
  of the process; after reload the tombstone is gone and the stale entry
  serves — the disclosed §9.6 residual, now with a stated boundary.

## §2 What each old carrier becomes

| old carrier (#230 head) | becomes |
| --- | --- |
| `runRef` | unchanged — the producer's working copy; every accepted update flows `runRef → commit(key, expectedRev, next)` |
| stored `MonitorRun` | the durable tier (same key, same stored shape, NO revision persisted — §8; no migration; `isMonitorRun`'s positive conjunction tolerates) |
| module slot + five stash sites | deleted — the memory tier is current by construction |
| `stillLive` | deleted — replaced by store reads (§3) |
| mount snapshot | unchanged — the consumer's claim (ratified contract), now token-backed (§6) |

## §3 The store fixes a PROVEN defect in current code, out loud

`recordActual`'s late branch rebuilds from `stillLive(startedAt)`
(`monitorRun.ts:1019-1021` at `04e8a515`), which matches on `startedAt`
ALONE. When the close write failed (swallowed), storage holds the last
SUCCESSFUL write — a stale LIVE copy — and the finish-grace boundary
spreads it as the base: `completedAt: null`, `endedBy` gone, RC-1 sums
gone, only the actuals the last successful write contained (antagonist
probe: 3 in-memory actuals → 1, real compiled program). The hook assigns
it to `runRef.current`; Proceed stashes an OPEN record; the reader's
`completedAt` gate bounces it to the manual door — AUD-016's escape
hatch defeated on its own path. Neither shipped gate leg can see it:
leg A leaves storage empty (refuses correctly), leg B leaves it closed
(base correct); the defect lives BETWEEN them — storage that ACCEPTED
writes and then stopped.

Under this design the late boundary's base is `read(sessionKey)` —
under a mid-run denial the memory tier IS the newest, so the base is the
caller's own current record, never storage's stale one. §10 row 8 is the
permanent gate, and its fault injection targets **the live→closed
WRITE** (deny the write whose payload carries `completedAt` non-null for
this key — a payload-inspecting stub, not a write count; gate item 7).

## §4 The seven invariants

1. **Until Save, Discard, or a confirmed Replace, at least one
   recoverable copy exists** — memory tier from first write to retire;
   durable best-effort. Residual §9.2.
2. **A destructive transition inspects every carrier it can destroy** —
   only `retire` destroys; it owns both tiers; every destroyer routes
   through it with a key/revision-bound set (§5).
3. **A consumer owns an exact revision** — claim tokens (§6).
4. **Every accepted producer update after release either reaches the
   current consumer, or remains recoverable until that consumer acts,
   and any loss at that action is COUNTED.**
5. **Carrier precedence is explicit and WITHIN-KEY (§8)** — cross-key
   states are reported, never ranked.
6. **The UI never saves numbers it did not represent** — the consumer
   posts its claim token's entry (§6); no path injects a later revision
   into a mounted form.
7. **Accepted residuals are named precisely (§9)** — none disguised as
   recovery.

## §5 Destroyers and guards: the census, baseline-scoped

Counted at `04e8a515` (the #230 head whose substrate is deleted); the
implementation re-runs this census against its own base `main` before
coding (§11). All destroyers route through `retire` with a named set:

| site (at 04e8a515) | retire set | authorization |
| --- | --- | --- |
| armed acceptance (`useMonitorSession.ts:2675-2676`) | the `candidates()` set STAGED AT THE GUARD (key+revision), passed through Connect → program → armed | `connectGuardStage` reads `candidates()`; the Replace confirmation names each staged entry; an armed-time set mismatch REJECTS and re-prompts (closes the guard-to-armed TOCTOU — gate item 3) |
| `createMonitorRun` defense (`monitorRun.ts:767-768`) | narrowed: retires only entries whose keys were staged at the guard; a NEW key appearing between armed and first pull is left standing and receipted (`create-defense-unexpected`) — not silently destroyed | inherited from the armed set |
| save-success (`LogSession.tsx:1724-1725`) | the claim token's `{key, revision}` (§6) | the rower's Save |
| monitor discard (`LogSession.tsx:2000-2001`) | the claim token's key (M+D) | two-tap arm |
| manual-door discard (`LogSession.tsx:2212`) | **same key in both tiers → retire M+D; different keys → retire D only, M preserved AND NOT tombstoned** (gate item 4 — a tombstone here would make M permanently unwritable while alive; M's key was never authorized for destruction) | two-tap arm + fresh `candidates()` read |
| `Today.tsx:627` discard door | D's key (its confirm covers the stored record) | Today's confirm, reading `candidates()` |
| `WorkoutDetail.tsx:298` row-instead | D's key | its confirm, reading `candidates()` |
| `useStartWorkout.ts:99` confirmReplace | the staged set — **the Start door's guard reads only the durable tier today (`useStartWorkout.ts:118-135`), the P1-1 hole at a second door**; it reads `candidates()` under this design | Start's Replace confirm, naming each staged entry |

**Out of Entry retirement, stated narrowly (gate item 6):**
`loadMonitorRun`'s malformed-record self-clear (`monitorRun.ts:541-545`,
"Resilience #5") destroys bytes that never formed an Entry — no key, no
revision, nothing a guard could stage; it remains a loader concern, with
its receipt. The pre-reset slot `take` sites are #230-substrate facts
and die with it.

**Cross-key guard copy:** when `candidates()` reports entries for more
than one session, the Replace confirmation must name each ("You have 2
unlogged sessions…"). **This is new rower-facing copy: it carries a
rendered Gate-0 artifact before this design is approved for
implementation** (gate item 7; James approves the rendered thing).

## §6 Claims: a token that retains what was rendered

The gate's item 1 killed rev 2's claim shape — render holds R0, the old
tree's cleanup can publish R1 before the mount effect, the store retains
only R1, and a CAS claim of R0 then fails with the screen already
showing R0. The claim therefore RETAINS, not references:

- **Render** peeks (`read`, no side effects) and captures the ENTRY —
  the immutable R0 object — into the snapshot (unchanged behavior; the
  snapshot already holds the object).
- **The commit effect claims:** `claim(sessionKey, entry)` registers the
  token `{sessionKey, renderedEntry, renderedRevision}` — **the token
  retains the rendered entry itself, independent of the store's current
  entry**. Claiming never compares against the current revision and
  cannot fail: a richer R1 in the store stays the store's current entry;
  the token holds R0. StrictMode double-claim is idempotent by value.
- **Save** posts the TOKEN's entry (invariant 6 — the screen's own
  numbers, structurally). Save-success retires the token's key: the
  retire receipt compares `renderedRevision` against the store's current
  revision and a mismatch emits `handoff-dropped reason=richer-at-save`
  with both revisions (ratified condition 1).
- **Claim states per key: unclaimed → claimed → consumed.** The abandon
  path (claimed, unmount without Save) leaves CLAIMED; any later retire
  counts non-consumed entries as drops. `unclaim` happens implicitly:
  tokens are per-mount; a new claim for the key replaces the token; a
  retire releases it.

## §7 Verdicts, the hand-off, and no auto-heal

`commit` caches the durable verdict per key; **the release funnel reads
the CACHED verdict — the LAST accepted commit's, not the close
commit's** (up to two durable writes land between close and release: the
finish-grace boundary and the burst append; a close-time verdict is
stale by release time and could release green over a durable copy
missing the final interval). The verify's second serialize is deleted
for THIS reason. Retry re-attempts the durable write of the current
memory entry. A refused commit never touches the cached verdict (§1).

**No auto-heal (ruled):** a later commit succeeding while held-in-error
does not exit the held-error frame — the Gate-0 frame has two controls
and no auto-exit; a screen changing under the rower is the mid-edit
surprise the contract rejects. The heal is receipted; the rower's Retry
then succeeds instantly.

## §8 Revision precedence, fully specified (gate item 5)

- **No revision is persisted.** Safe because producers die with the
  page: no in-memory revision can outlive the durable copy it derives
  from. The one post-reload writer of an existing key
  (`completeInterruptedRun`, `Today.tsx:638` at `04e8a515`) derives FROM
  the durable copy — monotone.
- **Process hydration baseline:** at first store access in a process, a
  durable entry hydrates as `revision 0` for its key; the per-key
  counter starts above it.
- **Tracked durable revision:** the store records, per key, the revision
  of the last SUCCESSFUL durable write (`durableRevision ≤ revision`).
  A failed durable attempt leaves `durableRevision` unchanged — the
  durable tier is known-stale by exactly `revision − durableRevision`
  accepted updates, which is what the receipts report.
- **`read(key)`:** the memory entry when present (it is by construction
  ≥ any durable copy for that key in this process); the hydrated durable
  entry otherwise. **Equal revisions: memory wins** (same object in
  practice; stated for completeness).
- **Reload:** memory and tombstones are gone; the durable tier serves at
  hydration baseline. Under a durable-failure session this is §9.2's
  loss; under a §1 masked-removal it is §9.6's resurrection window.
- **Cross-key:** `read` is per-key only; `candidates()` reports all
  keys; no cross-key ranking exists anywhere in the protocol.

## §9 Accepted residuals, named

1. **The delivery window is bounded, not abolished** — a burst after
   `BURST_LINGER_MS`/disconnect never reaches `commit`. Tier-B row,
   counted. Corpus: n=10 web/foreground 271–542 ms; native unmeasured;
   PM condition 2 gates reopening on hardware counts.
2. **Reload during a durable-tier failure loses the session** — memory
   is process-scoped; counted via the `no-run` door miss.
3. **Eviction** — a green durable write may not survive; receipts are
   the only instrument.
4. **Richer-at-save drop** — counted (`handoff-dropped
   reason=richer-at-save`), per the ratified conditions.
5. **Second-tab staleness** — a stale same-tab memory copy outranks a
   second tab's fresher durable write for the same key; single-tab is
   the codebase's stated assumption, now a named residual.
6. **Masked durable removal** — a throwing `removeItem` leaves a durable
   entry hidden by the process tombstone; it resurrects only after
   reload (stated boundary), receipted at the failed removal.
7. **Abandoned claims** — counted at the next retire as
   claimed-not-consumed drops.

## §10 The gate (self-contained; RF24-shaped; mutations of invariants)

All rows start above the producer (replay harness over real capture
bytes, virtual clock, injected schedule; payload-inspecting storage
stubs — deny by CONTENT, e.g. "the first write whose payload carries
`completedAt` non-null", never by count alone).

1. **Guard sees what acceptance destroys.** Unretired entries
   (memory-only / durable-only / both / TWO KEYS) → Connect and Start
   both stage Replace naming each entry; armed retires exactly the
   staged set with per-entry receipts. Mutations: guard reads one tier →
   fails; armed retires a key not staged (set-mismatch path disabled) →
   fails.
2. **Producer update after release, four orderings** (before/after
   navigation × before/after teardown) — all reach `commit`; the
   consumer's token is unaffected; receipts show the accepted revisions.
   Mutation: gate the post-release commit on any window predicate →
   the excluded ordering fails.
3. **The claim race, exactly** (gate item 1): R0 render → R1 commit
   (old tree's late fold) → R0 claim (token retains R0) → Save → POST
   carries R0's numbers → retire receipts `richer-at-save` with
   {R0, R1}. Mutations: token references instead of retains (claim
   compares current revision) → fails at claim; POST reads the store
   instead of the token → the screen==save assertion fails.
4. **Stale-commit refusal:** a caller committing with a stale
   `expectedRevision` is refused, bumps nothing, receipt present; the
   newest entry survives. Mutation: accept stale commits → the
   last-write-wins assertion fails.
5. **Tombstone:** post-retire commit refused with receipt; a masked
   failed removal keeps the durable entry invisible for the process and
   serves it after simulated reload (residual asserted as itself).
   Mutations: refusal bumps the revision → fails; tombstone not
   consulted by `read` → fails.
6. **Manual discard, both cases** (gate item 4): same key → M+D
   retired; different keys → D retired, M alive, NOT tombstoned,
   `candidates()` still reports it, Connect stages it. Mutation:
   tombstone the preserved key → fails.
7. **The four storage shapes** (denied-from-open / denied-at-close /
   healed-on-Retry / saved-without-series) over real bytes — held-error,
   Retry, Proceed behaviors as shipped; cached-verdict currency asserted
   (the release reads the LAST commit's verdict — deny the
   boundary-write only and the release must hold).
8. **The §3 defect row:** mid-run denial landed on the live→closed
   write by payload inspection, then the finish-grace boundary → the
   record stays closed, all actuals kept, Proceed carries a COMPLETE
   record to the reader and the POST carries the measured work. Red
   against `04e8a515`'s code by construction.
9. **Reload residuals** asserted as residuals (durable serves;
   denied+reload = counted loss).
10. **Abandon path:** claim, unmount without saving, next acceptance →
    per-entry receipt counts claimed-not-consumed.
11. **Invariant mutations, each with its named detector:** break
    monotonicity (reuse a revision) → the receipt-sequence assertion
    fails; mutate an entry in place → **the token/claim comparison**
    fails (the only consumer holding an old reference); reorder tier
    precedence → row 8 fails; drop a receipt kind → its named row
    fails.
12. **The binding route gate:** `WorkoutDetail.connectedRecovery.test.tsx`
    restored AS A FILE and retargeted — real WorkoutDetail → interstitial
    → hook → fake transport → held-error button → reader → POST machine
    fields. Store-level rows never substitute for it. Memory-currency
    assertions are internal-consistency checks (RF11's mirror rule) —
    invariant tests, never evidence about the record.

**Exit criteria (self-contained):** every §10 row implemented and green
on the fresh branch; every named mutation run per RF22 with recorded
failure text; the §5 cross-key Replace copy Gate-0 approved as a
rendered artifact; per-file coverage on every store-touching file (RF2);
`pnpm e2e` green; the §3 defect row red-then-green demonstrated against
the old substrate's behavior (documented in the PR); receipts vocabulary
documented in the normative spec.

## §11 The branch reset, auditable (gate item 8)

- **PR #230 CLOSES UNMERGED** on this design's approval; its branch is
  preserved as the record (pushed through `04e8a515`).
- **Implementation starts from then-current `main`** on a fresh branch;
  the §5 census re-runs against that base before coding.
- **No rebase or cherry-pick of the coupled substrate.** Restored
  VERBATIM (file-level, zero coupling, per the PM's measured table):
  `WorkoutDetail.connectedRecovery.test.tsx`, `ConnectedSurface.tsx`,
  `ConnectedSurface.test.tsx`, `ConnectedSurface.screens.test.tsx`,
  `ConnectedInterstitial.test.tsx`, the `connected-ended-error` fixture +
  screenshots-loop entry, `WorkoutDetail.test.tsx`,
  `ConnectionLogSheet.test.tsx`, `PaneGrid.test.tsx`, and the two
  committed `connected-ended-error{,-landscape}.png` captures.
  REWRITTEN against the store (the requirements checklist, not source):
  `monitorRun.ts`, `useMonitorSession.ts`, `LogSession.tsx`, `Today.tsx`,
  `WorkoutDetail.tsx`, `useStartWorkout.ts`, `summaryHoldReplay.test.ts`,
  `monitorRun.test.ts`, `useMonitorSession.test.ts`, `LogSession.test.tsx`,
  `ConnectAction.test.tsx`.
- **The Gate-0 UI does not ship unreachable:** the held-error frame lands
  in the same PR as its producer (the store + verify), never ahead of it.
- The 2026-08-29 plan document stays off `main` (a plan instructing an
  implementer to build the deleted substrate).

## Process

Maps: done. Anchor antagonist pass: folded (rev 2). James's design gate
on `04e8a515`: folded (this rev). NEXT, per his instruction: re-run the
antagonist gate (delta: attack §1's CAS/commit shape, §5's set-bound
retire, §6's retaining token, §8's precedence table, §10's
buildability) and the PM gate (the cross-key Replace copy's product
shape; the census's product cost), resolve, render the §5 Gate-0
artifact, then present for James's explicit approval. No production code
before approval.
