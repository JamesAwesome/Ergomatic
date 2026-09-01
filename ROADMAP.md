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
| Offline           | Active session (timer state, in-progress log) persists in localStorage; reload or dropped connection never loses a workout; log save syncs to the API                                                                                                                                                     |
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

**The order, and why it is not strict north-star ranking.** Wave F ships before
the front door on purpose. Opening the door to strangers while a phone in a
pocket silently eats a rowed piece is worse than opening it a week later.

## Active audit overlay — Codebase integrity

**Status:** COMPLETE. Read-only overlay; it is not a seventh product wave and
does not displace Wave F. The fixed-baseline audit is governed by the
[approved spec](docs/superpowers/specs/2026-08-28-codebase-integrity-audit-design.md)
and [execution plan](docs/superpowers/plans/2026-08-28-codebase-integrity-audit.md).

- [x] Complete all five audit lanes with an evidence-backed disposition.
- [x] Revalidate promoted findings against current `main` and assign each fix
      exactly one live ROADMAP owner before handoff; the audit report is not a
      second backlog.

The phase-close gate transfers actionable items into Wave F, Wave A, and the
open-item register below. P3 and unsupported-trigger results stay in the risk
register or ride the next relevant PR; no unchecked work lives in this overlay.

| Wave  | What it is                  | Size | Tester sees                                 |
| ----- | --------------------------- | ---- | ------------------------------------------- |
| **F** | Lifecycle: stop losing rows | L    | Yes, and it is the most valuable thing here |
| **A** | The front door              | L    | Yes, immediately                            |
| **D** | The toolbox                 | M    | Nothing                                     |
| **B** | Backups and telemetry       | M    | Nothing                                     |
| **C** | The submission surface      | L    | The most visible wave                       |
| **E** | The Concept2 logbook        | L    | After PR2 ships the send surface            |

## Phase JR — Just Row

**Status: Active — PR 0a instrument and PR 0b capture both DONE 2026-08-31
(#246). Six OPEN questions answered outright; OPEN 3's remaining half is
CLOSED BY RULING, not by evidence (James, 2026-09-01: assume the connection
stays open indefinitely, and do not close it ourselves — let the link die by
other means). **PR 1 IS IN REVIEW (#255)**: no new `ended_by` member and no
inactivity rule. **The walked-away case does NOT ride the existing recovery
path — that claim was falsified at PR 1's antagonist pass (F2)**: Today's
"Log it" is gated on a non-null `workoutId` and the row itself on
`completedAt === null`, so a workout-less run is discard-only in one branch
and invisible in the other. Opening both gates is PR 2's, and **PR 2 must
not be split at that boundary** — shipping the surface without the recovery
would deliberately ship the defect ruling 9's correction found (PM gate,
2026-09-01).**

This is a deliberate household exception to the stranger-first
ordering, requested by James on 2026-08-31. Walk record and full decodes:
`docs/monitor/sessions/walk-2026-08-31-justrow/README.md`; runsheet at
`docs/monitor/sessions/walk-phase-jr-capture/RUNSHEET.md`.

**The headline is good: 0x0031's elapsed and distance do NOT reset at the
5-minute auto-split**, so a long free row stores as its true length and PR 2's
two headline numbers are safe. **Two capture findings re-open design,
though, and they must be settled before PR 1 tags its enum** (both are
written up in the spec's own CLOSED section):

- **The PM5 does not advertise while a Just Row is open**, so the app cannot
  connect mid-row and cannot reconnect after a mid-row link drop. The spec's
  "already mid-Just-Row at connect" path is struck; the Today recovery row can
  only mean "log what we have", never "resume".
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

---

## Wave F — Lifecycle: the app stops losing rows

**Status:** OPEN and shipping — three of its items are struck (#228 in
v0.27.0, #239 in v0.30.0, and the ring-recovery item struck unrecoverable on
2026-08-31); the lifecycle spec is WRITTEN
(`docs/superpowers/specs/2026-08-31-lifecycle-design.md`, four PRs), and
correct resume and the `door` column remain beside it. **TRIAD** (stored
shapes: the `door` column, and the lifecycle spec's fifth `CloseReason`).
**L.** Absorbs the rest of Phase LM, whose PR 1 shipped as #198 / v0.24.0.

**Goal:** a phone in a pocket, a phone that locks, and a link that drops all
stop costing the rower the row they actually did.

**Why it is first:** the pocketed-phone row loss is reproduced on hardware, in
production, this week. It is the only defect in this file that destroys a
rower's work silently.

- [ ] **The pocketed-phone row: a whole piece rowed and nothing kept.
      RE-DIAGNOSED at the phase-open anchor pass, 2026-08-28.** The outcome is
      real (James's row, walk leg 4, v0.25.0 build 759, production), but this
      item's original mechanism — "stays `phase=ready`, opens no record, End
      silently discards" — was FALSE by its own cited ring: the record OPENED
      at machine elapsed 43.04 s (`rowing-active-fallback`'s single emit site
      is inside the branch that calls `createMonitorRun`,
      `useMonitorSession.ts:1909`; `phase=live` by seq 35), and a late open
      costs only the series trace's head, never the interval actual — that is
      the machine's own 0x0037/0x0038 pair stored verbatim
      (`parse.ts:653-676`). **The proven chain: the fallback opened the
      record late; the erg then dropped its own program mid-row (seq 37,
      RC-37's readback signature, no Menu press); and the hook ignores
      `programDropped` whenever `phase` is not `programming`/`ready`
      (`useMonitorSession.ts:2319-2320`, its own comment conceding the live
      case was "left alone rather than guessed at"). That the ignored drop
      is what cost the row — no boundary afterwards, zero actuals stored —
      is the LEADING HYPOTHESIS, not proven: the committed ring is a curated
      excerpt that omits what End stored, so it cannot prove an absence
      (James's PR #225 review).** Deliberately not claimed in v0.26.0's
      notes. Its three work items are the next three entries. **M**
      **SPECCED 2026-08-31: `docs/superpowers/specs/2026-08-31-lifecycle-design.md`
      §0.1, which carries this chain and keeps link 3→4 labelled a
      hypothesis. The hypothesis is now PERMANENTLY unprovable — see the
      struck ring item below — so the spec is written around it rather than
      waiting on it.** The cited hook line numbers moved with PR #239; the
      handler is `useMonitorSession.ts`'s `programDropped` case, found by
      name rather than by line.
- [ ] **Handle `programDropped` while a run is live** (from the
      pocketed-phone re-diagnosis above). Small and deterministic, warranted
      whatever the full ring says — the detector already fires; only the
      live arm swallows it, and that arm has NO test
      (`useMonitorSession.test.ts` covers only `ended`). The spec says what
      the rower sees and what the record keeps. **S**
      **SPECCED as `2026-08-31-lifecycle-design.md` §1, and it is that
      spec's PR 1, shipping alone.** The scoping premise that justified
      ignoring a live drop — the handler's own "the walk's trigger is READY,
      never a live session" — is FALSIFIED: the 2026-08-28 walk produced the
      same signature with no Menu press, after a 67 s background. Closes as
      a normal ended session with a fifth `CloseReason`,
      `"program-dropped"` (James, 2026-08-31), and hands off to the log.
      **Carries a server migration** — `ended_by` is a Postgres `pgEnum`, a
      hard 400 validator names the five values, and the server's `EndedBy`
      union is a hand-copied mirror; all three widen in one commit, gated by
      a `POST /api/logs` seam test (this row said "no migration" until
      James's rev-2 review; that was the client-side story only). **TRIAD**
      (stored close reason + the enum migration). Gate 0 CLEARED in full
      (2026-08-31, with the spec PR's merge word).
      **SHIPS as the live-drop PR from spec §1, 2026-08-31** — all five
      tasks committed (union widened end to end + migration; the hook's
      live arm publishing `closeReason`; the real-driver seam test; the
      two Gate-0 surfaces; this composition drive-through). **PR #248**,
      PM final gate GO-WITH-CONDITIONS 2026-08-31.
- [ ] **The pocketed-phone window's two co-producers. RE-SCOPED on evidence
      2026-08-31 — one is not a defect.** `pause-declared` at 66 spm while
      rowing is real and stays here, owned by
      `2026-08-31-lifecycle-design.md` §4, and it deliberately WAITS on that
      spec's §3 instrument rather than being fixed on the stale-frame story
      (66 spm is consistent with a stale reading, not evidence of one).
      **TWD 52→0→64 m non-monotonic is CORRECT BEHAVIOUR and leaves this
      item:** `continuity.ts`'s `check` convicts a reset only when TWD,
      elapsed AND distance all read backward together — TWD alone is the
      documented F2a false kill that rule exists to prevent, and it rightly
      returns `"continuation"`. What that comment does confess is re-filed
      to the open-item register: the distance-goal suppression covers all
      six committed captures, so the F2b count bound has been compared on
      ZERO pairs ("clean but VACUOUS", its own words). **S**
      **§3 SHIPS in Wave F PR 2**, alongside §2 and §6
      (`useMonitorSession.ts`): every resume edge records `resume-first-frame`
      (the arrival gap, whether the first post-resume frame repeats the
      pre-background `freezeKey` triple, the raw `rowingState` byte); a
      repeating run is then tracked as `resume-stale-run` and closed with a
      consecutive-identical count by one of FOUR closers, each named in the
      entry's own `endedBy=`: a differing frame (`changed`), a second resume
      edge arriving while it is still open (`resumed`), a per-run reset
      (`reset`), or teardown (`teardown`). §4's wait is now on the next
      natural occurrence producing a reading through it, not on unbuilt
      plumbing.
- [x] **~~Recover the full ring before the lifecycle spec is written~~ —
      STRUCK 2026-08-31: it is UNRECOVERABLE, and the loss was ours.**
      `ergomatic:last-session-log` is written UNCONDITIONALLY on every
      connected teardown including failed pairings and connect-then-cancel,
      one key with no history, so every later session overwrote it —
      and the production connected-row count went 16 (08-28) → 18 (08-30),
      which counts only the sessions that saved a row. Ruled unrecoverable
      by James, 2026-08-31; the lifecycle spec is written around the
      ambiguity. **The excerpt's six gaps were never a lossy instrument:**
      they are INTERIOR (seq 21-39, missing 22/26/31/33/36/38) while the
      ring is capacity-500 and tail-keeping, so it can only ever lose a
      contiguous head — and at seq 39 the cap never fired. The whole ring
      was in hand and 13 of ~39 entries were hand-picked into the committed
      file. Replaced by the ring-durability work in
      `2026-08-31-lifecycle-design.md` §2, which is now a PREREQUISITE:
      the ring is the only instrument that reaches production, and today it
      can only be read by destroying it.
      **§2 SHIPS in Wave F PR 2** (the ring chunk; PR number filled in at
      merge): a three-slot history beside the single perishable key (the last
      three LOGICAL connected sessions' exports all survive at once, one entry
      per Connect however many teardown passes it takes,
      `src/monitor/sessionLogHistory.ts`) and the ungated door that lists and
      copies them (You → DIAGNOSTICS → Monitor logs,
      `src/you/Diagnostics.tsx`/`MonitorLogs.tsx`, Gate 0 approved 2026-09-01) —
      exactly the fix that would have saved the pocketed-phone ring, now in
      place for the next one. The same PR also ships §3 (the resume-edge frame
      instrument) and §6 (the RC-29 latch counter, see that register row).

- [ ] **Correct resume** (was LM PR 2). James's ruling, 2026-08-20:
      **"CORRECT RESUME, not a background mode."** **Unblocked 2026-08-26** —
      it was gated on a probe James cancelled, so the probe will never report.
      The newest walks read `framesWhileHidden=1` (2026-08-27) and `1`/`0`
      (2026-08-28) — the older `=2` was walk-2026-08-26b's number; the
      conclusion (suspended, not throttled) is unchanged. **This is a
      build-from-zero item:** `framesWhileHiddenRef`'s sole read is string
      interpolation into a diagnostic line (`useMonitorSession.ts:3072-3079`),
      and `decideResumeLatch`'s latch does nothing that recovers — there is
      no existing resume mechanism to extend. **M**
      **DELIBERATELY EXCLUDED from `2026-08-31-lifecycle-design.md`** (its
      §0.6, skip spoken not silent): build-from-zero, its own M, and the
      pocketed-phone chain does not need it — the late open cost the series
      trace's head, never the interval actuals. Stays a separate Wave F
      item.
- [ ] **RC-29 — LEFT WAVE F on 2026-08-31, same day it was folded in.** It
      was folded in carrying a measured false-positive rate — "9 banners in
      288 s over a link that never dropped (`walk-2026-08-26/`)" — that
      `2026-08-27-link-authority-design.md` revision 4 had ALREADY retired:
      `decideResumeLatch` shipped in v0.24.0 and killed exactly that, and
      the build-759 ring from the next day
      (`walk-2026-08-27/lock-phone-ring.json`) shows ONE latch for one
      39.4 s lock with `silent=true` — the watchdog behaving correctly.
      v0.24.0's own release note tells testers so. **Nobody has measured the
      rate since, so there is no defect number to design against**
      (recurring failure 16's second corollary: a sourced premise true when
      written and false when used). Ruled out of the spec by James,
      2026-08-31. It returns to the open-item register as UNMEASURED on the
      current build; `2026-08-31-lifecycle-design.md` §6 ships a latch
      counter so ordinary use produces the number, and no threshold moves
      until it does.
- [ ] **The `door` column.** One stored-shape change that discharges four
      items which each say in their own text that they want the next
      stored-shape change to the logs table: - **The PARTIAL complaint — an abandoned piece must say it was abandoned.**
      **Folded in here by James, 2026-08-31**, from the decision table. Today a
      500 m you bail on at 250 saves as a 250 m row with nothing marking it
      short. His words: _"I want it to say I stopped, not silently show a
      shorter piece that looks like I planned a 250 when I meant 500 and
      bailed."_ The `door` column is the stored fact the summary copy needs, so
      one migration carries both. **The rendered summary is a Gate 0** — it
      changes what a saved row says. **A resend control on that screen was
      considered and DECLINED by James on 2026-08-31** (_"Run it again"_,
      2026-08-27); starting the workout again from Today is the path, and the
      register row is retired. - **RC-18** — `device.name ?? "PM5"` bakes a model number into a stored,
      rower-visible field (`webBluetooth.ts:296`, `capacitorBle.ts:465,494`).
      James, 2026-08-25: _"We may one day support other rowers. Be careful
      where we use 'PM5'."_ Standing rule from it: copy says "monitor". - **LM's `LOGGED BY HAND`** — a connected session that opened no record
      stores that label permanently and unbackfillably, a knowing exception
      to James's 2026-08-18 ruling that one fact must not read as two words
      live versus from the log. - The stored-row analysis in `docs/history/phase-lm.md` — what option 2
      costs, and the `timeLabel` gate in `buildMeta` that must be re-derived
      positively rather than inherited.

      **S/M, and it must land before any read surface renders it.**

- [ ] **The in-flight interval's metres are discarded on a mid-row link loss.**
      On a single-interval workout — the tester's own 2000 m "Beam Sea" — any
      mid-row loss gives `kept = 0`, which was the MAJORITY outcome of walk
      leg B, not an oddity. **The spec states explicitly whether correct resume
      recovers those metres.** **S**
      **SPECCED as `2026-08-31-lifecycle-design.md` §5, and SEQUENCED BEHIND
      THE `door` COLUMN above.** The live-drop arm (§1) inherits this
      directly: banking "what was rowed" banks nothing when no boundary was
      reached. A stored partial is OUR number, not the machine's — there is
      no interval pair mid-interval — so it can never be tier A, and
      `measuredIntervalCount` correctly will not count it toward
      "N intervals kept." That is the PARTIAL vocabulary's job, which is why
      this lands with or after that migration and its summary copy is part
      of that item's Gate 0, never before.
- [ ] **`rowingActive` is falsified but not dangerous.** Owed: (a) one test
      pinning `surfaceModel.ts:915`'s `midSessionMirror` byte-half — measured,
      deleting it leaves 5,357 tests / 191 files green, so nothing gates it
      today; (b) a reconciled comment; (c) a diagnostic carrying the raw byte,
      since `parse.ts:608`'s strict `rowingState === 1` makes any non-1 read
      `false` and the next occurrence still will not say which. No behaviour
      change proposed. **S**
- [x] **The machine's own totals have NEVER reached a saved row. TRIAD — a
      change to what a stored number MEANS, and it lands alone.** Found by
      James on production TestFlight 2026-08-28; the ring is
      `docs/monitor/sessions/walk-2026-08-28/summary-never-stored-ring.json`
      and that walk's README §"Leg 5" carries the full reading. - **The wire half is finished.** 0x0039, 0x003A and 0x003F all arrive
      and decode, and `driver.ts:4181`'s `split-won` branch emits
      `summary-observations` carrying the verification bytes. **A theory
      that the native BLE arm never subscribed was raised and FALSIFIED by
      that capture** — do not re-derive it. - **The break is the READER.** `LogSession.tsx:1487` snapshots the run
      with `useState(() => monitorModeRun(...))` at mount — no setter, never
      refreshed. The burst's localStorage write lands ~270 ms later and
      succeeds; nothing reads it again. **The ordering is FIXED, not racy** —
      navigation is what starts teardown and its linger — which is why this
      is "never once" rather than "sometimes". - **It is not a missing box, it is a wrong number.**
      `storedSummary.ts:617-621` gates tier A on the same two columns the
      POST omits, so **every stored connected row's three heroes are our own
      arithmetic, including AVG SPLIT** — while v0.23.0's note told testers
      "those three numbers come straight from the erg… We show the
      monitor's, not ours." - **No backfill exists.** `LogPatch` (`server/stores/logs.ts:222-227`)
      is thumbs/held/pain/notes only and the columns are write-once at
      create, so every row saved since v0.22.0 is permanently tier B. - **COUNTED ON PRODUCTION, 2026-08-28: 0 of 16.** Sixteen connected rows
      (`device_name is not null`), and **not one** carries
      `machine_work_seconds`. "Never once" is now a measured fact, not an
      inference from one screenshot — so the note corrections say _never_,
      without hedging, and there is no partial-success case to explain. - **Still owed before the fix is designed:** a client test that mounts
      `LogSession` WITHOUT `summaryTotals`, lands the late write, then
      saves. Red today, needs no erg and no build, and becomes the permanent
      gate. - **THE SHAPE IS DECIDED (James, 2026-08-28): HOLD THE HAND-OFF for the
      burst as well as the split.** The rejected alternative was re-reading
      storage at save time, which keeps the navigation instant but lets a
      row gain its numbers a moment after the screen is already up. His
      reasoning: waiting is _more correct_, and ~0.3 s on the connected
      screen is an acceptable price. **The spec designs the hold, not the
      choice** — how long to wait, what happens when the burst never comes,
      and whether the rower sees anything during it. - **Owed with it:** the three note corrections in the register row
      below, and a receipt entry in the hook's handler, so the one link in
      this chain with no instrument finally gets one. **M/L**
      - **SHIPPED: PR #228, released in v0.27.0 (2026-08-30).** This bullet
        read "not yet merged/released" until 2026-08-31, when the item was
        struck to match it. Spec:
        `docs/superpowers/specs/2026-08-29-machine-summary-hold-design.md`.
        The hold now owes two independent conditions (split, burst) across
        all three burst-eligible `ended` arms (machine finish, Menu
        terminate, user End) and releases only when neither remains owed;
        the burst's own receipt (`summary-recorded` /
        `summary-append-rejected` / `summary-no-run`) is the instrument
        this item asked for. Gated by `summaryHoldReplay.test.ts`'s three
        permanent-gate legs (Menu terminate, user End, timeout — each
        replaying a real committed wire capture through the real driver
        into the real hook, never a storage-seeded fixture) plus
        `useMonitorSession.test.ts`'s receipt-instrument unit tests. The
        production re-count was waived as #228's merge gate, then
        **DISCHARGED 2026-08-30: James ran the query on prod — 0 of 18**
        (two more connected rows since the 2026-08-28 0-of-16 baseline,
        still none machine-confirmed), and the v0.27.0 notes' "never"
        claim rests on that fresh count. **The note corrections this item
        owed shipped in the same tag** (v0.27.0 items 3 and 4).
        **ONE OBLIGATION SURVIVES THE STRIKE and is lifted to the
        open-item register: the FIELD PROOF.** Every gate here is still the
        app agreeing with the app (RF11); the fix is only proven when a row
        saved on James's phone from v0.27.0 or later comes back
        machine-confirmed. Re-run the prod count after the next TestFlight
        build reaches him — the first nonzero is the proof, and a second
        0-of-N is a live defect, not a null result. **DISCHARGED
        2026-08-31: the first machine-confirmed prod row landed** (5x750m
        /1:30r, `CODE 050E-273C 1B69-9691` on both the PM5 and the phone);
        the register entry below carries the evidence.

- [x] **Audit AUD-016 — measured connected work survives storage failure.**
      **SHIPPED: PR #239, merged 2026-08-31 (`89006404`).** A completed PM5
      interval retained in memory could reach Log as `NO MONITOR READING`
      after rejected monitor-run writes. One store
      (`app/src/monitor/handoffStore.ts`) now owns the connected record —
      every create, save and destroy goes through it with a receipt; a failed
      durable write holds in the Gate-0-approved
      `COULD NOT KEEP THE RECORD ON THIS PHONE.` state with Retry / Log it
      anyway; a memory-only record has a door on Today and both connect guards
      see it. It also fixed a proven main defect en route: a failed close write
      let the finish grace re-open the record from stale storage and truncate
      saved actuals 3→1. Design:
      `docs/superpowers/specs/2026-08-30-handoff-protocol-design.md` (rev 4,
      James-approved 2026-08-30). **Per the STRIKE CONTRACT set at #239's PM
      gate, this same commit removed the Task 1-6 progress narration that stood
      here** (the file's own head rule: a struck item does not keep its progress
      log) **and lifted its forward-looking residuals into the open-item
      register first** — the memory-only reload gap, the three surviving legacy
      reads, and the store's standing tier-precedence probe. The full record
      lives in PR #239 and moves to `docs/history/` when Wave F closes.
- [ ] **Audit AUD-011/AUD-015 — storage denial is recoverable before work.**
      Guard getter denial on every persisted loader, and never leave Countdown
      for Timer unless the active run is durable. One local-storage recovery
      PR may own both, with separate regression tests; the visible Retry state
      gets rendered Gate 0 first. **P1, Confirmed. M**
      **RESHAPED by the approved hand-off store protocol (2026-08-30, its
      §8):** the store's accessor wraps the localStorage GETTER
      (`SecurityError` fails every access — WHATWG PRIMARY, in the
      antagonist ledger) and absorbs the `loadMonitorRun` loader on day
      one, so THIS chunk owns three loaders, not four (`loadRun`,
      `loadDraft`, `loadTodayPick`). The earlier #230-gate `removeItem`
      spec condition is SUPERSEDED: `removeItem` carries no throw
      condition per the same PRIMARY, and the store's `retire` wraps its
      durable removal regardless.
      **Corrected at the anchor pass (2026-08-28): the audit's four-loader
      list named the wrong fourth loader.** `loadTodayOverrides` is already
      guarded (`todayOverrides.ts:211`, getter inside its try); the real
      unguarded set is `loadRun`, `loadDraft`, `loadMonitorRun`, and
      `loadTodayPick` (`todayPick.ts:53`) — the audit's mounted-Today probe
      never reached it because `loadRun` (`Today.tsx:280`) throws first. Three
      spec conditions from the anchor: (1) a Today fixture that actually
      reaches the `loadTodayPick` call (needs a plan and a pool); (2) one
      COMPOSED denial-then-Start test — after AUD-011's fix, denial makes
      `loadRun()` return null, so Start proceeds and then hits
      `saveRun === false`, a path neither finding's own tests cover; (3) the
      Retry surface needs a non-retry exit — a Retry under a still-denied
      getter is a loop. Open research line for the spec: whether the getter
      can throw in a Capacitor WKWebView on its own origin (the WHATWG
      authority is vetted; the native-layer reachability is not).
      **NARROWED AGAIN by the hand-off store's final fix round
      (2026-08-30, adversarial F-2): `loadMonitorRun`'s SELF-CLEAR is gone
      — the read now returns `null` and leaves malformed bytes for the
      store's §8 deferred clear.** That was a genuine defect on this
      branch, not a residual: `Today.tsx`'s mount effect calls the loader,
      so opening Today destroyed a malformed record the store was
      deliberately preserving.
      **CLOSED FOR THIS LOADER at PR #239's review round 1 (item 1):
      `loadMonitorRun`'s `localStorage.getItem` now sits INSIDE its own
      `try`, so a denied getter reads as absent instead of escaping
      `Today.tsx`'s mount effect.** Gated at both layers — the loader
      (`monitorRun.test.ts`, "the storage GETTER itself throws") and the
      composed screen (`Today.test.tsx`, "survives a DENIED storage getter
      on the monitor key"), the latter key-scoped because a blanket denial
      still dies at `loadRun` first. **So this chunk's unguarded set is now
      exactly three loaders — `loadRun`, `loadDraft`, `loadTodayPick` —
      matching the §8 reshaping above; `loadMonitorRun` is off the list.**
      Everything else here is unchanged and still owed: the three anchor
      spec conditions, the Retry surface's Gate 0, AUD-015's Countdown
      durability, and the Capacitor-WKWebView reachability research line.

**Riding this wave because it touches `app/server/` and `app/domain/`:**

**RULED by James, 2026-08-31: all three ride the `door` COLUMN's migration
PR**, not a branch of their own and not the lifecycle spec's PRs. They carry
none of that migration's risk, so bundling them costs a reviewer nothing and
saves three round trips.

- [ ] **`ALTER TABLE "preferences" DROP COLUMN "warmup";`** — one line, safe
      once no deployed image reads it. Still present at
      `server/db/schema.ts:369`. **Its trigger fired long ago:** Phase WU set it
      at "the first server-touching phase after TWO tags have shipped",
      deliberately countable. **Ten tags have shipped since.**
- [ ] **Remove the legacy warm-up guards on the persisted `LogSeed.steps[].kind`
      union.** `logDraft.ts:857` still carries `if (seedStep.kind === "warmup")
return;` and the union at `:600` is still `"warmup" | "work"`. Binding
      sub-ruling from WU: `kind` stays the literal union, never widened to
      `string`. Same expired trigger as above.
- [ ] **RC-12's last unreconciled comment.** Four of six sites are already
      corrected; `domain/monitor/types.ts:607` still claims `onDisconnect`
      covers "the Bluetooth stack resetting" without qualification. The
      neighbouring iOS-backgrounding claim was already struck as false.

**Exit:** a phone locked before the first pull, a phone backgrounded mid-piece,
and a link dropped mid-piece each produce a stored row that matches what the
machine did, and the row says which door it came in by. **Fourth clause, added
at the phase-open gate (2026-08-28) so the durability chunks are inside the
exit they build toward:** a connected row carries the erg's own summary
numbers whenever the erg spoke them, and a storage failure never silently
downgrades a measured session to a hand-logged one.

---

## Wave A — The front door

**Status:** After F. **TRIAD** (auth). **L.**

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
- [ ] **The 23 dangling `.superpowers/` citations across 11 tracked files.**
      That directory is git-excluded and unreachable to anyone but the session
      that wrote it. _"A dangling citation is worse than no citation, because it
      reads as evidence."_ Affected: `driver.test.ts`, `docs/TESTING.md`,
      `pm5-interface-notes.md`, and eight plans and specs. **Do NOT create
      `docs/superpowers/sdd/` to make the paths resolve.** **S**
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
      **A worked example arrived 2026-08-28, and this item owns it.** The
      monitor's connection-log ring is reachable ONLY by an undocumented
      triple-tap during the live session (`ConnectedSurface.tsx:315`), and
      `MonitorLogRow` renders only on the SAVE screen gated on
      `?from=monitor`. `session_logs` has no diagnostics column, so once a row
      is saved its diagnostics are gone forever. That is why the Wave F
      summary defect survived five hardware walks and a phase close: a rower
      can never report it, and James caught it only by looking before saving.
      **The evidence already survives the process kill** —
      `useMonitorSession.ts` writes `ergomatic:last-session-log` to
      localStorage unconditionally, its own comment citing "no console on
      iOS". **PARTIALLY DISCHARGED by Wave F PR 2 (#258, 2026-09-01):** the
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
- [ ] **PR1 — the server broker.** `concept2_links` + auth attempts + four
      `session_logs` columns (`c2_result_id`, `c2_user_id`, `completed_at`,
      `tz`), link/exchange routes, upload route, mapping module. TRIAD. **M**
      All 9 tasks committed on `wave-e-pr1-server-broker` (2026-08-31,
      including the measured refresh-endpoint corrections); PR #249 open,
      in James's review.
- [ ] **PR1.5 — the native link flow**, on device: system-browser consent,
      foreground re-fetch, and (branch B only) the URL scheme + `appUrlOpen`
      handler. Split from PR1 so one reviewer never holds a token-broker
      migration and an iOS deep-link contract in one pass. **S**
- [ ] **PR2 — the rower-facing surface, behind Gate 0.** You's Concept2 card
      (Connect + H/L ask + Unlink) and the log row's Send action with
      sent/duplicate/failed states and a View-on-Concept2 link-out. **M**
- [ ] **The sandbox as a test oracle** (RC-10) — RECONCILED at wave open: the
      `weight_class` gate is answered by the link flow (RULED — a binary H/L
      asked only at C2 link time, never at onboarding, and it is PII); the
      per-interval `rest_time` gate is NOT answered this wave — RC-1 stored the
      session-level split only, `LogStep` carries no per-interval rest, so the
      `intervals` array is out of scope and rides the auto-upload follow-on.

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
request bodies carry exactly ONE new user attribute, `weight_class` (the
countable form of minimal-PII); and the dedup-granularity, `state`-echo and
zero-rest-post questions each carry a measured answer in PR0's report —
"unknown" leaves the wave open. (RC-9(b)'s live ring verdict moved OUT to
the open-item register at the PM open gate: no shared mechanism, PR, or
risk model with this wave.)

---

# The open-item register

Work with no wave, lifted out of archived phase bodies so it does not die with
them. **Every entry names where its evidence now lives.** An item here is real
and unscheduled; it is not a wish.

**How an entry leaves:** it rides the next PR that touches its area, it is
promoted into a wave, or it is killed with a reason. "Rides the next PR touching
X" is a real disposition — most of these are single files.

## Codebase-audit owners

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
- **RC-29 — the 2.5 s banner, UNMEASURED on the current build.** Returned here
  from Wave F on 2026-08-31, the same day it was folded in, because the number
  it carried was pre-fix: `decideResumeLatch` (v0.24.0) killed the nine-banner
  rate, and the next day's build-759 ring shows one correct latch for one
  39.4 s lock. No threshold moves until ordinary use produces a fresh rate —
  `2026-08-31-lifecycle-design.md` §6's latch counter is what produces it.
  **§6 SHIPS in Wave F PR 2**: `stash()` records `latch-count
  latches=<n> resumes=<n>` into every teardown's own ring export, so the
  count is available from ordinary use once the build reaches a phone —
  this row's own clause is now ARMED, not just written. **Still no
  threshold moves until that first ordinary-use rate lands here**; this
  row stays open until it does. Evidence:
  `docs/superpowers/specs/2026-08-27-link-authority-design.md` rev 4,
  `docs/monitor/sessions/walk-2026-08-27/lock-phone-ring.json`.
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

- **DUE NOW — the store SHIPPED (#239, merged 2026-08-31): at the first
  tester report on v0.30.0, decode the ring for
  `commit-accepted{verdict:"failed"}` before anything else** (#239's PM gate,
  2026-08-30). The defect AUD-016's fix addresses has zero observed instances;
  the store's receipts are the first instrument that can see a rejected write,
  and they shipped WITH the fix rather than ahead of it. **Status
  2026-08-31: the first post-release row (the field-proof row above) saved
  durably and reached Log with its summary — no symptom, so the ring was
  not decoded; this item stands for the first report that carries one, or
  the next time James copies a connection log for any reason.** Evidence:
  `handoffStore.ts`'s receipt ring (stashed to sessionStorage at teardown),
  decoded via the connection log sheet.
- **The hand-off store's three residuals, lifted here by #239's STRIKE
  CONTRACT (2026-08-31)** when the AUD-016 item was struck. They are real and
  unscheduled; none is a defect the store introduced.
  1. **A memory-only record vanishes on reload, indistinguishably from a
     durable one.** When the durable write is denied, Today shows the row and
     both connect guards see it — but a reload takes it with no trace, and
     nothing tells the rower the difference between a record that was kept and
     one that never was. The store's receipts see it; the rower does not.
     **Rides the next PR touching the connected surface**, and it wants copy,
     so a rendered Gate 0 comes with it.
  2. **Three legacy reads survive**: `monitorRunState()` and `anyLiveSession()`
     (`monitorRun.ts`) and `Today.tsx`'s stale-draft-discard guard still call
     `loadMonitorRun()` rather than the store. Deliberately left with a citing
     comment each — `anyLiveSession()` has zero production callers, and
     deleting them would orphan the cross-file anti-pattern documentation that
     names them (`todayGuard.pin.test.ts`'s binding pin). **Whoever next
     touches these functions owns the decision**, per the close-out's own flag.
  3. **The store's standing probe is row 11's tier-precedence COMPOUND
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

## Needs a decision from James

**Cleared 2026-08-31.** James settled every open row in one sitting; each one
left this table for an owner, and the dispositions are recorded where the work
now lives, not here. RC-29 and the PARTIAL complaint went into Wave F (the
lifecycle spec and the `door` column respectively); RC-13/RC-14 dropped to the
connected-surface table below with a fix-13-instrument-14 ruling; "Run it
again" was declined; RC-38 was pulled forward and the rest of Phase PROTO
held; the axis-quantity question opened the "say which number this is" design
pass below; AUD-006 got its fix shape. **This table now holds two rows, and
neither is a live question needing James's decision: RC-30 is closed
(declined at the RC close), and the C2 account injection row already carries
its ruling** (PR1.5's design gate decides the fix, on device evidence about
system-browser cookie sharing; the row stays until that PR closes it, since
it blocks `C2_LINK_ENABLED=1` in the meantime). A new row means a new
question, not a re-raised one.

| Item                      | What                                                                                                                                                                                                                                                                                                                                                              | Evidence      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| **RC-30**                 | Teardown can TERMINATE a live piece, keyed on derived `phase === "ready"` rather than `frame.state`. **Declined at the RC close 2026-08-28** — it fails the fast path's fifth check, and its fix loses DEVIATIONS row 70's coverage. Never observed in the field; highest per-incident cost of anything in this table                                             | `phase-rc.md` |
| **C2 account injection**  | The Concept2 callback's Branch A account-injection residual (PR1 final review, F1): an attacker mints the authorize URL on their OWN Ergomatic account and hands it to a victim, whose Concept2 account then links to the ATTACKER's user — bounded today only by `ALLOWED_EMAILS` (household allowlist). **Ruled at PR1.5's design gate, on device evidence about system-browser cookie sharing (the fix depends on it, and PR1.5 is where the change is still cheap); blocks `C2_LINK_ENABLED=1` regardless.** | `2026-08-31-concept2-logbook-design.md` |

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

- **RC-38 — SCHEDULED (2026-08-31), rides the next connected-surface PR.**
  Transcribe `OBJ_WORKOUTTYPE_T`. We have read one row of an enum we key a check
  on: `8` is sourced, `1` and `0` are sourced nowhere. James, 2026-08-27:
  _"have we been making assumptions that are unfounded here? is there
  documentation about workoutType from concept2?"_ The transcription either
  confirms our reading or finds a real defect; both outcomes are cheap.
  **Per recurring failure 16's second corollary, the row for each value is
  quoted verbatim beside the claim it supports.** **S**
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

## Rides the next PR touching the connected surface

| Item                                       | What                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Evidence                     |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **RC-8**                                   | Correct the fake's contradictions of the real wire. **3 of 5 corrected** in #182 T1 (`ergMachineType`, `intervalRestTimeSeconds`, `splitIntervalType`); the other two read as already conditional and want verification. Residual: `fake.ts`'s `toMachineIndex` is resting-conditional while `intervalIndex.ts`'s `toActualIndex` is unconditional. **Merged with LL's reconnect precondition — one piece of fake work, and specced apart it gets done twice** | `phase-rc.md`, `phase-ll.md` |
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
| **Reconnect's three preconditions**        | Plus the prerequisite from #183's gate: any reconnect design must reset or quarantine `lastContinuityRef`'s count axis across a re-subscribe, or the first post-resubscribe 0x0033 convicts a healthy row on a stale register                                                                                                                                                                                                                                  | `phase-ll.md`                |
| **Three declined CR questions**            | Projected finish split; **reconnect backfill** (the grid assumes yes — if not, those rows need the `— · MISSED` treatment); distance intervals with a rate cap. Each waits on a hardware fact                                                                                                                                                                                                                                                                  | `phase-cr.md`                |
| **LL-F4**                                  | The `disconnected` handler records no liveness snapshot where `fail()` does, so a retry's ring has one fewer data point                                                                                                                                                                                                                                                                                                                                        | `phase-ll.md`                |
| **Connection-log text is unselectable**    | `user-select: none` inherits into the sheet (`index.css:85`, `:5799`); COPY LOG is the only route out                                                                                                                                                                                                                                                                                                                                                          | `phase-cs.md`                |
| **The bar's two axes**                     | The connected bar's fill and its notches are two axes on DISTANCE work; EST LEFT holds still 6.6 s and 20.8 s at handovers. **The obvious repair was replayed and does not work.** Accepted and documented. **TRIAD** when it is taken                                                                                                                                                                                                                         | `phase-cr2.md`               |

## Accepted, pinned, and not being fixed

Known-wrong and deliberately left. They are here so nobody rediscovers them as
new.

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
  comment. **Phase JR is the door that would create them.**
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
  burst caught, decoded and emitted perfectly — **the loss is entirely
  downstream, in the reader, and Wave F owns it.** The rate at the wire is
  fine; the rate at the ROW was 0%. What survives here is only the narrow
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
