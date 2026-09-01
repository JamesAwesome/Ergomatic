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
 * `interrupted` recovery): the series trace's last sample, DECODED — the
 * recorder stores `t`/`d` as TENTHS of a second and DECIMETRES
 * (`seriesRecorder.ts`'s own `Math.round(x * 10)` writes), and the first
 * cut of this function read them as seconds/metres, a 10x wrong number on
 * exactly the path with no machine summary to catch it. The review caught
 * it in the committed captures themselves: live 0:16 / 64 m, door
 * 2:40 / 640 m — the same row, ten times over. The unit test could not
 * see it because it seeded the fields in the units this function assumed
 * (RF3's shape at the fixture level).
 *
 * A `truncated` trace returns null rather than its tail: the cap
 * (`SERIES_SAMPLE_CAP`, four hours of rowing) means the tail is where the
 * RECORDER stopped, not where the row did, and knowingly posting it as
 * whole-row totals would store a wrong number wearing a stored one's
 * clothes. Unavailable is the honest answer, and the door renders it as
 * exactly that.
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
  if (run.series?.truncated === true) return null;
  const tail = run.series?.samples.at(-1);
  if (tail !== undefined) return { seconds: tail.t / 10, meters: tail.d / 10 };
  return null;
}
