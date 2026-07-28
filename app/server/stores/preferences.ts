import { eq } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { preferences } from '../db/schema.js'
import type { Difficulty } from '../../domain/types.js'

export interface PreferencesRow {
  difficulties: Difficulty[]
  timeCapMinutes: number
  warmupMinutes: number
  warmupOverride: boolean
  countdownSeconds: number
  paceToleranceSeconds: number
  accentColor: string
}

// Mirrors the column defaults in app/server/db/schema.ts exactly.
export const PREFERENCES_DEFAULTS: PreferencesRow = {
  difficulties: ['easy', 'medium', 'hard'],
  timeCapMinutes: 60,
  warmupMinutes: 10,
  warmupOverride: false,
  countdownSeconds: 10,
  paceToleranceSeconds: 1,
  accentColor: '#b5341f',
}

export type PreferencesPatch = Partial<PreferencesRow>

export function createPreferencesStore(db: Db) {
  return {
    async get(userId: string): Promise<PreferencesRow> {
      const rows = await db.select().from(preferences).where(eq(preferences.userId, userId))
      const row = rows[0]
      if (!row) return { ...PREFERENCES_DEFAULTS }
      return {
        difficulties: row.difficulties as Difficulty[],
        timeCapMinutes: row.timeCapMinutes,
        warmupMinutes: row.warmupMinutes,
        warmupOverride: row.warmupOverride,
        countdownSeconds: row.countdownSeconds,
        paceToleranceSeconds: row.paceToleranceSeconds,
        accentColor: row.accentColor,
      }
    },

    async put(userId: string, patch: PreferencesPatch): Promise<void> {
      const values = { ...PREFERENCES_DEFAULTS, ...patch, userId }
      await db
        .insert(preferences)
        .values(values)
        .onConflictDoUpdate({ target: preferences.userId, set: patch })
    },
  }
}

export type PreferencesStore = ReturnType<typeof createPreferencesStore>
