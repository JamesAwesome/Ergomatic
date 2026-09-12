import { describe, it, expect } from "vitest";
import { seedWorkoutId, uuidV5 } from "./seedId.js";
import { GLOBAL_LIBRARY_SEED } from "./library/index.js";
import { LEGACY_TITLE_RENAMES } from "../../domain/onboarding.js";

// Every literal below is INDEPENDENT of the module under test: none imports
// SEED_NAMESPACE, so retuning the constant cannot retune the assertion along
// with itself (RF21). The two pins are deliberately separate so a failure
// names its cause — the RFC vector proves the ALGORITHM, the Sea Fret vector
// proves the NAMESPACE, and only the second goes red on a namespace edit.

describe("uuidV5", () => {
  it("reproduces RFC 9562 Appendix A.4's published vector — proves the algorithm, version nibble and variant bits", () => {
    // Verbatim from rfc9562.txt, Appendix A.4, Figure 23.
    expect(
      uuidV5("6ba7b810-9dad-11d1-80b4-00c04fd430c8", "www.example.com"),
    ).toBe("2ed6657d-e927-568b-95e1-2665a8aea6a2");
  });
});

describe("seedWorkoutId", () => {
  it("pins the seed-id namespace — changing it re-keys every future fresh database's library", () => {
    expect(seedWorkoutId("Sea Fret")).toBe(
      "96fa2455-b89b-5c2b-81fb-6c96d412fd44",
    );
  });

  it("is a pure function of the title", () => {
    expect(seedWorkoutId("Hoarfrost")).toBe(seedWorkoutId("Hoarfrost"));
    expect(seedWorkoutId("Hoarfrost")).not.toBe(seedWorkoutId("Hoarfrost "));
  });
});

// G1 and G2 (design spec §Gates). Both are properties of the seed FILE,
// because nothing at the database enforces them — `workouts.title` has no
// unique index, and the only index the derived id meets is `workouts_pkey`.
// A violation of either is not a silent drop any more: `createMany` inserts
// all rows in ONE statement, so a duplicate derived id rolls the whole
// insert back and the seed throws at boot (spec §New failure modes, F1).

describe("the seed file, as the derivation's domain", () => {
  it("G1 — titles are distinct over GLOBAL_LIBRARY_SEED, the array the seed actually converges (not LIBRARY_WORKOUTS, which omits the two onboarding rows)", () => {
    const titles = GLOBAL_LIBRARY_SEED.map((w) => w.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("G2 — no legacy title in LEGACY_TITLE_RENAMES is a live seed title: a renamed row keeps v5(legacyTitle), so re-adding that title would collide with it", () => {
    const live = new Set(GLOBAL_LIBRARY_SEED.map((w) => w.title));
    for (const [legacy] of LEGACY_TITLE_RENAMES) {
      expect(
        live.has(legacy),
        `"${legacy}" is both a legacy title and a current one`,
      ).toBe(false);
    }
  });
});
