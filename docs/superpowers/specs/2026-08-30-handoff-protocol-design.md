# The hand-off store: one authority for the connected record — protocol design (rev 2, pre-approval)

**What and why.** The logical connected workout lives in four carriers —
the hook's `runRef`, localStorage, a module slot, and the log form's mount
snapshot — and no component knows the full set. Six ownership races in two
James reviews shared one shape: a destructive or productive transition
consulting a private subset of the carriers. This design replaces the
carrier conventions with a PROTOCOL: one store, one write path, one read
path, revisioned entries, compare-and-swap claims, one retire path, and a
transition matrix every asynchronous ordering must satisfy. It implements
the ratified product contract (PM ruling 2026-08-30, RATIFIED): **renders
snapshot; destructive actions re-read; recording actions post what was
shown** — binding save-bearing forms only.

Rev 2 folds the anchor antagonist pass (2026-08-30, verdict REVISE): one
PROVEN defect in current code the protocol must fix out loud (§2), five
killed sentences corrected in place, three unnamed destroyers enumerated
(§5), the claim registry's third state (§6), the cached-verdict rule and
the no-auto-heal ruling (§7), invariant 4 reworded (§3), and four test
rows added (§9). The pass's vetted ground and ledger entry ride this
branch.

**Two structural facts anchor the design (both antagonist-held):**

1. React runs the new route's render BEFORE the old subtree's passive
   unmount (`LogSession.tsx:226-228`, verbatim comment), and the old
   subtree's cleanup before the new subtree's mount effects — so any
   protection written "at teardown" can be too late for the reader's
   peek, but a memory tier that is current BEFORE teardown is always
   visible to the claim. The memory copy therefore cannot be an
   emergency slot written at five event sites; it must be current by
   construction: written on every accepted producer update.
2. Once that holds, the stash vocabulary (proceed-stash, teardown-escape,
   post-unmount stash, post-release restash, without-series stash)
   collapses. Every ordering INSIDE the burst delivery window takes one
   matrix row; the window itself is bounded by the producer's
   subscription life (`BURST_LINGER_MS`) and is residual §8.1 — the
   window is bounded, not abolished.

## §1 The store

One module (`handoffStore`) owns BOTH persistence tiers of the connected
record. Nothing else writes `MONITOR_RUN_KEY` or holds a module-level
run.

- **Entry:** `{ sessionKey, revision, run }`. `sessionKey` = `startedAt`.
  `revision` = a monotonic counter per key, bumped by the store on every
  accepted write. Entries are immutable objects — a new revision is a new
  object, so reference identity implements revision identity. **The
  store retains exactly ONE entry per key; `revision` is a counter, not
  a log** (antagonist attack 6: the series field is a copied array up to
  14,400 samples — retained history would be ~10⁶ live objects on an
  hour's session; one entry costs one reference `runRef` already holds).
- **`commit(run)`** bumps the revision, writes the memory tier
  unconditionally, attempts the durable tier, returns the durability
  verdict (`"saved" | "saved-without-series" | "failed"`, the existing
  four-exit mapping), and **caches the verdict per key** (§7).
  **`commit` is a persistence primitive; every existing writer GATE
  stays where it is** — `appendSummaryObservations`' four declines,
  `recordActual`'s immutability + finish-grace vouch,
  `completeMonitorRun`'s idempotence, and the F1 fold's eligibility
  mirror are policy, not persistence, and none of them collapses into
  `commit` (antagonist attack 7).
- **`read(sessionKey)`** returns the higher-revision copy of THAT key
  across tiers. Precedence by revision is defined WITHIN a key only; a
  keyless `read()` returns the memory tier's entry if present, else the
  durable tier's — and when the tiers hold DIFFERENT keys, both are
  reported to guards (§5), never silently ranked (invariant 5, scoped).
- **`retire(sessionKey | "all", reason)`** is the only destructive
  operation. It enumerates what it destroys: iterates every entry it
  clears and emits ONE RECEIPT PER ENTRY naming key, revision, and claim
  state (§6). A retire that finds nothing emits nothing (no phantom
  receipts). Its durable half wraps `removeItem` in try/catch: a
  throwing removal leaves a resurrectable durable entry, disclosed as
  residual §8.6 rather than silent.
- **Tombstones.** `retire` leaves a session-scoped tombstone for the
  key; a post-retire `commit` for a tombstoned key is REFUSED with a
  receipt. (The producer for such a commit is unproven at human speed —
  antagonist "could not establish" — but under this design it would
  write localStorage, upgrading the blast radius from a phantom guard
  warning to Today/Start/Connect/log all seeing a saved-away session;
  the rule is cheap and the receipt makes the unproven producer
  measurable.)

## §2 The store fixes a PROVEN defect in current code, out loud

`recordActual`'s late branch rebuilds from `stillLive(startedAt)`
(`monitorRun.ts:1019-1021`), which matches on `startedAt` ALONE. When the
close write failed (swallowed), storage holds the last SUCCESSFUL write —
a stale LIVE copy — and the finish-grace boundary spreads it as the base:
the record comes back `completedAt: null`, `endedBy` gone, RC-1 sums
gone, and only the actuals the last successful write contained
(antagonist probe: 3 in-memory actuals → 1, real compiled program). The
hook assigns it to `runRef.current`; Proceed then stashes an OPEN record;
the reader's `completedAt` gate bounces it to the manual door — the
AUD-016 escape hatch defeated on its own path. Neither shipped gate leg
can see it: leg A leaves storage empty (refuses correctly), leg B leaves
it closed (base correct); the defect lives BETWEEN them, in storage that
accepted writes and then stopped.

**The fix is the read path:** `read(sessionKey)` serves the
highest-revision copy, memory tier first by revision — under a mid-run
denial the memory tier IS the newest, so the late boundary's base is the
caller's own current record, never storage's stale one. `stillLive` is
DELETED, replaced by store reads. §9 row 8 is the permanent gate (the
harness's `armAfter(n)` countdown lands the denial on the close write by
count). This defect exists on main + #230 today, independent of the
reset; the protocol fixes it by construction and the matrix row keeps it
fixed.

## §3 The seven invariants

1. **Until Save, Discard, or a confirmed Replace, at least one
   recoverable copy exists** — memory tier from first write to retire;
   durable best-effort. Residual: reload during durable failure (§8.2).
2. **A destructive transition inspects every carrier it can destroy** —
   only `retire` destroys, it owns both tiers, and EVERY destroyer goes
   through it (§5 enumerates all eight current sites).
3. **A consumer owns an exact revision** — claims are
   `{sessionKey, revision}`, CAS on the immutable entry.
4. **Every accepted producer update after release either reaches the
   current consumer, or remains recoverable until that consumer acts,
   and any loss at that action is COUNTED** (reworded at the antagonist
   pass — the old "recoverable after the consumer acts" was
   unsatisfiable under contract A and contradicted §8.4 two lines
   later; words in invariants get implemented).
5. **Carrier precedence is explicit and WITHIN-KEY** — `read(key)` =
   max(revision) for that key; cross-key states are reported, never
   ranked (§1).
6. **The UI never saves numbers it did not represent** — the consumer
   posts its claimed revision; no path injects a later revision into a
   mounted form.
7. **Accepted residuals are named precisely (§8)** — none disguised as
   recovery.

## §4 What each old carrier becomes

| old carrier | becomes |
| --- | --- |
| `runRef` | unchanged — the producer's working copy; every accepted update flows `runRef → commit()` |
| stored `MonitorRun` | the durable tier (same key, same shape, NO revision persisted — see §8.5's argument; no migration, validator tolerates) |
| module slot + five stash sites | deleted — the memory tier is current by construction |
| `stillLive` | **deleted** — replaced by `read(sessionKey)` (§2) |
| mount snapshot | unchanged — the consumer's claim (ratified contract) |

## §5 Destroyers and guards: the full set

The draft's five-caller list was three short (antagonist attack 3). All
EIGHT current destroyers route through `retire`:

| site today | retire reason | guard that must see the store first |
| --- | --- | --- |
| armed acceptance (`useMonitorSession.ts:2675-2676`) | `new-session-accepted` | Connect guard (`connectGuardStage`) reads `hasUnretired()` over M∪D |
| `createMonitorRun` defense (`monitorRun.ts:767-768`) | `create-defense` | upstream guards already ran |
| save-success (`LogSession.tsx:1724-1725`) | `saved` (CAS, §6) | the rower's own Save |
| monitor discard (`LogSession.tsx:2000-2001`) | `discarded` | two-tap arm |
| manual-door discard (`LogSession.tsx:2212`) | `discarded-manual` — DURABLE TIER ONLY, the stated asymmetry: a memory entry may belong to a different workout still awaiting its arrival; `hasUnretired()` keeps reporting it | two-tap arm + fresh read |
| **`Today.tsx:627`** discard door | `discarded-today` | Today's own confirm; must read the store, both tiers |
| **`WorkoutDetail.tsx:298`** row-instead | `row-instead` | its confirm; both tiers |
| **`useStartWorkout.ts:99`** confirmReplace | `replace-confirmed` | **the Start door's guard reads only the durable tier today — the exact P1-1 hole at a second door** (`useStartWorkout.ts:118-135`); it reads `hasUnretired()` under this design |

Cross-key guard states: when M holds workout X and D holds workout Y,
the guard stages a Replace that names BOTH (or the UI's single sentence
is under-describing two sessions — the retire receipts then count two
entries, one each).

## §6 Claims: three states

The claim registry per key: **unclaimed → claimed (at the consumer's
commit effect) → consumed (at that consumer's Save)**. The rower opening
the log door and leaving without saving leaves the entry CLAIMED, not
consumed — and `retire` counts anything not CONSUMED as a drop (the
abandon path was a silent drop under the draft's two-state wording;
antagonist attack 4). Render peeks read-only; the commit effect claims
(CAS, StrictMode-safe by value); Save's retire carries the claimed
revision — a higher store revision at that moment proceeds (rower
authorized) and emits `handoff-dropped reason=richer-at-save` with both
revisions (ratified condition 1).

## §7 Verdicts, the hand-off, and no auto-heal

`commit` caches the durable verdict per key; **the release funnel reads
the CACHED verdict — the LAST commit's, not the close commit's**
(antagonist attack 5: up to two durable writes land between close and
release — the finish-grace boundary and the burst append — so a
close-time verdict is stale by release time and could release green over
a durable copy missing the final interval). The verify's second
serialize is deleted for THIS reason, not the draft's. Retry re-attempts
the durable write of the current memory entry, as today.

**No auto-heal (ruled here):** a later commit succeeding while
held-in-error does NOT exit the held-error frame — the Gate-0-approved
frame has two controls and no auto-exit, and a screen that changes under
the rower is the mid-edit surprise the contract rejects. The heal is
recorded (`release-save` receipt with verdict `saved` while
`holdError` set); the rower's Retry then succeeds instantly.

## §8 Accepted residuals, named

1. **The delivery window is bounded, not abolished** — a burst after
   `BURST_LINGER_MS`/disconnect never reaches `commit`. Tier-B row,
   counted. (Corpus: n=10 web/foreground 271-542 ms; native unmeasured;
   PM condition 2 gates any reopening on hardware counts.)
2. **Reload during a durable-tier failure loses the session** — memory
   is process-scoped; counted via the `no-run` door miss.
3. **Eviction** — a green durable write may not survive; receipts are
   the only instrument.
4. **Richer-at-save drop** — counted (`handoff-dropped
   reason=richer-at-save`); reopening live-update gated on hardware
   count (ratified condition 2).
5. **No revision persisted; second-tab staleness** — safe because
   producers die with the page (no in-memory revision can outlive the
   durable copy it derives from; the one post-reload writer,
   `completeInterruptedRun`, derives FROM the durable copy — monotone).
   A stale same-tab memory copy CAN outrank a second tab's fresher
   durable write; single-tab is already the codebase's stated
   assumption, now a named residual.
6. **A throwing `removeItem` in retire** leaves a resurrectable durable
   entry — caught, receipted, disclosed (shares the codebase's
   unguarded-removeItem disposition otherwise).
7. **Unclaimed/unclaimed-or-abandoned retire at next acceptance** —
   counted per entry.

## §9 The test matrix (RF24-shaped; mutations of invariants)

Rows 1–7 as rev 1 (guard-sees-what-armed-destroys; producer-update
after release ×4 orderings; peek/claim/richer-revision; screen==save +
drop receipt; four storage shapes over real bytes; reload residuals;
invariant mutations) with these corrections and additions:

- The immutability mutation names its detector: mutate an entry in
  place → **the claim CAS assertion** must fail (the only consumer
  holding an old reference across the mutation; unnamed, the mutant
  survives — RF21).
- **Row 8 (the §2 defect):** durable failure beginning MID-RUN
  (`armAfter(k)` landing the denial on the close write), then the
  finish-grace boundary → the record stays closed, all actuals kept,
  Proceed carries a COMPLETE record to the reader. Red against today's
  code by construction.
- **Row 9 (tombstone):** a post-retire commit for a retired key is
  refused with a receipt.
- **Row 10 (abandon path):** claim, unmount without saving, next
  acceptance → retire receipt counts a claimed-not-consumed drop.
- **Row 11 (manual-discard asymmetry):** after it, `hasUnretired()`
  still reports the memory entry and Connect stages accordingly.
- **Binding (PM salvage ruling):** `WorkoutDetail.connectedRecovery.test.tsx`
  is restored AS A FILE and retargeted — the only test starting at the
  product route and ending at the POST; §9's store-level rows never
  substitute for it. Memory-tier-currency assertions are
  internal-consistency checks (RF11's mirror rule): invariant tests,
  never evidence about the record.

## §10 Relationship to shipped work

#228's hold: untouched. #230's behaviors (held-error frame with the
Gate-0 UI, Retry/Proceed, receipts, armed-acceptance retirement, the
render/commit split, James's seven probes as permanent tests): preserved;
the substrate beneath them (slot quartet, five stash sites, save-time
carrier checks, `stillLive`, the verify's second serialize) is replaced
by `commit`/`read`/`retire`/claims. Disposition of the #230 branch is
the PM salvage ruling (close-and-fresh-branch, deferred until this
design's approval; zero-coupling files restore verbatim). The normative
rewrite of `2026-08-29-aud016-durable-handoff-design.md`'s ownership
sections happens ON APPROVAL, as if written once today; history stays in
git/PR records.

## Process

Carrier + event maps: done. Anchor antagonist pass on this protocol:
RAN 2026-08-30 — verdict REVISE, all objections resolved in this rev
(the §2 defect made explicit with its own matrix row; §4/§5/§6/§7
corrections; invariant 4 reworded). PM salvage ruling: received (§9/§10
carry its binding conditions). NEXT: James's explicit approval of this
design → normative spec rewrite → implementation plan → fresh branch.
No production code changes before approval.
