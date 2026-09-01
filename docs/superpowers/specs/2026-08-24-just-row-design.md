# Just Row — observe the machine's own free row

**Date:** 2026-08-24 · **Rev 3** (2026-08-26: `workout_type` is NULL for a
free row, not `"JustRow"` — James's ruling after an engineer pass; see
"The stored type, decided") · **Rev 2** (all phase-open gate findings folded:
antagonist anchor pass 12 findings, PM GO-WITH-CONDITIONS C1–C7) ·
**Status:** Approved by James (design sections + two gate rulings, this
session) · **Phase:** JR

## What and why

A rower who just wants to pull taps **Just Row** on Today, the app connects
to the PM5 and watches the machine's own native Just Row mode — no program,
no targets, no baseline required. When they finish (Done in the app, Menu on
the erg, or walking away until the monitor powers itself off), the session
closes with the machine's numbers and offers the log screen. (**The
"walking away" closer has never been observed** — see the end-semantics
section; the rower and link-lost closers stand.) The row lands
in history and the future 8B calendar marked as what it is: a free row, not
a workout.

The feature exists because the app currently has no way to row without
choosing a workout, and because the whole stack already has the concept: the
PM5's Just Row is Concept2's own primary unprogrammed mode, their Logbook
API carries `JustRow` as a first-class workout type, and our driver
deliberately refuses to infer a run without a program — naming a
"JustRow-follow mode" as its own designed feature. This is that design.

## Rulings (James, 2026-08-24)

1. **Open-ended free row** — no quick-pick targets, no chooser.
2. **Connected only this phase** — no phone-timer count-up, no manual
   "log a free row after" door.
3. **Same table, marked** — a `session_logs` row, not a separate record.
4. **Entry on Today, always** — one persistent row, visible with or
   without a baseline. **The fourth doors-card door is CUT** (PM gate C7,
   James confirmed): the doors card's own copy promises every door ends in
   a baseline, and the always-visible Today row already gives a
   no-baseline rower the entry on the same screen. The BL canvas and card
   copy stay untouched.
5. **End = Done in the app OR backing out on the erg**, plus the
   machine's own idle power-off as the passive closer. The app never
   invents an idle threshold. Named honestly: "Done" is an APP-side end
   the machine does not have — the erg keeps its row open until Menu or
   timeout, so the PM's stored piece can be longer than ours (coast-down
   plus whatever precedes Menu). The exit walk states this instead of
   discovering it.

   **PREMISE IN DOUBT, RULING NOT REVERSED (2026-08-31 capture).** The
   passive closer assumes the monitor powers itself off and drops the link.
   We watched for 896.8 s, connected, and it did not — but that is a
   bounded observation, not a refutation: concept2.com documents the
   power-off plainly and says nothing about Bluetooth either way, and no
   vendor document relates a connection to it. **What IS settled is that we
   have never observed the signal**, and a closer we cannot observe is one
   PR 1 cannot store, which is why `ended_by: "idle"` is withdrawn below.
   The tension this leaves is real and is yours to resolve: only an
   app-side threshold could produce a passive closer now, and this ruling's
   second sentence forbids one. **James's call, not an implementer's.**
6. **Approach A** — a parallel observer path; `ConnectedSurface` and
   `useMonitorSession` are not modified. **Corrected claim:** this is
   parallel-*safer*, not parallel-safe — the observer still needs driver
   /frame-seam widening (see Detection) and must rebuild session concerns
   that live in the hook, not the driver (see PR 2 scope). Implementation
   therefore still waits behind Phase RC's wave.
7. **The capture walk is its own erg session, James-scheduled** — RC's
   exit-7 walk already ran (2026-08-24), so there is no trip to attach to.

## Does the system have the concept? (the mandatory question)

**Yes at every layer — we invent nothing conceptually.** The PM5's Just Row
is its native unprogrammed mode (PRIMARY); Concept2's Logbook API carries
`JustRow` in its `workout_type` enum, with distance and time both
required, no title field, and no rest concept for it. **Correction (rev 3):
their `workout_type` is documented `Required: No`, and `unknown` is a
first-class member of that enum** — rev 2 leaned on this field to justify
storing their word in OUR column without checking it was required. It is
not, and that premise is retired (PRIMARY —
<https://log.concept2.com/developers/documentation/>); our driver documents
the no-program case and explicitly reserves a follow mode for real design
(`driver.ts:920-926`).

**What we DO assert on the machine's behalf (the PAUSED-state discipline):**
an app-side "Done" that the PM5 does not have. When the rower taps Done,
the machine's row keeps running until Menu or its own timeout. We record
our observation window's numbers and say so; if a Logbook sync ever comes,
the machine's row and ours may legitimately differ for a Done-ended piece.

## Wire facts after the anchor pass (corrected; tags per claim)

The anchor pass falsified three of rev 1's wire claims against our own
captures and transcriptions. This section is the corrected record.

- **Workout-type sniffing is DEAD.** Rev 1 proposed detecting Just Row via
  0x0031's workout type 0/1. Our own captures show `workoutType=1` on a
  TERMINATING type-8 programmed workout, and types 0, 1, and 8 all at
  idle (SECONDARY, `pm5-session4a-final.log.gz` decoded at the anchor
  pass). The field identifies nothing we need. It is not part of this
  design.
- **Appendix E DOES name JustRow — but it does not say Terminate is the
  only exit, and an earlier version of this bullet claimed it did.** Rev 2
  said our Appendix E transcription carried no JustRow attribution and that
  "the link was our own gloss": true of OUR TRANSCRIPTION, false of the
  SOURCE. The CSAFE Communication Definition rev 0.31, Appendix E "PM State
  Transitions" p.173, verbatim:

  > "For any fixed duration workout **or JustRow (no defined end)** that is
  > terminated prior to reaching its defined end:
  > `WaitToBegin->WorkoutRow->Terminate (user or command)->Rearm->WaitToBegin`"

  **READ THE CONDITIONAL.** The sentence is *"…that **is terminated**
  prior to reaching its defined end"* — it describes the state sequence
  that FOLLOWS a terminate. It does not enumerate a JustRow's exits, and it
  says nothing about physical power-off, which concept2.com separately
  documents happening after inactivity with no Bluetooth qualification.
  **A prior revision of this bullet read it as "Terminate and nothing else"
  and tagged the result PRIMARY. That was an over-read** — a conditional
  taken for an enumeration, recurring failure 16's second corollary,
  committed in the same pass that was correcting a different instance of
  it. Struck rather than softened.

  What the line DOES establish, PRIMARY: a JustRow terminated early lands
  on `Terminate → Rearm → WaitToBegin`, so our observed
  `1 → 11 (two frames) → 0` on the Menu end is the documented sequence.
  Everything about a row nobody terminates remains UNSETTLED at the
  physical-power layer. `pm5-interface-notes.md:3496` had omitted this
  sequence entirely, which is how we came to call our own correct reading a
  gloss; it is restored there. The standing caution still applies (the
  keystone walk caught Appendix E wrong about these ordinals,
  `parse.ts:410-416`).
- **Terminate IS observable at the frame seam**: `parse.ts:439` maps
  ordinal 11 → `state: "terminated"`, sole producer. SECONDARY, vetted.
- **0x0039 HAS been captured** — the 2026-08-23 keystone walk recorded an
  rx 0x0039+0x003A pair; the old "zero ever" corpus fact was our own
  deafness, per that walk's README (SECONDARY). Still: arrival is not
  guaranteed (ecosystem reports drops), so 0x0039 remains an opportunistic
  cross-check, never the record.
- **Idle chain — THREE LAYERS, and rev 2 collapsed them into one.** The
  "6 s → 220 s → power off" chain was never a single mechanism. Corrected
  2026-08-31 against the CSAFE Communication Definition rev 0.31 and the
  walk. **An intermediate correction made on the walk day is itself
  superseded and must not be reinstated:** it said the figures were
  "FALSIFIED for the connected case" and "kept as the disconnected-case
  claim they were sourced for." That preserved the layer error while
  appearing to contain it — the figures do not apply in EITHER connection
  state.

  1. **6 s / 220 s belong to the PUBLIC CSAFE SLAVE state machine only**
     (PRIMARY, rev 0.31 Table 16 p.47, under the heading "Public CSAFE
     Default Configuration"): *"Inactivity During InUse State Timeout | 6
     seconds"*, *"Inactivity During Pause State Timeout | 220 seconds …
     before entering the Finished state"*. Table 17 p.49 narrows it
     further: *"A timeout is employed to enter the Finished state in the
     event **a configured workout** is never started or re-started."* A
     Just Row is not a configured workout, and our observer sends no CSAFE
     at all — the whole capture contains exactly one tx, the 1 Hz
     sample-rate write. **These figures never governed an unprogrammed
     Just Row. Connection state is irrelevant to why.**
  2. **The WORKOUT state machine has no timed exit for a JustRow** — see
     the Terminate entry above. This is the layer 0x0031 byte 8 reports,
     and `OBJ_WORKOUTSTATE_T` (rev 0.31 pp.102-103) has **no Paused
     member** at all, so "we saw no Paused transition" is not a finding
     that field can deliver.
  3. **Physical power-off is a separate layer, and the only one where
     "a connection suppresses it" is a live hypothesis.** concept2.com
     (PRIMARY): *"The PM turns off automatically after a couple of minutes
     of inactivity. A spinning flywheel is considered activity, so the
     count starts once the flywheel stops."* — and, notably, *"To keep
     your monitor awake when you're taking a break during a long piece,
     periodically press Display or Units on the monitor face."* We saw
     neither the power-off nor any need for that mitigation across 897 s
     connected. **Neither vendor document relates a BLE connection to any
     timeout or to power state** (grepped: 10 "bluetooth" hits in rev
     0.31, all transport/HR/byte-order). Concept2's own forum reports the
     suppression consistently across years and several threads, but those
     could not be read verbatim — SECONDARY, and weak. BLE-side effect of
     a power-off (link drop) remains INFERENCE, untested.

  **What this changes for the design: nothing softens.** PR 2 still needs
  its own inactivity rule, and now for a stronger reason than "we saw no
  timeout": no closer has ever been observed, and none is documented at any
  layer we can watch. **That is an absence of evidence, not evidence of
  absence** — see the CLOSED 3 caveat — and it is already sufficient, because
  a rule cannot map a signal nobody has seen. We are also, by definition,
  never disconnected when we care.
- **Auto-start**: the PM turns on and Just Row begins when the rower
  pulls (PRIMARY, concept2.com). Pull-from-menu auto-entry with the app
  already connected: INFERENCE, capture question.
- **Persistence**: the PM saves a Just Row ≥1 min or ≥100 m; max
  50,000 m; auto-splits stored at 5 min, →10 min past 35:00, →20 min past
  70:00 (PRIMARY, concept2.com). **The auto-splits were the phase's single
  highest-value open question and are now ANSWERED — see CLOSED 1: the
  live counters do not reset across them.**

### CLOSED — answered by PR 0b's capture, 2026-08-31

**Six are answered outright; OPEN 3 is answered only within a bound (see
its own entry).** Evidence and full decodes:
`docs/monitor/sessions/walk-2026-08-31-justrow/README.md`. Scope, per that
README: PM5 serial 432331249, firmware not captured, one session — these
are findings for this device and these runs, not firmware-general truths.

1. **Do 0x0031's elapsed/distance RESET at a Just Row auto-split? NO.**
   Row-cumulative, straight through the boundary: 302.09 s / 1074.0 m at
   the split, still climbing to 393.58 s / 1396.6 m at the end, with no
   non-monotonic step anywhere inside the row. **Both headline numbers are
   safe.** (The companion code fact stands and is untouched by this: with
   `programLength <= 0` the series recorder's interval key pins at 0 —
   `intervalIndex.ts:183` — which PR 2 must still fix or bypass.)
2. **Do the auto-splits fire live on 0x0037/0x0038? YES**, twice, each
   paired with its 0x0038. The split's own fields are per-split
   (300.0 s / 1074 m, then 93.6 s / 323 m); the frame's own elapsed and
   distance are cumulative.
3. **The clock HOLDS through a pause, and no auto-terminate arrived
   within 897 s.** The deliberate stop froze elapsed at 185.81 s across
   ~50 s of wall time — elapsed is rowing time, not wall time. The timeout
   half is a **bounded negative**: after the rower stopped, `workoutState`
   stayed at 1 for 896.8 s with frames still arriving and nothing
   terminating. **Bounded, not "never" — the capture ended because the
   operator stopped it, not because the monitor did anything.**

   **Read this WITH the corrected idle-chain entry above, not as a
   standalone surprise.** Two claims that looked like findings on the walk
   day are not: the 220 s figure never governed an unprogrammed Just Row
   in the first place (it is a CSAFE slave-state timeout, and we send no
   CSAFE), and "no Paused transition" is unobservable — `OBJ_WORKOUTSTATE_T`
   has no Paused member.

   **And one claim made in the correction ITSELF is withdrawn.** That pass
   read Appendix E p.173 as giving a JustRow "Terminate and nothing else"
   and called the result PRIMARY-backed. The sentence does not say that. It
   is CONDITIONAL — *"…or JustRow (no defined end) **that is terminated**
   prior to reaching its defined end"* — and describes the state sequence
   that FOLLOWS a terminate. It enumerates no exits and says nothing about
   physical power-off, which concept2.com separately documents happening
   after inactivity with no Bluetooth qualification at all. Reading a
   conditional as an enumeration is precisely recurring failure 16's second
   corollary, committed in the act of correcting a different instance of it.

   **What actually stands:** no closer was observed within 896.8 s, and none
   is documented at any layer we can watch. That is enough to keep `idle`
   out of PR 1 — a rule cannot map a signal nobody has seen — and not enough
   to say the machine never closes. The physical-power/BLE layer is the open
   half, and OPEN 3 is answered only within its bound until it is settled.
4. **Does a Menu-end emit 0x0039? YES**, with 0x003A and a 0x003F, 0.4 s
   after the terminate. Its filed totals (393.60 s / 1396.0 m) agree with
   the live stream (393.58 s / 1396.6 m) to 0.6 m. **This retires rev 2's
   "0x0039 has appeared in zero of our five captures" claim.**
5. **Does pulling from the main menu auto-enter Just Row? YES.**
6. **Does the post-Terminate cycle risk re-tripping a motion detector?
   NO.** The trace is `0 → 1 → 11 (two frames) → 0`. No rearm churn.
7. **Can a real Just Row reach state 12? NOT on a Menu end** — only
   states 0, 1 and 11 appeared across 1660 status frames. The idle closer
   could not be tested because none occurred within the 896.8 s we watched
   (see 3) — untested, not proven absent.

#### Two findings the OPEN list did not anticipate — both bind PR 2

**N1. The PM5 does not advertise while a Just Row is open, so a mid-row
connect is impossible.** Isolated by a discriminating test at the erg: not
discoverable with a row open, discoverable the instant Menu returned it to
the main menu, nothing else changed. **This falsifies the Live-surface
section's "If the rower is already mid-Just-Row at connect, frames show
motion immediately" outright** — our transport's `connect(id)` only accepts
an id its own `scan()` returned, so every connection needs discovery.
**It also breaks recovery-by-reconnect:** the End-semantics promise that a
mid-row link drop leaves a recoverable run assumes the app can get back,
and it cannot while the row is still open. PR 2 designs for that or states
plainly that a dropped link ends the app's involvement in that row.

**N2. Nothing was observed closing a free row the rower walked away from.**
Following from 3:
the workout stayed open for the whole 896.8 s we watched, with frames still
arriving, and we then stopped looking. PR 2 needs its own inactivity rule
because it cannot map a closer nobody has observed, and the
proposed new `ended_by: "idle"` member describes an event this walk could
not produce. **Both are re-opened design questions, not implementation
details — they want a brainstorm before PR 1 tags its enum**, since `idle`
is one of the stored shapes PR 1 was going to migrate.

Two smaller reconciliations owed: `domain/monitor/pm5/uuids.ts` says 0x003F
"has never been recorded" and one now has been; and status frames arrive at
1.00/s, not the ~2.2/s this repo's tooling assumes.

## Design

### Entry (Today)

One persistent, low-key **Just Row** row on Today — always visible,
regardless of baseline state, connected-only and saying so plainly.
Navigates to `/justrow`. No baseline gate anywhere on the path. (This
delivers the "nobody is ever blocked from just rowing" half of the
row-without-a-baseline follow-on; the every-workout-targetless half stays
a follow-on.)

### Detection (rewritten after B1/B9)

The observer does not sniff workout types and does not infer runs from
state words. Its session opens on **user intent plus motion**:

- The rower tapped Just Row — that is the intent; the surface is already
  in its Ready state ("pull to begin").
- Motion = the frame seam's existing `rowingActive` / `state: "rowing"`
  becoming true with distance advancing. First motion → **Live**, and the
  observer marks the session open.
- Once **Ended** (any closer), the observer NEVER re-opens on frames —
  the PM's own post-Terminate housekeeping (Terminate → Rearm →
  WaitToBegin, unaided) must not fabricate a second session (the
  driver's own documented hazard). A new row requires a new user action.

Whatever driver/frame-seam widening this needs (e.g. surfacing a
distinct terminate observation to the observer) is named in PR 2's plan
and is the acknowledged RC-adjacent touch — reviewed as such, after RC's
wave.

### Live surface (`/justrow`)

New `JustRowSurface` + `useJustRowSession`, sharing the transport, driver,
and series recorder. States: **Connecting → Ready ("pull to begin") →
Live (elapsed, distance, current pace, SPM; a 44 px Done control) →
Ended (summary of recorded numbers; Log it / discard)**.

~~If the rower is already mid-Just-Row at connect, frames show motion
immediately: straight to Live with the machine's accumulated numbers —
the record is the machine's whole row, not "since we connected."~~

**FALSIFIED by the 2026-08-31 capture walk (finding N1 above).** The PM5
does not advertise while a Just Row is open, so this state cannot be
entered at all: the rower cannot connect mid-row. PR 2 must either require
that the app is connected before the row starts, or say plainly that a row
already underway is not joinable. Do not build against the struck text.

**PR 2 rebuilds, not inherits, the session concerns that live in
`useMonitorSession` rather than the driver** — priced into its size:
keep-awake, app foreground/background handling and suspect-marking,
silence hysteresis, link-drop disposal, typed failure mapping, series
recorder lifecycle, and teardown ordering. Each gets a line in PR 2's
plan naming what is copied, simplified, or consciously dropped.

**Coexistence guard:** opening a Just Row session must run the same
guard discipline as the programmed path — it must not clobber an
unlogged phone-timer `SessionRun` or an unlogged `MonitorRun`
(`createMonitorRun` unconditionally clears the timer run today; the
observer checks before opening — F5 data-loss class).

### End semantics

| Closer | Signal | Close reason |
| --- | --- | --- |
| Done tap in the app | UI event | `rower` |
| Menu/back on the erg | frame-seam `terminated` (ordinal 11) while our session is open | `rower` |
| ~~Machine idle power-off~~ | **WITHDRAWN — see below** | — |
| Genuine link loss mid-row | link drop while Live/rowing | `link-lost` |

**THE `idle` MEMBER IS WITHDRAWN. PR 1 MUST NOT MIGRATE IT.** Rev 2 argued
for it from a premise the 2026-08-31 capture falsified: that a PM5 left
alone powers itself off and drops the link. It does not, while a central is
connected — the walk held the workout in its active state for ~15 minutes
after the rower stopped, frames still arriving, with no terminate and no
power-off (CLOSED 3, and finding N2). **There is no observed signal to map,
so there is nothing to store.** Adding an enum value for an event we have
never seen is exactly the "does the system HAVE the concept" failure this
project has already paid for once, and an enum value is a stored shape:
easy to add and, by our own ratchet, permanent.

The rev 2 reasoning below is kept because it stays valid *if* a closer is
ever found — it is not an argument for shipping one now:

> `link-lost` renders "LINK LOST · the app lost the monitor before the
> end" and its release note promises "a row the app lost is never confused
> with a row you chose to end" — reusing it for a *designed* idle power-off
> would label a normal free-row ending a failure.

**What PR 2 needs instead is an inactivity rule of our own** (N2): with no
observed machine-side closer, a row the rower walks away from has nothing
known to close it.
That rule is undesigned, it decides what a walked-away row stores, and it
therefore wants a brainstorm and a fresh antagonist pass **before PR 1
freezes any enum**. Until that lands, the closers are `rower` and
`link-lost` only.

**CLOSED 7 answered this: a Menu-ended Just Row does NOT reach the
`"finished"` state.** Only workout states 0, 1 and 11 appeared across 1660
status frames, so `finished` is not a closer PR 1 or PR 2 stores. The
conditional this paragraph used to carry ("if OPEN 7 shows…") is spent, and
rev 1's "never `finished`" claim is reinstated for the Menu closer — the
only closer the walk could exercise, since the idle one does not occur.

All closers record the last live frame's numbers. If 0x0039 arrives, its
totals are stored as a diagnostic cross-check (not authority).

A mid-row link drop or app death persists a recoverable `MonitorRun` so
Today offers recovery. **Today's unlogged-run row currently renders
discard-only for a null-workout run** (the documented latent) — PR 2
gives it a real "Log it" path to the new log door.

**NARROWED by the 2026-08-31 capture walk (finding N1 above).** Recovery
here can only ever mean "log what we already have". It cannot mean
reconnecting to finish the row: the monitor stops advertising while the row
is open, so the app cannot get back in until the rower ends it on the erg.
Whatever PR 2 offers on that Today row must not imply the session can be
resumed.

### Stored shape (TRIAD — PR 1, tagged BEFORE PR 2)

One `session_logs` row:

| Column | Value | Note |
| --- | --- | --- |
| `workout_id` | `null` | already nullable end-to-end |
| `workout_title` | `"Just Row"` | display name; NOT NULL column |
| `workout_type` | **`null`** | "No intensity was prescribed" — true of a free row, and true again of the targetless-workout follow-on. The column becomes NULLABLE in PR 1 (`DROP NOT NULL`, folded into the migration PR 1 already writes). It stays plain `text`, and stays OUR intensity axis only; Concept2's structural vocabulary never enters it. See "The stored type, decided". |
| `steps` | `[]` | server branch: empty allowed **iff** `workoutType` is null. No fabricated steps — record, not projection. (Vetted: the only server consumer of steps is create-time validation; client renderers absorb `[]` — the summary self-gates on zero rows.) |
| `time_seconds`, `distance_meters` | the observer's recorded totals | both headline numbers, matching the Logbook API's both-required rule. **ANSWERED (CLOSED 1): the counters do not reset at the auto-split, so the frame's own cumulative elapsed/distance ARE the row.** No longer a merge blocker. |
| `avg_split_seconds` | **derived by us: `500 × time/distance`**, labelled ours | no live frame carries a piece average (the per-split field is split-scoped; the whole-row average lives only on unreliable 0x0039). This is a NEW derived number — named as such, tested, and covered by the TRIAD pass. |
| `work_seconds/meters` | = the whole piece | rest does not exist for JustRow (Logbook-aligned) |
| `rest_seconds/meters` | `null` | no rest concept to report |
| `ended_by` | per the end-semantics table: `rower` or `link-lost` | **no migration — the `idle` member is WITHDRAWN** (see the end-semantics section) |
| `series` | the 1 Hz trace — measured, not assumed (CLOSED N4) | with the `programLength <= 0` interval-key fix, which CLOSED 1 leaves owed regardless |
| `plan_key`/`plan_index` | `null` | see plan refusal below |
| `baseline_k2/k6` | as at save (may be null) | unchanged |

**Plan refusal, both halves (B6/C5):** the server's `advancesPlan`
defaults to TRUE and nothing is type-aware — as-is, a free row would tick
"SESSION n OF 84" and deleting it would un-count a plan day. PR 1 ships
both: the client posts `advancesPlan: false`, AND the server refuses to
advance when `workoutType` is null regardless of the flag. Pinned
by an integration test asserting **`plan_state.done_n` is unchanged
across a Just Row save** (the non-tautological form).

**MonitorRun (stored localStorage shape — TRIAD, lives in PR 1):** the
existing v2 record gains an additive `mode: "justrow"` field (the
validator tolerates unknown keys — vetted; **no v3 bump**, priced at data
loss by the record's own contract). `program` is REQUIRED and
shallow-validated, so a Just Row record carries `program:
{ intervals: [] }` — an honest empty observation program, distinct from
the rejected fabricated-steps case: it fabricates no rowing structure,
and `buildMonitorLogSteps` returns `[]` on it (vetted, no throw).

**Version skew / release ordering (B10):** an absent or unknown
`workout_type` in today's `TypeBadge` degrades to invisible text
(computed 1.11:1 against a 4.5:1 floor), not to a graceful fallback.
Therefore **PR 1 ships the read-side handling — no badge for a null
type, a neutral badge for any unknown string — and is TAGGED before PR 2
ever writes a typeless row**, the R-A discipline (read-side first, its
own tag) already named in `schema.ts`. The `RecentLog`/`StoredLog`
client types widen from the four-literal union to `WorkoutType | null`
in the same PR.

### The stored type, decided (rev 3, James 2026-08-26)

Rev 2 wrote `"JustRow"` into `session_logs.workout_type` and closed the
column to `AN/O2/AT/TR/JustRow`. **That is retired.** A free row stores
`workout_type: null`.

**Why the old plan was wrong.** Our four codes are an INTENSITY axis (how
hard a piece should feel). Concept2's `workout_type` is a STRUCTURE axis
(what shape the piece was: `JustRow`, `FixedDistanceInterval`,
`VariableInterval`…), and their only intensity concept is
`targets.heart_rate_zone` 0-5 — a heart-rate field this app deliberately
does not have (`judge.ts:44-47`). Writing their word into our column put
one structural value beside four intensity values, serving neither axis:
it corrupts the intensity axis PS will chart, and it is not a structural
record either, because the other 100% of rows would still need their
structure derived at sync time.

**The premise it rested on was false.** Rev 2 cited the Logbook API to
justify the word. That field is documented **`Required: No`**, with
`unknown` first-class in the enum, and C2's own GET examples return
`"workout_type": "unknown"`. A future upload can omit it entirely.

**The structure is derivable, so there is nothing to store.**
`domain/monitor/pm5/commands.ts:158` sets the PM5's workout type
**unconditionally** to `WORKOUTTYPE_VARIABLE_INTERVAL`, hardware-confirmed
stable at ordinal 8 across TIME, DISTANCE and rest-zero shapes
(`commands.ts:386-392`, session 4a). So the mapping is total and needs no
inspection of our step grammar: a programmed row is `VariableInterval`, a
free row is `JustRow`. **Deriving is also more CORRECT than storing** —
C2 requires `workout_type` to match the verification code for a verified
upload, and we already store `verificationBytes` (`schema.ts:308-322`), so
a value picked by hand at save time could silently break verification
where a derived one cannot.

**What a sync would actually owe first, recorded so nobody designs for the
wrong gap:** `weight_class` (H or L), which C2 documents as **required for
rower results** and which appears NOWHERE in this codebase. It is a user
attribute, so it meets the standing minimal-PII rule head-on and is a
product decision, not a schema one. The expensive alignment — work-only
distance and time with rest carried separately — RC-1's spine already did
(`schema.ts:289-292`).

**Why null rather than a sentinel.** Identical code cost (the client union
widens and the badge needs a fallback either way), but a sentinel puts a
non-value in a column and makes every future `WHERE workout_type = …` a
trap. Null says the true thing: no intensity was prescribed. It also
retires `resolveWorkoutType`'s last-resort `?? "O2"`
(`LogSession.tsx:309`), which the code's own comment already apologises
for as not a meaningful guess.

**Why it had to be decided before PR 1 tags.** CLAUDE.md's additive-only
rule between tags: once PR 1 shipped a validator CLOSING the column to a
five-word set, removing `"JustRow"` later would be a narrowing the rule
forbids — we would accept a value we had decided was wrong, permanently.
The delta while PR 1 is unshipped is one cell in the table above, a
`DROP NOT NULL` folded into the migration PR 1 is already writing, and two
client type widenings. Same PR, same gate, no extra tag. (Rev 2 said that
migration was "for the `idle` enum member"; that member is withdrawn, so
the `DROP NOT NULL` now stands on its own.)

**Unchanged by this ruling** (decision-independent, still in PR 1): the
read-side badge handling, the client type widening, the plan refusal, and
the MonitorRun `mode` field. **The `idle` enum member was in this list and
is now WITHDRAWN** — see the end-semantics section.

### The log door (B8/C6)

"Offers the normal log screen" is real work, named: the monitor log door
is routed as `/library/:id/log` and requires a workout id match — a
workout-less run has no route. **PR 2 adds a Just Row log entry** (new
route, e.g. `/justrow/log`) reusing the shared form internals
(`useLogForm`) with the JustRow field set (no steps, monitor-door
numbers, `advancesPlan: false`). Today's recovery row routes there for
`mode: "justrow"` runs.

### Consumers

- **History/log screens:** "Just Row · distance · time", with **no type
  badge at all** — an absence, matching this spec's own abstention rule
  for the steps widget. No AN/O2/AT/TR chip and no substitute for one.
- **From-the-log:** renders without a steps widget — an absence, not an
  empty version (the abstention ruling). ~~`ended_by: idle` gets its own
  copy line~~ — withdrawn with the member itself.
- **8B calendar (future):** sees the row like any log — the all-logs
  ruling covers it; `plan_key` null means non-plan-linked, which is
  exactly 8B's spec.
- **Phase PS input (recorded now, per the PM gate):** JR creates a log
  population with `steps: []`, no rest, and a NULL type — PS's "time by
  type" gets four intensity buckets plus an honest "no type" bucket.
  Deliberately NOT a fifth peer of AN/O2/AT/TR: a free row has no
  intensity, and a bucket that looked like their peer would make the
  chart lie.
- **Suggestions/streaks/plan:** untouched by construction (plan refusal
  above; not a pool member; post-test prompt stays ineligible —
  title-gated, vetted).

## Phase shape

- **PR 0a — the observe-only instrument (ships first).** No app path can
  connect without programming today (`ConnectedInterstitial` auto-
  programs on pairing) — so the capture walk needs an instrument PR
  before it can run: a dev-only observe mode that connects, subscribes
  (0x0037/38/39/3A included), and records WITHOUT programming. The
  capture leg runs on the **laptop/Chrome web arm** — the byte recorder
  is composed there only (its own header says so) — and the walk card
  names that leg and the file-writing path explicitly (RF13).
- **PR 0b — the capture walk (hardware, `/hardware-walk`, its own
  session, James schedules).** One instrumented Just Row closing OPENs
  1–7: connect → pull from menu → row past 5:00 → deliberate 30 s stop →
  resume → end via Menu, stay connected ≥90 s; a second short row left
  to time out; a third started already-rowing if budget allows. Capture
  lands in `docs/monitor/sessions/`; findings amend this spec.
- **PR 1 — every stored shape (TRIAD, tagged alone before PR 2):**
  the `session_logs` validation branch + `DROP NOT NULL` on
  `workout_type`, the plan refusal (both halves), the
  unknown-type badge fallback + client type widening, the MonitorRun
  `mode` field. Full antagonist pass + PM final-PR gate. Its PR body
  states plainly that it changes nothing visible.
  **NO `idle` enum migration** — withdrawn by the 2026-08-31 capture (see
  end semantics). **PR 1 is BLOCKED until the inactivity rule N2 asks for
  is designed and approved**, because that design decides whether any new
  `ended_by` value is needed at all.
- **PR 2 — surface + session + log door (L, after RC's wave and after
  PR 0b's answers):** `/justrow` route, `JustRowSurface`,
  `useJustRowSession` (with the rebuilt-concerns list, the coexistence
  guard, the no-reopen rule, and any frame-seam widening named), the new
  log door and Today recovery routing, the series-recorder key fix.
  Tested against PR 0b's capture via the replay harness.
- **Exit walk:** a real Just Row, both screens in one photograph, ended
  once by Done and once by Menu. **What the oracle can and cannot catch
  (B11):** our stored number is the PM's own live counter transcribed,
  so the comparison is a TRANSCRIPTION check (unit, scale, stale frame,
  wrong field) — valuable, but it cannot catch a definition error, since
  we define nothing except `avg_split` (checked by arithmetic from the
  photographed time/distance instead). The Menu-ended row compares
  directly; the Done-ended row's PM entry is expected LONGER (coast-down
  + pre-Menu gap) — the walk records the delta rather than calling it
  disagreement, and the Done-ended row must exceed the PM's ≥1 min/100 m
  save threshold or it will have no memory entry at all.

## Per-PR exit criteria (numbered, frozen at PR 1 open)

1. `plan_state.done_n` is unchanged across a Just Row save (integration
   test), and deleting a Just Row log leaves it unchanged too.
2. A history list containing a null-`workoutType` row renders it with NO
   badge (an absence, not an empty badge), and any unknown type string
   renders a neutral badge at ≥4.5:1 contrast — asserted structurally, and
   proven on a build that predates PR 2's writer (the R-A ordering).
3. A `session_logs` row with `steps: []` renders in from-the-log with no
   steps widget (absence, not empty widget).
4. A mid-row link drop yields a recoverable run and Today offers "Log
   it" routing to the Just Row log door.
5. `ended_by` for a Just Row is one of `rower`/`link-lost` per the
   end-semantics table. **NOT `idle`** — withdrawn, no observed closer
   (CLOSED 3 / N2). **NOT `finished`** — CLOSED 7 saw only states 0, 1
   and 11 across 1660 frames on a Menu end. This criterion is REPLACED,
   not extended, once the inactivity rule lands.
6. Opening a Just Row session with an unlogged timer `SessionRun` or
   `MonitorRun` present does not destroy it (coexistence guard test).

## Release call (PM gate, recorded)

No tag on PR 0a/0b or PR 1 alone (instrument no tester can reach; stored
fields nothing renders — but PR 1 still tags for the R-A read-side
ordering, as a patch-level read-side tag). PR 2 is MINOR and the first
tag testers can falsify; its notes owe three clauses: the feature in one
sentence, **that a Just Row never advances your plan**, and that these
rows carry no targets and no type chip.

## Out of scope (this phase)

- Phone-timer open count-up mode; manual "log a free row after" door;
  quick-pick targets.
- The doors-card fourth door (CUT — ruling 4).
- Concept2 Logbook API sync (findings recorded for the day it comes;
  note the Done-ended divergence recorded under "What we assert").
- The every-workout-targetless half of the row-without-a-baseline
  follow-on.
- Split-by-split display of the PM's auto-splits (depends on OPENs 1–2;
  `series` preserves the shape regardless).
