/** Format a per-500m split in seconds as m:ss.t (e.g. 112 -> "1:52.0"). */
export function fmtSplit(totalSeconds: number): string {
  const tenths = Math.round(totalSeconds * 10);
  const minutes = Math.floor(tenths / 600);
  const rem = tenths % 600;
  const seconds = Math.floor(rem / 10);
  const tenth = rem % 10;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenth}`;
}

/** Metres with the house thousands separator, hand-rolled (never `Intl`
 *  or `toLocaleString`), rounded first so a float sum never prints its
 *  tail. The ONE copy: `LogRow.tsx` and `src/you/stats/format.ts` import
 *  it (Phase PS PR 1 fix round, deduped). */
export function fmtMeters(meters: number): string {
  return Math.round(meters)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
