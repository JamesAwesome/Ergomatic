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

  // The read-after-write barrier (2026-08-12). This is the race behind
  // `onboarding.spec.ts`'s intermittent "0 OF 4 READ": a second screen's own
  // hook instance mounts and GETs while the first screen's markRead PUT is
  // still in flight, so the server answers from before the write.
  //
  // The mock models the SERVER, not the test's own call ordering: its GET
  // answers according to whether the PUT has actually resolved. An earlier
  // version keyed the answer on "first GET vs later GET", which returned the
  // post-write value whether or not the barrier existed — both mutants
  // survived it. This fixture fails without the barrier.
  function serverMock() {
    let putResolved = false;
    let resolvePut: (() => void) | undefined;
    let getCalls = 0;
    const api = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return new Promise<Response>((resolve) => {
          resolvePut = () => {
            putResolved = true;
            resolve(new Response(null, { status: 204 }));
          };
        });
      }
      getCalls += 1;
      return new Response(
        JSON.stringify({ slugs: putResolved ? ["baselines"] : [] }),
        { status: 200 },
      );
    });
    return {
      api,
      resolve: () => resolvePut!(),
      getCalls: () => getCalls,
    };
  }

  /** Drains the microtask queue so any UNBARRIERED request would have fired
   *  by the time we assert it hasn't. Without this the test proves nothing:
   *  the mount effect only SCHEDULES its fetch, so an immediate assertion
   *  passes whether the barrier exists or not (both mutants survived an
   *  earlier version of this test for exactly that reason). */
  async function drainMicrotasks() {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  }

  it("a screen mounting mid-write reads the POST-write truth, not the stale count", async () => {
    const server = serverMock();
    vi.doMock("../api", () => ({ api: server.api }));
    const { useArticleReads } = await import("./useArticleReads");

    const first = renderHook(() => useArticleReads());
    await waitFor(() => expect(first.result.current.state).toBe("ready"));
    if (first.result.current.state !== "ready") throw new Error("ready");
    const { markRead } = first.result.current;
    act(() => {
      markRead("baselines");
    });

    expect(server.getCalls()).toBe(1); // screen one's own mount GET

    // Screen two mounts WHILE the PUT is in flight. The barrier's contract:
    // it issues NO read until the write settles — this is the assertion that
    // actually discriminates, since the data-level one can be satisfied by
    // accident of ordering.
    const second = renderHook(() => useArticleReads());
    await drainMicrotasks();
    expect(server.getCalls()).toBe(1);

    // Only now does the write land, and only now may the read go out.
    act(() => server.resolve());
    await waitFor(() => expect(server.getCalls()).toBe(2));
    await waitFor(() => expect(second.result.current.state).toBe("ready"));
    if (second.result.current.state !== "ready") throw new Error("ready");
    expect(second.result.current.readSlugs.has("baselines")).toBe(true);
  });

  it("the barrier stays honest about a FAILED write: no local guess survives it", async () => {
    // Distinguishes the barrier from an optimistic local union, which would
    // claim the article is read even though the server never recorded it.
    let rejectPut: (() => void) | undefined;
    const apiMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return new Promise<Response>((_resolve, reject) => {
          rejectPut = () => reject(new Error("offline"));
        });
      }
      return new Response(JSON.stringify({ slugs: [] }), { status: 200 });
    });
    vi.doMock("../api", () => ({ api: apiMock }));
    const { useArticleReads } = await import("./useArticleReads");

    const first = renderHook(() => useArticleReads());
    await waitFor(() => expect(first.result.current.state).toBe("ready"));
    if (first.result.current.state !== "ready") throw new Error("ready");
    const { markRead } = first.result.current;
    act(() => {
      markRead("baselines");
    });

    const second = renderHook(() => useArticleReads());
    act(() => rejectPut!());
    await waitFor(() => expect(second.result.current.state).toBe("ready"));
    if (second.result.current.state !== "ready") throw new Error("ready");
    expect(second.result.current.readSlugs.has("baselines")).toBe(false);
  });
});
