# Phase 1: Infra & Continuous Deployment — Design

Approved 2026-07-27. Implements ROADMAP.md Phase 1 using the proven
`nataliesawacritter.info` pattern, adapted for Ergomatic on the same host.

## Decisions

| Question | Decision |
|---|---|
| Deploy target | Same host as nataliesawacritter.info (Docker, cloudflared, and a natalie runner already present) |
| Public hostname | `ergomatic.waffle.haus` — may change later, so it lives ONLY in env (`SITE_URL`, tunnel config), never in code |
| Approach | Full natalie clone: Postgres in compose now, real DB health check, forced-command SSH deploy, all CI jobs |
| Host ports | App `127.0.0.1:8081` (natalie owns 8080), Postgres `127.0.0.1:5433` (natalie owns 5432); overridable via env |
| Runner | New repo-level self-hosted runner registered for `JamesAwesome/Ergomatic` on the shared host |

Version rule: every image tag and package version below is verified against
the registry at implementation time (ROADMAP standing rule). Values written
here (postgres 18.x, node 26.x-slim, cloudflared) are placeholders for
whatever is current then.

## Containers & compose

**`app/Dockerfile`** — two-stage `node:26.x-slim`:
1. Build stage: `npm i -g pnpm@11.17.0` (Node 26 images lack corepack), copy
   manifests (`package.json pnpm-lock.yaml pnpm-workspace.yaml`) + root
   `.npmrc` is NOT copied (it does not apply inside `app/` — see CLAUDE.md),
   `pnpm install --frozen-lockfile`, copy source, `pnpm build`.
2. Runtime stage: prod-only frozen install, `COPY --from=build /app/dist ./dist`,
   `ENV NODE_ENV=production PORT=8080`, `EXPOSE 8080`, `USER node`,
   `CMD ["node", "dist/server/server/index.js"]` (nested output path from
   `rootDir: "."`).

**`app/.dockerignore`**: `node_modules`, `dist`, `coverage`, `*.tsbuildinfo`.

**`compose.yml`** (repo root, project `ergomatic`):
- `postgres`: `postgres:18.x`; `POSTGRES_DB`/`POSTGRES_USER` default
  `ergomatic`, `POSTGRES_PASSWORD` required (`:?`); volume
  `pgdata:/var/lib/postgresql` (postgres 18 image PGDATA layout);
  `pg_isready` healthcheck; ports `127.0.0.1:${POSTGRES_PORT:-5433}:5432`.
- `app`: `build: ./app`; hardening: `security_opt: [no-new-privileges:true]`,
  `cap_drop: [ALL]`, `read_only: true`, `tmpfs: [/tmp]`; ports
  `${APP_BIND:-127.0.0.1}:${APP_PORT:-8081}:8080`; env: `DATABASE_URL`
  (composed from the postgres vars, host `postgres:5432`), `SITE_URL`
  (default `https://ergomatic.waffle.haus`), `TZ`; `depends_on: postgres:
  condition: service_healthy`; healthcheck fetches
  `http://localhost:8080/api/health` via `node -e fetch(...)` so
  `compose up --wait` means "serving AND DB-connected" — the signal the
  deploy health gate relies on.
- `cloudflared`: current pinned image; `profiles: ["tunnel"]`;
  `command: tunnel run`; `TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN}`;
  `depends_on: app`.
- `volumes: pgdata`.

## Health endpoint (app change)

- New prod dependency: `pg` (+ `@types/pg` dev). Version verified at install.
- `app/server/db.ts`: `createPool(connectionString)` returning a `pg.Pool`,
  plus `checkDb(pool): Promise<boolean>` running `SELECT 1` with a short
  timeout.
- `createApp()` signature becomes `createApp(deps: { checkDb: () => Promise<boolean> })`.
  `GET /api/health` → `200 {ok:true, db:true}` when `checkDb` resolves true;
  `503 {ok:false, db:false}` otherwise (including on throw).
- `server/index.ts` wires the real pool from `DATABASE_URL` (required in
  production; refuse to start without it, matching natalie).
- Local dev: documented one-liner for a throwaway Postgres
  (`docker run --rm -p 5433:5432 -e POSTGRES_PASSWORD=dev postgres:18.x`)
  plus `DATABASE_URL` set in the shell (documented in CLAUDE.md). No dotenv
  loader — the server reads only real environment variables, as in natalie.

## Deploy pipeline

**`scripts/deploy.sh`** — port of natalie's, verbatim behavior:
- Arg must match `^[0-9a-f]{40}$` else exit 2.
- `DEPLOY_PATH` env required; refuse dirty checkout (exit 3).
- `PREV=$(git rev-parse HEAD)`; `trap rollback ERR`; fetch, `checkout --force
  $SHA`, `docker compose up -d --build --wait --wait-timeout 120
  --remove-orphans`. Rollback: checkout `$PREV`, re-up, exit 1.
- `COMPOSE_PROFILES` comes from the host `.env` (tunnel on in prod).

**`scripts/deploy.test.sh`** — ports natalie's test approach: SHA-format
rejection, dirty-checkout refusal, rollback-on-unhealthy (simulated), run by
CI via `bash scripts/deploy.test.sh`; `bash -n` syntax-checks both scripts.

**CI (`.github/workflows/ci.yml`)** — keep `root-hooks` + `app`; add:
- `docker`: buildx build of `./app`, `push: false` (PR-time image proof).
- `deploy-script`: `bash -n scripts/deploy.sh` + `bash scripts/deploy.test.sh`.
- `deploy`: `needs: [root-hooks, app, docker, deploy-script]`; only
  `github.event_name == 'push' && github.ref == 'refs/heads/main'`;
  `runs-on: self-hosted`; `environment: production`; `timeout-minutes: 20`;
  `concurrency: deploy-prod, cancel-in-progress: false`; SSHes the bare SHA
  to `$DEPLOY_USER@$DEPLOY_HOST` with strict host-key checking using
  temp-file key/known_hosts from secrets (natalie's job verbatim).

**Secrets & env**:
- Repo `.env.example`: `POSTGRES_PASSWORD` (required), `POSTGRES_PORT=5433`,
  `APP_PORT=8081`, `APP_BIND=127.0.0.1`, `SITE_URL=https://ergomatic.waffle.haus`,
  `CLOUDFLARE_TUNNEL_TOKEN`, `COMPOSE_PROFILES=tunnel`, `TZ=America/New_York`.
- GitHub `production` environment secrets: `DEPLOY_SSH_KEY`,
  `DEPLOY_KNOWN_HOSTS`, `DEPLOY_HOST`, `DEPLOY_USER`.
- Nothing secret committed; `.env` already gitignored.

## One-time host setup (manual, documented in the plan as a checklist)

1. Clone repo to a deploy path on the host; create `.env` from `.env.example`.
2. Create `deploy` SSH keypair; `authorized_keys` forced-command wrapper that
   validates and passes the SHA to `DEPLOY_PATH`-pinned `deploy.sh`
   (natalie's wrapper pattern).
3. Register repo-level GitHub runner for `JamesAwesome/Ergomatic`
   (label `self-hosted`), run as a service.
4. Cloudflare dashboard: create tunnel, route `ergomatic.waffle.haus` →
   `http://app:8080` over the compose network; put the token in `.env`.
5. Set the four `production` environment secrets in GitHub.

## Testing

- Unit: health handler with injected `checkDb` stub — true → 200 shape,
  false → 503 shape, throw → 503.
- Integration: `@testcontainers/postgresql` (new dev dep) — real pool,
  `/api/health` 200 with DB up; stop container → 503. This pulls the
  Phase 3 Testcontainers wiring forward because the health contract is the
  core deliverable of this phase.
- `deploy.test.sh` covers the deploy script's three behaviors in CI.
- Coverage thresholds unchanged (≥90); `server/db.ts` pool construction may
  be excluded only if it is pure wiring, mirroring `server/index.ts`.

## Exit criteria (ROADMAP Phase 1)

1. `https://ergomatic.waffle.haus` serves the app after a push to main with
   zero manual steps.
2. A deliberately broken deploy (commit whose container fails its
   healthcheck) rolls back automatically — demonstrated once for real.
3. `.env.example` + secrets documented; compose hardening block present.

## Out of scope

- Drizzle/schema/migrations (Phase 3). The `pg` pool exists only for health.
- Auth (Phase 2). PWA/domain rename automation (later).
