# Phase 3: Capacitor iOS Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ergomatic on iPhones via internal TestFlight — native Google sign-in with bearer sessions, tag-derived versions, and a written release discipline — while the web app stays a provably unchanged, continuously-deployed prototype.

**Architecture:** The Capacitor shell wraps the existing Vite bundle (bundled assets, `haus.waffle.ergomatic`). Auth reuses Phase 2's gate sequence: a native plugin yields a Google ID token, `/api/auth/native` verifies it against Google's JWKS and mints an opaque bearer (same hashed `sessions` row) that lives in the iOS Keychain; `requireUser` goes dual-mode. Versions derive from annotated git tags only.

**Tech Stack:** @capacitor/{core,cli,ios} 8.4.2, @capgo/capacitor-social-login 8.3.39, @capacitor-community/keep-awake 8.0.1, @aparajita/capacitor-secure-storage 8.0.0, jose 6.2.4.

**Spec (binding):** `docs/superpowers/specs/2026-07-28-phase-3-capacitor-shell-design.md`

## Global Constraints

- **Verified versions (2026-07-28, re-verify at install):** as listed in Tech Stack. openid-client stays for web; `jose` is for JWKS verification only.
- Node 26 via `PATH="/Users/james/.local/share/nvm/v26.5.0/bin:$PATH"` on EVERY command including `git commit`/`git push`; no engine warnings tolerated.
- Branch `phase-3-capacitor` (exists, spec committed). Main is PR-only.
- **Web unchanged**: the web bundle must not import Capacitor APIs except through `src/platform.ts`; all existing tests stay green untouched (except where a file is explicitly listed as Modified).
- **API additive-only between tags** starts now: nothing in this phase may change an existing endpoint's shape — only add.
- Hostname env-only rule: native builds bake the API base via `VITE_API_BASE`, set by the `ios:build` script from `ERGOMATIC_API_BASE` (default `https://ergomatic.waffle.haus` lives in that ONE script line).
- Versions: annotated `vX.Y.Z` tags only; never hand-edit a version anywhere.
- **Xcode is NOT installed on this Mac** (CommandLineTools only). Tasks note contingencies; everything requiring Xcode lands in Task 7 (activation). Do not install Xcode yourself — that's James's call during activation.
- Coverage ≥90 all metrics; `pnpm test --project <name>` syntax; hooks must pass.

---

### Task 1: Tag-derived version plumbing

**Files:**
- Create: `scripts/version.sh`
- Modify: `app/server/app.ts` (health handler), `app/server/app.test.ts`, `app/Dockerfile`, `compose.yml`, `scripts/deploy.sh`, `.github/workflows/ci.yml` (docker job build-arg)

**Interfaces:**
- Produces: `scripts/version.sh` printing `VERSION=x.y.z`, `BUILD=<n>`, `DESCRIBE=<git describe>` (eval-able); `/api/health` → `{ok, db, version}` where version = `process.env.APP_VERSION ?? 'dev'`; Docker build arg `APP_VERSION` → env. Task 4's `ios:build` consumes version.sh.

- [ ] **Step 1: Write `scripts/version.sh`**

```bash
#!/usr/bin/env bash
# Single version authority: annotated git tags (hatch-vcs style).
# VERSION  = latest tag without the leading v (0.0.0 before any tag)
# BUILD    = monotonic commit count (Apple requires ever-increasing builds)
# DESCRIBE = human string, e.g. v0.1.0-14-ga1b2c3d (or bare sha pre-tag)
set -euo pipefail
TAG="$(git describe --tags --abbrev=0 2>/dev/null || echo v0.0.0)"
echo "VERSION=${TAG#v}"
echo "BUILD=$(git rev-list --count HEAD)"
echo "DESCRIBE=$(git describe --tags --always --dirty)"
```

`chmod +x scripts/version.sh`. Verify: `bash scripts/version.sh` prints three lines with `VERSION=0.0.0` (no tags exist yet) and a numeric BUILD.

- [ ] **Step 2: Failing test — health carries version.** In `app/server/app.test.ts`, extend the first health test's expectation and add one:

Replace the passing-check test body assertions:

```ts
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, db: true, version: 'dev' })
```

Add after it:

```ts
  it('reports APP_VERSION when set', async () => {
    process.env.APP_VERSION = 'v9.9.9-test'
    try {
      const res = await request(createApp(baseDeps({ checkDb: async () => true }))).get('/api/health')
      expect(res.body.version).toBe('v9.9.9-test')
    } finally {
      delete process.env.APP_VERSION
    }
  })
```

(Also update the 503 test's body expectation to `{ ok: false, db: false, version: 'dev' }`, and the same in `health.integration.test.ts` — grep for `toEqual({ ok:` across tests to catch every site, including db.integration.test.ts.)

- [ ] **Step 3: RED** — `cd app && pnpm test --project unit` fails on the missing field.

- [ ] **Step 4: Implement.** In `app/server/app.ts` health handler, both response branches:

```ts
    const version = process.env.APP_VERSION ?? 'dev'
    if (db) {
      res.json({ ok: true, db: true, version })
    } else {
      res.status(503).json({ ok: false, db: false, version })
    }
```

(Additive: existing consumers — compose healthcheck checks `r.ok` only — unaffected.)

- [ ] **Step 5: Plumb the build arg.** `app/Dockerfile`, in the FINAL stage after `ENV PORT=8080`:

```dockerfile
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
```

`compose.yml` app service build block becomes:

```yaml
    build:
      context: ./app
      args:
        APP_VERSION: ${APP_VERSION:-dev}
```

`scripts/deploy.sh` — add one line directly above the `up()` definition:

```bash
export APP_VERSION="$(git describe --tags --always)"
```

`.github/workflows/ci.yml` docker job — add to the build-push-action `with:` block:

```yaml
          build-args: |
            APP_VERSION=ci
```

- [ ] **Step 6: Verify + commit**

```bash
cd app && pnpm lint && pnpm typecheck && pnpm test
bash -n ../scripts/deploy.sh && bash ../scripts/deploy.test.sh
git add -A && git commit -m "feat: tag-derived version in /api/health and image builds"
```
Expected: all green; deploy harness still ALL PASS (8 checks — the new export doesn't disturb the fake-docker flow).

---

### Task 2: Dual-mode requireUser — bearer sessions (TDD)

**Files:**
- Modify: `app/server/auth/middleware.ts`, `app/server/auth/middleware.test.ts`

**Interfaces:**
- Consumes: `SessionStore`, cookie helpers (unchanged).
- Produces: `requireUser` accepting `Authorization: Bearer <token>` OR the cookie. Bearer refresh → response header `X-Session-Expires-At` (ISO string) instead of Set-Cookie. `originCheck` skips enforcement when the request carries a Bearer authorization header (custom headers can't ride cross-site without a CORS preflight we never answer — no ambient-credential CSRF surface). Task 3/4 rely on both.

- [ ] **Step 1: Failing tests.** Append to `app/server/auth/middleware.test.ts`:

```ts
describe('requireUser bearer mode', () => {
  const resolved = { user, expiresAt: new Date(Date.now() + 1000_000), refreshed: false }

  it('accepts a valid bearer token', async () => {
    const res = await request(guardedApp(fakeStore(resolved)))
      .get('/whoami')
      .set('Authorization', 'Bearer tok')
    expect(res.status).toBe(200)
    expect(res.body.user).toEqual(user)
  })

  it('401s on a bad bearer token', async () => {
    const res = await request(guardedApp(fakeStore(null)))
      .get('/whoami')
      .set('Authorization', 'Bearer nope')
    expect(res.status).toBe(401)
  })

  it('signals bearer refresh via X-Session-Expires-At, not Set-Cookie', async () => {
    const expiresAt = new Date(Date.now() + 1000_000)
    const res = await request(guardedApp(fakeStore({ user, expiresAt, refreshed: true })))
      .get('/whoami')
      .set('Authorization', 'Bearer tok')
    expect(res.headers['set-cookie']).toBeUndefined()
    expect(res.headers['x-session-expires-at']).toBe(expiresAt.toISOString())
  })

  it('prefers bearer over a simultaneously-present cookie', async () => {
    const store = {
      resolveSession: vi.fn(async (token: string) =>
        token === 'bearer-tok' ? resolved : null,
      ),
    } as unknown as SessionStore
    const res = await request(guardedApp(store))
      .get('/whoami')
      .set('Authorization', 'Bearer bearer-tok')
      .set('Cookie', `${SESSION_COOKIE}=cookie-tok`)
    expect(res.status).toBe(200)
    expect(store.resolveSession).toHaveBeenCalledWith('bearer-tok')
  })
})

describe('originCheck bearer exemption', () => {
  const app = express()
  app.use(originCheck('https://ergomatic.example'))
  app.post('/m', (_req, res) => {
    res.json({ ok: true })
  })

  it('lets a bearer request through despite a foreign Origin', async () => {
    const res = await request(app)
      .post('/m')
      .set('Origin', 'https://evil.example')
      .set('Authorization', 'Bearer tok')
    expect(res.status).toBe(200)
  })

  it('still blocks cookie-style requests from foreign origins', async () => {
    const res = await request(app).post('/m').set('Origin', 'https://evil.example')
    expect(res.status).toBe(403)
  })
})
```

Add `vi` to the vitest import in that file.

- [ ] **Step 2: RED** — `cd app && pnpm test --project unit`.

- [ ] **Step 3: Implement in `app/server/auth/middleware.ts`.** Add a helper and modify both middlewares:

```ts
function bearerToken(req: Request): string | undefined {
  const h = req.headers.authorization
  return h?.startsWith('Bearer ') ? h.slice(7) : undefined
}
```

`originCheck`: inside the MUTATING branch, before the origin comparison:

```ts
      if (bearerToken(req)) {
        next()
        return
      }
```

`requireUser`: replace the token extraction and refresh signaling:

```ts
    const bearer = bearerToken(req)
    const token = bearer ?? getCookie(req.headers.cookie, SESSION_COOKIE)
    if (!token) {
      res.status(401).json({ error: 'unauthenticated' })
      return
    }
    const resolved = await store.resolveSession(token)
    if (!resolved) {
      res.status(401).json({ error: 'unauthenticated' })
      return
    }
    if (resolved.refreshed) {
      if (bearer) {
        res.setHeader('X-Session-Expires-At', resolved.expiresAt.toISOString())
      } else {
        res.setHeader('Set-Cookie', sessionCookie(token, resolved.expiresAt))
      }
    }
    req.user = resolved.user
    next()
```

- [ ] **Step 4: GREEN + full suite + commit**

```bash
cd app && pnpm lint && pnpm typecheck && pnpm test
git add -A && git commit -m "feat: bearer sessions — dual-mode requireUser, origin-check exemption"
```

---

### Task 3: POST /api/auth/native — ID-token sign-in (TDD)

**Files:**
- Create: `app/server/auth/nativeVerify.ts`, `app/server/auth/signin.ts`, `app/server/auth/native.test.ts`, `app/server/auth/native.integration.test.ts`
- Modify: `app/server/auth/routes.ts` (extract shared sign-in; add route), `app/server/auth/routes.test.ts` (only if extraction changes imports), `app/server/app.ts` (AppDeps + route), `app/server/testDeps.ts`, `app/server/index.ts` (env + warning), `compose.yml`, `.env.example`, `docs/deploy.md`

**Interfaces:**
- Consumes: `SessionStore`, `UserStore`, `isAllowed`, `Claims` shape from Phase 2 (`{sub, email, emailVerified, name}`).
- Produces:
  - `signInWithClaims(deps, claims)` in `signin.ts` → `{outcome:'ok', user, token, expiresAt}` | `{outcome:'denied', email}` — the single shared gate sequence (email_verified → existing-sub upsert | allowlist → create → sweep → mint). The web callback in routes.ts is refactored to call it (behavior identical).
  - `createNativeVerifier(iosClientId: string): NativeTokenVerifier` in `nativeVerify.ts` where `NativeTokenVerifier = (idToken: string) => Promise<Claims>` (jose `createRemoteJWKSet('https://www.googleapis.com/oauth2/v3/certs')` + `jwtVerify` with issuer `https://accounts.google.com` and audience = iosClientId; maps claims; coverage-excluded thin wrapper, same policy as google.ts).
  - New `AppDeps.nativeVerifier: NativeTokenVerifier | null`; route `POST /api/auth/native {idToken}` → 200 `{token, expiresAt, user}` | 401 `{error:'invalid_token'}` | 403 `{error:'denied', email}` | 503 when unconfigured | 400 when idToken missing/not a string.
  - Env `GOOGLE_IOS_CLIENT_ID`; boot warning when absent.

- [ ] **Step 1: Install jose** (`npm view jose version` first): `cd app && pnpm add jose`

- [ ] **Step 2: Failing tests `app/server/auth/native.test.ts`** (stubbed verifier — the JWKS wrapper itself is coverage-excluded and proven by the live TestFlight sign-in):

```ts
import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { baseDeps } from '../testDeps.js'
import type { SessionStore } from './sessions.js'
import type { UserStore } from './users.js'

const claims = { sub: 's1', email: 'a@x.com', emailVerified: true, name: 'A' }
const dbUser = { id: 'u1', googleSub: 's1', email: 'a@x.com', name: 'A', createdAt: new Date() }

function nativeDeps(overrides: Record<string, unknown> = {}) {
  return baseDeps({
    sessions: {
      createSession: vi.fn(async () => ({ token: 'btok', expiresAt: new Date('2026-09-01') })),
      resolveSession: vi.fn(async () => null),
      deleteSession: vi.fn(async () => {}),
      sweepExpired: vi.fn(async () => {}),
    } as unknown as SessionStore,
    users: {
      findByGoogleSub: vi.fn(async () => null),
      createUser: vi.fn(async () => dbUser),
      updateProfile: vi.fn(async () => {}),
    } as unknown as UserStore,
    allowlist: new Set(['a@x.com']),
    nativeVerifier: async () => claims,
    ...overrides,
  })
}

const post = (deps = nativeDeps(), body: unknown = { idToken: 'jwt' }) =>
  request(createApp(deps)).post('/api/auth/native').send(body)

describe('POST /api/auth/native', () => {
  it('mints a bearer session for an allowlisted new user', async () => {
    const d = nativeDeps()
    const res = await post(d)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      token: 'btok',
      expiresAt: '2026-09-01T00:00:00.000Z',
      user: { id: 'u1', email: 'a@x.com', name: 'A' },
    })
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('signs in an existing sub without the allowlist and upserts', async () => {
    const d = nativeDeps({ allowlist: new Set() })
    ;(d.users.findByGoogleSub as ReturnType<typeof vi.fn>).mockResolvedValue(dbUser)
    const res = await post(d)
    expect(res.status).toBe(200)
    expect(d.users.updateProfile).toHaveBeenCalledWith('u1', 'a@x.com', 'A')
  })

  it('403s a non-allowlisted new user with the email, creating nothing', async () => {
    const d = nativeDeps({ allowlist: new Set(['other@x.com']) })
    const res = await post(d)
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'denied', email: 'a@x.com' })
    expect(d.users.createUser).not.toHaveBeenCalled()
  })

  it('403s an unverified email before the allowlist', async () => {
    const d = nativeDeps({ nativeVerifier: async () => ({ ...claims, emailVerified: false }) })
    const res = await post(d)
    expect(res.status).toBe(403)
    expect(d.users.createUser).not.toHaveBeenCalled()
  })

  it('401s when verification throws (expired/wrong-audience/garbage)', async () => {
    const d = nativeDeps({
      nativeVerifier: async () => {
        throw new Error('bad token')
      },
    })
    const res = await post(d)
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'invalid_token' })
  })

  it('400s a missing idToken', async () => {
    const res = await post(nativeDeps(), {})
    expect(res.status).toBe(400)
  })

  it('503s when the verifier is unconfigured', async () => {
    const res = await post(nativeDeps({ nativeVerifier: null }))
    expect(res.status).toBe(503)
  })

  it('is reachable without an Origin match (bearer-style client)', async () => {
    const res = await request(createApp(nativeDeps()))
      .post('/api/auth/native')
      .set('Origin', 'capacitor://localhost')
      .send({ idToken: 'jwt' })
    expect(res.status).toBe(200)
  })
})
```

Note the last test: `capacitor://localhost` is a foreign origin and this request carries no bearer yet — the route must therefore be registered BEFORE the originCheck middleware in app.ts, OR originCheck must allow `capacitor://localhost` explicitly. **Decision: add `capacitor://localhost` to originCheck's allowed set** (it is our own shell's origin; simpler than route-ordering exceptions). Add this to the originCheck implementation and one line to its test block:

```ts
    expect((await request(app).post('/m').set('Origin', 'capacitor://localhost')).status).toBe(200)
```

- [ ] **Step 3: RED**, then implement.

`app/server/auth/signin.ts` (extraction — the logic moves verbatim from routes.ts's callback):

```ts
import { isAllowed } from './allowlist.js'
import type { Claims } from './google.js'
import type { SessionStore } from './sessions.js'
import type { UserStore } from './users.js'

export interface SignInDeps {
  sessions: SessionStore
  users: UserStore
  allowlist: Set<string>
}

export type SignInResult =
  | { outcome: 'ok'; user: { id: string; email: string; name: string }; token: string; expiresAt: Date }
  | { outcome: 'denied'; email: string }

/** The single gate sequence shared by web callback and native sign-in:
 *  email_verified -> existing-sub upsert | allowlist -> create -> sweep -> mint. */
export async function signInWithClaims(deps: SignInDeps, claims: Claims): Promise<SignInResult> {
  if (claims.emailVerified !== true) {
    return { outcome: 'denied', email: claims.email }
  }
  let user = await deps.users.findByGoogleSub(claims.sub)
  if (user) {
    await deps.users.updateProfile(user.id, claims.email, claims.name)
  } else {
    if (!isAllowed(deps.allowlist, claims.email)) {
      return { outcome: 'denied', email: claims.email }
    }
    user = await deps.users.createUser({
      googleSub: claims.sub,
      email: claims.email,
      name: claims.name,
    })
  }
  await deps.sessions.sweepExpired()
  const { token, expiresAt } = await deps.sessions.createSession(user.id)
  return {
    outcome: 'ok',
    user: { id: user.id, email: user.email, name: user.name },
    token,
    expiresAt,
  }
}
```

`app/server/auth/nativeVerify.ts`:

```ts
/* v8 ignore start -- thin jose/JWKS wrapper; proven by the live TestFlight
   sign-in, same policy as google.ts. */
import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { Claims } from './google.js'

export type NativeTokenVerifier = (idToken: string) => Promise<Claims>

const GOOGLE_JWKS = new URL('https://www.googleapis.com/oauth2/v3/certs')
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com']

export function createNativeVerifier(iosClientId: string): NativeTokenVerifier {
  const jwks = createRemoteJWKSet(GOOGLE_JWKS)
  return async (idToken: string) => {
    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: GOOGLE_ISSUERS,
      audience: iosClientId,
    })
    return {
      sub: String(payload.sub),
      email: String(payload.email ?? ''),
      emailVerified: payload.email_verified === true,
      name: String(payload.name ?? payload.email ?? 'Rower'),
    }
  }
}
/* v8 ignore stop */
```

In `routes.ts`: refactor the callback's post-claims block to call `signInWithClaims` (keeping the existing try/catch → `signin_failed` and the denied → redirect mapping; on ok, set `[clear, sessionCookie(token, expiresAt)]` from the result), and add the native route:

```ts
  router.post('/api/auth/native', async (req, res) => {
    if (!nativeVerifier) {
      res.status(503).json({ error: 'native sign-in unavailable: GOOGLE_IOS_CLIENT_ID not configured' })
      return
    }
    const idToken = (req.body as { idToken?: unknown })?.idToken
    if (typeof idToken !== 'string' || idToken === '') {
      res.status(400).json({ error: 'idToken required' })
      return
    }
    let claims
    try {
      claims = await nativeVerifier(idToken)
    } catch {
      res.status(401).json({ error: 'invalid_token' })
      return
    }
    try {
      const result = await signInWithClaims({ sessions, users, allowlist }, claims)
      if (result.outcome === 'denied') {
        res.status(403).json({ error: 'denied', email: result.email })
        return
      }
      res.json({
        token: result.token,
        expiresAt: result.expiresAt.toISOString(),
        user: result.user,
      })
    } catch {
      res.status(500).json({ error: 'signin_failed' })
    }
  })
```

(`AuthDeps` gains `nativeVerifier: NativeTokenVerifier | null`; `AppDeps` likewise; `testDeps.ts` baseDeps gains `nativeVerifier: null`; `originCheck` allowed-set gains `'capacitor://localhost'`.)

`index.ts` — after the web oauth block:

```ts
const iosClientId = process.env.GOOGLE_IOS_CLIENT_ID ?? ''
const nativeVerifier = iosClientId ? createNativeVerifier(iosClientId) : null
if (!nativeVerifier) {
  console.warn('WARNING: GOOGLE_IOS_CLIENT_ID not set — native (iOS) sign-in is DISABLED')
}
```
and pass `nativeVerifier` into createApp.

- [ ] **Step 4: Integration test `app/server/auth/native.integration.test.ts`** — real Postgres, stubbed verifier: POST native (new allowlisted user) → use the returned bearer on `/api/me` → `POST /api/auth/signout` with the bearer → me 401s:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import request from 'supertest'
import type pg from 'pg'
import { createApp } from '../app.js'
import { baseDeps } from '../testDeps.js'
import { createDb, type Db } from '../db/index.js'
import { createSessionStore } from './sessions.js'
import { createUserStore } from './users.js'

describe('native sign-in lifecycle against real Postgres', () => {
  let container: StartedPostgreSqlContainer
  let pool: pg.Pool
  let db: Db
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18.4').start()
    ;({ pool, db } = createDb(container.getConnectionUri()))
    await migrate(db, { migrationsFolder: 'drizzle' })
    app = createApp(
      baseDeps({
        sessions: createSessionStore(db),
        users: createUserStore(db),
        allowlist: new Set(['n@x.com']),
        nativeVerifier: async () => ({
          sub: 'native-1',
          email: 'n@x.com',
          emailVerified: true,
          name: 'Native Rower',
        }),
      }),
    )
  })

  afterAll(async () => {
    await pool.end().catch(() => {})
    await container.stop().catch(() => {})
  })

  it('mints, uses, and revokes a bearer session', async () => {
    const minted = await request(app).post('/api/auth/native').send({ idToken: 'stub' })
    expect(minted.status).toBe(200)
    const bearer = `Bearer ${minted.body.token}`

    const me = await request(app).get('/api/me').set('Authorization', bearer)
    expect(me.status).toBe(200)
    expect(me.body.user.email).toBe('n@x.com')

    const out = await request(app).post('/api/auth/signout').set('Authorization', bearer)
    expect(out.status).toBe(204)

    expect((await request(app).get('/api/me').set('Authorization', bearer)).status).toBe(401)
  })
})
```

NOTE this requires `signout` to also read the bearer: in `routes.ts` signout, replace the token line with the same `bearerToken(req) ?? getCookie(...)` pattern (export `bearerToken` from middleware.ts or inline two lines).

- [ ] **Step 5: Env plumbing.** compose.yml app env: `GOOGLE_IOS_CLIENT_ID: ${GOOGLE_IOS_CLIENT_ID:-}`. `.env.example` after the Google block: `# iOS native sign-in (Phase 3+): the iOS OAuth client's ID (no secret exists for iOS clients)` + `GOOGLE_IOS_CLIENT_ID=`. docs/deploy.md Google section: add step — create a second OAuth client, type **iOS**, bundle ID `haus.waffle.ergomatic`; put its client ID in `.env`.

- [ ] **Step 6: GREEN everything + coverage + commit**

```bash
cd app && pnpm lint && pnpm typecheck && pnpm test && pnpm test:coverage
git add -A && git commit -m "feat: /api/auth/native — ID-token sign-in minting bearer sessions"
```

---

### Task 4: Capacitor shell + native client wiring

**Files:**
- Create: `app/capacitor.config.ts`, `app/src/platform.ts`, `app/src/api.ts`, `app/src/native/session.ts`, `app/src/native/signin.ts`, `app/src/api.test.ts`, `app/ios/**` (generated — see contingency), `app/scripts/ios-version.sh`
- Modify: `app/package.json` (deps + scripts), `app/src/useMe.ts`, `app/src/You.tsx`, `app/src/SignIn.tsx`, `app/src/SignIn.test.tsx`, `.gitignore`, `app/tsconfig.node.json` (include capacitor.config.ts), `app/vitest.config.ts` (coverage excludes for src/native/**)

**Interfaces:**
- Consumes: `/api/auth/native` contract (Task 3), bearer semantics (Task 2).
- Produces: `isNative(): boolean` (platform.ts — the ONLY Capacitor import reachable from shared web code); `api(path, init?): Promise<Response>` (api.ts — prefixes `VITE_API_BASE`, attaches stored bearer when native); `nativeSignIn(): Promise<void>` and `nativeSignOut(): Promise<void>`; `ios:build` script.

- [ ] **Step 1: Install (verify versions first via npm view):**

```bash
cd app && pnpm add @capacitor/core @capgo/capacitor-social-login @capacitor-community/keep-awake @aparajita/capacitor-secure-storage
pnpm add -D @capacitor/cli @capacitor/ios
```

- [ ] **Step 2: `app/capacitor.config.ts`:**

```ts
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'haus.waffle.ergomatic',
  appName: 'Ergomatic',
  webDir: 'dist/client',
}

export default config
```

Add `capacitor.config.ts` to tsconfig.node.json's include array.

- [ ] **Step 3: Generate the iOS project:**

```bash
cd app && pnpm build && npx cap add ios
```

**Contingency (Xcode absent on this Mac):** if `cap add ios` fails or warns on missing Xcode/CocoaPods, capture the exact output. If the `ios/` directory was generated anyway, commit it and note that `cap sync ios`/pod-install completion moves to Task 7. If nothing was generated, note it in the report and move the entire generation into Task 7 Step 2 — the rest of this task (all TypeScript) proceeds regardless.

`.gitignore` additions:

```
app/ios/App/Pods/
app/ios/App/output/
app/ios/DerivedData/
```

- [ ] **Step 4: Platform + API modules (TDD for api.ts).** `app/src/platform.ts`:

```ts
import { Capacitor } from '@capacitor/core'

export function isNative(): boolean {
  return Capacitor.isNativePlatform()
}
```

Failing tests `app/src/api.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'

afterEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
  vi.doUnmock('./platform')
  vi.doUnmock('./native/session')
})

async function load(native: boolean, token: string | null) {
  vi.doMock('./platform', () => ({ isNative: () => native }))
  vi.doMock('./native/session', () => ({
    getStoredToken: async () => token,
    storeToken: async () => {},
    clearToken: async () => {},
  }))
  return await import('./api')
}

describe('api()', () => {
  it('on web: relative path, no auth header', async () => {
    const fetchMock = vi.fn(async () => new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    const { api } = await load(false, null)
    await api('/api/me')
    expect(fetchMock).toHaveBeenCalledWith('/api/me', expect.objectContaining({}))
    const init = fetchMock.mock.calls[0]![1] as RequestInit
    expect(new Headers(init.headers).get('Authorization')).toBeNull()
  })

  it('on native: prefixes the API base and attaches the bearer', async () => {
    const fetchMock = vi.fn(async () => new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    const { api } = await load(true, 'tok123')
    await api('/api/me')
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.test/api/me')
    const init = fetchMock.mock.calls[0]![1] as RequestInit
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok123')
  })
})
```

(vitest config: define `import.meta.env.VITE_API_BASE` for the client project via `test.env` or a `define` — set `VITE_API_BASE=https://api.test` in the client project's `env` block: `env: { VITE_API_BASE: 'https://api.test' }`.)

Implement `app/src/api.ts`:

```ts
import { isNative } from './platform'
import { getStoredToken } from './native/session'

const base = import.meta.env.VITE_API_BASE ?? ''

/** All API calls go through here: native builds get the absolute base URL
 *  and the Keychain bearer; web stays relative with cookie auth. */
export async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  if (isNative()) {
    const token = await getStoredToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }
  return fetch(`${isNative() ? base : ''}${path}`, { ...init, headers })
}
```

`app/src/native/session.ts` (coverage-excluded — thin plugin wrapper):

```ts
/* v8 ignore start -- thin Keychain wrapper; proven on device. */
import { SecureStorage } from '@aparajita/capacitor-secure-storage'

const KEY = 'erg_bearer'

export async function getStoredToken(): Promise<string | null> {
  const v = await SecureStorage.get(KEY)
  return typeof v === 'string' && v !== '' ? v : null
}

export async function storeToken(token: string): Promise<void> {
  await SecureStorage.set(KEY, token)
}

export async function clearToken(): Promise<void> {
  await SecureStorage.remove(KEY)
}
/* v8 ignore stop */
```

`app/src/native/signin.ts` (coverage-excluded; API names verified against the installed @capgo/capacitor-social-login README — adapt if drifted, note in report):

```ts
/* v8 ignore start -- thin plugin wrapper; proven on device via TestFlight. */
import { SocialLogin } from '@capgo/capacitor-social-login'
import { api } from '../api'
import { clearToken, storeToken } from './session'

export async function initNativeAuth(): Promise<void> {
  await SocialLogin.initialize({
    google: { iOSClientId: import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID ?? '' },
  })
}

/** Returns true on success; throws with a message suitable for the notice area. */
export async function nativeSignIn(): Promise<boolean> {
  const res = await SocialLogin.login({ provider: 'google', options: {} })
  const idToken = res.result?.idToken
  if (!idToken) throw new Error('Google sign-in returned no token')
  const minted = await api('/api/auth/native', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  })
  if (minted.status === 403) {
    const body = (await minted.json()) as { email?: string }
    throw new Error(`${body.email ?? 'This account'} isn't invited to this Ergomatic.`)
  }
  if (!minted.ok) throw new Error('Sign-in failed. Try again.')
  const body = (await minted.json()) as { token: string }
  await storeToken(body.token)
  return true
}

export async function nativeSignOut(): Promise<void> {
  await api('/api/auth/signout', { method: 'POST' })
  await clearToken()
}
/* v8 ignore stop */
```

- [ ] **Step 5: Wire the UI.** `useMe.ts`: replace `fetch('/api/me')` with `api('/api/me')` (import from './api'). `You.tsx`: sign-out handler becomes `isNative() ? await nativeSignOut() : await fetch('/api/auth/signout', {method:'POST'})` — import lazily: `const { nativeSignOut } = await import('./native/signin')` inside the handler so the web bundle only loads it natively. `SignIn.tsx`: when `isNative()`, the button becomes a `<button>` calling a handler that lazy-imports `{ initNativeAuth, nativeSignIn }`, runs them, and on success calls a new `onSignedIn` prop (App re-fetches me by remounting — give App a `key` bump or a refetch callback added to `useMe`: add `refetch()` as a third element of the returned tuple, implemented by re-running the effect via a counter state). On thrown errors, show the message in the existing notice area. Update `SignIn.test.tsx`/`App.test.tsx` minimally: web-mode tests unchanged (isNative false by default in jsdom); add one test mocking `./platform` to native=true asserting the button renders as a button (not a link).

- [ ] **Step 6: Build scripts.** `app/package.json` scripts:

```json
    "ios:build": "eval $(bash ../scripts/version.sh) && VITE_API_BASE=${ERGOMATIC_API_BASE:-https://ergomatic.waffle.haus} VITE_GOOGLE_IOS_CLIENT_ID=${GOOGLE_IOS_CLIENT_ID:-} vite build && npx cap sync ios && bash scripts/ios-version.sh",
    "ios:open": "npx cap open ios"
```

`app/scripts/ios-version.sh`:

```bash
#!/usr/bin/env bash
# Stamp tag-derived VERSION/BUILD into the Xcode project (requires Xcode; run
# on the build Mac). No-op with a warning when agvtool is unavailable.
set -euo pipefail
cd "$(dirname "$0")/.."
eval "$(bash ../scripts/version.sh)"
if ! command -v agvtool >/dev/null || ! xcode-select -p 2>/dev/null | grep -q Xcode; then
  echo "ios-version: Xcode/agvtool unavailable — skipping stamp (VERSION=$VERSION BUILD=$BUILD)" >&2
  exit 0
fi
cd ios/App
agvtool new-marketing-version "$VERSION" > /dev/null
agvtool new-version -all "$BUILD" > /dev/null
echo "ios-version: stamped $VERSION ($BUILD)"
```

`chmod +x`. Coverage excludes in vitest.config.ts: add `'src/native/**'`, `'src/platform.ts'`.

- [ ] **Step 7: Full verify + commit**

```bash
cd app && pnpm lint && pnpm typecheck && pnpm test && pnpm test:coverage && pnpm build
git add -A && git commit -m "feat: Capacitor shell — native sign-in, Keychain bearer, api() wrapper"
```
Expected: everything green; the WEB build output must not contain the social-login plugin code in the main chunk (lazy imports — verify with `grep -rl capgo dist/client/assets/ | head -3`; it may exist as a separate lazy chunk, which is fine).

---

### Task 5: RELEASING.md + CLAUDE.md + runbook docs

**Files:**
- Create: `docs/RELEASING.md`
- Modify: `CLAUDE.md`, `docs/deploy.md` (cross-link)

- [ ] **Step 1: Write `docs/RELEASING.md`:**

```markdown
# Releasing Ergomatic (TestFlight)

The web app at https://ergomatic.waffle.haus deploys continuously on every
merge — it is the Bluetooth-less prototype. TestFlight releases are
**periodic and deliberate**, cut from annotated git tags.

## When to release

Cut a release when any of:
- Native-relevant code changed: auth/session flow, live timer, Capacitor
  config or plugins.
- A user-visible capability is complete (typically a phase exit).
- A security fix landed.
- James says so.

Do NOT release for: web-prototype iterations, docs, infra/CI, refactors
invisible on device.

**Standing rule:** after every merge to main, Claude posts an explicit
recommendation — "TestFlight release recommended: <reasons>" or "No release
needed: <reason>" — based on the PR contents.

## Versioning (hatch-vcs style — never hand-edit)

- Annotated tags `vX.Y.Z` are the ONLY version authority.
- `scripts/version.sh` derives VERSION (latest tag), BUILD (commit count,
  monotonic — Apple requires this), DESCRIBE (`git describe`).
- `/api/health` reports the server's DESCRIBE; the app's About shows its own.
- API changes must be **additive-only between tags**: old TestFlight builds
  talk to the newest server. A breaking change forces a coordinated tag.

## Cutting a release (~15 min, on the build Mac)

1. `git checkout main && git pull`
2. `git tag -a vX.Y.Z -m "<one-line summary>" && git push origin vX.Y.Z`
3. `cd app && GOOGLE_IOS_CLIENT_ID=<id> pnpm ios:build`
4. `pnpm ios:open` → Xcode: Product → Archive → Distribute App →
   TestFlight (internal). No Beta App Review for internal testers.
5. Confirm the build appears in App Store Connect → TestFlight; internal
   testers update automatically.

Notes: internal builds expire after 90 days — re-upload (no new tag needed;
BUILD increments with any new commit). First-time setup lives in
docs/deploy.md ("iOS build machine" section, Task-7 activation).
```

- [ ] **Step 2: CLAUDE.md** — add under Rules:

```markdown
- After every merge to main, post a TestFlight release recommendation
  (docs/RELEASING.md): "recommended: <reasons>" or "not needed". Versions
  come ONLY from annotated vX.Y.Z tags; API changes additive-only between
  tags.
```

and under Commands: `- iOS: pnpm ios:build (tag-derived version; needs GOOGLE_IOS_CLIENT_ID env), pnpm ios:open (Xcode)`.

- [ ] **Step 3: Commit**

```bash
git add docs/RELEASING.md CLAUDE.md docs/deploy.md
git commit -m "docs: release discipline — tag-driven TestFlight, per-merge recommendations"
```

---

### Task 6: PR + web-unchanged proof

- [ ] **Step 1: Local stack proof** (web behavior unchanged; version visible):

```bash
cd app && pnpm build && cd ..
POSTGRES_PASSWORD=devpass APP_VERSION=$(git describe --tags --always) docker compose up -d --build --wait
curl -s http://127.0.0.1:8081/api/health          # {"ok":true,"db":true,"version":"<describe>"}
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8081/api/auth/native -X POST -H 'Content-Type: application/json' -d '{}'   # 503 (unconfigured)
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8081/          # 200
POSTGRES_PASSWORD=devpass docker compose down -v
```

- [ ] **Step 2: Push + PR**

```bash
git push -u origin phase-3-capacitor
gh pr create --base main --head phase-3-capacitor --title "Phase 3: Capacitor iOS shell" --body "$(cat <<'EOF'
Phase 3 per docs/superpowers/specs/2026-07-28-phase-3-capacitor-shell-design.md:
tag-derived versioning (health.version, build args), dual-mode requireUser
(bearer + X-Session-Expires-At), /api/auth/native (jose JWKS, shared
signInWithClaims gate), Capacitor shell (haus.waffle.ergomatic) with native
Google sign-in -> Keychain bearer, RELEASING.md discipline.

Web app unchanged: cookie flow untouched, full suite green, compose-verified.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01UEXqdgDid4Qjd8D5uoRZ3H
EOF
)"
gh run watch --exit-status
```
Expected: four jobs green, deploy skipped.

---

### Task 7: Activation — Xcode, signing, TestFlight, v0.1.0 (human-in-the-loop)

Steps marked **[JAMES]** need his accounts/hands. Prereq: Apple Developer approval email (enrolled + paid 2026-07-28).

- [ ] **Step 1 [JAMES]:** Install Xcode (App Store; large download). Then `sudo xcode-select -s /Applications/Xcode.app && xcodebuild -runFirstLaunch`.
- [ ] **Step 2:** If Task 4 deferred it: `cd app && npx cap add ios`, commit `ios/` (via a small PR).
- [ ] **Step 3 [JAMES]:** Xcode → Settings → Accounts → add Apple ID (approved team). Open `pnpm ios:open`; select the App target → Signing & Capabilities → team; bundle ID `haus.waffle.ergomatic`; automatic signing.
- [ ] **Step 4 [JAMES]:** Google Cloud Console → Credentials → Create OAuth client → type **iOS**, bundle ID `haus.waffle.ergomatic`; add the client ID to the host `.env` as `GOOGLE_IOS_CLIENT_ID` + `docker compose up -d` (recreate); keep the ID handy for local `pnpm ios:build`.
- [ ] **Step 5 [JAMES]:** App Store Connect → My Apps → New App (iOS, Ergomatic, `haus.waffle.ergomatic`, English, private). TestFlight → Internal Testing group with household Apple IDs.
- [ ] **Step 6:** Merge the PR (rebase) → deploy green → `curl https://ergomatic.waffle.haus/api/health` shows the new `version` field. Simulator smoke first: `pnpm ios:build && pnpm ios:open`, run on an iPhone simulator — the shell boots, sign-in reaches Google (simulator sign-in may be flaky; device is authoritative).
  - Verify native fetch path: CapacitorHttp is enabled (capacitor.config.ts) so api() calls bypass WKWebView CORS; if any request still fails preflight in the simulator, fall back to adding a capacitor://localhost CORS middleware server-side.
- [ ] **Step 7:** Tag + first release per docs/RELEASING.md: `git tag -a v0.1.0 -m "First TestFlight: Capacitor shell with native sign-in" && git push origin v0.1.0`, then `pnpm ios:build`, Archive, upload, internal TestFlight.
- [ ] **Step 8 [JAMES]:** On the iPhone: install from TestFlight, sign in with an allowlisted Google account, confirm the You card; sign out/in; confirm a NON-allowlisted account gets the invite-refused message.
- [ ] **Step 9:** Close out: ROADMAP Phase 3 → Done + boxes; plan checkboxes; ledger; close-out PR. Post the first per-merge release recommendation retroactively confirmed (this phase IS the release).

---

## Exit criteria (spec)

- [ ] James signs in and sees his account in the TestFlight build on an iPhone
- [ ] Web app provably unchanged (suite green; prototype deploys; cookie auth untouched)
- [ ] `docs/RELEASING.md` exists; `v0.1.0` cut through the runbook; `/api/health` reports a tag-derived version
