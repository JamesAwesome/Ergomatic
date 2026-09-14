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

  /**
   * RETARGETED, because the two tests that used to sit here could not go red.
   * They unmounted, resolved late, and asserted `api` was called once — which
   * was already true BEFORE the unmount, so they passed with or without the
   * `if (live)` guards. Moving them is not enough either: React 19 silently
   * no-ops a setState on an unmounted component, so deleting the guards is
   * genuinely unobservable on the unmount path. There is nothing to catch.
   *
   * The effect cleanup runs on a DEPENDENCY CHANGE too, and that race is both
   * real and observable: `SignInMethods` re-keys this hook after a link
   * result (`methodsRefreshKey`), so a slow in-flight read for the OLD key can
   * land after the new one and repaint stale CONNECTED rows. That is the
   * invariant the guards actually protect, and this is the layer where
   * removing them goes red.
   */
  it("a late response from a superseded refreshKey never overwrites the current one", async () => {
    let resolveFirst!: (response: Response) => void;
    vi.mocked(api)
      .mockReturnValueOnce(
        new Promise<Response>((done) => {
          resolveFirst = done;
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ apple: true, google: true }), {
          status: 200,
        }),
      );
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) => useAuthMethods(key),
      { initialProps: { key: "first" } },
    );
    rerender({ key: "second" });
    await waitFor(() =>
      expect(result.current).toStrictEqual({
        state: "ready",
        methods: { apple: true, google: true },
      }),
    );
    // The superseded read now lands, carrying the OPPOSITE answer. Independent
    // literals: the stale payload disagrees with the live one on both fields,
    // so a leak is unambiguous rather than coincidentally equal.
    await act(async () => {
      resolveFirst(
        new Response(JSON.stringify({ apple: false, google: false }), {
          status: 200,
        }),
      );
    });
    expect(result.current).toStrictEqual({
      state: "ready",
      methods: { apple: true, google: true },
    });
    expect(api).toHaveBeenCalledTimes(2);
  });

  it("a late FAILURE from a superseded refreshKey never overwrites the current one", async () => {
    let rejectFirst!: (error: Error) => void;
    vi.mocked(api)
      .mockReturnValueOnce(
        new Promise<Response>((_resolve, fail) => {
          rejectFirst = fail;
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ apple: true, google: true }), {
          status: 200,
        }),
      );
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) => useAuthMethods(key),
      { initialProps: { key: "first" } },
    );
    rerender({ key: "second" });
    await waitFor(() =>
      expect(result.current).toStrictEqual({
        state: "ready",
        methods: { apple: true, google: true },
      }),
    );
    await act(async () => {
      rejectFirst(new Error("offline"));
    });
    // Without the catch-arm guard the rower's real methods list is replaced by
    // an error state produced by a request they already superseded.
    expect(result.current).toStrictEqual({
      state: "ready",
      methods: { apple: true, google: true },
    });
  });
});
