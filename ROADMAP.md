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

- One section per phase: status, goal, exit criteria, and epic-level checkboxes.
- Check items off and update status lines as work lands; commit alongside the work.
- This roadmap stays coarse on purpose. Each phase gets its own design/plan cycle
  (spec in `docs/superpowers/specs/`, plan in `docs/superpowers/plans/`) when it starts.

## Locked decisions

| Area              | Decision                                                                                                                                                                                                                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name              | **Ergomatic** in UI and docs (design files say "Erg Log")                                                                                                                                                                                                                                                 |
| Architecture      | Server-backed SPA: React 19 + Vite 8 client, Express 5 API, TypeScript, ESM, pnpm                                                                                                                                                                                                                         |
| Data              | PostgreSQL 18 + Drizzle ORM; per-user data throughout                                                                                                                                                                                                                                                     |
| Offline           | Active session (timer state, in-progress log) persists in localStorage; reload or dropped connection never loses a workout; log save syncs to the API                                                                                                                                                     |
| Auth              | Google OAuth (authorization code flow) only at launch; self-hosted cookie sessions in Postgres; no auth SaaS                                                                                                                                                                                              |
| Local enforcement | husky + lint-staged — pre-commit: lint + typecheck on staged files; pre-push: full test suite                                                                                                                                                                                                             |
| CI                | GitHub Actions: install → lint → typecheck → coverage-gated tests → build → docker build (push: false)                                                                                                                                                                                                    |
| Tests             | Vitest three-project setup: unit (node), client (jsdom + Testing Library), integration (Testcontainers Postgres); enforced coverage thresholds                                                                                                                                                            |
| Deployment        | Full CD: push to main → self-hosted runner → SSH deploy script → health-gated auto-rollback (nataliesawacritter pattern)                                                                                                                                                                                  |
| Hosting           | Docker Compose (hardened: read_only, cap_drop ALL, non-root) fronted by a Cloudflare tunnel behind a compose profile                                                                                                                                                                                      |
| Time display      | House time format is elastic positional: seconds always shown, an hour group only when nonzero, the leading group never zero-padded — `0:45`, `20:00`, `1:05:00` (`domain/duration.ts`, Phase 5F). Totals stay unit-labelled (`302 MIN`, `302′`), which is what keeps a colon value's meaning unambiguous |

Reference codebases for conventions: `nataliesawacritter.info` (primary template),
`pool_monitor` (design-token CSS approach).

### Standing rule: verify current versions

At the start of every phase that adds or upgrades a language, runtime, or library,
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

## Phase 0 — Scaffold & tooling

**Status:** Done
**Goal:** A cloned repo where `pnpm install && pnpm test` works and bad code cannot be committed.

- [x] Verify current stable versions of everything (Node, pnpm, TypeScript, React, Vite, Express, Vitest, ESLint, husky/lint-staged) against the registries per the standing rule above
- [x] Repo layout: `app/` containing `client/` (Vite React) and `server/` (Express), shared `domain/` module space
- [x] pnpm + `only-allow pnpm`, `.npmrc`, Node version pin
- [x] TypeScript strict config, ESLint flat config (js + typescript-eslint + react-hooks + react-refresh)
- [x] Vitest three-project setup with coverage thresholds wired from the start
- [x] husky + lint-staged: pre-commit lint/typecheck (staged), pre-push full tests
- [x] GitHub Actions CI: lint → typecheck → test:coverage → build; Dependabot (weekly, grouped)
- [x] CLAUDE.md + README with dev workflow

**Exit:** CI green on a trivial client/server "hello" with one passing test in each Vitest project; hooks demonstrably block a lint failure and a test failure.

## Phase 1 — Infra & continuous deployment

**Status:** Done
**Goal:** Every push to main lands on a real URL with zero manual steps.

- [x] Hardened multi-stage Dockerfiles (non-root, read-only, tmpfs, cap_drop ALL)
- [x] `compose.yml`: Postgres 18 (healthchecked volume), app, cloudflared under a `tunnel` profile
- [x] `/api/health` endpoint incl. DB connectivity check
- [x] `scripts/deploy.sh` (checkout CI-validated SHA → `compose up --build --wait` → auto-rollback on failed health gate) + tests for the script
- [x] CI `deploy` job on self-hosted runner, `production` environment
- [x] `.env.example` + secrets conventions (tunnel token, DB creds)

**Exit:** Hello-world Ergomatic reachable through the Cloudflare tunnel; a deliberately broken deploy rolls back automatically.

## Phase 2 — Auth

**Status:** Done
**Goal:** Multiple people can each sign in and get their own empty Ergomatic.

- [x] Google OAuth authorization-code flow (self-implemented or minimal library, no SaaS)
- [x] `users` table + Postgres-backed cookie sessions; session middleware; CSRF posture
- [x] Sign-in screen (design language: paper theme, serif titles)
- [x] Minimal **You** screen: signed-in identity + sign out
- [x] API auth guard: all data routes require a session, all data scoped to the user

**Exit:** Two different Google accounts see fully isolated data; deployed.

## Phase 3 — iOS app shell (Capacitor)

**Status:** Done
**Goal:** Ergomatic on household iPhones via internal TestFlight — same web code, native shell. (iOS-only for now by design; Capacitor keeps an Android target one `npx cap add android` away if ever wanted.)
**Research:** `docs/superpowers/research/2026-07-27-capacitor-vs-react-native.md` (Capacitor chosen 91:63 over React Native — full UI reuse, BLE plugin mirrors Web Bluetooth, solo-dev economics).

- [x] Capacitor project in `app/` (iOS target; bundled local assets, NOT remote-URL mode)
- [x] Native auth path: system-browser Google sign-in → `serverAuthCode` → new Express exchange endpoint → bearer session token stored in iOS Keychain (cookie flow untouched for web)
- [x] `requireUser` accepts cookie OR `Authorization: Bearer` (bearer requests skip the Origin check — no ambient credential, no CSRF)
- [x] Keep-awake during live timer (WKWebView suspends JS when locked/backgrounded)
- [x] Build/upload runbook: Xcode archive → internal TestFlight (no App Review; 90-day re-upload cadence documented)
- [x] Apple Developer account prerequisites documented

**Exit:** James signs in and logs a workout in the TestFlight build on an iPhone; web app behavior unchanged.

## Phase 4 — Domain engine & schema

**Status:** Done
**Goal:** The Erg Book math, encoded once, pure, and heavily tested.

- [x] Drizzle schema + migrations: baselines, workouts + steps, session logs (with frozen paces), plan progress, preferences, test history — all per-user _(migration infrastructure + users/sessions landed in Phase 2; this item adds the domain tables)_
- [x] Pure domain module (no framework imports): pace resolution (`baseline + off + nudge`), tolerance ranges, `m:ss` formatting, phase expansion (`liveSteps()`/`phases()` incl. reps and rest insertion), pace-ref parser (`^(2k|6k)\s*([+-]?\d+(\.\d+)?)?$`), plan preset sequences (sprint / head race, 84 sessions, test placements), suggestion engine (`plan[doneN]` → filtered/sorted pool)
- [x] **Distance-based work steps as a first-class axis**: a work step is `{kind:'time', minutes}` OR `{kind:'distance', meters}` (e.g. `2500m at 2k-4`); displayed workout duration estimates distance steps from the resolved target pace (labeled estimate); schema's log steps carry per-step actuals from day one: `{targetSplit, actualSplit?, actualSource: 'assumed'|'stopwatch'|'pm5'}` (expand-only discipline: model now, never migrate later)
- [x] Heaviest unit-test coverage in the app; canonical fixtures (e.g. Lucky Penny → 25 phases / 50 min)
- [x] Scales per the differentiation spec: `pain: 1..5`, `difficulty: 'easy'|'medium'|'hard'` (see docs/design/DEVIATIONS.md)
- [x] **Original starter library** (~35 workouts, original names, all types × difficulties × time bands, time AND distance steps) authored as reviewable data, James-approved, seeded per-user at account creation; replaces the book-derived dev samples entirely

**Exit:** Every formula and behavior in the handoff's "Domain model" section has a passing test; integration tests prove per-user round-trips through Postgres.

## Phase 5A — Library & baselines

**Status:** Done (2026-07-29, PR #22)
**Goal:** Enter real baselines and start transcribing The Erg Book.

- [x] Design-token CSS foundation (paper palette, Newsreader/Archivo/IBM Plex Mono, 2 px radii, spacing scale) + bottom tab shell — fonts self-hosted via @fontsource (offline-capable native shell, no CDN)
- [x] Library screen: rows with **5-segment** pain bars, filter chips (type single-select toggle, duration multi-select union, `PAIN ≤3`, RECENT/NOT RECENT exclusivity, ALL clears); chips read EASY/MEDIUM/HARD; library counter is a plain count (no /375)
- [x] Workout detail: resolved ranges, ▲▼ per-step nudges (session-local, never persisted), derived duration
- [x] **You** — staged baseline editor (drafts, − = faster, 0.5 s steps, Discard/Apply confirm block)
- [x] App icon; iOS safe areas (`viewport-fit=cover` + `env(safe-area-inset-*)`) so the UI clears the notch and home indicator
- [x] `GET /api/workouts` gains `lastDoneDaysAgo` (additive; reuses the existing grouped query — no N+1)

**Exit:** Pace resolution verified end to end against real baselines and deployed. The literal `6k -2 @ 22 SPM` case moved to 5B — it needs the Builder, since no seeded workout carries a negative 6k offset.

## Phase 5B — Builder & bulk import

**Status:** Done (2026-07-30, PR #23)
**Goal:** Add new workouts to the library from the app instead of hand-editing seed data.

- [x] Builder: type/difficulty/pain pickers, step rows with live resolved splits, repeat block, totals, bulk-import paste; DUR field takes minutes OR meters (`10'` vs `2500m`, explicit unit) in rows and bulk import
- [x] 1–5 pain picker with SVG faces + numerals on a measured green→red ramp — shared component, reused by Phase 6's log screen
- [x] Three row kinds authorable (`+ WARM-UP` / `+ ADD ROW` / `+ REST`); SET cell chooses where the repeat block starts (see docs/design/DEVIATIONS.md — the handoff's per-row model can't round-trip through the domain's single marker)
- [x] Edit + delete personal workouts; globals stay read-only and refuse a hand-typed edit URL

**Exit:** MET — a workout authored as `6k -2 @ 22 SPM` saves, appears in the Library, and resolves to `1:59.0–2:01.0` from real baselines, identically to the seeded workouts.

**Follow-ups recorded at merge:** three of the six were overtaken by the
5C–5F builder rebuild and the bulk-import screen (the DUR field's width,
the `×N` stepper's stale value, the missing bulk/edit design sweeps). The
three still true — the transaction-less bulk endpoint, the partial-import
re-submit it causes, and the missing unsaved-changes guard — are in
Phase CL.

## Phase 5C — Builder refinements & the number retirement

**Status:** Done (2026-07-30, PR #25)
**Goal:** Close the issues device testing exposed, and settle how workout identity works at scale.

- [x] Structured pace-ref control (2K/6K select + offset stepper) replaces the free-text field that rejected `8k` with an inline error
- [x] Bare minutes accepted everywhere — `5` no longer needs the apostrophe a phone keyboard buries (rows and bulk grammar both)
- [x] On-theme name generator (🎲) for the creatively impaired
- [x] Bulk import moved off the single-entry form onto its own screen
- [x] Save focuses the first invalid field instead of failing silently below the fold
- [x] **Workout `num` retired for `sort_order` + `created_at`** — one table with a nullable `user_id`, not a second table for customs: `session_logs.workout_id` carries an FK with `ON DELETE SET NULL`, and splitting the table would force a polymorphic reference the database cannot enforce (SQL Antipatterns ch. 7). `sortOrder` is server-assigned; the client cannot set it
- [x] Double-seed protection preserved through the unique-index removal via `pg_advisory_xact_lock`

**Exit:** MET. `DROP COLUMN num` is deliberately deferred to Phase 6 as two releases (see below).

## Phase 5D — Builder simplification from device feedback

**Status:** Done (2026-07-30, PR #26)
**Goal:** Make the row authorable with a thumb, on a phone, without instructions.

- [x] Repeat is implicit — every step but the warm-up repeats, set once at the bottom; the per-row `SET` cell (a bare ↻ nobody could identify) is gone
- [x] Explicit clone button per row: how you build `5×1′`
- [x] Duration takes a number plus a MIN/M unit toggle; rest gained the same treatment and stays minutes-only (rest carries no pace, so metres could never convert to time)
- [x] SPM stays optional, with 44px steppers either side that wake at 20 from empty
- [x] Selected states read as filled, not outlined — the red outline was easy to miss and caused frustration taps
- [x] Warm-up comes from preferences and is never authored into a workout; a `BOOKEND_ROW_KINDS` seam is left for cooldowns
- [x] `hasMidSpanReps` refuses to open workouts whose stored repeat marker the row model cannot place, rather than silently relocating it (a `[w 10', reps 3, w 2']` workout re-saved as 36 min instead of 16)
- [x] Column header strip removed once the row went multi-line; per-field affixes label the controls instead

**Exit:** MET.

## Phase 5E — Builder redesign: the accordion

**Status:** Done (2026-07-31, PR #27)
**Goal:** Take the vertical cost out of the builder — the screen held two steps at a time.

**Design authority:** `docs/design/builder-redesign/` (supersedes `docs/design/README.md` §11).

- [x] Accordion step cards: at most one expanded (`editing: string | null`), collapsed cards ~86px with a one-line summary
- [x] Classification card consolidates type / difficulty / pain; pain is numerals plus a level word (the faces are gone)
- [x] Shared `Stepper` behind rest, SPM, reps and pace offset
- [x] AUTO NAME, REPEAT ALL STEPS, the TARGET strip, and confirm-before-delete
- [x] Safe-area insets survive the builder screen's own `.screen` override — `design.spec.ts` now asserts it

**Exit:** MET — deployed and verified at `v0.1.0-137-gedbda77`.

## Phase 5F — Builder entry

**Status:** Done (2026-08-01, PR #TBD)
**Goal:** Close four device-use reports about the builder's entry
affordances — none of them domain redesigns, all of them a thumb on a phone
unable to do something it should be able to do.

- [x] `domain/duration.ts`: one duration grammar and one `m:ss` formatter
      (`fmtDuration`/`fmtDurationSpoken`/`parseClock`), replacing the
      byte-identical regexes `domain/bulk.ts` and `builderState.ts` used to
      keep in lockstep by hand
- [x] Duration validation widens from half-steps to any whole second
      (`wholeSecond`, `domain/validate.ts`) — every previously-valid workout
      still validates; bulk import adopts the same shared grammar
- [x] `ClockInput`: a masked numeric-pad field that fills digits right to
      left into `ss`/`mm`/`hh`, so `0:30` (and any other sub-minute value)
      is typable on a phone keypad that has no `:`
- [x] The builder's DUR field speaks clock values end to end — typed,
      stored, and round-tripped through Save as `0:45`/`20:00`/`1:05:00`,
      not a bare decimal number of minutes
- [x] SPM and REST are typable again as well as steppable (`Stepper`'s
      optional `onValueChange`/`valueInput` props) — Phase 5E's bare-stepper
      SPM could walk down to FREE but never type past a few presses to reach
      a value; REST gets the same treatment via `ClockInput`
- [x] `+ ADD STEP` appends a blank work step and opens it for editing;
      `DUPLICATE` is now the only control that copies a row's values
- [x] The warm-up line moved above the step list, reading as an implicit
      step 0 — with honest 18px separation on both sides (Task 9: the
      negative margin Task 7 shipped first read as a caption of the STEPS
      header, not a step of its own)
- [x] Step-level durations render through the same `fmtDuration`/
      `fmtDurationSpoken` helpers outside the builder too (`StepRow`,
      `WorkoutRow`) — a 45 s step now reads `0:45` on the detail and
      library screens instead of `0.75′`
- [x] `.button-outline`'s color/text-decoration/`inline-flex` fix stops the
      workout detail screen's Edit link from falling through to the
      browser's default blue underline — as a side effect, `min-height: 44px`
      finally applies to that control for the first time (a plain inline
      `<a>` had been ignoring it; the tap-target sweep should have caught
      this earlier and didn't)
- [x] Empty, typable SPM/REST cells show a `placeholder` ("FREE"/"NONE")
      instead of reading as broken empty boxes — never the accessible name,
      styled at `--ink-4` (5.29:1 against `--surface`, clears the 4.5:1 AA
      requirement)
- [x] Structural e2e coverage for all of the above (`e2e/design.spec.ts`),
      a sub-minute step and a personal workout's Edit/Delete visible in the
      committed screenshots (`e2e/screenshots.spec.ts`)

**Locked decision:** the house time format (Locked decisions above) is now
the app-wide convention for any duration display, not a builder-only
affordance.

**Exit:** MET — all four device-use reports closed; the phase exit
criterion (a sub-minute duration typable, stored, and displayed as `0:45`
everywhere it appears) holds end to end.

## Phase 5G — MAX/MIN effort refs

**Status:** Done (2026-08-01, PR #TBD)
**Goal:** A workout can say "30 seconds max" or "20 minutes easy" — stored as
a real effort reference, not a stand-in offset.

**Design authority:** `docs/superpowers/specs/2026-08-01-phase-5g-effort-refs-design.md`.

- [x] `PaceRef` becomes a key-presence union (`SplitRef | EffortRef`,
      `isEffortRef`) — additive, every stored `{base, off}` ref stays valid
      and behaves byte-identically; one function (`estimationSplit`) owns
      turning an effort into a number for totals/filters, one function
      (`effortWord`) owns the `ALL OUT`/`EASY` display pair, and neither
      string appears anywhere else in the app
- [x] `checkRef`/validation/the bulk grammar all accept `max`/`min` with no
      offset (`max+2` fails parse and validation the same as before); bulk
      import reports per-line effort errors at the same precision as a bad
      split ref
- [x] `BuilderRow.refEffort` round-trips both arms through `toSteps`/
      `stepToRow`; a stored effort ref falling back to a split (e.g. an
      older client) resolves to `6k+0`, judged sane
- [x] The PACE control becomes a four-chip radiogroup (`2K | 6K | MAX |
MIN`) — checking an effort chip hides the offset stepper entirely
      (unmounted, not just visually hidden; efforts take no offset) and the
      TARGET strip shows the effort word instead of a resolved range
- [x] The detail screen (`StepRow`) renders an effort step as its word, with
      zero nudge buttons (a word has nothing to nudge) and no baseline
      dependency (an effort target resolves without one, unlike a split)
- [x] Seed audit: every one of the 35 starters' work steps checked by hand
      against `effort`-worthy phrasing in its own description; one changed
      (Microburst's 10×0:30 sprint, `2k−5` → `{effort:"max"}` — its own
      comment says "maximal short bursts", and `2k−5` was slower than an
      honest all-out), 42 kept, written up as an auditable table before the
      code changed
- [x] Mid-phase addition (James): the classification card's TYPE group
      shows a one-phrase summary word opposite its label, the same
      convention as EXPECTED PAIN's level word (`TYPE_WORDS`, `builderState.ts`)
      — AN "SPEED WORK", O2 "LOW & SLOW", AT "COMFORTABLY HARD", TR "HARD
      INTERVALS"; reuses the pain row's reserved-line-box fix so the word
      never shifts the chips below it
- [x] Structural e2e coverage for the whole feature (`e2e/builder.spec.ts`,
      `e2e/design.spec.ts` including a MAX-selected sweep — the
      hidden-stepper layout is its own state), and the builder/detail
      screenshots each carry a real `MAX`/`ALL OUT` step

**Exit:** MET — `0:30 max @ 32` authors, saves, and reopens showing `ALL
OUT` with no nudge controls, end to end.

## Phase 5H — Library custom badge/filter; the iOS callout fix

**Status:** Done (2026-08-01, PR #TBD)
**Goal:** A rower can tell their own authored workouts apart from the
starter library at a glance, and isolate them with a filter — plus close
out a device report that long-pressing a control on iOS popped the OS
text-selection callout instead of activating it.

- [x] A personal (non-global) workout's library row wears a `CUSTOM` badge
      on its second line (`WorkoutRow.tsx`); a `CUSTOM` filter chip
      (`FilterChips.tsx`) ANDs with every other filter exactly like `PAIN
≤3` — `ALL` clears it, and filtering to `CUSTOM` with no personal
      workouts renders a builder-link empty state instead of a bare "no
      matches" message
- [x] iOS device report (2026-08-01): long-pressing a button, chip,
      radiogroup option, workout row, or anchor-styled "button" popped
      Copy/Look Up/Translate instead of activating the control (WKWebView
      treats rendered text as selectable by default). One grouped
      `user-select: none` / `-webkit-touch-callout: none` rule in
      `index.css`'s reset block now covers every such control — see
      `docs/design/DEVIATIONS.md` for the exact selector list and what was
      deliberately left out
- [x] Typed fields stay selectable throughout: `input`/`textarea`, and
      specifically the `Stepper`/`ClockInput` value cells
      (`.stepper-value-input`, `.clock-input`), which share the
      `.stepper-value` class name with the non-editable span variant the
      callout fix does cover — the CSS selector is scoped to
      `span.stepper-value` for exactly this reason. Structural e2e coverage
      (`e2e/design.spec.ts`) asserts both directions: a chip/row/stepper-
      button/EDIT control computes `user-select: none`, and the Title field
      plus a typed SPM value computes something other than `none`
- [x] The library screenshot (`docs/screenshots/library.png`) shows a real
      custom workout wearing the badge, filtered via the `CUSTOM` chip

**Not verified here:** the callout's actual on-screen behaviour (Chromium
has no text-selection callout to reproduce or clear) — that's James's to
confirm on-device, post-merge, the same way every other WKWebView-only
behaviour in this app has been.

**Exit:** MET — the library can be filtered to exactly the rower's own
workouts, every row reads which ones those are without opening them, and
the callout-suppression rule ships with structural (computed-style) e2e
coverage plus the caveat above about what that coverage can't reach.

## Phase 6A — Today, Plan, and Confirm targets

**Status:** Done (2026-08-01, PR #TBD)
**Goal:** The app replaces paper up through the moment a rower sits down —
suggestion, plan management, and a per-run overlay — with the live timer and
logging deferred to 6B/6C.
**Design authority:** `docs/superpowers/specs/2026-08-01-phase-6a-today-confirm-design.md`.

- [x] **`num` column retirement, two separate releases, shipped ahead of the
      rest of this phase**: (a) PR #33 removed `num` from
      `app/server/db/schema.ts` with no migration, deployed green; only then
      (b) PR #34 ran the `DROP COLUMN num` migration. Both merged and
      deployed 2026-08-01. Reason it had to split: Drizzle expands a schema
      into an explicit column list for every projection-less `db.select()`,
      so as long as `schema.ts` declared `num`, every plain workout query
      put it on the wire — a single release doing both would have left an
      unhealthy deploy's rollback selecting a column that no longer exists,
      turning a recoverable deploy into a dead site
- [x] Session draft contract (`app/src/session/draft.ts`): builds from a
      library workout or the day's suggestion, mutates via nudges/SPM
      overrides/step removal/reps count, round-trips through localStorage
      (`v:1`; an unknown version discards and clears rather than throwing);
      `suggestFreestyle` extends the suggestion engine to the whole library
      when no plan is active
- [x] Today (`/today`): plan-driven suggestion (today's plan code) or
      freestyle (no plan active); SHUFFLE cycles the filtered pool and
      persists the day's pick (`todayPick`); LAST THREE renders the three
      most recent logs as a date, the HELD/UNDER/OVER word, and the pain
      figure (`docs/design/README.md`'s own row format, at Ergomatic's 1–5
      pain scale — see `docs/design/DEVIATIONS.md`)
- [x] Plan (`/plan`): choose a preset (sprint/head — a single tap when no
      plan is active) or manage an active one; Reset and Switch are both
      staged-confirm (same idiom as the baseline editor / workout delete)
      and name the exact consequence; the full 84-session sequence renders
      with done/today/upcoming status, scrolling in its own keyboard-
      focusable region rather than growing the page. This is the "TRAINING
      PLAN" management slice of the handoff's **You** screen (§10) and the
      preset-selection half of Phase 8's own "Plan management" line,
      delivered here instead because Today needed it; Phase 8 still owns
      the month-calendar view and the ALL/TO DO/DONE filters
- [x] Confirm targets (`/session/confirm`): duration/rest steppers (30 s
      grid; a distance step's own duration steps by 100 m instead), an SPM
      stepper per work step (18–32, wakes at 20 — new relative to the
      handoff, which has no per-step SPM control here at all), a rep-count
      stepper, per-step remove/restore (deliberately **not** offered on the
      reps marker itself — removing it would silently reshape a repeated
      workout with no visible cause, so the marker's own rep stepper is the
      only way to change its effect), pace nudges (skipped for an
      effort-ref step), and a live minute recount; START stamps `startedAt`
      and hands off to the 6B placeholder
- [x] `/session/run` placeholder proves the draft round-trips through
      localStorage across a real reload; 6B replaces it with the live timer
- [x] Structural design coverage (`e2e/design.spec.ts`) for all three
      screens against real data (a plan active, logs present, an effort
      step and a struck row on Confirm) caught and fixed two real
      accessibility defects the phase's own client tests never rendered:
      the active Plan's 84-row scroll region had no keyboard focus stop
      (axe `scrollable-region-focusable`), and a struck Confirm row's
      DUR/SPM/REPS label dropped to 4.48:1 against the removed-row
      background (just under WCAG AA's 4.5:1)

**Exit:** MET — the confirm round trip (Start → adjust duration/SPM/nudge/
remove → START → reload) shows the same draft; a plan-less rower still gets
a suggestion and can start a plan from the same screen the timer will
eventually launch from.

## Phase 6B — Live timer

**Status:** Done (2026-08-02, PR #TBD)
**Goal:** A confirmed session runs itself, start to finish, with nothing but
a phone against the erg.
**Design authority:** `docs/superpowers/specs/2026-08-01-phase-6b-timer-design.md`.

- [x] Keep-awake adapter (`src/adapters/keepAwake.ts`): native
      `@capacitor-community/keep-awake` behind a lazy import, Screen Wake
      Lock API on web (best-effort, re-acquires on `visibilitychange`); on
      for the whole countdown → timer → complete span, released on exit
- [x] Countdown (`/session/countdown`, configurable via
      `preferences.countdownSeconds`, skippable, 0 = off): builds and saves
      the `SessionRun` on mount (not at zero) so the timer starts with no
      setup lag; CANCEL un-starts the draft coherently (`draft.ts`'s
      `cancelStart`); wall-clock countdown, not an accumulated tick
- [x] Live timer (`/session/run`, replacing 6A's placeholder): portrait —
      dots, STEP line, 96px numeral (count-down for a timed phase, count-UP
      stopwatch for a distance phase), phase progress bar, TARGET SPLIT/RATE
      cards, UP NEXT, TOTAL LEFT + ruler, ◀ / Pause / ▶ (or NEXT → on a
      distance phase); landscape at 844×420 reflows to the handoff's own
      two-column layout (128px numeral, an added "then …" UP NEXT line);
      warm-up/rest/test phases and effort-ref targets show "Easy"/"Rest"/
      "ALL OUT" (never a bare dash, never the numeric estimate behind an
      effort ref); tabs hidden on every session route
- [x] Distance phases (manual mode, works on every device forever): target
      meters folded into the STEP line, resolved range or effort word, a
      count-UP stopwatch, "NEXT →"; elapsed time yields the actual average
      split with zero hardware, logged as `actualSource:'stopwatch'`. A
      split more than 2× or under half the domain-estimated duration stages
      a Keep/Discard choice instead of recording silently (a long suspend,
      or NEXT mis-tapped moments after starting a piece)
- [x] Staged confirms (BaselineEditor's idiom, never a modal): END abandons
      the whole session (nothing saved); ▶ or NEXT on the last phase stages
      "Finish this session?" (completion is a documented one-way door); the
      suspect-actual choice above. Baselines are required to START — an
      unset pair blocks at the existing no-target/`/you` idiom rather than
      building a run against a dummy pair
- [x] Session complete (`/session/complete`, new — not in the original
      handoff, which reserves the richer post-workout review for 6C):
      TOTAL wall-clock time, every recorded distance actual, Back to Today.
      Deliberately does not clear the draft or run record — 6C's own
      log-writing screen still needs them
- [x] Today's stale-discard rule amended: a completed-but-unlogged run now
      protects its draft from the 24h staleness sweep, so finishing a
      session and leaving without logging it doesn't silently lose the
      record before 6C can write it
- [x] Timer resilience: reload mid-phase restores the correct remaining
      time (wall-clock reconstruction, never accumulated ticks); reload
      while paused restores frozen, not still-counting; a `visibilitychange`
      catch-up walk fires the instant a locked screen wakes, multi-phase if
      the suspend spanned several timed phases; an unknown/malformed
      persisted run clears and redirects rather than throwing
- [x] Structural design coverage (`e2e/design.spec.ts`) and screenshots
      (`countdown.png`, `timer.png`, `timer-landscape.png`,
      `session-complete.png`) for every session screen against real,
      non-empty workouts — a timed phase, a distance phase, an effort
      target, the landscape frame, and each staged confirm swept
      individually — caught and fixed a real defect: `.countdown-screen`
      and `.session-complete-screen` shared `.timer-screen`'s pre-fix
      landscape `min-height` formula and carried the identical 18px of dead
      vertical scroll at 844×420, invisible in portrait's taller frame

**On-device checks (James, post-merge):** lock-screen tick survival,
keep-awake actually holding the screen on, and app-kill/resume — Chromium
cannot prove any of these; the design spec's own Testing section says so.

**Exit:** MET — a seeded workout runs end to end (countdown → every phase
kind → complete) with per-step stopwatch actuals for distance phases;
reload mid-phase and mid-pause both restore exactly; effort phases read
"ALL OUT"/"EASY", never a number, never a dash; all gates green, all three
screens' screenshots (plus the timer's landscape frame) opened and checked.
6C (log-writing screen, Held/Under/Over, pain, notes, `doneN` advance UI)
remains — the holder this phase leaves behind (an unlogged completed run)
is exactly what 6C's own save flow is for.

## Phase 6C — Log & completion

**Status:** Done (2026-08-02, PR #TBD)
**Goal:** A finished session becomes history the same day it happened.
**Design authority:** `docs/superpowers/specs/2026-08-02-phase-6c-log-session-design.md`.

- [x] `logDraft.ts`'s three pure builders (`buildLogSteps(run, draft)`,
      `buildManualLogSteps(workout, baselines)`, `logTotals(run)`): both
      doors' step labels compose through one shared `refPaceLabel`
      function, fed the draft's real, un-resolved `PaceRef` whenever a
      matching draft is on hand (session door) or the workout's own steps
      directly (manual door) — not the phase's already-resolved split —
      so a nudged/offset step reads identically either way
- [x] The Log screen, two doors sharing one `LogScreen` presentational
      component and one `useLogForm` save/retry hook: `/session/log` (the
      session door — the timer's own hand-off from `/session/complete`,
      and Today's unlogged line's real `Log it` link) and
      `/library/:id/log` (the manual door — WorkoutDetail's "Log it after",
      real once baselines are set, else the existing no-target/Set
      baselines idiom). Paces frozen at save ("PACES LOCKED AT …", showing
      only the base(s) the workout's own steps actually reference — never
      a bare dash, see `docs/design/DEVIATIONS.md`), the per-step list
      (frozen split + a stopwatch-only ACTUAL line), Held/Under/Over, pain
      **1–5** (Ergomatic's scale, not the handoff's 1–10), notes, `Save
session` (54px, pinned by a computed-style regression test). The
      session door hides the tab bar and offers a staged `Discard without
logging`; the manual door has neither — nothing staged to discard,
      so the tab bar stays visible there as the only way out
- [x] Save posts to the already-existing `POST /api/logs` route (no NEW
      route or store needed this phase — the one server change was Task
      1.5's same-day amendment loosening `validateLogStepEntry`,
      `server/routes/data.ts`, to make `targetSplit` optional and pair
      `actualSplit`/`actualSource`, once `logDraft.ts` proved the old
      validation predated effort refs; additive-only, so every previously-
      valid payload stays valid): a 201 clears the
      draft/run records (session door only — the manual door never reads
      or writes either) and returns to Today; a `workoutId`-specific 400
      retries once with `workoutId: null`; any other failure surfaces
      inline with retry, leaving both records intact
- [x] Full-loop e2e for both doors (Today → suggestion/Library → Confirm →
      Countdown SKIP → tiny timer session → complete → Log → Held + pain +
      notes → Save → Today), structural design coverage (both doors swept
      independently — visibly distinct chrome, not a re-sweep of shared
      markup — plus the staged-Discard panel open), and screenshots for
      both doors (`log-session.png`, `log-session-manual.png`)

**Note:** the server side of "save advances `doneN`" **already existed** —
`server/stores/logs.ts`'s `create` has bumped `plan_state.done_n` on every
`POST /api/logs` call since the Phase 4 schema work, so 6C's job was the
log-writing screen that calls the existing route, not new plumbing.

**Exit:** MET — **every arrow in the core loop closes**: Today → suggestion/
Library → Confirm → Countdown → Timer → complete → Log → Today, each hand-off
proved against the real compose stack (extending the existing loop specs
rather than adding a third parallel one) with the plan's session counter read
both before and after (advanced by exactly one) and Today's LAST THREE
showing the logged session dated today; a mid-workout reload survives (6B);
frozen log paces stay unchanged after a later baseline edit (reconstructed
from the draft's own frozen ref, not re-read live); the manual door proves
the same save path from a workout's own detail screen for an off-app row,
without ever touching the draft/run records an in-progress session elsewhere
might be using. One seam was left unspanned at close — no single browser
session ran the WHOLE card→log arc in one continuous test, each hand-off
was its own proof — and Phase 6D's `today.spec.ts` "the type-swap loop"
closed it, the one e2e in the repo that drives the whole arc in a single
page.

## Phase 6D — Today enhancements

**Status:** Done (2026-08-02, PR #TBD)
**Goal:** The suggestion's filters become visible and adjustable on Today, a
plan day can be rowed as a different type without abandoning the plan, and a
session can be logged without consuming a plan slot.
**Design authority:** `docs/superpowers/specs/2026-08-02-today-enhancements-design.md`,
plan: `docs/superpowers/plans/2026-08-02-today-enhancements.md`.

- [x] `suggest.ts`/`suggestFreestyle` learn a `painMax3` filter and a
      capless (`timeCapMinutes: null`) cap, on top of the existing
      difficulty/cap filters; `buildReason` names only the dimensions it
      actually checked (a capless or `durationsUnknown` cap drops the "…
      within your N min cap" clause instead of asserting something never
      verified, the same discipline `durationsUnknown` already established)
- [x] `todayOverrides.ts`: an ephemeral, `localStorage`-only record keyed
      `{date, planKey, doneN}` (the same invalidation contract as
      `todayPick.ts`'s own pick) layered on the server's `SuggestPrefs`
      without ever writing back to them. Today (`/today`) gains two chip
      rows: EASY/MEDIUM/HARD (multi) · `≤30′ ≤45′ ≤60′ ≤90′ NO CAP`
      (single-select cap) · `PAIN ≤3` (toggle) in both plan and freestyle
      modes, plus AN/O2/AT/TR type-swap chips (plan mode only) that
      override the day's prescribed type before `suggest()` runs — the
      plan line reads `SESSION 5 OF 84 · O2` unswapped, `… · O2 → AT`
      swapped. A session logged since (the `doneN` bump) invalidates the
      stored record and the swap/filters reset to the preference-derived
      default
- [x] `advancesPlan`: an additive, optional boolean on `POST /api/logs`
      (default `true` ≡ every prior caller's behavior byte-for-byte),
      gating only the `plan_state` upsert inside `logs.ts`'s `create`
      transaction — the log row itself always inserts regardless. The Log
      screen gains a single toggle row (both doors, only when a plan is
      active): `COUNTS TOWARD PLAN · SESSION {n} OF {total}` untapped,
      `OUTSIDE THE PLAN — won't advance` tapped — a genuine make-up session
      or a second same-day log can now be recorded without silently eating
      a plan slot meant for one real session
- [x] Full-flow e2e for all four shapes (visible filters actually narrowing
      the card, the swap loop through a real Start → SKIP → complete →
      Log → Save round trip with the swap's own reset proved afterward, the
      outside-plan toggle proving the counter stays put, and a freestyle
      spot-check that the type chips genuinely don't render without a
      plan), plus structural design coverage: the chip row's default
      aria-pressed state, the swap arrow appearing/clearing, and — closing
      a gap Task 3's own review flagged — the Log screen's plan toggle
      measured and axed in BOTH states for the first time, since no earlier
      screenshot or design sweep had ever activated a plan on that screen

**Exit:** MET — a rower can narrow today's suggestion live from the Today
screen itself, row a plan day as a different type without losing plan
progress (the swap resets cleanly once that session is logged), and log a
genuine off-plan or make-up session without moving the plan's counter.

## Phase 6E — Workout library generation

**Status:** Done (2026-08-03, PR #TBD)
**Goal:** Replace the 35-workout starter library with ~300 original workouts,
structurally derived (never verbatim) from James's Erg Book photos, so
TestFlight testers have realistic content instead of a small, well-worn set.
**Design authority:** `docs/superpowers/specs/2026-08-03-workout-generation-design.md`,
plan: `docs/superpowers/plans/2026-08-03-workout-generation.md`.

- [x] Offline five-stage pipeline: double-read vision extraction of the book
      photos → private `originals.json` and a personal originals CSV on
      James's Desktop (neither enters the repo) → a repo-safe aggregate
      pattern digest (`app/domain/generation/patterns.json` — per type×duration
      cell: interval-shape frequencies, work:rest ratio ranges, pace-offset
      distributions per base, spm bands, warm-up conventions, rep-count
      ranges; aggregate statistics only, no titles/prose/per-workout rows)
      → grid-constrained authoring by subagents → a permanent validation
      gate split across two layers: domain `validate.ts` for base workout
      validity, and `app/server/seed/library/library.test.ts` for the
      spm/pain-plausibility bands, structural dedup, easy→hard ordering,
      and the exact quota grid
- [x] Exact quota grid, 300 total: O2 90 / AT 75 / TR 75 / AN 60 across five
      duration bands (<20′ 30, 20–30′ 75, 30–45′ 120, 45–60′ 45, 60′+ 30); a
      ~320-name weather/atmospheric pool allocated per cell so authoring
      agents can't collide; an offline no-structure+parameter-clone check
      against the private originals (can't live in CI — it needs book
      content — so it ran once during the phase and its result is recorded
      in the PR)
- [x] `STARTER_WORKOUTS`/`server/seed/starter.ts` retired entirely;
      `server/seed/library/{o2,at,tr,an}.ts` hold the 300 as original
      content, `sortOrder` grouped by type then easy→hard (the same
      browsing order the 35-workout library used). `seedGlobalLibrary`
      (`server/seed/seed.ts`) converges the shared global library to the
      code's set, keyed by title, inside one advisory-locked transaction:
      content changed → update the existing row in place (its id, and any
      session-log's link to it, survive); title missing → insert; title
      removed → delete (`session_logs.workout_id` nulls via
      `ON DELETE SET NULL` for those rows only); identical state writes
      nothing — called once at boot, not per-user. (2026-08-04,
      library-converge: superseded this bullet's original title-set swap,
      whose gap was that a content-only edit to an already-deployed title
      never reached the running set until the title itself changed. The
      converge closes that — content edits now reach a deployed volume on
      the next boot alone, no reseed dance required — and logs keep their
      workout link across a content edit; only an actual rename or removal
      still nulls it.) Personal (non-global) workouts are structurally
      untouched: globals are structurally un-editable by users (the store's
      `update()`/`remove()` only ever match rows scoped to a `userId`, never
      `user_id IS NULL`)
- [x] Fixtures across the client/server test suites re-anchored from the
      retired 35-workout set to real entries in the 300 (e.g. "Fork
      Lightning" for the effort-ref `0:30 @ MAX` shape, "Hoarfrost" for the
      warm-up-then-split-ref shape, "Filling Low" for the reps-expanded
      distance shape, "Sea Fret" for the first-sorted global)

**Exit:** MET — new and existing accounts alike see the same generated
300-workout global library; the seed converge is idempotent (an unchanged
set no-ops on a second boot), a content-only edit to an existing title
reaches the running set on the next boot without any title change, and a
title rename/removal still converges cleanly; personal workouts and their
logs are structurally unaffected either way.

## Phase 6F — UI-fix round

**Status:** Done (2026-08-04)
**Goal:** One button vocabulary instead of two competing ones, exact
resolved targets everywhere a tolerance band used to show, one voice for
"discard without logging" across every surface that can strand an unlogged
session, a Library filter model that scales past nine flat chips, and one
pain scale on Today matching the Library's own.
**Design authority:** `docs/design/handoffs/2026-08-03-ui-fix/DESIGN.md`
(the round's own handoff, now historical record — `docs/design/README.md`
carries the button table and accent-meanings list forward as standing
authority; `docs/design/DEVIATIONS.md` records every deviation this round
added or superseded).

- [x] **Task 1 — the button system**: five levels (`.button-l1`–`.button-l4`/
      `.button-l4-armed`, `index.css`), replacing the two-idiom
      `.button-primary`/`.button-outline` vocabulary on every screen this
      round touched; selected-state color fixed app-wide (type chips fill
      their own type color everywhere, every other selection fills `--ink`,
      accent means exactly four things); SHUFFLE re-cut to chip geometry;
      `--type-tr` de-aliased from `--accent` (fix round 1)
- [x] **Task 2 — exact targets**: every tolerance-band display
      (`2:21.0–2:23.0`) becomes the single resolved split, on Detail,
      Builder's TARGET row, Confirm, and the Timer's UP NEXT/sub-line (the
      sub-line shows the ref instead, e.g. `6K +16`); `toleranceRange()`
      itself untouched in the domain
- [x] **Task 3 — discard, one voice**: `Discard without logging` →
      `Tap again to discard`, staged identically on Session complete (new
      level-4 block), Today's unlogged row (a 44×44 accent-outlined ✕ that
      swaps the row's own contents in place), and the Log screen's existing
      staged Discard
- [x] **Task 4 — the Library's second pass**: the eleven-chip ragged wrap
      and the `ALL` chip retired for one `FILTER ⌄` chip plus a plain count;
      a sheet (`FilterSheet.tsx`) groups TYPE/TIME/PAIN (4/4/5-cell grids)
      and LAST DONE/SOURCE (2-cell grids sharing a line) by their actual
      selection semantics; active filters render back as a token row
      (`filterTokens.ts`, one token per group, range/list collapsing) with
      per-token `✕` and a `CLEAR ALL`; PAIN becomes five 1–5 cells,
      multi-select union, replacing the single `≤3`/`≤5` threshold chip
- [x] **Task 5 — one pain model**: Today's own PAIN filter becomes the same
      five-cell multi-select union as the Library's, replacing the old
      single toggle — the two screens now share one pain-filtering idiom
- [x] **Task 6 — close-out**: remaining sweeps (armed-state contrast,
      Library-with-sheet and Today's five-cell PAIN group both re-verified
      under axe), every touched screen's screenshots re-captured fresh at
      HEAD, an end-to-end `DEVIATIONS.md` pass (the design's own five
      mandated rows plus the Library second pass's own — pain union, LAST
      DONE naming, SOURCE naming, count copy, the FILTER-sheet pattern
      itself — all verified truthful against shipped code, several stale
      citations found and corrected), the button table and accent-meanings
      list graduated into `docs/design/README.md` as standing authority,
      this ROADMAP entry

**Exit:** MET — one button vocabulary, one pain model, one discard voice,
and a Library filter model that scales; `docs/design/DEVIATIONS.md` and
`docs/design/README.md` both read true against the shipped app; full e2e
green ×2 back-to-back plus unit/client/integration.

## Phase 6G — Today's collapsible filter

**Status:** Done (2026-08-04)
**Goal:** Today's three always-on DIFFICULTY/TIME/PAIN chip groups collapse
into the same `FILTER ⌄` + sheet + tokens pattern the Library got in Phase
6F, backed by Today's own unchanged state — the type-swap chips stay on the
plan line, untouched.
**Design authority:** `docs/superpowers/specs/2026-08-04-today-filter-sheet-design.md`,
plan: `docs/superpowers/plans/2026-08-04-today-filter-sheet.md`.

- [x] **Task 1 — extract the shared primitives**: `SheetShell.tsx`
      (backdrop, dialog semantics, focus trap + restore-to-opener),
      `CellGrid.tsx` (one labelled, `role="group"` cell grid), and
      `TokenRow.tsx` (the removable-token strip) lifted whole out of the
      Library's own `FilterSheet.tsx`/`Library.tsx` — a structural no-op:
      the Library's existing `FilterSheet.test.tsx`/`Library.test.tsx`
      assertions pass unmodified, proving the re-composition changed
      nothing about the Library's own behaviour
- [x] **Task 2 — Today's sheet, tokens, and rewiring**: `TodayFilterSheet.tsx`
      (the three primitives above, DIFFICULTY/TIME/PAIN CellGrids, no TYPE
      group) and `todayFilterTokens.ts` (one token per group deviating from
      the day's pref-derived defaults) replace the three inline chip rows;
      `Today.tsx` gains a `FILTER ⌄` chip beside `SHUFFLE ↻` and a
      live-counting `Show N options` primary computed against the sheet's
      own in-progress draft. `todayOverrides` storage, `suggest()`, and the
      plan-line type-swap chips: byte-for-byte unchanged
- [x] **Task 3 — flows, captures, the record**: the round's five
      expected-red e2e/design sweeps re-routed through the sheet (a PAIN
      1+2 tap, the freestyle spot-check, the chip-row default-state sweep,
      the selected-fill-ink sweep, SHUFFLE-disabled's own setup); new
      coverage for CLEAR ALL restoring the day's defaults (never an empty
      pool — the deliberate divergence from the Library's own CLEAR ALL)
      and a single backdrop-tap-discards pin; axe/tap-target/ink-4 sweeps
      against the sheet open and closed-with-a-token; `today.png`/
      `today-sheet.png`/`today-filtered.png` recaptured; `DEVIATIONS.md`'s
      Today filter row rewritten for the sheet plus a new CLEAR ALL row;
      `README.md` §1 gains a one-sentence pointer at the current pattern

**Exit:** MET — Today reads identically to the Library at rest (one
`FILTER ⌄` chip, a plain suggestion card, tokens only when something
deviates); full e2e green ×2 back-to-back plus unit/client/integration;
zero storage or `suggest()` changes, so every existing `todayOverrides`
record on a real device stays valid with no migration.

## Phase 6H — News tab core

**Status:** Done (2026-08-07, PR #54)
**Goal:** A reading and orientation surface — News replaces Trend in the
tab bar, holds pinned explainers plus a rolling latest feed plus release
notes, and remembers what a rower has read across a reload and a second
device.
**Design authority:** `docs/design/handoffs/2026-08-07-news-tab/README.md`
(decisions 1–5 and 8 — News itself and the five-tab bar; decisions 6, 7,
and 9 — Today onboarding and You/Trend — are Phase 6I/6J's own, not this
phase's).

- [x] **Task 1 — `article_reads`**: the table (`user_id`, `slug`,
      `read_at`), its migration, and `ArticleReadsStore.{list,markRead}` —
      `markRead` idempotent-forever (`onConflictDoNothing`), no
      unread/delete route by design
- [x] **Task 2 — the two routes**: `GET /api/article-reads` (the signed-in
      rower's own read slugs) and `PUT /api/article-reads/:slug` (mark one
      read), both additive and session-guarded
- [x] **Task 3 — the content**: the `NewsArticle`/`ReleaseNote` types, a
      four-article registry (workout types + baselines pinned; picking a
      workout + pain scale in LATEST) of original in-app prose, and
      `RELEASE_NOTES` seeded retroactively (v0.5.1/v0.5.0/v0.4.0)
- [x] **Task 4 — `useArticleReads`**: optimistic reads (a PUT's failure
      leaves the article unread on the next fetch rather than surfacing an
      error), suppressing read/unread claims entirely while loading or on a
      failed fetch rather than guessing
- [x] **Task 5 — the News screen and the tab swap**: `News.tsx` at `/news`
      (PINNED block, LATEST feed, WHAT'S NEW card), the tab bar becomes
      TODAY · NEWS · LIBRARY · PLAN · YOU with TREND gone, and the
      no-`.button-l1`-anywhere rule (accent reserved for the unread square
      and text links, never a START)
- [x] **Task 6 — the reader and release notes**: `Reader.tsx` at
      `/news/:slug` (marks read on mount, a NEXT-unread footer, `BackLink`),
      `Releases.tsx` at `/news/releases` listing every `RELEASE_NOTES` entry
- [x] **Task 7 — close-out**: `news.spec.ts` (tab order, the 4→3 UNREAD
      read-and-reload proof against the real server, the reader's NEXT
      footer, `/news/releases`), `design.spec.ts` sweeps (axe on all three
      screens against a mixed read state, 44px targets, the no-`.button-l1`
      rule, the read row's `--ink-3`/400-weight contrast measured at 6.69:1
      against `--page` and 7.43:1 against `--surface`, the unread/read
      square colours), `news.png`/`news-reader.png`, and this record

**Exit:** MET — a fresh account sees four articles and 4 UNREAD; reading
one survives a reload and a second device (the server round-trip, not an
in-memory hook); TREND is gone. Full e2e green ×2 back-to-back (227/227)
plus screenshots and unit/client/integration (2408 tests, 98%+ across all
four coverage metrics).

**Next:** Phase 6I (Today onboarding) and Phase 6J (Trend charts on You),
below — both deliberately not this phase's scope.

## Phase 6I — Today onboarding

**Status:** Done (2026-08-09, PR #63)
**Goal:** A brand-new rower with no baseline gets taught the app from
Today itself, not from a screen they have to find.
**Design authority:** `docs/design/handoffs/2026-08-07-news-tab/README.md`
decisions 6 and 7.

- [x] **Task 1 — the nullable domain**: `needsBaselines(steps)`
      (`domain/needsBaselines.ts`) — true unless every work step is an
      effort ref — the one predicate every coupled call site shares;
      `phases()`/`buildRun`/`estimateMinutes` accept `Baselines | null` and
      resolve an effort work phase with no `targetSplit`/no duration
      estimate rather than throwing
- [x] **Task 2 — every coupled guard site**: Confirm's footer guard,
      Countdown's own null-baselines redirect and `buildRun` call, Timer's
      `hasRemainingEstimate` (TOTAL LEFT and the phase bar hidden, never
      frozen at 0:00/0%, once no phase ahead has an estimate), and
      `logDraft.ts`'s 5G-drop-rule amendment — a measured (stopwatch)
      actual on an effort DISTANCE phase now survives into the saved log
      (`actualSource:"stopwatch"`, `targetSplit` still omitted); an assumed
      actual stays effort-gated
- [x] **Task 3 — server & seed**: `preferences.start_here_dismissed`
      (migration + `PUT /api/prefs`), `DELETE /api/article-reads/:slug`
      (idempotent, full store/contract-test stack including per-user
      isolation), and the two designated global workouts (`First 6k`/
      `First 2k`, `server/seed/library/onboarding.ts`) via their own
      `GLOBAL_LIBRARY_SEED` concatenation and gate, exempt from
      `library.test.ts`'s 300-workout quota grid
- [x] **Task 4 — hook purity & the start-guard extraction**:
      `useArticleReads.ts`'s `has(slug)`+PUT hoisted out of the `setState`
      updater (StrictMode double-fire purity), `markUnread` alongside
      `markRead`, and `useStartWorkout.ts` — WorkoutDetail's own
      unlogged-run/live-MonitorRun staged-confirm start flow extracted so a
      second caller (the no-baseline card) gets the identical guard, never
      a bare navigate-and-start
- [x] **Task 5 — the block and the card**: `StartHere.tsx` (the
      dismissible `START HERE · N OF 4 READ` block, immediate DISMISS, no
      layout reservation once gone) and `BaselineCard.tsx` (the no-baseline
      `SUGGESTED · SETS YOUR BASELINE` card — both-null defaults to the 6k
      with `2K INSTEAD`, exactly-one-null offers only the missing distance
      with no toggle) replacing the entire plan/suggestion apparatus in
      `Today.tsx` while either baseline is missing; the designated
      workouts' own Log screen defaults the plan toggle to outside the plan
- [x] **Task 6 — the two new articles**: `your-first-row` and
      `connect-the-monitor` (`src/news/content/`), original prose,
      fact-checked against 7B's shipped Connect UI, 216/217 words ->
      2 min each by the house formula
- [x] **Task 7 — You, News, and the pin**: `You.tsx`'s `Learning the app`
      settings row (the phase's one real settings row — the mock's others
      stay unbuilt, per DEVIATIONS), `LearningTheApp.tsx` at
      `/you/learning` (`PUT IT BACK ON TODAY`, `MARK ALL FOUR UNREAD` —
      staged, un-reads all four slugs and clears the dismissed flag in one
      tap), and News's own `Start-here` pinned row, visible only while
      dismissed
- [x] **Task 8 — proof, pixels, record**: `e2e/onboarding.spec.ts` — the
      whole fresh-user arc against the real stack (block+card -> a
      cross-surface read from News advancing the count -> the card's own
      START through a real Confirm/Countdown/Timer/Complete/Log/Save loop
      run with null baselines -> the either-null card swap -> the
      apparatus returning once both baselines are set -> DISMISS -> the
      News pin -> `/you/learning`'s PUT IT BACK and MARK ALL FOUR UNREAD
      round-trip, un-reading and un-dismissing and raising News's own
      unread count back), plus the designated-workout exclusion pins
      (SHUFFLE never surfaces `First 6k`/`First 2k` to a baselines-set
      veteran; Library's list omits both). Folded in: the deferred
      `ManualDoorLog` fix (Task 2's ledger item) — the manual door's
      `baselines === null` block now gates on `needsBaselines(steps)`
      instead, so an effort-only workout (the two designated workouts, and
      every shipped effort-only AN sprint) opens the Log screen with null
      baselines rather than the "no target" block a split-ref workout still
      correctly hits. Design sweeps (axe, 44px, contrast — the dashed chip
      measured at 7.432:1) on Today's fresh-user state, `/you/learning`,
      and News-with-pin; `today-onboarding.png` (new) plus `you-learning.png`
      and `news.png` recaptured. Full e2e green ×2 back-to-back (255/255)
      plus unit/client/integration, 98%+ across all four coverage metrics

**Sequencing constraint:** landed after Phase 7B's own `Today.tsx`
guard-wiring touch, as planned; rebased onto `origin/main` immediately
before the PR, clean.

**Exit:** MET — a fresh account with no baseline is walked to a set
baseline without ever leaving Today, using a real effort-only session run
with null baselines end to end (proof, not just unit coverage); dismissing
and resetting the tutorial from You round-trips correctly, including its
cross-surface consequences on News; a baselines-set veteran never sees
either designated workout suggested or listed.

**Next:** Phase 6J (Trend charts on You), below. Also unblocked: the
auto-capture follow-on under "Triggered follow-ons."

## Phase 6J — Trend charts on You

**Status:** Not started
**Goal:** A rower can see whether they're getting faster, on You, where
Trend now lives instead of its own tab.
**Design authority:** `docs/design/handoffs/2026-08-07-news-tab/README.md`
decision 9 — a sketch of the fold, not a chart spec (its own open question
#1: "the three Trend charts need real ranges, bucketing and empty states").
Needs its own chart-spec design pass before implementation starts.

- [ ] A `TREND` heading at the top of You, above baselines
- [ ] Metres per week — eight bars, current week in ink, others in `--rule-3`
- [ ] O2 pace per session — a line against a dashed 6k target, the latest
      session dotted in accent, a delta callout in O2 teal
- [ ] Time by type — a single stacked bar in the workout-type colours with
      a percentage legend

**Amends Phase 8:** Phase 8's own Progress-screen bullet (2k/6k test-trend
bars, minutes/week stacked by type, type mix/last-30-days — currently one
bullet covering all three chart groups) relocates onto You under this
phase instead of shipping as its own screen, and is superseded once this
phase starts. Phase 8's month-calendar bullet (on Plan, not Progress) and
its test-history-list bullet (on You already) are untouched.

**Exit:** A rower with at least two sessions of history sees real metres,
pace, and type-mix trends on You, with an honest empty state below two
sessions — not sample data.

## Phase 7A — Monitor domain (the domain beneath the screens)

**Status:** Done (2026-08-05; merged 2026-08-06 as PR #52, carrying
7A-fix-2 below with it).
**Goal:** The PM5's protocol, a workout compiler, a runtime driver, and the
localStorage-side session record all exist and are heavily tested — no
screen changes (deliberately deferred to 7B).
**Design authority:** `docs/superpowers/specs/2026-08-05-phase-7a-monitor-domain-design.md`,
plan: `docs/superpowers/plans/2026-08-05-phase-7a-monitor-domain.md`.
**Supersedes:** the single-phase "PM5 over Bluetooth" sketch this section
used to be (`ergarcade/pm5-base`/plain-Rowing-Service/no-CSAFE) — superseded
by CSAFE variable-interval programming, the design this phase actually
implements. `docs/superpowers/research/2026-07-27-pm5-ble-research.md`
still holds: no pairing, subscribe-only, Web Bluetooth is Chromium-only.

- [x] `domain/monitor/pm5/`: the CSAFE frame codec (checksum, chunk,
      reassemble), the programming-command byte layouts (`commands.ts`),
      the five BLE status-characteristic decoders (`parse.ts`), and the
      CSAFE ack/reject response parser (`response.ts`); every byte cited
      against the primary CSAFE/BLE PDFs, with three checksum errata and
      one unresolved candidate documented in
      `docs/monitor/pm5-interface-notes.md` rather than guessed
- [x] `domain/monitor/program.ts`: `compileProgram`, turning a confirmed
      session's phases into the PM5's variable-interval IR
      (`WorkoutProgram`/`ProgramInterval`) or a typed, copy-ready
      `CompileError`; Table 19's parameter limits re-verified against the
      primary PDF
- [x] `domain/monitor/types.ts`: the normalized seam every consumer above
      the codec sees (`MonitorCapabilities`/`MonitorFrame`/`IntervalActual`/
      `MonitorEvent`/`MonitorDriver`), plus the `Transport`/
      `DiscoveredMonitor` radio abstraction three later transports satisfy
- [x] `src/monitor/driver.ts`: the runtime driver, with ack-gated write
      sequencing over a pending-ack queue for coalesced BLE notifications,
      a state machine with terminal-state latching (Appendix E's auto-cycle
      never un-finishes a session), an optional tick-driven ack-timeout
      policy, and `intervalRemaining`/`intervalAccrued` reading 0x0031's own
      per-interval Elapsed Time/Distance pair directly (CR2 spec 2a Task 6
      deleted an earlier 0x0033 Last Split checkpoint subtraction the
      inversion result falsified — interface-notes.md §20 items 17/24);
      `src/monitor/transports/fake.ts` simulates a real PM5 end to end for
      CI (byte-for-byte programming verification, six injection hooks)
- [x] `src/monitor/monitorRun.ts`: the monitor-driven session record
      (`MonitorRun`, localStorage, mirroring `session/run.ts`'s idiom), the
      cross-clear rule (creating a `MonitorRun` clears any `SessionRun`),
      and `anyLiveSession()`'s coexistence truth table (9 cells, pinned);
      Today's stale-draft discard gains a live-monitorRun exception, this
      phase's one permitted UI touch
- [x] `src/monitor/transports/capacitorBle.ts`
      (`@capacitor-community/bluetooth-le`) and `src/monitor/transports/
webBluetooth.ts` (`navigator.bluetooth`): thin `Transport` adapters
      for the two real radios, compile-tested shapes, deliberately excluded
      from the coverage gate alongside `src/native/**` — no BLE radio
      exists in CI to prove either one against
- [x] `docs/monitor/pm5-interface-notes.md` gains §17, the laptop session
      runsheet consolidating every doc ambiguity and reviewed assumption
      into one numbered checklist, and §18, what real firmware was then
      observed to do

**Record:** this domain met real hardware in the same-day `phase-7a-fix`
pass (plan: `docs/superpowers/plans/2026-08-05-phase-7a-fix.md`), and every
observation, correction and withdrawal since lives in
`docs/monitor/pm5-interface-notes.md` §18 (laptop sessions 1-3, hardware
walks 1-4) and §19 (each idiosyncrasy, and whether it was ours or the
machine's). The headline reaches back into this phase's own codec: the
CSAFE status byte is a BITFIELD and `0x81` IS AN ACCEPT (§19.1), so of the
five defects the fix pass named, D1 and D2 are WITHDRAWN as stated (§19.2;
the display-emptying `:00` transition stays an open finding), D3's forward
attribution is real but applies at every boundary rather than only a
resting one (§19.8), D4 stands (§18's own D1-D5 table), and D5's fix stands
on corrected reasoning (§19.9). The monitor never goes quiet after a
workout either; our own terminal latch did (§19.4). Phases 7A-fix-2 and
7A-fix-3 below are the fix lists that record generated.

**Deferred to 7B/7C, both below:** the screen wiring, PM5-sourced log
entries, and the reverse cross-clear all shipped there. The §17 items still
open need an operator at the erg rather than a CI gate; Triggered follow-ons
collects them.

**Exit:** MET — every domain/driver behavior the design spec names has a
passing test (100% on `domain/monitor/**` and on `src/monitor/
monitorRun.ts`); the fake transport proves the full program → run →
terminate arc against the exact bytes a real PM5 would exchange; the
cross-clear guard and `anyLiveSession()`'s own truth table are pinned. **Not
every guard wires onto `anyLiveSession()` mechanically** (final-review
M-1, correcting this section's own prior claim): two guards need the
UNLOGGED distinction the function deliberately collapses and must keep
reading `loadRun()`/`loadMonitorRun()` directly — see Phase 7B's own
bullet below before wiring any guard.

## Phase 7A-fix-2 — the status bitfield, and what it invalidates

**Status:** Done (Tasks 1-6, commits `0d0af28`..`fcb7a4c` on
`phase-7a-monitor-domain`; merged with 7A as PR #52 on James's explicit
approval, after the merge-gate row had run).
**Trigger:** FIRED — `docs/monitor/pm5-interface-notes.md` §19 (2026-08-06)
established that the CSAFE status byte was being parsed wrongly and that
several conclusions recorded as PM5 behaviour were consequences of that
parse. Nothing here is a new hardware finding; it is the fix list §19
generated, now shipped.
**Authority:** `docs/monitor/pm5-interface-notes.md` §19 for every citation
below.

- [x] **The status bitfield.** `app/domain/monitor/pm5/response.ts` masks
      instead of comparing: accept `(status & 0x30) === 0x00`, reject
      `(status & 0x30) === 0x10`, `bad`/`not-ready` for the other two
      previous-frame values, `status & 0x0F` the slave state, `status &
0x80` the frame toggle (never tested for failure), bit `0x40`
      reserved. `REJECT_STATUS_BYTE` is retired, and `CsafeResponse` gained
      a `kind: "unparseable"` member so a garbled frame is no longer
      conflated with a genuine reject; `buildAckFrame` and the fake
      synthesise all four frame statuses, any slave state and either
      toggle. Task 2 (§19.1).
- [x] **Re-derived D1/D2 from the raw traces.** §19.1's 34-row per-send
      table decodes every captured status byte in both sessions: zero of
      the twelve RAW bytes was a rejection. D1 is WITHDRAWN, with the
      display-emptying `:00` transition left STANDING OPEN as Verdict (a);
      D2's framing is WITHDRAWN while what it protected survives through
      the documented OFFLINE slave state (Verdict (c)); and
      program-over-loaded WORKS (Verdict (b)), on a weaker argument than
      first claimed, since the observed rest-free row followed a reconnect
      and a second send rather than one unbroken connection. Task 1
      (§19.1/§19.2).
- [x] **The terminal-latch recovery.** The monitor never stops responding;
      on completion it parks in `WorkoutLogged` and leaves via the Menu
      button or a terminate command ([CSAFE-DEF] Appendix E). `activeRun`
      (`src/monitor/driver.ts`) is opened by `program()` and only by
      `program()`; a terminal state closes that run while every
      subscription stays live, so frames keep flowing after
      `workoutComplete` and `program()` works again with no reconnect. A
      boundary arriving outside an open run emits `index: null` plus a
      `boundary-out-of-run`/`terminal-out-of-run` entry, and replacing an
      open run logs `run-replaced`, rather than corrupting a closed run's
      actuals. Task 4 (§19.4).
- [x] **The no-rest interval rule.** `domain/monitor/pm5/intervalIndex.ts`
      had applied forward attribution only on the resting side.
      `toActualIndex` now applies the offset unconditionally for 0x0037/38
      (`IntervalActual.index`), clamped to the explainable range
      `[0, L+1]`, emitting `null` plus a forked `"divergence"` entry
      outside it; 0x0033's own `toProgramIndex` stays rest-keyed. The
      `index-unverified` trace entry is RETIRED. Task 5 (§19.8, §17 item
      13).
- [x] **`sendPrepare` replaces the clear step.** `program()` still leads
      with a terminate-shaped step, re-justified as the documented
      `WaitToBegin` recovery path rather than a "clear" (nothing clears;
      terminate re-arms the same workout, §19.5); its refusal is swallowed
      as routine (`"prepare-rejected"`), broadened from nak-or-timeout to
      anything but a confirmed disconnect. Task 3.
- [x] **`SetScreenState` is asynchronous.** Its ack means "queued", not
      "done" ([CSAFE-DEF] p.65), so `terminate()` waits the documented
      ≥1 s fallback delay as a tick bound rather than polling
      `CSAFE_PM_GET_SCREENSTATESTATUS`, which needs the pull path this drop
      does not build (§17 item 14, §19.6).
- [x] **`GetErrorType` on a genuine reject.** A workout-configuration
      reject is atomic and not self-describing ([CSAFE-DEF] p.50), so
      `sendGetErrorType` fires ONE `buildGetErrorType()` on a genuine
      `"nak"`, bounded by `errorTypeTicks`, and logs the raw hex reply with
      no decode claim; the decode itself waits on §17 item 14. Task 3
      (§19.7).
- [x] **The fake and the driver stopped modelling the withdrawn
      behaviour.** `src/monitor/transports/fake.ts` accepts-and-replaces
      instead of rejecting-when-loaded, toggles bit 7 on every response
      frame, varies slave state, echoes opcodes in its acks, and can script
      a genuine `0x11` reject or a garbled frame (each marked synthetic and
      never observed); `driver.test.ts` no longer pins D1 by name. Task 6.

**Record:** the merge-gate row (§17's five James-operated steps) RAN on
2026-08-06 as laptop session 3, and §18's session-3 heading holds
Expected-vs-Observed for each step: all five PASSED and §17 item 15 is
ANSWERED. Heart rate joined that row when James's Apple Watch was paired to
the PM5 as its HR source, so live `heartRateBpm` and the actuals'
`avgHeartRateBpm` were observed PRESENT for the first time (every earlier
reading was the no-HR-source `0` sentinel, §19.9); the belt path and
`CSAFE_PM_GET_HRM` stay future. The row's own live bisect surfaced a defect
outside this phase's scope, programming over a RUNNING workout arming
structurally empty (§19.13), which became Phase 7A-fix-3 below and reopened
no bullet here.

**Exit:** MET — every bullet above has a passing test (2282 all-projects /
111 files, e2e 210), no test encodes a whole-byte status comparison, and
§18/§19's corrected record agrees with the code.

## Phase 7A-fix-3 — program over a live piece

**Status:** Done (2026-08-07, PR #53). Design approved by adversarial
review; Stage 1 (instrumentation, the settle, the fake's honest empty-arm
model) and Stage 2 (the structural readback and its `"structure-mismatch"`
rejection) both shipped as Tasks 1-5, commits `5d42e01`..`78a949c` on
`phase-7a-fix-3`. Hardware sessions 4a (2026-08-07) and 4b both RAN, both
with every row PASS.
**Trigger:** FIRED — the merge-gate row's own live bisect (laptop session
3, 2026-08-06) found two unrelated program shapes arming structurally
EMPTY, each the one time it was sent while the target machine was still
`rowing`, while seven sends from a settled machine all armed correctly.
**Repro recipe:** send `program()` at a workout that is currently mid-piece
(`rowing`/`resting`); its own internal `sendPrepare()` terminate fires while
the machine is still live, and the send that follows is accepted, verified
armed, and structurally empty.
**Authority:** `docs/monitor/pm5-interface-notes.md` §19.13 for the
behaviour, §18 (laptop session 3, sessions 4a/4b) for the readings, and
§17 items 5/12/15/16/17 for what it does and does not close.

- [x] **Remedy A — settle after a mid-session terminate.** `program()`'s
      `sendPrepare()` step now waits, when the prepare's terminate fired
      while the machine was `rowing`/`resting`, for the documented Appendix
      E auto-cycle to reach `armed` plus one further tick
      (`DriverOptions.prepareSettleTicks`, default 10, its own
      `pendingPrepareSettle` slot, tick-bounded rather than wall-clock).
      Session 4a measured `armed` on tick 4 twice at the exact repro.
      Common-path latency is unchanged: the wait only arms when the prior
      state was `rowing`/`resting`. Task 2 (`5d42e01`→`6fd2636`/`9421033`).
- [x] **Remedy B — item 12's structural readback, as detection.**
      `verifyArmed` (`src/monitor/driver.ts`) resolves only on a fresh
      post-send tick that is `armed` AND whose 0x0031 structure fields
      match `expectedArmedStructure(p)` (`pm5/commands.ts`, sharing the
      encoder's own constants). A mismatch rejects with
      `ProgramRejectionReason: "structure-mismatch"` after 3 consecutive
      armed ticks reporting the SAME wrong structure (a payload still
      changing restarts the count, per session 4a's captured mid-cycle
      transients), or at `verifyTicks`' outer bound, which now DEFAULTS to
      20 instead of meaning unbounded. Task 4 (`970bf26`/`a7ac619`).
- [x] **Removed the fake's idle-terminate refusal (§17 item 15).**
      `src/monitor/transports/fake.ts`'s `onClearingFrameComplete` accepts a
      bare idle terminate unconditionally; the refusal survives only behind
      the explicit synthetic `FakeScript.refuseNextPrepare` hook, because
      real hardware never refused it. Task 3 (`e92cee9`/`50eae9b`).
- [x] **Revised `sendPrepare`'s doc comment.** `src/monitor/driver.ts`'s
      `sendPrepare` no longer claims hardware showed the PM refuse an idle
      terminate; it states the swallow-as-routine behaviour on its own
      terms and cites the retirement directly (§18 session 3 item 15,
      §19.4/§19.5). Task 3.

**Record:** §19.13 holds the finding, its two-shape/one-condition evidence
and the correction that the empty arm is no longer indistinguishable from a
healthy one; §18's sessions 4a and 4b hold the readings, including a real
PM5 caught by the readback with a typed `structure-mismatch` on a live
empty arm. Session 1's `:00`/`:00` Verdict (a) stays OPEN, with this
mechanism as its leading candidate explanation rather than its answer. The
minors this phase parked for the whole-branch reviewer are in Phase CL.

**Exit:** MET (2026-08-07) — green (2335 all-projects, e2e 210), session 4b
run with both rows PASS, and James's explicit approval given. Session 4a
resolving as outcome (a) meant the remedies shipped unconditionally on 4b,
which was validation rather than a further decision point.

## Phase 7B — PM5 connected surface

**Status:** Done (2026-08-08, Tasks 1-8). The core exit criterion is met
**against the fake transport**: `e2e/connected.spec.ts` walks connect →
pairing → programming → ready → the surface → paused → resumed → End → the
log screen in a real browser, in both orientations, through the real
component chain, but through `createFakeTransport()`, never a radio. Real
hardware came afterwards, in walks 1-4
(`docs/monitor/pm5-interface-notes.md` §18, 2026-08-08), which is where
this surface's remaining defects were found and fixed; the Record and Exit
lines below say what hardware has and has not shown.
**Goal:** A rower can actually connect a PM5 from the app and row against
it — the screens 7A's domain was built to sit underneath.
**Design:** the connected surface's own handoff
(`docs/design/handoffs/2026-08-05-connected-mode/`), reconciled against
7A's shipped types, with every departure from it recorded in
`docs/design/DEVIATIONS.md`.

- [x] The Connect affordance: `WorkoutDetail`'s `ConnectAction` button
      (shipped on the workout DETAIL screen, ahead of Confirm, rather than
      "on Confirm targets" as the plan first worded it), gated on
      `resolveDefaultTransport()`/`navigator.bluetooth` availability
      (`src/monitor/transports/index.ts`); manual NEXT remains untouched,
      and a disconnect mid-workout degrades to the `"disconnected"` phase
      rather than crashing
- [x] Live actual pace against target and live stroke rate against
      prescribed SPM: `ConnectedSurface`'s three panes (Timer/Live/Grid,
      `src/workout/connected/`), fed by `useMonitorSession`'s `frame`
      events, with distance steps auto-advancing on `intervalComplete`
      through `toActualIndex`'s forward-attribution rule
      (`domain/monitor/pm5/intervalIndex.ts`)
- [x] **Guard wiring is NOT uniform (final-review M-1 — read before touching
      any guard that reads `RUN_KEY`/`MONITOR_RUN_KEY`).** Most guards that
      only need "is anything live, and on which side" migrate onto
      `src/monitor/monitorRun.ts`'s `anyLiveSession()` mechanically, as
      7A's design spec §6 describes. Two do NOT, because they need the
      UNLOGGED distinction `anyLiveSession()` deliberately collapses to
      "none": WorkoutDetail's unlogged-run staged confirm (the 6B F5
      fix — a completed-but-unlogged prior session is exactly what its
      "Replace" warning is FOR) and Today's cold-start stale-draft-discard
      guard (already correctly reading `loadMonitorRun()` directly, with
      its own comment explaining why — that code is 7A's reference
      pattern for this phase's own new guard). Routing either through
      `anyLiveSession()` silently downgrades "unlogged" to "none" and
      reintroduces the F5 data-loss class (a real, previously-shipped bug:
      a stale run record silently discarded instead of protected). When
      adding a NEW guard, ask "does this care about unlogged specifically,
      or just live-vs-not" before picking which of the two patterns to
      follow.
- [x] The reverse cross-clear direction: an existing live `MonitorRun` is
      cleared the same way `createMonitorRun` already clears a `SessionRun`
      — shipped in `WorkoutDetail.tsx`'s `startSession`, behind the Replace
      confirm, not in the spec-named `buildRun`/`saveRun` home;
      `session/run.ts`'s `saveRun` comment carries the three reasons and
      the DEVIATIONS table's reverse-cross-clear row records the move
- [x] **A second `program()` call during the prepare-settle wait strands the
      first.** `driver.ts`'s `pendingAck`/`pendingVerify` single-flight
      class gained a third member with fix-3's settle,
      `pendingPrepareSettle`, which widened the stranding window from
      microtasks to up to `prepareSettleTicks` of wall time (~5 s at the
      default). Pre-existing class, not a fix-3 regression. **Fixed in Task
      1:** `program()` checks an in-flight flag FIRST, before `sendPrepare`
      and before any wire traffic, and throws a new `ProgramBusyError` for
      a concurrent call (deliberately NOT a `ProgramRejectionReason`
      member; that union stays machine-statements-only, since no frame was
      ever sent for the rejected call). The busy call costs zero writes and
      never affects the first call's outcome; the flag clears on every exit
      path via `program()`'s own `try`/`finally`, and
      `driver.test.ts`'s "ProgramBusyError" describe block is the coverage
- [x] The real device name reaches the record: `createPm5Driver` used to
      hardcode `capabilities.deviceName: "PM5"` because its constructor had
      no `DiscoveredMonitor` to read a name from. **Fixed in Task 1:** it
      accepts `options.deviceName` (`DriverOptions.deviceName`), which
      flows into `capabilities.deviceName` and from there into
      `MonitorRun.deviceName`, falling back to the `"PM5"` placeholder only
      when no name was given and never fabricated otherwise;
      `scripts/pm5-lab.ts` threads its own `scan()` result through as the
      reference caller
- [x] Full behaviour tested against the fake transport in CI (Task 8):
      `e2e/connected.spec.ts`'s browser-driven walk at 390×844 and 844×390,
      the surface reachable by rail AND swipe, plus 2812 passing
      unit/client tests

**Record:** the hardware walks that exercised this surface are §18's
2026-08-08 entry (walks 1-4, PM5 432331249): the interstitial walked clean;
PAUSED fired on a real program once its derivation was corrected to a
three-field key; `rowingActive` read true on the first pull, which was the
unobserved premise the ready gate rested on; the 1.2 s ready dwell was
removed as an operator ruling; and 0x0031's Elapsed Time and Distance
turned out to be PER-INTERVAL rather than session-cumulative, which is why
`driver.ts` now keeps a session accumulator and the surface reads
`sessionElapsedSeconds`/`sessionDistanceMeters`. Every departure those
walks forced is a row in `docs/design/DEVIATIONS.md` (the removed dwell,
the inverted PAUSED band, the lost-link banner's descope, MISSED rows, the
diagnostics sheet's sequence numbering, the reverse cross-clear's home).
The reconnect follow-on this phase scoped out, the failed-`program()`
open-run question 7A-fix-2 parked, and the hardware readings still owed all
sit in Triggered follow-ons.

**Exit:** the fake-transport analogue is MET and gated in CI
(`e2e/connected.spec.ts`, both orientations): distance steps auto-advance,
live pace shows against target, and Connect degrades to manual on
disconnect. On real hardware, walks 1-4 (§18, 2026-08-08) took the surface
from Connect through programming, rowing, pause and resume to the end
hand-off on a 2×100 m distance program, closing §17 item 20 and capturing
real boundary actuals; still unrun are a genuine mid-piece disconnect and
§17 item 21's pairing/programming timing spans. (The button is one word,
`Connect`, `ConnectAction.tsx`, not "Connect PM5" as the plan's original
wording had it.)

## Phase 7C — PM5 logging

**Status:** Done (2026-08-08, Tasks 1-6; merged 2026-08-09), shipped
pending a hardware walk. The exit criterion is met against the fake
transport: `e2e/connected.spec.ts`'s connected walk (both orientations)
runs a full session through Save, and the stored log's steps come back off
`GET /api/logs` carrying `actualSource: "pm5"`, the verbatim wire numbers
(split, work time, distance, stroke rate) and the fake's own `deviceName`.
No PM5 has logged a real session through this build: walk 4 (§18) predates
this phase's own builder, so the seed → builder → screen → server pipeline
has only ever been proven against walk-4's fixture values and the fake's
driven session. Suite: 2927 unit / 244 e2e / 49 screenshots.
**Goal:** A PM5-driven session logs with the same fidelity a phone-timer
session does.
**Design authority:**
`docs/superpowers/specs/2026-08-08-phase-7c-pm5-logging-design.md`.

- [x] Per-step actual splits logged with `actualSource:'pm5'`
      (`IntervalActual` → the log's per-step actual, a third source
      alongside `logDraft.ts`'s existing `'assumed'`/`'stopwatch'`) —
      home: `buildMonitorLogSteps` (`app/src/session/logDraft.ts`)
- [x] The monitor-side log-writing path (`MonitorRun` → a save flow),
      mirroring 6C's `logDraft.ts`/`LogScreen` split for the phone-timer
      side — home: `LogSession.tsx`'s monitor mode (`ManualDoorLog`'s
      `?from=monitor` branch, with its own staged discard)

**Record:** the only real wire numbers this builder has ever decoded are
§18 walk 4's captured `0x0037`/`0x0038` pair, decoded through
`pm5/parse.ts` rather than hand-transcribed. The shape rulings live in the
design spec above and in three `docs/design/DEVIATIONS.md` rows: a
monitor-sourced effort interval keeps every measured field, a null-indexed
actual is dropped rather than misattributed, and `deviceName` rides on the
log. Anonymous-run logging and §17 item 22 (whether the split time the log
stores is work-only or work-plus-rest) are the two remainders this phase
leaves; both are in Triggered follow-ons.

**Exit:** MET against the fake transport — a session fully driven by a
connected PM5 saves a log indistinguishable in shape from a phone-timer
session, with real monitor-measured splits. The same walk on real hardware
is still owed.

## Phase 7D — Phone BLE

**Status:** Done (merged 2026-08-11 as PR #79, after a THREE-DAY
hardware walk that found and fixed four wire truths live). Shipped to
TestFlight in v0.7.0, build 564.
**Goal:** The PM5 connects, programs, rows, and saves on an iPhone
through the existing transport seam, closing 7B/7C's owed hardware
walk on a real device instead of the fake transport.
**Design authority:**
`docs/superpowers/specs/2026-08-10-phone-ble-design.md` (plan:
`docs/superpowers/plans/2026-08-10-phone-ble.md`).

- [x] `capacitorBle.ts`'s scan pipeline, typed errors at the seam, and
      the abandoned-sheet queue invariant (spec §3)
- [x] `permission-denied` end to end and the `picking` backdrop
      (`phase` gains no `"choosing"`; the sheet is the plugin's own,
      not an OS picker on iOS — spec §4/§5)
- [x] The Bluetooth capability adapter; `WorkoutDetail`'s Connect
      probe moves onto it (spec §6)
- [x] `cap sync ios` wires `@capacitor-community/bluetooth-le` into
      the Swift package for the first time (spec §8)
- [ ] The hardware walk: spec §10's 8 steps on James's iPhone,
      James-operated at the erg, one question per step

**Release gate:** the v0.7.0 tag and TestFlight build wait on this
phase (James, 2026-08-10: "phone side testing matters for the first
users") — not on the library rebalance or Phase CL2's debt pay-down,
neither of which touches the transport.

**Exit:** the hardware walk (spec §10, all 8 steps) passes on a real
PM5 from a dev build on James's iPhone, and James gives the merge
word.

## Phase 8 — Plan & Progress

**Status:** Not started
**Goal:** See where you are in the 84-session plan and whether you're getting faster.

- [ ] Plan screen gains a month calendar with type marks, ALL/TO DO/DONE filters, and a legend (session rows: done sorted below upcoming; today highlighted) — layered onto the sequence list Phase 6A already built at `/plan`, not a new screen
- [x] ~~Plan management: preset selection (2000 m sprint / 5–6 k head race), reset-to-session-1~~ — **delivered early in Phase 6A** (`/plan`'s preset cards, Reset, and Switch), since Today needed an active plan before this phase's own turn came up
- [ ] ~~Progress screen: 2k/6k test trend bars (longer = slower, delta callout), minutes/week stacked by type, type mix, last-30-days~~ — **superseded by Phase 6J**: these three chart groups relocate onto You (Trend folded in, per the 2026-08-07 News tab handoff) instead of shipping as their own screen; this bullet stays struck-through rather than deleted so the supersession has a record
- [ ] Test history list on **You**; test-type sessions prompt a baseline update

**Exit:** Logged sessions appear on the calendar and in every chart; a logged 2k test can update the 2k baseline through the staged-confirm flow.

## Phase 9 — Preferences & You completion

**Status:** Not started
**Goal:** The suggestion engine and session flow honor per-user preferences.

- [ ] Suggest-workouts-at difficulty chips + time-available cap, live "N of M match" readout, feeding Today and clearing `todayPick`
- [x] **Warm-ups leave the workouts and become a setting** (James,
      2026-08-08, superseding the earlier "override library warm-ups"
      line): the library's own warmup steps are DROPPED; a rower who
      wants one sets it once in preferences — duration as TIME or
      METERS, plus an OPTIONAL trailing rest — and the session flow
      prepends it. Shipped 2026-08-09, home:
      `docs/superpowers/specs/2026-08-09-warmup-setting-design.md`.
      Follow-on, replacing the earlier "recompute the library's
      time-range percentages" clause: **RESOLVED 2026-08-10 — the
      library rebalance**. The rebalance report's MOVED row (what the
      strip did to each type/band) became the input to a new,
      warm-up-free target grid authored by a feasibility solve (ruling
      B: longer by intent, mode at 30-45), and 93 workouts were
      retuned plus 11 replaced to land the library on it exactly, 0
      debt in all 20 cells. Home:
      `docs/superpowers/specs/2026-08-10-library-rebalance-design.md`
      (the grid and rules) and
      `docs/superpowers/specs/2026-08-10-library-rebalance-move-plan.md`
      (the per-workout moves). `patterns.json`'s `targets` block is now
      the live grid — `library-balance.ts` and `library.test.ts`'s
      quota gate both read it — and `AFT-TGT` is the report's real
      signal (0 everywhere the phase is done); the pre-rebalance
      `DESIGN_GRID_2026_08_03`/`FAITHFULNESS CHECK` pair is retained
      only as a historical note behind `--history`, since it checks
      the replay against a grid the library no longer targets
- [ ] Pre-workout countdown length 0–60 s (staged)
- [ ] Pace tolerance (0–3 s) and accent color as real settings
- [ ] All preferences persisted per-user

**Exit:** Two users with different preferences get different Today suggestions and timer behavior.

## Phase 10 — Multi-rower & polish

**Status:** Not started
**Goal:** Household-ready and installable.

- [ ] Device account switcher (the design's SWITCH flow: multiple signed-in rowers, "Add another rower")
- [ ] PWA installability (manifest, icons, standalone display)
- [ ] Accessibility audit against the handoff's hard rules: every target ≥ 44×44 px, all text ≥ 4.5:1 AA
- [ ] Calm-motion pass: no animation beyond the timer tick and progress bars
- [ ] Backlog sweep of deferred niceties

**Exit:** Two rowers share a phone by the erg without re-typing credentials; app installs to a home screen; audit findings closed.

## Phase CL — Cleanup

**Status:** Done — list adjudicated 2026-08-10; the release it was staging shipped as v0.7.0 (2026-08-11, build 564)
**Goal:** One home for the remainders the phases above left behind, so a
close-out round can be scheduled from a list instead of rediscovered from a
grep. Collection only: every line below already existed somewhere, and
nothing here is new work. Effort guesses are S/M/L.

- [x] **The platform-conditional default transport** — the same root cause
      as the item above: `createCapacitorBleTransport` had no call site, a
      native build passed its own factory through
      `MonitorSessionDeps.createTransport`, and choosing between it and Web
      Bluetooth belonged in the adapter layer (`src/platform.ts`/
      `src/adapters/`), not the transport-resolution seam
      (`src/monitor/transports/index.ts`'s own doc comment). Fixed
      (BACK-walks-the-stack batch, batch A): `src/adapters/
monitorTransport.ts` adds the platform-conditional default — native
      dynamic-imports `createCapacitorBleTransport`, web delegates
      unchanged to `transports/index.ts`'s `resolveDefaultTransport` —
      wired through `useMonitorSession.ts`'s existing `??` fallback. **M**
- [x] **`intervalAccrued` on `MonitorFrame`** — pane C's active row showed
      `—` for the dimension that was not counting down, because no
      per-interval field existed for it. Closed as a DRIVER change, not a
      screen one (BACK-walks-the-stack batch, batch A):
      `computeAccruedForFrame` (`driver.ts`) mirrors `intervalRemaining`'s
      own per-interval baseline into `MonitorFrame.intervalAccrued`,
      wired through the per-frame path (`docs/design/DEVIATIONS.md`'s
      pane-C active-row row, task-7 review adjudication 4). **M**
- [x] **Phase 7A-fix-3's parked minors** — a byte-for-byte duplicated test
      helper (`stillArmedEmpty`/`stillArmedAtZero`, `driver.test.ts`) and
      three LOW-severity comment/instrumentation nits from its Task 2
      review: a timeout-not-assertion latency pin, the settle not logging
      its own configured bound, and an undocumented off-by-one in that
      bound's inclusivity. Items 2–4 fixed in batch A (4079a22); item 1
      (the dedupe) was initially declined there, citing a prior
      whole-branch review's "parked per reviewer ruling" note (32196d8) as
      more recent than this ROADMAP line — a real citation, but its
      recency argument read backwards: 32196d8 predates both this CL
      line (2026-08-09) and this batch's own brief, and CL is precisely
      the phase where a parked item comes due. Deduped in the
      BACK-walks-the-stack batch's fix round: one `stillArmedEmpty`
      helper, both call sites (`driver.test.ts`), driver suite green. **S**
- [x] **Bulk import has no transaction** — `POST /api/workouts/bulk`
      (`app/server/routes/data.ts`) used to insert block by block inside a
      plain loop, so a partial failure left the landed blocks behind and
      re-importing the same paste duplicated them. Recorded at Phase 5B's
      merge. Fixed (CL item, BACK-walks-the-stack batch): any error
      anywhere in the paste — parse-level or validation-level — now means
      NOTHING in the request is created; a fully clean paste reaches
      `stores.workouts.createMany`, itself one transaction in the real
      store, reused rather than re-implemented. **M**
- [x] **No unsaved-changes guard in the builder** — Fixed (CL remainder,
      this PR): draft persistence, not a navigation guard — `builderDraft.ts`
      single-slot autosave/restore with a fingerprint staleness guard and a
      two-tap START OVER; James's explicit shape choice over exit
      interception and a data-router migration (spec:
      `docs/superpowers/specs/2026-08-10-cl-remainder-design.md`). **S**
- [x] **Per-worktree compose scoping** — the e2e/screenshots stack used to
      be shared across sessions by container name (one Postgres volume, one
      `web`/`api` pair), so concurrent worktrees stomped each other's
      fixtures and could serve a bundle from the wrong branch. Fixed
      (Phase CL, PR #68): `app/scripts/stack-env.sh` derives
      `COMPOSE_PROJECT_NAME`, the `ERGO_STACK` container-name prefix, the
      host ports, and the Playwright baseURL from the worktree's own
      absolute path; `.claude/agent-briefing.md`'s stack section now
      documents the fix, not the workaround. **M**
- [x] **News scroll memory** — BACK from an article used to land News at
      the top, a tradeoff taken deliberately when the feed was about 1.15
      screens and confirmed still standing after the overlay-scroller
      round below. The shelf grew (six articles plus the Start-here pin),
      so News now takes the Library's own scroll-memory pattern —
      `newsScroll.ts` + `News.tsx`'s save/restore effects, `TabBar.tsx`'s
      clear-on-fresh-tap (CL item, BACK-walks-the-stack batch). **S**

**Exit:** MET 2026-08-10 for the list (every line shipped or re-filed with
its trigger above); the phase itself closes with the staged v0.7.0 release,
which fires only after the library-rebalance PR merges (James's ruling:
testers meet the rebalanced library).

## Phase CL2 — Post-release authoring parity

**Status:** Not started, and now UNBLOCKED — the v0.7.0 release it was
scheduled behind shipped 2026-08-11 (build 564), as did v0.8.0 and
v0.9.0. Nothing gates this any more except sequencing against Phase CR2
below.
**Goal:** The builder can author what the domain, the import, and a
third of the library already are: N lead lines, then a repeated block.

- [x] ~~Unify the nudge: drop the post-Start secondary nudge screen,
      put every adjustment on the Connect-card experience both paths
      share~~ — **PULLED FORWARD and shipped in the fast-follow phase**
      (James, 2026-08-11, at the v0.7.0 tag). Resolved as **rate
      display + pace only**: the unified card nudges pace exclusively;
      rate stays read-only display, and the old screen's duration/reps/
      SPM steppers and per-row REMOVE/RESTORE died with it uncompensated
      (a James-approved casualty list, not a deferral). Structural
      changes route through Edit. Detail: Phase FF below.
- [x] ~~The Ostro roll-up's DISPLAY side~~ — **shipped early**, ahead of
      this phase's own builder work (PR #83, 2026-08-11, main `ea3dec6`):
      consecutive identical runs already collapse to one "N× the block
      below" line on Today and Library via a display-only rule (the
      Ostro spec's own erratum: consecutive runs roll via rule 1). This
      phase's own goal — the BUILDER learning to author that shape, not
      just render it — is still open below.
- [ ] Builder: positional repeat-block authoring. Today the repeat is
      hoisted into a single form field (`builderState.ts`'s `f.reps`),
      so lead-piece-then-block workouts (the Katabatic Wind shape;
      "mixed", the book's most common AT archetype at 11 of 19 in the
      30-45 cell) cannot be authored in-app. The one-marker model stays
      the constitution (README: everything before the marker runs once,
      everything after runs count times); the builder learns to PLACE
      the marker, not to multiply blocks. **M**
- [ ] Import: the grammar already parses a positional `xN` line
      (`bulk.ts:268`) into the marker; verify full parity end to end
      (lead lines + `xN` + block round-trips through parse, validate,
      save, and re-render) and document the syntax in the import
      screen's grammar example. **S**
- [ ] Pay down the O2|60+ variety debt (James, 2026-08-10, at the
      rebalance's Gate 2): Fair Wind / Morning Mist / Sleet / Glass Sea
      (+ Altostratus after its retune) are near-identical long
      continuous singles. Retune 2-3 into distinct shapes WITHIN the
      cell so the grid holds; the `variety.test.ts` KNOWN_DEBT entry
      for O2|60+ shrinks with them (ratchets only ever go down). **M**
- [ ] Pay down the rebalance's other flagged pairs (James, 2026-08-10,
      at the PR #78 merge: "any flagged workouts bump to CL2"). The
      full list, from the PR's disclosure section: O2|30-45 Silver
      Thaw <> Halo Ring; AT|30-45 Anticyclone <> Jet Streak, Inversion
      Layer <> Gap Wind, Deepening Low <> Thermal Wind, Thermal Low <>
      Heat Low; TR|30-45 Gulf Stream <> Piteraq, Southerly Buster <>
      Cold Snap; AN|20-30 Downburst <> Rope Tornado. Same rules as the
      cluster above: differentiate WITHIN the cell, grid holds,
      ratchets shrink. **M**
- [ ] Workout rating system (James, 2026-08-10): unscoped — brainstorm
      first. Open questions to settle there: what a tester rates (the
      workout, or the session they just rowed), where it surfaces
      (post-save, library, detail), and whether ratings feed selection
      or stay informational. **M, brainstorm before sizing**

**Exit:** A rower authors 15' steady then 4x(3' on, 1' off) entirely in
the builder; the same workout pastes in via import; both render as
"N× the block below" exactly as the seeded library does. The O2|60+
cluster reads as five different workouts, and testers can rate what
they row.

## Phase FF — Fast-follow: finish authority, one door to start

**Status:** Done (merged 2026-08-11 as PR #85, walk passed on a real
PM5). Shipped to TestFlight in v0.8.0, build 587.
**Goal:** three tester-facing hardenings, first post-release wave
after v0.7.0 (build 564, on TestFlight): (a) a dropped final split
can no longer cost the last interval's data; (b) no connect path
anywhere can hang unbounded; (c) starting a workout has ONE nudge
model and ONE visual hierarchy, the Connect card's, on both the
timer and PM5 paths.
**Design authority:**
`docs/superpowers/specs/2026-08-11-fast-follow-design.md` (plan:
`docs/superpowers/plans/2026-08-11-fast-follow.md`).

- [x] R1 — the finish-line summary pair (0x0039/0x003A) becomes a
      driver-side FALLBACK, never a replacement: the split stays
      authoritative and immediate inside the grace window; the
      summary fills only at grace expiry, only when every prior
      interval is recorded, with per-interval avg fields honestly
      omitted rather than faked
- [x] R2-web — `webBluetooth.ts`'s `connect()` races `gatt.connect()`
      against the same 10s bound the iOS plugin already enforces, and
      disconnects the zombie link on a late resolve instead of just
      dropping the reference
- [x] ConfirmTargets (642 lines, its own route) removed outright; its
      five entry points rewire directly onto the countdown, with
      `startedAt` restamped at every one so the in-progress guard
      keeps working
- [x] Connect becomes the screen's single primary: new
      `--action-connect` blue token, L1 geometry, positioned above
      Start; "Start" renames to "Start Timer" and demotes to L2
- [ ] The erg confirmation row (James, one step at a time): a nudged
      MULTI-INTERVAL workout that CARRIES REST, rowed start to save
      on the phone, discriminating both premises the R1 subtraction
      rests on (cumulative-vs-per-interval totals, and whether the
      totals include rest) — `pm5-interface-notes.md` §23 walk items
      2 and 4. Plus one timer-path start: card nudge -> Start Timer
      -> countdown directly, nudged target visible in the session.

**Ruling recorded (James, 2026-08-11):** the nudge unification was
CL2 filing, pulled forward into this wave; rate stays read-only
display, pace is the only nudgeable field (Phase CL2's own line
above records the same resolution).

**Remaining ecosystem follow-ons** (from
`docs/monitor/pm5-ble-ecosystem-review.md`'s ranked list; R1/R2
close in this phase, R5/R6 are no-action/design-input already) —
explicitly NOT this wave's scope:

- **R3** — switch `webBluetooth.ts`'s CSAFE writes from
  without-response to acked `writeValue`, matching every surveyed
  client and our own iOS path; cheap insurance against a chunk
  silently dropping on the web/desktop dev path. Trivial effort.
- **R4** — try `services: [CE060000]` (the C2 base service) in
  discovery at the next hardware walk, alongside the existing
  `namePrefix: "PM5"` filter, to shrink the picker sheet to ergs;
  revert instantly if the sheet goes empty.

**Exit:** the erg row (multi-interval, carrying rest, both premise
discriminators settled on the wire) and the timer-path row both pass
on James's iPhone against a real PM5, and James gives the merge word.

## Phase CR — Connected revamp: two panes, two heroes, one honest bar

**Status:** Done — merged 2026-08-13 as PR #89, released the same day as
v0.9.0 (build 641). All five exit items discharged: four verified by
James on a real PM5, and the paused-block occlusion deliberately
deferred by his ruling ("we're revisiting pause in a future phase
because it's fake"). Final gates 3862+1 across 157 files, e2e 286,
screenshots 62. **Its follow-on work is Phase CR2 below.**
**Goal:** connected mode becomes two panes whose landscape geometry
cannot drift; the live pane reads as two big judged numerals over
ink targets; the grid becomes single-line rows with its totals in
the header; one notched bar replaces three different ways of saying
where you are; and the unconnected phone timer is rebuilt in the
same language.
**Design authority:**
`docs/superpowers/specs/2026-08-11-connected-revamp-design.md`
(plan: `docs/superpowers/plans/2026-08-11-connected-revamp.md`;
visual authority `docs/design/handoffs/2026-08-11-connected-revamp/`,
where `REVISION-2026-08-11.md` governs and the `.dc.html` mockup is
the pixel truth).

- [x] The landscape width bug, root-caused and pinned: the surface
      body was an `auto`-minimum grid item measuring against whichever
      pane was mounted (692 -> 1262px reproduced). One `min-width: 0`
      fixes it; the pin measures the content column's width AND left
      across a real swipe, so a future cause of drift fails too
- [x] Two panes, not three: `PaneTimer.tsx` and `statusWord` retired
      with everything that existed only to render them; the codebase's
      first size-token scale (`--size-hero` … `--size-label`, portrait
      in `tokens.css`, landscape redefined once); the surface goes
      full-bleed in landscape with the 44px rail inside the sensor
      gutter, absorbing the safe-area inset instead of doubling it
- [x] The live pane: two heroes with their targets beneath in ink, a
      one-baseline metric row (left-in-interval · meters · HR), the
      dash where there is no target, and no cards anywhere
- [x] The notched bar (James's own call, overriding the packet's
      "unchanged" quarter ruler): one hairline per interval boundary,
      completed notches RE-ANCHORED to the machine's own elapsed,
      prediction stopping honestly at an unpriceable phase, the ruler
      back below a 16-boundary density floor, and the notch two-tone
      so it survives the fill edge
- [x] The warm-up is flagged, never counted (his late requirement,
      re-brainstormed rather than patched): `WARM-UP` with no ordinal,
      `WU` in the grid's number cell, a third bar tone that fills as
      the warm-up is rowed, and `ProgramInterval` carrying its phase
      type so no surface re-derives the fact
- [x] The grid: single-line rows, totals in the header, 8 visible in
      landscape at 32px and 15 in portrait at 40px — every count
      derived from a measured scroller, not asserted
- [x] End moves off its full-width bar into a 44pt outlined header
      control (a mis-tap hazard on a swiped surface), the empty footer
      goes back to the rows, and UP NEXT finally says how long the
      rest is
- [x] The phone timer joins the same language: ink `RUNNING`, ink
      targets, the token sizes, the gutter, the distance hero swap,
      Pause following the mockup, and the landscape rule block scoped
      to its own surface so it stops leaking onto the connected panes
- [x] Docs, captures and gates: the DEVIATIONS rows this wave owes,
      the retirement audit, and the last two screens carrying the
      `var(--tap)` overflow (`countdown`, `session-complete`)
- [ ] James's erg look (the phase exit, below)

**Follow-ons this wave declines** — the packet's own three open
questions (`docs/design/handoffs/2026-08-11-connected-revamp/README.md`,
"Open questions for the build session"), each unbuilt because the
answer is a hardware fact nobody has yet:

- **Projected finish split** per interval, if the driver layer can
  expose one — it wants the live pane's metric row.
- **Reconnect backfill**: whether the monitor can replay per-interval
  actuals for intervals completed while we were disconnected. The
  grid's backfill assumes yes; if not, those rows need the
  `— · MISSED` treatment DEVIATIONS already records as not built.
- **Distance intervals with a rate cap**: whether the programmed
  frame carries both, or the monitor drops the rate.

**Parked, found by this wave** (each is real, none is this wave's
scope):

- `scripts/stack-env.sh` derives per-worktree container names from
  `cksum % 100000` but its host ports from `cksum % 400`, so two
  worktrees can hold distinct stacks and still collide on `APP_PORT`/
  `POSTGRES_PORT`. Widen the port range or derive it from the same
  modulus.
- The fake-driven walk's **ordinal regression guard** lost its
  UI-level double-check when `statusWord` went (nothing else on the
  surface reads `frame.state` unconditionally; the wire decode itself
  stays covered in `monitor/driver.test.ts`). The named substitute:
  extend the walk one interval and assert the kind word, where
  `resting` genuinely flips `2 OF 5 · WORK` to `· REST`.
- **Portrait's own dead 26px** on the connected surface — landscape
  reclaimed it in Task 3; portrait's equivalent is a separate
  decision nobody has taken.
- The recurring **`design.spec.ts` layout-settling flake**
  (`stableBoundingBox`, `:1677` and `:1697`, twice in two tasks, on a
  builder screen neither diff touched). Both passed on re-run; it has
  a pattern now and wants a tracked fix rather than another per-task
  footnote.

**Exit:** James's erg look, on his iPhone against a real PM5, one
item at a time —

- (a) both panes in landscape: the content column's left edge and
  width do not move when swiping LIVE <-> GRID (the reported bug, on
  hardware);
- (b) the notched bar against a real multi-interval piece with rest:
  the notch count matches the caption, and a completed interval's
  notch sits where it actually ended;
- (b2) the warm-up on a real PM5 (nothing in this wave has met the
  wire on this state, and it is the FIRST state a rower with the
  preference on reaches): the caption reads `WARM-UP` with no ordinal
  and `1 OF N` on the first work piece, the bar's leading span
  visibly fills as he rows it and still reads as not-work, and the
  grid's warm-up row is present but unnumbered;
- (b3) pause mid-piece: the paused block now OCCLUDES the bottom 52px
  rather than displacing content, which hides TOTAL LEFT and the bar
  on live and the caption plus the last row on the grid. James judges
  whether that trade is right;
- (c) both heroes readable at arm's length mid-piece, and the grid's
  rows legible at 8 visible.

**How it actually went (2026-08-13, two sessions on a real PM5).** (a)
PASSED — "it holds", the reported bug dead; James then found its
neighbour by hand, the gutter reading wider on the notch side, which
turned out to be perceptual rather than geometric (see Phase CR2's item
2). (b) PASSED against a real boundary. (b2) PASSED end to end: `WARM-UP`
during it, the span filling in its own tone as he rowed, then `1 OF 2 ·
WORK`. (c) PASSED. (b3) NOT judged: he confirmed the block covers TOTAL
LEFT and ruled the question into Phase CR2 rather than answering it in
isolation, "because it's fake".

The sequencing was inverted and it is worth recording why the phase felt
like it was creeping: this exit says a fix round comes BEFORE the PR, and
the PR opened first. Every walk finding then arrived against an open PR.
A close-out round of three tasks plus a review ran between the walk and
the merge, which is what the exit had always asked for, just later.

## Phase CR2 — Connected cleanup

**Status:** IN FLIGHT as three spec cycles (James, 2026-08-15): spec 1
"numbers" (R0 + item 0 + F7) MERGED (PR #99, 2026-08-15, `7c2be9f`) — its
follow-on dev-only record-and-replay harness merged too (PR #100 Stage A,
PR #101's stack-reap fix); F6 moved to spec 2 by ruling, then split again.
**Spec 2 "state axes" (items 3 + 1 + F6) is now two PRs** (James's ruling,
design spec §4): **spec 2a** — axes, mirror surface, pause state, driver
lifecycle, the interval clock fix, the terminal path, the suspicion verdict
— MERGED (PR #102, 2026-08-16, `d7271a3`); **spec 2b** — F6
alone, the one piece carrying a stored-shape field (`endedBy`) and a
destructive action — MERGED (PR #105, 2026-08-16, `beaef4f`). **Spec 3
"redesign" is IN FLIGHT** (branch `cr2-redesign`; spec
`docs/superpowers/specs/2026-08-16-connected-redesign-design.md`,
approved 2026-08-16 with the design-gate rulings: tester colors and the
32px row ruling govern over the handoff's stale values; CAL/ZONE, the
pane slide, and the swipe handler are all OUT). **Queued follow-up, no
phase owner yet — "session calories, folded":** the PM design gate
falsified the handoff's calorie premise by decoding both walk-2026-08-16
recordings — 0x0033's `totalCalories` is INTERVAL-scoped (resets to 0 at
every boundary; keystone ends reading 15 for a ~30-cal session) and the
0x0039 summary carries no calorie field, so an honest session CAL needs
the same register-fold discipline spec 1 built for distance, plus an
honest ramping fake (today's emits a constant 0 — nothing can go red) and
a walk row photographing the PM5's calorie display beside the phone. ZONE
rides behind it, needing a strap plus a max-HR source the app does not
have. Neither is CR2's; schedule when a phase wants them.
**A fourth SDD cycle
rode the 2026-08-16 walk's own finding: the rest-keying fix (PR #104,
spec `docs/superpowers/specs/2026-08-16-rest-keying-fix-design.md`) —
the stale-count rest clamp plus both walk recordings as permanent CI
regression tests. RELEASE-NOTE OBLIGATION for the phase tag: connected
session totals now read LOWER and correct (two independent corrections —
#99's register map and #104's clamp — lower the same number); the notes
must say so plainly so a tester can check rather than guess. The phase
walk before the tag owes a REST-BEARING row with both screens in one
frame — the 2×250 r0 keystone contains no resting frames and cannot
exercise the clamp on hardware.** The reducer this spec
once proposed is DEFERRED to its own spec. Spec 3 "redesign" (items 2 + 4,
design handoff committed at `docs/design/handoffs/2026-08-15-connected-v2/`)
is MERGED (PR #109, 2026-08-17, `3dc3b06`) — ALL FIVE CR2 code cycles are
in main, and the exit walk's WIRE PASS ran the same day and PASSED
(`docs/monitor/sessions/walk-2026-08-17/`): the keystone re-run within
0.2m, PR #104's clamp fired twice live and keyed correctly, F6's row and
Log it landed, END finals written, the READY frame photographed, and
James's real-device screenshot banked the landscape-notch check. One
finding, F-1 (the 6-MIN reading), is UNREPRODUCED after a full bisect —
see the walk README; instrumented for re-observation. The close-out PR (#111)
and notes PR (#112) MERGED and v0.10.0 TAGGED 2026-08-17; the phone
pass's items (portrait rotation, mis-hit, triple-tap, the iOS-26 100dvh
portrait eye, the on-device bottom-gap ruling) plus F-1's re-observation
are OWED POST-TAG against the shipped build — counted at the next gate,
per the PW phase-open PM's own finding that they outlived the tag they
were meant to gate.
**Close-out queue after #109 merges, before the tag (PM phase-close gate +
antagonist exit pass, 2026-08-16):** (1) the STALE-WHILE-ARMED ruling —
stale beats armed in `connectedAxes`' precedence, so a link lost before
stroke one drops every armed protection at once (READY becomes a gold
session-left on GRID, up-next shifts, the bar fills); the exit walk's
Session 4 observation row records what it actually shows, then James rules;
(2) spec 2b's v1 fall-through test + the manual-door-save record decision
(PR #105 final review Minor 3); (3) the Start door's "in progress" copy for
a dead MonitorRun (2b plan Decision 5); (4) the CARRIED-DEBT DISPOSITION —
the exit criterion's own words are "cleared or explicitly re-parked with a
reason" and the eleven-bullet block below has zero dispositions; the
close-out PR writes one per bullet, with the iOS 26 `100dvh` bullet
getting a real answer (this PR rebuilt the surface height model that
construction underpins). **(5)-(7), James's walk-day flags (2026-08-17,
from the mobile-view screenshot):** (5) the landscape header sits flush
with the top edge where the safe-area inset is 0 — §2A's own 20px top
padding was dropped in favor of the bare inset; fix is
`max(20px, env(safe-area-inset-top))`; (6) dead space below the band,
MEASURED (close-out fix round, 2026-08-17): the visible gap under the
band = the pane's own 12px design padding (§2A's stated bottom padding)
+ the device's home-indicator inset; shrinking it means overriding the
handoff's own 12px in landscape and/or letting content approach the
indicator zone — James rules ON DEVICE at the phone pass; the
2026-08-17 close-out's first attempt moved the inset into the band's
unpainted box and changed nothing, reverted; (7) the landscape up-next
line prepends `NEXT · ` ALWAYS
(`NEXT · REST 3:00 · then WORK 2:09.0`, `NEXT · FINISH`) — James's
ruling direction: a bare `FINISH` floats without the label layer, and
uniform beats special-casing; portrait keeps its stacked `UP NEXT` label,
no double-labeling. **(8) the walk's 6-MIN question:** the F6 log header
showed `AUG 17 · 6 MIN` where the wire's completed intervals compute 5
(60+60+120 work + 0+30+30 rest = 300s); a NUMBER discrepancy → triad →
full treatment; reproduction assigned offline against the committed
session-2 wire + ring. Originally scoped by James 2026-08-13 immediately
after v0.9.0 shipped: "I want to work next on cleanup for this phase" —
three items, below. **AMENDED the same evening**, after he rowed "Sun
fret" on v0.9.0 and photographed the PM5 beside the phone: two more items,
and one of them (item 0) is a correctness bug in numbers the rower reads,
so it leads. **Items 2 and 4 are both going through Claude design first**
— they are the same question asked twice, and answering them apart risks
two answers. **Phase CP ("the pause that isn't") is folded in as
item 1 and no longer has its own section**; it was filed 2026-08-12 and
would otherwise be a second home for the same work. **Release deferred to
the whole phase** (James's ruling): CR2 releases only when specs 2 and 3
are both done; the walk rides the phase's next erg session, not this PR's
merge.
**Goal:** finish what Phase CR started. Everything here was found by the
wave itself, by its adversarial reviews, or by James on the erg, and every
item is written down with the evidence rather than the symptom, because
the phase is being PARKED at this line and whoever picks it up will not
have the conversation.

---

### Item 0 — The session totals are wrong on the wire (NEW, 2026-08-13, and the most serious thing here)

**Found by James rowing "Sun fret" on a real PM5, with the monitor
photographed beside the phone.** Two symptoms, almost certainly ONE cause,
and both are numbers a rower reads and trusts.

**Symptom A — TOTAL M is badly wrong.** The PM5's own screen read
`4384 m total` (interval 2, 3933 m in that interval, 2:17.3 average). The
app read **`TOTAL M 16938`** on the same piece at the same moment. Roughly
3.9x. An earlier shot in the same session, during interval 1's rest, read
`TOTAL M 12529`.

**Symptom B — TOTAL LEFT hit 0:00 during the FIRST rest and never
recovered.** The bar was fully filled with `WORK 2:15.0 · then FINISH`
still up next, and stayed that way through interval 2. James: "the progress
bar filled up prematurely at rest and never recovered."

**Why one cause is likely.** `surfaceModel.ts` computes
`totalLeftSeconds = max(0, totalSeconds - frame.sessionElapsedSeconds)`, and
the METERS cell is `frame.sessionDistanceMeters` — the same accumulator
pair. Over-accumulate the pair and you get exactly this: meters far too
high, and TOTAL LEFT driven past zero, where the `max(0, …)` clamps it
permanently.

**Where it lives.** `app/src/monitor/driver.ts:1681-1692`, "THE SESSION
FOLD". 0x0031's elapsed and distance both reset at each new work interval,
so the driver banks the previous interval's pair into
`offsetElapsed`/`offsetDistance` when it sees the clock DROP by more than
`SESSION_RESET_ELAPSED_DROP` (2 s, `:830`).

**THE CAUSE IS KNOWN. The hypothesis previously written here was WRONG on
both counts and is kept only so nobody re-derives it** (see
`docs/monitor/state-architecture-review.md` §F2, which measured it).

It guessed that the clock drops at work/rest boundaries. Measured on the
committed captures: work→rest **never** drops the clock (0 of 7 — it runs
straight through the rest), and rest→work drops exactly once and correctly
(4 of 4). An investigator following the old text would have confirmed four
boundaries, four banks, and found nothing.

**What actually happens:** the fold's founding premise — asserted in the
driver at `:1062-1063` and again on the public type at `types.ts:37-39`,
that "BOTH fields reset TOGETHER at each new work interval" — is false on
the wire. Across the captures there are 25 elapsed-drops over the 2 s
threshold and **9 of them do not reset distance at all**. Every one of
those carrying real distance is a TERMINATE: elapsed jumps backwards to a
smaller NON-ZERO value while distance stands exactly still (CSAFE-DEF
footnote 12, quoted in the driver's own comments twenty lines above the
bug). The fold banks a distance the machine never cleared, then keeps
counting it. Reproduced three times independently, twice through the real
`createPm5Driver`: a 24 m piece ended by Terminate reports **47.8 m,
exactly 2.00x**; a segment with no completed interval at all reports
108.4 m against a truth of 0.

**No threshold change fixes it** — six of the nine bad drops are between
11 s and 87 s, far above anything that still catches a real 60 s interval.

**The oracle previously prescribed here is also unsound** and would have
misled. It proposed summing the `boundary` actuals; the captures contain
zero events of that name (14 are `intervalComplete`), some intervals emit
none at all, and the two quantities are not the same thing even when both
are right — 0x0031's per-interval pair includes the trailing rest, and one
measured 30 s rest contributed **76.1 m** of coasting. On the one sound
segment in the record that oracle reports a 2.14x failure for a fold that
is correct. **The sound oracle is the sum of each interval's own final
pre-reset reading**, independent of the boundary path.

**The fix is a change of kind, not of tuning:** the accumulator is
edge-triggered where it must be level-triggered. The machine already
publishes an absolute Total Work Distance; the captures carry it
(`totalWorkDistanceMeters`, seven samples). Concept2 ship an
accumulate-it-yourself counter on ANT+ and an absolute total on BLE, and
we implemented the ANT+ model on the BLE interface. Still do not revert
the fold blindly — it was the walk-4 fix for the opposite bug (TOTAL LEFT
rising at interval 2, METERS falling 109 -> 50).

**AND IT IS A PREREQUISITE, NOT A PARALLEL ITEM.** The same nine lines
that overcount today undercount by up to the whole session across a link
gap: a measured 237.0 m reported for a 455.1 m piece, and one outage shape
where an entire 261 m interval vanishes with no event, no log line and no
visual difference. A fold cannot survive a gap by construction. **The
parked reconnect work depends on fixing this first.**

**Do R0 before designing anything.** `logSummaryTotals`
(`driver.ts:2001-2018`) already prints 0x0039's decoded whole-workout
totals; it does not print the accumulator. Add
`sessionElapsedSeconds`/`sessionDistanceMeters` and
`raw.totalWorkDistanceMeters` beside them, plus a `divergence` entry when
the fold banks. One string, no behaviour change. On "Sun fret" it would
have printed `0x0039 decoded: distance=4384m` next to an accumulator
holding 16938, in the app's own stash, with no camera — and BOTH of this
item's verification routes are blocked without it, since the iPhone has no
per-frame capture, only the ring.

**What makes this findable now and not before:** the erg's own total was
photographed next to the app's. Any fix should be walked the same way, with
both screens in one frame.

**REPRODUCIBLE WITHOUT HARDWARE — and already reproduced.** The captures in
`docs/monitor/sessions/` were replayed through the real `createPm5Driver`
during the architecture review and the overcount falls out at 2.00x on the
Terminate segment. Use the SOUND oracle described above (each interval's
final pre-reset reading), not the boundary sum. Write the failing test
first; it fails today on committed data.

---

### Item 1 — Fix the pause behaviour (was Phase CP)

**The confirmation, from our own record.** There is no paused state on the
PM5 wire. `MonitorFrame.state` is
`idle | armed | rowing | resting | finished | terminated`, its own comment
says "There is NO paused state on the wire", and a test asserts `state`
never equals `"paused"`. We send the monitor nothing when we show PAUSED:
no pause command exists in the driver, and none is implementable — the PM
starts on the first stroke and `SET_STARTTYPE` is `<Not implemented>` in
rev 0.27. **The clock keeps running**, on hardware: the 2026-08-08
recording shows LEFT IN INTERVAL counting 4:38 -> 3:47 with meters pinned
at 30, split at 4:16.1 and rate at 68. That fact is already load-bearing —
it is WHY `elapsedSeconds` is excluded from `freezeKey`, since a key
containing a running clock never repeats and PAUSED could never fire.

**So one word means opposite things on two surfaces the revamp taught to
look alike.** On the phone timer `pause` is a COMMAND: `engine.ts` sets
`pausedAt` as the clock's right edge and `resume` folds the span into
`pausedTotalMs`, so time genuinely does not accrue. In connected mode
PAUSED is an OBSERVATION derived from three metrics freezing for
`PAUSED_FRAME_HOLD` frames. Nothing is suspended; the interval is draining
the whole time the word is on screen.

**And the block hides the evidence.** `.connected-paused` is
`position: absolute; bottom: 0; height: 52px` on an opaque `--ink` fill, so
it OCCLUDES TOTAL LEFT and the progress bar — the two elements that would
show the clock still running. James confirmed this on hardware
2026-08-13 ("the total left") and ruled it into this phase rather than
judging it in isolation: "we're revisiting pause in a future phase because
it's fake."

**Open questions, none decided:**

1. Is the honest word STOPPED, or RESTING, or "NOT ROWING"? `PULL TO
RESUME` already carries the instruction; the noun above it overstates.
2. Should the block stop occluding TOTAL LEFT and the bar — or go further
   and make the still-draining clock the LOUDEST thing on screen while the
   rower is stopped?
3. Does the phone timer's real pause deserve visual separation from the
   connected observation, now that they share a design language?
4. Is there anything worth doing about the underlying reality — telling the
   rower how much of their interval they spent stopped, on the finish
   screen or in the log?
5. Distance intervals are UNWATCHED. The clock is expected to run on them
   identically, but the freeze has only ever been observed on a timed
   piece (the caveat `PAUSED_FRAME_HOLD` already carries).

**Also here:** the paused RATE hero has no suppression equivalent to the
split's (`livePace` suppresses at `surfaceModel.ts:367-370`; `rate` has
nothing at `:441-446`), so a stopped rower sees a dash beside a pinned
nonzero rate, both labelled NOW — and `surfaceModel.test.ts:558-583` has a
rate-shaped hole in its `paused` describe that hid it.

---

### Item 2 — Move the live/grid controls

**James is commissioning a design recommendation for this one** (his words,
2026-08-13: "i'll have claude design make a recommendation"). Do not
implement ahead of it. What follows is the constraint envelope any
recommendation has to live inside — all of it measured or primary-sourced
this week, in `<scratchpad>/revamp-artifacts/notch-research.md` (993 lines,
111 cited URLs, claims tagged PRIMARY/SECONDARY/INFERENCE) and
`gutter-thin-report.md`.

**What James wants:** the gutter thinner, the display wider. His own
framing: "what if we just always put the controls on the opposite of the
notch? And have a thinner band there? Goal is to maximize width used for
display."

**Six facts that bound it:**

1. **Apple states the landscape side inset protects the sensor housing AND
   the display's rounded corners**, and says to inset controls to avoid
   both (Tech Talk 801). The corner is not spare space.
2. **The corner, not the camera, sets the floor.** On these devices the
   landscape inset is almost exactly the corner radius (55 vs 59; 62 vs
   62). LIVE and GRID sit in the two corners. Pushed to the edge, the LIVE
   target loses 14% of its area off-display at r=55 and 19.6% at r=62 —
   an effective 40.8x40.8 against a hard 44x44 rule. Measured in James's
   own photos: the display boundary cuts 23.5-24.4px into the target.
3. **The notch's vertical extent is obtainable by nobody.** `css-env-1`
   defines four scalars; the variables we would want are CSSWG issue #4721,
   open and unimplemented since January 2020. The corner radius is private
   API even natively.
4. **The island is not a fixed size.** Apple publishes 230pt compact and
   371pt expanded while a Live Activity runs; at expanded, both targets sit
   inside it.
5. **iOS reports the inset on BOTH sides regardless of which side the
   housing is on** (44/44 through 68/68), and CSS cannot tell which side it
   is — by design. But `screen.orientation.angle` (90 vs 270) CAN, and that
   is the hinge James's idea turns on. It needs a device spike: the shell
   must be shown to report it correctly and update on rotation.
6. **Device spread matters** — deployment target is iOS 15.0, where the
   clearance collapses to 1px on a 12 mini and 6px on an X.

**Therefore:** switching sides alone reclaims nothing, because all four
corners are rounded. The win only exists if the switchers ALSO leave the
corners for the middle of the edge, which is the one region clear of both
the housing and both corners. Then the notch side keeps its content
clearance and carries no controls, the other side needs only the 44px the
targets occupy, and content goes from roughly 676 to roughly 738.

**What that costs, and what the design recommendation must rule on:** the
rail changes sides when the phone is rotated; the switchers move from the
corners to the edge's middle, changing thumb reach; and JavaScript enters
layout, on a screen read mid-piece.

**A 65px middle path exists and was rejected for now** — the corner-radius
floor rather than the camera's, a 37% narrowing with both targets whole and
content unmoved. It hard-codes a radius `env()` never exposes and that
already grew 55 -> 62 on the 16 Pro, and it still sits inside the strip the
OS expands its island into.

---

### Item 3 — Handle the red 0

**The symptom:** before the first stroke the PM5 reports `spm: 0`, a real
number, so it is judged against the rate target and the hero paints RED.
The screen tells a rower who has not started that they are behind. The
split has no reading at all, so it renders the house DASH at
`--size-hero` — a 104px black rectangle. James, at the erg: "spm starts red
as 0 but should start -".

**It is not a value bug, it is an unmodelled state.** `surfaceStatusFor`
returns `null` for `ready` and `surfaceModel.ts:397` launders it with
`?? "live"`, while `ConnectedInterstitial.tsx:486-536` falls through to the
surface with the phase still `ready` the moment the rower taps "Show me the
numbers". **The whole model is told LIVE while the machine is ARMED.** The
red zero is one symptom; `nowLabel` reading NOW, the gold counting-cell
mark, and a full TOTAL LEFT bar are the others.

**A zero-rule would be wrong.** An armed PM5 reports the PREVIOUS piece's
rate — eight armed frames in our own captures read 13/16/43/46/50/80/88/96
with matching nonzero splits. So on piece TWO of any session the hero shows
a large number judged BLUE at a rower who has not pulled. James's "leave
spm 0" ruling covers the red zero and does not cover that.

**JAMES'S DESIGN DIRECTION, and the whole answer to the seam question**
(2026-08-13): "Let the erg drive. That's our golden rule. Match the erg,
even in pre-row state." The erg in WAITTOBEGIN does not tell a rower they
are behind. Mirror the machine; do not judge before the first stroke. That
keeps 0 on screen (0 is what the erg shows) and removes the verdict.

**HARDWARE QUESTION OWED, and it decides the fix:** on piece TWO, before
the rower pulls, what does the PM5's own screen show for rate? Our captures
prove the WIRE carries the previous piece's value; whether the MONITOR
displays it is unknown, and it decides whether we blank or mirror.

**Two traps for whoever implements this.** `transports/fake.ts`'s
`zeroedStatus` zeroes spm and split on re-arm, so tests written against the
carried-over case pass while proving nothing. And there is currently **ZERO
honest coverage of the armed state**: `buildSurfaceModel` is never called
with `phase: "ready"` anywhere in the tree, while `surfaceModel.test.ts:265`
pins `surfaceStatusFor("ready") === null` — the suite certifies both halves
of the contradiction separately and never composes them. Fifteen browser
tests walk THROUGH the broken state via `walkToSurface()` and immediately
`pumpUntilText()` past it. The gap is a missing fixture, not a missing
capability.

---

### Item 4 — Small type is unreadable at full pull (NEW, 2026-08-13)

**James, after rowing "Sun fret":** "any font smaller than WORK above the
target bar is hard to read. Not a problem in some places but makes
'warm-up', '1 of 2' and the 'now' above targets very difficult to read when
at full pull."

**He wants this worked through with Claude design**, alongside item 2 — the
two are the same question asked twice (what a rower can actually resolve
mid-stroke at arm's length), and answering them separately risks two
different answers.

**What is implicated.** Everything at `--size-label` (10px) and the
interval caption on the connected surface: the `WARM-UP` / `1 OF 2 · WORK`
line top-right, the `NOW` above each hero, `TARGET`, and the metric row's
own labels (`LEFT IN INTERVAL`, `TOTAL M`, `HR`). The `/500m` and `SPM`
units added the same day are the same size.

**Note the tension before redesigning.** Arm's-length legibility of the
BIG numbers was verified on hardware the same day and passed — "yes",
both heroes and the grid rows readable mid-stroke. So this is specifically
about the small supporting type, and the fix cannot come out of the heroes'
budget without re-walking (c). The landscape metric row already fits three
labels on one line, which is why `TOTAL M` is abbreviated at all.

**Related, already recorded:** the `--ink-4` floor (5.29:1 on `--surface`,
4.76:1 on `--page`, and BANNED at this size against `--surface-sunken`
where it measures 4.48:1) constrains how much contrast can be traded for
size, and `design.spec.ts`'s `assertNoFailingInk4Labels` sweep enforces it.

---

### Infrastructure — PM5 record-and-replay harness (NEW 2026-08-15)

**Not a rower-facing item — filed here because this phase is where it pays
off first.** Serves CLAUDE.md recurring failure #11 (when the machine
reports a number we also compute, compare them) by making that comparison
possible in CI with no hardware. Full design, research pass and scope
ruling: `docs/superpowers/specs/2026-08-15-pm5-record-replay-design.md`.

**Stage A — shipped this PR.** The recording tap
(`app/src/monitor/transports/recording.ts`) captures every transport event
unfiltered and undecoded (scan, connect, subscribe, notification, write,
disconnect) behind the existing `fakeMonitorEnabled` gate, dev-only and
dead-code-eliminated from production; a "Download recording" control in the
connected log sheet's diagnostics saves it gzipped via the
`window.__pm5Recording__` seam. The barrier-gated replay transport
(`replay.ts`) holds recorded rx events until the driver issues the matching
recorded write, never on the recorded clock — a recorded gap between
subscribe and the first programming write is how long a rower took to press
a button, not a delay replay should reproduce. A record-to-replay round trip
over a synthesized session (the fake transport driven through a real
`createPm5Driver`, replayed into a fresh driver, outputs compared) proves
the tap and scheduler; `app/scripts/dist-grep.sh` carries a new
`pm5-recording/v1` string-literal needle, proven to bite.

**Stage B — gated on spec 2's hardware walk**, which must run Chrome/Web
Bluetooth from the dev server with the recording tab foregrounded (the
phone's native adapter routes past the tap and records nothing). **The walk
protocol opens with a download dry run, before any rowing** (PM final-gate
note, 2026-08-15): no test can reach `downloadRecording`'s gzip arm under
jsdom, so the one file the walk exists to produce is written by an
untested path. Chrome exposes `navigator.bluetooth`, so the tap and seam
exist before any PM5 connection: open the connected screen, open the log
sheet, click Download, gunzip the file, run it through `parseRecording`.
Two minutes, no erg; a failure found here costs nothing instead of a
re-walk. Evaluate exit criterion 2's inter-arrival distribution BEFORE
trusting the walk's numbers — the tap now sits in the walk's own path and
is a suspect that did not exist last time. A Vitest
CI rung drives the real driver through the committed real recording and
asserts our derived totals against the machine's own wire numbers, decoded
by a reader that never shares code with the driver under test. Exit
criteria, each independently falsifiable:

1. **The keystone replays** — a recorded 2x250m r0 row reproduces the
   accumulator against machine TWD to the re-walk's tolerance, with no
   hardware and zero divergences.
2. **Recording does not change the session** — the walk's app numbers still
   agree with the photographed PM5 screen, and the recorded 0x0031
   inter-arrival distribution matches the committed baseline.
3. **The rung can go red** — a deliberate mutation of the register map's
   write rule turns it red; restore, green.
4. **The instrument captures the boundary** — every work/rest boundary in
   the walk carries the full 0x0031 state-byte sequence and every 0x0033
   sample with its Interval Count, in arrival order.

**UI replay rung — filed as a spec 3 follow-on, not this phase.** The
full-UI e2e rung and the dev replay viewer are cut from Stage A/B: the
surface they would assert against is what spec 3 is about to rebuild
(`docs/design/handoffs/2026-08-15-connected-v2/`), and asserting byte-level
injection needs a type `FakeScript` doesn't have (it is semantic, not
byte-carrying).

**Tier 2 on-device recording — trigger-gated, not scheduled.** Fires only
when a defect surfaces on-device that the dev/web recorder cannot see.
Prerequisites before it is built: a hard byte bound, a persist trigger that
is not the terminal transition, an export path that exists (there is
currently zero IndexedDB in `src/`), and the on-device delivered rate
confirmed. **The on-device rate cannot come from this phase's dev/web
walk** — the iOS cadence is already documented as a platform difference
(~90-180ms status-tick spacing vs the desktop's ~2/s,
`pm5-interface-notes.md` §21 item 3), not something a desktop walk can
measure.

---

### Carried debt — DISPOSITIONED at phase close (2026-08-17, the exit's own "cleared or explicitly re-parked with a reason" clause)

- **Correct the record first (the rotation-fix artefact).** CLEARED —
  `DEVIATIONS.md`'s safe-area row was amended 2026-08-13 with exactly this
  truth (the `max()` is INERT on iOS, KEPT for Android's `DisplayCutout`),
  and spec 3's safe-area relocation carried the corrected story into the
  moved declaration's own comment.
- **`MONITOR_SPM_MIN = 0`** persists a zero average rate as real. RE-PARKED
  — still true at `logDraft.ts:677`; changing the floor changes what gets
  PERSISTED (a dropped-vs-kept reading), which is triad territory, not a
  close-out one-liner. Owner: **Phase LT spec 1** (re-owned 2026-08-18;
  Phase LG closed without it — the floor becomes 1, justified by the
  field's u8 type).
- **The phone timer's landscape gutter absorbs no left inset.** RE-PARKED —
  untouched by CR2 BY RULING (spec 3's fork condition: the redesign must
  not reach the phone timer). Fix known and cheap; owner: the next phase
  that touches the timer surface.
- **Portrait's dead 26px on the connected surface.** CLEARED by
  supersession — spec 3 rebuilt the portrait frame outright (54px control
  bar as the last row, full-height column) and re-shot every portrait
  capture; the live pane's no-dead-scroll assertions pin the new frame.
- **`LEFT IN INTERVAL` wraps to two lines.** CLEARED by deletion — the cell
  no longer exists (spec 3 cut it from LIVE; the countdown lives in the
  grid's active row).
- **iPhone 17 / Air 20pt landscape top inset.** CLEARED by ruling — spec 3
  §1: no device constant assumed anywhere; the header honours
  `env(safe-area-inset-top)`, the close-out added the `max(20px, …)` floor,
  and the grid's visible-row count is pinned at zero inset with scrolling
  under any nonzero one.
- **`height: 100dvh` under `viewport-fit=cover` broken on iOS 26 (WebKit
  315945).** RE-PARKED WITH EVIDENCE — the construction survived spec 3's
  rebuild unchanged, and James's real-device landscape screenshot
  (2026-08-17) renders the full frame correctly; the phone pass's portrait
  check is the remaining eye. The WebKit bug stays open upstream; if the
  phone pass shows a broken height, it becomes a pre-tag fix.
- **`stableBoundingBox` returns an unsettled box after 20 rAF.** RE-PARKED
  — still true (`e2e/helpers.ts:59`); no gate has flaked on it since the
  design-assertion rewrite (the §2 sweep reads computed style far more than
  boxes now). Infra hygiene; owner: next e2e-touching round.
- **`stack-env.sh` port collision odds (`% 400` vs `% 100000`).** RE-PARKED
  — still true (`stack-env.sh:29-34`); with per-worktree stacks torn down
  at merge per the standing teardown rule, live-stack counts stay low
  single digits and the birthday odds are negligible in practice. Infra;
  fold into the next scripts change.
- **The ordinal-guard substitute (less `frame.state`-to-surface integration
  coverage).** CLEARED by supersession — 2a's exhaustive axes table plus
  spec 3's per-frame property sweep (armed/live/stale/finished each with
  named e2e witnesses against real fixtures) now cover the state-to-surface
  path more heavily than the pre-CR wave did.

**Exit:** items 0-4 shipped and walked on a real PM5, R0 and F7 (spec 1) and
F6 (spec 2) delivered, and the carried debt either cleared or explicitly
re-parked with a reason. (The record correction that was listed here
shipped early, in PR #91. R0/F6/F7 were added to the phase 2026-08-15,
inside spec 1's and spec 2's scope, without this line naming them until
now — PM ruling.)

**Walk the exit the way item 0 was found:** the erg's own screen
photographed in the same frame as the phone's. Every number this phase
touches — session metres, TOTAL LEFT, the interval count — is checkable
against the monitor, and the app disagreeing with the erg by 3.9x survived
a nine-task wave, three adversarial reviews and a five-item hardware walk
because nobody had put the two displays side by side.

## Phase PW — The post-workout summary

**Status:** OPENED 2026-08-17 (absorbs Phase LG's precondition). Design
handoff committed at `docs/design/handoffs/2026-08-12-post-workout/`
(README + PROVENANCE with James's four brainstorm rulings and five
corrections — the 2026-08-12 handoff predates the CR2 walks and is
overruled where they falsified it). Spec 1 at
`docs/superpowers/specs/2026-08-17-post-workout-summary-design.md`,
phase-open gates run (PM GO-WITH-CONDITIONS + antagonist anchor, both
folded in; the anchor's vetted ground is the spec's §7).
**Goal:** the post-row flow tells the rower what they did before asking
how it felt — avg-split/time/distance heroes, per-interval deviation
bars, an optional reflection (thumbs feeds future generation), and save
choices; restores an erg-checkable session distance.
**Decomposition (James):** spec 1 = the summary replacing
SessionComplete + all log doors, from data already recorded (plus the
one wire addition: 0x0037's Interval Rest Distance, so DISTANCE matches
the machine); spec 2 = from-the-log (history surface + the API's first
UPDATE — may split); spec 3 = traces + HR, GATED on series-capture
research (sampling rate, storage budget).
**Standing rulings:** UNDER = FASTER than target; reflection optional
(nothing blocks saving); the null-tolerant READ ships and tags
(v0.10.1) BEFORE the nullable writer merges; TIME on monitor doors is
measured (work + completed rests), never wall-clock — the notes PR says
times read lower; `MONITOR_SPM_MIN` is its own triad PR, not spec 1's.
**Exit:** spec 1's §6 criteria; spec 2 and 3 add theirs at their own
opens; the v0.11.0 tag follows spec 1's notes PR per the release
process.

**Spec 2 "from-the-log" (James's 2026-08-18 brainstorm; design spec
`docs/superpowers/specs/2026-08-18-from-the-log-design.md`):** OPENED
2026-08-18 as a six-task decomposition — migration 0010 + the API's
first UPDATE; the API's round trip + posting; the from-the-log view's
own pure model; the history list + Today's link into it; the detail
view's read-back/edit/back-label; Plan's done-row links + the §4
navigation-flow sweep + reconciliation. Tasks 1-5 landed on branch
`pw-log`; **Task 6 (this branch's final task) completes the
decomposition** — Plan's tap-through, the §4 N1-N7 sweep gathered into
one describe (spec §7 criterion 1's own requirement), the remaining §5
design witnesses, and criterion 4's own e2e (advance a plan by saving,
the done row opens the log that advanced it, Reset leaves that log's own
footer unchanged). §7's nine exit criteria are evidenced in the task-6
report; branch PENDING James's review before merge and the v0.12.0 tag
(§7 criterion 7 names that version for the notes PR).

## Phase CS — Connected polish: the swipe returns, NEXT says more

**Status:** SHIPPED 2026-08-17/18 (#116 the enriched NEXT line, released in
v0.11.0; #119 the swipe, released in v0.12.0; #120 the walk-skill and
instruction-evidence fixes). Recorded here at the PM's third
roadmap-absence finding — this section was written at CM's final gate, a
phase late, which is itself the finding.
**What shipped:** the footer names the next interval
(`NEXT · WORK 2000m · 2:06.0 @22`); swipe LIVE↔GRID returned after a
device probe convicted our own `[role]` guard wildcard (not WebKit) of
refusing every grid-origin drag; `user-select` off the swipe surface.
**Standing facts this phase established** (full record:
`docs/monitor/sessions/probe-2026-08-17-swipe/README.md` and
`walk-2026-08-18-swipe/README.md`):
- The fake monitor CANNOT drive a native build — `monitorTransport.ts`
  takes the Capacitor arm whenever `isNative()`; walks connect to a real
  PM5, no rowing required for screen-only checks.
- `touch-action` must sit on the grid scroller itself (intersection stops
  at the first scroll container); deleting it reddens the gesture, not
  just a style pin.
- A drag steeper than 45° starting in the rows scrolls instead of paging.
  Cause UNSETTLED (our own dominance rule is the leading candidate, not
  WebKit — the #303 citation was corrected at the exit pass); the shallow
  off-horizontal drag rides CM's walk.
- [ ] Follow-up: the e2e stack-reap race (a sibling worktree boot once
      produced 117 ECONNREFUSED; suspected `stack-reap` racing
      `git worktree list`) — previously filed only in #116's PR body.
- [ ] Follow-up: `connection log text is no longer hand-selectable`
      (`user-select: none` inherits into the sheet); COPY LOG is the only
      route out — fine while COPY LOG works, a trap if it ever breaks.

## Phase CM — Connected metrics: the interval's average, the session's metres

**Status:** MERGED #123 (main `3d0088c`, 2026-08-18), released as
v0.13.0. Exit walk PASSED (`docs/monitor/sessions/walk-2026-08-18-metrics/`):
three totals sub-metre in one frame, AVG digit-identical to the monitor's
own average, WebKit convicted on the off-horizontal swipe cancel with the
`pointercancel` readout's first field evidence. Post-merge, James's calm
rule quantised the counter to 5m steps (rounded — floor was falsified at
the walk's own finish) in a width-pinned slot. TRIAD (number semantics).
Spec at
`docs/superpowers/specs/2026-08-18-connected-metrics-design.md` — blocked
once in full by the antagonist and rewritten; every load-bearing claim
decoded from committed captures.
**Goal:** `3,842m` on the progress-bar row (the driver's reconciled
accumulator — the machine's own TWD field is frozen during work and
rest-inclusive, proven unusable live); the interval's average
(`0x0033`'s own value) beside the target, judged only during rests.
**Wire facts banked:** TWD = work + rest exactly (1599 = 1535 + 64);
`0x0033` holds the finished interval's average through the whole rest
(≤0.2 s vs the boundary record); the emitted interval referent lagged
450-540 ms at boundaries and is now monotone (both driver clamps
mirrored).
- [x] The walk (spec criterion 2), DONE 2026-08-18: pyramid program with
      DISTINCT targets, phone + monitor photographed mid-work AND
      mid-rest, the summary screen photographed after (three totals, one
      record), the final-interval-verdict question, the shallow drag.
      Record: `docs/monitor/sessions/walk-2026-08-18-metrics/`.
- [ ] Follow-up (PM final gate): cross-pin `sessionDistanceMeters`
      against `monitorDistanceMeters` (the summary's Σ over
      IntervalActual) over the same capture — two derivations of one
      user-facing quantity currently ship on two screens with nothing
      comparing them; the replay harness exists, it stubs `actuals: []`.
- [ ] Follow-up: a `connected-pane-rest` fixture/screenshot — the one new
      colour this phase adds has no committed picture of its judged state.
- [ ] Follow-up: the fake's `restDistanceMeters` resets with no ~3-frame
      lag (fine while nothing renders it directly).

## Phase LT — The log screen tells the whole truth

**Status:** OPENED 2026-08-18 (absorbs the target-judgment and discard
bugfix rounds; both QUEUED entries below re-dispositioned). Spec 1 at
`docs/superpowers/specs/2026-08-18-target-truth-design.md`; phase-open
gates run (PM GO-WITH-CHANGES + antagonist anchor, both folded; the
anchor's attacked-and-held claims are the phase's vetted ground, in the
ledger). LT-0 SHIPPED (#128). **Spec 1 IMPLEMENTED 2026-08-19** (Tasks
1-4 done on branch `lt-truth`: the split/floor/server bound, the row/SPM
model and shared band, both renderers, and the witness sweep +
reconciliation) — awaiting final review, the triad's PM final-PR gate,
and James's merge approval. **Spec 2 IMPLEMENTED 2026-08-19** (Tasks 1-4
done on branch `lt-series`: the decimating recorder, the flush policy +
localStorage sacrifice, the server `series` column + route-scoped 1mb
limit + POST sacrifice, and the remaining storage proofs — S2's real-
Chrome byte-identical probe, S3's real forced-quota leg, the fake-driven
full loop through `GET /:id`) — awaiting final review, the triad's PM
final-PR gate (TRIAD: two stored shapes, `MonitorRun.series` and the
jsonb column, plus an invented mechanism — §7's own citation), and
James's merge approval. This spec ships no notes clause of its own
(§6 exit criterion 7: internal-only, rower-invisible until spec 3 renders
the trace — stated here so the next release gate does not go hunting for
one). **Spec 3 IMPLEMENTED 2026-08-20** (Tasks 1-3 done on branch
`lt-traces`: the pure scale/axis primitives, the trace model + hand-rolled
SVG chart component, and both hosts wired below their own intervals block
with the witness sweep + recaptured `log-monitor`/`log-monitor-landscape`/
`log-detail` screenshots) — awaiting final review, a PM final-PR gate
(NOT the triad's full treatment: no number's meaning changed, no stored
shape moved, no auth touched — spec §8's own "the antagonist pass is a
DELTA pass" ruling), and James's merge approval. **Owed at the next tag**:
exit criterion 8's own notes clause — "your connected sessions now draw a
trace — pace by default, stroke rate and heart rate a tap away; sessions
rowed before this release have no trace to draw."
**DISCHARGED** as v0.14.0's fifth clause (PR #132).
**Goal:** the summary's interval rows answer "did I hit MY targets" —
target inline, judgment vs the row's own target with the connected
surface's shared ±0.5s band, stroke rate shown (`24 / 22`), and discard
wherever save is.
**Slate:** LT-0 = the discard fix (its own small PR, FIRST — the manual
door is the app's only discard-less save surface and the monitor path's
fallthrough); spec 1 = targets/judgment/SPM (TRIAD: number meaning +
stored shape); spec 2 = series capture (re-gated at its own open: memo
committed, storage ceiling ruled); spec 3 = traces, pace/rate/HR all three
(the HR descope lifted 2026-08-19 — the phase-close erg bundle's own
S5b pass witnessed a real belt on the wire, ROADMAP's own "unblocks spec
3's descoped HR leg" line above).
**DISCHARGED in v0.14.0's notes (2026-08-20, PR #132 — the entry ships
five clauses; range v0.13.0..main re-settled with `git merge-base
--is-ancestor`, and #130's series capture is deliberately unnoted per its
own criterion 7). Kept here as the record of what was owed:**
four notes clauses: (1) rows judge against their own targets with the
target shown (the erg ask); (2) stroke rate on measured intervals;
(3) discard everywhere save is (#128 — a NORMAL v0.14.0 clause; CORRECTED
at the 2026-08-19 PM gate: v0.13.0 is `e22bc31` (#126) and #127/#128/#129
all landed AFTER it, so nothing here is retroactive — settle tag membership
with `git merge-base --is-ancestor <sha> vX.Y.Z^{commit}`, never by reading
a tag message or a ledger line); (4) HISTORY RE-JUDGES TOO — sessions already viewed
change colour (tule-fog rows go red→blue), plus #124's accepted re-log
gap if still unannounced (retroactive, same chain).
**Owed upstream from spec 3's delta pass (capture-side, NOT fixed in spec
3):** `seriesRecorder.ts` stores `p`/`spm` of 0 for both "no reading" and
"the machine said 0" — 26% of samples across the committed captures carry
`p === 0`, 262 in state `rowing`. Spec 3 renders honestly around it
(zeros are absent, never drawn); a follow-up should decide whether the
recorder omits the field instead of storing a sentinel. Stored-shape
question, its own gate.

**THE PHASE-CLOSE ERG BUNDLE (James, 2026-08-19: "lets do those at phase
close").** Five parked device items now travel together as ONE session at
LT's close, so the close gate finds them in one place instead of
rediscovering five parked rows. Two need no rowing, three ride a single
rest-bearing piece:
- NO ROWING — CR2's phone pass items 5, 6, 8, still REQUIRED and owed
  since that phase shipped: the mis-hit test toward END, both-rotations
  occlusion (real safe-area insets; desktop Chrome reports 0 and no gate
  can see it) plus the iOS-26 `100dvh` portrait eye, and triple-tap
  diagnostics (`walk-phase-cr2-exit/RUNSHEET.md`, the tagged handoff list).
- NO ROWING — the stale-while-armed observation (same runsheet): arm,
  kill the link before stroke one, switch to GRID, record header/up-next/bar.
- ONE REST-BEARING PIECE, ~4 min, answering three at once: the same-frame
  DISTANCE photo (PW's PM-gate C3 row — the Sun-fret protocol aimed at
  the summary's DISTANCE hero, never yet checked on hardware); **F-2 from
  2026-08-19's walk** (that session's totals oracle went blind —
  `machineTotal` was sampled only before rowing, so the accumulator had
  nothing live to be checked against; a rest is where the CR2 walks
  sampled it successfully, and this piece tests whether the NATIVE
  transport samples it at all); and F-1's re-observation (the 6-MIN
  discrepancy, unreproduced since 2026-08-17 — read the TIME hero after
  ending and dump the localStorage record BEFORE pressing Log it).

**LT spec 2's accepted limit (PM gate C1):** POST /api/logs' route-scoped
1 MB body parser registers before auth, so the pre-auth buffer ceiling on
that one route is 1 MB (was 100 KB app-wide). Ordering pre-existing, no
amplification path, accepted; owner = the next server-touching phase.
**LT's device items live on CR2's runsheet** (`docs/monitor/sessions/walk-phase-cr2-exit/RUNSHEET.md`
— the standing phone pass James still owes): the iOS storage probe, the
`persist()` grant observation, and the fast-rate re-measure. **DONE 2026-08-19** (walk-2026-08-19-series: S2 PASS, S6 denied-as-predicted, fast rate ~10 Hz with the decimator unaffected — spec 3 is unblocked on this condition). **S5b MEASURED 2026-08-19 (second pass, laptop path): 5.04× compression on a real trace, ~30 KB per typical session, ≈9 MB/year per rower — #130's last inferred number is now measured.** That same pass WITNESSED HEART RATE for the first time (83→123 bpm on the wire), which unblocks spec 3's descoped HR leg. The PM ruling that produced them: **these land BEFORE spec 3 is implemented** — a device-specific
recorder defect would be invisible AND permanent (frames evaporate, the
record is immutable, PATCH refuses series), so the check moves in front of
the renderer.
**Riding follow-ups (PM gate 2026-08-19):** `pnpm e2e -- -g` needs the
double-dash form documented (pnpm swallows bare -g); a frozen-clock
screenshot fixture (17 captures churn on wall-clock date stamps);
`judge()`'s documented-unreachable dead-even branch (discriminated union
if a second producer appears); the live summary's judged-state capture
(closed by this PR's C1 recapture — verify at close).
**Standing rulings:** same dead band everywhere; SPM cell `24 / 22`;
supersedes PW spec 1's ROW semantics (its Measured-row cell points here);
retires the lone-row abstention for targeted rows; `MONITOR_SPM_MIN`
0→1 lands here (taken over from Phase LG, closed below).

## Phase LG — The log screen's own words

**Status:** CLOSED 2026-08-18 (the PM's third-gate callout: the
self-closing condition fired when #117 merged and nobody closed it).
Piece 1 (labels) SHIPPED in PW spec 1 (#117, option B). Pieces 2 and 3
remain out by the original ruling. The one surviving item this section
owned — `MONITOR_SPM_MIN` — is now Phase LT spec 1's (see above). This
section is a pointer, nothing more.
**Goal:** the post-row self-report stops using two words that mean the
opposite thing one screen away.

**Why it is its own phase, not a copy tweak.** `LogSession.tsx` offers
HELD / UNDER / OVER, backed by `api/useRecentLogs.ts`'s
`HeldResult = "held" | "under" | "over"` and, underneath that, a Postgres
enum — `pgEnum("held_result", ["held","under","over"])`, `notNull` on every
logged row (`server/db/schema.ts`). Three separable pieces:

1. **Copy only** (cheap, no migration): keep the stored values, change the
   button labels and whatever sentence frames them. Available today.
2. **The values themselves** (migration): renaming the enum members touches
   real tester rows and wants a considered plan.
3. **The question** (design): "did you hold your target?" is a different
   question from the live judgement the connected panes make, and the answer
   set may not be three buttons at all.

**The collision that makes this urgent.** As of 2026-08-13 the live
judgement renamed `"over"`/`"under"` to `"faster"`/`"slower"` (blue/red,
DEVIATIONS' own row), because James had been reading "under" as FASTER while
the code meant SLOWER. The log screen still uses the old pair, for a related
but distinct question, with no stated direction at all. A rower who learns
the panes' vocabulary now meets its opposite on the screen right after.

**Also on this screen, unresolved:** which direction UNDER/OVER even mean
here is not written down anywhere — code, comment, or copy. Establish that
BEFORE renaming anything, or the rename ships a guess.

## Bugfix rounds

Ad hoc fix rounds outside the phase sequence — small bundles of device
reports and quick fixes shipped as their own PR rather than waiting on the
next phase. One line per round, newest first.

- **ANSWERED (PM final-PR gate, 2026-08-18, PR #121 → `docs/superpowers/
  specs/2026-08-18-log-delete-design.md`): a logged session can be
  deleted, remove-only, from its own from-the-log view.** Spec 2 made
  every log reachable and stored three client-supplied hero numbers the
  server bounds-checks but cannot truth-check; the measured record was
  immutable by design and `data.ts` had no DELETE route, so a Sun-fret-
  class wrong number was permanent. `DELETE /api/logs/:id` now removes
  the row; deleting your LATEST plan session un-ticks its checkmark
  (terminal-only, §2's three-condition rule — a middle delete keeps the
  tick, the plan counts sessions done and old history never renumbers
  it). **NOT fully closed — the spec's own §4 accepted gap:** a session
  with a WRONG NUMBER or logged against the wrong workout has exactly
  one remedy — delete it and re-log by hand — and `logged_at` is a DB
  default, not settable, so a mistake found the next day can't be
  re-dated onto its own day, and re-logging a non-terminal plan session
  appends at the top rather than refilling its old slot. Accepted as the
  cost of remove-only (re-association and number-editing were both
  DECLINED, James's ruling); the next spec that touches log lifecycle
  starts from this gap, not from rediscovering it. **The next release's
  notes carry the gap in plain words** (PM gate C1, 2026-08-18: spec +
  ROADMAP + notes is the full disclosure chain for an accepted limit).
- **QUEUED (final-review fix round observation, 2026-08-18): `today.png`'s
  regen diff showed an onboarding read-marker difference** unrelated to
  the branch that surfaced it — reverted there, unexplained. Owner: the
  next Today-capture pass; explain or fix before committing that capture.
- **ABSORBED INTO PHASE LT SPEC 1 (2026-08-18 — see the Phase LT section; originally): the
  INTERVALS section judges each interval against ITS OWN TARGET.** He beat
  every target in a three-interval session (2:14.9/2:13.4/2:11.5 vs
  2:17/2:16/2:15) and the screen painted two rows RED (+2.0/+0.5 vs the
  session average) with no target visible anywhere (multi-target sessions
  render no hint by the single-target rule) — the first real tester
  misread the baseline on his first real workout. His words: "that
  section needs to be about performance against target per int." Scope:
  per-row deviation/bars re-baseline from session-working-average to the
  row's own target (supersedes spec 1's R-C/R-E ROW semantics; the AVG
  SPLIT hero keeps the session average, neutral ink); the target renders
  INLINE per row (reverses #117's column removal, device evidence);
  no-target rows abstain (absence idiom); CAPTURE measured SPM per
  interval (wire delivers it, nothing stores it) and fold the parked
  `MONITOR_SPM_MIN = 0` floor item in the same round. Stored
  `LogStep.targetSplit` already exists, so history re-judges without new
  split storage; from-the-log's §5C updates in the same round. **TRIAD
  WEIGHT** (number meaning + stored shape): full antagonist on the spec,
  PM final-PR gate, despite the bugfix framing. Photos:
  `~/Desktop/tule-fog` at ruling time; the reconciled arithmetic is in
  the session record.
- **ABSORBED AS PHASE LT-0 (2026-08-18 — ships FIRST as its own PR; the fallthrough diagnosis is in LT spec 1 §3; originally): discard missing on an
  early-ended workout's summary.** He ended a workout early and the
  post-workout summary offered no "Discard without logging" — only save
  paths. Scope, his ruling: **audit every surface where SAVE is an option
  and ensure DISCARD is present beside it** (the spec-1 §2F save stacks
  per door, the interrupted-session row's doors, and any early-END path),
  not just the one repro. The house two-tap staged discard
  (`useStagedDiscard`) is the pattern. Runs as its own bugfix round AFTER
  Phase PW spec 2 merges; the repro screenshot is in the session record.

- **PR #TBD** (2026-08-09, "crosslink" round, full cycle) — the ui-notes
  round below fixed the reader's own NEXT link but missed the two IN-PROSE
  cross-links inside article bodies (`workoutTypes.tsx`'s "Picking a
  workout", `pickingAWorkout.tsx`'s "pain from 1 to 5" — raw
  `react-router-dom` `Link`s added in the persona round), so tapping one
  mid-chain still dropped the reading chain's origin and BACK/✕ fell back
  to NEWS (James's 2026-08-09 recording: Today → START HERE step 3 → the
  picking-a-workout article → the cross-link → ✕ → NEWS, not Today).
  `useReadingOrigin` extracts Reader's own origin-read (behavior unchanged,
  proven by Reader's existing tests passing untouched) and a new
  `ArticleLink` component — THE one door an article body may use to link to
  another article — applies `replace` plus the same origin-carry NEXT
  already had; a source-sweep test pins every future body against a raw
  `Link` reappearing. e2e locks down James's exact path plus the depth-lock
  he required: one `goBack()` through a cross-link hop, not just a NEXT hop.
- **PR #TBD** (2026-08-09, "ui-notes" round) — three James device notes
  post-v0.6.0: (1) the reader's NEXT link pushed with the wrong origin
  (`state={{from: location.pathname}}`, the article being LEFT, not the
  chain's true start), so mid-chain BACK fell back to NEWS and escaping
  took multiple backs — NEXT now replaces and threads the ORIGINAL
  `location.state.from` through unchanged, and the reader gains a 44×44 ✕
  Close (Today's own icon-control idiom) resolving the same origin BACK
  does; (2) the baselines editor offers to estimate whichever split is
  unset from the one that's real (`domain/deriveBaseline.ts`,
  `K2_K6_OFFSET_SECONDS = 7`) — an offer only, never automatic, bounded by
  the editor's own MIN/MAX split range; found capturing this state's own
  screenshot, the editor's "No baselines yet" prompt used to fire whenever
  EITHER side was unset, falsely denying a real, rowed value sitting right
  next to the new offer — narrowed to the genuinely both-unset case; (3) `yourFirstRow.tsx`'s "Prefer
  the short test?" paragraph and `baselines.tsx`'s two-baselines paragraph
  are rewritten to stop implying both baselines are needed with no way to
  get there without rowing both tests.
- **PR #TBD** (2026-08-08) — e2e retries actually retry: two red main runs
  traced to fixture non-idempotency, not code. The stack's users are
  find-or-create by email and its volume persists, so a mid-test failure
  stranded an imported fixed-title workout and the retry re-imported it
  into a strict-mode duplicate. `signInViaBackdoor` now suffixes every
  email with a per-process `RUN_ID`, the connected walks carry unique
  titles, and `library.spec`'s one-shot scroll read became a poll.
- **PR #TBD** (2026-08-08) — type rows unified to O2 · AT · TR · AN (the
  pyramid's base-first order) across Today's type-swap chips, the Library
  filter sheet's TYPE cells and Builder's classification card, with the
  design README amended to match; Today's plan line also gains the
  currently-effective type's descriptor word (`TYPE_WORDS`, extracted from
  `builderState.ts` to a shared `src/components/typeWords.ts`).
- **PR #TBD** (2026-08-08, round 4 on the same bug, architectural) — the
  reader and release-notes screens become fixed overlays (`.overlay-screen`,
  `position: fixed; inset: 0; overflow-y: auto`) scrolling in their OWN
  element instead of the window, after three window-scroll fixes in a row
  each lost to real iOS WebKit; a freshly mounted element starts at
  `scrollTop 0` by construction, so there is nothing for iOS to restore.
  `Reader.tsx` gains `key={article.slug}` so the NEXT footer remounts a
  fresh scroller, and both roots gain `tabIndex={0}` for keyboard scrolling
  (axe's `scrollable-region-focusable` was already satisfied by each
  screen's focusable `BackLink`, verified against the rule's own source).
  Round 3's `holdScrollTop` helper and its test are deleted outright.
  **Correction to the round's own premise:** the architecture does NOT hand
  News its BACK position back, because a fixed overlay collapses
  `document.body`'s scroll height and the browser clamps `window.scrollY`
  to 0; the tradeoff below stands. Full reasoning: `.overlay-screen`'s
  comment in `index.css`.
- **PR #TBD** (2026-08-07/08, round 3 on the same bug) — a shared
  `holdScrollTop` helper (`src/shell/holdScrollTop.ts`) set the top and
  held it at rAF cadence for ~30 frames, aborting on `touchstart`/`wheel`/
  `keydown` so it never fought a rower's own scroll. It lost on device too,
  in BOTH iOS browsers, which ruled out a browser-chrome-specific cause;
  the mechanism was never directly observed, because no harness here can
  inject a real touch gesture. The recorded next step, taken by round 4
  above, was architectural.
- **PR #56** (2026-08-07, follow-up to the News polish round below) — PR
  #55's `useEffect`-timed `window.scrollTo(0, 0)` ran and landed (proven
  under instrumented desktop-WebKit and iPhone emulation) but on the real
  device Safari's own scroll pass re-scrolled the reader ~150px down
  afterwards (James's screen recording). Fix targets the layer that
  misbehaved: `history.scrollRestoration = "manual"` claimed at App mount,
  since every scroll-sensitive screen already self-manages, plus both news
  scroll effects moved to `useLayoutEffect`. **Known tradeoff, deliberate:**
  BACK from an article now lands News at the top on iOS, which costs one
  small flick at today's ~1.15-screen feed; if the shelf grows, News gets
  the Library's own scroll-memory pattern rather than browser restoration
  (Phase CL).
- **PR #55** (2026-08-07) — News polish: the reader and release notes
  scroll to the top on open instead of keeping the feed's scroll position;
  "heart rate monitor" replaces "heart rate strap" throughout; a prose pass
  removes em dashes and AI-tell constructions from all four articles;
  workout-types' four type mentions render as inline `TypeBadge` chips;
  a new training-pyramid SVG figure illustrates the four-type stack;
  workout-types now names the four types properly (aerobic, anaerobic
  threshold, transport, anaerobic) rather than just describing the job;
  baselines gains a paragraph on why 2k/6k are the two reference distances
  (racing: sprint and head-race lengths).
- **PR #TBD** (2026-08-02) — history-aware `← BACK`: every back link now
  returns to wherever its screen was entered from (Today → suggestion →
  detail → BACK lands on Today, not a hardcoded `/library`) via a shared
  `BackLink` component; Library remembers its scroll position across a
  detail round trip (BACK restores it, a tab tap starts fresh at the top).
- **PR #36** (2026-08-02) — CUSTOM indicator on workout detail; iOS
  input-zoom floor (every builder/import/you field now computes
  `font-size >= 16px`); head-race preset blurb reworded to match sprint's;
  Plan sequence's scroll-in-a-box removed (flows with the page, Library-style).

## Triggered follow-ons (not scheduled — each has an explicit trigger)

- **App icon redraw**: replace the current AI-generated icon with a clean
  SVG — the arc reads "ERGOMATIO" instead of "Ergomatic," the monitor
  label is unreadable, and the machine carries a third-party brand
  wordmark that needs to come off; also drop the baked-in rounded corners
  and drop shadow, which double up with iOS's own icon mask. **Gated
  before any EXTERNAL TestFlight distribution or App Store submission**
  (App Review would reject the current artwork); internal-tester
  TestFlight is exempt and can keep shipping with the placeholder in the
  meantime.
- **Apple sign-in**: required the moment a build goes to EXTERNAL TestFlight or the App Store (guideline 4.8; internal TestFlight is exempt). Works with the existing openid-client stack (ES256 client secret, form_post callback, name/email on first auth only); design the allowlist story for private-relay emails first.
- **Apple Health (HealthKit)**: when workout data should flow to Health — write rowing workouts (distance/duration/energy) from the iOS shell; needs entitlements + privacy strings; plugin choice re-verified at build time.
- **Concept2 Logbook sync**: post-workout cloud import; only compelling if ErgData-during-row becomes a habit.
- **Parametric workout generator**: "generate me a 45' AT workout" from the library's authoring rules — the differentiator a static book can't match. Trigger: after Phase 6 makes workouts rowable end-to-end. **Trigger FIRED** — Phase 6 (6A–6D) closed the full card→log loop, both doors, real completion; this is now eligible to schedule, not just a standing intention. Its structural-reference loading is now DONE: Phase 6E's offline pipeline produced `app/domain/generation/patterns.json` (per type×duration-band interval-shape frequencies, work:rest ratios, pace-offset distributions, spm bands, warm-up conventions, rep-count ranges — aggregates only, no titles/prose/per-workout rows, per the content policy), the exact fixture this generator would consume. Phase 6F's UI-fix round is done too, so nothing sits ahead of it in the queue any more — not started, but eligible to schedule now, not just eligible in principle.
- **Library export/import (private JSON)**: household members share their own transcriptions. Trigger: second active rower asks for it.
- **Auto-capture baselines from the onboarding log**: Phase 6I's no-baseline
  card ends with a manually-entered baseline (You → baseline editor) —
  the log already carries the exact measured stopwatch split
  (`actualSource:"stopwatch"`) for the designated workout's own distance
  phase, so the number a rower would type in by hand already exists on the
  row they just saved. Not built this phase (spec's own "Out of scope":
  "auto-capture of baselines from a logged first row (recorded follow-on)").
  Trigger: a rower feedback signal that manual entry after finishing the
  baseline test is a real friction point, not just a theoretical one. Then:
  read the just-saved log's own step actual and pre-fill (never silently
  overwrite) the relevant baseline field.
- **Move programming limits onto `MonitorCapabilities`**: `domain/monitor/
program.ts` hardcodes PM5 Table 19 limits (`MIN_TIME_SECONDS = 20`,
  `MIN_DISTANCE_METERS = 100`, `MAX_REST_SECONDS = 595`,
  `MAX_INTERVALS = 50`) and its six `CompileError` branches emit
  user-facing copy naming "the PM5" directly. `compileProgram` is the only
  producer of `WorkoutProgram`, and `MonitorCapabilities` has no channel
  for programming limits today, so a second monitor would silently inherit
  PM5 limits and PM5-branded rejection copy instead of its own. Disclosed
  and accepted as correct for now at `program.ts:112` (single-monitor app,
  cheap to fix later) — not a defect to fix today. Trigger: a second
  monitor integration becomes real. Then: add a programming-limits channel
  to `MonitorCapabilities`, move the four constants there per-monitor, and
  template the six `CompileError` messages instead of hardcoding "PM5".
- **Reconnect and background scan, five pieces** (Phase 7B Task 8
  close-out; `docs/design/DEVIATIONS.md`'s lost-link and MISSED-rows rows;
  design spec C5's descope): (1) Capacitor id-keyed reconnect; (2) DRIVER
  RE-SUBSCRIBE, since `createPm5Driver` subscribes once at construction and
  a transport that silently regains its link still needs its notification
  handler re-attached; (3) a `Transport.scan()` background variant that can
  watch for a known PM5 without the OS picker; (4) `DiscoveredMonitor.rssi`,
  so a picker or auto-connect can rank by signal; (5) MISSED-rows inheritance,
  which exists only to catch what a reconnect BACKFILL fails to fill and so
  lands with reconnect or not at all. **A failed `program()` during an OPEN
  run leaves the old run open and numbering** — `driver.ts`'s `program()`
  replaces `activeRun` only after `sendPrepare()`/`sendSequence()`/
  `verifyArmed()` all resolve, so a throw part-way leaves the previous run
  open, still normalizing the next boundary and still emitting its own
  `workoutComplete`. Pre-existing, parked deliberately in 7A-fix-2 Task 4's
  review (probe P3b); its original rationale cited a destructive-reject fact
  §19.2 has since WITHDRAWN, so the decision needs re-reasoning against the
  current record (re-reasoning draft in PR #70's body). **Trigger:** Capacitor
  BLE lands (PM5 reaches the phone), or a tester reports a mid-piece lost link.
- **Remove the `PULL TO RESUME` block** (James, 2026-08-17: "we never got
  rid of the pull to resume screen"): the stale-state band on
  `ConnectedSurface.tsx` (~line 584) still renders its inverted ink field
  when strokes stop mid-piece. CR2 2a task 5 only re-worded and un-occluded
  it (PAUSED noun retired, in-flow, instruction not status); James's flag is
  that the screen itself was supposed to go, not get politer. Work item:
  decide what the stale frame state shows instead (nothing but the live
  numbers? the END/AGAIN chip alone?), then remove the band, its CSS
  (`connected-paused-*` family), the DEVIATIONS paused-treatment rows, and
  the design/e2e witnesses that pin it. Owner: next connected-surface
  phase — pairs naturally with James's stale-while-armed observation, still
  owed from the CR2 phone pass.
- **Anonymous-run logging (`workoutId: null`)** — every storage and server
  layer already accepts the record (nullable column, guards key on
  `completedAt` alone), but no product path can CREATE an anonymous run: the
  only connect door stamps a real workout id (`WorkoutDetail.tsx`), and
  `ANONYMOUS_RUN` is dead code by its own comment. The save door lands WITH
  its first consumer, not before. **Trigger:** a door that creates anonymous
  runs ships — a free-row entry point, or PM5-initiated sessions.
- **Hardware session shopping list (operator-run, one row at the erg)** —
  `docs/monitor/pm5-interface-notes.md` §17 item 21 (the three pairing/
  programming latency spans, still unmeasured against a real PM5) and item 22
  (whether `0x0037`'s Split/Interval Time is the work portion alone or work
  plus its trailing rest, which decides whether `buildMonitorLogSteps` needs
  a re-derivation); §17 item 5's unrowed question, whether a full multi-FRAME
  distance program retains all its intervals when rowed to completion from a
  clean state; and §18's own readings-still-owed list, the PAUSED tick count
  from a full log and RATE at normal pace on a sustained piece. Add a genuine
  mid-piece disconnect to the same row, which no walk has ever exercised. **One
  `.5` pace target on the wire** — every workout programmed so far has carried
  whole-second targets, so `representableCentiseconds`, the fix that let
  baseline-derived splits like `2:14.5` compile at all, has never been sent to
  a real PM5 (§18, walk 1). One row with a `.5` target settles it silently, so
  it rides along with the shopping list above. **Trigger:** James's next
  session at the erg (checklist in PR #70's body).
- **Cron+ntfy revival on the WOD fetcher**: `scripts/wod/fetch-wods.mjs`
  is pull-only today (the `wod-import` skill runs it on demand). Trigger:
  James wants WODs pushed instead of pulled. Then: a cron job runs the
  fetcher on a schedule and an ntfy notification surfaces new unruled
  candidates without a skill invocation.
- **Abandoned-start draft janitor** — the fast-follow phase's
  `startedAt`-stamps-immediately design (spec §3, ruling B1) means a
  rower who taps Start then browser-BACKs away, instead of pressing
  CANCEL, leaves a started draft plus a live run behind that
  `Today.tsx`'s existing janitor can no longer reap: it only discards
  drafts with `startedAt === null`, a state the app can no longer
  produce. Every later Start anywhere then costs a two-press "A
  session is in progress. Replace it?" confirm instead of a silent
  replace. Spec-intended (CANCEL is the documented clean exit),
  surfaced to James rather than fixed silently (Task 4 review, M-2).
  **Trigger:** James accepts the residue as everyday behavior
  (pending) — then a time-based janitor reaps a stamped-but-untouched
  draft a few hours after it starts.

<!-- probe: docs-only commit for PR #135, deleted after -->
