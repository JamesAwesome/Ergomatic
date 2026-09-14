import type { AppDeps } from "./app.js";
import type { SessionStore } from "./auth/sessions.js";
import type { UserStore } from "./auth/users.js";
import { createAccessPolicy } from "./auth/accessPolicy.js";

/** Minimal AppDeps for tests that only care about health/static behavior. */
export const TEST_ACCESS_POLICY = createAccessPolicy("public", "");

export function baseDeps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    checkDb: async () => true,
    sessions: { resolveSession: async () => null } as unknown as SessionStore,
    users: {} as UserStore,
    oauth: null,
    nativeVerifier: null,
    accessPolicy: TEST_ACCESS_POLICY,
    siteUrl: "https://ergomatic.example",
    stores: null,
    testAuthSecret: null,
    ...overrides,
  };
}
