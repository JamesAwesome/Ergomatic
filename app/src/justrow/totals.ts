import type { MonitorRun } from "../monitor/monitorRun";

/**
 * The free row's two headline numbers, and where they come from — F4's
 * answer, in ONE place so the log door and Today's recovery row can never
 * disagree about the same record (the RC-5 shape, one number two ways).
 *
 * FIRST the machine's own 0x0039 (`summaryTotals`): both supported endings
 * produce it now that a free row opens a driver run — the erg answers the
 * app End's terminate with its summary burst, and a Menu end emits the same
 * burst on its own (the walk's CLOSED 4). This is the figure MACHINE
 * CONFIRMED vouches for.
 *
 * FALLBACK, for a row whose burst never landed (a link-lost close, an
 * `interrupted` recovery): the series trace's last sample. Honest about its
 * bound: the trace is whole-second bucketed and capped at 4 hours of rowing
 * (`SERIES_SAMPLE_CAP`), so a capped trace's tail UNDERSTATES the row —
 * `truncated` marks exactly that case — and an understated number still
 * beats refusing to log the row at all.
 *
 * `null` when neither exists: nothing numeric to say, and fabricating a
 * zero would be a wrong number.
 */
export function freeRowTotals(
  run: MonitorRun,
): { seconds: number; meters: number } | null {
  if (run.summaryTotals !== undefined) {
    return {
      seconds: run.summaryTotals.workElapsedSeconds,
      meters: run.summaryTotals.workDistanceMeters,
    };
  }
  const tail = run.series?.samples.at(-1);
  if (tail !== undefined) return { seconds: tail.t, meters: tail.d };
  return null;
}
