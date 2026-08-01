# Phase 5H — Library custom badge + filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Personal workouts are visibly marked and filterable in the library,
and long-pressing controls in the iOS app stops popping the text-selection
callout.

**Architecture:** Purely additive client work — `isGlobal` already ships in
`GET /api/workouts` (`useWorkouts.ts:12`). A badge in `WorkoutRow`, a
`customOnly` boolean through `filters.ts`/`FilterChips`, one grouped
`user-select` CSS rule. No server, no domain, no data shape.

**Tech Stack:** TypeScript strict ESM, React 19, Vitest 4, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-01-phase-5h-library-custom-design.md`.
**Every implementer reads `.claude/agent-briefing.md` first** — SDLC,
environment, scoped gates, the self-mutation definition of done, and the
report contract all live there and are not repeated in this plan.

## Global Constraints (beyond the briefing)

- Worktree: `.claude/worktrees/phase-5h`, branch `phase-5h-library-custom`.
- The badge is metadata, not a category: `--ink-3` text, 1px `--rule-3`
  border, transparent fill, 2px radius, mono uppercase — never a type colour.
- `CUSTOM` ANDs with every other filter, exactly as `painMax3` behaves; `ALL`
  clears it.
- The callout rule must NOT touch `input`/`textarea` — typed text stays
  selectable, and a test pins the inverse.
- Chip labels/behaviour: type chips are single-select toggles, duration
  multi-select, `PAIN ≤3` a boolean toggle, RECENT/NOT RECENT mutually
  exclusive, ALL clears everything (see `FilterChips.tsx`; `isEmptyFilters`
  must learn the new field or ALL's active state lies).

---

### Task 1: Badge + filter

**Files:**
- Modify: `app/src/library/WorkoutRow.tsx` (badge on line 2),
  `app/src/library/filters.ts` (`Filters.customOnly`, `toggleCustom`,
  predicate, `EMPTY_FILTERS`), `app/src/library/FilterChips.tsx` (chip +
  `isEmptyFilters`), `app/src/library/Library.tsx` (empty-state line),
  `app/src/index.css` (`.workout-row-custom` tag rule)
- Test: `app/src/library/filters.test.ts`,
  `app/src/library/WorkoutRow.test.tsx`, `app/src/library/Library.test.tsx`

**Interfaces:**
- Consumes: `LibraryWorkout.isGlobal: boolean` (already in the payload).
- Produces: `toggleCustom(f: Filters): Filters`;
  `Filters.customOnly: boolean` (default `false` in `EMPTY_FILTERS`).

- [ ] **Step 1: Failing tests.** `filters.test.ts` (match the file's existing
  fixture helpers):

```ts
describe("customOnly", () => {
  it("keeps only non-global workouts when set", () => {
    const ws = [
      fixtureWorkout({ title: "Mine", isGlobal: false }),
      fixtureWorkout({ title: "Seeded", isGlobal: true }),
    ];
    const out = applyFilters(ws, { ...EMPTY_FILTERS, customOnly: true }, null);
    expect(out.map((w) => w.title)).toEqual(["Mine"]);
  });

  it("ANDs with the type filter", () => {
    const ws = [
      fixtureWorkout({ title: "Mine-AN", type: "AN", isGlobal: false }),
      fixtureWorkout({ title: "Mine-O2", type: "O2", isGlobal: false }),
      fixtureWorkout({ title: "Seeded-AN", type: "AN", isGlobal: true }),
    ];
    const out = applyFilters(
      ws,
      { ...EMPTY_FILTERS, customOnly: true, type: "AN" },
      null,
    );
    expect(out.map((w) => w.title)).toEqual(["Mine-AN"]);
  });

  it("toggleCustom flips and clearFilters resets", () => {
    const on = toggleCustom(EMPTY_FILTERS);
    expect(on.customOnly).toBe(true);
    expect(toggleCustom(on).customOnly).toBe(false);
    expect(clearFilters().customOnly).toBe(false);
  });
});
```

`WorkoutRow.test.tsx`: badge renders for `isGlobal: false`, absent for a real
starter workout (`isGlobal: true`), and the row's accessible name gains
", custom workout" only for customs. `Library.test.tsx`: CUSTOM chip filters
the rendered list; ALL restores; the zero-customs empty state shows the
builder link (`No custom workouts yet`).

- [ ] **Step 2: Run, watch fail** (`pnpm test --project unit --project client
  -- filters WorkoutRow Library`).
- [ ] **Step 3: Implement.** `filters.ts`: add `customOnly: boolean` to
  `Filters` and `EMPTY_FILTERS`, `toggleCustom` in the `togglePain` idiom,
  and in `applyFilters` (beside the `painMax3` line):
  `if (f.customOnly && w.isGlobal) return false;`. `FilterChips.tsx`: a
  `CUSTOM` chip via the existing `Chip` component, wired to `toggleCustom`;
  extend `isEmptyFilters` with `!f.customOnly`. `WorkoutRow.tsx`: on line 2
  after `TypeBadge`: `{!workout.isGlobal && <span className="workout-row-custom">CUSTOM</span>}`
  plus the accessible-name addition. `Library.tsx`: when the filtered list is
  empty AND `filters.customOnly`, render the builder-link line (reuse the
  existing empty treatment; check what renders today for an empty filter
  result before adding anything). CSS per the Global Constraints tokens.
- [ ] **Step 4: Green**, then **self-mutations** (per briefing): invert the
  predicate (`!w.isGlobal` → `w.isGlobal`) — filter tests die; drop the
  `isEmptyFilters` extension — the ALL-active test dies (add one if none
  covers it); render the badge unconditionally — the global-row test dies.
- [ ] **Step 5: e2e** (this is `app/src/` product code → full suite per the
  briefing's gate table): extend the library flow — author a workout, tap
  CUSTOM, only it remains; tap ALL, the full list returns.
- [ ] **Step 6: Coverage per-file rows, commit**
  (`feat: custom workouts wear a badge and get their own filter`).

---

### Task 2: iOS callout fix + phase record

**Files:**
- Modify: `app/src/index.css` (the grouped `user-select` rule),
  `app/e2e/design.spec.ts` (computed-style assertions),
  `app/e2e/screenshots.spec.ts` (a custom workout visible in the library
  capture), `ROADMAP.md`, `docs/design/DEVIATIONS.md`

- [ ] **Step 1: Failing structural assertions** in `design.spec.ts`:

```ts
test("controls are not text-selectable; typed inputs are", async ({ page }) => {
  const chipSelect = await page
    .locator(".chip")
    .first()
    .evaluate((el) => getComputedStyle(el).userSelect);
  expect(chipSelect).toBe("none");

  const titleSelect = await page
    .getByLabel("Title")
    .evaluate((el) => getComputedStyle(el).userSelect);
  expect(titleSelect).not.toBe("none");
});
```

(Adjust the title field's accessible name to the real one — read
`Builder.tsx` first; the briefing's conventions section applies. Add the same
check for a stepper button and the collapsed card's EDIT control.)

- [ ] **Step 2: The CSS.** One grouped rule near the reset at the top of
  `index.css`, with a comment naming the device report:

```css
/* iOS: long-pressing a control must not pop the text-selection callout
   (Copy/Look Up/Translate) — WKWebView otherwise treats button text as
   selectable (device report, 2026-08-01). Inputs/textareas are deliberately
   NOT covered: typed text must stay selectable. Chromium can only assert
   the computed style; the callout behaviour itself is verified on device. */
button,
[role="radio"],
.chip,
.workout-row,
.stepper-value,
.pace-ref-display {
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}
```

Before committing, grep for other interactive-text classes this list misses
(`grep -n "onClick\|role=" app/src -r` on rendered spans) and extend the
selector list deliberately — say in the report which you added and which you
left selectable and why. **Note `.stepper-value` covers the span variant;
the input variants (`.stepper-value-input`, `.clock-input`) must stay
selectable** — they are typed fields.

- [ ] **Step 3: Screenshots.** The library capture must show at least one
  custom workout wearing the badge (the screenshots spec already authors
  workouts — reuse). Run `pnpm screenshots`, open the images, describe them.
- [ ] **Step 4: Record.** ROADMAP `## Phase 5H` section (5C–5G shape, PR
  #TBD); DEVIATIONS pass for the badge/chip additions.
- [ ] **Step 5: Full gate** (src change → everything), commit
  (`feat: silence the iOS selection callout on controls; record the phase`).

---

## Notes

- Two tasks, not three: the badge and filter share files and a reviewer
  would accept/reject them together; the callout fix rides with the record
  because both are one-file-plus-docs.
- The on-device callout verification is James's, post-merge — the PR must
  say so plainly (spec: "verified on device by James", not pretended into
  e2e).
