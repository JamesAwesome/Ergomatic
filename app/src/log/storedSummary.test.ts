import { describe, expect, it } from "vitest";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import type {
  MeasuredRow,
  PrescribedRow,
  SummaryRow,
} from "../session/summaryModel";
import { buildStoredSummary, type StoredLog } from "./storedSummary";

// Same idiom as `summaryModel.test.ts`'s own `asMeasured`: narrows a
// SummaryRow to its measured variant with a loud failure (never a silent
// `undefined`) instead of an in-test conditional (vitest/no-conditional-
// expect), since every call site below already expects a measured row by
// construction of its own fixture.
function asMeasured(row: SummaryRow | undefined): MeasuredRow {
  if (row === undefined || !row.measured) {
    throw new Error(`expected a measured row, got ${JSON.stringify(row)}`);
  }
  return row;
}

function asPrescribed(row: SummaryRow | undefined): PrescribedRow {
  if (row === undefined || row.measured) {
    throw new Error(`expected a prescribed row, got ${JSON.stringify(row)}`);
  }
  return row;
}

// Realistic fixtures, per repo convention (HistoryList.test.tsx's own
// comment): real library titles/types rather than an invented placeholder
// string — `workoutTitle`/`workoutType` below always come from a real
// LIBRARY_WORKOUTS entry, even where the row's own `steps` are hand-built
// to isolate one §5 rule at a time (the same division PostWorkoutSummary.
// test.tsx's `prescribedOnlyModel`/`monitorModel` already draw).
const SEA_FRET = LIBRARY_WORKOUTS.find((w) => w.title === "Sea Fret")!;

function baseRow(overrides: Partial<StoredLog> = {}): StoredLog {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    workoutId: null,
    workoutTitle: SEA_FRET.title,
    workoutType: SEA_FRET.type,
    loggedAt: "2026-08-18T18:57:00.000Z",
    held: null,
    pain: null,
    notes: null,
    thumbs: null,
    deviceName: null,
    steps: [],
    avgSplitSeconds: null,
    timeSeconds: null,
    distanceMeters: null,
    planKey: null,
    planIndex: null,
    ...overrides,
  };
}

describe("buildStoredSummary — §5A source derivation", () => {
  it("uses the stored deviceName when present, regardless of step shape", () => {
    const view = buildStoredSummary(
      baseRow({
        deviceName: "PM5 432331249",
        steps: [
          {
            label: "6:00 @ 6k",
            actualSplit: 125,
            actualSource: "stopwatch",
            meters: 1500,
          },
        ],
      }),
    );
    expect(view.meta.sourceLabel).toBe("PM5 432331249");
  });

  it("falls back to TIMER when no deviceName but a step carries actualSource stopwatch", () => {
    const view = buildStoredSummary(
      baseRow({
        deviceName: null,
        steps: [
          {
            label: "6:00 @ 6k",
            actualSplit: 125,
            actualSource: "stopwatch",
            meters: 1500,
          },
        ],
      }),
    );
    expect(view.meta.sourceLabel).toBe("TIMER");
  });

  it("falls back to LOGGED BY HAND when neither a deviceName nor any stopwatch-sourced step exists (James's copy ruling, fix round: matches the live door's own manual-door string)", () => {
    const view = buildStoredSummary(
      baseRow({
        deviceName: null,
        steps: [
          {
            label: "10:00 @ 6k +8",
            targetSplit: 130,
            actualSplit: 130,
            actualSource: "assumed",
            seconds: 600,
          },
        ],
      }),
    );
    expect(view.meta.sourceLabel).toBe("LOGGED BY HAND");
  });

  it("shows a time-of-day segment for a device/timer source but omits it for LOGGED BY HAND (mirrors spec 1's manual-door omission byte-for-byte)", () => {
    const withDevice = buildStoredSummary(baseRow({ deviceName: "PM5 1" }));
    expect(withDevice.meta.timeLabel).toBeDefined();
    const byHand = buildStoredSummary(baseRow());
    expect(byHand.meta.timeLabel).toBeUndefined();
  });
});

describe("buildStoredSummary — §5B heroes, per-cell absence", () => {
  it("renders each hero independently from its own stored number", () => {
    const view = buildStoredSummary(
      baseRow({
        avgSplitSeconds: 129.2,
        timeSeconds: 1550,
        distanceMeters: 6000,
      }),
    );
    expect(view.heroes.avgSplit).toBe("2:09.2");
    expect(view.heroes.time).toBe("25:50");
    expect(view.heroes.distanceMeters).toBe(6000);
  });

  it("an old (pre-migration) row with all three heroes null renders every hero field absent — the whole block closes up", () => {
    const view = buildStoredSummary(
      baseRow({
        avgSplitSeconds: null,
        timeSeconds: null,
        distanceMeters: null,
      }),
    );
    expect(view.heroes.avgSplit).toBeUndefined();
    expect(view.heroes.avgSplitSeconds).toBeUndefined();
    expect(view.heroes.time).toBeUndefined();
    expect(view.heroes.timeSeconds).toBeUndefined();
    expect(view.heroes.distanceMeters).toBeUndefined();
  });

  it("a single present hero (DISTANCE only) leaves the other two absent, never a fabricated 0", () => {
    const view = buildStoredSummary(baseRow({ distanceMeters: 5000 }));
    expect(view.heroes.distanceMeters).toBe(5000);
    expect(view.heroes.avgSplit).toBeUndefined();
    expect(view.heroes.time).toBeUndefined();
  });
});

describe("buildStoredSummary — §5C row judging, both legs plus the abstention", () => {
  const twoStopwatchSteps: StoredLog["steps"] = [
    { label: "a", actualSplit: 120, actualSource: "stopwatch", meters: 1500 },
    { label: "b", actualSplit: 140, actualSource: "stopwatch", meters: 1500 },
  ];

  it("judges when avg_split_seconds is non-null AND >=2 stored steps carry actualSplit", () => {
    const view = buildStoredSummary(
      baseRow({ avgSplitSeconds: 130, steps: twoStopwatchSteps }),
    );
    expect(view.rows[0]!.measured).toBe(true);
    expect(view.rows[1]!.measured).toBe(true);
    const a = asMeasured(view.rows[0]);
    const b = asMeasured(view.rows[1]);
    expect(a.judged).toBeDefined();
    expect(b.judged).toBeDefined();
    expect(a.judged!.direction).toBe("faster"); // 120 < 130
    expect(b.judged!.direction).toBe("slower"); // 140 > 130
  });

  it("leg 1 fails (avg_split_seconds null) — every row renders unjudged, no bars", () => {
    const view = buildStoredSummary(
      baseRow({ avgSplitSeconds: null, steps: twoStopwatchSteps }),
    );
    for (const row of view.rows) {
      expect(asMeasured(row).judged).toBeUndefined();
    }
  });

  it("leg 2 fails (fewer than 2 steps carry actualSplit) — the lone row renders unjudged, no bars (the abstention)", () => {
    const oneStep: StoredLog["steps"] = [
      { label: "a", actualSplit: 120, actualSource: "stopwatch", meters: 1500 },
    ];
    const view = buildStoredSummary(
      baseRow({ avgSplitSeconds: 130, steps: oneStep }),
    );
    expect(asMeasured(view.rows[0]).judged).toBeUndefined();
  });

  it("accepted divergence: a step with no actualSplit at all still counts toward neither leg, and renders prescribed", () => {
    const steps: StoredLog["steps"] = [
      { label: "a", actualSplit: 120, actualSource: "stopwatch", meters: 1500 },
      { label: "b", targetSplit: 130, seconds: 360 },
    ];
    const view = buildStoredSummary(baseRow({ avgSplitSeconds: 130, steps }));
    expect(asMeasured(view.rows[0]).judged).toBeUndefined(); // only 1 actualSplit in the set
    expect(view.rows[1]!.measured).toBe(false);
  });

  it("a pm5-sourced step below the minimum measurable floor renders prescribed, not measured", () => {
    const steps: StoredLog["steps"] = [
      {
        label: "a",
        actualSplit: 120,
        actualSource: "pm5",
        actualSeconds: 0.2,
        meters: 500,
      },
    ];
    const view = buildStoredSummary(baseRow({ steps }));
    expect(view.rows[0]!.measured).toBe(false);
  });

  it("a pm5-sourced step with no actualSeconds at all (never reached the wire) renders prescribed", () => {
    const steps: StoredLog["steps"] = [
      { label: "a", actualSource: "pm5", targetSplit: 130, seconds: 300 },
    ];
    const view = buildStoredSummary(baseRow({ steps }));
    expect(view.rows[0]!.measured).toBe(false);
  });

  it("a pm5-sourced step measured (actualSeconds above floor) but with no usable actualSplit (out-of-band avgSplit dropped) renders measured with an empty pace, unjudged", () => {
    const steps: StoredLog["steps"] = [
      { label: "a", actualSource: "pm5", actualSeconds: 300 },
    ];
    const view = buildStoredSummary(baseRow({ avgSplitSeconds: 130, steps }));
    const row = asMeasured(view.rows[0]);
    expect(row.paceLabel).toBeUndefined();
    expect(row.judged).toBeUndefined();
    expect(row.timeLabel).toBe("5:00");
  });

  it("a stopwatch step whose reconstructed elapsed time is below the floor renders prescribed", () => {
    // actualSplit 60s/500m over 5m -> elapsed = 60*5/500 = 0.6s, below the
    // 1s floor.
    const steps: StoredLog["steps"] = [
      { label: "a", actualSplit: 60, actualSource: "stopwatch", meters: 5 },
    ];
    const view = buildStoredSummary(baseRow({ steps }));
    expect(view.rows[0]!.measured).toBe(false);
  });

  it("a prescribed step with neither meters, seconds, nor targetSplit renders every optional cell absent (never a fabricated value)", () => {
    const steps: StoredLog["steps"] = [{ label: "bare label only" }];
    const view = buildStoredSummary(baseRow({ steps }));
    const row = asPrescribed(view.rows[0]);
    expect(row.durationLabel).toBeUndefined();
    expect(row.targetPaceLabel).toBeUndefined();
  });

  it("never re-averages: the judged deviation is computed against the STORED avg split, not the rows' own average", () => {
    const steps: StoredLog["steps"] = [
      { label: "a", actualSplit: 100, actualSource: "stopwatch", meters: 1500 },
      { label: "b", actualSplit: 200, actualSource: "stopwatch", meters: 1500 },
    ];
    // The rows' own average would be 150 — deliberately using a STORED
    // avg far from that (90) to prove the judgment reads the stored
    // number, not something re-derived from these two rows.
    const view = buildStoredSummary(baseRow({ avgSplitSeconds: 90, steps }));
    const a = asMeasured(view.rows[0]);
    const b = asMeasured(view.rows[1]);
    expect(a.judged!.direction).toBe("slower"); // 100 > 90
    expect(a.judged!.deviationSeconds).toBe(10);
    expect(b.judged!.direction).toBe("slower"); // 200 > 90
    expect(b.judged!.deviationSeconds).toBe(110);
  });
});

describe("buildStoredSummary — §5D read-back", () => {
  it("the segment line renders HELD · PAIN n/5 · LIKED in that order, note text separately", () => {
    const view = buildStoredSummary(
      baseRow({ held: "held", pain: 3, thumbs: "up", notes: "felt great" }),
    );
    expect(view.readBack.empty).toBe(false);
    expect(view.readBack.segmentLine).toBe("HELD · PAIN 3/5 · LIKED");
    expect(view.readBack.note).toBe("felt great");
  });

  it("option-B held words render on read-back the same as the live door (UNDER · FASTER / OVER · SLOWER)", () => {
    const under = buildStoredSummary(baseRow({ held: "under" }));
    expect(under.readBack.segmentLine).toBe("UNDER · FASTER");
    const over = buildStoredSummary(baseRow({ held: "over" }));
    expect(over.readBack.segmentLine).toBe("OVER · SLOWER");
  });

  it("thumbs down reads back as LESS LIKE THIS (James's copy ruling, fix round: reuses the live door's own control aria-label vocabulary)", () => {
    const view = buildStoredSummary(baseRow({ thumbs: "down" }));
    expect(view.readBack.segmentLine).toBe("LESS LIKE THIS");
  });

  it("a notes-only log shows the note with no segment line above it (segment line requires >=1 of thumbs/held/pain)", () => {
    const view = buildStoredSummary(baseRow({ notes: "just a note" }));
    expect(view.readBack.empty).toBe(false);
    expect(view.readBack.segmentLine).toBeUndefined();
    expect(view.readBack.note).toBe("just a note");
  });

  it("all four null: the block is wholly absent (empty), no segment line, no note", () => {
    const view = buildStoredSummary(baseRow());
    expect(view.readBack.empty).toBe(true);
    expect(view.readBack.segmentLine).toBeUndefined();
    expect(view.readBack.note).toBeUndefined();
  });

  it("an empty-string note (never written by the live door, but tolerated) counts as absent, same as null", () => {
    const view = buildStoredSummary(baseRow({ notes: "   " }));
    expect(view.readBack.empty).toBe(true);
  });
});

describe("buildStoredSummary — §5E plan footer", () => {
  it("renders Logged to <title> · SESSION <index+1> OF <length> when linkage is stored", () => {
    const view = buildStoredSummary(
      baseRow({ planKey: "sprint", planIndex: 11 }),
    );
    expect(view.planFooter).toBe(
      "Logged to Sprint (2k) Prep · SESSION 12 OF 84",
    );
  });

  it("is absent when linkage is not stored", () => {
    const view = buildStoredSummary(
      baseRow({ planKey: null, planIndex: null }),
    );
    expect(view.planFooter).toBeUndefined();
  });

  it("an unknown plan_key (a future removed plan) renders the key verbatim rather than crashing", () => {
    const view = buildStoredSummary(
      baseRow({ planKey: "retired-plan", planIndex: 4 }),
    );
    expect(view.planFooter).toBe("Logged to retired-plan · SESSION 5");
  });
});

describe("buildStoredSummary — rows carry no warm-up (stored steps never included one)", () => {
  it("every row's isWarmup is false, index is 1-based across the stored steps array", () => {
    const view = buildStoredSummary(
      baseRow({
        steps: [
          { label: "a", targetSplit: 130, seconds: 300 },
          { label: "b", targetSplit: 130, seconds: 300 },
        ],
      }),
    );
    expect(view.rows.map((r) => r.isWarmup)).toStrictEqual([false, false]);
    expect(view.rows.map((r) => r.index)).toStrictEqual([1, 2]);
  });
});

describe("buildStoredSummary — targets-only caption", () => {
  it("carries the TARGETS ONLY caption when no row is measured, and omits it when at least one is", () => {
    const unmeasured = buildStoredSummary(
      baseRow({ steps: [{ label: "a", targetSplit: 130, seconds: 300 }] }),
    );
    expect(unmeasured.caption).toBe("TARGETS ONLY · NOTHING MEASURED");

    const measured = buildStoredSummary(
      baseRow({
        steps: [
          {
            label: "a",
            actualSplit: 120,
            actualSource: "stopwatch",
            meters: 1500,
          },
        ],
      }),
    );
    expect(measured.caption).toBeUndefined();
  });
});
