# Phase PS — career stats on the You tab

**TRIAD: a number's meaning.** Every figure here is a SUM over stored rows, and
the row's own metres already mean two things depending on when it was saved
(RC-5, `app/server/db/schema.ts:251-266`). PR 1 carries `/harden`, a DBA gate
and a PM final gate; the phase opened with an antagonist anchor pass, a PM
slate gate and a DBA spec pass, all three run at `93b91d66` (§15). James's
approved design (2026-09-12) is the authority for every decision below; five
points where a repo fact pulled against it were put to him and ruled the same
day, three more were ruled at the phase-open gates, and eight at Gate 0 on
the rendered canvas (rulings 9-16; §5, §15) — §14 records each ruling
(RF10). Two more were RULED on PR 2's Gate 0 addendum boards (rulings
20-21; §5.1), asked and answered after v0.46.0 shipped PR 1.

## What and why

A rower who has used the app for a month has no way to see what they have
done: no lifetime metres, no season, no "am I rowing more than last month".
Concept2's logbook shows all of that on its front page, and a rower who sends
their rows there (Wave E) sees a career total on one site and nothing on the
other. This phase puts the career on the You tab — a hero on You itself
(LIFETIME and THIS SEASON metres over one WORK TIME BY TYPE bar) that is
itself the door to a subpage with a date filter, totals in two columns (every
row, and rows the monitor measured), rest, calories and average watts, metres
per week, time by Erg Book type, the season's cumulative curve with its
average metres per day and weekly streaks, and the 2k/6k test trend. Every
number is the sum
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
  and are the only chart primitives (`ls app/src/charts/` → those two files
  and their tests, 2026-09-12); there is no stacked-bar, bar or line
  primitive, so PR 1 adds the stacked bar (§9). The design handoff's Trend
  block is a SKETCH, not a chart spec
  (`docs/design/handoffs/2026-08-07-news-tab/README.md:96`); its §9 item 1
  names `#c9c3b2` for previous-week bars, which Gate 0 measured at 1.73:1
  and replaced (§14 ruling 12).
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
| Lifetime metres | Yes | Σ over our rows only, work-only | Us, if a rower expects their C2 catch-up or pre-Ergomatic metres — the `ERGOMATIC ROWS ONLY` subtitle was struck by ruling 18, so nothing on the surface says so |
| Avg metres/day this season | Yes (Honor Board) | Same formula, divisor pinned in §3.3 | Us, by at most one day of divisor if the INFERENCE is wrong |
| Weekly streak | **No.** Concept2 has no streak | Ergomatic-invented, labelled `ERGOMATIC` on the surface | Us; it asserts nothing on Concept2's behalf |
| Type buckets (AN · AT · O2 · TR) | No — C2 has no intensity axis | Erg Book's own axis; a free row is NO TYPE, not a fifth peer (`just-row-design.md:802-806`) | Nobody: purely ours |
| MACHINE vs ALL | No — C2 has no such split | `source = 'pm5'` is the stored door (`schema.ts:230`); MACHINE = by door (§14 ruling 1) | Us: a `pm5` row that closed `link-lost` is MACHINE by door but its tier is `stored` (§3.1); nothing on the surface says so since ruling 19 struck the `n OF m` line — the count is computed only |
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
- **Monitor's own totals count** (MACHINE only): n = rows in tier `machine`,
  m = |rows(R, MACHINE)| — computed (`ownTotals`, `sessions`) and, since
  ruling 19, NOT printed; the `n OF m …` line is gone from the surface.
- **Rest metres** (MACHINE only) = Σ `restMeters` non-null — the stored RC-1
  pair, what the TOTAL line shows (§14 ruling 2).
- **Calories** (MACHINE only) = Σ `calories` non-null; `caloriesRows` (n
  of m = |rows(R, MACHINE)|) is computed but, since ruling 18, NOT printed —
  the `n OF m ROWS CARRY IT · MONITOR'S OWN COUNT` caption was struck. The
  definition stands: nothing establishes that the PM5's `totalCalories`
  is work-only (`oracleCorpusReplay.test.ts:916-920` proves only that it
  equals Σ split calories), so the WORK METRES caption does not govern it.
- **Avg watts** (MACHINE only) = `logbookWatts(Σ workSeconds, Σ workMeters)`
  over rows whose tier is `machine`, `work-pair` or `steps` AND whose both
  values are non-null — **`stored`-tier rows are EXCLUDED** (§14 ruling 6):
  a fused row's seconds-per-metre includes rest, and watts is cubic in pace,
  so one fused row moves the figure more than it moves metres. It is the
  watts of the range's average pace, never a mean of per-row watts.
  `undefined` (a dash) when either sum is 0. Metres, time and sessions still
  count `stored`-tier rows; no caption names the exclusion any more
  (rulings 18/19). **The exclusion and the `k` count (`storedTierRows`,
  computed, never printed since ruling 19) cover ONLY `source ===
  "pm5"` rows in the stored tier (§14 ruling 17):** a timer or manual row
  in that tier is what the rower typed — work by definition — so it is
  never in k, and being outside the MACHINE column (ruling 1) it never
  enters the watts figure either way.
- **Time by type** = Σ `workSeconds` grouped by `workoutType` ∈ {AN, AT, O2,
  TR} plus NO TYPE for `null` — five buckets, one stacked bar in the STACK
  ORDER `AN · AT · O2 · TR · NO TYPE` (§14 ruling 13: the dataviz palette
  validator fails the earlier AN · O2 · AT · TR listing on the O2↔AN
  adjacency, ΔE 11.3 < 15 and deutan 4.9; the drawn order passes at 16.8
  normal / 13.5 protan, `docs/design/career-stats/build.mjs` header). NO
  TYPE is drawn in `--ink-4` with no type colour so it cannot read as a fifth
  intensity. A bucket's share = its seconds ÷ the range's Σ `workSeconds`;
  the legend prints each share as a whole percent (Gate 0's ALL legend reads
  `AN 6% · AT 27% · O2 43% · TR 10% · NO TYPE 15%`, whose integers sum to
  101 by independent rounding — the invariant is on SECONDS, §7 invariant
  17, not on the printed integers). A bucket with 0 s has no segment and no
  legend row. Computed over the same `rows(R, ALL)` as METRES.
- **Metres per week** (PR 2) = Σ `workMeters` over `rows(R, ALL)` grouped by
  the Monday-start week of the row's date, drawn as eight bars ending at the
  week containing the range's LAST day (today for every preset; TO for
  CUSTOM). Gate 0 pins the ALL series for the seed: `0 · 0 · 10,000 · 0 · 0 ·
  13,000 · 3,000 · 2,000` for the weeks of 2026-07-20 … 2026-09-07 with
  today = 2026-09-12 (`compute.mjs`). The calendar's current week is drawn in
  `--ink` and labelled `THIS WK`; every other week in `--ink-4` (§14 ruling
  12). NOT DRAWN at Gate 0: a CUSTOM range whose TO precedes this week — by
  the caption's own two clauses the eighth bar is then TO's week, labelled by
  its date, and no bar is in ink; the plan states this case and its test.
- **Season cumulative** (PR 2) = the running Σ `workMeters` (ALL) from May 1
  of the current season to today, one point per row date, NOT filtered by
  the range; its end label is `<total> TODAY`. AVG M/DAY and both streaks
  (§3.3) sit under it in the same group.

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
  date in it — **ROWS, not metres:** a week whose only row contributes
  `null` or 0 `workMeters` (a `stored`-tier row with `distanceMeters` null,
  say) still counts, because the rower rowed that week whatever the record
  kept. CURRENT = the run of counting weeks ending at the week containing
  today, or at last week if this week has none yet — a streak is not broken
  by a week that has not finished. LONGEST = the longest run of consecutive
  counting weeks WITHIN THE CURRENT SEASON — the same May 1 … today row set
  as every other figure in the card (invariant 19; §14 ruling 22, which
  withdrew this line's earlier "anywhere in the rower's history": a run
  that ends before May 1 never counts, and a run straddling May 1 is
  counted from May 1). Both are integers ≥ 0.
  **`docs/design/career-stats/seed.mjs`'s `streaks()` keys on METRES and is
  therefore NOT the reference for the streak** (PR 2 delta pass,
  2026-09-12); this rule is, and §8.3 pins the null-metres week.
- **Test trend:** two series (`2k`, `6k`) of `splitSeconds` over the date
  of `test_history.loggedAt` — the APPEND instant, which equals the log's
  save instant on every production path (`PUT /api/baselines`'s
  `isTestResult` arm, `routes/data.ts:1151`, appends at request time) —
  from `GET /api/test-history`, not filtered by the range (a trend needs its
  whole history). Because x is the append instant,
  a test seeded for a past date must BACKDATE its `test_history` row as
  well as its log (§8.5). **This is the
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

Every string, height and ratio below is the Gate 0 canvas as approved
(James, 2026-09-12; artifact
https://claude.ai/code/artifact/c8ad61d9-853b-4262-9051-032f90e90cf2;
sources committed at `docs/design/career-stats/` — `seed.mjs` is the ONE
source every artboard and `compute.mjs`'s printed arithmetic draw from,
`build.mjs` emits the artboards, `contrast.json` and `hero-heights.json` are
its measured outputs). Artboards are cited by id (`A2-H3-You.dc.html`,
`A3-StatsPortrait.dc.html`, `A4-StatsLandscape.dc.html`,
`A6a-Empty0Rows.dc.html`, `A6b-Empty1Row.dc.html`,
`A6c-NoMonitorRows.dc.html`, `A7-Contrast.dc.html`).

- **You root** (`src/You.tsx`): under the identity card, the **hero** — Gate
  0's H3 TIME BY TYPE (§14 ruling 9), **140 px tall in portrait as
  shipped** — measured ONCE, hairline to hairline on
  `docs/screenshots/you.png`: the two full-width `--rule-2` (`#ded8c9`)
  pixel rows are 120 and 259 (a PNG IDAT scan counting rows where ≥ 90 %
  of pixels between x = 24 and x = 366 are that colour; PR #417's fix
  round, re-measured after ruling 18 struck the caption), so
  259 − 120 + 1 = 140. The canvas candidates measured H1 201 / H2 142 /
  H3 181 (`hero-heights.json`); the shipped chip legend wraps tighter and
  carries no caption, which is the whole difference. Full content width. Top to bottom (A2-H3): one row carrying `LIFETIME ·
  56,752 M` and `SEASON 2027 · 43,012 M` (house mono label style, ALL column,
  work metres, tabular numerals; the two spans sit space-between and wrap
  when the width forces it); one 24 px stacked bar in the §3.2 order with
  2 px surface gaps; the legend as swatch CHIPS — one per non-empty
  bucket, `AN 6%` … `NO TYPE 15%`, A2-H3's own markup (`build.mjs`
  `stackSvg(…, { compact: true })`), wrapping when the width forces it;
  the artboard wins over any run-of-text reading of this line; NO caption
  under the legend (ruling 18 struck `WORK TIME BY TYPE · ALL ROWS`). **It
  replaces the
  two-line headline the design first carried** (ruling 9). **The hero IS the
  door (§14 ruling 10):** tapping anywhere on it opens `/you/stats`. It is
  ONE focusable control — a `Link` whose accessible name is `Stats`, ≥ 44 px
  tall, with the house visible focus ring — and contains no other
  interactive element; the bar inside it is decoration for the accessible
  name (the legend text carries the values), so the control has exactly one
  name (§7 invariant 16). **The hero is its own component,
  `src/you/stats/YouStatsHero.tsx`,** which fetches through `useStatsRows`
  and computes through the domain; `You.tsx` renders it and passes it
  NOTHING — `You.tsx` already imports `Concept2Row` (`You.tsx:7`) and sits
  outside the §8.4 scan, so the Concept2-free surface has to be a file the
  scan covers.
- **The doors group is unchanged (ruling 10):** `.you-doors` (`You.tsx:153`)
  stays `BaselinesRow` · `Concept2Row` · SETTINGS · DIAGNOSTICS (`:154-168`),
  DIAGNOSTICS last as the comment at `:142-152` requires ("Stays the LAST
  child of You"). **There is NO separate STATS row** — A2-H3 was drawn with
  one before the ruling struck it, and the ruling governs. Route
  `/you/stats`, a flat sibling of `/you/baselines`
  (`src/shell/AppRoutes.tsx:258-263`), not in `HIDDEN_TABBAR_PREFIXES`.
- **Landscape You scrolls (§14 ruling 14):** the hero pushes the doors below
  the 390 px fold (`A2-H3-YouLandscape` marks `VIEWPORT BOTTOM · 390PX ·
  PAGE SCROLLS`); accepted, no landscape-only layout.
- **`/you/stats`**, top to bottom (A3 portrait, A4 landscape — the same
  single column, the page scrolls in both):
  (1) `← BACK` (`.back-link`, 44 px) and the title `Stats`; the **filter
  bar** — six 44 px chips `ALL · SEASON · YEAR · MONTH · 30 DAYS · CUSTOM`
  (58 px wide each at the 350 px content width), roving-tabindex radiogroup
  copied from `PaceRefInput` (RF8), ALL selected on first open; NO caption
  under it (ruling 18 struck `RANGE APPLIES TO …`) but ONE range LINE,
  ruling 21's variant A on every preset (§5.1). CUSTOM reveals
  two `<input type="date">` at 16 px (44 px tall), seeded FROM = today − 29,
  TO = today, applied on change, and while FROM > TO the previous range
  stays and the inputs read `FROM MUST NOT FOLLOW TO` (A5b).
  (2) **TOTALS** — **NO prose at all (ruling 19, which struck the two
  lines ruling 18 had kept — the `k ROW(S) PREDATE WORK-ONLY TOTALS` seam
  line and the `n OF m MACHINE ROWS CARRY THE MONITOR'S OWN TOTALS`
  footnote).** The page is the title, the filter bar, the TOTALS heading
  and card, the TIME BY TYPE heading, bar and legend, and the empty-state
  lines only (the range line, §14 ruling 21, is the one exception — one
  line, every preset, §5.1). The card itself is the header row
  `ALL ROWS | MACHINE`, rows METRES /
  TIME / SESSIONS in both columns, then REST METRES / CALORIES / AVG WATTS
  under MACHINE only (§14 ruling 5: calories and watts are rows of this
  group, never a group of their own — the "lifetime + monthly" ruling is
  met by the ALL and MONTH presets). STRUCK by ruling 18: the `ERGOMATIC
  ROWS ONLY · WORK METRES · REST SHOWN SEPARATELY` subtitle, the in-card
  `n OF m CARRY …` header line, the CALORIES `n OF m ROWS CARRY IT ·
  MONITOR'S OWN COUNT` line and the AVG WATTS `AT THE RANGE'S AVERAGE PACE
  · WORK-ONLY ROWS` line — the exclusions those captions named (§3.2,
  ruling 6) still hold in the numbers, unlabelled.
  (3) **METRES PER WEEK** (PR 2) — eight bars ≤ 24 px wide on a `linearScale`
  y-axis with `chooseTicks` gridlines and NO caption (rulings 18/19 struck
  the design's `EIGHT WEEKS ENDING AT THE RANGE'S LAST DAY …` line); the window
  anchors on `to ?? today` (the range's TO for CUSTOM, today for every
  preset); the current week in `--ink`, the others in `--ink-4`; **value
  labels on the CURRENT bar and the TALLEST bar only** — A3's own rule
  (`build.mjs`: `cur || i === maxI`), so A3 carries exactly two bar labels,
  `13,000` and `2,000`; the `10,000` the first draft read as a bar label is
  a GRIDLINE TICK (PR 2 delta pass, 2026-09-12). **Weeks that start before
  the range's FROM render as a dashed `--rule-2` outline** (out of range —
  reachable on MONTH, 30 DAYS and any CUSTOM whose FROM is inside the
  window; never on ALL); the week containing FROM is in range even when
  FROM is not a Monday — a partial first week is drawn like any other. x
  labels every other week by date (`27 JUL · 10 AUG · 24 AUG · THIS WK`).
  (4) **TIME BY TYPE** (PR 1 — the hero already needs the computation and
  the bar, so the group ships at no extra cost, §9) — the same stacked bar
  as the hero, with NO caption (ruling 18 struck `WORK TIME · NO TYPE IS
  ERGOMATIC'S OWN BUCKET …`), and a legend of one row
  per non-empty bucket: swatch, name, time, whole-percent share (A3: `AN
  13:43 6% · AT 1:03:39 27% · O2 1:44:04 43% · TR 23:07 10% · NO TYPE
  35:06 15%`).
  (5) **SEASON <name>** (PR 2; A3 reads `SEASON 2027`), with NO caption
  (rulings 18/19 struck the design's `MAY 1 TO TODAY · ALWAYS THIS SEASON ·
  NOT FILTERED` line) — the cumulative curve (2 px
  `--ink` line, ≥ 8 px end dot, y-axis in metres, x labels `MAY · AUG · NOV
  · FEB · APR`) with its end label `43,012 TODAY`; under it three figures:
  `AVG M/DAY` `319 M`, `CURRENT STREAK` `3` `WEEKS · ERGOMATIC`, `LONGEST
  STREAK` `3` `WEEKS · ERGOMATIC` (A3 also draws a 16-cell streak strip; it
  is NOT built — §11, PR 3 or never).
  **Every figure in this card — the curve, `<n> TODAY`, AVG M/DAY and both
  streaks — is computed from ONE row set, the UNFILTERED current-season rows
  (invariant 19).** The approved A5-CustomOpen artboard breaks this: its
  curve reads `18,000 TODAY` (the FILTERED set) beside `AVG M/DAY 319`
  (319 × 135 = 43,065, the unfiltered set) under a caption reading `NOT
  FILTERED` — the builder passed two row sets to one card (PR 2 delta pass,
  2026-09-12); the invariant governs, not the artboard. **Empty states —
  ONE rule (James, 2026-09-12, the PR 2 plan's reconciliation):** the card
  renders at ≥ 1 season row; at 0 season rows it reads `NO ROWS THIS SEASON
  YET`, whatever the lifetime count — reachable by every rower every early
  May; the curve needs ≥ 2 points, so at exactly 1 season row the card
  reads `TWO ROWS MAKE A CHART`, like the other charts.
  (6) **TEST TREND** (PR 2) — 2k (`--ink`) and 6k (`--type-o2`) as two series
  of split seconds over the date of `test_history.loggedAt` (the append
  instant, §3.3) on `linearScale`, the axis inverted so faster is higher
  (`FASTER IS UP` sits in the legend). **The y-axis uses a NEW `TickKind`,
  `"split"`,** added to `src/charts/axis.ts`'s union (`"pace" | "rate" |
  "hr" | "time"` today, `axis.ts:69`): whole-second splits printed `m:ss`
  with no tenths (`1:55 · 2:00 · 2:05`), at `chooseTicks`'s own nice steps
  only — `chooseTicks(domain, count)` takes NO kind (`axis.ts:52`) and its
  `niceNum` admits only 1/2/5/10 × 10^k, so the 4-second step behind the
  first draft's hand-typed `1:54 · 1:58 · 2:02 · 2:06` is unreachable, and
  `formatTick(v, "pace")` would print `1:55.0` (PR 2 delta pass, 2026-09-12;
  A3's ticks were typed and sliced in `build.mjs`, never produced by the
  primitive). The domain top follows `build.mjs`'s `niceMax` rule (`:159`):
  the series' maximum rounded UP to the smallest step in 1/2/5 × 10^k that
  leaves ≤ 4 gridlines — the rule under which `chooseTicks` reproduces A3's
  metres ticks exactly (delta pass, HELD); for the seed's split domain
  `[112, 126]` at count 4 the primitive yields `115 · 120 · 125`, printed
  `1:55 · 2:00 · 2:05`. 2 px lines, ≥ 8 px dots with a
  2 px surface ring, the last point of each series labelled (`6K 2:01.4`,
  `2K 1:54.0`), a `2K · 6K · FASTER IS UP` legend, and NO caption (rulings
  18/19 struck the design's `ALL TESTS · KEPT WHEN A LOG IS DELETED · NOT
  FILTERED` line; the one exception is stated in §3.3, invariant 13 and the
  chart's accessible name, not on the surface).
- **Empty states**, honest text and never sample data:
  - **0 rows** (A6a; §14 ruling 16): the page is `← BACK`, `Stats` and `NO
    ROWS YET · YOUR FIRST SAVED ROW STARTS THE COUNT` — **the filter bar is
    hidden**, and so is every group.
  - **1 row** (A6b): the filter bar and TOTALS render in full (`237` W for
    R13 alone; A6b's `1 OF 1 CARRY …` line was struck by ruling 19); METRES PER WEEK, TIME
    BY TYPE and SEASON each read `TWO ROWS MAKE A CHART` under their heading
    (PR 1 renders TIME BY TYPE's; PR 2 the other two); TEST TREND draws its
    one point — a record of one is still a record.
  - **Zero `pm5` rows in range** (A6c; ruling 16 — every tester who has never
    connected a monitor): the header row keeps both headings and the
    METRES / TIME / SESSIONS rows keep an EMPTY MACHINE cell (the column does
    not collapse); `NO MONITOR ROWS YET` sits on the column's own line under
    them; **the REST METRES, CALORIES and AVG WATTS rows are HIDDEN** (the
    `n OF m` lines this once also hid are gone everywhere since ruling 19).
    The charts still render from the ALL rows (A6c: `20,000`
    metres, `AVG M/DAY 133 M`, `CURRENT STREAK 0`, `LONGEST STREAK 1`).
    One place the artboard and the ruling differ: A6c draws `AN 0:00 0%`
    and `NO TYPE 0:00 0%` legend rows for its two empty buckets; invariant
    17 (a 0-s bucket has no segment and no legend row) governs, and the plan
    omits those rows.
  - **No test history**: `NO 2K OR 6K TEST LOGGED` under the TEST TREND
    caption (A6c).
  - **A CUSTOM range with no rows**: `NO ROWS BETWEEN <from> AND <to>` — not
    drawn at Gate 0; the plan renders it in the TOTALS group's place with the
    filter bar still shown (the rower needs the bar to leave the range).
- **Gate 0 — APPROVED 2026-09-12 (James), exit criterion 4 met.** What was
  shown: the You hero in three candidate heights (H1 / H2 / H3, portrait and
  landscape) beside the current You screen, the whole subpage at 390×844 and
  844×390, the CUSTOM open and error frames, the three empty frames above,
  and A7's contrast and hit-target tables — all seeded from `seed.mjs`'s 13
  rows across four types plus two free rows and one pre-RC-5 `stored` row,
  plus 6 test rows, and every headline recomputed from those rows by
  `compute.mjs` (RF7). **The seed is the phase's reference fixture** (§8.5).
  - **Contrast, every pairing computed (`contrast.json`, WCAG 2.1 relative
    luminance; hexes verbatim from `app/src/theme/tokens.css`):** text —
    `--ink` on `--page` 15.41:1, `--ink` on `--surface` 17.11:1, `--ink-3`
    on `--page` 6.69:1, `--ink-3` on `--surface` 7.43:1, `--ink-2` on
    `--surface` 10.81:1 (unselected chip), `--on-color` on `--ink` 17.11:1
    (selected chip), `--ink-4` on `--page` 4.76:1 (the one caption naming
    the NO TYPE bucket); **every text pairing clears 4.5:1 and every one but
    the NO TYPE caption clears 6.69:1.** Data marks (WCAG 1.4.11, 3:1) —
    `--ink` 17.11:1 (current-week bar, 2k line, rowed cells, season curve, TR
    segment), `--ink-4` 5.29:1 (previous-week bars, NO TYPE segment),
    `--type-an` 8.00:1, `--type-at` 5.53:1, `--type-o2` 6.65:1, `--accent`
    5.94:1 (active tab mark); **every data mark ≥ 5.29:1.** Below 3:1, all
    NON-TEXT and none a data mark: the two house hairlines that predate this
    design (`--rule-3` on `--surface` 1.73:1 — filter strip and date-input
    borders; `--rule` on `--page` 1.32:1 — card border) and the decorative
    gridlines and not-rowed cell outline (`--rule-2` on `--surface` 1.40:1;
    the rowed FILL carries the state at 17.11:1). Two candidates for
    previous-week bars were measured and REJECTED: the handoff's `#c9c3b2`
    (`--rule-3`) at 1.73:1 and `--ink-5` at 2.75:1 (§14 ruling 12).
  - **Hit targets (A7):** the hero ≥ 44 px (140 px shipped, 181 px on the
    canvas), `← BACK` 44 px min
    height and width, each filter chip 44 × 58 px, each date input 44 px
    tall, tab items 44 px + safe-area padding, Sign out 44 px. Chart marks
    are not tap targets in PR 1; PR 2's hover/tooltip layer owns them, with
    a hit target larger than the mark (dataviz).
  - The dataviz palette validator's lightness-band and chroma-floor checks
    fail for every house token because the palette is deliberately muted;
    reported, not acted on (A7).

### 5.1 PR 2 addendum (Gate 0 RULED 2026-09-12)

Two notes from James on 2026-09-12, given after v0.46.0 (build 977, PR 1)
was on his phone, rendered as boards (`docs/design/career-stats/README.md`,
"PR 2 addendum": `B0`-`B3` and their pressed frames, `C1`) and RULED by him
on sight the same day. §14 rulings 20 and 21 are the record; this section
carries what PR 2 builds.

- **Hero affordance (§14 ruling 20 — B1).** "On the You tab I'd like to
  experiment with how to indicate that the row is clickable." The hero is
  the door to `/you/stats` (ruling 10) and, as shipped, signalled nothing
  tappable. **Built:** a trailing `›` chevron, vertically centred, its
  right edge on the `.you-doors` chevron column (the hero's `padding: 12px
  2px` already matches `.diag-row`'s `13px 2px`), in the doors' own style
  — mono 12 px / 0.08em, `--ink-3` on `--page` (6.69:1) — with the
  figures, bar and legend in a column beside it (`B1-You`: 140 px, the
  same as shipped; the column loses the chevron's width). **And a pressed
  state:** `.you-stats-hero:active { background: var(--surface-sunken) }`
  — the fill measures 1.06:1 against `--page` (a cue, not a mark) and
  every text and data-mark pairing on it clears its floor
  (`contrast.json`, the `surface-sunken` rows). Invariant 16 holds
  unchanged: ONE focusable control, no nested interactive element, the
  accessible name EXACTLY `Stats` by the explicit `aria-label="Stats"`
  already on the link; the chevron is `aria-hidden`, like the doors'.
  Not taken: the card edge (`B2`, 148 px) and the `STATS ›` label (`B3`).
- **Range line under the filter bar (§14 ruling 21 — variant A, every
  preset).** "I'd like the date range for a season to be visible when you
  click on it — for consistency maybe all date ranges become visible?"
  **Built:** one line of mono caps directly under the filter bar (under
  the CUSTOM inputs when they are shown), `.stats-caption`'s style
  (`--ink-3` on `--page`, 6.69:1), naming the days the totals cover —
  never a day the range does not contain (`presetRange`,
  `app/domain/stats/calendar.ts`, sets `to = today` for SEASON, YEAR,
  MONTH and 30 DAYS). Copy, with today = 2026-09-12 on the Gate 0 seed:
  ALL `ALL TIME · SINCE 8 NOV 2025` (the earliest row's date); SEASON
  `1 MAY TO 12 SEP 2026`; YEAR `1 JAN TO 12 SEP 2026`; MONTH `1 TO 12 SEP
  2026`; 30 DAYS `14 AUG TO 12 SEP 2026`; CUSTOM the two inputs' values
  in the same shape — `14 AUG TO 12 SEP 2026` for the seeded pair. The
  shape collapses a shared year and a shared month (`build.mjs`
  `rangeText`); across years both ends print in full. While CUSTOM's pair
  is unusable (FROM > TO, or a cleared field) the line names the range
  still APPLIED — the same range the totals show — beside the error
  sentence. It is the ONE prose line on the page: rulings 18 and 19 stand
  otherwise, and it is hidden with the filter bar at zero rows (ruling
  16). Variant B (the preset's own span with `· TO DATE`) is not taken.

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
   0 (`caloriesRows` counts the carriers; not printed since rulings 18/19).
9. NO TYPE is a bucket for `workoutType === null` only, drawn without a type
   colour, last in the stack, and never a member of `WORKOUT_TYPES`.
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
    NULL` (§3.3, §14 ruling 4); no surface caption says so since rulings
    18/19 — the record and the chart's accessible name do.
14. The domain never reads a clock or a timezone and never parses a date
    string: today and every row date are `{ y, m, d }` inputs.
15. The stats surface renders a bounded state for any row count: the route
    is unpaginated by design up to the measured trigger (any user > 5,000
    rows, DBA 2026-09-12), and the §13 row owns the cursor beyond it.
16. **The hero is the door and the only door (§14 ruling 10):** the You hero
    is exactly ONE focusable control with exactly ONE accessible name
    (`Stats`), ≥ 44 px, with visible focus; it contains no nested interactive
    element (no inner link, button or tabbable node); activating it anywhere
    — the figures, the bar, the legend — opens `/you/stats`; and `.you-doors`
    carries no STATS row.
17. **The stacked bar sums to the range:** its segments' seconds sum to Σ
    `workSeconds` over `rows(R, ALL)` — the same figure the TIME row shows —
    in the order `AN · AT · O2 · TR · NO TYPE`; a bucket with 0 s renders no
    segment and no legend row; shares are printed as whole percents and the
    invariant is on the seconds, never the printed integers.
18. **The Gate 0 seed is the reference fixture:** the figures the e2e and
    client tests assert for `docs/design/career-stats/seed.mjs`'s rows are
    the ones `compute.mjs` prints (§8.5), with the clock pinned to
    2026-09-12 — a change to any of those figures is a change to what a
    number means and takes the TRIAD gate.
19. **The SEASON card is one row set:** the cumulative curve, its `<n>
    TODAY` end label, AVG M/DAY and both streaks are computed from the SAME
    set — every row whose date is in the current season, NEVER the filter's
    range — so no two figures in the card can disagree about which rows
    exist (§5 item 5; the approved A5 artboard mixed the two sets and the
    invariant governs). LONGEST is the longest run within this set (§14
    ruling 22). At 0 season rows the card reads `NO ROWS THIS SEASON YET`,
    whatever the lifetime count; at 1 it reads `TWO ROWS MAKE A CHART`.

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
`storedTierRows` count can go red** (DBA correctness note: its generator
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
2026-09-07`. Avg/day divisor on May 1 = 1. Streak (§3.3's rule, with
W1..W5 = the Monday-start weeks of 2026-08-10 … 2026-09-07): rows in
{W1, W2, W4} with today in W5 (W5 empty, so CURRENT falls back to last
week) → current 1, longest 2; rows in {W1, W2, W4, W5} with today in W5
(the current week HAS a row) → current 2, longest 2; with today in W4 →
current 1. (The first draft's pin read `current 0` for the first case and
contradicted §3.3 and invariant 10 — PR 2 delta pass, 2026-09-12.) The
null-metres pin: rows in {W1, W2} where W2's only row is a `stored`-tier row
with `workMeters: null` → current 2 with today in W2, longest 2 — rows, not
metres (§3.3). The pre-May-1 pin (ruling 22): the seed plus four rows in the
weeks of 2026-04-06 … 04-27 → longest STILL 3; and with today = 2026-05-06
and one row on May 5 beside those four → current 1, longest 1 — an April
run never joins a May streak. Empty
range → every total 0, sessions 0, avg watts `undefined`. Every pin is a
`{ y, m, d }` literal; the domain has no `Date` to get wrong. (4) Each pin's
mutation is the off-by-one in the constant it guards (a `<` for `<=`), and
the report names which literal went red.

**The adapter's conversion gets its own test file**
(`src/api/useStatsRows.tz.test.ts`), because nothing in the repo pins `TZ`
(§1) and a calendar pin
that passes in UTC proves nothing about a device in New York. (1) Invariant
5 at the seam. (2) The file sets `process.env.TZ = "America/New_York"` (a
NEGATIVE offset, so an early-UTC instant on the 13th is still the 12th
there) at the
top, BEFORE any `Date` is constructed, and ASSERTS the offset took —
`new Date("2026-09-12T12:00:00Z").getTimezoneOffset()` is `240` — because a
property of how the test got there is an assertion, not a comment (RF38).
(3) Observable: the instant `2026-09-13T02:30:00Z` converts to
`{ y: 2026, m: 9, d: 12 }` (22:30 EDT, the PREVIOUS local day; in UTC it
would be the 13th — a `23:30Z` instant on the 12th cannot serve, it is the
12th in UTC too, measured at PR 1's Task 5 mutation). (4) Mutation: swap the local getters for `getUTCFullYear`/
`getUTCMonth`/`getUTCDate` in the adapter → the assertion reads `d: 13`,
and the report pastes that failure. (5) "The adapter converts in the
process's zone, and the test process's zone is one where it matters."

### 8.4 Structural gate for invariant 12

A unit test reads every file under `app/domain/stats/`, `src/you/stats/`
(which now holds `YouStatsHero.tsx`, §5) and the stats hooks under
`src/api/` — `useStatsRows.ts` AND, from PR 2, `useTestHistory.ts` (the
trend's hook, which also needs the §8.3 `TZ` pin since it converts
`test_history.loggedAt` the same way), so the scan is widened from the
single file to both, or to a `src/api/use*Stats*.ts`-style glob that
catches the next one (PR 2 delta pass, 2026-09-12) —
as text and asserts, CASE-INSENSITIVELY, that none contains `verified`,
`c2ResultId`, `c2UserId`, `concept2` or `/api/concept2` — the real module is
`src/api/useConcept2Link.ts` (capital C), and a case-sensitive scan for
`concept2` matches nothing in a file that imports it. It ALSO asserts the
hero component's import list by reading `YouStatsHero.tsx`'s
`import` lines and checking each specifier against the same list, so the
one new file `You.tsx` renders is covered even though `You.tsx` itself
(which imports `Concept2Row`, `:7`) is not. A type-level test asserts
`keyof StatsRow` equals the §4.3 literal list — **a COMPILE-time gate:**
only `tsc` (`pnpm typecheck`, the pre-commit hook) bites on
`expectTypeOf`, and vitest runs the file green whatever the type says; the
runtime `it` beside it is kept as documentation of the ten keys, not as
the gate. (4) Mutation: add `verified:
boolean | null` to `StatsRow` → the key-set assertion fails naming the key;
add `import { useConcept2Link } from "../../api/useConcept2Link"` to
`YouStatsHero.tsx` → the text scan fails naming the file. (5) "No
Concept2 identifier appears in the stats code" — structure, not runtime
behaviour (RF26).

### 8.5 Client and e2e (invariants 1, 8, 9, 13, 16, 17, 18)

- **The fixture is the Gate 0 seed** (§5; RF3): `docs/design/career-stats/
  seed.mjs` — 13 log rows R1-R13 and 6 `test_history` rows T1-T6 — with
  today = **2026-09-12**. It is plain dependency-free ESM, so tests import it
  directly rather than transcribing it; if the plan transcribes (an API-shaped
  seed for `POST /api/logs`), one test asserts the transcription's per-row
  `workMeters`/`workSeconds`/`source`/`type`/`date` equal `seed.mjs`'s. The
  figures to assert are `compute.mjs`'s printout, verbatim:
  - ALL / lifetime: **56,752 m · 3:59:39 · 13 sessions**; SEASON 2027:
    **43,012 m** (9 rows); 30 DAYS: 18,000 m; MONTH: 5,000 m.
  - MACHINE (10 rows): **36,752 m · 2:34:31 · 10**; `ownTotals` 8 of 10
    (computed, not printed — ruling 19); REST METRES **718**; CALORIES
    **1,731** (8 of 10 carry one — computed, not printed); AVG WATTS **176**
    (Σs 7679.1 / Σm 30,512 over the nine non-`stored` rows);
    `storedTierRows` 1 (R1; computed, not printed — ruling 19).
  - TIME BY TYPE (ALL): AN 822.6 s (5.7%) · AT 3819.4 s (26.6%) · O2 6244.0 s
    (43.4%) · TR 1387.3 s (9.6%) · NO TYPE 2106.0 s (14.6%), Σ 14379.3 s; the
    rendered legend reads `AN 6%`, `AT 27%`, `O2 43%`, `TR 10%`, `NO TYPE
    15%` on the hero and `AN 13:43 6%` … `NO TYPE 35:06 15%` on the subpage.
  - METRES PER WEEK (PR 2): `0 · 0 · 10,000 · 0 · 0 · 13,000 · 3,000 · 2,000`
    for the weeks of 2026-07-20 … 2026-09-07. SEASON: `43,012 TODAY`, AVG
    M/DAY 319 (43,012 / 135), CURRENT STREAK 3, LONGEST 3. TEST TREND: six
    points, T1/T3/T5 with `sessionLogId` null.
  - **The seed is BLIND to boundaries (PR 2 delta pass, 2026-09-12), so PR
    2 adds fixtures beside it:** not one of the 13 rows sits on any preset's
    `from` or `to` (newest 09-11 against today 09-12), so an inclusive/
    exclusive off-by-one anywhere ABOVE `inRange` is invisible to the whole
    reference fixture while `inRange` itself is pinned; its streaks are 3/3
    so CURRENT ≠ LONGEST is never exercised; and every week up to today has
    a row, so the unfinished-week fallback branch is never taken. PR 2's
    unit and e2e gates therefore ALSO run: (a) one row dated today
    (2026-09-12) and one dated 2026-05-01 — a row on each of SEASON's, and
    every preset's, `to` and on SEASON's `from`; (b) an older run of FOUR
    counting weeks so LONGEST reads 4 while CURRENT stays 3; (c) the seed
    with R13 (the only 2026-09-07-week row) DROPPED, so this week is empty
    and CURRENT falls back to last week. **And say which pins a Sunday-start
    mutation moves:** METRES PER WEEK does — the series becomes `2,000 · 0 ·
    10,000 · 0 · 0 · 8,000 · 8,000 · 2,000` — and so do the `mondayOf` pin
    and §8.3's three `streakOf` pins, whose W1..W5 keys are Mondays; the
    seed's 3/3 streak does NOT move and NEITHER does fixture (b) (its weeks
    shift together — measured, PR 2 plan), so (b) gates the CURRENT/LONGEST
    transposition, not the week start; a convention bug that no pin can
    move is not gated.
- **The clock is pinned.** Every figure above depends on today = 2026-09-12
  (the season, 30 DAYS, MONTH, the week axis, the divisor 135, the streaks);
  the e2e pins the browser clock to that date AND the browser's zone
  (Playwright `timezoneId`), and seeds each row's `loggedAt` at local NOON of
  its seed date so no zone can move a row across midnight — **and the six
  `test_history` rows are BACKDATED the same way**, because the trend's x
  is `test_history.loggedAt`, the append instant (§3.3): a test row seeded
  at request time would plot every point on today. The unit tests
  pass `today` as the `{ y, m, d }` triple (§3). A test that reads the real
  clock is wrong by construction (invariant 14).
- Client: filter presets select the right rows (the four preset totals
  above); a CUSTOM `from > to` keeps the previous range and shows the §5
  string; **0 rows renders the §5 string and NO filter bar** (ruling 16);
  **zero `pm5` rows renders `NO MONITOR ROWS YET` and no REST METRES /
  CALORIES / AVG WATTS row** (ruling 16; the `n OF m` absence case went
  with the line itself, ruling 19; the three manual rows
  R2 · R9 · R10 are the fixture: ALL 20,000 m · 1:25:08 · 3); the stacked
  bar's segments sum to the range's seconds and a 0-s bucket has no segment
  and no legend row (invariant 17 — the manual-rows fixture has AN = 0 and
  NO TYPE = 0, so the mutation "render every bucket" goes red on it); the
  order is pinned by the INDEPENDENT literal `["AN", "AT", "O2", "TR", "NO
  TYPE"]`, never the production constant (RF21).
- **Hero-as-door** (invariant 16), client: the hero's root is the one
  element matching `a, button, [tabindex]` inside it (count = 1), its
  accessible name is `Stats`, and a click on the legend text — the deepest
  descendant — navigates to `/you/stats`; `.you-doors` has exactly four
  children and none reads STATS. Mutation: wrap the legend in its own
  `<Link>` → the count assertion fails naming two focusables.
- e2e (`e2e/stats.spec.ts`): seed the 13 LOG rows through the API with the
  clock and zone pinned (the 6 test rows seed in PR 2, with the trend); open You, assert the LIFETIME line
  reads `56,752` and SEASON `43,012` (RF7 — hand-recomputed above and in
  `compute.mjs`), Tab to the hero and assert it is focused with name
  `Stats`, tap the LEGEND and assert `/you/stats`; assert ALL `56,752` and
  MACHINE `36,752`, `718`, `1,731`, `176` (no prose lines to assert since
  ruling 19); delete R13 (a `pm5` row, 2,000
  m) through the UI, reload, assert LIFETIME `54,752`, MACHINE `34,752` and
  `7 OF 9`. Mutation: make the ALL column filter `source === "pm5"` → the
  ALL literal fails while MACHINE passes (the case that proves the two
  columns are computed independently). This run is bounded below the fake's
  first frame by construction — nothing here connects a monitor (RF41).
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
  the time-by-type computation in `aggregate.ts` and a stacked-bar primitive
  under `src/charts/` (both needed by the hero — §14 ruling 11),
  `YouStatsHero.tsx` as its own component and as the door (ruling 10; no
  STATS row), the `/you/stats` subpage with filter bar, the whole TOTALS
  group (both columns, rest, calories, avg watts; no prose since rulings
  18/19), the TIME BY TYPE
  group (it costs nothing once the hero exists, so it ships here), and the
  empty states — 0 rows with the filter bar hidden, 1 row, and the MACHINE
  column's with its three rows hidden (ruling 16).** Gates: Gate 0 —
  APPROVED 2026-09-12 (§5); `/harden` on the plan (two lenses, capped); the
  DBA gate below; full e2e read; PM final-PR gate.
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
- **PR 2 — the remaining charts: METRES PER WEEK, the SEASON group
  (cumulative curve, AVG M/DAY, CURRENT and LONGEST STREAK), TEST TREND,
  and the hover/tooltip layer — plus James's two 2026-09-12 notes: the
  hero's tappable affordance and the range line under the filter bar
  (§5.1).** The charts were designed and approved at Gate 0 (ruling 11; §5
  items 3, 5, 6), so they carry no design gate of their own unless the
  rendered thing changes; **the two notes DID carry one** — a Gate 0
  addendum rendering the affordance candidates and the range line, RULED
  by James on sight 2026-09-12 (§14 rulings 20 and 21: the B1 chevron with
  the proposed pressed fill; range-line variant A on every preset), and
  their implementation follows those rulings. The range line is the one
  prose line rulings 18 and 19 allow back. Gates: the Gate 0 addendum
  (RULED, both notes); antagonist DELTA pass
  scoped to §3.3 streak/avg-per-day and §3.2 metres-per-week definitions
  only (new invariant classes against the anchor's vetted ground; AVG WATTS
  and time by type ship in PR 1; the two notes are copy and layout, nothing
  for it to attack) — **RUN 2026-09-12 against the vetted ground: six
  mechanism breaks, all folded into §3.3, §5 items 3/5/6, §5.1, §7
  invariant 19, §8.3-8.5 and §12 the same day** (ledger:
  `antagonist-ledger.md`, "Phase PS PR 2 delta pass, 2026-09-12"); the
  §8.5 boundary fixtures (a row on today and on 2026-05-01, the 4-week
  streak, the R13-dropped variant) and the Sunday-start statement are PR
  2 gates; DBA SKIP stated aloud unless a query changes (test-history's
  GET is unchanged); no PM per-PR gate (non-triad UI).
- Fast path applies to nothing here (`app/domain/` and `app/server/` in
  PR 1; a wrong version produces a wrong number). PR 1 is one plan: the
  domain function and its contract test, the route and its seam test, and
  one screen carrying TOTALS and the one chart the hero already needs — one
  risk model (the number's meaning) for one reviewer; the line and bar
  charts wait for PR 2.

## 10. Exit criteria

1. §8.1–8.5 green with each mutation's failure text in the PR body,
   including the ESLint rule's (§4.1) and the `TZ` test's (§8.3).
2. `grep -rin --exclude='*.test.ts' "verified\|c2ResultId\|c2UserId\|concept2"
   app/domain/stats app/src/you/stats app/src/api/useStatsRows.ts` returns
   nothing — the exclusion drops the §8.4 test's own needle list (the §8.4
   gate's grep — case-insensitive, or it cannot see `useConcept2Link` —
   pasted).
3. The DBA verdict is attached to PR 1 with the §9 protocol's numbers at
   1k / 10k / 100k rows, the two plan literals met or the miss explained,
   and a ruling on pagination against the 5,000-row trigger. The
   generated-columns and history-index items are CLOSED for this route by
   the 2026-09-12 measurement; reopening either is James's call on its own
   TRIAD row, never PR 1's.
4. Gate 0 approved before PR 1's first implementation commit, with ratios
   and the zero-`pm5` MACHINE frame — **MET 2026-09-12** (§5; artifact
   `c8ad61d9-853b-4262-9051-032f90e90cf2`, sources in
   `docs/design/career-stats/`), with rulings 9-16 applied here before the
   plan was written.
5. **Totals at ≥ 1 row, verified at PR 1:** a rower with one saved row sees
   real totals on You and `/you/stats` equal to that row's detail hero; at
   0 rows, the §5 empty state; with no `pm5` row, the MACHINE column's.
   **Charts at ≥ 2 points:** TIME BY TYPE at PR 1, METRES PER WEEK, SEASON
   and TEST TREND at PR 2 — each renders at two rows in range and reads
   `TWO ROWS MAKE A CHART` below. Each half is checked at the PR that ships
   it — a criterion cannot be verified on a build where its code does not
   exist (RF24).
7. **The reference fixture agrees with the canvas:** the e2e and client
   figures for the Gate 0 seed (§8.5) are the ones `compute.mjs` prints and
   the artboards show, with the clock pinned to 2026-09-12; the hero is one
   control named `Stats` and `.you-doors` has no STATS row (invariant 16).
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
charts beyond the six Gate 0 drew (the hero bar, metres per week, time by
type, the season curve, the test trend). **The hover/tooltip layer §9 once
named for PR 2 and A3's 16-cell streak strip: PR 3 or never (James,
2026-09-12) — no row.** **Generated columns,
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
- **Hardening debt, stated and not owed a row (PR 2 delta pass,
  2026-09-12):** `PUT /api/baselines`'s `isTestResult` arm
  (`routes/data.ts:1151`) appends `test_history` rows KEYLESS — its
  `sessionLogId` is `NULLS DISTINCT`, so a null-linked append is never
  deduplicated — and has ZERO senders in `app/src` and `app/e2e`
  (`grep -rn isTestResult app/src app/e2e` → nothing, 2026-09-12); the
  trend draws whatever that arm has stored, and nothing in production
  reaches it today.

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
the day the design was approved (1-5), three ruled at the phase-open gates
the same day (6-8), and eight ruled at Gate 0 on the rendered canvas (9-16;
artifact `c8ad61d9-853b-4262-9051-032f90e90cf2`, sources
`docs/design/career-stats/`). The rulings are applied above; this section is
the record.

1. **MACHINE = by door.** Every `source = 'pm5'` row is MACHINE, including a
   `pm5` row closed `link-lost` that has no machine totals and no work pair
   (`storedSummary.ts:496-520`) and so sits in tier `stored`. The column
   carries `n OF m CARRY THE MONITOR'S OWN TOTALS` (§3.2, §5) — that
   surface line was moved under the card by ruling 18 and struck by ruling
   19; the by-door definition stands, the count is computed only.
2. **Rest metres = the stored RC-1 pair** (`restMeters`/`restSeconds`),
   what the TOTAL line shows. `machineSummary.totalRestMeters`
   (`storedSummary.ts:270`) stays provenance, unread here (§3.1).
3. **Avg m/day divisor = days elapsed INCLUDING today** (May 1 → 1) (§3.3).
4. **The test trend SHOWS points whose log was deleted.** `SET NULL` is
   deliberate (`schema.ts:531-537`); the test record is its own history.
   It is the one figure on the page that does not drop with a deleted log,
   stated in §3.3, §4.3 and invariant 13 (the group's caption was struck by
   rulings 18/19).
5. **CALORIES & WATTS fold into TOTALS** as two more rows under the MACHINE
   column; the separate group is gone from §5, §9 and the ROADMAP section.
6. **AVG WATTS EXCLUDES `stored`-tier rows** (rows carrying only the fused
   figure). Watts = `logbookWatts` over Σs/Σm of rows whose tier is
   `machine`, `work-pair` or `steps`. Metres, time and sessions still count
   `stored`-tier rows. (The `k ROWS PREDATE WORK-ONLY TOTALS` line that
   once named the excluded rows was struck by ruling 19; the exclusion
   holds in the number, unlabelled — §3.2, invariant 7.)
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
9. **The You hero is H3 TIME BY TYPE:** one stacked bar in the order AN ·
   AT · O2 · TR · NO TYPE with the whole-percent legend drawn as swatch
   chips (A2-H3), under the LIFETIME and THIS SEASON figures; 140 px in
   portrait as shipped (hairline to hairline in `you.png`, rows 120→259;
   the canvas draft measured 181, `hero-heights.json`). It REPLACES the
   two-line headline the design first carried (§5).
10. **The hero IS the door.** Tapping anywhere on it opens `/you/stats`;
    there is NO separate STATS row in `.you-doors`, which stays BASELINES ·
    CONCEPT2 · SETTINGS · DIAGNOSTICS. The hero is one focusable control (a
    link or button with the accessible name `Stats`), ≥ 44 px, with visible
    focus (§5, invariant 16).
11. **Every subpage chart is designed now** — metres per week, time by type,
    the season cumulative curve with AVG M/DAY and the streaks, the 2k/6k
    test trend — and ships in PR 2, EXCEPT the time-by-type computation and
    the stacked-bar primitive, which PR 1 needs for the hero; the subpage's
    TIME BY TYPE group therefore ships in PR 1 at no extra cost (§9).
12. **Previous-week bars use `--ink-4` (5.29:1 on `--surface`),** not the
    2026-08-07 handoff's `#c9c3b2` (§9 item 1 of
    `docs/design/handoffs/2026-08-07-news-tab/README.md`; 1.73:1, below WCAG
    1.4.11's 3:1 for a data mark); `--ink-5` (2.75:1) was measured and
    rejected too. Recorded as a deviation from the handoff in
    `docs/design/DEVIATIONS.md` (the UI/UX table's last row).
13. **Stack order AN · AT · O2 · TR · NO TYPE.** The spec's earlier AN · O2 ·
    AT · TR listing fails the dataviz palette validator on the O2↔AN
    adjacency (ΔE 11.3 < 15, deutan 4.9); the drawn order passes (16.8
    normal / 13.5 protan) — `build.mjs` header (§3.2, invariant 17).
14. **Landscape You scrolls:** the hero pushes the doors below the 390 px
    fold; accepted, no landscape-only layout (§5).
15. **Copy:** `1 ROW PREDATES WORK-ONLY TOTALS` is the singular of the seam
    line, and the `n OF m CARRY THE MONITOR'S OWN TOTALS` line renders FULL
    WIDTH under the TOTALS header row, not under the MACHINE column (§5).
    (Superseded ON THE SURFACE: ruling 18 moved the `n OF m` line under
    the card and dropped the seam suffix; ruling 19 struck both lines. The
    definitions — singular/plural, n and m — stand in §3.2 as computed
    values.)
16. **Zero monitor rows hide the MACHINE-only rows:** with no `pm5` row in
    range the REST METRES / CALORIES / AVG WATTS rows are hidden and the
    MACHINE column keeps its own empty line reading `NO MONITOR ROWS YET`;
    at zero rows of any kind the filter bar is hidden too (§5, §8.5).
17. **The seam count and the watts exclusion are monitor-only (PR 1 fix
    round, 2026-09-12).** The `k` count (`storedTierRows`) covers only
    `source === "pm5"` rows in the stored tier, and ruling 6's exclusion
    reads the same set. A timer row (`LogSession.tsx` saves only
    `timeSeconds`/`distanceMeters`, so it lands in the stored tier by
    shape) and a manual row are what the rower typed: work by definition,
    counted in every ALL figure and never in k. Implemented in
    `aggregate.ts`'s `storedTierRows`; gated by a `source: "timer"` fixture
    (§3.2).
18. **Strip the captions (2026-09-12, on sight of `you-stats.png`: "the
    sheer amount of prose under that stats bar is insane").** The Stats
    page keeps EXACTLY two lines of prose — the seam line under the TOTALS
    heading (k > 0 only, no `· NOT IN AVG WATTS` suffix) and one footnote
    under the TOTALS card, `n OF m MACHINE ROWS CARRY THE MONITOR'S OWN
    TOTALS` (m > 0 only). Struck: the range caption under the filter bar,
    the TOTALS subtitle, the in-card `n OF m` header line, the CALORIES and
    AVG WATTS row captions, the TIME BY TYPE caption, and the hero's `WORK
    TIME BY TYPE · ALL ROWS`. The A3/A2-H3 artboards now OVER-DRAW those
    captions (`docs/design/career-stats/README.md`); the captures are the
    current state. (The two lines this ruling kept were struck in turn by
    ruling 19.)
19. **Strip the last two lines (2026-09-12, on sight of the `e0b8626e`
    capture: "The prose about the monitor's own rows is super confusing. I
    also don't need the warning at the top about 1 row predating").** The
    `k ROW(S) PREDATE WORK-ONLY TOTALS` seam line and the `n OF m MACHINE
    ROWS CARRY THE MONITOR'S OWN TOTALS` footnote are gone; the Stats page
    renders NO caption prose — title, filter bar, TOTALS heading + card,
    TIME BY TYPE heading + bar + legend, and the empty-state lines only.
    `storedTierRows`, `ownTotals` and `caloriesRows` stay in the domain
    aggregate (tested; they still govern the watts exclusion) and nothing
    renders them. Rulings 1 and 15's SURFACE lines are superseded; their
    definitions stand.
20. **RULED 2026-09-12, on sight of the addendum boards (asked the same
    day, after v0.46.0 build 977 was released with PR 1) — the You hero's
    affordance is B1:** a trailing `›` chevron aligned with the chevrons of
    the `.you-doors` rows below it, in the doors' own style (`--ink-3`
    mono on `--page`, 6.69:1, `contrast.json`), the hero's height
    unchanged at 140 px (`hero-heights.json` `B1: 140`; the bar loses the
    chevron column's width), PLUS the faint `--surface-sunken` fill on
    `:active` as the pressed state — accepted AS PROPOSED (the stylesheet
    had no `:active` rule anywhere; the fill measures 1.06:1 against
    `--page`, a touch-feedback cue and not a data mark, and every text and
    mark pairing on it clears its floor — `--ink` 14.5:1, `--ink-3` 6.3:1,
    every bar segment ≥ 4.48:1 (`--ink-4`, the NO TYPE segment, is the
    floor case), `contrast.json`'s `surface-sunken` rows).
    The card edge (B2) and the `STATS ›` label (B3) are NOT taken.
    Invariant 16 holds unchanged: still ONE focusable control, no nested
    interactive element, the accessible name EXACTLY `Stats` by an
    explicit `aria-label="Stats"` on the link — the chevron is
    `aria-hidden` decoration like the doors' own.
21. **RULED 2026-09-12, same sitting — the range line is variant A on
    EVERY preset.** One mono-caps line under the filter bar, in
    `.stats-caption`'s style (`--ink-3` on `--page`, 6.69:1), naming the
    days the totals actually cover — `presetRange` sets `to = today`, so
    the line never names a day the range does not contain. With today =
    2026-09-12 and the Gate 0 seed: ALL `ALL TIME · SINCE 8 NOV 2025`
    (the FIRST row's date, R1); SEASON `1 MAY TO 12 SEP 2026`; YEAR
    `1 JAN TO 12 SEP 2026`; MONTH `1 TO 12 SEP 2026`; 30 DAYS `14 AUG TO
    12 SEP 2026`; CUSTOM the two inputs' values in the same shape (the
    seeded pair reads `14 AUG TO 12 SEP 2026`). The shape is
    `build.mjs`'s `rangeText`: the year once when both ends share it, the
    month once when both ends share it, both ends in full across years
    (`8 NOV 2025 TO 12 SEP 2026` is the across-years form). It is the ONE
    prose line on the page — rulings 18 and 19 stand otherwise — and it
    is hidden with the filter bar at zero rows (ruling 16). Variant B
    (`SEASON 2027 · 1 MAY 2026 TO 30 APR 2027 · TO DATE`, which wraps to
    two lines at 390 px) is NOT taken; §5.1's first-draft
    `1 MAY 2026 TO 12 SEP 2026` was the pre-board spelling and the
    board's `1 MAY TO 12 SEP 2026` is the one he approved.
22. **LONGEST STREAK is the longest run WITHIN THIS SEASON (2026-09-12, on
    the PR 2 plan's Deviation 1).** Invariant 19 wins: both streaks, the
    curve, `<n> TODAY` and AVG M/DAY read the one May 1 … today row set;
    §3.3's "anywhere in the rower's history" is withdrawn. A run that ends
    before May 1 never counts and a run straddling May 1 is counted from
    May 1 (the cost, accepted: a rower six weeks deep on May 3 reads
    `CURRENT STREAK 1`). Pinned in §8.3 and in the plan's Task 3 with its
    mutation (streak keys taken from every row instead of the season's).

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
- **Gate 0: APPROVED 2026-09-12 (James), on the rendered canvas** —
  https://claude.ai/code/artifact/c8ad61d9-853b-4262-9051-032f90e90cf2,
  sources `docs/design/career-stats/` (`seed.mjs` → `compute.mjs` →
  `build.mjs`; `contrast.json`, `hero-heights.json`, artboards A1-A7). Eight
  rulings (§14 9-16) applied in this revision before the PR 1 plan; the
  canvas's A2-H3 still shows the STATS row ruling 10 struck, and the
  spec, not the artboard, governs that one point.
