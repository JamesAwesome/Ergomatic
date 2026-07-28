import { isNative } from './platform'

const base = import.meta.env.VITE_API_BASE ?? ''

/** All API calls go through here: native builds get the absolute base URL
 *  and the Keychain bearer; web stays relative with cookie auth.
 *  getStoredToken is dynamically imported so the Keychain plugin
 *  (./native/session) never lands in the web bundle. */
export async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  if (isNative()) {
    const { getStoredToken } = await import('./native/session')
    const token = await getStoredToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }
  return fetch(`${isNative() ? base : ''}${path}`, { ...init, headers })
}
