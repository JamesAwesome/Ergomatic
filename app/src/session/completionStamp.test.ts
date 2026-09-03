import { describe, it, expect, vi, afterEach } from "vitest";
import { completionStamp } from "./completionStamp";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("completionStamp (Wave E PR2: the producer server/db/schema.ts's tz comment named)", () => {
  it("carries the run's OWN close stamp, not the clock at save time", () => {
    // The whole point: C2's `date` is the END of the workout (spec anchor
    // K3), and `loggedAt` is minutes-to-hours later.
    expect(
      completionStamp({ completedAt: "2026-09-01T09:10:20.000Z" }).completedAt,
    ).toBe("2026-09-01T09:10:20.000Z");
  });

  it("carries a canonical IANA zone the route will accept", () => {
    // routes/data.ts's `tzError` checks membership of
    // `Intl.supportedValuesOf("timeZone")` plus "UTC" — NOT "Intl parses
    // it", which also admits offsets like "+05:00" and legacy aliases.
    const { tz } = completionStamp({ completedAt: null });
    expect([...Intl.supportedValuesOf("timeZone"), "UTC"]).toContain(tz);
  });

  it("passes a missing stamp through as null rather than inventing one", () => {
    // An interrupted run has `completedAt: null` and must stay that way:
    // substituting `new Date()` here would post the save clock while
    // CLAIMING to be the close stamp, which is worse than posting nothing
    // (the server's fallback to `loggedAt` is at least honest about what
    // it is).
    expect(completionStamp({ completedAt: null }).completedAt).toBeNull();
  });

  it("still names the zone when there is no stamp, and the pair is what the server reads", () => {
    // Documented, not asserted as a virtue: `buildC2Payload`'s branch is
    // PAIRED, so a tz with a null stamp is inert on the upload. It rides
    // anyway because the upload route persists the request's zone on a
    // first legacy send, and a zone stored beside a null stamp costs
    // nothing and is true.
    expect(typeof completionStamp({ completedAt: null }).tz).toBe("string");
  });
});
