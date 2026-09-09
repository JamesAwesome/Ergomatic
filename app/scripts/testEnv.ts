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
 * Local worker ceiling. 4 is the LIGHTEST setting, and that is what chose
 * it. Measured on a 16 GB / 4-performance-core Mac, path-scoped against a
 * verified `start_floor=0MB`, running
 * `bash scripts/test-run.sh --project client`: 4 workers = 37 s /
 * 1459 MB peak, 6 = 30 s / 2091 MB, 9 = 28 s / 2612 MB. The spec's earlier
 * table (38 s / 1.84 GB at 4, 25 s / 2.76 GB at 9) was taken with an
 * UNSCOPED sampler that summed every Node process on the machine; its
 * ordering holds, its absolutes do not, and its "6 is strictly dominated
 * by 4" line does not reproduce on the command above. Override with
 * ERGOMATIC_TEST_WORKERS / ERGOMATIC_E2E_WORKERS on a bigger machine.
 *
 * trunc: a fractional worker count is not a setting.
 * max(1): Playwright's resolveWorkers throws below 1.
 * min(16): an unbounded ceiling admits Infinity on the machine this
 *          exists to protect, which is the opposite of the goal.
 */
export const workerCap = (v: string | undefined, fallback: number): number =>
  Math.max(1, Math.min(16, Math.trunc(Number(v)) || fallback));
