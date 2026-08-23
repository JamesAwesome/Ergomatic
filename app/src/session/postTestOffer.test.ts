import { describe, expect, it } from "vitest";
import { ONBOARDING_TITLES } from "../../domain/onboarding.js";
import { ONBOARDING_LIBRARY_WORKOUTS } from "../../server/seed/library/onboarding";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import { counterpartOffer, postTestOffer } from "./postTestOffer";

// Realistic identity inputs: the two REAL designated seed workouts
// (server/seed/library/onboarding.ts), never hand-typed title strings — a
// rename that missed this module must fail here, not in production.
const K2_SEED = ONBOARDING_LIBRARY_WORKOUTS.find(
  (w) => w.title === ONBOARDING_TITLES.k2,
)!;
const K6_SEED = ONBOARDING_LIBRARY_WORKOUTS.find(
  (w) => w.title === ONBOARDING_TITLES.k6,
)!;

function eligible(overrides: Partial<Parameters<typeof postTestOffer>[0]>) {
  return postTestOffer({
    workoutTitle: K2_SEED.title,
    workoutIsGlobal: true,
    avgSplitSeconds: 118.4,
    completedFullDistance: true,
    ...overrides,
  });
}

describe("postTestOffer (Phase BL PR B: who gets the post-save baseline offer)", () => {
  it("a completed global 2K Test with a measured split offers it as the 2k", () => {
    expect(eligible({})).toStrictEqual({
      distance: "2k",
      splitSeconds: 118.4,
    });
  });

  it("a completed global 6K Test offers its split as the 6k", () => {
    expect(
      eligible({ workoutTitle: K6_SEED.title, avgSplitSeconds: 130.2 }),
    ).toStrictEqual({ distance: "6k", splitSeconds: 130.2 });
  });

  // The COMPLETENESS GUARD (spec rev 2, M2 — binding): only a split
  // measured over the test's full distance may be offered as a baseline.
  it("a run that did not complete its programmed distance gets NO offer — the completeness guard", () => {
    expect(eligible({ completedFullDistance: false })).toBeNull();
  });

  // SOURCE-BESIDE-NULL durable fact (ROADMAP BL): consumers key on the
  // NUMBER being non-null first. A manual log produces no measured split
  // (buildManualModel returns no heroes) — no number, no offer.
  it("no measured split means no offer — the manual door's shape", () => {
    expect(eligible({ avgSplitSeconds: undefined })).toBeNull();
  });

  it("an ordinary library workout is never offered, however well it was measured", () => {
    const hoarfrost = LIBRARY_WORKOUTS.find((w) => w.title === "Hoarfrost")!;
    expect(eligible({ workoutTitle: hoarfrost.title })).toBeNull();
  });

  // domain/onboarding.ts's own rule: title alone isn't identity — a
  // rower's own custom workout sharing the title is a real, ownable row
  // whose shape (and therefore whose average split) can be anything.
  it("a rower's own custom workout that shares the test's title is not the designated test", () => {
    expect(eligible({ workoutIsGlobal: false })).toBeNull();
  });

  // The split band is the baselines band (60..240 server-side): a number
  // the offer's own accept could never store must never be offered. This
  // is also what keeps the e2e clock-fast-forward arcs honest: a 35s/500m
  // "6k" from a 7-minute fast-forward is not a plausible test result.
  it("a split outside the storable 60..240 band gets no offer, at either end", () => {
    expect(eligible({ avgSplitSeconds: 59.9 })).toBeNull();
    expect(eligible({ avgSplitSeconds: 240.5 })).toBeNull();
    expect(eligible({ avgSplitSeconds: 35 })).toBeNull();
    expect(eligible({ avgSplitSeconds: 60 })).not.toBeNull();
    expect(eligible({ avgSplitSeconds: 240 })).not.toBeNull();
  });
});

describe("counterpartOffer (the second, optional derive offer after accept)", () => {
  it("offers the derived 6k when the 2k was accepted and no 6k exists", () => {
    expect(
      counterpartOffer(
        { distance: "2k", splitSeconds: 118.4 },
        { k2Seconds: 118.4, k6Seconds: null },
      ),
    ).toStrictEqual({ distance: "6k", splitSeconds: 125.4 });
  });

  it("offers the derived 2k when the 6k was accepted and no 2k exists", () => {
    expect(
      counterpartOffer(
        { distance: "6k", splitSeconds: 130 },
        { k2Seconds: null, k6Seconds: 130 },
      ),
    ).toStrictEqual({ distance: "2k", splitSeconds: 123 });
  });

  // Spec rev 2: "The same offer answers a tested write that lands
  // inconsistent with its stored counterpart" — k2 must be strictly
  // faster than k6, so equality counts as inconsistent.
  it("offers the derived counterpart when the accepted 2k is not faster than the stored 6k", () => {
    expect(
      counterpartOffer(
        { distance: "2k", splitSeconds: 126 },
        { k2Seconds: 126, k6Seconds: 125 },
      ),
    ).toStrictEqual({ distance: "6k", splitSeconds: 133 });
    expect(
      counterpartOffer(
        { distance: "2k", splitSeconds: 125 },
        { k2Seconds: 125, k6Seconds: 125 },
      ),
    ).toStrictEqual({ distance: "6k", splitSeconds: 132 });
  });

  it("offers the derived counterpart when the accepted 6k is not slower than the stored 2k", () => {
    expect(
      counterpartOffer(
        { distance: "6k", splitSeconds: 120 },
        { k2Seconds: 121, k6Seconds: 120 },
      ),
    ).toStrictEqual({ distance: "2k", splitSeconds: 113 });
  });

  it("stays silent when the stored counterpart exists and is consistent", () => {
    expect(
      counterpartOffer(
        { distance: "2k", splitSeconds: 118.4 },
        { k2Seconds: 118.4, k6Seconds: 126 },
      ),
    ).toBeNull();
    expect(
      counterpartOffer(
        { distance: "6k", splitSeconds: 130 },
        { k2Seconds: 121, k6Seconds: 130 },
      ),
    ).toBeNull();
  });

  it("refuses a derived value that would leave the storable 60..240 band — same rule as the editor's own offer", () => {
    // 236 + 7 = 243 > 240: no offer rather than a clamped small lie.
    expect(
      counterpartOffer(
        { distance: "2k", splitSeconds: 236 },
        { k2Seconds: 236, k6Seconds: null },
      ),
    ).toBeNull();
    // 64 - 7 = 57 < 60 on the other side.
    expect(
      counterpartOffer(
        { distance: "6k", splitSeconds: 64 },
        { k2Seconds: null, k6Seconds: 64 },
      ),
    ).toBeNull();
  });
});
