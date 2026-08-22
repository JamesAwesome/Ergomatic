# Plan Prescriptions Implementation Plan

> **STATUS (2026-08-22).** UNPARKED by James ("let's do it") — Phase 8A is
> live work. Landed on main by the phase8-split PR. Still binding before
> execution: a verification refresh of every file/line citation in this
> document against current code (~25 merges since it was written, including
> Phase WU's warm-up removal). `ROADMAP.md` Phase 8A remains the authority on
> scope.

> **SCOPE NOTE (added 2026-08-12, after the PM holistic review).** Do NOT
> execute this plan as written. Six tasks were drafted; phase one (`ROADMAP.md`
> Phase 8A) is four. Delete Task 6 entirely, drop the `GET /api/today` half of
> Task 4, and drop `prescriptionForToday`/`PrescriptionContext`/`date?` from
> Task 1. Task 1 as written also CANNOT COMMIT: its test builds a `PlanPreset`
> with `key: "test-preset"` and `sessions: [{type}]` while `domain/plans.ts:5-9`
> still declares `key: "sprint" | "head"` and `sessions: PlanCode[]` until Task
> 2, and `.husky/pre-commit` runs a project-wide typecheck. Land the types with
> the plan data in one task and put `Prescription`/`PrescribedRef` in
> `domain/types.ts`. Two more corrections: §6's "worst case is a run of TWO" is
> false (head has a pre-existing run of three O2 at indices 12-14, verified),
> and the seed rename needs its own title write because `contentEqual`
> (`seed.ts:19-33`) ignores title. Full list:
> `docs/superpowers/specs/2026-08-12-plan-prescriptions-pm-review.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A plan day can pre-suggest a specific workout; the three plan checkpoints use it to pin the right test (sprint→2K Test, head→6K Test), which are renamed and reclassified honestly.

**Architecture:** Plan days become data (`{type, prescribe?}`) so the prescription is authored content rather than a hardcoded rule. One pure domain resolver answers "what is prescribed today" for BOTH suggestion callers (the Today screen and `GET /api/today`), and `suggest()` gains one optional input that pins the prescribed entry with filters bypassed. `PlanCode`'s `"TEST"` member retires entirely.

**Tech Stack:** TypeScript, pure `app/domain/` modules, Express 5 route, React 19 client, Vitest, Playwright, Drizzle (seed converge only — no migration).

**Spec:** `docs/superpowers/specs/2026-08-12-plan-prescriptions-design.md` (rev 2, James-approved, written after two antagonistic reviews). Read it before Task 1; every ruling below traces to a numbered section there.

## Global Constraints

- Worktree `.claude/worktrees/test-days`, branch `test-days`. `git rev-parse --show-toplevel` before every commit.
- `app/domain/**` is pure: no framework imports, relative imports carry `.js`, 100% coverage pinned.
- Titles are EXACTLY `6K Test` and `2K Test` (uppercase K, deliberate convention break, spec §7).
- Reason copy is EXACTLY `PLAN CHECKPOINT: row a 2K and set your baseline.` / `…a 6K…` — no em dashes anywhere in user-facing strings.
- Classification is EXACTLY: `2K Test` = AN / hard / pain 5; `6K Test` = AT / hard / pain 4 (spec §8).
- Precedence ladder (spec §4): a live pick beats a prescription; a future date-keyed producer would beat the plan's; a displaced lower tier is DROPPED with no note.
- The prescribed branch in `suggest()` runs BEFORE the `sorted.length === 0` early return (spec §3.3). Non-negotiable; a test pins it.
- No new drizzle migration. The seed converge handles both the content change and the rename.
- Every behavioral test self-mutates. `pnpm test`, never bare vitest (Node 26 webStorage trap). Read BOTH vitest summary lines — `Test Files` and `Tests` — a file that fails to LOAD reports zero tests while `Tests` still says passed.
- Gates per the briefing's table; `app/src/` changes mean `pnpm e2e` AND `pnpm screenshots`.

## File Structure

| File | Responsibility |
|---|---|
| `app/domain/prescription.ts` (new) | The `Prescription`/`PrescribedRef` types, the one resolver (`prescriptionForToday`), the plan producer (`planPrescription`), and the shared ref→workout lookup (`resolvePrescribed`). Nothing else in the codebase decides what is prescribed. |
| `app/domain/plans.ts` | `PlanDay`/`PlanPreset` shapes, `CHECKPOINT_INDICES`, and the authored checkpoint prescriptions. `PlanCode` deleted. |
| `app/domain/suggest.ts` | Accepts a prescribed entry and pins it. Loses the `TEST → TR` translation. |
| `app/domain/onboarding.ts` | The two titles (renamed). |
| `app/server/seed/library/onboarding.ts` | The two seed rows (reclassified). |
| `app/server/seed/seed.ts` | The legacy-title rename migration inside the existing converge. |
| `app/server/routes/data.ts` | `/api/today` wires the resolver; `PlanCode` → `WorkoutType`. |
| `app/src/today/Today.tsx` | Wires the resolver; drops the TEST→TR mapping; corrects the SHUFFLE `indexOf` comment. |
| `app/src/plan/Plan.tsx` | Uses shared `TypeBadge`; marks checkpoints from `planPrescription`. |
| `app/src/api/usePlan.ts`, `app/src/theme/tokens.css` | `PlanCode` → `WorkoutType`; `--type-test` removed. |

Five tasks: domain types+resolver, plan data, suggest, the two callers, then seed rename + docs/e2e/screenshots.

---

### Task 1: `domain/prescription.ts` — types, resolver, lookup

**Files:**
- Create: `app/domain/prescription.ts`
- Test: `app/domain/prescription.test.ts`

**Interfaces — Produces (every later task consumes these verbatim):**

```ts
export type PrescribedRef = { kind: "title"; title: string; globalOnly: boolean };
export interface Prescription { ref: PrescribedRef; reason: string }
export interface PrescriptionContext { plan: PlanPreset; sessionIndex: number; date?: string }
export function planPrescription(plan: PlanPreset, sessionIndex: number): Prescription | null;
export function prescriptionForToday(ctx: PrescriptionContext): Prescription | null;
export function resolvePrescribed<T extends { title: string; isGlobal: boolean }>(
  ref: PrescribedRef, workouts: readonly T[],
): T | null;
```

**Note on import direction:** this file imports `PlanPreset` from `./plans.js`, and Task 2 has `plans.ts` import `Prescription` from `./prescription.js`. That is a type-only cycle, which TypeScript and the bundler both allow — but if the implementer sees a runtime cycle warning, the fix is to move `Prescription`/`PrescribedRef` into `domain/types.ts` (where `WorkoutType` already lives) and have both files import from there. Report which shape you shipped.

- [ ] **Step 1: Write the failing test**

```typescript
// app/domain/prescription.test.ts
import { describe, expect, it } from "vitest";
import {
  planPrescription,
  prescriptionForToday,
  resolvePrescribed,
  type Prescription,
} from "./prescription.js";
import type { PlanPreset } from "./plans.js";

const REF = { kind: "title", title: "2K Test", globalOnly: true } as const;
const PRESCRIPTION: Prescription = {
  ref: REF,
  reason: "PLAN CHECKPOINT: row a 2K and set your baseline.",
};

// A two-day stand-in plan: day 0 plain, day 1 carrying a prescription. Built
// by hand rather than imported from PLANS so this file tests the MECHANISM,
// not the real presets' content (plans.test.ts owns that, Task 2).
const PLAN: PlanPreset = {
  key: "test-preset",
  title: "Test Preset",
  sessions: [{ type: "O2" }, { type: "AN", prescribe: PRESCRIPTION }],
};

describe("planPrescription", () => {
  it("returns the day's own prescription", () => {
    expect(planPrescription(PLAN, 1)).toStrictEqual(PRESCRIPTION);
  });

  it("returns null for a day with none", () => {
    expect(planPrescription(PLAN, 0)).toBeNull();
  });

  it("returns null for an index past the end rather than throwing", () => {
    expect(planPrescription(PLAN, 99)).toBeNull();
    expect(planPrescription(PLAN, -1)).toBeNull();
  });
});

describe("prescriptionForToday", () => {
  // Today it consults exactly one producer. The test asserts the CONTRACT
  // (whatever the highest-priority producer says), so adding a date-keyed
  // producer above the plan later changes this file's expectations
  // deliberately rather than silently.
  it("returns the plan's prescription when that is the only producer", () => {
    expect(prescriptionForToday({ plan: PLAN, sessionIndex: 1 })).toStrictEqual(
      PRESCRIPTION,
    );
  });

  it("returns null when no producer has anything for the day", () => {
    expect(prescriptionForToday({ plan: PLAN, sessionIndex: 0 })).toBeNull();
  });
});

describe("resolvePrescribed", () => {
  const rows = [
    { id: "g1", title: "2K Test", isGlobal: true },
    { id: "c1", title: "2K Test", isGlobal: false }, // a rower's own collision
    { id: "g2", title: "Sea Fret", isGlobal: true },
  ];

  it("finds the GLOBAL row when globalOnly, never the rower's own collision", () => {
    expect(resolvePrescribed(REF, rows)?.id).toBe("g1");
  });

  it("returns null when the title is absent", () => {
    expect(
      resolvePrescribed({ ...REF, title: "Nope" }, rows),
    ).toBeNull();
  });

  it("returns null rather than a custom row when globalOnly and only a custom exists", () => {
    const onlyCustom = [{ id: "c1", title: "2K Test", isGlobal: false }];
    expect(resolvePrescribed(REF, onlyCustom)).toBeNull();
  });

  it("accepts a non-global match when globalOnly is false", () => {
    const ref = { kind: "title", title: "2K Test", globalOnly: false } as const;
    expect(resolvePrescribed(ref, [rows[1]])?.id).toBe("c1");
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run from `app/`: `pnpm test --project unit` (check BOTH summary lines)
Expected: FAIL — `./prescription.js` does not exist.

- [ ] **Step 3: Implement**

```typescript
// app/domain/prescription.ts
import type { PlanPreset } from "./plans.js";

/** How a prescription names its workout. One member today; a reservation of
 *  a personal workout adds `{ kind: "id"; id: string }` and only
 *  `resolvePrescribed` grows a branch (spec §3.2). */
export type PrescribedRef = {
  kind: "title";
  title: string;
  globalOnly: boolean;
};

export interface Prescription {
  ref: PrescribedRef;
  /** The suggestion's reason line, authored WITH the prescription so no
   *  consumer ever branches on where it came from. */
  reason: string;
}

export interface PrescriptionContext {
  plan: PlanPreset;
  sessionIndex: number;
  /** The ROWER'S local date, for future date-keyed producers. Optional
   *  because the server has no date input; a date-needing producer is
   *  skipped when absent rather than guessing with the server clock. */
  date?: string;
}

/** The plan's own producer. Exported for its own tests and for the Plan
 *  screen's checkpoint marker. */
export function planPrescription(
  plan: PlanPreset,
  sessionIndex: number,
): Prescription | null {
  return plan.sessions[sessionIndex]?.prescribe ?? null;
}

/** THE one resolution point (spec §3.2). Both suggestion callers ask this
 *  and nothing else, so a second producer is added HERE, in precedence
 *  order, rather than at two call sites that would each have to invent it.
 *
 *  Precedence (spec §4, James's ruling): a live pick beats every
 *  prescription and is handled by `suggest()` itself, ABOVE this function.
 *  Within prescriptions: a future date-keyed producer would be consulted
 *  first, then the plan. A displaced lower tier is simply dropped. */
export function prescriptionForToday(
  ctx: PrescriptionContext,
): Prescription | null {
  return planPrescription(ctx.plan, ctx.sessionIndex);
}

/** A ref to a real workout, or null. Shared by BOTH suggestion callers so
 *  the lookup exists exactly once. `globalOnly` is what stops a rower's own
 *  workout that happens to share a designated title from being prescribed
 *  in place of the seed (the same hazard `Today.tsx`'s own k6/k2 lookups
 *  guard with `isGlobal`). */
export function resolvePrescribed<
  T extends { title: string; isGlobal: boolean },
>(ref: PrescribedRef, workouts: readonly T[]): T | null {
  return (
    workouts.find(
      (w) => w.title === ref.title && (!ref.globalOnly || w.isGlobal),
    ) ?? null
  );
}
```

- [ ] **Step 4: Run it, verify green** — `pnpm test --project unit`, both summary lines.
- [ ] **Step 5: Self-mutations** (break, run, confirm FAIL, restore by re-applying the edit — never `git checkout` on a file with uncommitted work, it has clawed back edits twice in this repo):
  1. Drop `!ref.globalOnly ||` from `resolvePrescribed` → the custom-collision test fails.
  2. Return `plan.sessions[sessionIndex].prescribe` without `?.`/`?? null` → the out-of-range test fails (throws).
  3. Make `prescriptionForToday` return `null` unconditionally → its first test fails.
- [ ] **Step 6: Read the per-file coverage** for `prescription.ts` from the HTML report (`app/coverage/`), confirm 100×4, and commit.

```bash
git rev-parse --show-toplevel   # must print the test-days worktree
git add app/domain/prescription.ts app/domain/prescription.test.ts
git commit -m "feat: the prescription seam — one resolver, one shared lookup"
```

---

### Task 2: plan days carry prescriptions; `PlanCode` retires

**Files:**
- Modify: `app/domain/plans.ts`, `app/domain/plans.test.ts`
- Modify (mechanical `PlanCode` → `WorkoutType`): `app/server/routes/data.ts:6,934`, `app/src/api/usePlan.ts:3,9`, `app/src/session/LogSession.test.tsx:14,231`
- Modify: `app/src/plan/Plan.tsx` (drops `CODE_COLOR_VAR`/`CodeBadge`), `app/src/plan/Plan.test.tsx` if it asserts the local badge
- Modify: `app/src/theme/tokens.css` (`--type-test` removed), `docs/design/DEVIATIONS.md:56`

**Interfaces — Produces:**

```ts
export interface PlanDay { type: WorkoutType; prescribe?: Prescription }
export interface PlanPreset { key: string; title: string; sessions: PlanDay[] }
export const CHECKPOINT_INDICES: readonly number[]; // [6, 34, 62]
export const PLANS: Record<"sprint" | "head", PlanPreset>;
// `PlanCode` NO LONGER EXISTS.
```

- [ ] **Step 1: Write the failing tests** — replace `plans.test.ts`'s TEST-specific assertions:

```typescript
// Replaces `it("places exactly three TESTs at 6, 34, 62")`.
it("each checkpoint index is a typed day carrying its plan's own test prescription", () => {
  const expected = {
    sprint: { type: "AN", title: "2K Test" },
    head: { type: "AT", title: "6K Test" },
  } as const;
  for (const key of ["sprint", "head"] as const) {
    for (const i of CHECKPOINT_INDICES) {
      const day = PLANS[key].sessions[i];
      expect(day.type, `${key}[${i}]`).toBe(expected[key].type);
      expect(day.prescribe?.ref.title, `${key}[${i}]`).toBe(expected[key].title);
      expect(day.prescribe?.ref.globalOnly, `${key}[${i}]`).toBe(true);
      expect(day.prescribe?.reason, `${key}[${i}]`).toContain("PLAN CHECKPOINT");
    }
  }
});

it("no other day carries a prescription", () => {
  for (const key of ["sprint", "head"] as const) {
    PLANS[key].sessions.forEach((day, i) => {
      if (CHECKPOINT_INDICES.includes(i)) return;
      expect(day.prescribe, `${key}[${i}]`).toBeUndefined();
    });
  }
});

// Authored content fails CI rather than vanishing at runtime (spec §6).
it("every prescribed ref resolves against the real global seed", () => {
  for (const key of ["sprint", "head"] as const) {
    for (const day of PLANS[key].sessions) {
      if (!day.prescribe) continue;
      const hit = resolvePrescribed(
        day.prescribe.ref,
        GLOBAL_LIBRARY_SEED.map((w) => ({ ...w, isGlobal: true })),
      );
      expect(hit, `${key}: ${day.prescribe.ref.title}`).not.toBeNull();
    }
  }
});
```

And update the existing tallies — these exact numbers were computed against the real presets and independently re-derived by the engineer review:

```typescript
expect(tally(PLANS.sprint.sessions.map((d) => d.type))).toStrictEqual({
  O2: 34, AT: 23, TR: 14, AN: 13,
});
expect(tally(PLANS.head.sessions.map((d) => d.type))).toStrictEqual({
  O2: 41, AT: 24, TR: 11, AN: 8,
});
```

Every other existing test in this file (`CODES`, the ≤3-in-a-row run rule, the sprint back-half bias, week-template uniqueness) keeps its subject but now reads `.map((d) => d.type)` where it read the raw array. **Do not weaken any of them** — the run rule and the bias check are exactly the invariants the type overwrite could have broken (they hold: worst run is 2; bias margin narrows 6→5).

- [ ] **Step 2: Run, verify failure** — `pnpm test --project unit`.
- [ ] **Step 3: Implement `plans.ts`**

```typescript
import type { WorkoutType } from "./types.js";
import type { Prescription } from "./prescription.js";
import { ONBOARDING_TITLES } from "./onboarding.js";

export interface PlanDay {
  type: WorkoutType;
  /** Pre-suggested workout for this day. AUTHORED DATA: the three
   *  checkpoints populate it today, and a future authoring UI writes this
   *  same field (spec §3.1). */
  prescribe?: Prescription;
}

export interface PlanPreset {
  key: string; // an opaque preset key today, a plan id tomorrow
  title: string;
  sessions: PlanDay[]; // length 84
}

/** Start-of-block checkpoints, one per training third. Promoted from the
 *  old private `TEST_INDICES` because `Plan.tsx` and the tests now name it. */
export const CHECKPOINT_INDICES = [6, 34, 62] as const;

function checkpoint(distance: "2K" | "6K"): Prescription {
  return {
    ref: {
      kind: "title",
      title: distance === "2K" ? ONBOARDING_TITLES.k2 : ONBOARDING_TITLES.k6,
      globalOnly: true,
    },
    reason: `PLAN CHECKPOINT: row a ${distance} and set your baseline.`,
  };
}

/** Flattens 12 week-arrays (7 codes each = 84) into PlanDays, then makes
 *  each checkpoint a day of the plan's own checkpoint TYPE carrying its
 *  test prescription. Was: splice in a `"TEST"` code (retired, spec §6). */
function buildSessions(
  weeks: WorkoutType[][],
  checkpointType: WorkoutType,
  distance: "2K" | "6K",
): PlanDay[] {
  const days: PlanDay[] = weeks.flat().map((type) => ({ type }));
  for (const i of CHECKPOINT_INDICES) {
    days[i] = { type: checkpointType, prescribe: checkpoint(distance) };
  }
  return days;
}
```

with `PLANS.sprint` calling `buildSessions(SPRINT_WEEKS, "AN", "2K")` and `PLANS.head` calling `buildSessions(HEAD_WEEKS, "AT", "6K")`. **Reconcile the header comments** in this file: they currently state "Type mix across the 81 non-TEST sessions is pinned: O2 34, AT 23, TR 14, AN 10" — now 84 typed days with the tallies above (a stale comment is a defect here, recurring-failure #9's cousin).

- [ ] **Step 4: The mechanical `PlanCode` deletions.** Delete the alias; change each site to `WorkoutType`: `server/routes/data.ts:6` (import) and `:934` (annotation), `src/api/usePlan.ts:3` (import) and `:9` (`PlanSequenceItem.code`), `src/session/LogSession.test.tsx:14` (import) and `:231` (cast). Then `Plan.tsx`: delete `CODE_COLOR_VAR` and the local `CodeBadge`, render the shared `TypeBadge`, and mark a checkpoint from `planPrescription(plan, i) !== null` — **grep `CodeBadge` and `--type-test` across `src/` and `e2e/` first**; each hit is a deliberate update. Remove `--type-test` from `tokens.css` and reword `docs/design/DEVIATIONS.md:56`, which cites that token while justifying a still-live claim about `--type-tr`.
- [ ] **Step 5: Green** — `pnpm test --project unit --project client`, then `pnpm typecheck` (this is the step that catches a missed `PlanCode` site).
- [ ] **Step 6: Self-mutations:** (a) point sprint's checkpoint at the 6K ref → the checkpoint test fails; (b) drop the `prescribe` from one checkpoint → both the checkpoint test and the resolve-against-seed test fail; (c) change a checkpoint type to `O2` → the tally test fails.
- [ ] **Step 7: Commit.**

```bash
git rev-parse --show-toplevel
git add app/domain/plans.ts app/domain/plans.test.ts app/server/routes/data.ts app/src/api/usePlan.ts app/src/session/LogSession.test.tsx app/src/plan/Plan.tsx app/src/theme/tokens.css docs/design/DEVIATIONS.md
git commit -m "feat: plan days carry prescriptions; the TEST code retires"
```

---

### Task 3: `suggest()` pins a prescribed entry

**Files:**
- Modify: `app/domain/suggest.ts`, `app/domain/suggest.test.ts`

**Interfaces — Consumes** Task 1's `Prescription`. **Produces:**

```ts
export interface SuggestInput {
  todayCode: WorkoutType;          // was PlanCode
  library: LibraryEntry[];
  prefs: SuggestPrefs;
  todayPickId?: string;
  prescribed?: { entry: LibraryEntry; reason: string } | null;  // NEW
}
```

- [ ] **Step 1: Write the failing tests.** Delete `it("treats TEST as TR")` (`suggest.test.ts:53-64`) — its behaviour no longer exists — and add:

```typescript
const PRESCRIBED_ENTRY: LibraryEntry = {
  id: "p1", type: "AN", difficulty: "hard", pain: 5,
  estMinutes: 8, lastDoneDaysAgo: null, isGlobal: true,
};
const PRESCRIBED = { entry: PRESCRIBED_ENTRY, reason: "PLAN CHECKPOINT: row a 2K and set your baseline." };

it("a prescribed entry is the pick, with its own reason", () => {
  const s = suggest({ todayCode: "AN", library: [AN_A, AN_B], prefs: ALL_PREFS, prescribed: PRESCRIBED });
  expect(s.recommendationId).toBe("p1");
  expect(s.reason).toBe(PRESCRIBED.reason);
});

it("survives every preference filter that would exclude it", () => {
  // difficulty, time cap, pain, last-done and source each on their own —
  // a prescribed workout is not a suggestion from a pool (spec §3.3).
  const cases: SuggestPrefs[] = [
    { ...ALL_PREFS, difficulties: ["easy"] },
    { ...ALL_PREFS, durations: ["60+"] },
    { ...ALL_PREFS, painLevels: [1] },
    { ...ALL_PREFS, lastDone: "under21" },
    { ...ALL_PREFS, source: "custom" },
  ];
  for (const prefs of cases) {
    const s = suggest({ todayCode: "AN", library: [AN_A], prefs, prescribed: PRESCRIBED });
    expect(s.recommendationId, JSON.stringify(prefs)).toBe("p1");
  }
});

it("survives an EMPTY type-matched pool — the ordering rule", () => {
  // The `sorted.length === 0` early return fires from the pool alone. If the
  // prescribed check sat after it (where todayPickId's does), a library with
  // no AN workouts would read "No AN sessions in your library" on the one
  // day the checkpoint matters most (spec §3.3, engineer finding B4).
  const s = suggest({ todayCode: "AN", library: [O2_ONLY], prefs: ALL_PREFS, prescribed: PRESCRIBED });
  expect(s.recommendationId).toBe("p1");
  expect(s.reason).toBe(PRESCRIBED.reason);
  expect(s.poolIds).toStrictEqual([]);
});

it("a live pick BEATS the prescription — tier 1 over tier 3", () => {
  const s = suggest({ todayCode: "AN", library: [AN_A, AN_B], prefs: ALL_PREFS, todayPickId: AN_B.id, prescribed: PRESCRIBED });
  expect(s.recommendationId).toBe(AN_B.id);
  expect(s.reason).not.toBe(PRESCRIBED.reason);
});

it("poolIds stays the day's own type pool, and fellBack keeps its pool meaning", () => {
  const s = suggest({ todayCode: "AN", library: [AN_A, AN_B], prefs: { ...ALL_PREFS, difficulties: ["easy"] }, prescribed: PRESCRIBED });
  expect(s.poolIds).toStrictEqual([AN_A.id, AN_B.id].sort()); // adjust to byLeastRecentlyDone order
  expect(s.fellBack).toBe(true); // the filter matched nothing; the pool fell back
});

it("a null prescription leaves the ordinary path byte-identical", () => {
  const withNull = suggest({ todayCode: "AN", library: [AN_A, AN_B], prefs: ALL_PREFS, prescribed: null });
  const without = suggest({ todayCode: "AN", library: [AN_A, AN_B], prefs: ALL_PREFS });
  expect(withNull).toStrictEqual(without);
});
```

Fixtures (`AN_A`, `AN_B`, `O2_ONLY`, `ALL_PREFS`) follow the file's own existing conventions — read them first and reuse, don't invent parallel ones.

- [ ] **Step 2: Run, verify failure.**
- [ ] **Step 3: Implement.** `matchType` collapses to `const matchType = todayCode;` (delete the TEST ternary and inline it if the variable earns nothing). Insert the prescribed branch **immediately after `poolIds` is computed and BEFORE the `sorted.length === 0` return**:

```typescript
  // Precedence (spec §4): a live pick outranks a prescription, so a
  // todayPickId that names a real pool member wins here; otherwise a
  // prescription is the pick, filters already bypassed by construction
  // (it never went through `filtered`). Placed above the empty-pool return
  // deliberately — that return keys off the pool alone, and a checkpoint
  // must survive a library with none of the day's own type.
  const livePick = todayPickId
    ? sorted.find((e) => e.id === todayPickId)
    : undefined;
  if (prescribed && !livePick) {
    return {
      recommendationId: prescribed.entry.id,
      reason: prescribed.reason,
      poolIds,
      fellBack,
    };
  }
```

then leave the existing empty-pool return and pick logic untouched below it, reusing `livePick` where it currently recomputes `pickOverride`.

- [ ] **Step 4: Green** — `pnpm test --project unit`.
- [ ] **Step 5: Self-mutations:** (a) move the prescribed block BELOW the empty-pool return → the empty-pool test fails (this is the mutation that proves the ordering rule is load-bearing); (b) drop `&& !livePick` → the tier-1 test fails; (c) return `buildReason(...)` instead of `prescribed.reason` → the reason test fails.
- [ ] **Step 6: Commit** (`feat: suggest pins a prescribed workout, filters bypassed`).

---

### Task 4: both callers wire the resolver

**Files:**
- Modify: `app/src/today/Today.tsx`, `app/src/today/Today.test.tsx`
- Modify: `app/server/routes/data.ts` (the `/api/today` handler), `app/server/routes/data.test.ts`

**Interfaces — Consumes** Tasks 1-3.

- [ ] **Step 1: Write the failing client tests.** First DELETE/REWRITE the five existing TEST-semantics tests the spec enumerates (`Today.test.tsx`'s `PLAN_TEST` fixture at `:147-150` and its consumers at `:1426-1445`, `:1448-1460`, `:1540-1544`) — their subject ("TR reads active on a TEST day", "TEST → AN", "TR's descriptor") is deleted behaviour, not cosmetics. Replace with a checkpoint fixture (`buildSequence` with a real prescription at the current index) and:

```typescript
it("a checkpoint day shows the plan's own test, with the checkpoint reason", async () => {
  // sprint → 2K Test. Real seed row via the library fixture, not a hand-built
  // entry (recurring-failure #3).
  renderToday({ plan: SPRINT_AT_CHECKPOINT, library: LIBRARY_WITH_ONBOARDING });
  expect(await screen.findByText("2K Test")).toBeVisible();
  expect(screen.getByText(/PLAN CHECKPOINT/)).toBeVisible();
});

it("the head plan shows the 6K where sprint shows the 2K", async () => { /* same shape, HEAD_AT_CHECKPOINT */ });

it("SHUFFLE escapes to poolIds[0] — the prescribed entry is not a pool member", async () => {
  // Deliberate, not incidental: `pool.indexOf(prescribedId)` is -1 and the
  // handler's `-1 ? 0` fallback is what lands this (Today.tsx:1009-1017).
  renderToday({ plan: SPRINT_AT_CHECKPOINT, library: LIBRARY_WITH_ONBOARDING });
  await userEvent.click(screen.getByRole("button", { name: "SHUFFLE ↻" }));
  expect(screen.queryByText("2K Test")).not.toBeInTheDocument();
  expect(screen.getByText(FIRST_AN_TITLE)).toBeVisible();
});

it("a reload before SHUFFLE shows the checkpoint again", async () => { /* remount, assert 2K Test */ });

it("a library missing the seed degrades to an ordinary suggestion, not an empty card", async () => {
  renderToday({ plan: SPRINT_AT_CHECKPOINT, library: LIBRARY_WITHOUT_ONBOARDING });
  expect(await screen.findByText(FIRST_AN_TITLE)).toBeVisible();
});
```

Plus a server test in `data.test.ts`: `/api/today` on a checkpoint day returns the test workout's id and the checkpoint reason; on a non-checkpoint day it does not.

- [ ] **Step 2: Run, verify failure.**
- [ ] **Step 3: Implement both callers.** Each does the same three steps, sharing the domain helpers:

```typescript
// client (Today.tsx) — `library` here is the FULL list, before the
// onboarding exclusion that builds `entries`.
const prescription = prescriptionForToday({ plan: PLANS[plan.planKey], sessionIndex: plan.doneN });
const prescribedRow = prescription ? resolvePrescribed(prescription.ref, library) : null;
const prescribed = prescription && prescribedRow
  ? { entry: toLibraryEntry(prescribedRow, baselines), reason: prescription.reason }
  : null;
// ...then pass `prescribed` into the existing suggest() call.
```

The server mirrors it against `workouts` (which it already has, unfiltered, before building `library`). Also in `Today.tsx`: delete `effectivePrescribed`'s `"TEST" → "TR"` ternary, and **correct the SHUFFLE comment at `:1009-1017`** — "the same invariant means `currentId` is always one of `pool`'s own members, so `indexOf` never actually returns -1 here" is now FALSE on a checkpoint's first SHUFFLE; say so and name the `-1 → 0` fallback as the intended escape.

- [ ] **Step 4: Green** — unit + client, then the server's own project.
- [ ] **Step 5: Self-mutations:** (a) pass `prescribed: null` always in the client → the checkpoint test fails; (b) resolve the ref against `entries` instead of the full `library` → the checkpoint test fails (the exclusion hides it), which is exactly why the spec resolves against the full list; (c) omit the wiring in the server route → the `data.test.ts` case fails.
- [ ] **Step 6: Full gates for `app/src/`** — lint, typecheck, format:check, unit+client, `pnpm e2e`. Commit.

---

### Task 5: the rename, its migration, and the visual record

**Files:**
- Modify: `app/domain/onboarding.ts`, `app/domain/onboarding.test.ts`
- Modify: `app/server/seed/library/onboarding.ts`, `app/server/seed/library/onboarding.test.ts`
- Modify: `app/server/seed/seed.ts` + its test
- Modify: `app/src/today/BaselineCard.test.tsx:28-29,93,106`, `app/e2e/onboarding.spec.ts:28-29`, `app/e2e/library.spec.ts:460-461`, comments at `app/server/routes/data.ts:947` and `app/server/routes/data.test.ts:1955,1980`
- Modify: `app/e2e/today.spec.ts` (the checkpoint flow), `app/e2e/screenshots.spec.ts`, `docs/screenshots/`

- [ ] **Step 1: Write the failing seed-migration test** (in the seed's own test file, matching its existing harness):

```typescript
it("renames a legacy-titled global row IN PLACE, keeping its id and its log links", async () => {
  // The converge is keyed by title: a title missing from code is DELETED and
  // session_logs.workout_id nulls via ON DELETE SET NULL. Renaming without
  // this map would silently break the link on any log already recorded
  // against "First 6k" (spec §7).
  const before = await seedAndGetGlobal("First 6k"); // seeded with the OLD title
  await seedGlobalLibrary();
  const after = await getGlobalByTitle("6K Test");
  expect(after.id).toBe(before.id);
  expect(await getGlobalByTitle("First 6k")).toBeUndefined();
});

it("still deletes a title genuinely removed from code", async () => { /* not in the legacy map */ });
it("is idempotent: a second boot changes nothing", async () => { /* row count + ids stable */ });
```

- [ ] **Step 2: Run, verify failure. Step 3: Implement** — the titles in `onboarding.ts` (`k6: "6K Test"`, `k2: "2K Test"`), the reclassification in `server/seed/library/onboarding.ts` (2K: AN/hard/5; 6K: AT/hard/4), and in `seed.ts`, BEFORE the delete pass:

```typescript
/** One-time title migrations. The converge is keyed by title, so a renamed
 *  seed would otherwise be deleted-and-reinserted, nulling the FK on every
 *  log already recorded against it. A legacy row present in the DB whose new
 *  title is absent gets its title updated in place instead. */
const LEGACY_TITLE_RENAMES: Record<string, string> = {
  "First 6k": "6K Test",
  "First 2k": "2K Test",
};
```

Also add the classification pins to `onboarding.test.ts` (it pins neither field today, so a future edit cannot quietly re-soften them).

- [ ] **Step 4: Green** — unit + client + integration (the seed test needs Docker).
- [ ] **Step 5: Self-mutations:** (a) remove the legacy map → the rename test fails (row id changes); (b) apply the map AFTER the delete pass → the same test fails; (c) revert one classification field → the new onboarding pin fails.
- [ ] **Step 6: e2e + screenshots.** Add the checkpoint flow to `today.spec.ts`: choose the sprint plan, **advance `doneN` six times via six `POST /api/logs`** (the only way it moves — `PUT /api/plan` accepts just `{planKey}`/`{reset}`), then assert the card shows `2K Test`, START works, and SHUFFLE escapes. Capture `today-checkpoint.png`, open it, describe it. Recapture anything showing the old titles.
- [ ] **Step 7: Full gates + commit.**

---

## Self-review (run by the plan's author, recorded)

**Spec coverage:** §2 (AT rationale) → Task 5's classification; §3.1 → Task 2; §3.2 → Task 1; §3.3 → Task 3; §4's ladder → Task 3's tier-1 test; §5 both callers → Task 4; §6 plan data + tallies + authored-ref test → Task 2; §7 rename + migration → Task 5; §8 classification → Task 5; §9 no-baseline/freestyle → untouched by construction, asserted by the existing BaselineCard tests staying green (Task 5 updates only their title literals); §10 deletions → Task 2; §11 file list → distributed across all five, every named file appears; §12 deferrals → no task, by design; §13 testing → each task's own steps.

**Placeholder scan:** no TBDs. Two places name a judgement rather than a literal — the `poolIds` order in Task 3's fixture assertion ("adjust to byLeastRecentlyDone order") and the import-cycle fallback in Task 1 — both are flagged as decisions with a stated fallback, not gaps.

**Type consistency:** `Prescription`/`PrescribedRef`/`PrescriptionContext`/`planPrescription`/`prescriptionForToday`/`resolvePrescribed` are spelled identically in Tasks 1, 2 and 4; `PlanDay`/`PlanPreset`/`CHECKPOINT_INDICES` identically in Tasks 2 and 4; `prescribed?: { entry, reason }` identically in Tasks 3 and 4.

---

### Task 6: capture "was the suggestion taken?" on every log

**Files:**
- Modify: `app/server/db/schema.ts` (two nullable columns), `app/drizzle/` (one generated migration)
- Modify: `app/server/routes/data.ts` (`POST /api/logs` accepts and stores them), `app/server/routes/data.test.ts`
- Modify: `app/server/stores/logs.ts` + its contract tests if the insert shape is typed there
- Modify: `app/src/session/LogSession.tsx` (sends them), `app/src/session/LogSession.test.tsx`

**Interfaces — Produces:** `session_logs.suggested_title text NULL`, `session_logs.suggestion_taken boolean NULL`; `POST /api/logs` accepts both as optional fields.

**Why this task exists (spec §11b):** the screen can come whenever, but the data cannot be backfilled — every day shipped without capture is permanently missing from the history James asked for. Capture only; NO UI, and nothing is surfaced on the day (his displaced-note ruling governs the moment).

- [ ] **Step 1: check for a competing migration index before generating anything.** `gh pr list --state open` and inspect any branch that touches `app/drizzle/`. Two branches minting the same index means whoever merges second regenerates (briefing rule, and it has bitten this repo). Record what you found.
- [ ] **Step 2: Write the failing server test** in `data.test.ts`'s own harness:

```typescript
it("stores what was suggested and whether the rower took it", async () => {
  const res = await post("/api/logs", {
    ...validLogBody,
    suggestedTitle: "2K Test",
    suggestionTaken: false,
  });
  expect(res.status).toBe(201);
  const row = await getLatestLog(userId);
  expect(row.suggestedTitle).toBe("2K Test");
  expect(row.suggestionTaken).toBe(false);
});

it("accepts a log with neither field — existing clients and outside-plan logs", async () => {
  const res = await post("/api/logs", validLogBody);
  expect(res.status).toBe(201);
  const row = await getLatestLog(userId);
  expect(row.suggestedTitle).toBeNull();
  expect(row.suggestionTaken).toBeNull();
});

it("rejects a non-boolean suggestionTaken rather than coercing it", async () => {
  const res = await post("/api/logs", { ...validLogBody, suggestionTaken: "yes" });
  expect(res.status).toBe(400);
});
```

- [ ] **Step 3: Run, verify failure. Step 4: Implement** — the two columns (nullable, no default, mirroring `device_name`'s own convention at `schema.ts:112-121`), `pnpm db:generate`, the route's validation (optional, typed, no coercion), and the store's insert shape.
- [ ] **Step 5: Client** — `LogSession.tsx` sends `suggestedTitle` (the suggestion in force when the session started) and `suggestionTaken` (whether the logged workout is that one). Read how the screen already learns what it is logging before wiring: if the displaced suggestion is not available at that point, say so in your report rather than inventing a channel for it — that is a real finding about the seam, not a detail to paper over.
- [ ] **Step 6: Self-mutations:** (a) drop the nullable-ness → the neither-field test fails; (b) coerce `"yes"` to true → the rejection test fails; (c) always send `suggestionTaken: true` from the client → the client test that logs a shuffled-to workout fails.
- [ ] **Step 7: Full gates** including integration (Docker) for the migration, plus `pnpm e2e`. Commit.
