import { describe, expect, it } from "vitest";
import type { MonitorFrame } from "../types.js";
import {
  toActualIndex,
  toMachineIndex,
  toProgramIndex,
} from "./intervalIndex.js";

// The full observed table (interface-notes.md §18 #3, PM5 432331249,
// 2026-08-05): a clean 2x(1:00 work / 0:30 rest) session read
// work0 -> idx 0, rest-after-work0 -> idx 1, work1 -> idx 1,
// rest-after-work1 -> idx 2 (the "phantom third index" defect). Every row
// maps to OUR 0-based-per-work-interval numbering for a 2-interval program.
describe("toProgramIndex: the observed 2-interval table (interface-notes.md §18 #3)", () => {
  it.each<[string, number, MonitorFrame["state"], number]>([
    ["work0", 0, "rowing", 0],
    ["rest-after-work0", 1, "resting", 0],
    ["work1", 1, "rowing", 1],
    // The exact defect: the machine's "phantom" index 2 (no interval 2
    // exists in a 2-interval program) resolves to interval 1 — the
    // program's own last interval, whose trailing rest this actually is.
    ["rest-after-work1 (the observed defect: phantom idx 2)", 2, "resting", 1],
  ])(
    "%s: machineIndex %i, state %s -> our %i",
    (_label, machineIndex, state, expected) => {
      expect(toProgramIndex(machineIndex, state, 2)).toBe(expected);
    },
  );
});

describe("toProgramIndex: clamps at the two ends of the program", () => {
  it("a rest reported before any interval has begun (machineIndex 0) clamps to interval 0", () => {
    // candidate = 0 - 1 = -1 -- the offset rule's own lower-boundary shape.
    expect(toProgramIndex(0, "resting", 2)).toBe(0);
  });

  it("a work tick reported one past the program's last interval clamps to the last interval", () => {
    // candidate = machineIndex = programLength -- the offset rule's own
    // upper-boundary shape.
    expect(toProgramIndex(2, "rowing", 2)).toBe(1);
  });

  it("a rest tick reported one past the program's last interval (via the -1 offset) also clamps to the last interval", () => {
    // candidate = 3 - 1 = programLength(2) -- same upper-boundary shape,
    // reached through the resting branch instead of the rowing one.
    expect(toProgramIndex(3, "resting", 2)).toBe(1);
  });
});

describe("toProgramIndex: null when the value is not explained by the program's length", () => {
  it("more than one step past the last interval (rowing) is unexplainable", () => {
    expect(toProgramIndex(5, "rowing", 2)).toBeNull();
  });

  it("more than one step below zero (resting) is unexplainable", () => {
    // candidate = -1 - 1 = -2 -- two steps below the valid range, not the
    // rule's own -1 boundary shape.
    expect(toProgramIndex(-1, "resting", 2)).toBeNull();
  });
});

describe("toProgramIndex: states outside rowing/resting always return null", () => {
  it.each<MonitorFrame["state"]>(["idle", "armed", "finished", "terminated"])(
    "state=%s -> null regardless of machineIndex",
    (state) => {
      expect(toProgramIndex(0, state, 2)).toBeNull();
      expect(toProgramIndex(1, state, 2)).toBeNull();
    },
  );
});

describe("toProgramIndex: no program to explain the index against", () => {
  it("programLength 0 -> null even while rowing", () => {
    expect(toProgramIndex(0, "rowing", 0)).toBeNull();
  });

  it("a negative programLength -> null (defensive; not a shape a real WorkoutProgram produces)", () => {
    expect(toProgramIndex(0, "rowing", -1)).toBeNull();
  });
});

describe("toProgramIndex: a 1-interval program", () => {
  it("work0, rowing, machineIndex 0 -> our 0", () => {
    expect(toProgramIndex(0, "rowing", 1)).toBe(0);
  });

  it("rest-after-work0, resting, machineIndex 1 -> our 0", () => {
    expect(toProgramIndex(1, "resting", 1)).toBe(0);
  });

  it("a rest reported before interval 0 has begun (machineIndex 0) clamps to 0", () => {
    expect(toProgramIndex(0, "resting", 1)).toBe(0);
  });

  it("a work tick one past the only interval clamps to 0", () => {
    expect(toProgramIndex(1, "rowing", 1)).toBe(0);
  });

  it("more than one step past the only interval is unexplainable", () => {
    expect(toProgramIndex(2, "rowing", 1)).toBeNull();
  });
});

// The FORWARD direction (Phase 7A-fix Task 4): what `src/monitor/transports/
// fake.ts` puts on its synthetic wire. Pinned to the SAME observed table
// above, read the other way round — deliberately not asserted as
// "whatever round-trips through `toProgramIndex`", which would pass even if
// both functions shared a wrong model of the machine.
describe("toMachineIndex: the observed table, read forwards (interface-notes.md §18 #3)", () => {
  it.each<[string, number, MonitorFrame["state"], number]>([
    ["work0", 0, "rowing", 0],
    ["rest-after-work0", 0, "resting", 1],
    ["work1", 1, "rowing", 1],
    // The phantom the session actually ended on: a 2-interval program whose
    // last interval's trailing rest reported index 2.
    ["rest-after-work1 (the phantom the machine emitted)", 1, "resting", 2],
  ])(
    "%s: our %i, state %s -> machine %i",
    (_label, programIndex, state, expected) => {
      expect(toMachineIndex(programIndex, state)).toBe(expected);
    },
  );

  it("never clamps: the phantom past the end of a program is the whole point", () => {
    // A 3-interval program's last rest reports 3 — a value no interval of
    // ours has. Clamping here would delete the defect from the fake and
    // leave `toProgramIndex` nothing real to normalize.
    expect(toMachineIndex(2, "resting")).toBe(3);
    expect(toMachineIndex(24, "resting")).toBe(25);
  });

  it("a work→work boundary invents no offset — the rowing case passes through (0x0033's own no-rest reading, §19.8, matches identity)", () => {
    expect(toMachineIndex(0, "rowing")).toBe(0);
    expect(toMachineIndex(7, "rowing")).toBe(7);
  });

  it("inactive states pass through too — the machine still writes a byte into the field while armed or finished", () => {
    // Unlike `toProgramIndex`, whose `null` for these states is a business
    // rule about which of OUR intervals is current, this direction is about
    // what the wire carries — and the wire always carries something.
    expect(toMachineIndex(0, "armed")).toBe(0);
    expect(toMachineIndex(2, "finished")).toBe(2);
    expect(toMachineIndex(1, "idle")).toBe(1);
    expect(toMachineIndex(1, "terminated")).toBe(1);
  });

  it("round-trips every ACTIVE row of the observed table back through toProgramIndex", () => {
    // The property the fake-driven driver tests rely on end to end: for a
    // 2-interval program, our index -> the machine's wire value -> back to
    // ours, unchanged, for both work and rest.
    for (const programIndex of [0, 1]) {
      for (const state of ["rowing", "resting"] as const) {
        expect(
          toProgramIndex(toMachineIndex(programIndex, state), state, 2),
        ).toBe(programIndex);
      }
    }
  });
});

// Phase 7A-fix-2 Task 5 (interface-notes.md §19.8, answering §17 item 13):
// `toActualIndex` is `IntervalActual.index`'s own normalization (0x0037/38,
// the ACTUALS characteristic) — a SEPARATE rule from `toProgramIndex`'s
// (0x0033, the live-frame Interval Count, UNCHANGED by this task). The
// evidence table below is BOTH hardware readings that exist for this field,
// cited to §19.8 and Task 1's own ledger table (interface-notes.md §18,
// the [S1]/[S2] rows): one 2xTIME program, read at two different boundaries.
describe("toActualIndex: the two hardware readings (interface-notes.md §19.8)", () => {
  it.each<[string, number, MonitorFrame["state"], number, number]>([
    // [S1] final boundary (§18 #3, §19.8): the "phantom third index" — a
    // rest-keyed minus-one already explained this one.
    ["S1 final boundary: resting, the phantom", 2, "resting", 2, 1],
    // [S2] first boundary (§19.8, THE headline finding this task answers):
    // NO rest ever separated this boundary from the next interval — state
    // stayed "rowing" throughout — and the machine still forward-attributed
    // by one. Against TODAY's code (`toProgramIndex`'s rowing branch, or no
    // `toActualIndex` at all), this exact input normalizes to `1` (identity)
    // or fails to compile; `toActualIndex` must return `0`.
    [
      "S2 first boundary: rowing, no rest at all — the discriminating row",
      1,
      "rowing",
      2,
      0,
    ],
    // The pre-existing rest-preceded case, RE-PINNED as a regression: the
    // old rest-keyed rule already agreed with this one, so it must keep
    // agreeing under the new state-free rule (both apply minus-one here).
    [
      "rest-preceded first boundary: today's rule already agrees",
      1,
      "resting",
      2,
      0,
    ],
  ])(
    "%s: machine %i, state %s, len %i -> our %i",
    (_label, machineIndex, state, len, expected) => {
      expect(toActualIndex(machineIndex, state, len)).toBe(expected);
    },
  );
});

describe("toActualIndex: mid-terminate has no stable value to normalize (CSAFE-DEF footnote 12 p.25, via §19.8)", () => {
  it.each<MonitorFrame["state"]>(["idle", "armed", "finished", "terminated"])(
    "state=%s -> null regardless of machineIndex",
    (state) => {
      expect(toActualIndex(0, state, 2)).toBeNull();
      expect(toActualIndex(1, state, 2)).toBeNull();
    },
  );
});

describe("toActualIndex: no program to explain the index against", () => {
  it("programLength 0 -> null even while rowing", () => {
    expect(toActualIndex(0, "rowing", 0)).toBeNull();
  });

  it("a negative programLength -> null (defensive; not a shape a real WorkoutProgram produces)", () => {
    expect(toActualIndex(0, "rowing", -1)).toBeNull();
  });
});

describe("toActualIndex: clamps unconditionally at both ends — never null for an active state with a real program", () => {
  it("machineIndex 0 (candidate -1) clamps to interval 0", () => {
    expect(toActualIndex(0, "rowing", 2)).toBe(0);
    expect(toActualIndex(0, "resting", 2)).toBe(0);
  });

  it("a machineIndex far past the program's length still clamps to the last interval — no 'unexplainable' null here, unlike toProgramIndex", () => {
    expect(toActualIndex(9, "rowing", 3)).toBe(2);
    expect(toActualIndex(100, "resting", 3)).toBe(2);
  });
});

describe("toActualIndex: honesty check — robust to either the 0-based-forward or 1-based-completed story", () => {
  it("both readings from the ONE program shape (2xTIME) produce the same arithmetic either way this is told", () => {
    // See toActualIndex's own doc comment: "the interval that just
    // finished, 1-based" and "the interval being entered, 0-based-forward"
    // predict the identical `machineIndex - 1` subtraction for both S1 and
    // S2's readings — this test exists so a future reader trusts the
    // function's behavior over either narrative.
    expect(toActualIndex(2, "resting", 2)).toBe(1); // S1
    expect(toActualIndex(1, "rowing", 2)).toBe(0); // S2
  });
});
