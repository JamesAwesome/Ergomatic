# Phase JR — Just Row

**Archived 2026-09-10** — closed 2026-09-01 · #246, #255, #259 · released in v0.32.0, follow-ons through v0.35.0.

A rower can start an unprogrammed row, and the app stores, judges and logs it like any other.

**Hardware OPEN 5 answered by James, 2026-09-10: the connected app auto-enters
Just Row.** Three further live findings were lifted into Wave E before this body
was archived — the PM5 not advertising while a Just Row is open, nothing being
observed to close a free row the rower walked away from, and the smaller wire
reconciliations.

---

## Phase JR — Just Row

**Status: CLOSED 2026-09-01 — released v0.32.0 (build 811), exit walk
PASSED, both close gates run; the follow-on slate below is the live
work.** PR 0a instrument + PR 0b capture DONE 2026-08-31 (#246); PR 1
MERGED as #255; PR 2 MERGED as #259 (2026-09-01, 3-round review loop,
accepted with no findings); James relaxed R-A so v0.32.0 tags both PRs
together; notes #260, release-capture reup #261, TestFlight upload
0.32.0 (811) all landed 2026-09-01. The exit walk ran the same evening
on build 811 against prod and PASSED — record at
`docs/monitor/sessions/walk-2026-09-01-jr-exit/`. Its first save failed
because prod was FROZEN at v0.31.0: main's `deploy` job had been red for
eleven hours across six merges (a dirty deploy-host checkout — four
empty shell-redirect droppings), and nobody read main's CI; cleaned,
redeployed, the retry saved. The app held the record and retried
correctly; what it could not do is tell a permanent 400 from a transient
one. Both close gates (antagonist exit pass, PM close) said CLOSE, with
the evidence gaps landed in the close-out PR: the ready screen's keep-on
strip wore a class with zero CSS rules (James found it at the erg — of
ten approved Gate 0 artboards only four had captures of the BUILT
screen; `justrow-ready` is now captured), exit criterion 5 (`ended_by`)
is now asserted on PRODUCED free-row values, criterion 2 on an actual
history list, criterion 7 from one stored row, and two vacuous
`.type-badge` assertions are gone. Still ungated: the app-End arm of
criterion 8 (the replay capture is a Menu end; the walk's Done-ended
row is accepted on James's operator report).

- [x] PR 0a — the observe-only instrument (#246)
- [x] PR 0b — the capture walk (walk-2026-08-31-justrow)
- [x] PR 1 — every stored shape (#255, migration 0019)
- [x] PR 2 — surface + session + log door (#259, released v0.32.0)
- [x] Exit walk — PASSED 2026-09-01 (both endings; Menu-ended row
      digit-identical with the machine-confirmed stamp on a free row)
- [x] Phase close — antagonist exit pass + PM close gate (2026-09-01);
      close-out PR carries the evidence fixes and this slate's shaping
- [x] Ready screen defect — `connected-keep-on` restored, `justrow-ready`
      captured (close-out PR)

**Follow-on slate — shaped at the close (2026-09-01), James's build order:
item 3 first, then item 2 if still wanted once the ready fix is in hand,
then items 4+5 as one TRIAD PR — AMENDED at Gate 0 (James, 2026-09-02:
"it's just missing the JR chip"): item 4 shipped WITH item 3 in #268, so
item 5 ships alone.** The PM's counsel that Wave F's
pocketed-phone row outranks this slate against the north star is on the
record (this would be a second household exception); James chose the
slate.

- **Ready screen should BE the programmed ready view** — walk finding,
  resolved as a DEFECT: the built screen wore `connected-ready-warning`,
  a class with zero CSS rules, where the approved artboard was "the
  shipped interstitial, one word changed". Fixed in the close-out PR by
  using the shipped `connected-keep-on` class. The remaining delta
  between the two ready screens is four lines of copy; look again once
  James has the fix on a phone before unifying components.
- **Connect should put the erg into a Just Row session** — walk finding,
  reframed by the close: an ACKNOWLEDGMENT gap, not a capability gap.
  The 08-31 walk already observed that pulling from the main menu with
  the app connected auto-enters Just Row (OPEN 5, James at the erg).
  The wire frame to drive the screen is Concept2 p.80, transcribed at
  `docs/monitor/pm5-interface-notes.md:204` (`SET_WORKOUTTYPE(0x01)` +
  `SET_SCREENSTATE(PREPARETOROWWORKOUT)`), and `SET_SCREENSTATE` is
  already built and emitted. **No research pass — the earlier line here
  saying one was owed was wrong (RF18).** One driver change plus one walk
  leg; carries RC-38 (`0x01`'s enum row is a doc LABEL, not a transcribed
  `OBJ_WORKOUTTYPE_T` entry). **M**
  **RE-CONFIRMED by James, 2026-09-02 ("i do want item 2"), after using the
  ready fix: build it. Its own PR (wire semantics + a walk leg), after the
  Timer-mode design pass. Ground already in the repo: the 08-31 walk's
  OPEN 5, the p.80 JustRow frame at `docs/monitor/pm5-interface-notes.md:204`,
  RC-38 rides with it.** **IMPLEMENTED (PR #278, 2026-09-02; spec
  `docs/superpowers/specs/2026-09-02-just-row-connect-programs-design.md`
  rev 5, Gate 0 rev 1c): `beginFreeRow()` opens the run, then sends the
  p.80 frame ALONE — no prepare, since a terminate with a run open is the
  row's own END — as a DETACHED send bounded by
  `FREE_ROW_PROGRAM_DEADLINE_MS` (5 s, raised from 3 s by the walk's
  measured write→ack of 1968/2060/1788 ms); its outcome goes to the ring
  (`free-row-program-sent`/`-unanswered`/`-failed`) and nothing on the
  phone branches on it. The earlier cost line here ("gains a reject path
  and an ack gate") was half wrong: there is a reject PATH but no ack
  GATE, because the readback that would verify the program (0x0031
  `workoutType = 1`) is also the PM5's idle-after-terminate default, so
  the erg's own screen is the acknowledgment. The Ready line is James's:
  `The clock starts on your first stroke.` (the shipped `Nothing is
  programmed…` line became false and is gone). Gates: `commands.test.ts`
  pins the frame literal; `driver.test.ts` the ring order, the no-prepare
  literal, NAK, the terminate-waits ordering and deadline paths;
  `justRowReplay.test.ts` the
  unanswered send over the 08-31 capture; `e2e/justrow.spec.ts` reads
  `free-row-program-sent` off the diagnostics door's copied ring.
  **WALK RUN 2026-09-03** (`docs/monitor/sessions/walk-2026-09-03-jr-connect/`,
  three sessions with the control): the frame DOES drive the erg —
  `workoutType` 0 at the virgin menu, ack at 1.97 s, type 1 89 ms later,
  and the PM5's own Just Row screen photographed. It also found the
  defect James saw: **Cancel on the Ready screen left the erg in the Just
  Row session.** ONE cause was observed — `cancel()` excluded
  `mode === "justrow"` from its terminate on the now-false ground that "a
  free row armed nothing". Two more paths to the same stranded monitor were
  found by reading, NOT on the erg, and are fixed as hardening: the
  driver's `terminate()` refusal while the send holds the ack slot (never
  entered on the walk — ring 3's Cancel ran 1589 ms after the ack), and a
  teardown hang-up overtaking the terminate that refusal fix introduced
  (~186 ms of margin, from ring 1's own END timings). FIXED in this PR:
  both exclusions go, `terminate()` WAITS OUT the free-row send instead of
  refusing it (bounded by the deadline above), and `disconnect()` holds the
  hang-up while a terminate still owes its write. RC-38's disposition is
  under Phase PROTO.**
- **Tester request: an UNCONNECTED "Just Row" mode** — no erg link, an
  infinite timer and the ability to log. **IN PROGRESS (2026-09-02):
  James ruled TIME ONLY; Gate 0 PASSED on rev 2e
  (`docs/design/handoffs/2026-09-02-just-row-unconnected/`, every label
  lifted from a captured shipped screen); spec at
  `docs/superpowers/specs/2026-09-02-just-row-unconnected-design.md`,
  antagonist delta pass RAN (BLOCK on rev 1's mechanism, folded), James
  hardened it twice → spec rev 5.1; IMPLEMENTING on branch
  `jr-unconnected`; ships in ONE PR with the JR chip below, TRIAD: `mode`
  required on `SessionRun`, a `stopwatch-elapsed` `PhaseActual` variant,
  and `session_logs.source` (pm5 | timer | manual, NOT NULL, backfilled
  by migration 0020 — every log door now writes which door the row came
  in by; the client's provenance inference is deleted).** The close found
  most of it built: `Step`'s `{ k: "test" }` member yields a phase with no seconds
  and no metres, `Timer.tsx` counts UP for exactly that case
  (`Timer.test.tsx` pins it), and `SessionRun` with `workoutId: null`
  stores it with no `v` bump — **no new stored shape**; PR 1's server row
  takes it as-is. So: a producer, a route, a door. The one ruling that was
  James's — type the distance off the monitor, or time only? — is RULED:
  **time only** (2026-09-02); no distance is typed or invented. The only
  item with an outside voice; built first. **S/M**
- **"JR" badge on Just Row sessions**, in the manner of the other type
  chips (James, 2026-09-01 — supersedes the shipped "no type chip on
  purpose" stance). **DESIGNED 2026-09-02 on the unconnected board
  above: a HOLLOW chip (the CUSTOM tag's treatment, `.free-row-chip`,
  never `.type-badge`) — a filled ink chip was literally `--type-tr`,
  ink-3 "still a bit close"; rides the unconnected PR.** **A DERIVED
  display concern, never stored:**
  `isFreeRow(workoutId, workoutType)` is load-bearing three times (the
  server's plan opt-in default — once a refusal, until item 5 — its
  empty-`steps` allowance, the absent badge),
  so `"JR"` can never live in `workout_type`. Visual precedent exists —
  `.workout-row-custom`, the ink-outline metadata chip — since
  `TypeBadge.tsx` refuses to mint a fifth intensity colour. SHIPPED in
  #268 with item 3 (hollow `.free-row-chip` on the door and every free
  row in History/Today), so item 5's plan-linked free row will already
  carry it. **S**
- **Logging a Just Row against a plan — as SUBSTITUTION** — **SHIPPED in
  #272 (2026-09-02):** Gate 0 PASSED rev 1d
  (`docs/design/handoffs/2026-09-02-just-row-substitution/`), spec rev 3
  after two antagonist passes
  (`docs/superpowers/specs/2026-09-02-just-row-substitution-design.md`),
  PM TRIAD gate SHIP-WITH-CONDITIONS (all landed in the PR). No new
  stored shape: the link is the stand-in record; the store resolves
  `advancesPlan ?? !isFreeRow`. Deleting a stood-in Just Row un-ticks the
  session (stated, not overruled; the shipped delete copy already warns,
  keyed on `planKey`). The original row follows:
- **(original)** Logging a Just Row against a plan — as SUBSTITUTION (James,
  2026-09-01: "advances the record, records the stand-in"): the rower
  may say "this free row stands in for session N"; it advances the plan
  AND the row records that it stood in. Default stays off-plan. **TRIAD**
  — it changes what SESSION n OF 84 means and amends the unconnected
  spec's frozen exit criterion 2 (`done_n` unchanged across a Just Row
  save) with its own gate, retiring its criterion 1's `Save this row`
  pin; the Gate 0 centring rule also moves every swapped plan row's
  badge (stated in the handoff README); it removes the server's ONLY free-row plan enforcement
  (`logs.ts`'s `!isFreeRow(...)`), so the substitution must be an
  explicit stored fact the server checks, not a client promise; and the
  reversing release note must acknowledge v0.32.0's "A Just Row never
  advances your plan" or the News tab contradicts itself. Ships ALONE
  (the badge went with item 3 in #268). **S code / L ruling**
- **Fidelity note, from the walk:** the app ROUNDS 93.7 s to `1:34` where
  the PM5 truncates to `1:33` — one quantity, four renderings across the
  two screens. For a phase whose promise is "the machine's own numbers
  land in your log", showing a figure the erg never displays deserves a
  line at the next design pass. **XS**
- [x] **`source` derive-when-absent SUNSET — DONE in the v0.35.0 PR
      (2026-09-02); trigger was v0.35.0, the tag
      AFTER the one that ships #268 (v0.34.0, shipped 2026-09-02). NOT
      v0.34.0: firing it on the tag that introduces the field 400s every
      save from every build still installed. DELIBERATE CO-TAG (#272's PM
      gate): v0.35.0 also carries the substitution feature (#272); the
      sunset lands as its own XS PR BEFORE the v0.35.0 tag is cut, so the
      tag carries both on purpose — builds ≤811 (v0.32.0) lose saves at
      that tag, build 823+ already posts `source`.** The server derives `source`
      for a POST that omits it only so build 811-era TestFlight clients
      keep saving (additive-only between tags). At that tag: `source`
      becomes REQUIRED on `POST /api/logs` (400 when absent), the route's
      `deriveLogSource` call and its `source=derived` log line are
      deleted, and `docs/RELEASING.md`'s API note records the break. The
      0020 BACKFILL rule stays (it is history, not a live inference).
      Filed here per RF14 and the spec's exit criterion 8b. **XS**
- [x] **v0.35.0's release notes must RETIRE "A Just Row never advances
      your plan" (v0.32.0).** **DONE — shipped in `releaseNotes.ts:18`
      (v0.35.0 entry): "v0.32.0 said a Just Row never advances your plan;
      now it can, when you say so, and never otherwise."** Ticked at door
      PR A's PM gate, which found the row discharged and unticked. Filed at
      the substitution spec (RF14). **XS**
- [x] **v0.34.0's release notes must RETIRE two things v0.32.0's notes
      told testers.** **DONE — both shipped in the v0.34.0 entry:
      `releaseNotes.ts:39` ("v0.32.0 said connect to the erg; that is now
      one of two ways in") and `:40` ("v0.32.0 said no type chip, on
      purpose; in practice the row was too easy to lose in History, so it
      has one now").** Ticked at door PR A's PM gate, which found the row
      discharged and unticked. Filed at #268's PM gate (RF14). **XS**
- [x] **Timer mode, on the phone — DONE in this PR (2026-09-02; spec
      `docs/superpowers/specs/2026-09-02-timer-mode-design.md`, Gate 0
      `docs/design/handoffs/2026-09-02-timer-mode/`). One END box in both
      orientations; portrait's ◀ ▶ row sits under Pause; landscape's grid
      fills the frame (the band was the min-height formula and the shell's
      reserved tab-bar strip, not the rows — row 4 was already `1fr`).**
      (James, 2026-09-02, build 823, on a
      Just Row): "really fucked up". Two defects, both the SHIPPED
      Timer's own — the free row copied it mechanically and made them
      visible on a one-phase screen. (1) **END does not match between
      orientations:** portrait prints `END →` as plain header text (ink-4,
      no box); landscape prints it as an accent-outlined 44 px box in the
      gutter — two treatments of one control. (2) **A giant gap:** in
      portrait the ◀ ▶ arrows are pinned to the bottom with the middle
      third empty; in landscape the whole layout stops at ~70 % of the
      height and the rest is blank (the landscape rules were written for a
      390 px-tall viewport and the phone is taller). Captures:
      `docs/design/findings/2026-09-02-timer-mode-{portrait,landscape}.png`.
      A design pass with a Gate 0 (both orientations, the programmed and
      the free-row timer side by side, since the fix is for both), then a
      fast-path or small PR. **S**
- [x] **Free-row copy, three notes — DONE in this PR (2026-09-02, with
      the Timer-mode pass; rulings 3-5 of the same spec): the band reads
      `Start a free row session.`, a time-only History row prints
      `TIME m:ss`, and the no-plan button reads `Save` on both doors.**
      Three notes for ONE design pass (batched, not one
      per gate — #268's and #272's PM gates): (1) the Just Row door's
      paragraph ("The monitor keeps its own time…") now captions two
      buttons and describes one; (2) a time-only row's History line shows
      no number until opened; (3) with no plan the Just Row log door's only
      button reads `Save without logging` (was `Save this row`) — consistent
      with the shipped summary door, and a stranger meets a button that
      names what it does NOT do, now on two screens. Rides the Timer-mode
      design pass above. **XS–S**

**Owed within PR 2's own scope, recorded here so phase close can quote
it:** a free row recovered with a `truncated` series trace (>4 h of rowing,
no 0x0039) reports its numbers UNAVAILABLE rather than posting the cap as
the row's end — the honest refusal, not a fixed bound; if a >4 h free row
ever matters, the fix is persisting the latest cumulative frame, which is a
stored-shape change. And `PULL TO RESUME` is reachable on a free row's
frozen clock and appears on none of the Gate 0 artboards — literally true
for a Just Row (the PM5's clock does resume on the next pull) but
undesigned; noted in the handoff README.

This is a deliberate household exception to the stranger-first
ordering, requested by James on 2026-08-31. Walk record and full decodes:
`docs/monitor/sessions/walk-2026-08-31-justrow/README.md`; runsheet at
`docs/monitor/sessions/walk-phase-jr-capture/RUNSHEET.md`.

**The headline is good: 0x0031's elapsed and distance do NOT reset at the
5-minute auto-split**, so a long free row stores as its true length and PR 2's
two headline numbers are safe. **Two capture findings re-open design,
though, and they must be settled before PR 1 tags its enum** (both are
written up in the spec's own CLOSED section):

- **The PM5 does not advertise while a Just Row is open**, so a generic scan
  cannot discover it mid-row. The spec's "already mid-Just-Row at connect"
  path remains struck. Deferred Correct Resume research considers a retained
  same-device route after a proven drop, not a scan. That capability is not
  shipped or scheduled; today the rower can End and log what the app has.
- **Nothing was observed closing a free row the rower walked away from** — the workout stayed
  active for 896.8 s after the rower stopped, with frames still arriving and
  no auto-terminate — a BOUNDED observation, since the operator ended the
  capture rather than the monitor. Documentation neither confirms nor denies
  a closer: CSAFE Appendix E's JustRow sentence is CONDITIONAL ("that is
  terminated…") and describes the sequence AFTER a terminate, so it does not
  enumerate exits, and Concept2's PM5 guide says the monitor powers down
  after inactivity with no Bluetooth qualification. The proposed
  `ended_by: "idle"` member is withdrawn PERMANENTLY. **Rulings 8 and 9
  (2026-09-01) settle it together**: assume the machine never closes a
  connected row, and decline to close it ourselves either — a Just Row nobody
  ends runs until the phone sleeps, the app dies, the rower leaves range or
  the battery goes. That needs no new mechanism, because a link drop already
  leaves a recoverable `MonitorRun` that Today offers and
  `completeInterruptedRun` stamps `"interrupted"` — a value whose documented
  meaning, "closed later with no evidence", is exactly what we know. **The
  accepted cost is battery, not storage**: idle adds ~one series sample
  (measured — 890 frozen-clock frames collapsed into one), but the BLE link
  and wake lock stay up until something else ends them.
  (The old "6 s → 220 s → power off" chain turned out to be
  three different layers; the timeouts are CSAFE slave-state ones that never
  governed an unprogrammed row in either connection state.)

Smaller reconciliations owed: `domain/monitor/pm5/uuids.ts` says 0x003F "has
never been recorded" and one now has been; status frames arrive at 1.00/s, not
the ~2.2/s the tooling assumes; and the observer heading renders
`PM5 432331249 Row connected` because the advertised BLE name already ends in
"Row".

**Honest distance: three to five weeks of working sessions.** Waves D and B
ship a tester nothing, so they release alongside C rather than alone — two
consecutive empty release notes is how the invisible-but-necessary wave gets
skipped.

**SLATE COMPLETE 2026-09-03.** All twelve items above are ticked; item 2
(#278) was the last, and its walk found the connect latency that #283 then
fixed.

- [x] **Connect programs the erg sooner, and the free row waits for it
      (#283, 2026-09-03).** Not a slate item: item 2's walk exposed it.
      Every connect this app has ever made waited ~1.7-2.1 s between our
      first CSAFE write and the PM5's ack, because `createPm5Driver`
      enqueued ten native calls before the program write on the plugin's
      single FIFO queue. The driver now defers its status subscriptions
      until the first non-prepare sequence is acked. **Walked 2026-09-03**
      (`docs/monitor/sessions/walk-2026-09-03-connect-sooner/`): free row
      202 ms, programmed workout's erg screen 1799 ms against a prior
      2700-2969 ms. Part 2 in the same PR: the free row waits for the
      monitor like a workout does, with the Gate 0 "Starting your row"
      card. **Spec** `docs/superpowers/specs/2026-09-03-connect-programs-sooner-design.md`.

---
