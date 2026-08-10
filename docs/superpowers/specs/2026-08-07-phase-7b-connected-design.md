# Phase 7B — the PM5 connected surface

**Date:** 2026-08-07
**Status:** Revised after adversarial review (same day; five Criticals,
seven Importants — every one verified against the raw captures and the
shipped code). Material changes a reviewer should see first: the paused
derivation was BACKWARDS and is redefined; interstitial states 1-3 are
not buildable by any shipped transport and are descoped; `judgeActual`
is new code (its claimed ancestor was deleted); the Connect guard and
BOTH cross-clears are redesigned around the F5 data-loss walk; and
**auto-reconnect is descoped to a named follow-on** (no transport can do
it today; web structurally cannot without a mid-piece modal) — the
biggest product-visible change, flagged for James's eye at the plan
gate. Prior approvals: one spec + staged plan; approach A; just-program.

## Why this exists

7A built the monitor domain; three fix phases made it match the machine
and made its verification trustworthy (`program()` either arms the real
workout or rejects typed — hardware-proven in both directions, §18
session 4b). 7B is the screens that domain was built to sit underneath.

**Visual authority:** the committed handoff
`docs/design/handoffs/2026-08-05-connected-mode/`. Sizes, colours,
states and copy are the handoff's; this spec binds it to the shipped
domain and settles what it left open — including, after the adversarial
pass, what the shipped transports make UNBUILDABLE. The standing law
(button levels, accent's four meanings, ≥44px, mono-label floors)
applies throughout.

**Supersessions, stated up front:**

- **Targets are INK on the connected panes** (the delegated ruling;
  handoff DEVIATIONS row 0). The handoff's pane-B "accent value" and
  reconnect-section "targets stay accent" lines are superseded.
- **Connect lives on the workout detail** (handoff §1), superseding
  ROADMAP's older "on Confirm targets" bullet; and **approach A's
  separate tree** supersedes ROADMAP's "live pace in the timer" phrasing
  — the handoff is the later authority; both recorded so ROADMAP's
  unticked boxes don't read as unmet exit criteria.
- **Interstitial states 1-3 are descoped** (below) — a transport-reality
  supersession of the handoff, not a taste call.

## Decisions

| Question | Decision |
|---|---|
| Scope | One spec, staged plan. |
| Architecture | **Approach A: separate ConnectedSession tree.** The phone timer's LOGIC untouched; extraction changes prop shapes (see §1 — the "suites unchanged" claim was wrong and is withdrawn). |
| Pre-program warning | **None — just program** (unchanged). |
| Scanning UX (C2) | **The OS picker IS the scan UI on both platforms.** `requestDevice` (web and Capacitor alike) opens a modal, single-result, no-RSSI chooser; the app never sees a device list. Interstitial states 1 (scanning), 2 (still-looking hint) and 3 (multiple monitors) are NOT BUILT; `phase` has no `"choosing"`; a dismissed picker is the new `scan-dismissed` error (rendered on the state-6 skeleton with retry). State 3 would need a real background-scan seam (`Transport.scan()` variant + `DiscoveredMonitor.rssi`) — a named follow-on, not a screen.<br><br>&nbsp;&nbsp;SUPERSEDED IN PART (phone-BLE, 2026-08-10): the OS-picker premise holds on web only; on iOS the plugin draws an in-process list sheet, `picking` renders a backdrop, and the timeout/permission paths are typed — see `2026-08-10-phone-ble-design.md` §3/§5. |
| Reconnect (C5) | **Descoped to a named follow-on. 7B ships lose-and-degrade, per ROADMAP's own text** ("disconnect mid-workout degrades silently to manual"). Reality: NO transport has reconnect logic today (the driver only observes resumption); web CANNOT reconnect without re-opening the modal picker mid-piece (id-keyed reconnect doesn't exist in Web Bluetooth), and the driver's one-shot subscriptions hold dead characteristic handles after a drop. The handoff's reconnect banner/sign-of-life/CAUGHT-UP/MISSED-rows all move to the follow-on (Capacitor id-keyed reconnect + driver re-subscribe — itemized in ROADMAP by this phase). What 7B shows on disconnect: the sunken banner (`LOST THE MONITOR` + "The erg is still counting. Row on — End keeps what we saw."), every actual greyed/`LAST`, End always live, the run closeable and loggable. The fake's `completeReconnect` replay stays as the DRIVER-test oracle for the follow-on; the spec records that its latest-boundary replay models an unobserved mechanism (open question for the follow-on's hardware row). |
| P3b (failed program, run open) | **Close the RECORD unconditionally — because of `sendPrepare`, not structure-mismatch.** `program()`'s first act is always a Terminate (unconditional, driver's own doc); by the time ANY typed rejection surfaces, the previously-loaded workout is already torn down — no reason exists for which keeping the run open is safe. The hook stamps `completedAt` (the record close; `recordActual`'s guard then refuses appends). The DRIVER's `activeRun` cannot be closed from outside (no API) — the hook therefore IGNORES `workoutComplete`/`terminated` events arriving for a run it already closed (pinned by test). On `reason === "disconnected"` no terminate is attempted (the link is gone); the record still closes. |
| Double-program (I6) | **`ProgramBusyError`, a distinct error class thrown BEFORE the lifecycle starts** — NOT a `ProgramRejectionReason` member (that union describes machine statements; `busy` in it would render "PM5 rejected"-class copy for something the PM5 never saw). `"busy"` joins the UI-layer error union beside `bluetooth-off`/`transport-missing`. The interstitial's double-fire protection is DESIGNED, not asserted: the hook flips `phase` to `"programming"` synchronously before awaiting `program()`, and state 6's Try-again is inert while phase ≠ "failed" — both pinned by test. |
| Tolerance (C3) | **`judgeActual` is NEW domain code with a FIXED house tolerance** — `toleranceRange()` was deleted (DEVIATIONS row 53) and `pace_tolerance_seconds` never reached the client type (row 54, Phase-9 backlog). 7B ships `PACE_TOLERANCE_SECONDS = 2` and `SPM_TOLERANCE = 2` as named domain constants (`domain/judge.ts`), recorded in DEVIATIONS with the Phase-9 pointer (the preference chain restores there, not here). Teal under / ink within / ochre over; stale overrides all three. |
| Log prefill | 7C's (unchanged). |
| Q1 projected split | Not exposed; not built (unchanged). |
| Q2 replay / MISSED rows | **Moves to the reconnect follow-on wholesale** — with no reconnect in 7B there is no missed-interval state to render. The follow-on inherits the adversary's computation notes: the gap predicate (program indices below the current frame's `intervalIndex` with no recorded actual) is NOT sufficient (orphaned-half discards produce the same signature with the link up), must be gated on an actual disconnect/reconnect pair, and must define `null`-index behaviour. |
| Q3 rate chip | Reads OUR program (unchanged). |
| Interstitial state 5's counter (I7) | **Dropped.** No progress source exists (`MonitorEventLog` has no subscribe; sends chunk into FRAMES, not intervals — a counter would honestly read "frame 4 of 7"). The three-marker checklist carries progress, which is what the handoff built it for. The `WHAT THE MONITOR IS GETTING` panel stays (static, from our program). |
| Device name (I5) | **Threading `DiscoveredMonitor.name` → `createPm5Driver` is an explicit 7B task** (ROADMAP obligation). Until it lands every handoff string showing `PM5 430123456` would render the literal placeholder `PM5`; the spec makes it land FIRST so no screen ever ships the placeholder. |

## Design

### 1. Architecture — the ConnectedSession tree

Route `/connected` (entered only via Connect; deep-links fall back to
the detail). Units as approved: **`useMonitorSession`** (hook — driver
lifecycle, transport selection, `MonitorRun` persistence including the
FIRST real `recordActual` caller and the `completedAt` writer,
teardown); **`ConnectedInterstitial`**; **`ConnectedSurface`**.

**Extraction, honestly stated (I3):** the segment bar and `UP NEXT`
strip are inline JSX reading `SessionRun`/`EnginePhase` today —
extraction gives them NEUTRAL VALUE PROPS, so the phone timer's UNIT
tests change signature while its e2e/DOM assertions survive; the
quarter-ruler (`TimerRuler`) is already a numeric-prop component and
needs NO extraction; the metric card (`TimerTargets`) hardcodes accent
and takes `EnginePhase` — the connected panes need ink targets + a
third static line + judged actuals, so it becomes a variant-prop
component (its unit test changes; the phone timer's rendering does
not). Exit criterion phrased accordingly: **the phone timer's e2e and
design suites pass unchanged; its unit tests change only
signatures/imports; its DOM and behaviour do not change.**

### 2. The session state machine

```
phase: "idle" | "picking"                       // the OS chooser is open
     | "pairing" | "programming" | "ready"      // interstitial 4,5,7
     | "failed"                                 // interstitial 6
     | "live" | "paused" | "disconnected"
     | "ended"
error: null | { reason: ProgramRejectionReason  // machine statements
              | "busy" | "bluetooth-off"        // ours
              | "transport-missing" | "scan-dismissed";
                detail: string; raw?: string }
```

Mappings that are law:

- **Every phase transition maps to a real event or frame field** (I4):
  `armed` event → `ready`; first rowing frame → `live`;
  **`workoutComplete` → `ended` (terminated: false)** and
  **`terminated` → `ended` (terminated: true)** — the rower finishing
  the piece or ending it on the PM5's own menu are ordinary paths, not
  edge cases, and both close the run and route to the post-session
  flow. `endSession()` is idempotent against a terminal event racing it
  (pinned by test).
- State 6 renders every typed rejection incl. `structure-mismatch`'s
  observed-vs-expected triple in the DETAIL panel; Try again re-runs
  `program()` (safe by fix-3), inert unless phase === "failed".
- **`paused` (C1, redefined from the record):** all four rowing
  metrics — `elapsedSeconds`, `distanceMeters`, `currentSplit`, `spm` —
  **unchanged together across 4 consecutive frames** while
  `state === "rowing"`. NOT `spm === 0` (the record shows spm PINNED at
  its last value — 16 — for a stopped rower, and ZEROED for ~5s after
  every no-rest boundary reset; the old predicate fired at every
  changeover and never for a real stop). Exit on ANY change (not
  "advance" — elapsed ticks backwards by up to −0.57s in the record,
  M2). The 4-frame hold clears the boundary-reset window at the
  observed ~2Hz cadence. **Caveats carried in code:** the signature was
  observed on a structurally-empty arm only; `types.ts`'s own comment
  says a real program's clock may never freeze — whether PAUSED ever
  renders on a properly-armed workout is a **§17 runsheet row** (stop
  rowing mid-interval on a real program; read whether the four freeze),
  and the derivation ships behind that honest uncertainty. Also noted:
  the driver requests 100ms sampling but the record shows ~500ms
  delivered (M1, swallowed write) — the hold is defined in FRAMES, not
  seconds, and the runsheet row also reads the true cadence.
- `disconnected` (C5): the lose-and-degrade treatment; no retry
  machinery; recovery is End → log, or leave and re-Connect fresh.
- `ended`: staged End → `terminate()` (with its settle) unless the
  terminal event already fired or the link is gone → `completedAt`
  stamped → existing post-session flow, no prefill.
- **Cancel's machine semantics per state (M3):** before `programming`,
  Cancel is free (nothing sent). From `programming`/`ready`, Cancel
  terminates what we armed (best-effort, ignored on failure), closes
  nothing (no run is open yet — the run opens at `live`), and the
  handoff's "nothing lost" is amended in DEVIATIONS: nothing OF OURS is
  lost; the erg is left terminated, not armed with an orphan.

### 3. Connect, guards, and coexistence (C4 — the F5 walk, closed)

- Connect placement/states per the handoff; shown only with a transport
  present + `canProgram`; Bluetooth-off dashed treatment.
- **The Connect guard reads records DIRECTLY (the Today.tsx pattern) —
  NOT `anyLiveSession()`.** The action behind it (`createMonitorRun`)
  unconditionally clears the `SessionRun`, so Connect over a
  finished-but-unlogged phone session is the F5 data-loss shape
  exactly: it stages the same confirm Start uses ("You have an unlogged
  session — connecting discards it."). Live-vs-not is NOT sufficient
  here; the ROADMAP M-1 question ("does this care about unlogged
  specifically?") is answered YES for Connect.
- **The reverse cross-clear ships GUARDED, and WorkoutDetail's F5 guard
  is EXTENDED in the same commit:** `buildRun`/`saveRun` clears a live
  `MonitorRun` only through the same staged-confirm path — `handleStart`
  reads `loadMonitorRun()` alongside `loadRun()`, and a
  finished-but-unlogged MonitorRun (7C's entire prefill input) gets the
  Replace warning before destruction. ROADMAP's "two exceptions
  untouched" is amended: the WorkoutDetail exception guard is
  deliberately WIDENED (same pattern, second record read), not
  rerouted; Today's cold-start guard is untouched.
- Both cross-clears remain unconditional ONLY behind their confirms;
  no silent destruction path exists in either direction (pinned by
  tests in both orders: unlogged SessionRun × Connect; unlogged
  MonitorRun × Start).

### 4. Live data rules

- `judgeActual(actual, target)` in `domain/judge.ts` with the house
  tolerance constants (C3); teal/ink/ochre; stale (disconnected)
  overrides to `--ink-3`; one helper, no per-pane judgement; grid
  actuals only (programmed values never tinted).
- Machine numbers render as received; targets and session context come
  from the phone's own program data; nothing re-derived from bytes.
- HR: dash idiom per the handoff; null renders `—` always (the
  both-sentinels rule).
- Distance intervals: countdown dimension + accent per the handoff;
  `intervalRemaining` displayed, not computed.
- Device name: threaded from the picker result (Decisions/I5) before
  any screen renders it.

### 5. Observability

The diagnostics sheet (triple-tap a pager target) renders
`exportLog()` verbatim + `COPY LOG`. A window, not a source. (The
event log has no subscribe and doesn't get one — the sheet reads on
open.)

## Testing

House bar unchanged (failing-first; fake-driven end-to-end; the empty
arm surfacing as state 6 with structure-mismatch copy). Adversary-fed
additions: the paused predicate against BOTH recorded shapes (the
no-rest boundary reset must NOT fire it — the old predicate's false
positive is the regression test; the four-frozen stop must fire it) and
against backwards-elapsed ticks; the double-fire pin (phase flips
before await; Try-again inert off-"failed"); P3b's
ignore-terminal-after-close pin; ended-by-machine (workoutComplete and
terminated both reach `ended` without End); both F5 pins (both orders);
extraction: phone-timer e2e/design suites byte-identical, unit-test
signature changes enumerated in the task report. e2e: the connected
surface's own spec at 390×844 AND 844×390 (`setViewportSize` — the
harness already does 844×420; 390 height is NEW assertion territory,
named as such, pane C's five-row scroll + 56px rail asserted at exactly
that height). **The fake stays out of the shipped bundle:** the test
transport injection seam is gated on `import.meta.env.DEV` +
code-splitting (the prod build must not contain fake.ts — asserted by
the existing dist-grep gate, extended to `fake`).

## Out of scope

Auto-reconnect + MISSED rows + interstitial states 1-3 + background
scan/RSSI (the named follow-on, itemized in ROADMAP by this phase); log
prefill (7C); projected split; pull-path GETs; `CSAFE_PM_GET_HRM`;
phone-timer logic changes; the tolerance preference chain (Phase 9).

## Exit criteria

- Connect → picker → program → ready → row all three panes → machine-
  or button-ended → logged: fake-driven in CI end to end, and on the
  erg in this phase's James-operated row (runsheet to §17: a real
  library workout, ≥2 intervals, a mid-piece stop long enough to read
  the paused answer, phone-lock/unlock, end from the MACHINE side once
  and the app side once across two runs; HR present; disagreement is a
  finding).
- Every failure path is typed and rendered; no untyped path; nothing
  spins; no screen ever shows the `PM5` placeholder device name.
- The F5 pins hold in both directions; Today's guard untouched.
- The phone timer: e2e/design suites unchanged; DOM/behaviour
  unchanged; unit-test changes enumerated.
- DEVIATIONS carries: the handoff's rows 0-6, the states-1-3 descope,
  the reconnect descope, Cancel's amended "nothing lost", the tolerance
  constants, and the two ROADMAP supersessions.
- Green + the row + James's explicit approval.
