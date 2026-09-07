import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("usePreferences", () => {
  it("exposes the fetched countdownSeconds once loaded", async () => {
    const preferences = { countdownSeconds: 10 };
    vi.doMock("../api", () => ({
      api: vi.fn(
        async () => new Response(JSON.stringify(preferences), { status: 200 }),
      ),
    }));
    const { usePreferences } = await import("./usePreferences");
    const { result } = renderHook(() => usePreferences());
    expect(result.current.state).toBe("loading");
    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("expected ready");
    expect(result.current.preferences).toStrictEqual(preferences);
  });

  // The exact weakness a previous phase shipped and needed a follow-up wave
  // for: asserting only that `retry` is a function proves nothing about
  // whether it actually refetches. This calls it and asserts a second
  // request fires.
  it("surfaces a retry when the GET fails, and calling it fires a second request", async () => {
    const apiMock = vi.fn(async () => new Response("nope", { status: 500 }));
    vi.doMock("../api", () => ({
      api: apiMock,
    }));
    const { usePreferences } = await import("./usePreferences");
    const { result } = renderHook(() => usePreferences());
    await waitFor(() => expect(result.current.state).toBe("error"));
    if (result.current.state !== "error") throw new Error("expected error");
    expect(typeof result.current.retry).toBe("function");
    expect(apiMock).toHaveBeenCalledTimes(1);

    result.current.retry();
    await waitFor(() => {
      expect(apiMock).toHaveBeenCalledTimes(2);
    });
  });

  it("retries successfully and reaches ready state with the refetched value", async () => {
    const preferences = { countdownSeconds: 15 };
    let callCount = 0;
    const apiMock = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        return new Response("nope", { status: 500 });
      }
      return new Response(JSON.stringify(preferences), { status: 200 });
    });
    vi.doMock("../api", () => ({
      api: apiMock,
    }));
    const { usePreferences } = await import("./usePreferences");
    const { result } = renderHook(() => usePreferences());
    await waitFor(() => expect(result.current.state).toBe("error"));

    const errorState = result.current as { state: "error"; retry: () => void };
    errorState.retry();
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(
      (
        result.current as {
          state: "ready";
          preferences: typeof preferences;
        }
      ).preferences,
    ).toStrictEqual(preferences);
  });

  it("enters error state, rather than throwing, when the fetch itself rejects", async () => {
    const apiMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.doMock("../api", () => ({
      api: apiMock,
    }));
    const { usePreferences } = await import("./usePreferences");
    const { result } = renderHook(() => usePreferences());
    await waitFor(() => expect(result.current.state).toBe("error"));
    if (result.current.state !== "error") throw new Error("expected error");
    expect(typeof result.current.retry).toBe("function");
  });
});

describe("setBaselinesSkipped (Phase RW PR C)", () => {
  /** A server that stores what it is told and echoes the row back. */
  function realisticServer(initial = false) {
    let stored = initial;
    const calls: unknown[] = [];
    const api = vi.fn(async (_path: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as {
          baselinesSkipped?: boolean;
        };
        calls.push(body);
        if (body.baselinesSkipped !== undefined) stored = body.baselinesSkipped;
      }
      return new Response(
        JSON.stringify({ countdownSeconds: 10, baselinesSkipped: stored }),
        { status: 200 },
      );
    });
    return { api, calls, read: () => stored };
  }

  it("PUTs the value, resolves true, and refetches so the flag is live", async () => {
    const server = realisticServer(false);
    vi.doMock("../api", () => ({ api: server.api }));
    const { usePreferences } = await import("./usePreferences");
    const { result } = renderHook(() => usePreferences());
    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("expected ready");

    await expect(result.current.setBaselinesSkipped(true)).resolves.toBe(true);
    expect(server.calls).toStrictEqual([{ baselinesSkipped: true }]);
    // The refetch is what makes the doors card disappear without a reload.
    await waitFor(() => {
      if (result.current.state !== "ready") throw new Error("not ready");
      expect(result.current.preferences.baselinesSkipped).toBe(true);
    });
  });

  it("resolves FALSE when a 200 comes back without the value — an older server that ignored the key", async () => {
    // The real shape of a rollback to $PREV: the route silently drops an
    // unrecognised key, its empty-patch guard returns 200 with the
    // unchanged row, and `res.ok` is true for a write that stored nothing.
    const api = vi.fn(
      async () =>
        new Response(JSON.stringify({ countdownSeconds: 10 }), { status: 200 }),
    );
    vi.doMock("../api", () => ({ api }));
    const { usePreferences } = await import("./usePreferences");
    const { result } = renderHook(() => usePreferences());
    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("expected ready");

    await expect(result.current.setBaselinesSkipped(true)).resolves.toBe(false);
  });

  it("resolves FALSE when the server echoes the OTHER value", async () => {
    const api = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ countdownSeconds: 10, baselinesSkipped: false }),
          { status: 200 },
        ),
    );
    vi.doMock("../api", () => ({ api }));
    const { usePreferences } = await import("./usePreferences");
    const { result } = renderHook(() => usePreferences());
    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("expected ready");

    await expect(result.current.setBaselinesSkipped(true)).resolves.toBe(false);
  });

  it("resolves FALSE on a non-OK response", async () => {
    let first = true;
    const api = vi.fn(async () => {
      if (first) {
        first = false;
        return new Response(
          JSON.stringify({ countdownSeconds: 10, baselinesSkipped: false }),
          { status: 200 },
        );
      }
      return new Response("nope", { status: 500 });
    });
    vi.doMock("../api", () => ({ api }));
    const { usePreferences } = await import("./usePreferences");
    const { result } = renderHook(() => usePreferences());
    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("expected ready");

    await expect(result.current.setBaselinesSkipped(true)).resolves.toBe(false);
  });
});
