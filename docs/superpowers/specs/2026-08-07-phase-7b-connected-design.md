# Phase 7B — the PM5 connected surface

**Date:** 2026-08-07
**Status:** Approved (James, 2026-08-07: one spec + staged plan; approach
A — a separate ConnectedSession tree; just-program with no pre-warning;
the handoff committed before anything reads it)

## Why this exists

7A built the monitor domain; three fix phases made it match the machine
and made its verification trustworthy (`program()` either arms the real
workout or rejects typed — hardware-proven in both directions, §18
session 4b). 7B is the screens that domain was built to sit underneath:
Connect on the workout detail, the interstitial, the three-pane
connected surface, and a session that ends cleanly into the existing
log flow.

**Visual authority:** the committed design handoff
`docs/design/handoffs/2026-08-05-connected-mode/` (README + mockup).
Sizes, colours, states, and copy are the handoff's; this spec does not
restate them — it binds the handoff to the shipped domain, records
where the two meet, and settles what the handoff left open. The
standing law (five button levels, one level-1 per screen, accent's four
meanings, ≥44px, no mono label lighter than `--ink-3`) applies
throughout.

**One supersession, stated up front:** the handoff carries an internal
contradiction on target colour — §3 rules "the target is ink in
connected mode", while its pane-B hero line and reconnect section still
say "accent". The delegated ruling from the original exchange (recorded
pre-7A: **targets are INK everywhere on the connected panes**, handoff
DEVIATIONS row 0) governs. Accent's only jobs on this surface: the
active interval's countdown cell (pane C) and the level-1 buttons the
handoff names.

## Decisions

| Question | Decision |
|---|---|
| Scope | One spec, staged plan. Stage boundaries in the plan, not here. |
| Architecture | **Approach A: a separate ConnectedSession screen tree.** Own route, own state hook; the shipped phone timer is untouched except for presentational extraction. |
| Pre-program warning | **None — just program.** Replace-on-program is the machine's own semantics (§19.1 Verdict (b)), fix-3 made it reliable in every dispatch state, and the rower chose the workout in our app. The residual `:00` class is a TYPED failure now (`structure-mismatch`), surfaced as the interstitial's failure state, not a pre-warning. |
| P3b (failed program, run open) | **Close the run, degrade to manual.** A `structure-mismatch` means the machine verifiably holds something other than what the open run was scoring; keeping it open scores a phantom. The close is visible (`run-replaced`-style trace + the interstitial failure screen); the SessionRun path (phone timer) is untouched. |
| Double-program stranding | **Typed `busy` rejection at the driver + UI serialization.** `program()` while a `program()` is in flight rejects `ProgramRejection{reason:"busy"}` immediately (no queue, no stacking — the pre-existing single-flight class from Task 2's review, closed at the seam). The UI never issues one anyway: the interstitial owns the whole window. |
| Log prefill | **7C's, not ours.** 7B ends a session into the existing log flow with no prefill. The handoff's §6 (prefilled actuals, HELD/UNDER/OVER preselection) is 7C's spec-in-waiting; nothing in 7B may partially implement it. |
| Handoff open Q1 (projected finish split) | **Not exposed; not built.** The wire carries no per-interval projected finish and the seam philosophy ("never re-derive one we can read" — and never invent one we can't) forbids synthesizing it. Pane B ships without the strip, as the handoff allows. |
| Handoff open Q2 (reconnect replay) | **No replay exists.** Boundary notifications fire once; the monitor does not re-send missed 0x0037/38 pairs (no such mechanism observed in four sessions or documented anywhere). Intervals completed while disconnected get the **`— · MISSED` row treatment**: completed-row geometry, `—` in every actual cell, dashed bottom border (the "nothing here yet" idiom carrying "we weren't listening"), one grid-level mono caption `ROWS 4–5 MISSED WHILE RECONNECTING`. Recorded as our own addition in DEVIATIONS (design offered to draw it; the dash idiom is established enough not to round-trip). |
| Handoff open Q3 (rate cap on distance intervals) | **The chip reads OUR program.** Prescribed SPM comes from the `WorkoutProgram` the phone holds; no machine echo involved. Ships unconditionally. |

## Design

### 1. Architecture — the ConnectedSession tree

New route `/connected` (entered only via Connect's flow; deep-linking
falls back to the workout detail). Three units:

- **`useMonitorSession`** (new hook, `src/monitor/`): owns the driver
  lifecycle end to end — transport selection (`webBluetooth` on web,
  `capacitorBle` on iOS), scan/connect, `program()`, the event
  subscription, `MonitorRun` persistence via the existing
  `createMonitorRun`/`recordActual` (7B ships `recordActual`'s first
  real caller and the completion writer `monitorRun.ts`'s guard has
  been waiting for), and teardown. Exposes a single state object
  (below) + imperative `{connect, program, endSession, cancel}`. No
  component talks to the driver directly.
- **`ConnectedInterstitial`** (screen): the handoff's seven states,
  driven by `useMonitorSession.phase`. Full-screen, Countdown geometry,
  checklist idiom, no spinner anywhere.
- **`ConnectedSurface`** (screen): the three panes + pager rail +
  mid-session states. Swipe (60px threshold) is primary; the labelled
  rail is fallback. Pane persistence: last-used pane per ROWER
  (localStorage key, not per workout), landing on B for the first-ever
  connected session.

Shared presentational pieces are EXTRACTED from the shipped timer, not
duplicated: the interval segment bar, `UP NEXT` strip, the quarter-ruler
/ total-left bar, and the metric card. Extraction is behaviour-free
(same DOM, same tokens; the phone timer's own e2e/design suites must
not change except import paths). The phone timer's logic is not
touched.

### 2. The session state machine (what the hook exposes)

```
phase: "idle" | "scanning" | "choosing"        // >1 device found
     | "pairing" | "programming" | "ready"     // interstitial states 4,5,7
     | "live" | "paused" | "reconnecting"
     | "ended"                                 // terminal: run closed
error: null | { reason: ProgramRejectionReason | "bluetooth-off"
              | "transport-missing"; detail: string; raw?: string }
```

Mappings that are law:

- Interstitial state 6 ("the monitor wouldn't take it") renders `error`
  for every typed rejection: `nak` / `bad` / `not-ready` / `garbled` /
  `timeout` / `not-observed` / **`structure-mismatch`** (rendered in the
  handoff's copy; the DETAIL panel shows the reason + the rejection
  detail verbatim — `structure-mismatch`'s observed-vs-expected triple
  is exactly what that panel exists for). "Try again" re-runs
  `program()` — safe by fix-3 (the settle + readback make retry
  idempotent-or-typed). The reassurance line is now LITERALLY TRUE (the
  workout and nudges live in our app; nothing of ours is on the
  machine).
- **`paused` is a derivation, defined here because the wire has none**
  (7A seam decision): `state === "rowing"` AND `spm === 0` AND
  `elapsedSeconds` unchanged across **2 consecutive frames** — the
  exact signature session 3's trace shows for a stopped rower (elapsed
  frozen at 57.78, spm 0). Exit on any frame advancing elapsed. The
  derivation lives in the hook, not the panes; §18 s3 cited at the
  definition.
- `reconnecting` maps the driver's `disconnected`→(transport retry)→
  `reconnected` window; every actual greys per the handoff, targets
  stay INK (the supersession), `NOW` labels become `LAST`. On
  `reconnected`, the banner runs 3s; intervals whose boundaries fired
  while disconnected are MISSED rows (open Q2's answer).
- `ended`: the staged End confirms per house idiom, `endSession()`
  terminates the machine (fix-3's `terminate()` with its settle),
  closes the `MonitorRun` (sets `completedAt` — the completion writer),
  and lands on the existing post-session flow (log later / log now —
  UNCHANGED screens; no prefill).

### 3. Connect's placement, guards, and coexistence

- Connect sits second in the detail stack per the handoff, shown only
  when a transport is available (`canProgram` capability + platform
  transport present); Bluetooth-off gets the dashed treatment and opens
  the OS prompt.
- **Guard wiring follows ROADMAP's M-1 text verbatim:** guards needing
  only "is anything live" migrate to `anyLiveSession()`; the two named
  exceptions (WorkoutDetail's unlogged-run staged confirm; Today's
  cold-start stale-draft discard) keep reading records directly. The
  NEW guard this phase adds — Connect disabled/redirected when a
  session is already live on either side — uses `anyLiveSession()` (it
  needs live-vs-not only). The M-1 comment block is quoted at the new
  guard.
- **The cross-clear obligation ships:** `buildRun`/`saveRun`
  (`session/run.ts`) clears an existing live `MonitorRun` exactly as
  `createMonitorRun` already clears a `SessionRun` — the documented 7B
  half of 7A's coexistence contract, with the same test shape.
- Disconnect mid-workout degrades silently to manual per ROADMAP: the
  surface keeps rendering from the last state + MISSED semantics; End
  always works; a rower can walk away with a loggable session no matter
  what the radio did.

### 4. Live data rules

- One helper — `judgeActual(actual, target, tolerance)` reusing
  `toleranceRange()` — owns the teal/ink/ochre decision for every
  actual on every pane. No pane implements its own judgement (the
  handoff's pane-agnostic rule). Stale (reconnecting) overrides all
  three to `--ink-3`.
- The machine's numbers render as received (`MonitorFrame` fields);
  the phone contributes targets (from the confirmed workout's own
  data — the same source the phone timer uses) and session-position
  context. Nothing is re-derived from raw bytes on the screens; the
  driver's normalization (minus-1 actuals, run scoping) arrives
  finished.
- HR: the no-monitor treatment per the handoff (dash idiom, `—`,
  `NO HR MONITOR`); a null mid-session with a source paired is just
  rendered as `—` (the both-sentinels-to-null rule means null is
  "no reading", never 0).
- Distance intervals: countdown dimension + accent per the handoff's
  grid rules; `intervalRemaining` comes from the driver
  (`{kind, value}`) and is displayed, not computed.

### 5. Observability on the surface

The diagnostics sheet (triple-tap a pager target) renders the driver's
event log verbatim: session-relative seq, kind, detail — the same
entries the erg sessions taught us to read (`structure`,
`prepare-settled`, `boundary-*`, `structure-mismatch`). `COPY LOG`
copies the `exportLog()` JSON. Nothing new is logged for the sheet; it
is a window, not a source.

## Testing

House bar: every behaviour a failing-first test; the fake drives the
end-to-end paths (it models the machine we met — including the empty
arm, which must surface as interstitial state 6 with the
structure-mismatch copy, fake-driven). Key shapes: the seven
interstitial states from driver events (fake-driven state walk); the
paused derivation (frozen-elapsed frames → paused; advancing frame →
live — the session-3 signature as the fixture); MISSED rows on
reconnect-with-missed-boundaries; the judge helper's three states +
stale override; guard wiring (the M-1 pattern test per ROADMAP, both
exception guards untouched — pinned); cross-clear both directions;
`busy` rejection (driver test + the interstitial never double-fires);
P3b (failed program closes the run — fake-driven, typed); extraction
inertness (the phone timer's design/e2e suites pass unchanged). e2e:
the connected surface gets its own spec file for layout/pager/labels
(fake-driven via a test transport injection seam — the lab pattern),
target: portrait + landscape (844×390) both asserted.

## Out of scope

Log prefill and `actualSource: "pm5"` (7C, the handoff's §6 preserved
for it); projected finish split (no wire source); reconnect replay
(none exists); the pull-path GETs; `CSAFE_PM_GET_HRM`; any phone-timer
logic change; Apple Health / auth follow-ons (platform-direction
triggers).

## Exit criteria

- A rower connects, programs, rows all three panes, survives a
  disconnect, ends, and logs — on the fake in CI end to end, and on
  the real erg in this phase's James-operated verification row
  (runsheet to §17: connect → program a real library workout → row ≥2
  intervals with a mid-piece phone-lock/unlock → end → log; HR present;
  a disagreement is a finding).
- The interstitial renders every typed rejection; no untyped failure
  path exists; nothing spins.
- The phone timer's suites pass unchanged save import paths.
- Guards: the new one on `anyLiveSession()`, the two exceptions
  untouched and pinned; cross-clear ships both directions.
- The handoff's DEVIATIONS rows 0-6 + our MISSED-rows addition are in
  `docs/design/DEVIATIONS.md`; the supersession (targets INK) recorded.
- Green + the row + James's explicit approval.
