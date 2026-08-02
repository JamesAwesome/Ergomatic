# Today Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The suggestion's filters become visible and adjustable on Today,
a plan day can be rowed as a different type without abandoning the plan,
and a session can be logged without consuming a plan slot.

**Architecture:** One domain extension (`suggest.ts` learns pain and
capless), one new client record (`todayOverrides.ts`, the todayPick idiom
covering swap + filters together), chips on Today feeding both, and one
additive server field (`advancesPlan`, default true) surfaced as a toggle
on the Log screen. Swap and filters are ephemeral per-day; the log tells
the story.

**Spec:** `docs/superpowers/specs/2026-08-02-today-enhancements-design.md`.
**Every implementer reads `.claude/agent-briefing.md` first.** Design
authority: `docs/design/README.md` (chips follow the Library's `.chip`
idiom; 44px targets; tokens only).

## Global Constraints (beyond the briefing)

- Worktree `.claude/worktrees/today-enhancements`, branch `today-enhancements`.
- **Commit before any self-mutation** (standing rule).
- Overrides are EPHEMERAL: one localStorage record keyed `{date, planKey,
  doneN}` — any mismatch discards silently (todayPick semantics). No
  server writes for filters or swap.
- `advancesPlan` is ADDITIVE: optional boolean, absent/`true` ≡ today's
  behaviour byte-for-byte; only `false` changes anything. Freestyle omits
  the field entirely (not `true`).
- Reason text stays honest: never name a dimension that wasn't checked
  (capless drops cap claims exactly like `durationsUnknown` already does).
- e2e stack: `docker compose -f compose.yml -f compose.e2e.yml up -d
  --build --wait` from the REPO ROOT (bare compose leaves test-signin
  unarmed → mass 401s); new e2e must survive two back-to-back runs
  (cleanup via `test.afterEach` keyed on unique titles).

---

### Task 1: `suggest.ts` — pain filter, capless cap, honest wording

**Files:** Modify `app/domain/suggest.ts` (+`suggest.test.ts`).

**Interfaces produced (Tasks 2–4 rely on these exactly):**
- `SuggestPrefs.timeCapMinutes: number | null` (null = no cap — the cap
  clause is skipped, never compared against a sentinel).
- `SuggestPrefs.painMax3?: boolean`.

Filter predicate in BOTH `suggest` and `suggestFreestyle` becomes:
`prefs.difficulties.includes(e.difficulty) && (prefs.timeCapMinutes ===
null || e.estMinutes <= prefs.timeCapMinutes) && (!prefs.painMax3 ||
e.pain <= 3)`.

`buildReason`:
- Fallback branch: `filterWord` = parts joined with `/` — `"difficulty"`
  always; `"time"` only when `timeCapMinutes !== null && !durationsUnknown`;
  `"pain"` when `painMax3`.
- Standard branch: the `"within your N min cap"` clause renders only when
  `timeCapMinutes !== null && !durationsUnknown`; otherwise the sentence
  is `Least recently done (…).` (the existing `durationsUnknown` sentence
  — one branch, two reasons to take it).

Pinned tables: pain 3 in / pain 4 out; pain filter × fellBack (pain
excludes everything in a non-empty type pool → fellBack true, pool =
unfiltered type list); capless keeps a 200-min entry; every wording
combination (cap × durationsUnknown × painMax3 → exact strings);
freestyle parity for all of the above. Existing tests keep passing with
`timeCapMinutes: 60`-style values unchanged. 100% per-file. Self-mutation
post-commit (flip a predicate clause; drop a wording part). Commit:
`feat: suggest learns pain and capless — and says only what it checked`.

---

### Task 2: `todayOverrides.ts` + the Today chips (filters + swap)

**Files:** Create `app/src/today/todayOverrides.ts` (+test); Modify
`app/src/today/Today.tsx` (TodayView), `app/src/today/Today.test.tsx`,
`app/src/index.css` (chip-row spacing only if needed — reuse `.chip`/
`.chip-wrap`).

**Interfaces consumed:** Task 1's `SuggestPrefs` exactly.
**Interfaces produced:**

```ts
export const TODAY_OVERRIDES_KEY = "ergomatic.todayOverrides";
export interface TodayOverrides {
  date: string;                 // "YYYY-MM-DD" local (todayPick's format)
  planKey: string | null;
  doneN: number | null;
  swapType: WorkoutType | null; // null = no swap
  difficulties: Difficulty[];
  capMinutes: number | null;    // null = NO CAP
  painMax3: boolean;
}
export function loadTodayOverrides(today: string, planKey: string | null,
  doneN: number | null): TodayOverrides | null;  // strict validation,
  // all three keys must match; garbage/shape-miss/stale → null
export function saveTodayOverrides(o: TodayOverrides): void; // best-effort
```

Validation table mirrors `libraryFilters.ts` (each field's wrong shape →
null; `difficulties` values must be real Difficulty strings, de-duped;
`swapType` must be a real WorkoutType or null; `capMinutes` finite
positive number or null).

`TodayView`:
- `overrides` state, lazy init: stored record if valid, else
  `{swapType: null, difficulties: prefs.difficulties, capMinutes:
  snapCap(prefs.timeCapMinutes), painMax3: false}` where `snapCap` =
  smallest of 30/45/60/90 ≥ pref, else null (NO CAP) — comment the
  approximation; default pref 60 is exact. Every change saves.
- **Type chips** (only when `usesPlan`): AN/O2/AT/TR in the plan-line
  area, `.chip` + `aria-pressed`, 44px. Active = `swapType ??
  effectivePrescribed` where `effectivePrescribed` = prescribed code with
  TEST → "TR". Tapping the prescribed chip (or TR on a TEST day) sets
  `swapType: null`; any other sets it. Plan line: `SESSION 5 OF 84 · O2`
  unswapped, `SESSION 5 OF 84 · O2 → AT` swapped (TEST day: `TEST → AN`).
- **Filter chips row** (both modes) under the suggestion header, order:
  `EASY MED HARD` (multi) · `≤30′ ≤45′ ≤60′ ≤90′ NO CAP` (single-select,
  exactly one always active) · `PAIN ≤3` (toggle). Labels use the
  Library's prime idiom (`≤30′`).
- Suggest inputs become: `todayCode = overrides.swapType ??
  sequence[doneN].code` (cast note: a swapped code is a WorkoutType,
  which IS a PlanCode); prefs = `{difficulties: overrides.difficulties,
  timeCapMinutes: overrides.capMinutes, painMax3: overrides.painMax3,
  durationsUnknown: baselines === null}`.
- Deselecting every difficulty is allowed (fellBack pool, honest reason).
- SHUFFLE/pick untouched: a pick outside the new pool falls back inside
  `suggest` (verified `suggest.ts:108-111`) — pin one test.

Client tests: init from prefs (cap snapping 60→60, 45→45, 100→null);
stored overrides win over prefs; chip change re-runs suggest (card
narrows live, count of pool via reason/title change); persists across
remount (same date/planKey/doneN); a doneN bump discards; swap changes
the pool and the plan line shows `O2 → AT`; un-swap restores; TEST
renders TR active and `TEST → AN` when swapped; swap to an empty pool
shows the existing "No {type} sessions" card with chips still
interactive; freestyle: no type chips, filter chips present. Full gate
incl. e2e (existing suites must stay green — Today's fixtures gain
nothing unless a test needs it). Commit:
`feat: today's mood — visible filters and a type swap, ephemeral by design`.

---

### Task 3: `advancesPlan` — the server flag + the Log-screen toggle

**Files:** Modify `app/server/routes/data.ts` (POST /api/logs
validation), `app/server/stores/logs.ts` (`LogInput` + `create`),
`app/server/routes/data.integration.test.ts` (or the suite the existing
log tests live in — follow the file), `app/src/session/LogSession.tsx`
(+test).

Server:
- Validation: `advancesPlan` optional; when present must be boolean else
  400 `"advancesPlan must be a boolean"` with `field: "advancesPlan"`.
- `LogInput.advancesPlan: boolean` (route passes `body.advancesPlan ??
  true`). In `create`'s transaction, wrap the `planState` upsert in
  `if (input.advancesPlan) { … }` — the log insert itself is unchanged
  and still transactional.
- Integration: `false` → `done_n` unchanged AND the log row exists;
  `true`/absent → advances (both arms); non-boolean → 400; `false` with
  no plan row at all → 201, still no plan row created.

Client (`LogSession.tsx`):
- `usePlan()` joins the screen's existing hooks; its loading folds into
  the screen's existing loading gate; its error does NOT block logging —
  on plan-hook error render the form without the toggle and omit the
  field (logging must never be hostage to the plan fetch; comment this).
- Toggle row above Save, both doors, rendered only when
  `plan.planKey !== null`: default state `COUNTS TOWARD PLAN · SESSION
  {doneN+1} OF {sequence.length}`; tapped: `OUTSIDE THE PLAN — won't
  advance`. One `<button>` with `aria-pressed`, 44px, tokens only.
- `useLogForm`'s body assembly: include `advancesPlan: false` ONLY when
  the toggle is off; when counting (or freestyle/plan-error) the key is
  ABSENT from the POST body (proves the default path stays exercised —
  assert the absent key in tests, not `advancesPlan: true`).
- Toggle state survives a failed save (it's part of the form state
  quintet's lifecycle, not reset on error).

Client tests: renders only with a plan; both doors; wire shape — toggled
posts `advancesPlan: false`, untoggled posts NO key (both doors, real
POST capture like the 6C wire-shape tests); plan-hook error → no toggle,
no key; failed save keeps the toggle state. Full gate. Commit:
`feat: log outside the plan — advancesPlan, default unchanged`.

---

### Task 4: Full-flow e2e + close-out

**Files:** `app/e2e/today.spec.ts` (or extend the existing Today
describes — follow the file layout), `app/e2e/session.spec.ts` (the
outside-plan loop), `design.spec.ts` (sweeps: chips row, swap state,
the log toggle both states), `screenshots.spec.ts` (`today.png`
re-capture with the chips visible; describe the toggle in the report),
`ROADMAP.md` (this phase's section; next: Phase 7 PM5),
`docs/design/DEVIATIONS.md` (end-to-end pass; add rows only if a real
deviation shipped).

e2e flows (unique titles + `test.afterEach` cleanup, run the suite twice
back-to-back):
1. Filters: seeded plan user on Today → tap `PAIN ≤3` → the suggestion
   card changes (assert on the reason/title actually differing) → reload
   → chips and card unchanged (same day, same doneN).
2. Swap loop: tap a different type chip → plan line shows `→` → open the
   card → Start → SKIP countdown → tiny session (6B bulk-import fixture
   idiom) → complete → Log → Save → Today: counter advanced by one, LAST
   THREE's top row shows the SWAPPED type badge, and the chips/swap have
   RESET (the doneN bump invalidated the record — assert no `→` in the
   plan line).
3. Outside-plan: workout detail → `Log it after` → toggle OUTSIDE THE
   PLAN → Save → Today: counter UNCHANGED, LAST THREE shows the row.
4. Freestyle spot-check: a no-plan user sees filter chips, no type chips.

Design sweeps: every new chip/toggle ≥44px, `aria-pressed` correctness,
axe pass on Today with chips and on the Log screen with the toggle in
both states. Screenshots opened and described honestly. Full gate ×2.
Commit: `test: today's mood and the plan's consent — the flows and the record`.

---

## Notes

- Tasks 2 and 3 touch disjoint files but stay strictly sequential (SDD).
- Task 3's plan-hook-error decision (render without the toggle) is the
  plan's one judgment call already made — don't re-litigate it, comment it.
- `snapCap` lives in `todayOverrides.ts` (it's part of the record's
  init contract, and Task 2's tests pin it there).
- The swapped `todayCode` is a `WorkoutType`, never `"TEST"` — a rower
  can swap ONTO the TR pool but nothing can swap onto TEST semantics.
