import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { useAuthMethods } from "./useAuthMethods";

vi.mock("../api", () => ({ api: vi.fn() }));

beforeEach(() => {
  vi.mocked(api).mockReset();
});

describe("useAuthMethods", () => {
  it("reports the two server-owned connection states", async () => {
    vi.mocked(api).mockResolvedValue(
      new Response(JSON.stringify({ apple: false, google: true }), {
        status: 200,
      }),
    );
    const { result } = renderHook(() => useAuthMethods("initial"));
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current).toStrictEqual({
      state: "ready",
      methods: { apple: false, google: true },
    });
  });

  it("reads the methods again after a successful link changes the refresh key", async () => {
    vi.mocked(api)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ apple: false, google: true }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ apple: true, google: true }), {
          status: 200,
        }),
      );
    const { result, rerender } = renderHook(({ key }) => useAuthMethods(key), {
      initialProps: { key: "before" },
    });
    await waitFor(() => expect(result.current.state).toBe("ready"));
    rerender({ key: "after" });
    await waitFor(() =>
      expect(result.current).toStrictEqual({
        state: "ready",
        methods: { apple: true, google: true },
      }),
    );
    expect(api).toHaveBeenCalledTimes(2);
  });

  it.each([
    new Response(null, { status: 503 }),
    new Response(JSON.stringify(null), { status: 200 }),
    new Response(JSON.stringify({ apple: true }), { status: 200 }),
  ])(
    "maps unavailable or malformed methods to an inert error state",
    async (response) => {
      vi.mocked(api).mockResolvedValue(response);
      const { result } = renderHook(() => useAuthMethods("error"));
      await waitFor(() =>
        expect(result.current).toStrictEqual({ state: "error" }),
      );
    },
  );

  it("ignores a late success after unmount", async () => {
    let resolve!: (response: Response) => void;
    vi.mocked(api).mockReturnValue(
      new Promise<Response>((done) => {
        resolve = done;
      }),
    );
    const { unmount } = renderHook(() => useAuthMethods("late-success"));
    unmount();
    await act(async () => {
      resolve(
        new Response(JSON.stringify({ apple: true, google: true }), {
          status: 200,
        }),
      );
    });
    expect(api).toHaveBeenCalledOnce();
  });

  it("ignores a late failure after unmount", async () => {
    let reject!: (error: Error) => void;
    vi.mocked(api).mockReturnValue(
      new Promise<Response>((_resolve, fail) => {
        reject = fail;
      }),
    );
    const { unmount } = renderHook(() => useAuthMethods("late-failure"));
    unmount();
    await act(async () => {
      reject(new Error("offline"));
    });
    expect(api).toHaveBeenCalledOnce();
  });
});
