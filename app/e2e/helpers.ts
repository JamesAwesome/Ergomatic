import type { Page } from "@playwright/test";

/** Supported browser for warning and scan-failure flows. Register before
 * navigation so Connect is enabled on its first render on every host. */
export async function stubBluetoothScanFailure(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, "bluetooth", {
      value: {
        requestDevice: async () => {
          throw new Error("Test scan failed");
        },
      },
      configurable: true,
    });
  });
}

/** The Bluetooth PERMISSION refusal, which `useMonitorSession.ts` keys off the
 *  error's `name` ("BluetoothPermissionError"), not its prose. Its frame is
 *  the longest of any failure screen — a two-line headline, the remedy
 *  sentence, the reassurance AND a DETAIL panel — so it is the one that
 *  proves the landscape budget.
 *
 *  ON ITS OWN this reaches the FOUR-button web shape only. The fifth button,
 *  `Open Settings`, renders when `canOpenAppSettings()` is true, which on the
 *  web needs `forceAppSettingsDoor` below — pair the two to reach the shape a
 *  rower on iOS actually gets. (SUPERSEDED CLAIM: this comment used to say no
 *  e2e here could ever stand on the five-button shape, and that its 10px ->
 *  138px measurement "came from a gate nothing can run". Both halves stopped
 *  being true when the door override landed; `design.spec.ts`'s five-button
 *  case runs exactly that gate.) */
export async function stubBluetoothPermissionDenied(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, "bluetooth", {
      value: {
        requestDevice: async () => {
          const denied = new Error("BLE permission denied");
          denied.name = "BluetoothPermissionError";
          throw denied;
        },
      },
      configurable: true,
    });
  });
}

/** THE FIVE-BUTTON FAILURE STACK, reached from a browser (Phase MT
 *  close-out; ROADMAP register, "Nothing can gate the five-button failure
 *  frame"). `canOpenAppSettings()` is `isNative()` plus a dev-only door
 *  override, and this writes the override's token — see
 *  `src/adapters/appSettings.ts`'s own header for why the override gates that
 *  one boolean and nothing else, and why a global `isNative()` stub was ruled
 *  out (it would take `defaultTransport`'s Capacitor arm and kill the fake
 *  every connected walk runs on).
 *
 *  THE TOKEN IS RETYPED HERE, never imported from `src/` — the same reason
 *  `appSettings.test.ts` retypes it (CLAUDE.md RF21's first smell). It is
 *  also `scripts/dist-grep.sh`'s needle, so the three must move together.
 *
 *  Register BEFORE navigation, like every other init script here: the
 *  interstitial reads the adapter at render time. On a build with the
 *  fold closed — any production deploy — this write lands and is simply never
 *  read, which is the property `dist-grep` exists to keep true. */
export async function forceAppSettingsDoor(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__appSettingsDoor__ = "app-settings door (dev override)";
  });
}

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

/** The screenshots project opts OUT of uniqueness, and it is allowed to
 *  because `scripts/screenshots.sh` boots a fresh database every run — there
 *  is no previous run's user left to collide with. Uniqueness is what made
 *  every capture of an account screen churn: the timestamp half is RENDERED,
 *  and `you.png` read `screenshots-you-1789060665…` in one run and
 *  `…1789060783…` in the next.
 *
 *  **Why the fixed-width work above did not already solve it, and why a
 *  back-to-back pair of runs says it did:** the email is TRUNCATED in the UI,
 *  so the visible characters are the timestamp's LEADING digits, which are
 *  identical for any two runs inside the same ~hour. Two runs minutes apart
 *  hash the same and the churn looks absent; two runs an hour apart do not.
 *  Measured 2026-09-10 — this is the reason four separate filings of the
 *  screenshot-churn bug never named this cause, since every one of them
 *  compared back-to-back runs.
 *
 *  Deliberately NOT the default: `pnpm e2e` reuses its stack across runs by
 *  design, so every other project still needs the unique suffix. */
const STABLE_RUN_ID = "stable0000000-shots0";

export const RUN_ID =
  process.env.ERGOMATIC_STABLE_RUN_ID === "1"
    ? STABLE_RUN_ID
    : `${String(Date.now()).padStart(13, "0")}-${randomBase36(6)}`;

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
 *  exactly the reflow the effort/type tests exist to bound). Worsened from
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

/**
 * Phase PS PR 1 (career-stats spec §8.5): `POST /api/logs` cannot set
 * `loggedAt` — the column is `defaultNow()` and the route reads no such
 * field — so a seeded history is backdated HERE, through the stack's own
 * published Postgres port, to `instant` (an ISO `…Z` literal; which DATE
 * that is belongs to the browser's zone). Defaults mirror `compose.yml` and CI's e2e
 * job (`POSTGRES_PORT` 5433, user/db `ergomatic`, password `devpass`);
 * `scripts/stack-env.sh` exports the per-worktree port locally. The
 * caller asserts the backdate took by reading `loggedAt` back through
 * the API (RF38: a property of how the test got there is an assertion).
 */
export async function backdateLog(id: string, instant: string): Promise<void> {
  const { default: pg } = await import("pg");
  const client = new pg.Client({
    host: "127.0.0.1",
    port: Number(process.env.POSTGRES_PORT ?? "5433"),
    user: process.env.POSTGRES_USER ?? "ergomatic",
    password: process.env.POSTGRES_PASSWORD ?? "devpass",
    database: process.env.POSTGRES_DB ?? "ergomatic",
  });
  await client.connect();
  try {
    // An explicit instant (`…Z`), never a zone name: what the browser then
    // reads as the row's date is decided by ITS zone alone (`toCalendarDate`).
    const res = await client.query(
      "update session_logs set logged_at = $2::timestamptz where id = $1",
      [id, instant],
    );
    if (res.rowCount !== 1) {
      throw new Error(
        `backdateLog: expected 1 row for ${id}, got ${res.rowCount}`,
      );
    }
  } finally {
    await client.end();
  }
}
