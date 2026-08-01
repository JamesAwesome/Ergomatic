# Phase 5G — MAX/MIN effort refs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A workout can say "30 seconds max" or "20 minutes easy" — stored as a
real effort reference, not a stand-in offset.

**Architecture:** `PaceRef` becomes a key-presence union (`SplitRef |
EffortRef`) so every stored workout is already valid. One new domain function
(`estimationSplit`) owns the only place an effort turns into a number; one new
function (`effortWord`) owns the ALL OUT/EASY display pair. Everything else is
consumers switching on `isEffortRef`.

**Tech Stack:** TypeScript strict ESM, React 19, Vitest 4, Playwright, pnpm.

**Spec:** `docs/superpowers/specs/2026-08-01-phase-5g-effort-refs-design.md` —
read it before Task 1.

## Global Constraints

- **SDLC (binding):** all work in the existing worktree
  `.claude/worktrees/phase-5g`, branch `phase-5g-effort-refs`. **Run
  `git rev-parse --show-toplevel` before every commit and confirm it prints
  that worktree path.** Hooks are installed and verified in this worktree
  (`pnpm install` was run at both roots). Never merge/close/approve PRs, never
  remove worktrees, never `git stash`.
- **The union is additive:** `PaceRef = SplitRef | EffortRef`, discriminated by
  key presence (`isEffortRef`). Every currently-stored `{base, off}` ref must
  remain valid and behave byte-identically. No migration.
- **Chips read `MAX`/`MIN`; range positions read `ALL OUT`/`EASY`** — the pair
  lives in one function (`effortWord`) and nowhere else.
- **Efforts take no offset.** `max+2` fails parse and validation.
- **SPM is fully independent of the ref.** `"0:30 max @ 32"` and
  `"20:00 easy @ 18"` are legal; **no validation rule may couple SPM (or rest)
  to the ref arm.**
- **One estimation rule:** `estimationSplit` — split refs resolve normally,
  `max` → `baselines.k2Seconds`, `min` → `baselines.k6Seconds + 20`. Estimates
  feed totals/durations/filters only; they are never rendered as a target.
- **`app/domain/` is dependency-zero, pinned at 100% coverage**; `.js` import
  extensions; the coverage text reporter omits some dirs — the HTML report
  under `app/coverage/` is authoritative.
- **The 90×4 coverage gate is an aggregate** — read per-file rows for every
  file you touch.
- 44×44 px hit targets; WCAG AA (compute ratios, report numbers); CSS custom
  properties only; 16px minimum on inputs.
- **`pnpm e2e` before reporting done on any `app/src/` change**; `pnpm
  screenshots` when a screen's layout changes — open the images and look.
- Realistic fixtures: at least one test per client task starts from a real
  starter workout (`app/server/seed/starter.ts`) via `fromWorkout`.
- Aria-label conventions: rows are `Row N …`; editor header buttons are
  `Step N …`. Three 5F tasks lost time to this.
- TDD: failing test first, run it, then implement. `pnpm` only, commands from
  `app/`, `export PATH="$HOME/.local/share/nvm/v26.5.0/bin:$PATH"` first.
- **If the plan contradicts the code, say so in your report** — six plan
  errors were caught this way in 5F.

---

### Task 1: The union and the pace helpers

**Files:**
- Modify: `app/domain/types.ts:3-7`
- Modify: `app/domain/pace.ts`
- Test: `app/domain/pace.test.ts`, `app/domain/types` consumers compile

**Interfaces:**
- Produces (every later task consumes these — exact names):
  - `type PaceRef = SplitRef | EffortRef`; `interface SplitRef { base: PaceBase; off: number }`; `interface EffortRef { effort: Effort }`; `type Effort = "max" | "min"`
  - `isEffortRef(ref: PaceRef): ref is EffortRef`
  - `parsePaceRef(input: string): PaceRef | null` — now also `max`/`min`, case-insensitive, no offset allowed
  - `resolveSplit(baselines, ref: SplitRef, nudge?): number` — **signature narrows to SplitRef**
  - `effortWord(effort: Effort): "ALL OUT" | "EASY"`
  - `estimationSplit(baselines: Baselines, ref: PaceRef): number`
  - `refLabel(ref: PaceRef): string` — `"2k"`, `"6k −2"`, `"MAX"`, `"MIN"`

- [ ] **Step 1: Write the failing tests** — append to `app/domain/pace.test.ts`:

```ts
describe("effort refs", () => {
  it.each([
    ["max", { effort: "max" }],
    ["MAX", { effort: "max" }],
    ["min", { effort: "min" }],
    [" Min ", { effort: "min" }],
  ])("parses %s", (input, expected) => {
    expect(parsePaceRef(input)).toStrictEqual(expected);
  });

  it.each(["max+2", "min-1", "max 2", "maxx", "2kmax"])(
    "rejects %s — efforts take no offset",
    (input) => {
      expect(parsePaceRef(input)).toBeNull();
    },
  );

  it("still parses every split form unchanged", () => {
    expect(parsePaceRef("6k-2")).toStrictEqual({ base: "6k", off: -2 });
    expect(parsePaceRef("2k")).toStrictEqual({ base: "2k", off: 0 });
  });

  it("discriminates the arms", () => {
    expect(isEffortRef({ effort: "max" })).toBe(true);
    expect(isEffortRef({ base: "2k", off: 0 })).toBe(false);
  });

  it("maps efforts to the display pair", () => {
    expect(effortWord("max")).toBe("ALL OUT");
    expect(effortWord("min")).toBe("EASY");
  });

  it("labels refs with the chip word", () => {
    expect(refLabel({ effort: "max" })).toBe("MAX");
    expect(refLabel({ effort: "min" })).toBe("MIN");
    expect(refLabel({ base: "6k", off: -2 })).toBe("6k −2");
    expect(refLabel({ base: "2k", off: 0 })).toBe("2k");
  });

  describe("estimationSplit — the ONLY place an effort becomes a number", () => {
    const baselines = { k2Seconds: 112, k6Seconds: 122 };
    it("resolves split refs exactly like resolveSplit", () => {
      expect(estimationSplit(baselines, { base: "6k", off: -2 })).toBe(120);
    });
    it("prices max from the 2k baseline", () => {
      expect(estimationSplit(baselines, { effort: "max" })).toBe(112);
    });
    it("prices min from 6k + 20", () => {
      expect(estimationSplit(baselines, { effort: "min" })).toBe(142);
    });
  });
});
```

- [ ] **Step 2: Run and watch them fail** — `pnpm test --project unit -- pace`
  → FAIL (`isEffortRef` etc. not exported).

- [ ] **Step 3: Implement.** `types.ts`:

```ts
export type PaceBase = "2k" | "6k";
export type Effort = "max" | "min";
export interface SplitRef {
  base: PaceBase;
  off: number; // off: seconds per 500m, negative = faster
}
// "30 seconds max" / "20 minutes easy" — a real effort prescription, not a
// stand-in offset. Key-presence union: every stored {base, off} ref is
// already a valid SplitRef, so nothing migrates (Phase 5G spec, "Decisions").
export interface EffortRef {
  effort: Effort;
}
export type PaceRef = SplitRef | EffortRef;
```

`pace.ts` — add alongside the existing exports (resolveSplit's `ref` param
narrows to `SplitRef`; its body is unchanged):

```ts
export function isEffortRef(ref: PaceRef): ref is EffortRef {
  return "effort" in ref;
}

const EFFORT_RE = /^(max|min)$/i;

// inside parsePaceRef, before the split regex:
//   const effort = EFFORT_RE.exec(trimmed);
//   if (effort) return { effort: effort[1].toLowerCase() as Effort };

/** The one place the display pair lives — builder TARGET strip, detail
 *  screen, and (Phase 6) the timer all call this, so the words cannot
 *  drift. Chips render MAX/MIN (refLabel); range positions render these. */
export function effortWord(effort: Effort): "ALL OUT" | "EASY" {
  return effort === "max" ? "ALL OUT" : "EASY";
}

/** The ONLY function that turns an effort into a number. max prices from
 *  the 2k baseline, min from 6k + 20 s/500m. Estimates feed duration
 *  totals and filter buckets; they are NEVER rendered as a target — the
 *  target for an effort step is the word (effortWord), and expand.ts marks
 *  such phases targetKind: "effort" so the timer knows the number is
 *  scheduling, not prescription. */
export function estimationSplit(baselines: Baselines, ref: PaceRef): number {
  if (!isEffortRef(ref)) return resolveSplit(baselines, ref);
  return ref.effort === "max" ? baselines.k2Seconds : baselines.k6Seconds + 20;
}

/** Chip-word label: "2k", "6k −2" (U+2212), "MAX", "MIN". */
export function refLabel(ref: PaceRef): string {
  if (isEffortRef(ref)) return ref.effort === "max" ? "MAX" : "MIN";
  if (ref.off === 0) return ref.base;
  const sign = ref.off < 0 ? "−" : "+";
  return `${ref.base} ${sign}${Math.abs(ref.off)}`;
}
```

Note: `app/src/workout/StepRow.tsx` has a private `refLabel` — do NOT touch it
in this task; Task 5 replaces it with this import.

- [ ] **Step 4: Run to green** — `pnpm test --project unit -- pace`, then the
  full unit project (`resolveSplit`'s narrowed signature may flag consumers —
  if `pnpm typecheck` fails in files this task doesn't own, that is EXPECTED
  and the fix belongs to Tasks 2–5; report which files, add `// @ts-expect-error`
  NOWHERE, and instead keep `resolveSplit`'s param as `PaceRef` with a
  `if (isEffortRef(ref)) throw new Error("resolveSplit requires a split ref")`
  guard so the repo compiles between tasks. Test the throw.)

- [ ] **Step 5: Coverage + commit**

```bash
pnpm test:coverage --project unit   # domain/pace.ts must be 100% (HTML report)
git rev-parse --show-toplevel
git add app/domain && git commit -m "feat: PaceRef grows an effort arm; one estimation rule, one display pair"
```

---

### Task 2: expand, validate, bulk

**Files:**
- Modify: `app/domain/expand.ts` (Phase interface + `phases()` work case),
  `app/domain/validate.ts:20-31` (`checkRef`), `app/domain/bulk.ts` (ref
  parsing error message)
- Test: `app/domain/expand.test.ts`, `app/domain/validate.test.ts`,
  `app/domain/bulk.test.ts`

**Interfaces:**
- Consumes: Task 1's exports.
- Produces: `Phase` gains `targetKind?: "split" | "effort"` (set on every
  work phase); effort work phases get `label: effortWord(...)` and
  `targetSplit: estimationSplit(...)`. `validateSteps` accepts both arms.
  Bulk parses `0:30 max`, errors `max+2` per-line with
  `effort refs take no offset`.

- [ ] **Step 1: Failing tests.** `expand.test.ts`:

```ts
it("marks an effort work phase and labels it with the effort word", () => {
  const phases_ = phases(
    [{ k: "w", duration: { kind: "time", minutes: 0.5 }, ref: { effort: "max" }, spm: 32 }],
    { k2Seconds: 112, k6Seconds: 122 },
    1,
  );
  expect(phases_[0]).toMatchObject({
    type: "work",
    targetKind: "effort",
    targetSplit: 112, // estimationSplit(max) — scheduling only, never shown
    label: "ALL OUT",
    spm: 32,
  });
});

it("marks split work phases targetKind split and behaves as before", () => {
  const phases_ = phases(
    [{ k: "w", duration: { kind: "time", minutes: 1 }, ref: { base: "6k", off: -2 } }],
    { k2Seconds: 112, k6Seconds: 122 },
    1,
  );
  expect(phases_[0]).toMatchObject({ targetKind: "split", targetSplit: 120 });
  expect(phases_[0]!.label).toContain("–"); // still a range label
});

it("estimates a distance-at-max step's minutes from the 2k baseline", () => {
  const mins = estimateMinutes(
    [{ k: "w", duration: { kind: "distance", meters: 500 }, ref: { effort: "max" } }],
    { k2Seconds: 112, k6Seconds: 122 },
  );
  expect(mins.minutes).toBe(Math.round((500 / 500) * 112 / 60));
});
```

`validate.test.ts`:

```ts
it("accepts an effort ref with any duration kind, spm and rest", () => {
  const res = validateWorkoutInput({
    title: "T", type: "AN", difficulty: "hard", pain: 5,
    steps: [
      { k: "w", duration: { kind: "time", minutes: 0.5 }, ref: { effort: "max" }, spm: 32, restMinutes: 1 },
      { k: "w", duration: { kind: "distance", meters: 500 }, ref: { effort: "min" } },
    ],
  });
  expect(res.ok).toBe(true);
});

it("rejects an effort ref with extra keys or a bad effort", () => {
  for (const ref of [{ effort: "max", off: 2 }, { effort: "hard" }, { effort: "" }]) {
    const res = validateWorkoutInput({
      title: "T", type: "AN", difficulty: "hard", pain: 5,
      steps: [{ k: "w", duration: { kind: "time", minutes: 1 }, ref }],
    });
    expect(res.ok, JSON.stringify(ref)).toBe(false);
  }
});
```

`bulk.test.ts`:

```ts
it("parses effort lines", () => {
  const res = parseBulk("Sprints\nAN hard 5\n0:30 max 32\n500m min\n");
  expect(res.ok).toBe(true);
  if (!res.ok) return;
  const [a, b] = res.blocks[0]!.steps.filter((s) => s.k === "w");
  expect(a).toMatchObject({ ref: { effort: "max" }, spm: 32 });
  expect(b).toMatchObject({ ref: { effort: "min" } });
});

it("errors max+2 per line", () => {
  const res = parseBulk("Sprints\nAN hard 5\n0:30 max+2\n");
  expect(res.ok).toBe(false);
  if (res.ok) return;
  expect(res.errors[0]!.message).toContain("effort refs take no offset");
});
```

(Adjust bulk fixture shape to that file's real conventions — read a
neighbouring test first; 5F's Task 2 hit exactly this.)

- [ ] **Step 2: Run, watch fail.**
- [ ] **Step 3: Implement.** `expand.ts` work case becomes:

```ts
case "w": {
  const base: Phase = isEffortRef(s.ref)
    ? {
        type: "work",
        targetKind: "effort",
        targetSplit: estimationSplit(baselines, s.ref),
        spm: s.spm,
        label: effortWord(s.ref.effort),
        set,
      }
    : {
        type: "work",
        targetKind: "split",
        targetSplit: resolveSplit(baselines, s.ref),
        spm: s.spm,
        label: toleranceRange(resolveSplit(baselines, s.ref), tol).label,
        set,
      };
  // duration/rest handling unchanged
```

(Hoist the double `resolveSplit` into a local. `Phase.targetKind` is optional
in the interface so non-work phases don't carry it.)

`validate.ts` `checkRef` — accept either arm; for the effort arm require
`Object.keys(v).length === 1` and `v.effort === "max" || v.effort === "min"`.
Keep the error message `step ${i}: invalid pace ref`.

`bulk.ts` — where `parsePaceRef` returns null, if the token matches
`/^(max|min)[+-]/i` emit `effort refs take no offset`, else the existing
`bad pace ref` message.

- [ ] **Step 4: The compatibility sweep** (the test that matters most):

```ts
it("every seeded starter workout validates and resolves byte-identically", async () => {
  const { STARTER_WORKOUTS } = await import("../server/seed/starter.js");
  for (const w of STARTER_WORKOUTS) {
    const res = validateWorkoutInput(w);
    expect(res.ok, w.title).toBe(true);
  }
});
```

(Match however 5F's tests already import the starter set — check
`builderState.test.ts` for the established import path/pattern. If domain
tests must not import from `server/`, put this sweep in the server or client
test tree instead and say so in your report.)

- [ ] **Step 5: Green, coverage (all three files 100%), commit**

```bash
git rev-parse --show-toplevel
git add app/domain && git commit -m "feat: efforts flow through phases, validation and bulk"
```

---

### Task 3: builderState round trip

**Files:**
- Modify: `app/src/builder/builderState.ts` (`BuilderRow`, `newRow`,
  `toSteps` ref block, `stepToRow`, `stepSummary`)
- Test: `app/src/builder/builderState.test.ts`

**Interfaces:**
- Consumes: Task 1's union + helpers.
- Produces: `BuilderRow` gains `refEffort: Effort | null` (null = split mode;
  `refBase`/`refOff` retain their values while an effort is selected, which is
  what makes the chip round trip restore the offset). `toSteps` emits
  `{ effort }` when `refEffort` is set, else `{ base, off }` as today.
  `stepSummary` renders `0:30 @ MAX`.

- [ ] **Step 1: Failing tests:**

```ts
describe("effort refs in rows", () => {
  it("round-trips an effort step", () => {
    const form = fromWorkout({
      title: "Sprints", type: "AN", difficulty: "hard", pain: 5,
      steps: [{ k: "w", duration: { kind: "time", minutes: 0.5 }, ref: { effort: "max" }, spm: 32 }],
    });
    expect(form.rows[0]).toMatchObject({ refEffort: "max" });
    const res = toSteps(form);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.steps[0]).toMatchObject({ ref: { effort: "max" }, spm: 32 });
  });

  it("preserves the split offset across a chip round trip", () => {
    let row = { ...newRow("w"), durValue: "1:00", refBase: "6k" as const, refOff: -2 };
    row = { ...row, refEffort: "max" };          // user taps MAX
    expect(row.refOff).toBe(-2);                  // still held
    row = { ...row, refEffort: null };            // user taps 6K again
    const res = toSteps({ ...newForm(), title: "T", pain: 3, rows: [row] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.steps[0]).toMatchObject({ ref: { base: "6k", off: -2 } });
  });

  it("summarises with the chip word", () => {
    const row = { ...newRow("w"), durValue: "0:30", refEffort: "max" as const };
    expect(stepSummary(row)).toBe("0:30 @ MAX");
  });

  it("emits no offset key for an effort", () => {
    const row = { ...newRow("w"), durValue: "0:30", refEffort: "min" as const, refOff: 7 };
    const res = toSteps({ ...newForm(), title: "T", pain: 3, rows: [row] });
    if (!res.ok) throw new Error("expected ok");
    expect(res.steps[0]).toMatchObject({ ref: { effort: "min" } });
    expect((res.steps[0] as { ref: object }).ref).not.toHaveProperty("off");
  });
});
```

- [ ] **Step 2–4:** run-fail → implement (`newRow` sets `refEffort: null`;
  `toSteps` builds `const ref: PaceRef = row.refEffort ? { effort: row.refEffort } : { base: row.refBase, off: row.refOff };` and skips the ±60
  check for efforts; `stepToRow` sets `refEffort` from `isEffortRef` and
  leaves `refBase`/`refOff` at defaults; `stepSummary` uses `refLabel`) → green.
  `rowMinutes`' distance branch switches `resolveSplit` → `estimationSplit` so
  a distance-at-MAX row still contributes to totals.
- [ ] **Step 5:** per-file coverage on `builderState.ts`, commit
  `feat: builder rows carry effort refs and round-trip them`.

---

### Task 4: PaceRefInput chips + TARGET strip

**Files:**
- Modify: `app/src/builder/PaceRefInput.tsx`, `app/src/builder/StepEditor.tsx`
  (TARGET strip + splitLabel plumbing), `app/src/builder/Builder.tsx`
  (`splitLabelFor`), `app/src/index.css` if spacing needs it
- Test: `app/src/builder/PaceRefInput.test.tsx`,
  `app/src/builder/StepEditor.test.tsx`, `app/src/builder/Builder.test.tsx`

**Interfaces:**
- Consumes: `refEffort` on rows (Task 3), `effortWord` (Task 1).
- Produces: `PaceRefInput` props become
  `{ base, off, effort: Effort | null, onChange(next: { base; off; effort }) , rowLabel, invalid?, errorId? }`.
  One radiogroup `2K | 6K | MAX | MIN`; selecting an effort hides the offset
  stepper; selecting a base restores it with the held offset.

- [ ] **Step 1: Failing tests** (`PaceRefInput.test.tsx`, matching its
  existing render/keyboard test conventions):

```tsx
it("renders four chips in one radiogroup", () => {
  renderInput({ effort: null });
  const group = screen.getByRole("radiogroup", { name: "Row 1 pace base" });
  expect(within(group).getAllByRole("radio")).toHaveLength(4);
});

it("hides the offset stepper while an effort is selected", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  renderInput({ effort: null, off: -2, onChange });
  await user.click(screen.getByRole("radio", { name: "Row 1 pace MAX" }));
  expect(onChange).toHaveBeenLastCalledWith({ base: "6k", off: -2, effort: "max" });
});

it("keyboard-navigates across all four chips and wraps", async () => {
  // extend the existing arrow-key test to 4 chips: Right from MIN wraps to 2K
});

it("restores the held offset when a base chip is re-selected", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  renderInput({ effort: "max", off: -2, onChange });
  expect(screen.queryByLabelText("Row 1 pace faster")).not.toBeInTheDocument();
  await user.click(screen.getByRole("radio", { name: "Row 1 pace 6K" }));
  expect(onChange).toHaveBeenLastCalledWith({ base: "6k", off: -2, effort: null });
});
```

`StepEditor.test.tsx`: TARGET reads `ALL OUT` when the row is `refEffort:
"max"` (and `EASY` for `"min"`), in the existing target-value element, not a
new one. `Builder.test.tsx`: a real starter workout opened via the edit path
with a MAX row (hand-patch one row's ref) shows `ALL OUT` and no offset
stepper.

- [ ] **Step 2–4:** fail → implement → green. Implementation notes:
  - `CHIPS: readonly { value: PaceBase | Effort; kind: "base" | "effort" }[]`
    drives one map; roving tabindex wraps across all four (the existing
    `selectByIndex` modulo just changes length).
  - Chip `aria-label`s: `Row N pace 2K` … `Row N pace MAX` (uppercase word).
  - The offset `<div className="pace-ref-offset">` renders only when
    `effort === null`. **Do not unmount-and-lose state** — the offset lives in
    the row, not the component, so hiding is safe (Task 3 guarantees the
    round trip).
  - `Builder.tsx`'s `splitLabelFor` returns `effortWord(effort)` styling-wise
    identical to a resolved label; StepEditor's TARGET block needs no
    baselines for an effort row (an effort target renders even when baselines
    are unset — it's a word, not a resolution; note this in a comment, it is
    a deliberate difference from split rows' "no target / Set baselines"
    state).
- [ ] **Step 5:** `pnpm test --project unit --project client`, **`pnpm e2e`**,
  per-file coverage, commit
  `feat: MAX/MIN chips; the TARGET strip speaks effort words`.

---

### Task 5: Detail screen

**Files:**
- Modify: `app/src/workout/StepRow.tsx` (delete its private `refLabel`,
  import the domain's; effort branch: word instead of range, no nudges)
- Test: `app/src/workout/StepRow.test.tsx`,
  `app/src/workout/WorkoutDetail.test.tsx` if its fixtures need an effort case

**Interfaces:** Consumes `isEffortRef`, `effortWord`, `refLabel`,
`fmtDurationSpoken`.

- [ ] **Step 1: Failing tests:**

```tsx
it("renders an effort step's word where the range sits, with no nudges", () => {
  render(
    <StepRow
      step={{ k: "w", duration: { kind: "time", minutes: 0.5 }, ref: { effort: "max" }, spm: 32 }}
      baselines={{ k2Seconds: 112, k6Seconds: 122 }}
      tolerance={1}
      nudge={0}
      onNudge={() => {}}
    />,
  );
  expect(screen.getByText("0:30 @ MAX")).toBeInTheDocument();
  expect(screen.getByText("ALL OUT")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /nudge/i })).not.toBeInTheDocument();
  expect(screen.queryByText(/–/)).not.toBeInTheDocument(); // no range en-dash
});

it("speaks the effort, not digits", () => {
  // accessible name contains "30 seconds" and "max effort" (or the ALL OUT word)
});

it("renders an effort word even with no baselines", () => {
  // baselines={null}: split rows show their no-baselines fallback; an effort
  // row still shows ALL OUT — a word needs no resolution.
});
```

(Match the nudge buttons' real accessible names — read the component first;
if they are `▲`/`▼` with aria-labels, query those.)

- [ ] **Step 2–4:** fail → implement → green.
- [ ] **Step 5:** **`pnpm e2e`**, coverage, commit
  `feat: the detail screen renders effort steps as words, nudge-free`.

---

### Task 6: Seed audit

**Files:**
- Modify: `app/server/seed/starter.ts` (only steps the book prescribes as
  max/all-out/easy)
- Create: `.superpowers/sdd/<workspace>/seed-audit.md` (the PR table — the
  controller will lift it into the PR body)
- Test: existing seed/validation suites must stay green; integration seed test
  if one asserts step shapes

**Rules (from the spec, binding):**
- Only steps the Erg Book genuinely prescribes as max/all-out/easy change.
  **Steady-pace prescriptions keep numeric refs even when slow** — Doldrums'
  `6k+16` is steady, not "easy".
- The audit table columns: workout · step · old ref · new ref · book
  justification (quote or paraphrase the prescription). Every changed row AND
  every *candidate you considered and left alone* appears — the "left alone"
  rows are what lets James review the judgement, not just the diff.
- If NO step qualifies, that is a legitimate outcome: deliver the table with
  zero changed rows and say so. Do not force changes to justify the task.

- [ ] **Step 1:** read `starter.ts` end to end; list candidates (grep for the
  extreme offsets first: `2k-` anything and `6k+1[0-9]`).
- [ ] **Step 2:** write the audit table BEFORE changing code.
- [ ] **Step 3:** apply only the table's changed rows; run
  `pnpm test --project unit --project integration` (integration needs Docker).
- [ ] **Step 4:** commit `feat: starter workouts say max/easy where the book does`
  (or `docs:` + table only, if zero rows changed).

---

### Task 7: e2e, screenshots, the record

**Files:**
- Modify: `app/e2e/builder.spec.ts` (author-an-effort flow),
  `app/e2e/design.spec.ts` (MAX-selected sweep), `app/e2e/screenshots.spec.ts`
  (a MAX step in the builder + detail captures)
- Modify: `ROADMAP.md`, `docs/design/DEVIATIONS.md`,
  `docs/design/builder-redesign/README.md` (pace control now four chips)

- [ ] **Step 1: The flow test** (failing first if written before Task 4 lands
  is impossible — this task runs last, so it should pass immediately; if it
  fails, that is a real finding):

```ts
test("authors 0:30 max @ 32, saves, reopens as ALL OUT with no nudges", async ({ page }) => {
  // builder: type 30 into Row 1 duration, tap MAX, set SPM 32, save
  // detail: expect "0:30 @ MAX", "ALL OUT", zero nudge buttons
  // edit: reopen, expect MAX chip aria-checked and no offset stepper
});
```

- [ ] **Step 2: Design sweep with MAX selected** — inside the builder
  describe, a sub-describe that taps MAX first, then runs `assertTapTargets`
  and `assertNoA11yViolations`. The hidden-stepper layout is a new state; a
  split-only sweep repeats the `kind:"w"` fixture blind spot.
- [ ] **Step 3: Screenshots** — builder capture gains a MAX step (visible in
  the collapsed list, `0:30 @ MAX`); the detail capture's personal workout
  gains one so `ALL OUT` shows. `pnpm screenshots`, **open both images,
  describe them in the report.**
- [ ] **Step 4: Docs** — ROADMAP `## Phase 5G` section (5C–5F shape, PR #TBD,
  custom badge/filter noted as 5H); DEVIATIONS end-to-end pass;
  builder-redesign README's pace-control paragraph updated to four chips.
- [ ] **Step 5: Full gate** — lint, typecheck, format:check, test:coverage,
  e2e, screenshots. Commit
  `test: effort flows, MAX-state design sweep; record the phase`.

---

## Notes for the executing agent

- Task 1's `resolveSplit` guard (`throw` on effort) exists so the repo
  compiles between tasks; Tasks 2–5 remove every call site that could reach
  it with an effort. The final review should confirm the throw is
  unreachable-by-construction from UI paths.
- `formatRef` in `PaceRefInput.tsx` and `fmtSignedOffset` in `builderState.ts`
  pre-date `refLabel`; Task 4/3 may leave them (they format the offset
  display, which still exists in split mode). Do not unify them into
  `refLabel` unless the diff stays small — flag it instead.
- **The words live in `effortWord` only.** If you find yourself typing the
  string `"ALL OUT"` anywhere outside `pace.ts` and its tests, stop.
