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

  it("Phase 6I Task 6: your-first-row/connect-the-monitor are unpinned, published 2026-08-08, minutes by the 6H formula (ceil(words/180)) — 216 words -> 2 min, 217 words (post-redraft) -> 2 min", () => {
    const yourFirstRow = articleBySlug("your-first-row")!;
    expect(yourFirstRow.pinned).toBe(false);
    expect(yourFirstRow.publishedAt).toBe("2026-08-08");
    expect(yourFirstRow.minutes).toBe(2);

    const connectTheMonitor = articleBySlug("connect-the-monitor")!;
    expect(connectTheMonitor.pinned).toBe(false);
    expect(connectTheMonitor.publishedAt).toBe("2026-08-08");
    expect(connectTheMonitor.minutes).toBe(2);
  });

  it("launch shelf: the two permanent pins plus four latest stories (Phase 6I Task 6: your-first-row/connect-the-monitor land newest, sorting ahead of the two 6H stories)", () => {
    expect(pinnedArticles().map((a) => a.slug)).toStrictEqual([
      "workout-types",
      "baselines",
    ]);
    expect(latestArticles().map((a) => a.slug)).toStrictEqual([
      "your-first-row",
      "connect-the-monitor",
      "picking-a-workout",
      "pain-scale",
    ]);
  });
});

describe("selectors", () => {
  it("latestArticles sorts by newest first with distinct dates", () => {
    // Test with fixture having distinct dates to verify sort direction
    const fixtureOldNew = [
      {
        slug: "old",
        title: "Old article",
        minutes: 3,
        kind: "first-party" as const,
        pinned: false,
        publishedAt: "2026-08-01",
        body: <>old</>,
      },
      {
        slug: "new",
        title: "New article",
        minutes: 3,
        kind: "first-party" as const,
        pinned: false,
        publishedAt: "2026-08-05",
        body: <>new</>,
      },
    ];
    const result = latestArticles(fixtureOldNew);
    expect(result.map((a) => a.slug)).toStrictEqual(["new", "old"]);
  });

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
    // wraps past the end back to the top — the end of the registry is now
    // connect-the-monitor (Phase 6I Task 6 appended the two new articles
    // after pain-scale), so every OTHER article must be read for the walk
    // starting from pain-scale to wrap all the way back to workout-types.
    expect(
      nextUnreadSlug(
        "pain-scale",
        new Set([
          "baselines",
          "picking-a-workout",
          "your-first-row",
          "connect-the-monitor",
        ]),
      ),
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
