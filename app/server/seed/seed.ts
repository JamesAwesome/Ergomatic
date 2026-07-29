import type { Db } from '../db/index.js'
import { createWorkoutsStore } from '../stores/workouts.js'
import { STARTER_WORKOUTS } from './starter.js'

/**
 * Seeds the ORIGINAL starter library as a shared, read-only global set —
 * `workouts` rows with `user_id: null` (see the schema change and the two
 * partial unique indexes in app/server/db/schema.ts). Idempotent: if any
 * global row already exists, this is a no-op, so it is safe to call on
 * every boot rather than needing a one-time migration-data step.
 *
 * Called ONCE from index.ts, after `migrate()` and before the app starts
 * accepting connections — NOT per-user, and NOT from signInWithClaims. The
 * old per-user "seed on first sign-in" plan is dead: every account, new or
 * existing, sees the same global library because it lives outside any
 * user's rows entirely.
 */
export async function seedGlobalLibrary(db: Db): Promise<void> {
  const workouts = createWorkoutsStore(db)

  const existing = await workouts.countGlobals()
  if (existing > 0) return

  await workouts.createMany(
    null,
    STARTER_WORKOUTS.map((workout) => ({ ...workout, source: 'starter' as const })),
  )
}
