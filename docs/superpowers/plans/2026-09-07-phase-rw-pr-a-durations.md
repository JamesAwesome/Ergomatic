# Phase RW PR A — Durations without a baseline: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A rower with no baseline sees a duration on every workout: exact for time workouts, an assumed-pace estimate marked `~` for distance ones, on the Library, the workout detail header and the Builder; the Library's time filter runs on those numbers.

**Architecture:** One domain change: `estimateMinutes(steps, null)` stops returning `null`/throwing and prices distance work off `ASSUMED_BASELINES` (the recommend table's most common cell, already exported as `MOST_COMMON_ESTIMATE`), returning a third flag `assumed`. Every surface that showed `—` for a missing estimate renders the number, with `~` when `assumed`. Three placeholder mechanisms retire: Today's `estMinutes: 0` + `durationsUnknown`, the Library filter's bare null guard, and `draftMinutes`' `{0, 0}` pair. Nothing that gates Start, Connect or Log changes; no word ladder; no stored shape.

**Tech Stack:** TypeScript, React 19, Vitest (projects `unit` and `client`), Playwright (`pnpm e2e`, `pnpm screenshots`).

**Spec:** `docs/superpowers/specs/2026-09-06-row-without-baselines-design.md` §1.3, §4, §6 (PR A), §7 (Durations, Library row, census), §9 item 8. Gate 0 approved 2026-09-07 on prototype `589c67b2` (artifact `41bf06e1`).

## Global Constraints

- `app/domain/` imports no framework and no `node:` module (lint-enforced). The census test lives under `src/`.
- Never a bare dash for a number the app can compute (house rule; the `—` fallbacks this plan removes are the last of their kind on these surfaces).
- Copy: no em-dashes in user-facing strings. The caption is exactly `~ times are estimates until you set a baseline` (Gate 0, approved).
- `~` marks ONLY an assumed-pace estimate. A distance workout priced from a real baseline stays unmarked (spec §4).
- Tests pin independent literals, never the constant they gate (RF21). Every new assertion has a stated mutation.
- Commit the real change before any mutation probe; revert probes with `git checkout -- <file>` only after `git status` shows the file clean (RF22).
- Run `git rev-parse --show-toplevel` before every commit; it must print `/Users/james/projects/github/jamesawesome/Ergomatic-wt-rw`.
- Single-file test runs: `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project <unit|client> <file>` from `app/`.
- **Mechanism note (plan finding, RF10):** spec §1.3 prescribes pricing "in its own loop via `estimationSplit(ASSUMED_BASELINES, p.ref ?? …)`" over `phases(steps, null)`. That loop needs the null-tolerant `phases()` of §1.2, which is PR B. PR A instead calls `phases(steps, ASSUMED_BASELINES)` INSIDE `estimateMinutes` and returns numbers only. The invariant §9 item 8 protects ("no Phase carrying the assumed number reaches `pieceList`, the compiler or a log") holds because those phases never leave the function, and Task 1's census test pins the constant's importers. Task 0 amends the spec sentence to state the invariant rather than the loop.

---

### Task 0: The Gate 0 record and the spec amendment

**Files:**
- Create: `docs/design/rw-gate0/README.md` and the 30 PNGs + 2 JSON files from the Gate 0 run (source: `/private/tmp/claude-501/-Users-james-projects-github-jamesawesome-Ergomatic/5f02b65c-1acd-4e4b-b13e-7b9646b2b16c/scratchpad/gate0/`, excluding `before/`)
- Modify: `docs/superpowers/specs/2026-09-06-row-without-baselines-design.md` (Status line; §1.3 mechanism sentence; §5 Gate 0 bullet)
- Modify: `ROADMAP.md` (Phase RW status line)

- [ ] **Step 1: Copy the captures**

```bash
mkdir -p /Users/james/projects/github/jamesawesome/Ergomatic-wt-rw/docs/design/rw-gate0
cp /private/tmp/claude-501/-Users-james-projects-github-jamesawesome-Ergomatic/5f02b65c-1acd-4e4b-b13e-7b9646b2b16c/scratchpad/gate0/*.png /private/tmp/claude-501/-Users-james-projects-github-jamesawesome-Ergomatic/5f02b65c-1acd-4e4b-b13e-7b9646b2b16c/scratchpad/gate0/*.json /Users/james/projects/github/jamesawesome/Ergomatic-wt-rw/docs/design/rw-gate0/
ls /Users/james/projects/github/jamesawesome/Ergomatic-wt-rw/docs/design/rw-gate0 | wc -l
```
Expected: `33` (30 PNG + 2 JSON + README after step 2).

- [ ] **Step 2: Write the README**

```markdown
# Phase RW Gate 0 — approved renders (2026-09-07)

Rendered from the throwaway prototype branch `phase-rw-gate0` at
`589c67b2` (never merged) with `app/e2e/gate0-rw.spec.ts` on that branch,
web build, Chromium, 390×844 portrait and 844×420 landscape. Presented as
artifact `41bf06e1-fe2e-4d72-ae13-087105257e14` (rev 1); **James approved
as rendered, 2026-09-07 ("Approve")**: the 40px word in the portrait Timer
card, the captions as shown, the door's fixed figures beside the tilde
ones, the thresholds confirmed on sight of Bora and Roaring Forties.

Numbers: `contrast.json` (WCAG ratios from the live tokens: `--ink-3` on
`--page` 6.69:1, on `--surface` 7.43:1; `--ink` 15.41 / 17.11; the step
row's `--accent` word 5.94:1) and `timer-measure.json` (portrait Timer
card grid 350px: MODERATE at 40px = 182px + gap 14 + FREE 154 = 350,
no overflow; at the unmodified 52px it measured 370 and clipped FREE;
landscape at 56px fits 310 of 310).

The connected pane images are a hand-edited fixture (layout only). The
`before/` set is not committed: it is `docs/screenshots/` at v0.41.0.
```

- [ ] **Step 3: Amend the spec**

In the spec's Status paragraph, append: `**Gate 0 APPROVED 2026-09-07** on prototype `589c67b2` (docs/design/rw-gate0/); the portrait Timer word renders at 40px (measured), landscape unchanged.`

Replace the §1.3 sentence beginning `The anchor pass named the one leak path and the mechanism closes it:` through `(§9 item 8).` with:

```markdown
The anchor pass named the one leak path (§9 item 8) and PR A closes it with
an INVARIANT rather than the loop first written here: `estimateMinutes` may
build phases against `ASSUMED_BASELINES` inside its own body, but no `Phase`
carrying the assumed number is ever returned, stored, or passed on. The
gate is `src/assumedBaselinesCensus.test.ts`, which pins the constant's
importers to `domain/pace.ts`, `domain/expand.ts` and
`src/builder/builderState.ts`; a fourth importer fails the suite. (The null-
phases loop this sentence used to prescribe needs §1.2's `phases(steps,
null)`, which is PR B; PR A ships first.)
```

In §5, after the Gate 0 bullet, add: `- **Gate 0 APPROVED 2026-09-07** as rendered; record in `docs/design/rw-gate0/README.md`.`

- [ ] **Step 4: ROADMAP status**

In `ROADMAP.md`'s Phase RW section, change `Antagonist anchor pass owed on the spec before Gate 0; Gate 0 before any implementation task.` to `Anchor pass and /harden RUN 2026-09-06; **Gate 0 APPROVED 2026-09-07** (docs/design/rw-gate0/). PR A in flight.` Hand-wrap to the surrounding width; do not run Prettier on root markdown.

- [ ] **Step 5: Commit**

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-rw && git rev-parse --show-toplevel && git add docs/design/rw-gate0 docs/superpowers/specs/2026-09-06-row-without-baselines-design.md ROADMAP.md && git commit -m "Phase RW: Gate 0 approved renders committed; spec §1.3 states the containment invariant PR A ships"
```

---

### Task 1: `ASSUMED_BASELINES` and `estimateMinutes(steps, null)`

**Files:**
- Modify: `app/domain/pace.ts` (add the constant after the imports)
- Modify: `app/domain/expand.ts:229-270` (`estimateMinutes`: drop the overloads and the throw)
- Test: `app/domain/expand.test.ts:285-335` (rewrite the null-baselines describe)
- Test: `app/domain/pace.test.ts` (append one test)
- Create: `app/src/assumedBaselinesCensus.test.ts`

**Interfaces:**
- Produces: `export const ASSUMED_BASELINES: Baselines` in `domain/pace.ts`; `estimateMinutes(steps: Step[], baselines: Baselines | null): { minutes: number; estimated: boolean; assumed: boolean }` in `domain/expand.ts` (single signature, no overloads, never `null`, never throws for a split ref).

- [ ] **Step 1: Write the failing domain tests**

Replace the whole `describe("estimateMinutes with null baselines …")` block in `app/domain/expand.test.ts` with:

```ts
describe("estimateMinutes with null baselines (Phase RW PR A: the assumed pair)", () => {
  const sixKAtMax: Step[] = [
    {
      k: "w",
      duration: { kind: "distance", meters: 6000 },
      ref: { effort: "max" },
    },
  ];
  const sixKAtMin: Step[] = [
    {
      k: "w",
      duration: { kind: "distance", meters: 6000 },
      ref: { effort: "min" },
    },
  ];
  const sixKSplit: Step[] = [
    {
      k: "w",
      duration: { kind: "distance", meters: 6000 },
      ref: { base: "2k", off: 0 },
    },
  ];
  const timeOnly: Step[] = [
    { k: "r", minutes: 5 },
    {
      k: "w",
      duration: { kind: "time", minutes: 5 },
      ref: { base: "6k", off: 0 },
    },
  ];

  it("prices a time-only split-ref workout exactly, unmarked (was: throw)", () => {
    expect(estimateMinutes(timeOnly, null)).toStrictEqual({
      minutes: 10,
      estimated: false,
      assumed: false,
    });
  });

  // 6000 m at the mode cell's 2k (2:25 = 145 s/500 m): 1740 s = 29.0'.
  // Pinned as a literal: pricing at the table's SLOWEST cell (2:30) gives
  // 1800 s = 30, so a mutation to that cell fails here.
  it("prices a distance MAX step off the assumed 2k and marks it assumed", () => {
    expect(estimateMinutes(sixKAtMax, null)).toStrictEqual({
      minutes: 29,
      estimated: true,
      assumed: true,
    });
  });

  // MIN prices at k6 + 20 = 152 + 20 = 172 s/500 m: 2064 s = 34.4 -> 34.
  // At the slowest cell (157 + 20 = 177): 2124 s = 35.4 -> 35.
  it("prices a distance MIN step off the assumed 6k + 20 and marks it assumed", () => {
    expect(estimateMinutes(sixKAtMin, null)).toStrictEqual({
      minutes: 34,
      estimated: true,
      assumed: true,
    });
  });

  it("prices a distance split-ref step off the assumed pair (was: throw)", () => {
    expect(estimateMinutes(sixKSplit, null)).toStrictEqual({
      minutes: 29,
      estimated: true,
      assumed: true,
    });
  });

  it("never marks a real-baseline estimate as assumed, even a distance one", () => {
    expect(
      estimateMinutes(sixKSplit, { k2Seconds: 112, k6Seconds: 122 }),
    ).toStrictEqual({ minutes: 22, estimated: true, assumed: false });
  });

  it("accepts a Baselines | null-typed variable directly (type-level proof: this must typecheck)", () => {
    function pickBaselines(useReal: boolean): Baselines | null {
      return useReal ? { k2Seconds: 112, k6Seconds: 122 } : null;
    }
    const nullable: Baselines | null = pickBaselines(false);
    expect(estimateMinutes(timeOnly, nullable).assumed).toBe(false);
    const realNullable: Baselines | null = pickBaselines(true);
    expect(estimateMinutes(timeOnly, realNullable)).toStrictEqual({
      minutes: 10,
      estimated: false,
      assumed: false,
    });
  });
});
```

Append to `app/domain/pace.test.ts`:

```ts
describe("ASSUMED_BASELINES (Phase RW PR A)", () => {
  // The recommend table's MOST COMMON cell, pinned as literals so a table
  // edit that moves the mode is seen here, not discovered on a Library row.
  it("is the table's modal pair, 2:25 / 2:32", () => {
    expect(ASSUMED_BASELINES).toStrictEqual({
      k2Seconds: 145,
      k6Seconds: 152,
    });
  });
});
```
and add `ASSUMED_BASELINES` to that file's import from `./pace.js`.

Create `app/src/assumedBaselinesCensus.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Phase RW spec §1.3 / §9 item 8: `ASSUMED_BASELINES` prices DURATIONS
 *  and nothing else. A `Phase` built against it carries a real-looking
 *  `targetSplit`, one refactor away from `pieceList`, the PM5 compiler
 *  or a log seed. This census pins who may import the constant; a new
 *  importer fails here and has to argue its case in review. Same shape
 *  as `judgeBand.test.ts`: read the source, not the runtime. */
const ROOT = path.resolve(__dirname, "..");
const ALLOWED = new Set([
  "domain/pace.ts",
  "domain/expand.ts",
  "src/builder/builderState.ts",
]);

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe("ASSUMED_BASELINES census", () => {
  it("is imported only where a duration is priced", () => {
    const files = [
      ...walk(path.join(ROOT, "domain"), []),
      ...walk(path.join(ROOT, "src"), []),
    ];
    const importers = files
      .filter((f) => readFileSync(f, "utf-8").includes("ASSUMED_BASELINES"))
      .map((f) => path.relative(ROOT, f))
      .sort();
    expect(importers).toStrictEqual([...ALLOWED].sort());
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-rw/app && NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project unit domain/expand.test.ts domain/pace.test.ts; NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/assumedBaselinesCensus.test.ts
```
Expected: `expand.test.ts` fails on the null describe (throw / `null` / missing `assumed`); `pace.test.ts` fails with `ASSUMED_BASELINES` not exported; the census fails with `[]` received (nothing imports it yet). Check BOTH summary lines (`Test Files` and `Tests`).

- [ ] **Step 3: Implement**

In `app/domain/pace.ts`, after the `import type { … } from "./types.js";` block:

```ts
import { MOST_COMMON_ESTIMATE } from "./estimateBaseline.js";

/** Phase RW (spec §1.3): the pair a DURATION is priced against when the
 *  rower has no baseline. The recommend table's most common cell (2:25 /
 *  2:32 today), not its slowest: the table is slow-biased because a
 *  too-fast TARGET is harmful, and a duration estimate has no such
 *  asymmetry. Used for exactly one thing. It never resolves a target,
 *  never reaches the wire, never reaches a log; `src/
 *  assumedBaselinesCensus.test.ts` pins who may import it. */
export const ASSUMED_BASELINES: Baselines = MOST_COMMON_ESTIMATE;
```

In `app/domain/expand.ts`, replace the `estimateMinutes` overloads and body (from the comment block that begins `// Phase 6I: overloaded exactly like` through the closing `}` of the function) with:

```ts
/** Estimated minutes for `steps`. With baselines: time phases exact,
 *  distance phases at the resolved split (`estimated: true`). Without
 *  baselines (Phase RW PR A, spec §1.3/§4): distance phases price against
 *  `ASSUMED_BASELINES` and the result carries `assumed: true`, the flag
 *  every surface renders as `~`. Time-only workouts price exactly either
 *  way and are never marked. The phases built against the assumed pair
 *  are consumed HERE and only here: this function returns numbers, never
 *  a `Phase`, so no assumed `targetSplit` can reach `pieceList`, the
 *  compiler or a log (spec §9 item 8; the census test pins the importers). */
export function estimateMinutes(
  steps: Step[],
  baselines: Baselines | null,
): { minutes: number; estimated: boolean; assumed: boolean } {
  const pair = baselines ?? ASSUMED_BASELINES;
  let seconds = 0;
  let estimated = false;
  for (const p of phases(steps, pair)) {
    const s = phaseSeconds(p);
    if (s === null) continue;
    if (p.seconds === undefined) estimated = true;
    seconds += s;
  }
  return {
    minutes: Math.round(seconds / 60),
    estimated,
    assumed: baselines === null && estimated,
  };
}
```
Add `ASSUMED_BASELINES` to the `from "./pace.js"` import list in `expand.ts`, and delete the now-unused `needsBaselines` import there if `tsc` reports it unused (`phases()` still throws for a split ref under `null`; that throw and `needsBaselines` stay until PR B).

- [ ] **Step 4: Run the three files; then the whole unit + client suites**

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-rw/app && NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project unit domain/expand.test.ts domain/pace.test.ts && NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/assumedBaselinesCensus.test.ts && pnpm typecheck && pnpm test --project unit --project client 2>&1 | tail -8
```
Expected: the three files pass. The full run will FAIL on every existing `toStrictEqual({ minutes, estimated })` pin (it now needs `assumed: false`) and on the `draftMinutes`/`totals` null pins; list them with
`grep -rn "estimated: \(true\|false\)" domain src --include='*.test.ts' --include='*.test.tsx' | grep -v assumed` and add `assumed: false` to each (they all pass real baselines). Leave the `draftMinutes`/`totals` pins for Task 4. The census currently FAILS because `builderState.ts` does not import the constant yet: that is Task 4's job; note it and move on (the commit below is domain-only and its own three tests are green).

- [ ] **Step 5: Mutation probes (commit first)**

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-rw && git rev-parse --show-toplevel && git add app/domain/pace.ts app/domain/expand.ts app/domain/expand.test.ts app/domain/pace.test.ts app/src/assumedBaselinesCensus.test.ts && git commit -m "Phase RW PR A: estimateMinutes prices null baselines off ASSUMED_BASELINES and says so (assumed)"
```
Then, one at a time, with the expected failure recorded in the PR body:
1. In `pace.ts` change `MOST_COMMON_ESTIMATE` to `{ k2Seconds: 150, k6Seconds: 157 }` → `pace.test.ts` fails (`145` expected) AND `expand.test.ts` fails on `29` (received `30`) and `34` (received `35`).
2. In `expand.ts` change `assumed: baselines === null && estimated` to `assumed: estimated` → the "never marks a real-baseline estimate" test fails.
3. Add `import { ASSUMED_BASELINES } from "./pace.js";` to `domain/display/stepDetail.ts` (unused) → the census fails naming `domain/display/stepDetail.ts`.
Revert each with `git checkout -- <file>` after `git status` shows only that file changed.

---

### Task 2: Library rows read `~`, the caption, the filter guard

**Files:**
- Modify: `app/src/library/WorkoutRow.tsx:15-45` (prop + render)
- Modify: `app/src/library/Library.tsx:410-420` (caption) and `:466-475` (row props)
- Modify: `app/src/library/filters.ts:195-203` (drop the null guard)
- Modify: `app/src/index.css` (after `.library-count` rules, ~line 792)
- Test: `app/src/library/WorkoutRow.test.tsx:86-94, 244-252`
- Test: `app/src/library/Library.test.tsx:1000-1018`
- Test: `app/src/library/filters.test.ts` (one new case)

**Interfaces:**
- Consumes: `estimateMinutes(steps, baselines | null)` from Task 1.
- Produces: `WorkoutRow` props `durationMinutes: number; durationAssumed: boolean` (no longer nullable).

- [ ] **Step 1: Failing tests**

In `WorkoutRow.test.tsx`, replace the test `renders a — fallback when duration is unknown` with:

```ts
  it("marks an assumed-pace estimate with a tilde and leaves a real one bare", () => {
    const { rerender } = render(
      <MemoryRouter>
        <WorkoutRow workout={HOARFROST} durationMinutes={16} durationAssumed />
      </MemoryRouter>,
    );
    expect(screen.getByText("~16′")).toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <WorkoutRow
          workout={HOARFROST}
          durationMinutes={16}
          durationAssumed={false}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("16′")).toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });
```
In the second dash pin (`~line 250`, the structure-line test), change `durationMinutes={null}` in that test's render to `durationMinutes={30} durationAssumed={false}` and the assertion `expect(screen.getByText("—"))` to `expect(screen.getByText("30′"))`. Update every other `durationMinutes={null}` in the file the same way (grep: `grep -n "durationMinutes={null}" src/library/WorkoutRow.test.tsx`).

In `Library.test.tsx`, the test at ~line 1000 that mocks `useBaselines` with both sides `null`: replace its three assertions with:

```ts
    // Phase RW PR A: no baseline is no longer a dash. Time-only workouts
    // read exact, distance ones read the assumed estimate with a tilde,
    // and one caption explains the tilde.
    expect(screen.queryByText("—")).not.toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
    expect(
      screen.getByText("~ times are estimates until you set a baseline"),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/^~\d+′$/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^\d+′$/).length).toBeGreaterThan(0);
```
(The `WORKOUTS` fixture in that file must contain at least one distance workout and one time-only workout; read the fixture and, if it does not, add one distance workout to it in this step: `{ k: "w", duration: { kind: "distance", meters: 2000 }, ref: { base: "2k", off: 0 } }`.)
Add one more test in the same describe: with baselines SET, `screen.queryByText("~ times are estimates until you set a baseline")` is `null`.

In `filters.test.ts`, add:

```ts
  it("applies a bounded duration range with NO baselines, on the assumed estimate (Phase RW PR A)", () => {
    // 6000 m at the assumed 2:25 is 29 minutes: inside [25, 35], outside [0, 20].
    const sixK = workout("Six", [
      {
        k: "w",
        duration: { kind: "distance", meters: 6000 },
        ref: { base: "2k", off: 0 },
      },
    ]);
    const inRangeF = { ...clearFilters(), durationRange: { min: 25, max: 35 } };
    const outRangeF = { ...clearFilters(), durationRange: { min: 0, max: 20 } };
    expect(applyFilters([sixK], inRangeF, null)).toHaveLength(1);
    expect(applyFilters([sixK], outRangeF, null)).toHaveLength(0);
  });
```
using the file's own workout-fixture helper name (read the top of `filters.test.ts`; the helper at line ~28 builds a `LibraryWorkout` from steps; call it with that name and signature).

- [ ] **Step 2: Run to verify they fail**

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-rw/app && NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/library/WorkoutRow.test.tsx src/library/Library.test.tsx src/library/filters.test.ts 2>&1 | tail -12
```
Expected: FAIL (`~16′` not found; caption not found; `applyFilters` returns 1 for the out-of-range case because the null guard skips the filter).

- [ ] **Step 3: Implement**

`WorkoutRow.tsx`: change the props type to `durationMinutes: number; durationAssumed: boolean;` and the render to

```tsx
        <span className="workout-row-duration">
          {`${durationAssumed ? "~" : ""}${Math.round(durationMinutes)}′`}
        </span>
```
keeping the existing rounding comment above it and deleting the `"—"` branch.

`Library.tsx` rows:

```tsx
              <WorkoutRow
                workout={workout}
                durationMinutes={
                  estimateMinutes(workout.steps, baselines).minutes
                }
                durationAssumed={
                  estimateMinutes(workout.steps, baselines).assumed
                }
              />
```
`Library.tsx` caption: directly after the closing `</div>` of the `library-filter-row` (the div holding FILTER ⌄ and the count), add

```tsx
        {baselines === null && (
          <p className="library-caption">
            ~ times are estimates until you set a baseline
          </p>
        )}
```
`filters.ts`: change `if (!isUnbounded(f.durationRange) && baselines !== null) {` to `if (!isUnbounded(f.durationRange)) {` and rewrite the comment above it: `// Phase RW PR A: with no baseline the estimate is the assumed-pace one (estimateMinutes marks it), the SAME integer the row prints, so the filter and the row still agree.`

`index.css`, after `.library-count`'s rule:

```css
/* Phase RW PR A: one caption under the count while no baseline is set,
   explaining the ~ on distance rows. --ink-3 on --page: 6.69:1 (Gate 0). */
.library-caption {
  margin: 4px 0 0;
  color: var(--ink-3);
  font-size: 13px;
  line-height: 1.4;
}
```

- [ ] **Step 4: Run the three files, then the client project**

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-rw/app && NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/library && pnpm typecheck && pnpm lint
```
Expected: PASS. If `Library.tsx` calls `estimateMinutes` twice per row and lint complains about nothing, leave it; if you prefer one call, bind `const est = estimateMinutes(workout.steps, baselines);` inside the map callback.

- [ ] **Step 5: Commit, then probe**

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-rw && git rev-parse --show-toplevel && git add app/src/library app/src/index.css && git commit -m "Phase RW PR A: Library rows read ~ on assumed estimates, one caption, the time filter runs without a baseline"
```
Probes: (1) in `WorkoutRow.tsx` drop the `~` prefix → `~16′` test fails; (2) in `filters.ts` restore `&& baselines !== null` → the new filters test fails (`expected 0, received 1`). Revert each per RF22.

---

### Task 3: The detail header reads `~N MIN`

**Files:**
- Modify: `app/src/workout/WorkoutDetail.tsx:436-441`
- Test: `app/src/workout/WorkoutDetail.test.tsx` (new test beside the `4 MIN` one at ~line 1054)

- [ ] **Step 1: Failing test**

The file's harness is `mockHooks(baselines, workouts = [WORKOUT])` (line ~176) plus `renderDetail("/library/w1")` (line ~199); `NO_BASELINES` is `{ k2Seconds: null, k6Seconds: null }` (line ~130). Add a fixture beside `WORKOUT`:

```ts
const SIX_K_DISTANCE_WORKOUT: LibraryWorkout = {
  ...WORKOUT,
  id: "w-sixk-split",
  title: "Six K Split",
  steps: [
    {
      k: "w",
      duration: { kind: "distance", meters: 6000 },
      ref: { base: "2k", off: 0 },
    },
  ],
};
```
and the test, in the describe that pins the `4 MIN` header:

```ts
  it("reads ~N MIN off the assumed pair with no baseline (Phase RW PR A), never — MIN", async () => {
    // 6000 m at the assumed 2:25 2k (145 s/500 m) = 1740 s = 29 MIN.
    mockHooks(NO_BASELINES, [SIX_K_DISTANCE_WORKOUT]);
    await renderDetail("/library/w-sixk-split");
    expect(screen.getByText("~29 MIN", { exact: false })).toBeInTheDocument();
    expect(screen.queryByText("— MIN", { exact: false })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Verify it fails** (`— MIN` renders today).

- [ ] **Step 3: Implement**

```ts
  // Phase RW PR A: an assumed-pace estimate reads with a tilde; a time-only
  // workout prices exactly with or without a baseline.
  const minutesEstimate = estimateMinutes(workout.steps, baselines);
  const minutesLabel = `${minutesEstimate.assumed ? "~" : ""}${minutesEstimate.minutes} MIN`;
```

- [ ] **Step 4: Run** `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/workout/WorkoutDetail.test.tsx` → PASS.

- [ ] **Step 5: Commit** `git add app/src/workout && git commit -m "Phase RW PR A: the detail header reads ~N MIN without a baseline"`. Probe: drop the `~` → the new test fails.

---

### Task 4: Builder totals and `draftMinutes`

**Files:**
- Modify: `app/src/builder/builderState.ts:522-582` (`rowMinutes`, `totals`)
- Modify: `app/src/builder/Builder.tsx:307-310, 625-630`
- Modify: `app/src/session/draft.ts:205-226` (`draftMinutes`)
- Test: `app/src/builder/builderState.test.ts` (the `totals(f, null)).toBeNull()` pin at ~530 and the `not.toBeNull()` pins)
- Test: `app/src/builder/Builder.test.tsx` (the `— MIN` case near line 392)
- Test: `app/src/session/draft.test.ts:160-185`

**Interfaces:**
- Produces: `rowMinutes(row, baselines): { minutes: number; assumed: boolean }`; `totals(f, baselines): { loose: number; perSet: number; total: number; assumed: boolean }` (never `null`); `draftMinutes(d, baselines): number` (never `null`).

- [ ] **Step 1: Failing tests**

`builderState.test.ts`: replace `expect(totals(f, null)).toBeNull();` with

```ts
    // Phase RW PR A: a distance row with no baseline prices off the assumed
    // 2:25 2k and says so. 2000 m at 145 s/500 m = 580 s = 9.67 min.
    const t = totals(f, null);
    expect(t.assumed).toBe(true);
    expect(t.total).toBeCloseTo(9.67, 2);
```
(read that test's fixture first: if its distance row is not 2000 m at 2k, recompute the literal as `meters / 500 * 145 / 60`, or `meters / 500 * 152 / 60` for a 6k row, and write the number, not the formula). Add beside it: a time-only form with `null` baselines gives `assumed: false`.

`Builder.test.tsx`: find the test covering `— MIN` (comment near line 392) and change its expectation to a `~` total, e.g. `expect(screen.getByText(/^~\d+ MIN$/)).toBeInTheDocument()`; with baselines set the existing `TOTAL` test must still read a bare `N MIN`.

`draft.test.ts`: replace the two `toBeNull()` tests at ~164-180 with

```ts
  it("prices a distance workout with no baseline off the assumed pair (Phase RW PR A)", () => {
    const d = buildDraft(draftInputFor("Calm Sea", "id-calmsea-4"));
    // 10,000 m @ 6k+12 against the assumed 6k of 2:32 (152 s): 164 s/500 m
    // -> 20 * 164 = 3280 s -> 54.67 -> 55. (44 with this file's own
    // 2:00 6k baseline, the test above.)
    expect(draftMinutes(d, null)).toBe(55);
  });

  it("prices a time-based split-ref workout exactly with no baseline", () => {
    // Hoarfrost is 2 x (12:00 @ 6k+12, 5:00 rest): 34 minutes of clock
    // whatever the pace, so no baseline changes nothing.
    const d = buildDraft(draftInputFor("Hoarfrost", "id-hoarfrost-3"));
    expect(draftMinutes(d, null)).toBe(34);
    expect(draftMinutes(d, baselines)).toBe(34);
  });
```
If Hoarfrost's literal comes out 29 (the trailing rest not counted by `phases()`), the second test's TWO literals both change to 29: the point is equality across the two calls stated as literals, not the number 34.

- [ ] **Step 2: Verify they fail.**

- [ ] **Step 3: Implement**

`builderState.ts` `rowMinutes`:

```ts
function rowMinutes(
  row: BuilderRow,
  baselines: Baselines | null,
): { minutes: number; assumed: boolean } {
  const n = rowDurationNumber(row);
  if (n === null) return { minutes: 0, assumed: false };

  let minutes: number;
  let assumed = false;
  if (row.durUnit === "min") {
    minutes = n;
  } else {
    const ref: PaceRef = row.refEffort
      ? { effort: row.refEffort }
      : { base: row.refBase, off: row.refOff };
    // Phase RW PR A: no baseline prices the row off the assumed pair, the
    // same pair `estimateMinutes` uses, so the Builder's TOTAL and the
    // saved workout's Library row agree.
    minutes = (estimationSplit(baselines ?? ASSUMED_BASELINES, ref) * n) / 500 / 60;
    assumed = baselines === null;
  }
  // (keep the existing rest-minutes tail of the function, adding its
  // minutes to `minutes` exactly as today)
  return { minutes, assumed };
}
```
`totals`: return type `{ loose: number; perSet: number; total: number; assumed: boolean }`, no `null`; accumulate `assumed = assumed || r.assumed` across rows; delete the `if (minutes === null) return null;` line. Import `ASSUMED_BASELINES` from `../../domain/pace.js`.

`Builder.tsx`: `totalsResult` is never null now:
```tsx
  const repeatSubLine = `${pluralStep(rowsInSet)} · ${fmtMinutes(totalsResult.perSet)} per set`;
```
and the TOTAL cell:
```tsx
            {`${totalsResult.assumed ? "~" : ""}${Math.round(totalsResult.total)} MIN`}
```
`draft.ts`:
```ts
export function draftMinutes(d: SessionDraft, baselines: Baselines | null): number {
  return estimateMinutes(draftSteps(d), baselines).minutes;
}
```
and rewrite its doc comment: with no baseline the estimate is the assumed-pace one (`estimateMinutes`, Phase RW PR A).

- [ ] **Step 4: Run** the three test files, then `pnpm typecheck && pnpm lint && pnpm test --project unit --project client`. The census test from Task 1 now PASSES (builderState imports the constant).

- [ ] **Step 5: Commit** `git add app/src/builder app/src/session/draft.ts app/src/session/draft.test.ts && git commit -m "Phase RW PR A: Builder TOTAL and draftMinutes price off the assumed pair, ~ on the Builder"`. Probe: in `rowMinutes` set `assumed = false` unconditionally → the builderState test fails on `assumed`.

---

### Task 5: Today's placeholder retires

**Files:**
- Modify: `app/src/today/Today.tsx:236-250` (`toLibraryEntry`), `:284-293` (`durationsUnknown`)
- Modify: `app/domain/suggest.ts` (remove `durationsUnknown` from `SuggestPrefs`, `passesDurationFilter`, the reason text)
- Test: `app/domain/suggest.test.ts:230-260, 439` (the three `durationsUnknown` tests)
- Test: `app/src/today/Today.test.tsx` (any test setting `durationsUnknown`; grep)

- [ ] **Step 1: Failing test**

In `suggest.test.ts`, delete the three tests that set `durationsUnknown` (they test a field that no longer exists) and add one:

```ts
  it("filters on estMinutes whenever a bounded time range is set (no unknown-durations escape, Phase RW PR A)", () => {
    const short = entry({ id: "a", estMinutes: 10 });
    const long = entry({ id: "b", estMinutes: 60 });
    const out = suggest({
      ...basePrefs,
      durationRange: { min: 0, max: 20 },
      entries: [short, long],
    });
    expect(out.poolIds).toStrictEqual(["a"]);
  });
```
using that file's own `entry`/`basePrefs`-style helpers (read the file's top; use its names).

- [ ] **Step 2: Verify it fails to typecheck or run** (it passes only once the field is gone from the type; if it already passes, the mutation in Step 5 is the proof).

- [ ] **Step 3: Implement**

`suggest.ts`: remove the `durationsUnknown?: boolean;` field and its comment; `passesDurationFilter` becomes
```ts
function passesDurationFilter(e: LibraryEntry, prefs: SuggestPrefs): boolean {
  if (!prefs.durationRange || isUnbounded(prefs.durationRange)) return true;
  return inRange(e.estMinutes, prefs.durationRange);
}
```
and `timeChecked` drops `&& !prefs.durationsUnknown`. Rewrite the two comments that describe the 0 placeholder to say estimates are always known (Phase RW PR A).

`Today.tsx`: `estMinutes: estimateMinutes(w.steps, baselines).minutes,` and delete the `durationsUnknown: baselines === null,` line and the comment block above it; delete the `toLibraryEntry` comment sentences about the 0 placeholder. The card's own `estimateMinutes(recommended.steps, baselines!)` at ~1462 stays (it only renders with a baseline until PR C).

- [ ] **Step 4: Run** `pnpm typecheck && NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project unit domain/suggest.test.ts && NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/today` → PASS.

- [ ] **Step 5: Commit** `git add app/src/today app/domain/suggest.ts app/domain/suggest.test.ts && git commit -m "Phase RW PR A: Today's estMinutes placeholder and durationsUnknown retire"`. Probe: in `passesDurationFilter` return `true` unconditionally → the new suggest test fails (`["a","b"]`).

---

### Task 6: e2e, the capture, and the design pin

**Files:**
- Modify: `app/e2e/library.spec.ts` (one new test in the baseline-propagation describe)
- Modify: `app/e2e/design.spec.ts` (one structural pin)
- Modify: `app/e2e/screenshots.spec.ts` (one new capture `library-no-baseline`)
- Create: `docs/screenshots/library-no-baseline.png` (by `pnpm screenshots`)

- [ ] **Step 1: The e2e test**

In `library.spec.ts`'s baseline-propagation describe (it already has a reset-baselines helper), add:

```ts
  test("with no baseline, distance rows read ~N′, time rows read N′, and one caption explains it (Phase RW PR A)", async ({ page }) => {
    await signInViaBackdoor(page, { email: "library-no-baseline@e2e.test" });
    await page.goto("/library");
    await expect(
      page.getByText("~ times are estimates until you set a baseline"),
    ).toBeVisible();
    // Laminar is 1000-1000-1000 m at 6K+12: an assumed estimate. Sea Fret
    // is 2 × 4:00: exact. Both are seeded globals on every account.
    const laminar = page.locator(".workout-row").filter({ hasText: "Laminar" });
    await expect(laminar.locator(".workout-row-duration")).toHaveText(/^~\d+′$/);
    const seaFret = page.locator(".workout-row").filter({ hasText: "Sea Fret" });
    await expect(seaFret.locator(".workout-row-duration")).toHaveText(/^\d+′$/);
    await expect(page.getByText("—", { exact: true })).toHaveCount(0);
  });
```
(Use the search box if the rows are below the fold: `await page.getByPlaceholder("SEARCH BY NAME").fill("Laminar")` before the locator, then clear it for Sea Fret.)

- [ ] **Step 2: The design pin**

In `design.spec.ts`, near the other token-colour pins (grep `--ink-3` in the file for the idiom), add a test that signs in with no baseline, opens `/library`, and asserts `.library-caption`'s computed `color` equals the computed value of `--ink-3` (read both via `getComputedStyle`), and that the caption's font-size is `13px`. Mutation: change the CSS to `--ink-5` → fails.

- [ ] **Step 3: The capture**

In `screenshots.spec.ts` after the `library` capture, add:

```ts
// Phase RW PR A: the same screen with NO baseline, the state every new
// account lands on: exact minutes on time rows, ~ on distance rows, the
// caption under the count. Gate 0's approved render is the reference
// (docs/design/rw-gate0/library.png).
test("library-no-baseline", async ({ page }) => {
  await signInViaBackdoor(page, {
    email: "screenshots-library-no-baseline@e2e.test",
    name: "Screenshot Tester",
  });
  await page.goto("/library");
  await page.locator(".library-caption").waitFor();
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "library-no-baseline.png"),
  });
});
```

- [ ] **Step 4: Run the gates**

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-rw/app && pnpm e2e 2>&1 | tail -6 && pnpm screenshots 2>&1 | tail -3
```
Expected: e2e green; `docs/screenshots/library-no-baseline.png` created. Open it and check: at least one `~N′` and one `N′` row, the caption, no `—`. Check `git status` for other moved captures; any moved capture is either explained in the PR body or is a defect.

- [ ] **Step 5: Commit**

```bash
cd /Users/james/projects/github/jamesawesome/Ergomatic-wt-rw && git rev-parse --show-toplevel && git add app/e2e docs/screenshots/library-no-baseline.png && git commit -m "Phase RW PR A: e2e for ~ and the caption, the library-no-baseline capture, the caption's token pin"
```

---

### Task 7: The PR

- [ ] **Step 1: Push and open**

Body shape: line one "This PR …"; ~6 bullets; `<details>` Record with: head SHA, `gh pr diff --name-only`, each task's mutation and what its failure said, the mechanism note (Global Constraints) stated as a spec amendment made in Task 0, the census test as the containment gate, Gate 0's approval and record path, gates skipped and why (no PM final gate on PR A per the PM open gate's cut; no antagonist delta: the containment invariant is the one held claim §9 item 8 already covers, restated; no hardware). Include `library-no-baseline.png`.

- [ ] **Step 2: Review half** (inline shape per CLAUDE.md): dispatch the two-stage branch review; no PM gate; present the verdict and stop. No merge without James's word.
