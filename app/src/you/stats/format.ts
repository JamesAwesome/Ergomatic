import { fmtDuration } from "../../../domain/duration.js";

/** Hand-rolled thousands separator — `LogRow.tsx`'s own `fmtMeters`, the
 *  house rule (never `Intl`/`toLocaleString`). Rounds first: a float sum
 *  (1000.3000000000001) must never print its tail. */
export function fmtMeters(meters: number): string {
  return Math.round(meters)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Elapsed seconds as the house positional clock (`3:59:39`, `13:43`). */
export function fmtSeconds(seconds: number): string {
  return fmtDuration(seconds / 60);
}

/** A 0..1 share as the whole percent the legend prints (spec §3.2). */
export function fmtPercent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

export function fmtDate({
  y,
  m,
  d,
}: {
  y: number;
  m: number;
  d: number;
}): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** The seam line (spec §14 ruling 15): singular at one, plural above. */
export function seamLine(k: number): string {
  return k === 1
    ? "1 ROW PREDATES WORK-ONLY TOTALS · NOT IN AVG WATTS"
    : `${k} ROWS PREDATE WORK-ONLY TOTALS · NOT IN AVG WATTS`;
}
