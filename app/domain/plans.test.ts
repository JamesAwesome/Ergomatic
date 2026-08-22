import { describe, it, expect } from "vitest";
import { PLANS, SPRINT_WEEKS, HEAD_WEEKS } from "./plans.js";
import { ONBOARDING_TITLES } from "./onboarding.js";

const TYPES = ["AN", "O2", "AT", "TR"];

describe.each(["sprint", "head"] as const)("PLANS.%s", (key) => {
  const s = PLANS[key].sessions;
  it("has 84 sessions, each a real workout type (no TEST code survives)", () => {
    expect(s).toHaveLength(84);
    expect(s.every((d) => TYPES.includes(d.type))).toBe(true);
  });
  it("places exactly three prescribed checkpoints at 6, 34, 62", () => {
    expect(s.flatMap((d, i) => (d.prescribe ? [i] : []))).toStrictEqual([
      6, 34, 62,
    ]);
  });
  it("prescribes this plan's own test on every checkpoint, ref'd by the ONBOARDING_TITLES constant, globalOnly", () => {
    const expectedTitle =
      key === "sprint" ? ONBOARDING_TITLES.k2 : ONBOARDING_TITLES.k6;
    const expectedType = key === "sprint" ? "AN" : "AT";
    for (const i of [6, 34, 62]) {
      const day = s[i];
      expect(day.type).toBe(expectedType);
      expect(day.prescribe?.ref).toStrictEqual({
        kind: "title",
        title: expectedTitle,
        globalOnly: true,
      });
      // The reason is authored WITH the prescription (spec §3.3) — a
      // non-empty sentence, so suggest() never has to invent one.
      expect(day.prescribe?.reason).toMatch(/checkpoint/i);
    }
  });
  it("uses every workout type at least 8 times", () => {
    for (const t of TYPES) {
      expect(s.filter((d) => d.type === t).length).toBeGreaterThanOrEqual(8);
    }
  });
  it("never repeats one type more than 3 in a row", () => {
    let run = 1;
    for (let i = 1; i < s.length; i++) {
      run = s[i].type === s[i - 1].type ? run + 1 : 1;
      expect(run).toBeLessThanOrEqual(3);
    }
  });
});

it("pins the O2-forward type mixes exactly (strict O2 > AT > TR > AN pyramid)", () => {
  const tally = (arr: { type: string }[]) => {
    const t: Record<string, number> = { O2: 0, AT: 0, TR: 0, AN: 0 };
    for (const d of arr) t[d.type] += 1;
    return t;
  };
  // Phase 8A: the three checkpoints are real-type days now (all six former
  // TEST slots held O2), so sprint's AN gains 3 and head's AT gains 3.
  expect(tally(PLANS.sprint.sessions)).toStrictEqual({
    O2: 34,
    AT: 23,
    TR: 14,
    AN: 13,
  });
  expect(tally(PLANS.head.sessions)).toStrictEqual({
    O2: 41,
    AT: 24,
    TR: 11,
    AN: 8,
  });
});

it("sprint back half is speed-biased; head is endurance-biased overall", () => {
  const sp = PLANS.sprint.sessions;
  const count = (arr: { type: string }[], types: string[]) =>
    arr.filter((d) => types.includes(d.type)).length;
  expect(count(sp.slice(42), ["AN", "TR"])).toBeGreaterThan(
    count(sp.slice(0, 42), ["AN", "TR"]),
  );
  const hd = PLANS.head.sessions;
  expect(count(hd, ["O2", "AT"])).toBeGreaterThan(count(hd, ["AN", "TR"]));
});

// Extra test beyond the brief: guards against the weekly templates
// degenerating into one micro-cycle copy-pasted across a preset. Checked
// on the raw week templates (pre-checkpoint-overwrite) since post-export
// the checkpoint overwrite makes a couple of weeks look artificially
// distinct.
describe.each(["sprint", "head"] as const)("%s week templates", (key) => {
  const weeks = key === "sprint" ? SPRINT_WEEKS : HEAD_WEEKS;
  it("has no two byte-identical week templates", () => {
    expect(new Set(weeks.map((w) => w.join())).size).toBe(weeks.length);
  });
});
