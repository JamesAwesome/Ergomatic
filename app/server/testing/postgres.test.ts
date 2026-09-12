import { describe, it, expect, vi } from "vitest";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { startPostgres, PORT_BIND_TIMEOUT_RE } from "./postgres.js";

// Minimal stand-ins — only the properties startPostgres itself touches.
const fakeStarted = (tag: string) =>
  ({ __tag: tag }) as unknown as StartedPostgreSqlContainer;

const timeoutError = () =>
  new Error(
    "Timed out after 10000ms while waiting for container ports to be bound to the host",
  );

describe("startPostgres", () => {
  it("returns the container on a clean first start, with no warning", async () => {
    const started = fakeStarted("first");
    const start = vi.fn().mockResolvedValue(started);
    const warn = vi.fn();

    const result = await startPostgres({ start, warn, delayMs: 0 });

    expect(result).toBe(started);
    expect(start).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it("retries once on the exact port-bind timeout message, then returns the retry's container", async () => {
    const retried = fakeStarted("retry");
    const start = vi
      .fn()
      .mockRejectedValueOnce(timeoutError())
      .mockResolvedValueOnce(retried);
    const warn = vi.fn();

    const result = await startPostgres({ start, warn, delayMs: 0 });

    expect(result).toBe(retried);
    expect(start).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
    const [message] = warn.mock.calls[0] as [string];
    expect(message).toMatch(/retry/i);
    expect(message).toMatch(/orphan/i);
  });

  it("rethrows the second error when the timeout fires twice in a row", async () => {
    const firstTimeout = timeoutError();
    const secondTimeout = timeoutError();
    const start = vi
      .fn()
      .mockRejectedValueOnce(firstTimeout)
      .mockRejectedValueOnce(secondTimeout);
    const warn = vi.fn();

    await expect(startPostgres({ start, warn, delayMs: 0 })).rejects.toBe(
      secondTimeout,
    );
    expect(start).toHaveBeenCalledTimes(2);
  });

  it("rethrows immediately on any error that isn't the port-bind timeout, with no retry and no warning", async () => {
    const otherError = new Error("connection refused");
    const start = vi.fn().mockRejectedValue(otherError);
    const warn = vi.fn();

    await expect(startPostgres({ start, warn, delayMs: 0 })).rejects.toBe(
      otherError,
    );
    expect(start).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it("matches the exact vendored message shape regardless of the timeout value", () => {
    expect(PORT_BIND_TIMEOUT_RE.test(timeoutError().message)).toBe(true);
    expect(
      PORT_BIND_TIMEOUT_RE.test(
        "Timed out after 30000ms while waiting for container ports to be bound to the host",
      ),
    ).toBe(true);
    expect(PORT_BIND_TIMEOUT_RE.test("connection refused")).toBe(false);
  });
});
