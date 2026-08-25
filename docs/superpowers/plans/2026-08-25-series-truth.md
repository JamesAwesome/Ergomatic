# Series Truth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the stored series losing whole intervals on distance-interval pieces with rests: fix the state-9 attribution poison at source, make the driver the single deriver of per-frame interval attribution, and make any future backward-clock drop loud.

**Architecture:** The driver already resolves each frame's interval key through its register map and open-on-reset guard; it now (a) mirrors that guard's correction for ephemeral state 9 as it does for state 8, and (b) emits the resolved key on every `MonitorFrame` as `attributedIntervalIndex`. The series recorder deletes its own key derivation and consumes the field. A strictly-backward bucket counter surfaces through the hook's ring at close.

**Tech Stack:** TypeScript domain codecs (`app/domain/monitor/pm5/`), the driver + recorder in `app/src/monitor/`, Vitest projects unit/client.

**Spec:** `docs/superpowers/specs/2026-08-25-series-truth-design.md` — twice-shaped (antagonist full pass BLOCKed the original B and C; the revision is binding). Read §A/§B′/§C′/§D/§E before any task.

## Global Constraints

- TRIAD (number meaning + stored shape). Failing test first; per-file coverage for every touched file; `pnpm e2e` before done (src/ touched).
- DELETE, don't supplement: after Task 3, `grep intervalIndex app/src/monitor/seriesRecorder.ts` returns only the consumed `attributedIntervalIndex` (spec exit criterion 5).
- C′ predicate is STRICTLY backward (`bucket < lastEmittedBucket` after the equal-bucket decimation return, or equivalently count only `<`) — `===` is normal 1Hz decimation and must NOT count. Name: `backwardBucketCount`. Client-side only — NO new `SeriesData`/server field (the route's reconstruction would silently drop it; say so in a comment). The ring entry is written by the HOOK at `closeRecord` time (the driver never sees the recorder).
- The synthetic fixture asserts ONLY ring-sourced numbers (spec §E): ~230 samples, t→230.5s, two rest runs, final d within 1m of 742.7, `backwardBucketCount === 0`, interval-2 samples exist. NEVER assert pace values the fixture invented. Include BOTH state-9 ticks (elapsed 67.91 count-unincremented is wrong — read the ring: 67.91 is seq 27 with state 9 and count already advanced by seq 28's refusal record; model the two ticks as the ring shows: state-9 at 67.91 then the 68.02 tick that the driver refuses).
- Run tests as `pnpm test --project unit|client` (never bare vitest); grep "Test Files" not just "Tests".
- `git rev-parse --show-toplevel` before every commit (worktree `.claude/worktrees/series-truth`).

---

### Task 1: domain — the ordinal and the frame field

**Files:**
- Modify: `app/domain/monitor/pm5/parse.ts` (the exported-ordinals block, ~423-448)
- Modify: `app/domain/monitor/types.ts` (`MonitorFrame`, beside `rawIntervalCount`)
- Test: `app/domain/monitor/pm5/parse.test.ts` (tiny: the constant maps to "rowing" in `WORKOUTSTATE_TO_STATE` — assert via the existing state-mapping test idiom)

**Interfaces:**
- Produces: `export const WORKOUTSTATE_INTERVALWORKDISTANCETOREST = 9;` and `MonitorFrame.attributedIntervalIndex?: number` (optional-additive; doc comment: "the interval key the driver's OWN register logic resolved for this frame, after its open-on-reset guard — the single deriver of attribution (series-truth spec §B′); consumers key on THIS, never on `intervalIndex` + elapsed").

- [ ] Step 1: failing test — the exported constant equals 9 and `WORKOUTSTATE_TO_STATE[WORKOUTSTATE_INTERVALWORKDISTANCETOREST]` is `"rowing"` (matches how the other exported ordinals are pinned; if no such pin exists, assert through `parseGeneralStatus` on a status byte 9 frame). Run: `pnpm test --project unit -- parse.test` — FAIL (not exported).
- [ ] Step 2: add the export beside `WORKOUTSTATE_INTERVALWORKTIMETOREST` with a doc comment citing the spec + ring seq 27; add the `MonitorFrame` field with the doc comment above. Run tests + `pnpm typecheck` — PASS.
- [ ] Step 3: commit `feat: the distance-boundary ordinal is named; the frame can carry its attribution`.

### Task 2: driver — A (state-9 mirror) + B′ producer (emit the key)

**Files:**
- Modify: `app/src/monitor/driver.ts` — the mirror gate (~2207, `if (status.workoutState === WORKOUTSTATE_INTERVALWORKTIMETOREST)`) and the frame-emission site (`maybeEmitFrame` / wherever `rawIntervalCount` is attached — grep it) so every emitted frame carries `attributedIntervalIndex`.
- Test: `app/src/monitor/driver.test.ts` (mirror), plus the SYNTHETIC EXIT-7 ORACLE in `app/src/monitor/sessionTotals.test.ts`'s harness style (or a new `seriesTruth.test.ts` beside it) — see Step 1.

**Interfaces:**
- Consumes: Task 1's constant + field.
- Produces: every `MonitorFrame` the driver emits carries `attributedIntervalIndex` = the key its register logic used for that frame (the open key when a refused-open merged, the raw resolved index otherwise; during rests, the key the `resting → machineIndex − 1` rule resolves — i.e. exactly what the accumulator used). Task 3 relies on the field being PRESENT on every frame with an open run.

- [ ] Step 1: TWO failing tests. (a) Driver-level: replay the poison shape (the `tick(h, {...}, machineIntervalCount)` harness from `sessionTotals.test.ts` ~1494-1560): interval 1 rowing to 67.9s/250.2m, then a state-9 tick at 68.02s/250.6m with machine count 1 — assert the emitted frame's `intervalIndex` is 0 (the mirror) AND `attributedIntervalIndex` is 0. Expected today: `intervalIndex` 1 — FAIL. (b) THE ORACLE: the full synthetic exit-7 sequence (interval 1 → both boundary ticks per the ring → advancing rest to ~129.5s → interval 2 reset to 0 → 56.2s/250.3m → trailing rest to 230.5s) through the REAL driver feeding the REAL `createSeriesRecorder` via the frames the driver emits; assert the spec §E healthy shape (constraints block). Expected today: ~129 samples, t→~196 — FAIL. Run both red: `pnpm test --project client -- driver seriesTruth`.
- [ ] Step 2: implement. The mirror: `if (status.workoutState === WORKOUTSTATE_INTERVALWORKTIMETOREST || status.workoutState === WORKOUTSTATE_INTERVALWORKDISTANCETOREST)` with a comment quoting the old comment's own reservation and citing ring seq 27/28. The emission: attach `attributedIntervalIndex` where `rawIntervalCount` is attached, sourced from the same value the accumulator's register logic used for this frame (read how `emittedIntervalIndex`/`openKey` flow; the emitted value must EQUAL what the registers used — that identity is the whole point; if the two diverge anywhere except the now-mirrored tick, report it, don't paper over it).
- [ ] Step 3: test (a) passes; test (b) may still fail if the recorder ignores the new field (it does, until Task 3) — mark (b) with a `.fails` modifier or move its assertion to Task 3's step if the harness can't express it; PREFER: land (b) in Task 3 and keep only (a) here. Full `pnpm test --project unit --project client`, lint, typecheck — green (the two old mirror regressions untouched).
- [ ] Step 4: commit `fix: state 9 mirrors like state 8, and the frame says which interval the driver meant`.

### Task 3: recorder — consume the attribution, delete the derivation, C′

**Files:**
- Modify: `app/src/monitor/seriesRecorder.ts` — key logic (~217-224: the `currentKey` raise) replaced by consuming `f.attributedIntervalIndex`; the bucket return (~250) gains the strictly-backward counter; the result object exposes `backwardBucketCount`.
- Test: `app/src/monitor/seriesRecorder.test.ts` + the Task-2(b) oracle + the two pinned capture replays.

**Interfaces:**
- Consumes: `MonitorFrame.attributedIntervalIndex` (present on every driver-emitted frame; the recorder treats an ABSENT field as "no key change" and says so in a comment — only non-driver test fixtures can produce it).
- Produces: recorder result gains `backwardBucketCount: number`. Task 4's hook reads it.

- [ ] Step 1: failing tests. (a) The Task-2(b) exit-7 oracle (now expressed end-to-end) — FAIL before this task's change if Task 2 left it red, else write it here red-first against the recorder's old derivation by feeding frames whose `attributedIntervalIndex` disagrees with `intervalIndex` (the poison shape) and asserting the attribution wins. (b) Forced strictly-backward sequence (hand-built frames whose work clock genuinely reverses) → `backwardBucketCount > 0`; ordinary same-bucket decimation frames → count stays 0. (c) The two committed captures (`session-1-keystone`, `session-2-wu-4unequal`) replay through driver→recorder and produce BYTE-IDENTICAL series to their current output, with the consumption branch instrumented (a spy/counter in the test proving the new path RAN) — green-vs-never-ran distinguishable per exit criterion 2.
- [ ] Step 2: implement — replace the `intervalIndex > currentKey` raise with `attributedIntervalIndex` consumption (registers keyed the same way; the max-merge semantics unchanged); count strict backwards; expose the count. DELETE the old comparison — exit criterion 5's grep must pass.
- [ ] Step 3: all tests green; run the full unit+client projects; check per-file coverage on seriesRecorder.ts.
- [ ] Step 4: commit `feat: one deriver — the recorder keys on the driver's own attribution, and backward clocks are counted`.

### Task 4: the ring entry, honest headers, and the docs

**Files:**
- Modify: `app/src/monitor/useMonitorSession.ts` — at `closeRecord` (~1463-1477), when the recorder's `backwardBucketCount > 0`, one ring entry: `series-backward-buckets: N sample(s) refused because the work clock went backwards - attribution defect upstream, series is missing data (series-truth spec C')` (plain hyphens).
- Modify: `app/src/log/traceModel.ts` header (~31-46): both axes conditional-on-rower truth (spec §D wording).
- Modify: `ROADMAP.md` — Phase RC: the series-truth item (fix shipped, prospective-only, displacement repair possible-but-declined); the 2×Nm rNN lab-capture walk item; the axis-quantity question queued; correct the stale "rides the next log-surface PR" line (~3062-area) AND update Phase LL's boundary-fold item (~2124) to note B′ supersedes its recorder-side half (the driver is now the single deriver) while its gap-undercount observation remains driver-owned.
- Test: hook test for the ring entry (fires once when nonzero, silent at zero).

- [ ] Step 1: failing hook test (drive a session whose recorder reports a nonzero count via the forced-backward fixture; assert the ring entry text appears once; a clean session asserts absence). Run red.
- [ ] Step 2: implement the entry + the header rewrite + the ROADMAP edits (each ROADMAP addition a few lines, checkbox style).
- [ ] Step 3: green; full suites; `pnpm e2e` (src touched — run once for the whole branch here); lint/typecheck.
- [ ] Step 4: commit `feat: backward clocks reach the ring; the chart's axes stop claiming to be work clocks`.

---

## Self-review record

- Spec coverage: A (T2), B′ producer (T2) + consumer/deletion (T3), C′ (T3 count + T4 ring), D (T4), E (T2b/T3a oracle, both state-9 ticks, ring-sourced assertions only), exit criteria 1-5 mapped (1→T2/T3 oracle, 2→T3c instrumented pins, 3→T3b+T4, 4→T4, 5→T3 grep).
- No placeholders; harness names and line anchors verified against the diagnosis and antagonist pass this same day.
- Type consistency: `attributedIntervalIndex` defined T1, produced T2, consumed T3; `backwardBucketCount` produced T3, consumed T4.
