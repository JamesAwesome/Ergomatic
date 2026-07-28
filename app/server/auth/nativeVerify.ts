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
