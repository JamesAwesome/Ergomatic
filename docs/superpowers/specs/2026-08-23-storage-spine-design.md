# The storage spine — the burst is the machine's finish, and work and rest come apart

**What and why, in plain words.** The PM5 announces its own finish: at
log commit it sends the final interval's data, the work-only summary
(0x0039), and the verification hash (0x003F), and jumps its state to
WORKOUTLOGGED — the 2026-08-23 walk captured the whole burst. We miss it
today for TWO reasons, not one: when the burst beats our own terminal
transition (3 of 5 committed finishes), **our gate discards a summary the
link delivered perfectly** (`graceIsOpen` refuses summaries before the
run closes); when our terminal wins the race, we hang up 21–107 ms later,
inside the burst's ~310 ms window. This spec accepts the burst on BOTH
sides of that race, stores work and rest as the separate quantities
Concept2 actually keeps, corrects the fake's lies about exactly these
fields, and adds a continuity bound that catches what F2a traded away.
TRIAD twice (a stored shape; what a record contains and when the guard
closes one) — full treatment. One spec, three PRs (James: "One spec,
phased PRs"; revised design after the antagonist pass killed the
original window mechanism, approved "Yes" 2026-08-23).

## 1. Research record

- **PRIMARY (walk 2026-08-23 keystone, re-decoded at the antagonist
  pass):** burst ordering on that finish — 0x0037 at t=171859.9, 0x0039
  at 172129.5, 0x003F at 172167.7, and OUR terminal transition at
  172309.3 (state 5→12 directly; **state 10 never appears in the
  capture**). The burst preceded our terminal by 142–449 ms and the
  0x0039 was received link-up and discarded by the gate
  (`driver.ts:2522`; the session-c shape `driver.ts:2293-2302` already
  documents). Across all five committed natural finishes the
  split-vs-terminal order goes BOTH ways (3 of 5 burst-first): **it is a
  race, and any design must serve both sides.**
- **PRIMARY (all five committed finishes):** the final interval's 0x0037
  arrived before disconnect every time — the synthesized-final-interval
  path has NEVER fired at a real erg. The burst's value is NOT "replacing
  synthesis": it is 0x0039's work-only totals, 0x003F's bytes, state 12,
  and robustness on the race's late side.
- **PRIMARY (measured):** production disconnect 21.7/24.1/30.6/107.3 ms
  after the terminal 0x0031 — the late-side loss mechanism.
- **Terminate: UNKNOWN, not "no burst".** Ring-3's teardown stashed the
  ring at our terminal — deaf by construction, the same shape that hid
  0x0039 for five walks. The walk card gets the properly-instrumented
  ask; until answered, terminate keeps today's synthesis and this spec
  claims nothing about it.
- **PRIMARY (code):** 0x0037's `intervalRestTimeSeconds` (offset 12) and
  `splitIntervalType` (offset 16) are decoded (`parse.ts:236,238`) and
  dropped. `IntervalActual` carries `restDistanceMeters` but not rest
  time/type. **0x0031 carries NO interval number** (all 19 bytes
  decoded; only an `intervalType` enum) — the machine's count is
  0x0033's, base-ambiguous (`interface-notes.md` §15 #1), and consumers
  see it only through `toProgramIndex`'s clamped/nullable output. The
  rings do not carry it at all.
- **Caveat carried verbatim (ROADMAP RC-1):** whether 0x0037's rest time
  is a measurement or a readback of the programmed rest is NOT
  established (every committed value equals the programmed rest). Stored
  as the machine's rest field, never sold as measured. **And the
  keystone cannot discriminate work-only totals (it is r0)** — the
  work-only pins use the rest-bearing captures (session-2: work 1535 m
  against fused 1599; pyramid: 1300 against 1347), where the two
  definitions actually differ.
- **F5 caveat:** TWD semantics inconsistent on time intervals; no part
  of this spec reads TWD except F2a's existing signature, unchanged.
- **Post-close writers, vetted ground:** `acceptableFinalBoundary` is
  today's ONLY post-close writer. Folding summary observations onto a
  closed record therefore requires a NEW post-close writer — §2 designs
  it explicitly and names its TRIAD weight, rather than pretending close
  semantics are untouched.

## 2. PR 1 — accept the burst, both sides of the race

**Early side (the gate bug — 3 of 5 finishes).** A 0x0039 arriving while
a natural finish is in progress is the machine's own finish
announcement. The summary-accept gate opens during an open run's FINAL
interval (the program's last interval, work or its trailing state) —
`noteSummary` buffers it instead of discarding, and the existing
reconcile path consumes it at close. No new timing machinery: the data
was already delivered; we stop refusing it.

**Late side (the hangup — 2 of 5).** Teardown's unsubscribe+disconnect
defers by `BURST_LINGER_MS = 2000` after the natural-finish terminal
UNLESS the burst was already received (early side ⇒ zero added latency).
The deferral lives at the HOOK/transport seam — the same seam the
hold-open instrument proved (the antagonist refuted a driver-level
window: teardown unsubscribes at STEP 3 before disconnecting at STEP 4,
and the driver's `schedule` doc holds "exactly ONE deadline" with
`FINISH_GRACE_MS`/`FINISH_HANDOFF_HOLD_MS` already coupled). The ring
stash ordering is corrected the same way `holdOpen.ts` corrected it:
whatever arrives during the linger reaches the stash.

**What the burst yields, and the new writer that holds it.** A new
**post-close observation writer** — TRIAD-weight, named here as such —
appends write-once observation fields to the just-closed record:
`summaryTotals` (0x0039's work-only elapsed/distance, numbers-only) and
`verificationBytes` (0x003F raw). It can ONLY append these two fields,
only once, only to a record closed by natural finish in the same
session, and it never mutates any existing field — the record's own
numbers, `endedBy`, and every close decision are byte-identical with or
without it. (Display consumes nothing from these fields in this spec;
they are oracle/RC-10 material.)

- **Terminate/END paths untouched** (unknown burst status, §1).
- **Watchdog:** the liveness decorator runs through the linger; a link
  death inside it just ends the linger early. No banner post-close (LL
  surface rules stand).
- **RC-7 rides here:** the synthesized-final fallback (never yet fired
  at the erg, kept as the fallback it is) stops writing
  `restDistanceMeters: 0` and omits instead.
- **Fake support (RC-8's first half):** the fake gains a natural-finish
  burst — final 0x0037/38 then 0x0039/3A/3F with work-only totals
  derived from its script — emitted through its existing scripted-event
  machinery (`atMs`-relative, honoring the wall-clock-free contract: the
  wrapper's clock drives it like everything else). Both race orderings
  are scriptable, because both are real.

## 3. PR 2 — RC-1: work and rest stored separately (TRIAD: stored shape)

- `IntervalActual` gains `restSeconds?: number` (0x0037 offset 12 — the
  machine's rest field, a readback per §1) and `type?: number` (offset
  16, stored raw; enum unverified). Additive-optional
  (`restDistanceMeters` precedent).
- Session-level: `workSeconds`/`workMeters` and `restSeconds`/
  `restMeters` stored separately, summed from actuals; fused totals
  become DISPLAY sums; screens do not change (RC-5 stays open and is not
  closed by this).
- **The display-sum invariant pins the ROUNDING LAW** (the antagonist's
  correction to exit 3): the displayed total must equal the legacy
  rendering to the digit, so the sum is computed as
  `round(Σ(work+rest))` — one rounding at the end, never
  `round(Σwork)+round(Σrest)` — and the pin asserts a case where the two
  laws differ.
- Server: additive columns/fields; migration additive; **no backfill —
  old records keep fused-only quantities forever, said above the fold.**
  API additive-only.
- **End-during-rest bound documented, not hidden:** an END during a
  trailing rest loses the just-finished interval's 0x0037 (arrives at
  rest END; terminate burst unknown). Falls back to synthesis, rest
  fields absent. Carried in the spec, DEVIATIONS, and the record's own
  absent fields; never estimated.
- **RC-8's remaining corrections gate this PR's tests** — at the sites
  the antagonist located: the `intervalRestTimeSeconds: 0` hardcode at
  `fake.ts:928`; `restSeconds` forced 0 off-rest; `ergMachineType: 1` in
  BOTH fake sites plus the three domain fixtures carrying it (real
  machine reads 0 in 3448/3448 frames); `splitIntervalType` reflecting
  the scripted kind. Every pin that can replay a committed capture does
  (fakes prove plumbing; captures prove meaning), and the work-only pins
  use the REST-BEARING captures per §1.

## 4. PR 3 — F2b: the interval-count bound (TRIAD: when the guard closes records)

- The guard gains 0x0033's RAW interval count as an ADDITIONAL bound —
  read pre-`toProgramIndex` (unclamped, never nulled by state), carried
  on the reading like the other axes: `after.intervalCount <
  before.intervalCount` ⇒ `"reset"`. The F2a three-axis signature stays
  unchanged as the other bound.
- **Honest capability statement:** on a 1-interval program the count
  never advances, the bound is inert, and the guard is exactly F2a —
  never worse, better wherever intervals exist. This closes F2a's §2b
  blind window on multi-interval programs (a mid-gap reset drops the
  count backward even when per-interval clocks read forward); the
  under-count scenario from F2a's §2b must convict in the exit tests on
  a multi-interval fixture.
- **Settled before shipped:** the §15 #1 base ambiguity (0- vs 1-based)
  against captures; a corpus sweep (all committed recordings — the rings
  are structurally blind to this field and are NOT exit evidence here)
  showing zero backward readings on healthy resumes, including
  boundary-straddling pairs (count legitimately increments across a gap
  ⇒ continuation) and the terminal-out-of-run re-arm shape (ring-3 seq
  6-8's leftover-numbers connect — swept from recordings of the same
  shape).
- **The distance-goal suppression is re-examined for THIS bound only:**
  if the sweep shows the raw count stable across distance-goal
  boundaries, the new bound runs even where the TWD signature is
  suppressed — the guard's first coverage on distance programs. If not,
  the suppression covers both and the spec records why.

## 5. Out of scope, said aloud

- RC-2/RC-3 (identity decode, 0x0039's nine fields as product data) —
  next wave; PR 1 records bytes, displays nothing.
- RC-5, RC-9, RC-10, RC-11 — unchanged homes. The hash equation stays
  INFERENCE until a sandbox POST tests it.
- Any display change. Any terminate-path change.

## 6. Exit criteria — written so they can go red

1. Fake-driven, BOTH race orderings: a burst-first finish folds 0x0039
   (the gate no longer discards it) and a terminal-first finish captures
   the burst inside the linger; both store `summaryTotals` +
   `verificationBytes` as write-once observations on a record whose
   every pre-existing field is byte-identical to a no-burst run.
2. Committed-capture replay (2026-08-23 keystone): the burst-first race
   is replayed end-to-end; the record carries summaryTotals 500.0 m
   work-only and the hash bytes `27d8f36e e152555b`; the final interval
   is the real 0x0037's (68.6 s / 250 m shape).
3. A post-RC-1 record stores work and rest separately; the display-sum
   pin includes a case where `round(Σ(w+r)) ≠ round(Σw)+round(Σr)` and
   asserts the former.
4. The work-only distinction is pinned on a rest-bearing capture
   (session-2: stored session work 1535 m ≠ fused 1599 m), not the r0
   keystone.
5. The fake's corrected fields each match a committed capture value; the
   `ergMachineType` fix covers both fake sites and the three fixtures.
6. F2b: the F2a §2b under-count scenario convicts on a multi-interval
   fixture via the count bound; the corpus sweep (recordings only) shows
   zero false convictions; base ambiguity settled and cited.
7. On a real PM5 (next walk, production build, one keystone-shaped piece
   WITH a rest — so work-only discriminates): the log's stored summary
   totals match the PM5 memory screen's work-only row, and the stored
   final interval matches its interval row — the first production row
   the machine itself confirms.

## 7. Gates and sequencing

- **Antagonist:** the full pass ran and KILLED the original mechanism
  (window-after-terminal; driver-level hold; an 0x0031 interval key that
  does not exist); this revision is its product. A **scoped DELTA pass**
  re-attacks only §2's burst-as-event + linger and §4's count bound
  before implementation.
- **PM final-PR gates on all three PRs** (spoken now: PR 1 adds a
  post-close writer and changes what a record contains; PR 2 is a stored
  shape; PR 3 changes when the guard closes records).
- Order: PR 1 → PR 2 (lands alone) → PR 3 (lands alone). Notes clauses
  accumulate to the next MINOR; the no-backfill sentence rides PR 2's.
