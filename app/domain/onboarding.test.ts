import { describe, it, expect } from "vitest";
import {
  ONBOARDING_TITLES,
  ONBOARDING_DURATION_COPY,
  isOnboardingTitle,
} from "./onboarding.js";
import { LIBRARY_WORKOUTS } from "../server/seed/library/index.js";

describe("onboarding constants", () => {
  it("fixes the two designated workout titles", () => {
    expect(ONBOARDING_TITLES).toStrictEqual({
      k6: "First 6k",
      k2: "First 2k",
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
    expect(isOnboardingTitle("First 6k ")).toBe(false); // no fuzzy trim/match
  });
});
