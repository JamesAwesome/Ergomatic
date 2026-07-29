import { createHash, randomBytes } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { sessions, users } from "../db/schema.js";

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
  user: SessionUser;
  expiresAt: Date;
  refreshed: boolean;
}

export function createSessionStore(db: Db) {
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
        user: { id: row.user.id, email: row.user.email, name: row.user.name },
        expiresAt,
        refreshed,
      };
    },

    async deleteSession(token: string): Promise<void> {
      await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
    },

    async sweepExpired(): Promise<void> {
      await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
    },
  };
}

export type SessionStore = ReturnType<typeof createSessionStore>;
