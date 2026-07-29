import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import request from 'supertest'
import type pg from 'pg'
import { createApp } from '../app.js'
import { baseDeps } from '../testDeps.js'
import { createDb, type Db } from '../db/index.js'
import { createSessionStore } from '../auth/sessions.js'
import { createUserStore } from '../auth/users.js'
import { seedGlobalLibrary } from '../seed/seed.js'
import { STARTER_WORKOUTS } from '../seed/starter.js'
import { createBaselinesStore } from '../stores/baselines.js'
import { createLogsStore } from '../stores/logs.js'
import { createPlanStateStore } from '../stores/planState.js'
import { createPreferencesStore, PREFERENCES_DEFAULTS } from '../stores/preferences.js'
import { createTestHistoryStore } from '../stores/testHistory.js'
import { createWorkoutsStore } from '../stores/workouts.js'
import type { Stores } from './data.js'

// ---------------------------------------------------------------------------
// The Phase 2 recorded obligation, discharged here under the AMENDED
// (Task 9) global-library model: two real users, minted through the actual
// native sign-in path (stubbed only at the Google-verification boundary),
// driving the REAL app (real Postgres, real stores, a real boot-time global
// seed) over supertest.
//
// Under the global model there is no per-user seeding: seedGlobalLibrary()
// runs ONCE in beforeAll (mirroring index.ts's boot order — after migrate(),
// before any request is served), producing exactly STARTER_COUNT rows with
// user_id NULL. Both users then see the identical global set on every list,
// and everything each creates personally must stay invisible to the other:
// every list/get endpoint, every id-addressed mutation against a foreign id
// (404), every id-addressed mutation against a GLOBAL id (403
// starter_readonly, not a silent no-op and not a 404), and log-freezing
// (a logged session's frozen values survive a later baseline edit).
// ---------------------------------------------------------------------------

const STARTER_COUNT = STARTER_WORKOUTS.length

describe('two-user isolation, global-library sharing, and log-freezing across the full API', () => {
  let container: StartedPostgreSqlContainer
  let pool: pg.Pool
  let db: Db
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18.4').start()
    ;({ pool, db } = createDb(container.getConnectionUri()))
    await migrate(db, { migrationsFolder: 'drizzle' })
    // Boot-order precondition this whole suite depends on: seed the global
    // library once, exactly as index.ts does after migrate() and before
    // serving traffic. No per-user seed hook exists anymore.
    await seedGlobalLibrary(db)

    const stores: Stores = {
      baselines: createBaselinesStore(db),
      workouts: createWorkoutsStore(db),
      logs: createLogsStore(db),
      planState: createPlanStateStore(db),
      preferences: createPreferencesStore(db),
      testHistory: createTestHistoryStore(db),
    }

    app = createApp(
      baseDeps({
        sessions: createSessionStore(db),
        users: createUserStore(db),
        allowlist: new Set(['a@iso.test', 'b@iso.test']),
        // Two distinct "Google accounts" distinguished by idToken value —
        // this is the same stub-the-verifier pattern as native.integration.test.ts,
        // just with two identities instead of one, so both users go through
        // the real POST /api/auth/native -> signInWithClaims path (which no
        // longer does any seeding at all).
        nativeVerifier: async (idToken: string) => {
          if (idToken === 'token-a') {
            return { sub: 'iso-sub-a', email: 'a@iso.test', emailVerified: true, name: 'Rower A' }
          }
          if (idToken === 'token-b') {
            return { sub: 'iso-sub-b', email: 'b@iso.test', emailVerified: true, name: 'Rower B' }
          }
          throw new Error('unknown stub token')
        },
        stores,
      }),
    )
  })

  afterAll(async () => {
    await pool.end().catch(() => {})
    await container.stop().catch(() => {})
  })

  let bearerA: string
  let bearerB: string
  let aWorkoutId: string
  let aLogId: string
  let globalWorkoutId: string

  const bearerAgent = (bearer: () => string) => ({
    get: (path: string) => request(app).get(path).set('Authorization', bearer()),
    post: (path: string) => request(app).post(path).set('Authorization', bearer()),
    put: (path: string) => request(app).put(path).set('Authorization', bearer()),
    delete: (path: string) => request(app).delete(path).set('Authorization', bearer()),
  })
  const asA = () => bearerAgent(() => bearerA)
  const asB = () => bearerAgent(() => bearerB)

  const workoutBody = (num: number, title: string) => ({
    num,
    title,
    type: 'AT',
    difficulty: 'medium',
    pain: 2,
    steps: [
      { k: 'wu', minutes: 5 },
      { k: 'w', duration: { kind: 'time', minutes: 10 }, ref: { base: '6k', off: 0 }, spm: 20 },
    ],
  })

  it('mints both users via the real native sign-in path, each seeing the IDENTICAL global library', async () => {
    const mintedA = await request(app).post('/api/auth/native').send({ idToken: 'token-a' })
    expect(mintedA.status).toBe(200)
    bearerA = `Bearer ${mintedA.body.token}`

    const mintedB = await request(app).post('/api/auth/native').send({ idToken: 'token-b' })
    expect(mintedB.status).toBe(200)
    bearerB = `Bearer ${mintedB.body.token}`

    expect(mintedA.body.user.id).not.toBe(mintedB.body.user.id)

    const listA = await asA().get('/api/workouts')
    const listB = await asB().get('/api/workouts')
    expect(listA.body).toHaveLength(STARTER_COUNT)
    expect(listB.body).toHaveLength(STARTER_COUNT)
    expect(listA.body.every((w: { isGlobal: boolean }) => w.isGlobal === true)).toBe(true)
    expect(listB.body.every((w: { isGlobal: boolean }) => w.isGlobal === true)).toBe(true)
    expect(listA.body.every((w: { source: string }) => w.source === 'starter')).toBe(true)
    // Identical sets by id, not just by count — the global rows are the
    // SAME rows for both users, not per-user copies.
    const idsA = listA.body.map((w: { id: string }) => w.id).sort()
    const idsB = listB.body.map((w: { id: string }) => w.id).sort()
    expect(idsA).toEqual(idsB)
    globalWorkoutId = listA.body[0].id
  })

  it('A creates a workout, baselines, prefs, a plan, and a log', async () => {
    const created = await asA().post('/api/workouts').send(workoutBody(9001, 'Only A Custom'))
    expect(created.status).toBe(201)
    expect(created.body.isGlobal).toBe(false)
    aWorkoutId = created.body.id

    expect((await asA().put('/api/baselines').send({ k2Seconds: 100, k6Seconds: 110 })).status).toBe(200)
    expect(
      (await asA().put('/api/prefs').send({ accentColor: '#123456', timeCapMinutes: 45 })).status,
    ).toBe(200)
    expect((await asA().put('/api/plan').send({ planKey: 'sprint' })).status).toBe(200)

    const logRes = await asA()
      .post('/api/logs')
      .send({
        workoutId: aWorkoutId,
        workoutTitle: 'Only A Custom',
        workoutType: 'AT',
        held: 'held',
        pain: 3,
        notes: 'first log',
        steps: [{ label: 'Work', targetSplit: 130, actualSplit: 128, actualSource: 'stopwatch', spm: 22 }],
      })
    expect(logRes.status).toBe(201)
    aLogId = logRes.body.id

    // plan_state.done_n bumped by the log create transaction
    expect((await asA().get('/api/plan')).body).toMatchObject({ planKey: 'sprint', doneN: 1 })

    const listA = (await asA().get('/api/workouts')).body
    expect(listA).toHaveLength(STARTER_COUNT + 1)
  })

  it('log-freezing: changing baselines after logging leaves the stored log untouched', async () => {
    const before = (await asA().get('/api/logs')).body.find((l: { id: string }) => l.id === aLogId)
    expect(before).toMatchObject({ baselineK2: 100, baselineK6: 110 })
    expect(before.steps).toEqual([
      { label: 'Work', targetSplit: 130, actualSplit: 128, actualSource: 'stopwatch', spm: 22 },
    ])

    const changed = await asA()
      .put('/api/baselines')
      .send({ k2Seconds: 80, k6Seconds: 90, isTestResult: true })
    expect(changed.status).toBe(200)
    expect(changed.body).toMatchObject({ k2Seconds: 80, k6Seconds: 90 })

    const after = (await asA().get('/api/logs')).body.find((l: { id: string }) => l.id === aLogId)
    expect(after).toMatchObject({ baselineK2: 100, baselineK6: 110 })
    expect(after.steps).toEqual(before.steps)
  })

  it('every list/get endpoint shows B none of A\'s data, but B still sees every global', async () => {
    const workoutsB = await asB().get('/api/workouts')
    expect(workoutsB.body).toHaveLength(STARTER_COUNT)
    expect(workoutsB.body.every((w: { isGlobal: boolean }) => w.isGlobal === true)).toBe(true)
    expect(workoutsB.body.some((w: { title: string }) => w.title === 'Only A Custom')).toBe(false)
    expect(workoutsB.body.some((w: { num: number }) => w.num === 9001)).toBe(false)

    expect((await asB().get(`/api/workouts/${aWorkoutId}`)).status).toBe(404)
    // But B can still GET a global id A happened to look at first.
    expect((await asB().get(`/api/workouts/${globalWorkoutId}`)).status).toBe(200)

    expect((await asB().get('/api/baselines')).body).toEqual({ k2Seconds: null, k6Seconds: null })

    expect((await asB().get('/api/logs')).body).toEqual([])

    expect((await asB().get('/api/prefs')).body).toEqual(PREFERENCES_DEFAULTS)

    expect((await asB().get('/api/plan')).body).toMatchObject({ planKey: null, doneN: 0 })

    expect((await asB().get('/api/test-history')).body).toEqual([])

    // B has no baselines yet: /api/today 422s rather than leaking A's plan/library state.
    expect((await asB().get('/api/today')).status).toBe(422)
    expect((await asB().get('/api/today')).body).toEqual({ error: 'baselines_required' })
  })

  it('A can still see everything after B\'s reads', async () => {
    expect((await asA().get('/api/today')).status).toBe(200)
    const workoutsA = await asA().get('/api/workouts')
    expect(workoutsA.body).toHaveLength(STARTER_COUNT + 1)
    // A's isTestResult baseline update landed a test-history row that B's
    // (already-checked) empty list proves stayed off B's account.
    const historyA = await asA().get('/api/test-history')
    expect(historyA.body.length).toBeGreaterThan(0)
  })

  it('B\'s mutations against A\'s personal id 404 and never touch A\'s data', async () => {
    const putRes = await asB().put(`/api/workouts/${aWorkoutId}`).send(workoutBody(9001, 'Hijacked'))
    expect(putRes.status).toBe(404)

    const deleteRes = await asB().delete(`/api/workouts/${aWorkoutId}`)
    expect(deleteRes.status).toBe(404)

    // B referencing A's workoutId in a log is rejected as an unowned id, not
    // silently attributed or leaked as a 500.
    const logRes = await asB()
      .post('/api/logs')
      .send({
        workoutId: aWorkoutId,
        workoutTitle: 'Should not attach',
        workoutType: 'AT',
        held: 'held',
        pain: 2,
        notes: null,
        steps: [{ label: 'x', targetSplit: 100, actualSource: 'assumed' }],
      })
    expect(logRes.status).toBe(400)
    expect(logRes.body.field).toBe('workoutId')

    // A's workout survived B's PUT/DELETE attempts, untouched.
    const stillA = await asA().get(`/api/workouts/${aWorkoutId}`)
    expect(stillA.status).toBe(200)
    expect(stillA.body).toMatchObject({ title: 'Only A Custom', num: 9001 })

    // B's failed log attempt did not land for B either.
    expect((await asB().get('/api/logs')).body).toEqual([])
  })

  it('neither A nor B can mutate a GLOBAL workout: 403 starter_readonly, not 404, not a silent no-op', async () => {
    const putA = await asA().put(`/api/workouts/${globalWorkoutId}`).send(workoutBody(1, 'Hijacked Global'))
    expect(putA.status).toBe(403)
    expect(putA.body).toEqual({ error: 'starter_readonly' })

    const deleteB = await asB().delete(`/api/workouts/${globalWorkoutId}`)
    expect(deleteB.status).toBe(403)
    expect(deleteB.body).toEqual({ error: 'starter_readonly' })

    // Untouched for both, regardless of which of them attempted the write.
    const stillGlobalForA = await asA().get(`/api/workouts/${globalWorkoutId}`)
    const stillGlobalForB = await asB().get(`/api/workouts/${globalWorkoutId}`)
    expect(stillGlobalForA.status).toBe(200)
    expect(stillGlobalForB.status).toBe(200)
    expect(stillGlobalForA.body.title).toBe(stillGlobalForB.body.title)
    expect(stillGlobalForA.body.title).not.toBe('Hijacked Global')
  })

  it('B\'s own writes are symmetric to A\'s and stay on B\'s side, including a num colliding with a global', async () => {
    // A global num (1, from Zephyr/STARTER_WORKOUTS) reused for B's own
    // personal workout — namespaces are independent, this must succeed.
    const createdB = await asB().post('/api/workouts').send(workoutBody(1, 'Only B Custom'))
    expect(createdB.status).toBe(201)
    expect(createdB.body.isGlobal).toBe(false)
    const bWorkoutId = createdB.body.id

    expect((await asB().put('/api/baselines').send({ k2Seconds: 200, k6Seconds: 210 })).status).toBe(200)
    expect((await asB().put('/api/prefs').send({ accentColor: '#abcdef' })).status).toBe(200)
    expect((await asB().put('/api/plan').send({ planKey: 'head' })).status).toBe(200)

    const listA = await asA().get('/api/workouts')
    expect(listA.body).toHaveLength(STARTER_COUNT + 1)
    expect(listA.body.some((w: { title: string }) => w.title === 'Only B Custom')).toBe(false)

    expect((await asA().get(`/api/workouts/${bWorkoutId}`)).status).toBe(404)

    // A's baselines/prefs/plan are unaffected by B's writes.
    expect((await asA().get('/api/baselines')).body).toMatchObject({ k2Seconds: 80, k6Seconds: 90 })
    expect((await asA().get('/api/prefs')).body).toMatchObject({ accentColor: '#123456', timeCapMinutes: 45 })
    expect((await asA().get('/api/plan')).body).toMatchObject({ planKey: 'sprint', doneN: 1 })

    const listB = await asB().get('/api/workouts')
    expect(listB.body).toHaveLength(STARTER_COUNT + 1)
  })
})
