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

// BOTH ORIENTATIONS for the screen itself, because the gate asks for both.
// The compare and states boards are decision aids rather than screens, so
// they render at the width they are read at.
const P = [390, 844];
const L = [844, 390];
const shots = [
  ["01-today", "now", ...P],
  ["02-option-a", "a", ...P],
  ["03-option-b", "b", ...P],
  ["04-compare", "compare", 1640, 900],
  ["05-states", "states", 1640, 900],
  ["06-today-landscape", "now-l", ...L],
  ["07-option-a-landscape", "a-l", ...L],
  ["08-option-b-landscape", "b-l", ...L],
];

const browser = await chromium.launch();
const audit = {};
for (const [file, board, w, h] of shots) {
  const page = await browser.newPage({
    viewport: { width: w + 240, height: h + 80 },
    deviceScaleFactor: 2,
  });
  await page.goto(url);
  await page.evaluate((b) => window.__go(b), board);
  await page.waitForTimeout(120);
  const el = await page.$(".board");
  await el.screenshot({ path: join(out, `${file}.png`) });

  // MEASURED, NOT EYEBALLED. The gate's question for this change is "can the
  // rower reach the field without scrolling", so the number that answers it
  // is the field's distance from the top of the frame, and whether it fits.
  audit[file] = await page.evaluate(() => {
    const phone = document.querySelector(".phone");
    if (!phone) return null;
    const box = phone.getBoundingClientRect();
    const input = phone.querySelector(".auth-name-input");
    const methods = phone.querySelector(".auth-methods h2");
    const danger = phone.querySelector(".auth-danger-zone");
    const at = (n) => (n ? Math.round(n.getBoundingClientRect().top - box.top) : null);
    const screenEl = phone.querySelector(".screen");
    return {
      frame: [Math.round(box.width), Math.round(box.height)],
      nameFieldTop: at(input),
      signInMethodsTop: at(methods),
      deleteBoxTop: at(danger),
      contentHeight: screenEl ? Math.round(screenEl.scrollHeight) : null,
      scrolls: screenEl ? screenEl.scrollHeight > box.height : null,
      // 44px is the repo's hard hit-target floor.
      saveButtonBox: (() => {
        const b = phone.querySelector(".auth-name-save");
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return [Math.round(r.width), Math.round(r.height)];
      })(),
      inputBox: (() => {
        const i = phone.querySelector(".auth-name-input");
        if (!i) return null;
        const r = i.getBoundingClientRect();
        return [Math.round(r.width), Math.round(r.height)];
      })(),
    };
  });
  await page.close();
}
await browser.close();
await writeFile(join(out, "layout-audit.json"), JSON.stringify(audit, null, 2) + "\n");
console.log(`${shots.length} renders + layout-audit.json -> ${out}`);
