import { and, desc, eq } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { testHistory } from '../db/schema.js'

export type TestDistance = '2k' | '6k'

export function createTestHistoryStore(db: Db) {
  return {
    async list(userId: string) {
      return db
        .select()
        .from(testHistory)
        .where(eq(testHistory.userId, userId))
        .orderBy(desc(testHistory.loggedAt))
    },

    async append(userId: string, input: { distance: TestDistance; splitSeconds: number }) {
      const [previous] = await db
        .select()
        .from(testHistory)
        .where(and(eq(testHistory.userId, userId), eq(testHistory.distance, input.distance)))
        .orderBy(desc(testHistory.loggedAt))
        .limit(1)

      const deltaSeconds = previous ? input.splitSeconds - previous.splitSeconds : null

      const [row] = await db
        .insert(testHistory)
        .values({
          userId,
          distance: input.distance,
          splitSeconds: input.splitSeconds,
          deltaSeconds,
        })
        .returning()
      return row
    },
  }
}

export type TestHistoryStore = ReturnType<typeof createTestHistoryStore>
