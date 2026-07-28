import { desc, eq, sql } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { planState, sessionLogs } from '../db/schema.js'

export type ActualSource = 'assumed' | 'stopwatch' | 'pm5'
export type HeldResult = 'held' | 'under' | 'over'

export interface LogStep {
  label: string
  targetSplit: number
  actualSplit?: number
  actualSource: ActualSource
  spm?: number
  meters?: number
  seconds?: number
}

export interface LogInput {
  workoutId: string | null
  workoutTitle: string
  workoutType: string
  baselineK2: number | null
  baselineK6: number | null
  held: HeldResult
  pain: number
  notes: string | null
  steps: LogStep[]
}

export function createLogsStore(db: Db) {
  return {
    async list(userId: string, limit: number) {
      return db
        .select()
        .from(sessionLogs)
        .where(eq(sessionLogs.userId, userId))
        .orderBy(desc(sessionLogs.loggedAt))
        .limit(limit)
    },

    // Inserts the log and bumps plan_state.done_n in one transaction so the
    // two writes can never diverge (e.g. a crash after the log lands but
    // before progress advances).
    async create(userId: string, input: LogInput): Promise<{ id: string }> {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .insert(sessionLogs)
          .values({
            userId,
            workoutId: input.workoutId,
            workoutTitle: input.workoutTitle,
            workoutType: input.workoutType,
            baselineK2: input.baselineK2,
            baselineK6: input.baselineK6,
            held: input.held,
            pain: input.pain,
            notes: input.notes,
            steps: input.steps,
          })
          .returning({ id: sessionLogs.id })

        await tx
          .insert(planState)
          .values({ userId, doneN: 1 })
          .onConflictDoUpdate({
            target: planState.userId,
            set: { doneN: sql`${planState.doneN} + 1` },
          })

        return row
      })
    },
  }
}

export type LogsStore = ReturnType<typeof createLogsStore>
