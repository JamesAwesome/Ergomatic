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

**Item 1 — the fake pause becomes an instruction, state now, styling in
spec 3** (PM design gate: spec 3 replaces this footer wholesale, so a
bespoke banner would be styled twice and re-pin every e2e/screenshot
twice). What 2a builds is the STATE: the noun is deleted — the block reads
**`PULL TO RESUME`** alone; the block is repositioned/shrunk only as far as
needed to stop occluding TOTAL LEFT and the bar (the two witnesses that
show the clock draining), keeping the current visual vocabulary otherwise;
suppressed during genuine rest intervals — a resting rower is *supposed*
to be stopped. The paused **rate** hero gains the suppression the split
already has (review Cluster A). `paused` leaves `ConnectedPhase`; the
freeze predicate is kept (it is correct) and feeds `activity`.
**Kept, explicitly:** the block's END/AGAIN button (connected-revamp
Task 6's "ending without reaching for the header") — deleting it is a
product decision that belongs to spec 3's design, not this cleanup.

**F6 — a reload offers a choice, not an assertion — built as a twin of a
surface the house already designed** (PM design gate: the does-it-exist
question applies to SURFACES too). `Today.tsx:480`'s `UnloggedRow` already
renders exactly this transaction for a `SessionRun` — "{title}: unlogged
session." + a "Log it" link + a staged ✕ Discard on `useStagedDiscard`
(two-tap arm, copy approved, focus behaviour already fixed by review). F6
is a `MonitorRun`-shaped twin of that row on Today, not a new prompt, new
route, or new idiom. Requirements preserved from spec 1's gate:

1. *No state asserted on the machine's behalf:* the row describes the
   evidence ("interrupted connected session"), never claims the workout
   ended; the rower rules via Log-it / Discard.
2. *The door:* investigate first whether stamping `completedAt` at the
   rower's choice makes `monitorModeRun`'s existing `completedAt !== null`
   gate suffice — if it does, NO new route entry exists at all. The record
   gains an additive `endedBy: "interrupted"` field; the stored-shape read
   path is stated explicitly (a v1/v2 record with no field reads as a
   normal completion, per `loadMonitorRun`'s never-migrate discipline).
3. *An honest duration, LABELED:* totals come from the **recorded actuals**
   (exact, boundary-measured), never wall-clock. Recorded actuals carry NO
   rest time, so an interrupted session's duration is work-only and reads
   low — a stored number with a deliberate error direction. Resolution is
   James's call (open question 2): work-only labeled as such, or
   work + programmed-rest-for-completed-intervals (the allowance
   `logSummaryTotals` already computes).

Adoption (resuming a live session after reload) stays **out** — reconnect's
spec, R10, unchanged.

**The lifecycle family — one terminal path.** A single close routine that
every ending routes through (natural finish, terminate, END, transport drop,
reload-discard), replacing today's per-path improvisations:

- **Suspicion before a mid-session close — a SYNCHRONOUS predicate, never a
  timer** (REWRITTEN at the PM design gate, which falsified the first
  draft's window against the committed record: 3 of 4 `finished` episodes
  in `pm5-session4b` arrive out of `resting` — a trailing rest on the last
  interval is the NORMAL ending for 161 of the 300 seeded workouts (§15
  #9) — and 3 of 4 are a SINGLE frame, so "a second terminal tick
  confirms" fails most honest finishes; a `rowing`-tick cancel would refuse
  genuinely terminated runs, because terminate AUTO-REARMS).

  The corrected rule, over evidence already in hand at the terminal tick,
  scoped to `finished` only (never `terminated`):

  - A `finished` is **unsuspicious** — closes exactly as today — when a
    0x0039 has already arrived for this run, OR the recorded actuals /
    register count reconcile with the programmed interval count (a
    `finished` at 3-of-3 is normal; the legitimate early stops are
    `terminated` and END, not `finished`).
  - A **suspicious** `finished` (mid-program, no summary, counts short —
    the afternoon killer's exact shape: interval 1 of 2, 0 actuals, no
    0x0039) is logged loudly (`suspicious-terminal`, with the raw bytes
    `terminal-raw` already captures) and **still closes, fail-open**, today:
    the gate itself ships only when a second occurrence carries bytes, per
    the briefing's rule that an unobserved wire premise never ships as a
    hard gate. The convicting log is the deliverable; the block is not.
  - **Window-coupling constraint, named:** `finishGraceUntil` and
    `armSummaryReconcile` are armed at the terminal tick BEFORE the
    `workoutComplete` emit, and that ordering is what makes "the fill
    happens before navigation" a fact about the code (driver's own
    comment; both re-walk rings depended on the grace catching their final
    boundary). Nothing this spec adds may reorder that arming or delay the
    emit relative to it.
- **`final-totals` on every close**, including END: the terminal entry
  writes before teardown, so no ending loses its finals again.
- **The disconnect() twin, fixed with ordering**: teardown runs the
  still-reachable reconcile *before* unsubscribing the listener — the
  who's-listening design the reviewer's asymmetry analysis demands. The F7
  rule (cancel the wait, not the verdict) then applies uniformly.

### 3. METERS LEFT (the mixed-program countdown)

**The observation is solid; the mechanism is OPEN** (PM design gate caught
the first draft prescribing a fix for a mechanism nobody verified —
`computeRemainingForFrame` holds no reference state at all; it subtracts
0x0033's `lastSplitDistanceMeters`/`lastSplitTimeSeconds` from 0x0031's
per-interval pair, so there is nothing in it to "rebase"). The hardware
signature stands: 578 = 500 − (102.7 − 181.2), from the committed session-A
ring, and interface-notes §17 item 17's surviving assumption ("deliberately
still read against the raw per-interval pair") is the falsified sentence.
Two candidate mechanisms with DIFFERENT fixes: 0x0033's Last Split pair not
advancing across a goal-dimension change, or a per-interval-vs-cumulative
unit mismatch in one of the two operands. **The antagonist's premise pass
adjudicates the mechanism against the ring data before this enters a plan**;
the failing test (signature reproduces, then 397.3) is fixed either way, the
fix is not.

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

- **Fixtures PARAMETERISED BY the walk rings' hardware numbers** — not
  replays; the rings are the driver's own state-change-only testimony (53
  and 45 entries), not wire bytes, and `captureReplay.test.ts`'s header
  says at length why they cannot drive `createPm5Driver`. Spec 1's
  discipline: the ring supplies the shapes and the numbers, hand-built
  payloads supply the wire. The evening re-walk rings are now COMMITTED
  (`session-c`/`session-d`) so every cited number has data behind it.
- **The keystone re-run** (PM gate — the canary transfers into the phase):
  because this spec touches the terminal path where `final-totals` is
  written and the register map last read, the phase walk re-runs spec 1's
  oracle row (2×250 m r0, a-priori 500) alongside spec 2's own items.
- **The fake learns**: armed carry-over (nonzero spm/split on re-arm) and the
  corroboration shapes (lone terminal tick, terminal+0x0039, terminal then
  rowing). A fix verified against a fake that cannot exhibit the bug proves
  nothing — spec 1's lesson, now standing.
- **e2e + screenshots run and are EXPECTED to change**: the banner and the
  armed surface are visible. Captures are re-shot deliberately, with real
  data, and looked at (recurring failures #1 and #7).
- **Per-file coverage per touched file**; consequences, never existence.
- **Spec 2's own walk list** (rides the phase's next erg session): (a)
  CONFIRMATION row, not a question — the hardware answer is already on
  record (PM5 shows 0 pre-pull): does OUR screen now match it, photographed
  together; (b) a deliberate 10 s mid-rest stop: the instruction banner
  appears, TOTAL LEFT stays visible and draining, and any session-killer
  recurrence convicts itself via `terminal-raw` + `suspicious-terminal`;
  (c) an END mid-session: the ring carries `final-totals`; (d) the keystone
  re-run (2×250 r0 → 500 exactly, above).

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

## Questions the PM gate closed

1. **The corroboration window** — replaced wholesale by the synchronous
   predicate + fail-open convict-log above; the window design was falsified
   against the committed record (majority-path firing, absent corroborator,
   unsafe cancel).
2. **F6's surface** — `UnloggedRow` twin, house idiom, copy question
   dissolved into an existing approved pattern.

## Open questions (James)

1. **PR structure and the reducer** — the PM recommends landing this as 2a
   (axes + display + driver lifecycle + METERS LEFT) then 2b (F6, the only
   piece with a persisted-shape field and a destructive action), and CUTTING
   the reducer to its own later spec (nothing in 2a/2b requires it, and
   "introduced beside the hook with no consumer" is the unconsumed-helper
   trap). This reverses part of James's approach pick; his call.
2. **F6's interrupted-session duration** — work-only labeled as such, or
   work + programmed rest for completed intervals. A number the rower keeps.
3. **Discard's consequence** — proposed: discards the record, keeps the
   diagnostics stash (it is the tab's own sessionStorage and dies with the
   tab anyway).
