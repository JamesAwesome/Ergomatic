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
logs are structurally unaffected either way. Pending: James's review of the
generated batch and PR approval before merge (normal SDLC — no merge
without it).

**Next:** the deferred UI-fix round below (Phase 6F), then Phase 7's PM5
integration.

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

**Next:** a follow-on round collapsing Today's own filter chips into the
same sheet pattern (below), then Phase 7's PM5 integration.

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

**Next:** Phase 7's PM5 integration. The parametric workout generator
("Triggered follow-ons" below) is now unblocked — Phase 6E's
structural-reference pipeline already produced its fixture data — but not
yet scheduled.

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
below — both deliberately not this phase's scope. Phase 7B's PM5 connected
surface remains unscheduled.

## Phase 6I — Today onboarding

**Status:** Not started
**Goal:** A brand-new rower with no baseline gets taught the app from
Today itself, not from a screen they have to find.
**Design authority:** `docs/design/handoffs/2026-08-07-news-tab/README.md`
decisions 6 and 7.

- [ ] A dismissible `START HERE` four-step block at the top of Today, a
      44px DISMISS target in its header; read steps go grey and lose their
      unread square
- [ ] Until a baseline exists, Today's suggestion card reads
      `SUGGESTED · SETS YOUR BASELINE` (6k by default, `2K INSTEAD`
      secondary) instead of a real workout pick; the baseline chip is
      dashed, reading `6K BASELINE · NOT SET`
- [ ] A `Learning the app` settings row on You (`START HERE · N OF 4`)
      opening a detail screen with `PUT IT BACK ON TODAY` (restores the
      block, keeps read state) and `MARK ALL FOUR UNREAD` (also resets read
      state)
- [ ] News's own Pinned Stories gains the `Start here` pin once dismissed
      on Today, showing `N OF 4 READ · DISMISSED ON TODAY` — the row
      `DEVIATIONS.md` already tracks as sequenced here

**Sequencing constraint:** deliberately after Phase 7B's own `Today.tsx`
guard-wiring touch — landing onboarding's Today changes first would mean
7B rebasing its guard wiring across this phase's edits instead of the
other way around.

**Exit:** A fresh account with no baseline is walked to a set baseline
without ever leaving Today; dismissing and resetting the tutorial from You
round-trips correctly.

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

**Status:** Done (2026-08-05, PR #TBD)
**Goal:** The PM5's protocol, a workout compiler, a runtime driver, and the
localStorage-side session record all exist and are heavily tested — no
screen changes (deliberately deferred to 7B). Live radio proof was
originally deferred too, but `phase-7a-fix` (below, 2026-08-05) ran the
driver against a real PM5 before this phase's own PR merged — see
"Hardware-verified — partially, not fully" further down for what that
did and did not establish.
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
      CSAFE ack/reject response parser (`response.ts`) — every byte cited
      against the primary CSAFE/BLE PDFs; three checksum errata and one
      unresolved candidate documented rather than guessed
      (`docs/monitor/pm5-interface-notes.md`)
- [x] `domain/monitor/program.ts`: `compileProgram`, turning a confirmed
      session's phases into the PM5's variable-interval IR
      (`WorkoutProgram`/`ProgramInterval`) or a typed, copy-ready
      `CompileError`; Table 19's parameter limits re-verified against the
      primary PDF
- [x] `domain/monitor/types.ts`: the normalized seam every consumer above
      the codec sees (`MonitorCapabilities`/`MonitorFrame`/`IntervalActual`/
      `MonitorEvent`/`MonitorDriver`), plus the `Transport`/
      `DiscoveredMonitor` radio abstraction three later transports satisfy
- [x] `src/monitor/driver.ts`: the runtime driver — ack-gated write
      sequencing with a pending-ack queue for coalesced BLE notifications,
      the state machine with terminal-state latching (Appendix E's
      auto-cycle never un-finishes a session), an optional tick-driven
      ack-timeout policy, and `intervalRemaining`'s computation, rooted on
      0x0033's own Last Split Time/Distance fields; `src/monitor/
      transports/fake.ts` simulates a real PM5 end to end for CI
      (byte-for-byte programming verification, six injection hooks)
- [x] `src/monitor/monitorRun.ts`: the monitor-driven session record
      (`MonitorRun`, localStorage, mirroring `session/run.ts`'s idiom), the
      cross-clear rule (creating a `MonitorRun` clears any `SessionRun`),
      and `anyLiveSession()`'s coexistence truth table (9 cells, pinned) —
      Today's stale-draft discard gains a live-monitorRun exception, this
      phase's one permitted UI touch
- [x] `src/monitor/transports/capacitorBle.ts`
      (`@capacitor-community/bluetooth-le`) and `src/monitor/transports/
      webBluetooth.ts` (`navigator.bluetooth`): thin `Transport` adapters
      for the two real radios, compile-tested shapes, deliberately excluded
      from the coverage gate alongside `src/native/**` — no BLE radio
      exists in CI to prove either one against
- [x] `docs/monitor/pm5-interface-notes.md` gains a §17 "laptop session
      runsheet" consolidating every doc-ambiguity or reviewed-assumption
      flagged across the phase into one numbered checklist, and (after the
      session below) a §18 recording what was actually observed against
      real firmware

**Deferred, deliberately — 7B/7C's job:** no screen wires a `MonitorDriver`
to anything yet — no "Connect PM5" affordance, no live pace/rate on the
timer, no PM5-sourced log entries, no reverse cross-clear (a phone-timer
session starting does not yet clear a stale `MonitorRun`). The remaining
open §17 items (below) still need a further James-device row — a
James-device event, not a CI gate, and not required for 7A's own exit.

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

**Hardware-verified — partially, not fully (phase-7a-fix, 2026-08-05).**
This domain has now met a real PM5: laptop session 1, then a same-day
diagnosis row, both run against the `pm5-lab` harness + bridge before this
phase's own PR merged. The codec's bytes were right; the fake's MODEL of
the machine was wrong in five ways no document states and no test could
catch, all found and fixed in `phase-7a-fix` (own plan:
`docs/superpowers/plans/2026-08-05-phase-7a-fix.md`): **D1** a REJECTED
program WIPES whatever workout was already loaded — CONFIRMED destructive,
observed twice — but the simple rule that first explained it ("the PM
accepts a program only when nothing is loaded") is NOT equally confirmed:
a later hardware session found `terminate()` ACCEPTED with a workout
loaded, yet the FOLLOWING program was still rejected — twice. The state
model behind accept/reject is still not understood; only the destructive
half is, and the real clear command remains unfound; **D2** a `0x01` ack
does not mean a program landed —
`program()` now clears, sends, and verifies against the machine's own
reported state instead of resolving on the ack alone; **D3** the PM
attributes rests FORWARD into the interval they're heading toward — the
driver now normalizes every machine index to this codec's own numbering
before any consumer sees it; **D4** only one `intervalComplete` fired for
a two-interval program (the first boundary's data arrived but was
discarded) — fixed by waiting for both status halves of the same boundary
before emitting; **D5** the no-belt heart-rate sentinel is `0`, not `255`
as documented for a different characteristic — `parse.ts` now maps both to
`null`. **This is not a claim of full verification.** One short row
(`docs/monitor/pm5-interface-notes.md` §17, "The pending verification
row") is prepared to confirm these five fixes against real hardware but
has not been run yet, and several §17 items stay open regardless (the real
clear command, whether an accepted program's structure reads back from
0x0031, the no-rest work→work boundary index, and distance-kind/
multi-frame programs from a known-empty machine — none of the last group
has ever been tested without a loaded workout confounding the result).
Every hardware claim above cites `pm5-interface-notes.md` §18 as an
observation, never as something Concept2 documents.

> **CORRECTION (2026-08-06) — most of those five were OURS, not the
> machine's.** Three research passes validated the hardware observations
> against Concept2's own CSAFE spec, the C2 PM SDK, and every open-source
> PM5 implementation that could be found; the record is
> `docs/monitor/pm5-interface-notes.md` **§19**. The root cause:
> `app/domain/monitor/pm5/response.ts:72` decides accept-vs-reject with a
> whole-byte comparison against `0x01`, but the CSAFE status byte is a
> BITFIELD — bit 7 (`0x80`) is a frame-count toggle, bits 4-5 (`0x30`) are
> the previous-frame status, bits 0-3 are the slave state. `0x81` is an
> ACCEPT. Decomposed correctly, **not one status byte in either hardware
> session was a rejection.** Consequences for the five defects above:
> **D1** is WITHDRAWN — "accepts only when nothing is loaded" was invented
> to explain an alternation that was the toggle bit, and "a rejection wipes
> it" has no rejection left; what emptied the monitor's display that day is
> now unresolved (§19.2). **D2** is WITHDRAWN as stated — identical bytes
> producing `0x01` and `0x81` is the toggle, not the machine changing its
> mind; the clear→send→verify design stays for a different reason (§19.2,
> §19.6). **D3** stands and is the one genuinely undocumented PM5
> behaviour on the list, but its SCOPE was wrong: laptop session 2
> (2026-08-06) showed forward attribution at a no-rest work→work boundary
> too, so `intervalIndex.ts`'s rest-keyed rule is wrong there (§19.8).
> **D4** stands (a real ordering/coherence defect, unaffected). **D5**'s
> observation and fix stand, its stated reasoning does not — the sentinels
> ARE documented per-field, and mapping both to `null` is a defensive
> choice a shipped library also makes (§19.9). Also corrected: the PM5 does
> NOT go quiet after a workout — it parks in `WorkoutLogged` and answers
> throughout; our own terminal latch produced the silence, and Appendix E
> documents the recovery path we were not using (§19.4). The fixes are
> Phase 7A-fix-2's job, below.

## Phase 7A-fix-2 — the status bitfield, and what it invalidates

**Status:** Code complete (Tasks 1-6, commits `0d0af28`..`fcb7a4c` on
`phase-7a-monitor-domain`). **The merge-gate row has RUN** (2026-08-06,
laptop session 3 — `docs/monitor/pm5-interface-notes.md` §17, "The
merge-gate row (session 3, RUN 2026-08-06 — results in §18)"; §18's
session-3 heading records Expected-vs-Observed for all five steps, all
PASSED, plus item 15 (ANSWERED)). The row's own live bisect surfaced a NEW
defect outside this phase's own scope — programming over a RUNNING workout
arms structurally empty (`docs/monitor/pm5-interface-notes.md` §19.13) —
scoped to its own follow-up, Phase 7A-fix-3, below; it does not reopen any
bullet in this phase. **The merge decision remains James's, not automatic
on the row having run.** **Heart-rate verification joined this
row** (owner addition, whole-branch fix wave, 2026-08-06): James's Apple
Watch is now paired to the PM5 as its HR source, so Steps 2 and 4 also
observe live `heartRateBpm` and the actuals' `avgHeartRateBpm` PRESENT for
the first time — every prior observation was the no-HR-source `0` sentinel
(§19.9). This verifies one device link (watch); the belt path and
`CSAFE_PM_GET_HRM` stay future.
**Trigger:** FIRED — `docs/monitor/pm5-interface-notes.md` §19 (2026-08-06)
established that the CSAFE status byte is being parsed wrongly and that
several conclusions recorded as PM5 behaviour were consequences of that
parse. Documentation is corrected; the code now matches it.
**Authority:** `docs/monitor/pm5-interface-notes.md` §19 for every citation
below. Nothing here is a new hardware finding — it is the fix list §19
generated, now shipped.

- [x] **The status bitfield.** `app/domain/monitor/pm5/response.ts` masks
      instead of comparing: accept `(status & 0x30) === 0x00`, reject
      `(status & 0x30) === 0x10`, `bad`/`not-ready` for the other two
      previous-frame values, `status & 0x0F` the slave state, `status &
      0x80` the frame toggle (never tested for failure), bit `0x40`
      reserved. `REJECT_STATUS_BYTE` is retired. `CsafeResponse` gained a
      `kind: "unparseable"` member for a garbled frame, distinct from a
      genuine reject — today's conflation is the bug §1 of the design spec
      names. `buildAckFrame` and the fake synthesise all four frame
      statuses, any slave state, either toggle, and echo opcodes. Vectors
      per previous-frame-status value, per slave state, both toggle
      polarities. Task 2 (§19.1).
- [x] **Re-derived D1/D2 from the raw traces.** The 34-row per-send table
      (§19.1) decodes every captured/narrative status byte in both
      sessions: zero of the twelve RAW bytes was a rejection. D1 is
      WITHDRAWN — the display-emptying `:00` transition stays an open
      finding (Verdict (a), STANDING OPEN, not re-explained as fact); D2's
      framing is WITHDRAWN but what it was protecting survives via the
      documented OFFLINE slave-state mechanism (Verdict (c)); and
      program-over-loaded WORKS (Verdict (b) — corrected in the whole-branch
      fix wave, 2026-08-06: the observed rest-free row followed a reconnect
      and a second rest-0 send, not an unbroken rest-30→rest-0 chain on one
      connection, so the conclusion holds on a weaker argument than
      originally stated; the clean single-connection observation is still
      pending, §17's merge-gate row Step 3). Task 1 (§19.1/§19.2).
- [x] **The terminal-latch recovery.** The monitor never stops responding;
      on completion it parks in `WorkoutLogged` and leaves via the Menu
      button or a terminate command ([CSAFE-DEF] Appendix E). `activeRun`
      is opened by `program()` and only by `program()`; a terminal state
      closes that run while every subscription stays live — frames keep
      flowing after `workoutComplete`, `program()` works again with no
      reconnect, and a boundary arriving outside an open run emits
      `index: null` plus a `boundary-out-of-run`/`terminal-out-of-run` log
      entry, and a program replacing an open run's own logs `run-replaced`,
      rather than either corrupting a closed run's actuals. Task 4 (§19.4).
- [x] **The no-rest interval rule.** `domain/monitor/pm5/intervalIndex.ts`
      applied forward attribution only on the resting side; laptop session
      2 read `0x0037` = 1 against `0x0033` = 0 at a work→work boundary with
      `restSeconds: 0`. Done by Phase 7A-fix-2 Task 5: `toActualIndex`
      applies the offset unconditionally for 0x0037/38 (`IntervalActual.index`),
      clamped within the explainable range `[0, L+1]` and `null` + a forked
      `"divergence"` entry outside it; 0x0033's own `toProgramIndex` stays
      rest-keyed. The `index-unverified` trace entry is RETIRED — the kind
      no longer exists (§19.8, §17 item 13).
- [x] **`sendPrepare` replaces the clear step.** `program()` still leads
      with a terminate-shaped step, re-justified as the documented
      `WaitToBegin` recovery path (not a "clear" — nothing clears; terminate
      re-arms the same workout, §19.5) rather than deleted; its refusal is
      swallowed as routine (`"prepare-rejected"`), broadened from
      nak-or-timeout to anything but a confirmed disconnect. Task 3.
      **Carried finding (§17 item 15, Task 7 close-out):** the refusal's
      own hardware citation turns out to be an uncaptured byte — see the
      merge-gate row below.
- [x] **`SetScreenState` is asynchronous.** Its ack means "queued", not
      "done" ([CSAFE-DEF] p.65). `terminate()` waits the documented ≥1 s
      fallback delay (a tick bound, no wall clock) rather than polling
      `CSAFE_PM_GET_SCREENSTATESTATUS` — that poll needs the pull path,
      which this drop does not build (unconfirmed wrapper; §17 item 14)
      (§19.6).
- [x] **`GetErrorType` on a genuine reject.** A workout-configuration
      reject is atomic and NOT self-describing — the master must issue
      `GetErrorType` to learn why ([CSAFE-DEF] p.50). `sendGetErrorType`
      fires ONE `buildGetErrorType()` on a genuine `"nak"`, bounded by
      `errorTypeTicks` so an unconfirmed pull-path wrapper cannot hang the
      call forever, and logs the raw hex reply with no decode claim — the
      decode itself still waits on §17 item 14 (the pull-path GET, not yet
      sent). Task 3 (§19.7).
- [x] **The fake and the driver stopped modelling the withdrawn behaviour.**
      `src/monitor/transports/fake.ts` accepts-and-replaces instead of
      rejecting-when-loaded, toggles bit 7 on every response frame, varies
      slave state (`ready`/`offline`/`in-use`), echoes opcodes in its acks,
      and can script a genuine `0x11` reject or a garbled frame (each
      marked synthetic/never-observed). `driver.test.ts` no longer pins D1
      by name. Task 6.

**Exit:** every bullet above has a passing test (2282 all-projects / 111
files, e2e 210 — Task 6's count, unchanged by Task 7's docs-only close-out);
no test encodes a whole-byte status comparison; §18/§19's corrected record
and the code agree. **The merge-gate row
(`docs/monitor/pm5-interface-notes.md` §17's five steps, James-operated) has
RUN (2026-08-06, laptop session 3), and §18 records Expected-vs-Observed for
each step — all five PASSED, and item 15 is ANSWERED alongside it.** The
row's own live bisect found a new, scoped-out defect (Phase 7A-fix-3,
below) that no bullet in this phase claimed as in scope. **PR #52 leaves
draft until James gives explicit approval** — the row having run is
necessary, not sufficient, and the merge decision is his, not this
commit's.

## Phase 7A-fix-3 — program over a live piece

**Status:** Done except session 4b. Design approved (adversarial review,
2026-08-06); Stage 1 (instrumentation, the settle, the fake's honest
empty-arm model) and Stage 2 (the structural readback, the
`"structure-mismatch"` rejection) both SHIPPED — Tasks 1-5, commits
`5d42e01`..`78a949c` on `phase-7a-fix-3` (2334 all-projects, e2e 210; full
detail: `.superpowers/sdd/2026-08-06-phase-7a-fix-3/progress.md`). **Session
4a has RUN** (2026-08-07, James-operated, ~6 min) and answered item 12
outcome (a) unanimously — the ternary tripwire did not fire, so Stage 2 was
built as designed, not redesigned (`docs/monitor/pm5-interface-notes.md`
§18, "SESSION 4a"). **Session 4b — the two-row detection test — has NOT
run**; §18's own "SESSION 4b (PENDING)" scaffold holds the empty result
slots.
**Trigger:** FIRED — the merge-gate row's own live bisect (2026-08-06,
laptop session 3, `docs/monitor/pm5-interface-notes.md` §18 "Live bisect",
§19.13). Two unrelated program shapes (`program-many`, 25×100m no-rest, 7
frames; `program-short`, 3×500m r60, 1 frame) each armed structurally
EMPTY — `verifyArmed` PASSED, every frame acked, the monitor showed `:00` —
the one time each was sent while the target machine was still `rowing`.
Seven other sends of six different shapes (single-variable and paired, from
a settled/armed-idle machine) all armed correctly, isolating the variable
to machine STATE, not program CONTENT.
**Repro recipe:** terminate a workout that is currently mid-piece (state
`rowing`/`resting`) by sending `program()` again immediately — its own
internal `sendPrepare()` terminate-shaped step fires while the machine is
still live, and the send that follows is accepted, verified armed, and
structurally empty.
**Authority:** `docs/monitor/pm5-interface-notes.md` §18 (laptop session 3;
SESSION 4a) and §19.13 for the finding; §17 items 5/12/15/16/17 for what it
does and does not close.

- [x] **Remedy A — settle after a mid-session terminate.**
      `program()`'s `sendPrepare()` step now waits, when the prepare's
      terminate fired while the machine was `rowing`/`resting`, for the
      documented Appendix E auto-cycle to reach `armed` (WaitToBegin) plus
      one further tick — `DriverOptions.prepareSettleTicks`, defaulting to
      10, its own `pendingPrepareSettle` slot, tick-bounded (not a wall
      clock). Session 4a measured `"armed" observed on tick 4"` twice at
      the exact repro, confirming the budget with room to spare. Common-path
      latency unchanged: the wait only arms when the prior state was
      `rowing`/`resting`. Task 2 (`5d42e01`→`6fd2636`/`9421033`).
- [x] **Remedy B — item 12's structural readback, as detection.**
      `verifyArmed` (`src/monitor/driver.ts`) now resolves only on a fresh
      post-send tick that is `armed` **AND** whose 0x0031 structure fields
      match `expectedArmedStructure(p)` (`pm5/commands.ts`, sharing the
      encoder's own constants). A mismatch rejects with
      `ProgramRejectionReason: "structure-mismatch"` after 3 consecutive
      armed ticks reporting the SAME wrong structure (a payload still
      changing restarts the count — session 4a's own captured mid-cycle
      transients are why), or at `verifyTicks`' outer bound, which now
      DEFAULTS to 20 instead of meaning unbounded (an unbounded verify
      under a structure predicate turned a caught defect into a hang).
      Session 4a's per-shape readings (§18) are what this predicate was
      built from, not a guess. Task 4 (`970bf26`/`a7ac619`).
- [x] **Removed the fake's idle-terminate refusal (§17 item 15).**
      `src/monitor/transports/fake.ts`'s `onClearingFrameComplete` accepts a
      bare idle terminate unconditionally now; the refusal survives only
      behind the explicit synthetic `FakeScript.refuseNextPrepare` hook
      (`injectNak`/`failNextProgramFrame`'s pattern) — real hardware never
      refused it (§18 session 3, §17 item 15). Task 3 (`e92cee9`/`50eae9b`).
- [x] **Revised `sendPrepare`'s doc comment.** `src/monitor/driver.ts`'s
      `sendPrepare` comment no longer claims hardware showed the PM refuse
      an idle terminate; it states the swallow-as-routine behaviour on its
      own terms (ANY non-disconnected prepare outcome is swallowed, by
      design) and cites the retirement directly (§18 session 3 item 15;
      §19.4/§19.5). Task 3.

**Exit: MET (2026-08-07).** Green (2335 all-projects — the whole-branch
wave's MED-1 test joined after this line was first written — / e2e 210)
**+ session 4b RUN with both rows PASS (§18 session 4b: the settle's third
tick-4 arm; a real PM5 caught by the readback — typed `structure-mismatch`
on a live empty arm) + James's explicit approval given.** Session 4b was
necessary, not
sufficient on its own, and the merge decision is his — same discipline as
every prior hardware gate in this document. Session 4a resolving cleanly
(outcome (a), no redesign) means this phase's own remedies ship
UNCONDITIONALLY on 4b, not on a further design pass; 4b is validation, not
another decision point. Whether this also resolves session 1's still-OPEN
Verdict (a) (`:00`/`:00` empty display, §19.1/§19.2) is a hypothesis §19.13
now treats as its leading candidate, not a fact 4b needs to confirm before
merge.
**Parked for the whole-branch reviewer** (not blocking, not this phase's
own exit — full list with sources: `.superpowers/sdd/
2026-08-06-phase-7a-fix-3/progress.md`, "Parked minors"): a byte-for-byte
duplicated test helper (`stillArmedEmpty`/`stillArmedAtZero`,
`driver.test.ts`); three LOW-severity comment/instrumentation nits from
Task 2's review (a timeout-not-assertion latency pin, the settle not
logging its own configured bound, an undocumented off-by-one in the bound's
inclusivity).

## Phase 7B — PM5 connected surface

**Status:** Done (2026-08-08, Tasks 1-8, Task 8 close-out this entry) — the
core exit criterion below is met; this section's own bullets were never
checked off as Tasks 1-7 landed them, so this update reconciles the
checklist against shipped reality in one pass rather than pretending the
phase is still "Not started."
**Goal:** A rower can actually connect a PM5 from the app and row against
it — the screens 7A's domain was built to sit underneath.
**Design:** returned to design for the connected surface's own handoff,
reconciled against 7A's shipped types before this phase starts.

- [x] "Connect PM5" affordance — shipped as `WorkoutDetail`'s `ConnectAction`
      button (not literally "on Confirm targets," the plan's own original
      wording — the handoff moved it to the workout DETAIL screen instead,
      ahead of Confirm, `ConnectedInterstitial.tsx`'s own header), gated on
      `resolveDefaultTransport()`/`navigator.bluetooth` availability
      (`src/monitor/transports/index.ts`); manual NEXT remains untouched;
      disconnect mid-workout degrades to `"disconnected"` phase, never a
      crash
- [x] Live actual pace vs target + live stroke rate vs prescribed SPM —
      shipped as `ConnectedSurface`'s three panes (Timer/Live/Grid,
      `src/workout/connected/`), fed by `useMonitorSession`'s `frame`
      events; distance steps auto-advance on `intervalComplete`
      (`toActualIndex`'s forward-attribution rule, `domain/monitor/pm5/
      intervalIndex.ts`)
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
- [x] The reverse cross-clear direction: `buildRun`/`saveRun`
      (`session/run.ts`) clears an existing live `MonitorRun` the same way
      `createMonitorRun` already clears a `SessionRun` — 7A shipped only
      its own half (`src/monitor/monitorRun.ts`'s own header comment names
      this as a documented 7B obligation)
- [ ] **The James laptop-vs-real-PM5 session named above has now run
      TWICE** (laptop session 1, plus a same-day diagnosis row; laptop
      session 2, 2026-08-06, both under the OLD whole-byte status parse —
      recorded in `docs/monitor/pm5-interface-notes.md` §18) **and been
      re-derived once from the raw bytes without new hardware**
      (phase-7a-fix-2 Task 1, §19.1's per-send table). Rewritten against the
      current record, session-by-session claims no longer stand:
      - The checksum errata, the interval-numbering base, and
        multi-INTERVAL programming remain ANSWERED.
      - **No clear/wipe command exists, and none is missing.** §19.5
        relabelled this DOCUMENTED ABSENCE: `terminate()` is not a failed
        clear candidate, it is the documented `WaitToBegin`/Rearm recovery
        path, and nothing in either source document unloads a programmed
        workout.
      - **Programming over a loaded workout lands and replaces it**
        (§19.1's Verdict (b)) — corrected in the whole-branch fix wave: the
        observed rest-free row followed a reconnect and a second program
        send, not an unbroken single-connection chain, so this rests on a
        weaker argument than originally claimed; the clean single-connection
        confirmation is still pending (§17's merge-gate row, Step 3).
      - **The no-rest work→work boundary index is ANSWERED** (§17 item 13,
        §19.8): indices are driver-normalized minus-1, applied
        unconditionally by `toActualIndex` for 0x0037/38, clamped to
        `[0, L+1]` with `null` + a `"divergence"` log entry outside it.
      - **The `:00`/`:00` empty-display transition remains STANDING OPEN**
        (§19.1's Verdict (a)) — not explained, not re-explained as a
        rejection-wipe artifact (that mechanism was our own parse bug).
        Laptop session 3's live bisect (§19.13) found a REAL, hardware-
        confirmed mechanism that produces the identical `:00` symptom
        (programming over a running workout arms empty) and is now
        Verdict (a)'s LEADING candidate explanation — not independently
        confirmed as the same root cause, so Verdict (a) itself stays open.
        7B's "confirm the monitor idle before programming" connect-flow
        warning re-founds on this open finding plus its new leading
        candidate, not on the withdrawn destruction claim.
      - Distance-kind intervals and a genuine multi-FRAME program landed
        on real hardware (§17 item 5's merge-gate Step 5) — but that send
        happened to land on a running workout and armed structurally empty
        (§19.13), so "does a full multi-frame DISTANCE program retain all
        its intervals when rowed to completion from a clean state" is
        STILL untested; it needs its own row, not a re-run of Step 5.
      §17's operative row, "The merge-gate row (session 3, RUN 2026-08-06 —
      results in §18)," has run: all five steps PASSED, item 15 is
      ANSWERED, and results are recorded in §18's session-3 heading. Its own
      live bisect opened Phase 7A-fix-3 (above) as a separate, scoped
      follow-up — this phase's own guard/connect-flow work should read that
      phase's repro recipe before assuming "confirm idle" is sufficient on
      its own.
- [x] Full behavior tested against the fake transport in CI; the laptop
      session above is this phase's live-hardware verification, never a CI
      gate — Task 8 closes this out: `e2e/connected.spec.ts`'s browser-
      driven walk (Connect → pairing → programming → ready → the surface
      via rail AND swipe → paused → resumed → End → the log screen, both
      390×844 and 844×390) plus 2812 passing unit/client tests
- [ ] **A failed `program()` during an OPEN run leaves the old run open and
      numbering.** `driver.ts`'s `program()` runs `sendPrepare()` →
      `sendSequence()` → `verifyArmed()` and only replaces `activeRun` at
      the end (`driver.ts` ~1770), after all three phases resolve. If any
      of them throws while a run is already open (probe P3b, phase-7a-fix-2
      Task 4's review), that run stays open: the next boundary is still
      normalized against the FAILED program's own run, and it still emits
      its own `workoutComplete` later. This is pre-existing (the prior
      `let program` variable was equally never cleared on a failed
      re-program) and was deliberately parked, not fixed, in fix-2 — its
      original rationale ("the wipe is confirmed for a genuine reject
      only") cited `program()`'s destructive-fact comment, which fix-2
      Task 1 WITHDREW (interface-notes.md §19.2): no wipe of any kind is
      confirmed for any status any more, and no genuine rejection has ever
      been observed on this hardware. 7B's spec must decide whether/when to
      close this run on a failed re-program, reasoned fresh against the
      post-§19.2 record, not against the withdrawn wipe. Cited in the
      whole-branch fix-2 ledger (`.superpowers/sdd/2026-08-06-phase-7a-fix-2/progress.md`).
- [x] **A second `program()` call during the prepare-settle wait strands the
      first.** `driver.ts`'s `pendingAck`/`pendingVerify` single-flight
      class (immediately above) has a THIRD member as of fix-3's settle:
      `pendingPrepareSettle`. Phase 7A-fix-3 Task 2's review (Probes C/C3)
      confirmed the stranding reproduces with the settle both on and off,
      and — new since the settle shipped — the window it strands in widened
      from microtasks to up to `prepareSettleTicks` worth of wall time
      (~5 s at the default of 10 ticks). Pre-existing class, not a fix-3
      regression, but fix-3 makes the window big enough to hit in practice.
      Cited in the fix-3 ledger (`.superpowers/sdd/
      2026-08-06-phase-7a-fix-3/progress.md`, Task 2 review M4). **Fixed in
      Phase 7B Task 1:** `program()` now checks an in-flight flag FIRST —
      before `sendPrepare`, before any wire traffic — and throws a new
      `ProgramBusyError` for a concurrent call (deliberately NOT a
      `ProgramRejectionReason` member; that union stays
      machine-statements-only, since no frame was ever sent for the
      rejected call). The busy call costs zero writes and never affects the
      first call's own outcome; the flag clears on every exit path
      (resolve or any reject) via `program()`'s own `try`/`finally`.
      `driver.test.ts`'s "ProgramBusyError" describe block is the coverage.
- [x] `src/monitor/driver.ts`'s `createPm5Driver` used to hardcode
      `capabilities.deviceName: "PM5"` (a placeholder, honestly commented
      in place) because its constructor signature (`createPm5Driver(t,
      log)`) was never given a `DiscoveredMonitor`. The real source is
      `DiscoveredMonitor.name` (`domain/monitor/types.ts`) — the advertised
      name `Transport.scan()` already returns (e.g. "PM5 432331249").
      **Fixed in Phase 7B Task 1:** `createPm5Driver` now accepts
      `options.deviceName` (`DriverOptions.deviceName`), which flows
      straight into `capabilities.deviceName` and from there into
      `MonitorRun.deviceName` — falling back to the `"PM5"` placeholder
      only when no name was given at all, never fabricated otherwise.
      `scripts/pm5-lab.ts` threads its own `scan()` result (`found.name`)
      through as the reference caller; a future connect screen does the
      same.
- [ ] **Deferred, deliberately — a follow-on, not this phase's scope
      (Task 8 close-out).** Reconnect and background-scan: today's
      `resolveDefaultTransport()`/`useMonitorSession.connect()` chain
      always starts from `scan()`'s OS picker — there is no "reconnect to
      the last-paired PM5 without re-picking" path, and no background scan
      that could surface a PM5 already in range before the rower presses
      Connect (`loadLastDevice()`/`saveLastDevice()`,
      `ConnectedInterstitial.tsx`, already persist the LAST device's name
      for a "LAST USED · <name>" caption — nothing reads it back to attempt
      a silent reconnect). `driver.ts`'s own `resolveDefaultTransport`
      doc comment names the adjacent gap this shares a root cause with:
      `createCapacitorBleTransport` has no call site here either — a
      native-build caller passes its own factory through
      `MonitorSessionDeps.createTransport` today, and choosing between it
      and Web Bluetooth is a platform conditional that belongs in the
      adapter layer (`src/platform.ts`/`src/adapters/`), not this hook.
      Both — reconnect-by-identity and the platform-conditional default —
      are the same "wire the adapter layer into the default transport"
      follow-on, scoped out of 7B/Task 8 on purpose.

**Exit:** On a real PM5: distance steps auto-advance, live pace shows
against target, and "Connect PM5" degrades silently to manual on
disconnect.

## Phase 7C — PM5 logging

**Status:** Not started
**Goal:** A PM5-driven session logs with the same fidelity a phone-timer
session does.

- [ ] Per-step actual splits logged with `actualSource:'pm5'`
      (`IntervalActual` → the log's per-step actual, a third source
      alongside `logDraft.ts`'s existing `'assumed'`/`'stopwatch'`)
- [ ] The monitor-side log-writing path (`MonitorRun` → a save flow),
      mirroring 6C's `logDraft.ts`/`LogScreen` split for the phone-timer
      side

**Exit:** A session fully driven by a connected PM5 saves a log
indistinguishable in shape from a phone-timer session, with real
monitor-measured splits.

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

- **PR #TBD** (2026-08-08, round 4 on the same bug, architectural) — round
  3's `holdScrollTop` rAF hold-loop (below) also lost on real iOS, in both
  browsers, on fresh bundles — the third window-scroll fix in a row to fail
  on device. This round fires the recorded next step: stop policing the
  window scroller and remove it from the fight. The reader and
  release-notes screens become fixed overlays
  (`.overlay-screen`, `position: fixed; inset: 0; overflow-y: auto`)
  scrolling in their OWN element instead of the window. Three window-scroll
  fixes in a row (this round's two predecessors below) each targeted a
  different layer of the same fight and each lost on real iOS WebKit; an
  overlay scroller can't lose that fight the same way, because a freshly
  mounted element starts at `scrollTop 0` by construction — nothing to
  scroll to, nothing for iOS to restore. `Reader.tsx`'s root also gains
  `key={article.slug}` so the NEXT footer's in-place navigation remounts a
  fresh scroller rather than reusing one that's mid-scroll; both screens'
  roots gain `tabIndex={0}`, matching Plan.tsx's 84-row sequence (Phase 6A,
  commit a3e5ee6) exactly — it puts the scroll region itself in the tab
  order so a keyboard user can Tab to it and scroll with arrow/Page keys.
  Not required by axe's `scrollable-region-focusable` rule here either way:
  both screens already carry a focusable `BackLink` descendant, which
  satisfies the rule's `focusable-content` check regardless of the root's
  own tabIndex — verified by reading axe-core's own rule source, not
  assumed. Round 3's
  `holdScrollTop` helper and its test are deleted outright (grepped clean
  across `src/`/`e2e/`). **Correction to this round's own original premise:**
  the architecture does NOT restore News's BACK scroll position the way the
  round was originally expected to — `position: fixed` removes the routed
  screen from `.app-shell`'s document flow entirely, so `document.body`'s
  scroll height collapses to just the app-shell's own padding the instant
  the overlay mounts, and the browser clamps `window.scrollY` to 0 as an
  automatic consequence (proven on the real compose stack, not just
  reasoned about — the same clamp `Library.tsx`'s own scroll-memory comment
  already describes for a shorter list). BACK still lands News at the top,
  unchanged from round 2's tradeoff below — round 4 fixes the
  reader-opens-mid-scroll bug this whole saga is about, but a
  Library-style scroll-memory addition for News, not this architecture, is
  what an actual BACK-position fix would take, and that's out of this
  round's scope.
- **PR #TBD** (2026-08-07/08, round 3 on the same bug) — the single-shot
  `window.scrollTo(0, 0)` from the round below (pre-paint, plus
  `scrollRestoration = "manual"` claimed) still lost on real iOS WebKit —
  and lost in BOTH iOS browsers, not just Safari, ruling out a
  browser-chrome-specific cause. Instrumented desktop-WebKit and
  iPhone-emulated runs never showed a second scroll pass; the mechanism is
  triangulated by elimination, not directly observed, because no harness on
  this machine can inject a real touch gesture. This round adds a shared
  `holdScrollTop` helper (`src/shell/holdScrollTop.ts`): set the top, then
  hold it at rAF cadence for ~30 frames (~500ms), re-asserting whenever
  something else moves `scrollY`, aborting instantly on `touchstart`/
  `wheel`/`keydown` so it never fights a rower's own scroll. Reader and
  Releases both adopt it in place of their bare `scrollTo` calls. If this
  round still fails on device, the recorded next step is architectural: the
  reader becomes its own scroll container, which also restores News's BACK
  position for free (currently sacrificed — see the round below).
- **PR #TBD** (2026-08-07, follow-up to the News polish round below) — the
  reader's scroll-to-top actually holds on iOS Safari: PR #55's
  `useEffect`-timed `window.scrollTo(0, 0)` ran and landed (proven with
  instrumented desktop-WebKit + iPhone-emulation runs) but on the real
  device Safari's own browser-layer scroll pass re-scrolled the reader
  ~150px down afterwards (James's 2026-08-07 screen recording; frames
  8–11 show it parked mis-scrolled until a manual swipe). Fix targets the
  layer that misbehaved: `history.scrollRestoration = "manual"` claimed at
  App mount (every scroll-sensitive screen already self-manages — reader/
  releases jump to top, Library restores its own position), plus the two
  news scroll effects move to `useLayoutEffect` (before paint, ahead of any
  late browser pass; `Library.tsx`'s own precedent). Known tradeoff, noted
  deliberately: BACK from an article now lands News at the top on iOS
  (Safari's auto-restore used to cover that) — the feed is ~1.15 screens
  today, so this costs one small flick; if the shelf grows, News gets the
  Library's own scroll-memory pattern rather than browser restoration.
  **Round 4 update:** the overlay-scroller architecture (round 4, above)
  was expected to undo this tradeoff for free and does NOT — verified on
  the real compose stack that `window.scrollY` still clamps to 0 the moment
  the reader mounts, for an unrelated reason (the fixed overlay collapses
  `document.body`'s scroll height), so this tradeoff still stands exactly
  as written above.
- **PR #TBD** (2026-08-07) — News polish: the reader and release notes
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
