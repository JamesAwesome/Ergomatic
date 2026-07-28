import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import { createApp, type AppDeps } from '../app.js'
import { OAUTH_COOKIE, SESSION_COOKIE } from './cookies.js'
import type { OAuthProvider } from './google.js'
import type { SessionStore } from './sessions.js'
import type { UserStore } from './users.js'

const claims = { sub: 's1', email: 'a@x.com', emailVerified: true, name: 'A' }
const baseUser = { id: 'u1', googleSub: 's1', email: 'a@x.com', name: 'A', createdAt: new Date() }

function deps(overrides: Partial<AppDeps> = {}): AppDeps {
  const sessions = {
    createSession: vi.fn(async () => ({ token: 'tok', expiresAt: new Date(Date.now() + 1000_000) })),
    resolveSession: vi.fn(async () => null),
    deleteSession: vi.fn(async () => {}),
    sweepExpired: vi.fn(async () => {}),
  } as unknown as SessionStore
  const users = {
    findByGoogleSub: vi.fn(async () => null),
    createUser: vi.fn(async () => baseUser),
    updateProfile: vi.fn(async () => {}),
  } as unknown as UserStore
  const oauth: OAuthProvider = {
    authorizationUrl: async () => ({ url: 'https://accounts.google.com/x', cookiePayload: 'p' }),
    callbackClaims: async () => claims,
  }
  return {
    checkDb: async () => true,
    sessions,
    users,
    oauth,
    allowlist: new Set(['a@x.com']),
    siteUrl: 'https://ergomatic.example',
    ...overrides,
  }
}

const cb = (d: AppDeps) =>
  request(createApp(d)).get('/api/auth/callback?code=c&state=s').set('Cookie', `${OAUTH_COOKIE}=p`)

describe('GET /api/auth/signin', () => {
  it('redirects to Google and sets the oauth cookie', async () => {
    const res = await request(createApp(deps())).get('/api/auth/signin')
    expect(res.status).toBe(302)
    expect(res.headers.location).toContain('accounts.google.com')
    expect(res.headers['set-cookie']?.[0]).toContain(`${OAUTH_COOKIE}=p`)
  })
  it('503s when Google env is missing', async () => {
    const res = await request(createApp(deps({ oauth: null }))).get('/api/auth/signin')
    expect(res.status).toBe(503)
  })
})

describe('GET /api/auth/callback', () => {
  it('signs in an allowlisted new user (creates user, sets session cookie, clears oauth cookie)', async () => {
    const d = deps()
    const res = await cb(d)
    expect(res.status).toBe(302)
    expect(res.headers.location).toBe('/')
    expect(d.users.createUser).toHaveBeenCalled()
    // @types/superagent types headers['set-cookie'] as `string`, but Node's raw
    // response keeps multiple Set-Cookie values as an array at runtime.
    const cookies = (res.headers['set-cookie'] as unknown as string[]).join(';')
    expect(cookies).toContain(`${SESSION_COOKIE}=tok`)
    expect(cookies).toContain(`${OAUTH_COOKIE}=;`)
  })
  it('signs in an existing user without touching the allowlist, and upserts profile', async () => {
    const d = deps({ allowlist: new Set() })
    ;(d.users.findByGoogleSub as ReturnType<typeof vi.fn>).mockResolvedValue(baseUser)
    const res = await cb(d)
    expect(res.status).toBe(302)
    expect(res.headers.location).toBe('/')
    expect(d.users.updateProfile).toHaveBeenCalledWith('u1', 'a@x.com', 'A')
  })
  it('denies a non-allowlisted new user, creating nothing', async () => {
    const d = deps({ allowlist: new Set(['other@x.com']) })
    const res = await cb(d)
    expect(res.headers.location).toBe('/?denied=a%40x.com')
    expect(d.users.createUser).not.toHaveBeenCalled()
  })
  it('denies an unverified email before consulting the allowlist', async () => {
    const d = deps()
    d.oauth = {
      ...d.oauth!,
      callbackClaims: async () => ({ ...claims, emailVerified: false }),
    }
    const res = await cb(d)
    expect(res.headers.location).toBe('/?denied=a%40x.com')
    expect(d.users.createUser).not.toHaveBeenCalled()
  })
  it('handles user-cancelled consent silently', async () => {
    const res = await request(createApp(deps())).get('/api/auth/callback?error=access_denied')
    expect(res.status).toBe(302)
    expect(res.headers.location).toBe('/')
  })
  it('maps exchange failures and missing oauth cookie to signin_failed, never 500', async () => {
    const d = deps()
    d.oauth = {
      ...d.oauth!,
      callbackClaims: async () => {
        throw new Error('bad state')
      },
    }
    expect((await cb(d)).headers.location).toBe('/?error=signin_failed')
    const noCookie = await request(createApp(deps())).get('/api/auth/callback?code=c&state=s')
    expect(noCookie.headers.location).toBe('/?error=signin_failed')
  })
  it('maps DB failures after claims to signin_failed with the oauth cookie cleared', async () => {
    const d = deps()
    ;(d.users.findByGoogleSub as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db down'))
    const res = await cb(d)
    expect(res.status).toBe(302)
    expect(res.headers.location).toBe('/?error=signin_failed')
    expect((res.headers['set-cookie'] as unknown as string[]).join(';')).toContain(`${OAUTH_COOKIE}=;`)
  })
})

describe('POST /api/auth/signout and GET /api/me', () => {
  it('me 401s signed out, 200s signed in', async () => {
    const d = deps()
    expect((await request(createApp(d)).get('/api/me')).status).toBe(401)
    ;(d.sessions.resolveSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: 'u1', email: 'a@x.com', name: 'A' },
      expiresAt: new Date(Date.now() + 1000_000),
      refreshed: false,
    })
    const res = await request(createApp(d)).get('/api/me').set('Cookie', `${SESSION_COOKIE}=tok`)
    expect(res.body).toEqual({ user: { id: 'u1', email: 'a@x.com', name: 'A' } })
    expect(res.headers['cache-control']).toBe('no-store')
  })
  it('signout deletes the session and clears the cookie', async () => {
    const d = deps()
    const res = await request(createApp(d))
      .post('/api/auth/signout')
      .set('Cookie', `${SESSION_COOKIE}=tok`)
    expect(res.status).toBe(204)
    expect(d.sessions.deleteSession).toHaveBeenCalledWith('tok')
    expect(res.headers['set-cookie']![0]).toContain(`${SESSION_COOKIE}=;`)
  })
})

describe('SPA fallback', () => {
  it('bare /api 404s instead of serving the shell', async () => {
    const res = await request(createApp(deps())).get('/api')
    expect(res.status).toBe(404)
  })
})
