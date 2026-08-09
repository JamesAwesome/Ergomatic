# Ergomatic

Mobile-first tracker and planner for indoor rowing workouts, built around
The Erg Book's baseline-offset pace model. See `ROADMAP.md` for the build plan
and `CLAUDE.md` for dev workflow.

## Quick start

Requires Node 26 (`nvm use`).

    pnpm install          # root: installs git hooks
    cd app && pnpm install
    pnpm dev:server       # API on :8080
    pnpm dev              # client on :5173

`dev:server` refuses to start without `DATABASE_URL` — there is no dotenv, only
real environment. See `CLAUDE.md` for the local Postgres and OAuth invocations.

## The idea in one paragraph

A rower has two **baseline splits**: their 2k and 6k pace, in time per 500 m.
Every workout target is stored as an *offset* from one of them — `6k -2` means
"two seconds per 500 m faster than my 6k pace". Nothing stores an absolute
target. The app resolves offsets against the rower's current baselines each time
a workout is opened, so a library written months ago stays honest as fitness
changes; when a session is logged, the resolved splits are **frozen into the
log**, so history doesn't rewrite itself when the baselines move.

## Layout

    app/
      domain/   pure Erg Book logic — no framework imports, dependency-zero
        monitor/  the PM5 wire: CSAFE codec, status parsers, program compiler
      server/   Express 5 API (JSON only) + Drizzle schema and migrations
      src/      React 19 + Vite client
        monitor/  the PM5 driver, transports (Web Bluetooth + a DEV fake), session hook
      e2e/      Playwright: user flows, structural design assertions, screenshots
    docs/
      design/   the UI/UX handoff — authoritative, incl. DEVIATIONS.md
      monitor/  pm5-interface-notes.md: the wire record — every hardware
                session, every idiosyncrasy the official docs omit (see its §20)
      TESTING.md            testing policy; read before writing or reviewing tests
      deploy.md, RELEASING.md
      superpowers/          per-phase specs and implementation plans

The root `package.json` exists only to host husky hooks; `app/` is its own pnpm
workspace root. Install in both.

### `app/domain/` is the centre of gravity

It is pure TypeScript with no dependencies and is pinned at 100% coverage. It
owns the model everything else is a view of:

- `Step` — `wu` (warm-up) · `reps` (the single repeat marker) · `w` (work) ·
  `r` (rest) · `test`
- `WorkDuration` — `{kind:'time', minutes}` or `{kind:'distance', meters}`; both
  are legitimate ways to prescribe erg work
- `PaceRef` — `{base: '2k'|'6k', off}`; `resolveSplit = baseline + off + nudge`
- `liveSteps` — expands a workout for a session: everything before the `reps`
  marker runs once, everything after runs `count` times
- `validateSteps` / `validateWorkoutInput` — **the authority on every bound**.
  The client mirrors these limits for good errors; the server enforces them.

A workout stores **one** repeat marker, not a per-row flag. That single fact
shapes the builder UI more than any design decision does.

## How a request flows

In production there are two containers. `web` (nginx-unprivileged) serves the
built client and proxies `/api` to `api` (Express), which has **no host port** —
it is unreachable except through nginx. The Cloudflare tunnel's origin is
`http://web:8080`. The deploy health gate proves the whole chain,
nginx → api → postgres, before it stops rolling back.

Locally, Vite on :5173 plays nginx's part and proxies `/api` to :8080.

## The connected monitor

A Concept2 PM5 can drive a session end to end: Connect on a workout
detail programs the erg over Bluetooth (variable-interval workouts with
real pace targets), a three-pane surface mirrors the monitor live, and
the finished session logs with the machine's own measured splits
(`actualSource: "pm5"`), stored verbatim for an eventual Concept2
Logbook sync. The PM5 is authoritative: the app displays what the
machine says and never fakes a number it did not receive. The whole
layer sits behind a transport seam and is OPTIONAL FOREVER; the phone
timer is a complete product without it. Today the radio path is Web
Bluetooth (desktop Chromium); the Capacitor BLE adapter is a named
follow-on. The production bundle provably excludes the development
fake (`pnpm dist:grep`).

## Native-first

The iOS app (Capacitor) is the primary surface; design decisions favour it. The
web build is the *same code*, serving as the Playwright/design/screenshot
harness, the dev loop, and a fallback — never dropped, never polished at the
app's expense. Platform conditionals are confined by lint rule to the adapter
layer: `src/platform.ts`, `src/api.ts`, `src/native/`, `src/adapters/`.

## What gates a change

`pnpm lint · typecheck · test · build` plus, for anything touching `app/src/`,
`pnpm e2e` — the Playwright suite runs flows *and* structural design assertions
(44 px hit targets, WCAG AA contrast, token usage, safe-area insets) against the
real compose stack. `pnpm screenshots` refreshes `docs/screenshots/`, which the
phase PR body embeds. Coverage is gated at 90% repo-wide with `app/domain/**`
pinned at 100.

Before writing tests, read `docs/TESTING.md`. Before starting any work, read the
**Recurring failures** section of `CLAUDE.md` — it is a list of mistakes this
project has actually made, most of them more than once.
