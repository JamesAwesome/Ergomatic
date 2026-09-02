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
    // Just Row unconnected spec (2026-09-02), stored shape (c): the door
    // is a COLUMN now, non-null. The base fixture is the all-assumed shape
    // (no device, no stopwatch step), so its realistic member is `manual`;
    // every device fixture below says `pm5` beside its `deviceName`, and
    // the timer-door fixtures say `timer` (RF3: fixtures look like rows
    // the migration's backfill would actually produce).
    source: "manual",
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
  // never becomes a stored step (`logDraft.ts:844-846`'s own
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

// Cohort-unlock spec (2026-08-23), §2: `linkLostLine` is present, with
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
    expect(view.linkLostLine).toBe(
      "LINK LOST · the app lost the monitor before the end",
    );
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
    expect(view.linkLostLine).toBeUndefined();
  });
});
