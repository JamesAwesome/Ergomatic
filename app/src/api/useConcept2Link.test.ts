import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { normalizeLink, LINK_UNAVAILABLE } from "./useConcept2Link";

// `document.visibilityState` is replaced with `Object.defineProperty`, which
// `vi.restoreAllMocks()` does NOT undo — the stub would leak to every later
// test in this file. Capture the original descriptor once and put it back in
// `afterEach`. (`adapters/appLifecycle.test.ts` and `adapters/keepAwake.test.ts`
// establish the defineProperty idiom itself; both restore by re-defining the
// value to "visible" rather than by restoring the prototype descriptor, which
// leaves a permanent own-property on `document`. Restoring the descriptor is
// the same idiom without that residue.)
const VISIBILITY_DESCRIPTOR = Object.getOwnPropertyDescriptor(
  Document.prototype,
  "visibilityState",
);

function stubVisibility(value: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => value,
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.doUnmock("../api");
  delete (document as unknown as Record<string, unknown>).visibilityState;
  if (VISIBILITY_DESCRIPTOR !== undefined) {
    Object.defineProperty(
      Document.prototype,
      "visibilityState",
      VISIBILITY_DESCRIPTOR,
    );
  }
});

describe("normalizeLink (GET /api/concept2/link's three response shapes)", () => {
  it("reads a flag-off 200 as unavailable, never as unlinked", () => {
    // `routes/concept2.ts`'s `if (!available())` arm answers
    // `{available:false}` with HTTP 200 on purpose ("200 on purpose (the
    // matrix's one non-403 row) — this is a capability read, not an
    // action"), so a flag-off server would otherwise read exactly like an
    // unlinked one. `Concept2LinkProbe.tsx` names the same trap.
    expect(normalizeLink({ available: false })).toStrictEqual(LINK_UNAVAILABLE);
  });

  it("reads available-but-unlinked", () => {
    const link = normalizeLink({ available: true, linked: false });
    expect(link.available).toBe(true);
    expect(link.linked).toBe(false);
    expect(link.c2UserId).toBeNull();
  });

  it("reads the full linked shape", () => {
    expect(
      normalizeLink({
        available: true,
        linked: true,
        c2UserId: 2211,
        c2Username: "jamesawesome",
        needsReauth: true,
        logbookBaseUrl: "https://log-dev.concept2.com",
      }),
    ).toStrictEqual({
      available: true,
      linked: true,
      c2UserId: 2211,
      c2Username: "jamesawesome",
      needsReauth: true,
      logbookBaseUrl: "https://log-dev.concept2.com",
    });
  });

  it("drops a weightClass an old server still sends, rather than letting one into the client at all", () => {
    // Ruling (i): the class is never ours. During a rolling deploy a
    // client can meet a server instance that has not restarted and still
    // emits the key. `toStrictEqual` is what makes this bite — the
    // normalizer builds a fresh object rather than spreading `raw`, so
    // there is no path for a class to enter the client's shape.
    expect(
      normalizeLink({
        available: true,
        linked: true,
        weightClass: "L",
        c2UserId: 2211,
      }),
    ).toStrictEqual({
      available: true,
      linked: true,
      c2UserId: 2211,
      c2Username: null,
      needsReauth: false,
      logbookBaseUrl: null,
    });
  });

  it("reads an EMPTY username as no username, which is a different shape from a missing one", () => {
    // Observation 18. `""` is a string, so a `typeof === "string"` guard
    // alone lets it through and the identity line renders a blank where an
    // account name belongs.
    const link = normalizeLink({
      available: true,
      linked: true,
      c2UserId: 2211,
      c2Username: "",
    });
    expect(link.c2Username).toBeNull();
  });

  it("reads an EMPTY logbook origin as no origin, so no link-out is built on our own domain", () => {
    // The same absent/empty/valued rule as the username above, one field
    // over. `server/index.ts` reads `C2_BASE_URL || <default>`, but a `""`
    // arriving here anyway must not survive: `c2ResultUrl("", 2211, 339)`
    // is `/profile/2211/log/339`, a RELATIVE url that opens on Ergomatic's
    // own origin.
    const link = normalizeLink({
      available: true,
      linked: true,
      c2UserId: 2211,
      logbookBaseUrl: "",
    });
    expect(link.logbookBaseUrl).toBeNull();
  });

  it("degrades every unknown field rather than trusting it", () => {
    const link = normalizeLink({
      available: true,
      linked: true,
      c2UserId: "2211",
      c2Username: 7,
      logbookBaseUrl: 3,
    });
    expect(link.c2UserId).toBeNull();
    expect(link.c2Username).toBeNull();
    expect(link.logbookBaseUrl).toBeNull();
    expect(link.needsReauth).toBe(false);
  });

  it("reads a non-object body as unavailable", () => {
    expect(normalizeLink(null)).toStrictEqual(LINK_UNAVAILABLE);
    expect(normalizeLink("nope")).toStrictEqual(LINK_UNAVAILABLE);
  });
});

describe("useConcept2Link read failures (Gate 0 amendment 1i)", () => {
  it("reports the STATUS of a refused read, so the card can print a discriminator", async () => {
    // `api()` resolves on any status (`src/api.ts` — it does not throw on
    // non-2xx), so a 502 arrives as a normal resolution and has to be
    // turned into a failure explicitly. The status is what a tester
    // reporting "the Concept2 card is broken" carries back.
    const api = vi.fn(
      async () => new Response("<html>502</html>", { status: 502 }),
    );
    vi.doMock("../api", () => ({ api }));
    const { useConcept2Link } = await import("./useConcept2Link");
    const { result } = renderHook(() => useConcept2Link());
    await waitFor(() => expect(result.current.failed).not.toBeNull());
    expect(result.current.failed?.status).toBe(502);
    expect(result.current.link).toBeNull();
  });

  it("refuses a non-2xx that carries a perfectly good JSON body, rather than parsing it as a link", async () => {
    // The probe that gives `if (!res.ok)` something to guard. A 401 whose
    // body is JSON parses fine, so the ok-check is the ONLY thing standing
    // between an auth refusal and `normalizeLink` quietly reading it as
    // "no Concept2 on this deployment".
    const api = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.doMock("../api", () => ({ api }));
    const { useConcept2Link } = await import("./useConcept2Link");
    const { result } = renderHook(() => useConcept2Link());
    await waitFor(() => expect(result.current.failed).not.toBeNull());
    expect(result.current.failed?.status).toBe(401);
    expect(result.current.link).toBeNull();
  });

  it("keeps the STATUS when a 200 answers with something that is not JSON at all", async () => {
    // A proxy or an old image mid rolling deploy answers 200 with HTML.
    // The connection plainly worked, so REASON: NO CONNECTION would be a
    // lie; the parse failure is caught on its own and reports 200.
    const api = vi.fn(
      async () =>
        new Response("<html>hello</html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
    );
    vi.doMock("../api", () => ({ api }));
    const { useConcept2Link } = await import("./useConcept2Link");
    const { result } = renderHook(() => useConcept2Link());
    await waitFor(() => expect(result.current.failed).not.toBeNull());
    expect(result.current.failed?.status).toBe(200);
    expect(result.current.link).toBeNull();
  });

  it("reports a null status when the request never completed at all", async () => {
    const api = vi.fn(async () => Promise.reject(new Error("offline")));
    vi.doMock("../api", () => ({ api }));
    const { useConcept2Link } = await import("./useConcept2Link");
    const { result } = renderHook(() => useConcept2Link());
    await waitFor(() => expect(result.current.failed).not.toBeNull());
    expect(result.current.failed?.status).toBeNull();
  });

  it("clears the failure on the next successful read, rather than latching it", async () => {
    let ok = false;
    const api = vi.fn(async () =>
      ok
        ? new Response(JSON.stringify({ available: true, linked: false }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        : new Response("nope", { status: 500 }),
    );
    vi.doMock("../api", () => ({ api }));
    const { useConcept2Link } = await import("./useConcept2Link");
    const { result } = renderHook(() => useConcept2Link());
    await waitFor(() => expect(result.current.failed).not.toBeNull());
    ok = true;
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.failed).toBeNull();
    expect(result.current.link?.available).toBe(true);
  });
});

describe("useConcept2Link re-reads when the document comes back (observation 19, invariant I5)", () => {
  it("re-reads on pageshow, which is the ONLY event a bfcache restore fires", async () => {
    // A restore does not re-mount, so the mount effect never runs again and
    // a mount-only read would leave the card frozen mid-attempt behind a
    // buttonless OPENING CONCEPT2 panel.
    const api = vi.fn(
      async () =>
        new Response(JSON.stringify({ available: true, linked: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.doMock("../api", () => ({ api }));
    const { useConcept2Link } = await import("./useConcept2Link");
    renderHook(() => useConcept2Link());
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    await act(async () => {
      window.dispatchEvent(new Event("pageshow"));
    });
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
  });

  it("re-reads when the document becomes visible, and NOT when it becomes hidden", async () => {
    const api = vi.fn(
      async () =>
        new Response(JSON.stringify({ available: true, linked: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.doMock("../api", () => ({ api }));
    const { useConcept2Link } = await import("./useConcept2Link");
    renderHook(() => useConcept2Link());
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));

    stubVisibility("hidden");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(api).toHaveBeenCalledTimes(1);

    stubVisibility("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
  });

  it("stops listening when the card unmounts, so a dead hook never re-reads", async () => {
    const api = vi.fn(
      async () =>
        new Response(JSON.stringify({ available: true, linked: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.doMock("../api", () => ({ api }));
    const { useConcept2Link } = await import("./useConcept2Link");
    const { unmount } = renderHook(() => useConcept2Link());
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    unmount();
    window.dispatchEvent(new Event("pageshow"));
    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();
    expect(api).toHaveBeenCalledTimes(1);
  });
});
