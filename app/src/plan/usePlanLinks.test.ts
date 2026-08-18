import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("usePlanLinks", () => {
  it("fetches GET /api/logs?plan=<key> and resolves to a planIndex -> id Map", async () => {
    const apiMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            links: [
              { planIndex: 0, id: "log-a" },
              { planIndex: 3, id: "log-b" },
            ],
          }),
          { status: 200 },
        ),
    );
    vi.doMock("../api", () => ({ api: apiMock }));
    const { usePlanLinks } = await import("./usePlanLinks");
    const { result } = renderHook(() => usePlanLinks("sprint"));

    expect(result.current.size).toBe(0);
    await waitFor(() => expect(result.current.size).toBe(2));
    expect(result.current.get(0)).toBe("log-a");
    expect(result.current.get(3)).toBe("log-b");
    expect(apiMock).toHaveBeenCalledWith("/api/logs?plan=sprint");
  });

  it("never fetches when no plan is active (planKey null)", async () => {
    const apiMock = vi.fn(
      async () => new Response(JSON.stringify({ links: [] }), { status: 200 }),
    );
    vi.doMock("../api", () => ({ api: apiMock }));
    const { usePlanLinks } = await import("./usePlanLinks");
    const { result } = renderHook(() => usePlanLinks(null));

    expect(result.current.size).toBe(0);
    expect(apiMock).not.toHaveBeenCalled();
  });

  it("degrades to an empty Map on a non-2xx response, rather than throwing or surfacing an error state", async () => {
    const apiMock = vi.fn(async () => new Response("nope", { status: 500 }));
    vi.doMock("../api", () => ({ api: apiMock }));
    const { usePlanLinks } = await import("./usePlanLinks");
    const { result } = renderHook(() => usePlanLinks("sprint"));

    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(1));
    expect(result.current.size).toBe(0);
  });

  it("degrades to an empty Map on a network rejection", async () => {
    const apiMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.doMock("../api", () => ({ api: apiMock }));
    const { usePlanLinks } = await import("./usePlanLinks");
    const { result } = renderHook(() => usePlanLinks("sprint"));

    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(1));
    expect(result.current.size).toBe(0);
  });

  it("re-fetches when the active plan key changes (e.g. Switch)", async () => {
    const apiMock = vi.fn(async (path: string) => {
      const links =
        path === "/api/logs?plan=sprint"
          ? [{ planIndex: 0, id: "sprint-log" }]
          : [{ planIndex: 0, id: "head-log" }];
      return new Response(JSON.stringify({ links }), { status: 200 });
    });
    vi.doMock("../api", () => ({ api: apiMock }));
    const { usePlanLinks } = await import("./usePlanLinks");
    const { result, rerender } = renderHook<
      Map<number, string>,
      { planKey: "sprint" | "head" }
    >(({ planKey }) => usePlanLinks(planKey), {
      initialProps: { planKey: "sprint" },
    });

    await waitFor(() => expect(result.current.get(0)).toBe("sprint-log"));

    rerender({ planKey: "head" });
    await waitFor(() => expect(result.current.get(0)).toBe("head-log"));
    expect(apiMock).toHaveBeenCalledTimes(2);
  });
});
