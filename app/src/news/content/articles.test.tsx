import { describe, expect, it } from "vitest";
import {
  ARTICLES,
  articleBySlug,
  latestArticles,
  nextUnreadSlug,
  pinnedArticles,
  unreadCount,
} from "./articles";
import { RELEASE_NOTES } from "./releaseNotes";

describe("article registry invariants", () => {
  it("slugs are unique and safe-shaped", () => {
    const slugs = ARTICLES.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]{1,64}$/);
  });

  it("pins at most 3 (handoff open question #2: five pushes LATEST below the fold)", () => {
    expect(pinnedArticles().length).toBeLessThanOrEqual(3);
  });

  it("kind and payload agree: first-party has body xor linked has source", () => {
    const firstPartyArticles = ARTICLES.filter((a) => a.kind === "first-party");
    const linkedArticles = ARTICLES.filter((a) => a.kind === "linked");

    for (const a of firstPartyArticles) {
      expect(a.body, `body missing for ${a.slug}`).toBeTruthy();
      expect(a.linked, `linked should not exist for ${a.slug}`).toBeUndefined();
    }

    for (const a of linkedArticles) {
      expect(a.linked, `linked missing for ${a.slug}`).toBeTruthy();
      expect(a.body, `body should not exist for ${a.slug}`).toBeUndefined();
    }
  });

  it("every article reads in at least a minute", () => {
    for (const a of ARTICLES) expect(a.minutes).toBeGreaterThanOrEqual(1);
  });

  it("launch shelf: the two permanent pins plus two latest stories", () => {
    expect(pinnedArticles().map((a) => a.slug)).toStrictEqual([
      "workout-types",
      "baselines",
    ]);
    expect(latestArticles().map((a) => a.slug)).toStrictEqual([
      "picking-a-workout",
      "pain-scale",
    ]);
  });
});

describe("selectors", () => {
  it("articleBySlug finds by slug and misses honestly", () => {
    expect(articleBySlug("baselines")?.title).toMatch(/baseline/i);
    expect(articleBySlug("nope")).toBeUndefined();
  });

  it("unreadCount counts every unread article, read ones drop out", () => {
    expect(unreadCount(new Set())).toBe(ARTICLES.length);
    expect(unreadCount(new Set(["baselines"]))).toBe(ARTICLES.length - 1);
    expect(unreadCount(new Set(ARTICLES.map((a) => a.slug)))).toBe(0);
  });

  it("nextUnreadSlug walks registry order, wraps, and returns null when done", () => {
    expect(nextUnreadSlug("workout-types", new Set())).toStrictEqual(
      "baselines",
    );
    // wraps past the end back to the top
    expect(
      nextUnreadSlug("pain-scale", new Set(["baselines", "picking-a-workout"])),
    ).toStrictEqual("workout-types");
    // everything else read → nothing to offer
    const allButCurrent = new Set(
      ARTICLES.filter((a) => a.slug !== "pain-scale").map((a) => a.slug),
    );
    expect(nextUnreadSlug("pain-scale", allButCurrent)).toBeNull();
  });
});

describe("release notes", () => {
  it("newest first, every entry has a version tag shape and items", () => {
    const dates = RELEASE_NOTES.map((r) => r.date);
    expect([...dates].sort().reverse()).toStrictEqual(dates);
    for (const r of RELEASE_NOTES) {
      expect(r.version).toMatch(/^v\d+\.\d+\.\d+$/);
      expect(r.items.length).toBeGreaterThan(0);
    }
  });
});
