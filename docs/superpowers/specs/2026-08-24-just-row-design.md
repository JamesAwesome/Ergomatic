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
closes with the machine's numbers and offers the log screen. The row lands
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
- **"JustRow ends only via Terminate" is UNVERIFIED.** The repo's Appendix
  E transcription carries no JustRow attribution for the Terminate
  sequence — the link was our own gloss — and this repo has already caught
  Appendix E wrong about these exact ordinals (the keystone walk saw
  5→12 with state 10 never appearing, `parse.ts:410-416`). Whether a real
  Just Row can reach the `"finished"`-mapped state is a CAPTURE question,
  and the design below tolerates either answer. INFERENCE until PR 0b.
- **Terminate IS observable at the frame seam**: `parse.ts:439` maps
  ordinal 11 → `state: "terminated"`, sole producer. SECONDARY, vetted.
- **0x0039 HAS been captured** — the 2026-08-23 keystone walk recorded an
  rx 0x0039+0x003A pair; the old "zero ever" corpus fact was our own
  deafness, per that walk's README (SECONDARY). Still: arrival is not
  guaranteed (ecosystem reports drops), so 0x0039 remains an opportunistic
  cross-check, never the record.
- **Idle chain** — 6 s inactivity → Paused, 220 s → Finished, then the
  monitor powers off ("a couple of minutes… count starts once the
  flywheel stops"). SECONDARY: the 6 s/220 s figures live in our own
  research summary of the CSAFE slave state machine
  (`docs/superpowers/research/2026-07-27-pm5-ble-research.md`), and the
  power-off is concept2.com (PRIMARY). BLE-side effect of power-off
  (link drop) is INFERENCE. Whether the timeout emits an auto-TERMINATE
  first is an open assertion in `monitorRun.ts:145` — capture question.
- **Auto-start**: the PM turns on and Just Row begins when the rower
  pulls (PRIMARY, concept2.com). Pull-from-menu auto-entry with the app
  already connected: INFERENCE, capture question.
- **Persistence**: the PM saves a Just Row ≥1 min or ≥100 m; max
  50,000 m; auto-splits stored at 5 min, →10 min past 35:00, →20 min past
  70:00 (PRIMARY, concept2.com). **The auto-splits create the phase's
  single highest-value open question — see OPEN 1.**

### OPEN — closed by PR 0b's capture before PR 2 merges

1. **Do 0x0031's elapsed/distance RESET at a Just Row auto-split?** If
   they reset the way programmed interval boundaries reset, every free
   row over five minutes would store the current split, not the row — a
   30-minute row landing as ~5 minutes. This decides both headline
   numbers. (Companion code fact, testable without hardware: with
   `programLength <= 0` the series recorder's interval key pins at 0 and
   an elapsed reset would silence the trace after the first split —
   `intervalIndex.ts:183`. PR 2 must fix or bypass this regardless.)
2. Do the auto-splits fire live on 0x0037/0x0038?
3. Does the elapsed clock tick or hold through the 6 s Paused window, and
   what does workoutState read when the 220 s timeout fires — is there an
   auto-TERMINATE before power-off?
4. Does a Menu-end emit 0x0039? (Stay connected ≥90 s after.)
5. Does pulling from the main menu auto-enter Just Row with the app
   connected?
6. Does the post-Terminate auto-rearm cycle (Terminate → Rearm →
   WaitToBegin, unaided) produce frame sequences that could re-trip a
   naive motion detector? (The design guards against this — see
   Detection — the capture confirms the guard's shape.)
7. Can a real Just Row ever reach the `"finished"`-mapped state (12)?

**No genuine unprogrammed Just Row capture exists** — every recording in
`docs/monitor/sessions/` is a programmed workout (verified frame-by-frame
at the anchor pass). PR 0b's capture is both the evidence and PR 2's
permanent replay fixture.

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

If the rower is already mid-Just-Row at connect, frames show motion
immediately: straight to Live with the machine's accumulated numbers —
the record is the machine's whole row, not "since we connected."

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
| Machine idle power-off | terminate-then-link-drop, or link drop from a paused state | **`idle` — a NEW `ended_by` enum member** (migration, PR 1) |
| Genuine link loss mid-row | link drop while Live/rowing | `link-lost` |

Why the new member: `link-lost` renders "LINK LOST · the app lost the
monitor before the end" and its release note promises "a row the app lost
is never confused with a row you chose to end" — reusing it for the PM's
*designed* idle power-off would label the most normal free-row ending a
failure. `idle` gets its own honest copy ("the monitor switched itself
off after the row"). The exact discrimination between `idle` and
`link-lost` (was the machine paused/terminated when the link went?) is
designed against OPEN 3's capture; the conservative fallback is: drop
while paused → `idle`, drop while rowing → `link-lost`.

If OPEN 7 shows a real Just Row reaching the `"finished"` state, the close
maps to `finished` honestly — the "never `finished`" claim from rev 1 is
retired; the stored value reflects what the wire showed.

All closers record the last live frame's numbers. If 0x0039 arrives, its
totals are stored as a diagnostic cross-check (not authority).

A mid-row link drop or app death persists a recoverable `MonitorRun` so
Today offers recovery. **Today's unlogged-run row currently renders
discard-only for a null-workout run** (the documented latent) — PR 2
gives it a real "Log it" path to the new log door.

### Stored shape (TRIAD — PR 1, tagged BEFORE PR 2)

One `session_logs` row:

| Column | Value | Note |
| --- | --- | --- |
| `workout_id` | `null` | already nullable end-to-end |
| `workout_title` | `"Just Row"` | display name; NOT NULL column |
| `workout_type` | **`null`** | "No intensity was prescribed" — true of a free row, and true again of the targetless-workout follow-on. The column becomes NULLABLE in PR 1 (`DROP NOT NULL`, folded into the migration PR 1 already writes). It stays plain `text`, and stays OUR intensity axis only; Concept2's structural vocabulary never enters it. See "The stored type, decided". |
| `steps` | `[]` | server branch: empty allowed **iff** `workoutType` is null. No fabricated steps — record, not projection. (Vetted: the only server consumer of steps is create-time validation; client renderers absorb `[]` — the summary self-gates on zero rows.) |
| `time_seconds`, `distance_meters` | the observer's recorded totals | both headline numbers, matching the Logbook API's both-required rule. **Their correctness against auto-split resets is OPEN 1 — PR 2 does not merge until the capture answers it.** |
| `avg_split_seconds` | **derived by us: `500 × time/distance`**, labelled ours | no live frame carries a piece average (the per-split field is split-scoped; the whole-row average lives only on unreliable 0x0039). This is a NEW derived number — named as such, tested, and covered by the TRIAD pass. |
| `work_seconds/meters` | = the whole piece | rest does not exist for JustRow (Logbook-aligned) |
| `rest_seconds/meters` | `null` | no rest concept to report |
| `ended_by` | per the end-semantics table, incl. the new `idle` member | migration in PR 1 |
| `series` | the 1 Hz trace | with the `programLength <= 0` interval-key fix (OPEN 1 companion) |
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
`DROP NOT NULL` folded into the migration PR 1 is already writing for the
`idle` enum member, and two client type widenings. Same PR, same gate, no
extra tag.

**Unchanged by this ruling** (decision-independent, still in PR 1): the
read-side badge handling, the client type widening, the plan refusal, the
`idle` enum member, and the MonitorRun `mode` field.

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
  empty version (the abstention ruling); `ended_by: idle` gets its own
  copy line.
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
  `workout_type`, the
  `idle` enum migration, the plan refusal (both halves), the
  unknown-type badge fallback + client type widening, the MonitorRun
  `mode` field. Full antagonist pass + PM final-PR gate. Its PR body
  states plainly that it changes nothing visible.
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
5. `ended_by` for a Just Row is one of `rower`/`idle`/`link-lost` per
   the end-semantics table — and `finished` only if OPEN 7's capture
   showed the machine itself produces it (in which case the table is
   amended first).
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
