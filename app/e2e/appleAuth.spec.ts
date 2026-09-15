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
    "relay@privaterelay.appleid.com isn't invited to this Ergomatic. Ask the owner to add you.",
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

// -- Wave A PR 1 Task 4: removing a method, and deleting the account -------

test("removing a method re-reads the list rather than trusting the screen", async ({
  page,
}, testInfo) => {
  let removed = false;
  let unlinks = 0;
  await enableFrontDoor(page);
  await page.route("**/api/auth/methods", (route) =>
    route.fulfill({
      status: 200,
      json: removed
        ? { apple: false, google: true }
        : { apple: true, google: true },
    }),
  );
  await page.route("**/api/auth/methods/apple", async (route) => {
    unlinks += 1;
    removed = true;
    // EVERY unlink outcome is HTTP 200 — a screen that reads the status
    // learns nothing. The refusal case below proves the other half.
    await route.fulfill({
      status: 200,
      json: { outcome: "unlinked", appleRevoked: true },
    });
  });
  await signInViaBackdoor(page, {
    email: `remove-method-${testInfo.parallelIndex}@e2e.test`,
    name: "Remove Tester",
  });

  await page.goto("/you");
  const removals = page.getByRole("button", { name: /^Remove / });
  await expect(removals).toHaveCount(2);
  // 44px is a hard requirement, and an inline control's own box cannot
  // prove it — this is a real button, so its bounding box is the answer.
  const box = await page
    .getByRole("button", { name: "Remove Apple" })
    .boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);

  await page.getByRole("button", { name: "Remove Apple" }).click();
  await expect(page.getByRole("button", { name: "Add Apple" })).toBeVisible();
  // The last remaining method offers no Remove at all, rather than a
  // disabled control with no explanation.
  await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(0);
  expect(unlinks).toBe(1);
});

test("a removal the server refuses says which of the three things happened", async ({
  page,
}, testInfo) => {
  await enableFrontDoor(page);
  await page.route("**/api/auth/methods", (route) =>
    route.fulfill({ status: 200, json: { apple: true, google: true } }),
  );
  await page.route("**/api/auth/methods/apple", (route) =>
    route.fulfill({ status: 200, json: { outcome: "account_gone" } }),
  );
  await signInViaBackdoor(page, {
    email: `remove-refused-${testInfo.parallelIndex}@e2e.test`,
    name: "Refusal Tester",
  });

  await page.goto("/you");
  await page.getByRole("button", { name: "Remove Apple" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "This account no longer exists. Nothing was changed.",
  );
});

test("the delete confirm names what goes, and its outcome reaches the Welcome screen", async ({
  page,
}, testInfo) => {
  let deleted = false;
  await enableFrontDoor(page);
  await page.route("**/api/auth/methods", (route) =>
    route.fulfill({ status: 200, json: { apple: true, google: true } }),
  );
  await page.route("**/api/auth/web/attempts/delete-e2e", (route) =>
    route.fulfill({
      status: 200,
      json: {
        outcome: "delete_ready",
        attemptId: "delete-e2e",
        purpose: "delete",
        targetProvider: "apple",
        expiresAt: "2026-09-14T00:05:00.000Z",
      },
    }),
  );
  await page.route("**/api/auth/web/attempts/delete-e2e/delete", (route) => {
    deleted = true;
    return route.fulfill({
      status: 200,
      json: { outcome: "deleted", appleRevoked: false },
    });
  });
  // The real session survives the mocked delete, so this is what makes the
  // re-read answer the way a deleted account's would.
  await page.route("**/api/me", (route) =>
    deleted
      ? route.fulfill({ status: 401, json: { error: "unauthenticated" } })
      : route.fallback(),
  );
  await signInViaBackdoor(page, {
    email: `delete-account-${testInfo.parallelIndex}@e2e.test`,
    name: "Delete Tester",
  });

  // The supported producer: the web callback lands the rower back here.
  await page.goto("/?authAttempt=delete-e2e");
  await expect(page).toHaveURL(/\/you\/sign-in-methods$/);
  await expect(
    page.getByRole("heading", { name: "Delete this account?" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Deletes your workouts, session log, plan, baselines, and test history.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Signs you out on this device.")).toBeVisible();
  // Gate 0 ruling 2: the link row goes with the account, but this screen
  // does not claim it — we never deauthorize at Concept2's end.
  await expect(page.getByText(/concept ?2/i)).toHaveCount(0);

  await page.getByRole("button", { name: "Delete account" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Your account is deleted. Ergomatic is still listed in your Apple ID settings, under Sign in with Apple. You can remove it there.",
  );
  await expect(
    page.getByRole("button", { name: "Continue with Apple" }),
  ).toBeVisible();
});

test("a failed web delete says so instead of bouncing the rower to a silent screen", async ({
  page,
}, testInfo) => {
  await enableFrontDoor(page);
  await page.route("**/api/auth/methods", (route) =>
    route.fulfill({ status: 200, json: { apple: true, google: true } }),
  );
  await signInViaBackdoor(page, {
    email: `delete-failed-${testInfo.parallelIndex}@e2e.test`,
    name: "Delete Failure Tester",
  });

  // Exactly what `frontDoorRoutes.ts`'s callback redirect builds when a
  // delete re-auth fails (finding I1).
  await page.goto(
    "/?authError=invalid_proof&authPurpose=delete&authProvider=apple",
  );
  await expect(page).toHaveURL(/\/you$/);
  await expect(page.getByRole("alert")).toHaveText(
    "We couldn’t confirm it was you. Nothing was deleted.",
  );
});

// THE ORDERING THIS FLOW RACES ON. `/api/me` and the attempt read fire
// together on every web OAuth return; whichever wins is chance. Holding
// `/api/me` back makes the attempt win EVERY run, which is the ordering
// that used to strand the rower on Today.
test("a delete return that outruns the session read still reaches the confirm screen", async ({
  page,
}, testInfo) => {
  await enableFrontDoor(page);
  await page.route("**/api/auth/methods", (route) =>
    route.fulfill({ status: 200, json: { apple: true, google: true } }),
  );
  await page.route("**/api/auth/web/attempts/delete-slow-me", (route) =>
    route.fulfill({
      status: 200,
      json: {
        outcome: "delete_ready",
        attemptId: "delete-slow-me",
        purpose: "delete",
        targetProvider: "apple",
        expiresAt: "2026-09-14T00:05:00.000Z",
      },
    }),
  );
  await signInViaBackdoor(page, {
    email: `delete-slow-me-${testInfo.parallelIndex}@e2e.test`,
    name: "Slow Session Tester",
  });

  // Registered AFTER the backdoor sign-in, so only the return load pays it.
  await page.route("**/api/me", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fallback();
  });
  await page.goto("/?authAttempt=delete-slow-me");
  await expect(
    page.getByRole("heading", { name: "Delete this account?" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/you\/sign-in-methods$/);
});

// WAVE A PR2, Task 6. WHAT THIS LEG CAN AND CANNOT PROVE, said plainly so the
// claim is not read as stronger than it is (RF26).
//
// It CANNOT assert "the account afterwards holds both providers", which is
// what the plan's Task 6 Step 1 asked for. A browser cannot drive a real
// OAuth exchange against the real stack — there is no fake provider seam —
// so every front-door e2e leg in this file stubs the API, and a stubbed
// server has no account to inspect. THAT claim is gated in
// `server/auth/frontDoorRoutes.integration.test.ts`, which runs
// begin -> proof -> follow-through -> proof -> finalize over real HTTP
// against real Postgres and asserts one user row holding both subjects.
//
// What it DOES prove is the part jsdom cannot see: the confirmation renders
// in a real engine at phone width, both of its controls are reachable without
// scrolling, and the relay address is not clipped by the ellipsis rule that
// governs every other identity card in the app.
test("PR2: the post-proof confirmation renders both identities and both controls at phone width", async ({
  page,
}) => {
  // 360, NOT 390, AND THE DIFFERENCE IS THE WHOLE GATE. Measured against this
  // stack: at 390 the relay address is 211px in a 211px box and fits, so an
  // anti-clipping assertion there can never go red — it passed with the fix
  // deliberately removed. At 360 the same address is 208px in a 181px box and
  // the shared ellipsis takes it. 360 is an ordinary Android width and the
  // narrowest common phone; asserting at 390 was measuring the case that
  // cannot fail (RF21).
  await page.setViewportSize({ width: 360, height: 800 });
  await enableFrontDoor(page);
  await page.route("**/api/me", (route) =>
    route.fulfill({ status: 401, json: { error: "unauthenticated" } }),
  );
  await page.route("**/api/auth/web/attempts/pr2-e2e", (route) =>
    route.fulfill({
      status: 200,
      json: {
        outcome: "link_ready",
        attemptId: "pr2-e2e",
        purpose: "signin",
        targetProvider: "apple",
        expiresAt: "2099-01-01T00:00:00.000Z",
        profile: {
          email: "9m3x7k2p1r@privaterelay.appleid.com",
          name: "Rower",
        },
        session: {
          outcome: "signed_in",
          user: { id: "u1", email: "maya.chen@example.com", name: "Maya Chen" },
          expiresAt: "2099-01-01T00:00:00.000Z",
        },
      },
    }),
  );

  await page.goto("/?authAttempt=pr2-e2e");

  await expect(
    page.getByRole("heading", { name: "Attach Apple to this account?" }),
  ).toBeVisible();

  // THE RELAY ADDRESS IN FULL. The shared `.auth-identity-email` rule
  // ellipsises, which would cut this at "…appleid…" and lose the half that
  // says it IS a relay. Assert the rendered width is not clipped rather than
  // that the text node exists — jsdom resolves no layout, so it would pass
  // either way. Probed: removing `.auth-identity-email-full` from
  // `SignIn.tsx` reds this line here, and did NOT at 390px.
  const relay = page.getByText("9m3x7k2p1r@privaterelay.appleid.com");
  await expect(relay).toBeVisible();
  const clipped = await relay.evaluate(
    (el) => el.scrollWidth > el.clientWidth + 1,
  );
  expect(clipped).toBe(false);

  // THE DESTINATION ACCOUNT, which is what makes this a control.
  await expect(page.getByText("maya.chen@example.com")).toBeVisible();

  // BOTH CONTROLS REACHABLE WITHOUT SCROLLING. RC-24's failure was the one
  // control a screen exists for sitting below the fold.
  for (const name of ["Attach Apple", "Not now"]) {
    const button = page.getByRole("button", { name });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    if (!box) throw new Error(`${name} has no box`);
    expect(box.y + box.height).toBeLessThanOrEqual(800);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});
