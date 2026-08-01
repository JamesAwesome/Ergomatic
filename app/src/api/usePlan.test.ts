import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("usePlan", () => {
  it("exposes the fetched plan once loaded", async () => {
    const plan = {
      planKey: "sprint",
      doneN: 11,
      sequence: [{ index: 0, code: "O2", status: "done" }],
    };
    vi.doMock("../api", () => ({
      api: vi.fn(
        async () => new Response(JSON.stringify(plan), { status: 200 }),
      ),
    }));
    const { usePlan } = await import("./usePlan");
    const { result } = renderHook(() => usePlan());
    expect(result.current.state).toBe("loading");
    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("expected ready");
    expect(result.current.plan).toStrictEqual(plan);
  });

  it("exposes a freestyle plan (no plan chosen) once loaded", async () => {
    const plan = { planKey: null, doneN: 0, sequence: [] };
    vi.doMock("../api", () => ({
      api: vi.fn(
        async () => new Response(JSON.stringify(plan), { status: 200 }),
      ),
    }));
    const { usePlan } = await import("./usePlan");
    const { result } = renderHook(() => usePlan());
    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("expected ready");
    expect(result.current.plan.planKey).toBeNull();
  });

  it("surfaces a retry when the request fails, and calling it fires a second request", async () => {
    const apiMock = vi.fn(async () => new Response("nope", { status: 500 }));
    vi.doMock("../api", () => ({ api: apiMock }));
    const { usePlan } = await import("./usePlan");
    const { result } = renderHook(() => usePlan());
    await waitFor(() => expect(result.current.state).toBe("error"));
    if (result.current.state !== "error") throw new Error("expected error");
    expect(apiMock).toHaveBeenCalledTimes(1);

    result.current.retry();
    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(2));
  });

  it("retries successfully and reaches ready state", async () => {
    const plan = { planKey: "head", doneN: 3, sequence: [] };
    let callCount = 0;
    const apiMock = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) return new Response("nope", { status: 500 });
      return new Response(JSON.stringify(plan), { status: 200 });
    });
    vi.doMock("../api", () => ({ api: apiMock }));
    const { usePlan } = await import("./usePlan");
    const { result } = renderHook(() => usePlan());
    await waitFor(() => expect(result.current.state).toBe("error"));

    const errorState = result.current as { state: "error"; retry: () => void };
    errorState.retry();
    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("expected ready");
    expect(result.current.plan).toStrictEqual(plan);
  });

  it("enters error state, rather than throwing, when the fetch itself rejects", async () => {
    const apiMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.doMock("../api", () => ({ api: apiMock }));
    const { usePlan } = await import("./usePlan");
    const { result } = renderHook(() => usePlan());
    await waitFor(() => expect(result.current.state).toBe("error"));
    if (result.current.state !== "error") throw new Error("expected error");
    expect(typeof result.current.retry).toBe("function");
  });

  it("choose() PUTs {planKey} to /api/plan, then refetches the updated plan", async () => {
    const before = { planKey: null, doneN: 0, sequence: [] };
    const after = { planKey: "sprint", doneN: 0, sequence: [] };
    let getCount = 0;
    const apiMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") return new Response(null, { status: 200 });
      getCount += 1;
      return new Response(JSON.stringify(getCount === 1 ? before : after), {
        status: 200,
      });
    });
    vi.doMock("../api", () => ({ api: apiMock }));
    const { usePlan } = await import("./usePlan");
    const { result } = renderHook(() => usePlan());
    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("expected ready");
    const { choose } = result.current;

    await act(async () => {
      await choose("sprint");
    });

    const putCall = apiMock.mock.calls.find(
      ([, init]) => init?.method === "PUT",
    );
    expect(putCall).toBeDefined();
    const [url, init] = putCall as [string, RequestInit];
    expect(url).toBe("/api/plan");
    expect(JSON.parse(init.body as string)).toStrictEqual({
      planKey: "sprint",
    });
    await waitFor(() => {
      if (result.current.state !== "ready") throw new Error("expected ready");
      expect(result.current.plan).toStrictEqual(after);
    });
  });

  it("reset() PUTs {reset:true} to /api/plan, then refetches the updated plan", async () => {
    const before = { planKey: "sprint", doneN: 11, sequence: [] };
    const after = { planKey: "sprint", doneN: 0, sequence: [] };
    let getCount = 0;
    const apiMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") return new Response(null, { status: 200 });
      getCount += 1;
      return new Response(JSON.stringify(getCount === 1 ? before : after), {
        status: 200,
      });
    });
    vi.doMock("../api", () => ({ api: apiMock }));
    const { usePlan } = await import("./usePlan");
    const { result } = renderHook(() => usePlan());
    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("expected ready");
    const { reset } = result.current;

    await act(async () => {
      await reset();
    });

    const putCall = apiMock.mock.calls.find(
      ([, init]) => init?.method === "PUT",
    );
    expect(putCall).toBeDefined();
    const [url, init] = putCall as [string, RequestInit];
    expect(url).toBe("/api/plan");
    expect(JSON.parse(init.body as string)).toStrictEqual({ reset: true });
    await waitFor(() => {
      if (result.current.state !== "ready") throw new Error("expected ready");
      expect(result.current.plan).toStrictEqual(after);
    });
  });

  it("choose() rejects, without refetching, when the PUT response is not ok", async () => {
    const plan = { planKey: null, doneN: 0, sequence: [] };
    const apiMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") return new Response("nope", { status: 500 });
      return new Response(JSON.stringify(plan), { status: 200 });
    });
    vi.doMock("../api", () => ({ api: apiMock }));
    const { usePlan } = await import("./usePlan");
    const { result } = renderHook(() => usePlan());
    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("expected ready");

    await expect(result.current.choose("sprint")).rejects.toThrow(
      "failed to update plan",
    );
    // Only the initial GET happened — the failed PUT triggers no refetch.
    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  it("reset() rejects when the PUT response is not ok", async () => {
    const plan = { planKey: "sprint", doneN: 11, sequence: [] };
    const apiMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") return new Response("nope", { status: 500 });
      return new Response(JSON.stringify(plan), { status: 200 });
    });
    vi.doMock("../api", () => ({ api: apiMock }));
    const { usePlan } = await import("./usePlan");
    const { result } = renderHook(() => usePlan());
    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("expected ready");

    await expect(result.current.reset()).rejects.toThrow(
      "failed to update plan",
    );
  });
});
