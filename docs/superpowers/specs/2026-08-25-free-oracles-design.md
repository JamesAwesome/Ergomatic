# The oracles we already had — design (RC-9, parts a/c/d)

**What and why.** Twice this phase we have compared a number against
something that turned out to be a mirror: PR #123 celebrated our
accumulator agreeing with the PM5's Total Work Distance (both work +
rest coast, while Concept2's logbook stores work only), and the exit-7
walk scored "DISTANCE 742 · MATCH" against a wire field the PM5 never
displays. Meanwhile the machine has been sending us numbers we decode
and throw away. This spec wires up the ones that are genuinely
independent, retires the one that is a mirror, and corrects the wire
claim we got wrong.

James's scope ruling (2026-08-25, after the pre-spec oracle-soundness
pass): **(a) + (c) + (d) now, (b) queued.**

TRIAD: (c) changes what a documented wire field MEANS and retires a
verdict; (d) adds a parser whose output gates a diagnostic. Full
antagonist pass DONE (pre-spec, the pass this spec is written from);
PM final gate on the PR.

## Evidence base

Everything below was decoded byte-level from the committed captures by
the pre-spec pass; every claim is reproducible from
`docs/monitor/sessions/`.

- PRIMARY (all seven recordings): 0x0032 offset 9 `averageSplit` is
  **work-only, cumulative from session start**. It tracks
  `500·ΣT_work/ΣD_work` to a median 0.07-0.20 s (n = 252/770/248/467/
  85/679/135); it **freezes** through rest (session-2 seq 600 → 774:
  136.13 unchanged across 9.6 s and 30.6 m of coasting); it does not
  reset at boundaries (seq 594 reads 135.85 where interval-2-alone
  would be 130.39); it reads 0.00 on 18 interval-reset frames in
  session-2 alone (seq 244/249/252/255/258, 782, 1669/1672,
  2610/2613/2616/2619/2622/2625/2628/2631/2634/2637 — **CORRECTED,
  fix round 1: not the "single frame" this line originally claimed**,
  re-decoded directly off `parse.ts` against the committed capture,
  clustered near boundaries, up to 8 consecutive ticks at one
  transition) and must be ignored wherever it recurs, not merely once.
- PRIMARY (C2 logbook API): `distance` and `time` are work-only for
  interval workouts, rest stored separately. So (a) compares two
  independent computers of the quantity the AUTHORITY stores — the
  opposite of #123.
- PRIMARY (BLE Definition rev 1.30 p.14): 0x0032 offsets 9-10 are
  `CSAFE_PM_GET_TOTAL_AVG_500MPACE` — the TOTAL member of C2's
  SPLIT/TOTAL pair, whole-workout by the document. **Neither C2
  document states rest inclusion, reset, or definedness — the captures
  are the only source for those, and they answer cleanly.**
- PRIMARY (the machine disagrees with itself): on the only capture
  carrying both, 0x0039's Avg Pace reads 138.7 while 0x0032 reads
  138.44 at the last work sample and 138.23 after the terminal
  transition. A 0.47 s spread; the terminal step recurs on session-2
  (129.78 → 128.76) and is UNEXPLAINED by any population change the
  pass could construct.
- PRIMARY (the falsification): 0x0031's Total Work Distance does NOT
  report the goal on a distance interval. `session-1-keystone-2x250r0`
  reads TWD **0** through the whole of interval 1 while 250 m are
  genuinely rowed, 250 through interval 2, 500 at WORKOUTEND; the
  pyramid ticks it one-per-metre through the rest (301 → 332). It is an
  odometer of ROWED metres, work plus rest coast, lagging the current
  interval. The two samples our claim rested on are from
  `pm5-session4b`'s ring seq 3 and 14 — BEFORE `program()`'s writes at
  seq 7+, i.e. a stale pre-arm monitor state observed twice.
- PRIMARY (0x003A offsets 12-14, Total Rest Distance, 1 m/lsb, BLE rev
  1.30 p.22): exit-7 walk seq 63 decodes **242 m** against our own
  measured 242.7 m of rest coast; walk-2026-08-23's r0 keystone decodes
  **0**. Sanity-checked against the rest of that frame's layout on both
  files.
- NOT FOUND, recorded as a result: no C2 statement on rest inclusion or
  reset for any of these fields; c2forum is Cloudflare-blocked to both
  WebFetch and curl.

## §1 — (a) The live average-pace verdict

A diagnostic verdict, ring-only, no stored field, no UI.

- **Compare**: the last WORK-state 0x0032 `averageSplit` against
  `monitorAvgSplit`'s quotient over the recorded actuals.
- **NEVER against the tier-A hero.** Post-RC-5 that hero IS 0x0039's
  own field, so comparing it to 0x0032 is machine-vs-machine — and we
  know they differ by 0.47 s. The comparison is against OUR quotient,
  which exists on every run.
- **Sampling instant matters and is worth ~1 s**: sample the last
  work-state 0x0032, never `raw.averageSplit` at the terminal frame
  (the unexplained terminal step lives there).
- **Suppress** — and say why in the entry — when any actual was
  excluded from our quotient (`index === null`, elapsed below
  `MIN_MEASURABLE_ELAPSED_SECONDS`, legacy warm-up), or when the run
  carries a summary-filled actual (the machine counts what it rowed;
  we exclude by policy, so those runs legitimately differ).
- **Band 1.0 s.** The measured disagreement is 0.07-0.20 s median; 1.0 s
  clears the observed noise plus the terminal step and is far inside a
  lost-interval signal. State both numbers where the band is defined.
- **SCALE TRAP, in the code and in the test:** 0x0032's pace is
  **0.01 s/lsb**; 0x0039's is **0.1 s/lsb**. A comparison across the two
  is one keystroke from being 10× wrong.

**The fake must be fixed in the same PR.** `fake.ts` currently sets
`averageSplit: e.currentSplit` — a world where no cumulative work-only
average exists, which would make every fake-driven test of this verdict
vacuous. Model it as cumulative work-only, or drive the test from a
capture and say so. (Third sighting of this shape; it is now a standing
check.)

## §2 — (c) Retire the TWD verdict, correct the record

`recordTwdVerdict` compares our accumulator against Total Work Distance.
Both sides are work + rest coast, so a green verdict certifies nothing
about the stored row — and RC-5 has just moved every displayed number
off that quantity. **Retire it** rather than lift its distance-interval
suppression (lifting produces PASS everywhere: 0.2-1.5 m deltas across
five captures, all mirrors).

Corrections that ride the same PR, each citing its capture:

- `driver.ts`'s doc comment claiming TWD "reports the GOAL there, not
  the distance actually rowed (confirmed PRIMARY)" — FALSE; the cited
  samples predate our own `program()` writes.
- `pm5-interface-notes.md` item 25: "a BOUNDARY ACCUMULATOR of INTENDED
  work, not an odometer" is wrong; the histogram claim "every one of
  those 41 ticks reads workoutState 3" is wrong (36 ws3, 3 ws5, 1 ws9,
  1 ws10 — and the five exceptions are where the mechanism is); and the
  sample placed "mid the FIRST 250" is 12 s into interval TWO and is a
  1.6 s transient that reverts (step-2 seq 822 → 831; pyramid seq 3255
  → 3273). Record TWD's non-monotonic pre-commit overshoot with those
  seq citations.

Retiring the verdict removes its call site and its suppression
predicate; `continuity.ts` references the predicate by name in comments
and must be reconciled, not left dangling.

## §3 — (d) The rest-distance oracle nobody had

- Add a 0x003A parser for **Total Rest Distance (offsets 12-14, 1 m/lsb)**
  only — not the whole frame. `parse.ts`'s existing I5 ruling explains
  why 0x003A has no parser; this narrows that deliberately, and the
  ruling's own text must be updated rather than contradicted silently.
- Verdict: compare it against `monitorRest`'s resolved rest metres
  (RC-1's stored pair where present). Ring-only, same shape as (a).
- **`Interval Rest Time` (offsets 15-16) reads 0 on both captures
  including the r60 walk.** Decode it and REPORT it; never gate on it.
  Two observations, both zero — either a firmware quirk or it means the
  programmed value, and we do not know which.
- This checks the population RC-1 just started storing and RC-10 must
  POST, and nothing external checks it today.

## §4 — Testing

- (a): capture-driven. Replay a rest-bearing recording and assert the
  verdict's own numbers against the pass's measured medians; assert the
  suppression fires on a run with an excluded actual; assert the scale
  (0.01 vs 0.1) with a fixture that would be 10× wrong under the other.
- (c): assert the verdict is GONE (no call site, no entry) and that
  nothing references the removed predicate; the interface-notes
  corrections are prose, checked by review.
- (d): decode the two committed frames in the test as literals with the
  arithmetic in a comment (exit-7 seq 63 → 242; keystone seq 517 → 0)
  and assert the verdict agrees with `monitorRest` on the first and
  declines-or-passes on the second.
- Fixtures: real captures only, never invented round numbers. The fake's
  `averageSplit` fix is itself a test-integrity fix, not a feature.

## Explicitly not in this PR

- **(b), 0x0039 vs Σ recordedActuals — QUEUED, with its reason.** It is
  oracle-blind today: of eight committed recordings exactly one carries
  a 0x0039, and it is the only one with ZERO rest frames, so a
  rest-inclusion bug would be silent. It is also tautological on any run
  where `deriveFinalIntervalFromSummary` fired (that path builds the
  actual FROM 0x0039). It needs a rest-bearing capture that survives to
  0x0039 — the walk item already owed.
- No UI, no stored field, no release-note clause: every verdict here is
  a ring entry for a walk to read.

## Exit criteria

1. On a rest-bearing capture, (a)'s verdict fires with a disagreement
   inside the measured band, and suppresses on a run with an excluded
   actual — both asserted from the capture's own numbers.
2. `recordTwdVerdict` is gone; no dangling references; `continuity.ts`'s
   comments reconciled.
3. The three false claims (driver comment, item 25's premise, item 25's
   histogram and sample attribution) are corrected with capture
   citations.
4. (d)'s verdict agrees with `monitorRest` at 242 m on the exit-7
   capture and handles the r0 zero without a false alarm; Interval Rest
   Time is reported, never gated on.
5. The fake no longer fabricates `averageSplit` from `currentSplit`.
