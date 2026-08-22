import { describe, it, expect } from "vitest";
import { planPrescription, resolvePrescribed } from "./prescription.js";
import { PLANS } from "./plans.js";
import { ONBOARDING_TITLES } from "./onboarding.js";
import { GLOBAL_LIBRARY_SEED } from "../server/seed/library/index.js";

describe("planPrescription", () => {
  it("returns the checkpoint day's own prescription at a checkpoint index", () => {
    const p = planPrescription(PLANS.sprint, 6);
    expect(p?.ref).toStrictEqual({
      kind: "title",
      title: ONBOARDING_TITLES.k2,
      globalOnly: true,
    });
    expect(p?.reason).toMatch(/checkpoint/i);
  });

  it("returns null on an ordinary (non-checkpoint) day", () => {
    expect(planPrescription(PLANS.sprint, 0)).toBeNull();
    expect(planPrescription(PLANS.head, 7)).toBeNull();
  });

  it("returns null past the end of the plan (doneN can reach 84)", () => {
    expect(planPrescription(PLANS.sprint, 84)).toBeNull();
    expect(planPrescription(PLANS.sprint, 9999)).toBeNull();
  });
});

describe("resolvePrescribed", () => {
  const global = (title: string) => ({ title, isGlobal: true });
  const custom = (title: string) => ({ title, isGlobal: false });
  const ref = (title: string, globalOnly = true) =>
    ({ kind: "title", title, globalOnly }) as const;

  it("finds the designated GLOBAL row, never a rower's own workout sharing the title", () => {
    // The custom collision is listed FIRST so a naive first-title-match
    // would return the wrong row.
    const rows = [custom("First 2k"), global("First 2k")];
    expect(resolvePrescribed(ref("First 2k"), rows)).toBe(rows[1]);
  });

  it("returns null when only a rower's own same-titled workout exists (globalOnly refs never fall back to it)", () => {
    expect(resolvePrescribed(ref("First 2k"), [custom("First 2k")])).toBeNull();
  });

  it("returns null when nothing carries the title at all", () => {
    expect(resolvePrescribed(ref("Missing"), [global("First 2k")])).toBeNull();
  });

  it("a non-globalOnly ref may resolve to a rower's own row (8C's future shape)", () => {
    const rows = [custom("Mine")];
    expect(resolvePrescribed(ref("Mine", false), rows)).toBe(rows[0]);
  });
});

// Authored content naming a missing workout fails CI instead of degrading
// quietly (spec §6): every prescribe ref in PLANS must resolve against the
// real seed converge input, GLOBAL_LIBRARY_SEED — the exact rows
// seedGlobalLibrary lands as global (user_id null) workouts.
describe("every authored ref in PLANS resolves against GLOBAL_LIBRARY_SEED", () => {
  const seedRows = GLOBAL_LIBRARY_SEED.map((w) => ({
    title: w.title,
    isGlobal: true,
  }));

  it.each(["sprint", "head"] as const)("%s", (key) => {
    const refs = PLANS[key].sessions.flatMap((d) =>
      d.prescribe ? [d.prescribe.ref] : [],
    );
    expect(refs).toHaveLength(3);
    for (const ref of refs) {
      expect(resolvePrescribed(ref, seedRows)).not.toBeNull();
    }
  });
});
