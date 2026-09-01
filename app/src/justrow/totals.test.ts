import { describe, expect, it } from "vitest";
import { createMonitorRun, type MonitorRun } from "../monitor/monitorRun";
import { freeRowTotals } from "./totals";

/** Built through the real builder, then closed by hand the way the hook's
 *  close stamps it — never a bare object literal (recurring failure 3). */
function closedFreeRow(over: Partial<MonitorRun> = {}): MonitorRun {
  const run = createMonitorRun(
    {
      workoutId: null,
      title: "Just Row",
      program: { intervals: [] },
      deviceName: "PM5 432331249",
      logSeed: { steps: [], paces: {} },
      mode: "justrow",
    },
    new Date("2026-09-01T09:00:00.000Z"),
  );
  return {
    ...run,
    completedAt: "2026-09-01T09:10:20.000Z",
    endedBy: "rower",
    ...over,
  };
}

describe("freeRowTotals — the headline pair's one source", () => {
  it("prefers the machine's own 0x0039 when it was filed", () => {
    const totals = freeRowTotals(
      closedFreeRow({
        summaryTotals: { workElapsedSeconds: 393.6, workDistanceMeters: 1396 },
        // A trace whose tail DISAGREES, and must lose: the summary is the
        // machine's own record of the whole row, the tail is a bucketed
        // sample.
        series: { samples: [{ t: 390, d: 1380, p: 141, spm: 22 }] },
      }),
    );
    expect(totals).toStrictEqual({ seconds: 393.6, meters: 1396 });
  });

  it("falls back to the series tail when the burst never landed — the link-lost recovery's own path", () => {
    const totals = freeRowTotals(
      closedFreeRow({
        endedBy: "interrupted",
        series: {
          samples: [
            { t: 10, d: 40, p: 140, spm: 22 },
            { t: 160, d: 640, p: 125, spm: 22 },
          ],
        },
      }),
    );
    // The LAST sample, not the first — an earlier tail would silently
    // shrink every recovered row.
    expect(totals).toStrictEqual({ seconds: 160, meters: 640 });
  });

  it("returns null when neither source exists — a zero would be a wrong number", () => {
    expect(freeRowTotals(closedFreeRow())).toBeNull();
    expect(
      freeRowTotals(closedFreeRow({ series: { samples: [] } })),
    ).toBeNull();
  });
});
