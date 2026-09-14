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

test("a web access denial keeps the verified email and scrubs auth return parameters", async ({
  page,
}) => {
  await enableFrontDoor(page);
  await page.route("**/api/me", (route) =>
    route.fulfill({ status: 401, json: { error: "unauthenticated" } }),
  );

  await page.goto(
    "/?keep=1&authError=access_denied&authEmail=relay%40privaterelay.appleid.com&authPurpose=signin&authProvider=apple#return",
  );

  await expect(page.getByRole("alert")).toHaveText(
    "relay@privaterelay.appleid.com isn't invited to this Ergomatic. Ask James to add you.",
  );
  await expect(page).toHaveURL(/\?keep=1#return$/);
  await expect(
    page.getByRole("button", { name: "Continue with Apple" }),
  ).toBeVisible();
});

test("signed-in methods disable Add when either proof is unavailable and idle deep links return to You", async ({
  page,
}, testInfo) => {
  await page.route("**/api/auth/options", (route) =>
    route.fulfill({
      status: 200,
      json: {
        ...options,
        apple: { native: true, web: false },
      },
    }),
  );
  await page.route("**/api/auth/methods", (route) =>
    route.fulfill({ status: 200, json: { apple: false, google: true } }),
  );
  await signInViaBackdoor(page, {
    email: `apple-unavailable-${testInfo.parallelIndex}@e2e.test`,
    name: "Apple Link Tester",
  });

  await page.goto("/you");
  await expect(page.getByText("CONNECTED")).toBeVisible();
  const addApple = page.getByRole("button", { name: "Add Apple" });
  await expect(addApple).toBeDisabled();
  const disabledStyles = await addApple.evaluate((row) => {
    const action = row.querySelector<HTMLElement>(".auth-method-action");
    if (!action) throw new Error("Add action label missing");
    return {
      rowColor: getComputedStyle(row).color,
      rowCursor: getComputedStyle(row).cursor,
      actionColor: getComputedStyle(action).color,
      actionCursor: getComputedStyle(action).cursor,
    };
  });
  expect(disabledStyles.actionColor).toBe(disabledStyles.rowColor);
  expect(disabledStyles.rowCursor).toBe("not-allowed");
  expect(disabledStyles.actionCursor).toBe("not-allowed");

  await page.goto("/you/sign-in-methods");
  await expect(page).toHaveURL(/\/you$/);
  await expect(
    page.getByRole("heading", { name: "SIGN-IN METHODS" }),
  ).toBeVisible();
});

test("a lost cancel response retains cleanup authority and retries before a new sign-in", async ({
  page,
}) => {
  let cancellations = 0;
  let starts = 0;
  await enableFrontDoor(page);
  await page.route("**/api/me", (route) =>
    route.fulfill({ status: 401, json: { error: "unauthenticated" } }),
  );
  await page.route("**/api/auth/web/attempts/cancel-delivery", (route) =>
    route.fulfill({
      status: 200,
      json: {
        outcome: "confirm",
        attemptId: "cancel-delivery",
        purpose: "signin",
        targetProvider: "apple",
        expiresAt: "2026-09-13T00:05:00.000Z",
        profile: { email: "relay@apple.test", name: "Rower" },
      },
    }),
  );
  await page.route(
    "**/api/auth/web/attempts/cancel-delivery/cancel",
    async (route) => {
      cancellations += 1;
      if (cancellations === 1) {
        await route.abort("connectionfailed");
      } else {
        await route.fulfill({ status: 204 });
      }
    },
  );
  await page.route("**/api/auth/web/attempts", async (route) => {
    starts += 1;
    await route.fulfill({
      status: 200,
      json: {
        outcome: "authorize",
        attemptId: "replacement",
        purpose: "signin",
        targetProvider: "apple",
        expiresAt: "2026-09-13T00:05:00.000Z",
        provider: "apple",
        stage: "signin",
        nonce: "new-nonce",
        state: "new-state",
        authorizationUrl:
          "/?authResult=cancelled&authPurpose=signin&authProvider=apple",
      },
    });
  });

  await page.goto("/?authAttempt=cancel-delivery");
  await page.getByRole("button", { name: "← BACK" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "That sign-in didn’t work. Give it another try.",
  );
  expect(cancellations).toBe(1);

  await page.getByRole("button", { name: "Continue with Apple" }).click();
  await expect.poll(() => cancellations).toBe(2);
  await expect.poll(() => starts).toBe(1);
  await expect(page).toHaveURL(/^(?!.*authResult)/);
});

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

    await page.getByRole("link", { name: "LIBRARY", exact: true }).click();
    await expect(page).toHaveURL(/\/library$/);
    await expect(
      page.getByRole("link", { name: "LIBRARY", exact: true }),
    ).toHaveAttribute("aria-current", "page");
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

test("a lost finalize response reports uncertainty without claiming failure or success", async ({
  page,
}, testInfo) => {
  let finalizations = 0;
  await enableFrontDoor(page);
  await page.route("**/api/auth/methods", (route) =>
    route.fulfill({
      status: 200,
      json: { apple: true, google: true },
    }),
  );
  await page.route("**/api/auth/web/attempts/lost-finalize", (route) =>
    route.fulfill({
      status: 200,
      json: {
        outcome: "link_ready",
        attemptId: "lost-finalize",
        purpose: "link",
        targetProvider: "apple",
        expiresAt: "2026-09-13T00:05:00.000Z",
      },
    }),
  );
  await page.route(
    "**/api/auth/web/attempts/lost-finalize/finalize",
    async (route) => {
      finalizations += 1;
      expect(route.request().method()).toBe("POST");
      expect(route.request().postDataJSON()).toStrictEqual({});
      await route.abort("connectionfailed");
    },
  );
  await signInViaBackdoor(page, {
    email: `apple-lost-finalize-${testInfo.parallelIndex}@e2e.test`,
    name: "Apple Link Tester",
  });

  await page.goto("/?authAttempt=lost-finalize");
  await expect(page.getByRole("alert")).toHaveText(
    "We couldn’t confirm the result. Check your sign-in methods and try again.",
  );
  expect(finalizations).toBe(1);
  await expect(page.locator(".auth-method-connected")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Add Apple" })).toHaveCount(0);
  await expect(page.getByText(/Nothing changed/)).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveCount(0);

  await page.getByRole("link", { name: "LIBRARY", exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(
    page.getByRole("link", { name: "LIBRARY", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

test("a cancelled link return sends the rower to You once and releases ordinary navigation", async ({
  page,
}, testInfo) => {
  await enableFrontDoor(page);
  await page.route("**/api/auth/methods", (route) =>
    route.fulfill({
      status: 200,
      json: { apple: false, google: true },
    }),
  );
  await signInViaBackdoor(page, {
    email: `apple-cancel-navigation-${testInfo.parallelIndex}@e2e.test`,
    name: "Apple Link Tester",
  });

  await page.goto("/?authResult=cancelled&authPurpose=link&authProvider=apple");
  await expect(page).toHaveURL(/\/you$/);
  await expect(
    page.getByRole("heading", { name: "SIGN-IN METHODS" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "LIBRARY", exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(
    page.getByRole("link", { name: "LIBRARY", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});
