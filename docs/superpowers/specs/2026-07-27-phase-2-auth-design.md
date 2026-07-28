# Phase 2: Auth — Design

Approved 2026-07-27. Implements ROADMAP.md Phase 2: Google OAuth
authorization-code flow, self-hosted Postgres sessions, per-user isolation.
No auth SaaS.

## Decisions

| Question | Decision |
|---|---|
| Signup policy | **Email allowlist**: `ALLOWED_EMAILS` env var, comma-separated, case-insensitive; parse = `split(',') → trim → filter(Boolean) → toLowerCase` (whitespace/trailing commas must not lock anyone out — unit-tested); requires `email_verified === true`; checked only at first sign-in (existing users unaffected by list changes); missing/empty var = nobody can sign up (deny by default) |
| Revocation | The allowlist is an **admission gate, not a revocation control**: removing an email does NOT sign out an existing user. Off-boarding = delete the `users` row (sessions cascade). `ALLOWED_EMAILS` changes need a container recreate (env is read at boot). Both documented in docs/deploy.md |
| OAuth library | `openid-client` (certified OIDC lib) for the Google code flow with PKCE + `state`; sessions self-built |
| ORM timing | **Drizzle pulled forward from Phase 3**: users/sessions tables + migration infrastructure land now; Phase 3 adds domain tables to an established setup (note this against ROADMAP Phase 3's first checkbox) |
| Identity key | `google_sub` claim, unique per user. Email is display data, not identity |
| Versions | `openid-client`, `drizzle-orm`, `drizzle-kit` verified against the registry at plan/install time (standing rule) |

## Data model (Drizzle, `app/server/db/schema.ts`, migrations in `app/drizzle/`)

- `users`: `id` uuid pk (default random), `google_sub` text unique not null,
  `email` text not null, `name` text not null, `created_at` timestamptz default now.
- `sessions`: `id` uuid pk, `token_hash` text unique not null (SHA-256 hex of
  the opaque token — a DB leak exposes no usable sessions), `user_id` uuid fk
  → users.id on delete cascade, `created_at`, `expires_at` timestamptz not null.
- Migrations are applied on server boot via drizzle-orm's migrator
  (natalie pattern) so deploys stay zero-touch. `db:generate` script added.
- **Standing constraint (all future phases): migrations must be
  expand-only** — never destructive (drop/rename) in the same deploy as the
  code depending on them. The CD rollback reverts CODE but not SCHEMA; a
  destructive migration + failed health gate would wedge the rolled-back
  build against a schema it can't use. Concurrent migrators are impossible
  in this deploy model (single-replica compose recreate, serial deploy.sh).

## Sessions

- Opaque 256-bit random token (`crypto.randomBytes(32)`), sent as the
  `erg_session` cookie: `httpOnly`, `Secure` in production, `SameSite=Lax`,
  `Path=/`, **`Max-Age` = remaining session lifetime** (without it the cookie
  dies on browser close and the 60-day lifetime exists only server-side).
- `Secure` is gated on `NODE_ENV === 'production'`, NOT on `req.secure` —
  cloudflared→app is plain HTTP inside the box, so `req.secure` is always
  false; do not set `trust proxy` for this.
- 60-day expiry; **rolling refresh**: any authenticated request past the
  halfway point extends `expires_at` and re-sets the cookie (new Max-Age).
  Refresh extends the SAME token — never rotate on refresh (rotation would
  create a concurrent-request race; the idempotent extend is race-free).
- Sign-out deletes the row and clears the cookie **with identical attributes**
  (Path/Secure/SameSite/httpOnly — mismatched attributes silently fail to
  clear). Expired-row sweep piggybacks on sign-in — no cron.
- `sessions.user_id` gets an index (cascade/user-scoped queries).

## CSRF posture

- `SameSite=Lax` cookie blocks cross-site POSTs.
- Origin-check middleware: mutating methods (POST/PUT/PATCH/DELETE) with a
  present `Origin` header that doesn't match `SITE_URL` (or localhost dev
  origins) → 403. No token dance for the JSON API.
- OAuth flow carries `state` + PKCE (via `openid-client`), stored in a
  short-lived httpOnly `erg_oauth` cookie during the round-trip.

## Auth guard

- `requireUser` middleware resolves `erg_session` → user; else
  `401 {error:"unauthenticated"}`.
- ALL `/api/*` routes sit behind it except `/api/health` and `/api/auth/*`.
- Past the guard, `req.user` is typed non-optional; every Phase 3+ table
  carries `user_id` and every query scopes by it.

## Routes (`app/server/auth/`)

- `GET /api/auth/signin` — build Google authorization URL (PKCE + state),
  redirect.
- `GET /api/auth/callback` — verify state/PKCE, exchange code, read verified
  claims (`sub`, `email`, `email_verified`, `name`).
  - **`email_verified !== true` → treated as denied** (redirect `/?denied=<email>`,
    no user created). The allowlist authorizes on the email claim, so the
    claim must be verified — this check precedes the allowlist comparison.
  - Existing `google_sub` → **upsert `email`/`name`** (keeps display data
    fresh), new session, redirect `/`.
  - New + allowlisted → create user + session, redirect `/`.
  - New + not allowlisted → redirect `/?denied=<email>` (no user created).
  - **Error paths are normal flow, not exceptions**: Google `?error=access_denied`
    (user cancelled) → silent redirect `/`; any other `error` param, missing
    `code`, state mismatch, or missing/expired `erg_oauth` cookie → redirect
    `/?error=signin_failed` (sign-in screen shows a retry notice). No raw 500s.
  - The `erg_oauth` cookie is deleted on every callback outcome, success or
    failure; it is scoped `Path=/api/auth`. Two concurrent sign-in attempts
    (two tabs) intentionally last-write-wins on that cookie — the older tab's
    callback lands on `/?error=signin_failed`; retry works.
- `POST /api/auth/signout` — delete session, clear cookie (behind Origin check).
- `GET /api/me` — `{user:{id,email,name}}` or 401. Client boots from this.

Config: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` env; redirect URI derived
from `SITE_URL` (hostname rename stays a one-line env change). Missing Google
env → auth routes return 503 with a clear message; health unaffected; server
still boots (so infra deploys don't hard-depend on Google config) — but the
server logs a **loud boot-time warning** when auth env is absent/partial,
since a typo'd secret otherwise deploys "green" with sign-in 100% broken and
only the manual sign-in test would notice.

Response hygiene: `Cache-Control: no-store` on `/api/me`, `/api/auth/*`, and
as the default for all authenticated API responses (guards against bfcache
resurfacing another rower's identity on a shared phone, and against any
future CDN cache rule).

Route ordering in `createApp`: `/api/health` → auth routes → guarded data
routes → static + SPA fallback. The fallback regex is tightened to
`/^\/(?!api(\/|$)).*/` so bare `/api` 404s instead of serving the shell
(closes the known Phase 1 minor).

Dev note: local OAuth requires `SITE_URL=http://localhost:5173` in the dev
environment so the derived redirect URI matches the registered dev URI
(documented in CLAUDE.md; without it the first local attempt fails with
`redirect_uri_mismatch`).

## Frontend

- Client boots on `GET /api/me`. Signed out → sign-in screen in the design
  language: paper background (`#f4f1e8`), "Ergomatic" Newsreader serif,
  accent `#b5341f` "Continue with Google" button (≥44px), denied-email notice
  when `?denied=` present. Signed in → existing shell + minimal **You**
  screen: initials square, name, email, "Sign out" button.
- Full You-screen features (baselines, prefs, SWITCH) arrive in Phases 4–8;
  this screen is the mount point.

## Testing

- Unit (fake session store, stubbed claims): guard 401/200; allowlist
  new/existing/denied/empty-var; session expiry + rolling refresh; Origin
  middleware allow/deny.
- Integration (Testcontainers Postgres): migrations apply on boot; full
  session lifecycle (create user → mint session → resolve cookie → expire →
  sign out); two users' sessions resolve to distinct users.
- The Google exchange is NOT faked in tests; it is verified once, manually,
  on the deployed site (exit criterion). Coverage ≥90 maintained.

## Compose / env additions

- `.env.example` + compose `app.environment` gain: `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `ALLOWED_EMAILS`.
- `docs/deploy.md` gains the Google Cloud Console one-time setup: Web
  application OAuth client; authorized redirect URIs
  `https://ergomatic.waffle.haus/api/auth/callback` and
  `http://localhost:5173/api/auth/callback` (dev, via the Vite proxy).

## Exit criteria (ROADMAP Phase 2)

1. Two allowlisted Google accounts sign in on the live site and hold fully
   isolated sessions (each sees their own `/api/me`).
2. A non-allowlisted account is politely refused; no user row created.
3. Deployed through the existing CD (merge = deploy).

Note: ROADMAP says "fully isolated **data**"; no data routes exist until
Phase 3, so Phase 2 establishes isolation *structurally* (guard + user_id
scoping convention) and proves it at the session level. **Phase 3 MUST add a
behavioral two-user isolation test when the first data route lands** — this
is a recorded obligation, not an assumption.

## Out of scope

- Domain tables/data beyond users+sessions (Phase 3).
- Device account switching / multi-rower SWITCH UI (Phase 8).
- Additional providers, email magic links (future).
