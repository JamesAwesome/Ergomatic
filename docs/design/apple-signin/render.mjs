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

const shots = [
  ["entry-current-proposed-landscape", "compare", "native", "landscape", 844, 390],
  ["before-signin-native-portrait", "before", "native", "portrait", 390, 844],
  ["before-signin-native-landscape", "before", "native", "landscape", 844, 390],
  ["after-signin-native-portrait", "welcome", "native", "portrait", 390, 844],
  ["after-signin-native-landscape", "welcome", "native", "landscape", 844, 390],
  ["after-signin-web-portrait", "welcome", "web", "portrait", 390, 844],
  ["after-signin-web-landscape", "welcome", "web", "landscape", 844, 390],
  ["create-account-apple-relay", "create-apple", "native", "portrait", 390, 844],
  ["create-account-apple-relay-landscape", "create-apple", "native", "landscape", 844, 390],
  ["create-account-apple-missing-email", "apple-missing-email", "native", "portrait", 390, 844],
  ["you-google-connected-add-apple", "you-google", "native", "portrait", 390, 844],
  ["you-google-connected-add-apple-landscape", "you-google", "native", "landscape", 844, 390],
  ["you-apple-connected-add-google", "you-apple", "native", "portrait", 390, 844],
  ["link-confirm-usual-provider", "link-apple-confirm", "native", "portrait", 390, 844],
  ["link-confirm-usual-provider-landscape", "link-apple-confirm", "native", "landscape", 844, 390],
  ["link-authorize-other-provider", "link-apple-authorize", "native", "portrait", 390, 844],
  ["link-success", "link-success-apple", "native", "portrait", 390, 844],
  ["link-reverse-google-confirm", "link-google-confirm", "native", "portrait", 390, 844],
  ["link-reverse-google-success", "link-success-google", "native", "portrait", 390, 844],
  ["link-conflict", "link-conflict", "native", "portrait", 390, 844],
  ["link-expired-restart", "link-retry", "native", "portrait", 390, 844],
  ["link-account-changed-restart", "link-account-changed", "native", "portrait", 390, 844],
  ["link-account-changed-restart-landscape", "link-account-changed", "native", "landscape", 844, 390]
];

const browser = await chromium.launch({ headless: true });
const audit = [];
for (const [name, screen, platform, orientation, width, height] of shots) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const target = `${url}?capture=1&screen=${screen}&platform=${platform}&orientation=${orientation}`;
  await page.goto(target, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const report = await page.evaluate(() => {
    const tappables = [...document.querySelectorAll("button, a, [tabindex]")].map(el => {
      const r = el.getBoundingClientRect();
      return { text: el.textContent.trim().replace(/\s+/g, " "), width: r.width, height: r.height };
    });
    return {
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      screenScrollWidth: document.querySelector(".app-screen").scrollWidth,
      screenClientWidth: document.querySelector(".app-screen").clientWidth,
      screenHorizontalOverflow: document.querySelector(".app-screen").scrollWidth > document.querySelector(".app-screen").clientWidth,
      undersized: tappables.filter(item => item.width > 0 && item.height > 0 && (item.width < 44 || item.height < 44)),
      tappables
    };
  });
  audit.push({ name, ...report });
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: false });
  await page.close();
}
await browser.close();
await writeFile(join(out, "layout-audit.json"), JSON.stringify(audit, null, 2) + "\n");
console.log(`Rendered ${shots.length} captures to ${out}`);
for (const item of audit) {
  console.log(`${item.name}: overflow=${item.horizontalOverflow || item.screenHorizontalOverflow}, undersized=${item.undersized.length}`);
}
