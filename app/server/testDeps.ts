import type { AppDeps } from './app.js'
import type { SessionStore } from './auth/sessions.js'
import type { UserStore } from './auth/users.js'

/** Minimal AppDeps for tests that only care about health/static behavior. */
export function baseDeps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    checkDb: async () => true,
    sessions: { resolveSession: async () => null } as unknown as SessionStore,
    users: {} as UserStore,
    oauth: null,
    nativeVerifier: null,
    allowlist: new Set(),
    siteUrl: 'https://ergomatic.example',
    ...overrides,
  }
}
