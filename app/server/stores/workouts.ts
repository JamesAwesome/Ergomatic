import { and, asc, eq, isNull, or } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { workouts } from '../db/schema.js'
import type { WorkoutInput } from '../../domain/types.js'
import { StoreConflictError, isUniqueViolation } from './errors.js'

export type WorkoutSource = 'starter' | 'user'
export type NewWorkoutInput = WorkoutInput & { source: WorkoutSource }

// user_id NULL marks a global starter-library row (seeded once at boot,
// shared read-only by every user — see app/server/seed/seed.ts). Every row
// handed back to a caller carries `isGlobal` so routes/UI can tell the two
// apart without re-deriving it from userId themselves.
function withIsGlobal<T extends { userId: string | null }>(row: T): T & { isGlobal: boolean } {
  return { ...row, isGlobal: row.userId === null }
}

export function createWorkoutsStore(db: Db) {
  return {
    // Spans globals ∪ this user's personal rows.
    async list(userId: string) {
      const rows = await db
        .select()
        .from(workouts)
        .where(or(isNull(workouts.userId), eq(workouts.userId, userId)))
        .orderBy(asc(workouts.num))
      return rows.map(withIsGlobal)
    },

    // Resolves globals too, so a caller can GET any global id regardless of
    // who's asking.
    async get(userId: string, id: string) {
      const rows = await db
        .select()
        .from(workouts)
        .where(and(or(isNull(workouts.userId), eq(workouts.userId, userId)), eq(workouts.id, id)))
      const row = rows[0]
      return row ? withIsGlobal(row) : null
    },

    // Always personal: userId is never null here.
    async create(userId: string, input: NewWorkoutInput) {
      try {
        const [row] = await db
          .insert(workouts)
          .values({
            userId,
            num: input.num,
            title: input.title,
            type: input.type,
            difficulty: input.difficulty,
            pain: input.pain,
            source: input.source,
            steps: input.steps,
          })
          .returning()
        return withIsGlobal(row)
      } catch (err) {
        if (isUniqueViolation(err)) throw new StoreConflictError(`workout num ${input.num} already exists`)
        throw err
      }
    },

    // userId may be null here — that's how seedGlobalLibrary (see
    // app/server/seed/seed.ts) inserts the shared starter set at boot.
    async createMany(userId: string | null, inputs: NewWorkoutInput[]) {
      return db.transaction(async (tx) => {
        try {
          const rows = await tx
            .insert(workouts)
            .values(
              inputs.map((input) => ({
                userId,
                num: input.num,
                title: input.title,
                type: input.type,
                difficulty: input.difficulty,
                pain: input.pain,
                source: input.source,
                steps: input.steps,
              })),
            )
            .returning()
          return rows.map(withIsGlobal)
        } catch (err) {
          if (isUniqueViolation(err)) throw new StoreConflictError('one or more workout nums already exist')
          throw err
        }
      })
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
      try {
        const [row] = await db
          .update(workouts)
          .set({
            num: input.num,
            title: input.title,
            type: input.type,
            difficulty: input.difficulty,
            pain: input.pain,
            steps: input.steps,
            updatedAt: new Date(),
          })
          .where(and(eq(workouts.userId, userId), eq(workouts.id, id)))
          .returning()
        return row ? withIsGlobal(row) : null
      } catch (err) {
        if (isUniqueViolation(err)) throw new StoreConflictError(`workout num ${input.num} already exists`)
        throw err
      }
    },

    // See update()'s note: scoped to `user_id = userId`, structurally
    // incapable of matching a global (NULL user_id) row.
    async remove(userId: string, id: string): Promise<void> {
      await db.delete(workouts).where(and(eq(workouts.userId, userId), eq(workouts.id, id)))
    },

    // Personal count only (excludes globals) — matches its pre-global-model
    // meaning for any caller keying off "how many workouts has this user
    // created."
    async count(userId: string): Promise<number> {
      const rows = await db.select({ id: workouts.id }).from(workouts).where(eq(workouts.userId, userId))
      return rows.length
    },

    // For seeding: are there any global rows already?
    async listGlobals() {
      const rows = await db.select().from(workouts).where(isNull(workouts.userId)).orderBy(asc(workouts.num))
      return rows.map(withIsGlobal)
    },

    async countGlobals(): Promise<number> {
      const rows = await db.select({ id: workouts.id }).from(workouts).where(isNull(workouts.userId))
      return rows.length
    },
  }
}

export type WorkoutsStore = ReturnType<typeof createWorkoutsStore>
