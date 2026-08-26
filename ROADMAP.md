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
      preset-selection half of Phase 8B's own "Plan management" line,
      delivered here instead because Today needed it; Phase 8B still owns
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

**Removed by James's 2026-08-23 ruling** ("take the learning the app
section off the today screen and just have it pinned on news. Also remove
the setting from 'you' to reset it. The baseline recommended is enough."):
the teaching surfaces this phase built — Today's `START HERE` block
(Task 5's `StartHere.tsx`/`startHereSteps.tsx`), You's `Learning the app`
row and `/you/learning` screen, and News's dismissed-only Start-here pin
(all of Task 7) — are deleted. They shipped and worked; the removal is a
later product decision, not a reversal of this phase's exit. What
survives: the four articles themselves (with `your-first-row` now a
registry pin, so News's PINNED shelf carries the teaching alone), the
three-door card (superseded Task 5's `BaselineCard` via Phase BL PR C),
and the `preferences.start_here_dismissed` column — dormant server-side
(additive-only API; `server/db/schema.ts`'s own comment names it fallow).

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

**Status:** SUPERSEDED (James, 2026-08-24) — promoted to its own phase,
**Phase PS — Personal stats**, sequenced AFTER Phase 8B; see that section.
The 2026-08-07 handoff sketch (decision 9) and the three chart groups
listed here carry over as INPUTS to Phase PS's re-brainstorm, not as its
design; nothing was built under this heading.

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

## Phase 8A — Plan checkpoints (prescriptions, phase one: the plan suggests)

**Status:** SHIPPED 2026-08-22 — PR A #155 (the seam) and PR B #156 (the
rename, triad, merged LAST per ruling), both same day the phase unparked
(James: "let's do it"). Final-PR PM gate: PASS-WITH-CONDITIONS, all four
conditions landed on #156 before merge. **Still owed at the tag: the notes
PR** — three clauses (the checkpoint suggestion naming session 7 and its
six-saves cost; the rename, so old history reading `First 2k` is not filed
as a bug; the open measurement loop — update your baseline by hand on You
until the next phase closes it) join Phase WU's existing v0.16.0 entry, then
the tag is cut and **the build uploads the same day** (the installed-build
windows close at the UPLOAD, not the tag — the DB renamed at merge).
Unparked from `test-days` (spec drafted 2026-08-12, deleted after PR #154
landed the docs); the verification refresh + phase-open gates ran 2026-08-22
before implementation.
**Gates RUN 2026-08-22, both verdicts folded** (entries in both ledgers, this
PR): PM GO-WITH-CONDITIONS, antagonist delta with one blocking find. The
refresh + gate deltas and James's five rulings (same day):

- **Rulings (James, 2026-08-22):** (1) post-rename, `6K Test`/`2K Test` are
  VISIBLE in the Library (exclusion shrinks to suggestion pools only — a rower
  can voluntarily re-test); (2) the no-baseline onboarding card gets its OWN
  copy (friendlier heading) rather than rendering the instrument name;
  (3) sequencing after 8A: the baseline-update prompt ships NEXT, before the
  calendar; (4) the installed-build window on the rename is ACCEPTED — the
  rename PR merges LAST in the phase, alone, tag cut promptly, notes name it —
  no compatibility tag; (5) on a checkpoint day `Log against plan` LEADS the
  save stack — the 6I demotion rule (`PostWorkoutSummary.tsx`, keyed on
  `isOnboardingTitle`) narrows to its actual case (a baseline test on an
  account that is not at a checkpoint), or the checkpoint soft-locks: the
  non-advancing save writes `plan_key`/`plan_index` NULL and `done_n` never
  passes index 6. A green test pins the wrong behaviour by taking
  `isOnboarding` as a prop (`PostWorkoutSummary.test.tsx:883`) — the fix
  derives it.
- **PR shape:** TWO PRs. PR A = the seam (the union retires, the resolver,
  the `suggest()` pin, Today wiring + override marker, save-stack fix, proof
  and pixels) — compile-coupled, one PR. PR B = the rename + reclassification
  + Library visibility + card copy, ALONE and LAST (triad: stored rows with
  log links). Prescription refs are authored as `ONBOARDING_TITLES` CONSTANTS,
  not literals, so PR A has no dependency on PR B's titles.
- **Wire contract (antagonist B2):** `GET /api/plan`'s `sequence[].code` keeps
  its name and its bare-string shape — checkpoints serialise the day's real
  type. The prescription does NOT cross the wire in 8A (`Plan.tsx` computes
  the checkpoint mark client-side from `PLANS`). Renaming or restructuring
  that field would blank the plan line on installed builds.
- **Known-open on ship (PM):** the measurement loop — nothing records a test
  result (`isTestResult` has zero client senders) and no baseline prompt (now Phase BL)
  exists; 8A's notes say so and the next phase closes it. Checkpoints are 6
  real saves deep (`done_n` moves only via `POST /api/logs`; log deletion
  decrements, so a demo is reversible) — the release notes say that too. This section is the scoped-down phase-one slice of that draft after a
PM holistic review; the draft's §5 (wiring `GET /api/today`), §11b (the
`suggested_title`/`suggestion_taken` capture task) and its `PrescriptionContext.date`
field are deliberately NOT in it, and the review's file is the record of why.
**Goal:** The three plan checkpoints suggest their own test instead of a random
interval session, and the `"TEST"` plan code retires in favour of plan days that
carry authored data.

The prescriptions idea is phased: **8A is plan-suggested only** (a plan makes
suggestions the rower is free to ignore), **8C is rower-authored** (a rower
pre-plans their own routine), and the two questions behind "which days did I
override, and what would the other suggestion have been" sit under Triggered
follow-ons because they are two different features wearing one sentence.

- [x] **The `"TEST"` code retires.** `PlanDay { type, prescribe? }` replaces the `PlanCode = WorkoutType | "TEST"` union at every call site (`domain/plans.ts`, `server/routes/data.ts`, `src/api/usePlan.ts`, `src/session/LogSession.test.tsx`); each checkpoint index becomes a day of a real type carrying its own prescription (sprint: AN plus the 2K test, head: AT plus the 6K test). `Plan.tsx` drops `CODE_COLOR_VAR` and its local `CodeBadge` for the shared `TypeBadge`, keeps a visible checkpoint mark, and `--type-test` goes with its last consumer. Tallies move to sprint 34/23/14/13 and head 41/24/11/8, both keeping the pinned pyramid and the run/bias invariants. **M**
- [x] **The prescription's lookup, in `domain/`.** A ref (title plus `globalOnly`) and one shared resolver that finds the designated GLOBAL row and never a rower's own workout that happens to share the title. A test asserts every authored ref in `PLANS` resolves against `GLOBAL_LIBRARY_SEED`, so authored content naming a missing workout fails CI instead of degrading quietly. The ref keeps its `kind` discriminant: 8C must reference a rower's own workout by id, because titles are user-editable with no uniqueness constraint. **S**
- [x] **`suggest()` pins a prescribed entry.** Its reason is authored with it; every preference filter is bypassed (a checkpoint is not a suggestion from a pool); a live pick still wins; and the prescribed branch sits ABOVE the empty-pool early return, so an account with none of the day's own type still gets its checkpoint. **S**
- [x] **Today wires it, and the type-swap chips override it visibly.** The screen resolves the prescription against the UNFILTERED library. **James's ruling (2026-08-12):** the lit chip is the SUGGESTED workout's own type (AN on a sprint checkpoint, AT on a head one, not the `TEST → TR` stand-in that dies with this phase), and swapping to another chip OVERRIDES the prescription — the rower acting now is tier 1 by the ladder's own logic — with a visible marker that the suggestion has been overridden. The marker says overridden; it does NOT name the displaced workout (that stays ruled out, 2026-08-12). Today's plan line already renders `prescribedCode → swapType` when swapped (`Today.tsx:1050-1053`), so the design pass decides whether that arrow carries the marker or the card needs its own; either way it is a stated design with a DEVIATIONS row, not an inference. Consequence worth naming: because a swap escapes, the chips are the exit on a day where SHUFFLE is disabled (`canShuffle = poolIds.length > 1`, `Today.tsx:983`), which is the empty-or-single-pool case the prescription bypass exists to serve. **M**
- [x] **The rename, migrated.** `First 6k`/`First 2k` become `6K Test`/`2K Test` (a deliberate break from the library's poetic-name convention: these two are instruments, not sessions) and are reclassified honestly (2K: AN/hard/pain 5, 6K: AT/hard/pain 4). The seed converge gains a one-time legacy-title map applied BEFORE its delete pass, so an existing row is renamed in place and keeps its id: without it the converge deletes the old title and every log recorded against it loses its workout link. Note `contentEqual` (`seed.ts:19-33`) ignores title, so the rename needs its own write rather than leaning on the content-diff path. **M**
- [x] **Proof and pixels.** A plan advanced to its first checkpoint shows the test, can START it, and SHUFFLE escapes; the checkpoint card is captured with real data and looked at; `docs/design/README.md:106` (`TEST → treated as TR`) and `:139` (the `type TEST` colour row), plus the `DEVIATIONS.md` row citing `--type-test`, are all reconciled with what shipped. The Plan-screen checkpoint marker that replaces the TEST badge needs a stated design: retiring the token removes a visual distinction from a screen that has a high-fidelity reference. **S**

**Exit:** On session 7 of the sprint plan the card reads `2K Test` with a
checkpoint reason, START runs it, and SHUFFLE escapes to an ordinary AN session;
the head plan shows the 6K where sprint shows the 2K; a rower whose library
holds no AN workout still gets their checkpoint; and no `"TEST"` string survives
in plan data, the Plan screen, or the token file. **Added at the 2026-08-22
gate:** a pre-rename log recorded against `First 2k` still resolves to its
workout after PR B; the override marker and the Plan-screen checkpoint marker
each render (a stated design, not an absence); on a checkpoint day the save
stack leads with `Log against plan` and the saved log carries `plan_key`/
`plan_index`; the no-baseline onboarding card still renders after the rename;
and `docs/design/README.md:99-100` (the wrong `7/31/55` cadence, real indices
6/34/62 = sessions 7/35/63) is reconciled with the rest of the pixels.

## Phase BL — Baselines: three doors in, one measurement out

**Status:** COMPLETE pending release (v0.19.0). **James signed off the 16 cells 2026-08-23:** the slow anchor stands, 2:10 is the right ceiling, and the two question screens stay FOR NOW with testers as the validators (the delete-the-screens simplification stays available if they don't earn their place). — all four slate items
delivered: **PR A #164, PR B #165, PR C #172** (opened 2026-08-23; the
old PR-C-opens-only-once-LL's-spec-exists precondition was verified
satisfied — LL's spec merged to main 2026-08-22, before PR C opened).
Phase opened 2026-08-22 with same-day gates (antagonist anchor at full
triad weight; PM slate gate GO-WITH-CONDITIONS), spec at REV 2 with
every finding folded
(`docs/superpowers/specs/2026-08-22-baseline-onboarding-design.md`; the
canvas is COMMITTED at `docs/design/baseline-onboarding/`, live copy
linked in the spec). Both gate ledger entries rode the rev-2 PR. James's
rev-2 rulings: per-number provenance (`k2Source`/`k6Source`, four values
incl. `derived`); decline still records the test (wire decouple in PR B);
the derive OFFER answers door 3's single number and inconsistent tested
writes; questionnaire answers TRANSIENT, never stored; a staged-confirm
**Reset baseline setup** on You makes the doors re-enterable (the product
answer to the gate's unreachable-doors finding). **PR shape: A (the
shape, alone, triad) → B (prompt + shortcut + decouple) → C (doors +
questionnaire + table + reset).** The stop-point conditional this
paragraph used to carry dissolved with PR C: the table met its bounded
criteria, so the phase did not close on A+B.
**PR A LANDED via #164** (the provenance shape: `k2Source`/`k6Source`
pgEnum, migration 0013 regenerated after LL's 0012 merged mid-flight;
editor writes `manual` typed / `derived` accepted-offer; untouched
fields no longer resend). **PR B LANDED via #165** — the `tested` and
`derived` writers (the post-save prompt and its counterpart offer), the
recording decouple (`POST /api/test-history`, decline records, keyed
idempotent via migration 0014's `test_history.session_log_id` — an
UNPREDICTED stored shape that took the full triad treatment including
its own PM final-PR gate), the You re-test shortcut, and the ORIGIN
predicate in the editor. James's R1 ruling (2026-08-22): the phone-timer door RECORDS too — losing
a genuine unconnected test is worse than carrying a removable bogus row;
the remove/void verb gates 8B's list (binding, in 8B's own bullet).
**The stop-point was passed: the table met its
bounded criteria, and PR C is implemented** (doors + questionnaire +
16-cell table + Reset baseline setup; every enum value now has a real
writer — `estimated` was the last). James's 2026-08-23 copy ruling
(strong-and-steady 6k, not-a-sprint reminder; 2k stays ALL OUT) is
built into the doors card, RowPath, and the committed canvas sources
in the same commit. **Three durable facts
every later consumer of provenance must know (PR #164's gate):**
(1) VERSION SKEW — a pre-#164 client's Apply resends untouched fields
as plain writes, demoting a newer build's `derived`/`tested` source on
a field its rower never touched; inherent to the additive wire, and PR
B holds it when reasoning about `tested` longevity. (2) AWAY-AND-BACK —
a stepper nudge with zero net change, Applied, stamps `manual` over a
stored source with nothing visible; PR A shipped that conservatively,
and James RULED same day: provenance is ORIGIN, not act — a source
describes where the NUMBER came from, so an unchanged value keeps its
stamp. **PR B implements the value-identity predicate (stamp only when
the value actually changed) alongside `tested`**, where the ruling
first has real cost.
(3) SOURCE-BESIDE-NULL — the source columns are NOT NULL with defaults
while the numbers are nullable, so `k6Seconds: NULL, k6Source: 'manual'`
is a real row state; every consumer keys on the NUMBER being non-null
first. **Releases: A+B shipped as v0.18.0/v0.18.1** (the earlier
"BL's tag is v0.17.0" claim in LL's notes PR was corrected); PR A
itself owed no note (nothing tester-visible — that accounting line was
written here in advance per RF15); **PR C releases as v0.19.0**. James
checks all 16 table cells, printed in PR C's body. TRIAD: PM final-PR
gates ran on A (#164), B (#165, for 0014's unpredicted stored shape),
and C (#172 — PASS-WITH-CONDITIONS, conditions landed on the branch).

**Goal:** a no-baseline account reaches a working app through whichever
door suits them, and a rowed test finally gets RECORDED instead of
hand-typed.

- [x] **Baseline provenance** — per NUMBER, James's rev-2 ruling:
      `k2Source`/`k6Source`, each
      `manual | estimated | derived | tested`, stored, NEVER shown;
      existing rows migrate to `manual` (truthful — the You editor was
      the only writer that ever existed); additive API. **Triad core —
      lands per the grouping rule's triad exception.** Delivered by PR A
      (#164); ticked late — the status paragraph above recorded the land
      while this box sat unchecked. **M**
- [x] **The three doors** replace the single-offer no-baseline card
      (outcome-framed per James: recommend / I know it / row it) — PR C:
      `today/DoorsCard.tsx` + the three `/onboarding/*` flow screens;
      renders whenever the PAIR is incomplete (the superset ruling).
      Door 3 is dual-distance as NEW UI in the old card's anatomy — this
      bullet's original "reusing the shipped BaselineCard toggle" was
      overruled at the phase-open gate (the card refuses to render for a
      both-set account; spec rev 2's M7 finding), and BaselineCard is
      deleted. Door-3/6k copy carries James's 2026-08-23 ruling: strong
      and steady, with the not-a-sprint reminder; the 2k stays ALL OUT
      and the 6K Test workout itself still renders MAX (v0.18.1). **M**
- [x] **The questionnaire + estimate table**: two questions (experience,
      cardio), NO age band (standing PII-minimization ruling), answers
      TRANSIENT (never stored, never sent — pinned by an e2e wire
      capture); 16-cell static lookup in `domain/estimateBaseline.ts`
      with per-cell population comments and source tags. Re-grounded per
      rev 2 (the C2-rankings PRIMARY claim was withdrawn at the gates):
      SECONDARY recreational band 2:30..2:15/500m, conservative bias,
      one exempt cell (a-lot x training-hard, 2:10); bounded criteria
      all pinned by test (totality, 60..240, k2<k6, gap ==
      K2_K6_OFFSET_SECONDS, fast-end bound, monotonicity). CONSTANTS
      RECONCILED to one family: the editor's seeds now derive from the
      table's most-common cell (145/152 = 2:25/2:32), retiring the
      hand-typed 112/122 club-rower pair and its contradicting 10s gap.
      James checks all 16 cells at the PR. **M**
- [x] **The post-test prompt** (PR B): a completed test session offers
      its own result as the new baseline (`tested`) post-save, and never
      blocks or auto-writes; accept can then offer the derived
      counterpart (`derived`). Closes the loop 8A shipped open. The
      "sends `isTestResult`" wording this bullet opened with was
      superseded by rev 2's decouple ruling before any code existed:
      recording rides the sibling `POST /api/test-history` (fired on the
      SAVE, keyed to the log id, idempotent via `test_history.
      session_log_id` — migration 0014), so decline records too, and
      `isTestResult` still has zero client senders. New with PR B, both
      binding: the COMPLETENESS guard (monitor `endedBy === "finished"`
      only; timer `isComplete`; split inside the storable 60..240 band)
      and the ORIGIN predicate in the You editor (a touched field ships
      only when its value actually changed — an away-and-back nudge no
      longer demotes a stored source; an all-unchanged Apply makes no
      wire call). **M**
- [x] **The You-screen re-test shortcut** (James, 2026-08-22; PR B): row
      the 6k / race the 2k next to the baseline fields on You. Reshaped
      by James's tester feedback (2026-08-22, post-v0.18.0): the buttons
      are now links to each designated GLOBAL test's DETAIL screen
      (Connect / Start Timer / Log it after) with BACK returning to You,
      no caption; the start guards fire on the detail's own paths. The
      same feedback fixed the 6K Test's effort ref min -> max ("it's
      still all out") — deployed rows converge in place on boot.
      DEVIATIONS row 121 is the stated design (no handoff mock exists).
      **S**
- [x] **Reset baseline setup** (James, 2026-08-22, at the gate; PR C): a
      staged-confirm action on You clearing both numbers and both
      sources — the doors become re-enterable for ANY account, demos
      included. The deliberate clear operation is `DELETE
      /api/baselines` (its own verb — PUT still rejects null on
      purpose), deleting the row whole so SOURCE-BESIDE-NULL can leave
      nothing stale; additive, old clients unaffected, proven against
      real Postgres. **S**

- [ ] **Queued follow-up (split-entry review F1, 2026-08-23; single
      file, rides the next PR touching door 2):** door 2 can Save
      mid-entry and ship the clamped partial — type "1", tap Save, and
      60s rides the wire with only a blur-beat of display to announce
      it. The You editor's identical path is announced by its
      ConfirmLine before Apply; door 2 has no confirm, so the fix
      belongs there (`src/onboarding/KnowBaseline.tsx`). **S**

**Exit:** the spec's draft exit criteria, refined at phase open — each
door works end to end, the prompt closes the measurement loop, every
baseline carries a source and no screen shows it.

## Phase 8B — Plan & Progress

**Status:** Not started
**Goal:** See where you are in the 84-session plan and whether you're getting faster.

- [ ] Plan screen gains a month calendar with type marks, ALL/TO DO/DONE filters, and a legend (session rows: done sorted below upcoming; today highlighted) — layered onto the sequence list Phase 6A already built at `/plan`, not a new screen **BRAINSTORM DONE, SPEC WRITTEN (2026-08-22): `docs/superpowers/specs/2026-08-22-plan-calendar-design.md`** — James's three rulings: the grid is a RECORD (dates for done sessions only, future days empty, the sequence list stays the dateless future — this supersedes the earlier same-day projection phrasing); ALL logged sessions mark the grid, plan-linked ones distinct; date-keyed events ship LATER in their own phase (the mark system reserves them a class). Implementation still waits behind Phase BL (the baselines phase) and takes the normal phase-open gates with this spec as the anchor target. Original ruling trail:**the calendar is a pure PROJECTION — the sequence runs forward from today, no plan day is ever tied to a stored date.** That resolves the design reference's self-contradiction (`README.md:97` vs `:315`): the TO DO half is arithmetic from `done_n`, no new data. **Brainstorm still owed before any spec, now with a named input: DATE-KEYED EVENT SUGGESTIONS** (James, same day: "trick or treat Trot") — a globally authored one-off surfaced on a specific calendar date, NOT part of the plan, but loggable against it (the log-against-plan half already exists via the post-workout save; the new invention is only the date-keyed producer and its surfacing on Today and/or the calendar). This is a THIRD producer kind (checkpoints are index-keyed, 8C's reservations are rower-authored, events are date-keyed + global) and it is the first real two-producers-one-day case — the brainstorm settles which one Today leads with on a collision (the triggered follow-on on the precedence resolver fires with it). — `plan_state` is `{plan_key, done_n}` with no calendar awareness, nothing schedules a future plan day to a date, and the design reference contradicts itself (`docs/design/README.md:97` "a sequence, not a weekday calendar" vs `:315`'s month grid with greyed future days). A design pass now would draw the TO DO half of a screen whose data cannot exist. The brainstorm may run in parallel with 8A's implementation.
- [x] ~~Stamp each log with the plan day it belonged to~~ — **already
      DELIVERED before this phase opened** (found at the 2026-08-22 phase-open
      gate): PW spec 2 shipped `plan_key`/`plan_index` on `session_logs`
      (migration 0010, PR #121), stamped server-side in the log's own
      transaction with newest-wins resolution and delete un-counting. The
      column is `plan_index` (= `done_n - 1`), not `done_n`. No migration is
      owed, and the 2026-08-22 RC migration-coordination note this bullet
      briefly carried described work that no longer exists — struck same day.
- [x] ~~Plan management: preset selection (2000 m sprint / 5–6 k head race), reset-to-session-1~~ — **delivered early in Phase 6A** (`/plan`'s preset cards, Reset, and Switch), since Today needed an active plan before this phase's own turn came up
- [ ] ~~Progress screen: 2k/6k test trend bars (longer = slower, delta callout), minutes/week stacked by type, type mix, last-30-days~~ — **superseded by Phase 6J**: these three chart groups relocate onto You (Trend folded in, per the 2026-08-07 News tab handoff) instead of shipping as their own screen; this bullet stays struck-through rather than deleted so the supersession has a record
- [ ] Test history list on **You** — the CONSUMER for the `test_history` rows Phase BL's prompt produces (BL creates the producer; until this ships the history has rows nobody can see, and release notes must not imply otherwise). **The prompt half of this bullet MOVED to Phase BL** (split at BL's phase-open gate, 2026-08-22 — one home per body of work; the old "staged-confirm flow" mechanism wording here is superseded by BL's post-save prompt). Identity note stands: a test session is identified by title (`ONBOARDING_TITLES`) or by prescription (`plan_index ∈ {6,34,62}`); this list's design pass says which it keys on. **Named input from PR B's review (2026-08-22): the table is rower-APPEND-ONLY by composition** — decline records (ruling), rows outlive log deletion (FK SET NULL, deliberate), and no delete API exists — so a test the rower considers invalid is permanent, anchors the next delta, and this list renders it with no removal path. **BINDING (PM final-PR gate on #165, 2026-08-22): the list does NOT ship without a remove/void answer, decided at its design pass** — the same precedent PR #121's final-PR gate set for the stored heroes (pm-ledger, 2026-08-18: a spec that adds stored numbers answers "how does a rower correct or remove this?" BEFORE it ships, not after). "It stays append-only, and here is why" is an acceptable answer; silence is not. **Second input: the semantic cross-check** — POST /api/test-history is ownership-checked but takes client-asserted distance/split; when history becomes visible, assert the linked log's own workoutTitle/avgSplitSeconds agree (makes the FK semantic, not merely referential).

**Exit:** Logged sessions appear on the calendar and in every chart; a logged 2k test can update the 2k baseline through the staged-confirm flow.

## Phase PS — Personal stats

**Status:** Not started. Sequenced AFTER Phase 8B (James, 2026-08-24:
"make it its own phase and put it after 8B — re-brainstormed when we get
there. The phase will be all about personal stats"). Promoted from Phase
6J (Trend charts on You), whose section above is now a tombstone.

**Goal:** A rower can see whether they are getting faster — the app's
personal-stats story, in one phase.

**RE-BRAINSTORM REQUIRED at phase open** — the 6J sketch is an input,
not a design. Inputs the brainstorm inherits:

- The 2026-08-07 News-tab handoff's decision 9 (Trend folds onto You):
  a sketch, with its own open question ("the three Trend charts need
  real ranges, bucketing and empty states").
- The three chart groups relocated from Phase 8B's old Progress bullet:
  metres per week, O2 pace per session vs target, time by type — plus
  2k/6k test-trend bars.
- Everything Phase RC has stored since that sketch was drawn: work/rest
  as separate quantities, machine-confirmed summary totals
  (display-gated on the walk photograph), `endedBy`, and the baselines
  history Phase BL added — the stats story should be re-scoped against
  what the record NOW holds, not what it held in August's first week.
- **RC-5's own hazard for "metres per week" (Task 3 fix round 4, PM gate
  finding 8): `session_logs.distance_meters`/`time_seconds`/
  `avg_split_seconds` mean FUSED (work + rest) before this merge and
  WORK-ONLY (tier-appropriate) after it — with NO stored marker on the
  row saying which** (`storedSummary.ts`'s own FALLBACK/TIER-B2 branches;
  `schema.ts`'s corrected `distance_meters` comment). A brainstorm that
  sums this column across a rower's whole history, or per week, will
  silently sum two different definitions of "metres" side by side unless
  it either re-derives a consistent population per row (mirroring
  `storedSummary.ts`'s own tier logic) or explicitly accepts the seam and
  says so. Settle this BEFORE writing "metres per week" arithmetic, not
  after a chart ships with an unexplained kink at the cutover date.
- The dataviz house rules (charts follow docs/design tokens; honest
  empty states below two sessions — never sample data).

**Exit (provisional, re-set at the brainstorm):** a rower with real
history sees real trends on You; below the honest threshold, an honest
empty state.

## Phase 8C — Rower-authored prescriptions (phase two: the rower suggests)

**Status:** Not started. Unscoped: brainstorm before sizing.
**Goal:** A rower can pre-plan their own routine, reserving a specific workout
in advance, and the app suggests it when that day comes.

- [ ] Brainstorm first. Open questions to settle there: is a reservation keyed to a DATE or to a plan session index (8A's producer is index-keyed, and `done_n` advances per logged session with no calendar awareness, so these are genuinely different features); does a reservation survive a plan switch or reset, both of which zero `done_n`; and what a rower sees on a day where their own reservation and a plan checkpoint both apply.
- [ ] **The precedence hierarchy, re-decided against a real second producer.** The 2026-08-12 draft records "rower wins all → a theoretical date → plan prescription" with a displaced lower tier simply dropped. That was decided in a session with no reservations in it, and the losing case is a rower who reserves a workout on a checkpoint day and silently loses the measurement every other workout's targets resolve against. Revisit before building. **M**
- [ ] Refs by id, not title, for anything the rower authored: titles are user-editable and `server/db/schema.ts` has no uniqueness constraint, so a rename would silently break a reservation. 8A's ref carries the `kind` discriminant for exactly this. **S**
- [ ] The escape verb. A checkpoint is escaped by SHUFFLE, an ephemeral per-day pick that returns on reload. A reservation the rower made must be CANCELLED instead, which needs a persisted, server-side channel that `todayPick`'s localStorage record cannot provide. **M**
- [ ] Multiple options for one day ("A or B"), if the brainstorm wants it.

**Trigger:** James asks, or a second rower asks. **No demand has been observed** —
this exists because James said in the 2026-08-12 session that he "may one day"
want it, and the honest record is that the seam is prepared and the feature is
not scheduled.

**Exit:** A rower reserves a specific workout for a future day, sees it
suggested when that day arrives, and can cancel it without shuffling.

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
- [ ] Backlog sweep of deferred niceties
- [x] ~~PWA installability~~ · ~~Accessibility audit~~ · ~~Calm-motion pass~~ —
      **MOVED to Phase PROD** (James, 2026-08-20): all three are release
      gates for an audience outside the household, not household polish.
      They are tracked there, not here; this line exists so nobody
      concludes they were dropped.

**Exit:** Two rowers share a phone by the erg without re-typing credentials.
(Installability and the audits now exit with Phase PROD.)

## Phase PROD — Productionization (the last phase before strangers)

**Status:** Not started. **This is the final phase** (James, 2026-08-20:
"the app icon and Apple login etc should all go into a productionization
final phase"). It exists because a set of items share one trigger and one
deadline rather than one subsystem: every one of them is a thing App
Review, or a tester who is not James, will meet first.

**Goal:** the app can be handed to someone outside the household without
an apology.

**The line this phase defends.** Internal TestFlight is exempt from all of
it, which is why none of these have blocked anything so far. The moment a
build goes to EXTERNAL TestFlight or the App Store, they all bind at once.
Nothing here should be discovered at submission time.

- [x] **F1 from Phase LL's exit walk (2026-08-23): the failure screen's
      Try again is DEAD after a mid-session BT-off** — three compounding
      defects, not the walk's own filed listener theory (struck below: the
      review proved it irrelevant — `canRetry` never reads enabled state,
      so a torn-down `onEnabledChanged` was never in the causal chain).
      PROD's exit is an empty-phone install reaching a logged row UNAIDED;
      a dead button with no feedback defeats "unaided" directly. **FIXED
      (cohort-unlock PR, 2026-08-23, two fix rounds):** (1) `canRetry` was
      `phase === "failed"` only, so the `disconnected`-no-run branch
      rendered the button disabled by construction — widened to also cover
      `session.phase === "disconnected"`. (2) Enabling it alone was not
      enough: the `disconnected` event handler never disposed the driver,
      so `connect()`'s own `driverRef.current !== null` guard silently
      no-op'd every tap — fixed by disposing (unsubscribe, null
      `driverRef`, hang up the transport) inside the handler itself,
      deliberately WITHOUT clearing `deviceName` (the disconnected-WITH-
      run surface's LOST header needs it). (3) That deliberate choice then
      broke re-programming: `programmedForDeviceRef` only resets when
      `deviceName` goes `null`, which this disposal no longer does, so a
      retry connected to the same PM5 but the pairing effect saw
      "already programmed" and never called `program()` — the rower
      landed stuck on CONNECTING/SENDING THE WORKOUT with only Cancel,
      caught by a fake-driven walk test before merge and fixed by
      resetting that ref explicitly in `handleTryAgain`.
- [ ] **App icon redraw** (was a triggered follow-on). Replace the
      AI-generated icon with a clean SVG. What is actually wrong with it,
      checked against the asset itself
      (`app/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`,
      2026-08-20) rather than repeated from this file: the top arc DOES
      read ERGOMATIC — **the rabbit's ear crosses the final C and hides
      it**, so at icon size the wordmark loses its last letter. (An
      earlier version of this line claimed the arc was misspelled
      "ERGOMATIO"; that was wrong, it propagated for weeks, and James
      corrected it. Nobody had opened the file.) The real blockers:
      **the erg rail carries a third-party brand wordmark and logo**,
      which has to come off; the icon bakes in its own rounded corners
      and drop shadow, doubling up with iOS's mask; and the whole thing
      is AI-generated raster art at one size. **App Review would reject
      the third-party mark** — this is the hardest gate in the phase and
      the only one needing a human with taste. **M**
- [ ] **Apple sign-in** (was a triggered follow-on). Guideline 4.8:
      required the moment a build leaves internal distribution. Works
      with the existing openid-client stack (ES256 client secret,
      form_post callback, name and email on first auth ONLY — Apple
      sends them once and never again). **Design the allowlist story for
      private-relay addresses FIRST**: `ALLOWED_EMAILS` cannot match a
      relay address the rower has never seen, so the current door does
      not survive contact with Apple sign-in unchanged. AUTH — triad
      weight, full antagonist pass on its spec plus a PM final-PR gate. **L**
- [ ] **Store metadata and the legal surface.** Not previously on this
      roadmap in any form, and every item is required for submission: a
      privacy policy at a real URL, a support URL, the App Privacy
      questionnaire answered truthfully against what we actually store
      (sessions, series traces, heart rate — heart rate is health data
      and is answered as such), age rating, and store screenshots at the
      required sizes. The screenshots are cheap here: `pnpm screenshots`
      already produces honest captures of real data. **M**
- [ ] **Accessibility audit against the handoff's hard rules** — every
      target ≥ 44×44 px, all text ≥ 4.5:1 AA, computed and reported as
      numbers rather than judged by eye (recurring failure 6). **Moved
      here from Phase 10**: it is a release gate, not household polish,
      and the phases that shipped since have each added surfaces it has
      never covered. **M**
- [ ] **Calm-motion pass** — no animation beyond the timer tick and the
      progress bars. **Moved here from Phase 10** for the same reason:
      `prefers-reduced-motion` is an App Review-adjacent accessibility
      expectation, not a nicety. **S**
- [ ] **PWA installability** (manifest, icons, standalone display).
      **Moved here from Phase 10** — it shares the icon work above and
      the same "someone outside the household installs this" trigger. **S**
- [ ] **A cold-start pass on a device that has never run the app.**
      Every walk and every gate this repo has ever run started from a
      populated account. Nobody has watched a genuinely empty install
      reach its first logged row — the onboarding cards, the no-baselines
      door, and the first connect all exist and are tested, but only
      against fixtures we seeded (recurring failures 3 and 11, together).
      One run, one new account, no shortcuts. **The iOS simulator covers
      the WEBVIEW half and no more** — an erased simulator is a genuine
      never-run-the-app webview state, so empty-account onboarding
      through to a by-hand logged row runs there and costs a menu item
      instead of wiping a phone. It does NOT cover the things a real
      first run is actually made of, and the exit pass was explicit
      about this: no OS permission prompts (no BLE at all —
      `capacitorBle.ts:138-145`), no TestFlight install flow, no
      Keychain/secure-storage first run. So the simulator PRE-SCREENS
      and the phone SETTLES; a green simulator run is not this item's
      exit. **S**
- [ ] **Stand the simulator up as a standing instrument, not a one-off.**
      (James, 2026-08-20: "make sure to consider the iOS simulator".)
      It is currently used nowhere — `grep -ri simulator` across the repo
      returns only the FAKE TRANSPORT's own prose, never Apple's
      simulator. Three of this phase's items want it and one other thing
      does:
      - **Store screenshots at the required sizes** — the simulator is
        the standard instrument for these, and it is the only way to hit
        Apple's exact device dimensions without owning each device.
      - **The accessibility audit** — real Dynamic Type, VoiceOver, and
        Reduce Motion, none of which desktop Chrome can produce and all
        of which the audit is supposed to check.
      - **The cold-start pass** above.
      - **Layout pre-screening for future connected work**, with the
        limit stated precisely — an earlier draft of this bullet got the
        MECHANISM wrong and the antagonist's exit pass corrected it
        (2026-08-20), so the correction is kept here rather than quietly
        overwritten. A WEB build carrying `VITE_ENABLE_FAKE_MONITOR=1`
        opened in the simulator's Mobile Safari DOES reach the fake
        transport (`transports/index.ts:251`; `isNative()` is false in
        Safari), giving an armed connected surface with no erg and no
        BLE. The draft said its safe-area insets are not the shell's;
        **that is wrong.** WebKit documents `env(safe-area-inset-*)` as
        determined by "the physical features of the device itself, not
        the browser's UI" (webkit.org/blog/7929, PRIMARY) — the insets
        DO transfer. What does not transfer is the **height model**:
        Safari's chrome collapses on scroll, so `100dvh` there is a
        moving target, while the shell's WKWebView is fullscreen with
        none. So: Safari-in-simulator is pre-screening for layout, and
        **never authoritative for a `100dvh` question**, which is
        precisely half of what the connected-surface occlusion check
        tests. **S**
- [ ] **app/e2e/ is not typechecked** (James, 2026-08-23 — owner assigned;
      previously a trap note): tsconfig.app.json covers only
      src/domain/scripts and Playwright erases types; a hand-rolled config
      over e2e/ surfaced 14 pre-existing errors when last tried. Fix the
      errors, wire the config into pnpm typecheck.
- [ ] **Let a build flag reach the fake transport on NATIVE.** One line
      in `src/adapters/monitorTransport.ts`, and it is the difference
      between "the simulator can never see a connected screen" and "every
      layout, safe-area and `100dvh` question is answerable at a desk
      forever". Today `isNative()` sends the simulator down the Capacitor
      arm, `initialize()` rejects `BLE unsupported`, and the armed screen
      is unreachable (`capacitorBle.ts:138-145`; Apple TN2295 — the
      Simulator has no Bluetooth). A native DEBUG build in the simulator
      is the real shell, with real insets and a real fullscreen height
      model — authoritative for exactly the questions Safari cannot
      settle. This is also the SAME defect recurring failure 13 records
      (only the web arm reaches the fake seam), so fixing it retires a
      standing trap rather than adding a feature. Dev/debug builds only,
      proven absent from the production bundle by `dist-grep.sh` in both
      directions per recurring failure 12. **S**

**Deliberately NOT in this phase:** Apple Health, Concept2 Logbook sync,
the parametric generator, multi-rower switching. They are features with
their own triggers; bundling them here would turn a release gate into an
open-ended wish list and guarantee the phase never closes.

**Exit:** a build passes App Review's mechanical checks with no
placeholder artwork, a real sign-in path for a rower with no Google
account, a truthful privacy declaration, and an empty-phone install that
reaches a logged row without a hand from us.

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

## Phase LL — The link can be lost, and the app has to say so

**Status:** OPENED 2026-08-20 (James, after the LT close-out walk: "i think
some of the bluetooth problems deserve their own phase with dedicated
connection management research"). Phase-open PM gate run and folded — its
verdict re-scoped the ask and is in `pm-ledger.md`.

**Implementation merged in #160. The phase stays OPEN on its exit walk**
(clauses a-e, W5-W8, W9, 9a). Owner: James's next erg visit, run through
`/hardware-walk`. The "Release posture" paragraph's cohort-of-one rule
STANDS until clause (b) exists.

**This phase is the DISPOSAL of the triggered follow-on "Reconnect and
background scan, five pieces", which is deleted in the same commit that
creates this section.** Its stated trigger — "Capacitor BLE lands, or a
tester reports a mid-piece lost link" — fired twice, and a fired trigger
that stays a follow-on is filing-as-deferral. Two homes for one body of
work is the CP/CR2 mistake; there is now one.

**What and why, in plain words.** On 2026-08-20 James armed a workout on
his phone, walked out of range, cycled Bluetooth off and on, and rowed.
The screen never changed — it held `1 OF 3 · READY` the whole time, and
his rowing went nowhere. Then it would not reconnect at all, surviving a
force-quit and a PM5 restart, until he deleted and reinstalled the app.
Separately he reports the opposite symptom: offering to Connect when the
app is in fact already connected. **One root: the app's connection state
is a local belief, never an observation, and it can be wrong in both
directions.** The goal of this phase is not to keep the link alive. It is
that a rower is never lied to about it, and never has to delete the app.

Evidence: `docs/monitor/sessions/walk-2026-08-20-lt-close/` (F-1, F-2,
F-3, F-6).

### It starts with research, and the research decides the build

**James's requirement, 2026-08-20, binding on this phase's shape:** the
phase BEGINS with a research pass into Bluetooth connection-management
best practice, and that pass carries an explicit **BUY vs BUILD
evaluation** — "in case we could be leveraging a library rather than
hand-rolling something we're not destined to be good at."

No spec is written before that pass reports. The house research rule
already applies (BLE lifecycle is a named OS-owned trigger; PRIMARY /
SECONDARY / INFERENCE tagging; "nothing found" is a result), and this
phase adds the buy-vs-build question on top of it.

- [x] ~~**The research pass**~~ — **DONE 2026-08-20**:
      `docs/superpowers/research/2026-08-20-ble-connection-management.md`.
      **Recommendation: BUY NOTHING.** Every candidate's headline
      connection-management feature is a wrapper over the same two
      CoreBluetooth facilities we can reach ourselves, and the incumbent
      plugin is healthily maintained (8.3.0 published this month — and its
      iOS sources are byte-identical to our 8.2.0, so upgrading fixes
      nothing here). Use the platform and call the functions we already
      own. **The one input that flips the answer** and should be asked
      before the spec: whether the app should keep logging while
      backgrounded or terminated. **Revised sequence from the pass:
      diagnosability → detection → recovery** (it moves diagnosability
      FIRST — you cannot fix what you cannot see, and the walk proved it).
      What the pass changed in this phase's own scope, below.
- [ ] ~~The research pass's original brief, kept for the record:~~
      Deliverable is a document, not a decision:
      what the platform guarantees, what our plugin does with those
      guarantees, what the alternatives are, and a recommendation with its
      reasoning exposed. It must cover, at minimum:
      - **The BUY side, seriously rather than as a formality.** What
        exists for BLE connection management on a Capacitor/iOS app; what
        each actually gives us over `@capacitor-community/bluetooth-le`;
        migration cost; and the maintenance question that matters most
        here — a BLE reconnect layer is exactly the kind of code whose
        bugs only appear on real hardware, which is an argument FOR
        borrowing someone else's battle-tested one.
      - **The third option, which is neither buy nor build:** use the
        platform's own primitive. Apple's `centralManager.connect` never
        times out by contract — it is iOS's built-in "connect when this
        device comes back" — and the plugin wraps it in a JS timeout that
        CANCELS the pending connection (`DeviceManager.swift:397-411`).
        We may be hand-rolling a replacement for something we currently
        disarm. Settle this before costing anything else.
      - **What the plugin already exposes that we never call** —
        `getConnectedDevices`, `getDevices`/`retrievePeripherals`, and its
        enabled-state channel — since "build" may turn out to mean "call
        the two functions that are already there".
      - **The does-it-exist question, asked of the PM5:** does the machine
        have any concept of "the session I was part-way through
        continues"? If not, reconnect can only ever mean "start watching
        again", and no copy may promise otherwise. This is the PAUSED
        lesson pointed at a new state, and it constrains the design more
        than any library choice.
      - **Apple, PRIMARY:** what `.poweredOff` does to live connections
        and whether `didDisconnectPeripheral` is delivered through that
        transition; what bounds the delay on an out-of-range drop (this
        decides whether a frame-silence watchdog is mandatory or
        belt-and-braces); and whether the per-app peripheral identifier
        survives a delete-and-reinstall — which is also a candidate
        explanation for the brick.
      - **Our own prior art, quoted not re-derived:** the web arm's
        stale-GATT-handle `InvalidStateError` "would have broken the
        driver's whole reconnect path on real hardware while passing CI,
        since the fake had no handle invalidation"
        (`pm5-interface-notes.md:2502-2505`).

### The background question, ANSWERED — and it did not reopen BUY

**James's ruling, 2026-08-20: backgrounded YES, terminated NO.** His
reasoning defines the scope: "backgrounded could happen by accident if a
person gets an urgent text or a call and they answer mid-row." **This is
not background workouts. It is not losing a rower's row to an
interruption they did not choose.** Terminated-no removes state
restoration entirely (restoration exists to relaunch a KILLED app).

A research delta followed (same document, `# DELTA` section). Its result:

- **A background mode would probably buy nothing, and the mechanism is
  not the one anyone expected.** The obstacle is not iOS's app lifecycle,
  it is **WebKit's own process throttler**: the complete set of things
  that keep a WebContent process runnable is *visible, audible,
  capturing*. A running timer, an open BLE subscription and a workout in
  progress are on none of them, and **not one step in that chain reads
  `UIBackgroundModes`.** So "the link stays up" and "we keep logging the
  row" are genuinely different claims, and a background mode buys only
  the first.
- **COULD NOT ESTABLISH by reading**, and it is labelled that way: one
  escape hatch depends on private RunningBoard SPI with no published
  reference. **A 90-second probe settles it** — one build, two runs, with
  and without the plist key (procedure in the delta's §D1e).
- **The recommendation is CORRECT RESUME, not a background mode**, and it
  is robust to that unknown — which is why the probe is not a blocker.
  Compared on what the ROWER ends up with, the two options differ in
  **exactly one row**: whether the app tells him he was away. If JS
  freezes, the mode delivers nothing for the interruption case; if it
  does not freeze, the case is already handled without it. Keep-awake
  makes it decisive — the screen stays on, so the app is foregrounded for
  the whole normal row, and a permanent architectural commitment would be
  bought for an accident.
- **BUY stays closed.** The flip condition was narrowed, not triggered:
  `bluetooth-central` does not serve "backgrounded" for a WebView app,
  and "terminated" is ruled out. `@capacitor/background-runner` is
  eliminated on its own documentation (stateless, DOM-less, destroyed per
  event).

**Three findings from the delta that outlive the choice:**

- [x] **~~`seriesRecorder`'s boundary fold silently UNDER-COUNTS when a
      gap spans an interval boundary~~ — RECORDER-SIDE HALF SUPERSEDED,
      DRIVER-SIDE HALF NOW AN ACCEPTED, SPEC-RECORDED COST (series-truth
      spec §B′, 2026-08-25).** `seriesRecorder` no longer folds or
      rejects anything on its own account: B′ deletes its own boundary
      heuristic entirely and keys registers on `attributedIntervalIndex`
      — the ONE key the driver's own register logic already resolved —
      so there is no second, recorder-owned fold left to under-count.
      The driver-side observation stands, unchanged: on a refused open
      OUTSIDE states 8/9, the series still max-merges the post-gap
      interval into the prior key — short by the gap, the same
      short-by-the-gap the accumulator already accepts. James accepted
      that trade (consistent-with-the-accumulator over
      independently-diverging) rather than build a second guard; it is
      pinned by a `seriesRecorder.test.ts` regression on that exact
      edge, never left "unreachable".
- [ ] **A backlog may already exist, twice over, unbuilt.** Apple
      documents that for a foreground-only app "all Bluetooth-related
      events… are queued by the system and delivered to the app only when
      it resumes", and WebKit's IPC send queue is uncapped in source. Our
      pipeline is wire-clock driven (`driver.ts`, `seriesRecorder.ts`,
      three named wall-clock exceptions), so it **could consume a drained
      backlog** — the row might reconstruct itself. Depth and duration of
      both queues: could not establish. Probe before designing anything
      that assumes loss. **S**
- [ ] **Capacitor answers a killed WebContent process with
      `webView.reload()`**, destroying the driver, the recorder and up to
      30 s of unflushed series (the flush is a `setInterval`, frozen
      while suspended). Flagged by the delta as contradicting its own
      brief: **"terminated no" disposes of force-quit, not of memory
      pressure**, and the system killing a backgrounded app is exactly
      the termination case that matters here. **M**

**Two corrections to this section's earlier text**, both from the delta:
the claim that apps have been rejected for declaring `bluetooth-central`
without a qualifying use **could not be sourced** — Bluetooth appears
zero times in the App Store Review Guidelines, and 2.5.4 restricts USE,
not declaration. And a carve-out the first pass predates: **iOS 26 grants
foreground-equivalent Bluetooth privileges to an app that starts a Live
Activity before backgrounding** — attractive for exactly this scenario,
but it restores BLUETOOTH privileges only and says nothing about
WebKit's throttling, so it does not rescue the JS half.

### What the research changed — read before writing the spec

- **The frame-silence watchdog is MANDATORY, not belt-and-braces.** Apple
  documents no bound on out-of-range disconnection latency, and — the
  important silence — **does not document whether
  `didDisconnectPeripheral` fires on a Bluetooth power-off at all.** Since
  that callback is our only detector, detection may be *structurally
  absent* for exactly what James did. No amount of reading settles it.
- **A cheap second signal exists and we never subscribe to it:** the
  plugin's `startEnabledNotifications` channel reports the power-off
  directly (`DeviceManager.swift:48-70`).
- **iOS 17 ships Apple's own auto-reconnect** —
  `CBConnectPeripheralOptionEnableAutoReconnect`, with an `isReconnecting`
  signal — **and the incumbent plugin cannot reach it**, because it passes
  `options: nil` and exposes no connect-options passthrough. That is a
  fork/patch/upstream question, not a library-selection question, and it
  is the shape "reconnect" would most likely take here if it is ever IN.
- **F-2 is not a connect failure.** This record's own wording says the
  retries "reached programming" — connect kept succeeding, programming
  kept failing. Verified closed loop: `program()`'s catch never
  disconnects and never clears `driverRef`, Try Again reprograms over the
  same dead driver, and `connect()` early-returns while `driverRef` is
  set. Strongest instrumentable candidate for the link death: every
  connect attempt builds a **new `CBCentralManager`**
  (`Plugin.swift:62-71`) while the plugin's `deviceMap` retains
  peripherals from previous centrals. **It does not explain the
  force-quit survival, which is still unexplained.**
- **THE PM5 HAS NO RESUME CONCEPT — established by exhaustive
  enumeration, not assumed.** Its workout state machine has fourteen
  states and none concerns the link; a grep of the whole CSAFE spec for
  resume/reconnect finds nothing. What exists instead: the machine keeps
  counting and publishes its current state, so "start watching again"
  recovers the numbers but **never the gap**. The only retrospective
  store is a COMPLETED workout's internal log (`0x003F` +
  `CSAFE_PM_GET_INTERNALLOGPARAMS`), which is not a mid-piece backfill.
  This re-confirms DEVIATIONS 75 from first principles instead of
  inheriting it, and it binds any future copy: **no wording may promise
  a rower that a gap will be filled.**
- **"The PM5 is single-central" HAS NO SOURCE** — absent from Concept2's
  documents and from our own record, and it was stated as fact during the
  walk. It is a documented absence plus consistently singular language.
  Do not inherit it; settle it with a one-line device probe, on which
  part of the recovery design depends.
- **Two corrections to this phase's own opening text**, from the pass
  reading the source rather than the brief: the connect timeout is a
  Swift `DispatchWorkItem`, **not a JS timeout** (`DeviceManager.swift:
  398-411`) — which changes where any fix lives — and raising it would
  also un-bound **service discovery**, where there is a live path that
  never resolves (`Device.swift:81-91`).

### In scope

- [x] **The trace tells the truth about the row** — spec 1, written
      2026-08-20:
      `docs/superpowers/specs/2026-08-20-trace-truth-design.md`. **TRIAD**
      (a number's meaning AND a stored shape); full antagonist pass done
      and folded into its §8. Index-keyed max-merge REPLACING the boundary
      heuristic (not supplementing it — deletion retires four defects at
      once); rests drawn but MARKED, which puts a rest flag in the stored
      sample; and the chart gains the time axis it has never had. Three
      PRs, accumulator first and alone. **This is spec 1 of the phase by
      James's sequencing, ahead of the three items below.** **DONE
      2026-08-20 (Task 3, the time axis, trace-axis PR): all nine exit
      criteria met.** Criterion 7's own capture choice (below, ROADMAP's
      pre-task-3 item): `log-detail.png`, not `log-monitor.png` —
      `buildLogDetailSeries()`'s own fixture already derives its series
      from the SAME 478s used for the row's `timeSeconds`, so the axis's
      own last label (`7:58`) reconciles with the `TIME` hero exactly, in
      the same viewport-only frame; re-deriving `log-monitor.png`'s
      `avgSplit`/`avgSpm` off its raw elapsed stream would be a
      number-semantics change to the summary model, out of proportion to
      a screenshot fixture. `log-monitor.png` is left as-is (a genuine
      recorder replay, real wire frames through the real recorder — its
      own stated purpose, distinct from criterion 7's reconciliation
      check). The pre-existing y-axis label clipping (`L:40.0` ->
      `1:40.0`) is also fixed (`LEFT_PAD` 36 -> 42). **The owed notes
      clause (spec §7 criterion 9, below) is now due at the next tag —
      nothing further blocks it.** **M**
      **Task 1 review finding M1 (2026-08-20), owed to a later task:**
      `traceModel.test.ts`'s own "the line breaks across a REAL gap"
      evidence — a real capture proving a genuine >3s wire gap actually
      splits the drawn line — was REMOVED, not migrated, during Task 1's
      close-out (the only capture that had carried it,
      `pm5-session4b-final.log.gz`, concatenates four real sessions through
      one recorder, a scenario the new key-based accumulator does not
      support and cannot be used as evidence for). The gap-break behavior
      itself is unchanged and still covered by synthetic fixtures; what's
      owed is a fresh REAL-capture witness of a genuine >3s gap, the same
      evidentiary bar the rest of this module's tests hold themselves to.
      Owner: the standalone item below.
- [ ] **HARDWARE QUESTION owed to Phase LL's exit walk — DISTANCE only.**
      **CORRECTED at the 2026-08-20 PM gate: an earlier version of this item
      said the work→work reset had "never been confirmed on hardware." That
      was wrong for ELAPSED, and a walk item that overstates what is unknown
      buys an erg session to re-observe a settled fact.**
      `pm5-interface-notes.md:3268-3271` records a 2×TIME program with
      `restSeconds: 0` on both intervals where `state` stays `"rowing"`
      across the boundary and "the very next frame reset[s] `elapsed` to 0"
      — §19.1's correction at `:3290` calls it "the one and only
      elapsed-reset-while-rowing in the whole log" ([S2] D4, 2026-08-06).
      **ANSWERED 2026-08-23, from the keystone capture nobody had read
      (close-gate condition 3): DISTANCE DOES reset at a zero-rest
      work→work boundary** —
      `walk-2026-08-23/keystone-pm5-recording-1787491974452.jsonl.gz`
      seq 305→310: elapsed 69.75→0.50, distance 248.5→1.9, rowingState 1
      throughout, TWD 0→250. The feared over-report does not exist. No
      rowing owed; this box is checked by a committed file. (The original
      open question, kept for the record:) It matters: if it does not,
      the new accumulator silently OVER-reports on zero-rest boundaries —
      direction-flipped from the bug just fixed, and a shape the old
      edge-triggered code would have got right. Not exotic either:
      `program.ts:554` defaults `restSeconds: 0`, so a warm-up→work0
      transition is a zero-rest work→work boundary on essentially every
      connected session. **Probably already answered from a committed file:**
      the new accumulator is digit-identical to the shipped one on `step-3`,
      and since the shipped one detects boundaries ONLY by a backward elapsed
      jump, digit-identity across a key change is itself evidence a reset
      occurred there — check whether `step-3` contains a `restSeconds: 0`
      transition before booking any rowing. **S**
- [ ] **A replacement real-capture witness for a genuine >3 s wire gap
      breaking the trace line** — lost when three tests built on an invalid
      four-session capture were removed (PR #140). **Owner BOUND to Phase
      LL's exit walk** (PM gate, 2026-08-20): the deliverable is a CAPTURE,
      and captures come from walks, not from tasks. **UN-BOUND from the
      exit walk (close gate, 2026-08-23): the walk structurally could not
      produce it** — `adapters/monitorTransport.ts:70` composes the
      recorder on the WEB arm only, so the laptop leg had the recorder and
      no gaps and the phone leg had the gaps and no recorder. New home: a
      deliberate web-leg capture (background the Chrome tab mid-piece at
      any future lab session), or extend the recorder to the native arm
      first. Sits beside exit clause (e) so it cannot silently vanish. **S**
- [ ] **BEFORE the next tag: three owed clauses plus a version-marker
      ruling** (PM gate, round 4 of the Task 2 PR review, 2026-08-20;
      third clause added by the EST LEFT task, 2026-08-20).
      **The notes obligation** (spec §7 criterion 9, the
      pm-ledger, and a DEVIATIONS row 204 sentence all already say this —
      this is the fourth, GREPPABLE home, because the last two tags each
      shipped with a missing clause and whoever cuts v0.15.0 reads
      ROADMAP and the merge log, not the spec): the next tag's notes
      carry (1) a clause for the time axis and rest marking (the new,
      observable-to-a-tester feature), (2) a clause for the old
      corpus (§5's declination overturned at the 2026-08-20 PM gate —
      some traces recorded before this phase's fixes are silently wrong
      and cannot be told apart from correct ones), and (3) a clause for
      EST LEFT (`docs/superpowers/specs/2026-08-20-est-left-design.md`
      exit criterion 9): the connected screen's remaining-time estimate
      used to stall/read high through a rest, and no longer does — the
      rename from TOTAL LEFT shipped in the same window (PR #143) and its
      own notes clause is separate; this one is about the COUNTDOWN
      behavior, not the label. **Still open — Task 3 (the axis) landed
      2026-08-20 and the EST LEFT fix landed 2026-08-20, so this item is
      now fully armed: all three clauses' subject matter exists in
      shipped code, and whoever cuts v0.15.0 owes all three.** **Clause
      (4), added at Phase LL's close gate (2026-08-23, finding F3): the
      link-lost ending is STORED but rendered NOWHERE, and v0.17.0's
      shipped note claims the history "can tell the difference" — either
      the surface ships before the next tag and its clause says so, or
      the next tag's notes carry the honest "not yet" (the false half of
      the v0.17.0 note is struck in the same PR as this clause).**
      **Branch taken (cohort-unlock PR, 2026-08-23): the surface ships —
      `FromTheLog.tsx`'s detail header now renders `LINK LOST · the app
      lost the monitor before the end` for a stored `endedBy:
      "link-lost"` row. The v0.17.0 note's false half was already struck
      in an earlier PR (`src/news/content/releaseNotes.ts`'s v0.17.0
      entry carries the "Corrected 2026-08-23" parenthetical). The
      clause's own NOTES TEXT — the v0.20.0 entry saying the surface now
      exists — is still owed at the tag, not written here.** **New
      condition, this gate:** the phone→server trace leg must be
      WITNESSED before the tag
      that announces the trace fix ships, or the notes say plainly that
      traces are web-only today — announcing a fix for a leg nobody has
      run on a phone is its own false-completeness risk, the same shape
      as the three-clause rule itself protects against. **Version-marker
      ruling (NOT implemented here — adding a field at a merge-gate
      review is the escalate-mid-change hazard this repo's own rules
      name):** the next change that touches `series` carries a `v`
      version marker on `SeriesData`, decided before the phone→server leg
      ships. Reason: the meaning of these bytes has changed twice in six
      days with the bytes themselves unchanged (the accumulator fold,
      then the rest marker), spec §9 has a third change queued, and one
      integer per run makes era detection trivial RETROACTIVELY — absent
      `v` IS the pre-fix marker, cheap only while the corpus is one
      rower's two days old.
      **A FOURTH clause is now owed too (Phase LL, whole-branch review,
      exit criterion 10):** a lost link now says so, and a lost-link
      ending is recorded as such. Same "greppable home" reasoning as the
      other three — whoever cuts the next tag owes all four.
- [x] **BEFORE trace-truth task 3 (the time axis): its exit criterion 7 is
      currently UNSATISFIABLE on the flagship capture, and the reason is
      structural** (PM gate, 2026-08-20). Criterion 7 asks that the axis's
      values "reconcile with the session's own TIME hero in the same frame".
      On `docs/screenshots/log-monitor.png` they cannot: the chart's fastest
      pace reads ~1:38 beside a measured row reading `1:15.0`, because
      `screenshots.spec.ts:2951-2953` says outright that the fixture's
      `avgSplit`/`avgSpm` are "the fake's own scripted per-interval actuals
      (independent of the raw elapsed stream)" — the row and the trace are
      wired to disagree BY CONSTRUCTION, so the repo's own
      recompute-the-headline check returns a false RED on that screen
      forever. Four `—` rows and the crop also mean the TIME hero is not in
      frame at all. Task 3 either re-does the fixture so both numbers come
      from one path, or the criterion moves to a capture where they do.
      Recorded now so task 3 does not discover it at its own gate and fudge
      the criterion. **Also task 3's business, same captures:** the y-axis
      labels render CLIPPED (`L:40.0`, `L:50.0`) — pre-existing, shipped in
      v0.14.0, and squarely in scope since criterion 7 says labels must be
      readable. **DONE 2026-08-20 (Task 3, trace-axis PR):** the criterion
      moved to `log-detail.png` — its own fixture already derives the
      series and the `TIME` hero from the same 478s, so the axis's last
      label (`7:58`) reconciles exactly, in the same frame, with no fixture
      change needed. `log-monitor.png` was left alone (see the spec-1 entry
      above for why re-deriving it wasn't the proportionate fix). The
      y-axis clipping is fixed (`LEFT_PAD` 36 -> 42, both captures verified
      by eye). **S**
- [x] ~~**THE COUNTDOWN STALLS DURING RESTS, and the progress bar with
      it**~~ — **FIXED (Phase LL, 2026-08-20).** The hypothesis below was
      confirmed: `surfaceModel.ts`'s old `totalLeftSeconds = totalSeconds -
      frame.sessionElapsedSeconds` froze through a rest because the PM5's
      per-interval clock (what that accumulation is built from) only
      advances while `rowingActive` is true. The fix reads the field the
      machine already sends instead — `frame.restSeconds` (0x0032's own
      Rest Time, parsed since Phase 7A, consumed nowhere until now), which
      counts down in real time regardless of the flywheel. `estElapsed` is
      now every COMPLETED phase's own programmed length, summed, plus a
      LIVE term for the current one (Rest Time during a rest, the raw
      interval clock during work), clamped monotonic non-decreasing across
      frames — proven against a whole replayed capture
      (`docs/monitor/sessions/walk-2026-08-16/session-2-wu-4unequal.jsonl`),
      including the capture's own `finished` frame, where the first design
      of this fix went backwards 428.5 s from laundering a `null`
      `intervalIndex` to `0`. Spec:
      `docs/superpowers/specs/2026-08-20-est-left-design.md`. THREE
      accepted limits recorded in `docs/design/DEVIATIONS.md` (dawdling at
      the start of a work interval still runs high; an unpriced phase's
      live term is a hole, guarded on BOTH render sites of the number —
      `PaneLive.tsx`'s bar and cell and `ConnectedSurface.tsx`'s GRID
      header countdown — by the same `hasRemainingEstimate` the phone timer
      already uses; and on DISTANCE work the estimate holds still for
      seconds at each handover, measured at 6.6 s and 20.8 s on the pyramid
      capture, see the triggered follow-on for why the obvious repair does
      not work). Original hypothesis, kept for the
      record: (James, device report + two photos, 2026-08-20, rowing
      "Strong Breeze"). He saw `TOTAL LEFT` reading roughly a minute high,
      and the bar lagging when interval 4 handed over to interval 5 after
      its rest. **One likely cause for both, and it falls straight out of
      this phase's own B1 finding.** `surfaceModel.ts:970` computes
      `totalLeftSeconds = totalSeconds - frame.sessionElapsedSeconds`, and
      `totalSeconds` INCLUDES the programmed rests — but the antagonist
      pass established that the PM5's elapsed clock only advances during a
      rest while the flywheel is moving. Sit still through a rest and the
      wire's elapsed freezes, so the countdown stops ticking down while
      real time passes, and the bar's fill (driven by the same figure)
      stalls at the boundary then jumps. Strong Breeze carries 10:00 of
      rest across four rests; a ~1 min drift is the right order of
      magnitude. **HYPOTHESIS, not a finding** — testable with no hardware
      by replaying a committed rest-bearing capture and checking whether
      `sessionElapsedSeconds` flatlines through the rests. **TRIAD** (a
      number a rower reads). **M**
- [x] **Rename `TOTAL LEFT` to `EST LEFT`** (James's ruling, 2026-08-20).
      Honest for a second reason independent of the stall above: a
      DISTANCE interval's contribution to `totalSeconds` is distance ÷
      target pace, so rowing faster than target makes the session
      genuinely shorter than programmed. Copy only — rides the next PR
      touching the connected surface. **DONE 2026-08-20 (rest-scale PR):**
      `PaneLive.tsx`'s band cell label only — the header countdown's own
      `M:SS LEFT` format and the unconnected `TimerRuler`'s own `TOTAL
      LEFT` row (a different surface, `model.totalLeftDisplay` still the
      field name internally) are untouched. **S**
- [x] ~~The progress bar's segments are unevenly divided~~ — **NOT A BUG,
      settled 2026-08-20 from James's own two photos without touching the
      code.** Strong Breeze (`app/server/seed/library/tr.ts`) is 5×2:00
      work with rests of 2:00/2:00/3:00/3:00/none, so each interval's
      share of the session is 4:00/4:00/5:00/5:00/2:00 — 20% / 20% / 25% /
      25% / 10% of twenty minutes. Measured off his LIVE screenshot: 19.8%
      / 19.8% / 25.4% / 25.1% / 9.9%. The bar is proportional to work plus
      rest and the unequal rests are what make it uneven. Recorded because
      it will look wrong again to the next person who sees it.
- [x] **Detection — make the banner that already exists actually fire.** SHIPPED (Task 2, this branch): all four mechanisms + the hysteresis lifecycle.
      `1 OF 3 · READY` is structurally impossible once
      `phase === "disconnected"` (`surfaceModel.ts:787`), so its
      persistence proves the phase never moved. The app's only lost-link
      detector is the plugin's disconnect callback, fired solely from
      `didDisconnectPeripheral`; there is **no frame-silence watchdog
      anywhere**. The `LOST THE MONITOR` treatment is already designed and
      shipped (DEVIATIONS row 75) — this is not a design job, it is
      making a shipped thing reachable. **M**
- [x] **Recovery — a failed attempt no longer poisons the next one.** SHIPPED (Task 3): failure disposes (transport, driver, deviceName); the already-connected guard (F-6 only — the force-quit brick is NOT covered and remains unexplained); the memo hoist. Clause (b) — "without deleting the app" on real hardware — stays with the exit walk.
      `program()`'s catch never disconnects the transport (contrast
      `connect()`'s catch, `useMonitorSession.ts:1607`), and
      `handleTryAgain` (`ConnectedInterstitial.tsx:311-313`) reprograms
      over the same dead driver instead of reconnecting: a self-sustaining
      `LINK-FAILED` loop by construction. Includes F-6's missing
      already-connected guard — there is no `isConnected` /
      `getConnectedDevices` call anywhere, and `createTransport` builds a
      fresh transport per attempt, so a forgotten-but-live connection
      against a single-central PM5 is exactly the failure shape observed.
      **M**
- [x] **Diagnosability — move the diagnostic out from behind the door the
      bug locks.** SHIPPED (Task 1): liveness decorator both arms, timestamped ring readable from the failure screen, 0x0039/0x003A routed. `MONITOR LOG · COPY` lives on the log screen
      (`LogSession.tsx:668`), reachable only after a session finishes,
      which is downstream of the failure under study. It belongs on the
      failure and connected surfaces too. This is what made both walk
      findings evidence-poor, and it scopes any fix. **S**
- [x] **Re-reason the failed-`program()`-leaves-a-run-open item.** RESOLVED (Tasks 3+4): a failed program now disposes fully AND closes any open run with `endedBy: "program-failed"` — the parked P3b decision is superseded by construction; the terminate-then-disconnect ordering carries teardown's own chain.
      `driver.ts`'s `program()` replaces `activeRun` only after
      `sendPrepare()`/`sendSequence()`/`verifyArmed()` all resolve, so a
      throw part-way leaves the previous run open, still normalising the
      next boundary and still emitting its own `workoutComplete`. Parked
      in 7A-fix-2 Task 4's review (probe P3b) on a rationale citing a
      destructive-reject fact that §19.2 has since WITHDRAWN; the decision
      needs re-reasoning against the current record (draft in PR #70's
      body). Directly relevant: a failed `program()` is the exact event
      that started the walk's `LINK-FAILED` loop. **S**

### Explicitly OUT — with what has to be true before each is IN

Reconnect is **future work, not irrelevant** (James asked, 2026-08-20).
It is out of THIS phase because the harm observed does not require it,
because the shipped "lose and degrade" posture (design spec C5,
DEVIATIONS 75/82) was never proven broken — only never proven working, its
banner having never fired on native — and because it is the most
invention-heavy piece available: `createPm5Driver` subscribes only at
construction, has no teardown, and rebuilding a live driver
double-processes every notification. **RECONNECT PREREQUISITE from
#183's gate: the only real backward interval count in the corpus is a
CONNECT-TIME leftover register (`session-2-wu-4unequal.jsonl` AS2 seq
24→29, count 3→0) — harmless today only because no re-subscribe path
exists. A reconnect that re-subscribes with a run OPEN lets the first
post-resubscribe 0x0033 reach the continuity guard as `after` and would
convict a healthy row on the stale register; any reconnect design must
reset/quarantine `lastContinuityRef` (the count axis specifically)
across the re-subscribe.** Before reconnect is IN:

1. The research pass has answered the buy-vs-build question and the
   PM5's does-it-exist question.
2. **The fake models handle invalidation.** **Merge this with Phase RC's
   RC-8** (the fake's five contradictions of the real wire, including the
   `intervalRestTimeSeconds: 0` hardcode at `fake.ts:878`) — they are one
   piece of fake work and specced apart they get done twice. Today it
   cannot prove a
   reconnect works — see the quoted prior art above — so reconnect tests
   would be theatre. This is a real work item and it lands first.
3. Detection ships, so we have seen what "lose and degrade" actually
   feels like on hardware before deciding to replace it.

Also OUT, and each for a stated reason: **MISSED-rows inheritance**
(DEVIATIONS 82 — they exist only to catch what a reconnect BACKFILL fails
to fill; no backfill, no MISSED); **background scan** and
**`DiscoveredMonitor.rssi`** (convenience, not the defect); and **any
`RECONNECTING` copy** (DEVIATIONS row 75 made that ruling once; do not
un-make it before the thing it promises exists).

### Spec inputs from the 2026-08-21 ecosystem review

Not a second research pass — the pass already reported (BUY NOTHING;
diagnosability → detection → recovery). These are inputs shaped against
that sequence, from the review that also opened Phase RC above. Two of
Phase RC's blockers are LL's to fix, because both are link-caused.

**A-2 (detection/recovery tier) — hold the radio past the terminal frame
until the machine says it logged the piece.** We disconnect **21.7, 24.1,
30.6 and 107.3 ms** after the terminal 0x0031 on the four natural
finishes we have bytes for, and the `disconnect` line is written after
`await inner.disconnect()`, so real teardown began earlier. Keep the link
up after `ended` until whichever comes first: a 0x0031 reporting state
12, a 0x0039 arrival, or a bounded outer clock above 3.5 s.
`parse.ts:431` already maps state 12 to `"finished"` and the driver
already holds `raw.workoutState` in the finish path, so this is a read,
not a parser change. Ship the wall clock as a live fallback and log which
path fired — state 12 is an unobserved wire premise. **The real tension
the spec must resolve:** `ConnectedSurface.tsx:60-63` deliberately
refuses to hold a GATT link across iOS backgrounding.
**Also correct the premise the whole finish design rests on:**
`ConnectedSurface.tsx:52-55` says the final split arrives "~1 ms AFTER"
the frame that ends the workout, from one walk-day-2 observation.
Measured across four captures: **-179.9, +90.2, -89.7, +7.6 ms.** The
sign varies; in two of four the split arrives FIRST, the hand-off hold
never opens, and `FINISH_HANDOFF_HOLD_MS = 3500` buys nothing.

**A-4 (detection tier) — four mechanisms produce the same silent short
row, and only one is covered today.**

- **A Bluetooth power-cycle delivers no per-device callback.** Apple: all
  `CBPeripheral` objects "become invalid; you must retrieve or discover
  these peripherals again". The plugin's `.poweredOff` arm
  (`DeviceManager.swift:53-56`) runs `stopScan()` and
  `emitState(enabled: false)` and resolves no per-device key. The signal
  that IS emitted, `onEnabledChanged`, we never subscribe to. (That the
  per-device callback never fires is INFERENCE — Apple documents it
  neither way. Tag it so in the spec.)
- **iOS backgrounding, and nobody had checked.** `Info.plist` declares no
  `UIBackgroundModes` at all and the monitor stack registers no
  app-lifecycle listener anywhere. **An incoming call mid-piece produces
  the reported failure with no radio fault whatsoever.** This also
  falsifies the third clause of `types.ts:429-433`.
- **A single characteristic's subscribe rejection** calls `disconnectCb`
  while every other subscription keeps delivering
  (`capacitorBle.ts:430-448`) — a `disconnected` phase with an intact
  frame stream, which then freezes the series recorder for the rest of
  the session (197 of 419 samples lost on replay, `truncated` false, the
  stored heroes unchanged).
- **A genuine drop inside the `callerInitiatedDisconnect` window** is
  swallowed as housekeeping (`capacitorBle.ts:227-238`).

What to build, in the phase's own sequence: subscribe
`startEnabledNotifications` (cheapest, and it covers James's exact
reported trigger); add a status-arrival watchdog at the transport seam
keyed on 0x0031 only, threshold **2500 ms — about 3x our worst recorded
web gap (810 ms) and about 25x the native 100 ms cadence, and the
constant's comment should say BOTH numbers**. **CORRECTED 2026-08-22
(Phase LL anchor pass): the "25x native 100 ms cadence" half is FALSE.**
100 ms is a REQUEST the record already shows is not honoured —
`liveness.ts:121-127` measured ~508 ms mean delivered on web once the
sample-rate write is sent (the write itself is fire-and-forget and its
outcome is swallowed); native's own inter-frame gap distribution is
UNMEASURED (spec exit criterion 9a, a walk deliverable). The shipped
comment states the measured web margin (3.09x, 810.3 ms worst of 3,442
gaps) and says native is unmeasured — it does not carry a native cadence
number, because there isn't one to carry. Give it a DISARM rule for
workout states 10/11 and the finish hand-off window or it fires across
every normal finish and races the boundary the hold protects; drive a
`stale` link axis that recovers on the next valid frame rather than
faking a disconnect; and route an interrupted close through a distinct
reason code. **Today a link death and a rower stopping early are both
`terminated: true`, and the server row carries neither flag.**

**Before any recovery lands it needs a continuity rule.** RowTracer's
`pm5web/transport.js:117-129` `pm5Continuity(before, after)` returns
`"reset"` if elapsed went back more than 2 s, distance more than 5 m, or
stroke count dropped, and `:319-333` preserves the interrupted capture
and starts a clean one rather than merging — "Never merged silently."
**MIT, so legally borrowable**, unlike ORM and qdomyos-zwift. A resumed
stream folding into a stale register map is exactly the defect this phase
was opened to prevent.

**Diagnosability tier, three concrete gaps.** (1) There is no diagnostics
seam on native at all: `adapters/monitorTransport.ts:49-56` returns
`createCapacitorBleTransport()` raw, so byte capture is structurally
impossible on the platform that produces every real row, and there is
nowhere to hang the watchdog. **Build two decorators, not one** — a
production-safe liveness/probe decorator on both arms, and the recorder
kept behind its build-time constant; a single `withDiagnostics` wrapper
would ship the recorder's whole module graph into production (recurring
failure 12). (2) The ring records decisions and almost no numbers, has no
time axis, and dies with the tab; on native it IS the record.
(3) 0x0039 and 0x003A bypass `mergeStatus` entirely (direct `t.subscribe`
at `driver.ts:3649/3653`) so even their hex would never reach the ring,
and 0x003A's callback takes no `bytes` parameter at all. One-line fix,
and it is the precondition for ever settling the summary premises.

**Two corrections to this phase's own record**, both caught by the
review's verification pass:

- **The retry path's diagnosis was wrong.** The walk README said
  `connect()`'s catch clears `driverRef`; it does not. The only two
  `driverRef.current = null` sites are `cancel()` (`:1406`) and teardown
  (`:1694`). `ConnectedInterstitial.tsx:299-309` reads a stale local and
  says so in its own comment. **There is no existing discipline to copy;
  the fix must be specified from scratch.**
- **Do not inherit a loss estimate for the 0x0031-before-0x0033 skew.**
  It has only ever been measured at 2 Hz (median 2-11 ms, p99 ~180 ms,
  max 361 ms, quantised in ~90 ms steps that look like connection-event
  scheduling). The misattribution window is wall-clock skew, not frame
  count, so the primary platform's ~10 Hz is neutral-to-better. Measure
  it; drop the estimate.

**One cheap fix with an invariant behind it:** every connect attempt
constructs a new `CBCentralManager` while the plugin reuses the old
`Device` object with its callback map intact. Our half is one line —
hoist the `initialize()` memo to module scope in `capacitorBle.ts` —
restoring an invariant that file's own comment already claims holds.
Verified safe; nothing depends on re-initialisation. The harm is still
unproven and it still does not explain the force-quit survival.

**Three execution facts inherited from Phase WU (2026-08-22), each of
which bites this phase.** Full text in Phase WU's "What this phase taught":

1. **`app/e2e/` is NOT typechecked.** `tsconfig.app.json` covers only
   `src`/`domain`/`scripts` and Playwright erases types, so a stale call
   signature compiles and runs silently; a hand-rolled config over `e2e/`
   surfaces 14 pre-existing errors. This phase's diagnosability tier is the
   natural owner if it wants to fix it, and either way no LL brief may
   claim "the compiler will catch it" about anything under `e2e/`.
2. **pnpm swallows scoped-run flags in BOTH suites.** `pnpm e2e -- -g` runs
   all 401 tests even double-dashed, and `pnpm test --project client --
   <pattern>` does the same for vitest. Working forms:
   `pnpm exec playwright test --grep` and `pnpm exec vitest run`. **Check
   the run count** — a full-suite count means the filter was eaten.
   **SHARPENED at Phase LL's final re-review (2026-08-22): the "working
   form" is itself unsafe for SINGLE FILES** — `pnpm exec vitest run
   --project client <file>` runs the file OUTSIDE its jsdom environment in
   this workspace (`localStorage` undefined, 89 false failures against a
   green HEAD). Only the full-project run is trustworthy for client-env
   files; a single-file red must be reproduced at project scope before
   anyone "fixes" it.
3. **A dispatched subagent's background waits die when it idles.** Every
   implementer brief must say gates run FOREGROUND and blocking; four
   rounds were lost to armed monitors that could never wake.

**THE PHASE'S WALK CARD (Task 5, 2026-08-22)** — five questions plus one
deliverable, each stated so the walk can go red:

- **W5** — Bluetooth power-cycle, armed but not rowing: does
  `didDisconnectPeripheral` fire for our device (INFERENCE either way —
  Apple documents only connect/cancel), and does the now-subscribed
  `onEnabledChanged` catch it as designed?
- **W6** — background the app 30 s mid-piece: does a backlog of BLE events
  drain on resume (Apple documents queuing; depth unknown), and does the
  continuity guard pass the healthy resume (its corpus-derived bound says
  it must)?
- **W7** — navigate the PM5's own menu mid-session: does the wire go
  quiet? If yes, that is a legitimate quiet period the watchdog's disarm
  list does not cover and the 2500 ms threshold fires falsely — the one
  disarm unknown the corpus cannot answer. (Stays on the PHONE leg of
  Phase RC's combined walk — RC's own distance-shaped item was renamed
  W10 to stop the collision; see Phase RC's walk card, spec §6.)
- **W8** — leave an armed/live session untouched: does the PM5 ever emit
  TERMINATE on its own (an inactivity timeout)? `endedBy: "rower"` on the
  TERMINATE path asserts agency on the machine's behalf if it does.
- **W9** — `getConnectedDevices` may be SYSTEM-scoped: a phone where
  ErgData holds a DIFFERENT PM5 could be offered the wrong erg with no
  picker. One tap at the walk settles it.
- **9a (deliverable)** — the native inter-frame gap distribution from the
  liveness decorator's own snapshot, read off the ring on a real phone:
  the corpus's web-only numbers (worst 810.3 ms) are necessary, not
  sufficient, for the 2500 ms threshold on the platform it exists for.
- **Capture ask that costs nothing extra:** the ring now survives to the
  failure screen — if the row-to-resume FLASH (§2b, mechanism unexplained,
  corpus hypothesis falsified) appears during any piece, copy the
  connection log immediately after; the timestamped frames around that
  moment name the real mechanism.
- **WARNING — watch for false banners specifically:** a spurious watchdog
  fire plus End inside the 10 s hysteresis stores `endedBy: "link-lost"`
  on a healthy row. The threshold is web-derived (2500 ms); native is
  unmeasured (see 9a). A false LOST banner during the walk is itself a
  finding, not just an inconvenience to work around.
- **The negative result is committed, not just reported:** a regression
  test (`useMonitorSession.test.ts`, "Phase LL minor 3") replays all 6
  corpus captures through the real `nextFreezeRun`/`isPausedRun` and pins
  zero PAUSED firings at any post-rest work-interval start, so a future
  change to the guard cannot silently reopen the falsified mechanism
  without a red test naming it.

**WALKED 2026-08-23 — record: `docs/monitor/sessions/walk-2026-08-23/`.**
Clauses (a) both variants, (c), (d) PASS; (b) SPLIT at the gate
(2026-08-23 PM close): its destructive-workaround half — "without deleting
the app" — is DISCHARGED (Cancel → Connect recovers; the brick is dead);
its "Try Again reaches a fresh connect" half is NOT MET (F1: the button is
dead after a mid-session BT-off). No compound clause absorbs a failing
half into a passing one; (e)
carried by the shipped suites plus finding F2's counterexample. W5
off-direction ✓ (on-direction is F1); W6 ✓ with F2; W7 dissolved (PM5 Menu
mid-workout TERMINATES — state 11 on the wire — no quiet period exists, no
disarm needed); W8 unobserved (longest armed idle ~90 s, low priority); W9
guard ran clean every attempt (cross-app scenario untestable); 9a partial
(web cadence measured — median 990 ms, worst 1260 ms, corpus-worst 810.3 ms
does NOT bound it; watchdog margin ~2.0× today, no false fire; native
per-frame distribution still unmeasured); §2b flash not observed. **The
walk's three findings, filed as LL follow-ups:**

- **F1 (medium) — Try again never revives after a MID-SESSION BT-off.
  ROOT CAUSE CORRECTED at the cohort-unlock spec's own review (2026-08-23):
  the filed "the failure disposal tears down the per-session
  `onEnabledChanged` listener, so the enabled-true event has no ear" is
  FALSE — `canRetry` never reads enabled state, so a torn-down listener was
  never in the causal chain.** True mechanism (three compounding defects,
  all fixed by the cohort-unlock PR): `canRetry` was `phase === "failed"`
  only, so the disconnected-no-run branch rendered Try again disabled by
  construction; the disconnected event handler never disposed the driver,
  so even an enabled button's `connect()` silently no-op'd against a
  `driverRef` still holding the dead driver; and once both of those were
  fixed, the retry connected but never re-programmed, because
  `programmedForDeviceRef` only resets when `deviceName` goes `null` and
  the disconnected disposal deliberately preserves it (the LOST header
  needs it) — caught by a fake-driven walk test before merge. See the
  ticked item above for the fix. Cancel → Connect works and was the only
  live escape hatch before this PR.
- **F2 (SERIOUS, TRIAD-weight — it closes records) — the continuity guard
  convicts on a NON-MONOTONIC key. ROOT CAUSE CORRECTED at the close gate
  (2026-08-23): the filed "iOS resume produced a transient zeroed-TWD
  frame" is FALSE and the walk's own files disprove it.** The day's TWD
  readings: keystone (web) 0 across an entire 248.5 m interval then 250
  after the boundary; ring-3 0 at 94.6 m and 0 at 33.1 m (with its own
  `divergence` entry); ring-2 0 at 83.3 m post-resume — **five zeros
  against ring-2's single 81 at 56.1 s. Zero is the field's normal
  behaviour that day; the 81 is the outlier, and nothing here is
  iOS-specific** (the web capture shows the same zeros). The convicting
  frame had elapsed AND distance advancing while TWD went 81 → 0 — a real
  monitor reset zeroes all three. A successor spec that inherits the "iOS
  was outside the corpus" wording will special-case iOS and leave the web
  path broken. Fix is SPLIT: F2a (defuse via corroboration, Phase RC
  before RC-1) and F2b (re-key, inside RC-1/RC-8).
  `ring-phone-2-background-continuity-kill.json` is the capture.
  **F2a defuse SHIPPED (PR #174); F2b SHIPPED (PR 3, storage-spine spec
  §4, inside RC-1's ROADMAP row but not RC-1's own PR #182's diff) — the
  blind window closes on multi-interval programs past interval 1.
  Residual, honestly stated: interval 1 of every program and every
  1-interval program remain F2a-only (the count reads 0 there on any
  program, inert by construction); the count bound's true-positive
  evidence is SYNTHETIC-ONLY — no committed capture contains an
  interruption episode to convict on.**
- **F3 (small UI) — RESOLVED in the cohort-unlock PR (2026-08-23):**
  the log detail now renders `LINK LOST · the app lost the monitor
  before the end` for `endedBy: "link-lost"` sessions (FromTheLog.tsx;
  the GET had carried the field since #160). The v0.20.0 notes clause
  remains owed at the tag (the owed-clauses item tracks it).
- **F4 (tiny, deferred — evidence-capture gap only, not a merge blocker) —
  the `disconnected` event handler records no liveness-snapshot where
  `fail()` does.** Filed at the cohort-unlock PR's final review
  (2026-08-23): `fail()` writes one to the ring because Phase LL exit
  criterion 7 is about FAILURE; a raw link drop correctly writes no
  `ConnectedError` and so takes no snapshot either — but that means a
  disconnected-branch retry's own ring has one fewer data point than a
  failed-branch one for a future walk to read. No known stale-attachment
  risk today (the review traced `livenessRef`'s only consumer, `fail()`,
  and it is unreachable from the disconnected-no-run path). Worth a
  snapshot call for the next hardware walk's diagnosability, not urgent.

**Exit — written so it can go red.** Clause (e) added 2026-08-20 at the PM
gate's finding that four of this phase's items had no exit clause; the
trace-truth spec carries its own nine criteria and (e) is the phase-level
hook to them. On a real PM5 and a real phone, on a Release build: (a) a link killed BEFORE stroke one, and again MID-PIECE,
moves the surface off `READY`/live numbers within a stated bound and says
the link is lost; (b) Try Again reaches a fresh connect and programs
successfully **without deleting the app**; (c) the full diagnostics ring
for the episode is retrievable from the phone, from the failure screen
itself; (d) if the delete-to-fix residue turns out to be iOS-side and
unfixable, DEVIATIONS carries the row saying so and the recovery path is
documented and non-destructive; **(e)** a trace recorded across a gap that
spans an interval boundary is short by zero, rests are visibly marked as
rests, and the chart carries a time axis that reconciles with the
session's own TIME hero in the same frame.

**Sequencing (PM gate):** LT close → **LL** → CL2 → LQ → PROD. LL
displaces CL2, which is two items whose gap has a stated workaround (the
`xN` grammar already parses via import, `bulk.ts:268`). **LL is a PROD
precondition** — PROD's exit, an empty-phone install reaching a logged row
unaided, is unreachable while a link drop bricks the app.

**Release posture (PM gate, 2026-08-20):** v0.14.0 carries this defect but
does not own it — `git diff --stat v0.13.0 v0.14.0 --
app/src/monitor/transports/ app/src/adapters/` is empty and the native BLE
arm is unchanged since v0.10.0, so a rollback ships the same bug minus
five notes clauses. Not pulled. **But the delete-and-reinstall workaround
is DESTRUCTIVE** — it wipes `ergomatic.monitorRun`, `ergomatic.sessionRun`
and `ergomatic.sessionDraft`, costing an unlogged session and any
in-progress draft. **The original hold ("until criterion (b) exists") is
DISCHARGED (close gate, 2026-08-23): the destructive workaround is dead —
Cancel → Connect recovers without deletion. The cohort stays at ONE TESTER
on a NEW condition with its own discharge test: F2a is merged (PR #174,
the continuity guard no longer convicts on a single uncorroborated TWD
reading — a tester must not silently lose a measured row), AND either F1
is fixed or the tester note carries "if Try again does nothing, tap
Cancel then Connect". **F1 fixed (this PR, cohort-unlock, 2026-08-23) —
the second arm's disjunction resolves to the fixed branch; the cohort
note's fallback wording is no longer needed.**

## Phase RC — The row Concept2 would recognise

**Status:** OPEN, mid-phase (updated 2026-08-24, exit-7 walk PASSED).
The storage-spine spec (`2026-08-23-storage-spine-design.md`) is FULLY
EXECUTED — PR 1 (#180), PR 2 (#182, RC-1 storage), PR 3 (#183, F2b
count bound) — **and hardware-verified: the exit-7 walk on production
build 738 matched the PM5's memory screen digit for digit
(work-only 124s/500m, final interval :56.1/250/1:52.2, TWD 742;
record: `docs/monitor/sessions/walk-2026-08-24/`). The display gate
is UNLOCKED.** **CORRECTED (RC-9, this PR): "TWD 742" reverses which
system owns which name — Total Work Distance is OUR OWN wire-field
name for 0x0031, never a label the PM5's memory screen itself prints;
the 742 the walk actually matched is the hand-summed 500+147+95 across
three separate screen ROWS (the same figure `walk-2026-08-24/README.md`'s
own DISTANCE-hero row is now marked CORRECTED IN PLACE for — a mirror
between our accumulator and our own TWD decode, both the identical
work-plus-rest-coast odometer, RC-9c retiring the verdict that ever
compared them for exactly that reason). RC-9 (this PR) corrects that
account of TWD (`pm5-interface-notes.md` item 25) and wires two
genuinely independent oracles the exit-7 walk never had: 0x0032's own
cumulative average pace and 0x003A's own Total Rest Distance — see
RC-9's own row below (search the ring for `avg-pace-verdict` and
`rest-distance-verdict`) for what a walk should now read.** The same
walk's lab leg settled the terminate question:
a Menu-kill emits the full log-commit burst, hash included
(`pm5-interface-notes.md` §25) — the terminated path can carry the
same observation capture, in the RC-2/RC-3 wave's scope. The phase's
live frontier (updated at #191's PM gate): series-truth LANDED — the
stored series stops losing intervals on distance-with-rest pieces
(single-deriver attribution, state-9 mirror, loud backward-bucket
alarm; prospective only), shipped BEFORE the summary-record wave's
PR 2 by James's sequencing call. CORRECTION to the exit-7 claim below:
the walk verified the ACCUMULATOR against the monitor digit for digit;
it did NOT verify the stored series, which that same session saved
missing 56.1s of its faster interval (found by James reading the
graph, fixed by series-truth). The summary-record wave's PR 1 LANDED
earlier — RC-2 (diagnostic decode) and RC-3's storage half shipped,
terminate capture live through the four gates. **PR 2, the MACHINE
CONFIRMED · WORK ONLY display block, has now also landed (summary-
display wave, this PR)** — the axis-collision input is RESOLVED BY
LABELLING (James's ruling, 2026-08-25: the block reads `MACHINE
CONFIRMED · WORK ONLY` with a caption naming the split, rather than
redesigning the chart's axes), and the connected screen's meters
counter reverts to its 1m realtime granularity (James's reversal of
the CM calm rule). The summary-record wave (RC-2 + RC-3 + display, PR 2
= #192, made explicit here rather than the earlier self-referential
"this PR") **RELEASED as v0.22.0 (build 747, shipped the morning of
2026-08-25)** — no longer "pending its own release." The v0.21.0 notes
debt is paid (v0.21.0 shipped as build 738). **RC-5 (hero-truth) has
since SHIPPED on top of that release** — the three stored heroes stop
contradicting each other (two tiers, the machine's own numbers where it
spoke; the wall-clock total gets its own line beneath) — see RC-5's own
row below for the full record; not folded into this paragraph's earlier
prose since it is a separate spec/PR, but named here so Phase RC's
status paragraph doesn't go silent on its own most recent work. Earlier:
#167 (instrument + RC-4/RC-6), #174 (F2a), #177 (cohort unlock); the
combined walk answered every wire question YES (record:
`docs/monitor/sessions/walk-2026-08-23/`). Originally opened 2026-08-22
(James: evidence-first); named, scoped and
evidenced by the ecosystem review of 2026-08-21
(`docs/monitor/pm5-ble-ecosystem-review.md`).

**Asset on hand (James, 2026-08-22): a Concept2 Logbook DEVELOPMENT API
key already exists in the repo-root `.env`, currently unused.** Presence
verified (one matching line; the value itself deliberately never read or
recorded anywhere). When this phase opens, the logbook half of its oracle
work does not start from a registration queue — it starts from a key we
already hold. `.env` is untracked, so the key must ALSO never appear in
any committed file, fixture, or capture; the spec should name where it is
allowed to live (real env only, same stance as `DATABASE_URL`).

**What and why, in plain words.** We have never checked our rows against
anything outside our own app. On 2026-08-21 a fourteen-agent adversarial
review checked them against Concept2's published logbook schema, and the
answer is that **our rows would not reconcile today, for two reasons that
no accuracy work touches.** We store the wrong quantities, and we hang up
before the machine tells us which row we just rowed. Both are fixable.
The prize for fixing them is not a logbook feature: it is that Concept2's
own server becomes the external oracle this project has never had.

**The bar, and its three branches** (settled from Concept2's published
API, PRIMARY):

- **Numeric agreement** — our row matches the monitor's own log entry
  field for field. **REACHABLE.** Needs RC-1 below plus Phase LL's link
  work. Needs nothing from Concept2.
- **`verification_code`** — the PM5 computes a 16-digit hash over date,
  distance and duration and publishes it on 0x003F. C2 accepts the code
  only if date, time, distance, workout_type and machine type all match
  what the code was computed over. **REACHABLE IN PRINCIPLE**, gated
  behind three unknowns (firmware band, fire timing, byte order) and
  behind Phase LL's A-2. **This is the whole point of the phase:** a code
  that fails closed is a permanent regression detector on every number we
  compute, with no erg and no two-screen photograph.
- **`verified: true`** — **CLOSED.** Concept2's own words: "Only trusted
  clients are able to verify workouts. Please contact Concept2." No
  amount of accuracy buys it. Stop asking.

**James is obtaining a Concept2 developer key** (2026-08-21). That
settles the review's first open decision and puts the sandbox in scope:
`log-dev.concept2.com` is a real sandbox, and
`GET /results/{id}/export/{csv|fit|tcx}` hands back Concept2's own
canonical file for a row. It is the only external oracle this project has
that needs no erg, and it can run in a test.

### The two blockers, measured

- **We store the wrong QUANTITIES.** C2's `distance` and `time` are
  work-only, with rest in its own fields; ours are work + rest + warm-up.
  Measured deltas against work-only truth: **+64 m / +90 s**
  (session-2-wu-4unequal), **+47 m / +120 s** (pyramid). C2 dedups on
  (user, date, time, distance), so that is two rows, always.
  **The killer detail is that our own oracle cannot see it:** Total Work
  Distance is work + rest too, decoded to the metre on two captures
  (1535 + 64 = 1599; 1300 + 47 = 1347). PR #123's celebrated sub-metre
  three-way agreement proves our accumulator matches the machine on a
  quantity Concept2 does not store. **An oracle that shares your
  definition is a mirror.**
- **We never get the row's identity, because we hang up first.** Measured
  from the terminal 0x0031 to our own recorded disconnect, all four
  natural finishes: **21.7, 24.1, 30.6 and 107.3 ms.** And the census
  that reframes it: **0x0039 and 0x003A are in the subscribe list of
  every one of the six committed wire recordings and have delivered ZERO
  notifications, ever, across five natural finishes.**
  WORKOUTSTATE_WORKOUTLOGGED has never appeared either; every recording's
  maximum state is 10. One hypothesis explains all three — the PM5 emits
  its end-of-workout characteristics when it commits the log entry, and
  we hang up microseconds too early, by construction, every time. The
  entire summary-fallback subsystem (`noteSummary`, `graceIsOpen`,
  `armSummaryReconcile`, `deriveFinalIntervalFromSummary` and its two
  agonised-over premises) is **dead code at the erg.**

### The work

- [x] **F2a — DEFUSE the continuity guard's single-reading conviction
      (from Phase LL's exit walk, 2026-08-23). TRIAD (changes when records
      close), full cycle, spec first, LANDS ALONE, sequenced BEFORE
      RC-1.** The guard convicts on one backward TWD reading even when the
      SAME frame's elapsed and distance are advancing; a real monitor
      reset zeroes all three. Require corroboration before closing a
      record. This is a BOUND, not a key — and F2b (SHIPPED, #183) is a SECOND bound, not a re-key: the §2b
      silent-under-count trade stays LIVE on distance-goal programs
      (suppressed), interval 1, and 1-interval programs. What would
      settle the suppression lift: a committed capture of a
      non-distance-goal armed program (the whole corpus is
      distance-goal under the production predicate — 0/0 vacuous), or a
      real interruption recording (true-positive evidence is
      synthetic-only). **The vacuum's denominator (the #183 PM gate):
      198 of the seeded library's 300 workouts contain NO distance step
      — the bound ships LIVE on ~66% of the library with zero swept
      pairs under the governing predicate. The corpus (6 captures, all
      distance-armed) is unrepresentative of the library; the 0/0 is an
      evidence gap on the live path, not inertness.** The v0.20.0 notes clause ("until a deeper fix
      lands") owes an update at the next tag: the deeper fix narrowed
      the window, it did not close it. Evidence: the six-row TWD table in the LL walk card's
      corrected F2 and `walk-2026-08-23/ring-phone-2-background-continuity-kill.json`.
      **Shipped, see `continuity.ts` + spec 2026-08-23-continuity-corroboration.**
- [x] **RC-1 — Store WORK and REST separately, per interval and per
      session.** TRIAD (stored shape + a number's meaning). Nothing else
      moves reconciliation. Add `restSeconds` and `type` to
      `IntervalActual` from 0x0037 offsets 12-13 and 16 (they sit beside
      `restDistanceMeters`, already carried from offset 14); store work
      and rest as separate columns; keep the fused number as a DISPLAY
      sum. **Two caveats the spec must carry:** (a) whether 0x0037's rest
      time is a MEASUREMENT or a readback of the rest we programmed is
      NOT established — every committed value equals the programmed rest
      exactly — so do not sell it as the machine's measured rest; (b)
      0x0037 arrives at the END of an interval's trailing rest (session-2
      num=2 at t=142906 with the next interval's clock already at 0.03),
      so a session ended during a rest loses the just-finished interval
      entirely. That is a bigger undercount than anything RC-1 fixes and
      belongs in the same spec. **Also carries the program-time warm-up
      question** (see "The warm-up question" below): whether a warm-up is
      compiled into the same PM5 piece as the working intervals is a
      compiler change, it decides what a rower's Concept2 totals read, and
      RC-1's spec is where it lands. **And carries F2b (Phase LL walk,
      2026-08-23): re-key the continuity guard off TWD entirely** — the
      walk proved TWD non-monotonic and inconsistent on time intervals
      (five zeros against one 81 in one day; the LL walk card's corrected
      F2 has the table). The spec inherits the CORRECTED root cause,
      never the filed "iOS was outside the corpus" wording. **Owed risk
      from F2a's own trade (final-review MEDIUM-1, 2026-08-23): a record
      F2a now MERGES instead of closing can SILENTLY UNDER-COUNT, not
      read as visibly wrong — `driver.ts`'s per-interval session register
      max-merges post-reset metres against the pre-reset value (300 m
      rowed + a reset + 200 m more stores ≈300 m, not 500 m) — so RC-1's
      re-key spec must not assume a merged record announces itself.**
      **SHIPPED (PR2 Task 3, storage-spine spec §3):** `MonitorRun` gains
      `workSeconds`/`workMeters`/`restSeconds`/`restMeters`, computed once
      by `completeMonitorRun`'s own `endedBy === "finished"` branch (and
      re-summed by `recordActual`'s late finish-grace branch when the
      final actual arrives after close) — never for a terminate/link-lost/
      program-failed close, matching caveat (b) above exactly: those
      closes' actuals are incomplete by construction, so no attempt is
      made rather than an under-count. The rest pair is all-or-nothing
      (one actual missing rest data omits `restSeconds`/`restMeters` from
      the WHOLE record, never a partial sum). Server: four nullable
      columns beside the fused hero columns
      (`session_logs.work_seconds`/`work_meters`/`rest_seconds`/
      `rest_meters`, migration 0015), additive — **the SECONDS pair is
      `double precision`** (0x0037's elapsed decodes in TENTHS; the first
      cut's integer columns 400'd real saves — the final review's
      blocker), the meters pair integer (whole-metre wire fields);
      POST-validated non-negative-FINITE-or-null for seconds,
      non-negative-integer-or-null for meters. **NO BACKFILL: every `session_logs`
      row and every `MonitorRun` written before this PR keeps its
      fused-only quantities forever — these four fields are simply absent
      on it, and no migration or reader ever tries to derive them after
      the fact.** The display sum is UNCHANGED and does not read these
      fields (pinned by construction: `summaryModel.test.ts`'s own test
      swaps in wildly wrong values on all four and asserts the rendered
      heroes don't move) — RC-5 is NOT closed by this (see its own row
      below). The re-key (F2b) is PR 3's own task, out of this PR's scope.
      **F2b — SHIPPED, but in PR 3, not this PR's own diff**
      (storage-spine spec §4, 2026-08-24): the guard gains 0x0033's raw
      Interval Count as an ADDITIONAL bound —
      `after.intervalCount < before.intervalCount` ⇒ `"reset"`, alongside
      F2a's unchanged three-axis signature — closing exactly the blind
      window F2a traded away (a mid-gap TWD reset with per-interval clocks
      still reading forward), never WEAKER at catching a reset, and byte-identical to F2a wherever
      the count is absent (interval 1, 1-interval programs, pre-first-0x0033). **Suppression
      decided with both eyes open, sweep numbers on record:** the count
      bound runs under the SAME distance-goal suppression F2a already
      uses, not lifted. Both `distanceGoal` predicates were swept
      (`continuity.test.ts` PART 5, a 30 s-gap slide over the 6-file
      corpus): the WIRE predicate (per-sample
      `workoutDurationType === 128`) came back clean — 0 backward count
      readings across 1,026 non-suppressed pairs; the PRODUCTION predicate
      actually in force (`programHasDistanceGoal(run.program)`, the armed
      program) also came back clean but **VACUOUS** — 0 backward readings
      across **0** non-suppressed pairs, because every one of the six
      committed corpus files armed a program containing a distance
      interval, so the predicate suppressed the whole corpus before a
      single pair was tested. A 0-pair "clean" is an absence of evidence,
      not evidence of safety (repo rule 11) — **KEPT under suppression,
      not lifted.** **Honest capability statement:** the count reads 0
      through the whole first interval and on every 1-interval program
      (0-based, forward-attributed — pm5-interface-notes.md §15 #1's
      correction), so the bound is inert there — 78.3% of 30 s-gap corpus
      pairs see no count change at all; where it IS live (multi-interval,
      past interval 1) it closes F2a's blind window exactly. True-positive
      conviction power is SYNTHETIC-ONLY: no committed recording contains
      an interruption episode, so the bound's own convicting test runs on
      a constructed multi-interval fixture, not a captured one. New wire
      fact backing the bound: 0x0033's Interval Count changes at REST
      ONSET, independently corroborating the end-during-rest bound above
      (pm5-interface-notes.md §20 item 26).
      The warm-up program-time question named above never reached this
      spec at all — Phase WU (shipped 2026-08-22, PR #150) removed
      warm-up as a compiler concept before RC-1 started, exactly the
      sequencing rationale below (WU precedes RC-1) predicted.
- [ ] **PR 1's own residual capture-rate gap (final whole-branch review,
      2026-08-23, RF14): the burst is not caught 100% of the time even
      after HIGH-1/HIGH-2 shipped.** PR 1 (`rc-spine`, walk-2026-08-23
      keystone) fixed the two defects the review found on the LATE side —
      a split claiming the finish grace no longer shuts the door on the
      0x0039 that follows it (HIGH-1), and the drain no longer fires
      blind on 0x0039 alone, 38ms before 0x003F would have arrived
      (HIGH-2, `HASH_SUBWINDOW_MS`). **One gap survives both fixes,
      already bounded and documented in code (`driver.ts`'s own
      "TWO LOSS MODES" comment, `noteSummary`) but never stated where a
      reader tracking the real capture rate would see it:** the EARLY
      side's own admission check (`currentIndex === lastIndex`, sourced
      from 0x0033's `intervalCount`) cannot buffer a 0x0039 that beats
      this run's very first 0x0033 sample (`toProgramIndex` returns
      `null`, nothing to compare), or one landing while `intervalCount`
      still names a PRIOR interval (0x0033's own sample gap swallowing
      the burst's ~142-449ms window whole, per §1). Both funnel to
      `out-of-window`, silently. **#183 (spine PR 3) delivered the raw material — an unclamped
      frame-level `rawIntervalCount` — but the admission check still
      runs on `toProgramIndex` and does NOT consume it (the #183 PM
      gate's audit): the capture-rate gap stands. Successor owner: the
      RC-2/RC-3 wave's spec, which touches the same admission path and
      inherits this sentence.**
- [x] **~~NO DISPLAY of `summaryTotals`/`verificationBytes` before exit
      7's photograph~~ — GATE SATISFIED 2026-08-24: the walk's
      production-build captures (PM5 View Detail photo + build 738's own
      stored record + the linger-end second stash) matched digit for
      digit; record `docs/monitor/sessions/walk-2026-08-24/`. Display of
      both fields is now permitted (PM gate on #180, condition 4,
      discharged).** Small riders for the RC-2/RC-3 PR wave still owed
      (deferred minors from
      #180's reviews): pin the totals-first-bytes-second write-once
      sequence; give `FakeBurst`'s single `pendingBurst` slot a loud
      overwrite (scripting foot-gun); FakeBurst carries two offsets by
      spec notation, the plan prose said three.
- [x] **~~The log chart draws the first rest as a bare gap (James,
      2026-08-24: "the graph is weird")~~ — FIXED, root cause was
      WIRE-ATTRIBUTION, not render (series-truth spec, this PR).** The
      "rides the next PR touching the log surface" line above was
      correct about the fix landing later but wrong about WHERE the
      defect lived: desk diagnosis found the series recorder latching
      onto a lying `frame.intervalIndex` at the distance-with-rest
      boundary (PM5 state 9) and silently dropping every sample after —
      the second interval and its trailing rest never reached the stored
      series at all, which is what read as a "bare gap". Fixed by
      driving the recorder off `attributedIntervalIndex`, the key the
      driver's own register logic already resolved (spec §B′) — no
      chart/axis code changed.
- [x] **Series-truth: the series stops lying on distance intervals with
      rests (spec `2026-08-25-series-truth-design.md`, this PR).**
      SHIPPED, PROSPECTIVE ONLY — the fix stops new rows from losing
      data; it does not repair rows already saved. James's ruling
      (2026-08-25): the band DISPLACEMENT on an already-saved row is
      arithmetically repairable (the inflation equals the finishing
      interval's own stored `actualSeconds`), but the MISSING SAMPLES
      are not (inventing them from interval averages was refused) —
      repair declined, population is roughly one row.
- [ ] **A lab capture of a real 2×Nm rNN piece (distance work, rest
      between) is still owed** — the series-truth regression fixture
      (spec §E) is SYNTHETIC, built from the production ring's own
      numbers, not from a replayable capture; no committed recording
      exercises this shape. Walk item: row a 2x-distance-with-rest
      piece, save the capture alongside the exit-7 session, and add it
      to the replay corpus.
- [ ] **The axis-quantity question, queued (series-truth spec §D).**
      `traceModel.ts`'s `t`/`d` axes are each the sum of per-interval
      final readings and are CONDITIONAL ON ROWER BEHAVIOUR during
      rests (frozen contributes nothing, advancing contributes all of
      itself) — never work-only, despite reading like a work clock.
      Whether the chart should instead show a TRUE work-only clock is
      an open product question, deliberately out of this PR: changing
      what an axis MEANS is its own number-meaning decision.
      **NOT DEFERRABLE PAST PR 2's DESIGN (#191's PM gate, the named
      collision):** the summary-record wave's PR 2 will render the
      machine's WORK-ONLY total with a MACHINE CONFIRMED badge on the
      SAME screens where this chart draws (`PostWorkoutSummary`/
      `FromTheLog`) — on the exit-7 piece that is a badge confirming
      500m beside a d-axis running to 742.7m, 48% apart in one frame,
      on the screen whose selling point is machine agreement. Resolve
      before PR 2's design, not at its gate.
      **The collision is RESOLVED BY LABELLING (James's ruling,
      2026-08-25) — the not-deferrable constraint above is discharged,
      not the broader question below it.** PR 2 ships the badge as
      `MACHINE CONFIRMED · WORK ONLY` with a caption naming the split
      ("Rest metres excluded. Everything else on this screen includes
      rest." — corrected at the PM gate fix wave, 2026-08-25: the
      caption first shipped naming only the heroes ABOVE the block,
      when the trace chart BELOW it is included too) rather
      than redesigning the chart's axes — the 500m/742.7m pair now
      reads as two different, both-honestly-labelled quantities on the
      same screen, not one number contradicting another. The underlying
      axis-quantity design question this bullet opened with (should
      `traceModel.ts`'s `t`/`d` ever become a true work-only clock) is
      untouched and stays open below. **RC-5 (hero-truth, 2026-08-25)
      makes this MORE visible, not less: now that the three heroes above
      the chart are work-only on every row, the chart's own rest-inclusive
      axes are the LAST rest-inclusive quantity left on the screen — the
      rower's own words, "if I stare at that chart for ten seconds I'll
      be back to 'does this app know what happened or not,'" are sharper
      once nothing else on the screen still disagrees with them.**
- [ ] **Flaky test on file: `App.test.tsx`/`RetestShortcut.tsx` unhandled
      async error, seen 2-of-5 full-suite runs (series-truth branch,
      2026-08-25), never touching that diff's files.** Pre-existing;
      will bite CI on future PRs until diagnosed. Capture the failure,
      don't re-run to green (the standing flake rule).
- [ ] **C' rider for the RC-2/RC-3 wave: the continuity-reset close
      skips the backward-bucket ring entry** (`useMonitorSession.ts`
      ~1809 stops the recorder without reading the count) — the one
      close where the diagnostic dies silently; final review minor 2.
- [ ] **Phase RC CLOSE-OUT: a derivation audit (James, 2026-08-25).**
      Before the phase closes, enumerate every CONSUMER-SIDE derivation
      of a wire fact the driver already resolves (interval membership,
      rest state, boundaries, totals — sweep every consumer of
      `MonitorFrame` and the parsed status), classify each
      consume-the-authority vs. invented-heuristic, and queue fixes for
      the heuristics. Motivated by the series-truth defect being the
      THIRD of its class in this repo: the recorder's own key
      derivation (this PR), Phase LL's boundary fold (below), and the
      CM-era boundary heuristic.
- [x] **Put the realtime meters count back (James, 2026-08-24: "i want
      to put that back to a realtime count").** SHIPPED (summary-display
      wave, PR 2, this PR): the connected screen's total-meters counted
      by 5s and read less responsive since the CM quantisation (#123
      rounded the counter to TWD's 5m grid). REVERSES that CM ruling
      knowingly — `PaneLive.tsx`'s `fmtMeters` now `Math.round(meters)`,
      1m granularity restored, Intl formatting and rounding (not
      flooring — #123's own falsification stands) kept; TWD
      corroboration stays internal, nothing rendered from it. The
      comment at the call site names the reversal and the accepted
      repaint-rate cost (~3.7 repaints/s iOS) rather than reading like
      the CM rule was always this.
- [x] **RC-2 — Decode Log Entry Date/Time; log it beside our wall clock;
      store nothing yet.** SHIPPED (summary-record wave, PR 1,
      `docs/superpowers/specs/2026-08-24-summary-record-design.md` §2):
      `parseSummaryLogStamp` decodes date `uint16` = month | day<<4 |
      (year-2000)<<9, time `uint16` = minutes | hours<<8, and the driver
      emits one `summary-log-stamp` ring entry per burst. **The residual
      that inverts the headline stands unchanged:** the wire carries
      hours and minutes and NO SECONDS, while C2's own hardware-sourced
      example row reads `2015-08-05 13:15:41` — the stamp remains
      diagnostic-only, stored nowhere, until the C2-link tolerance
      question is settled.
- [x] **RC-3 — Carry 0x0039's nine already-decoded fields into the
      record.** TRIAD. SHIPPED (summary-record wave, PR 1, same spec §1):
      `avgStrokeRate`, `endingHeartRateBpm`, `avgHeartRateBpm`,
      `minHeartRateBpm`, `maxHeartRateBpm`, `dragFactorAverage`,
      `recoveryHeartRateBpm`, `workoutType` and `avgPaceSecondsPer500m`
      now write into `MonitorRun.summaryDetail` and, at save, into
      `session_logs.machine_summary` (migration 0016, hybrid shape) —
      six of the nine are C2 top-level columns the reconciliation table
      marked NOT CAPTURED. **Storage only when this shipped; the display
      half has now shipped too (summary-display wave, PR 2, this PR,
      spec §3 as amended): `FromTheLog.tsx` renders a MACHINE CONFIRMED
      · WORK ONLY block off `machineWorkSeconds`/`machineWorkMeters`/
      `machineSummary.verificationBytes` alone — the other six of the
      nine `machineSummary` fields stay stored-but-undisplayed this
      wave, unchanged from the note below.** The wave (RC-2 + RC-3 +
      this display PR) is functionally complete pending its own
      release. Three obligations recorded at #190's PM gate: (1) the
      old DOC-ONLY caveat on
      `avgPaceSecondsPer500m`'s /10 scale is DISCHARGED by evidence, not
      deleted silently — the keystone's 500m piece decodes pace 138.7
      against elapsed 138.7 from a DIFFERENT byte range (a scale oracle
      by identity: a 500m piece's pace-per-500m IS its elapsed time),
      corroborated by the terminate capture (24.3s/76m implies 159.9 vs
      decoded 159.8); (2) **the nine detail fields have never been
      compared to any PM5 screen** — exit-7's photograph verified only
      the two totals, and the one terminate capture's avgStrokeRate
      reads 44 where physics says 22 (§25) — the first surface that
      displays any of the nine (Phase PS inherits this) owes a
      photograph, same discipline the totals had; (3) `machine_summary`
      is stored VERBATIM (object-ness, size cap, and the
      verificationBytes band are the only server checks) — every future
      reader type-guards each field at read.
- [ ] **Owed walk item: the terminated-piece PM5 memory photograph AND
      the app-STOP-venue capture.** Zero captures exist on either arm for
      the End-button venue today — the fake covers its shape only, never
      real bytes. Two things the next natural walk still owes: (1) a
      terminate-path SCREEN oracle (`pm5-interface-notes.md` §25's
      avgStrokeRate anomaly is unresolved without it); (2) a real capture
      of the app's own END button mid-piece, on both the web and native
      arms, now that PR 1's four gates make production actually listen
      for the burst on that path.
- [ ] **Owed walk item: the pocketed-phone leg (James, 2026-08-24, tester
      report, verbatim mechanism unconfirmed).** A tester connected,
      programmed, reached "show me the numbers", pocketed/locked the
      phone, rowed the piece to completion, and unlocked to find the app
      still in the pre-row state with no record — END silently discarded
      it (the never-rowed path has no save door). For the next natural
      walk: connect, program, show-me-the-numbers, LOCK the screen, row
      ~30s, unlock; capture the ring + connection log. Questions it
      settles: does the BLE link survive screen lock on iOS, does frame
      delivery freeze with the WebView, what state the run object is in
      on resume, does the watchdog fire. Suspected mechanism (iOS
      suspends the WebView JS so frames never reach the run) is
      **INFERENCE until walked** — cross-reference Phase LL's
      correct-resume-over-background-mode ruling ("The background
      question, ANSWERED", above) and its research doc
      (`docs/superpowers/research/2026-08-20-ble-connection-management.md`)
      as the starting ground; that doc already records a 15-20s screen
      lock NOT dropping the GATT link (§21 item 7), which is why the
      product gap below is not assumed to be a link problem.
- [x] **RC-4 — Last Split Time is 0.01 s/lsb, not 0.1.** Settled by
      replay, see `parse.test.ts` (seq 1195). TRIAD, S,
      **settled without an erg.** Both C2 documents print 0.1, four
      times. Nine capture pairs say 0.01 (0x0033's u24LE@14 is the exact
      hundredths value whose truncation to tenths is 0x0037's split
      time), the PM5's own memory screen agrees (7476 → 1:14.7,
      `walk-2026-08-17/README.md:14`), ORM agrees. **Our decode is 10x
      TOO LARGE.** Dormant since CR2 spec 2a Task 6, and
      `statusFrames.ts:222` mirrors the same error, so no round trip and
      no hand-built fixture could ever have caught it. Fix
      `parse.ts:203` to /100 and `statusFrames.ts:222` to *100, retarget
      `parse.test.ts:198` and `:614`, and pin it with a REPLAY against
      committed bytes, never a round trip. Ship the semantic with it: the
      field is dimension-conditional and transiently live mid-interval,
      so it can never be a countdown checkpoint at any scale.
- [x] **RC-5 — The three stored heroes contradict each other by up to
      40 s/500 m.** TRIAD. **SHIPPED** (hero-truth spec/plan,
      2026-08-25, `docs/superpowers/specs/2026-08-25-hero-truth-design.md`,
      5 tasks): DISTANCE, TIME and AVG SPLIT are now ONE population —
      work only — on every stored row, and the wall-clock total (work
      plus rest) gets its own line beneath: `4:04 total · plus 242 m
      coasting in rest`. **Two-tier ruling (James's fork, 2026-08-25,
      "I want to match the PM5"):** "match the PM5" and "one uniform
      rule on every row" cannot both hold, because the machine disagrees
      with the sum of its own displayed rows (walk-2026-08-20: its
      interval rows sum to 901 m against its own stated total of 899 m,
      ~2m of self-disagreement from rounding each row) and truncates its
      own pace where we round (159.8 where the quotient is 159.868)
      — both antagonist findings, `docs/monitor/pm5-interface-notes.md`
      §26. So: **tier A**
      (a row carrying `machine_work_seconds`/`machine_work_meters`,
      i.e. saved since PR #190) renders the machine's OWN totals and
      its own `avgPaceSecondsPer500m` (newly stored, additive jsonb key,
      no migration) verbatim, digit-identical to its screen; **tier B**
      (everything else) computes the same three quantities from its own
      recorded actuals and never claims to be the machine's — no badge,
      no marker; the MACHINE CONFIRMED block's absence is the tell. The
      population split #190 created is accepted here, named on screen,
      and is the price of digit-identity. History-list rows use the same
      tier logic as the detail screen so the two can no longer disagree
      by 742-vs-500 for the same session (RC-5 Task 4).
      - **Original evidence, now explained rather than merely reduced:**
        session-2's 1599 m/8:08.4 (implying 2:32.7) beside AVG SPLIT
        2:08.5 (24.3 s/500 m apart), and the pyramid's 39.9 s/500 m gap,
        were the SAME defect this closes — a fused DISTANCE/TIME beside
        a work-only AVG SPLIT. Both are now work-only on saved-since-#190
        rows and named-as-fused-plus-rest-clause on the rest.
      - [ ] **TIER B2 residual — general form, accepted and pinned, not
        silent (Task 3 fix round 1; premise CORRECTED and the decline
        question RE-DECIDED at fix round 2, final whole-branch review,
        finding I1).** `buildMonitorLogSteps` never produces a stored
        step for an actual whose `index` is `null` (any legacy warm-up
        seed included), so a row's Σ `steps` under-counts that actual's
        own work whenever no other stored signal can rescue it. RC-1's
        own `workSeconds`/`workMeters` pair (preferred whenever present,
        since it sums `run.actuals` unconditionally and never goes
        through `steps`) closes the gap for every row saved
        **2026-08-24 onward AND closed via `endedBy: "finished"`** —
        NOT, as fix round 1 wrongly claimed, every row saved from that
        date. `computeWorkRestSums`/`appendSummaryObservations` (the
        work-pair/machine-totals writers) fire ONLY for
        `"finished"`/`"rower"` closes, so a link-lost/program-failed/
        interrupted/burst-less-terminate monitor row can NEVER carry
        either pair — an ONGOING population, growing with every future
        interrupted or lost-link session, not a closed window. Fix round
        2's `isReconstructableClose(row.endedBy)` gate now DECLINES tier
        B2 (falls to FALLBACK, the stored possibly-fused columns
        unchanged) for that ongoing population, and trusts Σ steps only
        where `endedBy` PROVES the row historical (`"finished"`, `null`,
        or `undefined`) — a genuinely closed, non-growing
        **2026-08-08 (the `actualMeters` amendment) through 2026-08-24
        (RC-1 ships)** window, with no backfill path (`monitorRun.ts`'s
        own "NO BACKFILL" doc comment on the sibling field). One
        concrete manifestation, cheaply noted rather than separately
        fixed (Task 3 fix round 2, M1): a LEGACY warm-up row read back
        through this SAFE branch prints a SMALLER distance plus a
        warm-up-attributed rest clause, while the LIVE door
        (`summaryModel.ts`'s `isLegacyWarmupRun`) kept that same row's
        heroes fused with no total line at all — the live and stored
        screens disagree for this one shape, accepted rather than
        reconciled (reconciling would need the stored `steps` array to
        record "an interval existed but produced no step," which it
        does not). Pinned by dedicated `storedSummary.test.ts` cases
        (both the SAFE-endedBy residual and the DECLINED-endedBy cases).
      - [ ] **List-vs-detail bounded disagreement, same corrected
        window (premise corrected at fix round 2, same finding I1).**
        The history list's projection excludes `steps` entirely (size),
        so it cannot reach TIER B2 at all — a row in the genuinely
        closed 2026-08-08..2026-08-24 window (endedBy-provable
        historical, per the item above) that the detail screen computes
        from Σ steps falls, on the LIST only, to the FALLBACK branch
        (the row's old stored fused columns) instead. For every OTHER
        no-machine-totals/no-work-pair row (link-lost/program-failed/
        interrupted/burst-less-terminate, any date) the detail screen
        NOW ALSO declines to FALLBACK (fix round 2), so the two screens
        AGREE there — a wider agreement than fix round 1 believed it had
        secured. Stated in code (`LogRow.tsx`'s own corrected tier
        comment), pinned by dedicated `HistoryList.test.tsx` cases: one
        asserting the two screens' numbers are VISIBLY different for a
        `"finished"`-closed session in the closed window (742 m/2:18.8
        on the list vs 500 m/2:04.0 on the detail), one asserting they
        AGREE for a `"link-lost"`-closed session (both 742 m/2:18.8).
        **One more consequence, named for completeness (fix round 3,
        re-review):** a DECLINED row's own interval ROWS still sum to
        their work-only total (e.g. 250+250=500 m) while its HERO shows
        the old fused value (742 m) with no rest clause on the total
        line to explain the 242 m gap — the same in-frame contradiction
        RC-5 exists to kill, reintroduced deliberately for this one
        population as the accepted pre-RC-5 status quo ("unimproved but
        never silently wrong," per the FALLBACK branch's own comment).
      - [ ] **Build-738-era rows render NO AVG SPLIT hero at all —
        tester-visible, release-note clause owed. POPULATION CORRECTED
        (Task 3 fix round 4, PM gate finding 4 — verified via
        `git log`/`git tag --contains` before writing, per the gate's own
        instruction).** The original claim ("rows saved during v0.21.0's
        TestFlight window") is FALSE: `machine_work_seconds`/
        `machine_work_meters` first exist as of PR #190
        (`3cb393d`), and `git tag --contains 3cb393d` returns v0.22.0
        ONLY — so no build-738 (v0.21.0) row was EVER tier A; that build
        couldn't post the columns that make a row tier A at all. **The
        one real path (`LogSession.tsx`'s own comment on the guard, and
        `git show v0.21.0:app/src/monitor/monitorRun.ts`, confirms
        `appendSummaryObservations` already captured `summaryTotals`
        client-side under build 738 — #190 is what made it SURVIVE THE
        SAVE server-side, not what started capturing it): a run completed
        under build 738, left UNSAVED (sitting in local storage) across
        the app's update to a build carrying #190 (`machine_work_seconds`/
        `machine_work_meters` posting) but not yet this PR's
        `avgPaceSecondsPer500m` storage, then finally saved.** That old
        `MonitorRun` object carries `summaryTotals` (738 wrote it) but no
        `summaryDetail` at all (738's `MonitorRun` type never had the
        field) — so the save posts real machine totals (tier A) with an
        honestly bytes-only-or-absent `machine_summary`, and AVG SPLIT is
        simply absent, never a stale or wrong number
        (`machineSummary.integration.test.ts`'s own "build-738-era
        record's honest shape" case pins the same shape server-side). Real,
        bounded population (an unsaved-run-across-an-update shape, not a
        release-window one); no backfill. **Same cause, folded in rather
        than left as a separate population (PM gate finding 4):** this is
        also why `postTestOffer` silently declines the baseline offer for
        exactly these rows — see the `postTestOffer.ts`/`testHistory.ts`
        minor below, which shares this bullet's population and cause, not
        a second one. The next release note should say a small number of
        recent sessions may show two heroes instead of three, permanently
        (and may have missed a baseline offer they'd otherwise have
        earned), and that this is intended, not a bug.
      - [ ] **TWO shipped release notes now tell instructions RC-5
        falsifies — both owed a correction in RC-5's own SUCCESSOR notes
        entry, neither edited in place (Task 3 fix round 2 finding I3;
        v0.22.0's own note added at fix round 4, PM gate finding 5).**
        Shipped notes are history and stay as written; RC-5's own release
        note — **NOT v0.22.0, which already shipped this morning
        (2026-08-25) WITHOUT RC-5, per fix round 4's own correction above
        — the next tag after it** — must say explicitly that both
        instructions below no longer apply and name what changed.
        - `src/news/content/releaseNotes.ts:270` (v0.11.0, still rendered
          to any tester who opens that entry) reads: "DISTANCE counts
          everything the flywheel counted, warm-up and rest meters
          included, so it should match the monitor exactly. Check them
          side by side." RC-5 makes DISTANCE work-only on saved-since-#190
          rows — the instruction to check against the monitor's OWN total
          is now reliably wrong (the monitor's Totals row is ALSO
          work-only per this same phase's own antagonist finding, so
          checking against it would actually still agree — but checking
          against the monitor's fused/TWD reading, which is what a rower
          untrained by this phase would reach for, would not).
        - `src/news/content/releaseNotes.ts:22` (v0.22.0, shipped this
          morning, describing the MACHINE CONFIRMED · WORK ONLY block)
          reads: "Work only means rest metres are excluded; everything
          else on that screen includes rest, so the numbers are meant to
          differ." **RC-5 falsifies BOTH halves**: the heroes above the
          block are now ALSO work-only (no longer "everything else…
          includes rest"), so the block and the heroes now AGREE — the
          numbers are no longer "meant to differ." Same shipped-note
          rule: not edited, corrected in the successor note.
      - [ ] **The live CONNECTED screen's TOTAL METERS is still fused —
        two unlabelled populations on consecutive screens (Task 3 fix
        round 2, finding I4; NOT code in this PR, its own item).**
        `surfaceModel.ts:479-492`'s `sessionDistanceMeters` is "work +
        rest by construction" (the field's own doc comment) — the rower
        watches this number climb live (e.g. 1599 m) through the whole
        session, then lands on the post-workout summary / stored detail
        screen this phase just made work-only (e.g. 1535 m for the SAME
        session). Neither screen labels which population it shows. RC-5
        fixed the SAVED record's own internal contradiction (three
        heroes, one population); it did not touch the LIVE screen's own
        number, which now contradicts the record it is about to become.
        Deserves its own design pass (does the live total go work-only
        too, or get a "+ rest" clause of its own, matching the pattern
        this phase just established for the stored screen) — not a rider
        on this PR.
      - [ ] **An INTERRUPTED session's TOTAL line can be present live and
        absent stored, for the identical row — same family as the item
        above (Task 3 fix round 3, re-review; pre-existing across the
        branch, not caused by this PR's diff, previously unrecorded).**
        `summaryModel.ts`'s `monitorRest` (the LIVE screen's rest source)
        has a second rung that derives rest straight from `run.actuals`
        whenever EVERY actual carries its own rest reading — with NO
        `endedBy` gate at all, so an interrupted session whose completed
        intervals all measured a real rest still gets
        `"… · plus N m coasting in rest"` on the live post-workout
        summary. RC-1's stored `restSeconds`/`restMeters` pair, by
        contrast, is written ONLY for a `"finished"` close
        (`computeWorkRestSums`'s own gate) — and TIER B2's `endedBy`
        allowlist (fix round 2/3) correctly declines an `"interrupted"`
        row for the SAME reason C1 was fixed. Net effect: the SAME
        session can show a rest clause live and none at all once saved
        and reopened. Neither side is wrong (each states only what it can
        prove), but the disagreement is real and currently silent.
      - [ ] **Three minor divergences, recorded not fixed (Task 3 fix
        round 2, findings M2-M4).**
        - `postTestOffer.ts:45`'s `avgSplitSeconds` input now receives,
          on a tier-A monitor save, the machine's own TRUNCATED
          `avgPaceSecondsPer500m` (via `model.heroes.avgSplitSeconds`,
          `LogSession.tsx`'s monitor-door `postTestOffer` call) rather
          than our rounded quotient — a small precision change to what a
          baseline offer's number means, for every fresh tier-A save
          going forward. (The SILENT-DECLINE case — no offer at all on an
          unsaved-across-an-update build-738-era row — is NOT a second
          population: it shares the "Build-738-era rows render NO AVG
          SPLIT" bullet above, folded in there per PM gate finding 4.)
        - `server/stores/testHistory.ts:62-63`'s `deltaSeconds =
          input.splitSeconds - previous.splitSeconds` can now subtract a
          POST-RC-5 split (a tier-A row's machine-truncated value, or a
          tier-B row's work-only quotient) from a PRE-RC-5 row's stored
          split (the old, possibly-fused-population quotient) — the
          delta briefly mixes two different definitions of "the split"
          across the cutover, self-correcting once every row in a
          rower's history postdates this phase.
        - The LIVE monitor door's own tier-A gate
          (`summaryModel.ts`'s `monitorHeroes`) checks `distanceMeters`
          and `timeSeconds` against `> 0` INDEPENDENTLY of each other, so
          a partial-zero burst (one of the two genuinely `0`) can still
          show ONE hero live; the STORED screen's `hasMachineTotals`
          (`storedSummary.ts`) requires BOTH `machineWorkSeconds` AND
          `machineWorkMeters` `> 0` TOGETHER before rendering ANY tier-A
          hero, falling through to tier B1/B2/FALLBACK entirely
          otherwise — a narrow, likely-rare burst shape where the live
          and stored screens would show different heroes for the
          identical row.
- [ ] **The rower's PARTIAL-on-an-abandoned-piece complaint (hero-truth
      design review, 2026-08-25) — queued, out of RC-5's own PR.** "I
      want it to say I stopped, not silently show a shorter piece that
      looks like I planned a 250 when I meant 500 and bailed." PR #192's
      MACHINE CONFIRMED block already renders on a terminated row (with
      the machine's own partial numbers), but nothing on the screen SAYS
      the piece ended early rather than as planned. Copy plus a
      stored-state read (the terminate-path distinguishing signal RC-5's
      antagonist pass and §25 of the interface notes discuss); deserves
      its own design pass, not a rider on this one.
- [x] ~~RC-6 — Band `spm` and drop zero `p` in the stored series.~~ —
      **NARROWED, `spm` half SHIPPED** (2026-08-22, held-open-finish spec
      1 task 5). `seriesRecorder.ts` now bands `spm` to 10..60 inclusive,
      same 0-sentinel shape `hr` already used — kills both the
      first-stroke estimator's 64 and the boundary transition's 101. The
      `p: 0` half moved to RC-11's own spec (the stroke-data reframe
      owns what `p` means).
- [ ] **RC-7 — Stop writing `restDistanceMeters: 0` into the synthesized
      final interval** (`driver.ts:3037`), which the code's own comment
      already calls "a real gap". Unreachable today because no 0x0039
      ever arrives — but Phase LL's A-2 is trying to make it reachable
      and nobody had asked what it writes when it fires. **Sequence it
      INSIDE A-2's spec.**
- [ ] **RC-8 — Correct the fake's five contradictions of the real wire.**
      **Residual sub-item (#182's T2 review): `fake.ts`'s
      `toMachineIndex` is resting-conditional while `intervalIndex.ts`'s
      `toActualIndex` is unconditional — a latent index mismatch for
      rest-free non-first-interval boundaries in fake-driven tests
      (pre-existing, worked around in tests, not yet load-bearing).**
      Gates the honesty of everything above. `fake.ts` forces
      `restSeconds` to 0 off a rest; writes `ergMachineType: 1` where the
      machine reads 0 in 3448 of 3448 frames; writes `splitIntervalType:
      0` always; writes Last Split Time/Distance unconditionally; and
      **hardcodes `intervalRestTimeSeconds: 0` on every boundary**
      (`fake.ts:878`) — precisely the field RC-1 wants to carry. RC-1
      would otherwise ship green against a fake that says the machine
      reports 0. **THREE of five CORRECTED (PR2 Task 1, storage-spine
      spec §3, scoped to the fields RC-1's own tests depend on —
      Task 1's report, not a full RC-8 pass):** `ergMachineType` (both
      `fake.ts` sites, `0x0032`/`0x0038`, decoded 0 in 3448/3448 committed
      frames) → `0`; the `intervalRestTimeSeconds: 0` hardcode →
      `completed?.restSeconds ?? 0`; `splitIntervalType: 0` always →
      `completed?.kind === "distance" ? 1 : 0`, all three decoded off real
      wire hex across four captures (Task 1's report has the table). **The
      other two items in this row's own list — `restSeconds` forced 0
      off a rest, and Last Split Time/Distance sent unconditionally —
      read as ALREADY conditional in `fake.ts` as of this PR
      (`restSecondsFor`/`wireLastSplit`, both predating this phase, first
      introduced by #144 "EST LEFT keeps counting" and #99/#102's own
      lag-one-boundary work respectively)** — flagged for the next RC-8
      dispatch to verify and close out or correct this row, not resolved
      here: Task 3 did not re-derive whether that pre-existing behavior
      is itself honest against a real capture, only that it is no longer
      the hardcoded-0 shape this row describes.
- [ ] **RC-9 — Wire the free external oracles nobody reads.** **(a), (c),
      (d) SHIPPED** (design spec `2026-08-25-free-oracles`, pre-spec
      antagonist pass full on TRIAD ground, PM final gate on the PR);
      **(b) QUEUED**, reason below — this row stays open on (b) alone.
  - **(a) SHIPPED — walk search string: `` `avg-pace-verdict` ``** (one
    ring line per run; W11 below has the full read-it-off-a-walk
    protocol). 0x0032's `averageSplit` (offset 9), a PM5-computed
    cumulative work-only session average pace, is now compared
    (ring-only, no UI, no stored field) against `monitorAvgSplit`'s own
    quotient over `recordedActuals` — synchronously on a `terminated`
    close, or once the run's evidence settles (`armSummaryReconcile`'s
    deadline/early-complete path) on a natural finish — two
    independent computers of the quantity the C2 logbook stores, not the
    tier-A hero (post-RC-5 that hero IS 0x0039's own field, so comparing
    it to 0x0032 would be machine-vs-machine). Suppresses on an excluded
    actual or a summary-filled run; 1.0 s band. `fake.ts`'s
    `averageSplit: e.currentSplit` fabrication (would have made every
    fake-driven test vacuous — third sighting of the shape) fixed first.
    **The ABSENCE of an `avg-pace-verdict` line is itself a finding**:
    the pre-existing `FINISH_GRACE_MS` zero-fire (below) writes silence,
    not a suppression reason, whenever the next piece is armed within
    3 s of the previous one's finish — the walk's own ordinary rhythm
    between pieces, not a rare edge.
  - **(b) QUEUED, not shipped — oracle-blind today.** 0x0039's totals
    vs. Σ`recordedActuals` needs a rest-bearing capture that SURVIVES to
    a 0x0039: of the eight committed recordings exactly ONE carries a
    0x0039 at all, and it is the ONLY one of the eight with ZERO rest
    frames — so a rest-inclusion bug in either side would be silent on
    the one capture that could exercise it. It is also TAUTOLOGICAL on
    any run where `deriveFinalIntervalFromSummary` fired, since that
    path builds our own side FROM 0x0039 — comparing them then proves
    only that a value equals itself. **Unblocking condition: a
    rest-bearing capture that survives to 0x0039** — the hardware-walk
    item already owed (RC-9's own exit-7 walk).
  - **(c) SHIPPED, and CORRECTED, not merely "switched off."** The old
    framing here — "the TWD verdict is switched off for the whole
    session by any distance interval; all seven committed captures
    contain one, so it has never fired" — undersold the finding: lifting
    that suppression does not make the verdict useful, it makes it
    PASS everywhere (0.2-1.5 m deltas across five captures, all mirrors,
    since our accumulator and TWD are the same work-plus-rest-coast
    quantity). `recordTwdVerdict` is **retired outright**, not merely
    left suppressed. The record itself was also wrong: TWD is an
    ODOMETER of metres genuinely rowed (work + rest coast), lagging the
    interval in progress, never "the goal" — `docs/monitor/
    pm5-interface-notes.md` item 25 and `src/monitor/driver.ts`'s own
    doc comment both corrected, each citing its capture (RC-9c, design
    spec §2).
  - **(d) SHIPPED, new — not in this row's original scope — walk search
    string: `` `rest-distance-verdict` ``** (also one ring line per run;
    W11 below). 0x003A's
    Total Rest Distance (offsets 12-14, 1 m/lsb) gets a narrow parser and
    a ring-only verdict against the sum of `recordedActuals`' own
    `restDistanceMeters` (RC-1's stored rest metres): agrees exactly, 242
    vs 242 m — the exit-7 walk's OWN two committed numbers
    (PM5 memory screen 147 + 95 = 242), decoded by the real parser against
    the real captured 0x003A frame, but fed into a SYNTHETIC 2-interval
    program with the two rest values hand-entered
    (`driver.test.ts:11443`), not a byte-for-byte replay of the capture —
    the test proves the parser and the summation, not that this driver's
    own 0x0037 decode of that specific session yields 147/95. Handles a
    genuine 0 (the r0 keystone) without a false alarm.
    Interval Rest Time (offsets 15-16) is decoded and REPORTED, never
    gated on — it reads 0 on both captures including the r60 walk, and
    we do not yet know if that is a firmware quirk or the programmed
    value.
  - **One further gap this branch's own reviews found and left as-is,
    not blocking, not tracked separately** (the zero-fire below gets its
    own row instead, RC-13, so it survives this row's own closure —
    **duplicate-index over-suppression does not, by design**: it is a
    documented, deliberately-accepted safe direction, not an owed fix).
    **Duplicate-index over-suppression** (`driver.ts:3280-3288`'s own
    fix-round-1 comment): (a)'s `run.actuals > run.recordedActuals.size`
    check also fires when two boundaries land on the SAME normalized
    index (a duplicate Split/Interval Number overwriting
    `recordedActuals` via `.set`) — indistinguishable from a genuinely
    lost index by that comparison alone. No committed capture has a
    duplicate index to confirm the shape against. Left as-is because the
    failure mode is a false suppression (a missing verdict), never a
    false DIFFER/agree — the same "wrong direction is safe" shape (b)'s
    own queueing reasons on the accumulator.
- [ ] **RC-13 — The avg-pace verdict's zero-fire on a rapid re-arm.**
      Pulled out of RC-9's own sub-bullets into its OWN row (PM gate,
      2026-08-25) so it does not get silently ticked closed the moment
      RC-9's (b) lands — it is a real, separately-owed gap, not prose
      riding another row's checkbox. `program()` landing inside a
      finished run's `FINISH_GRACE_MS` (3000 ms) CANCELS the pending
      `pendingSummaryReconcile` deadline rather than draining it
      (`driver.ts:5671`, `pendingSummaryReconcile?.()` then `= null`, no
      `reconcileSummary`/`recordAvgPaceVerdict` call) — that outgoing
      run gets NO `avg-pace-verdict` ring entry at all, silently (W11
      above has the walk-facing read: absence is a finding, not a
      non-event). This is a DIFFERENT shape than the retired TWD verdict
      ever had: TWD's comparison ran SYNCHRONOUSLY at the terminal
      transition, so it could never race a re-arm; the new verdict is
      deliberately async (it waits on evidence that can still be in
      flight), which is exactly what makes it raceable. Zero-fire, not a
      false verdict — a missing walk-log line, not a wrong one. Fix
      shape (not yet built): drain the deadline the same way
      `drainSummaryReconcile` already does for disconnect/hook-reconcile,
      from `program()`'s own re-arm path, before cancelling it for the
      outgoing run.
- [ ] **RC-21 — The "RetestShortcut flake" is not a flake. It is an
      unvalidated cast at a trust boundary, and it can crash the You screen
      in production.** Found 2026-08-26 while dismissing it for the third
      time. `useWorkouts.ts:32` reads
      `const workouts = (await res.json()) as LibraryWorkout[]` — **a cast,
      not a check** — and sets `state: "ready"` with it. `RetestShortcut`
      (`you/RetestShortcut.tsx:29`) correctly guards
      `state !== "ready"` and then calls `workouts.find(...)`, so the
      invariant "ready implies array" is the only thing between a 200
      response and a `TypeError: workoutsState.workouts.find is not a
      function` that takes down the screen.
      **Any 200 whose body is not an array reaches it:** an error envelope,
      `null`, `{}`, or the HTML a captive portal or a misrouted proxy
      returns with a 200. The unit suite reproduces it intermittently
      through mock ordering, which is exactly why it kept being recorded as
      a flake — **a TypeError thrown from a component is never a flake; it
      is a real crash with a timing-dependent trigger.**
      **Fix shape:** validate the shape before declaring ready
      (`Array.isArray`, and reject otherwise into the existing `"error"`
      state, which already has a retry). Then the cast can go. Cheap, and it
      converts a crash into the retry path that already exists.
      **Sibling of RC-19** — both are failures dismissed as flaky that
      encode a real defect. Worth asking, once, how many others are on that
      list.
- [ ] **RC-19 — `server/routes/data.test.ts` flakes under the combined
      `--project unit --project client` run, and it is NOT one flaky test.**
      Observed four times across three sessions on 2026-08-25, and the
      interesting part is that it fails a DIFFERENT test each time: once
      *"DELETE is idempotent"*, once *"accepts distanceMeters at its exact
      upper bound"*, and twice unnamed. Always green on re-run, always green
      under `--project unit` alone (46 files / 1434 tests), and green in
      isolation. **A different assertion failing each time means the fault is
      shared state or ordering, not a bad assertion** — chasing the named test
      will find nothing. Landed here rather than left in three task reports
      (recurring failure #14). First moves, from the flake-hunt playbook this
      repo already has: capture the failure instead of re-running to green,
      then check whether failures cluster by worker index or by file ordering,
      to separate a harness race from an app race. Related in kind to the two
      e2e flakes already tracked.
- [ ] **RC-18 — `"PM5"` is baked into a fallback the rower can SEE, and it
      will be wrong the day we support another monitor.** James, 2026-08-25,
      on Phase LM Task 4's new label: *"We may one day support other rowers.
      Be careful where we use 'PM5'."* That label was renamed in the same
      breath (`NO MONITOR READING`, matching the shipped `LOST THE MONITOR` —
      **"monitor" is the house word, "PM5" is a model number**), but the sweep
      found a SECOND instance that is not copy and was not fixed:
      `webBluetooth.ts` and `capacitorBle.ts` both do `device.name ?? "PM5"`,
      so an erg advertising an empty GATT name gets literally named "PM5" in
      the device caption, in `deviceName` on the saved row, and therefore in
      the stored record forever. On a Concept2 that is merely redundant; on
      anything else it is a false claim about which machine the rower used,
      persisted. **Fix shape:** fall back to a neutral noun, not a model
      number. Left out of Phase LM PR 1 deliberately — it touches both
      transports and a stored value, so it wants its own failing test rather
      than riding a copy change.
      **Standing rule this establishes:** user-facing copy says "monitor";
      "PM5" appears only where we are quoting the device's OWN advertised
      name, or in release notes describing what shipped at the time.
- [ ] **RC-17 — The tier-A total line drops rest, and only `pnpm screenshots`
      sees it.** Found 2026-08-25 by Phase LM's Task 2 implementer, on a
      capture unrelated to its own work, and landed here rather than left in a
      task report (recurring failure #14). `e2e/screenshots.spec.ts:2370`
      expects `.summary-total-line` to read `4:04 total · plus 242 m coasting
      in rest`; it renders `2:04 total`. **Reproduced on a fresh
      `docker compose down -v` volume, so it is not stale test data.**
      Diagnosis from the code, not by elimination: the seeded row is tier A
      (`machineWorkSeconds`/`machineWorkMeters` both set), and `buildHeroes`'s
      tier-A branch calls `buildStoredTotalLine(row, timeSeconds, {})` with an
      EMPTY `stepSums` — the fix-round-2 C1 change from RC-5
      (`storedSummary.ts:620-634`) — while that seed sets neither
      `restSeconds` nor `restMeters`, so the rest half of the line vanishes.
      **Owner is whoever landed RC-5, not Phase LM.** **The fix, inlined here
      because the report it used to point at lives in git-excluded
      `.superpowers/` and dies with its worktree (RF#16's corollary, caught at
      #198's PM gate): add `restSeconds: 120, restMeters: 242` to that
      screenshot seed's `postLog`.** The unit fixture asserting the identical
      string (`src/log/storedSummary.test.ts:118-119`) already seeds both and
      passes, which is exactly why the unit test stayed green while the capture
      rotted.
      **Why it went unnoticed: `pnpm screenshots` is not part of CI**, so a
      capture assertion can rot indefinitely between the hand-runs that touch
      it. That gap is the more interesting half of this row — the unit test
      asserting the same string passes, because it supplies the step sums the
      seed does not.
- [ ] **RC-14 — The avg-pace verdict's zero-fire on an ORDINARY finish
      (walk 2026-08-25, W-2). A SECOND, DISTINCT shape from RC-13 — do
      not fold them.** Piece 1 of the walk (`w 1' r1 / w 500m r1 / w 1'`,
      natural finish, all three intervals recorded) produced NO
      `avg-pace-verdict` ring entry at all. Not a verdict, not one of the
      five suppressions — silence, which W11 above names as a finding.
      **RC-13's mechanism is RULED OUT by the capture's own timestamps:**
      the next `program()` came 148.1 s after the finish, not inside the
      3000 ms grace, and `reconcileSummary` demonstrably DID run for that
      run (`summary-reconciled — split-won`, 0.541 s after the finish,
      seq 71 of `rests-finished-ring.json`). Every branch of
      `recordAvgPaceVerdict` (`driver.ts:3301`) calls `log.record` before
      returning — there is no silent path — so the function was never
      REACHED, on a run whose reconcile ran. The verdict call sits as the
      next statement inside the same block as that reconcile
      (`driver.ts:3692`/`:3698`). **The mechanism is NOT established:
      nothing in this row asserts one, and the first job is to find it,
      not to patch the call site.** Replayable end to end — both the raw
      recording and the ring are committed at
      `docs/monitor/sessions/walk-2026-08-25/`. Note what this costs: the
      oracle shipped one PR ago (#196) and has now been walked once, on
      exactly the shape it exists to check, and said nothing.
- [x] **RC-15 — 0x003A's Interval Rest Time is the LAST interval's.
      SETTLED by the walk itself (2026-08-25, W-9); no experiment
      owed.** The field read 0 for the third capture running, this time
      on a piece carrying two real programmed 60 s rests. The same
      recording answers it: each 0x0037 carries its own interval's rest
      time (`[12..13]`, 1 s) and rest distance (`[14..15]`, 1 m), reading
      60 s/130 m, 60 s/144 m, and 0 s/0 m for the three splits. 130 + 144
      = 274 m = 0x003A's Total Rest Distance to the metre. So the field
      is neither dead nor a total — it is the FINAL interval's rest, and
      every capture we hold ends on a work interval, which has no
      trailing rest by construction. Still never gate on it (the driver
      does not); the value is now EXPLAINED rather than merely
      distrusted. A rest-final program would only confirm this, so the
      planned experiment is dropped rather than carried.
- [ ] **RC-16 — Suppress 0x0039's average stroke rate on a terminated
      piece** (walk 2026-08-25, W-3). On a Menu-terminate the field reads
      exactly DOUBLE: 46 against the PM5 View Detail screen's own `23
      s/m` and against 0x0038's per-split 23. The previously committed
      terminate capture shows the identical 2× (44 against 22), and the
      natural finish in the same walk is clean (24 against 24/23). Two
      terminate captures, both exactly 2×, now with the machine's own
      memory screen as the tie-breaker — the screen sides with 0x0038.
      Cause unknown and deliberately not guessed here. This field is not
      displayed today; the row exists so it is never wired up without the
      terminate suppression, and so the fact is written down where the
      next reader of the summary decoder will hit it.
- [ ] **RC-10 — The Concept2 sandbox as a test oracle.** Once the dev key
      lands: post a reconciled row to `log-dev.concept2.com`, pull
      `export/{csv,fit,tcx}` back, and diff it against what we stored.
      **Two gates on a POST that the numeric work does not cover:**
      `weight_class` is REQUIRED for a rower and we store nothing
      — RULED (James, 2026-08-22, phase open): a binary H/L field asked
      ONLY at Concept2 link time (the OAuth grant), never at onboarding;
      C2's own profile cannot supply it (PRIMARY: `GET /users/me` has no
      weight field; `weight_class` lives on results only, "Required if
      type is rower... H or L"). Optional nicety: prefill from the
      user's latest logged result if their history has one; per-interval `rest_time` is REQUIRED
      and we decode it at `parse.ts:236` then drop it (RC-1 closes this).
      Also unresolved and worth settling before we post in anger: if
      James runs ErgData too, success means our row and ErgData's row are
      the SAME row under C2's dedup. Whether that merges, rejects or
      duplicates is **not established by the review** and decides whether
      this is leverage or a fight over ownership of the row.
- [ ] **RC-11 — The stroke-data reframe, which is three-way not two —
      AND owner of RC-6's deferred `p: 0` half (narrowed off at the
      phase-open gates, 2026-08-22):** whether stored samples stop
      carrying `p: 0` for no-reading strokes is settled HERE, at
      serialization design time — `traceModel.ts` guards on `!== 0` and
      the server validator requires the field, so any change is a
      reader+validator+shape change, not a recorder one-liner.
      C2's `stroke_data[].t` restarts at 0 PER INTERVAL; ours is
      cumulative across the session. Worse, our series clock is a THIRD
      quantity — work plus however much of the trailing rest the wire
      clock advanced before freezing (session-2: 398.4 work / 419.5
      series / 488.4 header). **None of the three is C2's `time`.**
      Depends on the warm-up section below. Our `r` rest marker has no C2
      slot at all and stays ours-only, which is the honest boundary of
      what Concept2 can hold for us.
- [ ] **RC-12 — Documentation reconciliations**, each a defect by this
      repo's own rule; fold into the PRs above rather than a sweep.
      `driver.ts:2801-2870` and `pm5-interface-notes.md:4640-4657` still
      call `deriveFinalIntervalFromSummary`'s two premises UNCONFIRMED
      when a capture settled BOTH five days after they were written
      (`walk-2026-08-15/session-c-rewalk-row1.json` seq 35 prints its own
      three-way decision rule then reads 120 == 120 — cumulative AND
      rest-exclusive; ORM's writer independently agrees).
      `pm5-interface-notes.md:4393` says 0x0037's work-only status is
      "still open" while `state-architecture-review.md:1310` says PROVEN
      — the review is right. ~~§20 items 17 and 24 are contradicted by
      the captures that settle RC-4.~~ **DONE, folded into RC-4's PR** —
      both items rewritten to the 0.01 s/lsb, dimension-conditional
      semantic. `driver.ts:2094-2099` says "no capture
      or existing test evidences" state 9; one committed two days later
      does. `types.ts:429-433` claims `onDisconnect` covers the Bluetooth
      stack resetting and iOS backgrounding — it covers neither.
      `connectedAxes.ts:38-41` declares the link axis is "never invented"
      then returns `"up"` from `phase` alone. `schema.ts:165-167` calls
      `distance_meters` "the machine's whole-meter total" when it is our
      sum, work+rest+warm-up.

### The warm-up question, reframed 2026-08-21 (James)

> **SUPERSEDED the same day: James chose to remove warm-ups entirely —
> see Phase WU below, which lands BEFORE RC-1.** The reasoning below is
> kept because it is why the removal is safe for Concept2 (the machine,
> not us, decides what is in the row) and because it still governs any
> future decision to reintroduce a warm-up in any form.


This was written as "which population is the row?" — DISTANCE and TIME
include the warm-up, AVG SPLIT excludes it, pick one. **That framing was
wrong, and it hid the actual lever.** It is two questions, and only one of
them is open.

**The Concept2 half is not a choice, and the hash enforces it.**
`program.ts:37` compiles `IntervalType = "warmup" | "work" | "test"` — the
warm-up is an interval inside the type-8 workout we send the machine. So
the PM5 already counted it: its log entry covers the warm-up, and the
verification code is computed over THAT entry's date, distance and
duration. Upload a distance that excludes the warm-up and Concept2 rejects
the code. There is nothing here for a rower to consent to and nothing for
us to decide at upload time. **This is the good kind of constraint — we
cannot get it wrong silently.**

**The lever is at PROGRAM time, and that is the real open question:**

> **Should a warm-up be programmed as its own PM5 piece, separate from the
> working intervals?**

Program one workout and it is one C2 row with the warm-up inside, by
mechanism. Program the warm-up separately and it is a separate PM5 log
entry and a separate C2 row, cleanly, with no reconciliation cost either
way. **The consequence that decides it is the rower's logbook, not ours:**
a 2 km warm-up in front of a 6 km piece becomes an 8 km row, and their
season total, rankings and any Concept2 challenge counts all include it.
That argues for separate pieces by default, but it is a product call and it
changes the compiler, so it belongs in RC-1's spec rather than being
settled here.

**The screen half stays open, and aligning with Concept2 does not close
it.** C2 has no average-split field at all — it stores distance and time
and derives pace — so AVG SPLIT's population is purely a rower question.
Making DISTANCE and TIME C2-shaped can make RC-5 WORSE: the three heroes
still contradict each other, just by a different amount. **RC-5 needs its
own answer and must not be closed by citing this section.**

**What this means for the enrichment layer, which is bigger than traces.**
C2's per-interval `type` is `time|distance|calorie|wattminute` — a
DIMENSION, not a ROLE. There is no warm-up flag, and `REST=2` has no C2
twin either (see RC-1's map note). So "which intervals were working
intervals" is ours-only, the same category as the `r` rest marker in
RC-11. That is not decoration: every judgment this app makes hangs off that
distinction. **Concept2 holds what happened; we hold what it meant.** Any
design that treats our layer as an optional garnish on C2's row has the
relationship backwards.

### Walk items this phase owns

Runsheet-ready, from the review's §6. **W2 is the single most valuable
item** and W3/W4 ride the same piece.

- **W1** — record the firmware version (2 min, no rowing). PM5
  432331249's firmware has never been recorded anywhere in this repo, and
  0x003F is gated to nine disjoint firmware bands. Without it we cannot
  say whether the verification hash exists on our machine at all.
- **W2** — **do not tear down at the finish.** One 2x250 m r0 keystone,
  then stand still for 90 seconds and touch nothing. Settles whether the
  summary path is reachable at all, when state 12 fires, and whether the
  ~1-minute recovery-HR re-fire is real. **PARTLY OVERTAKEN by PR #180
  (2026-08-23): production now holds the link up to 2 s at a natural
  finish (`BURST_LINGER_MS`) and the burst is captured without any
  instrument — but the 90-second questions (recovery-HR re-fire, late
  state-12 behaviour) still need the hold-open instrument or the laptop
  harness. The readout for the captured burst is the ring's linger-end
  SECOND stash.**
- **W3** — the identity photograph, same piece: the PM5's View Detail
  memory screen and the phone in ONE frame, plus the decoded
  `logEntryDate`/`logEntryTime` from the ring. Settles the bit-packing
  against a real erg and whether the monitor's own entry carries seconds.
- **W4** — the verification hash, same piece: subscribe 0x003F, dump raw
  hex, photograph the PM5's own 16-digit code in the same frame. Settles
  whether 0x003F fires on our firmware, when, and which byte order the
  monitor prints (CSAFE says byte 0 = MSB, the BLE table says "Lo" — the
  two documents disagree). **The only route to the verification branch.**
- **W10** — a distance-shaped summary (3x300 m r30, held open 90 s), only
  if W2 shows 0x0039 arriving at all. Extends the cumulative/rest-exclusive
  settlement, which rests on one TIME piece. **Renamed from W7** (spec
  §6, 2026-08-22): two items on the combined walk were both called W7 —
  this one and Phase LL's, which keeps the name because it stays on the
  PHONE leg, where its watchdog-false-fire question is actually
  observable.
- **W11 — WALKED 2026-08-25, and it earned its keep.** Record:
  `docs/monitor/sessions/walk-2026-08-25/`. `rest-distance-verdict`
  fired and agreed on the first rest-bearing piece ever put to it
  (274 m against 274 m). `avg-pace-verdict` fired ZERO times across two
  pieces where it should have fired twice — once legitimately suppressed
  on the terminate, and once SILENT on the natural finish, which is
  RC-14. The absence-is-a-finding clause below is the only reason the
  silence was noticed at all; the count rule (N pieces ⇒ N lines) is
  what caught it. The same walk also settled §23 items 2 and 4 (0x0039
  is cumulative and rest-exclusive) and unblocked RC-9(b), which was
  oracle-blind for want of a rest-bearing capture reaching 0x0039 —
  `rests-finished-recording.jsonl.gz` is that capture. Keep this item
  live for future walks; the read-it-off procedure below is unchanged.
- **W11 (procedure)** — RC-9's two new ring verdicts, read off `MONITOR LOG · COPY`
  after any rest-bearing multi-interval piece. Grep the pasted log for
  the literal strings `` `avg-pace-verdict` `` and `` `rest-distance-verdict` ``
  — one line each, per run. **The ABSENCE of an `avg-pace-verdict` line
  is itself a finding, not a non-event**: every other outcome (agree,
  DIFFER, or any of its five suppressions) writes a plain-English ring
  entry with a reason, but the pre-existing `FINISH_GRACE_MS` zero-fire
  (`driver.ts:5671` — `program()` landing inside a finished run's 3 s
  grace cancels the pending verdict instead of draining it) writes
  SILENCE — no entry at all. Arming the next piece within 3 s of the
  previous one's finish is the walk's own NORMAL between-pieces rhythm,
  so this is not a rare edge to watch for; expect it to fire on a
  routine multi-piece session and confirm by counting: N pieces rowed
  should produce N `avg-pace-verdict` lines, FULL STOP — a suppression
  WRITES a line (with its reason), it does not subtract one, so the
  count never comes down for a healthy reason. A missing line is the
  zero-fire, not a healthy run. (Corrected at the #196 PM re-gate: this
  clause used to read "minus any genuinely suppressed ones", which
  invited exactly the miscount that would explain a real zero-fire
  away.)

**Arming the hold-open instrument (final-review I3 — the card never said
HOW before this fix):** W2/W3/W4/W10 all need it armed. On the laptop, in
Chrome DevTools' console, BEFORE the finish (the chip is a one-shot per
session — arming after the finish is too late):

1. `window.__pm5HoldOpen__.arm()` — confirm it took: the "HOLD-OPEN ARMED"
   chip appears next to the connection line. If `window.__pm5HoldOpen__`
   is `undefined`, the build was not run with the fake-monitor gate open
   (`pnpm dev`, or `VITE_ENABLE_FAKE_MONITOR=1`) — see `transports/index.ts`.
2. Finish the piece normally. `window.__pm5HoldOpen__.status()` reports
   `{ state: "holding", msRemaining }` for the next 90 s.
3. `window.__pm5HoldOpen__.ring()` reads the live trace at any point during
   the hold — every notification the PM5 sent, plus lifecycle markers
   (`0x003f subscribe-issued`, and — if the firmware lacks 0x003F —
   `0x003f subscribe-failed <message>`; a `subscribe-issued` entry with NO
   later `subscribe-failed` and no `0x003f` notification lines means the
   subscribe went through cleanly and the firmware genuinely sent nothing,
   the W4 negative). `hold-start` marks the armed→holding transition;
   `hold-released`/`hold-expired`/`link-drop-*` entries mark how the
   window ended.
4. Once the hold ends (release, the 90 s timer, or the PM5 hanging up
   first), the ring is stashed into sessionStorage. On the Log screen that
   follows, **MONITOR LOG · COPY reads this live** (final-review I2) — it
   will include the held-open window, not just the pre-hold trace.
5. **Reconnecting for a later item (W10, or a retry after "Try Again")?**
   `window.__pm5HoldOpen__.release()` first if a hold is still in flight —
   a stale decorator's own 90 s timer can otherwise hang up the NEW link
   out from under it (final-review M2).

**Protocol rules the combined walk plan must carry (spec §6, both
gates):**

- **Priority order: W1 → W2/W3/W4 (one piece) → the phone leg (LL's
  clause (b) pinned above the cut line within it) → W10.** The budget
  can run out; it must not run out before W2. Everything below W10 is
  cuttable without a second thought.
- **One link at a time:** the laptop disconnects (hold released) before
  the phone connects. Whether the PM5 accepts two centrals is an open
  question this ROADMAP contradicts itself on elsewhere ("the PM5 is
  single-central HAS NO SOURCE" versus a later line asserting
  single-central as settled) — the walk SETTLES it as a deliberate
  probe after all other evidence is gathered, never discovers it
  mid-evidence.

**Not worth a walk:** re-observing 0x0037's work-only semantics (settled
twice from committed bytes) or the state-9 frame (captured 2026-08-18).

**ANSWERED 2026-08-23 — record: `docs/monitor/sessions/walk-2026-08-23/`,
one keystone piece with PR #167's hold-open instrument.** W1: firmware
459.069 (serial 432331249, hw 134) — and empirically inside an emitting
band. W2: **the summary path EXISTS** — 0x0037/38/39/3A/3F all arrive
within ~310 ms of the finish; the pre-LL 21.7–107.3 ms hangup was cutting
inside the burst, so the "0x0039 never fires" corpus fact was OUR deafness,
not the machine's silence; state 12 (WORKOUTLOGGED) observed for the first
time; recovery-HR re-fire not observed (no belt worn). W3: date/time
bit-packing CONFIRMED against the memory screen (8/23/2026, 09:28) and the
wire carries NO SECONDS — RC-2's tolerance question is now a hard fact.
W4: **0x003F fires, at the finish, and the byte order is settled — two
little-endian u32 words** (`27 d8 f3 6e | e1 52 55 5b` = the PM5's own
`6EF3-D827 5B55-52E1`); the BLE table's "(Lo)" reading wins, CSAFE 0x72's
"MSB" describes its own framing. W10 answered in substance (the keystone
IS a distance program; its 0x0039 read work-only 500.0 m exactly).
Two-centrals: **a connected PM5 stops advertising** — settles the
single-central contradiction empirically. **RC-1 caveat from the walk
(F5):** TWD read 0 through 11 s of interval 1 (boundary-accumulator-like)
but 81 m at 56 s mid-interval on another run — its semantics on time
intervals are INCONSISTENT across today's captures; RC-1's spec must not
assume either reading. RC-2/RC-3/the verification branch are UNBLOCKED.

### Not now, each with its reason

- **`CSAFE_PM_GET_TOTAL_WORKDISTANCE` (0xA4) as a distance oracle** —
  speculative twice over: never issued against our firmware, and if it
  behaves like TWD on a distance goal it reports the GOAL, in which case
  lifting the suppression would be exactly wrong. A walk probe, not work.
- **Subscribe 0x0036 for `stroke_count`** — a real C2 column we cannot
  fill, but a fourth characteristic in every burst at 10 Hz, and the
  column is not on the dedup key. After RC-1 and LL's A-2.
- **Recovery heart rate** — the wire event fires about a minute after the
  finish; both our 3 s grace and our teardown reject it. Not a product
  feature. It is the clearest illustration of why A-2's close condition
  should be an EVENT, not a duration.
- **`MID_SESSION_RESET_METERS = 1`** — a genuine tuned-threshold instance
  where workout states 0 and 13 state the answer, but purely cosmetic.
  Prefer the state bytes only if the mirror is touched for another reason.
- **A partial final interval for an END-mid-piece session** — the summary
  shows dashes while a 44-sample trace of the 150.7 m rowed sits in the
  same row. That is a stated product rule, not an oversight. Revisit
  deliberately or not at all.
- **The armed-but-machine-rowed END path silently discards the row**
  (James, 2026-08-24, tester report; see the pocketed-phone walk item
  above). A rower who never presses Start on the app side but completes
  a programmed piece on the machine gets no save door and no message —
  the app should say something honest instead of discarding silently.
  Queued, not scheduled. Trigger: the pocketed-phone walk settles the
  mechanism; fix rides that phase.
- **Recover-from-monitor-memory** — the deep fix for the same tester
  report: the PM5's own memory holds the committed row even when the app
  never saw it, and a read-back path is the only thing that can return a
  genuinely lost workout. Natural follow-on to the summary-record wave
  (its writer already knows the record shape a recovered row would
  fill). Queued, not scheduled. Trigger: James schedules it, likely after
  the pocketed-phone walk narrows the mechanism.

### Sequencing across RC, WU and LL — worked, not asserted (James, 2026-08-21)

Ordered to avoid re-work. **Two collisions matter more than the logical
dependencies** and are the reason this section exists rather than a
sentence:

- **NARROWED 2026-08-21 at the PM gate: the collision is ONE file, not
  three.** This bullet inherited its file list from the grep-era map.
  Measured against the spec's actual footprint, `driver.ts` carries
  warm-up COMMENTS only (`:2194`, `:3839-3867`) and
  `useMonitorSession.ts` carries one (`:179`). The real overlap is
  **`surfaceModel.ts` alone**. **WU and LL implementations still must not
  run concurrently on `surfaceModel.ts`** — but **LL's DIAGNOSABILITY
  TIER CAN RUN ALONGSIDE WU**: it touches `adapters/monitorTransport.ts`
  and `LogSession.tsx`, not `surfaceModel.ts`, it is the cheapest LL item,
  and it is the thing whose absence made both walk findings
  evidence-poor.
- **RC-8 and Phase LL both own work on the fake.** LL's reconnect
  precondition is "the fake models handle invalidation" (its OUT list,
  item 2); RC-8 is the fake's five contradictions of the real wire.
  **These are ONE piece of fake work and must be specced together** —
  doing the fake twice is precisely the re-work this ordering exists to
  prevent. Whichever phase gets there first carries both, and the other's
  item points at it.

**The order:**

**Wave 0 — unblocked today, no collisions with anything.** RC-4 (the
Last Split 10x, which also fixes its mirror in `statusFrames.ts`) and
RC-6 (band `spm` — `seriesRecorder.ts` — **SHIPPED**; the `drop zero p`
half narrowed off to RC-11). Neither file is touched by WU or LL. These
can go now and need nothing from anyone.

**Wave 1 — Phase WU. REWRITTEN 2026-08-21 at the PM gate: all three of
this wave's original reasons were falsified and it now stands on a
different one.** Struck: "the compiler enumerates the work" (spec §10
opens by calling it False — two of the four warm-up unions are invisible
to `tsc`); "the single biggest re-work-avoider … RC-5 reconciles three
heroes whose disagreement is partly the warm-up" (measured at 5%, and 0%
on the second exhibit); and "WU inserts ahead of LL only because it is
small" (measured at ~65 grep-reachable files).

**The surviving reasons, and they are enough:** WU precedes RC-1 because
the program-time "should a warm-up be its own PM5 piece" question
disappears entirely, and RC-1 would otherwise design storage for a
population about to change. WU precedes LL **only because WU is SPECCED
and LL's brick work is not** — a spec plus a spent antagonist pass versus
a research pass and no spec. Ordering a ready thing behind an unwritten
one costs calendar days in which nothing merges.

**BINDING CONDITION (PM gate):** LL's brick spec is written IN PARALLEL,
starting now. The collision rule below bars concurrent IMPLEMENTATIONS,
not specs. **If LL's spec lands before WU's implementation finishes, the
order flips without further argument** — the brick is the item that makes
James delete his app.

> **SPENT 2026-08-22.** WU shipped (#150, main `1602248`). Everything in
> this wave-1 argument and in the collision rule below is now HISTORY, kept
> for the reasoning only. **Nothing blocks Phase LL**, and the parallel-spec
> condition is discharged by starting LL's spec next. RC's own waves 0 and
> 3-5 are unaffected and still stand.

**Wave 2 — Phase LL** (A-2, A-4, the diagnosability tier), carrying
**RC-7** inside A-2's spec by the review's own ruling, and carrying the
merged fake work above. LL stays ahead of the rest of RC because RC-2,
RC-3 and RC-10's oracle leg are all blocked on A-2 — **nothing arrives on
the wire today**, so they cannot even be tested before it lands. LL is
also a PROD precondition and the only item here fixing a defect that
bricks the app.

**Wave 3 — RC-1**, the phase's spine, once WU has settled the population
and the merged fake work has made a green test mean something. **RC-8's
`intervalRestTimeSeconds: 0` hardcode gates this specifically:** RC-1
carries exactly that field, and without the fake fix it ships green
against a fake asserting the machine reports 0.

**Wave 4 — RC-2 and RC-3** (need A-2's held link), **RC-5** (needs WU,
and lands with or after RC-1 since RC-1 changes what is stored), and
**RC-11** (needs RC-1's storage plus the clock decision).

**Wave 5 — RC-10** (needs RC-1's per-interval `rest_time`, the dev key,
and a `weight_class` answer), then **RC-9** and **RC-12**, which are
cleanup and can trail anything.

**What this does NOT reorder:** the PM gate's phase order (LT close → LL
→ CL2 → LQ → PROD) stands. WU inserts ahead of LL only because it is
small, independent and collides with it; RC as a whole sits after LL.

**Exit — written so it can go red.** (a) A row rowed on a real PM5 stores
work and rest as separate quantities, and its work-only distance and time
equal the monitor's own for the same piece; (b) the monitor's log entry
date/time is decoded and logged from a real finish, with the
seconds-resolution question answered either way; (c) the three heroes on
one stored row reconcile with each other by hand arithmetic; (d) a row
posted to the Concept2 sandbox comes back through `export/` matching what
we stored, or the reason it cannot is documented; (e) if 0x003F turns out
not to fire on our firmware, DEVIATIONS carries the row saying so and the
verification branch is closed on the record rather than left hoped-for.

## Phase WU — The warm-up leaves

**Status:** SHIPPED 2026-08-22 — PR #150, main `1602248`, all nine exit
criteria green at the final whole-branch review; James confirmed his own
warm-up setting was OFF, so the removal cost the cohort nothing.
**Decided by James, 2026-08-21**, during the Phase
RC review: "let's just drop warmups. We uniquely do them nobody else
does." Scope chosen the same day, from three costed options: **remove
warm-ups ENTIRELY** — the setting, the preference, the `EnginePhase`
member and every downstream branch — not merely stop programming them to
the PM5. No spec yet.

**What and why, in plain words.** The app prepends a configurable warm-up
to every session. Nobody else in this space models one, Concept2's own
data model has no slot for the idea, and the feature costs us a
population disagreement in three different places. It goes.

**The premise, stated accurately, because it is smaller than it sounds.**
Warm-ups already left the `Step` union on 2026-08-09 (`expand.ts:135-139`:
"no `Step[]` input can produce a `type: \"warmup\"` Phase anymore"). Today
a warm-up is a GLOBAL PREFERENCE (`warmup jsonb` on the preferences row,
`schema.ts:235`), not part of any workout — the 300-workout library
carries exactly one `warmup` occurrence and it is in a test. So this
retires a setting and its downstream, not a concept threaded through the
library.

**What this reverses, named so nobody restores it as a regression:**

1. **The 2026-08-09 warmup-setting spec**
   (`docs/superpowers/specs/2026-08-09-warmup-setting-design.md` and its
   adversarial review), which deliberately built this shape — moving
   warm-ups out of the Step union into a single setting, and replacing the
   earlier `warmup_minutes`/`warmup_override` columns (`schema.ts:228-235`).
2. **James's 2026-08-12 connected-mode requirement**, that the rower must
   be able to see a warm-up is NOT a working interval. Shipped, and
   announced to testers in the release notes
   (`releaseNotes.ts:165`). Removing warm-ups dissolves the problem it
   solved rather than regressing it, but the requirement is retired and
   should be recorded as retired.

**Design authority:**
`docs/superpowers/specs/2026-08-21-warmup-removal-design.md` (2026-08-21).
Approach A of three: full removal INCLUDING both type unions, so the
compiler enumerates every dependent.

**Not fast path, and TRIAD by the standing rule.** Full cycle: a spec, a
full antagonist pass on it, subagent implementation and review, and a PM
final-PR gate.

**Footprint, MEASURED (corrected twice — see the spec's revision 2).**
The original "37 non-test files" was a string grep. The first measurement
then probed the two unions SEPARATELY and misread its own output. Probing
them TOGETHER: **59 errors across 23 files, 7 source and 16 test** —
smaller than either half implies, because 18 files were pure
mirror-breakage noise. `WorkoutDetail.tsx` needs no edit at all.
**But the grep-only half is roughly 65 test and spec files**, so the work
is bigger than any probe says AND less compiler-guided.
**THERE ARE FOUR WARM-UP UNIONS, NOT TWO**, and the two the compiler
cannot see are the ones that matter: `LogSeed.steps[].kind`
(`logDraft.ts:590`) is PERSISTED, and its readers are exactly what keep a
stored record's AVG SPLIT and saved log rows correct. The coupling between
the two compiler-reachable unions is ONE-DIRECTIONAL, so the change could
be split — it lands in one commit by choice, not by necessity.

### What the spec has to answer

- **CORRECTED 2026-08-21: a stored step list has NEVER contained a
  warm-up** (`logDraft.ts:851`, `if (seedStep.kind === "warmup") return;`),
  so this section's original worry about renderers losing a branch was
  unfounded. What IS true: the stored TOTALS include the warm-up
  (`summaryModel.ts:577-583` filters nothing, and `monitorTimeSeconds`'s
  comment says "warm-up included") while the step list does not, and
  recompute is impossible because the row persists `series` and `steps`
  but never `actuals`. **James's ruling: forward-only, no marker, say
  nothing.** Accepted cost: a pre-WU row is off by its warm-up against
  Concept2 and nothing marks it.
- **SETTLED 2026-08-21: expand/contract, two steps.** `0007` dropped the
  two older warm-up columns in one migration, but its own comment says
  that was safe because they were "never consumed anywhere" — this one is
  consumed, migrations run at boot before the API serves a request, and a
  rollback would hit a column that no longer exists. **WU ships NO
  migration:** every read and write goes, the column stays.
- [ ] **OWED to the next server-touching phase: `ALTER TABLE
      "preferences" DROP COLUMN "warmup";`** One line, safe once no
      deployed image reads it. Recorded here rather than in the spec
      because a PR body is not a record (recurring failure 14).
- [ ] **OWED at the first server-touching phase after TWO tags have
      shipped — a countable trigger, replacing "once no pre-WU persisted
      record can plausibly exist" (PM gate 2026-08-21: that trigger is
      unmeasurable by construction, spec §12 concedes the population size
      is unknown, and an unmeasurable trigger never fires). Remove the
      legacy guards.** James's ruling 2026-08-21 keeps two readers of
      the PERSISTED `LogSeed.steps[].kind` union alive (`logDraft.ts`'s
      `buildMonitorLogSteps` skip, `summaryModel.ts`'s
      `warmupIndex`/`monitorAvgSplit` exclusion), plus a default arm on
      `Timer.tsx`'s switches. Without them a rower mid-session at
      update time gets a moved AVG SPLIT on a stored record and a
      `STEP 1 OF 5 · undefined` label. They are deliberate vestigial code
      and they have an expiry.
      **`kind` STAYS THE LITERAL `"warmup" | "work"` union — it is NOT
      widened to `string`** (PM gate, 2026-08-21, overturning this
      bullet's own earlier "retyped `kind: string`" wording, which
      survived into the first draft of the Task 2 brief). Widening admits
      typos, erases the enumeration, and hides this very cleanup from the
      compiler: the literal union is what lets a future implementer grep
      the member and find every site that still reads it. Nothing
      PRODUCES `"warmup"` after Phase WU — `buildLogSeed` cannot — so the
      member is legacy-read-only, not dead.
- **`EnginePhase`'s `"warmup"` member** (`expand.ts:12`) is currently
  unreachable from `Step[]` but still in the union, and `expand.ts:139`
  says every downstream branch is untouched. Removing the member is a
  compile-forcing change across every exhaustive switch. That is a
  FEATURE — the compiler enumerates the work — but it is also why this is
  one task and cannot be split across several.
- **Does any NUMBER change for an existing row?** `judge.ts:78` treats
  warmup alongside effort/rest/test as "no numeric target at all", and
  AVG SPLIT already excludes warm-up phases. If no warm-up phases can
  exist, those exclusions become dead code rather than changed behaviour —
  **but that must be PROVEN by replaying a committed capture that contains
  a warm-up** (`walk-2026-08-16/session-2-wu-4unequal.jsonl` is the one),
  not argued. This is the triad clause.
- **The does-it-exist question, pointed at ourselves.** A rower who warms
  up will still warm up; they just will not do it inside a session. Is
  there now a place where the app says nothing about warming up when it
  used to? Name the gap and decide it deliberately, rather than
  discovering it from a tester.
- **Orphaned UI and CSS.** `you/WarmupRow.tsx` goes, and `index.css` is in
  the touched list — recurring failure 5 is deleting a component and
  leaving its rules behind, three times now. Grep the class names across
  `src/` and `e2e/`.
- **Release notes are history, not state.** `releaseNotes.ts:120` and
  `:165` describe shipped behaviour at the time. Do NOT rewrite them; add
  a new note saying the warm-up is gone.

### The files, so the spec starts from a map

- **Domain:** `expand.ts`, `judge.ts`, `types.ts`, `bulk.ts`,
  `fixtures.ts`, `display/stepDetail.ts`, `generation/patterns.json`,
  `monitor/program.ts` (the warm-up arm, `:512-526`), `monitor/types.ts`,
  `monitor/pm5/commands.ts`
- **Server:** `db/schema.ts` (`warmup jsonb`, `:235`), `routes/data.ts`,
  `stores/logs.ts`, `stores/preferences.ts`
- **Client:** `You.tsx`, `you/WarmupRow.tsx`, `api/usePreferences.ts`,
  Builder (`Builder.tsx`, `builderState.ts`, `BulkImport.tsx`,
  `StepCard.tsx`, `StepEditor.tsx`), session (`draft.ts`, `engine.ts`,
  `intervalBoundaries.ts`, `logDraft.ts`, `summaryModel.ts`,
  `Countdown.tsx`, `Timer.tsx`, `TimerRuler.tsx`, `TimerTargets.tsx`,
  `PostWorkoutSummary.tsx`), `workout/connected/surfaceModel.ts`,
  `monitor/driver.ts`, `monitor/useMonitorSession.ts`,
  `WorkoutDetail.tsx`, `index.css`, `news/content/releaseNotes.ts`

### What it buys Phase RC

- **The program-time warm-up question disappears.** RC's own warm-up
  section exists to decide whether a warm-up should be its own PM5 piece.
  With no warm-ups, there is nothing to decide.
- **RC-5 barely moves — CORRECTED 2026-08-21, quantified.** This
  section originally claimed RC-5 "shrinks to the rest question alone".
  Measured: **WU buys about 5%** (session-2's contradiction goes 24.2 s →
  22.9 s) and **0% on the other exhibit** — the pyramid capture has no
  warm-up at all, so its 39.9 s is untouched. RC-5 was already ~95% the
  rest question. Do not let WU be cited as closing any part of it.
- **RC-1's spec gets simpler**, which is why sequencing matters below.

**Sequencing: WU lands BEFORE RC-1, and must not run concurrently with
Phase LL.** Before RC-1 because otherwise RC-1's spec designs storage and
display for a phase type about to be deleted, and the migration is written
twice. Not concurrent with LL because both edit `useMonitorSession.ts`,
`driver.ts` and `surfaceModel.ts` — no logical dependency, a real merge
hazard. WU has no dependencies of its own, so it is free to go first. The
full worked order lives in Phase RC's "Sequencing across RC, WU and LL".

**Exit: see the spec's §8, which is the ONE list.** Ruling at the
2026-08-21 PM gate — this section previously carried its own (a)-(f), and
clause (b) still demanded "every whole-session number that moved moved by
exactly the warm-up's own contribution" after spec §8 had already called
that clause NOT EVALUABLE (DISTANCE and TIME cannot move; AVG SPLIT is a
re-weighting with no additive contribution). ROADMAP's copy was also
missing the inert-control criterion and the unlogged-record criterion.
**A close gate reads ROADMAP, so two exit lists means closing against the
wrong one.** When a spec writes numbered exit criteria, ROADMAP points at
them and never copies them.

### What this phase taught (2026-08-22)

1. **`app/e2e/` is NOT typechecked.** `tsconfig.app.json` covers only
   `src`, `domain` and `scripts`; Playwright transpiles and erases types
   at run time without ever checking them. A stale 4-argument `buildRun()`
   call compiled and ran silently in an e2e fixture, and a hand-rolled
   `tsc` config scoped to `e2e/` alone surfaces 14 pre-existing errors
   there today. Owner: the next infra-touching phase.
2. **`pnpm e2e -- -g "pattern"` silently runs the FULL suite** — even the
   double-dash form is swallowed; pnpm eats `-g` (its own `--global`) no
   matter where it sits on the command line. The LT-era note prescribing
   the double-dash form (above, PM gate 2026-08-19) was wrong and is now
   corrected in place. **Working form: `pnpm exec playwright test
   --grep`.**
3. **A sweep for an idiom must key on the STRUCTURE, not the operand.**
   The flake investigation's grep for the vulnerable readiness-gate
   pattern keyed on the `title` variable name and missed a sixth instance
   that hardcoded its literal instead of naming a variable — same gate,
   same bug shape, invisible to a search for the operand rather than the
   pattern.

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
**MOVED OUT 2026-08-20** (James: the variety debt and the rating system
"put these in a specific phase"): the O2|60+ variety debt, the
rebalance's other flagged pairs, and the workout rating system now live
in **Phase LQ** below. They were never authoring parity — they are about
what the library's CONTENT is worth and what rowers think of it, which
is a different question with a different kind of answer. CL2 is now
exactly two items, both about the builder and the import agreeing with
the domain.

**Exit:** A rower authors 15' steady then 4x(3' on, 1' off) entirely in
the builder; the same workout pastes in via import; both render as
"N× the block below" exactly as the seeded library does.

## Phase LQ — Library quality and what rowers think of it

**Status:** Not started. Split out of Phase CL2 on 2026-08-20 (James).
**Goal:** the library stops containing workouts a rower cannot tell
apart, and starts collecting their opinion of the ones they row.

**Why these two belong together.** Both answer "is this workout any
good?" — one from the authoring side, one from the rower's. They also
feed each other: ratings are the only mechanism that could ever tell us
whether a near-duplicate pair actually matters to anyone, so building the
rating first and letting it run may well re-order the retune list. That
is a sequencing question for the phase's own brainstorm, not a decision
to make here.

- [ ] **Pay down the O2|60+ variety debt** (James, 2026-08-10, at the
      rebalance's Gate 2): Fair Wind / Morning Mist / Sleet / Glass Sea
      (+ Altostratus after its retune) are near-identical long
      continuous singles. Retune 2-3 into distinct shapes WITHIN the
      cell so the grid holds; the `variety.test.ts` KNOWN_DEBT entry
      for O2|60+ shrinks with them (ratchets only ever go down). **M**
- [ ] **Pay down the rebalance's other flagged pairs** (James,
      2026-08-10, at the PR #78 merge: "any flagged workouts bump to
      CL2"). The full list, from the PR's disclosure section: O2|30-45
      Silver Thaw <> Halo Ring; AT|30-45 Anticyclone <> Jet Streak,
      Inversion Layer <> Gap Wind, Deepening Low <> Thermal Wind,
      Thermal Low <> Heat Low; TR|30-45 Gulf Stream <> Piteraq,
      Southerly Buster <> Cold Snap; AN|20-30 Downburst <> Rope
      Tornado. Same rules as the cluster above: differentiate WITHIN
      the cell, grid holds, ratchets shrink. **M**
- [ ] **Workout rating system** (James, 2026-08-10): unscoped —
      **brainstorm first**, and the brainstorm owes the house
      does-it-exist question before any of it. Open questions: what a
      tester rates (the workout as a recipe, or the session they just
      rowed — these are different things and the app already collects
      the second as thumbs + hold + pain); where it surfaces (post-save,
      library, detail); and whether ratings feed selection or stay
      informational. **Note the overlap that must be settled, not
      papered over:** the post-workout reflection ALREADY asks for a
      thumbs up/down on "do you want more sessions like this one". A
      second rating control that means something almost-but-not-quite
      the same is worse than none. **M, brainstorm before sizing**

**Exit:** the O2|60+ cluster reads as five different workouts, no flagged
pair survives as a near-duplicate, and a rower can say what they thought
of a workout in a way the app can act on.

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
- **Phase BL's `retest.spec.ts` post-test-prompt flake** (found at
  #167's post-rebase gate, 2026-08-23): under full-suite load the
  "Set your 2k baseline?" heading misses its 5 s `toBeVisible` window
  — the page shows Today with the prompt never rendered. Two runs
  failed differently (`:31`+`:95`, then `:95` alone), 4/4 green in
  isolation; the error-context artifact is the capture, not a re-run
  disposal. Owner: Phase BL (the flow is theirs; #167's diff has no
  file in the path).
- **`log-monitor`/`log-monitor-landscape` captures are scroll-unstable**:
  `scrollTraceChartIntoFrame` lands differently run to run, so these
  two PNGs churn on every screenshots pass (#167 saw both directions
  in one day). Until the scroll is pinned, treat a diff in these two
  as noise unless the chart CONTENT changed.

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
the walk's own finish) in a width-pinned slot. **RECONCILED (PM gate fix
wave, 2026-08-25, PR #192): the 5m calm-rule quantisation was itself
reversed by James on 2026-08-25 — the counter is back to a realtime 1m
count, `PaneLive.tsx`'s `fmtMeters`.** TRIAD (number semantics).
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
- [x] Follow-up (James, 2026-08-20, from the device): **the session-meters
      counter has room reserved for four digits, and the bar shrinks once at
      10,000m.** `.connected-progress-meters` reserves
      `min-width: calc(6ch + 0.12em)`, which holds `9,999m`; at `10,000m` the
      cell grows to seven characters and takes ~13px from the flexing bar
      beside it. Nothing clips or wraps — `white-space: nowrap`, `flex: none`,
      and the bar carries `min-width: 0` — so this is a one-time layout shift,
      not breakage, and the CSS comment currently defends it ("a milestone,
      not noise"). **Two reasons to change it anyway.** (1) That defence is
      inconsistent with why the reserve exists at all: the same jolt at
      999→1,000m was MEASURED at 27.3px and judged unacceptable, and the
      10,000m case was waved through by assertion rather than measurement.
      (2) **Nothing tests it.** The largest meters fixture anywhere in the repo
      is 3,842, while the seeded library ships **Calm Sea at 10,000m** — a
      rower can reach the five-digit case today, on a workout we authored, and
      no gate has ever rendered it. Fix: reserve 7ch and add a five-digit
      fixture to both the unit test and the design sweep. Fast-path sized;
      **James's ruling: do it at a logical point, not now.** **DONE 2026-08-20
      (trace-axis PR, grouped item G3):** `min-width: calc(7ch + 0.12em)`;
      `PaneLive.test.tsx` gained a real 10,000m (Calm Sea) fixture; the design
      sweep gained a real-browser no-clip/no-bar-shift check against the same
      total. **S**
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

**THE PHASE-CLOSE ERG BUNDLE — WALKED 2026-08-20.** Record:
`docs/monitor/sessions/walk-2026-08-20-lt-close/`. Items A/B/C (occlusion
both rotations, the mis-hit test, triple-tap on the phone) **PASS** and are
closed after being owed since CR2 shipped. Item D **FAILED HARD** and
produced the two findings below, which are the walk's real output. Item E's
DISTANCE oracle is **CLOSED** against the PM5's own View Detail screen — our
hero (1156) and the machine's Total Work Distance (1154) are both correct and
track two PM5 numbers the PM5 itself does not reconcile, its displayed
interval rows summing to 901 against its own stated 899. **Still owed:** the
phone→server trace leg (the piece ended up on web) and one read of the TIME
hero off the screen.

**F-1 / F-2, the walk's findings — an armed screen that lies, and a native
app that bricks.** Armed, walked out of range, cycled Bluetooth off and on:
the surface never changed, holding `1 OF 3 · READY` throughout, and rowing
produced nothing. Then reconnect failed with `LINK-FAILED`; a force-quit did
not clear it and neither did restarting the PM5, while the same PM5
programmed fine from the laptop web build seconds later — **deleting and
reinstalling the app was the only fix.** That isolates it to the **native path** —
but NOT, as first written, to app-local state: the PM gate's storage census
found no persisted key is an input to `scan()`, `connect()`, `program()` or
any driver decision, so a `localStorage` clear would not have fixed it.
"Reinstall fixed it, therefore our storage" is a guess about a BOUNDARY, not
a mechanism; **why a force-quit did not clear it is UNESTABLISHED and is the
open question.** v0.14.0 (688) carries it but does not OWN it —
`git diff --stat v0.13.0 v0.14.0 -- app/src/monitor/transports/
app/src/adapters/` is empty and the native BLE arm is unchanged since
v0.10.0, so a rollback would ship the same defect minus five notes clauses.
**What IS established:** `1 OF 3 · READY` is structurally impossible once
`phase === "disconnected"` (`surfaceModel.ts:787`), so its persistence proves
the phase never moved — the app never learned the link was gone. Its only
lost-link detector is the plugin's disconnect callback, with no frame-silence
watchdog anywhere, and the plugin fires that callback only from
`didDisconnectPeripheral`. James, 2026-08-20: "i think some of the bluetooth
problems deserve their own phase with dedicated connection management
research" — **PM verdict returned 2026-08-20 and is
awaiting James's word** — summarised here because it re-scopes the ask:
open the phase, but as **"the link can be lost, and the app has to say
so"** (detection, recovery, diagnosability, plus re-reasoning the failed-
`program()`-leaves-a-run-open item), with **RECONNECT ITSELF OUT**. The
argument: the harm was not failing to rejoin, it was never being told and
then not coming back — both fixable with zero reconnect — while reconnect
is the most invention-heavy piece available (`createPm5Driver` subscribes
only at construction, has no teardown, and rebuilding a live driver
double-processes every notification). The `LOST THE MONITOR` banner
already exists and shipped (DEVIATIONS row 75); the job is to make it
fire. The phase is created by **DELETING** the "Reconnect and background
scan, five pieces" follow-on, not sitting beside it — its trigger has now
fired twice and two homes for one body of work is the CP/CR2 mistake.
**A third symptom, from James the same day: "sometimes when I go to
connect we're actually still connected."** Same defect, opposite
direction — and checked: there is NO already-connected guard on the
connect path (no `isConnected`/`getConnectedDevices` call anywhere in
`capacitorBle.ts` or `useMonitorSession.ts`), and `createTransport`
builds a fresh transport per attempt. The app never asks iOS whether it
already holds the peripheral. Since the PM5 is single-central, a
forgotten-but-live connection is exactly the shape that ends in
`LINK-FAILED`, and it fits the force-quit/reinstall asymmetry. Whatever
the phase's final scope, **the app's connection state being a local
belief rather than an observation is the thing all three symptoms
share.** Proposed sequence: LT close → this phase → CL2 → LQ → PROD, on the
grounds that it is a PROD precondition (PROD's exit, an empty-phone
install reaching a logged row unaided, is unreachable while a link drop
bricks the app). **F-3, the reason both findings are
evidence-poor:** a TestFlight build can be neither inspected nor recorded
(`isInspectable` false since iOS 16.4, `CAPACITOR_DEBUG` reaches Debug
configurations only, and the recording tap is web-arm only), so a
native-only defect leaves no machine-readable evidence at all.

**THE ORIGINAL BUNDLE (James, 2026-08-19: "lets do those at phase
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
- ONE REST-BEARING PIECE, ~4 min. **REVISED 2026-08-20 by the phase-exit
  antagonist pass — the original three-item framing was wrong in three
  places and is kept below only so the corrections are legible:**
  - the same-frame DISTANCE photo (PW's PM-gate C3 row) — **the original
    said "at a rest, never after finishing" and that is BACKWARDS.** The
    oracle is the SUMMARY's DISTANCE hero, Σ over `IntervalActual`
    (`summaryModel.ts:577-583`), which does not exist until after
    `Log it`; the number visible at a rest is the register-map
    accumulator (`PaneLive.tsx:150-155`), a different derivation that
    already got its same-frame check on 2026-08-18. Photograph the
    summary hero against the PM5's **Memory screen**, after the piece.
  - **F-2 is ANSWERED, with no hardware.** "Does the native transport
    sample TWD at all" is malformed: TWD is bytes 11-13 of `0x0031`
    (`pm5-interface-notes.md:459`; `parse.ts:135`), the characteristic
    every frame rides, so no transport can deliver frames and omit it.
    Decoding the committed corpus shows what 2026-08-19 actually saw —
    TWD reads ZERO through every first work interval and first goes
    nonzero at a completed boundary (0/94 frames on step-4's abandoned
    single interval; 152/391 and 145/287 on the two 2×250 captures). A
    45-second single-interval paddle can never produce a nonzero
    `machineTotal`. Keep it only as a free observation, not a question.
  - **F-1 CANNOT be re-observed by this piece.** Its two surviving
    theories are interruption-specific (a fourth actual written by
    something only a real browser reload does). A normal END → `Log it`
    shares the TIME-hero formula (`measuredSessionSeconds` is a literal
    alias of `interruptedTotalSeconds`, `monitorRun.ts:665`) but cannot
    exercise the theory. Either add a native force-quit-and-relaunch
    mid-piece — **UNVERIFIED, nobody has run that on native, so it does
    not go to James as an instruction until someone has** — or state
    plainly that F-1's reload theory stays open.
  - **The pre-save storage dump is IMPOSSIBLE on a TestFlight build.**
    `WKWebView.isInspectable` defaults false since iOS 16.4;
    Capacitor sets it from `CAPACITOR_DEBUG`, whose xcconfig is the base
    configuration for the DEBUG configs only, and `ios-release.sh`
    archives `-configuration Release`. The 2026-08-19 dump worked because
    it was an Xcode DEBUG build. Use the in-app `MONITOR LOG · COPY`
    control for the ring before `Log it`, and pull the trace from the
    SERVER afterwards — `GET /api/logs/:id` returns the `series` column
    unprojected, which also closes the gap below.
- **NEW, from the same pass — two obligations nobody had listed:**
  - **No committed capture of this phase's flagship feature shows real
    data.** `log-detail`'s series is hand-built (already labelled), and
    `log-monitor`'s — called "a genuine recorder replay" — is the real
    recorder fed hand-scripted, self-admittedly wire-impossible fake
    events. Neither can show the 26% sentinel breaks or a real 41 s gap,
    the two behaviours the honesty rules exist for. The rules are
    unit-proven; the RENDERING of them has never been looked at. Fix by
    replaying a committed capture into a capture fixture.
  - **The phone→server→`series` column path is proven only in CI and on
    the laptop.** The 2026-08-19 phone leg posted into a prod schema that
    predated migration 0011. Prod now carries the column
    (`server/db/schema.ts:191`); one phone session logged and then read
    back through `GET /api/logs/:id` settles it, and the walk above
    produces exactly that for free.
  - **The tule-fog "upgrade the pin to an oracle" idea is CLOSED, and
    should not be reopened** (James, 2026-08-20: "that was just a visual
    bug"). The exit pass suggested asking whether a recording of that
    session survives, per the spec's own "asked, not assumed" clause.
    Asked and answered: only the prod DB row survives, it predates series
    capture so carries no trace, and — the actual point — the pin does
    not want one. Read the test (`summaryModel.test.ts:1704`): it hands
    the model three targets and three actuals and asserts blue rows at
    −2.1/−2.6/−3.5. That checks a RULE James ruled on (judge each row
    against its own target, ±0.5s band), not a number against the
    machine. Tule-fog's actuals were never in dispute; the baseline the
    colour was computed from was. A recording would answer "did our
    actuals match the erg" — a real question, covered elsewhere, and
    never this bug. **Being a regression pin rather than an oracle is
    CORRECT here, not a weakness to fix.**

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
**Riding follow-ups (PM gate 2026-08-19):** ~~`pnpm e2e -- -g` needs the
double-dash form documented (pnpm swallows bare -g)~~ **CORRECTED, Phase
WU close (2026-08-22): the double-dash form does not fix it — `pnpm e2e
-- -g "pattern"` still silently runs the FULL suite; pnpm swallows `-g`
even after `--`. The working form is `pnpm exec playwright test
--grep`.** See Phase WU's "What this phase taught" note below. A
frozen-clock
screenshot fixture (17 captures churn on wall-clock date stamps) —
**scope note (trace-truth Task 2 review, 2026-08-20): freezing the
wall-clock date alone will NOT fix this.** A second, independent churn
source lives in `e2e/helpers.ts`'s own `RUN_ID` (`Date.now()` + a random
suffix, baked into every generated e2e user's email via
`signInViaBackdoor`), which changes on EVERY run regardless of calendar
date — confirmed on `you-derive-offer.png`: the string itself differs
AND its own rendered LENGTH varies run to run (the exact sub-mechanism
is not yet isolated — `RUN_ID`'s own two components are each
nominally fixed-length in the current era, so the wrap is either a rarer
edge case in one of them or a third source not yet found), which
reflows the whole page wherever that email renders — measured at 26,327
pixels differing across 13 row bands down to y=527, not a localized
diff. **The fixture fix must neutralise the identity's own printed
LENGTH (a fixed-width stub, not merely a frozen value) or the reflow
keeps happening even once the string is otherwise deterministic; isolate
the exact length-varying sub-mechanism before assuming a frozen `RUN_ID`
alone fixes it.** **DONE 2026-08-20 (trace-axis PR, grouped item G2):**
`RUN_ID` now builds both halves to a PROVABLY fixed width — the
timestamp is `padStart`-ed to 13 digits rather than trusted to stay
there, and the random suffix is built one character at a time
(`randomBase36(6)`) rather than sliced off `Number.prototype.
toString(36)`, whose own spec (ECMA-262) guarantees only the shortest
round-tripping string, not a minimum length — the length-varying
sub-mechanism this note above says was "not yet isolated" either was
that slice or is now moot regardless, since the new construction cannot
vary. The wall-clock date-stamp churn (17 captures) is a SEPARATE,
still-open source. Covers both sources or captures will keep re-churning
after it ships; `judge()`'s
documented-unreachable dead-even branch (discriminated union if a second
producer appears); the live summary's judged-state capture (closed by
this PR's C1 recapture — verify at close).
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

## Phase JR — Just Row (observe the machine's own free row)

**Status:** Spec at rev 2 (phase-open gates run 2026-08-24: antagonist
anchor pass, 12 findings folded; PM GO-WITH-CONDITIONS, all conditions
landed). Implementation waits behind Phase RC's wave; the capture walk is
its own erg session, James-scheduled.
**Spec:** `docs/superpowers/specs/2026-08-24-just-row-design.md`
**Goal:** A rower taps Just Row on Today, the app connects and OBSERVES the
PM5's own native Just Row — no program, no targets, no baseline required.
Done in the app, Menu on the erg, or the monitor's own idle power-off ends
it; the machine's numbers are offered to the log screen and the row lands
in history marked `JustRow` (Concept2's own enum word).

- [ ] **PR 0a — the observe-only instrument.** No app path connects
      without programming (the interstitial auto-programs on pairing), so
      the capture walk needs a dev-only observe mode first: connect,
      subscribe (0x0037-0x003A included), record, never program. Capture
      leg is the laptop/Chrome web arm (the byte recorder composes there
      only). **S/M**
- [ ] **PR 0b — the capture walk** (hardware, own session, James
      schedules). Closes the spec's seven OPENs — headline question:
      do 0x0031 elapsed/distance RESET at the PM's 5-minute auto-splits
      (if yes, a naive observer stores ~5 minutes of a 30-minute row).
      Capture becomes PR 2's replay fixture. **S (erg time)**
- [ ] **PR 1 — every stored shape (TRIAD, tagged BEFORE PR 2 — the R-A
      read-side-first discipline).** `session_logs` branch (`steps: []`
      iff JustRow, `workoutType` closed to the known set), the new
      `ended_by: idle` enum member (migration), plan refusal both halves
      (client posts `advancesPlan: false` AND server refuses for
      JustRow — the server's default advances today), the unknown-type
      badge fallback (today it degrades to 1.11:1 invisible text), the
      MonitorRun additive `mode` field. Full antagonist pass + PM
      final-PR gate. **M**
- [ ] **PR 2 — surface + session + log door (L; after RC's wave and PR
      0b's answers).** `/justrow` route + lean observer surface/hook
      (intent+motion detection, no workout-type sniffing — falsified by
      our own captures; no re-open after Ended, guarding the PM's
      auto-rearm housekeeping; coexistence guard; rebuilt session
      concerns priced in), the NEW workout-less log door (no existing
      route fits a null-workout run), Today recovery routing, the
      series-recorder key fix. Tested against PR 0b's capture. **L**
- [ ] **Exit walk:** both screens in one photograph, ended once by Done
      and once by Menu; the comparison is a TRANSCRIPTION check (our
      number IS the PM's counter transcribed) — the one derived number,
      avg split, is checked by arithmetic from the photographed
      time/distance; the Done-ended row's PM entry is expected LONGER
      (coast-down), recorded as a delta, not a disagreement.

Six frozen per-PR exit criteria live in the spec (plan `done_n`
unchanged, cross-version badge render, empty-steps rendering, link-drop
recovery, honest close reasons, coexistence guard). Release call: PR 2
is the first taggable tester surface (MINOR); PR 1 tags read-side-first
at patch level; notes owe "a Just Row never advances your plan".

## Phase LM — When the monitor is lost, say so and stop lying about it

**Opened 2026-08-25**, straight out of the walk that reproduced a tester's
report first try (`docs/monitor/sessions/walk-2026-08-25/`, finding W-10).
Scoped by James to all three defects together after he was shown the frame:
*"the LOST isn't easy to notice, i think we need to highlight that more."*

**What happened. CORRECTED 2026-08-25 by the antagonist anchor pass — the
first diagnosis was wrong and the corrected one is narrower and sharper.** A
tester connected, programmed a workout, tapped "Show me the numbers", locked
the phone and pocketed it, rowed, then hit End, and concluded the recording was
lost. It was never STARTED. The app opens a record only when it sees the first
pull — `createMonitorRun` has one call site (`useMonitorSession.ts:1681`) inside
the `phase === "ready"` gate — so locking before that pull leaves the phase in
`ready` forever, creates no record, and gives End nothing to close
(`closeRecord:1477` returns on `run === null`). The file's own comment at
`useMonitorSession.ts:988-990` describes this verbatim, and **this ROADMAP
already recorded the mechanism at `:3271` from James's own 2026-08-24 tester
report** — the phase was opened without reading it.

The row then saves through the MANUAL door (`monitorModeRun` null →
`LogSession.tsx:1578`), whose POST carries neither `deviceName` nor `endedBy`,
so the stored row reads **LOGGED BY HAND** — which is exactly what a vanished
recording looks like from the outside.

**The three defects, which are one story.**

1. **The screen looks like a session in progress when it is not.** The panes
   paint live-LOOKING numbers off fall-through frames while the phase is still
   `ready`, and the only contrary signal is `· LOST` in small mono text beside
   the erg's serial. James asked for that to be louder, and he was right for a
   sharper reason than he was given: those numbers are not stale readings, they
   were never readings at all.
2. **The banner promises something false.** "Row on. The erg is still counting
   and End keeps what we saw" is true whenever we saw anything, and a lie in
   the one case that costs a workout — where we saw nothing. Copy that is
   reassuring in proportion to how bad the situation is.
3. **The saved row poses as hand-logged.** The rower rowed and we did not hear
   them; neither of those is "logged by hand". **But the fix is NOT a
   `LINK LOST` source label** (anchor pass, and this was revision 1's biggest
   hole): `sourceLabel` answers "where did these numbers come from" while
   `endedBy` answers "how did this close", and they agree only on the
   zero-measured case. On a link dropping after 3 of 4 intervals, a `LINK LOST`
   source would stamp failure over genuinely PM5-measured rows and delete the
   one signal saying they came off the machine — the mirror shape in display
   clothing. `LINK_LOST_LINE` (`storedSummary.ts:874`) already carries the close
   reason for rows that have data.

**TRIAD weight** — defect 3 changes what a stored row claims about itself, so
this gets the full antagonist pass on its spec and a PM final-PR gate,
regardless of how small the diff turns out to be. Note the stored row currently
has `ended_by = NULL` (the manual door never posts it), so fixing the STORED
record — not just the live screen — is a write-path change, and the spec makes
the PR say which of the two it did.

**The research was ALREADY DONE and is not owed again** — this is the second
correction the anchor pass forced. `docs/superpowers/research/2026-08-20-ble-connection-management.md`
plus James's ruling at `:2095-2130` settle it: **"The recommendation is CORRECT
RESUME, not a background mode."** The obstacle is WebKit's WebContent
throttler, whose runnable set is *visible, audible, capturing*, and **nothing in
that chain reads `UIBackgroundModes`** — so a background mode buys "the link
stays up" and never "we keep logging the row". Keep-awake is likewise already
done (`ConnectedInterstitial.tsx:283`, spanning the whole connected flow since
2026-08-11), so this was a MANUAL lock and no wake-lock work would have helped.
**PR 2 is correct resume.** Any proposal for `UIBackgroundModes` is re-opening a
closed ruling and needs James, not a research pass.

**What is genuinely unknown** and must not be asserted in any copy or PR body:
whether the zero came from frames never arriving (WebKit suspended) or frames
arriving and the ready gate refusing them (it needs `rowingActive` AND
increasing distance). `pm5-interface-notes.md:4663` records a 15-20 s lock NOT
dropping the link, with the session resuming ticking on unlock — so the platform
explanation is not even complete. PR 1's Task 1 instruments this rather than
guessing, because PR 2's shape depends on the answer.

**Three open questions, ANSWERED 2026-08-25 as PR 1 was built** (this list
documented current state and had gone stale):

- *Should a zero-measured connected session offer "Log against plan" at all?*
  **Yes, and undemoted** — James's ruling: the rower did the work, only our
  recording failed. All three exits stay, `Log against plan` leads. Pinned by
  a test in `LogSession.test.tsx`, not left to the shared component's defaults.
- *Should the rower be warned BEFORE locking rather than after?* **Yes** —
  PR 1's ready-screen warning (spec Task 2).
- *Should a lost link mid-piece be recoverable by reconnecting?* Still **PR 2**
  (correct resume). Unchanged.

**Status: PR 1 implemented and reviewed; BLOCKED ON THE WALKS** (James,
2026-08-25: "Have the walks block"). Exit criteria 9 and 10 are unmet until the
phone walk and the two-build probe run. Nothing in this phase is complete on
merge.

### Phase LM — owed work

Checkboxes, because this section ran 140 lines with none, and its own defect had
to be filed into Phase RC's backlog for want of a home here. Caught at #198's PM
gate.

- [ ] **LM PR 2 — correct resume**, per James's 2026-08-20 ruling ("CORRECT
      RESUME, not a background mode"). Blocked on PR 1's §D1e probe: the
      never-started case falls OUTSIDE that ruling's scope, which is the whole
      reason the probe exists. Do not start before the probe reports.
- [ ] **The stored row still reads `LOGGED BY HAND` for a connected session
      that opened no record — permanently and unbackfillably, for that row and
      every earlier one.** PR 1 took option 2 knowingly. **This is a knowing
      exception to James's 2026-08-18 ruling that the same fact must not read as
      two different words live versus from the log**, and the strongest argument
      against option 2 is that the divergence is PERMANENT — so it gets a
      trigger, not merely a record. **Trigger: the `door` column lands with the
      NEXT stored-shape change to the logs table.** The argument that settles
      the original call, worth reusing: a row that UNDER-claims is a recoverable
      false negative, while a row posting a best-effort last-used `deviceName`
      over a session that measured nothing is a false positive indistinguishable
      from a real measurement, and would poison the very audit that counts how
      often this fires.
- [ ] **The in-flight interval's metres are DISCARDED on a mid-row link loss,
      and `Nothing kept.` is honestly reporting it.** Filed at #198's PM gate,
      which checked rather than accepting the "cosmetic" label:
      `measuredIntervalCount` counts COMPLETED intervals, `closeRecord` records
      no partial, tier-B heroes need actuals. **On a SINGLE-interval workout —
      the tester's own 2000 m "Beam Sea" — any mid-row loss gives `kept = 0`
      beside a nonzero greyed counter.** That is not an oddity to note on walk
      leg B; it is the MAJORITY outcome of leg B. Say explicitly whether PR 2's
      correct resume recovers those metres; if not, that is a product decision,
      not an implementation detail.
- [x] **The diagnostics row never renders on a device's FIRST EVER
      connected session, and no hardware walk can catch it.** FIXED by
      fix-round-2 Task 3: `MonitorLogRow` now re-reads the stash once in a
      post-mount effect, which React runs AFTER the outgoing subtree's
      passive cleanup in the same commit, so the teardown's write is seen
      without a remount. The connected-arrival gate is unchanged (the
      re-read goes through the same `readMonitorLogStash(fromMonitor)`), and
      a session that already had a stash at mount renders exactly as before.
      Pinned by two tests that drive the REAL navigation ordering rather
      than seeding storage and mounting: a first-ever-device hand-off that
      must show and copy the row, and a by-hand arrival that must still show
      nothing when a teardown writes while it is on screen. **The
      walk-protocol trap below still stands** — a walk on a much-connected
      phone would have passed either way, so the ordering test is the only
      thing that proves this, and any walk card claiming to exercise the
      never-rowed readout must still say which device state it ran on.
      (Was RC-20; re-homed to Phase LM at #198's PM gate — it is Phase LM's own component, found by Phase LM's own fix round.) Found by Phase
      LM's fix round, verified independently at its re-review, and filed rather
      than fixed at the time because it was pre-existing (shipped by Task 1) and
      narrower than the PR that found it. **The mechanism, kept because it is the
      class rather than the instance:** `MonitorLogRow` read the stash in a
      `useState` LAZY INITIALIZER only — no effect, no storage listener, no
      re-read — while `useMonitorSession`'s `teardown` is a passive `useEffect`
      cleanup, and React runs the new route's render BEFORE the outgoing
      subtree's passive cleanup. So on a genuine first-ever connected session
      there was no prior entry at mount, the row rendered `null`, and it never
      got a second chance; Task 1's promise (diagnostics reachable on a phone in
      the never-rowed case) held only from the SECOND connected session onward.
      **A test that seeds storage and then mounts cannot see this** — it
      exercises the already-working path, which is why every unit test was green.
      **The walk-protocol trap is the important half, and it is why this got
      its own row rather than a line in a PR body:** every walk this project
      runs happens on a phone that has connected dozens of times, so **a walk
      will PASS while a brand-new tester gets nothing.** Validating this case
      needs a factory-reset-equivalent device state, not merely "has not rowed
      this session". That is the same verify-the-app-against-itself shape as
      recurring failure #11. Any walk card claiming to exercise the
      never-rowed readout must say which device state it ran on.
- [ ] **`rowingActive` is falsified but not dangerous — one test and one
      diagnostic are owed, no behaviour change.** Walk 2026-08-26 read
      0x0031's byte 9 `false` on every frame of a real row (§20 fact 13,
      corrected). Task 2 enumerated all six production consumers; **four need
      nothing at all**, and the two that carry the predicate are:
      - **The ready gate's fallback works and is pinned.** It is the only
        consumer where a stuck byte can lose data, and it already carries
        `ROWING_ACTIVE_FALLBACK_FRAMES`. Deleting `frame.rowingActive` from
        `declared` (`useMonitorSession.ts:1747`) fails three tests. **Stated
        cost, accepted:** the fallback opens the record ~5 frames late, so
        that walk's record opened at the machine's own `elapsed=24.03 /
        distance=32.9` and `seriesRecorder` missed the row's first metres.
        The stored per-interval actuals come from 0x0037/0x0038 and are
        unaffected.
      - **`surfaceModel.ts:915`'s `midSessionMirror` conjunct is UNPINNED, and
        this is the actual owed work.** MEASURED, not inferred: deleting
        `frame.rowingActive === false` from that predicate leaves **5357 tests
        and 191 test files green**. Its own guard test says in a comment that
        it isolates the DISTANCE half; nothing isolates the other half. The
        degeneration is cosmetic — the predicate widens to distance-only, so
        the heroes read `0:00.0 / 0` for the first metre of an interval
        instead of clearing on the first pull, self-clearing in ~1 stroke —
        which is why **no behaviour change is proposed**. Owed: one test that
        pins the byte half (a `rowingActive: true` frame inside the reset
        window must NOT mirror), and a reconciled comment.
      - **Owed diagnostic, and it is the thing that would settle the
        question:** the ring stores only the decoded boolean, and
        `pm5/parse.ts:608` is a strict `rowingState === 1`, so any non-1 value
        reads `false`. Raw `0x0031` ring lines fire on terminal states only.
        **The next occurrence still will not tell us whether the machine said
        Inactive or said something we do not decode.** Carry the raw byte in
        the `frame` / `rowing-active-fallback` entries, or require a
        `.jsonl.gz` recording on any walk re-testing this.
      - **Not owed, stated so it is not re-derived:** `parse.ts:608` is the
        producer; the three log entries (`driver.ts:2517`,
        `useMonitorSession.ts:1768`, `:2868`) are diagnostics with no
        behaviour attached; `surfaceModel.ts:312`'s `NO_FRAME` is a constant.
        `seriesRecorder.ts` never reads the field, so **no stored data depends
        on this byte**.

**OWED, and deliberately not built in PR 1: the STORED row for a
never-started connected session is still wrong.** PR 1 took the design
spec's Task 4 **option 2** — fix the live screen, leave the stored row —
and this is the record of what that costs and of the analysis the next
attempt should start from rather than redo.

- **What ships in PR 1:** the end-of-session summary for a `?from=monitor`
  arrival with NO record reads `NO MONITOR READING` in the SOURCE slot instead of
  `LOGGED BY HAND`, and takes the workout's own target hint instead of
  `BY FEEL`. The predicate is deliberately narrow — `from=monitor` AND no
  record in storage at all — because the other three `monitorModeRun` miss
  conditions leave a record that may hold real PM5 readings we simply cannot
  render, and claiming "no reading" over those would not be earned.
- **What stays wrong:** the saved row keeps reading `LOGGED BY HAND` on the
  history screen, permanently and unbackfillably, for this row and every
  earlier one. It is not wrong about its NUMBERS (`TARGETS ONLY · NOTHING
  MEASURED` is exactly true); it is wrong about the DOOR. The live screen and
  the stored screen therefore disagree for this one case, which is a knowing
  exception to the 2026-08-18 copy ruling that the same fact must not read as
  two different words live versus from the log (`storedSummary.ts`'s SOURCE
  INFERENCE header carries the exception, at the place the ruling lives).
- **Why not option 1, and what a future attempt must not re-derive.** Making
  the stored row honest needs a NEW stored field plus a migration; neither
  existing candidate works. `endedBy` would assert a close reason for a record
  that never existed (a sixth enum value, and `buildLinkLostLine`'s deliberate
  equality check would render it invisibly anyway); `deviceName` IS reachable
  (`loadLastDevice()`, `ConnectedInterstitial.tsx:57`, written on every pair at
  `:321` — the "unknowable" claim was itself false and is corrected here), but
  it is a best-effort LAST-USED name rather than this session's authoritative
  device, and posting it would make the stored row assert that a named erg
  supplied numbers that came off nothing — a STRONGER false claim than
  `LOGGED BY HAND` — while granting it a wall-clock `timeLabel` the live screen
  never shows. Worth keeping, because the spec first rejected `deviceName` for a
  DIFFERENT
  reason ("claims PM5 provenance for numbers that came off nothing") that
  **already describes shipped behaviour**: a monitor-door row whose record
  exists but measured nothing posts `deviceName` today and renders
  `PM5 <name>` with the targets-only caption. So the provenance objection is
  not the one that kills it here; the missing data is.
- **The shape a future spec should weigh:** a narrow nullable column
  carrying exactly "this row came through the connected door and holds no
  monitor reading", versus the broader and better-modelled `door` column the
  from-the-log spec's own SOURCE INFERENCE note already wishes existed. The
  second would retire an inference this repo has flagged as a hack, and would
  change what EVERY row claims — its own spec, not a tail task. Either way
  the timeLabel gate in `storedSummary.ts`'s `buildMeta` (currently keyed on
  `sourceLabel !== "LOGGED BY HAND"`) has to be re-derived positively, or a
  third bucket silently gains a wall-clock reading the live screen never
  shows.

## Bugfix rounds

Ad hoc fix rounds outside the phase sequence — small bundles of device
reports and quick fixes shipped as their own PR rather than waiting on the
next phase. One line per round, newest first.

- **SHIPPED (2026-08-24, the honest-empty / one-control round — James's
  report): an unset baseline now LOOKS unset, and one control does both
  entry jobs on all three baseline surfaces.** Two defects in one change.
  (1) `SplitInput`'s `seconds` was non-nullable, so a baseline the rower
  had never entered rendered the app's own seed as the field's VALUE in a
  saved number's accent ink; the only unset marker was an 11px line shown
  when BOTH sides were null, so a half-set account got no marker at all.
  An unset side is `null` end to end now, renders EMPTY with the seed as
  an `--ink-4` placeholder (5.29:1 on `--surface`, computed), and the
  first ± tap materialises that seed exactly. (2) Entry affordances were
  split — the You editor and door 2 typed only, door 1's adjust step
  nudged only — so `you/BaselineField.tsx` is now the one control
  everywhere (`[−][typable split][+]`, the house `Stepper` visual,
  settle-then-nudge, `aria-disabled` dead ends, a polite live region).
  `BaselineRow` and `.onb-field-box` retired. **Review fix, same day:**
  the new empty field and the existing derivation offer are two
  suggestion mechanisms that met on one row and disagreed (placeholder
  2:25.0 above a button offering 2:23.0), and a single stepper tap
  materialised the generic seed — a value that is not the offer's — which
  made the estimate unreachable and wrote the seed as `manual`. An
  offer-eligible side now takes the offer's value as its seed. Also
  fixed: the live region kept stale text after a Discard and then went
  SILENT on the next identical announcement (a polite region fires on a
  DOM mutation, and React bails on an unchanged string), so an
  announcement is now bound to the value it names. **QUEUED, found while
  shipping it:** the derive slot's inert line still reads `ESTIMATED ·
  TYPE TO ADJUST` — true but now half the story, since that same field
  nudges. The brief froze the derive slot, so the copy was left alone
  deliberately; it is a words-only change (two e2e assertions and one
  client test name it) and belongs to the next PR that touches the You
  editor. **ALSO QUEUED:** door 1's adjust step shows a PROPOSED number
  with no provenance eyebrow of its own — the offer step it came from is
  the only place the fill's source is named. Fine today; revisit if that
  step ever becomes reachable without passing the offer.

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

- **A READ IS LOST IF YOU LEAVE AN ARTICLE BEFORE ITS READ-STATE GET
  LANDS** (found 2026-08-21 by the flake hunt, by REPRODUCING the flake
  rather than re-running it). **This is an app bug, not a test bug, and
  the test that catches it is right.**
  `Reader.tsx`'s mark-read effect fires only when
  `reads.state === "ready"` — deliberately, so it has a `markRead` to
  call. But an article's PROSE IS STATIC and renders instantly, while the
  read state waits on a network GET. So the whole screen can be up and
  readable while `reads` is still loading, and a rower who taps BACK in
  that window unmounts the Reader before `markRead` is ever called. **The
  read is silently dropped — permanently.** Reproduced under load: the
  News unread count held `7 UNREAD` against an expected `6` across 13
  polls over a full 5 s timeout, i.e. it never converged, because nothing
  was ever written.
  **The existing barrier does not cover this.** `useArticleReads.ts`'s
  read-after-write barrier (2026-08-12) fixes the OPPOSITE direction — a
  new screen's GET overtaking an in-flight PUT — and its own comment
  records that same lesson ("the test was right, the app was racing").
  It cannot help when no PUT is ever issued.
  **NOT fast path** — the failure mode is a lost record, which the fast
  path explicitly excludes. Wants a spec: the honest fix is probably to
  mark on unmount as well as on ready, or to issue the write from a
  layer that outlives the screen, and either choice needs the
  does-it-exist question asked of the offline/failed-PUT case.
  **Until it is fixed, `news.spec.ts:140` will flake under load — and it
  SHOULD. Do not make that test wait the app's race away; that would
  delete the only thing telling us about this.** **Trigger:** next News
  or article-reads work, or sooner if a tester reports a read not
  sticking. **M**
- **An e2e fixture that exercises a REST** — spec
  `2026-08-20-est-left-design.md`'s exit criterion 6, recorded HALF MET
  rather than reworded. The fake reports Rest Time honestly and
  `FakeStatusEvent.restSeconds` is scriptable, but no e2e or screenshot
  fixture drives `state: "resting"` with a scripted rest value, so the
  countdown-through-a-rest behaviour is proven only at the replay layer
  (a real capture through the production driver) plus a DOM-level wiring
  test. The PM gate ruled that sufficient for MERGE and the fixture a
  follow-up — recorded here because it lived only in the spec and a PR
  body, which is recurring failure 14's seventh occurrence in eight
  gates. **Trigger:** the next work touching the connected surface's e2e
  fixtures. **S**
- **HUNT THE E2E FLAKES — James, 2026-08-20: "post release lets hunt down
  the flake".** Scheduled work, not a footnote. There are at least TWO
  distinct recurring flakes and every prior sighting was disposed of the
  same way — "passed on re-run" — which is how a real race stays alive for
  months. **What is known, so nobody re-derives it:**
  - **The manual-door tap-target flake.** Recurred across multiple gates
    during Phase LT (PR #129's own record: "isolated-rerun-confirmed each
    time"), and again on 2026-08-20 during PR #144's gates: one run at
    **399/401 with a non-zero exit, then 401/401 twice on re-run.** A
    failure that reproduces across unrelated diffs and months is a race in
    the app or the harness, not noise.
  - **The `design.spec.ts` layout-settling flake** (`stableBoundingBox`,
    `:1677`/`:1697`) — already recorded under Phase CR2 as wanting "a
    tracked fix rather than another per-task footnote". Same disposition,
    same outcome. Fold both into one hunt.
  **Why it matters beyond annoyance:** a suite that goes red for reasons we
  have taught ourselves to ignore is a suite whose red has stopped meaning
  anything. Today the controller had to decide, live, whether a 399/401 was
  a regression or the known flake — and got it right only by re-running
  twice. The next person may not, in either direction.
  **First moves, cheapest first:** capture the actual failure (Playwright's
  trace/video on retry, which CI may already be discarding) rather than
  re-running until green; check whether the failures cluster by worker
  index or by ordering, which separates a harness race from an app race;
  and only then reach for the code. **Trigger: immediately after v0.15.0
  ships.**
- **CLOSED 2026-08-20 (PR #144, measurement recorded) — `intervalRestTimeSeconds`
  agrees with the PROGRAMMED rest in every committed capture, so no stored TIME
  hero is wrong.** The open question (raised the same day by the fake-vs-parser
  audit, `docs/monitor/fake-vs-parser-audit.md`) was whether `summaryModel.ts`'s
  TIME hero, which sums work seconds plus **programmed** rest for completed
  intervals (R-D), is understating or overstating sessions where the machine's
  own settled rest differed. It does not: `0x0037` offsets 12-13 decoded across
  every completed interval in every committed wire recording — 14 records over
  5 sessions — report exactly the programmed value, to the second.

  | capture | programmed rests | `intervalRestTimeSeconds` decoded |
  | --- | --- | --- |
  | `walk-2026-08-16/session-1-keystone-2x250r0.jsonl` | r0, r0 | 0, 0 |
  | `walk-2026-08-16/session-2-wu-4unequal.jsonl` | r0, r30, r30, r30, r0 | 0, 30, 30, 30, 0 |
  | `walk-2026-08-17/step-2-*.jsonl` | r0, r0 | 0, 0 |
  | `walk-2026-08-17/step-3-*.jsonl` | r0, r30 | 0, 30 |
  | `walk-2026-08-18-metrics/pyramid-*.jsonl.gz` | r1, r1, none | 60, 60, 0 |

  The mechanism behind the agreement is the one the item guessed: on a
  PM5-programmed interval workout the machine ends the rest itself, so there is
  no rower behaviour that can move the number. **Nothing is owed** — no
  migration, no release note, no correction to a stored hero. The field stays
  decoded and unconsumed on purpose; wiring it would add a second source for a
  number that already has a correct one. **Re-open only if** a capture ever
  shows a divergence (a manually-ended rest, a JustRow split, a firmware that
  reports the elapsed rest rather than the settled one).
- **The connected bar's fill and its notches are two axes on DISTANCE work,
  and the estimate holds still for seconds at each handover** (measured
  2026-08-20 at PR #144's PM gate; accepted and documented, `docs/design/
  DEVIATIONS.md`'s third EST LEFT row). `estElapsed` banks each completed
  phase's PROGRAMMED length while `intervalBoundaries` re-anchors its notches
  to the MEASURED ones, so a rower off target sees EST LEFT and the bar stand
  still into the rest — **6.6 s and 20.8 s** on the pyramid capture, pinned by
  `surfaceModel.test.ts`'s "the DISTANCE-work limit, measured on a replay".
  **The obvious repair was replayed and does not work:** banking measured
  seconds changes nothing, because the PM5 emits an interval's 0x0037/0x0038
  boundary record at the END of its rest, so the finished interval's actual
  does not exist during its own rest. Neither does `frame.elapsedSeconds`
  survive the rest coast (78.64 -> 88.67 -> 84.88 within one rest, same
  capture). **Trigger:** a spec that wants the countdown and the notches on
  one axis — it needs a wire source for the just-finished interval's work
  time that arrives AT the boundary, and finding one is the first task, not
  an assumption. TRIAD weight (it changes what a number means): full
  antagonist pass on that spec.
- **23 citations across 11 tracked files point into `.superpowers/`, which
  is git-EXCLUDED and therefore unreachable to everyone except the session
  that wrote it** (found 2026-08-20 at PR #141's PM gate, which caught three
  such citations in that PR and required them replaced; the remaining 23 are
  pre-existing and out of that PR's scope). `.git/info/exclude:7` excludes
  `.superpowers/`, so `docs/superpowers/sdd/` does not exist and never did —
  the SDD workspace is per-session scratch by design. Affected files include
  `app/src/monitor/driver.test.ts`, `docs/TESTING.md`,
  `docs/monitor/pm5-interface-notes.md`, and eight plans and specs.
  **Why it matters rather than being tidy-up:** every one of these was
  written as the AUTHORITY for a claim — a measurement, a ruling, a
  rejected alternative — and a reader who follows it finds nothing, which
  is indistinguishable from the claim being unsupported. The #141 gate's
  own phrasing: a dangling citation is worse than no citation, because it
  reads as evidence. **The durable authority for a measurement is the TEST
  that pins it**, or a committed capture, or a ledger entry — never a
  scratch report. **Trigger:** the next time any of those files is opened
  for another reason, fix the citations in it; or one sweep if someone
  wants the whole set gone. Do not create `docs/superpowers/sdd/` to make
  the paths resolve — the scratch genuinely should not be committed.
- **An EXTERNAL oracle for the trace: the PM5's own internal log, and the
  logbook** (James, 2026-08-20, from the erg: "there's a verification id
  that the pm can give you for a row. Is checking if we can derive the
  same verification id a way to validate our logbook traces are
  correct?"). **The verification hash itself is NOT the lever** — it is a
  workout SIGNATURE the PM5's firmware produces, and ErgZone's own issue
  #117 closes the question in as many words: the workout-signing
  cryptographic hash is one "we simply can't create (nor should we)". It
  proves the machine's record was not tampered with en route to Concept2;
  recomputing it is what it exists to prevent, and succeeding would only
  prove we hashed the numbers we already hold.
  **What the question DOES point at, and it is valuable** — this repo's
  standing weakness is recurring failure 11, verifying the app only
  against itself:
  - `CSAFE_PM_GET_INTERNALLOGPARAMS` (0x99) plus
    `CSAFE_PM_GET_INTERNALLOGMEMORY1/2/3` (0x6A) read out the machine's
    own stored log, whose structure identifiers include `LOGSPLITDATA`
    and the fixed/variable interval headers. That is an independent check
    on our accumulator's BOUNDARIES and TOTALS, obtainable after the fact
    with no rowing. **Hard limit, and it is decisive:** the identifier
    list is exhaustive and contains **no per-stroke or per-sample
    record**, and the logged-workout size field is 2 bytes — so it can
    never validate the 1 Hz SHAPE, only the boundaries the shape hangs
    on.
  - A Concept2 logbook entry, for any session that goes up via ErgData,
    carries authoritative splits at zero cost to us.
  - **Cheap and worth taking whenever we next touch subscriptions:**
    characteristic **`0x003F`** notifies the just-logged workout's hash,
    internal log address and size after every workout. **We do not
    subscribe to it** (we hold `0x0031`-`0x003A`). Storing that hash
    beside our own log verifies nothing by itself, but it makes our
    record LINKABLE to a logbook entry later — which is the
    "spendable to logbook" question James asked when the series format
    was designed.
  **Deliberately NOT in the trace-truth spec** (2026-08-20): a new
  subscription plus a new CSAFE conversation, on a spec already carrying
  triad weight. **Trigger:** the next work that touches monitor
  subscriptions or CSAFE, or the first time a trace's correctness is
  disputed and our own corpus cannot settle it.
- **App icon redraw** — **MOVED to Phase PROD** (James, 2026-08-20),
  where the corrected description lives. Correction worth keeping here so
  it does not come back: the arc is NOT misspelled. It reads ERGOMATIC;
  the rabbit's ear covers the final C. This entry asserted "ERGOMATIO"
  for weeks and it was repeated into a phase plan before James corrected
  it — nobody had opened the PNG. Verify artwork by looking at it.
- **Apple sign-in**: required the moment a build goes to EXTERNAL TestFlight or the App Store (guideline 4.8; internal TestFlight is exempt). Works with the existing openid-client stack (ES256 client secret, form_post callback, name/email on first auth only); design the allowlist story for private-relay emails first.
- **Apple Health (HealthKit)**: when workout data should flow to Health — write rowing workouts (distance/duration/energy) from the iOS shell; needs entitlements + privacy strings; plugin choice re-verified at build time.
- **Concept2 Logbook sync**: post-workout cloud import; only compelling if ErgData-during-row becomes a habit.
- **Parametric workout generator**: "generate me a 45' AT workout" from the library's authoring rules — the differentiator a static book can't match. Trigger: after Phase 6 makes workouts rowable end-to-end. **Trigger FIRED** — Phase 6 (6A–6D) closed the full card→log loop, both doors, real completion; this is now eligible to schedule, not just a standing intention. Its structural-reference loading is now DONE: Phase 6E's offline pipeline produced `app/domain/generation/patterns.json` (per type×duration-band interval-shape frequencies, work:rest ratios, pace-offset distributions, spm bands, warm-up conventions, rep-count ranges — aggregates only, no titles/prose/per-workout rows, per the content policy), the exact fixture this generator would consume. Phase 6F's UI-fix round is done too, so nothing sits ahead of it in the queue any more — not started, but eligible to schedule now, not just eligible in principle.
- **"Which days did I override, and what was the other suggestion?"** (James, 2026-08-12, during the plan-prescriptions design). Two different questions wearing one sentence. The CHECKPOINT half needs no new capture at all once Phase 8B stamps `plan_key`/`done_n` on each log: a prescription is authored, deterministic data — though NOT from the log's own `workout_title` as this entry originally said: `workout_title` is a save-time snapshot, pre-rename logs carry `First 2k` forever, and the sound method is `plan_index ∈ {6,34,62}` via the columns PW already shipped (corrected at the 2026-08-22 gate). The FREE-FORM half — what the ordinary suggestion would have been on a day the rower shuffled away — is genuinely not backfillable, because `suggest()` depends on the account's preferences and every entry's recency at that instant. It is also NOT one column: the suggestion in force lives on Today, and reaching the save means a new field on the versioned `SessionDraft` localStorage record plus every `buildDraft` entry point that never sees Today at all (Library, WorkoutDetail, BaselineCard, the manual log door). Priced accordingly here rather than smuggled into a checkpoint phase as "two nullable columns." **Trigger:** James wants the retrospective screen, not the column. Then design the screen first, and let it say which of the two questions it is actually asking.
- **A third prescription producer and a real precedence hierarchy** (James, 2026-08-12). Phase 8A ships one producer (the plan) called from one place, so precedence is a comment, not a mechanism. **Trigger:** a second producer becomes real (8C's reservations are the likely first). Then introduce the resolver that orders them, with an asserting test, and settle what a displaced tier does — see 8C's own re-decide item.
- **Retire `LEGACY_TITLE_RENAMES`** (the 8A seed rename map). Permanent code the moment it lands. **Trigger:** every deployed environment has booted past the rename, so no WORKOUTS row can still carry `First 6k`/`First 2k`. Scope corrected at the 2026-08-22 gate: `session_logs.workout_title` is a save-time snapshot and keeps the old spelling FOREVER — the trigger is about the workouts table only, and any query over historical log titles needs both spellings permanently.
- **Harden the post-save offer against the library-loading race** (filed
  2026-08-23 after the flake fired on three branches in one day): when the
  library is still loading at save time, `LogSession` honestly reads "not
  the designated test" and navigates to Today before the post-test offer
  renders — under e2e load this flakes `post-test-prompt` captures and
  `retest.spec` prompt waits, and on a slow real device it can eat a real
  rower's offer. The fix is product-shaped (await the library read before
  deciding, or re-offer on Today), not a test tweak — there is no UI
  signal a test could await today. **Trigger:** next PR touching the
  post-save flow, or the flake reaching CI red. **S/M**
- **Row without a baseline set** (James, 2026-08-23, during BL PR C): a
  no-baseline account can currently browse and row effort-ref workouts, but
  split-ref workouts gate on `needsBaselines` and lose their targets — James
  wants EVERY workout rowable with no baseline: targets simply absent, and
  the set-your-baseline reminder surfaced the way the no-baseline state
  does today. Interaction worth holding: this deliberately softens the
  "half-functional limbo" his option-C ruling rejected at the doors
  brainstorm — the doors stay the fast path to a FULLY working app (targets,
  suggestions, estimates), but nobody is ever blocked from just rowing.
  Touches `needsBaselines` gating, the timer/judge target-less rendering,
  and the reminder's surface. **Partially delivered by Phase JR** (2026-08-24): the "nobody is ever
  blocked from just rowing" half ships as the connected Just Row door; the
  every-workout-targetless half remains this follow-on. **Trigger:** James
  schedules it.
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
- **Remove the `PULL TO RESUME` block** — CROSS-NOTE 2026-08-22: James
  also observed the band FLASHING for a split second at flywheel-gated
  work-interval starts (fully extended at the catch when the interval
  opens). **§2b's suspected mechanism was FALSIFIED, not fixed:** Task 2
  replayed all 6 committed captures through the real driver and found zero
  PAUSED firings at any post-rest work-interval start — the existing
  `distanceMeters<=0` guard already excludes that case, so there was
  nothing to suppress and no speculative fix shipped. The flash's real
  mechanism is still unexplained; the walk card's capture ask (Task 5)
  is the way it gets settled — copy the connection log immediately if it
  recurs during a walk. The removal this entry wants remains separate and
  is strengthened by the report regardless of cause.
  Original entry: **Remove the `PULL TO RESUME` block** (James, 2026-08-17: "we never got
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
