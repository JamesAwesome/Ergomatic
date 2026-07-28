# Phase 2: Auth — Design

Approved 2026-07-27. Implements ROADMAP.md Phase 2: Google OAuth
authorization-code flow, self-hosted Postgres sessions, per-user isolation.
No auth SaaS.

## Decisions

| Question | Decision |
|---|---|
| Signup policy | **Email allowlist**: `ALLOWED_EMAILS` env var, comma-separated, case-insensitive; checked only at first sign-in (existing users unaffected by list changes); missing/empty var = nobody can sign up (deny by default) |
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

## Sessions

- Opaque 256-bit random token (`crypto.randomBytes(32)`), sent as the
  `erg_session` cookie: `httpOnly`, `Secure` in production, `SameSite=Lax`,
  `Path=/`.
- 60-day expiry; **rolling refresh**: any authenticated request past the
  halfway point extends `expires_at` (and re-sets the cookie).
- Sign-out deletes the row and clears the cookie. Expired-row sweep
  piggybacks on sign-in (delete where expires_at < now) — no cron.

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
  claims (`sub`, `email`, `name`).
  - Existing `google_sub` → new session, redirect `/`.
  - New + allowlisted → create user + session, redirect `/`.
  - New + not allowlisted → redirect `/?denied=<email>` (no user created).
- `POST /api/auth/signout` — delete session, clear cookie (behind Origin check).
- `GET /api/me` — `{user:{id,email,name}}` or 401. Client boots from this.

Config: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` env; redirect URI derived
from `SITE_URL` (hostname rename stays a one-line env change). Missing Google
env → auth routes return 503 with a clear message; health unaffected; server
still boots (so infra deploys don't hard-depend on Google config).

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

## Out of scope

- Domain tables/data beyond users+sessions (Phase 3).
- Device account switching / multi-rower SWITCH UI (Phase 8).
- Additional providers, email magic links (future).
