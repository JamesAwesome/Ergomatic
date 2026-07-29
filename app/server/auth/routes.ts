import { Router } from 'express'
import {
  OAUTH_COOKIE,
  SESSION_COOKIE,
  clearOauthCookie,
  clearSessionCookie,
  getCookie,
  oauthCookie,
  sessionCookie,
} from './cookies.js'
import type { OAuthProvider } from './google.js'
import { bearerToken, requireUser } from './middleware.js'
import type { NativeTokenVerifier } from './nativeVerify.js'
import { signInWithClaims } from './signin.js'
import type { SessionStore } from './sessions.js'
import type { UserStore } from './users.js'

export interface AuthDeps {
  sessions: SessionStore
  users: UserStore
  oauth: OAuthProvider | null
  nativeVerifier: NativeTokenVerifier | null
  allowlist: Set<string>
  siteUrl: string
}

export function createAuthRouter({
  sessions,
  users,
  oauth,
  nativeVerifier,
  allowlist,
  siteUrl,
}: AuthDeps): Router {
  const router = Router()

  router.get('/api/auth/signin', async (_req, res) => {
    if (!oauth) {
      res.status(503).json({ error: 'sign-in unavailable: Google OAuth is not configured' })
      return
    }
    const { url, cookiePayload } = await oauth.authorizationUrl()
    res.setHeader('Set-Cookie', oauthCookie(cookiePayload))
    res.redirect(url)
  })

  router.get('/api/auth/callback', async (req, res) => {
    const clear = clearOauthCookie()
    if (typeof req.query.error === 'string') {
      // User cancelled (access_denied) is normal; anything else = retry page.
      res.setHeader('Set-Cookie', clear)
      res.redirect(req.query.error === 'access_denied' ? '/' : '/?error=signin_failed')
      return
    }
    if (!oauth) {
      res.setHeader('Set-Cookie', clear)
      res.redirect('/?error=signin_failed')
      return
    }
    const payload = getCookie(req.headers.cookie, OAUTH_COOKIE)
    if (!payload || typeof req.query.code !== 'string') {
      res.setHeader('Set-Cookie', clear)
      res.redirect('/?error=signin_failed')
      return
    }
    let claims
    try {
      const currentUrl = new URL(req.originalUrl, siteUrl)
      claims = await oauth.callbackClaims(currentUrl, payload)
    } catch {
      res.setHeader('Set-Cookie', clear)
      res.redirect('/?error=signin_failed')
      return
    }

    try {
      const result = await signInWithClaims({ sessions, users, allowlist }, claims)
      if (result.outcome === 'denied') {
        res.setHeader('Set-Cookie', clear)
        res.redirect(`/?denied=${encodeURIComponent(result.email)}`)
        return
      }
      res.setHeader('Set-Cookie', [clear, sessionCookie(result.token, result.expiresAt)])
      res.redirect('/')
    } catch {
      res.setHeader('Set-Cookie', clear)
      res.redirect('/?error=signin_failed')
    }
  })

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

  router.post('/api/auth/signout', async (req, res) => {
    const token = bearerToken(req) ?? getCookie(req.headers.cookie, SESSION_COOKIE)
    if (token) await sessions.deleteSession(token)
    res.setHeader('Set-Cookie', clearSessionCookie())
    res.status(204).end()
  })

  router.get('/api/me', requireUser(sessions), (req, res) => {
    res.json({ user: req.user })
  })

  return router
}
