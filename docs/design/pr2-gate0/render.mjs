import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const { chromium } = require("../../../app/node_modules/@playwright/test");
const here = dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(join(here, "index.html")).href;
const out = join(here, "renders");
await mkdir(out, { recursive: true });

// BOTH ORIENTATIONS for every screen a rower actually stands in front of
// (the flow, and the delete disclosure). The option boards are decision
// aids, not screens, so they render at the width they are read at.
const P = ["native", "portrait", 390, 844];
const L = ["native", "landscape", 844, 390];
const W = ["web", "portrait", 390, 844];
const shots = [
  ["01-flow-today-vs-proposed", "flow-compare", ...L],
  ["02-create-account-portrait", "create", ...P],
  ["03-proving-portrait", "proving", ...P],
  ["03-proving-landscape", "proving", ...L],
  ["04-attach-portrait", "attach", ...P],
  ["04-attach-landscape", "attach", ...L],
  ["04-attach-web-portrait", "attach", ...W],
  ["05-attached-portrait", "attached", ...P],
  ["05-attached-landscape", "attached", ...L],
  ["06-no-button-options", "refuse-options", ...L],
  ["07-the-300s-clock", "clock", ...L],
  ["08-delete-reauth-options", "delete-options", ...L],
  ["09-link-notice-options", "notice-options", ...L],
  ["10-naming-you-options", "naming-options", ...L],
  ["11-hairline-options", "hairline", ...L]
];

const browser = await chromium.launch({ headless: true });
const audit = [];
for (const [name, screen, platform, orientation, width, height] of shots) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  await page.goto(`${url}?capture=1&screen=${screen}&platform=${platform}&orientation=${orientation}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const report = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll("button, a, [tabindex]")].map(el => {
      const r = el.getBoundingClientRect();
      return { text: el.textContent.trim().replace(/\s+/g, " ").slice(0, 60), width: Math.round(r.width), height: Math.round(r.height) };
    });
    const screenEl = document.querySelector(".app-screen");
    return {
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      screenHorizontalOverflow: screenEl.scrollWidth > screenEl.clientWidth,
      // A screen taller than its frame is not a defect (it scrolls), but on
      // a 390x844 phone the ACTIONS must be reachable without one, so the
      // overflow is recorded rather than judged.
      verticalOverflowPx: Math.max(0, screenEl.scrollHeight - screenEl.clientHeight),
      undersized: boxes.filter(b => b.width > 0 && b.height > 0 && (b.width < 44 || b.height < 44))
    };
  });
  audit.push({ name, viewport: `${width}x${height}`, ...report });
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: false });
  await page.close();
}
await browser.close();
await writeFile(join(out, "layout-audit.json"), JSON.stringify(audit, null, 2) + "\n");

console.log(`Rendered ${shots.length} captures to ${out}\n`);
let bad = 0;
for (const a of audit) {
  const flags = [];
  if (a.horizontalOverflow || a.screenHorizontalOverflow) flags.push("H-OVERFLOW");
  if (a.undersized.length) flags.push(`${a.undersized.length} UNDER 44px`);
  if (a.verticalOverflowPx > 0) flags.push(`scrolls +${a.verticalOverflowPx}px`);
  if (a.horizontalOverflow || a.screenHorizontalOverflow || a.undersized.length) bad += 1;
  console.log(`${a.name} (${a.viewport}): ${flags.length ? flags.join(", ") : "clean"}`);
}
console.log(bad ? `\n${bad} capture(s) with a horizontal overflow or an undersized target` : "\nNo horizontal overflow; every target clears 44 x 44.");
