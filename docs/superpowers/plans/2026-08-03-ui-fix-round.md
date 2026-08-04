# UI-Fix Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The design handoff lands whole — one button system across six
screens, exact targets, discard at three surfaces, the Library's filter
sheet + tokens, and one pain model app-wide.

**Architecture:** A CSS/markup foundation task establishes the five
button levels and the selected-state color rules; behaviour tasks build
on it (discard machine, exact-target call sites); the Library rebuild
and Today's pain union each own their filter-model change plus the
persisted-shape bump. Zero server changes; `suggest.ts` is the only
domain file whose SHAPE changes (pain union), `toleranceRange` only
loses display call sites.

**Spec:** `docs/superpowers/specs/2026-08-03-ui-fix-round-design.md`.
**Visual authority:** `docs/design/handoffs/2026-08-03-ui-fix/DESIGN.md`
+ `mockup.html` + `mockup-library.html` (open them; colors/sizes/states
are final). **Every implementer reads `.claude/agent-briefing.md` first.**

## Global Constraints (beyond the briefing)

- Worktree `.claude/worktrees/ui-fix-round`, branch `ui-fix-round`.
  **Commit before any self-mutation.** Worktree root needs `pnpm install`
  once (git hooks are inert without it).
- The five levels, verbatim heights: L1 primary 56px solid `--accent`
  (ONE per screen) · L2 secondary 52px surface + 1px `--ink` border ·
  L3 commit-in-card 48px solid `--ink`, mono 12/600 0.16em · L4
  destructive 52px surface + 1px `--accent` border, accent label, LAST
  in the stack under a 1px `--rule` divider · L4-armed fills solid
  `--accent`, copy changes, auto-disarms on blur or 4s. Stack:
  bottom-anchored, full-width, 12px gap. Exceptions (documented):
  transport row, steppers, SHUFFLE.
- Selected states: type chips ALWAYS the type color (`--type-an/o2/at`
  tokens; TR/TEST = `--ink`), cream label; every OTHER selection =
  `--ink` fill, cream label; inactive = transparent, `--rule-3` border,
  `--ink-3` label. Accent means ONLY: L1 action, resolved
  split/duration, destructive, active tab mark.
- Discard copy at all three surfaces, verbatim: `Discard without
  logging` → armed `Tap again to discard`. No one-tap destructive
  anywhere. Discard = clear draft + run records, NO POST.
- No 10–11px mono label at `--ink-4` on `--page` — survivors move to
  `--ink-3`.
- Old persisted shapes (`libraryFilters`, `todayOverrides`) must fall
  back cleanly via strict validation (no migration — per-tab/per-day
  values).
- e2e stack from the REPO ROOT: `POSTGRES_PASSWORD=devpass
  TEST_AUTH_SECRET=e2e-secret APP_VERSION=e2e docker compose -f
  compose.yml -f compose.e2e.yml up -d --build --wait`; new/changed e2e
  survive two back-to-back runs (unique titles + afterEach cleanup).
- Existing e2e keep their ASSERTIONS — selectors may update in the same
  commit; never a skipped test.

---

### Task 1: The button system, selected-state colors, contrast sweep

**Files:** Modify `app/src/index.css` (level classes + selected-state
rules + the `--ink-4` sweep), `app/src/workout/WorkoutDetail.tsx`
(stack: Start 56 L1 / Log it after 52 L2 / Edit 52 L2 / rule / Delete
L4), `app/src/session/SessionComplete.tsx` (two half-width buttons →
full-width L1 + L2; Discard arrives in Task 3 — leave a stack that Task
3 appends to), `app/src/session/ConfirmTargets.tsx` (small START → L1
`Looks right, start`, 56px, below the TOTAL line; REMOVE stays a 44px
text control), `app/src/builder/Builder.tsx` (TYPE active → type color;
DIFFICULTY/PAIN/MIN-M/ref-chip actives → ink; DONE → L3; Save to
library stays L1), `app/src/today/Today.tsx` (type chips → type color;
difficulty/time/pain selections → ink; SHUFFLE re-cut: 44px chip
geometry, 1px `--rule-3` border, transparent, mono 11/0.14em `--ink-1`,
disabled = `--ink-5` label + DASHED border, stays right of the header
label), plus the tests/design-spec updates those imply.

**Produces (later tasks consume):** class names `.action-stack`,
`.button-l1`, `.button-l2`, `.button-l3`, `.button-l4`,
`.button-l4-armed` (aliases over the existing `.button-primary`/
`.button-outline` are fine IF the computed styles match the table —
say which you chose in the report). Existing e2e selectors that name
old classes update in the same commit.

Design-spec additions: per-screen one-L1 assertion; the four heights as
computed styles; the accent-usage sweep is NOT automatable wholesale —
assert the named selected-state cases instead (type chip fill = type
token, difficulty selected = ink); the `--ink-4` small-label sweep IS
automatable: walk all elements, computed font-size ≤ 11px + mono →
color ≠ `--ink-4`'s value. Screenshots: re-capture every touched screen,
open each. Full gates. Commit: `feat: one button system — five levels,
four meanings of accent`.

---

### Task 2: Exact targets everywhere

**Files:** Modify `app/src/workout/StepRow.tsx:138` (band → exact
`fmtSplit(resolved)`), `app/src/builder/Builder.tsx:50` (`targetLabel`
drops `toleranceRange(...).label` for the exact split),
`app/src/session/ConfirmTargets.tsx` (target rows exact),
`app/src/session/TimerTargets.tsx` (sub-line under the big split → the
REF: mono 11px `--ink-3`, uppercase, e.g. `6K +16` — reuse
`refLabel(ref)`, uppercased; UP NEXT → `WORK · 2:18.0` exact), and
their tests.

**Verify first, then act:** `domain/expand.ts:150` also calls
`toleranceRange(split, tol).label` when building phase labels — trace
whether that label reaches ANY display (the timer? the run record → the
Log screen's step labels?). If it reaches display, it changes to the
exact split IN THE LABEL BUILDER with the run-record consequences
traced (6B/6C froze labels into records — a changed label composes at
build time, records already written keep their old strings, which is
correct and must be SAID in the report). If it's engine-only, leave it
and say so.

Rules: `toleranceRange()` itself and every non-display consumer stay
untouched (off-target nudge judgments). Effort/rest/warm-up phases keep
their words (`Easy`/`Rest`/`All out`), never a bare dash. Wire shapes
unchanged (targetSplit was always the exact number). Tests: each
surface's rendering pinned incl. the timer ref sub-line and an
UP NEXT case; a mixed workout (split + effort) proving words survive.
Screenshots: timer + detail + builder + confirm re-captured, opened.
Full gates. Commit: `feat: exact targets — the band retires from display`.

---

### Task 3: Discard at three surfaces, one voice

**Files:** Create `app/src/session/useStagedDiscard.ts` (+test) — the
shared machine: `{armed, arm(), fire(), disarm()}`, auto-disarm on blur
or 4s (timer cleared on unmount), fire = `clearDraft() + clearRun()`,
NO POST. Modify `app/src/session/SessionComplete.tsx` (L4 block below
Back to Today under the rule; armed fills accent in place; fire →
navigate `/today`), `app/src/today/Today.tsx` (the unlogged row keeps
`Log it` and gains a 44×44 accent-outlined `✕`; arming swaps the ROW'S
CONTENTS: border → accent, text → `Discard {title} without logging?`,
✕ → solid accent `Tap again`; row height/position fixed; fire → the row
disappears in place, no navigation), `app/src/session/LogSession.tsx`
(the existing staged Discard adopts the shared copy + L4 look — its
behaviour is already correct; consume the hook if it simplifies, don't
force it), tests for all three.

Copy verbatim everywhere: `Discard without logging` / armed `Tap again
to discard` (Today's row text is the one variant the design specifies:
`Discard {title} without logging?` + `Tap again`).

Tests: the machine (arm/fire/disarm-timeout/disarm-blur/unmount);
each surface: records cleared, no fetch fired (spy), the
SessionComplete navigation, Today's row vanishing without remount
side-effects (the suggestion card must not re-shuffle), the Log
screen's copy change; e2e: SessionComplete discard → Today shows no
unlogged line + counter unchanged; Today ✕ arm → 4s → disarmed; arm →
tap → gone (two back-to-back runs). Screenshots: session-complete +
the Today row's DEFAULT and ARMED states (the design mockup shows both
— capture both if the screenshot idiom allows a staged state, else
sweep-assert the armed styles). Full gates. Commit: `feat: discard
without logging — three surfaces, one voice`.

---

### Task 4: The Library second pass — model, tokens, sheet

**Files:** Modify `app/src/library/filters.ts` (the new model),
`app/src/library/libraryFilters.ts` (persisted shape v2 + validation),
`app/src/library/Library.tsx` (rest state: `FILTER ⌄` chip + count;
tokens row; CLEAR ALL), Create `app/src/library/FilterSheet.tsx`
(+test) and `app/src/library/filterTokens.ts` (+test — pure: Filters →
token list with collapse rules), Modify `app/src/library/FilterChips.tsx`
(retires — delete it and its test once nothing imports it),
`app/src/index.css`, `app/e2e/library.spec.ts` (selectors update,
assertions keep), `design.spec.ts`, `screenshots.spec.ts`.

**New model, exact shape:**

```ts
export interface Filters {
  type: WorkoutType | null;          // single-select, toggles off
  durations: DurationBucket[];       // union (unchanged)
  painLevels: number[];              // 1..5 union; [] = off
  lastDone: "under21" | "over21" | null;  // <21D / 21D+, exclusive pair
  source: "global" | "custom" | null;     // exclusive pair
}
```

`applyFilters` semantics: painLevels non-empty → `painLevels.includes
(w.pain)`; lastDone under21 → `isRecent` (the existing <21-day rule,
never-done counts as 21D+ — pin it); source custom → `!w.isGlobal`,
global → `w.isGlobal`. TYPE/TIME unchanged. The 21-day boundary
constant is shared, not re-derived.

`filterTokens(f: Filters): Token[]` — one token per active group:
`{kind, label, clear(f): Filters}`. Collapse: contiguous pain →
`PAIN 4–5`, non-contiguous → `PAIN 1, 4`; durations follow the same
rule using bucket labels; TYPE token = the code, type-colored; LAST
DONE → `<21D`/`21D+`; SOURCE → `GLOBAL`/`CUSTOM`. Tokens: 44px, mono
11/600 cream, 12px leading pad, a 44×44 `✕` cell each; type token
fills the type color, others `--ink`.

Screen: at rest `FILTER ⌄` (44px, ink border) + `35 WORKOUTS`;
filtered: tokens row + `12 OF 35 SHOWN` + `CLEAR ALL` (44px, accent
label) on the count line. The sheet (over the list, not a route):
TYPE 4-cell / TIME 4-cell / PAIN 5-cell grids, LAST DONE + SOURCE
sharing a line as 2-cell grids, L1 button `Show {n} workouts` with the
LIVE count, closes applying. Scroll restoration (PR #39/#41) keeps
working: the persisted-shape v2 round-trips through the same
sessionStorage lifecycle; the old v1 shape hits validation and falls
back to empty (validation-table cases for v1 records verbatim).

e2e: the BACK-with-filters flow keeps its assertions (filter via the
sheet now); the sheet round trip; token ✕ removes exactly its group;
CLEAR ALL; count copy both states; two back-to-back runs. Screenshots:
`library.png` re-captured (rest + a filtered state if the idiom
allows). Full gates. Commit: `feat: the Library's second pass — a
sheet, tokens, and filters that say what they mean`.

---

### Task 5: Today's pain union

**Files:** Modify `app/domain/suggest.ts` (`SuggestPrefs.painMax3` →
`painLevels?: number[]`; predicate `!prefs.painLevels?.length ||
prefs.painLevels.includes(e.pain)`; reason wording: the pain part
renders when the union is active — same honesty rule),
`app/src/today/todayOverrides.ts` (shape: `painMax3: boolean` →
`painLevels: number[]`, validation: array of integers 1..5, de-duped,
sorted; v1 records fall back), `app/src/today/Today.tsx` (the PAIN
group becomes five cells `1 2 3 4 5`, multi-select union, ink-filled
when selected, inline like DIFFICULTY/TIME), tests across all three.

The GROUP is edited in place (James's ruling) — no sheet on Today, no
collapsed token; the five cells show their own state. suggest tables:
union in/out per level, non-contiguous unions, empty = off, fellBack
interplay, wording rows updated (`difficulty/time/pain` when the union
is active). Overrides validation table gains the v1-shape fallback and
the 1..5 bounds cases. e2e: the existing filter-narrows flow updates
(tap cell 1–2 instead of the old toggle — keep the load-bearing fixture
technique). Full gates. Commit: `feat: one pain model — Today's five
cells`.

---

### Task 6: Close-out — sweeps, screenshots, the record

**Files:** `design.spec.ts` (whatever Tasks 1–5 deferred: the armed
states' contrast, the sheet's tap targets, axe on Library-with-sheet
and Today's five-cell group), `screenshots.spec.ts` (every screen the
round touched, re-captured fresh at HEAD: today, workout-detail,
builder, confirm, timer, session-complete, library, log-session both
doors — open and describe each), `docs/design/DEVIATIONS.md` (the
design's five mandated rows + the Library second pass's own: pain
union replaces ≤3, LAST DONE naming, SOURCE naming, count copy,
FILTER-sheet pattern; end-to-end pass that no row contradicts shipped
reality), `docs/design/README.md` (the button-level table joins the
design authority — DESIGN.md is a handoff, the README is the standing
document; port the table + the accent-meanings list), `ROADMAP.md`
(this round recorded; next: workout generation, then Phase 7 PM5).

Full e2e ×2 back-to-back; the full-loop and BACK-with-filters flows
green; unit+client+integration green. Commit: `test: the system holds —
sweeps, captures, and the record`.

---

## Notes

- Strictly sequential; Tasks 1→2→3 all touch Today.tsx/SessionComplete —
  the order above minimizes rebase pain. Task 4 is the biggest single
  task; it owns EVERYTHING Library so no other task touches that
  directory.
- Task 1 chooses the class strategy (new `.button-l*` vs extending
  `.button-primary`/`.button-outline`) — later tasks consume whatever it
  reports; the review package is the source of truth.
- The design mockups are the visual referee: when a px value is in
  neither the spec nor this plan, read it off `mockup.html` /
  `mockup-library.html` rather than inventing.
- `PAIN ≤3`'s retirement on Today means PR #42's e2e fixture technique
  (neutralizeGlobalRecency) survives with a cell-union tap — Task 5
  keeps the technique, changes the tap.
