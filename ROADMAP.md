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

## Phase 6 — Session flow

**Status:** Not started
**Goal:** The app replaces paper for an entire workout — the core loop.

- [ ] **`num` column retirement is TWO separate releases, not one** (before
      any other Phase 6 work): (a) remove `num` from
      `app/server/db/schema.ts` with no migration, deploy green; only then
      (b) run the `DROP COLUMN num` migration. Reason: Drizzle expands a
      schema into an explicit column list for every projection-less
      `db.select()`, so as long as `schema.ts` declares `num`, every plain
      workout query puts it on the wire — if a single release both removed
      it from `schema.ts` and dropped the column, an unhealthy deploy would
      make `scripts/deploy.sh` roll back to the old image, which still
      selects a column that no longer exists, so the rollback itself fails
      and turns a recoverable deploy into a dead site.
- [ ] Today screen: suggestion engine + reason line, SHUFFLE, swap pool (`todayPick`), last three
- [ ] Confirm targets: per-run session overlay (duration steppers, rep stepper, step removal/restore, live minute recount) — timer reads the session copy, never the library workout; per-step SPM adjustment at workout start (18-32 range), alongside the split nudge
- [ ] Countdown (configurable, skippable, 0 = off)
- [ ] Live timer: portrait + landscape, phase dots, target split/rate cards, UP NEXT, total-left ruler, ◀ ▶ pause; warm-up/rest/test phases show "Easy"/"Rest"/"All out" (never a bare dash); tabs hidden
- [ ] Distance phases (manual mode, works on every device forever): target meters + resolved range, count-UP stopwatch, full-width "NEXT →" (≥44px); elapsed time yields the actual average split with zero hardware (2500m in 9:52 → 1:58.4/500m, logged as `actualSource:'stopwatch'`)
- [ ] Timer resilience: 1 s tick correct under screen lock; state in localStorage; interrupted session restores on reload
- [ ] Log session: paces frozen at save ("PACES LOCKED AT …"), Held/Under/Over, pain 1–10, notes; save advances `doneN`

**Exit:** Full flow Today → Confirm → Countdown → Timer → Log → Today survives a mid-workout page reload; frozen log paces stay unchanged after later baseline edits.

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

- [ ] Plan screen: month calendar with type marks, ALL/TO DO/DONE filters, legend, session rows (done sorted below upcoming; today highlighted)
- [ ] Plan management: preset selection (2000 m sprint / 5–6 k head race), reset-to-session-1
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
- **Parametric workout generator**: "generate me a 45' AT workout" from the starter library's authoring rules — the differentiator a static book can't match. Trigger: after Phase 6 makes workouts rowable end-to-end. Generation will load richer structural references from the owner's source material (patterns and parameters only — never entries/titles/prose, per the content policy).
- **Library export/import (private JSON)**: household members share their own transcriptions. Trigger: second active rower asks for it.
