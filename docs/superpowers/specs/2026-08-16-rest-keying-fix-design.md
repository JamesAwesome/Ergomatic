# The stale-count rest fix, and the recordings become regression tests

**Date:** 2026-08-16 · **Status:** James ordered the fix cycle after the
diagnosis; full SDD rigor. · **Branch:** rest-keying.

## What and why

At every work→rest boundary, the app can file the finished interval's
totals under the PREVIOUS interval, inflating the session total
permanently. Yesterday's walk produced it twice in one session (+221 m,
photographed); the committed recording reproduces it digit-for-digit
through the real driver with no hardware. This spec fixes that one keying
error and lands both walk recordings as permanent CI regression tests
(the Stage B rung the record-replay harness was built for). Nothing else
about the register design changes.

## The diagnosed mechanism (evidence, not theory)

Replay artifacts: `~/.claude/jobs/1f126c7b/tmp/session2-replay.txt` and
siblings (983-tick attribution timeline; reproduced on pre-#102 and
current main). Recordings: `docs/monitor/sessions/walk-2026-08-16/`.

- The PM5 notifies 0x0031 (status) BEFORE 0x0033 (interval count) within
  a burst: **982 of 983** bursts in the session-2 recording (PRIMARY,
  measured from the committed capture; the 983rd is the first-ever
  notification).
- The count increments in the same burst in which workoutState flips
  work→rest. So the FIRST resting 0x0031 of interval N's rest arrives
  while the merged count still reads N.
- `toProgramIndex`'s resting arm (`intervalIndex.ts:170-171`) subtracts 1
  — correct AFTER the flip, wrong on that first stale frame: it yields
  N−1.
- The register write (`driver.ts:1928-1940`) then max-merges interval N's
  completed pair into register N−1, which already exists and holds N−1's
  smaller final pair — so the poison sticks (max cannot be lowered), and
  the open-on-reset guard (`driver.ts:1918-1926`) never fires because it
  only inspects keys not already in `session.seen`.
- Whether a given boundary poisons is sampling luck: a burst that catches
  the transitional workoutState 8 tick (maps to rowing → identity) is
  safe; a direct 4→3 flip is not. Session 2's rest 1 was lucky, rests 2
  and 3 were not — matching the photo onset. Session 1 (keystone, r0) has
  no rests and its w→w stale frame carries a just-reset (0.18, 0) pair
  that max-merge discards; it replays clean.
- Arithmetic closes: poisoned writes +233.3 m, register under-read of TWD
  elsewhere −12.6 m, net +220.7 ≈ the observed +221.

## Research pass

- **Does the machine have the concept we're assuming?** The PM5 has no
  atomic multi-characteristic snapshot: characteristics notify
  independently, in a measured order (0x0031 first), and the count lags
  the state flip by ≤1 notification at boundaries. CSAFE-DEF Appendix E's
  boundary-sampling caveat (already quoted in `pm5-interface-notes.md`
  §19.8's own discussion) says exactly this. §19.8's "0x0033 read
  identity through a w→w boundary" is NOT falsified — its single sample
  sat inside the same lag window; both 2026-08-16 recordings show the
  identical shape (reset tick with old count, flip in the same burst,
  10-90 ms later). Tag: PRIMARY (committed captures), SECONDARY (§19.8
  re-read against them).
- **Prior art for the fix shape is in-repo:** the write rule already has
  one asymmetry guard — the refused-open clamp (`driver.ts:1902-1926`),
  which stops a NEW key from opening on a stale frame by comparing
  against the open register and folding into `openKey`. The fix below is
  its mirror for the other direction. Nothing external solves per-device
  notification skew generically; the sibling fixture rung
  (`sessionTotals.test.ts`) remains the tool for skew shapes no capture
  holds. Nothing else found; that is a result.

## The fix (one rule, one place)

**A resting frame may never write to a key below the highest key already
seen.** In `maybeEmitFrame`, after `activeKey` is computed and before the
register write:

- If `base.state === "resting"` and `session.seen.size > 0` and
  `activeKey !== null` and `activeKey < max(session.seen.keys())`: set
  `activeKey = max(session.seen.keys())`, and log ONE `divergence` entry
  per session per clamped key (same throttle idiom as
  `refusedKeysLogged`): the stale-count rest clamp.

Why this rule and not a burst-reassembly or a quarantine: rest always
belongs to the interval just rowed — the machine numbers rests forward,
so a legitimate resting key is always ≥ the newest work key. Keys only
grow. The only way a resting frame computes a key below `max(seen)` is
the stale-count window this spec exists for (or a shape so alien the
clamp's divergence log is the right response anyway). The rule needs no
timing assumptions, no new state, and cannot fire on session 1-shaped
(r0) programs.

**Scope holds at registers.** The emitted frame's own `intervalIndex`
still carries the stale N−1 for that single ~90 ms frame (a transient
"interval N−1 of M" flash a rower cannot plausibly read). Disclosed
non-goal: fixing frame-level staleness means touching the consumer-facing
index semantics mid-phase for a cosmetic transient; it is filed as a
follow-on note, not silently bundled (fast-path escalation rule in
spirit). `toProgramIndex`, `toMachineIndex`, parse.ts, and the actuals
path do not change.

## Stage B: the recordings become the regression rung

New CI test file (client project) replaying BOTH committed 2026-08-16
recordings through the REAL `createPm5Driver` via `createReplayTransport`
(instant clock, driver `now`/`schedule` bound — the Stage A round trip's
established harness shape):

- **Session 2 (`session-2-wu-4unequal.jsonl`) — the failing test, first.**
  It fails on today's main (accumulator 1819.7 m). After the fix it must
  assert: zero replay divergences; final accumulator agrees with the
  machine's own TWD (decoded from the recording's last 0x0031 by a
  minimal reader PRIVATE to the test — never the driver's output, never
  `intervalIndex`; the tautology rule) within the walk's established
  band; and the final register map equals the honest per-interval finals
  computed by the same independent reader via reset detection.
- **Session 1 (keystone) — exit criterion 1 of the Stage A spec, landed:**
  zero divergences; registers 0:(65.34, 249.8) 1:(72.54, 250.0);
  accumulator 499.8 m against machineTotal 500 m. Byte-for-byte the
  handoff's numbers; this test must be UNAFFECTED by the fix
  (digit-identical before and after — it pins that the clamp cannot fire
  without rests).
- Expected driver-log divergences are asserted too: session 2 produces
  exactly the clamp entries its two poisoned boundaries warrant; session
  1 produces none.

## Exit criteria (each can fail)

1. The session-2 replay test is RED on unmodified main (committed
   evidence in the PR: the failing run's output) and GREEN after the fix.
2. The keystone replay is digit-identical before and after the fix.
3. Self-mutation: reverting the clamp turns exactly the session-2 test
   red; a mutation of the clamp's comparison direction (`>` for `<`) is
   also caught.
4. Full suite + e2e green; per-file coverage on touched files ≥ the
   repo bar; `sessionTotals.test.ts`'s existing shapes all still green
   (the no-rest clobber and boundary-poison guards must not regress).
5. The fix changes ZERO frames in the keystone attribution timeline and
   exactly the poisoned frames in session 2's (assert via the register
   maps, not by trusting the narrative).

## Honest limits

- The clamp cures the register total. It does not cure the one-frame
  stale `intervalIndex` on the emitted frame (disclosed above), and it
  does not make boundary sampling deterministic — future captures of new
  shapes stay valuable.
- Both recordings are desktop-cadence (~2/s); the documented iOS cadence
  (~90-180 ms spacing) widens the stale window in absolute terms but the
  rule is timing-free, so no iOS-specific behavior is asserted — noted,
  not tested.
- The −12.6 m register-vs-TWD under-read (re-base/gap truncation) is a
  separate, bounded, pre-existing behavior outside this spec's scope; the
  session-2 assertion band accounts for it explicitly rather than hiding
  it.
