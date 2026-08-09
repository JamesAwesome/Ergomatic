import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { ArticleReadsState } from "./useArticleReads";

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("useArticleReads", () => {
  it("loads read slugs into a set", async () => {
    const apiMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ slugs: ["baselines"] }), {
          status: 200,
        }),
    );
    vi.doMock("../api", () => ({ api: apiMock }));
    const { useArticleReads } = await import("./useArticleReads");
    const { result } = renderHook(() => useArticleReads());
    expect(result.current.state).toBe("loading");
    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("expected ready");
    expect(result.current.readSlugs.has("baselines")).toBe(true);
  });

  it("markRead is optimistic and fires the PUT before it resolves", async () => {
    let resolvePut: (() => void) | undefined;
    const apiMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return new Promise<Response>((resolve) => {
          resolvePut = () => resolve(new Response(null, { status: 204 }));
        });
      }
      return new Response(JSON.stringify({ slugs: [] }), { status: 200 });
    });
    vi.doMock("../api", () => ({ api: apiMock }));
    const { useArticleReads } = await import("./useArticleReads");
    const { result } = renderHook(() => useArticleReads());
    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("expected ready");
    const { markRead } = result.current;

    act(() => {
      markRead("pain-scale");
    });

    // Visible before the PUT resolves.
    if (result.current.state !== "ready") throw new Error("expected ready");
    expect(result.current.readSlugs.has("pain-scale")).toBe(true);
    expect(apiMock).toHaveBeenCalledWith("/api/article-reads/pain-scale", {
      method: "PUT",
    });

    resolvePut?.();
    await waitFor(() => {
      if (result.current.state !== "ready") throw new Error("expected ready");
      expect(result.current.readSlugs.has("pain-scale")).toBe(true);
    });
  });

  it("a failed PUT stays silent and keeps the optimistic state for this visit", async () => {
    const apiMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        throw new Error("offline");
      }
      return new Response(JSON.stringify({ slugs: [] }), { status: 200 });
    });
    vi.doMock("../api", () => ({ api: apiMock }));
    const { useArticleReads } = await import("./useArticleReads");
    const { result } = renderHook(() => useArticleReads());
    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("expected ready");
    const { markRead } = result.current;

    act(() => {
      markRead("baselines");
    });

    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(2));
    if (result.current.state !== "ready") throw new Error("expected ready");
    expect(result.current.readSlugs.has("baselines")).toBe(true);
  });

  it("a failed fetch reports error, not a wrong empty set", async () => {
    const apiMock = vi.fn(async () => {
      throw new Error("offline");
    });
    vi.doMock("../api", () => ({ api: apiMock }));
    const { useArticleReads } = await import("./useArticleReads");
    const { result } = renderHook(() => useArticleReads());
    await waitFor(() => expect(result.current.state).toBe("error"));
    const state: ArticleReadsState = result.current;
    expect(state).toStrictEqual({ state: "error" });
  });

  it("a non-ok GET response also reports error", async () => {
    const apiMock = vi.fn(async () => new Response("nope", { status: 500 }));
    vi.doMock("../api", () => ({ api: apiMock }));
    const { useArticleReads } = await import("./useArticleReads");
    const { result } = renderHook(() => useArticleReads());
    await waitFor(() => expect(result.current.state).toBe("error"));
  });

  it("marking an already-read slug fires no duplicate PUT", async () => {
    const apiMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ slugs: ["baselines"] }), {
          status: 200,
        }),
    );
    vi.doMock("../api", () => ({ api: apiMock }));
    const { useArticleReads } = await import("./useArticleReads");
    const { result } = renderHook(() => useArticleReads());
    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("expected ready");
    const { markRead } = result.current;

    act(() => {
      markRead("baselines");
    });

    expect(apiMock).toHaveBeenCalledTimes(1); // just the initial GET
  });

  it("markUnread is optimistic and fires the DELETE before it resolves", async () => {
    let resolveDelete: (() => void) | undefined;
    const apiMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        return new Promise<Response>((resolve) => {
          resolveDelete = () => resolve(new Response(null, { status: 204 }));
        });
      }
      return new Response(JSON.stringify({ slugs: ["baselines"] }), {
        status: 200,
      });
    });
    vi.doMock("../api", () => ({ api: apiMock }));
    const { useArticleReads } = await import("./useArticleReads");
    const { result } = renderHook(() => useArticleReads());
    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("expected ready");
    const { markUnread } = result.current;

    act(() => {
      markUnread("baselines");
    });

    // Visible before the DELETE resolves.
    if (result.current.state !== "ready") throw new Error("expected ready");
    expect(result.current.readSlugs.has("baselines")).toBe(false);
    expect(apiMock).toHaveBeenCalledWith("/api/article-reads/baselines", {
      method: "DELETE",
    });

    resolveDelete?.();
    await waitFor(() => {
      if (result.current.state !== "ready") throw new Error("expected ready");
      expect(result.current.readSlugs.has("baselines")).toBe(false);
    });
  });

  it("a failed DELETE stays silent and keeps the optimistic removal for this visit", async () => {
    const apiMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        throw new Error("offline");
      }
      return new Response(JSON.stringify({ slugs: ["baselines"] }), {
        status: 200,
      });
    });
    vi.doMock("../api", () => ({ api: apiMock }));
    const { useArticleReads } = await import("./useArticleReads");
    const { result } = renderHook(() => useArticleReads());
    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("expected ready");
    const { markUnread } = result.current;

    act(() => {
      markUnread("baselines");
    });

    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(2));
    if (result.current.state !== "ready") throw new Error("expected ready");
    expect(result.current.readSlugs.has("baselines")).toBe(false);
  });

  it("marking an unread (absent) slug fires no DELETE at all", async () => {
    const apiMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ slugs: ["baselines"] }), {
          status: 200,
        }),
    );
    vi.doMock("../api", () => ({ api: apiMock }));
    const { useArticleReads } = await import("./useArticleReads");
    const { result } = renderHook(() => useArticleReads());
    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("expected ready");
    const { markUnread } = result.current;

    act(() => {
      markUnread("pain-scale"); // never was in readSlugs
    });

    expect(apiMock).toHaveBeenCalledTimes(1); // just the initial GET
    if (result.current.state !== "ready") throw new Error("expected ready");
    expect(result.current.readSlugs.has("pain-scale")).toBe(false);
  });
});
