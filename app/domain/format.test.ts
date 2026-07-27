import { describe, it, expect } from 'vitest'
import { fmtSplit } from './format.js'

describe('fmtSplit', () => {
  it('formats the handoff baselines', () => {
    expect(fmtSplit(112)).toBe('1:52.0')
    expect(fmtSplit(122)).toBe('2:02.0')
  })
  it('keeps tenths', () => {
    expect(fmtSplit(113.5)).toBe('1:53.5')
  })
  it('rounds to the nearest tenth, carrying into seconds and minutes', () => {
    expect(fmtSplit(119.97)).toBe('2:00.0')
  })
  it('pads seconds under ten', () => {
    expect(fmtSplit(65.4)).toBe('1:05.4')
  })
})
