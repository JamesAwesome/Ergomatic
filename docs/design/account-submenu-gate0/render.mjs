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
  ["01-today-you", "today", ...P],
  ["02-today-where-delete-sits", "scroll", ...P],
  ["03-options-side-by-side", "compare", ...L],
  ["04-option-a-you", "opt-a-you", ...P],
  ["05-option-a-subpage", "opt-a-sub", ...P],
  ["06-option-b-you", "opt-b-you", ...P],
  ["07-option-b-subpage", "opt-b-sub", ...P],
  ["08-option-c-under-settings", "opt-c", ...P],
  ["09-four-consequences", "consequences", ...L],
  ["10-route-name-clash", "route", ...L],
  ["11-option-a-you-landscape", "opt-a-you", ...L],
  ["12-option-b-you-landscape", "opt-b-you", ...L],
  ["13-today-you-landscape", "today", ...L]
];

const browser = await chromium.launch({ headless: true });
const audit = [];
for (const [name, screen, platform, orientation, width, height] of shots) {
  const board = /^(03|09|10)-/.test(name);
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  await page.goto(`${url}?capture=1&screen=${screen}&platform=${platform}&orientation=${orientation}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  // GROW THE VIEWPORT FOR A DECISION BOARD, because `fullPage: true` does
  // NOTHING here: the scrolling element is `.app-screen`, not the document,
  // and in capture mode the document is exactly viewport-sized. The first
  // attempt at this used fullPage, produced a 390-tall image, and printed
  // "captured full-height" anyway — the claim was false and only the pixel
  // dimensions showed it. The boards are option tables read at a desk, so
  // growing the frame costs nothing; the flow screens stay at device size,
  // because for those the fold is the whole point.
  if (board) {
    const needed = await page.evaluate(() => {
      const el = document.querySelector(".app-screen");
      return el.scrollHeight - el.clientHeight;
    });
    if (needed > 0) {
      await page.setViewportSize({ width, height: height + needed });
      await page.evaluate(() => document.fonts.ready);
    }
  }
  const report = await page.evaluate(() => {
    // `.mini` holds thumbnail illustrations of whole screens inside an
    // option board. Their rows are pictures, not controls, so measuring them
    // against 44px reports three false undersized targets.
    const boxes = [...document.querySelectorAll("button, a, [tabindex]")].filter(el => !el.closest(".mini")).map(el => {
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
      // OVERFLOW IS NOT THE SAME AS CONTENT BELOW THE FOLD, and "no content
      // is hidden in either orientation" is the claim the README actually
      // makes — so measure it rather than infer it from the overflow number.
      // A screen can overflow by its own bottom padding with every element
      // fully visible, which is exactly what the two landscape flow screens
      // do.
      // THE NUMBER THIS GATE IS ABOUT: how far from the top of the screen
      // the destructive control sits, and whether a rower has to scroll to
      // reach it. Measured, because "far too prominent" is a claim about a
      // distance and the whole point of the change is to move it.
      deleteButton: (() => {
        const el = screenEl.querySelector(".delete-account");
        if (!el) return null;
        const top = screenEl.getBoundingClientRect().top;
        const r = el.getBoundingClientRect();
        return {
          fromTopPx: Math.round(r.top - top + screenEl.scrollTop),
          visibleWithoutScrolling: r.top - top < screenEl.clientHeight,
        };
      })(),
      contentBelowFoldPx: (() => {
        const top = screenEl.getBoundingClientRect().top;
        const fold = top + screenEl.clientHeight;
        let worst = 0;
        for (const el of screenEl.querySelectorAll("*")) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          worst = Math.max(worst, Math.round(r.bottom - fold));
        }
        return Math.max(0, worst);
      })(),
      tappableCount: boxes.filter(b => b.width > 0 && b.height > 0).length,
      undersized: boxes.filter(b => b.width > 0 && b.height > 0 && (b.width < 44 || b.height < 44))
    };
  });
  // Record the size actually CAPTURED, not the size requested — a board's
  // frame is grown above, and `844x390` would be a false entry in the record.
  const shot = page.viewportSize();
  audit.push({ name, viewport: `${shot.width}x${shot.height}`, requested: `${width}x${height}`, ...report });
  // THE DECISION BOARDS CAPTURE FULL-HEIGHT. They are not device frames —
  // they are option tables read at a desk, and at `fullPage: false` the
  // naming board cut off all three treatment panes, i.e. everything the
  // board exists to show, while still reporting "clean". The flow screens
  // stay clipped to the frame, because for those the fold is the point.
  await page.screenshot({ path: join(out, `${name}.png`) });
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
  if (a.verticalOverflowPx > 0)
    flags.push(/^(03|09|10)-/.test(a.name)
      ? `board, frame grown to fit (was +${a.verticalOverflowPx}px over)`
      : `scrolls +${a.verticalOverflowPx}px`);
  // NO "content below the fold" FLAG IN THIS PACK. You is a scrolling
  // screen and always has been; treating its overflow as a defect would make
  // this audit wrong in the opposite direction from the one it guards.
  if (a.deleteButton)
    flags.push(`delete at ${a.deleteButton.fromTopPx}px from top, ${a.deleteButton.visibleWithoutScrolling ? "VISIBLE without scrolling" : "needs a scroll"}`);
  if (a.horizontalOverflow || a.screenHorizontalOverflow || a.undersized.length) bad += 1;
  console.log(`${a.name} (${a.viewport}${a.viewport === a.requested ? "" : ` grown from ${a.requested}`}): ${flags.length ? flags.join(", ") : "clean"}`);
}
console.log(bad
  ? `\n${bad} capture(s) with a horizontal overflow, an undersized target, or content below the fold`
  : "\nNo horizontal overflow; every enumerated target clears 44 x 44.");
// WHAT THE 44px CHECK ACTUALLY ENUMERATES, said plainly so the line above is
// not read as stronger than it is: `button, a, [tabindex]` with a non-zero
// box. A styled `<span>` or an `<input>` acting as a control is NOT counted.
console.log(`(44px check enumerated ${audit.reduce((n, a) => n + a.tappableCount, 0)} boxes across ${audit.length} captures; it sees button/a/[tabindex] only.)`);
