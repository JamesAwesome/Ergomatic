# Phase PS — career stats on the You tab

**TRIAD: a number's meaning.** Every figure here is a SUM over stored rows, and
the row's own metres already mean two things depending on when it was saved
(RC-5, `app/server/db/schema.ts:251-266`). PR 1 carries `/harden`, a DBA gate
and a PM final gate; the phase opens with an antagonist anchor pass and a PM
slate gate. James's approved design (2026-09-12) is the authority for every
decision below; five points where a repo fact pulled against it were put to
him and ruled the same day — §14 records each ruling (RF10).

## What and why

A rower who has used the app for a month has no way to see what they have
done: no lifetime metres, no season, no "am I rowing more than last month".
Concept2's logbook shows all of that on its front page, and a rower who sends
their rows there (Wave E) sees a career total on one site and nothing on the
other. This phase puts the career on the You tab — a two-line headline on You
itself (LIFETIME and THIS SEASON metres) and a STATS door to a subpage with a
date filter, totals in two columns (every row, and rows the monitor measured),
rest, calories and average watts, time by Erg Book type, a season metres-per-
day figure, weekly streaks, and the 2k/6k test trend. Every number is the sum
of what the log already shows for each row, computed by one domain function
that the log's own hero code is refactored to call, so the two surfaces cannot
disagree. Nothing new is stored; nothing is imported from Concept2; the
Concept2 integration is not production yet and no number here may read it.

## 1. Research pass

Tagged PRIMARY / SECONDARY / INFERENCE. Repo facts cite `file:line` read on
2026-09-12 at `3fc49767`.

**Concept2 (the research agent's pass, 2026-09-12, distilled findings):**

- PRIMARY (log.concept2.com/help): the season runs May 1 to April 30 and is
  named by its END year; "Season Meters" are all metres logged this season;
  "Lifetime Meters" are all metres ever, carried forward. "Catchup Meters" let
  a rower ADD a manual offset — not mirrored (James: Ergomatic's own rows
  only).
- PRIMARY: Annual Meters Honor Board = average metres per day since May 1,
  banded at 1500/2500/5000/7500/10000. The divisor's boundary (whether today
  counts as a day) is not stated in the page as quoted — INFERENCE; James
  ruled INCLUSIVE (§14 ruling 3), pinned in §3.3.
- PRIMARY: Million Meter Club at 1, 5, 10, 15, 20, 25M and every 5M after,
  one club per erg. NOT chosen (James). Out of scope, §11.
- PRIMARY: verified status is irrelevant to totals ("Verification is not
  required to rank"); Just Row counts for metres and is excluded from
  rankings. Mirrored: `verified` is never read here (§7 invariant 12) and a
  free row counts.
- SECONDARY (forum, non-staff, 2021): the logbook's season/lifetime totals
  count work PLUS rest ("Overall Distance"), while a row's `distance` is
  work-only (PRIMARY API doc). **James ruled work-only regardless**; the
  claim gets a live check on log-dev as an INFORMATIONAL register row (§13)
  and can never change a number here (§11).
- PRIMARY (API doc): no totals, stats or PB endpoint; `users/me` carries no
  metres. There is nothing to import even if we wanted to.
- NOT FOUND: an ErgData profile-screen reference; a Lifetime Bests event
  list (INFERENCE: it is the ranking-event list). Both recorded as results.

**Repo ground (verified this session):**

- `session_logs` is the one table (`schema.ts:166-448`). Columns read here:
  `loggedAt:184`, `workoutType:183` (nullable text, null = free row),
  `source:230` (`pm5|timer|manual|no-reading`), `distanceMeters:264` /
  `timeSeconds:265` (meaning changed at RC-5, no marker, `:251-263`),
  `workSeconds:339`/`workMeters:340`/`restSeconds:341`/`restMeters:342`,
  `machineWorkSeconds:358`/`machineWorkMeters:363`, `machineSummary:372`
  (untyped jsonb; `totalCalories` is one of its keys, client view
  `storedSummary.ts:267`), `endedBy:300`. `completedAt`/`tz` (`:437-438`)
  exist but are null on every row Wave E PR 2 did not touch — the row date
  is `loggedAt`, which is what the history list renders (`LogRow.tsx:42-43`,
  `new Date(loggedAt)` in the device zone).
- The heroes' tier read is `buildHeroes`, `storedSummary.ts:840-971`; the
  tier rule is transcribed in §3.1. Rest reads ONLY the RC-1 pair
  (`buildStoredRest`, `:711`; findings line 9).
- The logs API: `GET /api/logs` is a cursor list, no date filter, no
  aggregate (`routes/data.ts:1431`); `DELETE /api/logs/:id` is a hard delete
  (`:1583`, `stores/logs.ts:813-882`). `stores.logs.count()` exists with no
  caller (`stores/logs.ts:885`). No `SUM` anywhere in `app/server`.
- `test_history` (`schema.ts:508-540`): `distance` (`"2k"|"6k"`),
  `splitSeconds`, `loggedAt`; `GET /api/test-history` exists
  (`routes/data.ts:2232`, returns the user's list) and the client only ever
  POSTs (`src/api/testHistory.ts:23`). **`sessionLogId` is ON DELETE SET
  NULL, not CASCADE** (`schema.ts:531-537`, its own comment: deleting the
  log "must not silently rewrite the test trend 8B will render") — so the
  test trend does NOT drop a row when its log is deleted, unlike every other
  number here. Ruled: it shows the point (§14 ruling 4).
- `logbookWatts(seconds, meters) = round(2.8 / (seconds/meters)^3)`
  (`src/session/logbookDerived.ts:23-29`, PRIMARY: concept2.com watts
  calculator, as that file cites). The per-session MACHINE tile calls it with
  the tier's own time and distance (`storedSummary.ts:802`).
- Machine type is stored nowhere; `ergMachineType` gates a connect-time
  refusal only (findings line 14; ROADMAP register row "We never check
  WHICH Concept2 machine is attached"). Every stored row is a RowErg row.
- Phase MD PR 3 touches only the series `Sample` shape — nothing this
  phase reads (findings line 12).
- `app/src/charts/scale.ts` (`linearScale`, `domainFromReadings`,
  `decimate`) and `axis.ts` (`chooseTicks`, `formatTick`) are trace-agnostic
  and are the only chart primitives; the design handoff's Trend block is a
  SKETCH, not a chart spec (`docs/design/handoffs/2026-08-07-news-tab/
  README.md:96`).
- Nothing under `docs/superpowers/research/` covers aggregation, seasons or
  streaks (listing read 2026-09-12). A result, not a gap to fill.

## 2. Does the system have the concept?

| Concept | Concept2 has it | Ergomatic asserts | Who is wrong when it matters |
| --- | --- | --- | --- |
| Season (May 1 – Apr 30, named by end year) | Yes (PRIMARY) | Mirrors it exactly | Nobody: a calendar convention, not a number |
| Lifetime metres | Yes | Σ over our rows only, work-only | Us, if a rower expects their C2 catch-up or pre-Ergomatic metres — the surface says ERGOMATIC ROWS ONLY |
| Avg metres/day this season | Yes (Honor Board) | Same formula, divisor pinned in §3.3 | Us, by at most one day of divisor if the INFERENCE is wrong |
| Weekly streak | **No.** Concept2 has no streak | Ergomatic-invented, labelled `ERGOMATIC` on the surface | Us; it asserts nothing on Concept2's behalf |
| Type buckets (AN/O2/AT/TR) | No — C2 has no intensity axis | Erg Book's own axis; a free row is NO TYPE, not a fifth peer (`just-row-design.md:802-806`) | Nobody: purely ours |
| MACHINE vs ALL | No — C2 has no such split | `source = 'pm5'` is the stored door (`schema.ts:230`); MACHINE = by door (§14 ruling 1) | Us: a `pm5` row that closed `link-lost` is MACHINE by door but its tier is `stored` (§3.1); the column's `n OF m CARRY THE MONITOR'S OWN TOTALS` line says so |
| Calories, watts | Yes, derived (Phase LP §1) | Σ stored `totalCalories`; watts from the range's own pace | Us if a rower compares to C2's per-row watts mean — the label says `AT THE RANGE'S AVERAGE PACE` |

## 3. Definitions

Units: metres as integers; seconds as doubles; dates as device-zone calendar
days (`YYYY-MM-DD`), converted ONCE by the adapter (§4.3) — the domain never
sees a timezone or an instant.

### 3.1 `rowContribution(row)` — the tier rule, transcribed from `buildHeroes`

Evaluated in this order; the first tier whose gate holds wins, exactly as
`storedSummary.ts:841-971`:

| Tier | Gate (all of) | `workMeters` | `workSeconds` |
| --- | --- | --- | --- |
| `machine` | `machineWorkSeconds !== null && machineWorkMeters !== null && both > 0` (`:841-846`) | `Math.round(machineWorkMeters)` (`:853`) | `machineWorkSeconds` (`:854`) |
| `work-pair` | `workSeconds !== null && workMeters !== null && both > 0` (`:896-900`) | `Math.round(workMeters)` (`:902`) | `workSeconds` (`:903`) |
| `steps` | some step has `actualMeters !== undefined` AND `endedBy` is `"finished"`, `null` or `undefined` (`isReconstructableClose`, `:622-624`; gate `:938-940`) | Σ `step.actualMeters` over steps carrying it (`stepActualSums`, `:626-649`) | Σ `step.actualSeconds` over steps carrying it, or `null` if none |
| `stored` | otherwise (`:962-971`) | `distanceMeters` (may be `null`) | `timeSeconds` (may be `null`) |

- `restMeters`/`restSeconds`: the RC-1 pair verbatim (`row.restMeters`,
  `row.restSeconds`), `null` when null — the log's TOTAL line reads no other
  rest source (`buildStoredRest`, `:711`). `machineSummary.totalRestMeters`
  (`:270`) stays provenance, unread here (§14 ruling 2).
- `calories`: `machineSummary.totalCalories` when it is a finite integer,
  else `null` (`:780`; absent on any row saved before Phase LP).
- `tier` is returned so the surface can count `stored`-tier rows: a
  `stored` row saved before RC-5 carries FUSED metres and one saved after
  carries work-only, and NO field distinguishes them (`schema.ts:251-263`).
  INFERENCE: the population cannot be split per row; the seam is accepted
  and named (§5, §6), never hidden.
- Nothing rounds twice: the `steps` tier's sum is not rounded, matching
  `:945`.

### 3.2 Totals (a range = a set of calendar days, inclusive)

For a range R and a column C ∈ {ALL, MACHINE}, `rows(R, C)` = every row
whose device-zone date of `loggedAt` is in R, and for MACHINE also
`source === "pm5"` — MACHINE is BY DOOR (§14 ruling 1): a `pm5` row that
closed `link-lost` and sits in tier `stored` is still MACHINE. Deleted rows
are absent (hard delete, `data.ts:1583`).

- **Metres** = Σ `workMeters` over rows with a non-null value.
- **Time** = Σ `workSeconds` over rows with a non-null value.
- **Sessions** = |rows(R, C)|, including rows contributing `null` metres.
- **Monitor's own totals line** (MACHINE only) = `n OF m CARRY THE MONITOR'S
  OWN TOTALS`, n = rows in tier `machine`, m = |rows(R, MACHINE)|.
- **Rest metres** (MACHINE only) = Σ `restMeters` non-null — the stored RC-1
  pair, what the TOTAL line shows (§14 ruling 2).
- **Calories** (MACHINE only) = Σ `calories` non-null, shown with
  `n OF m ROWS CARRY IT` where m = |rows(R, MACHINE)|.
- **Avg watts** (MACHINE only) = `logbookWatts(Σ workSeconds, Σ workMeters)`
  over rows where BOTH are non-null — the watts of the range's average pace,
  never a mean of per-row watts. `undefined` (a dash) when either sum is 0.
- **Time by type** = Σ `workSeconds` grouped by `workoutType` ∈ {AN, O2, AT,
  TR} plus NO TYPE for `null` — five buckets, one stacked bar, NO TYPE drawn
  in `--ink-4` with no type colour so it cannot read as a fifth intensity.

### 3.3 Calendar

- **Season** containing date d: `[May 1 of Y, Apr 30 of Y+1]` where Y = d's
  year if d ≥ May 1 else d's year − 1; NAMED `Y+1`. Pinned with independent
  literals: `2026-04-30 → season 2026`, `2026-05-01 → season 2027`.
- **Presets:** ALL (no bound) · SEASON (current season to today) · YEAR
  (Jan 1 to today) · MONTH (1st to today) · 30 DAYS (today − 29 … today)
  · CUSTOM (from, to; both inclusive; from ≤ to). "Today" is the device's
  date.
- **Week** starts Monday. Week of d = the Monday ≤ d (ISO). Pinned:
  `2026-09-13` (Sunday) → week of `2026-09-07`; `2026-09-14` → itself.
- **Avg metres/day this season** = SEASON metres (ALL column) ÷ days elapsed
  where days = (today − May 1) + 1, INCLUDING today (§14 ruling 3; the
  Honor Board page does not state its divisor). Pinned: on May 1 it is 1.
- **Streak (Ergomatic-invented):** a week counts when ≥ 1 row (ALL) has its
  date in it. CURRENT = the run of counting weeks ending at the week
  containing today, or at last week if this week has none yet — a streak is
  not broken by a week that has not finished. LONGEST = the longest run of
  consecutive counting weeks anywhere in the rower's history. Both are
  integers ≥ 0.
- **Test trend:** two series (`2k`, `6k`) of `splitSeconds` over
  `loggedAt`'s date, from `GET /api/test-history`, not filtered by the range
  (a trend needs its whole history; the filter bar says so). **This is the
  ONE figure on the page that does not drop when its log row is deleted**
  (§14 ruling 4): `test_history.sessionLogId` is `ON DELETE SET NULL`
  (`schema.ts:531-537`) because the test record is the rower's own history
  of what they measured, and deleting a log un-counts plan progress without
  un-measuring the test. A point whose link is null is drawn like any other.

## 4. Data path

### 4.1 Domain: `app/domain/stats/`

- `rowContribution.ts` —
  `rowContribution(row: StatsRowInput): RowContribution`.
  `StatsRowInput` is declared IN the domain with every field REQUIRED and
  `null` for absent (RF33), diffed field by field against
  `storedSummary.ts`'s `StoredLog` (`:177-330`) and `stores/logs.ts`'s row
  type in the PR body. `StoredLog` is assignable to it without adaptation
  (structural), so the refactor is a call, not a mapping.
- `aggregate.ts` — pure functions over `StatsRow[]` + a range: totals, type
  buckets, season/week/streak/avg-per-day. No `Date.now()`, no `Intl`: today
  and every row date arrive as `YYYY-MM-DD` strings.
- No framework imports (the existing `app/domain` rule).

### 4.2 `buildHeroes` refactor — the invariant, not the mechanism

After PR 1, `buildHeroes`'s `distanceMeters`/`timeSeconds` for every stored
row EQUAL `rowContribution(row).workMeters`/`.workSeconds` (`null` ↔
`undefined`), and its tier selection is the domain function's `tier`. Avg
split, the TOTAL line and the machine tiles are untouched. The gate is the
contract test in §8.1 against output captured from `main` BEFORE the
refactor — proved by equality, not by reading the diff.

### 4.3 Route: `GET /api/stats/rows` (additive)

```ts
// app/server/routes/stats.ts — every row of the caller, newest first.
// Computed row-side by rowContribution(); `steps` never crosses the wire.
export interface StatsRow {
  id: string;
  loggedAt: string; // ISO instant; the CLIENT adapter turns it into a date
  source: "pm5" | "timer" | "manual" | "no-reading";
  workoutType: "AN" | "O2" | "AT" | "TR" | null; // null = NO TYPE
  tier: "machine" | "work-pair" | "steps" | "stored";
  workMeters: number | null;
  workSeconds: number | null;
  restMeters: number | null;
  restSeconds: number | null;
  calories: number | null;
}
export interface StatsRowsResponse {
  rows: StatsRow[];
}
```

- Auth: the same session guard every `/api/*` route has. No query params in
  PR 1 (no pagination, no date filter): the client filters. **The DBA
  measures payload bytes and p95 latency at 1k / 100k / 1M rows for one user
  on seeded data with `EXPLAIN ANALYZE`, and that measurement — not this
  spec — rules whether a cursor, a server roll-up, the missing
  `(user_id, logged_at desc, id desc)` index or the deferred
  generated-columns item (both rows under ROADMAP's Wave E section, from the
  Phase LP DBA benchmark) opens.**
  INFERENCE to be measured: ~150 bytes/row, so 1k rows ≈ 150 KB.
- The adapter (`src/api/useStatsRows.ts`) maps `loggedAt` → device-zone
  `YYYY-MM-DD` once and hands the domain `StatsRow & { date: string }`.
- **Cache/refetch invariants:** the surface fetches on every mount; no
  in-memory copy outlives the screen; nothing is written to `localStorage`
  (a stats surface has nothing to lose); a row saved or deleted before the
  next mount is reflected on it. Consistent with `useRecentLogs.ts`'s
  fetch-per-mount shape (`:1-2`, hook-local state).
- **Deletes:** nothing to do for every stats figure — a deleted row is
  absent on the next fetch. The test trend is the stated exception (§3.3):
  its points come from `test_history`, which deliberately survives the log
  row's deletion.

## 5. Surface

- **You root** (`src/You.tsx`): under the identity card, a two-line headline
  in the house mono label style: `LIFETIME · 412,380 M` / `SEASON 2027 ·
  38,120 M` — ALL column, work metres. Tapping it opens `/you/stats`.
- **STATS door**: first row of `.you-doors`, ABOVE `BaselinesRow`
  (`You.tsx:153-154`); the four existing rows keep their order and
  DIAGNOSTICS stays last (`You.tsx:151-152`). Route `/you/stats`, a flat
  sibling of `/you/baselines` (`AppRoutes.tsx:255-262`), not in
  `HIDDEN_TABBAR_PREFIXES`.
- **`/you/stats`**, top to bottom: (1) filter bar — six 44px chips ALL ·
  SEASON · YEAR · MONTH · 30 DAYS · CUSTOM, roving-tabindex radiogroup
  copied from `PaceRefInput` (RF8), ALL selected on first open; CUSTOM
  reveals two `<input type="date">` at 16px, seeded FROM = today − 29,
  TO = today, applied on change, and while FROM > TO the previous range
  stays and the inputs read `FROM MUST NOT FOLLOW TO`; (2) TOTALS — two
  columns headed `ALL ROWS` and `MACHINE`, rows METRES / TIME / SESSIONS in
  both columns, then REST METRES / CALORIES / AVG WATTS under MACHINE only
  (§14 ruling 5: calories and watts are rows of this group, never a group
  of their own — the "lifetime + monthly" ruling is met by the ALL and
  MONTH presets), with
  `n OF m CARRY THE MONITOR'S OWN TOTALS` under the MACHINE heading, `n OF m
  ROWS CARRY IT` under CALORIES, and `ERGOMATIC ROWS ONLY · WORK METRES ·
  REST SHOWN SEPARATELY` as the group's caption; (3) MOTIVATION — `AVG M/DAY
  THIS SEASON`, `CURRENT STREAK`, `LONGEST STREAK`, each streak labelled
  `WEEKS · ERGOMATIC`; (4) TIME BY TYPE — one stacked bar, five buckets,
  legend below; (5) TEST TREND — 2k and 6k as two series of split seconds
  over date on `linearScale`/`chooseTicks(kind: "pace")`, captioned `ALL
  TESTS · KEPT WHEN A LOG IS DELETED` so the one exception is said where it
  shows.
- **The seam line:** when any row in range is tier `stored`, the totals
  caption gains `k ROWS PREDATE WORK-ONLY TOTALS` — the seam named on the
  surface, as ruled.
- **Empty states**, honest text and never sample data: 0 rows → `NO ROWS
  YET · YOUR FIRST SAVED ROW STARTS THE COUNT`; 1 row → totals render, the
  chart groups read `TWO ROWS MAKE A CHART`; no test history → `NO 2K OR 6K
  TEST LOGGED` (one test point is drawn as a point — a record of one is
  still a record); a CUSTOM range with no rows → `NO ROWS BETWEEN <from> AND
  <to>`.
- **Gate 0 (before any implementation task):** a rendered HTML artifact of
  the You headline and the whole subpage at 390×844 portrait and 844×390
  landscape, seeded with ≥ 12 real rows across four types plus two free
  rows and one pre-RC-5 `stored` row, beside the current You screen. Every
  colour pairing's ratio computed and stated: the pairs this design uses
  are `--ink` on `--page` (15.41:1) and `--ink-3` on `--page` (6.69:1) and
  on `--surface` (7.43:1), all recorded in `docs/design/DEVIATIONS.md:75-79`;
  the NO TYPE bucket's `--ink-4` on `--page` is 4.76:1
  (`DEVIATIONS.md:59`). Any new pairing is computed at the gate. Every tap
  target ≥ 44×44 px. RF7: the artifact's headline is recomputed from its
  own rows by hand in the gate message.

## 6. Where the risk is

A `stored`-tier row's metres are fused or work-only with no marker: accepted,
counted by `tier`, named on the surface (§5), never corrected. If
`buildHeroes` and `rowContribution` ever disagree the You total stops
equalling the log: §8.1 is the gate. A row saved at 23:30 lands on the right
day only if the ADAPTER converts in the device zone: §8.3 pins it.

## 7. Invariants (numbered; the tests in §8 cite them)

1. Every total on the surface equals the sum, over the rows in range, of
   what the log's own hero shows for that row (ALL column), or of that sum
   restricted to `source === "pm5"` (MACHINE column).
2. `buildHeroes(row).distanceMeters === rowContribution(row).workMeters` and
   likewise for time, for every stored row, `undefined` ↔ `null`.
3. A row contributes to exactly one tier and the tier order is the one in
   §3.1; no row is counted twice and none is silently dropped — a `null`
   contribution still counts as a session.
4. Metres are work-only on every tier that can know; rest is a separate
   figure from the RC-1 pair and is never added to metres.
5. A date filter is inclusive at both ends, in the device's calendar; a row
   is in exactly one season, one week and one calendar month.
6. Season boundaries and names follow §3.3 exactly; week starts Monday.
7. Avg watts is the watts of the range's average pace (Σs ÷ Σm), never a
   mean of per-row watts.
8. Calories is a sum of stored `totalCalories` only; a row without one adds
   0 and the `n OF m` line says so.
9. NO TYPE is a bucket for `workoutType === null` only, drawn without a type
   colour, and never a member of `WORKOUT_TYPES`.
10. Streaks are computed from row dates alone; an unfinished current week
    never breaks a streak.
11. Nothing this phase adds is stored: no column, no migration, no
    localStorage key, no client cache surviving the screen.
12. **No number, label or empty state on the stats surface reads `verified`,
    `c2ResultId`, `c2UserId`, the Concept2 link state, or any Concept2 API.
    The MACHINE column keys on `source = 'pm5'` only. Concept2 contributes
    only a calendar convention (the season, May 1 to Apr 30) and vocabulary.**
    (James, 2026-09-12: the integration is not production yet.)
13. A deleted log row is absent from every stats figure on the next mount;
    the test trend alone keeps its point, by the schema's deliberate `SET
    NULL` (§3.3, §14 ruling 4), and its caption says so.
14. The domain never reads a clock or a timezone: today and every row date
    are inputs.

## 8. Testing — each gate with RF26's five-part contract

### 8.1 Contract: `rowContribution` ≡ `buildHeroes` (invariant 2)

(1) Invariant 2. (2) Producer: every `StoredLog` fixture in
`storedSummary.test.ts` (the tier-A-with-null-rest-pair row, the build-738
row, the free row with `steps: []`, the declined B2 row, the fused fallback
row) plus rows built via `fromWorkout` from `LIBRARY_WORKOUTS` (TESTING.md
§9). (3) Observable: `buildHeroes` output captured from `main` at `3fc49767`
BEFORE the refactor, as a committed JSON fixture. (4) Mutation: swap the
`work-pair` and `steps` gates' order in `rowContribution` → the declined-B2
fixture's metres change; expected failure names the fixture id. (5)
Strongest claim: "for every committed fixture the two agree" — not "for
every row".

### 8.2 Upstream of the producer (RF24; invariants 1, 3, 12)

(1) Invariant 1. (2) Integration test seeds through `POST /api/logs` — one
row per tier, one `manual`, one `pm5` closed `link-lost` — then reads
`GET /api/stats/rows`. (3) Observable: the response rows' `workMeters` and
`tier`; the response has NO key named `verified`, `c2ResultId` or
`c2UserId` (asserted by key set, RF33's lesson). (4) Mutation: make the route
select `distanceMeters` instead of calling `rowContribution` → the tier-A
row's metres become the fused column; expected failure prints both. (5)
"The supported save path produces the projection the surface sums."

### 8.3 Domain pins with independent literals (RF21; invariants 5, 6, 10, 14)

Season: `2026-04-30 → 2026`, `2026-05-01 → 2027`. Week: `2026-09-13 →
2026-09-07`. Avg/day divisor on May 1 = 1. Streak: weeks {W1, W2, W4} with
today in W5 → current 0, longest 2; with today in W4 → current 1. Zone: an
instant `2026-09-12T23:30:00-04:00` dates `2026-09-12` in `America/New_York`
and `2026-09-13` in UTC — asserted in the ADAPTER test, since the domain
never sees it. Empty range → every total 0, sessions 0, avg watts
`undefined`. (4) Each pin's mutation is the off-by-one in the constant it
guards (a `<` for `<=`), and the report names which literal went red.

### 8.4 Structural gate for invariant 12

A unit test reads every file under `app/domain/stats/`, `src/you/stats/`
and `src/api/useStatsRows.ts` as text and asserts none contains `verified`,
`c2ResultId`, `c2UserId`, `concept2` or `/api/concept2`; and a type-level
test asserts `keyof StatsRow` equals the §4.3 literal list. (4) Mutation:
add `verified: boolean | null` to `StatsRow` → the key-set assertion fails
naming the key; add a `concept2Link` import → the text scan fails naming the
file. (5) "No Concept2 identifier appears in the stats code" — structure,
not runtime behaviour (RF26).

### 8.5 Client and e2e (invariants 1, 8, 9, 13)

- Client: filter presets select the right rows; a CUSTOM `from > to` keeps
  the previous range and shows the §5 string; empty states render the §5
  strings and never a chart.
- e2e (`e2e/stats.spec.ts`): seed 6 rows through the API with known metres
  (three `pm5`, one per other source), open You, assert the LIFETIME line
  equals the HAND-COMPUTED sum written as a literal in the test (RF7); open
  STATS, assert ALL and MACHINE metres against two literals; delete one
  `pm5` row through the UI, reload, assert both lines moved by that row's
  literal. Mutation: make the ALL column filter `source === "pm5"` → the
  ALL literal fails while MACHINE passes (the case that proves the two
  columns are computed independently).
- Screenshots: `you.png` (layout changed) and a new `you-stats.png`, opened
  and described, headline recomputed from the visible rows (RF7).

## 9. PR shape and gates

- **PR 0 — this spec, the ROADMAP Phase PS section, and the DBA agent
  files** (`.claude/agents/dba.md`, `dba-techniques.md`, `dba-ledger.md`,
  written in this worktree alongside the spec and landing with it — the
  agent proposes, never writes, and every verdict carries measured
  numbers). Gates: antagonist ANCHOR pass
  on this spec (riskiest: §3.1's transcription and §7 invariant 12), PM
  phase-OPEN gate on the slate, DBA first pass on §4.3's query shape and
  growth. Docs-only; CI's code jobs skip.
- **PR 1 (TRIAD) — domain function, `buildHeroes` refactor, route, adapter,
  You headline, STATS subpage with filter bar and the whole TOTALS group
  (both columns, rest, calories, avg watts and both `n OF m` lines), the
  seam line, empty states.** Gates: Gate 0 first (§5); `/harden` on the plan
  (two lenses, capped); DBA gate with the §4.3 measurement and its ruling;
  full e2e read; PM final-PR gate.
- **PR 2 — MOTIVATION, TIME BY TYPE, TEST TREND.** Gates:
  antagonist DELTA pass scoped to §3.2 avg watts and §3.3 streak/avg-per-day
  definitions only (new invariant classes against the anchor's vetted
  ground); DBA SKIP stated aloud unless a query changes (test-history's GET
  is unchanged); no PM per-PR gate (non-triad UI); Gate 0 for its groups
  rides PR 1's artifact, which renders all five groups.
- Fast path applies to nothing here (`app/domain/` and `app/server/` in
  PR 1; a wrong version produces a wrong number). PR 1 is one plan: the
  domain function and its contract test, the route and its seam test, and
  one screen whose only chart-free group is TOTALS — one risk model (the
  number's meaning) for one reviewer; the charts wait for PR 2.

## 10. Exit criteria

1. §8.1–8.5 green with each mutation's failure text in the PR body.
2. `grep -rn "verified\|c2ResultId\|c2UserId\|concept2" app/domain/stats
   app/src/you/stats` returns nothing (the §8.4 gate's grep, pasted).
3. The DBA verdict is attached to PR 1 with numbers at 1k/100k/1M rows and
   a ruling on pagination and on the generated-columns item.
4. Gate 0 approved before PR 1's first implementation commit, with ratios.
5. A rower with ≥ 2 rows sees real totals; below, the §5 empty states.

## 11. Out of scope

PBs and Lifetime Bests; the Million Metre Club; Concept2 import or catch-up
metres; storing machine type (the existing register row owns it; every row
is a RowErg row until then); generated columns or any migration until the
DBA's measurement says so; `completedAt` as the row date; per-row watts;
charts beyond one stacked bar and one two-series line. **The Concept2
work+rest live check (§13) is INFORMATIONAL and can never change a number
here** — §7 invariant 12 forbids it structurally.

## 12. Inherited obligations

- **RC's photograph ruling** (`docs/history/phase-rc.md:1072`): the first
  surface displaying any of the nine `summaryDetail` fields owes a
  photograph against the PM5's own screen. **PS shows a SUM, which no PM5
  screen shows; the obligation stays with Phase LP's per-session surface**
  and its parity-photograph row in the ROADMAP (Wave E, "Phase LP's parity
  photograph"). Stated, not discharged.
- **RC-16** (`phase-rc.md:1973`): terminate doubles `avgStrokeRate`.
  Irrelevant — stroke rate is not displayed here.
- The RC-5 hazard the deferred PS row carried is §6.1, resolved by naming.

## 13. Rows to file (dies date + clause)

- **Concept2 season/lifetime totals: work-only or work+rest? Live check on
  log-dev.** Compare one row's `distance` against the season total's
  movement after an upload. INFORMATIONAL: whichever answer, §7 invariant
  12 keeps it from changing a number here; it only decides whether the
  caption says `CONCEPT2 COUNTS REST, WE DO NOT`. What would fix it now:
  running the check today — not done because log-dev needs James's client
  credentials, which rotate his live link (memory: ask before refreshing).
  · dies 2026-10-12 · needs James's credentials and a rowed upload, neither
  of which a desk session can supply.

No other row. Pagination is PR 1's DBA gate, not a row; the photograph and
machine-type rows already exist and are not touched by this spec.

## 14. Rulings (James, 2026-09-12)

Five points where a repo fact pulled against the approved design; each was
put to James and ruled the same day. The rulings are applied above; this
section is the record.

1. **MACHINE = by door.** Every `source = 'pm5'` row is MACHINE, including a
   `pm5` row closed `link-lost` that has no machine totals and no work pair
   (`storedSummary.ts:496-520`) and so sits in tier `stored`. The column
   carries `n OF m CARRY THE MONITOR'S OWN TOTALS` (§3.2, §5).
2. **Rest metres = the stored RC-1 pair** (`restMeters`/`restSeconds`),
   what the TOTAL line shows. `machineSummary.totalRestMeters`
   (`storedSummary.ts:270`) stays provenance, unread here (§3.1).
3. **Avg m/day divisor = days elapsed INCLUDING today** (May 1 → 1) (§3.3).
4. **The test trend SHOWS points whose log was deleted.** `SET NULL` is
   deliberate (`schema.ts:531-537`); the test record is its own history.
   It is the one figure on the page that does not drop with a deleted log,
   stated in §3.3, §4.3, invariant 13 and the group's caption (§5).
5. **CALORIES & WATTS fold into TOTALS** as two more rows under the MACHINE
   column; the separate group is gone from §5, §9 and the ROADMAP section.
