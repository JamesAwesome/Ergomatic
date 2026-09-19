import { createHash, randomBytes } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { sessions, users } from "../db/schema.js";
import type { AccessPolicy } from "./accessPolicy.js";
import type { RevokeApple } from "./appleRevoke.js";
import { dropAttempts } from "./attemptCredentials.js";

/** An explicit "there is nothing to revoke here", for callers with no Apple
 *  front door configured. Never a default — see `createSessionStore`. */
export const noRevoke: RevokeApple = async () => true;

export const SESSION_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Refresh extends the SAME token past the halfway point. Never rotate on
// refresh: rotation races concurrent requests; the idempotent extend cannot.
export function shouldRefresh(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() - now.getTime() < SESSION_TTL_MS / 2;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export interface ResolvedSession {
  sessionId: string;
  user: SessionUser;
  expiresAt: Date;
  refreshed: boolean;
}

/**
 *  `revokeApple` is REQUIRED, not optional, and that is deliberate. An
 *  omitted revoker would mean "this session store silently destroys Apple
 *  credentials", which is the defect this parameter exists to close — a
 *  default would make every future caller fail open. Callers with no Apple
 *  front door configured pass `noRevoke`: there are no Apple tokens to revoke
 *  in that configuration, so saying so explicitly costs nothing and reads as
 *  a decision rather than an omission.
 */
export function createSessionStore(
  db: Db,
  accessPolicy: AccessPolicy,
  revokeApple: RevokeApple,
) {
  return {
    async createSession(
      userId: string,
    ): Promise<{ token: string; expiresAt: Date }> {
      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
      await db
        .insert(sessions)
        .values({ tokenHash: hashToken(token), userId, expiresAt });
      return { token, expiresAt };
    },

    async resolveSession(token: string): Promise<ResolvedSession | null> {
      const now = new Date();
      const rows = await db
        .select({ session: sessions, user: users })
        .from(sessions)
        .innerJoin(users, eq(sessions.userId, users.id))
        .where(eq(sessions.tokenHash, hashToken(token)));
      const row = rows[0];
      if (!row || row.session.expiresAt <= now) return null;
      if (!accessPolicy.allows(row.user.email)) return null;
      let expiresAt = row.session.expiresAt;
      let refreshed = false;
      if (shouldRefresh(expiresAt, now)) {
        expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
        await db
          .update(sessions)
          .set({ expiresAt })
          .where(eq(sessions.id, row.session.id));
        refreshed = true;
      }
      return {
        sessionId: row.session.id,
        user: { id: row.user.id, email: row.user.email, name: row.user.name },
        expiresAt,
        refreshed,
      };
    },

    async deleteSession(token: string): Promise<void> {
      await revokeCascadingAttempts(
        "original_session_id IN (SELECT id FROM sessions WHERE token_hash=$1)",
        [hashToken(token)],
      );
      await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
    },

    async sweepExpired(): Promise<void> {
      const now = new Date();
      await revokeCascadingAttempts(
        "original_session_id IN (SELECT id FROM sessions WHERE expires_at<$1)",
        [now],
      );
      await db.delete(sessions).where(lt(sessions.expiresAt, now));
    },
  };

  /**
   *  WHY THIS LIVES HERE AND NOT IN `attempts.ts`.
   *
   *  `auth_attempts.original_session_id` is `ON DELETE cascade` on `sessions`
   *  (`0031_apple_front_door.sql`), so deleting a session destroys that
   *  session's attempt row — and A CASCADE RETURNS NO ROWS, so no helper in
   *  `attempts.ts` can observe it, and no "that delete statement appears
   *  exactly once in that file" test can see it. A pending link sits at
   *  `link_ready` holding a live Apple refresh token for up to the attempt
   *  TTL, bound to the session the rower is about to end, so signing out
   *  silently destroyed a credential nobody revoked at Apple.
   *
   *  The attempts are deleted EXPLICITLY, just before the sessions, so the
   *  rows come back through `RETURNING` and their credentials can be revoked.
   *  The cascade would have taken those rows anyway; this only changes who
   *  gets to see them go.
   *
   *  BEST EFFORT, AND AFTER OUR OWN WRITE. A failed revoke must never fail a
   *  sign-out: the rower asked to leave, and Apple's write cannot be rolled
   *  back to match ours if ours fails. The rower is not told, because Apple's
   *  duty here is "should" rather than must and they can remove us in Apple ID
   *  settings at any time. The one path where the state is both wrong and
   *  terminal is account deletion, which carries its own notice.
   */
  async function revokeCascadingAttempts(
    where: string,
    params: unknown[],
  ): Promise<void> {
    const { credentials } = await dropAttempts(db.$client, where, params);
    if (!credentials.length) return;
    try {
      await revokeApple(credentials);
    } catch {
      console.warn(JSON.stringify({ event: "apple_revoke_threw" }));
    }
  }
}

export type SessionStore = ReturnType<typeof createSessionStore>;
