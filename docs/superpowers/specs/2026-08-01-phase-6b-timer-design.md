# Phase 6B — Countdown, live timer, resilience

**Date:** 2026-08-01
**Status:** Approved (session-end decision James's, 2026-08-01; visuals are
the handoff's, `docs/design/README.md` §5–6, which is exhaustive here)

## Problem

6A ends at a placeholder. 6B replaces it with the product's core: countdown →
live timer → session complete, correct under screen lock, reload, and a
sweaty thumb, for both time and distance phases.

## Decisions

| Question | Decision |
|---|---|
| Past the last phase (6C's log doesn't exist yet) | **Session-complete holder**: name, total elapsed, per-step actuals where known; the finished session persists for 6C. Same ship-the-contract pattern as 6A's placeholder. |
| Visuals | The handoff's, verbatim (§5 countdown, §6 timer portrait+landscape — sizes, dots, cards, ruler, controls are all specified; deviations go to DEVIATIONS.md). |
| Time source | **Wall-clock, not accumulated ticks** (below) — the only design that satisfies "1 s tick correct under screen lock". |
| Run state | A **separate** versioned record (`ergomatic.sessionRun`, `v:1`), not new fields on the draft — the draft stays the confirm contract; run state is the engine's. Expand-only, unknown `v` → null, same discipline. |
| Keep-awake | On during countdown + timer + complete, released on exit. Native: `@capacitor-community/keep-awake` (already installed). Web: Screen Wake Lock API best-effort. **Platform conditionals only in the adapter layer** (`src/adapters/`), per the lint-enforced rule. |
| Countdown length | `preferences.countdownSeconds` — **already exists server-side** (verified: `server/stores/preferences.ts:11`). 0 = straight to the timer. Zero server changes again. |
| Effort phases | `targetKind: "effort"` phases show the word (`ALL OUT`/`EASY`) as the target card and `rate free` unless SPM set — the estimate (`targetSplit`) is never displayed, per the 5G contract. |

## Architecture

### The session engine (`app/src/session/engine.ts`) — pure, the phase's core

State machine over `phases(draftSteps..., baselines, tol)` output. All timing
derives from **absolute timestamps**:

```ts
interface SessionRun {
  v: 1;
  phases: EnginePhase[];      // frozen at start: the expanded phase list +
                              // per-phase targets (split resolved, spm, kind)
  index: number;              // current phase
  phaseStartedAt: string;     // ISO — when the current phase began
  pausedAt: string | null;    // ISO while paused
  pausedTotalMs: number;      // accumulated pause time, current phase
  actuals: Record<number, PhaseActual>; // distance phases: elapsed → split
  startedAt: string;
  completedAt: string | null;
}
```

`remaining(run, now)` = phase duration − (now − phaseStartedAt − pausedTotalMs).
A 1 s `setInterval` merely re-renders; **elapsed time is recomputed from
`Date.now()` every render**, so a locked screen, a throttled tab, or a full
reload land on the correct remaining time. Auto-advance runs on render when
remaining ≤ 0 — including catching up across MULTIPLE elapsed phases after a
long lock (walk forward, consuming each phase's duration; distance phases
stop the walk — they cannot auto-advance, the rower must press NEXT).

Every transition (`advance`, `rewind`, `pause`, `resume`, `next` on distance)
persists the run record synchronously. Reload = `loadRun()` + recompute.

### Screens

- **Countdown** (`/session/countdown`): handoff §5 — `GET ON THE HANDLE`,
  140px numerals counting `countdownSeconds → 1`, next-phase line, CANCEL
  (back to confirm) + `SKIP ›`. 0 = skipped entirely. Tabs hidden.
- **Timer** (`/session/run`, replacing the placeholder): handoff §6 portrait
  and landscape, including phase dots, TARGET SPLIT / RATE cards, UP NEXT,
  TOTAL LEFT with the ¼ ½ ¾ ruler, ◀ Pause ▶. `◀`/`▶` skip and re-seed;
  warm-up/rest/test show `Easy`/`Rest`/`All out` and `rate free` — never a
  bare dash at display size. `END →` = staged confirm (abandons the run;
  copy names it), the draft/run records clear.
- **Distance phases**: target meters + resolved range, count-UP stopwatch,
  full-width `NEXT →` (≥44px); on NEXT, elapsed yields the actual average
  split (`(elapsedSeconds / meters) × 500`), stored in `actuals` with
  `actualSource: "stopwatch"` for 6C.
- **Session complete** (`/session/complete`): name, `TOTAL 34:12` elapsed
  (house format), per-step actuals list where known, `Back to Today`. The
  completed run record (with `completedAt`) persists for 6C; Today's
  stale-draft discard must NOT eat a completed-but-unlogged session — the
  discard rule gains "and no completed run record" (test it).

### Resilience requirements (each is a test, not a hope)

1. Reload mid-phase → same phase, correct remaining (± the render tick).
2. Reload while paused → still paused, same remaining.
3. Lock/suspend 3 phases' worth of time → resumes 3 phases later (time
   phases); a distance phase blocks the walk and shows its stopwatch running.
4. Reload on countdown → countdown restarts (deliberate: pre-handle, cheap).
5. `sessionRun` with unknown `v` or malformed shape → null + clear, the
   timer redirects to `/today`, the DRAFT survives (they're separate keys).
6. Killing the app mid-session and reopening → resume (same as reload; the
   records are already on disk — say so in the PR for James's device check).

## Testing

- Engine: pure unit tests over a fake clock — every resilience case above,
  the multi-phase catch-up walk, distance-block, pause accounting across
  reloads, actual-split arithmetic (hand-computed pins), effort phases
  showing words. Self-mutation DoD.
- Screens: client tests for both orientations' render paths (jsdom can't
  rotate; test the component split, and the e2e viewport does landscape),
  countdown skip/cancel/zero, END staged confirm, tabs hidden.
- e2e: the full session — confirm → countdown → skip → run a short workout
  (author a 2-step 0:05-ish one for speed) → distance NEXT → complete →
  Back to Today; plus a `page.reload()` mid-phase asserting the clock
  position; design sweeps + screenshots for countdown/timer/complete,
  portrait AND the 844×420 landscape sweep the handoff's own frame uses.
- On-device (James, post-merge): lock-screen survival, keep-awake, app-kill
  resume — Chromium cannot prove these; the PR says so.

## Out of scope

6C: the log screen, Held/Under/Over, pain, notes, `doneN` advance UI (the
holder persists what 6C needs). PM5 (Phase 7). Landscape for non-timer
screens.

## Exit criteria

- A seeded workout runs end to end: countdown → every phase kind → complete,
  with per-step stopwatch actuals for distance phases.
- Reload mid-phase and mid-pause both restore exactly; a 10-minute suspend
  fast-forwards correctly through time phases and halts at a distance one.
- Effort phases read `ALL OUT`/`EASY`, never a number, never a dash.
- All gates green; screenshots of all three screens in portrait + the timer
  in landscape, opened and checked.
