// GATE 0A CAPTURE HARNESS — the "say which number this is" design pass.
// Renders the boards §4 of the spec owes, from whatever tree it is run
// against: `GATE0NP_OUT=before` on the branch as it stands, then again on
// the throwaway prototype with `GATE0NP_OUT=after-<option>`. It asserts
// only that the surface it is about to photograph is actually there — a
// capture of an empty state is RF7, and nothing else here is a gate.
//
// Deleted with `axisProbe.spec.ts` in PR 2 (spec §10).
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import {
  backdateLog,
  RUN_ID,
  seedGate0Tests,
  signInViaBackdoor,
} from "./helpers";
import { GATE0_LOG_BODIES, GATE0_TODAY_ISO } from "../src/test/gate0LogBodies";

test.use({ timezoneId: "America/New_York" });
const CLOCK = new Date(`${GATE0_TODAY_ISO}T13:00:00Z`);
const OUT = path.resolve(
  process.cwd(),
  "../docs/design/number-provenance/gate0a",
  process.env.GATE0NP_OUT ?? "before",
);
const PORTRAIT = { width: 390, height: 844 };
const LANDSCAPE = { width: 844, height: 390 };

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

async function shotCard(
  page: Page,
  selector: string,
  name: string,
): Promise<void> {
  const card = page.locator(selector).first();
  await expect(card).toBeVisible();
  await card.scrollIntoViewIfNeeded();
  await card.screenshot({ path: path.join(OUT, `${name}.png`) });
}

/** The seeded library plus one row big enough that both metres axes cross
 *  100,000 and grow a seventh glyph — the frame James photographed on his
 *  phone, which the six-glyph screenshot seed cannot produce (spec §1.3).
 *  Backdated INSIDE the season window: a row left at server-now lands past
 *  the browser's pinned clock and `rowsInRange` drops it. */
async function seedBigSeason(page: Page): Promise<void> {
  const ids: Record<string, string> = {};
  for (const { id, date, body } of GATE0_LOG_BODIES) {
    const created = await page.evaluate(async (b) => {
      const res = await fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(b),
      });
      return { ok: res.ok, status: res.status, text: await res.text() };
    }, body);
    if (!created.ok)
      throw new Error(`${id}: ${created.status} ${created.text}`);
    const rowId = (JSON.parse(created.text) as { id: string }).id;
    await backdateLog(rowId, `${date}T16:00:00Z`);
    ids[id] = rowId;
  }
  await seedGate0Tests(page, ids, (d) => `${d}T16:00:00Z`);
  const bigId = await page.evaluate(async () => {
    const res = await fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workoutId: null,
        workoutTitle: "Long season row",
        workoutType: null,
        steps: [],
        source: "manual",
        timeSeconds: 36000,
        distanceMeters: 120000,
      }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(text);
    return (JSON.parse(text) as { id: string }).id;
  });
  await backdateLog(bigId, "2026-09-10T16:00:00Z");
}

async function openStats(page: Page, who: string): Promise<void> {
  await page.clock.install({ time: CLOCK });
  await signInViaBackdoor(page, {
    email: `gate0np-${who}-${RUN_ID}@e2e.test`,
    name: "Gate 0A",
  });
  await seedBigSeason(page);
  await page.goto("/you/stats");
  await expect(page.getByRole("heading", { name: "Stats" })).toBeVisible();
  // The last card to resolve — captured before it is on screen, the boards
  // below would photograph a half-rendered page.
  await expect(page.getByRole("heading", { name: "TEST TREND" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

for (const [orient, size] of [
  ["portrait", PORTRAIT],
  ["landscape", LANDSCAPE],
] as const) {
  test(`gate 0A: You to Stats, ${orient}`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(size);
    await openStats(page, orient);
    await shot(page, `stats-${orient}`);
    await shotCard(
      page,
      'section[aria-labelledby="stats-totals-h"]',
      `totals-${orient}`,
    );
    await shotCard(
      page,
      'section[aria-labelledby="stats-mpw-h"]',
      `weekbars-${orient}`,
    );
    await shotCard(
      page,
      'section[aria-labelledby="stats-season-h"]',
      `season-${orient}`,
    );
    await shotCard(
      page,
      'section[aria-labelledby="stats-trend-h"]',
      `trend-${orient}`,
    );
    // M7's board needs the gap ON SCREEN, and only ALL reaches it: R1 is
    // the seed's one stored-tier pm5 row (6,240 m, 2025-11-08), so under
    // ALL the MACHINE column's METRES and TIME describe eleven rows while
    // AVG WATTS is computed from ten.
    await page.getByRole("radio", { name: "ALL" }).click();
    await expect(page.getByRole("heading", { name: "TOTALS" })).toBeVisible();
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await shotCard(
      page,
      'section[aria-labelledby="stats-totals-h"]',
      `totals-all-${orient}`,
    );
  });

  test(`gate 0A: the CUSTOM filter, ${orient}`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(size);
    await openStats(page, `custom-${orient}`);
    await page.getByRole("radio", { name: "CUSTOM" }).click();
    const [from, to] = [
      page.getByLabel("FROM", { exact: true }),
      page.getByLabel("TO", { exact: true }),
    ];
    await from.fill("2026-06-01");
    await to.fill("2026-09-12");
    await expect(page.getByRole("heading", { name: "TOTALS" })).toBeVisible();
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await shot(page, `custom-echo-${orient}`);
    // The line's one non-redundant state: a range the rows do not reach.
    await from.fill("2026-05-02");
    await to.fill("2026-05-03");
    await expect(page.getByText(/^NO ROWS · /)).toBeVisible();
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await shot(page, `custom-norows-${orient}`);
  });

  test(`gate 0A: the trace chart's x axis, ${orient}`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(size);
    await signInViaBackdoor(page, {
      email: `gate0np-trace-${orient}-${RUN_ID}@e2e.test`,
      name: "Gate 0A",
    });
    const samples: {
      t: number;
      d: number;
      p: number;
      spm: number;
      hr: number;
    }[] = [];
    for (let i = 0; i <= 40; i++) {
      samples.push({
        t: i * 10,
        d: i * 4,
        p: (140 - Math.round(i * 0.7)) * 10,
        spm: 22 + Math.round(i / 7),
        hr: 128 + Math.round(i * 0.6),
      });
    }
    const logId = await page.evaluate(
      async (series) => {
        const res = await fetch("/api/logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workoutId: null,
            workoutTitle: "Gate 0A Trace",
            workoutType: null,
            deviceName: "PM5 432331249",
            source: "pm5",
            steps: [],
            distanceMeters: 5000,
            timeSeconds: 1500,
            series,
          }),
        });
        const text = await res.text();
        if (!res.ok) throw new Error(text);
        return (JSON.parse(text) as { id: string }).id;
      },
      { samples },
    );
    await page.goto(`/today/log/${logId}`);
    await expect(
      page.getByRole("heading", { name: "Gate 0A Trace" }),
    ).toBeVisible();
    await expect(page.locator(".trace-tick-label-x").last()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await shotCard(page, "figure.trace-figure", `trace-${orient}`);
  });
}
