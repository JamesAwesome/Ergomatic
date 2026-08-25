import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { WorkoutProgram } from "../../domain/monitor/program.js";
import {
  parseAdditionalStatus2,
  parseGeneralStatus,
  toMonitorState,
} from "../../domain/monitor/pm5/parse.js";
import {
  ADDITIONAL_STATUS_2_UUID,
  GENERAL_STATUS_UUID,
} from "../../domain/monitor/pm5/uuids.js";
import { check, type ContinuityReading } from "./continuity";
import { fromHexString, parseRecording } from "./transports/recording";
import { programHasDistanceGoal } from "./useMonitorSession";

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

  it("suppressed when the AFTER reading is on a distance-goal interval, even if before is not — TWD, elapsed AND distance all backward too", () => {
    expect(
      check(reading(500, 69.75, 248.5, false), reading(1, 0.5, 1.9, true)),
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
// PART 2c — F2b: the interval-count bound (design spec §4, PR 3 Task 2
// Step 2). PART 5's own sweep (below) decided the suppression question
// FIRST: KEPT, not lifted — the count bound runs under the SAME
// distance-goal suppression the three-axis signature already uses, no
// separately-lifted rule. These pins exercise the bound's own logic:
// `after.intervalCount < before.intervalCount`, guarded by presence on
// BOTH sides (falls back to F2a exactly when either is missing).
// ============================================================================

function countReading(
  over: Partial<ContinuityReading> & {
    totalWorkDistanceMeters: number;
    elapsedSeconds: number;
    distanceMeters: number;
  },
): ContinuityReading {
  return { distanceGoal: false, ...over };
}

describe("continuity.check: the interval-count bound (F2b, design spec §4)", () => {
  it("SYNTHETIC multi-interval fixture: a mid-gap reset with per-interval clocks reading FORWARD (TWD holds/grows, elapsed/distance both look like a fresh interval start) but the raw interval count reading BACKWARD ⇒ reset — the conviction F2a's three-axis signature alone could not make (F2a §2b's traded-away blind window, this file's own header comment)", () => {
    const before = countReading({
      totalWorkDistanceMeters: 300,
      elapsedSeconds: 40,
      distanceMeters: 150,
      intervalCount: 2,
    });
    const after = countReading({
      totalWorkDistanceMeters: 305, // forward — F2a's own signature stays silent
      elapsedSeconds: 5, // a fresh interval's own clock, reading forward from 0
      distanceMeters: 20, // same
      intervalCount: 1, // the machine genuinely re-armed an earlier interval
    });
    expect(check(before, after)).toBe("reset");
  });

  it("a genuine backward transition INTO 0 is still a conviction — 0 is a real, PRESENT reading (interval 1, 0-based, spec §4's own honest capability statement), not a missing one; the presence guard must be `!== undefined`, never truthiness, or this case is silently missed", () => {
    const before = countReading({
      totalWorkDistanceMeters: 300,
      elapsedSeconds: 40,
      distanceMeters: 150,
      intervalCount: 1,
    });
    const after = countReading({
      totalWorkDistanceMeters: 305,
      elapsedSeconds: 5,
      distanceMeters: 20,
      intervalCount: 0,
    });
    expect(check(before, after)).toBe("reset");
  });

  it("count missing on the AFTER side falls back to EXACTLY F2a's verdict — reset when the three-axis signature says reset", () => {
    const before = countReading({
      totalWorkDistanceMeters: 300,
      elapsedSeconds: 40,
      distanceMeters: 150,
      intervalCount: 2,
    });
    const after = countReading({
      totalWorkDistanceMeters: 10,
      elapsedSeconds: 5,
      distanceMeters: 3,
      // intervalCount omitted: genuinely missing (no 0x0033 yet for THIS reading)
    });
    expect(check(before, after)).toBe("reset");
  });

  it("count missing on the AFTER side falls back to EXACTLY F2a's verdict — continuation when the three-axis signature says continuation, even though the count itself would read backward if it were present", () => {
    const before = countReading({
      totalWorkDistanceMeters: 300,
      elapsedSeconds: 40,
      distanceMeters: 150,
      intervalCount: 2,
    });
    const after = countReading({
      totalWorkDistanceMeters: 305, // forward — F2a says continuation
      elapsedSeconds: 45,
      distanceMeters: 160,
      // intervalCount omitted
    });
    expect(check(before, after)).toBe("continuation");
  });

  it("count missing on the BEFORE side falls back to EXACTLY F2a's verdict — reset when the three-axis signature says reset", () => {
    const before = countReading({
      totalWorkDistanceMeters: 300,
      elapsedSeconds: 40,
      distanceMeters: 150,
      // intervalCount omitted
    });
    const after = countReading({
      totalWorkDistanceMeters: 10,
      elapsedSeconds: 5,
      distanceMeters: 3,
      intervalCount: 0,
    });
    expect(check(before, after)).toBe("reset");
  });

  it("count missing on the BEFORE side falls back to EXACTLY F2a's verdict — continuation when the three-axis signature says continuation", () => {
    const before = countReading({
      totalWorkDistanceMeters: 300,
      elapsedSeconds: 40,
      distanceMeters: 150,
      // intervalCount omitted
    });
    const after = countReading({
      totalWorkDistanceMeters: 305,
      elapsedSeconds: 45,
      distanceMeters: 160,
      intervalCount: 0,
    });
    expect(check(before, after)).toBe("continuation");
  });

  it("count EQUAL, three-axis backward ⇒ reset — F2a's own conviction is unchanged by this bound; an unchanged count never blocks it", () => {
    const before = countReading({
      totalWorkDistanceMeters: 300,
      elapsedSeconds: 60,
      distanceMeters: 245,
      intervalCount: 2,
    });
    const after = countReading({
      totalWorkDistanceMeters: 0,
      elapsedSeconds: 0,
      distanceMeters: 0,
      intervalCount: 2,
    });
    expect(check(before, after)).toBe("reset");
  });

  it("count FORWARD across a legal, boundary-straddling gap ⇒ continuation — TWD holds/grows while elapsed/distance reset for the next interval (the three real non-distance boundary shapes, PART 4 above) AND the interval count advances, the ordinary case a genuine boundary produces", () => {
    const before = countReading({
      totalWorkDistanceMeters: 373,
      elapsedSeconds: 60,
      distanceMeters: 213.7,
      intervalCount: 1,
    });
    const after = countReading({
      totalWorkDistanceMeters: 373, // holds, the step-3 seq 953->956 shape
      elapsedSeconds: 0,
      distanceMeters: 0,
      intervalCount: 2, // forward — a genuine boundary advances the count
    });
    expect(check(before, after)).toBe("continuation");
  });

  it("the distance-goal suppression covers the count bound too — decided KEPT, not a separately-lifted rule (PART 5's own sweep below): a backward count on a distance-goal reading stays a continuation", () => {
    const before = countReading({
      totalWorkDistanceMeters: 500,
      elapsedSeconds: 69.75,
      distanceMeters: 248.5,
      distanceGoal: true,
      intervalCount: 5,
    });
    const after = countReading({
      totalWorkDistanceMeters: 0,
      elapsedSeconds: 0.5,
      distanceMeters: 1.9,
      distanceGoal: true,
      intervalCount: 2, // backward, but suppressed before this axis is even read
    });
    expect(check(before, after)).toBe("continuation");
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
// which is the narrower of the two suppression signals this same wire fact
// has fed (`driver.ts`'s per-run TWD verdict used to read the WHOLE-program
// arm of the OR too, before RC-9c retired it; `continuity.ts`'s own header
// comment has the full wire citation for why the surviving production
// check, `useMonitorSession.ts`'s `programHasDistanceGoal`, still widens to
// the whole program — this corpus test intentionally uses the narrower,
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

// ============================================================================
// PART 5 — THE COUNT BOUND'S SUPPRESSION SWEEP (storage-spine design spec
// §4, PR 3 Task 2 Step 1): run BEFORE the bound exists in `continuity.ts`,
// on purpose — the spec's own conditional ("lift F2a's suppression for the
// count bound, or keep it") is DECIDED by this sweep, not asserted first
// and checked second. Nothing below calls `check` or reads
// `ContinuityReading.intervalCount` (that field doesn't exist yet); this
// block measures the raw predicate — `after.intervalCount <
// before.intervalCount` on a non-suppressed, in-run pair — independently,
// under BOTH `distanceGoal` signals the codebase has:
//
// - the WIRE signal `continuity.test.ts`'s own PART 3 already uses:
//   per-sample `workoutDurationType === 128`, read straight off the SAME
//   frame the count is attached to;
// - the PRODUCTION signal `useMonitorSession.ts`'s `applyContinuityCheck`
//   actually runs: `programHasDistanceGoal(run.program)` — the ARMED
//   PROGRAM, a single fact constant for the whole session, not a
//   per-sample read.
//
// `.claude/agents/antagonist-ledger.md`'s "Phase RC delta pass" entry
// (2026-08-23) is the reason both are measured, not just the first: an
// earlier draft of this bound's own claim ("a corpus sweep shows zero
// backward interval-count readings on healthy resumes") was FALSE for the
// predicate production actually runs, because the two signals disagree —
// oracle blindness "through a different door," not just a fixture the code
// can't reach at all.
//
// **A brief-contradicting finding, recorded here rather than worked around
// silently (repo rule 10):** Task 2's own brief asserted "the armed
// program is derivable from each recording's header — the captures carry
// their programs." That is FALSE for 5 of the 6 committed corpus files —
// only `step-3-pm5-recording-second-rest-1786973713929.jsonl`'s header
// actually carries a `program` field (verified: `grep -c '"program"'` over
// each of the other five files' raw bytes returns 0). The five walks that
// produced these captures predate the recorder capturing the armed program
// in-band; what DOES exist for every one of them is the walk's own
// RUNSHEET/README, committed alongside the recording, naming the exact
// program that was armed. `ARMED_PROGRAM` below is built from THOSE
// citations (one per file, quoted inline) for the five, and from the
// real `header.program` for the sixth — never guessed, never left as a
// gap this sweep would otherwise have to skip.
// ============================================================================

/** Minimal `ProgramInterval` — every field this block never reads
 *  (`targetSplit`/`displaySpm`/`restSeconds`/exact `value`) is a
 *  placeholder; `programHasDistanceGoal` reads only `kind`. */
function armedInterval(
  kind: "time" | "distance",
): WorkoutProgram["intervals"][number] {
  return {
    type: "work",
    kind,
    value: kind === "time" ? 60 : 250,
    targetSplit: null,
    displaySpm: null,
    restSeconds: 0,
  };
}

/** The five corpus files whose header carries no `program` (confirmed
 *  above) — the armed program as documented by the walk that produced
 *  each one, quoted from the committed RUNSHEET/README. */
const DOCUMENTED_ARMED_PROGRAM: Record<string, WorkoutProgram> = {
  // docs/monitor/sessions/walk-2026-08-16/RUNSHEET.md, "Session 1 — the
  // keystone": "Program: 2×250 m, r0, NO warm-up."
  "walk-2026-08-16/session-1-keystone-2x250r0.jsonl": {
    intervals: [armedInterval("distance"), armedInterval("distance")],
  },
  // Same RUNSHEET, "Session 2 — the unequal-intervals clock row":
  // "Program: 4 unequal intervals — 1:00 / 2:00 / 500 m / 1:00, r30."
  "walk-2026-08-16/session-2-wu-4unequal.jsonl": {
    intervals: [
      armedInterval("time"),
      armedInterval("time"),
      armedInterval("distance"),
      armedInterval("time"),
    ],
  },
  // docs/monitor/sessions/walk-2026-08-17/README.md's own table, row
  // "1 keystone": "2×250m r0, no wu" (`step-2-*.jsonl`).
  "walk-2026-08-17/step-2-pm5-recording-1786973078979.jsonl": {
    intervals: [armedInterval("distance"), armedInterval("distance")],
  },
  // Same README table, row "3 (END)": "2×250m keystone, END ~44s in"
  // (`step-4-*.jsonl`).
  "walk-2026-08-17/step-4-pm5-recording-1786974067695.jsonl": {
    intervals: [armedInterval("distance"), armedInterval("distance")],
  },
  // docs/monitor/sessions/walk-2026-08-18-metrics/README.md: "Program
  // (Walk Pyramid, distinct targets): `w 300m 6k @22 r1 · w 700m 6k-4 @24
  // r1 · w 300m 6k+4 @22`" — three distance-kind intervals.
  "walk-2026-08-18-metrics/pyramid-pm5-recording-1787090555458.jsonl.gz": {
    intervals: [
      armedInterval("distance"),
      armedInterval("distance"),
      armedInterval("distance"),
    ],
  },
};

/** `step-3`'s header really does carry `program` (Task 1's own capture);
 *  read it from there instead of duplicating it by hand, so the two
 *  sources cannot silently disagree. Every other file falls back to
 *  `DOCUMENTED_ARMED_PROGRAM` above. Throws loudly if a file has neither —
 *  a silently-skipped file would make the production-predicate sweep
 *  undercount without saying so (repo rule 10). */
function armedProgramFor(fileName: string): WorkoutProgram {
  const { header } = loadCapture(fileName);
  if (header.program) return header.program;
  const documented = DOCUMENTED_ARMED_PROGRAM[fileName];
  if (!documented) {
    throw new Error(
      `no armed program (header or documented) for ${fileName} — the production-predicate sweep cannot compute programHasDistanceGoal for it`,
    );
  }
  return documented;
}

interface CountSample {
  t: number;
  seq: number;
  /** The merged raw AS2 state at this GS tick — `undefined` until this
   *  file's first 0x0033 has arrived, the identical "absent until first
   *  0x0033" contract `domain/monitor/types.ts`'s `rawIntervalCount`
   *  doc comment names for the real driver (Task 1). */
  intervalCount?: number;
  /** This SAME frame's own `workoutDurationType === 128` — PART 3's wire
   *  signal, per-sample. */
  wireDistanceGoal: boolean;
  /** `false` until this file's first non-"armed" `workoutState` (WAIT­TO­BEGIN
   *  or COUNTDOWNPAUSE) — the production path's `run === null` window: no
   *  `MonitorRun` exists, so `applyContinuityCheck` never calls `check` at
   *  all, whatever the readings say. Latches `true` for the rest of the
   *  file once crossed (a run, once opened, does not return to "armed"
   *  mid-session in this corpus). */
  inRun: boolean;
}

/** Every 0x0031 sample in `fileName`, in wire-arrival order, carrying the
 *  MERGED raw interval count exactly the way `driver.ts`'s own `raw`
 *  object does: `mergeStatus`'s callback for 0x0033 updates the merged
 *  state on EVERY AS2 arrival; `maybeEmitFrame` (0x0031's own callback)
 *  reads whatever that merged state holds AT THE MOMENT the GS tick
 *  fires — never re-paired to the AS2 event by timestamp, never
 *  re-derived. This function reproduces exactly that: a running
 *  `lastCount` updated on every AS2 rx, snapshotted onto the sample built
 *  at the NEXT GS rx (`driver.test.ts`'s own capture-replay pin for
 *  Task 1's `rawIntervalCount` field exercises the identical pairing
 *  through the real driver). */
function loadCountSamples(fileName: string): CountSample[] {
  const { events } = loadCapture(fileName);
  const samples: CountSample[] = [];
  let lastCount: number | undefined;
  let runOpened = false;
  for (const e of events) {
    if (!("dir" in e) || e.dir !== "rx") continue;
    if (e.char === ADDITIONAL_STATUS_2_UUID) {
      const decoded = parseAdditionalStatus2(fromHexString(e.hex));
      if (!("error" in decoded)) lastCount = decoded.intervalCount;
      continue;
    }
    if (e.char !== GENERAL_STATUS_UUID) continue;
    const decoded = parseGeneralStatus(fromHexString(e.hex));
    if ("error" in decoded) continue;
    if (toMonitorState(decoded.workoutState) !== "armed") runOpened = true;
    samples.push({
      t: e.t,
      seq: e.seq,
      intervalCount: lastCount,
      wireDistanceGoal:
        decoded.workoutDurationType === WORKOUT_DURATION_IDENTIFIER_DISTANCE,
      inRun: runOpened,
    });
  }
  return samples;
}

/** The anchor pass's own simulation shape (`slideGap` above), reused for
 *  `CountSample` — for every sample, find the first later sample at least
 *  `gapMs` ahead in wall time and pair them. */
function slideCountGap(
  samples: CountSample[],
  gapMs: number,
): { before: CountSample; after: CountSample }[] {
  const results: { before: CountSample; after: CountSample }[] = [];
  for (let i = 0; i < samples.length; i++) {
    const targetT = samples[i]!.t + gapMs;
    let j = i + 1;
    while (j < samples.length && samples[j]!.t < targetT) j++;
    if (j >= samples.length) break;
    results.push({ before: samples[i]!, after: samples[j]! });
  }
  return results;
}

interface CountSweepResult {
  /** Pairs where BOTH sides carry a count AND neither is suppressed —
   *  the only pairs this bound's suppression decision can be measured
   *  against. A pair missing a count on either side is F2a's territory,
   *  not this bound's — never counted here either way. */
  nonSuppressedPairs: number;
  backward: string[];
}

/** WIRE predicate: suppressed when EITHER reading's own
 *  `workoutDurationType === 128` — PART 3's per-sample signal, unchanged. */
function sweepWirePredicate(): CountSweepResult {
  const backward: string[] = [];
  let nonSuppressedPairs = 0;
  for (const f of CORPUS_FILES) {
    for (const { before, after } of slideCountGap(
      loadCountSamples(f),
      30_000,
    )) {
      if (before.intervalCount === undefined) continue;
      if (after.intervalCount === undefined) continue;
      if (before.wireDistanceGoal || after.wireDistanceGoal) continue;
      nonSuppressedPairs++;
      if (after.intervalCount < before.intervalCount) {
        backward.push(
          `${f} seq ${before.seq}->${after.seq}: count ${before.intervalCount}->${after.intervalCount}`,
        );
      }
    }
  }
  return { nonSuppressedPairs, backward };
}

/** PRODUCTION predicate: suppressed when `programHasDistanceGoal` of THIS
 *  FILE's own armed program is true — a single fact for the whole file,
 *  computed once, never per-sample (this is what makes it a DIFFERENT
 *  rule from the wire predicate, not a stricter version of the same one).
 *  Additionally excludes any pair touching a pre-run sample
 *  (`!inRun`) — the `run === null` window the production path never
 *  reaches `check` from at all (brief Step 1's explicit exclusion). */
function sweepProductionPredicate(): CountSweepResult {
  const backward: string[] = [];
  let nonSuppressedPairs = 0;
  for (const f of CORPUS_FILES) {
    const suppressed = programHasDistanceGoal(armedProgramFor(f));
    for (const { before, after } of slideCountGap(
      loadCountSamples(f),
      30_000,
    )) {
      if (before.intervalCount === undefined) continue;
      if (after.intervalCount === undefined) continue;
      if (!before.inRun || !after.inRun) continue;
      if (suppressed) continue;
      nonSuppressedPairs++;
      if (after.intervalCount < before.intervalCount) {
        backward.push(
          `${f} seq ${before.seq}->${after.seq}: count ${before.intervalCount}->${after.intervalCount}`,
        );
      }
    }
  }
  return { nonSuppressedPairs, backward };
}

describe("continuity: the count bound's suppression sweep (spec §4's conditional, decided here)", () => {
  it("WIRE predicate (per-sample workoutDurationType===128): zero backward count readings, 1,026 non-suppressed pairs exercised — the identical count PART 3's own TWD sweep measures under this same predicate (both counts happen to be present for every one of them)", () => {
    const result = sweepWirePredicate();
    if (result.backward.length > 0) {
      throw new Error(
        `${result.backward.length} backward count reading(s) under the WIRE predicate: ${result.backward.join("; ")}`,
      );
    }
    expect(result.backward).toHaveLength(0);
    // Committed floor, same discipline as PART 3's own sanity test: a
    // regression to zero pairs exercised would still pass a
    // backward-count-only assertion while proving nothing. Measured:
    // 1,026 — floor set well under, guarding against it shrinking
    // silently.
    expect(result.nonSuppressedPairs).toBeGreaterThan(1000);
  });

  it("PRODUCTION predicate (programHasDistanceGoal(run.program), constant per session): EVERY ONE of the 6 committed captures armed a program containing a distance-kind interval (cited above, per file) — this predicate suppresses the ENTIRE corpus, 0 non-suppressed pairs", () => {
    const result = sweepProductionPredicate();
    expect(result.backward).toHaveLength(0);
    // THE decisive number: not "clean," VACUOUS. Zero pairs were ever
    // compared under this predicate — every corpus file's own armed
    // program contains a distance interval, so `suppressed` is `true`
    // for all six before a single pair is even considered. A 0-pair
    // "zero backward readings" is not evidence of safety (repo rule 11 /
    // this file's own PART 3 sanity-test convention: an unexercised gate
    // proves nothing about what it guards).
    expect(result.nonSuppressedPairs).toBe(0);
  });

  it("session-2's own pre-run backward count (the leftover-register connect shape, AS2 seq 24->29, count 3->0) is excluded from the production sweep by TWO INDEPENDENT mechanisms, not one: the distance-goal suppression (session-2's own program contains a 500m interval) AND the in-run filter (workoutState reads WAITTOBEGIN at both surrounding General Status ticks, seq 27 and seq 30)", () => {
    const samples = loadCountSamples(SESSION2_FILE);
    const before = samples.find((s) => s.seq === 27);
    const after = samples.find((s) => s.seq === 30);
    if (!before || !after) {
      throw new Error(
        "session-2 seq 27/30 General Status samples not found — the pin has nothing to check",
      );
    }
    // The count itself really did go backward (3 -> 0, merged from the
    // AS2 events at seq 24 and seq 29) — this pin is not vacuous either.
    expect(before.intervalCount).toBe(3);
    expect(after.intervalCount).toBe(0);
    // Mechanism 1: distance-goal suppression (session-2's own armed
    // program, cited above, contains a 500m interval).
    expect(before.wireDistanceGoal).toBe(true);
    expect(after.wireDistanceGoal).toBe(true);
    expect(programHasDistanceGoal(armedProgramFor(SESSION2_FILE))).toBe(true);
    // Mechanism 2: the in-run filter — no run has opened yet at either
    // tick (workoutState 0, WAITTOBEGIN).
    expect(before.inRun).toBe(false);
    expect(after.inRun).toBe(false);
  });
});

// ============================================================================
// THE SWEEP'S DECISION (spec §4's conditional): KEPT, not lifted. The WIRE
// predicate alone is clean (0 backward / >100 non-suppressed pairs) — but
// it is the WRONG predicate to decide on, per the antagonist ledger entry
// cited above. The PRODUCTION predicate — the one `applyContinuityCheck`
// actually runs — is clean too, but VACUOUSLY: 0 non-suppressed pairs,
// because every committed capture's own armed program contains a
// distance-kind interval. A rule that is never exercised cannot be shown
// safe by this corpus; "0 backward readings" over "0 pairs tested" is an
// absence of evidence, not evidence of absence. `continuity.ts`'s `check`
// (Task 2 Step 3) therefore ships the count bound under the SAME
// distance-goal suppression the three-axis signature already uses — no
// new, separately-lifted rule — and this file's own header comment
// records why in the same words.
// ============================================================================
