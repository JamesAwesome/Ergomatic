# Phase 6A — Today, Plan, Confirm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pick and prepare a workout — Today suggests, Plan structures, Confirm
produces the session draft 6B's timer will consume.

**Architecture:** One domain addition (`suggestFreestyle` — the no-plan
ordering belongs in the 100%-pinned layer, not ad-hoc client sorting), one new
pure client module (`session/draft.ts`, the versioned expand-only contract),
then three screens over existing APIs. **Zero server changes.**

**Tech Stack:** TypeScript strict ESM, React 19, Vitest 4, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-01-phase-6a-today-confirm-design.md`.
**Every implementer reads `.claude/agent-briefing.md` first** — SDLC,
environment, scoped gates, self-mutation DoD, report contract.

## Global Constraints (beyond the briefing)

- Worktree `.claude/worktrees/phase-6a`, branch `phase-6a-today-confirm`.
- **The session draft shape is the 6B contract** — expand-only from day one:
  `{ v: 1, workoutId, title, type, steps, nudges, spmOverrides, removed,
  createdAt, startedAt }` under localStorage key `ergomatic.sessionDraft`.
  Unknown `v` loads as `null`, never throws.
- Effort steps: never a `nudges` entry (nothing to nudge); SPM overrides
  apply to any work step; `ALL OUT`/`EASY` words come from `effortWord` only.
- SPM override bounds 18–32 (spec; narrower than the builder's 10–60 — this
  is a session-time adjustment, not authoring).
- `todayPick` is client-side localStorage keyed by date + plan position;
  never sent to the API.
- Routes exist as placeholders at `AppRoutes.tsx:44` (`/today`) and `:60`
  (`/plan`) — verify what the placeholders render before replacing. `/` and
  `*` currently redirect to `/library` (`:42`, `:73`); 6A flips both to
  `/today` (Task 2).
- House time format for any rendered duration (`fmtDuration` +
  `fmtDurationSpoken`); totals labelled (`43 MIN`).
- Staged-confirm idiom for destructive plan actions: copy the pattern from
  `src/you/BaselineEditor.tsx` (two-press, explicit copy).

---

### Task 1: The pure logic — `suggestFreestyle` + the session draft

**Files:**
- Modify: `app/domain/suggest.ts` (+`suggest.test.ts`)
- Create: `app/src/session/draft.ts`, `app/src/session/draft.test.ts`

**Interfaces produced (every later task consumes):**
- `suggestFreestyle(library: LibraryEntry[], prefs: { difficulties: Difficulty[]; timeCapMinutes: number }, todayPickId?: string): Suggestion`
  — same `Suggestion` shape as `suggest`; pool = whole library filtered by
  prefs (fallback to unfiltered with `fellBack: true` when prefs match
  nothing, mirroring `suggest`'s existing `fellBack` semantics at
  `suggest.ts:54`); ordering by the existing `byLeastRecentlyDone`; reason
  strings reuse `recencyPhrase` (`"never done"` / `"N days ago"`).
- `SessionDraft` (the spec's shape, verbatim), `buildDraft(w: { id: string;
  title: string; type: WorkoutType; steps: Step[] }): SessionDraft`,
  `saveDraft(d: SessionDraft): void`, `loadDraft(): SessionDraft | null`,
  `clearDraft(): void`, `draftSteps(d): Step[]` (effective steps: removals
  applied, SPM overrides folded in, reps marker intact),
  `draftMinutes(d, baselines: Baselines | null): number | null` (via
  `estimateMinutes` over `draftSteps`; null when a distance step needs
  baselines that are absent), `DRAFT_KEY = "ergomatic.sessionDraft"`.

Requirements with teeth:
- Draft round trip pinned against REAL starters: Microburst (effort step —
  assert `nudges` refuses an entry for its index via a guard in the setter
  helper `withNudge(d, i, delta)` which no-ops on effort steps), a distance
  workout (Jet Stream or similar), and one with a reps marker (assert
  `draftSteps` keeps the marker so `estimateMinutes` expands correctly).
- `loadDraft` with `v: 2` or garbage JSON → `null` (and clears the key);
  quota-full `saveDraft` must not throw uncaught (wrap, report boolean).
- `suggestFreestyle`: never-done sorts first; `todayPickId` passthrough wins
  when present in pool; empty library → `recommendationId: null` with a
  reason the UI can show.
- Self-mutation DoD per the briefing for every behavioural test.
- Domain 100% pinned; `draft.ts` is a NEW client file — per-file 100%
  expected, read the HTML report.

Steps: failing tests → run → implement → green → mutations → per-file
coverage → commit `feat: freestyle suggestions and the session draft contract`.

---

### Task 2: Today

**Files:**
- Modify: `app/src/shell/AppRoutes.tsx:42-47,73` (real screen; `/` and `*`
  → `/today`), the placeholder Today component (find what `:44` renders —
  `UNVERIFIED — check before use`, likely a stub under `src/shell/` or
  `src/today/`)
- Create: `app/src/today/Today.tsx` (+test), `app/src/today/todayPick.ts`
  (+test — localStorage `ergomatic.todayPick`, shape `{ date: "YYYY-MM-DD",
  planKey: string | null, doneN: number | null, workoutId: string }`;
  `loadTodayPick(today, planKey, doneN)` returns the id only when all
  fields match, else null)
- Modify: `app/src/index.css` (Today card styles, tokens only)

**Consumes:** `suggest`/`suggestFreestyle`, `useWorkouts`, the plan endpoint
(add a `usePlan` hook mirroring `useWorkouts`' state-machine idiom if none
exists — grep first), `GET /api/logs?limit=3` (a small `useRecentLogs` hook),
preferences hook, `estimateMinutes` for `estMinutes` per library entry.

Screen (per spec): plan header (`SESSION 12 OF 84 · O2`) or freestyle line
with `/plan` link; suggestion card (title, reason, resolved target preview
when baselines exist); SHUFFLE cycling `poolIds` (wraps, persists via
todayPick); LAST THREE (title, days-ago via the house phrasing,
held/under/over glyph when the log carries one — read the logs list shape
from `stores/logs.ts` `list()` before rendering); empty-library state links
to the builder. Tapping the card → `/library/:id`.

Tests: both modes (mock plan states), SHUFFLE wrap + persistence (same-day
reload keeps the pick; date change discards), last-three incl. empty, the
route flip (`/` lands on Today). e2e rides in Task 4. Full gate (src change).
Commit `feat: Today suggests — plan-driven or freestyle`.

---

### Task 3: Plan

**Files:**
- Create: `app/src/plan/Plan.tsx` (+test); Modify: `AppRoutes.tsx:60`,
  `app/src/index.css`

Screen: two preset cards (name, one-liner, `84 SESSIONS`); choosing when no
plan is active = single tap (PUT, optimistic per the codebase's existing
mutation idiom — grep `You.tsx`/`BaselineEditor` for the pattern); active
plan renders the sequence list (`done ✓ / today ▶ / upcoming`, today row
visually distinct, list scrolls — 84 rows); RESET and SWITCH both staged
confirms with copy naming the consequence (`This resets your progress —
session 1 becomes today`). Errors surface via the existing field-error/alert
idiom.

Tests: choose/switch/reset flows incl. both stages of each confirm; sequence
rendering states; API error path. Full gate. Commit
`feat: the Plan screen — presets, sequence, deliberate resets`.

---

### Task 4: Confirm targets + the run placeholder + the flow e2e

**Files:**
- Create: `app/src/session/ConfirmTargets.tsx` (+test),
  `app/src/session/RunPlaceholder.tsx` (+test)
- Modify: `AppRoutes.tsx` (add `/session/confirm`, `/session/run`),
  `app/src/workout/WorkoutDetail.tsx` (Start builds+saves the draft, then
  navigates — Start is currently disabled/stub, verify its state),
  `app/src/index.css`
- Modify: `app/e2e/` — the full-flow spec

Confirm screen consumes Task 1's module exclusively — **no direct
localStorage access in the component** (the module owns the key). Per-step
rows: duration stepper (30 s grid), rep stepper when a marker exists,
remove/restore (struck rows visible with `text-decoration` + excluded via
`draftSteps`), SPM stepper 18–32 (wakes from step spm or 20), split nudge ±1
for split steps, effort steps show `effortWord` and no nudge control. Footer:
live `draftMinutes` recount (labelled `43 MIN`) + START. START stamps
`startedAt`, navigates `/session/run`. No draft → redirect `/today`
(also: Today's mount discards a stale unstarted draft >24 h).

RunPlaceholder: renders title + effective step count + `6B builds the timer
here`; reload-safe (reads the draft on mount; no draft → `/today`).

e2e (the phase's proof): Today → suggestion → detail → Start → confirm →
adjust one duration, one SPM, strike one step → recount changes → START →
placeholder shows title → **reload** → placeholder still shows it. Design
sweeps for the two new screens ride in Task 5; the flow spec lands here.
Full gate. Commit `feat: confirm targets writes the session draft; run
placeholder proves the round trip`.

---

### Task 5: Close-out

**Files:** `app/e2e/design.spec.ts` (+screenshots spec), `ROADMAP.md`,
`docs/design/DEVIATIONS.md`

- Design sweeps (tap targets, axe, tokens) for Today, Plan, Confirm — each
  with real data: a plan active, logs present, and the confirm sweep run
  **with an effort step present** (the no-nudge state is a distinct layout;
  the split-only sweep would repeat the fixture blind spot).
- Screenshots: `today.png`, `plan.png`, `confirm.png` seeded with real data;
  open every image, describe it.
- ROADMAP: mark the `num` two-release item done (both releases shipped and
  deployed 2026-08-01); add `## Phase 6A` section (5C–5H shape, PR #TBD);
  note 6B/6C remain.
- DEVIATIONS end-to-end pass.
- Full gate. Commit `test: structural coverage for the session screens;
  record 6A and the num retirement`.

---

## Notes

- Task 2/3 can NOT run in parallel (both touch `AppRoutes.tsx`, `index.css`).
  Sequential as numbered.
- The Start button's current detail-screen state is `UNVERIFIED` — it exists
  visually (screenshots show it disabled); Task 4's implementer reads the
  component before wiring it.
- If the placeholder Today/Plan components turn out to live somewhere
  unexpected, the route table at `AppRoutes.tsx:44/:60` is the source of
  truth — follow its imports.
