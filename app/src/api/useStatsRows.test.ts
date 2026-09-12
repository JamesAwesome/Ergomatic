import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
});

const ROW = {
  id: "r1",
  loggedAt: "2026-09-11T16:00:00.000Z",
  source: "pm5",
  workoutType: "TR",
  tier: "machine",
  workMeters: 2000,
  workSeconds: 455.8,
  restMeters: 0,
  restSeconds: 0,
  calories: 121,
};

describe("useStatsRows", () => {
  it("fetches /api/stats/rows once per mount and hands back every row with its device-zone date and today", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 12, 9));
    const apiMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ rows: [ROW] }), { status: 200 }),
    );
    vi.doMock("../api", () => ({ api: apiMock }));
    const { useStatsRows } = await import("./useStatsRows");
    const { result } = renderHook(() => useStatsRows());
    expect(result.current.state).toBe("loading");
    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("expected ready");
    expect(apiMock).toHaveBeenCalledWith("/api/stats/rows");
    expect(result.current.today).toStrictEqual({ y: 2026, m: 9, d: 12 });
    expect(result.current.rows[0]).toMatchObject({ id: "r1", tier: "machine" });
    expect(result.current.rows[0]!.date.y).toBe(2026);
  });

  it("a second MOUNT fetches again: nothing outlives the screen (spec §4.3 — a row deleted before the next mount is gone on it)", async () => {
    const apiMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ rows: [ROW] }), { status: 200 }),
    );
    vi.doMock("../api", () => ({ api: apiMock }));
    const { useStatsRows } = await import("./useStatsRows");
    const first = renderHook(() => useStatsRows());
    await waitFor(() => expect(first.result.current.state).toBe("ready"));
    first.unmount();
    const second = renderHook(() => useStatsRows());
    await waitFor(() => expect(second.result.current.state).toBe("ready"));
    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces a retry on a failed fetch and the retry fires a second request", async () => {
    const apiMock = vi.fn(async () => new Response("nope", { status: 500 }));
    vi.doMock("../api", () => ({ api: apiMock }));
    const { useStatsRows } = await import("./useStatsRows");
    const { result } = renderHook(() => useStatsRows());
    await waitFor(() => expect(result.current.state).toBe("error"));
    if (result.current.state !== "error") throw new Error("expected error");
    result.current.retry();
    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(2));
  });
});
