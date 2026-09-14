// THROWAWAY PROBE — the "say which number this is" design pass, member 8
// (James, 2026-09-14: "some of the numbers on the y axis are partial
// obscure ... all, the leftmost number itself (the label) was partially
// obscured like it was too far over").
//
// Measures, rather than reasons about, every y-axis tick label on the Stats
// subpage: its own box in SVG user units against its SVG's viewBox, the
// per-glyph advance actually rendered, and whether the intended face is the
// one drawing it.
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

async function seedGate0(page: Page): Promise<Record<string, string>> {
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
  return ids;
}

async function report(page: Page, label: string): Promise<void> {
  const out = await page.evaluate(() => {
    const fontsReady = {
      plexLoaded: document.fonts.check('9px "IBM Plex Mono"'),
      status: document.fonts.status,
    };
    const rows: unknown[] = [];
    for (const svg of Array.from(document.querySelectorAll("svg"))) {
      const vb = svg.viewBox.baseVal;
      const texts = Array.from(svg.querySelectorAll("text"));
      for (const t of texts) {
        const box = (t as SVGGraphicsElement).getBBox();
        const cls = t.getAttribute("class") ?? "";
        const anchor = t.getAttribute("text-anchor") ?? "";
        const style = getComputedStyle(t);
        const svgRect = svg.getBoundingClientRect();
        const card = svg.closest("figure, .stats-card, section, div");
        const cardRect = card?.getBoundingClientRect() ?? svgRect;
        const cardStyle = card === null ? null : getComputedStyle(card);
        const scale = svgRect.width / (vb.width || 1);
        rows.push({
          // Screen-space clearance from the label's left edge to the card's
          // own inner edge — what the eye actually judges.
          clearPx: Number(
            (svgRect.left + box.x * scale - cardRect.left).toFixed(2),
          ),
          cardBorderL: cardStyle?.borderLeftWidth ?? "",
          cardPadL: cardStyle?.paddingLeft ?? "",
          cardOverflow: cardStyle?.overflowX ?? "",
          svg: svg.getAttribute("aria-label")?.slice(0, 34) ?? "(no label)",
          cls,
          anchor,
          text: t.textContent ?? "",
          x: Number(box.x.toFixed(2)),
          width: Number(box.width.toFixed(2)),
          perGlyph: Number(
            (box.width / (t.textContent ?? " ").length).toFixed(2),
          ),
          overflowsLeft: box.x < vb.x,
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          vbX: vb.x,
          vbW: vb.width,
          svgPxW: Number(svg.getBoundingClientRect().width.toFixed(1)),
        });
      }
    }
    return { fontsReady, rows };
  });
  process.stdout.write(
    `\n===== [${label}] fonts: ${JSON.stringify(out.fontsReady)}\n`,
  );
  for (const r of out.rows as Record<string, unknown>[]) {
    process.stdout.write(
      `${r.overflowsLeft ? "CLIP " : "     "}${String(r.svg).padEnd(30)} "${String(r.text)}"\tx=${r.x}\tw=${r.width}\tclearPx=${r.clearPx}\tborderL=${r.cardBorderL}\tpadL=${r.cardPadL}\tovf=${r.cardOverflow}\tperGlyph=${r.perGlyph}\n`,
    );
  }
  process.stdout.write(`===== [${label}] end\n`);
}

test("axis probe: the Stats subpage", async ({ page }) => {
  test.setTimeout(120_000);
  await page.clock.install({ time: CLOCK });
  await signInViaBackdoor(page, {
    email: `axis-probe-${RUN_ID}@e2e.test`,
    name: "Axis Probe",
  });
  await seedGate0(page);
  await page.goto("/you/stats");
  await expect(page.getByRole("heading", { name: "Stats" })).toBeVisible();
  await page.getByText("2K 1:54.0").waitFor();
  await page.evaluate(() => document.fonts.ready);
  await report(page, "stats");
});

test("axis probe: a seven-glyph metres tick", async ({ page }) => {
  test.setTimeout(120_000);
  await page.clock.install({ time: CLOCK });
  await signInViaBackdoor(page, {
    email: `axis-probe-big-${RUN_ID}@e2e.test`,
    name: "Axis Probe",
  });
  await seedGate0(page);
  // One more row, big enough that the season's own niceMax crosses 100,000
  // and the gridline labels grow a seventh glyph.
  const bigId = await page.evaluate(async () => {
    const res = await fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workoutId: null,
        workoutTitle: "Big one",
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
  // INSIDE the season window: `seasonSummary` filters `{from: season.start,
  // to: today}` and `today` is the BROWSER's clock (the seed's own
  // 2026-09-12). A row left at server-now lands AFTER today and is excluded,
  // which is why the first attempt at this frame did not move the maximum.
  await backdateLog(bigId, "2026-09-10T16:00:00Z");
  await page.goto("/you/stats");
  await expect(page.getByRole("heading", { name: "Stats" })).toBeVisible();
  await page.getByText("2K 1:54.0").waitFor();
  await page.evaluate(() => document.fonts.ready);
  await report(page, "seven-glyph");
});
