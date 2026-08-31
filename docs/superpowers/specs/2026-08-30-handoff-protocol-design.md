# The hand-off store: one authority for the connected record — protocol design (rev 4, for approval)

**What and why.** The logical connected workout lives in four carriers —
the hook's `runRef`, localStorage, a module slot, and the log form's
mount snapshot — and no component knows the full set. Six ownership races
in two James reviews shared one shape: a destructive or productive
transition consulting a private subset of the carriers. This design
replaces the carrier conventions with a PROTOCOL: one store, one named
committer, revisioned immutable entries, a claim receipt discipline,
key-bound destructive authorization, and a self-contained gate. It
implements the ratified product contract (PM ruling 2026-08-30,
RATIFIED): **renders snapshot; destructive actions re-read; recording
actions post what was shown** — binding save-bearing forms only.

Rev 4 resolves James's design gate (8 items), the anchor antagonist pass
(rev 2), and the rev-3 delta antagonist + PM gates. The two rev-3 gates
CONVERGED independently on the largest change: **no production sequence
can reach a two-key state** (PM: the census was counted at the deleted
substrate; antagonist: enumeration of every entry creator finds the
guard→armed retire always precedes a second key), so the cross-key
Replace copy, its Gate-0 artifact, and two gate rows are DELETED and
replaced by a store invariant. **No Gate-0 render is owed by this
design: no rower-visible copy or layout changes** — the guard panels
keep their shipped strings, the held-error frame was Gate-0 approved at
`91a46ffe` and is restored verbatim, and Today's unlogged row changes
only in reachability. Stated aloud per RC-24's lesson, not left implied.

Baselines: carrier facts were censused at #230's head (`04e8a515`);
**the §3 defect is PROVEN ON `main`** (`origin/main:monitorRun.ts:832`);
implementation starts from then-current `main` (§11).

**Two structural facts anchor the design (antagonist-held):**

1. React runs the new route's render BEFORE the old subtree's passive
   unmount (`LogSession.tsx:226-228`), and the old subtree's cleanup
   before the new subtree's mount effects. Teardown-time protection can
   be too late for the reader's peek; a memory tier current BEFORE
   teardown is always visible to the claim. So the memory copy is
   current by construction — written on every accepted producer update.
2. With that, the stash vocabulary collapses. Every ordering inside the
   burst delivery window takes one matrix row; the window is bounded by
   the producer's subscription life (`BURST_LINGER_MS`) — residual §9.1.

## §1 The store

One module (`handoffStore`) owns BOTH persistence tiers. Nothing else
writes `MONITOR_RUN_KEY` or holds a module-level run.

- **Entry:** `{ sessionKey, revision, run }` — `sessionKey` =
  `startedAt`; `revision` = a monotonic counter owned by the store;
  entries immutable (a new revision is a new object; reference identity
  implements revision identity). One current entry retained; `revision`
  is a counter, not a log.
- **AT MOST ONE UNRETIRED SESSION (new store invariant).** The durable
  tier is a single localStorage key — the substrate cannot be more
  granular than the key it persists through (delta pass) — and no
  production sequence creates a second unretired entry: entries are
  created only by `commit`, only the hook produces, and every acceptance
  path runs the guard→armed retire first. The store ENFORCES it: a
  create-commit while an unretired entry exists for a DIFFERENT key is
  refused with a receipt (`store-second-key-refused`) — the counted
  impossible, not silent coexistence. All cross-key machinery (plural
  Replace copy, per-key candidate ranking, different-key discard
  branches) is deleted on this invariant.
- **`commit(sessionKey, expectedRevision, next)`** — expected-revision
  CAS. `expectedRevision: null` means "expect absent" (the create case).
  Returns `{accepted:true, revision, verdict}` (memory written; durable
  attempted; verdict `"saved"|"saved-without-series"|"failed"` cached
  per §7) or `{accepted:false, reason:"stale"|"retired"|"second-key",
  current?}`. **A refusal bumps nothing** — not revision, not the cached
  verdict — and is receipted.
- **The committer is NAMED (delta pass kill):** the HOOK is the sole
  production caller of `commit`. The writer gates (`recordActual`,
  `completeMonitorRun`, `appendSummaryObservations`, the fold) become
  PURE — they return `next` (or the same reference on decline) and never
  persist. The hook holds `lastAcceptedRevisionRef` (a ref — it must
  survive across driver callbacks) and applies the discipline: commit
  accepted → assign `runRef` and update the ref; refused → `runRef`
  UNCHANGED, receipt only. A refusal can therefore never diverge
  producer from store — the RF25 shape the unnamed-caller draft rebuilt.
  **One named exception (ruled at Task 4's review, 2026-08-30): Today's
  interrupted-session close (`handleLogIt`) is a SECOND committer.** Its
  discipline, stated: it commits a CLOSE for a DEAD session — the
  single-unretired invariant means no hook can hold that key, so there
  is no `lastAcceptedRevisionRef` to diverge from; `expectedRevision`
  comes from the mount snapshot; a refusal is receipted
  (`commit-refused`) and degrades to the log door's own counted miss.
  **A THIRD EXCEPTION, homed here at the final fix round (2026-08-30,
  controller ruling, after the antagonist proved it undocumented and
  unpinned in either direction): the CREATE path assigns `runRef`
  unconditionally, refusal included** (`useMonitorSession.ts`'s
  `createMonitorRun` commit). Its discipline, stated: a create is
  `expectedRevision: null` and SEEDS `lastAcceptedRevisionRef` rather
  than reading it, so on refusal (a tombstoned key, or a second key
  against §1's invariant) the ref stays `null` while `runRef` holds the
  new run — the one place in this design where producer and store may
  legally disagree. It is bounded to the create-refusal path and it is
  deliberate: the alternative (no `runRef`) is a rowing session with no
  in-memory record at all, a strictly worse loss than a session whose
  UI works while its store entry does not exist. The divergence is
  receipted at the refusal and surfaces at release as
  `verifyHandoffWritable`'s `cachedVerdict === undefined` branch, which
  releases rather than holding (nothing is open to hold a write FOR).
  Reachability is near-zero: it needs a full reconnect to a tombstoned
  key inside the tombstone's process life. No FOURTH committer or
  exception exists; any new one needs its discipline written here
  first.
- **`retryDurable(sessionKey)` (delta pass kill):** Retry's primitive.
  Re-attempts the durable write of the CURRENT memory entry; updates
  `durableRevision` and the cached verdict; **never bumps `revision`** —
  modeling Retry as `commit` would stale the hook's own ref and refuse
  the next producer commit (the late burst: the design's headline case,
  lost by its own retry button).
- **`read(sessionKey?)`** returns the current entry (§8 precedence);
  **`currentUnretired()`** serves the guards. Hydration and the
  malformed-bytes rule are §8's (never during render).
- **`retire(set: {sessionKey, revision}[], reason)`** — the only
  destructive operation; one receipt per retired entry (key, revision,
  claim state §6); nothing found → nothing emitted. **Authorization is
  KEY-BOUND at every door that shows only existence** ("You have an
  unlogged session" names no figure — PM ruling: revision-bind only
  where the rower was shown NUMBERS). A revision superseded between a
  guard's stage and its retire does NOT reject: the retire proceeds and
  the receipt records the superseded revision. Rejection exists for
  exactly one mismatch: a NEW KEY in the store that the authorization
  never staged — which §1's single-session invariant makes a
  receipted-impossible, so no re-prompt surface is designed (the rev-3
  re-prompt is deleted; it had no UI home and its one producer needed a
  full reconnect inside 2 s).
  **Save-success is the consumer's own retire and is EXEMPT from
  rejection by construction** (the §1-vs-§6 contradiction the delta pass
  caught): it retires the claimed key; a richer store revision at that
  moment proceeds and emits `handoff-dropped reason=richer-at-save` with
  both revisions (ratified condition 1).
- **Tombstones.** Process-scoped, per retired key. A post-retire commit
  is refused (`reason:"retired"`) with a receipt — its plausible
  producer is the dead hook's late burst racing a fast reconnect.
  A failed durable removal is masked by the tombstone for the process.
  **WHATWG PRIMARY (delta pass): `removeItem` carries NO throw
  condition; `setItem` throws `QuotaExceededError`; the `localStorage`
  GETTER throws `SecurityError` (failing every access)** — so the
  throwing-removal residual is retired as a live risk; the tombstone
  earns its keep on the retired-refusal, and the GETTER is the real
  hazard the store's accessor wraps (§8, absorbing AUD-011's
  `loadMonitorRun` loader on day one).

## §2 What each old carrier becomes

| old carrier | becomes |
| --- | --- |
| `runRef` | unchanged — the producer's working copy; accepted updates flow `runRef → commit` via the hook, the sole committer |
| stored `MonitorRun` | the durable tier (same key, same shape, no revision persisted — §8; no migration) |
| module slot + five stash sites | deleted — the memory tier is current by construction |
| `stillLive` | deleted — replaced by store reads (§3) |
| mount snapshot | unchanged — the consumer's claim; **Save posts the SNAPSHOT** (§6) |

## §3 The store fixes a PROVEN defect on `main`, out loud

`recordActual`'s late branch rebuilds from `stillLive(startedAt)`
(`origin/main:monitorRun.ts:832-834`), which matches on `startedAt`
alone. When the close write failed (swallowed), storage holds the last
successful write — a stale LIVE copy — and the finish-grace boundary
spreads it as the base: `completedAt: null`, `endedBy` gone, sums gone,
actuals truncated (antagonist probe: 3 in-memory actuals → 1). The
record re-opens in `runRef`; the reader's `completedAt` gate bounces the
session to the manual door. Neither existing gate leg can see it — the
defect lives between their two stub shapes (storage that ACCEPTED writes
and then stopped).

Under this design the late boundary's base is `read(sessionKey)` — under
a mid-run denial the memory tier is the newest, so the base is the
caller's own current record. §10 row 8 is the permanent gate; its fault
injection targets the live→closed WRITE by payload inspection (deny the
first write whose payload carries `completedAt` non-null — the existing
spy already receives the serialized value), red against `main`'s
`recordActual` before the rewrite, demonstrable on the fresh branch's
first commit.

## §4 The seven invariants

1. Until Save, Discard, or a confirmed Replace, at least one recoverable
   copy exists (memory from first write to retire; durable best-effort;
   residual §9.2).
2. A destructive transition inspects every carrier it can destroy — only
   `retire` destroys; every destroyer routes through it with a key-bound
   set (§5).
3. A consumer owns an exact revision — the snapshot retains the entry;
   the claim records `{key, renderedRevision}` (§6).
4. Every accepted producer update after release either reaches the
   current consumer, or remains recoverable until that consumer acts,
   and any loss at that action is COUNTED.
5. Carrier precedence is explicit and within-key (§8); the store holds
   at most one unretired session (§1).
6. The UI never saves numbers it did not represent — Save posts the
   component's own snapshot; the claim supplies the receipt comparison.
7. Accepted residuals are named precisely (§9).

## §5 Destroyers and guards: the census, corrected

Censused at `04e8a515`; the exact `MONITOR_RUN_KEY` writer set was
independently verified by the delta pass (eight sites + the loader
self-clear, no ninth); re-run against the implementation's own `main`
base before coding. All route through `retire` with key-bound sets:

| site | retire set | authorization |
| --- | --- | --- |
| armed acceptance | the entry staged at the Connect guard (key-bound; superseded revisions proceed + receipt) | `connectGuardStage` reads `currentUnretired()`; the shipped singular copy stays: "You have an unlogged session. Connecting discards it." |
| `createMonitorRun` defense | **AMENDED at Task 5's re-review (2026-08-30): the first-frame sweep is the sanctioned FALLBACK destroyer, receipted with its own reason — not a refusal.** The armed retire (row above) is the primary; when a leftover entry still exists at first pull (the armed retire did not fire, or a post-armed producer re-created state), the sweep retires it with a receipt naming the fallback reason, because refusing here would leave a ROWING session with no record at all — a worse loss than an over-broad retire whose entry the guard warned about one screen earlier. The old "refused + `store-second-key-refused`" prescription stands only for the store's create-commit path (§1), never for the sweep. | inherited from the armed set, with the fallback disclosed. **Also destroys the phone-timer `SessionRun` (`clearRun`, the third line of the same block)** — outside the store, but its authorization is the SAME guard stage: `connectGuardStage`'s first branch stages the SessionRun (`"unlogged"` on `loadRun()`), so the Replace confirmation covers it; stated here so the census has no unbound destroyer |
| save-success | the claim's key (exempt from rejection; richer-at-save counted) | the rower's Save |
| monitor discard | the claim's key (M+D) | two-tap arm |
| manual-door discard | the discarded key, both tiers, tombstoned like every retire — **corrected at Task 2's review (2026-08-30): the old "M untouched / NOT tombstoned" parenthetical was a two-carrier leftover; under the single-unretired invariant the same-key case is the only reachable one and §10 row 6 already states it** | two-tap arm + fresh non-render read |
| Today discard door | the entry its row rendered (key-bound) | Today's confirm — copy unchanged and still true ("Discard {title} without logging?") |
| **row-instead (`WorkoutDetail.tsx:298`)** | the stored key | **CORRECTED (PM): this site has NO confirm of its own** — it is a single-tap escape in the interstitial's failure card; its real authorization is the Connect guard's Replace confirmation one screen earlier, making it a third terminus of the staged set (Connect → program → armed | failure-card). The spec routes the staged set to all three termini |
| Start replace (`useStartWorkout.ts:99`) | the staged entry | Start's guard reads `currentUnretired()` (today it reads the durable tier only — the P1-1 hole at a second door, closed) |

Out of Entry retirement, stated narrowly: the loader's malformed-bytes
handling (§8 — deferred, never during render); the diagnostic ring keys.

**Product gain, recorded (PM):** Today reads the durable tier today;
reading the store makes an unlogged row render for a MEMORY-ONLY record
— closing the escape-hatch gap filed at #230's gate (a stashed record
with no door under denial-from-first-write). Its residual: that row
vanishes on reload, indistinguishable from a durable one — named §9.5,
receipted, not a screen.

## §6 Claims: the snapshot IS the retained copy

The consumer's mount snapshot (`useState` lazy init) already retains the
rendered entry R0 — the store does not duplicate it (delta pass: a
store-side retained token is a second strong reference buying nothing).

- **Render** peeks (`read`, side-effect-free per §8) and snapshots the
  entry — unchanged.
- **The commit effect claims:** registers `{sessionKey,
  renderedRevision}` — a lightweight receipt-and-state record, NOT a
  copy. Claiming never compares against the current revision and cannot
  fail; StrictMode double-claim is idempotent by value.
- **Save posts the SNAPSHOT** — the component's own retained entry
  (invariant 6 verbatim; "Save posts the token's entry" was the delta
  pass's kill — the token is per-key, the snapshot per-mount, and any
  divergence would post numbers the screen never showed).
- Save-success retires the claimed key; revision mismatch proceeds and
  counts (`handoff-dropped reason=richer-at-save`, both revisions).
- **Claim states per key: unclaimed → claimed → consumed.** Abandon
  (claimed, unmount without Save) leaves CLAIMED; any later retire
  counts non-consumed entries as drops. Tokens are per-mount; a new
  claim replaces; a retire releases.

## §7 Verdicts, the hand-off, and no auto-heal

`commit` caches the durable verdict per key; the release funnel reads
the CACHED verdict — the last accepted commit's, not the close commit's
(up to two durable writes land between close and release). The verify's
second serialize is deleted for this reason. `retryDurable` (§1)
re-attempts without bumping. A refused commit never touches the cached
verdict.

**No auto-heal (ruled):** a later commit succeeding while held-in-error
does not exit the held-error frame (Gate-0 frame, two controls, no
auto-exit; a screen changing under the rower is the rejected mid-edit
surprise). The heal is receipted; Retry then succeeds instantly.

## §8 Revision precedence and hydration, fully specified

- **No revision persisted.** Safe: producers die with the page; the one
  post-reload writer of an existing key (`completeInterruptedRun`)
  derives FROM the durable entry it was handed, so its
  `expectedRevision` is that entry's hydrated revision — well-defined.
- **Hydration:** at the store's first NON-RENDER access in a process
  (guards, doors, commit paths), a durable entry hydrates as
  `revision 0`. **Never during render:** the render peek reads only
  what is already hydrated or the memory tier. **Malformed durable
  bytes are never cleared during a read** (the current loader
  self-clears at `monitorRun.ts:544`, which under a render-time read
  destroys bytes during a repeatable render — P1c's class re-entering
  through the loader): the store records the malformed state, treats
  the key as absent, receipts it, and clears at the next retire or
  accepted commit for the key.
- **Tracked durable state:** per key, `durableRevision` (last
  successful durable write) and `durableComplete` (false when that
  write was `saved-without-series` — a poorer copy of the same
  revision; without the flag the staleness metric would claim currency
  for a durable copy missing up to ~720 KB of trace — delta pass).
  Failed attempts leave both unchanged; receipts report
  `revision − durableRevision` and the completeness flag.
- **`read(key)`:** memory entry when present (by construction ≥ any
  durable copy this process has seen); hydrated durable entry
  otherwise; equal revisions — memory wins.
- **Reload:** memory, tombstones, claims are gone; durable serves at
  hydration baseline (§9.2/§9.6 residuals).
- **The storage GETTER (`SecurityError`) is wrapped by the store's
  accessor** — a getter throw makes both tiers behave as absent-durable
  with a receipt, never an unhandled throw. This absorbs AUD-011's
  `loadMonitorRun` loader on day one (AUD-011 shrinks to three
  loaders; the #230-gate `removeItem` spec condition is superseded by
  the WHATWG primary above and this section — ROADMAP updated on
  approval).

## §9 Accepted residuals, named

1. **The delivery window is bounded, not abolished** — a burst after
   `BURST_LINGER_MS`/disconnect never reaches `commit`. Tier-B row,
   counted. Corpus: n=10 web/foreground 271–542 ms; native unmeasured;
   PM condition 2 gates reopening on hardware counts.
2. **Reload during a durable-tier failure loses the session** — memory
   is process-scoped; counted via the `no-run` door miss.
3. **Eviction** — a green durable write may not survive; receipts are
   the only instrument.
4. **Richer-at-save drop** — counted, per the ratified conditions.
5. **Today's memory-only unlogged row vanishes on reload**,
   indistinguishable from a durable one — receipted at hydration when a
   claimed-but-unpersisted session is absent (the flip side of the §5
   product gain). **What shipped (Task 4, ruled acceptable at its
   review):** the pre-reload `commit-accepted{verdict:"failed"}` receipt
   IS the counter, not a new hydration-time receipt — a fresh process has
   no claim to detect against (claims are process-scoped, §1), so
   "receipted at hydration" is satisfied by the ORIGINAL commit's own
   receipt rather than a second one invented at the reload that follows.
6. **Masked durable removal** — kept only as the tombstone's process
   behavior; retired as a live risk (WHATWG: `removeItem` has no throw
   condition). After reload a stale durable entry would serve; the
   receipts at the failed session bound the surprise.
7. **Abandoned claims** — counted at the next retire as
   claimed-not-consumed drops.
8. **Second-tab staleness** — single-tab is the codebase's stated
   assumption; a stale same-tab memory copy outranks a second tab's
   fresher durable write for the same key.

## §9A The receipts vocabulary (normative)

The store's ONE side channel. Nothing here returns receipts from a
method; every one goes through `setReceiptChannel`, and the hook pipes
them into the diagnostic ring prefixed `store-receipt:<kind>` (never
`handoff-*` — that namespace belongs to the hook's own hold entries).
Enumerated because §10's exit criteria require it; the union itself
lives in `handoffStore.ts` and this table is normative over it.

| kind | emitted when | what it proves |
| --- | --- | --- |
| `commit-accepted` | every accepted `commit`, carrying `{sessionKey, revision, verdict}` | the memory tier took the write, and what the DURABLE attempt did (`saved` / `saved-without-series` / `failed`). The `failed` case is §9.2/§9.5's counter — the record is memory-only from here |
| `commit-refused` | a `commit` refused `stale` or `retired`, with expected vs current revision | the CAS or the tombstone held; §1's "a refusal bumps nothing". Its presence is what distinguishes a refusal from a silent no-op |
| `store-second-key-refused` | a create-commit while a DIFFERENT key is unretired | §1's single-unretired-session invariant firing — the counted impossible, never silent coexistence |
| `retry-durable` | every `retryDurable`, with the fresh verdict | Retry re-attempted the durable write; carries NO revision, so it can never be mistaken for a commit (§1: "never bumps `revision`") |
| `claim` | a consumer's commit effect registers `{sessionKey, renderedRevision}` | the snapshot the screen rendered is on record; claiming cannot fail (§6), so this is a state record, not an outcome |
| `retire` | once per entry a `retire` set actually found, with authorized vs retired revision, `superseded`, claim state, and reason | the ONE destructive operation ran, on WHICH key, under WHOSE authorization. `superseded: true` is §1's "proceeds and records" case; `claimState: "claimed"` is §9.7's abandoned-claim drop |
| `handoff-dropped` (`reason: "richer-at-save"`) | alongside (never instead of) a `save-success` retire whose current revision is richer than the claim | §9.4: the rower saved the numbers the screen showed and a richer revision was dropped doing it — counted, per ratified condition 1 |
| `hydration-malformed` | at most once per process, when hydration finds unparseable durable bytes (preview + length, never the full payload) | §8: the key is treated as ABSENT and the bytes are LEFT ALONE for a later retire/commit to clear |
| `storage-getter-error` (`get` \| `remove`) | the `localStorage` getter throws on hydration's read, or on a retire's physical removal | §1's WHATWG primary: the getter is the real hazard. `set` is deliberately absent — a failed write is already reported by its own `verdict: "failed"` |
| `stage-retire-replaced` | `stageRetire` overwrites a non-empty staged set | an authorization was replaced before ever being acted on — nothing was destroyed in either tier |
| `staged-retire-discarded` | `discardStagedRetire` (cancel, `programDropped`, the confirm panel's own Cancel) | an attempt died with an authorization still pending; distinct from the armed path's silent `takeStagedRetire`, whose own `retire` receipt tells that story |

## §10 The gate (self-contained; RF24-shaped; mutations of invariants)

All rows start above the producer (replay harness over real capture
bytes, virtual clock, injected schedule; PAYLOAD-INSPECTING storage
stubs — deny by content, never by count alone; the existing spy already
receives the serialized value).

**Scope of the real-bytes binding (controller ruling, 2026-08-30, at the
final fix round — the antagonist read the header above as binding on
every row and reported row 7's synthetic fixtures as a deviation).** The
real-capture requirement binds the rows whose invariant involves WIRE
SEMANTICS — what a frame means, when it arrives, how the machine's own
numbers reconcile (rows 3, 8, 12 and the burst orderings of row 2).
Storage-denial semantics are wire-independent: a `QuotaExceededError` on
a `setItem` behaves identically whatever produced the record, so row 7's
four shapes stay on synthetic fixtures by ruling, not by omission. A row
that mixes the two (a denial landing on a specific wire-produced write,
as row 8 does) takes the real-bytes requirement.

1. **Guard sees what acceptance destroys:** unretired entry
   (memory-only / durable-only / both tiers, ONE key) → Connect and
   Start stage Replace with the shipped singular copy; armed retires the
   staged entry with its receipt; a superseded revision proceeds +
   receipt. Mutations: guard reads one tier → fails; armed retires
   without the staged set (unbound) → the receipt assertion fails.
   **Note on the tier matrix (ANT-F7, 2026-08-30): it predates the
   single-slot store and one of its three cells no longer names a
   distinct state.** Post-hydration, "durable-only" and "both tiers" are
   the SAME store state — hydration lifts a durable entry into `current`
   at revision 0, and `read`'s precedence then returns the memory entry
   in both cases. The genuine distinction the row still gates is
   memory-only (a live record whose durable writes were denied — §5's
   product gain) versus a hydrated one. The three-way wording stays as
   history rather than being rewritten, with this sentence as its
   correction.
2. **Producer update after release, four orderings** (before/after
   navigation × before/after teardown) — all reach `commit`; the
   consumer's snapshot unaffected; receipts show accepted revisions.
   Mutation: gate the post-release commit on a window predicate → the
   excluded ordering fails.
   **Scope of the matrix (amended at #239's review round 3, per the
   reviewer's P1 — "amend the matrix to reachable production orderings
   and gate those through the actual destination seam"): the 2x2 is not
   a 2x2 in the shipped code, and the row is gated on the cells that
   exist rather than on four manufactured ones.** Navigation and
   teardown are ONE React commit — `WorkoutDetail.tsx`'s
   `handleConnectedEnded`, the only door out of a finished connected
   session, runs `setConnecting(null)` and `navigate(...)` in a single
   handler — so there is no after-teardown/before-navigation cell to
   reach. The release IS the navigation:
   `ConnectedSurface.tsx:352-358` fires `onEnded` from an effect the
   instant `phase === "ended" && !handoffHeld`, with no rower tap in
   between. And the after-navigation/before-teardown gap belongs to row
   3, whose own note already rules that "an arbitrary driver callback
   cannot be scheduled there" — scheduling one from a test is the
   RF24-shaped move that note forbids, and round 1 made it. What
   remains is one reachable ordering — the late burst arriving inside
   `BURST_LINGER_MS` after the navigation-teardown commit, §1's own
   headline case — gated end to end through the real seam in
   `src/workout/WorkoutDetail.postReleaseCommit.test.tsx` (real
   `WorkoutDetail` → real `handleConnectedEnded` → real `LogSession`),
   asserted on production observables only: `currentUnretired()`, the
   durable bytes, and the ring stash `teardown` writes to
   `sessionStorage`. The header's real-bytes requirement is met by a
   separate leg in `handoffStoreReplay.test.ts` over
   `walk-2026-08-25/rests-finished-recording.jsonl.gz`. **What no
   capture can supply, stated rather than faked:** §9.1's own burst
   corpus is 271-542 ms, entirely inside the 2000 ms backstop, so a
   post-RELEASE producer update is not an ordering any recording we
   hold observed; the release-relative axis is produced from the
   backstop timing out (the burst never arriving), never by shifting
   real bytes later on the clock.
3. **The claim race, with its producer NAMED:** R0 render → **R1
   committed from the OLD hook's passive-cleanup teardown** (the only
   occupant React allows between the new render and its mount effect —
   delta pass; an arbitrary driver callback cannot be scheduled there,
   and a store-level direct call would be RF24 wearing this row's
   number) → R0 claim → Save → POST carries R0's numbers → retire
   receipts `richer-at-save {R0, R1}`. Mutations: POST reads the store
   instead of the snapshot → screen==save fails; claim compares current
   revision (can fail) → the claim-cannot-fail assertion fails.
4. **Stale-commit refusal:** a stale `expectedRevision` is refused,
   bumps nothing, `runRef` unchanged (the hook discipline), receipt
   present. Mutation: accept stale → last-write-wins fails.
5. **Tombstone:** post-retire commit refused + receipted; the refusal
   reaches the HOOK's discipline (runRef not re-assigned). Masked
   removal invisible for the process; serves after simulated reload
   (residual asserted as itself). Mutations: refusal bumps revision →
   fails; `read` ignores tombstones → fails.
6. **Manual discard:** stored key retired, memory entry (same key —
   the only reachable case) retired with it; the asymmetric
   different-key branch is DELETED with the cross-key machinery — the
   row instead asserts §1's invariant: a second-key create is refused +
   `store-second-key-refused` receipted. Mutation: allow the second
   key → the invariant row fails.
7. **The four storage shapes** (denied-from-open / denied-at-close /
   healed-on-Retry / saved-without-series) over real bytes —
   held-error, `retryDurable` (no revision bump — assert the revision
   is UNCHANGED across a heal), Proceed as shipped; cached-verdict
   currency (deny the boundary-write only → the release must hold);
   `saved-without-series` sets `durableComplete=false` and the receipt
   says so. Mutation: model Retry as `commit` → the
   revision-unchanged assertion fails AND the follow-on burst commit is
   refused (the headline-loss case, pinned).
8. **The §3 defect row:** mid-run denial landed on the live→closed
   write by payload inspection, then the finish-grace boundary → the
   record stays closed, all actuals kept, Proceed carries a COMPLETE
   record to the reader, POST carries the measured work. Red against
   `main`'s `recordActual` (`origin/main:monitorRun.ts:832`) before the
   rewrite — demonstrated on the fresh branch's first commit.
9. **Reload residuals** asserted as residuals (durable serves;
   denied+reload = counted loss, ONE test spanning the producer's denied
   commit, the reload, and the log door's `no-run` miss — RF24's shape;
   Today's memory-only row present before reload, absent after).
   **RECONCILED with §9.5's committed amendment (ANT-F3b, 2026-08-30):
   "receipted after" is satisfied by the PRE-reload
   `commit-accepted{verdict:"failed"}` receipt, not by a hydration-time
   receipt.** The design ruled that out — claims are process-scoped, so a
   fresh process has nothing to detect the absence against — and this row
   asked for it anyway. What a test may assert about receipts here is
   forensic evidence captured BEFORE the reload; the vanish itself is
   gated by the DOM pair (row present, then absent), never by a receipt
   the reloaded process was never going to emit.
10. **Abandon path:** claim, unmount without saving, next acceptance →
    per-entry receipt counts claimed-not-consumed.
11. **Invariant mutations, each with its named detector:** reuse a
    revision → the receipt-sequence assertion fails; mutate an entry in
    place → the snapshot/claim comparison fails (the only holder of an
    old reference); reorder tier precedence → row 8 fails; drop a
    receipt kind → its named row fails; write the durable key from
    outside the store → a module-boundary lint/grep gate fails.
    **Scope of the boundary gate (amended at #239's review round 1, per
    the reviewer's P2):** the gate is a self-tested TEXT gate over named
    syntactic forms — the key by constant, by literal, by `key:`-property
    indirection, plus legacy-writer call sites and module-scope
    `let`/`var` declarations. Its blind spots (an aliased key variable, a
    `const`-object carrier, closure-held runs) are pinned by MISSES
    self-tests rather than claimed covered; per-door tests and §1's
    review discipline carry the semantic half of "nothing else writes."
12. **The binding route gate:** `WorkoutDetail.connectedRecovery.test.tsx`
    restored AS A FILE and RETARGETED (its two `MONITOR_RUN_KEY`
    assertions survive; its slot-vocabulary comments get the budgeted
    comment pass — §11): real WorkoutDetail → interstitial → hook →
    fake transport → held-error button → reader → POST machine fields.
    Store-level rows never substitute for it. Memory-currency
    assertions are internal-consistency checks (RF11's mirror rule).

**Exit criteria:** every row implemented and green on the fresh branch;
every named mutation run per RF22 with recorded failure text; per-file
coverage on every store-touching file (RF2); `pnpm e2e` green; the §3
row demonstrated red-then-green against `main`'s behavior (documented in
the PR); the receipts vocabulary documented in the normative spec; NO
Gate-0 artifact owed (no rendered change — stated, not implied).

## §11 The branch reset, auditable

- **PR #230 CLOSES UNMERGED** on this design's approval; its branch is
  preserved as the record (pushed through `4c034377`).
- **Implementation starts from then-current `main`**; the §5 census
  re-runs against that base before coding.
- **No rebase or cherry-pick of the coupled substrate.** Restored as
  files: `WorkoutDetail.connectedRecovery.test.tsx` (retargeted +
  comment pass — it narrates the deleted slot),
  `WorkoutDetail.test.tsx` (retargeted — eleven durable-substrate
  assertions survive; comments checked), `ConnectedSurface.tsx`,
  `ConnectedSurface.test.tsx`, `ConnectedSurface.screens.test.tsx`,
  `ConnectedInterstitial.test.tsx`, the `connected-ended-error` fixture
  + screenshots-loop entry, `ConnectionLogSheet.test.tsx`,
  `PaneGrid.test.tsx`, and the two committed
  `connected-ended-error{,-landscape}.png` captures. REWRITTEN against
  the store (requirements checklist, not source): `monitorRun.ts`,
  `useMonitorSession.ts`, `LogSession.tsx`, `Today.tsx`,
  `WorkoutDetail.tsx`, `useStartWorkout.ts`,
  `summaryHoldReplay.test.ts`, `monitorRun.test.ts`,
  `useMonitorSession.test.ts`, `LogSession.test.tsx`,
  `ConnectAction.test.tsx`.
- **The Gate-0 UI does not ship unreachable:** the held-error frame
  lands in the same PR as its producer.
- The 2026-08-29 plan document stays off `main`.
- **Wave F re-sequencing (PM):** store → AUD-011/015 (AUD-011 minus the
  `loadMonitorRun` loader, which §8 absorbs; its `removeItem` spec
  condition superseded — ROADMAP updated on approval) → `door` column →
  lifecycle spec.

## Process

Maps: done. Anchor pass: folded (rev 2). James's design gate: folded
(rev 3). Delta antagonist + PM gates on rev 3: folded (this rev; their
ledger entries ride the branch). NEXT: James's explicit approval →
normative spec rewrite + ROADMAP updates → implementation plan → fresh
branch off `main`. No production code before approval. The v0.27.0 tag
decision (both gates: cut now, without AUD-016) is presented alongside
but is James's alone.
