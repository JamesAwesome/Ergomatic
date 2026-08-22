import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { parseGeneralStatus } from "../../domain/monitor/pm5/parse.js";
import { GENERAL_STATUS_UUID } from "../../domain/monitor/pm5/uuids.js";
import {
  check,
  CONTINUITY_BACKWARD_TOLERANCE_METERS,
  type ContinuityReading,
} from "./continuity";
import { fromHexString, parseRecording } from "./transports/recording";

// ============================================================================
// PART 1 — the pure predicate, against hand-built readings.
// ============================================================================

function reading(
  totalWorkDistanceMeters: number,
  distanceGoal = false,
): ContinuityReading {
  return { totalWorkDistanceMeters, distanceGoal };
}

describe("continuity.check: the pure predicate", () => {
  it("an unchanged reading is a continuation", () => {
    expect(check(reading(100), reading(100))).toBe("continuation");
  });

  it("ANY forward jump is a continuation — including one large enough to represent a genuine multi-minute background gap", () => {
    expect(check(reading(100), reading(101))).toBe("continuation");
    expect(check(reading(0), reading(50_000))).toBe("continuation");
  });

  it("a backward reading past the tolerance is a reset", () => {
    expect(
      check(
        reading(1000),
        reading(1000 - CONTINUITY_BACKWARD_TOLERANCE_METERS - 1),
      ),
    ).toBe("reset");
  });

  it("a backward reading exactly AT the tolerance is still a continuation — the tolerance is inclusive", () => {
    expect(
      check(
        reading(1000),
        reading(1000 - CONTINUITY_BACKWARD_TOLERANCE_METERS),
      ),
    ).toBe("continuation");
  });

  it("suppressed when the BEFORE reading is on a distance-goal interval, even if after is not", () => {
    expect(check(reading(500, true), reading(1, false))).toBe("continuation");
  });

  it("suppressed when the AFTER reading is on a distance-goal interval, even if before is not", () => {
    expect(check(reading(1, false), reading(500, true))).toBe("continuation");
  });

  it("suppressed when BOTH readings are on a distance-goal interval", () => {
    expect(check(reading(500, true), reading(250, true))).toBe("continuation");
  });
});

// ============================================================================
// PART 2 — ONE true reset, built from two REAL frames of a committed
// capture (exit criterion 6: "pinned against a synthetic resume built from
// a real capture's frames"). Both hex payloads below are copied verbatim
// from `docs/monitor/sessions/walk-2026-08-16/session-2-wu-4unequal.jsonl`
// (a MIXED program (2 distance + 3 time intervals — wire-decoded at the Task 4 re-review; its usable segment is the time-programmed run this test slices)) — the LAST 0x0031 sample
// in the file (twd=1599, the session's own final reading) paired as
// "before" against the FIRST 0x0031 sample in the file (twd=100, captured
// seconds after the workout armed) as "after": a real large backward jump,
// the shape a genuine power-cycle-mid-piece reset would produce on this
// wire. Decoded through the real `parseGeneralStatus`, not hand-typed
// numbers, so the test is honest about what it is asserting.
// ============================================================================

describe("continuity.check: ONE true reset, built from a real capture's own frames", () => {
  it("the capture's final reading (1599) followed by its own opening reading (100) is a reset", () => {
    const before = parseGeneralStatus(
      fromHexString("70 17 00 94 09 00 08 00 0a 01 04 3f 06 00 70 17 00 00 68"),
    );
    const after = parseGeneralStatus(
      fromHexString("00 00 00 00 00 00 08 00 04 00 01 64 00 00 70 17 00 00 68"),
    );
    if ("error" in before || "error" in after) {
      throw new Error("fixture bytes failed to decode — the pin is broken");
    }
    expect(before.totalWorkDistanceMeters).toBe(1599);
    expect(after.totalWorkDistanceMeters).toBe(100);
    expect(before.workoutDurationType).not.toBe(128);
    expect(after.workoutDurationType).not.toBe(128);

    expect(
      check(
        {
          totalWorkDistanceMeters: before.totalWorkDistanceMeters,
          distanceGoal: false,
        },
        {
          totalWorkDistanceMeters: after.totalWorkDistanceMeters,
          distanceGoal: false,
        },
      ),
    ).toBe("reset");
  });
});

// ============================================================================
// PART 3 — the corpus derivation AND its own validation, in one place: the
// same simulation shape the anchor pass used to falsify RowTracer's own
// elapsed bound (`.claude/agents/antagonist-ledger.md`'s "Phase LL anchor
// pass" entry) — slide a 30-second gap across every frame of every
// committed capture, and confirm ZERO false positives. `distanceGoal` is
// computed the SAME way `useMonitorSession.ts`'s own consumption seam
// computes it in production for a wire-decoded reading: from the SAME
// frame's own `workoutDurationType` byte (offset 17) reading the
// distance-goal identifier (128) — this test does not reach into a
// `WorkoutProgram`, since a raw capture carries no compiled program, only
// the wire's own per-frame declaration of what kind of goal is active,
// which is exactly the narrower of the two suppression signals
// `driver.ts`'s own `recordTwdVerdict` also reads (see `continuity.ts`'s
// header comment on why the production code widens to the whole-program
// check instead — this corpus test intentionally uses the narrower,
// PER-FRAME signal, which is a STRICTER test of the suppression: if the
// narrower signal already produces zero false positives, the wider,
// production suppression can only produce fewer).
// ============================================================================

const WORKOUT_DURATION_IDENTIFIER_DISTANCE = 128;

/** Six committed `pm5-recording/v1` wire captures — the IDENTICAL corpus
 *  list `liveness.test.ts`'s own `CORPUS_FILES` uses (Task 1), for the
 *  same reason: this is the full committed record, not a hand-picked
 *  subset. */
const CORPUS_FILES = [
  "walk-2026-08-16/session-1-keystone-2x250r0.jsonl",
  "walk-2026-08-16/session-2-wu-4unequal.jsonl",
  "walk-2026-08-17/step-2-pm5-recording-1786973078979.jsonl",
  "walk-2026-08-17/step-3-pm5-recording-second-rest-1786973713929.jsonl",
  "walk-2026-08-17/step-4-pm5-recording-1786974067695.jsonl",
  "walk-2026-08-18-metrics/pyramid-pm5-recording-1787090555458.jsonl.gz",
];

const SESSIONS_DIR = import.meta.url
  .replace(/^file:\/\//, "")
  .replace(/src\/monitor\/continuity\.test\.ts$/, "../docs/monitor/sessions/");

function loadCapture(fileName: string) {
  const path = `${SESSIONS_DIR}${fileName}`;
  const text = fileName.endsWith(".gz")
    ? gunzipSync(readFileSync(path)).toString("utf8")
    : readFileSync(path, "utf8");
  return parseRecording(text);
}

interface Sample {
  t: number;
  reading: ContinuityReading;
}

/** Every 0x0031 sample in `fileName`, chronological, decoded through the
 *  real codec — never a hand-rolled byte read (`liveness.test.ts`'s own
 *  `loadCapture`/subscribe-detection idiom, reused here). */
function loadTwdSamples(fileName: string): Sample[] {
  const { events } = loadCapture(fileName);
  const samples: Sample[] = [];
  for (const e of events) {
    if ("dir" in e && e.dir === "rx" && e.char === GENERAL_STATUS_UUID) {
      const decoded = parseGeneralStatus(fromHexString(e.hex));
      if ("error" in decoded) continue;
      samples.push({
        t: e.t,
        reading: {
          totalWorkDistanceMeters: decoded.totalWorkDistanceMeters,
          distanceGoal:
            decoded.workoutDurationType ===
            WORKOUT_DURATION_IDENTIFIER_DISTANCE,
        },
      });
    }
  }
  return samples;
}

/** The anchor pass's own simulation shape (RowTracer's falsification,
 *  reused verbatim for this rule): for every sample `i`, find the first
 *  LATER sample at least `gapMs` ahead in wall time — the "resume" a real
 *  30-second background gap starting at that exact frame would produce —
 *  and run `check` on the pair. Returns every verdict, in order, so the
 *  test can assert none of them is `"reset"` AND report how many pairs
 *  were actually exercised (a zero-pair result would silently pass a
 *  broken rule, matching this repo's own "read both vitest summary
 *  lines" discipline extended to a corpus sweep). */
function slideGap(
  samples: Sample[],
  gapMs: number,
): { verdict: ReturnType<typeof check>; before: Sample; after: Sample }[] {
  const results: {
    verdict: ReturnType<typeof check>;
    before: Sample;
    after: Sample;
  }[] = [];
  for (let i = 0; i < samples.length; i++) {
    const targetT = samples[i]!.t + gapMs;
    let j = i + 1;
    while (j < samples.length && samples[j]!.t < targetT) j++;
    if (j >= samples.length) break;
    results.push({
      verdict: check(samples[i]!.reading, samples[j]!.reading),
      before: samples[i]!,
      after: samples[j]!,
    });
  }
  return results;
}

describe("continuity.check: the corpus derivation — a 30s gap slid across every frame of every committed capture", () => {
  it.each(CORPUS_FILES)("zero false positives: %s", (fileName) => {
    const samples = loadTwdSamples(fileName);
    const results = slideGap(samples, 30_000);
    const resets = results.filter((r) => r.verdict === "reset");
    if (resets.length > 0) {
      const detail = resets
        .map(
          (r) =>
            `t=${r.before.t}->${r.after.t} twd=${r.before.reading.totalWorkDistanceMeters}->${r.after.reading.totalWorkDistanceMeters}`,
        )
        .join("; ");
      throw new Error(
        `${resets.length} false-positive reset(s) in ${fileName}: ${detail}`,
      );
    }
    expect(resets).toHaveLength(0);
  });

  it("sanity: this sweep actually exercised a meaningful number of NON-SUPPRESSED pairs across the corpus (not a silently-empty, or silently-all-suppressed, pass)", () => {
    let totalPairs = 0;
    let nonSuppressedPairs = 0;
    for (const f of CORPUS_FILES) {
      const results = slideGap(loadTwdSamples(f), 30_000);
      totalPairs += results.length;
      // Task 4 review fix (F5, Minor): the floor below is asserted
      // against the pairs `check` actually COMPARES — neither reading
      // distance-goal — not the raw total. The raw total (measured:
      // 3,092) includes every distance-goal pair too, which `check`
      // suppresses internally without ever reaching its backward-jump
      // comparison; a sweep that regressed to 100% suppressed pairs
      // would still pass a raw-total-only floor while proving nothing
      // about the bound this file exists to validate.
      nonSuppressedPairs += results.filter(
        (r) => !r.before.reading.distanceGoal && !r.after.reading.distanceGoal,
      ).length;
    }
    // Measured: 3,092 raw pairs, 1,026 non-distance-goal (the ones `check`
    // actually evaluates) across the 6 captures — floors set well under
    // each, guarding against either number shrinking silently.
    expect(totalPairs).toBeGreaterThan(1000);
    expect(nonSuppressedPairs).toBeGreaterThan(500);
  });
});
