# Phase DE PR 1 — Remove Difficulty Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A rower can see, set, filter or import a difficulty nowhere, while every installed pre-PR-1 build keeps working against the new server for one tag cycle.

**Architecture:** Deletion sweep in three layers, each gated by typecheck plus a grep that must go to zero. The domain loses the `Difficulty` type and the `WorkoutInput.difficulty` field; the client loses every chip, filter group, preference and draft field; the server keeps the Postgres column, enum and `preferences.difficulties` untouched as read-only compat, writing a difficulty DERIVED from the 1–5 figure at all four store write sites so old builds (which call `difficulty.toUpperCase()`) never see NULL. The bulk grammar's header drops to three fields with the two legacy forms still accepted. The seed's AT and TR blocks are stably re-sorted so the within-type order rule survives on the surviving axis.

**Tech Stack:** TypeScript, React 19, Express 5, Drizzle (schema untouched — no migration), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-05-difficulty-out-effort-in-design.md` — §3 is this PR; §2 the census; §8 the vetted ground. Read it first.

**Shape (spoken):** inline implementation by the controller, task-sized commits, failing tests first, review half dispatched (Task 8). TRIAD (stored shape, compat write): PM final gate on the PR; antagonist anchor pass already ran on the spec — no delta pass unless a task invents something §3 does not describe.

## Global Constraints

- **No migration.** `server/db/schema.ts` is not edited. `workouts.difficulty` stays NOT NULL; `preferences.difficulties` stays. Any diff to `schema.ts` or `drizzle/` fails the PR.
- **API additive-only:** workout responses keep carrying `difficulty`; `GET /api/prefs` keeps carrying `difficulties`; `PUT /api/prefs` keeps validating `difficulties` when present; `difficulty` on any workout write is ignored, never rejected.
- **Server-private compat type lives in ONE module**, `server/compat/difficulty.ts`, with the PR 3 removal comment (RF29 — the ROADMAP row exists).
- **The identifier stays `pain` in this PR** (PR 2 renames); only the bulk header's canonical word says `effort`.
- **Copy:** no em-dashes in user-facing strings. `EFFORT` is not introduced anywhere a rower reads in this PR except the bulk header help.
- **Gates per task:** `pnpm typecheck`, `pnpm lint`, the scoped tests named in the task; before the PR is ready, `pnpm test`, `pnpm test:coverage` per-file check on touched files, `pnpm build && pnpm dist:grep`, `pnpm e2e`, `pnpm screenshots`. All commands run in `app/` of the worktree `/Users/james/projects/github/jamesawesome/Ergomatic-wt-de1`.
- **Every commit:** `git rev-parse --show-toplevel` prints the worktree path first.
- **The finishing grep**, run in `app/` and pasted into the PR body:
  ```sh
  grep -rnwiE 'difficulty|difficulties' domain src e2e scripts --exclude='*.test.*'
  ```
  must return ONLY `src/news/content/releaseNotes.ts` (history) after Task 7. Under `server/`, only `server/compat/difficulty.ts`, `server/stores/workouts.ts`, `server/stores/preferences.ts`, `server/testing/fakes.ts`, `server/db/schema.ts` and the prefs route in `server/routes/data.ts` may match.

---

## File Structure

| File | Responsibility after PR 1 |
| --- | --- |
| `domain/types.ts` | `Difficulty` gone; `WorkoutInput` = title, type, pain, steps |
| `domain/validate.ts` | no difficulty check |
| `domain/bulk.ts` | header `title \| TYPE \| effort` (3) plus legacy 4/5 forms |
| `domain/suggest.ts` | `SuggestPrefs` without `difficulties`; `LibraryEntry` without `difficulty`; reason text never says "difficulty" |
| `server/compat/difficulty.ts` (NEW) | the only server home of `Difficulty`, `DIFFICULTIES`, `derivedDifficulty(pain)` |
| `server/stores/workouts.ts` | four write sites call `derivedDifficulty(input.pain)` |
| `server/stores/preferences.ts`, `server/routes/data.ts` | import the compat type; prefs behaviour unchanged |
| `server/testing/fakes.ts` | mirror the derivation |
| `server/seed/library/{o2,at,tr,an,onboarding}.ts` | no `difficulty` field; AT and TR re-sorted by pain (stable) |
| `server/seed/library/library.test.ts` | `PAIN_BY_DIFF` gone; ordering invariant over pain |
| `src/today/*`, `src/library/*` | no difficulty filter group, token, parser field or default |
| `src/components/difficultyChips.ts`, `difficultyTokenLabel.ts` | DELETED (+ their tests) |
| `src/builder/*` | no difficulty radiogroup, form field or draft field |
| `src/library/WorkoutRow.tsx`, `src/today/Today.tsx`, `src/workout/WorkoutDetail.tsx` | no difficulty word in the row/card/detail |
| `src/api/useWorkouts.ts`, `usePreferences.ts` | client types drop the fields |
| `src/index.css`, `src/theme/tokens.css` | `.classification-chip-difficulty` rules and comments gone |
| `src/news/content/bodies/pickingAWorkout.tsx`, `workoutTypes.tsx` | no difficulty paragraph/sentence |
| `scripts/library-moves.ts`, `.claude/skills/{wod-import,hardware-walk}/SKILL.md`, `docs/design/DEVIATIONS.md`, `docs/screenshots/*.png` | reconciled |

---

### Task 0: Worktree and hook check

**Files:** none

- [ ] **Step 1:** In `/Users/james/projects/github/jamesawesome/Ergomatic-wt-de1` run `git rev-parse --show-toplevel` and `ls .husky/_ | head -2`. Expected: the worktree path; `applypatch-msg commit-msg`.
- [ ] **Step 2:** Prove the hook fires: `printf 'export const x: number = "bad"\n' > app/src/__probe.ts && git add app/src/__probe.ts && git commit -qm probe`. Expected: `husky - pre-commit script failed` with `TS2322`. Then `git reset -q HEAD app/src/__probe.ts && rm app/src/__probe.ts`.

### Task 1: Domain — drop `Difficulty`, reshape the bulk header, remove the suggestion predicate

**Files:**
- Modify: `app/domain/types.ts:44,85`
- Modify: `app/domain/validate.ts:2,11,143-144`
- Modify: `app/domain/bulk.ts:33,66,73-76,100-155`
- Modify: `app/domain/suggest.ts:1,8,21,111,238-247,295,360`
- Test: `app/domain/bulk.test.ts`, `app/domain/validate.test.ts`, `app/domain/suggest.test.ts`

**Interfaces:**
- Produces: `WorkoutInput = { title; type; pain; steps }`; `SuggestPrefs` without `difficulties`; `LibraryEntry` without `difficulty`; `parseBulk` header of 3 fields (`title | TYPE | effort`) with 4- and 5-field legacy forms accepted and their difficulty field discarded.

- [ ] **Step 1: Failing bulk tests.** Append to `app/domain/bulk.test.ts` (find the existing `describe` for headers and add inside it):

```ts
describe("header (Phase DE PR 1: three-field canonical, legacy forms kept)", () => {
  const body = "\nw 10' 6k+4 @20";
  it("accepts the canonical three-field header title | TYPE | effort", () => {
    const r = parseBulk(`Scud Cloud | AN | 3${body}`);
    expect(r.errors).toEqual([]);
    expect(r.workouts[0]).toMatchObject({ title: "Scud Cloud", type: "AN", pain: 3 });
    expect(r.workouts[0]).not.toHaveProperty("difficulty");
  });
  it("accepts the legacy four-field header and ignores the difficulty word", () => {
    const r = parseBulk(`Scud Cloud | AN | medium | 3${body}`);
    expect(r.errors).toEqual([]);
    expect(r.workouts[0]).toMatchObject({ title: "Scud Cloud", type: "AN", pain: 3 });
  });
  it("accepts the legacy five-field header and ignores number and difficulty", () => {
    const r = parseBulk(`12 | Scud Cloud | AN | garbage | 3${body}`);
    expect(r.errors).toEqual([]);
    expect(r.workouts[0]).toMatchObject({ title: "Scud Cloud", type: "AN", pain: 3 });
  });
  it("rejects any other field count naming only the canonical form", () => {
    const r = parseBulk(`Scud Cloud | AN${body}`);
    expect(r.errors[0]?.message).toBe(
      'header must be "title | TYPE | effort" (legacy "title | TYPE | difficulty | pain" and a leading number are accepted and ignored)',
    );
  });
  it("still reports an invalid effort figure", () => {
    const r = parseBulk(`Scud Cloud | AN | x${body}`);
    expect(r.errors[0]?.message).toBe("invalid effort: x");
  });
  it("PINS the pre-existing pipe-in-title truncation so PR 1 changes it knowingly", () => {
    // `A|B | AN | medium | 3` is FIVE fields: legacy form, leading "A" dropped.
    const r = parseBulk(`A|B | AN | medium | 3${body}`);
    expect(r.errors).toEqual([]);
    expect(r.workouts[0]?.title).toBe("B");
  });
});
```

Check the file's existing import of `parseBulk` (the function name may be `parseBulk` or `parseBulkText`; use whatever the file already imports).

- [ ] **Step 2:** Run `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project unit domain/bulk.test.ts`. Expected: the six new tests FAIL (three-field header rejected; error message differs).

- [ ] **Step 3: Implement `bulk.ts`.** Replace lines 66 and 73-76 and the body of `parseHeader`:

```ts
// (line 66) delete: const DIFFS: Difficulty[] = ["easy", "medium", "hard"];
// (line 33) import type { Step, WorkoutInput, WorkoutType } from "./types.js";

type HeaderFields = Pick<WorkoutInput, "title" | "type" | "pain">;

const HEADER_MESSAGE =
  'header must be "title | TYPE | effort" (legacy "title | TYPE | difficulty | pain" and a leading number are accepted and ignored)';

function parseHeader(
  line: RawLine,
  blockIndex: number,
  errors: BulkError[],
): HeaderFields | null {
  const parts = line.text.split("|").map((p) => p.trim());
  // 3 = canonical `title | TYPE | effort`. 4 = legacy `title | TYPE |
  // difficulty | pain` (field 3 discarded). 5 = legacy with a leading
  // workout number (fields 1 and 4 discarded). No three-field form existed
  // before Phase DE, so the count alone disambiguates (spec §3.5).
  let title: string, type: string, painStr: string;
  if (parts.length === 3) {
    [title, type, painStr] = parts as [string, string, string];
  } else if (parts.length === 4) {
    [title, type, , painStr] = parts as [string, string, string, string];
  } else if (parts.length === 5) {
    [, title, type, , painStr] = parts as [string, string, string, string, string];
  } else {
    errors.push({ block: blockIndex, line: line.lineNumber, message: HEADER_MESSAGE });
    return null;
  }
  if (title.length === 0) {
    errors.push({ block: blockIndex, line: line.lineNumber, message: "title is required" });
    return null;
  }
  if (!TYPES.includes(type as WorkoutType)) {
    errors.push({ block: blockIndex, line: line.lineNumber, message: `invalid type: ${type}` });
    return null;
  }
  const pain = Number(painStr);
  if (!Number.isInteger(pain)) {
    errors.push({ block: blockIndex, line: line.lineNumber, message: `invalid effort: ${painStr}` });
    return null;
  }
  return { title, type: type as WorkoutType, pain };
}
```

Grep the rest of `bulk.ts` for `difficulty` (the block assembler spreads `HeaderFields` into a `WorkoutInput`; it needs no change once the type shrinks) and for the old message text in `bulk.test.ts` — update the existing assertions that pinned `'header must be "title | TYPE | difficulty | pain" ...'` and `invalid pain:` to the new strings.

- [ ] **Step 4: `types.ts` and `validate.ts`.** Delete `export type Difficulty = ...` (types.ts:44) and `difficulty: Difficulty;` (types.ts:85). In `validate.ts` delete the `Difficulty` import, the `DIFFS` const and lines 143-144. In `validate.test.ts`, delete the test asserting `"invalid difficulty"` and remove `difficulty:` from every fixture (`sed -i '' '/^\s*difficulty: "\(easy\|medium\|hard\)",\?$/d'` is acceptable for fixtures; read the diff).

- [ ] **Step 5: Failing suggest test.** In `app/domain/suggest.test.ts` add:

```ts
it("fell-back reason never names a difficulty filter (Phase DE PR 1)", () => {
  const lib = [entry({ id: "a", type: "O2", pain: 5, estMinutes: 60 })];
  const s = suggest({
    todayCode: "O2",
    library: lib,
    prefs: { durationRange: { min: 10, max: 20 } },
    todayPickId: undefined,
    drawnId: undefined,
    prescribed: undefined,
  });
  expect(s.fellBack).toBe(true);
  expect(s.reason).toBe(
    "Nothing fit your time filters. Closest match, last done never.",
  );
  expect(s.reason).not.toMatch(/difficult/i);
});
```

Use the file's existing entry-builder helper name (grep `function entry` or the fixture factory) and match the existing `recencyPhrase(null)` wording for "never" by reading `suggest.ts`'s `recencyPhrase`.

- [ ] **Step 6:** Run the suggest test file. Expected: FAIL (`difficulties` missing → TypeError, or reason contains "difficulty").

- [ ] **Step 7: Implement `suggest.ts`.** Remove `Difficulty` from the import (line 1) and `difficulty: Difficulty;` from `LibraryEntry` (line 8); remove `difficulties: Difficulty[];` from `SuggestPrefs` (line 21); change the `fellBack` comment (line 111) to `// time/pain/recency/source filters matched nothing; ...`; remove `prefs.difficulties.includes(e.difficulty) &&` at lines 295 and 360; rewrite the reason builder:

```ts
  if (fellBack) {
    const parts: string[] = [];
    if (timeChecked) parts.push("time");
    if (prefs.painLevels?.length) parts.push("pain");
    if (prefs.lastDone) parts.push("recency");
    if (prefs.source) parts.push("source");
    const what = parts.length ? `${parts.join("/")} filters` : "filters";
    return `Nothing fit your ${what}. Closest match, last done ${recencyPhrase(picked.lastDoneDaysAgo)}.`;
  }
```

Then remove `difficulties:` and `difficulty:` from every fixture in `suggest.test.ts`, and delete any test whose subject is the difficulty filter (grep `difficult` in the test file; read each hit — a test that ALSO covers time/pain keeps its other assertions).

- [ ] **Step 8:** `pnpm typecheck` will now fail in server and client — expected at this point; run only `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project unit domain/`. Expected: PASS.
- [ ] **Step 9:** Commit: `git add domain && git commit -m "Phase DE PR 1 task 1: domain drops Difficulty; bulk header is title | TYPE | effort with legacy forms kept; suggest loses the difficulty predicate"`. The pre-commit typecheck WILL fail because server/client still reference the type — so Tasks 1–3 land as ONE commit after Task 3's step 6. Do not `--no-verify`.

### Task 2: Server — one compat module, derivation at four write sites, prefs unchanged

**Files:**
- Create: `app/server/compat/difficulty.ts`
- Modify: `app/server/stores/workouts.ts:5,12-15,78,101,127,227`
- Modify: `app/server/stores/preferences.ts:4`
- Modify: `app/server/routes/data.ts:9,55`
- Modify: `app/server/testing/fakes.ts:243,276`
- Modify: `app/server/stores/contracts/storeContracts.ts:74,421,429` (fixtures) and every `server/**/*.test.ts` fixture carrying `difficulty:`
- Test: `app/server/compat/difficulty.test.ts` (new), `app/server/stores/contracts/storeContracts.ts` (contract, runs against Postgres AND the fake), `app/server/routes/data.test.ts`

**Interfaces:**
- Produces: `derivedDifficulty(pain: number): Difficulty` (1–2 → "easy", 3 → "medium", 4–5 → "hard"); `DIFFICULTIES`; server-private `Difficulty`.

- [ ] **Step 1: Failing unit test** `app/server/compat/difficulty.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { derivedDifficulty } from "./difficulty.js";

describe("derivedDifficulty (PR 1 compat write, spec §3.2)", () => {
  it.each([
    [1, "easy"], [2, "easy"], [3, "medium"], [4, "hard"], [5, "hard"],
  ] as const)("pain %i → %s", (pain, word) => {
    expect(derivedDifficulty(pain)).toBe(word);
  });
});
```

- [ ] **Step 2:** Run it. Expected: FAIL (module not found).
- [ ] **Step 3: Create `app/server/compat/difficulty.ts`:**

```ts
// Phase DE PR 1 (spec §3.2): the product no longer has a difficulty, but
// `workouts.difficulty` is a NOT NULL Postgres column that every installed
// pre-PR-1 build renders with `workout.difficulty.toUpperCase()`
// (WorkoutRow.tsx, Today.tsx, WorkoutDetail.tsx on v0.38.1) — a NULL takes
// three screens down inside React render. So for one tag cycle the store
// writes a word DERIVED from the 1–5 figure. No new build reads it.
//
// REMOVED BY PHASE DE PR 3 together with the column, its enum and
// `preferences.difficulties` (ROADMAP "Phase DE", PR 3 row). Nothing
// outside `server/` may import this module.
export type Difficulty = "easy" | "medium" | "hard";
export const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];

export function derivedDifficulty(pain: number): Difficulty {
  if (pain <= 2) return "easy";
  if (pain === 3) return "medium";
  return "hard";
}
```

- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5: Failing contract test** (RF24 seam: request-with-difficulty → store → read back). In `storeContracts.ts`, in the workouts contract, add:

```ts
it("writes a difficulty DERIVED from pain at create, createMany, update and updateGlobal; the caller's word is never stored (PR 1 compat)", async () => {
  const base = { title: "Derive", type: "AN" as const, pain: 2, steps: STEPS, source: "user" as const };
  const created = await workouts.create(userA, base);
  expect(created.difficulty).toBe("easy");
  const [many] = await workouts.createMany(userA, [{ ...base, pain: 5 }]);
  expect(many!.difficulty).toBe("hard");
  const updated = await workouts.update(userA, created.id, { ...base, pain: 3 });
  expect(updated!.difficulty).toBe("medium");
  const [g] = await workouts.createMany(null, [{ ...base, pain: 1, source: "starter", sortOrder: 9001 }]);
  const gUpdated = await workouts.updateGlobal(g!.id, { ...base, pain: 4, sortOrder: 9001 });
  expect(gUpdated!.difficulty).toBe("hard");
});
```

Use the contract file's existing user id and steps fixture names (grep `userA`/`STEPS` or their equivalents at the top of the file).

- [ ] **Step 6:** Run `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project unit server/stores` (the fake) — Expected: FAIL (fake writes `input.difficulty`, now undefined). The Postgres half runs in Task 7's integration pass.
- [ ] **Step 7: Implement the store and fake.** In `workouts.ts` add `import { derivedDifficulty } from "../compat/difficulty.js";` and replace each `difficulty: input.difficulty,` (lines 78, 101, 127, 227) with `difficulty: derivedDifficulty(input.pain),`. Add above `create` a one-line comment: `// difficulty is DERIVED for old builds — server/compat/difficulty.ts explains; PR 3 removes.` In `fakes.ts` do the same at lines 243 and 276. In `preferences.ts` change line 4 to `import type { Difficulty } from "../compat/difficulty.js";`. In `data.ts` remove `type Difficulty,` from the domain import (line 9), delete line 55, and add `import { DIFFICULTIES, type Difficulty } from "../compat/difficulty.js";`.
- [ ] **Step 8: Route seam test.** In `data.test.ts` add (using the file's existing `app`/`agent` helper and an authenticated request pattern — copy the nearest `POST /api/workouts` test):

```ts
it("ignores a client-sent difficulty on create and serves the derived word (old-build compat, spec §3.3)", async () => {
  const res = await agent.post("/api/workouts").send({
    title: "Old client", type: "AN", difficulty: "hard", pain: 2, steps: STEPS,
  });
  expect(res.status).toBe(201);
  expect(res.body.difficulty).toBe("easy");
  const list = await agent.get("/api/workouts");
  expect(list.body.find((w: { id: string }) => w.id === res.body.id).difficulty).toBe("easy");
});

it("PUT /api/prefs still validates difficulties and GET still serves them (old-build compat, spec §3.3)", async () => {
  const bad = await agent.put("/api/prefs").send({ difficulties: ["easy", "insane"] });
  expect(bad.status).toBe(400);
  expect(bad.body.field).toBe("difficulties");
  const ok = await agent.put("/api/prefs").send({ difficulties: ["easy"] });
  expect(ok.status).toBe(200);
  const got = await agent.get("/api/prefs");
  expect(got.body.difficulties).toEqual(["easy"]);
});
```

The existing tests at `data.test.ts:4273-4304` already cover the prefs half — if they do, keep them and skip the second block; the first block is the new seam.

- [ ] **Step 9:** Remove `difficulty:` from every server test fixture (`grep -rln 'difficulty' server --include='*.test.ts'`), reading each hit: a fixture line is deleted; an assertion ON difficulty is deleted unless it is one of the compat assertions above.
- [ ] **Step 10:** Run `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project unit server/`. Expected: PASS. Typecheck of `server/` now passes; client still fails until Task 3.

### Task 3: Client — filters, sheets, rows, builder, API types, CSS

**Files:**
- Delete: `app/src/components/difficultyChips.ts`, `app/src/components/difficultyTokenLabel.ts` and their `.test.ts` files
- Modify: `app/src/today/todayFilters.ts:3,15,44,72-78,119,139`, `todayFilterTokens.ts:1,13-16,23,34-39,60,69,77-87`, `TodayFilterSheet.tsx:2,36,116-129`, `Today.tsx:37,165-170,255,291,623,898-900,1059-1065,1101-1104,1123-1127,1405,1487`, `todayOverrides.ts:11`
- Modify: `app/src/library/filters.ts:11,38-40,49,66,113-117,162,171,198`, `filterTokens.ts:20,37-40,53-57`, `FilterSheet.tsx:2,38,50-58,142-149`, `libraryFilters.ts:3,14-19,60,92`, `WorkoutRow.tsx:52`
- Modify: `app/src/workout/WorkoutDetail.tsx:436`
- Modify: `app/src/builder/Builder.tsx:434,552-556`, `ClassificationCard.tsx:1,31,41-43,70,77,80,121-130`, `builderDraft.ts:32,60`, `builderState.ts:10,53,110,703,720`, `BulkImport.tsx:28-31,38,47`
- Modify: `app/src/api/useWorkouts.ts:3,9`, `usePreferences.ts:3,7,20`
- Modify: `app/src/index.css:901,1055-1073,1175-1199`, `app/src/theme/tokens.css:137`
- Test: every `src/**/*.test.ts(x)` fixture carrying `difficulty`/`difficulties` (`grep -rln 'difficult' src --include='*.test.*'`)

**Interfaces:**
- Produces: `FilterSet = { durationRange; painLevels; lastDone; source }` (Today); `Filters = { types; durationRange; painLevels; lastDone; source; query }` (Library); `BuilderForm` without `difficulty`; `Workout` (client) without `difficulty`; `Preferences` (client) without `difficulties`.

- [ ] **Step 1: Failing parser tests.** In `src/today/todayFilters.test.ts`:

```ts
it("accepts a stored blob that still carries difficulties and drops the key (PR 1)", () => {
  const stored = JSON.stringify({ v: 2, sets: { O2: {
    difficulties: ["easy"], durationRange: { min: 10, max: 20 }, painLevels: [2], lastDone: null, source: null,
  } } });
  localStorage.setItem(TODAY_FILTERS_KEY, stored);
  const set = loadFilterStore()!.sets.O2!;
  expect(set).toEqual({ durationRange: { min: 10, max: 20 }, painLevels: [2], lastDone: null, source: null });
  expect(set).not.toHaveProperty("difficulties");
});
it("accepts a stored blob with NO difficulties key (PR 1: the branch that used to reject it inverts)", () => {
  localStorage.setItem(TODAY_FILTERS_KEY, JSON.stringify({ v: 2, sets: { O2: {
    durationRange: { min: 10, max: 20 }, painLevels: [], lastDone: null, source: null,
  } } }));
  expect(loadFilterStore()!.sets.O2).toBeTruthy();
});
```

Use the file's real storage key constant and loader name (read the top of `todayFilters.ts` for the exported names; the store shape `{ v, sets }` is illustrative — copy an existing test's stored fixture and edit it). In `src/library/libraryFilters.test.ts`, the same two shapes against `parseFilters`/`loadFilters`: a record WITH `difficulties: ["medium"]` parses with the key gone; a record WITHOUT it parses. Add a third: a record with `difficulties: "garbage"` (present, wrong type) ALSO parses — the key is unknown now, and unknown keys are ignored, not validated.

- [ ] **Step 2:** Run both test files. Expected: FAIL (the first shape returns a set still carrying `difficulties`; the second returns null).
- [ ] **Step 3: Implement the parsers.** `todayFilters.ts`: delete the `Difficulty` import, `DIFFICULTIES`, `isDifficulty`, `difficulties: Difficulty[]` from `FilterSet`, the guard at line 119 and `difficulties: [...new Set(o.difficulties)]` at 139. `libraryFilters.ts`: delete the import of `Difficulty` (keep `isWorkoutType`), `DIFFICULTIES`, `isDifficulty`, the guard at line 60 and the field at 92. `filters.ts`: delete `difficulties` from `Filters`, `EMPTY_FILTERS`, `toggleDifficulty`, the `hasSheetFilters` clause at 162, and the predicate at 198. Update the comments that enumerate groups (`DIFFICULTY, TIME, PAIN, LAST DONE, SOURCE` → `TIME, PAIN, LAST DONE, SOURCE`).
- [ ] **Step 4: Tokens and sheets.** `todayFilterTokens.ts`: delete the `Difficulty` import, `difficulties` from the defaults/overrides types, `sameDifficultySet`, and the token push at 82-87; the `group` union loses `"difficulties"`. `filterTokens.ts`: delete `"difficulty"` from the kind union and the push at 53-57. `TodayFilterSheet.tsx` and `FilterSheet.tsx`: delete the DIFFICULTY `FilterGroup` (Today 116-129; Library 142-149) and the `Difficulty` import; fix the header comments. Then delete `src/components/difficultyChips.ts`, `difficultyTokenLabel.ts` and their tests.
- [ ] **Step 5: Rows, card, detail.** `WorkoutRow.tsx:52`: `{workout.difficulty.toUpperCase()} · {daysLabel}` → `{daysLabel}`. `Today.tsx:1487`: `{recommended.difficulty.toUpperCase()} · PAIN {recommended.pain}` → `PAIN {recommended.pain}`. `WorkoutDetail.tsx:436`: delete the `<span className="mono-status">` carrying the word (read the surrounding markup — if it was the only child of a status row, delete the row). `Today.tsx`: delete `Difficulty` import, `ALL_DIFFICULTIES`, `difficulty: w.difficulty` (255), `difficulties: filters.difficulties` (291), `difficulties: preferences.difficulties` (900), `difficulties: ALL_DIFFICULTIES` (1065), the `"difficulties"` arm of the reset union and its branch (1101-1104), and `difficulties: filterDefaults.difficulties` (1127); reconcile the comments at 165-175, 623, 898, 1059-1061, 1405.
- [ ] **Step 6: Builder and API types.** `builderState.ts`: delete the `Difficulty` import, `difficulty: Difficulty` (53, 703), `difficulty: "easy"` (110), `difficulty: w.difficulty` (720). `Builder.tsx`: delete `difficulty: form.difficulty` (434) and the three prop lines (552-556). `ClassificationCard.tsx`: delete the `Difficulty` type import, the `difficulty`/`onDifficultyChange` props and the DIFFICULTY group (121-130); reconcile the header comment (31, 41-43). `builderDraft.ts`: remove `f.difficulty,` from the fingerprint and `typeof value.difficulty === "string" &&` from `isBuilderForm` — old drafts carrying the field still parse because nothing checks it. `BulkImport.tsx`: `GRAMMAR_EXAMPLE` header → `Ladder Day | AT | 3`; `GRAMMAR_HELP` → `'header: "title | TYPE | effort" (the older "title | TYPE | difficulty | pain" form, with or without a leading number, is still accepted; difficulty and the number are ignored)'`; fix the comment at 28-31. `useWorkouts.ts` and `usePreferences.ts`: drop the type import and the field. CSS: delete `.classification-chip-difficulty` and `.classification-chip-difficulty[aria-pressed="true"]` (index.css 1175-1199) and reconcile the comments at 901, 1055-1073 and tokens.css:137.
- [ ] **Step 7:** `pnpm typecheck && pnpm lint`. Expected: PASS. Then `pnpm lint:prune` (suppressions may only decrease; commit its output if it changed).
- [ ] **Step 8:** Sweep client tests: `grep -rln 'difficult' src --include='*.test.*'`; for each file remove fixture fields, delete tests whose subject is the difficulty chip/group/token, and keep every other assertion. Run `pnpm test --project client`. Expected: PASS. Then `pnpm test --project unit`. Expected: PASS.
- [ ] **Step 9: Commit Tasks 1–3 together** (the type change forces compilation coupling, RF10): `git rev-parse --show-toplevel && git add -A app/domain app/server app/src && git commit -m "Phase DE PR 1 tasks 1-3: difficulty leaves the domain, the client and every filter; the server derives a compat word at all four write sites; bulk header is title | TYPE | effort"`.

### Task 4: Gate 0 — capture the after state, present, STOP

**Files:**
- Read: `app/e2e/screenshots.spec.ts` (which captures show the row, Today card, both sheets, the classification card)

- [ ] **Step 1:** `pnpm screenshots` (boots the per-worktree stack, rebuilds, leaves it up). Expected: captures refreshed under `docs/screenshots/`.
- [ ] **Step 2:** Open and LOOK at (RF7): the Library list capture (rows read `TYPE · daysLabel`, no EASY/MEDIUM/HARD), the Today card (`PAIN n` only), the Library and Today filter sheets (four groups: TIME, PAIN, LAST DONE, SOURCE), the Builder capture (TYPE and EXPECTED PAIN only). Also the Library AT and TR blocks, where Task 5's re-sort will move a few rows — capture those after Task 5 and include both.
- [ ] **Step 3:** Build the before/after: `git stash` is FORBIDDEN (shared stack); instead check out `origin/main` copies of the five PNGs into the scratchpad (`git show origin/main:docs/screenshots/<name>.png > <scratch>/<name>-before.png`) and present before/after pairs, portrait and landscape where the suite captures both. Contrast statement: no new colour pairing is introduced (every surviving element already ships); the design e2e sweep in Task 7 is the check.
- [ ] **Step 4:** Present the pairs to James as the Gate 0 artifact and STOP. Tasks 5–8 start only on his approval. If he rejects, `git reset --hard origin/main` on this branch and re-plan.

### Task 5: Seed — field removal, stable re-sort, ordering invariant over pain

**Files:**
- Modify: `app/server/seed/library/{o2,at,tr,an,onboarding}.ts`, `app/server/seed/library/library.test.ts:3-7,74-78,276-287,300-311`, `app/server/seed/library/onboarding.test.ts`, `variety.test.ts` if it names difficulty
- Modify: `app/scripts/library-moves.ts:1653,1659,1669`

- [ ] **Step 1: Failing ordering test.** Replace the test at `library.test.ts:300` with:

```ts
  it("orders each type block by pain (never decreases) — the within-type browsing rule a rower sees, restated on the surviving axis (Phase DE PR 1)", () => {
    for (const type of ["O2", "AT", "TR", "AN"] as const) {
      const block = LIBRARY_WORKOUTS.filter((w) => w.type === type);
      for (let i = 1; i < block.length; i++)
        expect(
          block[i]!.pain >= block[i - 1]!.pain,
          `${type}: ${block[i - 1]!.title} (${block[i - 1]!.pain}) -> ${block[i]!.title} (${block[i]!.pain})`,
        ).toBe(true);
    }
  });
```

Delete `PAIN_BY_DIFF` (74-78), the `Difficulty` type import, and the "pairs difficulty and pain plausibly" test's difficulty half — keep its `PAIN_BY_TYPE` half as `it("keeps pain inside each type's band", ...)`.

- [ ] **Step 2:** Run `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project unit server/seed/library/library.test.ts`. Expected: FAIL on AT and TR (measured 2026-09-05: AT has `4 3 4 3 3 3 4 4 4 4 3 4`, TR has `4 3 3 3 3 4 4 3 …` and a trailing `3` before the 5s).
- [ ] **Step 3: Remove the field.** In each of the five seed files: `sed -i '' '/^    difficulty: "\(easy\|medium\|hard\)",$/d' server/seed/library/{o2,at,tr,an,onboarding}.ts` then `grep -c 'difficulty' server/seed/library/*.ts` — Expected: 0 in the five data files. Section comments like `// ---- medium, pain 3 (1–11)` become `// ---- pain 3 (1–11)`.
- [ ] **Step 4: Stable re-sort AT and TR by pain.** Write a one-off script in the scratchpad (NOT committed) that imports `AT_WORKOUTS`/`TR_WORKOUTS`, stable-sorts by `pain`, and prints the titles in new order; then move the object literals by hand in `at.ts` and `tr.ts` to match (moving whole `{ ... },` blocks; do not retype content). Stable means a 3 that moves passes only the 4s ahead of it — every other relative order is preserved. Record in the PR body which titles moved and by how many positions (the script prints old→new index).
- [ ] **Step 5:** Run the library tests. Expected: PASS, including the archetype/variety ratchets (they do not depend on order — confirm by their passing).
- [ ] **Step 6:** `library-moves.ts`: report column header `| out | now | reaches | pain | why it cannot stay |` and cells `${r.workout.pain}`.
- [ ] **Step 7:** `pnpm typecheck && pnpm lint`; commit: `"Phase DE PR 1 task 5: seed drops difficulty; AT and TR stably re-sorted by pain so the within-type order rule survives on the surviving axis"`.

### Task 6: Content, skills, design record

**Files:**
- Modify: `app/src/news/content/bodies/pickingAWorkout.tsx:22-30`, `workoutTypes.tsx:76`
- Modify: `.claude/skills/wod-import/SKILL.md:55`, `.claude/skills/hardware-walk/SKILL.md:133,141,158`
- Modify: `docs/design/DEVIATIONS.md` (the row whose first column begins `Difficulty \`Introductory / Moderate / Advanced\``)

- [ ] **Step 1:** `pickingAWorkout.tsx`: delete the sentences from "Difficulty (easy, medium, hard) is a separate figure" through the sprint example; the paragraph now ends after the pain-scale link sentence. `workoutTypes.tsx:76`: "carries a difficulty and an expected pain" → "carries an expected pain". Update the paragraph-count/minutes comment in `articles.tsx` only if the reading-time helper is hand-set (read `articles.tsx:26`).
- [ ] **Step 2:** `wod-import/SKILL.md:55`: "Type, difficulty, and pain per the house rubric" → "Type and effort (the 1-to-5 figure; the bulk header is `title | TYPE | effort`) per the house rubric". `hardware-walk/SKILL.md`: the three headers become `Walk Smoke | O2 | 1`, `Walk Keystone | AT | 2`, `Walk Rests | AT | 2` (three fields, no leading number). Paste all three through the parser (RF13): a unit test in `bulk.test.ts` that feeds each header line plus one work step and expects zero errors — add it as `it("the hardware-walk skill's three headers parse", ...)` with the three literal strings.
- [ ] **Step 3:** `DEVIATIONS.md`: replace the difficulty row's second column with `Removed (Phase DE PR 1, 2026-09-05): the product has no difficulty; effort 1–5 is the one figure` and its rationale column with one sentence: across all 300 seeded workouts the word was a coarse copy of the figure (easy 1–2, hard 4–5, medium 2–4).
- [ ] **Step 4:** Commit: `"Phase DE PR 1 task 6: articles, both skills' headers and the DEVIATIONS row lose difficulty"`.

### Task 7: e2e, screenshots, build gate, coverage

**Files:**
- Modify: `app/e2e/today.spec.ts:956,1175-1300`, `library.spec.ts:453-560`, `design.spec.ts:735,1374-1378,1505-1580,1724-1740,3477-3580`, `screenshots.spec.ts:481-560,712,1815,1890`, `builder.spec.ts:23,506`, `log.spec.ts:1879`

- [ ] **Step 1:** For each e2e hit: a test whose SUBJECT is the DIFFICULTY group/token/chip is deleted; a test that uses DIFFICULTY as a convenient deviation (screenshots' "deselect HARD", today's "a DIFFICULTY deviation under O2") switches to PAIN (deselect level 5 — equally harmless: no seeded workout of the capture's type at pain 5 is needed for the capture); assertions on four-vs-five groups drop to four; the "selected DIFFICULTY/TIME/PAIN chips fill ink" sweeps lose the DIFFICULTY selector; `builder.spec.ts:506`'s four-field header comment becomes the three-field form with the legacy note; `log.spec.ts:1879`'s seeded workout drops the field.
- [ ] **Step 2:** `pnpm e2e`. Expected: PASS. Read BOTH summary lines (files and tests).
- [ ] **Step 3:** `pnpm screenshots`; open each changed PNG (RF7) — the Library AT/TR order change from Task 5 shows here; add those captures to the Gate 0 record in the PR body.
- [ ] **Step 4:** `pnpm build && pnpm dist:grep`. Then the bundle probe both directions: `grep -c 'MEDIUM' dist/assets/*.js` — Expected: 0 (the chip label is gone); `grep -c 'DIFFICULTY' dist/assets/*.js` — Expected: 0. Prove the probe can go red: `git stash` is forbidden, so run the same grep against `origin/main`'s build once in the scratchpad worktree or record the count from the last main build (state which).
- [ ] **Step 5:** `pnpm test:coverage`; read the per-file lines for `server/compat/difficulty.ts` (100%), `domain/bulk.ts`, `domain/suggest.ts`, `src/today/todayFilters.ts`, `src/library/libraryFilters.ts` — none may drop below its pre-PR figure (record both).
- [ ] **Step 6:** Integration: `pnpm test --project integration` (Docker) — the Postgres half of Task 2's contract test runs here. Expected: PASS.
- [ ] **Step 7:** The finishing grep from Global Constraints, pasted into the PR body. Commit: `"Phase DE PR 1 task 7: e2e and captures reconciled; bundle carries no MEDIUM/DIFFICULTY"`.

### Task 8: Review half, PR body, PM final gate

- [ ] **Step 1:** Push and open the PR against `main` with the human-first body (line one "This PR removes EASY / MEDIUM / HARD…", ≤120 words above the fold, ≤6 bullets), a `Record` block carrying: the finishing grep output; the Task 2 seam test names and the mutation that bit each (`derivedDifficulty` returning `"medium"` for all → the contract test's `easy`/`hard` expectations fail — run it, paste the failure, revert); Task 5's moved titles; the bundle probe counts; the drizzle index statement ("no migration; main at 0023"); "Gate 0 approved by James on <date>".
- [ ] **Step 2:** Dispatch the two-stage branch review (a fresh reviewer against the spec §3 and this plan, then a scoped re-review of its findings), and the `product-manager` final-PR gate (TRIAD: compat write). Present both verdicts with the PR link and STOP — James merges.

---

## Self-review (run by the author, 2026-09-05)

- **Spec coverage:** §3.1 invariant → Tasks 1–3 + 7's grep and Task 2's seam test. §3.2 derived write at four sites → Task 2 (`create`, `createMany`, `update`, `updateGlobal` named). §3.3 prefs/route compat → Task 2 steps 7–8. §3.4 parsers, chips, card, Today, seed ordering → Tasks 3 and 5. §3.5 header table + `|` pin + both skills → Tasks 1 and 6. §3.6 content/DEVIATIONS/captures → Tasks 6 and 7. §3.7 Gate 0 → Task 4, placed after the client render exists and before the seed/e2e/content work.
- **Gap found and closed:** the spec's ordering invariant assumed pain was monotone within type blocks; measured, AT and TR are not. Task 5's stable re-sort is the fix, and it is a VISIBLE order change, so Task 7 step 3 feeds those captures back into the Gate 0 record.
- **Placeholders:** none; where a helper name is unknown the step says which file to read for it.
- **Type consistency:** `derivedDifficulty(pain: number)` in Task 2 matches every call site; `HeaderFields = Pick<WorkoutInput, "title" | "type" | "pain">` matches the assembler's spread.
