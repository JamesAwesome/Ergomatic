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
- Legal boundaries: TWD HOLDS while elapsed/distance reset
  (keystone seq 305→310: elapsed 69.75→0.50, distance 248.5→1.9,
  TWD 0→250) — which is exactly why TWD was chosen as the key; a
  boundary cannot fake the three-axis signature on a non-distance
  program.

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
3. The keystone boundary stays a continuation (TWD holds while
   elapsed/distance reset — seq 305→310 values).
4. The distance-goal suppression still suppresses (existing corpus test
   retargeted, not weakened — the 0/250/500 flicker capture).
5. `continuity.test.ts`'s corpus-derivation gate re-run under the new
   predicate: zero convictions across all healthy simulated resumes,
   INCLUDING the previously-outside-corpus time-program captures from
   walk-2026-08-23.

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
3. The corpus gate (1,026+ pairs) passes with zero healthy convictions
   under the new predicate, now including the 2026-08-23 time-program
   captures.
4. The cohort discharge condition's first arm (Release posture, Phase
   LL) is satisfiable: this PR's merge makes "F2a is merged" true.

## 7. Gates

- **Antagonist: FULL pass on this spec** — TRIAD, and conviction
  semantics are ground the RC anchor pass never covered (spoken, not
  skipped).
- **PM final-PR gate** on the implementation PR (TRIAD).
- Lands ALONE (the stated grouping exception); the two ROADMAP edits in
  §5 are docs riders, not a second risk model.
