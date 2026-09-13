# Phase PS PR 2 — career stats: the charts, the range line, the hero chevron — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/you/stats` gains METRES PER WEEK, the SEASON card (cumulative curve, AVG M/DAY, CURRENT and LONGEST STREAK) and TEST TREND, plus the one range line under the filter bar (§14 ruling 21); the You hero gains the doors' chevron and a pressed fill (§14 ruling 20).

**Architecture:** three new pure domain modules (`weekly.ts`, `season.ts`, `testTrend.ts`) over the PR 1 row shape; two tick kinds and `niceMax` in `src/charts/axis.ts` plus two tiny layout primitives; `useTestHistory` as the second per-mount fetch through the SAME instant→date seam; three group components rendering inline SVG the way `TraceChart` does. Nothing new is stored; no route changes.

**Tech Stack:** TypeScript ~6.0, React 19, Vitest (unit/client), Playwright, `pg` for the e2e backdate (already a dependency).

**Spec:** `docs/superpowers/specs/2026-09-12-career-stats-design.md` — §9 PR 2 scope; §3.2 (metres per week, season cumulative), §3.3 (week, avg/day, streak, test trend); §5 items 3/5/6 + §5.1; §7 invariants 6, 10, 16, 19; §8.3-8.5; §14 rulings 1-21 (20 and 21 RULED 2026-09-12). Read it whole.

**Worktree:** `/Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/ps-pr2` (branch `phase-ps-pr2`, base `5c5099cb`). All commands run in `<worktree>/app` with `export PATH="$HOME/.local/share/nvm/v26.5.0/bin:$PATH"`. Scoped runs: `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project <p> <file>`; whole projects `pnpm test --project unit|client`. `git rev-parse --show-toplevel` before every commit.

**Gates for this PR (spec §9):** the Gate 0 addendum — RULED (rulings 20/21); antagonist DELTA pass — RUN 2026-09-12 and folded; **DBA gate: SKIP, no store, no schema, no new bulk route** (`GET /api/test-history` is unchanged, `routes/data.ts`; the stats route is PR 1's); no per-PR PM gate (non-triad UI). Fast path does not apply (`app/domain/` files; a wrong version prints a wrong number).

## Global Constraints (from the spec, verbatim where quoted)

- Domain: "No `Date.now()`, no `Intl`, no `new Date(...)`" — every date is a `{ y, m, d }` triple; the ONE conversion is `toCalendarDate` in `src/api/useStatsRows.ts`, reused by the new hook.
- "Week starts Monday"; "CURRENT = the run of counting weeks ending at the week containing today, or at last week if this week has none yet"; streaks key on ROWS, not metres (§3.3).
- Invariant 19 + ruling 22: the SEASON card's curve, `<n> TODAY`, AVG M/DAY and both streaks come from ONE row set — every row dated May 1 … today — NEVER the filter's range; LONGEST is the longest run WITHIN this season (a pre-May-1 run never counts). Season card: 0 season rows → `NO ROWS THIS SEASON YET`, 1 → `TWO ROWS MAKE A CHART`, ≥ 2 → the chart.
- Avg m/day divisor = (today − May 1) + 1 (ruling 3). Season named by its END year.
- METRES PER WEEK: "eight bars ending at the week containing the range's LAST day (today for every preset; TO for CUSTOM)"; labels on "the CURRENT bar and the TALLEST bar only"; weeks before FROM "render as a dashed `--rule-2` outline"; current week `--ink`, others `--ink-4` (ruling 12).
- Test trend x = the date of `test_history.loggedAt` (the append instant); a point whose log is deleted stays (ruling 4); `TickKind "split"` prints whole seconds `1:55` at `chooseTicks`'s own steps; faster is UP.
- Ruling 20: B1 chevron, `--ink-3` mono like `.diag-row`, hero stays 140 px, `:active` fill `--surface-sunken`; `aria-label="Stats"` unchanged; ONE focusable control (invariant 16).
- Ruling 21: the range line, variant A on EVERY preset, is the ONE prose line on the page; rulings 18/19 stand otherwise — the three new groups carry NO caption. Hidden with the filter bar at zero rows.
- No Concept2 identifier in `app/domain/stats`, `src/you/stats`, `src/api/useStatsRows.ts`, `src/api/useTestHistory.ts` — comments included (the §8.4 scan reads file text; a first draft's "Concept2 has none" in `season.ts` went red — say "the logbook").
- Copy: mono caps, middle dots, no em-dashes, never "PM5". Hit targets ≥ 44 px; CSS custom properties only; 2 px radii, no shadows.
- The Gate 0 seed is the reference fixture; every literal below is `compute.mjs`'s printout or hand arithmetic shown beside it; the clock is 2026-09-12.
- Commit after every task; never `--no-verify`; scoped gates per `.claude/agent-briefing.md`.

## File map

| File | Responsibility |
| --- | --- |
| `domain/stats/calendar.ts` (modify) | `dayOfWeek`, `mondayOf`, `firstOfMonth`, `lastOfMonth`, `monthStarts` |
| `domain/stats/weekly.ts` (new) | `metresPerWeek(rows, range, today): WeekBar[]` |
| `domain/stats/season.ts` (new) | `seasonSummary(rows, today)`, `streakOf(weekKeys, today)` |
| `domain/stats/testTrend.ts` (new) | `TestPoint`, `testTrend(points)` |
| `domain/stats/aggregate.ts` (modify) | `earliestDate(rows)` |
| `domain/stats/gate0Seed.ts` (modify) | `GATE0_TESTS` (T1-T6), held equal to `seed.mjs`'s `tests` |
| `src/charts/axis.ts` (modify) | `TickKind` + `"split" \| "metres"`, `niceMax` |
| `src/charts/bars.ts`, `src/charts/line.ts` (new) | `layoutBars`, `polylinePoints` |
| `src/api/useTestHistory.ts` (new) | per-mount fetch of `GET /api/test-history`; `testRowToPoint` through `toCalendarDate` |
| `src/you/stats/format.ts` (modify) | `fmtDayMonth`, `fmtMonth`, `fmtRange`, `fmtRangeLine` |
| `src/you/stats/{WeekBarsGroup,SeasonGroup,TestTrendGroup}.tsx` (new) | the three groups |
| `src/you/stats/StatsScreen.tsx`, `YouStatsHero.tsx`, `src/index.css` (modify) | order, range line, second fetch; chevron; styles |
| `src/you/stats/concept2Independence.test.ts` (modify) | scan widened to `useTestHistory.ts` |
| `src/test/gate0LogBodies.ts` (modify) | `GATE0_TEST_BODIES` for the e2e |
| `e2e/helpers.ts`, `stats.spec.ts`, `design.spec.ts`, `screenshots.spec.ts` (modify) | `backdateTestHistory`, `seedGate0Tests`; the browser gates |
| `docs/design/career-stats/README.md`, `docs/screenshots/{you,you-stats}.png` | the addendum's outcome; captures |

## LIFETIME TABLE (RF27)

| State | Minted | Cleared | Survives |
| --- | --- | --- | --- |
| `useTestHistory` state (`points`) | on mount, per fetch; `retry` bumps a generation | unmount (`cancelled` drops a late response) | nothing: a remount refetches; no localStorage |
| everything else this PR adds (`rangeLine`, bars, season summary, trend) | computed in render from the two hooks' rows | with the render | nothing — no ref, no cache, no memo |
| `process.env.TZ` in `useTestHistory.tz.test.ts` | the file's first statement | the worker ends | nothing (own file, own worker) |

Invariants: two fetches per mount, none cached; the SEASON card reads one row set; the hero is exactly one focusable control named `Stats`; a deleted log is absent from every figure but the trend's on the next mount.

---

### Task 1: Calendar weeks and months; tick kinds, `niceMax`, bar and line primitives

**Files:** Modify `domain/stats/calendar.ts` + `.test.ts`, `src/charts/axis.ts` + `.test.ts`; create `src/charts/bars.ts` + `.test.ts`, `src/charts/line.ts` + `.test.ts`.

**Produces:** `dayOfWeek(d)` (0 = Sunday), `mondayOf(d)`, `firstOfMonth(d)`, `lastOfMonth(d)`, `monthStarts(from, to): CalendarDate[]`; `formatTick(v, "split" | "metres")`, `niceMax(v, maxLines = 4): { max, step }`; `layoutBars(count, width, maxBarWidth, slotGap = 6): { x, width, centre }[]`; `polylinePoints(points, xScale, yScale): string`.

- [ ] **Step 1: Failing calendar pins** (append to `calendar.test.ts`, import the five names): `mondayOf(2026-09-13) → 2026-09-07`, `mondayOf(2026-09-14) → itself`, `mondayOf(2026-08-14) → 2026-08-10`; `dayOfWeek(1970-01-01) === 4`, `dayOfWeek(1969-12-28) === 0` (before day 0 — the double modulo); `lastOfMonth` for `2026-02-03 → 02-28`, `2028-02-03 → 02-29`, `2026-12-03 → 12-31`; `monthStarts(2025-11-22, 2026-01-17) → [2025-11-01, 2025-12-01, 2026-01-01]` and a same-month pair → one entry. Run → FAIL (not exported).
- [ ] **Step 2: Implement** (append to `calendar.ts`):

```ts
/** 0 = Sunday … 6 = Saturday. 1970-01-01 (day 0) was a Thursday (4). */
export function dayOfWeek(date: CalendarDate): number {
  return (((toDayNumber(date) + 4) % 7) + 7) % 7;
}
/** The Monday ≤ d — a week starts Monday (spec §3.3, invariant 6). */
export function mondayOf(date: CalendarDate): CalendarDate {
  return addDays(date, -((dayOfWeek(date) + 6) % 7));
}
export function firstOfMonth({ y, m }: CalendarDate): CalendarDate { return { y, m, d: 1 }; }
export function lastOfMonth({ y, m }: CalendarDate): CalendarDate {
  return addDays(m === 12 ? { y: y + 1, m: 1, d: 1 } : { y, m: m + 1, d: 1 }, -1);
}
/** Every month's first day from `from`'s month through `to`'s, ascending. */
export function monthStarts(from: CalendarDate, to: CalendarDate): CalendarDate[] {
  const out: CalendarDate[] = []; let cur = firstOfMonth(from); const last = firstOfMonth(to);
  while (compareDates(cur, last) <= 0) {
    out.push(cur);
    cur = cur.m === 12 ? { y: cur.y + 1, m: 1, d: 1 } : { y: cur.y, m: cur.m + 1, d: 1 };
  }
  return out;
}
```

- [ ] **Step 3: Failing axis tests** (append to `axis.test.ts`; import `niceMax` and `domainFromReadings` from `./scale.js`): `formatTick` split `[115, 120, 125] → ["1:55", "2:00", "2:05"]`; metres `0 → "0"`, `5000 → "5,000"`, `20000 → "20,000"`; `niceMax(13000) → { max: 15000, step: 5000 }` (A3), `niceMax(43012) → { 60000, 20000 }`, `niceMax(0)` and `niceMax(1000) → { 1000, 1000 }`, `niceMax(80001) → { 100000, 50000 }`, `niceMax(2000000) → { 2000000, 500000 }`; `chooseTicks([0, 15000], 4) → [0, 5000, 10000, 15000]`, `chooseTicks([0, 60000], 4) → [0, 20000, 40000, 60000]`, `chooseTicks([0, 1000], 2) → [0, 1000]`, `chooseTicks([0, 2000000], 5)` → five ticks by 500,000 — the rule `chooseTicks([0, max], max / step + 1)` reproduces `niceMax`'s grid; and the trend's domain from the primitives: `domainFromReadings([124.8, 117.6, 122.9, 115.3, 121.4, 114], { minHeight: 10 }) → [112, 126]` and `chooseTicks([112, 126], 4) → [115, 120, 125]` (all measured at `5c5099cb`).
- [ ] **Step 4: Implement** in `axis.ts` — add `fmtMeters` to the existing `import { fmtSplit } from "../../domain/format.js"`, `export type TickKind = "pace" | "rate" | "hr" | "time" | "split" | "metres";`, two `switch` arms (`"split"`: `return fmtDuration(value / 60);` — takes SECONDS, whole-second `m:ss` through the house formatter, never a bespoke one; `"metres"`: `return fmtMeters(value);`), and:

```ts
/** The metres axes' domain top (build.mjs `niceMax`): the maximum rounded UP to the
 *  smallest 1/2/5 × 10^k (k ≥ 3) step leaving ≤ `maxLines` gridlines above zero. The
 *  ladder continues past the design's 20,000 (its fallback capped the STEP there,
 *  which a 2,000,000 m season turns into 100 gridlines). */
export function niceMax(value: number, maxLines = 4): { max: number; step: number } {
  const v = Math.max(value, 1);
  for (let base = 1000; ; base *= 10) {
    for (const f of [1, 2, 5]) {
      const step = base * f; const max = Math.ceil(v / step) * step;
      if (max / step <= maxLines) return { max, step };
    }
  }
}
```

- [ ] **Step 5: Bars and line** — `bars.test.ts`: `layoutBars(8, 276, 24)` → 8 slots, `[0] = { x: 5.25, width: 24, centre: 17.25 }`, `[7].centre ≈ 258.75`; `layoutBars(10, 100, 24)[0] = { x: 3, width: 4, centre: 5 }`; count 0 or width 0 → `[]`. `line.test.ts`: `polylinePoints([{0,0},{5,0.5},{10,1}], linearScale({domain:[0,10],range:[0,100]}), linearScale({domain:[0,1],range:[50,0]}))` → `"0.0,50.0 50.0,25.0 100.0,0.0"`; `[]` → `""`. Implement:

```ts
// src/charts/bars.ts — equal slots across `width`, one bar centred per slot, ≤ maxBarWidth and ≤ slot − slotGap.
export interface BarSlot { x: number; width: number; centre: number }
export function layoutBars(count: number, width: number, maxBarWidth: number, slotGap = 6): BarSlot[] {
  if (count <= 0 || width <= 0) return [];
  const slot = width / count; const barWidth = Math.max(0, Math.min(maxBarWidth, slot - slotGap));
  return Array.from({ length: count }, (_, i) => ({ x: slot * i + (slot - barWidth) / 2, width: barWidth, centre: slot * i + slot / 2 }));
}
// src/charts/line.ts — one decimal, so an SVG attribute never carries float noise.
import type { ChartPoint } from "./scale.js";
export function polylinePoints(points: readonly ChartPoint[], xScale: (v: number) => number, yScale: (v: number) => number): string {
  return points.map((p) => `${xScale(p.x).toFixed(1)},${yScale(p.y).toFixed(1)}`).join(" ");
}
```

- [ ] **Step 6: Gates.** `… --project unit domain/stats/calendar.test.ts` and `… --project client src/charts` → PASS (measured: charts 5 files / 33 tests incl. the existing). Mutation: `mondayOf` → `addDays(date, -dayOfWeek(date))` (Sunday start) → `× mondayOf: Sunday 2026-09-13 → 09-07 …` (measured). `pnpm exec eslint domain/stats src/charts` clean.
- [ ] **Step 7: Commit** `feat(stats): Monday weeks, month helpers, split/metres ticks, niceMax, bar and line primitives`.

### Task 2: METRES PER WEEK in the domain

**Files:** Create `domain/stats/weekly.ts` + `.test.ts`.

**Produces:** `WEEKS_SHOWN = 8`; `interface WeekBar { weekStart; meters; current; outOfRange }`; `metresPerWeek(rows: readonly DatedStatsRow[], range: DateRange, today: CalendarDate): WeekBar[]`.

- [ ] **Step 1: Failing test** (`weekly.test.ts`, literals): ALL on the seed → meters `[0, 0, 10000, 0, 0, 13000, 3000, 2000]`, `[0].weekStart = 2026-07-20`, `[7].weekStart = 2026-09-07`, `current` only on `[7]`, no `outOfRange`; 30 DAYS (`presetRange("30d")`, from 08-14) → `outOfRange` `[T, T, T, F, F, F, F, F]` (the week of Aug 10 CONTAINS Friday Aug 14, so it is in) and meters `[0, 0, 0, 0, 0, 13000, 3000, 2000]` (R9 on Aug 3 is outside the range → its week reads 0); a CUSTOM `2026-06-01 … 06-30` anchors on TO: weeks May 11 … Jun 29, NO bar current, the three May weeks out, meters `[0, 0, 0, 2000, 0, 3012, 0, 0]` (R6 Jun 2, R7 Jun 21); a row dated today (2026-09-12, 2,000 m, `{ ...GATE0_ROWS[12], id: "today", date }`) makes the last bar `4000`; a null-metres row adds 0 and keeps eight bars. Run → FAIL (module missing).
- [ ] **Step 2: Implement:**

```ts
import { addDays, mondayOf, toDayNumber, type CalendarDate, type DateRange } from "./calendar.js";
import { rowsInRange } from "./aggregate.js";
import type { DatedStatsRow } from "./statsRow.js";
export const WEEKS_SHOWN = 8;
export interface WeekBar {
  weekStart: CalendarDate; meters: number;
  /** The calendar's current week — `--ink`, `THIS WK`. */ current: boolean;
  /** Begins before FROM: no data by construction (dashed outline); the week CONTAINING FROM is in. Never on ALL. */ outOfRange: boolean;
}
export function metresPerWeek(rows: readonly DatedStatsRow[], range: DateRange, today: CalendarDate): WeekBar[] {
  const lastWeek = mondayOf(range.to ?? today);
  const thisWeek = toDayNumber(mondayOf(today));
  const fromWeek = range.from === null ? null : toDayNumber(mondayOf(range.from));
  const sums = new Map<number, number>();
  for (const r of rowsInRange(rows, range)) {
    const key = toDayNumber(mondayOf(r.date)); sums.set(key, (sums.get(key) ?? 0) + (r.workMeters ?? 0));
  }
  return Array.from({ length: WEEKS_SHOWN }, (_, i) => {
    const weekStart = addDays(lastWeek, -7 * (WEEKS_SHOWN - 1 - i)); const key = toDayNumber(weekStart);
    return { weekStart, meters: sums.get(key) ?? 0, current: key === thisWeek, outOfRange: fromWeek !== null && key < fromWeek };
  });
}
```

- [ ] **Step 3: Gates + mutations** (each restored; all measured at `5c5099cb`): PASS 5/5. (a) **Sunday start** (`mondayOf` as Task 1's mutant): the ALL series prints `Received [2000, 0, 10000, 0, 0, 8000, 8000, 2000]` — the spec's statement, verbatim — plus the 30 DAYS and CUSTOM cases and, in Task 3, the three `streakOf` pins go red; the seed's 3/3 streak and fixture (b) do NOT move (see Deviations 10). (b) `key < fromWeek` → `<=` → the 30 DAYS and CUSTOM cases (`× 30 DAYS (from 08-14) …`). (c) `current: key === thisWeek` → `i === WEEKS_SHOWN - 1` → the CUSTOM case (no bar may be current when TO precedes this week).
- [ ] **Step 4: Commit** `feat(stats): metres per week — eight Monday-start bars ending at the range's last day`.

### Task 3: SEASON in the domain — cumulative, avg/day, streaks

**Files:** Create `domain/stats/season.ts` + `.test.ts`.

**Produces:** `SeasonPoint { date; meters; cumulative }`, `Streak { current; longest }`, `SeasonSummary { season; rows; total; days; avgPerDay; points; streak }`; `streakOf(weekKeys: ReadonlySet<number>, today)`, `seasonSummary(rows, today)`.

- [ ] **Step 1: Failing test** (`season.test.ts`; a `row(id, date, workMeters = 1000)` helper building a `manual`/`steps` row, `stored` with `workMeters: null`; `W1..W5` = Mondays 2026-08-10 … 09-07 as `toDayNumber` keys). `streakOf` (§8.3): `{W1,W2,W4}` today 09-12 → `{ current: 1, longest: 2 }`; `{W1,W2,W4,W5}` → `{ 2, 2 }`; `{W1,W2,W4}` today 09-02 → current 1; empty → `{ 0, 0 }`; `{W3}` today 09-12 → `{ 0, 1 }`. `seasonSummary` on the seed: `season.name 2027`, `rows 9`, `total 43012`, `days 135`, `Math.round(avgPerDay) 319`, cumulative points `[8000, 10000, 13012, 15012, 25012, 33012, 38012, 41012, 43012]` (R5 → R13), first date 2026-05-14, streak `{ 3, 3 }`. **Boundary fixtures (§8.5):** (a) `+ row May 1 (1000) + row today (2000)` → rows 11, total 46012, first point May 1, last cumulative 46012, streak `{ 3, 3 }` (May 1 2026 is a Friday: its week KEY is Monday Apr 27, before `season.start`, kept because the ROW is in season); **(a′) a run straddling May 1:** seed + May 1 + May 6 + May 20 → the weeks Apr 27 · May 4 · May 11 (R5) · May 18 make FOUR → `{ current: 3, longest: 4 }` (a key clamped to May 1 reads `{ 3, 3 }`); a row on 2026-04-30 is the PREVIOUS season (total stays 43012), and with today = 2026-04-30 the season is 2026, `2025-05-01` counts and `2025-04-30` does not, `days 365`; (b) rows on 2026-05-20 and 05-27 join R5 (May 14) and R6 (Jun 2) into a FOUR-week run → `{ current: 3, longest: 4 }`; (c) the seed without R13 → `{ 2, 2 }`, total 41012; the null-metres pin: rows Aug 12 (1000) and Aug 19 (`null`), today Aug 20 → `{ 2, 2 }`, total 1000, rows 2; May 1 divisor: one 1000 m row on 2026-05-01 with today = May 1 → `days 1`, `avgPerDay 1000`; two rows on one date → ONE point `{ meters: 300, cumulative: 300 }`, rows 2. **The pre-May-1 pin (ruling 22):** the seed plus rows on 2026-04-08, 04-15, 04-22, 04-29 (the weeks of Apr 6 … Apr 27, a four-week run) → `{ current: 3, longest: 3 }` — the April run never counts; and `[those four, row May 5]` with today = 2026-05-06 → `{ current: 1, longest: 1 }` — an April run never joins a May streak. Run → FAIL.
- [ ] **Step 2: Implement:**

```ts
import { compareDates, mondayOf, seasonOf, toDayNumber, type CalendarDate, type Season } from "./calendar.js";
import { rowsInRange } from "./aggregate.js";
import type { DatedStatsRow } from "./statsRow.js";
export interface SeasonPoint { date: CalendarDate; meters: number; cumulative: number }
export interface Streak { current: number; longest: number }
export interface SeasonSummary { season: Season; rows: number; total: number; days: number; avgPerDay: number; points: SeasonPoint[]; streak: Streak }
/** Streak arithmetic over week-start day numbers (Mondays). Rows, not metres; an unfinished week never breaks a streak. */
export function streakOf(weekKeys: ReadonlySet<number>, today: CalendarDate): Streak {
  const thisWeek = toDayNumber(mondayOf(today));
  let cursor = weekKeys.has(thisWeek) ? thisWeek : thisWeek - 7;
  let current = 0;
  while (weekKeys.has(cursor)) { current += 1; cursor -= 7; }
  let longest = 0, run = 0, prev: number | null = null;
  for (const k of [...weekKeys].sort((a, b) => a - b)) {
    run = prev !== null && k === prev + 7 ? run + 1 : 1; if (run > longest) longest = run; prev = k;
  }
  return { current, longest };
}
/** ONE row set — May 1 of the current season … today, never the filter's range (invariant 19). */
export function seasonSummary(rows: readonly DatedStatsRow[], today: CalendarDate): SeasonSummary {
  const season = seasonOf(today);
  const inSeason = rowsInRange(rows, { from: season.start, to: today }).sort((a, b) => compareDates(a.date, b.date));
  const points: SeasonPoint[] = []; let cumulative = 0;
  for (const r of inSeason) {
    const m = r.workMeters ?? 0; cumulative += m;
    const last = points[points.length - 1];
    if (last && compareDates(last.date, r.date) === 0) { last.meters += m; last.cumulative = cumulative; }
    else points.push({ date: r.date, meters: m, cumulative });
  }
  const days = toDayNumber(today) - toDayNumber(season.start) + 1;
  const weekKeys = new Set(inSeason.map((r) => toDayNumber(mondayOf(r.date))));
  return { season, rows: inSeason.length, total: cumulative, days, avgPerDay: cumulative / days, points, streak: streakOf(weekKeys, today) };
}
```

The module comment says "the logbook has none" about the streak — never the vendor's name (the §8.4 scan).

- [ ] **Step 3: Gates + mutations** (each restored; measured): `… --project unit domain/stats` PASS (7 files / 57 tests with Tasks 1-4). (a) **transposition** `return { current: longest, longest: current }` → fixture (b) and three `streakOf` pins red. (b) **fallback dropped** `let cursor = thisWeek;` → fixture (c) (`2 / 2` reads `0`) and the first §8.3 pin red. (c) **inclusive → exclusive** in `inRange` (`<= 0` → `< 0` on `to`; `>= 0` → `> 0` on `from`) → fixture (a), the Apr 30 case and the May 1 divisor case red, plus `calendar.test.ts`'s own pin. (d) **divisor excludes today** (drop `+ 1`) → the seed's `days 135`, the 365-day case and the May 1 case red. (e) **streak keys from every row** — `new Set(rows.map(…))` instead of `inSeason.map(…)` → the pre-May-1 pin red (`longest 4`, and `current 5 / longest 5` in the May-6 case) (measured). (f) **keys clamped to `season.start`** — `Math.max(toDayNumber(mondayOf(r.date)), toDayNumber(season.start))` → the straddle pin (a′) reads `{ 3, 3 }` (measured). `app/domain/**` coverage stays 100% (`pnpm test:coverage`, read the per-file rows).
- [ ] **Step 4: Commit** `feat(stats): season cumulative, avg metres per day and weekly streaks from one unfiltered row set`.

### Task 4: Test trend domain, the seed's tests, the adapter

**Files:** Create `domain/stats/testTrend.ts` + `.test.ts`, `src/api/useTestHistory.ts` + `.test.ts` + `.tz.test.ts`; modify `domain/stats/gate0Seed.ts` + `.test.ts`, `domain/stats/aggregate.ts` + `.test.ts`.

**Produces:** `TestDistance`, `TestPoint { id; distance; splitSeconds; date }`, `testTrend(points): Record<TestDistance, TestPoint[]>` (ascending by date, stable); `GATE0_TESTS: readonly (TestPoint & { log: string | null })[]`; `earliestDate(rows): CalendarDate | null`; `TestHistoryState` (`loading | error+retry | ready+points`), `useTestHistory()`, `testRowToPoint(row)`.

- [ ] **Step 1: Failing tests.** `testTrend.test.ts`: `testTrend([...GATE0_TESTS].reverse())` → `2k` ids `["T2", "T4", "T6"]`, `6k` `["T1", "T3", "T5"]`, `2k[2].splitSeconds 114`, `6k[0].date 2025-11-22`; two same-day 2k points keep input order; `6k` `[]`. `gate0Seed.test.ts`: a second `describe` loads `seed.mjs` by URL as the first does and asserts `GATE0_TESTS` mapped to `{ id, date, kind: distance, splitSeconds, log }` strictly equals `seed.tests` mapped through `parseSeedDate`. `aggregate.test.ts`: `earliestDate([...GATE0_ROWS].reverse()) → 2025-11-08`; `[] → null`. Run → FAIL.
- [ ] **Step 2: Implement.** `testTrend.ts`:

```ts
import { compareDates, type CalendarDate } from "./calendar.js";
export type TestDistance = "2k" | "6k";
export interface TestPoint { id: string; distance: TestDistance; splitSeconds: number; date: CalendarDate }
export type TestTrend = Record<TestDistance, TestPoint[]>;
/** Two series ascending by date. Same-day ties are UNORDERED (`stores/testHistory.ts` `list()` orders by
 *  `desc(loggedAt)` alone; no wire tiebreaker) and unreachable in production (`sessionLogId` UNIQUE + `defaultNow()`);
 *  the stable sort keeps the adapter's order for such a pair and nothing depends on it. */
export function testTrend(points: readonly TestPoint[]): TestTrend {
  const byDate = [...points].sort((a, b) => compareDates(a.date, b.date));
  return { "2k": byDate.filter((p) => p.distance === "2k"), "6k": byDate.filter((p) => p.distance === "6k") };
}
```

`gate0Seed.ts`: `import type { TestPoint } from "./testTrend.js"`, `export interface Gate0Test extends TestPoint { log: string | null }`, a `// prettier-ignore` tuple table `TESTS: [id, date, distance, splitSeconds, log][]` = `["T1","2025-11-22","6k",124.8,null]`, `["T2","2026-01-17","2k",117.6,"R2"]`, `["T3","2026-03-28","6k",122.9,null]`, `["T4","2026-06-02","2k",115.3,"R6"]`, `["T5","2026-08-08","6k",121.4,null]`, `["T6","2026-09-11","2k",114.0,"R13"]`, and `GATE0_TESTS = TESTS.map(([id, date, distance, splitSeconds, log]) => ({ id, date: parseSeedDate(date), distance, splitSeconds, log }))`. `aggregate.ts` (import `compareDates`, `CalendarDate`):

```ts
/** The earliest row date, or null with no rows — ALL's range line (§14 ruling 21). */
export function earliestDate(rows: readonly DatedStatsRow[]): CalendarDate | null {
  let earliest: CalendarDate | null = null;
  for (const r of rows) if (earliest === null || compareDates(r.date, earliest) < 0) earliest = r.date;
  return earliest;
}
```

- [ ] **Step 3: Failing adapter tests.** `useTestHistory.tz.test.ts` — the SAME shape as `useStatsRows.tz.test.ts` (set `process.env.TZ = "America/New_York"` first, restore in `afterAll`, assert offset 240), then `testRowToPoint({ id: "t", distance: "2k", splitSeconds: 114, loggedAt: "2026-09-13T02:30:00Z" })` → `date { 2026, 9, 12 }`. `useTestHistory.test.ts` (`vi.resetModules()` + `vi.doMock("../api")` per case, as `useStatsRows.test.ts`): ROWS newest-first (`t6` 2026-09-11, `t1` 2025-11-22) → `loading` then `ready` with points `["t1", "t6"]` (OLDEST first) and `points[1]` strictly `{ id: "t6", distance: "2k", splitSeconds: 114, date: { 2026, 9, 11 } }`; a second mount fetches again (`toHaveBeenCalledTimes(2)`); a 500 → `error`, `retry()` (destructure it first — TS narrows `result.current` inside the closure otherwise) → a second call and `ready`.
- [ ] **Step 4: Implement `useTestHistory.ts`:**

```ts
import { useEffect, useState } from "react";
import { api } from "../api";
import type { TestPoint } from "../../domain/stats/testTrend.js";
import { toCalendarDate } from "./useStatsRows";
/** `GET /api/test-history`'s row (`stores/testHistory.ts` `list` via `res.json`): the four fields read. */
export interface TestHistoryRow { id: string; distance: "2k" | "6k"; splitSeconds: number; loggedAt: string }
/** The SAME instant→date seam as every stats row (`toCalendarDate`); pinned under a negative-offset TZ. */
export function testRowToPoint(row: TestHistoryRow): TestPoint {
  return { id: row.id, distance: row.distance, splitSeconds: row.splitSeconds, date: toCalendarDate(new Date(row.loggedAt)) };
}
export type TestHistoryState = { state: "loading" } | { state: "error"; retry: () => void } | { state: "ready"; points: TestPoint[] };
/** Fetches every test on every mount (`useStatsRows`'s shape). The route lists NEWEST first; points go out OLDEST first. */
export function useTestHistory(): TestHistoryState {
  const [state, setState] = useState<TestHistoryState>({ state: "loading" });
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const retry = () => { setState({ state: "loading" }); setGeneration((g) => g + 1); };
    api("/api/test-history")
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) { const rows = (await res.json()) as TestHistoryRow[]; setState({ state: "ready", points: rows.map(testRowToPoint).reverse() }); }
        else setState({ state: "error", retry });
      })
      .catch(() => { if (!cancelled) setState({ state: "error", retry }); });
    return () => { cancelled = true; };
  }, [generation]);
  return state;
}
```

- [ ] **Step 5: Gates + mutations** (measured): unit `domain/stats` 57/57; client `src/api/useTestHistory.test.ts` + `.tz.test.ts` 5/5. (a) `earliestDate` `< 0` → `> 0` → its case red. (b) getters → `getUTC*` inside `toCalendarDate` is PR 1's own mutation and bites the tz test here too (same function). (c) `date: toCalendarDate(new Date())` (the date ignored) → `× fetches /api/test-history once per mount …` (`d: 11` expected) and, once Task 8 lands, `× TEST TREND: six dots …` (measured 2 failed / 28 passed).
- [ ] **Step 6: Commit** `feat(stats): test trend series, the seed's six tests, and the test-history adapter`.

### Task 5: The range line and the hero chevron (rulings 21 and 20)

**Files:** Modify `src/you/stats/format.ts` + `.test.ts`, `StatsScreen.tsx` + `.test.tsx`, `YouStatsHero.tsx` + `.test.tsx`, `src/index.css`.

- [ ] **Step 1: Failing format tests** (`format.test.ts`): `fmtRangeLine({ from: null, to: null }, 2025-11-08) → "ALL TIME · SINCE 8 NOV 2025"`, with `null` → `null`; from `2026-05-01` / `01-01` / `09-01` / `08-14` to today 2026-09-12 → `"1 MAY TO 12 SEP 2026"`, `"1 JAN TO 12 SEP 2026"`, `"1 TO 12 SEP 2026"`, `"14 AUG TO 12 SEP 2026"`; across years `"8 NOV 2025 TO 12 SEP 2026"`; one day `"12 TO 12 SEP 2026"`; a one-sided `{ from: today, to: null }` reads as ALL (`"ALL TIME · SINCE 8 NOV 2025"` with that earliest) — no producer makes one (`presetRange`/`customRange` set both ends), so the arm is DELETED rather than pinned; `fmtDayMonth(2025-11-08) → "8 NOV"`, `fmtMonth(2026-05-01) → "MAY"`. Implement (append to `format.ts`, importing `CalendarDate`/`DateRange` types):

```ts
const MON = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
export function fmtDayMonth(d: CalendarDate): string { return `${d.d} ${MON[d.m - 1]}`; }
export function fmtMonth(d: CalendarDate): string { return MON[d.m - 1]!; }
/** build.mjs `rangeText`: the month once when shared, the year once when shared, both ends in full across years. */
export function fmtRange(from: CalendarDate, to: CalendarDate): string {
  if (from.y === to.y && from.m === to.m) return `${from.d} TO ${to.d} ${MON[to.m - 1]} ${to.y}`;
  if (from.y === to.y) return `${fmtDayMonth(from)} TO ${fmtDayMonth(to)} ${to.y}`;
  return `${fmtDayMonth(from)} ${from.y} TO ${fmtDayMonth(to)} ${to.y}`;
}
/** The one prose line (ruling 21, variant A): the days the totals cover; ALL names the earliest row, null with none. */
export function fmtRangeLine(range: DateRange, earliest: CalendarDate | null): string | null {
  // presetRange/customRange set both ends together: a one-sided range has no producer and reads as ALL.
  if (range.from === null || range.to === null) return earliest === null ? null : `ALL TIME · SINCE ${fmtDayMonth(earliest)} ${earliest.y}`;
  return fmtRange(range.from, range.to);
}
```

- [ ] **Step 2: Failing screen test** (`StatsScreen.test.tsx`; FIRST change `renderScreen(rows, tests = [])` to answer BY PATH — `/api/test-history` → `tests`, else `{ rows }` — and the failed-fetch case's mock to answer the test path with `[]`, because the screen now makes two fetches; the plan's first run found `Found multiple elements with the role "alert"`): `rangeLine = () => document.querySelector(".stats-range")?.textContent` reads the five preset lines above, CUSTOM `"14 AUG TO 12 SEP 2026"` on open, `"8 NOV 2025 TO 12 SEP 2026"` after FROM = 2025-11-08, and the SAME line with METRES `56,752` after FROM = 2026-09-13 (FROM > TO: the line names the range still APPLIED). And `YouStatsHero.test.tsx`: the hero has one `.you-stats-chevron` with text `›` and `aria-hidden="true"`, `hero.querySelectorAll("a, button, [tabindex]")` has length 0, and `.you-stats-body .stats-legend-line` exists.
- [ ] **Step 3: Implement.** `StatsScreen.tsx`'s `Body`: `const rangeLine = fmtRangeLine(range, earliestDate(rows));` and, directly after `<StatsFilterBar … />`, `{rangeLine !== null && <p className="stats-caption stats-range">{rangeLine}</p>}` (imports: `earliestDate` from the aggregate, `fmtRangeLine` from `./format`). `YouStatsHero.tsx`: wrap the three state branches in `<div className="you-stats-body">…</div>` and follow it with `<span aria-hidden="true" className="you-stats-chevron">&rsaquo;</span>` inside the `Link` (its `aria-label="Stats"` and `aria-describedby` unchanged; doc comment names ruling 20). CSS — change `.you-stats-hero`'s `flex-direction: column; gap: 10px;` to `align-items: center; gap: 12px;` and add:

```css
.you-stats-hero:active { background: var(--surface-sunken); } /* ruling 20: 1.06:1 on --page, a cue not a mark; text/marks on it ≥ 4.48:1 (contrast.json) */
.you-stats-body { display: flex; flex-direction: column; gap: 10px; flex: 1 1 0; min-width: 0; }
.you-stats-chevron { flex: none; font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.08em; color: var(--ink-3); }
.stats-range { margin-top: 8px; }
```

- [ ] **Step 4: Gates + mutations** (measured): client `src/you/stats` PASS. (a) render the line only when `rangeLine === ""` → `× the range line reads the days each preset covers …`. (b) `tabIndex={0}` on the chevron → PR 1's `× is exactly ONE focusable control …` AND the new chevron case. Contrast: chevron `--ink-3` on `--page` 6.69:1 (`contrast.json`).
- [ ] **Step 5: Commit** `feat(stats): the range line under the filter bar and the hero's chevron (rulings 20, 21)`.

### Task 6: METRES PER WEEK group

**Files:** Create `src/you/stats/WeekBarsGroup.tsx`, `src/you/stats/chartLabels.ts`; modify `StatsScreen.tsx` + `.test.tsx`, `src/index.css`.

**The labels rule (harden lens 1):** `role="img"` PRUNES an SVG's own `<text>` (ARIA presentational children), so the `aria-label` is the ONLY thing assistive tech hears — each chart's label says what the marks MEAN, never a raw value for a mark that means something else. `chartLabels.ts` (a plain module, so the component files export only components) holds the three builders:

```ts
export function weekBarsLabel(bars: readonly WeekBar[]): string {
  const parts = bars.map((b) => b.outOfRange ? `${fmtDayMonth(b.weekStart)} outside the range` : b.current ? `this week ${fmtMeters(b.meters)}` : `${fmtDayMonth(b.weekStart)} ${fmtMeters(b.meters)}`);
  return `Metres per week, eight weeks: ${parts.join(", ")}`;
}
export function seasonLabel(s: SeasonSummary): string {
  return `Season ${s.season.name} cumulative metres, ${fmtMeters(s.total)} today, ${fmtMeters(s.avgPerDay)} per day, current streak ${s.streak.current}, longest ${s.streak.longest}`;
}
export function trendLabel(trend: TestTrend): string {   // the <p> legend carries only the series NAMES
  const last = (k: TestDistance) => { const p = trend[k][trend[k].length - 1]; return p ? `latest ${k} ${fmtSplit(p.splitSeconds)}` : `no ${k}`; };
  return `2k and 6k test splits over time, ${trend["2k"].length + trend["6k"].length} tests, ${last("2k")}, ${last("6k")}`;
}
```

- [ ] **Step 1: Failing test** (`StatsScreen.test.tsx`): on ALL, `.stats-bar-label` texts `["13,000", "2,000"]` (tallest, then current), `THIS WK` inside the `img` named `/^Metres per week/`, exactly one `.stats-bar-current` with `data-week="2026-09-07"`, no `.stats-bar-out`; after clicking 30 DAYS, three `.stats-bar-out`, the text `OUT OF RANGE`, and the img's `aria-label` contains `20 JUL outside the range` and `this week 2,000` and does NOT match `/JUL 0\b/`; `GATE0_ROWS.slice(0, 2)` (R1, R2 — older than the window) on ALL: SESSIONS `2`, the METRES PER WEEK region reads `NOTHING IN THESE EIGHT WEEKS` and has no `img`; the one-row case (R13 alone) reads `TWO ROWS MAKE A CHART` in the sections `["METRES PER WEEK", "TIME BY TYPE", "SEASON 2027"]` (map each hit to its `closest("section") h2`).
- [ ] **Step 2: Implement** `WeekBarsGroup.tsx` — constants `W 320, H 132, PAD_L 44` (A3 draws 36; a six-glyph `15,000` at 9 px mono end-anchored at `PAD_L − 6` clipped its first digit on the first capture — TraceChart's `LEFT_PAD` lesson), `PAD_R 8, PAD_T 14, PAD_B 18, PLOT_W = W − PAD_L − PAD_R, PLOT_BOTTOM = H − PAD_B, BAR_MAX 24, CAP 4`; exports `OUT_OF_RANGE = "OUT OF RANGE"`, `THIS_WEEK = "THIS WK"`, `NOTHING_IN_WINDOW = "NOTHING IN THESE EIGHT WEEKS"` (copy pending James — Gate 0 drew no such frame). `WeekBarsGroup({ bars, rowsInRange })` = `<section className="stats-group" aria-labelledby="stats-mpw-h">` + `<h2>METRES PER WEEK</h2>` + (`rowsInRange < 2` ? `<p className="stats-caption">{TWO_ROWS_MAKE_A_CHART}</p>` : `bars.every((b) => b.meters <= 0)` ? `<p className="stats-caption">{NOTHING_IN_WINDOW}</p>` : `<div className="stats-card"><WeekBarsChart bars /></div>`). `WeekBarsChart`:

```tsx
const values = bars.map((b) => b.meters); const peak = Math.max(...values);
const { max, step } = niceMax(peak);
const y = linearScale({ domain: [0, max], range: [PLOT_BOTTOM, PAD_T] });
const grid = chooseTicks([0, max], max / step + 1);
const slots = layoutBars(bars.length, PLOT_W, BAR_MAX);
const tallest = values.indexOf(peak);
const out = bars.flatMap((b, i) => (b.outOfRange ? [i] : []));
// <svg className="stats-chart" viewBox=`0 0 ${W} ${H}` role="img" aria-label={weekBarsLabel(bars)}>
//  grid.map → <line className="stats-grid" x1={PAD_L} x2={W-PAD_R} y1=y2={y(v)}/> + <text className="stats-tick" x={PAD_L-6} y={y(v)} textAnchor="end" dominantBaseline="middle">{formatTick(v, "metres")}</text>
//  bars.map((b, i)) with s = slots[i], x = PAD_L + s.x, week = fmtDate(b.weekStart):
//    outOfRange → <rect className="stats-bar-out" data-week x y={PAD_T} width={s.width} height={PLOT_BOTTOM-PAD_T}/>
//    meters <= 0 → <line className={`${cls} stats-bar-zero`} data-week x1={x} x2={x+s.width} y1=y2={PLOT_BOTTOM}/>   (cls = current ? "stats-bar stats-bar-current" : "stats-bar")
//    else top = y(b.meters); PLOT_BOTTOM - top >= 2*CAP ? <path className={cls} data-week d={`M${x} ${PLOT_BOTTOM} V${top+CAP} a${CAP} ${CAP} 0 0 1 ${CAP} -${CAP} h${s.width-2*CAP} a${CAP} ${CAP} 0 0 1 ${CAP} ${CAP} V${PLOT_BOTTOM} Z`}/> : <rect className={cls} … y={top} height={PLOT_BOTTOM-top}/>
//         + {(b.current || i === tallest) && <text className="stats-bar-label" x={x+s.width/2} y={top-4} textAnchor="middle">{fmtMeters(b.meters)}</text>}
//  x labels for i % 2 === 1 || i === 7: <text className="stats-tick" x={PAD_L+slots[i].centre} y={H-5} textAnchor="middle">{i === 7 && b.current ? THIS_WEEK : fmtDayMonth(b.weekStart)}</text>
//  out.length > 0 → one <text className="stats-tick" x={PAD_L + (slots[out[0]].centre + slots[out.at(-1)].centre)/2} y={PAD_T + (PLOT_BOTTOM-PAD_T)/2} textAnchor="middle" dominantBaseline="middle">{OUT_OF_RANGE}</text>
```

Mount in `Body` between `TotalsGroup` and `TimeByTypeGroup`: `<WeekBarsGroup bars={metresPerWeek(rows, range, today)} rowsInRange={inRange.length} />`. CSS (append): `.stats-chart { display: block; width: 100%; height: auto }`, `.stats-grid { stroke: var(--rule-2); stroke-width: 1 }`, `.stats-tick { font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.06em; fill: var(--ink-3) }`, `.stats-bar { fill: var(--ink-4) }`, `.stats-bar-current { fill: var(--ink) }`, `.stats-bar-zero { stroke: var(--ink-4); stroke-width: 2 }`, `.stats-bar-zero.stats-bar-current { stroke: var(--ink) }`, `.stats-bar-out { fill: none; stroke: var(--rule-2); stroke-width: 1.5; stroke-dasharray: 3 3 }`, `.stats-bar-label, .stats-point-label { font-family: var(--font-mono); font-size: 9px; font-weight: 500; fill: var(--ink) }`. Marks: `--ink-4` 5.29:1, `--ink` 17.11:1 on `--surface`; gridlines and the dashed outline are decorative (1.40:1).

- [ ] **Step 3: Gates + mutations** (measured): PASS. (a) `(b.current || i === tallest || true)` → `× METRES PER WEEK on ALL: labels on the tallest …` (four labels). (b) the label from raw values (`bars.map((b) => fmtMeters(b.meters)).join(", ")`) → the same case, `expected 'Metres per week, eight weeks: 0, 0, 0, 0, 0, 13,000, 3,000, 2,000' to contain '20 JUL outside the range'`. (c) `b.meters <= 0` → `< 0` in the all-zero branch → `× two rows older than the window …` (an `img` renders).
- [ ] **Step 4: Commit** `feat(stats): METRES PER WEEK — eight bars, this week in ink, out-of-range weeks dashed`.

### Task 7: SEASON group

**Files:** Create `src/you/stats/SeasonGroup.tsx`; modify `StatsScreen.tsx` + `.test.tsx`, `src/index.css`.

- [ ] **Step 1: Failing test:** the region named `SEASON 2027` contains `43,012 TODAY`; its `img`'s `aria-label` is exactly `Season 2027 cumulative metres, 43,012 today, 319 per day, current streak 3, longest 3` (the SVG's own text is pruned under `role="img"`); tiles (`getByText(label).nextElementSibling.querySelector(".stats-tile-value")`) read `AVG M/DAY 319`, `CURRENT STREAK 3`, `LONGEST STREAK 3`, two `WEEKS · ERGOMATIC`; after clicking MONTH (METRES `5,000`) the card still reads `43,012 TODAY`; `GATE0_ROWS.slice(0, 4)` (METRES `13,740`, no season row) reads `NO ROWS THIS SEASON YET` in the region; a CUSTOM FROM = today (no rows) still renders the SEASON region under the `NO ROWS BETWEEN` line with no TOTALS region.
- [ ] **Step 2: Implement** `SeasonGroup.tsx` (`W 320, H 140, PAD_L 44, PAD_R 12, PAD_T 14, PAD_B 18`; exports `NO_ROWS_THIS_SEASON = "NO ROWS THIS SEASON YET"`, `STREAK_UNIT = "WEEKS · ERGOMATIC"`): `<section aria-labelledby="stats-season-h">` + `<h2>SEASON {summary.season.name}</h2>` + (`rows === 0` → `NO_ROWS_THIS_SEASON` caption; `rows === 1` → `TWO_ROWS_MAKE_A_CHART`; else `<div className="stats-card"><SeasonChart/><dl className="stats-tiles">` three `Tile`s — `<div className="stats-tile"><dt>{label}</dt><dd><span className="stats-tile-value">{value}</span><span className="stats-tile-unit">{unit}</span></dd></div>` — `AVG M/DAY` `fmtMeters(avgPerDay)` `M`, `CURRENT STREAK` `String(streak.current)` `STREAK_UNIT`, `LONGEST STREAK` likewise). `SeasonChart`:

```tsx
const start = toDayNumber(season.start), end = toDayNumber(season.end), todayX = start + summary.days - 1;
const x = linearScale({ domain: [start, end], range: [PAD_L, W - PAD_R] });   // the WHOLE season's width: today's position IS the progress
const { max, step } = niceMax(total); const y = linearScale({ domain: [0, max], range: [PLOT_BOTTOM, PAD_T] });
const grid = chooseTicks([0, max], max / step + 1);
const months = [5, 8, 11, 2, 4].map((m) => ({ y: m >= 5 ? season.start.y : season.end.y, m, d: 1 }));   // MAY · AUG · NOV · FEB · APR
const line = polylinePoints([{ x: start, y: 0 }, ...points.map((p) => ({ x: toDayNumber(p.date), y: p.cumulative })), { x: todayX, y: total }], x, y);
const tx = x(todayX); const labelRight = tx < W * 0.6;
// svg role="img" aria-label={seasonLabel(summary)}; grid + metres ticks as Task 6; month labels at y={H-5};
// <polyline className="stats-line" points={line}/>; <line className="stats-today-line" x1=x2={tx} y1={PAD_T} y2={PLOT_BOTTOM}/>; <circle className="stats-dot" cx={tx} cy={y(total)} r={5}/>;
// <text className="stats-point-label" x={labelRight ? tx + 8 : tx - 8} y={y(total)} textAnchor={labelRight ? "start" : "end"} dominantBaseline="middle">{fmtMeters(total)} TODAY</text>
```

Mount AFTER `TimeByTypeGroup`'s conditional block (outside the `inRange.length === 0` ternary, so an empty CUSTOM still shows it): `<SeasonGroup summary={seasonSummary(rows, today)} />`. CSS: `.stats-line { fill: none; stroke: var(--ink); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round }`, `.stats-dot { fill: var(--ink); stroke: var(--surface); stroke-width: 2 }`, `.stats-today-line { stroke: var(--ink-4); stroke-width: 1 }`, `.stats-tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 12px 0 0; padding-top: 12px; border-top: 1px solid var(--rule-2) }`, `.stats-tile { display: flex; flex-direction: column; gap: 4px; min-width: 0 }`, `.stats-tile dt { mono 9px / 0.14em / --ink-3 }`, `.stats-tile dd { margin: 0; display: flex; flex-direction: column; gap: 4px }`, `.stats-tile-value { mono 20px 500 --ink tabular-nums line-height 1 }`, `.stats-tile-unit { mono 9px / 0.08em / --ink-3 }` (write the shorthands out as properties).

- [ ] **Step 3: Gates + mutations** (measured): PASS. (a) `seasonSummary(inRange, today)` (the FILTERED rows) → `× SEASON 2027 draws 43,012 TODAY … does not move when the filter does` (`5,000 TODAY`). (b) `rows === 0` → `rows < 2` → the one-row ordered-sections case red.
- [ ] **Step 4: Commit** `feat(stats): SEASON card — cumulative curve, avg m/day, current and longest streak`.

### Task 8: TEST TREND group, the page order, the widened scan

**Files:** Create `src/you/stats/TestTrendGroup.tsx`; modify `StatsScreen.tsx` + `.test.tsx`, `concept2Independence.test.ts`, `src/index.css`.

- [ ] **Step 1: Failing tests.** `StatsScreen.test.tsx` with `GATE0_TEST_ROWS` (the seed's tests as the route lists them: NEWEST first, `loggedAt` `${date}T16:00:00.000Z`, `sessionLogId: log`): sections in order `["TOTALS", "METRES PER WEEK", "TIME BY TYPE", "SEASON 2027", "TEST TREND"]` and exactly ONE `.stats-caption` on the page (the range line); the TEST TREND region: 7 `.stats-dot` on the page (6 + the season's end dot), `2K 1:54.0` and `6K 2:01.4`, ticks `1:55 · 2:00 · 2:05`, the `text.stats-tick` month labels `["NOV", "JAN", "MAR", "MAY", "JUL", "SEP"]`, `FASTER IS UP`, the 2k series' last `circle` `cy` LESS than the 6k's (faster is UP), three `.stats-dot-6k`, the svg's `aria-label` exactly `2k and 6k test splits over time, 6 tests, latest 2k 1:54.0, latest 6k 2:01.4` (the `<p>` legend carries only the series names; the values are said in the label); `[]` tests → `NO 2K OR 6K TEST LOGGED`; one test → one circle, no `polyline`, labelled; the test fetch 500 → an alert `Couldn't load your tests.` with `Try again` while METRES still reads `56,752`, and the retry refetches. `concept2Independence.test.ts`: `SCANNED_FILES` gains `src/api/useTestHistory.ts` and the first case asserts both hooks and `you/stats/TestTrendGroup.tsx` are scanned.
- [ ] **Step 2: Implement** `TestTrendGroup.tsx` (`W 320, H 150, PAD_L 40, PAD_R 52, PAD_T 12, PAD_B 18, MAX_MONTH_LABELS 6, ONE_POINT_HALF_SPAN 5`; exports `NO_TEST_LOGGED = "NO 2K OR 6K TEST LOGGED"`, `FASTER_IS_UP = "FASTER IS UP"`, `COULDNT_LOAD_TESTS = "Couldn't load your tests."`): `TestTrendGroup({ state: TestHistoryState })` = section `TEST TREND` + loading `LOADING…` / error `<p className="notice" role="alert">{COULDNT_LOAD_TESTS} <button className="button-outline" onClick={state.retry}>Try again</button></p>` / ready+empty caption / ready → `<div className="stats-card"><TestTrendChart points/><p className="stats-trend-legend"><span className="stats-legend-chip"><span className="stats-trend-swatch stats-trend-swatch-2k" aria-hidden/>2K</span><span …6k…>6K</span><span>{FASTER_IS_UP}</span></p></div>`. `TestTrendChart`:

```tsx
const trend = testTrend(points); const all = [...trend["6k"], ...trend["2k"]];
const dates = all.map((p) => p.date).sort(compareDates);
const from = firstOfMonth(dates[0]!), to = lastOfMonth(dates[dates.length - 1]!);
const x = linearScale({ domain: [toDayNumber(from), toDayNumber(to)], range: [PAD_L, W - PAD_R] });
const splits = all.map((p) => p.splitSeconds);
const domainY = domainFromReadings(splits, { minHeight: 10 }) ?? [splits[0]! - ONE_POINT_HALF_SPAN, splits[0]! + ONE_POINT_HALF_SPAN];
const y = linearScale({ domain: domainY, range: [PLOT_BOTTOM, PAD_T], invert: true });   // faster (smaller) is UP — TraceChart's pace rule
const ticks = chooseTicks(domainY, 4);
const months = monthStarts(from, to); const every = Math.ceil(months.length / MAX_MONTH_LABELS);
// svg role="img" aria-label={trendLabel(trend)}; ticks → grid line + <text className="stats-tick" …>{formatTick(v, "split")}</text>;
// months.map((m, i) => i % every === 0 && <text className="stats-tick" x={x(toDayNumber(m))} y={H-5} textAnchor="middle">{fmtMonth(m)}</text>);
// for k of ["6k", "2k"] (2k drawn last, on top): <g data-series={k}> pts.length > 1 && <polyline className={`stats-line stats-line${cls}`} points={polylinePoints(pts → {x: toDayNumber(date), y: splitSeconds}, x, y)}/>;
//   each pt → <circle className={`stats-dot stats-dot${cls}`} cx cy r={4}/>; last → <text className="stats-point-label" x={x(…)+8} y={y(…)} dominantBaseline="middle">{k.toUpperCase()} {fmtSplit(last.splitSeconds)}</text>   (cls = k === "6k" ? "-6k" : "")
```

`StatsScreen.tsx`: `const tests = useTestHistory();` beside `useStatsRows()` in `StatsScreen`, passed to `Body` as `tests: TestHistoryState`; `<TestTrendGroup state={tests} />` last, after `SeasonGroup`. CSS: `.stats-line-6k { stroke: var(--type-o2) }`, `.stats-dot-6k { fill: var(--type-o2) }`, `.stats-trend-legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 8px 0 0; mono 10px / 0.06em / --ink-3 }`, `.stats-trend-legend .stats-legend-chip { color: var(--ink) }`, `.stats-trend-swatch { width: 14px; height: 2px; background: var(--ink) }`, `.stats-trend-swatch-6k { background: var(--type-o2) }`.

- [ ] **Step 3: Gates + mutations** (measured): `src/you/stats` 40/40; the scan 4/4. (a) `const cls = "";` → the trend case (`.stats-dot-6k` 0). (b) `invert: false` → the trend case (`cy` 2k > 6k). (c) Task 4's date-ignored mutation → the trend case (`NOV` absent). Then `pnpm exec eslint src/you/stats src/api src/charts`, `pnpm exec tsc -p tsconfig.app.json --noEmit`, `pnpm exec prettier --check src domain` clean.
- [ ] **Step 4: Commit** `feat(stats): TEST TREND — 2k and 6k splits over date, faster is up, deleted-log points kept`.

### Task 9: e2e, design registration, captures, records

**Files:** Modify `src/test/gate0LogBodies.ts`, `e2e/helpers.ts`, `e2e/stats.spec.ts`, `e2e/design.spec.ts`, `e2e/screenshots.spec.ts`, `docs/design/career-stats/README.md`; re-capture `docs/screenshots/you.png` and `you-stats.png`.

- [ ] **Step 1: The seed's tests for the e2e.** `gate0LogBodies.ts`: `export interface Gate0TestBody { id; date; distance; splitSeconds; log: string | null }` and `GATE0_TEST_BODIES = GATE0_TESTS.map((t) => ({ id: t.id, date: fmtDate(t.date), distance: t.distance, splitSeconds: t.splitSeconds, log: t.log }))`. `e2e/helpers.ts` (import `GATE0_TEST_BODIES`): lift `backdateLog`'s pg block into `async function backdateRow(table: "session_logs" | "test_history", id, instant)` (the query is `` `update ${table} set logged_at = $2::timestamptz where id = $1` ``, the error names the table), `backdateLog = (id, instant) => backdateRow("session_logs", id, instant)`, `export function backdateTestHistory(id, instant) { return backdateRow("test_history", id, instant); }`; and:

```ts
/** Seeds T1-T6 through POST /api/test-history against the seeded logs; a test whose seed `log` is null is
 *  keyed to a THROWAWAY log that is then deleted (ON DELETE SET NULL on the supported path — ruling 4, RF24);
 *  every row is backdated to instantFor(date). Returns seed id → test_history id. */
export async function seedGate0Tests(page: Page, ids: Record<string, string>, instantFor: (date: string) => string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const t of GATE0_TEST_BODIES) {
    let logId = t.log === null ? undefined : ids[t.log]; let throwaway: string | undefined;
    if (logId === undefined) {
      const created = await page.evaluate(async () => { const res = await fetch("/api/logs", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workoutId: null, workoutTitle: "Throwaway test log", workoutType: "TR", held: null, effort: null, notes: null, advancesPlan: false, source: "manual",
          steps: [{ label: "Work", actualMeters: 2000, actualSeconds: 480 }] }) }); return { ok: res.ok, text: await res.text() }; });
      if (!created.ok) throw new Error(`${t.id} throwaway: ${created.text}`);
      throwaway = (JSON.parse(created.text) as { id: string }).id; logId = throwaway;
    }
    const posted = await page.evaluate(async (b) => { const res = await fetch("/api/test-history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
      return { ok: res.ok, text: await res.text() }; }, { distance: t.distance, splitSeconds: t.splitSeconds, logId });
    if (!posted.ok) throw new Error(`${t.id}: ${posted.text}`);
    out[t.id] = (JSON.parse(posted.text) as { id: string }).id;
    if (throwaway !== undefined) {
      // DELETE /api/logs/:id answers 200 with `{ unCounted }` (routes/data.ts), not 204: `ok` is the check.
      const deleted = await page.evaluate(async (id) => { const res = await fetch(`/api/logs/${id}`, { method: "DELETE" }); return { ok: res.ok, status: res.status }; }, throwaway);
      if (!deleted.ok) throw new Error(`${t.id} throwaway delete: ${deleted.status}`);
    }
    await backdateTestHistory(out[t.id]!, instantFor(t.date));
  }
  return out;
}
```

- [ ] **Step 2: `stats.spec.ts`** — after `seedGate0`: `const tids = await seedGate0Tests(page, ids, (d) => `${d}T16:00:00Z`)`, then read `/api/test-history` and assert 6 rows, `T1.loggedAt === "2025-11-22T16:00:00.000Z"` (RF38: the backdate is asserted), `T1.sessionLogId` null, `T6.sessionLogId === ids.R13`. On You: `hero.locator(".you-stats-chevron")` has text `›` and `aria-hidden="true"`. On `/you/stats` after the AVG WATTS assertion: `.stats-range` reads `ALL TIME · SINCE 8 NOV 2025`; click SEASON → `1 MAY TO 12 SEP 2026` and METRES `43,012`; click ALL → back; `.stats-bar-label` → `["13,000", "2,000"]`; `.stats-bar-current` `data-week="2026-09-07"`; the `SEASON 2027` region contains `43,012 TODAY` and its `.stats-tile-value`s read `["319", "3", "3"]`; the `TEST TREND` region has 6 `circle`s, `2K 1:54.0`, `6K 2:01.4`, and one `text.stats-tick` reading `NOV`. After the R13 delete (leg 1, before the reload): still 6 circles and `2K 1:54.0` (ruling 4 on the supported path), tiles `["304", "2", "2"]` (41,012 / 135 = 303.8; weeks Aug 24 and Aug 31 with this week empty).
- [ ] **Step 3: `design.spec.ts`** — in `/you/stats` (RF37, one computed-style assertion per registered screen): the existing card assertions take `.first()` (four `.stats-card`s now: TOTALS, METRES PER WEEK, SEASON, TEST TREND); ticks and legend text on a card are `--ink-3` on `--surface`, 7.43:1 (`contrast.json`), not the page's 6.69:1; a new test clicks ALL and asserts `.stats-bar-current` fill `rgb(27, 26, 23)`, `.stats-bar-zero:not(.stats-bar-current)` stroke `rgb(111, 106, 95)` and seven `.stats-bar-zero` (the two seeded rows are this week's). In `you screen`: `.you-stats-chevron` text `›` and color `rgb(87, 84, 76)`. Mutations named in the comments: `.stats-bar { fill: var(--rule-3) }` → `rgb(201, 195, 178)`; `.you-stats-chevron { color: var(--ink-5) }` → `rgb(160, 154, 140)`. `screenshots.spec.ts`: `seedGate0Stats` collects `ids` and calls `seedGate0Tests(page, ids, (d) => new Date(`${d}T12:00:00`).toISOString())` (local noon, as its logs); `you-stats` waits on `2K 1:54.0` (the last group's last label) instead of the AVG WATTS row.
- [ ] **Step 4: Run** (measured at `5c5099cb`, stack `ergomatic-68950`): `pnpm exec tsc -p e2e/tsconfig.json --noEmit` → 0, `bash scripts/e2e-typecheck-census.sh` → 24/24; `pnpm e2e e2e/stats.spec.ts` → `1 passed (1.5s)`; `pnpm e2e e2e/design.spec.ts -g "/you/stats|^you screen$"` → `5 passed`; `pnpm screenshots -g " you$| you-stats$"` (the filter is a regex over the FULL title path, so anchor on the leading space — `^you$` matches nothing) → `2 passed`. **Mutation** (measured): drop the `backdateTestHistory` call → `expect(received).toBe(expected) … Received: "2026-09-13T03:01:52.463Z"` at the T1 read-back — the producer deletion goes red before any chart assertion. **Hero height:** scan `you.png` for rows where ≥ 90 % of pixels between x = 24 and 366 are `#ded8c9` — PR 1's method — and expect `[120, 259, …]`: 140 px (measured on the plan's capture; the doors' three rows follow at 648/692/736). Open both PNGs and describe them; on the first draft the bar ticks read `0,000`/`5,000` at `PAD_L 36` — the 44 in Tasks 6/7 is that fix, re-captured clean.
- [ ] **Step 5: Records.** `docs/design/career-stats/seed.mjs`: `streaks()` takes `weekMeters(inRange(set, seasonStart, today))` (ruling 22 — LONGEST within the season; a header comment says it stays keyed on metres and is not the streak's reference); `node compute.mjs` prints the same `CURRENT STREAK 3 · LONGEST STREAK 3` and leaves `contrast.json` byte-identical (measured: only its debug "weeks with a row" line shrinks). `docs/design/career-stats/README.md`: one paragraph under "PR 2 addendum" — rulings 20 (B1 + pressed fill) and 21 (variant A, every preset) taken 2026-09-12; B2/B3 and variant B not; the shipped bars use a 44 px gutter where A3 drew 36. `DEVIATIONS.md`: no change — its `--ink-4` row already describes the shipped bars (RF9 check done: `grep -n "ink-4" docs/design/DEVIATIONS.md` → the Phase PS row at 152). Commit `test(stats): e2e over the seed's six tests, design registration, captures`.

### Task 10: The final gates and the PR

- [ ] Full gates on the branch (measured on the paste-test tree): `pnpm lint` (incl. the census scripts) clean; `pnpm typecheck` clean; `pnpm format:check` clean; `pnpm test --project unit --project client` → `314 files / 8300 passed, 1 skipped`; the e2e job on the PR for the full suite (RF1). `pnpm test:coverage`: read `app/domain/stats/*` at 100% and the per-file rows for `src/you/stats/*`, `src/api/useTestHistory.ts`, `src/charts/*`.
- [ ] `git merge origin/main`; CI run EXISTS for the head SHA and is green (`gh run list --branch phase-ps-pr2 --limit 1 --json headSha,conclusion`).
- [ ] PR body, James-first: "This PR puts the three charts on the stats page, the range line under the filter, and the chevron on the You hero"; bullets; the two captures; a Record block carrying every mutation above with its failure text, the DBA SKIP sentence, and the copy for James's approval: `OUT OF RANGE` (the dashed weeks' label), `Couldn't load your tests.` (the trend's own failed fetch), `FASTER IS UP` kept as a legend item, `43,012 TODAY` as one label. **The hand-back (CLAUDE.md, final PR of the work):** rows to propose — none from this plan; the open questions for James are Deviations 1-4 below, which are spec rulings and not rows; plus every `dies`-overdue row anywhere in `ROADMAP.md` — nothing struck without him.

## Deviations from spec (RF10 — what the plan found false or unresolved)

1. **RESOLVED — §14 ruling 22 (James, 2026-09-12):** LONGEST is the longest run WITHIN this season; §3.3's "anywhere in the rower's history" is withdrawn from the spec. Task 3 carries the pre-May-1 pin and its mutation (e). Accepted cost: a rower six weeks deep on May 3 reads `CURRENT STREAK 1`.
2. **RESOLVED — one rule in §5 item 5 and invariant 19:** the card renders at ≥ 1 season row; `NO ROWS THIS SEASON YET` only at 0; `TWO ROWS MAKE A CHART` at 1 (the curve needs two points). That is what Task 7 builds.
3. **RESOLVED — §5 items 3/5/6, invariant 13 and ruling 4 no longer name captions:** the three groups render none (rulings 18/19); the delete-survival fact lives in §3.3, invariant 13 and the trend's accessible name.
4. **RESOLVED — §11 now records the hover/tooltip layer and the streak strip as PR 3 or never, no row.** Neither is built here; chart marks are not tap targets.
5. `niceMax` continues the 1/2/5 ladder past 20,000 — `build.mjs`'s fallback capped the STEP at 20,000, which makes a 2,000,000 m season 100 gridlines.
6. `PAD_L` is 44 on both metres charts, not A3's 36/40: measured clipping of six-glyph ticks on the first capture.
7. The season's `<n> TODAY` is ONE label beside the end dot, flipping to the left of the dot past 60 % of the width so April never overflows; the board draws `TODAY` above the line and the number beside the dot.
8. The trend's x domain runs from the first of the earliest test's month to the end of the latest's, labels every `ceil(months / 6)`-th month (the board hardcoded Nov 2025 … Sep 2026); its y domain is `domainFromReadings(splits, { minHeight: 10 })`, which yields the board's `[112, 126]` exactly — no new rule; one point gets ±5 s.
9. While CUSTOM's pair is unusable the range line names the range still APPLIED (the same one the totals show); ruling 21's "the inputs' values" describes the valid case.
10. **RESOLVED in §8.5:** fixture (b) does not move under Sunday start either (measured); the spec now names the pins that do — the weekly series, the `mondayOf` pin and the three `streakOf` pins — and says (b) gates the transposition.
11. `DELETE /api/logs/:id` answers 200 with a body, not 204 — a PLAN error (the first draft of `seedGate0Tests` checked for 204); the spec never claimed 204 (`grep -n 204` over it → nothing), so there was nothing to fix there.
12. A CUSTOM range with no rows still renders SEASON and TEST TREND under the `NO ROWS BETWEEN` line — they never filter (invariant 19; A5's note).
13. §8.5 still says the e2e asserts `7 OF 9` after the delete; ruling 19 struck that line and PR 1's e2e already does not — left as it stands (a stale figure in a PR 1 sentence, one read settles it).
14. **Copy for James at the PR:** `NOTHING IN THESE EIGHT WEEKS` (harden lens 1's untested case — two or more rows in range, none in the window) beside `OUT OF RANGE`, `Couldn't load your tests.` and `FASTER IS UP`.
15. `seed.mjs`'s `streaks()` computed LONGEST over all history, against ruling 22; season-scoped in Task 9 with `compute.mjs` proving nothing on the boards moves.

## Paste-test record (RF: plan authoring)

Every block above was written to its REAL path in this worktree at `5c5099cb` (the harden lens-1 folds at `4df5d610`), gated, mutated and then removed (nothing committed; the tested sources are mirrored under the session scratchpad `pr2-src/app/`, the two captures under `pr2-captures/`). Commands and results:

- `pnpm exec tsc -p tsconfig.app.json --noEmit` → 0 (a first draft's `Body` missed the `tests` prop — TS2552, fixed); `pnpm typecheck` (all five configs + census 24/24) → 0; `pnpm lint` → clean (a first draft of the label test wrote `\b` as a control character through a heredoc — `no-control-regex`; write the regex as `/JUL 0\b/` in the file); `pnpm format:check` → clean.
- `vitest --project unit domain/stats` → 7 files / 58 tests; `--project client src/you/stats src/api src/charts` → 22 files / 196 tests (+ `src/You.test.tsx`, 14, green); whole `pnpm test --project unit --project client` → 314 files, 8300 passed, 1 skipped.
- Mutations run and restored, each red on the named test: domain m1 Sunday start (7 failed — the received series `[2000, 0, 10000, 0, 0, 8000, 8000, 2000]`), m2 transposition (4), m3 fallback (2), m4a/m4b exclusive ends (4 each), m5 divisor (3), the ruling-22 keys-from-every-row (1), the key clamp against the straddle pin (1), m6 `<=` out-of-range (2), m7 `earliestDate` (1), m8 anchor-keyed current (1); client c1 range line (2), c2 every bar labelled (1), the raw-values aria-label (1: `Received: "Metres per week, eight weeks: 0, 0, 0, 0, 0, 13,000, 3,000, 2,000"`), the dropped all-zero branch (1), c3 filtered season (1), c4 chevron focusable (2), c6 6k class (1), c7 faster is down (1), c8 one-row season copy (1), the adapter's date-ignored (2); e2e: no backdate → red at the T1 read-back. Not run: PR 1's getters→UTC against the new tz file (same function, same shape), the two CSS mutations named in `design.spec.ts` — run at implementation.
- `pnpm e2e e2e/stats.spec.ts` → 1 passed (re-run after the `backdateRow` refactor: 1 passed); `design.spec.ts -g "/you/stats|^you screen$"` → 5 passed (after `.first()` on `.stats-card`); `pnpm screenshots -g " you$| you-stats$"` → 2 passed; `you.png` hairline rows `[120, 259]` = 140 px; both PNGs opened and read (the second `you-stats` capture after the gutter fix reads `15,000 · 10,000 · 5,000 · 0` and `60,000 · 40,000 · 20,000 · 0`). The stack is left up (`E2E_KEEP` default).
