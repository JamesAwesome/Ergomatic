import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

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

  // Phase 6I: `save` is the START HERE block's DISMISS control — optimistic,
  // same silence rules as useArticleReads.ts's markRead/markUnread.
  describe("save", () => {
    it("is optimistic and fires the PUT with the patch before it resolves", async () => {
      const preferences = { countdownSeconds: 10, startHereDismissed: false };
      let resolvePut: (() => void) | undefined;
      const apiMock = vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === "PUT") {
          return new Promise<Response>((resolve) => {
            resolvePut = () => resolve(new Response(null, { status: 204 }));
          });
        }
        return new Response(JSON.stringify(preferences), { status: 200 });
      });
      vi.doMock("../api", () => ({ api: apiMock }));
      const { usePreferences } = await import("./usePreferences");
      const { result } = renderHook(() => usePreferences());
      await waitFor(() => expect(result.current.state).toBe("ready"));
      if (result.current.state !== "ready") throw new Error("expected ready");
      const { save } = result.current;

      act(() => {
        save({ startHereDismissed: true });
      });

      // Visible before the PUT resolves.
      if (result.current.state !== "ready") throw new Error("expected ready");
      expect(result.current.preferences.startHereDismissed).toBe(true);
      // Untouched fields survive the patch unchanged.
      expect(result.current.preferences.countdownSeconds).toBe(10);
      expect(apiMock).toHaveBeenCalledWith("/api/prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startHereDismissed: true }),
      });

      resolvePut?.();
      await waitFor(() => {
        if (result.current.state !== "ready") throw new Error("expected ready");
        expect(result.current.preferences.startHereDismissed).toBe(true);
      });
    });

    it("a failed PUT stays silent and keeps the optimistic value for this visit", async () => {
      const preferences = { countdownSeconds: 10, startHereDismissed: false };
      const apiMock = vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === "PUT") {
          throw new Error("offline");
        }
        return new Response(JSON.stringify(preferences), { status: 200 });
      });
      vi.doMock("../api", () => ({ api: apiMock }));
      const { usePreferences } = await import("./usePreferences");
      const { result } = renderHook(() => usePreferences());
      await waitFor(() => expect(result.current.state).toBe("ready"));
      if (result.current.state !== "ready") throw new Error("expected ready");
      const { save } = result.current;

      act(() => {
        save({ startHereDismissed: true });
      });

      await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(2));
      if (result.current.state !== "ready") throw new Error("expected ready");
      expect(result.current.preferences.startHereDismissed).toBe(true);
    });
  });
});
