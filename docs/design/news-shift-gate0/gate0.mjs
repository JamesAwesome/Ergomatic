// Gate 0 renderer (same stack): loading frame today, loading frame with the gutter reserved (CSS-injected, exact geometry), settled frame. Portrait + landscape.
import { chromium } from "/Users/james/projects/github/jamesawesome/Ergomatic/app/node_modules/@playwright/test/index.mjs";
const OUT = "/private/tmp/claude-501/-Users-james-projects-github-jamesawesome-Ergomatic/85ae8716-5b05-4733-ad9a-22eb06b3d142/scratchpad/shift";
const base = "http://127.0.0.1:8185";
const browser = await chromium.launch({ args: ["--disable-blink-features=WebBluetooth"] });
for (const [name, viewport] of [["portrait", { width: 390, height: 844 }], ["landscape", { width: 844, height: 390 }]]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.request.post(base + "/api/auth/test-signin", { data: { secret: "e2e-secret", email: `gate0-${name}-${Date.now()}@e2e.test`, name: "Gate Zero" } });
  await page.goto(base + "/");
  let release; const held = new Promise((r) => (release = r));
  await page.route("**/api/article-reads", async (route) => { await held; await route.continue(); });
  await page.goto(base + "/news");
  await page.waitForSelector(".news-row");
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${OUT}/${name}-1-loading-today.png` });
  const style = await page.addStyleTag({ content: `.news-row::before{content:"";flex:none;width:10px}` });
  const rows = await page.evaluate(() => [...document.querySelectorAll(".news-row")].map((r) => Math.round(r.getBoundingClientRect().y)));
  await page.screenshot({ path: `${OUT}/${name}-2-loading-gutter.png` });
  await style.evaluate((el) => el.remove());
  release();
  await page.waitForSelector(".news-unread-count");
  await page.evaluate(() => new Promise(requestAnimationFrame));
  const rowsAfter = await page.evaluate(() => [...document.querySelectorAll(".news-row")].map((r) => Math.round(r.getBoundingClientRect().y)));
  await page.screenshot({ path: `${OUT}/${name}-3-settled.png` });
  console.log(name, "row y with gutter:", rows.join(","), "| settled:", rowsAfter.join(","), "| equal:", rows.join() === rowsAfter.join());
  await ctx.close();
}
await browser.close();
