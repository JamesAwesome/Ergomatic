# Phase PS PR 1 — career stats: domain, route, hero, /you/stats — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A rower sees LIFETIME and SEASON work metres over one time-by-type bar on You (the hero is the door) and a `/you/stats` subpage with a date filter, TOTALS in two columns and TIME BY TYPE — every figure the sum of what the log's detail hero shows per row, computed by one domain function `buildHeroes` now calls.

**Architecture:** `app/domain/stats/` holds the tier rule (`rowContribution`), pure `{y,m,d}` calendar arithmetic, and the aggregates; `GET /api/stats/rows` (own route file) projects each row through `rowContribution` so `steps` never crosses the wire; the client adapter `useStatsRows` is the ONE instant→date conversion; `YouStatsHero` and `StatsScreen` compute through the domain and render. Nothing new is stored.

**Tech Stack:** TypeScript ~6.0, React 19, Express 5, Drizzle, Vitest (unit/client/integration), Playwright, `pg` (already a dependency) for the e2e backdate.

**Spec:** `docs/superpowers/specs/2026-09-12-career-stats-design.md` (§9 PR 1 scope, §14 rulings, §8 gates, §5 copy, §3.1 tier rule). Read it whole; the plan argues from it.

**Worktree:** `/Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/ps-pr1` (branch `phase-ps-pr1`, base `c5cfab24`). All commands run in `<worktree>/app` with `export PATH="$HOME/.local/share/nvm/v26.5.0/bin:$PATH"`. Scoped test runs: `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project <p> <file>`; whole projects: `pnpm test --project unit|client`. `git rev-parse --show-toplevel` before every commit.

## Global Constraints (from the spec, verbatim where quoted)

- TRIAD (a number's meaning): `/harden` on this plan, DBA gate (Task 10), PM final-PR gate. No fast path.
- "Every field is REQUIRED with `null` for absent (RF33)" on `StatsRowInput`; `buildHeroes` maps `endedBy: row.endedBy ?? null`.
- Domain: "No `Date.now()`, no `Intl`, no `new Date(...)`" — dates are `{ y, m, d }` triples.
- Stack order `AN · AT · O2 · TR · NO TYPE`; NO TYPE drawn in `--ink-4`; "a bucket with 0 s has no segment and no legend row" (invariant 17).
- MACHINE = `source === "pm5"` by door; AVG WATTS excludes `stored`-tier rows (ruling 6); calories = Σ stored `totalCalories`.
- Copy is §5's, byte for byte (see Task 7); "PM5" never appears in copy (RF32); no em-dashes in copy.
- No Concept2 identifier in `app/domain/stats`, `src/you/stats`, `src/api/useStatsRows.ts` — INCLUDING COMMENTS (the §8.4 scan is over file text).
- Hit targets ≥ 44 px; inputs 16 px; CSS custom properties only, 2 px radii, no shadows.
- The Gate 0 seed (`docs/design/career-stats/seed.mjs`) is the reference fixture; figures are `compute.mjs`'s; the clock is pinned to 2026-09-12.
- Commit after every task; never `--no-verify`; scoped gates per `.claude/agent-briefing.md`.

## File map

| File | Responsibility |
| --- | --- |
| `domain/logbook.ts` (new) | `logbookWatts`, `logbookCalPerHour` moved verbatim; `src/session/logbookDerived.ts` re-exports |
| `domain/stats/rowContribution.ts` (new) | `StatsRowInput`, `StatsRowSource`, `RowContribution` (discriminated by tier), `rowContribution`, `isReconstructableClose`, `stepActualSums`, `stepActuals`, `statsRowInput` — the ONE input builder both producers call |
| `domain/stats/calendar.ts` (new) | `CalendarDate`, day-number arithmetic, `seasonOf`, `presetRange`, `customRange`, `inRange` |
| `domain/stats/statsRow.ts` (new) | `StatsRow` (the wire shape, declared ONCE for route and hook), `DatedStatsRow` |
| `domain/stats/aggregate.ts` (new) | `summarize` (ALL + MACHINE totals, seam count), `timeByType` |
| `domain/stats/gate0Seed.ts` (new) | the seed transcribed as `DatedStatsRow[]`, held equal to `seed.mjs` by test |
| `src/log/storedSummary.ts` (modify) | `toStatsRowInput` (maps `endedBy ?? null` and `machineSummary?.totalCalories`, then calls the domain's `statsRowInput`) + `buildHeroes` calls `rowContribution`; local `isReconstructableClose` deleted |
| `src/log/heroesContract.fixtures.ts`, `src/log/fixtures/heroesCapture.json`, `scripts/capture-heroes.ts` (new) | §8.1 contract |
| `server/stores/logs.ts` (modify), `server/testing/fakes.ts`, `server/stores/contracts/storeContracts.ts` | `STATS_ROW_COLUMNS` + `statsRows()` + fake + contract case |
| `server/routes/stats.ts` (new), `server/app.ts` (modify) | `GET /api/stats/rows` |
| `src/api/useStatsRows.ts` (new) | fetch per mount; `toCalendarDate` — the one conversion |
| `src/charts/stackedBar.ts` (new) | pure segment layout |
| `src/you/stats/{format,StackedBar,TypeLegend,YouStatsHero,StatsFilterBar,TotalsGroup,TimeByTypeGroup,StatsScreen}.tsx` (new) | the surface |
| `src/You.tsx`, `src/shell/AppRoutes.tsx`, `src/index.css` (modify) | hero mount, `/you/stats`, styles |
| `src/test/gate0LogBodies.ts` (new) | the seed as `POST /api/logs` bodies (e2e + screenshots) |
| `e2e/helpers.ts` (+`backdateLog`), `e2e/stats.spec.ts`, `e2e/design.spec.ts`, `e2e/screenshots.spec.ts`, `e2e/tsconfig.json` | browser gates |
| `eslint.config.js` (modify) | `domain/** → src/**` forbidden, ONE file exempt by name |
| `docs/superpowers/research/2026-09-12-stats-rows/` (new) | DBA protocol scripts |

## LIFETIME TABLE (RF27) — every piece of client state

| State | Minted | Cleared | Survives |
| --- | --- | --- | --- |
| `useStatsRows` state (rows, today) | on mount, per fetch | unmount (`cancelled` flag drops a late response) | nothing: a remount refetches; no localStorage |
| `StatsScreen.preset` (`"all"`) | mount | unmount | nothing |
| `StatsScreen.custom` (`{from,to}` strings) | `null` at mount; minted by `handleCustom` on the first edit of either date input — until then the inputs show `today−29..today` computed in render, never stored | unmount | nothing |
| `StatsScreen.applied` (last VALID custom range) | in the change handler only, never during render | unmount | nothing — while FROM > TO the previous value stays |
| Roving-tabindex focus (`chipRefs`) | render | unmount | nothing |
| Pinned clock in tests | `vi.setSystemTime(new Date(2026, 8, 12, 9))` in `beforeEach`; Playwright `page.clock.install({ time })` per test | `vi.useRealTimers()` in `afterEach`; per-test browser context | nothing |
| `process.env.TZ` in `useStatsRows.tz.test.ts` | the file's first statement — which runs AFTER its ESM-hoisted imports and before any `Date` is constructed; it works because Node reads `TZ` at each `Date` call, not at start-up (measured: changing the assignment from `America/New_York` to `Pacific/Kiritimati` moved `getTimezoneOffset()` from 240 to −840 with the imports untouched) | the worker process ends | nothing (its own file, own worker) |

Invariants, not mechanisms: one fetch per mount; no cache outlives the screen; the hero is exactly one focusable control named `Stats`; a deleted row is absent on the next mount.

---

### Task 1: Move the logbook formulas into the domain and forbid `domain → src`

**Files:** Create `domain/logbook.ts`; modify `src/session/logbookDerived.ts`, `eslint.config.js`. Test: existing `src/session/logbookDerived.test.ts` (unedited, the gate).

- [ ] **Step 1: Failing check first.** Add to `eslint.config.js`, before `prettierConfig,`:

```js
  {
    // Phase PS PR 1 (career-stats spec §4.1): app/domain/** is pure Erg Book
    // logic and may never import src/**. ONE file is exempt, by name:
    // domain/monitor/nfc.test.ts reads its fixture from src/monitor/nfc/
    // (the rule is red on main without this line — measured), and moving
    // that fixture is a ROADMAP row, not this PR's. Every other domain
    // test is under the rule.
    files: ["domain/**/*.ts"],
    ignores: ["domain/monitor/nfc.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../src/*", "../../src/*", "**/src/*", "@/*"],
              message:
                "app/domain/** is pure: it never imports src/**. Move the formula into domain/ and re-export it from src/ (career-stats spec §4.1).",
            },
          ],
        },
      ],
    },
  },
```

- [ ] **Step 2: Prove it bites (the spec's mutation).** Append `import { isNative } from "../../src/platform";\nexport const probe = isNative;` to `domain/stats/calendar.ts` (or any domain file), run `pnpm exec eslint domain`. Expected (measured): `error '../../src/platform' import is restricted from being used by a pattern. app/domain/** is pure …  no-restricted-imports` — `✖ 1 problem`. Revert; `pnpm exec eslint domain` exits 0 (measured with the single-file exemption: `grep -rn 'from "[./]*/src/' domain --include='*.ts'` returns only `nfc.test.ts`, so nothing else needs it). Paste the red output into the PR body.
- [ ] **Step 3: Create `domain/logbook.ts`** — the two functions cut verbatim from `src/session/logbookDerived.ts` (`logbookWatts`: `if (!(seconds > 0) || !(meters > 0)) return undefined; return Math.round(2.8 / (seconds / meters) ** 3);` and `logbookCalPerHour`: `if (!(seconds > 0)) return undefined; return Math.floor((calories * 3600) / seconds);`) with the Phase LP header comment moved with them.
- [ ] **Step 4: Re-export.** In `logbookDerived.ts` replace the two function bodies with `export { logbookCalPerHour, logbookWatts } from "../../domain/logbook.js";` (keep `sessionStrokeRate`).
- [ ] **Step 5: Gate.** `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/session/logbookDerived.test.ts src/log/storedSummary.test.ts` → PASS (measured: 3 files, 344 tests green with Task 2 applied too). `pnpm typecheck && pnpm lint` green.
- [ ] **Step 6: Commit** `feat(domain): move logbook formulas into domain; forbid domain→src imports`.

### Task 2: `rowContribution` and the `buildHeroes` refactor (invariant 2)

**Files:** Create `domain/stats/rowContribution.ts`, `domain/stats/rowContribution.test.ts`, `src/log/heroesContract.fixtures.ts`, `scripts/capture-heroes.ts`, `src/log/fixtures/heroesCapture.json`, `src/log/heroesContract.test.ts`; modify `src/log/storedSummary.ts`.

**Produces:** `rowContribution(row: StatsRowInput): RowContribution`; `toStatsRowInput(row: StoredLog): StatsRowInput` (exported from `storedSummary.ts`).

- [ ] **Step 1: Fixtures + capture BEFORE the refactor.** Create `src/log/heroesContract.fixtures.ts` exporting `HEROES_CONTRACT_FIXTURES: readonly { id: string; row: StoredLog }[]` — a local `baseRow()` (the `storedSummary.test.ts` base, title `"Sea Fret"` type `"O2"`, every nullable null, `source: "manual"`, `steps: []`) and the exit-7 steps (`250 m/67.9 s` and `250 m/56.1 s`, `actualSource: "pm5"`), then six rows: `tier-A-terminated-null-rest-pair` (endedBy `rower`, one step, machine `97.9 s/300 m`, `avgPaceSecondsPer500m: 163.2`, fused `97.9/300`), `tier-A-build-738` (both steps, machine `124/500`, `machineSummary: { verificationBytes: [1,2,3] }`), `tier-B1-free-row-empty-steps` (`workoutType: null`, endedBy `rower`, `steps: []`, work pair `800.5/3012`), `tier-B2-declined-link-lost` (endedBy `link-lost`, both steps, stored `150/560`), `fallback-fused-pre-rc5` (`steps: [{ label: "6k" }]`, stored `1592/6240`), TWO rows that LAND on the steps tier — `tier-B2-steps-manual-finished` (the base row as it is: `source: "manual"`, no machine totals, no work pair, endedBy `finished`, one step `{ label: "6k", actualMeters: 6000, actualSeconds: 1550 }`) and `tier-B2-steps-meters-only` (`storedSummary.test.ts`'s "actualMeters but no actualSeconds" case: pm5, endedBy `finished`, machine null, one step `{ label: "distance only", actualSource: "pm5", actualMeters: 500 }`) — and the NEW `work-pair-beats-disagreeing-steps` (endedBy `finished`, both steps Σ 500 m, work pair `150/560`, rest `120/242`). Create `scripts/capture-heroes.ts`:

```ts
import { HEROES_CONTRACT_FIXTURES } from "../src/log/heroesContract.fixtures";
import { buildStoredSummary } from "../src/log/storedSummary";
const out = HEROES_CONTRACT_FIXTURES.map(({ id, row }) => {
  const { distanceMeters, timeSeconds } = buildStoredSummary(row).heroes;
  return { id, distanceMeters: distanceMeters ?? null, timeSeconds: timeSeconds ?? null };
});
process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
```

Run `pnpm exec tsx scripts/capture-heroes.ts > src/log/fixtures/heroesCapture.json` ON THIS PRE-REFACTOR TREE. Expected content (measured at `c5cfab24`, storedSummary.ts unmodified): `300/97.9`, `500/124`, `3012/800.5`, `560/150`, `6240/1592`, `6000/1550`, `500/null`, `560/150` in fixture order — the steps tier is the only one that can print a metres figure beside a `null` seconds, and now the capture holds one. Commit these three files: `test(log): capture buildHeroes output before the rowContribution refactor`.

- [ ] **Step 2: Failing domain test.** `domain/stats/rowContribution.test.ts` — an `input()` helper (all null, `steps: []`, `totalCalories: undefined`) and the exit-7 pair; cases: machine totals win over pair and steps with `Math.round(300.4) → 300`; a `0` machine total is not machine; the pair beats disagreeing Σ steps (`workMeters 560.4 → 560`); steps tier only for `finished`/`null`, seconds `null` when no step carries them; `it.each(["rower","link-lost","program-failed","program-dropped","interrupted","a-value-this-build-never-saw"])` declines to `stored` `742/244`; an all-null row is `stored` with nulls; rest verbatim, calories integer only (`37.5` and `"372"` → null); `stepActualSums([]) → { meters: null, seconds: null }`; `stepActuals` over hostile input — `null` and `"[]"` → `[]`, and `[{ actualMeters: 250, actualSeconds: 67.9 }, { actualMeters: "250" }, 7, null]` → the first pair then three `{ null, null }`. Run → FAIL `Cannot find module './rowContribution.js'`.
- [ ] **Step 3: Implement `domain/stats/rowContribution.ts`:**

```ts
export interface StatsStepInput { actualMeters: number | null; actualSeconds: number | null; }
export interface StatsRowInput {
  endedBy: string | null; // an ALLOWLIST below, so an unknown value declines (fails closed)
  machineWorkSeconds: number | null; machineWorkMeters: number | null;
  workSeconds: number | null; workMeters: number | null;
  distanceMeters: number | null; timeSeconds: number | null;
  restSeconds: number | null; restMeters: number | null;
  steps: readonly StatsStepInput[];
  totalCalories: unknown; // the blob is untyped on both sides; integer check is hardening
}
export type StatsTier = "machine" | "work-pair" | "steps" | "stored";
// The field set BOTH producers already hold (the client's StoredLog, the server's statsRows() row)
// before either maps anything of its own. The client maps `endedBy ?? null` and `machineSummary?.totalCalories`
// BEFORE calling; the server's enum column is already `T | null`. `steps` is unknown: jsonb on the server.
export interface StatsRowSource {
  endedBy: string | null;
  machineWorkSeconds: number | null; machineWorkMeters: number | null;
  workSeconds: number | null; workMeters: number | null;
  distanceMeters: number | null; timeSeconds: number | null;
  restSeconds: number | null; restMeters: number | null;
  steps: unknown; totalCalories: unknown;
}
export function stepActuals(steps: unknown): StatsStepInput[] { // ONE reader of `steps` for both producers (RF24)
  if (!Array.isArray(steps)) return [];
  return steps.map((s: unknown) => {
    const step = (typeof s === "object" && s !== null ? s : {}) as Record<string, unknown>;
    return { actualMeters: typeof step.actualMeters === "number" ? step.actualMeters : null,
      actualSeconds: typeof step.actualSeconds === "number" ? step.actualSeconds : null };
  });
}
export function statsRowInput(row: StatsRowSource): StatsRowInput { // the ONE input builder
  return { endedBy: row.endedBy, machineWorkSeconds: row.machineWorkSeconds, machineWorkMeters: row.machineWorkMeters,
    workSeconds: row.workSeconds, workMeters: row.workMeters, distanceMeters: row.distanceMeters, timeSeconds: row.timeSeconds,
    restSeconds: row.restSeconds, restMeters: row.restMeters, steps: stepActuals(row.steps), totalCalories: row.totalCalories };
}
interface RestAndCalories { restMeters: number | null; restSeconds: number | null; calories: number | null; }
export type RowContribution = RestAndCalories & (
  | { tier: "machine"; workMeters: number; workSeconds: number }
  | { tier: "work-pair"; workMeters: number; workSeconds: number }
  | { tier: "steps"; workMeters: number; workSeconds: number | null }
  | { tier: "stored"; workMeters: number | null; workSeconds: number | null });
export function isReconstructableClose(endedBy: string | null): boolean {
  return endedBy === "finished" || endedBy === null;
}
export function stepActualSums(steps: readonly StatsStepInput[]): { meters: number | null; seconds: number | null } {
  let meters: number | null = null; let seconds: number | null = null;
  for (const step of steps) {
    if (step.actualMeters !== null) meters = (meters ?? 0) + step.actualMeters;
    if (step.actualSeconds !== null) seconds = (seconds ?? 0) + step.actualSeconds;
  }
  return { meters, seconds };
}
export function rowContribution(row: StatsRowInput): RowContribution {
  const rest: RestAndCalories = { restMeters: row.restMeters, restSeconds: row.restSeconds,
    calories: Number.isInteger(row.totalCalories) ? (row.totalCalories as number) : null };
  if (row.machineWorkSeconds !== null && row.machineWorkMeters !== null && row.machineWorkSeconds > 0 && row.machineWorkMeters > 0)
    return { ...rest, tier: "machine", workMeters: Math.round(row.machineWorkMeters), workSeconds: row.machineWorkSeconds };
  if (row.workSeconds !== null && row.workMeters !== null && row.workSeconds > 0 && row.workMeters > 0)
    return { ...rest, tier: "work-pair", workMeters: Math.round(row.workMeters), workSeconds: row.workSeconds };
  const sums = stepActualSums(row.steps);
  if (sums.meters !== null && isReconstructableClose(row.endedBy))
    return { ...rest, tier: "steps", workMeters: sums.meters, workSeconds: sums.seconds };
  return { ...rest, tier: "stored", workMeters: row.distanceMeters, workSeconds: row.timeSeconds };
}
```

- [ ] **Step 4:** run the domain test → PASS (measured 14/14).
- [ ] **Step 5: Failing contract test** `src/log/heroesContract.test.ts`: import `captured from "./fixtures/heroesCapture.json"`, build `CAPTURED = new Map(id → {distanceMeters,timeSeconds})`; (a) capture ids equal fixture ids; (b) `it.each(fixtures)` `buildStoredSummary(row).heroes` `{distanceMeters ?? null, timeSeconds ?? null}` strict-equals the capture; (c) `it.each(fixtures)` `rowContribution(toStatsRowInput(row))` `{ id, distanceMeters: c.workMeters, timeSeconds: c.workSeconds }` strict-equals `{ id, …captured }`. Run → FAIL `toStatsRowInput is not exported`. (17 cases once green: 1 + 8 + 8.)
- [ ] **Step 6: Refactor `storedSummary.ts`.** Add `import { rowContribution, statsRowInput, type StatsRowInput } from "../../domain/stats/rowContribution.js";`. Delete the local `isReconstructableClose` (its only call is inside `buildHeroes`; leave the comments that cite it, they describe the rule). Add the client's mapping — ONLY the two fields whose shape differs from the server's; every other field and the steps go through the domain builder, the same call the route makes:

```ts
export function toStatsRowInput(row: StoredLog): StatsRowInput {
  return statsRowInput({
    ...row, // StoredLog carries every StatsRowSource field; the spread's extra keys are not excess-checked
    endedBy: row.endedBy ?? null, // optional-and-nullable → required-with-null (TS2322 without it)
    totalCalories: row.machineSummary?.totalCalories,
  });
}
```

Rewrite `buildHeroes`'s FOUR gates as `const c = rowContribution(toStatsRowInput(row)); const stepSums = stepActualSums(row.steps);` then `if (c.tier === "machine") { const distanceMeters = c.workMeters; const timeSeconds = c.workSeconds; …unchanged body (avgSplit from machineSummary, totalLine with `{}`, storedMachineTier)… }`, `if (c.tier === "work-pair") { …distanceMeters = c.workMeters; timeSeconds = c.workSeconds; avgSplitSeconds = tierBAvgSplitSeconds(row.steps) ?? row.avgSplitSeconds ?? undefined; totalLine `{}`… }`, `if (c.tier === "steps") { const timeSeconds = c.workSeconds ?? undefined; … distanceMeters: c.workMeters, totalLine: buildStoredTotalLine(row, timeSeconds, stepSums) }`, and the FALLBACK with `const timeSeconds = c.workSeconds ?? undefined; … distanceMeters: c.workMeters ?? undefined, totalLine `{}``. Keep the local `stepActualSums` (the B2 TOTAL line still needs it). Every EXPRESSION in each branch stays as it was — the contract test is what proves that; what does change besides the four gates is the prose: the four comment blocks that argued each gate (tier A's `hasMachineTotals` note, the C1 empty-`stepSums` block, the TIER B1 fallback block and the TIER B2 block) shorten to a pointer at `rowContribution`, since the rule they explained now lives there with its own doc comment (measured: 53 insertions / 86 deletions on the file, all four deletions comment text plus the deleted `isReconstructableClose` and the four gate expressions).
- [ ] **Step 7: Gates.** `… vitest run --project client src/log/heroesContract.test.ts src/log/storedSummary.test.ts src/log/FromTheLog.test.tsx src/session/logbookDerived.test.ts` → PASS (measured: contract 17/17; the other three 344/344). `pnpm exec tsc -p tsconfig.app.json --noEmit` clean (the antagonist's TS2322 is what `?? null` prevents — delete the `?? null` once to see `Type 'undefined' is not assignable to type 'string | null'`, then restore).
- [ ] **Step 8: Two mutations (spec §8.1 (4)).** (a) In `rowContribution`, move the `stepActualSums`/steps gate ABOVE the work-pair gate; run the contract test. Expected (measured): `× work-pair-beats-disagreeing-steps: rowContribution's workMeters/workSeconds equal the captured hero` and the same id's `buildHeroes` case — `expected { distanceMeters: 500, …} to strictly equal { distanceMeters: 560, …}` with `"id": "work-pair-beats-disagreeing-steps"` in the diff. Restore; green. (b) The step-key mapping (RF33): in `stepActuals` read `step.actualMetres` in place of `step.actualMeters` — it compiles, because `step` is `Record<string, unknown>`, and every step's metres become `null`; run the contract test. Expected (measured): FOUR cases red, the two steps-tier fixtures on BOTH halves — `× tier-B2-steps-manual-finished: the refactored buildHeroes still prints the captured metres and seconds` with `expected { distanceMeters: null, timeSeconds: null } to strictly equal { distanceMeters: 6000, timeSeconds: 1550 }`, `× tier-B2-steps-meters-only: …` with `{ distanceMeters: null, timeSeconds: null }` against `{ distanceMeters: 500, timeSeconds: null }`, and the same two ids' `rowContribution's workMeters/workSeconds equal the captured hero` cases. Restore; 17/17. Record all lines in the PR body. (Renaming the FIELD on `StatsStepInput` instead fails `tsc` in `stepActuals` — required-with-null is what makes the compiler the first gate; this mutation is the one the compiler cannot see.)
- [ ] **Step 9: Commit** `feat(stats): rowContribution tier rule; buildHeroes computes its tier through it`.

### Task 3: Calendar, aggregates, and the Gate 0 seed in the domain

**Files:** Create `domain/stats/calendar.ts` + `.test.ts`, `domain/stats/statsRow.ts`, `domain/stats/aggregate.ts` + `.test.ts`, `domain/stats/gate0Seed.ts` + `.test.ts`.

**Produces:** `CalendarDate`, `DateRange`, `Preset`, `PRESETS`, `presetRange`, `customRange`, `seasonOf`, `addDays`, `inRange`, `compareDates`; `StatsRow`, `StatsRowsResponse`, `DatedStatsRow`; `summarize(rows, range): StatsSummary`, `timeByType(rows, range): TypeBucket[]`, `rowsInRange`, `TYPE_BUCKET_ORDER`; `GATE0_ROWS`, `GATE0_TODAY`, `parseSeedDate`.

- [ ] **Step 1: Failing calendar test** (`calendar.test.ts`; every pin an independent `{y,m,d}` literal): `toDayNumber({1970,1,1}) === 0`; round-trip `2024-02-29`; `addDays(2024-02-28, 1) → 02-29`, `addDays(2100-02-28, 1) → 03-01`, `addDays(2026-09-12, -29) → 2026-08-14`; `seasonOf(2026-04-30) → { start 2025-05-01, end 2026-04-30, name 2026 }`, `seasonOf(2026-05-01).name === 2027` and `.start` `2026-05-01`; `inRange` inclusive both ends (`08-14` and `09-12` in, `08-13` and `09-13` out), null unbounded; presets for today `2026-09-12`: all `{null,null}`, season from `2026-05-01`, year from `01-01`, month from `09-01`, 30d from `08-14`, each `to: today`; `customRange(d,d)` is a range, `customRange(09-13, 09-12)` null. Run → FAIL (module missing).
- [ ] **Step 2: Implement `calendar.ts`** — Hinnant's civil↔days (pure integers):

```ts
export interface CalendarDate { y: number; m: number; d: number }
export function toDayNumber({ y, m, d }: CalendarDate): number {
  const yy = m <= 2 ? y - 1 : y; const era = Math.floor(yy / 400); const yoe = yy - era * 400;
  const mp = (m + 9) % 12; const doy = Math.floor((153 * mp + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
export function fromDayNumber(days: number): CalendarDate {
  const z = days + 719468; const era = Math.floor(z / 146097); const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153); const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
}
export function addDays(date: CalendarDate, n: number): CalendarDate { return fromDayNumber(toDayNumber(date) + n); }
export function compareDates(a: CalendarDate, b: CalendarDate): number { return toDayNumber(a) - toDayNumber(b); }
export interface DateRange { from: CalendarDate | null; to: CalendarDate | null }
export function inRange(date: CalendarDate, range: DateRange): boolean {
  return (range.from === null || compareDates(date, range.from) >= 0) && (range.to === null || compareDates(date, range.to) <= 0);
}
export interface Season { start: CalendarDate; end: CalendarDate; name: number }
export function seasonOf(date: CalendarDate): Season {
  const startYear = date.m >= 5 ? date.y : date.y - 1;
  return { start: { y: startYear, m: 5, d: 1 }, end: { y: startYear + 1, m: 4, d: 30 }, name: startYear + 1 };
}
export const PRESETS = ["all", "season", "year", "month", "30d", "custom"] as const;
export type Preset = (typeof PRESETS)[number];
export function presetRange(preset: Exclude<Preset, "custom">, today: CalendarDate): DateRange {
  switch (preset) {
    case "all": return { from: null, to: null };
    case "season": return { from: seasonOf(today).start, to: today };
    case "year": return { from: { y: today.y, m: 1, d: 1 }, to: today };
    case "month": return { from: { y: today.y, m: today.m, d: 1 }, to: today };
    case "30d": return { from: addDays(today, -29), to: today };
  }
}
export function customRange(from: CalendarDate, to: CalendarDate): DateRange | null {
  return compareDates(from, to) > 0 ? null : { from, to };
}
```

- [ ] **Step 3: `statsRow.ts`** (the wire shape, ONE declaration — Deviation 1):

```ts
import type { LogSource, WorkoutType } from "../types.js";
import type { StatsTier } from "./rowContribution.js";
import type { CalendarDate } from "./calendar.js";
export interface StatsRow { id: string; loggedAt: string; source: LogSource; workoutType: WorkoutType | null; tier: StatsTier;
  workMeters: number | null; workSeconds: number | null; restMeters: number | null; restSeconds: number | null; calories: number | null; }
export interface StatsRowsResponse { rows: StatsRow[] }
export type DatedStatsRow = StatsRow & { date: CalendarDate };
```

- [ ] **Step 4: `gate0Seed.ts`** — a `SEED` tuple table transcribed from `seed.mjs` (13 rows: `["R1","2025-11-08","pm5","stored","O2",6240,1592.0,null,null]` … `["R13","2026-09-11","pm5","machine","TR",2000,455.8,0,121]`, `// prettier-ignore`), `GATE0_TODAY = { y: 2026, m: 9, d: 12 }`, `parseSeedDate("YYYY-MM-DD")`, and `GATE0_ROWS: readonly DatedStatsRow[]` mapping each tuple to `{ id, loggedAt: \`${date}T12:00:00.000Z\`, date, source, workoutType, tier, workMeters, workSeconds, restMeters, restSeconds: null, calories }`. Its test `gate0Seed.test.ts` (unit project) loads the design source by URL — `const seed = (await import(/* @vite-ignore */ pathToFileURL(new URL("../../../docs/design/career-stats/seed.mjs", import.meta.url).pathname).href)) as SeedModule` — and asserts the 13 `{id,date,source,tier,type,workMeters,workSeconds,restMeters,calories}` triples and `today` strictly equal (measured green; the dynamic import works in the node env).
- [ ] **Step 5: Failing aggregate test** (`aggregate.test.ts`, every literal `compute.mjs`'s): ALL `meters 56752`, `seconds` `toBeCloseTo(14379.3, 6)` (float sums — `toStrictEqual` on the seconds fails, measured `14379.300000000001`), `sessions 13`, `storedTierRows 1`; MACHINE `{ meters 36752, sessions 10, ownTotals 8, restMeters 718, calories 1731, caloriesRows 8, avgWatts 176 }` with seconds `toBeCloseTo(9271.1, 6)`; presets SEASON `43012` (9 rows), 30d `18000`, MONTH `5000`; ruling 6: re-tag R1 as `machine` and `avgWatts` becomes `174` (measured — the fused row's seconds move it; NOT 152 as first head-computed); empty range → zeros and `avgWatts undefined`; a null-metres row still counts one session; `timeByType` ALL → `[["AN",822.6],["AT",3819.4],["O2",6244],["TR",1387.3],["NO TYPE",2106]]`, shares round to `[6,27,43,10,15]`, Σ seconds ≈ 14379.3; the three manual rows → keys `["AT","O2","TR"]`; empty range → `[]`.
- [ ] **Step 6: Implement `aggregate.ts`:**

```ts
import { logbookWatts } from "../logbook.js";
import { inRange, type DateRange } from "./calendar.js";
import type { DatedStatsRow } from "./statsRow.js";
export interface Totals { meters: number; seconds: number; sessions: number }
export interface MachineTotals extends Totals { ownTotals: number; restMeters: number; calories: number; caloriesRows: number; avgWatts: number | undefined }
export interface StatsSummary { all: Totals; machine: MachineTotals; storedTierRows: number }
export function rowsInRange(rows: readonly DatedStatsRow[], range: DateRange): DatedStatsRow[] { return rows.filter((r) => inRange(r.date, range)); }
function totals(rows: readonly DatedStatsRow[]): Totals {
  let meters = 0, seconds = 0;
  for (const r of rows) { meters += r.workMeters ?? 0; seconds += r.workSeconds ?? 0; }
  return { meters, seconds, sessions: rows.length };
}
export function summarize(rows: readonly DatedStatsRow[], range: DateRange): StatsSummary {
  const inR = rowsInRange(rows, range); const machine = inR.filter((r) => r.source === "pm5");
  let restMeters = 0, calories = 0, caloriesRows = 0, wattsSeconds = 0, wattsMeters = 0;
  for (const r of machine) {
    restMeters += r.restMeters ?? 0;
    if (r.calories !== null) { calories += r.calories; caloriesRows += 1; }
    if (r.tier !== "stored" && r.workSeconds !== null && r.workMeters !== null) { wattsSeconds += r.workSeconds; wattsMeters += r.workMeters; }
  }
  return { all: totals(inR), storedTierRows: inR.filter((r) => r.tier === "stored").length,
    machine: { ...totals(machine), ownTotals: machine.filter((r) => r.tier === "machine").length, restMeters, calories, caloriesRows, avgWatts: logbookWatts(wattsSeconds, wattsMeters) } };
}
export const TYPE_BUCKET_ORDER = ["AN", "AT", "O2", "TR", "NO TYPE"] as const;
export type TypeBucketKey = (typeof TYPE_BUCKET_ORDER)[number];
export interface TypeBucket { key: TypeBucketKey; seconds: number; share: number }
export function timeByType(rows: readonly DatedStatsRow[], range: DateRange): TypeBucket[] {
  const seconds: Record<TypeBucketKey, number> = { AN: 0, AT: 0, O2: 0, TR: 0, "NO TYPE": 0 }; let total = 0;
  for (const r of rowsInRange(rows, range)) { const s = r.workSeconds ?? 0; seconds[r.workoutType ?? "NO TYPE"] += s; total += s; }
  return TYPE_BUCKET_ORDER.filter((key) => seconds[key] > 0).map((key) => ({ key, seconds: seconds[key], share: total > 0 ? seconds[key] / total : 0 }));
}
```

- [ ] **Step 7: Gates + mutations.** `… vitest run --project unit domain/stats` → PASS (measured 4 files, 29 tests). Mutations (each restored after): (a) `compareDates(date, range.to) < 0` → `× a range is inclusive at both ends` (measured); (b) `TYPE_BUCKET_ORDER.filter(...).map` → `TYPE_BUCKET_ORDER.map` → `× the three manual rows … no AN and no NO TYPE bucket` and `× no rows in range: no buckets` (measured); (c) drop `r.tier !== "stored" &&` → the `avgWatts 176` case reads `174`. `pnpm exec eslint domain` clean; `app/domain/**` coverage stays 100% (`pnpm test:coverage`, read the per-file rows).
- [ ] **Step 8: Commit** `feat(stats): calendar, totals, time-by-type and the Gate 0 seed in the domain`.

### Task 4: `GET /api/stats/rows` — store projection, fake, contract case, route, seam test

**Files:** Modify `server/stores/logs.ts`, `server/testing/fakes.ts`, `server/stores/contracts/storeContracts.ts`, `server/app.ts`; create `server/routes/stats.ts`, `server/routes/stats.test.ts`, `server/routes/stats.integration.test.ts`.

**Produces:** `stores.logs.statsRows(userId)`; `createStatsRouter({ logs, requireUser })`; `toStatsRow(r): StatsRow`.

- [ ] **Step 1: Failing contract case** in `storeContracts.ts`'s `describe("logs")`, FIRST: `it("statsRows returns every row of THIS user only, steps whole, totalCalories as a number or null, and nothing of another user's")` — two users; `mine` creates `logInput({ steps: [{ label: "Work", actualMeters: 500, actualSeconds: 124 }], machineSummary: { totalCalories: 37 } })` and `logInput({ machineSummary: { totalCalories: "thirty-seven" } })`; `theirs` one row; `statsRows(mine)` ids sort-equal the two; the first row's `loggedAt` `toBeInstanceOf(Date)`, `totalCalories 37`, `steps` strict-equal the posted array; the second's `totalCalories` null; `Object.keys(row).sort()` equals the 15 projection keys sorted (`id, loggedAt, source, workoutType, endedBy, machineWorkSeconds, machineWorkMeters, workSeconds, workMeters, restSeconds, restMeters, distanceMeters, timeSeconds, steps, totalCalories`). `… vitest run --project unit server/stores/contracts/contracts.fake.test.ts` → FAIL `statsRows is not a function`.
- [ ] **Step 2: Store.** In `logs.ts` above `createLogsStore`:

```ts
export const STATS_ROW_COLUMNS = {
  id: sessionLogs.id, loggedAt: sessionLogs.loggedAt, source: sessionLogs.source, workoutType: sessionLogs.workoutType,
  endedBy: sessionLogs.endedBy, machineWorkSeconds: sessionLogs.machineWorkSeconds, machineWorkMeters: sessionLogs.machineWorkMeters,
  workSeconds: sessionLogs.workSeconds, workMeters: sessionLogs.workMeters, restSeconds: sessionLogs.restSeconds, restMeters: sessionLogs.restMeters,
  distanceMeters: sessionLogs.distanceMeters, timeSeconds: sessionLogs.timeSeconds, steps: sessionLogs.steps,
  totalCalories: sql<number | null>`case when jsonb_typeof(${sessionLogs.machineSummary}->'totalCalories') = 'number' then (${sessionLogs.machineSummary}->>'totalCalories')::double precision else null end`,
};
```

and inside the store, before `count`: `async statsRows(userId: string) { return db.select(STATS_ROW_COLUMNS).from(sessionLogs).where(eq(sessionLogs.userId, userId)); }` — NO `orderBy` (spec §4.3; comment why). **The `jsonb_typeof(...) = 'number'` guard is load-bearing, not tidiness:** `machine_summary` is untyped jsonb, and a single row whose `totalCalories` is a string makes the bare `::double precision` cast throw for the WHOLE query — one poisoned row 500s a rower's entire history (measured by the DBA pass: `poison.txt` in the protocol directory — `ERROR:  invalid input syntax for type double precision: "thirty-seven"` against the unguarded cast, and `guarded` reads null/37.5 for the same rows). Say so in the comment beside it. In `fakes.ts`'s `makeFakeLogsStore`, before `count`: `async statsRows(userId) { return (byUser.get(userId) ?? []).map((r) => { const cal = r.machineSummary?.totalCalories; return { id: r.id, loggedAt: r.loggedAt, source: r.source, workoutType: r.workoutType, endedBy: r.endedBy ?? null, machineWorkSeconds: r.machineWorkSeconds ?? null, machineWorkMeters: r.machineWorkMeters ?? null, workSeconds: r.workSeconds ?? null, workMeters: r.workMeters ?? null, restSeconds: r.restSeconds ?? null, restMeters: r.restMeters ?? null, distanceMeters: r.distanceMeters ?? null, timeSeconds: r.timeSeconds ?? null, steps: r.steps as unknown, totalCalories: typeof cal === "number" ? cal : null }; }); }`. Contract fake → PASS; `contracts.real.integration.test.ts` → PASS (Docker).
- [ ] **Step 3: Failing route test** `server/routes/stats.test.ts` (copy `data.test.ts`'s `fakeSessionStore`/`asA`/`asB`; `appFor()` mounts `createDataRouter` — so rows are seeded through the REAL `POST /api/logs` validator, RF24 — then `createStatsRouter({ logs: stores.logs, requireUser: guard })`): 401 without a session; only the caller's rows and `Object.keys(row).sort()` equals the ten §4.3 keys typed out as an INDEPENDENT literal; a machine-tier post (`machineWorkSeconds 124, machineWorkMeters 500, workSeconds 124, workMeters 500, restSeconds 120, restMeters 242, distanceMeters 620, timeSeconds 244, machineSummary { totalCalories: 37 }`, `source pm5`, `deviceName "PM5 432331249"`) reads back `{ tier: "machine", workMeters: 500, workSeconds: 124, restMeters: 242, restSeconds: 120, calories: 37, workoutType: "O2" }` and `new Date(row.loggedAt).toISOString() === row.loggedAt`; a free row (`workoutType: null, steps: []`) reads `{ workoutType: null, tier: "stored", workMeters: null, calories: null }`; and THE SEAM (RF24) — `it.each` over four bodies (the machine-tier body above; `steps` tier metres-only, pm5 `finished` with `[{ label: "distance only", actualSource: "pm5", actualMeters: 500 }]`; `steps` tier hand-logged, `finished` with `[{ label: "6k", actualMeters: 6000, actualSeconds: 1550 }]`; `stored` with declined steps, pm5 `link-lost`, `560/150`): POST it, `GET /api/logs/:id` → `rowContribution(toStatsRowInput(body as StoredLog))` (the CLIENT's path, imported from `../../src/log/storedSummary.js` — loads under the node project, measured), `GET /api/stats/rows` → the row with that id (the SERVER's path); the six figures `{ tier, workMeters, workSeconds, restMeters, restSeconds, calories }` strict-equal, and `client.workMeters` is not null (two paths agreeing on nothing is not agreement). This is the one test that starts upstream of BOTH producers. → FAIL (module missing).
- [ ] **Step 4: Route `server/routes/stats.ts`:**

```ts
import { Router, type RequestHandler } from "express";
import { rowContribution, statsRowInput } from "../../domain/stats/rowContribution.js";
import type { StatsRow, StatsRowsResponse } from "../../domain/stats/statsRow.js";
import { isWorkoutType } from "../../domain/types.js";
import type { LogsStore } from "../stores/logs.js";
type StoredStatsRow = Awaited<ReturnType<LogsStore["statsRows"]>>[number];
export function toStatsRow(r: StoredStatsRow): StatsRow {
  // The store row IS a StatsRowSource (enum column → T | null, jsonb steps → unknown): the same builder buildHeroes calls.
  const c = rowContribution(statsRowInput(r));
  return { id: r.id, loggedAt: r.loggedAt.toISOString(), source: r.source,
    workoutType: isWorkoutType(r.workoutType) ? r.workoutType : null, // text column; non-members are NO TYPE
    tier: c.tier, workMeters: c.workMeters, workSeconds: c.workSeconds, restMeters: c.restMeters, restSeconds: c.restSeconds, calories: c.calories };
}
export function createStatsRouter({ logs, requireUser }: { logs: LogsStore; requireUser: RequestHandler }) {
  const router = Router();
  router.use("/api/stats", requireUser);
  router.get("/api/stats/rows", async (req, res) => {
    const rows = await logs.statsRows(req.user!.id);
    const body: StatsRowsResponse = { rows: rows.map(toStatsRow) };
    res.json(body);
  });
  return router;
}
```

Mount in `app.ts` inside `if (deps.stores) { … app.use(createStatsRouter({ logs: deps.stores.logs, requireUser: requireUser(deps.sessions) })); }` (import at top). Route test → PASS (measured 8/8; `data.test.ts` + contracts fake still green).
- [ ] **Step 5: The seam test (§8.2)** `server/routes/stats.integration.test.ts` — the `source.integration.test.ts` harness (Testcontainers `postgres:18.4`, `migrate`, `createApp(baseDeps({...stores: makeStores(db)}))`, `bearerToken()` via `/api/auth/native`). Seed six bodies through `POST /api/logs` (each `expect(created.status, \`${name}: ${created.text}\`).toBe(201)`): `machineFused` (pm5 finished, exit-7 steps, machine `124/500`, pair `124/500`, rest `120/242`, `distanceMeters: 500 + FUSED_REST_METERS /*120*/`, `timeSeconds 244`, `totalCalories 37`); `workPair` (pm5 `link-lost`, `workoutType null`, `steps []`, pair `800.5/3012`); `steps` (manual TR, one step `actualMeters 2000, actualSeconds 470.2`); `preRc5` (pm5 `rower`, exit-7 steps, `distanceMeters 742, timeSeconds 244`); `pm5LinkLost` (pm5 `link-lost`, `steps [{label:"Work"}]`, `560/150`); `manual` (`steps [{label:"Work"}]`, `2000/480`). `GET /api/stats/rows` → 6 rows; every row's key set is the ten; `machineFused` → `{ tier "machine", workMeters 500, workSeconds 124, restMeters 242, calories 37 }`; `workPair` → `{ "work-pair", 3012, 800.5, workoutType null }`; `steps` → `{ "steps", 2000, 470.2 }`; `preRc5` → `{ "stored", 742, 244 }`; `pm5LinkLost` → `{ "stored", 560, source "pm5" }`; `manual` → `{ "stored", 2000, calories null }`; three stored-tier rows; every `loggedAt` round-trips `toISOString()`. Run `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project integration server/routes/stats.integration.test.ts` → PASS (measured 1/1, ~40 s).
- [ ] **Step 6: Mutations (§8.2 (4)).** (a) In `toStatsRow` replace `workMeters: c.workMeters` with `workMeters: r.distanceMeters`; rerun the integration test. Expected: `machineFused` fails `expected 620 to be 500` (the fused figure = machine + 120) — the exact line goes in the PR body. Restore. (b) The guard: in `STATS_ROW_COLUMNS` replace the `case when jsonb_typeof(...) = 'number' then … else null end` expression with the bare `(${sessionLogs.machineSummary}->>'totalCalories')::double precision`; run `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project integration server/stores/contracts/contracts.real.integration.test.ts` — Step 1's contract case already seeds `totalCalories: "thirty-seven"` through the real store. Expected (measured): `× statsRows returns every row of THIS user only …` with `error: invalid input syntax for type double precision: "thirty-seven"` — the whole `statsRows` call throws, not one row reading null. Restore; green.
- [ ] **Step 7: Commit** `feat(api): GET /api/stats/rows — per-row projection through rowContribution`.

### Task 5: The adapter — `useStatsRows` and the `TZ`-pinned conversion

**Files:** Create `src/api/useStatsRows.ts`, `src/api/useStatsRows.test.ts`, `src/api/useStatsRows.tz.test.ts`.

**Produces:** `useStatsRows(): StatsRowsState` (`loading | error{retry} | ready{rows: DatedStatsRow[]; today: CalendarDate}`); `toCalendarDate(instant: Date): CalendarDate`.

- [ ] **Step 1: Failing TZ test** — `useStatsRows.tz.test.ts` opens with `process.env.TZ = "America/New_York";` as its first statement. Say in the comment what that actually is: ESM hoists the imports, so the assignment RUNS after `./useStatsRows` has loaded — and it still works, because Node reads `TZ` at each `Date` call rather than once at start-up (measured: swapping the zone for `Pacific/Kiritimati` moves `getTimezoneOffset()` from 240 to −840 with the imports untouched). The one thing the placement guarantees is that no `Date` is constructed in this file before the assignment. Cases: `new Date("2026-09-12T12:00:00Z").getTimezoneOffset()` is `240` (the zone took — RF38); `toCalendarDate(new Date("2026-09-13T02:30:00Z"))` is `{ y: 2026, m: 9, d: 12 }` (22:30 EDT; UTC would say 13 — the first draft's `2026-09-12T23:30:00Z` is the 12th in UTC too and the mutation below PASSED against it, measured at `652ac26c`); `toCalendarDate(new Date(2026, 0, 17, 12))` is `{ 2026, 1, 17 }` (month is 1-based). Plus `useStatsRows.test.ts` (the `useRecentLogs.test.ts` idiom: `vi.resetModules`, `vi.doMock("../api")`, `renderHook`): with `vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 8, 12, 9))` a ready state carries `today {2026,9,12}`, the row's `date.y 2026`, and `api` was called with `"/api/stats/rows"`; a 500 yields `error` whose `retry()` fires a second request; and the lifetime invariant ("no cache outlives the screen"): mount, await `ready`, `unmount()`, mount again, await `ready` → `api` called exactly TWICE. Mutation: hoist the ready state to a module-scope `let cache` and serve it on the next mount → `expected "vi.fn()" to be called 2 times, but got 1 times` (measured). → FAIL (module missing).
- [ ] **Step 2: Implement:**

```ts
export function toCalendarDate(instant: Date): CalendarDate {
  return { y: instant.getFullYear(), m: instant.getMonth() + 1, d: instant.getDate() }; // LOCAL getters — the one conversion
}
export function useStatsRows(): StatsRowsState {
  const [state, setState] = useState<StatsRowsState>({ state: "loading" });
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const retry = () => setGeneration((g) => g + 1);
    api("/api/stats/rows").then(async (res) => {
      if (cancelled) return;
      if (res.ok) {
        const body = (await res.json()) as StatsRowsResponse;
        setState({ state: "ready", rows: body.rows.map((r) => ({ ...r, date: toCalendarDate(new Date(r.loggedAt)) })), today: toCalendarDate(new Date()) });
      } else setState({ state: "error", retry });
    }).catch(() => { if (!cancelled) setState({ state: "error", retry }); });
    return () => { cancelled = true; };
  }, [generation]);
  return state;
}
```

- [ ] **Step 3: Gates + mutation.** `… vitest run --project client src/api/useStatsRows.test.ts src/api/useStatsRows.tz.test.ts` → PASS (measured, with `stackedBar.test.ts` and `You.test.tsx`: 4 files, 22 tests). Mutation (§8.3 (4)): swap the three getters for `getUTCFullYear/getUTCMonth/getUTCDate` → the 02:30Z case fails `expected { d: 13 } … { d: 12 }`; paste it; restore.
- [ ] **Step 4: Commit** `feat(client): useStatsRows adapter with the device-zone date conversion`.

### Task 6: The stacked bar and the You hero (the door)

**Files:** Create `src/charts/stackedBar.ts` + `.test.ts`, `src/you/stats/format.ts`, `StackedBar.tsx`, `TypeLegend.tsx`, `YouStatsHero.tsx`, `YouStatsHero.test.tsx`; modify `src/You.tsx`, `src/index.css`.

- [ ] **Step 1: Failing layout test** `stackedBar.test.ts`: `layoutStackedBar([{a,1},{b,3}], 104, 4)` → `[{a,x0,w25},{b,x29,w75}]`, last edge `104`; a 0-value entry gets no segment (`[{a,0},{b,2}]`,100,2 → `[{b,0,100}]`); all-zero → `[]`. Implement `src/charts/stackedBar.ts` (`export interface StackedSegment<K> { key: K; x: number; width: number }`; filter `value > 0`, `usable = max(0, width - gap*(n-1))`, widths proportional, `x += w + gap`). → PASS.
- [ ] **Step 2: `format.ts`:** `fmtMeters` (LogRow's thousands regex), `fmtSeconds(s) = fmtDuration(s / 60)`, `fmtPercent(share) = \`${Math.round(share*100)}%\``, `fmtDate({y,m,d}) → "YYYY-MM-DD"`, `seamLine(k)` (`1 ROW PREDATES WORK-ONLY TOTALS · NOT IN AVG WATTS` / `${k} ROWS PREDATE …`).
- [ ] **Step 3: `StackedBar.tsx`** — `<svg className="stacked-bar" viewBox="0 0 320 24" preserveAspectRatio="none" aria-hidden="true" focusable="false">` with one `<rect key className={SEGMENT_CLASS[key]} data-bucket={key} x y=0 width height=24>` per `layoutStackedBar(buckets.map(b => ({ key: b.key, value: b.seconds })), 320, 2)` segment; `SEGMENT_CLASS = { AN: "stacked-bar-seg-an", AT: "…-at", O2: "…-o2", TR: "…-tr", "NO TYPE": "…-none" }`. `TypeLegend.tsx` — `withTime={false}`: `<p className="stats-legend-line">{buckets.map(b => \`${b.key} ${fmtPercent(b.share)}\`).join(" · ")}</p>`; `withTime`: `<ul className="stats-legend">` of `<li className="stats-legend-row" data-bucket={key}>` with the swatch span (`stats-swatch stats-swatch-<an|at|o2|tr|none>`, `aria-hidden`), `<span className="stats-legend-key">`, `<span className="stats-legend-time">{fmtSeconds}</span>`, `<span className="stats-legend-pct">{fmtPercent}</span>` — the two class names Task 7's CSS keys on, on the JSX, not only in the stylesheet.
- [ ] **Step 4: Failing hero test** (`YouStatsHero.test.tsx`; `beforeEach`: `vi.resetModules(); vi.restoreAllMocks(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 8, 12, 9))`; `mockRows(rows: readonly unknown[])` doMocks `../../api`; render in `MemoryRouter` with a `/you/stats` route rendering `<h1>Stats page</h1>`; `hero = await screen.findByRole("link", { name: "Stats" })`): (a) seed → `LIFETIME · 56,752 M`, `SEASON 2027 · 43,012 M`, `AN 6% · AT 27% · O2 43% · TR 10% · NO TYPE 15%`, `WORK TIME BY TYPE · ALL ROWS`; (b) `hero.matches("a, button, [tabindex]")` and `hero.querySelectorAll("a, button, [tabindex]")` has length 0; click the legend text → `Stats page`; (c) manual rows → rect `data-bucket` order `["AT","O2","TR"]` (independent literal) and `AT 40% · O2 51% · TR 9%`; (d) `[]` → `LIFETIME · 0 M`, the `NO ROWS YET` string, no `svg`; (e) TWO rows whose only step carries metres and no seconds — independent literals `{ id: "m1", tier: "steps", workMeters: 500, workSeconds: null, workoutType: "O2", … }` and `m2` likewise (`AT`) — → `LIFETIME · 1,000 M`, the hero's `textContent` contains `NO WORK TIME TO DRAW YET`, no `svg`, no `.stats-legend-line`, and no `WORK TIME BY TYPE` caption. Σ work seconds is 0 over rows that exist, so `timeByType` returns `[]` and without this branch the bar and legend both render EMPTY under a caption — rows, but nothing to draw, and no sentence saying so (measured by render). → FAIL.
- [ ] **Step 5: `YouStatsHero.tsx`:**

```tsx
export const NO_ROWS_YET = "NO ROWS YET · YOUR FIRST SAVED ROW STARTS THE COUNT";
// Rows exist but none carries work SECONDS (all steps-tier, metres only). COPY PENDING JAMES AT PR REVIEW —
// a Gate 0 addition; the seed never reaches this state.
export const NO_WORK_TIME_TO_DRAW = "NO WORK TIME TO DRAW YET";
export default function YouStatsHero() {
  const state = useStatsRows();
  return (
    <Link to="/you/stats" state={{ from: "/you" }} className="you-stats-hero" aria-label="Stats">
      {state.state === "loading" && <p className="stats-caption">LOADING…</p>}
      {state.state === "error" && <p className="stats-caption">COULDN'T LOAD STATS · TAP TO OPEN</p>}
      {state.state === "ready" && <HeroBody {...state} />}
    </Link>
  );
}
function HeroBody({ rows, today }: Extract<ReturnType<typeof useStatsRows>, { state: "ready" }>) {
  const all = presetRange("all", today);
  const lifetime = summarize(rows, all).all.meters;
  const season = summarize(rows, presetRange("season", today)).all.meters;
  const buckets = timeByType(rows, all);
  return (<>
    <p className="you-stats-figures"><span>LIFETIME · {fmtMeters(lifetime)} M</span><span>SEASON {seasonOf(today).name} · {fmtMeters(season)} M</span></p>
    {rows.length === 0 ? <p className="stats-caption">{NO_ROWS_YET}</p>
      : buckets.length === 0 ? <p className="stats-caption">{NO_WORK_TIME_TO_DRAW}</p> : (<>
      <StackedBar buckets={buckets} /><TypeLegend buckets={buckets} withTime={false} />
      <p className="stats-caption">WORK TIME BY TYPE · ALL ROWS</p></>)}
  </>);
}
```

The hero's own doc comment must not contain the word "Concept2" (Task 8's scan reads comments).
- [ ] **Step 6: Mount.** In `You.tsx` import `YouStatsHero from "./you/stats/YouStatsHero"` and render `<YouStatsHero />` between `</section>` and the `.you-doors` `<nav>` (a comment: it IS the door; `.you-doors` gains no STATS row). `You.test.tsx` stays green (measured); add one case there (its `api` mock already answers every other path): `getAllByRole("link", { name: "Stats" })` has length 1 and no `.you-doors` child's text contains `STATS` (invariant 16's `.you-doors` half — the hero test cannot see `You.tsx`).
- [ ] **Step 7: CSS** (append to `index.css`; the contrast numbers from `contrast.json` in the block comment): `.you-stats-hero { display:block; margin-top:22px; padding:16px; min-height:var(--tap); box-sizing:border-box; background:var(--surface); border:1px solid var(--rule); color:var(--ink); text-decoration:none }` `.you-stats-hero:focus-visible { outline:2px solid var(--ink); outline-offset:2px }` `.you-stats-figures { display:flex; flex-wrap:wrap; justify-content:space-between; gap:4px 12px; margin:0 0 12px; font-family:var(--font-mono); font-size:12px; font-weight:600; letter-spacing:.08em; font-variant-numeric:tabular-nums }` `.stacked-bar { display:block; width:100%; height:24px }` `.stacked-bar-seg-an{fill:var(--type-an)} …-at{fill:var(--type-at)} …-o2{fill:var(--type-o2)} …-tr{fill:var(--type-tr)} …-none{fill:var(--ink-4)}` (`--type-tr` exists — `src/theme/tokens.css` declares it as `var(--ink)`; the bar takes the TYPE token so a retuned TR colour reaches it) `.stats-legend-line,.stats-caption,.stats-note { margin:8px 0 0; font-family:var(--font-mono); font-size:11px; letter-spacing:.06em; color:var(--ink-3) }` `.stats-legend-line{color:var(--ink)}` `.stats-caption-quiet{color:var(--ink-4)}`.
- [ ] **Step 8: Gates + mutations.** Hero test → PASS (measured 5/5). (a) Invariant 16: wrap `<TypeLegend …/>` in a second `<Link to="/you/stats">` → `× is exactly ONE focusable control … expected <a href="/you/stats" …> to have a length of +0 but got 1` (measured). Restore. (b) Drop the `buckets.length === 0` branch → case (e) `expected 'LIFETIME · 1,000 MSEASON 2027 · 1,000…' to contain 'NO WORK TIME TO DRAW YET'` with `Received: "LIFETIME · 1,000 MSEASON 2027 · 1,000 MWORK TIME BY TYPE · ALL ROWS"` — the caption under an empty bar (measured). Restore. Contrast: `--ink` on `--surface` 17.11:1, `--ink-3` on `--surface` 7.43:1 (`contrast.json`).
- [ ] **Step 9: Commit** `feat(you): the career hero — LIFETIME and SEASON over the time-by-type bar, the door to /you/stats`.

### Task 7: `/you/stats` — filter bar, TOTALS, TIME BY TYPE, empty states

> **Superseded in part by §14 ruling 18 (2026-09-12, after this task shipped):** every caption this task prescribes — `RANGE_CAPTION`, `TOTALS_CAPTION`, the in-card `n OF m` header line, the CALORIES / AVG WATTS row captions, `TIME_BY_TYPE_CAPTION`, and Task 6's `WORK TIME BY TYPE · ALL ROWS` — was struck; the page keeps the seam line (no `· NOT IN AVG WATTS`) and one `n OF m MACHINE ROWS CARRY THE MONITOR'S OWN TOTALS` footnote under the card. The steps below are the record of what was built first.

**Files:** Create `src/you/stats/StatsFilterBar.tsx`, `TotalsGroup.tsx`, `TimeByTypeGroup.tsx`, `StatsScreen.tsx`, `StatsScreen.test.tsx`; modify `src/shell/AppRoutes.tsx`, `src/index.css`.

- [ ] **Step 1: Failing screen test** (`StatsScreen.test.tsx`, same `beforeEach` as Task 6; `renderScreen(rows)` mocks `../../api`, renders `<MemoryRouter initialEntries={["/you/stats"]}><StatsScreen /></MemoryRouter>`, awaits heading `Stats`; helpers `chip(name) = getByRole("radio", { name })`, `rowValue(label, col) = within(getByRole("row", { name: /^label/ })).getAllByRole("cell")[col-1].textContent`): (1) first open: ALL checked; METRES `56,752`/`36,752`; TIME `3:59:39`/`2:34:31`; SESSIONS `13`/`10`; `8 OF 10 CARRY THE MONITOR'S OWN TOTALS`; REST METRES `718`; CALORIES `1,731` + `8 OF 10 ROWS CARRY IT · MONITOR'S OWN COUNT`; AVG WATTS `176`; `1 ROW PREDATES WORK-ONLY TOTALS · NOT IN AVG WATTS`. (2) SEASON `43,012`, YEAR `50,512`, MONTH `5,000`, 30 DAYS `18,000`. (3) CUSTOM: inputs (`getByLabelText("FROM"/"TO")`) read `2026-08-14`/`2026-09-12`, METRES `18,000`; FROM→`2026-09-01` gives `5,000`; FROM→`2026-09-13` shows `role="alert"` `FROM MUST NOT FOLLOW TO` and METRES stays `5,000`. (3b) CLEARED: on CUSTOM (`18,000`), `fireEvent.change(FROM, { target: { value: "" } })` — the one non-date a date input can hand over — → `role="alert"` reads `ENTER BOTH DATES`, FROM carries `aria-invalid="true"`, METRES stays `18,000`; FROM→`2026-09-01` clears the alert and reads `5,000`. (4) FROM `2026-07-20` TO `2026-07-31` → `NO ROWS BETWEEN 2026-07-20 AND 2026-07-31`, chip CUSTOM still present. (5) `[]` → `NO ROWS YET …`, no `radiogroup`, no `TOTALS`. (6) manual rows → METRES `20,000` / `""`, TIME `1:25:08`, SESSIONS `3`, columnheader `MACHINE` present, `NO MONITOR ROWS YET`, no REST METRES / CALORIES / AVG WATTS rows, no `CARRY THE MONITOR'S OWN TOTALS`, no `ROWS CARRY IT`. (7) legend `listitem` texts `["AN13:436%","AT1:03:3927%","O21:44:0443%","TR23:0710%","NO TYPE35:0615%"]`, `data-bucket` order (independent literal), every `li` carries class `stats-legend-row`, and each `li`'s `.stats-legend-pct` reads `["6%","27%","43%","10%","15%"]` — the grid and the quiet percent are CSS on those two classes, so the sweep is not screenshot-only. (8) R13 alone → `1 OF 1 CARRY THE MONITOR'S OWN TOTALS`, AVG WATTS `237`, `TWO ROWS MAKE A CHART`. (8b) the two metres-only rows of Task 6 case (e) → METRES `1,000`, TIME `0:00`, SESSIONS `2`, `NO WORK TIME TO DRAW YET`, no `list`, and NOT `TWO ROWS MAKE A CHART` (there are two). (9) focus ALL, `keyDown ArrowRight` → SEASON checked and focused, ALL `tabindex="-1"`. → FAIL.
- [ ] **Step 2: `StatsFilterBar.tsx`** — `PaceRefInput`'s roving tabindex verbatim over `PRESETS` (labels `ALL · SEASON · YEAR · MONTH · 30 DAYS · CUSTOM`): `<div className="stats-chips" role="radiogroup" aria-label="Range">` of `<button type="button" role="radio" aria-checked={preset===p} className="stats-chip" tabIndex={preset===p?0:-1} onClick onKeyDown>` (ArrowRight/Down → `selectByIndex(i+1)`, Left/Up → `i-1`, wrap modulo, focus + `onPreset`); `<p className="stats-caption">{RANGE_CAPTION}</p>` with `RANGE_CAPTION = "RANGE APPLIES TO TOTALS · METRES PER WEEK · TIME BY TYPE. SEASON IS ALWAYS THIS SEASON. TEST TREND IS ALWAYS EVERY TEST."`; when `preset === "custom"`: two `<label className="stats-date">FROM<input type="date" value aria-invalid onChange/></label>` (and TO) and, when `customProblem !== null`, `<p className="stats-caption" role="alert">{customProblem === "empty" ? ENTER_BOTH_DATES : FROM_AFTER_TO}</p>` with `ENTER_BOTH_DATES = "ENTER BOTH DATES"` (COPY PENDING JAMES AT PR REVIEW — Gate 0 drew only the FROM > TO error) and `FROM_AFTER_TO = "FROM MUST NOT FOLLOW TO"`; both inputs carry `aria-invalid` while either problem holds. Props: `{ preset, onPreset, custom: {from,to}, onCustom, customProblem: CustomProblem }` with `export type CustomProblem = null | "empty" | "order"`.
- [ ] **Step 3: `TotalsGroup.tsx`** (`{ summary: StatsSummary }`): `<section className="stats-group" aria-labelledby="stats-totals-h"><h2 id=… className="stats-group-title">TOTALS</h2><p className="stats-caption">ERGOMATIC ROWS ONLY · WORK METRES · REST SHOWN SEPARATELY</p>{storedTierRows > 0 && <p className="stats-caption">{seamLine(storedTierRows)}</p>}<table className="stats-table"><thead><tr><th scope="col"/><th scope="col">ALL ROWS</th><th scope="col">MACHINE</th></tr>{hasMachine && <tr><td colSpan={3} className="stats-note">{ownTotals} OF {sessions} CARRY THE MONITOR'S OWN TOTALS</td></tr>}</thead><tbody>` rows `METRES` / `TIME` / `SESSIONS` (`<th scope="row">` + two `<td>`, the MACHINE cell `""` when `!hasMachine`, where `hasMachine = machine.sessions > 0`); `!hasMachine` → `<tr><td/><td/><td className="stats-note">NO MONITOR ROWS YET</td></tr>`; `hasMachine` → `REST METRES`, `CALORIES` (th carries `<span className="stats-row-caption">{caloriesRows} OF {sessions} ROWS CARRY IT · MONITOR'S OWN COUNT</span>`), `AVG WATTS` (`AT THE RANGE'S AVERAGE PACE · WORK-ONLY ROWS`; value `avgWatts === undefined ? "—" : String(avgWatts)`), each with an empty ALL cell. `TimeByTypeGroup.tsx` (`{ buckets, rowsInRange }`): title `TIME BY TYPE`, `<p className="stats-caption stats-caption-quiet">WORK TIME · NO TYPE IS ERGOMATIC'S OWN BUCKET FOR FREE ROWS AND UNTYPED ROWS · NOT A FIFTH TYPE</p>`, then `rowsInRange < 2 ? <p className="stats-caption">TWO ROWS MAKE A CHART</p> : buckets.length === 0 ? <p className="stats-caption">{NO_WORK_TIME_TO_DRAW}</p> : <><StackedBar/><TypeLegend withTime/></>` — the same zero-total branch as the hero (imported from `YouStatsHero.tsx`, where `NO_ROWS_YET` already lives): two or more rows in range with Σ work seconds 0 is a real state, and an empty `<svg>` over an empty `<ul>` is not a sentence.
- [ ] **Step 4: `StatsScreen.tsx`** — the state and derivation (NOT a setState during render: a first draft did `if (customNow !== lastCustom) onLastCustom(customNow)` inside the child's render and the client run hung for 280 s):

```tsx
function parseInputDate(value: string): CalendarDate | null { // "" (the field cleared) is the only non-date a date input hands over
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
}
export default function StatsScreen() {
  const state = useStatsRows();
  const [preset, setPreset] = useState<Preset>("all");
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const [applied, setApplied] = useState<DateRange | null>(null); // last VALID custom range
  function handleCustom(next: { from: string; to: string }) {
    setCustom(next);
    const from = parseInputDate(next.from), to = parseInputDate(next.to);
    const r = from && to ? customRange(from, to) : null;
    if (r) setApplied(r);
  }
  return (<main className="screen"><BackLink fallback="/you" /><h1 className="screen-title">Stats</h1>
    {state.state === "loading" && <p className="stats-caption">LOADING…</p>}
    {state.state === "error" && <p className="notice" role="alert">Couldn't load your stats.{" "}<button type="button" className="button-outline" onClick={state.retry}>Try again</button></p>}
    {state.state === "ready" && state.rows.length === 0 && <p className="stats-caption">{NO_ROWS_YET}</p>}
    {state.state === "ready" && state.rows.length > 0 && <Body rows={state.rows} today={state.today} preset={preset} onPreset={setPreset}
      custom={custom ?? { from: fmtDate(addDays(state.today, -29)), to: fmtDate(state.today) }} onCustom={handleCustom} applied={applied} />}
  </main>);
}
function Body({ rows, today, preset, onPreset, custom, onCustom, applied }: BodyProps) {
  const from = parseInputDate(custom.from), to = parseInputDate(custom.to);
  // Two ways the pair can be unusable, each with its own sentence; while either holds `applied` (the last VALID range) renders.
  const customProblem: CustomProblem = preset !== "custom" ? null
    : from === null || to === null ? "empty" : customRange(from, to) === null ? "order" : null;
  const range: DateRange = preset === "custom" ? (applied ?? presetRange("30d", today)) : presetRange(preset, today);
  const inRange = rowsInRange(rows, range); const summary = summarize(rows, range);
  return (<>
    <StatsFilterBar preset={preset} onPreset={onPreset} custom={custom} onCustom={onCustom} customProblem={customProblem} />
    {inRange.length === 0
      ? <p className="stats-caption">NO ROWS BETWEEN {range.from ? fmtDate(range.from) : "THE START"} AND{" "}{range.to ? fmtDate(range.to) : "TODAY"}</p>
      : (<><TotalsGroup summary={summary} /><TimeByTypeGroup buckets={timeByType(rows, range)} rowsInRange={inRange.length} /></>)}
  </>);
}
```

Route: in `AppRoutes.tsx` import `StatsScreen from "../you/stats/StatsScreen"` and add `<Route path="/you/stats" element={<StatsScreen />} />` after `/you/settings` (inside the signed-in fragment; not in `HIDDEN_TABBAR_PREFIXES`).
- [ ] **Step 5: CSS** (append): `.stats-group{margin-top:24px}` `.stats-group-title{margin:0; font-family:var(--font-mono); font-size:12px; font-weight:600; letter-spacing:.1em}` `.stats-chips{display:flex; margin-top:12px; border:1px solid var(--rule-3); border-radius:var(--radius); overflow:hidden}` `.stats-chip{flex:1; min-width:44px; min-height:var(--tap); padding:0 2px; background:var(--surface); border:none; border-right:1px solid var(--rule-3); border-radius:0; font:inherit; font-family:var(--font-mono); font-size:11px; font-weight:500; letter-spacing:.04em; color:var(--ink-2); cursor:pointer}` `.stats-chip:last-child{border-right:none}` `.stats-chip[aria-checked="true"]{background:var(--ink); color:var(--on-color)}` `.stats-custom{display:flex; flex-wrap:wrap; gap:12px; margin-top:12px}` `.stats-date{display:flex; flex-direction:column; gap:4px; font-family:var(--font-mono); font-size:11px; letter-spacing:.06em; color:var(--ink-3)}` `.stats-date input{min-height:var(--tap); font-size:16px; font-family:var(--font-mono); color:var(--ink); background:var(--surface); border:1px solid var(--rule-3); border-radius:var(--radius); padding:0 8px}` `.stats-table{width:100%; margin-top:12px; border-collapse:collapse; font-family:var(--font-mono); font-size:12px; font-variant-numeric:tabular-nums}` `.stats-table th{text-align:left; font-weight:500; color:var(--ink-3); letter-spacing:.06em}` `.stats-table td{text-align:right; color:var(--ink)}` `.stats-table th,.stats-table td{padding:8px 0; border-top:1px solid var(--rule-2)}` `.stats-table thead th{border-top:none}` `.stats-table td.stats-note{text-align:left}` `.stats-row-caption{display:block; font-size:10px; color:var(--ink-3)}` `.stats-legend{list-style:none; margin:8px 0 0; padding:0}` `.stats-legend-row{display:grid; grid-template-columns:12px 1fr auto auto; gap:8px; align-items:center; padding:6px 0; font-family:var(--font-mono); font-size:12px; font-variant-numeric:tabular-nums}` `.stats-legend-pct{color:var(--ink-3)}` `.stats-swatch{width:12px; height:12px; display:inline-block}` `.stats-swatch-an{background:var(--type-an)}` (at/o2 likewise, `-tr` `var(--type-tr)`, `-none` `--ink-4`).
- [ ] **Step 6: Gates + mutations.** `… vitest run --project client src/you/stats/StatsScreen.test.tsx` → PASS (measured 11/11). Mutations: (a) in `summarize` drop `r.source === "pm5"` for the machine filter → case (1) MACHINE METRES reads `56,752`; (b) in `TotalsGroup` render the three MACHINE-only rows unconditionally → case (6) `queryByRole("row", {name:/^REST METRES/})` is not null; (c) in `TypeLegend` iterate `TYPE_BUCKET_ORDER` instead of `buckets` → case (7)'s five-item literal gains `AN0:000%`; (d) drop `className="stats-legend-row"` from the `<li>` → case (7) `expected false to be true` on the every-row-carries-the-class assertion (measured); (e) drop `TimeByTypeGroup`'s `buckets.length === 0` branch → case (8b) `Unable to find an element with the text: NO WORK TIME TO DRAW YET` (measured); (f) in `Body` make the `from === null || to === null` arm yield `null` instead of `"empty"` → case (3b) `Unable to find an accessible element with the role "alert"` (measured). Record each failure line. Then `pnpm lint`, `pnpm typecheck`, `pnpm format:check`.
- [ ] **Step 7: Commit** `feat(you): /you/stats — range filter, TOTALS in two columns, TIME BY TYPE, empty states`.

### Task 8: The structural gate — no Concept2 identifier in the stats code

**Files:** Create `src/you/stats/concept2Independence.test.ts`.

- [ ] **Step 1:** Write the test: `FORBIDDEN = ["verified","c2resultid","c2userid","concept2","/api/concept2"]`; paths from `process.cwd()` (vitest's root is `app/`; `import.meta.url` is NOT a `file:` URL under jsdom — `fileURLToPath` throws `The URL must be of scheme file`, measured): `SCANNED_DIRS = [path.join(ROOT,"domain/stats/"), path.join(ROOT,"src/you/stats/")]`, `SCANNED_FILES = [path.join(ROOT,"src/api/useStatsRows.ts")]`, non-test `.ts/.tsx` only; cases: the scan reaches `aggregate.ts`, `YouStatsHero.tsx`, `useStatsRows.ts`; `hits` (file: needle, `text.toLowerCase().includes`) strict-equal `[]`; `YouStatsHero.tsx`'s `from "…"` specifiers contain none; `expectTypeOf<keyof StatsRow>().toEqualTypeOf<"id"|"loggedAt"|"source"|"workoutType"|"tier"|"workMeters"|"workSeconds"|"restMeters"|"restSeconds"|"calories">()` plus a runtime `Record<keyof StatsRow, true>` probe with ten keys.
- [ ] **Step 2: Run** → measured: the first run FAILED on three COMMENTS (`calendar.ts` "Concept2 names a season…", `statsRow.ts` "no Concept2 field…", `YouStatsHero.tsx` "Concept2-free scan") — reword them ("the logbook names…", "no logbook-link field…", "the §8.4 structural scan"); then PASS 4/4. Exit criterion 2's grep: `grep -rin "verified\|c2ResultId\|c2UserId\|concept2" app/domain/stats app/src/you/stats app/src/api/useStatsRows.ts` → only the test file's own needle list (paste it).
- [ ] **Step 3: Mutations (§8.4 (4)).** Add `verified: boolean | null` to `StatsRow` → `pnpm typecheck` fails on `toEqualTypeOf` and the probe object; add `import { useConcept2Link } from "../../api/useConcept2Link";` to `YouStatsHero.tsx` → `× no scanned file contains …` naming `…/YouStatsHero.tsx: concept2` and `× … import specifiers`. Restore both.
- [ ] **Step 4: Commit** `test(stats): structural Concept2-independence and key-set gates`.

### Task 9: e2e, design registration, screenshots

**Files:** Modify `e2e/helpers.ts`, `e2e/tsconfig.json`, `e2e/design.spec.ts`, `e2e/screenshots.spec.ts`; create `e2e/stats.spec.ts`, `src/test/gate0LogBodies.ts` + `.test.ts`.

- [ ] **Step 1: The seed as API bodies.** `src/test/gate0LogBodies.ts` maps `GATE0_ROWS` to `{ id, date: "YYYY-MM-DD", body }`: base `{ workoutId: null, workoutTitle: type===null ? "Just Row" : \`Seed ${id}\`, workoutType, held: null, effort: null, notes: null, advancesPlan: false, source, …(pm5 ? { deviceName: "PM5 432331249" }) }`; by tier — `machine`: `endedBy "finished"`, `steps` (free row `[]`, else one step with `actualMeters/actualSeconds`), `machineWorkSeconds/Meters`, `workSeconds/Meters`, `restSeconds` (`0` when `restMeters === 0`, else `60`), `restMeters`, `distanceMeters/timeSeconds` = the work figures, `machineSummary: { totalCalories }` when non-null; `work-pair`: `endedBy "link-lost"`, `steps []`, pair, rest `0/0`; `steps`: one step with actuals; `stored`: `endedBy "rower"`, `steps [{ label: "6k" }]`, `distanceMeters/timeSeconds` only. Its client test `gate0LogBodies.test.ts` runs each body through `rowContribution(statsRowInput({ … }))` — the scalars mapped `?? null` from the body, `steps` handed over AS THE BODY CARRIES IT, so the builder's own step-key reading is what the test exercises and never a second hand-written map of it — and asserts `{ tier, workMeters, workSeconds, restMeters, calories, source, type }` strict-equal the seed row's (measured 13/13). Task 2 step 8(b)'s `actualMetres` mutation now reaches this file too: `× R2`, `× R9`, `× R10` — `expected { tier: 'stored', …(6) } to strictly equal { tier: 'steps', …(6) }` (measured; with the hand-written map it stayed green). Add `"../src/test/gate0LogBodies.ts"` to `e2e/tsconfig.json`'s `include` (`scripts/e2e-typecheck-census.sh` stays 24/24 — measured).
- [ ] **Step 2: `backdateLog` in `e2e/helpers.ts`** — `POST /api/logs` cannot set `loggedAt` (`schema.ts:184` `defaultNow()`, the route reads no such field; Deviation 2), so:

```ts
export async function backdateLog(id: string, instant: string): Promise<void> {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ host: "127.0.0.1", port: Number(process.env.POSTGRES_PORT ?? "5433"),
    user: process.env.POSTGRES_USER ?? "ergomatic", password: process.env.POSTGRES_PASSWORD ?? "devpass", database: process.env.POSTGRES_DB ?? "ergomatic" });
  await client.connect();
  try {
    // An explicit instant (`…Z`), never a zone name: which DATE the row lands on is decided by the browser's zone alone.
    const res = await client.query("update session_logs set logged_at = $2::timestamptz where id = $1", [id, instant]);
    if (res.rowCount !== 1) throw new Error(`backdateLog: expected 1 row for ${id}, got ${res.rowCount}`);
  } finally { await client.end(); }
}
```

Defaults mirror `compose.yml` and CI's e2e job (which exports only `POSTGRES_PASSWORD=devpass`); `scripts/stack-env.sh` exports the per-worktree `POSTGRES_PORT` locally. The helper takes an INSTANT, not a date and a zone, so that neither Postgres's session zone nor the runner's can decide anything: the caller says which instant, and the browser's zone (the one under test) says which date.
- [ ] **Step 3: `e2e/stats.spec.ts`** — `test.use({ timezoneId: "America/New_York" })` moves ONLY the browser; the Playwright runner stays in the host's zone locally and in UTC on CI (GitHub-hosted ubuntu runners; `.github/workflows/` sets no `TZ`), so every instant in this spec is an explicit `…Z` literal and the assertions must hold under both. Clock: `page.clock.install({ time: new Date(`${GATE0_TODAY_ISO}T13:00:00Z`) })` — 09:00 EDT on the seed's today, as the instant it is (a zoneless `T09:00:00` literal is parsed by the RUNNER's zone and lands on a different instant on CI). Sign in (`stats-${RUN_ID}@e2e.test`); `seedGate0(page)` posts each body via in-page `fetch`, then `backdateLog(rowId, `${date}T16:00:00Z`)` — noon EDT, 11:00 EST on the two winter seed dates, so under the browser's zone each row lands on its own seed date — and ASSERTS the backdate took: `GET /api/logs/${ids.R13}` → `loggedAt === "2026-09-11T16:00:00.000Z"`; `/you`: `getByRole("link", { name: "Stats" })` contains `LIFETIME · 56,752 M` and `SEASON 2027 · 43,012 M`; the doors: for each of `BASELINES`, `SETTINGS`, `DIAGNOSTICS`, `page.locator(".you-doors").getByText(name, { exact: true })` visible, and `.you-doors` `not.toContainText("STATS")` — NAMES, not a child count: the CONCEPT2 door renders only for an account whose read says `available: true`, an environment fact (`C2_LINK_ENABLED`) this test does not own and must not pin; focus `Sign out`, `Tab` → hero focused; click `hero.locator(".stats-legend-line")` → URL `/you/stats`; rows (`getByRole("row", { name: /^METRES/ }).getByRole("cell").nth(0|1)`) `56,752`/`36,752`, `8 OF 10 CARRY THE MONITOR'S OWN TOTALS`, REST `718`, CALORIES `1,731`, AVG WATTS `176`, the singular seam line; then the delete and its refetch on TWO legs, because they prove different things (RF38), with a SAME-DOCUMENT SENTINEL keeping them honest: right after the `page.goto("/you")` above, `page.evaluate` sets `window.__psSameDoc = "same-doc"`. Leg 1, same-document END TO END and the gate — `/you/stats` has just mounted (any cache is minted NOW), then every step is a click: `TODAY` in `getByRole("navigation", { name: "Main" })`, then `a[href="/today/log/${ids.R13}"]` (Today's last-three list) → URL `/today/log/${ids.R13}$` → `Delete session` → `.log-delete-confirm` `Delete session` (the screen navigates back to Today itself) → `YOU` in the same navigation → URL `/you$`; assert the sentinel still reads `"same-doc"`, hero `LIFETIME · 54,752 M`; click the hero → URL `/you/stats$`, MACHINE `34,752`, `7 OF 9 CARRY THE MONITOR'S OWN TOTALS`. Leg 2, the reload: `page.goto("/you")`, assert the sentinel is `undefined`, `54,752`; `page.goto("/you/stats")` → `34,752` — any implementation passes this one; it stays because a reload is what a rower does too. **Why the first draft of leg 1 was decoration (measured):** it reached the log detail by `page.goto`, a reload that wiped any module-scope cache BEFORE the delete, so the module-cache mutant PASSED it (`1 passed`); with the stats screen mounted before a click-only path to the delete, the same mutant fails at the `54,752` assertion — `Expected substring: "LIFETIME · 54,752 M"` / `Received string: "LIFETIME · 56,752 MSEASON 2027 · 43,012 M…"`. Mutation (§8.5, invariant 13): hoist the hook's ready state to a module-scope `let cache` served on the next mount (compiles; `pnpm build` inside compose succeeded) → leg 1 red as quoted; restore → `1 passed`. Run `pnpm e2e e2e/stats.spec.ts` against the booted stack. Mutation (§8.5): make `summarize`'s ALL column filter `source === "pm5"` → the `56,752` assertion fails while `36,752` passes (rebuild: `pnpm e2e` builds; confirm `pnpm build` succeeds first, RF12 corollary).
- [ ] **Step 4: `design.spec.ts`** — append `test.describe("/you/stats")`: `beforeEach` signs in, posts two manual rows (`Sea Fret` O2 `6000 m/1550 s` and AT `2000 m/470 s`, one step each with actuals), `goto("/you/stats")`, clicks the `CUSTOM` radio, awaits `getByLabel("FROM")` (Playwright: `getByLabel`, not `getByLabelText` — TS2551 measured); tests: `assertTapTargets(page)`, `assertNoA11yViolations(page)`, and every `input` ≥ 16 px with exactly two `input[type=date]`.
- [ ] **Step 5: `screenshots.spec.ts`** — import `backdateLog` and `GATE0_LOG_BODIES`; add `seedGate0Stats(page)`, which backdates each row to `new Date(`${date}T12:00:00`).toISOString()` — noon in THE RUNNER's zone, handed over as an instant. No `timezoneId` here, so the browser shares the runner's zone and reads the same date back whatever that zone is; for the same reason the clock stays the zoneless `new Date("2026-09-12T09:00:00")` (runner-local 09:00 is browser-local 09:00, on every host). In `test("you")` after `setBaselines`: `await seedGate0Stats(page); await page.clock.install({ time: new Date("2026-09-12T09:00:00") });` and wait for `LIFETIME · 56,752 M` (RF7 — the hero is not captured empty); add `test("you-stats")` capturing `you-stats.png` `fullPage` after `8 OF 10 CARRY THE MONITOR'S OWN TOTALS` appears. Run `pnpm screenshots -g "you"` and `-g "you-stats"`; open both PNGs, describe them, recompute LIFETIME from the visible rows; commit only those two captures (`git checkout -- docs/screenshots/` for the rest).
- [ ] **Step 6:** `pnpm e2e e2e/stats.spec.ts e2e/design.spec.ts -g "you"` green locally; read the full e2e job on the PR. Commit `test(e2e): stats flow on the Gate 0 seed; /you/stats registered in design.spec; captures`.

### Task 10: The DBA gate (spec §9) and the record

**Files:** Create `docs/superpowers/research/2026-09-12-stats-rows/{README.md,01-seed.sql,queries.sh,bench.sh,explain.sh,payload.sh}`; the PR body.

- [ ] **Step 1:** Reconcile the protocol as it was RUN — the directory is TRACKED at `b4bddbdf`; diff the controller's scratchpad copy against `docs/superpowers/research/2026-09-12-stats-rows/` and land any drift (the DBA plan pass ran it: PASS, 224.8 B/row against the ≤ 240 literal, 10k-row user p95 90.8 ms against ≤ 150): `README.md` (the six steps); `01-seed.sql` (three users `dba-1k/10k/100k@test.local`, `dba_gen_a` from the 2026-09-07 dir retargeted at `session_logs`, at 1k/10k/100k plus filler to 1M, `vacuum analyze`); `queries.sh` (`Q_STATS` = the SHIPPED query text, drizzle's own `.toSQL()` of `STATS_ROW_COLUMNS`, no ORDER BY, with a `%s` user id); `bench.sh` (six runs per query in ONE psql session via `printf '%s\n' '\timing on'` — NOT `echo`, dba-techniques step 4; **when `BENCH_PRE` is set its own `Time:` line is the FIRST in the stream, so the script drops `skip = 1 + (BENCH_PRE ? 1 : 0)` lines IN ORDER before sorting** — a `tail -n +2 | sort -n` over the sorted stream discards the fastest run, not the cold one); `explain.sh` (`explain (analyze, buffers)` per user); `payload.ts` (NOT a `payload.sh` against the route — the route does not exist until Task 4 lands; this runs the real drizzle query builder over the real schema plus the plan's verbatim `toStatsRow`, served from a real Express router on :8099, so the bytes measured are HTTP bytes) and `http-bench.sh` (six `curl` fetches per user and encoding, run 1 discarded, median of 5, `%{size_download}`); `driver.ts` (drizzle's row mapper priced against raw `pg` in one warmed process); and the `.txt` outputs each produced (`bench-psql.txt`, `explain.txt`, `http-bench.txt`, `driver.txt`, `poison.txt`, `seed.log`, `payload.log`) — the numbers travel with the commands that made them. `bash -n` clean on every `.sh` (measured).
- [ ] **Step 2: Dispatch the `dba` agent** on the branch with the protocol: (a) seed, (b) medians + EXPLAIN at 1k/10k/100k, (c) real payload both encodings, (d) the literals — bytes/row ≤ 240, 10k-row user p95 ≤ 150 ms, (e) the §8.2 fixture carries ≥ 1 stored-tier row (three, Task 4). Verdict PASS / PASS WITH ROWS / FAIL with the numbers and the scale that decided it; its ledger entry rides this PR. A miss on a literal is explained, not hidden.
- [ ] **Step 3: PR body** (human-first shape): outcome line, ≤ 6 bullets; the Record block carries every mutation's failure text (Tasks 1-9), the `StatsRowInput` vs `StoredLog` vs store-row field diff, exit criterion 2's grep, the DBA verdict, the `tsc -p tsconfig.app.json` TS2322 proof, and the head SHA with `gh pr diff --name-only` reconciled. Tick the ROADMAP Phase PS section's PR 1 box in the same commit as the PR body's final reconciliation. Then the hand-back: proposed ROADMAP rows — ONE new from this plan, the `nfc.test.ts` fixture move under Deviation 6 — plus the three in spec §13 that already exist, and every overdue row.

## Deviations from spec

1. **`StatsRow` is declared in `app/domain/stats/statsRow.ts`, not `app/server/routes/stats.ts`.** The route and the hook both import it, so the key set cannot drift between them and the §8.4 key-set test is one test. Domain imports are legal on both sides.
2. **The e2e cannot seed `loggedAt` through the API (spec §8.5 says it "seeds each row's loggedAt at local NOON").** `session_logs.logged_at` is `defaultNow()` (`schema.ts:184`) and `POST /api/logs` reads no such field (`grep -n loggedAt server/routes/data.ts` → one comment). The plan backdates through the stack's published Postgres port (`backdateLog`) and ASSERTS the backdate through `GET /api/logs/:id` (RF38). The client tests carry the seed dates directly.
3. **`isReconstructableClose` moves into the domain; `storedSummary.ts` keeps its own `stepActualSums`** (the B2 TOTAL line still needs the `{meters?,seconds?}` shape). Two sum loops, one contract test holding them equal. **The `StatsRowInput` BUILDER, by contrast, exists once** — `statsRowInput` in `domain/stats/rowContribution.ts`, over the `StatsRowSource` field set both producers hold; the client maps its two differing fields (`endedBy ?? null`, `machineSummary?.totalCalories`) and the server passes its store row as it is. The route test's seam case holds the two call paths equal on the same saved row (RF24).
4. **The contract fixtures are COPIED from `storedSummary.test.ts` into `heroesContract.fixtures.ts`, not lifted**, so the 2,400-line test file stays untouched. Titles/types are a library workout's (`Sea Fret`, O2); `fromWorkout` builds a builder draft, not a log row, so it is not used.
5. **PR 1's calendar carries only what PR 1 consumes** (season, presets, custom, inclusive ranges). §8.3's week/streak/avg-per-day pins ship with their consumers in PR 2 (its DELTA pass covers them).
6. **The domain→src ESLint rule exempts exactly ONE file by name, `domain/monitor/nfc.test.ts`**, which imports `../../src/monitor/nfc/fixtures` (the unexempted rule is red on main — measured; no other domain test imports `src/`, per the grep in Task 1 step 2). A `domain/**/*.test.ts` glob would have exempted every future domain test for one file's sake. What would fix it now: move `loadPm5NfcFixture` + `FIXTURE_PM5_NAME` (and the capture they read) under `domain/monitor/nfc/`; not done here because it is a monitor-side move with its own owner and nothing in this PR touches NFC. **Proposed ROADMAP row (hand-back at Task 10):** `Move the PM5 NFC fixture loader out of src/monitor/nfc so domain/monitor/nfc.test.ts needs no ESLint exemption · dies 2026-10-12 · a fixture move in a file this PR does not otherwise touch; the named exemption keeps the rule honest meanwhile`.
7. **Two hero states Gate 0 did not draw:** loading reads `LOADING…`; error reads `COULDN'T LOAD STATS · TAP TO OPEN`; at 0 rows the figures read `0 M` and the §5 `NO ROWS YET …` string stands where the bar would be. The custom-range empty state's dates print as `YYYY-MM-DD` (the input's own format). Two more from the lens-2 pass: `NO WORK TIME TO DRAW YET` (rows in range, Σ work seconds 0 — the bar and legend would otherwise render empty with no words) and `ENTER BOTH DATES` (a cleared CUSTOM date, which was silently ignored). All six go to James at the PR as copy for approval.
8. **`avgWatts` with R1 counted is 174, not a figure the spec states** — a test literal, measured; the spec's `176` stands.

## Paste-test record (RF: plan authoring)

Every block above was written to its REAL path in the worktree at `c5cfab24`, then removed (nothing committed); the hardening fold re-pasted every block it changed (the ESLint block, the two new fixtures and the 8-row capture, `stepActuals`/`statsRowInput` and both callers, the seam case, the legend-class assertion, the `--type-tr` rules, the instant-taking `backdateLog` and both e2e callers) and re-ran the gates below at `68d0653e`; the lens-2 fold did the same for its blocks (both zero-total branches and their tests, the `customProblem` bar, the builder-routed `gate0LogBodies.test.ts`, the two-mount hook test, the two-leg e2e delete) at `b4bddbdf`. Commands and results:

- `pnpm exec tsc -p tsconfig.app.json --noEmit` → 0; `tsc -p tsconfig.server.json --noEmit` → 0; `tsc -p e2e/tsconfig.json --noEmit` → 0 (after `getByLabelText → getByLabel`); `scripts/e2e-typecheck-census.sh` → 24/24.
- `pnpm exec eslint` on every new/changed file → 0 (one `react-refresh` warning moved `seamLine` into `format.ts`); `pnpm exec prettier --check .` → clean; full `pnpm lint` → see the run log noted in the report.
- `vitest --project unit domain/stats` → 4 files / 29 tests; `server/routes/stats.test.ts` → 8/8 (its seam case imports `src/log/storedSummary.js` under the node project — loads clean); `domain/stats` + `stats.test.ts` + `contracts.fake.test.ts` → 168 tests; `--project integration server/routes/stats.integration.test.ts` → 1/1 (Docker, ~40 s).
- `vitest --project client`: `heroesContract.test.ts` 17/17; `storedSummary.test.ts` + `FromTheLog.test.tsx` + `logbookDerived.test.ts` 344/344 after the refactor; `useStatsRows.test.ts` + `.tz.test.ts` + `stackedBar.test.ts` + `You.test.tsx` 22/22; `YouStatsHero.test.tsx` 5/5; `StatsScreen.test.tsx` 11/11; `concept2Independence.test.ts` 4/4; `gate0LogBodies.test.ts` 13/13 (`src/you/stats` + `gate0LogBodies` + `useStatsRows.test.ts` together: 5 files, 36 tests).
- `pnpm exec tsx scripts/capture-heroes.ts` → the eight-row JSON quoted in Task 2 (on the pre-refactor tree: fixtures + script copied in, `storedSummary.ts` untouched); the same command after the refactor printed a byte-identical file (`diff` empty).
- Mutations run and restored: gate swap AND the `actualMetres` step-key rename (Task 2), `<`/`<=` and all-buckets (Task 3), the unguarded `::double precision` cast against the real contract test (Task 4), nested Link and the dropped hero zero-total branch (Task 6), the dropped `stats-legend-row` class, the dropped subpage zero-total branch and the `"empty"` arm made `null` (Task 7), the `actualMetres` rename against `gate0LogBodies.test.ts` (Task 9), the module-scope cache against the two-mount hook test (Task 5), ESLint import (Task 1) — failure texts quoted where they appear. Not run: the route `distanceMeters` mutation, the getters→UTC mutation, Task 7's (a)-(c), the Task 8 pair, the e2e ALL-column mutation — each is prescribed with its expected line and must be run at implementation.
- `pnpm e2e e2e/stats.spec.ts` against the per-worktree stack (`ergomatic-68485`, web :8185, pg :15185): the plan's first draft asserted a `.you-doors` child count of 4 and read 3 (no CONCEPT2 row in the e2e stack) — the count is gone, the door NAMES are asserted; with the explicit-instant clock and backdate, the lens-1 fold's run: `1 passed (1.3s)` — seed, backdate (R13 `2026-09-11T16:00:00.000Z`), hero figures, Tab focus, legend click, both columns, delete R13 → `54,752` / `34,752` / `7 OF 9`; the lens-2 fold's run with the two-leg delete: `1 passed (1.4s)`, and the module-cache mutant against it: leg 1 red as quoted in Task 9 step 3 (a first, goto-preceded draft of leg 1 let the same mutant pass — the sentinel and the click-only path are what fixed that). The stack is left up (`E2E_KEEP` default) for the implementer.
- Every shell block: `bash -n` clean; the DBA scripts syntax-checked.
