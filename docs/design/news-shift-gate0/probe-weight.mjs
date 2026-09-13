// Probe 2 (same receipt, same stack): residual shift from the read-row weight change (500->400) and the " · READ" suffix, with the square column reserved.
import { chromium } from "/Users/james/projects/github/jamesawesome/Ergomatic/app/node_modules/@playwright/test/index.mjs";
const base = "http://127.0.0.1:8185";
const browser = await chromium.launch({ args: ["--disable-blink-features=WebBluetooth"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const email = `shift-probe2-${Date.now()}@e2e.test`;
await page.request.post(base + "/api/auth/test-signin", { data: { secret: "e2e-secret", email, name: "Shift Probe" } });
await page.goto(base + "/");
for (const s of ["workout-types","baselines","picking-a-workout","effort-scale","your-first-row","connect-the-monitor","reading-the-shorthand"]) {
  const r = await page.request.put(base + "/api/article-reads/" + s);
  console.log("PUT", s, r.status());
}
await page.goto(base + "/news");
await page.waitForSelector(".news-unread-count, .news-square[data-read]");
await page.evaluate(() => document.fonts.ready);
const res = await page.evaluate(() => {
  const rows = [...document.querySelectorAll(".news-row")];
  return rows.map((row) => {
    const t = row.querySelector(".news-row-title");
    const h = (w) => { t.style.fontWeight = w; return t.getBoundingClientRect().height; };
    const at500 = h("500"), at400 = h("400"); t.style.fontWeight = "";
    const meta = row.querySelector(".news-row-meta");
    return { title: t.textContent.trim().slice(0, 28), read: row.dataset.read, bodyW: row.querySelector(".news-row-body").getBoundingClientRect().width, h500: at500, h400: at400, metaH: meta.getBoundingClientRect().height, meta: meta.textContent.trim() };
  });
});
console.table(res);
console.log("unread count el:", await page.locator(".news-unread-count").count());
await browser.close();
