import { eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { preferences } from "../db/schema.js";

export interface PreferencesRow {
  timeCapMinutes: number;
  countdownSeconds: number;
  paceToleranceSeconds: number;
  accentColor: string;
  startHereDismissed: boolean;
  baselinesSkipped: boolean;
}

// Mirrors the column defaults in app/server/db/schema.ts exactly.
export const PREFERENCES_DEFAULTS: PreferencesRow = {
  timeCapMinutes: 60,
  countdownSeconds: 10,
  paceToleranceSeconds: 1,
  accentColor: "#b5341f",
  startHereDismissed: false,
  baselinesSkipped: false,
};

export type PreferencesPatch = Partial<PreferencesRow>;

export function createPreferencesStore(db: Db) {
  return {
    async get(userId: string): Promise<PreferencesRow> {
      const rows = await db
        .select()
        .from(preferences)
        .where(eq(preferences.userId, userId));
      const row = rows[0];
      if (!row) return { ...PREFERENCES_DEFAULTS };
      return {
        timeCapMinutes: row.timeCapMinutes,
        countdownSeconds: row.countdownSeconds,
        paceToleranceSeconds: row.paceToleranceSeconds,
        accentColor: row.accentColor,
        startHereDismissed: row.startHereDismissed,
        baselinesSkipped: row.baselinesSkipped,
      };
    },

    async put(userId: string, patch: PreferencesPatch): Promise<void> {
      const values = { ...PREFERENCES_DEFAULTS, ...patch, userId };
      await db
        .insert(preferences)
        .values(values)
        .onConflictDoUpdate({ target: preferences.userId, set: patch });
    },
  };
}

export type PreferencesStore = ReturnType<typeof createPreferencesStore>;
