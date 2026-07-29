import type { Page } from "@playwright/test";

// Must match the TEST_AUTH_SECRET env var scripts/e2e.sh and
// scripts/screenshots.sh pass to the compose stack — see
// server/auth/testSignin.ts for the route this signs in through.
export const TEST_AUTH_SECRET = "e2e-secret";

/**
 * Signs in through the secret-gated backdoor (never real Google OAuth) and
 * lands on "/". Uses `page.request` so the session cookie lands in the same
 * browser context the subsequent `page.goto` navigates in.
 */
export async function signInViaBackdoor(
  page: Page,
  opts: { email?: string; name?: string } = {},
): Promise<void> {
  const res = await page.request.post("/api/auth/test-signin", {
    data: { secret: TEST_AUTH_SECRET, ...opts },
  });
  if (!res.ok()) {
    throw new Error(
      `backdoor sign-in failed: ${res.status()} ${await res.text()}`,
    );
  }
  await page.goto("/");
}
