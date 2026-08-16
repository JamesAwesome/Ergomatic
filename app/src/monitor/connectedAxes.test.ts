// The zero-behaviour-change proof for `connectedAxes.ts` (design spec §1,
// exit criterion 1): an EXHAUSTIVE table over all ten `ConnectedPhase`
// members, plus every load-bearing extra-input combination the spec names
// by name. Not a ring replay — the recorded rings carry no phase entries at
// all, and state-change-only frames make a freeze sequence unwitnessable by
// construction (spec's own note).
import { describe, expect, it } from "vitest";
import {
  deriveActivity,
  deriveAxes,
  deriveProgram,
  deriveSession,
  type AxesInput,
  type ConnectedAxes,
} from "./connectedAxes";

interface Row {
  name: string;
  phase: AxesInput["phase"];
  frozen: boolean;
  runOpen: boolean;
  failureLeavesLinkUp: boolean | null;
  expect: ConnectedAxes;
}

// One row per `ConnectedPhase` member (ten), PLUS extra rows wherever the
// spec names a load-bearing combination that a phase's default row alone
// does not exercise (the three `failed` link outcomes, both `live` freeze
// outcomes, both `disconnected` session outcomes).
const ROWS: Row[] = [
  {
    name: "idle: no link, no program, no session, activity unclaimed",
    phase: "idle",
    frozen: false,
    runOpen: false,
    failureLeavesLinkUp: null,
    expect: {
      link: "none",
      program: "none",
      session: "none",
      activity: "unknown",
    },
  },
  {
    name: "picking: the platform chooser is open — link connecting",
    phase: "picking",
    frozen: false,
    runOpen: false,
    failureLeavesLinkUp: null,
    expect: {
      link: "connecting",
      program: "none",
      session: "none",
      activity: "unknown",
    },
  },
  {
    name: 'pairing: connected, not programmed ("connect"\'s own comment) — link up',
    phase: "pairing",
    frozen: false,
    runOpen: false,
    failureLeavesLinkUp: null,
    expect: {
      link: "up",
      program: "none",
      session: "none",
      activity: "unknown",
    },
  },
  {
    name: "programming: the program is in flight to the machine",
    phase: "programming",
    frozen: false,
    runOpen: false,
    failureLeavesLinkUp: null,
    expect: {
      link: "up",
      program: "sending",
      session: "none",
      activity: "unknown",
    },
  },
  {
    name: "ready: verified armed, no rowing frame observed yet",
    phase: "ready",
    frozen: false,
    runOpen: false,
    failureLeavesLinkUp: null,
    expect: {
      link: "up",
      program: "armed",
      session: "none",
      activity: "unknown",
    },
  },
  {
    name: "failed + failureLeavesLinkUp:null — conservative, reads as lost",
    phase: "failed",
    frozen: false,
    runOpen: false,
    failureLeavesLinkUp: null,
    expect: {
      link: "lost",
      program: "failed",
      session: "none",
      activity: "unknown",
    },
  },
  {
    name: "failed + failureLeavesLinkUp:true — a genuine ProgramRejection, link up",
    phase: "failed",
    frozen: false,
    runOpen: false,
    failureLeavesLinkUp: true,
    expect: {
      link: "up",
      program: "failed",
      session: "none",
      activity: "unknown",
    },
  },
  {
    name: "failed + failureLeavesLinkUp:false — a radio/transport failure, link lost",
    phase: "failed",
    frozen: false,
    runOpen: false,
    failureLeavesLinkUp: false,
    expect: {
      link: "lost",
      program: "failed",
      session: "none",
      activity: "unknown",
    },
  },
  {
    name: "live + frozen:false — the freeze predicate has not fired, moving",
    phase: "live",
    frozen: false,
    runOpen: true,
    failureLeavesLinkUp: null,
    expect: {
      link: "up",
      program: "armed",
      session: "live",
      activity: "moving",
    },
  },
  {
    name: "live + frozen:true — activity trusts `frozen`, not `phase` alone (the seam paused retires through)",
    phase: "live",
    frozen: true,
    runOpen: true,
    failureLeavesLinkUp: null,
    expect: {
      link: "up",
      program: "armed",
      session: "live",
      activity: "frozen",
    },
  },
  {
    name: "paused: the freeze predicate fired — activity frozen",
    phase: "paused",
    frozen: true,
    runOpen: true,
    failureLeavesLinkUp: null,
    expect: {
      link: "up",
      program: "armed",
      session: "live",
      activity: "frozen",
    },
  },
  {
    name: "disconnected + runOpen:true — the record deliberately stays open, session live",
    phase: "disconnected",
    frozen: false,
    runOpen: true,
    failureLeavesLinkUp: null,
    expect: {
      link: "lost",
      program: "none",
      session: "live",
      activity: "unknown",
    },
  },
  {
    name: "disconnected + runOpen:false — no record was ever opened, session none",
    phase: "disconnected",
    frozen: false,
    runOpen: false,
    failureLeavesLinkUp: null,
    expect: {
      link: "lost",
      program: "none",
      session: "none",
      activity: "unknown",
    },
  },
  {
    name: "ended: the terminal phase, unconditionally",
    phase: "ended",
    frozen: false,
    runOpen: true,
    failureLeavesLinkUp: null,
    expect: {
      link: "up",
      program: "none",
      session: "ended",
      activity: "unknown",
    },
  },
];

describe("deriveAxes — the exhaustive table (spec §1 exit criterion 1)", () => {
  it.each(ROWS)(
    "$name",
    ({ phase, frozen, runOpen, failureLeavesLinkUp, expect: want }) => {
      expect(
        deriveAxes({ phase, frozen, runOpen, failureLeavesLinkUp }),
      ).toStrictEqual(want);
    },
  );

  it("covers all ten ConnectedPhase members exactly once each", () => {
    const covered = ROWS.map((row) => row.phase).sort();
    const distinct = [...new Set(covered)].sort();
    const allTen: AxesInput["phase"][] = [
      "idle",
      "picking",
      "pairing",
      "programming",
      "ready",
      "failed",
      "live",
      "paused",
      "disconnected",
      "ended",
    ].sort() as AxesInput["phase"][];
    expect(distinct).toStrictEqual(allTen);
  });

  it("rejects an eleventh phase at compile time (@ts-expect-error) and throws at runtime rather than laundering it", () => {
    // @ts-expect-error — "bogus" is not a real `ConnectedPhase` member; only
    // the ten enumerated ones type-check as `AxesInput["phase"]`. The
    // exhaustive `switch` + `never` guard is what makes this fail to
    // compile at all, and is also what throws below if the suppression is
    // ever exercised at runtime — no silent `?? "live"`-style fallback.
    const invalid: AxesInput["phase"] = "bogus";
    expect(() =>
      deriveAxes({
        phase: invalid,
        frozen: false,
        runOpen: false,
        failureLeavesLinkUp: null,
      }),
    ).toThrow(/unhandled ConnectedPhase/);
  });

  // `deriveAxes` calls the four sub-derivations in a fixed order and throws
  // on the FIRST one that meets an invalid phase, so the test above only
  // ever exercises `deriveLink`'s own guard — the other three would read as
  // uncovered dead code otherwise (recurring failure #2: a brand-new file
  // can ship with entire branches uncovered under the aggregate gate).
  // Each is exported and probed directly here for exactly that reason.
  const invalidPhase = "bogus" as AxesInput["phase"];

  it("deriveProgram rejects an eleventh phase rather than laundering it", () => {
    expect(() => deriveProgram(invalidPhase)).toThrow(
      /unhandled ConnectedPhase/,
    );
  });

  it("deriveSession rejects an eleventh phase rather than laundering it", () => {
    expect(() =>
      deriveSession({
        phase: invalidPhase,
        frozen: false,
        runOpen: false,
        failureLeavesLinkUp: null,
      }),
    ).toThrow(/unhandled ConnectedPhase/);
  });

  it("deriveActivity rejects an eleventh phase rather than laundering it", () => {
    expect(() =>
      deriveActivity({
        phase: invalidPhase,
        frozen: false,
        runOpen: false,
        failureLeavesLinkUp: null,
      }),
    ).toThrow(/unhandled ConnectedPhase/);
  });
});
