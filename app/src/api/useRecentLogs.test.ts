import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

const LOGS = [
  {
    id: "log-1",
    workoutId: "w-1",
    workoutTitle: "Zephyr",
    workoutType: "O2",
    loggedAt: "2026-07-29T12:00:00.000Z",
    held: "held",
    pain: 2,
  },
];

describe("useRecentLogs", () => {
  it("exposes the fetched logs once loaded, requesting the given limit", async () => {
    const apiMock = vi.fn(
      async () => new Response(JSON.stringify(LOGS), { status: 200 }),
    );
    vi.doMock("../api", () => ({ api: apiMock }));
    const { useRecentLogs } = await import("./useRecentLogs");
    const { result } = renderHook(() => useRecentLogs(3));
    expect(result.current.state).toBe("loading");
    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("expected ready");
    expect(result.current.logs).toStrictEqual(LOGS);
    expect(apiMock).toHaveBeenCalledWith("/api/logs?limit=3");
  });

  it("exposes an empty list for a brand-new account with no logged sessions", async () => {
    vi.doMock("../api", () => ({
      api: vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })),
    }));
    const { useRecentLogs } = await import("./useRecentLogs");
    const { result } = renderHook(() => useRecentLogs(3));
    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("expected ready");
    expect(result.current.logs).toStrictEqual([]);
  });

  it("surfaces a retry when the request fails, and calling it fires a second request", async () => {
    const apiMock = vi.fn(async () => new Response("nope", { status: 500 }));
    vi.doMock("../api", () => ({ api: apiMock }));
    const { useRecentLogs } = await import("./useRecentLogs");
    const { result } = renderHook(() => useRecentLogs(3));
    await waitFor(() => expect(result.current.state).toBe("error"));
    if (result.current.state !== "error") throw new Error("expected error");
    expect(apiMock).toHaveBeenCalledTimes(1);

    result.current.retry();
    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(2));
  });

  it("retries successfully and reaches ready state", async () => {
    let callCount = 0;
    const apiMock = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) return new Response("nope", { status: 500 });
      return new Response(JSON.stringify(LOGS), { status: 200 });
    });
    vi.doMock("../api", () => ({ api: apiMock }));
    const { useRecentLogs } = await import("./useRecentLogs");
    const { result } = renderHook(() => useRecentLogs(3));
    await waitFor(() => expect(result.current.state).toBe("error"));

    const errorState = result.current as { state: "error"; retry: () => void };
    errorState.retry();
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(
      (result.current as { state: "ready"; logs: typeof LOGS }).logs,
    ).toStrictEqual(LOGS);
  });

  it("enters error state, rather than throwing, when the fetch itself rejects", async () => {
    const apiMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.doMock("../api", () => ({ api: apiMock }));
    const { useRecentLogs } = await import("./useRecentLogs");
    const { result } = renderHook(() => useRecentLogs(3));
    await waitFor(() => expect(result.current.state).toBe("error"));
    if (result.current.state !== "error") throw new Error("expected error");
    expect(typeof result.current.retry).toBe("function");
  });
});
