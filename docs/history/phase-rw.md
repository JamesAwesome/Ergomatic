# Phase RW — Row without a baseline (archived at close, 2026-09-07)

A RECORD, not a backlog. Opened and closed on 2026-09-07 across three PRs
(#333 durations, #335 the ladder, #338 the stored skip); released in
v0.42.0. The live items this phase left behind were lifted into ROADMAP's
open-item register before archiving, and the ROADMAP ledger row is the live
record.

Residuals that outlived it, for the reader who follows a link here:
- **Ask for both baselines at the 7 s offset** (James, 2026-09-07) — the
  ruling on the partial-pair state this phase surfaced. In the register.
- **Phase DE PR 3's migration** must be regenerated off post-RW main; the
  warning lives in that phase's own row, not here.

---

## Phase RW — Row without a baseline

**Status:** OPENED 2026-09-06. Spec
`docs/superpowers/specs/2026-09-06-row-without-baselines-design.md`, brainstormed
with James the same day. PM open gate PASS WITH CONDITIONS 2026-09-06, all
folded into the spec (three consumers that DO branch, the three-PR cut, one
tag at close). Anchor pass and `/harden` RUN 2026-09-06; **Gate 0 APPROVED
2026-09-07** (`docs/design/rw-gate0/`). PR A in flight. PR C is **TRIAD**
(stored shape). **M.**

**Goal:** every workout is rowable with no baseline set. Where a split would
appear the rower reads STEADY · MODERATE · HARD · ALL OUT, derived from the
step's own pace ref; `EASY` is retired as a work word (James: easy is what
rest is). Durations still show, distance ones priced off a stated assumed
2:30/500m and marked `~24′`. The doors card gains a stored, reversible
"Row without one for now"; a one-line "No baseline set · Set one up" row
stays on Today until a baseline exists.

**Why now:** it is the register's "Row without a baseline set" item (James,
2026-08-23), half-delivered by Phase JR's Just Row door. It does NOT itself
unblock a stranger (the proven blocker is deny-by-default sign-up,
`server/auth/signin.ts:33`); it is M-sized and keeps a domain change out of
an L auth wave, so Wave A's "rows a row" clause becomes reachable with no
domain work inside Wave A. Wave A's exit cites this phase for that clause.

- [x] **PR A — durations.** `estimateMinutes` prices null baselines off an
      assumed 2:25 2k / 2:32 6k pair (the recommend table's most common
      cell) through the existing `estimationSplit` (so `min` prices at
      2:52, stated in spec §4); `~24′` on Library, Today,
      detail and the Builder; the `estMinutes: 0` placeholder and
      `durationsUnknown` retire; the time filter runs on real numbers.
      Removes no gate. **S**
- [x] **PR B — the ladder and unblocking.** `intensityWord(ref)` in
      `domain/pace.ts` (2k-equivalent thresholds, exported); `phases(steps,
      null)` emits an effort-kind phase carrying its `ref` instead of
      throwing; the compiler, Timer and judge verified to need no branch;
      **the log seed, `pieceList` and the Builder DO** (spec §1.2); every
      Start/Connect/Log gate and the Countdown redirect go; every `EASY`
      becomes `STEADY`. Gate 0 captures, PM final gate (a split becomes a
      word). **M**
- [x] **PR C — skip.** `preferences.baselines_skipped` (additive route), the
      card line, the Today return row (a button that clears the flag: the
      doors have no standalone route), `DELETE /api/baselines` clears it
      server-side. Lifetime table in spec §3.2. TRIAD. **Migration index
      collides with Phase DE PR 3 (scheduled 2026-09-12, same table, also
      `0026`): whichever merges second regenerates off new main first.** **S**
- [x] Notes PR and **one tag at phase close** (PM ruling, 2026-09-06): PR B
      alone would put `EASY` → `STEADY` in front of testers while the doors
      card still owns Today.

**Gates, spoken:** one antagonist anchor pass on the spec (thresholds, the
assumed pair's reach, the flag's lifetime); PM open, per-PR final, close;
Gate 0 on detail, Timer, a connected pane, Today both states, Library;
**no hardware walk** (a word phase's wire shape is the effort phase's, walked
since Phase 7C; PM may disagree at open).

**CLOSED 2026-09-07. Exit criteria, checked:** (1) MET — the e2e walk in
`library.spec.ts` takes a fresh no-baseline account through detail, Start,
Countdown, Timer and the manual form. (2) MET — the word renders on every
§2 surface, each pinned by a client or e2e test. (3) MET — `~` on a
distance workout and not a time one, pinned in `filters`/`Library` tests
and the `library-no-baseline` capture. (4) MET — the skip line writes, the
Today row clears, and `DELETE /api/baselines` clears server-side (real
Postgres, `baselineReset.integration.test.ts`); the e2e RELOAD is the
oracle that the write is server-side, and its mutation was run.
(5) MET — the grep returns 62 hits, all in spec §2.9's three classes.
(6) MET — one tag, v0.42.0.

**Exit as originally written (each clause names its oracle):** (1) on web e2e, a fresh account
with no baseline opens a split-ref workout and Start, Log it after and the
web Connect path (the fake monitor is web-only; the native path is covered
by the compiler test plus the next walk's added observation) all proceed;
(2) the word renders on every surface in spec §2: detail step rows, Timer,
the connected pane, Today's card, the Builder's split slot, each pinned by
a client or e2e test; (3) `~` appears on a distance workout's duration on
Library, Today, detail and Builder, and not on a time workout's; (4) the
skip line writes the flag, the Today row clears it, and the baselines reset
clears it server-side (integration test); (5) `grep -rn "EASY\|Easy\b"
app/src app/domain app/e2e` returns 62 hits (measured 2026-09-07) and every
one falls in the three classes spec §2.9 names — the different `EFFORT_WORDS`
axis, Phase WU warm-up history, and the bulk grammar's lowercase `easy`
token — with any hit outside them named and ruled at close. **The earlier
wording of this clause was unrunnable:** it promised the grep would return
the bulk token "in `domain/bulk.ts`", and `grep -rni easy app/domain/bulk.ts`
returns zero (the token is lowercase and lives in the test fixtures, which a
case-sensitive grep cannot return).

## Phase LP — Logbook parity: every number Concept2 shows, and the same number

**Status:** OPENED 2026-09-06 (James: "show everything that Concept2's
logbook shows, with the exception of weight class … be absolutely certain
our numbers match Concept2's"). Spec
`docs/superpowers/specs/2026-09-06-logbook-parity-design.md` (rev 2.1);
mockups `docs/design/logbook-parity/`. **TRIAD twice** (stored shape in
PR 1, wire meaning in PR 2). **M.** **PR 1 BUILT 2026-09-07** on
`phase-lp-logbook-parity` (plan
`docs/superpowers/plans/2026-09-06-logbook-parity-pr1.md`, inline shape):
Gate 0 approved on artboard 03; §3.1 ruled "logbook formula"; the four
session fields ride `machine_summary` jsonb, not columns, on a measured
DBA benchmark
(`docs/superpowers/research/2026-09-07-machine-summary-jsonb-vs-columns.md`).
**PR 2 BUILT 2026-09-07** on `phase-lp-pr2-upload` (plan
`docs/superpowers/plans/2026-09-07-logbook-parity-pr2.md`, inline shape;
spec rev 2.5 on the re-fetched API rows): antagonist DELTA pass RUN
(REVISE → folded: the retry-without-`workout` fallback, interval
`rest_distance` 0, drag 1..255, the 158-of-300 trailing-rest finding and
the two walk read-backs it adds); `/harden` SKIPPED, spoken — the same
inline shape as PR 1, the review half covers its blocks; whole-branch
review RAN (REQUEST CHANGES → closed at `8e19cac8`); PM final gate RAN
(PASS WITH CONDITIONS, five, none code — closed). §6's "verification
spec's record reconciled" needs NO edit, said here so it is not read as
skipped: `2026-09-05-concept2-verification.md`'s two "rest is untouched"
sentences are scoped to THAT PR's own diff and stay true of it; PR 2's
`rest_distance` source switch and the interval-level rest fields are
outside the code's checked set (date, time, distance, workout_type,
machine type), so the code's record stands. PR 2 needs NO Gate 0 of its
own: the only saved-row figure it moves is the strip's REST m, from a dash
to the number artboard 03 ALREADY drew — the approved design is satisfied,
not changed (PM #332). Merge on James's word; the walk on the flag-flip
trip.
Gates on PR #327: `/harden` SKIPPED, spoken — the plan was executed
inline in full, so its paste-test precondition and every block both
lenses read are committed code, and the review half covers them; the
whole-branch review RAN (REQUEST CHANGES → all code findings closed at
`76a6b18b`, execution record in the plan); PM final gate RAN (PASS WITH
CONDITIONS, all four record-side, closed). Owed before the next TAG
(PM #327 C4, amended by PM #332 C3): the phone captures — fresh + a real
old machine row, both orientations, ASK before installing — taken on a
build that carries PR 2, because PR 2 fills the strip's REST m column a
v0.41.0 capture would document as a dash; and the production count of
rows clearing the tier-A gate. (v0.41.0 was tagged 2026-09-07 with the
captures still owed; the tag went out on the e2e/web gates, and the phone
half now rides the PR 2 tag.)

**Goal:** a rower who opens the same piece in our app and in the Concept2
logbook after an upload reads the same numbers — per split: watts, cal,
cal/hr, HR, stroke rate; per session: avg stroke rate, target rate, avg
power, calories, avg cal/hr, rest distance, drag factor.

**Shape:** PR 1 keeps every 0x0038 field the decoder already reads
(calories, cal/hr, watts, drag, work/rest HR) and adds 0x003A's total
calories / watts / avg calories to the record; renders six hero tiles and a
sideways-scrolling **MACHINE SUMMARY** table under today's INTERVALS table
(layout B + B, chosen in the visual companion); old machine rows render
`—`. PR 2 extends `buildC2Payload` to everything the logbook API accepts
(`workout.intervals[]` — never `splits[]`, every programmed piece is
VariableInterval — with calories, HR, stroke rate, rests and per-interval
targets; result-level calories, drag, HR set, the PM5's rest distance),
all or nothing on the array and with a retry-once-without-it fallback,
because Concept2 validates the array and says not what for. Then one
walk: the same piece photographed in both apps, every cell compared, a
LAST-interval rest included.

**Closes:** the "Session calories" open item — settled at the desk on the
committed corpus: per-split 0x0038 calories sum to 0x003A's Total Calories
on 9 of 9 captures. **Does NOT absorb** the "say which number this is"
design pass (rev 1 claimed its summary half; James's 2026-08-31 ruling was
ONE gate for the whole thing) — LP adds six work-only tiles above the
rest-inclusive chart, which that pass will have to reconcile.
**Opens one row:** the PM5 sends 0x0038 per 5-minute auto-split for a Just
Row (`walk-2026-08-31-justrow`, two frames) and the record stores
`steps: []` for it — nowhere to keep them; LP renders a Just Row's tiles
and no strip. A later phase gives those splits a home — the register row
"A Just Row's 5-minute auto-splits have no home" is that owner.

**Gates:** antagonist anchor pass RUN 2026-09-06 (REVISE → rev 2: the
0x003A rest-time field reads 0 on 9/9 captures and is struck; the wire's
cal/hr is the PM5's own formula, not the logbook's; watts derive from
time/distance, not the tenths pace; the photograph after our upload is a
mirror for every uploaded field, so the PM5's own screens are the stored
half's oracle); PM open RUN (PASS WITH CONDITIONS, build now — the driver
discards these fields every session with no backfill); PM close on the
walk; PM final gate on each PR; **Gate 0** = the composed artboard
(`docs/design/logbook-parity/03-chosen-composed.html`) approved first, then
the phone (fresh AND a real old machine row, both orientations, beside
v0.39.2; the logbook-vs-PM5 watts/cal-hr choice on the option list with
measured deltas). Spec approved by James 2026-09-06 "after fold ins".

**Exit:** both PRs merged; the walk's side-by-side photographs committed
with no unexplained cell; release note in rower words (spec §8).
