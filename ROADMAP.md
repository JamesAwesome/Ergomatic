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

**Phase TD (below the live slate) is where DEBT goes** — gaps in evidence, a
capture that cannot be taken, a test that could not be made to bite. It is
deliberately not scheduled. The rule that put it there (James, 2026-09-08):
a filed row needs either a TRIGGER, so it resurfaces when it starts to
matter, or a PHASE, so it can be scheduled as one piece of work. "Small,
queued" is neither once it passes a couple of hundred rows, and it had.

**Every row filed from 2026-09-10 ends with a death condition** —
`· dies YYYY-MM-DD · <why this is a row and not a fix now>` — and a date is
required even when the row also names a trigger, because Phase OD measured a
row whose trigger had already fired sitting twenty days. Rows filed before that
date carry none and are not being migrated; a row gets one the next time any PR
touches it. **A WAVE IS STAMPED ON ITS STATUS LINE, NOT ROW BY ROW (ruled by
James 2026-09-10).** A wave's rows are the scope of one sequenced piece of work
and they all die together when it closes, so dating them individually writes
the same clause five times — which is the tell that the row is the wrong unit.
The wave carries one date, and it answers the question that actually rots: has
this wave OPENED. Wave D's simulator row records its own subject as "two waves
out and on no calendar", which is the furniture failure at wave size and is
what the heading stamp catches. The final PR of any piece of work puts two lists in front of James
before anything is filed: what it proposes to add, and every row anywhere whose
date has passed. Nothing is struck without him.

**There is no script for this, on purpose.** Phase RR built one — a row
counter, a class marker on every heading, four rules and a CI gate — and it was
abandoned on 2026-09-10 as the wrong answer to a real problem
([detail](docs/history/phase-rr.md)).
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

## Phase MT — the app refuses a machine it cannot record

**Status: SPEC APPROVED 2026-09-08, in flight.** Shape approved by James the
same day: **Option A (refuse the sitting) with a DENYLIST**. Spec:
[docs/superpowers/specs/2026-09-08-unsupported-erg-machine-design.md](docs/superpowers/specs/2026-09-08-unsupported-erg-machine-design.md).

The PM5 fits the RowErg, SkiErg and BikeErg, and `ergMachineType` — the field
that says which — had no consumer from the day it was first decoded until
this phase. A SkiErg
therefore connects, gets programmed, and stores its piece as a row. Worse than
the local wrongness: `server/concept2/mapping.ts` posts a hardcoded
`type: "rower"`, so such a row is uploaded into the rower's Concept2 logbook as
a rowing result, and its verification code is guaranteed rejected — Concept2's
own documentation says the code is accepted only if "date, time, distance,
workout_type and machine type match".

TRIAD (it decides what a stored row may MEAN): full antagonist pass on the
spec, PM final gate on the PR, and Gate 0 on the rendered refusal screen.

- [x] **PR 1 — MERGED as #366 (`a476cbc6`), ticked 2026-09-09. The refusal, the link, and the matrix.** A domain denylist
      stating the RULE rather than a subset of it: refuse every value the vendor
      NAMES as not rowing — 64 (Dyno), 128/143 (ski), 192-194/207 (bike),
      225/226 (MultiErg ski/bike) — and allow everything else, named or not,
      including 224 (MultiErg on a rowing interval). The driver classifies on
      the FIRST decode; the hook routes it through the existing `fail()` path,
      which chains a `terminate()` ahead of the disconnect so the workout we
      just sent is withdrawn from the erg. Safety is an invariant, not a race:
      `maybeEmitFrame` cannot emit before a 0x0032 has decoded and no record
      opens without a frame, so nothing can be stored or sent on either connect
      door. Plus one link, `WHICH ERGS WORK ›`, into `connect-the-monitor`, and
      a three-tier support matrix published there. No stored-shape change and no
      migration. **M**

### Owed by this phase, filed here rather than in a PR body

- [ ] **A refused sitting on the FREE-ROW door can still retire a record.**
      `beginFreeRow()` emits `armed` on the CSAFE ack — the same ack that
      releases the status subscriptions — so on that door `armed` precedes the
      first classifiable frame structurally (449 ms, measured in
      `docs/monitor/sessions/walk-2026-09-03-connect-sooner/ring-2-free-row.json`),
      and the `armed` handler is where a staged handoff retire fires. James
      ruled 2026-09-08: ACCEPT, because reaching a staged retire at all requires
      the rower to have confirmed "connect anyway" over that record, and the
      alternative (holding the free row's arm until classification) costs every
      Just Row ~449 ms forever to protect against a machine nobody owns. The
      handler's comment is corrected in the same PR; this row is the residual.
      **S**
- [ ] **The published matrix goes stale silently.** It is a claim in the app's
      own voice, the same class as a shipped release note (RF9's drift class).
      Changing `mapping.ts`'s hardcoded `type` or the denylist reconciles the
      middle tier of `connect-the-monitor` and recounts the registry `minutes`.
      The trigger is also recorded in the article's own source comment. **S**
- [ ] **A MultiErg reporting a STATIC ski or bike value would be refused
      outright.** The
      vendor sentence that would exclude this — "this will be the one of the
      MultiErg Machine Types" — is footnote 23, on `0x003C`, the one carrier we
      do not subscribe. The two we read (footnotes 7 and 11) say only "the
      Machine Type of the current interval". No capture and no vendor sentence
      settles what a real MultiErg reports on 0x0032. Unowned, accepted. **S**
- [x] **`permission-denied` already ships a five-button action stack, and it
      leaves a 10px body in landscape.** CLOSED by the landscape budget fix
      (Gate 0 approved 2026-09-08): the failure frames' action stack now pairs
      its last FOUR buttons, taking this frame 10px -> 138px, `link-failed`
      78px -> 206px and `unsupported-machine` 142px -> 206px, all measured on
      the real frames at 844x390. The scope widened at the gate because the
      capture showed `link-failed` — the failure a rower actually hits — was
      cutting its headline too.
      CORRECTION TO THIS ROW'S OWN CLAIM: it said the last-two pairing left
      five buttons at "74px and the headline is on screen". The headline runs
      to y94 on any frame whose title wraps, so 74px CUT it — the reason the
      approved fix pairs four rather than two. **S**
- [x] **Nothing can gate the five-button failure frame.** CLOSED by a SEAM
      (James ruled BUILD, 2026-09-08), at the Phase MT close-out.
      `canOpenAppSettings()` now also returns true when
      `window.__appSettingsDoor__` holds the literal `app-settings door (dev
      override)`, inside the same `DEV || VITE_ENABLE_FAKE_MONITOR` build-time
      fold every other dev seam here uses; `e2e/helpers.ts`'s
      `forceAppSettingsDoor` writes it and `e2e/design.spec.ts` drives the
      real five-button React tree — the shape, `Open Settings` first, the
      44px/axe/ink-4 sweep, and the landscape geometry at 844x390.
      The override moves ONE boolean: `openAppSettings()` is untouched, so a
      forced-open button on the web calls no plugin. A global `isNative()`
      stub was ruled out with a receipt — `adapters/monitorTransport.ts` takes
      the Capacitor BLE arm on `isNative()`, which would kill the fake every
      connected walk runs on (RF13).
      MEASURED on the real frame, which is also the check that the seam
      renders the shipped screen rather than a reconstruction: window 138px,
      content 259px, overflow 121px — the same 121 the DETAIL-panel row above
      recorded for the five-button shape after #378. Reverting the pairing to
      `nth-last-child(-n + 2)` now fails HERE ("the headline ends 20px below
      the body's visible bottom", expected <= 74.5, received 94), where it
      used to be catchable only one frame over; dropping the fifth button, or
      the override itself, fails the count at 4.
      `scripts/dist-grep.sh` gains the token as its tenth needle, proven both
      directions (RF12): a plain `pnpm build` leaves `dist/client` clean, and
      `VITE_ENABLE_FAKE_MONITOR=1 pnpm build` makes it exit 1 naming
      `dist/client/assets/index-*.js`, where the literal survives minification
      verbatim beside a `canOpenAppSettings` renamed to two characters. **S**
- [x] **The permission screen says "your PM5" where it means "your monitor".**
      CLOSED in the Phase MT close-out PR, together with the Bluetooth scan
      sheet's own instance of the same rule (both were RF32, both copy-only,
      so they landed as one change). `useMonitorSession.ts`'s
      `BluetoothPermissionError` detail now reads "Ergomatic can't reach your
      monitor without Bluetooth." The census the rule prescribes
      (`grep -rn "PM5" app/src` over string literals) also caught the NFC
      connecting card's "Keep the PM5 on and close by.", in both components
      that render it, and that changed with them. **S**
- [x] **The permission frame's DETAIL panel repeats its own remedy sentence.**
      RULED (James, 2026-09-08) and CLOSED at the Phase MT close-out: the panel
      renders `error.detail` only where the frame has not already printed it.
      Scoped to the invariant rather than the frame — TWELVE of the twenty
      reasons were duplicating, not one: `failedSerifLine` returns `detail` as
      the HEADLINE for every non-machine-refusal reason, and `permission-denied`
      prints it as its own body line. The reason slug and `raw` stay
      (`mapRadioFailure` always attaches a `raw` on the permission arm, so
      dropping the whole panel would delete the only diagnostic). Measured at
      844x390: permission-denied's landscape overflow 102px -> 53px, the
      five-button iOS shape 170px -> 121px, `link-failed` 13px -> 0. Every
      frame's before/after is in `docs/design/mt-closeout-gate0/`. **S**
- [x] **On the web build, the top of an overflowing interstitial body cannot be
      scrolled to at all.** CLOSED by #366's landscape fix: the body is
      `flex-start` plus auto margins on its first and last child, so overflow
      now falls entirely BELOW the window. Was: `justify-content: center`
      overflowed in BOTH directions; chromium clamps `scrollTop` at 0 while the
      first child sat at -30 to -100px, so the headline was unreachable, while
      WebKit permits negative `scrollTop` (measured range [-101, 102]) and the
      iOS app could pull it into view. Now GATED, by the row below. **S**
- [x] **"Row on the phone timer instead" is offered on the refusal screen.**
      RULED OUT (James, 2026-09-08) and CLOSED at the Phase MT close-out: the
      offer is withheld on `unsupported-machine` and kept on every other
      failure, where a radio that will not come up is exactly when the phone's
      own timer earns its place. Was: after a SkiErg refusal it routed the
      rower to store the ski piece as a rowing log by hand. The refusal is now
      the one failure stack with three buttons — `Try again` full width over a
      `View connection log` / `Cancel` pair, held by a
      `:first-child:nth-last-child(3)` rule and gated on real geometry in
      `e2e/design.spec.ts`. It costs no landscape budget (the stack is 120px
      either way) and gains 64px of portrait message window. **S**
- [x] **Two design gates the refusal screen owes.** BUILT, in
      `e2e/design.spec.ts`, each kept only because it went red on a stated
      mutation. (a) A REFUSED interstitial case (`ergMachineType: 128`,
      threaded through `injectConnectedFake` the way `screenshots.spec.ts`
      threads it) puts `.connected-support-link` in the DOM while
      `assertTapTargets` sweeps — the first time it ever has, since the
      existing case drives a `link-failed` failure and the link renders only
      for `unsupported-machine`. Dropping `min-height: var(--tap)` fails the
      sweep at `Received: 15`. (b) At 844x390 the same frame asserts the
      headline lies inside `.connected-interstitial-body`'s client box and
      that nothing sits above the minimum reachable scroll position (on
      chromium that position is always 0, so what the assertion reads is the
      first child's top; the review pass deleted a `minScrollTop === 0`
      companion that no CSS could fail); the FAILED case gets the second half
      too, for the price of a resize.
      Restoring `justify-content: center` fails it at -7.5px on the refusal
      frame and -70.5px on the link-failed one. TWO CORRECTIONS TO THIS ROW'S
      OWN PRESCRIPTION, both measured: the auto margins are not what saves the
      frame (they resolve to zero exactly when the overflow is negative, so
      flipping the one declaration is enough), and the design pass's -73..-37
      figures are unreachable by a CSS-only mutation now, because #366 also
      dropped the DETAIL panel from this frame. The containment half needs a
      body window under 58px, which four buttons never produce — it goes red
      only on the five-button stack with the pairing removed (window 10px,
      headline 48px below the fold), so what it actually pins is the landscape
      action-stack budget, not the centring. THAT SHAPE IS NO LONGER
      HYPOTHETICAL: the Phase MT close-out's door override makes it reachable
      from a browser, and `design.spec.ts`'s five-button case gates it
      directly, so this frame's copy stays a dormant tripwire rather than the
      only home of the claim. **S**
- [ ] **The refusal-survives-its-own-consequences guard is UNGATED.** `fail()`
      refuses to let a standing `unsupported-machine` error be overwritten by
      the `program()` rejection the refusal itself caused — without it the
      rower watches the machine message become a generic failure screen a beat
      later. The guard is correct on its face and NO TEST CAN MAKE IT FAIL.
      Three routes were tried and all three go green with the guard deleted:
      `deaf` starves the terminate's own settle so nothing rejects;
      `failNextProgramFrame` rejects before the status subscriptions release,
      so the refusal never fires; `lagStructureOneTick` produces no second
      `fail()` at all. **What it needs is a fake control that withholds 0x0031
      for a bounded number of ticks without starving the CSAFE ack path.** On
      hardware the window is the measured 544 ms between the first 0x0032 and
      `armed`. Found by the whole-branch review, finding 1. **S**
- [ ] **`connected.spec.ts:1703` poisons its own origin for a later run.** The
      QuotaExceededError leg fills origin storage until `setItem` genuinely
      throws; its own title says "junk cleaned up after", but a SECOND run
      against the same already-booted stack fails at `signInViaBackdoor`,
      before any assertion. Seen 2026-09-08 during Phase MT: full `pnpm e2e`
      passed 545/545 on a fresh stack, and re-running that one test against the
      surviving stack failed. Either the cleanup misses something or the
      failure is in the harness's own storage use. Costs a debugging round to
      whoever meets it next. **S**
- [x] **A refused machine is still remembered as `LAST USED`.** FIXED in the
      Phase MT close-out PR (James ruled it in on 2026-09-08). The invariant
      now gated: a machine the denylist refuses is never remembered as
      LAST USED. It had to be a CLEAR rather than a narrower save — the
      refusal rides a decoded 0x0032, so the pair (and therefore
      `saveLastDevice`) necessarily precedes it — and the refused name comes
      from a ref rather than `session.deviceName`, which `fail()` nulls in the
      same update as the phase flip. `forgetLastDevice` removes the key only
      when it still holds that exact name, so refusing one monitor cannot
      un-remember a different, good one. **S**
- [ ] **`type: "rower"` is still hardcoded for machines the denylist lets
      through.** Concept2's results enum has separate `dynamic`, `slides` and
      `multierg` members, and the PM5 enum names `STATIC_DYNAMIC` (8), the
      `SLIDES_*` family (16-20, 32) and `MULTIERG_*` (224-226). All of them are
      rowing, so a wrong `type` is a smaller wrong than a SkiErg's — but it is
      still wrong, and Concept2 rejects the verification code on a machine-type
      mismatch either way. Deliberate consequence of the approved denylist
      direction, not an oversight. **S**
- [ ] **A monitor on pre-2018 firmware cannot be classified at all.**
      `ergMachineType` is ABSENT below interface revision V1.26/V1.27, and
      Phase MT does nothing on absence — refusing on ignorance would break a
      working erg. `0x0016` ("Connected Erg Machine Type", READ) would settle
      it and needs a `Transport.read`, which is the existing firmware-version
      register row's dependency too. Both are unblocked by the same work.
      **But `0x0016` may not exist:** rev 1.30's revision history reads
      "2/3/2017 ... Deleted Machine Type information in Device Info Service as
      firmware unable to support it. V1.21." Establish that before costing it.
      **S**

## Phase DE — Difficulty out, effort in

**Status: all three PRs merged — spec (#308) 2026-09-05, PR 1 (#309)
2026-09-05, PR 2 (#310) 2026-09-05 (shipped as v0.39.0), PR 3 (#400)
2026-09-12, per the Saturday trigger below and James's explicit merge
approval. Phase functionally done; `/close-phase` not yet run** (the
exit-criteria walk, PM close gate and moving this spec to
`docs/history/` are separate work). **TRIAD** (stored shape).
**M.** Spec:
`docs/superpowers/specs/2026-09-05-difficulty-out-effort-in-design.md`.

**Goal:** a rower sees one figure for how hard a workout is, called EFFORT,
on every row, filter, picker, log and article. EASY / MEDIUM / HARD goes
(across all 300 seeded workouts it was a coarse copy of the 1–5 figure:
easy always 1–2, hard always 4–5, medium 2–4), and the 1–5 figure formerly
called PAIN is renamed. Nothing about what the number means changes;
nothing here reaches the PM5 or the pace math, so no hardware walk.

**Why it runs before Wave A:** a stranger reading `PAIN 4/5` on their first
log is itself a north-star failure, and a rename only gets more expensive
as surfaces accumulate; this is M-sized and touches no auth.

Three PRs, in order; **PR 1 and PR 2 ride ONE tag — no release between
them** (a tag after PR 1 alone ships a half-move and a second stale-build
generation):

- [x] **PR 1 — remove difficulty (#309).** No migration: the column, enum and
      `preferences.difficulties` stay as read-only compat until PR 3, and
      the server writes a difficulty DERIVED from effort on every insert
      (1–2 easy, 3 medium, 4–5 hard) so pre-PR-1 builds — which call
      `difficulty.toUpperCase()` in three renderers — never see a NULL. The
      chip, both filter groups, the preference, the builder radiogroup, the
      seed field and the bulk-header column go. Bulk header becomes
      `title | TYPE | effort`; the 4- and 5-field legacy headers still parse
      with difficulty ignored. Today's suggestion filters on type, time and
      effort only. `library.test.ts`'s within-type ordering invariant is
      re-expressed over effort, not deleted — which required a stable
      re-sort of the AT and TR seed blocks (38 rows move; the seeder's
      converge then rewrites their stored difficulty at merge, 27 of them
      medium→hard as pre-PR-1 builds see it). **Gate 0 captures** (row, Today
      card, both sheets, classification card) before implementation.
      Reconciles the DEVIATIONS "Difficulty" row, the "picking a workout"
      article's false "easy and a 4" example, `library-moves.ts`, both
      skills' pasteable headers.
- [x] **PR 2 — rename pain → effort (#310).** HAND-WRITTEN migration (drizzle has
      never generated a RENAME here; its non-TTY fallback is DROP+ADD):
      column renames on `workouts` and `session_logs` plus an
      `article_reads.slug` UPDATE. NOT rollback-safe and `deploy.sh`'s
      health-gated auto-rollback crosses it unattended — PR 2 adds its tag
      as a RELEASING.md § Rollback-constraints floor row, FORWARD-FIX ONLY.
      API serves both `pain` and `effort` (nine response sites) and accepts
      either on write (three inbound sites; both present and unequal → 400);
      every `pain`-keyed write emits a `compat.pain_write` log line. Three
      localStorage keys read the old key as a fallback for one release.
      `PainBar` → `EffortBar`; article slug `pain-scale` → `effort-scale`
      with the old slug still resolving. The pace-word identifier FAMILY
      (~20 names: `Effort`, `EffortRef`, `isEffortRef`, `effortWord`, …) →
      `PaceWord*`, **stored key `{effort: "max"}` untouched.** Gate 0 is the
      word list (spec §4.4), no captures; the committed filter-sheet
      screenshots are refreshed in the PR. (An earlier "waits for AUD-016"
      condition here was void: AUD-016 shipped as #239 and was struck in
      #240; `Ergomatic-wt-aud016` is a stale pre-#239 spec branch.)
- [x] **PR 3 — drop compat. MERGED as #400 (2026-09-12).**
      (James, 2026-09-05: "We have like five users let's just schedule the work for
      Saturday"). **BEFORE generating this PR's migration: Phase RW PR C
      merged `0026` on `preferences` first, so delete any migration written
      off an older main and re-run `pnpm db:generate` against current main.**
      Drizzle applies journal entries whose `when` is strictly greater than
      the newest already applied, so a migration generated earlier is
      skipped **silently** — no error, no log line — and because
      `db.select().from(preferences)` names every declared column, the next
      `/api/prefs` 500s for every rower. No gate here can see it: every
      integration suite starts from an empty database and the deploy health
      check reads no schema. After this PR deploys, `curl` the deployed
      `/api/prefs` and confirm the body still carries `baselinesSkipped`. The earlier zero-`compat.pain_write`-for-seven-days
      MEASUREMENT is struck: the cohort is five household testers who all
      update, and `docker logs` only covers the current container, which
      every deploy recreates — so the gate was both overkill and
      unsatisfiable. The log line survives the week as a tripwire to grep,
      not a gate. Drop `workouts.difficulty` + its enum + `preferences.difficulties`
      and the derived write; drop `pain`/`difficulty`/`difficulties` from
      the API and the log line; delete the three localStorage fallbacks.
      Legacy bulk headers are kept on purpose. Own RELEASING.md floor row.

      **This order is DONE, not at risk** — the ONLY order in the file whose
      trigger was a calendar date, and the Saturday it named is the day it
      merged. Recorded here as the contrast case: eleven other live orders
      carried a wave, a PR, or him asking, and every one of those slipped;
      this one didn't. **Migration precondition verified**: the 0029 migration
      was regenerated off current main (0028 was the tip) before this PR
      opened, and CI's own `app` job ran the full migration chain against a
      real ephemeral Postgres (via `pnpm test:coverage`'s integration suite)
      before this merge. **AND the merge's own deploy ran clean**: the
      `deploy` job (self-hosted runner, `scripts/deploy.sh` over SSH) on
      commit `13adce4` completed successfully
      (github.com/JamesAwesome/Ergomatic/actions/runs/34699658452,
      job 103570288978) — its health-gated wait passed against the real
      production database with 0029 applied, which is the actual event the
      "curl the deployed `/api/prefs`" line above exists to catch a failure
      of. **Not independently re-verified by this session's own authenticated
      request**: `GET /api/prefs` requires a session this sandbox holds no
      production credentials for, AND its network egress to
      `ergomatic.waffle.haus` is itself blocked (`curl` fails with
      `CONNECT tunnel failed, response 403` — an organization proxy policy,
      not a server-side failure) — a by-hand authenticated curl is still
      James's to run if he wants the stronger check; the clean deploy is
      strong evidence on its own.
**Exit:** the two phase-close greps in spec §6 (no `pain`/`difficult`; and
`effort` means one thing) pasted into the close gate; e2e and screenshots
green with refreshed captures; the by-hand stale-build check (a `v0.38.1`
web build against the post-PR-2 server saves `pain: 3`, reads back
`effort: 3`, and a workout it creates carries a derived difficulty)
recorded in PR 2's body; release note in rower words (spec §6.6).

## The free row's rate tile disagrees with itself

**Status: DONE — fixed and merged in #402 (2026-09-12); closed on Phase MD
PR 1's branch on the way past.** Was: SCHEDULED 2026-09-12 — one small PR,
not a phase item and not fast path (it changes what a rower reads). S. ·
dies 2026-09-19 · a wrong number
on a screen today with a one-clause fix and no migration; a week is generous
and anything longer means a refactor phase outranked a defect, which is the
exact trade the PM gate refused.

**What a rower sees.** Finish a connected free row and the RATE tile reads the
monitor's own average — 25 spm on the capture we hold. Reopen that same row
from History and it reads `—`. Same row, same trace, two screens, one number
present and one gone.

**Why.** The tier is derived twice and the two derivations disagree.
`summaryModel.ts:1255` (live) sets `finished: run.endedBy === "finished" ||
run.mode === "justrow"`. `storedSummary.ts:780` (reopened) sets
`finished = row.endedBy === "finished" || row.endedBy == null` — and `StoredLog`
has no `mode`. A connected free row's `endedBy` is always `"rower"` and it
stores `steps: []`, so the reopened door takes the terminated branch with no
weighable split and `sessionStrokeRate` (`logbookDerived.ts:53-62`) returns
`undefined`. The per-interval table beside it IS correctly shared by both
doors; only the hero tile skipped the pattern.

**The fix is one clause.** `StoredLog` already carries `workoutId` and
`workoutType`, and `domain/types.ts:38` already exports `isFreeRow`. No column,
no migration, no stored-shape change — which is why this is not TRIAD despite
touching a number, and why deferring it was never worth what it cost to defer.

**Its gate is the whole point, and neither suite has it.** One test that saves
a connected free row through the live door and reads it back through the stored
door, asserting the two RATE values are EQUAL — RF24's producer-to-consumer
shape. No existing test pairs a `workoutId: null` fixture with a rate
assertion, which is exactly why three green suites never saw this.

**Evidence status.** The divergence is confirmed in code, read at all four
sites by the controller and independently at the PM gate. That a saved free row
carries `endedBy: "rower"` rests on `summaryModel.ts:1247-1249`'s own measured
comment and the fixture at `storedSummary.test.ts:1866`, not on a run against a
real row. The test above settles it either way, and if it comes back green the
row closes with that recorded rather than being quietly dropped.

**Found by** the 2026-09-12 architecture walk
([findings](docs/superpowers/audits/2026-09-12-architecture-walk/findings.md),
S1). Left out of Phase MD because it is a defect, not a deepening; scheduled
here because the PM gate priced the fix and ruled that "out of scope for this
phase" is not a reason to leave a wrong number on a screen.

## Phase MD — the monitor cluster's shallow seams

**Status: OPEN 2026-09-12 — four PRs and two explorations; PR 1 next.**
**TRIAD on PR 1 and PR 3** (both change a stored shape: PR 1 the
`MONITOR_RUN_KEY` localStorage record, PR 3 the series sample persisted to
BOTH that record and Postgres). **L.** · dies 2026-10-13 · a month from
opening; the monitor cluster is the repo's hottest area (`driver.ts`,
`useMonitorSession.ts`, their tests and `surfaceModel.ts` are 6 of the 10
most-touched files of the last 250 commits), so a phase that improves how it
is CHANGED rots faster than most — if it has not started by then it is being
outvoted by feature work and that is James's call to make, not a slide.

**Goal:** the monitor cluster gets fewer, deeper modules — a large amount of
behaviour behind a small interface, tested through that interface. Nothing a
rower sees changes in any PR here. The measure is not line count: it is
whether a test can reach a behaviour without a module mock, whether a renamed
field becomes a compile error, and whether a fixture seeds through the real
producer instead of past it.

**Where it came from:** an architecture walk on 2026-09-12 over the hot spots
of the last 250 commits — [findings](docs/superpowers/audits/2026-09-12-architecture-walk/findings.md),
which also records the six candidates that are NOT in this phase and the seven
things that were attacked and held. Opened through a PM slate gate and an
antagonist anchor pass on the same day; both are folded in below, and the
anchor pass BLOCKED PR 1's first spec on four findings.

**What this phase is NOT.** `driver.ts` was attacked and held: 7493 lines but
2152 code lines, behind an interface of 7 members, one `Transport` in and one
11-member event union out, with tests that reach past it nowhere. It is deep,
not a god-module, and splitting it re-opens settled wire attribution. The
`Transport` seam held too — four adapters, three decorators, a 23-line
composer and a CI gate (`scripts/transport-census.sh`). Neither is in scope,
and a later pass proposing either owes the findings document an answer.

Four PRs, then two explorations. **The explorations are NOT numbered PRs, on
purpose (PM gate, 2026-09-12):** a numbered PR reads as owed work to every
later sweep, and the existence of both of these is undecided. Each opens with
an investigation whose honest answer may be "no PR".

- [x] **PR 1 — one writer for the stored run (TRIAD: stored shape). LANDED
      as PR #408 (2026-09-12): one file, 27 exports (from 35),
      `clearMonitorRun` deleted rather than moved (zero production callers —
      plan, "The export count"), `MONITOR_RUN_KEY` kept exported (13
      files import it by name: 11 tests, 2 e2e specs).** Spec:
      `docs/superpowers/specs/2026-09-12-stored-run-module-design.md` (revision
      2 — the anchor pass blocked revision 1 and James ruled the re-scope).
      `monitorRun.ts` (1719 lines / 339 code) and `handoffStore.ts` (1016 /
      418) both own one localStorage key and neither may import the other, so
      the constraint is restated as a comment three times. The costs are
      countable: `saveMonitorRun` (`:600`) has ZERO production callers and 127
      fixture call sites across 5 files, every one of which seeds past the real
      producer (RF24), while duplicating `performDurableWrite`'s
      series-sacrifice ordering verbatim; `connectGuardStage(hasUnretired:
      boolean)` (`:1704`) takes a boolean its callers compute purely because
      the import is circular; and `retire(set, reason)`
      (`handoffStore.ts:861`) makes 12 of 13 call sites wrap an entry they
      already hold in a one-element array.
      **MOVE, NOT MERGE.** Revision 1 proposed concatenating the two files;
      the anchor pass costed the alternative revision 1 had named and never
      priced, and it reaches the same export target with less blast radius
      (RF30). `handoffStore.ts` absorbs the persistence half — the key, the
      three validators, `loadMonitorRun`, `clearMonitorRun`,
      `connectGuardStage` — and `monitorRun.ts` keeps the type and the pure
      builders with no storage call left in it. The cycle goes because the
      dependency runs one way, not because anything was merged.
      **This PR owns the hand-off store's legacy-reads residual** (below,
      under Codebase-audit owners): James ruled 2026-09-12 that
      `anyLiveSession` and `monitorRunState` are deleted and the anti-pattern
      documentation re-homed. `todayGuard.pin.test.ts` is rewritten in the
      same PR — its negative import pin would otherwise pass forever once the
      symbol is gone (RF21), and this PR breaks its two byte-exact import
      pins regardless by moving `loadMonitorRun`.
      Exit: ≤ 28 value exports (from 35), the pre-existing
      `scripts/handoffStoreBoundary.test.ts` EXTENDED rather than replaced,
      and a byte-compatibility gate whose fixtures are captured by driving the
      writer — including a thrown write, the only shape that can catch a
      renamed `seriesDropped`.
- [ ] **PR 2 — a lifecycle seam on `useMonitorSession`, and publish `axes`.**
      **Carries three one-line riders from Exploration A (2026-09-12):** (1)
      drop the dead `export` on `ROWING_ACTIVE_FALLBACK_FRAMES` (zero
      importers); (2) `resumeEdgeArmedRef`'s doc claims to mirror
      `framesWhileHiddenRef`'s lifetime — five clear sites versus two — correct
      the comment; (3) `framesEverEmittedRef`'s doc says "cleared at teardown"
      and no clear site exists — its lifetime is the MOUNT. Plus the RF19
      finding that `lifecycleUnsubRef`/`lifecycleAttemptRef` emit no ring entry
      on any path, which the seam PR owns. Spec drafted and antagonist-passed
      2026-09-12 (rev 2, in the controller's scratchpad until the PR opens);
      the PM re-runs the one-risk-model grouping test at its gate now that the
      riders are in.
      *Two candidates grouped into one PR at the PM gate (2026-09-12): both
      change this hook's published interface, both are test-facing, and a
      reviewer holds one risk model rather than two.*
      **(a) The lifecycle seam.** `MonitorSessionDeps` (`:1112`) carries nine
      injectable deps and no lifecycle; `registerAppLifecycleListener` is a
      static import (`:104`, called `:5315`/`:5620`). So the one input this
      repo has already been burned by (RF19 — a platform-sourced input no
      instrument could see) is reachable in tests only through `vi.doMock` +
      `vi.resetModules()` + dynamic import: **29 occurrences across 7 files
      under `src/monitor/`, or 32 across 9 repo-wide** — the extra two are
      `justrow/JustRow.test.tsx` (a component test that cannot inject a hook
      dep) and `adapters/appLifecycle.test.ts` (the adapter's own test), and
      neither is deleted by this change. Meanwhile `replay.ts` already carries
      `lifecycle` events and an `onLifecycle` hook and cannot reach the hook at
      all. Add one optional dep defaulting to the adapter; three adapters then
      sit at the seam.
      **(b) Publish `axes`.** Five production sites repeat the identical
      five-field literal to build `AxesInput` (`connectedAxes.ts:103`) out of
      the session (`JustRowObserver.tsx:39`, `JustRow.tsx:145` and `:152`,
      `ConnectedSurface.tsx:603`, `ConnectedInterstitial.tsx:919`), and
      "AXES, NEVER `session.phase`" is enforced by a comment
      (`JustRow.tsx:138-141`) because nothing structural does. Derive once
      inside the hook, publish `MonitorSession.axes`, stop exporting
      `ConnectedPhase`.
      **`AxesInput.failureLeavesLinkUp` is dead and its deletion carries PR 1's
      question, which this row originally failed to ask (PM gate).** It is
      hardcoded `null` at all five production sites while 5 test assertions
      pass it non-null, AND `connectedAxes.ts:116-135` is the only written home
      of the NOT_A_MACHINE_REFUSAL ruling — *"a transport-side failure reads
      `lost`, a genuine `ProgramRejection` the PM5 itself sent reads `up`"* —
      whose own comment says *"whoever FIRST passes a real value inherits"* it.
      Same shape as `anyLiveSession`: deleting is probably right, asking where
      the ruling lives afterwards is mandatory. **Put it to James before
      implementation, the way PR 1 did.**
- [ ] **PR 3 — one `Sample` shape (TRIAD: stored shape).** Five hand-written
      declarations of one wire-and-storage shape with no compiler link between
      producer and any consumer: `seriesRecorder.ts`,
      `domain/monitor/derivedHeartRate.ts`, `server/stores/logs.ts:128`,
      `server/routes/data.ts:810-880`, and an inline re-declaration at
      `server/concept2/mapping.ts:64`. This is where RF33 bit — the rest flag
      was spelled `rest`, structural typing accepted the real `Sample` with the
      key absent, and the exclusion was dead on every production path while
      every test passed. **The landed fix was a comment**
      (`derivedHeartRate.ts:50-58`); `r?: true` is still optional in both, so
      the identical rename would reproduce it. *Not a live defect — both sides
      spell it `r` today and the average is correct. The defect is that
      nothing stops the next rename.*
      **This is TRIAD and the first draft said it was not.** `Sample` sits
      inside `SeriesData` inside `MonitorRun.series`, which is
      `JSON.stringify`'d whole to `MONITOR_RUN_KEY`, and also reaches Postgres
      via `stores/logs.ts`. Making `r` required with `null` meaning absent —
      CLAUDE.md's own prescription — writes `"r":null` on every WORK sample:
      **+9 bytes each, +127 KiB and +19.1% at `SERIES_SAMPLE_CAP` = 14400**, on
      the record whose size already forced the series-sacrifice mechanism, and
      whose own comment says the absent idiom exists so *"a work sample costs
      zero extra bytes."* **The zero-byte reading is what RF33 actually
      prescribes:** required on the domain FUNCTION'S INPUT INTERFACE, not on
      the persisted shape. The spec must also engage
      `stores/logs.ts:120-127`, which states the server mirror is DELIBERATE —
      *"a server-side MIRROR ... not a shared import"* — rather than treating
      it as drift.
      **Orders against PR 1:** whichever runs second inherits or invalidates
      the other's byte-compatibility fixture.
      One new test builds its input by driving `createSeriesRecorder` and never
      names a field. *The `MAX_GAP_DECISECONDS` boundary pin this row
      originally promised ALREADY SHIPPED in #345 —
      `derivedHeartRate.replay.test.ts:113`, independent literals, 59 → 100 and
      60 → null. Half this row's test work is done.*
- [x] **Exploration A — the freeze/resume observer.** The hook holds 38
      `useRef`s; twelve are one concern (background, frame silence, freeze,
      resume). Six symbols are exported ONLY so the test can reach them —
      `defaultLivenessSchedule`, `recordLivenessSilence`,
      `recordLivenessRecovery`, `handleFrameRecovery`, `nextRowingStreak`,
      `ROWING_ACTIVE_FALLBACK_FRAMES`, each with `useMonitorSession.test.ts` as
      its sole non-self consumer. That is the textbook "pure functions
      extracted for testability while the bugs live in how they are CALLED",
      at the largest scale in the repo, and RF27 came out of this same file
      having moved only five fields into `LogicalSession`.
      **Decides ONE question: do the twelve refs move with the observer, or
      only the pure helpers?** If they move, a `createFreezeObserver({now,
      schedule})` is a real 3-in/4-out interface and complexity concentrates.
      If they stay behind, complexity MOVES and there is no PR.
      **Its output is worth having either way (PM gate):** a lifetime table
      over the twelve refs — mint site, clear sites, what survives teardown,
      relaunch and re-arm — is the artifact RF27 says a plan owes anyway, and
      RF19's blind-instrument defect lived in exactly these refs. Fund it on
      that basis, not on the PR that may follow.
      **Exploration A — answered 2026-09-12: NO PR.** The refs were re-counted
      (38 total, confirmed) and the concern re-drawn: it is **14**, not twelve,
      and they are three concerns with three different lifetimes — 7
      instrument-only refs that reach no published value, 5 predicate refs
      behind `frozen`/`frameSilence`, and 2 app-lifecycle unsubscribe handles
      that belong to PR 2. A `createFreezeObserver` serving all 14 call sites
      prices at **5 deps + 10 methods + 2 outputs = 17 members**, not the
      3-in/4-out the row assumed, because its busiest writer — the
      foreground-edge handler — also reads the liveness snapshot, increments
      `LogicalSession`'s own `resumes`/`latches`, calls `update()`, reads
      `stateRef`, and calls `transport.markSuspect()`; those five couplings
      become parameters. No call site disappears and no `vi.doMock`
      disappears (all target `adapters/appLifecycle` and are PR 2's to
      remove). Deletion test: **moves, not concentrates.** The artifact the
      row was funded for — the RF27 lifetime table over the refs — is
      delivered: `docs/superpowers/audits/2026-09-12-architecture-walk/exploration-a-freeze-observer.md`.
      Three one-line riders ride PR 2 (named in PR 2's row). Re-open only if PR 2 lands and the
      foreground handler, with lifecycle injected, still reads as a module
      wanting an owner.
- [ ] **Exploration B — one replay harness. Runs after PR 2, never before.**
      Eight session-level replay specs — the `src/monitor/*Replay*.test.ts`
      files that drive `renderHook`: `burstReplay`, `lifecycleReplay`,
      `summaryHoldReplay`, `handoffStoreReplay`, `justRowReplay`,
      `partialReplay`, `liveDropSeamReplay`, `structureWatchSessionReplay`
      (`oracleCorpusReplay` and the driver-level replay specs are NOT in this
      set) — each re-hand-roll the same ~45 lines of setup: gunzip +
      `parseRecording`, `createReplayTransport` + `withLiveness`, two
      `vi.doMock`s, `resetModules`, a dynamic import, a `renderHook` deps
      object. The driver level already has a shared harness
      (`src/test/statusSubscriptions.ts`); the session level has none. 36 test
      files reference `docs/monitor/sessions`.
      **One justification is WITHDRAWN.** This row first claimed that renaming
      a spec "silently" stops its fixture matching. The anchor pass produced
      the condition — copy the spec to a new filename so the
      `import.meta.url` surgery cannot match — and it fails LOUDLY, with the
      malformed path printed: `ENOENT ... burstReplayRenamed.test.tskeystone-pm5-recording-….jsonl.gz`,
      `Test Files 1 failed`. The path surgery is ugly and worth fixing; it is
      not a silent-failure hazard, and the row no longer claims it is.
      **Decides two things: how much of the ~45 lines is genuinely IDENTICAL
      across the eight rather than eight similar-looking setups with
      load-bearing differences, and how much value survives if PR 2 does not
      land** (most of it comes from the mocks disappearing, which is PR 2's
      doing). A shared harness built over differences that matter is a worse
      module than eight honest copies.

**Exit:** every PR that lands states which module got deeper and what its
interface now is, in one sentence, at the top of its body. Phase close reports:
the `vi.doMock` count under `app/src/monitor/` before and after; `saveMonitorRun`
gone with `scripts/handoffStoreBoundary.test.ts` extended and green; a grep
proving no second declaration of the series sample shape survives; and, for the
two explorations, either the PR or the written "no PR, because…". **No hardware
walk** — nothing here reaches the wire, the pace math, or any number a rower
reads, and a PR in this phase that finds itself changing one has left the
phase. **One caveat on that claim (PM gate):** it holds for PR 3 only if the
series shape stays optional on the wire; the 19.1% inflation above is a
tester-visible failure mode with no screen to show it on.

## Phase PS — career stats on the You tab

**Status: OPEN 2026-09-12 — spec approved by James the same day; the three
phase-open gates (antagonist anchor, PM slate, DBA spec pass) ran at
`93b91d66` and are applied in PR 0 (spec §15).** **TRIAD on PR 1** (a
number's meaning: every figure is a SUM over stored rows whose metres
already mean two things — fused before RC-5, work-only after, no marker).
**M.** · dies 2026-10-12 · a month from
opening; this phase was deferred once already ("after the strangers") and
its trigger — a tester with enough history for a trend to be honest — has
fired for James himself, so if PR 1 has not opened by then the phase is
being outvoted and that is his call to make, not a slide. Spec:
`docs/superpowers/specs/2026-09-12-career-stats-design.md`. Promoted from
the "After the strangers" list, whose PS line this section replaces (one
home per body of work); the 6J sketch and `docs/history/phase-ps.md` are
inputs, not the design.

**Goal:** a rower sees their career — a hero on You (LIFETIME and SEASON
metres over one work-time-by-type bar) that is itself the door to a stats
subpage with a date filter, totals in two columns (ALL ROWS and MACHINE),
rest, calories and average watts, metres per week, time by Erg Book type,
the season's cumulative curve with average metres per day and weekly
streaks, and the 2k/6k test trend. Every number equals the sum of what the
log already shows per row, computed
by ONE domain function (`app/domain/stats/`'s `rowContribution`) that the
log's own `buildHeroes` is refactored to call, so You and the log cannot
disagree. Nothing new is stored; nothing is imported from Concept2.

**What this phase deliberately does NOT do (James, 2026-09-12):** PBs,
the Million Metre Club, Concept2 import or catch-up metres, storing the
machine type (Wave E's "We never check WHICH Concept2 machine is
attached" row owns it), generated columns, an index or any migration — the
DBA measures and James rules; a stored-shape change is its own TRIAD row
outside PS, and the DBA's 2026-09-12 measurement found neither Wave E row
reachable from this route's shape (spec §4.3, §11). **The Concept2
integration is not production yet, so no number, label or empty state here
reads `verified`, `c2ResultId`, `c2UserId`, the link state or any Concept2
API; the MACHINE column keys on `source = 'pm5'` only, and Concept2
contributes only the season's calendar (May 1 to Apr 30, named by end year)
and vocabulary** — spec §7 invariant 12, gated by a key-set test on the
projection type and a case-insensitive text scan over the stats code
(§8.4). The RC-5 seam is accepted and named on the surface (`k ROWS PREDATE
WORK-ONLY TOTALS · NOT IN AVG WATTS`), never corrected.

- [ ] **PR 0 — the spec, this section, and the DBA agent**
      (`.claude/agents/dba.md` + `dba-techniques.md` + `dba-ledger.md`;
      proposes, never writes; every verdict carries measured numbers).
      Gates, all RUN at `93b91d66` and applied (spec §15): antagonist ANCHOR
      pass on the spec (product shape HELD; 11 evidence/gate defects fixed),
      PM phase-OPEN gate (PASS WITH CONDITIONS, 6, all applied), DBA first
      pass on the `GET /api/stats/rows` query shape and growth (PASS WITH
      ROWS, 1 row). Docs-only, plus the `CLAUDE.md` three-agents paragraph
      (ruling 8).
- [ ] **PR 1 (TRIAD) — `rowContribution` + the `buildHeroes` refactor
      (mapping `endedBy ?? null`, proved with `tsc -p tsconfig.app.json`),
      `logbookWatts`/`logbookCalPerHour` MOVED into `app/domain/logbook.ts`
      with `src/session/logbookDerived.ts` re-exporting (no behaviour
      change; existing tests are the gate) plus an ESLint
      `no-restricted-imports` rule forbidding `app/domain/**` → `src/**`
      with a deliberate-import mutation proving it goes red,
      `GET /api/stats/rows` (additive, every row of the user, UNORDERED,
      slim per-row projection computed row-side so `steps` never crosses the
      wire; `totalCalories` as a narrow jsonb-path scalar), the adapter with
      its own `TZ`-pinned test (a negative-offset zone asserted in effect, a
      23:30-UTC instant landing on the previous local day, getters→`getUTC*`
      as the mutation), the time-by-type computation and a stacked-bar
      primitive under `src/charts/` (the hero needs both — Gate 0 ruling
      11), the You HERO as its OWN component `src/you/stats/YouStatsHero.tsx`
      (Gate 0's H3: LIFETIME / SEASON figures over one AN · AT · O2 · TR ·
      NO TYPE bar with a whole-percent legend, 181 px portrait, ALL column,
      work metres; `You.tsx` passes it nothing) which IS the door — one
      focusable control named `Stats`, tapping anywhere opens `/you/stats`,
      and `.you-doors` gains NO STATS row (ruling 10) — `/you/stats` with the
      filter bar (ALL · SEASON · YEAR · MONTH · 30 DAYS · CUSTOM), the whole
      TOTALS group — METRES / TIME / SESSIONS in both columns, then REST
      METRES / CALORIES (Σ stored `totalCalories`, `n OF m ROWS CARRY IT ·
      MONITOR'S OWN COUNT`) / AVG WATTS (`logbookWatts` of the RANGE's
      Σseconds ÷ Σmetres over machine, work-pair and steps rows only —
      ruling 6 — never a mean of per-row watts; captioned `AT THE RANGE'S
      AVERAGE PACE · WORK-ONLY ROWS`) under MACHINE, with `n OF m CARRY THE
      MONITOR'S OWN TOTALS` full-width under the header row and the seam
      line in both numbers (`1 ROW PREDATES …` / `k ROWS PREDATE …`, ruling
      15) — the subpage's TIME BY TYPE group (free once the hero exists,
      ruling 11), and the empty states: 0 rows with the filter bar hidden,
      1 row, and the MACHINE column's `NO MONITOR ROWS YET` with its REST /
      CALORIES / AVG WATTS rows hidden when no `pm5` row is in range (ruling
      16).** No pagination BY DESIGN up to the measured trigger (any user >
      5,000 rows; spec invariant 15, the cursor row below owns it). **PR 1's
      DBA gate runs the spec-pass protocol against the SHIPPED query (spec
      §9):** 1M rows seeded with users at 1k / 10k / 100k from the
      2026-09-07 `02-gen.sql`, medians of 5 plus `EXPLAIN (ANALYZE,
      BUFFERS)`, the real payload through the e2e backdoor with and without
      gzip, plan literals bytes/row ≤ 240 and 10k-user p95 ≤ 150 ms, the
      seam fixture carrying ≥ 1 stored-tier row; scripts committed under
      `docs/superpowers/research/2026-09-12-stats-rows/`. Gates: **Gate 0
      APPROVED 2026-09-12** on the rendered canvas
      (https://claude.ai/code/artifact/c8ad61d9-853b-4262-9051-032f90e90cf2;
      sources `docs/design/career-stats/`, every ratio computed in
      `contrast.json` — text ≥ 4.5:1 throughout and ≥ 6.69:1 bar the one NO
      TYPE caption, every data mark ≥ 5.29:1; eight rulings recorded as spec
      §14 9-16 and applied before the plan); `/harden` on the plan; the DBA
      gate above; the contract test `rowContribution ≡ buildHeroes` over
      every stored-log fixture plus a NEW work-pair-and-steps fixture the
      gate-order mutation can move, against output captured from `main`
      before the refactor; one test seeding through `POST /api/logs` (the
      tier-A row FUSED on purpose) and reading the new route (RF24); e2e
      seeding the Gate 0 seed itself (`seed.mjs`: 13 rows + 6 test rows,
      clock and zone pinned to 2026-09-12) and asserting `compute.mjs`'s
      figures as literals — lifetime 56,752 m / 3:59:39 / 13, season 43,012
      m, MACHINE 36,752 m, 8 OF 10, rest 718, cal 1,731, 176 W, `1 ROW
      PREDATES` (RF7); PM final gate.
- [ ] **PR 2 — the remaining charts, all designed and approved at Gate 0
      (ruling 11): METRES PER WEEK (eight Monday-start bars ending at the
      range's last day, this week in `--ink`, the rest in `--ink-4` — Gate 0
      ruling 12 over the handoff's `#c9c3b2`, 1.73:1, recorded in
      `docs/design/DEVIATIONS.md`), the SEASON group (the cumulative curve
      May 1 → today, `AVG M/DAY` on C2's Honor Board definition, current +
      longest streak of Monday-start weeks labelled ERGOMATIC because
      Concept2 has no streak — never filtered), TEST TREND (2k and 6k split
      seconds over date from the existing `GET /api/test-history`, faster
      is up — the ONE figure that keeps a point whose log row was deleted,
      because `test_history.session_log_id` is `ON DELETE SET NULL` on
      purpose; its caption says so), and the hover/tooltip layer.** Gates:
      antagonist DELTA pass on the streak/avg-per-day/metres-per-week
      definitions only (watts and time by type ship in PR 1); DBA SKIP said
      aloud unless a query changes; no per-PR PM gate (non-triad UI); no
      second design gate unless the rendered thing changes.

**Rows this phase files (dated; the hand-back list at PR 2):**

- [ ] **Concept2 season/lifetime totals: work-only or work+rest? Live check
      on log-dev.** A 2021 non-staff forum post (SECONDARY-UNCONFIRMED; the
      forum sits behind a Cloudflare challenge) says the logbook's headline
      counts rest while a row's `distance` is work-only (PRIMARY). James
      ruled work-only for us regardless, and spec invariant 12 means the
      answer can never change a number here — it only decides whether the
      caption says `CONCEPT2 COUNTS REST, WE DO NOT`. What would fix it now:
      running the check — not done because log-dev needs James's client
      credentials, which rotate his live link. **S** · dies 2026-10-12 ·
      needs James's credentials and a rowed upload, neither of which a desk
      session can supply.
- [ ] **`GET /api/stats/rows` grows a cursor or a server roll-up when any
      user passes 5,000 rows.** Measured 2026-09-12 (DBA, spec §4.3):
      224.8 B/row, 2.1 MiB and 78 ms at 10k rows; 5,000 is the 1 MiB line,
      19 years away at 5/week. What would fix it now: a cursor — not done
      because the household's busiest user has 16 rows. **S** · dies
      2027-09-12 · the check is a count (`select user_id, count(*) from
      session_logs group by 1 having count(*) > 5000`), not a build.
- [ ] **The history LIST has no `steps` tier** (`LogRow.tsx:110-123`, its
      own comment: a trusted tier-B2 row "still disagrees"), so such a row's
      list metres differ from its detail hero and from LIFETIME. What would
      fix it now: project Σ `actualMeters` server-side into
      `LOG_LIST_COLUMNS` — not done because it is a list-surface change
      outside PS's risk model (spec §12). **S** · dies 2026-10-12 ·
      pre-existing, self-documented in the code, and PS names the detail
      hero as its authority.

The two Wave E rows this phase was expected to open (the history index, the
generated columns) do NOT open from this route: the DBA measured on
2026-09-12 that a full-history read ignores the composite and a covering
index cannot carry `steps`; both got a `dies` date on the way past and James
rules keep/kill at the PR 0 hand-back.

**Inherited, stated and not discharged:** the RC ruling that the first
surface showing any `summaryDetail` field owes a photograph against the
PM5's screen (`docs/history/phase-rc.md:1072`) — PS shows a SUM, which no
PM5 screen shows, so the obligation stays with Phase LP's per-session
surface and its parity-photograph row under Wave E. RC-16's doubled
`avgStrokeRate` warning is irrelevant here (not displayed).

**Ruled by James, 2026-09-12 (spec §14), applied in the spec:** MACHINE is
BY DOOR — every `source = 'pm5'` row, link-lost ones included, with `n OF m
CARRY THE MONITOR'S OWN TOTALS` under the column; rest is the stored RC-1
pair (`machineSummary.totalRestMeters` stays provenance, unread); the
avg-m/day divisor counts today (May 1 → 1); the test trend SHOWS points
whose log was deleted; CALORIES & WATTS are rows of TOTALS, not a group;
AVG WATTS EXCLUDES stored-tier rows (metres, time and sessions still count
them, and the seam line says so); the phase's ONLY external oracle is James
comparing LIFETIME and THIS SEASON against his own Concept2 logbook page,
once, by eye, on the TestFlight build (exit criterion below, RF11);
`CLAUDE.md` names three standing agents, the `dba` described beside the
other two, and a PR that adds or removes one updates that paragraph in the
same commit. **And at Gate 0 (spec §14 9-16):** the You hero is H3 TIME BY
TYPE and replaces the two-line headline; the hero IS the door and there is
no STATS row; every subpage chart is designed now and ships in PR 2 except
what the hero needs; previous-week bars are `--ink-4`, not the handoff's
`#c9c3b2`; the stack order is AN · AT · O2 · TR · NO TYPE (the palette
validator); landscape You scrolls; `1 ROW PREDATES …` is the singular and
the `n OF m` line is full-width under the header row; zero monitor rows hide
the MACHINE-only rows and zero rows hide the filter bar.

**Exit:** at PR 1, a rower with ≥ 1 row sees real totals on You and
`/you/stats` that equal the log's DETAIL heroes summed (the contract test
and the e2e literal both green, mutations named), at 0 rows the honest empty
state, and with no `pm5` row the MACHINE column's; the chart groups render
at ≥ 2 points and read `TWO ROWS MAKE A CHART` below — TIME BY TYPE at PR
1, the rest at PR 2, each verified at the PR that ships it; the e2e figures
for the Gate 0 seed are `compute.mjs`'s, clock pinned; the hero is one
control named `Stats` and `.you-doors` has no STATS row; the DBA verdict
with the §9 protocol's numbers at
1k / 10k / 100k attached to PR 1 and a pagination ruling against the
5,000-row trigger; `grep -rin "verified\|c2ResultId\|c2UserId\|concept2"
app/domain/stats app/src/you/stats app/src/api/useStatsRows.ts` empty,
pasted; **James's eyeball check** — LIFETIME and THIS SEASON on You beside
his Concept2 logbook page, both pairs of numbers and the gap's explanation
(rest metres, rows never sent, fused rows) in the phase's close record.
**No hardware walk** — nothing here reaches the wire.

## Wave A — The front door

**Status:** Next in the slate; Wave F closed 2026-09-04. Not opened by that
closeout. **TRIAD twice — auth AND stored shape** (the second half found
2026-09-10; see the sign-up row). **L.**
· dies 2026-10-10 (set 2026-09-10 under the wave-heading rule above) · a month
after being named next; if the front door has not opened by then the north star
has gone unfunded for a month, and that comes back to James rather than sliding
another wave.

**PR 1 LANDED — PR #409, 2026-09-12: migration 0030 drops NOT NULL from
`users.google_sub`; the store's insert type derives from the table with the
sub key REQUIRED (`null` = no Google identity); a sub-less user is created,
given a session and resolved by id in a real-Postgres test; NOT a rollback
floor (RELEASING.md). James ordered it ahead of Phase MD PR 2 at #408's
hand-back.** Was: **PR 1 IS KNOWN AND IS INDEPENDENT OF THE POLICY DECISION.** `users` has one
identity column and it is NOT NULL, so lifting identity — `google_sub`
nullable, or its own table — is the same migration whichever door the gate
picks. **It is schedulable now, before the policy question is answered**, and
doing it first means the policy PR is a policy PR rather than a policy PR
carrying a migration.
· dies 2026-09-26 (set 2026-09-12, James, at the Phase MD open gate) · the PM
gate measured this row sitting still for 8 days and 111 commits while the
reflex explanation — "the new phase is displacing it" — was false: Wave A is
blocked on a policy question, and THIS PR is not. Two weeks is enough to fit it
around Phase MD PR 1 and still land a fortnight inside the wave's own
2026-10-10, so it can never become the reason the wave slipped. **A wave's
unblocked half gets its own date; that is what this row exists to prove.**

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

- [x] **DONE — Audit AUD-014, native sign-out always attempts the Keychain
      wipe.** Delivered in two halves, and the row's own framing was half
      wrong. **Ordering, #353:** `clearToken()` now runs FIRST and
      unconditionally; the server call and the Google logout follow, swallowed
      and logged. **Visibility, this PR:** a failed wipe now says so on You,
      in the sign-in screen's own `.notice` voice. **The row's premise that a
      rejection "leaves the bearer available for later reuse" while the app
      proceeds was never reachable** — `onSignedOut` has always run AFTER the
      await, so a failure left the app SIGNED IN rather than showing a
      signed-out screen over a live token. What was actually missing was that
      nothing was said. Gate 0 approved by James 2026-09-07 from a rendered
      mockup. Corrected here rather than ticked silently, because the wrong
      premise is what made the row read as more dangerous than it was.

- [x] **DONE 2026-09-10 — what external TestFlight binds is now sourced, and
      the wave does NOT shrink.** Research:
      [2026-09-10-external-testflight-binding.md](docs/superpowers/research/2026-09-10-external-testflight-binding.md),
      every quote first-party and fetched that day. **Beta App Review reviews
      the first build of each version against the WHOLE guidelines document**
      — App Store Connect Help, verbatim: _"the build gets sent to App Review
      to make sure it follows the App Review Guidelines"_, and guideline 2.2
      says a TestFlight build _"should comply with the App Review
      Guidelines"_. No beta-specific subset exists on any page found.
      **5.1.1(v) CONFIRMED unconditionally** — _"If your app supports account
      creation, you must also offer account deletion within the app"_: no
      date, no channel qualifier, no exemption. **4.8 binds too, but the
      inherited reason was wrong and the wrong reason hid an option** — it is
      titled **Login Services**, names no Apple product, and triggers on our
      use of **Google Sign-In** (named verbatim in its own trigger list); what
      it demands is any login service with three named privacy properties.
      All five of its exemptions were checked one at a time. The consequences
      are folded into the two rows below rather than left here. **What is
      NOT sourced, and stays unsourced:** how strictly Beta App Review
      enforces any individual guideline in practice — the text binds, the
      folklore that beta review is lighter has no Apple page behind it and is
      not planned on in either direction.
- [ ] **An open sign-up policy, replacing deny-by-default.** What replaces the
      allowlist is the design question: open, invite-code, or a waitlist. The
      denied-user surface stops being a dead end either way. **AUTH — full
      antagonist pass on the spec plus a PM final-PR gate.** **M**
      **THE GATE'S OPTION LIST GAINED A MEMBER on 2026-09-10, from the
      binding research above:** guideline 4.8's FIRST exemption is _"Your app
      exclusively uses your company's own account setup and sign-in
      systems"_, so **an Ergomatic with no Google door is outside 4.8
      entirely** and owes no Apple sign-in. It is a real option and it
      belongs on the list; it is not a recommendation, because it trades one
      build for a password/reset/verification surface we do not have and
      takes away the one-tap door every current tester uses.
      **That trade is UNPRICED, and the SPEC is where it gets priced —
      ruled 2026-09-10, not a separate errand before the spec.** Pricing one
      option in isolation produces a list where one member has a number and
      the rest have adjectives; the option list is costed as a list, in one
      pass, so the comparison is real (RF30: a ruled-out option gets a
      measured reason, not a clause). What the pricing must cover: password
      storage, a reset flow with real email delivery, verification, and the
      migration of every existing tester off a Google identity.
      And note the exemption's word is _exclusively_: adding our own accounts
      BESIDE Google discharges nothing.
      **AND THE ROW IS TRIAD TWICE OVER, not once — found 2026-09-10 while
      writing the guidance above, and it binds BOTH options rather than only
      the exempt one.** `server/db/schema.ts`'s `users` table keys identity on
      `googleSub: text("google_sub").notNull().unique()` — **NOT NULL**, and
      it is the only identity column there is. So a rower who signs in with
      Apple has nothing to be stored as, and a rower with an own-accounts
      login has nothing either. Every version of this wave's front door needs
      `google_sub` nullable or identity lifted into its own table, which makes
      this **a STORED-SHAPE change and a migration on top of the auth change**
      the row already declared. The row read as auth-only; it is not, and the
      spec sizes the migration before the gate rather than discovering it in
      the build. **The migration landed in PR 1 (#409).** The identity-table
      option is a SUPERSET of it — a backfill, a `UNIQUE (provider, subject)`,
      two rewritten store methods, a dual-read window and a later removal
      migration (`docs/superpowers/audits/2026-09-12-wave-a-pr1-census.md`
      §4b) — and is priced here with the rest of the option list. **And the
      spec decides what IDENTIFIES a sub-less user** (PM gate on #409):
      `users.email` carries no unique constraint and the allowlist is keyed on
      email while the only identity lookup is by sub, so duplicate emails —
      unreachable while `google_sub` was NOT NULL — become reachable the
      moment the first sub-less user is written.
- [ ] **In-app account deletion.** No DELETE-user route and no UI exist
      anywhere (checked across `app/server` and `app/src`: baselines reset and
      logs delete, but nothing removes a user). The spec enumerates exactly
      what is removed and what survives — note `session_logs.workout_id` is
      `onDelete: "set null"` while eight other FKs cascade. **M**
      **FOUR CONSTRAINTS the row did not have, quoted 2026-09-10 from Apple's
      own account-deletion page** (see the research doc): (1) _"only offering
      to temporarily deactivate or disable an account is insufficient"_ —
      this is the sentence the `set null` decision has to be argued against,
      and it is what makes the enumeration load-bearing rather than
      descriptive; (2) _"Offer to delete the entire account record, along
      with associated personal data"_ — the record goes, not only the PII;
      (3) _"Apps not operating in highly regulated industries should not
      require people to make a phone call, send an email, or go through other
      support flows"_ — no email-us door, and we are not regulated; (4) _"Make
      the account deletion option easy to find in your app. Typically, it's
      included in the app's account settings"_ — findability is a design-gate
      input, on You, not merely a route that exists.
      **AND ONE OPEN QUESTION, three clauses above the one we had quoted:**
      5.1.1(v) opens _"If your app doesn't include significant account-based
      features, let people use it without a login."_ **Ergomatic requires a
      login for everything and nobody has argued this sentence.** The answer
      is probably that the plan, log, baselines and Concept2 link qualify as
      significant — and "probably" is what RF16 says to stop writing. The
      spec answers it in one paragraph with the feature list beside it.
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
gets an empty working account, rows a row (the "rows a row" clause is closed
by Phase RW, opened 2026-09-06: a no-baseline account can Start any workout;
this wave verifies it once, on the stranger's account, not twice), and
deletes the account and all of its data from inside the app.

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
      **OPEN QUESTION (Phase OD, 2026-09-09): this row's own receipt is STALE,
      and the receipt is the only thing saying the order is undone.** The row
      claims `grep -ri simulator` "returns only the fake transport's own
      prose"; re-run 2026-09-09 it returns 15 hits across
      `domain/monitor/pm5/ergMachine.ts`, `intervalIndex.ts`,
      `transports/capacitorBle.ts`, `adapters/nfcReader.ts`, `fake.ts` and six
      test files (`grep -ric simulator app`).
      The ORDER is still undone. **The receipt, with its output NAMED rather
      than summarised:** `grep -rn simulator app/scripts` returns nothing — no
      harness, no script. `grep -rn simulator .github` returns exactly ONE hit,
      `.github/workflows/ci.yml:73`, and **it does not count**: it is prose
      inside a `dist:grep` comment about `fake.ts`'s simulator, not a job. So no
      simulator instrument exists. The first draft of this row claimed the
      combined grep "returns nothing" and was wrong on the day it was written —
      which is the rule, not an anecdote: **a "grep finds nothing" sentence
      pastes its actual output and names every hit that does not count.**
      **Trigger note:** bound to Wave D, which follows Wave A, which is
      unopened — so its subject is two waves out and on no calendar.
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
- [ ] **Two more order-dependent flakes, both seen during Phase JC's release
      (2026-09-08/09), both filed here rather than shrugged at.** Neither
      reproduced alone or on a re-run of the same command, so both are
      ORDER-dependent rather than broken tests, and both were observed by
      different agents in different worktrees.
      (a) `e2e/connected.spec.ts`'s genuine-`QuotaExceededError` leg failed
      once in a full run (550/551), passed alone, then passed 551/551 twice.
      The test fills origin storage to a real quota error, which is exactly
      the shape that makes a suite order-sensitive — a neighbour that writes
      to the same origin afterwards would see a full store.
      (b) `src/news/Releases.test.tsx`'s "renders each release's version,
      date, and every item" failed once in a full `--project client --project
      unit` run and passed both alone (6/6) and on an immediate full re-run
      (286 files, 7937). Client-project only, so unrelated to (a)'s origin
      storage.
      (c) A third, on the SAME release run: `pnpm e2e` returned `553 passed`
      with exit 1, and the two immediately following full runs both returned
      `554 passed`. **Which test failed was not captured** — the tail showed
      only the progress line — so this one is logged as an occurrence rather
      than a suspect, deliberately: guessing the test from a progress line is
      how a flake hunt chases the wrong file.
      **Trigger:** the flake hunt below, or a further sighting of any of the
      three. **S**
- [ ] **Hunt the e2e flakes.** James, 2026-08-20: _"post release lets hunt down
      the flake."_ Its trigger ("immediately after v0.15.0 ships") fired
      2026-08-20. **STRUCK 2026-09-09 — the manual-door tap-target flake
      (399/401, then 401/401 twice) is DONE**, fixed in `1602248e` (#150) two
      days after this order was given; the finding is below and the strike is
      applied HERE rather than left to a NEXT, because a row that carries its
      own correction twenty lines below its claim is the contradiction, not
      the record of one. **ONE named flake remains unresolved:**
      `design.spec.ts`'s `stableBoundingBox` flake (`e2e/helpers.ts:89`). #152
      landed evidence capture for a _third_ flake and produced
      `docs/superpowers/research/2026-08-22-e2e-readiness-gate-flake.md`.
      **The `stableBoundingBox` flake was sighted again on 2026-09-08**
      (Phase MT, filed as its own row at first and folded in here — a new
      datapoint, not a new flake): `design.spec.ts:3541`, "picking a effort
      level does not shift the chips below it", failed once in a 547-test
      parallel run, then passed in isolation immediately after AND on a full
      re-run of the same tree. It compares a chip's `y` before and after a
      click through that same helper, so the suspicion is LOAD rather than
      the assertion. CI retries once, so it costs a red PR check at worst.
      **M**
      **TRIGGER ALREADY FIRED — 2026-08-20, and 20 days have passed.** The row
      says so itself. This is the order that falsified "passive triggers are
      the problem": it had an ACTIVE trigger, the trigger FIRED, and nothing
      happened, because the question underneath it had no owner.
      **ANSWERED 2026-09-09 — it is THREE live producers, not four, and one of
      the four was already fixed.** The shared-producer read that this row's own
      NEXT called for has run; findings, each with the evidence that settled it:
      - **The manual-door tap-target flake is DONE, and has been since
        2026-08-22.** Both halves landed in `1602248e` ("The warm-up leaves
        (Phase WU)", #150): the `h1.summary-title` waits in `design.spec.ts` and
        the atomic `$$eval` in `assertTapTargets`. Measured 114/120 early gates
        before, 0/120 after — the figures come from
        `docs/superpowers/research/2026-08-22-e2e-readiness-gate-flake.md`,
        NOT from `git log -S`, which this row used to cite for them and which
        does not produce a rate. **It was fixed two days after this
        order was given and this row has claimed it open for the eighteen days
        since** — which is the row's own lesson about itself.
      - **Phase JC's `connected.spec.ts` origin-poisoning row is the SAME TEST
        as Wave D's (a)** — both are the S3 genuine-`QuotaExceededError` leg and
        its `fillOriginStorage` halving fill. Merge them; nobody would hunt them
        as two. **And its stated mechanism is FALSE:**
        `grep -rn "storageState\|launchPersistentContext\|userDataDir" e2e/
        playwright.config.ts` returns NOTHING, so every test gets a fresh
        context and origin partition and browser storage cannot survive into a
        later run. Whatever fails a warm-stack sign-in, it is not this test's
        leftover `localStorage`. Same RF16 shape as SR-13's falsified premise.
      - **`stableBoundingBox` stands alone.** It polls the real box and throws
        after 20 rAF, so it has no proxy-signal defect; what fails is its settle
        budget against genuine layout work. Load is an amplifier, not a
        producer — the research doc's §4 measured the same unchanged build at
        73% then 95%, moving the metric the WRONG way.
      - **The integration/container-contention class stands alone.** Different
        runner, different pool: `vitest.config.ts`'s `maxWorkers` sits on the
        ROOT `test` block, so unit and client files share one pool with the
        integration files that each start their own `PostgreSqlContainer`.
      **A candidate for SR-13, tagged INFERENCE and NOT acted on:**
      `LogSession.tsx` reads `workoutIsGlobal` from React state, and that file's
      own comment describes the reported symptom — while the library is still
      loading at save time it "honestly reads 'not the designated test' and the
      save navigates exactly as before", i.e. straight to Today. A network
      response resolving in Playwright is not the instant a fetch callback's
      `setState` commits. **What this does NOT explain is SR-13's `down -v`
      correlation** — a colder stack should make a race worse, not better — so
      either that correlation is an n=2 artifact or there is a second mechanism.
      Do not fix on this until the correlation is explained.
      **NEXT (≤0.25): fold Phase JC's row into Wave D's (a).** The manual-door
      strike is DONE (applied at the head of this row, 2026-09-09). After the
      fold this row is two producers, not four, and `stableBoundingBox` is the
      only one with no diagnosis.
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
submission rather than Beta App Review: store metadata and the legal surface
(privacy policy at a real URL, support URL, the App Privacy questionnaire, age
rating, store screenshots at the required sizes).
**THE CHECK THIS PARAGRAPH WAS WAITING ON HAS RUN (2026-09-10,
[the binding research](docs/superpowers/research/2026-09-10-external-testflight-binding.md)),
and it NARROWED the ground this deferral stands on rather than confirming
it.** Guideline 2.2 makes the WHOLE guidelines document apply to a TestFlight
build, so "beta review is a smaller rulebook" is not available as a reason.
What survives is narrower and is about METADATA rather than guidelines: Apple's
own pages say beta review reads _"the build and its accompanying metadata"_,
and the metadata they name is TestFlight's (_"your beta app description and
beta app review information are required in order to share your beta with
external testers"_), never App Store listing metadata. **That is a claim about
which FIELDS exist, and it was not researched field by field** — in particular
nothing here says whether 5.1.1(i)'s privacy-policy requirement reaches a beta
build. **Whoever opens Wave C runs that check; this is a narrowed premise, not
a settled one.**
· dies 2026-11-10 · filed rather than fixed now because the answer only binds
before Wave C ships, and Wave C is two waves out; if it has not opened by then
the quotes need re-reading anyway, so the check and its freshness expire
together. **PWA installability is deferred on a product ground, not
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

- **The PM5 does not advertise while a Just Row is open**, so a generic scan
  cannot discover it mid-row. The spec's "already mid-Just-Row at connect"
  path remains struck. Deferred Correct Resume research considers a retained
  same-device route after a proven drop, not a scan. That capability is not
  shipped or scheduled; today the rower can End and log what the app has.
  · dies 2026-11-10 (approved by James 2026-09-10) · unless Wave E's connect work needs it, this is a comment in `capacitorBle.ts` and not a row
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
  · dies 2026-10-10 (approved by James 2026-09-10) · a rower can hit this today; if Wave E has not taken it in a month it needs its own phase, not a row
- **Smaller wire reconciliations owed** (lifted from Phase JR, 2026-09-10). `domain/monitor/pm5/uuids.ts` says 0x003F "has
  never been recorded" and one now has been; status frames arrive at 1.00/s, not
  the ~2.2/s the tooling assumes; and the observer heading renders
  `PM5 432331249 Row connected` because the advertised BLE name already ends in
  "Row".
  · dies 2026-10-10 (approved by James 2026-09-10) · three doc corrections that ride any PR touching the wire notes; if none does in a month they are stale rather than owed
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
      `intervals` array is out of scope and rides the auto-upload follow-on
      — **HANDED OVER 2026-09-06 to Phase LP PR 2** (`docs/superpowers/specs/2026-09-06-logbook-parity-design.md`
      §5), which sends `workout.intervals[]` (never `splits[]`) with calories, HR, stroke
      rate and per-interval rest, result-level calories/drag/HR, and
      targets; `buildC2Payload` stays Wave E's file, LP owns that edit.
- [x] **PR B — the link-outs leave the app.** MERGED #298. The read-only Concept2
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
- [x] **PR C — send the number the verification code was minted over.** MERGED #307.
      SETTLED 2026-09-05 by a live API test: posting the PM5's own code with
      distance 5706 (the monitor's 0x0039 total, already stored as
      `machine_work_meters`) verified; 5708 (our interval sum, `work_meters`,
      what we send today) did not. The app already DISPLAYS the machine total;
      only the send is the outlier. Fix: `buildC2Payload` posts
      `machineWorkMeters`/`machineWorkSeconds` when present, falling back to our
      totals. **TRIAD (a number's meaning on the wire)** — full antagonist on
      the spec, PM gate on the PR. Spec:
      `docs/superpowers/specs/2026-09-05-concept2-verification.md`; the C1
      research is `docs/superpowers/research/2026-09-05-c2-verification-code.md`
      and the live result is `…/2026-09-05-c2-verification-measurement.md`.
      **OWED after merge (one clean confirming send, to close the
      log-dev-vs-production edge):** either a fresh 5708 API POST — which needs
      the real log-dev row 85921 deleted first, a destructive step James rules
      on — or a production hardware send of a divergent interval row once the
      server ships. Not required to settle which number is authoritative (the
      5706/5707 API test did); required only to confirm production behaves as
      log-dev did.
- [ ] **Auto-send — OFF · MANUAL · AUTOMATIC.** A per-rower sending mode:
      OFF is the unlinked state, MANUAL is today's per-row Send, AUTOMATIC
      sends an eligible finished monitor row the moment it saves, silently —
      the Send button pressed for you, outcome on the row's block. One
      boolean on the link row (`auto_send`, default false: a fresh link lands
      in MANUAL), one `PATCH /api/concept2/link`, the control replaces the
      card's Unlink button (OFF arms the two-tap unlink). Client-side after
      the save (`useLogForm`'s 201 path), same route as the button. **TRIAD**
      (stored shape + a number leaving on a trigger nobody tapped): full
      antagonist on the spec, PM gate on the PR, and a **Gate 0** for the
      redrawn card. Rulings (James, 2026-09-05): off = unlinked; silent;
      default manual; no backlog send. Spec:
      `docs/superpowers/specs/2026-09-05-concept2-auto-send-design.md`.
      **Gate 0 APPROVED 2026-09-05** (amendment
      `docs/design/handoffs/2026-08-31-concept2-connect/amendment-2026-09-05-autosend.html`,
      one fix on sight: armed OFF spans the control). **BUILT on
      `wave-e-c2-autosend`, 2026-09-05** — spec rev 4 records the two
      implementation departures (§3.3: the fresh read is one direct
      `fetchLink()` after the 201, not a mounted hook; the in-flight claim is
      a wait-then-rerun chain, not a stored response). Ticks at merge.
      **PM final gate PASSED WITH CONDITIONS (2026-09-05), all folded on the
      branch:** main's `0024_pain_to_effort` landed first, so the migration
      is `0025_classy_red_ghost`. Two behaviours the rulings did not name,
      filed here rather than in the PR body (RF14): (i) **SEND FAILED is
      sticky past the fix** — it clears only on the next send that leaves
      the row at Concept2, so a rower who repairs their profile keeps the
      warning until they row again (self-heals on the next AUTOMATIC save;
      under MANUAL it waits for a tap); accepted, and the first thing the
      walk will meet. (ii) **SEND FAILED reaches a MANUAL rower too** —
      ruling 6 named AUTOMATIC, spec §3.4 widened it to any eligible
      failure (the condition is account-level); sound, but no Gate 0 frame
      drew MANUAL + SEND FAILED — owed at the next Concept2 design touch.
      **The flag-flip gate is ONE trip, now THREE verifications:** the
      AUTOMATIC save this PR owes on the phone, PR C's owed confirming send,
      and **Phase LP's parity photograph** (the logbook page beside our
      screen after our upload, plus the PM5's own View Detail screens — spec
      §4.2, now SEVEN items: PR 2 added a last-interval-rest piece and the
      `pace` target's unit as read-backs) ride one trip; walk them
      together, never as separate PR-body lines. **The flip itself HAS
      HAPPENED on James's own account (2026-09-07, PR 2.5 #336's premise):
      five rows reached concept2.com from the v0.41.0 and PR 2 builds, the
      server log showed the sends with no fallback line, and the v0.41.0
      row verified with its code typed in.** What LP's exit still waits on
      is the WALK — the parity photograph and the read-backs, on a runsheet
      with its own PM readiness PASS — not the flag. **For the runsheet's author (PM #332):** choose the
      parity piece to CARRY a final-interval rest, so one rowed piece
      settles both the photograph and the 158-of-300 trailing-rest
      read-back; and capture which fallback path fired from the server
      log on every send — that line is the only evidence a thinned row
      leaves. No runsheet is owed until the flip is schedulable; it then
      gets its own PM readiness PASS.
- [ ] **Verification code: hide it, say "verified".** James, 2026-09-05: like
      Concept2's own UI, the MACHINE CONFIRMED block should not show the raw
      16-digit code by default; once Concept2 has accepted the code for that
      row, show "verified"; a debug reveal shows the raw code when needed.
      **REVERSED 2026-09-07 (James), THEN MADE OPTIONAL the same day —
      the reversal below is history, and the sentences are in the past tense
      because none of them describes the code at HEAD.** PR #336 sent the
      code unconditionally; the first real rowed row came back
      `Verified: Yes` with nothing for the rower to do, and James ruled that
      a parity REGRESSION — Concept2's own app uploads the row and leaves
      verification to the rower, so removing that act was the opposite of
      parity, however well the mechanism worked. #337 removed the send and a
      test pinned the withholding. **Since #360 the send exists again behind
      `concept2_links.auto_verify`, DEFAULTED OFF**, and that pinning test is
      now the OFF arm of a two-armed pair — so "we do NOT send the code" is
      true only of a rower who has not turned it on, which is everyone until
      they do. The wire facts were never in question (research file: the code
      verifies at the monitor's distance, fails at a control, with and
      without the interval array); what moved twice was the product
      decision.
      **PARTLY DELIVERED by Phase AV PR 1 (#360).** What ships: a row Concept2 accepted as
      verified when we sent it now reads `VERIFIED ✓`, and the raw code is
      withdrawn once there is nothing left to type it into. What does NOT:
      the ask this row was written for — *"a verification the ROWER
      performed, never one we caused"* — is exactly what a receipt-time
      verdict cannot see. **The reconciliation (#365, 2026-09-08) is what
      can, and it shipped**, so the ask is now MET for any row still inside
      the declaration read's reach: it upgrades only, never downgrades, and
      it sees a hand-verification the next time the rower sends anything.
      **What is still not met, and closes this row only when it is:** a row
      that falls out of that one page of 50, or a rower who verifies by hand
      and never sends again, is never seen. The reversal narrative above is
      written as history for the same reason.
      **OPEN QUESTION (Phase OD, 2026-09-09): is this row still LIVE, or is it
      dischargeable with a residual?** PARTLY DELIVERED by #360 and #365. The
      row states its own unmet condition — "a row that falls out of that one
      page of 50, or a rower who verifies by hand and never sends again, is
      never seen" — but nobody has checked the 50-row reach against the code.
      A reader could reasonably grade it DISCHARGED-with-residual today, and a
      row that two readers grade differently is the shape that rots.
      **It also carries NO TRIGGER AT ALL** — it names its closing condition
      and nothing that fires it. That is rarer than a passive trigger and worse.
      **NEXT (≤0.25): read `server/concept2/` and say whether a row outside the
      50-row page is genuinely unreachable.** If it is, this row closes.
- [ ] **Auto-verification, as an option, DEFAULTED OFF (James, 2026-09-07).**
      Sending the monitor's code with the upload verifies the row at receipt;
      that shipped as #336, was reversed as #337 because it took the act away
      from the rower, and James then asked for it back as a SETTING the rower
      turns on. **Default off, always.** The mechanism is already measured
      (`docs/superpowers/research/2026-09-05-c2-verification-measurement.md`:
      the code verifies at the monitor's own distance, fails at a control,
      with and without `workout.intervals[]`), so what this owes is the
      setting, its storage, and a design gate on where it lives and how it
      reads. Worth more than it looks: a code is only typeable on a ranking
      distance, so for most pieces this is the ONLY route to a verified row.
      **PRIORITY: after Just Row parity** (James, 2026-09-07) — which merged
      as #351, so this is OPEN as of 2026-09-07. Spec:
      `docs/superpowers/specs/2026-09-07-optional-auto-verify-design.md`.
      Not its own phase: one setting, one assignment behind one predicate.
      **The flag lands on `concept2_links`, not `preferences`** — the link
      row already resets `autoSend` when a relink lands a different
      `c2_user_id`, and verifying rows on an account the rower did not choose
      is worse than sending them there, since a verified row cannot be
      un-verified through our upload path. TRIAD (stored shape): Gate 0,
      then a full antagonist pass, then a PM gate on the PR.
      **Gate 0 APPROVED 2026-09-07** (artifact
      `99e95a96-9d8b-4818-9362-e20727763689`, copy rev 3): control labelled
      `AUTO VERIFY` on the Concept2 card under SENDING MODE, ON = "Rows arrive
      verified.", OFF = "Concept2 leaves verifying to you."; the saved row
      carries a bare `VERIFIED ✓` on the MACHINE CONFIRMED title line and the
      CODE line is withdrawn when it appears. Both antagonist passes folded.
      **Ships as THREE PRs** (was two): PR 1 (setting + send + mark) MERGED
      #360; #363 carries the fallback work, the 409 exclusion and `codeSent`,
      which PR 1's spec withdrew; and the reconciliation James approved shipped
      as #365 (2026-09-08). **The GET that blocked it is PAID:**
      `docs/superpowers/research/2026-09-08-c2-results-list-verified.md` —
      the live results list carries `verified` on every row, measured against
      log-dev. Two things it cost to learn: the credentials in the repo-root
      `.env` are `LOGBOOK_CLIENT_ID_DEV`/`LOGBOOK_CLIENT_SECRET_DEV`, not the
      `C2_*` names `c2-crossconnect.ts` reads; and a token refresh with scope
      `results:read` is REJECTED, it needs `user:read,results:write`.
- [ ] **Why does Concept2 show no Verify button on a row carrying interval
      data?** **ANSWERED 2026-09-07 and CLOSED — it was never about interval
      data.** Concept2 offers the Verification Code field only when the row's
      OVERALL distance or time hits a ranking standard, matched exactly;
      measured over every listed figure, both boundaries and three negatives
      by driving a logged-in browser
      (`docs/superpowers/research/2026-09-07-c2-verification-field-rule.md`).
      The four rows that lacked it were 200 m and other non-standard figures,
      not victims of the interval array. The app now prints the code only on
      rows Concept2 will take it for.

- [x] **DONE (PR #345). The fake monitor sent a summary heart rate no capture we hold contains,
      and that is why AVG HR reading `—` went unnoticed for a month.**
      `transports/fake.ts` emitted `avgHeartRateBpm: 152`, `min 96`, `max 175`,
      `ending 168` in its 0x0039 end-of-workout summary. **Measured
      2026-09-07: of 20 capture files, 11 carry a 0x0039 summary and every
      heart-rate slot in all eleven is a 0/255 sentinel — but two pairs are
      duplicate encodings (9 recordings) and 7 of the 9 had no belt paired at
      all, so the real evidence is TWO belted recordings from ONE walk.**
      Narrow, and still enough: the fake asserted a number no capture we hold
      contains, and dozens of tests seeded the same fiction.
      So every gate we own says the tile fills, because every gate feeds it a
      number the hardware does not produce — RF3, and it hid a real defect.
      **Fix:** make the fake's 0x0039 heart-rate bytes sentinels like the
      hardware's, and let the suite show the dash. Rides the AVG HR change.
- [x] **DONE (PR #345). AVG HR is derived from the heart-rate trace.** The tile reads
      `—` on every row because the monitor leaves its summary heart-rate
      fields empty (row above). The trace we already record and store has the
      data — it decimates to roughly 1 Hz, not one sample per stroke.
      **Measured on four committed captures with the repo's own parser:** a
      work-only time-weighted mean and a whole-session one differ by at most
      0.5 bpm, while the monitor's own per-interval figure runs 3.5 to 15.2
      bpm higher weighted by interval duration, or 0 to 15 as a plain mean
      with one capture agreeing — the range depends on the aggregation, and
      an earlier version of this row stated it without one. What that field
      measures is not documented (`docs/monitor/pm5-interface-notes.md` §10's
      0x0038 table says only "Split/Interval Work Heartrate"), so the gap is
      recorded, not explained. Gate 0 APPROVED (option A); the same figure also rides the
      Concept2 upload as `heart_rate.average`, a field Concept2 documents as
      optional and defines no further. **Owed:** James's own belted row is
      the only evidence outside those two recordings, and it is not in the
      repo — capture one on the next walk so the corpus carries a belted
      0x0039 from a second day and build.

- [x] **DONE (2026-09-07, PR #348). v0.41.0's release note was FALSE and the
      next note owed a correction.** Fixed in the same round that corrected
      v0.42.0's own item 2: v0.41.0 item 1 now reads "what the monitor
      reports" and no longer lists average heart rate among the session
      figures — that tile read a dash on every row in that build, so the
      claim was false when shipped rather than merely outdated — and
      v0.42.0 item 6 says where the number comes from now.
      **Original row:** It reads "Rows rowed with the PM5 connected now show what
      the monitor measured: … average heart rate for the session". After
      #345 that figure is NOT what the monitor measured — the monitor sends
      nothing there, and the app works it out from the trace, working strokes
      only, which can read below the per-interval HR column on the same
      screen. Notes are shipped copy, not history, and nothing else re-reads
      them (PM gate #345). **Check:** at any change to where a number comes
      from, grep `releaseNotes.ts` for that tile's own label.
- [x] **DONE (#346). `WorkoutDetail.test.tsx` flaked on a MOCK REGISTRATION
      RACE, and my first diagnosis of it was wrong.** Kept because the wrong
      diagnosis is the lesson. The symptom: "still navigates when preferences
      errored" failed ~2 runs in 3 with `expected [ false ] to strictly equal
      []`, blocked three pushes here, and — found at #345's PM gate — failed
      main's `app` job at `3c319cc8`, which SKIPPED `deploy` and froze
      production a merge back. **I filed the mechanism as a shared
      module-scoped `skipWrites` spy reset while a previous test's write was
      still in flight. That is false**: the write is pushed synchronously
      inside the mock during the click, so it cannot outlive its own test.
      **The real one** (the no-baselines session, verified here by reading
      `a1967244^`): `mockHooksWithPreferencesError` called `mockHooks`, which
      registers a READY `usePreferences`, and then `vi.doMock`'d an ERRORED
      one for the same path. `@vitest/mocker`'s `queueMock` registers each
      inside an async RPC's `.then`, so two registrations for one path race
      and the last to resolve wins; when the ready arm won, the errored test
      got a live writer and recorded the write it asserts never happens. Fix:
      the preferences arm is a parameter, so the path is registered once, plus
      a census script that fails lint on the shape (one instance repo-wide).
      **The lesson: a mechanism I could not reproduce got written down as
      though I had.** I observed the failure rate and the provenance, both
      true, and then inferred a cause from reading two tests — RF16's shape,
      inside a row whose whole purpose was to carry evidence. Tag an
      unreproduced mechanism INFERENCE, or leave the row at the symptom.

- [x] **DONE and CONFIRMED on both platforms — "Sign out" left Google signed in.** `nativeSignOut`
      (`src/native/signin.ts`) posts to `/api/auth/signout` and clears our
      token, and has NEVER called the plugin's `logout` — verified over the
      whole history, not just the current file
      (`git log -S"SocialLogin.logout" -- app/src` is empty). The device's
      Google session therefore survives, the next `login()` finds it and
      returns silently, and the rower is back in as the same account with no
      chooser. Reported by James on the v0.42.0 TestFlight build, 2026-09-07.
      The chooser is how you NOTICE; the defect is a button that says Sign out
      and does not. NOT attributable to that build's plugin bump — the gap
      predates it entirely. TRIAD (auth). **The checkbox ticks only when James
      confirms on a device that sign-in no longer reuses silently** — the fix
      ends the session, but Google's flow shares Safari's cookies, so it may
      present a one-tap "Continue as X" rather than a full chooser (SUSPECTED,
      untested). **CONFIRMED by James 2026-09-07 on both:** native on the
      Kaito build ("works on mobile"), web after #356 deployed ("confirmed").
      That was this row's stated closing condition, so it is ticked. **The WEB
      half is a separate fix with the OPPOSITE shape** (2026-09-07, James:
      "Works on mobile not on web"): there is no session of ours to end in a
      browser, only Google's own cookie which is not ours to clear, so the
      correct mechanism is `prompt: "select_account"` on the authorization
      URL — the very option the native spec rejects, for reasons that do not
      transfer. **Also fixes the offline case found at its own code review** — the local token
      clear was gated on the server call, so Sign out did nothing at all with
      no connection. When merged it is
      NOT released on its own (James, 2026-09-07: rides his next batch).
      Spec: `docs/superpowers/specs/2026-09-07-signout-ends-google-design.md`. **S**

- [ ] **Two `v8 ignore`s that no longer earn themselves, same class.**
      (a) `nativeSignIn` — see below. (b) `server/auth/google.ts`'s
      `callbackClaims`, found at #356's antagonist pass: it sits under an
      ignore labelled "thin openid-client wrapper" while containing
      `c.email ?? ""` and `c.name ?? c.email ?? "Rower"` fallback chains that
      feed the allowlist and identity decision. Not thin by the standard #356
      itself just applied to the authorization parameters. Both are
      pre-existing debt, neither introduced by the PR that found them. **S**

- [ ] **`nativeSignIn` keeps a `v8 ignore` it no longer earns.** Found at
      #353's code review. That PR narrowed the file-wide ignore on the
      argument that it "stops being honest the moment it holds ordering logic
      that can be wrong" — and `nativeSignIn`, still fully ignored, has a
      `responseType` narrow, a null-token throw, a 403-with-body-parse branch
      and a generic failure throw: materially more branching than the
      four-line `nativeSignOut` that came out from under it. Pre-existing debt,
      but the exact shape #353's own reasoning argues against (RF29). **S**

- [ ] **SHIPPED v0.42.0 (902) — a monitor older than 2018 is silently unusable.**
      Concept2 appended `Erg Machine Type` to `0x0032` in spec V1.26
      (2018-11-02) and to `0x0038` in V1.27; our parsers demanded the longer
      form, so a pre-2018 monitor had every one of those frames rejected.
      `seen.as1` then never latched and `maybeEmitFrame` published NOTHING
      for the whole session — the rower sat on `READY`, unwarned, and the
      row was lost. Reported by a friend of James's, 2026-09-07, with a ring
      full of `0x0032: expected 17 bytes, got 16` and
      `rowingActive=unseen`. Spec:
      `docs/superpowers/specs/2026-09-07-short-status-frames-design.md`. All
      four plan tasks are complete and merged as #350 and released in v0.42.0 (build 902, 2026-09-07)
      (`as1-short-frame`); the checkbox stays open until the reporter confirms it fixed THEIR monitor — see the two open items below. **M**

- [ ] **MERGED #361 (2026-09-08), UNRELEASED — a monitor we cannot decode
      says nothing at all.** The connected screen now reads `NO READINGS`
      instead of `READY` when a characteristic's bytes fail to decode
      12 times across 5 seconds and no frame has ever been emitted this
      sitting, so the app stops promising a piece it cannot start. The
      checkbox stays open until it ships in a tag.
      Spec: `docs/superpowers/specs/2026-09-07-undecodable-monitor-design.md`.
      Gate 0 APPROVED 2026-09-07 (Option 1: the warning REPLACES the READY
      state rather than sitting above it — a banner over a screen still
      reading READY annotates the lie rather than correcting it). Trigger
      copies `armedWatch`'s two-threshold shape, NOT the liveness watchdog's,
      because our failure is bytes arriving and failing to decode rather than
      silence. Gated on no frame having EVER been emitted, so it is
      unreachable mid-row. **Tooling prerequisite, inside this work rather
      than a reorder:** `injectGarbledFrame` cannot exercise it — it is
      one-shot and targets 0x0031, the characteristic that WORKED in the
      reported incident. Needs a fake control holding a NAMED characteristic
      undecodable, shaped like `failSubscribe`. **M**

- [ ] **We never check WHICH Concept2 machine is attached, and record
      everything as a row.** IN FLIGHT as Phase MT (spec approved 2026-09-08,
      Option A + denylist) — see the phase section below. James, 2026-09-08.
      **The box stays OPEN until it ships in a tag**, the convention the row
      above states outright; an earlier revision ticked it at spec approval.
      The PM5 fits the RowErg, SkiErg and BikeErg, and `ergMachineType` — the
      field that says which — had NO consumer anywhere in `app/src` or
      `app/domain` until this phase gave it one. So a SkiErg connects, gets
      programmed, and its piece is stored as a row: every number internally
      consistent and quietly wrong about what was done.
      **The codebase already knows these differ, in exactly one corner:**
      `domain/concept2/verificationEligibility.ts` keeps a separate rankable
      list for the BikeErg and says outright that we ship no BikeErg and that
      guessing its behaviour from the RowErg's would be wrong. Two things
      make this harder than a lookup. `ergMachineType` is ABSENT on the
      pre-2018 firmware #350 just started supporting, so any check must
      handle not knowing; and the right response to a SkiErg is a product
      decision (refuse, warn, or support) rather than a warning to bolt on.
      NOT covered by #361, which fires on bytes that fail to parse — a
      SkiErg's parse perfectly, they just describe skiing. **M**

- [ ] **The frame-error flood evicts its own diagnosis.** The ring holds 500
      entries (`eventLog.ts:51`). A monitor we cannot decode produces a
      `frame-error` per arrival, roughly eight a second, so the buffer fills
      in about a minute and the connect-time entries are gone — including
      `notify-first <char> (<n>B)` (`driver.ts:2301`), which records the
      MEASURED wire length of every characteristic before the decode and is
      the single most useful line in the file for this bug class. Found
      2026-09-07: the reporting rower's export ran seq 5432-5931, exactly 500,
      already rolled over, so we cannot tell whether that monitor's `0x0033`
      parses — and a fresh export from them would be equally useless. Rate-limit
      or count a repeated identical `frame-error`, or reserve connect-time
      entries from eviction. **S**

- [ ] **We cannot read the monitor's firmware version, and it is the one
      fact every report of this class needs.** Documented at characteristic
      `0x0014` (20 bytes, READ) in the C2 Device Information service
      `0x0010` (BLE doc rev 1.30 attribute table). `Transport` has no read
      method at all, so this touches both real transports, the fake, replay
      and three decorators; a connect-time ring entry is the payoff. **Check
      while implementing:** `DEVICE_INFO_SERVICE_UUID` is built from handle
      `0x0000` while the document gives `0x0010`, and the constant's own
      comment concedes we never established whether it or the `PM5` name
      prefix matched at discovery. **M**

- [ ] **Our arm verification cannot see a dropped rest, or ANY interval past
      the first.** `expectedArmedStructure` predicts exactly three values —
      workout type, workout duration, duration type — and the duration pair
      mirrors INTERVAL 0 only. So a monitor can ack every frame, read back a
      structure we declare correct, and still run something else: rest is
      never checked on any interval, and intervals 1..N are never checked at
      all. Found 2026-09-07 chasing a report that Sea Fret ran as work, work,
      rest ON THE MONITOR'S OWN SCREEN rather than work, rest, work, rest.
      **The report is UNREPRODUCED and there is no defect to fix yet:** the
      compiled program carries `restSeconds: 60` on both intervals and the
      wire bytes carry `04 02 00 3c` twice, matching the CSAFE worked
      example byte for byte. What is certain is that no instrument we own
      would have caught it (recurring failure 19). **OPEN QUESTION:** whether
      the PM exposes any readback for PROGRAMMED rest — `0x0032`'s rest
      fields are live values, not configuration — which decides whether this
      is an extension of the existing check or a different mechanism. Needs
      the reporter's firmware version and a recorded session. **M**

- [x] **The Bluetooth scan sheet mixes "PM5" and "monitor" in one flow.**
      CLOSED in the Phase MT close-out PR, with the permission-screen row that
      is the same rule (RF32). `capacitorBle.ts`'s `DISPLAY_STRINGS` now read
      "Looking for your monitor" / "No monitor found. Wake the monitor, then
      tap Cancel and try again.", the wording James prescribed on 2026-09-07
      after PR #331 made the NFC surface say "monitor" wherever PM5 was not
      the device's own advertised name. **S**

- [ ] **A row thinned BY the fallback reads as a successful send, and no
      query can find it.** PM #332 C1 (2026-09-07): when Concept2 refuses
      the interval array with a 4xx, `routes/concept2.ts` re-posts without
      it, gets a 201, stores `c2_result_id` and returns 200 — the rower
      sees success, the row is un-resendable forever (no PATCH), and the
      only evidence is a `console.warn` on the server. RF25 pointed at the
      RECORD: the different action the caller could take is ONE stored
      boolean (`sent_without_intervals`) that makes the population
      countable and gives the row a place to say so. The fallback outlives
      the walk, so a future validation change at Concept2 would thin rows
      silently from then on. Decide after the walk reads which path fired;
      a stored shape, so its own PM gate. **S**

- [ ] **A Just Row's 5-minute auto-splits have no home.** Spec §8's owed
      row (PM #332 found it living only in the LP section's prose): the
      PM5 sends 0x0038 per auto-split on a free row
      (`walk-2026-08-31-justrow`, two frames) and the record stores
      `steps: []`, so LP renders a Just Row's tiles and no strip, and PR 2
      sends no `workout` array for it. Giving those splits a stored home
      (`splits[]` on the upload, a strip on the screen) is a later phase's
      spec: a stored shape plus wire meaning, TRIAD twice. **M**

- [x] **Rows auto-sent before Phase LP PR 2 keep their thin logbook entry
      forever, and nothing tells the rower.** RULED by James, 2026-09-07:
      "just leave em" — accept silently, no note on the row, no
      delete-and-resend, no count taken. PM #332's read (accept silently,
      close on a count) agreed on the outcome; James closed it without the
      count. The gap is completeness, not contradiction: no number on those
      rows disagrees with the app, and the app already shows everything the
      machine measured for them. Concept2 has no PATCH and a resend
      short-circuits (`routes/concept2.ts`), so those entries stay as
      sent. **S**

- [ ] **The history LIST has no `(user_id, logged_at desc, id desc)`
      index.** Found by the Phase LP DBA benchmark, 2026-09-07
      (`docs/superpowers/research/2026-09-07-machine-summary-jsonb-vs-columns.md`,
      "Two things I found on the way"): `schema.ts` carries only
      `session_logs_user_id_idx`, and at 25k rows per user the page of 50
      measured ~40 ms without the composite index and ~0.25 ms with it,
      identically for both storage shapes. Not a Phase LP change (no LP
      query touches it); rides the next PR that adds a Drizzle migration
      to `session_logs`. **S** · dies 2026-10-12 (dated on the way past by
      Phase PS PR 0, campsite rule) · Phase PS's `GET /api/stats/rows` does
      not open it either — the DBA measured 2026-09-12 that a full-history
      read IGNORES the composite (743 vs 726 ms at 100k; it pays only under
      `LIMIT`), so no PS query needs it; James rules keep/kill at the PR 0
      hand-back.

- [ ] **Generated columns for `machine_summary.totalCalories` /
      `avgWatts` when the You-stats phase wants a covering index.** The
      same benchmark's one real jsonb gap: Postgres `INCLUDE` takes
      columns, never expressions, so a covering index for a per-user
      monthly roll-up must carry the whole ~666-byte blob (346 MB vs
      48 MB at 1M rows; 12-month cohort roll-up 337 ms vs 53 ms). The
      escape hatch needs no backfill and no write-path change:
      `GENERATED ALWAYS AS ((machine_summary->>'totalCalories')::int)
      STORED`, then a btree/covering index on it. James (2026-09-07):
      lifetime and monthly calories and average watts are the two figures
      You will show. Opens WITH that phase, not before — at household
      scale the un-indexed SUM measures ~1 ms. **S** · dies 2026-10-12
      (dated on the way past by Phase PS PR 0, campsite rule; the trigger
      FIRED 2026-09-12 when PS opened) · the DBA measured 2026-09-12 that a
      covering index or generated column cannot help PS's per-row
      projection — it helps only a SERVER roll-up (`SUM ... GROUP BY`),
      which the PS design does not do, so the phase does not open this;
      James rules keep/kill at the PR 0 hand-back.

- [x] **A stored row's MACHINE SUMMARY REST column reads a dash.** CLOSED
      by Phase LP PR 2 (2026-09-07): `LogStep` gained `machineRestMeters`
      (and `machineRestSeconds`, which the logbook API's interval object
      REQUIRES as `rest_time`), so the stored strip's REST column fills
      from the step itself on rows saved after PR 2; older rows keep the
      dash. **S**

- [ ] **354 code comments cite `interface-notes.md §N` — a file that does
      not exist** (`docs/monitor/` holds `pm5-interface-notes.md`;
      `grep -rn "interface-notes.md" app/src app/domain | grep -v
      pm5-interface | wc -l` → 354 across 41 files, 2026-09-07). RF16's
      dangling-citation corollary, at scale; every one is the short name
      for the same file, so a mechanical `sed` fixes it, but 41 files is
      not a rider on an unrelated PR. Its own docs-class PR, or the next
      sweep that already touches `driver.ts` wholesale. **S**

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
     **That trigger has FIRED, and James RULED on 2026-09-12: both go.**
     Phase MD PR 1 deletes `anyLiveSession` and the private `monitorRunState`,
     re-homes the anti-pattern documentation, and rewrites
     `todayGuard.pin.test.ts` — whose negative import pin would otherwise pass
     forever once the symbol cannot exist (RF21), and whose two byte-exact
     import pins that PR breaks anyway by moving `loadMonitorRun`. The row
     stays here as the evidence; the work lands in that PR. **Landed in Phase
     MD PR 1 (#408, 2026-09-12); proposed for STRIKE at that PR's hand-back.**
  2. **The store's standing probe is row 11's tier-precedence COMPOUND
     mutation**, not the single-line reorder — that one is a genuine non-bite.
     Remove the `if (hydrated) return` re-entrancy guard together with forcing
     the population guard true: 6 files / 40 tests fail, including
     `useMonitorSession.test.ts`'s "S1 — the write-count witness"
     (`expected 2 to be 6`). Producer purity is a DIFFERENT invariant and is
     not a substitute for it. Evidence: PR #239's consolidated §10 mutation
     ledger.
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
  self-authored shapes (the seeded 300 carry no adjacent rests).
  **RULED 2026-09-09 (James): the card shows the SUM** — `1' w · 1' r · 2' r`
  renders `1' w · 3' r`, agreeing with the compiler's fold, with Timer's 240 s,
  and with what detail already says.
  **THE LITERAL READING OF THE FIX SHAPE IS BLOCKED BY FACT, not by cost, and
  the next reader needs this before re-deriving it.** "Point display at
  `compileProgram`" cannot work: `program.ts:412-422` REJECTS open-ended/test
  pieces that `stepDetail.ts` must render, and `program.ts:392-397` rejects a
  combined rest over `MAX_REST_SECONDS` (9:55) that display has no business
  refusing to draw. Display renders what a rower AUTHORED; the compiler answers
  what a PM5 can RUN, and it is entitled to say no. A SHARED HELPER holding one
  definition of the fold is the only reading that executes the order — and it
  kills the drift class the same way, which was the order's stated reason.
  **The fold has a THIRD consumer:** `news/content/bodies/notationExamples.ts`,
  the published article teaching the notation. **RULED 2026-09-09 (James): let
  its worked examples shift, and show the copy diff at the Gate 0** beside the
  card — the article should teach what the app actually does.
  **CORRECTION 2026-09-09 — this row used to end "the compiler already REJECTS
  leading rest, so only the consecutive case is live". That narrowing is
  FALSE**, and it is RF30's shape: a clause that closes a case nobody
  re-checked. A leading rest gets FIVE answers, not two. `validate.ts` has no
  positional rule for rests at all (the `r` case checks only that `minutes` is a
  whole second; the sole post-loop rules are "at most one reps marker" and
  "needs at least one work or test step"); `builderState.ts`'s `addRow` appends
  unconditionally and its `removeRow` can strip the first work row, leaving a
  rest in front (**there is no `reorder` in the builder — an earlier draft of
  this row said there was, inherited verbatim from `intervalBoundaries.ts`'s
  comment and never checked**); and `bulk.ts` parses a rest line wherever it
  appears — so
  `[r 2', w 1']` VALIDATES AND SAVES. `intervalBoundaries.ts:86-103` then
  SUPPORTS it deliberately on the phone timer, returning its seconds as
  `leadInSeconds` to seed the first boundary; a version that dropped them put
  every notch `leadIn/total` too far left, measured at 20.8% against 41.7% on
  `[5:00 rest, 4 × (4:00 + 1:00)]`, and that comment records a first draft which
  DENIED the shape was reachable until a review corrected it. `compileProgram`'s
  `intervals.length === 0` guard (grep `leading-rest` in
  `domain/monitor/program.ts`) rejects it, correctly and in words. `stepDetail.ts:58-62`
  SILENTLY DROPS it. **Display is the only one that is wrong.**
  **RULED 2026-09-09 (James): display RENDERS the leading rest, matching
  Timer.** He first ruled "reject at authoring" and REVERSED on the Timer
  evidence — rejecting would strand `leadInSeconds` as dead code (RF29) and make
  existing stored workouts un-re-saveable, to satisfy a constraint that binds
  only connected mode. (`validateWorkoutInput`'s three route callers in
  `server/routes/data.ts` are all WRITES — POST `/api/workouts`, PUT
  `/api/workouts/:id`, POST `/api/workouts/bulk` — and its only other non-test
  callers, in `scripts/library-moves.ts`, are writes too. No read path
  validates, so reads were never at risk; an edit-then-save of an existing leading-rest workout is
  what would have started failing.)
  **OPEN QUESTION: none left in the fix shape — it was the blocker and it is
  answered above.** What remains is a decision only James can give: **the
  displayed-number Gate 0**, before/after card plus the article copy diff.
  **NEXT (≤0.25):** build that Gate 0 artifact. Do NOT start the code first;
  the gate is the approval, not the presentation. Evidence:
  `docs/superpowers/audits/2026-08-28-codebase-integrity/findings.md`
  (§AUD-006, §V4).
- **The server's `EndedBy` mirror can be derived, not hand-copied.**
  `server/stores/logs.ts` already imports `../db/schema.js`, so
  `export type EndedBy = (typeof endedByEnum.enumValues)[number]` plus
  deriving `ENDED_BY_VALUES` from `endedByEnum.enumValues` would collapse
  three mirrors to one; the POST seam test is the current gate. Rides the
  next PR touching `server/stores/logs.ts`. Found same review.

## Tooling

- **A `scripts/dist-grep.sh` needle is a fourth retyping of a literal, tied to
  nothing mechanical.** Each needle restates a string that also lives in
  product source, its unit test, and sometimes an e2e helper. A rename that
  updates the other three and misses the `NEEDLES` array leaves that needle
  hunting a string that no longer exists — green forever, proving nothing,
  which is RF21's shape on the gate the production bundle depends on.
  **Measured at the Phase MT close-out seam review (2026-09-09): true of all
  ten needles**, each literal confirmed present in source with nothing binding
  it to the bash array. Filed under Tooling rather than the connected surface,
  because nothing about it is connected-surface work. **S**

- **`pnpm screenshots` rewrites captures no code change touched.** SIGHTED
  five times over three weeks, in FOUR filings — the 2026-08-18 sighting never
  got a row of its own; it rode inside the 2026-08-28 one. Those four rows were
  deleted and reconciled into this one on 2026-09-08 (Phase MT close-out, ruled
  DOC-only by James — the FIX CARRIES). The count moves with the corpus and
  with the day, so the history is the useful part, not any single figure — and
  the EARLIEST sighting is the one that says how long this has been visible:
  - **2026-08-18 — one file, and it was reverted rather than explained**:
    recorded as `today.png`'s "unexplained onboarding read-marker diff",
    reverted where it surfaced and never explained. It rode inside the
    2026-08-28 row below and was LOST when the rows were first merged into
    this one; the merge's own review put it back, because on a row whose
    entire stated value is the history, dropping the first entry while
    counting the rest is that row's own failure mode.
  - **2026-08-28 — 19 of 90 no longer reproduced**: `today*.png` (5), `log-*`
    (4), `post-workout-*` (3), `you*.png` (6), `releases.png`. **Run as a
    control on a second worktree whose branch touched none of those screens,
    the SAME 19 moved** — so the drift is environmental, not anything a PR
    did. Separately, `you.png` differed run-to-run against the same stack on
    the same day (differing md5) while `today.png`, `releases.png` and
    `log-history.png` held across those same two runs: staleness and
    nondeterminism are two problems, not one.
  - **2026-08-30 — 13 of 83 were not byte-stable** across two back-to-back
    runs at the same commit: `log-delete-confirm`, `log-detail`,
    `log-detail-legacy`, `log-monitor`, `log-monitor-landscape`,
    `post-workout-summary`, `post-workout-summary-landscape` and all six
    `you-*`. A further ~10 differed from the committed bytes only by the
    seeded DATE STAMP (`AUG 25` → `AUG 30`), which is stable per-day and
    re-churns on every calendar day.
  - **2026-09-07 (PR #341) — ~61 PNGs per run**, measured twice on an
    unchanged tree. **This is the filing that carries the CAUSE:** the two
    runs differed only in the CLOCK rendered into the frame
    (`SEP 7 · 00:15` → `12:49`, diff bounding box 37×11 px), and
    `log-detail-legacy.png` moved 181 bytes while carrying no machine block
    at all.
  - **2026-09-08 (Phase MT) — 64 of 201**, by `git checkout --
    docs/screenshots/` and a second run on the identical tree. That filing
    said **"Cause unknown". It was already false when written** — the
    2026-09-07 measurement above had named the clock a day earlier, and
    nothing but reconciling the four rows surfaced the contradiction. Its own
    observation (the churn spans concept2, justrow, diagnostics and log
    captures, "so it smells like seeded data or a date rather than
    antialiasing") is consistent with the clock.
  **ATTRIBUTED 2026-09-10, and the cause list this row carried was wrong in
  both directions.** Full measurement and evidence:
  [the churn spec](docs/superpowers/specs/2026-09-10-screenshot-churn-design.md).
  The headline: of 67 files differing from committed, only **36 actually
  churned** — the other 33 reproduced byte-for-byte across two runs and were
  simply STALE, so every prior filing (which counted the 67) over-reported by
  half. **Two of the four causes above cannot be live:** the focus-dependent
  hint's copy was DELETED on 2026-08-28 (`BaselineEditor.tsx:135-144`) and its
  file is byte-stable, and no `log-monitor*` capture is nondeterministic at
  all. **The two largest causes were never named here** — a generated identity
  carrying `Date.now()` (`helpers.ts:117`, spliced into every e2e user's email
  and rendered on screen), and a capture taken before the suggestion fetch
  settles, which lands `LOADING…` in the frame (RF7's own failure mode, hiding
  inside a churn count).
  **Why it matters:** committed captures are the PR's visual record (RF7) and
  a reviewer's only look at a screen. A `git status` full of noise buries the
  frames a change actually altered — PR #341 reverted 61 by hand twice, and
  Phase MT's PR worked around it by adding only the two frames its rule could
  touch and discarding the rest.
  **CLOSED AS A PROCESS RULE, NOT AN ENGINEERING PROBLEM — antagonist
  premise pass 2026-09-11, adopted by James 2026-09-12.** The goal this row
  chased, byte-stable captures, was never reachable and never needed:
  nothing automated reads `docs/screenshots/` (CI runs `--project=chromium`
  only), the floor is 7 changed pixels on a one-test run with every clock
  frozen and a fresh database, and **the rule was already James's** —
  `docs/TESTING.md`'s 2026-08-27 "maybe a scheduled reup", unimplemented for
  two weeks while two sessions engineered around it (RF18 on process). The
  rule now lives in TESTING.md §8, "Regenerate broadly; commit narrowly",
  mirrored in RF1: commit only the captures for screens your diff touched,
  `git checkout --` the rest, and one full-corpus recapture PR per release
  tag. **What shipped and stays:** #394's settle waits and pins (RF7 fixes in
  their own right) and its frozen fixture clocks (they keep a scoped
  recapture from going inconsistent across dates); the fresh-database boot
  and stable `RUN_ID` (`1d35a704`, +3.8s/run); and the one-word fix that was
  the whole "no filter" premise — `screenshots.sh` now forwards `"$@"`, so
  `pnpm screenshots -g "<test>"` scopes. **What was built and REVERTED:** a
  secret-gated `loggedAt` backdate route (ruling 2B) — freezing every log to
  one instant collapsed `ORDER BY logged_at DESC, id DESC` onto a random-UUID
  tiebreak and traded a two-glyph churn for whole-frame row reordering. A
  frozen key is a removed key.
  **Two traps for whoever measures this again, both real:** back-to-back
  runs MASK time-derived churn (the epoch prefix is stable inside an hour and
  the UI truncates the email), and one pair of runs is an anecdote — 43
  distinct files churned across three pairs and only 9 churned in all three.
  **The 2026-08-30 measurement is
  written out here rather than cited**, because that round's report lives
  under git-excluded `.superpowers/` and a citation into it is unreachable to
  anyone but the session that wrote it (RF16's corollary).
- **DONE — the library seed mints deterministic ids (rides the
  deterministic-seed-ids PR, spec
  `docs/superpowers/specs/2026-09-12-deterministic-seed-ids-design.md`).**
  Filed 2026-09-10 as "five captures render a fresh UUID"; the property
  turned out to be the point, not the symptom. A fresh database now seeds
  the same 302 `(title, id)` pairs as every other — UUIDv5 from the title
  under a fixed namespace, applied only on the seed's INSERT branch, so
  production's existing rows keep their ids and nothing migrates. Five
  gates, each with a biting mutation; the antagonist pass found the
  uniqueness gate was over the wrong array (302, not 300) and that a
  duplicate title now fails boot instead of dropping silently — both
  written into the spec. Five of the six `recovery-read-only-*` captures
  were recaptured once in that PR and stop churning; the sixth,
  `recovery-read-only-landscape.png`, never rendered the id in its 844×390
  frame and never churned in any of eight measured runs.
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
- **The checked-in NFC patch is part of the safety mechanism, not a
  convenience.** `app/patches/@capgo__capacitor-nfc@8.2.5.patch` supplies
  session identity on retained events, single-tag selection, native drain on
  stop, and the controller-published `cause` the reader-ending seam depends
  on; the released plugin has none of them. **Any NFC or Capacitor upgrade
  reapplies and re-reviews the patch and re-runs the 31 native tests before
  the dependency is accepted** (`docs/RELEASING.md` step 3 has the command).

## Needs a decision from James

**BOTH BULLETS THIS SECTION HELD WERE RULED 2026-09-09** in the Phase OD order
sweep, and were moved to `docs/history/register-evictions-2026-09-10.md` on
2026-09-10 — the 1 000 ms collision window and the `PM5` / `Timer` provenance
label, both RULED KEEP. **That is not the same as nothing being owed him.** The
Phase OD sweep found seven live decisions waiting on James, each findable by
NAME rather than by a line a merge would break — the hand-verified
concept2.com log-dev row, the belted 0x0039 capture owed on the next walk, the
Wave E / Phase LP flag-flip trip, the `DETAIL`-over-slug failure panel, and
three scheduled to be RE-ASKED at Wave A's close.

**It is FIVE now, and both reductions landed on 2026-09-10.** Phase PROTO's
sweep was one of the three re-asks and James removed that phase
(`docs/history/phase-proto.md`), leaving the plan calendar and the parametric
generator. And RC-38 was DISCHARGED the same day — he supplied the CSAFE PDF
within minutes of being asked, which is the fastest any row in this file has
ever closed. A reader who takes this section's near-emptiness as "he owes
nothing" will be wrong by five.

- **RC-38 — DISCHARGED 2026-09-10.** James supplied the document the same day
  it was asked for: `docs/monitor/PM5_CSAFECommunicationDefinition.pdf`,
  revision 0.27. `OBJ_WORKOUTTYPE_T` is transcribed verbatim at
  `app/domain/monitor/pm5/commands.ts`, and it CONFIRMS the reading we shipped
  on — `0` is `WORKOUTTYPE_JUSTROW_NOSPLITS`, `1` is
  `WORKOUTTYPE_JUSTROW_SPLITS`, `8` is `WORKOUTTYPE_VARIABLE_INTERVAL`. So
  `0x01` is a JustRow, specifically the splits variant, and the old comment's
  refusal to write `_SPLITS` without a quotable label was correct caution
  rather than a missing fact. It also explains the corroborating capture: `0`
  is not a separate idle CLASS but JustRow-without-splits, which is what a
  virgin menu sits at, so the flip to `1` at the first pull is the machine
  adopting its own 5-minute auto-splits. **The value we program the erg with
  was right, and is now sourced rather than inferred.**
  **The document settles more than this row** — it also carries
  `OBJ_ERGMACHINETYPE_T`, which Phase MT's denylist keys on. Not applied here;
  MT's own rows can quote it now that the PDF is in the repo.
- _(previously none open)_ — the `/api/today` row that sat here from Phase SF PR1
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

## The "say which number this is" design pass — TRIGGER FIRED 2026-09-04, STILL UNOPENED

**Phase OD, 2026-09-09: this heading said "(post-Wave F, unopened)" for five
days after Wave F closed on 2026-09-04.** The trigger fired; the heading kept
describing it as pending. Opened by James's 2026-08-31 ruling on the
axis-quantity question — take the surviving work-versus-rest mismatches
together, in ONE design pass with ONE Gate 0, rather than approving a third of
a screen at a time. **OPEN QUESTION: none — the ruling already says what shape
the pass takes.** What is missing is that nobody scheduled it. **And it is
ACCRETING while unopened:** two of its five members were ADDED on 2026-09-07
by PM gates (`PM5 · PER INTERVAL` over Concept2's arithmetic; AVG HR derived
from the trace), so the longer it stays shut the larger its Gate 0 gets.
**NEXT (≤0.25): none owed — this one needs a date, not an answer.**

- [ ] **Phase LP's strip eyebrow says `PM5 · PER INTERVAL` over two
      columns that are Concept2's arithmetic** (PM final gate #327,
      2026-09-07, non-blocking): WATTS and CAL/HOUR are the logbook's
      derivation (James's §3.1 ruling), differing from the PM5's own by
      ≤1 W and 24–78 cal/hr — the same record stores `avgCalPerHour: 931`
      and the tile renders 929. The arithmetic was ruled; the LABEL was
      not. A named row for this pass's Gate 0, which LP's own §3.4 admits
      it enlarged by six numbers.
      **THIRD MEMBER (PM final gate #345, 2026-09-07): AVG HR is derived
      too**, from the trace rather than the monitor, and it is the first of
      the three that visibly disagrees with the rows in the same frame — the
      HR column beneath it is the monitor's own per-interval reading, which
      measures 3.5-15.2 bpm higher. Not a merge blocker (a rower cannot act
      differently on 117 versus 125) but three of six tiles under a `PM5`
      eyebrow are now not the monitor's figure, and each arrived in its own
      PR. This pass should rule on the label with all three on the table.

**Opened by James's 2026-08-31 ruling** on the axis-quantity question: take the
three surviving work-versus-rest mismatches together, in ONE design pass with
ONE Gate 0, rather than approving a third of a screen at a time. **"Three" is
the count AT THAT RULING, not now — the section holds five members; two were
added on 2026-09-07 by PM gates, which is the accretion the heading records.**
All three of the original ones were sitting apart — one in Phase PROTO, two under "accepted, pinned" — which is how
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
- **[Phase OD 2026-09-09: this is James's own reported defect, 9 days old, and
  its disposition is the section heading above — it is a MEMBER of the pass,
  not separate work. It needs the pass opened, not an answer.]**
  **The rest bands are only as wide as the rower kept the flywheel moving
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
| **RC-8**                                   | Correct the fake's contradictions of the real wire. **3 of 5 corrected** in #182 T1 (`ergMachineType`, `intervalRestTimeSeconds`, `splitIntervalType`); the other two read as already conditional and want verification. Residual: `fake.ts`'s `toMachineIndex` is resting-conditional while `intervalIndex.ts`'s `toActualIndex` is unconditional. **Merged with LL's reconnect precondition — one piece of fake work, and specced apart it gets done twice** | `phase-rc.md`, `phase-ll.md`, `docs/testing/2026-09-04-unlogged-session-evidence.md` |
| **RC-13**                                  | **DONE — landed 2026-09-09 (the RC-13 PR).** This row's old opening — _"The avg-pace verdict zero-fires on a rapid re-arm"_ — is the framing the phase-open antagonist pass FALSIFIED, and it is REPLACED rather than annotated, because the row itself recorded two agents misreading it as already fixed in one session. **NEITHER DOOR HAS A SUPPORTED PRODUCER.** `driver.program(` and `driver.beginFreeRow(` have exactly one non-test caller apiece, both in `useMonitorSession.ts`: the hook's `beginFreeRow` returns on `phase === "ended"`, `JustRow.tsx` adds an independent `armedThisStart` latch, and `session.program()`'s one caller (`ConnectedInterstitial.tsx`) is gated on `phase === "pairing"`, which is written only inside `connect()`, which itself refuses when a driver already exists — so `program()` always runs against a freshly minted driver whose `activeRun` is `null`. **AND THE GUARD THAT HOLDS IT HAS A DATE:** the `ended` clause is `8c8fe05e`, **2026-09-01**, "JustRow PR 2 (#259)" — ONE DAY AFTER James gave this order (2026-08-31) — and its own comment says it was added because the e2e flow caught the product re-arming the instant a row ended. His order was correct when he gave it; a different phase shut the door the next day, incidentally. A guard added reactively last week is not an invariant that has held for a year, which is what justified the code. **WHAT REPLACED IT:** both doors now call `settleOutgoingRun` — the containing wrapper around `drainSummaryReconcile`, so settle rather than cancel, and a settlement that throws cannot fail the replacement — placed ABOVE `program()`'s per-run reset block, so the settlement runs before `lastWorkStateAverageSplit = null` and the verdict cannot be filed with a false suppression reason; a re-entrant open/replace is refused at the driver itself (`replacingRun`) rather than by the hook's phase guard; and every `summary-reconciled` detail names its RELEASE CAUSE instead of asserting a 3000 ms window closed (which was already untrue on the existing drain paths). **THE LIVE HALF WAS THE CONTAINMENT, NOT THE DRAIN** — see RC-14 | `phase-rc.md`                |
| **RC-13b**                                 | `drainSummaryReconcile` has no identity guard, unlike both scheduled callbacks (`armSummaryReconcile`'s and `noteTerminateObservations`'s each open `if (activeRun !== run) return;`). It reconciles whatever `activeRun` reads at the moment it runs, not the run whose deadline it is draining. RC-13 made its stated precondition TRUE by emptying the slot at every door, but the precondition is still ARGUED rather than structural. **Binding the run into the slot** — storing `{ run, cancel }` instead of a bare canceller — would make it structural, and is the fix if this is ever taken. **CLOSING CONDITION (written 2026-09-09, James's rule 2 applied retroactively):** struck at the first phase close where it is 30 days untouched, unless `drainSummaryReconcile` acquires a caller that can run against a different `activeRun` than the deadline was armed for. Until then the precondition is argued rather than structural, and the argument is recorded at the site | `phase-rc.md`                |
| **RC-13d**                                 | **OPEN INFERENCE, deliberately unsettled:** whether a door settlement's `summary-observations` write lands on the OUTGOING record. `applyProducerCommit` keys on `next.startedAt` and a revision ref rather than on `identityRef`, and the hook's handler writes to `runRef.current`, which the hook does not touch before `await driver.program(p)` — **so it probably would**, INFERENCE, not measured. Left open on purpose: the only ordering that exercises it has no producer (RC-13), so a hook-level test of it would prove the consequence of a condition nothing creates. **Whoever adds a UI path that re-programs from `ready` inherits this question** and must settle it before that path ships. **CLOSING CONDITION (written 2026-09-09, James's rule 2 applied retroactively):** struck at the first phase close where it is 30 days untouched, unless a UI path that re-programs from `ready` exists. The question is meaningless without one, and the row itself says so | `phase-rc.md`                |
| **RC-14**                                  | **DONE — fixed 2026-09-09 (the RC-14 PR).** The avg-pace verdict — one of the two genuinely independent oracles RC-9 built after RF11's mirror problem retired `recordTwdVerdict` — was reaching the in-memory ring and dying with the tab. No rower ever saw it and no saved row moved; the cost fell on whoever read a walk afterwards, and it cost more than one line, because the snapshot is taken at the most informative moment in the trace. **THIS ROW'S PREVIOUS ANSWER WAS WRONG AND IS REPLACED, NOT ANNOTATED** (the RC-13 row records two agents misreading an annotated row). It read *"the survivor set is three, not two, and the third is a throw inside a subscriber"* and prescribed a try/catch around `recordAvgPaceVerdict` plus a bracketing record. Nothing throws — RC-13's `emit` isolates per listener — so that instrument would have printed **nothing** while discharging James's order: RF21 with a paper trail. **THE MECHANISM, MEASURED (`c45d0d76`, two red tests, no production change).** `reconcileSummary`'s last act is `emit(summaryObservationsEvent(...))`; `emit` delivers synchronously on the caller's stack; the hook's `summary-observations` case ends with a synchronous `lingerFinishRef.current?.()`, which is the deferred teardown's `finish`. So `reconcileAndReleaseHandoff` -> `unsubscribeAndDisconnect` (which records `disconnect-requested`) -> `stash()` all run to completion INSIDE the driver's own stack, one statement before `recordAvgPaceVerdict(run)`. The stash had `disconnect-requested` last and no verdict; the ring had the verdict next. **THE WALK'S OWN TRIGGER, corrected in the same round:** `rests-finished-ring.json`'s seq 71 says the reconcile ran "when the 3000ms finish grace closed", and that string was HARDCODED on the walk build — RC-13 replaced it with a real release cause precisely because it was already untrue on the drain paths. The capture's `atMs` values settle it: seq 70 `verification-received` ...110, seq 71 ...111, seq 72 ...112, one millisecond apart. The walk drained inside the 0x003F notification (`maybeReconcileImmediately` -> `drainSummaryReconcile`), a third `recordAvgPaceVerdict` call site, now covered by its own test. **THE FIX:** `teardown`'s deferred `finish` keeps its second `stash()` and queues a THIRD via `queueMicrotask` — a third snapshot can only ADD, where moving the second one out would fall back to the linger-start bytes (less than today). Never a timer: a microtask checkpoint runs before control returns to the event loop, and pagehide/freeze/backgrounding are tasks. **THE INVARIANT IS BOUNDED, and the bound is the point:** every entry a session records SYNCHRONOUSLY BENEATH the teardown that serialises it, up to the moment that teardown takes its LAST snapshot, reaches that snapshot. "Beneath" means ON THE STACK WHEN THE SNAPSHOT IS TAKEN, not "anywhere later in the teardown's body" — the IMMEDIATE path stashes BEFORE `unsubscribeAndDisconnect()` and excludes its own disconnect entries by design, which that path's comment has always said. **THE FENCE IS THE HANG-UP, and it is not only about terminate observations:** entries a producer records after its own `await` reach no snapshot, because a microtask runs before a post-`await` continuation — and TWO producers past that line file ORACLE VERDICTS. `driver.disconnect()` reaches `drainSummaryReconcile` (which ends with `recordAvgPaceVerdict`) only AFTER `await terminateWritesDrained`, so a reconcile re-armed during the terminate wait files its verdict unseen; and the driver's 0x003A subscriber calls `recordRestDistanceVerdict` and stays live until `await t.disconnect()` resolves, after the third stash. **So "an absent verdict IS a finding" must never be restated absolutely.** The honest reading, and the one the walk procedure now carries: a verdict missing for a piece whose own summary frames are already IN the log is a finding; a verdict missing where the log shows `disconnect-deferred` or a `summary-half` at or after `disconnect-requested` is INCONCLUSIVE by design, as is an absent terminate-observations entry. Restating any of this unbounded is what put the last walk in the position of reading a silence as a result. **JAMES'S 2026-08-31 ORDER (*"do NOT hunt it; INSTRUMENT it"*) IS CLOSED ON A CHANGED BASIS, and this row says so rather than letting a fix retire it quietly.** His ruling priced a hunt of unknown length; one probe ended it. The DISCRIMINATOR half shipped — every `avg-pace-verdict` line now opens with `#N`, the driver's own verdict count, so `eventLog.record` can never fold two of them into one entry. **Both halves of that sentence are narrower than they sound, and the narrowing is the honest part.** The ordinal is PER CONNECTION: a driver and its log are minted together inside one successful GATT connect and every teardown hangs up, so a walk that leaves the connected screen between pieces gets one log and one `#1` per piece — walk 2026-08-25 is the shape, two pieces, two ring files, each starting at `seq 0`, one verdict apiece. W11's "N pieces ⇒ N lines" therefore stays a count ACROSS PASTES, not within one. And the fold it prevents has NO established production producer: two verdicts can only be consecutive in one ring if two runs share one driver, and the RC-13 row argues at length that neither door has a supported producer for that. The instrument is cheap, harmless, and removes a class rather than a sighting. The BRACKETING RECORD is DECLINED on merit: the survivor is named and removed, its mechanism is pinned by a test that goes red on exactly that mutation, the throw survivor records itself (RC-13's `listener-threw`), and all seven verdict branches record before returning, so "reached and silent" does not exist. **James can put the bracketing half back in one word.** **REGISTER:** this PR filed ZERO rows and struck THREE — RC-13a, RC-13c and RC-13e are now comments at `beginFreeRow()`, the `run-replaced` record call and the `HASH_SUBWINDOW_MS` declaration, each carrying its reasoning. RC-13b and RC-13d gained the 30-day closing conditions they were filed without. Four further findings went to comments rather than rows (the linger refs' lifetime, `cancel()`'s guard as the layer that holds it, the in-emit re-entrancy Shape A leaves live, and `e2e/diagnostics.spec.ts`'s immediate-path-only coverage). **THE SWEEP WAS NOT COMPLETE WHEN IT SAID IT WAS**, and the correction is recorded here rather than left to a commit body: the first pass claimed seven sites and missed two in SOURCE — `oracleCorpusReplay.test.ts`'s header (*"the silence RC-14 is open on … RC-14 stays open"*, in the file whose whole subject is this oracle) and `driver.ts`'s `emit` isolation comment (*"RC-14's row names a throw in here as one of three surviving explanations"*, pointing at a row that now says in bold that nothing threw). Both were found by a later review round and fixed. The lesson is the one CLAUDE.md already states and this branch still tripped over: a correction sweep goes through SOURCE as hard as it goes through docs, because a comment reads as rationale rather than as a claim                                                                                                                                                                                                                                                                                                | `phase-rc.md`                |
| **RC-38**                                  | **DISCHARGED 2026-09-10.** `OBJ_WORKOUTTYPE_T` transcribed verbatim from `docs/monitor/PM5_CSAFECommunicationDefinition.pdf` rev 0.27 into `domain/monitor/pm5/commands.ts`; it confirms `0x01` is `WORKOUTTYPE_JUSTROW_SPLITS`. Full account in `## Needs a decision from James` above                                                                                                                                                                                                                                                                                                                       | `phase-rc.md`                |
| **RC-11**                                  | The stroke-data reframe: three-way, not two. Owns RC-6's deferred `p: 0` half. Our series clock is a third quantity, and none of the three is C2's `time`                                                                                                                                                                                                                                                                                                      | `phase-rc.md`                |
| **Session calories** — CLOSED by Phase LP 2026-09-06 (0x003A Total Calories is the honest total; per-split sum equals it on 9/9 committed captures) | 0x0033's `totalCalories` is INTERVAL-scoped (it resets at every boundary) and the 0x0039 summary carries no calorie field, so an honest session CAL needs the register-fold discipline CR2 spec 1 built for distance, plus an honest ramping fake (today's emits a constant 0, so **nothing can go red**), plus a walk photo. **ZONE rides behind it** — it needs a strap and a max-HR source the app lacks. **Ownerless since 2026-08-15**                    | `phase-cr2.md`               |
| **Cross-pin the two distance derivations** | `sessionDistanceMeters` and `monitorDistanceMeters` are two derivations of one user-facing quantity, shipping on two screens with nothing comparing them                                                                                                                                                                                                                                                                                                       | `phase-cm.md`                |
| **The fake's rest-distance lag**           | `restDistanceMeters` resets with no roughly three-frame lag, unlike the real wire                                                                                                                                                                                                                                                                                                                                                                              | `phase-cm.md`                |
| **`MONITOR_SPM_MIN = 0`**                  | Re-parked at CR2's close, re-owned by LT spec 1                                                                                                                                                                                                                                                                                                                                                                                                                | `phase-cr2.md`               |
| **The landscape gutter**                   | The phone timer's landscape gutter absorbs no left inset                                                                                                                                                                                                                                                                                                                                                                                                       | `phase-cr2.md`               |
| **iOS 26 `100dvh`**                        | Under `viewport-fit=cover`. Wave D's native fake flag is what makes this answerable at a desk                                                                                                                                                                                                                                                                                                                                                                  | `phase-cr2.md`               |
| **`PULL TO RESUME`** — **ORDER STRUCK 2026-09-09** | James, 2026-08-17: _"we never got rid of the pull to resume screen."_ CR2 2a task 5 only re-worded it. **James WITHDREW the removal order on 2026-09-09**, asked directly when the Phase OD sweep surfaced it at 23 days old: the screen stays. This is the author of an order withdrawing it, **not** a strike on a stated cost — RF30 does not apply and no receipt is owed. Recorded here rather than deleted, because the unwithdrawn 2026-08-17 quote still stands in `docs/history/triggered-follow-ons.md:301` and would otherwise resurrect it. **Every other site carrying the order, reconciled (CLAUDE.md's withdraw-then-grep rule):** `docs/history/triggered-follow-ons.md:301` — ANNOTATED with a dated disposition, verbatim text preserved; `docs/superpowers/specs/2026-08-22-link-truth-design.md:193` (_"The standing follow-on to REMOVE the PULL TO RESUME band entirely ... stays where it is"_) — STANDS as written: it is a dated design record that defers to this ROADMAP entry by name, so its pointer resolves here and reads the strike. Phase JR's "Owed within PR 2's own scope" block is NOT this order — it is the separate, still-live gap that `PULL TO RESUME` is undesigned on a free row's frozen clock, and it stands. Everything else the grep returns describes the SCREEN, which stays. **RESIDUAL, NOT STRUCK — the flash:** §2b's suspected mechanism was FALSIFIED (zero PAUSED firings across six captures) and the flash's real mechanism is still unexplained; it pairs with the stale-while-armed observation, still owed from the CR2 phone pass. **OPEN QUESTION:** does the flash survive now that the removal is off the table, i.e. is it a defect in its own right rather than a symptom of the band? **NEXT (≤0.25):** read `ConnectedSurface.tsx:795` and its `model.stale` producer and say whether a flash is reachable without a PAUSED firing | `phase-cr2.md` |
| **Reconnect's three preconditions**        | Constraints on the deferred Correct Resume entry, not separate scheduled work. #183's gate requires a reconnect design to reset or quarantine `lastContinuityRef`'s count axis across a re-subscribe; preserving the old baseline without that policy is unresolved. | Correct Resume research, "Status: deferred, not an implementation contract" |
| **Two declined CR questions**              | Projected finish split; distance intervals with a rate cap. Each waits on a hardware fact. Reconnect belongs to the deferred Correct Resume entry, not this row; its research does not authorize backfill or a MISSED writer. | `phase-cr.md`                |
| **LL-F4**                                  | The `disconnected` handler records no liveness snapshot where `fail()` does, so a retry's ring has one fewer data point                                                                                                                                                                                                                                                                                                                                        | `phase-ll.md`                |
| **Connection-log text is unselectable**    | `user-select: none` inherits into the sheet (`index.css:85`, `:5799`); COPY LOG is the only route out                                                                                                                                                                                                                                                                                                                                                          | `phase-cs.md`                |
| **The bar's two axes**                     | The connected bar's fill and its notches are two axes on DISTANCE work; EST LEFT holds still 6.6 s and 20.8 s at handovers. **The obvious repair was replayed and does not work.** Accepted and documented. **TRIAD** when it is taken                                                                                                                                                                                                                         | `phase-cr2.md`               |
| **The `--failure` comment misstates why row one is 56px** | `index.css`'s `--failure` block says `Row on the phone timer instead` wrapping is what makes the first row taller. Measured at Phase MT's Gate 0 (2026-09-08): with that button gone the row is STILL 56px, because `.button-l1{min-height:56px}` and `.button-l2{min-height:52px}`. The comment names the wrong cause, so the next person tuning that stack tunes the wrong thing | Phase MT Gate 0, `docs/design/mt-followon-gate0/` |
| **Just Row's refusal stack never gets #370's pairing** | `JustRow.tsx`'s free-row refusal wears `.connected-interstitial-actions` WITHOUT the `--failure` modifier, so the landscape pairing rule #370 shipped does not reach it. Harmless TODAY at two buttons — it becomes a cut headline the moment that stack grows a third. Found at Phase MT's Gate 0, 2026-09-08 | Phase MT Gate 0 |

## Accepted, pinned, and not being fixed

- **ACCEPTED (Gate 0-A's own cost, door PR A, 2026-09-02): Today's last
  three rows carry no PARTIAL chip.** The chip lands in History and on the
  log detail; Today's compact rows have no slot for it without displacing
  the type badge. Gate 0-A weighed two options and took the cost. A THIRD
  option — the chip on the title line, or displacing the badge — is
  deferred to the Timer-mode design pass (the `## Timer mode, on the
  phone` row above), which is already redesigning that row.
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

- **Three failure frames now render a DETAIL panel that is a heading and a
  slug, with no other content (Phase MT close-out, 2026-09-08).** The approved
  de-duplication suppresses the panel's `detail` line wherever `detail` is
  already the headline or the body line. On the three reasons that carry no
  `raw`, that leaves the panel as the word `DETAIL` over the word
  `TRANSPORT-MISSING` (no producer supplies a `raw`), `DISCONNECTED` (the
  `LINK_LOST_NO_RUN_ERROR` construction), or `SCAN-DISMISSED` (its
  `device === undefined` arm). **This is the ruling working as James approved
  it, not a defect** — the alternative was printing the same sentence twice —
  and the slug is still real diagnostic content the connection log lacks in
  that position. Filed because it is a product observation James has not been
  walked through, NOT because no picture of it exists — one does, committed in
  the same PR: `docs/design/mt-closeout-gate0/transport-missing-landscape.png`
  shows the panel reading `DETAIL` over `TRANSPORT-MISSING` and nothing else,
  and `measure-transport-missing.json` carries
  `panelLines: ["TRANSPORT-MISSING"]`. **This row first said "no committed
  screenshot does", which was false when written** — a record claim that reads
  as evidence is worse than none (RF16). What is true: no capture under
  `docs/screenshots/` shows it, because that set has no `transport-missing`
  frame at all. Revisit only if a rower reports the panel reading as empty.
  **S**

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
  Disclosed and accepted as correct for now — **cited by SYMBOL, not by line,
  because the line drifted: this row said `program.ts:112`, which as of
  2026-09-09 is an unrelated doc comment.** The Table 19 limit constants live
  under the `Table 19 "PM5 Workout Configuration Parameter Limits"`
  doc-comment block in `domain/monitor/program.ts` (grep `Table 19` in that file).
- **Anonymous-run logging** — every storage layer accepts `workoutId: null`, no
  product path can create one, and `ANONYMOUS_RUN` is dead code by its own
  comment. **Phase JR is the door that would create them — and PR 2 (#259)
  DISCHARGES this: `/justrow/log` posts `workoutId: null` with
  `advancesPlan: false`, and Today's recovery row serves the id-less
  record.**
- **`surfaceModel.ts`'s `if (digits.startsWith("8")) return "AN";`** is the
  English article in "AN 800 M PIECE", not the workout type. A rename trap, not
  a task. **Cited by SYMBOL, not by line: this row said `:1573` and the code is
  at `app/src/workout/connected/surfaceModel.ts:1881` as of 2026-09-09.** Grep
  the predicate, not the number.
- **Concept2 wire hardening (PR1 final review, M3) — HALF THIS ACCEPTANCE IS
  NOW FALSE, corrected 2026-09-09 (Phase OD).** It said "the C2 wire calls
  carry no timeout". They do: `C2_TIMEOUT_MS = 10_000`
  (`server/concept2/client.ts:73`) guards all four outbound fetches via
  `AbortSignal.timeout` (`:115`, `:250`, `:339`, `:395`), added by #290 on
  2026-09-04 — AFTER this acceptance was written. **An acceptance that
  outlives the cost it accepted reads as a live risk that nobody is
  fixing, which is worse than no row.** STILL TRUE, and still accepted: the
  per-user token refresh holds a `FOR UPDATE` row lock plus a pooled
  connection across the outbound refresh call (`stores/concept2.ts`).
  Follow-up hardening; household-scale acceptable today.
  (`2026-08-31-concept2-logbook-design.md`)
- **Our NFC capability probe reports device support, never code signing**
  (Phase NF spec residual, confirmed at the phase-close gate 2026-09-06).
  `isSupported` resolves `NFCTagReaderSession.readingAvailable ||
  NFCNDEFReaderSession.readingAvailable` (the checked-in patch) — a hardware
  check. A build shipped without an effective
  `com.apple.developer.nfc.readersession.formats` entitlement therefore SHOWS
  Scan NFC and fails at every session begin, and no gate this repo owns can
  tell the two apart. Pinned rather than fixed because the honest probe is an
  archive-and-device gate, not a runtime one. The compensating control is one
  tap on Scan NFC after every TestFlight install that changed signing,
  entitlements, or the Xcode project.

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
- **The hardware session shopping list** — three pairing and programming latency
  spans, the unrowed question from §17 item 5, §18's readings-still-owed, a
  genuine mid-piece disconnect, and **one `.5` pace target on the wire**
  (`representableCentiseconds` has never been sent to a real PM5).
- **Backgrounding during the targeted BLE scan may arm the never-cleared
  cleanup poison** (Phase NF spec residual; whole-branch review SF3,
  2026-09-06). A `pause` aborts the scan; the abort's `stopLEScan()` and its
  10 s cleanup deadline both ride the process, which iOS may suspend; on
  resume the deadline and the plugin's reply race, and a deadline win sets the
  poison (`Restart Ergomatic`). Harm ceiling is that copy on the next attempt;
  manual **Connect** on a fresh launch is unaffected. **Not walked** — no leg
  backgrounds during the BLE half. Candidate fix if it is ever seen: do not
  arm the cleanup deadline on a background-caused abort. (`phase-nf.md`)
- **The copy mapping for a Core NFC 202 that WINS the race is unexercised.**
  Walk leg 4 staged a side-button lock during a live reader and read 202 on
  the console, but the app's own `pause` abort settled the attempt first, so
  the late ending was ignored and `NFC scan stopped. Try again.` never
  rendered. The branch where the 202 arrives first has no hardware evidence;
  the next connected walk that locks the phone mid-read reads the console for
  which path fired. (`phase-nf.md`, `phase-nf-product-walk/RESULT.md`)
- **The not-advertising copy has never rendered on hardware.** Walk leg 2's
  premise was false (a PM5 keeps advertising after a phone-side END), so the
  leg could not be staged; #324 then replaced the copy with `Couldn't reach
  <name>.` / `Check nothing else is connected to it, then try again.` Desk
  proof only. **The one state a tester can reach is a PM5 held by another
  central** (the Concept2 app, a second household phone) — stage that, not
  "off Connect Device". (`phase-nf.md`)

## Small, queued, rides the next PR in its area

- **DONE — folded into Phase MD PR 1 (James's rider, 2026-09-12): one export
  in `src/isPlainRecord.ts`, four call sites re-pointed. Struck only when
  James rules at the hand-back.** `isPlainRecord` is declared four times,
  byte-identically. Exported from
  `monitor/monitorRun.ts:453` and re-declared private in
  `builder/builderDraft.ts:47`, `session/draft.ts:85` and `session/run.ts:75`;
  all four bodies are the same line —
  `typeof value === "object" && value !== null && !Array.isArray(value)`. Found
  by the 2026-09-12 architecture walk's PR 1 spec and deliberately left out of
  that PR as scope creep (RF34). **What fixed it:** James ruled on 2026-09-12
  that debt paid as a side effect of phase work is welcome, so the shared
  predicate landed in PR 1 after all — one export, four call sites re-pointed,
  a six-case test, a biting mutation. The reasoning this row used to carry
  ("four copies cannot disagree, so it does not earn its own branch") was true
  and is why it rode a PR rather than getting one.
  · dies 2026-10-13 (filed 2026-09-12, approved by James) · rides the next PR
  touching any of the four files; dated with Phase MD because PR 1 moves one of
  them and is the most likely vehicle

- **PR1.75b leftovers, lifted from Phase PROTO 2026-09-10.** (1) a unit test for
  the empty `?state=` callback (`params.get` answers `""`, which the adapter
  treats as a MISMATCH and refuses — fails safe, untested); (2)
  `app/ios/App/App.xcodeproj/project.pbxproj`'s four `E2A1B0…` entries sit out
  of ascending-id order and Xcode will re-sort them on its next save (cosmetic;
  expect that churn in the next iOS PR, not a CLI rewrite).
  · dies 2026-10-10 (approved by James 2026-09-10) · rides the next PR touching the auth callback or the Xcode project; the Xcode half self-resolves on the next iOS save
- **Shipped release-note strings say `PM5`. THIS ROW NO LONGER CARRIES A
  COUNT, on purpose — run the command:**
  `grep -v '^\s*//' app/src/news/content/releaseNotes.ts | grep -c "PM5"` for
  the strings, the same pipeline through `grep -o "PM5" | wc -l` for the
  occurrences (the `-v` drops the file's `//` provenance comments, which are
  not copy). **The count in this row has been WRONG THREE TIMES:** it said
  "nine" until 2026-09-09; it was corrected to 10/13 that day and was stale
  within 36 minutes when #382 landed; re-run on 2026-09-09 it returns 11/14.
  A release-notes file grows every tag, so any number written here is wrong by
  the next merge. That is the whole lesson — **a stored count is a claim with
  an expiry date; a stored command is not.** Phase MT's RF32 census
  (2026-09-08) left the strings on purpose: editing them rewrites what testers
  have already read, and the release-notes tests carry POSITIONAL pins that
  shift when the text moves. Sweep only if James wants the archive consistent;
  the rule itself is about what a rower reads NOW.

- [ ] **NOBODY HAS MEASURED THAT A HAND VERIFICATION ON concept2.com SETS THE
      LIST'S `verified` — and #365's headline rests on it.** Filed by the PM
      gate (2026-09-08, C3). The chain is: rower taps Verify on the website →
      their list row's `verified` flips → our declaration read sees it → we
      upgrade. **Hop 3 is measured** (2026-09-08 research: the field is on the
      list and varies). **Hop 2 is measured nowhere.** Every `true` on that
      account is a receipt-time verification WE caused by posting a code, and
      every test seeds `verified: true` into our own fake or straight into
      Postgres — so the producer, a human tapping Verify, is upstream of all
      of them. RF24's shape, with the producer outside the repo.
      **If hop 2 is wrong the feature does nothing, silently, forever**, and
      that is indistinguishable from "nobody has hand-verified anything yet".
      **The fix is a desk round trip, not a walk:** hand-verify one eligible
      log-dev row on the website, re-read `GET /api/users/me/results`, confirm
      that row's `verified` flipped, append it to
      `docs/superpowers/research/2026-09-08-c2-results-list-verified.md`.
      Needs James's browser; zero erg time. **Until it exists, the release
      note may not claim that rows you verify yourself pick up their tick** —
      it covers the setting and the mark only.
      **TRIGGER: before the release note claims that rows you verify yourself
      pick up their tick.** That sentence may not ship until this is
      measured. Owner: James — his browser, log-dev, no erg time, and
      explicitly NOT walk work (PM gate 2026-09-08: do not bundle it into a
      hardware runsheet where it waits on a calendar). **S**

- [ ] **Count the victims once AUTO VERIFY has been on for a few sends.** The
      PM gate's standing test is "when a degradation path returns success, ask
      what query would find its victims; if the answer is none, that is the
      finding." Here the answer is not none, because the phase STORED the
      verdict instead of logging it:
      `SELECT count(*) FROM session_logs WHERE c2_result_id IS NOT NULL AND
      verified IS NOT TRUE;`
      Run it ONCE after the first opted-in sends. If it is not zero, the date
      hypothesis is live — Concept2 checks `date`, we send the PHONE's clock,
      and the monitor's own stamp ran 1.29-3.23 minutes earlier across seven
      captures (spec M8/M9). Per the five-users ruling this is one query, not
      a measurement gate or a dashboard.
      **TRIGGER: after the first handful of sends with AUTO VERIFY actually
      on** — not before, because on zero opted-in sends the count is
      trivially zero and proves nothing. **XS**

- **The vitest 5 migration is owed, and it is why the app's dependency group
  went red** (2026-09-07, PR #349 split it out; Dependabot's #340 bundled the
  major with 17 routine patches). Vitest 5 changes the `Assertion` type
  `@testing-library/jest-dom` augments, so every `toHaveValue` and
  `toHaveAttribute` in the suite fails typecheck with TS2339 — 23 errors in
  `SplitInput.test.tsx` alone, and that file is one of many. `jest-dom@7.0.1`
  is the latest and declares `vitest: >= 0.32`, so the peer range does not
  warn; the break is in the augmentation, not the range. **What unblocks it:**
  a jest-dom release that targets vitest 5's Assertion shape, or our own
  `vitest.d.ts` re-declaring the matchers. Until then `.github/dependabot.yml`
  ignores the major for `vitest` and `@vitest/coverage-v8` so one upstream
  major cannot hold 17 patches hostage. Re-check jest-dom's releases at any
  test-infra touch. **S/M**
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
  **Consequence as filed (superseded — see the resolution below rather than
  reading this as current):** the verification code is ROADMAP's own "whole
  point of the phase", and at the time of filing it could not succeed for an
  interval row whose totals differ. Unknown and worth measuring: whether a single-interval or JustRow row
  verifies fine (the two numbers coincide there), which would explain why
  nothing caught it.
  **Owed before any fix:** decide which number is authoritative and say why —
  the monitor's own summary total, or our sum — then send that one, and gate it
  with a replay whose expected value comes from the CAPTURE's summary frame
  rather than from our own accumulator.
  **THE OWED HALF IS DONE (PR #307, 2026-09-05): the monitor's own total is
  authoritative and `buildC2Payload` posts `machineWorkMeters`/
  `machineWorkSeconds` when present.** So the headline above — "a
  verification code cannot validate" — no longer describes the code, and
  Phase AV (#360) now sends that code on request. **What survives is the
  question this row asked and nobody answered:** whether a SINGLE-INTERVAL
  row verifies fine, where our sum and the monitor's total coincide. The
  JustRow half of that question is closed by a different route — a free row
  cannot be uploaded at all (`eligibilityFailure` refuses `endedBy !==
  "finished"`), so it never reaches a verification. **S**

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
- **FILED (door PR A's PM gate, 2026-09-02): the `freeRow` 401 first-run
  flake.** On a cold stack (24 containers up) the first `freeRow` e2e
  sign-in has 401'd once and passed on retry. Not reproduced on a warm
  stack. Owed: one run with the backdoor sign-in instrumented, to say
  whether it is the auth seam or container start-up ordering. **S**

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
- **AUD-012 — correct the booting-replica claim.** Two complete servers really
  race before the seed lock on an empty database, but the supported deployment
  is explicitly serial and single-replica. This is Confirmed P3 documentation
  debt, not a current rollout defect: correct
  `2026-08-04-library-converge-design.md` with the next deployment-doc PR, and
  require a complete two-process gate only before overlapping replicas become
  supported. Evidence: the codebase-integrity audit's `findings.md`.

- **Door 1's adjust step shows a PROPOSED number with no provenance eyebrow of
  its own.** Revisit if that step becomes reachable without passing the offer.
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
- **Phase NF dead-code rows (RF29, filed at close 2026-09-06).**
  `PaintBarrierAbortedError`, `stagedRetireAttemptId()` and the transport's
  `targetDeadlineMs` / `collisionWindowMs` options have test consumers only —
  deliberate seams, kept on purpose, listed so nobody deletes them as dead.
  **Genuinely removable:** the NFC patch carries two unused symbols,
  `NfcSessionCoordinator.async(_:)` and `tagAttemptId`. Remove them at the
  next patch edit, which re-runs the Swift suite anyway. (`phase-nf.md`)

## Phase TD — the debt Phases LP and AV left behind

**NOT SCHEDULED, and grouped so it can be scheduled as ONE piece of work
rather than rediscovered five times** (James, 2026-09-08: file things "either
with triggers or in a tech debt phase"). Every row below was filed by the PR
that created it — that rule worked. What it lacked was a home: "Small,
queued" had grown past 240 rows, which is where things go to be forgotten
rather than found.

**TWO OF THESE SHARE ONE BLOCKER AND SHOULD BE DONE TOGETHER.** The fake
monitor sends no end-of-workout summary burst, so neither the free-row machine
tiles nor `VERIFIED ✓` can be photographed. Whoever unblocks that gets both
captures from one piece of work; doing either alone is most of the cost for
half the value.

**None of these is a defect a rower can hit today.** Four are gaps in
EVIDENCE — a capture that cannot be taken, a test that could not be made to
bite — and one is a hardening case (the unparsable 409) that has never been
observed. That is why they are grouped rather than queued, and why the entry
condition for working on them is a quiet week, not an incident.

**Sizes:** S each; M for the capture pair together.


- [ ] **"A failing reconciliation does not fail the send" is UNGATED.** The
      catch in `routes/concept2.ts`'s reconciliation now warns rather than
      swallowing silently — that was the real defect (RF24's shape: a
      permanently broken mechanism emitting nothing, forever). What has no
      test is the other half: that the send still returns 200 when
      `markC2Verified` throws. **Four attempts, all abandoned honestly
      (2026-09-08):** every shape produced a 500 from the FIXTURE rather than
      from the code under test, including one that 500s with no override at
      all, so the setup is what could not be got right.
      `makeFakeStores()` returns interlinked stores — handing the router a
      `logs` from a second call breaks the sharing — and the reconciliation
      sits inside `resolveWeightClass`, several layers below the file's
      helpers. Deliberately shipped as a gap rather than as a green test
      that proves the wrong thing. **The likely route:** an integration test
      in `concept2Send.integration.test.ts`, where the store is real and can
      be made to fail at the DB rather than by replacing a method.
      **ALSO IN THE ICEBOX, with its trigger** (a send that 500s for no
      visible reason, or anyone editing that `try`/`catch`), because what
      would make this matter is an EVENT, not a date — this row is the
      to-do, the icebox entry is the tripwire. Keep them in step.
      **Grouped into Phase TD 2026-09-08** so it is scheduled with the rest
      of the phase's debt rather than waiting for a PR that happens to touch
      this file. **S**

- [ ] **An unparsable Concept2 409 leaves a row permanently stuck as unsent.**
      Filed by #363's review (F7). `postResult` answers a 409 whose body
      carries no numeric `id` as `{kind:"c2_error", status:409}`, and #363
      excludes 409 from the retry band — correctly, because retrying would
      re-POST a row Concept2 already holds. The consequence is that the route
      answers 502, `recordC2Result` is never called, the UI shows the row
      unsent forever, and every re-send repeats the same loop. RF25's shape:
      a lower layer reports a fact the caller cannot act on. **Not observed** —
      the one captured Concept2 409 carries its id
      (`docs/monitor/c2-crossconnect-2026-09/raw-output.txt`), so this is
      hardening debt, not a live bug. Closing it means either parsing the id
      out of the message text or giving the rower a "Concept2 already has
      this" state. **S**

- [ ] **No committed capture shows `VERIFIED ✓`.** Phase AV ships the mark
      with client tests and two biting mutations, but the screenshots stack
      cannot photograph it, for a reason already written down at length in
      `e2e/screenshots.spec.ts`'s Wave E PR2 header: this stack is
      Concept2-DARK by construction (`compose.yml` passes
      `C2_LINK_ENABLED: ${C2_LINK_ENABLED:-}`, `screenshots.sh` exports
      nothing, and `scripts/compose-env.test.sh` enforces it), so
      `POST /api/concept2/results/:logId` 403s before it writes anything.
      **That route is the only writer of `verified`, exactly as it is the
      only writer of `c2_result_id`** — the note's own words: "a capture step
      that says 'seed state X' must be able to name a WRITER of X reachable
      in the environment the capture runs in; here there is none." The SENT
      and NO-WEIGHT captures already drive a tap against a routed answer
      instead; the mark needs the row READ routed too, which is a larger
      fake than either. Unblocks with the same work that would let this stack
      photograph a sent row at all.

- [ ] **The log detail issues TWO `GET /api/concept2/link` on EVERY view,
      including rows with no machine block at all.** Phase AV
      added the verified mark to `MachineConfirmedBlock`, which needs the live
      link for its account gate, and `Concept2SendBlock` on the same screen
      already calls `useConcept2Link()`. The hook has no shared cache — it is
      a per-call fetch with its own generation ref — so the second caller is a
      second request, not a second read of one. **Named in the PR that created
      it rather than discovered later (RF29's shape).** The fix is to lift the
      read to `FromTheLog` and pass `link` to both blocks, which changes
      `Concept2SendBlock`'s props and its tests; not carried in Phase AV
      because it is a refactor that PR did not need. **Scope corrected after
      the branch review (N9): the hook is called at the top of
      `MachineConfirmedBlock`, BEFORE its `machineWorkSeconds === null` early
      return, and the block is rendered unconditionally — so the second
      request fires on manual and timer rows too, where the block draws
      nothing. The first wording said "per view", which is true and reads as
      "per machine row".**

- [ ] **No committed capture shows the free-row summary's machine tiles.**
      They ship in #351 gated from upstream of the producer — the
      2026-08-31 walk's own bytes replayed through the real driver, hook and
      store, then the door mounted over what it wrote
      (`justRowReplay.test.ts`) — but `docs/screenshots/justrow-log.png`
      cannot show them:
      `injectJustRowShotFake` sends no burst, and `fake.test.ts` pins that a
      burst-less script emits no 0x0039/0x003A. **Attempted and reverted in
      #351**, so the next attempt starts here rather than from scratch. A
      `FakeBurst` rides a `FakeBoundaryEvent`, whose `actual` needs
      `index`, `elapsedSeconds`, `distanceMeters`, `avgSpm`,
      `avgHeartRateBpm` and `restDistanceMeters` (`restSeconds` is
      optional), plus
      sibling `cumulativeElapsedSeconds`/`cumulativeDistanceMeters`.
      Calories live on 0x003A, which `FakeBurst` takes only as raw bytes, so
      `summaryOverrides` cannot reach them. Appending such a boundary to the
      free-row script left Connect permanently disabled and broke four
      justrow captures — that is the thing to solve. **The cheap route was
      tried and does not work as-is (measured 2026-09-07, four orderings,
      each a full run of the live free-row flow):** `FakeControls`
      `deliverSummary` is boundary-free and already Playwright-driven
      (`connected.spec.ts` uses it on the programmed arm), but on the
      free-row END path it produced no summary ring event and no
      `summaryTotals` — delivered immediately after the second END tap,
      with and without `deliverVerification`, and again after asserting the
      hand-off hold visibly open ("Wrapping up", that file's own idiom).
      Whether the free-row arm declines it or the fake needs 0x003A (which
      `deliverSummary` never writes) is UNRESOLVED and is the next thing to
      find out. This is a FAKE-side gap only: the same fold works on real
      wire bytes, which is what `justRowReplay.test.ts` gates.


# Icebox

Not scheduled in any wave. Reconsider only when the recorded trigger fires;
an iceboxed item is not a phase-close requirement.

- **"A failing reconciliation does not fail the send" has no test — Phase AV,
  2026-09-08.** **Trigger:** a Concept2 send returns 500, or a rower reports a
  send that failed for no visible reason, at a time when `markC2Verified`
  could have been throwing. Also fires if anyone edits that `try`/`catch` or
  moves the reconciliation out of `resolveWeightClass`.
  **What is guarded and what is not.** The catch demonstrably WORKS: a forced
  `throw` placed inside the route's own try returns 200 and only the row
  assertion fails. What has no gate is that a store failure cannot fail the
  SEND — so an edit that broke it would ship silently, and the symptom would
  be a send failing because a verdict could not be refreshed, which is exactly
  what the catch exists to prevent.
  **Why it is iceboxed rather than queued.** Four attempts, all abandoned
  honestly. Every shape 500s in the FIXTURE rather than in the code, including
  a minimal case with no store override and no spy at all, while the five
  tests beside it pass — so something in `concept2.test.ts`'s reconciliation
  describe is order- or id-dependent and was not found. Shipping a green test
  that proved the wrong thing would have been worse than the gap (RF21).
  **The route most likely to work, if the trigger fires:** an integration test
  in `concept2Send.integration.test.ts`, where the store is REAL and can be
  made to fail at the database rather than by replacing a method — which is
  the manoeuvre that produced every one of the four fixture 500s.
  **Its to-do twin now lives in Phase TD**, not in "Small, queued" where it
  was first filed. This entry stays the tripwire; that one is the work.
  **What DID ship, so this is a missing gate and not a missing fix:** the
  catch warns instead of swallowing silently. Before it, a permanently broken
  reconciliation emitted nothing at all, forever, because the success log is
  gated on `upgraded > 0` — RF24's shape.

- **Ask for the account picker only when the rower asked to switch — James,
  2026-09-07.** **Trigger:** the extra tap actually annoys someone. #356 sends
  `prompt=select_account` on EVERY web sign-in, which fixes signing out and
  back in as a different account but also costs one mandatory tap on an
  ordinary 60-day session expiry that used to bounce back silently. Judged
  worth it at an allowlist of about five people, and the cost is stated in
  that PR's spec rather than left as a silence.
  **The narrower shape, if the trigger fires:** carry the prompt only on a
  sign-in that follows an explicit sign-out — sign-out sets a short-lived
  marker, `/api/auth/signin` reads it once and clears it. Small: our sign-out
  already touches a cookie.
  **Two alternatives considered and NOT chosen**, recorded so they are not
  re-derived. `login_hint`, which Google documents as suppressing the account
  chooser and either pre-filling the email box "or selects the proper
  session" — the opposite lever, telling Google who we expect rather than
  always asking; it suits an app that remembers the last account, which we do
  not. And splitting the affordance into an ordinary sign-in plus a separate
  "sign in as someone else", which suits products where switching is a real
  workflow rather than a rare event.
  **Google publishes no guidance on this trade-off** (checked, 2026-09-07:
  its OpenID Connect page documents the three `prompt` values and
  `login_hint`, and recommends nothing about when to use which). So every
  option here is convention, not a documented recommendation.

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
  You-screen PR — they are cheap and they ride it. **Phase JC IS that PR
  (2026-09-08), and its spec recommends they do NOT ride it:** pace tolerance
  changes what a judged number MEANS, which is the triad's first clause, and
  it would put a second independent risk model into one review. **RULED at
  JC's Gate 0 (ruling 9, James, 2026-09-08): NO, they do not ride it.**
  **DECLINED A SECOND TIME at Phase RN's Gate 0 (James, 2026-09-09), and the
  pair now SPLITS.** The answer lives here rather than only in RN's phase
  section, which is archived at phase close and would leave this row pointing
  at a trigger that fired inside a history file.
  - **Pace tolerance is TRIAD work and stops travelling as a comfort setting.**
    It changes what a judged number MEANS, which is the triad's first clause,
    so it is not cheap and never was — it has been mis-filed as cheap since
    Phase 9. **Trigger:** a rower says the on-target band is wrong. Its own
    antagonist pass whenever it opens.
  - **Countdown length (0-60 s) has been declined twice on review SHAPE, never
    on merit**, and the one thing that would settle it is a MEASUREMENT rather
    than a PR: nobody has rendered `/you/settings` at four sections on a 375px
    viewport. Per RF30, an item held on a stated cost owes the same receipt a
    design gate's option owes. **The next action is that capture, not a third
    retarget** — the screen, the section pattern and `pnpm screenshots` all
    exist. Take it, then build or strike with the image attached.
  - **Do NOT retarget either to "the third settings PR".** Two settings PRs
    have existed and both declined, each costing a Gate 0 turn to re-decline,
    and no third is on the slate: that is filing-as-deferral rather than a
    trigger (PM final gate, #381).
- **The rest of the old Phase 9's preferences**, which was killed as a phase for
  its multi-user framing (_"Two users with different preferences get different
  Today suggestions"_) rather than for its content: the suggest-workouts-at
  difficulty chips and time-available cap with a live "N of M match" readout,
  feeding Today and clearing `todayPick`; accent colour as a real setting; and
  every preference persisted per-user. **Trigger:** a tester says Today keeps
  suggesting workouts they do not have time for. The first item is the only one
  with a plausible complaint behind it; the other two are polish.
  **"Every preference persisted per-user" now describes a road NOT taken
  (2026-09-08).** Phase JC ships the app's first real preference and ships it
  DEVICE-scoped and un-keyed, on James's design-gate ruling: a colour choice
  is about the eyes looking at the screen, not about an account. The
  consequence is written down rather than left implicit — a second rower on
  the same phone inherits the first rower's colours, and there is no clear
  path at all, not even sign-out. That is where this bullet gets re-litigated,
  so it belongs with the device account switcher below rather than here.
- **Where the colours explain themselves, now that the summary legend is gone.**
  Filed at the PM final gate, 2026-09-08, because nobody in Phase JC made this
  argument: the app used to carry `← FASTER (BLUE) · SLOWER (RED) →` on the
  screen where the colours appear, and deleting it was right (eight of nine
  pace settings falsify it) but nothing replaced it. **A rower on defaults now
  sees the colours, no key, and no hint that a control exists** — and the rower
  this feature is FOR, the one who reads red as an alarm, is exactly the one
  who will not find `You → SETTINGS`, a row that looks like DIAGNOSTICS and
  names no colour. **A hint back on the summary is explicitly NOT the answer:**
  James's 2026-08-23 ruling forbids unsolicited teaching pushed at a rower
  doing something else, and a post-workout summary is that. The release note
  points once; this row carries the rest. **Trigger:** a tester asks what the
  colours mean, or says they cannot find where to change them. **S**
- **A preferences container on the You tab.** James asked at JC's Gate 0
  whether the doors should collapse behind an "Advanced" or "Settings" menu
  holding Concept2, colours and Diagnostics; the PM said neither and he took
  it (2026-09-08), so the group stays flat at four rows. **Trigger:** a SECOND
  preference row lands — the parked countdown-length and pace-tolerance
  settings two bullets above are the likely pair, at which point the group
  reaches six rows. **The shape is already decided:** the container holds
  PREFERENCES ONLY; CONCEPT2 and DIAGNOSTICS stay flat siblings, because the
  CONCEPT2 row carries a `RECONNECT NEEDED` / `SEND FAILED` state line that is
  the only ambient warning a rower gets, and DIAGNOSTICS is a log dump rather
  than anything adjustable. Full reasoning in `pm-ledger.md`, 2026-09-08. **S**
- **The device account switcher** (the design's SWITCH flow). **Trigger:** a
  second rower actually shares your phone at the erg. **Note (2026-09-08):**
  it is an identity ACTION and belongs beside Sign out, not inside any
  preferences container.
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
- ~~**Row without a baseline set** (James, 2026-08-23)~~ — **DONE.** The Just
  Row half shipped with Phase JR; the every-workout half was Phase RW,
  closed 2026-09-07; NOT yet released (the first v0.42.0 tag was deleted
  unreleased, 2026-09-07 — James is bundling more work first). Ledger row
  below.
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

- **Phase RN** — a rower can send the ready card away, and a quiet link says so
  · closed 2026-09-09 · #381 · released in v0.45.0 · [detail](docs/history/phase-rn.md)
- **Phase JC** — the rower chooses what red and blue mean, or turns them off
  · closed 2026-09-09 · #371 · released in v0.45.0 · [detail](docs/history/phase-jc.md)
- **Phase JR** — Just Row: an unprogrammed row is stored, judged and logged like
  any other · closed 2026-09-01 · #246, #255, #259 · released in v0.32.0,
  follow-ons through v0.35.0 · [detail](docs/history/phase-jr.md)
- **Phase MEM** — a killed test run says so instead of reading as flake · closed
  2026-09-08 · #375 · [detail](docs/history/phase-mem.md)
- **Phase OD** — an order of James's does not go quiet · closed 2026-09-09 ·
  #384 · [detail](docs/history/phase-od.md)
- **Phase PROTO** — the wire-semantics audit · REMOVED 2026-09-10 at James's
  instruction, never run; its two live residuals were lifted into the slate
  first · [detail](docs/history/phase-proto.md)
- **Phase RR — the register may only go down** · ABANDONED 2026-09-10,
  mid-flight · spec merged #386, mechanism closed unmerged #388 ·
  [detail](docs/history/phase-rr.md). The register's growth was real
  (+6.75 rows/day, monotone over twelve samples); a ratchet, a class marker on
  every heading and a `dies` stamp on every row was the wrong answer to it.
  The 26 rows that had already finished were evicted by hand instead —
  [detail](docs/history/register-evictions-2026-09-10.md).
- **The unlogged-session door** — a rower who did not want to lose an unlogged
  row now has a move · archived 2026-09-10, all six criteria ticked ·
  [detail](docs/history/unlogged-session-door.md)
- **Phase SB** — a blurred, page-coloured strip the height of the status bar
  on every screen, so scrolled content no longer prints over the clock · closed
  2026-09-06 · #323 · released in v0.40.0 · [detail](docs/history/phase-sb.md)
- **Phase RW** — every workout rows without a baseline: a four-word ladder
  (STEADY · MODERATE · HARD · ALL OUT) where the split would be, `~`
  durations off an assumed pace, and a stored "row without one for now"
  that survives a reinstall · closed 2026-09-07 · #333, #335, #338 ·
  awaiting release; the first v0.42.0 tag was deleted unreleased · [detail](docs/history/phase-rw.md)
- **Phase NF** — Scan NFC: hold the iPhone to the PM5's own tag and the app
  connects to exactly that erg and programs the workout, no Bluetooth picker
  (workout detail and Just Row); the scan screen names the target and can be
  cancelled. Walked on the erg, where James's own fact overturned the phase's
  advertising premise · closed 2026-09-06 · #316 + #324 + #325 · v0.40.0 ·
  [detail](docs/history/phase-nf.md)
- **Phase KB** — the tab bar hides while the keyboard is up (the v0.39.1 fill
  under it never painted: iOS never shrinks the fixed viewport; Ionic hides
  its bar too); the Keyboard plugin for its events only, tray restored ·
  closed 2026-09-06 · #321 · v0.39.2 · [detail](docs/history/phase-kb.md)
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
