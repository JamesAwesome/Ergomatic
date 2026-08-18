import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import type { RecentLog } from "../api/useRecentLogs";

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

// Realistic fixtures, per repo convention: real library titles/types
// (app/server/seed/library/) rather than hand-built placeholder strings.
const SEA_FRET = LIBRARY_WORKOUTS.find((w) => w.title === "Sea Fret")!;
const OCCLUDED_FRONT = LIBRARY_WORKOUTS.find(
  (w) => w.title === "Occluded Front",
)!;

function makeLog(id: string, overrides: Partial<RecentLog> = {}): RecentLog {
  return {
    id,
    workoutId: null,
    workoutTitle: SEA_FRET.title,
    workoutType: SEA_FRET.type,
    loggedAt: "2026-07-25T12:00:00.000Z",
    held: null,
    pain: null,
    thumbs: null,
    avgSplitSeconds: null,
    timeSeconds: null,
    distanceMeters: null,
    planKey: null,
    planIndex: null,
    ...overrides,
  };
}

function page(n: number, prefix = "log"): RecentLog[] {
  return Array.from({ length: n }, (_, i) =>
    makeLog(`${prefix}-${i}`, {
      workoutTitle: i % 2 === 0 ? SEA_FRET.title : OCCLUDED_FRONT.title,
      workoutType: i % 2 === 0 ? SEA_FRET.type : OCCLUDED_FRONT.type,
    }),
  );
}

describe("useLogHistory", () => {
  it("starts loading, then exposes the first page (requesting the documented page size)", async () => {
    const apiMock = vi.fn(
      async () => new Response(JSON.stringify(page(3)), { status: 200 }),
    );
    vi.doMock("../api", () => ({ api: apiMock }));
    const { useLogHistory } = await import("./useLogHistory");
    const { result } = renderHook(() => useLogHistory());
    expect(result.current.state).toBe("loading");
    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("expected ready");
    expect(result.current.logs).toHaveLength(3);
    expect(apiMock).toHaveBeenCalledWith("/api/logs?limit=30");
  });

  it("marks the page exhausted when fewer rows than the page size come back", async () => {
    vi.doMock("../api", () => ({
      api: vi.fn(
        async () => new Response(JSON.stringify(page(3)), { status: 200 }),
      ),
    }));
    const { useLogHistory } = await import("./useLogHistory");
    const { result } = renderHook(() => useLogHistory());
    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("expected ready");
    expect(result.current.exhausted).toBe(true);
  });

  it("is not exhausted when a full page comes back", async () => {
    vi.doMock("../api", () => ({
      api: vi.fn(
        async () => new Response(JSON.stringify(page(30)), { status: 200 }),
      ),
    }));
    const { useLogHistory } = await import("./useLogHistory");
    const { result } = renderHook(() => useLogHistory());
    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("expected ready");
    expect(result.current.exhausted).toBe(false);
  });

  it("exposes an empty, exhausted list for a brand-new account with no logged sessions", async () => {
    vi.doMock("../api", () => ({
      api: vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })),
    }));
    const { useLogHistory } = await import("./useLogHistory");
    const { result } = renderHook(() => useLogHistory());
    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("expected ready");
    expect(result.current.logs).toStrictEqual([]);
    expect(result.current.exhausted).toBe(true);
  });

  it("surfaces a retry when the initial request fails, and calling it fires a second request", async () => {
    const apiMock = vi.fn(async () => new Response("nope", { status: 500 }));
    vi.doMock("../api", () => ({ api: apiMock }));
    const { useLogHistory } = await import("./useLogHistory");
    const { result } = renderHook(() => useLogHistory());
    await waitFor(() => expect(result.current.state).toBe("error"));
    if (result.current.state !== "error") throw new Error("expected error");
    expect(apiMock).toHaveBeenCalledTimes(1);

    result.current.retry();
    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(2));
  });

  it("enters error state, rather than throwing, when the fetch itself rejects", async () => {
    vi.doMock("../api", () => ({
      api: vi.fn(async () => {
        throw new Error("network down");
      }),
    }));
    const { useLogHistory } = await import("./useLogHistory");
    const { result } = renderHook(() => useLogHistory());
    await waitFor(() => expect(result.current.state).toBe("error"));
  });

  // loadMore appends without reorder — the failing test this task's brief
  // names by name. Page 1's cursor is its OWN last row's id, and the
  // second page's rows land AFTER page 1's, in the order the server sent
  // them (never re-sorted client-side).
  it("loadMore appends the next page after the current rows, without reordering either page", async () => {
    // Page 1 must be a FULL page (30 rows) — a page shorter than the page
    // size means "no more rows exist" (exhausted), which is what the next
    // test below exercises; this test needs `loadMore` to actually be
    // callable, so page 1 can't itself look exhausted.
    const page1 = page(30, "p1");
    const page2 = page(2, "p2");
    const apiMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(page1), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(page2), { status: 200 }),
      );
    vi.doMock("../api", () => ({ api: apiMock }));
    const { useLogHistory } = await import("./useLogHistory");
    const { result } = renderHook(() => useLogHistory());
    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("expected ready");
    expect(result.current.logs.map((l) => l.id)).toStrictEqual(
      page1.map((l) => l.id),
    );
    expect(result.current.exhausted).toBe(false);

    act(() => {
      (result.current as { loadMore: () => void }).loadMore();
    });

    await waitFor(() =>
      expect((result.current as { logs: RecentLog[] }).logs).toHaveLength(32),
    );
    if (result.current.state !== "ready") throw new Error("expected ready");
    expect(result.current.logs.map((l) => l.id)).toStrictEqual([
      ...page1.map((l) => l.id),
      "p2-0",
      "p2-1",
    ]);
    expect(result.current.exhausted).toBe(true);
    // The cursor is page 1's OWN last row's id (spec §3: an opaque id, the
    // server resolves it, the timestamp never leaves the server).
    expect(apiMock).toHaveBeenNthCalledWith(
      2,
      "/api/logs?limit=30&before=p1-29",
    );
  });

  it("does not call the API again once the list is exhausted", async () => {
    const apiMock = vi.fn(
      async () => new Response(JSON.stringify(page(2)), { status: 200 }),
    );
    vi.doMock("../api", () => ({ api: apiMock }));
    const { useLogHistory } = await import("./useLogHistory");
    const { result } = renderHook(() => useLogHistory());
    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("expected ready");
    expect(result.current.exhausted).toBe(true);

    act(() => {
      (result.current as { loadMore: () => void }).loadMore();
    });

    // Give any errant fetch a tick to have fired.
    await Promise.resolve();
    expect(apiMock).toHaveBeenCalledTimes(1);
  });

  // Line 99's own `.catch()` — a rejected loadMore fetch (network drop
  // mid-scroll) is silently retryable, never flips the whole screen to
  // the "error" state: the rows already on screen stay, and the in-flight
  // guard resets so the NEXT scroll tick can try again.
  it("keeps the current rows and resets the in-flight guard when a loadMore fetch itself rejects", async () => {
    const page1 = page(30, "p1");
    const apiMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(page1), { status: 200 }),
      )
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(page(1, "p2")), { status: 200 }),
      );
    vi.doMock("../api", () => ({ api: apiMock }));
    const { useLogHistory } = await import("./useLogHistory");
    const { result } = renderHook(() => useLogHistory());
    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("expected ready");

    act(() => {
      (result.current as { loadMore: () => void }).loadMore();
    });
    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(2));
    // The rejection is swallowed — still ready, still the original 30
    // rows, nothing thrown out to the hook's caller.
    if (result.current.state !== "ready") throw new Error("expected ready");
    expect(result.current.logs).toHaveLength(30);

    // The in-flight guard reset on the rejection, so a SECOND loadMore
    // actually fires a THIRD request rather than being swallowed by
    // `fetchingMoreRef` still reading true.
    act(() => {
      (result.current as { loadMore: () => void }).loadMore();
    });
    await waitFor(() =>
      expect((result.current as { logs: RecentLog[] }).logs).toHaveLength(31),
    );
    expect(apiMock).toHaveBeenCalledTimes(3);
  });

  it("ignores a second loadMore call while the first page fetch is still in flight", async () => {
    let resolveFetch: (r: Response) => void = () => {};
    const apiMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(page(30)), { status: 200 }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      );
    vi.doMock("../api", () => ({ api: apiMock }));
    const { useLogHistory } = await import("./useLogHistory");
    const { result } = renderHook(() => useLogHistory());
    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("expected ready");
    expect(result.current.exhausted).toBe(false);

    act(() => {
      (result.current as { loadMore: () => void }).loadMore();
      (result.current as { loadMore: () => void }).loadMore();
    });

    expect(apiMock).toHaveBeenCalledTimes(2);

    resolveFetch(new Response(JSON.stringify(page(1, "p2")), { status: 200 }));
    await waitFor(() =>
      expect((result.current as { logs: RecentLog[] }).logs).toHaveLength(31),
    );
  });
});
