# Phase PS — career stats on the You tab

**TRIAD: a number's meaning.** Every figure here is a SUM over stored rows, and
the row's own metres already mean two things depending on when it was saved
(RC-5, `app/server/db/schema.ts:251-266`). PR 1 carries `/harden`, a DBA gate
and a PM final gate; the phase opened with an antagonist anchor pass, a PM
slate gate and a DBA spec pass, all three run at `93b91d66` (§15). James's
approved design (2026-09-12) is the authority for every decision below; five
points where a repo fact pulled against it were put to him and ruled the same
day, and three more were ruled at the phase-open gates — §14 records each
ruling (RF10).

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
2026-09-12 at `3fc49767` — the app tree this branch sits on; PR 0 is docs-only
and changes none of the cited files.

**Concept2 (the research agent's pass, 2026-09-12, re-fetched the same day
for the verbatim lines; RF16's second corollary — a citation is only as
load-bearing as the line quoted):**

- PRIMARY (log.concept2.com/help/): **the season** — "The Concept2 Online
  Logbook and Ranking season runs from May 1–April 30." **Season meters** —
  "That number is the total of all the meters you have logged into your
  logbook during the current season". **Lifetime meters** — "That number is
  the total of all the meters you have ever logged into your logbook,
  regardless of season." and "This value gets carried forward from one
  logbook and ranking season to the next." "Catchup Meters" let a rower ADD a
  manual offset — not mirrored (James: Ergomatic's own rows only).
- PRIMARY (the season standings page, log.concept2.com/challenges/season/
  2025/…, header "Annual Meters Honor Board 2024/2025"): **the season is
  named by its END year.** This is NOT on the help page; the help page
  states the dates only, and the standings header is where the naming is
  shown.
- PRIMARY (help page): **Annual Meters Honor Board** = "average meters per
  day since the beginning of the logbook and ranking season—May 1", banded
  "10,000 meters or more … 7500–9999 … 5000–7499 … 2500–4999 …
  1500–2499". The divisor's boundary (whether today counts as a day) is not
  stated in the page as quoted — INFERENCE; James ruled INCLUSIVE (§14
  ruling 3), pinned in §3.3.
- PRIMARY: Million Meter Club at 1, 5, 10, 15, 20, 25M and every 5M after,
  one club per erg. NOT chosen (James). Out of scope, §11.
- PRIMARY (help page): verified status is irrelevant to totals —
  "Verification is not required to rank a piece". Mirrored: `verified` is
  never read here (§7 invariant 12). INFERENCE: **Just Row counts for
  metres** — the help page only excludes Just Row from RANKINGS and says
  nothing about the season/lifetime sums; that it counts toward them is
  inferred from "all the meters you have logged". Mirrored either way: a free
  row counts here because James ruled Ergomatic's own rows only.
- PRIMARY (API doc, log.concept2.com/developers/documentation/): a result's
  distance is "In meters. Note: for interval workouts this is work distance
  only. Rest distance is set separately"; its time is "Time in tenths of a
  second … for interval workouts this is work time only".
- SECONDARY-UNCONFIRMED (c2forum.com, non-staff, 2021; the forum sits behind
  a Cloudflare JS challenge and could not be re-fetched 2026-09-12): the
  logbook's season/lifetime totals count work PLUS rest ("Overall Distance"),
  while a row's `distance` is work-only (PRIMARY above). **James ruled
  work-only regardless**; the claim gets a live check on log-dev as an
  INFORMATIONAL register row (§13) and can never change a number here (§11).
- PRIMARY (API doc): no totals, stats or PB endpoint; `users/me` carries no
  metres. There is nothing to import even if we wanted to.
- NOT FOUND: an ErgData profile-screen reference; a Lifetime Bests event
  list (INFERENCE: it is the ranking-event list). Both recorded as results.

**Repo ground (verified this session):**

- `session_logs` is the one table (`schema.ts:166-448`). Columns read here:
  `loggedAt:184` (`timestamp` `withTimezone: true`, so a JS `Date` on
  select), `workoutType:183` (nullable text, null = free row),
  `source:230` (`pm5|timer|manual|no-reading`), `distanceMeters:264` /
  `timeSeconds:265` (meaning changed at RC-5, no marker, `:251-263`),
  `workSeconds:339`/`workMeters:340`/`restSeconds:341`/`restMeters:342`,
  `machineWorkSeconds:358`/`machineWorkMeters:363`, `machineSummary:372`
  (untyped jsonb — `Record<string, unknown> | null` in the store,
  `stores/logs.ts:257`; `totalCalories` is one of its keys, client view
  `storedSummary.ts:266-271`), `endedBy:300`. `completedAt`/`tz`
  (`:437-438`) exist but are null on every row Wave E PR 2 did not touch —
  the row date is `loggedAt`, which is what the history list renders
  (`LogRow.tsx:42-43`, `new Date(loggedAt)` in the device zone).
- The heroes' tier read is `buildHeroes`, `storedSummary.ts:840-971`; the
  tier rule is transcribed in §3.1. Rest reads ONLY the RC-1 pair
  (`buildStoredRest`, `:711`; findings line 9). The log's DETAIL screen is
  `src/log/FromTheLog.tsx` (route `/today/log/:id`,
  `src/shell/AppRoutes.tsx:180`), which reaches `buildHeroes` through
  `buildStoredSummary` (`storedSummary.ts:1328-1330`). The history LIST
  computes its own hero (`LogRow.tsx:110-123`) with NO `steps` tier — its
  own comment at `:108-109`: "Only a TRUSTED TIER B2 row (endedBy proves
  historical) still disagrees." §12 carries that disagreement.
- The list projection `LOG_LIST_COLUMNS` EXCLUDES `steps` and `series`
  (`stores/logs.ts:373-374`) and `machineSummary` (`:383-388`) FOR SIZE;
  `machineAvgPaceSecondsPer500m` is already projected as a narrow jsonb-path
  scalar (`:407-409`, `machine_summary->>'avgPaceSecondsPer500m'`). §4.3's
  route needs `steps` whole and `totalCalories` narrow.
- The logs API: `GET /api/logs` is a cursor list, no date filter, no
  aggregate (`routes/data.ts:1431`); `DELETE /api/logs/:id` is a hard delete
  (`:1583`, `stores/logs.ts:813-882`). `stores.logs.count()` exists with no
  caller (`stores/logs.ts:885`). No `SUM` anywhere in `app/server`.
- `machineSummary.totalCalories` is VALUE-validated at the write route:
  `validateMachineSummary` (`routes/data.ts:961`, the loop at `:999-1006`)
  refuses the save unless each of `totalCalories`/`avgWatts`/`avgCalPerHour`
  is absent or an integer in `0..MACHINE_U16_MAX`. The compiler is not a
  gate on the blob: the store's `Record<string, unknown>` and the client's
  all-optional narrowed view assign BOTH WAYS (measured with tsc, antagonist
  anchor pass 2026-09-12).
- `test_history` (`schema.ts:508-540`): `distance` (`"2k"|"6k"`),
  `splitSeconds`, `loggedAt`; `GET /api/test-history` exists
  (`routes/data.ts:2232`, returns the user's list) and the client only ever
  POSTs (`src/api/testHistory.ts:23`). **`sessionLogId` is ON DELETE SET
  NULL, not CASCADE** (`schema.ts:531-537`, its own comment: deleting the
  log "must not silently rewrite the test trend 8B will render") — so the
  test trend does NOT drop a row when its log is deleted, unlike every other
  number here. Ruled: it shows the point (§14 ruling 4).
- `logbookWatts(seconds, meters) = round(2.8 / (seconds/meters)^3)` and
  `logbookCalPerHour` live in `src/session/logbookDerived.ts:23-37`
  (PRIMARY: concept2.com watts calculator, as that file cites) — in `src/`,
  NOT `app/domain/`. The per-session MACHINE tile calls `logbookWatts` with
  the tier's own time and distance (`storedSummary.ts:802`). Nothing
  lint-enforces that `app/domain/**` never imports `src/**`:
  `eslint.config.js:85-135`'s `no-restricted-imports` block is scoped to
  `src/**/*.{ts,tsx}` and forbids only Capacitor, `platform` and `native`
  imports. §4.1 moves the formulas and adds the rule.
- `StoredLog.endedBy` is declared `endedBy?: (CloseReason | "interrupted") |
  null` (`storedSummary.ts:228`) — OPTIONAL and nullable, so it is NOT
  assignable to a required-with-`null` field (TS2322, measured by the
  antagonist with `tsc -p tsconfig.app.json`). §4.1 maps it.
- No test in the repo pins `TZ`: `grep -rn TZ app/vitest.config.ts
  app/src/test/setup.ts .github/workflows/` returns nothing (2026-09-12), so
  Vitest runs in the host's zone locally and UTC on Actions. §8.3 owns this.
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
  streaks (listing read 2026-09-12). A result, not a gap to fill. The one DB
  measurement before this phase is
  `2026-09-07-machine-summary-jsonb-vs-columns/` (scripts `01-setup.sql` …
  `bench.sh`, `explain.sh`); the DBA's 2026-09-12 pass reused its `02-gen.sql`
  and its numbers are in §4.3.

## 2. Does the system have the concept?

| Concept | Concept2 has it | Ergomatic asserts | Who is wrong when it matters |
| --- | --- | --- | --- |
| Season (May 1 – Apr 30, named by end year) | Yes (PRIMARY) | Mirrors it exactly | Nobody: a calendar convention, not a number |
| Lifetime metres | Yes | Σ over our rows only, work-only | Us, if a rower expects their C2 catch-up or pre-Ergomatic metres — the surface says ERGOMATIC ROWS ONLY |
| Avg metres/day this season | Yes (Honor Board) | Same formula, divisor pinned in §3.3 | Us, by at most one day of divisor if the INFERENCE is wrong |
| Weekly streak | **No.** Concept2 has no streak | Ergomatic-invented, labelled `ERGOMATIC` on the surface | Us; it asserts nothing on Concept2's behalf |
| Type buckets (AN/O2/AT/TR) | No — C2 has no intensity axis | Erg Book's own axis; a free row is NO TYPE, not a fifth peer (`just-row-design.md:802-806`) | Nobody: purely ours |
| MACHINE vs ALL | No — C2 has no such split | `source = 'pm5'` is the stored door (`schema.ts:230`); MACHINE = by door (§14 ruling 1) | Us: a `pm5` row that closed `link-lost` is MACHINE by door but its tier is `stored` (§3.1); the column's `n OF m CARRY THE MONITOR'S OWN TOTALS` line says so |
| Calories, watts | Yes, derived (Phase LP §1) | Σ stored `totalCalories`, the monitor's own count; watts from the range's own pace over rows whose tier can know work-only (§14 ruling 6) | Us if a rower compares to C2's per-row watts mean — the label says `AT THE RANGE'S AVERAGE PACE`, and the exclusion is named on the row |

## 3. Definitions

Units: metres as integers; seconds as doubles; dates as device-zone CALENDAR
DATES — a `{ y, m, d }` triple, converted ONCE by the adapter (§4.3) — the
domain never sees a timezone, an instant, or a date STRING it would have to
parse (a `new Date("YYYY-MM-DD")` parses as UTC, which is the bug §8.3
exists to catch). Where this document writes `2026-04-30` it means the triple
`{ y: 2026, m: 4, d: 30 }`; the tests write the triple.

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
  else `null`. **The guard that matters is at the WRITE route:**
  `validateMachineSummary` (`server/routes/data.ts:999-1006`) refuses any
  save whose `totalCalories` is present and not an integer in
  `0..MACHINE_U16_MAX`, so every stored value is already an integer. The
  read-side check is HARDENING, kept because the compiler is not a gate on
  the blob (`Record<string, unknown>` in the store, an all-optional view on
  the client, mutually assignable — §1). Absent on any row saved before
  Phase LP; the client's own read is `const calories = ms?.totalCalories`
  (`storedSummary.ts:779-781`).
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
  `n OF m ROWS CARRY IT` where m = |rows(R, MACHINE)|. The row's caption is
  `MONITOR'S OWN COUNT`: nothing establishes that the PM5's `totalCalories`
  is work-only (`oracleCorpusReplay.test.ts:916-920` proves only that it
  equals Σ split calories), so the WORK METRES caption does not govern it.
- **Avg watts** (MACHINE only) = `logbookWatts(Σ workSeconds, Σ workMeters)`
  over rows whose tier is `machine`, `work-pair` or `steps` AND whose both
  values are non-null — **`stored`-tier rows are EXCLUDED** (§14 ruling 6):
  a fused row's seconds-per-metre includes rest, and watts is cubic in pace,
  so one fused row moves the figure more than it moves metres. It is the
  watts of the range's average pace, never a mean of per-row watts.
  `undefined` (a dash) when either sum is 0. Metres, time and sessions still
  count `stored`-tier rows; the row's caption names the exclusion (§5).
- **Time by type** = Σ `workSeconds` grouped by `workoutType` ∈ {AN, O2, AT,
  TR} plus NO TYPE for `null` — five buckets, one stacked bar, NO TYPE drawn
  in `--ink-4` with no type colour so it cannot read as a fifth intensity.

### 3.3 Calendar

Every function here takes and returns `{ y, m, d }` triples and never
constructs a `Date` from a string (§3, §8.3).

- **Season** containing date d: `[May 1 of Y, Apr 30 of Y+1]` where Y = d's
  year if d ≥ May 1 else d's year − 1; NAMED `Y+1`. Pinned with independent
  literals: `2026-04-30 → season 2026`, `2026-05-01 → season 2027`.
- **Presets:** ALL (no bound) · SEASON (current season to today) · YEAR
  (Jan 1 to today) · MONTH (1st to today) · 30 DAYS (today − 29 … today)
  · CUSTOM (from, to; both inclusive; from ≤ to). "Today" is the device's
  date, converted by the adapter like every row date.
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

### 4.1 Domain: `app/domain/stats/` and `app/domain/logbook.ts`

- `rowContribution.ts` —
  `rowContribution(row: StatsRowInput): RowContribution`.
  `StatsRowInput` is declared IN the domain with every field REQUIRED and
  `null` for absent (RF33), diffed field by field against
  `storedSummary.ts`'s `StoredLog` (`:177-330`) and `stores/logs.ts`'s row
  type in the PR body. **`StoredLog` is NOT assignable to it as-is:**
  `endedBy` is `endedBy?: … | null` (`storedSummary.ts:228`), optional, and a
  required-with-`null` field refuses it (TS2322). The `buildHeroes` call
  site maps `endedBy: row.endedBy ?? null`, and the same for any other
  optional field the diff finds. **The plan's author proves the diff with
  the compiler, not by reading:** paste `StatsRowInput` and a
  `const probe: StatsRowInput = storedLogFixture` into a scratch file at a
  REAL path under `app/src/`, run `tsc -p tsconfig.app.json` — NOT
  `tsconfig.json`, which compiles no `src/` file — and first put a
  deliberate `const bite: number = "x"` in the file to prove it is in the
  program at all.
- `aggregate.ts` — pure functions over `StatsRow[]` + a range: totals, type
  buckets, season/week/streak/avg-per-day, and AVG WATTS. No `Date.now()`,
  no `Intl`, no `new Date(...)`: today and every row date arrive as
  `{ y, m, d }` triples (§3).
- **AVG WATTS' home.** `logbookWatts` and `logbookCalPerHour` are pure
  formulas that today live in `src/session/logbookDerived.ts:23-37`, which
  the domain may not import. PR 1 MOVES both into `app/domain/logbook.ts`
  and makes `src/session/logbookDerived.ts` re-export them — no behaviour
  change; the existing `logbookDerived` tests are the gate and are not
  edited. `aggregate.ts` then computes watts in the domain.
- **The rule that keeps it there.** Nothing enforces "domain never imports
  `src/`" today (`eslint.config.js:85-135` scopes `no-restricted-imports` to
  `src/**` and names only Capacitor/platform/native). PR 1 adds a second
  block scoped to `domain/**/*.ts` with a `no-restricted-imports` pattern
  forbidding `../src/*`, `**/src/*` and any `@/`-style alias into `src/`,
  with a mutation: a deliberate `import { x } from "../src/platform"` in a
  domain file makes `pnpm lint` go red naming the file; the PR body pastes
  that failure.
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
// app/server/routes/stats.ts — every row of the caller, UNORDERED.
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
  PR 1 (no pagination, no date filter): the client filters.
- **The query.** `WHERE user_id = $1` over the thirteen scalars the tier
  rule needs (`id, logged_at, source, workout_type, ended_by,
  machine_work_seconds, machine_work_meters, work_seconds, work_meters,
  rest_seconds, rest_meters, distance_meters, time_seconds`), plus
  `totalCalories` projected as a NARROW jsonb-path scalar
  (`machine_summary->>'totalCalories'`, the idiom
  `machineAvgPaceSecondsPer500m` already uses at `stores/logs.ts:407-409`),
  plus `steps` WHOLE — the `steps` tier is decided in Node. **No `ORDER
  BY`:** the client sums an unordered set and nothing consumes an order, so
  the `(user_id, logged_at desc, id desc)` composite index is NOT owed by
  this route (the DBA measured a full-history read ignoring it, below).
- **`loggedAt` is a `timestamp` with time zone (`schema.ts:184`) and comes
  off the driver as a JS `Date`; the store maps it and the route serialises
  it with `.toISOString()`** so `StatsRow.loggedAt` is the ISO instant the
  type says.
- **Measured (DBA spec pass, 2026-09-12; PostgreSQL 18.4 in Docker, Apple
  M5, a 1M-row `session_logs`, medians of 5; environment and commands in
  `.claude/agents/dba-ledger.md`, "2026-09-12 — Phase PS spec pass"):**
  a `StatsRow` serialises to **224.8 B**. Per user: 1k rows → 7.4 ms
  query+parse, 225 KB; 10k → 78 ms, 2.1 MiB; 100k → 779 ms, 21.4 MiB.
  `steps` crossing PG→Node is the whole cost — 6.2 µs/row, 5× the
  scalar-only query. `WHERE user_id` uses `session_logs_user_id_idx`
  (Bitmap Index Scan, `rows=` estimate within 3% of actual). A
  `(user_id, logged_at desc, id desc)` composite is IGNORED by a
  full-history read (743 vs 726 ms — noise) and pays only under `LIMIT`. A
  covering index cannot carry `steps` (`INCLUDE` takes columns; steps is up
  to 77 KB), and generated columns help only a SERVER roll-up, which this
  design does not do — **neither Wave E row (the history index, the
  generated columns) opens from this route's shape.** No compression
  middleware exists (`grep compression app/package.json` → none); gzip would
  be 6.4× but is UNTESTED on the live route. Household scale: 260 rows/yr at
  5/week → 58 KB per fetch; a decade → 585 KB.
- **Invariant (RF27 — an unbounded O(rows) route owes an invariant, not a
  measurement):** the stats surface renders a bounded state for any row
  count. The route is unpaginated BY DESIGN up to the measured trigger —
  **any user > 5,000 rows** (the 1 MiB / ~40 ms line; 19 years at 5/week) —
  and the ROADMAP row in §13 owns the cursor or server roll-up beyond it.
  The DBA MEASURES; James RULES on any stored-shape change (PM open-gate
  condition 1, §11): a generated column, an index or any migration is its
  own TRIAD row outside PS, never a side effect of a measurement.
- The adapter (`src/api/useStatsRows.ts`) is the ONE place an instant becomes
  a date: `new Date(loggedAt)` then the LOCAL getters (`getFullYear`,
  `getMonth() + 1`, `getDate`) → `{ y, m, d }` in the device zone, and hands
  the domain `StatsRow & { date: CalendarDate }`. "Today" is converted the
  same way from `new Date()`. §8.3 pins the conversion under a pinned `TZ`.
- **Cache/refetch invariants:** the surface fetches on every mount; no
  in-memory copy outlives the screen; nothing is written to `localStorage`
  (a stats surface has nothing to lose); a row saved or deleted before the
  next mount is reflected on it. Consistent with `useRecentLogs.ts`'s
  fetch-per-mount shape (`:1-2`, hook-local state).
- **Deletes:** nothing to do for every stats figure — a deleted row is
  absent on the next fetch. The test trend is the stated exception (§3.3):
  its points come from `test_history`, which deliberately survives the log
  row's deletion. The DBA found no hazard between the two reads: both are
  plain SELECTs (ACCESS SHARE) on separate pool connections, and a delete
  landing between them yields exactly ruling 4's steady state (the rows
  fetch without the row, the trend with its point).

## 5. Surface

- **You root** (`src/You.tsx`): under the identity card, a two-line headline
  in the house mono label style: `LIFETIME · 412,380 M` / `SEASON 2027 ·
  38,120 M` — ALL column, work metres. Tapping it opens `/you/stats`. **The
  headline is its own component, `src/you/stats/YouStatsHeadline.tsx`,**
  which fetches through `useStatsRows` and computes through the domain;
  `You.tsx` renders it and passes it NOTHING — `You.tsx` already imports
  `Concept2Row` (`You.tsx:7`) and sits outside the §8.4 scan, so the
  Concept2-free surface has to be a file the scan covers.
- **STATS door**: first row of `.you-doors` (`You.tsx:153`), ABOVE
  `BaselinesRow` (`:154`); the four existing rows (`:154-168`) keep their
  order and DIAGNOSTICS stays last, as the comment at `:142-152` requires
  ("Stays the LAST child of You"). Route `/you/stats`, a flat sibling of
  `/you/baselines` (`src/shell/AppRoutes.tsx:258-263`), not in
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
  MONTH presets), with `n OF m CARRY THE MONITOR'S OWN TOTALS` under the
  MACHINE heading. **Captions, each governing only what it can (RF34):**
  the group's caption `ERGOMATIC ROWS ONLY · WORK METRES · REST SHOWN
  SEPARATELY` governs METRES and TIME; the CALORIES row carries `n OF m
  ROWS CARRY IT · MONITOR'S OWN COUNT` (not claimed work-only, §3.2); the
  AVG WATTS row carries `AT THE RANGE'S AVERAGE PACE · WORK-ONLY ROWS`
  (§14 ruling 6). (3) MOTIVATION — `AVG M/DAY THIS SEASON`, `CURRENT
  STREAK`, `LONGEST STREAK`, each streak labelled `WEEKS · ERGOMATIC`;
  (4) TIME BY TYPE — one stacked bar, five buckets, legend below; (5) TEST
  TREND — 2k and 6k as two series of split seconds over date on
  `linearScale`/`chooseTicks(kind: "pace")`, captioned `ALL TESTS · KEPT
  WHEN A LOG IS DELETED` so the one exception is said where it shows.
- **The seam line:** when any row in range is tier `stored`, the totals
  caption gains `k ROWS PREDATE WORK-ONLY TOTALS · NOT IN AVG WATTS` — the
  seam named on the surface, as ruled, and the watts exclusion (§14 ruling
  6) said where the excluded rows are counted.
- **Empty states**, honest text and never sample data: 0 rows → `NO ROWS
  YET · YOUR FIRST SAVED ROW STARTS THE COUNT`; 1 row → totals render
  (PR 1), and PR 2's chart groups read `TWO ROWS MAKE A CHART` below two
  rows in range; **the MACHINE column with zero `pm5` rows in range** (every
  tester who has never connected a monitor) → the column's figures are
  replaced by `NO MONITOR ROWS YET` and its `n OF m` lines are hidden, so
  nobody reads `0 OF 0 CARRY THE MONITOR'S OWN TOTALS`; no test history →
  `NO 2K OR 6K TEST LOGGED` (one test point is drawn as a point — a record
  of one is still a record); a CUSTOM range with no rows → `NO ROWS BETWEEN
  <from> AND <to>`.
- **Gate 0 (before any implementation task):** a rendered HTML artifact of
  the You headline and the whole subpage at 390×844 portrait and 844×390
  landscape, seeded with ≥ 12 real rows across four types plus two free
  rows and one pre-RC-5 `stored` row, beside the current You screen — AND a
  second frame of the subpage with zero `pm5` rows, showing the MACHINE
  column's `NO MONITOR ROWS YET` state. Every colour pairing's ratio
  computed and stated: the pairs this design uses are `--ink` on `--page`
  (15.41:1) and `--ink-3` on `--page` (6.69:1) and on `--surface` (7.43:1),
  all recorded in `docs/design/DEVIATIONS.md:75-79`; the NO TYPE bucket's
  `--ink-4` on `--page` is 4.76:1 (`DEVIATIONS.md:59`). Any new pairing is
  computed at the gate. Every tap target ≥ 44×44 px. RF7: the artifact's
  headline is recomputed from its own rows by hand in the gate message.

## 6. Where the risk is

A `stored`-tier row's metres are fused or work-only with no marker: accepted,
counted by `tier`, named on the surface (§5), never corrected. **AVG WATTS is
the figure the seam amplifies most** — watts is cubic in pace, so a fused
row's rest seconds move it far more than they move metres — which is why
ruling 6 excludes `stored`-tier rows from watts and only from watts. If
`buildHeroes` and `rowContribution` ever disagree the You total stops
equalling the log's detail hero: §8.1 is the gate. A row saved at 23:30 lands
on the right day only if the ADAPTER converts in the device zone; the domain
cannot see the bug and Vitest's zone is whatever the host's is, so §8.3 pins
the conversion under an explicit negative-offset `TZ`.

**This phase has no external oracle except James's own eyes (RF11).**
Invariant 12 forbids reading Concept2; the phase takes no hardware walk
(nothing here reaches the wire); and every figure is a sum of our own
numbers, so no gate this repo owns can say a LIFETIME total is WRONG — only
that it equals what we already store. The one authority that could disagree
is Concept2's logbook page for the rows James has sent there, and the phase's
exit criterion 6 is that comparison, done once by eye (§14 ruling 7). The
expected gap has three named causes — rest metres if Concept2 counts them
(§1), rows never sent, and fused pre-RC-5 rows — and the close record says
which of them the gap was.

## 7. Invariants (numbered; the tests in §8 cite them)

1. Every total on the surface equals the sum, over the rows in range, of
   what the log's DETAIL hero shows for that row (`FromTheLog` via
   `buildHeroes`; ALL column), or of that sum restricted to
   `source === "pm5"` (MACHINE column). The history LIST is NOT the
   authority: it has no `steps` tier (`LogRow.tsx:110-123`) and can differ
   from its own detail on a B2 row — §12.
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
7. Avg watts is the watts of the range's average pace (Σs ÷ Σm) over rows
   whose tier is `machine`, `work-pair` or `steps`, never a mean of per-row
   watts and never fed a `stored`-tier row (§14 ruling 6).
8. Calories is a sum of stored `totalCalories` only; a row without one adds
   0 and the `n OF m` line says so.
9. NO TYPE is a bucket for `workoutType === null` only, drawn without a type
   colour, and never a member of `WORKOUT_TYPES`.
10. Streaks are computed from row dates alone; an unfinished current week
    never breaks a streak.
11. Nothing this phase adds is stored: no column, no migration, no
    localStorage key, no client cache surviving the screen. The DBA
    measures; a measurement never opens a stored-shape change by itself —
    James rules, and any migration is its own TRIAD row outside PS (§4.3,
    §11).
12. **No number, label or empty state on the stats surface reads `verified`,
    `c2ResultId`, `c2UserId`, the Concept2 link state, or any Concept2 API.
    The MACHINE column keys on `source = 'pm5'` only. Concept2 contributes
    only a calendar convention (the season, May 1 to Apr 30) and vocabulary.**
    (James, 2026-09-12: the integration is not production yet.)
13. A deleted log row is absent from every stats figure on the next mount;
    the test trend alone keeps its point, by the schema's deliberate `SET
    NULL` (§3.3, §14 ruling 4), and its caption says so.
14. The domain never reads a clock or a timezone and never parses a date
    string: today and every row date are `{ y, m, d }` inputs.
15. The stats surface renders a bounded state for any row count: the route
    is unpaginated by design up to the measured trigger (any user > 5,000
    rows, DBA 2026-09-12), and the §13 row owns the cursor beyond it.

## 8. Testing — each gate with RF26's five-part contract

### 8.1 Contract: `rowContribution` ≡ `buildHeroes` (invariant 2)

(1) Invariant 2. (2) Producer: every `StoredLog` fixture in
`storedSummary.test.ts` (the tier-A-with-null-rest-pair row, the build-738
row, the free row with `steps: []`, the declined B2 row at `:938-959`, the
fused fallback row) plus rows built via `fromWorkout` from `LIBRARY_WORKOUTS`
(TESTING.md §9), **plus one NEW fixture built for the mutation below: a row
carrying a work pair (`workSeconds`/`workMeters` both > 0) AND
reconstructable step actuals (`endedBy` in the `isReconstructableClose`
allowlist, every step with `actualMeters`) whose Σ `actualMeters` ≠
`workMeters`** — the declined-B2 fixture cannot serve, because it has
`workMeters: null` and a `link-lost` `endedBy`, so it lands in tier `stored`
whichever way the gates are ordered. (3) Observable: `buildHeroes` output
captured from `main` at `3fc49767` BEFORE the refactor, as a committed JSON
fixture. (4) Mutation: swap the `work-pair` and `steps` gates' order in
`rowContribution` → the NEW fixture's metres change from `workMeters` to
Σ steps; expected failure names the fixture id and prints both numbers. (5)
Strongest claim: "for every committed fixture the two agree" — not "for
every row".

### 8.2 Upstream of the producer (RF24; invariants 1, 3, 12)

(1) Invariant 1. (2) Integration test seeds through `POST /api/logs` — one
row per tier, one `manual`, one `pm5` closed `link-lost`, **and at least one
`stored`-tier row shaped like a pre-RC-5 save (fused `distanceMeters`, no
work pair, no machine totals, `endedBy` outside the allowlist) so the
`k ROWS PREDATE` count can go red** (DBA correctness note: its generator
produced zero such rows) — then reads `GET /api/stats/rows`. **The seeded
tier-`machine` row is FUSED on purpose:** `distanceMeters` exceeds
`machineWorkMeters` by a named rest amount, 120 m, because a realistic
post-RC-5 save makes the two equal and the mutation below could not bite.
(3) Observable: the response rows' `workMeters` and `tier`; the response has
NO key named `verified`, `c2ResultId` or `c2UserId` (asserted by key set,
RF33's lesson). (4) Mutation: make the route select `distanceMeters` instead
of calling `rowContribution` → the tier-`machine` row's metres become the
fused figure (machine + 120); expected failure prints both. (5) "The
supported save path produces the projection the surface sums."

### 8.3 Calendar pins and the zone test (RF21; invariants 5, 6, 10, 14)

Season: `2026-04-30 → 2026`, `2026-05-01 → 2027`. Week: `2026-09-13 →
2026-09-07`. Avg/day divisor on May 1 = 1. Streak: weeks {W1, W2, W4} with
today in W5 → current 0, longest 2; with today in W4 → current 1. Empty
range → every total 0, sessions 0, avg watts `undefined`. Every pin is a
`{ y, m, d }` literal; the domain has no `Date` to get wrong. (4) Each pin's
mutation is the off-by-one in the constant it guards (a `<` for `<=`), and
the report names which literal went red.

**The adapter's conversion gets its own test file**
(`src/api/useStatsRows.tz.test.ts`), because nothing in the repo pins `TZ`
(§1) and a calendar pin
that passes in UTC proves nothing about a device in New York. (1) Invariant
5 at the seam. (2) The file sets `process.env.TZ = "America/New_York"` (a
NEGATIVE offset, so a late-UTC instant crosses midnight backwards) at the
top, BEFORE any `Date` is constructed, and ASSERTS the offset took —
`new Date("2026-09-12T12:00:00Z").getTimezoneOffset()` is `240` — because a
property of how the test got there is an assertion, not a comment (RF38).
(3) Observable: the instant `2026-09-12T23:30:00Z` converts to
`{ y: 2026, m: 9, d: 12 }` (the PREVIOUS local day; in UTC it would be the
13th). (4) Mutation: swap the local getters for `getUTCFullYear`/
`getUTCMonth`/`getUTCDate` in the adapter → the assertion reads `d: 13`,
and the report pastes that failure. (5) "The adapter converts in the
process's zone, and the test process's zone is one where it matters."

### 8.4 Structural gate for invariant 12

A unit test reads every file under `app/domain/stats/`, `src/you/stats/`
(which now holds `YouStatsHeadline.tsx`, §5) and `src/api/useStatsRows.ts`
as text and asserts, CASE-INSENSITIVELY, that none contains `verified`,
`c2ResultId`, `c2UserId`, `concept2` or `/api/concept2` — the real module is
`src/api/useConcept2Link.ts` (capital C), and a case-sensitive scan for
`concept2` matches nothing in a file that imports it. It ALSO asserts the
headline component's import list by reading `YouStatsHeadline.tsx`'s
`import` lines and checking each specifier against the same list, so the
one new file `You.tsx` renders is covered even though `You.tsx` itself
(which imports `Concept2Row`, `:7`) is not. A type-level test asserts
`keyof StatsRow` equals the §4.3 literal list. (4) Mutation: add `verified:
boolean | null` to `StatsRow` → the key-set assertion fails naming the key;
add `import { useConcept2Link } from "../../api/useConcept2Link"` to
`YouStatsHeadline.tsx` → the text scan fails naming the file. (5) "No
Concept2 identifier appears in the stats code" — structure, not runtime
behaviour (RF26).

### 8.5 Client and e2e (invariants 1, 8, 9, 13)

- Client: filter presets select the right rows; a CUSTOM `from > to` keeps
  the previous range and shows the §5 string; empty states render the §5
  strings and never a chart; the MACHINE column with zero `pm5` rows renders
  `NO MONITOR ROWS YET` and no `n OF m` line.
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
  numbers). Gates: antagonist ANCHOR pass on this spec (riskiest: §3.1's
  transcription and §7 invariant 12), PM phase-OPEN gate on the slate, DBA
  first pass on §4.3's query shape and growth — all three RUN at
  `93b91d66` and applied in this revision (§15). Docs-only; CI's code jobs
  skip.
- **PR 1 (TRIAD) — domain function, `buildHeroes` refactor, the
  `logbookWatts`/`logbookCalPerHour` move into `app/domain/logbook.ts` with
  `src/session/logbookDerived.ts` re-exporting, the `domain/** → src/**`
  ESLint rule and its mutation, route, adapter with its `TZ`-pinned test,
  `YouStatsHeadline.tsx` as its own component, STATS subpage with filter bar
  and the whole TOTALS group (both columns, rest, calories, avg watts and
  both `n OF m` lines), the seam line, empty states including the MACHINE
  column's.** Gates: Gate 0 first (§5); `/harden` on the plan (two lenses,
  capped); the DBA gate below; full e2e read; PM final-PR gate.
  **PR 1's DBA gate is the protocol the spec pass prescribed, run against
  the SHIPPED store query, scripts committed under
  `docs/superpowers/research/2026-09-12-stats-rows/`:** (a) seed 1M rows
  with three users at 1k / 10k / 100k using
  `docs/superpowers/research/2026-09-07-machine-summary-jsonb-vs-columns/02-gen.sql`
  retargeted at `session_logs`; (b) medians of 5 plus `EXPLAIN (ANALYZE,
  BUFFERS)` of the shipped query at all three scales; (c) the real payload
  through the e2e backdoor — `TEST_AUTH_SECRET` sign-in, then
  `curl -s -b jar localhost:8080/api/stats/rows | wc -c`, with AND without
  `Accept-Encoding: gzip`, saying which is reported; (d) the plan's literals
  to beat: **bytes/row ≤ 240 and the 10k-row user's p95 ≤ 150 ms**; (e) the
  §8.2 fixture carries ≥ 1 `stored`-tier row. The verdict names the scale
  that decided it.
- **PR 2 — MOTIVATION, TIME BY TYPE, TEST TREND.** Gates:
  antagonist DELTA pass scoped to §3.3 streak/avg-per-day definitions only
  (new invariant classes against the anchor's vetted ground; AVG WATTS
  ships in PR 1 and was attacked by the anchor); DBA SKIP stated aloud
  unless a query changes (test-history's GET is unchanged); no PM per-PR
  gate (non-triad UI); Gate 0 for its groups rides PR 1's artifact, which
  renders all five groups.
- Fast path applies to nothing here (`app/domain/` and `app/server/` in
  PR 1; a wrong version produces a wrong number). PR 1 is one plan: the
  domain function and its contract test, the route and its seam test, and
  one screen whose only chart-free group is TOTALS — one risk model (the
  number's meaning) for one reviewer; the charts wait for PR 2.

## 10. Exit criteria

1. §8.1–8.5 green with each mutation's failure text in the PR body,
   including the ESLint rule's (§4.1) and the `TZ` test's (§8.3).
2. `grep -rin "verified\|c2ResultId\|c2UserId\|concept2" app/domain/stats
   app/src/you/stats app/src/api/useStatsRows.ts` returns nothing (the §8.4
   gate's grep — case-insensitive, or it cannot see `useConcept2Link` —
   pasted).
3. The DBA verdict is attached to PR 1 with the §9 protocol's numbers at
   1k / 10k / 100k rows, the two plan literals met or the miss explained,
   and a ruling on pagination against the 5,000-row trigger. The
   generated-columns and history-index items are CLOSED for this route by
   the 2026-09-12 measurement; reopening either is James's call on its own
   TRIAD row, never PR 1's.
4. Gate 0 approved before PR 1's first implementation commit, with ratios
   and the zero-`pm5` MACHINE frame.
5. **Totals at ≥ 1 row, verified at PR 1:** a rower with one saved row sees
   real totals on You and `/you/stats` equal to that row's detail hero; at
   0 rows, the §5 empty state; with no `pm5` row, the MACHINE column's.
   **Charts at ≥ 2 points, verified at PR 2:** the chart groups render at
   two rows in range and read their §5 string below. Each half is checked
   at the PR that ships it — a criterion cannot be verified on a build where
   its code does not exist (RF24).
6. **The eyeball oracle (§14 ruling 7):** on the TestFlight build carrying
   PR 1, James compares LIFETIME and THIS SEASON on You against his own
   Concept2 logbook page, once, by eye. The phase's close record carries
   both pairs of numbers and the gap's explanation — rest metres, rows never
   sent, fused rows — or "no gap". It is the phase's only external oracle
   (§6, RF11).

## 11. Out of scope

PBs and Lifetime Bests; the Million Metre Club; Concept2 import or catch-up
metres; storing machine type (the existing register row owns it; every row
is a RowErg row until then); `completedAt` as the row date; per-row watts;
charts beyond one stacked bar and one two-series line. **Generated columns,
an index, or any migration:** the DBA measures and James rules — a
stored-shape change is its own TRIAD row outside PS, and the 2026-09-12
measurement found neither Wave E row reachable from this route's shape
(§4.3). **The Concept2 work+rest live check (§13) is INFORMATIONAL and can
never change a number here** — §7 invariant 12 forbids it structurally.

## 12. Inherited obligations

- **RC's photograph ruling** (`docs/history/phase-rc.md:1072`): the first
  surface displaying any of the nine `summaryDetail` fields owes a
  photograph against the PM5's own screen. **PS shows a SUM, which no PM5
  screen shows; the obligation stays with Phase LP's per-session surface**
  and its parity-photograph row in the ROADMAP (Wave E, "Phase LP's parity
  photograph"). Stated, not discharged.
- **RC-16** (`phase-rc.md:1973`): terminate doubles `avgStrokeRate`.
  Irrelevant — stroke rate is not displayed here.
- **The history LIST disagrees with its own detail on a B2 row.**
  `LogRow.tsx:110-123`'s `heroDistanceMeters` has machine, work-pair and
  stored tiers and no `steps` tier; its own comment (`:108-109`) says a
  TRUSTED TIER B2 row "still disagrees". So for such a row the list metres
  differ from the detail hero and from LIFETIME. Pre-existing and
  self-documented; PS names the DETAIL hero as its authority (invariant 1)
  and files the list as a row (§13) rather than widening its own risk model
  into a list-surface change.
- The RC-5 hazard the deferred PS row carried is §6, resolved by naming.

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
- **`GET /api/stats/rows` grows a cursor or a server roll-up when any user
  passes 5,000 rows.** Measured 2026-09-12 (DBA): 224.8 B/row, 2.1 MiB and
  78 ms at 10k rows; 5,000 is the 1 MiB line, 19 years away at 5/week. What
  would fix it now: a cursor — not done because the household's busiest
  user has 16 rows and a cursor would be untestable ceremony (memory: five
  users is not a population). · dies 2027-09-12 · the check is a count
  (`select user_id, count(*) from session_logs group by 1 having count(*) >
  5000`), not a build.
- **The history LIST has no `steps` tier** (`LogRow.tsx:110-123`), so a B2
  row's list metres differ from its detail hero and from LIFETIME (§12).
  What would fix it now: project Σ `actualMeters` server-side into
  `LOG_LIST_COLUMNS` so the list can take the tier without shipping `steps`
  — not done because it is a list-surface change outside PS's risk model.
  · dies 2026-10-12 · pre-existing, self-documented in the code, and PS
  names the detail hero as its authority.

The two Wave E rows this phase was expected to open (the history index and
the generated columns) are NOT opened: the DBA measured on 2026-09-12 that
neither helps a per-row projection (§4.3). Both are given a `dies` date on
the way past (campsite rule) and James rules keep/kill at the PR 0
hand-back. The photograph and machine-type rows already exist and are not
touched by this spec.

## 14. Rulings (James, 2026-09-12)

Five points where a repo fact pulled against the approved design, ruled on
the day the design was approved (1-5), and three ruled at the phase-open
gates the same day (6-8). The rulings are applied above; this section is the
record.

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
6. **AVG WATTS EXCLUDES `stored`-tier rows** (rows carrying only the fused
   figure). Watts = `logbookWatts` over Σs/Σm of rows whose tier is
   `machine`, `work-pair` or `steps`. Metres, time and sessions still count
   `stored`-tier rows. The `k ROWS PREDATE WORK-ONLY TOTALS` line says those
   rows are excluded from watts (§3.2, §5, invariant 7).
7. **The oracle.** Exit criterion 6: James compares LIFETIME and THIS SEASON
   on You against his own Concept2 logbook page once, by eye, on the
   TestFlight build; both numbers and the gap's explanation (rest metres,
   rows never sent, fused rows) go in the phase's close record. §6 states
   that the phase has no other external oracle and why (RF11).
8. **`CLAUDE.md` names three standing agents.** The "Two standing agents"
   paragraph becomes three, with a `dba` sub-bullet in the same register as
   the other two (triggers: spec / plan-measure / gate on `app/server/db`,
   the stores and bulk-read routes; SKIP said aloud; the TRIAD stored-shape
   override; PASS / PASS WITH ROWS / FAIL with measured numbers; proposes to
   `dba-techniques.md` + `dba-ledger.md`, never writes), plus one sentence:
   a PR that adds or removes a standing agent under `.claude/agents/`
   updates that paragraph in the same commit — an agent the corpus does not
   name is invisible to every future dispatch. Applied in PR 0.

## 15. Gate record (PR 0, at `93b91d66`)

- Antagonist anchor pass: product shape HELD (the §3.1 transcription,
  MACHINE-by-door, watts as the range's pace, the Concept2 claims, the
  write-path calories guard, the RC-1 rest source, `SET NULL`); 11
  evidence/gate defects found and fixed in this revision. Ledger:
  `antagonist-ledger.md`, "Phase PS anchor pass, 2026-09-12".
- PM phase-open gate: PASS WITH CONDITIONS, 6, all applied here. Ledger:
  `pm-ledger.md`, "2026-09-12 — Phase PS open gate".
- DBA spec pass: PASS WITH ROWS, 1 row (§13's cursor row); neither Wave E
  row opens from this route. Ledger: `dba-ledger.md`, "2026-09-12 — Phase
  PS spec pass".
