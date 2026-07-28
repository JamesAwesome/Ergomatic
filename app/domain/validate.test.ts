import { describe, it, expect } from 'vitest'
import { validateSteps, validateWorkoutInput } from './validate.js'

const work = (over: object = {}) => ({
  k: 'w',
  duration: { kind: 'time', minutes: 10 },
  ref: { base: '6k', off: -2 },
  spm: 22,
  ...over,
})

describe('validateSteps', () => {
  it('accepts the interval-ladder shape', () => {
    const steps = [
      { k: 'wu', minutes: 10 },
      { k: 'reps', count: 4 },
      work(),
      work(),
      work(),
      work(),
      work(),
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
      [{ k: 'wu', minutes: 10 }], // no work/test step
      [work(), { k: 'reps', count: 4 }], // marker last
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
