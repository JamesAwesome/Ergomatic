import { and, eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { articleReads } from "../db/schema.js";

export function createArticleReadsStore(db: Db) {
  return {
    async list(userId: string): Promise<string[]> {
      const rows = await db
        .select({ slug: articleReads.slug })
        .from(articleReads)
        .where(eq(articleReads.userId, userId));
      return rows.map((r) => r.slug);
    },

    // Idempotent: a second read of the same article keeps the first read_at.
    async markRead(userId: string, slug: string): Promise<void> {
      await db
        .insert(articleReads)
        .values({ userId, slug })
        .onConflictDoNothing();
    },

    // Idempotent: deleting a slug that was never read (or already deleted)
    // is a no-op, same as the DELETE route's 204-either-way contract.
    async unmarkRead(userId: string, slug: string): Promise<void> {
      await db
        .delete(articleReads)
        .where(
          and(eq(articleReads.userId, userId), eq(articleReads.slug, slug)),
        );
    },
  };
}

export type ArticleReadsStore = ReturnType<typeof createArticleReadsStore>;
