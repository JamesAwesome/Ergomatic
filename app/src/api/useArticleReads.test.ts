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
      markRead("effort-scale");
    });

    // Visible before the PUT resolves.
    if (result.current.state !== "ready") throw new Error("expected ready");
    expect(result.current.readSlugs.has("effort-scale")).toBe(true);
    expect(apiMock).toHaveBeenCalledWith("/api/article-reads/effort-scale", {
      method: "PUT",
    });

    resolvePut?.();
    await waitFor(() => {
      if (result.current.state !== "ready") throw new Error("expected ready");
      expect(result.current.readSlugs.has("effort-scale")).toBe(true);
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
      markUnread("effort-scale"); // never was in readSlugs
    });

    expect(apiMock).toHaveBeenCalledTimes(1); // just the initial GET
    if (result.current.state !== "ready") throw new Error("expected ready");
    expect(result.current.readSlugs.has("effort-scale")).toBe(false);
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

  it("a failed write is corrected by the next reconciling read, never by a local guess", async () => {
    // Since the 2026-09-12 layout-shift spec the app IS an optimistic local
    // union until the server answers: the warm second mount renders the
    // failed write as read (from the last-known set) — asserted below, on
    // purpose — and the barrier's reconciling GET is what corrects it. What
    // this gates is that the correction HAPPENS: a design that applied the
    // optimistic set as if it were server truth would stay `true`.
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
    if (second.result.current.state !== "ready") throw new Error("ready");
    expect(second.result.current.readSlugs.has("baselines")).toBe(true);
    act(() => rejectPut!());
    // The barrier releases the reconciling GET only once the PUT settled;
    // its `[]` is the truth and replaces the guess.
    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(3));
    await waitFor(() => {
      if (second.result.current.state !== "ready") throw new Error("ready");
      expect(second.result.current.readSlugs.has("baselines")).toBe(false);
    });
  });
});

// Spec 2026-09-12-news-layout-shift §3 — the module-level last-known set.
// Every test here starts from a fresh module (`vi.resetModules` above), so
// "cold" is the real cold: no GET has resolved in this module yet.
describe("useArticleReads — last-known cache", () => {
  function okGet(slugs: string[]) {
    return new Response(JSON.stringify({ slugs }), { status: 200 });
  }

  it("C1: a mount after a successful read renders ready from the last known set at once, then refetches", async () => {
    const apiMock = vi.fn(async () => okGet(["baselines"]));
    vi.doMock("../api", () => ({ api: apiMock }));
    const { useArticleReads } = await import("./useArticleReads");

    const first = renderHook(() => useArticleReads());
    expect(first.result.current.state).toBe("loading");
    await waitFor(() => expect(first.result.current.state).toBe("ready"));
    first.unmount();

    const second = renderHook(() => useArticleReads());
    // The FIRST read of the second instance's state — no waitFor.
    if (second.result.current.state !== "ready") {
      throw new Error(`expected ready, got ${second.result.current.state}`);
    }
    expect(second.result.current.readSlugs.has("baselines")).toBe(true);
    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(2));
  });

  it("C2: a markRead on one mounted instance is visible on another before any request resolves", async () => {
    const apiMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") return new Promise<Response>(() => {});
      return okGet([]);
    });
    vi.doMock("../api", () => ({ api: apiMock }));
    const { useArticleReads } = await import("./useArticleReads");

    const a = renderHook(() => useArticleReads());
    await waitFor(() => expect(a.result.current.state).toBe("ready"));
    const b = renderHook(() => useArticleReads());
    if (a.result.current.state !== "ready") throw new Error("ready");
    const { markRead } = a.result.current;

    act(() => {
      markRead("effort-scale");
    });

    if (b.result.current.state !== "ready") throw new Error("ready");
    expect(b.result.current.readSlugs.has("effort-scale")).toBe(true);
  });

  it("C3: a read issued before a write and resolving after that write SETTLED is dropped and re-issued — the write survives", async () => {
    // The antagonist's interleaving (ledger 2026-09-12): with a warm cache
    // the Reader marks read on its first render, so a PUT can go out after
    // News's GET and land before that slow GET returns. An emptiness check
    // on pending writes sees nothing pending and applies the stale set.
    const gets: Array<(r: Response) => void> = [];
    const apiMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") return new Response(null, { status: 204 });
      return new Promise<Response>((resolve) => {
        gets.push(resolve);
      });
    });
    vi.doMock("../api", () => ({ api: apiMock }));
    const { useArticleReads } = await import("./useArticleReads");

    const first = renderHook(() => useArticleReads());
    await waitFor(() => expect(gets).toHaveLength(1));
    act(() => gets[0]!(okGet([])));
    await waitFor(() => expect(first.result.current.state).toBe("ready"));
    first.unmount();

    const second = renderHook(() => useArticleReads());
    await waitFor(() => expect(gets).toHaveLength(2)); // issued, held
    if (second.result.current.state !== "ready") throw new Error("ready");
    const { markRead } = second.result.current;
    act(() => {
      markRead("baselines");
    });
    // The PUT resolves immediately — let it settle before the GET returns.
    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(3));
    await act(async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });

    act(() => gets[1]!(okGet([]))); // the pre-write truth, arriving late
    await waitFor(() => expect(gets).toHaveLength(3)); // re-issued once
    if (second.result.current.state !== "ready") throw new Error("ready");
    expect(second.result.current.readSlugs.has("baselines")).toBe(true);

    // ONCE: a write that overtakes the retry too is dropped without a third
    // GET — the next mount reconciles (bounded, like the barrier's two
    // passes). A `while (stale)` loop would issue a fourth GET here.
    act(() => {
      markRead("effort-scale");
    });
    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(5));
    act(() => gets[2]!(okGet(["baselines"]))); // stale again: lacks effort-scale
    await act(async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(gets).toHaveLength(3);
    if (second.result.current.state !== "ready") throw new Error("ready");
    expect(second.result.current.readSlugs.has("baselines")).toBe(true);
    expect(second.result.current.readSlugs.has("effort-scale")).toBe(true);
  });

  it("C4: clearArticleReadsCache makes the next mount cold", async () => {
    const apiMock = vi.fn(async () => okGet(["baselines"]));
    vi.doMock("../api", () => ({ api: apiMock }));
    const { useArticleReads, clearArticleReadsCache } =
      await import("./useArticleReads");

    const first = renderHook(() => useArticleReads());
    await waitFor(() => expect(first.result.current.state).toBe("ready"));
    first.unmount();
    clearArticleReadsCache();

    const second = renderHook(() => useArticleReads());
    expect(second.result.current.state).toBe("loading");
  });

  it("C4: a non-OK read on a warm mount clears the cache and reports error, and the next mount is cold", async () => {
    let calls = 0;
    const apiMock = vi.fn(async () => {
      calls++;
      return calls === 1
        ? okGet(["baselines"])
        : new Response(null, { status: 401 });
    });
    vi.doMock("../api", () => ({ api: apiMock }));
    const { useArticleReads } = await import("./useArticleReads");

    const first = renderHook(() => useArticleReads());
    await waitFor(() => expect(first.result.current.state).toBe("ready"));
    first.unmount();

    const second = renderHook(() => useArticleReads());
    expect(second.result.current.state).toBe("ready"); // warm, then...
    await waitFor(() => expect(second.result.current.state).toBe("error"));
    second.unmount();

    const third = renderHook(() => useArticleReads());
    expect(third.result.current.state).toBe("loading");
  });

  it("a network failure on a warm mount keeps showing the last known set", async () => {
    let calls = 0;
    const apiMock = vi.fn(async () => {
      calls++;
      if (calls === 1) return okGet(["baselines"]);
      throw new Error("offline");
    });
    vi.doMock("../api", () => ({ api: apiMock }));
    const { useArticleReads } = await import("./useArticleReads");

    const first = renderHook(() => useArticleReads());
    await waitFor(() => expect(first.result.current.state).toBe("ready"));
    first.unmount();

    const second = renderHook(() => useArticleReads());
    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(2));
    await act(async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    if (second.result.current.state !== "ready") throw new Error("ready");
    expect(second.result.current.readSlugs.has("baselines")).toBe(true);
  });
});
