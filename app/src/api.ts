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
