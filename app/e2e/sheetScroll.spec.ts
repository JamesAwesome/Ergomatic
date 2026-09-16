// WebKit regression: the log scrolls in its own fixed element, not window.
// Chromium does not chain this backdrop gesture to that ancestor, so its
// passing body-lock test cannot establish the iOS behavior.
import { test, expect } from "@playwright/test";
import { signInViaBackdoor } from "./helpers";

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`the log stays put behind its source sheet and scrolls again after close (${viewport.width}x${viewport.height})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await signInViaBackdoor(page, {
      email: `touch-log-${viewport.width}@e2e.test`,
      name: "Scroll",
    });
    {
      // WebKit rejects Secure cookies on this HTTP loopback harness. Keep
      // the real backdoor session, changing only its browser transport flag.
      const cookies = await page.context().cookies();
      await page
        .context()
        .addCookies(cookies.map((cookie) => ({ ...cookie, secure: false })));
      await page.goto("/");
    }
    // A real saved machine workout with enough intervals to overflow in BOTH
    // orientations. The former two-interval fixture hid the scroll owner.
    const id = await page.evaluate(async () => {
      const response = await fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workoutId: null,
          workoutTitle: "Ten 500m intervals",
          workoutType: "AT",
          source: "pm5",
          deviceName: "PM5 432331249",
          endedBy: "finished",
          held: "under",
          effort: 3,
          notes: null,
          advancesPlan: false,
          avgSplitSeconds: 120,
          timeSeconds: 1200,
          distanceMeters: 5000,
          machineWorkSeconds: 1200,
          machineWorkMeters: 5000,
          machineSummary: {
            avgPaceSecondsPer500m: 120,
            avgStrokeRate: 26,
            dragFactorAverage: 124,
            totalCalories: 330,
            avgWatts: 203,
            avgCalPerHour: 990,
          },
          steps: Array.from({ length: 10 }, () => ({
            label: "500m @ 2:00.0",
            targetSplit: 120,
            actualSplit: 120,
            actualSeconds: 120,
            actualSource: "pm5",
            meters: 500,
            actualMeters: 500,
            actualSpm: 26,
            spm: 26,
            machineCalories: 33,
            machineWatts: 203,
            machineCalPerHour: 990,
            machineDragFactor: 124,
          })),
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      return ((await response.json()) as { id: string }).id;
    });
    await page.goto(`/today/log/${id}`);
    await expect(
      page.getByRole("heading", { name: "Ten 500m intervals" }),
    ).toBeVisible();
    const log = page.getByRole("main");
    const scrimX = (await log.boundingBox())!.x + 10;
    expect(
      await log.evaluate((el) => el.scrollHeight - el.clientHeight),
    ).toBeGreaterThan(200);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    // Positive control: this exact scrim-coordinate gesture scrolls the log
    // before opening. Window.scrollY is not the log's position.
    await page.mouse.move(scrimX, viewport.height - 100);
    await page.mouse.wheel(0, 300);
    // Wait for the wheel's full delta, not a wall-clock slice of its scroll.
    // Linux CI once sampled 167px mid-scroll and reached 300px after opening.
    await expect.poll(() => log.evaluate((el) => el.scrollTop)).toBe(300);
    const before = await log.evaluate((el) => el.scrollTop);
    expect(before).toBeGreaterThan(50);
    await page
      .getByRole("button", { name: /where these numbers come from/i })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    expect(await log.evaluate((el) => el.scrollTop)).toBe(before);
    expect(
      await page.evaluate(
        ([x, y]) => document.elementFromPoint(x!, y!)?.className,
        [scrimX, viewport.height - 100],
      ),
    ).toContain("filter-sheet-backdrop");
    await page.mouse.move(scrimX, viewport.height - 100);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(350);
    expect(await log.evaluate((el) => el.scrollTop)).toBe(before);
    await expect(dialog).toBeVisible();
    if (viewport.height === 390) {
      expect(
        await dialog.evaluate((el) => el.scrollHeight - el.clientHeight),
      ).toBeGreaterThan(50);
      await page.mouse.move(viewport.width / 2, 220);
      await page.mouse.wheel(0, 600);
      await expect
        .poll(() => dialog.evaluate((el) => el.scrollTop))
        .toBeGreaterThan(0);
      expect(await log.evaluate((el) => el.scrollTop)).toBe(before);
    }
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(await log.evaluate((el) => el.scrollTop)).toBe(before);
    await page.mouse.move(scrimX, viewport.height - 100);
    await page.mouse.wheel(0, 300);
    await expect
      .poll(() => log.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(before + 50);
  });
}
