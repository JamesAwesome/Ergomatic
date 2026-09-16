// THE SPECS THAT NEED A REAL FINGER. This file runs under the `touch`
// project (`playwright.config.ts`), the only one with `hasTouch: true` —
// without it a dispatched touch is inert and any gesture assertion passes
// whatever the code does.
import { test, expect } from "@playwright/test";
import { signInViaBackdoor } from "./helpers";

test("the page behind an open sheet does not scroll", async ({ page }) => {
  // James, 2026-09-15, reading a sheet on his phone: "the screen behind it
  // can still scroll". The lock lives in SheetShell, so every sheet had it.
  //
  // LIBRARY, because it is the one surface whose seeded list is reliably
  // taller than the viewport — Today's fixture and a two-interval log both
  // measure EXACTLY 0 scroll room, and earlier versions of this leg sat on
  // both and were vacuous.
  //
  // A TOUCH DRAG, because a wheel over the backdrop does not move this
  // document even with the lock deleted.
  await signInViaBackdoor(page, { email: "touch-lock@e2e.test", name: "T" });
  await page.goto("/library");
  await expect(page.getByRole("button", { name: "FILTER ⌄" })).toBeVisible();

  const room = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
  expect(
    room,
    "the page must be scrollable or this proves nothing",
  ).toBeGreaterThan(200);

  await page.evaluate(() => window.scrollTo(0, 150));
  await page.getByRole("button", { name: "FILTER ⌄" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  const before = await page.evaluate(() => window.scrollY);
  // Drag upward over the backdrop, clear of the sheet itself. NO tap first:
  // the backdrop's own onClick dismisses the sheet, so a "wake up touch" tap
  // closed the modal and the drag then scrolled a page with nothing open —
  // 150 to 345, which is how this assertion first went red for the wrong
  // reason. That it moved at all is the proof this gesture works.
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", y: number) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x: 195, y }],
    });
  await touch("touchStart", 120);
  for (let y = 110; y >= 20; y -= 15) await touch("touchMove", y);
  await touch("touchEnd", 20);
  await page.waitForTimeout(250);

  expect(await page.evaluate(() => window.scrollY)).toBe(before);
  await expect(page.getByRole("dialog")).toBeVisible();
});
