// GATE 0 (half-set baselines) — throwaway capture spec.
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { signInViaBackdoor, stubBluetoothScanFailure } from "./helpers";

const OUT = process.env.GATE0_DIR ?? path.resolve(process.cwd(), "../gate0h");

async function setHalf(page: Page, body: object) {
  const ok = await page.evaluate(async (b) => {
    const res = await fetch("/api/baselines", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b),
    });
    return res.ok;
  }, body);
  expect(ok).toBe(true);
}

async function skip(page: Page) {
  const ok = await page.evaluate(async () => {
    const res = await fetch("/api/prefs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baselinesSkipped: true }),
    });
    return res.ok;
  });
  expect(ok).toBe(true);
}

test("today-half-2k", async ({ page }) => {
  await signInViaBackdoor(page, { email: "g0h-today2k@e2e.test" });
  await page.goto("/today");
  await setHalf(page, { k2Seconds: 112 });
  await skip(page);
  await page.reload();
  await page.locator(".today-nobaseline-row").waitFor();
  await page.screenshot({ path: path.join(OUT, "today-half-2k.png") });
});

test("today-half-6k", async ({ page }) => {
  await signInViaBackdoor(page, { email: "g0h-today6k@e2e.test" });
  await page.goto("/today");
  await setHalf(page, { k6Seconds: 122 });
  await skip(page);
  await page.reload();
  await page.locator(".today-nobaseline-row").waitFor();
  await page.screenshot({ path: path.join(OUT, "today-half-6k.png") });
});

test("today-none", async ({ page }) => {
  await signInViaBackdoor(page, { email: "g0h-todaynone@e2e.test" });
  await page.goto("/today");
  await skip(page);
  await page.reload();
  await page.locator(".today-nobaseline-row").waitFor();
  await page.screenshot({ path: path.join(OUT, "today-none.png") });
});

test("doors", async ({ page }) => {
  await signInViaBackdoor(page, { email: "g0h-doors@e2e.test" });
  await page.goto("/today");
  await page.locator(".doorscard").waitFor();
  await page.screenshot({ path: path.join(OUT, "doors.png") });
});

test("detail-half-2k", async ({ page }) => {
  await stubBluetoothScanFailure(page);
  await signInViaBackdoor(page, { email: "g0h-detail@e2e.test" });
  await page.goto("/today");
  await setHalf(page, { k2Seconds: 112 });
  await page.goto("/library");
  await page.getByPlaceholder("SEARCH BY NAME").fill("Laminar");
  await page.locator(".workout-row").first().click();
  await page.locator(".workout-detail-caption").waitFor();
  await page.screenshot({ path: path.join(OUT, "detail-half-2k.png") });
});
