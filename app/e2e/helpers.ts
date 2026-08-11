import type { Page } from "@playwright/test";

// Must match the TEST_AUTH_SECRET env var scripts/e2e.sh and
// scripts/screenshots.sh pass to the compose stack — see
// server/auth/testSignin.ts for the route this signs in through.
export const TEST_AUTH_SECRET = "e2e-secret";

/**
 * Every backdoor user is unique PER TEST PROCESS: the stack's users are
 * find-or-create by email and its Postgres volume persists across local
 * runs, so a spec that imports a fixed-title workout under a fixed email
 * strands that row whenever a run is killed before cleanup — and the next
 * run (or a CI retry under an inline-cleanup spec) re-imports the title
 * and dies on a strict-mode duplicate instead of retrying (two red main
 * runs, 2026-08-08). Personal workouts are per-user, so a fresh user per
 * process makes every run its own clean world; within one process the
 * suffix is constant, so re-sign-ins (reload flows, second-device tests)
 * still land on the same user.
 */
export const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Signs in through the secret-gated backdoor (never real Google OAuth) and
 * lands on "/". Uses `page.request` so the session cookie lands in the same
 * browser context the subsequent `page.goto` navigates in.
 */
export async function signInViaBackdoor(
  page: Page,
  opts: { email?: string; name?: string } = {},
): Promise<void> {
  // Idempotent: a spec that already embedded RUN_ID (news.spec's original
  // idiom, or one that needs the final address for an assertion) keeps its
  // email byte-identical.
  const email =
    opts.email && !opts.email.includes(RUN_ID)
      ? opts.email.replace("@", `-${RUN_ID}@`)
      : opts.email;
  const res = await page.request.post("/api/auth/test-signin", {
    data: { secret: TEST_AUTH_SECRET, ...opts, ...(email ? { email } : {}) },
  });
  if (!res.ok()) {
    throw new Error(
      `backdoor sign-in failed: ${res.status()} ${await res.text()}`,
    );
  }
  await page.goto("/");
}

/** A boundingBox read that waits out layout settling first (fonts still
 *  loading, a scroll restore mid-flight, a reflow from the previous
 *  interaction). The y-stability tests capture a BEFORE box and assert the
 *  AFTER equals it — if the before read lands mid-settle, the assertion
 *  fails on drift the test never meant to measure. Two consecutive
 *  animation-frame-spaced reads must agree before the box is trusted;
 *  fonts.ready is awaited once up front (an 11px word swapping in late is
 *  exactly the reflow the pain/type tests exist to bound). Worsened from
 *  rare to most-runs by main's scroll-restore change (#84); root fix here
 *  rather than retries that would also swallow real regressions. */
export async function stableBoundingBox(
  locator: import("@playwright/test").Locator,
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  await locator.page().evaluate(() => document.fonts.ready);
  let prev = await locator.boundingBox();
  for (let i = 0; i < 20; i++) {
    await locator.page().evaluate(() => new Promise(requestAnimationFrame));
    const next = await locator.boundingBox();
    if (
      prev !== null &&
      next !== null &&
      prev.y === next.y &&
      prev.x === next.x &&
      prev.height === next.height
    ) {
      return next;
    }
    prev = next;
  }
  return prev;
}
