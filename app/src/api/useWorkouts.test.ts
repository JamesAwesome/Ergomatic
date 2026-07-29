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
        num: 1,
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
    vi.doMock("../api", () => ({
      api: vi.fn(async () => new Response("nope", { status: 500 })),
    }));
    const { useWorkouts } = await import("./useWorkouts");
    const { result } = renderHook(() => useWorkouts());
    await waitFor(() => expect(result.current.state).toBe("error"));
    if (result.current.state !== "error") throw new Error("expected error");
    expect(typeof result.current.retry).toBe("function");
  });
});
