/* v8 ignore start -- thin openid-client wrapper; proven by the live sign-in,
   not by tests that would just mock Google. */
import * as client from 'openid-client'

export interface Claims {
  sub: string
  email: string
  emailVerified: boolean
  name: string
}

export interface OAuthProvider {
  authorizationUrl(): Promise<{ url: string; cookiePayload: string }>
  callbackClaims(currentUrl: URL, cookiePayload: string): Promise<Claims>
}

export async function createGoogleProvider(opts: {
  clientId: string
  clientSecret: string
  redirectUri: string
}): Promise<OAuthProvider> {
  const config = await client.discovery(
    new URL('https://accounts.google.com'),
    opts.clientId,
    opts.clientSecret,
  )

  return {
    async authorizationUrl() {
      const verifier = client.randomPKCECodeVerifier()
      const challenge = await client.calculatePKCECodeChallenge(verifier)
      const state = client.randomState()
      const url = client.buildAuthorizationUrl(config, {
        redirect_uri: opts.redirectUri,
        scope: 'openid email profile',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
      })
      return { url: url.href, cookiePayload: JSON.stringify({ state, verifier }) }
    },

    async callbackClaims(currentUrl, cookiePayload) {
      const { state, verifier } = JSON.parse(cookiePayload) as { state: string; verifier: string }
      const tokens = await client.authorizationCodeGrant(config, currentUrl, {
        pkceCodeVerifier: verifier,
        expectedState: state,
      })
      const c = tokens.claims()
      if (!c) throw new Error('no id token claims')
      return {
        sub: String(c.sub),
        email: String(c.email ?? ''),
        emailVerified: c.email_verified === true,
        name: String(c.name ?? c.email ?? 'Rower'),
      }
    },
  }
}
/* v8 ignore stop */
