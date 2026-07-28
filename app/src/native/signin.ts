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
  // GoogleLoginResponse is a discriminated union (online/offline); only the
  // 'online' variant (the default, since we never set `mode: 'offline'`)
  // carries an idToken, so narrow on responseType before reading it.
  const idToken = res.result.responseType === 'online' ? res.result.idToken : null
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
