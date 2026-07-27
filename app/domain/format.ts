/** Format a per-500m split in seconds as m:ss.t (e.g. 112 -> "1:52.0"). */
export function fmtSplit(totalSeconds: number): string {
  const tenths = Math.round(totalSeconds * 10)
  const minutes = Math.floor(tenths / 600)
  const rem = tenths % 600
  const seconds = Math.floor(rem / 10)
  const tenth = rem % 10
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenth}`
}
