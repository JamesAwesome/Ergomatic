import { eq } from "drizzle-orm";
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
  };
}

export type ArticleReadsStore = ReturnType<typeof createArticleReadsStore>;
