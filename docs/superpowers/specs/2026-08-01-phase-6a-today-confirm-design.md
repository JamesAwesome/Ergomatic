# Phase 6A — Today, Plan, and Confirm Targets

**Date:** 2026-08-01
**Status:** Approved (decomposition, no-plan behaviour, and confirm-as-route
all James's, 2026-08-01)

Phase 6 splits into three: **6A (this)** — pick and prepare a workout; **6B**
— countdown + live timer + distance mode + resilience; **6C** — log session +
frozen paces. Each is its own spec → plan → PR.

## Problem

The app can author and browse workouts but not run one. 6A builds the picking
and preparing half: a Today screen that suggests, a Plan screen that stops
being a stub, and a confirm-targets screen that produces the **session draft**
6B's timer will consume.

## What already exists (verified in-session)

- `domain/suggest.ts`: `suggest(input) → { recommendationId, reason, poolIds,
  fellBack }`, plan-code driven, honours `prefs.difficulties` and
  `timeCapMinutes`, `todayPickId` passthrough.
- `domain/plans.ts`: sprint / head presets, 84 sessions.
- `GET /api/plan` → `{ planKey, doneN, sequence[{code, status:
  done|today|upcoming}] }`; `PUT /api/plan` (sprint/head), `DELETE` reset.
- `GET /api/logs?limit=N` — **"last three" needs no new endpoint**
  (`limit=3`). The earlier brainstorm claim that one additive endpoint was
  needed is corrected here: **6A ships zero server changes.**
- Preferences (difficulties, time cap, warm-up minutes) via the existing API.

## Decisions

| Question | Decision |
|---|---|
| Phase split | 6A picking/preparing · 6B running · 6C logging. |
| No plan selected | **Freestyle**: Today still suggests (least-recently-done across the library, prefs honoured) with a quiet link to start a plan. |
| Plan screen | Built in 6A: choose sprint/head, view the sequence, staged-confirm for reset AND for switching (switching resets `doneN`). |
| Confirm targets | **Full-screen route** `/session/confirm`, from the detail screen's Start. |
| `todayPick` | **Client-side**: localStorage, keyed by date (and plan position when a plan is active). A daily ephemeral choice; keeps the API additive-only trivially. |
| Session draft | localStorage; the ONE artifact 6B consumes. Shape is expand-only from day one. |

## Design

### Session draft (the load-bearing contract)

`app/src/session/draft.ts` — pure functions plus a versioned shape:

```ts
interface SessionDraft {
  v: 1;                       // expand-only versioning
  workoutId: string | null;   // null if the workout is deleted later
  title: string;
  type: WorkoutType;
  steps: Step[];              // deep copy at confirm time — never the library object
  nudges: Record<number, number>;       // step index -> seconds (splits only)
  spmOverrides: Record<number, number>; // step index -> 18..32
  removed: number[];          // step indices struck at confirm
  createdAt: string;          // ISO, stamped at confirm entry
  startedAt: string | null;   // stamped by START; 6B requires it non-null
}
```

Persisted under `ergomatic.sessionDraft`. `buildDraft(workout)`,
`draftMinutes(draft, baselines)` (estimation via `estimateMinutes` on the
effective steps), `loadDraft()`/`saveDraft()` with a version check that
discards unknown shapes rather than crashing. Effort steps: valid in drafts;
`nudges` never gains an entry for one (nothing to nudge — same rule as the
detail screen); SPM overrides apply to any work step.

### Today (`/today`)

- Plan active: position header (`SESSION 12 OF 84 · O2`), suggestion card
  (title, reason line, resolved target preview), SHUFFLE cycling `poolIds`
  (wraps; persists the pick via `todayPick`), LAST THREE (logs `limit=3`:
  title, days ago, held/under/over glyph when present).
- Freestyle: same card driven by least-recently-done over the whole library
  (the engine's existing fallback path), plus one line linking to `/plan`.
- Empty library edge: links to the builder (cannot happen with seeded
  accounts, but the state must not render a blank card).
- The TODAY tab currently redirects `/` → `/library`; 6A makes `/` land on
  `/today` once the screen exists. The tab order stays as shipped.

### Plan (`/plan`)

Preset cards (sprint / head) with a one-line description and session count;
active plan shows the sequence list (done ✓ / today ▶ / upcoming) with the
today row visually distinct; staged-confirm (BaselineEditor idiom) for reset
and for switching away from an active plan, copy stating that `doneN` resets.

### Confirm targets (`/session/confirm`)

Entered from workout detail's Start (which builds and saves the draft). Per
step: duration steppers (30 s grid on the stepper, the house rule), rep
stepper when a marker exists, remove/restore (struck rows stay visible,
struck), SPM adjust 18–32 (stepper wakes from the step's own spm or 20),
split nudge ±1 s for split steps, `ALL OUT`/`EASY` shown for effort steps
with no nudge control. Live recount (`draftMinutes`) in the footer beside
START. START stamps `startedAt` and navigates to `/session/run` — in 6A a
deliberate placeholder screen that renders the draft's title + step count and
survives reload (proving the draft round-trips); 6B replaces it.

Deep-link/reload rules: `/session/confirm` with no draft redirects to
`/today`; a stale draft (older than 24 h, `startedAt` null) is discarded on
Today mount with no ceremony.

## Testing

- **Draft round trip** (heaviest): `buildDraft` → mutate (nudges, overrides,
  removals) → `saveDraft` → `loadDraft` byte-identical, pinned against real
  starter workouts including Microburst (effort step) and a distance workout.
  Version check: an unknown `v` loads as null, never throws.
- Client: both Today modes; SHUFFLE wraps and persists; last-three rendering
  incl. empty; plan choose/switch/reset staged confirms; confirm recount
  reacts to every control; effort rows show words and no nudge; removed rows
  excluded from the recount.
- e2e: full flow — Today → suggestion → detail → Start → confirm → adjust →
  START → placeholder → reload → draft intact. Design sweeps + screenshots
  for all three new screens with real data (a plan active, logs present).
- Self-mutation DoD per TESTING.md §13 throughout.

## Out of scope

6B: countdown, timer, distance stopwatch, resilience. 6C: log save, frozen
paces, `doneN` advance (the plan sequence shows `today` but nothing marks it
done in 6A). PM5 anything. Server changes of any kind.

## Exit criteria

- With a plan: Today names the right session and suggests something legal for
  it; SHUFFLE cycles; the pick survives an app restart (same day).
- Without a plan: Today still suggests; the plan link works; choosing sprint
  shows 84 sessions with today marked.
- Start → confirm → tweak (duration, SPM, nudge, remove) → START → reload:
  the placeholder still shows the draft.
- All gates green for the change classes touched; screenshots of Today, Plan,
  Confirm committed and visually checked.
