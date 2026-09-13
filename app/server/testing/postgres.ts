/**
 * One place every integration test starts its Postgres container.
 *
 * PRIMARY (vendored source, read 2026-09-12):
 * `node_modules/.pnpm/testcontainers@12.1.0_supports-color@7.2.0/node_modules/testcontainers/build/generic-container/inspect-container-util-ports-exposed.js`
 * — `inspectContainerUntilPortsExposed(inspectFn, containerId, timeout = 10_000)`
 * polls `docker inspect` until the host port bindings it asked for actually
 * appear, and on timeout throws
 * `Timed out after ${timeout}ms while waiting for container ports to be bound to the host`.
 * All three call sites (`generic-container.js` x2, `started-generic-container.js`
 * x1) call it with no `timeout` argument, so every `.start()` carries this
 * HARDCODED 10s ceiling — `withStartupTimeout` only governs the later wait
 * strategy, never this port-bind poll. On timeout the function throws with no
 * catch in any caller: the container it already created and started is left
 * running (Ryuk reaps it at session end). Upstream latest is still 12.1.0, so
 * there is no newer release to pick up a fix from.
 *
 * Under four vitest workers each starting `postgres:18.4` while coverage
 * instruments, this has fired on four different integration files in one
 * day — each time as exit 0 with one file failing at suite level, so a
 * parallel run reads green overall while carrying a real failure.
 *
 * `startPostgres` retries exactly once on that exact timeout message, after
 * a short delay, and warns once naming the retry and the orphaned first
 * container. Any other rejection, or a second timeout, rethrows unchanged —
 * this is a mitigation for a known transient, not a general retry loop.
 */
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";

const POSTGRES_IMAGE = "postgres:18.4";

// Matches testcontainers' own message regardless of the timeout value it was
// built with, so a future bump that changes the ceiling still matches.
const PORT_BIND_TIMEOUT_RE =
  /Timed out after \d+ms while waiting for container ports to be bound/;

export interface StartPostgresOptions {
  start?: () => Promise<StartedPostgreSqlContainer>;
  delayMs?: number;
  warn?: (message: string) => void;
}

const defaultStart = () => new PostgreSqlContainer(POSTGRES_IMAGE).start();

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function isPortBindTimeout(error: unknown): boolean {
  return error instanceof Error && PORT_BIND_TIMEOUT_RE.test(error.message);
}

export async function startPostgres(
  options: StartPostgresOptions = {},
): Promise<StartedPostgreSqlContainer> {
  const start = options.start ?? defaultStart;
  const delayMs = options.delayMs ?? 1_000;
  const warn = options.warn ?? ((message: string) => console.warn(message));

  try {
    return await start();
  } catch (error) {
    if (!isPortBindTimeout(error)) {
      throw error;
    }
    warn(
      "startPostgres: first container timed out waiting for its port to bind; " +
        "retrying once (the timed-out container is orphaned and will be reaped by Ryuk).",
    );
    await delay(delayMs);
    return await start();
  }
}
