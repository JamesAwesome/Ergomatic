# The trace tells the truth about the row (Phase LL, spec 1)

## What and why

The trace we started drawing four days ago is wrong in two ways at once, and
neither is visible on the screen it is drawn on.

It **under-reports**: when a gap makes the first frame after an interval
boundary arrive late, the recorder refuses to fold the completed interval in,
and from that moment every sample is permanently short by that interval's whole
time and distance. Worse than short — the emitted-bucket guard then suppresses
samples until the clock climbs back, so an entire interval **vanishes from the
chart**, and on a descending ladder every later interval shorter than the
missed one goes with it.

It **draws rests as rowing**: the recorder was built on "elapsed and distance
freeze during a rest", which is false whenever the rower keeps the flywheel
turning. On James's 2026-08-20 piece that is ~103 s and ~245 m — about 28% of
the trace clock and 21% of its distance — drawn as one unbroken line.

And nothing in the frame can contradict either, because **the chart has no
horizontal axis at all**: no time labels, no ticks, and a domain stretched to
the full width whatever it contains. A trace missing an entire interval renders
at the identical width with the identical shape.

This spec fixes the numbers at their source, makes rests visible as rests, and
gives the chart the axis that lets anyone — a rower, a reviewer, a future
gate — check it against the `TIME` hero sitting two inches above it.

**Weight: TRIAD** (a number's meaning AND a stored shape). Full antagonist pass
on this spec: DONE, 2026-08-20 — its findings are §8. PM final-PR gate on each
PR.

## §1 The accumulator: delete the heuristic, do not supplement it

**Today:** `seriesRecorder.ts` detects a boundary by watching `elapsedSeconds`
jump backwards, then decides whether to fold using `isGenuineBoundary(lastElapsed,
postResetDistance)` against `MIN_COMPLETED_INTERVAL_SECONDS = 1.0` and
`MAX_BOUNDARY_RESET_METERS = 3.0`.

**Replace it with a per-key MAX-MERGE register map**, keyed on the interval
index the machine itself reports, exactly as `driver.ts`'s own session register
map already does (`driver.ts:1072` — "Maximum, not last-write-wins, for two
independently-found reasons", running on hardware since CR2).

- `registers: Map<key, {seconds, meters}>`, each updated with
  `max(existing, incoming)`.
- A sample's cumulative values are `Σ registers[k < currentKey]` plus the
  current frame's own elapsed/distance.
- **`isGenuineBoundary`, `MIN_COMPLETED_INTERVAL_SECONDS`,
  `MAX_BOUNDARY_RESET_METERS` and `RESET_EPSILON_SECONDS` are DELETED**, not
  kept alongside. Edge detection goes away entirely; the design becomes
  level-triggered.

**Why deletion rather than belt-and-braces.** The heuristic is not merely
insufficient, it is independently wrong in three further ways the antagonist
measured (§8: B3, B4, B5). Keeping it as a fallback preserves all three and
reduces this fix to "the bug fires less often" — which is the PM gate's own
stated flip condition for preferring a marker instead.

**Measured behaviour of the replacement** (production recorder, committed
corpus, §8): digit-identical to today on a clean capture (`step-3`: 243
samples — corrected from an earlier 242 head-count, verified two independent
ways during Task 1's review: the real driver replay and the pre-fix shipped
recorder's own `replayFrames`-based oracle test both independently produced
243 for this exact capture — `t=2422`, `d=8072`); short by **zero** under
injected gaps at both
boundaries at every width from 4 to 60 dropped frames, where the shipped fold
goes permanently short by 59.7 s/159.3 m and 60.0 s/213.7 m.

## §2 The null-key policy — its own section, never an implementation detail

`MonitorFrame.intervalIndex` is `null` while armed, idle, finished and
terminated, **and on a divergence frame**: `driver.ts`'s `activeKey` falls back
to `max(seen)` but `emittedIntervalIndex` is deliberately left null, because the
guard's refusal is not mirrored onto the emitted field.

**Rule: the recorder carries the last non-null key forward.** A null index never
starts a new register and never resets accumulation; it continues the key most
recently seen. This matches what the driver does for its own map.

**Two cases the rule above does not cover on its own, both stated rather than
left to an implementer:**

- **Before any non-null key has EVER been seen** (a run whose frames start
  null, which is the state of 5 of our 6 committed recordings — §6): the
  recorder accumulates under a synthetic key `0`. It never blocks recording
  and never waits for a key, so a session on a monitor that never reports an
  index still produces a trace; it simply has one register. This degrades to
  single-interval behaviour, which is correct for the only thing it can know.
- **A key that moves BACKWARD** (a divergence, a re-arm, a machine-side
  renumber): **the recorder's current key is monotonic non-decreasing.** It
  takes `max(seenKeys)`, the same floor `driver.ts`'s `activeKey` uses. Without
  this, `Σ registers[k < currentKey]` shrinks when the key dips and the
  cumulative clock would travel backwards — the bucket guard would suppress the
  samples rather than emit wrong ones, so the symptom would be silent data loss
  rather than a wrong number, which is exactly the failure class this spec
  exists to end.

**This section exists because it is where the fix could quietly become
worthless.** "Fall back to the old heuristic on a null key" is FORBIDDEN by this
spec: it reintroduces every defect §1 deletes, and it does so precisely in the
disrupted conditions the fix exists for.

**KEY ON THE EMITTED INDEX, NOT ON `toProgramIndex`'s RAW OUTPUT.**
`frame.intervalIndex` carries `emittedIntervalIndex`, which the stale-count rest
clamp can RAISE (`driver.ts:1970-1987`) — and that clamp fired live in the
2026-08-20 walk (`ring.json`, seq 39). The antagonist's first steelman keyed on
the raw normaliser output and the stale-count dip poisoned a register
permanently, reading `t=3024` against a true `2422`. See §6 for the harness rule
that keeps a test from reproducing that broken version.

## §3 Rests become part of the stored shape

**Ruling (James, 2026-08-20): rests are DRAWN, but MARKED.** Not hidden, not
silently folded in as rowing.

**`Sample` gains a rest marker.** The recorder knows the frame's state; the
renderer cannot recover it later.

```ts
export interface Sample {
  readonly t: number;
  readonly d: number;
  readonly p: number;
  readonly spm: number;
  readonly hr?: number;
  /** Present and `true` only for a sample recorded while the machine was
   *  resting. ABSENT means work — the same absent-not-false idiom `hr`
   *  already uses, so a work sample costs zero extra bytes. */
  readonly r?: true;
}
```

**Why it cannot be derived at render time.** Spec 3 killed interval boundary
marks for exactly this reason: the trace begins inside the warm-up, and a stored
log's steps never carry a warm-up row, so anything positional derived from the
steps lands displaced by an entire warm-up — silently, and undetectably, because
the discrepancy IS the warm-up. Rest spans have the same defect. The recorder is
the only place that knows.

**Cost.** `r` is absent on work samples. On the 2026-08-20 piece, ~28% of
samples would carry it: ~9 bytes each on a ~50 byte sample, so under 3% growth
on a rest-heavy session and 0% on a rest-free one. It does not move the storage
ceiling (`SERIES_SAMPLE_CAP = 14400`) or the sacrifice ordering.

**Logbook compatibility claim CORRECTED (round 4, C3 — this sentence was
backwards).** The C2-logbook-shaped keys (`t`, `d`, `p`, `spm`, `hr`) are
untouched, and `r` is additive — that part holds. But the ORIGINAL sentence
here said a future export "drops `r` by selecting the five it needs", which
gets the shape right and the CONSEQUENCE wrong. Checked against Concept2's own
developer docs: their stroke object is genuinely `{t,d,p,spm,hr}` in our
units, but "for interval workouts, time and distance start again at 0 for
each interval" — ours are cumulative across the WHOLE session by design (§1).
An export that selects the five and drops `r` uploads inflated time and
distance for every interval after the first, silently. **`r` is not the field
to drop — for a rest-bearing workout it is the ONLY per-sample evidence of
where the intervals are** (interval boundary marks were cut from rendering,
§4, for the identical reason stated above: the trace has no other honest
source of interval structure). A future exporter must SPLIT the session on
`r`'s own rest runs and RE-BASE each resulting segment's `t`/`d` back to zero
before uploading, never simply select-and-drop it. (A workout whose work
intervals run back-to-back with no rest between them has no sample-level
boundary signal at all, `r`-based or otherwise — a real limit on what any
export can reconstruct, out of this spec's scope to solve.)

**Rendering.** `TraceChart` tints rest spans distinctly from work. The line is
CONTINUOUS across a rest — a rest is not a gap and must not be drawn as one,
since `GAP_BREAK_SECONDS` exists to show missing data and a rest is data.
Contrast computed and reported as a number, per the standing hard requirement.
**The pace value during a rest is real but not meaningful**; the tint is what
says so, and no copy claims otherwise.

## §4 The time axis

`TraceChart` currently renders three kinds of mark: the polyline, the y ticks
and the y labels. It gains a horizontal axis.

- `src/charts/axis.ts`'s `TickKind` gains a fourth member, `"time"`, with an
  `m:ss` formatter routed through the house time formatter, never a bespoke one.
- `chooseTicks` is reused unchanged.
- The axis spans the same `domainX` the polyline already uses.

**This is a deliberate change to a SHARED primitive.** `scale.ts`/`axis.ts` are
contracted to be trace-agnostic so Phase 6J's bars consume them unchanged (spec
3's ruling 3 and its tripwire). A fourth `TickKind` is that contract being
exercised, not broken — but it is named here so 6J's design pass inherits it
knowingly.

**Why it is in this spec rather than deferred.** It is the fix's own
verification instrument. This repo's most productive gate technique — recompute
the headline from the rows in the same frame — is impossible on the one screen
that publishes no quantity to reconcile. The axis also catches every other cause
of a short trace: cap truncation, an early end, a link drop with no boundary
involved, and whatever the next recorder defect turns out to be.

## §5 The already-stored corpus

**Traces written before this spec cannot be repaired.** `t` and `d` are not
reconstructable from what we kept, and there is no version marker: `series` is
untyped `jsonb`, `MonitorRun.series` is optional in localStorage, and
`validateSeries` checks bounds only. An old trace and a new one are byte-shaped
identically and mean different things.

**Scope of the damage, established rather than estimated.** Zero
phone-recorded traces exist in prod — the phone→server leg is still owed
(walk-2026-08-20 README). The entire corpus is James's own web sessions since
#130 merged on 2026-08-19: roughly two days, one rower.

**What is owed:** a `docs/design/DEVIATIONS.md` row stating that traces stored
before this spec may under-run permanently and draw rest as work, and cannot be
distinguished from correct ones. **LANDED** in PR #140 — the row was owed by
criterion 8 and was initially missed, which the PM final-PR gate caught by
grepping rather than by believing the PR body's claim that it existed.

**A rower-facing notes clause IS owed. This paragraph originally said it was
not; the PM final-PR gate OVERTURNED that on 2026-08-20 and the reversal is
kept visible rather than edited away.** The original argument was that a trace
is per-session and immutable, so no tester can observe a before/after on the
same data. **That tests the wrong proposition.** The question is not whether he
can SEE the fix; it is whether he now HOLDS records he should not trust — and
this very section says he does ("cannot be distinguished from correct ones").
Two things settle it: this repo has already shipped an old-corpus clause twice,
the second time for THIS FEATURE four days earlier (`releaseNotes.ts:28`, "Sessions
rowed before this update kept no trace and show no chart"), so announcing the
trace with a corpus caveat and then announcing its correction without one is
inconsistent on the same feature; and PR #124's three-place rule binds an
accepted limit to spec, ROADMAP and notes alike. The clause reads roughly:
*"Traces from sessions you rowed before this update can be missing a whole
interval if the link stuttered, or can show a rest as if you never stopped
rowing, and there is no way to tell a good one from a bad one. Only traces
recorded from this build on are trustworthy."* **(Round 4, C3: the original
draft named fault 1 only — the interval gap. DEVIATIONS row 200 names two
faults; a rower-facing clause covering half the corpus problem is worse than
none, because it reads as complete. Both faults belong in the one clause,
since both are the same "some old traces lie, silently" story to a tester.)**

The time axis owes its own separate clause, being a visible change to a feature
v0.14.0 announced days earlier.

## §6 Testing, and one harness rule that is not optional

- **Failing test first**, per house rule. The gap-injection cases in §1's table
  are the spec's own regression pins and must go red against today's code.
- **Replay the real corpus, not fixtures.** Every claim in §8 was measured by
  importing the production `seriesRecorder.ts` unmodified and replaying
  committed captures. The tests do the same.
- **THE HARNESS RULE.** `seriesRecorder.test.ts` currently hardcodes
  `intervalIndex: null` on its frames. The obvious extension — calling
  `toProgramIndex` in the harness — **reproduces a version that is broken in a
  way production is not**, because production frames carry the stale-count
  clamp's output. The harness MUST drive the real driver, or apply the clamp
  explicitly. A test that keys on the raw normaliser is testing a different
  program.
- **Corpus limitation, stated so nobody trips on it:** only 1 of 6 committed
  recordings carries a program header (`step-3`); the other five yield a null
  index on every frame, including the `r0` keystone. Tests that need a non-null
  key have exactly one real capture. This is the CR2 oracle-blindness shape
  recurring, and it bounds what the corpus can prove.
- **Rest marking is pinned against a capture that actually contains a
  non-frozen rest** — `walk-2026-08-16/session-2-wu-4unequal.jsonl` (21 of 421
  samples inside `workoutState === 3`), never `step-3`'s first rest, which is
  frozen and is how the false premise survived.
- Per-file coverage checked for every file touched; self-mutation with
  byte-identical restore; `pnpm e2e` and `pnpm screenshots` foreground for the
  rendering task.

## §7 Exit criteria

1. On a clean committed capture, the new accumulator reproduces the shipped
   recorder digit-for-digit (`step-3`: 243 samples — corrected from an
   earlier 242 head-count, see §1's own note above for how 243 was
   established — `t=2422`, `d=8072`).
2. With frames dropped across an interval boundary — at 4, 20 and 60 frames —
   the new accumulator is short by **zero**, and a test proves the shipped fold
   is not (red before, green after).
3. `isGenuineBoundary`, `MIN_COMPLETED_INTERVAL_SECONDS`,
   `MAX_BOUNDARY_RESET_METERS` and `RESET_EPSILON_SECONDS` are **absent from
   the codebase**, proven by grep in the report, not by assertion.
   (`BUCKET_EPSILON_SECONDS` REMAINS — it guards the whole-second flooring and
   has nothing to do with edge detection.)
4. A null `intervalIndex` continues the last key, with a test that fails if it
   resets accumulation or falls back to edge detection; an all-null run records
   under a single synthetic key rather than recording nothing; and a backward
   key does not move the cumulative clock backwards (§2's two cases, each with
   its own test).
5. Every sample recorded while the machine was resting carries `r: true`, pinned
   against `session-2-wu-4unequal`'s real non-frozen rest; work samples carry no
   `r` key at all.
6. The chart tints rest spans, draws the line CONTINUOUSLY across them, and a
   design witness asserts the computed contrast number.
7. The chart renders a time axis whose labels are readable and whose values
   reconcile with the session's own `TIME` hero in the same frame — checked by
   eye on a committed capture, per recurring failure 7.
8. `DEVIATIONS.md` carries the pre-fix-corpus row (§5).
9. The next tag's notes carry TWO clauses: one for the axis and rest marking,
   and one for the old corpus (§5's declination overturned at the PM gate).
   **Release shape, ruled 2026-08-20:** no tag on task 1's merge — v0.14.0 has
   zero product code after it and a solo tag would carry no falsification value
   here, since nothing about this fix is observable to a tester. Next tag is
   **v0.15.0 MINOR when task 3 lands**. **Trigger to revisit:** tasks 2+3
   slipping past about a week, or a link-loss fix tagging first — the fold's
   trigger threshold is 0.81 s against a measured worst inter-frame gap of
   0.810 s, so wrong traces accrue on ordinary jitter, not on rare events.

## §8 Vetted ground — what the antagonist attacked, and what it found

**The proposal HELD.** Index-keyed max-merge was attacked with the ledger's own
prior kill-shot (an injected `(0,0)` frame carrying the completed interval's
key) and did not move: `max(74.4, 0) = 74.4`, and the poison frame's own `t`
loses the bucket race. That kill-shot killed LAST-WRITE-WINS, not max-merge —
one phrase apart, opposite verdicts.

**A false alarm I raised was refuted.** The walk ring's `intervalIndex=2
(0x0033) vs actual.index=3 (0x0037/38)` is NOT two sources disagreeing:
`driver.ts:3265` deliberately compares RAW bytes and says so, the two
characteristics carry different documented offsets, and normalised they agree
exactly.

**Four defects found in the module beyond the one this spec started from**, all
measured against the committed corpus:

- **B1 — the freeze premise is false** (§ above). Our own
  `domain/monitor/types.ts:36-38` ends the cited sentence with "each interval's
  count spans its own work plus its trailing rest", hardware-settled twelve days
  earlier.
- **B2 — the test that proved it selects its own evidence.** "the 30s rest
  contributes ZERO samples" calls `longestFrozenRun(frames)` and then asserts
  that run adds no samples: a property of `Math.floor` wearing a rest's name.
  The same file's fixture contains a non-frozen rest that does emit.
- **B3 — a phantom interval already folded.** `session-2` frames 866→867 re-base
  1.84 s → 1.63 s with distance ~0 and `rowingState 0` throughout;
  `isGenuineBoundary` returns true and folds 1.84 s of an interval that never
  happened. The header's stated jitter maximum was 0.87 s, derived from one
  capture family that excluded this one.
- **B4 — the 3.0 m threshold has zero margin.** It buys 0.81 s at median rowing
  speed (3.71 m/s) and 0.61 s at p95, against a **measured maximum inter-frame
  gap of 0.810 s**. The disclosed failure is one ordinary bad tick away, and no
  widening rescues it: the Terminate floor caps any admissible constant at
  ~2.7 s.
- **B5 — a third reset population.** `session-2` frames 238→239 and 530→531 are
  mid-rest backward re-bases of −5.97 s and −3.15 s with distance flat: neither
  boundary, Terminate, nor jitter. The taxonomy called itself exhaustive over
  one capture.

**The cheap FLAG alternative was evaluated and rejected on evidence, not cost.**
It is possible — `isGenuineBoundary` returning false IS the module learning
something, contrary to the header's claim that it never learns. But it cannot
learn WHICH rejection was real: on the one capture with any rejections, both are
benign and zero are missed boundaries — a 100% false-positive rate — and a flag
says nothing at all about B1 or B3.

**Not established:** WHY elapsed advances during a rest. It correlates with the
rower moving (frozen at `restDistanceMeters = 0`, advancing when he paddles) but
no Concept2 document states it, and `pm5-interface-notes.md:4600` lists the
sibling question as open. INFERENCE. The empirical facts are PRIMARY from three
independent hardware sessions.

## §9 Out of scope, each with its reason

- **Reconnect** — Phase LL's own ruling, with preconditions named in ROADMAP.
- **The zero-sentinel capture-side question** (`p`/`spm` of 0 meaning both "no
  reading" and "the machine said 0", 26% of samples). A separate stored-shape
  change with its own gate; this spec renders and records around it unchanged.
- **The PM5's internal log and the `0x003F` logged-workout hash** as an external
  oracle — filed as a triggered follow-on the same day. A new subscription and a
  new CSAFE conversation do not belong on a spec already carrying triad weight.
- **Deleting `d`.** It is read by nothing today, but spec 3's successors will
  want distance-keyed views and it is four days into a stored shape. Named here
  so the option is on the record rather than rediscovered.
- **A rower-facing correction for old traces** — §5's reasoning.
