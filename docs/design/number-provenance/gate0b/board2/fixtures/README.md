# Board 2 fixtures — real stored series, from committed wire captures

Every `*-series.json` here is a **stored `SeriesData`**, produced from a
committed wire recording through the **shipped** recorder
(`src/monitor/seriesRecorder.ts`), not hand-built. Every `*-actuals.json` is
the driver's own `intervalComplete` actuals for the same replay — which is
where each interval's `restSeconds` (0x0037 offset 12) comes from.

Produced by the throwaway probes `app/src/log/board2Probe.test.ts` (the
programmed captures, driven through `createReplayTransport` +
`createPm5Driver`) and `app/src/log/board2FreeRow.test.ts` (the free row,
driven through the real `useMonitorSession` + `beginFreeRow`, the same path
`justRowReplay.test.ts` uses). Both are deleted with the harness.

| fixture | capture | what it is |
| --- | --- | --- |
| `session2-*` | `walk-2026-08-16/session-2-wu-4unequal.jsonl` | five intervals, **three EQUAL 30 s rests**, rowed through at different amounts |
| `rests-finished-*` | `walk-2026-08-25/rests-finished-recording.jsonl.gz` | three intervals, **two EQUAL 60 s rests**, rowed through nearly fully |
| `work-clock-*` | `walk-2026-09-15-work-clock/pm5-recording-1789471533667.jsonl.gz` | one 250 m interval with a **60.5 s dead stop in the middle of the work** |
| `justrow-series.json` | `walk-2026-08-31-justrow/just-row-*.jsonl.gz` | a free row with a **104.6 s pause** the monitor's clock slept through |

The programmed captures carry no `header.program` except step-3, so the
probe passes a `WorkoutProgram` transcribed from each walk's own README
(`board2Probe.test.ts` names the line it came from per program).
