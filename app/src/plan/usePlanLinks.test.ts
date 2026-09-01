import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PlanLink } from "./usePlanLinks";

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

/** The response shape `GET /api/logs?plan=<key>` actually returns
 *  (`server/stores/logs.ts`'s own `PlanLink`) — written out here rather
 *  than imported from the server, same `src/`-independent-of-`server/`
 *  convention the hook itself follows. */
function wireLink(overrides: Record<string, unknown> = {}) {
  return {
    planIndex: 0,
    id: "log-a",
    workoutTitle: "Slack Tide",
    workoutType: "O2",
    linkedTitle: "Slack Tide",
    workoutIsGlobal: true,
    ...overrides,
  };
}

function mockApiReturning(body: unknown, status = 200) {
  const apiMock = vi.fn(
    async () => new Response(JSON.stringify(body), { status }),
  );
  vi.doMock("../api", () => ({ api: apiMock }));
  return apiMock;
}

describe("usePlanLinks", () => {
  it("fetches GET /api/logs?plan=<key> and resolves to a planIndex -> link Map carrying the workout each row recorded", async () => {
    const apiMock = mockApiReturning({
      links: [
        wireLink(),
        wireLink({
          planIndex: 3,
          id: "log-b",
          workoutTitle: "Dust Whirl",
          workoutType: "AN",
          linkedTitle: "Dust Whirl",
          workoutIsGlobal: false,
        }),
      ],
    });
    const { usePlanLinks } = await import("./usePlanLinks");
    const { result } = renderHook(() => usePlanLinks("sprint"));

    expect(result.current.size).toBe(0);
    await waitFor(() => expect(result.current.size).toBe(2));
    expect(result.current.get(0)).toStrictEqual({
      id: "log-a",
      workoutTitle: "Slack Tide",
      workoutType: "O2",
      linkedTitle: "Slack Tide",
      workoutIsGlobal: true,
    });
    expect(result.current.get(3)).toStrictEqual({
      id: "log-b",
      workoutTitle: "Dust Whirl",
      workoutType: "AN",
      linkedTitle: "Dust Whirl",
      workoutIsGlobal: false,
    });
    expect(apiMock).toHaveBeenCalledWith("/api/logs?plan=sprint");
  });

  // Provenance is a TRI-state and the Plan screen branches on all three,
  // so the parser must carry each through distinctly rather than
  // collapsing to a boolean. Null travels as a PAIR — see below.
  it.each([
    ["true", true, "Slack Tide", true],
    ["false", false, "Slack Tide", false],
    ["null", null, null, null],
  ])(
    "carries workoutIsGlobal %s through unchanged",
    async (_, wire, title, expected) => {
      mockApiReturning({
        links: [wireLink({ workoutIsGlobal: wire, linkedTitle: title })],
      });
      const { usePlanLinks } = await import("./usePlanLinks");
      const { result } = renderHook(() => usePlanLinks("sprint"));

      await waitFor(() => expect(result.current.size).toBe(1));
      expect(result.current.get(0)?.workoutIsGlobal).toBe(expected);
    },
  );

  // `linkedTitle` and `workoutIsGlobal` are one workout row's title and
  // ownership. The server emits them together or not at all, and a
  // checkpoint's identity is decided by both or by neither — so a HALF
  // pair is a shape no server produces and one `swapMark` would still act
  // on. Dropped, not repaired: repairing it would mean inventing the
  // missing half.
  it.each([
    ["a title with unknown ownership", { workoutIsGlobal: null }],
    ["ownership with no title", { linkedTitle: null }],
  ])("drops an entry carrying %s", async (_, half) => {
    mockApiReturning({
      links: [
        wireLink({ planIndex: 9, ...half }),
        wireLink({ planIndex: 2, id: "good" }),
      ],
    });
    const { usePlanLinks } = await import("./usePlanLinks");
    const { result } = renderHook(() => usePlanLinks("sprint"));

    await waitFor(() => expect(result.current.size).toBe(1));
    expect(result.current.get(2)?.id).toBe("good");
  });

  // An older server has no such field. Blanking the row's name over a key
  // that server never sent would be worse than not knowing the
  // provenance, so absence upgrades in place to null (UNKNOWN) — the same
  // leniency-for-absence-only rule `todayOverrides.ts` settled on.
  it("treats a MISSING workoutIsGlobal as unknown rather than rejecting the entry", async () => {
    mockApiReturning({
      links: [wireLink({ workoutIsGlobal: undefined, linkedTitle: undefined })],
    });
    const { usePlanLinks } = await import("./usePlanLinks");
    const { result } = renderHook(() => usePlanLinks("sprint"));

    await waitFor(() => expect(result.current.size).toBe(1));
    expect(result.current.get(0)?.workoutIsGlobal).toBeNull();
    expect(result.current.get(0)?.linkedTitle).toBeNull();
    expect(result.current.get(0)?.workoutTitle).toBe("Slack Tide");
  });

  it("never fetches when no plan is active (planKey null)", async () => {
    const apiMock = mockApiReturning({ links: [] });
    const { usePlanLinks } = await import("./usePlanLinks");
    const { result } = renderHook(() => usePlanLinks(null));

    expect(result.current.size).toBe(0);
    expect(apiMock).not.toHaveBeenCalled();
  });

  it("degrades to an empty Map on a non-2xx response, rather than throwing or surfacing an error state", async () => {
    const apiMock = vi.fn(async () => new Response("nope", { status: 500 }));
    vi.doMock("../api", () => ({ api: apiMock }));
    const { usePlanLinks } = await import("./usePlanLinks");
    const { result } = renderHook(() => usePlanLinks("sprint"));

    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(1));
    expect(result.current.size).toBe(0);
  });

  it("degrades to an empty Map on a network rejection", async () => {
    const apiMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.doMock("../api", () => ({ api: apiMock }));
    const { usePlanLinks } = await import("./usePlanLinks");
    const { result } = renderHook(() => usePlanLinks("sprint"));

    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(1));
    expect(result.current.size).toBe(0);
  });

  it("re-fetches when the active plan key changes (e.g. Switch)", async () => {
    const apiMock = vi.fn(async (path: string) => {
      const links =
        path === "/api/logs?plan=sprint"
          ? [wireLink({ id: "sprint-log" })]
          : [wireLink({ id: "head-log" })];
      return new Response(JSON.stringify({ links }), { status: 200 });
    });
    vi.doMock("../api", () => ({ api: apiMock }));
    const { usePlanLinks } = await import("./usePlanLinks");
    const { result, rerender } = renderHook<
      Map<number, PlanLink>,
      { planKey: "sprint" | "head" }
    >(({ planKey }) => usePlanLinks(planKey), {
      initialProps: { planKey: "sprint" },
    });

    await waitFor(() => expect(result.current.get(0)?.id).toBe("sprint-log"));

    rerender({ planKey: "head" });
    await waitFor(() => expect(result.current.get(0)?.id).toBe("head-log"));
    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  // The hook renders TEXT now, and picks a badge colour off `workoutType`
  // — so a malformed entry is no longer merely an unusable URL, it is a
  // row that draws wrong. Each bad entry is dropped on its own; a single
  // one must never take the whole (otherwise valid) map with it.
  it.each([
    ["a missing workoutTitle", { workoutTitle: undefined }],
    ["a non-string workoutTitle", { workoutTitle: 42 }],
    ["a missing workoutType", { workoutType: undefined }],
    ["a numeric workoutType", { workoutType: 42 }],
    ["a non-boolean workoutIsGlobal", { workoutIsGlobal: "yes" }],
    ["a non-string linkedTitle", { linkedTitle: 42 }],
    ["a numeric workoutIsGlobal", { workoutIsGlobal: 1 }],
    ["a missing id", { id: undefined }],
    ["a non-string id", { id: { toString: "not a string" } }],
    ["a missing planIndex", { planIndex: undefined }],
    ["a non-integer planIndex", { planIndex: 1.5 }],
    ["a negative planIndex", { planIndex: -1 }],
  ])("drops an entry with %s, keeping the well-formed ones", async (_, bad) => {
    mockApiReturning({
      links: [
        wireLink({ planIndex: 9, ...bad }),
        wireLink({ planIndex: 2, id: "good" }),
      ],
    });
    const { usePlanLinks } = await import("./usePlanLinks");
    const { result } = renderHook(() => usePlanLinks("sprint"));

    await waitFor(() => expect(result.current.size).toBe(1));
    expect(result.current.get(2)?.id).toBe("good");
  });

  // Phase JR PR 1 (spec rev 4's F5). `workout_type` became NULLABLE — a
  // free row prescribed no intensity — and `parseLink` rejected the WHOLE
  // entry on a non-string type, which would blank a plan row's name over a
  // field that is now legitimately absent.
  //
  // Exactly the reasoning the `workoutIsGlobal` guard beside it already
  // records for its own tri-state: null is "unknown", not malformed, and
  // rejecting the entry costs the row its name.
  //
  // Reachable in its own right, NOT a backstop for the plan refusal: the
  // shared store contract deliberately advances a row that names a workout
  // and omits its type, and such a row becomes a plan link carrying a null
  // `workoutType`. (An earlier version of this comment said it was
  // reachable "only if the refusal fails to hold"; the truth table
  // disproves that.)
  it("KEEPS an entry whose workoutType is null — absent, not malformed", async () => {
    mockApiReturning({
      links: [wireLink({ planIndex: 3, id: "free", workoutType: null })],
    });
    const { usePlanLinks } = await import("./usePlanLinks");
    const { result } = renderHook(() => usePlanLinks("sprint"));

    await waitFor(() => expect(result.current.size).toBe(1));
    expect(result.current.get(3)?.id).toBe("free");
    expect(result.current.get(3)?.workoutType).toBeNull();
  });

  it.each([
    ["a string", "log-a"],
    ["null", null],
    ["an array", [0, "log-a"]],
    ["a number", 7],
  ])(
    "drops an entry that is %s rather than an object, keeping the well-formed ones",
    async (_, bad) => {
      mockApiReturning({
        links: [bad, wireLink({ planIndex: 2, id: "good" })],
      });
      const { usePlanLinks } = await import("./usePlanLinks");
      const { result } = renderHook(() => usePlanLinks("sprint"));

      await waitFor(() => expect(result.current.size).toBe(1));
      expect(result.current.get(2)?.id).toBe("good");
    },
  );

  it.each([
    ["links missing entirely", {}],
    ["links not an array", { links: "nope" }],
    ["the body not an object", "nope"],
    ["the body null", null],
  ])("degrades to an empty Map when %s", async (_, body) => {
    const apiMock = mockApiReturning(body);
    const { usePlanLinks } = await import("./usePlanLinks");
    const { result } = renderHook(() => usePlanLinks("sprint"));

    // The map STARTS empty, so asserting `size === 0` straight away would
    // pass against any implementation at all. Settle the fetch first —
    // this has to be an assertion about what the hook did with a bad body,
    // not about what it had not done yet.
    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.size).toBe(0);
  });
});
