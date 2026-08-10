import { readFileSync, mkdtempSync, readFileSync as rf } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  appendNew,
  extractWod,
  fetchRange,
} from "../../scripts/wod/fetch-wods.mjs";

const FIXTURE = readFileSync(
  new URL(
    "../../scripts/wod/fixtures/wod-rowerg-2026-08-10.html",
    import.meta.url,
  ),
  "utf8",
);

describe("extractWod", () => {
  it("pulls title and verbatim instruction from the real page shape", () => {
    const r = extractWod(FIXTURE, "2026-08-10");
    expect(r).toStrictEqual({
      date: "2026-08-10",
      equipment: "rowerg",
      title: "6 x 500m / 1 min easy",
      raw: "Complete six 500 meter pieces. Continue at light pressure between each 500. Note: for BikeErg, distance is 1000 meters.",
      sourceUrl: "https://log.concept2.com/wod/2026-08-10/rowerg",
    });
  });

  it("decodes HTML entities in title and body", () => {
    const html =
      "<h3>4 x 2000m &amp; sprint</h3>\n<p><strong>Row hard &gt; easy.</strong></p>";
    const r = extractWod(html, "2026-01-01");
    expect(r.title).toBe("4 x 2000m & sprint");
    expect(r.raw).toBe("Row hard > easy.");
  });

  it("returns an explicit error record for an unrecognized shape, with an excerpt", () => {
    const r = extractWod(
      "<html><body>maintenance page</body></html>",
      "2026-01-02",
    );
    expect(r.date).toBe("2026-01-02");
    expect(r.error).toMatch(/shape/i);
    expect(r.excerpt).toContain("maintenance");
  });
});

describe("appendNew", () => {
  it("appends records as JSONL and skips dates already present", () => {
    const dir = mkdtempSync(join(tmpdir(), "wod-"));
    const p = join(dir, "raw.jsonl");
    const rec = (date: string) => ({
      date,
      equipment: "rowerg",
      title: "t",
      raw: "r",
      sourceUrl: "u",
    });
    expect(appendNew([rec("2026-08-01")], p)).toStrictEqual({
      appended: 1,
      skipped: 0,
    });
    expect(appendNew([rec("2026-08-01"), rec("2026-08-02")], p)).toStrictEqual({
      appended: 1,
      skipped: 1,
    });
    const lines = rf(p, "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(lines.map((l) => l.date)).toStrictEqual([
      "2026-08-01",
      "2026-08-02",
    ]);
    expect(lines[0].retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("the skip key is date+equipment, not date alone", () => {
    const dir = mkdtempSync(join(tmpdir(), "wod-"));
    const p = join(dir, "raw.jsonl");
    const rec = (date: string, equipment: string) => ({
      date,
      equipment,
      title: "t",
      raw: "r",
      sourceUrl: "u",
    });
    expect(appendNew([rec("2026-08-01", "rowerg")], p)).toStrictEqual({
      appended: 1,
      skipped: 0,
    });
    // Same date, different equipment: must NOT be treated as already seen.
    expect(appendNew([rec("2026-08-01", "bikeerg")], p)).toStrictEqual({
      appended: 1,
      skipped: 0,
    });
  });
});

describe("fetchRange", () => {
  it("fetches each date once, paced by the injected sleeper, and appends", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wod-"));
    const p = join(dir, "raw.jsonl");
    const calls: string[] = [];
    const sleeps: number[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url);
      return new Response(FIXTURE, { status: 200 });
    });
    const sleep = vi.fn(async (ms: number) => void sleeps.push(ms));
    const res = await fetchRange("2026-08-09", "2026-08-10", {
      out: p,
      fetchImpl,
      sleep,
    });
    expect(calls).toStrictEqual([
      "https://log.concept2.com/wod/2026-08-09/rowerg",
      "https://log.concept2.com/wod/2026-08-10/rowerg",
    ]);
    expect(sleeps).toStrictEqual([1000]); // between requests, not after the last
    expect(res.appended).toBe(2);
  });

  it("a non-200 becomes an error record, not a throw, and the range continues", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wod-"));
    const p = join(dir, "raw.jsonl");
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes("2026-08-09")
        ? new Response("gone", { status: 404 })
        : new Response(FIXTURE, { status: 200 }),
    );
    const res = await fetchRange("2026-08-09", "2026-08-10", {
      out: p,
      fetchImpl,
      sleep: async () => {},
    });
    const lines = rf(p, "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(lines[0].error).toMatch(/404/);
    expect(lines[1].title).toBe("6 x 500m / 1 min easy");
    expect(res.appended).toBe(2);
  });
});
