import { eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { planState } from "../db/schema.js";

export type PlanKey = "sprint" | "head";

export interface PlanStateRow {
  planKey: PlanKey | null;
  doneN: number;
}

export function createPlanStateStore(db: Db) {
  return {
    async get(userId: string): Promise<PlanStateRow | null> {
      const rows = await db
        .select()
        .from(planState)
        .where(eq(planState.userId, userId));
      const row = rows[0];
      if (!row) return null;
      return { planKey: row.planKey, doneN: row.doneN };
    },

    // Choosing a plan (or clearing it with null) always starts progress over.
    async set(userId: string, planKey: PlanKey | null): Promise<void> {
      await db
        .insert(planState)
        .values({ userId, planKey, doneN: 0 })
        .onConflictDoUpdate({
          target: planState.userId,
          set: { planKey, doneN: 0 },
        });
    },

    // Resets progress on the current plan without changing which plan is active.
    async reset(userId: string): Promise<void> {
      await db
        .insert(planState)
        .values({ userId, planKey: null, doneN: 0 })
        .onConflictDoUpdate({ target: planState.userId, set: { doneN: 0 } });
    },
  };
}

export type PlanStateStore = ReturnType<typeof createPlanStateStore>;
