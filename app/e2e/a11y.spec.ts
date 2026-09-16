import { expect, test, type Page } from "@playwright/test";
import { analyzeAccessibility } from "./a11y";
import { signInViaBackdoor } from "./helpers";

// Page has a runtime emitter; its public types omit this
// diagnostic. Inspect the actual listener list, not a mocked on/off pair.
const frameListeners = (page: Page) =>
  (
    page as Page & { listenerCount(event: "frameattached"): number }
  ).listenerCount("frameattached");

test("single-frame audits do not allocate an aggregation page", async ({
  page,
  context,
}) => {
  await page.setContent(
    '<html lang="en"><title>Audit</title><main><h1>Audit</h1></main></html>',
  );
  let opened = 0;
  const onPage = () => {
    opened += 1;
  };
  context.on("page", onPage);
  const listeners = frameListeners(page);
  try {
    expect((await analyzeAccessibility(page)).violations).toEqual([]);
    expect(opened).toBe(0);
    expect(frameListeners(page)).toBe(listeners);
  } finally {
    context.off("page", onPage);
  }
});

test("FILTER audit retains document, background, sheet and contrast violations", async ({
  page,
}) => {
  await signInViaBackdoor(page, {
    email: "a11y-coverage@e2e.test",
    name: "Audit coverage",
  });
  await page.goto("/library");
  await expect(page.locator(".workout-row").first()).toBeVisible();
  await page.getByRole("button", { name: "FILTER ⌄" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const rows = await page.locator(".workout-row").count();
  expect(rows).toBeGreaterThan(300);
  await page.evaluate(() => {
    document.documentElement.removeAttribute("lang");
    const row = document.querySelector<HTMLAnchorElement>(".workout-row")!;
    row.id = "unnamed-workout";
    row.replaceChildren();
    row.removeAttribute("aria-label");
    row.removeAttribute("aria-labelledby");
    row.removeAttribute("title");
    const dialog = document.querySelector('[role="dialog"]')!;
    const button = document.createElement("button");
    button.id = "unnamed-sheet-button";
    button.style.cssText = "width:44px;height:44px";
    const contrast = document.createElement("p");
    contrast.id = "bad-sheet-contrast";
    contrast.textContent = "Contrast witness";
    contrast.style.cssText =
      "color:rgb(238,238,238);background:white;font-size:16px";
    dialog.prepend(button, contrast);
  });
  expect(
    await page.locator("#bad-sheet-contrast").evaluate((el) => {
      const style = getComputedStyle(el);
      return [style.color, style.backgroundColor];
    }),
  ).toEqual(["rgb(238, 238, 238)", "rgb(255, 255, 255)"]);
  // sRGB relative luminance: #eee on white = 1.16:1, below 4.5:1.
  const contrastRatio = 1.05 / (((238 / 255 + 0.055) / 1.055) ** 2.4 + 0.05);
  expect(contrastRatio).toBeCloseTo(1.16, 2);
  const result = await analyzeAccessibility(page);
  for (const [id, target] of [
    ["html-has-lang", "html"],
    ["link-name", "#unnamed-workout"],
    ["button-name", "#unnamed-sheet-button"],
    ["color-contrast", "#bad-sheet-contrast"],
  ]) {
    expect(
      result.violations
        .find((v) => v.id === id)
        ?.nodes.map((node) => node.target),
    ).toContainEqual([target]);
  }
  await page.reload();
  await page.getByRole("button", { name: "FILTER ⌄" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await page.locator(".workout-row").count()).toBe(rows);
  expect((await analyzeAccessibility(page)).violations).toEqual([]);
});

test("cross-origin frames retain their own accessibility violations", async ({
  page,
  context,
}) => {
  await context.route("https://audit-parent.test/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<html lang="en"><title>Parent</title><main><h1>Parent</h1><iframe title="Child" src="https://audit-child.test/"></iframe></main></html>',
    }),
  );
  await context.route("https://audit-child.test/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<html lang="en"><title>Child</title><main><h1>Child</h1><img id="missing-alt" width="40" height="40" src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'40\' height=\'40\'/%3E"></main></html>',
    }),
  );
  await page.goto("https://audit-parent.test/");
  await expect(
    page.frameLocator("iframe").locator("#missing-alt"),
  ).toBeVisible();
  expect(
    page
      .frames()
      .map((frame) => new URL(frame.url()).origin)
      .sort(),
  ).toEqual(["https://audit-child.test", "https://audit-parent.test"]);
  const result = await analyzeAccessibility(page);
  expect(
    result.violations
      .find((v) => v.id === "image-alt")
      ?.nodes.map((node) => node.target),
  ).toContainEqual(["iframe", "#missing-alt"]);
});

test("a frame attached and removed during a single-frame audit fails closed and cleans up", async ({
  page,
}) => {
  await page.setContent(
    '<html lang="en"><title>Audit</title><main><h1>Audit</h1></main></html>',
  );
  // Native axe injection crosses this accessor AFTER the helper's census.
  // The child is real, but gone before audit completion: final census alone
  // cannot protect the coverage invariant.
  await page.evaluate(() => {
    Object.defineProperty(window, "axe", {
      configurable: true,
      set(value: unknown) {
        Object.defineProperty(window, "axe", {
          configurable: true,
          writable: true,
          value,
        });
        const frame = document.createElement("iframe");
        document.body.append(frame);
        frame.remove();
      },
    });
  });
  const listeners = frameListeners(page);
  await expect(analyzeAccessibility(page)).rejects.toThrow(
    "Frame attached during single-frame accessibility audit",
  );
  expect(page.frames()).toHaveLength(1);
  expect(frameListeners(page)).toBe(listeners);
});

test("a failed analysis also removes its frame listener", async ({ page }) => {
  await page.close();
  const listeners = frameListeners(page);
  await expect(analyzeAccessibility(page)).rejects.toThrow();
  expect(frameListeners(page)).toBe(listeners);
});
