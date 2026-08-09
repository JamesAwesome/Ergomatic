import { isDeepStrictEqual } from "node:util";
import { sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import type { WorkoutInput } from "../../domain/types.js";
import { createWorkoutsStore } from "../stores/workouts.js";
import { GLOBAL_LIBRARY_SEED } from "./library/index.js";

// Arbitrary but fixed application-wide key for the seed advisory lock. Any
// constant works; it only has to be the same in every process. Exported so
// seed.integration.test.ts can take the SAME lock from an independent
// connection and prove seedGlobalLibrary actually blocks on it (M2).
export const SEED_LOCK_KEY = 4021739871;

type LibraryEntry = WorkoutInput & { sortOrder: number };

// Parsed deep-equal on the content tuple. steps comes back from jsonb with
// Postgres's canonical key order — isDeepStrictEqual makes that invisible;
// a string comparison would phantom-mismatch every boot.
const contentEqual = (
  row: {
    type: string;
    difficulty: string;
    pain: number;
    sortOrder: number | null;
    steps: unknown;
  },
  w: LibraryEntry,
): boolean =>
  row.type === w.type &&
  row.difficulty === w.difficulty &&
  row.pain === w.pain &&
  row.sortOrder === w.sortOrder &&
  isDeepStrictEqual(row.steps, w.steps);

/**
 * Converges the shared global library (user_id NULL rows) onto the code's
 * `library` argument (default `GLOBAL_LIBRARY_SEED`), keyed by title,
 * inside one advisory-locked transaction:
 * content changed → UPDATE in place (row id and session-log links survive —
 * logs snapshot their own data, the FK is navigation only); title missing →
 * INSERT; title removed from code → DELETE (those log links null via
 * ON DELETE SET NULL). Identical state writes nothing. Replaces Phase 6E's
 * title-set swap, whose gap was that content-only edits never reached an
 * existing volume. Two booting replicas cannot both converge: the loser
 * observes the winner's state and writes nothing. `library` is a test seam —
 * the boot call site passes nothing, so it defaults to
 * `GLOBAL_LIBRARY_SEED` (the 300-workout library plus the two designated
 * onboarding rows, Phase 6I — see library/index.ts).
 *
 * Called ONCE from index.ts, after `migrate()` and before the app starts
 * accepting connections — NOT per-user, and NOT from signInWithClaims. The
 * old per-user "seed on first sign-in" plan is dead: every account, new or
 * existing, sees the same global library because it lives outside any
 * user's rows entirely.
 *
 * The check-then-converge runs inside a transaction holding a Postgres
 * transaction-scoped advisory lock, so two replicas booting at once cannot
 * both observe the same mismatch and both write. Until 2026-07-30 that race
 * was blocked instead by the two partial unique indexes on `num`; those went
 * away with the column (Phase 5C) and `sort_order` is deliberately NOT
 * unique, so the mutual exclusion is now explicit. The loser simply sees the
 * winner's rows and no-ops.
 */
export async function seedGlobalLibrary(
  db: Db,
  library: readonly LibraryEntry[] = GLOBAL_LIBRARY_SEED,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${SEED_LOCK_KEY})`);
    const workouts = createWorkoutsStore(tx as unknown as Db);

    const globals = await workouts.listGlobals();
    const codeTitles = new Set(library.map((w) => w.title));

    // First row per title wins; legacy duplicates (impossible via this
    // seed, defensive only) fall into toDelete with the removed titles.
    const byTitle = new Map<string, (typeof globals)[number]>();
    const toDelete: string[] = [];
    for (const g of globals) {
      if (!codeTitles.has(g.title) || byTitle.has(g.title)) toDelete.push(g.id);
      else byTitle.set(g.title, g);
    }

    for (const w of library) {
      const row = byTitle.get(w.title);
      if (row && !contentEqual(row, w)) await workouts.updateGlobal(row.id, w);
    }

    if (toDelete.length > 0) await workouts.deleteGlobalsByIds(toDelete);

    const toInsert = library.filter((w) => !byTitle.has(w.title));
    if (toInsert.length > 0)
      await workouts.createMany(
        null,
        toInsert.map((w) => ({ ...w, source: "starter" as const })),
      );
  });
}
