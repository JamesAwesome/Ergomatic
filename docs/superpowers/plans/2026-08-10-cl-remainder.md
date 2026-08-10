# CL Remainder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Builder draft persistence (the CL unsaved-changes item, shipped as autosave/restore, not a navigation guard), plus the ROADMAP close-out adjudications the spec records.

**Architecture:** A new `builderDraft.ts` module mirrors `session/draft.ts`'s localStorage discipline (single slot, shape-validated load, throw-safe writes). `Builder.tsx` gains a save-on-dirty effect, a restore-on-mount path with a staleness fingerprint guard, and a `Draft restored.` notice with a two-tap START OVER. Row ids are session-counter-based and NEVER participate in equality; restored rows get fresh ids via a new `adoptForm` helper beside the counter.

**Tech Stack:** React 19, localStorage, Vitest (client project), Playwright.

**Spec:** `docs/superpowers/specs/2026-08-10-cl-remainder-design.md` (approved by James 2026-08-10).

## Global Constraints

- Worktree `.claude/worktrees/cl-remainder`, branch `cl-remainder`. `git rev-parse --show-toplevel` before every commit.
- No em dash in any user-facing string (periods/colons instead). The notice copy is exactly `Draft restored.` and the armed copy exactly `Tap again to start over`.
- Hit targets ≥44px; CSS custom properties only; contrast computed, not judged.
- HANDS OFF (rebalance session owns): `server/seed/library/*.ts`, `domain/generation/**`, `scripts/library-*.ts`, `library.test.ts`, `variety.test.ts`, ROADMAP's Phase 9 regen line. (Reading `LIBRARY_WORKOUTS` in a test fixture is fine; editing those files is not.)
- No new migrations.
- Every behavioral test gets a self-mutation (briefing).
- Test invocation: `pnpm test`, never bare vitest (Node 26 webStorage trap).

---

### Task 1: `builderDraft.ts` + `adoptForm`

**Files:**
- Create: `app/src/builder/builderDraft.ts`
- Modify: `app/src/builder/builderState.ts` (add `adoptForm` beside the counter, ~line 76)
- Test: `app/src/builder/builderDraft.test.ts`

**Interfaces:**
- Produces: `BUILDER_DRAFT_KEY`, `BuilderDraft` (interface), `formFingerprint(f: BuilderForm): string`, `saveBuilderDraft(d: BuilderDraft): boolean`, `loadBuilderDraft(): BuilderDraft | null`, `clearBuilderDraft(): void`, and `builderState.ts`'s `adoptForm(f: BuilderForm): BuilderForm`. Task 2 consumes all of these.

- [ ] **Step 1: Write the failing tests**

```typescript
// app/src/builder/builderDraft.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  BUILDER_DRAFT_KEY,
  clearBuilderDraft,
  formFingerprint,
  loadBuilderDraft,
  saveBuilderDraft,
  type BuilderDraft,
} from "./builderDraft";
import { adoptForm, newForm, newRow } from "./builderState";

function draftOf(form = newForm(), baseline = newForm()): BuilderDraft {
  return {
    v: 1,
    mode: { kind: "new" },
    form,
    baseline,
    savedAt: "2026-08-10T00:00:00.000Z",
  };
}

describe("formFingerprint", () => {
  it("two pristine forms fingerprint identically despite different row ids", () => {
    const a = newForm();
    const b = newForm();
    expect(a.rows[0].id).not.toBe(b.rows[0].id); // the counter guarantees this
    expect(formFingerprint(a)).toBe(formFingerprint(b));
  });

  it("changes when ANY non-id row field or form field changes", () => {
    const base = newForm();
    const baseFp = formFingerprint(base);
    // form-level fields
    expect(formFingerprint({ ...base, title: "x" })).not.toBe(baseFp);
    expect(formFingerprint({ ...base, type: "AT" })).not.toBe(baseFp);
    expect(formFingerprint({ ...base, difficulty: "hard" })).not.toBe(baseFp);
    expect(formFingerprint({ ...base, pain: 3 })).not.toBe(baseFp);
    expect(formFingerprint({ ...base, reps: 4 })).not.toBe(baseFp);
    // every enumerable row field except id — future-field guard: iterate
    // the row's own keys so a new BuilderRow field that the fingerprint
    // ignores fails THIS test the day it is added.
    const row = newRow("w");
    for (const key of Object.keys(row).filter((k) => k !== "id")) {
      const mutated = {
        ...base,
        rows: [{ ...base.rows[0], [key]: "MUTANT" }],
      };
      expect(formFingerprint(mutated), `field ${key}`).not.toBe(baseFp);
    }
  });

  it("row count and order participate", () => {
    const base = newForm();
    const twoRows = { ...base, rows: [...base.rows, newRow("r")] };
    expect(formFingerprint(twoRows)).not.toBe(formFingerprint(base));
    const swapped = { ...twoRows, rows: [...twoRows.rows].reverse() };
    expect(formFingerprint(swapped)).not.toBe(formFingerprint(twoRows));
  });
});

describe("save/load/clear round trip", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a draft and load returns the stored forms", () => {
    const d = draftOf({ ...newForm(), title: "Half done" });
    expect(saveBuilderDraft(d)).toBe(true);
    const back = loadBuilderDraft();
    expect(back?.form.title).toBe("Half done");
    expect(back?.mode).toEqual({ kind: "new" });
  });

  it("edit-mode drafts carry their workoutId", () => {
    saveBuilderDraft({ ...draftOf(), mode: { kind: "edit", workoutId: "w-1" } });
    expect(loadBuilderDraft()?.mode).toEqual({ kind: "edit", workoutId: "w-1" });
  });

  it("clear removes the slot", () => {
    saveBuilderDraft(draftOf());
    clearBuilderDraft();
    expect(loadBuilderDraft()).toBeNull();
    expect(localStorage.getItem(BUILDER_DRAFT_KEY)).toBeNull();
  });

  it("garbage, wrong version, and shape-invalid payloads load as null", () => {
    localStorage.setItem(BUILDER_DRAFT_KEY, "not json {");
    expect(loadBuilderDraft()).toBeNull();
    localStorage.setItem(BUILDER_DRAFT_KEY, JSON.stringify({ v: 2 }));
    expect(loadBuilderDraft()).toBeNull();
    localStorage.setItem(
      BUILDER_DRAFT_KEY,
      JSON.stringify({ v: 1, mode: { kind: "new" }, form: { rows: "no" } }),
    );
    expect(loadBuilderDraft()).toBeNull();
    localStorage.setItem(
      BUILDER_DRAFT_KEY,
      JSON.stringify({ v: 1, mode: { kind: "edit" }, ...draftOf() }),
    );
    // edit mode without a workoutId string is invalid
    expect(loadBuilderDraft()).toBeNull();
  });
});

describe("adoptForm", () => {
  it("remaps every row id to a fresh one and touches nothing else", () => {
    const original = { ...newForm(), title: "keep me" };
    original.rows = [...original.rows, newRow("r")];
    const adopted = adoptForm(original);
    expect(adopted.title).toBe("keep me");
    expect(adopted.rows).toHaveLength(2);
    adopted.rows.forEach((row, i) => {
      expect(row.id).not.toBe(original.rows[i].id);
      const { id: _a, ...restAdopted } = row;
      const { id: _b, ...restOriginal } = original.rows[i];
      expect(restAdopted).toEqual(restOriginal);
    });
    const ids = adopted.rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run (from `app/`): `pnpm test --project client -- src/builder/builderDraft.test.ts`
Expected: FAIL — module `./builderDraft` not found, `adoptForm` not exported.

- [ ] **Step 3: Implement**

```typescript
// app/src/builder/builderDraft.ts
import type { BuilderForm } from "./builderState";

/** localStorage key for the builder draft — one slot, same discipline as
 *  session/draft.ts's DRAFT_KEY. Exported so tests never hardcode it. */
export const BUILDER_DRAFT_KEY = "ergomatic.builderDraft";

/** The persisted draft. `baseline` is the pristine form the draft diverged
 *  from (newForm() in new mode, fromWorkout(w) in edit mode), stored so a
 *  restore can detect staleness: if the CURRENT pristine form no longer
 *  fingerprints equal to `baseline`, the workout changed elsewhere and the
 *  draft is dropped, never merged. */
export interface BuilderDraft {
  v: 1;
  mode: { kind: "new" } | { kind: "edit"; workoutId: string };
  form: BuilderForm;
  baseline: BuilderForm;
  savedAt: string;
}

/** Equality for forms MINUS row identity. Row ids come from a module-local
 *  session counter (builderState.ts's nextRowId) and differ between any two
 *  calls of newForm()/fromWorkout(), so raw JSON equality never holds across
 *  mounts — every comparison in this feature goes through this fingerprint.
 *  Field order is fixed by construction here (explicit arrays), so object
 *  key insertion order can never perturb it. The companion test iterates a
 *  real row's own keys, so a future BuilderRow field this list forgets
 *  fails that test the day the field is added. */
export function formFingerprint(f: BuilderForm): string {
  return JSON.stringify([
    f.title,
    f.type,
    f.difficulty,
    f.pain,
    f.reps,
    f.rows.map((r) => [
      r.kind,
      r.durValue,
      r.durUnit,
      r.refBase,
      r.refOff,
      r.refEffort,
      r.spm,
      r.rest,
    ]),
  ]);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Loose on purpose, like session/draft.ts's isSessionDraft: enough shape to
// not crash Builder's render, not full domain validation. Every field the
// restore path reads unconditionally is checked.
function isBuilderForm(value: unknown): value is BuilderForm {
  if (!isPlainRecord(value)) return false;
  return (
    typeof value.title === "string" &&
    typeof value.type === "string" &&
    typeof value.difficulty === "string" &&
    Array.isArray(value.rows) &&
    value.rows.every(
      (r: unknown) => isPlainRecord(r) && typeof r.id === "string",
    ) &&
    typeof value.reps === "number"
  );
}

function isBuilderDraft(value: unknown): value is BuilderDraft {
  if (!isPlainRecord(value) || value.v !== 1) return false;
  const mode = value.mode;
  if (!isPlainRecord(mode)) return false;
  const modeOk =
    mode.kind === "new" ||
    (mode.kind === "edit" && typeof mode.workoutId === "string");
  return modeOk && isBuilderForm(value.form) && isBuilderForm(value.baseline);
}

/** Persists the draft. localStorage can throw (quota, private-mode Safari);
 *  callers get a boolean, never an exception. */
export function saveBuilderDraft(d: BuilderDraft): boolean {
  try {
    localStorage.setItem(BUILDER_DRAFT_KEY, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}

export function loadBuilderDraft(): BuilderDraft | null {
  try {
    const raw = localStorage.getItem(BUILDER_DRAFT_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isBuilderDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearBuilderDraft(): void {
  try {
    localStorage.removeItem(BUILDER_DRAFT_KEY);
  } catch {
    // removal failing (disabled storage) leaves nothing actionable
  }
}
```

And in `app/src/builder/builderState.ts`, directly under `newRow` (the counter is module-private, so the remap lives beside it):

```typescript
/** Re-identifies every row of a form with fresh session-local ids. A form
 *  restored from localStorage carries ANOTHER session's counter ids (r3,
 *  r4, …), which this session's own counter can hand out again to a newly
 *  added row — a duplicate React key and silently shared row identity. Every
 *  restore goes through this; nothing but `id` changes. */
export function adoptForm(f: BuilderForm): BuilderForm {
  return { ...f, rows: f.rows.map((r) => ({ ...r, id: nextRowId() })) };
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `pnpm test --project client -- src/builder/builderDraft.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Self-mutations** (each: break, run, confirm FAIL, restore by re-applying the edit — never `git checkout`, run, confirm PASS)

1. In `formFingerprint`, drop `r.spm` from the row array → the every-field test's `spm` iteration must fail.
2. In `isBuilderDraft`, change `value.v !== 1` to `value.v !== 2` → round-trip test must fail.
3. In `adoptForm`, return `f` unchanged → the remap test must fail.
4. In `clearBuilderDraft`, make the body a no-op → the clear test must fail.

- [ ] **Step 6: Gates and commit**

Run from `app/`: `pnpm lint && pnpm typecheck && pnpm format:check && pnpm test --project client -- src/builder/`
Check per-file coverage for `builderDraft.ts` via the HTML report if run with coverage; otherwise state the suite exercised every exported function (it does by construction above).

```bash
git rev-parse --show-toplevel   # must print the cl-remainder worktree
git add app/src/builder/builderDraft.ts app/src/builder/builderDraft.test.ts app/src/builder/builderState.ts
git commit -m "feat: builder draft module — fingerprint, single-slot persistence, adoptForm"
```

---

### Task 2: Builder integration — autosave, restore, notice, START OVER

**Files:**
- Modify: `app/src/builder/Builder.tsx` (mount path ~line 123, save handler ~line 336, header/notice render ~line 345)
- Modify: `app/src/index.css` (only if no existing class pair fits the notice row; prefer reuse)
- Test: `app/src/builder/Builder.test.tsx` (additions), `app/e2e/builder.spec.ts` (additions)

**Interfaces:**
- Consumes: everything Task 1 produces (`formFingerprint`, `saveBuilderDraft`, `loadBuilderDraft`, `clearBuilderDraft`, `BuilderDraft`, `adoptForm`).
- Produces: no new exports; behavior only.

**Behavior contract (test against this, not the implementation):**

1. Typing anything into a pristine builder writes a draft to
   `BUILDER_DRAFT_KEY` containing the current form and the pristine
   baseline.
2. Hand-reverting the form to pristine removes the draft IF this mount
   owns the slot (it restored or wrote it). A pristine mount that never
   wrote does NOT clear another screen's draft on arrival — opening
   edit-B read-only must not destroy a draft typed in new-mode.
   Ownership is a ref flag set on restore and on first write.
3. Mounting `/library/new` with a stored new-mode draft whose baseline
   fingerprint equals `formFingerprint(newForm())` restores the draft
   (rows re-identified through `adoptForm`), shows the notice row
   `Draft restored.` with a `START OVER` button, and leaves every card
   COLLAPSED (`editing: null` — restored content is review, not entry).
4. Mounting edit mode restores only when the draft's mode is
   `{kind:"edit", workoutId: mode.id}` AND the stored baseline
   fingerprint equals `formFingerprint(fromWorkout(currentWorkout))`;
   a drifted workout drops the draft silently (and deletes it).
5. START OVER is the house two-tap arm: first tap arms (label swaps to
   `Tap again to start over`, `.button-l4` → `.button-l4-armed`),
   auto-disarms after 4s or on blur; second tap clears the draft,
   resets the form to the pristine baseline via `adoptForm`, hides the
   notice.
6. Successful save clears the draft BEFORE `navigate(...)`.
7. A draft for the WRONG mode/workout neither restores nor blocks:
   typing then overwrites the slot (single-slot semantics).

**Implementation sketch (the implementer owns exact wiring, the contract above owns behavior):**

```tsx
// Builder.tsx — mount-time resolution, replacing the plain useState init
const pristineRef = useRef<BuilderForm | null>(null);
if (pristineRef.current === null) {
  pristineRef.current = mode?.initial ?? newForm();
}
const pristine = pristineRef.current;
const pristineFp = formFingerprint(pristine);

const restoredDraft = useMemo(() => {
  const d = loadBuilderDraft();
  if (!d) return null;
  const modeMatches = mode
    ? d.mode.kind === "edit" && d.mode.workoutId === mode.id
    : d.mode.kind === "new";
  if (!modeMatches) return null;
  if (formFingerprint(d.baseline) !== pristineFp) {
    clearBuilderDraft(); // stale: the workout changed since the draft
    return null;
  }
  return d;
  // mount-only: mode/pristine are stable for the life of the screen
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

const [form, setForm] = useState<BuilderForm>(() =>
  restoredDraft ? adoptForm(restoredDraft.form) : pristine,
);
const [draftNotice, setDraftNotice] = useState(restoredDraft !== null);
const ownsSlot = useRef(restoredDraft !== null);

const [editing, setEditing] = useState<string | null>(() =>
  mode || restoredDraft ? null : (form.rows[0]?.id ?? null),
);

// the autosave effect
useEffect(() => {
  if (formFingerprint(form) === pristineFp) {
    if (ownsSlot.current) clearBuilderDraft();
    return;
  }
  ownsSlot.current = true;
  saveBuilderDraft({
    v: 1,
    mode: mode ? { kind: "edit", workoutId: mode.id } : { kind: "new" },
    form,
    baseline: pristine,
    savedAt: new Date().toISOString(),
  });
}, [form, mode, pristine, pristineFp]);
```

Save handler: add `clearBuilderDraft();` immediately before the
`navigate(savedId ? ... : "/library")` line (Builder.tsx:336 region).

Notice row (renders between the header and the form when
`draftNotice`):

```tsx
{draftNotice && (
  <div className="builder-draft-notice" role="status">
    <span>Draft restored.</span>
    <button
      type="button"
      className={startOverArmed ? "button-l4-armed" : "button-l4"}
      onClick={handleStartOver}
      onBlur={disarmStartOver}
    >
      {startOverArmed ? "Tap again to start over" : "START OVER"}
    </button>
  </div>
)}
```

with the WorkoutDetail `OwnerActions` arm/disarm/timer pattern
(local `startOverArmed` state, 4000ms auto-disarm timer cleared on
unmount) — read `WorkoutDetail.tsx:640-737` and copy its shape. Firing:

```tsx
clearBuilderDraft();
ownsSlot.current = false;
setForm(adoptForm(pristine));
setEditing(null);
setDraftNotice(false);
setErrors({});
setSubmitError(null);
```

Layout: `.builder-draft-notice` is a one-line flex row (space-between,
existing spacing tokens); button height ≥44px (the `button-l4` pair
already is). If a new CSS rule is added, tokens only, and compute the
notice text's contrast ratio and put the number in the report.

- [ ] **Step 1: Write failing client tests** (in `Builder.test.tsx`'s existing harness style — read its helpers first). Cover contract items 1-7. Item 4's test MUST build its workout from a real library entry: `fromWorkout(LIBRARY_WORKOUTS.find(...))` (briefing's realistic-fixture rule; import from `server/seed/library/index.ts` the way existing client tests do — check `git grep -l LIBRARY_WORKOUTS app/src` for the established import idiom). Include: typing writes (assert the STORED JSON's form.title, not just presence); pristine-revert clears when owned; arrival does NOT clear an unowned foreign draft; restore + notice + collapsed cards; stale baseline drops and deletes; two-tap START OVER (first tap arms + label swap, timeout disarms — use fake timers, second tap resets); save clears before navigate.

- [ ] **Step 2: Run, verify the new tests fail** — `pnpm test --project client -- src/builder/Builder.test.tsx`

- [ ] **Step 3: Implement** per the sketch + contract.

- [ ] **Step 4: Run, verify green**, including the whole builder suite: `pnpm test --project client -- src/builder/`

- [ ] **Step 5: e2e additions** (`app/e2e/builder.spec.ts`, new describe "builder draft persistence") — there is ZERO existing coverage of leaving the builder (verified 2026-08-10):

```typescript
test.describe("builder draft persistence", () => {
  test("typed content survives a tab-bar exit and return", async ({ page }) => {
    await signIn(page); // whatever helper the file already uses — read it
    await page.goto("/library/new");
    await page.getByLabel("Title").fill("Draft survives");
    await page.getByRole("link", { name: "Library" }).click();
    await expect(page).toHaveURL(/\/library$/);
    await page.getByRole("link", { name: /new workout/i }).click(); // the screen's real NEW affordance — read Library.tsx for its accessible name
    await expect(page.getByText("Draft restored.")).toBeVisible();
    await expect(page.getByLabel("Title")).toHaveValue("Draft survives");
  });

  test("START OVER is two-tap and resets the form", async ({ page }) => {
    await signIn(page);
    await page.goto("/library/new");
    await page.getByLabel("Title").fill("Doomed draft");
    await page.getByRole("link", { name: "Library" }).click();
    await page.getByRole("link", { name: /new workout/i }).click();
    const startOver = page.getByRole("button", { name: "START OVER" });
    await startOver.click();
    await expect(
      page.getByRole("button", { name: "Tap again to start over" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Tap again to start over" }).click();
    await expect(page.getByText("Draft restored.")).not.toBeVisible();
    await expect(page.getByLabel("Title")).toHaveValue("");
  });

  test("saving clears the draft: leave and return lands pristine", async ({ page }) => {
    // author a minimal valid workout (copy the file's existing save flow),
    // save, navigate back to /library/new, expect NO notice and empty title
  });
});
```

The selectors above are UNVERIFIED against the real screens — the
implementer reads `builder.spec.ts`'s existing helpers and the Library
screen's actual NEW affordance and adjusts. The three FLOWS are the
requirement.

- [ ] **Step 6: Self-mutations** — at minimum: (a) remove the `clearBuilderDraft()` before navigate → the save-clears e2e/client test fails; (b) skip `adoptForm` on restore (use `d.form` raw) → a client test asserting fresh ids fails (add one if Step 1 lacks it: restore then ADD a row, assert all row ids unique); (c) break the ownership guard (always clear on pristine) → the foreign-draft test fails.

- [ ] **Step 7: Full gates for app/src product code**

`pnpm lint && pnpm typecheck && pnpm format:check && pnpm test --project unit --project client && pnpm e2e` — e2e runs in THIS worktree's own stack (per-worktree scoping). No screenshots: the builder's layout is unchanged except a conditional notice row; if the implementer judges the notice row a layout change, run `pnpm screenshots`, open the builder image, and describe it.

- [ ] **Step 8: Commit**

```bash
git rev-parse --show-toplevel
git add app/src/builder/ app/e2e/builder.spec.ts app/src/index.css
git commit -m "feat: builder drafts persist across exits — autosave, restore notice, two-tap start over"
```

---

### Task 3: ROADMAP close-out adjudications (docs only)

**Files:**
- Modify: `ROADMAP.md` — the Phase CL section (~line 1408) and the "Triggered follow-ons" section (~line 1628). DO NOT touch the Phase 9 regen line (rebalance session owns it).

**Interfaces:** none — prose.

- [ ] **Step 1: Edit ROADMAP.md** per the spec's Parts 2-3, exactly:

1. **Builder unsaved-changes line** (~1501): `- [ ]` → `- [x]`, and reconcile the text: "Fixed (CL remainder, this PR): draft persistence, not a navigation guard — `builderDraft.ts` single-slot autosave/restore with a fingerprint staleness guard and a two-tap START OVER; James's explicit shape choice over exit interception and a data-router migration (spec: `docs/superpowers/specs/2026-08-10-cl-remainder-design.md`)."
2. **Anonymous-run line** (~1439): remove from the CL list; add under Triggered follow-ons, text from the spec's Part 2 blockquote verbatim, trigger: "a door that creates anonymous runs ships — a free-row entry point, or PM5-initiated sessions."
3. **Reconnect five-parter** (~1416) + **failed `program()`** (~1443): remove from the CL list; ONE combined Triggered follow-ons entry keeping both lines' full content (the five enumerated pieces; the re-reasoning note pointing at PR #70's body), trigger: "Capacitor BLE lands (PM5 reaches the phone), or a tester reports a mid-piece lost link."
4. **Hardware shopping list** (~1452) + **`.5` pace target** (~1464): remove from the CL list; ONE combined Triggered follow-ons entry preserving the §17/§18 item citations, trigger: "James's next session at the erg (checklist in PR #70's body)."
5. **CL Exit line** (~1518): update to: "**Exit:** MET 2026-08-10 for the list (every line shipped or re-filed with its trigger above); the phase itself closes with the staged v0.7.0 release, which fires only after the library-rebalance PR merges (James's ruling: testers meet the rebalanced library)."
6. **Status line** (~1410): "Not started" → "In closing — list adjudicated 2026-08-10, release staged."

- [ ] **Step 2: Gates** — docs only: `pnpm lint && pnpm typecheck && pnpm format:check` from `app/`.

- [ ] **Step 3: Commit**

```bash
git rev-parse --show-toplevel
git add ROADMAP.md
git commit -m "docs: Phase CL list adjudicated — guard shipped, four lines re-filed with triggers"
```
