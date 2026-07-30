import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("useWorkouts", () => {
  it("exposes the fetched library once loaded", async () => {
    const rows = [
      {
        id: "w1",
        title: "Zephyr",
        type: "O2",
        difficulty: "easy",
        pain: 2,
        steps: [],
        isGlobal: true,
        lastDoneDaysAgo: null,
      },
    ];
    vi.doMock("../api", () => ({
      api: vi.fn(
        async () => new Response(JSON.stringify(rows), { status: 200 }),
      ),
    }));
    const { useWorkouts } = await import("./useWorkouts");
    const { result } = renderHook(() => useWorkouts());
    expect(result.current.state).toBe("loading");
    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("expected ready");
    expect(result.current.workouts).toStrictEqual(rows);
  });

  it("surfaces a retry when the request fails", async () => {
    const apiMock = vi.fn(async () => new Response("nope", { status: 500 }));
    vi.doMock("../api", () => ({
      api: apiMock,
    }));
    const { useWorkouts } = await import("./useWorkouts");
    const { result } = renderHook(() => useWorkouts());
    await waitFor(() => expect(result.current.state).toBe("error"));
    if (result.current.state !== "error") throw new Error("expected error");
    expect(typeof result.current.retry).toBe("function");
    expect(apiMock).toHaveBeenCalledTimes(1);

    // Call retry and assert a second request fires
    result.current.retry();
    await waitFor(() => {
      expect(apiMock).toHaveBeenCalledTimes(2);
    });
  });

  it("retries successfully and reaches ready state", async () => {
    const rows = [
      {
        id: "w1",
        title: "Zephyr",
        type: "O2",
        difficulty: "easy",
        pain: 2,
        steps: [],
        isGlobal: true,
        lastDoneDaysAgo: null,
      },
    ];
    let callCount = 0;
    const apiMock = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        return new Response("nope", { status: 500 });
      }
      return new Response(JSON.stringify(rows), { status: 200 });
    });
    vi.doMock("../api", () => ({
      api: apiMock,
    }));
    const { useWorkouts } = await import("./useWorkouts");
    const { result } = renderHook(() => useWorkouts());
    await waitFor(() => expect(result.current.state).toBe("error"));

    const retryState = result.current as { state: "error"; retry: () => void };
    retryState.retry();
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(
      (result.current as { state: "ready"; workouts: typeof rows }).workouts,
    ).toStrictEqual(rows);
  });

  it("enters error state when the fetch itself rejects", async () => {
    const apiMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.doMock("../api", () => ({
      api: apiMock,
    }));
    const { useWorkouts } = await import("./useWorkouts");
    const { result } = renderHook(() => useWorkouts());
    await waitFor(() => expect(result.current.state).toBe("error"));
    if (result.current.state !== "error") throw new Error("expected error");
    expect(typeof result.current.retry).toBe("function");
  });
});
