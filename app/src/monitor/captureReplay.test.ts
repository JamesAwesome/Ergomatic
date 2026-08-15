// CR2 spec 1, Task 9 — the capture-replay rung, honestly scoped.
//
// `docs/monitor/sessions/*.log.gz` holds three gzipped, bridge-mirrored lab
// logs (`docs/monitor/sessions/README.md`) — every `[event]` line the PM5
// driver actually emitted at the erg, byte-for-byte. Before this file, 25,511
// of those captured frames (5,505 + 9,598 + 10,408 — see the containment
// describe block below for why summing across files is legitimate evidence
// here and nowhere else) were read by no test at all.
//
// ============================================================================
// WHAT THIS FILE CANNOT DO — read this before adding anything to it
// ============================================================================
//
// A replay of these captures CANNOT exercise the register map
// (`src/monitor/driver.ts`'s session-register / `toProgramIndex` machinery),
// for three independent reasons. Rediscovering any one of these has cost a
// day before; that is why they are written down here instead of in a commit
// message.
//
//   1. The captures store DECODED `MonitorFrame` JSON, not wire bytes. There
//      is no 0x0031/0x0033 buffer to feed a codec — only the already-parsed
//      shape on the other side of it.
//   2. The re-encode harness that CAN produce wire bytes
//      (`src/monitor/transports/fake.ts`) zero-fills 0x0033. Round-tripping
//      a captured frame through it would prove the harness agrees with
//      itself, not that the driver decodes a real PM5 correctly.
//   3. A replay never calls `program()`. Without an armed program,
//      `programLength` is 0, and `toProgramIndex`
//      (`../../domain/monitor/pm5/intervalIndex.ts:167`,
//      `if (programLength <= 0) return null;`) returns `null` before it
//      ever looks at `machineState`. Every index a replay could produce
//      would be `null` by construction, which would prove nothing about the
//      normalization rule the function exists to apply.
//
// Consequently: do NOT attempt to drive `createPm5Driver` from these
// captures, and do NOT synthesize a machine index by inverting the recorded
// `intervalIndex` through `toMachineIndex` — that reconstructs the very
// wire byte reason (2) says we don't have, from the value the driver
// produced, which is the exact tautology `intervalIndex.ts:32-46` documents
// and this task exists to avoid repeating. Everything below asserts
// FRAME-LEVEL invariants only: relationships between `elapsedSeconds`,
// `distanceMeters`, `intervalIndex` and `state` that hold across the
// captured record with no program and no register map involved.
//
// ============================================================================
// ONE CAPTURE, NOT THREE
// ============================================================================
//
// `docs/monitor/sessions/README.md` already says session3's file is a
// byte-identical prefix of what became session 4's record. The "capture
// containment" describe block below asserts this mechanically (not just for
// session3, but for all three files pairwise) so any future claim of "three
// independent captures/confirmations" fails a test instead of quietly
// re-entering the record. Every invariant below is therefore checked against
// `pm5-session4b-final.log.gz` alone — the full record — never summed
// across files as if they were separate evidence.
//
// ============================================================================
// THE ORACLE RECIPE (spec exit criterion 4) — binding, not a style choice
// ============================================================================
//
// The drop-population classification below groups frames by RESET DETECTION:
// an elapsed-time drop of more than 2s where `distanceMeters` ALSO drops is a
// real reset; where `distanceMeters` stands exactly still, it is not. That
// classification reads `elapsedSeconds`, `distanceMeters` and `state` only.
//
// `intervalIndex` MUST NOT appear anywhere in `findDrops`/`isRealReset`
// below. "Group by each interval's own final pre-reset reading" has a second, natural
// reading — group frames by their recorded `MonitorFrame.intervalIndex` —
// and that reading is wrong to use here: `intervalIndex` is ITSELF derived
// (by `toProgramIndex`) from the same `elapsedSeconds`/`distanceMeters`/
// `state` triple this test is trying to independently characterize. An
// oracle built from `intervalIndex` would agree with the implementation by
// construction, not because the classification is correct — precisely the
// tautology this repo has shipped before (see `intervalIndex.ts`'s own
// header comment on `toMachineIndex`/`toProgramIndex` being kept as two
// independently-written functions for the same reason).

import { describe, expect, it } from "vitest";
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";

/** The subset of a captured `MonitorFrame` these invariants need. Deliberately
 *  narrower than `domain/monitor/types.ts`'s `MonitorFrame` — this file reads
 *  raw capture JSON, not a typed driver output, and only touches the fields
 *  named in the oracle recipe above plus `intervalIndex` for the terminated-
 *  frame invariant. */
interface CapturedFrame {
  elapsedSeconds: number;
  distanceMeters: number;
  intervalIndex: number | null;
  state: string;
}

/** Repo-level captures, resolved relative to THIS file so the test works
 *  regardless of the process's cwd (`pnpm test` invocations run from
 *  `app/`, but nothing here should depend on that). Plain string surgery on
 *  `import.meta.url`, not the global `URL` constructor: this project's
 *  jsdom environment resolves `new URL(...)` against `http://localhost:3000/`
 *  instead of the given `file://` base — the same quirk
 *  `ConnectedSurface.test.tsx`'s `indexCssPath` and `TimerTargets.test.tsx`
 *  work around. `docs/monitor/sessions/` lives three directories above
 *  `app/src/monitor/` — up out of `monitor/`, `src/`, and `app/` to the repo
 *  root. */
const SESSIONS_DIR = import.meta.url
  .replace(/^file:\/\//, "")
  .replace(
    /src\/monitor\/captureReplay\.test\.ts$/,
    "../docs/monitor/sessions/",
  );

/** Gunzip + parse ONE `.log.gz` capture into its ordered `[event]` frame
 *  lines. Lines that are not a frame event — `>>> dispatched: ...`, `remote:
 *  ...`, `program(...)` narration, acks, structure/programmed/notify/write
 *  events, and anything that fails to parse as JSON at all — are skipped.
 *  Only ever called once per file (module scope below), never per test: with
 *  ~10.4k frames in the largest capture, gunzip+parse is fast but is not
 *  worth repeating per assertion. */
function parseFrames(fileName: string): {
  raw: Buffer;
  frames: CapturedFrame[];
} {
  const raw = gunzipSync(readFileSync(`${SESSIONS_DIR}${fileName}`));
  const text = raw.toString("utf8");
  const frames: CapturedFrame[] = [];
  for (const line of text.split("\n")) {
    if (!line.startsWith("[event] ")) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line.slice("[event] ".length));
    } catch {
      continue;
    }
    const event = parsed as { kind?: string; frame?: CapturedFrame };
    if (event.kind !== "frame" || !event.frame) continue;
    frames.push(event.frame);
  }
  return { raw, frames };
}

// Parsed once, at module scope, and shared by every test below.
const session3 = parseFrames("pm5-session3-final.log.gz");
const session4a = parseFrames("pm5-session4a-final.log.gz");
const session4b = parseFrames("pm5-session4b-final.log.gz");

/** Elapsed-drop threshold, matching the driver's own `SESSION_RESET_ELAPSED_
 *  DROP` (`src/monitor/driver.ts`) — a drop of MORE than this many seconds
 *  between consecutive frames is a candidate boundary. */
const ELAPSED_DROP_THRESHOLD_SECONDS = 2;

interface Drop {
  prev: CapturedFrame;
  cur: CapturedFrame;
  elapsedDropSeconds: number;
}

/** Every consecutive frame pair whose `elapsedSeconds` drops by more than
 *  the threshold. `intervalIndex` is never read here — see "THE ORACLE
 *  RECIPE" above. */
function findDrops(frames: CapturedFrame[]): Drop[] {
  const drops: Drop[] = [];
  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1]!;
    const cur = frames[i]!;
    const elapsedDropSeconds = prev.elapsedSeconds - cur.elapsedSeconds;
    if (elapsedDropSeconds > ELAPSED_DROP_THRESHOLD_SECONDS) {
      drops.push({ prev, cur, elapsedDropSeconds });
    }
  }
  return drops;
}

/** RESET DETECTION, per the oracle recipe: `distanceMeters` also dropping
 *  means a real reset; `distanceMeters` standing exactly still means it is
 *  not one. Every drop in this record is one of these two shapes — no drop
 *  ever shows distance INCREASING across the boundary, so "stands still" and
 *  "does not decrease" are equivalent here and the binary split is exhaustive
 *  (verified against the data, not assumed). Reads `distanceMeters` only —
 *  never `intervalIndex`. */
function isRealReset(drop: Drop): boolean {
  return drop.cur.distanceMeters < drop.prev.distanceMeters;
}

describe("capture containment: one capture, not three", () => {
  // README.md already says this in prose. These assertions make the claim
  // mechanically checked, so a future edit that only touches one file (or a
  // future claim of "three independent captures/confirmations") fails a
  // test instead of silently drifting from what the files actually contain.

  it("session3 is a byte-for-byte prefix of session4a", () => {
    const prefix = session4a.raw.subarray(0, session3.raw.length);
    expect(prefix.equals(session3.raw)).toBe(true);
  });

  it("session4a is a byte-for-byte prefix of session4b", () => {
    const prefix = session4b.raw.subarray(0, session4a.raw.length);
    expect(prefix.equals(session4a.raw)).toBe(true);
  });

  it("raw frame counts are consistent with one growing capture, not three independent ones", () => {
    // Not independent evidence of anything on its own (a coincidence could
    // produce ordering without containment) — corroborates the byte-prefix
    // assertions above using the same frame counts the commit record cites
    // (5,505 + 9,598 + 10,408 = 25,511 raw frames across the three files,
    // despite only 10,408 DISTINCT frames existing).
    expect(session3.frames.length).toBe(5505);
    expect(session4a.frames.length).toBe(9598);
    expect(session4b.frames.length).toBe(10408);
    expect(
      session3.frames.length +
        session4a.frames.length +
        session4b.frames.length,
    ).toBe(25511);
    expect(session3.frames.length).toBeLessThan(session4a.frames.length);
    expect(session4a.frames.length).toBeLessThan(session4b.frames.length);
  });
});

describe("terminated frames carry no interval identity", () => {
  it("every terminated frame in the full record has intervalIndex: null, zero exceptions", () => {
    const terminated = session4b.frames.filter((f) => f.state === "terminated");
    // Guard against a vacuous pass: if the capture stopped carrying
    // terminated frames, this test would trivially "pass" over zero frames.
    expect(terminated.length).toBeGreaterThan(0);

    const withNonNullIndex = terminated.filter((f) => f.intervalIndex !== null);
    expect(withNonNullIndex).toStrictEqual([]);
  });
});

describe("drop-population classification (reset detection, never intervalIndex)", () => {
  const drops = findDrops(session4b.frames);
  const realResets = drops.filter(isRealReset);
  const nonReset = drops.filter((d) => !isRealReset(d));
  const nonResetWithDistance = nonReset.filter((d) => d.cur.distanceMeters > 0);

  it("classifies 25 threshold-crossing drops in pm5-session4b: 16 real resets, 9 non-reset", () => {
    expect(drops.length).toBe(25);
    expect(realResets.length).toBe(16);
    expect(nonReset.length).toBe(9);
  });

  it("6 of the 9 non-reset drops carry real distance, and all 6 land in state: terminated", () => {
    expect(nonResetWithDistance.length).toBe(6);
    for (const drop of nonResetWithDistance) {
      expect(drop.cur.state).toBe("terminated");
    }
  });

  it("the bad-drop span (10.90-87.09s) overlaps the real-reset span (14.14-156.76s) — no scalar threshold separates them", () => {
    const badSpans = nonResetWithDistance
      .map((d) => d.elapsedDropSeconds)
      .sort((a, b) => a - b);
    const resetSpans = realResets
      .map((d) => d.elapsedDropSeconds)
      .sort((a, b) => a - b);

    expect(Math.min(...badSpans)).toBeCloseTo(10.9, 2);
    expect(Math.max(...badSpans)).toBeCloseTo(87.09, 2);
    expect(Math.min(...resetSpans)).toBeCloseTo(14.14, 2);
    expect(Math.max(...resetSpans)).toBeCloseTo(156.76, 2);

    // The overlap fact itself: at least one bad drop falls strictly inside
    // the real-reset span. This is what makes the constant untunable — a
    // scalar threshold moved up to exclude the smallest bad drops (10.90,
    // 11.41, 12.06, 12.13) would also have to exclude 16.03 and 87.09,
    // which sit inside the real-reset range and would delete real resets
    // too.
    const resetMin = Math.min(...resetSpans);
    const resetMax = Math.max(...resetSpans);
    const overlapping = badSpans.filter((s) => s > resetMin && s < resetMax);
    expect(overlapping.length).toBe(2);
    expect(overlapping.map((s) => Number(s.toFixed(2)))).toStrictEqual([
      16.03, 87.09,
    ]);
  });
});
