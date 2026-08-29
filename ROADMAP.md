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
| Auth              | Google OAuth (authorization code flow) only at launch; self-hosted cookie sessions in Postgres; no auth SaaS. **Sign-up is deny-by-default against `ALLOWED_EMAILS` — Wave A changes this, and it is the single largest gap between this app and a stranger using it**                                     |
| Deployment        | Full CD: push to main → self-hosted runner → SSH deploy script → health-gated auto-rollback (nataliesawacritter pattern)                                                                                                                                                                                  |
| Hosting           | Docker Compose (hardened: read_only, cap_drop ALL, non-root) fronted by a Cloudflare tunnel behind a compose profile                                                                                                                                                                                      |
| Local enforcement | husky + lint-staged — pre-commit: lint + typecheck on staged files; pre-push: unit + client tests (fast, Docker-free)                                                                                                                                                                                     |
| CI                | GitHub Actions: `changes` → `root-hooks`, `app`, `docker`, `e2e`, `scripts`, `deploy`. `changes` decides whether the code jobs run at all — documentation-only pushes skip `app`, `docker` and `e2e`                                                                                                       |
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

| Wave | What it is | Size | Tester sees |
| --- | --- | --- | --- |
| **F** | Lifecycle: stop losing rows | L | Yes, and it is the most valuable thing here |
| **A** | The front door | L | Yes, immediately |
| **D** | The toolbox | M | Nothing |
| **B** | Backups and telemetry | M | Nothing |
| **C** | The submission surface | L | The most visible wave |
| **E** | The Concept2 logbook | M | Only if it ships a send control |

**Honest distance: three to five weeks of working sessions.** Waves D and B
ship a tester nothing, so they release alongside C rather than alone — two
consecutive empty release notes is how the invisible-but-necessary wave gets
skipped.

---

## Wave F — Lifecycle: the app stops losing rows

**Status:** Next. **TRIAD** (stored shape: the `door` column). **L.**
Absorbs the rest of Phase LM, whose PR 1 shipped as #198 / v0.24.0.

**Goal:** a phone in a pocket, a phone that locks, and a link that drops all
stop costing the rower the row they actually did.

**Why it is first:** the pre-row lock is reproduced on hardware, in production,
this week. It is the only defect in this file that destroys a rower's work
silently.

- [ ] **The pre-row lock: a whole piece rowed and nothing kept.** Lock the
      phone before the first pull and the app stays `phase=ready`, opens no
      record, and End silently discards. **Reproduced on hardware 2026-08-28**
      (`docs/monitor/sessions/walk-2026-08-28/README.md`, leg 4, v0.25.0 build
      759, production): `resume gap=27886ms silent=true` while the machine had
      him 24.7 s / 52.6 m into interval 1 and the app sat at `ready`. Three
      siblings from the same window: a `pause-declared` at 66 spm while rowing,
      TWD 52→0→64 m, and `rowing-active-fallback` leaving `rowingActive` stuck
      false. **RC-37 does not cover this.** Deliberately not claimed in
      v0.26.0's notes. **M**
- [ ] **Correct resume** (was LM PR 2). James's ruling, 2026-08-20:
      **"CORRECT RESUME, not a background mode."** **Unblocked 2026-08-26** —
      it was gated on a probe James cancelled, so the probe will never report.
      Start from `framesWhileHidden=2` on both real backgrounds. **M**
- [ ] **The `door` column.** One stored-shape change that discharges three
      items which each say in their own text that they want the next
      stored-shape change to the logs table:
      - **RC-18** — `device.name ?? "PM5"` bakes a model number into a stored,
        rower-visible field (`webBluetooth.ts:296`, `capacitorBle.ts:465,494`).
        James, 2026-08-25: *"We may one day support other rowers. Be careful
        where we use 'PM5'."* Standing rule from it: copy says "monitor".
      - **LM's `LOGGED BY HAND`** — a connected session that opened no record
        stores that label permanently and unbackfillably, a knowing exception
        to James's 2026-08-18 ruling that one fact must not read as two words
        live versus from the log.
      - The stored-row analysis in `docs/history/phase-lm.md` — what option 2
        costs, and the `timeLabel` gate in `buildMeta` that must be re-derived
        positively rather than inherited.

      **S/M, and it must land before any read surface renders it.**
- [ ] **The in-flight interval's metres are discarded on a mid-row link loss.**
      On a single-interval workout — the tester's own 2000 m "Beam Sea" — any
      mid-row loss gives `kept = 0`, which was the MAJORITY outcome of walk
      leg B, not an oddity. **The spec states explicitly whether correct resume
      recovers those metres.** **S**
- [ ] **`rowingActive` is falsified but not dangerous.** Owed: (a) one test
      pinning `surfaceModel.ts:915`'s `midSessionMirror` byte-half — measured,
      deleting it leaves 5,357 tests / 191 files green, so nothing gates it
      today; (b) a reconciled comment; (c) a diagnostic carrying the raw byte,
      since `parse.ts:608`'s strict `rowingState === 1` makes any non-1 read
      `false` and the next occurrence still will not say which. No behaviour
      change proposed. **S**
- [ ] **The machine's own totals have NEVER reached a saved row. TRIAD — a
      change to what a stored number MEANS, and it lands alone.** Found by
      James on production TestFlight 2026-08-28; the ring is
      `docs/monitor/sessions/walk-2026-08-28/summary-never-stored-ring.json`
      and that walk's README §"Leg 5" carries the full reading.
      - **The wire half is finished.** 0x0039, 0x003A and 0x003F all arrive
        and decode, and `driver.ts:4181`'s `split-won` branch emits
        `summary-observations` carrying the verification bytes. **A theory
        that the native BLE arm never subscribed was raised and FALSIFIED by
        that capture** — do not re-derive it.
      - **The break is the READER.** `LogSession.tsx:1487` snapshots the run
        with `useState(() => monitorModeRun(...))` at mount — no setter, never
        refreshed. The burst's localStorage write lands ~270 ms later and
        succeeds; nothing reads it again. **The ordering is FIXED, not racy** —
        navigation is what starts teardown and its linger — which is why this
        is "never once" rather than "sometimes".
      - **It is not a missing box, it is a wrong number.**
        `storedSummary.ts:617-621` gates tier A on the same two columns the
        POST omits, so **every stored connected row's three heroes are our own
        arithmetic, including AVG SPLIT** — while v0.23.0's note told testers
        "those three numbers come straight from the erg… We show the
        monitor's, not ours."
      - **No backfill exists.** `LogPatch` (`server/stores/logs.ts:222-227`)
        is thumbs/held/pain/notes only and the columns are write-once at
        create, so every row saved since v0.22.0 is permanently tier B.
      - **COUNTED ON PRODUCTION, 2026-08-28: 0 of 16.** Sixteen connected rows
        (`device_name is not null`), and **not one** carries
        `machine_work_seconds`. "Never once" is now a measured fact, not an
        inference from one screenshot — so the note corrections say *never*,
        without hedging, and there is no partial-success case to explain.
      - **Still owed before the fix is designed:** a client test that mounts
        `LogSession` WITHOUT `summaryTotals`, lands the late write, then
        saves. Red today, needs no erg and no build, and becomes the permanent
        gate.
      - **THE SHAPE IS DECIDED (James, 2026-08-28): HOLD THE HAND-OFF for the
        burst as well as the split.** The rejected alternative was re-reading
        storage at save time, which keeps the navigation instant but lets a
        row gain its numbers a moment after the screen is already up. His
        reasoning: waiting is *more correct*, and ~0.3 s on the connected
        screen is an acceptable price. **The spec designs the hold, not the
        choice** — how long to wait, what happens when the burst never comes,
        and whether the rower sees anything during it.
      - **Owed with it:** the three note corrections in the register row
        below, and a receipt entry in the hook's handler, so the one link in
        this chain with no instrument finally gets one. **M/L**

- [ ] **Audit AUD-016 — measured connected work survives storage failure.** A
      completed PM5 interval retained in memory can reach Log as
      `NO MONITOR READING` after rejected monitor-run writes. Preserve the
      measured actual through one explicit, reload-safe hand-off or hold a
      recoverable storage state before navigation. The Wave F phase-open gate
      sequences this against the pre-row lock and machine-summary hand-off;
      the audit does not. **P1, Confirmed. M**
- [ ] **Audit AUD-011/AUD-015 — storage denial is recoverable before work.**
      Guard getter denial on every persisted loader, and never leave Countdown
      for Timer unless the active run is durable. One local-storage recovery
      PR may own both, with separate regression tests; the visible Retry state
      gets rendered Gate 0 first. **P1, Confirmed. M**

**Riding this wave because it touches `app/server/` and `app/domain/`:**

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
machine did, and the row says which door it came in by.

---

## Wave A — The front door

**Status:** After F. **TRIAD** (auth). **L.**

**Goal:** someone you have never met installs the build, gets an account, rows,
and can delete everything from inside the app.

**The gap, proven.** `server/auth/signin.ts:33` returns `outcome: "denied"` for
any address off the allowlist; `auth/routes.ts:87` redirects to
`/?denied=<email>`; `SignIn.tsx:6` renders the dead end. `server/index.ts:87`
warns that an empty `ALLOWED_EMAILS` means "nobody can create an account". The
2026-07-27 auth spec states the policy deliberately: *"missing/empty var =
nobody can sign up (deny by default)."* PROD's old exit promised "a real
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
**Ships a tester nothing** — but three of its items are Wave C's dependencies.

**Goal:** the instruments Wave C's audit needs, and the standing traps retired
while we are in here.

- [ ] **Stand the iOS simulator up as a standing instrument.** James,
      2026-08-20: *"make sure to consider the iOS simulator."* It is used
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
- [ ] **`app/e2e/` is not typechecked.** James, 2026-08-23, owner assigned.
      `tsconfig.app.json:21` includes only `src`, `domain`, `scripts`, and
      Playwright erases types; a hand-rolled config over `e2e/` surfaced 14
      pre-existing errors when last tried. Fix the errors, wire the config into
      `pnpm typecheck`. **S/M**
- [ ] **Hunt the e2e flakes.** James, 2026-08-20: *"post release lets hunt down
      the flake."* Its trigger ("immediately after v0.15.0 ships") fired
      2026-08-20. Two named flakes remain unresolved: the manual-door
      tap-target flake (399/401, then 401/401 twice) and `design.spec.ts`'s
      `stableBoundingBox` flake (`e2e/helpers.ts:89`). #152 landed evidence
      capture for a *third* flake and produced
      `docs/superpowers/research/2026-08-22-e2e-readiness-gate-flake.md`. **M**
- [ ] **Settle the mutation-testing gate, one way or the other.**
      `docs/TESTING.md` calls `pnpm mutate` a phase close-out gate. There is no
      evidence of a run since 2026-07-29 across roughly fifteen phases: Stryker
      appears only in CLAUDE.md, TESTING.md and two 2026-07-28 planning docs;
      the old ROADMAP never mentioned it; `app/reports/` does not exist. Its
      §3.1 baseline scores 7 domain modules against today's 29. **Either run it
      once and refresh the baseline against current scope, or demote the
      claim.** As written it is a green-by-assertion gate at the process
      layer — recurring failure 21's shape. **S/M**
- [ ] **The 23 dangling `.superpowers/` citations across 11 tracked files.**
      That directory is git-excluded and unreachable to anyone but the session
      that wrote it. *"A dangling citation is worse than no citation, because it
      reads as evidence."* Affected: `driver.test.ts`, `docs/TESTING.md`,
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

**Exit:** the accessibility audit can run on real assistive technology, the
simulator reaches a connected screen, `pnpm typecheck` covers `e2e/`, and no
tracked file cites a path that does not exist.

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
      `useMonitorSession.ts:2617` writes `ergomatic:last-session-log` to
      localStorage unconditionally, its own comment citing "no console on
      iOS". It has no reader. **Whatever this item builds, a rower must be
      able to send a saved row's diagnostics without knowing a gesture.**
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
    entry's *"the tightest band has about five units of slack, so
    `fontSize="10"` fits"* was never measured and is false: at 10 units
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
      and anchors the next delta. *"It stays append-only, and here is why"* is
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

**Status:** Opens 2026-08-29 (James: *"we can open the logbook Saturday"*).
Interleaved — it runs on its own date rather than in the F→A→D→B+C line. **M.**

**Goal:** the first contact with the authority this project has been reasoning
about for two phases without ever talking to it.

**Carried from Phase RC's close, and BINDING:** RC's exit criterion (d) is
transcribed into this wave's own exit block verbatim on day one. The close-out
gate was explicit that without the transcription the criterion evaporates on
the rename — and Phase RC is titled "the row Concept2 would recognise" and
closed with zero Concept2 contact.

- [ ] **Post a reconciled row to `log-dev.concept2.com`, pull `export/` back,
      and diff.** The cross-connect RC never ran. **M**
- [ ] **The sandbox as a test oracle** (RC-10). Two gates the numeric work does
      not cover: `weight_class` (RULED — a binary H/L asked only at C2 link
      time, never at onboarding, and it is PII) and per-interval `rest_time`.
- [ ] **A LIVE ring verdict for 0x0039's totals against Σ`recordedActuals`**
      (RC-9(b)), the way (a) and (d) have one. **Narrowed and nearly done:** the
      blocker expired and the corpus comparison is made and green on four
      captures (rests-finished 254.8 s / 935 m exact). Only the live verdict is
      left. **S**

**Standing warning this wave inherits.** `recordTwdVerdict` was retired for
being a mirror: Total Work Distance is work PLUS rest-coast metres and so is our
sum, while Concept2's logbook — the actual authority — stores work only. **An
oracle that shares your definition is a mirror.** Before trusting any number
this wave pulls back, state what it measures and confirm it is the same thing we
are trying to be right about.

**Exit:** to be transcribed from RC exit criterion (d) verbatim at wave open.

---

# The open-item register

Work with no wave, lifted out of archived phase bodies so it does not die with
them. **Every entry names where its evidence now lives.** An item here is real
and unscheduled; it is not a wish.

**How an entry leaves:** it rides the next PR that touches its area, it is
promoted into a wave, or it is killed with a reason. "Rides the next PR touching
X" is a real disposition — most of these are single files.

## Codebase-audit owners

- **AUD-002 — bound History's successful top-level response.** A parseable
  non-array 200 must enter the existing error/Retry state rather than reaching
  `.map`. No real producer was found, so this remains P2/Probable and rides the
  next History API/client boundary PR alone; it is not bundled with raw-database
  corruption hardening. Evidence:
  `docs/superpowers/audits/2026-08-28-codebase-integrity/findings.md`.
- **AUD-006 — Today and Library state every accepted rest.** Both scan surfaces
  understate leading/consecutive rest that Timer retains. A displayed-number
  TRIAD: Gate 0 decides leading-rest validity and renders both orientations
  before implementation. Evidence:
  `docs/superpowers/audits/2026-08-28-codebase-integrity/findings.md`.

## Needs a decision from James

| Item | What | Evidence |
| --- | --- | --- |
| **RC-29** | A 2.5 s banner threshold writes `endedBy: "link-lost"` AND suppresses `driver.terminate()`. **The derivation audit's worst finding.** False positive measured: 9 banners in 288 s over a link that never dropped (`walk-2026-08-26/`). Site is `useMonitorSession.ts:3210`. Triad weight — it sends and suppresses a wire command | `phase-rc.md` |
| **RC-30** | Teardown can TERMINATE a live piece, keyed on derived `phase === "ready"` rather than `frame.state`. **Declined at the RC close 2026-08-28** — it fails the fast path's fifth check, and its fix loses DEVIATIONS row 70's coverage. Never observed in the field; highest per-incident cost of anything in this table | `phase-rc.md` |
| **RC-13** | The avg-pace verdict zero-fires on a rapid re-arm: `program()` inside `FINISH_GRACE_MS` cancels the pending deadline instead of draining it. **Not covered by the close-out corpus** — no committed capture has a re-arm inside 3 s, and the closest pieces are 148.1 s apart | `phase-rc.md` |
| **RC-14** | The avg-pace verdict zero-fires on an ORDINARY finish (walk 2026-08-25, W-2). **Distinct from RC-13; do not fold.** Narrowed at the close: replay through the walk's own commit `c219ee0` DOES produce the verdict, eliminating the wire, the driver's response and ring eviction. **Two survivors:** it threw, or something outside the driver dropped the entry | `phase-rc.md` |
| **The PARTIAL complaint** | Nothing on the summary SAYS an abandoned piece ended early. The rower's own words: *"I want it to say I stopped, not silently show a shorter piece that looks like I planned a 250 when I meant 500 and bailed"* | `phase-rc.md` |
| **"Run it again"** | A resend control on the log screen when a session ended early. James, 2026-08-27: *"You could put a resend in the log screen when it's exited early like this."* **This was recorded as told-to-James and was not** — recurring failure 14, with the controller as cause. Applies only to sessions that produced a row and ended early; RC-37 does not cover it | `phase-rc.md` |

## Phase PROTO — the wire-semantics audit (unopened, L)

James, 2026-08-27: *"im also interested into a deep dive to ensure we arent
hallucinating anything in the protocol... we've misused fields before or
conflated them to meanings they dont have."* Enumerate every claim we make about
a PM5 field and classify it VENDOR-CITED / OBSERVED / INFERRED.

- **RC-38** — transcribe `OBJ_WORKOUTTYPE_T`. We have read one row of an enum we
  key a check on: `8` is sourced, `1` and `0` are sourced nowhere. James,
  2026-08-27: *"have we been making assumptions that are unfounded here? is
  there documentation about workoutType from concept2?"*
- **The axis-quantity question** — should `traceModel.ts`'s `t` and `d` become a
  true work-only clock? The PR-2 collision is discharged by labelling
  (`MACHINE CONFIRMED · WORK ONLY`), but the underlying question is open and
  **sharper after RC-5**: the chart's axes are now the last rest-inclusive
  quantity on the screen.

## Rides the next PR touching the connected surface

| Item | What | Evidence |
| --- | --- | --- |
| **RC-8** | Correct the fake's contradictions of the real wire. **3 of 5 corrected** in #182 T1 (`ergMachineType`, `intervalRestTimeSeconds`, `splitIntervalType`); the other two read as already conditional and want verification. Residual: `fake.ts`'s `toMachineIndex` is resting-conditional while `intervalIndex.ts`'s `toActualIndex` is unconditional. **Merged with LL's reconnect precondition — one piece of fake work, and specced apart it gets done twice** | `phase-rc.md`, `phase-ll.md` |
| **RC-11** | The stroke-data reframe: three-way, not two. Owns RC-6's deferred `p: 0` half. Our series clock is a third quantity, and none of the three is C2's `time` | `phase-rc.md` |
| **Session calories** | 0x0033's `totalCalories` is INTERVAL-scoped (it resets at every boundary) and the 0x0039 summary carries no calorie field, so an honest session CAL needs the register-fold discipline CR2 spec 1 built for distance, plus an honest ramping fake (today's emits a constant 0, so **nothing can go red**), plus a walk photo. **ZONE rides behind it** — it needs a strap and a max-HR source the app lacks. **Ownerless since 2026-08-15** | `phase-cr2.md` |
| **Cross-pin the two distance derivations** | `sessionDistanceMeters` and `monitorDistanceMeters` are two derivations of one user-facing quantity, shipping on two screens with nothing comparing them | `phase-cm.md` |
| **The fake's rest-distance lag** | `restDistanceMeters` resets with no roughly three-frame lag, unlike the real wire | `phase-cm.md` |
| **`MONITOR_SPM_MIN = 0`** | Re-parked at CR2's close, re-owned by LT spec 1 | `phase-cr2.md` |
| **The landscape gutter** | The phone timer's landscape gutter absorbs no left inset | `phase-cr2.md` |
| **iOS 26 `100dvh`** | Under `viewport-fit=cover`. Wave D's native fake flag is what makes this answerable at a desk | `phase-cr2.md` |
| **`PULL TO RESUME`** | James, 2026-08-17: *"we never got rid of the pull to resume screen."* CR2 2a task 5 only re-worded it; **the screen was supposed to go, not get politer.** §2b's suspected mechanism was FALSIFIED (zero PAUSED firings across six captures) and the flash's real mechanism is unexplained. Pairs with the stale-while-armed observation | `phase-cr2.md` |
| **Reconnect's three preconditions** | Plus the prerequisite from #183's gate: any reconnect design must reset or quarantine `lastContinuityRef`'s count axis across a re-subscribe, or the first post-resubscribe 0x0033 convicts a healthy row on a stale register | `phase-ll.md` |
| **Three declined CR questions** | Projected finish split; **reconnect backfill** (the grid assumes yes — if not, those rows need the `— · MISSED` treatment); distance intervals with a rate cap. Each waits on a hardware fact | `phase-cr.md` |
| **LL-F4** | The `disconnected` handler records no liveness snapshot where `fail()` does, so a retry's ring has one fewer data point | `phase-ll.md` |
| **Connection-log text is unselectable** | `user-select: none` inherits into the sheet (`index.css:85`, `:5799`); COPY LOG is the only route out | `phase-cs.md` |
| **The bar's two axes** | The connected bar's fill and its notches are two axes on DISTANCE work; EST LEFT holds still 6.6 s and 20.8 s at handovers. **The obvious repair was replayed and does not work.** Accepted and documented. **TRIAD** when it is taken | `phase-cr2.md` |

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
- **Live TOTAL METERS is fused, stored is work-only** — `surfaceModel.ts`'s
  `sessionDistanceMeters` is work plus rest live, then the summary shows
  work-only for the same session, and **neither screen labels which**. Wants its
  own design pass. (`phase-rc.md`)
- **The interrupted TOTAL line** — an interrupted session can show a rest clause
  LIVE and none STORED for the identical row. Silent. (`phase-rc.md`)
- **Three minor divergences** — `postTestOffer`'s split precision changes on
  tier-A saves; `testHistory.ts`'s `deltaSeconds` mixes pre- and post-RC-5
  definitions; the live tier-A gate checks distance and time independently where
  the stored one requires both. (`phase-rc.md`)
- **Build-738-era rows** — an unsaved run carried across an update renders two
  heroes rather than three, permanently and silently, and declines its baseline
  offer. **A release-note clause is owed and unwritten.** (`phase-rc.md`)
- **THREE falsified release notes, not two.** Corrections go in a SUCCESSOR
  note, never edited in place; v0.23.0 through v0.26.0 were checked and none
  carries any of them. **Cited by CLAUSE, not line number — this row already
  rotted once by citing `:22`, which has since moved.**
  1. **v0.11.0** — the instruction RC-5 falsified. (`phase-rc.md`)
  2. **v0.22.0, "Your saved rows can now show what the erg itself reported…
     plus its CODE"** — now wrong for TWO independent reasons, and only the
     first was ever filed: RC-5 falsified its "meant to differ" clause, and
     the Wave F defect above falsifies "can now show" outright. It never has.
  3. **v0.23.0, "those three numbers come straight from the erg, including
     its own average split… We show the monitor's, not ours."** **Newly found
     2026-08-28 and the most serious of the three** — a claim about what three
     displayed numbers MEAN, false on every row ever saved, because tier A has
     never once been reachable.
  **Sequencing (PM ruling, 2026-08-28): hold these to ship BEHIND the fix.**
  A correction alone reads "we told you something that was never true" with no
  remedy; the same words behind a working feature read as a repair. Ship them
  regardless if the fix slips past roughly two weeks.
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

## Owed captures and walk items

Each needs erg time or a deliberate recording session.

- **A terminate-path SCREEN oracle** (§25's `avgStrokeRate` anomaly), and a real
  capture of the app's own END button mid-piece, on both web and native.
  (`phase-rc.md`)
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
  uncapped. Depth and duration could not be established. *"Probe before
  designing anything that assumes loss."* (`phase-ll.md`)
- **The WebView reload** — Capacitor answers a killed WebContent process with
  `webView.reload()`, destroying the driver, the recorder, and up to 30 s of
  unflushed series. *"'terminated no' disposes of force-quit, not of memory
  pressure."* (`phase-ll.md`)
- **JR PR 0b's capture walk** — see the deferred section; it rides the next erg
  session regardless of whether JR is ever built.
- **The hardware session shopping list** — three pairing and programming latency
  spans, the unrowed question from §17 item 5, §18's readings-still-owed, a
  genuine mid-piece disconnect, and **one `.5` pace target on the wire**
  (`representableCentiseconds` has never been sent to a real PM5).

## Small, queued, rides the next PR in its area

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
- **Retire `LEGACY_TITLE_RENAMES`** once every deployed environment has booted
  past the rename. Scope correction: `session_logs.workout_title` keeps the old
  spelling FOREVER, so the trigger is about the workouts table only.
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

- **Phase JR — Just Row.** Spec at rev 2 with both phase-open gates paid
  (`docs/superpowers/specs/2026-08-24-just-row-design.md`); its "waits behind
  RC's wave" blocker expired 2026-08-28. Four PRs including an L, TRIAD on PR 1.
  Deferred because it is the deepest household feature in the file: it serves
  someone who already owns a PM5, has paired it, and knows what Just Row is.
  **Carve-out, and it is not deferred: PR 0b's capture walk rides your next erg
  session.** It is erg time you are spending anyway, captures do not go stale,
  and its headline question — do 0x0031's elapsed and distance RESET at the PM's
  5-minute auto-splits — is a corpus fact worth owning either way. A naive
  observer that gets this wrong stores about five minutes of a thirty-minute row.
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
- **Date-keyed event suggestions** (James: *"trick or treat Trot"*). A globally
  authored one-off surfaced on a specific calendar date, not part of the plan but
  loggable against it. **This is a THIRD producer kind** — checkpoints are
  index-keyed, reservations are rower-authored, events are date-keyed and
  global — and the first real two-producers-one-day case, so it fires the
  precedence resolver with it. **Trigger:** the calendar ships.
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
  its multi-user framing (*"Two users with different preferences get different
  Today suggestions"*) rather than for its content: the suggest-workouts-at
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
  asks *"do you want more sessions like this one"*, and a second control meaning
  almost-but-not-quite the same is worse than none.
- **Store metadata and the legal surface.** **Trigger:** App Store submission
  rather than external TestFlight.
- **PWA installability.** **Trigger:** the web build stops being only a harness.
- **Apple Health (HealthKit)** — write rowing workouts from the iOS shell.
  **Trigger:** James asks.
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

- **Phase 8C — rower-authored prescriptions.** Its own text: *"No demand has
  been observed — this exists because James said in the 2026-08-12 session that
  he 'may one day' want it."* The seam it needed is already built and stays.
  [detail](docs/history/phase-8c.md)
- **Phase UR — undefined rest.** Its own text: *"a machine capability we lack,
  not a reported gap."* The research was the valuable part and survives at
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
