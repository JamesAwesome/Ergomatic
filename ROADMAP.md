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

| Area | Decision |
|---|---|
| Name | **Ergomatic** in UI and docs (design files say "Erg Log") |
| Architecture | Server-backed SPA: React 19 + Vite 8 client, Express 5 API, TypeScript, ESM, pnpm |
| Data | PostgreSQL 18 + Drizzle ORM; per-user data throughout |
| Offline | Active session (timer state, in-progress log) persists in localStorage; reload or dropped connection never loses a workout; log save syncs to the API |
| Auth | Google OAuth (authorization code flow) only at launch; self-hosted cookie sessions in Postgres; no auth SaaS |
| Local enforcement | husky + lint-staged — pre-commit: lint + typecheck on staged files; pre-push: full test suite |
| CI | GitHub Actions: install → lint → typecheck → coverage-gated tests → build → docker build (push: false) |
| Tests | Vitest three-project setup: unit (node), client (jsdom + Testing Library), integration (Testcontainers Postgres); enforced coverage thresholds |
| Deployment | Full CD: push to main → self-hosted runner → SSH deploy script → health-gated auto-rollback (nataliesawacritter pattern) |
| Hosting | Docker Compose (hardened: read_only, cap_drop ALL, non-root) fronted by a Cloudflare tunnel behind a compose profile |
| Time display | House time format is elastic positional: seconds always shown, an hour group only when nonzero, the leading group never zero-padded — `0:45`, `20:00`, `1:05:00` (`domain/duration.ts`, Phase 5F). Totals stay unit-labelled (`302 MIN`, `302′`), which is what keeps a colon value's meaning unambiguous |

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

- [x] Drizzle schema + migrations: baselines, workouts + steps, session logs (with frozen paces), plan progress, preferences, test history — all per-user *(migration infrastructure + users/sessions landed in Phase 2; this item adds the domain tables)*
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

**Follow-ups (not blockers, recorded at merge):** DUR field width clips long distances (`42195m`); the `×N` stepper keeps its value after the block is cleared; no unsaved-changes guard when leaving the builder; re-importing after a partial bulk failure re-submits the blocks that already landed; `design.spec` sweeps only the blank builder, not the bulk panel or the edit screen; the bulk endpoint inserts blocks sequentially without a transaction (now UI-reachable for the first time).

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

**Locked decision:** the house time format above is now the app-wide
convention for any duration display, not a builder-only affordance.

**Deferred, not forgotten:** MAX/MIN effort references (a `PaceRef` beyond
`2k`/`6k`) are **Phase 5G** — they ripple through `resolveSplit`, validation,
the bulk grammar and the seeded library, and this phase was scoped to stay
client-side. The library's custom-workout badge/filter (surfacing a rower's
own authored workouts distinctly from the starter library) is **Phase 5H**.

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

**Deferred, not forgotten:** the library's custom-workout badge/filter
(surfacing a rower's own authored workouts distinctly from the starter
library) is still **Phase 5H**.

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
`server/stores/logs.ts`'s `create` bumps `plan_state.done_n` on every
`POST /api/logs` call, wired since the Phase 4 schema work, well before this
UI existed. 6C's job was the log-writing screen that calls the existing
route, not new plan-advancement plumbing (found while seeding e2e fixtures
for Phase 6A Task 5 — seeding 3 logs against a freshly-chosen plan advanced
`doneN` to 3, not 0, the first time it was tried).

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
might be using. One seam was left unspanned at the time this phase closed:
no single browser session ran the WHOLE arc card→log in one continuous
test, each hand-off was its own proof instead. That gap is now closed —
Phase 6D's own `today.spec.ts` "the type-swap loop" test drives exactly
that continuous session in one page (Today's suggestion card → Start →
Confirm → SKIP the countdown → the live run → complete → Log → Save →
back to Today), the first (and so far only) e2e in the repo to do so.

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

**Next:** a **UI-fix round** (exact targets replace the range displays; a
drop-X on Today's unlogged line; a discard option on SessionComplete; SHUFFLE
full-width) — in flight on its own `ui-fix-round` branch, ahead of the
workout-generation phase below — then Phase 7's PM5 integration.

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
      (`server/seed/seed.ts`) reconciles the shared global library to the
      code's set inside one advisory-locked transaction: no globals →
      insert; the running title-set already matches → no-op; anything else
      → swap (delete all globals, insert the current 300) — called once at
      boot, not per-user. The swap nulls `session_logs.workout_id`
      (`ON DELETE SET NULL`) — logs keep their rows and lose the workout
      link; accepted at TestFlight scale, called out in the PR. Personal
      (non-global) workouts are structurally untouched: globals are
      structurally un-editable (the store's `update()`/`remove()` only ever
      match rows scoped to a `userId`, never `user_id IS NULL`), so there is
      no "edited-seeded" state for the swap to distinguish or mis-swap
- [x] Fixtures across the client/server test suites re-anchored from the
      retired 35-workout set to real entries in the 300 (e.g. "Fork
      Lightning" for the effort-ref `0:30 @ MAX` shape, "Hoarfrost" for the
      warm-up-then-split-ref shape, "Filling Low" for the reps-expanded
      distance shape, "Sea Fret" for the first-sorted global)

**Exit:** MET — new and existing accounts alike see the same generated
300-workout global library; the seed reconcile is idempotent (an unchanged
set no-ops on a second boot) and swaps cleanly when the code's set changes;
personal workouts and their logs are structurally unaffected by a swap.
Pending: James's review of the generated batch and PR approval before merge
(normal SDLC — no merge without it).

**Next:** the deferred UI-fix round above, then Phase 7's PM5 integration.

## Phase 7 — PM5 over Bluetooth

**Status:** Not started
**Goal:** A connected erg makes workouts richer; an unconnected one loses nothing.
**Research:** `docs/superpowers/research/2026-07-27-pm5-ble-research.md` (C2 Rowing Service: no pairing, subscribe-only; Web Bluetooth = Chromium-only).

- [ ] `pm5/` client behind a **transport interface**: Capacitor BLE transport (iOS native shell — the PRIMARY path; `@capacitor-community/bluetooth-le` mirrors the Web Bluetooth API) + Web Bluetooth transport (desktop Chromium for dev/laptop use; also covers Android browsers if that door ever opens) + mock transport for tests — one client, three transports
- [ ] Vendored/adapted from `ergarcade/pm5-base` (MIT, dependency-free, active); plain Rowing Service characteristics, no CSAFE
- [ ] "Connect PM5" on Confirm targets, shown only where a transport is available; manual NEXT always remains; disconnect mid-workout degrades silently to manual
- [ ] Live actual pace vs target range + live stroke rate vs prescribed SPM in the timer; distance steps auto-advance
- [ ] Per-step actual splits logged with `actualSource:'pm5'`
- [ ] Full behavior tested against the mock transport in CI; one live-hardware verification on the real erg is the exit gate

**Exit:** On the real PM5: distance steps auto-advance, live pace shows against target, the log holds monitor-measured splits — and pulling the batteries mid-interval leaves the workout finishable by hand.

## Phase 8 — Plan & Progress

**Status:** Not started
**Goal:** See where you are in the 84-session plan and whether you're getting faster.

- [ ] Plan screen gains a month calendar with type marks, ALL/TO DO/DONE filters, and a legend (session rows: done sorted below upcoming; today highlighted) — layered onto the sequence list Phase 6A already built at `/plan`, not a new screen
- [x] ~~Plan management: preset selection (2000 m sprint / 5–6 k head race), reset-to-session-1~~ — **delivered early in Phase 6A** (`/plan`'s preset cards, Reset, and Switch), since Today needed an active plan before this phase's own turn came up
- [ ] Progress screen: 2k/6k test trend bars (longer = slower, delta callout), minutes/week stacked by type, type mix, last-30-days
- [ ] Test history list on **You**; test-type sessions prompt a baseline update

**Exit:** Logged sessions appear on the calendar and in every chart; a logged 2k test can update the 2k baseline through the staged-confirm flow.

## Phase 9 — Preferences & You completion

**Status:** Not started
**Goal:** The suggestion engine and session flow honor per-user preferences.

- [ ] Suggest-workouts-at difficulty chips + time-available cap, live "N of M match" readout, feeding Today and clearing `todayPick`
- [ ] Default warm-up length + "override library warm-ups" (staged)
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

## Bugfix rounds

Ad hoc fix rounds outside the phase sequence — small bundles of device
reports and quick fixes shipped as their own PR rather than waiting on the
next phase. One line per round, newest first.

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
- **PM5 workout programming (CSAFE)**: push intervals onto the monitor so the erg counts down itself — revisit after real-world Phase 7 use (~3-5 days, same BLE connection, Control Service).
- **Concept2 Logbook sync**: post-workout cloud import; only compelling if ErgData-during-row becomes a habit.
- **Parametric workout generator**: "generate me a 45' AT workout" from the library's authoring rules — the differentiator a static book can't match. Trigger: after Phase 6 makes workouts rowable end-to-end. **Trigger FIRED** — Phase 6 (6A–6D) closed the full card→log loop, both doors, real completion; this is now eligible to schedule, not just a standing intention. Its structural-reference loading is now DONE: Phase 6E's offline pipeline produced `app/domain/generation/patterns.json` (per type×duration-band interval-shape frequencies, work:rest ratios, pace-offset distributions, spm bands, warm-up conventions, rep-count ranges — aggregates only, no titles/prose/per-workout rows, per the content policy), the exact fixture this generator would consume. Still queued behind the UI-fix round (ROADMAP's Phase 6D "Next" line), not started — what remains is the runtime generator itself, not the data it would draw from.
- **Library export/import (private JSON)**: household members share their own transcriptions. Trigger: second active rower asks for it.
