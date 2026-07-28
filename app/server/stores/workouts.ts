import { and, asc, eq } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { workouts } from '../db/schema.js'
import type { WorkoutInput } from '../../domain/types.js'
import { StoreConflictError, isUniqueViolation } from './errors.js'

export type WorkoutSource = 'starter' | 'user'
export type NewWorkoutInput = WorkoutInput & { source: WorkoutSource }

export function createWorkoutsStore(db: Db) {
  return {
    async list(userId: string) {
      return db.select().from(workouts).where(eq(workouts.userId, userId)).orderBy(asc(workouts.num))
    },

    async get(userId: string, id: string) {
      const rows = await db
        .select()
        .from(workouts)
        .where(and(eq(workouts.userId, userId), eq(workouts.id, id)))
      return rows[0] ?? null
    },

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
        return row
      } catch (err) {
        if (isUniqueViolation(err)) throw new StoreConflictError(`workout num ${input.num} already exists`)
        throw err
      }
    },

    async createMany(userId: string, inputs: NewWorkoutInput[]) {
      return db.transaction(async (tx) => {
        try {
          return await tx
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
        } catch (err) {
          if (isUniqueViolation(err)) throw new StoreConflictError('one or more workout nums already exist')
          throw err
        }
      })
    },

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
        return row ?? null
      } catch (err) {
        if (isUniqueViolation(err)) throw new StoreConflictError(`workout num ${input.num} already exists`)
        throw err
      }
    },

    async remove(userId: string, id: string): Promise<void> {
      await db.delete(workouts).where(and(eq(workouts.userId, userId), eq(workouts.id, id)))
    },

    async count(userId: string): Promise<number> {
      const rows = await db.select({ id: workouts.id }).from(workouts).where(eq(workouts.userId, userId))
      return rows.length
    },
  }
}

export type WorkoutsStore = ReturnType<typeof createWorkoutsStore>
