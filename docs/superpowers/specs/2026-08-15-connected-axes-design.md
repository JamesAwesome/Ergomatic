# Connected state axes — Phase CR2, spec 2 of 3

**Status:** design approved by James 2026-08-15 (evening, same day spec 1
merged). PM design-gate verdict pending fold-in; antagonist pass owed before a
plan is written.
**Branch:** `cr2-axes`, worktree `.claude/worktrees/cr2-axes`, base `7c2be9f`
(main, containing spec 1).

## Why this exists

`ConnectedPhase` is one enum carrying four orthogonal concerns — the link, the
program, the session, and the rower's activity — with exactly one `switch` over
it in the whole pipeline, zero exhaustiveness guards, and its transitions
scattered across nine imperative patch sites in `useMonitorSession.ts`
(architecture review §F3, all PROVEN by grep). That shape is not one bug; it is
the *mechanism* behind a family of them: an unenumerated phase falls through
the interstitial's ladder, hits `surfaceStatusFor`'s `default: null`, and is
laundered by `?? "live"` into a full live surface. `ready` was merely the first
member to take that path — the red 0, the NOW labels, the gold counting mark
and the full TOTAL LEFT bar are its symptoms (CR2 item 3), and the fake PAUSED
state (CR2 item 1) is the enum asserting a machine state that does not exist.

Spec 1 fixed the numbers. This spec fixes the states — and inherits the
evidence dowry spec 1's hardware walks produced.

## Rulings this spec is built on (James, 2026-08-15)

1. **Release:** when the whole phase is done (specs 2+3), not per-spec, absent
   something critical. Testers are active weekdays.
2. **Scope:** CORE (axes + item 3 + item 1 + F6 + the END/disconnect lifecycle
   family) **plus** session-killer corroboration **plus** the METERS LEFT
   mixed-program fix. **Deferred to named follow-ups:** the R4/R5 cluster (spm
   sentinel at the parse seam, `MONITOR_SPM_MIN` persisted rows, the liveness
   watchdog) and log-screen total meters (→ spec 3, where the log screen's
   words already change).
3. **The pause word: there is no word.** The stopped-mid-interval treatment is
   an instruction-only banner — `PULL TO RESUME` — that occludes nothing. No
   noun means no claim about machine state that can be wrong. The code axis is
   named as a plain observation.
4. **Migration:** the review's R11 path — derive the axes *from* the existing
   enum as pure functions with zero behaviour change, migrate consumers one at
   a time, absorb the hook's patch sites into a reducer, delete the enum last.
5. **Item 3's hardware answer (from the walk):** the PM5's own screen shows
   **0** for stroke rate before the first pull of piece two, though the wire
   carries the previous piece's value. **Mirror the machine: show 0, judge
   nothing.** Exactly design frame 2D.

## The evidence dowry (all committed, all cited)

From `docs/monitor/sessions/walk-2026-08-15/` and PR #99's record:

- **The mid-rest session-killer** (session-1 ring, afternoon): a lone frame
  parsed as `finished`/elapsed=60/distance=0 arrived 16 s into interval 1's
  rest on a 2-interval program; the driver closed the run instantly, filed
  nothing (0 actuals), and the app abandoned the row while the erg carried on.
  One occurrence; ordinal unknown (pre-`terminal-raw`). Real finishes have
  since been observed arriving as ordinal **10** (WORKOUTEND) *and* **12**
  (WORKOUTLOGGED), bytes on record.
- **The END path never reaches a terminal**: END sends terminate and tears
  down before the machine's terminated frame arrives — no `final-totals`, no
  0x0039, ring ends at the write. Same family: **the disconnect() twin**
  (`teardown()` unsubscribes the hook's listener *before* calling
  `driver.disconnect()`, so the F7 fix pattern is UNSAFE there — a synchronous
  reconcile would emit into an empty listener set and write a
  `filled-from-summary` trace no record received; reviewer-verified asymmetry).
- **METERS LEFT is wrong on mixed programs with an exact signature**: phone
  578 vs erg 398 on a 500 m piece — 578 = 500 − (102.7 − 181.2), a stale
  interval-start reference (interval 0's final distance) inside
  `computeRemainingForFrame`, which spec 1 deliberately did not touch and
  which had never run on a time→distance program (session-A ring, committed).
- **Armed carry-over is real on the wire**: eight armed frames in the lab
  captures read 13/16/43/46/50/80/88/96 spm with matching nonzero splits. The
  fake zeroes on re-arm (`zeroedStatus`), so today's tests cannot exercise the
  interesting half of item 3 (R1's constraint: teaching the fake is part of
  this spec's cost).
- **0x0039 ordering varies**: it arrived *before* the finished frame on the
  re-walk's row 1 (beating navigation) and never arrived at all in the
  afternoon rings. Timing is not a premise anything below may rest on.

## Design

### 1. The axes, derived not invented (`connectedAxes.ts`)

A new pure module computing four facts from today's `ConnectedPhase` +
existing hook state, with **zero behaviour change on day one**:

```ts
type LinkAxis = "none" | "connecting" | "up" | "lost";
type ProgramAxis = "none" | "sending" | "armed" | "failed";
type SessionAxis = "none" | "live" | "ended";
type ActivityAxis = "stroking" | "coasting";   // observation, never a claim
```

Every derivation `switch`es exhaustively with a `never` guard. An eleventh
`ConnectedPhase` member added tomorrow fails to *compile* instead of
laundering into a live surface — F3's mechanism dies structurally.

**First consumer: `surfaceStatusFor`.** `armed` becomes a real
`SurfaceStatus`; the `?? "live"` is deleted; `buildSurfaceModel` takes a
**non-nullable** status computed by the caller. The type change forces every
call site to answer the product question instead of defaulting it (R1
verbatim). Then the interstitial's ladder, then the freeze predicate, one
reviewable step each.

### 2. The defects the migration dissolves

**Item 3 — the armed surface mirrors the machine.** At `armed`: rate shows
**0** in plain ink (the machine's own display, per the walk), split shows the
target ghost per frame 2D's convention, nothing is judged, `nowLabel` does not
say NOW, no gold counting mark, no full TOTAL LEFT bar. The fake learns the
carried-over armed reading so tests exercise the wire's actual behaviour
(13–96 spm ghosts), not `zeroedStatus`'s fiction.

**Item 1 — the fake pause becomes an instruction.** The opaque
`.connected-paused` block (52 px, occluding TOTAL LEFT and the bar — the two
witnesses that show the clock draining) becomes a **thin banner reading
`PULL TO RESUME`**, positioned to occlude nothing. Suppressed during genuine
rest intervals — a resting rower is *supposed* to be stopped, and the banner
firing there would be the old PAUSED mistake with politer words. The paused
**rate** hero gains the suppression the split hero already has
(`surfaceModel.ts`'s asymmetry, review Cluster A). `paused` leaves
`ConnectedPhase`; the freeze predicate itself is kept (it is correct) and
feeds `activity` instead.

**F6 — a reload offers a choice, not an assertion.** The PM's three
objections from spec 1's gate are the requirements:

1. *No state asserted on the machine's behalf:* a reload that finds a
   stranded `MonitorRun` shows a prompt — **"A connected session was
   interrupted. Log what was measured / Discard."** Nothing is auto-closed;
   the rower rules.
2. *A real door:* the monitor-log route gains an `interrupted` entry point
   (the `?from=monitor` gate learns a second, explicit origin), so "Log what
   was measured" lands on the log screen with the measured actuals loaded.
3. *An honest duration:* the logged record's totals come from the **recorded
   actuals** (exact, boundary-measured — the 500-not-499.5 distinction James
   probed), never `completedAt − startedAt` wall-clock. The record is marked
   interrupted (`endedBy: "interrupted"` on the existing record shape's
   additive field), not stamped as a normal completion.

Adoption (resuming a live session after reload) stays **out** — reconnect's
spec, R10, unchanged.

**The lifecycle family — one terminal path.** A single close routine that
every ending routes through (natural finish, terminate, END, transport drop,
reload-discard), replacing today's per-path improvisations:

- **Corroboration before a mid-session close.** A finished-family tick
  arriving while the session is mid-interval or mid-rest does NOT close the
  run instantly. It opens a short confirmation window: a second terminal
  tick, a 0x0039, or the machine's WAITTOBEGIN confirms the end; a
  rowing/resting tick with advancing counters cancels it as noise. The
  afternoon session-killer ring is the failing test. **Hard constraint: the
  NORMAL finish path must not regress** — a natural finish (terminal tick
  followed within the existing grace by boundary + 0x0039, as in both
  re-walk rings) must file, log finals, and release the handoff on the same
  schedule it does today; the corroboration window may only *delay* closes
  that today happen instantly-and-wrongly.
- **`final-totals` on every close**, including END: the terminal entry
  writes before teardown, so no ending loses its finals again.
- **The disconnect() twin, fixed with ordering**: teardown runs the
  still-reachable reconcile *before* unsubscribing the listener — the
  who's-listening design the reviewer's asymmetry analysis demands. The F7
  rule (cancel the wait, not the verdict) then applies uniformly.

### 3. METERS LEFT (the mixed-program countdown)

`computeRemainingForFrame`'s interval-start reference rebases when the
**distance counter resets**, not only on the elapsed edge — the premise
correction spec 1 made for the accumulator, applied to the one consumer that
kept the old assumption. Failing test first from the committed session-A ring:
the 578 = 500 − (102.7 − 181.2) signature must reproduce, then read 397.3.
Mixed time→distance programs get their first coverage anywhere in the tree.

### 4. The reducer, last (R11)

`useMonitorSession`'s nine frame/armed/terminal patch sites collapse into one
pure `reduce(state, event)` — introduced **beside** the hook and tested
against recorded transitions (walk rings + lab captures) before a single call
site moves. The five hard-won invariants each get a **named test before the
migration touches its area**: the synchronous ref mirror, the atomic
phase-plus-frame patch, the P3b pin, `cancel()`'s synchronous driver claim,
and record-identity-is-what-we-sent. The promise-shaped `connect`/`program`
transitions move last. `ConnectedPhase` is deleted in the final task, when
grep says nothing reads it.

### 5. Testing

- **The walk rings are fixtures**: the session-killer test replays the
  afternoon ring's shape; METERS LEFT replays session A's.
- **The fake learns**: armed carry-over (nonzero spm/split on re-arm) and the
  corroboration shapes (lone terminal tick, terminal+0x0039, terminal then
  rowing). A fix verified against a fake that cannot exhibit the bug proves
  nothing — spec 1's lesson, now standing.
- **e2e + screenshots run and are EXPECTED to change**: the banner and the
  armed surface are visible. Captures are re-shot deliberately, with real
  data, and looked at (recurring failures #1 and #7).
- **Per-file coverage per touched file**; consequences, never existence.
- **Spec 2's own walk list** (rides the phase's next erg session, not a gate
  per item — the phase exit still walks everything): (a) piece two, before
  pulling: the app now shows 0 unjudged — photograph beside the PM5 showing
  the same; (b) a deliberate 10 s mid-rest stop: the banner appears, TOTAL
  LEFT stays visible and draining, and no session-killer fires with
  `terminal-raw` armed to convict it if it does; (c) an END mid-session: the
  ring carries `final-totals`.

## Non-goals

- Reconnect and run adoption (R10) — next phase, gated on this spec's record
  work.
- The R4/R5 cluster — named follow-up (persisted rows + a hardware-derived
  threshold).
- Log-screen total meters — spec 3.
- Any redesign-handoff visual (type scale, gutter, segmented control) — spec 3.
- XState or any state-machine dependency — the review's own adjudication:
  adopt the ideas, not the interpreter.

## Exit criteria

1. `connectedAxes.ts` exists with exhaustive never-guarded derivations, and a
   test proves day-one derivation changes zero behaviour across every
   transition in the recorded rings.
2. `buildSurfaceModel` takes a non-nullable status; `?? "live"` is gone;
   `armed` renders the mirror surface (0 plain, target ghost, nothing judged)
   against the fake's carried-over reading, not `zeroedStatus`.
3. The banner: stopped mid-interval shows `PULL TO RESUME` occluding nothing;
   suppressed during genuine rests; paused rate hero suppresses like the
   split; screenshots re-shot and inspected.
4. The afternoon session-killer ring replays into a test that FAILS on
   today's instant close and PASSES with corroboration — and the normal
   finish path's timing is pinned unchanged (both re-walk rings replay with
   identical file/log/release behaviour).
5. F6: reload → choice prompt; "Log what was measured" lands through the
   `interrupted` door with actuals-derived totals; "Discard" cleans up;
   Connect never again asks "Replace it?" about a dead run. No wall-clock
   duration anywhere in the interrupted path.
6. END and disconnect() route through the terminal path: `final-totals` in
   the ring on every ending; the twin's reconcile-before-unsubscribe ordering
   has a test that fails under today's order.
7. METERS LEFT: 578-signature reproduces then reads 397.3; mixed-program
   coverage exists.
8. The reducer passes the five named invariant tests and every recorded
   transition; `ConnectedPhase` is deleted; grep proves it.
9. Scoped gates green: lint, typecheck, full test, e2e, screenshots
   (changed, deliberately), per-file coverage inspected.
10. The phase-exit walk covers spec 2's three walk items (armed mirror
    photographed, mid-rest stop with banner + no kill, END finals) — walked
    at the phase's next erg session per James's release ruling.

## Open questions

1. **The corroboration window's length and confirmants.** Proposed: confirm
   on (second terminal-family tick) OR (0x0039) OR (WAITTOBEGIN/REARM);
   cancel on any rowing/resting tick whose counters advance; window bounded
   by the existing finish-grace order of magnitude (~2–3 s at the observed
   ~2 Hz cadence). Needs the antagonist's attack: what does a REAL machine
   send between a true finish's terminal tick and its 0x0039 (both orderings
   are on record), and can the cancel condition misfire on rest coasting?
2. **The F6 prompt's copy and the Discard consequence** (does Discard keep
   the stash for diagnostics?). James sees the copy at PR time on
   screenshots; flagged per the PM gate's precedent that copy on new product
   surface gets his eyes.
