import { test, expect } from "@playwright/test";
import { RUN_ID, signInViaBackdoor } from "./helpers";

// Phase BL PR B — the You-screen re-test shortcut and the post-test
// prompt, against the real stack: one tap from the baseline fields
// reaches each designated test's start, and completing one lands in the
// post-save offer whose accepted numbers then appear in the You editor.
//
// Titles are literal strings, matching every other e2e file's precedent
// of not reaching into `domain/` from a Playwright spec.
const K6_TITLE = "6K Test";
const K2_TITLE = "2K Test";

test.describe("Phase BL: the You re-test shortcut", () => {
  test("one tap on ROW THE 6K reaches the 6k test's start", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: `retest-6k-${RUN_ID}@e2e.test`,
      name: "Retest Rower",
    });
    await page.goto("/you");
    await page.getByRole("button", { name: "ROW THE 6K" }).click();
    await expect(page).toHaveURL(/\/session\/countdown$/);
    await page.getByRole("button", { name: "SKIP ›" }).click();
    await expect(page).toHaveURL(/\/session\/run$/);
    // The designated 6k genuinely started, not some other workout.
    await expect(page.locator(".timer-name")).toHaveText(K6_TITLE);
  });

  test("one tap on RACE THE 2K reaches the 2k test's start, and completing it lands in the post-test prompt", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: `retest-2k-${RUN_ID}@e2e.test`,
      name: "Retest Racer",
    });
    await page.goto("/you");
    await page.getByRole("button", { name: "RACE THE 2K" }).click();
    await expect(page).toHaveURL(/\/session\/countdown$/);
    await page.getByRole("button", { name: "SKIP ›" }).click();
    await expect(page).toHaveURL(/\/session\/run$/);
    await expect(page.locator(".timer-name")).toHaveText(K2_TITLE);
    await expect(page.getByText(/^STEP 1 OF 1/)).toBeVisible();

    // A REALISTIC elapsed for 2000m — 8 minutes puts the measured split
    // right around 2:00.0/500m, inside the offer's own storable 60..240
    // band (the onboarding arc's 7-minute 6k, at 35 s/500m, is exactly
    // the implausible number the band exists to refuse). Same
    // Playwright-clock reasoning as onboarding.spec.ts: fastForward
    // advances the SAME Date the engine reads, so this elapsed is as
    // real as waiting eight minutes.
    await page.clock.install();
    await page.clock.fastForward("08:00");
    await page.getByRole("button", { name: "NEXT →" }).click();
    await expect(page.getByText("Finish this session?")).toBeVisible();
    await page.getByRole("button", { name: "Finish session" }).click();
    await expect(page).toHaveURL(/\/session\/log$/);

    // Fresh account, no plan chosen: Save without logging leads alone.
    await page.getByRole("button", { name: "Save without logging" }).click();

    // THE POST-SAVE PROMPT (spec M6: after the save, never above the
    // save stack) — the measured split offered as the 2k baseline.
    await expect(page.getByText("SESSION SAVED")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Set your 2k baseline?" }),
    ).toBeVisible();
    const measured = (await page
      .locator(".posttest-value")
      .textContent()) as string;
    expect(measured).toMatch(/^2:0/);

    // Accept -> the tested write, then the optional derive offer for the
    // missing 6k (accepted split + 7s).
    await page.getByRole("button", { name: "Set 2k baseline" }).click();
    await expect(
      page.getByRole("heading", { name: "Also set your 6k?" }),
    ).toBeVisible();
    const derived = (await page
      .locator(".posttest-value")
      .textContent()) as string;
    expect(derived).toMatch(/^2:0/);
    await page.getByRole("button", { name: "Set 6k estimate" }).click();
    await expect(page).toHaveURL(/\/today$/);

    // The loop closes where the numbers live: the You editor now shows
    // EXACTLY the two values the prompt displayed — recompute by eye:
    // derived is measured + 7s, and both render at fmtSplit's tenth.
    await page.goto("/you");
    await expect(page.locator(".baseline-value").first()).toHaveText(measured);
    await expect(page.locator(".baseline-value").nth(1)).toHaveText(derived);
  });

  test("declining the offer keeps the baselines untouched", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: `retest-decline-${RUN_ID}@e2e.test`,
      name: "Retest Decliner",
    });
    await page.goto("/you");
    await page.getByRole("button", { name: "RACE THE 2K" }).click();
    await page.getByRole("button", { name: "SKIP ›" }).click();
    await expect(page.locator(".timer-name")).toHaveText(K2_TITLE);
    await page.clock.install();
    await page.clock.fastForward("08:00");
    await page.getByRole("button", { name: "NEXT →" }).click();
    await page.getByRole("button", { name: "Finish session" }).click();
    await page.getByRole("button", { name: "Save without logging" }).click();
    await expect(
      page.getByRole("heading", { name: "Set your 2k baseline?" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Not now" }).click();
    await expect(page).toHaveURL(/\/today$/);

    // Still the untouched no-baseline account: Today shows the
    // no-baseline card, and the server pair is null/null.
    const baselines = await page.evaluate(async () => {
      const res = await fetch("/api/baselines");
      return (await res.json()) as {
        k2Seconds: number | null;
        k6Seconds: number | null;
      };
    });
    expect(baselines).toEqual({ k2Seconds: null, k6Seconds: null });
  });
});
