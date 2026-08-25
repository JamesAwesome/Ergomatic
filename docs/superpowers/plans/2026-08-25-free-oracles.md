# Free Oracles Implementation Plan (RC-9 a/c/d)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start reading the two independent numbers the PM5 already sends us, stop reading the one that only ever agreed with itself, and correct the wire claim we got wrong.

**Architecture:** Three ring-only diagnostics at the driver seam. Nothing stored, nothing rendered, no release-note clause: every output here is a line a hardware walk reads. One new narrow parser (0x003A's rest distance), one retired verdict, three documentation corrections.

**Tech Stack:** `app/domain/monitor/pm5/parse.ts` (pure codec), `app/src/monitor/driver.ts` (verdicts + ring), `app/src/monitor/transports/fake.ts` (test integrity), Vitest unit/client.

**Spec:** `docs/superpowers/specs/2026-08-25-free-oracles-design.md` — written FROM a pre-spec antagonist oracle-soundness pass that decoded all seven captures byte-level. Its evidence base carries every number below; read §1/§2/§3 before any task.

## Global Constraints

- **SCALE TRAP, the single most likely defect here:** 0x0032's `averageSplit` is **0.01 s/lsb**; 0x0039's Avg Pace is **0.1 s/lsb**. Both are already descaled by `parse.ts` (to SECONDS) — so compare descaled values only, and any test that would pass under a 10× error is not a test. State the two scales in a comment wherever both appear.
- (a) compares the last WORK-state 0x0032 `averageSplit` against **`monitorAvgSplit`'s quotient over the recorded actuals** — NEVER against the rendered tier-A hero (post-RC-5 that hero IS 0x0039's own field; comparing them is machine-vs-machine, and they differ by 0.47 s).
- (a) SUPPRESSES, with the reason in the ring entry, when any actual is excluded from our quotient (`index === null`, `elapsedSeconds < MIN_MEASURABLE_ELAPSED_SECONDS` = 1, legacy warm-up) or when the run carries a summary-filled actual (`deriveFinalIntervalFromSummary` fired) — those runs legitimately differ.
- (a)'s band is **1.0 s**, and the comment states WHY: measured median disagreement 0.07-0.20 s across seven captures, plus an unexplained terminal step of up to 1.02 s.
- Everything is ring-only: no stored field, no UI, no `SeriesData`/server change, no release-note clause.
- Realistic fixtures only — the captures' own numbers, never invented round ones.
- Run tests as `pnpm test --project unit|client` (never bare vitest); grep "Test Files" not just "Tests".
- `git rev-parse --show-toplevel` before every commit (worktree `.claude/worktrees/free-oracles`).

---

## File map

- `app/domain/monitor/pm5/parse.ts` — `parseAdditionalSummaryRestDistance` (Task 3)
- `app/src/monitor/driver.ts` — retire `recordTwdVerdict` (Task 1); the (a) verdict (Task 2); the (d) verdict (Task 3); doc-comment correction (Task 1)
- `app/src/monitor/transports/fake.ts` — stop fabricating `averageSplit` (Task 2)
- `app/src/monitor/continuity.ts` — reconcile comments naming the retired predicate (Task 1)
- `docs/monitor/pm5-interface-notes.md` — item 25's three corrections (Task 4)

### Task 1: retire the TWD verdict, correct its premise

**Files:**
- Modify: `app/src/monitor/driver.ts` — the call site (~2427), `recordTwdVerdict` itself (~3073) and its doc comment, plus the suppression predicate
- Modify: `app/src/monitor/continuity.ts` — comments naming `recordTwdVerdict`'s predicate (~43, ~55, ~196)
- Test: `app/src/monitor/driver.test.ts` (and any test asserting a `twd-verdict` ring entry — grep it)

**Interfaces:** Produces nothing. Removes the `twd-verdict` ring entry and its suppression predicate.

- [ ] Step 1: failing test — assert NO `twd-verdict` entry appears in the ring for a capture replay that produces one today (invert the existing assertion; run it red against current code).
- [ ] Step 2: remove the call site, the function, and the suppression predicate. **Reconcile, do not orphan:** `continuity.ts` references the predicate by name in three comments — rewrite them to describe what actually guards continuity now, citing the spec. Where the doc comment claimed TWD "reports the GOAL there, not the distance actually rowed (confirmed PRIMARY)", replace it with the falsification and its evidence: `session-1-keystone-2x250r0` reads TWD 0 through interval 1 while 250 m are rowed, 250 through interval 2, 500 at WORKOUTEND; the pyramid ticks it one-per-metre through the rest (301→332); the two samples the old claim rested on are `pm5-session4b` ring seq 3 and 14, BEFORE `program()`'s writes at seq 7+.
- [ ] Step 3: green; `pnpm test --project unit --project client`; lint; typecheck. Grep the repo for `recordTwdVerdict` and `twd-verdict` — zero non-historical hits outside ROADMAP/ledgers.
- [ ] Step 4: commit `refactor: retire the TWD verdict, and say what the field actually reports`.

### Task 2: the live average-pace verdict, and the fake that would have faked it

**Files:**
- Modify: `app/src/monitor/transports/fake.ts` (~967: `averageSplit: e.currentSplit`)
- Modify: `app/src/monitor/driver.ts` — a new verdict recorded at the terminal transition, beside where `recordTwdVerdict` was
- Test: `app/src/monitor/driver.test.ts` + a capture-driven replay (follow `burstReplay.test.ts`'s harness for reading a committed recording)

**Interfaces:**
- Consumes: `raw.averageSplit` (0x0032, descaled to seconds by `parse.ts`), `run.recordedActuals`.
- Produces: one ring entry per run, `avg-pace-verdict`, carrying both numbers, the delta, and either the verdict or the suppression reason.

- [ ] Step 1: **fix the fake first** — `averageSplit: e.currentSplit` fabricates a field as a copy of the current split, so any fake-driven test of this verdict would be vacuous (third sighting of this shape; the ledger now treats it as a standing check). Model it as cumulative work-only across the scripted session, or drive the verdict's tests from a committed capture instead and say so in the report. State which you chose.
- [ ] Step 2: failing tests, all capture-derived:
  - a rest-bearing capture replay produces the entry, with both numbers and a delta inside 1.0 s (the pass measured medians 0.07-0.20 s; assert the capture's own value, not a round number);
  - a run with an excluded actual (null-index or sub-threshold) SUPPRESSES with its reason named;
  - a run where `deriveFinalIntervalFromSummary` fired SUPPRESSES (the fill builds our side FROM 0x0039);
  - the scale: a fixture whose expected value would be 10× off if 0x0032's 0.01 s/lsb were treated as 0.1.
- [ ] Step 3: run red; implement. Sample the **last work-state** 0x0032 (`workoutState ∈ {4,5}`), never the terminal frame's value — the terminal step is real (keystone 138.44 → 138.23; session-2 129.78 → 128.76) and unexplained. Ignore the 0.00 readings at an interval reset (**CORRECTED, fix round 1: 18 of them in session-2 alone, not a single frame** — design spec §1's own evidence base carries the seq list).
- [ ] Step 4: green; full unit+client; lint; typecheck; per-file coverage on the touched files.
- [ ] Step 5: commit `feat: the machine's own average pace finally gets read`.

### Task 3: the rest-distance oracle

**Files:**
- Modify: `app/domain/monitor/pm5/parse.ts` — a NARROW 0x003A reader (Total Rest Distance, offsets 12-14, 1 m/lsb) plus Interval Rest Time (15-16, whole seconds) for reporting only. `parse.ts`'s existing I5 ruling explains why 0x003A has no parser — **update that ruling's text rather than contradicting it silently.**
- Modify: `app/src/monitor/driver.ts` — the 0x003A handler (~4356 `noteSummaryHalf("0x003A", bytes)`) gains the decode + verdict
- Test: `app/domain/monitor/pm5/parse.test.ts`, `app/src/monitor/driver.test.ts`

**Interfaces:**
- Produces: `parseAdditionalSummaryRest(bytes): { totalRestDistanceMeters: number; intervalRestSeconds: number } | null` (null under 17 bytes). Task order: this is independent of Tasks 1-2.

- [ ] Step 1: failing parser tests with the two committed frames as literals, arithmetic in comments:
  - exit-7 walk seq 63 `88 35 03 0f 02 fa 00 02 20 00 b8 00 f2 00 00 00 00 a3 03` → offsets 12-14 = `f2 00 00` = **242**;
  - walk-2026-08-23 keystone seq 517 `78 35 1c 09 01 fa 00 02 1c 00 83 00 00 00 00 00 00 ef 02` → **0**.
- [ ] Step 2: run red; implement the narrow parser.
- [ ] Step 3: failing driver test — the verdict compares the decoded rest distance against `monitorRest`'s resolved metres (RC-1's stored pair where present) and records a ring entry; on the exit-7 shape it agrees at 242 vs our 242.7; on the r0 keystone it handles 0 without a false alarm. **Interval Rest Time is REPORTED, never gated on** — it reads 0 on both captures including the r60 walk, so we do not know if that is a firmware quirk or the programmed value; say exactly that in the comment.
- [ ] Step 4: green; full projects; lint; typecheck; coverage.
- [ ] Step 5: commit `feat: the rest metres get an oracle of their own`.

### Task 4: the record

**Files:**
- Modify: `docs/monitor/pm5-interface-notes.md` — item 25's three corrections
- Modify: `ROADMAP.md` — tick RC-9(a)(c)(d); record (b) as QUEUED with its reason (oracle-blind: one capture carries 0x0039 and it is the only one with zero rest; tautological where the fill fired) and its unblocking condition (a rest-bearing capture that survives to 0x0039 — the walk item already owed)

- [ ] Step 1: item 25's corrections, each citing its capture: (i) TWD is an ODOMETER of rowed metres (work + rest coast), not "a boundary accumulator of INTENDED work"; (ii) the histogram is 36 ws3 / 3 ws5 / 1 ws9 / 1 ws10, not "every one of those 41 ticks reads workoutState 3" — and the five exceptions are where the mechanism lives; (iii) the sample placed "mid the FIRST 250" is 12 s into interval TWO and is a 1.6 s transient that reverts (step-2 seq 822 → 831; pyramid seq 3255 → 3273), so record TWD's non-monotonic pre-commit overshoot.
- [ ] Step 2: the ROADMAP edits.
- [ ] Step 3: commit `docs: item 25 tells the truth about Total Work Distance`.

---

## Self-review record

- Spec coverage: §1 (Tasks 2), §2 (Task 1 + Task 4's item-25 half), §3 (Task 3), the queued (b) (Task 4). Exit criteria 1-5 map to Tasks 2, 1, 4, 3, 2 respectively.
- Type consistency: the new parser's return shape is defined in Task 3 and consumed only there.
- No placeholders; every fixture value is quoted from a committed capture with its seq number.
