# The series stops lying on distance intervals — design

**What and why.** James's exit-7 row (2×250m r60) drew a "weird graph"
because the stored series had silently LOST its second interval and
trailing rest: on distance-kind intervals with rests, the PM5's
ephemeral boundary state 9 emits one frame whose `intervalIndex` lies
forward while the elapsed pair still belongs to the finishing interval.
The driver guards its own accumulator against exactly this (the ring's
`divergence` entry proves the guard fired) but does not mirror the
correction onto the `frame.intervalIndex` it emits — a hole
`driver.ts`'s own comment predicted, waiting for a capture. The series
recorder keys on that emitted index with no reset guard, latches
forward, inflates its clock by the finished interval's register, and its
backward-bucket monotonicity guard then discards every later sample
without a trace. 56.1 seconds of real rowing (the FASTER interval)
never reached the stored series. Every connected distance-with-rest row
saved to date carries this; the loss is ongoing until this ships. Fix is
PROSPECTIVE ONLY — the dropped samples were never constructed, so no
migration can repair old rows.

TRIAD twice over: `frame.intervalIndex` is a number several consumers
key on (driver change), and `Sample.t`/`Sample.d` are stored meanings
(recorder change). Full antagonist pass required; PM final gate on the
PR. Ships ALONE, before the summary-record wave's PR 2 (James's
sequencing call, 2026-08-25: data loss first, display second).

## Evidence base

- PRIMARY (production ring, exit-7 walk):
  `docs/monitor/sessions/walk-2026-08-24/phone-exit7-ring.json` seq
  27/28 — `workoutState=9` at the boundary; the driver's open-on-reset
  guard refusing key 1 and merging into key 0.
- PRIMARY (diagnosis probe, 2026-08-25): the ring's numbers synthesized
  through the REAL `createSeriesRecorder` → `buildTrace` → `chooseTicks`
  reproduce the screenshot digit for digit with the poison tick present
  (129 samples, t→196s, one displaced band, ticks 0:00/0:50/1:40/2:30,
  fastest 2:15.8) and produce the correct chart without it (230 samples,
  t→230s, two bands, fastest 1:52.2, final d=742.7m == the driver's own
  accumulator at ring seq 49 — an independent cross-check).
- PRIMARY (code): `driver.ts`'s mirror is gated on
  `workoutState === WORKOUTSTATE_INTERVALWORKTIMETOREST` (8) alone; its
  own comment names state 9 as "the symmetric, plausible sibling case —
  NOT gated here, since no capture ... evidences it either way ... the
  same one-line extension if a future walk shows it". This walk is that
  capture.
- PRIMARY (replay): both committed rest-bearing captures run CLEAN
  through driver→recorder (`session-2-wu-4unequal`: 419 samples, all 3
  rests placed, d=1598.8 vs TWD 1599) — because NEITHER is a
  distance-kind interval WITH a rest. The corpus hole is why three
  gates walked past this (recurring failure 3).
- Corollary evidence for the docs fix: the healthy probe run reaches
  t=230s on a 124s-work piece — `traceModel.ts`'s header claim that `t`
  "excludes rest duration" is FALSE when the wire advances elapsed
  through a rest; `t` is the sum of per-interval FINAL elapsed readings,
  rest included whenever the flywheel kept moving.

## The fixes (one PR, five parts)

**A — driver: the extension its comment reserved (three lines, two
files — the antagonist corrected "one-line": ordinal 9 exists only
inside `WORKOUTSTATE_TO_STATE`, so
`WORKOUTSTATE_INTERVALWORKDISTANCETOREST = 9` must first be exported
from `domain/monitor/pm5/parse.ts`).** The refused-open mirror onto
`emittedIntervalIndex` fires for state 9 exactly as it does for 8.
Nothing else about the gate changes; the existing regressions that
killed the unconditional mirror use `WORKOUTSTATE_INTERVALWORKTIME` and
stay green untouched (verified by the pass). No honest-data false
positive is constructible: a genuine distance interval starts in state
5, and at an r0 boundary the pair has already reset so the guard never
refuses.

**B′ — the driver emits the key it actually used; the recorder's own
derivation is DELETED, not supplemented (replaces the original B, which
the antagonist's full pass BLOCKED).** The original B ported the
driver's open-on-reset predicate into the recorder — but the
discriminating byte (`status.workoutState` 8/9) does not survive to the
recorder's seam: on `MonitorFrame`'s six-valued `state` +
`rawIntervalCount`, the poison tick and an honest post-gap first tick
are IDENTICAL, so the ported guard fires on the driver's own disclosed
bounded edge (hand-executed red on `driver.test.ts`'s reconnect-spanning
and walk-signature regressions) and the refusal is permanent — verbatim
the "short by the whole skipped interval, forever" failure the register
map exists to eliminate. Instead: `MonitorFrame` gains an additive
`attributedIntervalIndex` (the same precedent `rawIntervalCount` set) —
the key the driver's OWN register logic resolved for this frame, after
its open-on-reset guard. `seriesRecorder` keys its registers on that
field and its `currentKey`-raising comparison against `intervalIndex`
is removed (trace-truth's own ruling: delete the heuristic, do not
supplement it). One deriver in the system; the recorder inherits every
current and future guard the driver has — INCLUDING the driver's own
disclosed bounded edge (Task 3 review, Important 1, recorded as the
ACCEPTED COST it always was): on a refused open outside states 8/9
(e.g. the committed reconnect-spanning regression, where a post-gap
first tick lands at elapsed == the register), the emitted
`intervalIndex` still rises while `attributedIntervalIndex` stays on
the open key, and the series now max-merges that interval into the
prior key exactly as the accumulator does — short by the gap, the
same on both, visible against the machine's own totals. That is the
one-deriver trade James accepted (consistent-with-the-accumulator over
independently-diverging), pinned by a recorder test on that edge, and
never described as "unreachable". Research pass
(2026-08-25, James's durability question): DURABLE-WITH-CONDITIONS —
Concept2's own ecosystem is single-writer for interval identity
(SECONDARY, logbook API stores device-authored pre-segmented
intervals); FIT consumers compute membership only against
device-written boundaries, never invented heuristics (SECONDARY); DDIA:
one authoritative deriver for derived data (SECONDARY); this repo is
3-for-3 on the failure class (this defect, LL's boundary-fold
under-count, trace-truth's diagnosis). Conditions bound: no copy-pasted
guard logic anywhere (B′ has none by construction); failures loud (C′);
and the EXTERNAL machine-comparison oracles stay untouched — a shared
wrong key makes series+accumulator consistent-but-wrong, which only the
differently-sourced PM5 comparisons can catch, so the fixture asserts
the ring's numbers, never our own derivations.

**C′ — the drop becomes loud (corrected: the original predicate counted
normal decimation).** `bucket <= lastEmittedBucket` IS the 1Hz
decimation — 80-90% of healthy iOS frames take that return (measured
2.23 frames/s desktop, 90-180ms iOS; notes §"frame cadence") — so
counting it is an alarm wired to a hot path. The defect signal is the
STRICTLY backward case — REFINED at Task 3 (the implementer measured
the strict-`<` predicate firing 1 and 18 times on the two committed
CLEAN captures: the ~450-540ms 0x0033-lags-0x0031 boundary skew makes a
lagging tick's per-tick clock read backward while the register absorbs
it and the series is byte-identical — an alarm on normal traffic, the
same class the pass killed once already). The counted signal is a
backward frame whose bucket the series NEVER emitted and never will —
"a reading for a second the chart will never have", i.e. actual data
loss: `bucket < lastEmittedBucket AND bucket not in the emitted set`.
The routine lag re-visits already-emitted buckets and counts zero; the
exit-7 poison shape carries ~57 never-emitted buckets and counts loud.
(The emitted-bucket set is bounded by session length; a plain Set.) Plumbing corrected against the code, not
the imagined precedent: `truncated` produces NO ring entry anywhere and
IS server-persisted, so there is no symmetry to inherit. C′ is
client-side only: the recorder's result exposes the count; the HOOK
(the recorder's actual owner — the driver never sees it) writes one
ring entry when nonzero, at `closeRecord` time (upstream of the
teardown stash, so it reaches the walk's readout). Nothing is
persisted to the server and no `SeriesData` field is added (the route's
reconstruction would silently drop it — say so in a comment). Name it
nothing like "dropped" (`seriesDropped` already means the localStorage
quota retry): `backwardBucketCount`.

**D — docs on the same surface, no behaviour change (widened to BOTH
axes per the pass).** `traceModel.ts`'s header is corrected for `t` AND
`d`: neither is a work-only quantity — each is the sum of per-interval
final readings and is ROWER-DEPENDENT (a frozen rest contributes
nothing; an advancing rest contributes all of itself — key 0's register
read 129.5s for a 67.91s work interval, and the series' final d of
742.7m stands against 0x0039's work-only 500m). Say "conditional on
rower behaviour during rests", not "includes rest" — the second phrasing
still reads as a unit. The `GAP_BREAK_SECONDS` conclusion stands (a rest
still never produces a `t` gap); only its stated reason changes. The
axis-quantity question (should the chart use a true work-only clock?)
is explicitly OUT of this PR and queued in ROADMAP — changing what the
axis means is its own number-meaning decision.

**E — the regression fixture is synthetic, and says so.** No replayable
capture of this defect exists (production build, no instrument — only
the ring). The failing-first test synthesizes the ring's own frame
sequence (interval 1 to 67.91s, the state-9 poison tick at 68.02s,
advancing rest to 129.5s, interval 2's reset to 0 then 56.1s, trailing
rest), replays it through the REAL driver → recorder, and asserts ONLY
ring-sourced numbers (the pass killed the "fastest 1:52.2 present"
criterion — pace comes from `currentSplit`, which the fixture invents;
asserting it tests the fixture): sample count ~230, `t` reaching
230.5s, two rest runs, final d within 1m of 742.7, and
`backwardBucketCount === 0`. The structural fact the pace assertion
proxied for is asserted directly: interval 2's samples exist. The
fixture includes BOTH state-9 ticks the ring shows (67.91 before the
count increments, 68.02 after — the refusal throttle makes later
refusals silent, so a one-tick fixture models a narrower window than
the hardware). The test's comment states it is synthesized FROM the
production ring and that a lab capture of a 2×Nm rNN piece is owed
(ROADMAP walk item rides this PR). Both committed clean captures stay
pinned as replay regressions — as NO-REGRESSION pins only, not as
safety evidence (neither contains the risky shape; the pass's
oracle-blindness finding). Additionally, B′'s branch is instrumented
during the pinned replays so a green result is distinguishable from
"the new path never ran".

## Explicitly not in this PR

- No repair of already-saved rows — POSSIBLE IN PART but DECLINED
  (James, 2026-08-25). The pass corrected the spec's original
  "impossible": the band DISPLACEMENT is arithmetically repairable
  (the inflation equals the finishing interval's stored
  `actualSeconds`, 67.9s, cross-confirmed by 0x0039's 124s total); the
  missing samples are not, and inventing them from interval averages is
  refused. Population is roughly one row; repair declined.
- No axis-quantity change (D queues it).
- No display work (the summary-record wave's PR 2 follows separately).
- No change to the driver's own accumulator/register logic — the guard
  that already works is not touched — only mirrored (A) and its resolved
  key EMITTED for consumers (B′; nothing is ported, the original port was
  blocked).

## Exit criteria

1. The synthetic exit-7-shaped replay produces a contiguous series with
   both intervals, both rests, ~230 samples, t reaching 230.5s, and
   final d within 1m of 742.7 — failing before A+B′, passing after.
2. Both committed captures replay byte-identically to their pre-fix
   series — a NO-REGRESSION pin, not safety evidence (neither contains
   the risky shape) — with B′'s branch instrumented so green is
   distinguishable from never-ran.
3. A forced backward-and-never-emitted sequence yields a nonzero
   `backwardBucketCount` that reaches the ring via the hook at
   `closeRecord`; ZERO on the clean replays (including their routine
   boundary-lag ticks, which re-visit emitted buckets) AND on the
   healthy exit-7 counterfactual; the poisoned exit-7 counterfactual
   (recorder fed the pre-fix attribution) counts ~57.
4. `traceModel.ts`'s header states the conditional-on-rower truth for
   BOTH `t` and `d`; ROADMAP carries the axis-quantity question and the
   2×Nm rNN capture walk item, and corrects the stale "rides the next
   log-surface PR" line (the defect was wire-attribution, not render).
5. `seriesRecorder` contains NO derivation of interval attribution —
   grep for `intervalIndex` in it returns only the consumed
   `attributedIntervalIndex` field (delete, don't supplement).
