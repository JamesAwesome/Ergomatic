# Phase 4: Domain Engine, Schema & Data API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The complete, tested, user-scoped data layer: the Erg Book math as a pure module, seven Drizzle tables, the full REST surface, and an original starter library — so Phase 5 is purely frontend.

**Architecture:** `app/domain/` stays dependency-zero (hand-rolled validators, exact handoff math, distance axis native). Stores wrap Drizzle per table; routes wrap stores behind `requireUser` with a uniform error convention. Starter content is one reviewable data file seeded transactionally at sign-in when a user has no workouts AND no logs.

**Tech Stack:** Existing only — drizzle-orm 0.45.2, pg 8.22, Testcontainers. **No new dependencies** (Task 1 verifies this stays true).

**Spec (binding):** `docs/superpowers/specs/2026-07-28-phase-4-domain-engine-design.md`

## Global Constraints

- Node 26 via `PATH="/Users/james/.local/share/nvm/v26.5.0/bin:$PATH"` on EVERY command including `git commit`/`git push`; zero engine warnings.
- Branch `phase-4-domain` (exists, spec committed). Main is PR-only; rebase-merge at the end.
- **No new dependencies.** If a task seems to need one, STOP and report — that's a design conversation, not an install.
- `app/domain/**` imports NOTHING outside `app/domain/` (enforce by review; keep `fmtSplit` in domain/format.ts as-is).
- Scales: `pain` 1..5, `difficulty 'easy'|'medium'|'hard'` — never 1–10, never book labels (docs/design/DEVIATIONS.md).
- Content guardrails: no book titles/list/prose anywhere, incl. comments and test fixtures; "The Erg Book" never in code.
- Migrations expand-only; steps/log-steps are jsonb documents validated by domain validators on every write.
- API: all new routes behind `requireUser`; errors 400 `{error, field?}` / 404 / 409 (num clash) / 422 `{error:'baselines_required'}`; additive-only.
- Every commit passes hooks; coverage ≥90 global; `pnpm test --project <name>` syntax. Docker running for Testcontainers.
- Canonical math fixtures: "Interval Ladder shape" = 10′ wu + reps×4 + five 1′ work steps + 5′ standalone rest → 25 phases / 50′ (the handoff's structural contract, original name); distance fixture = `2500m at 2k-4, 5′ rest, ×5`.

---

### Task 1: Domain types + step validators (TDD)

**Files:**
- Create: `app/domain/types.ts`, `app/domain/validate.ts`, `app/domain/validate.test.ts`

**Interfaces:**
- Produces (every later task consumes these EXACTLY):

```ts
export type WorkoutType = 'AN' | 'O2' | 'AT' | 'TR'
export type Difficulty = 'easy' | 'medium' | 'hard'
export type PaceBase = '2k' | '6k'
export interface PaceRef { base: PaceBase; off: number }               // off: seconds per 500m, negative = faster
export type WorkDuration =
  | { kind: 'time'; minutes: number }                                   // 0.5 steps allowed, > 0
  | { kind: 'distance'; meters: number }                                // integer, 100..42195
export type Step =
  | { k: 'wu'; minutes: number }
  | { k: 'reps'; count: number }                                        // 1..12, at most one per workout
  | { k: 'w'; duration: WorkDuration; ref: PaceRef; spm?: number; restMinutes?: number }
  | { k: 'r'; minutes: number }
  | { k: 'test'; label: string }
export interface Baselines { k2Seconds: number; k6Seconds: number }
export interface WorkoutInput {
  num: number; title: string; type: WorkoutType; difficulty: Difficulty
  pain: number; steps: Step[]
}
```
- `validateSteps(value: unknown): { ok: true; steps: Step[] } | { ok: false; errors: string[] }` — structural + bounds validation of untrusted jsonb (minutes 0.5..180 in 0.5 increments; meters int 100..42195; spm int 10..60; reps 1..12, max one marker, must not be last step; at least one `w` or `test` step; max 100 steps).
- `validateWorkoutInput(value: unknown): { ok: true; workout: WorkoutInput } | { ok: false; errors: string[] }` — title 1..80 chars, num int 1..9999, type/difficulty enums, pain int 1..5, then validateSteps.

- [ ] **Step 1: Write the failing tests** — `app/domain/validate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validateSteps, validateWorkoutInput } from './validate.js'

const work = (over: object = {}) => ({
  k: 'w', duration: { kind: 'time', minutes: 10 }, ref: { base: '6k', off: -2 }, spm: 22, ...over,
})

describe('validateSteps', () => {
  it('accepts the interval-ladder shape', () => {
    const steps = [
      { k: 'wu', minutes: 10 },
      { k: 'reps', count: 4 },
      work(), work(), work(), work(), work(),
      { k: 'r', minutes: 5 },
    ]
    const r = validateSteps(steps)
    expect(r.ok).toBe(true)
  })
  it('accepts distance work steps', () => {
    const r = validateSteps([work({ duration: { kind: 'distance', meters: 2500 } })])
    expect(r.ok).toBe(true)
  })
  it('rejects non-arrays, junk kinds, and empty step lists', () => {
    expect(validateSteps('nope').ok).toBe(false)
    expect(validateSteps([{ k: 'zap' }]).ok).toBe(false)
    expect(validateSteps([]).ok).toBe(false)
  })
  it('rejects out-of-bounds values with messages', () => {
    for (const bad of [
      [work({ duration: { kind: 'time', minutes: 0 } })],
      [work({ duration: { kind: 'time', minutes: 10.3 } })],
      [work({ duration: { kind: 'distance', meters: 50 } })],
      [work({ spm: 200 })],
      [work({ ref: { base: '5k', off: 0 } })],
      [{ k: 'wu', minutes: 10 }],                                   // no work/test step
      [work(), { k: 'reps', count: 4 }],                            // marker last
      [{ k: 'reps', count: 2 }, work(), { k: 'reps', count: 2 }, work()], // two markers
    ]) {
      const r = validateSteps(bad)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.errors.length).toBeGreaterThan(0)
    }
  })
})

describe('validateWorkoutInput', () => {
  const base = { num: 12, title: 'Ladder Day', type: 'AT', difficulty: 'medium', pain: 3, steps: [work()] }
  it('accepts a valid workout', () => {
    expect(validateWorkoutInput(base).ok).toBe(true)
  })
  it('rejects pain outside 1..5 and book-era difficulty labels', () => {
    expect(validateWorkoutInput({ ...base, pain: 7 }).ok).toBe(false)
    expect(validateWorkoutInput({ ...base, pain: 0 }).ok).toBe(false)
    expect(validateWorkoutInput({ ...base, difficulty: 'introductory' }).ok).toBe(false)
  })
  it('rejects bad num/title/type', () => {
    expect(validateWorkoutInput({ ...base, num: 0 }).ok).toBe(false)
    expect(validateWorkoutInput({ ...base, title: '' }).ok).toBe(false)
    expect(validateWorkoutInput({ ...base, type: 'XX' }).ok).toBe(false)
  })
})
```

- [ ] **Step 2: RED** — `cd app && pnpm test --project unit` (module missing).
- [ ] **Step 3: Implement** `types.ts` exactly as the Interfaces block above (types only, no logic), then `validate.ts`:

```ts
import type { Difficulty, PaceRef, Step, WorkDuration, WorkoutInput, WorkoutType } from './types.js'

const TYPES: WorkoutType[] = ['AN', 'O2', 'AT', 'TR']
const DIFFS: Difficulty[] = ['easy', 'medium', 'hard']

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const halfStep = (n: unknown, lo: number, hi: number): n is number =>
  typeof n === 'number' && n >= lo && n <= hi && Number.isInteger(n * 2)
const int = (n: unknown, lo: number, hi: number): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi

function checkRef(v: unknown, errs: string[], i: number): v is PaceRef {
  if (!isRec(v) || (v.base !== '2k' && v.base !== '6k') || typeof v.off !== 'number' || Math.abs(v.off) > 60) {
    errs.push(`step ${i}: invalid pace ref`)
    return false
  }
  return true
}

function checkDuration(v: unknown, errs: string[], i: number): v is WorkDuration {
  if (isRec(v) && v.kind === 'time' && halfStep(v.minutes, 0.5, 180)) return true
  if (isRec(v) && v.kind === 'distance' && int(v.meters, 100, 42195)) return true
  errs.push(`step ${i}: invalid duration`)
  return false
}

export function validateSteps(value: unknown): { ok: true; steps: Step[] } | { ok: false; errors: string[] } {
  const errors: string[] = []
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    return { ok: false, errors: ['steps must be a non-empty array (max 100)'] }
  }
  let markers = 0
  let hasWorkOrTest = false
  value.forEach((s, i) => {
    if (!isRec(s)) {
      errors.push(`step ${i}: not an object`)
      return
    }
    switch (s.k) {
      case 'wu':
      case 'r':
        if (!halfStep(s.minutes, 0.5, 180)) errors.push(`step ${i}: invalid minutes`)
        break
      case 'reps':
        markers += 1
        if (!int(s.count, 1, 12)) errors.push(`step ${i}: reps 1..12`)
        if (i === value.length - 1) errors.push(`step ${i}: reps marker cannot be last`)
        break
      case 'w':
        hasWorkOrTest = true
        checkDuration(s.duration, errors, i)
        checkRef(s.ref, errors, i)
        if (s.spm !== undefined && !int(s.spm, 10, 60)) errors.push(`step ${i}: spm 10..60`)
        if (s.restMinutes !== undefined && !halfStep(s.restMinutes, 0.5, 60)) errors.push(`step ${i}: rest 0.5..60`)
        break
      case 'test':
        hasWorkOrTest = true
        if (typeof s.label !== 'string' || s.label.length === 0 || s.label.length > 40)
          errors.push(`step ${i}: test label required`)
        break
      default:
        errors.push(`step ${i}: unknown kind`)
    }
  })
  if (markers > 1) errors.push('at most one reps marker')
  if (!hasWorkOrTest) errors.push('needs at least one work or test step')
  return errors.length ? { ok: false, errors } : { ok: true, steps: value as Step[] }
}

export function validateWorkoutInput(value: unknown): { ok: true; workout: WorkoutInput } | { ok: false; errors: string[] } {
  const errors: string[] = []
  if (!isRec(value)) return { ok: false, errors: ['not an object'] }
  if (!int(value.num, 1, 9999)) errors.push('num must be 1..9999')
  if (typeof value.title !== 'string' || value.title.length < 1 || value.title.length > 80) errors.push('title 1..80 chars')
  if (!TYPES.includes(value.type as WorkoutType)) errors.push('invalid type')
  if (!DIFFS.includes(value.difficulty as Difficulty)) errors.push('invalid difficulty')
  if (!int(value.pain, 1, 5)) errors.push('pain must be 1..5')
  const steps = validateSteps(value.steps)
  if (!steps.ok) errors.push(...steps.errors)
  return errors.length ? { ok: false, errors } : { ok: true, workout: value as unknown as WorkoutInput }
}
```

- [ ] **Step 4: GREEN**, lint, typecheck. **Step 5: Commit** `feat(domain): step and workout validators`

---

### Task 2: Pace math (TDD)

**Files:**
- Create: `app/domain/pace.ts`, `app/domain/pace.test.ts` (format.ts already exists)

**Interfaces:**
- Produces: `parsePaceRef(input: string): PaceRef | null` (handoff regex, whitespace-tolerant, case-insensitive base); `resolveSplit(baselines: Baselines, ref: PaceRef, nudge = 0): number`; `toleranceRange(split: number, tol: number): { lo: number; hi: number; label: string }` (tol 0 → `label = fmtSplit(split)`; else `fmt(lo)–fmt(hi)` with EN DASH).

- [ ] **Step 1: Failing tests** — `app/domain/pace.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parsePaceRef, resolveSplit, toleranceRange } from './pace.js'

const B = { k2Seconds: 112, k6Seconds: 122 }

describe('parsePaceRef', () => {
  it.each([
    ['2k', { base: '2k', off: 0 }],
    ['6k', { base: '6k', off: 0 }],
    ['6k-2', { base: '6k', off: -2 }],
    ['2k+4', { base: '2k', off: 4 }],
    ['6k -2.5', { base: '6k', off: -2.5 }],
    ['2K + 1', { base: '2k', off: 1 }],
  ])('parses %s', (input, expected) => {
    expect(parsePaceRef(input)).toEqual(expected)
  })
  it.each(['5k', '2k*3', '', 'k2', '2k--1', '2k-'])('rejects %s', (input) => {
    expect(parsePaceRef(input)).toBeNull()
  })
})

describe('resolveSplit', () => {
  it('is baseline + off + nudge, minus = faster', () => {
    expect(resolveSplit(B, { base: '6k', off: -2 })).toBe(120)
    expect(resolveSplit(B, { base: '2k', off: 4 })).toBe(116)
    expect(resolveSplit(B, { base: '6k', off: -2 }, -1)).toBe(119)
    expect(resolveSplit(B, { base: '6k', off: -2 }, 2)).toBe(122)
  })
})

describe('toleranceRange', () => {
  it('builds the ± band with formatted label', () => {
    expect(toleranceRange(120, 1)).toEqual({ lo: 119, hi: 121, label: '1:59.0–2:01.0' })
  })
  it('tol 0 is a single value', () => {
    expect(toleranceRange(120, 0).label).toBe('2:00.0')
  })
})
```

- [ ] **Step 2: RED. Step 3: Implement:**

```ts
import { fmtSplit } from './format.js'
import type { Baselines, PaceRef } from './types.js'

const REF_RE = /^(2k|6k)\s*([+-]\s*\d+(\.\d+)?)?$/i

export function parsePaceRef(input: string): PaceRef | null {
  const m = REF_RE.exec(input.trim())
  if (!m) return null
  const base = m[1].toLowerCase() as PaceRef['base']
  const off = m[2] ? Number(m[2].replace(/\s+/g, '')) : 0
  return Number.isFinite(off) ? { base, off } : null
}

export function resolveSplit(baselines: Baselines, ref: PaceRef, nudge = 0): number {
  const base = ref.base === '2k' ? baselines.k2Seconds : baselines.k6Seconds
  return base + ref.off + nudge
}

export function toleranceRange(split: number, tol: number): { lo: number; hi: number; label: string } {
  const lo = split - tol
  const hi = split + tol
  return { lo, hi, label: tol === 0 ? fmtSplit(split) : `${fmtSplit(lo)}–${fmtSplit(hi)}` }
}
```

- [ ] **Step 4: GREEN + commit** `feat(domain): pace ref parsing and resolution`

---

### Task 3: Phase expansion + duration estimation (TDD)

**Files:**
- Create: `app/domain/expand.ts`, `app/domain/expand.test.ts`, `app/domain/fixtures.ts`

**Interfaces:**
- Produces:

```ts
export interface Phase {
  type: 'warmup' | 'work' | 'rest' | 'test'
  seconds?: number            // time-based phases
  meters?: number             // distance work phases
  targetSplit?: number        // work phases (resolved, nudge excluded — session nudges are applied by callers)
  spm?: number
  label: string               // 'Easy' | 'Rest' | 'All out' | fmtSplit-range label
  set?: { index: number; of: number }
}
export function liveSteps(steps: Step[]): Step[]                       // pre-marker once, post-marker × count (marker removed)
export function phases(steps: Step[], baselines: Baselines, tol: number): Phase[]  // inserts rest after work steps with restMinutes
export function estimateMinutes(steps: Step[], baselines: Baselines): { minutes: number; estimated: boolean }
```
- `fixtures.ts` exports `intervalLadder` (10′ wu + reps 4 + five 1′ AT works + 5′ rest — 25 phases / 50′) and `distanceRepeats` (`wu 10 + reps 5 + w{2500m at 2k-4, rest 5}` — the amendment example), both with original names. These are THE canonical math fixtures; later tasks import them.

- [ ] **Step 1: Failing tests** (key assertions — write all):

```ts
import { describe, it, expect } from 'vitest'
import { estimateMinutes, liveSteps, phases } from './expand.js'
import { distanceRepeats, intervalLadder } from './fixtures.js'

const B = { k2Seconds: 112, k6Seconds: 122 }

describe('liveSteps', () => {
  it('repeats post-marker steps count times', () => {
    expect(liveSteps(intervalLadder.steps)).toHaveLength(1 + 4 * 6)
  })
  it('is identity without a marker', () => {
    const steps = [{ k: 'wu' as const, minutes: 5 }, intervalLadder.steps[2]]
    expect(liveSteps(steps)).toEqual(steps)
  })
})

describe('phases', () => {
  it('expands the interval ladder to 25 phases / 50 minutes', () => {
    const p = phases(intervalLadder.steps, B, 1)
    expect(p).toHaveLength(25)
    const totalSeconds = p.reduce((s, ph) => s + (ph.seconds ?? 0), 0)
    expect(totalSeconds).toBe(50 * 60)
  })
  it('inserts a rest phase after attached-rest work steps', () => {
    const p = phases(distanceRepeats.steps, B, 1)
    // wu + 5 × (work-distance + rest)
    expect(p).toHaveLength(1 + 10)
    expect(p[1]).toMatchObject({ type: 'work', meters: 2500, targetSplit: 108 })
    expect(p[2]).toMatchObject({ type: 'rest', seconds: 300 })
  })
  it('labels non-work phases with words, never a bare dash', () => {
    const p = phases(intervalLadder.steps, B, 1)
    expect(p[0].label).toBe('Easy')
    expect(p.at(-1)!.label).toBe('Rest')
  })
  it('marks set membership on repeated steps', () => {
    const p = phases(intervalLadder.steps, B, 1)
    expect(p[1].set).toEqual({ index: 1, of: 4 })
    expect(p.at(-1)!.set).toEqual({ index: 4, of: 4 })
  })
})

describe('estimateMinutes', () => {
  it('sums exact time workouts without the estimated flag', () => {
    expect(estimateMinutes(intervalLadder.steps, B)).toEqual({ minutes: 50, estimated: false })
  })
  it('estimates distance steps at resolved pace and flags it', () => {
    const r = estimateMinutes(distanceRepeats.steps, B)
    // 2500m at 108 s/500m = 540 s = 9 min per rep; 5 reps × (9 + 5 rest) + 10 wu = 80
    expect(r.estimated).toBe(true)
    expect(r.minutes).toBe(80)
  })
})
```

- [ ] **Step 2: fixtures.ts** (write with the tests):

```ts
import type { Step } from './types.js'

/** Canonical math fixture: the handoff's structural contract (25 phases / 50'). Original content. */
export const intervalLadder: { title: string; steps: Step[] } = {
  title: 'Ladder Sets',
  steps: [
    { k: 'wu', minutes: 10 },
    { k: 'reps', count: 4 },
    { k: 'w', duration: { kind: 'time', minutes: 1 }, ref: { base: '6k', off: 0 }, spm: 16 },
    { k: 'w', duration: { kind: 'time', minutes: 1 }, ref: { base: '6k', off: -1 }, spm: 18 },
    { k: 'w', duration: { kind: 'time', minutes: 1 }, ref: { base: '6k', off: -2 }, spm: 20 },
    { k: 'w', duration: { kind: 'time', minutes: 1 }, ref: { base: '6k', off: -3 }, spm: 22 },
    { k: 'w', duration: { kind: 'time', minutes: 1 }, ref: { base: '6k', off: -4 }, spm: 24 },
    { k: 'r', minutes: 5 },
  ],
}

/** Distance-axis fixture: 2500m at 2k-4, 5' rest, ×5. */
export const distanceRepeats: { title: string; steps: Step[] } = {
  title: 'Long Repeats',
  steps: [
    { k: 'wu', minutes: 10 },
    { k: 'reps', count: 5 },
    { k: 'w', duration: { kind: 'distance', meters: 2500 }, ref: { base: '2k', off: -4 }, spm: 24, restMinutes: 5 },
  ],
}
```

- [ ] **Step 3: RED**, then implement `expand.ts`:

```ts
import { resolveSplit, toleranceRange } from './pace.js'
import type { Baselines, Step } from './types.js'

export interface Phase {
  type: 'warmup' | 'work' | 'rest' | 'test'
  seconds?: number
  meters?: number
  targetSplit?: number
  spm?: number
  label: string
  set?: { index: number; of: number }
}

export function liveSteps(steps: Step[]): Step[] {
  const idx = steps.findIndex((s) => s.k === 'reps')
  if (idx === -1) return steps
  const marker = steps[idx] as Extract<Step, { k: 'reps' }>
  const before = steps.slice(0, idx)
  const repeated = steps.slice(idx + 1)
  const out = [...before]
  for (let i = 0; i < marker.count; i++) out.push(...repeated)
  return out
}

export function phases(steps: Step[], baselines: Baselines, tol: number): Phase[] {
  const idx = steps.findIndex((s) => s.k === 'reps')
  const marker = idx === -1 ? null : (steps[idx] as Extract<Step, { k: 'reps' }>)
  const perSet = marker ? steps.length - idx - 1 : 0
  const out: Phase[] = []
  const expanded = liveSteps(steps)
  const preCount = marker ? idx : expanded.length

  expanded.forEach((s, i) => {
    const set =
      marker && i >= preCount
        ? { index: Math.floor((i - preCount) / perSet) + 1, of: marker.count }
        : undefined
    switch (s.k) {
      case 'wu':
        out.push({ type: 'warmup', seconds: s.minutes * 60, label: 'Easy', set })
        break
      case 'r':
        out.push({ type: 'rest', seconds: s.minutes * 60, label: 'Rest', set })
        break
      case 'test':
        out.push({ type: 'test', label: 'All out', set })
        break
      case 'w': {
        const split = resolveSplit(baselines, s.ref)
        const base: Phase = {
          type: 'work',
          targetSplit: split,
          spm: s.spm,
          label: toleranceRange(split, tol).label,
          set,
        }
        if (s.duration.kind === 'time') base.seconds = s.duration.minutes * 60
        else base.meters = s.duration.meters
        out.push(base)
        if (s.restMinutes) out.push({ type: 'rest', seconds: s.restMinutes * 60, label: 'Rest', set })
        break
      }
      case 'reps':
        break
    }
  })
  return out
}

export function estimateMinutes(steps: Step[], baselines: Baselines): { minutes: number; estimated: boolean } {
  let seconds = 0
  let estimated = false
  for (const p of phases(steps, baselines, 0)) {
    if (p.seconds !== undefined) {
      seconds += p.seconds
    } else if (p.meters !== undefined && p.targetSplit !== undefined) {
      estimated = true
      seconds += (p.meters / 500) * p.targetSplit
    }
  }
  return { minutes: Math.round(seconds / 60), estimated }
}
```

- [ ] **Step 4: GREEN** (verify the 25/50 and 80-minute assertions pass EXACTLY — if not, the bug is real; do not adjust fixtures). Lint/typecheck. **Step 5: Commit** `feat(domain): phase expansion and duration estimation`

---

### Task 4: Plan presets + suggestion engine (TDD)

**Files:**
- Create: `app/domain/plans.ts`, `app/domain/plans.test.ts`, `app/domain/suggest.ts`, `app/domain/suggest.test.ts`

**Interfaces:**
- Produces:

```ts
export type PlanCode = WorkoutType | 'TEST'
export interface PlanPreset { key: 'sprint' | 'head'; title: string; sessions: PlanCode[] }  // length 84
export const PLANS: Record<'sprint' | 'head', PlanPreset>
export interface SuggestInput {
  todayCode: PlanCode
  library: Array<{ id: string; type: WorkoutType; difficulty: Difficulty; pain: number
                   estMinutes: number; lastDoneDaysAgo: number | null }>
  prefs: { difficulties: Difficulty[]; timeCapMinutes: number }
  todayPickId?: string
}
export interface Suggestion { recommendationId: string | null; reason: string; poolIds: string[]; fellBack: boolean }  // fellBack: prefs/cap filters matched nothing; pool is the unfiltered type list
export function suggest(input: SuggestInput): Suggestion
```
- Plans are ORIGINAL sequences (authored here, James-reviews with the starter library in Task 8): periodized base→build→peak over 12 weeks × 7 sessions; `sprint` biases AN/TR in later thirds, `head` biases O2/AT throughout; `TEST` at indices 6, 34, 62 (start-of-block checkpoints — deliberately NOT the handoff's 7/31/55).
- suggest behavior (handoff contract): TEST→TR for pool matching; pool = type match → difficulty ∈ prefs AND est ≤ cap → sort least-recently-done first (null lastDone = never = first); empty filtered pool → fall back to unfiltered type list with `filtered: false` and reason "closest match" phrasing; `todayPickId` (if present in pool) wins with reason 'YOUR PICK'.

- [ ] **Step 1: Failing tests.** `plans.test.ts` (write exactly these):

```ts
import { describe, it, expect } from 'vitest'
import { PLANS } from './plans.js'

const CODES = ['AN', 'O2', 'AT', 'TR', 'TEST']

describe.each(['sprint', 'head'] as const)('PLANS.%s', (key) => {
  const s = PLANS[key].sessions
  it('has 84 sessions of valid codes', () => {
    expect(s).toHaveLength(84)
    expect(s.every((c) => CODES.includes(c))).toBe(true)
  })
  it('places exactly three TESTs at 6, 34, 62', () => {
    expect(s.flatMap((c, i) => (c === 'TEST' ? [i] : []))).toEqual([6, 34, 62])
  })
  it('uses every workout type at least 8 times', () => {
    for (const t of ['AN', 'O2', 'AT', 'TR']) {
      expect(s.filter((c) => c === t).length).toBeGreaterThanOrEqual(8)
    }
  })
  it('never repeats one code more than 3 in a row', () => {
    let run = 1
    for (let i = 1; i < s.length; i++) {
      run = s[i] === s[i - 1] ? run + 1 : 1
      expect(run).toBeLessThanOrEqual(3)
    }
  })
})

it('sprint back half is speed-biased; head is endurance-biased overall', () => {
  const sp = PLANS.sprint.sessions
  const count = (arr: string[], codes: string[]) => arr.filter((c) => codes.includes(c)).length
  expect(count(sp.slice(42), ['AN', 'TR'])).toBeGreaterThan(count(sp.slice(0, 42), ['AN', 'TR']))
  const hd = PLANS.head.sessions
  expect(count(hd, ['O2', 'AT'])).toBeGreaterThan(count(hd, ['AN', 'TR']))
})
```

`suggest.test.ts` (write exactly these; helper `lib(...)` builds fake entries):

```ts
import { describe, it, expect } from 'vitest'
import { suggest } from './suggest.js'

const w = (id: string, over: object = {}) => ({
  id, type: 'AT' as const, difficulty: 'medium' as const, pain: 3,
  estMinutes: 45, lastDoneDaysAgo: 10 as number | null, ...over,
})
const prefs = { difficulties: ['easy', 'medium', 'hard'] as const, timeCapMinutes: 60 }

describe('suggest', () => {
  it('picks the least recently done; never-done outranks all', () => {
    const r = suggest({ todayCode: 'AT', prefs: { ...prefs, difficulties: [...prefs.difficulties] },
      library: [w('a', { lastDoneDaysAgo: 3 }), w('b', { lastDoneDaysAgo: 40 }), w('c', { lastDoneDaysAgo: null })] })
    expect(r.recommendationId).toBe('c')
    expect(r.poolIds).toEqual(['c', 'b', 'a'])
    expect(r.fellBack).toBe(false)
  })
  it('filters by difficulty prefs and time cap', () => {
    const r = suggest({ todayCode: 'AT', prefs: { difficulties: ['easy'], timeCapMinutes: 40 },
      library: [w('slow', { estMinutes: 90, difficulty: 'easy' }), w('hard', { difficulty: 'hard' }), w('fit', { difficulty: 'easy', estMinutes: 30 })] })
    expect(r.poolIds).toEqual(['fit'])
  })
  it('treats TEST as TR', () => {
    const r = suggest({ todayCode: 'TEST', prefs: { ...prefs, difficulties: [...prefs.difficulties] },
      library: [w('tr1', { type: 'TR' }), w('at1')] })
    expect(r.recommendationId).toBe('tr1')
  })
  it('falls back to the unfiltered type list when filters match nothing', () => {
    const r = suggest({ todayCode: 'AT', prefs: { difficulties: ['easy'], timeCapMinutes: 20 },
      library: [w('only', { difficulty: 'hard', estMinutes: 55, lastDoneDaysAgo: 33 })] })
    expect(r.fellBack).toBe(true)
    expect(r.recommendationId).toBe('only')
    expect(r.reason).toMatch(/closest match/i)
  })
  it('honors todayPick when it is in the pool, with YOUR PICK reason', () => {
    const r = suggest({ todayCode: 'AT', prefs: { ...prefs, difficulties: [...prefs.difficulties] },
      library: [w('a', { lastDoneDaysAgo: null }), w('b')], todayPickId: 'b' })
    expect(r.recommendationId).toBe('b')
    expect(r.reason).toMatch(/your pick/i)
  })
  it('includes recency and cap in the standard reason', () => {
    const r = suggest({ todayCode: 'AT', prefs: { ...prefs, difficulties: [...prefs.difficulties] },
      library: [w('a', { lastDoneDaysAgo: 33 })] })
    expect(r.reason).toMatch(/33 days ago/)
    expect(r.reason).toMatch(/60/)
  })
  it('returns null recommendation for an empty type', () => {
    const r = suggest({ todayCode: 'AN', prefs: { ...prefs, difficulties: [...prefs.difficulties] }, library: [w('at')] })
    expect(r.recommendationId).toBeNull()
  })
})
```
- [ ] **Step 2: RED. Step 3: Implement** — `plans.ts` sessions arrays generated by a tiny deterministic builder function IN THE FILE (weekly templates per third, e.g. sprint weeks 1-4 `['O2','AT','O2','O2','AT','O2','TR']` … documented rationale comment per third) then flattened, with TEST spliced at 6/34/62; export the literal result. `suggest.ts` per the contract above; reasons built from inputs.
- [ ] **Step 4: GREEN + commit** `feat(domain): original plan presets and suggestion engine`

---

### Task 5: Schema migration — six new tables

**Files:**
- Modify: `app/server/db/schema.ts`
- Create: generated `app/drizzle/0001_*.sql`, `app/server/db/domainSchema.integration.test.ts`

**Interfaces:**
- Produces Drizzle tables exactly per the spec's Schema section: `baselines`, `workouts`, `sessionLogs`, `planState`, `preferences`, `testHistory` — names, columns, enums (`workout_type`, `difficulty`, `workout_source`, `held_result`, `test_distance` as pgEnum), CHECK constraints (pain 1..5 on both workouts and session_logs via `check()`), FK behaviors (all user_id cascade; session_logs.workout_id SET NULL), indexes on every user_id + unique (user_id, num) on workouts.

- [ ] **Step 1:** Write the table definitions (follow the spec column-for-column; use `jsonb('steps')`, `real()` for seconds, `pgEnum` for the five enums, composite unique `unique().on(t.userId, t.num)`).
- [ ] **Step 2:** `pnpm db:generate` — inspect the SQL: 5 CREATE TYPE + 6 CREATE TABLE + FKs (one SET NULL, rest CASCADE) + indexes + unique + CHECKs. Commit the migration files as generated (expand-only: no ALTERs of existing tables).
- [ ] **Step 3:** Integration test (Testcontainers, migrate, then): information_schema lists all six; inserting workout with pain 6 throws; deleting a user cascades workouts/logs/prefs; deleting a workout nulls session_logs.workout_id (insert minimal rows to prove both).
- [ ] **Step 4:** Full suite + commit `feat(db): domain tables (baselines, workouts, logs, plan, prefs, tests)`

---

### Task 6: Stores

**Files:**
- Create: `app/server/stores/baselines.ts`, `workouts.ts`, `logs.ts`, `planState.ts`, `preferences.ts`, `testHistory.ts` (all under `app/server/stores/`), `app/server/stores/stores.integration.test.ts`

**Interfaces:**
- Produces (all take `db: Db`, every method takes `userId` first — the scoping is structural):

```ts
createBaselinesStore(db): { get(userId): Promise<{k2Seconds: number|null, k6Seconds: number|null}|null>
                            put(userId, {k2Seconds?, k6Seconds?}): Promise<void> }
createWorkoutsStore(db): { list(userId); get(userId, id); create(userId, WorkoutInput & {source}); createMany(userId, inputs[])
                           update(userId, id, WorkoutInput); remove(userId, id); count(userId) }   // num-clash → throws StoreConflictError
createLogsStore(db):     { list(userId, limit); create(userId, LogInput): Promise<{id}> }          // create also bumps plan_state.done_n in ONE transaction
createPlanStateStore(db):{ get(userId); set(userId, planKey|null); reset(userId) }
createPreferencesStore(db): { get(userId) /* returns defaults when absent */; put(userId, partial) }
createTestHistoryStore(db): { list(userId); append(userId, {distance, splitSeconds}) /* computes delta vs previous same-distance */ }
export class StoreConflictError extends Error {}
```
- `LogInput`: `{workoutId: string|null, workoutTitle, workoutType, baselineK2, baselineK6, held, pain, notes, steps: LogStep[]}` with `LogStep = {label, targetSplit, actualSplit?, actualSource: 'assumed'|'stopwatch'|'pm5', spm?, meters?, seconds?}`.

- [ ] **Step 1:** One integration test file covering per store: round-trip, defaults (preferences), num-clash conflict, transactional done_n bump on log create, test-history delta computation, and that `get`/`list` with a DIFFERENT userId returns nothing (store-level isolation — the API-level test comes in Task 9). Write tests first (RED against missing modules), then implement stores with drizzle queries. Preferences defaults: exactly the spec's default column values, returned without inserting.
- [ ] **Step 2:** GREEN, lint, typecheck, coverage still ≥90. Commit `feat(server): user-scoped domain stores`

---

### Task 7: Routes — the full REST surface (TDD)

**Files:**
- Create: `app/server/routes/data.ts` (router factory), `app/server/routes/data.test.ts`
- Modify: `app/server/app.ts` (AppDeps grows `stores` + mounts router behind requireUser), `app/server/testDeps.ts`, `app/server/index.ts`

**Interfaces:**
- Produces `createDataRouter(deps: { stores: Stores; requireUser: RequestHandler })` where `Stores` bundles the six store instances + a `domain` facade (validate/estimate/suggest are imported directly — pure). Routes and error shapes EXACTLY per the spec's API section (baselines GET/PUT with bounds + isTestResult; workouts CRUD + bulk with per-line results; logs GET/POST; plan GET/PUT; prefs GET/PUT; test-history GET; today GET with 422 `baselines_required`).
- `AppDeps` gains `stores: Stores | null` (null in auth-only tests; router mounted only when present — testDeps default null keeps every existing test untouched).
- **Bulk paste grammar** (`POST /api/workouts/bulk` body `{text}`; blocks separated by blank lines; parser `parseBulk(text)` lives in `app/domain/bulk.ts` + `bulk.test.ts`, added in this task since it's pure):
  - Header line: `num | title | TYPE | difficulty | pain` → `12 | Ladder Day | AT | medium | 3`
  - Step lines, one per step: `wu 10` · `x4` (reps marker) · `w 1' 6k-2 @22 r5` · `w 2500m 2k-4 @24 r5` (`@spm` and `r<rest-minutes>` optional; `'` marks minutes, `m` marks meters) · `r 5` · `test 2k`
  - Parser returns `{workouts: WorkoutInput[], errors: [{block, line, message}]}`; every parsed workout still goes through `validateWorkoutInput`. Tests: one valid multi-block paste, each malformed-line class (bad header field, unknown step word, bad duration unit, bad pace ref), and blank-lines-tolerant splitting.

- [ ] **Step 1:** Route unit tests with in-memory fake stores (write the fakes in the test file — maps keyed by userId): per route happy path + validation failure + the specific status codes (409 num clash via StoreConflictError, 422 today/`baselines_required` when baselines null, 404 cross-user id → note: fakes return null for unknown, route maps to 404). Two sessions stubbed via the existing fakeStore pattern for requireUser. ~30 tests; write them ALL (this file is the API contract).
- [ ] **Step 2:** RED → implement `data.ts`: thin handlers — parse/validate (domain validators), call store, map errors (`StoreConflictError`→409); `POST /api/logs` validates steps' actualSource enum; `GET /api/today`: baselines→422 if either null; assemble SuggestInput from stores (lastDoneDaysAgo from latest log per workout — add `logsStore.lastDonePerWorkout(userId)` if needed: add it in Task 6's file WITH a test when you get here; note it in the report).
- [ ] **Step 3:** Wire app.ts/index.ts (stores built from db in index.ts). GREEN all projects. Commit `feat(api): complete user-scoped data surface`

---

### Task 8: Starter library + plan-preset review gate  ⚠️ JAMES GATE

**Files:**
- Create: `app/server/seed/starter.ts`, `app/server/seed/starter.test.ts`

**Interfaces:**
- Produces `STARTER_WORKOUTS: Array<WorkoutInput>` (~35) and re-exports `PLANS` for review context.

- [ ] **Step 1:** Author ~35 ORIGINAL workouts per the spec's composition matrix (4 types × 3 difficulties × time bands; ≥6 with distance steps; pain 1–5 sensibly assigned; original naming scheme — pick a coherent theme, e.g. weather/geography/tools, NOT book-style names; one-line rationale comment per workout citing its methodology basis: "AN: 8×45s at ~1:4 rest", etc.).
- [ ] **Step 2:** `starter.test.ts`: every entry passes `validateWorkoutInput`; nums unique 1..35; matrix coverage assertions (each type×difficulty combo ≥2; each time band ≥6 members via estimateMinutes at reference baselines; ≥6 distance workouts); no title collides with the fixtures.
- [ ] **Step 3:** Render a review document (markdown table: num, title, type, difficulty, pain, structure summary, est duration + the two plan-preset week-by-week grids) to `.superpowers/sdd/starter-review.md` and STOP: the controller sends it to James. **Do not proceed to commit until the controller relays approval.** Apply any edits he requests, re-run tests.
- [ ] **Step 4:** After approval: commit `feat(seed): original starter library and plan presets (James-approved)`

---

### Task 9: Global library retrofit + boot seeding + isolation & freezing suite  (AMENDED — global model per James)

**Files:**
- Modify: `app/server/db/schema.ts` (workouts.user_id nullable; partial unique indexes), regenerate `app/drizzle/0001_*` (unmerged branch — regenerate in place per Task 5 precedent), `app/server/stores/workouts.ts` (+ its integration tests), `app/server/routes/data.ts` + `data.test.ts` (403 on global mutations; list/get span globals), `app/server/index.ts` (boot seed after migrate)
- Create: `app/server/seed/seed.ts`, `app/server/seed/seed.integration.test.ts`, `app/server/routes/isolation.integration.test.ts`
- REMOVE the planned signInWithClaims seed hook (no per-user seeding exists anymore)

**Interfaces:**
- Schema: `workouts.user_id` nullable; uniqueness = two partial indexes: `unique (user_id, num) where user_id is not null` and `unique (num) where user_id is null`.
- Stores: `workouts.list(userId)` returns globals (user_id NULL) ∪ user's rows, each row carrying `isGlobal: boolean`; `get(userId, id)` resolves globals too; `update/remove(userId, id)` NEVER touch global rows (scoped `user_id = $userId` exactly as today — structural safety); new `listGlobals()`/`countGlobals()` for seeding; `create` unchanged (always personal).
- Routes: PUT/DELETE `/api/workouts/:id` on a global id → 403 `{error:'starter_readonly'}` (get() the row; if isGlobal → 403 before any store write). GET list/get include globals. `/api/today` pool spans both.
- Seeding: `seedGlobalLibrary(db)` — idempotent (skip when `countGlobals() > 0`), transactional, inserts STARTER_WORKOUTS with `userId: null`; called in `index.ts` after `migrate()`.

- [ ] **Step 1:** Schema change + regenerate migration (verify SQL: nullable user_id, both partial uniques). Update the Task 5 integration test expectations if they assert NOT NULL.
- [ ] **Step 2:** TDD stores: extend stores.integration.test.ts — list returns 35 globals for a fresh user + their creations; update/remove against a global id no-ops (row unchanged); num uniqueness independent between global and personal namespaces.
- [ ] **Step 3:** TDD routes: data.test.ts — GET list includes `isGlobal:true` rows; PUT/DELETE global → 403 starter_readonly; POST create personal num colliding with a GLOBAL num → allowed (namespaces separate).
- [ ] **Step 4:** seed.ts + seed.integration.test.ts: fresh DB seeds 35 globals; second call inserts none; wired in index.ts post-migrate (boot order documented).
- [ ] **Step 5:** isolation.integration.test.ts — THE PHASE 2 OBLIGATION: two real users via stubbed-verifier native sign-ins → bearers → full API sweep: globals visible to BOTH (by design, assert identical 35); A's personal workout/log/baselines/prefs/plan invisible to B on EVERY endpoint; B's mutations on A's ids → 404; A logs → changes baselines → frozen log values unchanged.
- [ ] **Step 6:** Full suite + coverage ≥90; commit `feat(library): global starter library, boot seeding, two-user isolation proven`

---

### Task 10: Full verify + PR

- [ ] `cd app && pnpm lint && pnpm typecheck && pnpm test && pnpm test:coverage && pnpm build` all green.
- [ ] Compose stack up locally: `POSTGRES_PASSWORD=devpass docker compose up -d --build --wait`; `curl :8081/api/health` ok; `curl :8081/api/workouts` → 401 (guard holds); down -v.
- [ ] Push, PR (body: spec link, isolation-obligation discharged, James-approved starter content note), `gh run watch --exit-status` green.

---

### Task 11: Merge + close-out (controller + James)

- [ ] Merge (rebase) → deploy green → live: `/api/workouts` 401s; sign in on the WEB prototype → library seeds 35 for existing accounts on next sign-in (verify via James's account or psql count).
- [ ] Release recommendation: expected "No TestFlight release needed" (server-only — but STATE it, per the standing rule).
- [ ] ROADMAP Phase 4 → Done + boxes; plan checkboxes; ledger. Close-out PR.

## Exit criteria (spec)

- [ ] Every handoff domain-model formula passes tests (Tasks 1–4; the 25-phase/50′ and distance-estimate contracts exact)
- [ ] Two users hold fully isolated data across the entire API (Task 9)
- [ ] James approved the starter library + original plan presets before merge (Task 8 gate)
- [ ] Deployed; guard verified live; seeding verified for an existing account
