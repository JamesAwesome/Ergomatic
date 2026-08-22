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
 *
 * FIXED WIDTH BY CONSTRUCTION (2026-08-20, riding-follow-up fix): baked
 * into every generated e2e user's email (`signInViaBackdoor` below), so
 * this string's own printed LENGTH is part of every page that renders an
 * account email — a length that varies run to run reflows the whole page
 * around it, measured at 26,327 pixels differing across 13 row bands on
 * `you-derive-offer.png` (ROADMAP, Phase LT follow-ups). The PREVIOUS
 * shape (`Date.now()` + `Math.random().toString(36).slice(2, 8)`) rests
 * its own fixed length on two things that are each merely TRUE TODAY, not
 * GUARANTEED: `Date.now()`'s digit count is stable at 13 only until the
 * year 2286, and `Number.prototype.toString(36)` on a random fraction is
 * not spec-guaranteed to reach 6 digits before the slice — ECMA-262
 * requires only the SHORTEST string that round-trips, so a value with an
 * exact short terminating base-36 expansion truncates the slice (rare,
 * unobserved directly, but not excludable — the "frozen clock" framing
 * this comment's own history warns against: freezing `Date.now()` alone
 * would still leave that second source live). `randomBase36(6)` below
 * builds its 6 characters one at a time, so the result is exactly 6
 * characters by CONSTRUCTION, not by an incidental property of float
 * formatting — and the timestamp half is explicitly padded rather than
 * trusted to stay 13 digits on its own.
 */
function randomBase36(length: number): string {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export const RUN_ID = `${String(Date.now()).padStart(13, "0")}-${randomBase36(6)}`;

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
      prev.height === next.height &&
      // WIDTH was missing until the 2026-08-21 flake hunt: a box still
      // animating its width counted as "settled", which is exactly the
      // case `design.spec.ts`'s TYPE-word test exists for (swapping in a
      // differently-WIDE word).
      prev.width === next.width
    ) {
      return next;
    }
    prev = next;
  }
  // A TIMEOUT MUST BE LOUD (flake hunt, 2026-08-21). This used to
  // `return prev` — an UNSTABLE box — with no signal at all, so a helper
  // whose entire contract is "a settled box" could hand back an unsettled
  // one and the caller would assert on it. The failure then surfaced as a
  // mystery off-by-a-few-pixels mismatch with nothing pointing here.
  // Measured during the hunt: it never actually fired across ~1,200 test
  // executions, so this costs nothing today and removes a silent-wrong-
  // answer path. Same family as recurring failure 4 — a helper that cannot
  // fail cannot be trusted when it succeeds.
  throw new Error(
    `stableBoundingBox: never settled in 20 animation frames (last=${JSON.stringify(prev)}). ` +
      `The element is still moving — either it genuinely animates, or the caller measured before layout settled.`,
  );
}
