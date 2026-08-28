> **Archived 2026-08-28** from `ROADMAP.md` (lines 2972-5315 of the pre-rebalance file, main `39e9430`).
>
> This is the phase as it was written while it ran. It is a RECORD: nothing
> here is scheduled, and its open items were lifted into `ROADMAP.md`'s live
> slate before this file was created. Do not cite it for a live question.
>
> ---
>
> **ANNOTATED 2026-08-28, the evening of the close. The phase is NOT reopened
> — but one of its exit criteria did not hold, and reading this file without
> knowing that would mislead you.**
>
> **`MACHINE CONFIRMED · WORK ONLY` has never rendered on a saved row on real
> hardware.** The machine's own totals and the verification code reach the
> driver and are emitted, then are never stored, because
> `LogSession.tsx:1487` snapshots the run at mount and never re-reads. Since
> `storedSummary.ts:617-621` gates tier A on the same two columns, **every
> stored connected row's three heroes are our own arithmetic rather than the
> erg's** — the opposite of what this phase's name promises. Evidence:
> `docs/monitor/sessions/walk-2026-08-28/summary-never-stored-ring.json`. The
> fix is a named TRIAD item in `ROADMAP.md`'s Wave F.
>
> **Why the exit passed anyway, and this is the part worth learning:**
> criterion (a) was verified against the `walk-2026-08-24` exit-7 table, whose
> column is headed *"App stored (WIRE→record)"* while the cell beneath it
> cites a **driver ring entry** — the wire end, not the record. That walk ran
> on **v0.21.0 build 738**; the storage columns (#190) and the block itself
> (#192) shipped the NEXT DAY in v0.22.0. **A criterion cannot be verified on
> a build where its code does not exist.** Criterion (e) has the sibling
> defect: it asked whether 0x003F fires, was true as written, and could never
> have noticed that the byte does not reach a row.
>
> Five hardware walks ran after the block shipped and none mentions it —
> `grep -rl "MACHINE CONFIRMED" docs/monitor/` was empty until the
> 2026-08-28 capture was filed.

## Phase RC — The row Concept2 would recognise

**MOVED HERE AT THE PHASE CLOSE (2026-08-28).** This block used to sit
~1,940 lines below this header, which is why nobody could find it — the
close-out's own checklist item said so. The criteria themselves are
unchanged except where each says it was rewritten or discharged.

**WHAT THIS PHASE ACTUALLY BUILT, said plainly at its close (PM gate,
2026-08-28), because the phase's own name will not say it.** Every oracle
Phase RC shipped reads a DIFFERENT REGISTER OF THE SAME PM5 — 0x0032's
cumulative average pace, 0x003A's Total Rest Distance, 0x0039's
end-of-workout totals. That is a real class upgrade over the only check
this project had before (the app against itself, and the TWD "verdict"
that turned out to be our own accumulator compared with our own decode of
the same odometer — RC-9c retired it for exactly that). It is NOT the
external authority "the row Concept2 would recognise" promises: **no row
of ours has ever been to Concept2.** RC closes having proven consistency
inside one erg. Criterion (d) below is where that gap is discharged, and
the successor phase carries (d)'s own sentence into its exit block on the
day it opens.

**Exit — written so it can go red.** (a) A row rowed on a real PM5 stores
work and rest as separate quantities, and its work-only distance and time
equal the monitor's own for the same piece; (b) the monitor's log entry
date/time is decoded and logged from a real finish, with the
seconds-resolution question answered either way; (c) the three heroes on
one stored row reconcile with each other by hand arithmetic
**[REWRITTEN 2026-08-28 — see (c) below, which the original could not
survive]**; (d) a row posted to the Concept2 sandbox comes back through
`export/` matching what we stored, or the reason it cannot is documented
**[DISCHARGED BY THE DOCUMENTED REASON — see (d) below]**; (e) if 0x003F turns out
not to fire on our firmware, DEVIATIONS carries the row saying so and the
verification branch is closed on the record rather than left hoped-for.

**(c) REWRITTEN AND MET, 2026-08-28.** The original sentence — "the three
heroes on one stored row reconcile with each other by hand arithmetic" —
**has never been true of any build of this app**, in three distinct ways, so
it could not go red. An adversarial PM pass established all three. Rewritten
with a tolerance and a named population:

> On a stored row whose close is `finished` and whose intervals carry no
> null-index actual, DISTANCE, TIME and AVG SPLIT reconcile by hand
> arithmetic to within **1.0 s/500 m** (tier A's designed truncation gap —
> the PM5 truncates, we round). Three populations are exempt, named:
> **(i)** rows with an INCOMPLETE close saved 2026-08-22..2026-08-25, between
> `ended_by` shipping (#160) and RC-5 shipping (#194), which render the fused
> stored columns and disagree by up to ~26 s/500 m — **closed, non-growing,
> and unreachable by the `endedBy` relabel** (that changes how FUTURE rows
> close; only a backfill touches these, and none is planned). Pre-disclosed
> to testers at v0.23.0's item 5.
> **(ii)** any row carrying a RECORDED null-index actual — DISTANCE/TIME
> include it, AVG SPLIT excludes it by construction, ~10 s/500 m. Ongoing,
> affects `finished` rows too, observed in zero committed rings.
> **CITATION CORRECTED at the PM close gate, 2026-08-28 — the exemption
> stands, the line it pointed at did not support it.** It cited
> `storedSummary.ts`'s "Null-index/warm-up parity DOES NOT HOLD" paragraph,
> which sits inside **TIER B2**'s description and ends "now genuinely
> bounded, because the `endedBy` gate above confines this branch to the
> provably-historical population" — i.e. that paragraph says the opposite
> of "ongoing", and reading only the heading is recurring failure 16's
> second corollary happening inside the fix for it. The exemption is
> nonetheless REAL, and its evidence is **TIER B1**'s own paragraph three
> above: on any post-RC-1 `finished` monitor row, DISTANCE/TIME come from
> RC-1's work pair, which counts a null-index actual ("with no null-index
> or warm-up exclusion"), while AVG SPLIT comes from
> `tierBAvgSplitSeconds(row.steps)`, which cannot see it because a
> null-index actual never becomes a step. Two different consequences of one
> gap, in two different tiers; (ii) is the B1 one.
> **(iii)** tier A, where the machine's own avg pace can disagree with its
> own totals (walk-2026-08-20, 901 vs 899).

**MET, and population (i) VERIFIED EMPTY by inspection (James, 2026-08-28).**
He photographed five consecutive stored rows spanning the window — Ground Fog
(22 Aug), Comma Cloud (24th), Corona (25th), Line Squall (26th), Ice Fog
(27th). Hand arithmetic on each, `TIME / DISTANCE * 500`:

| row | time | distance | implied | shown | delta |
| --- | --- | --- | --- | --- | --- |
| Ice Fog | 1800 s | 6574 m | 2:16.9 | 2:16.9 | 0.0 |
| Line Squall | 868 s | 3500 m | 2:04.0 | 2:03.9 | 0.1 |
| Corona | 1072 s | 4000 m | 2:14.0 | 2:14.1 | 0.1 |
| Comma Cloud | 1260 s | 4937 m | 2:07.6 | 2:07.6 | 0.0 |
| Ground Fog | 1680 s | 6192 m | 2:15.7 | 2:15.7 | 0.0 |

Worst case **0.1 s/500 m**, an order of magnitude inside the tolerance; the
exempt cohort would be off by ~26 s.

**THE TOLERANCE IS DISTANCE-DEPENDENT, AND EVERY VERIFYING ROW IS LONG
(antagonist exit pass, 2026-08-28 — recorded on the criterion rather than
left for the next reader to hit).** 1.0 s/500 m is a RATE, but the rounding
noise it absorbs scales as `500 / distance`: one second of displayed-time
rounding moves the implied split by 0.076-0.14 s/500 m on the five rows
above (3500-6574 m), by **1.0 s/500 m on a 500 m row**, and by **2.0 on a
250 m row** — the keystone shape this phase rows constantly. So the
criterion has only ever been exercised where its own tolerance is loose by
tenfold, and on a short row it can go red on arithmetic rounding with
nothing wrong. **The criterion therefore applies to stored rows of 1000 m
or more**, where one second of rounding stays under 0.5 s/500 m; a shorter
row needs the tolerance restated as a function of its own distance before
it can be judged by this clause. Naming the bound is the point — an
unstated one would have been discovered by a red build on a keystone. **AND THE ORDER OF THESE TWO IS BACKWARDS — corrected at the exit pass,
2026-08-28.** The load-bearing evidence is not the table; it is that every
photographed row carries a `plus N m coasting in rest` clause, which is
precisely what an incomplete close CANNOT have. The table alone cannot
exclude the cohort, because the criterion's own figure for population (i)
is *"up to ~26 s/500 m"* — an UPPER bound, so a population-(i) row with
little rest coast would reconcile to 0.1 too.
**Why the coasting clause does the work, traced through two files (nobody
had written this down, and it is the reason to believe the row):**
`monitorRun.ts`'s writer refuses RC-1's four fields for any `endedBy` other
than `"finished"` ("no attempt beats no number"), so `storedSummary.ts`'s
`buildStoredRest` rung 1 cannot fire on an incomplete close; and rung 2 is
gated on `isReconstructableClose`, which admits only `"finished"` or
`null`. A rest clause on the row therefore PROVES a complete close. All
five are complete closes rendering work-only heroes. **No user-facing note
is owed**, because the cohort is empty.

**(d) CARRIED FORWARD — corrected from "DISCHARGED" at the antagonist exit
pass, 2026-08-28, and the correction is the honest word.** The clause reads
*"or the reason it **cannot** is documented"*, and what was offered was a
reason it **was not done**: "it deserves its own phase", quoted beside
James's *"we can open the logbook Saturday"* — which is affirmative evidence
that it CAN be. Scheduling is not impossibility, and this is the only
criterion in the block that reaches outside our own definitions, so
retiring it by rename would be the most expensive place in the record to be
loose with a word.
**What makes CARRIED FORWARD real rather than a nicer label for the same
thing:** the receiving phase carries THIS SENTENCE into its own exit block
on the day it opens — *"a row posted to the Concept2 sandbox comes back
through `export/` matching what we stored, or the reason it cannot is
documented"* — and that requirement is written into the logbook item below,
not just into this paragraph. The criterion survives the rename or the
close was not honest.
**Why it is carried rather than held:** **the Concept2 logbook
cross-connect is real work that deserves its own phase, not the last item
holding a phase open.** It is the first oracle OUTSIDE our own definitions —
Concept2 stores work only, so agreement there means something that agreeing
with our own accumulator never did (recurring failure #11's "an oracle that
shares your definition is a mirror"). What is already recorded and carries
forward: the dev API key lives in the repo-root `.env` and its VALUE is never
read into a transcript or a committed file; the `weight_class` gate; and the
ErgData-dedup question. **Opens as its own phase, 2026-08-29.**

**Status:** CLOSING — the close-out PR is open (2026-08-28). All five exit
criteria are MET or DISCHARGED on the record; the block is at the top of
this section. What the close-out PR carries: the oracle corpus test (every
committed capture replayed through the real driver, both shipped oracles
asserted, and RC-9(b)'s comparison finally made), RC-12's comment and
diagnostic-string reconciliations, and the checkbox/bookkeeping repairs
below. **What stays OPEN and moves out of the phase**, unchanged in
priority: RC-7, RC-8, RC-10, RC-11, RC-13, RC-14, RC-17, RC-18, RC-29,
RC-30, RC-38, RC-9's live (b) verdict, RC-12's two remaining
domain/server sites, the PARTIAL-on-an-abandoned-piece complaint, and the
pre-row lock (reproduced on the 2026-08-28 walk, deliberately NOT claimed
in v0.26.0's notes). **The Concept2 logbook opens as its own phase on
2026-08-29** — that is exit criterion (d)'s documented reason, not an
omission.

**WHERE THE SECTION'S 22 STILL-OPEN ITEMS GO (PM close gate, 2026-08-28 —
"moves out of the phase" is not a disposal, and a section headed CLOSED
over live items is the same pattern with a nicer label).** They stay
written HERE, under this header, because their evidence is here and
moving them would break every citation; the destination is the OWNER, and
each is named:
- **The Concept2 logbook phase (opens 2026-08-29):** the logbook
  cross-connect itself, **RC-10** (the sandbox as a test oracle), and
  **RC-9's live (b) verdict** — all three want the same key and the same
  sitting.
- **PHASE PROTO, a wire-semantics audit:** **RC-38**
  (`OBJ_WORKOUTTYPE_T`, read one row deep) and the axis-quantity question.
  PROTO is itself an unopened phase and stays that way until James opens
  it.
- **Phase LM (lifecycle):** the pre-row lock, now filed in LM's own list
  with its walk evidence rather than living in this paragraph.
- **The next PR that touches `app/domain/` or `app/server/`:**
  **RC-12's** two remaining sites, **RC-7**, **RC-18** (paired with the
  `door` column, wants the next stored-shape change).
- **The next connected-surface PR:** **RC-17**, **RC-11**, **RC-8** (the
  fake's contradictions), the C' rider, PR 1's residual capture-rate gap.
- **Their own decisions, needing James, not a queue:** **RC-29** and
  **RC-30** (both send or suppress a wire command — the triad line),
  **RC-13** and **RC-14** (two distinct zero-fires), the
  PARTIAL-on-an-abandoned-piece complaint, the "run it again" log-screen
  idea, and the two remaining owed walk legs.
No item is closed by this paragraph; it exists so that nothing here reads
as finished because the header above it does.

*Previously:* OPEN, mid-phase (updated 2026-08-24, exit-7 walk PASSED).
The storage-spine spec (`2026-08-23-storage-spine-design.md`) is FULLY
EXECUTED — PR 1 (#180), PR 2 (#182, RC-1 storage), PR 3 (#183, F2b
count bound) — **and hardware-verified: the exit-7 walk on production
build 738 matched the PM5's memory screen digit for digit
(work-only 124s/500m, final interval :56.1/250/1:52.2, TWD 742;
record: `docs/monitor/sessions/walk-2026-08-24/`). The display gate
is UNLOCKED.** **CORRECTED (RC-9, this PR): "TWD 742" reverses which
system owns which name — Total Work Distance is OUR OWN wire-field
name for 0x0031, never a label the PM5's memory screen itself prints;
the 742 the walk actually matched is the hand-summed 500+147+95 across
three separate screen ROWS (the same figure `walk-2026-08-24/README.md`'s
own DISTANCE-hero row is now marked CORRECTED IN PLACE for — a mirror
between our accumulator and our own TWD decode, both the identical
work-plus-rest-coast odometer, RC-9c retiring the verdict that ever
compared them for exactly that reason). RC-9 (this PR) corrects that
account of TWD (`pm5-interface-notes.md` item 25) and wires two
genuinely independent oracles the exit-7 walk never had: 0x0032's own
cumulative average pace and 0x003A's own Total Rest Distance — see
RC-9's own row below (search the ring for `avg-pace-verdict` and
`rest-distance-verdict`) for what a walk should now read.** The same
walk's lab leg settled the terminate question:
a Menu-kill emits the full log-commit burst, hash included
(`pm5-interface-notes.md` §25) — the terminated path can carry the
same observation capture, in the RC-2/RC-3 wave's scope. The phase's
live frontier (updated at #191's PM gate): series-truth LANDED — the
stored series stops losing intervals on distance-with-rest pieces
(single-deriver attribution, state-9 mirror, loud backward-bucket
alarm; prospective only), shipped BEFORE the summary-record wave's
PR 2 by James's sequencing call. CORRECTION to the exit-7 claim below:
the walk verified the ACCUMULATOR against the monitor digit for digit;
it did NOT verify the stored series, which that same session saved
missing 56.1s of its faster interval (found by James reading the
graph, fixed by series-truth). The summary-record wave's PR 1 LANDED
earlier — RC-2 (diagnostic decode) and RC-3's storage half shipped,
terminate capture live through the four gates. **PR 2, the MACHINE
CONFIRMED · WORK ONLY display block, has now also landed (summary-
display wave, this PR)** — the axis-collision input is RESOLVED BY
LABELLING (James's ruling, 2026-08-25: the block reads `MACHINE
CONFIRMED · WORK ONLY` with a caption naming the split, rather than
redesigning the chart's axes), and the connected screen's meters
counter reverts to its 1m realtime granularity (James's reversal of
the CM calm rule). The summary-record wave (RC-2 + RC-3 + display, PR 2
= #192, made explicit here rather than the earlier self-referential
"this PR") **RELEASED as v0.22.0 (build 747, shipped the morning of
2026-08-25)** — no longer "pending its own release." The v0.21.0 notes
debt is paid (v0.21.0 shipped as build 738). **RC-5 (hero-truth) has
since SHIPPED on top of that release** — the three stored heroes stop
contradicting each other (two tiers, the machine's own numbers where it
spoke; the wall-clock total gets its own line beneath) — see RC-5's own
row below for the full record; not folded into this paragraph's earlier
prose since it is a separate spec/PR, but named here so Phase RC's
status paragraph doesn't go silent on its own most recent work. Earlier:
#167 (instrument + RC-4/RC-6), #174 (F2a), #177 (cohort unlock); the
combined walk answered every wire question YES (record:
`docs/monitor/sessions/walk-2026-08-23/`). Originally opened 2026-08-22
(James: evidence-first); named, scoped and
evidenced by the ecosystem review of 2026-08-21
(`docs/monitor/pm5-ble-ecosystem-review.md`).

**Asset on hand (James, 2026-08-22): a Concept2 Logbook DEVELOPMENT API
key already exists in the repo-root `.env`, currently unused.** Presence
verified (one matching line; the value itself deliberately never read or
recorded anywhere). When this phase opens, the logbook half of its oracle
work does not start from a registration queue — it starts from a key we
already hold. `.env` is untracked, so the key must ALSO never appear in
any committed file, fixture, or capture; the spec should name where it is
allowed to live (real env only, same stance as `DATABASE_URL`).

**What and why, in plain words.** We have never checked our rows against
anything outside our own app. On 2026-08-21 a fourteen-agent adversarial
review checked them against Concept2's published logbook schema, and the
answer is that **our rows would not reconcile today, for two reasons that
no accuracy work touches.** We store the wrong quantities, and we hang up
before the machine tells us which row we just rowed. Both are fixable.
The prize for fixing them is not a logbook feature: it is that Concept2's
own server becomes the external oracle this project has never had.

**The bar, and its three branches** (settled from Concept2's published
API, PRIMARY):

- **Numeric agreement** — our row matches the monitor's own log entry
  field for field. **REACHABLE.** Needs RC-1 below plus Phase LL's link
  work. Needs nothing from Concept2.
- **`verification_code`** — the PM5 computes a 16-digit hash over date,
  distance and duration and publishes it on 0x003F. C2 accepts the code
  only if date, time, distance, workout_type and machine type all match
  what the code was computed over. **REACHABLE IN PRINCIPLE**, gated
  behind three unknowns (firmware band, fire timing, byte order) and
  behind Phase LL's A-2. **This is the whole point of the phase:** a code
  that fails closed is a permanent regression detector on every number we
  compute, with no erg and no two-screen photograph.
- **`verified: true`** — **CLOSED.** Concept2's own words: "Only trusted
  clients are able to verify workouts. Please contact Concept2." No
  amount of accuracy buys it. Stop asking.

**James is obtaining a Concept2 developer key** (2026-08-21). That
settles the review's first open decision and puts the sandbox in scope:
`log-dev.concept2.com` is a real sandbox, and
`GET /results/{id}/export/{csv|fit|tcx}` hands back Concept2's own
canonical file for a row. It is the only external oracle this project has
that needs no erg, and it can run in a test.

### The two blockers, measured

- **We store the wrong QUANTITIES.** C2's `distance` and `time` are
  work-only, with rest in its own fields; ours are work + rest + warm-up.
  Measured deltas against work-only truth: **+64 m / +90 s**
  (session-2-wu-4unequal), **+47 m / +120 s** (pyramid). C2 dedups on
  (user, date, time, distance), so that is two rows, always.
  **The killer detail is that our own oracle cannot see it:** Total Work
  Distance is work + rest too, decoded to the metre on two captures
  (1535 + 64 = 1599; 1300 + 47 = 1347). PR #123's celebrated sub-metre
  three-way agreement proves our accumulator matches the machine on a
  quantity Concept2 does not store. **An oracle that shares your
  definition is a mirror.**
- **We never get the row's identity, because we hang up first.** Measured
  from the terminal 0x0031 to our own recorded disconnect, all four
  natural finishes: **21.7, 24.1, 30.6 and 107.3 ms.** And the census
  that reframes it: **0x0039 and 0x003A are in the subscribe list of
  every one of the six committed wire recordings and have delivered ZERO
  notifications, ever, across five natural finishes.**
  WORKOUTSTATE_WORKOUTLOGGED has never appeared either; every recording's
  maximum state is 10. One hypothesis explains all three — the PM5 emits
  its end-of-workout characteristics when it commits the log entry, and
  we hang up microseconds too early, by construction, every time. The
  entire summary-fallback subsystem (`noteSummary`, `graceIsOpen`,
  `armSummaryReconcile`, `deriveFinalIntervalFromSummary` and its two
  agonised-over premises) is **dead code at the erg.**

### The work

- [x] **F2a — DEFUSE the continuity guard's single-reading conviction
      (from Phase LL's exit walk, 2026-08-23). TRIAD (changes when records
      close), full cycle, spec first, LANDS ALONE, sequenced BEFORE
      RC-1.** The guard convicts on one backward TWD reading even when the
      SAME frame's elapsed and distance are advancing; a real monitor
      reset zeroes all three. Require corroboration before closing a
      record. This is a BOUND, not a key — and F2b (SHIPPED, #183) is a SECOND bound, not a re-key: the §2b
      silent-under-count trade stays LIVE on distance-goal programs
      (suppressed), interval 1, and 1-interval programs. What would
      settle the suppression lift: a committed capture of a
      non-distance-goal armed program (the whole corpus is
      distance-goal under the production predicate — 0/0 vacuous), or a
      real interruption recording (true-positive evidence is
      synthetic-only). **The vacuum's denominator (the #183 PM gate):
      198 of the seeded library's 300 workouts contain NO distance step
      — the bound ships LIVE on ~66% of the library with zero swept
      pairs under the governing predicate. The corpus (6 captures, all
      distance-armed) is unrepresentative of the library; the 0/0 is an
      evidence gap on the live path, not inertness.** The v0.20.0 notes clause ("until a deeper fix
      lands") owes an update at the next tag: the deeper fix narrowed
      the window, it did not close it. Evidence: the six-row TWD table in the LL walk card's
      corrected F2 and `walk-2026-08-23/ring-phone-2-background-continuity-kill.json`.
      **Shipped, see `continuity.ts` + spec 2026-08-23-continuity-corroboration.**
- [x] **RC-1 — Store WORK and REST separately, per interval and per
      session.** TRIAD (stored shape + a number's meaning). Nothing else
      moves reconciliation. Add `restSeconds` and `type` to
      `IntervalActual` from 0x0037 offsets 12-13 and 16 (they sit beside
      `restDistanceMeters`, already carried from offset 14); store work
      and rest as separate columns; keep the fused number as a DISPLAY
      sum. **Two caveats the spec must carry:** (a) whether 0x0037's rest
      time is a MEASUREMENT or a readback of the rest we programmed is
      NOT established — every committed value equals the programmed rest
      exactly — so do not sell it as the machine's measured rest; (b)
      0x0037 arrives at the END of an interval's trailing rest (session-2
      num=2 at t=142906 with the next interval's clock already at 0.03),
      so a session ended during a rest loses the just-finished interval
      entirely. That is a bigger undercount than anything RC-1 fixes and
      belongs in the same spec. **Also carries the program-time warm-up
      question** (see "The warm-up question" below): whether a warm-up is
      compiled into the same PM5 piece as the working intervals is a
      compiler change, it decides what a rower's Concept2 totals read, and
      RC-1's spec is where it lands. **And carries F2b (Phase LL walk,
      2026-08-23): re-key the continuity guard off TWD entirely** — the
      walk proved TWD non-monotonic and inconsistent on time intervals
      (five zeros against one 81 in one day; the LL walk card's corrected
      F2 has the table). The spec inherits the CORRECTED root cause,
      never the filed "iOS was outside the corpus" wording. **Owed risk
      from F2a's own trade (final-review MEDIUM-1, 2026-08-23): a record
      F2a now MERGES instead of closing can SILENTLY UNDER-COUNT, not
      read as visibly wrong — `driver.ts`'s per-interval session register
      max-merges post-reset metres against the pre-reset value (300 m
      rowed + a reset + 200 m more stores ≈300 m, not 500 m) — so RC-1's
      re-key spec must not assume a merged record announces itself.**
      **SHIPPED (PR2 Task 3, storage-spine spec §3):** `MonitorRun` gains
      `workSeconds`/`workMeters`/`restSeconds`/`restMeters`, computed once
      by `completeMonitorRun`'s own `endedBy === "finished"` branch (and
      re-summed by `recordActual`'s late finish-grace branch when the
      final actual arrives after close) — never for a terminate/link-lost/
      program-failed close, matching caveat (b) above exactly: those
      closes' actuals are incomplete by construction, so no attempt is
      made rather than an under-count. The rest pair is all-or-nothing
      (one actual missing rest data omits `restSeconds`/`restMeters` from
      the WHOLE record, never a partial sum). Server: four nullable
      columns beside the fused hero columns
      (`session_logs.work_seconds`/`work_meters`/`rest_seconds`/
      `rest_meters`, migration 0015), additive — **the SECONDS pair is
      `double precision`** (0x0037's elapsed decodes in TENTHS; the first
      cut's integer columns 400'd real saves — the final review's
      blocker), the meters pair integer (whole-metre wire fields);
      POST-validated non-negative-FINITE-or-null for seconds,
      non-negative-integer-or-null for meters. **NO BACKFILL: every `session_logs`
      row and every `MonitorRun` written before this PR keeps its
      fused-only quantities forever — these four fields are simply absent
      on it, and no migration or reader ever tries to derive them after
      the fact.** The display sum is UNCHANGED and does not read these
      fields (pinned by construction: `summaryModel.test.ts`'s own test
      swaps in wildly wrong values on all four and asserts the rendered
      heroes don't move) — RC-5 is NOT closed by this (see its own row
      below). The re-key (F2b) is PR 3's own task, out of this PR's scope.
      **F2b — SHIPPED, but in PR 3, not this PR's own diff**
      (storage-spine spec §4, 2026-08-24): the guard gains 0x0033's raw
      Interval Count as an ADDITIONAL bound —
      `after.intervalCount < before.intervalCount` ⇒ `"reset"`, alongside
      F2a's unchanged three-axis signature — closing exactly the blind
      window F2a traded away (a mid-gap TWD reset with per-interval clocks
      still reading forward), never WEAKER at catching a reset, and byte-identical to F2a wherever
      the count is absent (interval 1, 1-interval programs, pre-first-0x0033). **Suppression
      decided with both eyes open, sweep numbers on record:** the count
      bound runs under the SAME distance-goal suppression F2a already
      uses, not lifted. Both `distanceGoal` predicates were swept
      (`continuity.test.ts` PART 5, a 30 s-gap slide over the 6-file
      corpus): the WIRE predicate (per-sample
      `workoutDurationType === 128`) came back clean — 0 backward count
      readings across 1,026 non-suppressed pairs; the PRODUCTION predicate
      actually in force (`programHasDistanceGoal(run.program)`, the armed
      program) also came back clean but **VACUOUS** — 0 backward readings
      across **0** non-suppressed pairs, because every one of the six
      committed corpus files armed a program containing a distance
      interval, so the predicate suppressed the whole corpus before a
      single pair was tested. A 0-pair "clean" is an absence of evidence,
      not evidence of safety (repo rule 11) — **KEPT under suppression,
      not lifted.** **Honest capability statement:** the count reads 0
      through the whole first interval and on every 1-interval program
      (0-based, forward-attributed — pm5-interface-notes.md §15 #1's
      correction), so the bound is inert there — 78.3% of 30 s-gap corpus
      pairs see no count change at all; where it IS live (multi-interval,
      past interval 1) it closes F2a's blind window exactly. True-positive
      conviction power is SYNTHETIC-ONLY: no committed recording contains
      an interruption episode, so the bound's own convicting test runs on
      a constructed multi-interval fixture, not a captured one. New wire
      fact backing the bound: 0x0033's Interval Count changes at REST
      ONSET, independently corroborating the end-during-rest bound above
      (pm5-interface-notes.md §20 item 26).
      The warm-up program-time question named above never reached this
      spec at all — Phase WU (shipped 2026-08-22, PR #150) removed
      warm-up as a compiler concept before RC-1 started, exactly the
      sequencing rationale below (WU precedes RC-1) predicted.
- [ ] **PR 1's own residual capture-rate gap (final whole-branch review,
      2026-08-23, RF14): the burst is not caught 100% of the time even
      after HIGH-1/HIGH-2 shipped.** PR 1 (`rc-spine`, walk-2026-08-23
      keystone) fixed the two defects the review found on the LATE side —
      a split claiming the finish grace no longer shuts the door on the
      0x0039 that follows it (HIGH-1), and the drain no longer fires
      blind on 0x0039 alone, 38ms before 0x003F would have arrived
      (HIGH-2, `HASH_SUBWINDOW_MS`). **One gap survives both fixes,
      already bounded and documented in code (`driver.ts`'s own
      "TWO LOSS MODES" comment, `noteSummary`) but never stated where a
      reader tracking the real capture rate would see it:** the EARLY
      side's own admission check (`currentIndex === lastIndex`, sourced
      from 0x0033's `intervalCount`) cannot buffer a 0x0039 that beats
      this run's very first 0x0033 sample (`toProgramIndex` returns
      `null`, nothing to compare), or one landing while `intervalCount`
      still names a PRIOR interval (0x0033's own sample gap swallowing
      the burst's ~142-449ms window whole, per §1). Both funnel to
      `out-of-window`, silently. **#183 (spine PR 3) delivered the raw material — an unclamped
      frame-level `rawIntervalCount` — but the admission check still
      runs on `toProgramIndex` and does NOT consume it (the #183 PM
      gate's audit): the capture-rate gap stands. Successor owner: the
      RC-2/RC-3 wave's spec, which touches the same admission path and
      inherits this sentence.**
- [x] **~~NO DISPLAY of `summaryTotals`/`verificationBytes` before exit
      7's photograph~~ — GATE SATISFIED 2026-08-24: the walk's
      production-build captures (PM5 View Detail photo + build 738's own
      stored record + the linger-end second stash) matched digit for
      digit; record `docs/monitor/sessions/walk-2026-08-24/`. Display of
      both fields is now permitted (PM gate on #180, condition 4,
      discharged).** Small riders for the RC-2/RC-3 PR wave still owed
      (deferred minors from
      #180's reviews): pin the totals-first-bytes-second write-once
      sequence; give `FakeBurst`'s single `pendingBurst` slot a loud
      overwrite (scripting foot-gun); FakeBurst carries two offsets by
      spec notation, the plan prose said three.
- [x] **~~The log chart draws the first rest as a bare gap (James,
      2026-08-24: "the graph is weird")~~ — FIXED, root cause was
      WIRE-ATTRIBUTION, not render (series-truth spec, this PR).** The
      "rides the next PR touching the log surface" line above was
      correct about the fix landing later but wrong about WHERE the
      defect lived: desk diagnosis found the series recorder latching
      onto a lying `frame.intervalIndex` at the distance-with-rest
      boundary (PM5 state 9) and silently dropping every sample after —
      the second interval and its trailing rest never reached the stored
      series at all, which is what read as a "bare gap". Fixed by
      driving the recorder off `attributedIntervalIndex`, the key the
      driver's own register logic already resolved (spec §B′) — no
      chart/axis code changed.
- [x] **Series-truth: the series stops lying on distance intervals with
      rests (spec `2026-08-25-series-truth-design.md`, this PR).**
      SHIPPED, PROSPECTIVE ONLY — the fix stops new rows from losing
      data; it does not repair rows already saved. James's ruling
      (2026-08-25): the band DISPLACEMENT on an already-saved row is
      arithmetically repairable (the inflation equals the finishing
      interval's own stored `actualSeconds`), but the MISSING SAMPLES
      are not (inventing them from interval averages was refused) —
      repair declined, population is roughly one row.
- [ ] **A lab capture of a real 2×Nm rNN piece (distance work, rest
      between) is still owed** — the series-truth regression fixture
      (spec §E) is SYNTHETIC, built from the production ring's own
      numbers, not from a replayable capture; no committed recording
      exercises this shape. Walk item: row a 2x-distance-with-rest
      piece, save the capture alongside the exit-7 session, and add it
      to the replay corpus.
- [ ] **The axis-quantity question, queued (series-truth spec §D).**
      `traceModel.ts`'s `t`/`d` axes are each the sum of per-interval
      final readings and are CONDITIONAL ON ROWER BEHAVIOUR during
      rests (frozen contributes nothing, advancing contributes all of
      itself) — never work-only, despite reading like a work clock.
      Whether the chart should instead show a TRUE work-only clock is
      an open product question, deliberately out of this PR: changing
      what an axis MEANS is its own number-meaning decision.
      **NOT DEFERRABLE PAST PR 2's DESIGN (#191's PM gate, the named
      collision):** the summary-record wave's PR 2 will render the
      machine's WORK-ONLY total with a MACHINE CONFIRMED badge on the
      SAME screens where this chart draws (`PostWorkoutSummary`/
      `FromTheLog`) — on the exit-7 piece that is a badge confirming
      500m beside a d-axis running to 742.7m, 48% apart in one frame,
      on the screen whose selling point is machine agreement. Resolve
      before PR 2's design, not at its gate.
      **The collision is RESOLVED BY LABELLING (James's ruling,
      2026-08-25) — the not-deferrable constraint above is discharged,
      not the broader question below it.** PR 2 ships the badge as
      `MACHINE CONFIRMED · WORK ONLY` with a caption naming the split
      ("Rest metres excluded. Everything else on this screen includes
      rest." — corrected at the PM gate fix wave, 2026-08-25: the
      caption first shipped naming only the heroes ABOVE the block,
      when the trace chart BELOW it is included too) rather
      than redesigning the chart's axes — the 500m/742.7m pair now
      reads as two different, both-honestly-labelled quantities on the
      same screen, not one number contradicting another. The underlying
      axis-quantity design question this bullet opened with (should
      `traceModel.ts`'s `t`/`d` ever become a true work-only clock) is
      untouched and stays open below. **RC-5 (hero-truth, 2026-08-25)
      makes this MORE visible, not less: now that the three heroes above
      the chart are work-only on every row, the chart's own rest-inclusive
      axes are the LAST rest-inclusive quantity left on the screen — the
      rower's own words, "if I stare at that chart for ten seconds I'll
      be back to 'does this app know what happened or not,'" are sharper
      once nothing else on the screen still disagrees with them.**
- [x] **SUPERSEDED BY RC-21, and it was never a flake** (reconciled at the
      phase close, 2026-08-28). This item said: "Flaky test on file:
      `App.test.tsx`/`RetestShortcut.tsx` unhandled async error, seen
      2-of-5 full-suite runs (series-truth branch, 2026-08-25) ... Capture
      the failure, don't re-run to green." The standing flake rule did its
      job: RC-21 below captured it instead of re-running, and it turned out
      to be an unvalidated cast at a trust boundary that could crash the
      You screen in production. Fixed 2026-08-26. Two open items for one
      defect is how a fixed bug stays on a list.
- [ ] **C' rider for the RC-2/RC-3 wave: the continuity-reset close
      skips the backward-bucket ring entry** (`useMonitorSession.ts`
      ~1809 stops the recorder without reading the count) — the one
      close where the diagnostic dies silently; final review minor 2.
- [x] **Phase RC CLOSE-OUT: the oracle corpus — BUILT 2026-08-28.**
      `app/src/monitor/oracleCorpusReplay.test.ts`. Every committed wire
      recording that carries a program is replayed through the real
      `createPm5Driver`, and both shipped oracles are asserted on each one
      — the verdict and its numbers, or the exact reason it refused to
      compare. TEN of the fourteen committed recordings, fifteen cases,
      zero product code — and the four it leaves out are named in the file
      with the reason for each (an earlier version of its header claimed
      "every committed recording" and was caught by the exit pass at 8 of
      14; two of the six then-missing captures turned out to replay clean
      and now carry full agreeing verdicts, `session-1-keystone` at 138.09
      vs 137.90 and `step-2` at 138.92 vs 139.00).
      **Why it exists:** before it, each oracle was pinned on ONE capture
      (RC-9a on session-2, RC-9d on a synthetic 2-interval program) and
      everything else we believed about them came from reading a ring by
      hand after a walk.
      **What it found, none of which was reachable from a spec:**
      (1) RC-9(b)'s stated blocker had expired — see its row; the
      comparison is made and green on four captures, two of them
      rest-bearing. (2) RC-14's silence is NOT in the wire traffic: the
      walk's own recording, through the walk's own build, produces the
      verdict the walk never logged — see its row. (3) The mirror trap in
      (b) is real and sits inside our own event stream: a terminate
      synthesizes an actual FROM 0x0039, so summing it into "our side"
      would compare 0x0039 with itself. The test excludes null-index
      actuals and keeps `smoke-terminated` in the corpus as the capture
      that proves the trap exists.
      **Every assertion class was mutation-proved** (recurring failure
      21): the avg-pace quotient (`500 *` -> `505 *`, three tests red), the
      rest-distance sum (`restDistanceMeters` -> `restSeconds`, one red),
      the suppression guard (final index -> index 0, two red), the 0x0039
      decode scale (`/10` -> `/100`, five red), a one-byte program
      transcription (rest 60 -> 30, three red on the divergence pin), and
      an unconditional probe entry to prove the "neither oracle speaks"
      assertions can go red at all (all eight red), and — **added at the
      exit pass, which found this class covered by none of the first six**
      — a rest-INCLUSIVE 0x0039 simulated by `+ 120` on the decode, which
      turns the three rest-exclusivity bounds red and reports through them
      (`expected 374.8 to be less than 373.8`, `252.5 < 191.5`,
      `180 < 119`). That last one is the fix as well as the proof: the
      bound used to be built from the program's TOTAL rest rather than the
      rest actually TAKEN, so a rest-inclusive reading of ~120.2 s cleared
      it and the assertion could not falsify the hypothesis it exists for.
      **Two more repairs the exit pass earned, both in `driver.ts`'s own
      diagnostics rather than in the corpus:** the reconciled `how` string
      had gained a DERIVED point value ("the true final interval would read
      Ns") built by subtracting the program's TOTAL rest — which counts the
      final interval's own trailing rest, the one that never elapses — so on
      `rests-finished`'s own committed shape it would have printed
      `-60s` at an erg; it states an upper bound again. And
      `recordAvgPaceVerdict`'s DIFFER arm had no positive assertion anywhere
      in the repo (a grep for `toContain("DIFFER")` returned one hit, on the
      REST oracle) — a band nothing has been seen to bite. It now has one,
      mutation-proved by forcing `agrees = true`
      (`expected 'machine(0x0032)=160.00s/500m ours=150…' to contain
      'DIFFER'`).
- [x] **Phase RC CLOSE-OUT: a derivation audit — RUN 2026-08-27.**
      `docs/superpowers/audits/2026-08-27-derivation-audit.md` plus three
      per-file tables beside it. 133 sites classified across ~7,000 lines by
      three independent readers.
      **The question it was asked, answered: the series-truth class does NOT
      recur.** Interval membership, rest state and totals are all read from
      the driver's own resolution — every actual files under
      `toProgramIndex`, rest comes off `frame.state`. The thing this audit
      existed to find is not there.
      **What it found instead is a different class and a worse one:** link
      and lifecycle state. 40 invented-heuristic, 18 re-derived, 43
      consumes-authority, 32 not-a-derivation. Unlike a membership error,
      several of these write a stored record or send a command to the erg.
      **Queued as RC-29 through RC-36 below**, ranked by cost. Two
      corrections to the audit's own brief are recorded in the document:
      `Timer.tsx` consumes zero monitor frames, and `seriesRecorder`'s
      header sentence is about the rest mark, not attribution.
      **An invented heuristic is not automatically a defect** — where the
      wire carries no such fact, inventing one is the only option, and
      `PAUSED_FRAME_HOLD`/`PULL_EVIDENCE_FRAMES` are the clean example (the
      PM5 has no paused state; both are cosmetic by construction). The
      queued items are the ones that DUPLICATE an authority or decide
      something durable on an unpinned threshold.
      **The model to copy is `decideResumeLatch`:** measured constant, both
      boundaries pinned, and it defers to the watchdog when that has already
      spoken instead of forming a second opinion.
- [ ] **RC-29 — a 2.5 s banner threshold writes a stored field AND
      suppresses a wire command. THE AUDIT'S WORST FINDING.**
      `useMonitorSession.ts:3145`: `linkGone = phase === "disconnected" ||
      frameSilence` writes `endedBy: "link-lost"` and `:3155` skips
      `driver.terminate()`. A false latch stores a lie AND leaves the PM5
      running the piece. **The false positive is measured** — nine banners
      in 288 s over a link that never dropped
      (`docs/monitor/sessions/walk-2026-08-26/`). Phase LM fixed the
      LIFECYCLE producer of that silence; the WATCHDOG producer is
      untouched, and no test pins the false-positive direction. **M**
- [ ] **RC-30 — teardown can terminate a live piece. DEFERRED 2026-08-27,
      and this entry's own numbers were wrong.**
      `useMonitorSession.ts:2513-2522` sends TERMINATE keyed on our derived
      `phase === "ready"`, not on `frame.state`.
      **CORRECTION (YAGNI pass, 2026-08-27):** this entry said the gate lags
      "up to ~5 s at the 1 Hz cadence". The gate's own comment
      (`useMonitorSession.ts:1203-1210`) says 5 frames at the OBSERVED 2 Hz =
      **~2.5 s**, half the claimed figure — and the `declared` path fires on
      the FIRST rowing frame, so the window only opens when `rowingActive` is
      stuck unset AND the rower unmounts inside it. Highest per-incident cost
      in the audit (metres destroyed forever), **never observed in the
      field**, and narrower than written.
      **Its fix also LOSES coverage:** gating teardown on `frame.state` drops
      DEVIATIONS row 70 (the abandoned arm — the next rower finds someone
      else's intervals). That trade deserves its own decision, not a
      sub-clause of a larger spec. Re-derive the trigger before building. **S**
      **CONSIDERED AND DECLINED AT THE PHASE CLOSE (2026-08-28).** It was
      scoped into the close-out PR as a one-line rider and taken back out
      before it was written, for two reasons that both point the same way.
      (1) It fails the fast path's own fifth check on its face: a wrong
      version produces a WRONG DEVICE INTERACTION (a TERMINATE sent at a
      rower mid-piece, or withheld from an abandoned arm), which CLAUDE.md
      names as disqualifying in those words — so it cannot ride a PR whose
      entire risk is otherwise words and tests. (2) This row already says
      the fix LOSES coverage and that the trade needs its own decision;
      shipping it as a rider would be making that decision by not making
      it. Stays open, unchanged in priority — still never observed in the
      field, still the highest per-incident cost in the audit.
- [x] **RC-31 — FALSIFIED at the erg, 2026-08-27. The trigger does not
      exist. Do not build the fix.** The audit predicted the
      resting-with-no-rest-phase fallthrough fires "for a tick at every
      boundary of every rest-bearing program", reasoning from the
      `WORKOUTSTATE` 8/9 -> `rowing`, 6/7 -> `resting` mapping. **The wire
      disagrees.** Both boundaries in one piece, as distance resets
      (`walk-2026-08-27/boundaries-terminated-recording.jsonl.gz`):
      `t=228.56  311.4 -> 0.5  ws=3->5` (boundary 1->2, WITH a rest) and
      `t=294.71  249.9 -> 1.6  ws=5->5` (boundary 2->3, ZERO rest).
      **A zero-rest boundary produces no state change whatever** — the
      machine stays in `IntervalWorkDistance` and resets the register. It
      never reports `resting`, so the fallthrough has no trigger.
      **The lesson is the audit's own rule turned on itself:** this was an
      INFERENCE from an enum mapping, presented in a table beside measured
      findings, and it read like one of them. RC-28 inherits the
      correction — its premise ("a machine can briefly report `resting` on
      an interval with no programmed rest") came from a code comment, never
      a capture, and is now unwitnessed with evidence against. **One
      capture cannot prove impossibility**; the code path stays, the
      priority does not.
      **WALK PASSED 2026-08-28, AND THE WALK UPGRADED THIS ITEM.**
      Legs: Menu at READY exits to `WorkoutDetail` with the nudge intact
      (both halves of James's ruling, on hardware); the detector stayed
      SILENT across a real rest boundary with **zero near-misses** —
      `workoutType` held at 8 while `intervalType` moved 0->2->0, and no
      `structure-left` or `structure-mismatch-recovered` entry exists in the
      ring; End terminated the machine (`ws=11`).
      **THE UPGRADE: RC-37's signature occurred NATURALLY, with no Menu
      press.** On the phone leg, after a 67 s background,
      `structure workoutType=1 durationRaw=0 durationType=128` with
      `state=armed` — the machine dropped the program by itself.
      **This item was scoped from James's own words ("rare, and not that
      annoying to have to exit"), which was true of the trigger he KNEW
      about.** The detector keys on the readback disagreeing with what we
      sent, not on Menu, so it also catches a program dropped after a long
      background — the case that actually costs a session. **Do not
      re-scope this item down to its original trigger.**
      Evidence: `docs/monitor/sessions/walk-2026-08-28/`.
- [x] **RC-37 — SHIPPED 2026-08-27 in PR #211** (link-authority design
      spec `2026-08-27-link-authority-design.md`; released in v0.26.0,
      build 766). The structure watch re-verifies the armed program per
      tick and treats a `workoutType` change under an open armed run as the
      machine leaving, returning the rower to `WorkoutDetail` with their
      nudges intact. Gated on hardware by the 2026-08-28 walk: the detector
      stayed silent through a real rest boundary with ZERO near-misses, and
      `ws=11` at End proved the `armed` gate on the wire.
      **Checkbox reconciled at the phase close, 2026-08-28** — the row
      below is the original finding, kept for its wire evidence.
      **Menu at READY: the machine drops the program, keeps
      streaming, and we never look. CONFIRMED AT THE ERG 2026-08-27, wire
      captured** (`walk-2026-08-27/menu-at-ready-recording.jsonl.gz`).
      James: *"if you hit 'menu' to end the workout while the app is on the
      ready screen, it doesn't cancel out."* Observed: app screen does
      nothing, PM5 shows its main menu.
      **THE WIRE, decoded from 0x0031:**
      ```
      t= 7.17  wt=8  it=0  ws=0  durRaw=24000  durType=0    <- armed
      t=29.05  wt=1  it=1  ws=0  durRaw=0      durType=128  <- Menu
      ```
      **`workoutState` NEVER CHANGES.** It is `0` (WaitToBegin) before and
      after, and `parse.ts:518` maps 0 -> `"armed"`, so READY keeps
      rendering. There is no TERMINATE (11), no terminal state, and the
      machine keeps streaming — 156 status frames — so there is no silence,
      no banner, and nothing for the link watchdog to notice either.
      **The divergence is visible in EVERY frame and we discard it.**
      `workoutType` 8 -> 1 sits in the same 19-byte status packet we already
      parse, and the driver even LOGS it (`kind: "structure"`, seq 20 of the
      ring). The `structure-mismatch` check that would catch it runs only
      during the verify phase — its own note: "one entry per verify phase,
      never per tick" — so a post-arm structure change is recorded and
      ignored.
      **`workoutType 8` is our documented invariant for a programmed piece:**
      `pm5-ble-ecosystem-review.md` records "every piece we program reads
      back workoutType 8 in 3447 of 3448 committed frames". This is the
      first observed piece to LOSE it mid-arm. The `wt=1 durType=128` shape
      is the machine's UNPROGRAMMED resting shape — the same triple the
      phone walk's own pre-program frame carries.
      **The stuck screen is the small half.** The PM5 has discarded the
      program and we have not. A pull after this rows a FREE row on the
      machine while the app still believes it is running interval 1 of N and
      attributes the result to a program the machine no longer has.
      **Fix shape (not yet designed):** re-verify the armed structure per
      tick, not per verify-phase, and treat a workoutType change under an
      open armed run as the machine leaving. **Mirror of RC-30** — that one
      is US sending TERMINATE off a derived ready-gate, this is the MACHINE
      leaving and us not noticing. Same seam; design them together. **S**
- [ ] **RC-38 — transcribe `OBJ_WORKOUTTYPE_T`. We have read ONE ROW of an
      enum we key a check on.** Raised by James 2026-08-27 on seeing RC-37's
      evidence: *"have we been making assumptions that are unfounded here?
      is there documentation about workoutType from concept2?"*
      **The honest split.** `8` IS sourced — Appendix A's
      `OBJ_WORKOUTTYPE_T`, pinned through `CSAFE_PM_SET_WORKOUTTYPE`'s
      `0x08 = WORKOUTTYPE_VARIABLE_INTERVAL`, confirmed against both the
      enum listing and §12's worked-example byte. **`1` and `0` are sourced
      NOWHERE.** Every claim we make about them is our own observation, and
      "empty arm" is a name WE gave a silhouette, not a documented meaning.
      Recurring failure #16's second corollary, exactly: we quoted the row
      that pinned `0x08` and never read its neighbours. This same field has
      already had one bad citation caught (`pm5-interface-notes.md:454`
      records correcting a misdirected "§7 above").
      **The larger assumption underneath:** `8` is not a PM5 universal, it
      is OUR COMPILER'S CHOICE. `pm5-ble-ecosystem-review.md` records that
      real apps send `FIXEDTIME`/`DIST_INTERVAL` for equal intervals and
      reserve type 8 for unequal ones, and that we always compile 8. So
      "workoutType reads back 8" is a fact about US that would stop being
      true the day anyone optimises the compiler.
      **Binding on RC-37 whether or not this is done first:** the check
      compares against WHAT WE SENT for this arm, never a literal `8`.
      `verifyArmed` already does this, so RC-37 is extending an existing
      comparison's lifetime, not writing a new rule. **S**
- [ ] **PHASE PROTO — a wire-semantics audit: are we hallucinating the
      protocol? (James, 2026-08-27.)** His words: *"im also interested into
      a deep dive to ensure we arent hallucinating anything in the protocol
      when we could be referencing concept2's documentation. we've misused
      fields before or conflated them to meanings they dont have."*
      **The method is the derivation audit's, pointed at wire semantics
      instead of derivations.** Enumerate every claim we make about a PM5
      field — in `pm5-interface-notes.md`, in `domain/monitor/pm5/*`, and in
      the load-bearing code comments — and classify each:
      **VENDOR-CITED** (a document says so, and the quoted LINE is recorded
      beside the claim), **OBSERVED** (our captures say so, n=?),
      **INFERRED** (neither). Then verify each VENDOR-CITED claim actually
      says what we use it for — the #16 corollary, since a real citation
      answering the wrong question reads exactly like evidence.
      **The track record justifying it, both directions.** Caught already:
      TWD "reports the goal" FALSIFIED and its mirror verdict retired
      (RC-9); the `SCREENTYPE_WORKOUT` inline-comment misprint; the
      misdirected `workoutType` cite. Still open or unexplained:
      `0x003A`'s Interval Rest Time reading 0 across three real r60s;
      `0x0039`'s avgStrokeRate 44-vs-22 doubling in the August capture,
      still uncaused after the 2026-08-27 screen oracle cleared our decode;
      `OBJ_WORKOUTTYPE_T` read one row deep (RC-38).
      **Do it AFTER the link-authority wave**, and note it may need the
      source document rather than our transcription of it — the notes cite
      Appendix A by page, so the doc was in hand at some point; confirm we
      can still reach it before scoping the work. **L**
- [x] **RC-32 — CLOSED UNBUILT 2026-08-27 — nothing to ship.**
      `continuity.ts`'s own doc records the suppression decision as KEPT, and
      `continuity.test.ts:974` already asserts `nonSuppressedPairs === 0`
      DELIBERATELY, citing recurring failure #21 by name. The vacuity is the
      test's own stated finding, not a discovery.
      **Cheap instrument if it returns:** one TIME-ONLY program on a walk (no
      distance interval anywhere) is the only thing in existence that can
      make the sweep non-vacuous.
      **(original entry below, kept for the reasoning trail)**
       — F2b's clean sweep is VACUOUS.** `continuity.ts`'s F2b count
      bound writes `completedAt` + `endedBy: "link-lost"` and seals the
      record. Its sweep excludes all six committed captures, so **zero pairs
      were compared** (`continuity.test.ts:974`). The gate reports clean
      because it never ran. **Recurring failure #21's third instance in two
      days**, after RC-24 shipped two. **S**
- [x] **RC-33 — FIXED 2026-08-27 in PR #212** ("A lost link suppresses the
      grid's rest countdown"; released in v0.26.0, build 766).
      `buildGridModel` now takes the staleness it was missing, so a link
      lost mid-rest no longer leaves pane C counting down.
      **Checkbox reconciled at the phase close, 2026-08-28.**
      **The original finding — the grid's rest countdown ignores a lost
      link. Shipped by RC-24 on 2026-08-26; found by this audit the next
      day.**
      `surfaceModel.ts:1526`: `restingNow` has no `!stale` term and
      `buildGridModel` takes no `stale` parameter — its comment "nothing in
      this function needs to know" predates RC-24 handing it two raw frame
      fields. So a link lost mid-rest leaves pane C sunken and gold with a
      FROZEN `R 0:42` while pane B reverts to `LAST SEEN`.
      **RC-24 and RC-27 are the same change on two surfaces and only one got
      the guard** — the controller wrote the reasoning into RC-27's comment
      (*"a countdown frozen at its last value is a false claim of motion"*)
      a day after shipping RC-24 without it, and neither review caught the
      asymmetry. The lost-link test at `:917` asserts only the hero. **S**
- [ ] **THE "RUN IT AGAIN" LOG-SCREEN IDEA (James, 2026-08-27) — FILED
      PROPERLY THIS TIME.** His words: *"You could put a resend in the log
      screen when it's exited early like this."*
      **This was told to James as filed on 2026-08-27 and was NOT** — the
      commit was interrupted and never redone, and the triage found zero hits
      for it across ROADMAP, specs, both ledgers and every walk README.
      Recurring failure #14 with the controller as the cause: a finding that
      lives only in conversation is a finding that dies there.
      **Scope, corrected when first filed:** it does NOT apply to RC-37 — a
      Menu-at-READY exit opens no record, so there is no log screen in that
      path, and `onExit()` already returns to `WorkoutDetail` where Connect
      sits. **Where it applies** is a session that produced a row and ended
      early: that lands on the log screen, which today offers `Log against
      plan`, `Save without logging`, `DISCARD WITHOUT SAVING` and the
      diagnostics copy, and **nothing that offers to do the workout again**.
      **Open questions for its own brainstorm:** whole workout or remainder;
      every early close or only some (a machine-finished session presumably
      does not want it); beside the save actions or after them, given it
      competes with the save the rower came to make. **S**
- [x] **PHASE RC CLOSE — the two rulings only James can make (2026-08-27).
      BOTH MADE, 2026-08-28.** (c) was REWRITTEN with a tolerance and three
      named exempt populations after an adversarial PM pass found the
      original had never been true of any build, then verified against five
      photographed rows (worst case 0.1 s/500 m against a 1.0 s bound, and
      the exempt cohort verified EMPTY). (d) was DISCHARGED by its own "or
      the reason it cannot is documented" clause — the Concept2 logbook
      opens as its own phase on 2026-08-29. Both are written out in full in
      the exit block, now moved up beside the phase header. The original
      item follows.
      The exit criteria are real and live at `ROADMAP.md`'s Phase RC exit
      section, **1,787 lines below the phase header**, which is why they were
      hard to find. **Move them adjacent to the header when this closes.**
      (DONE — the block sits under the phase header now; this sentence is
      the original item, kept as written.)
      Four of five are met with committed evidence: (a) work/rest stored
      separately, walk-2026-08-24 exit-7 digit-for-digit; (b) log-entry
      date/time decoded, walk-2026-08-23 W3, the wire carries no seconds;
      (e) 0x003F fires, byte order settled walk-2026-08-23 W4.
      **OWED FROM JAMES — (c):** "three heroes on one stored row reconcile by
      hand arithmetic" is true for reconstructable closes, but for
      `link-lost`/`interrupted` rows the ROADMAP records a DELIBERATELY
      reintroduced contradiction (rows sum 500 m, hero shows 742 m, no rest
      clause). Accepted as a named exception, or not met?
      **OWED FROM JAMES — (d):** the Concept2 logbook, the only real blocker.
      Its own wording is *"or the reason it cannot is documented"* — so
      moving the logbook out of RC is a PARAGRAPH, not a phase. The dev key,
      the `weight_class` gate and the ErgData-dedup question are all already
      recorded. Do the logbook, or write the reason?
- [x] **RC-34 — NOT A DEFECT — CLOSED 2026-08-27 by investigation.**
      **Three factual errors in this entry, each falsified from the code.**
      (1) A flagged boundary can NEVER carry `index: null`: both vouching
      sites structurally guarantee a number (`driver.ts:4455-4457`'s vouch is
      a ternary on `graceIndex === null`; `:4326-4330` refuses to compute a
      grace index from a null raw byte). The terminate hypothesis is refuted
      twice — a terminated close never opens a grace, and `toActualIndex`
      returns null outside rowing/resting. `walk-2026-08-25/smoke-terminated`
      shows it on hardware: a 0x0037 pair 180 ms after TERMINATE takes the
      out-of-run path, UNFLAGGED.
      (2) "No test drives this" is FALSE — `monitorRun.test.ts:753-765` does
      exactly that and asserts the refusal.
      (3) The check is **stricter than the driver's, not a duplicate**.
      `finishGraceIndex` never checks the index is the program's last;
      `monitorRun.ts:625` is the ONLY thing bounding the grace to the final
      interval. **Deleting it would be actively wrong.** The
      `driver.ts:4218` comment this entry generalised refers only to the
      already-recorded check.
      Zero flagged boundaries the record would refuse across all six
      captures. The CONSEQUENCES were described correctly; there is no
      trigger.
      **(original entry below, kept for the reasoning trail)**
       — `acceptableFinalBoundary` re-derives the driver's own
      vouch.** `monitorRun.ts:618-627` recomputes `finalBoundary` from
      `index === intervals.length - 1`. A wrong refusal drops the final
      interval's actual FOREVER, short-summing all four RC-1 fields and
      rendering `N-1 OF N INTERVALS MEASURED`. No test drives a flagged
      final boundary with `index: null` through it. **S**
- [x] **RC-35 — CLOSED UNBUILT 2026-08-27 — the premise was the ITEM's, not the code's.**
      `seriesRecorder.ts:325-336` opens with an explicit, documented ABSENT
      arm — *"ABSENT continues the last key … it never starts a register"*.
      It does not assume presence. What is actually wrong is ONE adjacent
      comment sentence ("a driver-emitted frame with an open run always
      carries this field"), which a terminated frame contradicts.
      **Cheap instrument:** correct that sentence on the next touch of the
      file. No code, no test.
      **(original entry below, kept for the reasoning trail)**
       — the series recorder's absent-key arm rests on a false
      premise.** `seriesRecorder.ts:333-358` assumes
      `attributedIntervalIndex` is present; `driver.ts:2175-2229` leaves it
      undefined on `terminated`/`idle`/`armed`, and a terminated frame DOES
      reach `onFrame` (`useMonitorSession.ts:1987`) before terminal
      handling. Damage is bounded today only by accident (max-merge plus a
      bucket drop). Same file folds the driver's register map a second time
      (`driver.ts:2462-2469` sums it differently) writing `series[].t/d`,
      with no test comparing the two. **S**
- [x] **RC-36 — CLOSED UNBUILT 2026-08-27 — its instrument already exists and has never fired.**
      The genuinely wrong arm (`intervalIndex === null` while an interval is
      current) already logs its own divergence: `driver.ts:2497`,
      *"has no corresponding interval in a N-interval program"*. Grepping
      every committed capture, ring and walk README for that literal returns
      **ZERO hits**. The terminal-state arm is deliberate — *"needed there so
      the hero targets always show SOMETHING"* — with two documented opt-outs.
      The filed reasoning ("two consumers opted out, so the source is wrong")
      is a code-smell argument, not a harm argument.
      **Cheap instrument: already shipped and silent.** Reopen only when that
      divergence line appears in a walk log.
      **(original entry below, kept for the reasoning trail)**
       — `frame.intervalIndex ?? 0` collapses a deliberate null.**
      `surfaceModel.ts:860`. The driver's `null` also means "a real interval
      is current but diverged"; `?? 0` turns that into interval 0, so the
      surface says `1 OF 4`, marks grid row 1 active and shows row 1's
      targets, silently. **Two consumers already opted out individually
      after measured defects** (`:1038`, `:1159`) — the source was never
      fixed, which is the tell. **S**
      **Riders, all unpinned, all cheap:** `countdownDisplayFor`'s
      kind-mismatch fallback to the full programmed value (`:1672`);
      `phaseSeconds(...) ?? 0` pricing unpriced phases at zero in BOTH
      numerator and denominator while `hasRemainingEstimate` is an ANY not
      an ALL, leaving the bar and EST LEFT built partly on zeros; and
      nothing asserting `FINISH_HANDOFF_HOLD_MS > FINISH_GRACE_MS` despite
      the comment requiring it (the cheapest missing gate in the audit).
- [ ] **CROSS-CONNECT TO THE CONCEPT2 LOGBOOK — ITS OWN PHASE, OPENING
      2026-08-29.** No longer "belongs to this phase": it is exit criterion
      (d)'s documented reason, settled by James on 2026-08-28 ("we can open
      the logbook Saturday").
      **BINDING ON THE DAY THAT PHASE OPENS (PM close gate, 2026-08-28):
      it carries exit criterion (d)'s EXACT SENTENCE into its own exit
      block** — *"a row posted to the Concept2 sandbox comes back through
      `export/` matching what we stored, or the reason it cannot is
      documented."* That transcription is the receipt that makes (d) a
      discharge rather than a deferral wearing one; without it the criterion
      evaporates on the rename. **And the thing to say plainly there:** every
      oracle Phase RC shipped is a different register of the SAME PM5
      (0x0032's average pace, 0x003A's rest distance, 0x0039's totals). That
      is a real class upgrade over checking the app against itself — it is
      what killed the TWD mirror — but no row of ours has ever been to
      Concept2. That is the gap this phase exists to close.
      **The original item:** DEFERRED to Saturday by James (2026-08-27: "we
      also haven't cross-connected to logbook yet, which should be in phase
      RC but can wait until we have more tokens on saturday").
      Not yet scoped. Note when it is opened that RC-9's own retirement of
      the TWD mirror turned on exactly this distinction — Concept2's
      logbook stores WORK ONLY, while TWD is work plus rest-coast metres,
      so the logbook is a genuinely independent oracle and the first one
      outside our own definitions (recurring failure #11's second half:
      "an oracle that shares your definition is a mirror"). The dev API
      key lives in the repo-root `.env`; its VALUE is never read into a
      transcript or a committed file.
- [x] **Put the realtime meters count back (James, 2026-08-24: "i want
      to put that back to a realtime count").** SHIPPED (summary-display
      wave, PR 2, this PR): the connected screen's total-meters counted
      by 5s and read less responsive since the CM quantisation (#123
      rounded the counter to TWD's 5m grid). REVERSES that CM ruling
      knowingly — `PaneLive.tsx`'s `fmtMeters` now `Math.round(meters)`,
      1m granularity restored, Intl formatting and rounding (not
      flooring — #123's own falsification stands) kept; TWD
      corroboration stays internal, nothing rendered from it. The
      comment at the call site names the reversal and the accepted
      repaint-rate cost (~3.7 repaints/s iOS) rather than reading like
      the CM rule was always this.
- [x] **RC-2 — Decode Log Entry Date/Time; log it beside our wall clock;
      store nothing yet.** SHIPPED (summary-record wave, PR 1,
      `docs/superpowers/specs/2026-08-24-summary-record-design.md` §2):
      `parseSummaryLogStamp` decodes date `uint16` = month | day<<4 |
      (year-2000)<<9, time `uint16` = minutes | hours<<8, and the driver
      emits one `summary-log-stamp` ring entry per burst. **The residual
      that inverts the headline stands unchanged:** the wire carries
      hours and minutes and NO SECONDS, while C2's own hardware-sourced
      example row reads `2015-08-05 13:15:41` — the stamp remains
      diagnostic-only, stored nowhere, until the C2-link tolerance
      question is settled.
- [x] **RC-3 — Carry 0x0039's nine already-decoded fields into the
      record.** TRIAD. SHIPPED (summary-record wave, PR 1, same spec §1):
      `avgStrokeRate`, `endingHeartRateBpm`, `avgHeartRateBpm`,
      `minHeartRateBpm`, `maxHeartRateBpm`, `dragFactorAverage`,
      `recoveryHeartRateBpm`, `workoutType` and `avgPaceSecondsPer500m`
      now write into `MonitorRun.summaryDetail` and, at save, into
      `session_logs.machine_summary` (migration 0016, hybrid shape) —
      six of the nine are C2 top-level columns the reconciliation table
      marked NOT CAPTURED. **Storage only when this shipped; the display
      half has now shipped too (summary-display wave, PR 2, this PR,
      spec §3 as amended): `FromTheLog.tsx` renders a MACHINE CONFIRMED
      · WORK ONLY block off `machineWorkSeconds`/`machineWorkMeters`/
      `machineSummary.verificationBytes` alone — the other six of the
      nine `machineSummary` fields stay stored-but-undisplayed this
      wave, unchanged from the note below.** The wave (RC-2 + RC-3 +
      this display PR) is functionally complete pending its own
      release. Three obligations recorded at #190's PM gate: (1) the
      old DOC-ONLY caveat on
      `avgPaceSecondsPer500m`'s /10 scale is DISCHARGED by evidence, not
      deleted silently — the keystone's 500m piece decodes pace 138.7
      against elapsed 138.7 from a DIFFERENT byte range (a scale oracle
      by identity: a 500m piece's pace-per-500m IS its elapsed time),
      corroborated by the terminate capture (24.3s/76m implies 159.9 vs
      decoded 159.8); (2) **the nine detail fields have never been
      compared to any PM5 screen** — exit-7's photograph verified only
      the two totals, and the one terminate capture's avgStrokeRate
      reads 44 where physics says 22 (§25) — the first surface that
      displays any of the nine (Phase PS inherits this) owes a
      photograph, same discipline the totals had; (3) `machine_summary`
      is stored VERBATIM (object-ness, size cap, and the
      verificationBytes band are the only server checks) — every future
      reader type-guards each field at read.
- [ ] **Owed walk item: the terminated-piece PM5 memory photograph AND
      the app-STOP-venue capture.** Zero captures exist on either arm for
      the End-button venue today — the fake covers its shape only, never
      real bytes. Two things the next natural walk still owes: (1) a
      terminate-path SCREEN oracle (`pm5-interface-notes.md` §25's
      avgStrokeRate anomaly is unresolved without it); (2) a real capture
      of the app's own END button mid-piece, on both the web and native
      arms, now that PR 1's four gates make production actually listen
      for the burst on that path.
- [x] **WALKED 2026-08-28, leg 4 — the mechanism is no longer INFERENCE, and
      the defect it found is now filed in Phase LM ("The pre-row lock").**
      `docs/monitor/sessions/walk-2026-08-28/README.md:72-125`. Locked the
      phone BEFORE the first pull: `app-lifecycle resume gap=27886ms
      silent=true latched=true`, `resume-frames phase=ready
      framesWhileHidden=1 rowingActive=false`, and the machine's own frame
      putting the rower **24.7 s and 52.6 m into interval 1** while the app
      sat at `phase=ready` with no record open. The tester's report,
      reproduced to the frame. The same leg found RC-37's signature
      occurring naturally after a 67 s background, and three more
      reproductions (a `pause-declared` at 66 spm while he was rowing, TWD
      going 52 -> 0 -> 64 m, `rowing-active-fallback` leaving
      `rowingActive` stuck false). **Checked off at the phase close,
      2026-08-28** — a walk item whose walk happened is the single likeliest
      thing to leave with a closing phase.
      **The original item, kept for the questions it asked:** A tester connected,
      programmed, reached "show me the numbers", pocketed/locked the
      phone, rowed the piece to completion, and unlocked to find the app
      still in the pre-row state with no record — END silently discarded
      it (the never-rowed path has no save door). For the next natural
      walk: connect, program, show-me-the-numbers, LOCK the screen, row
      ~30s, unlock; capture the ring + connection log. Questions it
      settles: does the BLE link survive screen lock on iOS, does frame
      delivery freeze with the WebView, what state the run object is in
      on resume, does the watchdog fire. Suspected mechanism (iOS
      suspends the WebView JS so frames never reach the run) is
      **INFERENCE until walked** — cross-reference Phase LL's
      correct-resume-over-background-mode ruling ("The background
      question, ANSWERED", above) and its research doc
      (`docs/superpowers/research/2026-08-20-ble-connection-management.md`)
      as the starting ground; that doc already records a 15-20s screen
      lock NOT dropping the GATT link (§21 item 7), which is why the
      product gap below is not assumed to be a link problem.
- [x] **RC-4 — Last Split Time is 0.01 s/lsb, not 0.1.** Settled by
      replay, see `parse.test.ts` (seq 1195). TRIAD, S,
      **settled without an erg.** Both C2 documents print 0.1, four
      times. Nine capture pairs say 0.01 (0x0033's u24LE@14 is the exact
      hundredths value whose truncation to tenths is 0x0037's split
      time), the PM5's own memory screen agrees (7476 → 1:14.7,
      `walk-2026-08-17/README.md:14`), ORM agrees. **Our decode is 10x
      TOO LARGE.** Dormant since CR2 spec 2a Task 6, and
      `statusFrames.ts:222` mirrors the same error, so no round trip and
      no hand-built fixture could ever have caught it. Fix
      `parse.ts:203` to /100 and `statusFrames.ts:222` to *100, retarget
      `parse.test.ts:198` and `:614`, and pin it with a REPLAY against
      committed bytes, never a round trip. Ship the semantic with it: the
      field is dimension-conditional and transiently live mid-interval,
      so it can never be a countdown checkpoint at any scale.
- [x] **RC-5 — The three stored heroes contradict each other by up to
      40 s/500 m.** TRIAD. **SHIPPED** (hero-truth spec/plan,
      2026-08-25, `docs/superpowers/specs/2026-08-25-hero-truth-design.md`,
      5 tasks): DISTANCE, TIME and AVG SPLIT are now ONE population —
      work only — on every stored row, and the wall-clock total (work
      plus rest) gets its own line beneath: `4:04 total · plus 242 m
      coasting in rest`. **Two-tier ruling (James's fork, 2026-08-25,
      "I want to match the PM5"):** "match the PM5" and "one uniform
      rule on every row" cannot both hold, because the machine disagrees
      with the sum of its own displayed rows (walk-2026-08-20: its
      interval rows sum to 901 m against its own stated total of 899 m,
      ~2m of self-disagreement from rounding each row) and truncates its
      own pace where we round (159.8 where the quotient is 159.868)
      — both antagonist findings, `docs/monitor/pm5-interface-notes.md`
      §26. So: **tier A**
      (a row carrying `machine_work_seconds`/`machine_work_meters`,
      i.e. saved since PR #190) renders the machine's OWN totals and
      its own `avgPaceSecondsPer500m` (newly stored, additive jsonb key,
      no migration) verbatim, digit-identical to its screen; **tier B**
      (everything else) computes the same three quantities from its own
      recorded actuals and never claims to be the machine's — no badge,
      no marker; the MACHINE CONFIRMED block's absence is the tell. The
      population split #190 created is accepted here, named on screen,
      and is the price of digit-identity. History-list rows use the same
      tier logic as the detail screen so the two can no longer disagree
      by 742-vs-500 for the same session (RC-5 Task 4).
      - **Original evidence, now explained rather than merely reduced:**
        session-2's 1599 m/8:08.4 (implying 2:32.7) beside AVG SPLIT
        2:08.5 (24.3 s/500 m apart), and the pyramid's 39.9 s/500 m gap,
        were the SAME defect this closes — a fused DISTANCE/TIME beside
        a work-only AVG SPLIT. Both are now work-only on saved-since-#190
        rows and named-as-fused-plus-rest-clause on the rest.
      - [ ] **TIER B2 residual — general form, accepted and pinned, not
        silent (Task 3 fix round 1; premise CORRECTED and the decline
        question RE-DECIDED at fix round 2, final whole-branch review,
        finding I1).** `buildMonitorLogSteps` never produces a stored
        step for an actual whose `index` is `null` (any legacy warm-up
        seed included), so a row's Σ `steps` under-counts that actual's
        own work whenever no other stored signal can rescue it. RC-1's
        own `workSeconds`/`workMeters` pair (preferred whenever present,
        since it sums `run.actuals` unconditionally and never goes
        through `steps`) closes the gap for every row saved
        **2026-08-24 onward AND closed via `endedBy: "finished"`** —
        NOT, as fix round 1 wrongly claimed, every row saved from that
        date. `computeWorkRestSums`/`appendSummaryObservations` (the
        work-pair/machine-totals writers) fire ONLY for
        `"finished"`/`"rower"` closes, so a link-lost/program-failed/
        interrupted/burst-less-terminate monitor row can NEVER carry
        either pair — an ONGOING population, growing with every future
        interrupted or lost-link session, not a closed window. Fix round
        2's `isReconstructableClose(row.endedBy)` gate now DECLINES tier
        B2 (falls to FALLBACK, the stored possibly-fused columns
        unchanged) for that ongoing population, and trusts Σ steps only
        where `endedBy` PROVES the row historical (`"finished"`, `null`,
        or `undefined`) — a genuinely closed, non-growing
        **2026-08-08 (the `actualMeters` amendment) through 2026-08-24
        (RC-1 ships)** window, with no backfill path (`monitorRun.ts`'s
        own "NO BACKFILL" doc comment on the sibling field). One
        concrete manifestation, cheaply noted rather than separately
        fixed (Task 3 fix round 2, M1): a LEGACY warm-up row read back
        through this SAFE branch prints a SMALLER distance plus a
        warm-up-attributed rest clause, while the LIVE door
        (`summaryModel.ts`'s `isLegacyWarmupRun`) kept that same row's
        heroes fused with no total line at all — the live and stored
        screens disagree for this one shape, accepted rather than
        reconciled (reconciling would need the stored `steps` array to
        record "an interval existed but produced no step," which it
        does not). Pinned by dedicated `storedSummary.test.ts` cases
        (both the SAFE-endedBy residual and the DECLINED-endedBy cases).
      - [ ] **List-vs-detail bounded disagreement, same corrected
        window (premise corrected at fix round 2, same finding I1).**
        The history list's projection excludes `steps` entirely (size),
        so it cannot reach TIER B2 at all — a row in the genuinely
        closed 2026-08-08..2026-08-24 window (endedBy-provable
        historical, per the item above) that the detail screen computes
        from Σ steps falls, on the LIST only, to the FALLBACK branch
        (the row's old stored fused columns) instead. For every OTHER
        no-machine-totals/no-work-pair row (link-lost/program-failed/
        interrupted/burst-less-terminate, any date) the detail screen
        NOW ALSO declines to FALLBACK (fix round 2), so the two screens
        AGREE there — a wider agreement than fix round 1 believed it had
        secured. Stated in code (`LogRow.tsx`'s own corrected tier
        comment), pinned by dedicated `HistoryList.test.tsx` cases: one
        asserting the two screens' numbers are VISIBLY different for a
        `"finished"`-closed session in the closed window (742 m/2:18.8
        on the list vs 500 m/2:04.0 on the detail), one asserting they
        AGREE for a `"link-lost"`-closed session (both 742 m/2:18.8).
        **One more consequence, named for completeness (fix round 3,
        re-review):** a DECLINED row's own interval ROWS still sum to
        their work-only total (e.g. 250+250=500 m) while its HERO shows
        the old fused value (742 m) with no rest clause on the total
        line to explain the 242 m gap — the same in-frame contradiction
        RC-5 exists to kill, reintroduced deliberately for this one
        population as the accepted pre-RC-5 status quo ("unimproved but
        never silently wrong," per the FALLBACK branch's own comment).
      - [ ] **Build-738-era rows render NO AVG SPLIT hero at all —
        tester-visible, release-note clause owed. POPULATION CORRECTED
        (Task 3 fix round 4, PM gate finding 4 — verified via
        `git log`/`git tag --contains` before writing, per the gate's own
        instruction).** The original claim ("rows saved during v0.21.0's
        TestFlight window") is FALSE: `machine_work_seconds`/
        `machine_work_meters` first exist as of PR #190
        (`3cb393d`), and `git tag --contains 3cb393d` returns v0.22.0
        ONLY — so no build-738 (v0.21.0) row was EVER tier A; that build
        couldn't post the columns that make a row tier A at all. **The
        one real path (`LogSession.tsx`'s own comment on the guard, and
        `git show v0.21.0:app/src/monitor/monitorRun.ts`, confirms
        `appendSummaryObservations` already captured `summaryTotals`
        client-side under build 738 — #190 is what made it SURVIVE THE
        SAVE server-side, not what started capturing it): a run completed
        under build 738, left UNSAVED (sitting in local storage) across
        the app's update to a build carrying #190 (`machine_work_seconds`/
        `machine_work_meters` posting) but not yet this PR's
        `avgPaceSecondsPer500m` storage, then finally saved.** That old
        `MonitorRun` object carries `summaryTotals` (738 wrote it) but no
        `summaryDetail` at all (738's `MonitorRun` type never had the
        field) — so the save posts real machine totals (tier A) with an
        honestly bytes-only-or-absent `machine_summary`, and AVG SPLIT is
        simply absent, never a stale or wrong number
        (`machineSummary.integration.test.ts`'s own "build-738-era
        record's honest shape" case pins the same shape server-side). Real,
        bounded population (an unsaved-run-across-an-update shape, not a
        release-window one); no backfill. **Same cause, folded in rather
        than left as a separate population (PM gate finding 4):** this is
        also why `postTestOffer` silently declines the baseline offer for
        exactly these rows — see the `postTestOffer.ts`/`testHistory.ts`
        minor below, which shares this bullet's population and cause, not
        a second one. The next release note should say a small number of
        recent sessions may show two heroes instead of three, permanently
        (and may have missed a baseline offer they'd otherwise have
        earned), and that this is intended, not a bug.
      - [ ] **TWO shipped release notes now tell instructions RC-5
        falsifies — both owed a correction in RC-5's own SUCCESSOR notes
        entry, neither edited in place (Task 3 fix round 2 finding I3;
        v0.22.0's own note added at fix round 4, PM gate finding 5).**
        Shipped notes are history and stay as written; RC-5's own release
        note — **NOT v0.22.0, which already shipped this morning
        (2026-08-25) WITHOUT RC-5, per fix round 4's own correction above
        — the next tag after it** — must say explicitly that both
        instructions below no longer apply and name what changed.
        - `src/news/content/releaseNotes.ts:270` (v0.11.0, still rendered
          to any tester who opens that entry) reads: "DISTANCE counts
          everything the flywheel counted, warm-up and rest meters
          included, so it should match the monitor exactly. Check them
          side by side." RC-5 makes DISTANCE work-only on saved-since-#190
          rows — the instruction to check against the monitor's OWN total
          is now reliably wrong (the monitor's Totals row is ALSO
          work-only per this same phase's own antagonist finding, so
          checking against it would actually still agree — but checking
          against the monitor's fused/TWD reading, which is what a rower
          untrained by this phase would reach for, would not).
        - `src/news/content/releaseNotes.ts:22` (v0.22.0, shipped this
          morning, describing the MACHINE CONFIRMED · WORK ONLY block)
          reads: "Work only means rest metres are excluded; everything
          else on that screen includes rest, so the numbers are meant to
          differ." **RC-5 falsifies BOTH halves**: the heroes above the
          block are now ALSO work-only (no longer "everything else…
          includes rest"), so the block and the heroes now AGREE — the
          numbers are no longer "meant to differ." Same shipped-note
          rule: not edited, corrected in the successor note.
      - [ ] **The live CONNECTED screen's TOTAL METERS is still fused —
        two unlabelled populations on consecutive screens (Task 3 fix
        round 2, finding I4; NOT code in this PR, its own item).**
        `surfaceModel.ts:479-492`'s `sessionDistanceMeters` is "work +
        rest by construction" (the field's own doc comment) — the rower
        watches this number climb live (e.g. 1599 m) through the whole
        session, then lands on the post-workout summary / stored detail
        screen this phase just made work-only (e.g. 1535 m for the SAME
        session). Neither screen labels which population it shows. RC-5
        fixed the SAVED record's own internal contradiction (three
        heroes, one population); it did not touch the LIVE screen's own
        number, which now contradicts the record it is about to become.
        Deserves its own design pass (does the live total go work-only
        too, or get a "+ rest" clause of its own, matching the pattern
        this phase just established for the stored screen) — not a rider
        on this PR.
      - [ ] **An INTERRUPTED session's TOTAL line can be present live and
        absent stored, for the identical row — same family as the item
        above (Task 3 fix round 3, re-review; pre-existing across the
        branch, not caused by this PR's diff, previously unrecorded).**
        `summaryModel.ts`'s `monitorRest` (the LIVE screen's rest source)
        has a second rung that derives rest straight from `run.actuals`
        whenever EVERY actual carries its own rest reading — with NO
        `endedBy` gate at all, so an interrupted session whose completed
        intervals all measured a real rest still gets
        `"… · plus N m coasting in rest"` on the live post-workout
        summary. RC-1's stored `restSeconds`/`restMeters` pair, by
        contrast, is written ONLY for a `"finished"` close
        (`computeWorkRestSums`'s own gate) — and TIER B2's `endedBy`
        allowlist (fix round 2/3) correctly declines an `"interrupted"`
        row for the SAME reason C1 was fixed. Net effect: the SAME
        session can show a rest clause live and none at all once saved
        and reopened. Neither side is wrong (each states only what it can
        prove), but the disagreement is real and currently silent.
      - [ ] **Three minor divergences, recorded not fixed (Task 3 fix
        round 2, findings M2-M4).**
        - `postTestOffer.ts:45`'s `avgSplitSeconds` input now receives,
          on a tier-A monitor save, the machine's own TRUNCATED
          `avgPaceSecondsPer500m` (via `model.heroes.avgSplitSeconds`,
          `LogSession.tsx`'s monitor-door `postTestOffer` call) rather
          than our rounded quotient — a small precision change to what a
          baseline offer's number means, for every fresh tier-A save
          going forward. (The SILENT-DECLINE case — no offer at all on an
          unsaved-across-an-update build-738-era row — is NOT a second
          population: it shares the "Build-738-era rows render NO AVG
          SPLIT" bullet above, folded in there per PM gate finding 4.)
        - `server/stores/testHistory.ts:62-63`'s `deltaSeconds =
          input.splitSeconds - previous.splitSeconds` can now subtract a
          POST-RC-5 split (a tier-A row's machine-truncated value, or a
          tier-B row's work-only quotient) from a PRE-RC-5 row's stored
          split (the old, possibly-fused-population quotient) — the
          delta briefly mixes two different definitions of "the split"
          across the cutover, self-correcting once every row in a
          rower's history postdates this phase.
        - The LIVE monitor door's own tier-A gate
          (`summaryModel.ts`'s `monitorHeroes`) checks `distanceMeters`
          and `timeSeconds` against `> 0` INDEPENDENTLY of each other, so
          a partial-zero burst (one of the two genuinely `0`) can still
          show ONE hero live; the STORED screen's `hasMachineTotals`
          (`storedSummary.ts`) requires BOTH `machineWorkSeconds` AND
          `machineWorkMeters` `> 0` TOGETHER before rendering ANY tier-A
          hero, falling through to tier B1/B2/FALLBACK entirely
          otherwise — a narrow, likely-rare burst shape where the live
          and stored screens would show different heroes for the
          identical row.
- [ ] **The rower's PARTIAL-on-an-abandoned-piece complaint (hero-truth
      design review, 2026-08-25) — queued, out of RC-5's own PR.** "I
      want it to say I stopped, not silently show a shorter piece that
      looks like I planned a 250 when I meant 500 and bailed." PR #192's
      MACHINE CONFIRMED block already renders on a terminated row (with
      the machine's own partial numbers), but nothing on the screen SAYS
      the piece ended early rather than as planned. Copy plus a
      stored-state read (the terminate-path distinguishing signal RC-5's
      antagonist pass and §25 of the interface notes discuss); deserves
      its own design pass, not a rider on this one.
- [x] ~~RC-6 — Band `spm` and drop zero `p` in the stored series.~~ —
      **NARROWED, `spm` half SHIPPED** (2026-08-22, held-open-finish spec
      1 task 5). `seriesRecorder.ts` now bands `spm` to 10..60 inclusive,
      same 0-sentinel shape `hr` already used — kills both the
      first-stroke estimator's 64 and the boundary transition's 101. The
      `p: 0` half moved to RC-11's own spec (the stroke-data reframe
      owns what `p` means).
- [ ] **RC-7 — Stop writing `restDistanceMeters: 0` into the synthesized
      final interval** (`driver.ts:3037`), which the code's own comment
      already calls "a real gap". Unreachable today because no 0x0039
      ever arrives — but Phase LL's A-2 is trying to make it reachable
      and nobody had asked what it writes when it fires. **Sequence it
      INSIDE A-2's spec.**
- [ ] **RC-8 — Correct the fake's five contradictions of the real wire.**
      **Residual sub-item (#182's T2 review): `fake.ts`'s
      `toMachineIndex` is resting-conditional while `intervalIndex.ts`'s
      `toActualIndex` is unconditional — a latent index mismatch for
      rest-free non-first-interval boundaries in fake-driven tests
      (pre-existing, worked around in tests, not yet load-bearing).**
      Gates the honesty of everything above. `fake.ts` forces
      `restSeconds` to 0 off a rest; writes `ergMachineType: 1` where the
      machine reads 0 in 3448 of 3448 frames; writes `splitIntervalType:
      0` always; writes Last Split Time/Distance unconditionally; and
      **hardcodes `intervalRestTimeSeconds: 0` on every boundary**
      (`fake.ts:878`) — precisely the field RC-1 wants to carry. RC-1
      would otherwise ship green against a fake that says the machine
      reports 0. **THREE of five CORRECTED (PR2 Task 1, storage-spine
      spec §3, scoped to the fields RC-1's own tests depend on —
      Task 1's report, not a full RC-8 pass):** `ergMachineType` (both
      `fake.ts` sites, `0x0032`/`0x0038`, decoded 0 in 3448/3448 committed
      frames) → `0`; the `intervalRestTimeSeconds: 0` hardcode →
      `completed?.restSeconds ?? 0`; `splitIntervalType: 0` always →
      `completed?.kind === "distance" ? 1 : 0`, all three decoded off real
      wire hex across four captures (Task 1's report has the table). **The
      other two items in this row's own list — `restSeconds` forced 0
      off a rest, and Last Split Time/Distance sent unconditionally —
      read as ALREADY conditional in `fake.ts` as of this PR
      (`restSecondsFor`/`wireLastSplit`, both predating this phase, first
      introduced by #144 "EST LEFT keeps counting" and #99/#102's own
      lag-one-boundary work respectively)** — flagged for the next RC-8
      dispatch to verify and close out or correct this row, not resolved
      here: Task 3 did not re-derive whether that pre-existing behavior
      is itself honest against a real capture, only that it is no longer
      the hardcoded-0 shape this row describes.
- [ ] **RC-9 — Wire the free external oracles nobody reads.** **(a), (c),
      (d) SHIPPED** (design spec `2026-08-25-free-oracles`, pre-spec
      antagonist pass full on TRIAD ground, PM final gate on the PR);
      **(b) QUEUED**, reason below — this row stays open on (b) alone.
  - **(a) SHIPPED — walk search string: `` `avg-pace-verdict` ``** (one
    ring line per run; W11 below has the full read-it-off-a-walk
    protocol). 0x0032's `averageSplit` (offset 9), a PM5-computed
    cumulative work-only session average pace, is now compared
    (ring-only, no UI, no stored field) against `monitorAvgSplit`'s own
    quotient over `recordedActuals` — synchronously on a `terminated`
    close, or once the run's evidence settles (`armSummaryReconcile`'s
    deadline/early-complete path) on a natural finish — two
    independent computers of the quantity the C2 logbook stores, not the
    tier-A hero (post-RC-5 that hero IS 0x0039's own field, so comparing
    it to 0x0032 would be machine-vs-machine). Suppresses on an excluded
    actual or a summary-filled run; 1.0 s band. `fake.ts`'s
    `averageSplit: e.currentSplit` fabrication (would have made every
    fake-driven test vacuous — third sighting of the shape) fixed first.
    **The ABSENCE of an `avg-pace-verdict` line is itself a finding**:
    the pre-existing `FINISH_GRACE_MS` zero-fire (below) writes silence,
    not a suppression reason, whenever the next piece is armed within
    3 s of the previous one's finish — the walk's own ordinary rhythm
    between pieces, not a rare edge.
  - **(b) — ITS BLOCKER IS GONE, AND THE COMPARISON IS NOW MADE AND
    GREEN (phase close, 2026-08-28). What stays open is narrower than
    this row was.** The original text read: "0x0039's totals vs
    Σ`recordedActuals` needs a rest-bearing capture that survives to a
    0x0039: of the eight committed recordings exactly ONE carries a
    0x0039 at all, and it is the ONLY one of the eight with ZERO rest
    frames." **That corpus fact expired.** Listing
    `docs/monitor/sessions/` and counting rx frames per characteristic:
    FOURTEEN recordings, SIX carrying a 0x0039, three of those six
    rest-bearing. The unblocking condition this row named was met by
    `walk-2026-08-25/rests-finished-recording.jsonl.gz` — committed the
    same day this row was written — and again by
    `walk-2026-08-28/rest-boundary-recording.jsonl.gz`.
    **The comparison, run:** `app/src/monitor/oracleCorpusReplay.test.ts`
    decodes each capture's own 0x0039 bytes with
    `parseEndOfWorkoutSummary` and compares them against the interval
    actuals the driver assembled from 0x0037/0x0038. Rests-finished:
    **254.8 s / 935 m against 254.8 s / 935 m**, over a program carrying
    120 s of rest — exact, and rest-exclusive on both sides.
    Boundaries-terminated: 132.5 s / 500 m against 132.5 s / 500 m over
    60 s of rest. Rest-boundary: 60 s / 198 m against 60 s / 197 m.
    Keystone (r0): 138.7 s against 138.8 s.
    **The tautology this row warned about is real, and is now guarded
    rather than avoided**: on a terminate the driver synthesizes an actual
    FROM 0x0039 itself (`index: null`, RC-3's observation), so the test
    excludes null-index actuals from our side and asserts there were none
    on every capture it compares. `walk-2026-08-25/smoke-terminated` is
    kept in the file precisely as the capture that sets that trap.
    **STILL OPEN, and this is all that is:** a LIVE ring verdict for this
    comparison, the way (a) and (d) have one. A corpus check is a
    regression pin; it cannot speak at a walk.
  - **(c) SHIPPED, and CORRECTED, not merely "switched off."** The old
    framing here — "the TWD verdict is switched off for the whole
    session by any distance interval; all seven committed captures
    contain one, so it has never fired" — undersold the finding: lifting
    that suppression does not make the verdict useful, it makes it
    PASS everywhere (0.2-1.5 m deltas across five captures, all mirrors,
    since our accumulator and TWD are the same work-plus-rest-coast
    quantity). `recordTwdVerdict` is **retired outright**, not merely
    left suppressed. The record itself was also wrong: TWD is an
    ODOMETER of metres genuinely rowed (work + rest coast), lagging the
    interval in progress, never "the goal" — `docs/monitor/
    pm5-interface-notes.md` item 25 and `src/monitor/driver.ts`'s own
    doc comment both corrected, each citing its capture (RC-9c, design
    spec §2).
  - **(d) SHIPPED, new — not in this row's original scope — walk search
    string: `` `rest-distance-verdict` ``** (also one ring line per run;
    W11 below). 0x003A's
    Total Rest Distance (offsets 12-14, 1 m/lsb) gets a narrow parser and
    a ring-only verdict against the sum of `recordedActuals`' own
    `restDistanceMeters` (RC-1's stored rest metres): agrees exactly, 242
    vs 242 m — the exit-7 walk's OWN two committed numbers
    (PM5 memory screen 147 + 95 = 242), decoded by the real parser against
    the real captured 0x003A frame, but fed into a SYNTHETIC 2-interval
    program with the two rest values hand-entered
    (`driver.test.ts:11443`), not a byte-for-byte replay of the capture —
    the test proves the parser and the summation, not that this driver's
    own 0x0037 decode of that specific session yields 147/95. Handles a
    genuine 0 (the r0 keystone) without a false alarm.
    Interval Rest Time (offsets 15-16) is decoded and REPORTED, never
    gated on — it reads 0 on both captures including the r60 walk, and
    we do not yet know if that is a firmware quirk or the programmed
    value.
  - **One further gap this branch's own reviews found and left as-is,
    not blocking, not tracked separately** (the zero-fire below gets its
    own row instead, RC-13, so it survives this row's own closure —
    **duplicate-index over-suppression does not, by design**: it is a
    documented, deliberately-accepted safe direction, not an owed fix).
    **Duplicate-index over-suppression** (`driver.ts:3280-3288`'s own
    fix-round-1 comment): (a)'s `run.actuals > run.recordedActuals.size`
    check also fires when two boundaries land on the SAME normalized
    index (a duplicate Split/Interval Number overwriting
    `recordedActuals` via `.set`) — indistinguishable from a genuinely
    lost index by that comparison alone. No committed capture has a
    duplicate index to confirm the shape against. Left as-is because the
    failure mode is a false suppression (a missing verdict), never a
    false DIFFER/agree — the same "wrong direction is safe" shape (b)'s
    own queueing reasons on the accumulator.
- [ ] **RC-13 — The avg-pace verdict's zero-fire on a rapid re-arm.**
      Pulled out of RC-9's own sub-bullets into its OWN row (PM gate,
      2026-08-25) so it does not get silently ticked closed the moment
      RC-9's (b) lands — it is a real, separately-owed gap, not prose
      riding another row's checkbox. `program()` landing inside a
      finished run's `FINISH_GRACE_MS` (3000 ms) CANCELS the pending
      `pendingSummaryReconcile` deadline rather than draining it
      (`driver.ts:5671`, `pendingSummaryReconcile?.()` then `= null`, no
      `reconcileSummary`/`recordAvgPaceVerdict` call) — that outgoing
      run gets NO `avg-pace-verdict` ring entry at all, silently (W11
      above has the walk-facing read: absence is a finding, not a
      non-event). This is a DIFFERENT shape than the retired TWD verdict
      ever had: TWD's comparison ran SYNCHRONOUSLY at the terminal
      transition, so it could never race a re-arm; the new verdict is
      deliberately async (it waits on evidence that can still be in
      flight), which is exactly what makes it raceable. Zero-fire, not a
      false verdict — a missing walk-log line, not a wrong one. Fix
      shape (not yet built): drain the deadline the same way
      `drainSummaryReconcile` already does for disconnect/hook-reconcile,
      from `program()`'s own re-arm path, before cancelling it for the
      outgoing run.
      **NOT COVERED by the phase close's oracle corpus
      (`oracleCorpusReplay.test.ts`), and the reason is a corpus gap worth
      recording:** the trigger is a `program()` landing inside a finished
      run's 3000 ms grace, and no committed capture contains one. The
      closest — the two pieces of walk-2026-08-25 — are 148.1 s apart.
      Reproducing this needs either a synthetic driver test or a walk that
      deliberately re-arms within 3 s of a finish.
- [x] **RC-21 — FIXED 2026-08-26 (ultrareview round). The "RetestShortcut flake" was not a flake. It is an
      unvalidated cast at a trust boundary, and it can crash the You screen
      in production.** Found 2026-08-26 while dismissing it for the third
      time. `useWorkouts.ts:32` reads
      `const workouts = (await res.json()) as LibraryWorkout[]` — **a cast,
      not a check** — and sets `state: "ready"` with it. `RetestShortcut`
      (`you/RetestShortcut.tsx:29`) correctly guards
      `state !== "ready"` and then calls `workouts.find(...)`, so the
      invariant "ready implies array" is the only thing between a 200
      response and a `TypeError: workoutsState.workouts.find is not a
      function` that takes down the screen.
      **Any 200 whose body is not an array reaches it:** an error envelope,
      `null`, `{}`, or the HTML a captive portal or a misrouted proxy
      returns with a 200. The unit suite reproduces it intermittently
      through mock ordering, which is exactly why it kept being recorded as
      a flake — **a TypeError thrown from a component is never a flake; it
      is a real crash with a timing-dependent trigger.**
      **Fix shape:** validate the shape before declaring ready
      (`Array.isArray`, and reject otherwise into the existing `"error"`
      state, which already has a retry). Then the cast can go. Cheap, and it
      converts a crash into the retry path that already exists.
      **Sibling of RC-19** — both are failures dismissed as flaky that
      encode a real defect. Worth asking, once, how many others are on that
      list.
      **FIXED:** `useWorkouts` now validates with `Array.isArray` and fails
      into the existing `"error"` state, which already carries a retry. Three
      table-driven tests (error envelope, `null`, an HTML page served with
      200) all go red without the guard — verified by reverting it.
      **How it got fixed rather than deferred again:** an unrelated one-line
      change to `LogSession.tsx` flipped the race from 1-in-3 to 3-in-3, which
      made it blocking. **That is the whole lesson — the "flake" was a race
      whose odds any nearby edit could change, and three sessions of re-running
      it green were three sessions of not looking.**
- [x] **PAID — `releaseNotes.ts:98`, shipped in the 2026-08-26 notes**, and
      it carries both falsified clauses by name ("cannot flicker at you" and
      the phone call). Checked off at the phase close, 2026-08-28; it had
      been done and left unchecked. **The original item:
      v0.24.0's notes owe the v0.17.0 correction IN FULL, and the
      cause-free rule must be scoped when briefing whoever writes them.**
      Moved here at the PM re-gate because it had been living only in a dated
      design spec — a record of a decision, not a queue (RF#14's newest
      syntax). The shipped v0.17.0 item carries two falsified clauses: *"so it
      cannot flicker at you"* (it flickered nine times in 288 s) and *"a phone
      call taking the app to the background"* (a CAUSE, and the wrong one —
      the trigger was iOS active/inactive, raised by a Control Center swipe).
      **Do not fix them in the v0.17.0 entry**; a correction on an old
      version's entry has an audience of zero. Put it in v0.24.0's.
      **And scope the constraint when briefing the notes session:** cause-free
      forbids asserting a cause for a GENUINE silence (three producers
      undistinguished). It does NOT forbid naming what triggered the FALSE
      alarm, which is PRIMARY from the plugin's own source. Told only
      "cause-free", a notes writer will censor the one explanation testers
      most need.
- [x] **RC-25 — CLOSED 2026-08-27 by a natural occurrence, exactly as
      designed.** The `pause-declared` instrument fired during the
      walk-2026-08-27 phone-lock leg, WHILE THE ROWER WAS ROWING:
      `frames=4 hold=4 pulled=true d=181.9 split=140.94 spm=29`.
      **The finding is bigger than the item.** The freeze predicate cannot
      tell a stopped rower from a stopped WEBVIEW: a suspended WebView
      replays identical `distance|split|spm` keys, which is precisely what
      `PAUSED_FRAME_HOLD` counts. It declared a pause at 29 spm. Feeds the
      link-authority spec (below) rather than needing its own fix.
- [x] **RC-26 — CLOSED AS INVALID (James, 2026-08-27). The string stays.
      Do not reopen.** His ruling: *"'keep the screen on' implies 'dont lock
      your phone' we can leave it."*
      **The entry was wrong, and the error is worth keeping because it is a
      reusable shape.** It claimed `KEEP THE SCREEN ON` "warns against the
      one thing that cannot happen", reading the spec's criterion 3 (which
      forbids copy that BLAMES the screen timeout) as if it forbade the
      screen being mentioned. But the string is an INSTRUCTION, not a causal
      claim: it names an action and asserts no reason. The component already
      satisfies criterion 3 on purpose — its own comment records that naming
      no cause is a hard constraint, because three producers of the silence
      are undistinguished.
      **And the two candidate strings ask for the same behaviour.** A rower
      who reads `KEEP THE SCREEN ON` does not lock their phone, which is
      James's own point. So the "defect" had no behavioural difference on
      either side of it.
      **Two further corrections made on the way to closing it**, both worth
      more than the item was: (1) it was carried as "fast path, single
      string", and James pushed back — *"Does it? that's about bluetooth not
      the screen"* — correctly, since what actually breaks is the app not
      processing frames once the phone locks, not the screen going dark;
      (2) the controller then over-corrected and called it BLOCKED on the
      pocketed-phone walk, which was hedging: the choice of words never
      depended on the walk's outcome. **VERIFIED while closing:**
      `keepAwakeOn()` is armed at mount (`ConnectedInterstitial.tsx:284`),
      so the automatic timeout genuinely is handled.
      **The lesson:** a copy item that reads a house RULE more strictly than
      the rule reads itself will generate work that changes nothing. Check
      what the rule forbids, then check whether the reader would behave
      differently — if neither answer moves, the item is invalid, not small.
- [x] **RC-28 — CLOSED UNBUILT 2026-08-27 — trigger unwitnessed, with evidence against.**
      walk-2026-08-27: `t=294.71  249.9 -> 1.6  ws=5->5` — a zero-rest
      boundary produces NO state change at all, so the machine never reports
      `resting` there. The code path stays; the item does not.
      **Cheap instrument:** a one-line divergence when `frame.state ===
      "resting"` resolves to a WORK phase — the same shape as RC-36's line,
      which is already earning its keep by staying quiet.
      **(original entry below, kept for the reasoning trail)**
       — the r0 case: a rest the app cannot see, where the coast IS
      still judged. Found at RC-27's review, 2026-08-27; correctly outside
      that brief, filed here because it existed only in a review report.**
      An interval with ZERO programmed rest never gets a `"rest"` phase at
      all (`domain/expand.ts`/`engine.ts` check `restMinutes` for truthiness;
      `surfaceModel.ts:864-876` already documents the consequence). So when
      a machine BRIEFLY reports `resting` there, `phaseIndexForInterval`
      resolves to the WORK phase, `targetSplitSeconds` is non-null, and the
      coasting split renders **judged against a work target** — the exact
      motivating defect of RC-24 and RC-27, in the one window RC-27's
      `restSeconds > 0` term deliberately excludes (that field reads `0.00`
      here, so the countdown correctly does not fire, but the suppression
      does not fire either).
      **The design already names this** as "gets the average but never the
      colour" under its own Honest limits.
      **Unknown without a capture:** whether `midSessionMirror`
      (`surfaceModel.ts:927-930`) masks it when distance has reset. Settle
      that from a recording before designing anything — an r0 program is
      cheap to walk, and the grammar expresses it by OMITTING the rest
      token, never `r0` (which `validate.ts` rejects; see recurring failure
      #13's own canned-block story).
      **Trigger:** the next connected-surface phase, or the RC close-out
      derivation audit, which is looking for exactly this shape. **S**
- [x] **The `log-detail` screenshot is RED on main, and nothing gates it.
      FIXED in #207 (the fixture had drifted out of realism), and the CI
      question RULED by James — see BOTH SETTLED below.**
      Found 2026-08-27 across three RC-24 rounds and RC-27, each time
      reported as "pre-existing, unrelated" and each time correctly so — it
      asserts a `summaryModel.ts` rest-coasting total line those diffs
      cannot reach. **The reason it can sit there indefinitely is the
      point:** `screenshots.spec.ts` is excluded from the chromium project
      CI runs (`playwright.config.ts:27`, `ci.yml`'s `--project=chromium`),
      so a red capture gate never fails a PR and is only seen by whoever
      runs `pnpm screenshots` by hand.
      **The sibling case is why this is filed rather than tolerated:** the
      OTHER long-standing "pre-existing" screenshots failure, `releases`,
      turned out to be a genuinely stale `v0.23.0` version pin left behind
      when v0.24.0 shipped — a real bug wearing the same label, fixed in
      #205. A permanently-red gate trains everyone to read "unrelated" and
      move on, which is how the stale pin survived a whole release.
      **Two things owed:** fix the assertion, and decide whether the
      screenshots project should gate CI at all — a capture suite nobody
      runs in CI is documentation, not a gate (recurring failure #21's
      family). **S**
      **BOTH SETTLED 2026-08-27.** The assertion was fixed in #207 (the
      fixture had drifted out of realism — a tier-A row cannot derive its
      rest, and the seed never stored the pair). **JAMES RULED against CI
      gating:** *"We honestly don't need to run these in ci. It can be part
      of the release skill and maybe a scheduled reup."* So the capture
      suite is DOCUMENTATION, deliberately, and `docs/RELEASING.md` now
      carries a regenerate-and-commit step before the tag.
      **The antagonist pass that checked this ruling's premise found the
      churn is NOT what everyone assumed** — see the falsified `DONE` at
      the `RUN_ID` note below — and found `releases.png` stale by two
      releases while the assertions were green, which is precisely the
      class a release-time regeneration catches and a per-PR pixel gate
      would not have caught any earlier.
- [x] **A SCHEDULED capture re-up — ANSWERED AND CLOSED, 2026-08-27. Not
      on a Linux runner, and not worth a macOS one. Do not reopen.**
      James asked for this to be settled and closed in one pass, and it is.
      **MEASURED, not inferred.** Ran the capture suite inside
      `mcr.microsoft.com/playwright:v1.62.1-noble` against the same compose
      stack the host uses (`--network host`, `E2E_BASE_URL` at the stack's
      own port), then diffed all 90 outputs against the committed
      macOS-rasterized captures:

      **90 of 90 differ. ZERO identical.** Max channel deltas reach 255,
      the largest diffs exceed 110,000 px, and `post-workout-summary.png`
      comes out a different page HEIGHT entirely — so this is not hinting
      jitter, it is a different layout. The suite itself passed 81/81
      inside the container, which is the point: every assertion is about
      the DOM, and none of them can see this.

      The earlier note called it an INFERENCE "very unlikely to be smaller"
      than ±2/255. It was right to hedge and wrong about the scale — the
      real answer is total divergence, not a slightly larger delta.

      **Consequence:** a scheduled job on `ubuntu-latest` would rewrite all
      90 captures on its first run and then fight every human regeneration
      forever. A macOS runner would avoid that and is not worth its cost
      for a suite that, by James's own ruling, is documentation rather than
      a gate. **The release-time step in `docs/RELEASING.md` is the whole
      mechanism.** It is the one that caught `releases.png` two releases
      stale while every assertion was green.

      Corollary worth keeping: **the captures are a macOS artifact.**
      Anyone regenerating them on another platform will produce a 90-file
      diff that means nothing. If that ever needs to change, the fix is to
      pin the renderer (a container used by EVERYONE, host included), not
      to add a job.
- [x] **RC-27 — the LIVE tab's big split shows the COASTING flywheel's split
      during a rest. SHIPPED, merged as #206 on 2026-08-27 (this entry said
      "in review" until 2026-08-27 — a stale checkbox caught while listing
      Phase RC's open work). UNRELEASED: it merged AFTER v0.25.0's own notes
      PR, so the next tag owes it a note. Found 2026-08-27 while James was reviewing
      RC-24's captures; deliberately kept OUT of RC-24's scope by him.**
      **CORRECTION, from RC-27's own review:** this entry's "judged against
      the work target" is WRONG for the ordinary case, and the mockup that
      sold the fix drew the hero in blue on the same false premise. A rest
      phase carries no `targetKind`, so `targetSplitSeconds` resolves
      `null` and `judgeActual` (`domain/judge.ts:129`) returns `"within"` —
      the coast renders in PLAIN INK. It is a false NUMBER, not a false
      verdict. The fix is unchanged; the severity was overstated by the
      person filing it. The judged case is real but confined to r0
      intervals — filed as RC-28 above.
      **The mechanism, verified in code:** `livePace` (`surfaceModel.ts:641-658`)
      suppresses to `null` only when `status === "paused"`. During a rest it
      passes `frame.currentSplit` straight through — and through the coast
      right after work ends that is a real, decaying number, not a dash. (At a
      genuine dead stop `currentSplit` is 0 and it already dashes; the coast is
      the exposed window.)
      **Why it matters:** that value feeds the LIVE pane's hero — the biggest
      number on the screen, and JUDGED, so a coast can paint it blue
      ("faster than target") or red against a target the rower is not currently
      rowing to. It is the same defect RC-24 fixed in the grid's `/500M` cell,
      on the surface where the number is largest.
      **RC-24 fixed the grid CELL-LOCALLY on purpose**, in `buildGridModel`,
      rather than at `livePace` — a function-level suppression would have
      silently changed this other surface inside a PR James had scoped to the
      grid. Doing it there is likely the right EVENTUAL fix; it needs its own
      look at what the LIVE pane should show during a rest (dash? the rest
      countdown? something else), which is a design question, not a bug fix.
      **Do not fix this by widening RC-24's cell-local suppression** without
      answering that question first.
- [x] **RC-23 — DECIDED, KEEP AS IS (James, 2026-08-26): the grid keeps
      showing live frames through the rest and settles when the split lands.**
      Raised by James from his own row — *"the grid view updates during rest,
      then locks in the right numbers after rest. as soon as work ends, the
      grid view should lock finals from the split"* — and then **ruled the
      other way by him once the cost was on the table.** Recorded so nobody
      re-opens it from the symptom alone.
      **The wire fact, measured not guessed:** the split halves for interval N
      do NOT arrive at the work->rest boundary. They arrive at the END of the
      rest. In `docs/monitor/sessions/walk-2026-08-25/rests-finished-ring.json`
      the frame turns `resting` at `atMs 1787693807210` (seq 21) and
      `interval-complete index=0` lands at `1787693866878` (seq 31) — **59.7 s
      later, the whole programmed `r60`.** The grid moves during the rest
      because it is showing live frames while waiting for a split that cannot
      arrive yet, and rest-coast metres plus the machine's still-running clock
      keep those frames moving.
      **So "lock finals when work ends" cannot mean "lock from the split" —
      the split is the late thing.** It would mean locking from OUR
      accumulator and reconciling ~60 s later when the split arrives. Those two
      have measurably disagreed: 1.4 m / 0.7 s on the terminate in
      walk-2026-08-25 W-4, because the accumulator closes at the terminal frame
      while the machine takes one more sample.
      **The ruling, and its reasoning:** a row that is honestly still live is
      better than a row that looks final and then CHANGES under the rower's eye
      when the split lands. Locking early would buy the appearance of finality
      at the price of a number that moves after it claimed to be settled —
      which is the failure this whole phase exists to stamp out.
      **Reopen only with:** evidence the accumulator and split agree closely
      enough at a work->rest boundary that a locked value would not visibly
      change (the W-4 delta was measured on a TERMINATE, not a rest boundary,
      so it does not settle this), or a rower complaint about the live movement
      itself rather than about the settling.
- [x] **RC-22 — CLOSED UNBUILT 2026-08-27.**
      A diagnostic ring with one reader, reachable only from a deliberately
      stale URL with no teardown behind it; every real walk path writes it
      fresh (`useMonitorSession.ts:2560`, unconditional).
      **Cheap instrument:** if a walk's `MONITOR LOG · COPY` ever shows a
      previous session's entries, it is this. Until then, nothing.
      **(original entry below, kept for the reasoning trail)**
       — `ergomatic:last-session-log` is never cleared either, so a
      STALE-URL arrival still copies a previous session's ring.** Residual of
      the ultrareview's bug_002, found at its scoped review (2026-08-26). The
      flagship case is genuinely fixed: a session that just ended wrote that
      key at teardown, so a `?from=monitor` arrival gets its own ring. But
      **nothing clears the key**, so opening a bookmarked or reloaded
      `/library/:id/log?from=monitor` with no teardown behind it copies
      whatever session wrote it last — the same "reloaded bookmark" story the
      door-miss pruning already had to defend against.
      Lower harm than bug_002 (it needs a deliberate stale URL rather than the
      ordinary failure path) but the same shape: a diagnostic presenting an
      old session's evidence as this one's. **Fix shape:** the same `atMs`
      floor the door-miss merge now uses, or a per-arrival freshness marker.
      Do NOT fix it by clearing at connect — that was tried for bug_002 and
      broke the by-hand recovery path.
- [x] **RC-19 — CLOSED UNBUILT 2026-08-27 — the inference excluded a producer nobody ruled out.**
      "A different assertion failing each time means shared state or
      ordering" is an inference presented as a conclusion. An equally good
      producer: vitest's default 5000 ms timeout under a combined-project
      run, against a file posting 1 MB bodies and 14,400-sample series. Both
      predict "a different test each time".
      **Cheap instrument: PASTE THE FAILURE MESSAGE next time it goes red.**
      `Test timed out in 5000ms` convicts the harness and closes this;
      an assertion diff convicts shared state and reopens it. One line of
      evidence, zero code.
      **(original entry below, kept for the reasoning trail)**
       — `server/routes/data.test.ts` flakes under the combined
      `--project unit --project client` run, and it is NOT one flaky test.**
      Observed four times across three sessions on 2026-08-25, and the
      interesting part is that it fails a DIFFERENT test each time: once
      *"DELETE is idempotent"*, once *"accepts distanceMeters at its exact
      upper bound"*, and twice unnamed. Always green on re-run, always green
      under `--project unit` alone (46 files / 1434 tests), and green in
      isolation. **A different assertion failing each time means the fault is
      shared state or ordering, not a bad assertion** — chasing the named test
      will find nothing. Landed here rather than left in three task reports
      (recurring failure #14). First moves, from the flake-hunt playbook this
      repo already has: capture the failure instead of re-running to green,
      then check whether failures cluster by worker index or by file ordering,
      to separate a harness race from an app race. Related in kind to the two
      e2e flakes already tracked.
- [ ] **RC-18 (PAIR WITH THE `door` COLUMN — both want the next stored-shape
      change to the logs table; PM re-gate, 2026-08-26. RC-18 is also precisely
      the over-claiming row the under/over-claim argument was written about: a
      row asserting a machine identity it does not know.) — `"PM5"` is baked
      into a fallback the rower can SEE, and it
      will be wrong the day we support another monitor.** James, 2026-08-25,
      on Phase LM Task 4's new label: *"We may one day support other rowers.
      Be careful where we use 'PM5'."* That label was renamed in the same
      breath (`NO MONITOR READING`, matching the shipped `LOST THE MONITOR` —
      **"monitor" is the house word, "PM5" is a model number**), but the sweep
      found a SECOND instance that is not copy and was not fixed:
      `webBluetooth.ts` and `capacitorBle.ts` both do `device.name ?? "PM5"`,
      so an erg advertising an empty GATT name gets literally named "PM5" in
      the device caption, in `deviceName` on the saved row, and therefore in
      the stored record forever. On a Concept2 that is merely redundant; on
      anything else it is a false claim about which machine the rower used,
      persisted. **Fix shape:** fall back to a neutral noun, not a model
      number. Left out of Phase LM PR 1 deliberately — it touches both
      transports and a stored value, so it wants its own failing test rather
      than riding a copy change.
      **Standing rule this establishes:** user-facing copy says "monitor";
      "PM5" appears only where we are quoting the device's OWN advertised
      name, or in release notes describing what shipped at the time.
- [ ] **RC-17 — The tier-A total line drops rest, and only `pnpm screenshots`
      sees it.** Found 2026-08-25 by Phase LM's Task 2 implementer, on a
      capture unrelated to its own work, and landed here rather than left in a
      task report (recurring failure #14). `e2e/screenshots.spec.ts:2370`
      expects `.summary-total-line` to read `4:04 total · plus 242 m coasting
      in rest`; it renders `2:04 total`. **Reproduced on a fresh
      `docker compose down -v` volume, so it is not stale test data.**
      Diagnosis from the code, not by elimination: the seeded row is tier A
      (`machineWorkSeconds`/`machineWorkMeters` both set), and `buildHeroes`'s
      tier-A branch calls `buildStoredTotalLine(row, timeSeconds, {})` with an
      EMPTY `stepSums` — the fix-round-2 C1 change from RC-5
      (`storedSummary.ts:620-634`) — while that seed sets neither
      `restSeconds` nor `restMeters`, so the rest half of the line vanishes.
      **Owner is whoever landed RC-5, not Phase LM.** **The fix, inlined here
      because the report it used to point at lives in git-excluded
      `.superpowers/` and dies with its worktree (RF#16's corollary, caught at
      #198's PM gate): add `restSeconds: 120, restMeters: 242` to that
      screenshot seed's `postLog`.** The unit fixture asserting the identical
      string (`src/log/storedSummary.test.ts:118-119`) already seeds both and
      passes, which is exactly why the unit test stayed green while the capture
      rotted.
      **Why it went unnoticed: `pnpm screenshots` is not part of CI**, so a
      capture assertion can rot indefinitely between the hand-runs that touch
      it. That gap is the more interesting half of this row — the unit test
      asserting the same string passes, because it supplies the step sums the
      seed does not.
- [ ] **RC-14 — The avg-pace verdict's zero-fire on an ORDINARY finish
      (walk 2026-08-25, W-2). A SECOND, DISTINCT shape from RC-13 — do
      not fold them.** Piece 1 of the walk (`w 1' r1 / w 500m r1 / w 1'`,
      natural finish, all three intervals recorded) produced NO
      `avg-pace-verdict` ring entry at all. Not a verdict, not one of the
      five suppressions — silence, which W11 above names as a finding.
      **RC-13's mechanism is RULED OUT by the capture's own timestamps:**
      the next `program()` came 148.1 s after the finish, not inside the
      3000 ms grace, and `reconcileSummary` demonstrably DID run for that
      run (`summary-reconciled — split-won`, 0.541 s after the finish,
      seq 71 of `rests-finished-ring.json`). Every branch of
      `recordAvgPaceVerdict` (`driver.ts:3301`) calls `log.record` before
      returning — there is no silent path — so the function was never
      REACHED, on a run whose reconcile ran. The verdict call sits as the
      next statement inside the same block as that reconcile
      (`driver.ts:3692`/`:3698`). **The mechanism is NOT established:
      nothing in this row asserts one, and the first job is to find it,
      not to patch the call site.** Replayable end to end — both the raw
      recording and the ring are committed at
      `docs/monitor/sessions/walk-2026-08-25/`. Note what this costs: the
      oracle shipped one PR ago (#196) and has now been walked once, on
      exactly the shape it exists to check, and said nothing.
      **REPLAYED AT THE PHASE CLOSE (2026-08-28), AND THE SEARCH AREA IS
      NOW MUCH SMALLER.** This capture was replayed through the real
      `createPm5Driver` — at current main AND, separately, with
      `driver.ts` checked out at `c219ee0`, the exact commit the walk's own
      laptop lab ran — and BOTH produce the verdict:
      `machine(0x0032)=136.02s/500m ours=136.26s/500m delta=0.24s — agree`.
      The replayed ring matches the walked ring entry for entry
      (`summary-half` -> `summary-log-stamp` -> `summary-totals` ->
      `summary-reconciled buffered` -> `summary-half` ->
      `rest-distance-verdict` -> `verification-received` ->
      `summary-reconciled split-won`) and then records the verdict in
      exactly the gap where the walked ring goes straight to
      `disconnect-requested`. Pinned by
      `app/src/monitor/oracleCorpusReplay.test.ts`.
      **What that eliminates:** the wire traffic (sufficient, on its own,
      to produce the verdict); the driver's response to it (identical
      ring, up to the gap); ring eviction (73 entries, seq 0..72, against
      `eventLog`'s 500-entry capacity); and "the walk's build predated the
      oracle" — **that last one is PROVABLE rather than inferential, and the
      exit pass supplied the proof: `git log -S` returns the SAME single
      commit (`c219ee0`, #196) for BOTH `recordAvgPaceVerdict` and
      `recordRestDistanceVerdict`, so the seq-69 `rest-distance-verdict` in
      the walked ring cannot come apart from the avg-pace half; and the
      walked ring's own `summary-log-stamp` reads
      `wall=2026-08-25T21:42:03.110Z`, fourteen minutes after that commit's
      own timestamp.** Both call sites of `reconcileSummary` are followed
      immediately by `recordAvgPaceVerdict`, and every branch of that
      function records before returning — so on the walked run it either
      threw, or something outside the driver dropped the entry between
      `log.record` and the persisted `ergomatic:last-rowed-log`. Those two
      are the survivors; start there, not at the call site.
- [x] **RC-15 — 0x003A's Interval Rest Time is the LAST interval's.
      SETTLED by the walk itself (2026-08-25, W-9); no experiment
      owed.** The field read 0 for the third capture running, this time
      on a piece carrying two real programmed 60 s rests. The same
      recording answers it: each 0x0037 carries its own interval's rest
      time (`[12..13]`, 1 s) and rest distance (`[14..15]`, 1 m), reading
      60 s/130 m, 60 s/144 m, and 0 s/0 m for the three splits. 130 + 144
      = 274 m = 0x003A's Total Rest Distance to the metre. So the field
      is neither dead nor a total — it is the FINAL interval's rest, and
      every capture we hold ends on a work interval, which has no
      trailing rest by construction. Still never gate on it (the driver
      does not); the value is now EXPLAINED rather than merely
      distrusted. A rest-final program would only confirm this, so the
      planned experiment is dropped rather than carried.
- [x] **RC-16 — CLOSED UNBUILT 2026-08-27 — PREMISE FALSIFIED by our own walk.**
      "Terminate implies 0x0039's avgStrokeRate reads exactly double" came
      from two captures. The third refutes it: walk-2026-08-27's terminated
      piece reads **25 against a PM5 screen reading 25**. So the rule is
      2-of-3, and the field is rendered NOWHERE (no file reads
      `summaryDetail.avgStrokeRate`). **The suppression this item asked for
      would have been WRONG on the newest capture.**
      **Cheap instrument:** re-file as a WARNING for the first surface that
      ever displays the field (Phase PS), not as a build item.
      **(original entry below, kept for the reasoning trail)**
       — Suppress 0x0039's average stroke rate on a terminated
      piece** (walk 2026-08-25, W-3). On a Menu-terminate the field reads
      exactly DOUBLE: 46 against the PM5 View Detail screen's own `23
      s/m` and against 0x0038's per-split 23. The previously committed
      terminate capture shows the identical 2× (44 against 22), and the
      natural finish in the same walk is clean (24 against 24/23). Two
      terminate captures, both exactly 2×, now with the machine's own
      memory screen as the tie-breaker — the screen sides with 0x0038.
      Cause unknown and deliberately not guessed here. This field is not
      displayed today; the row exists so it is never wired up without the
      terminate suppression, and so the fact is written down where the
      next reader of the summary decoder will hit it.
- [ ] **RC-10 — The Concept2 sandbox as a test oracle.** Once the dev key
      lands: post a reconciled row to `log-dev.concept2.com`, pull
      `export/{csv,fit,tcx}` back, and diff it against what we stored.
      **Two gates on a POST that the numeric work does not cover:**
      `weight_class` is REQUIRED for a rower and we store nothing
      — RULED (James, 2026-08-22, phase open): a binary H/L field asked
      ONLY at Concept2 link time (the OAuth grant), never at onboarding;
      C2's own profile cannot supply it (PRIMARY: `GET /users/me` has no
      weight field; `weight_class` lives on results only, "Required if
      type is rower... H or L"). Optional nicety: prefill from the
      user's latest logged result if their history has one; per-interval `rest_time` is REQUIRED
      and we decode it at `parse.ts:236` then drop it (RC-1 closes this).
      Also unresolved and worth settling before we post in anger: if
      James runs ErgData too, success means our row and ErgData's row are
      the SAME row under C2's dedup. Whether that merges, rejects or
      duplicates is **not established by the review** and decides whether
      this is leverage or a fight over ownership of the row.
- [ ] **RC-11 — The stroke-data reframe, which is three-way not two —
      AND owner of RC-6's deferred `p: 0` half (narrowed off at the
      phase-open gates, 2026-08-22):** whether stored samples stop
      carrying `p: 0` for no-reading strokes is settled HERE, at
      serialization design time — `traceModel.ts` guards on `!== 0` and
      the server validator requires the field, so any change is a
      reader+validator+shape change, not a recorder one-liner.
      C2's `stroke_data[].t` restarts at 0 PER INTERVAL; ours is
      cumulative across the session. Worse, our series clock is a THIRD
      quantity — work plus however much of the trailing rest the wire
      clock advanced before freezing (session-2: 398.4 work / 419.5
      series / 488.4 header). **None of the three is C2's `time`.**
      Depends on the warm-up section below. Our `r` rest marker has no C2
      slot at all and stays ours-only, which is the honest boundary of
      what Concept2 can hold for us.
- [ ] **RC-12 — Documentation reconciliations**, each a defect by this
      repo's own rule; fold into the PRs above rather than a sweep.
      **FOUR OF SIX DONE at the phase close (2026-08-28); the two that
      remain are named at the bottom, with why they were left.**
      - ~~`driver.ts` and `pm5-interface-notes.md` still call
        `deriveFinalIntervalFromSummary`'s two premises UNCONFIRMED when a
        capture settled BOTH.~~ **DONE.** Both premises now read SETTLED,
        each citing interface-notes §27.1 and the capture behind it, and
        the notes' own 0x0039 table rows (Elapsed Time, Distance) no longer
        contradict §27.1 four hundred lines further down. The two
        `driver.test.ts` assertions that pinned the old wording moved with
        it.
      - ~~The runtime `how` string prints `UNVERIFIED PREMISE (§23 walk
        item 4)` on every summary-derived fill.~~ **DONE, and this was the
        one that mattered** — it is not a comment, it is a diagnostic a
        walk reads at the erg, and it was telling its reader a settled
        question was open. It now states that both sides are work-only per
        §27.1 and prints what the number WOULD read on a machine where that
        failed, so the erg-side check is a comparison rather than a caveat.
      - ~~`connectedAxes.ts` declares the link axis is "never invented"
        then returns `"up"` from `phase` alone.~~ **DONE.** The claim was
        aspirational and `deriveLink` never met it (`up` covers the whole
        `pairing`..`live` group, and `pairing` spans the connect settle
        itself). Rewritten to state what the axis actually promises: the
        DIRECTION of its uncertainty, `"lost"` being the conservative
        answer.
      - ~~§20 items 17 and 24 are contradicted by the captures that settle
        RC-4.~~ **DONE, folded into RC-4's PR.**
      - ~~`driver.ts` says "no capture or existing test evidences" state
        9.~~ **ALREADY DONE before this close** — series-truth reconciled
        it in place and the comment now cites `walk-2026-08-24/
        phone-exit7-ring.json` seq 27/28. Recorded here because this row
        still listed it as owed, which is the same drift the row exists to
        catch.
      - ~~`pm5-interface-notes.md` says 0x0037's work-only status is "still
        open" while `state-architecture-review.md` says PROVEN.~~ **ALREADY
        DONE** — notes item 22 reads "SETTLED work-only (state-architecture
        review §7, then RC-5 hero-truth)".
      **STILL OWED, and deliberately not in the close-out PR:**
      `types.ts:429-433` claims `onDisconnect` covers the Bluetooth stack
      resetting and iOS backgrounding — it covers neither (Phase LM's
      lifecycle work is the evidence). `schema.ts:165-167` calls
      `distance_meters` "the machine's whole-meter total" when it is our
      sum, work + rest. Both sit under `app/domain/` and `app/server/`,
      which the close-out PR holds at ZERO files by the fast path's own
      first check — a comment-only edit there is still a file there. They
      ride the next PR that touches either directory.

### The warm-up question, reframed 2026-08-21 (James)

> **SUPERSEDED the same day: James chose to remove warm-ups entirely —
> see Phase WU below, which lands BEFORE RC-1.** The reasoning below is
> kept because it is why the removal is safe for Concept2 (the machine,
> not us, decides what is in the row) and because it still governs any
> future decision to reintroduce a warm-up in any form.


This was written as "which population is the row?" — DISTANCE and TIME
include the warm-up, AVG SPLIT excludes it, pick one. **That framing was
wrong, and it hid the actual lever.** It is two questions, and only one of
them is open.

**The Concept2 half is not a choice, and the hash enforces it.**
`program.ts:37` compiles `IntervalType = "warmup" | "work" | "test"` — the
warm-up is an interval inside the type-8 workout we send the machine. So
the PM5 already counted it: its log entry covers the warm-up, and the
verification code is computed over THAT entry's date, distance and
duration. Upload a distance that excludes the warm-up and Concept2 rejects
the code. There is nothing here for a rower to consent to and nothing for
us to decide at upload time. **This is the good kind of constraint — we
cannot get it wrong silently.**

**The lever is at PROGRAM time, and that is the real open question:**

> **Should a warm-up be programmed as its own PM5 piece, separate from the
> working intervals?**

Program one workout and it is one C2 row with the warm-up inside, by
mechanism. Program the warm-up separately and it is a separate PM5 log
entry and a separate C2 row, cleanly, with no reconciliation cost either
way. **The consequence that decides it is the rower's logbook, not ours:**
a 2 km warm-up in front of a 6 km piece becomes an 8 km row, and their
season total, rankings and any Concept2 challenge counts all include it.
That argues for separate pieces by default, but it is a product call and it
changes the compiler, so it belongs in RC-1's spec rather than being
settled here.

**The screen half stays open, and aligning with Concept2 does not close
it.** C2 has no average-split field at all — it stores distance and time
and derives pace — so AVG SPLIT's population is purely a rower question.
Making DISTANCE and TIME C2-shaped can make RC-5 WORSE: the three heroes
still contradict each other, just by a different amount. **RC-5 needs its
own answer and must not be closed by citing this section.**

**What this means for the enrichment layer, which is bigger than traces.**
C2's per-interval `type` is `time|distance|calorie|wattminute` — a
DIMENSION, not a ROLE. There is no warm-up flag, and `REST=2` has no C2
twin either (see RC-1's map note). So "which intervals were working
intervals" is ours-only, the same category as the `r` rest marker in
RC-11. That is not decoration: every judgment this app makes hangs off that
distinction. **Concept2 holds what happened; we hold what it meant.** Any
design that treats our layer as an optional garnish on C2's row has the
relationship backwards.

### Walk items this phase owns

Runsheet-ready, from the review's §6. **W2 is the single most valuable
item** and W3/W4 ride the same piece.

- **W1** — record the firmware version (2 min, no rowing). PM5
  432331249's firmware has never been recorded anywhere in this repo, and
  0x003F is gated to nine disjoint firmware bands. Without it we cannot
  say whether the verification hash exists on our machine at all.
- **W2** — **do not tear down at the finish.** One 2x250 m r0 keystone,
  then stand still for 90 seconds and touch nothing. Settles whether the
  summary path is reachable at all, when state 12 fires, and whether the
  ~1-minute recovery-HR re-fire is real. **PARTLY OVERTAKEN by PR #180
  (2026-08-23): production now holds the link up to 2 s at a natural
  finish (`BURST_LINGER_MS`) and the burst is captured without any
  instrument — but the 90-second questions (recovery-HR re-fire, late
  state-12 behaviour) still need the hold-open instrument or the laptop
  harness. The readout for the captured burst is the ring's linger-end
  SECOND stash.**
- **W3** — the identity photograph, same piece: the PM5's View Detail
  memory screen and the phone in ONE frame, plus the decoded
  `logEntryDate`/`logEntryTime` from the ring. Settles the bit-packing
  against a real erg and whether the monitor's own entry carries seconds.
- **W4** — the verification hash, same piece: subscribe 0x003F, dump raw
  hex, photograph the PM5's own 16-digit code in the same frame. Settles
  whether 0x003F fires on our firmware, when, and which byte order the
  monitor prints (CSAFE says byte 0 = MSB, the BLE table says "Lo" — the
  two documents disagree). **The only route to the verification branch.**
- **W10** — a distance-shaped summary (3x300 m r30, held open 90 s), only
  if W2 shows 0x0039 arriving at all. Extends the cumulative/rest-exclusive
  settlement, which rests on one TIME piece. **Renamed from W7** (spec
  §6, 2026-08-22): two items on the combined walk were both called W7 —
  this one and Phase LL's, which keeps the name because it stays on the
  PHONE leg, where its watchdog-false-fire question is actually
  observable.
- **W11 — WALKED 2026-08-25, and it earned its keep.** Record:
  `docs/monitor/sessions/walk-2026-08-25/`. `rest-distance-verdict`
  fired and agreed on the first rest-bearing piece ever put to it
  (274 m against 274 m). `avg-pace-verdict` fired ZERO times across two
  pieces where it should have fired twice — once legitimately suppressed
  on the terminate, and once SILENT on the natural finish, which is
  RC-14. The absence-is-a-finding clause below is the only reason the
  silence was noticed at all; the count rule (N pieces ⇒ N lines) is
  what caught it. The same walk also settled §23 items 2 and 4 (0x0039
  is cumulative and rest-exclusive) and unblocked RC-9(b), which was
  oracle-blind for want of a rest-bearing capture reaching 0x0039 —
  `rests-finished-recording.jsonl.gz` is that capture. Keep this item
  live for future walks; the read-it-off procedure below is unchanged.
- **W11 (procedure)** — RC-9's two new ring verdicts, read off `MONITOR LOG · COPY`
  after any rest-bearing multi-interval piece. Grep the pasted log for
  the literal strings `` `avg-pace-verdict` `` and `` `rest-distance-verdict` ``
  — one line each, per run. **The ABSENCE of an `avg-pace-verdict` line
  is itself a finding, not a non-event**: every other outcome (agree,
  DIFFER, or any of its five suppressions) writes a plain-English ring
  entry with a reason, but the pre-existing `FINISH_GRACE_MS` zero-fire
  (`driver.ts:5671` — `program()` landing inside a finished run's 3 s
  grace cancels the pending verdict instead of draining it) writes
  SILENCE — no entry at all. Arming the next piece within 3 s of the
  previous one's finish is the walk's own NORMAL between-pieces rhythm,
  so this is not a rare edge to watch for; expect it to fire on a
  routine multi-piece session and confirm by counting: N pieces rowed
  should produce N `avg-pace-verdict` lines, FULL STOP — a suppression
  WRITES a line (with its reason), it does not subtract one, so the
  count never comes down for a healthy reason. A missing line is the
  zero-fire, not a healthy run. (Corrected at the #196 PM re-gate: this
  clause used to read "minus any genuinely suppressed ones", which
  invited exactly the miscount that would explain a real zero-fire
  away.)

**Arming the hold-open instrument (final-review I3 — the card never said
HOW before this fix):** W2/W3/W4/W10 all need it armed. On the laptop, in
Chrome DevTools' console, BEFORE the finish (the chip is a one-shot per
session — arming after the finish is too late):

1. `window.__pm5HoldOpen__.arm()` — confirm it took: the "HOLD-OPEN ARMED"
   chip appears next to the connection line. If `window.__pm5HoldOpen__`
   is `undefined`, the build was not run with the fake-monitor gate open
   (`pnpm dev`, or `VITE_ENABLE_FAKE_MONITOR=1`) — see `transports/index.ts`.
2. Finish the piece normally. `window.__pm5HoldOpen__.status()` reports
   `{ state: "holding", msRemaining }` for the next 90 s.
3. `window.__pm5HoldOpen__.ring()` reads the live trace at any point during
   the hold — every notification the PM5 sent, plus lifecycle markers
   (`0x003f subscribe-issued`, and — if the firmware lacks 0x003F —
   `0x003f subscribe-failed <message>`; a `subscribe-issued` entry with NO
   later `subscribe-failed` and no `0x003f` notification lines means the
   subscribe went through cleanly and the firmware genuinely sent nothing,
   the W4 negative). `hold-start` marks the armed→holding transition;
   `hold-released`/`hold-expired`/`link-drop-*` entries mark how the
   window ended.
4. Once the hold ends (release, the 90 s timer, or the PM5 hanging up
   first), the ring is stashed into sessionStorage. On the Log screen that
   follows, **MONITOR LOG · COPY reads this live** (final-review I2) — it
   will include the held-open window, not just the pre-hold trace.
5. **Reconnecting for a later item (W10, or a retry after "Try Again")?**
   `window.__pm5HoldOpen__.release()` first if a hold is still in flight —
   a stale decorator's own 90 s timer can otherwise hang up the NEW link
   out from under it (final-review M2).

**Protocol rules the combined walk plan must carry (spec §6, both
gates):**

- **Priority order: W1 → W2/W3/W4 (one piece) → the phone leg (LL's
  clause (b) pinned above the cut line within it) → W10.** The budget
  can run out; it must not run out before W2. Everything below W10 is
  cuttable without a second thought.
- **One link at a time:** the laptop disconnects (hold released) before
  the phone connects. Whether the PM5 accepts two centrals is an open
  question this ROADMAP contradicts itself on elsewhere ("the PM5 is
  single-central HAS NO SOURCE" versus a later line asserting
  single-central as settled) — the walk SETTLES it as a deliberate
  probe after all other evidence is gathered, never discovers it
  mid-evidence.

**Not worth a walk:** re-observing 0x0037's work-only semantics (settled
twice from committed bytes) or the state-9 frame (captured 2026-08-18).

**ANSWERED 2026-08-23 — record: `docs/monitor/sessions/walk-2026-08-23/`,
one keystone piece with PR #167's hold-open instrument.** W1: firmware
459.069 (serial 432331249, hw 134) — and empirically inside an emitting
band. W2: **the summary path EXISTS** — 0x0037/38/39/3A/3F all arrive
within ~310 ms of the finish; the pre-LL 21.7–107.3 ms hangup was cutting
inside the burst, so the "0x0039 never fires" corpus fact was OUR deafness,
not the machine's silence; state 12 (WORKOUTLOGGED) observed for the first
time; recovery-HR re-fire not observed (no belt worn). W3: date/time
bit-packing CONFIRMED against the memory screen (8/23/2026, 09:28) and the
wire carries NO SECONDS — RC-2's tolerance question is now a hard fact.
W4: **0x003F fires, at the finish, and the byte order is settled — two
little-endian u32 words** (`27 d8 f3 6e | e1 52 55 5b` = the PM5's own
`6EF3-D827 5B55-52E1`); the BLE table's "(Lo)" reading wins, CSAFE 0x72's
"MSB" describes its own framing. W10 answered in substance (the keystone
IS a distance program; its 0x0039 read work-only 500.0 m exactly).
Two-centrals: **a connected PM5 stops advertising** — settles the
single-central contradiction empirically. **RC-1 caveat from the walk
(F5):** TWD read 0 through 11 s of interval 1 (boundary-accumulator-like)
but 81 m at 56 s mid-interval on another run — its semantics on time
intervals are INCONSISTENT across today's captures; RC-1's spec must not
assume either reading. RC-2/RC-3/the verification branch are UNBLOCKED.

### Not now, each with its reason

- **`CSAFE_PM_GET_TOTAL_WORKDISTANCE` (0xA4) as a distance oracle** —
  speculative twice over: never issued against our firmware, and if it
  behaves like TWD on a distance goal it reports the GOAL, in which case
  lifting the suppression would be exactly wrong. A walk probe, not work.
- **Subscribe 0x0036 for `stroke_count`** — a real C2 column we cannot
  fill, but a fourth characteristic in every burst at 10 Hz, and the
  column is not on the dedup key. After RC-1 and LL's A-2.
- **Recovery heart rate** — the wire event fires about a minute after the
  finish; both our 3 s grace and our teardown reject it. Not a product
  feature. It is the clearest illustration of why A-2's close condition
  should be an EVENT, not a duration.
- **`MID_SESSION_RESET_METERS = 1`** — a genuine tuned-threshold instance
  where workout states 0 and 13 state the answer, but purely cosmetic.
  Prefer the state bytes only if the mirror is touched for another reason.
- **A partial final interval for an END-mid-piece session** — the summary
  shows dashes while a 44-sample trace of the 150.7 m rowed sits in the
  same row. That is a stated product rule, not an oversight. Revisit
  deliberately or not at all.
- **The armed-but-machine-rowed END path silently discards the row**
  (James, 2026-08-24, tester report; see the pocketed-phone walk item
  above). A rower who never presses Start on the app side but completes
  a programmed piece on the machine gets no save door and no message —
  the app should say something honest instead of discarding silently.
  Queued, not scheduled. Trigger: the pocketed-phone walk settles the
  mechanism; fix rides that phase.
- **Recover-from-monitor-memory** — the deep fix for the same tester
  report: the PM5's own memory holds the committed row even when the app
  never saw it, and a read-back path is the only thing that can return a
  genuinely lost workout. Natural follow-on to the summary-record wave
  (its writer already knows the record shape a recovered row would
  fill). Queued, not scheduled. Trigger: James schedules it, likely after
  the pocketed-phone walk narrows the mechanism.

### Sequencing across RC, WU and LL — worked, not asserted (James, 2026-08-21)

Ordered to avoid re-work. **Two collisions matter more than the logical
dependencies** and are the reason this section exists rather than a
sentence:

- **NARROWED 2026-08-21 at the PM gate: the collision is ONE file, not
  three.** This bullet inherited its file list from the grep-era map.
  Measured against the spec's actual footprint, `driver.ts` carries
  warm-up COMMENTS only (`:2194`, `:3839-3867`) and
  `useMonitorSession.ts` carries one (`:179`). The real overlap is
  **`surfaceModel.ts` alone**. **WU and LL implementations still must not
  run concurrently on `surfaceModel.ts`** — but **LL's DIAGNOSABILITY
  TIER CAN RUN ALONGSIDE WU**: it touches `adapters/monitorTransport.ts`
  and `LogSession.tsx`, not `surfaceModel.ts`, it is the cheapest LL item,
  and it is the thing whose absence made both walk findings
  evidence-poor.
- **RC-8 and Phase LL both own work on the fake.** LL's reconnect
  precondition is "the fake models handle invalidation" (its OUT list,
  item 2); RC-8 is the fake's five contradictions of the real wire.
  **These are ONE piece of fake work and must be specced together** —
  doing the fake twice is precisely the re-work this ordering exists to
  prevent. Whichever phase gets there first carries both, and the other's
  item points at it.

**The order:**

**Wave 0 — unblocked today, no collisions with anything.** RC-4 (the
Last Split 10x, which also fixes its mirror in `statusFrames.ts`) and
RC-6 (band `spm` — `seriesRecorder.ts` — **SHIPPED**; the `drop zero p`
half narrowed off to RC-11). Neither file is touched by WU or LL. These
can go now and need nothing from anyone.

**Wave 1 — Phase WU. REWRITTEN 2026-08-21 at the PM gate: all three of
this wave's original reasons were falsified and it now stands on a
different one.** Struck: "the compiler enumerates the work" (spec §10
opens by calling it False — two of the four warm-up unions are invisible
to `tsc`); "the single biggest re-work-avoider … RC-5 reconciles three
heroes whose disagreement is partly the warm-up" (measured at 5%, and 0%
on the second exhibit); and "WU inserts ahead of LL only because it is
small" (measured at ~65 grep-reachable files).

**The surviving reasons, and they are enough:** WU precedes RC-1 because
the program-time "should a warm-up be its own PM5 piece" question
disappears entirely, and RC-1 would otherwise design storage for a
population about to change. WU precedes LL **only because WU is SPECCED
and LL's brick work is not** — a spec plus a spent antagonist pass versus
a research pass and no spec. Ordering a ready thing behind an unwritten
one costs calendar days in which nothing merges.

**BINDING CONDITION (PM gate):** LL's brick spec is written IN PARALLEL,
starting now. The collision rule below bars concurrent IMPLEMENTATIONS,
not specs. **If LL's spec lands before WU's implementation finishes, the
order flips without further argument** — the brick is the item that makes
James delete his app.

> **SPENT 2026-08-22.** WU shipped (#150, main `1602248`). Everything in
> this wave-1 argument and in the collision rule below is now HISTORY, kept
> for the reasoning only. **Nothing blocks Phase LL**, and the parallel-spec
> condition is discharged by starting LL's spec next. RC's own waves 0 and
> 3-5 are unaffected and still stand.

**Wave 2 — Phase LL** (A-2, A-4, the diagnosability tier), carrying
**RC-7** inside A-2's spec by the review's own ruling, and carrying the
merged fake work above. LL stays ahead of the rest of RC because RC-2,
RC-3 and RC-10's oracle leg are all blocked on A-2 — **nothing arrives on
the wire today**, so they cannot even be tested before it lands. LL is
also a PROD precondition and the only item here fixing a defect that
bricks the app.

**Wave 3 — RC-1**, the phase's spine, once WU has settled the population
and the merged fake work has made a green test mean something. **RC-8's
`intervalRestTimeSeconds: 0` hardcode gates this specifically:** RC-1
carries exactly that field, and without the fake fix it ships green
against a fake asserting the machine reports 0.

**Wave 4 — RC-2 and RC-3** (need A-2's held link), **RC-5** (needs WU,
and lands with or after RC-1 since RC-1 changes what is stored), and
**RC-11** (needs RC-1's storage plus the clock decision).

**Wave 5 — RC-10** (needs RC-1's per-interval `rest_time`, the dev key,
and a `weight_class` answer), then **RC-9** and **RC-12**, which are
cleanup and can trail anything.

**What this does NOT reorder:** the PM gate's phase order (LT close → LL
→ CL2 → LQ → PROD) stands. WU inserts ahead of LL only because it is
small, independent and collides with it; RC as a whole sits after LL.
