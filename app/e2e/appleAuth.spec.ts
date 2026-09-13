import { expect, test, type Page } from "@playwright/test";
import { LIBRARY_WORKOUTS } from "../server/seed/library/index.js";
import { fromWorkout, toSteps } from "../src/builder/builderState.js";
import { signInViaBackdoor } from "./helpers.js";

const options = {
  frontDoorEnabled: true,
  apple: { native: true, web: true },
  google: { native: true, web: true },
};

async function enableFrontDoor(page: Page): Promise<void> {
  await page.route("**/api/auth/options", (route) =>
    route.fulfill({ status: 200, json: options }),
  );
}

test("Apple welcome begins at the real control and resumes into explicit account confirmation", async ({
  page,
}) => {
  await enableFrontDoor(page);
  await page.route("**/api/me", (route) =>
    route.fulfill({ status: 401, json: { error: "unauthenticated" } }),
  );
  await page.route("**/api/auth/web/attempts", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toStrictEqual({
      purpose: "signin",
      provider: "apple",
    });
    await route.fulfill({
      status: 200,
      json: {
        outcome: "authorize",
        attemptId: "apple-signup",
        purpose: "signin",
        targetProvider: "apple",
        expiresAt: "2026-09-13T00:05:00.000Z",
        provider: "apple",
        stage: "signin",
        nonce: "server-only-nonce",
        state: "server-only-state",
        authorizationUrl: "/?authAttempt=apple-signup",
      },
    });
  });
  await page.route("**/api/auth/web/attempts/apple-signup", (route) =>
    route.fulfill({
      status: 200,
      json: {
        outcome: "confirm",
        attemptId: "apple-signup",
        purpose: "signin",
        targetProvider: "apple",
        expiresAt: "2026-09-13T00:05:00.000Z",
        profile: {
          name: "Rower",
          email: "9m3x7k2p1r@privaterelay.appleid.com",
        },
      },
    }),
  );

  await page.goto("/");
  const providerButtons = page.locator(".auth-provider-button");
  await expect(providerButtons).toHaveText([
    "Continue with Apple",
    "Continue with Google",
  ]);
  await page.getByRole("button", { name: "Continue with Apple" }).click();
  await expect(
    page.getByRole("heading", { name: "Create your account" }),
  ).toBeVisible();
  await expect(page.getByText("Rower", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/^(?!.*authAttempt)/);
});

test("linking Apple proves Google then Apple and preserves the signed-in account's real workout", async ({
  page,
}, testInfo) => {
  let linked = false;
  let resumes = 0;
  await enableFrontDoor(page);
  await page.route("**/api/auth/methods", (route) =>
    route.fulfill({
      status: 200,
      json: { apple: linked, google: true },
    }),
  );
  await page.route("**/api/auth/web/attempts", async (route) => {
    expect(route.request().postDataJSON()).toStrictEqual({
      purpose: "link",
      provider: "apple",
    });
    await route.fulfill({
      status: 200,
      json: {
        outcome: "authorize",
        attemptId: "link-apple",
        purpose: "link",
        targetProvider: "apple",
        expiresAt: "2026-09-13T00:05:00.000Z",
        provider: "google",
        stage: "reauth",
        nonce: "google-nonce",
        state: "google-state",
        authorizationUrl: "/?authAttempt=link-apple&proof=google",
      },
    });
  });
  await page.route("**/api/auth/web/attempts/link-apple", async (route) => {
    resumes += 1;
    await route.fulfill({
      status: 200,
      json:
        resumes === 1
          ? {
              outcome: "authorize",
              attemptId: "link-apple",
              purpose: "link",
              targetProvider: "apple",
              expiresAt: "2026-09-13T00:05:00.000Z",
              provider: "apple",
              stage: "target",
              nonce: "apple-nonce",
              state: "apple-state",
              authorizationUrl: "/?authAttempt=link-apple&proof=apple",
            }
          : {
              outcome: "link_ready",
              attemptId: "link-apple",
              purpose: "link",
              targetProvider: "apple",
              expiresAt: "2026-09-13T00:05:00.000Z",
            },
    });
  });
  await page.route(
    "**/api/auth/web/attempts/link-apple/finalize",
    async (route) => {
      linked = true;
      await route.fulfill({ status: 200, json: { outcome: "linked" } });
    },
  );

  await signInViaBackdoor(page, {
    email: `apple-link-${testInfo.parallelIndex}@e2e.test`,
    name: "Apple Link Tester",
  });

  const source = LIBRARY_WORKOUTS.find(
    (workout) => workout.title === "Sea Fret",
  )!;
  const title = `Apple link continuity ${testInfo.parallelIndex}`;
  const form = fromWorkout({ ...source, title });
  const resolved = toSteps(form);
  expect(resolved.ok).toBe(true);
  if (!resolved.ok) throw new Error("real workout fixture did not resolve");
  const created = await page.evaluate(
    async (workout) => {
      const response = await fetch("/api/workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(workout),
      });
      return { ok: response.ok, body: await response.text() };
    },
    { title, type: source.type, effort: source.effort, steps: resolved.steps },
  );
  expect(created.ok, created.body).toBe(true);

  try {
    await page.goto("/you");
    await page.getByRole("button", { name: "Add Apple" }).click();
    await expect(
      page.getByRole("heading", { name: "Add Apple" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirm with Google" }).click();
    await expect(page.getByLabel("Usual sign-in confirmed")).toBeVisible();
    await page.getByRole("button", { name: "Continue with Apple" }).click();
    await expect(page.getByRole("status")).toHaveText(
      "Apple is now connected. You can sign in either way.",
    );
    await expect(page.locator(".auth-method-connected")).toHaveCount(2);

    const account = await page.evaluate(async (workoutTitle) => {
      const [meResponse, workoutsResponse] = await Promise.all([
        fetch("/api/me"),
        fetch("/api/workouts"),
      ]);
      const me = (await meResponse.json()) as { user: { email: string } };
      const workouts = (await workoutsResponse.json()) as Array<{
        title: string;
        isGlobal: boolean;
      }>;
      return {
        email: me.user.email,
        retained: workouts.some(
          (workout) => !workout.isGlobal && workout.title === workoutTitle,
        ),
      };
    }, title);
    expect(account.email).toContain("apple-link-");
    expect(account.retained).toBe(true);
  } finally {
    await page.evaluate(async (workoutTitle) => {
      const response = await fetch("/api/workouts");
      const workouts = (await response.json()) as Array<{
        id: string;
        title: string;
        isGlobal: boolean;
      }>;
      const match = workouts.find(
        (workout) => !workout.isGlobal && workout.title === workoutTitle,
      );
      if (match) await fetch(`/api/workouts/${match.id}`, { method: "DELETE" });
    }, title);
  }
});
