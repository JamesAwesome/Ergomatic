# The storage spine — the finished row becomes the machine's, and work and rest come apart

**What and why, in plain words.** Every real row today ends with the app
hanging up 21–107 ms after the last work frame — inside the ~310 ms
window where the PM5 sends everything that makes the row reconcilable:
the final interval's own data, the work-only summary, and the
verification hash (measured, walk 2026-08-23). And what we do store
fuses work and rest into totals Concept2 has no concept of. This spec
fixes both: the close waits for the machine's summary burst (with a
timeout that loses nothing we have today), and work and rest are stored
as separate quantities per interval and per session. It also corrects
the fake's lies about exactly these fields (or green tests mean
nothing) and re-keys the continuity guard onto a value that is actually
monotonic. TRIAD twice — a stored shape and several numbers' meanings —
so this spec takes the full treatment. One spec, three PRs (James,
2026-08-23: "One spec, phased PRs", design approved "Good").

## 1. Research record

- **PRIMARY (walk 2026-08-23, `docs/monitor/sessions/walk-2026-08-23/`):**
  the summary burst exists and is fast — 0x0037+0x0038 at the finish
  boundary, 0x0039+0x003A ~270 ms later, 0x003F ~40 ms after that; post-
  finish 0x0031s carry state 12 (WORKOUTLOGGED). 0x0039's totals are
  work-only (500.0 m exactly on the keystone) and match the PM5's memory
  screen field for field. A rower-initiated TERMINATE (PM5 Menu press,
  ring-3) produced NO burst — the burst is a natural-finish artifact.
- **PRIMARY (measured, pre-LL corpus):** production disconnects 21.7,
  24.1, 30.6, 107.3 ms after the terminal 0x0031 across all four natural
  finishes — before the burst, every time. 0x0039/0x003A: subscribed in
  all six committed recordings, zero notifications ever. The entire
  summary-fallback subsystem (`noteSummary`, `graceIsOpen`,
  `armSummaryReconcile`, `deriveFinalIntervalFromSummary`) is dead code
  at the erg today — this spec is what makes it live.
- **PRIMARY (code):** 0x0037's `intervalRestTimeSeconds` (offset 12) and
  `splitIntervalType` (offset 16) are already decoded
  (`parse.ts:236,238`) and dropped before storage. `IntervalActual`
  (`domain/monitor/types.ts:195`) carries `restDistanceMeters` but not
  rest time or type.
- **Caveat carried from ROADMAP RC-1, verbatim:** whether 0x0037's rest
  time is a MEASUREMENT or a readback of the rest we programmed is NOT
  established — every committed value equals the programmed rest exactly.
  It is stored as what it is (the machine's rest field) and never sold as
  measured.
- **Does the system have the concept?** The PM5 HAS a finished-row
  commitment event — state 12 plus the burst — proven on our firmware.
  What it does NOT have: a burst on terminate (proven absent), and any
  rest concept in Concept2's own `stroke_data` (rest lives in its own
  fields — the ecosystem review's reconciliation table).
- **F5 caveat (walk):** TWD's semantics on time intervals are
  INCONSISTENT across same-day captures (0 through 11 s of work; 81 m
  mid-interval elsewhere). Nothing in this spec may assume either
  reading; F2b's key deliberately avoids the field entirely.

## 2. PR 1 — the close-on-event (the finish race, fixed in product)

**Driver semantics.** Today: terminal 0x0031 (state 10) → teardown →
`driver.disconnect()` within ~100 ms. New: on the natural-finish
terminal, the driver enters a bounded **summary window**: the link stays
up until (a) the burst completes — final-interval 0x0037/0x0038 and
0x0039 observed (0x003A/0x003F captured opportunistically if they
arrive) — or (b) `SUMMARY_WINDOW_MS = 5000` expires (16× the measured
310 ms; a number, not a feel). Then the existing teardown proceeds
unchanged.

- **The record's close semantics DO NOT MOVE**: `endedBy` writers,
  `closeRecord` timing, and the summary screen's appearance stay exactly
  as shipped — the window holds the RADIO and folds DATA; it never
  delays what the rower sees. (The F2a lesson stands: changing when
  records close is its own TRIAD event; this PR does not.)
- **What the window folds:** the final interval's real 0x0037 replaces
  the synthesized final interval (`deriveFinalIntervalFromSummary`'s
  premises were capture-settled 2026-08-15; the reconcile path already
  exists and is drained on disconnect — this makes it fire while the
  link is still up, which is what it was built for). 0x0039's work-only
  totals are recorded alongside (a `summaryTotals` observation on the
  record — numbers-only, no new authority: they become an ORACLE row,
  not a displayed value; RC-9's verdict work stays out of scope).
  0x003F's raw hash bytes are kept with the record for RC-10-era use,
  raw and undecoded (byte order is settled but the hash equation is
  still INFERENCE).
- **Terminate/END paths are untouched:** no burst exists there (proven),
  so no window opens — the synthesized close stays as-is.
- **Watchdog interaction, stated:** the liveness decorator keeps running
  through the window; a link that dies inside it simply ends the window
  early (the fold falls back to synthesis — today's behavior). No banner
  can fire post-close (the record is closed; LL's surface rules stand).
- **RC-7 rides here** (per the ecosystem review's own ruling): the
  synthesized-final-interval fallback stops writing
  `restDistanceMeters: 0` — the field the code's own comment calls "a
  real gap" — and omits per the additive-optional shape instead.

**Fake support (the RC-8 half that gates THIS PR):** the fake gains a
natural-finish burst — final 0x0037/38, then 0x0039/3A (+0x003F
optionally) with work-only totals derived from its own script — so the
window is drivable in tests and e2e without hardware.

## 3. PR 2 — RC-1: work and rest stored separately (TRIAD: stored shape)

- `IntervalActual` gains `restSeconds?: number` (from 0x0037 offset 12,
  the machine's rest field — a readback, see §1) and `type?: number`
  (offset 16's `splitIntervalType`, stored raw; the honest name for a
  field whose enum we have not verified byte-by-byte). Additive-optional,
  the shape's established pattern (`restDistanceMeters` precedent).
- Session-level: the stored record carries `workSeconds`/`workMeters`
  and `restSeconds`/`restMeters` as SEPARATE stored quantities, summed
  from actuals; every currently-fused total becomes a DISPLAY sum
  (ruled — screens do not change in this spec; RC-5's three-heroes
  reconciliation remains its own ROADMAP item and is NOT closed by
  this).
- Server: additive columns/JSON fields only; migration additive, **no
  backfill — old records keep fused-only quantities forever, and the
  spec says so above the fold** (the #174 rule). The API stays
  additive-only between tags.
- **The end-during-rest bound, documented not hidden:** an END during a
  trailing rest loses the just-finished interval's 0x0037 (it arrives at
  rest END; a terminate has no burst). That interval falls back to
  today's synthesis, rest fields absent. This is a bigger undercount
  than anything RC-1 fixes and it is carried as a KNOWN BOUND in the
  spec, DEVIATIONS, and the record's own absent fields — never patched
  by estimation.
- **RC-8's remaining corrections gate this PR's tests:** the fake stops
  hardcoding `intervalRestTimeSeconds: 0` (`fake.ts:878`) and forcing
  `restSeconds` 0 off-rest; `ergMachineType` becomes 0 (the real
  machine's 3448-of-3448 reading); `splitIntervalType` reflects the
  scripted interval kind. Every RC-1 pin that can be replayed from a
  committed capture IS (the fake proves plumbing; captures prove
  meaning).

## 4. PR 3 — F2b: the guard re-keyed on the interval index (TRIAD: when records close)

- The continuity guard's PRIMARY key becomes the machine's interval
  number (0x0031's own field, already decoded) — monotonic per session
  by construction (1, 2, 3…), reset to start only by a genuine
  reprogram/reset. `after.intervalIndex < before.intervalIndex` →
  `"reset"`. The F2a three-axis signature STAYS as a second bound (belt:
  index equal but all three axes backward is still a reset).
- This closes the blind window F2a traded away (a reset mid-gap drops
  the index backward even when per-interval clocks read forward), and
  the silent-under-count risk inherited from F2a's §2b is re-measured at
  the spec's own exit: the merged-stream scenario must now convict.
- **Corpus-swept before trusted** (the F2a discipline): zero index-
  backward readings across every healthy simulated resume in the corpus,
  including the 2026-08-23 rings; the interval-number base ambiguity
  (`interface-notes.md` §15 #1 — 0-vs-1 base) is settled against
  captures before the comparison ships, and the sweep must include a
  boundary-straddling pair (index legitimately increments across a gap —
  must be continuation).
- The distance-goal suppression is RE-EXAMINED for this key: interval
  index does not flicker with the goal the way TWD does — if the sweep
  confirms, the suppression NARROWS to the TWD bound only, and the guard
  finally works on distance programs too (today it is fully suppressed
  there). If the sweep says otherwise, the suppression stays and the
  spec records why.

## 5. Out of scope, said aloud

- RC-2/RC-3 (identity decode, the nine 0x0039 fields as product data) —
  next wave; PR 1's capture makes them implementable, this spec only
  RECORDS the bytes.
- RC-5 (three heroes), RC-9 (oracle verdicts), RC-10 (C2 sandbox), RC-11
  (stroke-data reframe / the `p: 0` half) — unchanged homes.
- Any display change — screens render the same numbers they do today.
- The verification hash's decode — raw bytes only; the equation is
  INFERENCE until a sandbox POST tests it.

## 6. Exit criteria — written so they can go red

1. A fake-driven natural finish stores the final interval from a real
   0x0037 (not synthesis) and records 0x0039's work-only totals; a
   fake-driven terminate stores today's synthesized shape unchanged.
2. A committed-capture replay (the 2026-08-23 keystone) folds the real
   burst: final interval 250 m/1:08.6-shaped, summary totals 500.0 m
   work-only, hash bytes present.
3. A stored post-RC-1 record carries work and rest separately; its
   displayed totals are byte-identical to the pre-RC-1 rendering of the
   same session (the display-sum invariant, pinned).
4. The fake's corrected fields match the real wire on every RC-8 point,
   each pinned against a committed capture value (not a round trip).
5. F2b: the merged-stream under-count scenario from F2a's §2b now
   convicts (index backward); the full corpus sweep shows zero false
   convictions; the walk's ring-phone-2 healthy resume stays a
   continuation under the new key.
6. On a real PM5 (next walk, one keystone piece, no new instrument —
   production build): the log's final interval matches the PM5 memory
   screen's second interval row, and the stored summary totals match
   0x0039's — the first production row the machine itself confirms.

## 7. Gates and sequencing

- **Antagonist: FULL pass on this spec** (TRIAD twice; the close window
  and the re-key are invented mechanisms; the anchor's vetted ground
  covers neither).
- **PM final-PR gates on PR 2 and PR 3** (stored shape; when records
  close). PR 1 changes what a record CONTAINS at a natural finish
  (numbers' meaning at the margin: the final interval becomes real
  data) — it takes a PM final gate too. All three spoken here so no
  gate is discovered at merge time.
- PR order is dependency order: 1 (window + fake burst) → 2 (storage,
  lands alone) → 3 (re-key, lands alone). Notes: one clause per PR
  accumulates to the next MINOR; the no-backfill sentence rides PR 2's
  clause.
