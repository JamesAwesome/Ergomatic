import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signInViaBackdoor } from "./helpers";

// Structural design rules, asserted against the real rendered app rather
// than a mock — a failure here is a real finding about the shipped UI, not
// a fixture drift. See docs/superpowers/specs/2026-07-28-testing-
// validation-design.md ("no pixel-diff gating; machines judge rules").

async function assertTapTargets(page: Page): Promise<void> {
  const elements = await page
    .locator("a, button, [role=button], input, select")
    .all();
  for (const el of elements) {
    if (!(await el.isVisible())) continue;
    const box = await el.boundingBox();
    const label = await el.evaluate((node) => node.outerHTML.slice(0, 120));
    expect(box, `missing bounding box for: ${label}`).not.toBeNull();
    expect(box!.width, `width < 44 for: ${label}`).toBeGreaterThanOrEqual(44);
    expect(box!.height, `height < 44 for: ${label}`).toBeGreaterThanOrEqual(44);
  }
}

async function assertNoA11yViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

test.describe("sign-in screen (signed out)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  test("body background and primary button match the token palette", async ({
    page,
  }) => {
    const bodyBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(bodyBg).toBe("rgb(244, 241, 232)"); // --page

    const buttonBg = await page
      .getByRole("link", { name: /continue with google/i })
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(buttonBg).toBe("rgb(181, 52, 31)"); // --accent
  });
});

test.describe("signed-in home", () => {
  test.beforeEach(async ({ page }) => {
    await signInViaBackdoor(page, {
      email: "design@e2e.test",
      name: "Design Tester",
    });
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  test("body background matches the token palette", async ({ page }) => {
    const bodyBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(bodyBg).toBe("rgb(244, 241, 232)"); // --page
  });
});

test.describe("library screen", () => {
  test.beforeEach(async ({ page }) => {
    await signInViaBackdoor(page, {
      email: "design-library@e2e.test",
      name: "Design Library Tester",
    });
    await page.goto("/library");
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  test("body background and the active filter chip match the token palette", async ({
    page,
  }) => {
    const bodyBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(bodyBg).toBe("rgb(244, 241, 232)"); // --page

    // No filters applied on first load, so the "ALL" chip is the active
    // (aria-pressed) one — see FilterChips.tsx's isEmptyFilters.
    const allChipBg = await page
      .getByRole("button", { name: "ALL", exact: true })
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(allChipBg).toBe("rgb(181, 52, 31)"); // --accent
  });
});

test.describe("workout detail screen", () => {
  test.beforeEach(async ({ page }) => {
    await signInViaBackdoor(page, {
      email: "design-detail@e2e.test",
      name: "Design Detail Tester",
    });
    await page.goto("/library");
    await page.locator(".workout-row").first().click();
    await expect(page.locator(".workout-detail-title")).toBeVisible();
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  test("body background and the back link match the token palette", async ({
    page,
  }) => {
    const bodyBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(bodyBg).toBe("rgb(244, 241, 232)"); // --page

    const backLinkColor = await page
      .locator(".back-link")
      .evaluate((el) => getComputedStyle(el).color);
    expect(backLinkColor).toBe("rgb(27, 26, 23)"); // --ink
  });
});

test.describe("you screen", () => {
  test.beforeEach(async ({ page }) => {
    await signInViaBackdoor(page, {
      email: "design-you@e2e.test",
      name: "Design You Tester",
    });
    await page.goto("/you");
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  test("body background and a baseline value match the token palette", async ({
    page,
  }) => {
    const bodyBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(bodyBg).toBe("rgb(244, 241, 232)"); // --page

    const baselineValueColor = await page
      .locator(".baseline-value")
      .first()
      .evaluate((el) => getComputedStyle(el).color);
    expect(baselineValueColor).toBe("rgb(181, 52, 31)"); // --accent
  });
});
