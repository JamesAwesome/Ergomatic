// Probe (kept as the receipt for the spec's §2/§4 numbers; run against the ergomatic-68485 stack on 2026-09-12, phase-ps-pr1 at fc02b982, which differs from origin/main f705f002 only by 206 appended `.stacked-bar`/`.stats-*` CSS rules, none touching News): measure the News tab layout before/after /api/article-reads settles.
import { chromium } from "/Users/james/projects/github/jamesawesome/Ergomatic/app/node_modules/@playwright/test/index.mjs";
const OUT = "/private/tmp/claude-501/-Users-james-projects-github-jamesawesome-Ergomatic/85ae8716-5b05-4733-ad9a-22eb06b3d142/scratchpad/shift";
const base = "http://127.0.0.1:8185";
const browser = await chromium.launch({ args: ["--disable-blink-features=WebBluetooth"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const email = `shift-probe-${Date.now()}@e2e.test`;
const r = await page.request.post(base + "/api/auth/test-signin", { data: { secret: "e2e-secret", email, name: "Shift Probe" } });
if (!r.ok()) throw new Error("signin " + r.status());
await page.goto(base + "/");
// Mark two articles read so the weight-change case (500->400) is on screen too.
await page.request.put(base + "/api/article-reads/workout-types");
await page.request.put(base + "/api/article-reads/pain-scale");

let release;
const held = new Promise((res) => (release = res));
await page.route("**/api/article-reads", async (route) => { await held; await route.continue(); });

const measure = () => page.evaluate(() => {
  const sel = [".news-title-row", ".news-unread-count", ".news-pinned", ".news-latest", ".news-whatsnew", ".news-row", ".news-row-title", ".news-row-body", ".news-square"];
  const out = {};
  for (const s of sel) {
    out[s] = [...document.querySelectorAll(s)].map((el) => { const b = el.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; });
  }
  out.docHeight = document.documentElement.scrollHeight;
  out.titles = [...document.querySelectorAll(".news-row-title")].map((el) => ({ t: el.textContent.trim().slice(0, 30), lines: Math.round(el.getBoundingClientRect().height / (16 * 1.3)) }));
  return out;
});

await page.goto(base + "/news");
await page.waitForSelector(".news-row");
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => new Promise(requestAnimationFrame));
const before = await measure();
await page.screenshot({ path: OUT + "/before.png", fullPage: true });
release();
await page.waitForSelector(".news-unread-count");
await page.evaluate(() => new Promise(requestAnimationFrame));
const after = await measure();
await page.screenshot({ path: OUT + "/after.png", fullPage: true });

const diff = {};
for (const k of Object.keys(before)) {
  if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) diff[k] = { before: before[k], after: after[k] };
}
console.log(JSON.stringify(diff, null, 1));
await browser.close();
