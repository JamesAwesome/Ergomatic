import { describe, expect, it } from "vitest";
import { LOG_SOURCES } from "../../domain/types";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
// I-B5 census (door spec §5.2), Task 4: `eligibilityFailure` is a pure,
// framework-free function (no drizzle-orm, no db schema — the module's own
// header) — the SAME "independent, own-bounds mirror" boundary
// `LIBRARY_WORKOUTS` above already crosses from a client test, not the
// `server/stores/`-graph import `useRecentLogs.ts`'s comment warns off.
import { eligibilityFailure } from "../../server/concept2/mapping";
import {
  buildSummaryModel,
  type MeasuredRow,
  type PrescribedRow,
  type SummaryRow,
} from "../session/summaryModel";
import {
  buildStoredSummary,
  historyChipWord,
  PARTIAL_CLOSE_REASONS,
  partialChipWord,
  partialCloseReason,
  type PartialCloseReason,
  type StoredLog,
  type StoredLogStep,
} from "./storedSummary";

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
    // Just Row unconnected spec (2026-09-02), stored shape (c): the door
    // is a COLUMN now, non-null. The base fixture is the all-assumed shape
    // (no device, no stopwatch step), so its realistic member is `manual`;
    // every device fixture below says `pm5` beside its `deviceName`, and
    // the timer-door fixtures say `timer` (RF3: fixtures look like rows
    // the migration's backfill would actually produce).
    source: "manual",
    c2ResultId: null,
    c2UserId: null,
    steps: [],
    avgSplitSeconds: null,
    timeSeconds: null,
    distanceMeters: null,
    planKey: null,
    planIndex: null,
    // RC-2/RC-3 wave (Task 1): required-and-nullable, same as the other
    // three totals above — this suite never exercises the machine-
    // confirmed fields itself (that's `FromTheLog.test.tsx`'s own
    // describe block, since the block reads straight off `StoredLog`,
    // never through `buildStoredSummary`), so every fixture here defaults
    // to the common null case.
    machineWorkSeconds: null,
    machineWorkMeters: null,
    machineSummary: null,
    // RC-1 (storage-spine design spec §3): same "null is the common case"
    // default as the RC-2/RC-3 trio above — the hero-truth tier/total-line
    // describe blocks below override this explicitly per fixture.
    restSeconds: null,
    restMeters: null,
    // RC-1 work pair (fix round 1, Task 3 review): same default — a
    // fixture that wants TIER B1 (buildHeroes' preferred, sound source)
    // overrides these explicitly; everything else stays TIER B2/FALLBACK.
    workSeconds: null,
    workMeters: null,
    ...overrides,
  };
}

// RC-5 (hero-truth design spec) §1/§2, Task 3: the exit-7 walk's own real
// values (`docs/monitor/sessions/walk-2026-08-24/README.md`'s own table —
// PRIMARY, photographed) — realistic fixtures throughout, per repo
// convention (recurring failure 3) rather than round invented numbers.
// Interval 1: elapsed 67.9s, 250m, split 135.8s (2:15.8), 25 spm, target
// 127.0s (2:07.0) → dev +8.8. Interval 2: elapsed 56.1s, 250m, split
// 112.2s (1:52.2), 28 spm, target 127.0s → dev −14.8. Work-only totals:
// 67.9+56.1 = 124.0s over 250+250 = 500m (matches the PM5's own Totals
// row, 2:04.0 avg pace, `machine_summary.avgPaceSecondsPer500m`). Rest:
// 60s/147m + 60s/95m = 120s/242m. Fused (pre-RC-5 shape): 244s/742m.
const EXIT7_STEPS: StoredLog["steps"] = [
  {
    label: "250m @ 2:07.0",
    targetSplit: 127.0,
    actualSplit: 135.8,
    actualSeconds: 67.9,
    actualMeters: 250,
    actualSource: "pm5",
    meters: 250,
    actualSpm: 25,
  },
  {
    label: "250m @ 2:07.0",
    targetSplit: 127.0,
    actualSplit: 112.2,
    actualSeconds: 56.1,
    actualMeters: 250,
    actualSource: "pm5",
    meters: 250,
    actualSpm: 28,
  },
];

describe("buildStoredSummary — RC-5 (hero-truth) §1/§2: heroes and the TOTAL line", () => {
  it("TIER A: a row carrying the machine's own work totals renders them verbatim, including the machine's own avg split, plus the TOTAL line from the RC-1 rest pair — DISCRIMINATING from tier B (design spec §1's own antagonist-established fact: the machine can disagree with the sum of its own rows, walk-2026-08-20's 901-vs-899), so the machine's totals here are deliberately NOT equal to Σ EXIT7_STEPS (500m/124.0s) — a test that used equal values couldn't tell tier A from tier B", () => {
    const view = buildStoredSummary(
      baseRow({
        deviceName: "PM5 432331249",
        source: "pm5",
        steps: EXIT7_STEPS,
        machineWorkSeconds: 123.8,
        machineWorkMeters: 499,
        machineSummary: { avgPaceSecondsPer500m: 124.1 },
        restSeconds: 120,
        restMeters: 242,
        // The OLD fused columns, still whatever a pre-this-task save
        // posted — tier A never reads these three at all.
        avgSplitSeconds: 999,
        timeSeconds: 9999,
        distanceMeters: 9999,
      }),
    );
    expect(view.heroes.distanceMeters).toBe(499);
    expect(view.heroes.time).toBe("2:04");
    expect(view.heroes.timeSeconds).toBe(123.8);
    expect(view.heroes.avgSplit).toBe("2:04.1");
    expect(view.heroes.avgSplitSeconds).toBe(124.1);
    expect(view.heroes.totalLine).toBe(
      "4:04 total · plus 242 m coasting in rest",
    );
  });

  it("a build-738-era tier-A row (machine totals present, avgPaceSecondsPer500m absent) renders NO avg-split hero — never a fallback quotient", () => {
    const view = buildStoredSummary(
      baseRow({
        deviceName: "PM5 432331249",
        source: "pm5",
        steps: EXIT7_STEPS,
        machineWorkSeconds: 124.0,
        machineWorkMeters: 500,
        // No avgPaceSecondsPer500m key at all — the exact build-738-era
        // shape (that field predates Task 1 of this phase).
        machineSummary: { verificationBytes: [1, 2, 3] },
      }),
    );
    expect(view.heroes.distanceMeters).toBe(500);
    expect(view.heroes.time).toBe("2:04");
    expect(view.heroes.avgSplit).toBeUndefined();
    expect(view.heroes.avgSplitSeconds).toBeUndefined();
  });

  // Fix round 2 (final whole-branch review, CRITICAL finding C1): the
  // CONCRETE reproduction. `appendSummaryObservations` (monitorRun.ts)
  // admits `endedBy === "rower"` (a Menu/End terminate) into tier A, but
  // `computeWorkRestSums` (the RC-1 rest-pair writer) runs ONLY for
  // `"finished"` — so a terminated row is tier A with a NULL rest pair.
  // Its abandoned final interval's own actual can arrive with no matching
  // step (no 0x0037 boundary ever sent for it), so Σ steps under-counts
  // the machine's own totals by exactly that interval's real, ROWED
  // metres — a 2×250m piece terminated mid-second-rep: only the FIRST
  // piece has a matched step (250m/67.9s); the machine's own totals
  // (300m/97.9s) include ~50m/30.0s of the abandoned second piece too.
  it("TIER A: a TERMINATED row (endedBy rower, NULL RC-1 rest pair) NEVER derives a fallback-2 rest clause from the gap between the machine's totals and Σ steps — that gap is the abandoned interval's own rowed work, not rest", () => {
    const view = buildStoredSummary(
      baseRow({
        deviceName: "PM5 432331249",
        source: "pm5",
        steps: [
          {
            label: "250m @ 2:07.0",
            targetSplit: 127.0,
            actualSplit: 135.8,
            actualSeconds: 67.9,
            actualMeters: 250,
            actualSource: "pm5",
            meters: 250,
            actualSpm: 25,
          },
          // The second, abandoned piece never sent its own 0x0037 —
          // buildMonitorLogSteps produced no step for it at all.
        ],
        machineWorkSeconds: 97.9,
        machineWorkMeters: 300,
        machineSummary: { avgPaceSecondsPer500m: 163.2 },
        restSeconds: null,
        restMeters: null,
        // Whatever LogSession posted for this tier-A save — the SAME
        // machine totals, per Task 2's `model.heroes.*`.
        avgSplitSeconds: 163.2,
        timeSeconds: 97.9,
        distanceMeters: 300,
      }),
    );
    expect(view.heroes.distanceMeters).toBe(300);
    expect(view.heroes.timeSeconds).toBe(97.9);
    // No rest clause: the 50m/30.0s gap between the machine's total
    // (300m/97.9s) and the ONE matched step (250m/67.9s) is the abandoned
    // second piece's own rowed work — never relabelled as rest.
    expect(view.heroes.totalLine).toBe("1:38 total");
  });

  it("TIER B2 (SAFE — endedBy finished): no machine totals but steps carry actualMeters/actualSeconds — heroes compute from Σ steps, AVG SPLIT is one quotient over the summed pair, TOTAL line from the RC-1 rest pair", () => {
    const view = buildStoredSummary(
      baseRow({
        deviceName: "PM5 432331249",
        source: "pm5",
        // endedBy "finished" here is what PROVES (fix round 2) this row
        // predates RC-1 — a post-RC-1 "finished" row with these same
        // steps would have the work pair instead and land in TIER B1.
        endedBy: "finished",
        steps: EXIT7_STEPS,
        machineWorkSeconds: null,
        machineWorkMeters: null,
        // A raced-burst save posts work-only heroes already (Task 2's
        // own `model.heroes.*`) — set here to the SAME values Σ steps
        // produces, matching a genuine post-task-2 save.
        avgSplitSeconds: 124.0,
        timeSeconds: 124.0,
        distanceMeters: 500,
        restSeconds: 120,
        restMeters: 242,
      }),
    );
    expect(view.heroes.distanceMeters).toBe(500);
    expect(view.heroes.timeSeconds).toBeCloseTo(124.0, 5);
    expect(view.heroes.avgSplitSeconds).toBeCloseTo(124.0, 5);
    expect(view.heroes.avgSplit).toBe("2:04.0");
    expect(view.heroes.totalLine).toBe(
      "4:04 total · plus 242 m coasting in rest",
    );
  });

  it("TIER B2 (SAFE — endedBy finished), fallback-2 (pre-PR rest derivation): no RC-1 pair stored, but the row's OLD fused distanceMeters/timeSeconds exceed Σ steps — the difference IS the rest, recovered onto the TOTAL line while the heroes shrink to work-only", () => {
    const view = buildStoredSummary(
      baseRow({
        deviceName: "PM5 432331249",
        source: "pm5",
        endedBy: "finished",
        steps: EXIT7_STEPS,
        machineWorkSeconds: null,
        machineWorkMeters: null,
        restSeconds: null,
        restMeters: null,
        // The OLD fused (pre-task-3) values — 742m/244s, exceeding Σ
        // steps (500m/124.0s) by exactly the walk's own rest pair.
        avgSplitSeconds: 138.8,
        timeSeconds: 244,
        distanceMeters: 742,
      }),
    );
    expect(view.heroes.distanceMeters).toBe(500);
    expect(view.heroes.timeSeconds).toBeCloseTo(124.0, 5);
    expect(view.heroes.avgSplit).toBe("2:04.0");
    expect(view.heroes.totalLine).toBe(
      "4:04 total · plus 242 m coasting in rest",
    );
  });

  it("FALLBACK: a row predating actualMeters (every step's actualMeters/actualSeconds absent) renders its stored heroes UNCHANGED — never a dash for distance — and the TOTAL line WITHOUT a rest clause", () => {
    const legacySteps: StoredLog["steps"] = [
      {
        label: "6:00 @ 6k",
        actualSplit: 130,
        actualSource: "pm5",
        // No actualMeters/actualSeconds at all — the exact pre-2026-08-08
        // shape.
        spm: 24,
      },
    ];
    const view = buildStoredSummary(
      baseRow({
        deviceName: "PM5 432331249",
        source: "pm5",
        steps: legacySteps,
        avgSplitSeconds: 130,
        timeSeconds: 1550,
        distanceMeters: 6000,
        restSeconds: null,
        restMeters: null,
      }),
    );
    // The stored value still shows, unchanged — never a fabricated
    // absence for a real, already-persisted number.
    expect(view.heroes.distanceMeters).toBe(6000);
    expect(view.heroes.timeSeconds).toBe(1550);
    expect(view.heroes.avgSplitSeconds).toBe(130);
    expect(view.heroes.avgSplit).toBe("2:10.0");
    expect(view.heroes.totalLine).toBe("25:50 total");
  });

  it("a timer-door stored row (no deviceName, steps carry no actualMeters) renders NO total line at all — matching the live door, which never sets one for timer/manual", () => {
    const view = buildStoredSummary(
      baseRow({
        deviceName: null,
        source: "timer",
        steps: [
          {
            label: "6:00 @ 6k",
            actualSplit: 130,
            actualSource: "stopwatch",
            meters: 1500,
          },
        ],
        avgSplitSeconds: 130,
        timeSeconds: 780,
        distanceMeters: 6000,
      }),
    );
    expect(view.heroes.timeSeconds).toBe(780);
    expect(view.heroes.totalLine).toBeUndefined();
  });

  // Door PR A (2026-09-02) §2.2: `buildStoredTotalLine`'s gate is rewritten
  // from `row.deviceName === null` to `row.source !== "pm5"`. A `pm5` row
  // with a null `deviceName` cannot exist on the wire (the biconditional
  // forbids it), so the two predicates cannot be told apart by any
  // reachable `pm5` fixture — this fixture is the mirror case instead: a
  // `timer` row carrying a NON-null `deviceName`. That shape is
  // UNREACHABLE in production (`logSourceContradiction` 400s it on save)
  // but legal in the `StoredLog` type, and it is the exact input the two
  // predicates disagree on: the retired `deviceName === null` check would
  // have let this row through to a total line (deviceName is non-null);
  // the new `source !== "pm5"` check excludes it (source is "timer").
  // Exists only to prove which field the gate actually reads.
  it("a `timer` row with a (production-impossible) non-null deviceName still renders NO total line — the discriminator between the retired deviceName check and the new source check", () => {
    const view = buildStoredSummary(
      baseRow({
        deviceName: "PM5 432331249",
        source: "timer",
        steps: [
          {
            label: "6:00 @ 6k",
            actualSplit: 130,
            actualSource: "stopwatch",
            meters: 1500,
          },
        ],
        avgSplitSeconds: 130,
        timeSeconds: 780,
        distanceMeters: 6000,
      }),
    );
    expect(view.heroes.timeSeconds).toBe(780);
    expect(view.heroes.totalLine).toBeUndefined();
  });

  it("TIER B2: a pm5-sourced step carrying only ONE of actualSeconds/actualMeters, and a stopwatch-sourced step carrying BOTH — neither shape `buildMonitorLogSteps` writes today, but `routes/data.ts`'s own validator accepts each field independently, so a stored row CAN carry them. Both are excluded from the AVG SPLIT quotient (it needs the pm5 pair together); DISTANCE/TIME still sum whichever half each one has, unconditionally", () => {
    const steps: StoredLog["steps"] = [
      ...EXIT7_STEPS,
      // pm5, elapsed only — no distance reading for this interval.
      { label: "unpaired reading", actualSource: "pm5", actualSeconds: 30 },
      // stopwatch-sourced but carrying the pm5-only fields (a malformed
      // or hand-crafted payload the validator doesn't reject).
      {
        label: "stopwatch with actualMeters",
        actualSource: "stopwatch",
        actualSeconds: 10,
        actualMeters: 40,
        meters: 40,
      },
    ];
    const view = buildStoredSummary(
      baseRow({
        deviceName: "PM5 432331249",
        source: "pm5",
        endedBy: "finished",
        steps,
        machineWorkSeconds: null,
        machineWorkMeters: null,
      }),
    );
    // DISTANCE gains the stopwatch step's 40m (unconditional Σ); TIME
    // gains both extra steps' seconds (30 + 10); AVG SPLIT is untouched —
    // still exactly the exit-7 pair's own 124.0.
    expect(view.heroes.distanceMeters).toBe(540);
    expect(view.heroes.timeSeconds).toBeCloseTo(164.0, 5);
    expect(view.heroes.avgSplitSeconds).toBeCloseTo(124.0, 5);
    expect(view.heroes.avgSplit).toBe("2:04.0");
  });

  it("TIER B2: a sub-threshold pm5 step (actualSeconds below MIN_MEASURABLE_ELAPSED_SECONDS) stays IN the DISTANCE/TIME sums but OUT of the AVG SPLIT quotient — mirrors summaryModel.ts's own monitorAvgSplit rule for a stored row", () => {
    const steps: StoredLog["steps"] = [
      ...EXIT7_STEPS,
      {
        label: "mis-tap",
        actualSource: "pm5",
        actualSeconds: 0.2,
        actualMeters: 3,
      },
    ];
    const view = buildStoredSummary(
      baseRow({
        deviceName: "PM5 432331249",
        source: "pm5",
        endedBy: "finished",
        steps,
        machineWorkSeconds: null,
        machineWorkMeters: null,
      }),
    );
    expect(view.heroes.distanceMeters).toBe(503);
    expect(view.heroes.timeSeconds).toBeCloseTo(124.2, 5);
    // AVG SPLIT unchanged — the mis-tap never touches the quotient.
    expect(view.heroes.avgSplitSeconds).toBeCloseTo(124.0, 5);
  });

  it("TIER B2: a pm5-sourced step carrying actualMeters but no actualSeconds at all (independently optional per the server's own validator) leaves TIME and AVG SPLIT absent while DISTANCE still renders", () => {
    const view = buildStoredSummary(
      baseRow({
        deviceName: "PM5 432331249",
        source: "pm5",
        endedBy: "finished",
        steps: [
          { label: "distance only", actualSource: "pm5", actualMeters: 500 },
        ],
        machineWorkSeconds: null,
        machineWorkMeters: null,
      }),
    );
    expect(view.heroes.distanceMeters).toBe(500);
    expect(view.heroes.time).toBeUndefined();
    expect(view.heroes.timeSeconds).toBeUndefined();
    expect(view.heroes.avgSplit).toBeUndefined();
    expect(view.heroes.avgSplitSeconds).toBeUndefined();
    // No workSeconds at all — buildStoredTotalLine's own early-return.
    expect(view.heroes.totalLine).toBeUndefined();
  });

  it("no total line when neither the RC-1 pair nor the fallback-2 derivation resolves (tier B, no rest stored, Σ steps equal to the fused columns)", () => {
    const view = buildStoredSummary(
      baseRow({
        deviceName: "PM5 432331249",
        source: "pm5",
        endedBy: "finished",
        steps: EXIT7_STEPS,
        machineWorkSeconds: null,
        machineWorkMeters: null,
        restSeconds: null,
        restMeters: null,
        // Already work-only, so distanceMeters/timeSeconds are NOT
        // greater than Σ steps — fallback-2's own gate correctly declines
        // to fire (nothing to derive).
        avgSplitSeconds: 124.0,
        timeSeconds: 124.0,
        distanceMeters: 500,
      }),
    );
    expect(view.heroes.timeSeconds).toBeCloseTo(124.0, 5);
    expect(view.heroes.totalLine).toBe("2:04 total");
  });

  // Fix round 1 (Task 3 review, IMPORTANT finding): a null-index actual
  // never becomes a stored step (`logDraft.ts:853-856`'s own
  // `actualByIndex` map only holds `index !== null` actuals), so Σ steps
  // alone would under-count DISTANCE/TIME relative to what genuinely
  // happened — the exact defect this TIER B1 branch exists to close. This
  // fixture simulates it directly: `EXIT7_STEPS` sums to 500m/124.0s, but
  // `workSeconds`/`workMeters` (RC-1's own pair, summed off `run.actuals`
  // directly and therefore immune to the gap) carry 150.0s/560m — the
  // exit-7 pair PLUS a third, 26.0s/60m interval whose actual arrived with
  // a null index and so produced no step at all.
  it("TIER B1: RC-1's own workSeconds/workMeters pair is preferred over Σ steps — a null-index actual's own work (never a step) is correctly counted here, where Σ steps alone would silently drop it", () => {
    const view = buildStoredSummary(
      baseRow({
        deviceName: "PM5 432331249",
        source: "pm5",
        steps: EXIT7_STEPS,
        machineWorkSeconds: null,
        machineWorkMeters: null,
        workSeconds: 150.0,
        workMeters: 560,
        restSeconds: 40,
        restMeters: 90,
      }),
    );
    // DISTANCE/TIME come from the work pair — NOT Σ EXIT7_STEPS
    // (500m/124.0s), which is what a step-only computation would wrongly
    // show.
    expect(view.heroes.distanceMeters).toBe(560);
    expect(view.heroes.timeSeconds).toBe(150.0);
    expect(view.heroes.time).toBe("2:30");
    // AVG SPLIT is UNAFFECTED by the gap — it only ever averages the
    // steps that DO exist (the null-index actual was correctly excluded
    // from AVG SPLIT to begin with, per §1's own rule), so it stays the
    // exit-7 pair's own 124.0, not a quotient over the work pair.
    expect(view.heroes.avgSplitSeconds).toBeCloseTo(124.0, 5);
    expect(view.heroes.avgSplit).toBe("2:04.0");
    expect(view.heroes.totalLine).toBe(
      "3:10 total · plus 90 m coasting in rest",
    );
  });

  // THE FREE-ROW AVG SPLIT (Phase JR PR 1 Task 2; spec rev 4's F1; James's
  // sign-off 2026-09-01: the stored column is the authority).
  //
  // A Just Row stores `steps: []` — it prescribes nothing, so there is
  // nothing to fabricate — plus a real work pair and a derived
  // `avg_split_seconds`. Before this fallback, TIER B1 derived the hero
  // from `steps` alone, which on `[]` gives `undefined` (`d` never leaves
  // 0), while the history list falls through to the stored column
  // (`LogRow.tsx:154`) and shows a figure. Same row, two screens, one
  // number present and one absent — the defect RC-5 exists to kill, one
  // screen over. Criterion 7 pins them together.
  it("TIER B1: falls back to the STORED avg_split_seconds when steps carries no PM5 rows — a free row's hero must not vanish on the detail screen while the history list shows it", () => {
    const view = buildStoredSummary(
      baseRow({
        deviceName: "PM5 432331249",
        source: "pm5",
        steps: [],
        workSeconds: 393.58,
        workMeters: 1396.6,
        avgSplitSeconds: 140.9,
      }),
    );

    expect(view.heroes.distanceMeters).toBe(1397);
    expect(view.heroes.timeSeconds).toBeCloseTo(393.58, 5);
    // The stored column, not a re-derivation: 500 x 393.58 / 1396.6 is
    // 140.89..., and the assertion is against what was STORED so a change
    // to either side shows up rather than cancelling out.
    expect(view.heroes.avgSplitSeconds).toBeCloseTo(140.9, 5);
    expect(view.heroes.avgSplit).toBe("2:20.9");
  });

  // The fallback must not OUTRANK a real step-derived average: where steps
  // carry PM5 actuals, they remain the source, because they are the
  // population the row actually measured.
  it("TIER B1: steps still win over the stored column when they carry PM5 actuals", () => {
    const view = buildStoredSummary(
      baseRow({
        deviceName: "PM5 432331249",
        source: "pm5",
        steps: EXIT7_STEPS,
        workSeconds: 150.0,
        workMeters: 560,
        avgSplitSeconds: 999,
      }),
    );

    expect(view.heroes.avgSplitSeconds).toBeCloseTo(124.0, 5);
  });

  it("TIER B1: the RC-1 work pair NEVER derives a fallback-2 rest clause from its own gap against Σ steps or the stored fused columns — that gap is work (a dropped step), not rest, and attributing it as rest would double-count on top of a hero that is already complete", () => {
    const view = buildStoredSummary(
      baseRow({
        deviceName: "PM5 432331249",
        source: "pm5",
        steps: EXIT7_STEPS,
        machineWorkSeconds: null,
        machineWorkMeters: null,
        workSeconds: 150.0,
        workMeters: 560,
        // No RC-1 rest pair — the ONLY rest source TIER B1 ever consults.
        restSeconds: null,
        restMeters: null,
        // OLD fused stored columns, larger again than BOTH the work pair
        // and Σ steps — if fallback-2 fired here (it must not), it would
        // derive a bogus "rest" from 900−560 and double-count on top of
        // the 150.0s hero.
        avgSplitSeconds: 999,
        timeSeconds: 400,
        distanceMeters: 900,
      }),
    );
    expect(view.heroes.distanceMeters).toBe(560);
    expect(view.heroes.timeSeconds).toBe(150.0);
    // No rest clause: the total is exactly the work pair's own seconds,
    // formatted alone.
    expect(view.heroes.totalLine).toBe("2:30 total");
  });

  it("TIER B1: the work pair renders DISTANCE/TIME even when no step yields an AVG SPLIT quotient at all (e.g. no steps stored) — never a fallback quotient over the work pair itself", () => {
    const view = buildStoredSummary(
      baseRow({
        deviceName: "PM5 432331249",
        source: "pm5",
        steps: [],
        machineWorkSeconds: null,
        machineWorkMeters: null,
        workSeconds: 150.0,
        workMeters: 560,
      }),
    );
    expect(view.heroes.distanceMeters).toBe(560);
    expect(view.heroes.timeSeconds).toBe(150.0);
    expect(view.heroes.avgSplit).toBeUndefined();
    expect(view.heroes.avgSplitSeconds).toBeUndefined();
  });

  // Fix round 1 (Task 3 review, IMPORTANT finding, decision 2), RE-DECIDED
  // at fix round 2 on the TRUE population (final whole-branch review,
  // finding I1): the ACCEPTED residual — pinned so it is visible, not
  // silently "fixed" later by someone who doesn't know it's a known,
  // bounded trade-off. No stored signal distinguishes "this row's Σ steps
  // under-counts because a null-index actual dropped out" from "this
  // row's Σ steps is exactly right and its stored columns are simply the
  // old fused numbers" (`buildStoredRest`'s fallback-2 rung, itself held
  // sound at fix round 1) — both look identical (`stored > Σ steps`), and
  // they want OPPOSITE treatment. Fix round 1's decision ("trust Σ steps
  // anyway") rested on believing this population was a closed, ~16-day
  // window that couldn't grow — FALSE (I1): `computeWorkRestSums`/
  // `appendSummaryObservations` only ever write for `"finished"`/
  // `"rower"` closes, so a link-lost/program-failed/interrupted/
  // burst-less-terminate row can NEVER carry either pair, forever. Fix
  // round 2's `isReconstructableClose(row.endedBy)` gate now confines
  // this ACCEPTED residual to the population where `endedBy` PROVES the
  // row is historical (`"finished"`, `null`, or `undefined`) — this test
  // proves the CURRENT, UNFIXED under-count for exactly THAT narrow,
  // genuinely-bounded case: the same null-index gap as the TIER B1 tests
  // above (a 26.0s/60m interval that produced no step), but with NO
  // `workSeconds`/`workMeters` pair to rescue it — DISTANCE/TIME
  // under-report at 500m/124.0s, not the true 560m/150.0s.
  it("TIER B2 (SAFE — endedBy finished): ACCEPTED residual risk, pinned — with no RC-1 work pair available, a null-index actual's own work is silently absent from Σ steps, and DISTANCE/TIME under-count", () => {
    const view = buildStoredSummary(
      baseRow({
        deviceName: "PM5 432331249",
        source: "pm5",
        endedBy: "finished",
        steps: EXIT7_STEPS,
        machineWorkSeconds: null,
        machineWorkMeters: null,
        workSeconds: null,
        workMeters: null,
      }),
    );
    // The KNOWN, ACCEPTED gap: this under-counts the true 560m/150.0s by
    // exactly the dropped interval's own 60m/26.0s.
    expect(view.heroes.distanceMeters).toBe(500);
    expect(view.heroes.timeSeconds).toBeCloseTo(124.0, 5);
  });

  // Fix round 2 (final whole-branch review, IMPORTANT finding I1): the
  // OTHER half of the re-decision — the CONCRETE proof that a row whose
  // `endedBy` names an incomplete-by-construction close now DECLINES to
  // FALLBACK rather than trusting Σ steps, for EVERY such close reason,
  // regardless of when it was saved. Fixture is byte-identical to the
  // TIER B2 (SAFE) "fallback-2" test above — same OLD fused 742m/244s,
  // same EXIT7_STEPS summing to 500m/124.0s — so the ONLY variable is
  // `endedBy`: the SAFE test shrinks to 500m/124.0s and derives a rest
  // clause; every one of THESE renders the fused 742m/244s UNCHANGED and
  // no rest clause at all (never a double-count on top of a hero that
  // may already include rest).
  it.each([
    ["rower", "rower"],
    ["link-lost", "link-lost"],
    ["program-failed", "program-failed"],
    ["program-dropped", "program-dropped"],
    ["interrupted", "interrupted"],
  ] as const)(
    "TIER B2 DECLINES to FALLBACK when endedBy is %s — never trusts Σ steps for a row that could be an ongoing, un-bounded population",
    (_label, endedBy) => {
      const view = buildStoredSummary(
        baseRow({
          deviceName: "PM5 432331249",
          source: "pm5",
          endedBy,
          steps: EXIT7_STEPS,
          machineWorkSeconds: null,
          machineWorkMeters: null,
          restSeconds: null,
          restMeters: null,
          // The SAME OLD fused values the SAFE-endedBy test above shrinks
          // — this population must NOT shrink them.
          avgSplitSeconds: 138.8,
          timeSeconds: 244,
          distanceMeters: 742,
        }),
      );
      expect(view.heroes.distanceMeters).toBe(742);
      expect(view.heroes.timeSeconds).toBe(244);
      expect(view.heroes.avgSplitSeconds).toBe(138.8);
      // No rest clause: FALLBACK never derives one from a gap it cannot
      // attribute (work vs. rest) with confidence.
      expect(view.heroes.totalLine).toBe("4:04 total");
    },
  );

  // The SAME decline, but proving it holds even when the row's Σ steps
  // happen to UNDER-count relative to a genuinely CORRECT (post-task-3,
  // already work-only) stored value — the shape a real interrupted/
  // link-lost save produces going forward. Without the endedBy gate, this
  // would misattribute the null-index gap as rest (the C1-shaped bug).
  it("TIER B2 DECLINES for a link-lost row even when the stored columns are ALREADY correct (post-task-3 work-only) and Σ steps merely under-counts a null-index actual — renders the stored value, never a bogus rest clause", () => {
    const view = buildStoredSummary(
      baseRow({
        deviceName: "PM5 432331249",
        source: "pm5",
        endedBy: "link-lost",
        steps: EXIT7_STEPS,
        machineWorkSeconds: null,
        machineWorkMeters: null,
        workSeconds: null,
        workMeters: null,
        restSeconds: null,
        restMeters: null,
        // The row's OWN stored heroes already correctly include the
        // null-index actual's 60m/26.0s — Σ EXIT7_STEPS alone (500m/
        // 124.0s) would under-count it.
        avgSplitSeconds: 124.0,
        timeSeconds: 150.0,
        distanceMeters: 560,
      }),
    );
    expect(view.heroes.distanceMeters).toBe(560);
    expect(view.heroes.timeSeconds).toBe(150.0);
    expect(view.heroes.totalLine).toBe("2:30 total");
  });

  // Fix round 3 (re-review, Minor): `isReconstructableClose` is an
  // ALLOWLIST (`endedBy === "finished" || endedBy == null`), not a
  // denylist — this is the test that actually proves the difference. A
  // denylist shape would have let an UNRECOGNISED `endedBy` (a future
  // sixth `CloseReason` — `monitorRun.ts:1099` already anticipates one,
  // W8's inactivity auto-terminate) silently re-enter the trusted branch;
  // this allowlist declines anything that isn't one of the two provably-
  // historical shapes. Cast is deliberate: today's `StoredLog["endedBy"]`
  // union has no such value, but a real API response is JSON off the
  // wire and cannot be trusted to honor the client's own type the moment
  // the server adds a value this build doesn't know about yet.
  it("TIER B2 DECLINES for an UNRECOGNISED endedBy value (a future CloseReason this build doesn't know about) — the allowlist fails closed, not open", () => {
    const view = buildStoredSummary(
      baseRow({
        deviceName: "PM5 432331249",
        source: "pm5",
        endedBy: "auto-terminated" as unknown as StoredLog["endedBy"],
        steps: EXIT7_STEPS,
        machineWorkSeconds: null,
        machineWorkMeters: null,
        restSeconds: null,
        restMeters: null,
        avgSplitSeconds: 138.8,
        timeSeconds: 244,
        distanceMeters: 742,
      }),
    );
    // Declined: the OLD fused columns render unchanged, not the Σ-steps
    // shrink a trusting (denylist) implementation would have produced.
    expect(view.heroes.distanceMeters).toBe(742);
    expect(view.heroes.timeSeconds).toBe(244);
    expect(view.heroes.totalLine).toBe("4:04 total");
  });
});

describe("buildStoredSummary — §5A source derivation", () => {
  it("uses the stored deviceName when present, regardless of step shape", () => {
    const view = buildStoredSummary(
      baseRow({
        deviceName: "PM5 432331249",
        source: "pm5",
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

  it("reads TIMER from the column — a stopwatch-step row saved through the timer door", () => {
    const view = buildStoredSummary(
      baseRow({
        deviceName: null,
        source: "timer",
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

  it("reads LOGGED BY HAND from the column (James's copy ruling, fix round: matches the live door's own manual-door string)", () => {
    const view = buildStoredSummary(
      baseRow({
        deviceName: null,
        source: "manual",
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

  // Just Row unconnected spec (2026-09-02), exit criterion 3d: the client
  // never infers the door from `steps` any more. These two fixtures are
  // exactly the rows the DELETED inference got wrong — a time-only Just
  // Row (`timer` with `steps: []`, which the guess called by-hand) and a
  // by-hand row that happens to carry a stopwatch step (which the guess
  // called TIMER). The column decides; the steps are not consulted.
  it("a `timer` row with EMPTY steps (the time-only Just Row) reads TIMER — the column, not a step fingerprint", () => {
    const view = buildStoredSummary(
      baseRow({ deviceName: null, source: "timer", steps: [] }),
    );
    expect(view.meta.sourceLabel).toBe("TIMER");
  });

  it("a `manual` row carrying a stopwatch step still reads LOGGED BY HAND — the steps are never consulted", () => {
    const view = buildStoredSummary(
      baseRow({
        deviceName: null,
        source: "manual",
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
    expect(view.meta.sourceLabel).toBe("LOGGED BY HAND");
  });

  it("shows a time-of-day segment for a pm5 or timer source but omits it for LOGGED BY HAND (mirrors spec 1's manual-door omission byte-for-byte)", () => {
    const withDevice = buildStoredSummary(
      baseRow({ source: "pm5", deviceName: "PM5 1" }),
    );
    expect(withDevice.meta.timeLabel).toBeDefined();
    const timer = buildStoredSummary(baseRow({ source: "timer", steps: [] }));
    expect(timer.meta.timeLabel).toBeDefined();
    const byHand = buildStoredSummary(baseRow());
    expect(byHand.meta.timeLabel).toBeUndefined();
  });

  // Door PR A (2026-09-02) §2.1/§2.3: the fourth `LogSource` member. Built
  // from the file's fullest existing fixture (`baseRow`, not a hand-rolled
  // minimum — RF3) with only `source`/`deviceName` overridden, the same
  // idiom every fixture in this describe block already uses.
  it("a no-reading row reads NO MONITOR READING and DOES carry a wall-clock time", () => {
    const view = buildStoredSummary(
      baseRow({ source: "no-reading", deviceName: null }),
    );
    expect(view.meta.sourceLabel).toBe("NO MONITOR READING");
    expect(view.meta.timeLabel).toBeDefined();
  });

  // §2.3: the allowlist, over the column — the three members whose moment
  // the APP WITNESSED (the connected door, the phone clock, and a
  // connected arrival that measured nothing) all carry a timeLabel.
  it.each([["pm5"], ["timer"], ["no-reading"]] as const)(
    "%s carries a timeLabel (the app witnessed the moment)",
    (source) => {
      const row = baseRow({
        source,
        deviceName: source === "pm5" ? "PM5 432331249" : null,
      });
      expect(buildStoredSummary(row).meta.timeLabel).toBeDefined();
    },
  );

  it("manual carries NO timeLabel (an off-app session has no moment the app knows)", () => {
    const row = baseRow({ source: "manual", deviceName: null });
    expect(buildStoredSummary(row).meta.timeLabel).toBeUndefined();
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

// Cohort-unlock spec (2026-08-23), §2: `closeLine` is present, with
// the exact copy, for `endedBy === "link-lost"` alone — every other
// value (including the other five real ones, and absent/null) renders
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
        source: "pm5",
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
    expect(view.closeLine).toBe("LINK LOST · the app lost the monitor");
  });

  it.each([
    ["finished", "finished"],
    ["rower", "rower"],
    ["program-failed", "program-failed"],
    ["program-dropped", "program-dropped"],
    ["interrupted", "interrupted"],
    ["null", null],
    ["absent", undefined],
  ] as const)("omits the line for endedBy=%s", (_label, endedBy) => {
    const view = buildStoredSummary(baseRow({ endedBy }));
    expect(view.closeLine).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Door spec (2026-09-02) §1 — PARTIAL: what a stopped connected piece says.
//
// Fixtures: "Slack Tide", the library's own 5×3' at 6k+12 with 1' rest
// (`server/seed/library/o2.ts`, `{ k: "reps", count: 5 }`) — a REAL
// five-interval workout, so `M` is 5 the way the approved Gate 0-A artboard
// renders it rather than a hand-chosen number (recurring failure 3).
const SLACK_TIDE = LIBRARY_WORKOUTS.find((w) => w.title === "Slack Tide")!;
// `refPaceLabel` (`session/logDraft.ts:269-271`) composes
// `${durationText} @ ${refLabel(ref)}`, and `refLabel` (`domain/pace.ts:106-111`)
// renders a non-zero offset as `${base} +${off}` — so every one of Slack
// Tide's five reps is labelled identically, as a reps block always is.
const SLACK_TIDE_LABEL = "3:00 @ 6k +12";
// 6k 2:07.0 (127.0 s) + 12 = 139.0 s, the effective target
// `buildLogSeed` resolves for `ref: { base: "6k", off: 12 }`.
const SLACK_TIDE_TARGET_SPLIT = 139.0;

// The two shapes `buildMonitorLogSteps` ACTUALLY writes
// (`session/logDraft.ts:883-922`), not an invented minimum: a MATCHED
// interval gets `actualSource: "pm5"` plus the four actuals; an UNMATCHED
// one — never reached, or a boundary pair that never both arrived — keeps
// the authored target and `spm` and carries NO `actualSource` at all
// ("Unambiguous against the row-local discriminant", `:913-917`).
function measuredStep(
  actualSeconds: number,
  actualMeters: number,
  actualSplit: number,
): StoredLogStep {
  return {
    label: SLACK_TIDE_LABEL,
    targetSplit: SLACK_TIDE_TARGET_SPLIT,
    seconds: 180,
    actualSource: "pm5",
    actualSplit,
    actualSeconds,
    actualMeters,
    actualSpm: 22,
    spm: 22,
  };
}

function unreachedStep(): StoredLogStep {
  return {
    label: SLACK_TIDE_LABEL,
    targetSplit: SLACK_TIDE_TARGET_SPLIT,
    seconds: 180,
    spm: 22,
  };
}

// A connected Just Row: `steps: []` (`JustRowLog.tsx:209`), no plan to be
// partial against.
const NO_STEPS: StoredLogStep[] = [];

// All five reps rowed and matched.
const ALL_MEASURED_STEPS: StoredLogStep[] = [
  measuredStep(180.0, 647, 139.1),
  measuredStep(180.0, 651, 138.2),
  measuredStep(180.0, 644, 139.8),
  measuredStep(180.0, 640, 140.6),
  measuredStep(180.0, 638, 141.0),
];

// Stopped after two: reps 3-5 were never reached, so they carry no
// `actualSource`. N = 2, M = 5 — the artboard's own `2 of 5`.
const SOME_UNMEASURED_STEPS: StoredLogStep[] = [
  measuredStep(180.0, 647, 139.1),
  measuredStep(180.0, 651, 138.2),
  unreachedStep(),
  unreachedStep(),
  unreachedStep(),
];

// A LOST BOUNDARY on rep 2: the interval is matched (`actualSource: "pm5"`)
// but its elapsed reading is below `MIN_MEASURABLE_ELAPSED_SECONDS`
// (`summaryModel.ts:577`, 1 s) — "a lost boundary whose pair never both
// arrived" (`logDraft.ts:806-809`) / "an interval that produces ZERO frames
// is lost entirely" (`domain/monitor/types.ts:62-63`). This shape exists so
// the two candidate counts genuinely DISAGREE: `measuredElapsedSeconds`
// says N = 1, a naive `actualSource !== undefined` count says 2.
const LOST_BOUNDARY_STEPS: StoredLogStep[] = [
  measuredStep(180.0, 647, 139.1),
  { ...measuredStep(0.4, 1, 200.0) },
  unreachedStep(),
  unreachedStep(),
  unreachedStep(),
];

const STEPS_SHAPES = {
  "no steps (a connected Just Row)": NO_STEPS,
  "every step measured": ALL_MEASURED_STEPS,
  "two measured, three never reached": SOME_UNMEASURED_STEPS,
  "one measured, one lost boundary, three never reached": LOST_BOUNDARY_STEPS,
} as const;
type StepsShape = keyof typeof STEPS_SHAPES;

// The seven `endedBy` states the spec names: the five-member allowlist
// (`schema.ts`'s endedByEnum minus `finished`), plus `finished`, plus the
// legacy `null` that DOES occur on pm5 rows (`monitorRun.ts:228-233`,
// `routes/data.ts:1738` stores `?? null`).
const ENDED_BY_STATES = [
  "finished",
  "rower",
  "link-lost",
  "program-dropped",
  "program-failed",
  "interrupted",
  null,
] as const;
type EndedByState = (typeof ENDED_BY_STATES)[number];

// The expected outcomes are LITERAL maps, hand-written from spec §1.1 — never
// re-derived from the four clauses, because an expectation that re-implements
// the predicate agrees with a broken predicate for exactly the reason it is
// broken (recurring failure 11's shape, in test form).
const NOTHING: Record<string, PartialCloseReason | undefined> = {
  finished: undefined,
  rower: undefined,
  "link-lost": undefined,
  "program-dropped": undefined,
  "program-failed": undefined,
  interrupted: undefined,
  null: undefined,
};
const EVERY_CLOSE_BUT_FINISHED: Record<string, PartialCloseReason | undefined> =
  {
    finished: undefined,
    rower: "rower",
    "link-lost": "link-lost",
    "program-dropped": "program-dropped",
    "program-failed": "program-failed",
    interrupted: "interrupted",
    null: undefined,
  };

const PARTIAL_TABLE: {
  source: StoredLog["source"];
  shape: StepsShape;
  outcomes: Record<string, PartialCloseReason | undefined>;
}[] = [
  // Clause 1 holds only for `pm5`; clauses 2/3 knock out the first two
  // shapes; clause 4 is the five-member allowlist.
  {
    source: "pm5",
    shape: "no steps (a connected Just Row)",
    outcomes: NOTHING,
  },
  { source: "pm5", shape: "every step measured", outcomes: NOTHING },
  {
    source: "pm5",
    shape: "two measured, three never reached",
    outcomes: EVERY_CLOSE_BUT_FINISHED,
  },
  {
    source: "pm5",
    shape: "one measured, one lost boundary, three never reached",
    outcomes: EVERY_CLOSE_BUT_FINISHED,
  },
  // Clause 1 over the WHOLE enum, not just its nearest neighbour: `pm5` is
  // the only door that stores planned-vs-measured steps, so every one of the
  // other three `LOG_SOURCES` members (`domain/types.ts:101-102`) is
  // excluded whatever its steps or its close say. Pinning all four means a
  // fifth member added later cannot slip through by resembling `timer`.
  ...(["timer", "manual", "no-reading"] as const).flatMap((source) =>
    (
      [
        "no steps (a connected Just Row)",
        "every step measured",
        "two measured, three never reached",
        "one measured, one lost boundary, three never reached",
      ] as const
    ).map((shape) => ({ source, shape, outcomes: NOTHING })),
  ),
];

const PARTIAL_CROSS_PRODUCT: {
  source: StoredLog["source"];
  shape: StepsShape;
  endedBy: EndedByState;
  expected: PartialCloseReason | undefined;
}[] = PARTIAL_TABLE.flatMap((entry) =>
  ENDED_BY_STATES.map((endedBy) => ({
    source: entry.source,
    shape: entry.shape,
    endedBy,
    expected: entry.outcomes[endedBy === null ? "null" : endedBy],
  })),
);

describe("partialCloseReason — door spec §1.1, the four clauses", () => {
  it.each(PARTIAL_CROSS_PRODUCT)(
    "source=$source, steps=$shape, endedBy=$endedBy -> $expected",
    ({ source, shape, endedBy, expected }) => {
      expect(
        partialCloseReason({ source, steps: STEPS_SHAPES[shape], endedBy }),
      ).toBe(expected);
    },
  );

  // The named legs spec §1.1 demands, each asserted on its own so a failure
  // says WHICH rule broke rather than "row 23 of 56".

  // Just Row: a free row has no plan to be partial against. Every connected
  // JR closes `rower` (`useMonitorSession.ts:5010`), so this is the leg that
  // would go red if the rule ever stopped excluding it. WHICH clause
  // excludes it, measured rather than reasoned (see `partialCloseReason`'s
  // own clause-2 comment): clause 2 returns first for `steps: []`, so it IS
  // what excludes this row today — clause 3 would also do it (`[].some(...)`
  // is false), which is why clause 2 is redundant, but redundant is not the
  // same as inert. The probe that bites THIS leg is clause 2 deleted AND
  // clause 3 flipped to `.every` (M3.1c, "expected 'rower' to be
  // undefined"); either mutation on its own leaves this assertion green.
  it("a connected Just Row is never partial, however it closed", () => {
    expect(
      partialCloseReason({ source: "pm5", steps: [], endedBy: "rower" }),
    ).toBeUndefined();
  });

  // Measurement loss, not a stopped piece: a short step on a `finished` row
  // is a lost boundary (`logDraft.ts:806-809`) or a zero-frame interval
  // (`domain/monitor/types.ts:62-63`). Clause 4 excludes it.
  it("a finished row with a short step is measurement loss, not partial", () => {
    expect(
      partialCloseReason({
        source: "pm5",
        steps: LOST_BOUNDARY_STEPS,
        endedBy: "finished",
      }),
    ).toBeUndefined();
  });

  // A legacy row: `endedBy` null occurs on pm5 rows and is NOT partial. This
  // is why clause 4 is an allowlist and never `endedBy !== "finished"`.
  it("a legacy pm5 row with a null close is not partial", () => {
    expect(
      partialCloseReason({
        source: "pm5",
        steps: LOST_BOUNDARY_STEPS,
        endedBy: null,
      }),
    ).toBeUndefined();
  });

  it("an absent close (the field omitted entirely) is not partial", () => {
    expect(
      partialCloseReason({ source: "pm5", steps: LOST_BOUNDARY_STEPS }),
    ).toBeUndefined();
  });

  // All steps measured, ended by the rower (a last boundary landed,
  // WORKOUTEND did not, End pressed): clause 3 excludes it.
  it("a rower-ended row with every step measured reads as complete", () => {
    expect(
      partialCloseReason({
        source: "pm5",
        steps: ALL_MEASURED_STEPS,
        endedBy: "rower",
      }),
    ).toBeUndefined();
  });

  // Clause 1 in isolation: identical steps and close to a row the rule DOES
  // mark partial, differing only in the door.
  it("a timer row cannot be partial in stored data at all", () => {
    expect(
      partialCloseReason({
        source: "timer",
        steps: SOME_UNMEASURED_STEPS,
        endedBy: "rower",
      }),
    ).toBeUndefined();
    expect(
      partialCloseReason({
        source: "pm5",
        steps: SOME_UNMEASURED_STEPS,
        endedBy: "rower",
      }),
    ).toBe("rower");
  });

  // The table above is only a clause-1 pin if it names EVERY door. Asserted
  // against `LOG_SOURCES` itself (`domain/types.ts:121`) rather than against
  // a retyped list, so a fifth member added to the enum makes this leg red
  // instead of silently going unexercised.
  it("the table covers every LogSource, so clause 1 is pinned over the whole enum", () => {
    expect(
      [...new Set(PARTIAL_TABLE.map((e) => e.source))].sort(),
    ).toStrictEqual([...LOG_SOURCES].sort());
  });

  it("the allowlist is exactly the server enum minus finished, in the spec's order", () => {
    expect(PARTIAL_CLOSE_REASONS).toStrictEqual([
      "rower",
      "link-lost",
      "program-dropped",
      "program-failed",
      "interrupted",
    ]);
  });
});

describe("buildStoredSummary — door spec §1.2, the close-reason line", () => {
  function partialRow(
    endedBy: EndedByState,
    steps: StoredLogStep[],
  ): StoredLog {
    return baseRow({
      workoutTitle: SLACK_TIDE.title,
      workoutType: SLACK_TIDE.type,
      source: "pm5",
      deviceName: "PM5 432331249",
      steps,
      endedBy,
    });
  }

  // Every literal below is taken from the APPROVED Gate 0-A artboard
  // (`docs/superpowers/specs/2026-09-02-door-gate-a.html`, decision (a)),
  // not from the spec's own draft table.
  it.each([
    [
      "rower",
      SOME_UNMEASURED_STEPS,
      "STOPPED EARLY · 2 of 5 intervals measured",
    ],
    [
      "link-lost",
      SOME_UNMEASURED_STEPS,
      "LINK LOST · the app lost the monitor · 2 of 5 intervals measured",
    ],
    [
      "program-dropped",
      LOST_BOUNDARY_STEPS,
      "THE MONITOR DROPPED THE PROGRAM · 1 of 5 intervals measured",
    ],
    [
      "program-failed",
      LOST_BOUNDARY_STEPS,
      "THE PROGRAM DID NOT LOAD · 1 of 5 intervals measured",
    ],
    [
      "interrupted",
      LOST_BOUNDARY_STEPS,
      "LEFT UNFINISHED · 1 of 5 intervals measured",
    ],
  ] as const)("endedBy=%s renders its own sentence", (endedBy, steps, line) => {
    expect(buildStoredSummary(partialRow(endedBy, steps)).closeLine).toBe(line);
  });

  // §1.2: `link-lost` keeps its OWN ungated, steps-independent trigger. Both
  // of these rows are EXCLUDED by the PARTIAL predicate and still carry the
  // release-noted sentence, suffix-free (`releaseNotes.ts:366`).
  it("a link-lost Just Row still says LINK LOST, suffix-free", () => {
    expect(
      buildStoredSummary(partialRow("link-lost", NO_STEPS)).closeLine,
    ).toBe("LINK LOST · the app lost the monitor");
  });

  it("a link-lost row with every step measured still says LINK LOST, suffix-free", () => {
    expect(
      buildStoredSummary(partialRow("link-lost", ALL_MEASURED_STEPS)).closeLine,
    ).toBe("LINK LOST · the app lost the monitor");
  });

  // The other four words render ONLY when all four clauses hold — a
  // steps-independent `STOPPED EARLY` would print on every connected Just
  // Row and on every planned row Ended after its last interval.
  it.each([
    ["rower", NO_STEPS],
    ["rower", ALL_MEASURED_STEPS],
    ["program-dropped", NO_STEPS],
    ["program-failed", ALL_MEASURED_STEPS],
    ["interrupted", NO_STEPS],
    ["finished", LOST_BOUNDARY_STEPS],
    [null, LOST_BOUNDARY_STEPS],
  ] as const)(
    "a non-partial endedBy=%s row renders no close line",
    (endedBy, steps) => {
      expect(buildStoredSummary(partialRow(endedBy, steps)).closeLine).toBe(
        undefined,
      );
    },
  );

  // PARTIAL implies `N < M` (clause 3 guarantees an unmeasured step), so the
  // suffix can never read `5 of 5`. Asserted over EVERY row the table marks
  // partial, off the rendered artifact rather than off a second count.
  it("every partial row's suffix reads N of M with N < M = steps.length", () => {
    const partialRows = PARTIAL_CROSS_PRODUCT.filter(
      (r) => r.expected !== undefined,
    );
    expect(partialRows.length).toBe(10);
    for (const { shape, endedBy } of partialRows) {
      const steps = STEPS_SHAPES[shape];
      const line = buildStoredSummary(partialRow(endedBy, steps)).closeLine;
      const match = /· (\d+) of (\d+) intervals measured$/.exec(line ?? "");
      expect(match, `no N of M suffix on: ${String(line)}`).not.toBeNull();
      const measured = Number(match![1]);
      const total = Number(match![2]);
      expect(total).toBe(steps.length);
      expect(measured).toBeLessThan(total);
    }
  });
});

describe("partialChipWord / historyChipWord — door spec §1.3, the list chip", () => {
  // Gate 0-A decision (e), the approved short forms.
  it.each([
    ["rower", "STOPPED EARLY"],
    ["link-lost", "LINK LOST"],
    ["program-dropped", "PROGRAM DROPPED"],
    ["program-failed", "PROGRAM NOT LOADED"],
    ["interrupted", "UNFINISHED"],
  ] as const)("partialChipWord(%s) is %s", (endedBy, chip) => {
    expect(partialChipWord(endedBy)).toBe(chip);
  });

  it.each([["finished"], [null], [undefined]] as const)(
    "partialChipWord(%s) is undefined — outside the allowlist",
    (endedBy) => {
      expect(partialChipWord(endedBy)).toBeUndefined();
    },
  );

  // The list's whole rule, so the two surfaces cannot name one close two
  // ways: `link-lost` is UNGATED (it renders on the detail screen for rows
  // the PARTIAL predicate excludes, so a chip gated on `partial` alone would
  // leave History silent about the one row the detail screen shouts about);
  // the other four render only when the row is partial.
  it("a non-partial link-lost row still carries the LINK LOST chip", () => {
    expect(historyChipWord({ partial: false, endedBy: "link-lost" })).toBe(
      "LINK LOST",
    );
  });

  it.each([
    ["rower"],
    ["program-dropped"],
    ["program-failed"],
    ["interrupted"],
  ] as const)("a non-partial endedBy=%s row carries no chip", (endedBy) => {
    expect(historyChipWord({ partial: false, endedBy })).toBeUndefined();
  });

  it.each([
    ["rower", "STOPPED EARLY"],
    ["link-lost", "LINK LOST"],
    ["program-dropped", "PROGRAM DROPPED"],
    ["program-failed", "PROGRAM NOT LOADED"],
    ["interrupted", "UNFINISHED"],
  ] as const)(
    "a partial endedBy=%s row carries the %s chip",
    (endedBy, chip) => {
      expect(historyChipWord({ partial: true, endedBy })).toBe(chip);
    },
  );

  it.each([["finished"], [null]] as const)(
    "a partial-flagged endedBy=%s row still carries no chip — the chip table is keyed by value",
    (endedBy) => {
      expect(historyChipWord({ partial: true, endedBy })).toBeUndefined();
    },
  );
});

describe("I-B5 census: no summing reader ever sees partialMeters/partialSeconds (door spec §5.2, Task 4)", () => {
  // Realistic pm5 fixture (RF3): EXIT7_STEPS above, the exit-7 walk's own
  // real captured values, both steps carrying `actualSource: "pm5"` and a
  // genuine actualMeters/actualSeconds pair — the population this census
  // exists to protect.
  //
  // PINNED to endedBy: "rower", not "link-lost" (harden lens 2, finding 5).
  // Task 5 step 5b makes `caption` a FUNCTION of `endedBy`: on a
  // `link-lost` row carrying a partial it legitimately becomes `INTERVAL N
  // · LAST READING BEFORE THE LINK WENT` — a `link-lost` fixture here would
  // fail this census for a reason that is NOT a leak (the caption moved BY
  // DESIGN), and "fix" it by widening the assertion, which is exactly how a
  // real leak gets waved through later. `endedBy: "rower"` is one of the
  // four wire-close reasons I-B1 allows a partial for, and keeps `caption`
  // (and every other field below) invariant regardless of Task 5, so any
  // difference this test finds is a genuine leak.
  const row = baseRow({
    workoutTitle: SEA_FRET.title,
    workoutType: SEA_FRET.type,
    deviceName: "PM5 432331249",
    source: "pm5",
    steps: EXIT7_STEPS,
    endedBy: "rower",
  });
  // Adds the pair to ONE step only — proving a single leaked step, not just
  // an all-steps-carry-it shape, moves nothing.
  const withPartial: StoredLog = {
    ...row,
    steps: [
      { ...EXIT7_STEPS[0]!, partialMeters: 63, partialSeconds: 41 },
      EXIT7_STEPS[1]!,
    ],
  };

  it("adding partialMeters/partialSeconds to one step changes nothing about buildStoredSummary's heroes, total line, caption, read-back, or close line", () => {
    const before = buildStoredSummary(row);
    const after = buildStoredSummary(withPartial);
    // `rows` is the one field that legitimately differs after Task 5 (it
    // renders the pair on the affected row's own step list) — excluded
    // here, per the task brief, so this stays a leak detector both before
    // and after that task lands. Every other field on the view —
    // `heroes` (`stepActualSums`/`hasStepActuals`/`tierBAvgSplitSeconds`/
    // `buildStoredRest`/`buildStoredTotalLine` all run unconditionally at
    // the top of `buildHeroes`, over the SAME `row.steps` `withPartial`
    // widens — though for THIS row's own branch, read verbatim at
    // `monitorRun.ts:1098`, `endedBy !== "finished"` means the RC-1 work
    // pair is never written and `isReconstructableClose` gates TIER B2
    // off, so `stepSums`'s numeric VALUE never reaches this particular
    // row's own output — a mutation probe that proves the assertion can
    // still bite is in the task report, via a rescue path realistically
    // shaped like `buildStoredRest`'s own fallback-2 rung above), plus
    // `caption`, `readBack`, `planFooter`, `closeLine` — is compared for
    // real.
    expect({ ...after, rows: undefined }).toStrictEqual({
      ...before,
      rows: undefined,
    });
  });

  it("measuredElapsedSeconds: the affected step's own measured-elapsed reading (rendered as timeLabel) is unchanged by the pair riding alongside it", () => {
    // `measuredElapsedSeconds` isn't exported and has no field of its own
    // on `MeasuredRow` — it feeds `timeLabel` (`buildRows`' own source:
    // `fmtDuration(elapsed / 60)`), reached only through `rows`, the one
    // field the summary-object assertion above excludes. Read it off
    // `rows[0]` directly instead: EXIT7_STEPS[0]'s own real capture is
    // 67.9s, at/above the pm5 measurable floor, so `buildRows` measures it
    // — `fmtDuration(67.9 / 60)` is "1:08" (`domain/duration.ts`'s own
    // `splitParts`: `Math.round(67.9) = 68` -> `1:08`).
    const beforeRow = asMeasured(buildStoredSummary(row).rows[0]);
    const afterRow = asMeasured(buildStoredSummary(withPartial).rows[0]);
    expect(afterRow.timeLabel).toBe(beforeRow.timeLabel);
    expect(afterRow.timeLabel).toBe("1:08");
  });

  it("the C2 mapping: eligibilityFailure's own row shape has no `steps` field at all, so no value the pair could carry can ever reach it — and the fence excludes every partial row anyway (I-B1: a partial row's endedBy is never \"finished\", the one value eligibilityFailure accepts)", () => {
    const c2Row = {
      source: "pm5" as const,
      endedBy: "rower",
      workSeconds: 124,
      workMeters: 500,
    };
    // `steps` isn't part of `SessionLogRow` at all (mapping.ts's own type) —
    // added here only to prove, at runtime, that a caller handing this
    // function an object that ALSO happens to carry a `steps` array with
    // the new keys gets the identical verdict, because the function never
    // reads the property.
    const withSteps = { ...c2Row, steps: withPartial.steps };
    expect(eligibilityFailure(withSteps)).toBe(eligibilityFailure(c2Row));
    expect(eligibilityFailure(c2Row)).toBe("not_finished");
  });

  // heroDistanceMeters (`LogRow.tsx`) — STATED, not asserted (RF21):
  // `RecentLog` has no `steps` field at all, so no value of
  // `partialMeters`/`partialSeconds` can ever reach it. An equality
  // assertion here could never fail and would be decoration, not a check.
});

// ---------------------------------------------------------------------
// Door spec (2026-09-02) §5.1/§6 — the stored screen's own half of the
// in-flight pair. Gate 0-B (James, 2026-09-02) APPROVED decisions (a),
// (b) and (c); the strings below are that approval, not a proposal.
// ---------------------------------------------------------------------

/** The five 500 m reps of a REAL library workout (Tropical Wave — the
 *  workout the approved artboard draws), as stored steps. RF3: a
 *  five-step row with the partial on step 3 is what production looks
 *  like, and a single-step fixture cannot tell `rows.find(...)` from
 *  `rows[0]`. `targetSplit` 102 is 2k+2 against this suite's own
 *  baselines idiom (2k = 100 s per 500). */
const TROPICAL_WAVE = LIBRARY_WORKOUTS.find(
  (w) => w.title === "Tropical Wave",
)!;

function tropicalSteps(): StoredLogStep[] {
  return Array.from({ length: 5 }, (_unused, i) => ({
    label: "500 m @ 2k +2",
    targetSplit: 102,
    meters: 500,
    // Steps 1 and 2 measured off the machine; 3 is the in-flight one; 4
    // and 5 were never reached.
    ...(i < 2
      ? {
          actualSource: "pm5" as const,
          actualSeconds: 112,
          actualMeters: 500,
          actualSplit: 112,
        }
      : {}),
    ...(i === 2 ? { partialMeters: 250, partialSeconds: 63 } : {}),
  }));
}

function tropicalRow(endedBy: StoredLog["endedBy"]): StoredLog {
  return baseRow({
    workoutTitle: TROPICAL_WAVE.title,
    workoutType: TROPICAL_WAVE.type,
    deviceName: "PM5 432331249",
    source: "pm5",
    steps: tropicalSteps(),
    endedBy,
  });
}

describe("buildRows — the in-flight pair on the stored step row (§5.1)", () => {
  it("puts the formatted pair on the unmeasured step it belongs to, and on no other row", () => {
    const rows = buildStoredSummary(tropicalRow("rower")).rows;
    expect(asPrescribed(rows[2]).partialLabel).toBe("250 m · 1:03");
    // Never on an unreached row (4 and 5) — absence is a KEY absence, not
    // a present-and-undefined one, because rows are compared with
    // `toStrictEqual` across this suite.
    expect(asPrescribed(rows[3]).partialLabel).toBeUndefined();
    expect("partialLabel" in asPrescribed(rows[3])).toBe(false);
    expect("partialLabel" in asPrescribed(rows[4])).toBe(false);
  });

  it("a TIME step reads the clock first: `2:10 · 480 m` (Gate 0-B decision (b)), off the same one formatter", () => {
    const rows = buildStoredSummary(
      baseRow({
        source: "pm5",
        deviceName: "PM5 432331249",
        endedBy: "rower",
        steps: [
          {
            label: "3:00 @ 6k",
            seconds: 180,
            targetSplit: 120,
            partialMeters: 480,
            partialSeconds: 130,
          },
        ],
      }),
    ).rows;
    expect(asPrescribed(rows[0]).partialLabel).toBe("2:10 · 480 m");
  });
});

describe("both row builders format the pair through the SAME function (§5.1: one formatter, two doors)", () => {
  it("monitorWorkRows (live/log door) and buildRows (stored screen) put the IDENTICAL string on the same step for the same data", () => {
    // THE LEG THAT CATCHES A SECOND COPY OF THE FORMAT. One expected
    // value, asserted against both doors — a row saved from this very
    // piece must read back the way the live summary read it, or the same
    // number is described two ways on two screens.
    const live = buildSummaryModel({
      door: "monitor",
      run: {
        v: 2,
        workoutId: null,
        title: TROPICAL_WAVE.title,
        program: {
          intervals: [
            {
              type: "work",
              kind: "distance",
              value: 500,
              targetSplit: 102,
              displaySpm: 26,
              restSeconds: 120,
            },
          ],
        },
        logSeed: {
          steps: [{ label: "500 m @ 2k +2", kind: "work" as const }],
          paces: {},
        },
        actuals: [],
        deviceName: "PM5 432331249",
        startedAt: "2026-08-18T18:57:00.000Z",
        completedAt: "2026-08-18T19:02:00.000Z",
        terminated: false,
        endedBy: "rower",
        partial: { intervalIndex: 0, meters: 250, seconds: 63 },
      },
    });
    const stored = buildStoredSummary(
      baseRow({
        source: "pm5",
        deviceName: "PM5 432331249",
        endedBy: "rower",
        steps: [
          {
            label: "500 m @ 2k +2",
            targetSplit: 102,
            meters: 500,
            partialMeters: 250,
            partialSeconds: 63,
          },
        ],
      }),
    );
    expect(asPrescribed(live.rows[0]).partialLabel).toBe("250 m · 1:03");
    expect(asPrescribed(stored.rows[0]).partialLabel).toBe(
      asPrescribed(live.rows[0]).partialLabel,
    );
  });
});

describe("buildStoredSummary's caption — the link-lost sentence, by precedence (§6, Gate 0-B decision (c))", () => {
  it("a link-lost row whose steps carry a partial captions the INTERVAL the pair belongs to", () => {
    expect(buildStoredSummary(tropicalRow("link-lost")).caption).toBe(
      "INTERVAL 3 · LAST READING BEFORE THE LINK WENT",
    );
  });

  it("the SAME steps on a `rower` close keep the caption they have today — the sentence is about the LINK, not about the partial", () => {
    // Steps 1 and 2 are measured, so `targetsOnlyCaption` abstains:
    // today's value is `undefined`, and it must stay `undefined`.
    expect(buildStoredSummary(tropicalRow("rower")).caption).toBeUndefined();
  });

  it("a SINGLE-STEP link-lost row: the caption is EXACTLY the partial sentence — never TARGETS ONLY, never the two concatenated (precedence, not stacking)", () => {
    const view = buildStoredSummary(
      baseRow({
        source: "pm5",
        deviceName: "PM5 432331249",
        endedBy: "link-lost",
        steps: [
          {
            label: "500 m @ 2k +2",
            targetSplit: 102,
            meters: 500,
            partialMeters: 250,
            partialSeconds: 63,
          },
        ],
      }),
    );
    // EQUALITY, never `toContain` — a `toContain` assertion stays green
    // under a stacked value, which is the failure this leg exists for.
    expect(view.caption).toBe("INTERVAL 1 · LAST READING BEFORE THE LINK WENT");
  });
});

describe("buildRows — the spoken form of the pair, keyed on the stored close reason (§6, Gate 0-B decision (g))", () => {
  it("a `rower` row speaks `stopped at`; the SAME steps on a `link-lost` row speak `last reading`", () => {
    // The stored door reads its close reason off the persisted row, so
    // this is where a saved link-lost piece proves it still says what got
    // THROUGH months later — the live door's own leg is in
    // `summaryModel.test.ts`, and both call one producer.
    const rower = buildStoredSummary(tropicalRow("rower")).rows[2]!;
    const lost = buildStoredSummary(tropicalRow("link-lost")).rows[2]!;
    expect(asPrescribed(rower).partialSpoken).toBe(
      "stopped at 250 m after 1:03",
    );
    expect(asPrescribed(lost).partialSpoken).toBe(
      "last reading 250 m after 1:03",
    );
  });

  it("a TIME step speaks metres first even though it SHOWS the clock first", () => {
    const rows = buildStoredSummary(
      baseRow({
        source: "pm5",
        deviceName: "PM5 432331249",
        endedBy: "rower",
        steps: [
          {
            label: "3:00 @ 6k",
            seconds: 180,
            targetSplit: 120,
            partialMeters: 480,
            partialSeconds: 130,
          },
        ],
      }),
    ).rows;
    expect(asPrescribed(rows[0]).partialLabel).toBe("2:10 · 480 m");
    expect(asPrescribed(rows[0]).partialSpoken).toBe(
      "stopped at 480 m after 2:10",
    );
  });

  it("an unreached step carries no spoken form at all", () => {
    const rows = buildStoredSummary(tropicalRow("rower")).rows;
    expect("partialSpoken" in asPrescribed(rows[3])).toBe(false);
  });
});
