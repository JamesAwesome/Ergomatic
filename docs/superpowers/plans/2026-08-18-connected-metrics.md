# Phase CM Implementation Plan — the interval average, and total meters

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The connected LIVE pane shows how far the session has gone, and
how the current interval is averaging — judged only once the number is
final.

**Architecture:** Both numbers already exist. Total meters renders the
driver's existing `sessionDistanceMeters` (work + rest, reconciled against
the machine's own total every frame by `recordTwdVerdict`). The average
renders `0x0033`'s `splitAvgPace` continuously, which the machine already
holds flat through each rest. The one new mechanism is a **monotone
interval referent** in the driver, because the emitted `intervalIndex` lags
a full interval for ~half a second at every boundary and the existing clamp
never reached it.

**Tech Stack:** existing; zero new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-18-connected-metrics-design.md` —
binding. Its states table, its referent rule and its exit criteria are exact
requirements.

## Global Constraints

- `src/**` tests run under `pnpm test --project client`; `domain/**` and
  `server/**` under `--project unit`. Read BOTH summary lines.
- TDD, failing test first. Domain and driver code get the heaviest coverage.
- **Every number this phase displays must be traceable to a wire field or to
  an accumulator the driver already reconciles.** Nothing new is derived.
- Realistic fixtures: the committed captures under
  `docs/monitor/sessions/walk-2026-08-16/` and `walk-2026-08-17/` are the
  regression corpus. `session-2-wu-4unequal.jsonl` is the only one with
  rests AND unequal intervals — it is the keystone here.
- House copy rules; no em-dashes in user-facing strings.
- Commit per task; `git rev-parse --show-toplevel` must print the worktree
  path first. Commands in `app/`.
- **This is TRIAD work.** No fast path, no skipped gates, and the PR carries
  a PM final gate.

## File Structure

- Modify: `app/src/monitor/driver.ts` — the monotone referent, applied to
  the emitted frame.
- Modify: `app/src/monitor/transports/fake.ts` — emit `splitAvgPace` and
  `restDistanceMeters`; correct the TWD model.
- Modify: the `MonitorFrame` type — `splitAvgPace` and the referent.
- Modify: `app/src/workout/connected/surfaceModel.ts` — the AVG cell, the
  rest judgement, the referent-driven target.
- Modify: `app/src/workout/connected/PaneLive.tsx`, `app/src/index.css`.
- Tests: driver replay tests, `surfaceModel.test.ts`, `PaneLive.test.tsx`,
  frozen fixtures, `e2e/design.spec.ts`, `e2e/screenshots.spec.ts`.

---

### Task 1: The fake stops lying about two fields

Nothing downstream is visible until this lands: `fake.ts` zero-fills both
new numbers, so every e2e test, frozen fixture and screenshot would pass
while rendering nothing.

**Files:** `app/src/monitor/transports/fake.ts` + its tests.

- [ ] **Step 1: Write the failing test.** Drive the fake through a
  two-interval program with a rest and assert on the DECODED frames it
  emits: `splitAvgPace` is non-zero while rowing, climbs toward a plausible
  value, and **holds flat across the rest** (the real machine's behaviour,
  measured: agrees with the boundary record to within 0.2 s);
  `restDistanceMeters` is non-zero once the rower coasts in a rest.
- [ ] **Step 2: Run — RED.**
- [ ] **Step 3: Implement.** Model `splitAvgPace` as the interval's own
  running average (elapsed/distance for that interval), held at its final
  value through the rest and reset at the next work start.
  `restDistanceMeters` accumulates during a rest and resets at work start.
- [ ] **Step 4: Correct the TWD model** (`fake.ts:592-630`), which returns
  the current interval's distance and is contradicted by 2,363 committed
  frames: TWD is a session counter including rest meters, frozen during
  work, stepping at boundaries. Getting this wrong does not corrupt a
  displayed number — we no longer display TWD — but it makes
  `recordTwdVerdict` log divergence on every fake session, which is noise in
  the one log a walk reads.
- [ ] **Step 5: Green; `pnpm test --project client`; lint; typecheck.**
- [ ] **Step 6: Commit** `git commit -m "test: the fake stops zero-filling the two numbers this phase is about"`.

---

### Task 2: One monotone answer to "which interval is this?" (the triad core)

**Files:** `app/src/monitor/driver.ts`, its type, `driver.test.ts`.

**Interfaces:**
- Produces: an emitted frame whose interval referent never goes backwards
  while a session runs, plus `splitAvgPace` carried through.
- Consumes: the existing stale-count rest clamp's own `max(seen)` reasoning
  (`driver.ts:1870-1887`) — reuse it, do not invent a second rule.

- [ ] **Step 1: Write the failing replay test.** Replay
  `walk-2026-08-16/session-2-wu-4unequal.jsonl` through the driver and
  assert the emitted referent is **monotone non-decreasing** across the
  whole session. This fails today: 4 of the 5 committed rests begin with a
  frame one interval behind, for 450-540 ms. Assert the specific frames by
  sequence so the test names the defect rather than a property.
- [ ] **Step 2: Run — RED**, and record the actual lagging frames in the
  task report. If it does NOT fail, stop and report: either the capture or
  the emission rule is not what the spec's evidence says.
- [ ] **Step 3: Implement.** Apply the existing clamp to the emitted
  `intervalIndex` at `driver.ts:1989`, so the field the surface reads gets
  the protection the register key already had. Carry `splitAvgPace` onto the
  frame.
- [ ] **Step 4: Guard the other direction.** Add a test from the same
  capture that at the first frame of each work start the average belonging
  to the PREVIOUS interval is not attributed to the new one (the
  carry-over the delta pass measured at 450-540 ms).
- [ ] **Step 5: Prove no regression in the register work.** The whole of
  `registerReplay.test.ts` must stay green — that suite is Phase CR2's
  guarantee that the meters number is right, and this task edits the file it
  guards.
- [ ] **Step 6: Commit** `git commit -m "fix: the interval a frame names stops going backwards at boundaries"`.

---

### Task 3: The model — AVG, the rest verdict, the referent-driven target

**Files:** `app/src/workout/connected/surfaceModel.ts`, `surfaceModel.test.ts`.

- [ ] **Step 1: Write the failing tests**, one per row of the spec's states
  table, built from real seeded programs (not hand-minimal phases):
  work with a split target (AVG plain ink, unjudged), work with an effort
  target, warm-up (never judged), free piece, rest after a completed
  interval (AVG judged against THAT interval's target), rest before any
  interval completes, referent mismatch (AVG absent), finished/idle (AVG
  absent — `intervalIndex` is `null` and today's `?? 0` would pair the
  warm-up's target with the last interval's average), zero average
  (absent), stale.
- [ ] **Step 2: Run — RED.**
- [ ] **Step 3: Implement**, with `ON_TARGET_BAND_SECONDS = 0.5` exported as
  a named constant. Direction reuses the house rule's sign convention
  (`summaryModel.ts:208-224`); the on-target state is new and reachable only
  at rest.
- [ ] **Step 4:** Green; per-file coverage for `surfaceModel.ts` at the bar.
- [ ] **Step 5: Commit** `git commit -m "feat: the average tells you how the interval went, once it is true"`.

---

### Task 4: The pane — the baseline row and the counter on the bar

**Files:** `PaneLive.tsx`, `index.css`, `PaneLive.test.tsx`, frozen
`connected-*.html` fixtures.

- [ ] **Step 1: Failing render tests** — `TGT 2:13.0 · AVG 2:11.8` on the
  baseline row; `3,842m` at the right end of the progress-bar row with the
  bar flexing and the counter `flex: none`; both orientations; the judged
  colour present at rest and absent while rowing.
- [ ] **Step 2: Run — RED.**
- [ ] **Step 3: Implement** to the handoff's geometry (`README-4a-amendments.md`
  §1 and §2: label 15px/0.1em, value 34px/−0.03em, 12px label→value gap, 8px
  before AVG; counter 22px/0.02em, 14px gap, vertically centred on the 6px
  bar).
- [ ] **Step 4:** Regenerate the six frozen fixtures; grep for any dead class
  names; green.
- [ ] **Step 5: Commit** `git commit -m "feat: the pane shows the metres and the interval's own average"`.

---

### Task 5: The exit criteria that can run without hardware

**Files:** a replay test file beside `registerReplay.test.ts`;
`e2e/design.spec.ts`.

- [ ] **Step 1: Criterion 1** — replaying `session-2-wu-4unequal.jsonl`, the
  displayed total equals the machine's own session meters **at sampled
  instants mid-work and mid-rest**, not at the end. Assert at named
  sequence numbers; an end-of-session equality passes for every broken
  implementation and must not be the test.
- [ ] **Step 2: Criterion 3** — the AVG shown during a rest equals the
  interval that just finished, by value, ±0.2 s against the replay's own
  boundary record. **Sample the FIRST resting frame explicitly**, since that
  is where the lag lives.
- [ ] **Step 3: Criterion 4** — a zero average renders nothing, against the
  34 zero frames the same capture carries.
- [ ] **Step 4: Mutation-probe each of the three** — revert the clamp, drop
  the zero rule, swap the judged target to the next interval — and record
  which named test goes red for each.
- [ ] **Step 5: Computed-style e2e** for the two new cells, and screenshots
  re-captured with a NON-ZERO average and total (Task 1 is what makes this
  possible). Open the images and look.
- [ ] **Step 6: Full gates**, then commit
  `git commit -m "test: the numbers are checked mid-session, where the bugs live"`.

---

### Task 6: The walk (James + a real PM5)

- [ ] **Step 1:** `VITE_ENABLE_FAKE_MONITOR=1 pnpm ios:build && pnpm
  ios:open` — the flag is for the diagnostics readout, not the fake, which
  a native build cannot reach.
- [ ] **Step 2:** A rest-bearing program with unequal intervals (the
  keystone `x2 / w 250m 6k @24` has no rests and **cannot exercise the
  verdict at all** — 0 resting frames in 286).
- [ ] **Step 3:** One instruction at a time, hardware-walk pacing:
  (a) **photograph phone and monitor in one frame, mid-work** — criterion 2;
  (b) the same **mid-rest**, where the two totals diverge if anything is
  wrong; (c) read the AVG at the start of a rest and say whether it matches
  the interval just rowed; (d) does the verdict colour appear only at rest;
  (e) an interval longer than 500 m, to settle whether `splitAvgPace` is
  still our interval's average when the PM5 might split it.
- [ ] **Step 4: Riding along, unrelated to this feature:** a *shallow*
  off-horizontal drag starting inside the grid rows, and report whether it
  pages. This settles whether Phase CS's diagonal case was WebKit or our own
  45° rule; the console will name a `pointercancel` if one fires.
- [ ] **Step 5:** Record medium, **build number and iOS version** — the
  fields CS's walk record omitted twice.
- [ ] **Step 6: Disposition.** A wrong number on either photograph stops the
  phase: the numbers do not ship until the frame agrees.

---

### Task 7: The PR

- [ ] **Step 1:** Push; PR titled "The interval's own average, and the
  session's metres". Human-first body: outcome line, then bullets (what a
  rower now sees, that the verdict waits for the rest and why, the r0
  limitation with its number, what the walk verified).
- [ ] **Step 2: TRIAD — the PM final gate runs on this PR.** Present its
  verdict with the PR and STOP. No merge without James's word.
