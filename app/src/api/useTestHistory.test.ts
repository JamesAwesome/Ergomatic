import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

// Newest first, as the route lists them.
const ROWS = [
  {
    id: "t6",
    distance: "2k",
    splitSeconds: 114,
    loggedAt: "2026-09-11T16:00:00.000Z",
    sessionLogId: "r13",
  },
  {
    id: "t1",
    distance: "6k",
    splitSeconds: 124.8,
    loggedAt: "2025-11-22T16:00:00.000Z",
    sessionLogId: null,
  },
];

describe("useTestHistory", () => {
  it("fetches /api/test-history once per mount and hands back the points OLDEST first with device-zone dates", async () => {
    const apiMock = vi.fn(
      async () => new Response(JSON.stringify(ROWS), { status: 200 }),
    );
    vi.doMock("../api", () => ({ api: apiMock }));
    const { useTestHistory } = await import("./useTestHistory");
    const { result } = renderHook(() => useTestHistory());
    expect(result.current.state).toBe("loading");
    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("expected ready");
    expect(apiMock).toHaveBeenCalledWith("/api/test-history");
    expect(result.current.points.map((p) => p.id)).toStrictEqual(["t1", "t6"]);
    expect(result.current.points[1]).toStrictEqual({
      id: "t6",
      distance: "2k",
      splitSeconds: 114,
      date: { y: 2026, m: 9, d: 11 },
    });
  });

  it("a second MOUNT fetches again — nothing outlives the screen", async () => {
    const apiMock = vi.fn(
      async () => new Response(JSON.stringify(ROWS), { status: 200 }),
    );
    vi.doMock("../api", () => ({ api: apiMock }));
    const { useTestHistory } = await import("./useTestHistory");
    const first = renderHook(() => useTestHistory());
    await waitFor(() => expect(first.result.current.state).toBe("ready"));
    first.unmount();
    const second = renderHook(() => useTestHistory());
    await waitFor(() => expect(second.result.current.state).toBe("ready"));
    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces a retry on a failed fetch, and the retry fires a second request", async () => {
    const apiMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("nope", { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    vi.doMock("../api", () => ({ api: apiMock }));
    const { useTestHistory } = await import("./useTestHistory");
    const { result } = renderHook(() => useTestHistory());
    await waitFor(() => expect(result.current.state).toBe("error"));
    if (result.current.state !== "error") throw new Error("expected error");
    const { retry } = result.current;
    act(() => {
      retry();
    });
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  // A REJECTED fetch (no response at all — offline, DNS, an aborted
  // request) lands in the same error state as a 500 and its retry works.
  // Mutation: drop the `.catch` → the hook never leaves `loading`.
  it("a rejected fetch reads as error with a working retry, like a 500", async () => {
    const apiMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    vi.doMock("../api", () => ({ api: apiMock }));
    const { useTestHistory } = await import("./useTestHistory");
    const { result } = renderHook(() => useTestHistory());
    await waitFor(() => expect(result.current.state).toBe("error"));
    if (result.current.state !== "error") throw new Error("expected error");
    const { retry } = result.current;
    act(() => {
      retry();
    });
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(apiMock).toHaveBeenCalledTimes(2);
  });
});
