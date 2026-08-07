# Phase 7B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A rower connects a PM5 from the workout detail, programs it,
rows against three live panes, and ends — by button or by the machine —
into the existing log flow, with every failure typed and rendered.

**Architecture:** Approach A — a separate ConnectedSession tree
(`useMonitorSession` hook owning the driver lifecycle;
ConnectedInterstitial; ConnectedSurface), presentational pieces
extracted from the shipped timer with neutral props, the phone timer's
logic untouched. Two stages: seam-and-guards first (Tasks 1-3, no
screens), then the flow (Tasks 4-7), then e2e + close-out (Task 8).

**Tech Stack:** unchanged — TypeScript, React, vitest, Playwright; the
fake transport drives CI end-to-end behind a DEV-gated injection seam.

**Spec:** `docs/superpowers/specs/2026-08-07-phase-7b-connected-design.md`
(the ADVERSARIALLY REVISED version, 3ce0b93 — states 1-3 and
auto-reconnect are DESCOPED; do not resurrect the first draft's claims).
**Visual authority:** `docs/design/handoffs/2026-08-05-connected-mode/`
(committed; targets-INK supersession governs).
**Every implementer reads `.claude/agent-briefing.md` first.**

## Global Constraints

- Worktree `.claude/worktrees/pm5-7b`, branch `phase-7b-connected` (no
  PR yet). **COMMIT FIRST, MUTATE AFTER.**
- Node 26: `export PATH="$HOME/.local/share/nvm/v26.5.0/bin:$PATH"`,
  verify v26.5.0 before anything.
- Baseline: **2335** all-projects
  (`NODE_OPTIONS=--no-experimental-webstorage npx vitest run`), e2e
  **210**. Counts move UP only; report per task.
- **Every behaviour gets a test that fails against today's code**;
  quote each failure. Fake-driven where the driver is involved; the
  fake models the machine we met (empty arm included).
- Layering: `domain/monitor/**` imports nothing from `src/`; screens
  talk to the driver ONLY through `useMonitorSession`; no bit math
  outside `pm5/`. No wall clock in driver/hook/tests — tick/frame
  driven (the paused hold is FRAMES, not seconds).
- Design law: five button levels, one L1 per screen, accent's four
  meanings (+ the pane-C countdown), ≥44px targets, no mono label
  below `--ink-3`; targets INK on connected panes (the supersession).
- Hardware facts cite §18/§19; the paused caveats ship in code
  comments; single-sample evidence says so.
- The phone timer: e2e/design suites byte-identical; DOM/behaviour
  unchanged; unit-test signature changes enumerated in task reports.
- The James-operated verification row is Task 8's runsheet, NOT run by
  any agent.

---

### Task 1: The seam pays its debts — device name + ProgramBusyError

**Files:**
- Modify: `app/src/monitor/driver.ts`, `app/domain/monitor/types.ts`,
  `app/src/monitor/transports/fake.ts` (test-transport name plumbing),
  `app/src/monitor/monitorRun.ts` (deviceName already in the record —
  verify, wire), tests beside each; `app/scripts/pm5-lab.ts` (passes
  the picked name — coverage-excluded)

**Interfaces produced (every later task consumes):**
```ts
// createPm5Driver gains the picked device's name:
export function createPm5Driver(
  transport: Transport, log: MonitorEventLog,
  options?: DriverOptions & { deviceName?: string },
): MonitorDriver;
// capabilities.deviceName: the picked name, never the "PM5" placeholder
// when one was provided; MonitorRun.deviceName carries it.

// Thrown BEFORE the lifecycle (before sendPrepare) when a program()
// is already in flight. NOT a ProgramRejectionReason — that union
// stays machine-statements-only.
export class ProgramBusyError extends Error { readonly name = "ProgramBusyError"; }
```

Steps: failing tests first (capabilities carry the passed name — fails:
placeholder; `MonitorRun.deviceName` from the driver — check current
source; second `program()` during an in-flight one rejects
`ProgramBusyError` immediately with NO wire traffic (assert write count
unchanged) — fails today: the stranding from fix-3 Task 2's Probe C);
implement; the busy error's copy explicitly NOT "PM5"-attributed.
Mutations: drop the in-flight gate → the busy test dies; placeholder
fallback removed → the no-name path dies. Full gates; 100% on driver.
Commit: `feat: the driver knows its erg's name and says busy itself`.

---

### Task 2: The F5 walk closes — Connect guard + guarded cross-clears

**Files:**
- Modify: `app/src/screens/WorkoutDetail.tsx` (`handleStart` reads
  `loadMonitorRun()` too; the Connect guard added — direct reads, the
  Today.tsx pattern, staged confirm), `app/src/session/run.ts`
  (`buildRun`/`saveRun` reverse cross-clear — behind the confirm path
  only), `app/src/monitor/monitorRun.ts` (comment updates naming the
  shipped obligation), tests beside each

Behaviour (spec §3, all binding): Connect over an unlogged SessionRun
stages "You have an unlogged session — connecting discards it."; Start
over an unlogged MonitorRun gets the same Replace warning (the guard
WIDENED, not rerouted — quote ROADMAP M-1 at the site); no silent
destruction in either direction; Today's cold-start guard untouched
(pinned byte-identical).

Failing tests: Connect with `{sessionRun: unlogged}` today walks
straight to `createMonitorRun`'s `clearRun()` (build the harness that
proves the data loss, then the guard); Start with
`{monitorRun: unlogged}` destroys it silently today; both confirm
paths proceed after the stage; both cancel paths preserve. Mutations:
route the Connect guard through `anyLiveSession()` → the unlogged test
dies (the downgrade-to-none is the mutation); drop the handleStart
widening → its pin dies. Full gates; e2e for the two staged confirms.
Commit: `fix: two doors, one lock — no silent destruction in either direction`.

---

### Task 3: Extraction + the judge

**Files:**
- Create: `app/domain/judge.ts` (+test), `app/src/components/
  IntervalSegments.tsx`, `app/src/components/UpNextStrip.tsx`
  (+tests) — extracted with NEUTRAL VALUE PROPS
- Modify: `app/src/screens/Timer.tsx` (consumes the extracted pair),
  `app/src/components/TimerTargets.tsx` (variant prop: ink targets +
  static third line + judged-actual slot; default variant renders
  byte-identical DOM), `docs/design/DEVIATIONS.md` (tolerance
  constants row; Phase-9 pointer)

**Interfaces produced:**
```ts
// domain/judge.ts — NEW (toleranceRange() is DELETED history; cite
// DEVIATIONS rows 53/54 at the header)
export const PACE_TOLERANCE_SECONDS = 2;
export const SPM_TOLERANCE = 2;
export type Judgement = "under" | "within" | "over" | "stale";
export function judgeActual(args: {
  kind: "pace" | "spm" | "hr" | "meters";
  actual: number | null; target: number | null; stale: boolean;
}): Judgement;   // null actual/target -> "within" (never judged)

// IntervalSegments: { total: number; current: number; kinds: ("work"|"rest"|"wu")[] }
// UpNextStrip:     { upNext: string | null; thenNext: string | null }
```

`TimerRuler` needs NO extraction (already numeric-prop) — do not touch
it. The phone timer's design/e2e suites MUST pass byte-identical;
`upNextText`/`thenNextText` stay in Timer.tsx (the strip takes their
OUTPUT). Failing tests: judge's three states + stale override + null
never judged; the extracted components render the timer's exact DOM
(snapshot lifted BEFORE extraction, asserted after). Mutations: flip a
tolerance boundary (`<=` → `<`) → the boundary test dies; the
TimerTargets default variant diverges → the byte-identical pin dies.
Full gates; enumerate every unit-test signature change in the report.
Commit: `refactor: the timer lends its pieces without changing its face`.

---

### Task 4: `useMonitorSession` — the heart

**Files:**
- Create: `app/src/monitor/useMonitorSession.ts` (+test)
- Modify: `app/src/monitor/monitorRun.ts` ONLY as the completion
  writer's first caller requires (no semantic change)

**Interfaces produced (Tasks 5-7 consume verbatim):**
```ts
export type ConnectedPhase =
  | "idle" | "picking" | "pairing" | "programming" | "ready"
  | "failed" | "live" | "paused" | "disconnected" | "ended";
export interface ConnectedError {
  reason: ProgramRejectionReason | "busy" | "bluetooth-off"
        | "transport-missing" | "scan-dismissed";
  detail: string; raw?: string;
}
export interface MonitorSession {
  phase: ConnectedPhase; error: ConnectedError | null;
  deviceName: string | null; frame: MonitorFrame | null;
  actuals: IntervalActual[]; endedBy: "machine" | "user" | null;
  connect(): Promise<void>;      // opens the OS picker ("picking")
  program(p: WorkoutProgram): Promise<void>;
  endSession(): Promise<void>;   // idempotent vs terminal events
  cancel(): Promise<void>;       // per-state machine semantics (spec §2)
}
export function useMonitorSession(): MonitorSession;
```

Behaviour (spec §2 + Decisions, all binding):
- Phase transitions map to REAL events: `armed`→ready; first rowing
  frame→live; `workoutComplete`→ended(machine); `terminated`→
  ended(machine); driver `disconnected` event→disconnected.
- `program()` flips phase to `"programming"` SYNCHRONOUSLY before
  awaiting (the double-fire pin); `ProgramBusyError`/typed rejections
  → `"failed"` with the mapped `ConnectedError`; a dismissed picker
  (`NotFoundError`) → `scan-dismissed`.
- **P3b:** any program failure with a run open stamps `completedAt`
  (record close); terminal events for an already-closed run are IGNORED
  (pinned); `disconnected` reason attempts no terminate.
- **Paused (spec §2 verbatim):** the four rowing metrics unchanged
  together across 4 consecutive frames while rowing; exit on ANY
  change; the no-rest boundary-reset shape (elapsed 0, spm 0, distance
  0 — the recorded false-positive) must NOT fire it; the caveat comment
  block ships (empty-arm-only evidence; §17 row pending; frames not
  seconds; ~500ms observed cadence vs 100ms requested).
- Persistence: `createMonitorRun` at live; `recordActual` per
  in-run `intervalComplete`; `completedAt` at ended/P3b-close.
- Teardown on unmount: disconnect, listeners removed, no leaked
  driver (pinned with the fake's subscription introspection).

Failing tests, fake-driven where possible: the full happy walk
(picking→…→ended by machine); ended-by-user; the paused fixture pair
(the RECORDED boundary-reset frames as the must-NOT-fire case; a
four-frozen synthetic as the must-fire); double-fire; P3b walk incl.
ignored terminal; busy; teardown. Mutations: drop the sync phase flip
→ double-fire dies; widen paused to 2 frames → the boundary-reset
fixture dies; drop the ignore-after-close → its pin dies. Full gates;
100% on the hook. Commit: `feat: one hook owns the whole conversation`.

---

### Task 5: Connect + the interstitial

**Files:**
- Create: `app/src/screens/ConnectedInterstitial.tsx` (+test)
- Modify: `app/src/screens/WorkoutDetail.tsx` (the Connect button:
  second in stack, L2, `LAST USED · <name>` caption from localStorage,
  Bluetooth-off dashed treatment opening the OS prompt), router,
  tests; `app/src/api/` only if the BT-availability probe needs a
  helper

Behaviour: the handoff's states 4 (pairing checklist), 5 (programming —
checklist + the static `WHAT THE MONITOR IS GETTING` panel, NO
interval counter per the spec's I7 ruling), 6 (failed — every
`ConnectedError` rendered in the handoff's copy: serif line "The
monitor wouldn't take it" for machine reasons, reason-appropriate lines
for busy/bluetooth-off/transport-missing/scan-dismissed; DETAIL panel
with reason + detail + raw; Try again L1 inert unless failed; "Row on
the phone timer instead" L2 → the existing Start path with targets
intact; Cancel L2), 7 (ready — 1.2s dwell, "Show me the numbers" L1
skips). NO states 1-3 (the OS picker is the scan UI — `picking` shows
nothing of ours; the descope comment cites spec C2). No spinner
anywhere; checklist markers only. Copy verbatim from the handoff's
table; the copy-review list is the handoff's §2.

Failing tests: each state renders from its phase+error fixture; state
6 renders `structure-mismatch`'s triple in DETAIL; Try-again inertness;
the 1.2s dwell auto-advance (fake timers); Connect button's three
states (available/BT-off/absent-transport). e2e: the interstitial walk
fake-driven. Full gates. Commit:
`feat: seven states drawn, four built, three honestly declined`.

---

### Task 6: The surface — shell, panes A and B, mid-session states

**Files:**
- Create: `app/src/screens/ConnectedSurface.tsx`,
  `app/src/screens/connected/PaneTimer.tsx`, `PaneLive.tsx`,
  `PagerRail.tsx` (+tests, +css tokens per the handoff)

Behaviour: pane order A·B·C with landing/persistence per handoff (per
ROWER, first-ever lands B); swipe 60px threshold primary, labelled
rail fallback (portrait bottom band / landscape right rail, exact
dimensions from the handoff); pane A = the extracted pieces + the
judged NOW/RATE/METERS cards + `INTERVAL n OF m · WORK` + ink ROWING +
End (staged, full-width L2); pane B = hero split (judged) +
time-left/meters-left + three cards + mono strip + the SAME segments
and UP NEXT as A (never lose your place); targets INK everywhere with
static target lines; paused state (sunken block, greyed clock, `—`
NOW, `NOT ROWING`); disconnected state (spec C5's lose-and-degrade:
banner + greyed/`LAST` actuals + End live; NO reconnect promise — the
banner copy is the spec's, not the handoff's superseded RECONNECTING
line). Both orientations; landscape column layout per the handoff.

Failing tests: pane render fixtures per state; the judge wired through
every actual cell (mutate judge → every pane's tint tests die — the
one-helper rule proven); swipe + rail navigation; persistence;
paused/disconnected treatments; End staging. Full gates. Commit:
`feat: the monitor drives, the phone explains — panes one and two`.

---

### Task 7: Pane C + diagnostics

**Files:**
- Create: `app/src/screens/connected/PaneGrid.tsx`,
  `ConnectionLogSheet.tsx` (+tests)

Behaviour: the grid per the handoff — portrait two-line rows,
landscape one-line six-column, row states (completed solid / active
card with 2px ink border + accent countdown cell + third line /
upcoming `--ink-3` over dashed), distance-interval countdown rules +
the mono caption naming it in words, contained scroll (rows only,
header/caption/End pinned, active row scrolled into view — the ONE
landscape scroll exception, DEVIATIONS row 2); the diagnostics sheet
on triple-tap of any pager target (SheetShell, mono event list from
`exportLog()` read-on-open, `COPY LOG` L3, Close L2). No MISSED rows
(descoped with reconnect — the comment cites the spec).

Failing tests: row-state fixtures incl. the active row's accent
countdown being the pane's ONLY accent; distance rules; the scroll
containment (active-row-into-view); triple-tap opens (and double-tap
does NOT); COPY LOG copies the export verbatim. Full gates. Commit:
`feat: the grid tells the whole session, the sheet tells the whole truth`.

---

### Task 8: e2e, the runsheet, close-out

**Files:**
- Create: `app/e2e/connected.spec.ts`; the DEV-gated fake-injection
  seam (`app/src/monitor/transports/index.ts` or equivalent —
  `import.meta.env.DEV`-gated dynamic import; PROD bundle must not
  contain fake.ts)
- Modify: `app/vite.config.ts`/CI dist-grep gate (extend to `fake`),
  `docs/design/DEVIATIONS.md` (all rows the spec's exit criteria
  name), `ROADMAP.md` (7B checklist; the reconnect/background-scan
  follow-on itemized: Capacitor id-keyed reconnect, driver
  re-subscribe, `Transport.scan()` background variant +
  `DiscoveredMonitor.rssi`, MISSED-rows inheritance with the
  adversary's computation notes), `docs/monitor/pm5-interface-notes.md`
  (§17: the 7B verification row runsheet — a real library workout, ≥2
  intervals, the PAUSED reading (stop mid-interval on a REAL program:
  do the four freeze? plus the true cadence), machine-side end once and
  app-side end once across two runs, HR present; §18 scaffold with
  EMPTY pending slots)

e2e: the connected walk fake-driven at 390×844 AND 844×390 (new
assertion territory — pane C's five rows + the 56px rail asserted at
exactly 390 height); the interstitial states; the two staged confirms
from Task 2. Gates: full suite, e2e (report both counts), `pnpm build`
+ dist-grep proving no fake/lab/bridge in the bundle. Docs-only checks:
no stale "reconnecting"/"choosing" references outside the spec's own
history sections. Commit: `docs: ready for the row that connects it all`.

---

## Notes

- Task order is strict: 1→2→3 (seam/guards, no screens), 4 (the hook,
  consumes 1), 5→6→7 (screens, consume 3+4), 8 last. Tasks 5-7 could
  interleave reviews but not worktree-parallel (shared router/css).
- The paused §17 reading happens in Task 8's RUNSHEET (James), not in
  CI; the derivation ships with its caveats regardless of when the row
  runs — the false-positive regression fixture is the recorded
  boundary-reset frames either way.
- If any task finds the handoff and the shipped domain irreconcilable
  beyond this spec's supersessions: STOP, controller to James — the
  visual authority does not get silently edited.
