/**
 * Shared by vitest.config.ts and playwright.config.ts so the two cannot
 * drift. Both are pure so the unit suite can pin them.
 */

/**
 * `process.env.CI` is a STRING, so truthiness is the wrong test: "false"
 * and "0" are both truthy and would silently remove the worker caps.
 */
export const isCI = (v: string | undefined = process.env.CI): boolean =>
  !!v && v !== "false" && v !== "0";

/**
 * Local worker ceiling. Measured on a 16 GB / 4-performance-core Mac:
 * 4 workers = 38 s / 1.84 GB peak, unset (9) = 25 s / 2.76 GB, and 6 is
 * strictly dominated by 4 (41 s AND 2.63 GB). Override with
 * ERGOMATIC_TEST_WORKERS / ERGOMATIC_E2E_WORKERS on a bigger machine.
 *
 * trunc: a fractional worker count is not a setting.
 * max(1): Playwright's resolveWorkers throws below 1.
 * min(16): an unbounded ceiling admits Infinity on the machine this
 *          exists to protect, which is the opposite of the goal.
 */
export const workerCap = (v: string | undefined, fallback: number): number =>
  Math.max(1, Math.min(16, Math.trunc(Number(v)) || fallback));
