# Apple deployment configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pass the tested Apple configuration to the server while preserving a closed public front door by default.

**Architecture:** The compose API service alone receives Apple signing credentials. `FRONT_DOOR_ENABLED === "1"` is the server's exact enable predicate. External enablement follows deletion and real Apple validation.

**Tech Stack:** Docker Compose, existing host `.env`, Markdown deployment/release instructions.

**Spec:** `docs/superpowers/specs/2026-09-12-apple-signin-design.md`.

## Global Constraints

Server plan owns config parsing; this task owns `.env.example`, `compose.yml`, `docs/deploy.md` and `docs/RELEASING.md`. No host changes, key creation, deployment, phone installation or public enablement are part of the paste-test.

### Task 4: Pass configuration and document activation

**Interfaces:** Consumes `FRONT_DOOR_ENABLED`, `APPLE_NATIVE_CLIENT_ID`, `APPLE_WEB_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY` from the server module. Key input is PKCS8 PEM with actual newlines, passed to `jose.importPKCS8(..., "ES256")`; no application escape conversion. `SITE_URL` must be HTTPS when enabled. Both Apple audiences must be configured and distinct.

- [ ] Replace the configuration files with these complete tested blocks.

#### `.env.example`

```dotenv
# Copy to .env on the deploy host (chmod 600). Nothing here is committed.

# Required
POSTGRES_PASSWORD=

# Optional overrides (defaults shown)
POSTGRES_DB=ergomatic
POSTGRES_USER=ergomatic
POSTGRES_PORT=5433
# On the shared host natalie occupies 8080 AND 8081 — 8082 is the free one.
# Binds the web (nginx) container only; api has no host port at all and is
# reachable exclusively through web's /api proxy.
APP_PORT=8082
APP_BIND=127.0.0.1
SITE_URL=https://ergomatic.waffle.haus
TIMEZONE=America/New_York
# Google OAuth (docs/deploy.md "Google sign-in" section). Empty = sign-in
# disabled (health unaffected); server logs a loud warning at boot.
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
# iOS native sign-in (Phase 3+): the iOS OAuth client's ID (no secret exists for iOS clients)
GOOGLE_IOS_CLIENT_ID=
# While FRONT_DOOR_ENABLED is not 1: emails allowed to CREATE accounts.
# Empty = nobody can sign up. When enabled, both providers admit new rowers. Admission gate only — removing an email does not sign out an existing
# user (delete their users row to off-board). Changes need a container
# recreate (docker compose up -d).
ALLOWED_EMAILS=

# Apple + open signup (docs/deploy.md "Apple and the open front door").
# Only the literal 1 enables it. Leave empty until deletion and release gates pass.
FRONT_DOOR_ENABLED=
APPLE_NATIVE_CLIENT_ID=haus.waffle.ergomatic
# The distinct Services ID associated with the native primary App ID.
APPLE_WEB_CLIENT_ID=
APPLE_TEAM_ID=
APPLE_KEY_ID=
# Server-only Sign in with Apple .p8 key: PKCS8 PEM with actual newlines.
# In the host .env, use double quotes with escaped \n, which Compose decodes.
APPLE_PRIVATE_KEY=

# Production only: cloudflared tunnel (get the token from the Cloudflare
# Zero Trust dashboard) and uncomment to enable the tunnel in production.
CLOUDFLARE_TUNNEL_TOKEN=
# COMPOSE_PROFILES=tunnel

# e2e ONLY. Non-empty activates a backdoor sign-in route
# (POST /api/auth/test-signin) that mints a real session for any caller who
# knows this secret, bypassing Google OAuth and the allowlist entirely. This
# file never sets it — compose.yml has no TEST_AUTH_SECRET reference at all,
# so it's structurally impossible to arm the backdoor from the deploy host's
# .env. It's supplied only via the compose.e2e.yml override, which
# scripts/e2e.sh / scripts/screenshots.sh / the CI `e2e` job apply
# explicitly (`docker compose -f compose.yml -f compose.e2e.yml up ...`).
# The server logs a loud warning at boot whenever it's active.
```

#### `compose.yml`

```yaml
name: ergomatic

services:
  postgres:
    image: postgres:18.4
    container_name: ${ERGO_STACK:-ergomatic}-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-ergomatic}
      POSTGRES_USER: ${POSTGRES_USER:-ergomatic}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}
    ports:
      - "127.0.0.1:${POSTGRES_PORT:-5433}:5432"
    volumes:
      # postgres:18 images keep PGDATA under /var/lib/postgresql (not .../data)
      - pgdata:/var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-ergomatic} -d ${POSTGRES_DB:-ergomatic}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s

  api:
    build:
      context: ./app
      target: api
      args:
        APP_VERSION: ${APP_VERSION:-dev}
    container_name: ${ERGO_STACK:-ergomatic}-api
    restart: unless-stopped
    # Defense-in-depth: drop privileges, read-only root FS (natalie convention)
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    read_only: true
    tmpfs:
      - /tmp
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER:-ergomatic}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-ergomatic}
      SITE_URL: ${SITE_URL:-https://ergomatic.waffle.haus}
      TZ: ${TIMEZONE:-America/New_York}
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:-}
      GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET:-}
      GOOGLE_IOS_CLIENT_ID: ${GOOGLE_IOS_CLIENT_ID:-}
      ALLOWED_EMAILS: ${ALLOWED_EMAILS:-}
      # One default-off switch gates Apple and open account admission together.
      FRONT_DOOR_ENABLED: ${FRONT_DOOR_ENABLED:-}
      APPLE_NATIVE_CLIENT_ID: ${APPLE_NATIVE_CLIENT_ID:-}
      APPLE_WEB_CLIENT_ID: ${APPLE_WEB_CLIENT_ID:-}
      APPLE_TEAM_ID: ${APPLE_TEAM_ID:-}
      APPLE_KEY_ID: ${APPLE_KEY_ID:-}
      APPLE_PRIVATE_KEY: ${APPLE_PRIVATE_KEY:-}
      # Wave E PR1: default-off passthrough (empty on every host that doesn't
      # set them, which is every stack today — dev, e2e, and prod).
      # AVAILABILITY is env-gated; ACTIVATION on a real cohort additionally
      # requires option (g) — see the gate doc
      # (docs/superpowers/plans/2026-09-01-concept2-pr15-gate.md §6) and
      # ROADMAP.md's C2 account-injection row. C2_BASE_URL's default mirrors
      # server/index.ts's own JS-side fallback (`?? "https://log-dev..."`)
      # rather than an empty string: `??` only substitutes on null/undefined,
      # never on an empty string, so an unadorned `${C2_BASE_URL:-}` would
      # hand the server a defined-but-empty value and silently defeat that
      # fallback — the one var here where "match the empty-default style"
      # would have shipped a live footgun (a base URL of `""` throws inside
      # `new URL()` the first time a rower tries to connect, not at boot).
      C2_BASE_URL: ${C2_BASE_URL:-https://log-dev.concept2.com}
      C2_CLIENT_ID: ${C2_CLIENT_ID:-}
      C2_CLIENT_SECRET: ${C2_CLIENT_SECRET:-}
      C2_LINK_ENABLED: ${C2_LINK_ENABLED:-}
      # Wave E per-user gate: WHO the Concept2 surface is live for, once the
      # flag and credentials say it exists at all. Same empty default as the
      # rest — and here empty means NOBODY (server/index.ts parses it with
      # the same `parseAllowlist` as ALLOWED_EMAILS, and an empty list
      # matches no email), so an unset value leaves the surface dark for
      # every rower rather than open to all of them.
      C2_ALLOWED_EMAILS: ${C2_ALLOWED_EMAILS:-}
    depends_on:
      postgres:
        condition: service_healthy
    # /api/health does a real SELECT 1, so `compose up -d --wait` means
    # "serving + DB-connected" — the signal the deploy health gate relies on.
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 20s

  web:
    build:
      context: ./app
      target: web
    container_name: ${ERGO_STACK:-ergomatic}-web
    restart: unless-stopped
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    read_only: true
    tmpfs:
      # unprivileged nginx keeps pid + cache under /tmp
      - /tmp
    ports:
      # The ONLY host-facing app port (shared host: natalie owns 8080/8081,
      # prod .env sets APP_PORT=8082). api has no host mapping at all.
      - "${APP_BIND:-127.0.0.1}:${APP_PORT:-8081}:8080"
    depends_on:
      api:
        condition: service_healthy
    # Fetches through nginx's own /api proxy: `compose up --wait` (the
    # deploy.sh health gate) now proves web -> api -> postgres end-to-end.
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:8080/api/health"]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 10s

  cloudflared:
    image: cloudflare/cloudflared:2026.7.3
    container_name: ${ERGO_STACK:-ergomatic}-cloudflared
    restart: unless-stopped
    profiles: ["tunnel"]
    command: tunnel run
    environment:
      TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN}
    depends_on:
      - web

volumes:
  pgdata:
```

- [ ] Update `docs/deploy.md` with the following section after Google sign-in, add the new Google callback URL alongside the existing callback, and qualify the existing allowlist/C2 notes: `ALLOWED_EMAILS` gates creation only while the front door is disabled; `C2_ALLOWED_EMAILS` remains independent in both modes.

```markdown
## Apple and the open front door

`FRONT_DOOR_ENABLED` enables only for the literal `1`. Leave it empty for this
slice: Apple and new open-account admission are exposed together only after
in-app deletion and the Wave A release gates pass. The disabled server keeps
Google's existing admission allowlist. When enabled, Apple and Google allow
new rowers; `C2_ALLOWED_EMAILS` still independently controls Concept2 access.

Before enabling on an HTTPS deployment:

1. Enable Sign in with Apple for the primary App ID `haus.waffle.ergomatic`.
   Refresh provisioning for the native entitlement; an unsigned simulator
   build does not verify provisioning or an actual Apple authorization.
2. Register a distinct Services ID and associate it with that primary App ID.
   Register the deployment domain and exact return URL
   `https://ergomatic.waffle.haus/api/auth/apple/callback` (substitute the
   configured `SITE_URL` origin for another deployment). Grouping and shared
   subject identity still require the real native/web continuity check.
3. Create a Sign in with Apple private key associated with the primary App ID.
   Put its Team ID, Key ID and downloaded PKCS8 `.p8` key in the server-only
   `APPLE_TEAM_ID`, `APPLE_KEY_ID` and `APPLE_PRIVATE_KEY` values. This is a
   Sign in with Apple service key, separate from an App Store upload key.
4. Set `APPLE_NATIVE_CLIENT_ID=haus.waffle.ergomatic` and
   `APPLE_WEB_CLIENT_ID` to the registered Services ID. Neither is a secret;
   the private key must never be a `VITE_` value or enter the app bundle.
5. Add `https://ergomatic.waffle.haus/api/auth/google/callback` to the Google
   web client's redirect URLs, preserving `/api/auth/callback` for installed
   clients. For a different deployment use that HTTPS `SITE_URL` origin.

The enabled server rejects missing or invalid Apple configuration at boot,
including a non-HTTPS site or identical native/web audiences. Changes require
container recreation. Compose's double-quoted `.env` values decode `\n` to
actual line breaks, so the PEM can occupy one quoted assignment. Do not print
a resolved compose configuration containing real credentials.

Hide My Email works through the Apple subject; its relay email is stored as
an opaque contact address. Sending mail to relay addresses is a separate
configuration: register outgoing email sources with Apple's relay service
before adding an email-sending feature. This login slice adds no email sender.

PRIMARY setup references: [web association](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web),
[service key](https://developer.apple.com/help/account/capabilities/create-a-sign-in-with-apple-private-key),
and [relay mail sources](https://developer.apple.com/help/account/capabilities/configure-private-email-relay-service).
```

- [ ] Add this row to `docs/RELEASING.md`'s rollback table; replace the old ending of the migration 0030 note with the paragraph below so the record no longer says production code cannot create a sub-less user.

```markdown
| The release carrying Apple sign-in and migration 0031 — untagged; activation-dependent authentication floor | The additive schema is compatible with the preceding image while unused. Once an Apple-only account exists, an image without Apple login cannot authenticate that rower, even though health and migrations pass. Keep all later deployment and rollback targets at or above this release after activation. Turning `FRONT_DOOR_ENABLED` off also removes Apple login, so it is not an account-preserving rollback for Apple-only rowers. Preserve the Apple-capable path and fix forward; do not delete or merge accounts to make an older image work. |

Migration 0030 alone did not add a producer of Apple-only accounts. The Apple
front door now does; the activation-dependent authentication floor is recorded
in the table above. Schema compatibility does not prove sign-in availability.
```

- [ ] Validate exact configuration with synthetic credentials only; compare resolved values in memory and print booleans, never the private key. Confirm the checked-in defaults resolve disabled and credentials stay on the API service. No service starts for this check.
- [ ] Run branch documentation gates and commit these files with the integrated server task; verify the worktree root immediately before committing.

## Paste-test evidence

Run from the worktree root with Python 3, OpenSSL and Docker Compose available:

```sh
python3 docs/superpowers/plans/apple-deployment-evidence/validate.py
```

The archived validator extracts both complete blocks above into a temporary
directory, creates a synthetic P-256 private key, and compares resolved values
in memory. Its measured output is archived beside it as `result.json`:
default disabled, API-only credentials, exact PEM newline preservation and
all explicit values preserved are true; services started and real credentials
used are false. The temporary files are removed on exit. This proves Compose
interpolation and transport only. The server module owns parsing and boot
refusal tests. Real portal registration and authorization remain operator gates.
