import { eq } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { baselines } from '../db/schema.js'

export interface BaselinesRow {
  k2Seconds: number | null
  k6Seconds: number | null
}

export function createBaselinesStore(db: Db) {
  return {
    async get(userId: string): Promise<BaselinesRow | null> {
      const rows = await db.select().from(baselines).where(eq(baselines.userId, userId))
      const row = rows[0]
      if (!row) return null
      return { k2Seconds: row.k2Seconds, k6Seconds: row.k6Seconds }
    },

    async put(userId: string, patch: { k2Seconds?: number | null; k6Seconds?: number | null }): Promise<void> {
      await db
        .insert(baselines)
        .values({ userId, ...patch, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: baselines.userId,
          set: { ...patch, updatedAt: new Date() },
        })
    },
  }
}

export type BaselinesStore = ReturnType<typeof createBaselinesStore>
