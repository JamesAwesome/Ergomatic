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
import { isAllowed } from './allowlist.js'
import type { OAuthProvider } from './google.js'
import { requireUser } from './middleware.js'
import type { SessionStore } from './sessions.js'
import type { UserStore } from './users.js'

export interface AuthDeps {
  sessions: SessionStore
  users: UserStore
  oauth: OAuthProvider | null
  allowlist: Set<string>
  siteUrl: string
}

export function createAuthRouter({ sessions, users, oauth, allowlist, siteUrl }: AuthDeps): Router {
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

    const denied = () => {
      res.setHeader('Set-Cookie', clear)
      res.redirect(`/?denied=${encodeURIComponent(claims.email)}`)
    }

    try {
      // email_verified gates the allowlist decision (spec blocker B1).
      if (claims.emailVerified !== true) {
        denied()
        return
      }

      let user = await users.findByGoogleSub(claims.sub)
      if (user) {
        await users.updateProfile(user.id, claims.email, claims.name)
      } else {
        if (!isAllowed(allowlist, claims.email)) {
          denied()
          return
        }
        user = await users.createUser({
          googleSub: claims.sub,
          email: claims.email,
          name: claims.name,
        })
      }

      await sessions.sweepExpired()
      const { token, expiresAt } = await sessions.createSession(user.id)
      res.setHeader('Set-Cookie', [clear, sessionCookie(token, expiresAt)])
      res.redirect('/')
    } catch {
      res.setHeader('Set-Cookie', clear)
      res.redirect('/?error=signin_failed')
    }
  })

  router.post('/api/auth/signout', async (req, res) => {
    const token = getCookie(req.headers.cookie, SESSION_COOKIE)
    if (token) await sessions.deleteSession(token)
    res.setHeader('Set-Cookie', clearSessionCookie())
    res.status(204).end()
  })

  router.get('/api/me', requireUser(sessions), (req, res) => {
    res.json({ user: req.user })
  })

  return router
}
