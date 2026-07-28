import { Router, type RequestHandler } from 'express'
import { parseBulk } from '../../domain/bulk.js'
import { estimateMinutes } from '../../domain/expand.js'
import { PLANS, type PlanCode } from '../../domain/plans.js'
import { suggest, type LibraryEntry } from '../../domain/suggest.js'
import type { Baselines, Difficulty, Step } from '../../domain/types.js'
import { validateWorkoutInput } from '../../domain/validate.js'
import type { BaselinesStore } from '../stores/baselines.js'
import { StoreConflictError } from '../stores/errors.js'
import type { ActualSource, HeldResult, LogsStore, LogStep } from '../stores/logs.js'
import type { PlanKey, PlanStateStore } from '../stores/planState.js'
import type { PreferencesRow, PreferencesStore } from '../stores/preferences.js'
import type { TestHistoryStore } from '../stores/testHistory.js'
import type { WorkoutsStore } from '../stores/workouts.js'

export interface Stores {
  baselines: BaselinesStore
  workouts: WorkoutsStore
  logs: LogsStore
  planState: PlanStateStore
  preferences: PreferencesStore
  testHistory: TestHistoryStore
}

export interface DataRouterDeps {
  stores: Stores
  requireUser: RequestHandler
}

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']
const ACTUAL_SOURCES: ActualSource[] = ['assumed', 'stopwatch', 'pm5']
const HELD_RESULTS: HeldResult[] = ['held', 'under', 'over']
const PLAN_KEYS: PlanKey[] = ['sprint', 'head']
const ACCENT_COLOR_RE = /^#[0-9a-fA-F]{6}$/
// Postgres uuid columns 500 on a malformed literal (22P02) rather than just
// finding no row; guard the shape here so a bad id is an ordinary 404/400
// instead of leaking a DB error as a 500.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Bounds for a real erg split: 60s/500m is world-class-plus fast, 240s/500m
// is a slow walk pace. Anything outside is almost certainly a data-entry
// mistake, not a real baseline.
const MIN_SPLIT_SECONDS = 60
const MAX_SPLIT_SECONDS = 240

function badRequest(res: Parameters<RequestHandler>[1], error: string, field?: string) {
  res.status(400).json(field ? { error, field } : { error })
}

function notFound(res: Parameters<RequestHandler>[1]) {
  res.status(404).json({ error: 'not found' })
}

function isRec(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

// Bounds for a logged step: 30-600s/500m spans "sprinting" to "recovery
// paddle"; spm 10..60 covers rest to a max-rate finish sprint; meters
// mirrors validateSteps' distance-step bound; seconds caps at 4 hours.
function validateLogStepEntry(raw: unknown, index: number): { ok: true; step: LogStep } | { ok: false; message: string } {
  const at = (msg: string) => `steps[${index}]: ${msg}`
  if (!isRec(raw)) return { ok: false, message: at('must be an object') }

  const { label, targetSplit, actualSplit, actualSource, spm, meters, seconds } = raw

  if (typeof label !== 'string' || label.length < 1 || label.length > 80) {
    return { ok: false, message: at('label must be a string, 1..80 chars') }
  }
  if (typeof targetSplit !== 'number' || targetSplit < 30 || targetSplit > 600) {
    return { ok: false, message: at('targetSplit must be a number, 30..600') }
  }
  if (!ACTUAL_SOURCES.includes(actualSource as ActualSource)) {
    return { ok: false, message: at('actualSource must be one of assumed|stopwatch|pm5') }
  }
  if (actualSplit !== undefined && (typeof actualSplit !== 'number' || actualSplit < 30 || actualSplit > 600)) {
    return { ok: false, message: at('actualSplit must be a number, 30..600') }
  }
  if (spm !== undefined && (typeof spm !== 'number' || !Number.isInteger(spm) || spm < 10 || spm > 60)) {
    return { ok: false, message: at('spm must be an integer, 10..60') }
  }
  if (meters !== undefined && (typeof meters !== 'number' || !Number.isInteger(meters) || meters < 100 || meters > 42195)) {
    return { ok: false, message: at('meters must be an integer, 100..42195') }
  }
  if (seconds !== undefined && (typeof seconds !== 'number' || seconds < 1 || seconds > 14400)) {
    return { ok: false, message: at('seconds must be a number, 1..14400') }
  }

  // Built from an explicit field list (never spread/cast the raw input) so
  // any extra keys the client sent are silently dropped, not persisted.
  const step: LogStep = { label, targetSplit, actualSource: actualSource as ActualSource }
  if (actualSplit !== undefined) step.actualSplit = actualSplit
  if (spm !== undefined) step.spm = spm
  if (meters !== undefined) step.meters = meters
  if (seconds !== undefined) step.seconds = seconds
  return { ok: true, step }
}

export function createDataRouter({ stores, requireUser }: DataRouterDeps): Router {
  const router = Router()
  router.use(requireUser)

  // -- baselines ------------------------------------------------------

  router.get('/api/baselines', async (req, res) => {
    const row = await stores.baselines.get(req.user!.id)
    res.json(row ?? { k2Seconds: null, k6Seconds: null })
  })

  router.put('/api/baselines', async (req, res) => {
    const body = isRec(req.body) ? req.body : {}
    const patch: { k2Seconds?: number; k6Seconds?: number } = {}

    for (const field of ['k2Seconds', 'k6Seconds'] as const) {
      const value = body[field]
      if (value === undefined) continue
      if (typeof value !== 'number' || value < MIN_SPLIT_SECONDS || value > MAX_SPLIT_SECONDS) {
        badRequest(res, `${field} must be between ${MIN_SPLIT_SECONDS} and ${MAX_SPLIT_SECONDS}`, field)
        return
      }
      patch[field] = value
    }

    await stores.baselines.put(req.user!.id, patch)

    if (body.isTestResult === true) {
      if (patch.k2Seconds !== undefined) {
        await stores.testHistory.append(req.user!.id, { distance: '2k', splitSeconds: patch.k2Seconds })
      }
      if (patch.k6Seconds !== undefined) {
        await stores.testHistory.append(req.user!.id, { distance: '6k', splitSeconds: patch.k6Seconds })
      }
    }

    const row = await stores.baselines.get(req.user!.id)
    res.json(row ?? { k2Seconds: null, k6Seconds: null })
  })

  // -- workouts ---------------------------------------------------------

  router.get('/api/workouts', async (req, res) => {
    res.json(await stores.workouts.list(req.user!.id))
  })

  router.post('/api/workouts', async (req, res) => {
    const validated = validateWorkoutInput(req.body)
    if (!validated.ok) {
      badRequest(res, validated.errors.join('; '))
      return
    }
    try {
      const row = await stores.workouts.create(req.user!.id, { ...validated.workout, source: 'user' })
      res.status(201).json(row)
    } catch (err) {
      if (err instanceof StoreConflictError) {
        res.status(409).json({ error: err.message })
        return
      }
      throw err
    }
  })

  router.get('/api/workouts/:id', async (req, res) => {
    if (!UUID_RE.test(req.params.id)) {
      notFound(res)
      return
    }
    const row = await stores.workouts.get(req.user!.id, req.params.id)
    if (!row) {
      notFound(res)
      return
    }
    res.json(row)
  })

  router.put('/api/workouts/:id', async (req, res) => {
    if (!UUID_RE.test(req.params.id)) {
      notFound(res)
      return
    }
    const existing = await stores.workouts.get(req.user!.id, req.params.id)
    if (!existing) {
      notFound(res)
      return
    }
    const validated = validateWorkoutInput(req.body)
    if (!validated.ok) {
      badRequest(res, validated.errors.join('; '))
      return
    }
    try {
      const row = await stores.workouts.update(req.user!.id, req.params.id, validated.workout)
      // The store no-ops (returns null) on an id it can't find, but we
      // already confirmed existence above, so this can't happen in practice.
      res.json(row ?? existing)
    } catch (err) {
      if (err instanceof StoreConflictError) {
        res.status(409).json({ error: err.message })
        return
      }
      throw err
    }
  })

  router.delete('/api/workouts/:id', async (req, res) => {
    if (!UUID_RE.test(req.params.id)) {
      notFound(res)
      return
    }
    const existing = await stores.workouts.get(req.user!.id, req.params.id)
    if (!existing) {
      notFound(res)
      return
    }
    await stores.workouts.remove(req.user!.id, req.params.id)
    res.status(204).end()
  })

  router.post('/api/workouts/bulk', async (req, res) => {
    const text = isRec(req.body) ? req.body.text : undefined
    if (typeof text !== 'string' || text.trim() === '') {
      badRequest(res, 'text is required', 'text')
      return
    }

    const parsed = parseBulk(text)
    const created: unknown[] = []
    const errors: Array<{ line: number | null; message: string }> = parsed.errors.map((e) => ({
      line: e.line,
      message: e.message,
    }))

    for (const workout of parsed.workouts) {
      const validated = validateWorkoutInput(workout)
      if (!validated.ok) {
        errors.push({ line: null, message: `workout ${workout.num}: ${validated.errors.join('; ')}` })
        continue
      }
      try {
        const row = await stores.workouts.create(req.user!.id, { ...validated.workout, source: 'user' })
        created.push(row)
      } catch (err) {
        if (err instanceof StoreConflictError) {
          errors.push({ line: null, message: err.message })
          continue
        }
        throw err
      }
    }

    res.json({ created, errors })
  })

  // -- logs ---------------------------------------------------------------

  router.get('/api/logs', async (req, res) => {
    const rawLimit = Number(req.query.limit)
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(100, Math.floor(rawLimit)) : 20
    res.json(await stores.logs.list(req.user!.id, limit))
  })

  router.post('/api/logs', async (req, res) => {
    const body = isRec(req.body) ? req.body : {}

    if (typeof body.workoutTitle !== 'string' || body.workoutTitle.length === 0) {
      badRequest(res, 'workoutTitle is required', 'workoutTitle')
      return
    }
    if (typeof body.workoutType !== 'string' || body.workoutType.length === 0) {
      badRequest(res, 'workoutType is required', 'workoutType')
      return
    }
    let workoutId: string | null = null
    if (body.workoutId !== null && body.workoutId !== undefined) {
      if (typeof body.workoutId !== 'string' || !UUID_RE.test(body.workoutId)) {
        badRequest(res, 'workoutId must be a valid id or null', 'workoutId')
        return
      }
      // Ownership check up front: an absent/foreign workoutId would otherwise
      // either 500 (FK violation, 23503) or silently attribute the log to a
      // workout the user doesn't own.
      const owned = await stores.workouts.get(req.user!.id, body.workoutId)
      if (!owned) {
        badRequest(res, 'workoutId does not exist', 'workoutId')
        return
      }
      workoutId = body.workoutId
    }
    if (!HELD_RESULTS.includes(body.held as HeldResult)) {
      badRequest(res, 'held must be one of held|under|over', 'held')
      return
    }
    if (typeof body.pain !== 'number' || !Number.isInteger(body.pain) || body.pain < 1 || body.pain > 5) {
      badRequest(res, 'pain must be an integer 1..5', 'pain')
      return
    }
    if (body.notes !== null && body.notes !== undefined && typeof body.notes !== 'string') {
      badRequest(res, 'notes must be a string or null', 'notes')
      return
    }
    if (!Array.isArray(body.steps) || body.steps.length === 0) {
      badRequest(res, 'steps must be a non-empty array', 'steps')
      return
    }
    const steps: LogStep[] = []
    for (let i = 0; i < body.steps.length; i++) {
      const result = validateLogStepEntry(body.steps[i], i)
      if (!result.ok) {
        badRequest(res, result.message, 'steps')
        return
      }
      steps.push(result.step)
    }

    const baselines = await stores.baselines.get(req.user!.id)
    const { id } = await stores.logs.create(req.user!.id, {
      workoutId,
      workoutTitle: body.workoutTitle,
      workoutType: body.workoutType,
      baselineK2: baselines?.k2Seconds ?? null,
      baselineK6: baselines?.k6Seconds ?? null,
      held: body.held as HeldResult,
      pain: body.pain,
      notes: (body.notes as string | null | undefined) ?? null,
      steps,
    })
    res.status(201).json({ id })
  })

  // -- plan -----------------------------------------------------------

  async function planResponse(userId: string) {
    const row = await stores.planState.get(userId)
    const planKey = row?.planKey ?? null
    const doneN = row?.doneN ?? 0
    const sequence = planKey
      ? PLANS[planKey].sessions.map((code, index) => ({
          index,
          code,
          status: index < doneN ? 'done' : index === doneN ? 'today' : 'upcoming',
        }))
      : []
    return { planKey, doneN, sequence }
  }

  router.get('/api/plan', async (req, res) => {
    res.json(await planResponse(req.user!.id))
  })

  router.put('/api/plan', async (req, res) => {
    const body = isRec(req.body) ? req.body : {}
    const userId = req.user!.id

    if (body.reset === true) {
      await stores.planState.reset(userId)
      res.json(await planResponse(userId))
      return
    }

    if (body.planKey === undefined) {
      badRequest(res, 'planKey or reset is required')
      return
    }
    if (!PLAN_KEYS.includes(body.planKey as PlanKey)) {
      badRequest(res, 'planKey must be one of sprint|head', 'planKey')
      return
    }

    const current = await stores.planState.get(userId)
    // Re-selecting the SAME plan must be a no-op: planState.set() always
    // zeroes done_n, and a same-key PUT (e.g. a client re-syncing its
    // choice) must not silently wipe progress.
    if (current?.planKey !== body.planKey) {
      await stores.planState.set(userId, body.planKey as PlanKey)
    }
    res.json(await planResponse(userId))
  })

  // -- prefs ------------------------------------------------------------

  router.get('/api/prefs', async (req, res) => {
    res.json(await stores.preferences.get(req.user!.id))
  })

  router.put('/api/prefs', async (req, res) => {
    const body = isRec(req.body) ? req.body : {}
    const patch: Partial<PreferencesRow> = {}

    if (body.difficulties !== undefined) {
      if (
        !Array.isArray(body.difficulties) ||
        body.difficulties.length === 0 ||
        !body.difficulties.every((d) => DIFFICULTIES.includes(d as Difficulty))
      ) {
        badRequest(res, 'difficulties must be a non-empty subset of easy|medium|hard', 'difficulties')
        return
      }
      patch.difficulties = body.difficulties as Difficulty[]
    }
    if (body.timeCapMinutes !== undefined) {
      if (typeof body.timeCapMinutes !== 'number' || !Number.isInteger(body.timeCapMinutes) || body.timeCapMinutes < 10 || body.timeCapMinutes > 300) {
        badRequest(res, 'timeCapMinutes must be an integer 10..300', 'timeCapMinutes')
        return
      }
      patch.timeCapMinutes = body.timeCapMinutes
    }
    if (body.warmupMinutes !== undefined) {
      if (typeof body.warmupMinutes !== 'number' || body.warmupMinutes < 0 || body.warmupMinutes > 60) {
        badRequest(res, 'warmupMinutes must be 0..60', 'warmupMinutes')
        return
      }
      patch.warmupMinutes = body.warmupMinutes
    }
    if (body.warmupOverride !== undefined) {
      if (typeof body.warmupOverride !== 'boolean') {
        badRequest(res, 'warmupOverride must be a boolean', 'warmupOverride')
        return
      }
      patch.warmupOverride = body.warmupOverride
    }
    if (body.countdownSeconds !== undefined) {
      if (typeof body.countdownSeconds !== 'number' || !Number.isInteger(body.countdownSeconds) || body.countdownSeconds < 0 || body.countdownSeconds > 60) {
        badRequest(res, 'countdownSeconds must be an integer 0..60', 'countdownSeconds')
        return
      }
      patch.countdownSeconds = body.countdownSeconds
    }
    if (body.paceToleranceSeconds !== undefined) {
      if (typeof body.paceToleranceSeconds !== 'number' || body.paceToleranceSeconds < 0 || body.paceToleranceSeconds > 10) {
        badRequest(res, 'paceToleranceSeconds must be 0..10', 'paceToleranceSeconds')
        return
      }
      patch.paceToleranceSeconds = body.paceToleranceSeconds
    }
    if (body.accentColor !== undefined) {
      if (typeof body.accentColor !== 'string' || !ACCENT_COLOR_RE.test(body.accentColor)) {
        badRequest(res, 'accentColor must be a #rrggbb hex string', 'accentColor')
        return
      }
      patch.accentColor = body.accentColor
    }

    await stores.preferences.put(req.user!.id, patch)
    res.json(await stores.preferences.get(req.user!.id))
  })

  // -- test history ---------------------------------------------------

  router.get('/api/test-history', async (req, res) => {
    res.json(await stores.testHistory.list(req.user!.id))
  })

  // -- today ------------------------------------------------------------

  router.get('/api/today', async (req, res) => {
    const userId = req.user!.id
    const baselinesRow = await stores.baselines.get(userId)
    if (!baselinesRow || baselinesRow.k2Seconds === null || baselinesRow.k6Seconds === null) {
      res.status(422).json({ error: 'baselines_required' })
      return
    }
    const baselines: Baselines = { k2Seconds: baselinesRow.k2Seconds, k6Seconds: baselinesRow.k6Seconds }

    const planRow = await stores.planState.get(userId)
    // No plan chosen yet: default to the sprint preset at day 0 rather than
    // erroring — /today should always have something to say. The response's
    // own `planKey` still reports null in that case (see below) so callers
    // can tell "no plan selected" apart from "sprint is selected".
    const effectivePlanKey: PlanKey = planRow?.planKey ?? 'sprint'
    const doneN = planRow?.doneN ?? 0
    const sequence = PLANS[effectivePlanKey].sessions
    const todayCode: PlanCode = sequence[Math.min(doneN, sequence.length - 1)]

    const [prefs, workouts, lastDone] = await Promise.all([
      stores.preferences.get(userId),
      stores.workouts.list(userId),
      stores.logs.lastDonePerWorkout(userId),
    ])

    const library: LibraryEntry[] = workouts.map((w) => ({
      id: w.id,
      type: w.type,
      difficulty: w.difficulty,
      pain: w.pain,
      estMinutes: estimateMinutes(w.steps as Step[], baselines).minutes,
      lastDoneDaysAgo: lastDone[w.id] ?? null,
    }))

    const suggestion = suggest({
      todayCode,
      library,
      prefs: { difficulties: prefs.difficulties, timeCapMinutes: prefs.timeCapMinutes },
    })

    res.json({
      recommendation: suggestion.recommendationId,
      reason: suggestion.reason,
      pool: suggestion.poolIds,
      todayCode,
      doneN,
      planKey: planRow?.planKey ?? null,
    })
  })

  return router
}
