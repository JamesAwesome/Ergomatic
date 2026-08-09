import { eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { preferences } from "../db/schema.js";
import type { Difficulty } from "../../domain/types.js";

// The warm-up SETTING (2026-08-09's warmup-setting design, §2). Mirrored
// byte-identically in `app/src/api/usePreferences.ts`'s `WarmupSetting` —
// keep the two in lockstep; the client cannot import this module. Bounds
// (time 1..30 whole minutes; distance 100..10000 whole meters; rest 5..595
// whole seconds) are enforced on PUT (`server/routes/data.ts`), not by this
// type, which states shape only.
export type WarmupSetting = (
  { kind: "time"; minutes: number } | { kind: "distance"; meters: number }
) & { restSeconds?: number };

export interface PreferencesRow {
  difficulties: Difficulty[];
  timeCapMinutes: number;
  warmup: WarmupSetting | null;
  countdownSeconds: number;
  paceToleranceSeconds: number;
  accentColor: string;
  startHereDismissed: boolean;
}

// Mirrors the column defaults in app/server/db/schema.ts exactly.
export const PREFERENCES_DEFAULTS: PreferencesRow = {
  difficulties: ["easy", "medium", "hard"],
  timeCapMinutes: 60,
  warmup: null,
  countdownSeconds: 10,
  paceToleranceSeconds: 1,
  accentColor: "#b5341f",
  startHereDismissed: false,
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
        difficulties: row.difficulties as Difficulty[],
        timeCapMinutes: row.timeCapMinutes,
        warmup: row.warmup as WarmupSetting | null,
        countdownSeconds: row.countdownSeconds,
        paceToleranceSeconds: row.paceToleranceSeconds,
        accentColor: row.accentColor,
        startHereDismissed: row.startHereDismissed,
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
