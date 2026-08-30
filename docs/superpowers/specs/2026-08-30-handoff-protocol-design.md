# The hand-off store: one authority for the connected record — protocol design (DRAFT, pre-approval)

**What and why.** The logical connected workout currently lives in four
carriers — the hook's `runRef`, localStorage, a module slot, and the log
form's mount snapshot — and no component knows the full set. Six ownership
races in two review rounds all had one shape: a destructive or productive
transition consulting a private subset of the carriers. This design
replaces the carrier conventions with a PROTOCOL: one store, one write
path, revisioned entries, compare-and-swap claims, and a transition matrix
that every asynchronous ordering must satisfy. It implements James's
ratified product contract (PM ruling, 2026-08-30): **renders snapshot;
destructive actions re-read; recording actions post what was shown** —
binding save-bearing forms only.

**The one structural insight (from the event map):** React runs the new
route's render BEFORE the old subtree's passive unmount
(`LogSession.tsx:226-230`'s own comment), so any protection that stashes
"at teardown" can be structurally too late — the reader may already have
looked. Therefore the memory copy cannot be an emergency slot written at
five event sites; it must be CURRENT BY CONSTRUCTION: written on every
accepted producer update, exactly like storage. Once that holds, the
entire stash vocabulary (proceed-stash, teardown-escape, post-unmount
stash, post-release restash, without-series stash) collapses into "the
memory tier is simply current," and the P1-2 window ceases to exist
rather than being patched.

## §1 The store

One module (`handoffStore`, living in `monitorRun.ts`'s file or its own)
owns BOTH persistence tiers of the connected record. Nothing else writes
localStorage's `MONITOR_RUN_KEY` or holds a module-level run.

- **Entry:** `{ sessionKey, revision, run }`. `sessionKey` = the run's
  `startedAt` (already the identity every writer re-derives).
  `revision` = a monotonic integer, bumped by the store on every accepted
  write for that key. Entries are immutable objects — a new revision is a
  new object, so reference identity implements revision identity.
- **Two tiers, one write path.** `commit(run)` bumps the revision, writes
  the memory tier unconditionally, and attempts the durable tier
  (`localStorage`), returning the durability verdict
  (`"saved" | "saved-without-series" | "failed"` — the existing four-exit
  mapping). Every producer write (create, record-actual, close, series
  flush, fold, append, continuity reset) goes through `commit`. The
  memory tier is therefore ALWAYS the newest copy; the durable tier is a
  best-effort cache of it.
- **One read path.** `read(sessionKey?)` returns the highest-revision
  copy across both tiers (invariant 5: precedence by revision, never by
  tier position). On reload the memory tier is empty and the durable
  tier serves — the current behavior, now as a stated rule.
- **One retire path.** `retire(reason)` is the ONLY destructive
  operation: it clears both tiers and emits one receipt naming the
  reason, the retired `sessionKey`/`revision`, and whether the entry was
  ever claimed (an unclaimed retire is a counted drop, not a silent
  one). Callers: save-success, monitor-discard, manual-discard (durable
  tier only, unchanged asymmetry), the `armed` acceptance, and
  `createMonitorRun`'s defense-in-depth. The Connect guard reads through
  the SAME store (`hasUnretired()`), so the guard's inspect-set and the
  armed-clear's destroy-set are the same set by construction — the P1-1
  class dies structurally, not by remembering to peek.
- **Claims (CAS).** A consumer claims `{sessionKey, revision}` at commit
  time (render peeks read-only; the post-commit effect claims — the P1c
  discipline, unchanged). All later consumer-driven destruction (save's
  retire) carries the claimed revision. If the store's current revision
  is higher, the retire still proceeds — the rower authorized it — but
  emits `handoff-dropped reason=richer-at-save` with both revisions
  (ratified condition 1). No silent drop exists.

## §2 What each old carrier becomes

| old carrier | becomes |
| --- | --- |
| `runRef` | unchanged — the producer's working copy; every accepted update flows `runRef → store.commit()` |
| stored `MonitorRun` | the store's durable tier (same key, same shape; no migration — reload reads it as revision 0) |
| module slot + its five stash sites | DELETED as concepts — the memory tier is current by construction |
| mount snapshot | unchanged — the consumer's claim, per the ratified contract |

The hold, the held-error frame, Retry, Log it anyway, receipts, and the
Gate-0-approved UI are unchanged in behavior; `verifyHandoffWritable`
becomes "read `commit`'s durable verdict at the hand-off" — the verify
stops being a second serialize because `commit` already returned the
verdict for the close write (the ~720 KB double-serialize goes away;
retry re-attempts the durable write of the CURRENT memory entry).

## §3 The seven invariants, and where each is enforced

1. **Until Save, Discard, or a confirmed Replace, at least one
   recoverable copy exists** — the memory tier holds every accepted
   update from first write to retire; the durable tier best-effort.
   Enforced in `commit` (unconditional memory write). Residual: reload
   with durable tier failed loses the session (named, §6).
2. **A destructive transition inspects every carrier it can destroy** —
   only `retire` destroys, and it owns both tiers; the Connect guard
   reads `hasUnretired()` over the same set.
3. **A consumer owns an exact revision** — claims are
   `{sessionKey, revision}`; CAS on the immutable entry.
4. **Every accepted producer update after release either reaches the
   current consumer or remains recoverable after that consumer acts** —
   updates keep flowing through `commit` (memory tier current); the
   mounted consumer never sees them (contract A); at save the retire
   counts the richer-copy drop (condition 1) — recoverable-until-acted,
   counted-when-acted.
5. **Carrier precedence is explicit** — `read` = max(revision), never
   tier order.
6. **The UI never saves numbers it did not represent** — the consumer
   posts its claimed revision. Ratified contract; no code path exists
   that injects a later revision into a mounted form.
7. **Accepted residuals, named precisely (§6)** — none disguised as
   recovery.

## §4 Event vocabulary → transition matrix

Events (from the code map, sites cited there): Connect intent · Replace
confirmation · armed (acceptance) · first pull (create) · producer update
(actual / series flush / fold / append) · End (link up / link lost) ·
machine finish · Menu terminate · split hold timeout (3500) · burst hold
timeout (2000) · Retry · Proceed · summary arrival (four windows) ·
verify verdict · navigation decision · render (peek) · commit (claim) ·
passive teardown (+ linger) · Save · Discard (monitor / manual) ·
reload.

Matrix cells: **M** = memory tier, **D** = durable tier, **C** = consumer
claim, **P** = producer `runRef`. `rN` = revision N.

| event | P | M | D | C | notes |
| --- | --- | --- | --- | --- | --- |
| Connect intent | – | read | read | – | guard = `hasUnretired()` over M∪D; stage Replace if any |
| Replace confirmed → armed | – | retired (receipt, claimed? counted) | retired | – | the ONLY pre-pull destruction; rower authorized via the guard |
| first pull (create) | r1 | r1 | r1 attempt | – | `retire(defense)` then `commit` |
| producer update (any) | rN+1 | rN+1 | rN+1 attempt | unchanged | one path for actuals, folds, appends, flushes — including AFTER release (kills P1-2's window) |
| close (End/finish/terminate) | rK | rK | rK attempt → verdict | – | verdict branches the hand-off: saved → release; failed → held-error |
| burst in-hold | rK+1 | rK+1 | attempt | – | resolve burst condition |
| burst post-release (any window) | rK+1 | rK+1 | attempt | unchanged | just a producer update now; no special stash |
| Retry | – | – | re-attempt current M | – | success → release + receipt |
| Proceed | – | current (already) | – | – | release; memory tier already carries rK(+) |
| render | – | peek(read) | peek(read) | candidate=max rev | read-only (purity) |
| commit (mount effect) | – | – | – | claim {key, rev} | CAS; a newer M revision leaves the claim at the rendered rev (contract A) |
| Save success | – | retired via CAS | retired | consumed | rev mismatch → retire proceeds + `handoff-dropped reason=richer-at-save` |
| Discard (monitor) | – | retired | retired | – | rower-armed two-tap |
| Discard (manual door) | – | untouched | retired if present | – | unchanged asymmetry, now a stated rule |
| passive teardown | dies with hook | unchanged | unchanged | – | teardown owns NO carrier writes anymore; linger only keeps the radio for a late burst, which arrives as a producer update |
| reload | gone | gone | serves | – | residual §6.2 |
| next armed | – | retired (unclaimed → counted) | retired | – | boundary-9 orphan becomes a counted retire |

Every async boundary from the map re-checked against this matrix:
summary before/after release, before/after navigation, before/after
render, before/after commit, before/after teardown — all take the SAME
row ("producer update"), which is the point: orderings stop mattering
because there is no window-specific write path left. Save before/after a
late summary differs only in whether the retire's CAS counts a drop.
New Connect while any carrier remains → the guard row. Richer revision
between peek and claim → the commit row (claim stays at rendered rev; M
keeps the richer one until Save's counted retire or the next armed's
counted retire). Storage denied from open / at release / healed / w/o
series → the `commit` verdict column only; the protocol is identical in
all four.

## §5 The test matrix (derived, RF24-shaped)

Every row of §4 that touches two tiers or the claim becomes a permanent
test starting ABOVE the producer (replay harness, virtual clock,
injected schedule — no human-speed assumptions):

1. Guard sees what armed destroys: unretired entry (memory-only,
   durable-only, both) → Connect stages Replace; armed retires with the
   claimed/unclaimed receipt. Mutation: make the guard read one tier —
   must fail.
2. Producer-update-after-release reaches the store both sides of
   navigation AND both sides of teardown (four orderings, one row).
   Mutation: gate the post-release commit on any window predicate —
   must fail the ordering it excludes.
3. Render peeks / commit claims / richer-revision-between → claim stays
   at rendered revision, richer copy survives, next arrival serves it.
   Mutation: claim by sessionKey instead of revision — must fail.
4. Save with richer M → POST carries claimed revision's numbers exactly
   (screen == save), retire proceeds, `handoff-dropped` receipt present.
   Mutations: post the richer copy — the screen==save assertion fails;
   drop the receipt — the receipt assertion fails.
5. The four storage shapes (denied-from-open / at-release / healed /
   without-series) over real capture bytes — held-error, Retry, Proceed
   as today, PLUS memory-tier currency asserted at each step.
6. Reload residuals: durable-tier-serves; denied+reload = loss with the
   `no-run` miss counted. (Assert the residual, don't disguise it.)
7. Invariant mutations, not call deletions: break monotonicity (reuse a
   revision), break immutability (mutate an entry in place), break
   max-revision read (tier order) — each must be caught by a named
   assertion.

## §6 Accepted residuals, named

1. **Tier B after burst timeout** — unchanged from #228; the row saves
   as ours; receipts count it.
2. **Reload during a durable-tier failure loses the session** — the
   memory tier is process-scoped; contract A's disclosed loss; counted
   via the existing `no-run` door miss.
3. **Eviction** — a green durable write may not survive; receipts are
   the only instrument (unchanged disclosure).
4. **Richer-at-save drop** — the erg's late numbers exist in M when the
   rower saves; the save wins, the drop is COUNTED
   (`handoff-dropped reason=richer-at-save`). Reopening live-update is
   gated on this count being non-zero on hardware (ratified condition 2).
5. **Unclaimed retire at next armed** — a stash nobody ever read is
   retired with a counted receipt (the boundary-9 orphan, now visible).

## §7 Relationship to shipped work

#228's hold is untouched. The AUD-016 branch's behaviors (held-error
frame, Retry/Proceed, receipts, the armed-acceptance retirement, the
render/commit split) are all PRESERVED in behavior; what changes is the
substrate: five stash sites, the slot quartet, the verify's second
serialize, and the save-time carrier checks are replaced by
`commit`/`read`/`retire`/claims. The rewritten normative spec (on
approval) replaces the ownership sections of
`2026-08-29-aud016-durable-handoff-design.md`; historical investigation
stays in git/PR records.

## Process

Carrier + event maps: done (explorers, 2026-08-30, cited in the SDD
ledger). NEXT: antagonist attack on this document's §1–§6 (fresh, full);
PM ruling on #230's salvage; then this design goes to James for explicit
approval; only then the normative rewrite and an implementation plan. No
production code changes until approval.
