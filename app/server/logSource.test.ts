import { describe, expect, it } from "vitest";
import { deriveLogSource, logSourceContradiction } from "./logSource.js";
import type { LogStep } from "./stores/logs.js";

// Just Row unconnected spec (2026-09-02), §Mechanism stored shape (c) and
// exit criterion 3b. `deriveLogSource` is the ONE inference the server
// still makes — for an old TestFlight build posting no `source` — and it
// must be the rule migration 0020's backfill CASE applies to every row that
// predates the column, so a row saved yesterday and a row derived today
// read the same word. `source.integration.test.ts` runs the migration's
// own CASE text against these same three shapes and asserts agreement.

const STOPWATCH: LogStep = {
  label: "Work",
  targetSplit: 120,
  actualSplit: 121,
  actualSource: "stopwatch",
};
const ASSUMED: LogStep = {
  label: "Work",
  targetSplit: 120,
  actualSplit: 120,
  actualSource: "assumed",
};
const PM5_STEP: LogStep = {
  label: "Work",
  targetSplit: 120,
  actualSplit: 118.4,
  actualSource: "pm5",
  actualSeconds: 300,
  actualMeters: 1267,
};

describe("deriveLogSource: the backfill rule, in TS", () => {
  it("a deviceName wins outright: pm5, whatever the steps say", () => {
    expect(
      deriveLogSource({ deviceName: "PM5 432331249 Row", steps: [PM5_STEP] }),
    ).toBe("pm5");
    // Even a device row whose steps carry a stopwatch actual (the manual
    // door after a connected session that never pulled — the very row the
    // read-side guess was wrong about) backfills as the guess did.
    expect(
      deriveLogSource({ deviceName: "PM5 432331249 Row", steps: [STOPWATCH] }),
    ).toBe("pm5");
  });

  it("no device, ANY stopwatch step: timer", () => {
    expect(
      deriveLogSource({ deviceName: null, steps: [ASSUMED, STOPWATCH] }),
    ).toBe("timer");
  });

  it("no device, no stopwatch step: manual — including the empty free-row shape", () => {
    expect(deriveLogSource({ deviceName: null, steps: [ASSUMED] })).toBe(
      "manual",
    );
    expect(deriveLogSource({ deviceName: null, steps: [] })).toBe("manual");
  });
});

describe("logSourceContradiction: a posted source must agree with the body", () => {
  it("pm5 without a deviceName is refused", () => {
    expect(
      logSourceContradiction("pm5", { deviceName: null, steps: [PM5_STEP] }),
    ).toBe("source pm5 requires a deviceName");
  });

  it("timer with a deviceName is refused", () => {
    expect(
      logSourceContradiction("timer", {
        deviceName: "PM5 432331249 Row",
        steps: [STOPWATCH],
      }),
    ).toBe("source timer requires deviceName to be absent");
  });

  it("manual with a deviceName is refused", () => {
    expect(
      logSourceContradiction("manual", {
        deviceName: "PM5 432331249 Row",
        steps: [ASSUMED],
      }),
    ).toBe("source manual requires deviceName to be absent");
  });

  it("timer with all-assumed steps PASSES — the Timer door logs every time phase as assumed (logDraft.ts), so this is every ordinary timer save", () => {
    expect(
      logSourceContradiction("timer", { deviceName: null, steps: [ASSUMED] }),
    ).toBeNull();
  });

  it("every consistent pairing passes: pm5+device, timer+stopwatch, timer+empty (the free row), manual+no device", () => {
    expect(
      logSourceContradiction("pm5", {
        deviceName: "PM5 432331249 Row",
        steps: [PM5_STEP],
      }),
    ).toBeNull();
    expect(
      logSourceContradiction("timer", { deviceName: null, steps: [STOPWATCH] }),
    ).toBeNull();
    expect(
      logSourceContradiction("timer", { deviceName: null, steps: [] }),
    ).toBeNull();
    expect(
      logSourceContradiction("manual", { deviceName: null, steps: [ASSUMED] }),
    ).toBeNull();
    expect(
      logSourceContradiction("manual", { deviceName: null, steps: [] }),
    ).toBeNull();
  });
});
