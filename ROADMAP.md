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

## Phase RN — straight to the numbers, if that is how you row

**Status: GATE 0 CLOSED 2026-09-09 — cleared to implement.** Both hardening
lenses run and folded; three rulings tabled in the spec. Spec:
[docs/superpowers/specs/2026-09-09-ready-card-preference-design.md](docs/superpowers/specs/2026-09-09-ready-card-preference-design.md).

James asked for the `Ready when you pull` card to become a choice (2026-09-09):
an option on `/you/settings` that, when turned off, makes the app behave as
though **Show me the numbers** had been pressed the instant the monitor was
ready. Default is today's behaviour, so a rower who never opens Settings sees
no change. One stored word, the initial value of two `useState` flags, and
nothing on the wire.

TRIAD (a stored shape), so the spec takes a full antagonist pass and the PR
takes a PM final gate. It changes user-visible copy and layout, so Gate 0 —
the rendered settings screen, plus both skipped paths beside the cards they
replace — is approved before task 1.

- [x] **Hardening — RUN 2026-09-09, both lenses, closed.** The mechanism lens
      returned one BLOCKING (the store's read precedence made both of its own
      persistence gates unfailable) and three MAJOR; the prescribed-code lens
      returned one (I-5's two consumers need different test seams, and the
      harder one had no name). All folded; one ledger entry landed. **S**
- [x] **Gate 0 — CLOSED 2026-09-09.** Three rulings, tabled in the spec.
      Copy candidate A; the pre-pull link loss takes option C (Just Row's
      hand-off arm requires the link to be up, for a tapped hand-off as well
      as a skipped one); the parked comfort settings do NOT ride. **S**
- [ ] **The PR — BUILT, awaiting review and James's merge approval.** Seven
      tasks, spec §"PR shape". Shipped: the `you/readyCard.ts` store; the
      READY SCREEN section on `/you/settings` with its own save-failure
      notice; both consumers reading the setting; Gate 0 ruling 2's link
      guard in `JustRow.tsx`; the upstream-of-the-producer seam test; a
      wire-equality test proving the byte sequence is identical under both
      settings; six e2e legs across `connected.spec.ts` and
      `justrow.spec.ts`; a `design.spec.ts` assertion for the new group; and
      the recaptured settings screen. Unticked deliberately until it merges.
      **M**

**THREE LESSONS FOUND WHILE BUILDING IT, ALL THREE LANDED IN `CLAUDE.md` IN
THIS PR** rather than deferred to the merge-time agent-config check: this
section is archived at phase close, and two of them are facts about a fixture
and a module shape every future test touches (PM final gate, #381). Lesson 1
is now recurring failure 41; lesson 2 amends recurring failure 21; lesson 3
amends recurring failure 38. Kept here as the account of where they came
from. All three are the same shape — a gate that was green and could not
have been red — and all three were caught by running a mutation rather than
by reading.

1. **A fixture that streams frames makes any assertion about this feature
   decoration.** A rowing frame opens the run, and an open run renders the
   connected surface regardless of the ready-screen setting. Measured: with
   the store's `setItem` deleted, all three of the phase's first e2e legs
   passed. On a motionless fixture the same mutation fails two of them. The
   identical trap appeared twice in one day — first in the Gate 0 capture
   harness for Just Row, then in `connected.spec.ts` — so it is a property of
   the fake, not of one test.
2. **An in-memory fallback beside a store disarms every persistence gate,
   and the read order is not the half that matters.** Setting it on a
   SUCCESSFUL write is what lets a deleted `setItem` read back as a working
   save; four probes established that reversing the read order alone fails
   nothing.
3. **A same-document navigation is RF38's mirror.** Phase JC's lesson was
   that a reload made both legs pass; here a CLICK makes both legs blind,
   because the store module survives it. Two legs, and the reload one is the
   gate.

**DEVIATIONS checked, no row owed (2026-09-09):** the new section introduces
no colour pairing `index.css`'s own computed table does not already carry —
its options are the colour options' rules with `.setting-*` appended to the
selector lists in place — so Phase JC's "`/you/settings` gets NO row" ruling
still holds for the same three reasons it gave.

**ACCEPTED CONSEQUENCE, ruled by James 2026-09-09 — and it is the REMINDER
that is lost, not the mechanism.** `keepAwakeOn()` is a mount-lifetime
`useEffect` in both consumers, independent of this setting, so SKIP costs the
printed line and nothing else. That belongs on this row because this row is
where the loss is re-opened, and an overstated cost is the version a future
author inherits (PM final gate, #381). What a rower who turns the card off
stops seeing is `KEEP YOUR PHONE SCREEN ON` — Phase LM's Gate 0 called it the
only preventive element in that phase, and the ready card is the only place it
appears — and trades the card's Cancel, which terminates on the erg,
for the surface's End session. Both were offered a home on the pre-pull
surface and declined: the default is on, and a rower who turned it off asked
for less copy, not more. This row is where that is re-opened if the
phone-sleep work ever needs the warning back.

**This was the SECOND SETTINGS PR** that the parked comfort settings (countdown
length, pace tolerance) retargeted to at Phase JC's Gate 0. **ANSWERED at RN's
Gate 0 (James, 2026-09-09): NO, neither rides.** Pace tolerance changes what a
judged number means, which is the triad's first clause and a second risk model
in one review; countdown length is genuinely cheap and was held on review shape
rather than difficulty. **The trigger is not struck — it retargets again, to
the THIRD settings PR.** The one thing that would change the countdown answer
is still untested: nobody has measured how `/you/settings` reads at four
sections on a 375px viewport.

**ACCEPTED DIVERGENCE, ruled at the same gate.** Ruling 2 changes `JustRow.tsx`
and deliberately does not change `ConnectedInterstitial.tsx`: the programmed
path has no pre-row lost screen to bypass, so under `skip` a frame-silent ready
lands on the surface's LOST banner rather than on a ready card that says
"Ready when you pull" and mentions nothing. That is more informative than
today, and it is the one place the two entry points behave differently.

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

- [ ] **PR 1 — the refusal, the link, and the matrix.** A domain denylist
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
- [ ] **Nothing can gate the five-button failure frame.** `canOpenAppSettings()`
      is `isNative()`, so the web build renders `permission-denied` with four
      buttons and every e2e assertion stands on that shape. The deciding case —
      five buttons, a 74px window under the old pairing count — exists only on
      iOS, where the frame's own message would be cut.
      NARROWED IN REVIEW ROUND 1: the PAIRING COUNT itself is now caught, one
      frame over — reverting to `nth-last-child(-n + 2)` fails the refusal
      test's `contentHeight` precondition at 157px against a 142px window,
      because that frame's content sits between the two windows. What stays
      ungateable is the five-button SHAPE: no web assertion can stand on it, so
      nothing would catch a regression that only reached the iOS stack. Either
      a seam on that adapter or an accepted gap; not decided. **S**
- [x] **The permission screen says "your PM5" where it means "your monitor".**
      CLOSED in the Phase MT close-out PR, together with the Bluetooth scan
      sheet's own instance of the same rule (both were RF32, both copy-only,
      so they landed as one change). `useMonitorSession.ts`'s
      `BluetoothPermissionError` detail now reads "Ergomatic can't reach your
      monitor without Bluetooth." The census the rule prescribes
      (`grep -rn "PM5" app/src` over string literals) also caught the NFC
      connecting card's "Keep the PM5 on and close by.", in both components
      that render it, and that changed with them. **S**
- [ ] **The permission frame's DETAIL panel repeats its own remedy sentence.**
      `error.detail` renders as the body line AND again inside the panel — 125px
      of the frame's 308px, verbatim duplication. This is the same argument
      #366 used to drop the panel from the refusal frame ("the top half saying
      exactly what the bottom half already says"); nobody has applied it here.
      Changes what the screen contains, so it needs its own design ruling. **S**
- [x] **On the web build, the top of an overflowing interstitial body cannot be
      scrolled to at all.** CLOSED by #366's landscape fix: the body is
      `flex-start` plus auto margins on its first and last child, so overflow
      now falls entirely BELOW the window. Was: `justify-content: center`
      overflowed in BOTH directions; chromium clamps `scrollTop` at 0 while the
      first child sat at -30 to -100px, so the headline was unreachable, while
      WebKit permits negative `scrollTop` (measured range [-101, 102]) and the
      iOS app could pull it into view. Now GATED, by the row below. **S**
- [ ] **"Row on the phone timer instead" is offered on the refusal screen.**
      After a SkiErg refusal it routes the rower to store the ski piece as a
      rowing log by hand. No Concept2 upload follows — `eligibilityFailure`
      gates on `source !== "pm5"` — so only the local harm applies, and it is
      not clearly wrong, since the likeliest cause of that screen is picking
      the wrong monitor from a list and that rower does have a RowErg. Filed
      at the design gate rather than found later. **S**
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
      action-stack budget, not the centring. **S**
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

## Phase JC — the rower chooses what red and blue mean

**Status: GATE 0 CLOSED 2026-09-08 — cleared to implement.** The anchor
antagonist pass returned two blocking findings and four majors, all folded;
Gate 0's nine rulings are tabled in the spec. Shape approved by James
2026-09-07: four slots, each RED / BLUE / OFF; both the connected pane and the
post-workout summary obey; device-local; a new SETTINGS door in You. Spec:
[docs/superpowers/specs/2026-09-08-judge-colours-design.md](docs/superpowers/specs/2026-09-08-judge-colours-design.md).

Blue-for-faster and red-for-slower were a tester's request in August 2026 and
have been hardcoded since. Some rowers read red on a number as an alarm; some
want the split coloured and the stroke rate left alone. It is a preference,
so it becomes one. Defaults are exactly today's appearance.

TRIAD (a stored shape), so the spec takes a full antagonist pass and the PR
takes a PM final gate. It changes user-visible copy and layout, so Gate 0 —
the rendered screen, the door group, and before/after captures of a connected
pane and a summary — is approved before task 1.

- [x] **Gate 0 — CLOSED 2026-09-08.** Nine rulings, tabled in the spec. The
      three that change the build: door order is BASELINES, CONCEPT2,
      SETTINGS, DIAGNOSTICS with the group staying FLAT; **the summary's
      `← FASTER (BLUE) · SLOWER (RED) →` legend is DELETED** rather than
      derived from the slots; and the parked comfort settings do NOT ride this
      PR. **S**
- **LESSON FOUND MID-IMPLEMENTATION, 2026-09-08 — candidate recurring failure,
      to be decided at the merge-time agent-config check.** Phase JC's rename moved
      the summary's verdict classes onto a shared family ~5000 lines UP `index.css`,
      and `.summary-row-pace { color: var(--ink) }` sits below them at identical
      (0,1,0) specificity — so later won and **every judged row on the post-workout
      summary rendered plain ink**. The old `.summary-row-faster` had sat 30 lines
      BELOW that rule and beaten it, which is why nothing ever had to know. **No
      class-name assertion could see this by construction** (jsdom resolves no
      `var()`); `pnpm e2e` caught it. `index.css` already stated the rule in prose
      after the identical bug on a connected pane's hero — prose is not a gate.
      Shape: *moving a rule in a stylesheet silently changes which of two
      equal-specificity rules wins, and only a real browser can see it.*
- **SECOND LESSON, same phase, 2026-09-08 — also for the merge-time
      agent-config check.** Phase JC's seam test rests on navigating by CLICK
      rather than `page.goto`, because the settings screen's inline root
      properties survive a client-side nav and die on a reload — that asymmetry
      is what makes its two legs test different things. The plan defended that
      in PROSE and gated nothing. Measured: swap the click for a `goto` and
      **every colour assertion still passes** (the boot apply repaints from
      storage, so the cell is the right colour either way) while the two-legs
      claim is silently false. A same-document sentinel, asserted present in one
      leg and absent in the other, is what closes it. Shape: *a test whose value
      depends on HOW it navigated needs an assertion about the navigation, or
      the requirement is a comment.*
- **THIRD, from the PM final gate — an amendment to an EXISTING CLAUDE.md rule
      rather than a new one.** The "after withdrawing a claim, grep its
      PHRASING across every file that repeated it" bullet caught the deleted
      legend's literal words and missed five present-tense sentences in
      `app/src/news/content/releaseNotes.ts` asserting the same fact in
      different words. Proposed addition: *"and grep the PROPOSITION, not only
      the string: a shipped release note asserting the same fact in different
      words is the copy most likely to survive the sweep."* Decide at the
      merge-time agent-config check.
- **`/you/settings` gets NO `DEVIATIONS.md` row, decided at the Task 8 sweep
      (2026-09-08) — recorded so the next author does not re-open it.** Three
      reasons. The handoff has no settings screen, so there is nothing to
      deviate FROM; the file's own inclusion test is the SPM-target row's
      ("recorded here since this is a genuinely NEW cell, not a re-use of an
      existing color decision") and every colour on this screen is a re-use —
      `--ink`/`--ink-3` at ratios the file already records many times over,
      `--accent` as the checked state (the onboarding chip's own idiom), the
      swatch inks from the judgement-palette row, and a decorative sub-3:1
      `--rule-3` border that `.diag-copy` and `.onb-option` already ship
      rowless on the SHUFFLE/FILTER-chip row's precedent. And insertion
      is not free: this table numbers rows BY POSITION, so a new row would rot
      every "see row N" above it, including the three this phase just
      reconciled — the migration-to-stable-IDs item is still open below.
      (Cited by subject, not by number, on purpose: main added a row at the
      file's line 81 while this branch was open, so every number above it has
      already moved once.) The
      screen's full computed-contrast table, including the one figure under
      3:1 and why it is decoration, lives in its own `index.css` block instead.
- [ ] **The PR — #371, OPEN 2026-09-08.** Built and PM-gated (PASS WITH
      CONDITIONS); the whole-branch review and James's merge approval are owed.
      Unticked deliberately: a ticked box whose text says it is not done has
      been wrong on main for weeks at a time here.
      Eight tasks, spec §"PR shape". The load-bearing one is the
      e2e seam test: Vitest mocks every `.css` import to an empty string here,
      so **no client test can prove a colour lands on a pixel** — only e2e can
      start upstream of the producer (recurring failure 24). Shipped: the
      `you/judgeColors.ts` store; the palette split into two raw inks and four
      resolvable slots; four `.judge-{pace,spm}-{faster,slower}` rules where two
      pairs stood; the six judged call sites taking a REQUIRED metric; the
      legend deletion; a generalised `OptionGroup`; `/you/settings` behind
      You's third door; the `main.tsx` boot apply; and the two-leg seam test.
      **M**

**Three structural notes worth keeping even if the phase changes shape.**
`index.css` documented "ONE PAIR SERVES BOTH JUDGED METRICS ... There is no
per-metric colour branch to keep in step"; per-slot control retired that
sentence (Task 3 deleted it along with the pair), and the six judged call
sites each already knew their own metric, so nothing new threads through
`surfaceModel`. **But there were TWO judged class pairs, not one** —
`.summary-row-faster`/`-slower` was a second, independent pair on the summary
screen, and the honest blast radius (measured at phase open) was 114
references across 29 files including 12 committed e2e HTML fixtures and
`design.spec.ts`'s own judged-colour harness; Task 3 folded both pairs onto
the shared `.judge-{pace,spm}-{faster,slower}` family and retired the old
ones. **And the summary screen named both colours in hardcoded copy**
(`← FASTER (BLUE) · SLOWER (RED) →`, pinned by an e2e `toHaveText`), which
eight of the nine reachable pace configurations made false; Gate 0 ruled it
DELETED on `TraceChart.tsx`'s own precedent ("naming a colour here would just
be a second thing to get wrong later"), and Task 4 removed the element, its
CSS rule, the `hasJudgedRow` guard that was its only consumer, and the e2e
pin (now its negative). And `--judge-slower` was doing two
jobs — the judged tint AND `.connected-lost`'s red alarm background — which is
why the spec splits raw inks (`--judge-red`/`--judge-blue`) from resolved
slots rather than overriding the existing tokens in place. Overriding in place
would have been fewer lines and would have turned the LOST THE MONITOR banner
blue for any rower who chose all-blue.

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


## Phase DE — Difficulty out, effort in

**Status: OPEN 2026-09-05 — spec merged (#308); PR 1 MERGED as #309
(2026-09-05); PR 2 in flight (worktree `Ergomatic-wt-de2`); release HELD
until PR 2 merges (one tag for both).** **TRIAD** (stored shape).
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
- [ ] **PR 3 — drop compat. SCHEDULED: Saturday 2026-09-12** (James,
      2026-09-05: "We have like five users let's just schedule the work for
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

**Exit:** the two phase-close greps in spec §6 (no `pain`/`difficult`; and
`effort` means one thing) pasted into the close gate; e2e and screenshots
green with refreshed captures; the by-hand stale-build check (a `v0.38.1`
web build against the post-PR-2 server saves `pain: 3`, reads back
`effort: 3`, and a workout it creates carries a derived difficulty)
recorded in PR 2's body; release note in rower words (spec §6.6).

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
      2026-08-20. Two named flakes remain unresolved: the manual-door
      tap-target flake (399/401, then 401/401 twice) and `design.spec.ts`'s
      `stableBoundingBox` flake (`e2e/helpers.ts:89`). #152 landed evidence
      capture for a _third_ flake and produced
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
      to `session_logs`. **S**

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
      scale the un-indexed SUM measures ~1 ms. **S**

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
  **Causes now measured:** the clock rendered into the frame (2026-09-07);
  a trace chart whose axis ticks follow REAL elapsed test time (`log-monitor`:
  `0:00/0:05/0:10/0:15` one run, `0:00/0:10/0:20` the next); a focus-dependent
  hint that comes and goes (`you-derive-offer-accepted`:
  `ESTIMATED · TYPE TO ADJUST` vs `ESTIMATED`); and the per-day seeded date
  stamp. **Still unexplained:** which cause owns which files — no run has
  attributed a count file by file — and whether anything is left once all four
  are frozen. The 2026-08-28 control says the residue is environmental rather
  than PR-shaped, which is a bound on the answer, not the answer.
  **Why it matters:** committed captures are the PR's visual record (RF7) and
  a reviewer's only look at a screen. A `git status` full of noise buries the
  frames a change actually altered — PR #341 reverted 61 by hand twice, and
  Phase MT's PR worked around it by adding only the two frames its rule could
  touch and discarding the rest.
  **Fix:** freeze the clock the captures render, the way the fixtures already
  freeze their data; then re-measure and attribute what survives.
  To reproduce: run `pnpm screenshots` twice at the same commit, saving the
  first run's PNGs, and diff run against run. **The 2026-08-30 measurement is
  written out here rather than cited**, because that round's report lives
  under git-excluded `.superpowers/` and a citation into it is unreachable to
  anyone but the session that wrote it (RF16's corollary). **M** — the
  largest of the folded rows' own sizings; the 2026-08-28 filing carried
  **S/M** and the 2026-09-07 and 2026-09-08 filings **M**.
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

## Phase MEM — local test runs stop OOMing, and stop reading as flake

Opened 2026-09-08. Spec:
`docs/superpowers/specs/2026-09-08-local-test-memory-design.md`
(revised after a `/harden` lens 1 pass that falsified two of its
load-bearing premises).

**The problem.** Test runs are killed for want of memory and the kill is
read as flake, so it gets retried into a machine with no room. Baseline
at rest is 8.8 GB of 16 GB with swap at 6.6 of 7.2 GB and 66 MB of free
pages, across 3 live agent sessions and 6 worktrees. The client suite
peaks at **2.76 GB** at Vitest's default 9 workers and **1.84 GB** at 4
(38 s vs 25 s). **Those two figures came from an UNSCOPED sampler** that
summed every Node process on the machine, in one sitting, against an
unmeasured floor — they are a relative comparison, not absolutes. The
sampler is path-scoped now; a re-measurement of `--project client`
against `start_floor=0MB` reads 1459 MB at 4, 2091 MB at 6, 2612 MB at 9.
Four is the LIGHTEST setting and that is why it ships; the old "six is
strictly dominated by four" line does not reproduce on that command
(six was faster and heavier), so it is withdrawn.

**The first framing was wrong and is corrected here, not appended to.**
The spec originally said a memory kill exits 1 and is indistinguishable
from a test failure. Measured: `pnpm run` and a raw binary both preserve
the signal (**134** for a V8 fatal, **137** for SIGKILL); only
`pnpm exec` collapses it to 1. The original measurement was taken through
`pnpm exec`. **CLAUDE.md itself prescribes that shape** as the workaround
for pnpm swallowing scoped flags, so the repo's own advice routes agents
onto the one path where the signal dies. The genuinely ambiguous case is
different: a **fork-worker** OOM leaves the parent alive, exiting 1 with
a full `Test Files` summary.

**Three premises falsified while measuring, recorded so nobody
re-derives them:** idle per-worktree compose stacks cost **236 MB across
two** (not a memory lever); `--coverage` adds **50 MB**; and a V8 OOM
prints `Ineffective mark-compacts near heap limit`, not `Reached heap
limit`, on 4 of 4 runs of the growth shape a real suite has. **The needle
that ships is `Allocation failed`**: a third V8 fatal string exists
(`Allocation failed - process out of memory`) that carries no "heap"
wording at all, so `JavaScript heap out of memory` misses it, and
`Allocation failed` matches 2 of 23 lines in the node binary against 14
for the tempting `out of memory` (which catches recoverable HTTP/2 and
wasm errors).

**Three parts, James-approved 2026-09-08:** (A) a wrapper reading the
exit code first and the message second, plus a preflight advisory that
**warns and does not block** (his call); (B) `maxWorkers` 4 and
Playwright `workers` 2 (proposed), both env-overridable and both
**disabled under CI**, so a bigger machine pays nothing (his call); (C)
pre-push runs `--changed` plus, unconditionally, the whole-tree gates
that `--changed` structurally cannot select — **both** the `scripts/`
suites and the 46 client suites that read the tree, the second of which
the first implementation missed.

**BUILT, UNMERGED — all six tasks are on branch `phase-mem-test-memory`
(Tasks 1-5 the mechanism, Task 6 the documentation half); nothing has
landed on main.**
`app/scripts/test-run.sh` implements the four-way signal split (silent
Ctrl-C at 130; memory banner at 137; then the stderr needle, gated on a
non-zero exit, which is what makes a 134 a memory kill rather than a bare
abort; a distinct "killed by signal" banner at any other exit ≥ 128,
including a needle-less 134; then the missing-summary rule — CLAUDE.md
RF40, spec A1) and is wired into
`ci.yml`'s `scripts` job by name. **Worker counts, measured (Task 4,
verified clean floor):** default → **4**; `ERGOMATIC_TEST_WORKERS=8` →
**8**; `CI=true` → **9** (the cap is genuinely inert under CI). **The
Playwright default shipped as 3, not the proposed 2** — measured wall-clock
(Task 4): 2 workers = 6:12 total (5.5 m test phase), 3 workers = 3:58
(3.6 m), 5 workers (the old default) = 2:39 (2.3 m). 2 workers cost
2.34-2.39x the old default, over the spec's ~2x threshold; 3 costs only
~1.5x, so the implementing PR raised the shipped default from 2 to 3
(`playwright.config.ts`, spec Part B2).

**The open question the desk cannot settle.** No capture of the real
failure exists — everything measured so far is a reproduction. A V8 OOM
is a per-process 4192 MB limit while the whole tree peaks at 2.76 GB
(unscoped; 2612 MB scoped to this checkout), and
an OS memory kill of a terminal `node` on darwin is unobserved
(`memorystatus`, not the Linux OOM killer;
`kill_on_sustained_pressure_count` is 0 here). So Part B's lever and Part
A's classifier may not be aimed at the same event. The spec's A0 ships a
capture step for exactly this; the next real kill answers it.

**A `/harden` lens 2 pass then found 24 more, 5 blocking**, all in the
prescribed blocks: the pre-push hook body runs under `sh -e`, so the ref
guard as written **aborts the hook** instead of falling back; `--changed`
and a path filter INTERSECT, so "append the `scripts/` gates" needed two
invocations rather than one; piping the child through `tee` puts the
child's status out of `$?`'s reach, so the wrapper reads `PIPESTATUS[0]`
(measured 2026-09-08 at the final review: `rc=$?` alone still reports 137
because the script also sets `pipefail`, but the two together — a dropped
`-o pipefail` and `rc=$?` — make a SIGKILL read as exit **0**, and
`PIPESTATUS[0]` is correct either way); the third V8 fatal OOM string
above forced the needle change; and `process.env.CI` being a string means
`CI=false` silently removes both caps.

**One of them is worth remembering on its own:** the clause invoking RF34
committed RF34 — it said the e2e instruction lives in "all three places"
and named three, where a repo-wide grep finds **five** (a second
`CLAUDE.md` site and `README.md` were missed).

**Owed at implementation — both resolved.** Playwright's cost at 2 workers
was measured at Task 4 (table above), which is why the shipped default
moved to 3. `test-run.test.sh` and `test-run-advisory.test.sh` are both in
`ci.yml`'s `scripts` job by name (`.github/workflows/ci.yml:181,185`).
**Still true and still unaddressed:** that job is `ubuntu-latest`, so
**nothing gates the bash-3.2.57 constraint** the wrapper is written under.

## Needs a decision from James

- **The 1 000 ms collision window is paid on every NFC connect.**
  `TARGET_COLLISION_WINDOW_MS` (`src/monitor/transports/capacitorBle.ts`)
  holds every targeted scan open for a full second after the first exact-name
  match, so that two devices carrying one name fail closed instead of
  programming the wrong erg. The walk measured 2-3 s to CONNECTED; a third of
  that is ours. It is an Ergomatic policy, not a platform fact (Phase NF spec,
  "Residuals accepted for review"). **Whether a household of one erg should
  pay a gym's safety margin on every row** is a one-constant change with a
  named test; James's call.
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

- **The `PM5` / `Timer` provenance label is a design decision RF32's census
  did not take.** `UnsavedWorkouts.tsx:66,170`, `ReviewSession.tsx:75,111` and
  `ReadOnlyRecording.tsx:13` render `PM5 · Sep 8 · Not saved` and
  `Discard PM5 workout X`. Phase MT's RF32 census (2026-09-08) LEFT these
  deliberately: the label's whole job is telling the reader a MACHINE recorded
  the row rather than the phone timer, which is RF32's own
  naming-the-source-of-a-stored-number exemption. It reads against `Timer` as
  its opposite, and swapping it to `Monitor` would change one word across
  three screens at once. **A design decision, not a mechanical one** — hence
  here rather than in the sweep. Related: the NFC connecting card's copy WAS
  changed in the same census, on a screen whose shape was Gate 0 approved
  2026-09-06, one day before the RF32 rule existed; the change is wording-only
  (no captures owed, James 2026-08-23) and the review judged it correct, but
  it is the precedent this row would follow.
  **STRUCK from this row, 2026-09-09 (fix round): it used to call itself "the
  one place RF32 was not swept" and "the last user-facing `PM5` vocabulary
  outside disambiguation". Both were false when written** — the census had
  missed `driver.ts`'s eight `REJECTION_VERBS`, which reach a rower as
  `ConnectedError.detail` on all three failure doors and printed
  `PM5 rejected frame 0`. They now read "The monitor …", gated by a test that
  derives its reason list from the driver's own exhaustive `Record`. The two
  struck sentences are RF30's shape: a later census reads a completeness claim
  INSTEAD of re-running the grep, so the wrong one costs more than none.
  **What still says `PM5` to a rower, so the next census starts from a true
  list** (`grep -rn "PM5" app/src` over string literals, run 2026-09-09):
  this row's provenance label; `MachineSummaryTable.tsx:34`'s
  `PM5 · PER INTERVAL` eyebrow and `useMonitorSession.ts:1723`'s "More than
  one PM5 has this name." (both are examples RF32's own text names as
  allowed); the device caption and `Couldn't reach PM5 …`, which interpolate
  the monitor's advertised name; `capacitorBle.ts`'s three targeted-scan
  errors (lines 192/199/206), which render in the DETAIL panel's `raw` slot
  and keep the name on a receipt recorded in that file; **THREE** lines of
  rendered article prose in `connectTheMonitor.tsx` — line 6 "Connected mode
  adds a Concept2 PM5", line 14 "The PM5 then runs the piece the way it runs
  a race", line 34 "You'll need a PM5 (the standard Concept2 monitor)" — none
  assessed by any census; and **10 note strings / 13 occurrences** in shipped
  release notes (its own row below).
  **THIS LIST HAS NOW BEEN WRONG TWICE, so re-run the commands rather than
  trusting the prose.** Round 1 wrote two false completeness claims (struck
  above); round 2 replaced them with this list and miscounted both of the
  numbers in it — `connectTheMonitor` as one mention when it has three, the
  release notes as "nine" when they carry 13 occurrences over 10 strings.
  Round 3 (2026-09-09) measured both:
  `grep -n "PM5" app/src/news/content/bodies/connectTheMonitor.tsx` → 3 hits
  (6, 14, 34, all inside rendered `<p>` prose);
  `grep -vn '^\s*//' app/src/news/content/releaseNotes.ts | grep -c "PM5"` →
  10 and
  `grep -v '^\s*//' app/src/news/content/releaseNotes.ts | grep -o "PM5" | wc -l`
  → 13 (the `-v` drops the file's ten `//` provenance comments, which are not
  copy). Both are counts of the tree at the Phase MT close-out branch.

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
| **Session calories** — CLOSED by Phase LP 2026-09-06 (0x003A Total Calories is the honest total; per-split sum equals it on 9/9 committed captures) | 0x0033's `totalCalories` is INTERVAL-scoped (it resets at every boundary) and the 0x0039 summary carries no calorie field, so an honest session CAL needs the register-fold discipline CR2 spec 1 built for distance, plus an honest ramping fake (today's emits a constant 0, so **nothing can go red**), plus a walk photo. **ZONE rides behind it** — it needs a strap and a max-HR source the app lacks. **Ownerless since 2026-08-15**                    | `phase-cr2.md`               |
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
| **The `--failure` comment misstates why row one is 56px** | `index.css`'s `--failure` block says `Row on the phone timer instead` wrapping is what makes the first row taller. Measured at Phase MT's Gate 0 (2026-09-08): with that button gone the row is STILL 56px, because `.button-l1{min-height:56px}` and `.button-l2{min-height:52px}`. The comment names the wrong cause, so the next person tuning that stack tunes the wrong thing | Phase MT Gate 0, `docs/design/mt-followon-gate0/` |
| **Just Row's refusal stack never gets #370's pairing** | `JustRow.tsx`'s free-row refusal wears `.connected-interstitial-actions` WITHOUT the `--failure` modifier, so the landscape pairing rule #370 shipped does not reach it. Harmless TODAY at two buttons — it becomes a cut headline the moment that stack grows a third. Found at Phase MT's Gate 0, 2026-09-08 | Phase MT Gate 0 |

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

- **Ten shipped release-note strings say `PM5`, 13 occurrences in all**
  (`src/news/content/releaseNotes.ts`; lines 133, 160, 161, 181 ×3, 182 ×2,
  695, 715, 1030, 1072, 1090 — measured 2026-09-09 with
  `grep -vn '^\s*//' app/src/news/content/releaseNotes.ts | grep -c "PM5"`
  for the strings and the same pipeline through `grep -o "PM5" | wc -l` for
  the occurrences; the `-v` drops ten `//` provenance comments, which are not
  copy). **This row said "nine" until 2026-09-09 and nobody had run the
  count** — re-run it rather than quoting it. Phase MT's RF32 census
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


- **DONE (2026-09-07, PR #344): a rower who sets ONE baseline is told which
  one and offered the other at the 7 s offset.** James's ruling ("If a user
  sets a 2k or a 6k they should be asked to set both with a suggestion of the
  7s offset"), raised at Phase RW PR C's PM final gate: every screen collapsed
  a half pair to `null`, so a rower with a tested 2k read `NO BASELINE SET` on
  Today, which was false about their account. The PM ruled ASK, not force
  (forcing would make a 2k test's own result unsavable until a 6k it does not
  have), and James took the PM's decision. What shipped: Today's row names the
  stored side (`2K SET · NO 6K`) and fills the other on one tap, stamped
  `derived`; Library and the workout detail's captions name it too; the doors
  card states the consequence of leaving them unset. **The doors card now
  yields to that row whenever one side is stored** — Phase BL PR C had ruled
  the doors a superset re-entry for any incomplete pair, which sent a rower
  who typed a 2k in the I-know-my-baseline door back to `SET UP YOUR
  BASELINE`; that is the ordinary way to hold half a pair, and it never
  writes `baselinesSkipped`, so the first cut of this work reached only
  rowers who had skipped first. The estimate is suppressed when the derived
  split falls outside the storable 60..240 band, matching the refusal
  `BaselineEditor`'s and `postTestOffer`'s offers already make, and a failed
  write says so rather than leaving a button that does nothing. The You
  editor keeps its own existing counterpart offer (`deriveOffer` /
  `DeriveSlot`) unchanged; no second ask was added there.
  **Why not force** (PM, 2026-09-07, on James's follow-up "I feel like it's
  natural but maybe it'd bother some people" — and it is NOT the consistency
  argument): a rower made to fill a 6k they never rowed types a guess, and
  `KnowBaseline.tsx` stamps a typed field `manual`, permanently
  indistinguishable from a rowed number, while the declined offer would have
  stored `derived`. Force degrades the provenance record it means to
  complete, and it cannot be done honestly at the erg — removing the
  post-test Skip holds a real measurement hostage to a heuristic. **Why not
  silent auto-fill:** this repo's line is not "never store an estimate"
  (`Recommend.tsx` stores both sides as `estimated` from a hand-authored
  table), it is that the rower SAW it and the provenance is recorded.
  **And the 7 s is an offer, not a fact:** `estimateBaseline.ts` grounds it
  on Paul's Law (≈ +7.9 s, SECONDARY, a forum post, trained rowers) and says
  in terms that no source grounds a better per-population gap;
  `deriveBaseline.test.ts` pins the constant and nothing about any real pair.
- **DONE (2026-09-07, PR #348): v0.42.0's notes corrected, and the tag it
  was written for DELETED unreleased.** Item 2 promised "a quiet **NO
  BASELINE SET** line" and that "setting a baseline any time puts the numbers
  back"; after #344 a half-set rower reads `2K SET · NO 6K`, and setting ONE
  side does not put the numbers back. James, 2026-09-07: "We won't release
  that tag" — so `v0.42.0` (which sat at `8326fb2c`, #344's base, and never
  reached TestFlight) was deleted locally and on the remote, and the VERSION
  is free to be re-cut at whatever main is when he releases. The notes entry
  keeps its `v0.42.0` label and `e2e/releasePin.ts` is unchanged for the same
  reason. Its provenance comment was re-counted over the full
  `v0.41.0..main` range (sixteen merges, RF15) and three items added: the
  half-set offer (#344), the verification-code narrowing (#341) and AVG HR
  (#345).
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
