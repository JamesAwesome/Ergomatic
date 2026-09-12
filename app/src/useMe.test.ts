import { act, renderHook, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, afterEach, beforeEach } from "vitest";
import { useMe } from "./useMe";
import { clearArticleReadsCache } from "./api/useArticleReads";

// Spec 2026-09-12-news-layout-shift §3, invariant C4: the article-reads
// last-known set is cleared at EVERY transition to signed-out — the You
// button (`signedOut`), a non-OK /api/me, and a thrown fetch — because the
// 401 path never presses the button and native sign-in re-enters this same
// document with the next account.
vi.mock("./api/useArticleReads", () => ({ clearArticleReadsCache: vi.fn() }));
const clearMock = vi.mocked(clearArticleReadsCache);

beforeEach(() => {
  clearMock.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useMe", () => {
  it("falls back to signed-out state when the fetch itself rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const { result } = renderHook(() => useMe());
    await waitFor(() => {
      expect(result.current[0]).toStrictEqual({ state: "out" });
    });
    expect(clearMock).toHaveBeenCalledTimes(1);
  });

  it("a non-OK /api/me signs out AND clears the article-reads cache", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({}), { status: 401 })),
    );
    const { result } = renderHook(() => useMe());
    await waitFor(() => {
      expect(result.current[0]).toStrictEqual({ state: "out" });
    });
    expect(clearMock).toHaveBeenCalledTimes(1);
  });

  it("signedOut() (the You button's path) clears the article-reads cache before the state flips", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ user: { id: "u1", email: "a@b", name: "A" } }),
            { status: 200 },
          ),
      ),
    );
    const { result } = renderHook(() => useMe());
    await waitFor(() => {
      expect(result.current[0].state).toBe("in");
    });
    expect(clearMock).not.toHaveBeenCalled();

    act(() => {
      result.current[1]();
    });
    expect(result.current[0]).toStrictEqual({ state: "out" });
    expect(clearMock).toHaveBeenCalledTimes(1);
  });

  it("refetch() re-runs the /api/me request", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({}), { status: 401 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useMe());
    await waitFor(() => {
      expect(result.current[0]).toStrictEqual({ state: "out" });
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    result.current[2]();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
