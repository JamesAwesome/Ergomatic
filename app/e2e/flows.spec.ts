import { test, expect } from "@playwright/test";
import { signInViaBackdoor } from "./helpers";

test.describe("health", () => {
  test("returns ok/db/version JSON", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as {
      ok: boolean;
      db: boolean;
      version: string;
    };
    expect(body.ok).toBe(true);
    expect(body.db).toBe(true);
    expect(typeof body.version).toBe("string");
  });
});

test.describe("sign-in screen", () => {
  test("unauthenticated / shows the sign-in screen", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: /continue with google/i }),
    ).toBeVisible();
  });

  test("?denied=x%40y.com shows the invite-refused notice", async ({
    page,
  }) => {
    await page.goto("/?denied=x%40y.com");
    await expect(page.getByRole("alert")).toContainText("x@y.com");
  });
});

test.describe("backdoor sign-in", () => {
  test("signs in, renders the shell + You card, then signs back out", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "flows@e2e.test",
      name: "Flows Tester",
    });
    await expect(
      page.getByRole("heading", { name: /ergomatic/i }),
    ).toBeVisible();
    await expect(page.getByText("flows@e2e.test")).toBeVisible();

    await page.getByRole("button", { name: /sign out/i }).click();
    await expect(
      page.getByRole("link", { name: /continue with google/i }),
    ).toBeVisible();
  });
});

test.describe("unauthenticated api", () => {
  test("/api/workouts 401s without a session", async ({ request }) => {
    const res = await request.get("/api/workouts");
    expect(res.status()).toBe(401);
  });
});
