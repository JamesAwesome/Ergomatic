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
| **E** | The Concept2 logbook        | M    | Only if it ships a send control             |

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
- [ ] **Handle `programDropped` while a run is live** (from the
      pocketed-phone re-diagnosis above). Small and deterministic, warranted
      whatever the full ring says — the detector already fires; only the
      live arm swallows it, and that arm has NO test
      (`useMonitorSession.test.ts` covers only `ended`). The spec says what
      the rower sees and what the record keeps. **S**
- [ ] **The pocketed-phone window's two co-producers**, real and NOT fixed
      by the item above: `pause-declared` at 66 spm while rowing (the freeze
      predicate's observed production false positive), and TWD 52→0→64 m
      non-monotonic. Both stay owned by the lifecycle spec. **S**
- [ ] **Recover the full ring before the lifecycle spec is written — it
      settles the causal hypothesis.** The committed
      `pocketed-phone-prerow-ring.json` is a CURATED excerpt (six seq gaps
      against a contiguous-numbering `record()`);
      `ergomatic:last-session-log` on the phone may still hold the whole
      thing, including what End actually stored — which the excerpt does not
      show. **S**

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
- [ ] **The `door` column.** One stored-shape change that discharges three
      items which each say in their own text that they want the next
      stored-shape change to the logs table: - **RC-18** — `device.name ?? "PM5"` bakes a model number into a stored,
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
      - **FIX IMPLEMENTED AND GATED, 2026-08-29 (Wave F PR 1, not yet
        merged/released).** Spec:
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
        `useMonitorSession.test.ts`'s receipt-instrument unit tests. **What
        this does NOT close:** the note-corrections row below stays OPEN on
        its own clock. The production re-count was waived as #228's merge
        gate, then **DISCHARGED 2026-08-30: James ran the query on prod —
        0 of 18** (two more connected rows since the 2026-08-28 0-of-16
        baseline, still none machine-confirmed). The v0.27.0 notes'
        "never" claim rests on this fresh count; the interesting re-run is
        AFTER v0.27.0 reaches his phone, where the first nonzero
        machine-confirmed row is the fix's field proof.

- [ ] **Audit AUD-016 — measured connected work survives storage failure.** A
      completed PM5 interval retained in memory can reach Log as
      `NO MONITOR READING` after rejected monitor-run writes. Preserve the
      measured actual through one explicit, reload-safe hand-off or hold a
      recoverable storage state before navigation. The Wave F phase-open gate
      sequences this against the pocketed-phone row loss and machine-summary
      hand-off;
      the audit does not. **P1, Confirmed. M**
      - **ARCHITECTURAL RESET (James, 2026-08-30): the carrier substrate was
        replaced by the hand-off store protocol —
        `docs/superpowers/specs/2026-08-30-handoff-protocol-design.md`
        (rev 4, APPROVED by James 2026-08-30 after his own design gate plus
        two antagonist passes and two PM gates). PR #230 CLOSED UNMERGED as
        the preserved record; implementation restarts on a fresh branch off
        main; the behaviors below (held-error frame, Retry/Log-it-anyway,
        receipts, the render/commit split, James's seven review probes as
        permanent tests) are PRESERVED and restore file-level from that
        branch; the slot substrate described below is DELETED by the
        protocol. The paragraph that follows records what the closed branch
        built and proved — a record, not the live design:**
        Spec (superseded, banner added):
        `docs/superpowers/specs/2026-08-29-aud016-durable-handoff-design.md`.
        The ended hand-off now VERIFIES writability once (`saveMonitorRun`'s
        new `SaveVerdict`), at the release funnel and at every no-hold close
        (link-lost End, continuity reset, the no-conditions-owed finish); a
        `"failed"` verdict holds in a new, timer-free `holdError:
        "storage-failed"` state instead of releasing silently, with `Retry`/
        `Log it anyway` controls (Gate 0 approved) and a teardown escape
        hatch that stashes rather than loses the record. The empty-storage
        decline folds the machine's own numbers onto the in-memory run
        in-place, eligibility-gated (mirrors `appendSummaryObservations`'s
        own two writer gates — a review fix, F1). A one-shot module slot
        (`stashHandoffRun`/`peekHandoffRun`/`takeHandoffRun`/
        `clearHandoffSlot`) carries the in-memory record through to the log
        door's reader, non-destructively: a slot hit for a DIFFERENT
        workout, or one that fails an eligibility gate, is left in place
        and falls through to storage rather than being consumed and lost —
        the post-unmount stash populates this slot on the ORDINARY healthy
        close path too, not only on a failed write (review carry F5).
        Every receipt (`release-save`, `summary-folded-in-memory`,
        `hold-error-entered`/`-retry`/`-proceed`, `handoff-stashed`) goes
        through the ring, never the failing store. Gated by
        `summaryHoldReplay.test.ts`'s legs A/B + the no-hold arm (all
        green, including leg A's own reader assertion — the whole suite is
        green for the first time), plus unit/component/integration tests
        across `monitorRun.test.ts`, `useMonitorSession.test.ts`,
        `LogSession.test.tsx`, `ConnectedSurface.test.tsx`, and
        `ConnectedInterstitial.test.tsx` (the last gained an "above the
        seam" test at close-out, mutation-probed: no other test in the repo
        would have caught a PARENT forging `holdError: null` on its way
        into the rendered surface). Full suite green (`pnpm test`,
        unit+client+integration, 215 files/5763 tests), `pnpm e2e` 420/420,
        `pnpm lint`/`format:check`/`typecheck` clean.
        **What this does NOT close:** `fail()`-path closes (a completed run
        through a program-failure close) stay out of scope, per the spec's
        own §2 reachability reasoning; the slot's reload-safety and the
        EVICTION producer (a write that returns green but the browser later
        evicts the origin) are disclosed, not solved — the receipts are the
        only instrument either gets; **the escape-hatch gap (PM gate,
        2026-08-30): under denial-from-first-write the teardown stash
        survives while Today renders no door — storage is empty, so
        nothing in the app points the rower back to the record the stash
        preserved**; AUD-011/AUD-015 (the row below) are a
        separate audit item, untouched by this work. Two low-risk,
        disclosed coverage gaps remain in `useMonitorSession.ts` (a
        `handoff-stashed reason=superseded` receipt at two of four stash
        sites, and one already-defensive `endByMachine` branch sitting
        behind a documented-unreachable predicate) — the underlying
        mechanisms are proven at other call sites and at the pure-function
        level; not chased further. **Needs a PM final-PR gate before merge
        (TRIAD: a stored shape, `MonitorRun.summaryTotals`/`series`/the
        slot) and James's explicit approval — not struck until then.**
      - **Implementation progress (plan `docs/superpowers/plans/2026-08-30-handoff-store.md`):**
        Task 1 (row-8 red leg) and Task 2 (the store module) landed; Task 3
        (the producer rewrite — `monitorRun.ts`'s writer gates made pure,
        `useMonitorSession.ts` as sole committer, the held-error state
        machine rebuilt against the store) landed 2026-08-30, its own
        review round folded in the same day. Task 4 (the consumer rewrite
        — `LogSession.tsx`'s reader on `read`/claims, `Today.tsx`'s
        unlogged row on the store) landed 2026-08-30.
        **NARROWED BY TASK 4 (2026-08-30), NOT closed — corrected at
        Task 4's review: closed at LogSession/Today (their doors route
        through `retire()`), but `useStartWorkout.ts:99` (confirmReplace)
        and `WorkoutDetail.tsx:298` (row-instead) still legacy-clear, and
        the reviewer PROVED the interim asymmetry those two create: a
        legacy clear no longer removes the record from Today's
        store-backed view, so Today renders a row for a session the rower
        just replaced, and LOG IT commits it back into the tier the clear
        emptied. RF24's shape (session.spec's replace test asserts
        storage and never returns to Today). NAMED TASK 5 EXIT
        CONDITION: those two doors route through `retire()`, with a leg
        entering at each door; Task 6's module-boundary gate covers
        REMOVERS as well as writers. Also Task 5's: `connectGuardStage`
        and `monitorRunState` still read the durable tier only — a
        memory-only record renders on Today while invisible to the
        Connect/Start guards. **Two report-only carries from Task 4,
        moved here per RF14 so they have a life past the PR:** (1) the
        row-10 abandon-path test (`LogSession.test.tsx`, "the abandon
        path — claim survives unmount...") stands in with a direct
        `handoffStore.retire()` call for "the next acceptance," since no
        real door supplies an armed-acceptance defense retire on this
        branch yet — Task 5 re-points that test at whichever door lands
        it. (2) `Today.test.tsx`'s own row-9 "denied+reload counted"
        residual test (a durable write denied, then a genuine reload)
        has no `LogSession.tsx`-side twin — owed to Task 5 or Task 6's
        own close-out. Original finding, for the record: a burst
        landing in the linger after a Save/Discard through the legacy
        clears RESURRECTED the dispatched session.**
        Proven at the time by reverting the reviewer's own probe test to
        production's real mechanism (`clearMonitorRun()` in place of the
        store's `retire()`): it failed. Under the OLD design
        `appendSummaryObservations` re-read storage fresh and found it
        empty, declining; under this design it builds on the hook's own
        `runRef.current` (unaware of the external clear) and the
        resulting commit succeeds — nothing told the store's own
        `current`/`tombstones` that the door's clear happened, so
        `commit()` found no tombstone and wrote the record back. **The
        doors' own legacy clears were the CAUSE of this gap, not a
        mitigation for it** — an earlier framing in Task 3's own report
        said the opposite and was corrected. **Task 4 closed it**: every
        door's discard/save-success (`LogSession.tsx`'s monitor-discard,
        manual-discard, save-success; `Today.tsx`'s discard door) now
        routes through `handoffStore.retire()` instead of
        `clearMonitorRun()`/`saveMonitorRun()` — that retire is what
        plants the tombstone a late burst's commit needs to be refused
        against. The leg landed AT the door (retire happens, then the
        physical clear falls out of `retire()`'s own removal), not inside
        `retire()` itself, matching the diagnosis above. Gated by a
        dedicated door-leg test (`LogSession.test.tsx`, "the door leg —
        Discard tombstones the key…") that drives Discard through the
        real UI, then attempts a late producer-style commit for the same
        key and asserts it is refused (`reason:"retired"`) rather than
        resurrecting the record; mutation-probed by reverting the door to
        the legacy `clearMonitorRun()` — the test failed (the late burst
        was accepted, `accepted:true, revision:1`), confirming it bites.
        Full detail in `.superpowers/sdd/2026-08-30-handoff-store/task-4-report.md`.
        **Task 5 (the doors + the #230 restoration) landed 2026-08-30,
        CLOSING the "NARROWED BY TASK 4" condition above.**
        `useStartWorkout.ts:99` (confirmReplace) and
        `WorkoutDetail.tsx:298` (row-instead) now route through
        `handoffStore.retire()` (a fresh, non-render `currentUnretired()`
        read, key-bound) instead of `clearMonitorRun()` — the proven
        interim asymmetry is gone; a door-leg test at each (real UI path)
        drives Discard/Replace/Row-Instead through the real component,
        then races a producer-style commit for the same key and asserts
        it is refused (`reason:"retired"`); mutation-probed by reverting
        each door to the legacy clear — both door-leg tests failed
        exactly as expected (the late burst was accepted,
        `revision: 1`/`verdict: "saved"`), confirming they bite.
        `connectGuardStage` (`monitorRun.ts`) now takes the MonitorRun
        half of its answer as a boolean PARAMETER rather than calling
        `loadMonitorRun()` itself (it cannot import `handoffStore.ts` —
        the same circular-import constraint Task 3's own doc comment
        states for the create-commit); both callers (`ConnectAction.tsx`,
        `useStartWorkout.ts`'s `handleStart`) now derive it from
        `currentUnretired()`, closing the P1-1 memory-only-record hole at
        both guard doors — a dedicated test per door seeds a record
        through the store with the DURABLE write denied and confirms the
        guard stages "unlogged" where `loadMonitorRun()` would have seen
        nothing; mutation-probed by reverting each guard's own call site
        back to `loadMonitorRun()` — both memory-only tests failed, each
        alone. **`monitorRunState()`/`anyLiveSession()` were LEFT
        UNCHANGED, a deliberate deviation from the spec's literal
        wording**, not a silent gap: `anyLiveSession()` has zero
        production callers (Task 3's own header comment on this file, M-2)
        and fixing it would require the identical parameter-threading
        change against a 9-cell truth-table test file with no
        corresponding product benefit — judged disproportionate per
        CLAUDE.md's own "spend proportionally" rule; flagged for whoever
        next touches this function, not chased further here.
        **CORRECTED AT REVIEW, same day: the armed retire's EXECUTION
        POINT moved from "Connect anyway" press to the wire "armed"
        event.** A first draft had `ConnectAction.tsx`'s own
        `handleConnectAnyway` retire the staged store entry immediately,
        at that press, before `onProceed` even ran — before BLE, before
        programming, before either of `handleConnectProceed`'s own two
        synchronous early returns (missing baselines, `CompileError`).
        The reviewer's own probe proved this a real F5-class regression:
        seed a stale record, Connect, Connect anyway, a REAL
        transport-missing failure, Cancel — `currentUnretired()` and
        `loadMonitorRun()` both came back `null`, even though nothing was
        ever created to replace it, contradicting every interstitial
        state's own doc comment ("Cancel... always lands back on
        Workout detail with nothing lost"). **Fixed**: `ConnectAction.tsx`
        now only STAGES the authorization in the store
        (`handoffStore.stageRetire`, a new process-scoped slot,
        unconditionally overwritten on every Connect press so a stale set
        from an abandoned earlier press can never survive to authorize a
        later one — the rev-3 antagonist's own words, "a set staged for
        attempt 1 must not authorize attempt 2's retire"); the actual
        retire moved to `useMonitorSession.ts`'s own `event.kind ===
        "armed"` handler (`handoffStore.takeStagedRetire`, reason
        `"connect-guard-armed"`) — the wire acceptance point a failed or
        cancelled program never reaches at all (census: "Connect ->
        program -> armed | failure-card", armed strictly after program).
        `cancel()` and the `programDropped` reset both DISCARD (not
        retire) whatever is staged, so a dead attempt's own authorization
        never leaks into a later one. `createMonitorRun`'s own
        pre-existing "whatever remains" defense retire at the first real
        rowing frame is UNCHANGED (kept as the narrower backstop for the
        residual armed-to-first-frame window; removing it would reopen a
        real `store-second-key-refused` risk the design's own "no
        rendered change" exit criterion forbids) — its own doc comment
        now states plainly that it is genuinely redundant in the ordinary
        case, not merely "should be." Five dedicated hook-level tests in
        `useMonitorSession.test.ts` (retires exactly at armed, not
        earlier; a superseded revision proceeds and receipts; cancel
        discards and the record survives; an unstaged unrelated entry
        survives armed untouched — proving the retire is bound to the
        staged set, never a blind sweep) plus a permanent UI-level
        regression test in `WorkoutDetail.test.tsx` (the reviewer's own
        probe, promoted verbatim: Connect, Connect anyway, a real
        failure, Cancel, record survives on both tiers) and four
        retargeted `ConnectAction.test.tsx` tests (staging only — this
        component no longer retires anything itself). Task 4's row-10
        abandon-path stand-in is RE-POINTED AGAIN: it drives the real
        `ConnectAction` component for the authorization half (Connect
        stages) and stands in for the hook's own two-call armed
        consumption (`takeStagedRetire` then `retire`) for the execution
        half, since this LogSession-focused file has no real
        hook/transport to reach "armed" with. Mutation-probed: retire at
        press time again (the door-leg-style reversion) fails the new
        "Connect anyway, a real failure, Cancel" permanent test; an
        "unbound" armed retire (consuming `currentUnretired()` directly
        instead of the staged set) is what the dedicated
        "nothing staged: an unrelated entry survives" test exists to
        catch. Both run against the committed fix, confirmed to fail, then
        reverted: retire-at-press-time failed exactly 3 tests (the
        WorkoutDetail.test.tsx abandon leg plus two ConnectAction.test.tsx
        staging-only tests, which now saw a retire that should not have
        happened); the unbound-set mutation failed exactly 4 tests (the
        named staged-set leg plus the superseded/M6/create-defense tests
        it also collaterally broke, since an unconditional
        `currentUnretired()`-based retire fires even where nothing was
        staged).
        **Two further findings folded in at the same review:** (1)
        `Today.tsx`'s own stale-draft-discard guard effect
        (`Today.tsx:370`, `loadMonitorRun()` direct) is a THIRD legacy
        read alongside `monitorRunState()`/`anyLiveSession()` above — Task
        4's own report already disclosed it as "left unchanged, out of
        scope" (a different, `useEffect`-fired liveness check, safe under
        §8 since it never runs during render); added here so Task 6's own
        module-boundary sweep has all three named in one place rather than
        split across two tasks' reports. (2) `monitorRun.test.ts`'s own
        `connectGuardStage` describe block gained a header comment stating
        plainly that its tests exercise the FUNCTION's descending-severity
        branching given an asserted boolean, never the STORE's own
        broader tier-visibility (memory-only vs durable-only) — that
        broader claim is `ConnectAction.test.tsx`'s and
        `handoffStore.test.ts`'s own to prove, and always was; the
        comment exists so a future reader doesn't mistake one test file's
        scope for the other's.
        **The #230 restoration** (spec §11): `ConnectedSurface.tsx` (the
        Gate-0 approved held-error frame — the "COULD NOT KEEP THE RECORD
        ON THIS PHONE." strip, Retry/Log it anyway, reachable now that
        Task 3 already shipped its producer), `ConnectedSurface.test.tsx`,
        `ConnectedSurface.screens.test.tsx`, `ConnectedInterstitial.test.tsx`,
        `ConnectionLogSheet.test.tsx`, `PaneGrid.test.tsx`, the
        `connected-ended-error` e2e fixture + screenshots-loop entry, and
        the two captures all restored verbatim from
        `origin/wave-f-aud016-spec` — every one of these files had either
        ZERO drift from the shared merge-base on this branch, or a drift
        (the mechanical `holdError`/`retryHandoffSave`/`proceedHandoff`
        fake-session widening) byte-identical to what Task 3 made
        independently, so nothing on this branch was lost.
        `WorkoutDetail.connectedRecovery.test.tsx` (new file, the binding
        route gate, spec §10 row 12) passed UNMODIFIED against the store
        substrate on its first run; every "the slot" comment retargeted to
        "the store's memory tier" (the module-slot mechanism it narrates
        is deleted by this design — spec §2). **`WorkoutDetail.test.tsx`
        needed NO restoration at all**, contradicting a literal reading of
        the spec's own restore list: its only difference from the
        reference branch was the identical mechanical widening, already
        present in substance on this branch — checked via a three-way diff
        against the shared merge-base, not assumed.
        Gates (re-run in full after the review fix round): `pnpm test
        --project unit --project client` green (5572/5573 tests, 1
        skipped, 200 files; two unrelated pre-existing flakes observed
        once each in `server/routes/data.test.ts` — a different
        individual test both times — gone on re-run, confirmed unrelated
        to this diff); `pnpm e2e` 420/420, re-run after the review fix
        since `ConnectAction.tsx`/`useMonitorSession.ts` behavior changed;
        `pnpm screenshots` 82/83 (the one failure, `releases`, is a stale
        `v0.26.0` version pin against a `v0.27.0`-tagged main — unrelated
        to this task, not fixed here); the two `connected-ended-error`
        captures opened and inspected (RF7) — legible, correct button
        order and copy, no overlap — and came back BYTE-IDENTICAL to the
        restored reference bytes, confirming the restoration renders
        pixel-for-pixel as #230's own Gate-0 approval; lint/format/
        typecheck clean throughout. 19 unrelated screenshot files that
        changed from environmental/date-dependent rendering noise
        (today/you/log/news/post-workout-summary screens, none touched by
        this task's diff) were reverted per the task's own "revert
        unrelated churn" instruction. Full detail in
        `.superpowers/sdd/2026-08-30-handoff-store/task-5-report.md`.
        **Task 6 (close-out) landed 2026-08-30 — the plan's own six tasks
        are now ALL complete.** The module-boundary gate (spec §10 row 11)
        finally lands (`scripts/handoffStoreBoundary.test.ts`): nothing
        under `src/` outside `handoffStore.ts` (plus a disclosed
        allowlist — `monitorRun.ts`'s own legacy `saveMonitorRun`/
        `clearMonitorRun`, zero production callers, kept for the large
        pre-existing test-fixture convention that calls them directly) or
        `e2e/` (design.spec.ts/screenshots.spec.ts/session.spec.ts, plus
        `connected.spec.ts` — a genuine fourth writer this close-out found
        that the close-out brief did not name) writes or removes the
        durable key; mutation-probed twice (a non-store src file, a
        non-allowlisted e2e spec), both go red, both revert clean.
        **Fix round 1/5 (2026-08-30) widened it after review:** the
        realistic bypass — a new door calling the legacy, allowlisted
        `saveMonitorRun`/`clearMonitorRun` directly, which held the only
        raw key writes and gave the ORIGINAL gate zero signal, exactly the
        regression already reproduced 4x across Tasks 4-5's own record —
        now gets its own check (comment-stripped first, so the four
        production files that merely NAME `clearMonitorRun()` in prose
        don't false-flag); mutation-probed (a `saveMonitorRun` call added
        to a non-store file), goes red, reverts clean. The full spec §10
        mutation ledger is now consolidated (Tasks 1-5's own recorded
        mutations, plus six run fresh at close-out and its fix round: row
        2's post-release window-predicate gate, row 5's
        tombstone-refusal-bumps-revision leg (plus a spoken skip — `read`/
        `currentUnretired` never consult tombstones in this
        implementation; Task 2's own `retire`-nulls-`current` mutation is
        row 5's real detector), row 11's revision-reuse, row 11's
        module-boundary writes (both checks), and **row 11's
        tier-precedence reorder — CORRECTED at fix round 1/5: the
        single-line mutation is a genuine non-bite, but the row's
        invariant IS pinned by a reachable COMPOUND mutation (removing the
        `if (hydrated) return` re-entrancy guard together with forcing the
        population guard true) — 6 files / 40 tests fail, including
        `useMonitorSession.test.ts`'s "S1 — the write-count witness"
        (`expected 2 to be 6`) and `LogSession.test.tsx`'s claim-race test
        (`retiredRevision` 1→0, `superseded` true→false). Producer purity
        (Task 1/3's own mutations) is a DIFFERENT invariant and is no
        longer cited here as a substitute.**) — full table in
        `.superpowers/sdd/2026-08-30-handoff-store/task-6-report.md`.
        `pnpm screenshots` now passes 83/83 (the stale `v0.26.0`
        release-notes pin bumped to this branch's own `v0.27.0` tag).
        Running it also surfaced one genuinely stale, unrelated capture —
        `connected-interstitial-ready{,-landscape}.png` still showed
        PR #227's retired "KEEP THE SCREEN ON" copy, never refreshed
        against the source's actual, already-shipped "KEEP YOUR PHONE
        SCREEN ON" — refreshed here since it corrects drift rather than
        adding noise; 21 other environmental/date-dependent diffs
        (today/you/log/news/post-workout-summary, Task 5's own named
        category) were reverted again, unchanged in kind. `monitorRunState()`/
        `anyLiveSession()` and Today.tsx's own stale-draft-discard guard's
        `loadMonitorRun()` read (the THIRD legacy read Task 5's review
        named) are both left in place, with a citing comment each:
        deleting either would orphan the cross-file anti-pattern
        documentation naming them by design (M-1's own reference pattern,
        `todayGuard.pin.test.ts`'s binding pin) — exactly the "unrelated
        churn" this close-out's own brief says to avoid dragging in.
        Per-file coverage on all ten store-touching files:
        `handoffStore.ts` 100/98.91/100/100, `useMonitorSession.ts`
        98.55/95.82/98.79/99.65, `monitorRun.ts` 100/98.13/100/100,
        `LogSession.tsx` 99.04/95.73/96.61/98.97, `Today.tsx`
        99.36/97.67/100/100, `ConnectAction.tsx` 100/100/100/100,
        `WorkoutDetail.tsx` 91.37/90.42/100/91.07, `useStartWorkout.ts`
        100/100/100/100, `ConnectedSurface.tsx` 100/100/100/100,
        `ConnectedInterstitial.tsx` 100/100/100/100 — none under 90 on any
        axis (RF2). Full gates green: `pnpm lint`/`format:check`/
        `typecheck` clean; `pnpm test --project unit --project client` 201
        files / 5576 passed + 1 skipped (5577); `pnpm test:coverage` (all
        three projects) 219 files / 5824 passed + 1 skipped (5825),
        aggregate 98.93/97.45/98.98/99.35; `pnpm e2e` 420/420; `pnpm
        screenshots` 83/83. **AUD-016 stays NOT STRUCK** — the line above
        ("Needs a PM final-PR gate before merge... not struck until
        then") still governs, unchanged by this close-out task. Full
        detail in
        `.superpowers/sdd/2026-08-30-handoff-store/task-6-report.md`.
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

**Status:** Opens 2026-08-29 (James: _"we can open the logbook Saturday"_).
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

| Item                      | What                                                                                                                                                                                                                                                                                                                                                              | Evidence      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| **RC-29**                 | A 2.5 s banner threshold writes `endedBy: "link-lost"` AND suppresses `driver.terminate()`. **The derivation audit's worst finding.** False positive measured: 9 banners in 288 s over a link that never dropped (`walk-2026-08-26/`). Site is `useMonitorSession.ts:3210`. Triad weight — it sends and suppresses a wire command                                 | `phase-rc.md` |
| **RC-30**                 | Teardown can TERMINATE a live piece, keyed on derived `phase === "ready"` rather than `frame.state`. **Declined at the RC close 2026-08-28** — it fails the fast path's fifth check, and its fix loses DEVIATIONS row 70's coverage. Never observed in the field; highest per-incident cost of anything in this table                                             | `phase-rc.md` |
| **RC-13**                 | The avg-pace verdict zero-fires on a rapid re-arm: `program()` inside `FINISH_GRACE_MS` cancels the pending deadline instead of draining it. **Not covered by the close-out corpus** — no committed capture has a re-arm inside 3 s, and the closest pieces are 148.1 s apart                                                                                     | `phase-rc.md` |
| **RC-14**                 | The avg-pace verdict zero-fires on an ORDINARY finish (walk 2026-08-25, W-2). **Distinct from RC-13; do not fold.** Narrowed at the close: replay through the walk's own commit `c219ee0` DOES produce the verdict, eliminating the wire, the driver's response and ring eviction. **Two survivors:** it threw, or something outside the driver dropped the entry | `phase-rc.md` |
| **The PARTIAL complaint** | Nothing on the summary SAYS an abandoned piece ended early. The rower's own words: _"I want it to say I stopped, not silently show a shorter piece that looks like I planned a 250 when I meant 500 and bailed"_                                                                                                                                                  | `phase-rc.md` |
| **"Run it again"**        | A resend control on the log screen when a session ended early. James, 2026-08-27: _"You could put a resend in the log screen when it's exited early like this."_ **This was recorded as told-to-James and was not** — recurring failure 14, with the controller as cause. Applies only to sessions that produced a row and ended early; RC-37 does not cover it   | `phase-rc.md` |

## Phase PROTO — the wire-semantics audit (unopened, L)

James, 2026-08-27: _"im also interested into a deep dive to ensure we arent
hallucinating anything in the protocol... we've misused fields before or
conflated them to meanings they dont have."_ Enumerate every claim we make about
a PM5 field and classify it VENDOR-CITED / OBSERVED / INFERRED.

- **RC-38** — transcribe `OBJ_WORKOUTTYPE_T`. We have read one row of an enum we
  key a check on: `8` is sourced, `1` and `0` are sourced nowhere. James,
  2026-08-27: _"have we been making assumptions that are unfounded here? is
  there documentation about workoutType from concept2?"_
- **The axis-quantity question** — should `traceModel.ts`'s `t` and `d` become a
  true work-only clock? The PR-2 collision is discharged by labelling
  (`MACHINE CONFIRMED · WORK ONLY`), but the underlying question is open and
  **sharper after RC-5**: the chart's axes are now the last rest-inclusive
  quantity on the screen.

## Rides the next PR touching the connected surface

| Item                                       | What                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Evidence                     |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **RC-8**                                   | Correct the fake's contradictions of the real wire. **3 of 5 corrected** in #182 T1 (`ergMachineType`, `intervalRestTimeSeconds`, `splitIntervalType`); the other two read as already conditional and want verification. Residual: `fake.ts`'s `toMachineIndex` is resting-conditional while `intervalIndex.ts`'s `toActualIndex` is unconditional. **Merged with LL's reconnect precondition — one piece of fake work, and specced apart it gets done twice** | `phase-rc.md`, `phase-ll.md` |
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
     **The same notes owe two more things (landed here from the
     2026-08-28 phase-open ruling at PR #228's PM gate — because the
     note-writer reads THIS row, not the ledger):** the no-backfill
     sentence naming the **18** permanently-ours rows (James's fresh
     2026-08-30 prod count, above — "0 of 18"); and the post-End wait if
     perceptible (the hold only — AUD-016's verify write is NOT in this
     tag). **The failed-write-state sentence (`COULD NOT KEEP THE RECORD
     ON THIS PHONE.`, its two buttons) was landed here at James's #230
     P2b review and REMOVED at the 2026-08-30 pause ruling: it describes
     a screen v0.27.0 does not contain. It returns with the hand-off
     store's PR** (the gate that lands a condition owns removing it when
     its subject stops shipping — pm-ledger, 2026-08-30).
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
- **Native burst lag against `BURST_HANDOFF_HOLD_MS`** — the 2000 ms backstop's
  corpus is web/foreground only (End-arm round-trip n=1, web; background/resume
  n=0). The next connected walk reads the ring for `burst-timeout` receipts and
  the End-arm terminate round-trip on native BLE. (PR #228's PM gate)
  **Widened at #230's PM gate (2026-08-30):** the AUD-016 verify adds a
  synchronous full-run re-serialize (~720 KB worst case) to every ended
  hand-off, so the same walk measures TOTAL post-End latency on native, not
  only the burst backstop — one walk, both numbers.
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
- **JR PR 0b's capture walk** — see the deferred section; it rides the next erg
  session regardless of whether JR is ever built.
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
- **Date-keyed event suggestions** (James: _"trick or treat Trot"_). A globally
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
