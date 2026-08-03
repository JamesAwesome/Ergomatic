import { sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { createWorkoutsStore } from "../stores/workouts.js";
import { LIBRARY_WORKOUTS } from "./library/index.js";

// Arbitrary but fixed application-wide key for the seed advisory lock. Any
// constant works; it only has to be the same in every process. Exported so
// seed.integration.test.ts can take the SAME lock from an independent
// connection and prove seedGlobalLibrary actually blocks on it (M2).
export const SEED_LOCK_KEY = 4021739871;

/**
 * Reconciles the shared global library (user_id NULL rows) to the code's
 * LIBRARY_WORKOUTS: no globals → insert; title-set matches → no-op;
 * anything else → swap (delete all globals, insert the current set) inside
 * the same advisory-locked transaction. The swap nulls session_logs'
 * workout_id references (ON DELETE SET NULL) — logs keep their rows and
 * lose the link; accepted for the 35→300 regeneration at TestFlight scale
 * (see the workout-generation spec §6). Personal rows are structurally
 * untouched. Advisory lock unchanged: two booting replicas cannot both
 * observe a mismatch and both swap.
 *
 * Called ONCE from index.ts, after `migrate()` and before the app starts
 * accepting connections — NOT per-user, and NOT from signInWithClaims. The
 * old per-user "seed on first sign-in" plan is dead: every account, new or
 * existing, sees the same global library because it lives outside any
 * user's rows entirely.
 *
 * The check-then-reconcile runs inside a transaction holding a Postgres
 * transaction-scoped advisory lock, so two replicas booting at once cannot
 * both observe a mismatch and both swap. Until 2026-07-30 that race was
 * blocked instead by the two partial unique indexes on `num`; those went
 * away with the column (Phase 5C) and `sort_order` is deliberately NOT
 * unique, so the mutual exclusion is now explicit. The loser simply sees the
 * winner's rows and no-ops.
 */
export async function seedGlobalLibrary(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${SEED_LOCK_KEY})`);
    const workouts = createWorkoutsStore(tx as unknown as Db);

    const globals = await workouts.listGlobals();
    const expected = LIBRARY_WORKOUTS.map((w) => w.title)
      .sort()
      .join("\n");
    const actual = globals
      .map((g) => g.title)
      .sort()
      .join("\n");
    if (actual === expected) return;

    if (globals.length > 0) await workouts.deleteGlobals();
    await workouts.createMany(
      null,
      LIBRARY_WORKOUTS.map((workout) => ({
        ...workout,
        source: "starter" as const,
      })),
    );
  });
}
