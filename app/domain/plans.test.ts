import { describe, it, expect } from 'vitest'
import { PLANS, SPRINT_WEEKS, HEAD_WEEKS } from './plans.js'

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

it('pins the O2-forward type mixes exactly (O2 > AT > TR > AN pyramid)', () => {
  const tally = (arr: string[]) => {
    const t: Record<string, number> = { O2: 0, AT: 0, TR: 0, AN: 0, TEST: 0 }
    for (const c of arr) t[c] += 1
    return t
  }
  expect(tally(PLANS.sprint.sessions)).toEqual({ O2: 34, AT: 23, TR: 14, AN: 10, TEST: 3 })
  expect(tally(PLANS.head.sessions)).toEqual({ O2: 41, AT: 21, TR: 11, AN: 8, TEST: 3 })
})

it('sprint back half is speed-biased; head is endurance-biased overall', () => {
  const sp = PLANS.sprint.sessions
  const count = (arr: string[], codes: string[]) => arr.filter((c) => codes.includes(c)).length
  expect(count(sp.slice(42), ['AN', 'TR'])).toBeGreaterThan(count(sp.slice(0, 42), ['AN', 'TR']))
  const hd = PLANS.head.sessions
  expect(count(hd, ['O2', 'AT'])).toBeGreaterThan(count(hd, ['AN', 'TR']))
})

// Extra test beyond the brief: guards against the weekly templates
// degenerating into one micro-cycle copy-pasted across a preset. Checked
// on the raw week templates (pre-TEST-splice) since post-export the TEST
// overwrite makes a couple of weeks look artificially distinct.
describe.each(['sprint', 'head'] as const)('%s week templates', (key) => {
  const weeks = key === 'sprint' ? SPRINT_WEEKS : HEAD_WEEKS
  it('has no two byte-identical week templates', () => {
    expect(new Set(weeks.map((w) => w.join())).size).toBe(weeks.length)
  })
})
