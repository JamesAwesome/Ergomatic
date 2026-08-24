# Just Row — observe the machine's own free row

**Date:** 2026-08-24 · **Status:** Approved by James (design sections, this
session) · **Phase:** JR

## What and why

A rower who just wants to pull taps **Just Row** on Today, the app connects
to the PM5 and watches the machine's own native Just Row mode — no program,
no targets, no baseline required. When they finish (Done in the app, Menu on
the erg, or walking away until the monitor sleeps), the session closes with
the machine's numbers and offers the normal log screen. The row lands in
history and the future 8B calendar like any other session, marked as what it
is: a free row, not a workout.

The feature exists because the app currently has no way to row without
choosing a workout, and because the whole stack already has the concept: the
PM5's Just Row is Concept2's own primary unprogrammed mode, their Logbook
API carries `JustRow` as a first-class workout type, and our driver was
built with the no-program case handled and documented as "its own designed
feature" waiting to be designed. This is that design.

## Rulings (James, 2026-08-24, this brainstorm)

1. **Open-ended free row** — no quick-pick targets, no chooser. Tap, pull,
   stop. (Quick targets were offered and declined.)
2. **Connected only this phase** — no phone-timer count-up mode, no manual
   "log a free row after" door. Those wait for demand.
3. **Same table, marked** — a `session_logs` row, not a separate record
   type. History and the 8B calendar see it for free.
4. **Entry on Today, always** — visible with or without a baseline; when
   baselines are unset it also joins the doors card as a fourth quiet door.
5. **End = Done in the app OR backing out on the erg** — the rower owns the
   decision on either surface; the app never guesses with an invented idle
   threshold. (Link drop from the monitor's own power-off chain is the
   third, passive closer.)
6. **Approach A** — a lean parallel observer path; the programmed-session
   stack (`useMonitorSession`, `ConnectedSurface`) is not touched. Chosen
   explicitly for parallel-safety against Phase RC's in-flight wave.

## Does the system have the concept? (the mandatory question)

**Yes, at every layer — we invent nothing.**

- **PM5:** Just Row is the monitor's native unprogrammed mode. It starts
  when the rower pulls, is announced on the wire (workout type 0/1), and
  ends only by Terminate (Menu) or the inactivity chain. PRIMARY.
- **Concept2 Logbook API:** `workout_type: "JustRow"` is a first-class enum
  member (`unknown, JustRow, FixedDistanceSplits, …, VariableIntervalUndefinedRest`).
  A Just Row result is an ordinary record: `distance` and `time` both
  required, no title field (the name derives from the type), splits carried
  in the same array as any piece. Rest does not exist for JustRow — the
  interval-only `rest_distance`/`rest_time` fields don't apply, so its
  numbers are the whole piece. The PM even files an early-terminated
  fixed-distance workout as a Just Row. PRIMARY —
  <https://log.concept2.com/developers/documentation/>.
- **Our driver:** frames flow before any `program()` (all status/summary
  characteristics subscribed at construction); `ANONYMOUS_RUN`
  (`useMonitorSession.ts`) documents `workoutId: null` as "a real,
  supported state"; the series recorder explicitly handles "a driver with
  no armed program, a JustRow"; and `driver.ts:920-926` names a
  JustRow-follow mode as its own designed feature, not a state inference.
  SECONDARY (our source).

## Research findings (tagged; full trail in the brainstorm session)

### Wire facts

- **Mode announcement:** BLE General Status 0x0031 byte 6 carries
  `OBJ_WORKOUTTYPE_T`: `JUSTROW_NOSPLITS = 0`, `JUSTROW_SPLITS = 1`,
  programmed types 2–8+. PRIMARY (Concept2 PM CSAFE spec Appendix A). Our
  driver already decodes it (`app/domain/monitor/pm5/parse.ts:130`).
  SECONDARY.
- **The menu ambiguity:** the idle main menu also reads type 0, and an
  empty arm reads type 1 with `durationRaw=0 durationType=128` (sessions
  4a/4b, trace-verified). SECONDARY. So "menu" vs "about to Just Row" is
  **indistinguishable before the first stroke** — the surface waits for
  motion (`rowingActive` + state WORKOUTROW), which fits the product flow.
  "Live Just Row" = workoutType 0/1 + WORKOUTROW + rowingActive is an
  INFERENCE from the above, never yet captured as such (PR 0 closes it).
- **End states:** Appendix E (PRIMARY): for JustRow the only sequence is
  `WaitToBegin → WorkoutRow → Terminate → Rearm → WaitToBegin`. **JustRow
  never reaches WORKOUTEND/WORKOUTLOGGED** — those are for defined-end
  workouts. So "rower backed out on the erg" is the WORKOUTROW→TERMINATE
  transition, on the wire, documented.
- **Idle chain:** 6 s of inactivity in-use → Paused (public-CSAFE slave
  state); 220 s paused → Finished; the monitor then powers off ("a couple
  of minutes… count starts once the flywheel stops"). PRIMARY (spec Table
  16 + concept2.com). Power-off drops the BLE link — INFERENCE (no doc
  states the BLE-side effect).
- **Auto-start:** the PM turns on and Just Row begins when the rower pulls.
  PRIMARY (concept2.com how-to-use). Connect-then-pull is therefore the
  happy path. Whether pulling from the main-menu screen (monitor already
  on) auto-enters Just Row is INFERENCE — a 10-second hardware check in
  PR 0.
- **Persistence thresholds:** the PM saves a Just Row ≥1 minute or ≥100 m;
  max 50,000 m; auto-splits stored at 5 min (→10 min past 35:00, →20 min
  past 70:00). PRIMARY (concept2.com).
- **Summary frames:** 0x0039/0x003A end-of-workout summary is documented
  (PRIMARY, BLE doc rev 1.30) but has appeared in **zero** of our five
  captured natural finishes, and the ecosystem reports these frames can be
  dropped outright (SECONDARY, `docs/monitor/pm5-ble-ecosystem-review.md`).
  **The design must not depend on 0x0039.** The last live frame is the
  record; 0x0039 is an opportunistic cross-check only.

### OPEN — closed by PR 0's instrumented capture, before recording code ships

1. Do the 5-minute auto-splits fire live on 0x0037/0x0038 during a Just
   Row, or are they storage-only? (Row past 5:00 with those subscribed —
   the walk row `state-architecture-review.md` already proposed.)
2. Does the 0x0031 elapsed clock tick or hold through the 6 s → Paused
   coast window, and what does workoutState read when the 220 s timeout
   fires? (Deliberate 30 s+ stop; leave one row to time out.)
3. Does a Menu-end (Terminate) emit 0x0039? (End one row via Menu,
   stay connected ≥90 s after.)
4. Does pulling from the main menu auto-enter Just Row with the app
   already connected?

**No genuine unprogrammed Just Row capture exists today** — every session
in `docs/monitor/sessions/` is a programmed workout. PR 0's capture is both
the evidence and the permanent replay fixture.

## Design

### Entry (Today)

- A persistent, low-key **Just Row** row on Today — always visible,
  regardless of baseline state. Connected-only: the row says so plainly
  (e.g. "Just Row · connect and pull").
- When `baselines === null`, the doors card gains a fourth quiet door with
  the same destination. This delivers the "nobody is ever blocked from
  just rowing" half of the row-without-a-baseline follow-on; the
  every-workout-targetless half stays a follow-on (cross-referenced in
  ROADMAP).
- Both navigate to `/justrow`. No baseline gate anywhere on the path.

### Live surface (`/justrow`)

New lean `JustRowSurface` — approach A, sharing the transport
(`adapters/monitorTransport.ts`), driver, and 1 Hz series recorder;
touching neither `ConnectedSurface` nor `useMonitorSession`.

States:

1. **Connecting** — existing connect affordances/error patterns.
2. **Ready — "pull to begin"** — connected, waiting for motion (the menu
   ambiguity makes this the honest state; no fake "armed").
3. **Live** — elapsed, distance, current pace, SPM from 0x0031/0x0032;
   the same field-trust rules as the programmed surface. A visible
   **Done** control (44 px, WCAG AA, per design reference).
4. **Ended** — terminal summary of last live numbers with **Log it**
   (→ log flow) and discard.

The session layer is a slim `useJustRowSession` hook: connect, frame
subscription, live-detection (workoutType 0/1 + WORKOUTROW +
rowingActive), Terminate watch, series recording, close.

### End semantics (three closers, all honest)

| Closer | Signal | `ended_by` |
| --- | --- | --- |
| Done tap in the app | UI event | `rower` |
| Menu/back on the erg | WORKOUTROW → TERMINATE on 0x0031 | `rower` |
| Walk-away | link drop after the PM's 6 s → 220 s → power-off chain | `link-lost` |

All three keep the last live frame's numbers as the record. If PR 0 shows
Menu-end emits 0x0039, its totals are recorded as a cross-check
(diagnostic, not authority). No invented idle threshold in the app —
the PM's own timeout chain is the passive closer.

A mid-row link drop (or app death) must be recoverable: the session
persists a `MonitorRun` (v2, additive `mode: "justrow"`, `workoutId:
null`) so Today's existing unlogged-run affordance offers "Log it" the
same way it does for programmed runs. The unlogged-run row's navigation
must handle the null-workout case (today it builds
`/library/${run.workoutId}/log`).

### Stored shape (TRIAD — full antagonist pass + PM gate)

One `session_logs` row:

| Column | Value | Note |
| --- | --- | --- |
| `workout_id` | `null` | already nullable end-to-end |
| `workout_title` | `"Just Row"` | display name; column is NOT NULL |
| `workout_type` | `"JustRow"` | Concept2's own enum word; column is plain text; collision-proof against `AN/O2/AT/TR` |
| `steps` | `[]` | server validation gains a branch: empty allowed **iff** `workoutType === "JustRow"`. We store no steps because none existed — record, not projection. Fabricating a synthetic step is rejected. |
| `time_seconds`, `distance_meters`, `avg_split_seconds` | last live frame | both headline numbers stored, matching the Logbook API's both-required rule |
| `work_seconds/meters` | = the whole piece | rest does not exist for JustRow (Logbook-aligned; no TWD mirror trap) |
| `rest_seconds/meters` | `null` | there is no rest concept to report |
| `ended_by` | `rower` / `link-lost` | never `finished` — the PM5 has no WORKOUTEND for JustRow, and our enum's `finished` means the machine's own end. Honest to the wire. |
| `series` | the 1 Hz trace | recorder already handles the no-program stream |
| `plan_key`/`plan_index` | `null` — **pinned by test** | a Just Row never advances a plan; the server-side plan derivation in `stores/logs.ts` must provably skip it |
| `baseline_k2/k6` | as at save (may be null) | unchanged semantics |

Client POST reuses `/api/logs` with the monitor-door fields. The
`workoutId: null` path exists (LogSession's 400-retry and the FK's SET
NULL both produce it today); this phase makes it a first-class producer.

**Version skew:** old clients never render `workoutType: "JustRow"` rows'
type chip — they must degrade to showing the title, not crash. Verify the
existing history renderers against an unknown type string before shipping
PR 1 (if any renderer keys exhaustively on the four types, the fallback
lands in PR 1).

### Consumers

- **History/log screens:** "Just Row · distance · time" with a neutral
  marker where the type chip would be. No `AN/O2/AT/TR` chip — the row is
  not a training-zone workout and does not pretend to be.
- **8B calendar (future):** sees the row like any log, marked done on its
  day — James's all-logs-marked ruling already covers it.
- **Suggestions/streaks/plan:** untouched. A Just Row is not a plan
  session, not a checkpoint, not a pool member.
- **Post-test prompt:** ineligible by construction (title is not a
  designated test title).

### Error handling

- Connect failures: same patterns as the programmed interstitial.
- Programming is never attempted, so the `0x81`-reject class of failures
  cannot occur here.
- If the rower is already mid-Just-Row when the app connects, frames show
  type 0/1 + WORKOUTROW immediately: the surface goes straight to
  **Live** with the machine's accumulated numbers. (The record is the
  machine's whole row, not "since we connected" — state this in the UI
  copy if PR 0 shows it matters.)

## Phase shape

- **PR 0 — the capture walk (hardware, `/hardware-walk`):** one
  instrumented session closing all four OPENs: connect → pull from menu →
  row past 5:00 with 0x0037/38 subscribed → deliberate 30 s stop →
  resume → end via Menu, stay connected ≥90 s (0x0039 watch); second
  short row left to time out (idle chain + link-drop shape). Capture
  lands in `docs/monitor/sessions/` and becomes the replay fixture for
  PR 2's tests. Findings amend this spec before PR 1 merges.
- **PR 1 — stored shape + server (TRIAD):** the `steps`-empty-iff-JustRow
  validation branch, the plan-derivation skip (pinned by test), the
  history renderer fallback for unknown types. Full antagonist pass on
  this spec + PM final-PR gate.
- **PR 2 — surface + session:** `/justrow` route, `JustRowSurface`,
  `useJustRowSession`, MonitorRun v2 `mode`, Today entry + fourth door,
  log flow. Tested against PR 0's capture via the replay harness.
- **Exit walk:** a real Just Row on the erg, both screens in one
  photograph (recurring-failure 11), ended once by Done and once by Menu;
  the logged row checked against the PM5's memory screen — and the
  quantity stated: our stored distance/time vs the PM's own Just Row
  memory entry, which is the same work-only quantity (no rest exists), so
  the oracle is not a mirror here.

## Out of scope (this phase)

- Phone-timer open count-up mode (no engine change).
- Manual "log a free row after" door.
- Quick-pick targets from the Just Row entry.
- Any Concept2 Logbook API sync (findings recorded for the day it comes).
- The every-workout-targetless half of the row-without-a-baseline
  follow-on.
- Split-by-split display of the PM's auto-splits (depends on OPEN 1;
  if they fire live, a follow-on decides whether to store/show them —
  the `series` trace already preserves the shape regardless).
