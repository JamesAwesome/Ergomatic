# Phase 6B — Countdown, live timer, resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app replaces paper on the erg — countdown → live timer →
session complete, correct under lock, reload, and app-kill, for time,
distance, and effort phases.

**Architecture:** One pure engine (`session/engine.ts`) over wall-clock
timestamps persisted in a versioned run record; screens render it. No timer
or state-machine library (spec §Build vs buy). Keep-awake behind the adapter
layer. Zero server changes.

**Tech Stack:** TypeScript strict ESM, React 19, `@capacitor-community/keep-awake`
(already installed), Screen Wake Lock API (web), Vitest fake timers, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-01-phase-6b-timer-design.md` — read
it before any task. **Every implementer reads `.claude/agent-briefing.md`
first.** Design authority: `docs/design/README.md` §5–6 (exhaustive — sizes,
dots, cards, ruler; deviations to DEVIATIONS.md).

## Global Constraints (beyond the briefing)

- Worktree `.claude/worktrees/phase-6b`, branch `phase-6b-timer`.
- **Wall-clock only**: elapsed derives from `Date.now()` against persisted ISO
  timestamps on EVERY render; the interval only repaints. Never accumulate
  ticks. The catch-up walk consumes whole phase durations and **halts at
  distance phases**.
- Run record `ergomatic.sessionRun`, `v: 1`, expand-only, unknown/malformed →
  null + clear; the DRAFT (separate key) must survive a bad run record.
- Draft module owns `ergomatic.sessionDraft`; run module owns
  `ergomatic.sessionRun`; **components touch neither key directly**.
- Effort phases (`targetKind: "effort"`): the word (`effortWord`), never the
  numeric estimate, never a dash. `rate free` when no SPM.
- House time format everywhere (`fmtDuration`/`fmtDurationSpoken`); timer
  numerals are the handoff's 96px portrait / 128px landscape / 140px countdown.
- Platform conditionals ONLY in `src/adapters/` (lint-enforced); follow
  `adapters/auth.tsx`'s `isNative()` + `vi.doMock` test idiom.
- Tabs hidden during countdown/timer/complete (the shell renders `TabBar` at
  `AppRoutes.tsx:75` — hide by route, and the design sweep asserts it).
- Stopwatch actual split: `(elapsedSeconds / meters) × 500`, stored with
  `actualSource: "stopwatch"` — hand-computed pins in tests.
- `preferences.countdownSeconds` exists (`server/stores/preferences.ts:11`);
  0 = straight to timer. Zero server changes.

---

### Task 1: The engine and the run record

**Files:**
- Create: `app/src/session/engine.ts`, `app/src/session/engine.test.ts`,
  `app/src/session/run.ts`, `app/src/session/run.test.ts`

**Interfaces:**
- Consumes: `phases`, `estimateMinutes` (`domain/expand.js`); `effectiveSteps`,
  `loadDraft` (`session/draft.ts`); `isEffortRef`/`effortWord` already flow
  through `Phase.label`/`targetKind`.
- Produces (Tasks 2–4 consume; exact names):

```ts
// run.ts — persistence only, mirroring draft.ts's discipline
interface PhaseActual { elapsedSeconds: number; splitSeconds: number; actualSource: "stopwatch"; }
interface SessionRun { v: 1; phases: EnginePhase[]; index: number;
  phaseStartedAt: string; pausedAt: string | null; pausedTotalMs: number;
  actuals: Record<number, PhaseActual>; startedAt: string; completedAt: string | null; }
RUN_KEY = "ergomatic.sessionRun";
loadRun(): SessionRun | null;      // unknown v / malformed -> null + clear
saveRun(r: SessionRun): boolean;   // quota-safe
clearRun(): void;

// engine.ts — pure functions, no storage, no React
interface EnginePhase { /* Phase (domain) + seconds|meters + targetKind +
  label + spm + originalIndex (for 6C's per-step attribution) */ }
buildRun(draft: SessionDraft, baselines: Baselines, tol: number, now: Date): SessionRun;
remainingSeconds(run, now): number;          // time phases
elapsedSeconds(run, now): number;            // distance phases (count-up) + totals
tick(run, now): SessionRun;                  // the catch-up walk; halts at distance
pause(run, now) / resume(run, now): SessionRun;
advance(run, now) / rewind(run, now): SessionRun;   // ◀ ▶: skip + re-seed
nextDistance(run, now): SessionRun;          // records the actual, advances
isComplete(run): boolean;                    // past the last phase
totalRemainingSeconds(run, now): number;     // TOTAL LEFT (distance phases
                                             // contribute their estimate)
```

Test demands (fake clock via explicit `now` params — the engine takes `Date`
arguments precisely so tests never need `vi.useFakeTimers` for logic):
- Every spec resilience case (§Resilience 1–6) as a named test.
- The catch-up walk: suspend 3 time-phases' worth → index +3 with per-phase
  `phaseStartedAt` seeded correctly (walk leaves the newest boundary, not
  `now`); a distance phase mid-walk halts it with its stopwatch baseline at
  the walk's arrival time.
- Pause accounting: pause → reload (re-load run) → resume → remaining
  identical to never-reloading (hand-computed).
- `nextDistance` on a 2000 m phase entered at t=0, NEXT at t=452 s →
  `splitSeconds = 113` (`452/2000×500`), pinned by hand arithmetic in a
  comment.
- `buildRun` freezes phases from the DRAFT (effectiveSteps + spmOverrides +
  nudges folded per draft.ts's own rules) — byte-stable across two calls with
  the same inputs.
- Effort phase: `label: "ALL OUT"`, `targetKind: "effort"` carried through.
- Self-mutation DoD; per-file 100% expected on both new files (HTML report).

No e2e (nothing renders yet — say so in the report). Commit:
`feat: the session engine — wall-clock, catch-up walk, distance blocking`.

---

### Task 2: Keep-awake adapter + countdown

**Files:**
- Create: `app/src/adapters/keepAwake.ts` (+`keepAwake.test.ts`),
  `app/src/session/Countdown.tsx` (+test)
- Modify: `app/src/shell/AppRoutes.tsx` (route `/session/countdown`; tab
  hiding for the three session routes), `app/src/index.css`

**Interfaces:**
- Produces: `keepAwakeOn(): Promise<void>` / `keepAwakeOff(): Promise<void>` —
  native → `KeepAwake.keepAwake()/allowSleep()`; web → `navigator.wakeLock`
  best-effort (absent API = silent no-op; re-acquire on `visibilitychange`
  since the lock releases when hidden). Test both arms via the
  `adapters/auth.test.tsx` `vi.doMock("../platform")` idiom.
- Countdown per handoff §5: `GET ON THE HANDLE`, 140px accent numerals
  `countdownSeconds → 1`, next-phase line (first phase's label from the run
  — build the run on countdown MOUNT via Task 1's `buildRun` so the timer
  starts with zero setup lag; reload-on-countdown rebuilds it, which IS the
  spec's "countdown restarts"), CANCEL → `/session/confirm`, `SKIP ›` →
  `/session/run`. `countdownSeconds === 0` → immediate redirect, no flash.
- Tab hiding: the shell (read how `AppRoutes.tsx:75` renders `TabBar`)
  suppresses it for paths starting `/session/countdown|run|complete`; a
  client test pins it and Task 5's sweep asserts it in-browser.

Countdown's tick may use a plain interval — it renders wall-clock remaining
from its own mount timestamp (same principle, small scale; a reload restarts
it deliberately).

Full gate (src change) incl. e2e. Commit:
`feat: countdown, keep-awake behind the adapter, tabs hide for sessions`.

---

### Task 3: The timer — portrait + distance mode

**Files:**
- Create: `app/src/session/Timer.tsx` (+test), split subcomponents as files
  if it grows past ~300 lines (`TimerTargets.tsx`, `TimerRuler.tsx` — your
  judgement, one responsibility each)
- Modify: `app/src/shell/AppRoutes.tsx` (`/session/run` swaps the 6A
  placeholder for the real Timer; keep the no-draft/no-run redirect),
  `app/src/index.css`

Portrait per handoff §6, exactly: name + `END →`; phase dots (past accent /
current ink / future rule token); `STEP N OF M · WORK · SET 1/4` +
RUNNING/PAUSED; time-left mono 96px (distance: count-UP elapsed); 6px phase
bar; TARGET SPLIT card (mono 30px accent + range beneath; effort → the word;
warm-up/rest → `Easy`/`Rest`) and RATE card (spm or `rate free`); UP NEXT
strip; TOTAL LEFT + 6px bar + the ¼ ½ ¾ ruler; ◀ Pause ▶ (56px). Distance
phases: meters + resolved range, stopwatch, full-width `NEXT →` ≥44px.
`END →` staged confirm (BaselineEditor idiom; copy names abandonment), clears
draft + run, → `/today`.

The component: one 1 s interval for repaint; every displayed number computed
via engine functions with `new Date()`; `tick()` applied on each repaint and
on `visibilitychange` (the catch-up walk fires there after a lock). On
`isComplete` → navigate `/session/complete` (Task 4 builds it; until then
navigate to the route anyway — Task 4 lands before e2e runs the full flow;
your task's e2e covers the timer through phases, not completion).

Client tests: phase-kind rendering table (work-split, work-effort, wu, rest,
distance) — realistic fixture: a real starter workout with an added effort
step via the draft; pause/resume; ◀ ▶ re-seed; END staged confirm; the
never-a-dash rule (assert the literal strings for every kind). Self-mutation
DoD. Full gate incl. e2e. Commit: `feat: the live timer — portrait, every
phase kind, distance stopwatch`.

---

### Task 4: Landscape, session complete, the resilience e2e

**Files:**
- Modify: `app/src/session/Timer.tsx` (+css) — landscape two-column layout
  per handoff §6 (128px numerals; left column phase/time/bars/controls;
  right column name/dots/cards/UP NEXT with "then …")
- Create: `app/src/session/SessionComplete.tsx` (+test)
- Modify: `app/src/today/Today.tsx` (the stale-discard rule gains "and no
  completed run record" — read its current mount effect), `AppRoutes.tsx`
  (`/session/complete`)
- Modify: `app/e2e/flows.spec.ts` (or a new `session.spec.ts`) — the full
  session flow + the reload assertions

Landscape: CSS via `@media (orientation: landscape)` (the handoff's own
frame is 844×420) — same component, two-column grid; no separate route.

SessionComplete: name, `TOTAL <elapsed>` house-format, per-step actuals list
(stopwatch splits via `fmtSplit`), `Back to Today`. Sets `completedAt`,
KEEPS the run record for 6C; keep-awake released here.

Today's discard: a completed-but-unlogged run record protects its draft from
the stale discard (test both directions: stale+no-run → discarded;
stale+completed-run → kept).

The e2e (the phase's proof): author a tiny workout via bulk import
(`w 0:03 6k`, `w 100m max`, spm optional) → confirm → START → countdown
SKIP → time phase auto-advances (3 s real wait) → distance phase: assert
stopwatch counts UP, press `NEXT →` → complete screen shows an actual split
→ Back to Today. Plus: `page.reload()` mid-time-phase → same phase, remaining
within ±2 s; `page.reload()` while paused → still paused. Landscape: set the
viewport 844×420, assert the two-column layout's key elements.

Full gate. Commit: `feat: landscape, session complete, and the reload proofs`.

---

### Task 5: Close-out

**Files:** `app/e2e/design.spec.ts`, `app/e2e/screenshots.spec.ts`,
`ROADMAP.md`, `docs/design/DEVIATIONS.md`

- Sweeps (tap targets, axe, tokens) for countdown, timer portrait, timer
  landscape (844×420), complete — the timer swept in BOTH a time phase and a
  distance phase (the NEXT → layout is distinct), and with an effort phase
  target visible. Assert tabs are absent on all three routes.
- Screenshots: `countdown.png`, `timer.png` (portrait, work phase, targets
  visible), `timer-landscape.png`, `session-complete.png` — seeded real data,
  every image opened and described.
- ROADMAP: 6B section (shape of the neighbours), noting on-device checks are
  James's (lock-screen, keep-awake, app-kill). DEVIATIONS end-to-end pass.
- Full gate incl. `pnpm test:coverage` per-file reads.
  Commit: `test: structural coverage for the session screens; record 6B`.

---

## Notes

- Task order is strict: 1 (pure) → 2 (countdown+adapter) → 3 (timer) →
  4 (landscape+complete+e2e) → 5. Tasks 2–4 all touch `AppRoutes.tsx` —
  sequential, never parallel.
- The engine's `Date`-parameter style is what makes the resilience suite
  cheap — if you find yourself reaching for `vi.useFakeTimers` in
  `engine.test.ts`, the API is being misused.
- Timer numerals at 96/128px in the mono face may need `font-variant-numeric:
  tabular-nums` to stop width jitter — check how the builder's mono numerals
  handle it (`UNVERIFIED`), and if nothing does, add it deliberately with a
  comment.
