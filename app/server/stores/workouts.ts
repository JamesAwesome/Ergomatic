import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { workouts } from "../db/schema.js";
import type { WorkoutInput } from "../../domain/types.js";

export type WorkoutSource = "starter" | "user";
// `sortOrder` is the authored ordering key that replaced the retired `num`
// column (Phase 5C). Only createMany(null, …) — the seed path — ever writes
// it; create() ignores this field entirely (H1) since every row it inserts
// is personal and falls back to creation order — see list()'s orderBy.
export type NewWorkoutInput = WorkoutInput & {
  source: WorkoutSource;
  sortOrder?: number | null;
};

// user_id NULL marks a global starter-library row (seeded once at boot,
// shared read-only by every user — see app/server/seed/seed.ts). Every row
// handed back to a caller carries `isGlobal` so routes/UI can tell the two
// apart without re-deriving it from userId themselves.
function withIsGlobal<T extends { userId: string | null }>(
  row: T,
): T & { isGlobal: boolean } {
  return { ...row, isGlobal: row.userId === null };
}

export function createWorkoutsStore(db: Db) {
  return {
    // Spans globals ∪ this user's personal rows.
    async list(userId: string) {
      const rows = await db
        .select()
        .from(workouts)
        .where(or(isNull(workouts.userId), eq(workouts.userId, userId)))
        // Postgres sorts NULLs last for ASC, so the authored globals lead and
        // every row without a sort_order (all personal rows) follows in
        // creation order. Trailing `id` makes ties (same-transaction
        // `created_at`, e.g. a createMany batch) a total order instead of an
        // unspecified one.
        .orderBy(
          asc(workouts.sortOrder),
          asc(workouts.createdAt),
          asc(workouts.id),
        );
      return rows.map(withIsGlobal);
    },

    // Resolves globals too, so a caller can GET any global id regardless of
    // who's asking.
    async get(userId: string, id: string) {
      const rows = await db
        .select()
        .from(workouts)
        .where(
          and(
            or(isNull(workouts.userId), eq(workouts.userId, userId)),
            eq(workouts.id, id),
          ),
        );
      const row = rows[0];
      return row ? withIsGlobal(row) : null;
    },

    // Always personal: userId is never null here. `sortOrder` is deliberately
    // NOT read off `input` — a client-supplied value on the request body
    // (e.g. `POST /api/workouts {"sortOrder": -1}`) must never reach
    // Postgres (H1). Only the seed path (createMany(null, …), below) ever
    // authors a sort_order; every personal row hard-codes null and falls
    // back to created_at ordering, per list()'s orderBy.
    async create(userId: string, input: NewWorkoutInput) {
      const [row] = await db
        .insert(workouts)
        .values({
          userId,
          sortOrder: null,
          title: input.title,
          type: input.type,
          difficulty: input.difficulty,
          pain: input.pain,
          source: input.source,
          steps: input.steps,
        })
        .returning();
      return withIsGlobal(row);
    },

    // userId may be null here — that's how seedGlobalLibrary (see
    // app/server/seed/seed.ts) inserts the shared starter set at boot.
    async createMany(userId: string | null, inputs: NewWorkoutInput[]) {
      // One transaction: if any row in the batch is rejected, none of them
      // land.
      return db.transaction(async (tx) => {
        const rows = await tx
          .insert(workouts)
          .values(
            inputs.map((input) => ({
              userId,
              sortOrder: input.sortOrder ?? null,
              title: input.title,
              type: input.type,
              difficulty: input.difficulty,
              pain: input.pain,
              source: input.source,
              steps: input.steps,
            })),
          )
          .returning();
        return rows.map(withIsGlobal);
      });
    },

    // Scoped to `user_id = userId` exactly, same as before userId was made
    // nullable: userId is always a concrete non-null string here (never the
    // caller's own userId being null), and `user_id = $1` never matches a
    // NULL column in SQL — so a global row's `user_id IS NULL` can never
    // satisfy this predicate. Global rows are therefore STRUCTURALLY
    // unreachable by this method: no explicit isGlobal guard needed, it's a
    // property of how NULL comparison works. Callers still get an
    // application-level 403 (not a silent no-op) by checking isGlobal via
    // get() before calling update — see routes/data.ts.
    async update(userId: string, id: string, input: WorkoutInput) {
      const [row] = await db
        .update(workouts)
        .set({
          title: input.title,
          type: input.type,
          difficulty: input.difficulty,
          pain: input.pain,
          steps: input.steps,
          updatedAt: new Date(),
        })
        .where(and(eq(workouts.userId, userId), eq(workouts.id, id)))
        .returning();
      return row ? withIsGlobal(row) : null;
    },

    // See update()'s note: scoped to `user_id = userId`, structurally
    // incapable of matching a global (NULL user_id) row.
    async remove(userId: string, id: string): Promise<void> {
      await db
        .delete(workouts)
        .where(and(eq(workouts.userId, userId), eq(workouts.id, id)));
    },

    // Personal count only (excludes globals) — matches its pre-global-model
    // meaning for any caller keying off "how many workouts has this user
    // created."
    async count(userId: string): Promise<number> {
      const rows = await db
        .select({ id: workouts.id })
        .from(workouts)
        .where(eq(workouts.userId, userId));
      return rows.length;
    },

    // For seeding: are there any global rows already?
    async listGlobals() {
      const rows = await db
        .select()
        .from(workouts)
        .where(isNull(workouts.userId))
        .orderBy(
          asc(workouts.sortOrder),
          asc(workouts.createdAt),
          asc(workouts.id),
        );
      return rows.map(withIsGlobal);
    },

    async countGlobals(): Promise<number> {
      const rows = await db
        .select({ id: workouts.id })
        .from(workouts)
        .where(isNull(workouts.userId));
      return rows.length;
    },

    // Seed-converge only (see app/server/seed/seed.ts): a global-scoped
    // update that MAY write sortOrder — the exact inverse of update()'s
    // guarantees above. `user_id IS NULL` scoping makes a personal row
    // structurally unreachable, same technique as update()'s inverse.
    async updateGlobal(
      id: string,
      input: WorkoutInput & { sortOrder: number },
    ) {
      const [row] = await db
        .update(workouts)
        .set({
          title: input.title,
          type: input.type,
          difficulty: input.difficulty,
          pain: input.pain,
          steps: input.steps,
          sortOrder: input.sortOrder,
          updatedAt: new Date(),
        })
        .where(and(isNull(workouts.userId), eq(workouts.id, id)))
        .returning();
      return row ? withIsGlobal(row) : null;
    },

    // Seed-converge only: removes exactly the given global rows. [] is a
    // no-op without a database round-trip. Personal ids are ignored by the
    // `user_id IS NULL` scope, never deleted.
    async deleteGlobalsByIds(ids: string[]): Promise<void> {
      if (ids.length === 0) return;
      await db
        .delete(workouts)
        .where(and(isNull(workouts.userId), inArray(workouts.id, ids)));
    },
  };
}

export type WorkoutsStore = ReturnType<typeof createWorkoutsStore>;
