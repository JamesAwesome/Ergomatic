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

describe("buildStoredSummary — §5C row judging, re-baselined to each row's own target (Phase LT spec 1, §4)", () => {
  // HISTORY NOTE: this describe block used to gate ALL row judgment on two
  // avg_split_seconds-keyed legs ("non-null AND >=2 steps carry
  // actualSplit") — the OLD §5C rule, judging every row against the
  // STORED WORKING AVERAGE. Phase LT spec 1 §4 re-baselines this door to
  // the exact §1 rule the live summary already uses (Task 2): each row
  // judges against ITS OWN stored `targetSplit`, via the same imported
  // `rowJudgment` — avg_split_seconds no longer participates in row
  // judgment AT ALL (it still feeds the AVG SPLIT hero, untouched, via
  // `buildHeroes`). The old leg-1/leg-2 tests are REPLACED below, not
  // deleted outright — the rule they guarded no longer exists.

  it("judges a pm5-sourced row against its own target, independent of avg_split_seconds (which no longer gates judgment at all)", () => {
    const steps: StoredLog["steps"] = [
      {
        label: "a",
        targetSplit: 130,
        actualSplit: 124,
        actualSource: "pm5",
        actualSeconds: 300,
      },
    ];
    // avg_split_seconds deliberately null — the OLD rule's leg 1 would
    // have forced every row unjudged here; the new rule never reads this
    // field for judgment at all.
    const view = buildStoredSummary(baseRow({ avgSplitSeconds: null, steps }));
    const row = asMeasured(view.rows[0]);
    expect(row.judged).toBeDefined();
    expect(row.judged!.direction).toBe("faster"); // 124 < 130
    expect(row.judged!.deviationSeconds).toBe(-6);
  });

  it("judges a stopwatch-sourced row too (the timer door's own fingerprint)", () => {
    const steps: StoredLog["steps"] = [
      {
        label: "a",
        targetSplit: 130,
        actualSplit: 140,
        actualSource: "stopwatch",
        meters: 1500,
      },
    ];
    const view = buildStoredSummary(baseRow({ steps }));
    const row = asMeasured(view.rows[0]);
    expect(row.judged).toBeDefined();
    expect(row.judged!.direction).toBe("slower"); // 140 > 130
    expect(row.judged!.deviationSeconds).toBe(10);
  });

  it('never judges an "assumed"-sourced row, even when actual equals target exactly (antagonist B4 — the by-hand fixture stays unpainted)', () => {
    const steps: StoredLog["steps"] = [
      {
        label: "a",
        targetSplit: 130,
        actualSplit: 130,
        actualSource: "assumed",
        seconds: 600,
      },
    ];
    const view = buildStoredSummary(baseRow({ steps }));
    // An "assumed" actual never clears `measuredElapsedSeconds` (that
    // gate only recognizes pm5/stopwatch), so this row is
    // PRESCRIBED-shaped — `judged`/`onTarget` don't even exist on this
    // row's own type, the strongest form of "never judged".
    const row = asPrescribed(view.rows[0]);
    expect(row).not.toHaveProperty("judged");
    expect(row).not.toHaveProperty("onTarget");
  });

  it("the RETIRED lone-row gate: a single judged row (previously abstained under the old count>=2 leg) now judges normally", () => {
    const steps: StoredLog["steps"] = [
      {
        label: "a",
        targetSplit: 130,
        actualSplit: 124,
        actualSource: "pm5",
        actualSeconds: 300,
      },
    ];
    const view = buildStoredSummary(baseRow({ avgSplitSeconds: 130, steps }));
    const row = asMeasured(view.rows[0]);
    expect(row.judged).toBeDefined();
    expect(row.judged!.direction).toBe("faster");
  });

  it("within the ±0.5s band (INCLUSIVE, both directions): onTarget, plain — no judged, no bar/±", () => {
    const steps: StoredLog["steps"] = [
      {
        label: "a",
        targetSplit: 130,
        actualSplit: 130.5,
        actualSource: "pm5",
        actualSeconds: 300,
      },
      {
        label: "b",
        targetSplit: 130,
        actualSplit: 129.5,
        actualSource: "pm5",
        actualSeconds: 300,
      },
    ];
    const view = buildStoredSummary(baseRow({ steps }));
    const a = asMeasured(view.rows[0]);
    const b = asMeasured(view.rows[1]);
    expect(a.onTarget).toBe(true);
    expect(a.judged).toBeUndefined();
    expect(b.onTarget).toBe(true);
    expect(b.judged).toBeUndefined();
  });

  it("just outside the band (±0.6s): judged, not onTarget", () => {
    const steps: StoredLog["steps"] = [
      {
        label: "a",
        targetSplit: 130,
        actualSplit: 130.6,
        actualSource: "pm5",
        actualSeconds: 300,
      },
    ];
    const view = buildStoredSummary(baseRow({ steps }));
    const row = asMeasured(view.rows[0]);
    expect(row.judged).toBeDefined();
    expect(row.onTarget).toBeUndefined();
  });

  it("abstains (no judged, no onTarget) when the row has no target at all, even with a real measured actual", () => {
    const steps: StoredLog["steps"] = [
      { label: "a", actualSplit: 130, actualSource: "pm5", actualSeconds: 300 },
    ];
    const view = buildStoredSummary(baseRow({ steps }));
    const row = asMeasured(view.rows[0]);
    expect(row.judged).toBeUndefined();
    expect(row.onTarget).toBeUndefined();
    expect(row.targetLabel).toBeUndefined();
  });

  it("the TARGET cell keys on targetSplit ALONE (antagonist B5): a pm5 pairing-exception row (time real, no usable pace) still shows its target while judged/onTarget stay absent", () => {
    const steps: StoredLog["steps"] = [
      { label: "a", targetSplit: 130, actualSource: "pm5", actualSeconds: 300 },
    ];
    const view = buildStoredSummary(baseRow({ steps }));
    const row = asMeasured(view.rows[0]);
    expect(row.targetLabel).toBe("2:10.0");
    expect(row.paceLabel).toBeUndefined();
    expect(row.judged).toBeUndefined();
    expect(row.onTarget).toBeUndefined();
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

  // HISTORY NOTE: this test used to be named "never re-averages: the
  // judged deviation is computed against the STORED avg split, not the
  // rows' own average" and proved judgment read `avg_split_seconds`
  // rather than re-deriving an average from the two rows themselves.
  // Phase LT spec 1 §4 retires that whole baseline — judgment now reads
  // each row's own `targetSplit`, never any average, stored or
  // re-derived. Rewritten (not deleted) to prove the SAME kind of
  // independence against the NEW baseline: two rows with wildly
  // different targets judge independently of one another and of
  // avg_split_seconds, which this fixture sets to a third, unrelated
  // number to prove it is read by nothing here.
  it("each row judges independently against its OWN target — two different targets, avg_split_seconds unrelated and unread", () => {
    const steps: StoredLog["steps"] = [
      {
        label: "a",
        targetSplit: 90,
        actualSplit: 100,
        actualSource: "stopwatch",
        meters: 1500,
      },
      {
        label: "b",
        targetSplit: 190,
        actualSplit: 200,
        actualSource: "stopwatch",
        meters: 1500,
      },
    ];
    const view = buildStoredSummary(baseRow({ avgSplitSeconds: 9999, steps }));
    const a = asMeasured(view.rows[0]);
    const b = asMeasured(view.rows[1]);
    expect(a.judged!.direction).toBe("slower"); // 100 > 90 (its OWN target)
    expect(a.judged!.deviationSeconds).toBe(10);
    expect(b.judged!.direction).toBe("slower"); // 200 > 190 (its OWN target)
    expect(b.judged!.deviationSeconds).toBe(10);
  });
});

describe("buildStoredSummary — §2 SPM cell, the pre-/post-split discriminant (criterion 3)", () => {
  it("a post-split row: measured first (actualSpm), authored target after the slash (spm)", () => {
    const steps: StoredLog["steps"] = [
      {
        label: "a",
        actualSource: "pm5",
        actualSeconds: 300,
        actualSpm: 24,
        spm: 22,
      },
    ];
    const view = buildStoredSummary(baseRow({ steps }));
    const row = asMeasured(view.rows[0]);
    expect(row.spmCell).toStrictEqual({ measured: 24, target: 22 });
  });

  it("an OLD (pre-split) monitor row: spm holds the measured value, no target half at all — the ROW-LOCAL discriminant, never an age heuristic (exit criterion 3)", () => {
    const steps: StoredLog["steps"] = [
      {
        label: "old pm5 row",
        actualSource: "pm5",
        actualSeconds: 300,
        actualSplit: 130,
        spm: 24,
        // No actualSpm key at all — the exact pre-split shape this row's
        // own storage predates (this field did not exist yet).
      },
    ];
    const view = buildStoredSummary(baseRow({ steps }));
    const row = asMeasured(view.rows[0]);
    expect(row.spmCell).toStrictEqual({ measured: 24 });
  });

  // Final-review fix round (IMPORTANT finding): the from-the-log door
  // reads a STORED row straight off the wire with no door-measurability
  // gate in front of it, so a genuinely old row with `spm: 0` (saved
  // under the pre-`MONITOR_SPM_MIN`-1 floor) reaches `buildSpmCell` here
  // too — `summaryModel.test.ts`'s own version of this test carries the
  // full reasoning. Both renderers share the ONE `buildSpmCell`
  // (`summaryModel.ts`), so this is the from-the-log leg of the same
  // fix, not a second implementation of it.
  it("an OLD (pre-split) monitor row with spm: 0 (old floor): rendered as absent, never {measured: 0}", () => {
    const steps: StoredLog["steps"] = [
      {
        label: "old pm5 row, zero under the old floor",
        actualSource: "pm5",
        actualSeconds: 300,
        actualSplit: 130,
        spm: 0,
        // No actualSpm key at all — same pre-split shape as the test
        // above, but with the legacy zero this fix guards against.
      },
    ];
    const view = buildStoredSummary(baseRow({ steps }));
    const row = asMeasured(view.rows[0]);
    expect(row.spmCell).toBeUndefined();
  });

  it("a measured-only cell (no authored rate stored at all)", () => {
    const steps: StoredLog["steps"] = [
      { label: "a", actualSource: "pm5", actualSeconds: 300, actualSpm: 24 },
    ];
    const view = buildStoredSummary(baseRow({ steps }));
    const row = asMeasured(view.rows[0]);
    expect(row.spmCell).toStrictEqual({ measured: 24 });
  });

  it("a target-only cell (the timer/manual doors never store a measured rate)", () => {
    const steps: StoredLog["steps"] = [
      {
        label: "a",
        actualSplit: 130,
        actualSource: "stopwatch",
        meters: 1500,
        spm: 22,
      },
    ];
    const view = buildStoredSummary(baseRow({ steps }));
    const row = asMeasured(view.rows[0]);
    expect(row.spmCell).toStrictEqual({ target: 22 });
  });

  it("absent entirely when neither half has a value", () => {
    const steps: StoredLog["steps"] = [
      { label: "a", actualSplit: 130, actualSource: "stopwatch", meters: 1500 },
    ];
    const view = buildStoredSummary(baseRow({ steps }));
    const row = asMeasured(view.rows[0]);
    expect(row.spmCell).toBeUndefined();
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

describe("buildStoredSummary — row numbering", () => {
  it("indexes rows 1-based across the stored steps array", () => {
    // Phase WU deleted this case's other assertion,
    // `rows.map(r => r.isWarmup)` — `SummaryRow` has no `isWarmup` field
    // any more, so the property it pinned (a stored row is never a warm-up
    // row) is now a fact about the type rather than one a test can state.
    // The 1-based indexing half is untouched and stays.
    const view = buildStoredSummary(
      baseRow({
        steps: [
          { label: "a", targetSplit: 130, seconds: 300 },
          { label: "b", targetSplit: 130, seconds: 300 },
        ],
      }),
    );
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

// Cohort-unlock spec (2026-08-23), §2: `linkLostLine` is present, with
// the exact copy, for `endedBy === "link-lost"` alone — every other
// value (including the other four real ones, and absent/null) renders
// nothing here, proven by exact equality against several distinct
// non-link-lost values rather than a single negative case (spec's own
// "no endedBy taxonomy display" line — a check that merely negated
// "link-lost" would already satisfy that, but a check that instead
// negated "finished" would not, and only a multi-value probe tells the
// two apart).
describe("buildStoredSummary — cohort-unlock §2 link-lost line", () => {
  it("carries the exact marked line for a link-lost close, against a realistic stored payload", () => {
    const view = buildStoredSummary(
      baseRow({
        endedBy: "link-lost",
        deviceName: "PM5 432331249",
        steps: [
          {
            label: "6:00 @ 6k",
            actualSplit: 125,
            actualSource: "stopwatch",
            meters: 1500,
          },
        ],
        avgSplitSeconds: 125,
        timeSeconds: 300,
        distanceMeters: 1500,
      }),
    );
    expect(view.linkLostLine).toBe(
      "LINK LOST · the app lost the monitor before the end",
    );
  });

  it.each([
    ["finished", "finished"],
    ["rower", "rower"],
    ["program-failed", "program-failed"],
    ["interrupted", "interrupted"],
    ["null", null],
    ["absent", undefined],
  ] as const)("omits the line for endedBy=%s", (_label, endedBy) => {
    const view = buildStoredSummary(baseRow({ endedBy }));
    expect(view.linkLostLine).toBeUndefined();
  });
});
