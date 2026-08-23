import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { api } from "../api";

// recordTestResult is deliberately fire-and-forget (its own doc comment:
// recording must never block or complicate a save), so the two behaviors
// worth pinning are the exact wire shape it sends and that a FAILING
// record dies silently instead of surfacing as an unhandled rejection in
// the middle of the save flow.

function mockApi(
  impl: (path: string, init?: RequestInit) => Promise<Response>,
) {
  const fn = vi.fn<typeof api>(impl);
  vi.doMock("../api", () => ({ api: fn }));
  return fn;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.doUnmock("../api");
});

describe("recordTestResult", () => {
  it("POSTs the distance, split and log id to the decouple endpoint", async () => {
    const fn = mockApi(async () => new Response("{}", { status: 201 }));
    const { recordTestResult } = await import("./testHistory");
    recordTestResult({ distance: "2k", splitSeconds: 118.4, logId: "log-1" });
    await vi.waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
    const [path, init] = fn.mock.calls[0]!;
    expect(path).toBe("/api/test-history");
    expect(JSON.parse((init as RequestInit).body as string)).toStrictEqual({
      distance: "2k",
      splitSeconds: 118.4,
      logId: "log-1",
    });
  });

  it("a network failure is swallowed — the save flow never sees it", async () => {
    const rejections: unknown[] = [];
    const onUnhandled = (e: PromiseRejectionEvent) => rejections.push(e);
    window.addEventListener("unhandledrejection", onUnhandled);
    mockApi(async () => {
      throw new Error("network down");
    });
    const { recordTestResult } = await import("./testHistory");
    expect(() =>
      recordTestResult({ distance: "6k", splitSeconds: 130, logId: "log-2" }),
    ).not.toThrow();
    // Give the rejected promise a macrotask to surface if it were going to.
    await new Promise((r) => setTimeout(r, 10));
    window.removeEventListener("unhandledrejection", onUnhandled);
    expect(rejections).toStrictEqual([]);
  });
});
