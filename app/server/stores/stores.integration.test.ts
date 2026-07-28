import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { eq } from 'drizzle-orm'
import type pg from 'pg'
import { createDb, type Db } from '../db/index.js'
import { preferences } from '../db/schema.js'
import { createUserStore } from '../auth/users.js'
import { createBaselinesStore } from './baselines.js'
import { createWorkoutsStore } from './workouts.js'
import { createLogsStore } from './logs.js'
import { createPlanStateStore } from './planState.js'
import { createPreferencesStore } from './preferences.js'
import { createTestHistoryStore } from './testHistory.js'
import { StoreConflictError } from './errors.js'
import type { WorkoutInput } from '../../domain/types.js'
import type { LogInput } from './logs.js'

describe('domain stores against real Postgres', () => {
  let container: StartedPostgreSqlContainer
  let pool: pg.Pool
  let db: Db
  let userA: string
  let userB: string

  const workoutInput = (overrides: Partial<WorkoutInput> = {}): WorkoutInput & { source: 'starter' | 'user' } => ({
    num: 1,
    title: 'Steady state',
    type: 'AT',
    difficulty: 'medium',
    pain: 2,
    steps: [{ k: 'wu', minutes: 10 }],
    source: 'user',
    ...overrides,
  })

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18.4').start()
    ;({ pool, db } = createDb(container.getConnectionUri()))
    await migrate(db, { migrationsFolder: 'drizzle' })
    const users = createUserStore(db)
    const a = await users.createUser({ googleSub: 'store-user-a', email: 'a@stores.test', name: 'A' })
    const b = await users.createUser({ googleSub: 'store-user-b', email: 'b@stores.test', name: 'B' })
    userA = a.id
    userB = b.id
  })

  afterAll(async () => {
    await pool.end().catch(() => {})
    await container.stop().catch(() => {})
  })

  describe('baselines store', () => {
    const store = () => createBaselinesStore(db)

    it('returns null when no row exists', async () => {
      expect(await store().get(userA)).toBeNull()
    })

    it('put creates then updates, and get round-trips', async () => {
      const s = store()
      await s.put(userA, { k2Seconds: 420 })
      expect(await s.get(userA)).toMatchObject({ k2Seconds: 420, k6Seconds: null })

      await s.put(userA, { k6Seconds: 1500 })
      expect(await s.get(userA)).toMatchObject({ k2Seconds: 420, k6Seconds: 1500 })
    })

    it('is invisible across users', async () => {
      const s = store()
      await s.put(userB, { k2Seconds: 999 })
      const a = await s.get(userA)
      expect(a?.k2Seconds).not.toBe(999)
    })
  })

  describe('workouts store', () => {
    const store = () => createWorkoutsStore(db)

    it('creates, gets, lists, updates, removes, and counts, scoped to userId', async () => {
      const s = store()
      const created = await s.create(userA, workoutInput({ num: 101, title: 'Row one' }))
      expect(created).toMatchObject({ userId: userA, num: 101, title: 'Row one', source: 'user' })

      const fetched = await s.get(userA, created.id)
      expect(fetched).toMatchObject({ id: created.id, title: 'Row one' })

      expect(await s.get(userB, created.id)).toBeNull()

      const list = await s.list(userA)
      expect(list.some((w) => w.id === created.id)).toBe(true)

      const updated = await s.update(userA, created.id, workoutInput({ num: 101, title: 'Row one updated' }))
      expect(updated).toMatchObject({ title: 'Row one updated' })

      expect(await s.count(userA)).toBeGreaterThan(0)

      await s.remove(userA, created.id)
      expect(await s.get(userA, created.id)).toBeNull()
    })

    it('createMany inserts multiple rows for a user', async () => {
      const s = store()
      const before = await s.count(userA)
      const created = await s.createMany(userA, [
        workoutInput({ num: 201, title: 'Bulk one' }),
        workoutInput({ num: 202, title: 'Bulk two' }),
      ])
      expect(created).toHaveLength(2)
      expect(await s.count(userA)).toBe(before + 2)
    })

    it('throws StoreConflictError on num clash within the same user', async () => {
      const s = store()
      await s.create(userA, workoutInput({ num: 301, title: 'First' }))
      await expect(s.create(userA, workoutInput({ num: 301, title: 'Clash' }))).rejects.toThrow(
        StoreConflictError,
      )
    })

    it('does not clash across users with the same num', async () => {
      const s = store()
      await s.create(userA, workoutInput({ num: 401, title: 'Owner A' }))
      const created = await s.create(userB, workoutInput({ num: 401, title: 'Owner B' }))
      expect(created).toMatchObject({ userId: userB, num: 401 })
    })

    it('throws StoreConflictError on update when the new num clashes for that user', async () => {
      const s = store()
      await s.create(userA, workoutInput({ num: 501, title: 'Keep' }))
      const other = await s.create(userA, workoutInput({ num: 502, title: 'Move me' }))
      await expect(
        s.update(userA, other.id, workoutInput({ num: 501, title: 'Move me' })),
      ).rejects.toThrow(StoreConflictError)
    })

    it('throws StoreConflictError from createMany on an internal num clash', async () => {
      const s = store()
      await expect(
        s.createMany(userA, [
          workoutInput({ num: 701, title: 'Batch one' }),
          workoutInput({ num: 701, title: 'Batch clash' }),
        ]),
      ).rejects.toThrow(StoreConflictError)
      // the whole batch rolled back: neither row landed
      const list = await s.list(userA)
      expect(list.some((w) => w.num === 701)).toBe(false)
    })

    it('cross-user list and get see nothing', async () => {
      const s = store()
      const created = await s.create(userA, workoutInput({ num: 601, title: 'Only A' }))
      const listForB = await s.list(userB)
      expect(listForB.some((w) => w.id === created.id)).toBe(false)
    })
  })

  describe('plan state store', () => {
    const store = () => createPlanStateStore(db)

    it('returns null when absent', async () => {
      const s = store()
      const fresh = await createUserStore(db).createUser({
        googleSub: 'plan-fresh',
        email: 'pf@x.com',
        name: 'PF',
      })
      expect(await s.get(fresh.id)).toBeNull()
    })

    it('set stores a plan key with doneN reset to 0, reset zeroes doneN keeping the key', async () => {
      const s = store()
      await s.set(userA, 'sprint')
      expect(await s.get(userA)).toEqual({ planKey: 'sprint', doneN: 0 })

      await s.set(userA, 'head')
      expect(await s.get(userA)).toEqual({ planKey: 'head', doneN: 0 })

      await s.set(userA, null)
      expect(await s.get(userA)).toEqual({ planKey: null, doneN: 0 })
    })

    it('is invisible across users', async () => {
      const s = store()
      await s.set(userA, 'sprint')
      const users = createUserStore(db)
      const fresh = await users.createUser({ googleSub: 'plan-cross', email: 'pc@x.com', name: 'PC' })
      expect(await s.get(fresh.id)).toBeNull()
    })

    it('reset zeroes doneN on an existing row without touching planKey', async () => {
      const s = store()
      const users = createUserStore(db)
      const fresh = await users.createUser({ googleSub: 'plan-reset', email: 'presetf@x.com', name: 'PR' })
      await s.set(fresh.id, 'head')
      const logs = createLogsStore(db)
      await logs.create(fresh.id, {
        workoutId: null,
        workoutTitle: 'Reset test',
        workoutType: 'AN',
        baselineK2: null,
        baselineK6: null,
        held: 'held',
        pain: 1,
        notes: null,
        steps: [],
      })
      expect(await s.get(fresh.id)).toEqual({ planKey: 'head', doneN: 1 })

      await s.reset(fresh.id)
      expect(await s.get(fresh.id)).toEqual({ planKey: 'head', doneN: 0 })
    })

    it('reset creates a fresh row when none exists', async () => {
      const s = store()
      const users = createUserStore(db)
      const fresh = await users.createUser({ googleSub: 'plan-reset-new', email: 'presetn@x.com', name: 'PRN' })
      await s.reset(fresh.id)
      expect(await s.get(fresh.id)).toEqual({ planKey: null, doneN: 0 })
    })
  })

  describe('preferences store', () => {
    const store = () => createPreferencesStore(db)

    it('returns spec defaults when absent, without inserting a row', async () => {
      const s = store()
      const users = createUserStore(db)
      const fresh = await users.createUser({ googleSub: 'prefs-fresh', email: 'pref@x.com', name: 'Pref' })
      const defaults = await s.get(fresh.id)
      expect(defaults).toEqual({
        difficulties: ['easy', 'medium', 'hard'],
        timeCapMinutes: 60,
        warmupMinutes: 10,
        warmupOverride: false,
        countdownSeconds: 10,
        paceToleranceSeconds: 1,
        accentColor: '#b5341f',
      })

      // get()-when-absent must not have inserted a row
      const rows = await db.select().from(preferences).where(eq(preferences.userId, fresh.id))
      expect(rows).toHaveLength(0)
    })

    it('put upserts a partial and get reflects merged values', async () => {
      const s = store()
      await s.put(userA, { accentColor: '#00ff00', timeCapMinutes: 45 })
      const prefs = await s.get(userA)
      expect(prefs).toMatchObject({ accentColor: '#00ff00', timeCapMinutes: 45 })

      await s.put(userA, { warmupOverride: true })
      const after = await s.get(userA)
      expect(after).toMatchObject({ accentColor: '#00ff00', timeCapMinutes: 45, warmupOverride: true })
    })

    it('is invisible across users', async () => {
      const s = store()
      await s.put(userA, { accentColor: '#123456' })
      const users = createUserStore(db)
      const fresh = await users.createUser({ googleSub: 'prefs-cross', email: 'prefcross@x.com', name: 'PC' })
      expect(await s.get(fresh.id)).toMatchObject({ accentColor: '#b5341f' })
    })
  })

  describe('logs store + plan_state transaction', () => {
    const logInput = (overrides: Partial<LogInput> = {}): LogInput => ({
      workoutId: null,
      workoutTitle: 'Frozen title',
      workoutType: 'AN',
      baselineK2: 420,
      baselineK6: 1500,
      held: 'held',
      pain: 2,
      notes: null,
      steps: [
        { label: 'Step 1', targetSplit: 100, actualSplit: 101, actualSource: 'stopwatch' },
      ],
      ...overrides,
    })

    it('create inserts the log and bumps plan_state.done_n from absent to 1', async () => {
      const logs = createLogsStore(db)
      const planState = createPlanStateStore(db)
      const users = createUserStore(db)
      const fresh = await users.createUser({ googleSub: 'log-fresh', email: 'logfresh@x.com', name: 'LF' })

      expect(await planState.get(fresh.id)).toBeNull()

      const { id } = await logs.create(fresh.id, logInput())
      expect(id).toBeDefined()

      expect(await planState.get(fresh.id)).toEqual({ planKey: null, doneN: 1 })

      const list = await logs.list(fresh.id, 10)
      expect(list).toHaveLength(1)
      expect(list[0]).toMatchObject({ id, workoutTitle: 'Frozen title' })
    })

    it('create increments an existing plan_state.done_n', async () => {
      const logs = createLogsStore(db)
      const planState = createPlanStateStore(db)
      await planState.set(userA, 'sprint')
      await logs.create(userA, logInput())
      expect(await planState.get(userA)).toEqual({ planKey: 'sprint', doneN: 1 })
      await logs.create(userA, logInput())
      expect(await planState.get(userA)).toEqual({ planKey: 'sprint', doneN: 2 })
    })

    it('list respects limit and is invisible across users', async () => {
      const logs = createLogsStore(db)
      const users = createUserStore(db)
      const fresh = await users.createUser({ googleSub: 'log-limit', email: 'loglimit@x.com', name: 'LL' })
      await logs.create(fresh.id, logInput())
      await logs.create(fresh.id, logInput())
      await logs.create(fresh.id, logInput())
      const limited = await logs.list(fresh.id, 2)
      expect(limited).toHaveLength(2)

      const other = await users.createUser({ googleSub: 'log-cross', email: 'logcross@x.com', name: 'LC' })
      expect(await logs.list(other.id, 10)).toHaveLength(0)
    })

    it('lastDonePerWorkout maps each logged workout to days-ago, ignores workout-less logs, and is scoped per user', async () => {
      const logs = createLogsStore(db)
      const wk = createWorkoutsStore(db)
      const users = createUserStore(db)
      const fresh = await users.createUser({ googleSub: 'log-lastdone', email: 'lastdone@x.com', name: 'LD' })

      const workoutA = await wk.create(fresh.id, workoutInput({ num: 901, title: 'A' }))
      const workoutB = await wk.create(fresh.id, workoutInput({ num: 902, title: 'B' }))

      // A workout-less log (e.g. an ad-hoc session) must not appear in the map.
      await logs.create(fresh.id, logInput({ workoutId: null }))
      await logs.create(fresh.id, logInput({ workoutId: workoutA.id }))
      await logs.create(fresh.id, logInput({ workoutId: workoutB.id }))

      const map = await logs.lastDonePerWorkout(fresh.id)
      expect(Object.keys(map).sort()).toEqual([workoutA.id, workoutB.id].sort())
      // logged moments ago: days-ago is 0 for both
      expect(map[workoutA.id]).toBe(0)
      expect(map[workoutB.id]).toBe(0)

      const other = await users.createUser({ googleSub: 'log-lastdone-cross', email: 'lastdonecross@x.com', name: 'LDC' })
      expect(await logs.lastDonePerWorkout(other.id)).toEqual({})
    })
  })

  describe('test history store', () => {
    const store = () => createTestHistoryStore(db)

    it('first entry for a distance has a null delta', async () => {
      const s = store()
      const users = createUserStore(db)
      const fresh = await users.createUser({ googleSub: 'th-fresh', email: 'thfresh@x.com', name: 'TH' })
      const row = await s.append(fresh.id, { distance: '2k', splitSeconds: 420 })
      expect(row.deltaSeconds).toBeNull()
    })

    it('computes delta against the previous entry of the same distance', async () => {
      const s = store()
      const users = createUserStore(db)
      const fresh = await users.createUser({ googleSub: 'th-delta', email: 'thdelta@x.com', name: 'THD' })
      await s.append(fresh.id, { distance: '2k', splitSeconds: 420 })
      const second = await s.append(fresh.id, { distance: '2k', splitSeconds: 410 })
      expect(second.deltaSeconds).toBe(-10)

      // a different distance does not interfere
      const firstSix = await s.append(fresh.id, { distance: '6k', splitSeconds: 1500 })
      expect(firstSix.deltaSeconds).toBeNull()

      const third = await s.append(fresh.id, { distance: '2k', splitSeconds: 415 })
      expect(third.deltaSeconds).toBe(5)
    })

    it('list is invisible across users', async () => {
      const s = store()
      const users = createUserStore(db)
      const fresh = await users.createUser({ googleSub: 'th-cross', email: 'thcross@x.com', name: 'THC' })
      await s.append(fresh.id, { distance: '2k', splitSeconds: 400 })
      const other = await users.createUser({ googleSub: 'th-cross-2', email: 'thcross2@x.com', name: 'THC2' })
      expect(await s.list(other.id)).toHaveLength(0)
      expect(await s.list(fresh.id)).toHaveLength(1)
    })
  })
})
