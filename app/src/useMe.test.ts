import { renderHook, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, afterEach } from "vitest";
import { useMe } from "./useMe";

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
      expect(result.current[0]).toEqual({ state: "out" });
    });
  });

  it("refetch() re-runs the /api/me request", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({}), { status: 401 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useMe());
    await waitFor(() => {
      expect(result.current[0]).toEqual({ state: "out" });
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    result.current[2]();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
