# F2a — the continuity guard convicts on a full-reset signature, never one reading

**What and why, in plain words.** On 2026-08-23 the app closed a healthy
row as link-lost while the rower was mid-pull, because the continuity
guard convicted on a single backward Total Work Distance reading — a
field the same walk proved non-monotonic on time-interval programs (five
zero readings against one 81 in one day, web included). A real monitor
reset zeroes elapsed, distance, AND TWD together; the convicting frame
had elapsed and distance both advancing. This spec makes the guard
require that full signature — all three axes strictly backward in the
same reading — before it closes a record. It is a BOUND tightened, not a
key changed: the correct re-key (off TWD entirely) is F2b's, inside
RC-1's spec. TRIAD: this changes when records close. Approved shape
(James, 2026-08-23: "Good").

## 1. Evidence (all committed)

- The false kill: `docs/monitor/sessions/walk-2026-08-23/ring-phone-2-background-continuity-kill.json`
  seq 30→33→34 — TWD 81→0 while elapsed 56.11→59.33 and distance
  81.2→83.3 ADVANCE, workoutState 4 throughout; seq 34 closes the record.
- The six-row TWD table (ROADMAP, Phase LL walk card, corrected F2): five
  zeros — including the WEB capture's flat 0 across a 248.5 m interval —
  against one 81. Zero is the field's normal reading on time programs
  that day; the 81 is the outlier. Nothing iOS-specific.
- A real reset's shape: a fresh/reset monitor reads elapsed 0, distance
  0, TWD 0 (every post-reset connect in the corpus; e.g. ring-phone-4
  seq 6-8). All three fall together.
- Legal boundaries: TWD holds or grows while elapsed/distance reset.
  **The three real NON-DISTANCE boundaries in the corpus** (antagonist
  pass, 2026-08-23 — the keystone is a distance program and 100%
  suppressed, so it evidences nothing here): step-3 recording seq
  411→416 and 953→956, session-2 recording seq 776→781 — TWD backward at
  none of them, and zero triple-backward readings across 3,637 slid
  pairs at seven gap lengths. "Never observed in 3,637 wire pairs" is
  the claim — not "cannot"; ring-phone-2's own 81→0 remains the one
  unexplained backward TWD on a time program (walk F5).

## 2. Design

`app/src/monitor/continuity.ts`:

- `ContinuityReading` grows two required fields:
  `elapsedSeconds: number` and `distanceMeters: number` — both read off
  the same `MonitorFrame` the TWD reading already comes from (0x0031's
  own elapsed/distance decodes; no new wire work).
- `check(before, after)` returns `"reset"` ONLY when ALL THREE are
  strictly backward: `after.totalWorkDistanceMeters <
  before.totalWorkDistanceMeters` AND `after.elapsedSeconds <
  before.elapsedSeconds` AND `after.distanceMeters <
  before.distanceMeters`. Otherwise `"continuation"`. Tolerances stay 0
  on all three (the reset signature is zeros against real progress;
  nothing marginal is being discriminated).
- **The distance-goal suppression STAYS, unchanged and load-bearing:** on
  a distance-programmed interval TWD reports the GOAL and flickers
  (0/250/500 at boundaries) — at such a boundary TWD, elapsed and
  distance can ALL go backward together, so the three-axis test alone
  would false-convict there. The suppression is the guard for that
  program shape; the signature is the guard for the rest. Neither
  replaces the other.
- `applyContinuityCheck` (`useMonitorSession.ts`) constructs the readings
  with the two new fields; its decision logic, the close-as-link-lost
  path, and the surface update are UNCHANGED — only the conviction
  predicate narrows.

## 2b. The stated cost (TRIAD-weight, accepted)

Narrowing the predicate LOSES a conviction the old rule made: a real
reset during a gap that began EARLY in an interval can leave elapsed and
distance reading forward afterward (per-interval clocks restart from 0
and can exceed low before-values by the time the next reading lands), so
the records MERGE instead of closing — blind for roughly 14% of a 180 s
interval at a 30 s gap, growing with gap length (~64% at two minutes).
This is accepted deliberately: the old rule bought that coverage by
killing healthy rows (the walk's F2). **Correction (final-review
MEDIUM-1, 2026-08-23): the merge is NOT "visible garbage" — an earlier
draft of this section said so, unsourced, and it reads backwards against
`driver.ts:2107-2119`.** The session totals `useMonitorSession.ts` stores
are not a running sum of frames; they are a per-interval register
(`session.seen`) merged by `Math.max` per key. After a genuine reset the
machine re-enters interval 0 — a key the register already holds — so
post-reset metres are absorbed by the max-merge until they exceed the
pre-reset value: 300 m rowed, a reset, 200 m more rowed stores ≈300 m,
not 500 m, and nothing about that number looks broken. The merge trades
one silent-loss failure mode (a killed healthy row) for a DIFFERENT
silent-under-count failure mode, not for a visible one. F2b's re-key
(RC-1) is still what closes the blind window properly, and RC-1's own
ROADMAP entry now carries this under-count risk explicitly. The spec
says this out loud so nobody later reads the narrowing as free, or reads
the merge as self-evidently safer than it is.

## 3. Rejected alternatives (attacked at brainstorm)

- **Persistence (N confirming frames):** refuted by the walk's own
  evidence — the zeros PERSIST; they are normal readings, not
  transients. Persistence convicts the same healthy row, slower.
- **Suppress on time programs too:** disables reset detection entirely
  until F2b; strictly worse than a sound narrower bound.

## 4. Tests (replay, never round trip)

1. The false kill cannot regress: replay ring-phone-2's seq 30→33 pair
   through `check` → `"continuation"` (named by file and seqs; this is
   the walk's own convicting pair).
2. A full reset still convicts: before = a mid-work reading (from
   ring-phone-2 seq 30), after = a post-reset armed reading (zeros, from
   ring-phone-4 seq 7-8 shape) → `"reset"`.
3. The three real NON-DISTANCE boundaries stay continuations under the
   new predicate: replay pairs straddling step-3 seq 411→416, step-3 seq
   953→956, and session-2 seq 776→781 (the keystone is a distance
   program — it belongs to test 5's suppression case, not here).
4. **Per-clause mutation pins (the tests that CAN go red):** three
   constructed pairs, each with exactly ONE axis backward and two
   advancing → all `"continuation"`; plus one pair with exactly TWO
   backward → `"continuation"`; plus the all-three-backward pair →
   `"reset"`. Deleting ANY single clause from the conjunction must turn
   at least one of these red (verified by self-mutation in the
   implementing task — the walk's two real pairs alone pin only the TWD
   clause).
5. The distance-goal suppression still suppresses, and NOT vacuously: a
   distance-goal pair constructed with ALL THREE axes backward (the
   0/250/500 flicker shape at a boundary) returns `"continuation"`
   BECAUSE of the suppression — a test that goes red if the suppression
   line is deleted. All existing suppression fixtures and the corpus
   sweep are updated with REAL elapsed/distance values from their source
   frames, never defaulted zeros (a zeroed fixture makes every
   suppression test pass with or without the suppression — antagonist
   pass, blocking 5).
6. `continuity.test.ts`'s corpus-derivation gate re-run under the new
   predicate with real-valued readings on all three axes: zero
   convictions across all healthy simulated resumes (the 1,026-pair
   regression floor).

## 5. Also riding this PR

- ROADMAP: tick F2a's checkbox; note in the LL walk card's F2 that the
  defuse shipped (F2b remains open in RC-1).
- ROADMAP Phase PROD checklist: add the `- [ ]` checkbox for the
  `app/e2e/`-is-not-typechecked trap (James, 2026-08-23 — previously a
  trap note with no owner; PROD owns it now: a hand-rolled tsconfig over
  `e2e/` surfaced 14 pre-existing errors when last tried).

## 6. Exit criteria — written so they can go red

1. Replaying ring-phone-2's convicting pair returns `"continuation"`,
   cited by file+seq in the test name.
2. Replaying a genuine reset pair returns `"reset"`.
3. The corpus gate (1,026 non-distance-goal pairs) passes with zero
   healthy convictions under the new predicate. (It CANNOT go red for
   this change alone — a conjunctive narrowing of an already-zero
   predicate — so it is a regression floor, not this spec's proof; the
   per-clause pins in §4 are the tests that can. The 2026-08-23 walk
   added NO new wire captures on time programs — the phone rings are
   event logs, not recordings — so the corpus count stays 1,026.)
4. The cohort discharge condition's first arm (Release posture, Phase
   LL) is satisfiable: this PR's merge makes "F2a is merged" true.

## 7. Gates

- **Antagonist: FULL pass on this spec** — TRIAD, and conviction
  semantics are ground the RC anchor pass never covered (spoken, not
  skipped).
- **PM final-PR gate** on the implementation PR (TRIAD).
- Lands ALONE (the stated grouping exception); the two ROADMAP edits in
  §5 are docs riders, not a second risk model.
