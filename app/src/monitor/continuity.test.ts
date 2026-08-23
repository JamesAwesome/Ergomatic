import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { parseGeneralStatus } from "../../domain/monitor/pm5/parse.js";
import { GENERAL_STATUS_UUID } from "../../domain/monitor/pm5/uuids.js";
import { check, type ContinuityReading } from "./continuity";
import { fromHexString, parseRecording } from "./transports/recording";

// ============================================================================
// PART 1 — the pure predicate, against hand-built readings: the baseline
// shape only (unchanged / all-forward / suppression). The full per-axis
// three-axis pin suite — the tests that can actually go red if a clause of
// F2a's conjunction is deleted — lives in its own describe block below
// ("the three-axis full-reset signature (F2a, spec 2026-08-23)"), not
// here, to avoid two suites asserting the identical thing two different
// ways.
// ============================================================================

function reading(
  totalWorkDistanceMeters: number,
  elapsedSeconds: number,
  distanceMeters: number,
  distanceGoal = false,
): ContinuityReading {
  return {
    totalWorkDistanceMeters,
    elapsedSeconds,
    distanceMeters,
    distanceGoal,
  };
}

describe("continuity.check: the pure predicate", () => {
  it("an unchanged reading is a continuation", () => {
    expect(check(reading(100, 30, 90), reading(100, 30, 90))).toBe(
      "continuation",
    );
  });

  it("a forward jump on every axis is a continuation — including one large enough to represent a genuine multi-minute background gap", () => {
    expect(check(reading(100, 30, 90), reading(101, 31, 91))).toBe(
      "continuation",
    );
    expect(check(reading(0, 0, 0), reading(50_000, 900, 12_000))).toBe(
      "continuation",
    );
  });

  it("suppressed when the BEFORE reading is on a distance-goal interval, even if after is not — TWD, elapsed AND distance all backward too", () => {
    expect(
      check(reading(500, 69.75, 248.5, true), reading(1, 0.5, 1.9, false)),
    ).toBe("continuation");
  });

  it("suppressed when the AFTER reading is on a distance-goal interval, even if before is not", () => {
    expect(
      check(reading(1, 0.5, 1.9, false), reading(500, 69.75, 248.5, true)),
    ).toBe("continuation");
  });

  it("suppressed when BOTH readings are on a distance-goal interval", () => {
    expect(
      check(reading(500, 69.75, 248.5, true), reading(250, 35.0, 124.2, true)),
    ).toBe("continuation");
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
    // F2a: this real pair is a genuine reset on ALL three axes, not just
    // TWD — decoded, not hand-typed, so the "reset" verdict below is
    // actually exercising the full conjunction, not just its TWD clause.
    expect(before.elapsedSeconds).toBe(60);
    expect(before.distanceMeters).toBe(245.2);
    expect(after.elapsedSeconds).toBe(0);
    expect(after.distanceMeters).toBe(0);

    expect(
      check(
        {
          totalWorkDistanceMeters: before.totalWorkDistanceMeters,
          elapsedSeconds: before.elapsedSeconds,
          distanceMeters: before.distanceMeters,
          distanceGoal: false,
        },
        {
          totalWorkDistanceMeters: after.totalWorkDistanceMeters,
          elapsedSeconds: after.elapsedSeconds,
          distanceMeters: after.distanceMeters,
          distanceGoal: false,
        },
      ),
    ).toBe("reset");
  });
});

// ============================================================================
// PART 2b — the three-axis full-reset signature itself (F2a, spec
// 2026-08-23-continuity-corroboration §4): the pins that can actually go
// red if a clause of the conjunction is deleted (self-mutation targets
// them one at a time — see this task's report). `beforeHealthy` and
// `afterTwdOnlyBackward` are transcribed, not hand-typed guesses: they are
// the walk's own convicting pair, `ring-phone-2-background-continuity-
// kill.json` seq 30 -> 33 (`"twd-sample"` entries: machineTotal=81m at
// elapsed=56.11s distance=81.2m -> machineTotal=0m at elapsed=59.33s
// distance=83.3m — TWD backward while elapsed AND distance both advance).
// ============================================================================

describe("continuity.check: the three-axis full-reset signature (F2a, spec 2026-08-23)", () => {
  // ring-phone-2-background-continuity-kill.json seq 30 -> 33: the walk's
  // own false kill. TWD backward, elapsed AND distance advancing.
  const beforeHealthy = {
    totalWorkDistanceMeters: 81,
    elapsedSeconds: 56.11,
    distanceMeters: 81.2,
    distanceGoal: false,
  };
  const afterTwdOnlyBackward = {
    totalWorkDistanceMeters: 0,
    elapsedSeconds: 59.33,
    distanceMeters: 83.3,
    distanceGoal: false,
  };
  it("the 2026-08-23 false kill cannot regress: ring-phone-2 seq 30->33 is a continuation", () => {
    expect(check(beforeHealthy, afterTwdOnlyBackward)).toBe("continuation");
  });
  // ring-phone-4 seq 7-8 shape: a genuinely reset monitor reads zeros on
  // all three axes.
  it("a full reset (all three axes backward) still convicts", () => {
    expect(
      check(beforeHealthy, {
        totalWorkDistanceMeters: 0,
        elapsedSeconds: 0,
        distanceMeters: 0,
        distanceGoal: false,
      }),
    ).toBe("reset");
  });
  // Per-clause pins (antagonist blocking 4): exactly one axis backward,
  // two advancing -> continuation, one pin per axis so deleting ANY
  // clause of the conjunction goes red.
  it("elapsed-only backward is a continuation (per-interval clocks legally re-base)", () => {
    expect(
      check(beforeHealthy, {
        totalWorkDistanceMeters: 95,
        elapsedSeconds: 2.1,
        distanceMeters: 90.0,
        distanceGoal: false,
      }),
    ).toBe("continuation");
  });
  it("distance-only backward is a continuation (per-interval distance legally resets)", () => {
    expect(
      check(beforeHealthy, {
        totalWorkDistanceMeters: 95,
        elapsedSeconds: 60.0,
        distanceMeters: 1.9,
        distanceGoal: false,
      }),
    ).toBe("continuation");
  });
  it("TWD-only backward is a continuation (the non-monotonic key, walk F5)", () => {
    expect(check(beforeHealthy, afterTwdOnlyBackward)).toBe("continuation");
  });
  it("two of three backward is still a continuation (a boundary shape, never a reset)", () => {
    expect(
      check(beforeHealthy, {
        totalWorkDistanceMeters: 95,
        elapsedSeconds: 0.5,
        distanceMeters: 1.9,
        distanceGoal: false,
      }),
    ).toBe("continuation");
  });
  // Self-mutation (task report): the two "-only backward" pins above and
  // the "two of three" pin all share TWD forward/unchanged as their
  // blocking axis, so none of them actually exercises the elapsed or
  // distance clause independently — deleting either clause (forcing it
  // `true`) leaves all three of those tests green, because TWD's own
  // clause already blocks conviction regardless. These two pins close
  // that gap: TWD AND one other axis backward, the THIRD axis forward —
  // one pin per remaining clause, so deleting THAT clause (and only that
  // clause) is what turns each one red.
  it("TWD and distance backward, elapsed forward, is still a continuation (pins the elapsed clause specifically)", () => {
    expect(
      check(beforeHealthy, {
        totalWorkDistanceMeters: 50,
        elapsedSeconds: 70.0,
        distanceMeters: 40.0,
        distanceGoal: false,
      }),
    ).toBe("continuation");
  });
  it("TWD and elapsed backward, distance forward, is still a continuation (pins the distance clause specifically)", () => {
    expect(
      check(beforeHealthy, {
        totalWorkDistanceMeters: 50,
        elapsedSeconds: 20.0,
        distanceMeters: 150.0,
        distanceGoal: false,
      }),
    ).toBe("continuation");
  });
  it("0 -> 0 TWD is not backward (strict less-than; the five-zeros regime)", () => {
    expect(
      check(
        {
          totalWorkDistanceMeters: 0,
          elapsedSeconds: 11.27,
          distanceMeters: 33.3,
          distanceGoal: false,
        },
        {
          totalWorkDistanceMeters: 0,
          elapsedSeconds: 15.0,
          distanceMeters: 40.1,
          distanceGoal: false,
        },
      ),
    ).toBe("continuation");
  });
  // Antagonist blocking 5: the suppression must be pinned NON-vacuously —
  // a distance-goal pair with ALL THREE axes backward (the 0/250/500
  // boundary flicker shape) is a continuation ONLY because of the
  // suppression. Delete the suppression line and THIS test goes red.
  it("distance-goal suppression is load-bearing: a triple-backward flicker pair stays a continuation", () => {
    expect(
      check(
        {
          totalWorkDistanceMeters: 500,
          elapsedSeconds: 69.75,
          distanceMeters: 248.5,
          distanceGoal: true,
        },
        {
          totalWorkDistanceMeters: 0,
          elapsedSeconds: 0.5,
          distanceMeters: 1.9,
          distanceGoal: true,
        },
      ),
    ).toBe("continuation");
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
 *  `loadCapture`/subscribe-detection idiom, reused here). F2a: threads
 *  `elapsedSeconds`/`distanceMeters` through from the SAME decode as
 *  `totalWorkDistanceMeters`, never defaulted — `ContinuityReading`'s two
 *  new axes come from the identical `GeneralStatus` frame the TWD reading
 *  already comes from. */
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
          elapsedSeconds: decoded.elapsedSeconds,
          distanceMeters: decoded.distanceMeters,
          distanceGoal:
            decoded.workoutDurationType ===
            WORKOUT_DURATION_IDENTIFIER_DISTANCE,
        },
      });
    }
  }
  return samples;
}

/** A single reading at a specific recorded `seq`, decoded through the real
 *  codec — for pinning a NAMED real boundary pair (spec §1's three real
 *  non-distance boundaries) rather than sliding a synthetic gap. Throws
 *  loudly rather than returning a partial/undefined reading if `seq`
 *  doesn't land on a General Status rx event or fails to decode — a
 *  silently-skipped seq would make the pin assert nothing (repo rule 10:
 *  say so, don't force it). */
function loadReadingAtSeq(fileName: string, seq: number): ContinuityReading {
  const { events } = loadCapture(fileName);
  const event = events.find((e) => e.seq === seq);
  if (
    !event ||
    !("dir" in event) ||
    event.dir !== "rx" ||
    event.char !== GENERAL_STATUS_UUID
  ) {
    throw new Error(
      `seq ${seq} in ${fileName} is not a General Status rx event: ${JSON.stringify(event)}`,
    );
  }
  const decoded = parseGeneralStatus(fromHexString(event.hex));
  if ("error" in decoded) {
    throw new Error(`seq ${seq} in ${fileName} failed to decode`);
  }
  return {
    totalWorkDistanceMeters: decoded.totalWorkDistanceMeters,
    elapsedSeconds: decoded.elapsedSeconds,
    distanceMeters: decoded.distanceMeters,
    distanceGoal:
      decoded.workoutDurationType === WORKOUT_DURATION_IDENTIFIER_DISTANCE,
  };
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

// ============================================================================
// PART 4 — the three real NON-DISTANCE boundary pairs named in the design
// spec (§1, antagonist pass 2026-08-23): legal interval boundaries where
// TWD holds or grows while elapsed/distance reset for the next interval —
// the shape the three-axis conjunction must NOT convict. Both source
// files are already in `CORPUS_FILES` above; these are NAMED replays of
// specific seqs within them, not part of the generic slide-a-gap sweep.
// ============================================================================

const STEP3_FILE =
  "walk-2026-08-17/step-3-pm5-recording-second-rest-1786973713929.jsonl";
const SESSION2_FILE = "walk-2026-08-16/session-2-wu-4unequal.jsonl";

describe("continuity.check: the three real non-distance boundary pairs stay continuations", () => {
  it("step-3 recording seq 411->416: TWD forward (0->160m) while elapsed/distance reset for the next interval", () => {
    const before = loadReadingAtSeq(STEP3_FILE, 411);
    const after = loadReadingAtSeq(STEP3_FILE, 416);
    expect(before.totalWorkDistanceMeters).toBe(0);
    expect(before.elapsedSeconds).toBe(59.77);
    expect(before.distanceMeters).toBe(159.3);
    expect(after.totalWorkDistanceMeters).toBe(160);
    expect(after.elapsedSeconds).toBe(0);
    expect(after.distanceMeters).toBe(0);
    expect(before.distanceGoal).toBe(false);
    expect(after.distanceGoal).toBe(false);
    expect(check(before, after)).toBe("continuation");
  });

  it("step-3 recording seq 953->956: TWD unchanged (373->373m) while elapsed/distance reset for the next interval", () => {
    const before = loadReadingAtSeq(STEP3_FILE, 953);
    const after = loadReadingAtSeq(STEP3_FILE, 956);
    expect(before.totalWorkDistanceMeters).toBe(373);
    expect(before.elapsedSeconds).toBe(60);
    expect(before.distanceMeters).toBe(213.7);
    expect(after.totalWorkDistanceMeters).toBe(373);
    expect(after.elapsedSeconds).toBe(0);
    expect(after.distanceMeters).toBe(0);
    expect(check(before, after)).toBe("continuation");
  });

  it("session-2 recording seq 776->781: TWD unchanged (360->360m) while elapsed/distance reset for the next interval", () => {
    const before = loadReadingAtSeq(SESSION2_FILE, 776);
    const after = loadReadingAtSeq(SESSION2_FILE, 781);
    expect(before.totalWorkDistanceMeters).toBe(360);
    expect(before.elapsedSeconds).toBe(69.63);
    expect(before.distanceMeters).toBe(260.1);
    expect(after.totalWorkDistanceMeters).toBe(360);
    expect(after.elapsedSeconds).toBe(0.31);
    expect(after.distanceMeters).toBe(1.1);
    expect(check(before, after)).toBe("continuation");
  });
});
