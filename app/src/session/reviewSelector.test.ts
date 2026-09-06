import { describe, expect, it } from "vitest";
import { parseReviewSelector, reviewLocation } from "./reviewSelector";

describe("source-bound review navigation", () => {
  it.each([
    "",
    "?source=&startedAt=x",
    "?source=monitor",
    "?source=monitor&startedAt=",
    "?source=other&startedAt=x",
    "?source=timer&source=monitor&startedAt=x",
    "?source=timer&startedAt=x&startedAt=y",
  ])("refuses an absent or ambiguous selector: %s", (search) => {
    expect(parseReviewSelector(search)).toBeNull();
  });
  it("preserves a monitor key without choosing a newer source", () => {
    expect(
      parseReviewSelector(
        "?source=monitor&startedAt=2026-09-04T12%3A00%3A00.000Z",
      ),
    ).toStrictEqual({
      source: "monitor",
      startedAt: "2026-09-04T12:00:00.000Z",
    });
  });
  it("encodes the clicked timer key as a single query value", () => {
    expect(reviewLocation("timer", "legacy + key&x=1")).toBe(
      "/session/review?source=timer&startedAt=legacy%20%2B%20key%26x%3D1",
    );
  });
});
