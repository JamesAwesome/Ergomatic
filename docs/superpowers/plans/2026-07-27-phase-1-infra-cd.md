# Phase 1: Infra & Continuous Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every push to main lands Ergomatic on https://ergomatic.waffle.haus with zero manual steps, health-gated with automatic rollback.

**Architecture:** The natalie pattern on the same host: hardened two-stage Docker image, compose stack (Postgres 18 + app + cloudflared behind a `tunnel` profile), `/api/health` doing a real `SELECT 1` via an injected `checkDb`, deploy.sh (SHA-validated, dirty-refusing, rollback-on-unhealthy) behind a forced-command SSH key, CI deploy job on a repo-level self-hosted runner.

**Tech Stack:** pg, @testcontainers/postgresql, Docker/Compose, cloudflared, GitHub Actions self-hosted runner.

**Spec:** `docs/superpowers/specs/2026-07-27-phase-1-infra-cd-design.md`

## Global Constraints

- **Verified versions (2026-07-27, re-verify at install per ROADMAP standing rule):** pg 8.22.0, @types/pg 8.20.0, @testcontainers/postgresql 12.0.4; images `node:26.5.0-slim`, `postgres:18.4`, `cloudflare/cloudflared:2026.7.3`; pnpm 11.17.0.
- **Hostname `ergomatic.waffle.haus` lives ONLY in env** (`SITE_URL`, tunnel config) — never in code; James may rename it.
- **Shared-host ports:** app `127.0.0.1:8081`, Postgres `127.0.0.1:5433` (natalie owns 8080/5432). Env-overridable.
- No dotenv loader — the server reads only real environment variables. `DATABASE_URL` is required at startup; refuse to start without it.
- Docker hardening block verbatim: `security_opt: [no-new-privileges:true]`, `cap_drop: [ALL]`, `read_only: true`, `tmpfs: [/tmp]`, `USER node`.
- Every commit passes the live hooks (pre-commit lint+typecheck, pre-push full tests). Coverage stays ≥90 on all metrics.
- Work on branch `phase-1-infra`; PR to main at the end (deploy job only fires on push to main, i.e. at merge).
- Node 26 required locally: verify `PATH="/Users/james/.local/share/nvm/v26.5.0/bin:$PATH" node --version` prints v26.x before any install (see memory: a PATH prefix to a missing dir silently falls back to Node 25 and corrupts dependency resolution).

---

### Task 0: Dependabot triage (do FIRST, on main — James wants these merged early)

Open Dependabot PRs as of 2026-07-27: **#2** `actions/setup-node` 6→7 (CI green) and **#3** npm group bumping `@types/node` 26.1.2 + **typescript 6.0.3→7.0.2** (CI **red** — TS 7 is pinned out by typescript-eslint peer `<6.1.0`; the pin working as intended).

**Files:**
- Modify: `.github/dependabot.yml` (ignore TS majors)

- [ ] **Step 1: Merge the green one**

```bash
gh pr merge 2 --merge --delete-branch
```

- [ ] **Step 2: Teach Dependabot about the TS pin** — in `.github/dependabot.yml`, add to the `/app` npm entry:

```yaml
    ignore:
      # typescript-eslint's peer range excludes TS 7 (>=4.8.4 <6.1.0).
      # Re-check `npm view typescript-eslint peerDependencies` before removing.
      - dependency-name: typescript
        update-types: ["version-update:semver-major"]
```

Commit to main (directly — one-file config change): `git add .github/dependabot.yml && git commit -m "chore: dependabot ignores TS majors (typescript-eslint peer <6.1.0)" && git push`

- [ ] **Step 3: Regenerate #3 without the TS bump**

```bash
gh pr comment 3 --body "@dependabot recreate"
```
Expected: Dependabot rebuilds the group PR with only the `@types/node` bump; merge it when its CI is green (`gh pr checks 3 --watch && gh pr merge 3 --merge --delete-branch`).

- [ ] **Step 4: Sync local main** (`git checkout main && git pull`) before branching `phase-1-infra`.

---

### Task 1: DB-backed health endpoint with injected checkDb (TDD)

**Files:**
- Create: `app/server/db.ts`
- Modify: `app/server/app.ts`, `app/server/index.ts`, `app/server/app.test.ts`, `app/server/health.integration.test.ts`

**Interfaces:**
- Consumes: existing `createApp()` from Phase 0.
- Produces: `createApp(deps: { checkDb: () => Promise<boolean> })`; `createPool(connectionString: string): pg.Pool`; `checkDb(pool: pg.Pool): Promise<boolean>`; `GET /api/health` → `200 {ok:true,db:true}` | `503 {ok:false,db:false}`. Tasks 2/4 rely on these exactly.

- [ ] **Step 1: Re-verify versions, install pg**

```bash
npm view pg version; npm view @types/pg version
cd app && pnpm add pg && pnpm add -D @types/pg
```
Expected: versions match the header table (or newer — use registry truth); lockfile updates.

- [ ] **Step 2: Rewrite `app/server/app.test.ts` with the three failing health tests**

```ts
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from './app.js'

describe('GET /api/health', () => {
  it('returns 200 with db:true when the DB check passes', async () => {
    const res = await request(createApp({ checkDb: async () => true })).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, db: true })
  })

  it('returns 503 with db:false when the DB check fails', async () => {
    const res = await request(createApp({ checkDb: async () => false })).get('/api/health')
    expect(res.status).toBe(503)
    expect(res.body).toEqual({ ok: false, db: false })
  })

  it('returns 503 when the DB check throws', async () => {
    const app = createApp({
      checkDb: async () => {
        throw new Error('boom')
      },
    })
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(503)
    expect(res.body).toEqual({ ok: false, db: false })
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `cd app && pnpm test --project unit`
Expected: FAIL — TypeScript/argument errors (`createApp` takes no argument yet). That is the RED.

- [ ] **Step 4: Implement `app/server/app.ts`**

```ts
import express from 'express'

export interface AppDeps {
  checkDb: () => Promise<boolean>
}

export function createApp({ checkDb }: AppDeps) {
  const app = express()
  app.use(express.json())

  app.get('/api/health', async (_req, res) => {
    let db = false
    try {
      db = await checkDb()
    } catch {
      db = false
    }
    if (db) {
      res.json({ ok: true, db: true })
    } else {
      res.status(503).json({ ok: false, db: false })
    }
  })

  return app
}
```

- [ ] **Step 5: Write `app/server/db.ts`**

```ts
import pg from 'pg'

export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString, connectionTimeoutMillis: 3000 })
}

export async function checkDb(pool: pg.Pool): Promise<boolean> {
  try {
    await pool.query('SELECT 1')
    return true
  } catch {
    return false
  }
}
```

- [ ] **Step 6: Update `app/server/health.integration.test.ts`** (real socket, stubbed DB — the Testcontainers version arrives in Task 2)

```ts
import { describe, it, expect } from 'vitest'
import type { AddressInfo } from 'node:net'
import { createApp } from './app.js'

describe('health over real HTTP', () => {
  it('serves /api/health on a live socket', async () => {
    const server = createApp({ checkDb: async () => true }).listen(0)
    try {
      const { port } = server.address() as AddressInfo
      const res = await fetch(`http://127.0.0.1:${port}/api/health`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true, db: true })
    } finally {
      server.close()
    }
  })
})
```

- [ ] **Step 7: Update `app/server/index.ts`** (DATABASE_URL required, wire the real pool)

```ts
import { createApp } from './app.js'
import { checkDb, createPool } from './db.js'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const pool = createPool(connectionString)
const port = Number(process.env.PORT ?? 8080)
createApp({ checkDb: () => checkDb(pool) }).listen(port, () => {
  console.log(`ergomatic api listening on :${port}`)
})
```

- [ ] **Step 8: Verify green**

Run: `cd app && pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass (unit 3 health tests + fmtSplit, client 1, integration 1). Coverage note: `server/db.ts`'s `checkDb` error path is exercised in Task 2's integration test; if `pnpm test:coverage` dips below 90 on branches at this point, that is expected until Task 2 lands — run coverage at Task 2 Step 4, not here.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: DB-backed /api/health with injected checkDb"
```

---

### Task 2: Testcontainers integration test for the health contract

**Files:**
- Create: `app/server/db.integration.test.ts`

**Interfaces:**
- Consumes: `createApp`, `createPool`, `checkDb` from Task 1.
- Produces: proof the 200/503 contract holds against a real Postgres — the contract the compose healthcheck and deploy gate rely on.

- [ ] **Step 1: Install, requires local Docker running**

```bash
npm view @testcontainers/postgresql version
cd app && pnpm add -D @testcontainers/postgresql
docker info > /dev/null && echo docker-ok
```
Expected: version matches header (or newer); `docker-ok`.

- [ ] **Step 2: Write the failing test `app/server/db.integration.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import request from 'supertest'
import type pg from 'pg'
import { createApp } from './app.js'
import { checkDb, createPool } from './db.js'

describe('health against real Postgres', () => {
  let container: StartedPostgreSqlContainer
  let pool: pg.Pool

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18.4').start()
    pool = createPool(container.getConnectionUri())
  })

  afterAll(async () => {
    await pool.end().catch(() => {})
    await container.stop().catch(() => {})
  })

  it('reports db:true with the database up', async () => {
    const app = createApp({ checkDb: () => checkDb(pool) })
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, db: true })
  })

  it('reports db:false once the database is gone', async () => {
    await container.stop()
    const app = createApp({ checkDb: () => checkDb(pool) })
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(503)
    expect(res.body).toEqual({ ok: false, db: false })
  })
})
```

- [ ] **Step 3: Run it**

Run: `cd app && pnpm test --project integration`
Expected: PASS (3 tests: the socket test + these 2). First run pulls the postgres:18.4 image — allow the 120s timeout. (This test is new coverage, not a RED/GREEN cycle — the implementation already exists; the test proves it against a real database.)

- [ ] **Step 4: Full verify incl. coverage**

Run: `cd app && pnpm lint && pnpm typecheck && pnpm test:coverage`
Expected: all metrics ≥90 (db.ts both paths now covered).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "test: health contract against real Postgres via Testcontainers"
```

---

### Task 3: Dockerfile + .dockerignore + CI docker job

**Files:**
- Create: `app/Dockerfile`, `app/.dockerignore`
- Modify: `.github/workflows/ci.yml` (add `docker` job)

**Interfaces:**
- Consumes: `pnpm build` output layout (`dist/client`, `dist/server/server/index.js`).
- Produces: image listening on 8080 that Task 4's compose builds.

- [ ] **Step 1: Write `app/.dockerignore`**

```
node_modules
dist
coverage
*.tsbuildinfo
.env
```

- [ ] **Step 2: Write `app/Dockerfile`**

```dockerfile
FROM node:26.5.0-slim AS build

# Node 25+ images no longer bundle corepack; install pnpm directly.
RUN npm install -g pnpm@11.17.0

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:26.5.0-slim

RUN npm install -g pnpm@11.17.0

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

USER node

CMD ["node", "dist/server/server/index.js"]
```

- [ ] **Step 3: Build and smoke-test locally**

```bash
cd app && docker build -t ergomatic-test .
docker run --rm -e DATABASE_URL=postgres://nobody:nope@localhost:5/void -p 18080:8080 -d --name erg-smoke ergomatic-test
sleep 2 && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:18080/api/health
docker rm -f erg-smoke
```
Expected: build succeeds; curl prints `503` (server up, DB unreachable — proves the app boots and the health route answers). If the container exits instead, `docker logs erg-smoke` and fix.

- [ ] **Step 4: Add the `docker` job to `.github/workflows/ci.yml`** (after the `app` job)

```yaml
  docker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: docker/setup-buildx-action@v4
      - name: Build app image
        uses: docker/build-push-action@v7
        with:
          context: ./app
          push: false
```

- [ ] **Step 5: Commit**

```bash
git add app/Dockerfile app/.dockerignore .github/workflows/ci.yml
git commit -m "feat: hardened two-stage Dockerfile + CI image build"
```

---

### Task 4: compose.yml + .env.example + dev-db docs

**Files:**
- Create: `compose.yml` (repo root), `.env.example` (repo root)
- Modify: `CLAUDE.md` (dev database one-liner)

**Interfaces:**
- Consumes: Task 3 image; `/api/health` contract from Task 1.
- Produces: the stack `scripts/deploy.sh` (Task 5) brings up with `--wait`.

- [ ] **Step 1: Write `compose.yml`**

```yaml
name: ergomatic

services:
  postgres:
    image: postgres:18.4
    container_name: ergomatic-postgres
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

  app:
    build:
      context: ./app
    container_name: ergomatic-app
    restart: unless-stopped
    # Defense-in-depth: drop privileges, read-only root FS (natalie convention)
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    read_only: true
    tmpfs:
      - /tmp
    ports:
      # Container always listens on 8080; host port defaults to 8081 because
      # natalie owns 8080 on this box. Localhost-bound unless APP_BIND is set.
      - "${APP_BIND:-127.0.0.1}:${APP_PORT:-8081}:8080"
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER:-ergomatic}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-ergomatic}
      SITE_URL: ${SITE_URL:-https://ergomatic.waffle.haus}
      TZ: ${TIMEZONE:-America/New_York}
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

  cloudflared:
    image: cloudflare/cloudflared:2026.7.3
    container_name: ergomatic-cloudflared
    restart: unless-stopped
    profiles: ["tunnel"]
    command: tunnel run
    environment:
      TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN}
    depends_on:
      - app

volumes:
  pgdata:
```

- [ ] **Step 2: Write `.env.example`**

```
# Copy to .env on the deploy host (chmod 600). Nothing here is committed.

# Required
POSTGRES_PASSWORD=

# Optional overrides (defaults shown)
POSTGRES_DB=ergomatic
POSTGRES_USER=ergomatic
POSTGRES_PORT=5433
APP_PORT=8081
APP_BIND=127.0.0.1
SITE_URL=https://ergomatic.waffle.haus
TIMEZONE=America/New_York

# Production only: cloudflared tunnel (get the token from the Cloudflare
# Zero Trust dashboard) and enable the tunnel profile.
CLOUDFLARE_TUNNEL_TOKEN=
COMPOSE_PROFILES=tunnel
```

- [ ] **Step 3: Validate and stand the stack up locally (tunnel off)**

```bash
docker compose config -q && echo config-ok
POSTGRES_PASSWORD=devpass docker compose up -d --build --wait --wait-timeout 120
curl -s http://127.0.0.1:8081/api/health
POSTGRES_PASSWORD=devpass docker compose down -v
```
Expected: `config-ok`; up exits 0 with both services healthy; curl prints `{"ok":true,"db":true}`; down cleans up.

- [ ] **Step 4: Add the dev-db one-liner to `CLAUDE.md`** (under Commands)

```markdown
- Local dev DB: `docker run --rm -d --name erg-dev-pg -p 5433:5432 -e POSTGRES_PASSWORD=dev postgres:18.4`
  then `DATABASE_URL=postgres://postgres:dev@localhost:5433/postgres pnpm dev:server`.
  The server refuses to start without `DATABASE_URL` (no dotenv — real env only).
```

- [ ] **Step 5: Commit**

```bash
git add compose.yml .env.example CLAUDE.md
git commit -m "feat: compose stack (postgres + hardened app + cloudflared profile)"
```

---

### Task 5: deploy.sh + deploy.test.sh + CI deploy-script job

**Files:**
- Create: `scripts/deploy.sh`, `scripts/deploy.test.sh`
- Modify: `.github/workflows/ci.yml` (add `deploy-script` job)

**Interfaces:**
- Consumes: compose stack from Task 4 (`docker compose up -d --build --wait`).
- Produces: `deploy.sh <40-hex-sha>` with exit codes 0/1(rollback)/2(bad sha)/3(dirty); the script Task 6's forced command invokes.

- [ ] **Step 1: Write `scripts/deploy.sh`** (natalie's, adapted comments only)

```bash
#!/usr/bin/env bash
# Host-side deploy. Given the CI-validated commit SHA, check it out and (re)build
# the compose stack, waiting for health; on an unhealthy build, roll back to the
# previously-deployed commit. Invoked (via the forced-command wrapper) as:
#   deploy.sh <40-hex-sha>     with DEPLOY_PATH pointing at the host checkout.
# COMPOSE_PROFILES comes from the host .env — do not pass profile flags here.
set -Eeuo pipefail

SHA="${1:-}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "deploy: refusing — not a 40-hex commit sha: '$SHA'" >&2; exit 2; }

: "${DEPLOY_PATH:?deploy: DEPLOY_PATH is not set}"
cd "$DEPLOY_PATH"

if [ -n "$(git status --porcelain)" ]; then
  echo "deploy: refusing — host checkout is dirty ($DEPLOY_PATH)" >&2
  exit 3
fi

up() { docker compose up -d --build --wait --wait-timeout 120 --remove-orphans; }

PREV="$(git rev-parse HEAD)"
rollback() {
  trap - ERR                                   # don't re-enter on a rollback failure
  echo "deploy: build unhealthy — rolling back to $PREV" >&2
  git checkout --force "$PREV" || true
  up || echo "deploy: WARNING — rollback build did not become healthy" >&2
  exit 1
}
trap rollback ERR

git fetch --prune origin
git checkout --force "$SHA"
echo "deploy: deploying $SHA"
up
echo "deploy: $SHA is healthy"
```

- [ ] **Step 2: Write `scripts/deploy.test.sh`** (natalie's, verbatim)

```bash
#!/usr/bin/env bash
# Unit tests for deploy.sh: a fake `docker` on PATH records calls and can be told
# to fail the Nth `up`; a throwaway git repo stands in for the host checkout.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DEPLOY="$HERE/deploy.sh"
fails=0
check() { if [ "$1" = "$2" ]; then echo "ok: $3"; else echo "FAIL: $3 (want '$2' got '$1')"; fails=$((fails+1)); fi; }

setup() {
  TMP="$(mktemp -d)"
  mkdir -p "$TMP/bin"
  cat > "$TMP/bin/docker" <<'FAKE'
#!/usr/bin/env bash
echo "$@" >> "$FAKE_DOCKER_LOG"
n=$(( $(cat "$FAKE_DOCKER_COUNT") + 1 )); echo "$n" > "$FAKE_DOCKER_COUNT"
if [ "${FAKE_DOCKER_FAIL_ON:-0}" = "$n" ]; then exit 1; fi
exit 0
FAKE
  chmod +x "$TMP/bin/docker"
  git init -q --bare "$TMP/origin.git"
  git clone -q "$TMP/origin.git" "$TMP/work"
  git -C "$TMP/work" -c user.email=t@t -c user.name=t commit -q --allow-empty -m prev
  PREV_SHA=$(git -C "$TMP/work" rev-parse HEAD)
  git -C "$TMP/work" -c user.email=t@t -c user.name=t commit -q --allow-empty -m target
  TARGET_SHA=$(git -C "$TMP/work" rev-parse HEAD)
  git -C "$TMP/work" push -q origin HEAD:main
  git -C "$TMP/work" checkout -q "$PREV_SHA"   # host starts deployed at PREV
  export FAKE_DOCKER_LOG="$TMP/docker.log"; : > "$FAKE_DOCKER_LOG"
  export FAKE_DOCKER_COUNT="$TMP/docker.count"; echo 0 > "$FAKE_DOCKER_COUNT"
  export PATH="$TMP/bin:$PATH"
  export DEPLOY_PATH="$TMP/work"
}
teardown() { rm -rf "$TMP"; unset FAKE_DOCKER_FAIL_ON; }

setup
bash "$DEPLOY" "not-a-sha" >/dev/null 2>&1; check "$?" "2" "rejects a non-sha arg"
teardown

setup
echo x > "$DEPLOY_PATH/uncommitted"; git -C "$DEPLOY_PATH" add -A
bash "$DEPLOY" "$TARGET_SHA" >/dev/null 2>&1; check "$?" "3" "refuses a dirty checkout"
teardown

setup
bash "$DEPLOY" "$TARGET_SHA" >/dev/null 2>&1; rc=$?
check "$rc" "0" "happy path exits 0"
check "$(git -C "$DEPLOY_PATH" rev-parse HEAD)" "$TARGET_SHA" "checked out the target sha"
check "$(grep -c 'up -d --build --wait' "$FAKE_DOCKER_LOG")" "1" "ran compose up once"
teardown

setup
FAKE_DOCKER_FAIL_ON=1 bash "$DEPLOY" "$TARGET_SHA" >/dev/null 2>&1; rc=$?
check "$rc" "1" "unhealthy build exits non-zero"
check "$(git -C "$DEPLOY_PATH" rev-parse HEAD)" "$PREV_SHA" "rolled back to the previous sha"
check "$(grep -c 'up -d --build --wait' "$FAKE_DOCKER_LOG")" "2" "built, then rebuilt on rollback"
teardown

if [ "$fails" = 0 ]; then echo "ALL PASS"; exit 0; else echo "$fails FAILED"; exit 1; fi
```

- [ ] **Step 3: Make executable and run the tests**

```bash
chmod +x scripts/deploy.sh scripts/deploy.test.sh
bash -n scripts/deploy.sh && bash scripts/deploy.test.sh
```
Expected: `ALL PASS` (7 checks).

- [ ] **Step 4: Add the `deploy-script` job to `.github/workflows/ci.yml`**

```yaml
  deploy-script:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - name: Lint + test the deploy script
        run: |
          bash -n scripts/deploy.sh
          bash scripts/deploy.test.sh
```

- [ ] **Step 5: Commit**

```bash
git add scripts .github/workflows/ci.yml
git commit -m "feat: health-gated deploy script with rollback + CI tests"
```

---

### Task 6: CI deploy job + host setup runbook

**Files:**
- Create: `docs/deploy.md`
- Modify: `.github/workflows/ci.yml` (add `deploy` job)

**Interfaces:**
- Consumes: all four existing jobs; `production` environment secrets (created in Task 7).
- Produces: push-to-main → SSH `<sha>` → forced command → `deploy.sh`.

- [ ] **Step 1: Add the `deploy` job to `.github/workflows/ci.yml`** (natalie's verbatim, needs updated)

```yaml
  deploy:
    needs: [root-hooks, app, docker, deploy-script]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: self-hosted
    environment: production
    permissions:
      contents: read
    timeout-minutes: 20
    concurrency:
      group: deploy-prod
      cancel-in-progress: false
    steps:
      - name: Deploy over SSH
        env:
          SHA: ${{ github.sha }}
          DEPLOY_SSH_KEY: ${{ secrets.DEPLOY_SSH_KEY }}
          DEPLOY_KNOWN_HOSTS: ${{ secrets.DEPLOY_KNOWN_HOSTS }}
          DEPLOY_HOST: ${{ secrets.DEPLOY_HOST }}
          DEPLOY_USER: ${{ secrets.DEPLOY_USER }}
        run: |
          umask 077
          KEY="$(mktemp)"; KH="$(mktemp)"
          trap 'rm -f "$KEY" "$KH"' EXIT
          printf '%s\n' "$DEPLOY_SSH_KEY" > "$KEY"
          printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > "$KH"
          ssh -i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes \
            -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$KH" \
            "$DEPLOY_USER@$DEPLOY_HOST" "$SHA"
```

- [ ] **Step 2: Write `docs/deploy.md`** — the one-time host runbook

```markdown
# Deploying Ergomatic

Push to main → CI (root-hooks, app, docker, deploy-script) → `deploy` job on the
self-hosted runner SSHes the commit SHA to the host → a forced command runs
`scripts/deploy.sh <sha>` → compose rebuilds and waits for health → on failure,
automatic rollback to the previous commit.

## One-time host setup (same host as nataliesawacritter.info)

1. **Checkout**: `git clone git@github.com:JamesAwesome/Ergomatic.git ~/Ergomatic`
   (as the deploy user). `cp .env.example .env && chmod 600 .env`; fill in
   `POSTGRES_PASSWORD` and, for the tunnel, `CLOUDFLARE_TUNNEL_TOKEN` +
   `COMPOSE_PROFILES=tunnel`.
2. **Forced-command SSH key**: on the host, create `~/deploy-forced-ergomatic.sh`:

   ```bash
   #!/usr/bin/env bash
   # The only thing the Ergomatic CI deploy key can do: deploy a main SHA.
   set -Eeuo pipefail
   SHA="${SSH_ORIGINAL_COMMAND:-}"
   [[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "deploy-forced: not a sha" >&2; exit 2; }
   export DEPLOY_PATH="$HOME/Ergomatic"
   exec "$DEPLOY_PATH/scripts/deploy.sh" "$SHA"
   ```

   `chmod +x` it. Generate a dedicated keypair (`ssh-keygen -t ed25519 -C ergomatic-deploy`)
   and add to `~/.ssh/authorized_keys`:

   ```
   restrict,command="/home/DEPLOYUSER/deploy-forced-ergomatic.sh" ssh-ed25519 AAAA... ergomatic-deploy
   ```

   A stolen key can only trigger a deploy of a real 40-hex SHA — never a shell.
3. **Runner**: register a repo-level self-hosted runner for
   `JamesAwesome/Ergomatic` (Settings → Actions → Runners → New self-hosted
   runner) on the host, installed as a service. The deploy user must be in the
   `docker` group.
4. **Tunnel**: Cloudflare Zero Trust → Networks → Tunnels → create
   `ergomatic`; add a public hostname `ergomatic.waffle.haus` →
   `http://app:8080`; copy the token into `.env`. (Hostname may change later —
   it lives only here and in `SITE_URL`.)
5. **GitHub environment**: create environment `production` with secrets
   `DEPLOY_SSH_KEY` (the private key), `DEPLOY_KNOWN_HOSTS`
   (`ssh-keyscan -H <host>` output), `DEPLOY_HOST`, `DEPLOY_USER`.
6. **First deploy**: `cd ~/Ergomatic && POSTGRES_PASSWORD=... docker compose up -d --wait`
   once by hand to seed the stack, then let CI take over.

## Rollback

Automatic on failed health gate. Manual: `ssh` to the host,
`cd ~/Ergomatic && git checkout <good-sha> && docker compose up -d --build --wait`.
```

- [ ] **Step 3: Commit** (workflow syntax gets validated by the PR run in Step 4)

```bash
git add .github/workflows/ci.yml docs/deploy.md
git commit -m "feat: CI deploy job (forced-command SSH) + host runbook"
```

- [ ] **Step 4: Open the PR**

```bash
git push -u origin phase-1-infra
gh pr create --base main --head phase-1-infra --title "Phase 1: infra & continuous deployment" --body "$(cat <<'EOF'
Phase 1 of ROADMAP.md per docs/superpowers/specs/2026-07-27-phase-1-infra-cd-design.md:
DB-backed /api/health (pg + Testcontainers proof), hardened Dockerfile, compose
stack (postgres/app/cloudflared), deploy.sh with health-gated rollback, CI
docker/deploy-script/deploy jobs, host runbook.

The deploy job only fires on push to main; host setup (docs/deploy.md) happens
before merge so the merge itself is the first automated deploy.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01UEXqdgDid4Qjd8D5uoRZ3H
EOF
)"
gh run watch --exit-status
```
Expected: all four PR jobs green (`deploy` shows as skipped — it's push-to-main only).

---

### Task 7: Activation — host setup, first deploy, rollback demo (human-in-the-loop)

**Files:**
- Modify: `ROADMAP.md` (Phase 1 → Done), `docs/superpowers/plans/2026-07-27-phase-1-infra-cd.md` (checkboxes)

**Interfaces:**
- Consumes: everything above, merged to main.

This task interleaves with James: steps marked **[HOST]** run on the deploy host / GitHub UI / Cloudflare dashboard and need his access. The controller drives, James executes [HOST] steps (or grants access).

- [ ] **Step 1 [HOST]: Complete the docs/deploy.md one-time setup** (checkout, .env, forced-command key, runner, tunnel, `production` secrets, seed `compose up`)

- [ ] **Step 2: Merge PR** → the merge push runs the `deploy` job. Watch it:

```bash
gh pr merge <PR#> --rebase --delete-branch
gh run watch --exit-status
```
Expected: `deploy` job green; deploy.sh output shows "deploying <sha>" then "<sha> is healthy".

- [ ] **Step 3: Verify the public URL**

```bash
curl -s https://ergomatic.waffle.haus/api/health
```
Expected: `{"ok":true,"db":true}` — and the Ergomatic page loads in a browser.

- [ ] **Step 4: Rollback demonstration (exit criterion 2)** — merge a deliberately unhealthy commit, watch it roll back, then revert:

```bash
git checkout main && git pull
git checkout -b rollback-demo
# Break the health contract: make the app healthcheck impossible
sed -i '' 's|/api/health|/api/definitely-not-health|' compose.yml
git commit -am "test: deliberately unhealthy deploy (rollback demo)" && git push -u origin rollback-demo
gh pr create --fill && gh pr merge --squash --delete-branch
gh run watch --exit-status || echo "deploy failed as intended"
curl -s https://ergomatic.waffle.haus/api/health   # still healthy = rollback worked
git checkout main && git pull && git revert --no-edit HEAD && git push
```
Expected: the deploy job FAILS (health gate), deploy.sh logs "rolling back", the public URL keeps serving the previous healthy build throughout, and the revert lands cleanly (its deploy succeeds).

- [ ] **Step 5: Close out** — ROADMAP Phase 1 → `**Status:** Done`, check its boxes; tick this plan's checkboxes; commit:

```bash
git add ROADMAP.md docs/superpowers/plans/2026-07-27-phase-1-infra-cd.md
git commit -m "docs: Phase 1 complete — CD live at ergomatic.waffle.haus"
git push
```

---

## Exit criteria (from ROADMAP / spec)

- [ ] Push to main → `https://ergomatic.waffle.haus` updates with zero manual steps
- [ ] Deliberately broken deploy rolls back automatically (demonstrated, Task 7 Step 4)
- [ ] `.env.example` + `production` secrets documented; hardening block present in compose
