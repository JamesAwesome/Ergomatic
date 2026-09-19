# Phase PS — career stats on the You tab (CLOSED 2026-09-19)

**Closed by James's word on 2026-09-19, together with Phases MT and DE, in one
doc-class PR.** Shipped in v0.46.0 (#411, #417) and v0.47.0 (#424). Close
record: `docs/closeouts/close-PS.md`. **This file is NOT
`docs/history/phase-ps.md`**, which holds the 6J-era sketch archived on
2026-08-28 and now points here.

**PM close gate: PASS WITH CONDITIONS, both met in the close PR.**
**Antagonist exit pass: the phase HOLDS; its exit criterion 6 is MET WITH
STATED LIMITS, not MET** — see the first block of the body, which says exactly
what James's logbook check established and what it did not. It ran against
the Concept2 SANDBOX and owes one re-run once production moves to the live
logbook (Wave E's exit).

**Two things that outlive this phase:** the question of what a test point
should say once its log is deleted is owned by Wave C PR 2 ("A rower can
remove a bogus test result") — which is ALSO discharging James's 2026-08-22
ruling that a remove/void answer gates any read path, because TEST TREND
shipped without one; if that row is ever rescoped, that ruling comes back with
it. And two rows left for "Small, queued" with their dates: the
`/api/stats/rows` cursor at 5,000 rows, and the history list's missing `steps`
tier.

The body below is the section as it stood at the close, verbatim except that
the criterion-6 block carries the limits both close gates required.

---

## Phase PS — career stats on the You tab

**EXIT CRITERION 6 — MET WITH STATED LIMITS, 2026-09-19 (the wording both
close gates required).** James compared You against his Concept2 logbook page
(`log-dev.concept2.com`, where his sends land). **LIFETIME: 128,660 m here;
Concept2's lifetime was not read, and is inferred equal to its season, since
all 26 of its results fall inside it. THIS SEASON: 128,660 m / 9:27:00 / 28
sessions (26 machine) here, against 91,175 m / 7:33:09.1 / 26 results there.**
The 37,485 m gap is NOT reconciled row by row. 49,635 m is simply
128,660 − 79,025 (the 26 listed Concept2 rows sum to 79,025 m) — a residual by
subtraction, not a second observation. What supports "never sent" is by WEEK,
read off the app's bar labels: its week of 17 Aug is 24,838 m against 935 m on
Concept2, because sending shipped around 1 September. The other 12,150 m is
the amount by which Concept2's tile exceeds its own listed scores — INFERRED
to be rest metres and UNTESTED: the app does post `rest_distance`, but nobody
summed it over those 26 rows, and recurring failure 11 records that a Concept2
ROW stores work only. Two axes are unexplained altogether: TIME (9:27:00 here
against 7:33:09.1, 1:53:51 apart) and COUNT. **Two agreements are exact, and only one of them is independent.**
Both AVG-PER-DAY figures divide by the same 142 days since 1 May (906 here,
642 there) — our season boundary and day count match Concept2's, which is the
one genuinely external agreement in the check. This week also reads 24,507 m
on both sides, row for row (5,588 + 5,000 + 1,954 + 8,451 + 3,514), but that
is a ROUND TRIP, not a measurement: `mapping.ts`'s `postedMeters` and
`domain/stats/rowContribution.ts` both read `row.machineWorkMeters`, so it
proves the send path transmits the number the stats path sums and that
Concept2 stored it unchanged — never that the metres are what the erg did.
**The two limits, named:** the row-level agreement is a same-column round
trip; and Concept2's LIFETIME was never read, and on a sandbox account
holding only what this app posted it could not have disagreed. **It ran
against the SANDBOX** — `log-dev.concept2.com`, which IS James's logbook page
for every row this app has sent (`C2_BASE_URL` defaults to it) — so it owes
ONE re-run after Wave E's exit moves production to the live logbook. Both counts reading 26 is a coincidence — the Concept2 list holds
development test posts (the 935 m rows, the 200 m and 500 m rows of 09/07)
and the app holds rows that were never sent. The three rows this phase filed
no longer block it: one is answered and ticked, two left for "Small, queued"
with their dates. **What remains is the close itself** — and its archive
cannot be `docs/history/phase-ps.md`, which already holds the 6J-era sketch.

**Status: OPEN 2026-09-12 — spec approved by James the same day; the three
phase-open gates (antagonist anchor, PM slate, DBA spec pass) ran at
`93b91d66` and are applied in PR 0 (spec §15). PR 0 LANDED #411 and PR 1
LANDED #417 the same day; v0.46.0 (build 977) RELEASED 2026-09-12 carrying
PR 1, so exit criterion 6 — James's eyeball check against his Concept2
logbook — is now RUNNABLE on that build (its `dies` stamp is on the Exit
paragraph below). PR 2 (the charts, plus James's two 2026-09-12 notes as
rulings 20-23 behind a Gate 0 addendum, spec §5.1) is #424: the phase is
CODE-COMPLETE when it merges and stays OPEN on criterion 6 alone, the only
check that is not our own arithmetic (RF11).** **TRIAD on PR 1** (a
number's meaning: every figure is a SUM over stored rows whose metres
already mean two things — fused before RC-5, work-only after, no marker).
**M.** · dies 2026-10-12 · a month from
opening; this phase was deferred once already ("after the strangers") and
its trigger — a tester with enough history for a trend to be honest — has
fired for James himself, so if PR 1 has not opened by then the phase is
being outvoted and that is his call to make, not a slide. Spec:
`docs/superpowers/specs/2026-09-12-career-stats-design.md`. Promoted from
the "After the strangers" list, whose PS line this section replaces (one
home per body of work); the 6J sketch and `docs/history/phase-ps.md` are
inputs, not the design.

**Goal:** a rower sees their career — a hero on You (LIFETIME and SEASON
metres over one work-time-by-type bar) that is itself the door to a stats
subpage with a date filter, totals in two columns (ALL ROWS and MACHINE),
rest, calories and average watts, metres per week, time by Erg Book type,
the season's cumulative curve with average metres per day and weekly
streaks, and the 2k/6k test trend. Every number equals the sum of what the
log already shows per row, computed
by ONE domain function (`app/domain/stats/`'s `rowContribution`) that the
log's own `buildHeroes` is refactored to call, so You and the log cannot
disagree. Nothing new is stored; nothing is imported from Concept2.

**What this phase deliberately does NOT do (James, 2026-09-12):** PBs,
the Million Metre Club, Concept2 import or catch-up metres, storing the
machine type (Wave E's "We never check WHICH Concept2 machine is
attached" row owns it), generated columns, an index or any migration — the
DBA measures and James rules; a stored-shape change is its own TRIAD row
outside PS, and the DBA's 2026-09-12 measurement found neither Wave E row
reachable from this route's shape (spec §4.3, §11). **The Concept2
integration is not production yet, so no number, label or empty state here
reads `verified`, `c2ResultId`, `c2UserId`, the link state or any Concept2
API; the MACHINE column keys on `source = 'pm5'` only, and Concept2
contributes only the season's calendar (May 1 to Apr 30, named by end year)
and vocabulary** — spec §7 invariant 12, gated by a key-set test on the
projection type and a case-insensitive text scan over the stats code
(§8.4). The RC-5 seam is accepted and counted (`storedTierRows`; the surface
line naming it was struck by ruling 19), never corrected.

- [x] **PR 0 — MERGED as #411 (`3137fb25`), ticked 2026-09-12. The spec,
      this section, and the DBA agent**
      (`.claude/agents/dba.md` + `dba-techniques.md` + `dba-ledger.md`;
      proposes, never writes; every verdict carries measured numbers).
      Gates, all RUN at `93b91d66` and applied (spec §15): antagonist ANCHOR
      pass on the spec (product shape HELD; 11 evidence/gate defects fixed),
      PM phase-OPEN gate (PASS WITH CONDITIONS, 6, all applied), DBA first
      pass on the `GET /api/stats/rows` query shape and growth (PASS WITH
      ROWS, 1 row). Docs-only, plus the `CLAUDE.md` three-agents paragraph
      (ruling 8).
- [x] **PR 1 (TRIAD) — MERGED as #417 (`f69871cb`), ticked 2026-09-12,
      released in v0.46.0. `rowContribution` + the `buildHeroes` refactor
      (mapping `endedBy ?? null`, proved with `tsc -p tsconfig.app.json`),
      `logbookWatts`/`logbookCalPerHour` MOVED into `app/domain/logbook.ts`
      with `src/session/logbookDerived.ts` re-exporting (no behaviour
      change; existing tests are the gate) plus an ESLint
      `no-restricted-imports` rule forbidding `app/domain/**` → `src/**`
      with a deliberate-import mutation proving it goes red,
      `GET /api/stats/rows` (additive, every row of the user, UNORDERED,
      slim per-row projection computed row-side so `steps` never crosses the
      wire; `totalCalories` as a narrow jsonb-path scalar), the adapter with
      its own `TZ`-pinned test (a negative-offset zone asserted in effect, an
      early-UTC instant on the 13th — `02:30Z`, 22:30 EDT — that New York
      still reads as the 12th, getters→`getUTC*` as the mutation; the first
      draft's `23:30Z` instant is the 12th in UTC too and could not bite), the time-by-type computation and a stacked-bar
      primitive under `src/charts/` (the hero needs both — Gate 0 ruling
      11), the You HERO as its OWN component `src/you/stats/YouStatsHero.tsx`
      (Gate 0's H3: LIFETIME / SEASON figures over one AN · AT · O2 · TR ·
      NO TYPE bar with a whole-percent chip legend and no caption (ruling
      18), 140 px portrait as shipped (`you.png` rows 120→259), ALL column,
      work metres; `You.tsx` passes it nothing) which IS the door — one
      focusable control named `Stats`, tapping anywhere opens `/you/stats`,
      and `.you-doors` gains NO STATS row (ruling 10) — `/you/stats` with the
      filter bar (ALL · SEASON · YEAR · MONTH · 30 DAYS · CUSTOM), the whole
      TOTALS group — METRES / TIME / SESSIONS in both columns, then REST
      METRES / CALORIES (Σ stored `totalCalories`) / AVG WATTS
      (`logbookWatts` of the RANGE's Σseconds ÷ Σmetres over machine,
      work-pair and steps rows only — ruling 6 — never a mean of per-row
      watts) under MACHINE, with NO prose on the page (rulings 18 and 19
      struck every caption, the seam line and the `n OF m` footnote
      included; the counts stay computed in the aggregate) — the subpage's
      TIME BY TYPE group (free once the hero exists,
      ruling 11), and the empty states: 0 rows with the filter bar hidden,
      1 row, and the MACHINE column's `NO MONITOR ROWS YET` with its REST /
      CALORIES / AVG WATTS rows hidden when no `pm5` row is in range (ruling
      16).** No pagination BY DESIGN up to the measured trigger (any user >
      5,000 rows; spec invariant 15, the cursor row below owns it). **PR 1's
      DBA gate runs the spec-pass protocol against the SHIPPED query (spec
      §9):** 1M rows seeded with users at 1k / 10k / 100k from the
      2026-09-07 `02-gen.sql`, medians of 5 plus `EXPLAIN (ANALYZE,
      BUFFERS)`, the real payload through the e2e backdoor with and without
      gzip, plan literals bytes/row ≤ 240 and 10k-user p95 ≤ 150 ms, the
      seam fixture carrying ≥ 1 stored-tier row; scripts committed under
      `docs/superpowers/research/2026-09-12-stats-rows/`. Gates: **Gate 0
      APPROVED 2026-09-12** on the rendered canvas
      (https://claude.ai/code/artifact/c8ad61d9-853b-4262-9051-032f90e90cf2;
      sources `docs/design/career-stats/`, every ratio computed in
      `contrast.json` — text ≥ 4.5:1 throughout and ≥ 6.69:1 bar the one NO
      TYPE caption, every data mark ≥ 5.29:1; eight rulings recorded as spec
      §14 9-16 and applied before the plan); `/harden` on the plan; the DBA
      gate above; the contract test `rowContribution ≡ buildHeroes` over
      every stored-log fixture plus a NEW work-pair-and-steps fixture the
      gate-order mutation can move, against output captured from `main`
      before the refactor; one test seeding through `POST /api/logs` (the
      tier-A row FUSED on purpose) and reading the new route (RF24); e2e
      seeding the Gate 0 seed itself (`seed.mjs`'s 13 log rows — its 6
      test rows ride PR 2 with the trend — clock and zone pinned to
      2026-09-12) and asserting `compute.mjs`'s
      figures as literals — lifetime 56,752 m / 3:59:39 / 13, season 43,012
      m, MACHINE 36,752 m, rest 718, cal 1,731, 176 W (RF7; the `8 OF 10`
      and `1 ROW PREDATES` lines were struck by ruling 19); PM final gate.
- [x] **PR 2 — MERGED #424 (`30fd5cc0`, 2026-09-13), released in v0.47.0;
      its box sat unticked until 2026-09-19. The remaining charts, all
      designed and approved at Gate 0
      (ruling 11): METRES PER WEEK (eight Monday-start bars ending at the
      range's last day, this week in `--ink`, the rest in `--ink-4` — Gate 0
      ruling 12 over the handoff's `#c9c3b2`, 1.73:1, recorded in
      `docs/design/DEVIATIONS.md`), the SEASON group (the cumulative curve
      May 1 → today, `AVG M/DAY` on C2's Honor Board definition, current +
      longest streak of Monday-start weeks labelled ERGOMATIC because
      Concept2 has no streak — never filtered), TEST TREND (2k and 6k split
      seconds over date from the existing `GET /api/test-history`, faster
      is up — the ONE figure that keeps a point whose log row was deleted,
      because `test_history.session_log_id` is `ON DELETE SET NULL` on
      purpose; no caption — rulings 18/19 — and no surface says so, which is
      James's open question in #424's hand-back); the hover/tooltip layer
      once listed here
      is PR 3 or never (spec §11, James 2026-09-12) — plus
      James's two notes of 2026-09-12, asked after build 977 was on his
      phone and RULED the same day on the addendum boards (spec §5.1, §14
      rulings 20-21): (a) "experiment with how to indicate that the row is
      clickable" — RULING 20: B1, a trailing `›` chevron aligned with the
      door rows' chevrons in their own `--ink-3` mono style (6.69:1), the
      hero still 140 px, plus the proposed faint `--surface-sunken`
      pressed fill on `:active` (1.06:1 against the page — touch feedback,
      not a mark; every text and mark on it clears its floor); the
      accessible name stays exactly `Stats` by explicit `aria-label`;
      (b) "the date range for a season visible when you click on it — for
      consistency maybe all date ranges" — RULING 21: variant A on EVERY
      preset, one mono-caps line under the filter bar naming the days the
      totals cover: `ALL TIME · SINCE 8 NOV 2025` (first row's date),
      `1 MAY TO 12 SEP 2026`, `1 JAN TO 12 SEP 2026`, `1 TO 12 SEP 2026`,
      `14 AUG TO 12 SEP 2026`, CUSTOM the inputs' values in the same
      shape — the one prose line rulings 18-19 allow back, hidden with the
      filter bar at zero rows; RULING 23 (2026-09-13, PR 2 review): a
      one-day range is ONE date, `1 OCT 2026`, never `1 TO 1 OCT 2026`.**
      Gates: the Gate 0 addendum (RULED,
      both notes); antagonist
      DELTA pass on the streak/avg-per-day/metres-per-week definitions
      only (watts and time by type ship in PR 1; the notes are copy and
      layout) — **RUN 2026-09-12: six mechanism breaks, folded into the
      spec the same day** (the §8.3 streak pin contradicted its own rule;
      the streak keys on ROWS not metres and `seed.mjs`'s `streaks()` is
      not its reference; the SEASON card is ONE unfiltered row set,
      invariant 19, with a `NO ROWS THIS SEASON YET` state; the trend's x
      is `test_history.loggedAt` at append, so the e2e backdates test rows,
      and its axis is a new `TickKind "split"` at `chooseTicks`'s own steps;
      bar labels on the current and tallest bars only, with dashed
      out-of-range weeks; the SEASON range line must match `to = today`) —
      plus the boundary fixtures the pass named (a row on today and on
      2026-05-01, a 4-week streak so current ≠ longest, the seed with R13
      dropped) and a statement of which pins a Sunday-start mutation moves;
      DBA SKIP said aloud unless a query changes; no per-PR PM gate
      (non-triad UI); no second design gate on the charts unless the
      rendered thing changes.

**Rows this phase files (dated; the hand-back list at PR 2):**

- [x] **Concept2 season/lifetime totals: work-only or work+rest? Live check
      on log-dev.** A 2021 non-staff forum post (SECONDARY-UNCONFIRMED; the
      forum sits behind a Cloudflare challenge) says the logbook's headline
      counts rest while a row's `distance` is work-only (PRIMARY). James
      ruled work-only for us regardless, and spec invariant 12 means the
      answer can never change a number here — it only decides whether the
      caption says `CONCEPT2 COUNTS REST, WE DO NOT`. What would fix it now:
      running the check — not done because log-dev needs James's client
      credentials, which rotate his live link. **S** · dies 2026-10-12 ·
      needs James's credentials and a rowed upload, neither of which a desk
      session can supply.
      **TICKED 2026-09-19 — OBSERVED on James's own log-dev season page, not
      settled; an informational row needs no more.** Its SEASON METERS tile reads
      91,175, while the 26 rows it lists sum to 79,025: 12,150 m more than its
      own row scores. That is consistent with season totals counting rest
      metres on top of each row's work-only score (the app's own season REST
      METRES was 14,593 the same day, over a different row set). INFERENCE,
      UNTESTED — what would settle it is the sum of the `rest_distance` we
      posted over those 26 rows against 12,150. By James's ruling it changes
      no number here.
**Inherited, stated and not discharged:** the RC ruling that the first
surface showing any `summaryDetail` field owes a photograph against the
PM5's screen (`docs/history/phase-rc.md:1072`) — PS shows a SUM, which no
PM5 screen shows, so the obligation stays with Phase LP's per-session
surface and its parity-photograph row under Wave E. RC-16's doubled
`avgStrokeRate` warning is irrelevant here (not displayed).

**Ruled by James, 2026-09-12 (spec §14), applied in the spec:** MACHINE is
BY DOOR — every `source = 'pm5'` row, link-lost ones included (the `n OF m`
line that once said so was struck by ruling 19; rulings 18 and 19 together
stripped every caption from the page); rest is the stored RC-1
pair (`machineSummary.totalRestMeters` stays provenance, unread); the
avg-m/day divisor counts today (May 1 → 1); the test trend SHOWS points
whose log was deleted; CALORIES & WATTS are rows of TOTALS, not a group;
AVG WATTS EXCLUDES stored-tier rows (metres, time and sessions still count
them; the seam line that said so is gone since ruling 19) — and both the
exclusion and the seam count
cover ONLY `source = 'pm5'` rows in that tier (ruling 17, PR 1's fix round:
a timer or manual row is what the rower typed, work by definition, never in
k); the phase's ONLY external oracle is James
comparing LIFETIME and THIS SEASON against his own Concept2 logbook page,
once, by eye, on the TestFlight build (exit criterion below, RF11);
`CLAUDE.md` names three standing agents, the `dba` described beside the
other two, and a PR that adds or removes one updates that paragraph in the
same commit. **And at Gate 0 (spec §14 9-16):** the You hero is H3 TIME BY
TYPE and replaces the two-line headline; the hero IS the door and there is
no STATS row; every subpage chart is designed now and ships in PR 2 except
what the hero needs; previous-week bars are `--ink-4`, not the handoff's
`#c9c3b2`; the stack order is AN · AT · O2 · TR · NO TYPE (the palette
validator); landscape You scrolls; the seam line and the `n OF m` line
(ruling 15) are superseded on the surface by ruling 19; zero monitor rows hide
the MACHINE-only rows and zero rows hide the filter bar.

**Exit:** at PR 1, a rower with ≥ 1 row sees real totals on You and
`/you/stats` that equal the log's DETAIL heroes summed (the contract test
and the e2e literal both green, mutations named), at 0 rows the honest empty
state, and with no `pm5` row the MACHINE column's; the chart groups render
at ≥ 2 points and read `TWO ROWS MAKE A CHART` below — TIME BY TYPE at PR
1, METRES PER WEEK and SEASON at PR 2, each verified at the PR that ships
it, with TEST TREND the stated exception (one test is a result, so it
draws one dot; its empty state is `NO 2K OR 6K TEST LOGGED`); the e2e figures
for the Gate 0 seed are `compute.mjs`'s, clock pinned; the hero is one
control named `Stats` and `.you-doors` has no STATS row; the DBA verdict
with the §9 protocol's numbers at
1k / 10k / 100k attached to PR 1 and a pagination ruling against the
5,000-row trigger; `grep -rin "verified\|c2ResultId\|c2UserId\|concept2"
app/domain/stats app/src/you/stats app/src/api/useStatsRows.ts` empty,
pasted; **James's eyeball check** — LIFETIME and THIS SEASON on You beside
his Concept2 logbook page, both pairs of numbers and the gap's explanation
(rest metres, rows never sent, fused rows) in the phase's close record —
RUNNABLE since v0.46.0 (build 977, 2026-09-12) · dies 2026-10-12 · the
phase's only external oracle (RF11) and it needs his eyes and his logbook,
not a desk session; dated on the way past (campsite rule, PR 2 prep).
**No hardware walk** — nothing here reaches the wire.
