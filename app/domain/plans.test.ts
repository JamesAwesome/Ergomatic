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
