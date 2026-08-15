import { describe, expect, it } from "vitest";
import {
  peakIndex,
  pieceList,
  structureLine,
  workAndTotal,
} from "./stepDetail.js";
import type { Baselines, Step } from "../types.js";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index.js";

// One alternation covering structureLine's seven documented format shapes
// (spec §1), used by the property test below to fail on any of the 300
// real library lines that don't match ANY of them (not just "non-empty,
// no undefined/NaN" — a shape check catches a malformed join the weaker
// checks would miss). TOKEN is a full duration/meters token
// (fmtDuration's "10:00"/"1:05:00" or "500m"); TOKEN_BARE additionally
// allows the chain's own bare integers ("8"). REF is a single reference
// ("6K+10"/"6K"/"MAX"); RANGE is either a collapsed single reference or
// a two-ended range whose SLOW end always carries the base
// ("6K+4 → −2", "6K → +2") per offsetRange's own idiom (James,
// 2026-08-14: a range that names no base cannot say what the exercise
// is). Only the fast end may be a bare offset.
const TOKEN = String.raw`\d+:\d{2}(?::\d{2})?|\d+m`;
const TOKEN_BARE = String.raw`\d+:\d{2}(?::\d{2})?|\d+m|\d+`;
const REF = String.raw`(?:2K|6K)(?:[+−]\d+)?|MAX|MIN`;
const RANGE_HI = String.raw`(?:2K|6K)(?:[+−]\d+)?`;
const RANGE_LO = String.raw`2K|6K|[+−]\d+`;
const RANGE = String.raw`(?:2K|6K)(?:[+−]\d+)?|(?:${RANGE_HI}) → (?:${RANGE_LO})`;
const CLAUSE = String.raw`(?: · (?:\d+′|\d+:\d{2}) REST)?`;
const F1 = String.raw`(?:${TOKEN}) @ (?:${REF})${CLAUSE}`; // single piece
const F2 = String.raw`\d+ × (?:${TOKEN}) @ (?:${REF})${CLAUSE}`; // uniform repeats / distance
const F3 = String.raw`(?:${TOKEN}) \+ (?:${TOKEN}) @ (?:${RANGE})${CLAUSE}`; // two unequal
const F4 = String.raw`(?:${TOKEN_BARE})(?:-(?:${TOKEN_BARE})){1,7} @ (?:${RANGE})${CLAUSE}`; // chain ≤8
const F5 = String.raw`\d+ PIECES(?: @ (?:${RANGE}))?${CLAUSE}`; // count fallback
const F6 = String.raw`(?:${TOKEN}) @ (?:${REF})(?: \+ (?:${TOKEN}) @ (?:${REF}))+${CLAUSE}`; // mixed frames
const STRUCTURE_LINE_SHAPE = new RegExp(
  `^(?:${F1}|${F2}|${F3}|${F4}|${F5}|${F6})$`,
);

const B: Baselines = { k2Seconds: 118, k6Seconds: 125 };
const w = (
  min: number,
  off: number,
  spm?: number,
  restMinutes?: number,
): Step => ({
  k: "w",
  duration: { kind: "time", minutes: min },
  ref: { base: "6k", off },
  ...(spm !== undefined ? { spm } : {}),
  ...(restMinutes !== undefined ? { restMinutes } : {}),
});

describe("pieceList", () => {
  it("renders the mock's short card: two pieces, rest on the first only", () => {
    const rows = pieceList([w(18, 10, 22, 3), w(9, 6, 24)], B);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      duration: "18:00",
      refTextFull: "at 6k +10",
      restText: "3′ r",
      split: "2:15.0",
      spm: 22,
      off: 10,
    });
    expect(rows[1].restText).toBeNull();
    expect(rows[1].split).toBe("2:11.0");
  });

  it("DEVIATION: the trailing rest on the workout's TRUE FINAL piece is SHOWN — masking-immune fixture (final piece differs by duration, so it is a hard split and cannot roll under either rolling rule)", () => {
    // Review finding (2026-08-11 fix loop): a fixture where the final
    // piece is otherwise IDENTICAL (rest included) to its predecessor
    // joins via rule 1's ordinary equality — that masks a future
    // regression that suppresses the trailing rest specifically on the
    // true-final phase, because rule 2's exception would silently
    // reinterpret the suppressed (null) rest as a legitimate "no rest of
    // its own" join and carry the predecessor's rest forward, keeping
    // this assertion green either way. Differing by duration forces
    // `joinsRun`'s `sameCore` check to fail outright, so the final piece
    // is guaranteed to be its OWN row — its restText can only come from
    // this piece's own rest attachment, not from a neighbor's.
    const rows = pieceList([w(5, 4, undefined, 2), w(3, 4, undefined, 2)], B);
    expect(rows).toHaveLength(2);
    expect(rows[1].restText).toBe("2′ r");
  });

  it("two fully identical pieces (rest included) roll into one run, keeping the shared rest (rule 1 rest equality)", () => {
    const rows = pieceList([w(5, 4, undefined, 2), w(5, 4, undefined, 2)], B);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ count: 2, restText: "2′ r" });
  });

  it("a reps block expands into per-piece rows, then rolls the identical run into one (James's ruling + rule 1 rest equality)", () => {
    const steps: Step[] = [{ k: "reps", count: 3 }, w(5, 10, 24, 2)];
    const rows = pieceList(steps, B);
    expect(rows).toHaveLength(1);
    expect(rows[0].duration).toBe("5:00");
    expect(rows[0]).toMatchObject({ count: 3, restText: "2′ r" }); // authored on the step; deviation shows it, rolling collapses the 3 identical rows
  });

  it("offset 0 reads 'at 6k pace'; fractional rest uses the clock", () => {
    const rows = pieceList([w(8, 0, 28, 2.5), w(2, 4)], B);
    expect(rows[0].refTextFull).toBe("at 6k pace");
    expect(rows[0].restText).toBe("2:30 r");
  });

  it("mixed bases name each piece's own base", () => {
    const steps: Step[] = [
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "2k", off: 4 },
      },
      w(10, 8),
    ];
    const rows = pieceList(steps, B);
    expect(rows[0].refTextFull).toBe("at 2k +4");
    expect(rows[1].refTextFull).toBe("at 6k +8");
  });

  // ---- James's 2026-08-14 ruling: the base is never hoisted away ----
  // "We always need full form so people know what the exercise is, we can
  // do that without losing much compression." A rower reading "at +12"
  // cannot tell a 2k-based piece from a 6k-based one, and that is what
  // tells them the workout's character. Nothing else on Today's card
  // names the base, so the row must.

  it("Ground Fog (real seed: 5 pieces, one shared 6k base — the reported case) names 6k on EVERY row, not just the mixed-base sets", () => {
    const gf = LIBRARY_WORKOUTS.find((x) => x.title === "Ground Fog");
    expect(gf, "Ground Fog left the seeded library").toBeDefined();
    const rows = pieceList(gf!.steps, B);
    // 5 rows is what puts this card into Today's compressed layout
    // (Today.tsx's `rows.length >= 5`) — the exact condition that used to
    // strip the base. Adjacent durations differ, so rollRuns never fires.
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.refTextFull)).toStrictEqual([
      "at 6k +12",
      "at 6k +11",
      "at 6k +10",
      "at 6k +11",
      "at 6k +12",
    ]);
  });

  it("Outflow Boundary (real seed: 6 split pieces sharing 2k plus one MAX) names 2k on every split row — the effort piece is not counted as a second base", () => {
    // The retired `sharedBase` set skipped effort refs, so a set that
    // mixes one MAX into a single-base group still read as "shared" and
    // still lost its base. Six seeded workouts are that shape.
    const ob = LIBRARY_WORKOUTS.find((x) => x.title === "Outflow Boundary");
    expect(ob, "Outflow Boundary left the seeded library").toBeDefined();
    const rows = pieceList(ob!.steps, B);
    expect(rows).toHaveLength(7);
    expect(rows.map((r) => r.refTextFull)).toStrictEqual([
      "at 2k −4",
      "at 2k −4",
      "at 2k −3",
      "at 2k −3",
      "at 2k −4",
      "at 2k −4",
      null, // the MAX piece: effort word only, no ref text at all
    ]);
    expect(rows[6].effortText).toBe("ALL OUT");
  });

  it("property: not one split-ref row in the whole 300-workout library renders a bare offset — every one names its base", () => {
    const NAMED = /^at (?:2k|6k) (?:[+−]\d+|pace)$/;
    let checked = 0;
    for (const wk of LIBRARY_WORKOUTS) {
      for (const row of pieceList(wk.steps, B)) {
        if (row.refTextFull === null) continue;
        checked++;
        expect(row.refTextFull, `${wk.title}: "${row.refTextFull}"`).toMatch(
          NAMED,
        );
      }
    }
    // Guard the guard: an empty sweep passes vacuously. EXACT, not a floor
    // (review Minor-4) — the count is knowable and a floor would survive the
    // library shrinking by a third. Update it deliberately when the seed
    // changes; that is the point.
    expect(checked).toBe(845);
  });

  it("the retired compact field is GONE from the row object, not merely equal to the full one (a duplicated field drifts)", () => {
    const rows = pieceList([w(18, 10, 22, 3), w(9, 6)], B);
    expect(Object.keys(rows[0])).not.toContain("refTextCompact");
  });

  it("effort pieces: word in effortText, no split, no off", () => {
    const steps: Step[] = [
      {
        k: "w",
        duration: { kind: "time", minutes: 0.5 },
        ref: { effort: "max" },
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 2 },
        ref: { effort: "min" },
      },
    ];
    const rows = pieceList(steps, B);
    expect(rows[0]).toMatchObject({
      effortText: "ALL OUT",
      split: null,
      off: null,
    });
    expect(rows[1].effortText).toBe("EASY");
  });

  it("distance pieces put meters in the duration slot and price the split", () => {
    const steps: Step[] = [
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "6k", off: -4 },
        restMinutes: 1,
      },
    ];
    const rows = pieceList(steps, B);
    expect(rows[0].duration).toBe("500m");
    expect(rows[0].split).toBe("2:01.0");
  });

  it("a standalone r step attaches to the preceding piece", () => {
    const steps: Step[] = [w(18, 10), { k: "r", minutes: 3 }, w(9, 6)];
    const rows = pieceList(steps, B);
    expect(rows[0].restText).toBe("3′ r");
    expect(rows[1].restText).toBeNull();
  });

  it("a test step is a row: label in the duration slot, nothing else", () => {
    const steps: Step[] = [
      w(10, 8, undefined, 2),
      { k: "test", label: "All out" },
    ];
    const rows = pieceList(steps, B);
    expect(rows[1]).toMatchObject({
      duration: "All out",
      refTextFull: null,
      effortText: null,
      split: null,
    });
  });

  it("a leading rest (nothing precedes it) is dropped, not attached forward", () => {
    const steps: Step[] = [{ k: "r", minutes: 5 }, w(10, 8)];
    const rows = pieceList(steps, B);
    expect(rows).toHaveLength(1);
    expect(rows[0].restText).toBeNull();
  });

  it("two consecutive rests on one piece: the first shown wins", () => {
    const steps: Step[] = [w(5, 4, undefined, 2), { k: "r", minutes: 3 }];
    const rows = pieceList(steps, B);
    expect(rows).toHaveLength(1);
    expect(rows[0].restText).toBe("2′ r");
  });
});

describe("pieceList rolls consecutive identical runs (2026-08-11 spec)", () => {
  const wm = (
    meters: number,
    off: number,
    spm?: number,
    restMinutes?: number,
  ): Step => ({
    k: "w",
    duration: { kind: "distance", meters },
    ref: { base: "6k", off },
    ...(spm !== undefined ? { spm } : {}),
    ...(restMinutes !== undefined ? { restMinutes } : {}),
  });

  it("the Ostro shape (real library entry, at.ts:1371): nine identical 1000m pieces roll to ONE row", () => {
    // CONTROLLER NOTE (verified against the real seed, not the brief's
    // reconstruction): Ostro's nine pieces come from ONE authored "w" step
    // repeated via a single "reps" marker, so restMinutes:1 is on EVERY
    // repetition including the ninth — expand.ts's phases() (the "w" case's
    // unconditional `if (s.restMinutes) out.push(rest...)`, no last-phase
    // special-case) emits a rest phase after the 9th work phase exactly as
    // it does after the first 8, and pieceList's rest-attachment is equally
    // unconditional (this file's own "DEVIATION: a trailing rest on the
    // last piece is SHOWN" case above proves the general rule). So the
    // real ninth row's restText is "1′ r", THE SAME as rows 1-8 — it is
    // NOT restless. This run therefore joins entirely via rule 1 (every
    // field, including rest, already equal); the trailing-rest EXCEPTION
    // (rule 2) is never reached by this fixture. The design spec's own
    // prose ("ninth restless") does not match the computed model here —
    // see the task report. Rule 2's positive branch is covered by the
    // dedicated test below instead.
    const ostro = LIBRARY_WORKOUTS.find((wk) => wk.title === "Ostro");
    if (!ostro) throw new Error("fixture: Ostro missing from LIBRARY_WORKOUTS");
    const rows = pieceList(ostro.steps, B);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      count: 9,
      duration: "1000m",
      restText: "1′ r",
      spm: 26,
      off: 2,
    });
  });

  it("a final piece with NO trailing rest joins the run before it (rule 2, the trailing-rest exception, positive branch)", () => {
    const steps: Step[] = [
      wm(500, 4, undefined, 1),
      wm(500, 4, undefined, 1),
      wm(500, 4), // final piece, same core, but authored with no rest at all
    ];
    const rows = pieceList(steps, B);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ count: 3, restText: "1′ r" });
  });

  it("a rest boundary splits runs: identical pieces back-to-back then rested", () => {
    const steps: Step[] = [
      wm(500, 4),
      wm(500, 4, undefined, 1),
      wm(500, 4, undefined, 1),
    ];
    // piece 1 has NO rest after it, pieces 2-3 rest 1′ — piece 1 cannot
    // join the rested run (rule 1); pieces 2 and 3 carry equal rest (1′
    // each) and join by ordinary equality.
    const rows = pieceList(steps, B);
    expect(rows).toHaveLength(2);
    expect(rows[0].count).toBe(1);
    expect(rows[0].restText).toBeNull();
    expect(rows[1]).toMatchObject({ count: 2, restText: "1′ r" });
  });

  it("a final piece with a DIFFERENT trailing rest does not join", () => {
    const steps: Step[] = [wm(500, 4, undefined, 1), wm(500, 4, undefined, 3)];
    const rows = pieceList(steps, B);
    expect(rows).toHaveLength(2);
    expect(rows[1].restText).toBe("3′ r");
  });

  it("lead + repeated block: 2:00 then 3 × 5:00 gives two rows", () => {
    const steps: Step[] = [
      w(2, 6, 22, 2),
      { k: "reps", count: 3 },
      w(5, 6, 22, 2),
    ];
    const rows = pieceList(steps, B);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ count: 1, duration: "2:00" });
    expect(rows[1]).toMatchObject({ count: 3, duration: "5:00" });
  });

  it("a pyramid has no runs: seven rows, all count 1", () => {
    const rows = pieceList(
      [
        w(2, 6, 22, 2),
        w(4, 4, 24, 2),
        w(6, 2, 26, 2),
        w(8, 0, 28, 2),
        w(6, 2, 26, 2),
        w(4, 4, 24, 2),
        w(2, 6, 22),
      ],
      B,
    );
    expect(rows).toHaveLength(7);
    expect(rows.every((r) => r.count === 1)).toBe(true);
  });

  it("an effort run rolls; an spm mismatch splits", () => {
    const eff = (min: number, spm?: number): Step => ({
      k: "w",
      duration: { kind: "time", minutes: min },
      ref: { effort: "max" },
      ...(spm !== undefined ? { spm } : {}),
      restMinutes: 1,
    });
    expect(pieceList([eff(0.75), eff(0.75), eff(0.75)], B)).toHaveLength(1);
    expect(pieceList([eff(0.75, 28), eff(0.75, 30)], B)).toHaveLength(2);
  });

  it("test rows never roll, even when identical", () => {
    const steps: Step[] = [
      { k: "test", label: "All out" },
      { k: "test", label: "All out" },
    ];
    const rows = pieceList(steps, B);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.count === 1)).toBe(true);
  });

  it("peak can land on a rolled row", () => {
    const steps: Step[] = [
      w(2, 6, 22, 2),
      { k: "reps", count: 3 },
      w(5, 0, 26, 2),
    ];
    const rows = pieceList(steps, B);
    expect(peakIndex(rows, 4)).toBe(1); // the rolled 3×5:00 at offset 0
  });
});

describe("peakIndex", () => {
  it("min |off| among the visible window, ties to the LATER row", () => {
    const rows = pieceList(
      [
        w(2, 6, 22, 2),
        w(4, 4, 24, 2),
        w(6, 2, 26, 2),
        w(8, 0, 28, 2),
        w(6, 2, 26, 2),
        w(4, 4, 24, 2),
        w(2, 6, 22),
      ],
      B,
    );
    expect(peakIndex(rows, 4)).toBe(3); // the mock's 04-of-7
    expect(peakIndex(rows, rows.length)).toBe(3); // 0 beats the +2 tie rule
  });
  it("an actual tie in |off| (equal magnitude, opposite sign) goes to the LATER row", () => {
    // The symmetric-pyramid test above never exercises the tie branch
    // itself: its unique off-0 row always wins outright (0 < 2 is a
    // strict win, not a tie), so a `<=`→`<` mutant survives it. This one
    // has no unique minimum — both rows tie at |off| = 2.
    const rows = pieceList([w(5, 2, 22, 2), w(5, -2, 24)], B);
    expect(peakIndex(rows, 2)).toBe(1);
  });
  it("peak behind the cap means NO tint; all-effort means NO tint", () => {
    const rows = pieceList(
      [
        w(2, 8, 22, 2),
        w(4, 6, 24, 2),
        w(6, 4, 26, 2),
        w(8, 6, 28, 2),
        w(6, 0, 26),
      ],
      B,
    );
    expect(peakIndex(rows, 4)).toBeNull(); // true peak (off 0) is row 5
    const effort = pieceList(
      [
        {
          k: "w",
          duration: { kind: "time", minutes: 1 },
          ref: { effort: "max" },
          restMinutes: 1,
        },
        {
          k: "w",
          duration: { kind: "time", minutes: 1 },
          ref: { effort: "max" },
        },
      ],
      B,
    );
    expect(peakIndex(effort, 2)).toBeNull();
  });
});

describe("workAndTotal", () => {
  it("the mock's arithmetic: 18+9 work, +3 rest", () => {
    expect(workAndTotal([w(18, 10, 22, 3), w(9, 6, 24)], B)).toStrictEqual({
      workMinutes: 27,
      totalMinutes: 30,
    });
  });
  it("WORK + displayed rests equals TOTAL under the deviation", () => {
    const steps = [w(5, 4, undefined, 2), w(5, 4, undefined, 2)];
    const { workMinutes, totalMinutes } = workAndTotal(steps, B);
    expect(totalMinutes - workMinutes).toBe(4); // both rests, trailing included
  });
  it("a test step has no seconds to estimate: contributes 0 to WORK", () => {
    const steps: Step[] = [
      w(10, 8, undefined, 2),
      { k: "test", label: "All out" },
    ];
    expect(workAndTotal(steps, B)).toStrictEqual({
      workMinutes: 10,
      totalMinutes: 12,
    });
  });
});

describe("structureLine", () => {
  const line = (steps: Step[]) => structureLine(steps);

  it("format 1, single piece", () => {
    expect(line([w(10, 14)])).toBe("10:00 @ 6K+14");
  });
  it("format 2, uniform repeats via reps marker and via identical pieces", () => {
    expect(line([{ k: "reps", count: 3 }, w(5, 10, undefined, 2)])).toBe(
      "3 × 5:00 @ 6K+10 · 2′ REST",
    );
    expect(line([w(4, 12, undefined, 1), w(4, 12)])).toBe(
      "2 × 4:00 @ 6K+12 · 1′ REST",
    );
  });
  it("format 3, two unequal pieces: offsets-only range, zero renders the base", () => {
    expect(line([w(18, 10, undefined, 3), w(9, 6)])).toBe(
      "18:00 + 9:00 @ 6K+10 → +6 · 3′ REST",
    );
    expect(line([w(18, 6, undefined, 3), w(9, 0)])).toBe(
      "18:00 + 9:00 @ 6K+6 → 6K · 3′ REST",
    );
  });
  it("mixed-sign offset range renders both signs", () => {
    expect(line([w(6, 4, undefined, 2), w(4, -2)])).toBe(
      "6:00 + 4:00 @ 6K+4 → −2 · 2′ REST",
    );
  });
  it("format 4-vs-5 precedence boundary: exactly 8 pieces chains, 9 falls to count form", () => {
    const eight = [1, 2, 3, 4, 5, 6, 7, 8].map((o) => w(2, o));
    expect(line(eight)).toBe("2-2-2-2-2-2-2-2 @ 6K+8 → +1");
    const nine = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((o) => w(2, o));
    expect(line(nine)).toBe("9 PIECES @ 6K+9 → +1");
  });
  it("format 4, chain ≤8 with max→min range; fractional minutes as clock", () => {
    expect(
      line([
        w(2, 6, undefined, 2),
        w(4, 4, undefined, 2),
        w(6, 2, undefined, 2),
        w(8, 0, undefined, 2),
        w(6, 2, undefined, 2),
        w(4, 4, undefined, 2),
        w(2, 6),
      ]),
    ).toBe("2-4-6-8-6-4-2 @ 6K+6 → 6K · 2′ REST");
    expect(line([w(4.5, 4, undefined, 1), w(2, 2)])).toBe(
      "4:30 + 2:00 @ 6K+4 → +2 · 1′ REST",
    );
  });
  it("format 5, count fallback past 8 pieces (range kept when split refs exist)", () => {
    const steps: Step[] = [
      { k: "reps", count: 4 },
      w(2, 8, undefined, 1),
      w(1, 2, undefined, 1),
      w(3, 4, undefined, 1),
    ];
    expect(line(steps)).toBe("12 PIECES @ 6K+8 → +2 · 1′ REST");
  });
  it("format 6, mixed frames name each base; effort prints its word", () => {
    const steps: Step[] = [
      {
        k: "w",
        duration: { kind: "time", minutes: 4 },
        ref: { base: "2k", off: 4 },
        restMinutes: 2,
      },
      w(10, 8),
    ];
    expect(line(steps)).toBe("4:00 @ 2K+4 + 10:00 @ 6K+8 · 2′ REST");
    expect(
      line([
        {
          k: "w",
          duration: { kind: "time", minutes: 5 },
          ref: { effort: "max" },
          restMinutes: 3,
        },
        w(10, 8),
      ]),
    ).toBe("5:00 @ MAX + 10:00 @ 6K+8 · 3′ REST");
  });
  it("format 7, distance", () => {
    const steps: Step[] = [
      { k: "reps", count: 8 },
      {
        k: "w",
        duration: { kind: "distance", meters: 500 },
        ref: { base: "6k", off: -4 },
        restMinutes: 1,
      },
    ];
    expect(line(steps)).toBe("8 × 500m @ 6K−4 · 1′ REST");
  });
  it("unequal rests drop the rest clause; a test step forces the count form", () => {
    expect(line([w(4, 8, undefined, 2), w(4, 8, undefined, 1), w(4, 8)])).toBe(
      "3 × 4:00 @ 6K+8",
    );
    expect(
      line([w(10, 8, undefined, 2), { k: "test", label: "All out" }]),
    ).toBe("2 PIECES @ 6K+8 · 2′ REST");
  });
  it("a leading rest with nothing to attach to is dropped; nothing left renders empty", () => {
    expect(line([{ k: "r", minutes: 5 }])).toBe("");
  });
  it("REGRESSION (Stratocumulus): an interior gap with no rest is not equal to a present one — the clause drops entirely", () => {
    // 3 × (8' no-rest + 8' rest2): the gaps BETWEEN consecutive pieces are
    // [none, 2', none, 2', none] — not uniform, so no clause, even though
    // every rest that IS present happens to be 2'. The old code filtered
    // out the nulls before checking equality and wrongly claimed a
    // uniform "· 2′ REST".
    const steps: Step[] = [
      { k: "reps", count: 3 },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 11 },
        spm: 22,
      },
      {
        k: "w",
        duration: { kind: "time", minutes: 8 },
        ref: { base: "6k", off: 11 },
        spm: 24,
        restMinutes: 2,
      },
    ];
    expect(line(steps)).toBe("8-8-8-8-8-8 @ 6K+11");
  });
  it("a present-but-unequal trailing rest also drops the clause", () => {
    // Interior gaps (after piece 1, after piece 2) are both 2' — uniform.
    // The trailing rest (after the last piece) is PRESENT but 3', not 2':
    // the clause must still drop, not silently show one of the two values.
    const steps: Step[] = [
      w(5, 4, undefined, 2),
      w(5, 4, undefined, 2),
      w(5, 4, undefined, 3),
    ];
    expect(line(steps)).toBe("3 × 5:00 @ 6K+4");
  });
  // ---- James's 2026-08-14 ruling, the Library half ----
  // The offset range used to print `+12 → +10` and drop the base
  // entirely; 94 of the 300 seeded lines carried no base token at all.
  // The base is now named ONCE, on the slow end, in refToken's existing
  // uppercase idiom (`6K+12`) — two characters, no new token shape.

  it("Ground Fog's real Library line names its base on the slow end of the range (was '4-6-8-6-4 @ +12 → +10 · 1′ REST')", () => {
    const gf = LIBRARY_WORKOUTS.find((x) => x.title === "Ground Fog");
    expect(gf, "Ground Fog left the seeded library").toBeDefined();
    expect(structureLine(gf!.steps)).toBe("4-6-8-6-4 @ 6K+12 → +10 · 1′ REST");
  });

  it("Gale Warning — the LONGEST range line in the seeded library — takes the base too (worst-case width case)", () => {
    const gw = LIBRARY_WORKOUTS.find((x) => x.title === "Gale Warning");
    expect(gw, "Gale Warning left the seeded library").toBeDefined();
    expect(structureLine(gw!.steps)).toBe(
      "1000m-500m-1000m-500m-1000m-500m @ 2K+1 → −1 · 2:30 REST",
    );
  });

  it("Puelche: the count fallback's range carries the base as well, not just the chain forms", () => {
    const pu = LIBRARY_WORKOUTS.find((x) => x.title === "Puelche");
    expect(pu, "Puelche left the seeded library").toBeDefined();
    expect(structureLine(pu!.steps)).toBe("10 PIECES @ 6K+14 → +8");
  });

  it("a zero-offset SLOW end still renders as the bare base, unprefixed (there is nothing to prefix)", () => {
    // offs [0, −4]: hi is 0, so the slow end IS the base already. The
    // prefix rule must not manufacture "6K+0".
    expect(line([w(6, 0, undefined, 2), w(4, -4)])).toBe(
      "6:00 + 4:00 @ 6K → −4 · 2′ REST",
    );
  });

  it("property: no line in the 300-workout library that has a split ref fails to name a base", () => {
    let checked = 0;
    for (const wk of LIBRARY_WORKOUTS) {
      const hasSplitRef = wk.steps.some((s) => s.k === "w" && "base" in s.ref);
      if (!hasSplitRef) continue;
      checked++;
      // Anchored on the RANGE and collapsed forms specifically: a bare
      // /2K|6K/ (review Minor-4) also passes on a line whose only base
      // token sits in an unrelated position, which is not the claim.
      expect(structureLine(wk.steps), `${wk.title}`).toMatch(/@ [26]K/);
    }
    // Guard the guard, exact for the reason above.
    expect(checked).toBe(268);
  });

  it("property: every one of the 300 real workouts matches one of the seven format shapes", () => {
    for (const wk of LIBRARY_WORKOUTS) {
      const out = structureLine(wk.steps);
      expect(out.length, `${wk.title}`).toBeGreaterThan(0);
      expect(out, `${wk.title}`).not.toMatch(/undefined|NaN/);
      expect(out, `${wk.title}: "${out}"`).toMatch(STRUCTURE_LINE_SHAPE);
    }
  });
});
