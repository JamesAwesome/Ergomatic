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

---

## Phase 0 — Scaffold & tooling

**Status:** Not started
**Goal:** A cloned repo where `pnpm install && pnpm test` works and bad code cannot be committed.

- [ ] Verify current stable versions of everything (Node, pnpm, TypeScript, React, Vite, Express, Vitest, ESLint, husky/lint-staged) against the registries per the standing rule above
- [ ] Repo layout: `app/` containing `client/` (Vite React) and `server/` (Express), shared `domain/` module space
- [ ] pnpm + `only-allow pnpm`, `.npmrc`, Node version pin
- [ ] TypeScript strict config, ESLint flat config (js + typescript-eslint + react-hooks + react-refresh)
- [ ] Vitest three-project setup with coverage thresholds wired from the start
- [ ] husky + lint-staged: pre-commit lint/typecheck (staged), pre-push full tests
- [ ] GitHub Actions CI: lint → typecheck → test:coverage → build; Dependabot (weekly, grouped)
- [ ] CLAUDE.md + README with dev workflow

**Exit:** CI green on a trivial client/server "hello" with one passing test in each Vitest project; hooks demonstrably block a lint failure and a test failure.

## Phase 1 — Infra & continuous deployment

**Status:** Not started
**Goal:** Every push to main lands on a real URL with zero manual steps.

- [ ] Hardened multi-stage Dockerfiles (non-root, read-only, tmpfs, cap_drop ALL)
- [ ] `compose.yml`: Postgres 18 (healthchecked volume), app, cloudflared under a `tunnel` profile
- [ ] `/api/health` endpoint incl. DB connectivity check
- [ ] `scripts/deploy.sh` (checkout CI-validated SHA → `compose up --build --wait` → auto-rollback on failed health gate) + tests for the script
- [ ] CI `deploy` job on self-hosted runner, `production` environment
- [ ] `.env.example` + secrets conventions (tunnel token, DB creds)

**Exit:** Hello-world Ergomatic reachable through the Cloudflare tunnel; a deliberately broken deploy rolls back automatically.

## Phase 2 — Auth

**Status:** Not started
**Goal:** Multiple people can each sign in and get their own empty Ergomatic.

- [ ] Google OAuth authorization-code flow (self-implemented or minimal library, no SaaS)
- [ ] `users` table + Postgres-backed cookie sessions; session middleware; CSRF posture
- [ ] Sign-in screen (design language: paper theme, serif titles)
- [ ] Minimal **You** screen: signed-in identity + sign out
- [ ] API auth guard: all data routes require a session, all data scoped to the user

**Exit:** Two different Google accounts see fully isolated data; deployed.

## Phase 3 — Domain engine & schema

**Status:** Not started
**Goal:** The Erg Book math, encoded once, pure, and heavily tested.

- [ ] Drizzle schema + migrations: baselines, workouts + steps, session logs (with frozen paces), plan progress, preferences, test history — all per-user
- [ ] Pure domain module (no framework imports): pace resolution (`baseline + off + nudge`), tolerance ranges, `m:ss` formatting, phase expansion (`liveSteps()`/`phases()` incl. reps and rest insertion), pace-ref parser (`^(2k|6k)\s*([+-]?\d+(\.\d+)?)?$`), plan preset sequences (sprint / head race, 84 sessions, test placements), suggestion engine (`plan[doneN]` → filtered/sorted pool)
- [ ] Heaviest unit-test coverage in the app; canonical fixtures (e.g. Lucky Penny → 25 phases / 50 min)
- [ ] Dev seed: the prototype's 11 sample workouts

**Exit:** Every formula and behavior in the handoff's "Domain model" section has a passing test; integration tests prove per-user round-trips through Postgres.

## Phase 4 — Library & baselines

**Status:** Not started
**Goal:** Enter real baselines and start transcribing The Erg Book.

- [ ] Design-token CSS foundation (paper palette, Newsreader/Archivo/IBM Plex Mono, 2 px radii, spacing scale) + bottom tab shell
- [ ] Library screen: rows with pain bars, filter chips (type single-select toggle, duration multi-select union, RECENT/NOT RECENT exclusivity, ALL clears)
- [ ] Workout detail: resolved ranges, ▲▼ per-step nudges, derived duration
- [ ] Builder: type/difficulty/pain pickers, step rows with live resolved splits, repeat block, totals, bulk-import paste
- [ ] **You** — staged baseline editor (drafts, − = faster, 0.5 s steps, Discard/Apply confirm block)

**Exit:** A workout entered as `6k -2 @ 22 SPM` displays the correct range from your real baselines; deployed and usable for cataloguing.

## Phase 5 — Session flow

**Status:** Not started
**Goal:** The app replaces paper for an entire workout — the core loop.

- [ ] Today screen: suggestion engine + reason line, SHUFFLE, swap pool (`todayPick`), last three
- [ ] Confirm targets: per-run session overlay (duration steppers, rep stepper, step removal/restore, live minute recount) — timer reads the session copy, never the library workout
- [ ] Countdown (configurable, skippable, 0 = off)
- [ ] Live timer: portrait + landscape, phase dots, target split/rate cards, UP NEXT, total-left ruler, ◀ ▶ pause; warm-up/rest/test phases show "Easy"/"Rest"/"All out" (never a bare dash); tabs hidden
- [ ] Timer resilience: 1 s tick correct under screen lock; state in localStorage; interrupted session restores on reload
- [ ] Log session: paces frozen at save ("PACES LOCKED AT …"), Held/Under/Over, pain 1–10, notes; save advances `doneN`

**Exit:** Full flow Today → Confirm → Countdown → Timer → Log → Today survives a mid-workout page reload; frozen log paces stay unchanged after later baseline edits.

## Phase 6 — Plan & Progress

**Status:** Not started
**Goal:** See where you are in the 84-session plan and whether you're getting faster.

- [ ] Plan screen: month calendar with type marks, ALL/TO DO/DONE filters, legend, session rows (done sorted below upcoming; today highlighted)
- [ ] Plan management: preset selection (2000 m sprint / 5–6 k head race), reset-to-session-1
- [ ] Progress screen: 2k/6k test trend bars (longer = slower, delta callout), minutes/week stacked by type, type mix, last-30-days
- [ ] Test history list on **You**; test-type sessions prompt a baseline update

**Exit:** Logged sessions appear on the calendar and in every chart; a logged 2k test can update the 2k baseline through the staged-confirm flow.

## Phase 7 — Preferences & You completion

**Status:** Not started
**Goal:** The suggestion engine and session flow honor per-user preferences.

- [ ] Suggest-workouts-at difficulty chips + time-available cap, live "N of M match" readout, feeding Today and clearing `todayPick`
- [ ] Default warm-up length + "override library warm-ups" (staged)
- [ ] Pre-workout countdown length 0–60 s (staged)
- [ ] Pace tolerance (0–3 s) and accent color as real settings
- [ ] All preferences persisted per-user

**Exit:** Two users with different preferences get different Today suggestions and timer behavior.

## Phase 8 — Multi-rower & polish

**Status:** Not started
**Goal:** Household-ready and installable.

- [ ] Device account switcher (the design's SWITCH flow: multiple signed-in rowers, "Add another rower")
- [ ] PWA installability (manifest, icons, standalone display)
- [ ] Accessibility audit against the handoff's hard rules: every target ≥ 44×44 px, all text ≥ 4.5:1 AA
- [ ] Calm-motion pass: no animation beyond the timer tick and progress bars
- [ ] Backlog sweep of deferred niceties

**Exit:** Two rowers share a phone by the erg without re-typing credentials; app installs to a home screen; audit findings closed.
