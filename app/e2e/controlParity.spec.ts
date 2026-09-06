import { expect, test } from "@playwright/test";
import { signInViaBackdoor } from "./helpers";

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`unsupported browser keeps Connect inactive at every door (${viewport.width}x${viewport.height})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "bluetooth", {
        value: undefined,
        configurable: true,
      });
    });
    await signInViaBackdoor(page, {
      email: `control-parity-${viewport.width}@e2e.test`,
      name: "Control Parity Tester",
    });
    await page.goto("/library");
    await page.locator(".workout-row").first().click();
    await expect(page.locator(".workout-detail-title")).toBeVisible();
    const connect = page.getByRole("button", { name: "Connect", exact: true });
    await expect(connect).toBeDisabled();
    // Native click() deliberately bypasses Playwright's disabled-action wait.
    // It must not mount a connection flow or any staged replacement warning.
    await connect.evaluate((button: HTMLButtonElement) => button.click());
    await expect(page.locator(".workout-detail-title")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Connect anyway" }),
    ).toHaveCount(0);
    await expect(page.locator(".connected-interstitial")).toHaveCount(0);

    await page.goto("/justrow");
    await expect(connect).toBeDisabled();
    await connect.evaluate((button: HTMLButtonElement) => button.click());
    await expect(
      page.getByRole("button", { name: "Start Timer", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByRole("heading", { name: "Could not connect" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Connect anyway" }),
    ).toHaveCount(0);
    await page.goto("/justrow/observe");
    await expect(connect).toBeDisabled();
    await connect.evaluate((button: HTMLButtonElement) => button.click());
    await expect(
      page.getByRole("heading", { name: "Not connected", exact: true }),
    ).toBeVisible();
  });
}

test("the injected development monitor still connects without Web Bluetooth", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "bluetooth", {
      value: undefined,
      configurable: true,
    });
    window.__pm5FakeScript__ = {
      program: { intervals: [] },
      deviceName: "PM5 Parity",
    };
  });
  await signInViaBackdoor(page, {
    email: "control-parity-fake@e2e.test",
    name: "Control Parity Tester",
  });
  await page.goto("/justrow/observe");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "PM5 Parity connected" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Not connected", exact: true }),
  ).toBeVisible();
});
