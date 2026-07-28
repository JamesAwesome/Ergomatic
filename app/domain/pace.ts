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
