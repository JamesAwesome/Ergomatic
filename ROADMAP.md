# Ergomatic Roadmap

Ergomatic is a mobile-first tracker and planner for indoor rowing (erg) workouts,
built around The Erg Book model: a library of numbered workouts whose targets are
expressed as offsets from the rower's 2k and 6k baseline splits (e.g. `6k -2` =
2 s/500 m faster than 6k pace). The app resolves offsets against current baselines
whenever a workout is opened, walks the rower through it with a live timer, and
freezes the resolved splits into the log at save time so history stays truthful as
fitness improves.

The authoritative UI/UX reference is the design handoff in `docs/design/`
(high fidelity — colors, type, spacing, 44 px hit targets, and WCAG AA are final).

## How this file is used

**Rebalanced 2026-08-28.** This file was 7,868 lines across 54 phase sections,
and 40 of those sections described finished work. It is now forward-looking
only. The contract:

- **A phase that closes leaves.** Its body moves verbatim to `docs/history/`
  and it becomes one ledger row under "Completed phases" below. The row is the
  only thing about a closed phase that lives here.
- **Open items never live in a closed body.** Before a phase is archived, every
  unchecked item is lifted into the live slate or the open-item register, with
  its evidence. This is not bookkeeping: at the rebalance, 40 of 90 open items
  were sitting inside phases whose headers said CLOSED, and archiving without
  lifting them would have deleted them.
- **Corrections are APPLIED, not appended.** The old file's dominant rot was a
  claim, then `CORRECTED`, then `CORRECTION to the correction`, all three
  printed. Fix the sentence. The reasoning trail belongs in `docs/history/` and
  in the PR that changed it.
- **One home per body of work.** At the rebalance the Concept2 logbook had four
  homes and Apple sign-in had two. If an item belongs to a wave, it is only in
  that wave.
- **A status line is the ledger row.** No section carries a second one. The old
  file had six phases headed OPEN or IN FLIGHT for work that had closed and
  tagged, one of them eleven days stale, because the status line and the
  section that contradicted it were hundreds of lines apart.

Each wave gets its own design/plan cycle (spec in `docs/superpowers/specs/`,
plan in `docs/superpowers/plans/`) when it starts.

## Locked decisions

| Area              | Decision                                                                                                                                                                                                                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name              | **Ergomatic** in UI and docs (design files say "Erg Log")                                                                                                                                                                                                                                                 |
| Architecture      | Server-backed SPA: React 19 + Vite 8 client, Express 5 API, TypeScript, ESM, pnpm                                                                                                                                                                                                                         |
| Data              | PostgreSQL 18 + Drizzle ORM; per-user data throughout                                                                                                                                                                                                                                                     |
| Offline           | Active session state persists locally when the durable write succeeds; a rejected connected hand-off write keeps the measured row in memory while the process lives. Reload after a rejected write and later WebKit/localStorage eviction are instrumented, accepted residuals; no surface may pretend either was durable. Log save syncs to the API. |
| Auth              | Google OAuth (authorization code flow) only at launch; self-hosted cookie sessions in Postgres; no auth SaaS. **Sign-up is deny-by-default against `ALLOWED_EMAILS` — Wave A changes this, and it is the single largest gap between this app and a stranger using it**                                    |
| Deployment        | Full CD: push to main → self-hosted runner → SSH deploy script → health-gated auto-rollback (nataliesawacritter pattern)                                                                                                                                                                                  |
| Hosting           | Docker Compose (hardened: read_only, cap_drop ALL, non-root) fronted by a Cloudflare tunnel behind a compose profile                                                                                                                                                                                      |
| Local enforcement | husky + lint-staged — pre-commit: staged format/lint, then whole-project typecheck, fail-fast; pre-push: unit + client tests (fast, Docker-free)                                                                                                                                                          |
| CI                | GitHub Actions: `changes` → `root-hooks`, `app`, `docker`, `e2e`, `scripts`, `deploy`. `changes` decides whether the code jobs run at all — documentation-only pushes skip `app`, `docker` and `e2e`                                                                                                      |
| Tests             | Vitest three-project setup: unit (node), client (jsdom + Testing Library), integration (Testcontainers Postgres); enforced coverage thresholds                                                                                                                                                            |
| Time display      | House time format is elastic positional: seconds always shown, an hour group only when nonzero, the leading group never zero-padded — `0:45`, `20:00`, `1:05:00` (`domain/duration.ts`, Phase 5F). Totals stay unit-labelled (`302 MIN`, `302′`), which is what keeps a colon value's meaning unambiguous |

Reference codebases for conventions: `nataliesawacritter.info` (primary template),
`pool_monitor` (design-token CSS approach).

### Standing rule: verify current versions

At the start of every wave that adds or upgrades a language, runtime, or library,
**verify the latest stable version from the authoritative source** (npm registry,
endoflife.date, the project's release page) before pinning anything. Never trust
version numbers from model training data, old blog posts, or the reference repos —
they go stale (this has burned us before). Concretely:

- `npm view <pkg> version` / release notes for every dependency being added
- Current LTS/stable for Node, pnpm, Postgres, and Docker base images
- Version numbers in this file (e.g. "React 19", "Postgres 18") are what was
  current at writing — re-verify at install time, do not copy them blindly

### Standing rule: serving topology

- Serving topology (2026-07-29 investigation): web and API are split into
  nginx + Express containers; the API has no host port and is reachable
  only through nginx. Keeping the single React codebase was deliberate —
  dropping web or rewriting in Swift was evaluated and rejected (harness
  loss / domain-layer duplication). Revisit the topology only if web and
  API release cadences diverge. iOS resolves Capacitor via SPM (verified
  2026-07-29; Cocoapods sunset 2026-12-02 does not affect us).

---

# The live slate

**North star, set by James 2026-08-28: a stranger can use this.** Every wave
below is ranked by whether it unblocks handing the app to someone outside the
household. **Target distribution: EXTERNAL TESTFLIGHT** — not the App Store.
The store surface is real work and it is not this slate's business.

**What the rebalance found, and why the slate is shaped this way.** Phase PROD
was titled "the last phase before strangers" and its eleven items are a
submission checklist. Four things a stranger actually needs were on no roadmap
in any form: an open front door, in-app account deletion, a database backup,
and any signal at all when a stranger's app breaks. A phase named for an
outcome is not evidence the outcome is covered.

**The order, and why it is not strict north-star ranking.** Wave F shipped
before the front door on purpose and closed on 2026-09-04. Preserving received
work and making incomplete capture visible came before opening to strangers;
same-row Bluetooth reattachment remains in the Icebox, not a front-door gate.

## Active audit overlay — Codebase integrity

**Status:** COMPLETE. Read-only overlay; it was not a seventh product wave.
The fixed-baseline audit is governed by the
[approved spec](docs/superpowers/specs/2026-08-28-codebase-integrity-audit-design.md)
and [execution plan](docs/superpowers/plans/2026-08-28-codebase-integrity-audit.md).

- [x] Complete all five audit lanes with an evidence-backed disposition.
- [x] Revalidate promoted findings against current `main` and assign each fix
      exactly one live ROADMAP owner before handoff; the audit report is not a
      second backlog.

The phase-close gate transferred actionable items into Wave F, Wave A, and the
open-item register below. P3 and unsupported-trigger results stay in the risk
register or ride the next relevant PR; no unchecked work lives in this overlay.

| Wave  | What it is                  | Size | Tester sees                                 |
| ----- | --------------------------- | ---- | ------------------------------------------- |
| **A** | The front door              | L    | Yes, immediately                            |
| **D** | The toolbox                 | M    | Nothing                                     |
| **B** | Backups and telemetry       | M    | Nothing                                     |
| **C** | The submission surface      | L    | The most visible wave                       |
| **E** | The Concept2 logbook        | L    | After PR2 ships the send surface            |

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


## Wave A — The front door

**Status:** Next in the slate; Wave F closed 2026-09-04. Not opened by that
closeout. **TRIAD** (auth). **L.**

**Goal:** someone you have never met installs the build, gets an account, rows,
and can delete everything from inside the app.

**The gap, proven.** `server/auth/signin.ts:33` returns `outcome: "denied"` for
any address off the allowlist; `auth/routes.ts:87` redirects to
`/?denied=<email>`; `SignIn.tsx:6` renders the dead end. `server/index.ts:87`
warns that an empty `ALLOWED_EMAILS` means "nobody can create an account". The
2026-07-27 auth spec states the policy deliberately: _"missing/empty var =
nobody can sign up (deny by default)."_ PROD's old exit promised "a real
sign-in path for a rower with no Google account" — that is Apple sign-in, and
it lands the stranger on this same denial.

- [ ] **Audit AUD-014 — native sign-out always attempts the Keychain wipe.**
      A rejected revocation request currently leaves the bearer available for
      later reuse. Server revocation remains best-effort, but local deletion is
      independently required and deletion failure remains visible. AUTH triad;
      full antagonist spec pass and PM final-PR gate. **P2, Confirmed. S**

- [ ] **Establish what external TestFlight actually binds, with verbatim
      quotes, BEFORE anything else in this wave is specced.** The rebalance
      inherited two claims it could not source: that Beta App Review triggers
      guideline 4.8 (Sign in with Apple) and 5.1.1(v) (in-app account
      deletion). **Both are load-bearing and both are currently INFERENCE.**
      Quote Apple's current wording beside each claim and name the attribute
      the argument needs — required or recommended, App Store or all
      distribution (recurring failure 16's second corollary). **If Beta App
      Review binds neither, this wave shrinks to the front door alone.** **S**
- [ ] **An open sign-up policy, replacing deny-by-default.** What replaces the
      allowlist is the design question: open, invite-code, or a waitlist. The
      denied-user surface stops being a dead end either way. **AUTH — full
      antagonist pass on the spec plus a PM final-PR gate.** **M**
- [ ] **In-app account deletion.** No DELETE-user route and no UI exist
      anywhere (checked across `app/server` and `app/src`: baselines reset and
      logs delete, but nothing removes a user). The spec enumerates exactly
      what is removed and what survives — note `session_logs.workout_id` is
      `onDelete: "set null"` while eight other FKs cascade. **M**
- [ ] **Apple sign-in** (moved from Phase PROD; the duplicate entry that lived
      under triggered follow-ons is deleted). Works with the existing
      openid-client stack (ES256 client secret, form_post callback, name and
      email on first auth ONLY — Apple sends them once and never again).
      **Design the private-relay story with the sign-up policy above, not after
      it:** an allowlist cannot match a relay address the rower has never seen,
      which is why these are one wave and not two. **L**
- [ ] **Door 2 can Save mid-entry and ship the clamped partial** (from Phase
      BL). Type "1", tap Save, and 60 s rides the wire. The You editor's
      identical path is announced by its ConfirmLine; door 2 has no confirm.
      `src/onboarding/KnowBaseline.tsx:52`. Rides this wave because it is a
      sign-in-adjacent onboarding screen. **S**

**Exit:** a stranger installs from TestFlight, signs in with Apple or Google,
gets an empty working account, rows a row, and deletes the account and all of
its data from inside the app.

---

## Wave D — The toolbox

**Status:** After A; **releases with Wave C**, never alone. **M.**
**Ships a tester nothing** — but two items are Wave C dependencies: simulator
coverage and native-fake reachability for connected surfaces.

**Goal:** the instruments Wave C's audit needs, and the standing traps retired
while we are in here.

- [ ] **Stand the iOS simulator up as a standing instrument.** James,
      2026-08-20: _"make sure to consider the iOS simulator."_ It is used
      nowhere — `grep -ri simulator` across the repo returns only the fake
      transport's own prose. **Wave C's accessibility audit depends on this:**
      real Dynamic Type, VoiceOver and Reduce Motion cannot be produced by
      desktop Chrome. Carries a corrected mechanism note worth keeping —
      safe-area insets DO transfer to Safari-in-simulator (webkit.org/blog/7929,
      PRIMARY), but the height model does not, because Safari's chrome collapses
      on scroll, so Safari-in-simulator is **never authoritative for a `100dvh`
      question**. **S**
- [ ] **Let a build flag reach the fake transport on NATIVE.** One line in
      `src/adapters/monitorTransport.ts`. Today `isNative()` sends the simulator
      down the Capacitor arm, `initialize()` rejects `BLE unsupported`, and the
      armed screen is unreachable (`capacitorBle.ts:138-145`; Apple TN2295 — the
      Simulator has no Bluetooth). **This is the same defect recurring failure
      13 records**, so fixing it retires a standing trap rather than adding a
      feature. Dev and debug builds only, proven absent from the production
      bundle by `dist-grep.sh` in both directions per recurring failure 12. **S**
- [x] **Pre-Wave-D enabling slice — the lint/type ratchet and `e2e/`
      typecheck.** James explicitly pulled this one slice forward on
      2026-08-29. Every linted TS/TSX file now has typed project ownership,
      `pnpm typecheck` covers `e2e/`, the selected typed rules use a
      prune-aware no-growth ceiling, and pre-commit is fail-fast. This did
      **not** open Wave D, advance its other work, or alter D's release-with-C
      sequencing. Detailed contract and proof:
      `docs/superpowers/specs/2026-08-29-lint-type-ratchet-design.md`. **M**
- [ ] **Finish the ordered type-hardening follow-on.** Clear and globally
      enable `exactOptionalPropertyTypes`, then `noUncheckedIndexedAccess`,
      then validate unsafe server-test response bodies before reconsidering
      the four unsafe-`any` rules there. Do not queue
      `noPropertyAccessFromIndexSignature` without a real failure class; its
      current volume is mostly access style. **M**
- [ ] **Hunt the e2e flakes.** James, 2026-08-20: _"post release lets hunt down
      the flake."_ Its trigger ("immediately after v0.15.0 ships") fired
      2026-08-20. Two named flakes remain unresolved: the manual-door
      tap-target flake (399/401, then 401/401 twice) and `design.spec.ts`'s
      `stableBoundingBox` flake (`e2e/helpers.ts:89`). #152 landed evidence
      capture for a _third_ flake and produced
      `docs/superpowers/research/2026-08-22-e2e-readiness-gate-flake.md`. **M**
- [ ] **A THIRD flake class: integration, under container contention.**
      `server/routes/isolation.integration.test.ts` failed once with
      `expected 401 to be 400` on 2026-09-01, and a second run of the same
      full sweep failed a different test
      (`server/routes/data.test.ts`'s baseline-delete case) instead. Neither
      reproduced: the unit project passed 3/3 alone, integration 301/301
      alone. It appears only when `--project unit --project client --project
      integration` run together and several Postgres containers start at
      once, so the working theory is resource starvation rather than test
      pollution — but nothing has been measured and the auth-boundary
      symptom (401 where a 400 was expected) deserves better than a shrug.
      Distinct from the e2e flakes above and from the two unit-project ones
      further down; filed at the PM gate on #255 rather than left in a PR
      comment (recurring failure 14). CI runs the projects separately and
      has stayed green throughout. **S**
- [ ] **Settle the mutation-testing gate, one way or the other.**
      `docs/TESTING.md` explicitly demoted the full `pnpm mutate` run from an
      unrun phase gate to an on-demand probe; its only baseline is still
      2026-07-29 and covers 7 domain modules against today's 29. Either make
      a current full run a real enforced gate with an owned cadence, or keep
      it on-demand and retire the stale baseline as evidence. **S/M**
- [ ] **The 23 dangling `.superpowers/` citations across 14 tracked files.**
      That directory is git-excluded and unreachable to anyone but the session
      that wrote it. _"A dangling citation is worse than no citation, because it
      reads as evidence."_ Affected: `app/src/monitor/driver.test.ts`,
      `docs/monitor/pm5-interface-notes.md`, and twelve files under
      `docs/superpowers/` (seven plans, four specs, one research note).
      **Do NOT create `docs/superpowers/sdd/` to make the paths resolve.** **S**
      **Counted 2026-09-04, not carried** — the citation count was right and
      the FILE count read 11 and was wrong:
      `git grep -ln "\.superpowers/[A-Za-z0-9]" 2f258006 -- . ':!*.html'
      ':!CLAUDE.md' ':!ROADMAP.md' ':!.claude/agents/pm-ledger.md'` lists the
      fourteen, and the same grep without `-l` counts the twenty-three. Two
      choices in that command are what make the number mean what the row says:
      the pattern requires a character AFTER the slash, so a bare mention of
      the directory is not counted as a citation into it; and the three
      excluded files DISCUSS this debt rather than cite into it. `docs/TESTING.md`
      and two `docs/history/` files mention the directory and are therefore
      NOT in the fourteen — an earlier version of this row named the first of
      them. The per-user-gate branch briefly took the count to 27 and
      re-pointed its own four at a tracked spec before merge, so that work
      leaves the debt unchanged.
- [ ] **An e2e fixture that exercises a REST.** The `est-left` spec's criterion
      6 is HALF MET: no fixture drives `state: "resting"` with a scripted rest
      value. **S**
- [ ] **A real capture witness for a wire gap.** #140 removed three tests and
      lost the witness for a genuine >3 s gap breaking the trace line. It is
      **un-bound from the hardware walk:** `adapters/monitorTransport.ts:70`
      composes the recorder on the WEB arm only, so the laptop leg had the
      recorder and no gaps while the phone leg had gaps and no recorder. New
      home: a deliberate web-leg capture, or extend the recorder to native. **S**

**Exit:** the accessibility audit can run on real assistive technology; the
simulator reaches a connected screen; the lint/type slice remains green; no
tracked file cites a path that does not exist; and the named flakes,
mutation-gate decision, REST-bearing fixture, wire-gap witness, and ordered
type-hardening follow-on are each completed or explicitly disposed.

---

## Wave B — Don't lose their data, and know when it breaks

**Status:** After D; **releases with Wave C**. **M.** Not triad.
**Ships a tester nothing** except one privacy disclosure line.

**Goal:** the two things that are fine for a household of one and indefensible
for a stranger — no backup, and no idea when their app breaks.

- [ ] **A real database backup, and a restore drill that has actually been
      run.** `docs/RELEASING.md` names a backup as the ONLY recovery from a
      documented unrecoverable failure: rolling the API past the v0.16.0
      seed-rename floor deletes the renamed rows and nulls every
      `session_logs.workout_id` pointing at them. **No backup exists** —
      `scripts/` holds `ci-changes.sh`, `deploy.sh`, `version.sh` and `wod`,
      `pg_dump` appears in no script in the repo, and `compose.yml:102` is a
      bare `pgdata` volume. **The restore drill is the deliverable, not the
      dump:** an untested backup is the same shape as an ungated gate. **M**
- [ ] **Error and crash reporting, from the shell and the client.** There is
      none of any kind. Every defect this project has ever fixed was found by
      James at an erg, by a walk, or by a review — instruments that all require
      being James. **This is recurring failure 19 generalised:** a defect whose
      trigger enters above every seam we own is invisible to every gate we
      have. Carries its own privacy answer, and that answer changes what Wave C
      declares. **M**
      **A worked example arrived 2026-08-28, and this item owns it.** At
      that time, the connection-log ring's live door required an undocumented
      triple-tap, and its save-screen reader required `?from=monitor`.
      A saved row had no diagnostics door; James caught the Wave F summary
      defect by looking before saving. **PARTIALLY DISCHARGED by Wave F
      PR 2 (#258, 2026-09-01):** the
      gesture-free half is done — a three-slot history and the You →
      DIAGNOSTICS → Monitor logs door give any of the last three connected
      sessions' logs a reader and a COPY, no gesture, no erg. The SAVED-ROW
      half is NOT: `session_logs` still has no diagnostics column, so once a
      row's three slots are evicted its diagnostics are gone. This item's
      remaining demand narrows to: **a rower must be able to send a SAVED
      row's diagnostics — storage that outlives the three-slot window.**
- [ ] **An in-app "something went wrong" that reaches a human.** Pairs with the
      reporter above, and with the support URL the store surface will owe. **S**

**Exit:** a restore has been completed from that morning's backup, and a
deliberately thrown client error arrives somewhere a person looks.

---

## Wave C — The submission surface

**Status:** After D. **L, two PRs** — the design-gated pair, then the sweep.
**The most visible wave in the slate.**

**Goal:** the build a stranger installs does not look or read like a household
prototype.

**Both design-gated items take a Gate 0** (CLAUDE.md's standing design gate):
James approves the RENDERED thing, at real proportions, in both orientations,
against what it replaces, with every colour pairing's contrast ratio computed
and stated as a number — before any implementation task starts.

### PR 1 — the two design-gated items

- [ ] **App icon redraw.** Replace the AI-generated icon with a clean SVG.
      Checked against the asset itself
      (`app/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`):
      the top arc DOES read ERGOMATIC — **the rabbit's ear crosses the final C
      and hides it**, so at icon size the wordmark loses its last letter. (An
      earlier line claimed the arc was misspelled "ERGOMATIO"; that was wrong,
      it propagated for weeks, and James corrected it. Nobody had opened the
      file.) The real blockers: **the erg rail carries a third-party brand
      wordmark and logo**, which has to come off; the icon bakes in its own
      rounded corners and drop shadow, doubling up with iOS's mask; and the
      whole thing is AI-generated raster art at one size. **Also found
      2026-08-28, in `docs/design/icon-source.png`: the monitor is labelled
      PMS, not PM5, and the Concept2 logotype is garbled** — do not treat that
      file as a source. **This is the only item in the slate that needs a human
      with taste.** **M**
- [ ] **The four workout types teach themselves, or a stranger meets a bare
      `TR`.** The verdict was NOT a rename — the research is at
      `docs/superpowers/research/2026-08-26-intensity-vocabulary.md`, and the
      rejected options stay rejected for their stated reasons. What ships is
      DISCLOSURE: the app already owns plain words (`src/components/typeWords.ts`)
      and shows them one at a time, only for the chip already selected,
      `aria-hidden` in two of three places, with every other badge bare and
      unnamed to a screen reader. **Leaning Option A** — chips become a 2×2
      grid, each carrying its own word, the only shape where all four fit at a
      legal size: four phrases in one row needs 586.8 px against the 350 px a
      390 px phone has, a 68% overrun, and forcing it would need 5.4 px type
      against a 10 px floor. Fold in, whichever chip shape wins: the badge STAYS
      BARE on Library and history rows with a visually-hidden name (a visible
      word costs 118 px of a 168 px history title, cutting every workout name to
      about seven characters, and fails outright by 50 px on custom Library
      rows), and the workout detail screen carries the word plus one plain
      sentence. **No tooltips** — hover does not exist on touch, and NN/g is
      explicit that a label needing interaction is not a label. **M**
  - **Absorbs TL-1:** the type descriptor renders under the WRONG chip. Select
    AN and `SPEED WORK` renders at x=20, under the **O2** chip, about 250 px
    away, because `.type-word` is a full-width `<p>` in its own row
    (`index.css:982-987`). It looks correct in captures only because O2 happens
    to be first. **If Option A is close, this retires itself; if the design pass
    slips, fix it standalone.**
  - **~~Absorbs TL-2~~ — DONE, 2026-08-28.** Two plain-word vocabularies shipped
    at once: `typeWords.ts` said AT = `COMFORTABLY HARD` while `PyramidFigure`
    said `THRESHOLD`, plus `GENERAL ENDURANCE` for O2 and `SPEED` for AN, all
    hardcoded. The figure now imports `TYPE_WORDS` and builds its `aria-label`
    from the same source, so a second vocabulary cannot reappear; a client test
    iterates `TYPE_WORDS` rather than pinning four strings. **This did not wait
    for the redesign, and TL-1 still does** — it is the one of the three that
    Option A would retire on its own.
  - **Copy note, separable and NOT decided:** the rank breaks at position four.
    `LOW & SLOW` → `COMFORTABLY HARD` → `HARD INTERVALS` climbs cleanly;
    `SPEED WORK` reads as a different CATEGORY and is itself coach jargon.
    `ALL-OUT SPRINTS` would preserve the ascent and fit every layout measured.
    **A copy change with its own gate; do not fold it in silently.** Never reuse
    `EASY` or `HARD` as a type word — that is the difficulty vocabulary,
    printed on the same rows.

### PR 2 — the sweep

- [ ] **Accessibility audit against the handoff's hard rules** — every target
      ≥ 44×44 px, all text ≥ 4.5:1 AA, computed and reported as numbers rather
      than judged by eye (recurring failure 6). Moved out of Phase 10 because it
      is a release gate, not household polish, and every phase that has shipped
      since has added surfaces it has never covered. **Depends on Wave D's
      simulator.** **M**
  - **~~Absorbs TL-3~~ — DONE, 2026-08-28**, and its sizing claim was WRONG.
    The words did render at 7.44 px against the house 10 px floor. But this
    entry's _"the tightest band has about five units of slack, so
    `fontSize="10"` fits"_ was never measured and is false: at 10 units
    `SPEED WORK` is 67.99 units wide (measured in Chromium against the shipped
    IBM Plex Mono woff2, at the figure's own 0.08em letter-spacing) against a
    pointed tip's 26.2 units of half-width — **7.82 units of OVERFLOW per side,
    not five of slack.** Nor was it fixable by resizing: the figure is
    width-capped at 340 px, so a bigger pyramid raises the floor's unit cost in
    exact step, and a pointed apex with four equal bands cannot hold the word at
    any proportion. It took a design gate (James, 2026-08-28) and a truncated
    apex — a 32-unit flat top — which costs the band-area progression, moving it
    from 1:3:5:7 to 1:2.0:3.1:4.1. **The lesson, for the next entry that sizes a
    fix by eye: the figure's authored units are not CSS px, and a font size that
    "fits" has to be measured against the shape at the label's ink top, not its
    baseline.** Guarded by `design.spec.ts`'s two pyramid tests (rendered px in
    both orientations, and each word measured against its own band's edges).
- [ ] **Calm-motion pass** — no animation beyond the timer tick and the progress
      bars. `prefers-reduced-motion` is an accessibility expectation, not a
      nicety. **S**
- [ ] **A cold-start pass on a device that has never run the app.** Every walk
      and every gate this repo has ever run started from a populated account.
      Nobody has watched a genuinely empty install reach its first logged row —
      the onboarding cards, the no-baselines door and the first connect all
      exist and are tested, but only against fixtures we seeded (recurring
      failures 3 and 11, together). One run, one new account, no shortcuts.
      **The simulator PRE-SCREENS and the phone SETTLES:** an erased simulator
      is a genuine never-run-the-app webview state, but it produces no OS
      permission prompts (no BLE at all — `capacitorBle.ts:138-145`), no
      TestFlight install flow and no Keychain first run. **A green simulator run
      is not this item's exit.** **S**
- [ ] **The test-history list on You.** Phase BL shipped the PRODUCER
      (`test_history` rows, v0.19.0) and this is the only read path. Today the
      app **collects test results no rower can ever see** — that is unfinished
      BL work, not new work, and it is a line the privacy disclosure has to
      answer honestly. A test session is identified by title
      (`ONBOARDING_TITLES`) or by prescription (`plan_index ∈ {6,34,62}`); the
      design pass says which it keys on. **BINDING (PM final-PR gate on #165,
      2026-08-22): the list does NOT ship without a remove/void answer, decided
      at its design pass** — the table is rower-append-only by composition
      (decline records by ruling, rows outlive log deletion via FK SET NULL, no
      delete API), so a test the rower considers invalid is otherwise permanent
      and anchors the next delta. _"It stays append-only, and here is why"_ is
      an acceptable answer; silence is not. **Second input:** POST
      `/api/test-history` is ownership-checked but takes a client-asserted
      distance and split, so when the history becomes visible, assert the linked
      log's own `workoutTitle` and `avgSplitSeconds` agree — that makes the FK
      semantic rather than merely referential. **M**

**Deferred out of this wave for external TestFlight** — they bind at App Store
submission rather than Beta App Review, subject to the verbatim check Wave A
owes: store metadata and the legal surface (privacy policy at a real URL,
support URL, the App Privacy questionnaire, age rating, store screenshots at
the required sizes). **PWA installability is deferred on a product ground, not
a scheduling one:** CLAUDE.md's native-first rule says the web build is test
harness, dev loop and fallback, "never polished at the app's expense", and
installability polishes it.

**Exit:** a stranger's home screen carries an icon we drew, every type badge
names itself to a screen reader, every target and every contrast pairing is a
computed number in a report, and an empty install reaches a logged row without
a hand from us.

---

## Wave E — The Concept2 logbook

**Status:** OPEN 2026-08-31 (James: _"we can open the logbook Saturday"_;
opened at the brainstorm two days later). Interleaved — it runs on its own
date rather than in the F→A→D→B+C line. **Scope widened at open (James,
2026-08-31): the in-app "Connect to Concept2" surface is IN** — manual
per-row send, monitor-connected `finished` rows only; auto-upload is a
named follow-on phase. Spec:
`docs/superpowers/specs/2026-08-31-concept2-logbook-design.md`. **M→L.**

**Goal:** the first contact with the authority this project has been reasoning
about for two phases without ever talking to it.

**Carried from Phase RC's close, and BINDING:** RC's exit criterion (d) is
transcribed into this wave's own exit block verbatim on day one. The close-out
gate was explicit that without the transcription the criterion evaporates on
the rename — and Phase RC is titled "the row Concept2 would recognise" and
closed with zero Concept2 contact.

- [x] **PR0 — post a reconciled row to `log-dev.concept2.com`, pull `export/`
      back, and diff.** RUN LIVE 2026-08-31 (result 85557, log-dev user
      2211); claims narrowed and the two residuals CLOSED at James's #244
      review: 10/10 posted fields round-trip at the ENCODING layer (the
      stored-row→upload seam is PR1's RF24 test); `export/` 404s by C2's
      design on stroke-less rows (the documented reason RC exit (d)'s hatch
      allows); Branch A PROVEN by a single-process sha256 state receipt;
      the erg's zone confirmed America/New_York by James; census on the
      FULL predicate (incl. `device_name IS NOT NULL`): **6 of 20 rows**
      eligible; dedup second-granular with the ErgData-coexistence
      consequence a stated INFERENCE (direct two-app observation open);
      zero-rest interval post accepted; raw 0x003F bytes are not the
      verification format. Report: `docs/monitor/c2-crossconnect-2026-09/`.
- [x] **PR1 — the server broker.** `concept2_links` + auth attempts + four
      `session_logs` columns (`c2_result_id`, `c2_user_id`, `completed_at`,
      `tz`), link/exchange routes, upload route, mapping module. TRIAD. **M**
      All 9 tasks committed on `wave-e-pr1-server-broker` (2026-08-31,
      including the measured refresh-endpoint corrections); **PR #249
      MERGED** 2026-09-01 (main `27fe6b4a`) — fixed here, fix round 5,
      after this row was found still calling it open past its merge.
- [x] **PR1.5 — the native link flow**, on device: system-browser consent
      (`@capacitor/browser`) and the return-to-app refresh seam
      (`useReturnToApp` — renamed from the working title "foreground
      re-fetch" once `browserFinished` proved an equally load-bearing,
      non-foreground signal). **Narrowed at fix round 15's reconciliation: the
      URL scheme + `appUrlOpen` handler moved to PR1.75** — PR1.5 ships the
      dark, nonce-only plumbing (ACCEPTED as the interim implementation,
      per the design-gate ruling), not the authenticated activation shape.
      Split from PR1 so one reviewer never holds a token-broker migration
      and an iOS deep-link contract in one pass. **S** (That return seam
      was retired at PR1.75b — see below — once the native link moved to
      `ASWebAuthenticationSession`.)
- [x] **PR1.75 — full option (g), the ruled activation shape, TRIAD
      (AUTH).** Owns every piece the account-injection ruling's hard
      precondition names: the `surface` column migration (`"native"` |
      `"web"`) + enforcement at both mint/complete routes, **the surface
      predicate's own authority (added at PR1.5's fix round 16 — today
      `POST /connect` carries no `surface` field and `requireUser`
      discards which credential, bearer or cookie, actually matched;
      PR1.75 pins bearer→native, cookie→web, an explicit both-present
      rule, and a disagreement test before the column above can be
      populated correctly)**, per-surface redirect URIs, the authenticated
      native exchange (`POST /api/concept2/exchange`, server side; the
      device return rides `ASWebAuthenticationSession`, not a URL scheme
      + `appUrlOpen` — design §4), an authenticated web callback
      (`attempt.userId === req.user.id` before the token exchange — the
      identity check the current callback lacks), Concept2's own approval
      of the new native `redirect_uri` (external dependency), and
      dual-route identity tests. **Also owns** (not optional — reassigned
      here at fix round 16 to match the gate doc's own framing) the two
      soft bounds the C2 account-injection register row names:
      `UNIQUE(user_id)` + one atomic upsert at mint (one live attempt per
      user, ENFORCED at 1.75a); `ALLOWED_EMAILS`-as-revocation is a
      separate admission-model question, not bundled here — see the
      per-clause disposition below, where the per-user gate answers part
      of it. Sequenced
      PR1.5 → PR1.75 → PR2; gates `C2_LINK_ENABLED=1` on any real cohort
      (`2026-09-01-concept2-pr15-gate.md` §6). **M**
      **Status 2026-09-02: COMPLETE across two PRs. Per-clause disposition
      of this row:** the `surface` column migration + enforcement at both
      routes — DONE (1.75a, #269, migration 0021); the surface predicate's
      own authority (`req.authVia`, bearer wins, both-present rule,
      disagreement test) — DONE (1.75a); per-surface redirect URIs — DONE
      (1.75a); the authenticated native exchange — DONE across both (`POST
      /api/concept2/exchange` at 1.75a; the device return that reaches it
      at 1.75b, #277, on `ASWebAuthenticationSession`, NOT a URL scheme +
      `appUrlOpen`); an authenticated web callback — DONE (1.75a);
      Concept2's approval of the native `redirect_uri` — log-dev DONE
      2026-09-02, **live portal STILL OWED**; dual-route identity tests —
      DONE (1.75a); `UNIQUE(user_id)` + one atomic upsert at mint — DONE
      (1.75a); `ALLOWED_EMAILS`-as-revocation — **PARTLY ANSWERED
      2026-09-04 by the per-user gate below, which is why this no longer
      reads "explicitly NOT bundled, still a separate admission-model
      question":** removing an email from `C2_ALLOWED_EMAILS` DOES close
      the Concept2 surface for that rower at the next recreate, on every
      authed route except unlink. It does NOT delete their link row or its
      tokens, and it says nothing about the sign-in allowlist, whose
      admission-only behaviour (`signin.ts:30-36`) is untouched — so the
      general question stands, one capability narrower. **PR1.5's `Browser.open` +
      `browserFinished` return arm was RETIRED at 1.75b** (the callback now
      arrives in a promise). **This row used to say `@capacitor/browser`
      stays for PR2's read-only link-out; that is false after PR B
      (2026-09-04), which removed the package entirely** — the read-only
      link-out now shares the OAuth hop's own `window.open` arm
      (`adapters/externalBrowser.ts`), walked signed in on the phone's
      default browser (`docs/monitor/sessions/walk-2026-09-04-c2-linkout/`).
      Device walk:
      `docs/monitor/sessions/walk-2026-09-02-c2-native/`. **Still owed
      after both PRs:** the `C2_LINK_ENABLED` flag flip on a real cohort,
      gated on Concept2's write approval; live-portal registration of the
      native redirect under the application name "Ergomatic" (log-dev is
      registered under James's own name — D3 pre-check observation,
      `94b83c84`); the weight-unit desk reading that bounds the fallback
      producer (PR2's row below); the
      `describeStoreContracts` gap named at 1.75a
      (`2026-09-02-concept2-pr175a-server.md:44`); and a decision for
      James, not made here: whether to promote the app-wide bearer/cookie
      disagreement refusal (design §1) to a hard `400 ambiguous_auth` now
      that this walk measured 42/42 native requests cookie-free. Until
      decided, the app-wide path only logs `auth_disagreement` and
      `/api/concept2/*` alone refuses.
- [x] **PR2 — the rower-facing surface, behind Gate 0.** You's Concept2 card
      (Connect + Unlink; it asks nothing) and the log row's Send action with
      sent/duplicate/failed states and a View-on-Concept2 link-out. **M**
      Also carries the 2026-09-03 weight-class ruling: migration 0023 drops
      `weight_class` from both Concept2 tables and the send path READS the
      class from Concept2 on every send — the rower's own most recent
      DECLARATION first (Concept2's help: "you must designate L or H for
      every piece that you enter"), our derivation from the profile's
      `weight`+`gender` as a fallback, a 422 the rower can act on when
      neither answers. Never stored, never cached, and **since the
      2026-09-04 ruling ("Stop talking about the weight class") no
      rower-facing surface names the class or its producer** — this line
      used to say the SENT state did; the class and `weightClassSource` stay
      on the route's 200 and in the send's log line, for an operator.
      **TRIAD** (stored shape + what a number means on a third party's
      record).
      **Follow-ons this PR names, recorded here rather than in its body
      (RF14):**
      - **A real fake-Concept2 service for e2e** — declined by ruling (v).
        The e2e stack is C2-dark by construction and a committed CI test
        enforces it (`scripts/compose-env.test.sh`), so PR2's browser flows
        fake the server's answers with Playwright `page.route`: they prove
        the CLIENT's states, never the web OAuth hop. A compose service, its
        image and an OAuth-shaped fake are a PR of their own.
      - **The weight-unit DESK leg, and the logged-in glance with it.** The
        FALLBACK producer derives from a `weight` field whose UNIT is an
        inference; the plausibility band refuses four of the six wrong
        readings but cannot catch hundredths-of-a-pound. Two readings settle
        it (the profile's unit preference on kg, then on lb), and the same
        session answers which Concept2 page actually carries the weight and
        weight-class fields — 2i's link-out target is provisional until it
        does. **No erg, no phone: a desk step, and it gates the FLAG FLIP,
        not this merge.** Stated as an exit criterion below as well.
      - **Delete versus sent, unstated to the rower** (Task 7's RF23
        enumeration). Deleting a row that is already on Concept2 leaves the
        Concept2 row standing. That matches the unlink copy's position, and
        nothing says so at the delete confirm.
      - **Rows saved before PR2 carry `completed_at IS NULL`, permanently.**
        They will always upload with their SAVE clock as Concept2's date.
        There is no backfill and there cannot be one — the close instant was
        never recorded. A known property of pre-PR2 rows, not a bug.
- [x] **The per-user gate — `C2_ALLOWED_EMAILS`.** The Concept2 surface can
      now be live for ONE account while the rest of `ALLOWED_EMAILS` never
      meets it: the mint, the exchange, `GET /link` and the send answer on
      `availableFor(email)` (`available()` AND the email is on a second
      allowlist, parsed with the same `parseAllowlist`/`isAllowed` pair as
      sign-in). Unset or empty means NOBODY. **Two routes are deliberately
      different, both settled at fix round 1 and both against the shape this
      row first carried:** the web callback takes the global check first
      (it has no principal yet) and `availableFor` at step 3b once it has
      resolved one — an attempt lives fifteen minutes, so gating only the
      mint would let a rower removed mid-window finish the hop holding live
      tokens; and `DELETE /link` stays on the global check, because a
      capability gate closes USE, not a rower's ability to disconnect their
      own account and stop leaving live tokens behind. **This CHANGES THE
      SHAPE OF THE CUTOVER named above:** `C2_LINK_ENABLED=1` no longer
      admits a cohort by itself, so James can walk a real link and a real
      send on his own account against log-dev before Concept2's write
      approval lands, and the live flip becomes "widen the list" rather
      than "flip a flag for everyone at once". `docs/deploy.md` carries the
      operator half, including the boot-log count and the psql remedy for
      revoking a link on someone's behalf. Design and rulings:
      `docs/superpowers/specs/2026-09-04-concept2-per-user-gate.md`. **S**
- [ ] **The sandbox as a test oracle** (RC-10) — RECONCILED at wave open and
      RE-RULED 2026-09-03: the `weight_class` gate is answered by Concept2,
      not by the link flow. James: "I don't want that set in our app. I want
      it to be set on Concept2's side." This SUPERSEDES the 2026-08-22 ruling
      ("a binary H/L asked only at C2 link time"). The app asks nothing and
      stores nothing. **Corrected the same day, after an antagonist pass:**
      the send path does not merely derive from the profile — Concept2's own
      help says the class is the rower's per-piece DECLARATION, so the send
      reads their most recent one first and derives only as a fallback.
      Measured 2026-09-03 on log-dev: a result POSTed without `weight_class`
      is refused 422; `GET /api/users/me` carries `weight` and `gender` but
      no `weight_class`; and `GET /api/users/me/results` returns every result
      carrying `weight_class`, date-descending, in ~220 ms for a small page.
      **Corrected once more by the code-reading lens, and it is the standing
      warning printed immediately below:** that list contains the rows
      Ergomatic itself posted, Concept2's 201 echoes back the class we sent,
      and no field marks a row as ours — so reading it unfiltered is a
      MIRROR, and a derived guess would have come back as the rower's own
      declaration on the very next send. The read now excludes every result
      id this app wrote (`session_logs.c2_result_id`), and a page whose only
      rows are ours counts as no declaration at all. The class is never
      cached, and a FAILED read is retryable rather than a silent
      fall-through to the guess.
      The
      per-interval `rest_time` gate is NOT answered this wave — RC-1 stored the
      session-level split only, `LogStep` carries no per-interval rest, so the
      `intervals` array is out of scope and rides the auto-upload follow-on.
- [ ] **PR B — the link-outs leave the app.** The read-only Concept2
      link-outs (`View on Concept2 →`, `OPEN CONCEPT2 PROFILE`) drop the
      native `SFSafariViewController` sheet and its isolated cookie jar —
      the defect a 2026-09-03 walk found (a sent row opened Concept2's
      "the user has made this result private" page instead of the row) —
      for the same `window.open` arm the web platform already used.
      `@capacitor/browser` loses its last consumer and is removed.
      **Ordered FIRST** (James, 2026-09-04): it repairs a real defect and
      its own gate is a walk that is happening anyway. Not TRIAD: no
      stored shape, no number's meaning, no auth. Walked twice — plugin
      present (build 860) and plugin-free (build 862) — both signed in on
      the actual result, both W1-W4 identical
      (`docs/monitor/sessions/walk-2026-09-04-c2-linkout/`). Spec:
      `docs/superpowers/specs/2026-09-04-concept2-walk-fixes.md` §5.2.
      **Reconciliation (comments, this row, the phrase sweep) done at
      Task 6; PR not yet opened.**
- [x] **PR A — Concept2 becomes a row on You, and a screen behind it.** The
      whole Connect/Send card leaves the You tab; one quiet mono row takes
      its place and everything the card does moves to `/you/concept2`
      behind it — the shape DIAGNOSTICS already uses. **Ordered SECOND.**
      Not TRIAD. Needs its own Gate 0 (rendered frames, both orientations,
      the row's own contrast numbers) before any implementation task
      starts. Spec: `docs/superpowers/specs/2026-09-04-concept2-walk-fixes.md`
      §5.1. **Done, Tasks 1-7, head `b3655de0` plus this reconciliation
      commit: lint/typecheck/format:check/unit/client/e2e/screenshots all
      green, no hardware walk (not TRIAD).** Captures under
      `docs/screenshots/`: `you-concept2-*` (You, doors group) and
      `concept2-screen-*` (the screen); each set covers unlinked, linked,
      reconnect/armed, read-failed and landscape.
- [ ] **PR C — the verification question.** Concept2 stores a sent row as
      WORK metres only; the monitor's own accumulator and the driver's
      last pre-reset reading disagree with each other by ~2 m, and neither
      has been checked against what Concept2 actually compares. **TRIAD on
      all three counts that matter to it** (a number's meaning). **Ordered
      LAST on purpose**, so the cost of the open question stays visible.
      Names no authoritative number and prescribes no payload change —
      that choice is C1-C3's job, made after this PR's own spec. Spec:
      `docs/superpowers/specs/2026-09-04-concept2-walk-fixes.md` §5.4.

**Standing warning this wave inherits.** `recordTwdVerdict` was retired for
being a mirror: Total Work Distance is work PLUS rest-coast metres and so is our
sum, while Concept2's logbook — the actual authority — stores work only. **An
oracle that shares your definition is a mirror.** Before trusting any number
this wave pulls back, state what it measures and confirm it is the same thing we
are trying to be right about.

**Exit — RC exit criterion (d) transcribed VERBATIM at open, per the close
gate's binding:** _"a row posted to the Concept2 sandbox comes back through
`export/` matching what we stored, or the reason it cannot is documented."_
The hatch is bounded (PM open gate): "cannot" is acceptable for a field C2
rejects or does not return, never for a field we chose not to send. Plus,
from the widened scope: a linked user sends an eligible row from the app ON
THE PHONE and C2's result id is stored on it, with the duplicate (409) and
failure states each observed for real at least once; the link flow's
request bodies carry NO new user attribute (the countable form of
minimal-PII, STRENGTHENED by the 2026-09-03 ruling — it used to read
"exactly ONE new user attribute, `weight_class`"); **the UNIT of Concept2's
`weight` field is measured on James's log-dev profile before the flag
flips — a DESK step, not a walk step, and it takes TWO readings** (the
profile's unit preference on kg, then on lb, because the profile carries no
unit field and one reading cannot detect a per-user display unit). The same
desk session answers two more questions no status code can: which Concept2
page carries the weight and weight-class fields (2i's link-out target is
provisional until then), and whether a non-rower result carries a class.
**It gates less than it used to:** with the declaration as the primary
producer the unit only matters for a rower who has declared nothing, and
the derivation's plausibility band already refuses four of the SIX wrong
unit readings — the two it admits are hundredths-of-a-kilogram, which is
the assumed-correct reading, and hundredths-of-a-pound, a 2.2x error no
band can exclude, which is exactly what the second reading settles. Plus
the
dedup-granularity, `state`-echo and
zero-rest-post questions each carry a measured answer in PR0's report —
"unknown" leaves the wave open. (RC-9(b)'s live ring verdict moved OUT to
the open-item register at the PM open gate: no shared mechanism, PR, or
risk model with this wave.)

---

---

# The open-item register

Work with no wave, lifted out of archived phase bodies so it does not die with
them. **Every entry names where its evidence now lives.** An item here is real
and unscheduled; it is not a wish.

**How an entry leaves:** it rides the next PR that touches its area, it is
promoted into a wave, or it is killed with a reason. "Rides the next PR touching
X" is a real disposition — most of these are single files.

- [ ] **A connected Just Row closed by End or TERMINATE cannot be sent to
      Concept2.** Filed at the door anchor pass, 2026-09-02 (RF14), narrowed
      at the spec pass. `server/concept2/mapping.ts:50` fences the export on
      `endedBy === "finished"`; End and TERMINATE both close `rower`
      (`monitorRun.ts:184-188`, `useMonitorSession.ts:5010`; `steps: []` at `JustRowLog.tsx:209`), which is every
      ordinary Just Row. Whether the driver's terminal branch
      (`driver.ts:2605-2622`, no free-row opt-out) can close a free row
      `finished` when a piece is set up at the PM5 is SUSPECTED and
      unsettled. Either way the v0.34.0 flagship is ineligible for the
      export button in ordinary use until the fence admits a `rower` close
      for free rows (`steps: []`). Needs a Wave E ruling: widen the fence
      for free rows, or accept and say so in the button's copy. **S**

## Codebase-audit owners
- [x] **LOST THE MONITOR must not say "Nothing kept." — DONE in door PR B**
  (2026-09-03). Shipped on all THREE surfaces that carried the phrase, not
  one: the banner's `kept === 0` arm renders its title alone (no body
  element at all, never an emptied one), the connected surface's ended frame
  says "The erg dropped the workout." and stops, and `LogSession.tsx`'s
  dropped strip says "You had not finished an interval yet." with the bold
  clause dropped rather than emptied. Every `kept >= 1` arm is byte-for-byte
  unchanged. **The sentence below is WRONG and is corrected here rather than
  deleted, because it was the reason this rode PR B:** a part-rowed interval
  does NOT count toward "kept" and never will — I-B2, a partial is never an
  `IntervalActual` and `measuredIntervalCount` does not see it. What PR B
  actually does is make the zero-kept case one where something IS on screen
  (the interval's own metres), which is why the phrase had to go. The
  original text, for the record:
  > **LOST THE MONITOR must not say "Nothing kept."** (James, 2026-09-02):
  > on the connected lost-link banner (`ConnectedSurface.tsx`'s
  > `LostBanner`, the `kept === 0` arm), that line reads as loss at the
  > exact moment the RECONNECT is nullifying it — scary and, given
  > recovery, false. Proposed: `kept === 0` renders the title alone (no
  > body); `kept >= 1` keeps "N intervals kept." Copy-only, one file,
  > cosmetic failure mode — FAST-PATH eligible, but a rendered **Gate 0**
  > first (it changes what a rower reads). **Rides PR 4 (§5 partial
  > metres) — James, 2026-09-02**: the same PR that makes a part-rowed
  > interval count toward "kept" owns what the zero-kept banner says, one
  > Gate 0 for the whole kept vocabulary. Evidence:
  > `ConnectedSurface.tsx:848`.

- **v0.32.0's notes owe the DIAGNOSTICS door its affordance sentence** (PM
  gate on #258, 2026-09-01): where it is (You → DIAGNOSTICS → Monitor logs),
  WHEN a rower would tap it (something went wrong in a connected session and
  someone asks for the log), and what COPY does. The note is the affordance,
  not the announcement — the row itself never says when to tap it. Ships in
  the v0.32.0 notes PR, tag on that (#231/#238 shape).
- **The ring history's three-slot eviction has an incident-shaped failure
  mode, filed with its trigger** (PM gate on #258): the identity upsert
  gives one slot per LOGICAL SESSION, so three fumbled reconnects after an
  incident evict the incident, and fumbled reconnects are what incidents
  produce. Ruled at the gate: ship three, no invented size/rowing threshold
  on the teardown path. **Trigger: if a field read ever finds the wanted
  session already evicted, raise the slot count in that PR.**
  **NARROWED by #258's round-5 fix, and the narrowing is in this row's
  favour:** a logical session now begins at the GATT CONNECT, not at the
  `connect()` call. An attempt that never got a link — no transport, the
  chooser dismissed, a radio throw, or Cancel pressed while the scan/connect
  was still in flight — creates no new logical session or identity. Its
  teardown may re-stash a RETAINED prior logical session under that
  unchanged id: updating the existing history entry, or inserting it if
  the prior write never landed (denied-then-recovered). With no retained
  prior session, teardown writes nothing. Only a session that actually
  reached the monitor ever owns a slot. This row previously read
  "a failed pairing or a connect-then-cancel is still a fresh `connect()`,
  hence a fresh session id and its own slot", which was true of the code
  then and is false of it now. Evidence:
  `app/src/monitor/useMonitorSession.ts` (`LogicalSession`, and `stash()`'s
  single read of it), `app/src/monitor/sessionLogHistory.ts`, spec §0.3.
- **RC-29 — the 2.5 s banner, ordinary-use rate still UNMEASURED.** Returned here
  from Wave F on 2026-08-31, the same day it was folded in, because the number
  it carried was pre-fix: `decideResumeLatch` (v0.24.0) killed the nine-banner
  rate, and the next day's build-759 ring shows one correct latch for one
  39.4 s lock. No threshold moves until ordinary use produces a fresh rate —
  `2026-08-31-lifecycle-design.md` §6's latch counter is what produces it.
  **§6 SHIPPED in Wave F PR 2 (#258)**: `stash()` records `latch-count
  latches=<n> resumes=<n>` into every teardown's own ring export, so the
  count is available on the phone. Both controlled 2026-09-04 walk rings
  report one latch / one resume; deliberate locks do not establish an
  ordinary-use false-positive rate. **Still no
  threshold moves until that first ordinary-use rate lands here**; this
  row stays open until it does. Evidence:
  `docs/superpowers/specs/2026-08-27-link-authority-design.md` rev 4,
  `docs/monitor/sessions/walk-2026-08-27/lock-phone-ring.json`, and
  [the 2026-09-04 walk](docs/monitor/sessions/walk-2026-09-04-wave-f/README.md).
- **The continuity count bound has never been exercised unsuppressed.**
  `continuity.ts`'s F2b interval-count bound runs under the same distance-goal
  suppression as the three-axis signature, and that suppression covers **every
  one of the six committed captures** — so the bound has been compared on ZERO
  pairs. Its own doc comment says so: "clean but VACUOUS", and the decision to
  keep the suppression rather than lift it was recorded deliberately. A green
  corpus here is not evidence the bound is safe. Split off the TWD co-producer
  when that item was re-scoped, 2026-08-31 (the non-monotonic reading itself is
  correct behaviour — the documented F2a false kill). **Needs a capture whose
  program has no distance-kind interval — and one now EXISTS** (antagonist
  pass, 2026-08-31): the VACUOUS comment dates to 2026-08-25, and
  `walk-2026-08-28/rest-boundary-recording.jsonl.gz` is "TIME-ONLY by design
  (no distance interval anywhere)" per its own walk README, with a real rest
  boundary — so this may be answerable at the desk today. Evidence:
  `app/src/monitor/continuity.ts`'s `check` doc comment,
  `.claude/agents/antagonist-ledger.md`'s "Phase RC delta pass".
- **The recording tap and lifecycle events are mutually exclusive — a
  documented DEFERRAL, not an impossibility** (corrected at the antagonist
  pass, 2026-08-31; the first version of this row said "none ever can" and
  blamed `dist-grep.sh`, which proves the consequence, not the cause).
  The cause is two adapter decisions: `adapters/monitorTransport.ts`'s
  `isNative()` branch skips the tap, and `adapters/appLifecycle.ts`'s web arm
  is a deliberate no-op. `recording.ts:44-59` already records it, verbatim:
  "Both ends would have to change first — a recorder on the native arm, or a
  web arm that reports transitions again — and neither is this task's to
  decide." Until one end is deliberately built, recordings are laptop-only and
  lifecycle events phone-only — **zero of the TEN committed recordings carry
  one** (count corrected; the directory was listed this time). RF19 one layer
  deeper. `2026-08-31-lifecycle-design.md` §0.4 routes around it by
  instrumenting the ring; this row exists because the gap outlives that
  workaround and will bite the next lifecycle defect.
- **RC-9(b) — a LIVE ring verdict for 0x0039's totals against
  Σ`recordedActuals`**, the way (a) and (d) have one. Moved here from Wave E's
  exit at the PM open gate (2026-08-31): no shared mechanism, PR, or risk model
  with the Concept2 work. Narrowed and nearly done — the corpus comparison is
  made and green on four captures (rests-finished 254.8 s / 935 m exact); only
  the live verdict is left. **Rides the next PR touching the driver area.**
  Evidence: docs/history/phase-rc.md (RC-9), the oracle corpus test.

- **The store's first copied-ring check — DISCHARGED 2026-09-04.** #239's
  PM gate required the next supplied ring to be decoded for
  `commit-accepted{verdict:"failed"}`. Both v0.36.1 walk rings were decoded:
  all 11 commit receipts say `saved` (Lock revisions 0–4, Drop 0–5), none
  `failed`. `storage-persist: denied` is not a failed write. This checks the
  supplied evidence, not the incidence of rejected writes; any future failed
  receipt still warrants investigation. Evidence:
  [walk record and complete rings](docs/monitor/sessions/walk-2026-09-04-wave-f/README.md).
- **The hand-off store's two open residuals, lifted here by #239's STRIKE
  CONTRACT (2026-08-31)** when the AUD-016 item was struck. They are real and
  unscheduled; neither is a defect the store introduced. The former
  memory-only-reload item moved to Accepted on James's 2026-09-03 ruling.
  1. **Three legacy reads survive**: `monitorRunState()` and `anyLiveSession()`
     (`monitorRun.ts`) and `Today.tsx`'s stale-draft-discard guard still call
     `loadMonitorRun()` rather than the store. Deliberately left with a citing
     comment each — `anyLiveSession()` has zero production callers, and
     deleting them would orphan the cross-file anti-pattern documentation that
     names them (`todayGuard.pin.test.ts`'s binding pin). **Whoever next
     touches these functions owns the decision**, per the close-out's own flag.
  2. **The store's standing probe is row 11's tier-precedence COMPOUND
     mutation**, not the single-line reorder — that one is a genuine non-bite.
     Remove the `if (hydrated) return` re-entrancy guard together with forcing
     the population guard true: 6 files / 40 tests fail, including
     `useMonitorSession.test.ts`'s "S1 — the write-count witness"
     (`expected 2 to be 6`). Producer purity is a DIFFERENT invariant and is
     not a substitute for it. Evidence: PR #239's consolidated §10 mutation
     ledger.
- **The machine-summary FIELD PROOF — DISCHARGED 2026-08-31.** Lifted here
  when Wave F's machine-totals item was struck: every gate behind that fix
  was the app agreeing with the app (RF11), and it was proven only when a
  row saved on James's phone from v0.27.0 or later came back
  machine-confirmed. **It did — the first machine-confirmed row in prod.**
  James rowed 5x750m/1:30r on 2026-08-31 and photographed the PM5's own
  View Detail beside the phone: the PM5 reads `15:49.0 · 3750m ·
  Verification 050E-273C 1B69-9691`; the app's Log renders
  `MACHINE CONFIRMED · WORK ONLY · 15:49.0 work · 3750m · CODE 050E-273C
  1B69-9691`. Per-interval paces agree to the tenth on every row the PM5
  screen showed (2:08.8 / 2:07.7 / 2:06.6 / 2:05.3) and the interval times
  agree to the second (3:13.3→3:13, 3:11.6→3:12, 3:10.0→3:10, 3:08.0→3:08).
  This is RF11's real oracle, not a mirror: the code is minted by the
  monitor and the app cannot compute it. The prod re-count is now a
  formality (it was the proxy for exactly this photograph); run it at the
  next DB touch and expect ≥1 of N. Which build produced the row is
  INFERENCE — `ios:release` for v0.30.0 ran earlier the same day, but the
  screenshot carries no build stamp; the code alone proves ≥ v0.27.0.
  Evidence: the two 2026-08-31 photographs (PM5 View Detail + Log detail,
  in James's session), the 2026-08-30 count (0 of 18) as the baseline it
  moved from.
- **AUD-002 — bound History's successful top-level response.** A parseable
  non-array 200 must enter the existing error/Retry state rather than reaching
  `.map`. No real producer was found, so this remains P2/Probable and rides the
  next History API/client boundary PR alone; it is not bundled with raw-database
  corruption hardening. Evidence:
  `docs/superpowers/audits/2026-08-28-codebase-integrity/findings.md`.
- **AUD-006 — Today and Library state every accepted rest.** Both scan surfaces
  understate consecutive rest that Timer retains: an authored 1 min work + two
  back-to-back rests totalling 3 min reads as ONE rest minute on the Today card
  and the Library list, while detail says three and Timer runs the full 240 s.
  Execution is correct; the wrong thing is the prescription you scan.
  **Fix shape decided by James, 2026-08-31: point the scan projections at the
  compiler's own fold** rather than repairing their second, divergent
  computation — the bug exists because two things compute the same summary, and
  a one-surface patch leaves the drift class alive. Reachable only from
  self-authored shapes (the seeded 300 carry no adjacent rests), so it rides the
  next Today/Library PR rather than shipping alone. **Still a displayed-number
  Gate 0** — the before/after card is what James approves. Note the compiler
  already REJECTS leading rest, so only the consecutive case is live. Evidence:
  `docs/superpowers/audits/2026-08-28-codebase-integrity/findings.md`
  (§AUD-006, §V4).
- **RESOLVED (James, 2026-08-31: "Gold approved" on the rendered
  `log-monitor-dropped.png` / `log-monitor-dropped-landscape.png` captures
  at `9bd4ddac`)** — the completion-eyebrow suppression recommended at
  PR #248's round-1 review ("My recommendation is to suppress the
  completion eyebrow") is Gate-0 approved: the dropped-arrival log screen
  no longer reads `WORKOUT COMPLETE` two lines above `THE ERG DROPPED THE
  WORKOUT.` Scoped across all THREE arrival types that did not complete,
  never a drop-only fork (`.summary-eyebrow` suppresses on
  `endedBy === "program-dropped" | "link-lost" | "interrupted"`,
  `SummaryModel.suppressCompletionEyebrow`), unchanged everywhere else.
  The controller's ruling stands approved with it: the composed-route
  evidence (portrait + landscape, real LogSession → PostWorkoutSummary
  composition) covers the dropped arrival only; link-lost and interrupted
  share the identical derivation and renderer, so no routed captures are
  owed for those two unless James asks for them.
- **The server's `EndedBy` mirror can be derived, not hand-copied.**
  `server/stores/logs.ts` already imports `../db/schema.js`, so
  `export type EndedBy = (typeof endedByEnum.enumValues)[number]` plus
  deriving `ENDED_BY_VALUES` from `endedByEnum.enumValues` would collapse
  three mirrors to one; the POST seam test is the current gate. Rides the
  next PR touching `server/stores/logs.ts`. Found same review.

## Tooling

- **13 of the 83 committed screenshots are NOT byte-stable across two
  consecutive `pnpm screenshots` runs of identical code.** Measured at the
  hand-off store's final fix round (2026-08-30): two back-to-back runs at the
  same commit produced differing bytes for `log-delete-confirm`,
  `log-detail`, `log-detail-legacy`, `log-monitor`, `log-monitor-landscape`,
  `post-workout-summary`, `post-workout-summary-landscape`, and all six
  `you-*` captures. Two causes seen by eye: a trace chart whose axis ticks
  follow a series recorded over REAL elapsed test time (`log-monitor`:
  `0:00/0:05/0:10/0:15` one run, `0:00/0:10/0:20` the next), and a focus-
  dependent hint that comes and goes (`you-derive-offer-accepted`:
  `ESTIMATED · TYPE TO ADJUST` vs `ESTIMATED`). A further ~10 differ from
  the committed bytes only by the seeded DATE STAMP (`AUG 25` → `AUG 30`),
  which is stable per-day and re-churns on every calendar day.
  **Why it matters:** capture triage currently cannot distinguish a real
  rendering regression from run-to-run noise without re-running the suite
  twice and diffing run-against-run, which is what this round had to do.
  Rides the next PR touching the screenshots harness. **The measurement is
  written out above rather than cited**, because the round's own report
  lives under git-excluded `.superpowers/` and a citation into it is
  unreachable to anyone but the session that wrote it (recurring failure
  16's corollary). To reproduce: run `pnpm screenshots` twice at the same
  commit, saving the first run's PNGs, and diff run against run.
- **`src/monitor/useMonitorSession.test.ts` — a pre-existing flake**
  (`listSessionLogs()` expected length 1, got 2: an extra session-log ring
  entry, RF27's own territory) fired once during PR1.75b's coverage runs,
  reported 2026-09-02, and passed on three isolated re-runs plus the very
  next full coverage run. Not in that PR's diff (last touched at a prior
  commit, `10b8aa94`). **Written out here rather than cited to the report
  that found it**, because that report lives under git-excluded
  `.superpowers/` (recurring failure 16's corollary) — the same reason the
  screenshot-flakiness item above is inlined. Rides the next PR touching
  this file, or the next time it fires.

## Needs a decision from James

- _(none open)_ — the `/api/today` row that sat here from Phase SF PR1
  closed 2026-09-05: James ruled DELETE, and the route, its unit block and
  the isolation test's dependence on it left in the same PR (the "done is
  per-user" proof now reads `/api/workouts`' `lastDoneDaysAgo`, the oracle
  the Library and Today actually use).

**Cleared 2026-08-31.** James settled every open row in one sitting; each one
left this table for an owner, and the dispositions are recorded where the work
now lives, not here. RC-29 and the PARTIAL complaint went into Wave F (the
lifecycle spec and the `door` column respectively); RC-13/RC-14 dropped to the
connected-surface table below with a fix-13-instrument-14 ruling; "Run it
again" was declined; RC-38 was pulled forward and the rest of Phase PROTO
held; the axis-quantity question opened the "say which number this is" design
pass below; AUD-006 got its fix shape. **This table now holds two rows, both
closed as records rather than live questions (the app-wide `ambiguous_auth`
promotion row was LIVE from 2026-09-02 and was RULED KEEP on 2026-09-03): RC-30 (declined at the RC close)
and the C2 account injection row — RULED by James at PR1.5's design gate
(2026-09-01): ACCEPT the bounded residual for the dark plumbing; fully
authenticated option (g) — attempt-surface binding AND identity-checked
completion on BOTH surfaces — is a hard precondition for setting
`C2_LINK_ENABLED=1` on any real cohort, absent an explicit re-ruling, and the
detect-identity treatment ships with PR2's surface. **RULING REAFFIRMED
(James, 2026-09-01), on corrected evidence:** the original census
overstated two of its four bounds as unqualified (`ALLOWED_EMAILS` bounds
NEW-account admission, not a current holder's standing to act; "one live
attempt per user" is best-effort and raceable, not enforced) — shown the
corrected two-firm/two-soft picture below, James reaffirmed the same
decision; the correction narrows the evidence, not the ruling. Option (g)'s
own delivery now has an owned unit, **PR1.75** (sequenced PR1.5 → PR1.75 →
PR2, TRIAD — AUTH), tracked in Wave E below.** A new row means a new
question, not a re-raised one.

| Item                      | What                                                                                                                                                                                                                                                                                                                                                              | Evidence      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| **RC-30**                 | Teardown can TERMINATE a live piece, keyed on derived `phase === "ready"` rather than `frame.state`. **Declined at the RC close 2026-08-28** — it fails the fast path's fifth check, and its fix loses DEVIATIONS row 70's coverage. Never observed in the field; highest per-incident cost of anything in this table                                             | `phase-rc.md` |
| **C2 account injection**  | The Concept2 callback's Branch A account-injection residual (PR1 final review, F1): an attacker mints the authorize URL on their OWN Ergomatic account and hands it to a victim, whose Concept2 account then links to the ATTACKER's user — bounded today by THREE FIRM bounds (the single-use nonce; the 15-minute `ATTEMPT_MAX_AGE_MS` window; and, since 2026-09-04, the per-user `C2_ALLOWED_EMAILS` gate — the VICTIM must be on that list for the callback to complete at all, because the hop re-checks `availableFor(user.email)` at step 3b after resolving its principal, so on a one-account rollout the population that can be victimised is one) plus the `C2_LINK_ENABLED` dark flag, and two SOFT/best-effort factors the acceptance does not lean on: `ALLOWED_EMAILS` bounds who can OBTAIN a NEW Ergomatic account, not who currently may act (`signin.ts:30-36` only allowlist-checks the create-account branch) — for the household threat model the population is still effectively "household," stated precisely; "one live attempt per user" is ENFORCED since PR1.75a (#269): migration 0021's `UNIQUE(user_id)` + one atomic `INSERT … ON CONFLICT (user_id) DO UPDATE` at mint (`server/stores/concept2.ts`, `createAttempt`). Blast radius is a server-mediated capability (post the attacker's OWN eligible rows into the victim's C2 log, see/unlink the association), NOT token exfiltration. **RULED (James, 2026-09-01, PR1.5 design gate): ACCEPT the bounded residual for the dark plumbing. REAFFIRMED (James, 2026-09-01) on this corrected evidence** — the correction narrows the bound census, not the decision: the residual is unreachable while dark, and full option (g) still gates activation. Setting `C2_LINK_ENABLED=1` on any real cohort is GATED on fully authenticated option (g) — attempt-surface binding AND identity-checked completion on BOTH web and native (`attempt.userId === req.user.id` before exchange — BUILT server-side at PR1.75a on both the cookie-authenticated web callback and `POST /api/concept2/exchange`; the native RETURN that reaches the exchange is BUILT and device-walked at PR1.75b, PASS — **so option (g)'s code-side precondition is now met in full; the gate on a real cohort stays closed on the flag flip and live-portal registration, not on any remaining code**; and since 2026-09-04 "a real cohort" is itself gated on `C2_ALLOWED_EMAILS`, so the flag flip alone no longer admits one) — or an explicit re-ruling; detect-identity treatment (the callback/linked card naming which account the link goes to) ships with PR2's surface. Option (g)'s own delivery is now **PR1.75** (below), sequenced PR1.5 → PR1.75 → PR2, TRIAD (AUTH). Seven options / four buckets in `2026-09-01-concept2-pr15-gate.md`. | `2026-09-01-concept2-pr15-gate.md` |
| **App-wide `ambiguous_auth` promotion** | **RULED (James, 2026-09-03): KEEP — bearer-wins + the `auth_disagreement` log app-wide, the hard refusal only on `/api/concept2/*`. Security read: bearer-wins is not an escalation (the request acts as the bearer holder, who already has that access); cross-site cannot pair a victim's cookie with an attacker's bearer (no CORS middleware, so the custom header fails preflight); the routes where identity binds an external account already refuse; promoting would risk a silent app-wide brick on a shared household phone if a web sign-in ever lands `erg_session` in the native jar beside another account's bearer, on 42-requests-one-install evidence. Trigger to revisit: prod ever logs an `auth_disagreement` line.** Was LIVE (2026-09-02, from #277's walk). `requireUser` logs `auth_disagreement` app-wide and only `/api/concept2/*` refuses when a bearer and a cookie resolve to different users (design §1, PM ruling at #269's shape gate: the app-wide refusal must not ship on an unmeasured premise). The premise is now measured: 42/42 native requests on the walk carried a bearer and NO cookie, 0 disagreements. **James decides whether to promote the refusal app-wide** (a three-line change; the 42/42 is one install on one dev server, so the evidence supports bearer-wins but does not prove the native jar can never carry a cookie). |

## Phase PROTO — the wire-semantics audit (HELD, L)

James, 2026-08-27: _"im also interested into a deep dive to ensure we arent
hallucinating anything in the protocol... we've misused fields before or
conflated them to meanings they dont have."_ Enumerate every claim we make about
a PM5 field and classify it VENDOR-CITED / OBSERVED / INFERRED.

**Scheduling ruling, James 2026-08-31: the sweep is HELD until after the front
door (Wave A), and RC-38 is pulled forward on its own.** The audit ships a
tester nothing and the north star is a stranger using this; RC-38 is the one
row where we key a live check on an enum we have not read. **Re-ask at Wave A's
close, not before.**

- **PR1.75b leftovers (2026-09-02, #277's PM gate — RF14):** (1) a unit test for
  the empty `?state=` callback (`params.get` answers `""`, which the adapter
  treats as a MISMATCH and refuses — fails safe, untested); (2)
  `app/ios/App/App.xcodeproj/project.pbxproj`'s four `E2A1B0…` entries sit out
  of ascending-id order and Xcode will re-sort them on its next save (cosmetic;
  expect that churn in the next iOS PR, not a CLI rewrite).
- **RC-38 — SCHEDULED (2026-08-31), rides the next connected-surface PR.**
  Transcribe `OBJ_WORKOUTTYPE_T`. We have read one row of an enum we key a check
  on: `8` is sourced, `1` and `0` are sourced nowhere. James, 2026-08-27:
  _"have we been making assumptions that are unfounded here? is there
  documentation about workoutType from concept2?"_ The transcription either
  confirms our reading or finds a real defect; both outcomes are cheap.
  **Per recurring failure 16's second corollary, the row for each value is
  quoted verbatim beside the claim it supports.** **S**
  **DISPOSITION (Just Row connect spec 2026-09-02, PR #278): NOT
  transcribed, and said so where the value is used.** Concept2's PDFs sit
  behind Cloudflare and could not be fetched, so `0x01` ships as
  `WORKOUTTYPE_JUSTROW` in `domain/monitor/pm5/commands.ts` with a doc
  comment naming it a LABEL rather than an `OBJ_WORKOUTTYPE_T` row. What
  the value rests on instead is machine corroboration, counted not
  transcribed: the 08-31 capture's 0x0031 census
  (`docs/monitor/sessions/walk-2026-08-31-justrow/decode-0031.py`) reads
  type `0` at a virgin menu, `1` from the first pull, and `1` again after
  a Menu end with nothing sent by anyone — so `1` is what the PM5 picks
  for its own Just Row, and ALSO its idle default, which is why the spec
  keys no gate on it. The verbatim row is still owed: James can drop the
  CSAFE PDF into `docs/monitor/` and the transcription is a comment
  change. Still **S**, no longer scheduled against a PR.
- **The axis-quantity question — REHOMED 2026-08-31** into the "say which number
  this is" design pass below. It was never only about `traceModel.ts`'s `t` and
  `d`; it is one of three places the same screen mixes two quantities.

## The "say which number this is" design pass (post-Wave F, unopened)

**Opened by James's 2026-08-31 ruling** on the axis-quantity question: take the
three surviving work-versus-rest mismatches together, in ONE design pass with
ONE Gate 0, rather than approving a third of a screen at a time. All three were
sitting apart — one in Phase PROTO, two under "accepted, pinned" — which is how
the screen came to mix quantities without saying so. **Every item changes what a
displayed number MEANS, so the gate renders the whole summary before and after,
in both orientations.**

- **The chart's axes** — should `traceModel.ts`'s `t` and `d` become a true
  work-only clock? The PR-2 collision is discharged by labelling
  (`MACHINE CONFIRMED · WORK ONLY`), but **RC-5 made it sharper**: the chart's
  axes are now the last rest-inclusive quantity on the screen, sitting directly
  under three numbers that say they are work-only. (`phase-rc.md`)
- **Live TOTAL METERS is fused, stored is work-only** — `surfaceModel.ts`'s
  `sessionDistanceMeters` is work plus rest live, then the summary shows
  work-only for the same session, and **neither screen labels which**. Lifted
  here from "accepted, pinned" on 2026-08-31; that row asked in its own text for
  its own design pass, and this is it. (`phase-rc.md`)
- **The interrupted TOTAL line** — an interrupted session can show a rest clause
  LIVE and none STORED for the identical row. Silent. Lifted here from
  "accepted, pinned" on 2026-08-31. (`phase-rc.md`)
- **The rest bands are only as wide as the rower kept the flywheel moving
  (James, 2026-08-31: _"it's weird the rests only show in the bottom graph
  if I rowed. It makes it look like the rests were different lengths"_).**
  Seen on the first machine-confirmed prod row: five identical 1:30 rests
  drew five bands of visibly different widths, two of them slivers. The
  mechanism is two known facts meeting on one screen: the chart's `t` is
  conditional on rower behaviour during rests — a frozen rest contributes
  nothing to the axis (`traceModel.ts:37-46`) — and the pace series drops
  `p === 0` samples before the band is derived from contiguous rest-marked
  points (`traceModel.ts:181`, `TraceChart.tsx`'s `restBandsForSegment`).
  So a rest where the rower sat still has no width at all, and the legend
  `BAND = REST` is read as "band width = rest length", which it never was.
  **Belongs in this pass, not alone:** it is the chart's-axes bullet above
  made visible, and any fix (a work-only clock with rests as fixed-width
  gaps, or bands sized from the interval's own rest seconds rather than
  from samples) changes what the axis MEANS, so it rides this Gate 0.
  Evidence: the 2026-08-31 Log-detail photograph; `traceModel.ts`'s own
  header ("NEITHER `t` NOR `d` IS A WORK-ONLY QUANTITY").

## The unlogged-session door

**Status:** OPEN at James's request, 2026-09-03. Normal Today/warning design
approved 2026-09-03; additional recovery-case designs approved 2026-09-04.
Gate 0 and both task reviews are complete; browser recovery proof and generated
captures include the initial landscape safe exit. Automated gates pass.
James's approved September 4 follow-up resolved the final verification-byte
admission gap; scoped review found no new findings. The antagonist cleared
the proposed one-minute protocol's structural coverage. On build 875, James
confirmed native recovery, successful Save and removal from Today; three
phone screenshots are recorded. PM phase-close review passed that bounded
native-door criterion, not every proposed protocol observation. James then
authorized "Merge when green". Main `2f258006` is integrated; combined-tree
verification and scoped integration review passed. PR CI remains the merge gate.
This is separate from Wave F, whose dependency cleared on 2026-09-04; that
closeout does not substitute for this feature's own approvals or acceptance.
[Opening design](docs/superpowers/specs/2026-09-03-unlogged-session-design.md)
and [comparison](docs/superpowers/specs/2026-09-03-unlogged-session-gate.html).
**S–M.** Full cycle; non-TRIAD only while retirement, stored shapes and
recorded-number semantics remain unchanged.

**What and why:** Connect showed "You have an unlogged session. Connecting
discards it." and the dialog offered Cancel and Connect anyway — nothing to
VIEW what the session holds, and no way to log it. A rower who does not want
to lose the row has no move except to walk away.

- [x] **Approve the normal rendered recovery path.** James: "approved",
      2026-09-03. Today exposes retained work
      above suggestions; Start/Connect/Just Row warnings offer View unsaved
      without discarding. Both orientations, long titles and both phone and
      monitor records. No new queue or automatic save.
- [x] **Close the completed-programmed PM5 hole.** At c5015c2e,
      `Today.tsx:1529` hides these records while guards protect them;
      `Today.test.tsx:2701` explicitly pins the omission. Re-enter the PM5
      summary, never the manual form. James's precise retained record remains
      uncaptured; the source/test-confirmed gap is sufficient to open repair,
      not proof of that incident's exact record shape.
- [x] **Resolve every other guarded shape honestly.** Deleted library
      workouts, null-id non-Just-Row records and legacy/invalid frozen seeds
      cannot use the existing save route. Approved: explicit type choice for
      valid retained measurements without library metadata; read-only full
      recording/copy/keep for data that cannot safely rebuild a summary.
      James approved these extra screens on 2026-09-04 ("Approve").
- [x] **Keep the recovery destination usable.** Local records must remain
      visible when Today's unrelated requests stall/fail (`Today.tsx:437`).
      Two retained Just Row sources must each open the selected recording,
      not the current newer-timestamp choice (`JustRowLog.tsx:108`). The
      second is a defensive coexistence case, not an observed normal flow.
      The error/loading treatment and selection lifetime were approved with
      the additional recovery cases on 2026-09-04.
- [x] **Prove preservation across the browser path.** Production writer to warning
      to Today to PM5 summary to saved history; failed-save retry, cold-start
      hydration, both records, and View canceling Connect's staged replacement.
      The 844×390 mounted warning puts the focused View safe exit and its
      keyboard follow-on above Main nav. Preserve existing save/discard/
      replacement retirement. Native walk and phase-close review remain required
      before exit. Evidence:
      `docs/testing/2026-09-04-unlogged-session-evidence.md`.
- [x] **Close final review's verification-byte admission gap.** The selected
      programmed route must refuse arrays outside the existing server contract
      (1–32 integers, each 0–255) before mounting Save. Empty/out-of-range
      integer arrays previously passed and produced a rejected Save. Keep the
      recording in the approved read-only treatment; no repair or byte dropping.
      James approved one focused follow-up after the final-wave limit on
      September 4; its scoped review cleared the tested fix with no new findings.

---

## Rides the next PR touching the connected surface

| Item                                       | What                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Evidence                     |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **RC-8**                                   | Correct the fake's contradictions of the real wire. **3 of 5 corrected** in #182 T1 (`ergMachineType`, `intervalRestTimeSeconds`, `splitIntervalType`); the other two read as already conditional and want verification. Residual: `fake.ts`'s `toMachineIndex` is resting-conditional while `intervalIndex.ts`'s `toActualIndex` is unconditional. **Merged with LL's reconnect precondition — one piece of fake work, and specced apart it gets done twice** | `phase-rc.md`, `phase-ll.md`, `docs/testing/2026-09-04-unlogged-session-evidence.md` |
| **RC-13**                                  | The avg-pace verdict zero-fires on a rapid re-arm: `program()` inside `FINISH_GRACE_MS` cancels the pending deadline instead of draining it. **James, 2026-08-31: FIX IT here** — drain the deadline rather than cancel. Not covered by the close-out corpus (no committed capture re-arms inside 3 s; closest pieces are 148.1 s apart), so the gate is a synthetic replay with a stated mutation                                                             | `phase-rc.md`                |
| **RC-14**                                  | The avg-pace verdict zero-fires on an ORDINARY finish (walk 2026-08-25, W-2). **Distinct from RC-13; do not fold.** Replay through the walk's own commit `c219ee0` DOES produce the verdict, eliminating the wire, the driver's response and ring eviction; **two survivors — it threw, or something outside the driver dropped the entry.** **James, 2026-08-31: do NOT hunt it; INSTRUMENT it** so the next occurrence names which survivor it was, instead of another silent zero. Per RF19, the instrument ships in the same change | `phase-rc.md`                |
| **RC-38**                                  | Transcribe `OBJ_WORKOUTTYPE_T` — see Phase PROTO above. Pulled forward alone by James on 2026-08-31 while the rest of the sweep is held                                                                                                                                                                                                                                                                                                                       | `phase-rc.md`                |
| **RC-11**                                  | The stroke-data reframe: three-way, not two. Owns RC-6's deferred `p: 0` half. Our series clock is a third quantity, and none of the three is C2's `time`                                                                                                                                                                                                                                                                                                      | `phase-rc.md`                |
| **Session calories**                       | 0x0033's `totalCalories` is INTERVAL-scoped (it resets at every boundary) and the 0x0039 summary carries no calorie field, so an honest session CAL needs the register-fold discipline CR2 spec 1 built for distance, plus an honest ramping fake (today's emits a constant 0, so **nothing can go red**), plus a walk photo. **ZONE rides behind it** — it needs a strap and a max-HR source the app lacks. **Ownerless since 2026-08-15**                    | `phase-cr2.md`               |
| **Cross-pin the two distance derivations** | `sessionDistanceMeters` and `monitorDistanceMeters` are two derivations of one user-facing quantity, shipping on two screens with nothing comparing them                                                                                                                                                                                                                                                                                                       | `phase-cm.md`                |
| **The fake's rest-distance lag**           | `restDistanceMeters` resets with no roughly three-frame lag, unlike the real wire                                                                                                                                                                                                                                                                                                                                                                              | `phase-cm.md`                |
| **`MONITOR_SPM_MIN = 0`**                  | Re-parked at CR2's close, re-owned by LT spec 1                                                                                                                                                                                                                                                                                                                                                                                                                | `phase-cr2.md`               |
| **The landscape gutter**                   | The phone timer's landscape gutter absorbs no left inset                                                                                                                                                                                                                                                                                                                                                                                                       | `phase-cr2.md`               |
| **iOS 26 `100dvh`**                        | Under `viewport-fit=cover`. Wave D's native fake flag is what makes this answerable at a desk                                                                                                                                                                                                                                                                                                                                                                  | `phase-cr2.md`               |
| **`PULL TO RESUME`**                       | James, 2026-08-17: _"we never got rid of the pull to resume screen."_ CR2 2a task 5 only re-worded it; **the screen was supposed to go, not get politer.** §2b's suspected mechanism was FALSIFIED (zero PAUSED firings across six captures) and the flash's real mechanism is unexplained. Pairs with the stale-while-armed observation                                                                                                                       | `phase-cr2.md`               |
| **Reconnect's three preconditions**        | Constraints on the deferred Correct Resume entry, not separate scheduled work. #183's gate requires a reconnect design to reset or quarantine `lastContinuityRef`'s count axis across a re-subscribe; preserving the old baseline without that policy is unresolved. | Correct Resume research, "Status: deferred, not an implementation contract" |
| **Two declined CR questions**              | Projected finish split; distance intervals with a rate cap. Each waits on a hardware fact. Reconnect belongs to the deferred Correct Resume entry, not this row; its research does not authorize backfill or a MISSED writer. | `phase-cr.md`                |
| **LL-F4**                                  | The `disconnected` handler records no liveness snapshot where `fail()` does, so a retry's ring has one fewer data point                                                                                                                                                                                                                                                                                                                                        | `phase-ll.md`                |
| **Connection-log text is unselectable**    | `user-select: none` inherits into the sheet (`index.css:85`, `:5799`); COPY LOG is the only route out                                                                                                                                                                                                                                                                                                                                                          | `phase-cs.md`                |
| **The bar's two axes**                     | The connected bar's fill and its notches are two axes on DISTANCE work; EST LEFT holds still 6.6 s and 20.8 s at handovers. **The obvious repair was replayed and does not work.** Accepted and documented. **TRIAD** when it is taken                                                                                                                                                                                                                         | `phase-cr2.md`               |

## Accepted, pinned, and not being fixed

- **Suggestion helpers are pure over the id arrays they are handed (Phase SF
  PR1, lifted at close 2026-09-05).** James: the library may lazy-load one
  day. `domain/suggest.ts`'s `drawOne`/`nextShuffle` and Today's draw
  initializers never assume the pool is the whole library, never cache a
  sorted copy across renders, and never key on `library.length`; a stored
  pick outside the current pool falls through to the pool head, and
  `suggest()`'s reason strings ("Your library is empty", "No {type}
  sessions in your library") assert library-wide facts a paging phase must
  re-scope first. Spec §2.4. Pinned so a paging phase inherits an
  invariant, not a rewrite.

Known-wrong and deliberately left. They are here so nobody rediscovers them as
new.

- **Connected hand-off durability stops at the live process when a write was
  rejected.** The memory tier keeps the measured row and the receipts record
  the failed durability attempt, but reload destroys that memory-only row.
  Separately, WebKit or the operating system may later evict a successful
  localStorage write. Correct Resume cannot cross either process/storage loss:
  it retains in-memory connection state, not a second durable store. James
  accepted both on 2026-09-03 because neither has occurred in this app and the
  shipped receipt/ring instrumentation will identify the first occurrence.
  Reopen from that evidence, not a hypothetical mitigation.
- **TIER B2 residual** — `buildMonitorLogSteps` never produces a step for a
  null-index actual, so the row under-counts. **Ongoing population:** link-lost,
  program-failed and interrupted closes can never carry the work pair.
  (`phase-rc.md`)
- **List versus detail** — the history list cannot reach TIER B2, so list and
  detail differ (742 m / 2:18.8 against 500 m / 2:04.0) for a `finished` row in
  the 2026-08-08..2026-08-24 window. (`phase-rc.md`)
- **MOVED OUT 2026-08-31, no longer accepted:** _Live TOTAL METERS is fused,
  stored is work-only_ and _the interrupted TOTAL line_ both left this section
  for the "say which number this is" design pass above, when James ruled the
  three work-versus-rest mismatches get one Gate 0 together. They are scheduled,
  not pinned.
- **Three minor divergences** — `postTestOffer`'s split precision changes on
  tier-A saves; `testHistory.ts`'s `deltaSeconds` mixes pre- and post-RC-5
  definitions; the live tier-A gate checks distance and time independently where
  the stored one requires both. (`phase-rc.md`)
- **Build-738-era rows** — an unsaved run carried across an update renders two
  heroes rather than three, permanently and silently, and declines its baseline
  offer. **A release-note clause is owed and unwritten.** (`phase-rc.md`)
- **The three falsified release notes: DISCHARGED in v0.27.0, 2026-08-30.**
  **This row still read "hold these to ship BEHIND the fix" on 2026-08-31 and
  was stale** — the corrections had shipped, and a stale row costs its next
  reader a turn re-deciding a settled thing. Corrections go in a SUCCESSOR note,
  never edited in place, and all three did: `releaseNotes.ts`'s v0.27.0 item 3
  carries the v0.22.0 and v0.23.0 corrections — including the counted "all 18
  connected rows", which discharges the no-backfill sentence — and item 4
  carries the v0.11.0 one. Item 2 discharges the post-End wait ("The wait is
  short, usually under a second").
  **The last owed sentence DISCHARGED in v0.30.0, 2026-08-31 (#241) — nothing
  in this row is owed.** The failed-write-state sentence
  (`COULD NOT KEEP THE RECORD ON THIS PHONE.`, its two buttons) was pulled at
  the 2026-08-30 pause ruling for describing a screen v0.27.0 did not contain;
  #239 shipped that screen and the sentence returned as v0.30.0's item 1, in
  its own pre-tag notes PR (the #231 shape) preceding the tag, as #239's PM
  gate bound it. The range was accounted per RF15
  (`git log v0.29.0..main --oneline`, no `--merges`; this repo squash-merges and
  that flag returns empty): #239 earns the note, #240 and #241 are docs and
  notes and earn none.
- **The log-delete accepted gap** — a session with a wrong number has exactly
  one remedy, delete and re-log by hand, and `logged_at` is a DB default rather
  than settable, so a mistake found the next day cannot be re-dated onto its own
  day; re-logging a non-terminal plan session appends at the top rather than
  refilling its slot. Re-association and number-editing were both DECLINED by
  James's ruling. **The next spec that touches log lifecycle starts from this
  gap.** (`bugfix-rounds.md`)
- **The abandoned-start draft janitor** — a started draft the janitor can no
  longer reap, so every later Start costs a two-press confirm. **James accepts
  the residue as everyday behaviour.** (`bugfix-rounds.md`)
- **Programming limits live in `program.ts`, not on `MonitorCapabilities`** — it
  hardcodes PM5 Table 19 limits, and six `CompileError` branches name "the PM5".
  Disclosed and accepted as correct for now at `program.ts:112`.
- **Anonymous-run logging** — every storage layer accepts `workoutId: null`, no
  product path can create one, and `ANONYMOUS_RUN` is dead code by its own
  comment. **Phase JR is the door that would create them — and PR 2 (#259)
  DISCHARGES this: `/justrow/log` posts `workoutId: null` with
  `advancesPlan: false`, and Today's recovery row serves the id-less
  record.**
- **`surfaceModel.ts:1573`'s `if (digits.startsWith("8")) return "AN";`** is the
  English article in "AN 800 M PIECE", not the workout type. A rename trap, not
  a task.
- **Concept2 wire hardening (PR1 final review, M3)** — the C2 wire calls carry
  no timeout, and the per-user token refresh holds a `FOR UPDATE` row lock plus
  a pooled connection across the outbound refresh call (`client.ts`,
  `stores/concept2.ts`). Follow-up hardening; household-scale acceptable today.
  (`2026-08-31-concept2-logbook-design.md`)

## Owed captures and walk items

Each needs erg time or a deliberate recording session.

- **A terminate-path SCREEN oracle** (§25's `avgStrokeRate` anomaly), and a real
  capture of the app's own END button mid-piece, on both web and native.
  (`phase-rc.md`)
- **Native burst lag against `BURST_HANDOFF_HOLD_MS`** — the 2000 ms backstop's
  corpus is web/foreground only (End-arm round-trip n=1, web; background/resume
  n=0). The next connected walk reads the ring for `burst-timeout` receipts and
  the End-arm terminate round-trip on native BLE. (PR #228's PM gate)
  **Widened at #230's PM gate (2026-08-30), and the widening is now LIVE on
  main:** the hand-off store's durable verify (#239, merged 2026-08-31) adds a
  synchronous full-run re-serialize (~720 KB worst case) to every ended
  hand-off, so the same walk measures TOTAL post-End latency on native, not
  only the burst backstop — one walk, both numbers. The estimate has never been
  measured on a phone.
- **A lab capture of `2×Nm rNN`** — the series-truth regression fixture is
  SYNTHETIC; no committed recording exercises distance-work-with-rest-between.
  (`phase-rc.md`)
- **The PR-1 capture-rate gap** — the EARLY admission check cannot buffer a
  0x0039 beating the first 0x0033. #183 delivered `rawIntervalCount` but the
  check does not consume it. (`phase-rc.md`)
  **CORRECTED AND DOWNGRADED 2026-08-28.** This row sat under "owed captures
  and walk items" saying the burst "is not caught 100% of the time", implying
  it needed erg time to characterise. The 2026-08-28 production ring shows the
  burst caught, decoded and emitted perfectly — **that loss was downstream,
  in the reader, fixed by #228 with native field proof on 2026-08-31** (the
  machine-summary FIELD PROOF above). The rate at the ROW was then 0%.
  What survives here is only the narrow
  admission-check edge, which still wants no erg: it is reachable from a
  replay.
- **The C′ rider** — the continuity-reset close skips the backward-bucket ring
  entry, the one close where the diagnostic dies silently. (`phase-rc.md`)
- **The BLE backlog probe** — a backlog may already exist twice over: Apple
  queues events for a foreground-only app, and WebKit's IPC send queue is
  uncapped. Depth and duration could not be established. _"Probe before
  designing anything that assumes loss."_ (`phase-ll.md`)
- **The WebView reload** — Capacitor answers a killed WebContent process with
  `webView.reload()`, destroying the driver, the recorder, and up to 30 s of
  unflushed series. _"'terminated no' disposes of force-quit, not of memory
  pressure."_ (`phase-ll.md`)
- ~~**JR PR 0b's capture walk**~~ — DONE 2026-08-31; six OPENs answered, OPEN 3
  bounded. Record at `docs/monitor/sessions/walk-2026-08-31-justrow/README.md`.
- ~~**JR OPEN 3's open half — does a PM5 power itself off with a central
  connected?**~~ RETIRED 2026-09-01 by ruling, not by evidence: James ruled we
  assume the connection stays open indefinitely and design for it, rather than
  spend an erg session settling it. Still unobserved and still undocumented —
  if a closer ever turns up in the wild it is a bonus, never something the
  design waits on.
- **The hardware session shopping list** — three pairing and programming latency
  spans, the unrowed question from §17 item 5, §18's readings-still-owed, a
  genuine mid-piece disconnect, and **one `.5` pace target on the wire**
  (`representableCentiseconds` has never been sent to a real PM5).

## Small, queued, rides the next PR in its area

- **`data.test.ts`'s 401 route table is short four routes** (found by the
  review of the `/api/today` removal, 2026-09-05): `DELETE /api/logs/:id`
  and the three `/api/article-reads` routes have no row, so a session-guard
  regression on any of them has no gate. Add the rows; rides the next PR
  touching that file.
- **FILED, and it is TRIAD (James's walk, 2026-09-04): our work distance is the
  SUM OF OUR INTERVALS, the monitor reports a different total, and Concept2
  verifies against the monitor — so a verification code cannot validate.**
  Measured on hardware, three artefacts in one sitting:
  - PM5 View Detail, `v12:30/3:00r...3`, Sep 04 2026: total row **25:00.0 /
    5706 m**; interval rows 2837 + 1953 + 918 = **5708 m**; rests 357 + 168 + 0
    = 525 m, 3:00 + 2:00 = 5:00. **The monitor's own total disagrees with the
    sum of its own intervals by 2 m.**
  - What we sent: work **5,708** m / 25:00.0, rest 525 / 5:00, so Concept2's
    overall reads **6,233** where the monitor's own is 5706 + 525 = **6231**.
  - Concept2, on entering the code `D9BD-F964-32E2-7F18` (which matches the
    monitor and our own display exactly): *"This workout cannot be verified.
    Please check your date, time and distance exactly match the monitor."*
  **Mechanism:** `monitorRun.ts`'s `workMeters` is
  `actuals.reduce((sum, a) => sum + a.distanceMeters, 0)`. Every gate we own
  compares that sum against our own intervals, so all of them agree with each
  other and none of them can see this — RF11 exactly, and the same
  "an oracle that shares your definition is a mirror" shape that retired
  `recordTwdVerdict`.
  **Consequence, unhedged:** the verification code is ROADMAP's own "whole point
  of the phase", and it cannot succeed today for an interval row whose totals
  differ. Unknown and worth measuring: whether a single-interval or JustRow row
  verifies fine (the two numbers coincide there), which would explain why
  nothing caught it.
  **Owed before any fix:** decide which number is authoritative and say why —
  the monitor's own summary total, or our sum — then send that one, and gate it
  with a replay whose expected value comes from the CAPTURE's summary frame
  rather than from our own accumulator. **M/L**

- **FILED (PR2 PM gate, 2026-09-04): three PR2 items whose only home was a plan
  or a PR body.** A plan is a record of intent, not a live register (RF14).
  (1) **The Concept2 card's container gap is gated on a hand-composed screen,
  not on `/you`** — the e2e case paints the sibling chain itself, so it stays
  green if `You.tsx`'s order or `ResetBaselineSetup`'s markup changes. Closes
  when the surface can render in a browser artifact. (2) **The client/server
  eligibility parity test proves PREDICATE PARITY, not route enforcement** —
  deleting the route's `422 not_eligible` branch leaves
  `concept2Send.integration.test.ts` green; `concept2.test.ts` catches it one
  file over. Nobody should read the parity file as the enforcement gate.
  (3) **Bare `.c2-card-status` (5.29:1, passing) is on no screen either axe
  sweep covers** — the linked card always overrides it with `-status-on`, so
  the passing pairing is unswept. **XS**

- **FILED (PR2 Task 4 review, 2026-09-03): `e2e/retest.spec.ts` fails under
  full-suite load, and the first recorded diagnosis was wrong.** Seen four
  times across three PR2 tasks, always green when the spec runs in isolation
  (`pnpm e2e e2e/retest.spec.ts` -> 3 passed), so it is load- or
  order-dependent, not a broken test. **Corrected signature:** every captured
  failure is downstream, and every snapshot shows Today ALREADY carrying the
  saved log row **and** `SET UP YOUR BASELINE` — i.e. the save landed and the
  post-save baseline offer never rendered. It is NOT the test-auth backdoor
  returning non-ok under load: that stack came from a bare
  `pnpm exec playwright test`, which bypasses the worktree's stack, and was an
  artifact of the wrong command rather than the flake.
  **Three occurrences, two different assertions, one mechanism.** Two failed
  at `getByText('SESSION SAVED')` (`retest.spec.ts:51`); the third, captured
  2026-09-03 during Task 4 fix round 2, failed at
  `getByRole('heading', {name: 'Set your 2k baseline?'})`
  (`retest.spec.ts:121`). Both locators belong to the same prompt, so the
  signature is the PROMPT not rendering, not either assertion.
  **MEASURED mechanism:** in `LogSession.tsx`'s `useLogForm` callback, a null
  `pendingOfferRef.current` takes the `navigate("/today")` branch instead of
  rendering `PostTestPrompt` — exactly "saved row on Today, no prompt". That
  ref comes from `postTestOffer(...)`, which returns null on any of four
  conditions (no measured `avgSplitSeconds`; the workout not the global
  designated test; `completedFullDistance` false; the split outside the
  60..240 s band). **INFERENCE, not confirmed:** both tests reach Save via
  `page.clock.install()` + `fastForward("08:00")`, and the two conditions a
  timing race can flip are `completedFullDistance` and the band — a
  fast-forward that has not taken effect yields an implausibly fast split the
  band rejects. Instrument the offer's four inputs to settle which fires.
  **"State pollution between the file's two tests" is NOT supported** and was
  this entry's own first guess: each test signs in with its own address
  (`retest-6k-`/`retest-2k-`/`retest-decline-` + `RUN_ID`), so the accounts
  are always distinct, and `SET UP YOUR BASELINE` is simply what a fresh
  account renders. Traces:
  `app/test-results/retest-Phase-BL-the-You-re-5b0d3-*/error-context.md` and
  `.../retest-Phase-BL-the-You-re-cbcae-*/error-context.md` (local, not
  committed — capture again before re-running, since `pnpm e2e` overwrites
  `test-results/`). **Unrelated to Wave E PR2:** the Concept2 card has no
  importer on this branch until Task 8, and every added selector is `.c2-card*`.
  Owed: root-cause before treating any future red `retest.spec.ts` as noise.
  **S**

- **FILED (PR2 copy pass, 2026-09-03): the four device-open link failures
  now reach no diagnosis on a plain build.** James's copy ruling made every
  rendered string mechanical, which removed the wire token from
  `describeFailure`'s reason line — so `noWindow`, `noContext`,
  `contextInvalid` and `pluginError` all read "THIS DEVICE COULDN'T OPEN
  CONCEPT2" with no code. On dev and walk builds `Concept2LinkProbe`'s
  `outcomeDetail` still prints the kind, the plugin `code` and its
  `message`; on a TestFlight build the probe is not compiled in and, per
  that component's own header, those values "reach no server log". Accepted
  for PR2: these are plumbing failures a rower cannot act on differently,
  and the copy ruling is explicit. Owed: the last link failure surfaced in
  the Diagnostics door (`app/src/you/Diagnostics.tsx`, whose header already
  calls itself "the extensible home for every diagnostic tool that
  follows"), or the same detail attached to a send/link server log. Rides
  the next PR touching the Concept2 surface or Diagnostics. **XS**
- **FILED (door PR A's PM gate, 2026-09-02): the server tsconfig now
  includes a client file, and no lint fence stops `server/` importing
  `src/`.** `app/tsconfig.server.json`'s `include` reads
  `["server", "domain", "src/vite-env.d.ts"]` — the third entry added by
  #226's Playwright-typecheck ratchet, so the server project's roots reach
  into `src/`. `app/eslint.config.js`'s `no-restricted-imports` block
  (`:108`) fences Capacitor plugins and `src/platform`/`src/native` for the
  CLIENT; there is no mirror rule forbidding a `server/**` file from
  importing `src/**`. Owed: that fence, with a carve-out for tests, which
  legitimately cross. Rides the next PR touching server lint or tsconfig.
  **XS**
- **FILED (door PR A's PM gate, 2026-09-02): `1,000` in the History list,
  `1000` on the log detail.** Pre-existing, not this PR's.
  `LogRow.tsx:51` hand-rolls a comma thousands separator (`fmtMeters`, its
  own house-style comment) and the History row uses it (`:185`); the
  detail's own step rows render `` `${step.meters} m` `` raw
  (`storedSummary.ts:947`). Same distance, two spellings, one screen apart.
  Owed: pick one and share the formatter. Rides the next PR touching
  either. **XS**
- **FILED (door PR A's PM gate, 2026-09-02):
  `server/concept2/mapping.test.ts:160-169` is pinned by TYPECHECK, not by
  its own assertion.** The leg exists to make the retired
  `deviceName === null` gate and the live `source !== "pm5"` gate disagree,
  and to do it the fixture is cast past the excess-property check
  (`as unknown as Parameters<typeof eligibilityFailure>[0]`) onto a row
  shape the wire cannot produce — `logSourceContradiction` 400s a
  `deviceName` on any non-pm5 row. So the runtime expectation discriminates
  a state only the cast can reach. Owed: either say so in the leg's own
  comment (the honest reading — it is a mutation discriminator, not a
  reachability claim), or reach the same disagreement through a supported
  producer. **XS**
- **FILED (door PR A's PM gate, 2026-09-02): the `freeRow` 401 first-run
  flake.** On a cold stack (24 containers up) the first `freeRow` e2e
  sign-in has 401'd once and passed on retry. Not reproduced on a warm
  stack. Owed: one run with the backdoor sign-in instrumented, to say
  whether it is the auth seam or container start-up ordering. **S**
- **ACCEPTED (Gate 0-A's own cost, door PR A, 2026-09-02): Today's last
  three rows carry no PARTIAL chip.** The chip lands in History and on the
  log detail; Today's compact rows have no slot for it without displacing
  the type badge. Gate 0-A weighed two options and took the cost. A THIRD
  option — the chip on the title line, or displacing the badge — is
  deferred to the Timer-mode design pass (the `## Timer mode, on the
  phone` row above), which is already redesigning that row.

- **RESOLVED (2026-08-31): `swapMark`'s `globalOnly: false` arm is pinned**
  — trigger pulled forward by James. The arm's only producer is synthetic,
  so `Plan.test.tsx` mocks one session's prescription (and nothing else);
  mutating the predicate to demand a global fails exactly the
  personal-match case.
- **RESOLVED (in the same PR that filed it): `stack-env.sh` now refuses an
  empty `REPO_ROOT`** with `: "${REPO_ROOT:?...}"` instead of hashing the
  empty string into the phantom `ergomatic-67295` stack. Probed both ways:
  unset -> loud refusal (exit 127, message names the fix); set -> the real
  per-worktree id, and `pnpm e2e`/`pnpm screenshots` both boot and pass.
  All three script consumers (`e2e.sh`, `screenshots.sh`, `walk-lab.sh`)
  set `REPO_ROOT` before sourcing, verified by grep. Session memory
  `stack-env-needs-repo-root` carries the incident.
- **ACCEPTED (James, 2026-08-30): deleting a personal same-titled workout
  unmarks a completed plan row.** `session_logs.workout_id` is `ON DELETE SET
  NULL`, so a rower who authored their own `2K Test`, rowed it on a checkpoint
  day (correctly marked `INSTEAD OF 2K Test`) and later deleted that workout
  sees the mark disappear — the row's identity becomes unknown, and the mark
  is a positive accusation that never fires on a guess. Raised at #233's
  re-review, which was right that the 2026-08-30 Gate 0 ruling did not cover
  it: that ruling accepted preset-type edits and nothing else. **Re-gated
  verbally instead, and explicitly with no design pass** ("2 is fine, I don't
  need a mock up"). The alternative — a nullable `workout_was_global` column
  written at save time — is TRIAD and is NOT being built.
  **Revisit only if a rower actually hits it**; the shape is documented in
  `swapMark`'s own comment.

- **RESOLVED (edge-marks gate + James's re-review, 2026-08-31): a
  pre-validation row with an unreadable `workoutType` renders a bordered
  shaded box that is a MEANINGFUL, accessible cue** — `--rule-2` fill,
  `--ink-4` border (4.76:1 / 4.48:1, clearing 1.4.11's 3:1 non-text
  floor; the first cut's 1.53:1 "decorative" framing was rejected on
  review), with a visually-hidden "type unknown" twin for AT. Box model
  equals a real badge's by construction (shared `.type-badge`, two
  no-break spaces, border compensated in padding) AND by measurement:
  `design.spec.ts` injects the badge into the live screen and asserts
  computed colours, an in-test 3:1 computation, and sub-pixel geometry.

- **DISPOSED (post-#233 follow-ons, rationale corrected at #235's review):
  the real store's `id DESC` tiebreak stays unpinned as LOW-VALUE — not, as
  this entry first claimed, unreachable.** The owning comment in
  `stores/logs.ts` says a same-microsecond tie is "unlikely, not
  impossible", and `contracts.real.integration.test.ts` already forces
  exact ties on this table with raw SQL, so the test is writable with an
  in-repo technique. What it would buy: determinism between two rows that
  are, by construction, interchangeable candidates for one index — the
  tiebreak is arbitrary-but-stable by its own comment, never "the later
  insert". A test pinning an arbitrary choice earns integration-suite cost
  only if some consumer starts depending on WHICH row wins; that is the
  revisit trigger.
- **The swap mark goes stale if a plan preset's session types are ever
  edited.** The Plan screen derives "you swapped this day" by comparing a
  log's stored type against `PLANS`' type for that slot TODAY, so editing
  `SPRINT_WEEKS`/`HEAD_WEEKS` would retroactively mark rows that were rowed
  exactly as the plan then asked. Accepted at the 2026-08-30 design gate
  (presets are static code and have changed once, at Phase 8A) and recorded in
  `swapMark`'s own comment plus a warning above the week arrays in
  `domain/plans.ts`. **Trigger: the next change to a preset's session types.**
  If that ever becomes routine — an authoring UI, DB-loaded plans — the fix is
  a stored prescribed-type column, which is TRIAD and wants its own spec.
  The deletion case is RELATED but is NOT covered by this ruling — it has its
  own entry above, because Gate 0 accepted preset edits and nothing else.

- **RULED (edge-marks gate + PM gate, James, 2026-08-31): the
  self-contradicting mark keeps `INSTEAD OF` everywhere (option D), and the
  two designated test titles are RESERVED at ALL THREE workout-writing
  doors** — `POST`, `PUT`, and `POST /api/workouts/bulk` (the PM gate caught
  bulk unguarded in the first cut), one message (`title is reserved. Pick
  another name`, James's pick), mirrored at the Builder field. Legacy rows
  keep rendering and stay suggestable; **editing one without renaming it is
  ALSO rejected** — James's explicit ruling, declining the narrower
  changed-into rule ("I don't want to engineer a solution to an imaginary
  problem"). **The reservation is a fence around the string-keyed test
  identity, not a product principle** (PM): retirement trigger = a stable
  seed key replacing `isOnboardingTitle`'s remaining call sites. Name
  conflicts in general REMAIN allowed.

- **The reservation is a NON-ADDITIVE API change: coordinated tag, and an
  honestly-named residual (PM gate C3, corrected twice at James's
  reviews).** A request that used to 201 now 400s. First disposition
  ("ride the next tag") broke RELEASING.md's breaking-change rule; the
  second overclaimed that the tag CLOSES the exposure. It does not: an
  installed v0.28.0 client keeps sending the now-rejected request until
  its owner updates — there is no version negotiation or forced-update
  path — and sees the Builder's generic "Couldn't save this workout. Try
  again." retry loop. What the coordinated tag does buy: the notes ship
  in the SAME tagged commit (#238 carries its own v0.29.0 notes), so the
  moment a build exists that explains the rule, it is the newest build.
  **Residual: pre-update clients hitting a reserved title get the generic
  copy, for as long as they stay un-updated. Accepted by James with his
  merge approval of #238, which presented this text.** Building version
  negotiation for two reserved strings was considered and declined as
  disproportionate.

- **AMENDED 2026-09-03 (Wave E PR2 Task 6): the two flakes are ONE flake, and
  it lives in `server/routes/data.test.ts`.** Measured at ~1 in 12 runs of that
  file alone, on a DIFFERENT test each time — `deleting the terminal
  plan-linked log un-counts`, `two sequential advancing saves stamp
  consecutive indexes`, `returns the full row, steps included, for the owner` —
  and — in every instance observed AT THE TIME, an absolute the amendment
  immediately below FALSIFIES — with the same signature, a response-body
  field reading `undefined` (`expected undefined to match object
  {planKey: 'head', planIndex: 0}` at the `list.body.find(...)` on line 2585
  is the fullest capture of that signature). **Reproduced at 1/25 against
  `3a294bd7`'s own copies of `data.ts` and `data.test.ts`**, so it predates
  that task and is not Wave E's. The shared shape of THESE THREE is a LIST or
  GET read coming back WITHOUT the row a POST just created, which points at
  the fake store's insertion ordering rather than at any one test —
  narrowing, but not choosing, between the two theories below. Three named
  instances, where the entry below has two.
- **AMENDED AGAIN 2026-09-03 (Wave E PR2 Task 7, fix round 2): the "always"
  in the entry above is FALSIFIED — a SECOND signature exists, and it is a
  STATUS CODE rather than a body field.** Found when a full
  `--project unit --project client` run came back `1 failed | 6684 passed`
  and the immediate re-run was clean. Characterised the same way the entry
  above was, by running `server/routes/data.test.ts` alone:
  **3 failures in 26 runs (~1 in 9)**, a DIFFERENT test each time —
  `rejects a bad pain value with 400, POST's exact message`, `rejects a
  splitSeconds outside the baseline band (60..240), naming the field`,
  `400s machineSummary.verificationBytes as a negative byte` — and every one
  a validation test that got `expected 401 to be 400` (once) or
  `expected 403 to be 400` (twice). Not one read `undefined`. 401 and 403
  are MIDDLEWARE refusals that land before the handler validates anything,
  so this half looks like per-test auth/availability state rather than the
  fake store's insertion ordering — NAMED, not chosen, per this entry's own
  standard. What both signatures share is a request seeing state that some
  other test owns.
- **TWO unit-project flakes, cause UNKNOWN.** On 2026-08-30 during #233:
  `server/routes/data.test.ts` > `PATCH /api/logs/:id` > `an explicit null
  clears thumbs previously set to a real value`, then `GET/PUT /api/prefs` >
  `PUT updates a field and GET reflects the merge` (expected `#00ff00`, got
  undefined). Fifteen clean full runs since, across both. What is OBSERVED:
  two different tests, both supertest against the in-memory fakes, both
  failing as `expected undefined to be <value>` on a response-body field.
  What is INFERENCE, explicitly unchosen (#235's review: reruns do not pick
  a mechanism, and `undefined` does not distinguish a transport failure
  from wrong/partial JSON): a socket failure under parallel-worker load, or
  shared state in the fakes (`insertionSeq`/`logsInsertionSeq`, `Date`
  ordering). The prefs fake's read path is a synchronous per-instance Map,
  which weighs against the second theory but does not eliminate it.
  **Attribution waits for the next failure's captured status, body, and
  stack — capture it rather than re-running past it.** This matters more
  than the known e2e flakes: the unit project has no Docker, browser, or
  network and should be deterministic. **S**
  **THREE files now, and a measured rate (door PR B Task 7, 2026-09-03):**
  a third test joined the set — `server/auth/middleware.test.ts > noStore >
  stamps Cache-Control: no-store` — alongside a `data.test.ts` cursor-
  pagination leg and `server/routes/concept2.test.ts`'s cookie-caller leg
  (`expected 401 to be 200` inside its own mint helper). Rate: **1 failure
  in 10 runs at that branch's head, and 1 in 12 with `data.test.ts` reverted
  to base** — the same rate with and without the branch's only `unit`-project
  file, which is what rules out a regression and keeps this row's "cause
  UNKNOWN, capture the next one" instruction standing. `concept2.test.ts`
  ran 8/8 green in isolation, so it does not reproduce alone.
  **A CLIENT-project flake joined the set on 2026-09-03** (the `rowingActive`
  branch, across four full runs): `ConnectedSurface.screens.test.tsx > screen
  fixtures for pnpm screenshots > pane C, the grid mid-rest (RC-24)` failed
  once as a SNAPSHOT mismatch and passed on an identical re-run minutes later,
  on an unchanged tree. This row's title says "unit-project" and its whole
  inference section reasons about supertest against in-memory fakes — neither
  covers a jsdom snapshot in the `client` project, so the row's SCOPE is
  widened here rather than the observation being filed under a mechanism it
  does not share. What is OBSERVED: one failure, one identical green re-run,
  no code change between them. What is INFERENCE and explicitly unchosen: the
  same parallel-worker load theory, or snapshot serialisation racing a
  concurrent write. **Same standing instruction: capture the next one's full
  diff rather than re-running past it.**
- **`retest.spec.ts` is not idempotent across runs on a KEPT stack — the
  e2e suite passes on a fresh database and fails on a reused one.** Found
  2026-09-03 on the `rowingActive` branch, and DIAGNOSED rather than
  re-run past. `retest.spec.ts:121` ("declining the offer keeps the
  baselines untouched") failed twice in a row — reproducible, not a flake —
  expecting the heading `Set your 2k baseline?` and landing on Today
  instead. It is not that branch's doing: the only e2e-reachable file it
  touches is `transports/fake.ts`, verified to have **0 non-comment changed
  lines** against base. **The mechanism:** `pnpm e2e` leaves the stack up
  (`E2E_KEEP` defaults to `1`) and `e2e.sh` tears down with
  `docker compose down` and NO `-v`, so the per-worktree `pgdata` volume
  survives every run. A test asserting "you have not set a baseline yet" is
  exactly the shape that breaks once an earlier run in the same stack set
  one. **Proof:** `docker compose -p <stack> down -v`, then `pnpm e2e` →
  `455 passed (2.4m)`, against `454 passed / 1 failed` twice on the reused
  volume. **Why it matters beyond one test:** CI is unaffected (fresh
  containers every job), so this only ever bites a human or agent iterating
  locally — and it bites as a mystery failure in a spec they did not touch,
  which is the most expensive shape a false red can take. The fix is either
  a test that seeds its own precondition instead of assuming a virgin
  database, or an `e2e.sh` that resets the schema between runs; the first is
  narrower and is the one to try. **S**
- **RESOLVED (post-#233 follow-ons): the screenshots project's version pin
  can no longer rot independently.** The class was two independent literals —
  `news.spec.ts`'s (CI-gated, bumped by every notes PR) and
  `screenshots.spec.ts`'s (no CI job, rotted at v0.18.0/#166 and
  v0.27.0/#232). Both now import ONE constant, `e2e/releasePin.ts`, so the
  ungated copy cannot drift from the gated one and CI still forces the bump
  through `news.spec.ts`. Running the screenshots project in CI was
  considered and not taken: it buys nothing this doesn't once the literals
  cannot diverge, at the cost of a capture pass per push. Deriving the pin
  from `RELEASE_NOTES` was rejected as a mirror (RF11) — the screen renders
  that same module, so it could only ever catch render breakage.
- **AUD-012 — correct the booting-replica claim.** Two complete servers really
  race before the seed lock on an empty database, but the supported deployment
  is explicitly serial and single-replica. This is Confirmed P3 documentation
  debt, not a current rollout defect: correct
  `2026-08-04-library-converge-design.md` with the next deployment-doc PR, and
  require a complete two-process gate only before overlapping replicas become
  supported. Evidence: the codebase-integrity audit's `findings.md`.

- **Door 1's adjust step shows a PROPOSED number with no provenance eyebrow of
  its own.** Revisit if that step becomes reachable without passing the offer.
- **19 of the 90 committed captures no longer reproduce, and one is
  nondeterministic.** This was filed on 2026-08-18 as `today.png`'s
  "unexplained onboarding read-marker diff", reverted where it surfaced and
  never explained. **Measured 2026-08-28 and it is far wider than one file.**
  A bare `pnpm screenshots` on a clean branch regenerates 19 files that differ
  from what is committed: `today*.png` (5), `log-*` (4), `post-workout-*` (3),
  `you*.png` (6), `releases.png`. **Run as a control on a second worktree
  whose branch touched none of those screens, the SAME 19 moved** — so the
  drift is environmental, not anything a PR did.
  **And `you.png` differs run-to-run against the same stack on the same day**
  (two consecutive `pnpm screenshots` invocations, differing md5), while
  `today.png`, `releases.png` and `log-history.png` were stable across those
  same two runs. So there are two distinct problems here: 18 captures that are
  merely stale, and at least one that is genuinely nondeterministic.
  **Why it matters beyond tidiness:** captures are the PR's visual record and
  a reviewer's only look at a screen. Right now any PR that regenerates them
  ships 19 files of noise that bury the one real change, which is exactly what
  makes a wrong capture survive review (recurring failure 7). **The
  nondeterministic one is the half to chase first** — a capture that changes
  without the app changing cannot be a record of anything. **S/M**
- **A read is lost if you leave an article before its read-state GET lands.**
  Prose renders instantly, read state waits on a network GET, and BACK in that
  window drops the read permanently. Reproduced: `7 UNREAD` held against an
  expected `6` across 13 polls. `Reader.tsx:32` still gates on
  `reads.state === "ready"` with no unmount path. **NOT fast path — the failure
  mode is a lost record, and it wants a spec. Binding: `news.spec.ts:140` will
  flake under load and SHOULD; do not make that test wait the app's race
  away.** **M**
- **Harden the post-save offer against the library-loading race** — on a slow
  real device it can eat a real rower's offer. **Product-shaped, not a test
  tweak.** **S/M**
- **Retire the SEED's use of `LEGACY_TITLE_RENAMES`** once every deployed
  environment has booted past the rename. Scope correction:
  `session_logs.workout_title` keeps the old spelling FOREVER, so the trigger
  is about the workouts table only. **Second correction (2026-08-30): the MAP
  itself is now permanent and must not be deleted with the pre-pass.** The map
  moved to `domain/onboarding.ts` and gained a second, non-expiring reader —
  `canonicalTitle`, which the Plan screen uses to recognise a checkpoint rowed
  under a retired title. Workout rows converge; log snapshots never do. What
  retires is `seed.ts`'s rename loop, not the aliases.
- **The e2e stack-reap race** — a sibling worktree boot once produced 117
  ECONNREFUSED; `stack-reap.sh` racing `git worktree list` is the suspicion.
- **Migrate `DEVIATIONS.md`'s first table to stable IDs.** The 2026-08-28 docs
  audit found eight rows describing code that no longer matches them and about
  fifteen "see row N" cross-references pointing at the wrong rows — some of them
  in code comments and test names, not just in the file. **The cause is
  structural:** rows are identified by POSITION, so every insertion invalidates
  every reference above it. The file's SECOND table already uses stable IDs
  (`IMP-2`, `IMP-6`) and has not rotted. A one-off renumbering rots again at the
  next insert; the migration is the fix. The eight broken rows are listed in the
  file's own audit note. **M**
- **The iOS build-machine first-time setup does not exist.** `RELEASING.md` and
  `deploy.md` pointed at each other for it; both pointers were corrected to say
  so plainly. What is missing is everything between a fresh Mac and a working
  `pnpm ios:release`: Xcode and command-line tools, the signing certificate and
  provisioning profile, the App Store Connect API key, and the Google iOS OAuth
  client. **Trigger: the next time a build Mac is set up — write it while doing
  it.**

---

# Icebox

Not scheduled in any wave. Reconsider only when the recorded trigger fires;
an iceboxed item is not a phase-close requirement.

- **Correct Resume — deferred by James, 2026-09-03.** **Trigger:** a
  diagnostic-backed, naturally occurring authoritative mid-row link drop
  demonstrates that today's End/save fallback materially fails the rower.
  Lock/resume gaps and deliberate radio-off probes do not establish demand.
  Rationale and accepted incomplete-capture cost: `.claude/agents/pm-ledger.md`,
  "Correct Resume: need before mechanism". The former spec
  `docs/superpowers/specs/2026-09-03-correct-resume-design.md` and Gate 0 are
  retained research, not implementation authority; re-scope and approve afresh
  at the trigger. Not gated on Wave A finishing if the incident arrives sooner.

---

# After the strangers

Deferred, not killed. One line and one trigger each. No exits and no sizes — a
trigger is the whole entry.
- **Phase PS — personal stats.** The app's stated purpose, and it matters most
  at day 30 and least at day 1: a stranger has no history to trend. **Trigger:**
  a tester has enough history for a trend to be honest. Carries a live hazard
  already measured — `session_logs.distance_meters` means FUSED before RC-5 and
  WORK-ONLY after, **with no stored marker saying which** — so any "metres per
  week" arithmetic sums two definitions unless it re-derives a consistent
  population per row or explicitly accepts the seam and says so.
- **The plan calendar** (was Phase 8B's first item). Spec written and merged
  (`docs/superpowers/specs/2026-08-22-plan-calendar-design.md`). James's rulings
  stand: **the grid is a RECORD** — dates for done sessions only, future days
  empty, the sequence list stays the dateless future; ALL logged sessions mark
  the grid, with plan-linked ones distinct; date-keyed events ship later in their
  own phase, and the mark system reserves them a class. **Trigger:** James asks.
- **Date-keyed event suggestions** (James: _"trick or treat Trot"_). A globally
  authored one-off surfaced on a specific calendar date, not part of the plan but
  loggable against it. **This is a THIRD producer kind** — checkpoints are
  index-keyed, reservations are rower-authored, events are date-keyed and
  global — and the first real two-producers-one-day case, so it fires the
  precedence resolver with it. **Trigger:** the calendar ships.
- **ASKED AND ANSWERED, 2026-08-31.** The two entries here whose trigger is only
  "James asks" were put to him directly — the plan calendar (spec merged,
  rulings settled, nothing owed but the word) and the parametric generator
  (trigger already FIRED). **Both stay deferred: "neither yet, revisit after the
  front door."** Both serve a rower who already has history and a library, and
  the slate is ranked on a stranger. **Re-ask at Wave A's close** — a scheduled
  question now, not an open one, and it is not re-raised before then.
- **Phase CL2 — authoring parity.** A real capability gap: the domain, the import
  grammar and a third of the library support lead-lines-then-block, and the
  builder cannot author it because the repeat is hoisted into a single form field
  (`builderState.ts`'s `f.reps`). Not a stranger blocker — a stranger rows the
  seeded 300. **The import half is not deferred:** `bulk.ts:268` already parses a
  positional `xN`, so verifying parity end to end and documenting the syntax in
  the import screen rides any PR touching import. **S**
- **Two single-rower comfort settings** from the old Phase 9: pre-workout
  countdown length 0–60 s, and pace tolerance 0–3 s. **Trigger:** the next
  You-screen PR — they are cheap and they ride it.
- **The rest of the old Phase 9's preferences**, which was killed as a phase for
  its multi-user framing (_"Two users with different preferences get different
  Today suggestions"_) rather than for its content: the suggest-workouts-at
  difficulty chips and time-available cap with a live "N of M match" readout,
  feeding Today and clearing `todayPick`; accent colour as a real setting; and
  every preference persisted per-user. **Trigger:** a tester says Today keeps
  suggesting workouts they do not have time for. The first item is the only one
  with a plausible complaint behind it; the other two are polish.
- **The device account switcher** (the design's SWITCH flow). **Trigger:** a
  second rower actually shares your phone at the erg.
- **A rower-authored reservation** (was Phase 8C). The `kind` discriminant seam
  8A built stays in place for it. **Trigger:** James asks, or a second rower asks.
- **The workout rating system.** **Trigger:** a tester says the suggestions are
  wrong — the only signal that would prove the existing post-workout thumbs
  insufficient. Note what killed the phase it came from: the reflection already
  asks _"do you want more sessions like this one"_, and a second control meaning
  almost-but-not-quite the same is worse than none.
- **Store metadata and the legal surface.** **Trigger:** App Store submission
  rather than external TestFlight.
- **PWA installability.** **Trigger:** the web build stops being only a harness.
- **Apple Health (HealthKit)** — write rowing workouts from the iOS shell.
  **Trigger:** James asks.
- **Phase NF — tap the monitor to connect** (NFC; James, 2026-08-31, after
  connecting via NFC in Concept2's own ErgData). The PM5 "configures itself as a
  Near Field Communication Tag A" whose first NDEF record,
  `concept2.com:bleconnectinfo`, holds a 6-byte BLE address, an address type,
  and **an advertising name up to 31 bytes** — `PM5 430343693` (PM5 Bluetooth
  Smart Interface Definition v1.30, §"Near Field Communication NDEF Records",
  PRIMARY, quoted from the PDF at
  `concept2.com/files/pdf/us/monitors/PM5_BluetoothSmartInterfaceDefinition.pdf`;
  our own `docs/monitor/` transcriptions do not cover this section). That name
  is exactly what our connect path already filters on
  (`capacitorBle.ts:480`, `namePrefix: "PM5"`), so a tap turns the modal device
  sheet into one erg rather than twenty in a gym. **The MAC is dead weight on
  iOS** — CoreBluetooth exposes opaque per-device UUIDs, never hardware
  addresses (INFERENCE from the platform, to be confirmed at spec time) — and
  the tag's second record is an Android Application Record (`android.com:pkg` →
  `com.concept2.ergdata`) with no iOS equivalent, so this is an in-app "hold
  your phone to the monitor" affordance, never a tap-with-the-app-closed launch.
  **It does not remove the erg-side ritual**: the PM5 still has to be on its
  Connect Device screen, because the tag is a lookup shortcut and not pairing.
  Costs: the `com.apple.developer.nfc.readersession.formats` entitlement plus an
  `NFCReaderUsageDescription`, which regenerates the provisioning profile the
  CLI release path uses, and a plugin (`@capgo/capacitor-nfc` 8.2.5 tracks
  Capacitor 8, which we are on — re-verify at install per the standing rule).
  **First work of the phase is the unverified pair**: that iOS Core NFC reads
  this external record off a real PM5 at all, and that the name the tag states
  is byte-identical to what CoreBluetooth's scan reports. A Flipper dump of
  the tag lives in `docs/monitor/nfc/` (2026-08-31, PARTIAL: header only —
  it confirms the 27-byte external type and a 40-byte payload, but the
  payload itself is still owed; the README says how to get it). **Trigger:** anytime —
  it is post-production polish for a household that already pairs fine, so it
  waits behind the front door and then only needs James to ask. **S/M**
- **The parametric workout generator** — "generate me a 45' AT workout".
  **Its trigger has FIRED** (Phase 6 closed the loop, and `patterns.json` is the
  exact fixture it would consume), so this is eligible to schedule whenever it is
  wanted.
- **Row without a baseline set** (James, 2026-08-23): every workout rowable with
  no baseline, targets simply absent. **Partially delivered by Phase JR's
  design** — the "nobody is ever blocked from just rowing" half is the connected
  Just Row door; the every-workout-targetless half remains.
- **"Which days did I override, and what was the other suggestion?"** (James,
  2026-08-12). Two questions in one sentence: the CHECKPOINT half needs no new
  capture (`plan_index ∈ {6,34,62}`, **not** `workout_title`), and the FREE-FORM
  half is not backfillable and is not one column. **Trigger:** James wants the
  retrospective screen.
- **Library export and import** (private JSON). **Trigger:** a second active
  rower asks.
- **Auto-capture baselines from the onboarding log** — the number a rower types
  by hand already exists on the row they just saved. **Trigger:** a signal that
  manual entry is real friction.
- **The PM5's internal log as an external oracle** (`0x99`/`0x6A`). **Hard limit,
  decisive:** the identifier list contains no per-stroke record, so it can never
  validate the 1 Hz SHAPE, only the boundaries. Partly superseded — `0x003F` is
  now subscribed and its bytes stored.
- **Undefined rest** (was Phase UR). The C2-sourced research survives at
  `docs/monitor/undefined-rest.md`. **Trigger:** a tester asks for self-paced
  rest. Sizing note that survives with it: `src/session/engine.ts` walks a frozen
  phase list on a clock and has **no phase kind that ends on a user event**,
  which is the real cost — plausibly L, not the grammar change it looks like.
- **Tier-2 on-device recording.** Prerequisites: a hard byte bound, a persist
  trigger that is not the terminal transition, an export path (there is zero
  IndexedDB in `src/`), and the on-device delivered rate.
- **Cron and ntfy revival on the WOD fetcher.** **Trigger:** James wants WODs
  pushed.

---

# Completed phases

One row each. The body is in `docs/history/`, archived verbatim, and it is a
RECORD — do not cite it for a live question.

- **Phase SF** — SHUFFLE actually shuffles, Today rolls a type and keeps its filters per type, TIME is a minutes range, the sources read ERGOMATIC LIBRARY / MY WORKOUTS, the Library is searchable by name · closed 2026-09-05 · #296, #297, #300, #301 · released v0.38.0 · [detail](docs/history/phase-sf.md)
- **Wave F** — received work survives lifecycle interruptions; true link loss has an honest End/save fallback · closed 2026-09-04 · [detail](docs/history/wave-f.md) · [native exit walk](docs/monitor/sessions/walk-2026-09-04-wave-f/README.md)
- **Phase 0** — the repo where bad code cannot be committed: pnpm, TS strict, Vitest 3-project, husky, CI · closed 2026-07-27 · #1 · [detail](docs/history/phase-0.md)
- **Phase 1** — every push to main lands on a real URL with health-gated auto-rollback · closed 2026-07-28 · #6, #7, #8 · [detail](docs/history/phase-1.md)
- **Phase 2** — Google OAuth sign-in, per-user data isolation, the You screen's first row · closed 2026-07-28 · #9, #10 · [detail](docs/history/phase-2.md)
- **Phase 3** — Ergomatic on an iPhone via Capacitor and TestFlight, same web code · closed 2026-07-28 · #11, #12, #13, #14 · [detail](docs/history/phase-3.md)
- **Phase 4** — the Erg Book maths encoded once and pure, plus the 35-workout starter library · closed 2026-07-29 · #15, #16, #17, #18, #19 · [detail](docs/history/phase-4.md)
- **Phase 5A** — the first real screens: Library, workout detail, the baseline editor · closed 2026-07-29 · #21, #22 · [detail](docs/history/phase-5a.md)
- **Phase 5B** — workouts can be authored in the app instead of hand-edited in seed data · closed 2026-07-30 · #23, #24 · [detail](docs/history/phase-5b.md)
- **Phase 5C** — device-testing fixes, and the workout number retires in favour of `sort_order` · closed 2026-07-30 · #25 · [detail](docs/history/phase-5c.md)
- **Phase 5D** — a workout authorable with a thumb: implicit repeat, clone, unit toggles · closed 2026-07-30 · #26 · [detail](docs/history/phase-5d.md)
- **Phase 5E** — the accordion builder: one step open at a time, the vertical cost gone · closed 2026-07-31 · #27, #28 · [detail](docs/history/phase-5e.md)
- **Phase 5F** — builder entry: clock durations, typable SPM and rest · closed 2026-08-01 · #29 · [detail](docs/history/phase-5f.md)
- **Phase 5G** — MAX/MIN effort refs as a PaceRef union · closed 2026-08-01 · #30 · [detail](docs/history/phase-5g.md)
- **Phase 5H** — a CUSTOM badge and filter, and iOS stops popping Copy/Look Up on every control · closed 2026-08-01 · #32 · [detail](docs/history/phase-5h.md)
- **Phase 6A** — Today, Plan and Confirm: the first suggestion a rower is offered · closed 2026-08-02 · #33, #34, #35 · [detail](docs/history/phase-6a.md)
- **Phase 6B** — a confirmed session runs itself: countdown, every phase kind, survives a reload · closed 2026-08-02 · #37, #38 · [detail](docs/history/phase-6b.md)
- **Phase 6C** — the core loop closes: a finished session becomes history the same day · closed 2026-08-02 · #40 · [detail](docs/history/phase-6c.md)
- **Phase 6D** — visible filters on Today, type-swap without losing the plan, outside-plan logging · closed 2026-08-03 · #42 · [detail](docs/history/phase-6d.md)
- **Phase 6E** — 300 original workouts replace the 35-workout starter set, seeded by convergence · closed 2026-08-04 · #46, #49 · [detail](docs/history/phase-6e.md)
- **Phase 6F** — one button system, exact targets, one discard voice, the Library filter sheet · closed 2026-08-04 · #47 · [detail](docs/history/phase-6f.md)
- **Phase 6G** — Today's chip rows fold into the Library's own filter-sheet pattern · closed 2026-08-05 · #50, #51 · [detail](docs/history/phase-6g.md)
- **Phase 6H** — News replaces Trend: pinned explainers, a latest feed, release notes, read state that syncs · closed 2026-08-08 · #54, #55, #56, #57, #58 · [detail](docs/history/phase-6h.md)
- **Phase 6I** — a baseline-less rower is walked to a set baseline from Today itself · closed 2026-08-09 · #63 · [detail](docs/history/phase-6i.md)
- **Phase 6J** — superseded, never built; promoted to Phase PS · closed 2026-08-24 · #185 · [detail](docs/history/phase-6j.md)
- **Phase 7A** — the PM5's protocol, workout compiler and runtime driver, no screens · closed 2026-08-06 · #52 · [detail](docs/history/phase-7a.md)
- **Phase 7A-fix-2** — 0x81 is an ACCEPT: the CSAFE status byte is a bitfield, and what that withdrew · closed 2026-08-06 · #52 · [detail](docs/history/phase-7a-fix-2.md)
- **Phase 7A-fix-3** — programming a mid-piece erg no longer arms an empty workout · closed 2026-08-07 · #53 · [detail](docs/history/phase-7a-fix-3.md)
- **Phase 7B** — the connected surface: the PM5's own numbers on the phone · closed 2026-08-08 · #59, #60 · [detail](docs/history/phase-7b.md)
- **Phase 7C** — a PM5-driven session logs with the machine's own splits · closed 2026-08-09 · #64 · [detail](docs/history/phase-7c.md)
- **Phase 7D** — phone BLE, after a three-day hardware walk that found four wire truths · closed 2026-08-11 · #79 · [detail](docs/history/phase-7d.md)
- **Phase CL** — one home for seven remainders: bulk-import transactions, builder drafts, per-worktree compose, News scroll memory · closed 2026-08-10 · #65, #66, #67, #68, #69, #70, #75, #76 · [detail](docs/history/phase-cl.md)
- **Phase FF** — fast-follow: finish authority, and one door to start · closed 2026-08-11 · #85 · [detail](docs/history/phase-ff.md)
- **Phase CR** — the connected revamp: two panes, two heroes, one honest bar · closed 2026-08-13 · #89, #90 · [detail](docs/history/phase-cr.md)
- **Phase CR2** — the connected screen's numbers stop lying: session totals, four honest state axes, the redesign · closed 2026-08-17 · #99, #100, #101, #102, #104, #105, #106, #109, #111, #112 · [detail](docs/history/phase-cr2.md)
- **Phase PW** — the summary replaces the post-row flow, and every past session opens from history · closed 2026-08-18 · #117, #118, #121, #122 · [detail](docs/history/phase-pw.md)
- **Phase CS** — connected polish: the swipe returns, and NEXT says more · closed 2026-08-18 · #116, #119, #120 · [detail](docs/history/phase-cs.md)
- **Phase CM** — connected metrics: the interval's average, the session's metres · closed 2026-08-18 · #123 · [detail](docs/history/phase-cm.md)
- **Phase LG** — closed as a pointer: the label fix shipped inside PW spec 1, and the enum rename stays out · closed 2026-08-18 · #117 · [detail](docs/history/phase-lg.md)
- **Phase LT** — intervals judge against their own targets; the row is captured at 1 Hz and drawn as a trace · closed 2026-08-20 · #128, #129, #130, #131, #132, #137 · [detail](docs/history/phase-lt.md)
- **Phase WU** — the warm-up setting, preference and phase kind are removed entirely · closed 2026-08-22 · #148, #149, #150, #151 · [detail](docs/history/phase-wu.md)
- **Phase 8A** — plan checkpoints: the plan suggests a test at sessions 7, 35 and 63 · closed 2026-08-22 · #155, #156, #157 · [detail](docs/history/phase-8a.md)
- **Phase BL** — three doors into a baseline, a rowed test that finally gets recorded, and provenance on every number · closed 2026-08-23 · #159, #161, #164, #165, #172, #175, #179 · [detail](docs/history/phase-bl.md)
- **Phase LL** — the app stops lying about a link it has lost: a watchdog, a retry that works, and diagnostics you can reach · closed 2026-08-23 · #138, #139, #140, #141, #142, #143, #144, #146, #153, #160, #163, #171, #174, #177 · [detail](docs/history/phase-ll.md)
- **Phase RC** — work and rest stored separately, the machine's own summary carried into the record, three heroes that agree, and two oracles that are not mirrors · closed 2026-08-28 · #167, #174, #177, #180, #182, #183, #190, #191, #192, #194, #196, #197, #206, #207, #208, #209, #211, #212, #213 · [detail](docs/history/phase-rc.md)

**Bugfix rounds** — the merged-PR changelog and the rounds' own history live in
[docs/history/bugfix-rounds.md](docs/history/bugfix-rounds.md). Its four live
items were lifted into the open-item register above.

## Killed at the 2026-08-28 rebalance

Four phases, eleven items, no named party disappointed. Each body is archived
with a banner saying why, so the reasoning survives and the decision is not
re-litigated by accident.

- **Phase 8C — rower-authored prescriptions.** Its own text: _"No demand has
  been observed — this exists because James said in the 2026-08-12 session that
  he 'may one day' want it."_ The seam it needed is already built and stays.
  [detail](docs/history/phase-8c.md)
- **Phase UR — undefined rest.** Its own text: _"a machine capability we lack,
  not a reported gap."_ The research was the valuable part and survives at
  `docs/monitor/undefined-rest.md`. [detail](docs/history/phase-ur.md)
- **Phase 10 — multi-rower and polish.** Hollow since 2026-08-20 moved its three
  release-gate items to PROD; the north star actively deprioritises the rest,
  because strangers have their own phones. [detail](docs/history/phase-10.md)
- **Phase LQ — library quality.** The variety debt is invisible to a rower who
  rows one workout a day, and the rating item argued against itself in its own
  text. [detail](docs/history/phase-lq.md)

**Phase PROD was not killed — it was redistributed.** Its eleven items became
Wave A (Apple sign-in), Wave C (icon, type disclosure, accessibility, calm
motion, cold start), Wave D (simulator, native fake flag, e2e typecheck) and the
deferred section (store metadata, PWA installability). The phase itself is gone
because it was named for an outcome its item list did not cover.
