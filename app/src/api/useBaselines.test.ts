import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("useBaselines", () => {
  it("exposes the fetched baselines once loaded, including the null shape", async () => {
    const baselines = { k2Seconds: null, k6Seconds: null };
    vi.doMock("../api", () => ({
      api: vi.fn(
        async () => new Response(JSON.stringify(baselines), { status: 200 }),
      ),
    }));
    const { useBaselines } = await import("./useBaselines");
    const { result } = renderHook(() => useBaselines());
    expect(result.current.state).toBe("loading");
    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("expected ready");
    expect(result.current.baselines).toStrictEqual(baselines);
  });

  it("surfaces a retry when the GET fails", async () => {
    const apiMock = vi.fn(async () => new Response("nope", { status: 500 }));
    vi.doMock("../api", () => ({
      api: apiMock,
    }));
    const { useBaselines } = await import("./useBaselines");
    const { result } = renderHook(() => useBaselines());
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
    const baselines = { k2Seconds: 95, k6Seconds: 310 };
    let callCount = 0;
    const apiMock = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        return new Response("nope", { status: 500 });
      }
      return new Response(JSON.stringify(baselines), { status: 200 });
    });
    vi.doMock("../api", () => ({
      api: apiMock,
    }));
    const { useBaselines } = await import("./useBaselines");
    const { result } = renderHook(() => useBaselines());
    await waitFor(() => expect(result.current.state).toBe("error"));

    const retryState = result.current as { state: "error"; retry: () => void };
    retryState.retry();
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(
      (result.current as { state: "ready"; baselines: typeof baselines })
        .baselines,
    ).toStrictEqual(baselines);
  });

  it("enters error state when the fetch itself rejects", async () => {
    const apiMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.doMock("../api", () => ({
      api: apiMock,
    }));
    const { useBaselines } = await import("./useBaselines");
    const { result } = renderHook(() => useBaselines());
    await waitFor(() => expect(result.current.state).toBe("error"));
    if (result.current.state !== "error") throw new Error("expected error");
    expect(typeof result.current.retry).toBe("function");
  });

  it("save() PUTs to /api/baselines with the serialized values", async () => {
    const initial = { k2Seconds: null, k6Seconds: null };
    const api = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return new Response(null, { status: 200 });
      }
      return new Response(JSON.stringify(initial), { status: 200 });
    });
    vi.doMock("../api", () => ({ api }));
    const { useBaselines } = await import("./useBaselines");
    const { result } = renderHook(() => useBaselines());
    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("expected ready");
    const { save } = result.current;

    await act(async () => {
      await save({ k2Seconds: 95, k6Seconds: 310 });
    });

    const putCall = api.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(putCall).toBeDefined();
    const [url, init] = putCall as [string, RequestInit];
    expect(url).toBe("/api/baselines");
    expect(JSON.parse(init.body as string)).toStrictEqual({
      k2Seconds: 95,
      k6Seconds: 310,
    });
  });

  // Task review round (PR #66, Finding 1, BLOCKER): `save` must accept a
  // PARTIAL patch — the server's own per-field PUT loop
  // (server/routes/data.ts:327-368) only writes fields present in the
  // body, and `server/stores/baselines.ts:22-33`'s `put()` spreads that
  // same partial object into both the INSERT `values` and the
  // `onConflictDoUpdate` `set`, so an omitted field is never touched in
  // Postgres either — pinned server-side by
  // `server/routes/data.test.ts`'s own "PUT updates a field and GET
  // reflects it" test. `BaselineEditor.tsx`'s Apply relies on this to
  // never fabricate a value for an untouched, still-unset side.
  it("save() PUTs only the given field when called with a partial patch", async () => {
    const initial = { k2Seconds: null, k6Seconds: null };
    const api = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return new Response(null, { status: 200 });
      }
      return new Response(JSON.stringify(initial), { status: 200 });
    });
    vi.doMock("../api", () => ({ api }));
    const { useBaselines } = await import("./useBaselines");
    const { result } = renderHook(() => useBaselines());
    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("expected ready");
    const { save } = result.current;

    await act(async () => {
      await save({ k6Seconds: 122.5 });
    });

    const putCall = api.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(putCall).toBeDefined();
    const [, init] = putCall as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toStrictEqual({
      k6Seconds: 122.5,
    });
  });

  it("refetches after a successful save and exposes the updated values", async () => {
    const oldValues = { k2Seconds: 100, k6Seconds: 320 };
    const newValues = { k2Seconds: 95, k6Seconds: 310 };
    let getCount = 0;
    const api = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return new Response(null, { status: 200 });
      }
      getCount += 1;
      const body = getCount === 1 ? oldValues : newValues;
      return new Response(JSON.stringify(body), { status: 200 });
    });
    vi.doMock("../api", () => ({ api }));
    const { useBaselines } = await import("./useBaselines");
    const { result } = renderHook(() => useBaselines());
    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("expected ready");
    expect(result.current.baselines).toStrictEqual(oldValues);
    const { save } = result.current;

    await act(async () => {
      await save({ k2Seconds: 95, k6Seconds: 310 });
    });

    await waitFor(() => {
      if (result.current.state !== "ready") throw new Error("expected ready");
      expect(result.current.baselines).toStrictEqual(newValues);
    });
    expect(getCount).toBe(2);
  });

  it("rejects when the PUT response is not ok", async () => {
    const api = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return new Response("nope", { status: 500 });
      }
      return new Response(
        JSON.stringify({ k2Seconds: null, k6Seconds: null }),
        { status: 200 },
      );
    });
    vi.doMock("../api", () => ({ api }));
    const { useBaselines } = await import("./useBaselines");
    const { result } = renderHook(() => useBaselines());
    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("expected ready");
    const { save } = result.current;

    await expect(save({ k2Seconds: 95, k6Seconds: 310 })).rejects.toThrow(
      "failed to save baselines",
    );
  });
});
