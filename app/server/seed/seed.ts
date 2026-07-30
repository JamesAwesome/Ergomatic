import { sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { createWorkoutsStore } from "../stores/workouts.js";
import { STARTER_WORKOUTS } from "./starter.js";

// Arbitrary but fixed application-wide key for the seed advisory lock. Any
// constant works; it only has to be the same in every process. Exported so
// seed.integration.test.ts can take the SAME lock from an independent
// connection and prove seedGlobalLibrary actually blocks on it (M2).
export const SEED_LOCK_KEY = 4021739871;

/**
 * Seeds the ORIGINAL starter library as a shared, read-only global set —
 * `workouts` rows with `user_id: null` (see app/server/db/schema.ts).
 * Idempotent: if any global row already exists, this is a no-op, so it is
 * safe to call on every boot rather than needing a one-time migration-data
 * step.
 *
 * Called ONCE from index.ts, after `migrate()` and before the app starts
 * accepting connections — NOT per-user, and NOT from signInWithClaims. The
 * old per-user "seed on first sign-in" plan is dead: every account, new or
 * existing, sees the same global library because it lives outside any
 * user's rows entirely.
 *
 * The check-then-insert runs inside a transaction holding a Postgres
 * transaction-scoped advisory lock, so two replicas booting at once cannot
 * both observe zero globals and both insert. Until 2026-07-30 that race was
 * blocked instead by the two partial unique indexes on `num`; those went
 * away with the column (Phase 5C) and `sort_order` is deliberately NOT
 * unique, so the mutual exclusion is now explicit. The loser simply sees the
 * winner's rows and no-ops.
 */
export async function seedGlobalLibrary(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${SEED_LOCK_KEY})`);
    const workouts = createWorkoutsStore(tx as unknown as Db);

    const existing = await workouts.countGlobals();
    if (existing > 0) return;

    await workouts.createMany(
      null,
      STARTER_WORKOUTS.map((workout) => ({
        ...workout,
        source: "starter" as const,
      })),
    );
  });
}
