# Connected state axes — Phase CR2, spec 2 of 3 (PRs 2a + 2b)

**Status:** design approved by James 2026-08-15 (evening, same day spec 1
merged); PM design-gate verdict FOLDED IN (corroboration window falsified and
replaced, F6 re-scoped to an UnloggedRow twin, reducer deferred, 2a/2b split)
and its three James-level questions RULED. Antagonist pass owed before a plan
is written.
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
4. **Migration:** R11's derivation-first path — derive the axes *from* the
   existing enum as pure functions with zero behaviour change, migrate
   consumers one at a time. AMENDED at the PM gate (James's ruling): the
   reducer and the enum's deletion are DEFERRED to their own spec; see §4.
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
type ActivityAxis = "moving" | "frozen" | "unknown";
// named for what it MEASURES (the freeze predicate fired / did not / has no
// evidence) — never for what the rower is doing. "coasting" at idle, or
// during a programmed rest, would be the PAUSED mistake with new words
// (antagonist: rests reset the freeze run by construction, so a
// stroking/coasting pair would have read "stroking" at a resting rower).
```

Every derivation `switch`es exhaustively over ALL TEN members of
`ConnectedPhase` (`idle | picking | pairing | programming | ready | failed |
live | paused | disconnected | ended`) with a `never` guard. An eleventh
member fails to *compile* instead of laundering into a live surface — F3's
mechanism dies structurally.

**Three facts the derivation needs that the hook does not publish today —
2a's first real API change, named** (antagonist): the freeze state
(`freezeRef`) for `activity`; run-openness (`runRef`) for `session` (at
`disconnected` the record deliberately stays open, so phase alone cannot
say); and `error.reason` for `link` at `failed` (a ProgramRejection leaves
the transport CONNECTED, a radio failure does not). `MonitorSession` widens
by exactly those three read-only facts. **The collapse to one
`SurfaceStatus` states its precedence in code** — ended > disconnected >
(armed | mirror | live) — today implicit in early-returns; unwritten, "zero
behaviour change" is unfalsifiable.

**First consumer: `surfaceStatusFor`.** `armed` becomes a real
`SurfaceStatus`; the `?? "live"` is deleted; `buildSurfaceModel` takes a
**non-nullable** status computed by the caller (one production call site +
67 test calls, counted). The type change forces every call site to answer
the product question (R1 verbatim). Then the interstitial's ladder —
**including the fall-through the type change cannot force**: `disconnected`
is absent from the ladder today, so a link drop during `pairing`/`ready`
lands the rower on the three-pane surface with no run and no frame; the
axes close it explicitly (link=lost ∧ session=none ⇒ the interstitial's
disconnected treatment, never the surface). Then the freeze predicate. One
reviewable step each.

### 2. The defects the migration dissolves

**Item 3 — mirror the machine wherever ITS display shows 0, not only at
`armed`** (antagonist: the walk's sentence — "before the first pull of piece
TWO" — is a mid-session boundary where our phase is `live`, and three of the
four rings carry the spm ghost at exactly that frame: 25/28/25). Two cases,
one rule:

- At `armed` (pre-first-stroke of the session): the full 2D treatment — rate
  0 plain ink, split target ghost, nothing judged, no NOW, no gold mark, no
  full TOTAL LEFT bar.
- At a mid-session interval boundary before the first pull: heroes show
  0/unjudged while the wire carries the previous interval's ghost, keyed on
  the OBSERVED discriminator present in all three ring frames —
  `rowingActive === false` with the per-interval distance at/near reset (the
  same guard family the freeze predicate already uses; no unobserved byte).

The substitution lives in `buildSurfaceModel` before `pace`/`rate` are
built, so panes B and C agree by construction. **The mirror must not survive
a progressing wire reading** — any frame with advancing distance ends it
(`?? "live"` is today the accidental mitigation for a stuck ready-gate; the
mirror must not become a lie at a rower who is actually rowing). The
diagnostics sheet reads the raw ring and keeps showing the ghost — correct,
stated so nobody files it. No conflict with the deferred R4 cluster (parse
seam vs display). The fake learns the carried-over armed reading (13–96 spm
ghosts), not `zeroedStatus`'s fiction.

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
2. *The door:* stamping `completedAt` at the rower's choice passes
   `monitorModeRun`'s gates (verified: flag, record, workoutId match,
   buildMonitorLogSteps) — **but the screen it opens computes its header
   duration WALL-CLOCK (`monitorLogTotals`), which ruling 3 forbids**
   (antagonist). The interrupted path therefore touches TWO product files:
   the Today twin, and `monitorLogTotals` learning the actuals+allowance
   duration (or `completedAt` stamped from the last measured boundary — the
   plan picks one and says why). The record gains an additive
   `endedBy: "interrupted"` field; a v1/v2 record without it reads as a
   normal completion per `loadMonitorRun`'s never-migrate discipline.
   Stated latents: an anonymous run (`workoutId === null`) has no log route
   and gets no "Log it" (unreachable today — only WorkoutDetail programs);
   a COMPLETED-but-unlogged MonitorRun still has no Today row (same idiom —
   filed, ruled OUT of 2b); Today's stale-draft guard stops protecting a
   stale draft once the record is stamped — a small behaviour change in the
   right direction, named.
3. *An honest duration* (James's ruling): **recorded work + programmed rest
   for completed intervals** — the allowance `logSummaryTotals` already
   computes — never wall-clock, nothing invented past the last measured
   boundary. **Discard** (James's ruling): the record is discarded, the
   diagnostics stash is KEPT (it is the tab's own sessionStorage and dies
   with the tab; a rower reporting a bug right after discarding keeps the
   evidence).

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
    0x0039 has already arrived for this run, OR **recorded actuals ≥
    programmed − 1** (antagonist, hand-tracing all four committed rings:
    the final boundary ROUTINELY arrives after the finished tick, inside
    the finish grace — that is what the grace is FOR — so an honest natural
    finish reads N−1 of N at the terminal tick, and the first draft's
    tighter predicate marked two of the four honest finishes suspicious).
    Register counts discriminate NOTHING here (at the killer's instant they
    read 1-of-2, byte-identical to an honest 2×1:00 terminal) and are not
    consulted. Admitted residual: on a 1-interval program N−1 = 0, so the
    killer shape is undetectable there by construction.
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
- **The disconnect() twin, fixed with a FOUR-STEP ordering**: teardown runs
  **reconcile → stash → unsubscribe → disconnect** — the reconcile while a
  listener still exists (the who's-listening demand) AND before the ring is
  exported to sessionStorage (antagonist: a `final-totals` written after
  the stash exists only in memory and dies with the tab; the ring IS the
  stash — §22's own recorded trap). The F7 rule (cancel the wait, not the
  verdict) then applies uniformly.

### 3. The interval clock (was "METERS LEFT, mixed programs" — mechanism SETTLED, blast radius WIDER)

**Adjudicated by the antagonist from committed data, independently
re-verified** (225 time frames + 161 distance frames at interval index 1,
zero mismatches): `intervalRemaining` is `V − (obs − checkpoint)`, so the
0x0033 Last Split checkpoint inverts out of the lab captures. Measured: **the
checkpoint is 0 throughout interval indices 0 and 1** — even after a fully
completed interval 0 — and at interval index 2 it holds **181**: interval 0's
end, one boundary BEHIND the current interval's start. The pair **lags one
boundary**, exactly as 0x0033's Interval Count does (logged live twice in
session-d). Both earlier candidate mechanisms are falsified; "mixed-program
bug" was an artifact of where the walk observed it.

**Blast radius:** wrong from **interval index 2 onward on ANY program, both
dimensions** — every library workout with ≥3 intervals. **`intervalAccrued`
shares the checkpoint, carries the identical defect, and renders on screen**
(grid active row). No committed capture or ring could have shown this: no arm
in the record reaches interval index 2 with a remaining value.

**The fix is narrow, in the driver:** `progress = frame.elapsedSeconds` /
`frame.distanceMeters` — 0x0031's pair is already per-interval (walk 4,
re-confirmed in both re-walk rings); the checkpoint subtraction is deleted
for BOTH `intervalRemaining` and `intervalAccrued`. No-op for intervals 0-1
(checkpoint already 0), correct from 2 on.

**The fake must learn the Last Split semantics** (0 at intervals ≤1, lagging
one boundary after). Today it books the scenario's own cumulative pair as the
checkpoint — a self-consistent fiction in which the subtraction is CORRECT,
which is why this survived; a failing test against today's fake cannot
reproduce the bug.

**Record corrections riding along:** the walk README's signature restated
honestly (the field carries whole meters — LSD = 181, true remaining 578.3;
"181.2" is a value the field cannot carry); interface-notes §17 items 17/24
updated with what is now measured. **Walk item added:** a 4-interval program
with deliberately UNEQUAL intervals — the only shape separating lag-by-one
from previous-split's-own-value (both fit all committed data and imply the
same fix; not plan-blocking).

### 4. PR structure, and where the reducer went (James's ruling on the PM gate)

**Two PRs.** **2a** = axes + mirror surface + pause state + driver lifecycle
+ the interval clock — no persisted shape, no destructive action, no new
product surface. **2b** = F6 alone — the one piece carrying a stored-shape
field (`endedBy`) and a destructive action (Discard), its own reviewable
transaction after 2a.

**The reducer is DEFERRED to its own spec.** Nothing in 2a/2b requires it;
landing it beside the hook with no consumer is the unconsumed-helper trap;
the review sequences it after the record work (R8-R10). What survives of R11
here is its first step — the pure axes derivation — plus every CONSUMER
migrating to the axes. Stated honestly: **`ConnectedPhase` is NOT deleted in
this spec.** It stays the hook's internal state variable; the `paused` member
is removed (its consumers move to `activity`), every reader outside the hook
reads axes, and a lint/grep pin prevents new outside readers. The enum's
deletion, the hook's 11 phase writers (recounted; the review said 9), and the
five named invariants (sync ref mirror, atomic phase+frame patch, P3b pin,
`cancel()`'s synchronous claim, record-identity-is-what-we-sent) are the
reducer spec's subject.

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

1. `connectedAxes.ts` exists with exhaustive never-guarded derivations, and
   zero-behaviour-change is proved by an **exhaustive table over all ten
   members × the three extra inputs** — not a ring replay (the rings carry
   no phase entries, and state-change-only frames make a freeze sequence
   unwitnessable by construction). Freeze/`activity` fixtures come from the
   lab captures' one real stop (216 identical frames, pm5-session3);
   hook-phase shapes are hand-built; the rings serve the terminal shapes.
2. `buildSurfaceModel` takes a non-nullable status; `?? "live"` is gone;
   `armed` renders the mirror surface (0 plain, target ghost, nothing judged)
   against the fake's carried-over reading, not `zeroedStatus`.
3. The banner: stopped mid-interval shows `PULL TO RESUME` occluding nothing;
   suppressed during genuine rests; paused rate hero suppresses like the
   split; screenshots re-shot and inspected.
4. The suspicion predicate is LOG-ONLY (fail-open ships no close-behaviour
   change; a test asserting a changed close would contradict §2's own
   ruling): a hand-built killer-shaped fixture (mid-program `finished`, no
   0x0039, actuals < N−1 — the afternoon ring was never committed, so the
   shape is synthesized, cited to the walk README) produces exactly one
   `suspicious-terminal` entry and still closes as today; all four
   committed rings' shapes produce zero suspicious entries; the normal
   finish path's timing is pinned unchanged.
5. F6: reload → choice prompt; "Log what was measured" lands through the
   `interrupted` door with actuals-derived totals; "Discard" cleans up;
   Connect never again asks "Replace it?" about a dead run. No wall-clock
   duration anywhere in the interrupted path.
6. END and disconnect() route through the terminal path: `final-totals` in
   the ring on every ending; the twin's reconcile-before-unsubscribe ordering
   has a test that fails under today's order.
7. The interval clock: the 578-signature reproduces (LSD=181, whole
   meters) then reads 397.3; a ≥3-interval SAME-dimension program shows the
   index-2 defect failing-first for BOTH `intervalRemaining` and
   `intervalAccrued`, then correct; the fake's Last Split fiction is
   replaced by the measured semantics.
8. Every consumer outside `useMonitorSession` reads axes, `paused` is gone
   from `ConnectedPhase`, and a lint/grep pin prevents NEW readers of the
   enum outside the hook (the enum's deletion is the reducer spec's exit,
   not this one's).
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

## Questions James closed (2026-08-15, evening)

1. **PR structure and the reducer**: the PM's shape — 2a then 2b, reducer
   deferred to its own spec (§4).
2. **F6 duration**: work + programmed rest for completed intervals.
3. **Discard**: record discarded, diagnostics stash kept.
