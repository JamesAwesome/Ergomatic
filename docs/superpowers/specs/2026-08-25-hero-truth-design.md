# The three heroes stop contradicting each other — design (RC-5)

**What and why.** A saved connected row shows DISTANCE, TIME and AVG SPLIT
computed over THREE different populations: DISTANCE sums work plus the
metres the flywheel coasted during rests, TIME sums work plus the
PROGRAMMED rest, and AVG SPLIT is work-only. A rower divides the first two
in five seconds — everyone does, it is how rowers check their own numbers —
and gets a pace up to 40 s/500 m away from the one on screen. The rower
persona's first read of that screen is not "three populations", it is
**"the app's pace calc is broken."** This spec makes all three heroes ONE
population — work only, the machine's own — and puts the wall-clock total
on its own line beneath, which is exactly the two-tier answer the PM5
itself gives.

James's ruling (2026-08-25): **"I want to match the PM5."** The PM's
research settles what that means, and it is not a compromise: the PM5's
Totals row IS work-only, and the only fused number it shows is Total Time
in the page header.

TRIAD: this changes what three displayed numbers MEAN. Full antagonist
pass DONE (2026-08-25) — it HELD the PM5-is-work-only premise and KILLED
the original construction; this revision is the result. PM final gate on
the PR. Ships alone.

**James's fork ruling (2026-08-25), the one the pass forced:** "match the
PM5" and "one uniform rule on every row" cannot both hold, because the
machine disagrees with the sum of its own displayed rows (901 vs 899) and
truncates where we round. He chose **the machine's own numbers**: a row
that HAS the machine's totals shows them, digit-identical; a row that
does not keeps computing from its own actuals and never claims to be the
machine's. The population split #190 created is accepted here, named on
screen, and is the price of digit-identity.

## Evidence base

- PRIMARY (photographed PM5 View Detail screens — TWO discriminating, not
  three; the pass corrected the count): walk-2026-08-20 is the decisive
  one, `4:14.9 / 899 / 2:21.7` where a FUSED reading of the same screen's
  own components would be `6:14.9 / 1154 / 2:42.4`; walk-2026-08-24 shows
  `2:04.0 / 500 / 2:04.0` against a fused 742/4:04. walk-2026-08-23 is
  NON-discriminating (r:00 rests, zero rest metres — both hypotheses
  predict the same number) and is not counted as evidence. Rest metres
  appear on their OWN rows (147, 95), never inside the total; Total Time
  (4:04.0 = 124.0+120, 6:14.9 = 254.9+120) sits in the header, exact.
- PRIMARY (the machine disagrees with the SUM of its own displayed rows):
  walk-2026-08-20's rows sum to 901 m against its stated 899, and
  walk-2026-08-23's rows sum to 138.8 s against its stated 2:18.7 — the
  walk record already wrote this down ("any oracle built on summing
  displayed rows carries that error"). This is why §1 reads the machine's
  own totals rather than re-summing ours, and why tier B never claims
  digit-identity.
- PRIMARY (the PM5 TRUNCATES pace, we round): the lab terminate capture's
  0x0039 avg pace reads 159.8 where 500·24.30/76.0 = 159.868, and
  walk-2026-08-20's screen prints 2:21.7 where the quotient is 141.768;
  `domain/format.ts` uses `Math.round`. Rendering the machine's own field
  (tier A) sidesteps this entirely.
- PRIMARY (wire, decoded from `walk-2026-08-24/phone-exit7-ring.json`):
  0x0039 offset 18-19 Avg Pace = 0x04D8 = 1240 → **124.0 s = 2:04.0/500m**,
  work-only and digit-identical to the screen; 0x003A carries Total Rest
  Distance = 242 m = 147+95 as its OWN field. The PM5 HAS an average split
  and computes it over work alone — we assert nothing on its behalf
  (the does-it-exist question, answered YES).
- PRIMARY (repo-established): Concept2's logbook stores work-only for a
  row. So "match the PM5" and "match the logbook" are ONE instruction for
  distance and pace, not two competing ones.
- PRIMARY (rower persona, this session): "work numbers are the piece, rest
  is overhead"; the fused pair "is useless for comparing to my Concept2
  logbook"; and the trust-breaker is not that rest metres exist but that
  they are hidden inside a number labelled DISTANCE.
- CORRECTION carried in (recurring failure 11, its 2026-08-21 form): the
  exit-7 walk's own record scored "DISTANCE hero 742 · TWD · MATCH" —
  against a WIRE field the PM5 never displays. Its screen said 500. A walk
  that photographs both screens can still compare the wrong quantity; this
  spec's own oracle is the SCREEN's number.

## §1 — The three heroes: the machine's own, where the machine spoke

**Tier A — MACHINE ROWS (the row carries `machine_work_seconds` /
`machine_work_meters`, i.e. saved since PR #190).**

- **DISTANCE** = `machine_work_meters`. **TIME** = `machine_work_seconds`.
- **AVG SPLIT** = the machine's OWN avg-pace field, not a quotient of
  ours. `parse.ts` already decodes `avgPaceSecondsPer500m`
  (0x0039 offsets 18-19, /10) — it is NOT currently stored, so this PR
  adds it to the `machine_summary` jsonb blob (additive key, no schema
  change, no migration: the blob is untyped by design, migration 0011's
  `series` precedent). Rendering the machine's own number makes the
  truncation question moot — the antagonist proved the PM5 TRUNCATES
  (159.8 where 500·24.30/76.0 = 159.868; 2:21.7 where the quotient is
  141.768) while `domain/format.ts` rounds, so ANY quotient of ours would
  differ from the screen about half the time.
- These three are the machine's, verbatim. The exit-7 row reads
  `500 m · 2:04 · 2:04.0` — the PM5's own Totals row, digit for digit.

**Tier B — OUR ROWS (no machine totals: pre-#190 rows, or a save that
raced the burst).**

- Same three quantities computed from the row's own work actuals
  (Σ work metres, Σ work seconds, and 500·Σt/Σd as ONE quotient over the
  summed pair, never a second derivation).
- These are ours and are **labelled as ours** — the block that says
  MACHINE CONFIRMED is absent on these rows already, and §2's line names
  the source. We never claim digit-identity for tier B: the antagonist
  measured the honest gap (the machine's own rows sum to 901 against its
  stated 899; per-row rounding), so the spec claims only "computed from
  the intervals this app recorded".

**Both tiers are ONE POPULATION — work only.** That is the defect this
spec exists to kill: whatever the source, the three numbers on a row
agree with each other and exclude rest.

**Exclusions, CORRECTED after the pass (finding 5).** The existing AVG
SPLIT exclusions are about what we may JUDGE, not about what happened —
`summaryModel.ts` says so in prose ("the meters/seconds genuinely
happened … only JUDGING it is what has no honest basis"), and the machine
counts those metres in its own totals. So in tier B, DISTANCE and TIME
KEEP a null-index or sub-threshold actual (machine semantics, unchanged
from today) and only AVG SPLIT excludes it — meaning tier B's AVG SPLIT
is NOT always exactly 500·TIME/DISTANCE, and §4's invariant is scoped to
runs without those shapes. Tier A is unaffected: the machine's own three
numbers are internally consistent by construction. **The legacy warm-up question, RULED (pass finding 6):** a legacy `wu`
actual stays counted in tier B's DISTANCE/TIME exactly as it is today
(machine semantics) and stays excluded from AVG SPLIT exactly as it is
today. `summaryModel.ts`'s KEEP comment exists precisely to avoid
"moving a number on a record already shown to the rower", and this spec
does not overrule it. Tier B's DISTANCE/TIME therefore do not change for
those rows at all; only their rest contribution moves to §2's line.

## §2 — The TOTAL line (the PM5's second tier)

Beneath the heroes, one line, always present on a monitor row:

    4:04 total · plus 242 m coasting in rest

- Wall-clock total = work seconds + rest seconds; rest metres = the
  session's rest distance. **Sources CORRECTED after the pass (finding 4)
  — the original chain read `run.program.intervals`, which exists only on
  a LIVE run and not on the stored row this screen renders, so every
  pre-#182 row would have silently printed a false wall-clock:**
  1. RC-1's stored `rest_seconds`/`rest_meters` (measured, PR #182) when
     present.
  2. Otherwise DERIVE from the row's own fused columns, which are
     non-null on EVERY legacy row: rest seconds = `time_seconds` −
     Σ`actualSeconds`, rest metres = `distance_meters` − Σ`actualMeters`.
     On the exit-7 shape that recovers 244−124 = 120 s and 742−500 =
     242 m exactly. This is the pass's own constructive fix; it needs no
     program and no new column.
  3. If the derivation cannot run (a row predating `actualMeters`,
     2026-08-08 — the difference would be the whole distance, not the
     rest), the line renders the total alone with NO rest clause, and
     never a `0 m` that implies a measurement. **Never a partial sum of
     per-interval rests** — `monitorRun.ts` forbids that by name (a
     missing interval's rest is indistinguishable from a genuine zero),
     and this spec does not overrule it.
- **Wording is the rower's own (design review, 2026-08-25): "coasting in
  rest", never "during rest"** — the earlier phrasing "makes it sound
  like I rowed it, and I didn't, the wheel did." The metres genuinely
  interest them ("I know the flywheel doesn't just stop"), so the clause
  stays; only its verb changes.
- No em-dashes; middle dot separator, house style.
- **PLACEMENT IS A REQUIREMENT, not a nicety (design review):** the line
  must be in the SAME GLANCE as the shrinking headline. Asked what would
  stop them filing a bug on 742→500, the rower said: the total line
  sitting right underneath, and TIME holding steady — "silence is what
  reads as data loss, not a smaller number with a receipt attached." If
  it were buried or scrolled off, "I'd absolutely file a bug." So: no
  scroll, no collapse, no lazy render; it is a LINE (never a hero) and it
  ships in the same viewport as the three numbers.
- **Tier disclosure: NOTHING is added (design review ruling).** No badge,
  no ESTIMATED marker on tier B. The rower's own answer: they do not care
  which tier a row is in as long as the number is right, and the MACHINE
  CONFIRMED block's ABSENCE is already the quiet tell — "I'll notice the
  block's gone before I notice a number's off by a second." Adding a
  marker would shout about a distinction they treat as background.

## §3 — What a rower sees change

- Rest-bearing rows report SMALLER distance and time than the previous
  build: the exit-7 row moves from `742 m / 4:04` to `500 m / 2:04` with
  `4:04 total · 242 m during rest` beneath. Nothing is lost; it moved one
  line down and gained a name.
- **The HISTORY LIST must not disagree with the detail (pass finding
  3).** The list endpoint's projection excludes `steps` by design, so a
  list row cannot recompute anything: today it prints the fused
  `distance_meters` while the detail would print work-only — 742 beside
  500 for the same session. This PR therefore adds `machine_work_meters`
  and `work_meters` to the list projection (both already exist as
  columns; RC-1 and #190 shipped them) and the list renders the SAME
  tier logic as the detail, falling back to the fused column only where
  neither exists — with that fallback stated in the code, not silent.
- **Old rows: DISTANCE/TIME do not move** (see §1's corrected exclusions
  and the warm-up ruling) — what changes for them is that their rest is
  named on §2's line instead of being folded into the headline, and their
  AVG SPLIT is unchanged. Only tier A rows (saved since #190) adopt the
  machine's own numbers, and only rows whose fused heroes included rest
  see the headline shrink. The release note says which rows change and
  that the total moved one line down.
- The MACHINE CONFIRMED · WORK ONLY block (PR #192) now AGREES with the
  heroes instead of contrasting with them: block 500, hero 500. Its
  caption ("Rest metres excluded. Everything else on this screen includes
  rest.") becomes FALSE and must change in this PR — the heroes no longer
  include rest; the TOTAL line and the chart do. New caption states that.

## §4 — Testing

- **The machine oracle, new and free (PM recommendation 5):** a replay
  test asserts our computed AVG SPLIT equals 0x0039's own Avg Pace field
  for the exit-7 capture (2:04.0 vs 2:04.0). The machine computes it
  independently — not a mirror of our sum.
- **The screen oracle:** the same replay asserts the trio equals the
  PM5's photographed Totals row (500 / 2:04 / 2:04.0), and the TOTAL line
  equals its header Total Time (4:04.0) and its rest rows' sum (147+95).
- Self-consistency, pinned as an invariant WITH the tolerance the pass
  measured (finding 7): the rower's own arithmetic on the PRINTED heroes
  cannot disagree with the printed AVG SPLIT **by more than the printed
  TIME's own rounding** — `fmtDuration` prints whole seconds, so the
  bound is 500·0.5/DISTANCE s per 500 m (0.5 s at 500 m, 0.28 s at
  900 m). The original spec's "cannot disagree" was false as written
  (124.4 s / 500 m prints 2:04 / 500 / 2:04.4; the quotient reads
  2:04.0). Scope: tier A always; tier B except runs carrying null-index
  or sub-threshold actuals, which §1's corrected exclusions keep in
  DISTANCE/TIME but out of AVG SPLIT.
- Legacy fixtures: a stored run WITH a `wu` actual (all three exclude it),
  a run with null-index actuals, a run with sub-threshold intervals, a
  run with no rest at all (TOTAL line renders without the rest clause).
- Realistic fixtures only — the walk's own numbers, never round invented
  ones (recurring failure 3, and #192's own capture lesson).
- `pnpm e2e` + `pnpm screenshots`; the captured log-detail row is already
  the exit-7 piece, so the capture will show 500/2:04/2:04.0 with the
  total line — verify by eye that the block and heroes now agree.

## The rower's two open complaints, both OUT of this PR and both queued

The design review's own words: these are "not answered here", and one of
them is "the same disease, untreated". Neither is in scope; both are in
ROADMAP so nobody rediscovers them at a gate.

1. **PARTIAL on an abandoned piece.** "I want it to say I stopped, not
   silently show a shorter piece that looks like I planned a 250 when I
   meant 500 and bailed." The block from PR #192 already renders on a
   terminated row (with the machine's own partial numbers), but nothing
   on the screen SAYS the piece was ended early. Queued as its own item —
   it is copy plus a stored-state read, and it deserves its own pass.
2. **The chart's rest-inclusive axes.** With the heroes now work-only,
   the chart beneath them still spans rest-inclusive time: "if I stare at
   that chart for ten seconds I'll be back to 'does this app know what
   happened or not'." This is the axis-quantity question already queued
   (series-truth §D, ROADMAP) — this spec makes it MORE visible, not
   less, and the ROADMAP item gains that sentence.

## Explicitly not in this PR

- No stored-shape change; no migration; no server change.
- The chart's axes stay as they are (still rest-inclusive) — the
  axis-quantity question remains queued; the new caption covers it
  honestly.
- No change to the interval ROWS' own numbers (each row is already its
  own interval's work).
- No C2 posting (RC-10), no reconciliation of the nine detail fields.

## Exit criteria

1. On the exit-7 row: DISTANCE 500, TIME 2:04, AVG SPLIT 2:04.0, and the
   line `4:04 total · 242 m during rest` — every number matching the
   photographed PM5 screen, checked in the committed capture by eye.
2. `500 · TIME / DISTANCE == AVG SPLIT` holds for every fixture, including
   legacy warm-up, null-index and sub-threshold shapes.
3. Our AVG SPLIT == 0x0039's Avg Pace on the exit-7 replay.
4. The MACHINE CONFIRMED caption no longer claims the totals include rest;
   the block and the heroes now show the same 500.
5. No `machine_*`-style population clause anywhere: the trio computes on
   every monitor row, old and new.

---

## Reconciliation (RC-5 Task 5, 2026-08-25) — what changed during implementation

This section is appended, not a rewrite; the text above is the original
spec as approved. Four things the implementation found that the spec as
written got wrong or overtook, each with its evidence.

1. **Exit criterion 2's invariant is FALSE for the legacy-warm-up shape,
   BY DESIGN — the invariant's own text should have scoped this out and
   didn't.** `summaryModel.test.ts`'s legacy-wu fixture ("a LEGACY stored
   run whose seed still says kind:'warmup'...") asserts
   `distanceMeters: 808`, `time: "5:00"` (300s), `avgSplit: "2:20.0"`
   (140.0s). `500 · TIME / DISTANCE = 500 × 300 / 808 = 185.64s = 3:05.6`,
   not 2:20.0 — off by 45.6 s/500 m, far outside any rounding tolerance.
   This is not a bug: §1's own warm-up ruling requires DISTANCE/TIME to
   stay the OLD fused numbers on a legacy `wu` row while AVG SPLIT stays
   the work-only quotient excluding that same warm-up interval — the two
   are now DELIBERATELY different populations for this one shape, so the
   identity criterion 2 states cannot hold for it. §4's own tolerance
   paragraph already scoped the invariant to "tier B except runs carrying
   null-index or sub-threshold actuals" but did not name legacy warm-up
   as a third, harder exclusion (not a tolerance-widening — a REAL
   population difference, not rounding). Criterion 2 as written is
   corrected to add: *excluding legacy-warm-up rows, where DISTANCE/TIME
   are the old fused totals by ruling and the identity does not hold at
   all, not even approximately.*
2. **Exit criterion 5's "no `machine_*`-style population clause anywhere"
   was SUPERSEDED by James's fork ruling, which this spec's own header
   already records but the exit criteria section was never updated to
   match.** The fork ruling ("James's fork ruling (2026-08-25)" above)
   explicitly chose the OPPOSITE of criterion 5: a permanent, named
   population split between tier A (rows carrying the machine's own
   totals) and tier B (rows that don't), because "match the PM5" and "one
   uniform rule on every row" cannot both hold. Criterion 5 is corrected
   to read: *the population split is deliberate, named on screen (the
   MACHINE CONFIRMED block's presence/absence), and accepted — not a
   defect to close. What criterion 5 actually protects (and does hold):
   no HIDDEN or unlabelled population clause — a rower is never shown a
   number that silently means something different from what it looks
   like.*
3. **Task 1 was a no-op — the spec's own premise that
   `avgPaceSecondsPer500m` was "NOT currently stored, so this PR adds it"
   (§1) was already false the day this spec was written.** PR #190
   (`3cb393d`, merged 2026-08-24, before this branch existed) had already
   added `MachineSummaryDetail.avgPaceSecondsPer500m`, the decode
   (`parse.ts`), the driver's field-by-field literal, and the burst-replay
   test with the identical keystone arithmetic this spec's §1 cites. Task
   1's report (`task-1-report.md`) verified this file:line by file:line
   and made no code change. The spec's factual claim about what needed
   building was stale by the time of dispatch (recurring failure #10);
   the FIELD itself and its consumption by Tasks 2-4 are unaffected — only
   the "this PR adds it" framing in §1 is corrected to "this field, added
   by PR #190, is what Task 2-4 render."
4. **The sub-threshold fixture §4 asked for: built on the STORED side,
   NOT newly built on the LIVE side — a real, pre-existing coverage gap,
   not a regression.** §4 lists "a run with sub-threshold intervals" among
   the required legacy fixtures. Task 3 built exactly this for the stored
   screen (`storedSummary.test.ts`, "TIER B2: a sub-threshold pm5 step...
   stays IN the DISTANCE/TIME sums but OUT of the AVG SPLIT quotient").
   The LIVE door's equivalent branch — `summaryModel.ts`'s
   `monitorAvgSplit`, `actual.elapsedSeconds < MIN_MEASURABLE_ELAPSED_SECONDS`
   — is explicitly UNCHANGED by this phase (its own doc comment: "AVG
   SPLIT is `monitorAvgSplit`, UNCHANGED by this task either way — it was
   already work-only ... before RC-5") and Task 2's own coverage table
   named that exact branch uncovered, both before and after its fix
   round, confirmed pre-existing by `git diff -U0` hunk ranges. The one
   sub-threshold test this file does carry
   (`summaryModel.test.ts`, "review finding 1's own worked example") runs
   the TIMER door (`timerAvgSplit`), not the monitor door — it does not
   exercise `monitorAvgSplit`'s own sub-threshold `continue` at all. No
   task in this plan added a monitor-door sub-threshold fixture; the gap
   pre-dates RC-5 and RC-5 did not close it. Flagged for whoever next
   touches `monitorAvgSplit`, not fixed here (out of a captures/ROADMAP
   task's own scope).
