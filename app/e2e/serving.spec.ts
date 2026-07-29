import { test, expect } from "@playwright/test";

// Structural assertions on the nginx serving topology (spec 2026-07-29).
// Complements flows.spec.ts (which already exercises /api through the
// proxy via the sign-in backdoor) with what only headers can prove.
test.describe("serving topology", () => {
  test("deep links fall back to the SPA shell", async ({ page }) => {
    await page.goto("/workouts/some-future-route");
    await expect(
      page.getByRole("heading", { name: "Ergomatic" }),
    ).toBeVisible();
  });

  test("index.html is no-cache; hashed assets are immutable", async ({
    request,
  }) => {
    const index = await request.get("/");
    expect(index.headers()["cache-control"]).toContain("no-cache");
    const asset = (await index.text()).match(/\/assets\/[^"]+\.js/)?.[0];
    expect(asset, "index.html should reference a hashed JS asset").toBeTruthy();
    const res = await request.get(asset!);
    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"]).toContain("immutable");
  });
});
