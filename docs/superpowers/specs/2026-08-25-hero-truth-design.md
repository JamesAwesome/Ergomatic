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
pass on this spec; PM final gate on the PR. Ships alone.

## Evidence base

- PRIMARY (three photographed PM5 View Detail screens): the Totals row is
  one population and reconciles by 500·t/d ON ITS OWN ROW — walk-2026-08-24
  `2:04.0 / 500 / 2:04.0 / 26` (124·500/500 = 124.0 ✓) and walk-2026-08-20
  `4:14.9 / 899 / 2:21.7` (254.9·500/899 = 2:21.8, per-row rounding).
  Rest metres appear on their OWN rows (147, 95), never inside the total.
  Total Time (4:04.0, 6:14.9) sits in the header, not the totals row.
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

## §1 — The three heroes (one population)

- **DISTANCE** = Σ work metres over measured work actuals.
- **TIME** = Σ work seconds over the same actuals.
- **AVG SPLIT** = 500 · TIME / DISTANCE — by construction, not by a second
  derivation, so the arithmetic a rower does in their head cannot disagree
  with the number printed.

The exit-7 row becomes `500 m · 2:04 · 2:04.0` — digit-identical to the
machine's own Totals row.

**Exclusions stay exactly as AVG SPLIT already has them** (they are the
population's definition, now applied to all three): a null-index actual
(unattributable boundary), an actual below
`MIN_MEASURABLE_ELAPSED_SECONDS`, and — legacy only — a stored run's
warm-up interval. **The legacy warm-up question, answered explicitly:**
Phase WU deleted warm-ups on 2026-08-22 but stored runs persist; today
DISTANCE/TIME include a legacy `wu` actual while AVG SPLIT excludes it.
Under one population it must be excluded from ALL THREE, and the spec
states the consequence: a legacy warm-up row's DISTANCE/TIME will DROP by
that interval's own metres and seconds. That is the same direction as
every other rest-bearing row and needs no separate clause.

## §2 — The TOTAL line (the PM5's second tier)

Beneath the heroes, one line, always present on a monitor row:

    4:04 total · 242 m during rest

- Wall-clock total = work seconds + rest seconds; rest metres = the
  session's rest distance. Sources in priority order: RC-1's stored
  `restSeconds`/`restMeters` (measured, PR #182) when present, else the
  PROGRAMMED rest for seconds (which reproduced the PM5's own Total Time
  EXACTLY on both rest-bearing walks: 6:14.9 and 4:04.0) and the actuals'
  own rest metres where recorded. When neither exists (a row with no rest
  at all), the line renders `4:04 total` alone with no rest clause — never
  a `0 m` that implies a measurement.
- No em-dashes; middle dot separator, house style.
- It is a LINE, not a hero: it must not compete visually, and it must be
  visible without scrolling (the tester's first reaction to smaller
  headline numbers is answered by the line directly beneath them).

## §3 — What a rower sees change

- Rest-bearing rows report SMALLER distance and time than the previous
  build: the exit-7 row moves from `742 m / 4:04` to `500 m / 2:04` with
  `4:04 total · 242 m during rest` beneath. Nothing is lost; it moved one
  line down and gained a name.
- **Old rows change too, and that is deliberate** — this is a
  presentation change over stored components, not a stored-shape change.
  Every monitor row can compute the trio from its 0x0037 actuals, which
  predate the `machine_*` columns entirely, so there is NO
  "rows after build X" population clause (unlike #190's fields). The
  release note says plainly that rest-bearing rows now read work-only with
  the total beneath.
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
- Self-consistency, pinned as an invariant: for any run, printed AVG SPLIT
  == 500·TIME/DISTANCE recomputed from the two printed heroes (the
  arithmetic the rower does).
- Legacy fixtures: a stored run WITH a `wu` actual (all three exclude it),
  a run with null-index actuals, a run with sub-threshold intervals, a
  run with no rest at all (TOTAL line renders without the rest clause).
- Realistic fixtures only — the walk's own numbers, never round invented
  ones (recurring failure 3, and #192's own capture lesson).
- `pnpm e2e` + `pnpm screenshots`; the captured log-detail row is already
  the exit-7 piece, so the capture will show 500/2:04/2:04.0 with the
  total line — verify by eye that the block and heroes now agree.

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
