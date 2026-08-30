import { describe, it, expect } from "vitest";
import {
  ONBOARDING_TITLES,
  ONBOARDING_DURATION_COPY,
  LEGACY_TITLE_RENAMES,
  canonicalTitle,
  isOnboardingTitle,
} from "./onboarding.js";
import { LIBRARY_WORKOUTS } from "../server/seed/library/index.js";

describe("onboarding constants", () => {
  it("fixes the two designated workout titles", () => {
    expect(ONBOARDING_TITLES).toStrictEqual({
      k6: "6K Test",
      k2: "2K Test",
    });
  });

  it("fixes the nominal duration copy beside each title (never a bare dash)", () => {
    expect(ONBOARDING_DURATION_COPY).toStrictEqual({
      k6: "ABOUT 25 MIN",
      k2: "ABOUT 8 MIN",
    });
  });
});

describe("isOnboardingTitle", () => {
  it("is true for both designated titles", () => {
    expect(isOnboardingTitle(ONBOARDING_TITLES.k6)).toBe(true);
    expect(isOnboardingTitle(ONBOARDING_TITLES.k2)).toBe(true);
  });

  it("is false for a real library workout's title (realistic-fixture guard)", () => {
    for (const w of LIBRARY_WORKOUTS) {
      expect(isOnboardingTitle(w.title)).toBe(false);
    }
  });

  it("is false for an arbitrary/empty string", () => {
    expect(isOnboardingTitle("")).toBe(false);
    expect(isOnboardingTitle("6K Test ")).toBe(false); // no fuzzy trim/match
    expect(isOnboardingTitle("First 6k")).toBe(false); // the legacy title is NOT recognized post-rename
  });
});

// A log's `workout_title` is a save-time snapshot that is NEVER rewritten
// (seed.ts's own comment: "pre-rename LOGS keep the old spelling forever"),
// so any comparison of a stored title against an authored constant — the
// Plan screen's checkpoint check is the first — has to canonicalise first
// or it reports a deviation that never happened.
describe("canonicalTitle", () => {
  it("maps each retired seed title forward to the name that replaced it", () => {
    // Independent literals, not `[...LEGACY_TITLE_RENAMES]` — a test that
    // reads the map it exists to pin passes for any map (RF21).
    expect(canonicalTitle("First 2k")).toBe("2K Test");
    expect(canonicalTitle("First 6k")).toBe("6K Test");
  });

  it("returns a title that was never renamed unchanged", () => {
    expect(canonicalTitle("2K Test")).toBe("2K Test");
    expect(canonicalTitle("Sea Fret")).toBe("Sea Fret");
    expect(canonicalTitle("")).toBe("");
  });

  it("is idempotent — a canonical title never maps a second time", () => {
    for (const legacy of LEGACY_TITLE_RENAMES.keys()) {
      expect(canonicalTitle(canonicalTitle(legacy))).toBe(
        canonicalTitle(legacy),
      );
    }
  });

  it("every rename target is a current onboarding title (the map cannot point at a name nothing uses)", () => {
    for (const current of LEGACY_TITLE_RENAMES.values()) {
      expect(isOnboardingTitle(current)).toBe(true);
    }
  });

  it("never maps a real library title (a rename must not shadow the corpus)", () => {
    for (const w of LIBRARY_WORKOUTS) {
      expect(canonicalTitle(w.title)).toBe(w.title);
    }
  });
});
