# The stale-count rest fix, and the recordings become regression tests

**Date:** 2026-08-16 · **Status:** James ordered the fix cycle; antagonist
spec pass amendments 1-10 incorporated (its simulation independently
validated the fix: post-fix accumulator 1599.9 m vs machine TWD 1599 m).
**Branch:** rest-keying.

## What and why

At a work→rest boundary, the app can file the finished interval's totals
under the PREVIOUS interval, inflating the session total permanently.
Yesterday's walk produced it twice in one session (+221 m, photographed);
the committed recording reproduces it digit-for-digit through the real
driver with no hardware. This spec fixes that one keying error and lands
both walk recordings as permanent CI regression tests (the Stage B rung).
Nothing else about the register design changes.

## The diagnosed mechanism (evidence, not theory)

Replay artifacts: `~/.claude/jobs/1f126c7b/tmp/session2-replay.txt` and
siblings; recordings: `docs/monitor/sessions/walk-2026-08-16/`. Numbers
below are the antagonist's re-measured set (its simulation reproduced the
unfixed register map digit-for-digit first).

- The PM5 notifies 0x0031 (status) before 0x0033 (interval count) in
  **983 of 983** pairings in session 2 (287/287 in session 1); skew
  0x0031→0x0033 median 10.8 ms, p95 90.5 ms, max 360.8 ms. (PRIMARY,
  measured from the committed captures.)
- At **2 of 3** work→rest boundaries in session 2 the count flipped in
  the same burst as the state flip, AFTER the first resting 0x0031 — so
  that frame reads the OLD count. The discriminator is not skew
  magnitude (13.0 ms poisoned, 8.2 ms safe): boundary 1 was safe because
  its burst sampled the transitional workoutState 8 tick (maps to rowing
  → identity keying) and its count had already flipped one burst before
  the resting state appeared.
- `toProgramIndex`'s resting arm (`intervalIndex.ts:170-171`) subtracts 1
  — correct after the flip, wrong on the stale frame: it yields N−1.
- The register write (`driver.ts:1933-1945`) max-merges interval N's
  completed pair into register N−1, which already exists with a smaller
  pair — the poison sticks (max cannot be lowered). The open-on-reset
  guard (`driver.ts:1911-1931`) never fires: its gate is
  `!session.seen.has(activeKey)` (`driver.ts:1914`) and key N−1 always
  exists.
- Session 1 (keystone, r0) has no resting frames at all; its stale w→w
  frame (seq 447, ws=5, count 0) carries (0.18, 0), a max-merge no-op.
  It replays clean, fix or no fix.
- **Arithmetic (corrected by the antagonist's re-measurement):** poison
  +219.8 m; honest registers sum 1599.9 m vs machine TWD 1599 m
  (**+0.9 m — within TWD's whole-metre quantisation**); net vs TWD
  +220.7 m = the observed delta. At eight independently sampled TWD
  instants across the session, the honest accumulator tracks the
  machine's own total within −1.3..+0.9 m, including the photographed
  rest-1 frame (TWD 350 / honest 349.1 / phone photo 348).

## Research pass

- **Does the machine have the concept we're assuming?** The PM5 has no
  atomic multi-characteristic snapshot; boundary sampling is documented
  racy. Tag: **PRIMARY — CSAFE-DEF Appendix E, quoted verbatim in
  `pm5-interface-notes.md` §19.8:** "the transitional workout states …
  exist precisely at these boundaries and Appendix E flags that a client
  'may not see this state'. Boundary sampling is documented as racy."
  §19.8's own 0x0033 claim is narrower than earlier paraphrases (one
  boundary reading, subject = 0x0037/38 forward attribution) and is NOT
  falsified by this work; but `intervalIndex.ts:80-81`'s "the one
  hardware reading available" evidence-base sentence is now stale (three
  readings exist: both recordings show the count advancing across w→w
  boundaries 10.6-92.9 ms after the reset tick) — reconciled in this PR.
- **The official docs' own silence supports a timing-free rule
  (James's prompt, answered from the corpus):** the C2 BLE spec never
  guarantees inter-characteristic ordering or lockstep —
  `pm5-interface-notes.md` §15: "Nothing in either document guarantees
  these two counters stay in lockstep frame-to-frame" (PRIMARY). The
  983/983 ordering we measured is empirical, not contractual, so a fix
  that waited on burst order would build on unspecified behavior; the
  clamp uses only our own register history.
- **The multiplexed characteristic (0x0080) is not an escape hatch**
  (preempting the obvious suggestion): it still delivers one message per
  notification — no atomic snapshot — and its 0x0032/0x0033 restatements
  are NOT byte-identical to the GATT forms (BLE doc p.26-27 via
  interface-notes: Average Power moves characteristics, 19/18 bytes vs
  17/20), so our offset tables would silently misdecode there. PRIMARY.
- **The machine's atomic read lives on the polled CSAFE channel**, not
  the notify path: multiple GET commands in one frame return one
  response frame — a consistent snapshot, the SDK's model (PRIMARY for
  the framing; INFERENCE that this is why SDK-style clients never meet
  this bug). A channel redesign, not a fix; recorded as the honest
  answer to "does the system have the concept."
- **Prior art for the fix shape is in-repo:** the refused-open clamp
  (`driver.ts:1911-1931`) — the same "fold a stale attribution into the
  open key, log once per key" idiom, in the other direction. Nothing
  external solves per-device notification skew generically; the sibling
  fixture rung (`sessionTotals.test.ts`) remains the tool for shapes no
  capture holds. Nothing else found; that is a result.

## The fix (one rule, one place)

**A resting frame may never write to a key below the highest key already
seen.** In `maybeEmitFrame`, after `activeKey` is computed and **BEFORE
the refused-open guard** (pinned: the clamp's output is always a key in
`session.seen`, which short-circuits the guard's `:1914` gate — the
final VALUE is order-independent, proven by simulating both orders, but
the LOG is not, and clamp-first makes the specific diagnosis win the
log):

- If `base.state === "resting"` and `session.seen.size > 0` and
  `activeKey !== null` and `activeKey < max(session.seen.keys())`: set
  `activeKey = max(session.seen.keys())` and log ONE `divergence` entry
  per session per clamped key (the `refusedKeysLogged` throttle idiom):
  the stale-count rest clamp.

Why this rule: the machine numbers rests forward, so a legitimate
resting key is always ≥ the newest work key; keys only grow within a
run. Attacked and held (antagonist S3): reconnect preserves `seen`
(reset only inside `program()`, `driver.ts:4239`); JustRow is
structurally unreachable (`programLength 0` → null index → empty map
forever); the D3 phantom and `count = programLength + 1` are folded by
`toProgramIndex`'s upper clamp (`intervalIndex.ts:177`); the finished
fallback is excluded by the state gate. **Why the rowing arm needs no
clamp (do not "helpfully" generalise):** a stale ROWING frame keys its
own just-finished interval, where its pair is a max-merge no-op.

**Disclosed residual (pre-existing, direction changes):** `session.seen`
outlives the RUN — it resets only in `program()`. A rower who restarts a
workout on the erg without the app re-arming carries the old
`max(seen)`; today that mis-shape undercounts (small readings fold into
old keys), with the clamp its resting frames instead inflate the old top
key. Both are wrong states of an unsupported flow; named here so the
next capture of that shape has a spec to check against, not silently
narrowed.

**Scope holds at registers.** The emitted frame's own `intervalIndex`
still carries the stale N−1 for one frame. Honestly stated (antagonist
S5): nothing downstream latches or persists off it (`connectedAxes.ts`
never reads it; actuals come from 0x0037/38 via `toActualIndex`), but
the transient is not just an ordinal flash — for that frame the interval
lookup flips the pane's clock label and dimension (e.g. `METERS LEFT` →
time-shaped) plus ordinal/upNext/targetSplit, and `PaneGrid`'s
`scrollIntoView` effect can double-fire; at the documented iOS cadence
(90-180 ms) the observed max skew (360.8 ms) spans 2-4 frames. Filed as
a follow-on, not bundled.

## Stage B: the recordings become the regression rung

New CI test file (client project) replaying BOTH committed recordings
through the REAL `createPm5Driver` via `createReplayTransport` (instant
clock, driver `now`/`schedule` bound — the Stage A round-trip harness
shape):

- **Session 2 (`session-2-wu-4unequal.jsonl`) — the failing test,
  first.** RED on unmodified code (accumulator 1819.7 m). GREEN after
  the fix, asserting: zero replay (tx) divergences; **final
  `|accumulator − TWD| ≤ 1.5 m`** where TWD is decoded from the
  recording's last 0x0031 by the independent reader; **the eight
  mid-session TWD checkpoints** (t≈52.6/112.8/137.6/263.1/265.1/422.3/
  424.9/514.9 s) each within the measured −1.3..+0.9 m band (assert
  |Δ| ≤ 1.5 m); the final register map equals the independent reader's
  honest per-interval finals; and **the clamp's divergence log contains
  EXACTLY the entries for keys {1, 2} and no others** (the exact-count
  assertion that kills the `<=` mutant).
- **Session 1 (keystone) — Stage A exit criterion 1, landed:** zero
  divergences; registers 0:(65.34, 249.8) 1:(72.54, 250.0); accumulator
  499.8 m vs machineTotal 500 m; ZERO clamp log entries; digit-identical
  before and after the fix.
- **The independent reader, specified exactly (tautology rule):**
  decodes 0x0031 payloads only; segments on `elapsed drop AND distance
  drop` (the §F2 AND-rule — session 2 contains THREE pseudo-drops it
  must reject: mid-rest re-bases @137.1 and @285.4, and a rowing-start
  re-base @456.3 with elapsed −0.21 s while distance rose); per segment
  takes the MAX of elapsed and of distance over rowing/resting/finished
  frames (not the last-before-reset reading — the @137.1 re-base makes
  LAST disagree with the register's held max, e.g. key 1 elapsed 69.96
  vs last 69.63); maps segment k → key k and **asserts segment count ===
  programmed interval count** so that assumption fails loudly; may reuse
  max-merge (not the field under test); MUST NOT read `intervalCount`,
  `toProgramIndex`, or any driver output.
- **The directed fixture (the conjunct no capture can test):** dropping
  the `state === "resting"` conjunct is SILENT on both recordings
  (identical registers, totals, and logs — antagonist F2). A
  `sessionTotals.test.ts`-machinery shape pins it: with registers
  key0=(200, 500) and key1=(60, 150) established, a ROWING frame keyed 0
  carrying (100, 300) must be a no-op (unclamped: max-merge discards);
  a clamp that ignores the resting gate would write (100, 300) into
  key 1. Assert key 1 unchanged.

## Exit criteria (each can fail)

1. The session-2 replay test is RED on unmodified code (the failing
   run's output committed in the PR) and GREEN after the fix.
2. The keystone replay is digit-identical before and after the fix, with
   zero clamp logs.
3. Self-mutation, chosen so each mutant differs from the REVERT
   (antagonist technique): (a) revert the clamp → session-2 test red;
   (b) `<=` for `<` → killed by the exact clamp-log assertion (count and
   key set), NOT by any numeric assertion; (c) drop the resting conjunct
   → killed by the directed fixture, and by nothing else. The `>`
   mutant is NOT cited (it is byte-identical to the revert on these
   recordings).
4. Full suite + e2e green; per-file coverage on touched files at the
   repo bar; every existing `sessionTotals.test.ts` shape (no-rest
   clobber, boundary poison) still green.
5. The fix changes zero register-map entries for session 1 and exactly
   keys 1 and 2 for session 2 (asserted via the maps, not narrative).
6. `intervalIndex.ts:80-81`'s stale evidence-base comment reconciled in
   the same PR (three w→w readings now exist).

## Honest limits

- The clamp cures the register totals. The one-frame stale
  `intervalIndex` transient (label/dimension flip + possible double
  scroll) is a filed follow-on, not fixed here.
- Both recordings are desktop-cadence; the rule is timing-free and no
  iOS-specific behavior is asserted. The observed max skew (360.8 ms)
  would span multiple frames at iOS cadence — noted for the follow-on.
- The `session.seen`-outlives-the-run shape (erg-side restart without
  re-arm) remains wrong in both directions; this fix changes which
  direction. Out of scope, disclosed above.
