import type { AccessPolicy } from "./accessPolicy.js";
import type { Claims } from "./google.js";
import type { SessionStore } from "./sessions.js";
import type { UserStore } from "./users.js";

export interface SignInDeps {
  sessions: SessionStore;
  users: UserStore;
  accessPolicy: AccessPolicy;
}

export type SignInResult =
  | {
      outcome: "ok";
      user: { id: string; email: string; name: string };
      token: string;
      expiresAt: Date;
    }
  | { outcome: "denied"; email: string };

/** The single gate sequence shared by web callback and native sign-in:
 *  email_verified -> existing-sub -> policy -> name refresh/create -> mint. */
export async function signInWithClaims(
  deps: SignInDeps,
  claims: Claims,
): Promise<SignInResult> {
  if (claims.emailVerified !== true) {
    return { outcome: "denied", email: claims.email };
  }
  let user = await deps.users.findByGoogleSub(claims.sub);
  if (user) {
    if (!deps.accessPolicy.allows(user.email)) {
      return { outcome: "denied", email: user.email };
    }
    // THE PROVIDER NAMES AN ACCOUNT ONCE, AT CREATION, AND NEVER AGAIN
    // (James, 2026-09-19). This used to be
    // `updateProfile(user.id, claims.name)`, which re-copied Google's name
    // over ours on EVERY sign-in — and that is what silently reverted a
    // rename, because `/you/account` writes the same column. The rower owns
    // their name now; a name changed at Google no longer flows through, which
    // is the cost James accepted when he chose this over a second column.
  } else {
    if (!deps.accessPolicy.allows(claims.email)) {
      return { outcome: "denied", email: claims.email };
    }
    user = await deps.users.createUser({
      googleSub: claims.sub,
      email: claims.email,
      name: claims.name,
    });
  }
  // No per-user seeding here: the starter library is a global, shared,
  // read-only set seeded once at boot (see app/server/seed/seed.ts +
  // index.ts). Every account — new or pre-existing — sees it immediately
  // without any per-sign-in hook.
  await deps.sessions.sweepExpired();
  const { token, expiresAt } = await deps.sessions.createSession(user.id);
  return {
    outcome: "ok",
    user: { id: user.id, email: user.email, name: user.name },
    token,
    expiresAt,
  };
}
